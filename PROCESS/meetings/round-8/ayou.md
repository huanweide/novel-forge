# Round 8 L1 只读诊断 —— 阿游（游戏化叙事透镜）

> 日期：2026-08-04 ｜ 模式：maxloop Round 8 L1 只读诊断
> 范围：Round 7 我透镜内修复的复验 + 新坑挖掘（仅新建本报告，未改动任何源码/changelog/MEMORY）
> 文件：`src/core/game/game-engine.ts`(+test)、`reconcile.ts`、`game-prompts.ts`(+test)、`src/app/api/game/state/route.ts`、`action/route.ts`、`src/app/workspace/[projectId]/game/[nodeId]/page.tsx`

---

## 一、Round 7 修复复验结论（我透镜内三处，全部真实生效、无回退）

| Round7 项 | 修复点 | 复验证据 | 结论 |
|---|---|---|---|
| **P0-1 abort 信号透传** | `action/route.ts:42` 传 `req.signal` → `game-engine.ts:282`(流式期) + `:331`(提交前) 双层 `if(signal?.aborted) return`；`page.tsx:332` abort + `:333` GET 对账 | `game-engine.test.ts:164-187` 断言 abort 时 `$transaction` 调用 0 次；`:189-210` 断言未 abort 正常提交 1 次；`:212-216` 断言对账读到 abort 前 `currentRound=1` | ✅ 生效，有单测保护 |
| **P1-1 前端不可变更新** | `page.tsx:285` 改调 `applyFrontendItemChanges`（`reconcile.ts:35` 纯函数，`.map(i=>({...i}))` 深拷贝返回新数组/新对象），`setState` 用新引用 | `game-engine.test.ts:220-247` 断言 `res !== clone`、`res[0] !== clone[0]`、原对象 `quantity` 不变；`page.tsx:277-282` 实体合并用 `[...state.entities]` 新数组 | ✅ 生效，原地改写已消除 |
| **P1-2 entities 跨轮去重** | `game-engine.ts:127-133` 以 `Map<name,entity>` 替代旧 `flatMap`，末轮快照去重 | `game-engine.test.ts:250-299` 断言 3 轮同名实体只剩 2 条且取末轮 `description="最新"` | ✅ 生效，重复累积已消除 |

> 结论：Round 6 P0-2「前后端永久错位」根因（流式中断后后端仍提交、前端读旧快照）在 Round 7 已通过 abort 不提交 + GET 对账整体覆盖闭环，复验通过。

---

## 二、新坑（复验之外挖出的问题）

### P0（新增数据损坏级）：无
本轮未发现新的 P0 级数据损坏。Round 7 三处修复闭环有效，abort 后前后端态一致。

### P1（明显缺陷，建议本轮回填）

**P1-1** · `src/core/game/game-engine.ts:274`
- 现象：`client.chatStream({...})` **未透传 abort 信号**。用户在流式期点「停止」时，`processGameTurn` 仅在第 282 行「下一块到达时」才 `return`，而底层 LLM 请求仍持续生成并被丢弃。结果：停止语义不彻底、浪费 token/成本，且慢网络下「停止」要等一整块才生效。
- 严重度：P1（非数据损坏，但属 P0-1 头条「abort 透传」的不完整落点，直接关系成本与体验）。
- 建议：`client.chatStream` 接收并转发 `signal`（或 `AbortController`），使底层 fetch 真正中断；与既有 282/331 双层检查互补。

**P1-2** · `src/core/game/game-engine.ts:280-294, 350`
- 现象：若 LLM 返回 **0 个 chunk**（空流），`for await` 循环体不执行，第 282 行 abort 检查被跳过，直接 `parseGameOutput("")` → `narrative=""`、选项回退兜底 3 条；随后第 331 行未 abort 即 `$transaction` 提交一个**空叙事幻影轮次**（`currentRound+1`、但 `totalWords` 不变）。产生多余空轮、污染回放。
- 严重度：P1（游戏健壮性，会静默产生幻影轮次）。
- 建议：在进入提交前对 `fullResponse.trim() === ""` 提前 `return` 不提交；并补一条单测（mock `chatStream` 产出 0 chunk）。

### P2（排期，本轮不强制）

**P2-1** · `src/core/game/game-engine.ts:127-133` vs `:179-184, :316`（实体去重策略不一致）
- 现象：`getSessionSummary` 用 `Map.set` 取**末轮**快照（展示给用户的摘要最新），而 `loadGameContext`/引擎 `existingEntities` 用 `if(!has) set` 取**首轮**快照（喂给 LLM 的上下文最旧）。同一实体跨轮更新描述时，前端摘要与 LLM 上下文所见版本不一致（摘要=新、上下文=旧），可能让 AI 重复「新介绍」已更新实体。
- 建议：统一为末轮优先（或显式 latest-by-round）一处定义，两处复用。

**P2-2** · `src/app/api/game/state/route.ts:49-57` + `page.tsx:589`
- 现象：DELETE 回退摘要**不含 `turns`**，前端在发请求前先用 `setTurns(turns.slice(0,-1))` 本地截断（`:589`）。若后端 DELETE 失败（catch `:617`），前端已丢弃末轮而后端仍在 → 导出前须手动刷新对账的脆弱窗口。
- 建议：DELETE 也返回权威 `turns`，回退后优先用后端 `turns` 整体覆盖前端。

**P2-3** · `src/core/game/game-engine.ts:248`（上下文加载期无 abort 检查）
- 现象：`loadGameContext` 含多个 `await`（project/node/characters/lore/states），其间未查 `signal.aborted`；若用户在上下文加载阶段停止，仍会进入生成并可能提交（窄窗口，仅当停止恰在该阶段）。
- 建议：在 `loadGameContext` 之后、生成之前补一次 `if(signal?.aborted) return`，与 282/331 形成三层防御。

**P2-4** · `src/app/workspace/[projectId]/game/[nodeId]/page.tsx:272-274`（成功路径前端自算轮次/字数）
- 现象：成功路径 `newRound = state.currentRound+1`、`newTotalWords`、`fullNarrative` 取自闭包 `state` 自算，而非后端 `game_done` 返回的权威值（`game_done` 仅回传 `wordCount/plotProgress`）。若闭包 `state` 滞后，会写错并需待下次对账纠正。
- 建议：成功路径也以后端 `doneData.currentRound/totalWords` 为准；`game_done` 事件补回 `currentRound/totalWords` 字段。

---

## 三、L2 派发建议（我透镜内）
- 必修回填：P1-1（chatStream 透传 abort）、P1-2（空流不提交幻影轮）。
- 排期：P2-1~P2-4。
- 复验同源单测已覆盖 Round 7 三处，新增修复须同步补单测（尤其 P1-2 空流场景）。
