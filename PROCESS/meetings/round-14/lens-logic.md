# Round-14 只读审计 · 逻辑正确性透镜（lens-logic）

- 审计员角色：逻辑正确性透镜（聚焦功能测试易漏的业务逻辑深层坑）
- 工作副本：`novel-forge` @ HEAD=v1.0.2（commit 918c7d7）
- 审计方式：只读。仅本文件写入，未改动任何源码。
- 覆盖范围：游戏引擎/状态机、章节确认状态机、自动填表（宝宝流）、CJK 匹配、导入/导出、版本快照、分页。
- 方法：源码逐行 + 历史 `PROCESS/meetings/round-*/_integration.md` 与 prisma 数据模型交叉核验（记录 vs 代码一致性）。

---

## 一、摘要

本轮在「业务逻辑正确性」维度未发现**阻断级（P0）/ 高优（P1）必须立即修复**的问题。历史 IMP 与 round-6~12 的关键修复（IMP-001 快照、IMP-013 文件名、IMP-014 forceNew、round-12 G1 forkPointNodeId、round-7 P0-1 abort 透传、round-12 A1 GameState 唯一约束、round-6 P0-3 空 ops 不标已填、阿游 P1 背包 owner 隔离）经代码核验**均已真实闭环**，未发现"假收敛"或漏提交（round-2 教训已规避）。

但发现 **4 个 P2 级并发/一致性缺陷** 与 **3 个观察池项**，均属"功能测试难触发、但逻辑正确性存在缺口"的深层坑，建议修复但不阻断发布。

一句话结论：**未发现必须阻断修复的 P0/P1 问题；发现 4 个 P2 级缺陷 + 3 个观察项，建议择机修复。**

---

## 二、逐条发现

### F1 · P2 · 游戏并发回合导致字数丢失与回合覆盖
- **证据**：`src/core/game/game-engine.ts`
  - :303 读取 `session`（含 `currentRound`/`totalWords`）后，:388 `const newRound = session.currentRound + 1;`
  - :423 `const newTotalWords = session.totalWords + wordCount;`（两并发请求读到**相同**的 base）
  - :433-471 在 `$transaction` 内 `gameState.upsert(round=newRound)` + `gameSession.update(currentRound/newTotalWords)`；但 `newRound`/`newTotalWords` 是**事务外读-改-写**算出的，事务内仅 upsert+覆盖，无"读最新再算"补偿。
- **影响**：同一 `session` 两路 `processGameTurn` 并发（弱网重试、双标签页、前端 abort 后重发）时，二者都基于同一 `currentRound` 算出同一 `newRound`，`upsert` 互相覆盖（后写轮次完整替换前写轮次），且 `totalWords` 用同一基准重算 → 后提交者覆盖前者，丢失一个回合的正文快照与字数累加。属于典型"并发写同一资源"缺口。
- **复现**：对同一活跃 `sessionId` 几乎同时发两个 `/api/game/action`，观察 `gameState` 仅留 1 条该轮、`totalWords` 少算一路。
- **建议**：`currentRound`/`totalWords` 改为事务内 `updateMany` 增量（`currentRound: { increment: 1 }`、`totalWords: { increment: wordCount }`），或对 `(sessionId, round)` 写前加分布式锁/串行化。

### F2 · P2 · 填表整表 rows 整体覆盖写，并发填表互相吞没事实
- **证据**：`src/core/babylore/fill.ts`
  - :405 `rows` 为内存累积数组（跨章复用同一 `tables` 引用），:439/:471 用 `maxId` 本地算 `row_id`；
  - :494 `await prisma.loreTable.update({ where: { id: t.id }, data: { rows } });` —— 把**整张表 rows 数组整体覆盖**回库，非行级增量，无乐观锁/版本。
- **影响**：两路并发填表命中同一张表（例如"写章自动填表"与"一键填表"并行，或两章并行且同表）时，各自从库读 rows→本地累积→整体写回，后写者整表覆盖先写者，**先写那一轮抽取的所有事实行整体丢失**（不仅是 `row_id` 碰撞，而是整轮事实消失）。
- **复现**：开启自动填表后，写一章的同时点"一键填表全部"，观察其中一张表的行数不增反减。
- **建议**：行级 upsert/增量写，或填表操作串行化（按 `projectId`+`tableId` 加锁），避免整表覆盖。

### F3 · P2 · 游戏实体去重语义前后不一致（last-wins vs first-wins）
- **证据**：`src/core/game/game-engine.ts`
  - `getSessionSummary`（展示用）:198 `entityMap.set(e.name, e)` → **后到覆盖（last-wins）**；
  - `loadGameContext`（下一轮 prompt 用）:250 `if (!entityMap.has(e.name)) entityMap.set(...)` → **首次锁定（first-wins）**；
  - `processGameTurn` :396-406 `existingEntities.find(e => e.name === ne.name)` 过滤掉同名 `newEntity` → 角色被改写后**旧版本实体胜出**。
- **影响**：同一会话"前端展示的实体"与"下一轮喂给 LLM 的实体"语义不一致；更关键的是游戏内 LLM 若把某角色改写为新状态（同名 `newEntity`），该更新会被静默丢弃，后续轮次 prompt 与展示仍用旧属性 → 游戏内设定漂移。功能测试因单人顺序游玩难暴露。
- **复现**：游戏中让 LLM 输出一个"已存在角色的新状态"作为 `newEntity`，检查下一轮 prompt/展示是否仍用旧版。
- **建议**：统一为 last-wins（以最新轮次为准），或显式更新既有实体而非丢弃。

### F4 · P2 · 版本快照 version 读-改-写非原子，并发保存产生重复版本号
- **证据**：`src/lib/versions.ts`
  - :59-67 `findFirst({ orderBy: { version: "desc" } })` 取 `last.version`，`version = (last?.version ?? 0) + 1` 再 `create`；
  - `prisma/schema.prisma:195-197` `StoryNodeRevision` 仅有 `id @id @default(cuid())` 与 `nodeId String`（仅 `@@index`），**无 `@@unique([nodeId, version])`**。
- **影响**：同一节点两路并发保存（手动保存同时 AI 改写）时，二者读到同一 `last.version` → 算出相同 `version` → 各自 `create` 出**两条 version 相同的记录**（因无唯一约束不会抛 P2002，:78 的 catch 也无需吞错）。破坏"同节点内 version 单调递增/唯一"这一被去重（:64 仅比 last.content）与回滚/历史排序依赖的不变式。
- **复现**：同章并发两次保存，查 `StoryNodeRevision` 是否出现重复 `version`。
- **建议**：加 `@@unique([nodeId, version])` 并在并发冲突时以"读最新+重试"或 `upsert` 兜底；或在事务内取 max version。

### 观察池（O1–O3，不评级，建议择机处理）

- **O1 · 游戏 start 并发竞态抛 P2025**（观察）
  - `game-engine.ts:702-713` `resetGameSession` 先 `findUnique` 旧 session 再 `delete`；`start/route.ts:21` 直接调用且无重试。两个 `game/start` 并发时，第二者 `delete` 已被第一者删掉的记录 → `prisma.delete` 抛 P2025 → 500。双击"开始游戏"可触发，但不损数据（可重试）。
- **O2 · 导出 HTML 锚点 slug 碰撞**（观察）
  - `export/route.ts:132,194` 目录锚点 `slugify(title)` 仅做小写+去标点，**同名单章产生相同 `<a id>`**，目录跳转不准。影响纯展示，不损数据。
- **O3 · `applyItemChanges` 未校验 quantity 正负**（观察）
  - `game-engine.ts:47,63,80,91` 用 `change.quantity || 1` 仅在 0/undefined/null 时回退 1；若 LLM 给出**负数**，`consume/discard/destroy` 会变成 `current - (-n) = +n`（变相加物品），`gain` 路径则减物品。缺少符号/范围校验。现实中 LLM 极少给负数量，但属边界防护缺失。

---

## 三、历史问题复核结论（记录 vs 代码一致性）

逐项核验本轮重点 IMP / round 修复是否真落地（避免 round-2 的"假收敛/漏提交"重演）：

| 编号 | 修复要点 | 复核文件:行 | 结论 |
|---|---|---|---|
| IMP-001 | 游戏导出以 `originalContentSnapshot` 为前置，杜绝原正文被覆盖/二次导出堆叠 | `game-engine.ts:160-165`（创建快照）、`:565`（导出拼接）、`resetGameSession:706-713`（跨 reset 复用快照） | **已闭环** |
| IMP-013 | 导出文件名中文乱码 → `filename*=UTF-8''` | `export/route.ts:90,104,117,166`（html/epub/docx/markdown·txt 四分支均含） | **已闭环** |
| IMP-014 | forceNew 副本命名去尾（避免 `（副本）（副本）` 堆叠） | `import/route.ts:58`（forceNew→importSourceKey=null）、`:84-85`（正则去尾+后缀） | **已闭环** |
| IMP-015 | import 超时 5s→120s | `import/route.ts:234` `{ timeout: 120000 }` | **已存在，无需改** |
| round-12 G1 | 含 `storyBranches` 的 `.nfproject` 导入必失败（forkPointNodeId 被 strip 删） | `import/route.ts:110-121`（占位）、`:157-176`（Pass3 重映射 + lostForks 标注） | **已闭环** |
| round-7 P0-1 | abort 信号未透传到底层 fetch | `game/action/route.ts:42`（传 `req.signal`）、`game-engine.ts:348,352,360,411`（透传+双重 guard） | **已闭环** |
| round-12 A1 | GameState 无唯一约束→重试 P2002 | `game-engine.ts:434` `upsert` + `schema.prisma:391` `@@unique([sessionId, round])` | **已闭环** |
| round-6 P0-3 | 空 ops / 全失效章被误标"已填" | `fill.ts:355`（applied===0 判失败）、`babyloreFillAll:685`、`loop.ts:187`（ok&&applied>0 才标已填） | **已闭环** |
| 阿游 P1 | 背包按 name+owner 隔离（主角/NPC 同名物品互不干扰） | `game-engine.ts:31-140` `applyItemChanges` 全分支 matches 含 owner | **已闭环** |
| 阿游 P1-1 | 未知动词不再无脑 gain；脱下/损毁/流转归一 | `game-engine.ts:73-137`（unequip/destroy/skip + SAFE_SKIP/GAIN_LIKE 收窄兜底） | **已闭环** |

> 说明：以上复核基于本轮实际读取的源码与 `schema.prisma`；`game-prompts.ts`（`parseGameOutput`）、`recall.ts` 等未逐行重读，其相关历史项（如 round-6 P0-2 流式轮次对齐）以 `game-engine.ts` 内的 abort/对账逻辑（:408-413、state/route.ts 对账）为间接佐证，未见回归。

---

## 四、观察池补充说明（边界/分页专项）

- **分页 offset/limit 越界**：经全量 grep `src/app/api`（take/skip/limit/offset/page），所有 `take` 均为**硬编码常量**（10/12/15/20/30/300），无对外暴露的用户可控 `skip/take/limit/page` 参数；唯一 `limit`（`characters/expand/route.ts:175`）为内部并发 worker 数上限。结论：**未发现对外分页参数越界风险（未发现）**。
- **字数 <50 守卫**：章节手动确认 `nodes/[id]/route.ts:164`（`<50` → 422）与 `confirm-guard.ts:62`（`<50` 拦截 + 额外 `<150` 机械重复/阈值）双处一致；游戏导出走 `evaluateConfirmEligibility` 统一口径。结论：**未发现不一致（未发现）**。
- **ID 生成碰撞**：项目/会话等混用 `uuid()` 与 `cuid()`，但均为各自 `@id @default(...)` 的全局唯一函数，无业务自定义 ID 拼接导致的碰撞点（除 F4 的 version 非唯一属并发写，非 ID 生成函数本身）。结论：**未发现 ID 函数级碰撞（未发现）**。
- **软删后重建唯一键冲突**：`Project.deletedAt` 软删；`Project.importSource @unique` 仅作用于 `.nfproject` 导入幂等；`Project.name` 无唯一约束。软删后新建同名项目不冲突。结论：**未发现唯一键冲突（未发现）**。
- **导出 round-trip 幂等**：导出为纯只读 GET，无副作用；多次导出同一项目结果一致（除 O2 slug 碰撞属展示层）。结论：**未发现幂等破坏（未发现）**。

---

## 五、总结

- 未发现必须阻断修复的 P0/P1 问题。
- 发现 4 个 P2 级缺陷（F1 游戏并发回合覆盖、F2 填表整表覆盖写、F3 实体去重语义不一致、F4 版本号并发重复）+ 3 个观察项（O1 start 竞态、O2 slug 碰撞、O3 quantity 未校验）。
- 历史 IMP / round 关键修复经代码核验均已真实闭环，无假收敛/漏提交。
- 所有审计均为只读，未修改任何源码。
