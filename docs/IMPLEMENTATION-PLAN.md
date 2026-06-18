# Novel Forge 实施计划（整合版）

> 基于 `docs/architecture-reference/A-J` 全部功能域 + 现有项目实现状态对照
> 制定日期：2026-06-17  |  最后更新：2026-06-17
> 原则：已有功能用目标架构思路优化内核/步骤/进程，没有的功能完整加入。可以大改，每步独立可上线。

---

## 当前状态速览（v0.20.1）

已完成：
- ✅ 4-Agent 管线 + 共享 pipeline 模块（消除 60% 重复代码）
- ✅ 禁用词 v2.0（正则+三级严重度 error/warning/info）
- ✅ 审校 9 维（OOC/逻辑/世界观/时间线/跨章矛盾/节奏/对话质量/描写密度/情绪一致性）
- ✅ 规则冲突三阶段裁决（Priority → Specificity → Timestamp）
- ✅ 蒸馏 S/A/B/C 四级事件评分（scoreAndClassifyEvents）
- ✅ 伏笔五状态机模型（PendingCommitment 表已建）
- ✅ 多提供商 LLM 动态配置（AppSettings 表 → 全局透传）
- ✅ SSE 流式生成 + 每 300 字草稿自动保存
- ✅ 后处理管线（扫描 → 审校 → 摘要）

---

## 功能域差距总览

| 功能域 | 文档 | 核心差距 |
|--------|------|---------|
| 蒸馏引擎 | D | 蒸馏调 LLM 而非本地程序（最大 Token 浪费点）、命名模式库/归属推断/消歧全无、伏笔自动检测逻辑未实现 |
| 实时检测 | E | 规则检测是生成后一次性、六维质量矩阵无自动量化、10 种文风预设无 |
| 记忆系统 | C | 三层记忆无显式分级、无待兑现事项追踪、无时间线感知过滤、无 Token 优化、无长效衰减 |
| Agent 层 | H | 整个 Agent 工具层不存在（直接用 API 路由，无工具调度/意图解析/并行优化/提示词分层） |
| UI | F | 实体追踪面板/统计面板/AI对话面板全无 |
| 游戏模式 | I | 完全未实现 |
| 导入拆书 | J | 整本小说导入/章边界检测全无 |

---

## 阶段一：蒸馏内核替换（🔴 P0 — 每次写章都在烧钱）

> 覆盖 D 文档。现有 `src/core/distillation/` 的 S/A/B/C 四级评分逻辑保留，把 LLM summarize 调用替换为本地程序。

### 1.1 蒸馏不调 LLM——命名模式库 + 四遍扫描

**改动：**
- [ ] `src/lib/entity-detector.ts` — **[新]** 命名模式库 + 排除词库：
  - 丹药：`/[一二三四五六七八九十]品[一-鿿]{2,4}丹/` + 无品级丹药匹配
  - 法宝：`/[一-鿿]{1,3}(?:剑|刀|镜|鼎|塔|印|旗|幡|珠|环|镯|簪)/`
  - 功法：`/[一-鿿]{2,6}(?:诀|经|典|功|法|术|引|咒|拳|掌|指|腿)/`
  - 地点：`/[一-鿿]{2,4}(?:山脉|山谷|峡谷|城|镇|村|宗|门|派|殿|阁|洞|府|宫)/`
  - 材料：`/[一-鿿]{2,4}(?:草|花|果|叶|根|藤|石|木|玉|晶|矿|铁|铜)/`
  - 排除词库：身体部位（拳头/手掌/手臂/膝盖/脚掌）、普通名词（桌子/椅子/茶杯/纸张/书本）、抽象名词（办法/想法/手法）
  - 归属推断三层策略：属格匹配"XX的XX"（0.95）/ 动词前置"XX从储物袋取出XX"（0.85）/ 段落主人推断（0.6，标记待确认）
- [ ] `src/lib/distillation-runner.ts` — **[新]** 四遍扫描流程：
  - 第一遍：实体识别（正则 + 已知实体词典 + 新实体检测）
  - 第二遍：状态变化检测（生成前快照 vs 生成后文本）
  - 第三遍：伏笔模式匹配（埋设/回收信号关键词词典）
  - 第四遍：一致性校验（名字写错/修为写错/关系写错）
- [ ] `src/core/pipeline/post-processor.ts` — **[改]** `runPostGenerationPipeline` 接入本地蒸馏引擎替代 LLM summarize。LLM summarize 降级为可选增强（用户可手动开启以获取更准确的摘要）

**文件：** 新增 `entity-detector.ts` + `distillation-runner.ts`，修改 `post-processor.ts`

**验证方式：** 双轨并行——LLM 结果 vs 本地结果对比。本地准确率 ≥ 90% 后切换。先跑两周对比数据再决定是否完全替换。

### 1.2 伏笔自动检测

现有 `PendingCommitment` 五状态机模型已建，补自动检测逻辑。

**改动：**
- [ ] `src/lib/distillation-runner.ts` — **[改]** 增加伏笔检测逻辑：
  - 埋设信号词库 → 自动创建新伏笔（status: "detected"）
  - 回收信号词库 → 标记为 fulfilled
  - 深化判定 → 关键词再次出现但无回收信号 → partially_fulfilled
- [ ] `src/core/pipeline/post-processor.ts` — **[改]** 蒸馏完成后自动更新 PendingCommitment 状态 + 通过 SSE 推送 `foreshadow_update` 事件通知前端

**文件：** 修改 `distillation-runner.ts` + `post-processor.ts`

### 1.3 数据反哺——自动创建实体

现有 `handleNewCharacters` 已创建角色，扩展为物品/地点/势力全自动创建。

**改动：**
- [ ] `src/lib/distillation-runner.ts` — **[改]** 新实体检测后自动调用 Prisma 创建：
  - 新角色 → `CharacterCard.create({ status: "pending_review" })`
  - 新物品 → `Item.create({ status: "pending_review" })`（需要独立的 Item 模型）
  - 新地点 → `LorebookEntry.create({ category: "geography" })`
  - 新势力 → `LorebookEntry.create({ category: "faction" })`
- [ ] `prisma/schema.prisma` — **[改]** 新增 `Item` 模型（目前物品混在世界书中，需独立）
- [ ] `src/app/api/generate/apply-updates/route.ts` — **[改]** 增加实体确认/拒绝 API：POST 接受 / DELETE 拒绝

**文件：** 修改 `distillation-runner.ts` + `apply-updates/route.ts` + `schema.prisma`

**阶段一完工效果：** Token 消耗降低 50%+，蒸馏耗时从 3-5 秒降到 <1 秒，伏笔自动追踪，实体自动入库待确认。

---

## 阶段二：实时质量拦截（🔴 P0 — 30 行改动，体验提升巨大）

> 覆盖 E 文档实时检测 + 六维质量矩阵。不改架构，只在已有 SSE 流和 post-processor 中加逻辑。

### 2.1 实时规则检测（每 200 token SSE 推送）

现有 `forbidden-checker` 在 post-processor 中一次性跑——改到 `writeSection()` 中每 200 token 即时拦截。

**改动：**
- [ ] `src/core/agents/orchestrator.ts` — **[改]** `writeSection()` 增加：
  - token 计数器累加 chunk 长度
  - 触发阈值 = 200 token
  - 调用 `scanForbiddenWords(accumulatedText, forbiddenPatterns)`
  - 违规通过 SSE 即时推送 `rule_violation` 事件
  - 重置计数器
- [ ] `src/app/api/generate/write/route.ts` — **[改]** SSE 增加 `rule_violation` 事件类型
- [ ] 前端 `streamSSE()` — **[改]** 处理 `rule_violation` 事件（写作面板中标记违规文字）

**文件：** 修改 `orchestrator.ts` + `write/route.ts` + 前端 SSE hook

**性能要求：** 扫描耗时 <10ms。`forbidden-checker` 已有正则引擎可直接复用。

### 2.2 六维质量矩阵自动评分

审校 9 维已有 4 维（逻辑/一致性/节奏/对话质量），补剩余维度的自动量化。

**改动：**
- [ ] `src/lib/quality-analyzer.ts` — **[新]** 六个量化维度纯本地算法：
  1. 废词率 = 禁用词出现次数 / 总字数（阈值 > 3% = 警告）
  2. 展示vs讲述比 = 动作+环境描写字数 / 直接叙述字数（阈值 < 30% = 警告）
  3. 视角一致性 = PoV 跳变次数 / 总段落数（阈值 > 0 = 警告）
  4. 句式多样性 = 连续相同句式开头的段落数（阈值 ≥ 3 = 警告）
  5. 对话自然度 = 连续 A→B→A 对话轮数（阈值 ≥ 5 = 警告）
  6. 主语多样性 = 连续相同主语开头的句子数（阈值 ≥ 3 = 警告）
- [ ] `src/core/pipeline/post-processor.ts` — **[改]** 后处理增加 `quality_score` 步骤，通过 SSE 推送 `quality_score` 事件
- [ ] `prisma/schema.prisma` — **[改]** `StoryNode` 加 `qualityScore` Float 字段

**文件：** 新增 `quality-analyzer.ts`，修改 `post-processor.ts` + `schema.prisma`

**阶段二完工效果：** 写到禁用词当场标红不等写完，正文完成自动出六维质量报告。

---

## 阶段三：记忆系统升级（🟡 P1 — 修 bug + 用户感知强）

> 覆盖 C 文档全部功能。单文件改动多，架构不变。

### 3.1 时间线感知过滤（修跳章 bug）

现有 `previousNodes` 按 `order` 过滤但无显式跳章保护——如果第 10 章已写好（角色突破到金丹期），写第 7 章时可能错误注入金丹期状态。

**改动：**
- [ ] `src/core/pipeline/context-loader.ts` — **[改]** `loadGenerationContext` 增加 `chapterOrder` 参数：
  - 角色状态：只取 `timeline` 中 `chapter ≤ currentOrder` 的条目
  - 事件：只取 `events` 中 `chapterIndex ≤ currentOrder` 的条目
  - 伏笔：只取 `plantChapter ≤ currentOrder` 的伏笔
  - 物品归属：只取第 1 章到第 N-1 章之间的归属变化

**文件：** 单文件改动 `context-loader.ts`，约 50 行

### 3.2 待兑现事项追踪

用户说"下次让李尘去那个秘境"→ 系统自动记住 → 下次写正文时注入提醒。

**改动：**
- [ ] `prisma/schema.prisma` — **[改]** 新增 `PendingItem` 表：
  ```prisma
  model PendingItem {
    id              String    @id @default(cuid())
    projectId       String
    itemType        String    // foreshadow_recovery / character_arc / plot_turn / user_note
    content         String    @db.Text
    priority        String    @default("medium") // high / medium / low
    status          String    @default("pending") // pending / fulfilled / discarded
    source          String    // user / distillation / outline
    deadlineChapter Int?
    createdAt       DateTime  @default(now())
    fulfilledAt     DateTime?
  }
  ```
- [ ] `src/app/api/pending-items/route.ts` — **[新]** CRUD API（GET/POST/PUT/DELETE）
- [ ] `src/core/pipeline/post-processor.ts` — **[改]** 正文采纳后扫描"下次""之后""等下次""回头""以后"关键词 → 自动创建 PendingItem（`source: "distillation"`）
- [ ] `src/core/pipeline/context-loader.ts` — **[改]** 写前加载未兑现待办项：高优先级 → S 级注入 / 中 → A 级 / 低 → B 级

**文件：** 新增 1 个 API + 修改 2 个 pipeline 文件 + Schema

### 3.3 S/A/B 三级记忆注入 + Token 优化

**改动：**
- [ ] `prisma/schema.prisma` — **[改]** 新增 `StoryRecap` 表（分层故事回顾：ultra_short/short/medium/long）
- [ ] `src/core/assembly/engine.ts` — **[改]** `assemblePrompt` 改为 S/A/B 三级注入 + 五种 Token 优化策略：
  - S 级（≤5 条）：当前章大纲直接关联的事件和伏笔，全量注入
  - A 级（≤10 条）：最近 3-5 章关键事件，按重要性排序截断
  - B 级（≤20 条）：世界观/势力/地点背景，按触发词相关性筛选。低优先级超出上限则丢弃
  - 策略1 — JSON 结构化注入（省 ~40%）
  - 策略2 — 选择性字段注入（省 ~30%）
  - 策略3 — 增量去重注入（省 ~20%）
  - 策略4 — 引用压缩（省 ~15%）
  - 策略5 — 分层优先级截断（省 ~50%，已在分级中体现）
- [ ] `src/core/pipeline/context-loader.ts` — **[改]** `loadMemoryInjection` 输出改为 JSON 结构

**文件：** 修改 `assembly/engine.ts` + `context-loader.ts` + `schema.prisma`

**综合效果：** 100 章小说，Token 总消耗降低约 68%。

### 3.4 长效记忆衰减

**改动：**
- [ ] `src/lib/memory-decay.ts` — **[新]** 定时清理逻辑：
  - S 级（核心）：永久保留，全文注入
  - A 级（重要）：保留最近 30 章
  - B 级（一般）：保留最近 15 章，超期标记为 `archived`
  - C 级（背景）：保留最近 5 章，超期自动删除
- [ ] `src/app/api/cron/decay-memory/route.ts` — **[新]** 触发端点（可被 Vercel Cron 或手动调用）

**文件：** 新增 `memory-decay.ts` + cron 路由

**阶段三完工效果：** 跳章不乱入、待办不遗忘、Prompt 不膨胀、过期数据自动清理。

---

## 阶段四：Agent 工具层（🟡 P1 — 架构从手工编排升级到智能调度）

> 覆盖 H 文档完整 Agent 层。当前 4-Agent 管线通过 `orchestrator.ts` 手工编排，API 路由直调。目标：Agent 通过工具注册中心 + 依赖图调度器自动编排。
>
> **双轨策略：** 现有 API 路由继续工作不受影响，Agent 层通过 AI 对话面板（阶段五 5.3）逐步接管。不搞大爆炸式替换。

### 4.1 工具注册 + 依赖图调度

**改动：**
- [ ] `src/core/agent/tool-registry.ts` — **[新]** 工具注册中心：
  - 每个工具定义：`name, description, parameters (JSON Schema), handler, dependencies`
  - 内置工具清单（映射现有 API 路由功能）：
    ```
    character_query / character_create / character_update
    foreshadow_query / foreshadow_create
    outline_query / outline_update
    worldview_query / worldview_create
    chapter_query / chapter_create / chapter_generate_content
    faction_query / geo_map_query
    ```
  - 依赖声明：`chapter_generate_content → depends_on [character_query, foreshadow_query, outline_query, worldview_query]`
- [ ] `src/core/agent/tool-scheduler.ts` — **[新]** 依赖图调度引擎：
  - 阶段1：并行执行所有无依赖的只读查询
  - 阶段2：串行执行有依赖关系的工具
  - 错误处理：必需工具失败 → 整体失败；可选工具失败 → 忽略继续

**文件：** 新增 `tool-registry.ts` + `tool-scheduler.ts`

### 4.2 意图解析

**改动：**
- [ ] `src/core/agent/intent-parser.ts` — **[新]** 关键词 → 工具映射：
  ```
  "分析" → [chapter_content_query, character_query, foreshadow_query, plot_line_query]
  "写"   → [chapter_generate_content]
  "修改" → [character_update, outline_update, chapter_update]
  "查询" → [character_query, foreshadow_query, outline_query]
  "创建" → [character_create, faction_create, item_create]
  ```
- [ ] `src/core/agent/agent-router.ts` — **[新]** Agent 请求入口：接收自然语言 → 意图解析 → 工具调度 → 结果汇总 → 自然语言回复

**文件：** 新增 `intent-parser.ts` + `agent-router.ts`

### 4.3 提示词分层结构

**改动：**
- [ ] `src/core/agent/layered-prompt.ts` — **[新]** 五层提示词：
  - 第1层：身份定义（语气最正式）
  - 第2层：硬规则（★★★ 标记，命令式：必须/禁止/严禁）
  - 第3层：中等规则（★ 标记，建议式：建议/可以/优先）
  - 第4层：动态上下文（当前项目名称、当前编辑章节）
  - 第5层：工具说明（JSON Schema 格式）
- [ ] `src/core/pipeline/system-prompts.ts` — **[改]** 现有硬规则逐步迁移到分层结构

**文件：** 新增 `layered-prompt.ts`，修改 `system-prompts.ts`

### 4.4 对话历史压缩

**改动：**
- [ ] `src/lib/conversation-compressor.ts` — **[新]** 三层压缩：
  - 自然淘汰：对话超过 8000 token，早期对话自然挤出
  - 主动压缩：超过 6000 token → 调用一次 summarize 压缩早期对话为 200-300 token 摘要
  - 极端压缩：只保留最近 3 轮完整对话 + 之前全部内容的摘要
  - 摘要规则：记录"做了什么"不记录"具体数据"

**文件：** 新增 `conversation-compressor.ts`（约 150 行）

**阶段四完工效果：** Agent 解析自然语言意图 → 自动映射工具 → 并行调度执行 → 长对话自动压缩。AI 对话面板（5.3）作为第一个消费者。

---

## 阶段五：UI 三件套（🟡 P2 — 用户看得见）

> 覆盖 F 文档实体追踪/统计面板/AI对话。

### 5.1 实体追踪面板（编辑器底部）

**改动：**
- [ ] `src/lib/ner-detector.ts` — **[新]** AC 自动机（Aho-Corasick 算法）：
  - 构建已知实体（角色名/别名、物品名、地点名、伏笔关键词）的 Trie 树
  - O(n) 线性扫描正文，一次遍历匹配所有实体
  - 返回实体列表：`[{name, type, position, id}]`
- [ ] `src/components/editor/EntityTracker.tsx` — **[新]** 5 Tab 面板：
  - 角色 Tab（蓝）| 势力 Tab（红）| 场景 Tab（绿）| 伏笔 Tab（橙）| 物品 Tab（紫）
  - hover 弹出详情卡片（LRU 缓存）
- [ ] 正文编辑器 — **[改]** 实体关键词按类型着色（CSS 颜色编码）

**文件：** 新增 `ner-detector.ts` + `EntityTracker.tsx`

### 5.2 统计面板（右侧栏新 Tab）

**改动：**
- [ ] `src/components/workspace/StatsPanel.tsx` — **[新]**：
  - 写作进度环形图（已完成章数 / 目标章数）
  - 章节字数柱状图（用 recharts 库）
  - 角色出场频率排行（从 `ChapterSummary.charactersInvolved` 统计）
  - 情感曲线折线图（基于 `closingSnapshot` 情绪标签）

**文件：** 新增 `StatsPanel.tsx`，修改 `RightPanel.tsx`（增加 Tab）

### 5.3 AI 对话面板（右侧栏新 Tab）

Agent 层（阶段四）的第一个消费者。

**改动：**
- [ ] `src/components/workspace/AIChatPanel.tsx` — **[新]** 对话式交互：
  - 消息列表（用户右侧气泡，AI 左侧气泡）
  - 输入框 + 发送按钮
  - 预设问题模板："梳理本章角色关系""检查本章节奏""生成下一章大纲建议""分析本章与大纲的吻合度"
- [ ] `src/app/api/chat/route.ts` — **[新]** 通用对话 API，接收用户消息 + 当前项目上下文 → 调 Agent 工具层 → 返回结果

**文件：** 新增 `AIChatPanel.tsx` + `chat/route.ts`，修改 `RightPanel.tsx`

**阶段五完工效果：** 编辑器底部实时显示实体、右侧栏可视化作数据 + 对话 AI，写作工作台功能完整。

---

## 阶段六：新功能（🟡 P2 — 创作体验）

> 覆盖 I 文档游戏模式 + E 文档文风预设/大纲模板。

### 6.1 10 种文风预设

现有 `StyleCard` 有基本字段但无预设系统，用户需手动调每个参数。

**改动：**
- [ ] `src/core/templates/styles.ts` — **[扩]** 10 种预设，每种包含 12 维度默认值：
  - 古风仙侠（描-对-动-心=30/20/30/20）、现代都市（15/35/20/30）、西方奇幻（35/20/30/15）
  - 轻小说（10/50/25/15）、悬疑惊悚（30/15/20/35）、热血战斗（15/10/60/15）
  - 文艺抒情（25/15/10/50）、幽默搞笑（10/50/20/20）、极简留白（20/30/20/30）、厚重史诗（40/15/25/20）
- [ ] `src/components/editor/StyleEditor.tsx` — **[改]** 增加预设选择器 + 一键应用按钮
- [ ] `src/app/api/projects/[id]/style/route.ts` — **[改]** API 支持 `applyPreset` 参数

**文件：** 修改 `styles.ts` + `StyleEditor.tsx` + style API

### 6.2 5 种大纲模板

**改动：**
- [ ] `src/core/templates/outlines.ts` — **[新]** 5 种模板定义：
  - 三幕式（建置 25% → 对抗 50% → 结局 25%）
  - 起承转合（4 段式）
  - 英雄之旅（12 阶段）
  - 章回体（传统对仗标题）
  - 自由结构（现有逻辑）
- [ ] `src/components/workspace/OutlineDialog.tsx` — **[改]** 增加模板选择器 + AI 生成弹窗
- [ ] `src/app/api/generate/outline/route.ts` — **[改]** 支持 `template` 参数

**文件：** 新增 `outlines.ts`，修改 `OutlineDialog.tsx` + outline API

### 6.3 游戏模式

轮次制互动写作替代一次性章节生成——AI 写 500-800 字 → 停住 → 4 个选项 → 玩家选择 → 继续。

**改动：**
- [ ] `prisma/schema.prisma` — **[改]** 新增 `GameSession` 表：
  ```prisma
  model GameSession {
    id             String   @id @default(cuid())
    projectId      String
    currentNodeId  String?
    roundNumber    Int      @default(1)
    totalWords     Int      @default(0)
    inventory      Json     @default("{}")
    entityStates   Json     @default("{}")
    isAutoComplete Boolean  @default(false)
    isDecompose    Boolean  @default(false)
    createdAt      DateTime @default(now())
    updatedAt      DateTime @updatedAt
  }
  ```
- [ ] `src/core/game/game-engine.ts` — **[新]** 回合循环 + 四选项生成 + 实体追踪（NE/IE/LE）
- [ ] `src/app/api/generate/game/route.ts` — **[新]** POST API，SSE 流式
- [ ] `src/components/workspace/GamePanel.tsx` — **[新]** 三栏布局：
  - 中间：AI 叙事区（累积正文，流式逐字渲染）
  - 右侧：选项面板（4 个选项按钮 + 自定义输入）
  - 左侧：状态侧栏（角色/物品/地点/伏笔追踪）
- [ ] `src/app/workspace/[projectId]/game/page.tsx` — **[新]** 新路由

**风险：** 上下文越来越长。限制最大 10 回合（≈5000-8000 字），早期回合自动压缩为摘要注入。

**文件：** 4 个新文件 + 1 路由 + 1 Schema 修改

**阶段六完工效果：** 一键切换文风/大纲模板，游戏模式提供全新的互动写作体验。

---

## 阶段七：基础设施 + 导入拆书（🟢 P3 — 锦上添花）

> 覆盖 J 文档导入拆书 + 自动保存/SSE续传/导出/TTS。

### 7.1 三层自动保存

| 层 | 时机 | 存储 |
|----|------|------|
| LocalStorage | 500ms 防抖 | 浏览器本地 |
| Server | 3s 防抖 | PATCH API → 数据库 |
| 手动 | Ctrl+S | 强制写入 |

状态指示器：💾 已保存 / 🔄 保存中 / ⚠️ 未保存

**文件：** `src/components/editor/SaveIndicator.tsx` + `src/app/api/auto-save/route.ts`

### 7.2 SSE 断线续传

- 前端 SSE 断开 → 指数退避重连（1s→2s→4s→8s，最多 3 次）
- 重连时带 `X-Last-Event-Id`，服务端批量补发错过的 token
- 缓存方案：内存缓存 30min（不需要 Redis）

**文件：** `src/app/api/generate/resume/route.ts` + 前端 SSE hook 修改

### 7.3 导出增强

| 格式 | 用途 | 实现 |
|------|------|------|
| Markdown | 已有 | — |
| TXT | 已有 | — |
| EPUB | 电子书阅读器 | `epub-gen` 库 |
| OPML | 大纲树导入其他工具 | 手写 XML 生成器 |
| JSON | 完整结构化备份 | 已有 |

**文件：** `src/lib/exporters/epub.ts` + `src/lib/exporters/opml.ts`

### 7.4 TTS 语音朗读

- 20+ 音色，5 分类（标准普通话/方言/古风/日系/特殊）
- 段落级朗读 + 语速控制
- 技术：Edge TTS（免费，中文音色丰富）

**文件：** `src/lib/tts.ts` + `src/components/editor/TTSPlayer.tsx`

### 7.5 导入与拆书

**改动：**
- [ ] `src/lib/book-importer/preprocessor.ts` — **[新]** 文本提取 + 编码统一 + 分段清理
- [ ] `src/lib/book-importer/chapter-detector.ts` — **[新]** 三层章边界检测：正则标题 → LLM 语义 → 固定字数回退
- [ ] `src/lib/book-importer/chapter-parser.ts` — **[新]** 逐章 LLM 解析（摘要/角色/事件/伏笔）
- [ ] `src/lib/book-importer/cross-chapter-distiller.ts` — **[新]** 全局跨章蒸馏：别名合并 + 时间排序 + 伏笔链构建 + 矛盾检测
- [ ] `src/lib/book-importer/db-writer.ts` — **[新]** 结构化批量入库
- [ ] `src/app/api/import/book/route.ts` — **[新]** 导入入口 API

**文件：** `book-importer/` 目录 5 个新文件 + 1 个 API 路由

---

## 实施顺序总览

```
第1步 ─ 阶段一：蒸馏内核替换（P0 — 省钱）
        ├─ 1.1 命名模式库 + 四遍扫描（替代 LLM summarize）
        ├─ 1.2 伏笔自动检测（埋设/回收/深化信号词库）
        └─ 1.3 数据反哺（物品/地点/势力自动入库）

第2步 ─ 阶段二：实时质量拦截（P0 — 体验）
        ├─ 2.1 每 200 token SSE 推送违规
        └─ 2.2 六维质量矩阵自动评分

第3步 ─ 阶段三：记忆系统升级（P1 — 修bug+感知）
        ├─ 3.1 时间线感知过滤（修跳章 bug）
        ├─ 3.2 待兑现事项追踪
        ├─ 3.3 S/A/B 三级注入 + Token 优化五策略
        └─ 3.4 长效记忆衰减

第4步 ─ 阶段四：Agent 工具层（P1 — 架构升级）
        ├─ 4.1 工具注册 + 依赖图调度
        ├─ 4.2 意图解析（自然语言 → 工具序列）
        ├─ 4.3 提示词分层结构（五层 + ★★★/★）
        └─ 4.4 对话历史压缩

第5步 ─ 阶段五：UI 三件套（P2 — 看得见）
        ├─ 5.1 实体追踪面板（AC 自动机 + 5 Tab）
        ├─ 5.2 统计面板（字数/角色/情感可视化）
        └─ 5.3 AI 对话面板（Agent 层第一个消费者）

第6步 ─ 阶段六：新功能（P2 — 创作体验）
        ├─ 6.1 10 种文风预设
        ├─ 6.2 5 种大纲模板
        └─ 6.3 游戏模式（轮次制互动写作）

第7步 ─ 阶段七：基础设施 + 导入拆书（P3 — 锦上添花）
        └─ 自动保存 / SSE断线续传 / EPUB导出 / TTS朗读 / 整本导入拆书
```

每步独立可上线，不依赖后面的步骤。做完一步验证一步。

---

## 数据库变更汇总

| 阶段 | 新表 | 修改表 |
|------|------|--------|
| 一 | `Item`（物品独立表） | `ChapterSummary`（实体检测结果 JSON 字段） |
| 二 | — | `StoryNode`（`qualityScore` Float + `stateDiffs` Json） |
| 三 | `StoryRecap`, `PendingItem` | `CharacterCard`（timeline 过滤索引） |
| 四 | — | —（Agent 层不新增表，通过工具调度操作现有表） |
| 六 | `GameSession` | — |

**数据迁移注意：**
- 所有新字段设默认值，不影响现有数据
- `prisma migrate dev` 在开发分支操作，确认通过再合并
- 每次迁移保留回滚 SQL

---

## 测试策略

### 单元测试

| 阶段 | 测试重点 | 工具 |
|------|---------|------|
| 一 | 命名模式库正则召回率/准确率、伏笔检测混淆矩阵、归属推断三层策略各自准确率 | Vitest |
| 二 | 违规检测延迟（<10ms）、六维评分与人工评分相关性 | Vitest |
| 三 | 记忆注入分级逻辑、时间线过滤正确性、Token 优化后 Prompt 长度对比 | Vitest |
| 四 | 工具依赖图调度正确性、意图解析映射覆盖率 | Vitest |

### 集成测试

- **蒸馏双轨对比（阶段一）：** 同一批正文过 LLM 蒸馏 vs 本地蒸馏，对比实体提取/事件分级/伏笔检测一致性。本地准确率 ≥ 90% 才切换。
- **SSE 断线续传端到端：** 模拟断网→重连→补发 token
- **游戏模式 10 回合完整流程：** 上下文压缩/实体追踪/选项生成正确性

### 性能基准

| 指标 | 目标 |
|------|------|
| 蒸馏本地化后单章耗时 | < 1 秒（当前 LLM 蒸馏 3-5 秒） |
| 实时规则检测延迟 | < 10ms / 每 200 token |
| Token 总消耗降低 | ≥ 50%（对比当前全量自然语言注入） |
| SSE 断线重连恢复 | < 2 秒 |

---

## 风险点

1. **蒸馏本地化（阶段一）** — 最大的架构变更。命名模式库正则需要反复调试。**不能一次性替换 LLM 蒸馏**——双轨并行，本地准确率 ≥ 90% 再切换。
2. **Agent 工具层（阶段四）** — 架构级变更，影响面大。**双轨策略：** 现有 API 路由继续工作，Agent 层通过 AI 对话面板逐步接管。不做大爆炸式替换。
3. **游戏模式（阶段六）** — 上下文累加膨胀。限制最大 10 回合（≈5000-8000 字），早期回合自动压缩为摘要注入。
4. **Prisma 迁移** — 每次加表前 `prisma migrate dev`，开发分支操作，确保可回滚。迁移前备份数据库。
