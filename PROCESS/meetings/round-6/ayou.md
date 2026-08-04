# 阿游 · Novel Forge 游戏化叙事透镜 — Round 6 L1 只读诊断

> 视角：游戏流式叙事 / 背包物品变动 / 世界卡联动 / 选项分支 / 状态一致性 / 回退重算 / 流式断点
> 模式：仅审查，未改动任何源码。

---

## 一、Round 5 修复复验结论

### 修复 1 · `game-prompts.ts`（OP_MAP / CN_NUM / parseGameQuantity / parseGameOutput）

| 复验项 | 结论 |
|---|---|
| 中文操作归一化（获得→gain 等） | ✅ 有效。`OP_MAP` 为唯一归一化点，`parseGameOutput` 用 `OP_MAP[rawOp] ?? rawOp` 映射；单元测试用例全部覆盖。`game-engine.ts`/`page.tsx` 用英文枚举比较全部命中。 |
| 空名跳过（CI\|获得\|） | ✅ 有效。`parts.length < 2 \|\| !parts[1]` 直接 `continue`，测试验证 `itemChanges.length === 0`。 |
| 未知操作 warn 且不落库有效变动 | ✅ 有效。`CI\|出售\|宝物\|1` 保留原值 `出售` 并 `console.warn`；引擎/`page.tsx` 的 `if/else if` 分支均不命中 `出售`，故不产生背包状态变更（等价于静默忽略）。 |
| 中文数字「两」 | ✅ 有效。`CN_NUM["两"]===2`，测试 `CI\|获得\|怀表\|二 → quantity=2` 通过。 |

**复验发现的修复 1 残留缺陷（计入新坑 P1）**：`CN_NUM` 仅含单字（零~十），**不支持复合中文数字**（十二、二十、十一、三十…）。`CI|获得|丹药|十二` → `CN_NUM["十二"]` 为 `undefined` → 走 `console.warn` 默认返回 1，数量被静默错解为 1。

### 修复 2 · `src/app/api/game/state/route.ts`（DELETE 回退）

| 复验项 | 结论 |
|---|---|
| `round<1` 返回 400 | ✅ 有效（第 19-21 行）。`round=0`/`round=-3` 边界均被拒绝。 |
| session 不存在优雅 no-op | ✅ 有效（第 25-31 行），返回 `{ok:true,rolledBackTo:0,summary:{...全字段}}`，避免 500。 |
| DELETE 成功重算并返回全量 summary | ✅ 有效。`summary` 含 `currentRound/totalWords/plotProgress/items/entities/narrative/options`，字段齐全（第 48-56 行）。 |
| items 数组结构 / narrative 字段 | ✅ 兼容。`items/entities/options` 取 `last?.items` 并 `|| []`；`narrative` 由 `remaining.map(r=>r.narrative).join`。回退到 round 0 时全部为空数组/空串，无缺失。 |

### 修复 3 · `src/app/workspace/[projectId]/game/[nodeId]/page.tsx`（回退整体覆盖）

| 复验项 | 结论 |
|---|---|
| 回退后用 `data.summary` 整体 `setState` 覆盖 | ✅ 有效（第 594-605 行）：`currentRound/totalWords/plotProgress/items/entities/narrative/options` 全部以后端权威态覆盖。`narrative` 兜底为前端 `newTurns` 拼接，降级安全。 |
| round=0 边界 | ✅ 前端仅在 `turns.length>1` 时可回退，`lastRound≥2`，不会触发 `round<1`。 |

---

## 二、新坑（按严重度）

### P0

**P0-1 · 流式中断/停止导致前后端状态错乱**
- 位置：`src/app/api/game/action/route.ts:42-45` + `src/core/game/game-engine.ts:299-324` + `src/app/workspace/[projectId]/game/[nodeId]/page.tsx:206-242`
- 现象：后端 `processGameTurn` 在 `yield game_done` **之前**已用 `$transaction` 提交 `gameState` 与 `session`（`currentRound+1`、背包变动）。前端仅在收到 `game_done`（第 242 行后）才 `setState`。若用户点「停止」（`handleStop`→`AbortController.abort()`）或网络中断，后端事务已落库但前端 `doneData` 为 `null` → 抛「未收到游戏回合结果」，前端 `currentRound`/背包**停留在旧值**。后端已 +1，前端仍为旧轮；下次行动前端按旧 `currentRound+1` 重算，与后端彻底错位，且被中断那一轮叙事在前端丢失、在 DB 残留。
- 建议：① 后端在 SSE 生成前**不提交**，仅在 `game_done` 阶段提交（或用临时态+确认）；② 或前端 abort 后主动 `GET /api/game/state` 调 `getSessionSummary` 对账回拉权威态；③ 回退按钮已具备对账能力，可复用。

### P1

**P1-1 · CN_NUM 不支持复合中文数字（十二/二十/十一…）**
- 位置：`src/core/game/game-prompts.ts:26-29`、`parseGameQuantity` 第 32-40 行
- 现象：AI 常输出「十二」「二十」等两位数中文数量。`CN_NUM` 仅单字键，`parseGameQuantity("十二")` 非数字且未命中 → `console.warn` 默认 1。背包数量被错解为 1，计数失真。
- 建议：补充复合解析（十/百进位），或正则 `^([一二三四五六七八九]?十[一二三四五六七八九]?|[一二三四五六七八九]?十)$` 映射；至少把「十一~十九/二十~九十九」覆盖。

**P1-2 · CI 归属者字段错位（缺数量时 owner 落入 quantity 位）**
- 位置：`src/core/game/game-prompts.ts:305-310`
- 现象：格式约定 `CI|获得|物品名|数量|归属者（可选）`。若 AI 省略数量写成 `CI|获得|龙髓石|樊斯瑞`，则 `parts[2]="樊斯瑞"` 被当作数量 → `parseGameQuantity` 告警返回 1，而 `parts[3]` 为空 → `owner` 丢失（变 `undefined`）。归属者信息被吞。
- 建议：解析时先做字段语义识别——quantity 位若非数字且非已知操作，则视为 owner；或将 owner 识别为「末段且非数字」。

**P1-3 · consume/equip/discard 仅按 `name` 匹配，忽略 `owner` → 同名物品跨角色互相干扰**
- 位置：`src/core/game/game-engine.ts:235,250,259,263`；`src/app/workspace/[projectId]/game/[nodeId]/page.tsx:261,276,284,287`
- 现象：背包支持 `owner`（主角/李尘…），但变动匹配一律 `updatedItems.find(i => i.name===change.name)`，不校验 `owner`。若主角与李尘各持「怀表」，消耗李尘的「怀表」会误扣主角的；世界卡联动 `ensureItemLorebook` 也按 `title` 去重不管 owner。背包与世界卡不同步。
- 建议：匹配键改为 `(name, owner||"主角")` 二元组；`ensureItemLorebook` 在创建条目时写入 owner 并在已存在时合并 owner 列表。

### P2

**P2-1 · 回退后 `lastNarrative` 未重置**
- 位置：`src/app/workspace/[projectId]/game/[nodeId]/page.tsx:596-605`
- 现象：回退 `setState` 覆盖 7 个字段，但漏了 `lastNarrative`。被回退那轮的 `lastNarrative` 残留，`GameCanvas` 仍可能显示已删除轮的「实时叙事」。
- 建议：回退 `setState` 时一并 `lastNarrative: ""`（或 `sm.narrative` 末尾段）。

**P2-2 · 回退/重置未清理 lorebook 自动生成的物品词条**
- 位置：`src/core/game/game-engine.ts:287-291,342-360`；`route.ts` DELETE（`src/app/api/game/state/route.ts`）仅删 `gameState`
- 现象：`ensureItemLorebook` 在 gain 时向世界书写入 `item` 词条且**从不删除**。回退掉某轮后，该轮获得的物品已从背包移除，但世界卡仍残留对应词条 → 背包与世界卡不同步。
- 建议：回退/重置时按被删轮次的 `itemChanges(gain)` 反查并清理无引用的物品词条（或标记为已失效）。

**P2-3 · 开场获得物品前端不显示**
- 位置：`src/app/api/game/start/route.ts:108-119,146-155` + `src/app/workspace/[projectId]/game/[nodeId]/page.tsx:154-166`
- 现象：`start` 落库了 `initialItems`（round 1 开场获得），但返回体未带 `items`，前端 `handleStart` 硬编码 `items: []`。在首轮行动前，前端背包恒为空，与后端（含开场物品）不一致；首轮行动合并时才补齐。
- 建议：`start` 返回 `items: initialItems`，前端采用。

**P2-4 · 后端无在途/并发守卫**
- 位置：`src/core/game/game-engine.ts:159-170`（仅开始检查 `status!=="active"`）；前端仅靠 `page.tsx:182` `state.status!=="playing"` 防重入
- 现象：后端在持久化阶段未二次校验 session 仍 active，也未用唯一约束防重。断网重发/双点击可能重复落库同一轮（前端拦截依赖内存态，刷新后失效）。
- 建议：`gameState.round` 加 `(sessionId, round)` 唯一约束；提交前再校验 `currentRound` 未被并发推进。

**P2-5 · 选项承接弱（兜底选项无 text）**
- 位置：`src/core/game/game-engine.ts:178-183`、`game-prompts.ts:221-227`
- 现象：若上一轮选项解析不足 2 个触发兜底（`finalOptions` 固定文案、无对应 `index` 命中），`selectedOptionText` 取不到 → 承接提示退化为「选择了选项 N」，分支承接信息丢失。
- 建议：兜底选项写入带 index 的结构并持久化，确保 `selectedOptionText` 可命中；或在承接提示中改用 `actionText`。

---

## 三、复验总评

Round 5 三处修复**核心逻辑均有效**：中文操作归一化、空名跳过、未知操作告警、回退 `round<1` 拦截与全量 summary、前端整体覆盖——均已落地且无直接回归。主要风险已从「比较永不相等」转移到**流式断点状态错乱（P0）** 与 **中文数量/归属者/owner 匹配健壮性（P1）**。建议优先处理 P0-1（前端对账回拉）与 P1-1/P1-2/P1-3。
