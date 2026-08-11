# novel-forge 推进计划（v1.9 路线图）——基于云笔 / 竞品调研

> 背景：瑞宝宝指令「继续 学习 然后推进计划」。本文件是「学习产出 + novel-forge 下一步推进清单」的合订，把模糊的 v1.9 目标态推进成「可落地、带优先级、标注依赖」的路线图。

## 一、学习：云笔 aixiaoshuojia.cn 调研（公开面 + 近源架构）

### 1.1 云笔公开面核心信息
- 定位：AI 小说写作助手，6 大能力 = AI 续写、角色生成、大纲规划、文风润色、剧情冲突推演、内容安全审核。
- 2000+ 题材模板（玄幻仙侠 / 现代言情 / 科幻 / 历史穿越 / 悬疑）。
- 额度模式：免费版每日 5000 字、专业版每日 10 万字 + 双人协作 + 无限项目。
- 登录墙之后才是设定 → 大纲 → 章节的细化 pipeline（深入源码/交互需瑞宝宝提供登录凭据，本轮未推进）。

### 1.2 近源架构（jezzlab 文档，同源 / 参考体系）
- **世界观**：设定类型（修仙等级 / 灵根属性）+ 子设定，用于角色状态属性选择、生成情节 / 角色 / 写作的上下文参考。
- **小说**：世界观下的具体作品；章节目录 / 章节大纲（梗概）/ 小说描述。
- **章节续写**：控制 AI 生成字数，按梗概完成本章。
- **情节化**：写正文时 AI 自动识别新情节、归纳到「情节」栏 —— = novel-forge 的「自动抽事件」近亲。
- **章节链接剧情**：每章左上角链接已写好的剧情，控制 AI 生成走向 —— = novel-forge 的 storylineId 透传。
- **快捷面板**：`#` 呼出（续写 / 对话 / 情节化），`@` 选择角色对象（行内指令）。
- **AI 润色 / 扩写**：选中段落润色 / 扩写，存入生成库。

### 1.3 同类全链路工具（ai-novel-writer / zhaoyinshi）
- **ai-novel-writer**：**6 阶段渐进节奏控制（开篇 → 早期发展 → 中期发展 → 后期发展 → 高潮 → 收尾）**，大纲范围 / RAG 前瞻 / 剧透过滤随进度渐进变化，每个阶段有专属「防抢跑」指令。**这是 novel-forge 完全没有的能力**，也是本轮推进计划的第一项。
- **zhaoyinshi**：星图·角色关系网络图（节点可对话 / 附身）、一键爆更（批量生成缺失章节）、文风定制 Tab、自动续写后台计划。

## 二、novel-forge 现状对照（避免重复提案）

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| 批量写作 / 爆更 | ✅ 已有 | `BatchWriteDialog` + `app/api/story/batch-write/route` + CenterPanel 入口 |
| 角色关系图 / 星图 | ✅ 已有 | `RelationshipGraph.tsx` + `app/api/agent/analyze-relationships` + `lib/relations.ts` |
| 叙事能量 | ✅ 已有 | `core/narrative-energy.ts` + `NarrativeEnergyPanel` |
| 伏笔面板 | ✅ 已有 | `core/foreshadowing.ts` + `ForeshadowingPanel` |
| 长期记忆摘要大纲 | ✅ 已有（v1.8.23） | `timelineDigest` / `storylineDigest` + `DigestPanel` + 四路由注入 |
| 因果链 / 叙事角色 | ✅ 已有 | v1.8.18–v1.8.21 |
| 游戏模式 | ✅ 已有 | v1.8.16 / v1.8.22 恢复入口 |
| **全书写作节奏渐进控制 + 防抢跑** | ❌ 缺失 | ai-novel-writer 核心亮点，novel-forge 完全没有 |
| 写正文时一键「情节化」UX | ❌ 缺入口 | `extract-chapter` 后端抽取已有，缺「写时自动归纳」的 UX |
| 角色对话 / 附身模式 | ❌ 缺失 | 关系图有，但角色扮演聊天没有 |
| 内容安全审核 | ❓ 无显式 | 云笔有，novel-forge 无 |

## 三、路线图（按优先级，标注依赖）

1. **【立即推进】写作节奏控制（全书阶段感知 + 防抢跑渐进）** —— 零 schema 变更，直接增强 v1.8.23 注入链路。规格见第四节。
2. **自动情节化 UX** —— 复用 `extract-chapter`，加「写正文时一键抽取新情节归纳到故事线」入口。
3. **角色对话 / 附身模式** —— 在 `RelationshipGraph` 基础上加角色扮演聊天（可选轻量 Dialog）。
4. **文风定制 Tab** —— 确认 `StyleCard` 体系，暴露 UI（低优先级）。
5. **内容安全审核** —— 可选，低优先级。
- **待瑞宝宝定义（v1.9 目标态遗留）**：「推进 / 试探墙」「投票」——仍缺一句话设计规格，不可擅自落地。

## 四、第一项实现规格：写作节奏控制（v1.8.24 候选）

### 4.1 纯函数
`computeNarrativeStage(chapterIndex, totalChapters) → { key, label, directive }`

### 4.2 6 阶段阈值（基于进度百分比 = (chapterIndex+1) / totalChapters）
- **开篇（0–8%）**：建立世界观 / 主角 / 核心冲突；禁止展开终局、禁止主线大决战。
- **早期发展（8–30%）**：铺垫支线、深化人物；禁止主线终局揭晓。
- **中期发展（30–55%）**：冲突升级、伏笔铺开；禁止揭晓终极谜底 / 终极对决。
- **后期发展（55–78%）**：危机逼近、多条线收束前夜；禁止终极对决提前。
- **高潮（78–92%）**：转折 / 决战 / 最大冲突；可揭晓核心谜底。
- **收尾（92–100%）**：解结、收束支线、情感落点；禁止开启新大线。

### 4.3 分母来源
`chapterNodes.length`（已存在章节总数）；当前进度 = (当前章在 chapterNodes 索引 + 1) / 总数。
- 零新字段、零 UI 依赖，纯注入逻辑增强。
- 「规划总章数」锚点（`Project.targetChapters`）作为后续增强，未做。

### 4.4 注入点
- `loadGenerationContext`（context-loader）：计算 stage 加入 `GenerationData`。
- `loadOutlineData`（outline-context）：计算 stage 加入 `OutlineContextData`。
- `write` / `refine` / `continue` / `chapter-outline` 四路由在 prompt 构造处（`formatDigest` 之后）注入 `[全书进度阶段]` 指令块。

### 4.5 验证
- 纯函数单测覆盖 6 阶段边界。
- 无头检测确认构造的 prompt 含阶段指令文本。
- 双门禁：`tsc` 0 错 + `vitest` 全绿。
