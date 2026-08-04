# 清览 · Round 6 L1 只读诊断报告

> 视角：UI 布局 / 无障碍(a11y) / 实体高亮 / 响应式 / 对比度 / 键盘可达 / 弹窗体验
> 性质：只读复验 + 新坑挖掘（未改动任何源码）

---

## 一、Round 5 修复复验结论

| # | 修复项 | 复验结果 | 证据 |
|---|--------|---------|------|
| 1 | `Modal` bare 分支默认 `max-h-[90vh] overflow-y-auto` | ✅ 生效 | `Modal.tsx:98-100` bare 分支已加 `max-h-[90vh] overflow-y-auto animate-spring` |
| 2 | 四个 Dialog 补 `max-h + overflow-y-auto` | ✅ 生效 | `BackupDialog.tsx:59`、`ImportDialog.tsx:69`、`MemoryDecayDialog.tsx:92`、`ExportDialog.tsx:95` 均带 `overflow-y-auto` |
| 3 | `select option` 背景暗 `#161E34`/亮 `#fff`，亮主题用 `:root.light` 覆盖 | ✅ 双主题可读 | `globals.css:1268-1280`；`ThemeToggle.tsx:23-25` 确认主题类挂到 `<html>`（即 `:root`），选择器匹配正确 |
| 4 | 网格 `grid-cols-1 min-[360px]:grid-cols-2` + 卡根 `min-w-0 overflow-hidden` + 标题 `truncate` | ✅ 生效 | `WorldEntryList.tsx:34`、`WorldEntryCard.tsx:16,19` |

**bare 加固对其他弹窗的影响**：
- 对“无内部滚动区”的短弹窗（`ShortcutProvider.tsx:165` 快捷键速查、`game/[nodeId]/page.tsx:397` 教程、`tables/page.tsx:352` 建表、`StyleEditor` 小窗、`page.tsx:359` 公告）——**正面**：此前 bare 不带滚动，长内容会溢出；现在基类兜底 `overflow-y-auto`，反而修复了这几个遗漏点。
- 对 `flex flex-col overflow-hidden` 弹窗（`CharacterDialog.tsx:240`、`ExpandResultModal.tsx:64`、`OutlineDialog`、`PreGenConfirm`、`ImportWizard`、`DrawCards`、`SettingsImporter`、`AutomationSettingsDialog`）——见下方 P2（存在规则冲突但当前未炸）。

**select 背景**：暗色 `--nv-abyss=#161E34`（深色底 + 近白字 `#F8F7F2`）对比充足；亮色覆盖 `#fff` + `#1A1C22` 同样清晰；苍青 `html.azure` 无单独覆盖，但 `--nv-abyss=#081218` + 浅字也可读。✅

**truncate 是否截断关键文字**：标题单行省略属合理取舍（条目关键语义在 `content` 的 `line-clamp-3` 与关键词徽标中仍可见），但长标题被裁且无悬浮完整文本（见 P2）。

---

## 二、新坑（按严重度）

### P1

**P1-1 · 所有 bare 弹窗缺少可访问名称（WCAG 4.1.2）**
- 文件/行号：`src/components/ui/Modal.tsx:110-112`（影响全部 `bare` 弹窗：`BackupDialog`/`ImportDialog`/`MemoryDecayDialog`/`ExportDialog`/`CharacterDialog`/`StyleEditor`/`LorebookEditDialog`/`DrawCards` 等）
- 现象：`role="dialog"` 的面板 `aria-label={title ?? (header 为字符串 ? header : undefined)}`，而 bare 弹窗既不传 `title` 也不传 `header` 字符串 → `aria-label` 为 `undefined`。屏幕阅读器仅播报“对话框”而无标题；内部虽有 `<h3>`，但未用 `aria-labelledby` 关联。
- 建议：给 `Modal` 增加 `ariaLabelledby` prop，由各 bare 弹窗把标题 `<h3 id=...>` 的 id 传入并在面板设 `aria-labelledby`；或统一用 `header` 插槽并把该节点 id 回填。

### P2

**P2-1 · bare 基类 `overflow-y-auto` 与 `flex flex-col overflow-hidden` 弹窗的 overflow 规则冲突**
- 文件/行号：`src/components/ui/Modal.tsx:99` + `CharacterDialog.tsx:240`、`ExpandResultModal.tsx:64`、`OutlineDialog.tsx:52`、`PreGenConfirm.tsx:80`、`ImportWizard.tsx:518`、`DrawCards.tsx:169`、`SettingsImporter.tsx:109`、`AutomationSettingsDialog.tsx:83`
- 现象：面板同时出现 `overflow-hidden`（x/y 均 hidden）与基类 `overflow-y-auto`（y auto）。二者均为单类选择器，**最终滚动行为取决于 Tailwind 编译顺序**，而非类名字符串顺序，十分脆弱。当前这些弹窗均有内部 `flex-1 overflow-y-auto` 滚动区（如 `CharacterDialog.tsx:284`），故暂未裁切；但若编译顺序翻转使 `overflow-hidden` 命中 y 轴，长表单头部会被锁死、内容不可滚。
- 建议：统一策略——要么基类 bare 不再强加 `overflow-y-auto`（仅保留给短弹窗），要么这些弹窗改用 `overflow-y-hidden`/`overflow-x-hidden` 精确声明，避免与基类 `overflow-y-auto` 互斥。

**P2-2 · 双 `max-h` 工具类冗余冲突**
- 文件/行号：`ExportDialog.tsx:95`(`max-h-[85vh]`)、`StorylineList.tsx:179`(`max-h-[85vh]`)、`MemoryDecayDialog.tsx:92`(`max-h-[88vh]`)、`BackupDialog.tsx:59`/`ImportDialog.tsx:69`(`max-h-[88vh]`) 等 + 基类 `Modal.tsx:99`(`max-h-[90vh]`)
- 现象：同一面板出现两个 `max-h-[Xvh]`，实际生效高度依赖编译顺序（字符串末尾不一定胜出）。例如 `ExportDialog` 期望 85vh，但基类 90vh 可能覆盖。
- 建议：删除各弹窗 `panelClassName` 中与基类重复的 `max-h`（保留差异化的即可），或基类不预设 max-h、交由调用方声明。

**P2-3 · `WorldEntryCard` 标题 truncate 截断后无完整文本可达**
- 文件/行号：`src/components/workspace/WorldEntryCard.tsx:19`
- 现象：标题 `truncate` 在窄网格（`<360px` 单列 / `min-[360px]` 双列约 170px 宽）下被省略，且无 `title` 悬浮提示，键盘/读屏用户无法获知完整标题。
- 建议：为标题 `<span>` 加 `title={entry.title}`（原生 tooltip），或在卡片根加 `title`。

**P2-4 · `--nv-text-muted` 暗色对比度低于 WCAG AA**
- 文件/行号：`src/app/globals.css:111`（`--nv-text-muted: #75736B`，注释自称约 3.6:1）
- 现象：在 `#0E1424` 底色上对常规文字仅约 3.6:1，低于 WCAG AA 要求的 4.5:1；该色被广泛用于提示语、占位、禁用文字（如导出/导入说明、`text-muted` 多处）。
- 建议：将 `--nv-text-muted` 提亮至约 `#8A887E`（≈4.5:1+），或仅将其用于纯装饰、真正占位改用 `--nv-text-tertiary`。

**P2-5 · 版本历史抽屉移动端双栏拥挤**
- 文件/行号：`src/components/workspace/CenterPanel.tsx:416-430`（面板 `w-[760px] max-w-[94vw]`；左列 `w-56`=224px + 右侧预览）
- 现象：在 <360px 视口，`94vw≈338px`，减去 224px 列表后预览区仅约 110px，几乎不可用；两栏未做移动端堆叠。
- 建议：移动端（`max-[640px]`）将左列表改为顶部折叠/抽屉或改为上下堆叠（`flex-col`），释放预览宽度。

---

## 三、小结
- Round 5 四类修复**全部生效**，且 bare 基类加固额外补住了若干此前遗漏的短弹窗溢出点。
- 本轮最值得修的是 **P1-1（bare 弹窗缺 accessible name，全量 a11y 缺口）**；其次为 P2 的 overflow 规则冲突（编译顺序脆弱）与 `max-h` 冗余。
- 未发现会“硬裁切”长内容的现网 bug（各长表单弹窗均已有内部滚动区兜底）。
