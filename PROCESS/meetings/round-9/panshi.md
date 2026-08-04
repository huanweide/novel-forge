# 磐石（性能 / 监控 / token / 防重复）— Round 9 只读质量复验报告

- 复验对象：Novel Forge `v0.46.71`（CHANGELOG 标记 2026-08-04）
- 透镜：磐石（性能 / 监控 / token 统计 / 防重复）
- 方式：只读。未修改任何源码，仅本文件为新增诊断产物。
- 验证手段：`git` 工作树干净；读 `prisma/schema.prisma`、`src/app/api/import/{commit,parse}/route.ts`、`src/lib/llm.ts`、`src/core/llm/client.ts`、`src/core/dissect/engine.ts` 及 `deploy-local.ps1`、CHANGELOG/OPTIMIZATION_PLAN。**未连接运行数据库**，建表与并发行为以"代码 + 部署脚本"路径推断，关键处已标注需实机确认项。

---

## 回归验证（Round 8 对磐石透镜的修复）

### R1 — ImportCommitLock：DB 唯一约束替代进程内存 Map ✅（主路径通过，有 2 个要件外风险）

代码确认：
- `prisma/schema.prisma:496` 新增 `ImportCommitLock` 模型，`@@unique([projectId, nodeId])`（行 502），跨进程/重启后约束由 PostgreSQL 强制，确实优于内存 Map（重启即丢锁 → 跨实例双写）。
- `src/app/api/import/commit/route.ts:318` 写锁：`prisma.importCommitLock.create`；`:321` 捕获 `Prisma.PrismaClientKnownRequestError` 且 `code==="P2002"` → 返回 409 跳过。
- `:311` 空载荷校验已**前置到加锁之前**（早前 P0"400 跳过 finally 留锁"已修），避免合法重试被误阻塞。
- `:641` 在 `finally` 删除锁行，释放依赖"行是否存在"判定，已移除 TTL 旁路。
- `deploy-local.ps1:65` 跑 `npx prisma db push`，属本项目**标准本地部署路径**，故 `ImportCommitLock` 表在标准部署下应已建好；并发双提交只会成功一次（第二次 P2002→409）。

⚠️ 要件外风险（非代码逻辑错误，但影响"真的可靠"结论）：
1. **无迁移文件**：`prisma/migrations/` 仅 3 个 2026-06-06 旧迁移，Round 8 的 `ImportCommitLock` 仅靠 `db push` 同步（`OPTIMIZATION_PLAN.md:61` 已记录 ARCH-4 迁移历史暂缓）。若某部署误用 `prisma migrate deploy`，该表不会创建。
2. **锁失败对"非 P2002"异常是 fail-open**：`:320-326` 仅 P2002 走 409，其它 DB 异常（含表不存在的 P2021）仅 `console.warn` 后**放行**。即：一旦 `db push` 未跑，幂等锁静默失效、双写保护归零，且无任何界面/健康检查告警。
→ 结论：在标准部署（db push 已执行）下 R1 成立；但"跨进程可靠"依赖部署纪律，缺少迁移与 fail-closed 兜底。

### R2 — 失败 Flash 补 recordLlmCall（fire-and-forget 不抛） ✅（完全通过）

- `src/app/api/import/parse/route.ts:208-210` 定义 `recordFail()`，`role:"fail:import_parse"`、`token 0`；在 4xx（`:231`）、重试耗尽（`:233`、`:251`、`:255`）、网络异常（`:251`）均调用。
- `src/lib/llm.ts:245-264` `recordLlmCall` 实现为 `void prisma.llmCallLog.create(...).catch(()=>{})`——纯 fire-and-forget，落库失败被 `.catch` 吞掉，**绝不向主流程抛错**。
- 与 `src/core/llm/client.ts:80` 的 `FAIL_ROLE_PREFIX="fail:"` 口径一致。
→ 结论：recordLlmCall 失败不影响导入主流程，回归要求满足。

### R3 — buildLoreSample 头 + 最多 4 段中段窗口 + 尾采样 ⚠️（方向对，但有长度自适应缺陷）

- `src/app/api/import/parse/route.ts:169-189`：头 16k + 中段均匀分窗（cap 4、单窗 14k）+ 尾 14k。相对原"单点中段窗口/仅 slice(0,16000)"是实质改进，>32k 长文盲区缩小。
- 但固定 `SEG=14000` 与 `MID_CAP=4` 不随文本长度自适应，产生两端问题：
  - **中等长度书（约 6万~10万字符）中段窗口互相重叠** → 重复文本喂给 LLM，造成 token 浪费 + 重复 lore 噪声（任务明确要求"不会重复采样导致噪声"，此处未完全满足）。
  - **超长书（>10万字符）中段出现 20k+ 字符的采样间隙** → 关键中段 lore 仍被漏采（任务明确要求"不会漏中段关键 lore"，此处未完全满足）。
- 数值示例：text=60k → midLen=30k、numMid=2，两段中心间距 10k、窗宽 14k → 重叠 4k；text=500k → midLen=470k、numMid=4，窗间距 94k、覆盖仅 56k/470k（~88% 中段未采）。
→ 结论：R3 部分通过（短/中等书明显优于旧版），但对"中等书重叠噪声、超长书遗漏"两项验收点**未完全达成**，记为 P2 残余（见下 N5）。

---

## 新发现问题（磐石透镜，Round 9）

> 格式：严重度 / 文件:行号 / 问题 / 建议修复 / 是否 Round8 回归标记

### N1 — P1 — 流式生成 token 计数为 0（监控/成本盲区）
- **文件:行号**：`src/core/llm/client.ts:234-242`（`establishStream` 请求体）+ `:281-351`（`readStream`）。
- **问题**：`establishStream` 的 body **未设置 `stream_options:{include_usage:true}`**；`readStream` 中 `finalUsage` 仅取 `data.usage`（多数 OpenAI 兼容流式端点默认不回传 usage），且代码内部 `completionTokens++` 计数器（逐 delta 累加）被丢弃、未用于最终用量。结果：所有走 `chatStream` 的**正文生成/续写/润色**（主流量路径）落库的 `promptTokens/completionTokens/totalTokens` 几乎恒为 0。成本看板对核心写路径**系统性少计**。
- **建议**：请求体加 `stream_options:{include_usage:true}`（硅基流动/DeepSeek 支持）；并兜底用逐 delta 累加的 `completionTokens` 作为 `data.usage` 缺失时的估算。
- **是否 Round8 回归标记**：否（既有盲区，本次未触及）。

### N2 — P1 — 默认模型不在价格表，成本看板全记 $0（token/成本盲区）
- **文件:行号**：`prisma/schema.prisma:407`（默认 `llmModel="deepseek-ai/DeepSeek-V4-Flash"`）+ `src/lib/llm.ts:192-228`（`MODEL_PRICING` / `estimateCost`）。
- **问题**：`MODEL_PRICING` 仅有 `deepseek-chat/v3/v2/reasoner`、`DeepSeek-V3/V2`、`qwen/glm/...` 等匹配串，**不含 `deepseek-v4-flash` / `DeepSeek-V4-Flash`**。默认模型全部调用 `estimateCost` 都落入 `known:false → cost:0`。即：以出厂默认模型运行，成本看板所有记录 `estimatedCost=0`，单价标注"未知"——看板对默认配置**形同虚设**。
- **建议**：在 `MODEL_PRICING` 增补 `deepseek-v4-flash` / `DeepSeek-V4-Flash`（含硅基流动与官方两条）的真实单价；并对未匹配模型做显式告警而非静默记 0。
- **是否 Round8 回归标记**：否（既有盲区）。

### N3 — P1 — DB 锁无 TTL/清理，进程崩溃即"永久孤儿锁"（可用性风险，Round8 引入）
- **文件:行号**：`src/app/api/import/commit/route.ts:316-326`、`638-645`。
- **问题**：Round 8 为"跨进程可靠"移除了原 TTL 旁路，改为**仅在 `finally` 删除锁行**。若处理过程中进程被强杀（OOM、平台超时强退、部署重启），`finally` 不执行 → 锁行永久残留。此后该项目**任何 commit 全部 409**，且无自动回收/过期机制，须人工清库。原内存 Map 是"重启丢锁（弱）"，现为"崩溃留锁（过强）"——两端都不可取，当前侧更伤可用性。
- **建议**：锁行加 `createdAt`；获取锁前清理 `createdAt` 早于 `maxDuration(300s)+余量` 的陈旧锁（stale-lock sweep），既允许真实重试、又避免崩溃后永久阻塞；或在提交成功/异常退出时以事务性"拿锁即记过期"保证可恢复。
- **是否 Round8 回归标记**：**是**（Round8 移除 TTL 直接引入此可用性风险）。

### N4 — P2 — 拆书"转为项目"无幂等保护（防重复仍漏）
- **文件:行号**：`src/app/api/dissect/[id]/to-project/route.ts:29` + `src/core/dissect/engine.ts:678-710`（`convertToProject`）。
- **问题**：`convertToProject` 仅校验 `status==="completed"`，**不检查 `task.convertedToProjectId` 是否已非空**，且永远 `prisma.project.create`（新项目）。用户双击"转为项目"或前端重试 → **创建重复项目 + 重复 lorebook 条目 + 重复 styleCard**，并仅把 `convertedToProjectId` 覆盖为最新项目 id，首个项目成孤儿。与刚修复的 `import/commit` 双写是**同类缺陷**，但此路径无任何锁。
- **建议**：进入即 `where:{id, convertedToProjectId:null}` 乐观守卫，或复用 `ImportCommitLock` 思路加 `(taskId)` 唯一约束；已转换则直接返回既有 `convertedToProjectId`。
- **是否 Round8 回归标记**：否（既有、相邻写路径未同步加固）。

### N5 — P2 — buildLoreSample 中段窗口长度自适应缺陷（R3 残余）
- **文件:行号**：`src/app/api/import/parse/route.ts:169-189`。
- **问题**：固定 `SEG=14000`/`MID_CAP=4` 导致中等书中段**重叠噪声**、超长书中段**采样间隙遗漏**（详见 R3）。
- **建议**：让 `SEG` 与窗口数随 `midLen` 连续适配（如目标覆盖 ≥ 中段 80% 且相邻窗不重叠），或改为"等距抽 N 个定长窗口 + 不足则降 SEG"；并去重相邻窗重叠段再拼接。
- **是否 Round8 回归标记**：**是**（属本修复的残余，验收点未完全达成）。

### N6 — P2 — import/commit 合并失败未记账（token 盲区）
- **文件:行号**：`src/app/api/import/commit/route.ts:100`（`if(!r.ok) return null;`）、`:120-125`（超时/catch 返回 null）。
- **问题**：`mergeOneBatch` 仅在成功时 `recordLlmCall`（`:103`），**失败（HTTP 非 2xx、45s 超时、网络异常）一律 `return null` 不记账**。合并请求已真实消耗 token，却未计入成本看板，且失败无 `fail:*` 角色可追溯。
- **建议**：失败分支补 `recordLlmCall({role:"fail:import_commit_merge",...})`（与 parse 口径一致），对齐 `client.ts` 的 FAIL_ROLE_PREFIX 实践。
- **是否 Round8 回归标记**：否（既有盲区，与 parse 的修复不对称）。

### N7 — P2 — import/commit 冗余查询 + 顺序逐条 update（性能）
- **文件:行号**：`src/app/api/import/commit/route.ts:340-344`（全量 lore 取 `enabled` 用于 globalContext）与 `:434-437`（再取一次全量 lore 用于 dedup，无 `enabled` 过滤）——**同表两次全量查询**；`:540-588` 合并回写在 `for` 循环内**逐条 `tx.characterCard.update` / `tx.lorebookEntry.update`**（N 次串行往返）。
- **问题**：大项目（数百角色需合并）下，双重全量加载 + 串行 N 次 update 拉长事务与锁持有时间，间接放大 N3 的锁阻塞窗口。
- **建议**：一次 `findMany` 同时供 globalContext 与 dedup；合并回写改 `updateMany`/分批或 `Promise.all` 并行（注意同事务内并发需 Prisma 支持）。
- **是否 Round8 回归标记**：否（既有）。

### N8 — P2 — 无全链路请求失败 trace 表（监控盲区）
- **文件:行号**：全局；失败落点散见 `console.warn/error`（如 `commit/route.ts:325`、`parse/route.ts` catch、`engine.ts` 多处 `console.log`）。
- **问题**：除 LLM 调用有 `LlmCallLog` 外，其它失败（DB 异常、解析异常、转换失败）仅进 stdout，**无结构化、可查询的失败 trace**。磐石透镜关注的"失败请求无 trace"盲区仍在——排障须翻服务端日志。
- **建议**：引入轻量 `ErrorLog`/`RequestTrace` 表（或复用现有任务表状态字段），对关键写路径失败统一落结构化记录（route、projectId、error、stack、耗时）。
- **是否 Round8 回归标记**：否（既有）。

### N9 — P2 — 长文解析全量入内存（性能/内存）
- **文件:行号**：`src/app/api/import/parse/route.ts:285`（`rawText` 整体 `replace` 进内存）+ `:142-160` `chunkByBudget` 按预算切片产生多份字符串副本。
- **问题**：整本原文作为单字符串驻留；分块模式额外持有多份切片副本（对 1M+ 字符书约 2x 内存）。本地单用户可接受，但超大书有内存峰值风险（"长文解析内存爆炸"预警点）。
- **建议**：超阈值时改用流式/分块读取（如以 `\n\n` 预切后惰性取段），避免整本 + 全副本同时驻留。
- **是否 Round8 回归标记**：否（既有）。

---

## 结论（磐石透镜 @ v0.46.71）

- **P0：无。** Round 8 修复的"跨进程/重启幂等双写"核心缺陷（内存 Map → DB 唯一约束 P2002→409）在主部署路径成立，原 P0 已闭合。
- **P1：有 3 项**，均非"原双写缺陷回归"，而是磐石透镜下的**成本/监控/可用性盲区**：
  1. **N1** 流式生成 token 恒记 0 → 成本看板对主写路径系统性失效；
  2. **N2** 默认模型不在价格表 → 出厂默认配置下成本全为 $0；
  3. **N3** DB 锁无 TTL/清理，进程崩溃即永久孤儿锁（Round8 移除 TTL 直接引入的可用性风险，标注为 Round8 回归标记=是）。
- **P2：6 项**（N4 拆书转项目无锁、N5 buildLoreSample 中段自适应、N6 合并失败未记账、N7 冗余查询+串行 update、N8 无失败 trace 表、N9 长文全量入内存）。

**磐石建议优先级**：先修 N1+N2（成本看板当前对默认使用场景基本无效，影响最直接、改动最小），再补 N3 的 stale-lock sweep（避免一次崩溃永久阻塞项目导入），其余 P2 排入后续轮次。R3 验收点（中段不重叠、不遗漏）建议借 N5 一并收口。

> 只读声明：本报告未改动任何源码/配置，仅新增本诊断文件。R1 的"db push 已建表 / 并发只成功一次"为代码+部署脚本路径推断，建议作者在本地 PG 跑一次 `SELECT count(*) FROM "ImportCommitLock"` 与双并发 commit 压测做最终实机确认。
