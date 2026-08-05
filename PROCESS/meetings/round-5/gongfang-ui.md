# 工坊（设置页 / 项目配置 / 功能开关 / 自动化设置）— Round-5 深度体验诊断报告

- 透镜：设置页交互与功能开关体验 · 卡片/按钮/折叠/主色一致性
- 铁律：只读诊断，未修改任何业务源码（`src/**`）、测试、配置。每条发现均带 文件:行号 证据。
- 对照基线：`yunix-reference-analysis.md`（云笔 / aixiaoshuojia.cn）功能布局参照。
- 说明：本文件为「工坊」UI 透镜交付物。同目录 `gongfang.md` 已被「工坊-2」工程整洁度透镜占用，为避免覆盖队友成果，本报告单独落盘于 `gongfang-ui.md`。

---

## 一、云笔（yunix）参照基线回顾

云笔作为功能设置领域的成熟范式，其五大风格锚点如下：

1. **功能开关卡片** = 图标 + 标题 + 描述 + 右侧 Toggle，整张卡片可点，视觉单元统一。
2. **底部三按钮** = 重置默认 / 取消 / 保存设置，提供「回退 + 放弃 + 提交」完整操作安全感。
3. **开关右对齐** = Toggle 永远落在卡片最右，左文右控，扫读动线一致。
4. **分组折叠** = 设置项按主题分组（如「模型」「记忆」「自动化」），组头可折叠，长页面不压迫。
5. **紫色主色调** = 主色 `#7C3AED`，开关、激活态、主按钮统一收敛到紫色，品牌辨识度强。

---

## 二、novel-forge 设置页逐项体检

### 2.1 卡片风格一致性 —— 不统一（中等偏差）

设置页（`src/app/settings/page.tsx`）采用 `surface-elevated rounded-2xl` 容器 + 编号小标签（「0. 外观」「1. 选择 LLM 提供商」…「7. Agent 助手·墨灵」）承载各 section，但**全程无图标**，且 section 之间是平铺编号列表，并非云笔式「图标 + 标题 + 描述 + 右侧操作」的统一卡片。

更明显的不一致在「选择 LLM 提供商」：它用的是**按钮列表**（每个 provider 是一个可点按钮，激活态 `bg-[var(--nv-primary)]/[0.08]`），而非图标卡。这与同页其它「说明文字 + 控件」式 section 在视觉语言上割裂。

三个弹窗（`ProjectConfigPanel` / `AutomationSettingsDialog` / `BuildConfigDialog` / `MemoryDecayDialog`）则统一走 `Modal` 的 `bare` 形态，内部用 `surface-elevated rounded-xl` 的 `Section`，与设置页的 `rounded-2xl` 圆角也不完全一致（2xl vs xl）。`BuildConfigDialog.tsx:160-167` 的 `Section` 与 `settings/page.tsx` 的 section 是**两套近似但分叉的容器实现**，且全局并无共享 `ui/card.tsx`（Glob 验证 0 文件，见工坊-2 报告 P2-6）。

### 2.2 开关（Toggle）右对齐与统一性 —— 右对齐基本符合，但**同产品双色、多套实现**

右对齐本身基本达标：
- 设置页 Agent 开关：`settings/page.tsx:513` `flex items-center justify-between`，开关在右。
- `AutomationSettingsDialog.tsx:100 / 123` `flex items-center justify-between`，开关在右。
- `BuildConfigDialog.tsx:180` 局部 `Toggle` 也是 `justify-between`，右对齐。

但**统一性严重缺失**，且已存在「官方答案」却未采用：
- 项目已有统一 `Switch` 组件（`src/components/ui/switch.tsx`），文件头注释明确写着「云笔式右对齐 Toggle，配色收敛到 `--nv-primary`」，全库目前仅 `ChapterConfirmBar.tsx:293` 一处使用。
- 设置页 Agent 开关（`settings/page.tsx:507-528`）是**自定义绿色按钮式**：开启态用 `--nv-success`（翠绿），关闭态 `--nv-surface-3`。
- `AutomationSettingsDialog.tsx:105-109 / 128-132` 是 **peer-sr-only 内联药丸**，开启态用 `--nv-primary`（靛蓝）。
- `BuildConfigDialog.tsx:178-194` 局部 `Toggle`，开启态 `--nv-primary`（靛蓝）。
- `ProjectConfigPanel.tsx` 的 on/off（如 `forceOriginalNames`/`autoGenerateStoryline`）在另一入口用**方形 Checkbox**（`BuildConfigPanel.tsx:264-275`，工坊-2 P0-1/P1-4 已详述）。

结论：**同一产品里开关至少 3 套内联实现 + 1 套方块 Checkbox**，且颜色在「绿（设置页）/ 靛蓝（弹窗）」之间摆动，与云笔「开关统一右对齐、单一主色」直接冲突。

### 2.3 底部按钮位置与三按钮 —— 不符合（明显偏差）

云笔要求「重置默认 / 取消 / 保存设置」三按钮。实测：
- 设置页（`settings/page.tsx:533-558`）：**仅一个** `btn-primary`「保存设置」，无「重置默认」、无「取消」。长表单只有单一提交，误操作无回退入口。
- `AutomationSettingsDialog.tsx:147-152`：底部 `ghost 取消` + 默认 `保存配置` 两按钮，无「重置默认」。
- `BuildConfigDialog.tsx:149-154`：底部 `btn-ghost 取消` + `btn-primary 保存并同步` 两按钮，无「重置默认」。
- `ProjectConfigPanel.tsx`：每个分区各有独立保存按钮（保存规则 / 保存 LLM 配置），无统一底部三按钮。

整体：**缺「重置默认」、设置页甚至缺「取消」**，与云笔三按钮范式不符，长表单的操作安全感与可预期性偏低。

### 2.4 说明文字长度 —— 部分偏长（轻微偏差）

多数描述控制得当，但存在几处较长说明：
- 记忆衰减（`settings/page.tsx:474-493`）：一段概念说明 + 四级列表 + 一段执行方式说明，信息量大；虽已分段，但在单卡片内密度偏高，更适合「折叠展开详情」。
- 自动化填表总开关描述（`AutomationSettingsDialog.tsx:103`）与频率说明（`:119`）、上下文楼层说明（`:141`）均为长句，占据整行宽度。
- 建议：超两行的描述默认收起为「详情」折叠，或拆为标题 + 一行副文，降低首屏认知负荷。

### 2.5 折叠 / 分组 —— 几乎缺失（中等偏差）

- 设置页 0~7 共 8 个 section **全部平铺展开**，无分组、无折叠。
- `BuildConfigDialog.tsx` 有「基础信息 / 风格与设定 / 流派标签 / 生成选项」分组，但分组**不可折叠**，仅是静态 Section。
- 全局无 `ui/collapse.tsx` / `ui/accordion.tsx`（Glob 验证 0 文件）。长设置页在窄屏/笔记本上需要大量滚动，缺少「按主题折叠」的能力，与云笔「分组折叠」锚点差距明显。

### 2.6 主色调（紫色 vs 靛蓝）—— 偏离（产品级偏差）

- 云笔主色 `#7C3AED`（紫）。novel-forge 主色令牌（`globals.css:92`）：`--nv-primary: oklch(0.66 0.19 270)` —— 这是**靛蓝（indigo）**，并非紫色。
- 主题仅有 `ThemeToggle.tsx` 的「夜航 / 白昼 / 苍青」三套，**无任何紫色主题**选项。
- 叠加 2.2 的「绿/靛蓝双色开关」，产品在开关色上还进一步发散，品牌色收敛度低于云笔。

---

## 三、与云笔逐条对照表

| 云笔锚点 | novel-forge 现状 | 差距 |
|---|---|---|
| 图标+标题+描述+右 Toggle 卡片 | 设置页为编号 section + 说明，无图标；提供商用按钮列表 | 大 |
| 底部三按钮（重置默认/取消/保存） | 多为 取消+保存 两按钮；设置页仅单 保存 | 大 |
| 开关右对齐 | 各处置右对齐 | 符合 |
| 分组折叠 | 几乎无折叠；分组不可收起 | 中 |
| 紫色主色 | 靛蓝 `--nv-primary`，无紫色主题；开关还出现绿色 | 大 |

---

## 四、改进建议（标注严重程度）

**P0（高杠杆，强烈建议本轮修）**
- **P0-1 关闭「绿/靛蓝双色开关」**：设置页 Agent 开关（`settings/page.tsx:507-528`）用 `--nv-success` 绿做 on/off，与弹窗 `--nv-primary` 靛蓝冲突，且绿色语义偏向「成功/正常」易误导。统一改为 `--nv-primary`，与 `switch.tsx` 一致。
- **P0-2 落地统一 `Switch` 组件**：`src/components/ui/switch.tsx` 已存在且明确对标云笔，但设置页与三个弹窗均自建内联 toggle。将 `settings/page.tsx`、`AutomationSettingsDialog.tsx`、`BuildConfigDialog.tsx`、`ProjectConfigPanel` 的开关全量替换为 `Switch`，消除 3+ 套实现与双色问题（与工坊-2 P1-1~P1-4 互补，我侧重 UI 一致性收益）。

**P1（应修，体验与范式对齐）**
- **P1-1 补全底部三按钮**：设置页增设「重置默认 / 取消 / 保存设置」；各弹窗至少补齐「重置默认」形成统一 `ModalFooter`（Modal 已支持 `footer` 插槽）。提升长表单操作安全感。
- **P1-2 统一卡片风格 + 引入图标**：设置页 section 改为「图标 + 标题 + 描述 + 右侧操作」统一卡片（呼应云笔），提供商铺列表也收敛为图标卡；抽取共享 `ui/card.tsx`，消除 `rounded-2xl` / `rounded-xl` 圆角分叉。
- **P1-3 增加分组折叠基建**：新增 `ui/collapse.tsx` / `ui/accordion.tsx`，让设置页 0~7 可按主题折叠、`BuildConfigDialog` 分组可收起，缓解长页面滚动压力。
- **P1-4 合并重复设置入口**：`forceOriginalNames` / `autoGenerateStoryline` 在 `BuildConfigDialog` 与 `BuildConfigPanel` 双入口、标签/惯用语不一致（工坊-2 P0-1），需合并数据源与文案，杜绝写分叉。

**P2（建议评估，非阻断）**
- **P2-1 评估引入紫色主题或收敛品牌色**：当前靛蓝与云笔紫色偏差为产品级决策；若要对标云笔观感，可在 `ThemeToggle` 增加紫色主题，或确认靛蓝为既定品牌并固化。
- **P2-2 精简过长说明**：记忆衰减、自动化填表等超两行描述改为默认折叠「详情」，或拆为「标题 + 一行副文」。
- **P2-3 设置页保留「取消/还原」**：即便不引入三按钮，至少提供「放弃未保存修改」入口，避免单一保存按钮的误操作风险。

---

## 五、结语

novel-forge 在「开关右对齐」这一单点上已贴合云笔；但「统一卡片、底部三按钮、分组折叠、紫色主色」四项均存在可量化差距，核心症结是**已有统一 `Switch` 基建却未采纳、缺乏共享 Card/Collapse 组件、且设置页与弹窗各自演化出多套视觉方言**。建议以 P0-2（落地 `Switch`）+ P0-1（消除双色）为最高杠杆，一次性把「功能开关」这条交互线收口到云笔范式，再逐步补齐三按钮与折叠分组。
