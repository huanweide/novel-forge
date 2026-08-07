# 透镜 L4 UI/无障碍/响应式审计（round-8 / v1.6.9）

- **审计基线**：已发布 v1.6.9（commit fc5a662，与 origin/main 一致）
- **审计者**：round-8 只读深度审计员（L4 透镜）
- **范围约束**：只读诊断，未修改任何源码；所有发现附带 file:line 与证据，无法实测处标注「静态推断」。
- **已排除**（按 round-7 约定不再报告）：浅色 `--nv-text-tertiary` 对比度（round-7 已修至 ≥AA）。

---

## 一、审计方法与范围

**读取/静态分析的文件：**

1. **设计令牌与全局样式**：`src/app/globals.css`
   - 三套主题令牌：深色（默认，行 83-111）、浅色（行 257-283）、苍青 azure（行 1168-1194）。
   - 按钮体系 `.btn-primary/.btn-success/.btn-danger/.btn-creative/.btn-ghost`（行 498-577）、输入框 `.input-glass`（592-612）、聚焦环 `.focus-ring`（688-690）、禁用态 `button:disabled{opacity-50}`（行 22）。
2. **工作区主框架（响应式/抽屉/焦点陷阱）**：`src/app/workspace/[projectId]/page.tsx`（行 42-1159）
3. **共享模态/通知**：`src/components/ui/Modal.tsx`、`src/components/ui/toast.tsx`
4. **状态徽章**：`src/components/ui/status-badge.tsx`
5. **核心写作/生成面板**：`src/components/workspace/CenterPanel.tsx`、`src/components/workspace/AIChatBar.tsx`
6. **跨页响应式抽样**：`src/app/page.tsx`（首页）、`src/app/settings/page.tsx`、`src/app/recycle/page.tsx`、`src/app/workshop/page.tsx`、`src/app/workspace/[projectId]/game/[nodeId]/page.tsx`、`src/app/workspace/[projectId]/tables/page.tsx`
7. **辅助面板**：`src/components/workspace/ForeshadowingPanel.tsx`

**方法**：Grep 全局扫描 `aria-live`/`role=dialog`/`useFocusTrap`、响应式断点（sm/md/lg）、`overflow`、颜色令牌引用；用 OKLCH→sRGB 转换脚本（相对亮度公式）对关键文字令牌实测对比度。

---

## 二、发现清单

| ID | 严重度 | file:line | 问题描述 | 证据/复现 | 修复建议 |
|----|--------|-----------|----------|-----------|----------|
| **F-01** | **P1** | `globals.css:276`（浅色 `--nv-accent`）；`src/app/settings/page.tsx:491`；`src/app/recycle/page.tsx:91`；`src/app/workshop/page.tsx:438`；`src/app/page.tsx:320`；`src/app/workspace/[projectId]/game/[nodeId]/page.tsx:1071-1072,1243`；`src/components/ui/status-badge.tsx:25,26` | **浅色主题金色强调文字对比度严重不足，低于 WCAG AA 4.5:1**。令牌 `--nv-accent` 浅色 = `oklch(0.68 0.14 95)` ≈ rgb(180,150,0)，在浅色页面背景 [243,239,232] 上实测 **CR=2.51:1**。多处作为小号文字/状态标签使用（"执行方式："、"回收站"、"内置"、"创建中…"、跑团选项名、`StatusBadge` 的"待确认"/"审校中"）。深色(9.20)、苍青(11.29) 主题达标，仅浅色不达标。 | 用 OKLCH→sRGB 转换 + 相对亮度公式实测：浅色背景 CR=2.51（AA 需 4.5）。各引用点 file:line 已列。 | 浅色主题为文字用途单独提供暗金令牌（如 `oklch(0.50 0.12 95)` 一类，目标 ≥4.5:1）；或状态徽章改用 tertiary/secondary 文字 + 图标而非金色；新增 `--nv-accent-text-on-light` 专用变量并全局回填。 |
| **F-02** | **P2** | `globals.css:265`（浅色 `--nv-primary`）；引用处：`src/app/dissect/page.tsx:171,185,253,259`、`src/components/dashboard/SettingsImporter.tsx:146,215`、`src/components/editor/ContextPreview.tsx:159,245`、`src/components/editor/ImportWizard.tsx:869` 等 | **浅色主题主色（靛蓝）文字临界低于 AA**。令牌 `--nv-primary` 浅色 = `oklch(0.55 0.17 270)` ≈ rgb(76,102,211)，在浅色页面背景实测 **CR=4.42:1**，略低于 4.5；在纯白卡片上 ≈4.7 可过，故仅在文字落在浅色 page 背景时才不达 AA（链接/强调文字常见场景）。 | 实测：浅色背景 CR=4.42（AA 需 4.5），差值 0.08，属临界失败。 | 浅色主题主色再压暗一档（如 `oklch(0.52 0.17 270)` ≈ rgb(64,89,196)）使全背景场景稳定 ≥4.5；或正文链接改用更深的专用链接色。 |
| **F-03** | **P1** | `src/app/workspace/[projectId]/page.tsx:47-58,1049`;`src/components/workspace/CenterPanel.tsx`（接收 `genStep`） | **生成/写作状态变更未通过 `aria-live` 通知无障碍用户**。写作生成流程状态（`genStep`：loading-cards/confirming/generating/reviewing/summarizing/done/error，文案见 50-58 行）与流式正文注入（`streamContent`）仅以可视文本/动画呈现，**全仓无 `aria-live` 区域**。读屏用户在数十秒的生成过程中无法获知"正在写作/完成/出错"。 | 全仓 `grep -rn "aria-live"` 零命中；`genStep` 标签仅作可视展示（1049 传入 CenterPanel）。对比：`toast.tsx:195` 已用 `role="alert"/"status"`（隐式 aria-live），说明项目具备该能力但生成状态遗漏。 | 在展示 `genStep` 标签的容器加 `aria-live="polite"`（error 用 `assertive`），或新增一个 `sr-only` 的 status region 同步 `genStep` 文案与"生成完成/出错"。 |
| **F-04** | **P2** | `src/app/workspace/[projectId]/game/[nodeId]/page.tsx`（断点仅 7 处）；`src/app/workshop/page.tsx`（1 处）；`src/app/workspace/[projectId]/tables/page.tsx`（1 处）；`src/app/workspace/[projectId]/page.tsx:947` | **部分二级页/工具栏响应式断点薄弱（静态推断）**。工作区主框架已实现 <lg 抽屉化（948-1144，含 focus trap/inert/遮罩），首页与设置页响应式良好；但：① 互动式"跑团"选项按钮、工作台卡片在 <640px 可能横向溢出/拥挤（断点计数偏低，未实测渲染）；② 工作区顶部工具栏 `flex items-center gap-2` 无 `flex-wrap`，窄屏按钮过多时可能横向溢出。 | grep 断点统计：game 7 / workshop 1 / tables 1；page.tsx:947 工具栏无换行处理。「静态推断」：未跑渲染截图核验。 | 为 game/workshop/tables 选项与卡片补 `flex-wrap`/`grid` 响应式；工具栏加 `min-w-0`/`truncate` 或允许换行；建议对跑团页做窄屏实测。 |
| **F-05** | **P2** | `src/app/workspace/[projectId]/page.tsx:948-952`;`src/components/workspace/AIChatBar.tsx:335-337` | **图标按钮依赖 `title` 而非 `aria-label`**。多处纯图标按钮仅用 `title=` 提供可访问名（左右栏切换按钮、AIChatBar 预设按钮）。`title` 可作可访问名，但在键盘聚焦/读屏播报可靠性上弱于 `aria-label`，且 hover 才显示、触屏无 tooltip。首页示例/导入按钮（page.tsx:202,205）已用 `aria-label` 为正面反例。 | 源码 grep：page.tsx:948-952（`title=` 无 `aria-label`）、AIChatBar.tsx:335-337（预设按钮仅 `title={p.prompt}`）。 | 为所有纯图标/`title`-only 按钮补 `aria-label`（明确动作语义）。 |
| **F-06** | **P2** | `src/components/workspace/CenterPanel.tsx:316,503` | **长中文正文容器缺乏 `overflow-wrap`，中英混排长 token 可能横向溢出（静态推断）**。章节正文容器（316 `overflow-y-auto` + 503 `whitespace-pre-wrap`）仅处理纵向滚动与换行；`pre-wrap` 不折行超长连续英文/URL。正文为中英混排时，长英文词/链接在窄屏可能横向溢出破坏布局。 | 源码：503 行 `whitespace-pre-wrap` 无 `break-words`/`overflow-wrap`。「静态推断」：未实测具体渲染。 | 在正文容器加 `overflow-wrap:anywhere`（或 `break-words`）+ `max-w-full`，防止长 token 横向溢出。 |

**附：禁用态（非阻塞观察，不计入严重度）**
全局 `button:disabled{opacity-50}`（`globals.css:22`）使禁用按钮仅凭"变淡"区分，低视力/色弱用户难辨启用/禁用。WCAG 1.4.3 对禁用控件豁免对比度，但建议补充非颜色线索（如 `disabled` 时加斜纹/「禁用」标识）作为体验增强，列为可选优化。

---

## 三、已确认无问题的区域（诚实边界）

- **模态框系统**：`ui/Modal.tsx` 已正确实现 focus trap（`useFocusTrap`）、ESC 关闭、点击遮罩关闭、`aria-modal`、`aria-labelledby`、body 滚动锁定；`bare` 弹窗缺可访问名时 dev 下 `console.warn` 防护。✓
- **通知/确认/输入对话框**：`toast.tsx` 中 toast 用 `role="alert"`(error)/`role="status"`(其余) 具备隐式 `aria-live`；confirm/prompt 均 `role="dialog" aria-modal aria-labelledby` 且带 focus trap。✓
- **工作区移动端框架**：<lg 抽屉化 + focus trap + `inert`（947/991）+ 半透明遮罩（1144），响应式与焦点管理基础扎实。✓
- **首页**：`page.tsx` 使用 `sm/md/lg` 栅格与 `hidden sm:inline` 控制，响应式良好。✓
- **设置页**：单列 `max-w-2xl mx-auto` 流式布局，移动端无横向溢出风险。✓
- **StatusBadge**：六态均含 **文字标签 + 图标 + 颜色**（`status-badge.tsx:21-29`），并非"仅靠颜色"区分状态。（注：其中 pending_confirm/reviewing 的标签文字本身是金色，受 F-01 对比度影响。）✓
- **ForeshadowingPanel 伏笔状态**：使用 dot + 文字色 + `label` 字段（含"待触发/已触发/部分兑现/已兑现/已作废"等词，`ForeshadowingPanel.tsx:33,59-63`），非颜色唯一载体。✓
- **生成失败提示**：存在 `toastError` + `genStep="error"` 标签（page.tsx:57），并非完全缺失（仅缺 aria-live 播报，见 F-03）。✓

---

## 四、需 Chair 关注的跨透镜风险

1. **F-01 本质是全局设计令牌缺陷（L4 ↔ 设计系统/L2 交界）**：浅色 `--nv-accent` 文字对比度问题影响所有引用金色文字的页面（settings/recycle/workshop/game/StatusBadge）。建议由设计令牌负责人统一在**浅色主题**修正 accent 文字变体，并回归三套主题（dark/light/azure）的 AA；不要在各页面逐个打补丁。
2. **三主题令牌对比度回归缺口（L4 ↔ 设计系统）**：现有对比度论证多聚焦深色令牌；**苍青 azure 主题**（`globals.css:1168-1194`）的 accent/primary/muted 在浅色 surface 上是否同样需要专门校验尚未覆盖——建议纳入统一回归脚本（项目已有 `contrast_calc.mjs`），对三主题逐一输出令牌组合 CR 表。
3. **F-03 跨透镜可见性**：生成状态的"无 aria-live 播报"同时涉及前端（L4）与"AI 生成体验/可感知性"（L1/L3 范畴）——若 Chair 将"可感知的进度反馈"列为产品可用性指标，建议与生成流程重构一并处理。
