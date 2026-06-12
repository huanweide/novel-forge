# Novel Forge 更新公告

每次部署自动记录。新版本在上。

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
