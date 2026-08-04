# 阿游（股东只读复验）— Round 9 / v0.46.71

- 透镜：游戏流式 + 背包 + 世界卡联动
- 范围：只读。未改动任何源码，仅本文件为产出。
- 复验对象：Round 8（v0.46.71）对阿游透镜的三处修复 + 新坑挖掘。

---

## 回归验证

### R1 信号透传链路（生产路径）— ✅ 完整

逐跳追踪（全部命中，无断点）：

1. `src/app/api/game/action/route.ts:42` — `processGameTurn({...}, req.signal)`：`req.signal` 是 Next.js 的入站请求 AbortSignal（前端停止 / 客户端断开即触发）。
2. `src/core/game/game-engine.ts:223` 函数签名收 `signal?: AbortSignal`；`:279` 透传给 `client.chatStream({ ..., signal })`。
3. `src/core/llm/client.ts:407` `chatStream(request)` → `:415` `establishStream(target, request, ...)` → `:246-248` 合并 `AbortSignal.any([timeoutSignal, request.signal])` → `:259` 传给 `fetch(..., { signal: fetchSignal })`。

链路 `前端 abort → req.signal → processGameTurn → chatStream → establishStream → fetch` 在生产路径上完整闭合。✅

### R2 空流守卫不吞正常短响应 — ✅ 确认

- `game-engine.ts:297` `if (!fullResponse.trim())` 作为 0-chunk 守卫。
- 单字响应「好。」→ `"好。".trim() === "好。"` ≠ `""`，**不会被吞**，正常解析并提交。✅
- 纯空白 / 空响应会被正确拦截（与 Round8 语义一致）。
- 注意：守卫只防「0 chunk」。若 LLM 返回非空但不可解析（见 N6），仍会落库——但这是另一类问题，非本守卫误吞。

### R3 abort 真中断 fetch，不等超时 — ✅ 确认

- `client.ts:245` `timeoutSignal = AbortSignal.timeout(300_000)`；`:246-248` 与 `request.signal` 合并。
- 用户停止 → `req.signal` 中止 → 合并信号立即取消底层 `fetch` 的 HTTP 连接，不等待 300s 超时。✅

### R4 测试回归 — ✅ 通过

- 本文件 `game-engine.test.ts` 运行：**14 passed**（任务所称「38 passed」为套件聚合，相关用例均绿）。
- 关键断言已覆盖：
  - `chatStream` 调用携带 `signal`（`game-engine.test.ts:218-243`，断言 `captured[0].signal === controller.signal`）。✅
  - 空流 0 chunk 不提交 `$transaction` 且 yield error（`game-engine.test.ts:245-268`）。✅
  - abort 时不提交（`game-engine.test.ts:164-187`）。✅

**回归结论：Round 8 对阿游透镜的三处修复均已真接进生产路径，链路完整、测试通过。**

---

## 新发现问题

> 以下均为本轮新坑，**非 Round 8 回归标记**（Round 8 已接好管道，但存在残留语义/一致性缺口）。

### N1 — P1 — AbortError 被当成「调用失败」，而非「主动停止」

- 位置：`src/core/llm/client.ts:285-342`（`readStream`）+ `src/core/game/game-engine.ts:289`（catch）。
- 问题：`req.signal` 中止后，`fetch` 被取消，`reader.read()` 抛出 `AbortError`。`readStream` 仅 `finally { reader.releaseLock() }`（`:341`），**未 catch**；异常冒泡经 `yield*` 到 `game-engine` 的 `try/catch`（`:289`），被当作 `LLM 调用失败：The operation was aborted` 以 **error 事件**吐给前端。
- 连锁后果：用户「主动停止」在前端被误判为「失败」——可能弹错误提示、且未必触发对账（虽然 `GET /api/game/state` 仍可自愈，但语义错乱）。
- 附带：`:283` 的 `if (signal?.aborted) return` 在该路径**几乎不可达**——abort 取消流后不再投新 chunk，循环体（含该检查）未执行即抛错。真正「干净 return」只在「abort 后再恰好收到一个 chunk」的窄竞态下发生。
- 建议：
  1. `readStream` 在 `reader.read()` 处 `catch`，识别 `name === 'AbortError'` 或 `signal?.aborted`，**干净结束**而非抛出；
  2. `game-engine` 区分「abort」与「真实失败」，abort 时 yield 语义化 `aborted` 事件（而非 `error`），前端据此直接对账。
- Round8 回归标记：**否**（新功能残留）。

### N2 — P2 — 中断时 token 不计账（成本看板低估）

- 位置：`src/core/llm/client.ts:284-351`（`onUsage` 仅在 `:309` `[DONE]` 与 `:344-345` 循环结束后调用）。
- 问题：abort 使 `reader.read()` 抛错，跳过 `onUsage` → `recordLlmCall` 不执行。已生成并**已流式吐给用户**的 token 不计入成本看板。
- 建议：`readStream` 的 `finally/catch` 中即便中断也用累加的部分 usage 调一次 `recordLlmCall`（最佳努力上账）。
- Round8 回归标记：**否**（新）。

### N3 — P2 — 世界卡 owner 碰撞 + 单向联动（背包已隔离，世界卡未隔离）

- 位置：`src/core/game/game-engine.ts:402-420`（`ensureItemLorebook`）。
- 问题：背包按 `(name, owner)` 二元组隔离（`:35-36`、`reconcile.ts:44-45`），但 world card 的 `findFirst` 仅按 `category:"item" + title` 匹配（`:404-406`），**忽略 owner**：
  1. 主角与李尘同名物品（如「怀表」）在 world card 层塌缩为同一条，归属信息丢失 → 与背包隔离语义不一致（串味）。
  2. `consume/discard` 从不更新/删除 world card，残留「[游戏获得]」陈旧文案 → 世界卡↔游戏态联动断裂（且仅单向 game→worldcard）。
- 建议：world card 以 `title + owner` 唯一（或 content/relatedEntryIds 含 owner）；消耗/丢弃时同步更新或移除。
- Round8 回归标记：**否**（新）。

### N4 — P2 — ensureItemLorebook 在 $transaction 之外，可能留孤儿世界卡

- 位置：`game-engine.ts:345-349`（world card 创建）位于 `:359` `$transaction` **之前**，且不入事务。
- 问题：若其后 `:359` 的 `$transaction` 失败，已建的 world card 不会被回滚 → world card 与游戏态漂移（孤儿条目）。
- 建议：将 world card 创建并入同一 `$transaction`，或保证幂等且失败可容忍。
- Round8 回归标记：**否**（新）。

### N5 — P2 — readStream 流末可能丢字

- 位置：`src/core/llm/client.ts:294-300`。
- 问题：`reader.read()` 返回 `done` 时直接 `break`，**未处理 `buffer` 中残留的末段**（若某条 SSE data 行无尾随换行，其内容会随 `break` 被丢弃）。
- 现实概率低（OpenAI 兼容以 `\n` 结尾且发 `[DONE]`），但属确定性代码路径缺口，CJK 多字节末块尤需警惕。
- 建议：循环结束后对剩余 `buffer` 再解析一次（flush）。
- Round8 回归标记：**否**（新）。

### N6 — P2 — 空流守卫之外的「幻影轮」：非空但不可解析

- 位置：`game-engine.ts:297`（仅防 0 chunk）+ `:303` `parseGameOutput`。
- 问题：若 LLM 返回非空内容但 `parseGameOutput` 解析不出 narrative（纯标记/空白/格式错），`parsed.narrative` 为空仍会 `gameState.create` 落库 → 空叙事幻影轮（与 Round8 防的「空流幻影轮」同源但未被覆盖）。
- 建议：解析后 `if (!parsed.narrative?.trim())` 同样跳过提交。
- Round8 回归标记：**否**（新）。

### N7 — P2 — 提交前 abort 复核窗口

- 位置：`game-engine.ts:340`（唯一中止检查）vs `:359`（`$transaction`）。
- 问题：`:340` 之后到真正落库之间若 `signal` 中止，仍会执行 `ensureItemLorebook` + `$transaction`（无二次复核）。窗口极小，但「abort=放弃本轮」语义应在落库前再核一次。
- 建议：`$transaction` 前再 `if (signal?.aborted) return;`，或把 world card 创建移入事务后再判。
- Round8 回归标记：**否**（新）。

### N8 — P2（附带）— 非流式 chat() 不透传 signal

- 位置：`src/core/llm/client.ts:156`（`attemptChat` 的 `fetch` 仅用 `timeoutSignal`，不带 `request.signal`）。
- 问题：非游戏流式路径（如 `endGameAndExport` 结尾生成 `:510`）无法被用户 abort 中断，abort 能力在流式/非流式间不一致。
- 建议：`attemptChat` 同 `establishStream` 合并 `signal`。
- Round8 回归标记：**否**（新，超出游戏流式主链但相关）。

---

## 结论

**v0.46.71 下，阿游透镜是否还有 P0 / P1？**

- **P0：无。** Round 8 的 abort 闭环已生效——信号链路完整、abort 真中断 fetch（不等超时）、abort 后不提交且 `GET /api/game/state` 对账可自愈，游戏态前后端一致；空流守卫正确不吞「好。」类短响应；相关测试全绿。游戏流式中断的「状态不一致（已扣 token 但没记录）」中的**游戏态**部分已解决。
- **P1：1 条（N1）。** abort 经 `AbortSignal` 真能中断 fetch（✅），但中断后 `reader.read()` 抛出的 `AbortError` 被 `readStream` 漏接、被 `game-engine` 当「LLM 调用失败」以 error 事件吐出——破坏「停止=主动放弃」的语义正确性，前端可能误报错误/不触发对账。N1 **不破坏游戏态一致性**（后端权威态正确、对账可自愈），但属于 abort 功能的行为正确性缺口，建议下轮修复。
- 其余 N2–N8 均为 **P2**（token 不计账、world card owner 碰撞/单向联动、事务外孤儿 world card、流末丢字、非空不可解析幻影轮、提交前复核窗口、非流式 signal 缺失），均为一致性/成本/健壮性打磨，可在后续轮次排期。

**股东建议：** 本轮可放行（无 P0）；优先把 N1 纳入下个迭代，使 abort 的端到端语义彻底干净；N3/N4 一并修可顺带补完「背包↔世界卡双向打通」这一阿游长期诉求。
