# 阿游（股东只读复验）— Round 10 / v0.46.72

- 透镜：游戏流式 + 背包归属 + 世界卡物品联动 + 与主线一致性（owner 归属、CI| 解析健壮性、物品→世界书补建、流式错误恢复、abort 后前端对账、中文数字/选项解析）。
- 范围：只读。未改动任何 `src/` 源码，仅本文件为产出。
- 复验角色：股东·阿游（六位股东人格之一）。
- 复验对象：Round 9（commit `7814d03`，v0.46.72）对阿游透镜的修复（阿游 N1：abort 语义干净）+ 新坑挖掘。
- 配套提交：`7814d03` Round 9 实现（双 changelog 同 commit，tsc 零错误）；工作树干净，HEAD=`c824cd2`。

---

## 回归验证（Round 9 阿游 N1：abort 不再被当「LLM 调用失败」）

### R1 game-engine.ts catch 区分 AbortError / 真失败 — ✅ 已落地，无回退

- 实测 `src/core/game/game-engine.ts:289-294`：
  ```ts
  } catch (err: any) {
    // 用户主动停止（abort）不是失败：优雅放弃本轮，不污染回放/对账
    if (err?.name === "AbortError" || signal?.aborted) return;
    yield { type: "error", error: `LLM 调用失败：${err?.message ?? err}` };
    return;
  }
  ```
- Round 9 修复点精确命中：abort（`AbortError` 或 `signal.aborted`）→ 干净 `return`，**不再 yield error 事件**；仅真正的 LLM 失败才 yield `error`。✅
- 与 `:283` 的 `if (signal?.aborted) return;`（流式期二次守卫）、`:342` 的提交前复核构成三重 abort 早退，语义一致。✅

### R2 client.ts readStream 在 abort 时不再冒泡为「未分类失败」 — ✅（净效果符合任务描述）

- 实测 `src/core/llm/client.ts:282-352`（`readStream`）：
  - 仅含 `try { while(...) reader.read() } finally { reader.releaseLock() }`（`:294`、`:341`），**无 catch 吞错**——`reader.read()` 抛出的 `AbortError` 按原样向上冒泡。
  - 冒泡经 `chatStream` 的 `yield* readStream(...)`（`:419`）到达 `processGameTurn` 的 `try/catch`（`:289`），由**唯一分类点**正确分流：abort → `return`，不产生 error 事件。
  - 即：readStream 本身不误判、不把 AbortError 当成「未分类失败」；abort 的「失败」判定被 game-engine 在收敛点消除。与任务描述「readStream 在 abort 时不再把 AbortError 冒泡为未分类失败」的**净结果一致**（error 事件不再由 abort 产生）。✅
- 佐证：测试 `src/core/game/game-engine.test.ts:245-276`「流式期 abort（chatStream 抛 AbortError）不产 error 事件、不提交」通过。

### R3 vitest 全绿，含「abort 不产生 error 事件」用例 — ✅

- `npx vitest run src/core/game/game-engine.test.ts` → **15 passed**（含 abort 不产 error 事件、abort 不提交、abort 透传 signal、空流不提交、name+owner 隔离等）。✅
- `src/core/game/game-prompts.test.ts` 相关用例（CI| 归属、中文→英文归一化、中文复合数字、空名跳过）亦在套件内通过。

### R4 Round 9 改动未引入我透镜内的新回归 — ✅

- R9 在我透镜范围内的改动仅两处：
  1. `game-engine.ts:291` 的 catch 分支（abort→return）——**消除**了「abort=失败」的旧行为，无回退。
  2. `client.ts:419-428` `readStream` 的 `recordLlmCall(onUsage)` 成本记账（流式成本可见）——仅在 `[DONE]`（`:309`）与流末（`:345-346`）调用，**不影响** abort 路径（abort 在到达流末前已抛错，onUsage 本就不触发，详见 N5/N6 关联项，非 R9 回归）。
- 既有 owner 隔离（Round 5/6 已落）与 CI| 归一化（Round 5 P0）未被 R9 触碰，测试 `applyItemChanges` / `applyFrontendItemChanges` 仍全绿。
- 注：Round 9 报告中的 N2「中断 token 不计账」R9 未覆盖，仍待修（见下方 N6 关联，非回归）。

**回归结论：Round 9 对阿游 N1（abort 语义干净）的修复已真接进生产路径（game-engine.ts:289），readStream 不误判 AbortError，abort 不产生 error 事件，前后端对账链路未受影响；测试 15/15 全绿，无回退、无新回归。**

---

## 新发现问题（阿游透镜内，均为本轮新坑 / 残留语义缺口）

### N1 — P1 — 开局路由 `initialItems` 丢弃物品 owner（破坏 name+owner 隔离）

- 位置：`src/app/api/game/start/route.ts:108-119`。
- 问题：`parsed.itemChanges` 已携带 `owner`（由 `parseGameOutput` 解析 `CI|获得|灵剑|1|李尘` 得到），但 `initialItems.push({...})` **未写入 `owner` 字段**。结果：开局获得的带归属物品一律以默认「主角」入库。
- 连锁：背包按 `(name, owner)` 隔离（game-engine.ts:35-36、reconcile.ts:44-45），但开局轮的 `owner` 塌缩为「主角」→
  1. 若「李尘」开局得「灵剑」、主角后得同名「灵剑」，DB 里两条都变「主角」，隔离失效（同名物品混淆——正是本透镜首要关注点）；
  2. 后续 `CI|消耗|灵剑|1|李尘` 在 applyItemChanges 中按 `(name=灵剑, owner=李尘)` 找不到（已存为「主角」）→ 静默无操作，背包与剧情漂移。
- 建议：`initialItems.push` 增加 `owner: change.owner || "主角"`（与 processGameTurn:40-56、reconcile.ts:56-65 对齐）。并顺带把 `category` 由写死 `"other"` 改为 `change` 可携带的分类（若有）。

### N2 — P1 — 开局响应缺 `items` 字段 + 前端 `handleStart` 硬置 `items:[]` → 开场背包前后端长期错位

- 位置：`src/app/api/game/start/route.ts:146-155`（响应无 `items` 键）+ `src/app/workspace/[projectId]/game/[nodeId]/page.tsx:174`（`items: []`）。
- 问题：
  - 开局路由把 `initialItems` 写入了 DB 的 `round=1` gameState（`:122-134`），但**响应 JSON 不含 `items`**（只有 `itemChanges`）。
  - 前端 `handleStart` 收到响应后把 `state.items` 设为 `[]`（`:174`），且后续每轮仅用 `doneData.itemChanges` 增量合并（`applyFrontendItemChanges(state.items, doneData.itemChanges, ...)`，page.tsx:293-297）。
  - 因此：正常游玩（不中途停止）时，前端背包 = 各行动 itemChanges 之和，**永远缺开局轮已入库的 `initialItems`**；直到用户**任意一次停止/abort 触发 `GET /api/game/state` 对账**（page.tsx:186-210）才被后端权威态整体覆盖、补齐。
- 后果：这正是本透镜「abort 后前端对账是否仍有前后端错位」的**残留错位**——开局背包在未对账前持续与后端不一致；导出时后端用自身全量 items（正确），但前端展示与用户感知错乱。
- 建议：开局响应补 `items: initialItems`（已带 owner/数量/分类）；或前端 `handleStart` 收到 `itemChanges` 后用 `applyFrontendItemChanges([], data.itemChanges, 1)` 预建背包，使首轮即与后端一致，无需等首次对账。

### N3 — P1 — 未知/同义 CI| 动词被静默丢弃（叙事有物、背包无记录 → 主线一致性漂移）

- 位置：`src/core/game/game-prompts.ts:18-23`（OP_MAP 仅 4 词）+ `:330-345`（解析后用 `OP_MAP[rawOp] ?? rawOp`）+ `src/core/game/game-engine.ts:40-81`（applyItemChanges 仅命中 gain/consume/equip/discard）。
- 问题：提示词只列「获得/消耗/装备/丢弃」，但模型常用同义词：
  - 获得类：`拾取`、`捡到`、`取得`、`获取`；
  - 消耗类：`使用`、`服用`、`吃掉`；
  - 装备类：`佩戴`、`穿上`；
  - 丢弃类：`丢掉`、`扔掉`、`弃置`。
  - 这些词不在 OP_MAP → `op` 保留原值（如「拾取」），`applyItemChanges` 四个 `if` 分支**无一命中 → 物品被静默丢弃**；且 `ensureItemLorebook` 仅对 `operation === "gain"` 触发（game-engine.ts:348），同义词更不会补世界卡。
- 后果：剧情叙事里出现了「主角拾起龙髓石」但背包里查无此物 → 与主线一致性断裂（本透镜核心关注）。`game-prompts.test.ts:80-84` 还把「`CI|出售|宝物|1` → operation=出售」固化为预期，等于**显式纵容**未知动词透传后静默丢弃。
- 建议：扩展 OP_MAP 覆盖常见同义词（拾取/捡到/取得→gain，使用/服用/吃掉→consume，佩戴/穿上→equip，丢掉/扔掉/弃置→discard）；对真正未知且非「出售/交换」类的动词，至少 `console.warn` 并考虑安全默认（如默认当 gain 处理或跳过），避免无提示丢物。

### N4 — P2 — 开局路由未调用 `ensureItemLorebook`（世界卡联动缺失，与 processGameTurn 不一致）

- 位置：`src/app/api/game/start/route.ts:108-119`（仅建 `initialItems`，无世界卡补建）对比 `src/core/game/game-engine.ts:346-351`（行动轮对 gain 调 `ensureItemLorebook`）。
- 问题：开局获得的物品**永不**自动补建 `item` 类世界卡。若某物仅在开局获得、之后未再 gain，则世界书里查无此条目；若之后行动轮又 gain 同名物，才首次补建——时序不一致。
- 建议：开局路由在构建 `initialItems` 后，对 `gain` 项循环调用 `ensureItemLorebook(projectId, name, owner)`（与 game-engine.ts:347-351 一致，含 owner）。

### N5 — P2 — `parseGameQuantity` 把「零」解析为 0 数量（产生 0 数量物品）

- 位置：`src/core/game/game-prompts.ts:26-29`（`CN_NUM["零"]=0`）+ `:63-73`（`parseGameQuantity` 单字中文走 `CN_NUM`）。
- 问题：`CI|获得|灵石|零` → `quantity = 0`；`applyItemChanges` 的 gain 分支（game-engine.ts:48-57）会把「数量 0」的物品 `push` 进背包。0 数量物品无意义且污染背包/对账。
- 建议：`parseGameQuantity` 单字映射时把「零」视为非法数量 → 回退默认 `1` 并 `console.warn`；复合解析 `parseCnCompound` 仅在「零」作占位（如「一百零五」）时允许，单独「零」不算合法数量。

### N6 — P2 — abort 落在 establish 阶段触发流式重试风暴（延迟 abort，浪费连接）

- 位置：`src/core/llm/client.ts:262-267`（`establishStream` catch 把非 TypeError 错误当 `fatal:false` 返回）+ `:412-450`（`chatStream` 对 `est.ok=false` 重试 `DEFAULT_RETRIES(3) × chain` 直到抛 `lastError`）。
- 问题：若 `req.signal` 在进入 token 流前已中止（如用户在 `loadGameContext`/建连阶段极快点停止，`req.signal` 已 abort），`fetch` 立即 reject → `establishStream` 返回 `ok:false` → `chatStream` 按「可重试网络错误」**重试最多 3×3=9 次**才抛出。最终抛出的 `AbortError` 被 game-engine:291 正确分类为 abort（无 error 事件），**结果正确**，但中间产生大量无效连接尝试、延迟 abort 生效。
- 建议：`establishStream` 若 `request.signal?.aborted` 直接返回可识别的 abort 标记（如 `fatal:true` 或单独类型），让 `chatStream` 立即 `break` 而非重试；或在 `chatStream` 重试循环首行加 `if (request.signal?.aborted) throw new DOMException('aborted','AbortError')`。
- 关联：此路径也解释了 Round 9 报告 N2「中断 token 不计账」至今未修——abort 在流末前抛错，`onUsage`（client.ts:345-346）不触发，`recordLlmCall` 仍漏记；可一并修（在 `readStream` 的 abort 出口补一次最佳努力上账）。

### N7 — P2 — CI| owner 字段未清洗（括号/空白导致跨 owner 匹配失败）

- 位置：`src/core/game/game-prompts.ts:342`（`owner: parts[3] ? parts[3] : undefined`，仅 `trim`，不去外层括号）+ `src/core/game/game-engine.ts:35-36`（`matches` 用 `i.owner || DEFAULT_OWNER`，不归一化 owner 字面）。
- 问题：若模型写 `CI|获得|灵剑|1|（李尘）` 或 `CI|获得|灵剑|1| 李尘 `，owner 带全角括号/首尾空格入库；后续 `CI|消耗|灵剑|1|李尘`（无括号）在 `matches`（game-engine.ts:35-36）中 `（李尘）` ≠ `李尘` → 匹配失败，同名物品跨 owner 隔离被破坏。
- 建议：解析 `owner` 时 `trim` 并剥离最外层 `（）()「」""` 等括号（与物品名清洗一致）；`applyItemChanges` 的 `matches` 对 owner 也做一次归一化比较，避免字面微差错位。

### N8 — P2（低优）— `ensureItemLorebook` 同物品多 owner 时归属文案陈旧

- 位置：`src/core/game/game-engine.ts:404-422`。
- 问题：世界卡以 `(category:"item", title)` 唯一（`:406`），同名物品无论多少 owner 只建一条，content 写「归属：首得者」。若主角与李尘各得「怀表」，世界卡只记首个 owner，后续归属失真（背包已隔离，世界卡未隔离——Round 9 报告 N3 同源残留）。
- 建议：世界卡 content/relatedEntryIds 累加所有出现过的 owner；或在足够必要时以 `title+owner` 建多条（需评估世界卡爆炸风险）。低优打磨。

---

## 结论

**v0.46.72 下，阿游透镜是否还有 P0 / P1 / P2？**

- **P0：无。** Round 9 的 abort 语义修复已落地（game-engine.ts:289），abort 不再产生 error 事件、不污染回放；信号链路完整、abort 真中断 fetch、abort 后 `GET /api/game/state` 对账可自愈；测试 15/15 全绿，无回退与新回归。游戏流式中断的游戏态一致性已稳。
- **P1：3 条。**
  - **N1** 开局路由 `initialItems` 丢弃 owner（start/route.ts:108-119）→ 开局轮 name+owner 隔离失效，同名物品混淆。
  - **N2** 开局响应无 `items` + 前端 `handleStart` 硬置 `items:[]`（start/route.ts:146-155、page.tsx:174）→ 开场背包前端长期与后端错位，直到首次对账才自愈（本透镜「abort 后前后端错位」残留点）。
  - **N3** 同义/未知 CI| 动词静默丢弃（game-prompts.ts:18-23/330-345 + game-engine.ts:40-81）→ 叙事有物、背包无记录，主线一致性漂移。
- **P2：5 条。** N4 开局缺世界卡补建；N5「零」→0 数量；N6 establish 阶段 abort 重试风暴（兼 Round 9 未修的 token 不计账）；N7 owner 括号/空白未清洗；N8 世界卡归属文案陈旧。

**股东建议：** 本轮可放行（无 P0）。下个迭代优先修 **N1 + N2 + N3**（均属「背包归属 / 前后端错位 / 主线一致性」——阿游首要透镜），三者均可在游戏引擎与开局路由内小改动闭环；N4–N8 为一致性/健壮性打磨，可排期并入「背包↔世界卡双向打通」长期项。
