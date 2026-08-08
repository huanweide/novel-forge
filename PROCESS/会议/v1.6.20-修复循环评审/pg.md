# v1.6.20 修复循环评审 — PG（方向判断）视角报告

> 视角：樊氏集团董事会「方向判断」PG。硅谷中心、务实、反工程自嗨。
> 复核方式：已亲自读 `src/core/sync-global-prompt.ts`、`orchestrator.ts`、`generate/outline/route.ts`、`game/game-engine.ts`、`projects/[id]/export/route.ts`、`lorebook/[id]/route.ts` 及 `prisma/schema.prisma`，严重度判断以下文为准。

## ① 核心诊断：v1.6.20 到底该先修哪个

用户的真实痛点不是"又发现一堆 bug"，而是**刚在 v1.6.18 花大力气建立的"待审隔离"护栏，正从主干悄悄漏掉**。

- **F1（高，属实）**：`syncGlobalPrompt` 第 21-22 行 `characterCard.findMany({where:{projectId}})` 与 `lorebookEntry.findMany({where:{projectId,enabled:true}})` **均无 `reviewStatus` 过滤**。而 `orchestrator.ts:654` 直接读 `project.globalPrompt` 作为生成用的三卡数据。这意味着：自动填表进入"待确认(pending)"的卡，会原封不动地泄进正文生成。用户以为隔离了，实际没隔离——这是**信任级正确性 bug**，不是边角瑕疵。
- **F3（中，属实，同源）**：`outline/route.ts:26` 的 `characters:true` 漏过滤（lorebook 侧已正确过滤）；`game-engine.ts:236-237` 读取卡同样无 `reviewStatus`。与 F1 是**同一缺陷类**，仅在次要路径（大纲/游戏上下文）。
- **F2（高但为存量缺口，非回归）**：lorebook 删除是**硬删除**（`lorebook/[id]/route.ts:64` `prisma.lorebookEntry.delete`），且 schema 无 `deletedAt`——丢了不可逆。v1.6.19 的"撤销回滚"只覆盖 story 节点正文，autofill 的 update/delete 类填表无快照。属真实数据丢失风险，但**不是 v1.6.20 引入的回归**，且修复需要一套快照/软删机制，非 2 行。
- **F4（低-中，属实但非正确性）**：`export/route.ts:47` 一次性 `findMany` 全节点入内存，大书有峰值风险，但**输出永远正确**，只是规模问题。

**结论**：v1.6.20 的头号优先级是 F1（顺带同根 F3），因为它直接击穿你最珍视的架构不变量、且发生在主生成路径。

## ② 提升框架：优先级怎么排

PG 排序逻辑 = **「每工程小时的用户可见损害」**：
`严重度 × 爆炸半径 × 是否回归 ÷ 修复成本`。

- F1/F3：严重度高、爆炸半径大（主路径+大纲+游戏）、是回归、修复成本极低（约 6 行过滤）→ **最高优先，且必须同批**。
- F2：严重度高（不可逆丢失）、但低频、非回归、修复成本高（需设计快照/软删）→ **高关注、单独立项、不塞进 v1.6.20**。
- F4：严重度低、仅大书触发、零正确性影响 → **可暂缓，进 backlog**。

## ③ 具体可落地步骤

1. **v1.6.20 只发 F1+F3**：在 `syncGlobalPrompt`、`outline` 的 characters 查询、`game-engine` 读取端统一加 `reviewStatus:"approved"`（lorebook 端补 `reviewStatus`）。总计约 6 行，完全恢复三处生成路径的待审隔离。验证：造一张 pending 卡 → 确认它不出现在 globalPrompt / 大纲 / 游戏上下文。
2. **F2 不开在 v1.6.20，开设计单**：最小可行修复 = 给 `lorebookEntry` 加 `deletedAt`（复用 story 节点已有的软删/回收站范式），删除路由改置 `deletedAt`，读取端统一过滤 `deletedAt:null`。这既护住下行，又比"通用撤销框架"简单一个数量级。autofill 的 update 类可后续复用节点已有的 `snapshotRevision`。
3. **F4 暂缓**：仅当用户真有超大书并报告 OOM 才动手，届时改流式/分页读取，勿预先造管道。
4. **循环纪律**：「功能性→更新→检测→开会→修复→循环」作为轻量运营节奏可以，但**每个循环必须落到一个已验证的 shipped fix**，禁止为喂循环而把 F2/F4 注水进 v1.6.20。

## ④ 风险提示：避免过度工程 / 为循环而循环

- 别把 F1/F3 膨胀成"待审隔离重构 v2"。它就是 6 行过滤，修完即走。
- 别为 F2 造"全站通用 undo 中台"——只 2 类操作需要，复用软删+快照即可。
- 别为 F4 提前写流式导出管线——没有真实大书用户前，这是 gold-plating。
- 循环是手段不是 KPI：会议数、循环轮次都不该成为目标。

## ⑤ 与其他职能的张力

- **vs 马斯克「简单/第一性原理」**：F1/F3 的 6 行修复正合其意——恢复不变量的最简解就是正确解。反对把会议升级成架构大改。
- **vs 塔勒布「尾部风险/反脆弱」**：F2 恰是塔勒布会紧盯的**肥尾**——低频但不可逆（硬删除无回收站），对那个中招的用户是毁灭性不对称损失。所以塔勒布会主张"现在就护住下行"。**调和方式**：不与马斯克冲突。F2 不进 v1.6.20 的"大功能"，但**现在就做那个最小护盘动作**（lorebook 软删化），成本极低、下行归零；完整的 update 快照撤销作为独立小项排期。这样"简单"与"护尾"同时成立：v1.6.20 干净发 F1/F3，F2 的致命面用最便宜的方式当场堵住。

**一句话定调**：v1.6.20 = F1+F3 收口待审隔离；F2 用软删化堵死硬删尾部风险（轻量、独立）；F4 暂缓。循环继续转，但每次只产出一个 verified fix。
