# 前端工程、性能与代码质量深度体验报告

**审查人**：frontend-engineering（MaxLoop 魔王系统 lens）
**审查对象**：novel-forge v1.8.9（HEAD `78871ee`）
**重点组件**：StorylineWorkbench / StorylineList / LeftPanel
**关联 API**：`/api/storylines/*`、`/api/generation-tasks/*`
**审查日期**：2026-08-10
**报告路径**：`PROCESS/meetings/round-1/frontend-engineering.md`

---

## 第一部分：用户体验视角

### 一、整体功能评价：故事线工作台作为"AI 辅助叙事架构工具"的完成度

从一名普通用户的角度打开 novel-forge，进入左侧面板的「故事线」标签页，首先映入眼帘的是一个结构清晰的工作台弹窗系统。整个故事线模块围绕「七要素驱动的事件线」这一核心概念展开——每条故事线由欲望、阻碍、行动、结果、意外、转折、结局七个维度构成，这在产品层面是一个有深度的设计选择。它不是简单的任务清单或看板，而是一套真正面向长篇小说写作的叙事工程框架。

#### 1.1 功能完整性评估

故事线工作台（StorylineWorkbench）提供了以下完整的功能闭环：

- **列表浏览与导航**：左侧 288px 宽的导航面板以主线为根节点、支线为子节点的树形结构展示所有故事线。每条线显示标题、类型标签（主线/支线）、完结状态标记和进度条。进度条基于七要素填充度计算（结局不计入），视觉上用不同颜色区分主线（accent 色）和支线（primary 色）。这个导航设计在信息密度和可读性之间取得了不错的平衡。

- **详情查看**：右侧详情面板展示选中故事线的完整信息，包括类型标签、标题、描述、七要素网格（每个要素一个卡片，含图标和内容）、章节进展时间轴（自动记录的 MILESTONE/EVENT 事件按 position 排序）、线索集（CLUE 类型事件的可折叠面板）。这种「总览→细节→时间线→线索」的信息层级符合用户从宏观到微观的认知习惯。

- **编辑能力**：点击「编辑」按钮进入编辑态，可以修改标题、简述、类型（主线/支线互换）、状态（活跃中/已完结/已废弃）、所属主线归属以及全部七要素字段。表单使用 DialogField + DialogInput 组件，布局采用响应式 grid（sm:grid-cols-2），在移动端也能合理降级。

- **AI 生成中间态**：这是该模块最具创新性的功能之一。用户点击「AI 生成」后，系统创建一个后台生成任务（POST /api/generation-tasks），前端通过 setInterval 每 1.5 秒轮询任务状态（GET /api/generation-tasks/:id）。当任务完成后，返回的建议（suggestions）进入一个「中间编辑态」——用户可以在落库前逐条修改 AI 生成的每条故事线的标题、简述和全部七要素。这个设计解决了「AI 生成质量不可控」的核心痛点：让用户在 AI 和最终数据之间保留了一层人工审核/修改的缓冲区。落库时调用 POST /api/storylines/generate 并携带 commit=true 和编辑后的 suggestions，服务端直接写入数据库而不再次调用 LLM。

- **状态管理**：支持将故事线标记为「已完结」（toggle-complete），并在主线完结时触发「缝合怪」逻辑（autoConstructNewMain）自动构造承接的新主线。删除操作经过确认对话框（useConfirmDelete hook 封装），并处理了子线的级联重挂（N3 修复）。

- **线索集管理**：每条故事线可以维护独立的 CLUE 类型事件集合，支持新增、行内编辑（tag + content）和删除。线索集默认展开，带计数徽章。

从功能覆盖面来看，故事线工作台已经形成了一个完整的 CRUD + AI 增强 + 时间轴 + 线索管理的闭环。对于一个小说写作辅助工具来说，这套功能的颗粒度和深度是足够的。没有明显的功能缺失——至少在当前产品阶段看不出「半成品」的感觉。

#### 1.2 性能与稳定性感知

在实际使用场景下（通过 Playwright 无头浏览器截图验证），故事线相关组件未产生任何 React 运行时错误或控制台告警。页面加载后，故事线列表的 GET 请求正常返回，空状态正确展示 EmptyState 组件（图标 + 提示文字 + 「AI 自动生成」行动按钮）。这表明组件的基本渲染路径是稳定的。

然而，从代码层面分析，存在若干可能影响性能和稳定性的隐患：

**轮询机制的健壮性**：startPolling 函数使用 setInterval 以 1.5 秒间隔轮询生成任务状态。虽然组件卸载时会清理定时器（pollRef 的 useEffect cleanup），但存在两个潜在问题：

第一，如果 startPolling 被连续调用两次（例如用户快速双击「AI 生成」按钮），会创建两个并行 interval，导致双重轮询。这是因为 startPolling 在设置新 interval 前并未检查并清除已有的 pollRef.current。虽然在正常交互流程中（按钮 disabled={generating || !!genSuggestions} 且 generating 在 handleGenerate 开头同步设为 true）双击概率极低，但作为一个公共 API（同时被 mount effect 和 handleGenerate 调用），缺乏防御性清理是不够严谨的。

第二，interval 回调中的 fetch 是异步的。当组件卸载时，如果有正在进行的 fetch 请求，其 await resolve 后仍会调用 setState（setGenTask、setGenerating 等），对已卸载的组件执行状态更新。React 18 对此不再抛出警告，但这仍然是无效的计算和内存占用。更理想的做法是引入 AbortController，在 cleanup 中 abort 所有进行中的请求。

**全量刷新策略**：几乎所有的写操作（保存、切换状态、添加/编辑/删除线索）都调用 `void load()` 来重新获取全部故事线数据。load 函数执行 `GET /api/storylines?projectId=xxx` 并带上 `include: { events }`，这意味着每次保存都会重新下载该项目下的所有故事线及其全部时间轴事件。对于拥有大量故事线和事件的项目（例如一部连载多年的长篇小说可能有数十条故事线和数百个事件），这种全量刷新会造成不必要的网络传输和 JSON 解析开销。更合理的做法是乐观更新（optimistic update）——先根据操作类型本地修改 list 状态，再后台静默刷新；或者至少在 PATCH 类操作（如切换状态、编辑线索）中使用增量更新而非全量重载。

**无请求超时保护**：所有 fetch 调用均未设置 AbortSignal.timeout() 或手动 timeout。在网络不稳定的环境下（例如移动端弱网、代理服务器慢响应），一次 fetch 可能无限期挂起，导致 UI 永久停留在 loading/saving 态。虽然 Next.js 的 serverless 函数有 maxDuration 限制（generation-tasks 和 generate route 都设置了 120 秒），但客户端侧没有任何超时兜底。

#### 1.3 文案与交互一致性评价

文案方面，故事线工作台的中文表达总体准确且具有专业感：

- 「故事线工作台」作为弹窗标题清晰传达了这是一个集中式操作空间。
- 「AI 生成结果 · 中间编辑态（可修改后再落库）」准确描述了当前状态和用户权限。
- 「七要素 · 总纲（结局不预填，仅标记收束）」解释了设计意图，帮助用户理解为什么「结局」字段总是显示「待收束」。
- 「线索集 / 纸集（融合龙王寨、菜市场注释、尸检报告等）」这个文案带有项目特有的风味（引用了具体作品元素），增强了代入感，但对不熟悉该项目的用户来说略显晦涩。
- 「采用并落库」「放弃」等操作按钮文案简洁明确。

但存在几处值得改进的地方：

**toastCreated 参数冗余**：在 handleCommitGen 成功后调用了 `toastCreated("故事线", "故事线")`。toastCreated 的签名是 `(name: string, kind?: string)`，生成的 toast description 为 `kind ? \`${kind}「${name}」已创建\` : \`「${name}」已创建\``。传入 name="故事线"、kind="故事线" 后，实际显示文本为 `故事线「故事线」已创建`——name 和 kind 完全相同导致语义重复。应改为 `toastCreated("故事线")`（只传 name）或 `toastCreated("故事线", "故事线组")`（区分实体名和类别名）。

**EmptyState 文案差异**：StorylineWorkbench 的空状态显示「还没有故事线」，StorylineList 的空状态也显示「还没有故事线」。两者一致，但 StorylineList 的行动按钮文案是「点击 AI 自动生成」，而 Workbench 内的是「AI 自动生成」。细微不一致但不影响理解。

**进度条语义模糊**：computeStorylineProgress 的 label 格式为 `七要素 ${filled}/${elementTotal}${hasEnding ? " · 已收束" : ""}`，即「七要素 4/6」或「七要素 5/6 · 已收束」。但 UI 标题写的是「七要素」（暗示 7 个），而实际只计算 6 个（ending 不计入）。用户看到「七要素 4/6」可能会困惑：到底是 7 要素还是 6 要素？建议 label 改为「六要素 ${filled}/6」或在 UI 标题改为「六要素（不含结局）」。

**LineNav 中的 toggle 交互**：每条故事线导航项右侧有一个圆形勾选图标用于「标记完结」，它被实现为一个 `<span onClick={...}>` 嵌套在外层 `<button>` 内部。这意味着：
- 该 toggle 不是真正的 button 元素，无法通过 Tab 键聚焦，无法通过键盘激活（Enter/Space），屏幕阅读器不会将其识别为可交互控件。
- 它嵌套在另一个 button 内部，违反了 HTML 规范（interactive element 不能嵌套 interactive element）。虽然使用了 span 而非 button 来规避 HTML 验证错误，但从可访问性角度仍然存在问题。
- 建议改用 `<button type="button" onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-label="标记完结">` 并配合适当的 focus 样式。

#### 1.4 UI 设计与视觉层次评价

工作台弹窗采用了 Modal 组件的 bare 模式，最大宽度 max-w-5xl（1024px），高度 max-h-[92vh]，在常见分辨率下能充分利用屏幕空间而不遮挡顶部导航栏。内部采用 flex 布局分为左右两列：

- 左列固定宽度 w-72（288px），overflow-y-auto 可滚动，承载树形导航。
- 右列 flex-1 min-w-0 overflow-y-auto，承载详情面板。

这种左右分栏的经典布局在桌面端非常高效。但在窄屏设备上（如平板竖屏或小窗口），288px 的左列加上右列的最小内容宽度可能导致水平溢出。目前没有看到针对移动端的响应式断点处理（如左列折叠为抽屉或上下堆叠）。

**七要素网格**在查看态使用 sm:grid-cols-2 双列布局，每个要素一张圆角卡片（rounded-xl），带边框（border-[var(--nv-border-2)]）和浅色背景（bg-[var(--nv-surface-1)]）。卡片内包含图标+标签的表头和内容区。空的要素显示「—」，结局特殊处理显示「待收束」。这个设计在视觉上一致性好，信息密度适中。

**时间轴**使用 CSS border-l + pl-4 的经典时间线样式，每个事件节点用一个绝对定位的圆点（absolute -left-[21px]）标记。事件按 position 排序，区分 MILESTONE 和 EVENT 类型。暂无事件时显示引导文字「暂无章节进展记录（写作时会自动回写大事件）」。这个设计简洁有效。

**AI 中间态编辑器**完全替换了正常的左右分栏主体，变为单列滚动区域。每条建议用 rounded-xl 卡片包裹，内部结构与详情编辑态类似（标题输入框、简述输入框、七要素 grid）。底部是「放弃」和「采用并落库」两个操作按钮。这个「模式切换」式的 UI 设计避免了在同一屏内塞入过多信息，但也意味着用户无法在编辑 AI 建议的同时参考已有故事线——这是一个值得考虑的 UX 权衡。

**颜色体系**统一使用 CSS 自定义属性（--nv-* 系列），包括 text-primary/text-secondary/text-tertiary 三级文字色、surface-1/surface-2/surface-3 三级背景色、border-2 边框色、accent 主色调、primary 辅助色、success/danger/creative 等语义色。这套变量体系贯穿所有组件，保证了视觉一致性。

### 二、从开发者视角的使用体验

作为一名开发者审视这段代码，最直观的感受是：**功能实现扎实，但工程化程度参差不齐**。好的方面包括：TypeScript 编译零错误（tsc --noEmit 通过）、368 个测试全部通过、组件间职责划分基本清晰（Workbench 负责弹窗内完整交互，List 负责左栏紧凑视图，LeftPanel 作为容器做 tab 切换）、API 路由与前端调用一一对应且参数一致。不足的方面则集中在类型安全边界、重复代码、测试覆盖盲区和一些 React 最佳实践的疏漏。

以下从八个维度逐一深入分析。

---

## 第二部分：总体视角——架构与代码质量深度分析

### 一、TypeScript 类型安全维度

#### 1.1 核心发现：lib 层 any 泄漏

`src/lib/storyline-progress.ts` 是故事线模块的核心计算库，被 StorylineWorkbench 和 StorylineList 共同依赖。然而它的两个公开函数全部接受 `any` 类型参数：

```typescript
// storyline-progress.ts:25
export function computeStorylineProgress(s: any): StorylineProgress {
// storyline-progress.ts:67
export function groupStorylinesByMain(storylines: any[]): StorylineGroup {
```

这意味着调用方传入的任何类型都不会得到编译期检查。StorylineList.tsx 定义了一个完善的 `StorylineData` 接口（id, projectId, type, title, order, status, description, sevenElements, events），StorylineWorkbench 从 StorylineList 导入了这个类型。但当这两个组件调用 `groupStorylinesByMain(list)` 或 `computeStorylineProgress(s)` 时，即使传入了一个完全不相关的对象（比如一个 Prisma 原始返回值而非 StorylineData），编译器也不会报错。

更关键的是，`StorylineGroup` 接口的返回类型也大量使用 `any`：

```typescript
// storyline-progress.ts:57-65
export interface StorylineGroup {
  mains: any[];
  sides: any[];
  fallbackMain: any | null;
  resolveParent: (s: any) => any | null;
  childrenOf: (mainId: string) => any[];
}
```

这导致 Workbench 中所有从 groupStorylinesByMain 解构出的变量（mains, sides, resolveParent）都是 `any[]` 或 `(s: any) => any | null` 类型。后续代码中对这些值的属性访问（如 `m.id`, `s.type`, `resolveParent(s)?.id`）完全没有类型保护。

**影响范围**：StorylineWorkbench.tsx 第 158-159 行解构 `{ mains, sides, resolveParent }` 后，第 524 行 `mains.map((m) => ...)` 中的 `m` 是 `any` 类型；第 159 行 `orphanSides = sides.filter(...)` 中的 `s` 也是 `any`。StorylineList.tsx 第 108 行同样解构后使用。整个故事线导航渲染链路都运行在无类型安全的状态下。

**建议修法**：将函数签名改为接受 `StorylineData[]`，返回类型的数组字段改为 `StorylineData[]`，resolveParent 改为 `(s: StorylineData) => StorylineData | null`。这样所有下游代码都能获得完整的类型推导和编译期校验。

#### 1.2 StorylineData.status 应为联合类型

```typescript
// StorylineList.tsx:27
status: string;
```

`status` 字段被定义为宽泛的 `string`，而实际取值只有 `"active"` | `"completed"` | `"abandoned"` 三种（从 select option 和 toggleComplete 逻辑可见）。使用 `string` 导致：

- `s.status === "completed"` 之后的类型收窄不生效（string === string 不产生字面量类型缩窄）。
- 如果某处误传 `"done"` 或 `"finished"` 这样的非法值，编译器不会拦截。
- IDE 自动补全无法提供 status 的候选值。

**建议修法**：定义 `type StorylineStatus = "active" | "completed" | "abandoned"` 并在 StorylineData 中使用。

#### 1.3 服务端 any 使用

在 API 路由层也存在 `any` 使用：

```typescript
// src/app/api/storylines/generate/route.ts:25
const bodyJson: any = await request.json();
// src/app/api/storylines/generate/route.ts:170
const created: any[] = [];
// src/app/api/storylines/generate/route.ts:42
let lines: Array<Record<string, unknown>>;
```

这些 `any` 主要出现在 LLM 返回结果的解析环节（因为 LLM 输出天然无 schema），属于合理的妥协。但 `bodyJson: any` 可以改为定义一个 `GenerateRequestBody` 接口来约束已知字段（projectId, mode, commit, suggestions），同时对 suggestions 数组项的类型也做约束。

值得注意的是，三个目标组件文件（StorylineWorkbench.tsx、StorylineList.tsx、LeftPanel.tsx）内部**零 `as any` 使用**，grep 搜索确认无误。这说明组件作者在前端类型安全方面有一定意识，只是 lib 层的 any 泄漏未被察觉。

### 二、React 反模式与最佳实践

#### 2.1 useEffect 依赖正确性

审查了所有 useEffect 的依赖数组：

- **load effect**（StorylineWorkbench L153-155）：`[load]` —— load 是 useCallback，依赖 `[projectId]`。正确。
- **initialTaskId polling effect**（L127-131）：`[initialTaskId, startPolling]` —— initialTaskId 来自 props，startPolling 是 useCallback 依赖 `[toastError]`。正确。
- **pollRef cleanup**（L78-82）：`[]` —— 仅清理 interval。正确。

没有发现缺失依赖或多余依赖的情况。这一点做得不错。

#### 2.2 闭包过期状态风险

`startPolling` 是 useCallback 创建的，依赖 `[toastError]`。由于 toastError 是从 toast 模块导入的纯函数（非 state/prop/ref），它在组件生命周期内保持稳定引用。因此 startPolling 本身不会因依赖变化而重建，interval 回调内的闭包也不会捕获到过期的状态值。

但是，interval 回调内部使用的 setState（setGenTask、setGenerating、setGenSuggestions）都是 React 的 stable setter 函数，不存在闭包过期问题。所以轮询逻辑在闭包安全性上是合格的。

#### 2.3 副作用不在 render body 中

所有 fetch 调用都封装在 async 事件处理器（handleXxx）或 useEffect 中，没有在 render 直接发起副作用。符合 React 规范。

#### 2.4 fire-and-forget 模式的不一致处理

代码中存在两种 fire-and-forget 模式：

**模式 A：显式 fire-and-forget（void 前缀）**
```typescript
// StorylineWorkbench L154
void load(); // 在 useEffect 中
// StorylineWorkbench L183
void load();
onRefresh(); // 在 handleToggleComplete 成功后
// StorylineWorkbench L291
void load();
onRefresh(); // 在 handleSave 成功后
// StorylineWorkbench L339
void load(); // 在 handleAddClue 成功后
// StorylineWorkbench L351-359
void load(); // 在 handleCluePatch/handleClueDelete 中
```

这些 `void load()` 调用表示「触发刷新但不等待结果」，这是合理的——操作成功后启动后台刷新，不阻塞用户继续操作。

**模式 B：隐式 fire-and-forget（await 但忽略结果）**
```typescript
// StorylineWorkbench L346-354
const handleCluePatch = async (id: string, patch: Record<string, string>) => {
  try {
    await fetch(`/api/storyline-events/${id}`, { ... }); // await 了但没有检查 res.ok
    void load();
  } catch (err) { ... }
};
```

这里 `await fetch(...)` 等待了响应到达，但没有检查 `res.ok`。如果服务器返回 404（事件已被其他操作删除）或 500，代码会静默地执行 `void load()` 而不给用户任何反馈。这与项目中其他 handler（如 handleSave、handleToggleComplete）的模式不一致——那些都检查了 res.ok 并在失败时 toastError。

**同样的问题存在于 handleClueDelete**（L357-363）：DELETE 请求的响应未被检查。虽然后端 DELETE 路由对 `.delete({ where: { id } })` 做了 `.catch(() => {})` 兜底并始终返回 `{ success: true }`，但如果网络层本身出错（DNS 失败、连接中断），catch 分支会触发 toastError——这部分是对的。但对于 HTTP 错误响应（如 404/500），则完全静默。

**建议修法**：在 handleCluePatch 和 handleClueDelete 中增加 `if (!res.ok) { const d = await res.json().catch(() => ({})); toastError(...); return; }` 与其他 handler 保持一致。

### 三、性能分析

#### 3.1 全量 refetch 的 N+1 问题（P1）

这是本次审查中发现的最显著性能问题。以下是每次用户操作触发的完整数据重载清单：

| 用户操作 | 触发的 load() | 下载数据量 |
|---------|---------------|-----------|
| 标记完结（toggleComplete） | 1 次 | 全部 storylines + events |
| 保存编辑（handleSave） | 1 次 | 全部 storylines + events |
| 删除故事线 | 1 次（via useConfirmDelete.onSuccess） | 全部 storylines + events |
| 添加线索（handleAddClue） | 1 次 | 全部 storylines + events |
| 编辑线索（handleCluePatch） | 1 次 | 全部 storylines + events |
| 删除线索（handleClueDelete） | 1 次 | 全部 storylines + events |
| 采用并落库（handleCommitGen） | 1 次 | 全部 storylines + events |

假设一个中型项目有 20 条故事线，平均每条 10 个事件，每次 load 下载约 200 条记录的 JSON。如果用户快速连续编辑 5 条线索，就会触发 5 次全量下载（共约 1000 条记录的网络传输），而实际上只有 5 条 event 记录发生了变化。

**优化方案**：
1. **乐观更新**：在 handleCluePatch/handleClueDelete 成功后，先用 `setList(prev => prev.map(...))` 本地更新对应记录，然后 debounced（300ms）调用 load 做一次服务端校准。
2. **增量 API**：对于线索的增删改，后端返回更新后的单条 event 记录，前端直接 patch 到本地 list 中对应的 storyline.events 数组。
3. **SWR/React Query**：引入数据缓存库，自动去重、缓存、revalidate，从根本上解决手动 load 的问题。

#### 3.2 渲染计算重复

StorylineWorkbench 的 render body 中有几处每次渲染都重新计算的值：

```typescript
// L157-161 — 每次 render 都执行
const selected = list.find((s) => s.id === selectedId) || null;
const { mains, sides, resolveParent } = groupStorylinesByMain(list);
const orphanSides = sides.filter((s) => !resolveParent(s) || resolveParent(s)?.id === s.id);
const events = selected?.events || [];
const timelineEvents = events.filter((e) => e.kind !== "CLUE").sort((a, b) => a.position - b.position);
const clues = events.filter((e) => e.kind === "CLUE");
```

其中 `groupStorylinesByMain(list)` 会遍历整个 list 进行 filter 操作（O(n)），`orphanSides` 又遍历 sides 并对每个调用 resolveParent（resolveParent 内部又有 list.find，O(n)），所以 orphanSides 的复杂度约为 O(n²)。对于 n < 100 的故事线数量这不成问题，但缺少 useMemo 包裹意味着每次父组件 re-render（例如因为 genTask 状态变化导致的 spinner 更新）都会重新执行这些计算。

**建议修法**：对 `selected`、`{ mains, sides, resolveParent }`、`orphanSides`、`timelineEvents`、`clues` 分别使用 useMemo，依赖相应的 state。

#### 3.3 LineNav 的 per-render 计算

LineNav 组件（L819-888）是无 memo 包裹的函数组件，每次父组件 re-render 都会重新创建。内部调用 `computeStorylineProgress(s)` 也是每次 render 执行。由于 LineNav 被 map 渲染（每个故事线一个），n 条故事线就是 n 次 computeStorylineProgress 调用。同样，对于小 n 这不是瓶颈，但如果未来故事线数量增长，可以考虑用 React.memo 包裹 LineNav 并将 s 作为 prop 传入。

#### 3.4 轮询频率与策略

1.5 秒的轮询间隔在「等待 AI 生成结果」的场景下是合理的——既不会给服务器造成过大压力，又能让用户在 1-2 秒内感知到状态变化。但存在两个可优化点：

1. **无退避策略**：如果服务端任务卡在 "running" 状态（LLM 超时未返回），轮询会一直以 1.5s 间隔持续下去，直到用户关闭工作台。建议加入指数退避（如 1.5s → 3s → 6s → 最大 10s）或最大轮询次数限制（如 120 次 ≈ 3 分钟）。
2. **无 WebSocket/SSE 替代方案**：对于需要实时反馈的场景（如生成进度），Server-Sent Events 或 WebSocket 比 polling 更高效。当然这涉及架构升级，可作为远期优化方向。

### 四、资源泄漏分析

#### 4.1 setInterval 清理（已实现）

```typescript
// StorylineWorkbench L78-82
useEffect(() => {
  return () => {
    if (pollRef.current) clearInterval(pollRef.current);
  };
}, []);
```

组件卸载时清理 pollRef 中的 interval。这是正确的做法。✓

#### 4.2 未清理的 in-flight fetch（P2）

如前所述，interval 回调中的 `fetch(/api/generation-tasks/${taskId})` 是异步的。假设以下时序：

1. T=0ms: interval 触发，开始 fetch
2. T=50ms: 用户关闭工作台 → 组件 unmount → clearInterval 执行
3. T=200ms: fetch 返回 → 回调继续执行 → setGenTask/setGenerating/setGenSuggestions（对已卸载组件）

React 18 不再对此发出警告，但这仍是浪费的计算。更严重的是，如果回调中调用了 `toastError`（在 failed 分支），toast 系统仍在运行（ToastProvider 是全局的），用户会在已关闭的弹窗之后看到一个「生成失败」的 toast——这可能让用户困惑。

**建议修法**：引入一个 `mountedRef = useRef(true)`，cleanup 时设为 false，在 interval 回调开头检查 `if (!mountedRef.current) return;`。更彻底的方案是使用 AbortController：

```typescript
const abortRef = useRef<AbortController | null>(null);
// cleanup:
abortRef.current?.abort();
```

#### 4.3 其他资源

- ToastProvider 内部的 `window.setTimeout`（用于 auto-dismiss）没有在 unmount 时清理。但由于 ToastProvider 是应用级单例，生命周期与应用一致，这不构成泄漏。
- ClueRow 组件内部的 useState（tag, content, editing）在每次 clue 数据不变时不会造成额外渲染（因为 key=c.id 保证身份稳定）。

### 五、代码重复分析（P1）

#### 5.1 StorylineList 与 StorylineWorkbench 的重复

这两个组件之间存在显著的代码重复，主要体现在以下几个方面：

**A. load 函数（数据获取）**

StorylineList.tsx L51-66 和 StorylineWorkbench.tsx L133-151 的 load 函数几乎完全相同：
- 相同的 URL：`/api/storylines?projectId=${projectId}`
- 相同的错误处理模式：res.ok → set data / else → parse error → setError
- 相同的 catch 处理：setError("加载故事线失败：" + ...)
- 相同的 finally：setLoading(false)

唯一区别是 List 版本设置 `setStorylines` 而 Workbench 版本设置 `setList`，以及 error state 的变量名不同（`loadError` vs `error`）。

**B. handleGenerate 函数（创建生成任务）**

StorylineList.tsx L72-97 和 StorylineWorkbench.tsx L190-213 的 handleGenerate 高度相似：
- 都 POST 到 `/api/generation-tasks`
- 都解析 `data.taskId`
- 都有相同的错误处理和 toastError 调用
- 区别在于 List 版本设置 `setGenTaskId` + `setWorkbenchId("__task__")` 打开工作台，而 Workbench 版本设置 `genTask` + 调用 `startPolling(taskId)`

**C. 故事线分组与渲染逻辑**

两个组件都调用 `groupStorylinesByMain(storylines)` 获取 mains/sides/resolveParent，都实现了孤儿支线的过滤（相同的 `!resolveParent(s) || resolveParent(s)?.id === s.id` 条件），都以类似的卡片样式渲染主线/支线列表和进度条。

**D. 进度条 UI**

StorylineList L189-196 和 LineNav L877-884 中的进度条 markup 结构几乎一样（h-1 圆角条 + 百分比 width style），只是颜色变量略有不同。

**重复的量化估算**：如果提取共享逻辑，预计可减少约 80-100 行重复代码（约占两个组件总代码量的 15-20%）。

**建议重构方案**：
1. 将 load 函数提取为 `useStorylines(projectId)` 自定义 hook，返回 `{ storylines, loading, error, reload }`。
2. 将 handleGenerate 的核心逻辑（POST → 解析 taskId）提取为 `useStorylineGeneration(projectId)` hook，返回 `{ generating, genTaskId, startGeneration }`。
3. 将分组后的列表渲染抽取为一个共享的 `StorylineNavTree` 展示组件，接收 `mains/sides/resolveParent` 和 `onSelect/onToggle` 回调。

#### 5.2 循环依赖

StorylineList.tsx L7-L8 导入了 StorylineWorkbench 组件及其 StorylineSuggestion 类型：
```typescript
import { StorylineWorkbench, type StorylineSuggestion } from "@/components/workspace/StorylineWorkbench";
```

StorylineWorkbench.tsx L11 从 StorylineList 导入类型：
```typescript
import type { StorylineData } from "./StorylineList";
```

这形成了 **StorylineList ↔ StorylineWorkbench** 的循环导入。由于 ESM 的静态 import 在模块初始化时就完成，且 JavaScript 引擎对 circular references 有特定处理（导出的是绑定而非值拷贝），这在运行时通常不会报错。但它增加了模块加载顺序的复杂性，使得某些 bundler 配置（如 tree-shaking、code splitting）可能出现意外行为。更重要的是，它表明两个组件之间的耦合度过高——List 不仅知道如何渲染列表，还直接引用了 Workbench 组件来渲染弹窗。

**建议**：将 StorylineSuggestion 类型移到独立的 types 文件（如 `storyline-types.ts`），打破循环依赖。更进一步，考虑将 Workbench 的打开/关闭逻辑提升到 LeftPanel 或一个 container 层，让 StorylineList 只负责列表渲染并通过回调通知父组件打开 Workbench。

### 六、API 一致性分析

#### 6.1 前端调用与后端路由匹配

逐一核对前端 fetch URL 与后端路由定义：

| 前端调用位置 | URL | 后端路由文件 | 匹配 |
|------------|-----|-------------|------|
| Workbench L137 | `GET /api/storylines?projectId=` | `storylines/route.ts` GET | ✓ |
| Workbench L172 | `PUT /api/storylines/${s.id}` | `storylines/[id]/route.ts` PUT | ✓ |
| Workbench L304 | `DELETE /api/storylines/${id}` | `storylines/[id]/route.ts` DELETE | ✓ |
| Workbench L327 | `POST /api/storylines/${selected.id}/events` | `storylines/[id]/events/route.ts` POST | ✓ |
| Workbench L346 | `PUT /api/storyline-events/${id}` | `storyline-events/[id]/route.ts` PUT | ✓ |
| Workbench L358 | `DELETE /api/storyline-events/${id}` | `storyline-events/[id]/route.ts` DELETE | ✓ |
| Workbench L194 | `POST /api/generation-tasks` | `generation-tasks/route.ts` POST | ✓ |
| Workbench L91 | `GET /api/generation-tasks/${taskId}` | `generation-tasks/[id]/route.ts` GET | ✓ |
| Workbench L219 | `POST /api/storylines/generate` | `storylines/generate/route.ts` POST | ✓ |
| List L55 | `GET /api/storylines?projectId=` | 同上 | ✓ |
| List L76 | `POST /api/generation-tasks` | 同上 | ✓ |

**全部 11 个 API 调用均有对应的后端路由实现，URL 匹配无误。**

#### 6.2 参数类型一致性

**handleSave → PUT /api/storylines/[id]**：
- 前端发送：`{ title, description, status, type, parentId, sevenElements }`
- 后端接收：`body.title?.trim(), body.description, body.status, body.type, body.parentId ?? prev.parentId, body.sevenElements ?? prev.sevenElements`
- 一致性：✓ parentId 在前端 type="main" 时传 null，后端 nextType==="main" 时强制 null。sevenElements 前端传完整对象，后端直接存储。

**handleCommitGen → POST /api/storylines/generate**：
- 前端发送：`{ projectId, commit: true, suggestions: StorylineSuggestion[] }`
- 后端期望：`{ projectId, commit, suggestions: Array }` 其中 suggestions 每项含 type/title/description/sevenElements
- 一致性：✓ 前端 StorylineSuggestion 接口与后端 hasClientSuggestions 分支的处理逻辑匹配。

**handleToggleComplete → PUT /api/storylines/[id]**：
- 前端发送：`{ status: "completed" | "active" }`
- 后端处理：`body.status` 直接写入 DB，并触发缝合怪逻辑
- 一致性：✓

**handleAddClue → POST /api/storylines/[id]/events**：
- 前端发送：`{ kind: "CLUE", tag, content }`
- 后端处理：kind 白名单校验（MILESTONE/EVENT/CLUE），content 非空校验
- 一致性：✓

**handleCluePatch → PUT /api/storyline-events/[id]**：
- 前端发送：`{ tag, content }`（Record<string, string>）
- 后端处理：`body.tag !== undefined ? body.tag : existing.tag` 等
- 一致性：✓

#### 6.3 发现的数据一致性问题：结局字段在落库时被静默丢弃（P2）

这是一个微妙但重要的 API 一致性问题：

**现象**：在 AI 生成中间态编辑器中，用户可以编辑每条建议的全部 7 个要素字段，包括「结局（待收束）」（ELEMENT_META 数组最后一项，key="ending"，label="结局（待收束）"）。updateSuggestionElement 函数允许用户修改 ending 的值。然而，当用户点击「采用并落库」时，handleCommitGen 将 suggestions 发送到 POST /api/storylines/generate（commit=true），后端在 hasClientSuggestions 分支中将 suggestions 展平后调用 toSevenElements(line)，该函数**硬编码 `ending: null`**：

```typescript
// src/app/api/storylines/generate/route.ts:141-149
const toSevenElements = (line: Record<string, unknown>) => ({
  desire: (line.desire as string) || "",
  // ...
  ending: null, // 结局不可预填，仅作待收束/已收束标记
});
```

无论用户在中间态编辑器中为 ending 输入了什么内容，落库时都会被强制覆盖为 null。

**影响**：用户在编辑界面花费时间填写的「结局」内容在落库后消失，且没有任何提示告知用户此字段不会被保存。这可能造成用户的困惑和挫败感——「我明明写了结局，为什么存进去就没了？」

**根因推测**：这是「结局不可预填」的产品规则（v1.8.4 变更说明）与中间态编辑器的 UI 设计之间的不一致。产品规则要求 ending 始终为 null（只能通过后续的「标记收束」操作来填写），但中间态编辑器复用了 ELEMENT_META 数组（包含 ending 字段）来渲染编辑表单，没有对 ending 做特殊处理（如禁用或隐藏）。

**建议修法**（二选一）：
1. **UI 层修复**：在中间态编辑器中，将 ending 字段设为 disabled 或显示为只读提示「结局将在落库后通过『标记收束』填写」，避免用户误解。
2. **API 层修复**：如果产品决定允许用户在生成时预设结局，则修改 toSevenElements 为 `ending: line.ending ?? null`，尊重用户输入。

### 七、错误处理评估

#### 7.1 已实现的错误处理（良好实践）

审查范围内的错误处理总体上是扎实的，体现了统一的模式：

**网络层错误**：所有 try/catch 的 catch 分支都做了以下处理：
- 区分 Error 实例和其他异常：`err instanceof Error ? err.message : "请重试"`
- 使用 toastError 向用户展示友好提示
- 包含操作上下文前缀：「状态更新失败」、「保存失败」、「新增线索失败」等

**HTTP 错误**：大多数 handler 在 `!res.ok` 时：
- 尝试解析 JSON 错误体：`res.json().catch(() => ({ error: "未知错误" }))`
- 用类型断言安全访问：`(d as { error?: string }).error`
- 提供 HTTP status code 兜底：`` `HTTP ${res.status}` ``

**加载态错误**：list 加载失败时展示红色错误文字 + 「重试」按钮（StorylineWorkbench L503-509, StorylineList L137-144）。这是良好的 UX 设计——不让用户面对死屏。

**确认删除**：通过 useConfirmDelete hook 统一封装了 confirmDialog + loading + 错误 toast，消除了各处删除操作的样板代码重复。

**服务端错误**：所有 API 路由都有 try/catch + jsonError(err) 兜底。generate 路由还处理了 LLM 返回格式解析失败的特定错误（返回 502 + raw 截断片段便于调试）。

#### 7.2 不足之处

**A. handleCluePatch/handleClueDelete 缺少 res.ok 检查**（已在 2.4 节详述）

**B. handleCommitGen 的 finally 中 missing setCommitting(false) 路径**：
```typescript
// L216-239
const handleCommitGen = async () => {
  // ...
  setCommitting(true);
  try {
    // ...
    if (!res.ok) {
      toastError(...);
      return; // ← 这里 return 了但没执行 finally 之前的 setCommitting(false)?
    }
    // ...
  } catch (err) {
    // ...
  } finally {
    setCommitting(false); // ← finally 总是执行，包括 return 之后
  }
};
```
实际上 finally 块在任何路径（包括 return、throw、正常结束）都会执行，所以 `setCommitting(false)` 一定会被调用。这里没有 bug。✓

**C. 服务端 fire-and-forget 的静默失败**：
PUT /api/storylines/[id] 中的缝合怪逻辑（L59-64）使用 `void fetch(...).catch(() => {})` 自身调用 generate API。如果这个内部调用失败（APP_ORIGIN 配置错误、服务端不可达等），错误被完全吞掉。虽然注释说明了「缝合怪触发失败不影响主线完成本身」，但没有任何日志记录，排查问题时会很困难。建议至少加一个 `console.warn` 或写入 structured log。

### 八、测试覆盖评估

#### 8.1 现有测试基线

运行 `npx vitest run` 结果：**43 个测试文件，368 个测试用例，全部通过**，耗时 2.80 秒。

与故事线相关的现有测试文件：

| 测试文件 | 覆盖范围 | 用例数 |
|---------|---------|-------|
| `src/lib/storyline-progress.test.ts` | computeStorylineProgress / groupStorylinesByMain 纯函数 | （包含在 368 中） |
| `src/core/storyline/execute-task.test.ts` | runStorylineGenerationTask 服务端执行器 | （包含在 368 中） |
| `src/core/pipeline/outline-context.test.ts` | getCompletedMainIds / isRehangTargetActiveMain / pickReassignMainId | 4 |
| `src/app/api/projects/import/route.test.ts` | 项目导入（间接涉及故事线创建） | （部分） |

#### 8.2 测试覆盖盲区（P0）

**完全缺失的测试领域**：

1. **StorylineWorkbench 组件测试**：无。这是故事线模块最复杂的组件（965 行），包含轮询、中间态编辑、表单提交、线索 CRUD 等多种交互流程。没有任何测试验证：
   - 点击「AI 生成」是否正确创建任务并启动轮询
   - 轮询收到 done 状态后是否正确设置 genSuggestions
   - 中间态编辑器的表单输入是否正确更新 suggestions
   - 「采用并落库」是否发送正确的 payload
   - 编辑/保存流程是否正确
   - 卸载时是否清理 interval

2. **StorylineList 组件测试**：无。未验证：
   - 列表加载/错误/空状态的渲染
   - 展开/折叠支线的行为
   - 点击列表项是否正确打开工作台
   - AI 生成按钮的完整流程

3. **API 路由集成测试**：
   - `POST /api/storylines/generate`（无测试）—— 这是核心 AI 生成逻辑，涉及 LLM 调用和数据库写入
   - `POST /api/generation-tasks` + `GET /api/generation-tasks/[id]`（无测试）—— 后台任务创建和状态查询
   - `GET /api/storylines`（无测试）
   - `PUT /api/storylines/[id]`（无测试）—— 包括缝合怪触发逻辑
   - `POST /api/storylines/[id]/events`（无测试）
   - `PUT/DELETE /api/storyline-events/[id]`（无测试）

4. **自定义 Hook 测试**：
   - `useConfirmDelete`（无测试）—— 虽然 hook 逻辑简单（confirmDialog + deleteFn + toast），但其组合行为值得测试

**测试覆盖率估算**：对于故事线相关的前端组件和 API 路由，单元/集成测试覆盖率接近 **0%**。现有的 368 个测试主要集中在核心管线引擎（assembly、babylore、consistency、game-engine 等）和工具函数上，故事线模块作为相对独立的功能域几乎没有测试保护。

**建议优先级**：
1. **P0**：为 execute-task 补充更多边界测试（任务不存在、LLM 抛异常、中途取消等）
2. **P0**：为 storyline-progress 补充 boundary case 测试（null sevenElements、空数组、多主线场景）
3. **P1**：为 StorylineWorkbench 写核心交互测试（@testing-library/react + msw mock API）
4. **P1**：为 generation-tasks API 写集成测试（mock prisma）
5. **P2**：为 StorylineList 写渲染快照测试

---

## 第三部分：发现清单

以下按严重度排序列出所有发现，每条包含编号、严重度、文件位置、现象描述、根因推测和建议修法。

---

### [FE-001] P0 — 故事线前端组件与 API 路由零单元/集成测试覆盖

- **严重度**：P0（阻塞性风险）
- **文件**：`src/components/workspace/StorylineWorkbench.tsx`（965 行）、`src/components/workspace/StorylineList.tsx`（260 行）、`src/app/api/storylines/generate/route.ts`（223 行）、`src/app/api/generation-tasks/route.ts`（52 行）、`src/app/api/generation-tasks/[id]/route.ts`（31 行）
- **现象**：上述 5 个文件没有任何对应的 `.test.ts` 或 `.spec.ts` 测试文件。vitest 的 43 个测试文件、368 个用例中无一覆盖这些组件的渲染、交互或 API 端点的请求/响应逻辑。
- **根因推测**：故事线模块是在 v1.8.4-v1.8.6 期间快速迭代开发的（从 CHANGELOG 可见密集提交），开发节奏优先于测试建设。execute-task.test.ts 和 storyline-progress.test.ts 的存在说明作者有写测试的意识，但组件级和路由级测试尚未跟进。
- **建议修法**：
  1. 最低限度：为 `storyline-progress.ts` 的 `computeStorylineProgress` 和 `groupStorylinesByMain` 补充边界用例（null 输入、空数组、single main with no sides、multiple mains with orphan sides、completed main fallback）。
  2. 为 `execute-task.ts` 的 `runStorylineGenerationTask` 补充：任务不存在时的静默退出、LLM 抛异常时的 failed 状态写入、正常完成时的 result 结构验证。
  3. 使用 `@testing-library/react` + `msw`（Mock Service Worker）为 StorylineWorkbench 编写核心交互测试：mount → 验证加载态 → mock API 返回 → 验证列表渲染 → 点击 AI 生成 → 验证轮询启动 → mock task done → 验证中间态出现 → 编辑 → 落库 → 验证 toast + 刷新。
  4. 为 API 路由编写集成测试（mock prisma client）：测试 generate route 的 commit=true/false 分支、generation-tasks 的创建和状态流转。

---

### [FE-002] P1 — 每次写操作触发全量故事线数据重载（N+1 refetch 反模式）

- **严重度**：P1（性能缺陷，中等规模项目即可感知）
- **文件**：`src/components/workspace/StorylineWorkbench.tsx` L183, L291, L311, L339, L351, L359
- **现象**：toggleComplete、handleSave、useConfirmDelete.onSuccess、handleAddClue、handleCluePatch、handleClueDelete 共 6 个操作路径，每一个在成功后都调用 `void load()` 触发 `GET /api/storylines?projectId=xxx?include=events`，下载该项目全部故事线及所有事件的完整 JSON。对于线索编辑这类细粒度操作（只改动一条 event 的 tag/content），代价尤其不合理。
- **根因推测**：早期开发选择了最简单的「修改后全量刷新」策略以保证数据一致性，未随功能复杂度增长而优化。这种模式在原型阶段可接受，但在产品化阶段会成为性能瓶颈。
- **建议修法**（三选一，推荐方案 1）：
  1. **乐观更新 + debounce 校准**：写操作成功后立即用 `setList(prev => ...)` 本地 patch 对应记录，同时启动 300ms debounce 的 `load()` 做服务端校准。用户体验上操作即时生效，网络上有去重保护。
  2. **增量 API**：后端线索增删改接口返回更新后的单条 event 记录，前端直接 splice/replace 到本地 list 对应 storyline.events 数组中。
  3. **引入 SWR/React Query**：用数据缓存库替代手动的 useState + fetch + load 模式，获得自动缓存、去重、revalidate、optimistic update 等开箱即用的能力。

---

### [FE-003] P1 — StorylineList 与 StorylineWorkbench 存在大量代码重复

- **严重度**：P1（可维护性债务，增加变更成本和 bug 风险）
- **文件**：`src/components/workspace/StorylineList.tsx` 全文 vs `src/components/workspace/StorylineWorkbench.tsx` 全文
- **现象**：
  1. **load 函数**：两处 ~15 行几乎相同的 fetch + error handling 代码（List L51-66 vs Workbench L133-151）。
  2. **handleGenerate**：两处 ~20 行相似的 POST /api/generation-tasks 逻辑（List L72-97 vs Workbench L190-213）。
  3. **分组 + 孤儿过滤**：两处都调用 groupStorylinesByMain + 相同的 orphanSides 过滤条件（List L108/L221-236 vs Workbench L158-159/L552-563）。
  4. **进度条 UI**：相似的 h-1 rounded-full + width style markup（List L194-196 vs LineNav L877-884）。
  5. **循环依赖**：List import Workbench 组件（L7），Workbench import List 的 StorylineData 类型（L11）。
- **根因推测**：StorylineList 先开发（作为左栏紧凑视图），后来 StorylineWorkbench 作为增强版弹窗被开发时，直接复制了 List 的核心逻辑并扩展，未及时抽象共享层。随着功能迭代（v1.8.6 加入真后台轮询、v1.8.7 双路径统一），两处的差异逐渐增大但共同部分从未提取。
- **建议修法**：
  1. 新建 `src/components/workspace/useStorylines.ts` hook：封装 `fetch /api/storylines` + state 管理 + error/loading，返回 `{ storylines, loading, error, reload }`。List 和 Workbench 都消费此 hook。
  2. 新建 `src/components/workspace/useStorylineGeneration.ts` hook：封装 `POST /api/generation-tasks` + taskId 管理，返回 `{ generating, genTaskId, startGeneration }`。
  3. 新建 `src/types/storyline.ts`：存放 StorylineData、StorylineEventData、StorylineSuggestion 类型定义，打破循环依赖。
  4. 提取 `StorylineNavTree` 纯展示组件：接收分组后的数据 + 回调 props，供 List 和 Workbench 的左列导航共用。

---

### [FE-004] P1 — 轮询机制缺少防御性清理（双重 interval 风险）

- **严重度**：P1（可靠性隐患，低概率高影响）
- **文件**：`src/components/workspace/StorylineWorkbench.tsx` L85-124（startPolling）
- **现象**：`startPolling` 函数在被调用时直接 `pollRef.current = setInterval(...)` 设置新 interval，但**未先检查并清除已有的 pollRef.current**。如果该函数被连续调用两次（例如：用户在 generating=false 的瞬间连点两次「AI 生成」按钮；或 mount effect 的 initialTaskId 路径与某个异步竞态条件同时触发），会产生两个并行 interval，每个都独立轮询并调用 setState。
- **根因推测**：startPolling 设计时主要考虑单一入口场景（要么 mount effect 触发，要么 handleGenerate 触发），未考虑并发调用防御。虽然当前 UI 层面的 disabled 逻辑大幅降低了并发概率，但作为公共 API（useCallback 导出，理论上可被任意效应调用），应当自身具备幂等性。
- **建议修法**：在 startPolling 函数开头加入：
  ```typescript
  if (pollRef.current) {
    clearInterval(pollRef.current);
    pollRef.current = null;
  }
  ```
  同时引入 mountedRef 防止卸载后 setState（见 FE-005）。

---

### [FE-005] P2 — 组件卸载后 in-flight fetch 仍执行 setState（无 AbortController）

- **严重度**：P2（资源浪费 + 潜在的 ghost toast）
- **文件**：`src/components/workspace/StorylineWorkbench.tsx` L89-121（interval callback 内的 fetch）
- **现象**：setInterval 回调中的 `fetch(/api/generation-tasks/${taskId})` 是异步操作。当组件因用户关闭工作台而卸载时：
  1. cleanup 函数执行 `clearInterval(pollRef.current)` —— 停止后续调度 ✓
  2. 但如果当时恰好有一个 fetch 正在进行中（await 中），该 fetch 的 response 仍会被处理
  3. 回调内的 `setGenTask(...)`、`setGenerating(false)`、`setGenSuggestions(...)` 会对已卸载组件执行
  4. 若轮询结果是 failed，还会触发 `toastError(...)` —— 用户看到已关闭弹窗后的错误提示
- **根因推测**：开发时关注了 interval 的清理（clearInterval），但遗漏了 interval 回调内部异步操作的清理。这是 React 中使用 setInterval + async callback 的常见陷阱。
- **建议修法**：
  ```typescript
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 在 startPolling 的 interval callback 开头:
  if (!mountedRef.current) return;

  // 或更彻底：使用 AbortController
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);
  // 每次 fetch 传入 signal: abortRef.current.signal
  ```

---

### [FE-006] P2 — storyline-progress.ts 使用 any 类型破坏类型安全链

- **严重度**：P2（类型安全缺失，编译期无法捕获错误）
- **文件**：`src/lib/storyline-progress.ts` L25, L67, L57-65
- **现象**：
  - `computeStorylineProgress(s: any)` —— 参数无类型约束
  - `groupStorylinesByMain(storylines: any[])` —— 参数无类型约束
  - `StorylineGroup` 接口中 `mains: any[]`, `sides: any[]`, `fallbackMain: any | null`, `resolveParent: (s: any) => any | null`, `childrenOf: (mainId: string) => any[]` —— 返回值全无类型
  - 这导致 StorylineWorkbench 和 StorylineList 中所有从这两个函数获得的值都是 any 类型，下游所有属性访问（`.id`, `.type`, `.title`, `.sevenElements` 等）失去 TypeScript 保护
- **根因推测**：storyline-progress.ts 最初可能是作为独立脚本编写的（不受组件类型系统约束），后来被组件引用时未做类型迁移。any 的便利性（无需处理 undefined 检查的 narrow）使其一直延续下来。
- **建议修法**：
  ```typescript
  import type { StorylineData } from "@/components/workspace/StorylineList";
  // 或更好的：将 StorylineData 移到 types/storyline.ts 避免循环依赖

  export function computeStorylineProgress(s: StorylineData): StorylineProgress { ... }
  export function groupStorylinesByMain(storylines: StorylineData[]): StorylineGroup { ... }

  export interface StorylineGroup {
    mains: StorylineData[];
    sides: StorylineData[];
    fallbackMain: StorylineData | null;
    resolveParent: (s: StorylineData) => StorylineData | null;
    childrenOf: (mainId: string) => StorylineData[];
  }
  ```
  修改后，Workbench 和 List 中所有 `m.id`、`s.type` 等访问都会获得完整的类型检查和 IDE 支持。

---

### [FE-007] P2 — handleCluePatch 和 handleClueDelete 不检查 HTTP 响应状态码

- **严重度**：P2（错误静默，用户无反馈）
- **文件**：`src/components/workspace/StorylineWorkbench.tsx` L344-355（handleCluePatch）、L356-363（handleClueDelete）
- **现象**：
  ```typescript
  // L346-351
  const handleCluePatch = async (id: string, patch: Record<string, string>) => {
    try {
      await fetch(`/api/storyline-events/${id}`, { method: "PUT", ... }); // ← 无 res.ok 检查
      void load();
    } catch (err) { toastError(...); }
  };
  ```
  当 fetch 完成（HTTP 层面成功，如返回 404 Not Found 或 500 Internal Server Error）时，代码直接跳到 `void load()` 而不检查 `res.ok`。用户看到的 behavior 是：编辑似乎成功了（UI 因 load 刷新而更新），但实际上服务端可能拒绝了修改。
- **根因推测**：这两处 handler 是后期追加的功能（线索的行内编辑），编写时沿用了 fetch 的基本模式但遗漏了 res.ok 分支。对比同文件的 handleSave（L280-298）和 handleToggleComplete（L169-188）都有完整的 res.ok 检查，说明这不是团队编码规范的缺失，而是个别遗漏。
- **建议修法**：参照 handleSave 的模式补充：
  ```typescript
  const res = await fetch(`/api/storyline-events/${id}`, { method: "PUT", ... });
  if (!res.ok) {
    const d = await res.json().catch(() => ({ error: "未知错误" }));
    toastError("更新线索失败：" + ((d as { error?: string }).error || `HTTP ${res.status}`));
    return;
  }
  void load();
  ```

---

### [FE-008] P2 — AI 中间态编辑器的「结局」字段在落库时被静默丢弃

- **严重度**：P2（数据一致性 / 产品逻辑矛盾）
- **文件**：`src/components/workspace/StorylineWorkbench.tsx` L460-469（ELEMENT_META 含 ending）、L371-379（updateSuggestionElement 允许编辑 ending）；`src/app/api/storylines/generate/route.ts` L141-149（toSevenElements 强制 ending: null）
- **现象**：用户在 AI 生成中间态编辑器中可以看到并编辑「结局（待收束）」字段（它是 ELEMENT_META 数组的最后一个元素，与其他 6 个要素并列渲染为 DialogInput）。用户可以为每条 AI 建议填写结局内容。但点击「采用并落库」后，无论用户填写了什么，toSevenElements 函数都会将 ending 强制设为 null。用户的输入被无声丢弃。
- **根因推测**：v1.8.4 变更引入了「结局不可预填」的产品规则（ending 始终为 null，仅作待收束标记），后端 toSevenElements 据此硬编码 `ending: null`。但前端中间态编辑器复用了 ELEMENT_META 常量数组（包含 ending）来渲染编辑表单，未对该字段做特殊处理（如 readonly、disabled 或隐藏）。前后端对 ending 字段的语义理解不一致。
- **建议修法**（推荐方案 A）：
  - 在中间态编辑器中，将 ending 字段渲染为只读提示：「结局不可在此填写，落库后可通过『标记收束』设定」
  - 或从 ELEMENT_META 中移除 ending（仅在查看态的七要素网格中展示「待收束」占位符）
  - 方案 B（若产品决定允许预设结局）：修改 toSevenElements 为 `ending: line.ending ?? null`

---

### [FE-009] P2 — StorylineData.status 使用 string 而非联合类型

- **严重度**：P2（类型精度不足，编译期无法拦截非法值）
- **文件**：`src/components/workspace/StorylineList.tsx` L27（`status: string`）
- **现象**：StorylineData 接口中 status 字段定义为 `string`，而实际取值只有 `"active"` | `"completed"` | `"abandoned"` 三种（从 Workbench 的 select option L602-606 和 toggleComplete 逻辑 L170 可确认）。使用 string 导致：
  - `s.status === "completed"` 不产生类型缩窄
  - 传入非法值（如 `"done"`）编译器不报错
  - IDE 无法提供自动补全
- **根因推测**：接口定义时选择了最简单的类型，未随业务逻辑固化而收紧。
- **建议修法**：
  ```typescript
  export type StorylineStatus = "active" | "completed" | "abandoned";
  // 在 StorylineData 中:
  status: StorylineStatus;
  ```

---

### [FE-010] P2 — LineNav 中 toggle-complete 使用 span+onClick 嵌套在 button 内（a11y + HTML 合规问题）

- **严重度**：P2（可访问性缺陷 + HTML 规范违规）
- **文件**：`src/components/workspace/StorylineWorkbench.tsx` L862-875（LineNav 内的 toggle span）
- **现象**：
  ```tsx
  <button onClick={onSelect} className="group w-full ...">
    {/* ... 标题和进度条 ... */}
    <span
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="shrink-0 ..."
      title="标记完结"
    >
      {s.status === "completed" ? <Icon name="check" /> : <Icon name="circle" />}
    </span>
  </button>
  ```
  外层是 `<button>`（键盘可访问、可聚焦），内层的 toggle 用 `<span onClick>` 实现。问题：
  1. span 不是交互元素，无法通过 Tab 聚焦，无法通过 Enter/Space 激活
  2. 屏幕阅读器不会将 span 识别为按钮
  3. 虽然 stopPropagation 阻止了事件冒泡到外层 button，但这种嵌套交互元素的模式违反了 WCAG 的可操作性指南
- **根因推测**：开发者有意避免 `<button>` 嵌套 `<button>`（HTML 解析器会将内层 button 提升到外层之外），因此改用 span。但 span+onClick 在可访问性上等同于缺失。
- **建议修法**：将 span 替换为 `<button type="button" onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-label="标记完结" className="...">`，并确保 focus 样式不干扰视觉设计。

---

### [FE-011] P3 — 轮询无退避策略和无最大次数限制

- **严重度**：P3（边缘场景的资源浪费）
- **文件**：`src/components/workspace/StorylineWorkbench.tsx` L121（`}, 1500)`）
- **现象**：setInterval 固定 1500ms 间隔，无退避、无最大轮询次数。如果服务端任务因 LLM 超时、进程崩溃等原因永远停留在 "running" 或 "pending" 状态，轮询会持续到用户主动关闭工作台为止。假设用户打开了工作台后去做别的事（工作台保持在后台），30 分钟内会触发约 1200 次无用请求。
- **根因推测**：轮询机制在 v1.8.6 快速落地时选择了最简单的固定间隔方案，未考虑长时间运行的边界情况。
- **建议修法**：
  ```typescript
  // 方案 A：指数退避
  let delay = 1500;
  const maxDelay = 10000;
  pollRef.current = setInterval(async () => {
    // ... poll logic ...
    if (t.status === "pending" || t.status === "running") {
      delay = Math.min(delay * 1.5, maxDelay);
      clearInterval(pollRef.current);
      pollRef.current = setInterval(pollFn, delay);
    }
  }, delay);

  // 方案 B：最大次数
  let pollCount = 0;
  const MAX_POLLS = 240; // 240 * 1.5s = 6 minutes
  // 在 callback 中: if (++pollCount > MAX_POLLS) { clearInterval(...); toastError("生成超时"); }
  ```

---

### [FE-012] P3 — orphanSides 过滤条件包含永假的 dead code

- **严重度**：P3（代码整洁性，不影响功能）
- **文件**：`src/components/workspace/StorylineWorkbench.tsx` L159；`src/components/workspace/StorylineList.tsx` L222
- **现象**：
  ```typescript
  const orphanSides = sides.filter((s) => !resolveParent(s) || resolveParent(s)?.id === s.id);
  ```
  `resolveParent(s)` 对于 side 类型的故事线，返回的是其 parentId 对应的主线（或 fallbackMain），**永远不会返回 side 自身**（因为 resolveParent 在 list 中查找 id === s.parentId 的元素，而 s.parentId 指向一条 main，不可能等于 s.id）。因此 `resolveParent(s)?.id === s.id` 这个条件永远是 false，属于 dead code。
- **根因推测**：这个条件可能是早期调试遗留或从其他地方 copy-paste 过来的防御性代码，实际不需要。
- **建议修法**：简化为 `const orphanSides = sides.filter((s) => !resolveParent(s));`，消除误导性的 dead condition。

---

### [FE-013] P3 — toastCreated 调用参数冗余导致文案怪异

- **严重度**：P3（文案质量）
- **文件**：`src/components/workspace/StorylineWorkbench.tsx` L229
- **现象**：`toastCreated("故事线", "故事线")` 产生的 toast 显示文本为 `故事线「故事线」已创建`——name 和 kind 完全相同导致语义重复。
- **根因推测**：开发者可能混淆了 toastCreated 的参数语义（name=实体名称, kind=类别名称），传入了相同的值。
- **建议修法**：改为 `toastCreated("故事线")`（只传实体名，description 为 `「故事线」已创建`）或 `toastCreated("故事线", "故事线组")`。

---

### [FE-014] P3 — 进度条 label「七要素」与实际计数 6 不一致

- **严重度**：P3（文案准确性）
- **文件**：`src/lib/storyline-progress.ts` L34（`label: \`七要素 ${filled}/${elementTotal}\``）；`src/components/workspace/StorylineWorkbench.tsx` L711（UI 标题 `七要素 · 总纲`）
- **现象**：computeStorylineProgress 的 SEVEN_ELEMENT_FILL_KEYS 只包含 6 个 key（desire/obstacle/action/result/twist/turn，不含 ending），elementTotal=6。但 label 写的是「七要素 4/6」，UI 标题写的是「七要素」。用户看到「七要素」但计数是 6，可能困惑。
- **根因推测**：产品设计上确实叫「七要素」（含结局），但技术实现上结局不计入填充度。命名未同步调整。
- **建议修法**：label 改为 `六要素 ${filled}/6`（或 `要素 ${filled}/6（不含结局）`），UI 标题改为 `要素总纲（结局单独标记）`。

---

## 总结

### 质量判断

novel-forge v1.8.9 的故事线工作台模块在**功能完整性和用户体验设计**上达到了较高的水准——AI 中间态编辑、七要素驱动架构、时间轴+线索集的组合形成了有深度的叙事工具。代码在**基础工程质量**上也通过了 TypeScript 零错误编译和 368 个全量测试通过的基线。

然而，从**前端工程化的严格标准**来看，存在以下分层级的改进空间：

| 层级 | 问题数 | 关键词 |
|------|-------|--------|
| P0（必须修） | 1 | 测试覆盖空白 |
| P1（应该修） | 3 | N+1 refetch、代码重复、轮询防御 |
| P2（建议修） | 6 | any 类型、res.ok 遗漏、结局丢弃、status 类型、a11y、AbortController |
| P3（可优化） | 4 | 退避策略、dead code、文案冗余、计数不一致 |

**最紧迫的三项改进建议**（按投入产出比排序）：

1. **提取共享 hook（useStorylines + useStorylineGeneration）**——一次性解决 FE-002（N+1 refetch）、FE-003（代码重复）、FE-006（any 类型）的大部分问题，预计减少 80-100 行重复代码并为后续测试铺路。
2. **补写核心测试**——至少覆盖 storyline-progress 边界 case + StorylineWorkbench 的 AI 生成→轮询→中间态→落库主流程，将测试覆盖率从 ~0% 提升到核心路径全覆盖。
3. **修复 FE-008（结局字段丢弃）+ FE-010（a11y toggle）**——前者影响用户信任度（「我填的东西哪去了？」），后者影响无障碍合规性，两者修改量小但收益明确。

### 风险评估

- **数据丢失风险**：低（FE-008 的结局丢弃是已知的产品规则，不影响核心数据）
- **性能退化风险**：中（FE-002 的 N+1 refetch 在大型项目下会放大延迟，但目前故事线数量通常 < 50）
- **稳定性风险**：低（无内存泄漏、无未捕获异常的主要路径；FE-004/FE-005 的概率性 issues 影响有限）
- **可维护性风险**：中高（FE-003 的代码重复 + 循环依赖会增加后续 feature 开发和 bug fix 的回归风险）

---

*报告完毕。共发现 14 条问题（P0×1, P1×3, P2×6, P3×4），覆盖 TypeScript 类型安全、React 最佳实践、性能优化、资源泄漏、代码重复、API 一致性、错误处理、测试覆盖、可访问性和文案质量十个维度。*
