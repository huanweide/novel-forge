# Round 12 复验 · 磐石透镜（性能/监控/token 记账/防重复/并发/超时）

> 被验 HEAD：`1cee64d` Round 11。只读复验，未改动 `src/`、changelog/version/MEMORY。
> 透镜定位：性能（解析/合并/LLM 并发与限流）、监控（token 真实记账、MODEL_PRICING 默认模型成本、monitor since 动态生成）、防重复（ImportCommitLock DB 唯一约束 + 幂等锁陈旧清理）、超时（300s/280s 强杀、abort 透传）、整体事务。

---

## 一、回归结论（A 类，逐条 PASS/FAIL）

| # | 验收点 | 结论 | 证据 |
|---|--------|------|------|
| A1 | commit 模块级 `pLimit(4)` 限流 + char/lore 两路经 `MERGE_LIMIT` 放飞（合计≤4） | **PASS** | `commit/route.ts:44-61` 定义 `pLimit`/`MERGE_LIMIT`；`:460` char 路 `MERGE_LIMIT(()=>mergeOneBatch(...))`，`:518` lore 路同构；两路共用同一信号量，合计并发≤4 |
| A2 | parse 加 `PARSE_DEADLINE_MS=280_000` + `pastDeadline()`，worker 取块前检测、到点优雅中断、已完成块聚为 `partial` + `skippedChunks` 上链 | **PASS** | `parse/route.ts:372-375` 定义 deadline；`:440` worker 取块前 `if(pastDeadline()){deadlineHit=true;break;}`；`:473` `skippedChunks=chunks.length-Object.keys(chunkResults).length`；`:519` `status:"partial"` |
| A3 | parse 抽出 `runWorldExtraction()`，分块 A 路 4 worker 与 B 路经 `Promise.all` 并行（非分块 A/B 也并发，不再串行尾部） | **PASS** | `parse/route.ts:379` 抽出函数；`:467-468` 分块模式 `const bPromise=runWorldExtraction(); await Promise.all([...workers,bPromise])`；`:501-502` 非分块 `aPromise`/`bPromise` 并发 |
| A4 | `mergeOneBatch` totalTokens 回退统一为 `usage?.total_tokens ?? usage?.totalTokens ?? (promptTokens+completionTokens)`，与 parse 口径一致 | **PASS** | `commit/route.ts:139`；解析侧 `parse/route.ts:242-244` 已用 `usage?.prompt_tokens/?/completion_tokens?` 取真实值 |

回归结果：**4/4 全部 PASS，无回退**。Parse 与 commit 两侧的 deadline/限流/并发隔离均真实落地。

---

## 二、新挖问题清单（B 类，磐石透镜）

### P1

**P1-1 · commit 缺全局 deadline，大导入会被 300s 平台强杀整段丢弃（丢算力，非丢数据）**
- 文件：`src/app/api/import/commit/route.ts:16,457-464,515-522`
- 现象：parse 有 280s 内部 deadline + partial 兜底；commit 仅设 `maxDuration=300` 且**无内部 deadline**。合并阶段在事务外跑：`MERGE_LIMIT(4)` 信号量 × 每批 `TIMEOUT_MS=45_000`，但批数无上界。200 个角色对 → 50 批 → 约 13 波 × 45s ≈ 585s > 300s。平台在 300s 硬杀 → SSE 切断 → 事务未启动 → 整段合并白做，用户须整体重导。原子事务保证“不脏写”，但算力/体验全损。
- 根因：合并阶段只有 per-batch 超时，没有“到点停止放飞新批、已完成的照常落库”的总闸。
- 建议：`commit` 增加 `COMMIT_DEADLINE_MS=270_000` + `pastDeadline()`；`charBatches.map`/`loreBatches.map` 放飞前检测，到点即停；已完成的 AI 合并结果正常进入事务，未放飞批次降级为 `ruleMerge`（兜底），并向 SSE 回报 `partial`，与 parse 行为对齐。

**P1-2 · parse 的 totalTokens 仍用朴素求和，忽略供应商 `usage.total_tokens`（与 commit 口径不一致）**
- 文件：`src/app/api/import/parse/route.ts:244`
- 现象：`recordLlmCall({... totalTokens: promptTokens + completionTokens ...})`，而 commit 侧已优先 `usage?.total_tokens ?? usage?.totalTokens ?? 求和`（`commit/route.ts:139`）。若供应商返回的真实 `total_tokens`（含缓存命中/惩罚/reasoning 折抵）与 `prompt+completion` 不同，parse 路径在 monitor 的 `totalTokens` 聚合被低估。
- 根因：parse 修了 `prompt/completion` 取真实值，却漏把 `total_tokens` 同样回退。
- 建议：改为 `totalTokens: usage?.total_tokens ?? usage?.totalTokens ?? (promptTokens + completionTokens)`，与 commit 完全一致。

**P1-3（降级观察，可置 P2）· parse 世界抽取与首块文本头 16k 重叠重复计费**
- 文件：`src/app/api/import/parse/route.ts:381,422,469`
- 现象：分块模式下 `runWorldExtraction` 调 `buildLoreSample(text)`，其 HEAD=16k 取 `text.slice(0,16000)`；而 chunk 第 0 块 `chunks[0]` 也是 `text.slice(0,~16000)`。长文里这 16k 被发往 LLM 两次（A 路一次、B 路一次），浪费 ~16k 输入 token/次解析。
- 建议：世界采样跳过与 chunk[0] 重叠的头部，或复用 chunk[0] 文本，避免重复。成本量级小，标 P2 亦可。

### P2

**P2-1 · commit 幂等锁清理是 fire-and-forget，失败则锁滞留至陈旧阈值**
- 文件：`src/app/api/import/commit/route.ts:345-349,676-680`
- 现象：`finally` 内 `deleteMany(...).catch(()=>{})` 静默丢弃失败。正常“done”已回发客户端，仅“盲目客户端重试”会在 15min 内吃 409。另 `STALE_LOCK_MS=15min` ≫ 平台 `maxDuration=5min`，安全但对“同进程崩溃重启”场景，残留锁窗口偏长。
- 建议：陈旧阈值收窄到 ~6min（略大于单次最大合法耗时）；清理失败记一条 warn 日志便于排查。

**P2-2 · parse “fail” 记账按 attempt 次数刷行，虚增 monitor 调用数**
- 文件：`src/app/api/import/parse/route.ts:209,233,253,257`（callFlash 内 `recordFail`）
- 现象：`CALLFLASH_MAX_RETRIES=2`，单块若持续失败会写最多 3 条 `fail:import_parse`（`promptTokens=0`）。monitor 按 `_count` 展示 `totalCalls`，失败重试会被重复计数（金额=0，但调用次数指标失真）。
- 建议：`recordFail` 改为每次 `callFlash` 调用只记一次（在返回错误前记一次，而非每次 attempt 都记）。

**P2-3 · `recordLlmCall` 全量 fire-and-forget，重导入并发下 DB 背压会静默丢记账**
- 文件：`src/lib/llm.ts:247-266`；调用点 `parse/route.ts:209/244`、`commit/route.ts:134`
- 现象：parse 4 worker + B 路、commit 4 路并发，各自 `prisma.llmCallLog.create().catch(()=>{})` 不 await。DB 抖动时部分落库失败被静默吞掉 → 成本看板在重导入期间系统性低估。仅影响监控、不影响数据，故 P2。
- 建议：导入路径改用有界批量写入或至少对失败计数告警（如累加本地计数器，SSE 末帧附 `llmLogDropped`）。

**P2-4 · commit 即使无需合并也构建 `buildGlobalContext` 全文名索引**
- 文件：`src/app/api/import/commit/route.ts:380`（且 `:375-379` 仍查全量 chars/lore 用于查重，必要）
- 现象：当 `charMergePairs` 与 `loreMergePairs` 均为空（纯新插入、无合并），`buildGlobalContext` 仍拼装大字符串并随每批发送——但本批无 merge。属微量浪费。
- 建议：仅当存在 merge 对时才构建并传入 `globalContext`，纯新增路径跳过。

**P2-5 · `max_tokens:32768` 对单块角色抽取偏大**
- 文件：`src/app/api/import/parse/route.ts:401,446,483`
- 现象：角色块抽取极少需要 32k 输出；拉满 `max_tokens` 会增加供应商排队与超时概率，且与 `CALLFLASH_TIMEOUT_MS=60s` 不相称。
- 建议：角色块单批上限降到 ~8k–12k（足够单块≤30 角色），保留世界抽取 32768 以拉满设定。

---

## 三、已确认稳健项（无需改）
- **防重复**：`ImportCommitLock` 具 `@@unique([projectId,nodeId])`（`prisma/schema.prisma:506`），并发第二请求触发 P2002 → 409，跨实例有效；陈旧锁清理（`:347`）先于加锁，避免空载荷 400 残留锁（`:338-339` 已前置校验）。**无重复写入风险。**
- **监控 since 动态生成**：`monitor/route.ts:80-98` 以“本月 1 号 00:00”动态计算 `usageMonthStart` 并作为 `llmUsage.since` 返回，确为运行时生成。
- **默认模型成本**：默认 `deepseek-ai/DeepSeek-V4-Flash`（siliconflow）落入 `MODEL_PRICING` 的 `match:"deepseek-v4-flash"`（`lib/llm.ts:195`），`estimateCost` 大小写不敏感包含匹配 → 成本 `known=true`，非 0。
- **abort 透传**：`mergeOneBatch`（`commit:103-123`）与 `callFlash`（`parse:214-223`）均用 `AbortController` 且 `signal` 透传 fetch，超时正确中断；`commit` 45s / `parse` 60s 双档保护。

## 四、结论
- 回归 4/4 PASS，Round 11 磐石侧修复真实落地、无回退。
- 新挖：**P0=0，P1=3（P1-1 缺全局 deadline / P1-2 totalTokens 口径不一致 / P1-3 头部重叠计费），P2=5**（锁清理、fail 计数、记账静默丢、空合并浪费、max_tokens 偏大）。
- 优先级建议：先修 **P1-1**（commit 全局 deadline，防大导入被强杀），其次 **P1-2**（与 commit 对齐 totalTokens 口径）。
