# Round 12 复验报告 · 阿游透镜（游戏系统）

- 复验对象：`novel-forge` @ HEAD `1cee64d`（Round 11 刚落地，未改动 src/）
- 透镜：游戏模式（流式 / 背包 / 物品变动 / 世界卡联动 / 前后端对齐）
- 方法：Read/Grep/Glob 逐文件核对 + `git log` 确认 HEAD；未改任何 src/、changelog、version、MEMORY。

---

## 一、回归结论（逐条 PASS/FAIL）

### A1. OP_MAP 同义动词扩充 —— PASS
证据：`src/core/game/game-prompts.ts:18-78`
- `consume`：含 `吞/吞下/服下/咽下`（44-47）✓
- `discard`：含 `舍弃/抛弃/遗弃/遗失/失落/丢失`（57-62）✓
- `unequip`：含 `解下/卸下/脱下/褪下`（64-67）✓
- `skip`：含 `典当/抵押/典押`（69-71）✓
- `destroy`：含 `损毁/摧毁/弄坏/毁坏/粉碎`（73-77）✓
- `gain`：含 `得到/收下/赢得/缴获`（32-35）✓

### A2. applyItemChanges 新增分支 + 收窄兜底 —— PASS
证据：`src/core/game/game-engine.ts:29-138`
- `unequip`（71-74）：仅清 `equipped:false`，不删物 ✓
- `destroy`（85-95）：数量递减，归零 `splice` 移除 ✓
- `skip`（96-98）：no-op 安全跳过 ✓
- 兜底收窄（99-135）：`SAFE_SKIP` / `GAIN_LIKE` 双集合；未知动词 `console.warn` + 安全跳过，**不再默认 +1 污染背包** ✓

### A3. GameState 唯一约束 schema 升级 —— PASS
证据：`prisma/schema.prisma:376` → `@@unique([sessionId, round])`（注释明确为并发/重试兜底）

### A4. 唯一约束已落库（db push / migration）—— FAIL（回归遗漏）
- `src/generated/prisma/models/GameState.ts:283,298` 含 `sessionId_round` 复合唯一 → 说明 `prisma generate` 已跑；
- 但 `prisma/migrations/` 下仅有 3 个旧 migration（最新 `20260606145122_personality_to_json`），**无任何为 GameState 唯一约束生成的新 migration**，仓库内也无 `*.db`；
- 结论：schema 改了、client 重生成了，但**约束未通过 migration/db push 落到真实数据库**。Round 11 的“数据库层兜底”仅停留在 schema 与 client，运行时 DB 仍只有旧 `@@index`，并发/重试写重复轮次时无数据库级拦截。属任务明示的“仅 schema 改未 db push = 回归遗漏”。

---

## 二、新挖问题清单（阿游透镜）

### P1

**B1 · 前端本地背包更新缺失 unequip/destroy/skip 分支**
- 文件：`src/core/game/reconcile.ts:68-83`
- 现象：`applyFrontendItemChanges` 仅处理 `gain/consume/discard/equip`，前端在流式 `game_done` 时对 `doneData.itemChanges` 做本地乐观更新（`page.tsx:293`），遇到脱下/损毁/流转类操作时会**临时错乱**（如 destroy 未在本地移除物品），直到 `reconcileWithBackend()` 整体覆盖才自愈。
- 根因：新增三分支只补在后端 `applyItemChanges`，前端镜像函数未同步。
- 建议：在 `applyFrontendItemChanges` 补齐 `unequip/destroy/skip`，与后端 `game-engine.ts:71-98` 完全对齐（destroy 归零 splice、skip no-op）。

**B2 · ItemChange 类型联合未覆盖新操作（类型谎言）**
- 文件：`src/core/game/types.ts:66-70`
- 现象：`ItemChange.operation` 仅为 `"gain"|"consume"|"equip"|"discard"`，但引擎运行时已支持 7 类（含 `unequip/destroy/skip`）；`doneData.itemChanges` 携带越界 operation，TS 类型与实际不符，失去类型保护。
- 建议：扩展 union 为 `"gain"|"consume"|"equip"|"unequip"|"discard"|"destroy"|"skip"`。

**B3 · GameState 唯一约束未落库（即 A4）**
- 文件：`prisma/schema.prisma:376` + 缺 migration
- 现象/根因见 A4。
- 建议：`prisma migrate dev --name game_state_unique`（或 `prisma db push`）生成 migration 并落到运行时 DB；CI 应校验 `prisma validate` 与 migration 一致。

### P2

**B4 · OP_MAP 仍缺高频同义动词（告警噪音，不污染数据）**
- 文件：`src/core/game/game-prompts.ts:18-78`
- 现象：常见动词未归一，每轮触发 `console.warn`：`吃/喝/食/进食/吸`(consume)、`摘下/摘掉/除下`(unequip)、`破坏/砸碎/摔碎/烧毁/焚毁/炸毁`(destroy)；`出售/售卖/卖出/交换/交易` 虽被 `SAFE_SKIP` 兜底但每次告警。
- 建议：补进 OP_MAP，将其转换为 `skip`/`consume`/`unequip`/`destroy`，消除噪音。

**B5 · 世界卡按 title 去重、不区分 owner**
- 文件：`src/core/game/game-engine.ts:458-476`
- 现象：`ensureItemLorebook` 用 `title:itemName` 唯一查找，主角与同名 NPC 物品会共用一张世界卡，归属信息丢失（content 仅记首个 owner）。
- 建议：去重维度加 `owner`，或 content 累积多归属。

**B6 · 开局 start 路由不建世界卡**
- 文件：`src/app/api/game/start/route.ts:108-120`
- 现象：开场 `gain` 物品只写 `initialItems`，不调用 `ensureItemLorebook`；与 `processGameTurn` 中 gain 自动联动世界卡（`game-engine.ts:401-405`）行为不一致，开场物品无世界卡。
- 建议：开局也遍历 `initialItems` 调用 `ensureItemLorebook`。

**B7 · gameState.create 无唯一冲突重试**
- 文件：`src/core/game/game-engine.ts:416-431`
- 现象：一旦 B3 的 `@@unique` 真正落库，并发/重试可能抛 `P2002`，当前无 catch/重试，直接失败且不自愈。
- 建议：对 `Prisma.PrismaClientKnownRequestError` code `P2002` 做 catch→幂等重试，或改为 `upsert`（需先按 `sessionId_round` 查找）。

---

## 三、小结
- 回归：A1/A2/A3 PASS；**A4 FAIL**（约束未落库）。
- 新挖：P1 × 3（B1 前端背包镜像缺分支、B2 类型联合缺 3 操作、B3 唯一约束未 db push）；P2 × 4（B4 OP_MAP 同义词、B5 世界卡 owner 去重、B6 开局世界卡、B7 唯一冲突重试）。
- 流式中断/abort/GET state 对账链路（action/route.ts + game-engine.ts + state/route.ts + page.tsx）经核对**闭环正确**，本轮未发现 P0 级背包/轮次错乱。
