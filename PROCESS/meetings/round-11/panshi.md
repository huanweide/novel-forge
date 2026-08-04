# Round 11 复验 — 磐石（性能/可观测性）

> 透镜：导入性能与超时、token 成本核算、监控统计、并发限流、LLM 调用记账、防重复写入。
> 复验性质：**只读**，未修改任何源码/配置/文档。

## 环境（HEAD、你读过的文件清单）

- **HEAD**：`b5901aa`（Round 10 记忆三件套回写；Round 10 实现 v0.46.73 在 `899a480`）
- **读过的文件清单**（均经 Read 确认，行号取自实际读取）：
  - `src/app/api/import/parse/route.ts`（526 行）
  - `src/app/api/import/commit/route.ts`（662 行）
  - `src/app/api/stats/monitor/route.ts`（146 行）
  - `src/lib/llm.ts`（267 行，含 `recordLlmCall` / `MODEL_PRICING` / `estimateCost`）
  - `src/core/llm/client.ts`（620 行，含 `stream_options`、流式/非流式记账、`readStream`）
  - `src/app/api/import/quick/route.ts`（参考，纯正则路径，不涉 LLM）
  - `src/app/api/import/[taskId]/route.ts`（轮询恢复端点）
  - `src/core/assembly/tokenizer.ts`（`countTokens` 用 gpt-tokenizer/cl100k_base）
  - `prisma/schema.prisma`（`ImportCommitLock` 唯一约束）
  - 并发/超时模式全仓 grep（`maxDuration` / `setTimeout` / `Promise.all` / `CONCURRENCY`）

---

## 回归结论（Round 10 修复逐条 + 历史关键修复回流核查）

### Round 10（v0.46.73）修复点 — 全部落地、逻辑正确、无新回归

| # | 修复项 | 落地位置 | 判定 |
|---|--------|----------|------|
| F1 | import/parse 成功分支改用 `data.usage.prompt_tokens/completion_tokens`，缺失退回 `countTokens` | `parse/route.ts:241-244` | ✅ 正确。先取 `usage.prompt_tokens ?? usage.promptTokens`，再退回 `countTokens(system+user)`；completion 同理。与 commit `mergeOneBatch` 口径一致。 |
| F2 | `buildGlobalContext` 仅名称索引去细节；`mergeOneBatch` 拼本批聚焦清单 | `commit/route.ts:249-283`（名+角色/类别）、`commit/route.ts:59-62`（`batchFocus`） | ✅ 正确。全局上下文只剩「名称(角色)」与「[标题](类别)」清单，逐批聚焦名由 `batch.map(p=>p.name)` 单独拼接。全量角色/词条覆盖（不再 `slice(0,50)` 截断），后段丢失已灭。 |
| F3 | 分块解析改 **4 路限流并发池**，按完成顺序回报 SSE | `parse/route.ts:377-410`（`CONCURRENCY=4` + `nextIdx` 轮询 + `chunkResults[ci]` 按序聚合） | ✅ 正确。并发上限硬编码 4，结果按块序聚合（不丢/不重）。`doneCount` 自增在 `send` 之后、且无 `await` 穿插，单线程下无竞态。 |
| F4 | stats/monitor `since` 动态生成 | `monitor/route.ts:80-82`（月首）、`monitor/route.ts:98`（`usageMonthStart.toISOString().slice(0,10)`） | ✅ 落地。但见下方 **P2-1**：跨时区/跨月标签存在偏差。 |

### 历史关键修复回流核查 — 无回流

- **commit 空载荷校验在加锁前（400 不阻塞合法写入）**：`commit/route.ts:312-313` 在 `importCommitLock.create` 之前 `return 400`。✅ 无回流。
- **ImportCommitLock DB 唯一约束跨实例有效**：`prisma/schema.prisma:506` `@@unique([projectId, nodeId])`；`commit/route.ts:327-331` 捕获 `P2002` → 409。✅ 无回流。
- **失败 Flash 记账**：`parse/route.ts:208-209`（`recordFail` → `role:"fail:import_parse"`），`client.ts:386-394`（`FAIL_ROLE_PREFIX`）。✅ 无回流。
- **buildLoreSample 中段分块覆盖**：`parse/route.ts:169-189`（头 16k + 1~4 段中段采样 + 尾 14k）。✅ 无回流。
- **world 长文头中尾三段采样**：同上，含 `worldCoverage:"sampled"` 标记。✅ 无回流。
- **stream_options 真实 token 记账**：`client.ts:241`（`stream_options:{include_usage:true}`）+ `readStream:332-335` 取 `data.usage`。✅ 无回流。
- **MODEL_PRICING 增补默认模型**：`llm.ts:195` 含 `deepseek-v4-flash`；默认 SF 模型 `deepseek-ai/DeepSeek-V4-Flash` 经小写匹配可命中。✅ 无回流。
- **锁陈旧清理灭孤儿锁**：`commit/route.ts:319-323`（删 15 分钟前 stale 锁）。✅ 无回流。
- **callFlash 60s 超时 + 重试**：`parse/route.ts:196-197`（`CALLFLASH_TIMEOUT_MS=60_000`）、`212-258`（≤3 次）。✅ 无回流。
- **分块字符预算**：`parse/route.ts:18`（`CHUNK_CHAR_BUDGET=16000` + `CHUNK_OVERLAP=300`）。✅ 无回流。

---

## 新发现问题

### P0
无。未发现会导致崩溃/内存爆炸/并发竞态致数据损坏的 P0 级问题。并发池的 `nextIdx`/`chunkResults[ci]` 聚合、commit 的 DB 事务整体回滚、锁唯一约束均正确，无数据损坏路径。

### P1

#### P1-1 ｜ commit 路径 merge 批次并发**无上限**，与 parse 的 4 路限流池口径不统一
- **症状**：导入一个超大项目（数百角色 + 数百词条，且多数与库内已有实体重名）时，会同时向 LLM 提供方发出数十个 `mergeOneBatch` 请求；易触发 429 限流或打爆提供方，且单批 45s 超时在无限并发叠加下整体延迟不可控、可能把 `commit` 自己的 300s 预算吃满。
- **file:line**：`commit/route.ts:433`（`charAiResults = await Promise.all(charBatches.map(...))`）、`commit/route.ts:491`（`loreAiResults = await Promise.all(loreBatches.map(...))`）。`BATCH_SIZE=4` 只是「每批条目数」，不是「并发批数」——批数 = `ceil(N/4)`，全部经 `Promise.all` 一次性放飞。
- **根因**：parse 用 `CONCURRENCY=4` 的 worker 池限流；commit 只统一了 *usage 记账*口径，未统一 *并发*口径，merge 阶段并发数 = 批数，随导入规模线性放大，无封顶、无信号量。
- **建议改法**：引入与 parse 一致的 4 路（或可调 `MERGE_CONCURRENCY`）并发池/信号量，对 char 与 lore 两路各自限流（或共享一个池），杜绝瞬时数十并发；`send` 进度仍按完成顺序回报。

#### P1-2 ｜ parse 路径的 300s 强杀保护**不保证**——4 路池 + 每块 60s×3 重试 + 串行 B 路仍可能超时
- **症状**：对 30 万+ 字超大书，`chunkByBudget` 切 ~19 块；任一块若连续超时重试（每块最多 3×60s=180s），单个 worker 串行处理 5 块即可能逼近/超出 300s；且与「分块后串行执行的 B 路世界提取」叠加（见 P1-3）后，整体 wall time 仍可能被平台 300s 强杀，导致**整次解析结果丢失**（SSE 被截断，前端拿不到 `done`）。
- **file:line**：`parse/route.ts:215`（`CALLFLASH_TIMEOUT_MS` 单次超时）、`parse/route.ts:377`（4 路池，但无全局 deadline）、`parse/route.ts:464`（B 路单路 `callFlash`）。
- **根因**：限流池只压低了**平均**耗时，没有**全局截止时间**——超时重试与 B 路串行是 pool 之外的不可控尾巴；没有「到点即停、返回 partial」的兜底。
- **建议改法**：在 `start` 内引入全局 deadline（如 `DEADLINE = t0 + 270_000`），worker 取块前检查 `Date.now() > DEADLINE` 则停止领取新块并跳出；已完成的块照常聚合，最终 `status:"partial"` 返回已解析角色——保证超大书至少拿到大部分结果而非全丢。

#### P1-3 ｜ B 路世界/文风提取为**单路非并发串行瓶颈**（超大书）
- **症状**：分块模式下 `buildLoreSample(text)` 对 30 万字书产出「头 16k + 最多 4×14k 中段 + 尾 14k」≈ 82k 字符的超大 prompt，再由**单个** `callFlash`（max_tokens 32768）串行处理，既不受 4 路池保护，又可能在慢模型上独自吃掉数十秒~180s，直接加剧 P1-2 的 300s 风险。
- **file:line**：`parse/route.ts:446-469`（`const loreText = needsChunking ? buildLoreSample(text) : text` + 单路 `callFlash`）。
- **根因**：world 提取被当作「附属步骤」单路处理，未并入限流池，也未共享 P1-2 的全局 deadline。
- **建议改法**：B 路同样接入全局 deadline；或将其纳入并发池（但注意它与 chunk 阶段是顺序依赖，仅需在 chunk 完成后限流拉起，并受 deadline 约束）。world 失败时已标 `worldFailed`/`partial`，质量退化可控，但时间占用需纳入预算。

#### P1-4 ｜ commit `mergeOneBatch` 的 `totalTokens` 在 provider 不返 `total_tokens` 时**归零**，与 parse 口径不一致 → 监控 totalTokens 失真
- **症状**：当提供方响应不含 `total_tokens`（仅给 `prompt_tokens/completion_tokens`，部分 OpenAI 兼容代理如此）时，`mergeOneBatch` 记 `totalTokens: 0`，而 `promptTokens/completionTokens` 真实。monitor 的 `llmUsage.totalTokens` 取自 `_sum.totalTokens`（`monitor/route.ts:102`），会**被拉低/归零**，与真实的 `prompt+completion` 之和不符。
- **file:line**：`commit/route.ts:113`（`totalTokens: usage?.total_tokens ?? usage?.totalTokens ?? 0`）对比 `parse/route.ts:244`（`totalTokens: promptTokens + completionTokens`）。
- **根因**：两处「缺失回退」策略不一致——parse 用「prompt+completion 求和」兜底，commit 用「0」兜底。
- **建议改法**：commit 与 parse 统一为 `totalTokens: (usage?.total_tokens ?? usage?.totalTokens ?? (promptTokens+completionTokens))`，保证缺失时回退到求和而非 0。

### P2

#### P2-1 ｜ monitor `since` 跨时区/跨月标签偏差（与查询边界不一致）
- **症状**：`usageMonthStart = new Date(); setDate(1); setHours(0,0,0,0)` 是**本地时区**月首；但 `since` 标签用 `usageMonthStart.toISOString().slice(0,10)` 转 **UTC** 输出。服务器为东八区（UTC+8）时，本地 8/1 00:00 = UTC 7/31 16:00，标签显示 `2026-07-31`，与查询实际边界（含 7/31 16:00 起的数据）错位一天；月末/月初临界点尤为明显，用户看到「本月起始日」与数据范围对不上。
- **file:line**：`monitor/route.ts:80-82`、`monitor/route.ts:98`。
- **根因**：边界按本地时间计算，标签却按 UTC 字符串化，二者混用。
- **建议改法**：`since` 用本地格式化（如 `usageMonthStart.toLocaleDateString('sv')` 或手动拼 `YYYY-MM-DD`），与查询边界同源；或全程统一用 UTC（月首也按 UTC 计算）。

#### P2-2 ｜ 非流式主力生成路径 `attemptChat` 无 `countTokens` 兜底
- **症状**：`client.ts` 的 `attemptChat`（`client.ts:174-221`）在 `data.usage` 缺失时直接记 `prompt/completion/total = 0`，**没有**像 parse 那样退回 `countTokens` 估算。一旦提供方不返回 usage（某些代理/自托管），正文生成、续写、润色等**所有走 `completeText/chat` 的调用成本全部记 0**——成本看板对主生成链路完全失明。
- **file:line**：`client.ts:210-221`（仅取 `data.usage`，无 fallback）。
- **根因**：Round 10 只在 import/parse 的定制 fetch 加了兜底，主力 client 层未同步。
- **建议改法**：在 `attemptChat` 成功解析后，对缺失的 `prompt_tokens/completion_tokens` 用 `countTokens(messages)` 估算兜底（注意中文 cl100k_base 是近似，已在任务中预警的分词偏差，仍优于记 0），与 parse 口径对齐。

#### P2-3 ｜ dailyWords / llmUsage 均按 **UTC 日期** 聚合，跨时区「今日产出」错位
- **症状**：`monitor/route.ts:64-75` 用 `d.toISOString().slice(0,10)` 生成近 14 天桶、`ts.toISOString().slice(0,10)` 归桶；非 UTC 时区下，当地「今天」的章节可能被计入「昨天」。属展示层轻微失真。
- **file:line**：`monitor/route.ts:64-75, 70-73`。
- **建议改法**：与 P2-1 一并统一时区策略（本地日期或显式 UTC），并在 UI 注明时区基准。

### P3

#### P3-1 ｜ `recordLlmCall` 在 parse/commit 未传 `projectId`
- 所有 import 路径的 LLM 调用 `projectId` 均为 `null`（`parse/route.ts:244`、`commit/route.ts:108`），monitor 只能做全站聚合、无法按项目归因成本。monitor 注释已声明此限制，但若要 per-project 看板，import 路径本可顺手带 `projectId`。影响：可观测性颗粒度，非正确性。

#### P3-2 ｜ `mergeOneBatch` 无重试
- `commit/route.ts:80-130` 仅 45s 超时（`AbortController`），超时/5xx 即返回 `null` → 回退规则合并。瞬时 429 会牺牲 AI 合并质量（虽不丢数据）。可考虑在 merge 层加 1~2 次退避重试（注意与 P1-1 限流池配合，避免重试放大并发）。

#### P3-3 ｜ `characters/expand` 并发 16 路（相关观察）
- `characters/expand/route.ts:18`（`CONCURRENCY=16`）同样是无 deadline 的并发池，规模上比 import 更易触发 429。不在本轮重点文件清单内，但同属「并发限流无全局预算」家族，建议后续统一收口到一个共享限流/截止工具。

---

## 终止判定倾向（你透镜下是否还有 P0/P1？）

- **P0：无。** 没有崩溃、内存爆炸、并发竞态致数据损坏的路径。锁（DB 唯一约束 + stale 清理）、事务整体回滚、聚合按序写回均正确。
- **P1：仍有 4 项，建议本轮回填后再放行：**
  1. **P1-1**（commit merge 并发无上限，与 parse 4 路池口径脱节）——最实打实的并发/限流隐患，规模越大越危险。
  2. **P1-2**（parse 300s 强杀保护不保证，缺全局 deadline）——超大书仍有整次结果被平台强杀丢失的风险。
  3. **P1-3**（B 路世界提取单路串行，超大书时间尾巴）——加剧 P1-2。
  4. **P1-4**（commit `totalTokens` 缺失归零，与 parse 口径不一致）——监控 totalTokens 失真。
- 结论：**本透镜下仍有 P1 未闭环**，不建议在 P1-1~P1-4 修复前宣告「可观测性/并发限流」彻底稳定。P2-1/P2-2 为稳健性补强，可在同轮顺带处理。
