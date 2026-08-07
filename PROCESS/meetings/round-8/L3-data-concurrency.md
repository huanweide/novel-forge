# 透镜 L3 数据完整性与并发审计（round-8 / v1.6.9）

> 审计基线：已发布 v1.6.9（commit `fc5a662`，与 origin/main 一致）
> 审计员角色：只读深度审计员（魔王系统 round-8 开会子 Agent）
> 审计原则：仅静态只读分析；所有发现均带 `file:line` 证据；未运行 `tsc`/`vitest` 全量（由 Chair 统一跑）；round-7 已覆盖项不重复报告。

## 一、审计方法与范围

**范围（透镜 L3=数据完整性与并发）**
- 事务边界：除 round-7 已修的 `continue` order 事务外，排查其他"应包事务却没包"的多写操作（写章+故事线+binding、import 批量插入、节点删除）。
- 并发竞态：并发写同一章、并发确认同一节点、并发 import 同一 project、并发实体/世界卡创建、storyline 读改写。
- 孤儿记录：删 project/worldcard/storyline/节点 未级联删关联章节、伏笔、chapterSummary 等。
- 级联删除配置：`prisma/schema.prisma` 的 `onDelete` 是否完整。
- 种子/迁移幂等性。
- 数值/枚举不一致：状态字符串多处硬编码残留。
- 浮点/整数：token 计数、进度百分比计算。

**方法**
1. 通读 `prisma/schema.prisma` 全部 relation 与 `onDelete`。
2. 静态追踪核心写路径：`write`/`continue`/`refine`/`post-processor`、`storyline-writer`/`plan-chapter`、`entity-auto-creator`、`import/commit`、`confirm-guard`、`lorebook/[id]`、`story/nodes/[id]`、`storylines/[id]`、`generate/outline`。
3. 交叉验证消费侧（`context-loader`）是否会读到孤儿/重复记录，以确认影响面。
4. 全程未修改任何源码；未执行编译/测试全量。

## 二、发现清单

| ID | 严重度 | file:line | 问题描述 | 证据/复现 | 修复建议 |
|----|--------|-----------|----------|-----------|----------|
| L3-001 | P1 | `prisma/schema.prisma:242`(ChapterSummary.chapterId)、`:307`(StoryBeat.nodeId)、`:264`(PendingCommitment.sourceNodeId)、`:554`(PendingItem.sourceNodeId)；删除点 `src/app/api/story/nodes/[id]/route.ts:276-277`、`src/app/api/generate/outline/route.ts:329`、`src/app/api/storylines/[id]/route.ts:103` | **删节点/故事线不清理 String 型引用子记录，产生孤儿**。上述四个引用列是**普通 String 而非外键**，schema 无 `onDelete: Cascade`，因此节点删除后 `ChapterSummary`/`StoryBeat`/`PendingCommitment.sourceNodeId`/`PendingItem.sourceNodeId` 仍指向已不存在的节点；故事线删除后其 `chapterBindings`(JSON) 仍含失效 `chapterId`。 | 消费侧 `src/core/pipeline/context-loader.ts:57-58`（chapterSummary）、`:63-67`（storyBeat）按 `projectId` 拉取、`take:20/30` **不过滤 node 是否存在**，故删除章的孤儿摘要/转折点会持续注入后续每章写作上下文 → 误导 AI。复现：删任一章 → 其 ChapterSummary 仍存在且继续出现在其他章上下文。 | 将这四个引用改造成**真实外键 + `onDelete: Cascade`**（或删除节点时在事务内 `deleteMany` 关联行）；故事线删除时同步清理/标记失效的 `chapterBindings` 条目。 |
| L3-002 | P1 | `src/core/pipeline/post-processor.ts:566`(chapterSummary.create)、`:599`(storyBeat.create)；schema 无 `(projectId,chapterId)`/`(projectId,nodeId)` 唯一约束 | **同一章重新生成会累积重复 ChapterSummary / StoryBeat 行**。后处理管线每次生成都无条件 `create`，从不 upsert 或删除该章旧摘要/转折点。反复润色/重写的章会留下多条相同 `chapterId`/`nodeId` 的过期摘要。 | `context-loader.ts:57` 取 `take:20` 摘要，过期重复行挤占窗口、且可能被当成"前文摘要"注入；`ChapterSummary` schema 仅 `@@index([chapterId])` 无唯一约束，可无限重复。复现：对同一章写 3 次 → 3 条 chapterSummary、3 条 storyBeat。 | 改为 upsert（按 `projectId+chapterId`/`nodeId` 唯一约束），或在生成新摘要前 `deleteMany` 该章旧摘要/转折点。建议加 DB 唯一约束兜底。 |
| L3-003 | P1 | `src/core/pipeline/storyline-writer.ts:43-55`（writeStorylineProgress）；`src/core/pipeline/plan-chapter.ts:158-177`（applyChapterPlanToStorylines）；调用点 `src/app/api/generate/write/route.ts:142` 与后处理 step4 | **故事线 chapterBindings 读改写非原子，并发丢失更新**。两函数都 `findUnique` 读出 `chapterBindings` → JS push → 回写，无事务、无 `FOR UPDATE` 行锁。且 `write` 路由在生成前（line 142）调 `applyChapterPlanToStorylines`、后处理 step4 又调 `writeStorylineProgress`，**同一章写入内就对同一条故事线做了两次非原子改写**；并发写不同章（同 project 活跃故事线）时彼此覆盖。 | 两条绑定数据形状还不一致（`applyChapterPlanToStorylines` 写 `{order,focus,advance,...}`，`writeStorylineProgress` 写 `{element,chapterId,chapterOrder,note,at}`），混在同一数组进一步加剧解析脆弱。复现：两章并发生成 → 其中一条故事线的 bindings 只保留后写者的追加。 | 用乐观锁（`editVersion` 类比）或 `prisma.$transaction` + `$queryRaw FOR UPDATE` 串行化对同一条 Storyline 的改写；统一 bindings 数据结构。 |
| L3-004 | P1 | `src/lib/entity-auto-creator.ts:260-269`（内存快照查重）、`:350`/`374`（create）；schema `CharacterCard`/`LorebookEntry` 无 `(projectId,name)`/`(projectId,title)` 唯一约束 | **并发生成同 project 不同章会创建重复角色卡/世界书词条**。查重仅在调用开始时 `findMany` 拉一份已有名集合到内存，循环内用 `Set` 去重；无 DB 层唯一约束。两次并发后处理管线各自持有旧快照，都会把同一新实体 `create` 出来。 | schema `CharacterCard`(line 72-103)、`LorebookEntry`(line 107-130) 仅 `@@index([projectId])`，无唯一键，重复可落库。复现：同 project 两章并发写好 → 同一新地名出现两张 LorebookEntry。 | 在 `(projectId, name)` / `(projectId, title)` 加 `@@unique` 约束，配合 `create` 时捕获 `P2002` 转 skip；查重仍保留做减少重试。 |
| L3-005 | P2 | `src/core/pipeline/post-processor.ts:343/367/393`（"detected"/"fulfilled"/"partially_fulfilled"）；`src/core/pipeline/plan-chapter.ts:159`("active")；`src/core/confirm-guard.ts:161`("confirmed")；`src/core/pipeline/context-loader.ts:78/84`("pending"/"active")；`src/app/api/storylines/[id]/route.ts:58`("active") | **Storyline / PendingCommitment 状态枚举为散落硬编码字面量，无单一真相源**。StoryNode 状态已由 `src/core/story-status.ts` 常量化（良好），但故事线与伏笔承诺的状态字符串在多处直接写死。一旦枚举值改名，部分引用会静默失配（典型"死 literal 第二份手抄"残留）。 | `src/core/story-status.ts:21-29` 仅导出 StoryNode 状态；全仓检索未发现 Storyline/PendingCommitment 状态常量定义。 | 抽取 `STORYLINE_STATUS`、`COMMITMENT_STATUS` 常量并在所有写/读点引用，消除字面量漂移。 |
| L3-006 | P2 | `src/core/confirm-guard.ts:122-154`（先 `safeFillAfterWriting`）vs `:158-170`（后 `updateMany` 幂等守卫） | **applyConfirm 在幂等状态检查之前就执行了填表副作用**。若同一节点被并发/重复确认，第二次仍会先跑一遍 `safeFillAfterWriting`（虽填表自身有按名去重，仍属多余副作用与潜在双触发）。 | 代码顺序：line 122 填表 → line 158 才以 `updateMany where status in CONFIRMABLE_STATUSES` 做幂等拦截（count===0 跳过计数）。 | 将幂等状态判定前置；仅当真正会发生状态跃迁时才执行填表。 |
| L3-007 | P2 | `src/app/api/generate/write/route.ts:241-250`（草稿 fire-and-forget 未 await）；`src/core/confirm-guard.ts:283-290`(maybeAutoDeliver 读后写) | **写章草稿保存未 await + 同节点并发写竞态**。草稿保存走 `.then()` 不 await，流中途异常可能留 `[PARTIAL_DRAFT]` 节点未最终化；两并发写同一节点时 `combined=partialDraft+newContent` 互相覆盖丢失。另 `maybeAutoDeliver` 先读"是否全确认"再写 `confirmedAt`，两节点同时触发时各判断为可交付并各写一次（值相同，幂等但无锁）。 | write/route.ts:241 `prisma.storyNode.update(...).then(...)`；confirm-guard.ts:283 `findMany` → :290 `update`。 | 草稿保存改为 await 或纳入最终落库；同节点写入口加互斥（如 ImportCommitLock 同类 DB 锁思路）。 |
| L3-008 | P2 | `prisma/schema.prisma` 注释 `:51-53`；migrations 仅 3 个：`prisma/migrations/20260606*`；seed `prisma/seed.ts`（已幂等） | **Schema 演进依赖 `prisma db push`，破坏性字段变更可能静默丢数据/列**。项目仅有 3 个迁移文件且 schema 注释直接提及 "prisma db push 后旧数据是否兼容"，提示团队以 push 方式演进；push 遇类型不兼容会直接 drop 列/表，旧数据不可恢复。Seed 本身按 `type+title+isBuiltin` 查重，幂等良好（无问题）。 | 未验证实际部署是否用 push（标注"未验证"）；但代码与注释证据指向此风险。 | 改用 `prisma migrate dev/deploy` 受控迁移；确需 push 时对删列操作先做数据备份/手工迁移。 |
| L3-009 | P2 | `src/app/api/storylines/[id]/route.ts:98-103`（updateMany 重挂 + delete 非事务） | **故事线删除未包事务**。先 `updateMany` 把子线 parentId 重挂/置空，再 `delete` 主线；两步非原子。若 `updateMany` 失败，子线 parentId 仍指向即将被删的主线 → 悬空父引用（与 L3-001 同类但方向相反）。 | 代码顺序：line 98 `updateMany` → line 103 `delete`，中间无 `$transaction` 包裹。 | 用 `prisma.$transaction` 包裹重挂+删除；删除后清理引用该故事线的 `chapterBindings`。 |

## 三、已确认无问题的区域（诚实边界）

- **`continue` order 事务 + 空响应守卫**：round-7 已在 `src/app/api/generate/continue/route.ts:67-85` 用 `FOR UPDATE` 行锁 + 事务串行化并发续写，空响应回滚为 `outline_only`（line 219-229）。本次未见新竞态。✅
- **import/commit 幂等与原子性**：`src/app/api/import/commit/route.ts` 用 `ImportCommitLock`(projectId+nodeId 唯一约束, line 354 + 陈旧锁清理 line 348) 防并发双写；全部写库在 `prisma.$transaction`(line 572-691) 内、超时 120s、失败回滚；同批去重 `seenCharNames`/`seenLoreTitles`(line 439/518)。逻辑完整。✅
- **伏笔 detect 并发去重锁**：round-7 引入 `detectLocks` 进程内互斥（`src/core/confirm-guard.ts:203-259`），同 projectId 在途 detect 复用 promise，避免 O(C×S) 全量重算雪崩；`triggerForeshadowDetect` 带超时/重试。本次未发现新竞态。✅
- **Project 级 onDelete Cascade**：`CharacterCard/LorebookEntry/StoryNode/StoryBranch/ChapterSummary/StoryBeat/Storyline/StyleCard/Rule/PendingCommitment/GameSession/PendingItem/LoreTable` 均 `onDelete: Cascade`（schema 各 model 行 75/110/137/220/240/305/322/439/402/261/367/555/581）；`StoryNodeRevision`、`GameState` 也 Cascade（201/391）。**外键可达的子表删除安全**。✅（L3-001 的缺口恰是"非外键 String 引用"那几张表）
- **进度百分比计算无溢出**：`src/lib/storyline-progress.ts:31-57` 的 `elementPercent`/`chapterPercent` 均 `Math.min(100,...)` 后加权，`overallPercent` 上限 100，无浮点越界；`content.length`(Int) 与 `countTokens` 远在 PG `Int` 范围内，无 token 计数溢出。✅
- **seed 脚本幂等**：`prisma/seed.ts` 按 `type+title+isBuiltin` 查重跳过，可重复运行。✅

## 四、需 Chair 关注的跨透镜风险（可选）

1. **L3-001 的"孤儿摘要注入上下文"本质是"记忆正确性"问题**，与记忆/上下文透镜（L?）强相关：即使数据未"丢失"，陈旧/重复摘要会直接劣化后续章生成质量。建议 Chair 协调该透镜一并评估 `context-loader` 是否应按 `chapterId JOIN 现存节点` 过滤。
2. **L3-003/L3-004 的并发根因相同**：缺乏"业务键唯一约束 + 应用层冲突兜底"的统一范式。当前仅在 `continue` 与 `import/commit` 两处手工加了锁/唯一约束，其余多写路径（storyline、实体、节点）各自裸写。建议 Chair 推动一个统一的"写时并发护栏"模式（DB 唯一约束为主、行锁/`FOR UPDATE` 为辅），避免逐点补丁。
3. **浮点/整数**：本次未发现实际溢出，但 `fulfillmentRatio`(Float)、`qualityScore`(Float)、各 StyleCard 比率均为 `Float` 且多处由 LLM/本地算法写入，无范围断言（如 `clamp(0,1)`）。属健壮性盲区，可交"数值一致性"相关透镜。

---
**汇总**：发现 9 条（P1 ×4：`L3-001`/`L3-002`/`L3-003`/`L3-004`；P2 ×5）。最严重：`L3-001`（删节点不级联清理 String 引用子表，孤儿记录污染写作上下文）。
