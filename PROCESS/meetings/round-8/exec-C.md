# 路C 执行报告（L3 数据完整性与并发）

> 执行 Agent：代码执行 Agent（路C）
> 基线：v1.6.9（commit `fc5a662`）
> 验证：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 零错误（全量，未跑 vitest，由 Chair 统一跑）
> 范围：独占修改 7 文件，未触碰 `schema.prisma` 物理结构（遵循 L3-008 约束，全部走应用层）

## 一、改动文件清单（逐条对应 ID）

### 1. `src/app/api/story/nodes/[id]/route.ts`
- **函数**：`DELETE` handler（约 270–297）
- **对应 ID**：L3-001
- **改动**：删除节点包 `prisma.$transaction`——先 `deleteMany` 关联孤儿（`chapterSummary` by `chapterId`、`storyBeat` by `nodeId`、`pendingCommitment`/`pendingItem` by `sourceNodeId`，覆盖被删节点**及其子节点**），再 `deleteMany` 子节点 + `delete` 节点本身。杜绝删章后孤儿摘要/转折点继续注入写作上下文。
- **是否需汇报**：否

### 2. `src/app/api/storylines/[id]/route.ts`
- **函数**：`DELETE` handler（约 85–110）
- **对应 ID**：L3-001 / L3-009
- **改动**：重挂子线 `updateMany` + 主线 `delete` 包 `prisma.$transaction`（原子，避免重挂失败后子线 `parentId` 悬空）。
- **⚠️ L3-009 子项「删除后清理引用该故事线的 chapterBindings（扫描 storyNode 的 bindings）」无法落地**：
  经核查 `prisma/schema.prisma`，`StoryNode` 模型**没有 `bindings` 字段**（仅 `Storyline.chapterBindings` 存在，且条目只引用自身所属故事线的 `chapterId`，不存在跨故事线引用）。该清理在当前 schema 下无对应物理存储。
- **是否需汇报**：**是**（L3-009 的 bindings 清理子项 N/A，需 Chair 裁决：要么给 `StoryNode` 增加 `bindings` 字段，要么从方案中移除该子项）

### 3. `src/core/pipeline/storyline-writer.ts`
- **函数**：`writeStorylineProgress`
- **对应 ID**：L3-003 + L3-005
- **改动**：
  - 导出统一 `ChapterBinding` 形状 `{storylineId, chapterId, chapterOrder, element, focus, advance, note, at}`；本函数写入同形状（其余字段补默认空值）。
  - 每条故事线读改写包 `withStorylineLock(storylineId)` 串行化，消除并发写不同章时的丢失更新。
  - `sl.status !== "active"` → `STORYLINE_STATUS.ACTIVE`。
- **是否需汇报**：否

### 4. `src/core/pipeline/plan-chapter.ts`
- **函数**：`planChapterStoryline`（过滤）、`applyChapterPlanToStorylines`
- **对应 ID**：L3-003 + L3-005
- **改动**：
  - 统一写入 `ChapterBinding` 同形状（原写 `{order, focus, advance, obstacle, twist}`，现已归一）。
  - `applyChapterPlanToStorylines` 对每条故事线在 `withStorylineLock` 内**重新读取最新 bindings** 后回写，避免基于调用开始时过期快照的丢失更新；与 `writeStorylineProgress` 因同一 `withStorylineLock` 串行化，满足「两次非原子改写按 storylineId 串行化」要求。
  - `status: "active"` → `STORYLINE_STATUS.ACTIVE`（两处）。
- **是否需汇报**：否

### 5. `src/lib/entity-auto-creator.ts`
- **函数**：`autoCreateEntities`（写入前查重循环）
- **对应 ID**：L3-004
- **改动**：
  - 写入前**二次查重**：`characterCard.findFirst({projectId, name})`、`lorebookEntry.findFirst({projectId, title})`，命中则 skip（捕捉调用开始时快照之外的并发新建）。
  - `create` 的 `try/catch` 显式捕获 `Prisma.PrismaClientKnownRequestError` code `P2002` 转 skip（为后续加唯一约束兜底）。
  - 保留内存 `Set` 去重减少重试。
- **是否需汇报**：否

### 6. `src/core/story-status.ts`
- **导出**：新增常量 + 护栏
- **对应 ID**：L3-005（并支撑 L3-003）
- **改动**：
  - 新增并导出 `STORYLINE_STATUS = {ACTIVE, ABANDONED, COMPLETED, PAUSED}` 与 `COMMITMENT_STATUS = {PENDING, DETECTED, FULFILLED, PARTIAL}`。
  - 新增 `withStorylineLock(storylineId, fn)`——per-storylineId 进程内互斥护栏（与 `confirm-guard` 的 `detectLocks` 同思路），供 L3-003 跨函数（storyline-writer / plan-chapter）串行化同一条故事线的读改写。
- **是否需汇报**：否

### 7. `src/core/confirm-guard.ts`
- **函数**：`applyConfirm`
- **对应 ID**：L3-006 + L3-005
- **改动**：
  - L3-006：幂等判定前置——先 `findUnique` 取 `status`，若不在 `CONFIRMABLE_STATUSES` 直接返回「幂等跳过，未触发填表/计数」；**仅当确认会真正跃迁（count>0 等价）才执行 `safeFillAfterWriting` 副作用**。
  - L3-005：`status: "confirmed"` → `STATUS_CONFIRMED`（该常量已导入）。
- **是否需汇报**：否

## 二、L3-005 全仓字面量替换
以下 5 文件中的 `active` / `completed` / `confirmed` / `pending` 字面量已替换为对应常量：
`storyline-writer.ts`、`plan-chapter.ts`、`confirm-guard.ts`、`context-loader.ts`、`storylines/[id]/route.ts`。
- 注：`context-loader.ts` 同为路A 文件，但其状态字面量（:78 `pending` / :84 `active`）不在路A 方案改动范围内，本次替换无行级冲突。

## 三、约束遵守
- ✅ 未改 `schema.prisma` 物理结构（L3-008），全部修复走应用层。
- ✅ 仅改上述 7 文件。
- ✅ `tsc --noEmit` 零错误；事务语法自洽；未破坏现有导出（`STORYLINE_STATUS`/`COMMITMENT_STATUS`/`withStorylineLock` 均 `export`）。

## 四、是否需汇报
**需汇报 1 项**：L3-009 中「删除后清理 storyNode 的 chapterBindings」子项因 `StoryNode` 无 `bindings` 字段无法落地（见第 2 项 ⚠️）。其余 L3-001 / L3-003 / L3-004 / L3-005 / L3-006 均已落地，无需汇报。
