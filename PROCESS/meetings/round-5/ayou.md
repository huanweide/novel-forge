# 会员股东无限会议 · Round 5 · 右侧面板（AI助手/工具箱/统计）UI 与功能集成评审（阿游-2）

> 透镜：右侧面板（AI 助手 / 工具箱 / 统计）的 UI 与功能集成。
> 角色：互动游戏小说作者视角。
> 对照基准：云笔 aixiaoshuojia.cn（PROCESS/meetings/round-5/yunix-reference-analysis.md 2.4/2.7/2.8）。
> 铁律：只读诊断，未修改任何代码/测试/changelog/配置；每条发现带 文件:行号 证据；严重程度 P0/P1/P2。
> 已排除（本轮不再列）：Switch 组件统一、ChapterConfirmBar 折叠改造。
> HEAD = v1.1.1（commit fd7f953，2026-08-06）。Next.js 16 + React 19 + Tailwind v4 + Prisma 7 + PostgreSQL 17。

---

## ① 右侧面板现状路径

右侧面板由 `src/components/workspace/RightPanel.tsx` 实现，三栏工作台最右栏。

- 顶部三 tab（RightPanel.tsx:30-34，:17）：`AI助手(bot)` / `查询实体(search)` / `监测(chart)`。
- AI助手 tab（:91-100）：挂载 `AIChatBar`（对话 + 6 个快捷芯片：续写/润色/写对话/查漏/修正/展开）。
- 查询实体 tab（:103-149）：子 tab `实体追踪(chart)` / `伏笔(gem)` / `关系图(globe)`，分别挂载 `ChapterEntitiesPanel` / `ForeshadowingPanel` / `RelationshipGraph`。
- 监测 tab（:151-171）：三块 `叙事能量曲线(chart)` / `生成延迟(zap)` / `节点监测(radio)`，默认全部折叠、展开时才挂载（懒挂载）。
- 底部固定区（:175-194）：`StatRow` 总字数/角色/词条/节点 + 可折叠「上下文监控」(`ContextPreview`)。
- 宽度固定 `w-80`（:68），最小化态 `w-10`（:51）。

工具箱入口：**不是右栏 tab，而是顶栏「更多▾」下拉里的 Modal**（`Toolbar.tsx:105-119` 触发，`page.tsx:1208-1209` 渲染 `ToolboxDialog`，`ToolboxDialog.tsx:24-83` 为 `Modal`）。内含 10 项（`page.tsx:866-877`）。

统计：无独立「统计」tab；仅散落在 `AIChatHeader` 统计条（AIChatHeader.tsx:29-41, :90-103）与右栏底部 `StatRow`（RightPanel.tsx:177-180）。

---

## ② 云笔对照（关键差异）

| 维度 | 云笔（基准 2.4/2.7） | novel-forge 现状 |
|---|---|---|
| 右栏 tab | AI助手 / **工具箱** / **统计** 三标签 | AI助手 / 查询实体 / 监测（无工具箱、无统计 tab） |
| 工具箱形态 | 右侧 tab 内网格入口 | 顶栏下拉 Modal（`ToolboxDialog`） |
| 工具箱工具 | 智能续写/文字润色/**去AI味**/文段展开/**文段概括**/语音校对 | 续写·微调/生成大纲/批量/章节摘要/抽卡/新建角色/创意工坊/结构化表格/记忆召回/冲突推演（缺 去AI味/文字润色/文段展开/文段概括/语音校对） |
| 统计 | 独立标签页 | 仅散落：AI头部统计条 + 底部 StatRow |
| 图表图标 | 语义区分 | `chart` 图标在 监测tab、实体追踪子tab、能量/监测面板多处复用，碰撞 |

---

## ③ 问题清单（P0/P1/P2 + 文件:行号）

### P0
本轮只读诊断未发现数据/崩溃级阻断项（无 P0）。最高为 P1（集成范式冲突、首屏空白、遗漏工具）。

### P1
1. **工具箱应是右栏 tab，却实现为顶栏 Modal（违反「功能集成」规则 1）。**
   证据：`ToolboxDialog.tsx:28` 用 `<Modal open ...>`；`Toolbar.tsx:105-119`（「更多▾」下拉）；`page.tsx:1208-1209` 渲染。
   影响：云笔工具箱是常驻右栏 tab，novel-forge 把它藏进顶栏两级菜单的弹窗中，用户需先点「更多▾」再点「工具箱」才能用，与右栏 AI 助手形成「两套交互范式」，割裂。
   对照 2.7/2.4：工具箱应作为右栏第三 tab，与 AI助手/统计 平级。

2. **无独立「统计」tab，统计信息重复且分散（违反「功能集成/风格统一」）。**
   证据：右栏底部 `StatRow` 总字数/角色/词条/节点（RightPanel.tsx:177-180）；`AIChatHeader` 顶部统计条同 4 项（AIChatHeader.tsx:29-41 计算，:90-103 渲染）。
   影响：当用户停在 AI助手 tab 时，4 项统计**出现两次**（头部 + 底部），信息重复、首屏浪费；且「统计」作为一个独立能力在右栏没有归宿，与云笔「统计标签页」不符。

3. **监测 tab 默认三块全折叠 → 首屏空白（违反「风格统一/空状态」）。**
   证据：`openSections` 初始 `{}`（RightPanel.tsx:46）；仅 `openSections[s.key]` 为真才渲染（:167）；`节点监测` 还依赖 `selectedNode?.id`（:157, :189-193）。
   影响：点击「监测」tab 只见三段无内容的折叠头，无数据引导、无空态提示，用户易误判「功能没数据/坏了」。懒挂载本意省 fetch，但把展开决策完全推给用户且零引导。

4. **云笔工具箱 6 件套缺 4 项关键工具：去AI味 / 文字润色 / 文段展开 / 文段概括（违反「功能集成」）。**
   证据：工具箱 10 项清单无上述四项（`page.tsx:866-877`）；全局搜索 `去AI味|语音校对|文段展开|文段概括|文字润色` 仅在 `orchestrator.ts:953`（去AI味提示词）与 `AIChatBar.tsx:310-317`（chat 预设 润色/展开）出现，**均未被工具箱收录**。
   影响：作者写稿时「去 AI 味」「文段润色/扩写/概括」是最常用的轻量动作，当前要么藏在自然语言对话里、要么根本没有，工具箱形同虚设。

### P2
5. **查询子 tab 激活态弱 + 图表图标碰撞（违反「风格统一」）。**
   证据：子 tab 激活仅 `text-secondary + bg-surface-3/30`，无主色/无下边框，弱于顶部 tab 的 `border-b-2 + bg-primary-soft + text-primary`（RightPanel.tsx:106-125 vs :71-82）；`chart` 图标同时用于：监测 top tab（:33）、实体追踪子 tab（:112）、叙事能量曲线（NarrativeEnergyPanel.tsx:71/96）、监测面板（MonitorPanel.tsx:86/188/209）、本章实体（ChapterEntitiesPanel.tsx:172）。
   影响：监测 tab 与实体追踪子 tab 同为 `chart` 图标，视觉上分不清；子 tab 选中与否仅靠极淡底色区分，辨识度低。

6. **右栏宽度固定 `w-80`、无拖拽伸缩（违反「风格统一/响应式」）。**
   证据：RightPanel.tsx:68 `aside ... w-80`；`page.tsx:1134/1136` 右抽屉同样 `w-80`；全项目 grep `resize|resizable|onResizeStart` 无任何右栏拖拽手柄。
   影响：关系图/监测图表在 320px 内拥挤，长统计卡换行；不同屏宽下无法按作者习惯加宽，云笔右侧为可感知更宽/可调整的栏。

7. **AI 助手输入为单行 `<input type=text>`（违反「风格统一/空状态」）。**
   证据：ChatInput.tsx:21-22 `<input type="text" ... />`（仅 Enter 发送，Shift+Enter 无换行语义）。
   影响：游戏小说作者常需贴长设定/多段指令，单行输入无法换行预览、长文易误触发送、可读差。

8. **「记忆召回」工具箱项与右栏本身冗余（违反「功能集成」）。**
   证据：`page.tsx:875` `recall` 项 action 仅 `setRightPanelOpen(true)` —— 即「打开右栏」，但工具箱本身是从顶栏打开的 Modal，等于弹窗里一个按钮只负责打开右栏，循环且冗余。

9. **续写/润色/展开 在「chat 预设」与「工具箱」两处各实现一套 UI（联动维护风险）。**
   证据：chat 预设 `续写/润色/展开`（AIChatBar.tsx:311/312/316）；工具箱 `续写/微调`（page.tsx:867）走 `handleWrite`，chat 预设走 `handleSend(prompt)`，写入路径不同 UI 同源能力。
   影响：同一能力两套入口两套文案，后续改 prompt/落库逻辑需同步两处，回归风险。

---

## ④ 改进建议（含新增工具工程可行性判断）

### 集成结构（优先做，对应 P1-1/2/3）
- 把右栏三 tab 重构为与云笔对齐：**AI助手 / 工具箱 / 统计**。
  - AI助手：保留 `AIChatBar`，但**移除头部重复统计条**（AIChatHeader.tsx:90-103），统计统一收敛到底部/统计 tab，消除 P1-2 重复。
  - 工具箱：将 `ToolboxDialog` 的 `Modal` 改为右栏第三个 tab 的内联网格（复用其 `CATEGORY_META` 三色分类与 `grid-cols-2/3` 卡片，ToolboxDialog.tsx:18-22, :54），不再经顶栏「更多▾」。顶栏「更多▾」可保留「自动化」等，工具箱入口下移。
  - 统计：新增「统计」tab，把底部 `StatRow` + `监测` 三面板（能量/延迟/节点）+ 查询实体（实体追踪/伏笔/关系图）按「数据/追踪」组织进来；首屏至少默认展开 1 块（如「叙事能量曲线」或「总览」），并加空态文案解决 P1-3 首屏空白。
- 功能联动（落库正确性）：现有写入路径基本正确——`AIChatBar.handleAdoptSuggestion` 走 `PUT /api/characters`（AIChatBar.tsx:109）、关系同步走 `/api/agent/sync-relations`（:263）、工具箱 `续写/微调` 经 `handleWrite` 回写章节。新增工具务必复用既有 `/api/generate/chat` 流式管线与采纳落库逻辑，不另起写库路径（满足铁律「改动必须联动写入：API+Prisma+默认值+测试」）。

### 新增 4 项工具可行性判断
- **去AI味（可行性：高）**：`orchestrator.ts:953` 已有「去AI味——词汇与句式黑名单」提示词。只需新增工具箱入口，action 复用 `/api/generate/chat` 带去AI味 preset prompt，结果采纳即落库（同润色）。无需外部服务。
- **文字润色（可行性：高）**：`AIChatBar.tsx:312` 已有 chat 预设「润色」。提升为工具箱入口即可，或工具箱项直接复用该 prompt，无需新后端。
- **文段展开（可行性：高）**：`AIChatBar.tsx:316` 已有 chat 预设「展开」。提升为工具箱入口，针对 `selectedText` 扩写，落库复用章节写回。
- **文段概括（可行性：高）**：现有工具箱「章节摘要」(summarize, page.tsx:870) 是整章级；新增细粒度「文段概括」针对选中文本生成精简版，复用 `handleSummarize` 或新增针对 `selectedText` 的 chat 动作，纯 prompt，无外部依赖。
- **语音校对（可行性：中-低，标为预留接口，不要硬上）**：全局搜索无 `speechSynthesis`/`TTS` 集成（仅 `speechPatterns` 是对话风格字段，非朗读）。建议 P2 + 预留：先做「朗读校对」入口按钮，调用**浏览器原生 `SpeechSynthesisUtterance`**（零后端依赖）实现基础朗读；同时在 `ToolboxItem` 预留 `ttsProvider` 字段与接口桩（如 `/api/tts` 占位），待接入云端 TTS 服务再点亮，避免在 Round 5 强行上云端 TTS 拖慢交付。

### 风格统一（对应 P2）
- 图标去撞：监测 top tab 改 `activity`/`pulse`，实体追踪子 tab 改 `tag`/`users`，保留 `chart` 专用于统计/曲线（NarrativeEnergyPanel、MonitorPanel 内部可用，但顶层不与子 tab 同形）。
- 子 tab 激活态对齐顶部 tab：加 `border-b-2 border-primary` + `text-primary` + `bg-primary-soft`（参照 RightPanel.tsx:75-79）。
- 右栏宽度：将 `w-80` 改为可拖拽（新增右侧拖拽手柄 + 持久化到 localStorage，或 `w-80 min-w-72 max-w-md` 至少放宽到 `w-96`）；窄屏维持现有 `lg:` 抽屉逻辑。
- 输入多行：ChatInput 将 `<input type=text>` 换为 `<textarea rows=1 auto-grow>`，Enter 发送、Shift+Enter 换行（参照其他面板已用 `resize-y` 文本域惯例）。
- 删除工具箱「记忆召回」冗余项（P2-8），其能力由右栏统计/查询 tab 直接承载。
- 统一「续写/润色/展开」入口（P2-9）：工具箱项与 chat 预设指向同一 `handleSend(presetPrompt)`，文案统一，避免两处维护。

### 风险与原则
- 所有新增工具箱开关/入口按铁律需配套：API 字段 + Prisma 字段 + 默认值 + 测试；语音校对仅预留接口不写死云端依赖。
- 工具箱改为 tab 后，原顶栏「更多▾」触发逻辑（`Toolbar.tsx:105-119`）需移除或改指右栏 tab，避免双入口。
