# Round-17 UI / 无障碍 / 性能 / 状态管理 透镜报告

- **透镜职责**：只读体检 UI 组件、无障碍（aria / 键盘可达性 / focus-trap 覆盖）、虚拟滚动、状态管理（Zustand）、性能瓶颈。
- **Round**：17
- **日期**：2026-08-12
- **项目**：novel-forge（AI 长篇小说写作平台）
- **技术栈**：Next.js 16 + React 19 + TypeScript + Tailwind v4 + Prisma 7 + PostgreSQL(Neon) + Zustand
- **范围**：`src/components/*`、`src/store/index.ts`、`src/hooks/*` 及关联页面（`src/app/workspace/*`、`src/app/explore/*`、`src/components/game/*`、`src/components/workspace/aichat/*`）。
- **说明**：本报告基于真实代码证据（均给出 文件:行号 锚点）；tsc 类型检查结果见附录。

---

## 一、发现清单

### [F1] P1 · 裸弹窗：RefineDiffModal 缺失焦点陷阱 / 模态语义（round9 体系被绕过）
- **文件:行号**：`src/components/workspace/RefineDiffModal.tsx:28-29`（遮罩与面板整段 29-80 行）
- **现象**：该组件手写 `fixed inset-0 z-[120]` 遮罩 + 面板 div，但**没有任何** `role="dialog"`、`aria-modal`、`aria-labelledby`（虽然有可见 `<h2>`，却未关联）、`useFocusTrap`、`Esc` 关闭、或 body 滚动锁。键盘用户的 Tab 焦点会逃逸到背后页面，读屏不会播报模态对话框；唯一的关闭入口是有副作用的「应用 / 撤销」按钮，以及需鼠标的右上角关闭按钮——缺少中性的「仅关闭不改动」键盘路径。
- **根因**：未使用 round9 已统一的 `src/components/ui/Modal.tsx` 基座，而是另起手写遮罩（与 `DialogUI.tsx:6-8` 的约定「业务弹窗请勿再手写 fixed inset-0 遮罩」直接冲突）。
- **建议**：改用统一基座 `<Modal open={open} onClose={onClose} bare ariaLabel="精修预览（请确认改动）">` 包裹；或最低限度补齐 `role="dialog"` + `aria-modal` + `tabIndex={-1}` + `useFocusTrap` + Esc + 滚动锁，并把 `<h2>` 用 `id` + `aria-labelledby` 关联。

### [F2] P2 · 暗色模式小字对比度风险（tertiary / muted token 在 surface 上）
- **文件:行号**：例 `src/components/workspace/WorldEntryList.tsx:24`、`src/components/workspace/aichat/ChatMessageList.tsx:43/51`、`src/components/workspace/StorylineList.tsx:124`、`src/components/workspace/CharacterList.tsx:367` 等大量 10–11px 文案使用 `text-[var(--nv-text-tertiary)]` / `text-[var(--nv-text-muted)]`。
- **现象**：这些是最低亮度的文本 token，普遍用于暗色 surface 之上的小号说明文字。在暗色主题下，这类组合极可能低于 WCAG AA 正常文本 4.5:1 阈值（尤其是 tertiary over surface-1/2）。
- **根因**：设计 token 未对「最小正文尺寸」做 AA 对比度校验；仓库根已存在 `contrast_calc.mjs` / `contrast_table.mjs` 说明团队已知此议题，但未全量落地到组件。
- **建议**：用 `contrast_calc.mjs` 对 `--nv-text-tertiary` / `--nv-text-muted` 在 `--nv-surface-1/2` 上的实际比值做审计；不达标处将这些小字升级到 `--nv-text-secondary`，或提升 token 亮度。

### [F3] P3 · Modal 内 Esc 监听与 useFocusTrap 重复绑定
- **文件:行号**：`src/components/ui/Modal.tsx:90-102`（自身 useEffect 注册 document keydown Esc） + `src/hooks/use-focus-trap.ts:44-49`（capture 阶段又注册一份 Esc）。
- **现象**：两处均调用 `onClose()`，功能冗余。当前无害，但属于重复职责、未来改 Esc 行为需同步两处易漏。
- **根因**：Modal 在接入 useFocusTrap 之前已自建 Esc 监听，接入后未移除旧的。
- **建议**：删除 `Modal.tsx` 内自建的 Esc `useEffect`，统一交给 `useFocusTrap`（其已处理 Esc + 焦点归还）。

### [F4] P1 · 大列表未虚拟化：useVirtualRows 仅覆盖一处 LoreTable
- **文件:行号**：`src/hooks/use-virtual-rows.ts:25`（定义）；唯一调用点 `src/app/workspace/[projectId]/tables/page.tsx:414`。以下大列表全量 `.map` 渲染，无虚拟化：
  - `src/components/workspace/WorldEntryList.tsx:44`（`entries.map` 全量，世界书条目可达成百上千）
  - `src/components/workspace/CharacterList.tsx:412` → `CharacterGroupList`（角色卡列表全量）
  - `src/components/workspace/aichat/ChatMessageList.tsx:31`（`messages.map` 长对话全量重渲染）
  - `src/components/game/GameCanvas.tsx:67`（`turns.map` 全量）
  - `src/components/workspace/StorylineList.tsx:154 / 234`（全量）
- **现象**：数据规模大时 DOM 节点数线性膨胀，滚动/重渲染卡顿；世界书与角色卡是 novel-forge 的核心实体，规模上限高，风险最明显。
- **根因**：虚拟滚动只接到了 LoreTable，未推广到其它潜在大列表。
- **建议**：对「可超阈值」的世界书条目（`WorldEntryList`）与角色卡（`CharacterGroupList`）复用 `useVirtualRows`（需行高固定的列表视图）；长对话（`ChatMessageList`）与游戏回合（`GameCanvas`）考虑分页 / 窗口化 / 虚拟化。

### [F5] P2 · ChatMessageList 使用索引作 key
- **文件:行号**：`src/components/workspace/aichat/ChatMessageList.tsx:31`（`key={i}`）与 `:55/:71/:112` 等多处。
- **现象**：以数组下标作 React key；消息增删时 React 会错误复用/重建 DOM 节点，长对话重渲染成本高且可能出现内容错位/闪烁。
- **根因**：消息项无稳定 id 可用（仅有 `ts`）。
- **建议**：为 `MessageItem` 增加稳定 `id`（或 `role + ts` 组合）作为 key。

### [F6] P2 · 对话列表每次消息变化全量重渲染（无 memo）
- **文件:行号**：`src/components/workspace/AIChatBar.tsx:345`（整数组 `messages` 传给 `ChatMessageList`） + `src/components/workspace/aichat/ChatMessageList.tsx:27-114`。
- **现象**：`ChatMessageList` 未 memo，每次 `messages` 变更（每新增一条消息）都重渲染整列已有消息的 DOM；长会话下每次追加为 O(n)，累积 O(n²)。
- **根因**：子组件未做渲染隔离。
- **建议**：`React.memo` 包裹消息项，或结合 F4 改用虚拟化列表；`AIChatBar` 也可考虑把 messages 拆为不可变更新以减小 diff。

### [F7] P2 · useVirtualRows 的 onScroll 未做 rAF 节流
- **文件:行号**：`src/hooks/use-virtual-rows.ts:32-35`。
- **现象**：`onScroll` 直接 `setScrollTop(el.scrollTop)`，每次滚动事件同步触发 React 重渲染；快速滚动大表时每帧多次 setState→重渲染，可能掉帧。
- **根因**：滚动回调未节流（无 requestAnimationFrame / passive 优化）。
- **建议**：用 `requestAnimationFrame` 包裹 `setScrollTop`，或在 scroll 回调内做简单节流。

### [F8] P2 · GameCanvas 在流式期间反复触发平滑滚动
- **文件:行号**：`src/components/game/GameCanvas.tsx:51-53`。
- **现象**：`useEffect` 依赖 `[lastNarrative, turns.length]`，每次 `lastNarrative` 变化都 `scrollIntoView({ behavior: "smooth" })`。若 `lastNarrative` 在生成流期间频繁变化，会反复启动平滑滚动，导致滚动抖动 / 布局抖动。
- **根因**：把「内容变化」与「用户滚到底」混为一谈，且 smooth 行为不适合高频触发。
- **建议**：仅在 `turns.length` 变化（新回合）或用户已贴底时滚动；去掉 `behavior:"smooth"` 的重复触发，或用 rAF 节流入口。

### [F9] P2 · 自封装 useQuery 无 AbortController（setState-after-unmount 隐患）
- **文件:行号**：`src/hooks/useApi.ts:62-80`（load）+ `82-90`（effect 仅从 listeners 删除 load，不取消在途 fetch）。
- **现象**：`load` 内 `await fetcherRef.current()` 无 signal；effect cleanup 只 `listeners.get(key)?.delete(load)`，在途请求仍会 resolve 并 `setData/setError` → 卸载后 setState 警告，且可能写回已卸载组件的状态。
- **根因**：FE-9 试点的 mini React-Query 未实现请求取消。
- **建议**：`fetcher` 接收 `AbortSignal`；`load` 内 `new AbortController()`，`finally`/cleanup 调 `controller.abort()`。

### [F10] P2 · ImitationPanel 的 fire-and-forget fetch 无卸载守卫（与同模式组件不一致）
- **文件:行号**：`src/components/dissect/ImitationPanel.tsx:54-68`。
- **现象**：`useEffect` 内 `fetch("/api/dissect/list").then(...)` 直接 `setTasks / setLoadingTasks(false)`，既无 `alive/cancelled` 守卫也无 AbortController；组件卸载后（如切换拆书任务）仍会 setState。
- **根因**：同仓库内 `GenerationLatencyPanel.tsx:88`、`NarrativeEnergyPanel.tsx:40`、`ForeshadowingPanel.tsx:94`、`system-status-banner.tsx:39` 均已采用 `alive/cancelled` 守卫，唯独此处遗漏，模式不一致。
- **建议**：加 `let alive = false; ... return () => { alive = false }` 守卫，或在 cleanup 置 false 后再 setState；更优是改用带 AbortController 的 `useQuery`。

### [F11] P2 · StorylineList 的 load 无守卫 / 无 AbortController
- **文件:行号**：`src/components/workspace/StorylineList.tsx:55-70`（load）+ `72-74`（`useEffect(() => { void load(); }, [load])`）。
- **现象**：`load` 内 `fetch` 后直接 `setStorylines / setLoadError / setLoading`，无 `alive` 守卫、无 AbortController；快速切换项目时可能 setState-after-unmount。
- **根因**：同 F10 的缺守卫模式。
- **建议**：加 `alive` 守卫或 AbortController。

### [F12] P1（潜在 / 死代码）· useWriterStore 整块未被使用，且 appendContent 为 O(n²) 写法
- **文件:行号**：`src/store/index.ts:105-142`（含 `appendContent` 133-137、`streamBuffer` 135-136）。
- **现象**：全局 grep `useWriterStore` 仅命中其自身定义（`:123`）；`appendContent` / `setGeneratedContent` 亦仅命中定义处——**整个 WriterStore（generatedContent / streamBuffer / appendContent / setGeneratedContent / resetStream）在代码库中无任何订阅者、无任何调用者**。即该流式状态块是死代码。`appendContent` 以 `state.generatedContent + token` 拼接整串，每次 token 触发全量字符串复制 + `set` → 属 O(n²) 写法，目前不触发但是潜在回归雷（一旦有人接上即埋性能坑）。
- **根因**：FE 重构后正文流改走 API / 其它路径，WriterStore 未清理。
- **建议**：若不再需要，直接删除 `useWriterStore`（连同 O(n²) 的 `appendContent`）；若计划复用，改为「分片缓冲 + 节流刷新」，避免每 token 全量字符串拼接与全量重渲染（参考 AIChatBar 的 AbortController 正确用法）。

### [F13] P3 · AIChatBar 每次渲染重建 PRESETS 常量数组
- **文件:行号**：`src/components/workspace/AIChatBar.tsx:310`（组件函数体内定义含 8 个对象的 `PRESETS`）。
- **现象**：`PRESETS` 在每次 render 重建（虽开销小），属不必要的分配。
- **建议**：提到组件外常量，或 `useMemo`。

### [F14] P3 · CharacterList 的 filtered / 分组每渲染重算（无 memo）
- **文件:行号**：`src/components/workspace/CharacterList.tsx:90-100`（filter）+ `104-109`（for 循环分组）。
- **现象**：每次渲染（含输入搜索、勾选等交互）都对 `characters` 做 O(n) filter 再 O(n) 分组；角色规模大时无 memo 会放大交互延迟。
- **根因**：派生数据未用 `useMemo` 缓存。
- **建议**：`useMemo(() => ..., [characters, roleFilter, statusFilter, tagFilter, search])` 缓存 `filtered` 与 `grouped`。

---

## 二、非阻塞观察（已健康，记录以备对照）
- **Zustand 职责划分清晰**：`useProjectStore` / `useWriterStore` / `useStoryboardStore` 三块职责分明，无 `create` 重复、未见职责混乱。
- **多数数据面板已有卸载守卫**：`GenerationLatencyPanel` / `NarrativeEnergyPanel` / `ForeshadowingPanel` / `system-status-banner` 都用了 `alive/cancelled` 守卫（`F10/F11` 是例外）。
- **AIChatBar 取消模式正确**：`AIChatBar.tsx:155-167` 使用 `AbortController` + `signal`，是仓库内 fetch 取消的正确范本，建议推广到 `useQuery` 与缺失守卫的面板。
- **焦点陷阱整体覆盖良好**：除 F1 的 `RefineDiffModal` 外，所有 `*Dialog` 组件均通过 `Modal` 统一接入 `useFocusTrap`（见 grep：30+ 处 `import { Modal }`）；`CommandPalette`、`toast` 的 confirm/prompt 亦独立接入 `useFocusTrap`。
- **Props drilling**：`CharacterList` / `StorylineList` 的多 prop 透传属常规，不严重，未单列。

---

## 三、待修项优先级（按 风险 × 收益）

| 优先级 | 项 | 风险 | 收益 | 动作 |
|---|---|---|---|---|
| **P0** | — | — | — | 本轮未发现会直接导致崩溃/数据丢失的 P0；类型零错误（见附录）。 |
| **P1** | F1 裸弹窗 RefineDiffModal | 高（a11y 回归、键盘不可用、违背 round9 约定） | 高（一处改为用 Modal 即修） | 立即改 `Modal` 包裹 |
| **P1** | F4 大列表未虚拟化（世界书/角色卡） | 高（核心实体规模大） | 高（复用既有 useVirtualRows） | 对 WorldEntryList / CharacterGroupList 接入虚拟滚动 |
| **P1** | F12 WriterStore 死代码 + O(n²) | 中（当前不触发，但属雷） | 高（删代码即降本 + 消除隐患） | 删除或改造为分片缓冲 |
| **P2** | F9 useQuery 无 AbortController | 中 | 高（影响所有试点新页面） | 加 signal + abort |
| **P2** | F10/F11 ImitationPanel / StorylineList 无守卫 | 中 | 中（对齐现有模式） | 加 alive/AbortController |
| **P2** | F2 暗色对比度审计 | 中（a11y） | 中 | 跑 contrast_calc.mjs 修 tertiary/muted |
| **P2** | F5/F6 ChatMessageList 索引 key + 全量重渲染 | 中（长对话） | 中 | 稳定 id + memo / 虚拟化 |
| **P2** | F7 useVirtualRows onScroll 节流 | 中（大表滚动） | 中 | rAF 节流 |
| **P2** | F8 GameCanvas 平滑滚动抖动 | 中 | 中 | 仅新回合滚动 / 去 smooth 重复 |
| **P3** | F3 Modal 重复 Esc | 低 | 低 | 删 Modal 内旧监听 |
| **P3** | F13/F14 PRESETS / filtered memo | 低 | 低 | 常量外提 / useMemo |

**一句话结论**：类型零错误、焦点陷阱整体合规；最该修的是「绕过统一 Modal 的 RefineDiffModal 裸弹窗」「仅一处用了虚拟滚动（世界书/角色卡仍全量渲染）」以及「死代码 WriterStore 里的 O(n²) appendContent」三处。

---

## 附录：tsc 类型检查（2026-08-12）
- 命令（项目根，`SAFE_DELETE_DISABLE=1 npx tsc --noEmit`）：
  ```
  cd <project-root> && SAFE_DELETE_DISABLE=1 npx tsc --noEmit
  ```
- 结果：**exit code = 0，stdout/stderr 0 行，0 个 `error TS`**。
- 说明：类型层无错误；本透镜发现均为运行期/体验/架构层问题，不体现在 tsc。
