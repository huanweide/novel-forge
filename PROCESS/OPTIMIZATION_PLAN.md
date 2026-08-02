# 小说工坊（Novel Forge）· 后续优化与规划总纲

> 制定时间：2026-08-02 ｜ 起草版本 HEAD：v0.46.14（已推送 main）
> 起草视角：在 ROADMAP_TO_SHIP.md（Phase A–E，分发/开箱/投稿/打磨/验证）已基本做完之后，从**架构、后端、前端、功能、bug、美化、交互**七个维度，汇总"还差什么、还能做什么"。
> 方法论：基于代码事实（两份子代理侦察 + 源码核对）起草，不凭印象画饼；本地单用户工具定位下，凡"仅部署/多租户才需要"的项一律标注为可选，不伪装成必需。

### 起草迭代说明（写 → 删 → 改）
本文件并非一次成型，而是经过一轮"写、删、改"收敛：
- **写**：先按"架构/后端/前端功能/前端打磨/bug"五大块铺开初稿，覆盖侦察到的全部缺口。
- **删**：初稿中 `ARCH-2`（后端错误统一）与 `FE-7`（前端错误展示）曾各自重复描述"错误格式不一"，删去 FE-7 里冗余的重复句，保留"后端响应结构 / 前端展示规范"的层边界；BUG 清单里与章节修复项重复的纯描述也压成"见 XX"指针，不再展开。
- **改**：把初稿中把 explore/game 的停止按钮误写成"两种不同模式"修正为有且仅有的两类真实模式（停止按钮 / 阶段列表）；补强 FE-1→FE-N4 的依赖关系说明；索引按"模块/优先级/工作量/依赖"四维重排，便于直接派工。
- **末**：第七章索引为最终交付的检索入口。

---

## 〇、本计划与既有 ROADMAP 的关系（先划清边界，避免重复规划）

`PROCESS/ROADMAP_TO_SHIP.md` 在 HEAD v0.46.5 时列了 Phase A–E，目标是"做成对标云笔的成品"。到 v0.46.14，这些已经基本清零：

- A 本地分发（clone + 导入导出文件）✅
- B 开箱即懂（示例项目 / 题材开局 / 新手引导）✅
- C 投稿闭环（6 格式导出补全）✅
- D 成品感打磨（统计面板 / 工具箱 / 规则中心 / 冲突推演）✅
- E 长跑验证（架构具备 + dev 冒烟 + 边界用例）✅（但**真实 5 万字长跑未由作者实跑**，见 BUG-14）

也就是说，**"能用、好用、有差异化内核"已经成立**。本计划不再重复这些，而是往下钻三层：

1. **工程地基**：代码内部是否干净、可维护、可防回归（架构/后端健壮性/测试）。
2. **深层产品能力**：写作者真正会用到、但当前没有的"硬功能"（版本回滚、回收站、成本看板、命令面板、项目备份包等）。
3. **观感与交互一致性**：全站视觉语言、弹窗、响应式、无障碍是否统一（这是"成品感"最容易被一眼看穿的短板）。

> 诚实边界：本项目是**本地运行工具（类比 SillyTavern 酒馆）**，不是 SaaS。因此"鉴权 / 多租户 / 云端限流"等项在本定位下**不是阻塞**，本计划将其归入「可选·仅部署时需要」，不伪装成必须立刻做。

---

## 一、架构与工程化（地基层）

> 这一层用户看不见，但决定"以后加功能会不会越改越歪、会不会一改崩一片"。当前最突出的问题：两套 LLM 抽象并存、错误治理半统一、无输入校验、无迁移历史、无测试、无 CI 视觉回归门。

### ARCH-1 合并两套 LLM 抽象，删除 deprecated 导出
- **现在**：`src/lib/llm.ts`（旧层，含 `callLLM`/`testLLMConnection`/`mapLLMError`）与 `src/core/llm/client.ts`（新层，`createLLMClient`/`chatStream`/`getEffectiveConfig`）并存；新层还有 9+ 个 `@deprecated` 导出（`getDefaultLLMConfig`/`getSiliconFlowClient` 等）。
- **做完**：以 `core/llm/client.ts` 为唯一门面，旧层只保留 `mapLLMError` 等通用工具并标明迁移路径；删除全部 `@deprecated` 导出，调用方逐一改指向新门面。
- **价值**：少一套并行抽象 = 少一半"改了 A 没改 B"的隐性 bug；新同事（或未来的你）不会再纠结该调哪个。
- **量级**：中（涉及 30+ 调用方，需逐文件改 + tsc 校验）。

### ARCH-2 统一 API 错误响应（把 jsonError 覆盖率从 29/88 提到 100%）
- **状态**：✅ 已完成（v0.46.29，已推 main `1008289`）——约 90 路由 catch 收敛到 `@/lib/api-error` 的 `jsonError(e)`；3 个历史路由保留 `@/lib/api` 精确 4xx；SSE/业务契约路由按边界排除
- **现在**：88 个路由里只有 29 个用了 `src/lib/api-error.ts` 的 `jsonError`，其余 59 个在 catch 里手写 `return NextResponse.json({ error })`；错误结构不统一（有的带 `code`/`hint`，有的只有字符串）。
- **做完**：封装 `withError` 高阶函数或统一 `route` 包装，所有路由的错误都走 `jsonError`，响应体固定为 `{ error, code?, hint? }`。
- **价值**：前端 Toast 能稳定读取 `hint` 给出中文排障建议（如"数据库连接失败，请检查 PostgreSQL"），而不是偶尔只弹一个裸字符串。
- **量级**：中（机械替换为主，低风险）。

### ARCH-3 引入输入校验层（手写轻量守卫，零新依赖）
- ✅ 已完成（v0.46.34，已推 main）：以手写轻量守卫替代原计划的 zod（本地单用户工具求轻，不增运行时依赖）；新增 `src/lib/validators.ts`（`asStr/asStrArray/asStrOrNull/asInt/asBool` + `ValidationError/badRequest` + `readValidatedBody(request, validate)` 统一入口，JSON 解析失败或字段校验失败返回 400）；characters/lorebook/story-nodes/rules 四个裸信任入参的写路由已补校验（必填/类型/长度），脏数据落库前拦下；config 路由已有手工 typeof + 范围校验，标注合规不重复改。
- **现在（改前）**：88 路由**零 schema 校验**，所谓校验是 `if (!projectId) return 400` 式手写；`request.json()` 大多无 try/catch；POST body 无体积上限。
- **做完**：引入 `zod`，每个路由用 `validateBody(schema)` 包裹；非法请求返回 400 + 字段级中文提示；对超大 body 设上限（防 LLM 提示被灌爆造成成本/DoS）。
- **价值**：坏数据在入口就被拦下，不再穿透到 DB 抛 500；同时也给前端一份"接口契约"文档。
- **量级**：中（需为每个写类路由补 schema）。

### ARCH-4 重建可控的数据库迁移历史（弃用 db push）
- ⏸️ 暂缓（2026-08-02 决策）：`schema.prisma` 已远超 3 个 2026-06-06 旧迁移（ImportTask/StoryNodeRevision/LoreTable 等均为后续 `prisma db push` 加入），强行 `migrate dev` 会试图重建全表、有数据风险；项目定位是本地单用户工具，`prisma db push` 同步已足够（README / `deploy-local.ps1` 均以此为准）。留待需要多环境分发时再单独排期。
- **现在**：`prisma/migrations` 只有 3 个（2026-06-06），但 `api-error.ts` 的注释指导用户用 `prisma db push` 同步——说明 schema 已与迁移漂移，**没有可控的迁移历史**，多环境部署（换机器 clone 后起库）有风险。
- **做完**：用 `prisma migrate dev` 补齐缺失迁移，让 schema 与 migrations 对齐；README 改为"首次 `prisma migrate deploy`"。
- **价值**：任何人在任何机器上起库，得到的表结构都和你的一模一样，不会出现"我这边能跑你那边报字段缺失"。
- **量级**：中（需要小心对齐现有数据）。

### ARCH-5 幂等 seed 脚本（替代 HTTP 端点触发）✅ 已完成（v0.46.30，已推 main `245ff19`）
- **状态**：新增 `prisma/seed.ts`（按 {type,title,isBuiltin} 幂等查重）+ `package.json` 加 `db:seed`；16 内置预设抽至 `src/lib/builtin-presets.ts` 单一数据源（API 播种路由与 seed 脚本共用）；Prisma 7 适配（`migrations.seed` 在 `prisma.config.ts`，非 package.json 的 prisma.seed）；`tsx` 仅 devDep。实跑两次验证幂等（新增 0 / 跳过 16）。
- **现在（改前）**：初始化示范数据（16 预设 / 示例项目）只能经 `/api/seed/*` HTTP 端点触发，`package.json` 无 `seed` 脚本、无 `prisma/seed.ts`。
- **做完**：写 `prisma/seed.ts`（幂等：已存在则跳过/更新），`package.json` 加 `db:seed`；首次启动自动跑。
- **价值**：初始化可编程、可重复、不依赖先起服务再打 HTTP；也方便 CI 与多人环境。
- **量级**：小。

### ARCH-6 建立轻量测试护栏（vitest + 关键路径单测 + API 冒烟）
- ✅ 已完成（v0.46.34，已推 main，基础设施）：新增 `vitest.config.ts`（node 环境）+ `package.json` 加 `test` script（`vitest run`）；首个单测 `src/lib/__tests__/utils.test.ts` 覆盖 `safeJoin` 八分支（实跑 8 passed），验证测试管线可用。诚实边界：目前仅纯函数测试，API 路由 mock 测试（需处理 `next/server` 导入）与 LLM 客户端封装测试留后续批次。
- **现在（改前）**：整个仓库**没有任何测试**（无 jest/vitest）；之前靠 `novel-forge-diagnostic` 技能做静态六维检查 + 手动冒烟。
- **做完**：引入 `vitest`，先覆盖三类最该锁的：① LLM 客户端封装（mock 掉网络）；② 校验层；③ 2–3 个核心 API 路由（projects/story nodes）的入库冒烟。再给 CI 加 `tsc + test` 门。
- **价值**：以后做 ARCH-1（合并 LLM 抽象）、FE-8（状态管理收口）这类"牵一发动全身"的重构时，有测试兜底，敢改。
- **量级**：中（一次性投入，长期受益）。

### ARCH-7 增加 CI 视觉回归门（禁硬编码色值 / 强制 --nv-*）✅ 已完成（v0.46.31，已推 main）
- **状态**：新增 `scripts/lint-colors.mjs` 扫描 `src` 下任意十六进制色值（如 `bg-[#ff0000]`），`npm run lint:colors` 可复跑；`.github/workflows/ci.yml` 加软门步骤（不阻断）。守卫只拦"新增"，不强制改既有——已记录 3 处游戏画布深底（`#0a0a0f`/`#0a0a1f`/`#0d0d2a`）为有意硬编码残留。
- **现在（改前）**：`globals.css` 定义了 48 处 `--nv-*` 令牌，但源码里仍有硬编码十六进制色值（见 FE-1；语义状态色已在 FE-1 收敛到令牌，残留多为游戏画布深底）。
- **做完**：加 ESLint 自定义规则或 `stylelint` 规则，在 CI 拦截新的硬编码色值，强制走 `--nv-*`。
- **价值**：防止"今天修完观感、明天又有人写死一个红"的回归；让设计令牌真正成为单一来源。
- **量级**：小–中。

### ARCH-8 补 middleware.ts（可选·仅部署时需要）
- **现在**：`src` 下无 `middleware.ts`，所有端点（含 `cron/memory-decay`、`seed/*`）无任何校验。本地单用户无所谓，但一旦把端口暴露到局域网 / 部署，等于裸奔。
- **做完（仅当你决定部署/局域网共享时）**：加 `middleware.ts` 做 Edge 层统一 404 / 未捕获异常处理，并对 `cron`/`seed` 加一个简单 token 校验。
- **诚实边界**：**本地自用不做也不影响**；列为可选，不伪装成阻塞。
- **量级**：小（但需先有部署决策）。

---

## 二、后端能力深化（功能 + 健壮性）

> 这一层是"作者真正会感知到的硬能力缺口"：写坏了能不能撤、删错了能不能找回、花了多少钱能不能看见、模型抽风了会不会直接中断。

### ✅ BE-1 正文版本历史与一键回滚 ⭐（v0.46.21 已完成）
- **现在（改前）**：`StoryNode.content` 只有 `revisionCount` 计数和 `reviewLogs`，**不保留历史版本**；AI 重写/润色一旦覆盖，旧稿永久消失。
- **做完**：新增 `StoryNodeRevision` 表；AI 写/重写/润色覆盖前（`post-processor.ts` 写库单点）+ 编辑器手动保存前（PUT 路由）自动快照上一版正文入库（去重：内容相同不重复记）；编辑器「历史」抽屉列出全部版本、可预览并一键回滚；回滚前自动备份当前正文保证可逆。
- **价值**：写作者最怕的"AI 把我写好的那段改没了"有了退路，敢放心让 AI 大改。
- **诚实边界**：仅 v0.46.21 起产生的版本有记录，更早正文无历史快照；来源标签如实区分 AI 生成/重写/润色/手动保存/回滚快照；表经 `prisma db push` 同步。
- **量级**：中（版本表 + 两个写入点 + 历史抽屉 + 回滚 API）。

### ✅ BE-2 软删除 + 回收站 ⭐（v0.46.22 已完成）
- **现在（改前）**：Project 及所有子表都是 `onDelete: Cascade` **硬删除**；删项目 = 物理删除全部章节/角色/世界书，不可恢复。
- **做完**：Project 加 `deletedAt`；删除改软删除（设 `deletedAt`，子表随项目一起隐藏不丢）；`GET /api/projects` 过滤已删；新增回收站页面 `/recycle`（恢复 / 彻底删除）+ `restore`/`purge` 端点；主页加「回收站」入口。
- **价值**：手滑删错项目不再是世界末日；本地工具没有"云端回收站"兜底，自己补一个更有必要。
- **诚实边界**：软删除仅隐藏、不自动过期清理（未做保留 N 天定时任务）；彻底删除仍是硬删除 + 级联。
- **量级**：中。

### ✅ BE-3 Token 用量与成本看板 ⭐（v0.46.20 已完成）
- **现在（改前）**：LLM 返回的 `usage`（token 数）在 `stats/monitor` 里只是按字数**估算**（注释明说"精确值需启用 token 日志"），且用完即丢，从不落库。
- **做完**：新增 `LlmCallLog` 表（时间/模型/角色/输入·输出·总 token/估算成本/BaseURL/是否故障转移）；在 `src/core/llm/client.ts` 的 `chat` 成功返回、`chatStream` 流末 `onUsage` 回调单点 fire-and-forget 落库（覆盖所有走 client 的生成/agent/game/explore/dissect）；`lib/llm.ts` 内置 `MODEL_PRICING` 价格表 + `estimateCost` 估算；`/api/stats/monitor` 加 `llmUsage` 本月聚合；MonitorPanel 加「AI 成本（全项目·本月）」看板。
- **价值**：作者第一次能在统计面板看清"这个月 AI 帮我写了多少、花了多少钱"、按模型分布；对成本控制是刚需。
- **诚实边界**：client 层不持有 project 上下文 → 看板做全局聚合标注「全项目」（不伪装 per-project）；仅记 v0.46.20 起调用、历史无数据、未知模型标单价未知、落库失败静默；表经 `prisma db push` 同步。
- **量级**：中（落库 + 一个看板 UI）。

### ✅ BE-4 LLM 重试 + 故障转移（多模型兜底）⭐（v0.46.19 已完成）
- **现在**：全代码库**没有任何重试逻辑**；某 provider 一次失败（429/5xx/网络抖）直接向上抛，正在写的生成直接断。
- **做完**：在 `core/llm/client.ts` 加指数退避重试（如 429/5xx 重试 2–3 次）；可选配置"主模型失败自动切备用模型"（如 deepseek 挂了切 siliconflow）。
- **价值**：把"模型偶尔抽风就白等半天还报错"变成"它自己悄悄重试/换路，你几乎无感"。这是稳定性的体感核心。
- **量级**：中。
- **落地（v0.46.19）**：`chat`/`chatStream` 接入指数退避重试（3 次，600ms→8s 封顶含 ±20% 抖动），4xx 鉴权错直接抛不重试；`LLMConfig.fallbackModels` 链主模型重试耗尽后切备用模型，经 `process.env.LLM_FALLBACK`（形如 `modelA@baseURL,modelB`）零 schema 注入；流式仅「建立连接阶段」重试/切换，进入 token 流即停避免重复输出；遗留 `lib/llm.ts` 的 `callLLM` 同步补同等重试。tsc 零错误、零新依赖、已推 main。

### BE-5 长任务异步化（拆书 / 导入排队）✅ 已完成 (v0.46.32)
- **现在（改前）**：经侦察 `dissect/start` 已是 SSE 流式 + 落库 DissectionTask + 断线轮询恢复，基本完整；`import/parse` 是 SSE 流式但重活在单连接内、受 300s 限制、导入侧无任务表。
- **做完**：给 `import/parse` 补齐任务表与轮询恢复，对齐 dissect 已验证模式——Prisma 新增 `ImportTask`（status/progress/result/error/importMode/projectId），POST 建 `pending`、SSE 流内 fire-and-forget 更新 progress/done(completed 存 characters/lore/style)/error(failed)，三类事件均带 `taskId`；新增 `GET /api/import/[taskId]` 轮询路由；前端 `ImportWizard` 用 `sessionStorage` 存 taskId，挂载时自动轮询恢复进预览。
- **价值**：导入大书稿不再怕单连接超时丢进度，断网/刷新后凭 taskId 续看。
- **诚实边界**：dissect 侧本就已是完整异步状态机，本单元未重复改造；`ImportTask` 未建数据库关系（避免改动庞大 Project model），仅存普通 projectId 字段；未在浏览器实跑「断网后刷新恢复」路径（代码逻辑已对齐 dissect 已验证分支）。
- **量级**：中（取决于当前是否真同步跑）——实测 import 侧需补，dissect 侧已达标。

### BE-6 Prisma 连接池上限 + 事务补全✅ 已完成 (v0.46.28，仅连接池上限；事务包裹延后见边界)
- **现在**：`src/lib/prisma.ts` 用 `PrismaPg` 适配器**未设连接池上限**，并发流式请求下可能 `P2024`；多写端点（如 `characters/expand`、`import/commit`）**无 `$transaction`**，部分失败会留脏数据。
- **做完**：设 `max` 连接数；为所有"多步写"端点包事务。
- **价值**：高并发下不崩连接；批量操作要么全成要么全败，不残留半成品。
- **量级**：小–中。

### BE-7 消灭 N+1 与内存聚合✅ 复核无明确安全收益，未改 (v0.46.28 诚实标注)
- **现在**：`characters/expand` 在 `for` 循环里逐条 `update`/`create` 还嵌套 N+1 读（`findMany` 在循环内）；`stats/monitor` 先 `findMany` 拉全部节点再 JS 里 `filter/reduce`。
- **做完**：`expand` 改 `createMany`/`updateMany` 并消除循环内查询；`monitor` 改 DB `groupBy`/`_sum` 聚合。
- **价值**：大项目（几百角色 / 几万字）下 stats 与批量扩写从"卡几秒"变"毫秒级"，且少打数据库。
- **量级**：小（定点优化）。

### BE-8 清理 11 个 deprecated 端点 + 统一超时配置✅ 已完成 (v0.46.28，仅超时统一；删除端点与 U5 冲突故保留)
- **现在**：`generate/apply-updates`、`detect-entities`、`update-cards`、`lorebook/expand|import|summarize*`、`presets/[id]` 的 GET/PUT/DELETE、`pending-items`、`tools/execute` 共 11 个 `@deprecated` 仍随构建打包；超时三档不一致（120/180/300s）。
- **做完**：确认前端无调用后删除；超时抽到 `core/llm` 一处常量。
- **价值**：缩小攻击面与维护负担；超时语义一致，排查慢调用更简单。
- **量级**：小。

### BE-9 API Key 加密存储（可选·安全增强）
- **现在**：`AppSettings.llmApiKey` **明文**落库（GET 接口已脱敏做得对，但库内明文）。
- **做完（本地可不做，部署建议做）**：用系统密钥环或简单加密（如 Node `crypto` 对称加密 + 机器绑定密钥）存储 key。
- **诚实边界**：本地单用户、文件权限可控，明文风险低；列为可选。
- **量级**：小。

---

## 三、前端功能新增（产品能力层）

> 这一层是"作者会 wow 一下"的新功能。区别于 ROADMAP 已做的（示例/题材/导出/统计），这里聚焦更深的工作流能力。

### ✅ FE-N1 全局命令面板 + 全文检索（Cmd/Ctrl+K）⭐（v0.46.23 已完成）
- **现在（改前）**：工作台里跳到某章、找某个角色、搜一段设定，只能手动在左侧树里翻；**全站没有任何全局搜索**。
- **做完**：根 layout 挂全局 `<CommandPalette />`，Cmd/Ctrl+K 唤起；解析当前 projectId 拉 nodes/characters/lore/rules 建内存索引，输入即搜章节/角色/世界书/规则，回车跳转；支持全局动作（新建章节/设置/探讨/拆书/创意工坊/回收站/主页）；workspace 加 `?node`/`?editCharacter`/`?editLore`/`?tab` 参数接收跳转；仪表盘顶栏加「搜索 ⌘K」按钮。
- **价值**：项目一大（上百章、几十角色），再也不用滚轮翻树——专业写作工具（Obsidian / 飞书）的标配，一上就显"专业"。
- **诚实边界**：检索走前端内存索引（打开时拉当前项目数据）不上 ES；跨项目全局搜未做（仅在项目页内搜，非项目页聚焦全局动作）。
- **量级**：中（检索走前端内存索引，不必上 ES）。

### ✅ FE-N2 项目备份包导出 / 导入（.nfproject）⭐（v0.46.24 已完成）
- **现在**：分享设定只能走创意工坊"单张预设导出"；整个项目（章节+角色+世界书+规则+文风）没法整体打包带走。
- **做完**：导出 `.nfproject` 包（zip：DB 该项目的全部表 JSON + 附件），导入时落库为新项目或覆盖；可作为"搬家 / 送朋友整本设定"的载体。
- **价值**：本地工具的"可移植性"刚需——换电脑、发给搭档、备份到 U 盘，一键搞定，不必懂数据库。
- **量级**：中。

### FE-N3 更多导入格式（EPUB / DOCX / 已有 TXT  manuscript）✅ 已完成 (v0.46.32)
- **现在（改前）**：导入向导（`ImportWizard`）支持粘贴 / 上传 `.txt/.md`，但**不能解析 EPUB/DOCX** 这类常见成稿格式。
- **做完**：浏览器端用 `jszip` 解压抽取纯文本（epub 读 `xhtml/html`、docx 读 `word/document.xml` 按 `w:p` 段落），喂给现有 `import/parse`（仅收 `rawText`），后端无需感知格式；新增 `src/lib/manuscript-parse.ts`（parseEpubFile/parseDocxFile/fromManuscriptFile/estimateTokens），`accept` 放宽到 `.txt,.md,.epub,.docx`，提示文案同步更新。
- **价值**：已经写了一半的书想迁过来用 AI 续写，不用手抄；降低"换工具"的迁移成本。
- **诚实边界**：实现未用计划原写的 `epubjs`/`mammoth`——epubjs 偏重且主要做阅读器、mammoth 把 docx 转 HTML 后还要二次清洗；epub/docx 本质都是 zip 包，用 `jszip` 直接解压抽文本更轻（仅 +1 个前端依赖）。`estimateTokens` 为粗略估算（按字符数/3.5），非精确 tokenizer；未实跑大文件（>50MB）压测，逻辑对齐既有 txt 分支。
- **量级**：中（注意依赖体积）——jszip ~30KB 可控。

### ✅ FE-N4 浅色主题切换（Void Glass Light）⭐（v0.46.15 已完成）
- **现在**：全站只有"虚空玻璃"暗色主题，令牌体系（`--nv-*`）已天然支持明暗，但没接切换。
- **做完**：在设置里加"暗 / 亮"切换，`globals.css` 补一套亮色令牌值（或走 `prefers-color-scheme`）；所有组件因已用 `--nv-*` 自动适配。
- **价值**：很多作者白天写作怕暗色刺眼；且 FE-1 把色值收口到令牌后，切主题几乎是"顺手的事"。
- **量级**：小–中（前提是 FE-1 先做，否则要改 200+ 硬编码）。

### FE-N5 全局快捷键系统
- ✅ 已完成（v0.46.33，已推 main）：`ShortcutProvider` 统一注册表 + 单一 keydown 监听，workspace 页接入 `mod+s` 保存 / `[` 折叠左栏 / `]` 切换右栏 / `n` 新建章节；首启弹速查（localStorage 记忆）；设置页快捷键板块实时渲染。
- **现在**：除 Modal 的 ESC，**没有任何全局快捷键**；保存、切换左右栏、新建章节都要鼠标点。
- **做完**：加快捷键中心（可在设置查看/自定义）：Ctrl+S 保存、Ctrl+K 命令面板、[ / ] 切换左/右栏、N 新建章节等；首次用给一个快捷键速查弹层。
- **价值**：高频操作不用离开键盘，长篇写作的流畅度直接上一个台阶。
- **量级**：小–中。

### FE-N6 时间线 / 事件线视图（与大纲树互补）
- **现在**：故事结构只有"大纲树 + 故事线"，按**叙事顺序**组织；没有按**时间先后**排的视图。
- **做完**：新增"时间线"视图，把章节/节点按书中世界时间轴排列（可在节点上标世界时间），支持拖拽调整。
- **价值**：写穿越/多时间线/回忆杀时，一眼看清"这段回忆其实发生在 20 年前"，避免时间线穿帮——这是严肃长篇作者的痛点。
- **量级**：中。

### FE-N7 网文合规 / 违禁词预检
- ✅ 已完成（v0.46.33，已推 main）：`banned-words.ts` 内置基础词库 + 自定义追加/重置；导出路由 `?check=1` 预检模式；ExportDialog 命中即弹确认清单（可坚持导出）；设置页「违禁词管理」板块。
- **现在**：导出直接出稿，没有针对投稿平台（如起点/番茄）的违禁词、敏感词预检。
- **做完**：导出前跑一遍违禁词词典（可用户自定义扩充），标出命中位置与建议替换。
- **价值**：投稿前自查，避免"写了三万字发现有个词全站违禁"的惨剧；服务网文作者（ROADMAP 墙 3 的目标人群）的直接加分项。
- **量级**：小–中。

### FE-N8 自动保存冲突解决（AI 落库 vs 手动编辑）
- **现在**：大纲是可编辑 textarea，AI 流也会改写 outline；两边并发可能互相覆盖，且无声提示。
- **做完**：写操作带版本戳（乐观锁），检测到"你编辑的内容比库里旧"时弹冲突解决（保留双方 / 用我的 / 用库里）。
- **价值**：避免"我刚手改的角色设定被 AI 一键覆盖"的无声丢失；和 BE-1 版本历史互补。
- **量级**：中。

---

## 四、前端打磨与交互（美化 + 体验一致性层）

> 这一层是"成品感"最容易被一眼看穿的短板。两份侦察一致指出：视觉令牌没用全（200+ 硬编码色）、emoji 违规（游戏页明令禁止却遍地都是）、24+ 重复弹窗遮罩、explore/game 没响应式、状态管理割裂。

### ✅ FE-1 视觉一致性收口：硬编码色值 → --nv-* 令牌 ⭐（v0.46.15 已完成）最高优先观感项
- **现在**：`icons.tsx` 的 `iconColor`/`StatusDot` 用 `emerald-400/rose-400/amber-400/sky-400`（而令牌 `--nv-success/--nv-danger/--nv-warning/--nv-info` 已存在却没用）；`DissectProgress`、`settings`、`ContextPreview`、`RelationshipGraph`、`MarkdownViewer` 等散落 200+ 处硬编码色与十六进制。
- **做完**：把状态色统一映射到 `--nv-*`；十六进制统一改令牌；优先改 `icons.tsx` 作为全站颜色单一来源；配合 ARCH-7 的 CI 门防回归。
- **价值**：全站颜色一个地方管，换主题/调色一改全站变；也消灭"这个红那个红不一样"的业余感。**这是最直观、最该先做的观感项。**
- **量级**：中（量大但机械，可分批按组件清）。

### FE-2 清理 emoji 违规，统一用 `<Icon>` ⭐ ✅ 已完成（v0.46.16）
- **现在（历史）**：游戏页注释明令"禁止 emoji、统一用 `<Icon>`"，但 emoji 实际遍布 `DissectDimensions`(13处)/`ImportWizard`(42处)/`StyleEditor`(35处)/`GameOutlineEditor`(18处) 等 40+ 文件（`📦✅❌⚠️🎨🤖` 等）。与设计体系自相矛盾。
- **做完**：用 `Icon`（loader/check/x/alert/box/bot/brush…）替换装饰性 emoji，保留中文文案；复用 ARCH-7 的 lint 拦截新增。
- **价值**：图标语言统一，专业感立现；也避免某些系统渲染 emoji 颜色不一致导致的"花屏"。
- **量级**：中（与 FE-1 同期做最高效）。

### FE-3 弹窗统一收口到 Modal（消灭 24+ 重复遮罩）⭐ ✅ 已完成 (v0.46.17)
- **现在**（实施前）：全项目 27 文件、29 处 `fixed inset-0 z-50 bg-black/60` 各自重复实现遮罩；仅 `ConflictPanel`/`OnboardingModal`/`Modal` 用了统一 `Modal`。`StyleEditor`/`ImportWizard`/`ExportDialog`/`StorylineList`/`WorldPanel`/`tables`/`workshop` 上传/`CharacterCreateDialog`/`LorebookEditDialog` 等均未复用。
- **做完**：22 个业务弹窗手写遮罩全部删除、统一接入 `Modal`（自带 focus trap + ESC + 滚动锁 + `role="dialog" aria-modal`）；新增 `bare` 模式（`panelClassName`/`header`/`showClose`）零破坏迁移；`DialogUI.DialogOverlay` 退役；grep 复核 `src` 无残留手写业务遮罩（Modal 自身/抽屉/下拉/toast/游戏画布/粒子特效合法保留）。tsc 零错误、零新依赖，已推 main（05bfc21）。
- **价值**：弹窗行为一处定义、处处一致；将来改遮罩样式/动画只动一个组件；也顺手补了无障碍（见 FE-5）。
- **量级**：中（逐个组件迁移，需回归测试）。

### FE-4 合并重复的 EmptyState（States.tsx vs EmptyState.tsx）✅ 已完成 (v0.46.27)
- **现在**：存在两个 `EmptyState`（`States.tsx` 用 `description`、`EmptyState.tsx` 用 `hint`），API 不同，`RulesPanel` 同时 import 两者——冗余冲突点。
- **做完**：合并为单一 `EmptyState`（保留 `description` 语义），全局统一空态视觉与引导文案/行动按钮。
- **价值**：空状态不再"有的有图标有的没有、文案风格各异"；新人首次进空白页的引导更一致。
- **量级**：小。

### FE-5 无障碍补课：非 Modal 弹窗 + 图标按钮 ARIA ✅ 已完成（v0.46.31，已推 main）
- **状态**：弹窗已在 v0.46.17 全部收口到统一 `Modal`（自带 `role="dialog"`/`aria-modal`/focus trap）；本次补 explore/game 窄屏抽屉切换纯图标按钮 `aria-label`（sliders/check/grid），Modal 关闭键本已带 `aria-label="关闭"`。表单 label 多走 `DialogField` 包裹，未做逐页 htmlFor 全量普查（散点、低优先）。
- **现在（改前）**：部分图标按钮无 `aria-label`；表单 label 偶有未绑定 `htmlFor`。
- **做完**：弹窗强制走 `Modal`（自带 ARIA）；图标按钮补齐 `aria-label`；表单 label 绑定 id。
- **价值**：键盘用户 / 读屏用户能用；也是"成品"该过的底线（很多招标/采购看这个）。
- **量级**：小–中（散点修复）。

### FE-6 响应式补齐：explore / game 三栏抽屉化 ⭐ ✅ 已完成 (v0.46.18)
- **现在**（实施前）：workspace 主页面已做了窄屏抽屉（`lg:hidden` 切换 + 遮罩）；但 **explore 页三栏无任何 `md:/lg:` 断点**（只有 1 处 `sm:`，且用 `calc(100vh-57px)` 固定高度），**game 页三栏 `w-52/flex-1/w-64` 固定无抽屉**。
- **做完**：explore、game 三栏参考 workspace 主页补 `lg:` 抽屉（切换按钮 + 遮罩），窄屏不再挤压；explore 左栏(构建配置 w-80)/右栏(已采纳 w-72)、game 左栏(w-52)/右栏(w-64) 在 `<lg` 变 fixed 抽屉（`lg:static` 复位），窄屏顶部加 `lg:hidden` 切换按钮，中栏 `flex-1 min-w-0` 全宽；三栏末加 `lg:hidden` 遮罩点按收起。dissect 拆书页经核查本就单栏 `max-w-6xl` 表单（无多列 grid），窄屏天然不挤压——诚实保留未硬改。tsc 零错误、零新依赖，已推 main（222df26）。
- **价值**：手机/平板/小窗也能正常用 explore 探讨和 game 互动游戏，不再是"只能桌面宽屏"。
- **量级**：中（参考已有 workspace 抽屉模式，复用即可）。

### FE-7 加载态 / 错误态一致性规范 ✅ 已完成（v0.46.31，已推 main）
- **状态**：`States.tsx` 新增 `ErrorState` 组件，与既有 `EmptyState`/`Loading` 组成「空态/加载/错误」三件套规范（均走 `--nv-*` 令牌）；DrawCards 的「错误+重试」块已改用统一 `ErrorState`。长任务"停止/取消"按钮模式在 explore/game 已统一（停止按钮）、ImportWizard（阶段列表）属两类合理模式，未强制归一（见诚实边界）。
- **现在（改前）**：错误态配色不一（有的 `toastError`，有的裸 `bg-red-500/10 text-red-400`）；长任务"可中断 loading"规范不统一（explore/game 用停止按钮、ImportWizard 用阶段列表，两类模式各不相同）；网络错误文案风格不一。
- **做完**：建立 `Loading`/`ErrorState`/`EmptyState` 三件套强制使用规范；错误态统一走 toast 或统一 `ErrorState`；长任务统一提供"停止/取消"按钮模式与进度文案模板。
- **价值**：用户在任何页遇到"正在处理/出错了"看到的是同一套语言，不懵。
- **量级**：小–中。

### ✅ FE-8 状态管理收口：zustand store 接管 + 消除 prop drilling ⭐（v0.46.25 已完成）
- **现在**：`workspace/[projectId]/page.tsx` 是 1013 行 God Component，重度本地 `useState`（~40 个），`CenterPanel`/`LeftPanel` 各自接收 **~30 个 prop** 透传；`useProjectStore` 与本地 `project` 状态并存，删除/编辑后需手动 `loadProject()` 刷新，易漏刷导致列表陈旧。
- **做完**：把"项目/角色/世界书/故事线/规则"数据统一收口到 `useProjectStore`（`loadProject` 写入、各面板直接 `useProjectStore(s => s.xxx)` 读取），消除 `onRefresh` 回调链与 30+ prop 透传；合并 `genStep` 与 `useWriterStore` 的生成态。
- **价值**：加新功能时不用再在 30 个 prop 里加一个、不用再担心"忘了刷导致列表旧"；是后续所有前端功能的地基，建议早点做。
- **量级**：大（牵一发动全身，需配合 ARCH-6 测试兜底）。

### ✅ FE-9 引入轻量服务端状态层（React Query / SWR）⭐（v0.46.26 已完成）
- **现在**：70+ API 全部裸 `fetch`，无缓存/失效策略；`ContextPreview` 每次 `refreshKey` 重新拉全量，重复请求多。
- **做完**：引入 React Query（或自封装 `useApi` + SWR）管理 70+ API 的缓存/失效；`loadProject` 写入 store 的同时让 query 失效。
- **价值**：减少重复请求、数据自动保持新鲜；和 FE-8 配合，彻底解决"列表陈旧/重复拉取"。
- **量级**：中（可先在新页面试点，再逐步迁移）。

### FE-10 冗余组件合并 ✅ 已完成（v0.46.31，已推 main）
- **状态**：`CharacterEditDialog` 与 `CharacterCreateDialog` 已合并为单一 `CharacterDialog`（建/编两模式），旧两文件删除；personality 解析（fromText/toText）、时间线解析（timelineToText/textToTimeline）、角色选项（CHARACTER_ROLE_OPTIONS）抽至 `src/lib/character-parse.ts` 单一数据源。`DissectDimensions` 内联 `parseCharPreviewDetailed` 为拆书专用预览解析（与角色卡字段约定部分重叠但语义不同），未强行合并以免引入跨模块耦合——记为已知残留。
- **现在（改前）**：`CharacterEditDialog`/`CharacterCreateDialog` 可合并；`DissectDimensions` 内联 `parseCharPreviewDetailed` 字符解析逻辑与 workspace `CharacterCard` 字段约定重复，易漂移。
- **做完**：合并角色编辑/创建弹窗；把角色解析逻辑下沉到 `lib/` 共享。
- **价值**：少维护两套近似逻辑，字段约定改一处全生效。
- **量级**：小。

---

## 五、已知 Bug 修复清单（确定性项）

> 以下均为侦察中已定位、可立刻修的具体 bug，单列以便直接派工。

- **BUG-1** `LeftPanel.tsx:89` 角色删除走内联 `fetch DELETE`，**无确认弹窗、无 loading 态**，与同页其他删除路径不一致，误删风险。→ 改复用 `useConfirmDelete`。✅ 已在 FE-8 重构中由 CharacterList.useConfirmDelete 解决，v0.46.27 本单元确认现状无需重复修
- **BUG-2** `characters/expand/route.ts` 循环内逐条 `update`/`create` 且嵌套 N+1 读，且无事务。→ 见 BE-7 / BE-6。
- **BUG-3** `stats/monitor/route.ts` 全量拉节点再 JS 聚合，大项目慢。→ 见 BE-7。
- **BUG-4** `prisma.ts` 连接池未设 `max`，并发下可能 `P2024`。→ 见 BE-6。
- **BUG-5** 88 路由仅 29 个用 `jsonError`，错误响应结构不一。→ 见 ARCH-2。
- **BUG-6** 11 个 `@deprecated` 端点仍随构建打包。→ 见 BE-8。
- **BUG-7** 两套 LLM 抽象 + 9+ `@deprecated` 导出并存。→ 见 ARCH-1。
- **BUG-8** 无 `middleware.ts`，cron/seed 无校验（本地可接受，部署需补）。→ 见 ARCH-8。
- **BUG-9** 两个 `EmptyState` 实现冲突，`RulesPanel` 同时引用。→ 见 FE-4。✅ 已随 FE-4 合并修复 (v0.46.27)
- **BUG-10** 200+ 硬编码色值，状态色未走 `--nv-*`。→ 见 FE-1。
- **BUG-11** emoji 违规遍布 40+ 文件，与游戏页"禁 emoji"注释矛盾。→ 见 FE-2。
- **BUG-12** explore / game 三栏无响应式抽屉，窄屏挤压。→ 见 FE-6。
- **BUG-13** `ImportWizard` 一键删除未确认、批量动作缺二次确认。→ 补 `confirmDialog`。✅ 已修复 (v0.46.27)
- **BUG-14** **真实 5 万字长跑压测未由作者实跑**（ROADMAP E1 仅架构具备 + dev 冒烟）。→ 需要一次真人实跑验证填表召回不崩、设定不串味、token 成本可控；这是"对外宣称成品"前必须过的质量闸。

---

## 六、优先级矩阵与分阶段路线

> 综合"用户感知强度 / 工作量 / 风险 / 依赖"四维。⭐ = 强烈建议优先。

### 阶段 0 · 地基先行（让后面敢改，约 1–2 周）
ARCH-6（测试护栏）→ ARCH-2（错误统一）→ ARCH-3（输入校验）→ FE-8（状态管理收口，配合测试）→ FE-9（服务端状态层试点）。
*理由：FE-8 是后续所有前端功能的地基；没有测试和错误统一，重构风险和排障成本都高。*

### 阶段 1 · 观感与交互一致性（最直观的"成品感"，约 1 周）
FE-1（色值收口）→ FE-2（emoji 清理）→ FE-3（弹窗统一）→ FE-4（EmptyState 合并）→ FE-7（加载/错误规范）→ BUG-1/9/10/11/12/13。
*理由：这些改动量中等但**肉眼可见**地提升专业感，且彼此协同（清色值顺手清 emoji）。*

### 阶段 2 · 写作者硬功能（差异化卖点，约 2–3 周）
BE-1（版本回滚）⭐ → BE-2（回收站）⭐ → BE-3（成本看板）⭐ → BE-4（重试/故障转移）⭐ → FE-N1（命令面板）⭐ → FE-N2（备份包）⭐ → FE-N5（快捷键）。
*理由：版本回滚 + 回收站解决"敢不敢让 AI 大改"，成本看板解决"花了多少钱"，命令面板/快捷键解决"大项目好不好用"——都是目标用户（严肃作者）的真实痛点。*

### 阶段 3 · 深化与扩展（锦上添花，约 2–3 周）
BE-5（长任务异步）→ BE-6/7（连接池/N+1）→ BE-8（清理 deprecated）→ ARCH-1/4/5/7（LLM 合并/迁移/seed/CI）→ FE-N3（多格式导入）→ FE-N4（浅色主题）→ FE-N6（时间线）→ FE-N7（违禁词）→ FE-N8（保存冲突）→ FE-5/6/10（无障碍/响应式余量/冗余合并）。

### 可选 · 仅部署时需要
ARCH-8（middleware）→ BE-9（key 加密）。在决定暴露端口 / 部署前再做，不阻塞本地自用。

### 质量闸（发布前必过）
BUG-14：真人实跑 5 万字长跑，确认填表召回不崩、设定不串味、成本可控。

---

## 七、索引（按模块 / 优先级 / 工作量）

### 按模块
- **架构与工程化**：ARCH-1 合并 LLM 抽象｜ARCH-2 错误统一｜ARCH-3 输入校验｜ARCH-4 迁移历史｜ARCH-5 seed 脚本｜ARCH-6 测试护栏｜ARCH-7 CI 视觉门｜ARCH-8 middleware（可选）
- **后端能力**：BE-1 版本回滚⭐｜BE-2 回收站⭐｜BE-3 成本看板⭐｜BE-4 重试/故障转移⭐｜BE-5 长任务异步｜BE-6 连接池/事务｜BE-7 N+1/聚合｜BE-8 清理 deprecated｜BE-9 key 加密（可选）
- **前端新功能**：FE-N1 命令面板⭐｜FE-N2 备份包⭐｜FE-N3 多格式导入｜FE-N4 浅色主题｜FE-N5 快捷键｜FE-N6 时间线｜FE-N7 违禁词｜FE-N8 保存冲突
- **前端打磨**：FE-1 色值收口⭐｜FE-2 emoji 清理⭐｜FE-3 弹窗统一⭐｜FE-4 EmptyState 合并｜FE-5 无障碍｜FE-6 响应式补齐⭐｜FE-7 加载/错误规范｜FE-8 状态管理收口⭐｜FE-9 服务端状态层⭐｜FE-10 冗余合并
- **Bug 修复**：BUG-1~BUG-14（见第五章）

### 按优先级（P0 最高）
- **P0（全局观感/地基，建议最先）**：FE-1、FE-2、FE-3、ARCH-6、FE-8、ARCH-2
- **P1（写作者硬功能，强差异化）**：BE-1、BE-2、BE-3、BE-4、FE-N1、FE-N2、FE-N5、FE-6、FE-9
- **P2（深化/扩展）**：BE-5、BE-6、BE-7、BE-8、ARCH-1、ARCH-3、ARCH-4、ARCH-5、ARCH-7、FE-N3、FE-N4、FE-N6、FE-N7、FE-N8、FE-4、FE-5、FE-7、FE-10
- **可选（仅部署）**：ARCH-8、BE-9

### 按工作量
- **小（≤0.5 天）**：ARCH-5、ARCH-8、BE-6（部分）、BE-8、BE-9、FE-4、FE-5（散点）、FE-7（规范）、FE-10、BUG-1/9/10/11/12/13
- **中（0.5–2 天）**：ARCH-1、ARCH-2、ARCH-3、ARCH-7、BE-3、BE-4、BE-5、BE-7、FE-1、FE-2、FE-3、FE-6、FE-8、FE-9、FE-N2、FE-N3、FE-N4、FE-N5、FE-N7、FE-N8
- **大（>2 天）**：ARCH-4（迁移对齐需谨慎）、ARCH-6（测试体系）、BE-1（版本历史全链路）、BE-2（回收站）、FE-N1（命令面板+检索）、FE-N6（时间线视图）、FE-8（状态管理重构）

### 依赖关系（关键路径）
ARCH-6（测试）→ FE-8（状态重构，需测试兜底）
FE-1（色值收口）→ FE-4/FE-7（统一后才能稳定切主题）/ FE-N4（浅色主题依赖令牌）
FE-8（store 收口）→ FE-9（服务端状态层）→ 所有依赖新鲜数据的功能
BUG-14（5万字长跑）依赖 BE-4/BE-6/BE-7 等稳定性项先落地，作为发布质量闸

---

> 本计划为"快照"，随推进在 `PROCESS/` 持续校准；凡标 ⭐ 为强烈建议优先项，凡标「可选·仅部署时需要」为本地自用非阻塞项，不伪装成必需。
