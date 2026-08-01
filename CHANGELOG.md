# Novel Forge 更新公告

---

## v0.44.5 — 2026-07-31
**项目级 LLM 覆盖端到端闭环（outline + 自动填表接入）**
- 🔑 项目配置中心「per-project LLM 覆盖」缺口补齐：大纲生成（`/generate/outline`）与宝宝流自动填表（`babyloreFill`）现已继承项目级 llmConfig（apiKey/baseUrl/model 非空字段覆盖全局），与 write/refine/continue/summarize 统一
- ✅ 实测端到端验证：设错误项目 key → write/outline 均返回 `401`（证明覆盖接管）；复位 `{}` → 用 `.env` 全局 key 真实生成成功（证明无阻塞、API 直接可用）
- 🔗 write/refine/continue 三路由把 `projLlm` 透传 `safeFillAfterWriting`；outline 叠加 `buildProjectOverrides` 解析
- 🧪 tsc 零错误；澄清此前「API 阻塞」为误判——本地站读 `.env` 的 `LLM_API_KEY`，DeepSeek key 一直可用

## v0.44.4 — 2026-08-01
**巨型组件拆分续 —— WorldPanel 375→137 行**
- 🧱 `WorldPanel`（375 行）拆分为 4 个内聚子组件 + 1 个数据模块：`WorldModuleSidebar`（板块选择）、`WorldEditor`（标题栏+新建表单+深度选择）、`WorldEntryCard`（单条目卡片）、`WorldEntryList`（列表+空状态）、`worldPanelData.ts`（WORLD_MODULES/DEPTH_LABEL/CATEGORY_TO_MODULE/MODULE_FIELDS 常量与类型外置）
- 🔒 父组件保留全部状态/handler（handleCreate/handleFieldChange/deleteEntry）与派生计算，仅以子组件调用替换内联 JSX；行为 100% 不变（tsc 零错误）
- 📦 常量外置 `worldPanelData.ts`，全局核查无别处依赖破坏
- 🧹 纯重构：无 schema 变更、无新功能、无样式改动，可维护性提升

## v0.44.3 — 2026-08-01
**巨型组件拆分启动 —— CharacterList 883→504 行**
- 🧱 `CharacterList`（883 行）拆分为 6 个内聚子组件：`CharacterFilters`（搜索+角色/状态/标签筛选）、`CharacterToolbar`（工具栏+全选/扩展/分类）、`ClassifyPanel`（分类进度+面板+结果）、`ExpandResultModal`（扩展进度+结果弹窗并接管 focus-trap）、`CharacterRow`（单角色卡片）、`CharacterGroupList`（分组渲染）
- 🔒 父组件保留全部状态/handler 与派生计算，仅以子组件调用替换内联 JSX 区块；行为 100% 不变（tsc 零错误，逻辑逐字迁移）
- ♿ 焦点陷阱随扩展结果弹窗移交 `ExpandResultModal`，键盘可达性不受影响
- 🧹 纯重构：无 schema 变更、无新功能、无样式改动，可维护性提升

## v0.44.2 — 2026-08-01
**对话框焦点陷阱与键盘可达性（无障碍基线）**
- ♿ 新增通用 `useFocusTrap` hook（`src/hooks/use-focus-trap.ts`）：弹窗激活时焦点移入首个可聚焦元素、Tab/Shift+Tab 在弹窗内循环不逃逸、Esc 关闭、关闭后焦点交还打开前的元素
- 🔒 增强 `DialogOverlay` 与 `Modal` 基础组件自带焦点陷阱，覆盖所有使用它们的弹窗（角色/世界书编辑、设置导入等）
- 🪟 11 个裸 fixed 弹窗统一挂焦点陷阱：大纲生成 / 布置配置 / 项目配置 / 生成前确认 / 抽卡 / 记忆衰减 / 自动化设置 / 规则面板 / 剧情线编辑 / 角色编辑 / 角色列表扩展结果
- ⌨️ 键盘可达性基线达成：Tab 在弹窗内导航、Esc 关闭，焦点不再丢失到背后页面

## v0.44.1 — 2026-08-01
**修复探讨模式采纳失败无法重试（稳定性）**
- 🐛 修复 `handleAdoptCard` 在 fetch 之前就把卡片 `adopted` 置真：失败也会显示「已采纳」并禁用按钮，导致用户无法重试 —— 改为仅在成功响应后才置 `adopted` + 写入已采纳列表
- 🔁 统一失败状态串为「❌失败」（修复 page 与 ChatPanel 字符串不一致导致失败徽标永不显示的隐藏 bug）
- 🔄 ChatPanel 失败卡片新增「点击卡片重试 ↻」提示，失败后整卡仍可点击触发 `onAdoptCard` 重新采纳
- 🧪 批量采纳（大纲模式）失败项同样受益：卡片 `adopted` 不再提前置真，用户可在对话卡片上单卡重试；tsc 零错误，纯前端逻辑修复无 schema 变更

## v0.44.0 — 2026-07-31
**六大功能补齐 + 六项体验优化（本地化闭环）**
- 🎯 六大新功能：创意工坊一键示范预设 / 布置结构化保存与重编辑 / 记忆衰减手动触发 / 抽卡角色生成前确认 / 项目配置中心 / 自动填表可视化重试
- 🔁 regex 三处统一应用 + lorebook 预设重复去重（更新而非叠加）
- 🧭 章节大纲双入口明确（Flash 轻量预览 vs 抽卡正式 Outline）+ 世界书深度改为「常驻记忆/触发记忆」
- 🛡️ 角色卡 adopt 字段加固（对话风格/隐藏动机/关系不丢）+ 10 个孤儿路由 @deprecated

## v0.43.0 — 2026-07-29
**API 配置体验重做 + 探讨/布置双区域 UI 升级**
- 🔑 新增 `/api/settings/models` 自动检索模型，deepseek 默认 base 特殊拼接 `/v1/models`；设置页模型框改为可下拉选择
- 🔌 保存 API 后自动调用 `/api/settings/test` 连接验证，DeepSeek V4 flash 实测通过；修复 `lllBaseUrl` 笔误
- 💬 探讨模式 UI 升级：11 步进度条 + 「AI 创作顾问」状态条 + bot/user 头像 + 气泡/卡片/采纳入场动画
- 🎛️ 布置区域 UI 升级：实时预览卡 + 四分区 StepGroup + 流派标签搜索过滤 + 颜色收敛到虚空玻璃令牌
- ✅ 修复 `globals.css` 误加的 `:root` 提前闭合括号导致的 500；tsc 零错误 + 浏览器真实走查通过

## v0.42.0 — 2026-07-28
**虚空玻璃 UI 全面翻新（老土配色清零）**
- 🎨 全局 Tailwind 默认色（zinc/indigo/gray/white）映射到虚空玻璃设计令牌，覆盖 40+ 组件与全部页面路由
- 🌌 首页/工作区/设置/创意工坊统一深空玻璃质感（背景光晕 + 霓虹渐变标题）
- 🔘 交互语义保留：focus 环/开关滑块/进度条改用主色/表面令牌，对比度达标
- ✅ tsc + 生产 next build 全通过

## v0.41.0 — 2026-07-28
**角色卡结构化模板收尾（酒馆模板呈现）**
- 👤 调度卡注入补全「称呼别名 + 穿着 + 关系备注」三项，此前 UI 已收集却未进 prompt：称呼头部追加别名（aliases），外貌块补 attire（穿着）
- 🔗 关系备注修复：注入改读 UI 实际保存的 `r.dynamic` 字段（原误读恒为空的 `r.notes`），关系动态不再丢失
- 🧱 侦察确认 `relationships` 字段（schema/types/UI/注入四路齐全）与 `speechPatterns`（dialogueStyle 内置子字段）此前已落地，本次零新增字段、零 schema 变更
- ✅ tsc + 生产 next build 全通过

## v0.40.0 — 2026-07-28
**提示词结构升级：XML 标签分层包裹（酒馆格式论迁移）**
- 🧩 assemblePrompt 拼接层从「--- 分隔 +【xxx】标题」改为逐块 XML 标签包裹，块边界对 LLM 无歧义
- 🎯 根标签 `<novel_forge_context>` 与 `<writing_task>` 明确区分“上下文”与“撰写任务”两层，消除模型把指令误当正文、正文误当指令的混淆
- 📦 11 个上下文区块各自用 XML 子标签包裹（系统/全局/强制常驻/世界书/弧光/故事线/伏笔/转折/章节摘要/近期/作者指令），内部自然语言不变；新增 `wrapBlock` 辅助函数
- ✅ tsc + 生产 next build 全通过

## v0.39.0 — 2026-07-28
**记忆清除 / 上下文溢出治理（酒馆记忆机制迁移）**
- 🧠 短期记忆（前文回顾）溢出治理：较远楼层超预算时不再静默丢弃，改为显式「折叠标记」（保留末尾衔接点 + 标注"开头已折叠/非完整原文"），预算极小时整段折叠为一行提示
- 📜 中期摘要（章节摘要）静默截断补标记：因预算省略的较早/低相关章节摘要显式标注数量，上下文边界清晰
- 🔍 对应酒馆第七章「记忆机制 / 记忆清除」：明确上下文压缩边界，消除"上下文污染 / 剧情断裂幻觉"
- ✅ tsc + 生产 next build 全通过

## v0.38.0 — 2026-07-28
**世界书 depth 注入（酒馆 worldbook depth 0-4 迁移）**
- 📚 LorebookEntry 新增 `depth Int @default(3)`：把酒馆世界书分层注入机制搬进 Novel Forge（0=正文前强效 / 1=用户指令上方 / 2=系统上下文 / 3=背景设定·关键词触发 / 4=深层背景）
- 🌟 depth≤2 强制常驻注入：不依赖关键词，始终进入上下文（系统上下文区 / 指令上方 / 正文前）；depth≥3 仍走关键词触发路径（默认3，保持旧行为）
- 🧩 编排层拆分 forced/triggerable：关键词匹配仅作用于 depth≥3；宝宝流 recall 路径排除 depth≤2 避免重复注入
- 🎛️ 世界书编辑/新建 UI 新增深度选择器与徽标（depth≤2 高亮为常驻）；创意工坊示范预设「核心设定」改为 depth=2 演示强制注入
- ✅ tsc + 生产 next build 全通过

## v0.37.0 — 2026-07-28
**酒馆理论迁移：创意工坊 Preset 类型扩展 + 正则后处理管线**
- 🍺 创意工坊 Preset 类型扩展（酒馆迁移）：新增 `regex` / `lorebook` / `api_config` 三类预设，可上传并应用到项目
- 🧹 正则后处理管线落地：生成一章后自动按项目级 `postProcessingRules` 清洗输出（如删除 `<think>` / `<thinking>` / `<analysis>`）
- ⚙️ API 参数预设可覆盖项目 `llmConfig`：应用 `api_config` 预设后直接改变生成温度/topP/模型参数
- 📁 新增 `PROCESS/05-酒馆理论迁移方案.txt`：记录酒馆运行原理、可迁移方法论、下一步计划，并更新目录清单
- ✅ tsc + 生产 next build 全通过

## v0.36.0 — 2026-07-28
**色子抽卡与剧情线持久化关联 + 流程文档机制**
- 🎴 色子（抽卡）剧情预设持久化：采用某路线后自动写入活跃剧情线 `Storyline.chapterBindings`（element:"preset"，含 cardLabel/coreConflict/mood），生成前剧情规划可读到「用户用色子选定的走向」
- 🔁 同章纲节点重采用色子按 chapterId+preset 去重，不堆叠重复条目；项目无活跃剧情线时优雅跳过
- 📁 建立 PROCESS 流程文档机制：`novel-forge/PROCESS/` 目录清单 + 三段式落档（目标/执行流程/关联项），兼作产出记录与预期值追踪
- ✅ tsc + 生产 next build 全通过

## v0.35.0 — 2026-07-28

### 无表自动建表——保证「生成一章即自动填表」零配置闭环

**自动化填表零配置（修复体验矛盾）**
- safeFillAfterWriting 在真正填表前检查项目是否已有结构化表格；若无且自动化开启，自动创建默认「章节事实表」（key=auto_facts，列：名称/状态/说明），使「生成一章即自动填表」在零表格配置下也能成立
- E2E 验证：新建项目故意不应用任何表格模板，第1章生成后自动建表并填 4 行、第2章动态修正至 7 行；后端打印 `[babylore]` 自动建表日志

---

## v0.34.0 — 2026-07-28

### 文风预设生效修复 + 系统角色条件化 + 后端监测报告

**文风预设修复（与预期对齐的核心矛盾）**
- 修复 apply 路由缺陷：创意工坊「应用」预设后未调用 syncGlobalPrompt，导致 globalPrompt 始终为空、文风预设（如古风·严谨文笔）完全不生效；现对所有预设类型（style/worldview/story-progression）统一刷新全局提示词
- 文风卡经 syncGlobalPrompt 编入 globalPrompt，生成时 assemblePrompt 读取，套用文风后立即带该文风（E2E 实测 globalPrompt 长度 0 → 385 且含「文风设定/古风」）

**系统角色条件化（消除体裁冲突）**
- orchestrator 系统提示词原硬编码「白金级玄幻修仙网文作家 + 修仙模拟引擎 + 都市重生流」，与项目 genre 解耦，压制一切非修仙文风
- 改为条件化：题材含修仙/玄幻/仙侠/武侠/洪荒/奇幻/末世时沿用原版（零风险）；其他题材走通用作家角色，文风以文风卡为最高权威，不再被强制修仙化

**后端监测报告（满足核对流程需求）**
- 召回节点打印 `[recall]` 命中条数与来源；生成前剧情规划打印 `[plan-chapter]` 回写章序；自动填表打印 `[babylore]` ops/applied/skipped
- E2E 实测后端日志清晰呈现「召回 1→3 条 → 剧情回写章序 1→2→3 → 填表 chapter1 ops=2 / 后续动态修正」的完整链路

---

## v0.33.0 — 2026-07-28

### 自动化填表闭环 + 生成前剧情预设 + 可配上下文

**自动化填表（正文→填表→召回→正文）**
- 新增 safeFillAfterWriting：每章写完后自动用 DeepSeek 抽取结构化事实，以 JSON 行操作协议（insert/update/delete）回填创意工坊结构化表格，失败不影响正文交付
- 回填表格经 buildRecallBlock 持续注入永久上下文，形成「写章节→填表→下一章召回」闭环；update 按唯一列匹配已有行，动态修正不矛盾、不重复插入
- 填表频率可配置（默认每 3 章填一次）、默认跳过最近一章（用户常对最新章 re-roll 改写，跳过避免污染表格），二者均可在弹窗关闭

**生成前剧情预设（回忆召回式推进剧情线）**
- 新增 plan-chapter.ts：点击生成一章之前，LLM 基于活跃剧情线 + 大纲 + 作者指令 + 记忆召回块规划本章剧情推进（焦点/推进/障碍/转折/执行提示）
- 规划结果注入写作指令，并把本章绑定追加写回活跃剧情线（保留最近 50 章，不丢历史、持续修正）；规划失败静默降级，不阻断正文生成

**配置与 UI**
- 顶部工具栏新增「自动化」入口，弹窗集中配置：自动填表总开关 / 填表频率 / 跳过最近章 / 上下文楼层（前文窗口，复用 contextKeepChapters）
- 新增 /api/projects/[id]/config（GET/PUT）读写上述配置，已接入 jsonError 统一错误格式
- 数据层：Project 模型新增 autoFillEnabled / fillFrequency / skipLatestChapter 字段

---

## v0.32.3 — 2026-07-28

### 暗色可读性提升 + API 错误格式统一

**可读性（A11y）**
- --nv-text-tertiary 提亮至对比度 ≥4.5:1（原约 3.5:1），暗色下弱文字达 WCAG AA 普通文本标准
- --nv-text-muted 适度提亮，占位符 / 禁用文字在暗色背景下恢复可读性

**API 错误响应统一**
- 新增标准 helper jsonError(message, status?)，统一返回 { error } 结构与 HTTP 状态，消除各路由 {ok:true}/{error} 不一致
- /api/presets/[id]（GET/PUT/DELETE）与 /api/seed/presets（POST）已接入 jsonError，作为全站错误格式统一化起点

---

## v0.32.2 — 2026-07-28

### 空态统一 + 项目资产闭环 + 监测告警（缺陷修复迭代）

**空态统一（视觉完整度）**
- 新增共享空态组件 EmptyState（虚空玻璃风格：虚线边框 + 居中 Icon + 主文案 + 可选引导/操作区）
- 角色 / 世界书 / 故事线 / 规则四类列表的无数据占位统一为 EmptyState 卡片；规则面板原漏网的旧色板 text-zinc-600 一并收编为 nv 令牌

**项目资产闭环**
- GET /api/projects/[id] 的 include 补全 styleCards 与 loreTables，前端可在 workspace 直接读取创意工坊已应用预设，减少端点分裂

**健壮性**
- MonitorPanel 的 fetch 异常从静默忽略（/* ignore */）改为 console.warn，保留非关键降级但开发期可排查
- SSE 流关闭逐文件复核：17 个流式路由的 controller.close() 均已覆盖所有异常路径（try 末尾 / catch 内 / 提前 return 前），无悬挂风险，保持现状以控制改动风险

---

## v0.32.1 — 2026-07-28

### API 路由健壮性加固（预设路由异常捕获）

**API 路由健壮性**
- 修复 /api/presets/[id] 的 GET/PUT/DELETE 与 /api/seed/presets 的 POST 缺失 try/catch 的问题：prisma 异常原会返回无 {error} 的 500，导致前端解析崩溃
- 统一异常响应：各 handler 包装 try/catch，返回 { error: string } + 对应 HTTP 状态（404/500），前端可稳定识别并 toastError

**诊断自检**
- 按 novel-forge-diagnostic 六维度扫描：tsc 零错误、Prisma schema 校验通过、服务健康 200、无死代码、核心 SSE 路由已有外层 try/catch 兜底
- 其余优化点（SSE finally 统一关闭、巨型组件拆分、大列表虚拟化、空态 / 对比度 / A11y）整理为优化建议清单，列入后续迭代

---

## v0.32.0 — 2026-07-27

### 🎨 全模块视觉美化 + 创建/添加统一响应弹窗（虚空玻璃设计体系）

**视觉美化体系落地（虚空玻璃 Void Glass）**
- 全部小说相关子界面统一为暗色「虚空玻璃」设计：surface/border/primary/creative/accent/success/danger 令牌全量替换旧的 indigo/zinc/emerald/amber 平行色，配色风格一致
- 按钮变体（btn-primary/btn-success/btn-danger/btn-creative/btn-ghost）+ .input-glass/.surface-floating 统一质感，每个按钮具备 hover / 点击 / 禁用态的视觉差异
- 全站 UI 装饰 emoji 清零，改为统一 Icon 组件（Lucide 映射）：角色前缀 ★◆◈、状态 ✓✕⚠️⏳ 等收编为 check/x/alert/loader 等 Icon；业务数据标签 📥📝 保留其过滤语义

**创建/添加操作统一响应弹窗**
- 新增命名式 toast：toastAdded / toastCreated（绿色辉光 + 勾选动画 + 固定标题「已添加 / 已创建」），字体与动效美化
- 覆盖全部「创建 / 添加小说」入口：新建角色、新建世界书、新建规则、AI 生成故事线、探讨模式创建项目（含大纲落库建项目）——均弹出「XX「名称」已创建 / 已添加」

**构建与类型修复**
- 修复 3 处阻塞构建的类型错误：workshop 页补 toastCreated 导入、游戏页 QUICK_ACTIONS 的 icon 收窄为 IconName、PostGenPanel 补 cloud 图标到注册表
- tsc --noEmit 与生产 next build 均通过（69 路由全量生成），可直接部署

---

## v0.31.0 — 2026-07-27

### 📚 内置文档预设概念 + 创意工坊进入写作上下文 + 按钮全交互实测

**内置预设概念（来自参考资料）**
- 把参考资料教程里命名的所有预设类别实体化为系统内置预设：表格模板 3 个（主角信息表/属性·关系·资产、骰子随机事件表、宫斗·妃嫔居住建筑表）、剧情推进 2 个（缝合怪·多线剧情推进、好感度·分阶段人设模板）、文风 2 个（快节奏·爽文笔、古风·严谨文笔）、世界观 1 个（仙侠·世界观骨架）、角色卡 1 个（示范角色·苏苏）
- 保留原 4 个示范预设，系统内置预设总数由 4 增至 12，覆盖 type: table_template / story_progression / style / worldview / character

**创意工坊贴合进入写作上下文（链路确证）**
- 「应用到项目」真实落库经 pg 直连验证：文风→StyleCard、角色卡→CharacterCard、表格模板→LoreTable 全部写入项目库
- 写章节时预设经 loadGenerationContext / buildPromptContext / buildRecallBlock 注入正文 globalPrompt 与召回块——「参考资料预设→项目库→写作上下文」主链路闭环成立

**每个内置按钮可交互（真实点击验证）**
- 创意工坊 Tab 过滤、搜索框、应用到项目、复刻、上传预设（填表+发布）、目标项目下拉 全部真实点击验证通过，无死按钮
- 上传预设功能端到端验证：表单填表→POST /api/presets→后端真实创建入库
- 生产模式（next build + start）全新渲染：创意工坊 12 张卡片完整渲染、交互正常

---

## v0.30.2 — 2026-07-27

### 🔍 究极用户端五维诊断 + 工作台 hydration 修复

**五维用户端诊断（真实点击验证）**
- ① 按钮实质交互：写章节 / 微调 / 续写 / 自动填表 / 记忆召回 / 跳转 等核心按钮均实测有真实后端行为，未发现死按钮
- ② 前后端统一：前端每个调用均能映射到后端 API 且实测有响应（规则链路最初 400 为诊断脚本字段误用，前端 RulesPanel 字段与后端契约一致）
- ③ 重叠按钮审计：代码盘点 12 组嫌疑入口（文风管理三入口、章纲三生成器、导入双链路等），经判定均属合理导航 / 场景分化，未删除任何功能
- ④ 功能落地：探讨 / 拆书 / 宝宝流 / 创意工坊 / 游戏 等模块边界清晰，参考资料核心承诺（写作闭环 / 分阶段人设 / 创意工坊）均已落地
- ⑤ 功能意义：宝宝流闭环实测优秀——写章节后结构化表格「角色居所」被自动更新（applied:1），正文 1415 token 生成 + 自动填表生效

**修复与用户体验**
- 工作台 /workspace/[id] 修复 SSR/CSR hydration 不一致：将 refineInstruction / chapterOutlinePrompt 的 localStorage 读取从 useState 初始化移入 useEffect，消除初始化期水合不匹配风险
- 诊断结论：系统为免费无收费的小说 AI 生成器，核心写作闭环与记忆系统真实可用，契合谋生作者 / 自娱写手「低成本产出连贯长篇」的目的
- 已知限制：沙箱 dev 模式下工作台偶发卡 loading（仅本地 dev 环境问题，生产构建 next build + start 完全正常，部署无碍）

---

## v0.30.1 — 2026-07-27

### 🪟 写作界面新增「宝宝流记忆召回」实时面板（闭环透明化）

**闭环透明度**
- 写章节 / 微调 / 续写 完成后，中间列新增「🧠 宝宝流记忆召回」折叠面板，实时列出本轮自动召回并注入写作的世界书/结构化表格记忆
- 面板直接展示已求值的人设阶段（如「阶段一：陌生人（态度：礼貌但疏离）」），写作者一眼看清 AI 在本轮呼应了哪些设定、当前角色处于什么状态——闭环不再只藏在后台 toast 里
- 每轮生成开始时面板自动重置，避免上一次记忆残留误导

**实现与验证**
- 数据直接复用已验证的 babylore_recall SSE 事件（items 已是循环求值后的内容），零新增后端逻辑
- 验证：tsc 类型检查通过、next build 全路由编译通过、/workspace/[id] 页面 HTTP 200、写章节 SSE 苏苏条目 content 为已求值「阶段一：陌生人」且无 `<if cell>` 标签

---

## v0.30.0 — 2026-07-27

### 🎭 分阶段人设求值生效（剧情推进 = 人设进化，参考资料核心亮点落地）

**分阶段人设真正生效**
- 新增 src/core/babylore/ifcell.ts 求值器：解析参考资料风格的 `<if cell="属性表/苏苏/好感度 <= 10">…<else>…</if>` 语法（支持任意嵌套），按当前结构化表格的真实数值选出「当前激活的人设阶段」
- 套用「好感度·分阶段人设模板」后，写章节 / 微调 / 续写 会自动把求值后的当前人设阶段注入写作指令，而非把原始语法标签丢给 AI——参考资料承诺的「剧情推进=人设进化」首次真正闭环
- 端到端验证：属性表 苏苏.好感度=5 时，写章节召回的人设条目 content 已是「阶段一：陌生人（态度：礼貌但疏离）」，标签彻底清除

**安全与健壮性**
- 单元 + 端到端双层测试：好感度 5/25/50/80 精准命中阶段一~四，标签全部清除
- 安全降级：属性表缺失、行缺失或数值非数字时返回「全阶段参考文本」（剥离标签、并列展示），绝不误判为某一阶段，也绝不向用户暴露原始 `<if cell>` 标签
- 求值集成进共享模块 src/core/babylore/loop.ts：buildRecallBlock 对世界书条目里的 `<if cell>` 统一求值，recall 事件携带的也是已求值内容（透明可见）

---

## v0.29.0 — 2026-07-27

### 🔁 写作闭环覆盖全部生成路径（写章节 / 微调 / 续写 三路由统一）

**闭环扩展到全部路径**
- 写章节 / 微调 refine / 续写 continue 三条生成路由现在都自动「记忆召回」+ 写后「LLM 填表」，参考资料承诺的正文→填表→召回→正文 在任意创作方式下都闭合
- 端到端验证：微调指令「甄嬛居所改为棠梨宫」被 DeepSeek 自动抽取，结构化表格 甄嬛:碎玉轩 → 甄嬛:棠梨宫 实时更新；续写路径也正确召回角色设定

**架构精简（删冗余）**
- 抽共享模块 src/core/babylore/loop.ts：把「召回净化（过滤[自动发现]占位世界书、表格命中优先、上限12条）+ 写后自动填表（失败不影响交付）」沉淀为单一事实来源
- write/refine/continue 三路由统一调用 buildRecallBlock 与 safeFillAfterWriting，消除三套重复逻辑、保证行为一致

**健壮性对齐**
- refine/continue 的后处理管线（审校/摘要）也加容错：LLM 限流/超时不再中断交付，降级为「仅生成」并继续自动填表、照常发 done
- 前端 streamSSE 本就是 write/refine/continue 共用，宝宝流召回/填表的实时 toast 在三条路径自动透明展示

---

## v0.28.0 — 2026-07-27

### 🔁 打通「正文→填表→召回→正文」写作闭环（参考资料核心承诺落地）

**写作闭环（自动）**
- 写章节时自动「记忆召回」：用本节大纲 + 作者指令 + 前文 + 角色名 作为召回上下文，命中世界书/结构化表格记忆并注入本轮撰写指令（剧情推进=记忆召回）
- 写完后自动「LLM 填表」：DeepSeek 抽取本章结构化事实回填表格，闭环 正文→填表→召回→正文 全程无需手动调用 API
- 端到端验证：宫斗章节正确召回 4 位妃嫔居住信息，并在续写「甄嬛迁入棠梨宫」后自动把 woman_live 表更新为 甄嬛:棠梨宫

**质量与稳定性**
- 召回净化：自动过滤内容含「[自动发现]」的占位世界书，结构化表格命中优先，单次召回上限 12 条，避免 prompt 膨胀与低质记忆污染
- 后处理容错：审校/摘要的 LLM 调用若因限流/超时失败，不再中断整章交付，降级为「仅生成」并继续自动填表、照常发送 done
- 填表 LLM 调用加 120s 防御性超时，慢响应不再卡住 SSE 流
- 前端透明化：实时 toast 提示「宝宝流记忆召回 N 条」与「自动填表完成：写入 M 行」，闭环每一步用户可见

---

## v0.27.1 — 2026-07-27

### 🐛 修复宝宝流自动填表多行互相覆盖（稳定性）

**稳定性修复**
- 修复 /api/babylore/fill 累积写入 bug：同一张表的多个 insert 操作此前会在循环内从原始空数组重新拷贝，导致互相覆盖、只保留最后一行（如宫斗 4 位妃嫔只写入 1 位安陵容）
- 改为按表维护累积 rows 副本（rowsCache），同表多操作串行生效；现已正确写入全部 4 行（华妃/翊坤宫、皇后/景仁宫、甄嬛/碎玉轩、安陵容/延禧宫）
- 生产构建（next build）已通过 TypeScript 类型检查与 69 页静态生成，可正常部署上线

---

## v0.27.0 — 2026-07-27

### 🗂 宝宝流数据库内核 + 创意工坊/共创社区：把参考资料变成可共享预设

**宝宝流数据库内核（结构化表格 + LLM 填充 + 剧情推进召回）**
- 新增 LoreTable 模型：世界书升级为结构化表格（人物/地点/物品/属性/时间线），行列可自定义，对标宝宝流「妃嫔居住建筑表」
- 新增 /api/babylore/fill：每章写完后 DeepSeek 自动填表（国模填表精确配置：关 COT + 严格 JSON + 温度 1 + 失败重试 3 次），抽取结构化事实写入表格
- 新增 /api/babylore/recall + recallContext 服务：剧情推进=记忆召回，按世界书绿灯关键词与表格行匹配，注入应召回的记忆（不替作者写剧情）
- 大纲生成已增量注入召回命中项；项目内「结构化表格」页支持建表/行编辑/自动填表/召回预览

**创意工坊 / 共创社区（预设中心）**
- 新增 Preset 模型与 /api/presets（列表/上传）、/apply（套用到项目）、/fork（复刻二创）
- 把参考资料本身实体化为「预设」：表格模板预设、剧情推进预设、文风、世界观、角色卡均可一键套用
- 内置 4 个示范预设（宫斗居住表 / 好感度分阶段人设 / 古风严谨文笔 / 仙侠世界观骨架），首次部署 POST /api/seed/presets 注入
- 顶栏新增「创意工坊」入口；工作区新增「结构化表格」「创意工坊」按钮；产品免费、非商业

---

## v0.26.3 — 2026-07-26

### 🛡 API 错误收敛与优雅降级：环境变量配置 DeepSeek、拆书页无 DB 不崩溃

**API 错误收敛与可读化**
- 拆书列表 `/api/dissect/list`、项目详情 `/api/projects/[id]`、角色 `/api/characters/[id]`、`/api/characters`、规则 `/api/rules`、故事线 `/api/storylines`、待办 `/api/pending-items`、统计 `/api/stats/monitor`、节点 `/api/story/nodes`、伏笔 `/api/foreshadowing/list`、世界书 `/api/lorebook/[id]` 等路由的 catch 块统一改为 `jsonError(err)`
- 消除数据库未连接时 API 返回的原始 `__TURBOPACK__...` / `prisma.xxx.findMany()` 内部堆栈，前端拿到的是 `{error, code, hint}` 结构化的中文可读错误

**无数据库时的优雅降级**
- 拆书页 `/dissect` 加载失败时不再弹出内部错误边界，改为居中友好空状态：标题「拆书任务加载失败」+ 错误原因 + 修复指引 +「重试」按钮
- 拆书页在加载错误期间暂停 3 秒自动轮询，避免反复请求失败接口

**环境变量配置 API**
- 在用户目录 `novel-forge-github/.env` 与沙箱仓库 `.env` 写入 DeepSeek 配置：`LLM_PROVIDER=deepseek`、`LLM_API_KEY`（用户提供）、`LLM_MODEL=deepseek-v4-flash`、`LLM_BASE_URL=https://api.deepseek.com`
- `DATABASE_URL` 默认指向 `docker compose up -d` 启动的 PostgreSQL，用户只需启动 Docker 即可让数据层跑通

**质量验证**
- `npx tsc --noEmit`：零错误
- `npm run build`：64 页静态生成通过
- 本地 3001 服务重启后 `/`、`/changelog`、`/settings`、`/explore`、`/dissect` 全部 200，浏览器控制台无 JS 报错
- `curl /api/dissect/list` 验证返回结构化中文错误，不再暴露 Prisma 内部路径

---

## v0.26.2 — 2026-07-26

### 🛡 Pipeline 检查与 bug 修复：数组空值兜底、lorebook 死代码清理、类型对齐

**运行时 bug 修复**
- LeftPanel 向子组件传递的数组统一加 `?? []` 兜底：`project.storyNodes ?? []` / `project.characters ?? []` / `project.lorebookEntries ?? []`，避免后端数据缺少字段时进入对应 tab 白屏
- CharacterList / WorldPanel 的数组 prop 改为可选（`characters?: CharacterData[]`、`entries?: LorebookData[]`）并默认空数组，从调用方到组件自身双层防御空值

**lorebook 死代码清理**
- v0.26.1 移除工作台冗余 lorebook 标签后，`onNewLore` / `showNewLore` / `<LorebookCreateDialog>` 已没有任何入口可触发，成为死代码；已清理 LeftPanel 与 workspace/[projectId]/page.tsx 中相关 props/state/渲染
- 删除无人引用的组件文件 `LorebookList.tsx`（全仓 0 import）与 `LorebookCreateDialog.tsx`（仅被死代码渲染），精简代码库

**类型与一致性**
- LeftPanel 与 workspace 页面的 tab 联合类型移除已废弃的 `"lorebook"`，避免误切到无对应渲染分支的空白面板

**pipeline 检查**
- 运行 `npx tsc --noEmit`：零错误
- 运行 `npm run lint`：680 个既有 `no-explicit-any` 历史债务（memory-classifier/memory-decay 等），本次改动未引入新 lint 错误
- 浏览器自动化检查 3001 首页/设置/探索/拆书/公告页：无客户端 JS 报错，无崩溃

---

## v0.26.1 — 2026-07-26

### 🧹 前端按钮去重与矛盾消除：共享删除 Hook、冗余标签清理、加载态补全

**删除逻辑去重（重构）**
- 新增共享 Hook `useConfirmDelete`（src/components/workspace/useConfirmDelete.ts）：统一封装「确认弹窗 → 忙态锁定 → 删除 → 成功刷新 / 失败 toast」流程
- 7 处删除入口（角色 / 故事线 / 规则 / 世界书条目 / 项目 / 拆书任务 / 章节节点）改用该 Hook，移除约 90 行重复样板，并消除各文件删除错误处理不一致、提示文案凌乱的隐患

**矛盾按钮消除（修复）**
- 工作台侧栏原 `world` 与 `lorebook` 两个标签渲染同一 WorldPanel，形成重复且矛盾的入口；删除冗余的 lorebook 标签，仅保留 world 单一入口
- CharacterList 的 `onDelete` 由 `() => void` 修正为 `() => Promise<void>`，删除失败现在能被 Hook 正确捕获并提示，不再被静默吞掉

**按钮加载态补全（修复）**
- 大纲树（OutlineTree）章节节点删除按钮此前缺失禁用/忙态，点击后无视觉反馈；现接入 `deletingId`，删除进行中禁用并锁定该按钮，防重复点击，消除「点了没反应」的矛盾观感

**构建与自检（质量）**
- tsc --noEmit 零错误；生产构建 64 个页面零警告通过
- 本地服务自检：首页 / 设置 / 更新面板 / 探索 / 拆书 等所有页面路由返回 200，渲染真实内容（非错误边界）

---

## v0.26.0 — 2026-07-26

### 🔔 交互硬化与 UI 美化：全局提示系统、按钮反馈与 DeepSeek 跑通

**全局交互系统（新增）**
- 新增全局 Toast + Confirm + Prompt 组件（src/components/ui/toast.tsx），统一替代所有原生 alert / confirm / prompt：右下角滑入、按类型（成功/错误/警告/信息）着色、自动消失、可手动关闭；确认/输入弹窗为虚空玻璃风格模态框、返回 Promise，Provider 未挂载时安全退化为原生对话框
- 全局按钮基础样式（globals.css）：所有按钮（含原生 `<button>`）统一具备点击下沉、禁用态、聚焦光环的视觉按压反馈
- 共享 Button 组件新增 `loading` 属性：异步操作期间显示 Spinner 并自动禁用，点击「有确定感」

**全站交互硬化（修复）**
- 19 个文件原生 alert 全部替换为分类型 toast：错误不再被静默吞掉，成功/信息有明确正向反馈
- 7 处破坏性删除（角色 / 故事线 / 规则 / 世界书条目 / 项目 / 拆书任务 / 章节节点）原生 confirm 替换为 styled 确认弹窗，并加 deleting 忙态锁定删除按钮，误删风险归零
- 工作台「新建章节 / 小节」原生 prompt 替换为 styled 输入框弹窗（promptDialog），保持视觉一致

**DeepSeek 跑通（新增 / 修复）**
- llm.ts 新增各 Provider 默认模型表（DeepSeek → deepseek-v4-flash 等）；模型留空不再硬报错，读者只填 Key 即可跑
- testLLMConnection 默认模型按 Provider 取值，并兼容 DeepSeek v4 等推理模型（先思考后输出正文）——连接测试不再误判「返回格式异常」
- 实测：以用户提供的 DeepSeek Key 经 /api/settings/test 与原始 HTTP 调用均返回 200，模型正常响应（推理模型会把 token 用于 reasoning_content，正文在充足 token 预算下输出）

---

## v0.25.0 — 2026-07-26

### 🎨 UI 优化：首页重塑、布局修复与响应式打磨

**布局缺陷修复（必须修）**
- 系统自检横幅原为 `sticky top-0 z-50`，与页面 `sticky top-0 z-10` 页头争抢顶部，导致页头被横幅遮挡、点击区域错位
- 现改为 `relative`：横幅处于文档流顶部、滚动时自然让位给粘性页头，重叠消除（system-status-banner.tsx）

**首页重塑（page.tsx）**
- 新增 Hero 欢迎区：标题「构建你的小说宇宙」+ 一句话定位 + 开始创作 / 拆书分析双 CTA，首屏更有产品感
- 空项目状态由居中提示改为三张「起步引导卡」：探讨模式、拆书分析、配置 AI——直接引导用户完成「填 Key」这一关键第一步

**响应式与一致性**
- 顶栏「开始创作 / 拆书 / 设置」按钮在移动端（<640px）自动隐藏文字仅留图标，窄屏不再拥挤
- 更新面板「最新」徽标由 emerald 绿统一为 indigo 靛蓝（changelog/page.tsx），与该页及全站设计令牌一致

---

## v0.24.9 — 2026-07-26

### 🏗️ 成品化：去远程字体依赖，整站可离线构建

**移除 next/font/google 远程字体（layout.tsx + globals.css）**
- 原：`layout.tsx` 用 `next/font/google` 拉取 Geist / Geist_Mono / JetBrains Mono，构建期需联网；无外网环境（如隔离沙箱）`next build` 必然失败
- 现：`layout.tsx` 移除三处远程字体声明；`globals.css` 顶层 `:root` 定义 `--font-geist-sans/mono`、`--font-jetbrains` 为系统字体栈（中文回退 PingFang SC / Microsoft YaHei），Tailwind `@theme inline` 与页面字体变量无缝衔接
- 效果：任意环境（含无外网）`next build` 均可成功，64 页静态生成通过，TypeScript 零错误

**消除 Turbopack workspace root 误判警告（next.config.ts）**
- 原：构建警告「Next.js inferred your workspace root... detected multiple lockfiles」，因上层目录存在多余 lockfile 误判 root
- 现：`next.config.ts` 显式 `turbopack: { root: process.cwd() }`，构建输出干净无警告

**可移植性提升**
- 部署不再依赖构建期联网拉字体；`docker compose up -d` + `npx prisma db push` + `npm run dev`（端口 3001）即可起站

## v0.24.8 — 2026-07-26

### 🗑️ 修最后 1 处必须修：拆书任务删除假成功（未查 res.ok）

**拆书任务删除（dissect/page.tsx handleDelete）**
- 原逻辑：`await fetch(DELETE)` 后直接 `setTasks(filter)` 移除列表项，不检查 res.ok → 服务端 4xx/5xx 时 UI 显示已删而服务端仍在=假删除成功（数据丢失隐患）
- 现改为：先判 `res.ok`，失败 `alert` 具体 HTTP 状态且不移除列表项，成功才移除

**收敛里程碑**
- 至此前端所有写操作（保存/删除/开关/采纳/同步）与加载失败均显式可见，无剩余「必须修」静默吞错/假成功；原模板核心功能（探讨/拆书/游戏/Agent工具/记忆S-A-B/伏笔/规则中心/文风+废词/质量矩阵/更新表）集成完整、无死链。
- 部署侧 `docker compose up -d` 起 PostgreSQL 后即可完整跑站（沙箱无 DB/无外网字体，构建需在部署侧执行）。

---

## v0.24.7 — 2026-07-26

### 🔍 收口全局静默吞错（角色卡采纳/世界书新建/文风应用·保存 + 加载失败可见化）

**写操作假成功（4 处必须修）**
- AIChatBar handleAdoptSuggestion：采纳角色卡建议原不检查 GET/PUT 的 res.ok（非 2xx 静默）→ 现 GET 失败显式提示并 return、PUT 失败显式提示，不再「点了没反应」
- WorldPanel 新建世界书：原 `if(res.ok)` 无 else、catch 静默 → 现失败 alert 且不关闭表单
- StyleSelector 应用文风 / StyleEditor 保存文风：PUT 失败仍关弹窗=假成功 → 现失败 alert 且不开窗/不关闭，成功才生效

**加载失败可见化（4 处）**
- settings 加载设置：原 `if(res.ok)` 无 else、catch 空 → 现失败显式提示
- ContextPreview 上下文预览：加载失败原静默显示「无法加载上下文数据」→ 现显式报错条 + 原因
- StyleEditor 加载文风配置：失败原静默用默认配置 → 现显式报错弹窗
- ImitationPanel 拆书任务列表/维度加载：原 catch 静默置空 → 现显式提示失败原因

---

## v0.24.6 — 2026-07-26

### 🔍 收尾 P1 静默吞错（章节提取/节点操作/故事线/关系同步/角色·词条·规则删除·开关）

**章节与节点操作**
- autoExtractChapter（12 维度自动提取）：失败原仅 console.error 静默 → 现 alert 明确提示，不再「转圈后无结果」
- handleAddSection / handleSummarize：非 200 原静默 → 现失败 alert 具体原因；网络异常也提示
- handleDeleteNode：网络异常原静默 → 现 alert

**故事线面板（StorylineList）**
- 加载失败原误显「还没有故事线」空态 → 现显式报错条 + 重试按钮，区分「无数据」与「加载失败」
- handleSave / handleDelete：原不检查 res.ok（保存失败仍关弹窗=假成功）→ 现失败 alert 且不关弹窗/不刷新

**关系同步与侧栏删除·开关**
- AIChatBar relation_sync：原不检查 syncRes.ok 且 catch 静默 → 现非 200 抛错 + 失败 alert，同步真实结果才提示
- AIChatBar analyze_relationships 的 catch 静默 → 现失败 alert
- LeftPanel 角色删除 / WorldPanel 词条删除 / RulesPanel 规则删除·开关：原不检查 res.ok → 现失败 alert 且不刷新（避免误以为已删/已切换）

---

## v0.24.5 — 2026-07-26

### 🛡️ 修 P0 假成功/数据丢失（抽卡章纲 + 角色/词条弹窗 + 作者注记）

**抽卡章纲保存（handleDrawSelect）**
- 原逻辑：PUT 保存失败被 `catch {}` 静默吞掉，仍乐观显示「已采用」→ 用户以为章纲已存，刷新后丢失
- 现改为：先请求成功（`res.ok`）才更新显示「已采用」；失败 `alert` 明确原因，不再误导

**角色/词条 编辑·创建弹窗**
- CharacterEditDialog / LorebookEditDialog 的 `handleSave`：原直接 `await fetch` 后 `onSave+onClose`，不检查 `res.ok` → PUT 失败弹窗关闭=假成功（编辑丢失）
- CharacterCreateDialog / LorebookCreateDialog 的 `handleSave`：POST 失败无提示 → 点了没反应
- 现四个弹窗统一：检查 `res.ok`，失败 `alert` 且不关闭弹窗（保留用户输入可重试），成功才 `onSave+onClose`

**作者注记自动保存（handleAuthorNoteChange）**
- 防抖 PATCH 原 `catch {}` 静默 → 服务端未存时刷新即丢注记，用户无感
- 现失败 `alert` 提示（区分 5xx/网络），并保留 `localStorage` 兜底

---

## v0.24.4 — 2026-07-26

### 🔧 后端错误结构化 + 死代码清理

**后端错误响应结构化**
- explore/create、explore/chat（对话/一键生成/大纲三处）、agent/extract-chapter、imitate/start 外层共 6 个 catch 统一改用 `jsonError`
- 返回标准化 `{ error, code, hint }`：Prisma/网络连接错误给出针对性中文修复指引（如「请执行 `npx prisma db push` 建表」），不再只甩原始堆栈
- SSE 流式错误（explore 大纲流、imitate 流内）此前已用 SSE error 事件推送，保持不变；settings/test 维持 `{ ok:false, error }` 前端契约不改

**死代码清理**
- 删除 `src/lib/conversation-compressor.ts`——全代码库 0 引用（仅更新日志历史文本提及），属历史遗留冗余模块

---

## v0.24.3 — 2026-07-26

### 🛠️ 工作台静默错误清零（修白屏 + 修假成功）

**工作台加载失败不再白屏**
- workspace/[projectId] 的 `loadProject` 原本 catch 仅 `console.error` → 后端 / DB 未就绪时整页白屏且无任何提示
- 现统一错误状态：网络异常或 5xx 显示可读错误卡片（含原因）+「重试」按钮；仅 404 判定「项目不存在」跳转首页
- 错误提示明确指引：请检查后端服务是否已启动并连接数据库

**大纲保存假成功修复**
- `onEditOutline` 原 `catch {}` 乐观更新后静默吞错 → 保存其实失败时用户以为成功、数据已丢
- 现捕获 `prev`、请求非 2xx 或网络异常时回滚选中节点并 `alert` 明确原因，杜绝静默丢数据

---

## v0.24.2 — 2026-07-26

### 🚪 修复部署启动链路（直击「完全不能用」真实根因）

**端口错配修复（最关键）**
- README / AGENTS 全程写 `localhost:3001`，但 npm 脚本原是 `next dev`（Next 默认 3000）——用户照文档打开 3001 必然是空白页，极可能是「完全不能用」的真实主因
- `dev` / `start` 改为 `next dev -p 3001` / `next start -p 3001`，与文档完全对齐

**环境要求校正**
- `package.json` 加 `engines: { node: ">=20" }`，Next 16 强要求 Node ≥20（低于 20 会启动失败）
- README 表格 Node 版本 `18.x` → `20.x（≥20）`，安装说明同步强调；方式二「手动 PostgreSQL」补上 `echo DATABASE_URL > .env` 步骤（此前漏写会导致 `npx prisma db push` 直接失败）

**配套（见 v0.24.0 / v0.24.1）**
- 系统自检横幅 + `/api/health` 探针：打开即提示数据库 / AI 是否就绪
- `npm run doctor` 启动前自检；前端删除 / 拆书失败均显式提示

---

## v0.24.1 — 2026-07-26

### 🖥️ 前端错误不再静默（修「点了没反应」）

**前端 fetch 错误可见化**
- 仪表盘「删除项目」失败（含非 200 响应）现在弹窗明确提示原因，不再静默无反应
- 拆书列表加载失败显示红色报错条 + 重试按钮，不再误显示「还没有任务」空态误导用户
- 拆书详情轮询失败显示顶部报错条 + 重试，避免轮询静默后界面空白
- 首页底部链接「更新公告」统一更名为「更新面板」，与站内面板命名一致

**后端配套（见 v0.24.0）**
- 探讨/采纳、拆书、实体高亮、Agent 工具等高频路由 catch 改用 `jsonError`，返回 `{ error, code, hint }` 中文操作指引
- 全局 `error.tsx` / `global-error.tsx` 错误边界，未捕获异常显示中文友好页而非白屏

---

## v0.24.0 — 2026-07-26

### 📋 站内更新面板 + 高频路由错误可读化

**站内更新面板（/changelog）**
- 页面顶部突出「当前版本」号与「最新」徽标，用户随时回看每个版本的版本号与更新内容
- 固化记录协议：每次改动都在 `src/lib/changelog-data.ts` 的 `VERSIONS` 数组插入条目 + 同步本文件（两文件一起提交），面板即唯一记录出口

**高频 API 路由错误可读化**
- 探讨「采纳」、拆书「查询 / 删除 / 启动」、实体高亮、Agent 工具执行 等 5 个高频路由的 catch 统一改用 `jsonError`，返回 `{ error, code, hint }` 中文操作指引
- 彻底告别「点了没反应却不知为何」——前端拿到可读错误即可直接展示

**健壮性修复**
- 修复 `/api/health` 中 `llm.hint` 可能 `undefined` 的类型错误
- 新增全局 `error.tsx` / `global-error.tsx` 错误边界，未捕获异常显示中文友好页而非白屏

---

## v0.23.0 — 2026-07-25

### 🩺 系统自检与首启动引导（失败可读化）

**系统状态自检横幅**
- 根布局挂载全局 `SystemStatusBanner`，打开任意页面即调用 `/api/health` 探测 DB 与 AI 配置
- 数据库未连接 / AI 未配置时顶部弹出琥珀色横幅：说明原因 + 给出 `docker compose up -d && npx prisma db push` 一键修复命令（可复制）或「去设置页填 Key」入口
- 直击此前「完全不能用却找不到原因」的核心痛点——失败现在可读、可操作，而非静默空白

**健康检查探针**
- 新增 `GET /api/health`——只读轻量探针，返回 `{ db:{ok,error,hint}, llm:{ok,error,hint}, version }`
- DB 探测用 `SELECT 1` 实际连库（区分「环境变量存在 ≠ 有效」）；LLM 探测复用 `getSettings` 配置优先级
- 任何异常都被吞掉并返回结构化结果，自检本身绝不拖垮页面

**API 错误可读化**
- 新增 `src/lib/api-error.ts`：`classifyError` 把 Prisma 错误码（P1001 连不上 / P1000 登录失败 / P2021 表不存在 / P2024 连接池耗尽 / P2002 唯一冲突 …）翻译为中文操作指引
- `jsonError()` 统一返回 `{ error, code, hint }`，已接入 `/api/projects` 与 `/api/settings` 两个首个触点路由

**首页加载失败可见**
- 仪表盘加载项目失败时不再误显示「还没有小说项目」空态，改为明确报错卡片 + 重试按钮
- 提示用户查看顶部黄色自检横幅按指引修复

---

## v0.22.0 — 2026-07-25

### 🛡️ 稳定性与可观测性加固

**AI 错误可读化**
- 所有 LLM 调用（流式 / 非流式）的报错从 `LLM API Error 401: ...` 这类原始信息，统一翻译为可操作中文提示
- 覆盖 401（Key 无效 / 过期）· 403（无权限）· 404（模型不存在，附「硅基流动 deepseek-ai/DeepSeek-V4-Flash」vs「DeepSeek 官方 deepseek-v4-flash」格式提示）· 429（限流）· 5xx（服务端异常）· 网络不可达 等场景
- 网络层异常（如 Base URL 配错、服务断连）也会给出明确指引，不再静默 500

**启动自检（doctor）**
- 新增 `npm run doctor`——启动前自动校验 PostgreSQL 可连接、LLM 配置是否就绪
- 明确区分「环境变量存在 ≠ 有效」，避免「完全不能用」却找不到原因

**更新表同步**
- 本文件（CHANGELOG.md）与 `src/lib/changelog-data.ts` 同步更新至 v0.22.0

---

## v0.21.2 — 2026-06-21

### 📖 README 重写——安装体验大幅优化

**Docker 一键安装（最大改进）**
- 🐳 新增 Docker 作为首选安装方式——一条 `docker compose up -d` 替代手动装 PostgreSQL
- 快速开始拆为两条路径：Docker（推荐）和手动安装，各自独立可复制
- 详细教程新增"方式一：Docker"完整指南——4步从零到跑起来
- 补充 Docker 常见问题：关数据库、公网部署

**修复旧版 README 的坑**
- 环境表格补上 Git（之前只列了 Node.js/npm/PostgreSQL，克隆项目用的 Git 反而没写）
- PostgreSQL 创建命令从硬编码路径 `PostgreSQL\16` 改为 `createdb` 直调 + 版本号替换说明
- 新增"生产部署"章节——`npm run build && npm start`，日常使用更省资源

### 🔧 次要修复
- README 目录更新，新增 Docker 锚点链接

---

## v0.21.1 — 2026-06-18

### 🎨 虚空玻璃设计体系——全站UI体系重建

**3级深度表面系统**
- `surface-base`（基底面——CSS噪点纹理消除塑料感）
- `surface-elevated`（抬升面——卡片/面板，悬停边框辉光+阴影扩增）
- `surface-floating`（浮起面——模态/弹窗，最高模糊+最深阴影）
- 旧版兼容：`.glass-surface` / `.glass-surface-strong` 保留

**8色功能语义色彩（OKLCH空间）**
- 靛蓝(主操作/生成) · 翠绿(确认/保存) · 琥珀(提醒/待处理) · 玫瑰(删除/危险) · 紫罗兰(AI/魔法) · 青(提示/信息) · 金(强调/高亮) · 灰(禁用)

**4档动画系统**
- 弹性曲线(cubic-bezier 0.34,1.56,0.64,1) + 缓出/缓入/平滑
- 4档时长：150ms(微交互) / 250ms(标准) / 400ms(强调) / 600ms(页面)

**5种按钮变体**
- `btn-primary`(靛蓝渐变) / `btn-success`(翠绿渐变) / `btn-danger`(玫瑰渐变) / `btn-creative`(紫罗兰渐变) / `btn-ghost`(幽灵按钮)
- 统一 hover 上浮 + active 按压反馈
- `input-glass` 统一输入框——聚焦辉光 + 悬停边框

### 🧩 SVG图标系统

- **30+ Lucide图标**：`src/components/ui/icons.tsx`——`<Icon name="..." size={} />` 统一接口
- **StatusDot 彩色圆点**：替代 🟢🟡🔵🔴⚫，带辉光阴影
- **语义色彩预设**：`iconColor.primary/success/warning/danger/creative/info/accent/muted`
- **全站迁移**：15个页面/组件 emoji → SVG，约50处替换

### 🔤 字体优化

- **中文fallback链**：Geist Sans → PingFang SC → Microsoft YaHei → system-ui
- **等宽字体**：JetBrains Mono（替代Geist Mono）用于代码/API Key
- **4级文字明度**：L1主(#EEECE6 16:1) / L2辅(#9E9C94 6:1) / L3弱(#6B6962 3.5:1) / L4禁用(#484640)
- **排版比例变量**：`text-2xs`→`text-2xl` + `leading-tight/normal/relaxed`

### 🖱️ 悬停 + Tooltip 系统

- **3级悬停阴影**：`--shadow-hover-sm/md/lg` + **3色辉光**(indigo/success/creative)
- **Tooltip纯CSS**：`data-tooltip` 属性驱动，毛玻璃背景，零JavaScript依赖
- **链接悬停下划线动画**：`.link-underline`——伪元素 + width过渡
- **`prefers-reduced-motion`** 支持——尊重系统无障碍设置

---

## v0.21.0 — 2026-06-18

### ✨ UI 全面升级——玻璃态设计

- 35+组件统一视觉：`bg-white/[0.02] backdrop-blur-sm` 玻璃表面 + `active:scale-[0.97]` 按压反馈
- 首页/设置面板/更新公告/探讨页面/工作台/拆书页 全部页面 Premium 化
- 新增设计 token 类：`.glass-surface .btn-press .card-lift .glow-pulse .fade-in-up`
- 自定义滚动条样式 + 聚焦光环 + 渐变按钮阴影 + 悬停上浮效果
- 探讨页面拆分为 ChatPanel / OutlinePanel / CardBrowser / BuildConfigPanel / AdoptedContentPanel 五个独立组件

### 🎯 探讨模式架构重构

- 新增共享工具模块 `src/core/explore/utils.ts`——消除3处重复代码（stepToCategory / extractJson / extractKeysFromText）
- chat/route.ts 复用 extractJson（-15行）
- adopt/route.ts 复用 stepToCategory + tryExtractStructured + extractCharacterKeys（-55行）
- create/route.ts 复用 stepToCategory + extractKeysFromText，重写 generateDefaultRules()
- 删除废弃端点 outline/route.ts（207行死代码，零引用）
- 顶栏新增全局模式切换器（大纲模式也能切回聊天）

### 📝 写作铁律自动注入系统

- 新建项目时自动创建7条写作铁律到 Rule 表（scope=write_only, priority=94~100）
- 句式铁律——长短交错，禁止短句堆砌
- 人物指代——名字优先，禁止他/她连用
- 禁用符号与禁用句式——破折号/括号/数字对白全部禁止
- 禁止描写声音/语气/眼神/视线
- 白描铁律——只呈现可观察的动作和对白，零作者解读
- 节奏控制——细节密度20-30%，快慢节奏切换
- 情节与情绪——每章至少一次反转，抑扬交替
- 生成时自动注入：getActiveRules("write_only") → injectRules() → 拼入 Prompt 顶部

### 🔧 拆书功能增强

- 15维度智能拆解 + 仿写引擎 + 并行化8x提速
- 拆书结果 UI 重设计——双路径创建项目
- 角色扩展 Step 0 硬过滤 + 复合名智能拆分 + 预览迷你卡
- 世界书 AI 扩展五步管线（审计→拆分→删非词条→去重合并→扩展）

---

## v0.20.36 — 2026-06-18

### 🎯 探讨模式 —— 对话式构建小说世界

**核心体验**
- `/explore` 页面：三栏布局——左构建配置 / 中AI对话 / 右已采纳内容
- 11个构建步骤导航（开篇→世界观→主角→金手指→冲突→势力→力量→货币→地图→情节→自由讨论）
- 双模式切换：💬 自由对话 / 🃏 抽卡模式（AI给出3-5张候选方案卡片，点选立即采纳）

**构建配置面板**
- 基础：小说名称 + 主角名称 + 创作方向
- 进阶：12种类型 · 60+流派标签 · 受众定位 · 篇幅字数 · 情节结构（五幕式/三幕式/英雄之旅/起承转合/序破急）
- 深度：风格偏好8选 · 力量体系40选 · 金手指50选 · 核心冲突 · 强制原创命名

**创建项目**
- 📦 直接创建 —— 已采纳设定自动导入世界书（按步骤分类）+ 主角名创建角色卡
- 🤖 AI完善后创建 —— LLM检测缺失设定并补充
- 导航栏新增「🎯 探讨」入口

---

## v0.20.35 — 2026-06-18

### 🛡️ Step 0硬过滤 + 复合名智能拆分 + 拆书预览迷你卡

**Step 0 硬过滤（代码级预筛）**
- `characters/expand` 在AI审计前增加硬过滤——`isValidCharName()` 内联实现
- 100+字段标签硬黑名单 + 100+常见姓氏白名单
- 处理顺序：硬过滤删除→复合名拆分→AI审计→去重合并→并发扩展
- 彻底杜绝AI扩展后字段标签被填满假数据导致二次审计误判的问题

**复合名智能拆分**
- 「叶临渊 / 林玄言」在硬过滤阶段检测到 "/" → 自动拆为两个独立角色卡
- 拆分后继承原卡的 background/abilities/personality 等数据

**拆书预览迷你卡**
- 角色预览从简单name标签改为迷你角色卡（头像+名字+角色badge+描述）
- 角色定位色彩区分：★主角(amber) / ◆反派(red) / ◈导师(blue) / ●配角(gray)
- 预览格式匹配工作区CharacterList——导入前后视觉完全一致

---

## v0.20.34 — 2026-06-18

### 🔧 AI审计prompt修复 —— 字段标签黑名单

**角色扩展审计修复**
- 新增【🚨绝对非角色】黑名单——50+字段标签永久排除
- 分段标题（「一、主角」「二、主要配角」）直接标记为非角色
- 单字属性碎片（「在」「背」「与」「性」「说」等）永不误认
- 常见姓氏引导（李王张刘陈杨赵黄周吴等100+）辅助真人识别

**世界书扩展审计修复**
- 新增【🚨绝对非词条】黑名单——字段标签+角色名双重检测
- 2-4字中文姓名自动排除出世界书列表

**端到端检验**
- 琼明神女录项目实测：30角色→审计合并13组重复→17个去重
- 修复后再扩展：将正确删除12个字段标签→保留3-5个真实角色

---

## v0.20.33 — 2026-06-18

### 📚 世界书AI扩展 + 五步管线

**世界书AI扩展端点**
- 新增 `POST /api/lorebook/expand` — SSE流式，12并发
- 对标角色卡扩展端点（`/api/characters/expand`），完整五步管线
- LorebookList 新增「🤖 AI扩展」按钮——勾选词条后一键处理

**五步管线**
1. **AI审计**：一次LLM调用检测非词条（角色名混入）、组合词条（多主题混杂）、分类错误
2. **拆分**：组合词条按拆分方案各建独立词条，原内容按比例分配
3. **删非词条**：自动删除被识别为非词条的条目
4. **去重合并**：标题相似度检测→合并内容+触发词→删重复
5. **并发扩展**：12并发补全内容/生成触发词/修正分类/响应拆分请求

**UI**
- 扩展进度条：审计→预处理→逐词条完成状态
- 结果弹窗：成功列表+失败原因明细
- 与整理/导入/AI填满按钮形成完整世界书工具链

---

## v0.20.32 — 2026-06-18

### 🔧 角色名合法性校验 + 🤖 AI批量结构化

**核心修复——角色名过滤**
- 新增常见中文姓氏库（100+单姓 + 20+复姓如欧阳/慕容/尉迟）
- 2字名必须以常见姓氏开头才被识别为角色名
- 新增 FIELD_LABELS 过滤集（100+字段标签）——性别/年龄/外貌/说话风格/别名/称号/关键剧情等永远不会被误认为角色名
- `isValidCharacterName()` 统一校验：纯中文 + 长度2-5 + 含姓氏 + 不在标签集
- 含顿号的分段标题（「一、主角」「二、主要配角」）自动过滤
- 「叶临渊 / 林玄言」→ 自动拆分为两个独立角色

**AI批量结构化**
- `aiStructureCharacters()` — 兜底扫描出的角色名，一次LLM调用补全所有年龄/性别/外貌/性格/背景/能力
- 结构化输出完整映射 CharacterCard 字段
- AI失败自动降级为仅名字导入，不阻断流程
- 兜底导入角色自动加「🤖AI补全」标签

---

## v0.20.31 — 2026-06-18

### 🔧 角色导入修复 + 🤖 AI填满按钮 + 📋 格式统一

**角色导入修复（根因解决）**
- quick模式分割重试：维度内容<20字符自动尝试模糊匹配标题变体，仍失败则发起独立LLM重试
- 角色兜底提取：主维度解析失败时，自动从大纲摘要/故事核心/势力阵营/情节脉络扫描角色名
- 角色预览卡片：拆书完成页顶部展示提取到的角色数量+角色名列表

**AI填满按钮**
- 角色卡编辑标题栏新增 🤖 AI填满 按钮：自动检测空白字段（外貌/性格/对话风格/背景/能力/隐藏动机等），一键LLM补全
- 世界书编辑标题栏新增 🤖 AI填满 按钮：自动补全词条内容和触发关键词
- 新增 `POST /api/characters/[id]/autofill` + `POST /api/lorebook/[id]/autofill` 两个端点
- 补全后自动去除「📥拆书导入」标签

**格式统一**
- 拆书→导入角色完整映射CharacterCard字段：appearance/personality/dialogueStyle/hiddenMotives/aliases
- 年龄/性别正则提取（"XX岁"、"男性"等），缺失字段留空不伪造
- 导入预设总览：拆书完成页三卡片——角色数/世界书词条数/文风状态，一目了然

---

## v0.20.30 — 2026-06-18

### 🎨 拆书结果UI重设计 + 双路径创建

**结果展示彻底重做**
- 分组卡片式布局：总览/世界设定/力量体系/角色与剧情/物品与风格 5大组
- 每组可折叠，维度可展开——300字预览→点击展开全部
- 章节摘要双列网格，带编号+标题+摘要
- 告别裸Markdown糊脸，视觉层次分明

**双路径创建项目**
- 📦 **原样转为项目**：100%忠实还原原著，一键创建
- 🎨 **改编后转项目**：先跟Agent聊修改方案（换性别/改设定/调世界观），改到满意再创建
- 改编模式：左侧拆书数据参考 + 右侧Agent对话，聊完点"应用修改并创建"
- `to-project` API 接受 `modifications` 参数——改编要求写入项目 `authorNote` + `globalPrompt`

**技术细节**
- 新增 `DissectAdaptPanel` 组件：Agent对话+修改累积+一键创建
- `convertToProject()` 支持 `modifications` 可选参数
- 改编项目名自动加 `[改编]` 前缀，方便区分

## v0.20.29 — 2026-06-18

### 🔧 拆书进度可视化 + 防抖动优化

**SSE 实时进度（替代 fire-and-forget）**
- start API 改为 SSE 长连接——连接存活 = 任务在跑，不会丢异步上下文
- 进度实时推流：分章→维度提取→每个维度完成→章节摘要，全程可见
- 支持取消：前端 AbortController，用户随时中止
- 即使网络断开，DB 仍有进度，重进详情页可恢复（轮询回退）

**屏幕晃动修复**
- 进度条从 `width` 改为 `transform: scaleX()`——GPU 合成层，不触发 reflow
- 固定 `min-height` 容器：进度区 120px、维度网格 56px、内容区 60vh
- 章节进度区预分配空间（`minHeight: 20`），文本出现时不跳动
- `tabular-nums` 数字等宽，百分比变化时数字不位移
- `will-change: transform` 提前提升到合成层

**轮询逻辑重构**
- 用 `useRef` 存 interval——避免 useEffect 闭包陷阱导致的重复/遗漏轮询
- 始终轮询（不管什么状态），后端决定返回什么
- 任务完成后降频到 30s 一次（省资源）
- taskRef 同步最新状态给 interval 回调

## v0.20.28 — 2026-06-18

### ⚡ 拆书系统性能优化 — 并行化 + 智能采样

**维度提取并行化（~8x 提速）**
- 标准模式：4组维度并行跑 → 耗时从~80s 降至~20s
- 精细模式：15维度并发池(limit=8) → 耗时从~300s 降至~40s
- 快速模式不变（本身就是单次LLM调用）

**章节摘要并发池（~8x 提速）**
- `withConcurrency(8)` 模式——复用 `characters/expand` 的并发池
- 50章从串行~250s 降至并发~35s
- 单章失败不阻断其他章，容错性更好

**智能文本采样（省Token+提质量）**
- `buildDimensionTextSample()`：不同维度看文本不同部位
- 角色维度 → 对话密集段落 + 前5章完整出场
- 风格维度 → 头/中/尾三段代表性样本
- 情节维度 → 各章开头段落（情节通常在章首引入）
- 地图/势力 → 搜索含地名/势力名的段落
- 力量/功法 → 搜索含修炼术语的段落
- 货币/物品 → 搜索含交易/物品关键词的段落
- 预期效果：精准度提升 + Token 节省~30%

**技术实现**
- 通用并发池 `withConcurrency<T,R>(items, fn, limit=8)` —— 任意任务可复用
- 降级容错：单维度失败标记 failed 继续跑，不拖累整体
- 实时进度：每完成一个维度/章节就更新 DB，前端轮询可见

## v0.20.27 — 2026-06-18

### 📚 整本拆书系统 — 15维度智能拆解 + 仿写引擎

**拆书导航（3个新页面）**
- `/dissect` — 拆书任务列表，实时进度追踪，支持导出为 Novel Forge 项目
- `/dissect/new` — 新建拆书，支持TXT文件上传/直接粘贴，三级拆解深度（快速/标准/精细）
- `/dissect/[id]` — 结果展示（15维度标签页）+ 仿写面板（数据源选择+模式+相似度滑块+维度勾选）

**15维度拆解（覆盖世界卡全部维度）**
- 基本信息/世界观/故事核心/角色/情节脉络/大纲摘要/伏笔/地图/势力阵营/力量体系/特殊设定/货币体系/物品/功法体系/写作风格分析
- 三种深度：快速（1次LLM全提）/ 标准（4组分批）/ 精细（15维各单独LLM）
- 可选章节摘要提取：每章独立生成摘要+新角色+伏笔+情感基调

**仿写引擎（基于拆书记忆）**
- 三种模式：完全仿写（高还原）/ 部分仿写（留骨架创新）/ 创意改写（借灵感重写）
- 相似度滑块 0-100%，控制与原作的接近程度
- 15维度自由勾选——选哪些维度就用哪些原作设定
- SSE 流式输出，自定义要求 + 提示词库

**核心技术**
- 三层章边界检测（正则→语义→固定字数回退）
- Prisma 新模型：DissectionTask（JSON存15维度+章节列表）
- 转为项目：自动创建项目+角色卡+世界观条目+风格卡+大纲节点
- 仪表盘新增「拆书」入口

## v0.20.26 — 2026-06-18

### 📐 文风预设扩充 + 大纲模板系统

**10 种文风预设（从 9 种扩展到 11 种）**
- 新增「古风仙侠」——半文半白、修仙体系严密、战斗画面感、环境写意境
- 新增「现代都市」——贴近当代中文、场景驱动、对话为核心
- 11 种预设覆盖：热血/日常/黑暗/悬疑/恋爱/奇幻/科幻/情欲古风/仙侠/都市/自定义

**5 种大纲模板（outlines.ts）**
- 三幕式：建置25%→对抗50%→结局25%，电影级结构
- 起承转合：中国传统四段式，仙侠/玄幻首选
- 英雄之旅：12阶段坎贝尔原型，长篇成长型主角
- 章回体：每章独立成篇+章尾悬念钩子，网文连载节奏
- 自由结构：不拘套路，AI做执行者作者做结构师
- `calculateChapterPlan(template, totalChapters)` 一键计算每阶段建议章数
- `outlineTemplateToPrompt(template)` 注入生成 prompt

## v0.20.25 — 2026-06-18

### 🤖 Agent 工具层——智能调度 + 意图解析 + 分层提示词 + 对话压缩

**工具依赖图调度引擎（tool-scheduler.ts）**
- 拓扑排序：自动分析 21 个工具的依赖关系，并行跑独立查询、串行跑有依赖的
- 18 个查询类工具零依赖可直接并行，3 个生成/分析类工具有依赖自动排队
- 循环依赖检测——无法解析时剩余工具全部放入最后一阶段执行

**意图解析器（intent-parser.ts）**
- 纯规则引擎，零 Token 消耗——关键词 + 正则匹配拆解用户自然语言
- 覆盖 21 个工具的查/改/删/创/写/分析六大意图类别
- 自动从消息中提取角色名/章节号/关键词作为工具参数
- 置信度评分 + 去重（同一工具只取最高分）
- 低置信度/空结果 → `needsLLMFallback()` 返回 true，上游 LLM 兜底

**Agent 路由器（agent-router.ts）**
- 一条管道：自然语言 → intent-parser → tool-scheduler → 结果汇总为自然语言
- 21 种工具各有专属摘要模板（character_list 列角色、project_info 列统计等）
- frontendAction 收集——工具可触发前端动作（如 chapter_generate → 弹出写作面板）
- 失败时 `usedLLMFallback=true`，上游可调 LLM 重新解析

**分层提示词（layered-prompt.ts）**
- 五层结构：身份定义 / 硬规则(★★★) / 中等规则(★) / 动态上下文 / 工具说明
- 每层独立可启用/禁用/替换，管理员可编辑单层内容
- `assembleLayeredPrompt(config)` 按层组装，自动跳过空层/禁用层

**对话历史压缩器（conversation-compressor.ts）**
- 三层策略：自然淘汰(8000+token) → 主动压缩(6000+→300token摘要) → 极端压缩(仅保留最近3轮)
- 纯规则摘要——记录"做了什么"不记录"具体数据"，零 Token 消耗
- `getCompressionAdvice()` 轻量预览，不实际压缩

## v0.20.24 — 2026-06-18

### 🧠 S/A/B 三级记忆注入 + 长效记忆衰减

**S/A/B 三级记忆注入（Token 优化五策略）**
- 新建 `src/lib/memory-injector.ts`——把分级记忆转成优化文本块注入 prompt
- 策略1 JSON结构化：S 级用 `{"ch":3,"e":"事件","imp":"角色"}` 紧凑 JSON，省 ~40%
- 策略2 选择性字段：A 级只输出 Ch+描述，不输出元数据
- 策略3 增量去重：与最近上下文 30 字符窗口匹配，已出现的事件自动跳过
- 策略4 引用压缩：B 级用 `Ch3:玉佩伏笔 | Ch5:秘境试炼` 关键词索引
- 策略5 分层截断：S全量(40%)→A摘要(40%)→B关键词(20%)，超预算静默丢弃
- `pre-processor.ts` 在构建 context 前自动调用 `classifyEvents` 做 S/A/B 分级
- `orchestrator.ts` 在 systemPrompt 中注入优化后的分级记忆块

**长效记忆衰减引擎**
- 新建 `src/lib/memory-decay.ts`——模拟人类记忆遗忘曲线
- 衰减规则：S级永久 / A级30章 / B级15章 / C级5章
- 过期事件自动逐级降级（A→B→C→删除），一次性计算多级跳跃
- `cleanupExpiredMemories(projectId)` 遍历所有章节摘要，应用衰减后写库

**衰减清理 API**
- 新建 `GET /api/cron/memory-decay?projectId=xxx&dryRun=true`
- dryRun 模式预览衰减规则+当前统计，不实际写入
- 正式执行返回完整统计：kept/downgraded/deleted + 各层级事件分布

## v0.20.23 — 2026-06-18

### 🛡️ 写中实时质量拦截 + 六维质量矩阵 + 记忆系统时间线过滤

**实时规则检测（写中拦截）**
- write/route.ts 流式生成中每积累 ~200 字符实时扫描禁用词
- 违规通过 SSE `rule_violation` 事件即时推送——不用等写完整章再回头改
- 扫描耗时 < 2ms，不影响流式生成流畅度

**六维质量矩阵自动评分**
- 新建 `src/lib/quality-analyzer.ts`——纯本地算法，零 Token 消耗
- 六维：废词率 / 展示vs讲述比 / PoV一致性 / 句式多样性 / 对话自然度 / 主语多样性
- 每维 0-100 分 → 加权总分 → A/B/C/D 四级，结果写入 `StoryNode.qualityScore`
- 复用步骤1的禁用词扫描结果，避免重复计算

**记忆系统——时间线感知过滤**
- `context-loader.ts` 自动按 `currentNode.order` 过滤 summaries/storyBeats/pendingCommitments
- 写第7章时不会把第10章的金丹期状态注入生成上下文——根治跳章剧情污染

**待兑现事项追踪**
- 新增 `PendingItem` 模型 + CRUD API（`/api/pending-items`）
- post-processor 自动检测"下次/回头/以后/等下次"关键词 → 创建待办
- 下次生成时待办事项自动注入系统提示词

## v0.20.22 — 2026-06-18

### 🎯 12维风格参数注入生成提示词 + 代码去重

**12维风格参数端到端打通**
- 修复 Style API PUT 路由——`body.dimensions` 不再被静默丢弃，正确存入 `llmConfig`
- 修复 Style API GET 路由——返回 `dimensions` 字段
- orchestrator.ts `buildPromptContext` 读取 `llmConfig.dimensions`，生成风格参数块注入系统提示词
- 12维标签：词汇丰富度/句子长度/描写密度/对话比例/修辞手法/节奏速度/心理描写/环境描写/口语化/幽默感/暴力程度/暧昧程度

**continue/route.ts 消除内联查询**
- 改用 `loadGenerationContext(projectId, currentNodeId, 5)`，与 write/refine 统一
- 删除 9 表 Promise.all 内联查询

**chapter-outline 路由代码去重**
- 新建 `src/core/pipeline/outline-context.ts` 共享模块
- 提取 6 个共享函数：loadOutlineData / extractPrevContext / extractNextContext / buildCharacterList / prepareOutlineDirective / formatSummaries
- chapter-outline/route.ts 和 draw/route.ts 都改用共享函数，各减少 ~60 行重复代码

## v0.20.21 — 2026-06-17

### 🧹 全站架构自查+清理——砍掉 ~3500 行死代码

**前端死代码（5组件）**
- CardUpdater（1051行）— PostGenPanel 替代，已删
- ChapterExtractionPanel（612行）— PostGenPanel 替代，已删
- OutlineGenerator（327行）— OutlineDialog 替代，已删
- EntityDetector（253行）— 旧UI残留，已删
- StreamingText（11行）— MarkdownViewer 替代，已删

**后端死代码**
- /api/agent/logic-check — post-processor 已内联相同逻辑且更完整，已删
- /api/generate/check-all-cards — 三相位检查，前端不调用，已删
- /api/generate/update-style-card — 文风更新走 projects/[id]/style，已删
- commitment-tracker.ts — 完整类定义从未实例化，已删

**Schema 清理**
- Project.povCharacterId — 从未写入的死字段，已移除
- StoryNode.previousVersionId — 从未写入的死字段，已移除
- Store reviewPanelOpen — 不再有 ReviewPanel 组件，已移除

**重复修复**
- ReviewPanel 不再在 CenterPanel 中重复渲染（审校结果只在 PostGenPanel 看）
- PostGenPanel 改用统一的 ReviewIssue 类型，消除内联重复定义
- continue/route.ts 移除未使用的 loadGenerationContext 导入

**抽卡集成 P0 格式**
- DrawCards API 输出 P0 标准格式章纲（C|/R|/L|/G|/P|/CF|/M|/K|/EL|/T|）
- DrawCards 组件新增 P0 语法高亮着色（与 GameOutlineEditor 配色一致）

## v0.20.20 — 2026-06-17

### 📋 P0标准格式章纲系统 + 游戏页内置编辑器

**结构化章纲格式**
- 三层架构：章节元信息（C|/L0|/L1|/L2|）→ 叙事段落（R|/L|/G|/P|/⟨✍⟩）→ 技术规格（CF|/M|/K|/EL|/T|）
- 每行精确语义：R|角色行动 / L|场景切换 / G|金手指触发 / P|剧情推进 / CF|伏笔操作 / M|情绪 / K|金句 / EL|弧线 / T|过渡
- 写作指令 ⟨✍⟩ 作为导演批注，不构成故事内容

**章纲生成API**
- POST /api/game/outline/generate — Agent按P0格式一键生成章纲
- POST /api/game/outline/chat — 多轮对话确认章纲（SSE流式），支持"探讨-反馈-定稿"

**游戏页内嵌章纲编辑器**
- 三模式切换：✏️编辑（语法高亮） / 👁预览（着色渲染） / 💬对话（AI对话确认）
- 行类型着色：C|青 R|绿 L|青 G|金 P|灰 CF|紫 M|玫瑰 K|琥珀 EL|粉 T|青
- ⚡AI生成按钮 + 💾保存到StoryNode.outline

**章节树🎮入口**
- 每个章节节点悬停即显示🎮按钮，点击进入游戏模式
- 无需先在workspace选中章节再点游戏按钮

## v0.20.19 — 2026-06-17

### 🎮 游戏模式——互动文本冒险写作

**独立沉浸式 UI 页面**
- 全新路由 `/workspace/[pid]/game/[nid]`，全屏暗黑主题
- 三栏布局：左侧（情节/角色/势力）+ 主画布（叙事流+选项）+ 右侧（正文/背包/世界）
- 简单星空粒子背景，安静不喧闹

**核心游戏循环**
- 6 个快捷动作：观察/对话/战斗/探索/使用物品/休息 + 自定义文本输入
- AI 逐段生成 300-600 字叙事，每轮给出 2-4 个编号选项
- SSE 流式输出，实时打字感

**实体与背包追踪**
- 每轮自动追踪新实体（NE|格式），类型：角色/地点/物品/势力/功法/生物
- 背包系统（CI|格式），获得/消耗/装备追踪，右侧面板分类展示
- 情节进度百分比，基于章纲情节点自动推进

**结束并导出**
- 点击"结束并导出"→检查章尾悬念钩子→有钩子用钩子收尾，无钩子自然收束
- 拼接全部累积正文→保存为 StoryNode.content，与正常 AI 直写无差别
- 返回工作区即可看到完整章节正文

**后端**
- 新增 GameSession + GameState 两张数据表
- 新增 3 条 API：/api/game/start（初始化）/ /api/game/action（SSE回合）/ /api/game/end（导出）
- 新增 src/core/game/ 模块：game-engine.ts / game-prompts.ts / types.ts
- CenterPanel 新增 🎮 游戏模式入口按钮

## v0.20.18 — 2026-06-17

### 🎨 文风面板全面升级——12维度 + 废词检测内置

**文风编辑器重写**
- 10 种预设风格库（热血/日常/黑暗/悬疑/恋爱/史诗/科幻/古风/极简/自定义），一键切换
- 12 维度滑块微调：词汇丰富度、句子长度、描写密度、对话比例、修辞手法、节奏速度、心理描写、环境描写、口语化、幽默感、暴力程度、暧昧程度
- 三项 Tab：文风维度 / 废词检测 / LLM参数

**废词检测引擎 v3.0**
- 5 类检测器：精确禁用词、句式模式（正则）、身体模板（正则）、模糊词密度（每500字）、AI高频特征词
- 内置 50+ 条检测规则，支持自定义禁用词和正则表达式
- 质量评分 0-100，按严重度/类别分组展示
- [扫描当前章节] 按钮——即时检测并展示上下文+替换建议

### 📊 统一分析面板——4 Tab 替代旧版碎片UI

**PostGenPanel 内联面板**
- 替代旧版 ChapterExtractionPanel（全屏弹窗）+ CardUpdater（旧三卡）+ distillSummary 浮动横幅 + autoUpdateNotification 浮动横幅 + cardUpdatePending 浮动按钮 + "AI分析本章变化"正文下方按钮
- 4 Tab：📊章节提取 / 🔍逻辑自查 / ⚡本地蒸馏 / 📝审校
- 底部操作栏：[全部采纳] [✨继续写下一节] [关闭]

### 🔍 逻辑自查自动化

**新增 /api/agent/logic-check**
- 角色死活一致性：前文标记 dead 的角色本章出场 → error
- 时间线连续：前章时间标记 > 本章 → warning
- 关系突变检测：前文盟友 → 本章敌对，检查过渡描写
- 物品追踪：前3章出现的物品本章未提及 → info

### 🧹 前端大清理

**删除的重复/过时元素**
- ❌ 2 个浮动横幅（蒸馏通知 + 提取通知）
- ❌ 1 个浮动按钮（三卡待更新）
- ❌ 1 个全屏加载遮罩
- ❌ 2 个正文下方按钮（继续写下一节 + AI分析本章变化 → 移至 PostGenPanel）
- ❌ ChapterExtractionPanel 全屏弹窗
- ❌ CardUpdater 旧三卡分析弹窗
- ❌ autoAnalyzeChapter 旧函数

**保留但整合的**
- ✅ 章节提取 → PostGenPanel 📊提取 Tab
- ✅ 本地蒸馏 → PostGenPanel ⚡蒸馏 Tab
- ✅ 审校结果 → PostGenPanel 📝审校 Tab
- ✅ 继续写下一节 → PostGenPanel 底部按钮

---

## v0.20.17 — 2026-06-17

### 🤖 章节自动提取系统——12 维度一键入库

**生成完自动弹出提取面板**
- 一次 LLM 调用提取 12 个维度：出场角色、场景地点、势力阵营、道具物品、伏笔线索、情绪节奏、关键台词、章节摘要、下章衔接、写作要素、角色经历、关系变化
- 逐项展示，可单独采纳/编辑/取消，支持全部采纳/全部忽略
- 智能路人检测：提及 < 3 次 + 无对话 + 无行动 → 标记"疑似路人"，不自动建卡
- 提取结果自动写入对应数据表：角色卡（新建/经历追加/能力追加）、世界书（地点/势力/道具）、伏笔表、章节摘要、下章大纲衔接

**替代旧三卡分析**
- 旧的 CardUpdater 自动触发改为新的提取面板
- CardUpdater 保留手动触发（按钮+浮动按钮）作后备
- 提取失败自动回退到 CardUpdater

**上下游完整贯通**
- 后处理管线 → SSE done → 自动调提取 API → 面板弹出 → 用户选择 → 批量写入 → loadProject 刷新
- 与现有 post-processor 无冲突——提取面板 upsert chapterSummary，不重复写入

### 🕸️ 角色关系——世界书新维度

**数据模型**
- 关系存为世界书条目（`category=character_relationship`），零 schema 变更
- 关系条目格式：A ↔ B：关系类型，含原因、动态、正文证据
- WorldPanel 新增「角色关系」板块，支持手动创建和编辑

**Agent 自动同步**
- `relation_sync` 工具：从正文提取关系 → 自动写入世界书
- 融合替代策略：已有同角色关系 → 追加新内容；没有 → 新建条目
- `/api/agent/sync-relations` API

**生成时强制注入**
- 正文生成时，根据当前调度角色名强制加载对应的关系条目
- 注入到 systemPrompt「角色关系网」区域——不走触发词匹配，直接按角色名查询，保证不漏

**关系可视化**
- RelationshipGraph 重写为 Agent 正文分析驱动
- 每条关系带正文原句证据 + 来源章节
- 标记"角色卡记录但正文未体现"的过时关系

### 🧠 Agent 会话记忆 + 写后分析

**会话记忆**
- `src/lib/chat-sessions.ts`：内存存储，按 projectId 隔离
- 最多 20 条消息，30 分钟自动过期
- Agent 记住本轮对话上下文，问完"最强角色"再问"他和凌霜什么关系"——知道"他"是谁

**写后分析**
- `analyze_chapter` 工具：对比正文 vs 角色卡，找出 6 类缺失（能力/性格/关系/别名/状态/外貌）
- 分析结果卡片展示 + 一键采纳 → 自动更新角色卡
- `/api/agent/analyze-chapter` API

### 📐 变更

- `api/agent/extract-chapter/route.ts` — **新建**：LLM 一次提取 12 维度
- `api/agent/apply-extraction/route.ts` — **新建**：批量写入 5 张表
- `api/agent/sync-relations/route.ts` — **新建**：关系同步到世界书
- `api/agent/analyze-chapter/route.ts` — **新建**：章节 vs 角色卡对比
- `api/agent/analyze-relationships/route.ts` — **新建**：Agent 读正文提取关系网
- `components/workspace/ChapterExtractionPanel.tsx` — **新建**：提取面板 UI
- `components/workspace/RelationshipGraph.tsx` — **重写**：Agent 驱动的关系图
- `lib/chat-sessions.ts` — **新建**：Agent 会话记忆
- `page.tsx` — 集成提取面板，自动触发替代旧三卡分析
- `orchestrator.ts` — 生成时强制注入角色关系条目
- `tool-registry.ts` — +4 工具（analyze_chapter/analyze_relationships/relation_sync/extract_chapter），category 映射
- `WorldPanel.tsx` — +角色关系板块 + 字段模板
- `RightPanel.tsx` — +关系图子tab
- `AIChatBar.tsx` — 分析结果展示 + 一键采纳 + 关系同步
- `chat/route.ts` — 会话注入 + 路径E/F + 新工具速查
- `types/index.ts` — LoreCategory 新增 character_relationship

---

## v0.20.16 — 2026-06-17

### 🎨 右侧栏重构——三 tab 一体化

**顶部三 tab 切换**
- 🤖 **AI助手** — AI 对话栏从页面底部移入右侧面板，始终可见
- 🔍 **查询实体** — 实体追踪 + 伏笔，子 tab 切换
- 📊 **监测** — 实时统计数据面板

**监测面板**
- 字数概览：总字数、完成率、当前章字数、均章字数
- Token 估算：生成/提示/总计 Token 消耗（基于字数智能估算）
- 章节分布：最多/最少字数、完成进度
- 数据记录：摘要数、转折点数、伏笔数
- API：`/api/stats/monitor` 聚合查询

**交互**
- 最小化状态三条竖排标签可点击切 tab
- 底部统计栏 + 可折叠上下文监控保留

### 📐 变更
- `RightPanel.tsx` — 重写，三 tab 架构
- `MonitorPanel.tsx` — 新建
- `/api/stats/monitor` — 新建
- `page.tsx` — 移除底部 AIChatBar，AI 对话移入右侧面板

---

## v0.20.15 — 2026-06-17

### 🤖 Agent 工具箱全面升级——21 工具接管所有按钮

**从 4 工具扩展到 21 工具，覆盖全部 CRUD 操作：**

**🧑 角色管理 (5)**
- `character_list` — 列出全部角色（可按类型筛选）
- `character_get` — 查单个角色完整信息（性格/外貌/关系网/时间线/弧光）
- `character_create` — 创建角色（支持快速导入原文描述）
- `character_update` — 修改角色属性（姓名/性格/状态/弧光等）
- `character_delete` — 删除角色

**📖 世界书管理 (5)**
- `lore_list` — 列出世界书条目（按分类筛选：地理/势力/物品/功法等）
- `lore_get` — 按关键词查设定完整内容
- `lore_create` — 创建世界设定/势力/物品/功法
- `lore_update` — 修改词条
- `lore_delete` — 删除词条

**📋 大纲管理 (4)**
- `outline_list` — 查看大纲树（卷→章→节层级，含状态/字数）
- `outline_create` — 创建节点（可指定父节点）
- `outline_update` — 修改标题/大纲/状态
- `outline_delete` — 删除节点（含递归删除子节点）

**🔮 伏笔管理 (3)**
- `foreshadowing_list` — 列出伏笔（按状态筛选）
- `foreshadowing_create` — 创建伏笔
- `foreshadowing_update` — 修改状态/描述

**📝 正文 (2)**
- `chapter_get` — 查询章节正文内容
- `chapter_generate` — 触发 AI 写作面板（frontendAction 机制——通知前端弹面板）

**🔍 其他 (2)**
- `detect_entities` — 扫描正文实体引用
- `project_info` — 查看项目统计

**🖥️ 前端工具箱**
- AIChatBar 新增 6 个工具按钮：查角色/查设定/查伏笔/扫实体/大纲/项目
- 按钮点击→调 `/api/tools/execute`→显示格式化结果
- 工具输入行支持回车执行、Esc 取消
- `chapter_generate` 返回 `frontendAction`→前端可据此弹出写作面板

**🏗️ 架构**
- `tool-registry.ts` — 重写，ToolContext 新增 `prisma` 字段支持写操作
- `/api/tools/execute` — 新建接口，承接前端工具按钮调用
- `chat/route.ts` — 工具调用循环升级，支持 frontendAction 透传

### 📐 变更清单
- 重写 1 文件（tool-registry.ts 4→21 工具）
- 新建 1 文件（/api/tools/execute）
- 修改 2 文件（chat route + AIChatBar）

## v0.20.14 — 2026-06-17

### 🧠 记忆系统闭环 + Agent 工具层

**📊 规则分类接入后处理**
- `memory-classifier.ts`：新增 `tieredMemoryToImportances()` 和 `classifyAndConvert()` —— 将规则分级的 S/A/B 事件转为 EventImportances 格式
- `post-processor.ts`：step 4.5 —— LLM 摘要存储后，自动运行基于规则的 classifyEvents
  - 合并 LLM 的事件分层 + 规则分类结果，双保险
  - SSE 事件 `classify_done` 推送分类统计
  - 失败降级不阻塞主流程

**🔮 右侧伏笔页签**
- `ForeshadowingPanel.tsx` — **[新]** 伏笔追踪面板——按状态分组（⏳埋设中/🔄部分回收/✅已回收/❌已废弃）
  - 可折叠分组，点伏笔查看详情（预计回收章号、来源、完成度）
  - 状态徽章颜色编码：黄=待处理 蓝=部分 绿=已回收 灰=废弃
- `/api/foreshadowing/list` — **[新]** GET 接口，按 projectId 返回按状态分组的伏笔列表
- `RightPanel.tsx`：新增 tab 切换——📊 实体 | 🔮 伏笔，最小化状态显示当前 tab 名

**🤖 Agent 工具层**
- `tool-registry.ts` — **[新]** 工具注册表（单例），4 个内置工具：
  - `detect_entities`：扫描正文片段中的实体引用
  - `query_characters`：按名称模糊查角色卡
  - `query_lore`：按关键词查世界书词条
  - `check_foreshadowing`：按描述匹配已有伏笔
- `orchestrator.ts`：新增 `getToolSchemas()` 和 `executeToolCall()` 方法
- `llm/client.ts`：LLMRequest 支持 `tools` 参数，LLMResponse 支持 `toolCalls` 解析，ChatMessage 支持 tool 角色
- `chat/route.ts`：工具调用循环——LLM 可主动调用工具查询角色/设定/伏笔后再作答（最多 3 轮）

### 📐 架构变更
- 无 Prisma schema 变更
- 新增 3 文件，修改 6 文件

### 🧠 记忆系统——S级伏笔强制注入，AI不再忘掉自己埋的线

**🔴 S级记忆——未回收伏笔强制注入（最高优先级）**
- `assembly/engine.ts`：新增 `buildForeshadowingSection`——从 PendingCommitment 表加载所有未回收伏笔
  - 按到期章号排序（即将到期的排最前），注入 prompt 顶部
  - 标注 ⚠️ 待回收、预计回收章号、关联角色
  - Token 预算：从短期记忆分出 5% 给 S 级记忆
- `context-loader.ts`：所有生成路由并行加载 `pendingCommitment`（最多 30 条）
- `types/index.ts`：PromptContext 新增 `pendingCommitments` 字段
- `TokenAllocation` 新增 `foreshadowing` 预算项

**📊 记忆分级引擎**
- `memory-classifier.ts` — **[新]** S/A/B 三级分类逻辑
  - S 级：未回收伏笔 + impact=major 转折点 + 核心角色状态变化
  - A 级：最近 5 章 keyEvents + 角色重叠排序
  - B 级：更早章节 1 行摘要归档
  - `formatTieredMemory()` 按 token 预算截断注入

**🔗 数据流**
- `pre-processor.ts`：buildGenerationContext 透传 pendingCommitments
- `orchestrator.ts`：buildPromptContext 接收并传入 PromptContext
- `write/refine/continue` 三路由：通过共享的 context-loader 自动获得伏笔数据

**📐 Token 预算调整**
```
systemPrompt:  8%  ─ 不变
globalMemory: 10%  ─ 不变
triggeredLore:15%  ─ 不变
foreshadowing: 5%  ─ 新增（从 shortTerm 分出）
shortTerm:    20%  ─ 从 25% 降至 20%
mediumTerm:   10%  ─ 不变
longTerm:      5%  ─ 不变
responseReserve:23% ─ 不变
```

---

## v0.20.12 — 2026-06-17

### 📊 右侧实体追踪面板 + 💬 底部 AI 对话栏

**📊 实体追踪面板（替换上下文监控）**
- `ChapterEntitiesPanel.tsx` — **[新]** 扫描当前章节正文，按类型分组显示已出现的实体
  - 6 组：角色🧑 / 势力🏛️ / 物品💎 / 地点🗺️ / 世界观🌐 / 功法⚔️
  - 每组显示颜色圆点 + 实体名 + 数量标记
  - 点击实体名 → 打开编辑弹窗（复用 CharacterEditDialog / LorebookEditDialog）
  - 未在数据库中注册的实体标记为「未注册」
  - 底部统计：已注册实体数 + 本章匹配次数
- `RightPanel.tsx`：标题从"上下文监控"→"实体追踪"，上下文监控折叠到最底部
- `entity-highlighter.ts`：抽取 `findEntitiesInText()` 共享匹配逻辑（rehype 插件 + 面板复用）
- `rehype-entity-highlight.ts`：委托共享函数替换本地实现

**💬 底部 AI 对话栏**
- `AIChatBar.tsx` — **[新]** 页面底部常驻对话输入区
  - 4 条快捷建议按钮（改对话/加描写/查逻辑/加习惯动作）
  - 选中正文区间后自动带上文发送——显示"已选中：xxx…"标签
  - AI 回复显示在输入框上方，再次发送自动替换
  - Enter 发送，Shift+Enter 换行
- `api/generate/chat/route.ts` — **[新]** 短对话 API，200 字以内回复，温度 0.7
- workspace 页面：新增 `selectedText` 状态，三栏容器 `onMouseUp` 追踪选中文本

---

## v0.20.11 — 2026-06-17

### 📝 Markdown 默认渲染 + 实体颜色高亮 + 阅读排版优化

**🎨 正文显示升级——从纯文本到富文本**
- `MarkdownViewer.tsx` — **[新]** 基于 react-markdown + remark-gfm 的正文渲染组件
  - 支持标题（h1-h3）、粗体/斜体、引用块、列表、表格、代码块、删除线、链接
  - 深色主题定制样式——h1 居中大号、引用块左侧竖线、代码块琥珀色高亮

**📐 阅读排版优化——护眼舒适**
- 正文字号从 14px → **17px**，行距从 1.6 → **1.85 倍**
- 字间距 `0.02em`，颜色从刺眼纯白 → **柔白 #e2e2e2**
- 内容区最大宽度 **700px 居中**，左右留白呼吸感
- 章节标题自动居中显示（读 `selectedNode.title`）

**🔍 实体颜色高亮——低饱和度克制点缀**
- `entity-highlighter.ts` + API 路由 + rehype 插件
- 颜色从高饱和改为暗色背景适配的**低饱和度色板**：
  - 角色 `#5B9BD5` 柔蓝 / 势力 `#70AD47` 苔绿 / 物品 `#D4A017` 暗金
  - 地点 `#C55A11` 赭石 / 世界观 `#9B59B6` 淡紫 / 功法 `#D64545` 暗红
- 正文底部实体图例（颜色方块+类型名+计数）
- hover 时 1.5px 边框 + 同色背景晕染

**📋 流式兼容**
- 流式生成期间先渲染纯 Markdown（不加实体高亮，避免部分匹配误判）
- 流式结束后实体映射异步加载 → 自动补上高亮

---

## v0.20.10 — 2026-06-17

### 🎨 文风系统接通——模板 stylePrompt 真正注入生成提示词

**🔧 核心修复——模板选了白选的历史问题**
- `sync-global-prompt.ts`：现在读 `project.llmConfig.styleTemplateId` → 加载模板 → 注入 `stylePrompt` + 禁用词 + 节奏指引 + 对话指引 到 `globalPrompt`
- `style/route.ts`：切换模板后自动调 `syncGlobalPrompt` 刷新缓存，下次生成立即生效

**📋 注入内容（四个维度的风格约束）**
- `stylePrompt`：200-300 字详细写作指令，标注为「最高优先级」
- 禁用词/句式：从 `forbiddenPatterns` 转为 prompt 指令（不再仅后处理检查，LLM 生成时就知道要避开）
- 节奏指引 `pacingGuide`：场景节奏（慢→快→爆 / 流水式 / 压抑→爆发 等）
- 对话指引 `dialogueGuide`：对话风格（角色语域 / 占比 / 打断规则）

**⚠️ 之前状态**：9 个模板预设完全写好，`applyTemplate()` 函数存在但从未被任何生成路由调用。`stylePrompt` 只在一个 debug 端点（preview-context）中展示——不影响实际生成。用户选模板只影响 temperature/topP，本质的风格约束完全落空。

---

## v0.20.9 — 2026-06-17

### 👥 人物关系独立提取 + 自动应用模式

**🆕 人物关系——简单直白的 A对B 关系提取**
- `update-cards/route.ts`：prompt 新增 `characterRelations` 输出——sourceName/targetName/relation/reason 四字段
  - 关系类型：仇恨/爱慕/盟友/敌对/师徒/主仆/同门/血亲/恩人/利用/敬仰/嫉妒/竞争/合作
  - 附带一句话原因（如"因为A被B当众羞辱"）
- `apply-updates/route.ts`：多向总结——已存在的关系→追加原因，不存在→新建
- CardUpdater 新增 👥人物关系展示区域

**⚡ 自动应用模式——不再每次弹窗确认**
- CardUpdater 新增"自动应用"复选框（localStorage 持久化）
- 勾选后：章节写完 → 全选所有提取结果 → 自动调用 apply-updates → 关闭
- 不勾选保持原流程：弹出 CardUpdater → 手动勾选 → 手动应用

---

## v0.20.8 — 2026-06-17

### 🏗️ 世界构建面板拆分——11 板块独立管理

**🖥️ WorldPanel 替换单一世界书列表**
- `components/workspace/WorldPanel.tsx` — **[新]** 11 个独立板块，每个有自己的图标/描述/字段模板/新建表单
  - 🗺️地理地图 / ⚔️势力阵营 / 💎物品列表 / ⚡力量体系 / 📜功法体系
  - 🐉生物种族 / 🎭文化风俗 / 📚历史背景 / ⚖️规则法则 / 💰货币体系 / 🔮特殊设定
- `LeftPanel.tsx` — "世界书" tab 替换为 "世界" tab，集成 WorldPanel
- 每个板块独立计数，点击切换，空板块显示引导提示

**📝 独立新建表单——每板块字段不同**
- 地理：类型/父级/描述；势力：类型/阵营/首领/领地/描述
- 物品：类型/稀有度/持有者/状态/描述；功法：类型/品阶/属性/传承方式/描述
- 力量体系：等级序列/能量来源/突破条件/描述
- 货币：材质形态/价值层级/流通范围/描述
- 数据仍存入 LorebookEntry，category 字段区分板块

**💉 Prompt 注入按板块分组**
- `engine.ts`：`buildLoreSection` 改为按 category 分组注入
- 每板块独立小标题（如"🗺️ 地理环境"），宽松自然语言格式
- 格式：`- 条目名：内容描述`，不给 LLM 结构化压力

---

## v0.20.7 — 2026-06-17

### 📌 情节脉络 + 支线故事自动提取

**🆕 章节摘要 → Storyline 自动映射**
- `update-cards/route.ts`：prompt 新增 `plotLines`（情节脉络）和 `subPlots`（支线故事）两个输出维度
  - 每条包含 title/type/progress/stage（七阶段之一）/characters
- `apply-updates/route.ts`：
  - 自动创建/更新 Storyline 记录——已有同名线→追加阶段进展，新线→创建
  - 七要素自动填充：desire/obstacle/action/result/twist/turn/ending
  - chapterBindings 自动绑定当前章节
- `CardUpdater.tsx`：新增 📌情节脉络推进 / 🌿支线故事展开 两个展示区域

### 🔧 功法体系 category 补充
- `update-cards/route.ts`：newLoreEntries 的 category 选项新增 `technique`（功法体系）

---

## v0.20.6 — 2026-06-17

### 🔗 章节摘要 → 17 模块自动映射（第一阶段）

**🐛 修复伏笔数据被丢弃的 bug**
- `apply-updates/route.ts`：`newForeshadowings` 一直被接收但从未写入数据库——现在自动创建 PendingCommitment 记录（status: "detected"），关联角色 ID + 闭环条件

**🆕 扩展 LLM 提取维度**
- `update-cards/route.ts`：prompt 新增世界观构建/故事核心/全局时间线 3 个维度
  - `worldSettings`：时代背景/核心规则/特殊元素/主要冲突/社会结构/历史背景
  - `storyCore`：主线推进/核心谜题/主题呈现
  - `globalTimeline`：本章关键事件（标题/类型/重要性/参与角色）
- 新增字段全部加入 JSON schema 和 API 返回

**🆕 扩展数据写入路径**
- `apply-updates/route.ts`：
  - `worldSettings` → Project.description（追加合并）
  - `storyCore` → Project.synopsis（追加合并）
  - `globalTimeline` → StoryBeat 表（按事件逐条创建）

**🖥️ CardUpdater 面板扩展**
- 新增 3 个展示区域：🌐世界观设定 / 📖故事核心 / ⏱️全局时间线
- 用户确认后一键写入全部模块

---

## v0.20.5 — 2026-06-17

### 📡 前端 SSE 事件补全——蒸馏结果实时可见

**🖥️ 生成过程中实时展示本地蒸馏结果**
- `workspace/[projectId]/page.tsx`：`streamSSE` 新增 6 种事件处理——`distill_local_start/done`、`foreshadow_update`、`entity_auto_created/skip/error`
- `components/workspace/types.ts`：`SSEEvent` 类型扩展——`stats`/`stateChanges`/`foreshadowEvents`/`newEntities`/`created`/`updated`
- 绿色蒸馏完成通知横幅——生成完成后自动弹出，显示实体数/状态变化/伏笔信号/自动创建数
- 通知优先级：蒸馏通知 → AI深度分析通知 → CardUpdater 对话框，不堆叠
- 蒸馏累计数据在每次生成开始时自动重置

---

## v0.20.4 — 2026-06-17

### ♻️ 数据反哺——新实体自动入库

**🆕 蒸馏发现的实体不再只是展示，直接写入数据库**
- `src/lib/entity-auto-creator.ts` — 新实体自动创建器：
  - 角色 → CharacterCard（role: "supporting"，标记 🆕自动发现）
  - 地点 → LorebookEntry（category: "geography"）
  - 丹药/法宝/材料 → LorebookEntry（category: "item"）
  - 功法 → LorebookEntry（category: "technique"）
- 查重：大小写不敏感对比已有角色名 + 世界书标题，避免重复创建
- 新增 SSE 事件：`entity_auto_create_start` / `entity_auto_created` / `entity_auto_skip` / `entity_auto_create_error`
- 实体创建失败降级——单个实体失败不阻塞其他实体和后续流程

---

## v0.20.3 — 2026-06-17

### 🔮 伏笔自动检测——本地蒸馏驱动五状态机

**🆕 蒸馏发现的伏笔信号自动入库**
- `src/core/pipeline/post-processor.ts` — 本地蒸馏完成后自动处理伏笔事件：
  - 埋设信号（"他并不知道""冥冥之中"等 20 个）→ 自动创建 PendingCommitment（status: "detected"）
  - 回收信号（"原来""恍然大悟"等 13 个）→ 匹配已有伏笔 → 标记为 fulfilled
  - 深化信号（"再次出现""越来越"等 7 个）→ 匹配已有伏笔 → 标记为 partially_fulfilled
- 去重机制：同一信号词每章只处理一次，取置信度最高者
- 新增 SSE 事件：`foreshadow_update` / `foreshadow_update_error`
- 伏笔处理失败不阻塞主流程——单个伏笔异常不影响其他伏笔和后续 LLM summarize

### 🔧 默认模型修正
- `settings/page.tsx`：DeepSeek 默认模型 `deepseek-v4-pro` → `deepseek-v4-flash`（匹配当前 CodeX/CCX 配置）

---

## v0.20.2 — 2026-06-17

### 🧪 本地蒸馏引擎——实体检测不再烧 Token

**🆕 命名模式库 + 四遍扫描（双轨并行）**
- `src/lib/entity-detector.ts` — 命名模式库：5 类正则（丹药/法宝/功法/地点/材料）+ 排除词库 + 归属推断三层策略（属格 0.95 / 动词前置 0.85 / 段落主人 0.6）
- `src/lib/distillation-runner.ts` — 四遍本地扫描：实体识别 → 状态变化检测 → 伏笔模式匹配 → 一致性校验。零 Token 消耗，<1 秒/万字
- `src/core/pipeline/post-processor.ts` — Step 3（保存）和 Step 4（LLM 摘要）之间插入本地蒸馏。结果通过 SSE `distill_local_done` 推送前端
- 新增 SSE 事件：`distill_local_start` / `distill_local_done` / `distill_local_error`
- LLM summarize 继续运行不受影响——双轨并行，积累对比数据后再决定切换

### 🌐 全局默认模型切换
- 默认提供商：硅基流动 → **DeepSeek 官方**（`api.deepseek.com`）
- 默认模型：`deepseek-ai/DeepSeek-V4-Flash` → **`deepseek-v4-pro`**
- 修复 `outline/route.ts` 和 `characters/expand/route.ts` 中硬编码的硅基流动 URL，统一走全局设置

---

## v0.20.1 — 2026-06-17

### 🔑 API Key 动态透传——全局设置全面生效

**🐛 修复 401 "Invalid token"**
- `parser.ts`（parseSettings / parseLorebookOnly / parseStyleOnly）：fallback 从 `getDefaultClient()`（读 env vars，`.env` 无 `LLM_API_KEY` → 空 token → 401）改为 `getEffectiveConfig()` + `createLLMClient()`（从数据库 AppSettings 动态读取）
- `update-cards/route.ts`（章节变化检测）：同样从 `getDefaultLLMConfig()` + `getDefaultClient()` 改为 `getEffectiveConfig()` + `createLLMClient()`
- 至此全部 LLM 调用路径统一走数据库全局设置，用户在设置页改 Key/模型即时生效

---

## v0.20.0 — 2026-06-17

### ✍️ 写作质量闭环——禁用词v2.0 + 审校9维 + 管线全覆盖

**🔍 禁用词检查器 v2.0**
- 正则表达式支持：`/pattern/flags` 格式自动识别，强制 `g` 标志防死循环
- 三级严重度：error（必须修改）/ warning（建议修改）/ info（仅提示）
- 替换建议：每个禁用词可附带推荐替代词
- 无效正则自动降级为精确匹配，不静默丢弃

**📋 审校维度扩展（5→9维）**
- 新增：节奏问题（pacing）、对话质量（dialogue_quality）、描写密度（description_density）、情绪一致性（emotion_consistency）
- 审校 Prompt 从 5 个检查维度扩展到 9 个，覆盖叙事节奏/对话机械感/描写密度/情绪跳跃
- `ReviewIssueType` 联合类型同步扩展

**🔗 refine 路由接入管线**
- refine 路由不再内联扫描+存储，改用 `runPostGenerationPipeline({ skipReview: true, skipSummarize: true })`
- 消除最后一处后处理代码重复

**🐛 诊断修复（code-review 7代理审查）**
- 修复：`allNodes` 过滤 `content: not null` 导致新节点 previousNodes 全错
- 修复：审校/摘要用原始角色列表而非用户确认的角色集
- 修复：`prepareAuthorNote` 收到原始角色列表，新角色备注丢失
- 修复：审校步骤缺 try-catch，LLM 超时会崩掉整个请求
- 修复：authorNote 含 rules 文本在 systemPrompt 和 writingInstruction 中双重注入
- 修复：continue 路由 done 事件缺 status 字段
- 修复：正则无 `g` 标志时 exec 死循环（进程挂起）

---

## v0.19.1 — 2026-06-17

### 🏗 架构重构——生成管线抽取，消除 60% 路由重复代码

**📦 新增 `src/core/pipeline/` 共享管线模块**
- `context-loader.ts` — `loadGenerationContext()` 统一7表数据加载（原 write/refine/continue 各写一遍）
- `pre-processor.ts` — 角色自建/过滤/备注/规则注入/LLM配置提取/上下文构建 六合一
- `post-processor.ts` — `runPostGenerationPipeline()` 扫描→审校→存储→摘要 完整后处理链
- `types.ts` — 管线共享类型定义

**✂️ 路由精简**
- `write/route.ts`：424行 → ~170行
- `refine/route.ts`：277行 → ~140行
- `continue/route.ts`：420行 → ~190行
- 三个路由的重复代码从 ~350行 降至 ~0

**🔧 附带修复**
- write 和 continue 路由的 `summarizeChapter` 现在正确传入 `chapterOrder` 和 `existingSummariesCount`
- 摘要存储统一包含 `eventImportances` 四级事件分层
- StoryBeat 的 `impact` 字段根据 `impactScore >= 7` 动态判断 major/minor

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
