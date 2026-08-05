# 青砚-2 · novel-forge Round-5 世界/Lorebook + 角色 + 检索/召回 UI 集成与风格统一诊断

> 透镜：世界/Lorebook 入口与网格布局、角色模块 UI、检索词边界与召回注入相关配置 UI 的集成（规则1/2）与风格统一（规则3）。
> 对照基准：云笔 aixiaoshuojia.cn（PROCESS/meetings/round-5/yunix-reference-analysis.md §2.5/2.6/2.2）。
> 工作目录：C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge（HEAD v1.1.1 / fd7f953）。
> 铁律：只读诊断，未修改任何源码/测试/changelog/配置；每条发现均带 文件:行号 证据；严重度 P0/P1/P2。
> 说明：同目录 qingyan.md 为青砚（原人格）Round-5 报告。本报告为 青砚-2 补充诊断，重点补齐其遗漏的两大问题（角色人生经历章节引用回环损坏、检索/召回开关在设置页整体缺失），并对折叠范式统一、风格统一、开关组件复用给出独立判定。

---

## ① 现状路径（我的透镜内的代码落点）

| 维度 | 关键文件 | 入口位置 |
|---|---|---|
| 世界/Lorebook 入口 | src/components/workspace/LeftPanel.tsx:43-51,138-140（world tab）→ WorldPanel.tsx | 左栏 264px 内 |
| 世界板块导航 | src/components/workspace/WorldModuleSidebar.tsx（竖向列表, max-h-[40%]） | 世界 tab 内上部 |
| 世界条目列表/卡片 | WorldEntryList.tsx / WorldEntryCard.tsx | 世界 tab 内下部 |
| 世界新建/编辑 | WorldEditor.tsx（内联表单）/ LorebookEditDialog.tsx（模态） | 新建内联、编辑模态 |
| 世界板块定义 | src/components/workspace/worldPanelData.ts（WORLD_MODULES 12 项） | — |
| 角色编辑弹窗 | src/components/workspace/CharacterDialog.tsx | 左栏 characters tab → 单击行 |
| 角色列表/行 | CharacterList.tsx / CharacterRow.tsx / CharacterGroupList.tsx | 左栏 |
| 角色时间线序列化 | src/lib/character-parse.ts:64-86（CharacterTimelineEvent / timelineToText / textToTimeline） | — |
| 提取落库（经历） | src/app/api/agent/apply-extraction/route.ts:445-480 | 后端 |
| 设置页（召回配置应在此） | src/app/settings/page.tsx | /settings |
| 统一开关组件 | src/components/ui/switch.tsx（已统一，iOS 风格、右对齐） | — |
| 设计令牌 | src/app/globals.css:80-105（--nv-* 虚空玻璃暗色令牌） | — |

---

## ② 云笔对照（摘取自 yunix-reference-analysis.md）

- §2.5 世界/设定：世界素材网格为「世界观设定/地理/势力/货币/物品/功法/角色/关系图/伏笔/时间线…」2 列卡片网格大按钮入口；卡片统一「图标+标题+描述+右侧操作」；世界观设定表单；补充备注可折叠。
- §2.6 角色：角色详情弹窗（基本信息+扩展信息标签页）；字段含年龄/身份/境界/武器/外貌/性格（表/中/深层）；人生经历按章节引用；核心意义/结局叙事标签。
- §2.2 生成设置（检索/召回开关）：自动提取角色关系、新角色自动创建人生经历、启用时间线提取、启用分层故事回顾、启用主角状态档案、启用待兑现事项、分层阈值设置——均为用户可在设置页切换的开关。

---

## ③ 问题清单（P0/P1/P2 + 文件:行号）

### 【P0-1】角色“人生经历”章节引用在编辑弹窗回环中被破坏（数据丢失 / 功能联动失效）
- 证据链：
  - 提取落库写入的是结构化章节引用形态：src/app/api/agent/apply-extraction/route.ts:466-477 向 characterCard.timeline push { chapter: chapterTitle, type:"出场", event: exp.experience, evidence: exp.evidence?.slice(0,100) }。
  - 但编辑弹窗把整个 timeline 当作「年龄制」文本处理：CharacterDialog.tsx:64 timeline: timelineToText(character?.timeline as any)；保存时 CharacterDialog.tsx:160 timeline: textToTimeline(form.timeline)。
  - timelineToText（character-parse.ts:70-73）只认 {age,event,era}，把提取写入的 {chapter,type,event,evidence} 渲染成 undefined岁：<event>（undefined）；textToTimeline（character-parse.ts:75-86）再用正则 ^(\d+)岁[：:] 解析，结果得到 age:0, event:"<event>（undefined）", era:""——chapter / type / evidence 三字段全部丢失，event 文本还被污染。
  - Prisma 模型 CharacterCard.timeline Json（schema.prisma:93）无形态约束，两种形态可共存但编辑弹窗只支持一种。
- 后果：作者用“提取本章变化”写入的角色经历，一旦在角色弹窗里打开并保存（哪怕不改动），章节引用与正文证据即被抹除，且污染 event 文本。直接违反云笔 §2.6「人生经历按章节引用」与本轮铁律“改动必须联动写入、写入落库正确（规则2）”。
- 严重度：P0（静默数据损坏，且发生在高频的“编辑角色”路径上）。

### 【P1-1】检索/召回相关开关在设置页整体缺失（云笔 §2.2 七项全无 UI）
- 证据：
  - src/app/settings/page.tsx 仅含分区 0–7：外观(ThemeToggle)、LLM 提供商、API Key、模型、Base URL、违禁词、快捷键、记忆衰减(仅说明无开关)、Agent 助手模式开关。无任何「自动提取角色关系 / 启用时间线提取 / 启用分层故事回顾 / 启用主角状态档案 / 启用待兑现事项 / 分层阈值」开关。
  - 全局检索 src 下 自动提取角色关系|时间线提取|分层故事回顾|主角状态档案|待兑现事项|timelineExtract|autoRelation 仅在 CHANGELOG/docs 命中，没有任何 .tsx 暴露为可切换 UI。
  - 这些能力在文档中是“后端生成管线默认注入”，即硬编码常开、用户不可配置、不可关闭。
- 对照云笔 §2.2：这类召回开关是用户可见、可逐项开关的设置。novel-forge 把它们“藏进后端”，既不符合功能集成（规则1）也不符合用户可配置（规则2 写入联动）。
- 与 qingyan.md 关系：原报告完全未覆盖此维度（其 P1-1 是“世界历法”，与此不同）。
- 严重度：P1（集成缺口；本轮任务明确把“设置页检索/召回配置是否右对齐 iOS Toggle、是否散布需合并”列为重点审查项，而它们当前连入口都没有）。

### 【P1-2】世界素材入口为竖向列表而非云笔 §2.5 的 2 列网格大按钮（与 qingyan.md P0-2 方向一致，确认并补充约束证据）
- 证据：WorldModuleSidebar.tsx:18-44 用 space-y-0.5 竖向按钮堆；LeftPanel.tsx:55 左栏固定 w-64（264px）。
- 补充：WorldEntryList.tsx:35 网格态用 grid-cols-1 min-[360px]:grid-cols-2，但 min-[360px] 是视口媒体查询而非容器查询——该组件渲染在 264px 左栏内，桌面视口普遍 ≥360px 故仍触发 2 列，但每卡宽仅约 120px，标题+3 行内容+关键词+深度徽标在如此窄宽下严重拥挤、可读性差。换言之“网格”在左栏里形同虚设。
- 严重度：P1（集成/风格统一；建议要么把世界模块独立成全宽路由页用真正 2 列网格，要么在 264px 左栏内放弃网格、改用横向可滚动胶囊，并对齐云笔“图标+标题+描述+计数”的卡片语言）。

### 【P1-3】世界“新建”内联表单 与 “编辑”模态 两套 UI、字段不对称（与 qingyan.md P1-3 一致，确认）
- 证据：WorldEditor.tsx:59-78（按 MODULE_FIELDS 分板块结构化子字段，保存时拼成 【字段】值 文本）；LorebookEditDialog.tsx:106-143（仅 标题/分类/记忆注入/关键词/内容/启用 6 字段，看不到结构化子字段）。
- 后果：新建时精心填的结构化信息，编辑时无入口还原；且“启用此词条”在编辑弹窗用原生 checkbox（LorebookEditDialog.tsx:140-143）而非统一 Switch。
- 严重度：P1（功能集成/风格统一）。

### 【P2-1】统一 Switch 组件已就绪但两处未复用（风格统一 / 规则3）
- 背景：src/components/ui/switch.tsx（统一药丸开关…云笔式右对齐 Toggle）已存在，本轮铁律称“已统一 Switch 组件”。但：
  - LorebookEditDialog.tsx:140-143 “启用此词条”用 input type=checkbox 原生勾选框（暗色下对比弱、与 iOS 药丸风格不一致）。
  - src/app/settings/page.tsx:507-528 Agent 助手模式开关为自写 relative h-5 w-9 rounded-full 药丸，未复用统一 Switch。
- 建议（非重新列出 Switch 统一，而是新位置未复用的纠正）：新增检索/召回开关（见 P1-1）及上述两处均改为复用 Switch，右对齐，保证 iOS Toggle 语言一致。
- 严重度：P2（风格统一）。

### 【P2-2】世界条目卡片“右侧操作常显”未达标（云笔 §2.5 卡片语言）
- 证据：WorldEntryCard.tsx:22-38 编辑/删除按钮 opacity-0 group-hover:opacity-100——默认隐藏，仅 hover 出现；卡片也无条目类型图标（仅纯标题）。云笔卡片为「图标+标题+描述+右侧常显操作」。
- 影响：触屏/无 hover 设备不可见；与云笔卡片语言不一致。WorldEntryList 网格态本就窄，hover 操作更难触发。
- 严重度：P2（风格统一；与 qingyan.md P2-3 一致，确认）。

### 【P2-3】折叠面板无统一范式（本轮重点审查项“折叠面板是否统一范式”）
- 证据（三处各自手搓，图标/行为不一致）：
  - ChapterEntitiesPanel.tsx:113-190 自管 collapsed:Set，用 arrowRight/arrowDown，>5 项默认折叠。
  - ForeshadowingPanel.tsx:86-290 自管 collapsed:Set，默认含 voided，图标同 arrowRight/arrowDown。
  - OutlineTree.tsx:81-93 单 boolean collapsed，图标 arrowRight/arrowDown。
  - 角色分组 CharacterGroupList.tsx 按 role 分组但组本身不可折叠（与 qingyan.md P2-4 一致）。
- 判定：项目内没有共享的 Collapsible/Accordion 组件，折叠交互（默认态、图标、动画、持久化）各组件各自为政；云笔使用一致的“可折叠分组”。这是本轮铁律强调的“折叠统一”重灾区之一。
- 严重度：P2（风格统一 / 折叠范式）。

### 【P2-4】角色编辑弹窗无“基本信息/扩展信息”双标签（与 qingyan.md P0-1 一致，确认并升级视角）
- 证据：CharacterDialog.tsx:284-441 编辑态单页长滚，9 组 border-b 分组平铺，无标签页、无组内折叠；“背景”默认 rows=16（CharacterDialog.tsx:359）占屏过高。
- 对照云笔 §2.6：基本信息+扩展信息标签页，低频字段默认收起。
- 严重度：原报 P0-1（认同）。本报告从风格统一角度补充：应引入与 §2.3 折叠范式（P2-3）一致的 Collapsible，使角色弹窗与世界观/伏笔面板折叠语言统一。

### 【P2-5】“虚空玻璃”暗色系统与云笔“暖紫”亮色卡片语言协调性（风格统一 / 规则3）
- 证据：globals.css:80-105 全部为暗色 void/abyss/surface + 靛蓝/紫罗兰功能色（OKLCH 暗空间）；settings/page.tsx:234-247 外观仅三档：夜航(暗)/白昼(浅)/苍青(青绿暗)，无“暖紫”主题。
- 判定：novel-forge 内部 Void Glass 自洽且完成度高；但与云笔“暖米白底 + 紫色主色卡片”的暖紫语言存在观感鸿沟。若目标是与参考站风格协调，应在 ThemeToggle 增加“暖紫”预设（复用现有 --nv-* 令牌体系，仅替换底色/主色为暖紫梯度），作为风格统一的补充手段。
- 严重度：P2（风格统一，非阻塞）。

---

## ④ 改进建议（按 3 条集成规则归类）

### 规则2 联动写入（最高优先，先止血）
- P0-1 修复：CharacterDialog 不应再用 timelineToText/textToTimeline 对含章节引用的 timeline 做文本往返。方案二选一：
  1. （推荐，纯前端、无 schema 变更）CharacterDialog 的“经历时间线”区改为结构化子表（每行：章节 / 类型 / 事件 / 证据），直接读写 timeline 数组元素，保留 chapter/type/evidence；自由文本形态仅作兼容展示。
  2. 在 apply-extraction 落库时把章节经历写入独立字段 CharacterCard.experiences Json（区别于人工 timeline），两者在弹窗分开展示；需 Prisma 加字段 + 默认 [] + API 写入 + 测试（符合“新增字段须联动”铁律）。
  - 无论哪种，都必须保证“打开并保存角色”不破坏提取写入的章节引用。

### 规则1 功能集成（补齐召回配置与入口）
- P1-1：在设置页新增「检索与召回」分区，提供 Switch 右对齐开关：自动提取角色关系、启用时间线提取、启用分层故事回顾、启用主角状态档案、启用待兑现事项、分层阈值（数字输入）。后端当前为常开，需给这些开关加 Project 模型 JSON 配置字段 + 默认值 + /api/settings(或 project config) 读写 + 测试，使“关闭即不注入”，落实联动写入（规则2）。
- P1-2 / P2-2：世界模块入口改为真正的 2 列网格——建议新增独立「世界」路由页（全宽）承载 WORLD_MODULES 的 2 列卡片网格（图标+标题+描述+计数+右侧操作常显），左栏 world tab 退化为入口/摘要；或直接把 WorldModuleSidebar 改为横向可滚动胶囊以免在 264px 内挤 2 列。
- P1-3 / P2-1：编辑弹窗复用 MODULE_FIELDS 反解结构化子字段；并把“启用此词条”checkbox 换成统一 Switch。

### 规则3 风格统一
- P2-1：新增统一 Collapsible 组件（默认折叠态、箭头图标、动画、可选 localStorage 持久化），替换 ChapterEntitiesPanel/ForeshadowingPanel/OutlineTree/角色分组四处手搓实现；角色弹窗（P2-4）与世界观补充备注（qingyan.md P2-2）一并采用，统一折叠语言。
- P2-2：WorldEntryCard 操作按钮改常显（至少启用/编辑/删除常显），并加条目类型图标。
- P2-3：引入共享折叠范式后，全站折叠交互一致。
- P2-5：ThemeToggle 增加“暖紫”预设，缩短与云笔观感距离（可选，非阻塞）。
- 注意：本轮铁律已声明“已统一 Switch 组件、ChapterConfirmBar 折叠改造”，故不重复列这两项；本报告仅在“P2-1 新位置未复用 Switch”“P2-3 其余折叠未统一”层面补充。

---

## 附：与 qingyan.md 的差异小结
- 本报告新增且原报告遗漏的关键项：P0-1（角色人生经历章节引用在编辑回环中被静默破坏——数据损坏）、P1-1（检索/召回七项开关在设置页整体缺失）、P2-1（统一 Switch 在两处未复用）、P2-3（折叠无统一范式）、P2-5（虚空玻璃 vs 暖紫协调性）。
- 与 qingyan.md 一致确认项：P1-2/P1-3（世界入口网格化、新建/编辑不对称）、P2-2（卡片右侧操作）、P2-4（角色弹窗双标签）。
- 所有建议均遵守只读铁律，未改动任何代码。
