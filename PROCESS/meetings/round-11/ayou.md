# Round 11 复验 — 阿游（游戏系统体验官）

> 只读复验诊断。本报告不修改任何源码、配置、文档；未执行 `git commit`、未跑 `tsc` 改东西。
> 透镜关注面：游戏流式对话、背包变动（gain/consume/equip/discard）、世界卡联动、中文语义动词归一化、前后端轮次/背包一致性、AbortSignal 透传。

## 环境

- **HEAD**：`b5901aa`（对应 Round 10 实现 commit `899a480`，版本 `v0.46.73`）
- **本轮实际读到的文件**（逐行/逐段核验）：
  - `src/core/game/game-engine.ts`（598 行）：`applyItemChanges`、`processGameTurn`、`ensureItemLorebook`
  - `src/core/game/game-prompts.ts`（402 行）：`OP_MAP`、`CN_NUM`、`parseCnCompound`、`parseGameQuantity`、`parseGameOutput`
  - `src/app/api/game/start/route.ts`（163 行）：开局物品写入与响应
  - `src/app/api/game/state/route.ts`（109 行）：回退 DELETE / 对账 GET
  - `src/app/api/game/action/route.ts`（65 行）：SSE 透传 `req.signal`
  - `src/app/workspace/[projectId]/game/[nodeId]/page.tsx`：`handleStart`（152、174、686）+ 通过 Grep 核实 `items: data.items ?? []`
  - `src/core/game/reconcile.ts`（108 行）：`applyFrontendItemChanges`、`reconcileFromSummary`
  - `src/core/game/types.ts`（153 行）：`GameItem`、`ItemChange`
  - `prisma/schema.prisma`：`GameSession` / `GameState`
  - `PROCESS/meetings/round-10/ayou.md`（130 行）：上轮 N1–N8 记录
  - `src/core/game/game-prompts.test.ts`（154 行）：同义动词测试
  - `CHANGELOG.md`：`v0.46.73` 修复条目

## 回归结论

### Round 10（v0.46.73）修复逐条复验

| 编号 | 修复点 | 复验位置 | 结论 |
|------|--------|----------|------|
| N1 | 开局物品补写 `owner`/`category`，避免落库丢归属 | `start/route.ts:114`（`category: change.category \|\| "other"`）、`:115`（`owner: change.owner \|\| "主角"`） | ✅ 已落地 |
| N2 | 响应补 `items` + 前端对齐 | `start/route.ts:131`、`:153`（`items: initialItems`）；前端 `page.tsx:174`（`items: data.items ?? []`） | ✅ 已落地（前端部分本轮用 Grep 补验，行号与上轮一致） |
| N3 | 同义动词不再静默丢物 | `OP_MAP` 扩展（`game-prompts.ts:26-46`：`拾取/捡到/取得/获取/拾起/拿/使用/服用/吃掉/饮用/吞/佩戴/穿上/戴/丢掉/扔掉/弃置/抛`）；`applyItemChanges` 新增 `else`（`game-engine.ts:81-110`，`SAFE_SKIP` 含 `出售/售卖/交换/交易`） | ✅ 已落地 |

> 注：N1/N2/N3 三处 P1 在本轮代码层面均**确认无回流**。

### 历史关键修复回流核查

- **AbortSignal 透传链路完整**：`action/route.ts:42` `processGameTurn({...}, req.signal)` → `game-engine.ts:303` `chatStream({..., signal})` → `:312` `if (signal?.aborted) return` → `:318-323` 区分 `AbortError`；abort 后前端走 GET `/api/game/state` 对账。✅ 无回流。
- **中文数字选项兼容**：`parseGameOutput` 选项解析（`game-prompts.ts` 选项段）+ `CN_NUM`/`parseCnCompound`/`parseGameQuantity` 复用于物品数量。✅ 无回流。
- **`GameItem.equipped` 字段**：`types.ts:54-62` 仍存在 `equipped?`，`applyItemChanges` 的 `equip` 分支（`:68-70`）置位。✅ 无回流。
- **`(name, owner)` 隔离**：`start/route.ts` 与 `applyItemChanges` 的 `gain`/`consume`/`equip` 均按 `(name, owner)` 建/查/改。✅ 无回流。
- **回退后整体覆盖**：`state/route.ts` DELETE（`:8-62`）真实删 `gameState` 行 + 回滚 `session` + 重算摘要返回；前端 `reconcileFromSummary` 整体覆盖。✅ 无回流。

## 新发现问题

### P0

无。本轮未发现数据丢失/崩溃/竞态/永久错位级别的确定性问题。

### P1

#### P1-1「安全兜底」反向导致未归一化动词**静默加物**（背包计数被污染）

- **症状**：模型若使用不在 `OP_MAP` 中、但语义属于「消耗/丢弃/卸下/典当/损毁」的中文动词，`applyItemChanges` 的 `else` 分支会**默认按 `gain` 处理**，把本应减少/移除的物品**反而 +1**，且全程仅 `console.warn` 无前端提示 → 背包数量悄悄错乱。这恰好是你点名要核实的动词群：
  - 消耗类漏网：`吞下`、`服下`（`OP_MAP` 只精确收录 `吞`，无前缀匹配，`game-prompts.ts:37`）
  - 丢弃类漏网：`舍弃`、`抛弃`、`遗弃`、`遗失`、`失落`
  - 卸下类：**引擎根本没有 `unequip` 操作**（`processGameTurn` 仅 `equip`），`解下/卸下/脱下` 落入 `else`→`gain`，既多一份物品、也永不清除 `equipped` 标记
  - 流转类漏网：`典当`、`抵押`（不在 `SAFE_SKIP`，`game-engine.ts:85` 仅含 `出售/售卖/交换/交易`）
  - 损毁类漏网：`损毁`、`摧毁`、`弄坏`（`destroy` 操作不存在）
- **file:line**：
  - 归一化点：`game-prompts.ts:358` `const op = OP_MAP[rawOp] ?? rawOp;`
  - 兜底默认 gain：`game-engine.ts:81-110`（`else` 分支，`:88-98` 未知动词 `console.warn` 后按 `gain`）
- **根因**：Round 10 为修「同义动词静默丢物」（N3）引入 `else→gain` 安全网；但该安全网的语义是「宁可多加、不可漏加」，对**消耗/丢弃/卸下语义**的未归一化动词会**反向加物**，与「防丢」初衷自相矛盾。
- **建议改法**（任选，推荐组合）：
  1. `OP_MAP` 补全你点名的动词：`吞下/服下→consume`、`舍弃/抛弃/遗弃/遗失/失落→discard`、`解下/卸下/脱下→unequip`（需引擎新增 `unequip` 分支：清 `equipped` 标记，不删物品或按 discard 处理）、`典当/抵押→pledge`（或并入 `discard` 语义）、`损毁/摧毁/弄坏→destroy`（并入 `discard`）。
  2. 缩小 `else` 兜底范围：未知动词不再「一律 gain」，而是按**意图分类**——疑似获得类才默认 gain，疑似消耗/丢弃/卸下类改为 `warn + 默认 no-op/安全跳过`，避免错加。
  3. 让 `SAFE_SKIP` 与「流转类动词」显式对齐，并补充测试断言这些动词**不应**落库。

#### P1-2 `GameState` 缺 `(sessionId, round)` 唯一约束（并发/重试可能写入重复轮次快照）

- **症状**：在多端并发或前端重试场景下，`gameState` 可能插入**同一 `round` 的多行**，导致对账/回退时 `getSessionSummary` 取到的背包快照歧义、背包 items 错位。
- **file:line**：`prisma/schema.prisma:360-377`，`GameState` 仅有 `@@index([sessionId])`（`:375`）、`@@index([sessionId, round])`（`:376`），**无 `@@unique([sessionId, round])`**。（对照 `GameSession` 有 `@@unique([projectId, nodeId])`，`:355`。）
- **根因**：轮次写入依赖应用层保证唯一，未下推到数据库约束；`processGameTurn` 的 `$transaction`（`game-engine.ts:390-415`）只写「最新快照」，但历史轮次行的唯一性无数据库兜底。
- **建议改法**：为 `GameState` 增加 `@@unique([sessionId, round])`，并将轮次写入改为 upsert；迁移脚本需先去重再建唯一索引。

### P2

- **P2-1 前端 `applyFrontendItemChanges` 与后端不对称（缺 `else`/SAFE_SKIP）**
  `reconcile.ts:35-85` 仅有 `gain`（`:47`）/`consume|discard`（`:68`）/`equip`（`:77`）三分支，**无顶层 `else`、无 `SAFE_SKIP`**。遇到未归一化动词时前端静默 no-op，而后端 `else→gain` 会加物 → 一轮之内前后端背包短暂不一致（无 abort 时靠最终对账自愈，但中途 UI 显示错误）。建议与后端 `applyItemChanges` 共用同一份分支/归一化逻辑。

- **P2-2 中文「零」被解析为数量 0 的物品（Round 10 N5 未修）**
  `game-prompts.ts:51` `CN_NUM` 含 `"零": 0`，经 `parseGameQuantity` 解析出数量为 `0` 的物品进入背包，计数无意义的 `0` 项。`parseGameQuantity` 仅在**无法解析**时默认 `1`，`零` 可解析为 `0`。建议 `零` 视为非法数量 → 默认 `1` 或跳过该行。

- **P2-3 owner 括号/空白未清洗（Round 10 N7 未修）**
  `game-prompts.ts:348` `owner: parts[3] ? parts[3] : undefined` 直接采用原值。模型若输出 `（主角）` 或 `主角（捡到时）`，归属者会带括号/附注存入，污染 `(name, owner)` 隔离键。建议对 `parts[3]` 做括号剥离 + `trim` 归一化。

- **P2-4 世界卡多归属只记首得者（Round 10 N8 未修）**
  `game-engine.ts:433-451` `ensureItemLorebook`：`if (existing) return`，物品被二手/转交后世界卡 `content` 仍写「归属：首得者」（`:445`），文案陈旧。建议所有权变更时更新 `content` 或追加归属记录。

- **观察（非数据错误）**：`得到/收缴/缴获` 等「获得类」未入 `OP_MAP`，落入 `else→gain`——功能上加物正确，仅产生误导性的「未知操作」warn。建议一并补入 `OP_MAP` 的 `gain` 组，消除噪音。

### P3

- **P3-1 测试与 `SAFE_SKIP` 语义略冲突**
  `game-prompts.test.ts:80-84` 仍固化断言 `CI|出售|宝物|1 → operation=出售`（透传原值），与后端 `SAFE_SKIP` 跳过入库的意图并存。建议测试改为断言「出售类不计入背包」或显式归一化，避免文档语义漂移。

## 终止判定倾向

**本透镜下不建议终止，建议开启 Round 12。**

- 仍存在 **2 个 P1**：
  - P1-1「未归一化消耗/丢弃/卸下动词 → 静默加物」，直接命中你点名的动词群，**会真实污染背包计数**（游戏态核心完整性），且当前 `else→gain` 安全网在语义上自相矛盾；
  - P1-2 `GameState` 缺唯一约束，属高严重度潜伏风险（并发/重试触发即错位）。
- P2 多为 Round 10 遗留未修项（N5/N7/N8）与前后端不对称，建议一并纳入下一轮。

**Round 12 建议最小闭环**：① 补全 `OP_MAP` + 引擎新增 `unequip/destroy` 分支 + 收敛 `else` 兜底语义；② `GameState` 加 `@@unique([sessionId, round])` 并改 upsert；③ 前端 `applyFrontendItemChanges` 与后端对齐；④ 修 N5/N7/N8；⑤ 测试对齐。

—— 阿游（游戏系统体验官），只读复验完成，未改动任何源码/配置/文档。
