# 青砚 · novel-forge Round-5 角色 / 世界书 / 设定 / 故事线 模块深度体验报告

> 透镜：UI 折叠 / 布局 / 集成（对照云笔 aixiaoshuojia.cn）
> 工作目录：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
> 审阅源码（src/components/workspace/*、src/app/workspace/[projectId]/page.tsx、src/components/workspace/worldPanelData.ts）
> 铁律：只读不写——本报告未修改任何源码 / 测试 / 数据库 / 配置；仅做诊断与落点建议。

---

## 一、总览与体验方法

本次体验聚焦四大模块：**角色（CharacterList / CharacterDialog）**、**世界书（WorldPanel / WorldModuleSidebar / WorldEditor / WorldEntryList / WorldEntryCard / LorebookEditDialog）**、**故事线（StorylineList）**、**规则（RulesPanel）**，以及承载它们的左侧栏（LeftPanel）与大纲树（OutlineTree）。体验方式以"阅读真实渲染组件源码 + 对照 yunix-reference-analysis.md 的 14 张云笔基准截图"为主。

对照云笔参考站，本模块在"功能丰富度"上其实**超过**云笔（例如角色有性格三层、人生时间线、对话风格；世界书有 5 级记忆注入深度；故事线有欲望-阻碍-行动-结果-意外-转折-结局七要素），但**在交互折叠、信息层级、面板默认态、模块统一入口、世界历法/补充备注等"布局与集成"维度上明显落后**。下面逐条展开。

---

## 二、对照云笔逐项核查

### 2.1 世界素材网格（云笔：2 列大按钮网格入口）

**云笔表现**：世界观设定 / 故事核心 / 地理地图 / 势力阵营 / 货币 / 物品 / 力量 / 功法 / 特殊 / 大纲 / 角色 / 关系图 / 伏笔 …… 用统一的卡片网格入口，每个入口带图标 + 标题 + 描述 + 计数。

**novel-forge 现状**：WorldModuleSidebar.tsx 已有 12 个板块（geography / faction / item / magic_system / technique / creature / culture / history / law / currency / custom / character_relationship），数据来自 worldPanelData.ts 的 WORLD_MODULES，每个板块有 label / icon / desc 与计数——方向上与云笔一致。

**差距**：
1. 入口形式是**竖向列表**（按钮堆在左侧 40% 高度区域），不是云笔那种**横向 2 列卡片网格**。在窄左栏（固定 w-64）里，12 个全图标+文字的列表项需要滚动，密度高但"卡片感/网格感"弱。
2. WorldModuleSidebar 用 max-h-[40%] 且 overflow-y-auto，但板块标题栏（WorldEditor）与条目列表（WorldEntryList）在剩余 60% 里还要再切分。三者层层嵌套，左栏高度被三次瓜分，**单个世界书条目的可视面积被压缩得很厉害**。
3. 云笔的"世界素材网格"是一个**总览页**；这里点一个板块才进编辑区，缺少"一屏总览所有板块条目数 + 最近更新"的仪表盘视角。

### 2.2 角色详情弹窗：基本信息 + 扩展信息标签页（云笔）

**云笔表现**：点角色 → 弹窗，内含"基本信息"与"扩展信息"两个标签页，基本信息放姓名/身份/境界/武器等高频字段，扩展信息放外貌/性格（表/中/深层）等长字段。

**novel-forge 现状**：CharacterDialog.tsx 编辑态是一个**单页长滚动 Modal**（max-w-2xl，max-h-[90vh]，内部 overflow-y-auto），字段分成"基本标识 / 外貌 / 性格详析 / 背景状态 / 能力 / 时间线 / 人际关系 / 对话风格 / 弧光"共 9 个 border-b 分组。数据非常完整（含性格三层、人生时间线、对话风格四要素）。

**差距（核心）**：
1. **没有"基本信息 / 扩展信息"双标签页**。所有 9 组字段在一个滚动区里平铺，用户每次都要滚动找字段。云笔把高频字段（姓名/身份/境界/武器/外貌/性格）收在"基本信息"一屏内，低频深挖字段收进"扩展信息"，信息层级更清晰。
2. CharacterDialog 的 9 个分组用 border-b border-[var(--nv-border-2)] pb-3 简单分隔，**没有折叠（collapse）能力**。新增角色时"背景"字段默认 rows=16 极高，即使不填也占一大片，进一步推高滚动距离。
3. 云笔的"扩展信息标签页"本质是一种**默认折叠**。novel-forge 这里相反——默认全部展开，长表单负担重。

**严重程度：P0（折叠/信息层级问题，直接命中本轮铁律要求）**

### 2.3 世界历法（云笔：纪年体系 / 起始日期 / 年月时辰 / 显示格式 / 时长模板）

**novel-forge 现状**：**完全缺失**。worldPanelData.ts 的 12 个板块里没有任何"历法 / 纪元 / 时间体系"板块；全局搜索 `历法|calendar|worldCalendar|worldSetting|worldConfig` 在 src 下**零命中**。

**影响**：玄幻 / 历史大世界作者通常需要定义"纪元划分、年号、时辰、节日"等时间骨架。当前只能在 history 板块里用自由文本塞"纪元/时代"，没有结构化时间体系，也无法与 OutlineTree 已支持的 worldTime（书中世界时间排序）做联动——worldTime 是纯文本标记，没有基于"历法模板"的校验与下拉。

**严重程度：P1（功能集成缺口，云笔明确有，且本产品已有 worldTime 基础设施，应打通）**

### 2.4 补充备注折叠（云笔：其他世界观备注，可折叠）

**novel-forge 现状**：**没有名为"补充备注"的可折叠分区**。世界书的新建表单（WorldEditor.tsx）把所有板块字段 + 记忆注入方式都平铺展示，无折叠；编辑弹窗（LorebookEditDialog.tsx）也是平铺（标题/分类/记忆注入/关键词/内容/启用）。

**差距**：云笔把"补充备注"作为可折叠区，让用户把边角信息收起。novel-forge 的世界书条目**只有"内容"一个长字段**，低频的"触发关键词、记忆注入深度、启用开关"和核心"内容"挤在一起，且 LorebookEditDialog 是 max-w-md 窄弹窗，长内容输入局促。

**严重程度：P2（云笔明确有折叠备注，本产品缺；但影响小于角色弹窗）**

### 2.5 大纲设定（云笔：大纲模块）

**novel-forge 现状**：OutlineTree.tsx 支持 volume / flat / timeline 三视图，卷可折叠（VolumeGroup 有 collapsed 状态），时间线按 worldTime 排序。功能远强于云笔大纲。

**可优化点**：
1. OutlineTree 三个视图切换按钮在 LeftPanel 顶部，但**折叠状态（VolumeGroup.collapsed）没有持久化**，每次切换 tab / 刷新页面卷都会重新展开——频繁展开/收起的作者体验差。
2. 卷折叠仅作用于"卷下章节"，但 LeftPanel 整体切换 tab 后组件重挂载，折叠记忆丢失。

**严重程度：P2（持久化缺失，属折叠体验细节）**

---

## 三、角色 / 世界 / 设定模块的折叠 / 布局 / 集成问题清单

> 标注：P0 严重（直接违背本轮"折叠/信息层级"铁律）、P1 较高（功能集成缺口）、P2 一般（体验打磨）。

### 【P0-1】角色编辑弹窗缺少"基本信息 / 扩展信息"双标签页与分组折叠
- 位置：CharacterDialog.tsx（编辑态，第 284–425 行）。
- 现象：9 组字段单页长滚，无标签页、无折叠；"背景"默认 rows=16 占屏过高。
- 对照云笔：基本信息 + 扩展信息标签页，低频字段默认收起。
- 建议：拆分为"基本信息（姓名/别名/定位/年龄/性别/状态/外貌/性格三层）"与"扩展信息（背景/能力/时间线/关系/对话/弧光）"两标签页；或引入 Collapsible 让每组可独立折叠，默认仅展开"基本标识"。

### 【P0-2】世界书三区高度层层嵌套，单条目可视面积被压缩
- 位置：WorldPanel.tsx + WorldModuleSidebar.tsx（max-h-[40%]）+ WorldEditor.tsx + WorldEntryList.tsx。
- 现象：左侧栏固定 w-64；WorldModuleSidebar 占 40%，剩余 60% 再被 WorldEditor（标题+新建表单）与 WorldEntryList（列表/网格切换 + 卡片）瓜分。条目卡片只有 p-2 + line-clamp-3，在窄栏里信息量极低。
- 建议：把 WorldModuleSidebar 改为**横向可滚动胶囊 / 2 列网格**（对齐云笔"世界素材网格"），或在左栏放宽到 w-72/w-80；条目区默认用 grid 视图（当前默认 list）。

### 【P1-1】世界历法（结构化时间体系）整体缺失
- 位置：worldPanelData.ts（无历法板块）、全局搜索零命中。
- 现象：无纪元/年号/时辰/节日结构化录入；与已存在的 worldTime（OutlineTree 时间线排序）未打通，worldTime 仅自由文本。
- 建议：新增 calendar 世界板块（或独立"世界历法"设置页），结构化存储纪元划分、起始日期、年月时辰格式；让章节 worldTime 录入改为基于历法的下拉/校验，反向赋能时间线视图。

### 【P1-2】"更多▾"把故事线 / 规则藏进二级菜单，与常显 tab 割裂
- 位置：LeftPanel.tsx（第 43–51 行 visibleTabs / moreTabs）。
- 现象：大纲 / 角色 / 世界 常显，故事线 / 规则 收进"更多▾"下拉。从集成视角看，故事线与角色、世界书是**强关联的创作设定**，却不在同一视线层级；云笔里这些都在世界素材网格总览中。
- 建议：要么把 5 个 tab 全常显（左栏加宽即可容纳），要么把"更多"做成常驻图标行而非折叠菜单，降低发现成本。

### 【P1-3】世界书"新建"与"编辑"两套独立 UI，字段不对称
- 位置：WorldEditor.tsx（新建，字段来自 MODULE_FIELDS 分板块模板）vs LorebookEditDialog.tsx（编辑，固定 6 字段）。
- 现象：新建时按板块给"类型/阵营/等级序列…"等结构化子字段，但保存后内容被拼成 【字段】值 文本；编辑弹窗**看不到这些子字段**，只能改"标题/分类/内容/关键词/深度/启用"。作者新建时精心填的结构化信息，编辑时丢失了结构化入口。
- 建议：编辑弹窗复用新建的板块字段结构（按 category 反解 MODULE_FIELDS），或把子字段持久化为独立 JSON 字段，编辑时还原。

### 【P2-1】大纲卷折叠状态不持久化
- 位置：OutlineTree.tsx VolumeGroup（第 81 行 collapsed）+ LeftPanel 切 tab 重挂载。
- 现象：每次切 tab / 刷新，卷恢复展开。
- 建议：collapsed 状态提升或存 localStorage（按 projectId）。

### 【P2-2】世界书缺"补充备注"可折叠区
- 对照云笔 2.5。建议在世界书新建/编辑表单底部加 Collapsible 的"补充备注"区，收起低频备注文本。

### 【P2-3】世界书条目卡片 hover 才显编辑/删除
- 位置：WorldEntryCard.tsx（第 25、34 行 opacity-0 group-hover:opacity-100）。
- 现象：编辑/删除按钮默认隐藏，触屏 / 无 hover 设备不可见；与云笔"卡片右侧常显操作"不一致。
- 建议：移动端改为常显，或至少对启用开关常显。

### 【P2-4】角色列表按 role 分组但分组不可折叠
- 位置：CharacterList.tsx + CharacterGroupList.tsx。
- 现象：角色按 role 分组（主角/反派/…），分组标题 (n) 计数常显，但**分组本身不可折叠**；200+ 词条时主角/配角/背景全展开，列表极长。云笔角色模块对大类也可折叠。
- 建议：CharacterGroupList 各组加 collapsed 折叠（类比 OutlineTree 的 VolumeGroup）。

### 【P2-5】故事线编辑弹窗字段平铺、无折叠
- 位置：StorylineList.tsx 编辑 Modal（第 178–217 行）。
- 现象：标题/简述/状态 + 七要素（欲望/阻碍/行动/结果/意外/转折/结局）全平铺，rows=2 偏小；云笔同类表单常用分组/折叠。
- 建议：七要素按"目标—冲突—结局"分组折叠，提升可读性。

---

## 四、集成视角：参考站—现有功能对照结论

| 云笔功能 | novel-forge 对应 | 处理建议 | 严重度 |
|---|---|---|---|
| 世界素材网格（2 列卡片入口） | WorldModuleSidebar 竖向列表 | 改横向网格 / 放宽左栏 | P0-2 |
| 角色弹窗 基本信息+扩展信息标签 | CharacterDialog 单页长滚 | 双标签 + 分组折叠 | P0-1 |
| 世界历法（纪元/时辰/格式） | 无 | 新增 calendar 模块并联动 worldTime | P1-1 |
| 补充备注折叠 | 无 | 加可折叠补充备注区 | P2-2 |
| 大纲设定 | OutlineTree 三视图 | 卷折叠持久化 | P2-1 |
| 角色关系图 | character_relationship 世界板块 | 已具备，建议补可视化关系图 | P2 |
| 角色人生经历（按章引用） | 角色 timeline 字段 | 已具备，建议与章节双向跳转 | P2 |

**核心判断**：novel-forge 的"数据模型深度"已超过云笔，但**"默认折叠态、信息层级、统一网格入口、历法/备注等结构化边角"四项明显落后**，正是本轮铁律强调的"折叠/布局/集成"重灾区。优先级应落在 P0-1（角色弹窗标签页/折叠）与 P0-2（世界素材网格化）两项。

---

## 五、可落地改动的影响面（供阶段三参考）

- **P0-1**：改 CharacterDialog.tsx（新增 Tabs / Collapsible），纯前端；CharacterData 字段已齐备，无需新增 Prisma 字段；需补一个折叠默认态的视觉回归（截图）。
- **P0-2**：改 WorldModuleSidebar.tsx（网格化）+ LeftPanel.tsx（左栏宽度 w-64→w-72）+ WorldEntryList.tsx（默认 grid）。纯前端。
- **P1-1**：新增 calendar 板块需 WORLD_MODULES + MODULE_FIELDS 扩展 + 可能 Project 模型加 worldCalendar JSON 字段 + PUT /api/projects/[id] 写入 + 默认 {}。属"新增字段必须联动 API+Prisma+默认+测试"铁律范围。
- **P1-3**：编辑弹窗复用 MODULE_FIELDS，需 LorebookData 增加结构化子字段存储（或在 content 外新增 fields JSON）；涉及 POST/PUT /api/lorebook 与 Prisma schema。

---

## 六、总结（≤200 字）

novel-forge 角色 / 世界 / 设定模块数据深度超过云笔，但"折叠 / 布局 / 集成"落后：角色编辑弹窗缺基本信息/扩展信息双标签与分组折叠（P0-1），世界素材入口是竖向列表而非云笔的 2 列网格且三区高度嵌套压缩可视面积（P0-2），世界历法整体缺失且未与 worldTime 联动（P1-1），缺补充备注折叠（P2-2），大纲卷折叠不持久（P2-1）。建议优先修 P0-1、P0-2，再补 P1 历法与字段对称。所有建议均不改现有数据模型即可落地前端折叠/网格化。