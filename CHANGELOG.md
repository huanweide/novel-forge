# Novel Forge 更新公告

---

## v0.19.0 — 2026-06-17

### 🧠 蒸馏系统上线——四级事件分层 + 伏笔追踪基础

**📊 S/A/B/C 四级事件评分引擎**
- 新增 `src/core/distillation/scorer.ts`：时效性×事件类型×伏笔关联×角色重要性 四因子评分
- 自动推断事件类型（突破/死亡/传承/转折/揭露/战斗/日常 8 种）
- S层(≥40分)完整注入、A层(≥20分)压缩注入、B层(≥10分)关键词索引、C层不注入仅存档
- 新增 `formatEventsForPrompt()` 格式化 [S-N]/[A-N] 标签注入

**📦 数据库扩展**
- `ChapterSummary` 新增 `eventImportances` JSON 字段
- 新增 `PendingCommitment` 模型（五状态机：pending→detected→partially_fulfilled→fulfilled/voided）
- 支持 closure_conditions 闭环条件数组 + status_history 完整审计链

**🔄 上下文组装升级**
- `buildMediumTermSection` 读取四级事件分层，差异化注入短期/中期记忆
- `summarizeChapter` 生成后自动评分分层
- summarize API 存储 closingSnapshot/characterImpulses/eventImportances

---

### 🌐 项目化——多模型支持 + 全局设置 + 代码清理

**🌐 多提供商 LLM 层**
- `src/lib/llm.ts` 重写：支持 OpenAI / 硅基流动 / DeepSeek 官方 / Groq / 自定义 OpenAI 兼容
- 配置优先级：数据库 AppSettings > 环境变量 LLM_API_KEY，向后兼容
- 60 秒内存缓存、`testLLMConnection()` 连接验证、`clearLLMCache()` 即时刷新

**⚙️ 全局设置系统**
- Prisma 新增 `AppSettings` 单例模型（llmProvider / llmApiKey / llmModel / llmBaseUrl）
- `GET/PUT /api/settings` + `POST /api/settings/test` 三个端点
- 设置页面 `/settings`：选提供商→填 Key→测试连接→保存，暗色 UI

**🏗 代码清理**
- LLM 调用统一：7 个路由删除本地 callFlash，净减 ~70 行、21 个冗余常量
- 删除 3 个死函数（povLabel/ndLabel/pct）+ 重复注释
- 4 个组件加 AbortController 竞态防护（page.tsx/RulesPanel/StorylineList/PreGenConfirm）
- README.md 完整替换为项目文档

---

## v0.17.0 — 2026-06-14

### 📏 规则中心 + 🧠 记忆压缩 + 🐛 Bug修复

**📏 规则中心——统一创作规则管理**
- Prisma 新增 Rule 模型：name/content/category(enabled/priority/scope) —— 9 字段
- CRUD API 完整：GET/POST /api/rules + GET/PUT/DELETE /api/rules/[id]
- 核心工具函数 `getActiveRules()` + `injectRules()` —— 一处定义，全局注入
- 规则注入 6 大 AI 路由：write/continue/refine/chapter-outline/outline/draw
- 规则按 category 编组后注入 authorNote，以「⚠️ 创作规则——铁律」最高优先级块呈现
- scope 分级：all(全局) / write_only(正文生成) / outline_only(大纲章纲) / review_only(审校)
- 前端 RulesPanel 组件 —— LeftPanel 新增「规则」Tab（第 5 个 Tab）
- 规则创建/编辑/删除/启用禁用的完整交互

**🧠 记忆压缩 MVP——告别「只看最近 3 章」**
- `summarizeChapter` 增强输出：impactScore(1-10)、threadProgress(故事线进度)、unresolvedQuestions(悬念列表)
- StoryBeat 不再硬编码 'minor'——impactScore≥7 自动标 major，影响排序优先注入
- `buildMediumTermSection`：固定取 3 章 → 角色重叠评分检索（Top-8 最相关 + 最后一章保底）
- 新增 `buildArcSection`：角色弧光追踪区块——有 arcProgress 的角色自动注入当前状态
- 新增 `buildStorylineSection`：活跃故事线当前状态——按七要素链展示每条线进度
- `assemblePrompt` 从 7 区块扩展到 9 区块——弧光 + 故事线实时追上
- TokenAllocation 新增 arcMemory + storylineMemory 预算分配

**🐛 代码质量——审查修复 6 个 Bug**
- page.tsx handleDrawSelect / onEditOutline：fire-and-forget fetch → await + try/catch
- ContextPreview.tsx / StyleEditor.tsx：useEffect 无 AbortController → 加全流程竞态防护
- DrawCards.tsx：3 重竞态防护（过期请求检查、AbortError 跳过、finally 只关当前 loading）
- DrawCards API route：personality 字段从提取未使用 → 正确拼入角色简介

**🛡 工程质量**
- 新建 `novel-forge-diagnostic` 专属诊断 skill——六维自检（TS/Prisma/React/API/质量/服务）
- TypeScript 零错误 · Prisma Rule 表 + db push · client regenerate

---

## v0.16.0 — 2026-06-14

### 🎴 抽卡模式 + 🏗️ 架构大重构 + 📖 故事线系统

**🔍 跨章逻辑评估增强**
- 现有审校体系增强——写/续写时自动检测跨章矛盾
- reviewContent 接收前3章摘要+角色状态快照+关键事件做真实跨章对比
- 新增 `cross_chapter_contradiction` 审校类型
- 审校 prompt 新增跨章铁律：角色生死/关系/事件必须与前文一致
- 零新建——不改路由、不新建组件、纯增强现有流程

**🎴 抽卡模式（模式C）**
- API：POST /api/generate/chapter-outline/draw——并行 3-5 次 Flash 调用
- 每条路线用不同 temperature（0.3~1.0）产出异构章纲
- 卡片含：章纲全文 / 核心冲突 / 情绪基调 / 伏笔方向 / 出场角色 / 选角标签
- 前端 DrawCards 组件——卡片网格布局，点击选中→采用写入节点大纲
- 支持「重抽」换一批路线，支持 3/4/5 张选择
- CenterPanel 新增「🎴抽卡」按钮

**🏗️ 前端拆分**
- 工作台主文件从 3652 行拆分为 14 个独立组件模块，精简 83%
- 四面板（Toolbar / LeftPanel / CenterPanel / RightPanel）独立化
- 6 弹窗 + OutlineTree + ReviewPanel 全部分拆到 `src/components/workspace/`
- 主 page.tsx 变为 ~600 行的纯状态管理 + 布局编排器

**📖 故事线系统（Storyline）——阶段二启动**
- Prisma 新增 Storyline 模型：type（主线/支线）+ 完整七要素字段
- 七要素：欲望 → 阻碍 → 行动 → 结果 → 意外 → 转折 → 结局
- chapterBindings JSON——七要素绑定具体章节
- CRUD API 完整：GET/POST /api/storylines + GET/PUT/DELETE /api/storylines/[id]
- AI 自动生成：POST /api/storylines/generate——V4 Pro 读总纲+角色→拆分主线+支线+填七要素
- 前端 StorylineList：展开查看七要素详情、编辑弹窗、AI 生成按钮
- LeftPanel 新增「故事线」Tab——大纲/故事线/角色/世界书 四 Tab 切换

---

## v0.15.8 — 2026-06-14

### 🤖 章纲 AI 自主选角

**两阶段生成**
- Step 1: AI 读取前 5 章大纲 + 上一章结尾 800 字 + 作者指令 → 自主决定本章出场角色
- Step 2: 只用选定角色的完整档案 → 生成详细章纲
- 作者指令作为最高优先级注入两个阶段
- 空闲角色不再塞入——AI 根据剧情逻辑选角，不写"等"来糊弄
- 结果展示选角列表 + 选角理由

**上下文增强**
- 前文：3 章 → 5 章，正文末段：300 字 → 800 字
- 新增后文伏笔读取

### ⚡ 系统提示词预缓存

- 三卡编译到 `Project.globalPrompt`，卡变动 <1 秒自动刷新
- 9 个同步钩子覆盖全部 CRUD + 导入/扩展/整理
- `buildPromptContext` 和 `chapter-outline` 有缓存时跳过 3 个 DB 查询

### 🔧 其他

- 去重四层：自去重 + 跨聚类 + 与已有 + 全局
- 范围选择器：`1-50`、`1,3,5-10`
- SSE 预览缓存：`previewId` 替代大数据传输

---

## v0.15.7 — 2026-06-13

### 🛡️ 信息零丢失架构 —— 输入估算 + 拆分 + 覆盖校验

**max_tokens 分级**
- Phase 1 聚类: 4096（输出仅 JSON，够用）
- Phase 2 整理: 16384~32768（按输入量自适应——输入超 5 万 tokens 自动升级到 32768）

**输入 token 估算 + 超大聚类拆分**
- 中文按 1.5 tokens/字估算，超 4 万 tokens 自动拆分
- 每批独立调用 Flash，批间标题去重，多批结果合并去重
- 输出截断检测——检查 `finish_reason === "length"`

**专有名词覆盖校验**
- 整理后自动提取原文专有名词（书名号/引号/括号内容）
- 比对输出，逐 cluster 报告缺失列表
- 前端确认面板实时展示——缺失标红

**确认面板**
- 展示：来源词条 → 新词条标题+摘要+关键词 + 拆分标记 + 覆盖警告
- 确认后调 apply 接口原子写入

**Phase 2 铁律**
- 禁止用"等"省略、禁止概括数字、禁止合并分歧来源、禁止删专有名词
- maxDuration 60→120s（分批处理）

---

## v0.15.6 — 2026-06-13

### 📋 章纲生成全面升级 —— 严格基于角色档案+风格设定

**角色信息**
- 从一行摘要 `[名字] 定位 性格词` → 完整档案：性格五维 + 背景300字 + 能力 + 关系 + 说话风格

**文风注入**
- 新增 styleCard 加载——文风描述/视角/句长/对话比/语气标记全传入

**Prompt 重写**
- 6条铁律：行为匹配性格五维、关系一致、不违背核心驱动、文风匹配、不凭空造角色、世界观铁律
- 章纲结构：核心冲突→情感基调→场景序列→关键对话点子→衔接钩子

**参数优化**
- temperature: 0.7 → 0.4，max_tokens: 2048 → 4096
- 前后文：2章 → 3章，正文取末段300字代替取前200字

---

## v0.15.5 — 2026-06-13

### 🆕 缺失角色自动发现 + 人物卡提示词全面升级

**缺失角色自动建卡**
- AI 审计新增第三项任务——扫描 background 中所有人物名
- 比对全项目已有角色卡，新人物自动建卡
- 去重保护，进度报告

**人物卡提取全面升级**
- parser.ts: personality 从 `["词"]` → `{dominant, drive, contradiction, habits, socialMask}` 五维
- background: "简述" → "复述原文全部细节，至少100字"
- 新增 abilities / timeline / dialogueStyle 等丰富字段
- import/parse: 全字段禁止"未知"，必须从原文提取或推断

**JSON 解析器**
- 第 2.5 层：多 JSON 对象粘连自动拆分

**限制解除**
- expand MAX_TOKENS: 16384 → 32768

---

## v0.15.4 — 2026-06-13

### 🧹 角色扩展预处理管线 + JSON 解析器修复

**扩展前预处理（四步管线）**
- AI 批量审计——一次 Flash 调用检查全部卡：是否真人 / 是否组合卡
- 拆组合卡——"张三、李四"→每人独立建卡，已有同名则合并信息不重复
- 删非角色——地名/物品/势力/概念混入角色列表的自动检测并删除
- 智能合并增强——去括号匹配，信息更丰富的卡优先保留，重复卡删除
- 全流程 SSE 进度推送

**JSON 解析器修复**
- `sanitizeUnescapedQuotes` 不再空转——字符串内未转义引号自动检测并转义
- 中文对话引号场景自动修复
- 接入解析管线第5/6/7层
- 错误消息扩展到 300 字 + JSON.parse 原始错误

---

## v0.15.3 — 2026-06-13

### ☁️ 全链路硅基流动 —— 16路由统一迁移 + 模型名修正

**API 迁移**
- `getDefaultLLMConfig()` → 硅基流动（连锁修复 detect-entities / update-style-card / settings/parser 等 5 场景）
- chapter-outline（章纲）/ outline（大纲）/ classify（角色分类）→ 硅基流动
- check-all-cards / import/commit / import/parse → 硅基流动
- lorebook/import / lorebook/summarize / characters/expand → 硅基流动
- 全部 `DEEPSEEK_API_KEY` → `LLM_API_KEY`，统一密钥管理

**模型名修正**
- 硅基流动实际支持的模型名：`deepseek-ai/DeepSeek-V4-Pro`、`deepseek-ai/DeepSeek-V4-Flash`
- 之前使用的 `deepseek-v4-pro` / `deepseek-v4-flash` 在硅基流动上不存在（400 code 20012）
- 16个文件批量替换，TypeScript 0 错误编译通过

**修复**
- 章纲生成 API 400 —— 模型名不存在
- 章纲生成 API 401 —— 用了失效的 DeepSeek 官方 key
- 大纲/分类/导入/世界书 全部存在同样的硬编码问题，一并根除

---

## v0.15.0 — 2026-06-12

### 🃏 导入设定一键出三卡——分界精确、无上限提取

**核心：三卡分界标准建立**
- `src/core/settings/parser.ts` 新增 `THREE_CARD_BOUNDARIES` —— 整个项目三卡提取的唯一权威规则源
- 角色卡：有名字的个体人物（外貌/性格/背景/能力/关系/对话风格/隐藏动机/时间线）
- 世界卡：非人物概念（地理/势力/力量体系/历史/文化/生物/器物/自定义），含触发关键词
- 风格卡：写作风格特征（视角/叙事距离/句式/比例/语气标记/词汇特征/文风描述/样本段落）
- 每张卡明确排除不属于它的内容——杜绝AI把地名写进角色卡、把文风写进世界卡

**SettingsImporter 补全三卡**
- `POST /api/parse-settings` 新增 StyleCard 创建（删除旧卡→建新卡，一个项目保留最新一张）
- 三卡并行写入：角色卡 + 世界书 + 风格卡一个 `Promise.all` 搞定
- 前端显示风格卡创建结果（粉色高亮）

**ImportWizard 统一三卡标准**
- `POST /api/import/parse` B 路 prompt 引用 `THREE_CARD_BOUNDARIES`，与 parser.ts 一致
- 分块模式下不再跳过世界+风格提取——改用文本前16000字独立调用
- maxTokens 全面提升：A路 12000/16000→16384，B路 8000→16384

**类型系统**
- 新增 `StyleProfile` 接口（对应 StyleCard 全部字段）
- `ParsedSettings` 新增 `styleProfile?: StyleProfile`
- 新增 `toStyleCardCreateParams()` 辅助函数
- `src/core/settings/index.ts` 导出全量更新

---

## v0.14.0 — 2026-06-12

### 🎨 文风系统重做——模板真正生效

**修复严重漏洞：模板的 stylePrompt 从未注入 LLM**
- `write` / `continue` / `refine` 三条路由现在统一注入模板的 stylePrompt、forbiddenPatterns、pacingGuide、dialogueGuide
- 模板的 temperature/topP 覆盖默认值，传递给 LLM API
- 选了模板不再等于没选

**新增：情欲古风模板**（`adult_romance`）
- 半文半白古风白话 · 直白情色描写 · 感官优先级（触觉→听觉→视觉→嗅觉→味觉）
- 6 种角色语域（仙子雅语 / 老汉粗俗 / 妩媚娇憨 等）
- 39 条禁用词（连接词 / 元叙事 / 学术腔 / 身体模板 / AI 通用禁用）
- Show Don't Tell 心理直嵌 · 变速齿轮节奏 · 对话毛边对抗

**新增：生成后禁用词扫描器**
- `src/lib/forbidden-checker.ts`：正文生成后逐字扫描，违规项通过 SSE 返回前端
- 全部 3 条生成路由均已接入（write/continue/refine）
- ContextPreview 面板实时显示模板注入状态和禁用词是否生效

**新增：风格卡自动更新**
- `POST /api/generate/update-style-card`：分析最新章节 → 更新 StyleCard 量化参数
- 句长、对话比、动作比、语气标记随写作演进而自动演进

### 🔬 三卡系统大修——无上限 + 一键检查

**实体检测 v2**（`detect-entities`）
- 分块扫描：文本自动分块（12K/块），不再硬截断 8000 字
- maxTokens 4096→16384，AI 输出不截断
- 新增第三维：大纲偏离检测（OOC/情节偏离/节奏/视角）

**角色扩展 v2**（`expand`）
- 模型 `deepseek-chat`→`deepseek-v4-flash`
- 去源文本截断（原 8000→20000+完整输入）
- maxTokens 8000→16384
- 并发 8→16，137 角色约 5 分钟完成（原 15 分钟+）

**分类优化**（`classify`）
- 超时 60s→120s
- 世界书上限 50→200 条

**新增：一键三卡检查**（`POST /api/generate/check-all-cards`）
- SSE 流式：实体检测 + 分类状态 + 大纲一致性 三路并行
- 返回完整报告：新角色/新词条/未分类/信息不完整/大纲偏离

**写前确认增强**（`pre-write-cards`）
- 新增世界卡完整性检查（缺失类型提示）

**模型统一**
- 全部分析类 API → `deepseek-v4-flash`

### 🛡️ 作者指令清理
- 作者指令不再默认填充，留空给用户自己写
- 世界规则迁移到世界卡（Lorebook），通过关键词触发自动注入

### 🔧 架构审计修复
- 修复 `closingSnapshot`/`impulses` 数据流因类型错位完全丢失的 bug
- 修复草稿保存竞态 — 加防重叠锁，吞错改记日志
- 修复 `apply-tags` 完全缺失 try/catch + 加项目归属校验
- 修复 `lorebook/summarize` 删除/创建非原子 — 包 `$transaction`
- 修复 `insertionOrder: 0` 被 `||` 误当 falsy
- 修复 `classify` 模块级 API_KEY 常量
- `CharacterCard` 类型补全 `timeline`/`abilities`/`TimelineEvent`
- 新建共享 `json-parser.ts` — 消灭 10+ 处重复 JSON 修复

---

## v0.9.1 — 2026-06-09

### 🔄 AI 分析本章变化 · 更新三卡——修复 + 增强

**修复**
- 手动点击「AI分析本章变化」按钮时，如果节点已有正文但本次会话未生成，不再报错——改为优先取节点已保存内容
- 正文内容不足 50 字时显示明确提示，不发请求
- API 返回具体错误信息（不再泛泛 400）

**新增：内联编辑**
- 每条检测到的变化旁有 ✏️ 按钮，点击可在弹窗内直接编辑 AI 建议的内容
- 纯文本直接改，数组/对象自动转 JSON 格式编辑
- 编辑过的条目标记「已编辑」

**新增：重要性过滤**
- AI 现在标记每条变化的 significance（high/medium/low）
- low 级变化默认不勾选，减少噪音
- 重要变化显示红色「重要」标签

**新增：三卡写入格式对齐**
- 角色更新标记章节来源（`第N章` 前缀），后续章节可追溯变化轨迹
- 新关系自动匹配已有角色 ID
- 性格信念转变兼容结构化（dominant/drive/contradiction）和旧格式
- 世界观词条自动去重，同名条目不重复创建
- 新增「性格信念转变」「获得重要物品/身份」检测

**分析质量提升**
- 分析上限 8000 → 10000 字
- Prompt 优化：明确要求不输出 markdown 代码块、只输出 high/medium 级变化
- 新伏笔检测后显示建议回收方式和关联角色

---

## v0.7.0 — 2026-06-07

### ⚡ 角色扩展（AI Expand）大幅加速
- **流式生成**：从干等 20 秒 → 3 秒开始出角色，逐角色推送进度
- **批量翻倍**：每批 4 个 → 8 个，100 角色从 25 批减到 13 批
- **Prompt 重写**：框架式模板 + 4 条铁律，输入缩 40%，生成更快更准
  - 禁止"无""未知""暂无"——缺信息按地位推敲
  - 同类型角色外貌性格必须可区分——俩长老不能长一样
  - 能力按地位推导：掌门 > 长老 > 执事 > 弟子
  - 输出纯 JSON

### 🗄️ Commit 查重优化
- 角色查重：复用已加载数据，0 次额外 DB 查询（旧：100 角色 = 100 次 findFirst）
- 词条查重：1 次批量 findMany 替代逐个查询
- 100 角色 + 100 词条：DB 查询从 200 次 → 1 次

---

## v0.6.1 — 2026-06-07

### 📊 解析进度可视化
- 流式检测中实时显示角色名计数（`~N 角色名`）
- 去重合并阶段逐角色推送——每发现一个新角色就发射 `char-found` 事件
- 前端实时显示已发现角色数和词条数

### 🔧 修复
- commit + expand 加 `maxDuration=300`，防止 Vercel 60s 掐断
- commit 完成消息角色数双倍计数修复
- parse 注释更新为实际架构描述

---

## v0.6.0 — 2026-06-07

### 🐛 最后小块修复
- `smartChunk` 短尾块（<200 字）自动合并到前一块，不再丢弃
- 十万字文本的最后一段不会凭空消失

---

## v0.5.0 — 2026-06（更早）

### ✨ 功能
- 分块并行解析：Smart chunk by paragraph（≤6000 字/块），N 路 Flash 并行 + JS 去重
- Commit 分批并行：每批 4 个，SSE 进度
- AI Expand：选中角色卡一键批量扩展，globalPrompt 缓存世界书+风格卡
- 人物时间线：timeline 字段防 OOC
- 批量导入确认：可选确认/移除/一键删除/分批提交

### 📱 部署
- Vercel 生产部署：https://novel-forge-nu.vercel.app
- TWA Android APK：assetlinks.json 验证
- PWA manifest + Service Worker

### 🔧 后端
- DeepSeek V4 Flash：所有提取/合并/扩展任务
- DeepSeek V4 Pro：创意写作（generate 系列）
- 全链路 SSE 流式进度
- 无超时限制
