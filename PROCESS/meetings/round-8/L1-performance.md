# 透镜 L1 性能与资源浪费审计（round-8 / v1.6.9）

> 基线：commit `fc5a662`（v1.6.9），分支 `main` 与 `origin/main` 一致。Working tree 干净（仅构建产物/运行态缓存，无源码改动）。
> 角色：只读深度审计员。本报告所有发现均带 `file:line`，未做、也无法验证的结论标注「未验证」。
> 已排除 round-7 已修复项（故事线状态机、IO 空守卫+导出 400、世界卡 PUT 白名单、伏笔面板实时刷新、监控 15s TTL），不再重复。

## 一、审计方法与范围

**读过的关键源码（含行号跳转）：**
- 生成入口：`src/app/api/generate/write/route.ts`、`src/app/api/generate/refine/route.ts`
- 编排：`src/core/agents/orchestrator.ts`（含 `buildPromptContext`、`writeSection`、`summarizeChapter`）
- 上下文加载：`src/core/pipeline/context-loader.ts`（`loadGenerationContext`）、`src/core/pipeline/outline-context.ts`（`loadOutlineData`、`filterActiveStorylines`、`formatStorylines`）
- 后处理管线：`src/core/pipeline/post-processor.ts`（`runPostGenerationPipeline`）
- 自动填表引擎：`src/core/babylore/loop.ts`（`buildRecallBlock`、`safeFillAfterWriting`）
- 确认/伏笔护栏：`src/core/confirm-guard.ts`（`applyConfirm`、`triggerForeshadowDetect`、`maybeAutoDeliver`）
- LLM 客户端与设置缓存：`src/core/llm/client.ts`、`src/lib/llm.ts`（`getSettings` 60s TTL、`recordLlmCall`）
- 记忆分级：`src/lib/memory-classifier.ts`（`classifyAndConvert`/`classifyEvents`）
- 分类器：`src/lib/world-category-classifier.ts`
- IO：`src/app/api/projects/[id]/export/route.ts`、`src/app/api/import/commit/route.ts`
- 会话：`src/lib/chat-sessions.ts`

**用过的命令（只读）：** `git log/rev-parse/status`、`find`（列出 api route）、`grep -rn`（前端 setInterval/addEventListener/虚拟化库/useMemo 计数）、`awk/sed`（确认 `classifyEvents` 对 characters 字段的实际用途）。未运行 `tsc`/`vitest`（避免与 Chair 统一跑产生竞态）。

---

## 二、发现清单

| ID | 严重度 | file:line | 问题描述 | 证据/复现 | 修复建议 |
|----|--------|-----------|----------|-----------|----------|
| L1-001 | **P0** | `src/core/pipeline/post-processor.ts:651-665` | **每次生成（write/continue）在 step 4.5 无上限全量读取 4 张表**，且随书长线性膨胀。其中 `characterCard.findMany` 读取**完整角色卡**（含 background/timeline/relationships/appearance 等重字段），`chapterSummary`/`storyBeat`/`pendingCommitment` 也无 `take`。长书（数百章、178 角色）每章都拉全量，内存/序列化随书长无界增长。 | 代码逐行确认：652、656、659、662 行四个 `await prisma...findMany({ where: { projectId } })` 均无 `take`；`classifyEvents`（memory-classifier.ts:50-55）仅用到 `name/role/arcProgress/currentStatus`，却传入全量重对象。write 路由 `skipSummarize` 默认 false → 该段必跑。 | 1) 仅 `select` 必要字段（字符卡只需 id/name/role/arcProgress/currentStatus）；2) 全量读取改为「仅取最近 N 章摘要 + 全量但窄列」或缓存；3) chapterSummary/storyBeat 加 `take` 上限并按时间窗过滤。 |
| L1-002 | **P1** | `src/core/pipeline/context-loader.ts:52-55` | **`loadGenerationContext` 加载角色卡与世界书无 `take` 上限**。对比同文件引用的 `loadOutlineData`（`outline-context.ts:46` 已有 `take:50`），此处 `characterCard.findMany({ where:{projectId} })` 与 `lorebookEntry.findMany({where:{projectId,enabled:true}})` 全量返回，每次生成都搬运角色全集+世界书全集。 | 52 行、`53-55` 行确认无 `take`；`loadOutlineData` 第 46 行有 `take:50` 可作为对照。 | 与 `loadOutlineData` 对齐加 `take`；或按「调度所需子集」做投影查询（参考 orchestrator 内 `scheduledNames` 仅取 ~50 人）。 |
| L1-003 | **P1** | `context-loader.ts:52` × `post-processor.ts:662` | **同一请求内角色卡全集被加载两次**。`loadGenerationContext` 已全量拉取 `characters`（无 take），后处理 step 4.5 又独立 `prisma.characterCard.findMany` 全量再拉一次完整卡（且未复用前者）。单章生成搬运两份完整角色全集。 | 两处均 `findMany({where:{projectId}})` 全量；`context-loader` 返回的 `data.characters` 完全可传给 step 4.5，却被弃用另查。 | 把 `data.characters`（或窄列投影）直接传入 `classifyAndConvert`，删除 post-processor 662 行的重复查询。 |
| L1-004 | **P2** | `src/core/pipeline/post-processor.ts:652,656,659,662` | **step 4.5 四个互相独立的 `await` 查询顺序串行执行**，本可合并为单次 `Promise.all` 并发，省 3 次 DB 往返。 | 四个 `const x = await prisma...findMany(...)` 独立、无依赖，逐行串行。 | `const [allSummaries, allBeats, allCommitments, allCharacters] = await Promise.all([...])`。 |
| L1-005 | **P2** | `src/app/api/generate/write/route.ts:149` | **重复读 project**：`loadGenerationContext` 已 `findUnique` 加载 `project`（context-loader.ts:32），write 路由又在 149 行单独 `prisma.project.findUnique({select:{llmConfig:true}})` 再查一次同一条记录。 | 149 行确认额外 `findUnique`；`data.project` 已含该字段。 | 用 `data.project.llmConfig` 代替独立查询（refine 路由 122 行同理可并入 loadGenerationContext 投影）。 |
| L1-006 | **P2** | `src/core/pipeline/post-processor.ts:566,634,684` | **刚 insert 的 ChapterSummary 又两次 `findFirst` 重查**。566 行 `create` 后，4.1（634 行）与 4.5（684 行）各自再 `findFirst({where:{projectId,chapterId:nodeId},orderBy:{createdAt:'desc'}})` 取回刚写的记录，未复用 `create` 返回值。 | 566 行 create 返回值含 `id`；634、684 行仍重查。 | 缓存 566 行 create 返回对象，后续直接用其 `id` 做 update。 |
| L1-007 | **P2** | `src/core/pipeline/post-processor.ts:326-415` | **step 3.6 伏笔循环内串行 `await`**：`for (const fe of foreshadowEvents)` 内对每个事件 `await prisma.pendingCommitment.create/findUnique/update`（去重后数量有限，但仍是串行）。 | 326 行起 `for...of` + 内部 `await`。新建类（create）彼此无依赖可并发；更新类需先 `findUnique` 校验状态。 | 新建批次用 `Promise.all`；或整体改为「先一次性读全部 matched 伏笔再批量 updateMany」。 |
| L1-008 | **P2** | `src/core/agents/orchestrator.ts:208-211` | **`writeSection` 远楼层摘要串行 await**：`for (const floor of distantFloors) { await summarizeDistantFloor(...) }` 每个远楼层一次 LLM 调用串行执行，可并发。 | 208-211 行 `for...of` + `await`。 | 改为 `await Promise.all(distantFloors.map(f => summarizeDistantFloor(client, f, model)))`。 |
| L1-009 | **P2** | `src/app/api/projects/[id]/export/route.ts:47-50,165-175,242,263` | **导出为低频一次性**：①47-50 行 `storyNode.findMany` 无 `take` 且拉全量 `content`（导出本质需全本，可接受，但超大书整本入内存）；②`buildMarkdownNode/buildTextNode` 递归中对每个节点执行 `allNodes.filter(n=>n.parentId===node.id)`，整棵目录树重建为 **O(N²)** 数组扫描。 | 242、263 行 `allNodes.filter` 在递归内逐节点调用。 | 一次性导出可接受；树重建可先建 `childrenMap`（一次 O(N)）再遍历，消除 O(N²)。 |
| L1-010 | **P2** | `src/app/api/import/commit/route.ts:383-387,507-510` | **导入预加载全量角色卡/世界书**（无 `take`）。导入属低频一次性操作，影响有限；事务内 `for` 循环 `await tx.characterCard.update`（609-630、638-656）为串行，但受批量与 deadline 约束。 | 383-387、507-510 行全量 `findMany`；609 起嵌套 `for`+`await`。 | 低频可暂缓；若需优化，导入期可加 `take` 或窄列投影。 |
| L1-011 | **P2** | `src/lib/world-category-classifier.ts:117-118` | **内层热循环重复 `kw.toLowerCase()`**：`for (const kw of KEYWORDS[cat])` 内每次 `t.includes(kw.toLowerCase())`，对每个关键词每次调用都分配一个新的小写副本（KEYWORDS 为静态中文串，小写本为 no-op 却仍产生字符串分配）。自动填表每实体分类都会跑 15×~15 次。 | 117-118 行 `kw.toLowerCase()` 在双重循环内；`KEYWORDS` 为字面量。 | 预计算 `LOWER_KEYWORDS`（模块级一次小写化），循环内只读。 |
| L1-012 | **P2** | `src/lib/llm.ts:264-285` | **`recordLlmCall` 每次 LLM 调用 fire-and-forget 写一行 `llmCallLog`**（含重试/故障转移的失败记账）。单章生成含 write/summarize/review/distant/recall/auto-fill 多次 LLM 调用，每次都额外一次 INSERT，写入放大。 | 264 行 `void prisma.llmCallLog.create(...)` 每次调用触发；失败静默。 | 批量合并（如每请求攒一批 `createMany`），或仅在采样率下记账；非阻断故为 P2。 |
| L1-013 | **P2（需 UI 透镜复核）** | 前端 `src/components/workspace/*`、`src/app/workspace/[projectId]/page.tsx` | **全仓无任何虚拟列表库**（grep `react-window|react-virtuoso|@tanstack/react-virtual` 无命中）。长书场景下章节列表、角色列表（CharacterList/CharacterGroupList）、世界书列表若一次性渲染全部节点，存在渲染浪费/卡顿风险。`useMemo` 仅 21 处，重列表组件 memo 覆盖未经专项核查。 | grep 确认无虚拟化依赖；`CharacterList.tsx`/`CharacterGroupList.tsx` 等为大列表组件。 | 标记为「需 Chair 关注/交 UI 透镜」：对超长列表引入虚拟滚动或分页加载，并对重行组件补 `React.memo`。 |

---

## 三、已确认无问题的区域（诚实边界）

- **AppSettings 热路径缓存**：`getSettings()`（`src/lib/llm.ts:64-66`）已实现 60s TTL 内存缓存，每次生成经 `fromSettings→getEffectiveConfig→getSettings` 不会每次查库。**非**热路径重复读问题。（注：监控 15s TTL 为 round-7 已修，不重复计入。）
- **伏笔 detect 并发护栏**：`triggerForeshadowDetect`（`confirm-guard.ts:203-259`）已设进程内 `detectLocks` 互斥，并发确认/生成触发 detect 会复用在途 promise，规避 round-7 指出的 O(C×S) 全量重算雪崩。✓（但 detect 本身依赖 detectPayoffs 的全量重算，属「已收敛」，未展开。）
- **前端定时器/监听器清理**：全仓 `setInterval`/`addEventListener` 均有对应清理——`dissect/page.tsx:37`、`workspace/[projectId]/page.tsx:351`、`ImportWizard.tsx:207`、`AIChatBar.tsx:53`、`CommandPalette.tsx:49-50`、`ShortcutProvider.tsx:114`、`Modal.tsx:98`、`ForeshadowingPanel.tsx:171`、`use-focus-trap.ts:77` 等均在 cleanup 中 `clearInterval`/`removeEventListener`。**未发现 useEffect 未清理 / setInterval 未 clear / EventTarget 监听泄漏**。`chat-sessions.ts:90-99` 的模块级 `setInterval` 是**有意**的「每 5 分钟清理过期会话」，非泄漏。
- **`loadOutlineData` 已带 `take:50`**（`outline-context.ts:46`），说明分页意识存在——反衬 `loadGenerationContext`（L1-002）的缺失是遗漏而非设计选择。
- **导出/导入**：均为用户触发的一次性批量操作，全量读取属设计预期；仅 O(N²) 建树（L1-009）与未分页投影（L1-010）为次要优化点。

---

## 四、需 Chair 关注的跨透镜风险

1. **L1-001/L1-002/L1-003 叠加 = 长书「每章生成内存墙」**：角色卡全集在单次生成中被拉取 **2 次**（context-loader 全量 + post-processor 4.5 全量），且 post-processor 4.5 还额外全量拉 summary/beat/commitment。三者随书长**无界增长**，是 round-7 已修「伏笔 detect 长书内存」的平行隐患。建议在 L1 收口后再做一次「单章生成 DB 读取总量」压测，确认 500+/1000+ 章时不会打爆 Node 内存或拖垮 PG。
2. **L1-013 前端无虚拟化**，若任一透镜发现「长书端崩溃/卡死」，很可能与大列表未虚拟化相关，建议与 UI 透镜联动核查 `CenterPanel`/`CharacterList` 等重列表的渲染开销。
3. **`recordLlmCall` 写放大（L1-012）** 长期会撑大 `llmCallLog` 表，建议补定期归档/清理策略（非本次崩溃级，但属资源浪费累积）。
