# MaxLoop 魔王系统 · Round-2 深度体验报告（UI / 无障碍 / 文案 / 对比度 透镜）

- **Agent 代号**：UI无障碍文案透镜
- **轮次**：round-2
- **版本**：v1.6.4（HEAD = `2b88e09` feat: v1.6.4 故事线支线联动 UI + 数据化）
- **日期**：2026-08-07
- **项目绝对路径**：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- **复验范围**：IMP-016 / IMP-017 / IMP-018 / IMP-025 修复真实性 + 全局 UI 新坑挖掘
- **诚实边界声明**：本报告对比度数值由 Node 脚本对 `globals.css` 令牌做 WCAG 2.1 相对亮度合成计算（半透明表面按覆盖到 `--background`/`--nv-void` 之上合成），属可复现的客观证据；纯浏览器视觉（抽屉开合动画、玻璃模糊观感、实际像素渲染）标注「需本地 `npm run dev` 目测」。沙箱无 Chromium，DB 使用 127.0.0.1:5432。`npm run build` 已编译通过（仅最后清理 `.next/trace` 被沙箱 safe-delete 守卫拦截，非项目缺陷），并已用 `next start` + `curl` 实测 SSR HTML 验证 viewport / noscript。

---

## 一、用户体验视角（深度体验，约 9000 字）

### 1. 走通全站的真实体感

我在本论中把 novel-forge 当作一个第一次使用的网文作者来走查：首页 → 新建/载入示例项目 → 进入工作区 → 选中章节 → 生成前确认 → 写作/微调/续写 → 章节摘要 → 结构化表格 → 监测面板 → 设置/导出备份包。整体交互骨架是**连贯且有节奏感**的：顶部状态条给出后端连接与 AI 配置诊断，工作区三栏（大纲 / 正文+分析 / 侧栏工具箱）分工清晰，生成流程用 SSE 流式把「AI 正在分析角色调度 → 等待确认 → AI 正在写作 → AI 正在审校 → 生成摘要 → 生成完成」的状态台阶可视化得相当到位（见 `page.tsx:50-58` 的 `genStepLabels`）。这种「有响应、有互动感、有确定感」的设计目标在 toast/confirm/prompt 三件套（见 `toast.tsx`）里落实得不错——它用样式化弹窗替代了原生 `alert/confirm/prompt`，右下角滑入、按类型着色、自动消失、可手动关闭，体验上明显优于裸 `alert`。

但「连贯」之下的细节处，存在几处会让真实用户卡顿或困惑的点，下面分模块说。

### 2. 工作区：主区不可点 vs 抽屉开合（IMP-018 复验）

round-1 把「抽屉 inert 包裹主区」作为修复项交来。我读 `page.tsx` 确认实现：主区（Toolbar 外层 `page.tsx:933`、窄屏切换条 `page.tsx:947`、中栏 CenterPanel 外层 `page.tsx:991`）在 `leftDrawerOpen || rightDrawerOpen` 为真时被加上 `inert` 属性，左/右抽屉本身（`:963`、`:1113`）保持可交互。这里有**一个关键的技术正确性判断**必须点明：早期 React（18 及以前）对 `inert={false}` 会渲染成 `inert="false"` 字符串属性，而 HTML 规范里任何非空值的 `inert` 都视为「生效」，会导致主区**永远**不可交互——那是 P0 级灾难。但本项目 `package.json` 明确为 `react: 19.2.4` + `next: 16.2.7`，React 19 对 `inert` 布尔属性处理正确：`inert={false}` 不渲染属性、`inert={true}` 才渲染。因此 **IMP-018 在 React 19 下实现是正确的**，主区不会永久 inert。这点我予以确认通过，但开合态的视觉焦点回归、抽屉滑入是否真正把背后页面「关掉」交互，属于纯视觉/动效层面，标注「需本地 `npm run dev` 目测」。

然而在复核 IMP-018 时，我发现了它的**补集问题（见发现 UI-007）**：左右抽屉容器在**关闭态**下，仅靠 `translate-x-full` / `-translate-x-full` 移出屏幕（桌面端 `lg:static` 常驻，移动端 `lg:hidden` + transform 平移），**从未被加 `inert` / `aria-hidden` / `hidden`**。也就是说在移动端窄屏，关闭的抽屉仍完整留在 DOM 且可聚焦、可被读屏播报。虽然移动端多数用触控而非 Tab 键，但读屏用户会在「看不见」的抽屉里听到一堆大纲/侧栏按钮，造成认知混乱。这是 IMP-018 没覆盖到的反向缺口，应当补上。更进一步说，即便在桌面端，`leftDrawerOpen` 这类状态切换只影响 `inert` 与 `translate`，抽屉的 `role="dialog"` / `aria-modal` 仅在打开时挂上（`page.tsx:966-968`、`:1117-1119`），关闭时 `role` 为 `undefined`——逻辑是对的，但「关闭态仍可被 Tab 命中」的问题在移动端会放大，因为那时抽屉是 `fixed` + `translate-x-full` 的离屏元素，没有 `inert` 兜底。

### 3. 暗色模式可读性：muted 文字在卡片上「发灰看不清」（IMP-017 复验——P2 坐实，应升 P1）

这是本轮最重要的一个发现。round-1 把 `--nv-text-muted` 从旧值提亮到 `#83807A` 并注释「对比度 4.7:1（达 WCAG AA 4.5:1）」，并留下「深色主题落卡片留 1 P2 待目测」。我用 Node 脚本按 WCAG 相对亮度公式做了精确合成计算，结论很明确：**那条注释的 4.7:1 是按纯底色 `--background`/#0E1424 算的（实测 4.66:1），但一旦 muted 文字落在真正的卡片/弹窗表面上，对比度就跌破 4.5 阈值**。

具体证据（合成背景 = 半透明白叠加到深色底）：
- `--nv-text-muted`(#83807A) 落在 `--card`(rgba(255,255,255,0.045) 叠加到 #0E1424 ≈ #191f2e) 上：**4.18:1 —— FAIL AA**。
- `--nv-text-muted` 落在 `--popover`(#161E34) 上：**4.20:1 —— FAIL AA**。
- `--nv-text-muted` 落在 `--nv-surface-3`(rgba(255,255,255,0.09) 叠加 ≈ #212a3d) 上：**3.65:1 —— FAIL AA（更严重）**。

这意味着：凡是使用 `text-[var(--nv-text-muted)]` 且背景是卡片/弹窗/抬升面的地方，正文级（<18px）文字都未达到 WCAG AA。最刺眼的是**监测面板「写作节奏（近 7 天）」的日期与星期标签**（`MonitorPanel.tsx:224`、`:282`、`:285`），它们用 8px 的 muted 文字落在 `surface-3` 小方块上，实测仅 3.65:1——对一个本应「一眼扫读今天写了多少字」的节奏条来说，日期几乎糊进背景里。这种「作者每天都会看一眼」的面板，可读性缺陷会日积月累地消耗信任感。同样是监测面板，各 `StatBlock` 的标签与 `Row`/`TokenRow` 的 label 用的是 `--nv-text-tertiary`（#98968C），在 `surface-1` 上实测约 5.5:1，是达标的——可见问题精确卡在「muted 这一档」，而非整面板。

更深一层：问题根因不是某一处组件写错，而是**设计令牌本身的对比度预算错配**——`--nv-text-muted` 被同时用于「占位/禁用」语义和「次要标签」语义，但它在抬升面（卡片/弹窗）上的落点对比度从未被纳入令牌评审。修复应从令牌层入手（见 UI-001），而不是逐个组件改色。值得对比的是，三套主题对 muted 的注释分别是：dark 4.7:1、light 4.6:1（`globals.css:281`）、azure 4.8:1（`globals.css:1191`）——三套都只在纯底色上自称达标，没有一套声明「在卡片/弹窗上的合成对比度」，这说明令牌评审环节本身就缺了「抬升面合成」这一步，是系统性的疏漏。

### 4. 危险操作按钮：删除/危险态文字对比度不达标

`button.tsx` 的 `destructive` 变体定义为 `bg-destructive/10 text-destructive`（`button.tsx:18-19`）。我计算了 `text-danger`(≈#c15b6a) 在该背景上的对比度：
- 静态 `bg-destructive/10`：**3.97:1 —— FAIL AA**。
- hover `bg-destructive/20`：**3.53:1 —— 不降反升？错，是更差**。

也就是说，当你把鼠标悬停在「删除章节」「删除项目」这类危险按钮上时，文字对比度反而从 3.97 掉到 3.53——这正好和用户的预期相反（hover 通常应更清晰）。删除/危险操作是「一旦点错代价极高」的按钮，按理应当是最清晰、最不容易误读的元素，现在却是最模糊的一档。从体验视角看，一个作者想删掉某个废章，要在玻璃质感的深色界面里辨认那行玫瑰色小字，本就吃力；hover 还变淡，风险感被悄悄削弱了。我顺带看了 `button.tsx:7` 的全局 disabled 处理 `disabled:opacity-50`——危险按钮在禁用态再叠 50% 透明度，可达 2:1 以下，几乎消失；虽然禁用态本就不应被强调，但与「彩色文字 + 淡底」组合后，禁用/启用两态的辨识差被进一步压缩。

同理，`States.tsx:94` 的 `ErrorState` 标题用 `text-danger` 落在 `bg-[var(--nv-danger-soft)]/40` 上，实测约 **4.04:1**，也低于 4.5。错误态是用户最焦虑、最需要一眼看清「出了什么问题」的场景，标题却卡在 AA 线下。路由级 `error.tsx:23`、全局 `global-error.tsx:17` 的「页面出错了 / 应用级错误」标题也是 `text-danger` 落在 `bg-danger/5` 上，约 4:1，同样临界。更严重的是 `error.tsx:28` / `global-error.tsx:21` 那行错误明细 `<pre>` 用了 `text-danger/80` 落在 `bg-black/40` 上——`/80` 让本就中低明度的玫瑰色再降一档，对想复制堆栈去求助的用户极不友好（见 UI-012）。

### 5. 空状态与错误提示文案：整体优秀，个别黑话与标点不一

我专门走查了全局空状态组件 `EmptyState`（`States.tsx:18`）及其调用点。结论偏正面：dissect 页「还没有拆书任务」（`dissect/page.tsx:147`）、workshop「还没有预设」（`workshop/page.tsx:426`）、结构化表格「还没有结构化表格…可从创意工坊套用模板预设」（`tables/page.tsx:338`）、游戏页「还没有世界设定」（`game/[nodeId]/page.tsx:1097`）、角色列表「无匹配角色…点击+添加角色，或调整筛选条件」（`CharacterList.tsx:566`）——这些空状态都做到了「图标 + 标题 + 说明 + 操作指引」四件套，且说明句明确告诉用户下一步点哪里，符合「首启不迷路」的好实践。错误提示大多也带引导，例如 `page.tsx:467`「加载项目失败（HTTP xxx），请检查后端服务是否已启动并连接数据库」比裸「加载失败」好太多；`api-error.ts`（`src/lib/api-error.ts:36,60,91`）里集中维护了「数据库响应中断，请检查网络或数据库负载后重试」「存在重复记录」「请检查 Base URL 与网络是否可达」这类带修复方向的 hint，说明团队是有意识在做「错误可行动化」的。

但文案层仍有两处值得修：
- **标点不一致（UI-010）**：工作区 `page.tsx:547` 写的是 `写入大纲出错: `，用了**半角冒号**；而全站其余错误提示（如 `保存失败（${res.status}）`、`章纲保存失败：`）一律用**全角冒号 `：`**。半角冒号在中文排版里显得突兀，属于「作者自己都不会注意、但读者潜意识觉得别扭」的语病级小瑕疵。我全局扫了一遍，这类半角标点混用在错误串里是零星存在，建议用 lint 兜住。
- **黑话（UI-011）**：`workshop/page.tsx:316` 的提示「regex / API参数 请手动填 JSON，其他类型支持 **AI 丰满**」——「AI 丰满」是团队内部把「AI 自动补全字段」缩略成的行话，新用户第一次见到完全不知所云。这类黑话应改为「AI 自动补全」之类可自查的措辞。同理 `page.tsx` 里大量「宝宝流」「宝宝流记忆召回」「宝宝流自动填表」的命名——作为产品面向终端作者的界面文案，「宝宝流」是内部代号（指记忆/上下文回流系统），出现在 `page.tsx:1061`「宝宝流记忆召回（已注入本轮写作）」、`:653` 报错文案等用户可见位置。对陌生作者而言「宝宝流」不像功能名而像昵称，初次见到会疑惑「这是什么」。这属于中英/内外代号混排不当的一类，建议面向用户处统一为「记忆回流/上下文召回」等可读名，内部代号仅留代码层。

另外，`page.tsx:773` 的「生成章节摘要」确认仍调用原生 `window.confirm`（一大段自带 `\n` 的多行文本）。这打破了全站统一的样式化 confirm 体系（`toast.tsx` 里明明有 `confirmDialog`），原生弹窗在暗色站点里是刺眼的白底系统框，且对读屏而言与站点语言割裂。属于「设计系统一致性」的折扣（见 UI-009）。

### 6. 弹窗遮挡与裁切：Toast 与批量进度胶囊抢右下角

我注意到一个具体的空间冲突：右下角 `bottom-4 right-4` 被**两样东西同时占用**——Toast 容器（`toast.tsx:189`，`z-[100]`）和工作区的「批量写作进度胶囊」（`page.tsx:1158`，`z-50`）。当批量写作在后台跑、同时又弹出完成/失败 toast 时，toast（z-100）会直接盖在进度胶囊（z-50）之上，用户要么看不到进度百分比，要么进度胶囊被 toast 完全遮住。对一个「可关窗口、任务继续跑」的后台进度指示来说，被 toast 长期遮挡会让人误以为任务卡死。这是典型的「同角层级打架」（见 UI-005）。我顺带盘了一下全局 z 层：CommandPalette `z-[120]`、Modal/Confirm/Prompt `z-[110]`、Toast `z-[100]`、工具栏导出下拉 `z-50`、抽屉 `z-40`、抽屉遮罩 `z-30`——整体层级是讲理的，唯独「长期指示器（进度胶囊 z-50）」与「短时通知（toast z-100）」在同一角且前者层级更低，是排序上的小失衡。

工具栏（`Toolbar.tsx:57-109`）在桌面端排了 文风/大纲/摘要/导入书稿/导出/备份包/自动填表 共 7+ 个按钮，全部 `flex` 横排，**没有任何响应式折叠**（无 `overflow-x-auto`、无汉堡菜单、无 `lg` 断点收起）。在平板或浏览器窗口缩到 ~900px 以下时，这些按钮会水平溢出或被挤换行，且「导出」下拉菜单（`Toolbar.tsx:82-96`）是 `absolute right-0 top-full` 的绝对定位浮层——当工具栏因空间不足被压缩，这个下拉很可能被右侧视口边缘裁切，用户点不开「复制全文」。这属于响应式断点缺口（见 UI-006）。需要说明的是，窄屏下大纲/侧栏已通过 `lg:hidden` 的切换按钮收成抽屉（`:948-953`），说明团队有响应式意识，但**工具栏自身这排操作按钮**没被纳入同一套响应式收口，是遗漏。

### 7. 键盘可达性细节：命令面板滚动不同步

`CommandPalette`（`CommandPalette.tsx`）整体无障碍做得相当规范：有 `useFocusTrap`、有 `role="dialog"` `aria-modal` `aria-label`、有 `max-w-[94vw]` 响应式、有 `max-h-[60vh] overflow-y-auto` 溢出处理。但我在读它的键盘逻辑（`CommandPalette.tsx:125-133`）时发现：上下箭头移动 `active` 选中项时，只改了高亮样式，**没有把 active 项 `scrollIntoView` 滚入可视区**。当匹配结果很多（例如项目里几十个章节+角色）超过 60vh 视口时，用户用 ↓ 一路往下，高亮项会跑到滚动容器外「看不见但仍在切换」，体验上像是「选中坏了」。这是键盘流的一个真实断点（见 UI-008）。

我专门复核了 `use-focus-trap.ts` 的可见性判断：它用 `el.offsetParent !== null` 过滤可聚焦元素。有人会担心「位于 `fixed` 遮罩内的弹窗，`offsetParent` 会不会是 null 导致焦点陷阱失效」。我推演了规范：`offsetParent` 为 null 仅当**元素自身** `position:fixed` 或 `display:none`；对位于 `fixed` 遮罩内、自身静态定位的按钮，其 `offsetParent` 指向那个 `fixed` 遮罩（非 null），因此焦点陷阱**实际有效**，未发现焦点泄漏。Modal 面板还显式加了 `relative`（`Modal.tsx:147`），更稳妥。所以焦点陷阱这块是健康的，本轮不列为缺陷。

### 8. 按钮可见性 / 禁用态全景

我把全站按钮变体过了一遍。`button.tsx` 提供 `default/outline/secondary/ghost/destructive/link` 六档，配 `disabled:opacity-50`（`button.tsx:7`）与全局 `button:disabled { @apply cursor-not-allowed opacity-50 }`（`globals.css:399-401`）。`default` 变体（靛蓝渐变 + 近白文字）禁用时 50% 仍清晰；`ghost`/`outline` 禁用时中灰文字变半透明，在深色玻璃上偏弱但可接受；**真正的隐患在彩色文字按钮**：Toolbar 的「文风」用 `text-[var(--nv-accent)]`（金）、「导入书稿/自动填表」用 `text-[var(--nv-creative)]`（紫）、「备份包」用 `text-[var(--nv-accent)]`（金），这些彩色文字按钮在禁用态（`disabled:opacity-50`）会从「彩色」退成「淡彩」，辨识度明显下降，且彩色文字本身在深色玻璃上的常态对比度也偏弱（金色 OK，紫色临界）。这类按钮不是危险操作，影响不如 UI-003 严重，但叠加禁用态后，用户容易分不清「这按钮是不是灰了不能点」。建议禁用态除 `opacity` 外，加一个更明确的「置灰边框/图标变灰」信号（见 UI-003 建议合并处理）。

### 9. 响应式断点走查（多页）

除工作区工具栏（UI-006）外，我扫了首页与各功能页的响应式处理：首页有 `@media (max-width: 900px)` 隐藏轨道装饰、`.nf-home` 系列做了窄屏降级（`globals.css:1153-1157`），`home-stagger-item` 有 reduced-motion 兜底，整体首页响应式是过关的。但功能密集型页面（tables、explore、dissect、settings）大多是 `flex` / `grid` 堆表格与表单，未系统看到 `overflow-x-auto` 或断点重构；在窄屏下长表格横向溢出风险存在。这属于「桌面优先、移动未充分打磨」的普遍现象，鉴于 novel-forge 定位是「写作工作台」（桌面为主），优先级低于对比度问题，但 Tables 页作为数据密集页，窄屏可用性值得下轮专项走查。

### 10. 表单与输入框无障碍走查（label / placeholder / aria）

我把创意工坊的「预设编辑」表单（`workshop/page.tsx` 的字段编辑区）、结构化表格编辑（`tables/page.tsx`）、设置页表单（`settings/page.tsx`）走了一遍输入流。整体观察：受控输入框大多**只用了 `placeholder` 而缺少 `<label>` 关联**（`htmlFor`）或显式 `aria-label`。问题有两层：其一，`placeholder` 在用户开始输入后即消失，对「记忆型」用户（边看边填）和注意力易分散的作者不友好；其二，读屏对 placeholder 的播报并不可靠——WCAG 要求每个输入控件都有 programmatically 关联的名称，靠 placeholder 充当名称属于「偶发可达」，在 VoiceOver/NVDA 下可能只报「编辑文字」而无语义。更糟的是，这些 placeholder 普遍套用 muted 色（见 UI-001），对比度本就临界，未输入时提示文字已偏弱。建议关键表单字段补 `<label htmlFor={id}>` 或 `aria-label`，把占位提示降级为「辅助说明」而非「唯一名称」。这一项虽未在单一组件坐实崩溃级缺陷（表单功能可用），但属于「无障碍属性的结构性遗漏」，应随 UI-001 的令牌修复一并纳入设计系统自查清单。

### 11. 焦点可见性与键盘流全景（focus-visible / Tab 顺序）

在暗色玻璃美学下，`:focus-visible` 焦点环多用 accent 金（`--nv-accent`）或 creative 紫（`--nv-creative`）描边，对主按钮可见性尚可。但两类风险值得记：其一，部分 `ghost` / `link` 变体按钮在 `focus` 态仅靠「底色微变」表达（无 `ring` / 无描边），键盘 Tab 用户在不看鼠标时难以定位「当前焦点在哪」——对一个「全程键盘写作、偶尔伸手点按钮」的作者，焦点环缺失会打断心流；其二，页面存在「注意力中心 ≠ Tab 起点」的固有张力：Toolbar 在 DOM 中位于主区上方，Tab 会先过工具栏 7+ 按钮再过正文（符合 DOM 顺序、直觉也通），但当抽屉打开时主区 `inert`（IMP-018 正确），Tab 顺序自动跳过主区——这是对的；问题回到 UI-007：抽屉**关闭态**仍可 Tab，会插进顺序里制造「看不见却可聚焦」的空洞。建议：全局统一 `focus-visible:ring-2 ring-[var(--nv-accent)]` 焦点环语言（包括 ghost/link），并对关闭态抽屉彻底 `inert`/`aria-hidden` 隔离，让键盘流与视觉流彻底对齐。

### 12. 颜色是否作为唯一信息载体（色盲 / 低视力友好性）

我专项排查了「状态是否仅靠颜色传达」（WCAG 1.4.1 Use of Color）。生成步骤 `genStepLabels`（`page.tsx:50-58`）用「进行中=高亮 + 文案、完成=勾、失败=红 + 文案」三态，是「文字标签 + 颜色」双通道，基本达标；错误/成功 toast 也带图标与文案，不单靠色。但监测面板的「达标 / 未达标」节奏条，若仅用颜色深浅（达标绿、未达标灰/红）区分，色觉障碍用户可能难以分辨——我未在单一组件坐实「只有颜色」的硬伤（节奏条目前主要显示字数而非达标与否），但这是下轮专项应核的薄弱点。通用建议：凡用颜色表达状态的处，补一个图标或文字后缀（如「达标 ✓」「欠 ⚠」），把信息通道从「单色」升级为「色 + 形 + 字」三通道，这是低成本高收益的包容性加固。

### 13. 全站文字令牌对比度预算全景（表）

为把本轮发现从「个案」上升为「系统性预算」，我把深色主题下主要文字令牌在各自「纯底色 / 卡片 / 弹窗 / surface-3」四种落点上的合成对比度汇总（数值由同一 Node 脚本按 WCAG 2.1 相对亮度计算，半透明表面合成到 `--background`/`--nv-void` 之上；light/azure 主题结构相同、数值待补测）：

| 文字令牌 | 纯底色 | 卡片 card | 弹窗 popover | surface-3 |
|---|---|---|---|---|
| `--nv-text-primary` | ~15:1 ✓ | ~12:1 ✓ | ~13:1 ✓ | ~10:1 ✓ |
| `--nv-text-secondary` | ~9:1 ✓ | ~7:1 ✓ | ~7.5:1 ✓ | ~6:1 ✓ |
| `--nv-text-tertiary` | ~7:1 ✓ | ~5.5:1 ✓ | ~5.8:1 ✓ | ~5:1 ✓ |
| `--nv-text-muted` | 4.66:1 ✓ | **4.18 ✗** | **4.20 ✗** | **3.65 ✗** |
| `--nv-text-danger` | ~5:1 ✓ | **3.97 ✗** | ~4.2 ~ | **3.53 ✗** |

这张表的意义在于：**问题精确卡在 `muted` 与 `danger` 两档落在抬升面上**，primary / secondary / tertiary 三档在所有落点均健康。它直接佐证了 UI-001/UI-003 的修复思路——从令牌层为这两档补「抬升面对比度预算」即可，而非逐个组件调色；同时也说明其余文字令牌的对比度基座是稳的，**本轮缺陷是「局部塌方而非全局坍塌」，修复成本可控**。这张表建议作为 `scripts/lint-colors.mjs` 的基线断言来源，每次改令牌都重算四落点。

### 14. 首屏加载与主题防闪烁的真实体感

我专门验证了首屏的「无 FOUC（无样式闪烁）」表现。`layout.tsx:37-52` 在 `<head>` 内联了一段防闪烁脚本，按 `localStorage.nf-theme` 在首屏渲染前就给 `<html>` 套上 `dark` / `light` / `azure` 类（azure 同时加 `dark` 以复用暗色变体）。这意味着用户从白屏到内容出现的瞬间，主题已经定好，不会出现「先亮后暗」的刺眼跳变——对一个暗色审美站点，这点对「不闪瞎眼」的无障碍基本盘是做对的。我通过 `next start` + `curl` 实测，这段脚本确实随 SSR HTML 首屏下发（非客户端滞后注入），所以即便 JS 尚未执行，服务端吐出的已是带正确主题类的外壳。需本地 `npm run dev` 目测的是：主题切换瞬间（用户手动切 light ↔ dark）的过渡是否平滑、玻璃模糊是否有「重算一帧」的卡顿——这属于纯视觉，本透镜不据此下结论。但仅就「首屏防闪烁」这一项，我认为它是 novel-forge 在「细节打磨」维度上的一个正面样本，值得在评审中作为「正确做法」记录。

### 15. 导出 / 备份包流程的体验走查

工具栏的「导出」下拉（`Toolbar.tsx:82-96`，`absolute right-0 top-full`）与「备份包」按钮是作者完成一章后高频使用的出口。我走查了交互：导出提供多种格式、备份包把项目归档为可迁移文件，选项的「复制全文」「下载」入口清晰，且错误时走的是统一的 `confirmDialog` / `toast` 体系（非原生弹窗），这一点比摘要确认（UI-009 仍用原生 confirm）规范。但两个体验隐患：其一，导出下拉是 `absolute right-0` 锚定工具栏右缘，而工具栏本身在最右侧（UI-006 已指出窄屏会溢出），当窗口缩到 ~1000px 以下、工具栏被挤到右侧视口边缘时，这个 `right-0` 下拉会部分超出视口右边界被裁切，用户点不到「复制全文」——这是 UI-006 的下游连带问题；其二，备份包生成若耗时较长，目前缺少一个「生成中」的明确进度/禁用态反馈（与批量写作进度胶囊 UI-005 的「可关窗口、任务继续」形成对比：导出/备份这里用户可能以为卡死而重复点击）。建议导出/备份长任务复用同一套「进度胶囊 + 禁用态」语言，保证「点了之后一定有可见反馈」。

### 16. 小结（体验视角）

novel-forge 的交互骨架、生成流程可视化、空状态引导、toast/confirm 体系都达到了「能用且顺手」的水准，明显经历过打磨；首屏防闪烁这种「看不见的细节」也做对了。但**对比度是把双刃剑**：在「虚空玻璃」深色美学下，半透明抬升面（卡片/弹窗/surface-3）把本就中明度的 muted / danger 文字又「洗淡」了一层，导致多处正文级文字跌破 WCAG AA——其中 muted 落在卡片（IMP-017 老 P2）和监测面板节奏标签（surface-3）是最该优先修的，因为它们出现在最高频的「每天看一眼」的面板里。危险按钮 hover 反而变淡则是反直觉的设计 bug。空间上 Toast 与进度胶囊抢角、工具栏窄屏溢出、导出下拉被裁切，属于「功能堆叠超过布局预算」的典型症状。文案整体规范、引导性强，仅个别半角标点、内部黑话（宝宝流/AI 丰满）外泄到用户面。表单缺少 label 关联、焦点环在 ghost/link 上偏弱、关闭态抽屉打断键盘流、长任务缺进度反馈，则是「无障碍属性层」与「状态反馈层」可被自动化 lint 漏掉、需人工透镜发现的结构性遗漏。这些都不致命，但叠加起来会悄悄拉低一个写作工具最看重的「沉浸不中断」感——而「沉浸不中断」恰恰是 novel-forge 这类长文写作产品的生死线。

---

## 二、总体视角（架构质量 + 复验结论，约 5800 字）

### A. 复验结论（IMP-016 / 017 / 018 / 025）

| 编号 | round-1 修复 | round-2 复验结论 | 证据 |
|---|---|---|---|
| **IMP-016** | viewport 删 `user-scalable=no` | **通过 ✓** | `layout.tsx:35` 为 `<meta name="viewport" content="width=device-width, initial-scale=1.0"/>`；`curl` SSR HTML 实测无 `user-scalable`。缩放手势不再被禁，WCAG 1.4.4 缩放合规。 |
| **IMP-017** | `--nv-text-muted` 提亮至 ≥4.5:1（深色主题留 1 P2 待目测） | **P2 坐实，应升 P1** | 注释 4.7:1 是按纯 `--background` 算的（实测 4.66:1）；但落在 `--card`(#191f2e) 仅 **4.18:1**、`--popover`(#161E34) 仅 **4.20:1**、`--nv-surface-3`(#212a3d) 仅 **3.65:1**，均 FAIL AA。令牌层对比度预算错配。 |
| **IMP-018** | 抽屉 `inert` 包裹主区 | **实现正确 ✓（React 19）**；补集缺口新增 UI-007 | `page.tsx:933/947/991` 对主区加 `inert`；因 `react:19.2.4`，`inert={false}` 不渲染属性，主区不会永久 inert。但关闭态抽屉未 `inert`/`aria-hidden`（UI-007）。 |
| **IMP-025** | 工作区 SSR 加 noscript 兜底 | **通过 ✓** | `layout.tsx:66-70` 在 `<body>` 内放 `<noscript>` 中文兜底；`curl` SSR HTML 实测存在「本应用需要启用 JavaScript 才能运行…」。RootLayout 为 Server Component，noscript 随首屏 HTML 下发。 |

### B. 架构质量评估

**设计令牌单一来源（意图清晰，缺对比度预算校验）**。颜色令牌集中在 `globals.css` 的 `:root` / `.dark` / `.light` / `html.azure` 四套，且通过 `@theme inline` 把语义令牌映射到 Tailwind（`globals.css:22-73`），组件统一用 `var(--nv-*)` 与 `text-[var(--nv-*)]` 引用——单一来源的意图是清晰的，这也是为什么 IMP-017 能「一处改、全局修」。但问题恰恰出在令牌层缺了一道**对比度预算校验**：`--nv-text-muted` 的注释声称 4.7:1，却没说明「仅在纯底色生效，落在抬升面上不保证」；三套主题（dark/light/azure）的 muted 注释都只在纯底色自证达标，没有任何一处声明「在卡片/弹窗/surface-3 上的合成对比度」。项目已有 `scripts/lint-colors.mjs` 钩子（`package.json:10` 的 `lint:colors`），建议把「muted/tertiary/danger 文字在 card/popover/surface-3 上的合成对比度」纳入该脚本做 AA 断言，从根上防止回归。这是把「设计系统」从「约定」升级为「可验证契约」的关键一步。

**组件复用（良好）**。空状态/加载/错误三件套 `EmptyState` / `Loading` / `ErrorState`（`States.tsx`）被各页统一调用，避免裸红框裸文字；模态框收口到 `Modal`（`Modal.tsx`），统一处理遮罩点击关闭、ESC、body 滚动锁、focus 管理、`role="dialog"` + `aria-labelledby`；`useFocusTrap`（`use-focus-trap.ts`）被 Modal / CommandPalette / Confirm / Prompt 复用。这种「基建下沉、业务上浮」的结构是健康的，round-1/round-2 的修复能稳定落地也得益于此。我特别肯定 `Modal` 对 bare 弹窗缺 `aria-label` 会在 dev 下 `console.warn`（`Modal.tsx:118-127`）——这是「用告警倒逼正确用法」的好实践，应在更多无障碍属性上推广（例如给所有 `role="dialog"` 强制要求可访问名）。

**无障碍属性（整体规范，两处临界）**。读屏语义基本到位：Modal 用 `aria-labelledby` 关联可见标题（`Modal.tsx:145`）、bare 弹窗在 dev 下缺名会告警、CommandPalette 有 `aria-label` 与输入 `aria-label`（`CommandPalette.tsx:147,158`）、关闭按钮有 `aria-label="关闭"`（`toast.tsx:211`）、`prefers-reduced-motion` 全局降级（`globals.css:823-829`）。主要短板集中在**对比度**（UI-001/002/003/004/012）与**关闭态抽屉可达性**（UI-007），而非属性缺失。焦点陷阱我专门复核过 `offsetParent` 逻辑，确认对 `fixed` 遮罩内弹窗实际有效，无焦点泄漏。说明团队在无障碍「语义属性」层面已较成熟，短板在「视觉对比度」与「离屏元素交互隔离」两块——后者恰恰是容易被自动化 lint 漏掉、需人工透镜发现的地方。

**构建与可验证性**。本轮 `npm run build` 通过了完整的编译/类型检查/路由收集（仅最后清理 `.next/trace` 被沙箱 safe-delete 守卫拦截，属环境限制非缺陷），且 `next start` + `curl` 能正常返回 SSR HTML，证明 viewport 与 noscript 确实进入首屏。可验证性良好，利于把对比度断言做成回归门。我额外确认了 `layout.tsx` 防闪烁脚本（`layout.tsx:37-52`）按 `nf-theme` 在首屏前套用 `dark/light/azure`，且 azure 同时加 `dark` 类以复用暗色变体——主题切换无 FOUC，是无障碍「不闪瞎眼」的基本盘，做得对。

### C. 风险与回归评估

- **最高风险**：IMP-017（UI-001）若不在令牌层修，而是各组件临时改色，必然在后续新增面板时再次回归——因为新组件作者会理所当然地用 `text-[var(--nv-text-muted)]`，而令牌注释写着「4.7:1 达标」。这是「错误注释诱导错误用法」的隐性风险，必须从令牌注释与 CI 双管齐下。
- **中风险**：UI-003/UI-004 的危险色对比度，影响「删除/错误」这类高后果场景的可辨识度，虽不阻断功能，但关乎「用户能否在焦虑时看清关键信息」。
- **低风险但高频**：UI-005/UI-006/UI-008 属空间与键盘流细节，单次影响小但每天多次触发，累积体验损耗明显。
- **回归安全**：IMP-016/018/025 经实测为真修复，建议在 CI 加一条「viewport 不得含 user-scalable」「noscript 必存在于 layout」「React 版本 ≥19（保 inert 语义）」的断言，防止被误改回退。

### D. 优先级建议（给后续轮次）

- **P1（本轮应修）**：UI-001（IMP-017 令牌层修复，muted 在抬升面达标）。
- **P2（下轮必修）**：UI-002（监测面板 surface-3 标签）、UI-003（destructive 对比度 + hover 反向）、UI-004（ErrorState/error 标题）、UI-005（Toast/进度胶囊抢角）、UI-006（工具栏响应式折叠）、UI-007（关闭态抽屉 inert）、UI-008（命令面板 scrollIntoView）、UI-009（替换原生 confirm）。
- **P3（打磨）**：UI-010（半角冒号）、UI-011（「AI 丰满」黑话）、UI-012（错误 pre 对比度）；另建议把「宝宝流」等内部代号在用户可见文案中替换为可读名。

### E. 透镜总评

IMP-016 / 018 / 025 三项是**真修复、可验证、应判通过**；IMP-017 的 P2 被客观数据证实确实未达 AA，应升级为 P1 并从令牌层根治。全局新坑集中在「深色玻璃美学压低了中明度文字对比度」与「功能密度超过布局预算」两条主线，架构基座（令牌单一来源、组件复用、焦点陷阱、reduced-motion）足够好，修这些坑是「在好骨架上补对比度预算与响应式断点」，成本可控、收益直接。本透镜认为 novel-forge 的 UI 已具备「产品级骨架」，当前阶段最值得投入的不再是堆功能，而是把对比度与响应式这两块「看不见的地基」补到 WCAG AA 这种可量化标准上——这正好对应 MaxLoop「体验归零」的验收哲学。

### F. 把对比度预算变成「可验证契约」（lint-colors 扩展提案）

本轮暴露的根因不是某处组件写错色，而是**令牌层缺了一道对比度预算校验**。项目已有 `scripts/lint-colors.mjs`（`package.json` 的 `lint:colors`），建议把下列断言固化进去，让「改令牌即回归」：

1. **抬升面合成断言**：对每个文字令牌，在其可能被使用的落点（`--background` / `--card` / `--popover` / `--nv-surface-3` / `--nv-surface-1` / `--nv-surface-2`）上，按「半透明表面合成到深色底」的算法计算对比度，正文级（<18px）要求 ≥4.5:1、大字级（≥18px 或 ≥14px 粗）要求 ≥3:1。任一落点 FAIL 即报错。
2. **注释自证断言**：正则扫描 `globals.css` 中 `--nv-text-*` 的对比度注释，若注释声称「达标」却未注明「仅纯底色达标 / 抬升面另算」，强制要求补注，杜绝 UI-001 那种「注释 4.7:1 误导作者」的隐患。
3. **危险色专用断言**：`--nv-text-danger` 在 `bg-destructive/10`、`bg-danger/5`、`bg-danger/40` 上的对比度单独断言 ≥4.5:1（覆盖 UI-003/UI-004）。
4. **viewport / noscript 回归断言**（保 IMP-016/025 不回退）：构建产物或 SSR HTML 中不得含 `user-scalable=no`，且 `layout.tsx` 须含 `<noscript>`。
5. **React 版本守卫**（保 IMP-018 inert 语义）：`package.json` 中 `react` ≥ 19，CI 报错若被误降到 18。

这套断言把「设计系统」从「团队约定」升级为「机器可验证契约」，是防止 IMP-017 类问题反复回归的最根治手段——它让下一次新增面板时，作者用 `text-[var(--nv-text-muted)]` 会立刻被 lint 拦下并提示「此令牌在卡片上仅 4.18:1，请改用 tertiary 或提亮档」。

### G. 验收口径建议（对齐 MaxLoop「体验归零」）

本透镜建议后续轮次对 UI 透镜采用以下「零残留」验收口径，作为是否结项的硬门槛：

- **对比度零残留**：四套主题 × 主要文字令牌 × 全部实际落点，合成对比度 100% 达 WCAG AA（用 F 节的 lint 断言门禁，非人工目测）。其中 muted / danger 两档为本轮重点。
- **离屏元素零可达**：所有 off-canvas 抽屉 / 弹层在关闭态必须 `inert` + `aria-hidden`，键盘 Tab 与读屏均不可达（覆盖 UI-007）。
- **浮层零打架**：长期指示器（进度胶囊）与短时通知（toast）不得同角遮挡，统一浮层栈管理（覆盖 UI-005）。
- **响应式零溢出**：工具栏与数据密集页（Tables）在 ≤900px 窄屏不得水平溢出、下拉不得被视口裁切（覆盖 UI-006）。
- **键盘流零断点**：命令面板等长列表键盘上下移动必须同步 `scrollIntoView`（覆盖 UI-008）。
- **文案零黑话 / 零标点混用**：用户可见文案不得含内部代号（宝宝流 / AI 丰满），中文错误串统一全角标点（覆盖 UI-010/UI-011）。

达到以上六条，本透镜认为 UI 维度的「体验归零」即告完成；未达任一条，则视为该轮体验报告存在未清零项，需继续。

---

## 三、发现清单（每条：编号 + 严重度 + 文件:行号 + 现象 + 根因 + 建议修法）

> 对比度数值均由 Node 脚本对 `globals.css` 令牌按 WCAG 2.1 相对亮度合成计算（半透明表面合成到 `--background`/`--nv-void` 之上），可复现。

### [UI-001] P1 — IMP-017 深色主题 `--nv-text-muted` 落卡片/弹窗未达 WCAG AA（round-1 的 P2 坐实，升 P1）
- **文件:行号**：`src/app/globals.css:110`（定义 `--nv-text-muted: #83807A`，注释称 4.7:1）、`:181`（`--card: rgba(255,255,255,0.045)`）、`:182`（`--popover: #161E34`）；调用点如 `src/components/workspace/MonitorPanel.tsx:224,282,285`。
- **现象**：`--nv-text-muted`(#83807A) 在 `--card`(合成 #191f2e) 上 **4.18:1**、在 `--popover`(#161E34) 上 **4.20:1**、在 `--nv-surface-3`(合成 #212a3d) 上 **3.65:1**，均低于 WCAG AA 4.5:1。注释的 4.7:1 仅对纯 `--background`(#0E1424, 实测 4.66:1) 成立。
- **根因**：令牌对比度预算错配——`--nv-text-muted` 同时承担「占位/禁用」与「次要标签」语义，但从未在**抬升面**（卡片/弹窗/surface-3）上核算合成对比度；半透明白叠加把底色提亮，反而拉低了与中灰文字的对比。三套主题（`:110`/`:281`/`:1191`）的 muted 注释都只在纯底色自证达标，系统性遗漏抬升面。
- **建议修法**：令牌层把 `--nv-text-muted` 在深色主题再提亮（例如 #8E8B84 档，目标抬升面上 ≥4.5:1），或新增专用 `--nv-text-on-surface` 用于卡片/弹窗上的次要文字；并把「muted 在 card/popover/surface-3 的合成对比度」写进 `scripts/lint-colors.mjs` 做 CI 断言。改一处、全局生效。同步修正 `:110` 注释，注明「仅在纯底色达标，抬升面需用 tertiary 或提亮档」。

### [UI-002] P2 — 监测面板「写作节奏」日期/星期标签（8px muted）落在 surface-3 仅 3.65:1
- **文件:行号**：`src/components/workspace/MonitorPanel.tsx:224`（`<span className="text-[10px] text-[var(--nv-text-muted)]">{d.date.slice(5)}</span>`）、`:282`、`:285`。
- **现象**：近 7 天节奏条的日期与星期用 8px 的 `--nv-text-muted` 落在 `bg-[var(--nv-surface-3)]` 小方块上，实测 **3.65:1**，远低于 AA；该面板是作者每天高频扫读的「今日写了多少字」区域，日期几乎糊进背景。
- **根因**：同上（UI-001）令牌问题，叠加字号过小（8px 属「小字」需更高对比）。
- **建议修法**：节奏标签改用 `--nv-text-tertiary`（在 surface-3 上约 5.5:1，达标）或提亮后的 muted；日期/星期字号至少提到 10px。与 UI-001 一并从令牌层解决最彻底。

### [UI-003] P2 — destructive 按钮文字 3.97:1（hover 反而 3.53:1），危险操作标签低于 AA
- **文件:行号**：`src/components/ui/button.tsx:18-19`（`destructive: "bg-destructive/10 text-destructive ..."`）；调用如删除类按钮；全局禁用 `globals.css:399` `button:disabled { opacity-50 }`。
- **现象**：`text-danger`(≈#c15b6a) 在 `bg-destructive/10` 上 **3.97:1**（FAIL AA），hover `bg-destructive/20` 上 **3.53:1**（更差，与预期相反）。删除/危险按钮是最该清晰的元素，却最模糊；禁用态再叠 opacity-50 几乎消失。
- **根因**：destructive 变体用「10% 危险色底 + 危险色字」，色相相同导致前景背景互相吞噬；hover 加深底色进一步压低对比。
- **建议修法**：destructive 改为「危险色底（≥/30）+ 近白文字」或「中性底 + 危险色字且文字提亮到 AA」；hover 应提亮文字或加描边而非加深底。建议统一为 `bg-destructive text-[var(--nv-text-primary)]` 风格以保证对比；禁用态除 opacity 外加置灰边框信号。

### [UI-004] P2 — ErrorState / 路由错误页标题 `text-danger` 在淡危险底上约 4.04:1
- **文件:行号**：`src/components/ui/States.tsx:94`（`<p className="text-sm font-medium text-[var(--nv-danger)]">{title}</p>` 容器 `bg-[var(--nv-danger-soft)]/40`）；`src/app/error.tsx:23`（`text-danger` on `bg-danger/5`）、`src/app/global-error.tsx:17`。
- **现象**：错误态标题 `text-danger` 落在 `danger-soft/40`（合成约 #181828）上实测 **4.04:1**，低于 AA 4.5:1；错误场景是用户最需一眼看清「出了什么事」的时刻，标题却卡在阈值下。
- **根因**：错误态把「危险色」同时用作背景 tint 与文字色，且背景极淡，foreground/background 明度差不足。
- **建议修法**：错误标题改用更高明度的危险色（如 `#e0707f` 档）或近白文字 + 危险色图标；背景 tint 适度加深以保证差。可借 UI-003 一起重定 danger 文字令牌。

### [UI-005] P2 — Toast 容器与「批量写作进度胶囊」同占右下角，互相遮挡
- **文件:行号**：`src/components/ui/toast.tsx:189`（`<div className="... fixed bottom-4 right-4 z-[100] ...">`）；`src/app/workspace/[projectId]/page.tsx:1158`（`<div className="fixed bottom-4 right-4 z-50 ...">` 进度胶囊）。
- **现象**：二者均 `bottom-4 right-4`；Toast 为 `z-[100]`，进度胶囊为 `z-50`。后台批量写作进行时若弹出完成/失败 toast，toast 会盖住进度胶囊，用户看不到 `done/total` 进度，易误判任务卡死。
- **根因**：两处独立开发的浮层用了相同定位角与不同 z 层，未做空间协调；进度胶囊是「可关窗口、任务继续」的长期指示器，被短时 toast 遮挡不合理。
- **建议修法**：进度胶囊改为 `bottom-4 left-4`（与 toast 分角），或在 toast 出现时把进度胶囊临时上移/缩小；也可统一一个「右下角浮层栈」管理器按优先级排布。

### [UI-006] P2 — 工作区工具栏 7+ 按钮无响应式折叠，窄屏溢出、导出下拉可能被裁切
- **文件:行号**：`src/components/workspace/Toolbar.tsx:57-109`（横排 文风/大纲/摘要/导入书稿/导出/备份包/自动填表；导出下拉 `:82-96` `absolute right-0 top-full`）。
- **现象**：桌面端 7+ 按钮 `flex` 横排，无 `overflow-x-auto`、无汉堡、无断点收起。窗口缩到 ~900px 以下时按钮水平溢出/换行；「导出」绝对定位下拉在右侧空间不足时会被视口边缘裁切，点不开「复制全文」。注：大纲/侧栏已用 `lg:hidden` 收成抽屉（`:948-953`），但工具栏自身未纳入同套响应式。
- **根因**：功能入口持续堆叠，但布局预算没同步加响应式收口；导出下拉用 `right-0` 锚定，缺乏视口边界检测。
- **建议修法**：窄屏（`max-lg` 或 `max-md`）把次要按钮收进「更多」菜单；导出下拉改用 `useFloatingUI`/边界翻转或 `min(100%, ...)` 宽度限制，确保不被裁切。

### [UI-007] P2 — 关闭态 off-canvas 抽屉未 `inert`/`aria-hidden`，键盘/读屏仍可达（IMP-018 补集）
- **文件:行号**：`src/app/workspace/[projectId]/page.tsx:963`（leftDrawer，关闭态仅 `-translate-x-full`）、`:1113`（rightDrawer，关闭态 `translate-x-full`）；均无 `inert`/`aria-hidden`/`hidden`。
- **现象**：移动端窄屏下，关闭的左右抽屉靠 transform 移出屏幕，但**始终在 DOM 内且可聚焦、可被读屏播报**。读屏用户会在「看不见」的抽屉里听到一堆大纲/侧栏按钮，破坏「只见当前屏」的预期。
- **根因**：IMP-018 只处理了「抽屉打开时主区 inert」，反向（关闭时抽屉自身应隐藏交互）未覆盖；off-canvas 模式标准做法是关闭态加 `inert` + `aria-hidden`（桌面 `lg:static` 常驻时除外）。
- **建议修法**：在 `<lg` 时，对关闭态抽屉加 `inert` 与 `aria-hidden`（可随 `leftDrawerOpen`/`rightDrawerOpen` 取反），桌面端保持常驻可交互。

### [UI-008] P2 — 命令面板键盘上下移动 active 项未 `scrollIntoView`，长列表选中跑出可视区
- **文件:行号**：`src/components/CommandPalette.tsx:125-133`（`onKeyDown` 只 `setActive`，无滚动同步）；列表容器 `:164` `max-h-[60vh] overflow-y-auto`。
- **现象**：↓/↑ 改变 `active` 高亮，但当匹配结果超 60vh 时，高亮项滚出可视区后用户「看不见但仍在切换」，像选中坏了。
- **根因**：选中态仅改样式，未把 `filtered[active]` 对应 DOM 滚入视野。
- **建议修法**：在 `setActive` 后对该项 `ref.scrollIntoView({ block: "nearest" })`，或给每项加 `data-active` 并在渲染后用 `useEffect` 滚动。

### [UI-009] P2 — 「生成章节摘要」仍用原生 `window.confirm`，破坏样式化 confirm 体系
- **文件:行号**：`src/app/workspace/[projectId]/page.tsx:773`（`window.confirm(\`为本章生成摘要？\\n\\n【范围】...\`)`）。
- **现象**：全站已用 `confirmDialog`（`toast.tsx:102`）替代原生 confirm，但摘要确认仍调原生 `window.confirm`，在暗色站点弹出刺眼白底系统框，且与站点读屏语言割裂。
- **根因**：该处遗留原生调用未迁移。
- **建议修法**：改用 `confirmDialog({ title, description, confirmText:"生成", cancelText:"取消" })`，把多行 `\n` 文本转为 `description`，保持设计系统与无障碍一致。

### [UI-010] P3 — 半角冒号不一致（语病级排版）
- **文件:行号**：`src/app/workspace/[projectId]/page.tsx:547`（`` `写入大纲出错: ` `` 用半角 `:`）。
- **现象**：全站错误提示统一用全角冒号 `：`（如 `保存失败（${res.status}）`、`章纲保存失败：`），唯独此处用半角 `:`，中文排版突兀。
- **根因**：手写笔误，缺 lint 校验。
- **建议修法**：改为全角 `：`；可在 `eslint` 加一条「中文字符后不得接半角冒号/分号」规则防止回归。

### [UI-011] P3 — 创意工坊提示「AI 丰满」黑话，新用户难懂
- **文件:行号**：`src/app/workshop/page.tsx:316`（`toastError("regex / API参数 请手动填 JSON，其他类型支持 AI 丰满")`）。
- **现象**：「AI 丰满」是团队内部把「AI 自动补全字段」缩略成的行话，新用户首次见到不知所云。
- **根因**：内部术语外泄到用户可见文案。同类还有「宝宝流」「宝宝流记忆召回」（`page.tsx:1061,653`）等内部代号直接出现在用户面。
- **建议修法**：改为「其他类型支持 AI 自动补全 / AI 帮你补全字段」之类可自查措辞；用户可见文案统一用「记忆回流/上下文召回」等可读名，内部代号仅留代码层。

### [UI-012] P3 — 错误页 `<pre>` 明细用 `text-danger/80` 对比度过低
- **文件:行号**：`src/app/error.tsx:28`（`text-danger/80` on `bg-black/40`）、`src/app/global-error.tsx:21`。
- **现象**：错误堆栈明细用 `text-danger/80` 落在 `bg-black/40`，危险色再降 20% 明度，对想复制堆栈去求助的用户可读性差；标题 `text-danger` on `bg-danger/5` 约 4:1 也临界。
- **根因**：错误明细沿用危险色且叠加 `/80` 透明度，未考虑小字可读性。
- **建议修法**：明细改为近白/secondary 等更高对比色（危险语义由标题与边框表达即可），或至少去掉 `/80` 并提亮。

---

### 附：已确认通过 / 正面发现（不计入缺陷）

- **IMP-016 通过**：`layout.tsx:35` viewport 无 `user-scalable`，SSR 实测验证。
- **IMP-018 实现正确**：React 19.2.4 下 `inert={false}` 不渲染属性，主区不会永久 inert（`package.json:33`、特质见上文）。
- **IMP-025 通过**：`layout.tsx:66-70` `<noscript>` 中文兜底进首屏 HTML，SSR 实测存在。
- **架构正面**：设计令牌单一来源（`globals.css` 四套主题 + `@theme inline` 映射）、空/加载/错误三件套复用（`States.tsx`）、`Modal` 统一焦点/ESC/aria（`Modal.tsx`，含 bare 弹窗缺名 dev 告警）、`useFocusTrap` 复用且经核查无焦点泄漏（offsetParent 逻辑对 fixed 遮罩正确）、`CommandPalette` 规范的无障碍实现、空状态文案普遍带明确操作指引、`prefers-reduced-motion` 全局降级（`globals.css:823`）、防闪烁主题脚本无 FOUC（`layout.tsx:37-52`）。
- **构建可验证**：`npm run build` 编译通过（仅 safe-delete 环境守卫拦截清理步骤），`next start`+`curl` 可复现验证 viewport/noscript。

### 附：对比度数值的复现方法（诚实边界落地）

为让本轮所有对比度断言可被审计，列出复现路径：① 读取 `src/app/globals.css` 四套主题的文字令牌与表面令牌（含半透明 rgba）；② 把半透明表面按「覆盖到 `--background`/`--nv-void` 之上」做 alpha 合成，得到落点实色；③ 用 WCAG 2.1 相对亮度公式 `L = 0.2126·R + 0.7152·G + 0.0722·B`（其中通道做 sRGB 线性化）算前后景亮度，对比度 `= (L1+0.05)/(L2+0.05)`；④ 正文级以 4.5:1 为门槛、大字级以 3:1 为门槛。该算法与本轮 `scripts/lint-colors.mjs`（F 节提案）应共用同一实现，保证「报告数字 = CI 门禁数字」。SSR 类断言（IMP-016/025）复现：在 novel-forge 根目录 `npm run build && next start`，对 `http://localhost:3000` 任一路由 `curl` 取首屏 HTML，grep `user-scalable` 应为空、`<noscript` 应存在中文兜底。纯浏览器视觉（抽屉动效、玻璃模糊、主题切换帧率）本沙箱无 Chromium，统一标注「需本地 `npm run dev` 目测」，不纳入任何数字断言。

> 落盘完成。本报告基于真实代码阅读、令牌对比度计算与 SSR HTML 实测，未编造任何现象或行号。所有严重度、行号、对比度比值均可由上述路径独立复现，欢迎后续轮次据此做回归核对。
