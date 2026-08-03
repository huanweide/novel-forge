# 会员股东无限会议 · Round 5 · L1 只读复验报告（股东·阿游）

> 角色透镜：互动游戏小说作者 —— 游戏模式流式 + 背包归属 + 世界卡物品联动 + 与主线一致性。
> 复验对象：Round 4 阿游 P0-2（itemChanges 补 equip/discard + $transaction 两步写）、P0-3（CI|装备|/CI|丢弃| 解析落库）。
> 工作法：Read/Grep 源码 + `SAFE_DELETE_DISABLE=1 npx vitest run src/core/game`（5 passed）。未改任何源码/测试/changelog。
> HEAD = v0.46.67 (0a62a1f)。

---

## ①【P0】CI| 操作字段「中文 vs 英文」不匹配 —— 全部物品变动落库失败（含 Round4 新增的 equip/discard）

**证据**
- 解析器产出中文：`src/core/game/game-prompts.ts:266` `operation: parts[0]`，其中 `parts[0]` 取自 AI 原文 `CI|获得|…`/`CI|消耗|`/`CI|装备|`/`CI|丢弃|`（见 `game-prompts.ts:48-51` 提示词与 `game-prompts.test.ts:26-40` 断言 `operation` 为 `"获得"/"消耗"`）。
- 引擎按英文枚举比较：`game-engine.ts:233` `=== "gain"`、`:249` `=== "consume"`、`:257` `=== "equip"`、`:261` `=== "discard"`，且 `:288` `if (change.operation === "gain")` 同样英文。
- 前端同样英文：`page.tsx:259/275/283/286` 全部 `=== "gain"/"consume"/"equip"/"discard"`。
- 开局路由也中招：`src/app/api/game/start/route.ts:110` `if (change.operation === "gain")` 用于组装 `initialItems`。

**现状**：`change.operation` 实际为 `"获得"/"消耗"/"装备"/"丢弃"`，与 `"gain"/"consume"/"equip"/"discard"` 永不相等。后果：
1. 后端 `processGameTurn` 的 4 个分支（含 Round4 新补的 equip/discard）**全部命中失败**，`updatedItems` 不被修改 → `gameState.items` 永远停滞在上一轮快照，**背包不更新**。
2. 开局 `initialItems` 恒为空 → 开场获得物品也不入包。
3. `game-engine.ts:288` 的 `ensureItemLorebook` 分支（Round4「物品→世界书自动补建」）**永不执行** → 世界卡 item 词条联动失效。
4. 前端 `page.tsx` 背包同样不更新。
5. 测试 `game-prompts.test.ts` 只测解析器（正确返回中文），引擎/前端无单测 → 该缺陷未被任何测试捕获。

**期望**：解析出的 `operation` 与引擎/前端/开局比较所用枚举一致，CI| 四种变动真实改变背包与世界卡。

**具体修法**：在 `parseGameOutput` 内做**唯一归一化点**——把 `parts[0]` 映射为英文枚举：`获得→gain / 消耗→consume / 装备→equip / 丢弃→discard`（未知值保留并打 warn）。这样 `types.ts:67` 的 `"gain"|"consume"|"equip"|"discard"` 才名副其实，引擎/前端/开局比较全部生效，且无需改动四处比较逻辑。补一条断言中文→英文映射的单元测试。

---

## ②【P1】回退后前端 `totalWords/items/plotProgress/entities` 不重置 —— 与后端回滚态错位

**证据**
- 后端回退真实重算：`src/app/api/game/state/route.ts:20-32` 删除 `round>=N` 的 `gameState`，并按剩余态重算 `currentRound/totalWords/plotProgress`。
- 前端回退只改三字段：`page.tsx:597-602` 的 `setState` 仅更新 `narrative / currentRound / options`，**未重置** `totalWords`、`plotProgress`、`items`、`entities`。
- 下一轮累加用前端值：`page.tsx:245` `newTotalWords = state.totalWords + (doneData.wordCount||0)`。

**现状**：回退第 N 轮后，前端仍持有被撤销轮的 `totalWords` 与 `items`/`plotProgress`/`entities`，而后端已回滚。下一轮前端基于**陈旧 totalWords** 累加 → 字数虚高（被撤销轮字数被重复计入）；背包仍显示已丢弃/已撤销的物品；进度条显示陈旧值。导出（`endGameAndExport`）以**后端** `gameState` 拼接，前端显示与导出正文不一致，回归了 Round4 想解决的「显示与导出错位」老问题。

**期望**：回退后前端状态与后端 rollback 后的权威态一致（totalWords/items/plotProgress/entities 同步收敛）。

**具体修法**：回退 `DELETE` 成功后，前端不要用本地 `slice` 估算，改为 `fetch /api/game/state?sessionId=&round=N` 拿到 `rolledBackTo` 后，再 `GET` 一次会话摘要（`getSessionSummary`）整体覆盖 `totalWords/plotProgress/items/entities/narrative/options`；或让 `DELETE` 响应直接返回重算后的全量摘要。至少需补 `totalWords/items/plotProgress/entities` 的回退重置。

---

## ③【P2】DELETE /api/game/state 边界：round=0 清空全部、session 不存在返回 500、无并发锁

**证据**：`src/app/api/game/state/route.ts:14-32`
- `round=0`：`deleteMany({ where: { sessionId, round: { gte: 0 } } })` 因 gameState 轮次从 1 起，会**删除全部轮次**，随后 `remaining` 为空 → session 被重置为 0；API 未校验 `round>=1`。（前端回退受 `turns.length>1` 限制不会触发，但裸 API 可调。）
- 不存在的 session：`deleteMany` 删 0 行后 `gameSession.update({where:{id}})` 抛 P2025 → 落入 `:34` catch 返回 **500**（非 404/优雅 no-op）。
- 并发：DELETE 与正在进行的 action（`processGameTurn`）无锁，二者交错可能导致 `currentRound`/`totalWords` 重算与新建态竞争。

**期望**：拒绝 `round<1`；session 不存在返回 404/幂等 200；关键路径加乐观锁或串行化。

**具体修法**：`round` 解析后加 `if (round < 1) return 400`；`update` 前先 `findUnique` 判空，空则直接 `{ok:true, rolledBackTo:0}`；对高频回退/行动竞争，建议用 `sessionId` 级互斥或把回退并入同一事务语义。

---

## ④【P2】CI| 解析健壮性：空物品名、中文数量、未知操作

**证据**：`src/core/game/game-prompts.ts:262-272`
- 空名：`CI|获得|` → `parts[1]===""` 仍 `push`，引擎 `find(i=>i.name==="")` 可能落空或误建空名物品。
- 中文数量：`CI|获得|怀表|二` → `parseInt("二")` 为 NaN → `|| 1` 恒得 1（应为 2）。
- 未知操作（如 `CI|出售|…`）：`operation` 不被任一分支识别 → 静默丢弃（可接受，但无日志，难排查）。

**期望**：空名跳过；数量支持中文数字（一二三…/十/百）解析或至少对非数字数量给出明确默认并告警；未知操作记 warn 不静默吞。

**具体修法**：解析时 `if (!name) continue;`；引入 `cnNum` 表（与选项解析 `:197` 共用）把数量也做中→阿转换；未知 `operation` 用 `console.warn` 输出。

---

## 复验总结（≤150 字）

Round4 的 equip/discard 与两步写事务（④原子性成立）方向正确，但①暴露根因级 P0：CI| 操作字段中文/英文不匹配，导致**全部物品变动落库失败**（含 Round4 新补的 equip/discard、既有 gain/consume、世界卡自动补建、开局入包），且测试未覆盖。②回退后前端 totalWords/items 不重置，与后端错位会虚增字数。③④为边界健壮性。建议先修①归一化点，再补引擎/前端单测。
