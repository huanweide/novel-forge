# 路A 执行报告（L1 性能 + 摘要去重）

> 执行者：代码执行 Agent（路A）
> 审计基线：v1.6.9（commit fc5a662）
> 改动文件（独占，未碰其他路文件）：
> 1. `src/core/pipeline/post-processor.ts`
> 2. `src/core/pipeline/context-loader.ts`
> 3. `src/app/api/projects/[id]/export/route.ts`
> 4. `src/lib/world-category-classifier.ts`

## 一、逐条实施清单

### 1. post-processor.ts（对应 L1-001 / L1-003 / L1-004 / L1-006 / L3-002）
- **4.5 段（原 651-672）窄列 select + take + 并发**：四个 `findMany` 改为 `Promise.all` 并发（L1-004）。各加 `select` 与 `take`：
  - chapterSummary：`select {id, chapterId, chapterTitle, summary, keyEvents, eventImportances}` + `orderBy createdAt desc` + `take:50`（L1-001）。
  - storyBeat：`select {id, nodeId, description, chapterNumber, impact}` + `take:60`。
  - pendingCommitment：`select {id, sourceNodeId, status, description}` + `take:30`。
  - characterCard：**保留该独立查询**（按要求未删），`select {id, name, role, arcProgress, currentStatus}` + `take:50`（L1-003/L1-001）。函数签名未改。
- **摘要去重（L3-002）**：写 ChapterSummary 前 `deleteMany({where:{projectId, chapterId:nodeId}})`；写 StoryBeat 前 `deleteMany({where:{projectId, nodeId}})`。
- **复用 create 返回（L1-006）**：566 行 `chapterSummary.create` 返回值存入 `createdSummary`；4.1 标题回写（原 634 的 `findFirst` 重查）与 4.5 的 `eventImportances` 回写（原 684 的 `findFirst` 重查）均改用 `createdSummary.id`，删除两处重复查询。

### 2. context-loader.ts（对应 L1-002；L1-005 属路E 不在此处理）
- `characterCard.findMany` 与 `lorebookEntry.findMany` 加 **`take:50`**（对齐 `loadOutlineData`，L1-002 核心修复）。
- **未做窄列 select**（见下方「需汇报事项②」）。

### 3. export/route.ts（对应 L1-009）
- 在 `allNodes` 定稿后一次性构建 `childrenMap: Map<string, any[]>`（O(N) 遍历）。
- 目录生成（原 `allNodes.filter(n=>n.parentId===root.id)`）与 `buildMarkdownNode` / `buildTextNode` 递归内均改为查 `childrenMap.get(node.id)`，消除 O(N²)。两函数签名由 `allNodes` 改为 `childrenMap`，调用处同步更新。

### 4. world-category-classifier.ts（对应 L1-011）
- 模块级预计算 `LOWER_KEYWORDS: Record<WorldCategory, string[]>`（KEYWORDS 每项 `toLowerCase()` 一次）。
- 主分类循环与「最长词」判定循环改用预计算小写值，去掉循环内 `kw.toLowerCase()` 分配。

## 二、需汇报事项（重大冲突，已按需处置并停止原样落地）

- **① post-processor 的 summary/beat/commitment select 字段名与 schema 不符**：用户所给字段中，`ChapterSummary` 实际无 `content`/`order`/`nodeId`（真实文本字段是 `summary`，无 order/nodeId 列）；`PendingCommitment` 无 `type`/`content`；`StoryBeat` 的文本字段是 `description` 而非 `content`。若照搬会 (a) `tsc` 报错（select 含不存在字段），(b) 运行期 `classifyEvents`（memory-classifier.ts）失效——它依赖 `s.chapterTitle/summary/keyEvents/eventImportances`、`c.status/description`、`b.impact/chapterNumber/description`。**处置**：改用符合 schema 且 `classifyEvents` 实际消费的字段实现窄列意图；character 窄列 `{id,name,role,arcProgress,currentStatus}` 原样保留（classifyEvents 仅用这些）。**未擅自大改**，仅纠正字段名。请 Chair 知悉此命名偏差。

- **② context-loader 窄列 select 无法落地（重大冲突，已停止该子句）**：用户要求 characters 仅 `{id,name,role,arcProgress,currentStatus}`、lorebook 仅 `{id,title,category,content}`。但下游消费方实际读取更多字段：
  - `data.characters` → 编排器 `buildPromptContext`（orchestrator.ts:1385/1396/1404/1418/1427 等）读取 `background/aliases/personality/dialogueStyle/appearance/storyLine/timeline/relationships`，且 `pre-processor.ts` 还传给 `handleNewCharacters`；
  - `data.loreEntries` → `matchLoreEntries`/`recall.ts` 读取 `keys`/`depth`/`insertionOrder` 做触发匹配。
  若按指令窄列，会破坏生成 prompt 与 lorebook 触发功能。**处置**：仅加 `take:50`（L1-002 核心修复），保留完整字段，确保不破坏现有导出。是否进一步投影需同步改造下游消费方，超出路A 独占范围，建议 Chair 决策后由相应路处理。

- **③ take:50 行为提示**：超大角色集（如 178 角色）下，context-loader 只加载最近 50 张角色卡，`buildPromptContext` 的“全量花名册”会被截断为 50 人。这是 SOLUTIONS 已确认的取舍（对齐 loadOutlineData 的 take:50），提示注意而非问题。

## 三、验证
- `tsc --noEmit` 对 4 个目标文件零错误（仅做只读类型检查，未跑全量 tsc/vitest 以免与 Chair 竞态）。
- 现有单测：`world-category-classifier.test.ts` 的改动为纯性能优化（行为等价，仅去掉循环内 `toLowerCase` 分配），预期仍通过；post-processor/context-loader/export 无对应单测覆盖，未调整测试。
- 未改动任何导出签名与跨路文件（generate/*、import/*、story/*、globals.css、settings 等均未触碰）。

## 四、结论
改动文件数：4。是否需汇报：**是**（事项①②为重大冲突，已停止原样落地并改以兼容方案实施，需 Chair 知悉/决策）。
