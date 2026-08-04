# Round 8 L1 只读诊断 · 清览（前端体验 / 无障碍透镜）

> 日期：2026-08-04 ｜ 只读复验 + 挖新坑 ｜ 严禁改源码/CHANGELOG/MEMORY/其他 round 报告
> 范围：`Modal.tsx`、`globals.css`、全仓 `role="dialog"`/`<Modal`/遮罩/抽屉、键盘焦点、移动端布局

## 一、Round 7 复验结论（清览透镜）

CHANGELOG v0.46.70 声称「19 处裸弹窗补 aria 关联（StyleEditor 两状态 + 17 处标题关联）」。逐点核对：

- **全部 `<Modal>` 调用点（共 31 处）均已带可访问名称**：9 处 `title`（自动 `id` 关联 `<h3>`）、多处以 `ariaLabel` 直传（BackupDialog/ImportDialog/ExportDialog/MemoryDecay/LorebookEdit/StyleEditor×3/DrawCards/OutlineDialog/CharacterDialog/Onboarding/SaveConflict/ConflictPanel）、其余以 `labelledBy` 引用面板内 `<h2>/<h3 id>`。
- **15 个 `labelledBy` 目标 id 全部真实存在**（已逐一 Grep 确认：`settings-importer-title` `changelog-modal-title` `shortcut-modal-title` `upload-preset-title` `build-config-title` `import-wizard-title` `create-table-title` `automation-settings-title` `expand-result-title` `pregen-confirm-title` `project-config-title` `new-rule-title` `rule-form-title` `storyline-edit-title` `toolbox-dialog-title`）。
- `Modal.tsx:111-134` 的命名派生逻辑（`title→titleId` / `header字符串→aria-label` / `bare→labelledBy或ariaLabel`）经核实正确，无指向空 id 的虚关联。
- 全仓 `role="dialog"` 仅出现在 `Modal.tsx`，无散落 `fixed inset-0` 手写弹窗、无 `<Dialog>` 残留。

**结论：Round 7 在 Modal 体系内的 WCAG 4.1.2 名称缺口已真实闭合，无回退、无遗漏。** 但修复未覆盖「非 Modal 的弹层」与「移动端抽屉」，见下。

## 二、新坑（P0 / P1 / P2）

### P1（明显缺陷，读屏/键盘可达性缺口 —— Round 7 未覆盖）

- **P1-1 `src/components/ui/toast.tsx:206-248` Confirm 对话框**
  现象：手写 `fixed inset-0 z-[110] bg-black/60` 模态遮罩 + `<h3>` 标题，但**无 `role="dialog"`、`aria-modal`、`aria-labelledby`（`h3` 无 `id`）、无焦点陷阱、无初始焦点、未捕获 document 级 ESC**。本质是阻断交互的模态，却无任何对话框语义，读屏报「对话框」失败、键盘可 Tab 到背后内容。严重度 P1（WCAG 4.1.2 / 2.1.1 / 2.4.3）。建议：改用 `<Modal>` 或补 `role="dialog" aria-modal aria-labelledby={titleId}` + `useFocusTrap` + 初始聚焦取消按钮。
- **P1-2 `src/components/ui/toast.tsx:251-` Prompt 对话框**
  现象：同上，`<h3>` 无 `id`、无 `role`/`aria-modal`/焦点陷阱；仅 `input autoFocus` 提供初始焦点。**唯一稍好点是输入框聚焦**，但整体缺对话框语义与 ESC 关闭（ESC 仅在输入框聚焦时由 input 自身处理，焦点移出即失效）。严重度 P1。建议：同 P1-1 迁移到 `Modal`（Modal 已支持 `ariaLabel`）。
- **P1-3 `src/components/CommandPalette.tsx:132-181` 命令面板**
  现象：`fixed inset-0 z-[120]` 模态遮罩，但**无 `role="dialog"/"combobox"`、`aria-modal`、`aria-label`、焦点陷阱、返还焦点**；ESC 仅在输入框聚焦时经 `onKeyDown` 生效（`CommandPalette.tsx:127`），焦点离开输入框后 ESC 无法关闭；点击遮罩关闭依赖 `onClick` 而非按钮。严重度 P1（模态交互缺语义与键盘闭环）。建议：补 `role="dialog" aria-modal aria-label="命令面板"` + `useFocusTrap` + `useEffect` 级 ESC 监听。

### P2（排期 / 移动端 / 对比度）

- **P2-1 移动端抽屉缺焦点陷阱与对话框语义**
  位置：`src/app/explore/page.tsx:623,670`；`src/app/workspace/[projectId]/game/[nodeId]/page.tsx:498,729`；`src/app/workspace/[projectId]/page.tsx`（aside 容器 + `:1036` 遮罩）。
  现象：窄屏 `lg:hidden` 时 aside 以 `fixed inset-y-0 z-40 max-w-[85vw]` 滑出、配 `fixed inset-0 z-30` 点击关闭遮罩，但**无 `role="dialog"`、`aria-modal`、焦点陷阱、ESC 关闭**，屏幕阅读器与键盘用户焦点可逃逸到被遮背景。严重度 P2（仅移动端，桌面 `lg:static` 正常）。建议：抽屉加 `role="dialog" aria-modal aria-label` + `useFocusTrap` + ESC 关闭；遮罩 div 改 `<button>` 以利键盘。
- **P2-2 `src/components/workspace/ExpandResultModal.tsx:64` 移动端横向溢出**
  现象：`panelClassName="w-[480px] max-h-[80vh] ..."` —— 固定 `w-[480px]` 且无 `max-w-[..vw]` 约束。在 ≤512px 视口（如 360px 手机）下，面板宽 480px 超出 `overlay(p-4)` 可用宽，被 `inset-0` 裁切、无横向滚动，右侧内容（含关闭/操作）不可达。严重度 P2。建议：`w-[480px]` 改为 `w-full max-w-[480px]`（同类 `MemoryDecayDialog` 已用 `w-[460px] max-w-[92vw]` 正确写法）。
- **P2-3 `src/app/globals.css` 三主题 `--nv-text-muted` 对比度均低于 AA（4.5:1）**
  现象（小字说明/占位/链接大量使用 `nv-text-muted`）：
  - 暗色 `:111 #75736B` on `#0E1424` ≈ **3.9:1**（Round 7 已知，仍低于 AA）。
  - 浅色 `:282 #9A9DA6` on `#EEF0F4` ≈ **2.4:1**（**Round 7 漏检**：浅色下比暗色更差）。
  - 苍青 `html.azure :1173 #5A6F6C` on `#04090C` ≈ **3.7:1**（**Round 7 漏检**：第三主题）。
  严重度 P2（占位/禁用文字 WCAG 1.4.3 要求 ≥4.5:1）。建议：muted 提亮（暗色≈`#8A8880`、浅色≈`#6B6E78`、苍青≈`#7C918D`），或说明文字改用 `text-tertiary`（暗色 5.2:1）。
- **P2-4 `src/components/ui/Modal.tsx:91-94` + `use-focus-trap.ts:75` ESC 双重监听**
  现象：Modal 自身在 bubble 阶段 `addEventListener("keydown")` 关闭，同时 `useFocusTrap` 在**捕获阶段**又处理 ESC 调 `onClose` —— 同一次按键 `onClose` 可能被触发两次。当前多为幂等 `setState(false)` 无碍，但若 `onClose` 含副作用（埋点/异步）会双发。严重度 P2（冗余、潜在副作用）。建议：移除 Modal 自身 ESC 监听，统一由 `useFocusTrap` 处理。

## 三、对比度 / 焦点 / 移动端 总览

| 维度 | 暗色 | 浅色 | 苍青 |
|---|---|---|---|
| `--nv-text-muted` 对比度 | 3.9:1 ✗ | **2.4:1 ✗** | **3.7:1 ✗** |
| Modal 体系 aria 名称 | ✓ 闭合 | ✓ | ✓ |
| 非 Modal 弹层(confirm/prompt/命令面板) aria | ✗ P1 | ✗ P1 | ✗ P1 |
| 移动端抽屉焦点陷阱 | — | — | ✗ P2 |

## 四、Top 问题速览

| 严重度 | 位置 | 现象 |
|---|---|---|
| P1 | toast.tsx:206 / :251 | Confirm/Prompt 对话框无 role/aria-modal/焦点陷阱（WCAG 4.1.2 缺口） |
| P1 | CommandPalette.tsx:132 | 命令面板无对话框语义、ESC 仅输入框聚焦生效、无焦点陷阱 |
| P2 | globals.css:111/282/1173 | 三主题 `--nv-text-muted` 2.4~3.9:1 均低于 AA（浅色/苍青为 R7 漏检） |
