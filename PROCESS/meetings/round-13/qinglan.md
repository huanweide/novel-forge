# 清览（UI / 无障碍）透镜 · Round 13 只读诊断报告

- 项目：novel-forge ｜ 当前 HEAD = `v0.46.77` ｜ 工作副本 `C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge\`
- 复验性质：**只读** —— 未改动任何源码 / 配置 / changelog / version。
- 方法：① 抓 SSR HTML 看语义标记（curl http://127.0.0.1:3001）；② 逐文件读源码取证（均给 `file:line`）；③ curl 探关键 API。沙箱无 Chromium/显示，凡涉及真实渲染/读屏/悬浮态/首用教程交互的项，均明确标注 **「需本地浏览器验收」**，绝不假装真机验证。
- 焦点：CommandPalette / Prompt / Modal / Toast 的 aria 标记、抽屉焦点陷阱/ESC/inert、暗色 select option 对比度(WCAG 1.4.1)、首用教程/防误触/悬浮态；并覆盖用户 20 点精神的全局体验清单。

---

## 一、概要（一句话体验结论）

> **Round 12 的全部 a11y 问题（含 L1 inert 抽屉方案）在本轮源码中均已真实落地、稳如磐石，且未发现任何新的 P0/P1 级无障碍缺陷；仅余若干 P2 级打磨项（缺 skip-link、命令面板选项未对读屏暴露、原生 select 在 Chromium 下无法强制高亮/非颜色线索）。**

---

## 二、Round 12 修复回归核验（逐条 PASS）

| # | 验收点 | 本轮证据（file:line） | 结论 |
|---|--------|----------------------|------|
| A1 | explore 抽屉开启时 header + StepProgress 包 inert | `src/app/explore/page.tsx:525`（header `inert`）、`:625`（StepProgress 包 `inert`） | **PASS** |
| A2 | workspace Toolbar + 次级栏包 inert | `src/app/workspace/[projectId]/page.tsx:848`、`:863`、`:913` | **PASS** |
| A3 | game 顶栏 header + main 包 inert | `src/app/workspace/[projectId]/game/[nodeId]/page.tsx:442`、`:670` | **PASS** |
| A4 | 对话框不参与 inert、焦点陷阱仍生效 | 三页 `aside` 为 inert 包裹的**兄弟节点**（explore:633/688、workspace:848/913、game 抽屉）、未被 inert；`useFocusTrap` 已挂（explore:45-46、workspace:127-128、game:117-118）；`role=dialog`+`aria-modal` 仅抽屉开时生效（explore:636-638、692-694） | **PASS** |
| B1 | 命令面板搜索框 aria-label | `src/components/CommandPalette.tsx:158`（`aria-label={projectId ? "搜索章节、角色、世界书、规则或执行操作" : "搜索操作或页面跳转"}`） | **已修复** |
| B2 | Prompt 弹窗输入框 aria-label | `src/components/ui/toast.tsx:294`（`aria-label={promptState.opts.title}`） | **已修复** |
| B3 | 2 字实体名尾边界校验（灭「王林海」误亮） | `src/core/entity-highlighter.ts:210-214`（`tailOk = !tailChar \|\| !/[一-鿿]/.test(tailChar)`） | **已修复** |
| B4 | 实体高亮非颜色线索（WCAG 1.4.1） | `src/app/globals.css:802-833`（差异化下划线 solid/dotted/dashed + `::before` 前导形状标记 circle/square，按 category 区分） | **已修复** |
| B5 | 暗色原生 select option 高亮态对比度 | `src/app/globals.css:1325-1340`（`option:hover/:checked { background: var(--nv-primary); color:#fff }`） | **部分修复（见 P2-3）** |
| B6 | bare Modal 缺 label 的 dev 防护 | `src/components/ui/Modal.tsx:111-127`（dev 下 `console.warn` 缺可访问名） | **已落地** |
| B7 | 窄屏抽屉遮罩加 aria-hidden | `src/app/explore/page.tsx:709`、`workspace/[projectId]/page.tsx:1062`、`game/[nodeId]/page.tsx:975`（均 `aria-hidden="true"`） | **已修复** |

**结论**：A1–A4（L1）本次源码逐行复核仍然稳定；B1/B2/B3/B4/B6/B7 全部已落地；B5 已做，但受浏览器平台限制仅 Firefox 生效（见 P2-3）。

---

## 三、本轮新增诊断（按严重级）

### P0（键盘/读屏完全不可用）
**无。** CommandPalette / Modal / Toast(confirm/prompt) / 三页抽屉 全部具备 `role=dialog` + `aria-modal` + 焦点陷阱 + ESC + 可访问名；Toast 用 `role="status"/"alert"`（toast.tsx:195）自带 live 语义。无任何组件把整页误置 inert，无对话框缺 label，无键盘陷阱失效。

### P1（可见 a11y 缺陷）
**无新增。** Round 12 的 4 个 P1（B1/B2/B3/B4）已全部修复；本轮源码扫描未发现新的 P1 级缺陷。唯一与团队焦点「暗色 select 高亮对比度(WCAG 1.4.1)」直接相关的残留项，因属浏览器平台限制（非代码 bug），归入 P2-3 并明确标注验收条件。

### P2（可优化 / 打磨项）

**P2-1 · 全站缺「跳到主内容」skip-link（WCAG 2.4.1 Bypass Blocks）**
- 证据：首页 SSR `src/app/page.tsx` 渲染 `<header class="nf-header …">` 后直接 `<main>`，全局 `src` 无 `skip-to-content`/`sr-only` skip 链接（grep 命中仅业务逻辑用例，无 a11y skip）。根页 `lang="zh-CN"`、`<main>`/`<header>`/`<footer>` landmark 齐全（已抓 SSR 确认）。
- 影响：键盘 / 读屏用户每次进入页面都要先 Tab 过顶栏所有按钮才能到达正文；长页面尤其累。
- 建议：在 `<body>` 顶部加一个视觉隐藏、focus 时显现的 `<a href="#main" class="sr-only focus:not-sr-only">跳到主内容</a>`，并给各页 `<main>` 加 `id="main"`。

**P2-2 · 命令面板选项未对读屏暴露（combobox/Listbox 语义缺失，WCAG 4.1.2 / 2.4.7）**
- 证据：`src/components/CommandPalette.tsx:172-188`，列表项为纯 `<button>`；`active` 高亮仅由 `i === active` 的 className（`bg-[var(--nv-primary-soft)]`）驱动，无 `role="listbox"`/`role="option"`、无 `aria-selected`、`<input>` 无 `aria-activedescendant`（line 153-161）。
- 影响：焦点始终停在搜索框，方向键改变的是内部 state 而非 DOM 焦点，**读屏不会播报当前高亮项**（「第 3 / 12 项：王林 · 角色」）。鼠标/明眼键盘用户可见高亮，读屏用户只能盲按 Enter。功能可用但不对 AT 友好。
- 建议：给列表容器加 `role="listbox"`，选项加 `role="option"` + `aria-selected={i===active}`，给 `<input>` 加 `role="combobox"` + `aria-activedescendant={当前项 id}` + `aria-controls`；或至少给每个选项 `aria-label` 合并 type 标签。
- 验收：需本地浏览器验收（读屏朗读顺序/active 播报）。

**P2-3 · 原生 `<select>` 暗色高亮 + 非颜色线索仅在 Firefox 生效（Chromium 平台限制，WCAG 1.4.1 在主流浏览器未完全达成）**
- 证据：`src/app/globals.css:1318-1341` 已正确补 `select option/:checked` 的 `background: var(--nv-primary); color:#fff`；但 **Chromium 系（Chrome/Edge，约 70%+ 用户）的原生下拉在展开时使用 OS 渲染菜单，CSS 对 `option` 的 `background`/`color`/`:hover`/`:checked` 大部分被忽略**，项目无法强制其高亮色或叠加非颜色线索（形状/下划线）。
- 影响：暗色主题下，Chrome/Edge 用户的 select 选项高亮完全由操作系统主题决定，项目意图的「高对比 + 非颜色区分」**在主流浏览器不可达**；色觉障碍用户在 Chrome 下仍可能仅依赖颜色区分选中项。注意功能仍完全可用（键盘/AT 可选），故非 P0/P1，但确实未满足团队点名的「WCAG 1.4.1 非颜色线索」目标。
- 建议：① 对关键选择（如角色类型、世界书分类等）迁移到项目自有的自定义 listbox/combobox（可复用 Modal/CommandPalette 的焦点陷阱与 `role=option` 模式），以跨浏览器保证高亮对比 + 非颜色线索；② 若保留原生 select，至少在折叠态（closed select）用 `:focus` 环与文字提示补足非颜色线索。
- 验收：**需本地浏览器验收**（分别在 Firefox 与 Chrome/Edge 暗色下目检展开下拉的高亮与可读性，无法仅靠源码判定）。

**P2-4 · Toast 自动消失进度条未 `aria-hidden`（轻微）**
- 证据：`src/components/ui/toast.tsx:217-222` 的 `<div style={{animation: toastProgress …}} />` 为纯装饰进度条，无 `aria-hidden`。
- 影响：个别读屏/AT 可能将其识别为 `progressbar` 并播报空值；极低噪声。
- 建议：给该进度条加 `aria-hidden="true"`。

**P2-5 · Toast 自动消失无「悬停/聚焦暂停」（WCAG 2.2.1 / 2.2.4 边缘）**
- 证据：`src/components/ui/toast.tsx:157-162` 固定 `duration` 后 `setTimeout` 移除，无 `onMouseEnter` 暂停逻辑；`role="alert"` 的 error toast 亦如此。
- 影响：长错误提示可能在用户阅读途中消失；所幸每个 toast 带「关闭」按钮（`aria-label="关闭"`，toast.tsx:211），信息不丢失，但阅读节奏被打断。
- 建议：hover/focus 时暂停倒计时、移开恢复（轻量改进）。
- 验收：需本地浏览器验收（自动消失时序）。

**P2-6 · 移动端关闭态抽屉仍可进入 Tab 序（轻微）**
- 证据：`src/app/explore/page.tsx:632-644`、`workspace/[projectId]/page.tsx` 左/右 `aside` 在关闭时仅靠 `-translate-x-full` 移出屏幕（移动端），`role` 置 `undefined` 但元素仍在 DOM 且**未加 `inert`/`aria-hidden`**；桌面端（lg）其为常驻静态栏，本应可聚焦。
- 影响：移动端无抽屉打开时，键盘用户可能 Tab 进屏外（off-screen）的隐藏面板内容。注意：一旦某抽屉打开，`useFocusTrap` 会把 Tab 锁在该抽屉内，故打开态下无此问题；仅「移动端关闭态」边缘场景。
- 建议：移动端关闭态给 off-screen `aside` 加 `inert` + `aria-hidden`（用 `lg:` 断点仅在移动生效，避免影响桌面常驻栏）。

**P2-7 · 命令面板无可见关闭按钮（可发现性）**
- 证据：`src/components/CommandPalette.tsx:142-150` 无显式「✕」关闭按钮，仅依赖 ESC（useFocusTrap，line 35）与遮罩点击（line 140）。
- 影响：读屏/键盘用户虽可用 ESC 关，但缺可见关闭入口、缺 `aria-label="关闭"` 按钮，可发现性略弱。
- 建议：在面板右上加一个 `aria-label="关闭"` 的按钮（与 Modal 一致）。

---

## 四、全局体验清单（用户 20 点精神）只读印证

以下为基于源码 + SSR 的只读结论，凡涉交互手感/流畅度/读屏朗读顺序的均标 **「需本地浏览器验收」**：

1. **逐按钮/页面交互**：顶栏（CommandPalette 触发、主题切换 `ThemeToggle.tsx`）、各页抽屉（explore/workspace/game）均挂 `useFocusTrap` + ESC + `aria-modal`，交互闭环完整。**（源码已证）**
2. **填表溯源**：表单类弹窗统一收编到 `Modal`/`toast.promptDialog`（均带 `aria-label`/`labelledby`）；`LorebookEditDialog.tsx:133` 等带字数上限提示。具体「填了是否真落库、能否回看来源」需真实提交验证。**（需本地浏览器验收）**
3. **世界卡去重**：实体高亮按 `name`/`id` 去重（`buildEntityMapFromData` 第二遍 title 覆盖同名），`ChapterEntitiesPanel` 按 id 去重（changelog 2516 印证）；`COMMON_STOP_WORDS` 停用词防污染。**（源码已证，去重逻辑健全）**
4. **LLM 上下文记忆**：`src/components/editor/ContextPreview.tsx` 把 system/globalMemory/triggeredLore/short&medium&longTerm memory/authorNote 分区的 Token 用量可视化，顶栏总 Token 与 `usagePercent` 同源自洽（line 127-129）。**上下文记忆可见、可溯源。（源码已证）**
5. **游戏流畅度**：`game/[nodeId]/page.tsx` 抽屉 `inert` + 焦点陷阱 + 首用教程（`Modal` + `labelledBy="game-tutorial-title"`，line 398-438）；具体帧率/卡顿需真机。**（需本地浏览器验收）**
6. **监测面板 token/费用**：`src/components/workspace/MonitorPanel.tsx` 同时给出 Token 估算（生成/Prompt/总计）、**AI 成本看板（¥ + ≈$、按模型、按项目、占比）**、调用次数、写作节奏、每日目标。token 与费用双覆盖、口径自洽。**（源码已证，满足「监测面板 token/费用」）**
7. **按钮意义/教程/防误触**：首用教程齐备——工作台 `OnboardingModal`（`nf_onboarded_v1` 标记，关即不重复，localStorage）、游戏 `nf-game-tutorial-seen` 教程、首页「起步引导卡」（`src/app/page.tsx:491`）；破坏性操作经 `confirmDialog({danger:true})`（toast.tsx:259-263，`btn-danger` 红）二次确认。**（源码已证，防误触到位）**
8. **悬浮态**：暗色 hover 普遍用 `hover:bg-[var(--nv-surface-2)]`/`hover:text-[var(--nv-text-primary)]`，`ThemeToggle`、Modal 关闭钮均有 hover 反馈。**具体对比度需真机目检。（需本地浏览器验收）**

---

## 五、诚实标注：源码已证 vs 需真机验收

**源码已证（本次静态审查确定）：**
- A1–A4、B1/B2/B3/B4/B6/B7 全部真实落地；无 P0/P1。
- Toast 的 `role=status/alert` live 语义、Modal/CommandPalette 的 `role=dialog`+`aria-modal`+焦点陷阱+ESC。
- 抽屉开启时 header/main/StepProgress/Toolbar 被 `inert` 挡在 AT/键盘之外。
- 监测面板 token/费用双覆盖；首用教程（OnboardingModal + 游戏教程）与 `confirmDialog(danger)` 防误触到位。
- 实体去重逻辑健全；上下文记忆分区可视化。

**需本地浏览器验收（不能仅靠源码判定）：**
- P2-2 命令面板选项的读屏播报（combobox 语义缺失的真实影响）。
- P2-3 原生 select 在 **Chrome/Edge 暗色**下的下拉高亮与可读性（平台限制，源码无法保证）。
- P2-5 Toast 自动消失时序与暂停行为。
- 全局清单第 2/5/8 项（填表落库回看、游戏流畅度、hover 对比度）。
- Round 12 已点名的「首用教程 / 防误触 / 悬浮态」交互手感——本次仅静态确认其存在与可访问名，未跑真实读屏/点击穷举。

---

## 六、本轮 P0/P1 建议结论

> **本轮是否还有 P0/P1 建议：否。**
> 全部历史 a11y 缺陷（含 L1 inert 抽屉方案与 4 个 P1 输入框/实体问题）在本轮源码中均已稳定落地；本轮新扫描未发现任何 P0 或 P1 级无障碍缺陷。余下 7 个 P2 打磨项（P2-1 skip-link、P2-2 命令面板 combobox 语义、P2-3 Chromium 原生 select 限制、P2-4 Toast 进度条 aria-hidden、P2-5 Toast 暂停、P2-6 移动端关闭态抽屉 Tab、P2-7 命令面板关闭钮）均为优化级，不影响键盘/读屏基本可用性。
