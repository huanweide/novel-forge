# 阿游 · Novel Forge 游戏化叙事透镜 — Round 7 L1 只读诊断

> 视角：游戏流式叙事 / 背包物品变动 / 世界卡联动 / 选项分支 / 状态一致性 / 回退重算 / 流式断点自愈
> 模式：仅审查，未改动任何源码、changelog、MEMORY 或其他 round 报告。
> 复验范围：Round 6 在本透镜的 3 处修复（GET /api/game/state 对账、parseGameQuantity 复合中文数字、背包 owner 隔离）。

---

## 一、Round 6 修复复验结论

### 复验 1 · 中文复合数字解析（阿游 P1，v0.46.69）
- 文件：`src/core/game/game-prompts.ts:33-60`（`parseCnCompound`）+ `:63-73`（`parseGameQuantity`）
- ✅ **有效**。十/百进位解析正确：`十二→12`、`二十→20`、`一百零五→105`、`一百二十→120`、`十→10`、`两→2` 全部命中；非法串（如 `abc`）走 `console.warn` 默认 1。`parseGameOutput` 经 `parseGameQuantity(parts[2])` 接入，单测 `game-prompts.test.ts:88-117` 覆盖 `十二/二十/三十/十一/二十五/九十九/一百/一百零五/一百二十/十/两` 全通过。无回归。

### 复验 2 · 背包按 (name,owner) 隔离（阿游 P1，v0.46.69）
- 文件：`src/core/game/game-engine.ts:29-84`（`applyItemChanges`）+ `src/app/workspace/[projectId]/game/[nodeId]/page.tsx:284-325`
- ✅ **有效**。后端 `matches(i,name,owner)` 以 `(i.name==name && (i.owner||"主角")==owner)` 为键；`gain/consume/equip/discard` 四分支均按 owner 隔离，单测 `game-engine.test.ts:21-68` 验证「消耗李尘怀表不影响主角 / 获得主角怀表只累加主角 / 装备仅标对应 owner」全过。前端 `handleAction` 同步用 `match` 二元组（`:288-289`），逻辑一致。无回归。

### 复验 3 · GET /api/game/state 权威对账 + reconcile（阿游 P0-2，v0.46.69）
- 文件：`src/app/api/game/state/route.ts:68-108`（GET）、`src/core/game/reconcile.ts:35-50`（`reconcileFromSummary`）、`src/app/workspace/[projectId]/game/[nodeId]/page.tsx:178-202`（`reconcileWithBackend`）
- ⚠️ **部分有效、残留 P0 竞态**。GET 返回全量 `currentRound/totalWords/plotProgress/items/entities/narrative(allNarrative)/options(lastOptions)/turns`，`reconcileFromSummary` 整体覆盖字段，单测 `game-engine.test.ts:96-139` 验证轮次/背包与后端一致——链路本身正确。**但后端并未感知前端 abort**（见新坑 P0-1），导致常见停止场景下对账读到提交前快照，自愈失效。

---

## 二、新坑（按严重度）

### P0

**P0-1 · abort 信号未传到引擎，对账读到提交前快照 → 前后端重新错位**
- 位置：`src/app/api/game/action/route.ts:34-45`（未把 `req.signal` 传入 `processGameTurn`）、`src/core/game/game-engine.ts:216`（`processGameTurn` 签名无 `signal` 形参，`:334` `$transaction` 无条件提交）、`page.tsx:365-368`（`handleStop` 仅前端 abort）
- 现象：用户点「停止」发生在流式生成期（占停止行为的绝大多数窗口）。`handleStop` 触发前端 `fetch.abort()` → `catch` 调 `reconcileWithBackend()` → `GET /api/game/state`。**此刻后端仍在流式、`$transaction` 尚未执行**（`:334`），GET 返回仍是旧 `currentRound=N` 快照，前端被覆盖成 N。随后后端照常解析并提交 `currentRound=N+1` 及背包变动 → 后端 N+1、前端 N **永久错位**。下一轮前端按 N 重算 +1=N+1，后端按 N+1 重算 +1=N+2，差距固定为 1，且被停轮的物品变动只落库不在前端 → 背包发散。正是 P0-2 想灭的故障被重新引入。
- 严重度：P0（P0-2 修复在高概率路径下无效）。
- 建议：① 把 `req.signal` 透传进 `processGameTurn(input, signal?)`；② 在 `:334` `$transaction` 前 `if (signal?.aborted) return;`（丢弃本停止轮，与「停止=放弃本轮」语义一致）；③ 后端 abort 后前端对账读到未变权威态（N），前后端一致。作为兜底，对账可失败重试或改为「对账读到的 round 必须 ≥ 前端当前 round 才覆盖」。

### P1

**P1-1 · 前端 `handleAction` 原地改写 `state.items` 对象（共享引用变异）**
- 位置：`src/app/workspace/[projectId]/game/[nodeId]/page.tsx:285`（`let updatedItems=[...state.items]` 浅拷贝）+ `:293`（`existing.quantity += ...`）、`:308`、`:319`
- 现象：浅拷贝只复制数组，内部 item 对象与 `state.items` 同源。`existing.quantity += change.quantity` 直接改了原始 state 对象，违反 React 不可变更新，且影响其他引用该对象处，渲染可能不刷新/出现脏值。`applyItemChanges` 后端正确深拷贝（`:34`），前后端不一致。
- 严重度：P1（正常路径偶发显示错乱）。
- 建议：变动时始终 `updatedItems.map(...)` 生成新对象，不原地改 `existing`。

**P1-2 · GET /api/game/state 的 `entities` 跨轮重复累积**
- 位置：`src/core/game/game-engine.ts:126`（`states.flatMap(s=>s.entities)`）+ `route.ts:99`（`entities: summary.entities`）
- 现象：`getSessionSummary` 把每个 `gameState.entities` 摊平合并，**不按 name 去重**，同一实体每出现一轮就重复一次，回拉到前端后 `entities` 含大量重复项（含旧 round 快照），背包联动/实体面板数据膨胀。
- 严重度：P1（数据质量，量大会拖累渲染与去重逻辑）。
- 建议：合并时按 `name` 去重（取末轮或首次 `firstSeenRound`）；或前端 `reconcileFromSummary` 内去重。

### P2

**P2-1 · `handleStop` 立即把 status 置 `playing`，对账未完成即可再发行动，放大 P0-1 竞态**
- 位置：`src/app/workspace/[projectId]/game/[nodeId]/page.tsx:365-368`
- 现象：abort 后先 `setState(status:"playing")`，再异步 `reconcileWithBackend()`（GET 在途）。用户在 GET 返回前点行动 → `handleAction` 以旧 state 发请求，与后端在途提交/对账竞态叠加。
- 建议：stop 后保持 `generating` 或新增过渡态，待对账完成再解锁；或将 `handleStop` 改为 await 对账后再置 `playing`。

**P2-2 · `ensureItemLorebook` 落在 `$transaction` 之外（副作用先于事务）**
- 位置：`src/core/game/game-engine.ts:320-324`（在 `:334` 事务之前调用）
- 现象：gain 时先 `findFirst`+可能 `create` 世界卡词条，再提交游戏事务。若后续事务失败，世界卡留下孤儿词条；反之事务成功但词条写入与游戏态非原子。
- 建议：并入同一 `$transaction`，或事务成功后再联动。

**P2-3 · `parseCnCompound` 不支持 千/万 与小数 → 静默默认 1**
- 位置：`src/core/game/game-prompts.ts:33-60`、`:67-68`
- 现象：`一千零五`/`三百`/`1.5` 等：含「千/万」直接 `else return null` 落默认 1；小数 `^\d+$` 不命中 → 默认 1。物品数量失真。
- 建议：扩展进位单位到 千/万；数量位允许小数（或至少 `warn` 明确提示被吞的单位）。

**P2-4 · 后端无 (sessionId,round) 唯一约束/并发守卫（Round6 P2-4 仍未修）**
- 位置：`src/core/game/game-engine.ts:228-239`（仅 `status!=="active"` 初检）、`:334-359` 提交无重入校验
- 现象：前端刷新后内存 `status` 拦截失效，断网重发/双提交可重复落同一轮，`currentRound` 被覆盖。
- 建议：加 `(sessionId, round)` 唯一约束，提交前再校验 `currentRound` 未被并发推进。

---

## 三、复验总评

Round 6 本透镜两处**纯逻辑修复稳健生效**：复合中文数字解析、背包 (name,owner) 隔离均经单测覆盖、无回归。但 P0-2 流式自愈**在最常见路径（流式期停止）下无效**——根因是 abort 信号未透传到引擎，`reconcileWithBackend` 常读到 `$transaction` 提交前的旧快照，前后端重新错位（P0-1），等于把想灭的故障又引入了。另有前端原地改写 state 对象（P1-1）、回拉 entities 跨轮重复（P1-2）两项确定性缺陷。建议优先修 P0-1（signal 透传+提交前 abort 判断）。
