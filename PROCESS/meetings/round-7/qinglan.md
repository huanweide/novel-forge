# Round 7 L1 只读诊断 · 清览（前端体验 / 无障碍透镜）

> 日期：2026-08-04 ｜ 只读复验 + 挖新坑 ｜ 严禁改源码/CHANGELOG/MEMORY

## 一、Round 6 复验结论

Round 6 清览透镜修复**生效**：

- `src/components/ui/Modal.tsx:111-134` —— `dialogLabelledBy`/`dialogAriaLabel` 逻辑落实，`role="dialog"` 已带 `aria-modal` 及可访问名称派生；bare 弹窗 `max-h-[90vh] overflow-y-auto` 固化（line 119）。
- 9 个命名调用点全部补 `ariaLabel`，语义名正确：
  - BackupDialog.tsx:59 `导出备份包`、ImportDialog.tsx:69 `导入备份包`、ExportDialog.tsx:95 `导出小说`、MemoryDecayDialog.tsx:92 `记忆衰减`、CharacterDialog.tsx:240（编辑/新建分态）、LorebookEditDialog.tsx:83、DrawCards.tsx:169、OutlineDialog.tsx:52、StyleEditor.tsx:331 `文风与质量控制`。
  - WCAG 4.1.2「裸弹窗无名称」缺口在以上 9 点已灭。

## 二、新坑（P0 / P1 / P2）

### P1（明显缺陷，读屏体验缺口）

- **P1-1 `src/components/editor/StyleEditor.tsx:311,319`** —— loading / loadError 两个 bare 弹窗**仍无 `ariaLabel`/`labelledBy`**，读屏仅报「对话框」。现象：Round 6 只加固了主弹窗（line 331），漏了 2 个状态弹窗。严重度 P1。建议：补 `ariaLabel="加载中"` / `ariaLabel="文风加载失败"`。
- **P1-2 `src/components/workspace/DialogUI.tsx` 派生 + 其余裸弹窗（约 15 处）** —— 全仓 36 处 `<Modal>`，除 Round 6 的 9 处外，仍有大量 bare 弹窗用可见 `<h2>` 标题但**未用 `labelledBy` 关联**（`page.tsx:359` 更新公告、`ImportWizard.tsx:548` 导入、`AutomationSettingsDialog.tsx:83`、`BuildConfigDialog.tsx:62`、`ProjectConfigPanel.tsx:188`、`PreGenConfirm.tsx:80`、`ExpandResultModal.tsx:64`、`ToolboxDialog.tsx:28`、`ShortcutProvider.tsx:165`、`SettingsImporter.tsx:109` 等）。现象：可见标题与 `role=dialog` 无程序关联，读屏跳过标题直接报「对话框」。严重度 P1（WCAG 4.1.2 残留）。建议：弹窗内 `<h2 id={titleId}>` 后把 `titleId` 经 `labelledBy` 传入 Modal，或加 `ariaLabel`；可统一由 Modal 支持 `header` 字符串自动作 label（现状 header 字符串分支已支持，但 JSX 头部不支持）。

### P2（排期 / 对比度）

- **P2-1 `src/app/globals.css:111` `--nv-text-muted: #75736B`** —— 暗色底 `#0E1424` 上对比度约 3.6:1，仅达 AA「大字/占位」。但全局 323 处 `nv-text-muted` 大量用于小字说明、列表标签、链接（`changelog/page.tsx`、`dissect/*` 等），小字正文低于 AA 4.5:1。严重度 P2。建议：将 muted 提亮至 ≈`#8A8880`（≈4.6:1），或把说明文字改用 `text-tertiary`（5.2:1）。
- **P2-2 `src/app/globals.css:403` + `use-focus-trap.ts`** —— `button:focus-visible` 有 ring；但自定义关闭按钮（`Modal.tsx:153-159` 等）依赖该规则，未显式 `focus-visible` 类，焦点可见性依赖全局 button 规则。经核对全局 `button:focus-visible`（line 403）覆盖，焦点环存在；仅记录，无动作项。

## 三、Grep 其他 Dialog/Modal 用法结论

- 全仓弹窗已统一收敛到 `src/components/ui/Modal.tsx`，**未发现散落 `fixed inset-0` 手写遮罩或残留 `DialogOverlay`**，DialogUI.tsx:9-15 注释与实现一致。
- 非 Modal 路径的 `<dialog>` / 原生 `alert()` 未发现。

## 四、Top 问题速览

| 严重度 | 位置 | 现象 |
|---|---|---|
| P1 | StyleEditor.tsx:311,319 | loading/error 裸弹窗无 aria 名称 |
| P1 | 约 15 处裸弹窗（ImportWizard:548 等） | 可见 h2 未用 labelledBy 关联 dialog |
| P2 | globals.css:111 | --nv-text-muted 3.6:1 小字低于 AA |
