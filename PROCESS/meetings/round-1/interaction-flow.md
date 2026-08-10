# 故事线工作台交互流程与功能完整性深度体验报告

**产品**：novel-forge  
**版本**：v1.8.9（本地 HEAD `78871ee`）  
**入口 URL**：`http://localhost:3001/workspace/577ed326-b241-4f67-9481-c9332cb03626`  
**重点组件**：StorylineList、StorylineWorkbench  
**评审 lens**：交互流程与功能完整性  
**评审日期**：2026-08-10  
**评审人**：interaction-flow 子 Agent（MaxLoop 魔王系统）

## 体验目标与方法

本次体验聚焦用户从进入 workspace 到完成「故事线」管理目标的完整链路，重点验证以下 6 条交互流程：

1. 从项目首页进入 workspace → 点击「故事线」标签 → 打开 StorylineList → 点击某故事线 → 打开 StorylineWorkbench；
2. 在工作台内：选择不同故事线、展开/折叠七要素、编辑字段、保存；
3. 点击「AI 生成」：观察 pending/running/done/failed 全状态流转；
4. AI 生成成功后进入中间编辑态 → 修改 → 点击「采用并落库」；
5. 异常分支：网络断开、LLM 失败、空项目、无故事线、快速连续点击生成；
6. 关闭弹窗再打开：状态是否恢复、轮询是否清理。

方法上采用「代码静态走查 + 运行截图 + 日志/控制台检查」三位一体：

- 通读了 `StorylineWorkbench.tsx`、`StorylineList.tsx`、`storylines/generate/route.ts`、`generation-tasks/[id]/route.ts`、`generation-tasks/route.ts`、`workspace/[projectId]/page.tsx` 等关键文件；
- 通过 `Grep` 检索了 `api/storylines/generate`、`generation-tasks`、`newMain`、`runStorylineGenerationTask` 等关键调用链，确认是否存在同步/异步双路径残留；
- 使用 `node shot2.cjs` 及自定义 Playwright 脚本对真实 dev 服务进行无头截图，观察「打开态」「生成中态」；
- 监听浏览器 console 与 pageerror，确认运行时无异常输出。

> 截图证据保存在 `C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge\shots\`：
> - `if_list.png`：故事线列表打开态；
> - `if_workbench.png`：故事线工作台查看态；
> - `if_generating.png`：AI 生成中态（按钮显示「生成中… 10%」）。

---

## 第一部分：用户体验视角

### 1.1 入口与导航体验

 novel-forge 的 workspace 页面是一个三栏式写作台：左侧大纲/资料栏、中间正文区、右侧工具箱。进入项目后，用户在左侧顶部 tab 栏切换即可到达「故事线」。从代码看，`LeftPanel.tsx:47` 的 tab 标签为 `故事线 (${project.storylines?.length || 0})`，会实时显示当前项目的故事线数量。运行时点击该 tab 后，列表几乎无感知加载地出现（StorylineList 自身会发 `GET /api/storylines?projectId=xxx` 请求，本地 dev 环境下延迟极低）。

截图 `if_list.png` 显示列表呈现为一个紧凑的卡片组：

- 顶部工具栏左侧显示 `13 条故事线`，右侧是「AI生成」按钮；
- 每条主线以金色/高亮卡片承载，显示标题与主线进度条；
- 支线默认折叠，仅在点击主线的「展开」箭头后下滑出现；
- 无父归属的支线平铺在最底部。

这一导航结构符合「主线优先、支线可收起」的认知模型。用户在打开列表的瞬间就能判断项目的故事线数量、活跃主线与进度概况。唯一略感遗憾的是，13 条故事线在窄屏左侧栏中需要滚动，而主线/支线层级仅靠缩进和图标区分，没有更明显的视觉分组底色。对于多主线项目（如本例中 3 条 active main），卡片色块相同，第一眼难以区分哪条是“当前主主线”。

### 1.2 流程 F1：进入工作台查看单条故事线

点击任意故事线标题后，`StorylineList.tsx:241-255` 中的条件渲染会挂载 `StorylineWorkbench` 组件，并把当前选中的 `workbenchId` 作为 `initialId` 传入。工作台的 Modal 是 `bare` 模式，占据屏幕中央，最大宽度 `max-w-5xl`，高度 `max-h-[92vh]`，整体视觉层级清晰，不会完全遮蔽背后的 workspace，暗示这是一个「临时弹窗任务」。

从截图 `if_workbench.png` 可见，工作台打开后呈现典型的「左导航 + 右详情」布局：

- 左侧导航复用了与列表一致的树形结构，当前选中项以金色边框高亮；
- 右侧详情区顶部展示故事线类型标签（主线/支线）、标题、简述与操作按钮（标记完结、编辑、删除）；
- 中部是「七要素 · 总纲」网格，每个卡片左侧带图标、右侧为当前字段内容；
- 下部依次是「章节进展时间轴」「线索集/纸集」。

对于选中的「龙陨之地·主线」，七要素卡片中的欲望、阻碍、行动、结果、意外、转折均显示为 `—`（空占位），结局显示为 `待收束`。这与代码 `StorylineWorkbench.tsx:726-732` 的展示逻辑一致：字段为空时显示占位符， ending 特殊显示「待收束」。这种占位处理能明确区分「未填写」与「零值字符串」，避免用户误以为数据丢失。

流程闭环判断：

- 进入路径完整：workspace → 故事线 tab → 列表 → 工作台；
- 信息架构清晰：查看态同时提供元信息、七要素、时间轴、线索集，覆盖了故事线管理的常见需求；
- 缺少的是「返回/面包屑」式提示：工作台 title 只有「故事线工作台」五个字，没有显示当前项目名或当前所在路径。对于多项目用户，弹窗标题没有提供足够的上下文安全感。

### 1.3 流程 F2：切换、展开/折叠、编辑与保存

#### 切换故事线

左侧导航中，每个 `LineNav` 都是 `button` 元素，点击后 `onSelect` 将 `selectedId` 设置为当前故事线 id，同时 `setEditing(false)`（`StorylineWorkbench.tsx:529-532、542-545、557-560`）。这意味着切换故事线会自动退出编辑态，防止用户在 A 线编辑到一半误切到 B 线时把未保存内容带过去。这个设计合理，但缺少一个过渡反馈——切换瞬间右侧直接刷新，没有 100-200ms 的淡入或骨架屏，13 条故事线快速切换时会有轻微「跳变」感。

#### 展开/折叠七要素

查看态的七要素网格全部平铺展示，没有折叠交互；只有「线索集/纸集」区域有一个可折叠的头部按钮（`StorylineWorkbench.tsx:768-776`）。如果用户在查看态只想快速扫一眼标题和简述，七要素网格会占据大量垂直空间。虽然单条故事线的七要素卡片只有 7 个，但在低分辨率或需要频繁滚动时，缺少「收起七要素」会让信息密度偏高。

#### 编辑态与字段保存

点击「编辑」后进入编辑态（`startEdit`，`StorylineWorkbench.tsx:241-258`）。编辑态的布局与查看态几乎一致，只是把展示文本替换为输入框。字段覆盖：标题、简述、类型、状态、所属主线（仅 side 时显示）、七要素。字段默认值从当前故事线读取，如果 `sevenElements` 为空对象则退化为空字符串。

保存逻辑在 `handleSave`（`StorylineWorkbench.tsx:260-298`）：

1. 校验 `selected` 存在；
2. 组装 payload，包括 `parentId` 的归一化：`form.type === "main" ? null : form.parentId || null`；
3. `PUT /api/storylines/${selected.id}`；
4. 成功后 `setEditing(false)`，并 `void load(); onRefresh();`。

体验上，保存成功后 toast 提示「已保存 ✓」或「故事线已保存」（`toastSuccess` 文案由调用方指定，代码中为 `toastSuccess("已保存 ✓")`），并自动刷新列表和父级。这是一个完整的闭环。但有一个细节：保存失败时，`handleSave` 在 `if (!res.ok)` 分支 toastError 后直接 `return`，没有重置 `saving` 状态——等等，仔细看代码：`saving` 状态由 `useState` 管理，`handleSave` 开头 `setSaving(true)`，整个 `try/catch/finally` 在 `finally` 中 `setSaving(false)`。所以即使中间 `return`，finally 仍会执行。OK，没有 bug。

#### 状态切换（标记完结）

点击「标记完结」会触发 `handleToggleComplete`（`StorylineWorkbench.tsx:169-188`）。这是一个快速状态切换：

- 当前 active → completed；
- 当前 completed → active；
- abandoned 状态？代码只判断 `s.status === "completed"`，如果是 abandoned 也会走「active」分支（显示「标记完结」），但实际 API 返回的 status 会变成 active。这个行为可能不是用户预期：一个已废弃的故事线，用户看到按钮文案是「标记完结」，点击后反而把它激活了。这是文案与状态逻辑不一致的地方。

更值得关注的是：当一条主线被标记 completed 且项目中已无其他 active 主线时，`src/app/api/storylines/[id]/route.ts:46-69` 会触发「缝合怪推进」自动构造新主线。但这个行为在 UI 上完全没有反馈——用户只看到 toast「「XXX」已完结 ✓」，并不知道系统正在后台调 LLM 生成新主线。下文会详细分析这条隐藏链路。

### 1.4 流程 F3：点击「AI 生成」的状态机流转

#### 入口 A：从故事线列表进入

在 StorylineList 顶部点击「AI生成」按钮（`StorylineList.tsx:72-97`），流程如下：

1. `setGenerating(true)` 禁用按钮；
2. `POST /api/generation-tasks`，请求体仅 `{ projectId }`；
3. 成功后获得 `data.taskId`；
4. `setGenTaskId(data.taskId)` 记录任务 id；
5. `setWorkbenchId("__task__")` 打开工作台；
6. `setGenerating(false)`。

关键点：列表入口不再阻塞等待 LLM，而是立刻打开工作台并把轮询交给工作台。截图 `if_generating.png` 捕捉到的正是工作台挂载后立即开始轮询的瞬间，右上角按钮已变为「生成中… 10%」。

#### 入口 B：从工作台内部进入

工作台右上角也有一个「AI 生成」按钮（`StorylineWorkbench.tsx:398-413`），点击后走的是 `handleGenerate`（`StorylineWorkbench.tsx:190-213`）：

1. `setGenerating(true)`、清空旧任务；
2. `POST /api/generation-tasks`，请求体 `{ projectId, prompt: genExtra }`；
3. 获得 `taskId`；
4. `startPolling(taskId)`。

#### 状态机观察

后台任务执行器 `runStorylineGenerationTask` 在 `src/core/storyline/execute-task.ts:56-84` 中把状态推进得非常明确：

- 创建任务后立即 `prisma.generationTask.update({ status: "running", progress: 10 })`；
- 然后 `loadProjectContext` → `generateStorylineSuggestions`（调用 LLM）；
- 成功 → `status: "done", progress: 100, result: { suggestions }`；
- 失败 → `status: "failed", error: message`。

前端轮询函数 `startPolling` 每 1500ms 调用 `GET /api/generation-tasks/${taskId}`，根据返回的 `status` 更新 UI：

- `pending`/`running`：继续轮询，按钮显示「生成中… ${progress}%」；
- `done`：把 `result.suggestions` 写入 `genSuggestions`，进入中间编辑态；
- `failed`：toast 错误，停止轮询，恢复按钮。

运行截图 `if_generating.png` 显示进度 10%，说明请求命中了「创建任务 → 立即 running → 前端拿到 taskId → 轮询到 running」这一整条链路。按钮的禁用样式、加载动画、百分比文案都符合预期。

#### 状态反馈的文案

生成中按钮文案：`generating ? (genTask?.status === "running" ? "生成中… ${genTask.progress}%" : "生成中…") : "AI 生成"`（`StorylineWorkbench.tsx:403-411`）。注意这里有一个小分支：当 `generating=true` 但 `genTask` 仍为 null（刚点完按钮但轮询函数还未写入第一次状态）时，显示的是「生成中…」而不是「生成中… 0%」。截图中显示 10%，说明轮询第一拍就拿到了 running 状态。整体文案清晰。

潜在问题：

- 没有「已排队」概念。任务创建后状态直接变成 running，对 LLM 调用前的准备阶段（如上下文读取）没有 progress 反馈，用户只能看到 10% 跳到 100%；
- 当进度为 0 或 null 时，按钮只显示「生成中…」，缺少更生动的描述（如「正在读取角色卡与世界书」）。

### 1.5 流程 F4：中间编辑态 → 修改 → 采用并落库

当轮询到 `done` 后，工作台进入中间编辑态（`StorylineWorkbench.tsx:426-496`）。这个状态会覆盖整个工作台主体，左侧导航消失，右侧只展示 AI 生成结果卡片。每张卡片包括：

- 类型标签（主线/支线）；
- 标题输入框；
- 简述输入框；
- 七要素输入框（欲望/阻碍/行动/结果/意外/转折/结局）。

用户可以逐条修改建议。修改是即时响应的本地状态变更，通过 `updateSuggestion` 和 `updateSuggestionElement` 实现（`StorylineWorkbench.tsx:366-379`）。编辑体验与直接编辑故事线非常接近，字段标签和图标一致，认知负担低。

编辑态顶部还有一个「额外要求（可选，仅作提示，不影响已生成内容）」输入框。这个文案本身已经告诉用户「不影响已生成内容」，但问题在于：**它也不影响任何后续操作**。`genExtra` 字段只在「工作台内 AI 生成」的初始 POST 时作为 `prompt` 发送，一旦进入中间编辑态，修改 `genExtra` 不会被提交到「采用并落库」的 API（`handleCommitGen` 只发送 `{ projectId, commit: true, suggestions: genSuggestions }`）。所以用户在中间态写下的补充要求会被无声丢弃。这是一个典型的「死输入」：用户看得见、能打字，但提交时完全不起作用。

落库流程在 `handleCommitGen`（`StorylineWorkbench.tsx:215-239`）：

1. 校验 `genSuggestions`；
2. `POST /api/storylines/generate`，`commit: true`，带上 suggestions；
3. 成功后 `toastCreated("故事线", "故事线")`（这个 toast 文案重复，显示为「故事线 故事线已创建」），清空中间态，刷新列表。

体验上，落库后自动关闭中间态、回到正常视图，并刷新左侧列表，闭环完整。但 toast 文案是一个小瑕疵。

### 1.6 流程 F5：异常分支体验

#### 网络断开

- 生成任务创建阶段：如果 `POST /api/generation-tasks` 失败，`handleGenerate`（列表或工作台）会 catch 并 toastError，设置 `generating=false`。按钮恢复，用户可以重试。闭环完整。
- 轮询阶段：如果 `GET /api/generation-tasks/${taskId}` 抛网络异常，`startPolling` 的 catch 块为空（`StorylineWorkbench.tsx:118-120`），interval 会继续每 1.5s 触发。这意味着如果用户在工作台打开期间断网，按钮将一直显示「生成中…」，没有任何失败提示，也没有超时或最大重试。用户体验是「卡死」——这是一个需要修复的异常分支。
- 如果轮询返回 HTTP 错误（`!r.ok`），代码会 clearInterval、toastError、设置失败状态。这部分闭环完整。

#### LLM 失败

LLM 失败被 `execute-task.ts:77-82` 捕获并写入 DB `status: "failed"`。前端轮询到 failed 后，`StorylineWorkbench.tsx:112-117` 会 toastError 并停止轮询。文案为 `生成失败：${t.error ?? "未知错误"}`。闭环完整。

#### 空项目/无故事线

当项目没有任何故事线时，`StorylineList.tsx:146-156` 渲染 `EmptyState`：

- icon: bookmarked；
- title: 还没有故事线；
- action: 一个禁用态的「点击 AI 自动生成」按钮。

这个空状态文案清晰，CTA 明确。点击后会触发与列表入口相同的异步生成流程，打开工作台并轮询。空项目场景（没有角色卡、没有世界观、没有总纲）下，LLM 仍会被调用，prompt 中会出现「（未设定总纲）」「暂无背景」等占位内容，生成结果可能非常空泛。代码没有在前端阻止空项目生成，也没有提示用户「建议先完善总纲和角色卡以获得更好结果」。

工作台的空状态（`StorylineWorkbench.tsx:511-520`）与列表基本一致，也提供了 AI 自动生成入口。两者闭环一致。

#### 快速连续点击生成

在 `StorylineList.tsx` 中，「AI生成」按钮的 `disabled={generating}` 只能阻止同一次渲染内的点击。如果用户在 React 18 状态批处理窗口内双击或三连击，每次 onClick 都可能在 `setGenerating(true)` 实际生效前被触发，导致连续创建多个生成任务。虽然每次创建后 `setGenTaskId` 和 `setWorkbenchId` 会被覆盖，但**最早创建的那个任务会游离在 UI 状态之外**——它在服务端继续跑 LLM，用户却永远无法看到结果，只能看到最后一个任务的结果。这是一个竞态浪费/状态丢失问题。

工作台的「AI 生成」按钮由于 `disabled={generating || !!genSuggestions}`，在生成过程中被禁用，理论上不会在工作台内部被快速连点。但在生成刚完成、中间态尚未出现的瞬间，仍然存在极小的时间窗口。

### 1.7 流程 F6：关闭弹窗再打开

工作台的关闭逻辑在 `StorylineList.tsx:246-250`：

```tsx
onClose={() => {
  setWorkbenchId(null);
  setGenSuggestions(null);
  setGenTaskId(null);
}}
```

StorylineWorkbench 的卸载清理在 `StorylineWorkbench.tsx:78-82`：

```tsx
useEffect(() => {
  return () => {
    if (pollRef.current) clearInterval(pollRef.current);
  };
}, []);
```

行为分析：

- 关闭弹窗会立刻卸载 StorylineWorkbench → cleanup 执行 → `clearInterval(pollRef.current)`，轮询确实被清理；
- 关闭时 `setGenSuggestions(null)` 和 `setGenTaskId(null)` 会清空中间态和任务 id；
- 如果用户是在生成过程中关闭弹窗，**任务 id 被清空后，用户再次打开工作台（点击某故事线）时，工作台只会以 `initialId` 挂载，不会恢复对原任务的轮询**。换句话说：生成在服务端继续，但用户失去了查看进度和接收结果的入口，除非他再次点击「AI 生成」创建新任务。

这是一个「断链」问题：真后台任务的设计理念是「关页面不影响服务端任务，重新进页面可再次轮询」，但当前实现没有提供「重新进页面再次轮询」的入口——关闭再打开走的是 `initialId` 路径，而不是 `initialTaskId` 路径。`initialTaskId` 只在「从列表点击 AI 生成」这一特定入口被传入，且该 id 在关闭时就被清空。

### 1.8 功能闭环评价

| 功能 | 闭环状态 | 评价 |
|------|---------|------|
| 查看故事线 | 完整 | 列表 → 工作台 → 查看七要素/时间轴/线索，路径清晰 |
| 编辑故事线 | 完整 | 编辑 → PUT → toast → 刷新列表 |
| AI 生成故事线 | 基本完整 | 创建任务 → 轮询 → 中间编辑态 → 落库 → 刷新 |
| 生成结果编辑 | 完整 | 标题/简述/七要素均可改，本地状态即时响应 |
| 生成中断恢复 | 缺失 | 关闭弹窗后任务 id 丢失，无法恢复轮询 |
| 生成任务历史/管理 | 缺失 | 没有任务列表、取消、重试入口 |
| newMain 自动推进 | 闭环不完整 | 主线完结触发后台 LLM，但 UI 无反馈，结果需手动刷新才能发现 |

### 1.9 文案评价

- **状态提示**：生成中按钮「生成中… 10%」、中间态「AI 生成结果 · 中间编辑态（可修改后再落库）」清晰明确；
- **错误提示**：`创建生成任务失败：${error}`、`生成失败：${error}`、`落库失败：${error}` 基本可理解，但缺少对「为什么会失败」的下一步指引；
- **空状态**：「还没有故事线」「点击 AI 自动生成」直观；
- **问题文案**：
  - `toastCreated("故事线", "故事线")` 导致 toast 显示重复（`StorylineWorkbench.tsx:229`）；
  - 「额外要求（可选，仅作提示，不影响已生成内容）」诚实但无助，且实际上也不影响落库；
  - 标记完结按钮对 abandoned 状态的故事线显示「标记完结」，语义不一致。

### 1.10 UI 设计评价

- **按钮禁用逻辑**：工作台「AI 生成」在生成中或已有中间态时禁用，合理；列表「AI生成」仅在 `generating` 时禁用，缺少对「中间态存在」的禁用（实际上列表的中间态已经不存在了，因为中间态只存在于工作台）；
- **进度反馈**：百分比 + spinner 足够，但缺少 LLM 子阶段文案；
- **表单输入**：`DialogInput` 与 `select` 混用，样式基本统一；
- **信息密度**：七要素网格平铺展示，查看态信息密度高，建议提供折叠能力；
- **Modal 层级**：`max-h-[92vh]` 保证不会顶到屏幕边缘，`overflow-hidden` 保证主体不滚动出 Modal；中间态编辑覆盖主体后左侧导航消失，进入专注编辑模式，这是可接受的设计选择；
- **可访问性**：标题有 `aria-label`，Modal 有 `labelledBy`，按钮大多有 `title`，但生成中按钮没有 `aria-live` 区域，屏幕阅读器用户不会感知进度变化。

---

## 第二部分：总体视角

### 2.1 故事线工作台在 novel-forge 中的定位

故事线工作台不是 novel-forge 的核心创作区（核心创作区是中间的正文编辑器），但它承上启下：

- 向上承接「项目设定」：总纲、角色卡、世界书是生成故事线的输入；
- 向下驱动「章纲/正文生成」：写作时通过 `storylines.find(s => s.status === "active")` 选取活跃主线，用于抽卡、章纲生成等。

从 `workspace/[projectId]/page.tsx` 可以看到，`project.storylines` 会参与 `DrawCards` 的 `storylineId` 选择（line 1354）。因此故事线的状态一致性会直接影响后续写作流程。工作台的状态管理如果出错（例如落库后没有正确刷新 store），会导致右侧抽卡或 PreGen 流程读到旧数据。

当前 `StorylineWorkbench` 通过 `onRefresh` 回调让父级 `workspace/page.tsx` 调用 `loadProject()`，同时自身 `void load()` 刷新本地列表。这个双刷新机制能基本保证一致性，但父级 `loadProject()` 是一个较重的全量请求（拉取项目、节点、角色、世界书等），在频繁编辑故事线时会反复触发。

### 2.2 状态机与 API 调用链分析

#### 前端状态机

StorylineWorkbench 内部的状态变量较多，可以归纳为：

- `list` / `loading` / `error`：故事线列表加载；
- `selectedId`：当前选中；
- `editing` / `form`：编辑态；
- `generating` / `genTask`：AI 生成轮询态；
- `genSuggestions` / `genExtra` / `committing`：中间编辑态；
- `cluesExpanded` / `newClueTag` / `newClueContent`：线索集。

这些状态之间大部分是正交的，但 `generating` 与 `genSuggestions` 有互斥显示：当 `genSuggestions` 存在时，工作台主体被中间态覆盖，同时按钮 `disabled={generating || !!genSuggestions}`。也就是说，只要用户在编辑建议，工作台就无法发起新的 AI 生成。这是合理的，避免新结果覆盖用户正在编辑的旧结果。

#### API 调用链

1. **加载列表**：`GET /api/storylines?projectId=xxx` → `StorylineData[]`；
2. **切换选中**：纯前端状态，无 API 请求；
3. **保存编辑**：`PUT /api/storylines/${id}` → 返回更新后的 storylines；
4. **切换完结**：`PUT /api/storylines/${id}`（仅 status 字段）→ 可能触发服务端 newMain 自请求；
5. **删除**：`DELETE /api/storylines/${id}`；
6. **AI 生成**：`POST /api/generation-tasks` → 返回 `taskId`；
7. **轮询**：`GET /api/generation-tasks/${taskId}`；
8. **落库**：`POST /api/storylines/generate`（`commit=true` + suggestions）→ 批量创建 stories；
9. **线索 CRUD**：`POST/PUT/DELETE /api/storylines/${id}/events` 与 `/api/storyline-events/${id}`。

整体链路清晰。v1.8.7 的重要收敛是把 StorylineList 的 AI 生成入口也改为 `POST /api/generation-tasks`，与 StorylineWorkbench 共用同一套后台任务机制。但仍保留了一条「暗线」：主线完结时 `storylines/[id]/route.ts` 会 `void fetch` 调用 `/api/storylines/generate?mode=newMain`，走的是同步 LLM 路径，没有走 `generation-tasks`。这是架构上的不一致。

### 2.3 质量与风险

#### 竞态条件

1. **快速连点创建多任务**（见发现 001）：`StorylineList.handleGenerate` 使用 `generating` 作为按钮禁用条件，但 React 状态更新存在批处理窗口，多任务可被创建。
2. **落库与同时轮询**：`handleCommitGen` 成功后 `setGenSuggestions(null)`。理论上如果用户在落库请求尚未返回时点击了 AI 生成按钮，由于按钮在 `committing` 时并未被禁用（`disabled={committing}` 只在「采用并落库」按钮上，不在 AI 生成按钮上），用户可能在落库过程中发起新 AI 生成。实际上中间态覆盖主体时 AI 生成按钮被 `!!genSuggestions` 禁用，但 `handleCommitGen` 只清空中表态在成功后，中间态仍然存在，所以 AI 生成按钮仍被禁用。竞态不严重。
3. **保存与列表刷新**：`handleSave` 中 `void load(); onRefresh();` 是「fire-and-forget」，没有等待两者完成。如果用户快速连续保存，可能触发多个并行请求。但由于 PUT 是幂等（更新同一字段），风险较低。

#### 内存泄漏

核心风险在 `startPolling`：

- 网络异常时 catch 为空，interval 永不停止，直到组件卸载。如果用户长时间打开工作台且网络不稳定，定时器会无限累积（虽然只有 1 个 interval，但每次 tick 都会触发 fetch，失败被吞，无法自愈）。
- `startPolling` 在开始新 interval 前没有 `clearInterval(pollRef.current)`，虽然当前业务逻辑下旧 interval 通常已被清理，但防御性编码缺失。
- `pollRef.current` 在 clearInterval 后没有被重置为 null，只影响 Debug/后续代码读取，不影响运行时。

#### 未处理异常

- `handleCluePatch` 与 `handleClueDelete`（`StorylineWorkbench.tsx:344-363`）在请求失败时只是 toast，没有回滚本地状态；成功后直接 `void load()`。如果 `load()` 失败，UI 可能处于「已删除但列表还在」的不一致状态。
- `handleToggleComplete` 如果 PUT 失败会 toastError 并直接 return，没有回滚。但由于状态是后端返回的真实状态，前端没有本地预更新，所以不会不一致。

#### 断链

- **中间态的 genExtra**：中间态输入框不提交，用户输入与结果无关，属于 UI-状态断链。
- **关闭弹窗后的任务**：关闭再打开无法恢复对原任务的轮询，属于任务-UI 断链。
- **newMain 推进**：主线完结触发 LLM 后没有任何前端状态追踪，用户无法知道新主线何时生成、是否失败，属于后台-前台断链。

---

## 发现清单

### 001. [P1] StorylineList 快速连点可创建多个游离生成任务

- **文件:行号**：`src/components/workspace/StorylineList.tsx:72-97`
- **现象描述**：列表顶部「AI生成」按钮只依赖 `generating` 状态禁用。由于状态更新存在 React 批处理窗口，用户在极短时间内多次点击按钮时，每次 onClick 都会实际执行 `POST /api/generation-tasks`，创建多个后台生成任务。后一次点击会覆盖 `genTaskId` 和 `workbenchId`，导致第一次任务在服务端继续运行，但前端丢失对它的追踪。
- **根因推测**：缺少类似「请求锁」的本地守卫。按钮 disabled 是表现层保护，不是业务层幂等保护。
- **建议修法**：在 `handleGenerate` 开头立即设置一个本地锁变量（例如 `lockRef.current = true`），在 finally 中释放；或在函数体顶部判断 `if (lockRef.current) return;`。另外 `POST` 成功后立即 `setGenerating(false)` 会过早重新启用按钮，建议等到工作台关闭或任务完成后再完全重置列表按钮的 loading。

### 002. [P1] 生成过程中关闭弹窗后无法恢复轮询

- **文件:行号**：`src/components/workspace/StorylineList.tsx:246-250`、`src/components/workspace/StorylineWorkbench.tsx:78-82、126-131`
- **现象描述**：关闭工作台时，`StorylineList.onClose` 会 `setGenTaskId(null)`，从而丢失后台任务 id。下次用户通过点击某条故事线重新打开工作台时，`StorylineWorkbench` 仅以 `initialId` 挂载，不会传入 `initialTaskId`，因此不会恢复轮询。服务端任务仍在运行，但用户无法继续观察结果。
- **根因推测**：设计上虽然希望「关页面不影响服务端任务」，但没有提供「重新进页面恢复轮询」的入口。`initialTaskId` 只在列表入口一次性写入，且未持久化到 URL、localStorage 或父级状态。
- **建议修法**：在 `StorylineList` 中保留 `genTaskId` 直到任务状态明确为 done/failed，或提供一个「最近生成任务」入口。更彻底的方案是让 `StorylineWorkbench` 在挂载时调用 `GET /api/generation-tasks?projectId=xxx` 获取最近未完成的任务并自动恢复轮询。

### 003. [P1] 轮询遇到网络异常时无限空转，用户感知为卡死

- **文件:行号**：`src/components/workspace/StorylineWorkbench.tsx:118-120`
- **现象描述**：`startPolling` 的 `setInterval` 回调中，fetch 抛异常（断网、CORS、DNS 失败）会被空的 catch 块吞掉，interval 不会被清理。按钮将一直保持「生成中…」状态，用户看不到任何失败提示，也无法通过再次点击取消。
- **根因推测**：代码把网络抖动视为「下一轮再试」的韧性策略，但没有设置最大重试次数、指数退避或超时，导致异常场景下变成无限循环。
- **建议修法**：在 catch 中递增错误计数器，超过阈值（如 5 次或 30 秒）后 `clearInterval(pollRef.current)`，并 `toastError` 提示用户「网络异常，请检查连接后重试」。同时 `setGenerating(false)`，让按钮恢复可操作。

### 004. [P1] 主线完结触发 newMain 推进，UI 完全无反馈且不可追踪

- **文件:行号**：`src/app/api/storylines/[id]/route.ts:46-69`
- **现象描述**：当用户把一条主线标记为 completed 且项目中无其他 active 主线时，服务端会 `void fetch` 调用自身 `/api/storylines/generate?mode=newMain`。这个调用走的是同步 LLM 路径，且是 fire-and-forget，不返回 taskId。前端 toast 只显示「已完结 ✓」，用户不知道系统正在生成新主线，也无法查看进度或失败信息。
- **根因推测**：缝合怪推进功能在 v1.8.6 引入统一后台任务前就已实现，升级时没有把 newMain 也迁移到 `generation-tasks` 异步体系。
- **建议修法**：将 newMain 触发改为创建 `generationTask`（targetType 可新增 "newMain"），并给 `StorylineList` 增加对未完成 newMain 任务的轮询，或至少 toast 提示「检测到主线完结，正在后台构造新主线」。

### 005. [P2] 中间编辑态的「额外要求」输入框是死输入

- **文件:行号**：`src/components/workspace/StorylineWorkbench.tsx:431-432、219-222`
- **现象描述**：进入 AI 生成中间态后，顶部「额外要求」输入框允许用户输入，文案提示「不影响已生成内容」。事实上，它也不影响「采用并落库」：落库请求只发送 `projectId`、`commit: true` 和 `suggestions`，不包含 `genExtra`。用户在该框输入的任何内容都会被丢弃。
- **根因推测**：该字段可能是早期同步生成路径的 prompt 残留，中间态 UI 没有同步清理。
- **建议修法**：要么把该输入框从中间态移除，要么把 `genExtra` 作为 suggestions 的批注随 commit 落库（例如在 storyline 表增加 `extraPrompt` 字段），要么将修改后的 `genExtra` 回传 `/api/storylines/generate` 并作为提示词的一部分重新生成。

### 006. [P2] 同步 LLM 路径仍有残留，且仍被 newMain 使用

- **文件:行号**：`src/app/api/storylines/generate/route.ts:52-139`、`src/app/api/storylines/[id]/route.ts:60-64`
- **现象描述**：`POST /api/storylines/generate` 同时承担两个职责：（1）接受前端编辑后的 suggestions 直接落库（无 LLM）；（2）当 `mode=newMain` 或 `commit=false` 时同步调用 LLM。前端 AI 生成入口已不再使用职责 2 的同步 LLM 分支，但服务端 newMain 触发仍调用它。
- **根因推测**：v1.8.6/v1.8.7 迁移时只改了前端入口，没彻底清理服务端双路径。
- **建议修法**：将 `POST /api/storylines/generate` 拆分为两个独立端点：一个专门负责 suggestions 落库（可命名为 `/api/storylines/bulk-create`），另一个将 newMain 也纳入 `generation-tasks` 体系。原端点保留但逐步废弃。

### 007. [P2] `startPolling` 开始前未清理已有 interval

- **文件:行号**：`src/components/workspace/StorylineWorkbench.tsx:85-124`
- **现象描述**：`startPolling` 直接将 `pollRef.current = setInterval(...)`，没有先 `clearInterval(pollRef.current)`。当前业务逻辑下由于按钮禁用，通常不会并发两个活跃 interval，但防御性不足。
- **根因推测**：编码时只考虑了正常流程，没有考虑异常复用场景。
- **建议修法**：在 `setInterval` 前添加 `if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }`。

### 008. [P2] `handleCommitGen` 的 toast 文案重复

- **文件:行号**：`src/components/workspace/StorylineWorkbench.tsx:229`
- **现象描述**：成功后调用 `toastCreated("故事线", "故事线")`，toast 组件可能渲染为「故事线 故事线已创建」。
- **根因推测**：参数误传。
- **建议修法**：改为 `toastCreated("故事线")` 或查阅 `toastCreated` 的签名修正参数。

### 009. [P2] 标记完结按钮对 abandoned 状态文案不一致

- **文件:行号**：`src/components/workspace/StorylineWorkbench.tsx:676-688`
- **现象描述**：按钮渲染逻辑只判断 `selected.status === "completed"`，对于 `abandoned` 状态的故事线，按钮仍显示「标记完结」图标与文案，但点击后会调用 `PUT status=active`（因为 `next = s.status === "completed" ? "active" : "completed"`），实际效果是把废弃故事线重新激活。
- **根因推测**：状态机没有穷尽所有 status 分支。
- **建议修法**：根据 `selected.status` 显式区分：active 显示「标记完结」；completed 显示「重新开启」；abandoned 显示「重新启用」或禁用该按钮。

### 010. [P2] 线索 CRUD 失败时没有回滚本地状态

- **文件:行号**：`src/components/workspace/StorylineWorkbench.tsx:320-363`
- **现象描述**：`handleAddClue`、`handleCluePatch`、`handleClueDelete` 在发送请求前没有本地乐观更新，失败后只是 toast，成功后直接 `void load()`。如果 `load()` 失败或延迟，用户看到的仍是旧列表，容易产生「到底删没删」的疑惑。
- **根因推测**：缺少乐观更新与错误回滚机制。
- **建议修法**：采用乐观更新：先更新本地 `list` 或单独维护 `clues` 状态，请求失败后再回滚；`load()` 改为等待完成后再决定 toast 文案。

### 011. [P2] 空项目点击 AI 生成没有前置引导

- **文件:行号**：`src/components/workspace/StorylineList.tsx:146-156`、`src/core/storyline/generate.ts:89-112`
- **现象描述**：当项目没有总纲、角色卡、世界书时，「AI 自动生成」按钮仍然可用。prompt 中会填充大量「未设定总纲」「暂无背景」等占位内容，生成结果很可能空泛。
- **根因推测**：产品缺少前置校验或建议引导。
- **建议修法**：在故事线列表/工作台空状态时，根据 `project.synopsis`、`characters.length`、`loreEntries.length` 计算完成度。完成度过低时，将「AI 自动生成」按钮置灰并提示「建议先完善总纲、角色卡和世界书，再生成故事线」。

### 012. [P2] 生成中按钮缺少阶段描述与取消能力

- **文件:行号**：`src/components/workspace/StorylineWorkbench.tsx:398-413`
- **现象描述**：生成过程中按钮只显示「生成中… ${progress}%」，没有更细粒度的阶段文案（如读取上下文、调用模型、解析结果），也没有取消按钮。用户无法中止一个已经开始的 LLM 任务。
- **根因推测**：后台任务一旦创建，前端只能轮询，没有提供取消 API。
- **建议修法**：在 `generation-tasks` 增加 `DELETE /api/generation-tasks/${id}` 或 `POST /api/generation-tasks/${id}/cancel` 用于软删除/取消任务；前端在生成按钮旁提供「取消」入口，并把执行器包装成可 Abort 的形式。

### 013. [P2] 真后台任务在 Serverless 环境可能丢失

- **文件:行号**：`src/app/api/generation-tasks/route.ts:28`、`src/core/storyline/execute-task.ts:4-10`
- **现象描述**：创建任务后使用 `void runStorylineGenerationTask(task.id)` 进行进程内 fire-and-forget。代码注释自己也承认：在 Vercel 等 Serverless 冷启动回收环境下不保证跑完。
- **根因推测**：当前架构务实落地，尚未接入持久队列。
- **建议修法**：长期应接入持久消息队列（BullMQ / SQS / 自建 worker）。短期可在项目设定的「部署说明」中明确限制自托管 Node 环境。

### 014. [P2] `StorylineList` 默认收起所有支线，新用户不易发现

- **文件:行号**：`src/components/workspace/StorylineList.tsx:49、179-187`
- **现象描述**：`expandedMains` 初始为空 `Set`，所有支线默认折叠。新用户首次进入时只能看到主线卡片，可能误以为项目只有几条主线。
- **根因推测**：设计上强调主线优先。
- **建议修法**：首次进入（或故事线总数较少时）默认展开第一条主线及其支线；或将展开状态持久化到 localStorage。

### 015. [P2] `genTask` 与 `generating` 状态在 `!r.ok` 时重置但 toast 后未清理 UI

- **文件:行号**：`src/components/workspace/StorylineWorkbench.tsx:93-99`
- **现象描述**：轮询返回非 OK 时，`setGenTask({ ...status: "failed" })`、`setGenerating(false)`、toastError 后 return。虽然状态已清理，但 `pollRef.current` 的 interval 被 clear，且 `pollRef.current` 仍保留旧的 interval id（未置 null）。
- **根因推测**：编码遗漏。
- **建议修法**：`clearInterval(pollRef.current)` 后立即 `pollRef.current = null`。

### 016. [P3] 工作台 title 缺少项目上下文

- **文件:行号**：`src/components/workspace/StorylineWorkbench.tsx:389-396`
- **现象描述**：Modal title 固定为「故事线工作台」，没有显示项目名或当前操作路径。
- **根因推测**：title 文案硬编码。
- **建议修法**：title 改为「故事线工作台 · ${projectName}」，增强上下文。

### 017. [P3] 父级 `loadProject()` 在故事线保存时全量刷新

- **文件:行号**：`src/components/workspace/StorylineWorkbench.tsx:232、292、312`
- **现象描述**：每次保存、删除、标记完结都会触发 `loadProject()`，这个函数会重新拉取项目、章节节点、角色、世界书等全量数据。故事线编辑是高频小操作，频繁全量刷新会加重服务器和前端渲染负担。
- **根因推测**：历史包袱，父级缺乏局部刷新接口。
- **建议修法**：引入更细粒度的缓存失效机制，例如 `invalidateQueries("storylines")` 只刷新故事线相关数据，而不是全量 `loadProject()`。

### 018. [P3] `StorylineWorkbench` 加载失败时重试按钮文案与样式不一致

- **文件:行号**：`src/components/workspace/StorylineWorkbench.tsx:503-509`
- **现象描述**：加载失败时显示红色错误文本和「重试」按钮，但「重试」只是一个普通的 `button`，没有使用统一的 `btn-ghost` 或 `Button` 组件。
- **根因推测**：UI 统一性不足。
- **建议修法**：统一使用 `Button variant="outline"` 或 `btn-ghost` 样式。

---

## 运行检查摘要

| 检查项 | 结果 | 备注 |
|--------|------|------|
| 打开故事线列表 | 通过 | `if_list.png` 成功截取，无 console error |
| 打开故事线工作台 | 通过 | `if_workbench.png` 成功截取，无 console error |
| AI 生成中态 | 通过 | `if_generating.png` 成功截取，按钮显示「生成中… 10%」，无 console error |
| 空状态截图 | 未执行 | 测试项目 `577ed326...` 已有 13 条故事线，未构造空项目；但代码中 EmptyState 已审查 |
| 同步/异步双路径残留 | 发现 | `src/app/api/storylines/[id]/route.ts:60-64` 仍通过 self-fetch 调用同步 `/api/storylines/generate?mode=newMain` |
| setInterval 清理 | 基本通过 | 组件卸载时清理；但网络异常下会无限轮询，且 `startPolling` 未先清理旧 interval |
| 控制台错误 | 未发现 | 三次截图均报告 `NO_CONSOLE_ERRORS` |

---

## 结论与建议优先级

总体而言，故事线工作台在 v1.8.9 已经完成了从「同步阻塞生成」到「真后台任务 + 轮询」的关键架构升级，主要交互流程闭环完整，用户能够从列表进入工作台、编辑字段、发起 AI 生成、进入中间态编辑并落库。UI 视觉一致、七要素展示清晰、空状态文案明确。

但本次评审仍发现 **4 条 P1 风险** 和 **多条 P2 体验问题**：

- **P1 必改**：快速连点导致的多任务泄漏、关闭弹窗后任务断链、网络异常无限轮询卡死、newMain 推进无反馈；
- **P2 强烈建议**：死输入框、同步 LLM 路径残留、线索 CRUD 乐观更新、空项目前置引导、取消任务能力。

建议在下一轮迭代中优先修复 P1 问题，使「故事线 AI 生成」从「可用」迈向「可靠」。
