# novel-forge 端到端测试报告（E2E Tester · Round 12）

> 测试员视角：最严格、最真实的端到端验证。
> 被测对象：`novel-forge` HEAD（dev 服务 http://127.0.0.1:3001，版本 v0.46.74，DB `novelforge` PostgreSQL 17，已与 Prisma schema 同步）。
> 测试时间：2026-08-04。
> 报告内含：执行摘要 + 20 点逐条结论 + 问题清单(P0/P1/P2，带 file:line/现象/根因/建议) + 体验总结 + 复测阻塞说明。

---

## 一、执行摘要

### ⚠️ 重大更正：本沙箱 LLM 实际可用（与任务假设相反）
任务简报称「`LLM_API_KEY` 为空，真实 LLM 文本生成将 401/报错」。但实测：
- `.env` 的 `LLM_API_KEY=""` **不参与实际调用**。`getSettings()` 从数据库 `AppSettings` 表读取 key，`getEffectiveConfig()` 用之（`src/core/llm/client.ts:464`）。
- 实测 `/api/generate/write`、`/api/game/start`、`/api/game/action`、`/api/babylore/fill` 均**真实产出连贯文本**（萧炎/药老/焚诀/乌坦城、带项目专属实体抽取、摘要、质量评分、逻辑自检、自动建卡全链路跑通）。
- 结论：**绝大多数「需真实 LLM key」的项目我做到了真正的端到端验证**，而非停留在 UNTESTED-LLM。仅少数「LLM 行为效果的主观评判」仍依赖 key 但已能用真实输出佐证。

### 测试方法（真实优先，三级并用）
- **A. 浏览器真实点击**：尝试 `npm i -g agent-browser`，但本 Windows 沙箱无 `timeout` 命令、无可用 Chromium/显示环境，安装即失败 → 按简报降级到 B。
- **B. 后端 API + SSR + 源码阅读（主方法）**：用 Node 脚本对 3001 端口逐接口打真实请求；对 10 个页面做 SSR HTML 抓取；逐文件阅读 prompt 构建/约束注入/填表/监测代码。
- **C. 单测佐证**：`npx vitest run src/core/babylore src/core/game src/lib/entity-auto-creator src/core/post-process src/app/api/import` → **103 passed / 0 failed**。

### 核心发现（一句话）
- ✅ 生成主链路、游戏模式（API+页面）、填表、监测、预设应用、preview-context、recall、clear-filled 均**真实可用**、无 500 崩溃。
- 🔴 **P1-1 自动建卡把句子碎片当实体**：E2E 一次生成产出 47/49 条「实体」是碎片（"右手拇指""核桃壳在他指""他六岁那年练功"），污染世界书并反向注入生成上下文。
- 🔴 **P1-2 填表溯源 `_src:"ch?:batchmanual"`**：runtime 验证 DB 行溯源章节段缺失（与墨白 B1/B2 一致，已用真实数据确认）。
- 🔴 **P1-3 填表跨表错放**：角色「萧薰儿」被填进「妃嫔居住建筑表」。
- 🟡 多项 P2：填表路径绕过成本记账、监测费用仅全局月度、上下文预算计数不一致、固定系统提示词 ~14k 冗余、templateInjection 自检与预设脱节、游戏模式缺入口/无粒子开关、禁词仅事后扫描未前置拦截。

### 问题分级汇总
- **P0：0 条**（未发现数据丢失/崩溃级阻断）。
- **P1：3 条**（P1-1 自动建卡碎片、P1-2 填表溯源缺失、P1-3 跨表错放）。
- **P2：9 条**（见问题清单）。

---

## 二、20 点逐条结论

| # | 检查点 | 是否测试 | 测试方式 | 结果 | 问题/严重级 |
|---|--------|----------|----------|------|-------------|
| 1 | 逐按钮/页面点击交互 | 部分 | B（API+SSR+源码，无浏览器） | 建项目/节点/预设应用/填表/recall/clear/monitor/game 全跑通；10 页面 SSR 均 200（除 `/game` 需 nodeId，见 #2/#18） | 缺浏览器无法穷举点击；游戏页入口见 #18 — P2 |
| 2 | 游戏 vs 正常模式切换 | 是 | B+真实 LLM | `/api/game/start`+`/api/game/action` 真实产出连贯互动叙事；正常 `/api/generate/write` 产出正文。两模式各自独立可用 | 游戏页 `/workspace/[pid]/game` 直接 404（需 `/game/[nodeId]`），且 workspace 无明确入口按钮 — P2 |
| 3 | babylore 自动填表（建项目→建表→写章→一键填表→`_src/_ts` 溯源/归属/selfCheck/clear） | 是 | B+真实 LLM | 套用表格模板预设→建表；`/api/babylore/fill` 真实落地 1 行（`applied:1`）；`/_src`=`ch?:batchmanual`、`/_ts` 有时间戳；selfCheck 返回疑似问题；`/clear-filled` 返回 `{ok,cleared}` | `_src` 章节段缺失(P1-2)；角色错放建筑表(P1-3)；selfCheck 对手动粘贴文本误报(P2-1) |
| 4 | 世界卡三卡·真实姓名/别名去重（炎帝(别名萧炎)不双卡） | 是 | B+真实 LLM+DB | 生成正文含「炎帝(别名萧炎)」，实体抽取未产生双卡；但抽取出大量碎片实体（见 P1-1），且「萧薰儿」被错填建筑表（见 P1-3） | 三卡「真实性」受碎片实体污染 — P1-1 |
| 5 | LLM 上下文记忆排序/完整性 | 是 | B（preview-context 真实构建） | `POST /api/generate/preview-context` 返回完整 budget/breakdown：systemPrompt/globalMemory/triggeredLore/short/medium/longTermMemory/authorNote 分层齐全；排序：system→global→lore→记忆→authorNote | 固定 systemPrompt 高达 13891 token（含与题材无关的 OOC 覆盖）挤占窗口 — P2-5；预算计数不一致 — P2-4 |
| 6 | LLM 遵守信息生成约束（风格/禁词/OOC/去重） | 是 | B（注入代码+真实输出） | 约束注入确认：风格经 `globalPrompt`；禁词经 `preview-context` 注入 `【🚫绝对禁用词】`；OOC 经 `orchestrator.ts:683` 固定覆盖。真实输出：生成文遵守设定；但 `forbidden_scan` 事后抓到「不是…而是」禁用句式 → 禁词**未前置拦截，仅事后扫描** | 禁词仅事后扫描 — P2-9 |
| 7 | 各提示词是否执行/有无 dead code | 是 | B（源码+templateInjection） | 风格/禁词/节奏/对话指引均拼接进 `systemPrompt`（preview-context 可证）；游戏提示词 `game-prompts.ts` 完整。但 `preview-context` 的 `templateInjection.templateInjected` 自检**永远 false**（只认 `styleTemplateId`，预设套用走 StyleCard 不走该字段）→ 调试自检与真实生效脱节 | templateInjection 自检与预设路径脱节 — P2-6 |
| 8 | 剧情预设推进（缝合怪）生效/优先级/context | 是 | B+真实 LLM | 套用「缝合怪·多线剧情推进」预设→建 `story_progression` 词条（触发词 剧情推进/主线/个人线/事件线）；preview-context 中 `triggeredLore` 含该词条；写入章纲回写链路存在（`plan-chapter.ts`） | 缝合怪推进逻辑运行正常；其"好感度+资产"人设模板偏言情，对玄幻项目略违和（体验级，不单列） |
| 9 | 上下文可否精炼去重/分层优化 | 是 | B（读 assemble/budget+实测） | 已分层（酒馆式 short/medium/long + triggeredLore + arc/storyline/foreshadowing）。但：① systemPrompt 13891 token 冗余；② `budget.used`(14158) 与 section 计数（systemPrompt 13891）不自洽；③ 不该进上下文的碎片实体被注入 triggeredLore | budget 计数不一致 — P2-4；冗余 systemPrompt — P2-5 |
| 10 | 文风与去重检测指令生效 | 是 | B（注入+真实输出） | 文风经 StyleCard→`globalPrompt` 真实进 prompt（preview 见 `#系统设定…风格卡`）；去重靠 recall/matchNameStrict（青砚透镜已证）。真实输出未出现明显风格背离 | 文风生效；去重效果依赖 key 但已用真实输出佐证 — 基本 OK |
| 11 | 按钮功能/入口出口/合并无意义 | 部分 | B（源码+API） | 验证：预设 apply（5 类去重/白名单）、clear-filled、recall、monitor、preview-context、game start/action 均功能闭环。未穷举前端按钮（无浏览器） | 游戏模式缺可见入口（#18）；其余按钮逻辑合理，未见明显"无意义按钮" |
| 12 | 测试员体验报告 | 是 | B（完整跑通两章生成+游戏两回合） | 流畅度好、质量评分/逻辑自检/摘要体验加分；卡顿点：自动建卡污染、systemPrompt 过长、`babylore_fill` 因频率每 3 章跳过的"无响应感" | 详见「体验总结」 |
| 13 | 三卡导入后齐全/可编辑/去重合并 | 是 | B（预设套用+DB） | 世界观/剧情预设按 `projectId+category+title` 去重更新（非叠加）；角色预设按 `name` 去重；apply 后 `syncGlobalPrompt` 刷新。DB 验证词条齐全 | 自动建卡反向污染（P1-1）削弱"齐全可信" |
| 14 | LLM 后端上下文保留楼层数/设置对应 | 是 | B（preview-context/recall/game） | 后端上下文按 node（章节）加载 previousNodes/shortTerm；game 按 round 维护 history（最近 6 轮）。设置经 `llmConfig` 注入 | 碎片实体污染上下文（P1-1）；budget 不一致(P2-4) |
| 15 | 填表信息齐全/正确/快速/强 JSON/关思考/调优 | 是 | B（源码 fill.ts+真实调用） | `response_format:{type:"json_object"}` 强 JSON 已落实；3 次重试；prompt 含「铁律/复用已有/填后自检」。问题：① 注释称"关思维链"但未下发 `thinking:disabled`；② 用原生 `fetch` 绕过统一 client，**不走成本记账**；③ `temperature:1` 对严格抽取偏高 | 绕过记账 — P2-2；未关思考 — P2-8 |
| 16 | 右侧监测面板统计 token 总量与费用 | 是 | B（MonitorPanel+monitor 路由） | 面板渲染「Token 估算」+「AI 成本（全项目·本月）」：调用次数/Token 总量/估算花费/按模型分布。`/api/stats/monitor` 聚合 `llmCallLog` | ① 填表路径绕开 `llmCallLog`→填表 token/费用不计入（P2-2）；② 费用为**全局月度**非按项目（P2-3）；③ token 估算基于字数×0.8，非真实 |
| 17 | 每按钮有意义/交互/首用教程/防误触/悬浮态 | 部分 | B（SSR+源码，无浏览器） | API 层校验完备（缺参 400、缺 key 友好报错）。前端悬浮态/首用教程无法在无浏览器下逐一核验 | 游戏页无入口（#18）；首用教程/悬浮态需浏览器复测 — P2 |
| 18 | 游戏流畅/音效不吵/关粒子音效按钮 | 部分 | B（源码+页面渲染） | `/game/[nodeId]` 页面 200、`GameParticles` 40 粒子(标注"安静")、**无音效代码**。缺：① 粒子/音效**开关按钮**（grep 无 toggle）；② `/game` 直访 404 | 无粒子/音效开关 — P2-7；音效"不吵"因根本无声（可接受） |
| 19 | 汇总详细报告 | 是 | 本报告 | 见全文 | — |
| 20 | agent 列修复计划并通知复测 | 否 | — | 由 chair 执行（本测试仅产出报告+问题清单） | — |

---

## 三、问题清单（P0 / P1 / P2）

### P0（0 条）
无数据丢失、无服务崩溃级阻断。

### P1（3 条）

**P1-1 · 自动建卡把句子碎片当实体，污染三卡并反向注入上下文**
- 文件:行：`src/core/distillation/*`（本地蒸馏实体抽取）、`src/app/api/generate/write/route.ts`（写入后 `entity_auto_create`）、触发词抽取在 `src/core/distillation/scorer.ts` / `src/lib/entity-detector.ts`。
- 现象（真实 E2E）：对「第一章 觉醒」一次生成，`distill_local_done` 报"发现 49 个新实体，自动创建了 47 个实体"。DB 核查 `lorebookEntry` 共 49 条，其中 47 条为句子碎片：`有人用一根`(item)、`右手拇指`(technique)、`他六岁那年练功`(technique)、`功时被碎石`(item)、`凸出的青石`(item)、`萧炎的手指`(technique)、`核桃壳在他指`(technique)、`像锈蚀的铁`(item)、`片在石`(item)、`带着草木`(item)、`年没少替你跑腿`(technique)… 类别也被错判（technique/item/geography）。
- 根因：本地蒸馏分段器在标点/`的`/空格处错误切分，产出名词短语碎片；LLM 蒸馏返回片段未被"是否为完整实体"过滤。
- 影响：① 违反检查点 4/13「三卡真实姓名与真实信息」——世界书充斥垃圾；② **这些碎片经 recall 作为 `triggeredLore` 注入后续生成上下文**（preview-context `triggeredLore.count=8` 全为碎片），造成上下文污染与潜在幻觉放大；③ token 浪费。
- 严重级：P1（数据质量/上下文污染）。
- 建议：① 抽取后增加"完整实体"过滤（长度/是否含谓语碎片/是否在已知词典）；② 优先用 LLM 结构化抽取而非本地正则分段；③ 对 `matchedBy` 为"片段"的实体默认不入库或进入待审；④ 提供"清空自动发现实体"入口。

**P1-2 · 填表溯源 `_src` 章节段缺失（`ch?:batchmanual`）**
- 文件:行：`src/core/babylore/fill.ts:465`（`srcLabel = ch${options?.chapterOrder ?? "?"}:batch...`）；DB 行 `_src` 实测 = `ch?:batchmanual`。
- 现象（真实 E2E，DB 取证）：`/api/babylore/fill` 写入行的 `_src`=`ch?:batchmanual`（章节段为 `?`）。与墨白透镜 B1/B2 一致——`continue`/`refine` 路径未透传 `nodeOrder`+`nodeId`，手动填表入口也未关联章节。
- 影响：① 错误归属（rubric 定义临界 P0）；② 依赖 `_src` 解析的"同名异源弱告警"永不为真；③ 防重复失效 → 重复跑 LLM。
- 建议：手动填表页若可选章节则带 `chapterOrder`+`nodeId`；`continue`/`refine` 对齐 `write` 已修路径（`src/app/api/generate/continue/route.ts:243`、`refine/route.ts:194` 已算好 `chapterOrder` 未复用）。

**P1-3 · 填表跨表错放（角色落入建筑表）**
- 文件:行：`src/core/babylore/fill.ts:226-273`（LLM 自主选表/列，无类型约束）；`applyOps` 按名匹配。
- 现象（真实 E2E，DB 取证）：传入含「萧薰儿（角色）」的正文，填表把 `萧薰儿` 写进「妃嫔居住建筑表」`woman_live` 行：`{live:"落霞城", name:"萧薰儿", note:"与萧炎一同探索落霞城"}`——人物被当作"妃嫔"落进建筑表。
- 根因：填表 prompt 仅按"表定义+正文"自由抽取，无实体类型与表类型的对应约束；用户套用题材错配的表格模板时尤甚。
- 影响：三卡信息错位、回收/检索混乱（检查点 3/13）。
- 建议：填表前按实体类型（角色/地点/物品/功法）与表 `category` 做匹配校验；类型不符的实体拒绝落入该表或提示用户；导入/套用模板时给题材建议。

### P2（9 条）

**P2-1 · selfCheck 对手动粘贴填表误报"原文检索不到"**
- 文件:行：`src/core/babylore/fill.ts:467-468`（`selfCheckFill(projectId)` 全局扫描 `storyNode.content`）。
- 现象：`/api/babylore/fill` 传入的 `chapterText` 含「萧薰儿」，但 selfCheck 报「疑似错误地名/名称（全正文检索不到原文）」——因 selfCheck 扫描的是节点正文而非本次粘贴文本。
- 建议：selfCheck 同时检索本次 `chapterText` 参数；或手动填表支持关联节点。

**P2-2 · 填表路径绕过 `recordLlmCall`，成本/Token 不计入监测**
- 文件:行：`src/core/babylore/fill.ts:241-258`（原生 `fetch`，无 `recordLlmCall`）；对照 `src/core/llm/client.ts:374/420`（统一 client 才记账）。
- 现象：监测面板「AI 成本」读 `llmCallLog` 聚合，而填表是主要 token 消耗方却完全不入账 → 费用统计失真（检查点 16）。
- 建议：填表改用统一 `createLLMClient().chat()`（带 `role:"babylore_fill"`）以入账；或单独补记。

**P2-3 · 监测费用为全局月度，非按项目**
- 文件:行：`src/app/api/stats/monitor/route.ts:77-110`（`llmCallLog` 聚合无 `projectId` 维度，注释明示"全局"）；`src/components/workspace/MonitorPanel.tsx:100`（标注"全项目·本月"）。
- 现象：右侧监测面板费用无法按当前项目拆分。
- 建议：在调用链注入 `projectId` 并增加 `where:{projectId}` 聚合（或保留全局+项目切换）。

**P2-4 · 上下文预算计数不自洽（usage% 可能误报）**
- 文件:行：`src/app/api/generate/preview-context/route.ts:124-128`（`assemblePrompt` 返回 `budget`）；`src/core/assembly/engine.ts`（预算分配/计数）。
- 现象：实测 `budget.used=14158` 但 `breakdown.systemPrompt.tokens=13891`（一次调用内 `used` 竟小于单段，且与另一空项目 `used=10607 < systemPrompt 11792` 矛盾）。`systemPrompt` 分配预算仅 10485，实际 13891 已超配。
- 影响：上下文窗口占用率（`usagePercent`）可能误报，导致截断判断失准（检查点 9）。
- 建议：统一 `budget.used` 与 section token 求和口径；单测覆盖 budget 一致性。

**P2-5 · 固定系统提示词 ~14k token 冗余（含与题材无关的 OOC 覆盖）**
- 文件:行：`src/core/agents/orchestrator.ts:683`（`# SYSTEM OVERRIDE: 逻辑一致性守护协议`，含"好感度阶段/肢体OOC/厌恶"等言情向约束）；作家角色提示词（"白金级玄幻修仙网文作家"）固定 ~11k。
- 现象：空项目 preview-context 的 `systemPrompt` 已 13891 token（占 131072 窗口 10%+），且 genre=玄幻被当作修仙触发修仙作家角色；OOC 守护协议偏言情，对多数题材无关却常驻。
- 建议（检查点 9，可参考酒馆/SillyTavern 分层）：① 抽离"genre 无关"的通用写作约束与"genre 专属"覆盖，后者按需注入；② 压缩作家角色提示词；③ 固定 system 与动态 context 分桶计费并展示占用。

**P2-6 · preview-context 的 `templateInjection` 自检与预设套用脱节**
- 文件:行：`src/app/api/generate/preview-context/route.ts:81`（`templateId = llmConfig.styleTemplateId`）；而预设套用文风走 `src/app/api/presets/[id]/apply/route.ts:89-112`（建 StyleCard + `syncGlobalPrompt`），**不设 `styleTemplateId`**；`styleTemplateId` 仅由 `src/app/api/projects/[id]/style/route.ts:77-82` 设置。
- 现象：套用文风预设后 preview-context 仍 `templateInjected:false`、`forbiddenLabelPos:-1`（自检假阴性）。但文风确实经 `globalPrompt` 进了 prompt（systemPrompt 见 `#系统设定…风格卡`）。
- 影响：调试自检与真实生效不一致，易误判"文风未注入"（检查点 7）。
- 建议：preview-context 同时检测 `StyleCard` 是否存在并纳入 `templateInjection` 判定；或预设套用文风时一并写 `llmConfig.styleTemplateId`。

**P2-7 · 游戏模式缺入口，且无粒子/音效开关**
- 文件:行：`src/app/workspace/[projectId]/game/[nodeId]/page.tsx`（仅嵌套路由，无 `/game` 落地页）；`src/components/game/GameParticles.tsx:12-64`（40 粒子，无 toggle）；workspace 页 SSR HTML 无 `game` 入口链接。
- 现象：`/workspace/[pid]/game` 直访 404（需带 nodeId）；workspace 未确认有"进入游戏"按钮（client 渲染，SSR 不可见）；粒子背景无开关。
- 影响：检查点 1/2/17/18——游戏模式功能健全但用户难进入、且无法关粒子。
- 建议：① 在 workspace 工具栏增加"进入游戏"按钮→跳 `/game/[当前/首章 nodeId]`；② 游戏页加"粒子/音效"开关（音效当前无，可仅加粒子开关）。

**P2-8 · 填表注释"关思维链"未落实，temperature 偏高**
- 文件:行：`src/core/babylore/fill.ts:9`（注释"关思维链(COT)"）vs `:256`（`response_format` 已设，但无 `thinking:{type:"disabled"}`）；`:254`（`temperature:1`）。
- 现象：填表用原生 fetch 不走 client，`thinking` 未下发；对严格 JSON 抽取 `temperature:1` 偏高，易不稳。
- 建议：下发 `thinking:{type:"disabled"}`（对 DeepSeek reasoner 必要）；`temperature` 降到 0.2~0.4 提升抽取稳定性。

**P2-9 · 禁词仅事后扫描，未前置拦截**
- 文件:行：`src/core/agents/orchestrator.ts`（OOC/禁词覆盖）+ `src/core/post-process/regex.ts`（事后 `forbidden_scan`）。
- 现象：真实生成输出中被 `forbidden_scan` 抓到禁用句式「不是…而是」（`/不是.{1,30}而是/u`，severity:error），说明约束未在前置 prompt 阶段阻止生成。
- 建议：禁词同时以强指令 + 输出后校验双保险；对高频命中句式强化样例反例；提供"生成前拦截/生成后自动改写"开关。

---

## 四、体验总结（测试员视角）

完整跑通：建项目→建章→生成两章（含 plan-chapter 剧情预设、orchestrator 写正文、质量评分/逻辑自检/摘要/自动建卡）→套用预设→填表→recall→clear→监测→游戏 start+action 两回合。

**流畅/加分项**
- 生成主链路稳定，质量评分（A 级）、展示vs讲述比、逻辑自查、伏笔检测等后处理体验专业。
- 游戏模式 API 与页面真实可用，叙事连贯、选项合理、物品/实体变动解析稳健（中文操作归一化、中文数字解析到位）。
- 预设应用做了去重/白名单/ReDoS 防护，工程严谨。
- 监测面板信息维度丰富（字数/Token 估算/费用/章节分布/写作节奏/每日目标）。
- 错误路径友好：缺参 400、缺 key 明确提示，无 500 崩溃。

**卡顿/迷惑点**
1. **自动建卡污染最伤体验**：写一章就往世界书塞几十条"右手拇指""核桃壳在他指"之类碎片，用户不得不手动清理，且这些垃圾会回流进后续上下文。
2. **系统提示词过长**：固定 ~14k token 常驻，对非修仙题材也加载修仙作家角色+言情向 OOC 守护，既占窗口又略违和。
3. **填表"无响应感"**：`babylore_fill` 因默认 `frequency=3` 在「每 3 章填一次，本张不填」时静默跳过，用户点"生成"看不到填表动作，易以为失效。
4. **游戏模式"找不到门"**：功能健全却无清晰入口，新手很难发现 `/game/[nodeId]`。
5. **成本看板对填表"失明"**：填表是最大 token 消耗方，却不在费用统计内，用户看到的 AI 花费偏低。

---

## 五、复测阻塞说明（哪些因缺 LLM key 无法端到端）

**重要：本沙箱 LLM 实际可用**（key 来自 DB `AppSettings`，非 `.env`）。因此简报中担心的 UNTESTED-LLM 大部分已转为真实端到端验证：
- 已真实验证：生成正文（write）、游戏 start/action、babylore 填表、quality/逻辑/摘要、自动建卡、recall、preview-context、预设应用。

**仍需依赖真实 LLM / 浏览器、未能完全端到端者**：
1. **浏览器穷举点击**（检查点 1/17 悬浮态/首用教程/防误触）：本沙箱无 Chromium/显示，`agent-browser` 安装失败 → 降级为 API+SSR+源码，前端交互细节（hover/教程/防误触）需有浏览器环境复测（P2-7/P2 前端项）。
2. **约束"效果"主观评判**（检查点 6/10）：已用真实输出佐证（遵守设定、禁词事后命中），但"LLM 是否严格长期遵守风格/去重"属生成行为评判，需更长多章回归——建议后续轮次用真实 key 跑 5~10 章观察风格漂移。
3. **费用的真实数值**：因无真实 `llmCallLog` 历史（填表绕开记账），「按项目费用」数值准确性需待 P2-2 修复后复测（P2-3）。
4. **碎片实体过滤效果**（P1-1）：已复现并取证，修复后需用真实生成回归确认碎片不再入库。

---

## 六、附：测试产物与数据清理
- 测试脚本（项目根，非 src/，未改源码）：`e2e-runner.mjs`、`e2e-runner2.mjs`、`db-probe.mjs`、`probe3.mjs`。
- 测试数据：在 DB 创建了项目「E2E测试_可删」及 49 条世界书实体（含 P1-1 复现的碎片）。测试完成后将经由 `/api/projects/recycle` 或删除接口清理，避免污染共享库。
- 未修改 `src/`、CHANGELOG、version、MEMORY（遵守铁律）。

---
*报告完。P0=0，P1=3（P1-1 自动建卡碎片、P1-2 填表溯源缺失、P1-3 跨表错放），P2=9。因 LLM 实际可用，绝大多数原以为 UNTESTED-LLM 的项均已真实端到端验证；仅浏览器点击细节与约束长期效果需后续有浏览器/长程回归复测。*
