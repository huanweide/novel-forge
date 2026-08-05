# 清览 · MaxLoop Round-5 布局与视觉舒适度诊断报告

> 透镜：整体布局 / 视觉舒适度 / 三栏比例 / 间距 / 折叠舒适感 / 空状态 / 响应式
> 基准：PROCESS/meetings/round-5/yunix-reference-analysis.md（一、整体布局语言；三、风格统一点）+ 14 张云笔截图
> 版本：v1.1.1（commit fd7f953）
> 铁律：只读诊断，未改动任何代码/测试/changelog/配置。下文每条均带 文件:行号 / 类名 证据。v1.1.1 已统一的 Switch、ChapterConfirmBar 折叠改造不再重复列入。

---

## ① 布局现状

- **三栏结构**：`LeftPanel` 固定 `w-64`(256px) / `CenterPanel` `flex-1` / `RightPanel` 固定 `w-80`(320px)。证据：`LeftPanel.tsx:55`、`RightPanel.tsx:68`、`CenterPanel.tsx:198`(`<main className="flex-1 ...">`)。
- **配色/主题**：「虚空玻璃(Void Glass)」暗色体系为默认（body `color-scheme: dark`，`--nv-void #0E1424`）；轻主题 `.light` 背景为冷灰白 `#EEF0F4`，非暖色。主色 `--nv-primary oklch(0.66 0.19 270)`（靛蓝偏蓝），辅以绿(success)/金(accent)。证据：`globals.css`（`:root`/`.light` 令牌）、`settings/page.tsx:205,242`。
- **圆角**：设计令牌 `--radius = 0.625rem`(10px)，但卡片容器实际混用三档：`rounded-lg`(10px)、`rounded-xl`(14px)、`rounded-2xl`(18px)。证据见③。
- **折叠/默认态**：`ChapterConfirmBar` 全书交付区默认收起(`deliverOpen=false`，`ChapterConfirmBar.tsx:63`)；`RightPanel` 监测三面板默认折叠(`RightPanel.tsx:46` openSections 空)；中栏章纲默认收起(`CenterPanel.tsx:51`)。方向正确。
- **空状态**：已存在统一 `EmptyState`/`ErrorState` 组件库（带图标插画，`States.tsx`），但**工作区主空状态未复用**。证据：`States.tsx:18-44` vs `CenterPanel.tsx:437-443`。
- **响应式断点**：以 Tailwind `lg`(=1024px) 控制左/右抽屉开合。证据：`[projectId]/page.tsx:958`(`lg:static`)、`:929/:932/:1157`(`lg:hidden`)。

---

## ② 云笔对照（基于 yunix-reference-analysis.md）

| 维度 | 云笔（参考站） | novel-forge 现状 | 差距 |
|---|---|---|---|
| 配色 | 暖米白背景 + 紫(#7C3AED)主色 + 绿/紫状态色 | 暗色虚空玻璃 / 轻主题冷灰白；靛蓝主色 + 绿 + 金 | 背景暖度缺失；主色偏蓝（P1） |
| 圆角 | 大圆角卡片 8–16px | 10/14/18px 三档混用 | 不统一（P2） |
| 三栏 | 左项目树 / 中编辑器 / 右 AI 助手 | 同结构，比例 256 / flex / 320 | 基本一致（右栏略宽） |
| 卡片 | 图标+标题+描述+右侧操作 | 多数对话框已符合；设置页符合；世界卡缩略 | 接近（P2 网格拥挤） |
| 网格入口 | 2 列大按钮入口 | `ToolboxDialog` 2–3 列大按钮（**已符合**）；左栏世界网格 2 列过挤 | 部分（P2） |
| 折叠/空态 | 折叠分组；友好空态 | 折叠 OK；主空态裸文字 | 空态弱（P2） |

**已实现好的点（与云笔方向一致，建议保留）**：`ToolboxDialog` 三分类 2–3 列大按钮网格（`ToolboxDialog.tsx:54,59`）；`PostGenPanel` 5-Tab 内联分析面板（替代旧全屏弹窗）；`ChapterConfirmBar` 交付区默认收起 + 开关右对齐；统一 `EmptyState`/`ErrorState` 三件套；三栏比例结构。

---

## ③ 问题清单

### P0
无。未发现致命布局崩坏（三栏不会在常规桌面宽度崩坏；折叠默认态已正确）。

### P1
- **P1-1 背景暖度缺失**：默认暗色 + 轻主题冷灰白 `#EEF0F4`，与云笔「暖米白背景」差距显著。风格统一点 7「主题色收敛：以紫色为主色、橙绿为辅助」未覆盖背景暖度，但整体语言明确写「暖米白背景」。
  - 证据：`globals.css:255`（`.light` 背景 `--nv-void:#EEF0F4` 冷灰白）、`settings/page.tsx:242`（主题描述「夜航（暗色·默认）/ 白昼（浅色）/ 苍青（青绿深色）」——白昼仅称「浅色」，无暖相；苍青为青绿暗色，亦非暖）。
  - 影响：若要「风格统一」对齐云笔观感，当前轻主题无法还原暖米白氛围；默认暗色则与云笔明亮编辑页反差大。
  - 建议：在 `.light` 下把 `--nv-void/--nv-surface-1/2/3` 改为暖相（如 `#F7F4EF` 系、oklch 暖相），作为「云笔暖白」预设；或新增第四档「暖白」主题；暗色默认保留为品牌签名。

- **P1-2（核正备注·已满足，非缺陷）响应式断点实为 <1024px 收起，900–1024 拥挤带不存在**：代码以 Tailwind `lg`(=1024px) 切换——`[projectId]/page.tsx:958/1136` 的 `lg:static lg:w-64/lg:w-80` 仅在 **≥1024px** 时三栏内联；`<1024px` 时左/右栏为 `fixed ... -translate-x-full` 抽屉（`:956-959` / `:1134-1136`），由 `lg:hidden` 触发按钮（`:929/:932/:1157`）开合。
  - 核正结论：因此 **900–1024px 区间三栏并不内联**，而是抽屉态（中栏占满宽度），原担忧的「324px 拥挤带」并不存在；这反而比本轮「<900px 收起」的预期更激进、更友好，窄屏收起机制**已满足要求**。
  - 真实残留（保留为 P2-5）：次级工具栏 `:928`（`flex items-center gap-2` 无 `flex-wrap`），在 <360px 极窄屏，常驻的「项目设定/记忆衰减/项目配置」3 按钮 + 2 个抽屉切换会横向溢出。
  - 处置：无需下移断点；仅需给次级工具栏补 `flex-wrap` 或收进「更多▾」菜单（见 P2-5）。

### P2
- **P2-1 圆角不统一**：卡片容器三档混用。
  - `WorldEntryCard.tsx:18` `rounded-lg`(10px)
  - `PostGenPanel.tsx:181` `rounded-xl`(14px)；`ToolboxDialog.tsx:59`、`settings/page.tsx:261` 亦 `rounded-xl`
  - `ChapterConfirmBar.tsx:197` `rounded-2xl`(18px)；`[projectId]/page.tsx:1049` recall 面板 `rounded-2xl`；`States.tsx:33/89` 空/错态 `rounded-2xl`；`settings/page.tsx:223/238/417/445/473/502` `rounded-2xl`
  - 建议：统一**卡片容器**为 `rounded-xl`(14px，落入云笔 8–16 区间)；按钮/小元素保留 `rounded-lg`。

- **P2-2 中栏控制栏信息密度偏高**：`CenterPanel.tsx:202-321` 连续三行小字控件（标题状态行 + 世界时间输入行 + 章纲行 + 生成控制行），均为 `text-[10px]/text-xs` 按钮，首屏偏挤；章纲行常显「轻量章纲」「抽卡分镜」两个小按钮（`:272-274`）。
  - 建议：窄屏把章纲行「轻量章纲/抽卡分镜」收进章纲展开区；或默认折叠「生成控制」为「展开更多」。

- **P2-3 工作区主空状态裸文字（未复用 EmptyState）**：`CenterPanel.tsx:437-443`（未选章节）、`:397-401`（章节无内容）仅两段 `<p>` 文本，无图标/插画/快捷操作，与统一 `EmptyState`（带图标，`States.tsx:18-44`）不一致。
  - 建议：复用 `EmptyState`（`icon="book"`/`pencil`）并补充「生成大纲」快捷按钮，对齐云笔友好空态。

- **P2-4 左栏世界网格在 256px 窄栏内 2 列过挤**：`WorldEntryList.tsx:35` `min-[360px]:grid-cols-2`，但在 `w-64`(256px) 左栏内可用宽 ≈ 240px，每格 ≈ 112px；`WorldEntryCard` 内含标题+摘要(3行)+关键词+深度徽标，被严重压扁。
  - 对比：`ToolboxDialog.tsx:54` 在 `max-w-3xl` 宽容器用 `grid-cols-2 sm:grid-cols-3` 是正确的。
  - 建议：左栏世界网格默认/强制**单列**；2 列网格仅用于右侧宽容器或弹窗。

- **P2-5 次级工具栏行缺 `flex-wrap`**：`[projectId]/page.tsx:928` `<div className="px-4 py-2 border-b ... flex items-center gap-2">` 无 `flex-wrap`；内含 5 个按钮（大纲/侧栏 `lg:hidden`，项目设定/记忆衰减/项目配置**无** `lg:hidden`）。在极小屏(<360px) 五个按钮可能横向溢出。
  - 建议：加 `flex-wrap`，或将「项目设定/记忆衰减/项目配置」收进「更多▾」菜单（参考 `LeftPanel.tsx:64` 的更多菜单做法）。

- **P2-6 主色 hue 偏蓝**：`--nv-primary oklch(0.66 0.19 270)` 偏靛蓝；云笔紫 `#7C3AED` 更偏紫红（hue≈265 但更高彩/暖）。与风格统一点 7「以紫为主色」方向一致，但「紫」味不足。
  - 建议：微调 `--nv-primary` hue → ≈285–300 或提高彩度，使主色更明显地呈现紫，而非蓝紫。

---

## ④ 视觉统一建议（落地清单 · 风格统一）

1. **圆角令牌化**：`globals.css` 明确「卡片=rounded-xl(14px)，小元素=rounded-lg(10px)」约定，将 `WorldEntryCard`(lg→xl)、`ChapterConfirmBar`/`recall`(2xl→xl) 收敛，消除 P2-1。
2. **暖米白轻主题**：在 `.light` 下把 `--nv-void/--nv-surface-1/2/3` 改为暖相，作为「云笔暖白」预设；暗色默认保留为品牌签名（P1-1）。
3. **主色紫化**：`--nv-primary` hue 向紫收敛，呼应风格统一点 7（P2-6）。
4. **空状态组件化**：工作区主空态接入 `EmptyState` + 快捷动作（P2-3）。
5. **响应式收口（轻量）**：抽屉断点 `lg`(1024px) 已满足窄屏收起要求（900–1024 为抽屉态，无拥挤带，见 P1-2 核正）；仅需给次级工具栏（`[projectId]/page.tsx:928`）补 `flex-wrap` 或收进「更多▾」菜单（P2-5）。
6. **窄栏网格降级**：左栏世界网格强制单列，2 列网格仅用于宽容器（P2-4）。
7. **中栏密度减负**：章纲/生成相关次要操作在窄屏折叠（P2-2）。

### 结论
三栏结构已与云笔一致，折叠/默认收起（ConfirmBar、监测面板、章纲）方向正确；响应式收起机制（`lg`=1024px 抽屉）经核正已满足且超出「<900px 收起」预期，无三栏拥挤带。本轮改进的**杠杆点**集中在：暖米白背景（P1-1）、圆角统一（P2-1）、主色紫化（P2-6）、空状态组件化（P2-3）、窄栏网格降级（P2-4）、中栏密度减负（P2-2）、次级工具栏 `flex-wrap`（P2-5）。优先级 P1（背景暖度）> P2（圆角/空态/网格/工具栏/主色/密度）。本诊断未改动任何代码。
