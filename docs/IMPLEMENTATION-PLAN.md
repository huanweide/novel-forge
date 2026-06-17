# Novel Forge 实施计划

> 基于 docs/architecture-reference/A-J 整理版架构文档 + 当前项目实现状态对照
> 制定日期：2026-06-17
> 原则：先核心后外围、先省钱后好看、先修路后造车

---

## 当前状态速览

已完成（v0.20.1）：
- ✅ 4-Agent 管线 + 共享 pipeline 模块
- ✅ 禁用词 v2.0（正则+三级严重度）
- ✅ 审校 9 维
- ✅ 规则冲突三阶段裁决
- ✅ 蒸馏 S/A/B/C 四级事件评分
- ✅ 伏笔五状态机模型（PendingCommitment）
- ✅ 多提供商 LLM 动态配置
- ✅ SSE 流式生成 + 草稿自动保存

---

## 阶段四：记忆系统升级（🔴 核心，第1周）

### 4.1 三层记忆注入（S/A/B 分级）

**目标：** 写正文时按重要性分级注入记忆，而非全量塞入 Prompt。

**当前差距：** buildPromptContext 有类似逻辑但无显式分级；无 story_recaps 表。

**改动：**
- [ ] `prisma/schema.prisma` — 新增 `StoryRecap` 表（projectId, recapLevel: ultra_short/short/medium/long, content, validFromChapter, validToChapter）
- [ ] 新增 `PendingItem` 表（projectId, itemType, content, priority, status, deadlineChapter）
- [ ] `src/core/assembly/engine.ts` — assemblePrompt 改为 S/A/B 三级注入逻辑：
  - S 级（≤5条）：当前章大纲直接关联的事件和伏笔，全量注入
  - A 级（≤10条）：最近 3-5 章关键事件，按重要性排序截断
  - B 级（≤20条）：世界观/势力/地点背景，按触发词相关性筛选
- [ ] `src/core/pipeline/context-loader.ts` — 增加 loadMemoryInjection() 函数

**文件：** prisma/schema.prisma, src/core/assembly/engine.ts, src/core/pipeline/context-loader.ts
**新增表：** StoryRecap, PendingItem

### 4.2 待兑现事项追踪

**目标：** 用户说"下次要写XXX"后系统记住，下次写正文时自动注入提醒。

**当前差距：** 完全靠用户记忆，系统不追踪。

**改动：**
- [ ] `src/app/api/pending-items/route.ts` — CRUD API
- [ ] `src/core/pipeline/post-processor.ts` — 正文采纳后自动扫描新待兑现事项（检测"下次""之后""等下次"关键词）
- [ ] `src/core/pipeline/context-loader.ts` — 写前自动加载未兑现的待办项注入 Prompt

**文件：** 新增 API 路由 + 修改 pipeline

### 4.3 时间线感知过滤

**目标：** 跳章写时，第 N 章之后的角色状态/事件不被注入到第 N 章的上下文。

**当前差距：** previousNodes 按 order 过滤但无显式跳章保护。

**改动：**
- [ ] `src/core/pipeline/context-loader.ts` — loadGenerationContext 增加 chapterOrder 参数，过滤条件：
  - 角色状态：只取 timeline 中 chapter ≤ currentOrder 的条目
  - 事件：只取 events 中 chapterIndex ≤ currentOrder 的条目
  - 伏笔：只取 plantChapter ≤ currentOrder 的伏笔

**文件：** src/core/pipeline/context-loader.ts（单文件改动）

---

## 阶段五：蒸馏引擎本地化（🔴 核心，第2周）

### 5.1 蒸馏不调 LLM——命名模式库 + 归属推断

**目标：** 正文生成后的实体检测/事件提取/伏笔检测改为本地程序处理，不再调 LLM summarize。省 Token、省时间。

**当前差距：** 蒸馏通过 LLM summarize 完成（调 API），非本地程序。

**改动：**
- [ ] `src/lib/entity-detector.ts` — 新文件，命名模式库：
  - 丹药模式：`/[一二三四五六七八九十]品[一-鿿]{2,4}丹/`
  - 法宝模式：`/[一-鿿]{1,3}(?:剑|刀|镜|鼎|塔|印|旗|幡|珠|环|镯|簪)/`
  - 功法模式：`/[一-鿿]{2,6}(?:诀|经|典|功|法|术|引|咒|拳|掌|指|腿)/`
  - 地点模式：`/[一-鿿]{2,4}(?:山脉|山谷|峡谷|城|镇|村|宗|门|派|殿|阁|洞|府|宫)/`
  - 材料模式：`/[一-鿿]{2,4}(?:草|花|果|叶|根|藤|石|木|玉|晶|矿|铁|铜)/`
  - 排除词库：身体部位/普通名词/抽象名词
- [ ] `src/lib/entity-detector.ts` — 归属推断三层策略：
  1. 属格匹配"XX的XX"（置信度 0.95）
  2. 动词前置"XX从储物袋取出XX"（置信度 0.85）
  3. 段落主人推断（置信度 0.6）
- [ ] `src/lib/distillation-runner.ts` — 新文件，四遍扫描：
  1. 实体识别（正则 + 已知实体词典）
  2. 状态变化检测（对比前后快照）
  3. 伏笔模式匹配（埋设/回收信号关键词）
  4. 一致性校验（规则匹配）
- [ ] `src/core/pipeline/post-processor.ts` — runPostGenerationPipeline 接入蒸馏本地引擎，替代当前 LLM summarize 步骤

**文件：** 新增 2 个 lib 文件 + 修改 post-processor
**影响：** Token 消耗降低 50%+，蒸馏耗时从 3-5 秒降到 <1 秒

### 5.2 伏笔自动检测

**目标：** 正文采纳后自动检测伏笔回收/深化/新埋设，更新 PendingCommitment 状态。

**当前差距：** PendingCommitment 模型已建，但自动检测逻辑未实现。

**改动：**
- [ ] `src/lib/distillation-runner.ts` — 增加伏笔检测逻辑：
  - 埋设信号词库（"他并不知道""冥冥之中""神秘的XX"）
  - 回收信号词库（"原来""真相""果然""恍然大悟"）
  - 深化判定（关键词再出现但无回收信号）
- [ ] `src/core/pipeline/post-processor.ts` — 蒸馏完成后自动更新 PendingCommitment 状态

**文件：** src/lib/distillation-runner.ts, src/core/pipeline/post-processor.ts

### 5.3 数据反哺——自动创建实体

**目标：** 正文中出现新角色/物品/地点后自动创建到数据库（标记待确认）。

**当前差距：** handleNewCharacters 创建角色，但物品/势力/地点未自动创建。

**改动：**
- [ ] `src/lib/distillation-runner.ts` — 新实体检测后自动调用 Prisma 创建：
  - 新角色 → CharacterCard.create（status: "pending_review"）
  - 新物品 → 新增 Item 模型（目前无独立物品表，混在世界书中）
  - 新地点 → LorebookEntry.create（category: "geography"）
- [ ] `src/app/api/generate/apply-updates/route.ts` — 增加实体确认/拒绝 API

**文件：** 修改 distillation-runner + apply-updates API

---

## 阶段六：写作质量实时检测（🟡 重要，第3周）

### 6.1 实时规则检测（每 200 token）

**目标：** 生成过程中每 200 token 执行一次规则检测，违规即时通过 SSE 推送。

**当前差距：** 检测是生成后一次性的，不能即时拦截。

**改动：**
- [ ] `src/core/agents/orchestrator.ts` — writeSection() 增加每 200 token 截断检测：
  - 累计 token 计数器
  - 触发阈值 = 200 token
  - 调用 forbidden-checker 扫描
  - 违规通过 SSE 即时推送 `rule_violation` 事件
- [ ] `src/app/api/generate/write/route.ts` — SSE 增加 `rule_violation` 事件类型

**文件：** orchestrator.ts, write/route.ts

### 6.2 六维质量矩阵自动评分

**目标：** 正文生成后自动计算废词率/展示vs讲述比/视角一致性/句式多样性/对话自然度。

**当前差距：** 审校 9 维覆盖了其中 4 维，缺少自动量化评分。

**改动：**
- [ ] `src/lib/quality-analyzer.ts` — 新文件：
  - 废词率 = 禁用词出现次数 / 总字数
  - 展示vs讲述比 = 动作描写占比 / 直接叙述占比
  - 视角一致性 = PoV 跳变检测
  - 句式多样性 = 连续句首重复检测
  - 对话自然度 = 乒乓球式 A→B→A 检测
- [ ] `src/core/pipeline/post-processor.ts` — 后处理增加质量评分步骤，通过 SSE 推送 quality_score 事件

**文件：** 新增 quality-analyzer.ts + 修改 post-processor

---

## 阶段七：UI 增强（🟡 重要，第4周）

### 7.1 实体追踪面板（编辑器底部）

**目标：** 编辑器底部实时显示正文中出现的角色/物品/地点/伏笔，点击可查看详情。

**当前差距：** 无此组件。

**改动：**
- [ ] `src/lib/ner-detector.ts` — AC 自动机（Aho-Corasick）实现，O(n) 线性扫描
- [ ] `src/components/editor/EntityTracker.tsx` — 5 Tab 面板（角色/势力/场景/伏笔/物品）
- [ ] 正文中实体关键词高亮（CSS 颜色编码：蓝色=角色，红色=势力，绿色=地点，橙色=伏笔，紫色=物品）

**文件：** 新增 ner-detector.ts + EntityTracker.tsx

### 7.2 统计面板（右侧栏新 Tab）

**目标：** 可视化写作数据——字数柱状图、角色出场频率、情感曲线。

**当前差距：** 无。

**改动：**
- [ ] `src/components/workspace/StatsPanel.tsx` — 新组件：
  - 写作进度环形图
  - 章节字数柱状图（用 recharts 库）
  - 角色出场频率排行
  - 情感曲线（基于 ChapterSummary.characterStates.closingSnapshot）

**文件：** 新增 StatsPanel.tsx

### 7.3 AI 对话面板（右侧栏新 Tab）

**目标：** 边写边跟 AI 对话——问问题、要建议、分析章节。

**当前差距：** 右侧面板只有上下文监控，无对话功能。

**改动：**
- [ ] `src/components/workspace/AIChatPanel.tsx` — 对话式交互组件：
  - 消息列表（用户/AI 气泡）
  - 输入框 + 发送
  - 预设问题模板（"梳理角色关系""检查本章节奏""生成下一章大纲建议"）
- [ ] `src/app/api/chat/route.ts` — 新 API，通用对话端点

**文件：** 新增 AIChatPanel.tsx + chat API

---

## 阶段八：新功能（🟡 重要，第5-6周）

### 8.1 10 种文风预设

**目标：** 一键切换古风仙侠/现代都市/西方奇幻/轻小说等 10 种预设风格。

**当前差距：** StyleCard 有基本字段但无预设系统。

**改动：**
- [ ] `src/core/templates/styles.ts` — 扩充为 10 种预设，每种包含 12 维度默认值
- [ ] `src/components/editor/StyleEditor.tsx` — 增加预设选择器 + 一键应用
- [ ] `src/app/api/projects/[id]/style/route.ts` — API 支持预设应用

**文件：** styles.ts, StyleEditor.tsx, style API

### 8.2 5 种大纲模板

**目标：** 一键生成三幕式/起承转合/英雄之旅/章回体/自由结构大纲。

**当前差距：** 无模板系统。

**改动：**
- [ ] `src/core/templates/outlines.ts` — 5 种模板定义
- [ ] `src/components/workspace/OutlineDialog.tsx` — 增加模板选择器 + AI 生成弹窗
- [ ] `src/app/api/generate/outline/route.ts` — 支持模板参数

**文件：** outlines.ts, OutlineDialog.tsx, outline API

### 8.3 游戏模式

**目标：** 轮次制互动写作——AI 写 500-800 字→停住→4 个选项→玩家选→继续。

**当前差距：** 完全未实现。

**改动：**
- [ ] `prisma/schema.prisma` — 新增 `GameSession` 表
- [ ] `src/core/game/game-engine.ts` — 回合循环 + 实体追踪 + 选项生成
- [ ] `src/app/api/generate/game/route.ts` — POST API，SSE 流式
- [ ] `src/components/workspace/GamePanel.tsx` — 游戏界面（叙事区 + 选项面板 + 侧边状态栏）
- [ ] `src/app/workspace/[projectId]/game/page.tsx` — 新路由

**文件：** 4 个新文件 + 1 路由 + 1 Schema 修改

---

## 阶段九：基础设施（🟢 锦上添花，第7-8周）

### 9.1 三层自动保存
### 9.2 SSE 断线续传
### 9.3 导出增强（EPUB/OPML/JSON）
### 9.4 TTS 语音朗读
### 9.5 导入与拆书

（细节在 ROADMAP 中已有，此处不再展开）

---

## 实施顺序总览

```
第1周 ─ 阶段四：记忆系统升级
        ├─ 4.1 三层记忆注入（S/A/B 分级）
        ├─ 4.2 待兑现事项追踪
        └─ 4.3 时间线感知过滤

第2周 ─ 阶段五：蒸馏引擎本地化
        ├─ 5.1 蒸馏不调 LLM（命名模式库 + 归属推断）
        ├─ 5.2 伏笔自动检测
        └─ 5.3 数据反哺（自动创建实体）

第3周 ─ 阶段六：写作质量实时检测
        ├─ 6.1 实时规则检测（每 200 token）
        └─ 6.2 六维质量矩阵自动评分

第4周 ─ 阶段七：UI 增强
        ├─ 7.1 实体追踪面板
        ├─ 7.2 统计面板
        └─ 7.3 AI 对话面板

第5-6周 ─ 阶段八：新功能
        ├─ 8.1 10 种文风预设
        ├─ 8.2 5 种大纲模板
        └─ 8.3 游戏模式

第7-8周 ─ 阶段九：基础设施
        └─ 自动保存 / 断线续传 / 导出 / TTS / 导入拆书
```

---

## 数据库变更汇总

| 阶段 | 新表 | 修改表 |
|------|------|--------|
| 四 | StoryRecap, PendingItem | — |
| 五 | — | ChapterSummary, StoryNode（蒸馏字段） |
| 八 | GameSession | — |
| 九 | — | Project（导出格式字段） |

---

## 风险点

1. **蒸馏本地化（5.1）** — 最大的架构变更。命名模式库的正则需要反复调试，归属推断准确率初期可能只有 70-80%，需要逐步迭代。不能一次性替换 LLM 蒸馏，要双轨并行（LLM 结果 vs 本地结果对比验证）。
2. **游戏模式（8.3）** — 上下文会越来越长（每回合累积），需要独立的内存管理策略。前期可限制最大回合数（如 10 回合 = 5000-8000 字）。
3. **实时规则检测（6.1）** — 每 200 token 做一次扫描可能会增加生成延迟。需要确保扫描耗时 <10ms。
4. **Prisma 迁移** — 每次加表都要 `prisma migrate dev`，确保数据库可回滚。
