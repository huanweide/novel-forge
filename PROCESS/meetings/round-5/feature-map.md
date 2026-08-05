# novel-forge 功能全景盘点（MaxLoop Round-5 只读诊断）

> 诊断性质：只读。未修改任何 src/、测试、配置或数据库。
> HEAD = v1.1.1（commit fd7f953，2026-08-06）
> 技术栈：Next.js 16 + React 19 + Tailwind v4 + Prisma 7 + PostgreSQL 17
> 集成基线：PROCESS/meetings/round-5/yunix-reference-analysis.md（云笔 / aixiaoshuojia.cn）

## 1 功能全景表

### A. 设置页（src/app/settings/page.tsx）
| 功能 | 入口 | Prisma 字段 | 备注 |
| --- | --- | --- | --- |
| 主题切换 | 233-247 | — | localStorage nf-theme，仅 3 主题 |
| LLM 服务商 | 249-280 | llmConfig(24) | |
| API Key/测试/模型 | 282-389 | llmConfig(24) | |
| 违禁词 | 412-438 | postProcessingRules(27) | localStorage 直写 |
| 快捷键 | 440-466 | — | localStorage |
| 记忆衰减说明 | 468-495 | autoFillEnabled(34) 等 | 仅说明，无独立对话框 |
| Agent 模式开关 | 497-530 | — | localStorage nf-agent-mode |
| 保存 | 532-558 | — | |

> 问题：525-527 使用内联 toggle，未用统一 Switch 组件（src/components/ui/switch.tsx）。

### B. 顶部工具栏（src/components/workspace/Toolbar.tsx）
- 风格 61-66 / 大纲 69-72 / 摘要 73-75 / 导入 76-78 / 导出复制 80-99 / 备份 101-103 / 自动化 113-116 / 工具箱 117-120

### C. 左栏（src/components/workspace/LeftPanel.tsx）
- tabs：大纲/角色/世界 43-47, 84-127
- more▾：故事线/规则 48-51, 129-131, 141-143
- 批量模式+生成 103-121；批量确认 117-119
- Prisma：Storyline(318)、Rule(398)、CharacterCard(72)、LorebookEntry(106)

### D. 中栏（src/components/workspace/CenterPanel.tsx）
- 生成/重写 289-291 / 精修 292-299, 317-319 / 游戏模式 300-306 / 目标字数 309-311 / 作者注 312-315
- 章节大纲·轻量章纲·抽卡分镜 238-279 / 世界时间 215-223
- 版本历史·回滚 108-162, 447-529 / 每日目标 71-87, 406-435
- Prisma：authorNote(22)、StoryNode.worldTime(167)、StoryNodeRevision(197)

### E. 右栏（src/components/workspace/RightPanel.tsx）
- 顶部 tabs：AI/查询/监视 30-34
- 查询子tab：实体/伏笔/关系 107-146
- 监视：能量/延迟/监控 151-170
- 底部统计 174-194
- Prisma：LlmCallLog(604)、PendingCommitment(257)

### F. AI 工具箱（src/components/workspace/ToolboxDialog.tsx）
- 入口 Toolbar 117-120；items 见 workspace/[projectId]/page.tsx 866-877：续写/润色/对话/查漏/修正/展开

### G. 项目配置（src/components/workspace/ProjectConfigPanel.tsx）
- 已应用预设 206-245 / 正则后处理规则+预设选择 247-359 / 项目级 LLM 覆盖 361-400
- 新增正则弹窗 163-184, 406-453
- Prisma：appliedPresets(31)、postProcessingRules(27)、llmConfig(24)

### H. 生成后分析面板（src/components/workspace/PostGenPanel.tsx）
- 5 tab：抽取/违禁/逻辑/蒸馏/评审 10-13, 201-216
- Prisma：reviewLogs(170)、qualityScore(172)

### I. 确认/交付流（src/components/workspace/ChapterConfirmBar.tsx）
- 确认流 209-264
- autoConfirm 读取 67, 96-104（无 UI 开关）
- autoDeliver Switch 281-344（prisma autoDeliverEnabled 49）
- smartDeliver 158-190
- Prisma：autoConfirmEnabled(47)、autoDeliverEnabled(49)、confirmedAt(44)

### J. 角色（src/components/workspace/CharacterDialog.tsx）
- CRUD + AI 自动填充 72-120
- Prisma：CharacterCard(72) relationships/timeline/arcProgress

### K. 世界/设定
- WorldPanel.tsx 模块网格；LorebookEntry(106)、LoreTable(555)
- RelationshipGraph.tsx 陈旧关系检测 282-319
- ForeshadowingPanel.tsx 检测/再生 192-217
- Prisma：Storyline(318)、PendingCommitment(257)

### L. 游戏模式
- 中栏入口 300-306；Prisma：GameSession(351)、GameState(377)

### M. 独立路由
- dissect（拆解）/ explore（探索）/ workshop（工坊）/ recycle（回收）——各自独立页面，与 3 栏工作区分离

## 2 重复/重叠清单

1. 确认流多机制重叠：autoConfirm 仅读无开关、autoDeliver 有 Switch、smartDeliver 另有实现（ChapterConfirmBar 67/96-104/158-190/281-344）；逻辑分散。
2. 摘要/蒸馏入口分散：Toolbar 摘要 73-75、PostGenPanel 蒸馏 tab、AIChatBar 续写/润色 chips（310-317）功能重叠。
3. AI 工具入口极度分散：Toolbar 工具箱 117-120、AIChatBar chips、PostGenPanel、CenterPanel 精修/重写——4+ 入口。
4. 实体高亮重复：RightPanel 实体查询列表 + 中栏正文内联 badge 双份呈现。
5. 统计/字数多次展示：RightPanel 底部 174-194、CenterPanel 目标字数 309-311、每日目标 71-87 多处。
6. 记忆衰减说明与可操作对话框分离：settings 仅说明 468-495，无联动配置入口。
7. 世界设定双形态：LorebookEntry(106) 与 LoreTable(555) 并存，概念重叠。
8. 关系双来源：CharacterCard.relationships(72) 静态 + RelationshipGraph 正文抽取（282-319），易不一致。

## 3 集成缺口清单（对照 yunix-reference-analysis.md）

| 云笔能力 | novel-forge 现状 | 证据 |
| --- | --- | --- |
| 去AI味润色 | 仅有提示词，无 UI | src/core/agents/orchestrator.ts:953 |
| 文段概括 | 缺失 | 组件未见 |
| 语音校对 | 缺失 | 组件未见 |
| 主题系统(20+) | 仅 3 主题 | ThemeToggle 13-17 |
| 世界历法 | 缺失 | schema 无对应 |
| 蒸馏诊断日志 | 缺失 | PostGenPanel 仅结果 |
| 队列精灵 | 缺失 | 无对应组件 |
| 自动润色/实时建议 | 缺失 | 无实时 hook |
| 自动计算事件数 | 缺失 | 无聚合 |

## 4 给 Chair 的集成优先级建议

P0（必做，阻塞集成）：
- 统一确认流：为 autoConfirm 增加 UI 开关，合并 smartDeliver 逻辑，全部复用统一 Switch（src/components/ui/switch.tsx）。证据：ChapterConfirmBar 67/96-104/158-190/281-344。
- 收敛 AI 工具入口：把 Toolbar/PostGenPanel/AIChatBar/CenterPanel 的 AI 能力归并到单一工具箱（ToolboxDialog）。
- 主题系统补齐：从 3 主题扩到参考站 20+，统一 ThemeToggle 与设置页 233-247。

P1（应做，去重）：
- 合并摘要/蒸馏入口（2-2）、世界双形态（2-7）、关系双来源（2-8），写入同一 Prisma 字段。
- 收敛统计/字数展示（2-5）、实体高亮（2-4）。

P2（增强，补缺口）：
- 补 去AI味 的 UI（orchestrator 已有提示词）、文段概括、语音校对、队列精灵、自动润色、蒸馏诊断日志、世界历法。
