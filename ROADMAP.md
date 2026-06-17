# Novel Forge 改造路线图

> 基于 aixiaoshuojia.cn 逆向分析的增量改造计划
> 2026-06-17 制定

---

## 总策略

**不改架构，只加模块。** 现有 4-Agent 管线（架构师→主笔→审校→摘要）保持不变，往里面插新的处理阶段。

每个改造项标注：
- 🔴 核心差距——不改就缺一条腿
- 🟡 重要增强——显著提升质量
- 🟢 锦上添花——有了更好

---

## 阶段一：上下文记忆升级（🔴 核心）

### 1.1 蒸馏/Segmentation 系统

**现状：** ChapterSummary 只有一个 summary + keyEvents，AI 自己打分 impactScore。

**目标：** 参考 `03-distillation-system.md`，建立 S/A/B/C 四级事件重要性评分。

**改动：**
- [ ] `prisma/schema.prisma` — ChapterSummary 增加 `eventImportances: Json` 字段（S×5, A×15, B×30, C×50 四层事件列表）
- [ ] `src/core/agents/orchestrator.ts` — summarizeChapter() 返回结构增加 eventImportances
- [ ] `src/core/assembly/engine.ts` — 记忆注入层从 3 层改为 4 层：S(3-5条完整事件) → A(10-15条压缩) → B(关键词索引) → C(不注入)
- [ ] `src/app/api/generate/summarize/` — 摘要 API 返回增加分层事件

**效果：** AI 不再需要从摘要里猜哪些重要——重要事件直接以 `[S-1]` `[A-3]` 标签注入 prompt。

### 1.2 伏笔/承诺追踪系统

**现状：** 没有伏笔追踪机制。只有 Storyline 的七要素。

**目标：** 参考 `09-pending-commitments.md`，实现 5 状态机。

**改动：**
- [ ] `prisma/schema.prisma` — 新增 `PendingCommitment` 表（id, projectId, description, status 五状态, createdChapterId, detectedChapterId, fulfilledChapterId, voidedChapterId, closureConditions, statusHistory: Json, entityId, entityType, fulfillmentRatio）
- [ ] `src/core/agents/commitment-tracker.ts` — 新文件，承诺检测+状态推进逻辑
- [ ] `src/core/agents/orchestrator.ts` — reviewContent() 增加承诺一致性检查维度
- [ ] `src/app/api/generate/apply-updates/` — 写后处理中增加承诺检测步骤（现有步骤：eventExtraction → breakthroughDetection → 现在加 commitmentCheck）

**状态机：**
```
pending → detected → partially_fulfilled → fulfilled
                                          → voided (超时或不可能完成)
```

### 1.3 规则冲突裁决引擎

**现状：** Rule model 有 priority 字段但无冲突检测。`injectRules()` 只是拼接，不裁决。

**目标：** 参考 `11-rules-engine-specificity.md`，实现 3 阶段冲突裁决。

**改动：**
- [ ] `prisma/schema.prisma` — Rule 增加 `specificityScore: Int`、`scopeType`（global/volume/chapter_range/event_type/character_scene/conditional）、`scopeConfig: Json`
- [ ] `src/core/rules.ts` — 增加 `detectConflicts()` 和 `resolveConflicts()` 函数
- [ ] 裁决逻辑：优先级→特异性（global 1分 vs conditional 6分）→创建时间

---

## 阶段二：写作质量闭环（🔴 核心）

### 2.1 废词/句式检测引擎升级

**现状：** `forbidden-checker.ts` 只做简单字符串匹配。

**目标：** 增加正则模式匹配、句式检测（"不是…而是…""让/令/使"）、身体模板检测、按 500 字计算模糊词密度。

**改动：**
- [ ] `src/lib/forbidden-checker.ts` — 重构为 5 类检测器：
  1. 精确禁用词（直接 indexOf，现有逻辑）
  2. 句式模式（正则：`/不是.{1,20}而是/`、`/让.{1,10}(感到|觉得|想起)/`）
  3. 身体模板（正则：`/瞳孔.*一缩|身体.*一僵|呼吸.*一滞/`）
  4. 模糊词密度（统计"似乎/也许/大概/仿佛"每 500 字）
  5. AI 高频特征词（"至关重要""深入探讨""充满活力"等）
- [ ] 输出格式统一为 `ForbiddenReport { category, matches[], densityScore }`
- [ ] SSE review_result 事件中附带 forbiddenReport

### 2.2 后处理流水线标准化

**现状：** 生成后只有 summarize + card-update，处理步骤散落在各个 API 路由里。

**目标：** 参考 `14-postprocessing-pipeline.md`，建立标准化 8 步后处理。

**改动：**
- [ ] `src/core/pipeline/postprocessor.ts` — 新文件，Pipeline 类
- [ ] 8 步流水线：
  1. textPolish（润色——去 AI 味）
  2. eventExtraction（事件提取）
  3. breakthroughDetection（突破检测）
  4. eventClassification（S/A/B/C 分类）
  5. commitmentCheck（承诺检测）
  6. characterArchive（角色状态归档）
  7. distillation（3 层摘要生成）
  8. foreshadowLink（伏笔关联）
- [ ] `src/app/api/generate/write/route.ts` — 生成完成后走流水线

### 2.3 审校维度扩展

**现状：** 审校只有 OOC/逻辑/世界观/时间线/跨章矛盾 5 个维度。

**目标：** 增加废词检测、情感一致性、节奏分析。

**改动：**
- [ ] `src/core/agents/orchestrator.ts` — SYSTEM_PROMPTS.reviewer 增加检查维度
- [ ] 审校结果 ReviewIssue 增加 `category: "forbidden_word" | "emotion_consistency" | "pacing"`

---

## 阶段三：新功能——游戏模式（🔴 核心）

### 3.1 交互式文本冒险

**现状：** 只有线性生成模式。

**目标：** 参考 `16-game-mode.md`，新增轮次制互动写作。

**改动：**
- [ ] `prisma/schema.prisma` — 新增 `GameSession` 表（id, projectId, currentNodeId, roundNumber, totalWords, inventory: Json, entityStates: Json, isAutoComplete, isDecompose, createdAt, updatedAt）
- [ ] `src/core/game/game-engine.ts` — 新文件，回合循环逻辑
- [ ] `src/app/api/generate/game/route.ts` — POST API，SSE 流式
- [ ] `src/components/workspace/GamePanel.tsx` — 新组件，游戏界面
  1. 每回合 AI 写出 500-800 字场景 + 停在关键时刻
  2. 生成 4 个选项（对应不同策略维度）
  3. 玩家选择或自定义输入
  4. 系统追踪实体状态 `NE|角色名|状态|位置`
  5. 3 个开关：自动完结 / 分解标注 / 本地模型
- [ ] `src/app/workspace/[projectId]/game/page.tsx` — 新路由

### 3.2 实体追踪（NER）

**现状：** 没有前端 NER。

**目标：** 参考 `13-writing-quality-standards.md`，实现 AC 自动机检测专有名词。

**改动：**
- [ ] `src/lib/ner-detector.ts` — 新文件，AC 自动机实现
- [ ] `src/components/editor/EntityDetector.tsx` — 已有文件，增强为实时标注
- [ ] 支持实体类型：角色名、地点、物品、功法、势力

---

## 阶段四：UI/UX 增强（🟡 重要）

### 4.1 文笔风格面板升级

**现状：** StyleEditor 有量化指标但交互简单。

**目标：** 参考 `18-ui-writing-style.md`，增加 12 维度滑块 + 预览。

**改动：**
- [ ] `src/components/editor/StyleEditor.tsx` — 重构：
  1. 12 个维度滑块（词汇丰富度/句子长度/描写密度/对话比例/修辞手法/节奏速度/心理描写/环境描写/口语化/幽默感/血腥暴力/情色暧昧）
  2. 实时预览文本框
  3. 对比模式（左右分栏）
  4. 10 种预设风格库（古风仙侠/现代都市/西方奇幻/轻小说/悬疑惊悚/热血战斗/文艺抒情/幽默搞笑/极简留白/厚重史诗）
- [ ] `src/core/templates/styles.ts` — 扩充预设定义，每个风格包含 12 维度的默认值

### 4.2 大纲模板系统

**现状：** OutlineDialog 只支持自由结构和自定义章节数。

**目标：** 参考 `20-ui-outline-editor.md`，增加 5 种结构模板。

**改动：**
- [ ] `src/components/workspace/OutlineDialog.tsx` — 增加模板选择器
  1. 三幕式（建置25%→对抗50%→结局25%）
  2. 起承转合（4 段式）
  3. 英雄之旅（12 阶段）
  4. 章回体（传统对仗标题）
  5. 自由结构（现有逻辑）
- [ ] `src/core/templates/outlines.ts` — 新文件，模板定义

### 4.3 AI 面板 Tab 化（右下角）

**现状：** 右侧面板只有上下文监控。

**目标：** 增加 AI 助手对话面板（类似 aixiaoshuojia.cn 的 AI 助手 Tab）。

**改动：**
- [ ] `src/components/workspace/RightPanel.tsx` — 增加 Tab 切换：上下文监控 / AI 对话
- [ ] `src/components/workspace/AIChatPanel.tsx` — 新组件，对话式 AI 交互
  1. 消息列表（用户/AI 气泡）
  2. 输入框 + 发送
  3. 预设问题模板（"帮我梳理角色关系""检查本章节奏""生成下一章大纲"）

### 4.4 统计面板增强

**现状：** 右侧面板底部有基础统计。

**目标：** 增加可视化图表。

**改动：**
- [ ] `src/components/workspace/StatsPanel.tsx` — 新组件
  1. 写作进度环形图
  2. 章节字数柱状图
  3. 角色出场频率排行
  4. 情感曲线（基于章末氛围字段）

---

## 阶段五：基础设施（🟡 重要）

### 5.1 3 层自动保存

**现状：** 作者指令 1.5s 防抖保存，正文需手动存。

**目标：** LocalStorage 500ms → Server 3s → 手动 Ctrl+S。

**改动：**
- [ ] `src/lib/auto-save.ts` — 新文件，自动保存管理器
- [ ] LocalStorage 层：500ms 防抖写入 localStorage，断电不丢
- [ ] Server 层：3s 防抖 PATCH API，跨设备同步
- [ ] 状态指示器：💾 已保存 / 🔄 保存中 / ⚠️ 未保存

### 5.2 SSE 断线续传

**现状：** 生成中断只能重来。

**目标：** Redis 缓存 30min + resume API。

**改动：**
- [ ] `src/lib/redis.ts` — 新文件，Redis 客户端
- [ ] `src/app/api/generate/resume/route.ts` — GET API，从 Redis 取缓存的生成结果
- [ ] `src/app/api/generate/write/route.ts` — 每 token 同步写 Redis
- [ ] 前端 `streamSSE()` — 增加断线自动重连逻辑

### 5.3 TTS 语音朗读

**现状：** 无。

**目标：** 参考 `17-complete-ui-inventory.md`，多音色朗读。

**改动：**
- [ ] `src/components/workspace/TTSPlayer.tsx` — 新组件
  1. 音色选择器（20+ 音色，5 分类：标准普通话/方言/古风/日系/特殊）
  2. 语速控制
  3. 段落级朗读
  4. Web Speech API 或 Edge TTS

### 5.4 导出增强

**现状：** 只支持 Markdown/TXT。

**目标：** 增加 OPML/JSON/EPUB。

**改动：**
- [ ] `src/app/api/projects/[id]/export/route.ts` — 增加 format 参数
- [ ] OPML 格式（大纲树结构，用于导入其他大纲工具）
- [ ] JSON 格式（完整结构化导出，可用于备份）
- [ ] EPUB 格式（使用 epub-gen 库）

---

## 阶段六：锦上添花（🟢）

### 6.1 关系图可视化

- [ ] 角色关系力导向图（D3.js / vis-network）
- [ ] 故事线时间轴视图
- [ ] 世界观词条关联图

### 6.2 暗色/亮色主题切换

### 6.3 快捷键系统

- [ ] Ctrl+Enter 生成
- [ ] Ctrl+S 手动保存
- [ ] Ctrl+Shift+F 全局搜索（章节/角色/词条）

### 6.4 导入增强

- [ ] OPML 导入
- [ ] 整本小说导入自动拆章

---

## 实施顺序建议

```
第1周：1.1 蒸馏系统 + 1.3 规则冲突引擎
        ↓
第2周：1.2 伏笔追踪 + 2.1 废词检测升级
        ↓
第3周：2.2 后处理流水线 + 2.3 审校扩展
        ↓
第4周：3.1 游戏模式（最大新功能）
        ↓
第5周：4.1 文笔面板 + 4.2 大纲模板
        ↓
第6周：4.3 AI 对话面板 + 4.4 统计面板
        ↓
第7周：5.1 自动保存 + 5.2 SSE 断线续传
        ↓
第8周：5.3 TTS + 5.4 导出增强
        ↓
后续：阶段六锦上添花
```

---

## 数据库迁移汇总

需要新增的表：
1. `PendingCommitment` — 伏笔/承诺追踪
2. `GameSession` — 游戏会话

需要修改的表：
1. `ChapterSummary` — 增加 `eventImportances: Json`
2. `Rule` — 增加 `specificityScore: Int`, `scopeType: String`, `scopeConfig: Json`

---

## 新增文件清单

```
src/core/
├── agents/
│   ├── orchestrator.ts     (修改)
│   └── commitment-tracker.ts (新增)
├── assembly/
│   └── engine.ts           (修改)
├── game/
│   └── game-engine.ts      (新增)
├── pipeline/
│   └── postprocessor.ts    (新增)
├── rules.ts                (大幅修改)
├── templates/
│   ├── outlines.ts         (新增)
│   └── styles.ts           (修改)
└── types/
    └── index.ts            (修改)

src/lib/
├── auto-save.ts            (新增)
├── forbidden-checker.ts   (大幅修改)
├── ner-detector.ts         (新增)
└── redis.ts                (新增)

src/app/api/generate/
├── game/route.ts           (新增)
└── resume/route.ts         (新增)

src/components/
├── workspace/
│   ├── AIChatPanel.tsx     (新增)
│   ├── GamePanel.tsx       (新增)
│   ├── StatsPanel.tsx      (新增)
│   ├── TTSPlayer.tsx       (新增)
│   ├── RightPanel.tsx      (修改)
│   └── OutlineDialog.tsx   (修改)
└── editor/
    ├── StyleEditor.tsx     (修改)
    └── EntityDetector.tsx  (修改)

src/app/workspace/[projectId]/
└── game/
    └── page.tsx            (新增)
```

---

## 风险点

1. **Prisma 迁移** — 务必先在开发分支操作，`prisma migrate dev` 会自动生成迁移 SQL
2. **SSE 协议兼容** — 现有前端 `streamSSE()` 只处理 `token/done/error/review_result`，新增事件类型要确保前端能解析
3. **游戏模式的上下文管理** — 轮次制意味着上下文会越来越长，需要独立的内存管理策略
4. **Redis 依赖** — SSE 断线续传需要 Redis，如果用户不想装就降级为内存缓存
