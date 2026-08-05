# 工坊-2（工程整洁度 / 组件与工具去重 / 设计令牌一致性 / Switch adoption / emoji 残留）— Round-5 只读诊断报告

- HEAD: v1.1.1（commit fd7f953，2026-08-06）
- 技术栈：Next.js 16 + React 19 + Tailwind v4 + Prisma 7 + PostgreSQL 17
- 透镜：工程整洁度 · 组件/工具去重 · 设计令牌一致性 · Switch 落地完整性 · emoji 残留
- 铁律：只读诊断，未修改任何代码/测试/changelog/配置。每条发现均带 文件:行号 证据。
- 说明：本文件覆盖上一轮（Round-3 数据迁移透镜）报告，本轮为工程/工具透镜重做。

---

## 一、现状扫描

### 1.1 统一 `Switch` 的采用率极低
- `src/components/ui/switch.tsx` 是 v1.1.1 新增的可复用 iOS 风格药丸开关（role=switch，收敛到 `--nv-primary`/`--nv-surface-3`，支持 sm/md + label）。
- 全库仅 **1 处** 引用：`src/components/workspace/ChapterConfirmBar.tsx:16`（import）+ `:293`（用于 `autoDeliver` 开关，作为唯一正确范式）。
- 其余所有「开启/关闭」语义的 UI 仍用各自内联实现，未收敛到 `Switch`。

### 1.2 现存开关/勾选实现清单（共 4 类惯用语 + 原生 checkbox）
| 实现 | 位置 | 用途 |
|---|---|---|
| 原生 `<input type=checkbox>` | 18 处 / 13 文件（见 1.3） | 多选 + 部分 on/off |
| peer-sr-only 药丸 toggle | `AutomationSettingsDialog.tsx:105-109,128-132`（2 个） | 设置开关 |
| 局部 `Toggle` 组件 | `BuildConfigDialog.tsx:178`（定义）+ :144-145（2 用） | 生成设置开关 |
| 局部方形 `Checkbox` 组件 | `BuildConfigPanel.tsx:432`（定义） | 把 on/off 设置画成方形勾选框（语义错误） |
| 统一 `Switch` | 仅 `ChapterConfirmBar.tsx:293` | 正确范式 |

> 结论：同一产品里存在 **3 套内联 toggle 实现 + 1 套方块 Checkbox 用于开关**，与「风格统一 / 开关右对齐」的 yunix 基准直接冲突。

### 1.3 原生 checkbox 全量清单（18 处）
- `DissectUpload.tsx:216`（accent `:219`）
- `ImitationPanel.tsx:283`（accent `:242`）
- `ImportWizard.tsx:612 / 897 / 954 / 1024`（accent `:615/:904/:961/:1031`，其中 `:961` 用 `accent-pink-600`、`:1031` 用 `accent-success` 非令牌色）
- `BuildConfigPanel.tsx:446`（sr-only，属内部 `Checkbox`）
- `BackupDialog.tsx:77`（accent `:80`）
- `AutomationSettingsDialog.tsx:106 / 129`（peer sr-only）
- `CharacterRow.tsx:28`（accent `:32`）
- `ExportDialog.tsx:160 / 175`（accent `:163/:175`）
- `ImportDialog.tsx:87`（accent `:90`）
- `LorebookEditDialog.tsx:141`
- `OutlineDialog.tsx:97`（accent `:97`）
- `OutlineTree.tsx:38`（accent `:40`）
- `PreGenConfirm.tsx:136`（accent `:136`）

### 1.4 设计令牌
- `globals.css` 已定义完整 `--nv-*` 体系（`--nv-primary/secondary/success/danger/warning/info/accent/creative` + surface/border/text 层级），并在 `@theme inline` 映射 `success/danger/warning/info` 等语义色——体系良好。
- 但仍有散落硬编码色：UI 中 `rgba(99,102,241,…)` 靛蓝辉光（非 `--nv-primary` 令牌）、以及 `accent-pink-600` / `accent-success` 等非 `--nv-*` 令牌 accent。

### 1.5 emoji 残留
- `src/components/ui/icons.tsx` 已建立 Lucide 图标注册表（含 rocket/brain/mountain/swords/heart/ban/sliders 等），并在文件头明令「UI 图标必须来自此组件，禁止直接用 emoji」。
- 但 StyleEditor / ImportWizard / Dissect* / ContextPreview / SettingsImporter / tool-registry / ChapterConfirmBar toast 仍大量直接用 emoji。
- **协议层 emoji 不动**：`orchestrator.ts` / `engine.ts` / `builtin-presets.ts` / 状态检测串（`startsWith("✅")`）内 emoji 属「发给 LLM 的提示词 / 前后端契约」，按 `changelog-data.ts:2881` 约定保持现状，不计入本清单。

### 1.6 工具函数 / 共享组件
- `cn` 单一来源（`src/lib/utils.ts:4`），无重复——良好。
- `extractChapterNumber` 在两处重复实现（`memory-decay.ts:287` 与 `memory-classifier.ts:180`，同正则 `第(\d+)章`、仅入参不同）。
- `core/llm/client.ts` 仍保留若干 `@deprecated` 旧导出（见 `changelog-data.ts:2290`，因引用方暂留）。
- **无** 共享 `ui/checkbox.tsx` / `ui/toggle.tsx` / `ui/card.tsx` / `ui/collapse.tsx` / `ui/accordion.tsx`（Glob 验证 0 文件）。卡片容器（`surface-elevated rounded-xl p-4`）与折叠面板均为内联重复，未呼应 yunix「卡片统一 / 折叠面板」风格点。

---

## 二、问题清单

### P0

**P0-1 — 同一组项目设置双入口且视觉/标签不一致（功能集成 + 风格统一双重违例）**
- 证据：
  - `BuildConfigDialog.tsx:144-145`（workspace 项目配置弹窗）用局部 `Toggle` 呈现 `forceOriginalNames`（标签「强制原创人名」）、`autoGenerateStoryline`。
  - `BuildConfigPanel.tsx:264-275`（explore 拆书建项目面板）用局部方形 `Checkbox` 呈现同一对字段，但标签写作「强制原创命名」「自动生成故事线」，惯用语为方形勾选框（非 iOS 药丸 toggle）。
  - 两处均引用同一 `BuildConfig` 类型（`src/core/explore/types`），即同一业务开关。
- 问题：① 同一设置两个入口，存在写分叉/标签漂移风险；② 惯用语冲突（pill vs 方块），违反 yunix「开关右对齐 / iOS Toggle」；③ 标签不一致（人名/命名）。
- 统一建议：保留单一入口（建议并入 `BuildConfigDialog` 作为项目配置唯一面），`BuildConfigPanel` 复用同一数据源；两处统一改用 `Switch`、统一标签文案；若两面板确实服务于「新建项目 vs 既有项目」不同流程，至少共享同一 `Switch` 组件与文案常量，杜绝视觉/语义分叉。

### P1

**P1-1 — 三套内联 toggle 实现未收敛到统一 `Switch`**
- 证据：`BuildConfigDialog.tsx:178` 局部 `Toggle`；`AutomationSettingsDialog.tsx:107-108,130-131` peer-sr-only 药丸；`BuildConfigPanel.tsx:432` 方形 `Checkbox`。三者皆为「on/off + 右侧药丸/方块」的同类交互。
- 统一建议：删除三处内联实现，全部替换为 `src/components/ui/switch.tsx`（参考 `ChapterConfirmBar.tsx:293` 用法）。

**P1-2 — `AutomationSettingsDialog` 两个设置开关必须改 `Switch`**
- 证据：`AutomationSettingsDialog.tsx:106`（`autoFillEnabled`）、`:129`（`skipLatestChapter`）均为 `peer sr-only` 自定义药丸。
- 统一建议：替换为 `<Switch checked={…} onCheckedChange={…} label="…" />`，删除 `peer` 双 div。

**P1-3 — `BuildConfigDialog` 两个生成开关改 `Switch`**
- 证据：`BuildConfigDialog.tsx:144-145` 调局部 `Toggle`。
- 统一建议：改 `Switch` 并随 P0-1 与 `BuildConfigPanel` 合并数据源。

**P1-4 — `BuildConfigPanel` 用方块 Checkbox 呈现 on/off 设置（语义错误）**
- 证据：`BuildConfigPanel.tsx:264-275` 把 `forceOriginalNames`/`autoGenerateStoryline` 画成方形勾选框。
- 问题：布尔「开关」用 checkbox 惯用语，违背 yunix「iOS Toggle 右对齐」；且与 P0-1 同字段在另一面板是药丸，风格割裂。
- 统一建议：改 `Switch`；与 P0-1 合并。

**P1-5 — UI emoji 残留应替换为 `Icon`（icons.tsx 映射已齐备）**
- 证据（均为用户可见 UI）：
  - `StyleEditor.tsx:35-46`（12 个维度 icon：📚📏🎨💬✨⚡🧠🏞️🗣️😄⚔️💋）；`:341-344`（tab：🎨🚫⚙️✨）；`:367-368`（预设 🏯⬜）；`:495`（🔍 扫描当前章节）；`:502`（✅ 全部通过 / ❌）；`:541`（❌⚠️ℹ️ 严重度）。
  - `ImportWizard.tsx:571-574`（🤖📖📋⚡）；`:276`（📎）；`:393/:395`（⚠️）；`:502/:737/:801/:808/:1163`（✅）；`:541/:1082`（🗑️）；`:1135`（👤📖📝）；`:729`（✏️）；`:188`（✅）。
  - `DissectDimensions.tsx:22/28/34/40/46`（📋🌍⚡👥🎒）、`:91`（📭）、`:361`（📦）；`DissectUpload.tsx:151`（📄）；`DissectAdaptPanel.tsx:168`（🎨）。
  - `ContextPreview.tsx:118-124`（🤖🧠📚📄📦📍✍️）、`:169/:172/:175`（✅/❌）。
  - `SettingsImporter.tsx:204`（✅ 大图标）。
  - `tool-registry.ts:237`（标签 `["🆕 Agent创建"]`）。
- 映射可行性（icons.tsx 已含）：📚→book、📏→ruler、🎨→palette、💬→message、✨→sparkles、⚡→zap、🧠→brain、🏞️→mountain、🗣️→messageCircle、😄→smile、⚔️→swords、💋→heart、🚫→ban、⚙️→sliders、🔍→search、✅→check、❌→x、⚠️→alert、ℹ️→info、🤖→bot、📖→book、📋→clipboard、📄→file、📦→package、📍→pin、✍️→pencil、🗑️→trash、👤→user、📝→file、🏯→building、⬜→（无直接，建议 square 或省略）、📭→inbox、📦→package、🎨→palette。
- 统一建议：上述 `icon` 字段 / 按钮文案改为 `Icon name="…"`，消灭 UI emoji。

### P2

**P2-1 — 硬编码辉光色未用令牌**
- 证据：`BuildConfigPanel.tsx:449` `shadow-[0_0_8px_rgba(99,102,241,0.3)]`；`changelog/page.tsx:43` `shadow-[0_0_8px_rgba(99,102,241,0.4)]`。
- 统一建议：改用 `--nv-primary` 带 alpha（如 `shadow-[0_0_8px_var(--nv-primary)]`）或在 `globals.css` 新增 `--nv-primary-glow` 令牌。

**P2-2 — 非令牌 accent 色**
- 证据：`ImportWizard.tsx:961` `accent-pink-600`（硬编码粉）、`:1031` `accent-success`（`success` 非本设计体系的 `--nv-*` 令牌名，应为 `--nv-success`）。
- 统一建议：统一为 `accent-[var(--nv-primary)]`（或 `accent-[var(--nv-success)]`）。

**P2-3 — 多选 checkbox 应收敛为共享 `Checkbox`，部分应改 `Switch`**
- 证据（语义为多选、保留 checkbox 但应抽共享组件）：`DissectUpload:216`、`ImitationPanel:283`、`ImportWizard:612/897/954/1024`、`BackupDialog:77`、`CharacterRow:28`、`ExportDialog:160`、`ImportDialog:87`、`OutlineTree:38`、`PreGenConfirm:136`。
- 证据（语义为 on/off、应改 `Switch`）：`ExportDialog:175`（`includeOutline`）、`OutlineDialog:97`（`appendMode`）、`LorebookEditDialog:141`（`enabled`）。
- 统一建议：新增 `src/components/ui/checkbox.tsx` 承载多选；on/off 三处改 `Switch`。

**P2-4 — `extractChapterNumber` 重复实现**
- 证据：`memory-decay.ts:287`（`(chapterTitle: string)`）与 `memory-classifier.ts:180`（`(s: ChapterSummary)`，内部 `s.chapterTitle?.match(/第(\d+)章/)`），同正则同语义。
- 统一建议：抽为 `src/lib/text.ts` 的 `extractChapterNumber(title: string)`，两处统一调用（`memory-classifier` 传 `s.chapterTitle`）。

**P2-5 — `@deprecated` 旧导出滞留**
- 证据：`core/llm/client.ts` 内 `getDefaultLLMConfig` / `getSiliconFlowClient` 等 `@deprecated` 导出（见 `changelog-data.ts:2290`，因仍有引用方暂留）。
- 统一建议：排期清理或加 eslint `@typescript-eslint/no-deprecated` 告警，降技术债。

**P2-6 — 缺共享 Card / Collapse / Accordion 组件**
- 证据：`Glob` 验证 `src/components/ui/{card,collapse,accordion}.tsx` 均不存在；卡片容器（`surface-elevated rounded-xl p-4`，如 `BuildConfigDialog.tsx:160-167` 的 `Section`）与折叠面板在多处内联重复。
- 统一建议：抽 `ui/card.tsx`（图标+标题+描述+右侧操作，呼应 yunix「卡片统一」）与 `ui/collapse.tsx`（可折叠分组，呼应 yunix「折叠面板」），作为统一基建。

**P2-7 — `ChapterConfirmBar` toast 仍含 🚀**
- 证据：`ChapterConfirmBar.tsx:150` `toastSuccess("整本确认完成 🚀 项目创作确认流程走通！")`；而按钮图标已改 `Icon name="rocket"`（`:309/:337`）。
- 统一建议：toast 文案去掉 🚀（或复用统一 toast 图标位），与按钮改造对齐。

---

## 三、工程优先级建议

1. **最高杠杆（先解决 P0-1 + P1-1~P1-4）**：把「布尔开关」这一个惯用语彻底统一——删除 `BuildConfigDialog.Toggle`、`AutomationSettingsDialog` peer 药丸、`BuildConfigPanel` 方形 Checkbox 三套内联实现，全量替换为 `src/components/ui/switch.tsx`；并合并 `forceOriginalNames`/`autoGenerateStoryline` 的双入口、统一标签。该动作同时修复「功能集成（合并重复实现）」「风格统一（开关右对齐/iOS Toggle）」两条规则，收益最高。
2. **次高（P1-5）**：UI emoji → `Icon` 替换。图标注册表已齐备、替换成本极低、收益高（消灭视觉噪声、对齐图标体系）。
3. **令牌一致性（P2-1/P2-2）**：硬编码 `rgba(99,102,241)` 与非令牌 `accent-*` 收敛到 `--nv-*`，杜绝主题切换时色偏。
4. **基建抽取（P2-3/P2-6）**：新增共享 `ui/checkbox.tsx`、`ui/card.tsx`、`ui/collapse.tsx`，消化内联重复，呼应 yunix 风格统一点。
5. **技术债（P2-4/P2-5/P2-7）**：收敛 `extractChapterNumber`、清理 `@deprecated`、补掉遗漏的 🚀 toast。

### 落地门槛（只读验证要点）
- 所有 Switch/Checkbox 替换属**纯视图层**，不改变既有交互与 Prisma 字段；门禁 = `tsc` 零错误 + 关键路径截图回归即可。
- P0-1 双入口合并前，需确认两面板写入同一 `BuildConfig` 字段（`forceOriginalNames`/`autoGenerateStoryline`），避免数据分叉；若确为「新建 vs 既有」不同流程，则至少共享组件与文案常量。
- emoji 替换仅限 UI 层；`orchestrator.ts`/`engine.ts` 等提示词/协议层 emoji 按既有契约不动。
