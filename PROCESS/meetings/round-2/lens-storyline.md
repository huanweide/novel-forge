# 故事线量化联动透镜 · round-2 深度体验报告

> **Agent 代号**：故事线量化联动透镜
> **轮次**：round-2
> **版本**：v1.6.4（HEAD = `2b88e09`，commit「feat: v1.6.4 故事线支线联动 UI + 数据化（#651）+ #652 标记完成」）
> **日期**：2026-08-07
> **项目绝对路径**：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
> **透镜职责**：故事线进度量化 + 支线联动 UI + 融入写作深度体验
> **验证手段**：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit`（0 错）、`SAFE_DELETE_DISABLE=1 npx vitest run`（238/238 通过）、`git show 2b88e09` 真实 diff 核对、`prisma/schema.prisma` 与 `deploy-local.ps1` 核查、源码逐行阅读。沙箱无 Chromium，纯视觉降级为「源码 + API/SSR 行为推演 + 关键路径单测」。

---

## 〇、本轮聚焦结论速览（诚实边界）

v1.6.4 的「支线联动 UI + 数据化（#651）」在**渲染层**是真实生效的：作者用 AI 生成故事线后，支线卡片确实会显示「隶属主线：X」并带 `ml-3` 缩进竖线；主线卡片确实聚合了「支线联动 N 条 · 均 X% · 综合 Y%」。`GET /api/storylines` 返回全字段（含 `parentId`），`generate` 路由确实把支线 `parentId` 挂到了主线 id——**链路是通的**。tsc 零错误、238 测试全绿，质量门禁没破。

但本轮也确认了**两类真问题**，均基于真实代码，非臆测：

1. **数据化只到 UI，没到「写作大脑」**：v1.6.4 的 `parentId` 联动与 v1.6.3 的进度量化，注入写作 `systemPrompt` 的 `formatStorylines` 里**既不呈现隶属关系、也不呈现量化百分比**。AI 写章时看到的是一堆扁平的「【剧情线：X】（支线）」加七要素文本，并不知道某条支线服务于哪条主线、各线推进到百分之几。用户担心的「还是各写各的」在「跨线协调」维度上**确实部分成立**。
2. **缝合怪 newMain 流的 parentId 错挂**：`generate` 路由用 `existingStorylines.find(s => s.type === "main")?.id` 初始化 `mainId`，会把**已完结的旧主线**当作父，导致新主线旗下的支线被误挂到旧主线——这是 v1.6.4 联动逻辑里最硬的一处缺陷（P1）。

下文分两栏展开：左侧「用户体验视角」按作者真实操作流逐帧还原，右侧「总体视角」从架构质量收口。

---

## 一、用户体验视角（真实操作流逐帧还原）

> 本栏约 5,800 字。所有「作者看到/感到」均锚定到具体组件渲染代码与 API 行为；凡涉及 AI 实际输出之处，已显式标注「源码推演」与「需真机 LLM 验证」。

### 1.1 入口：作者如何触达故事线面板

作者进入 `workspace/[projectId]` 页，右侧工作区挂载 `StorylineList`（`src/components/workspace/StorylineList.tsx:34`）。组件挂载即 `useEffect` 触发 `load()`，向 `GET /api/storylines?projectId=...` 拉取全部故事线（`StorylineList.tsx:45-57`）。该 GET 路由（`src/app/api/storylines/route.ts:10-23`）用 `findMany({ where: { projectId }, orderBy: [{ type: "asc" }, { order: "asc" }] })` 返回**所有状态**的故事线（含 active/completed/abandoned），是「全量返回」而非「仅活跃」。这意味着前端拿到的是项目里所有故事线，包括已完结、已废弃的。

**体验判读**：作者打开面板，第一眼看到的是工具栏右上的「全屏」「AI生成」两枚按钮（`StorylineList.tsx:164-177`），左上是「N 条故事线」计数。若项目从未生成，则渲染 `EmptyState`「还没有故事线」+「点击 AI 自动生成」（`StorylineList.tsx:259-270`）。这个空态引导是清晰的。

### 1.2 第一次生成：AI 一键出主线 + 支线

作者点「AI生成」→ `handleGenerate` 调 `POST /api/storylines/generate`（`StorylineList.tsx:65-81`）。后端 `generate/route.ts` 先用 `completeText` 让 LLM 基于项目总纲/角色卡/世界书设计事件线（system 提示词要求每条线含七要素，且「支线必须服务于主线的阻碍或转折」，`route.ts:30-58`）。

拿到 JSON 后，v1.6.4 的新逻辑开始发力（`route.ts:118-165`）：
- 先按 `l.type === "main"` 拆出主线、其余归支线（`route.ts:119-120`）；
- **先建主线**拿 id，再建支线把 `parentId` 挂到主线（`route.ts:148-164`）；
- `order` 基于 `existingStorylines` 的最大 order 递增（`route.ts:116`、`:161`）。

生成成功后前端 `setStorylines(data.storylines)`，并 `toastCreated(mainTitle, "故事线")`（`StorylineList.tsx:75-77`）。

**真实体验还原（源码推演）**：假设项目是修仙文、从未有故事线，AI 返回 1 主线 + 4 支线。后端先 `create` 主线（拿到 `mainId`），4 条支线 `parentId=mainId` 落库。前端收到 5 条记录，`mainLine = find(type==="main")` 命中主线，`sideLines` 命中 4 条支线。`resolveParent(s)`（`StorylineList.tsx:137-143`）对每条支线：其 `parentId` 命中主线 → 返回主线 → `belongsMain=true`。于是 4 张支线卡片渲染成 `ml-3` 缩进 + `border-l-2 border-l-[var(--nv-accent)]` 的竖线（`StorylineList.tsx:228`），并在卡片内显示「🔗 隶属主线：{主线标题}」（`StorylineList.tsx:240-244`）。主线卡片则在其进度条下方渲染「🔗 支线联动 4 条 · 均 X%」+ 一条综合进度条（`StorylineList.tsx:200-216`）。

**这一帧是 v1.6.4 的高光时刻**：作者肉眼可见「主线聚合旗下支线」「支线缩进挂在主线下方」，数据化联动在 UI 上是真的、是准的。旧版本（v1.6.3 及之前）支线是平铺的，没有隶属关系表达——这一改观确实解决了「支线服务于主线」的可视化诉求。

### 1.3 进度条：作者怎么看「这条线写到哪了」

每张卡片下挂 `StorylineProgressBar`（`StorylineList.tsx:331-348`），调用 `computeStorylineProgress(s)`（`src/lib/storyline-progress.ts:31-57`）算出 `overallPercent`，展示「七要素 2/7 · 已绑定 3 章」+ `37%` 这样的标签（`storyline-progress.ts:46`）。

算法本身（`storyline-progress.ts`）我逐行核对并跑了单测（`storyline-progress.test.ts`，5/5 通过）：
- 七要素任意非空记 1 分，`elementPercent = round(filled/7*100)`（`:32-36`）；
- 章节进展取 `chapterBindings.length`，以 `EXPECTED_CHAPTERS_PER_STORYLINE=12` 封顶 100%（`:19`、`:38-43`）；
- 综合 `overallPercent = round(elementPercent*0.6 + chapterPercent*0.4)`（`:45`）。

边界已覆盖：空故事线全 0、七要素全填无章节=60%、20 章封顶 100%、`chapterBindings` 为非数组不报错（单测 4、5 验证）。**进度算法在边界上是稳的，这点要给 v1.6.3 的 authors 记功。**

**但体验上的「真实感」依赖 chapterBindings 是否真的被回填。** 我追了写入链路：
- `src/core/pipeline/storyline-writer.ts:27-60` 在每章写完后，由 orchestrator 的 `threadProgress` 回写——仅当 `impactScore>=4`（只记大事）、仅 active 线、stage 在七要素白名单内，才把一句话 `note` 覆写七要素并 push 进 `chapterBindings`（`:46-54`）；
- 抽卡「采用此路线」也会写 `chapterBindings`（含 `element:"preset"`，非七要素）；
- `plan-chapter.ts:150-175` 也按七阶段绑定。

**真实体验陷阱**：如果作者只「生成」了故事线、但还没开始写章/抽卡，`chapterBindings` 是空数组 → 进度条里「已绑定 0 章」、`chapterPercent=0`，`overallPercent` 只剩七要素那 60%。作者此时看到主线进度可能只有 30%~60%，会误以为「进度偏低=没写好」，其实是「还没推进」。这是算法与认知的错位，但不算 bug，属 UX 提示不足。我把它列为 P3（F10）。

### 1.4 主线卡片的「综合联动进度」：作者看到的数字是怎么算的

这是 v1.6.4 新增的核心聚合。代码在 `StorylineList.tsx:144-154`：
- `childLines` = 所有支线中 `resolveParent(s)?.id === mainLine.id` 的子集（`:144-146`）；
- `childAvg` = 这些支线 `overallPercent` 的算术平均（`:147-152`）；
- `mainProgress` = 主线自身 `overallPercent`（`:153`）；
- `combinedProgress = round(mainProgress*0.7 + childAvg*0.3)`（`:154`）。

**体验判读**：作者看到主线卡片写着「支线联动 4 条 · 均 45% · 综合 52%」。数字直观，且 0.7/0.3 的权重暗含「主线权重高于支线均值」，符合「主线为主、支线为辅」的叙事直觉。

**但这个数字有一处作者看不见的脆弱点**（详见 F4）：`childLines` 只按 `mainLine`（即 `storylines.find(type==="main")` 的**第一条**主线）聚合。如果项目里意外存在两条主线（例如缝合怪 newMain 流触发后旧主线没被清掉、或作者手动建了第二条主线），那么**第二条主线旗下的支线不会出现在任何聚合里**，且若这些支线 `parentId=null`，还会被 `resolveParent` 的回退逻辑（`:142`）误并入第一条主线的 `childLines`。作者看到的综合进度其实是「第一条主线 + 它名下（含误并入）支线」的局部视图，并非全局。多主线是边缘场景，但 v1.6.4 的聚合逻辑对它不是安全的。

### 1.5 写章时 AI 是否真「感知」故事线：最关键的一帧

这是本轮透镜最该回答的问题。还原链路：
1. 作者在某章点「写正文」→ 走 `orchestrator.buildPromptContext`（或 `context-loader.loadGenerationContext` + `outline-context.formatStorylines`）；
2. `context-loader.ts:69-72` 查 `prisma.storyline.findMany({ where: { projectId, status: "active" } })`——**只取 active 线，completed/abandoned 不注入**；
3. `orchestrator.ts:679-681` 对这些线再做 `!s?.completed` 过滤（冗余，因为上一步已只取 active），拼成 `storylineBlock`，标题写「## 故事线进度（必须持续推进，避免偏离主线/支线设定）」；
4. 真正的格式化在 `outline-context.formatStorylines`（`outline-context.ts:71-85`）：逐条输出 `【剧情线：标题】（主线/支线）`、description、非空七要素 `标签:内容`。

**关键发现（F2/F6）**：这个注入块**只给了「标题 + 主线/支线标签 + 七要素文本」**，**没有给**：
- 任何支线的 `parentId` / 「隶属主线：X」关系——所以 AI 知道某条是支线，但**不知道它服务于哪条主线**；
- 任何 `overallPercent` / 量化进度——标题叫「故事线进度」，内容却是七要素原文，AI 无从判断「这条线推进到百分之几、该不该在这章收束」。

也就是说：v1.6.4 的 `parentId` 数据化，**止步于 UI 渲染层，没有传导到写作 LLM 的上下文**。AI 写章时看到的是一堆扁平故事线，`route.ts:43` system 提示里虽然写了「支线必须服务于主线的阻碍或转折」，但那是生成故事线时的指令，不是写章时的指令；写章时的 `storylineBlock` 没有任何「请让这条支线呼应主线 X 的阻碍」之类的话术。

**真实体验结论（诚实标注）**：
- AI 确实「看得到」所有 active 故事线的七要素设定，所以「各写各的、完全无视故事线」的情况**不会发生**——它至少会照着七要素推进；
- 但「跨线协调」「支线主动服务主线」「按进度决定收束时机」这三件事，因为隶属关系与进度数字没进 prompt，**AI 靠的是自己从七要素文本里猜**，不可靠。用户原始担心「还是各写各的」在「协同」维度上**部分成立**，需真机 LLM 对照实验最终定性，但源码层面已确认注入信息缺失。

### 1.6 打勾完结与缝合怪：联动在状态流转后的表现

作者点主线卡片右侧圆圈 → `handleToggleComplete` 切 `active↔completed`（`StorylineList.tsx:97-110`）。PUT 到 `/api/storylines/[id]`（`[id]/route.ts:18-77`）。若该线是主线且被标记完成，后端触发缝合怪：若项目无其他 active 主线，则 `fetch(/api/storylines/generate, { mode: "newMain" })` 异步构造新主线（`[id]/route.ts:47-71`）。

**真实体验还原（正是 F1 的爆发点）**：旧主线标记完成 → 缝合怪触发 `generate(mode:"newMain")` → 后端 `generate/route.ts:123-124` 用 `existingStorylines.find(s => s.type === "main")?.id` 取 `mainId`。此时 `existingStorylines` 是**全量**（无 status 过滤），必然命中那条**刚完结的旧主线** → `mainId = 旧主线 id`。随后主线循环创建新主线，但 `if (!mainId) mainId = m.id`（`route.ts:154`）**不会执行**（mainId 已非空）→ 新主线没接管 `mainId`。最后支线循环把 `parentId = mainId`（旧主线）挂上（`route.ts:161`）。

结果：新主线旗下的 4 条支线，全被挂到**已完结的旧主线**下。UI 上：
- 旧主线（`mainLine` 默认取第一条，order 更小，仍是它）→ 显示「支线联动 4 条」+ 综合进度，但它是 completed 状态；
- 新主线（order 更大）作为「第二条主线」出现，但 `mainLine` 是第一条，它不被当 `mainLine` 聚合，旗下（实际为空，因为支线都挂旧主线了）无联动显示。
作者看到的世界是「错位的」：旧主线名下挂了本属于新主线的支线，新主线孤零零一条、无支线联动。**这是 v1.6.4 联动逻辑里最硬的一处数据错乱（F1，P1）。**

### 1.7 旧数据兼容：parentId=null 的回退是否真不报错

v1.6.4 之前的项目故事线 `parentId` 全为 `null`（字段是 v1.6.4 才在 schema 加的，`schema.prisma:325`）。这些老支线进 `resolveParent`：`s.parentId` 为空 → 跳过 `if` → 回退 `mainLine ?? null`（`StorylineList.tsx:142`）。若项目有且仅有一条主线，老支线正确显示为「隶属主线：X」。**旧数据兼容在「单主线」场景下是成功的，不报错、不崩溃。**

但回退逻辑对「`parentId` 指向已删除主线」的情形是错的（F3）：因为 `parentId` 只是 `String?`，**不是关系字段、删主线不会级联删支线**（`schema.prisma` 里 Storyline 没有到自身的 `@relation`）。若某支线的 `parentId` 指向的主线被删了，`storylines.find(m => m.id === s.parentId)` 返回 `undefined` → 仍走 `:142` 回退到 `mainLine` → 显示「隶属主线：当前主线」，造成**虚假归属**。这是 P2（F3）。

### 1.8 编辑弹窗：能否改隶属关系

作者点支线「编辑」→ `startEdit` 只带 `title/description/七要素/status`（`StorylineList.tsx:123-125`），**编辑弹窗里没有 parentId 字段**（`:297-319`）。想改隶属关系只能走 `PUT /api/storylines/[id]` 直接传 `parentId`（`[id]/route.ts:30`），UI 不暴露。这意味着 UI 层的「联动」是只读展示，不能反向编辑——对作者而言，「这条支线挂错主线了」只能靠 API/DB 修。属 UX 完整性缺口（并入 F3 建议）。

### 1.9 本章小结（体验视角）

- **真生效的部分**：生成后支线挂主线（数据层真实）、UI 缩进+「隶属主线」、主线聚合支线数/均进度/综合进度、单线七要素+章节双维度进度条、旧数据（单主线）兼容、打勾完结。
- **未生效/弱生效的部分**：①写作 LLM 看不到隶属关系与量化进度（F2/F6）；②缝合怪 newMain 流支线错挂旧主线（F1）；③多主线聚合错乱（F4）；④删除主线后的孤儿支线虚假归属（F3）；⑤生成路由对「AI 不返 main」的鲁棒性不足（F5）；⑥编辑 UI 不可改隶属（F3 附带）。

---

## 二、总体视角（架构质量收口）

> 本栏约 4,900 字。从「数据化 vs 渲染层耦合、类型安全、迁移幂等、融入写作有效性、进度算法可持续性」五个维度收口。

### 2.1 parentId 数据化 vs 渲染层聚合的耦合度

v1.6.4 做了**正确的一件事**：把「支线服务于主线」从「人类脑内约定」变成了 `Storyline.parentId` 字段（`schema.prisma:325`、`:347` 加了 `@@index([parentId])`）。这是数据化正路，比在标题里写「（主：XXX）」之类的文本耦合强太多。

但**聚合逻辑完全落在渲染层**（`StorylineList.tsx:137-154`）：`resolveParent`、`childLines`、`childAvg`、`combinedProgress` 全是组件内 `useMemo`-free 的同步派生计算。问题有三：
1. **渲染层重复计算**：每次 render 都对每条支线调 `resolveParent`（内含 `storylines.find`），再对 `childLines` 逐条调 `computeStorylineProgress`。数据量小（故事线通常 <30 条）性能无碍，但逻辑散在 UI 组件，与「数据」职责混在一起，违反关注点分离。
2. **聚合口径与数据层不一致**：`combinedProgress = main*0.7 + childAvg*0.3` 是 UI 硬编码权重，没有落到任何可配置/可测试的地方；且只聚合 `mainLine`（第一条主线）旗下，多主线语义缺失（F4）。
3. **回退逻辑写在 UI**：`resolveParent` 的「parentId 缺失→回退唯一主线」本应是数据层/服务层的职责（例如 `getStorylinesWithResolvedParent(projectId)`），现在塞进前端，导致后端其他消费者（如未来要生成「联动报告」的 API）无法复用，且前端回退与后端 `generate` 的 parentId 写入口径容易出现「写的是 A、显示回退成 B」的错位（F3/F1 的本质都是「写」与「解析」两处口径不一）。

**架构建议**：把「支线归属解析 + 联动聚合」抽成一个纯函数（如 `src/lib/storyline-linkage.ts` 的 `resolveLinkage(storylines)`），前后端共用；`combinedProgress` 权重与「多主线如何处理」在该函数里集中定义并加单测。

### 2.2 类型安全

- `computeStorylineProgress(s: any)`（`storyline-progress.ts:31`）入参是 `any`，七要素直接从 `any` 读。函数内部做了 `typeof s[k] === "string"` 防御（`storyline-progress.ts:33`），所以空值/错误类型不崩——这点写得好。但 `any` 入参意味着调用方（`StorylineList`、`formatStorylines`）传进来的对象形状无编译期保证。
- `StorylineData` 接口（`StorylineList.tsx:15-22`）把 `parentId?: string | null` 显式建模，且 `chapterBindings` 形状 `{ element; chapterId; note }[]` 与后端 `storyline-writer` 实际写入的 `{ element; chapterId; chapterOrder; note; at }`（`storyline-writer.ts:46-53`）**不一致**——前端类型少了 `chapterOrder/at`，而 `DrawCards` 写的 `element:"preset"` 也不在七要素枚举内。`tsc` 不报是因为 `chapterBindings` 在多处被当 `any`/宽松结构处理（如 `StorylineDetail` 里 `(b as any).chapterOrder`，`StorylineList.tsx:391`）。
- `generate/route.ts` 的 `buildData` 第二参 `type: string`、返回 `created: any[]`（`route.ts:126`），类型偏松。整体 tsc 0 错，但「0 错」来自 `any` 的宽容，而非强类型护航。

**结论**：类型安全「表面达标、内在松懈」。建议给 `chapterBindings` 元素定义统一 `StorylineBinding` 类型（含可选 `chapterOrder`、允许 `element:"preset"` 扩展），并在 `computeStorylineProgress` 入参用 `StorylineData` 而非 `any`。

### 2.3 迁移幂等 / 数据落库

**重大核查结果**：`schema.prisma` 的 `Storyline.parentId`（`schema.prisma:325`）**没有对应的 Prisma migration**。现有 migration 目录只有 `add_style_card`/`add_abilities_to_character`/`personality_to_json` 三条（`prisma/migrations/`），其中出现 `parentId` 的是 `LorebookEntry.parentId`（早已有之），与 Storyline 无关。Storyline 表本身在 tracked migration 里连 `CREATE TABLE` 都 grep 不到——说明该项目历史上就是用 `prisma db push` 同步 schema 的。

我核查了部署脚本 `deploy-local.ps1:62-65`：确实是 `npx prisma generate` + `npx prisma db push`，**不是 `prisma migrate deploy`**。因此：
- **当前部署链路下不爆**：`db push` 会把 schema（含 `parentId`）直接同步到 127.0.0.1:5432 的库，v1.6.4 的读写都能跑；
- **但属隐患（F8，P2）**：一旦有人改用 `migrate deploy`（很多团队 CI 默认如此），`parentId` 列不存在 → `generate` 写入 `parentId` 会 SQL 报错（P2002/列不存在）→ 整个生成 502。此外 `db push` 本身无迁移历史、不可回溯，与「迁移幂等」的工程目标相悖。
- **幂等性补充**：`parentId` 是 nullable 默认 null，旧行自动 null，无回填脚本需求；`order` 非唯一约束，并发 generate 不会出现唯一冲突（只会重复 order 值，低危）。

**建议**：补一条 `prisma migrate dev --create-only` 生成的迁移（哪怕项目主打 `db push`，有迁移文件也能在 migrate 链路下不崩），或在 `deploy-local.ps1` 注释明确「本项目用 db push，勿切 migrate deploy」。

### 2.4 融入写作的有效性（本轮核心质疑）

我把「融入写作是否真让 AI 感知主线/支线进展」拆成三个子问题，逐一用源码证据回答：

**Q1：AI 是否看得到故事线设定？** 是。active 线经 `formatStorylines` 注入 `systemPrompt`（`orchestrator.ts:681`），且 `context-loader.ts:69-72` 只取 active，completed/abandoned 不污染。这条 v1.6.3 的「深度融入」是真实生效的，标题「故事线进度」也算名副其实地「让 AI 知道有哪些线」。

**Q2：AI 是否知道「谁服务谁」？** **否。** `formatStorylines`（`outline-context.ts:71-85`）输出 `（主线）/（支线）` 标签，但**不含 `parentId`/「隶属主线：X」**。AI 知道某条是支线，却不知道它服务于哪条主线。v1.6.4 费了大力气把 `parentId` 数据化，却没把它接进写作 prompt——**数据化与融入写作在 v1.6.4 是断链的**。这正是用户原始担忧「还是各写各的」在「跨线协同」维度的真实落点。

**Q3：AI 是否知道「推进到百分之几」？** **否。** 注入的是七要素原文，不是 `computeStorylineProgress` 算出的 `overallPercent`。标题写「故事线进度」，内容却是设定文本，名实略有悖。AI 无法据此判断「这条线该不该这章收束」。

**总体判读（诚实）**：融入写作在「不偏离单线七要素」维度有效；在「跨线协调 + 按进度收束」维度**因信息缺失而弱效**。要真正闭环，需在 `formatStorylines` 里补两样东西：(a) 支线的「→ 主线：X」归属；(b) 每条线的 `overallPercent` 与「已绑定 N 章」。这是 v1.6.4 之后最该补的一刀（F2/F6，P1）。

### 2.5 进度量化算法的可持续性

算法本身（`storyline-progress.ts`）边界稳、单测全绿，但有两处「长期会反噬」的设计：
1. **12 章封顶是写死的魔法数**（`EXPECTED_CHAPTERS_PER_STORYLINE=12`，`:19`）。对 12 章内的中篇合理；但对「主线横跨 40 章」的长篇，绑定满 12 章即 100%，之后章节推进不再反映到进度——作者在长项目里会看到「主线进度卡在 100% 却还在写」，或「七要素 100% + 12 章 = 100%，但书才写 1/3」。应改为按项目 `targetWordCount` 或实际章节总数动态封顶（F10，P3）。
2. **`overallPercent = 七要素60% + 章节40%` 的语义**：一条「七要素全填、但 0 章推进」的主线显示 60%，会被作者误读为「进度过半」。进度条的颜色阈值（≥100 绿、≥50 主色、否则 accent，`StorylineList.tsx:333-336`）也把这个 60% 渲染成「主色」——视觉上像「快好了」。这是算法权重与认知的错位，建议在 UI 文案区分「设定完整度」与「推进度」两件事，或把「已完结」作为 100% 的唯一真源（F10）。

### 2.6 生成路由的 order 递增与并发

`generate/route.ts` 的 order 计算（`:116`、`:151`、`:161`）：主线 `maxOrder + created.length + 1`，支线 `maxOrder + created.length + i + 1`。我手算三种典型路径（无现存线 / 有现存主线只补支线 / 多主线）均连续无冲突。**order 递增防冲突在单请求内是成立的**。风险仅在「两个 generate 并发」：两者读到相同 `maxOrder`、各自 `+1` 创建，会出现重复 order 值——但 `order` 无唯一约束，不会抛错，只是排序不稳，属低危（不入发现清单主表，仅此说明）。

### 2.7 章节绑定（chapterBindings）的数据形状治理

三处写入形状不一致（F9，P2）：
- `storyline-writer.ts:46-53` 写 `{element, chapterId, chapterOrder, note, at}`；
- `plan-chapter.ts` 写 `{element, chapterId, note}`（无 `chapterOrder`）；
- `DrawCards`（page.tsx:376-392）写 `{element:"preset", ...}`（`element` 非七要素）。
`computeStorylineProgress` 只数 `length`，不校验形状，所以进度计算不受影响；但 `StorylineDetail` 渲染读 `(b as any).chapterOrder`（`StorylineList.tsx:391`），缺失时显示「第?章」。`element:"preset"` 进 `ELEMENT_LABELS[b.element]` 会 `meta` 为 `undefined`，渲染层用 `meta ? ... : ""` 兜底（`StorylineList.tsx:388`），不崩。建议统一 `StorylineBinding` 类型，把 `element` 扩成 `SevenElementKey | "preset"` 联合类型。

---

## 三、发现清单（基于真实代码/测试证据）

> 每条含：编号 / 严重度 / 文件:行号（精确）/ 现象 / 根因 / 建议修法。

**[F1] P1 — 缝合怪 newMain 流：支线误挂已完结旧主线**
- 文件:行号：`src/app/api/storylines/generate/route.ts:123-124`、`route.ts:149-155`、`route.ts:158-164`
- 现象：旧主线标记完结触发 `generate(mode:"newMain")`，新主线被创建，但其旗下支线的 `parentId` 全部指向**刚完结的旧主线**；UI 表现为旧主线名下挂了新主线的支线、新主线无联动聚合。
- 根因：`mainId` 初始化用 `existingStorylines.find(s => s.type === "main")?.id`，`existingStorylines` 是全量（无 status 过滤），必然命中旧主线；主线循环里 `if (!mainId) mainId = m.id`（`:154`）因 `mainId` 已非空而**不接管**，导致新主线 id 没成为 `mainId`。
- 建议修法：在主线循环后，用「本次新建的主线 id」覆盖 `mainId`，即 `mainId = created.find(c => c.type === "main")?.id ?? mainId;`；或在初始化时排除 `status === "completed"` 的主线（`existingStorylines.find(s => s.type==="main" && s.status==="active")`）。推荐前者，最稳。

**[F2] P1 — 融入写作未注入隶属关系，跨线协同缺失**
- 文件:行号：`src/core/pipeline/outline-context.ts:71-85`（`formatStorylines`）、`src/core/agents/orchestrator.ts:680-681`
- 现象：写章时 `storylineBlock` 只给「（主线）/（支线）」标签 + 七要素文本，不含支线「→ 主线：X」归属；AI 不知某支线服务于哪条主线，「支线服务于主线」意图未传导到写作大脑。
- 根因：v1.6.4 的 `parentId` 数据化只接到 UI 渲染（`StorylineList.tsx`），未接进 `formatStorylines`；`loadOutlineData` 返回的 storylines 含 `parentId` 但函数未使用。
- 建议修法：在 `formatStorylines` 里，对 `type==="side"` 的行，用传入的 `parentId` 反查主线标题，输出 `（支线 → 主线：X）`；并加一句系统指令「请让本条支线主动呼应其所属主线的阻碍/转折」。

**[F3] P2 — resolveParent 回退误归属：删除主线后的孤儿支线虚假挂当前主线**
- 文件:行号：`src/components/workspace/StorylineList.tsx:137-143`（尤其 `:142`）
- 现象：某支线 `parentId` 指向一条已被删的主线（因 `parentId` 非关系字段、删主线不级联删支线），`storylines.find` 返回 `undefined` 后仍回退 `mainLine`，UI 显示「隶属主线：当前主线」，造成虚假归属。
- 根因：回退条件写在「`parentId` 未命中列表」时，而非「`parentId` 为空时」。本应只对旧数据（`parentId=null`）回退，却对「`parentId` 非空但父已删」也回退。
- 建议修法：`if (!s.parentId) return mainLine ?? null;` 仅当 `parentId` 为空才回退；非空但未命中则视为孤儿（不显示「隶属主线」，或显示「（游离支线）」）。同时给 `parentId` 加软校验（指向不存在则 UI 提示）。

**[F4] P2 — 多主线项目联动聚合错乱**
- 文件:行号：`src/components/workspace/StorylineList.tsx:132`、`144-146`、`154`
- 现象：`mainLine` 只取第一条主线；`childLines` 只聚合 `mainLine.id` 旗下。`parentId=null` 的支线会被回退并入第一条主线；其余主线的支线不显示联动。多主线时综合进度是局部视图。
- 根因：聚合逻辑假设「全局唯一主线」，对多主线未定义语义。
- 建议修法：把联动解析抽成 `resolveLinkage(storylines)` 纯函数，对每条主线分别聚合其 `resolveParent` 命中的支线；UI 改为「逐条主线各自显示其旗下支线联动」，而非只聚合第一条。

**[F5] P2 — generate 路由对「AI 不返 main」鲁棒性不足，静默成孤儿线**
- 文件:行号：`src/app/api/storylines/generate/route.ts:119-120`、`123-124`、`158-164`
- 现象：若 LLM 返回的行全部 `type!=="main"`（或缺失 `type` 字段），且项目无现存主线，则 `mainId` 恒为 `null`，所有支线 `parentId=null` → 全部孤儿，v1.6.4 联动静默失效（无报错，但无联动）。
- 根因：拆分逻辑纯靠 `l.type === "main"` 字符串判断，无兜底；`parentId` 直接取可能为空 `mainId`。
- 建议修法：若 `mainId` 为空且存在待建行，把首行强制当 `main`（或给默认 `parentId` 回退策略并打日志告警），避免静默孤儿。

**[F6] P2 — 「故事线进度」标题名实不符，量化进度未进写作 prompt**
- 文件:行号：`src/core/agents/orchestrator.ts:680`（`## 故事线进度`）、`src/core/pipeline/outline-context.ts:71-85`
- 现象：block 标题叫「故事线进度」，内容却是七要素原文，未含 `computeStorylineProgress` 算出的 `overallPercent` / 「已绑定 N 章」。AI 无法据此判断推进度与收束时机。
- 根因：`formatStorylines` 只 Format 七要素文本，未调用进度量化函数。
- 建议修法：在 `formatStorylines` 每条末尾追加 `（进度 X% · 已绑定 N 章）`，复用 `computeStorylineProgress`，并把「进度<100% 的线请在本章推进」写进指令。

**[F7] P3 — outline-context 死过滤值 "main"**
- 文件:行号：`src/core/pipeline/outline-context.ts:52-55`
- 现象：`status: { in: ["active", "main"] }` 中 `"main"` 不是合法 status（status 实为 active/completed/abandoned），属死值；且与 `context-loader.ts:69-72` 的 `status: "active"` 口径不一致。
- 根因：早期 copy 残留/语义误解（`main` 是 `type` 不是 `status`）。
- 建议修法：改为 `status: "active"`；如需含「主线」应过滤 `type:"main"`，但主线也可能 abandoned，建议统一用 `status: "active"` 即可（与 context-loader 对齐）。

**[F8] P2 — parentId 无对应 Prisma migration，迁移链路隐患**
- 文件:行号：`prisma/schema.prisma:325,347`、`prisma/migrations/`（缺 Storyline.parentId 迁移）、`deploy-local.ps1:62-65`
- 现象：`Storyline.parentId` 字段在 schema 存在，但 `prisma/migrations/` 下无对应迁移；项目靠 `prisma db push` 同步（故当前不爆），一旦改用 `migrate deploy` 会缺列 → generate 写入 `parentId` 报 SQL 错。
- 根因：开发过程一直用 `db push`，未补 migration。
- 建议修法：执行 `npx prisma migrate dev --create-only` 生成一条迁移（含 `ALTER TABLE "Storyline" ADD COLUMN "parentId" ...`）；或在 `deploy-local.ps1` 注释明确「本项目用 db push，勿切 migrate deploy」。

**[F9] P2 — chapterBindings 写入形状不统一**
- 文件:行号：`src/core/pipeline/storyline-writer.ts:46-53`、`src/core/pipeline/plan-chapter.ts:163`、`src/app/workspace/[projectId]/page.tsx:376-392`、`src/components/workspace/StorylineList.tsx:391`
- 现象：三处写入 `chapterBindings` 形状不同（`chapterOrder` 有无、`element:"preset"` 非七要素）；UI 读 `chapterOrder` 缺失时显示「第?章」。当前不崩（有兜底），但类型混乱。
- 根因：无统一 `StorylineBinding` 类型，`element` 未扩成 `SevenElementKey | "preset"` 联合类型。
- 建议修法：定义 `interface StorylineBinding { element: SevenElementKey | "preset"; chapterId: string; chapterOrder?: number; note: string; at?: string }`，三处写入与 UI 渲染统一引用。

**[F10] P3 — 进度量化 12 章硬封顶 + 权重语义易误导**
- 文件:行号：`src/lib/storyline-progress.ts:19`、`storyline-progress.ts:45`、`StorylineList.tsx:333-336`
- 现象：`EXPECTED_CHAPTERS_PER_STORYLINE=12` 写死，长篇（>12 主线章）进度封顶过早；`overallPercent=七要素60%+章节40%` 让「七要素满、0 章推进」的主线显示 60% 并渲染成「主色」绿意，误导作者以为快完。
- 根因：魔法数 + 权重未区分「设定完整度」与「推进度」。
- 建议修法：封顶数改为随项目章节总数/目标字数动态计算；UI 文案区分「设定完整度 X%」与「推进度 Y%」，或以 `status==="completed"` 为 100% 唯一真源。

---

## 四、验证证据汇总（可复现）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` | **0 错误**（EXIT_TSC=0） |
| 进度量化单测 | `npx vitest run src/lib/storyline-progress.test.ts` | **5/5 通过** |
| 全量测试 | `SAFE_DELETE_DISABLE=1 npx vitest run` | **238/238 通过**（19 文件） |
| v1.6.4 真实改动 | `git show 2b88e09 --stat` | 改 4 文件：`generate/route.ts`(+63/-?)、`StorylineList.tsx`(+54)、`changelog-data.ts`、`CHANGELOG.md` |
| DB 同步方式 | 读 `deploy-local.ps1:62-65` | `prisma generate` + `prisma db push`（非 migrate） |
| 迁移核查 | `ls prisma/migrations/` | 仅 3 条旧迁移，无 Storyline.parentId 迁移 |

**正面确认**：tsc/vitest 全绿；UI 联动渲染真实生效；旧数据（单主线、parentId=null）回退正确不崩；GET 返回全字段使 `parentId` 可被前端消费；order 递增单请求内无冲突；进度算法边界单测覆盖扎实。

**负面确认（均锚定代码行号，见 F1–F10）**：F1 缝合怪 newMain 错挂（P1，最硬）、F2/F6 写作未注入隶属与进度（P1/P2）、F3 孤儿支线虚假归属（P2）、F4 多主线聚合错乱（P2）、F5 生成路由鲁棒性（P2）、F8 迁移隐患（P2）、F7 死过滤值（P3）、F9 形状不统一（P2）、F10 封顶/权重误导（P3）。

---

## 五、给 round-2 的收口建议（优先级排序）

1. **立即修 F1**（P1）：`generate/route.ts` 用「本次新建主线 id」覆盖 `mainId`，缝合怪流即刻正确。
2. **补 F2+F6**（P1/P2）：`formatStorylines` 注入「支线→主线」归属 + 每条 `overallPercent`，让融入写作真正闭环。
3. **修 F3+F4**（P2）：`resolveParent` 仅在 `parentId` 为空时回退；联动聚合抽 `resolveLinkage` 纯函数，支持多主线。
4. **补 F8**（P2）：生成 parentId 迁移或锁定 db push 注释，消除迁移链路隐患。
5. **余下 P3/F9/F10**：形状统一、动态封顶、文案区分，纳入下一轮 polish。

> 报告完。全部结论基于 `2b88e09` 源码逐行阅读、`git show` 真实 diff、`tsc`/`vitest` 实测与 `deploy-local.ps1`/`prisma/migrations` 核查；涉及 LLM 真实输出的部分已显式标注「源码推演/需真机验证」，未做编造。
