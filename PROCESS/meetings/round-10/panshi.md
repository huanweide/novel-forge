# 磐石（性能 / 监控 / token / 防重复）— Round 10 L1 只读复验报告

- 复验角色：股东·磐石（性能 / 监控 / token 记账 / 防重复 / 召回上下文爆量）
- 复验性质：Round 10 L1 只读复验（对 Round 9 修复的回归验证 + 透镜内新坑挖掘 + Round 9 改动回归风险确认）
- 复验对象：Novel Forge `v0.46.72`（git HEAD `7814d03`，工作树干净，Round 9 提交之后无新改动）
- 配套提交：`7814d03`（Round 9 实现：流式成本可见 / 默认模型定价 / 陈旧锁清理；`client.ts +1`、`llm.ts +2`、`commit/route.ts +8`）
- 方式：对 `src/` 严格只读，仅新增本诊断文件，未改任何源码。验证手段：读 `src/core/llm/client.ts`、`src/lib/llm.ts`、`src/app/api/import/{commit,parse}/route.ts`、`src/app/api/characters/{classify,expand}/route.ts`、`src/app/api/stats/monitor/route.ts`；`git show --stat 7814d03` 确认配套提交；`git grep chat/completions` 排查裸 LLM fetch；跑 `vitest run src/core/babylore/fill.ops.test.ts` 确认 Round 9 记账改动未回归。
- 实机说明：未连接运行 DB / 真机 LLM。涉及运行期行为（stream_options 在端点真实响应、token 真实值、并发锁竞态）均标注「未经实测，待验证」。

---

## 回归验证（Round 9 三项修复，commit 7814d03）

### V1 — N1：establishStream body 加 `stream_options:{include_usage:true}` ✅（通过，有要件外回归风险，见 F1）

代码确认：
- `src/core/llm/client.ts:241` 在 `establishStream` 请求体内已写入 `stream_options: { include_usage: true }`（位于 `stream: true` 之后、thinking 展开之前）。
- 流式用量回收链路完整：`readStream` 在收到含 `usage` 的 SSE 事件时更新 `promptTokens/completionTokens`（`client.ts:332-335`），并在 `[DONE]`/流末通过 `onUsage` 回调把真实用量传给 `recordLlmCall`（`client.ts:419-428`），最终落 `llmCallLog.promptTokens/completionTokens/totalTokens`。
- 兜底：即便端点不回传 `usage`，逐 delta 累加的 `completionTokens` 仍用于 `finalUsage`（`client.ts:345`），不再恒为 0。
→ 结论：流式主写路径（正文/续写/润色）的 token 真实记账已落地，Round 9 修复生效，无回退。

### V2 — N2：MODEL_PRICING 增补默认模型 `deepseek-v4-flash` ✅（通过）

代码确认：
- `src/lib/llm.ts:195` 已新增 `{ match: "deepseek-v4-flash", input: 0.14, output: 0.28, label: "DeepSeek V4 Flash（估算价，以官方为准）" }`。
- 默认模型串来自 `src/lib/llm.ts:26`：`siliconflow: "deepseek-ai/DeepSeek-V4-Flash"`。`estimateCost`（`llm.ts:224-230`）执行 `m.includes(p.match.toLowerCase())`，即 `"deepseek-ai/deepseek-v4-flash".includes("deepseek-v4-flash") === true` → 命中该条目，`known:true`，成本可见。
- 匹配顺序无污染：`deepseek-chat` 条目（`:193`）对默认串不匹配，默认串在 `:195` 被正确命中。
→ 结论：出厂默认模型不再落入 `known:false → cost:0`，成本看板对默认配置生效，Round 9 修复落地、无回退。

### V3 — N3：获取 ImportCommitLock 前先删 15 分钟陈旧锁 ✅（通过，顺序正确）

代码确认：
- `src/app/api/import/commit/route.ts:318-322`：定义 `STALE_LOCK_MS=15min`，在 `create` 之前先 `prisma.importCommitLock.deleteMany({ where:{ projectId, nodeId:COMMIT_LOCK_NODE, createdAt:{ lt: staleThreshold } } })`，并 `.catch(()=>{})` 容错。
- `:326` 随后 `prisma.importCommitLock.create(...)` 拿锁；`:328-334` 捕获 `P2002` → 409 跳过；`:646-653` 在 `finally` 释放。
- 顺序明确：**先删 stale（仅删 15 分钟前）→ 再 create**。正常进行中的新锁（createdAt 较近）不会被误删，仍触发 409；仅真正过期的崩溃孤儿锁被清理。
→ 结论：陈旧锁清理顺序正确，Round 9 修复落地、无回退；崩溃永久孤儿锁缺陷闭合。

---

## 新发现问题（磐石透镜，Round 10）

> 格式：严重度 / 文件:行号 / 问题 / 建议方向 / 是否 Round 9 回归引入

### F1 — P2 — `stream_options` 在严格/自定义端点可能触发 400 且无优雅降级（Round 9 引入的回归风险）
- **文件:行号**：`src/core/llm/client.ts:234-242`（加 `stream_options`）、`:269-276`（`if(!response.ok)` 分支：`isRetryable(400)===false` → `fatal:true` → 抛错）。
- **问题**：Round 9 为流式记账新增的 `stream_options` 字段，对默认端点（硅基流动 `deepseek-ai/DeepSeek-V4-Flash`、DeepSeek 官方 `deepseek-v4-flash`）均支持，无影响。但**部分 OpenAI 兼容端点对未知字段严格校验，会返回 400**。当前 `establishStream` 把 4xx 判为 `fatal` 直接抛错，`chatStream` 整条流式调用失败，**且没有任何"去掉 stream_options 重试一次"的兜底**——即：Round 9 新增字段可能让"原本可用的自定义端点"反而硬失败。
- **建议**：`establishStream` 收到 400 且 body 含 `stream_options` 时，重试一次不带 `stream_options` 的请求（保留 usage 缺失时的逐 delta 兜底计数，即 V1 已有的 `completionTokens++` 机制）；或在 `getEffectiveConfig` 增加「端点是否支持 stream_options」开关。
- **是否 Round 9 回归引入**：**是**（N1 修复直接引入，对默认端点无碍，仅自定义端点有风险）。**未经实测，待验证**（默认端点已确认支持，需作者在自定义端点跑一次流式确认）。

### F2 — P1 — import/parse 的 callFlash 用 tokenizer 估算 token，未用 API 真实 usage（监控口径不一致）
- **文件:行号**：`src/app/api/import/parse/route.ts:237`（`const data = await res.json()` 已含 `data.usage`）、`:240-242`（记账却用 `countTokens(systemPrompt+"\n"+userPrompt)` 与 `countTokens(raw)` 估算）。
- **问题**：`callFlash` 成功分支已解析 `data`，其中 `data.usage.prompt_tokens/completion_tokens` 是**供应商真实计费值**，但被丢弃，改用 `countTokens` 估算。后果：(1) import/parse 成本看板是分词估算，与 `import/commit/mergeOneBatch`（`route.ts:102-109` 用真实 `data.usage`）**口径不一致**；(2) 中文分词估算偏差较大，成本失真；(3) 与 N2 修复后"成本可见"的目标冲突——可见但可能不准。
- **建议**：成功分支改用 `data.usage.prompt_tokens/completion_tokens`（缺失时退回 `countTokens` 兜底）；`recordLlmCall` 传真实值，使全链路（parse/commit/client）统一以真实 usage 记账。
- **是否 Round 9 回归引入**：否（既有盲区，与 Round 9 的 parse 失败记账修复不对称）。

### F3 — P1 — import/commit 合并：globalContext 随每个批次重复发送（token 浪费 / 大世界爆量）
- **文件:行号**：`src/app/api/import/commit/route.ts:244-282`（`buildGlobalContext` 内联首 50 角色+首 30 lore，约数 k 字符）、`:51-55` 与 `:433`/`:491`（`mergeOneBatch` 每批都将 `globalContext` 整体拼进 prompt）。
- **问题**：分批合并（每批 4 个）时，`globalContext` 被**逐批重复发送**。200 角色 → 约 50 批，每批携带几乎相同的 globalContext（首 50 角色 + 首 30 lore，约 5–7k 字符 ≈ 数 k token）→ 单次大导入约 **30 万+ token 冗余**。这正是磐石透镜关注的「大世界召回上下文爆量 + token 浪费」。批数越多浪费越大，且 globalContext 截断到首 50/30，200+ 词条世界反而丢失后段上下文（召回完整性也被牺牲）。
- **建议**：(1) 压缩 globalContext 仅保留与本批相关的邻近角色/词条名清单，而非全量；(2) 或把"全量 globalContext"合并为单次高 layer 调用，批次内仅传本批对象；(3) 降低 `slice(0,50)/slice(0,30)` 上限并去重，控制单批上下文体积。
- **是否 Round 9 回归引入**：否（既有）。

### F4 — P1 — import/parse 分块顺序串行，超大书易超 `maxDuration(300s)`（长任务无兜底）
- **文件:行号**：`src/app/api/import/parse/route.ts:365-392`（`for` 循环顺序 `await callFlash`，单块超时 `CALLFLASH_TIMEOUT_MS=60s`）、`:15`（`export const maxDuration = 300`）。
- **问题**：分块模式逐块**串行**调用，无并发。500k 字符书约 31 块 → 最坏 31×60s ≈ 31 分钟，远超函数 `maxDuration=300s`。平台在 5 分钟强杀 SSE → `importTask` 停在 `parsing` 永不 `completed`，用户拿到部分角色且无断点恢复（虽有 `importTask` 表，但无 resume 逻辑）。属"长任务被超时截断、进度有但结果残缺"。
- **建议**：(1) 分块并发（`Promise.all` 限流 N 路，如 4 路），把 31 分钟压到约 8 分钟仍超限则走方案 2；(2) 将解析迁为后台任务 + 前端轮询（已具备 `importTask` 表，可直接承载状态机），彻底解耦 SSE 300s 限制。
- **是否 Round 9 回归引入**：否（既有），但属磐石透镜「长任务进度/完成保障」核心关注点。

### F5 — P2 — import/commit 同表两次全量查询 lore（冗余 fetch）
- **文件:行号**：`src/app/api/import/commit/route.ts:348-352`（`allExistingLore` 取 `enabled:true` 供 globalContext）与 `:442-445`（`allLoreForDedup` 再取一次全量 lore 用于去重，**无 `enabled` 过滤**）。
- **问题**：同一 `lorebookEntry` 表在一次请求内**全量查询两次**。200+ 词条大世界下双倍加载，拉长事务与锁持有窗口，间接放大 V3 的锁阻塞面（也放大 N3 修复前的孤儿锁窗口）。Round 9 报告已记此问题（彼时 N7），`7814d03` 未修。
- **建议**：一次 `findMany` 同时满足 globalContext 与去重两用途（按用途各自 slice/filter），消除重复全量扫描。
- **是否 Round 9 回归引入**：否（既有，Round 9 已知未修）。

### F6 — P2 — stats/monitor 的 `since` 标签硬编码，与真实按月窗口不符（监控显示误导）
- **文件:行号**：`src/app/api/stats/monitor/route.ts:80-82`（`usageMonthStart` 动态取当月 1 号）、`:98`（`since: "2026-08-02"` 写死）、`:83-96`（聚合窗口用 `usageMonthStart`）。
- **问题**：成本看板实际按"当月 1 号起"聚合，但返回的 `since` 字段写死 `"2026-08-02"`，与真实查询窗口不一致。看板显示的"统计起始日期"误导用户（尤其跨月时）。属监控数据完整性/展示正确性缺陷。
- **建议**：`since` 由 `usageMonthStart.toISOString().slice(0,10)` 动态生成，消除硬编码。
- **是否 Round 9 回归引入**：否（既有）。

### F7 — P2 — chatStream 用户中止（abort）时 usage 未记账（成本漏记）
- **文件:行号**：`src/core/llm/client.ts:282-352`（`readStream`）；中止路径：`reader.read()` 因 `request.signal` 抛错 → `finally` 仅 `releaseLock()` → 异常向外传播，`onUsage`（`client.ts:345-346`）不执行。
- **问题**：用户点"停止生成"触发 `AbortSignal`，流式读取中断，`readStream` 正常流程（含末段 `onUsage`）被跳过 → 该次已发生的流式调用 `totalTokens` **不落库**。成本看板对「被用户中断的生成」系统性漏记（这部分确实消耗了 token）。
- **建议**：在 `readStream` 的 `catch` 中对 `AbortError` 仍以已累计的 `promptTokens/completionTokens` 调一次 `onUsage`（近似记账），保证中断调用也入 `llmCallLog`。
- **是否 Round 9 回归引入**：否（既有，与 V1 的流式记账改进相邻）。

### F8 — P2 — 角色别名去重为 O(新角色 × 已有别名总数)（近二次扫描）
- **文件:行号**：`src/app/api/import/commit/route.ts:360-388`（`charByAlias` 遍历 + 每角色对 `aliasesLower.some(...)`）。
- **问题**：对每个新角色遍历所有"含别名的已有角色"并对各自别名做 `.some`。大世界下复杂度接近 O(新角色 × 已有别名总数)，虽为一次性内存去重、非逐 token，但 200+ 角色且别名众多时偏二次，属透镜关注的「大世界查重 O(n²) 风险」最接近点。
- **建议**：反向建 `aliasLower → existingChar` 索引 `Map`，命中 O(1)；或先按 `charByName` 精确名命中、未命中再走别名索引，去掉嵌套 `.some` 遍历。
- **是否 Round 9 回归引入**：否（既有）。

> 召回/匹配扫描核查结论：未检出真正的 O(n²) 召回扫描。`buildGlobalContext`（`route.ts:244-282`）、`buildLoreSample`（`parse/route.ts:169-189`）、`classify` 的 `buildWorldContext`（`classify/route.ts:180-188`）均为 O(n) 且对 200+ 世界有硬上限（slice/top-N），**无上下文爆量**；最接近二次的是 F8 的别名去重 O(n·a)。

---

## 结论（磐石透镜 @ v0.46.72 / Round 10）

- **P0：无。** Round 9 三项修复（V1 流式真实记账 / V2 默认模型定价 / V3 陈旧锁清理）全部落地、无回退，原 P0/P1 缺陷闭合。
- **P1：3 项**（均非 Round 9 修复回退，属透镜既有盲区，最优先修）：
  1. **F2** import/parse 用 tokenizer 估算而非真实 usage → 成本看板口径不一致、失真；
  2. **F3** import/commit 合并 globalContext 逐批重复发送 → 大世界 30 万+ token 冗余 + 后段上下文丢失；
  3. **F4** import/parse 分块串行 → 超大书超 `maxDuration` 被强杀、结果残缺无恢复。
- **P2：5 项**：F1（stream_options 无优雅降级，Round 9 引入的回归风险）、F5（lore 同表两次全量查询）、F6（monitor `since` 硬编码）、F7（abort 时 usage 漏记）、F8（别名去重近二次）。

**磐石建议优先级**：先收 F2+F3（成本看板口径统一 + 大导入 token 浪费，改动小、收益直接），再排 F4（大书导入完成保障，需并发/后台化，工作量较大），P2 中 F1 因是 Round 9 引入的回归风险建议在本轮顺手加「去 stream_options 重试」兜底，其余排后续轮次。

> 只读声明：本报告未改动任何源码/配置，仅新增本诊断文件。V1/V2/V3 为代码静态确认；F1 的端点 400 行为、F4 的超时强杀、F2 的真实 usage 值均「未经实测，待验证」，建议作者在默认端点 + 一个自定义端点各跑一次流式、并对 200+ 词条大世界实跑一次导入做最终确认。`vitest run src/core/babylore/fill.ops.test.ts` 已通过（10/10），佐证 Round 9 记账改动（`fill.ts` 的 `recordLlmCall`）未回归。
