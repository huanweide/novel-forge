# Round 4 股东「磐石」QA 报告 —— 监控/成本/失败重试 复验 + 新盲区

> 身份：会员股东「磐石」，透镜 = 监控后台 + 成本 + 失败重试 + 批量任务可恢复性。
> 方法：只读分析（Read/Grep 核对真实行号），**未改任何 src 源码**。结论均可在 file:line 证实。
> 对照：round-3/panshi.md（R3 提出 import/parse 裸 fetch 未记账 P0 + 失败章被标已填永不重试 P0，本轮复验其修复）。
> 代码基准：CHANGELOG 已标注「监控盲区彻底清零」等，但 report 以真实代码为准，不盲信 changelog。

---

## ① 回归确认（Round 3 两条 P0 修复是否稳）

### 回归 1：import/parse callFlash 补 recordLlmCall —— 已生效（但用估算值，见 P1-2）
`src/app/api/import/parse/route.ts:170-173` 已在 `callFlash` 取到 `data` 后调用 `recordLlmCall({ role:"import_parse", ... })`，全文件 `recordLlmCall` 调用数从 R3 的 0 变为 1。
**确认生效。** 但实现与 R3 建议写法（用 API 返回的 `usage?.prompt_tokens`）不同：它用 `countTokens(systemPrompt+"\n"+userPrompt)` + `countTokens(raw)` 估算（`:171-173`），见 P1-2。

### 回归 2：babyloreFillAll 失败章 if(r.ok) 守卫 —— 已生效（真实修复）
`src/core/babylore/fill.ts:472-478` 现为：
```ts
if (r.ok) {                       // ← R3 修复：仅成功章标记
  filledSet.add(ch.id);
  filledMap[projectId] = Array.from(filledSet);
  saveFilled(filledMap);          // ← 增量落盘（R3 防丢进度意图）
}
```
失败章（r.ok=false）不再 `add`、不再落盘 → 下轮 `babyloreFillAll` 在 `:463` `if(filledSet.has(ch.id))` 不会跳过，可重试。**R3 P0 升格项已真实落地，无回归。** 注意：本实现未采用 R3 建议的 `markChapterFilled` 原子写，仍用 `filledSet.add + saveFilled`（全量重写），P2-1 据此提出。

### 回归 3：监控盲区是否全清零 —— 记账面清零，但「真实 usage」未全清零
全量 grep `/chat/completions` 的裸 fetch 共 9 处：`lib/llm.ts:139`（ping，排除）、`core/llm/client.ts:144/241`（门面，单点记账）、其余 6 处（fill/outline/plan-chapter/expand/commit/parse）**全部已接 `recordLlmCall`**。
**结论：从「是否调用 recordLlmCall」看，监控盲区已全清零。** 但其中 5 处取真实 `usage`，唯独 import/parse 用 `countTokens` 估算（P1-2），且 6 处均不享受 `client.ts` 的退避重试/故障转移（P1-1）。

---

## ② P0 必修（失败静默吞掉 / 数据或进度丢失，按影响排序）

### P0-1｜import/parse 分块失败被静默丢弃，importTask 仍标 completed（失败静默 + 数据丢失）
- **位置**：`src/app/api/import/parse/route.ts`
  - 失败分块静默跳过：`:295-298` `if (res.error) { send(警告); continue; }` —— 该块角色直接不进 `chars`，**无重试**。
  - 最终 `done` 事件不报失败：`:388-395` 仅报 `extractedCharacters: finalChars` / `meta.characterCount: finalChars.length`，**无 `failedChunks` / `warnings` 字段**。
  - 任务表谎报成功：`:396-398` `if (taskId) void prisma.importTask.update({ data:{ status:"completed", progress:100, result } })` —— 无论多少块失败，`importTask.status` 一律 `completed`。
- **问题**：导入 100 个角色时（≥30 触发分块，`:244/:283-307`），若任一块遇到瞬时 429/5xx/网络超时，`callFlash`（`:152-179`）单发 fetch 无重试直接返回 `{error}`，该块人物被永久丢弃；用户最终看到「✅ 完成 · N 角色」的成功态，DB 里 `importTask.status=completed` 但实际缺角色。属于「失败被静默吞掉 + 进度/数据丢失」家族，比 R3 原 P0 更严重（R3 仅「未记账」，本项叠加「静默丢数据」）。
- **可复现步骤**：
  1. 准备一份 ≥30 个编号角色的导入文本（触发分块，`:244`）。
  2. 在 import 调用中途对某一块返回 429 或断开网络（或在代理层对该 URL 第 2 次请求丢包）。
  3. 观察 SSE：会出现 `⚠️ 第k块失败` 进度，但最终 `done` 事件的 `characterCount` 小于实际角色数，且 `GET /api/import/<taskId>` 返回 `status:"completed"`。
  4. 落库角色数比文本实际角色数少，且无任何错误态可追溯。
- **建议修复**：
  - `callFlash` 增加与 `client.ts:122-217` 同款的退避重试（429/5xx/网络错误重试 3 次，600ms×2^(n-1) 抖动），或改为 `import { completeText } from "@/core/llm/client"` 复用门面。
  - `done` 事件补充 `failedChunks: number` 与 `warnings: string[]`；`:397` 改为「只要有失败块就 `status:"partial"`（或 `failed`）而非一律 `completed`」，让 `importTask` 反映真实结果。
- **影响范围**：所有「AI 解析导入」功能；大批量导入（角色多）丢数据无感知，污染后续角色卡/世界书。

---

## ③ P1 建议（稳定性 / 限流 / 成本准确度）

### P1-1｜6 处手动裸 fetch 全部绕过 client.ts 的退避重试/故障转移（429/超时直接失败）
- **位置**：`src/app/api/import/parse/route.ts:160`、`src/core/babylore/fill.ts:197`、`src/app/api/generate/outline/route.ts:205`、`src/core/pipeline/plan-chapter.ts:103`、`src/app/api/characters/expand/route.ts:59`、`src/app/api/import/commit/route.ts:74`。
- **问题**：R3 给这 6 处补了记账，但**没有把它们迁到 `client.ts` 的 `chat/chatStream`（`:122-217`/`:386` 起）**。门面具备：指数退避重试（429/5xx/网络 TypeError，3 次，`:89-95/:160-167`）+ 故障转移链（`buildChain`，`:104-116`）。这 6 处各自手搓 `fetch`：
  - `fill.ts:195-245` 有 `for(attempt<=3)` 重试但**无退避**（立即连打 3 次，易把 429 打成硬失败）；
  - `import/parse:152-179`、`generate/outline:205-248`、`plan-chapter:103-145`、`characters/expand:59-94`、`import/commit:74-120` **均无重试**。
  结果：瞬时 429/5xx/超时在「大纲生成 / 角色扩写 / 章纲规划 / 导入合并 / 导入解析」上直接失败（部分硬 502、部分静默降级），而走 `completeText` 的路由（storylines/generate、chapter-outline、lorebook 等）却能自愈。**同一项目的 LLM 韧性不一致。**
- **可复现**：在 LLM 代理层对任意上述 URL 注入一次 429，对应功能直接报错/降级；对 `completeText` 路由则自动重试成功。
- **建议修复**：6 处统一改为调用 `completeText(...)`（`src/core/llm/client.ts:511`）或抽取一个「带重试的 fetch 包装」，复用门面的 `isRetryable` + `backoff` + `buildChain`。成本最低且彻底消除「记账有了、韧性没跟上」的剪刀差。
- **影响范围**：大纲、角色扩写、章纲、导入全链路；高峰期/代理抖动时失败率显著高于其他路由。

### P1-2｜import/parse 记账用 countTokens 估算，而非真实 usage（成本看板对最大路径失真）
- **位置**：`src/app/api/import/parse/route.ts:171-173`（用 `countTokens`）；对照 `fill.ts:231-239` / `outline:232-241` / `commit:96-104` 均用 `usage?.prompt_tokens`。
- **问题**：`countTokens`（`src/core/assembly/tokenizer.ts:14-17`）走 `gpt-tokenizer` 的 **cl100k_base**，注释（`:4-6`）假设「DeepSeek tokenizer 与 GPT-4 基本一致」——对**中文**这是系统性偏差（DeepSeek 用独立 BPE，中文切分差异大；小说正文几乎全中文）。import/parse 是单批 `max_tokens:32768`、可多块（`:294`）+ 世界抽取（`:355`）的**最大 token 消耗路径**，却用本地估算值记账，`totalTokens: promptTokens+completionTokens`（`:173`）也是估算求和。成本看板对该路径显示的是「近似开销」而非「真实账单」，削弱了 R3「看清钱花哪」的初衷。
- **可复现**：对比同一段中文导入文本，`countTokens` 返回值与 DeepSeek 账单 `usage.total_tokens` 通常偏差 10%~30%（中文越密偏差越大）；在 `/api/stats/monitor` 看板中 import_parse 项的 token/成本与 Provider 后台对不上。
- **建议修复**：改为与另外 5 处一致，取 `data.usage` 真实值：
  ```ts
  const usage = (data as any)?.usage;
  recordLlmCall({ model: cfg.model, role: "import_parse",
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0, baseURL: cfg.baseURL, projectId });
  ```
- **影响范围**：成本看板 import_parse 分项准确度；预算/告警阈值失真。

### P1-3｜babyloreFillAll 每成功一章执行 fs.writeFileSync 全量重写（O(N²) 阻塞事件循环）
- **位置**：`src/core/babylore/fill.ts:70-73` `saveFilled`（同步 `writeFileSync` + 全量 `JSON.stringify(m,null,2)`），在 `:476-477` **每章成功一次**调用。
- **问题**：`babyloreFillAll` 逐章跑（`:462-479`），每填完一章把**整个 `.runtime/babylore-filled.json`（含所有项目所有已填章）** 同步重写一次。设项目有 N 章，则总写放大为 O(N²) 且每次都是**阻塞事件循环**的同步磁盘 I/O（`writeFileSync`）。大项目（数百章）一键填表会显著拉长单请求耗时、且在 serverless 下逼近 `maxDuration`，期间事件循环被卡，影响同实例其他请求。R3 原本建议用 `markChapterFilled`（`:75-83`，同样是 load→改→save 但语义更清晰），实现未采纳，仍用全量重写。
- **可复现**：在含 ~300 章的项目点「一键填表」，用 `node --cpu-prof` 或日志测 `saveFilled` 累计耗时随章节数二次增长；DevTools/服务端可见每章之间出现同步 I/O 停顿。
- **建议修复**：(a) 改为异步 `fs.promises.writeFile` 且**分批落盘**（如每 10 章一次，或仅在循环结束+异常 finally 各落一次）；(b) 采用 `markChapterFilled` 原子追加并加文件锁/原子 rename，避免 P2-1 的并发覆盖。
- **影响范围**：一键填表（大项目）的性能与可用性；事件循环阻塞波及其他请求。

### P1-4｜import/parse 的 recordLlmCall 不传 projectId（导入成本不可按项目归因）
- **位置**：`src/app/api/import/parse/route.ts:173` `recordLlmCall({...})` 缺 `projectId`；对照 `generate/outline/route.ts:240` 有 `projectId`。
- **问题**：`LlmCallLog` 表有 `projectId` 列（`src/lib/llm.ts:250`），多数路由会带；但 import/parse 在 `callFlash` 内调用时作用域无 `projectId`，导致**导入解析的 token/成本全部记到 `projectId=null`**。成本看板按项目聚合时，导入开销「消失」到「未归属」桶，无法定位哪个项目吃掉了导入预算。
- **可复现**：跑一次导入后查 `llmCallLog` 表，`role="import_parse"` 的行 `projectId` 全为 null；`/api/stats/monitor?projectId=xxx` 看不到该项目的导入成本。
- **建议修复**：把 `projectId` 透传进 `callFlash`（签名加 `projectId`），调用处补 `projectId`。
- **影响范围**：成本看板按项目维度归因失真（导入类）。

---

## ④ P2 优化（非阻断，可并入同批 PR）

### P2-1｜saveFilled 全量重写无锁，并发 fill-all 丢更新（last-writer-wins）
- **位置**：`src/core/babylore/fill.ts:70-73`（全量 `writeFileSync`，无锁/无原子 rename）。
- **问题**：若两个 `babyloreFillAll`（或写章自动填表与一键填表）并发，各自 `loadFilled`→本地改 `filledSet`→`saveFilled` 整文件覆盖，后写者覆盖前写者已标记的章节，造成「已填却未标记」漏填或重复填。R3 已预警，未修。
- **建议修复**：`markChapterFilled`（`:75-83`）改为「读→改→`writeFileSync(tmp); rename(tmp, FILLED_PATH)`」原子替换；或加 `proper-lockfile`。
- **影响范围**：并发填表场景（自动化/多端）标记一致性。

### P2-2｜recordLlmCall 全为 fire-and-forget，长 SSE 未 await，流关闭可能丢记录
- **位置**：`src/lib/llm.ts:245-264`（`void prisma.llmCallLog.create(...).catch()`，不返回 Promise 供 await）；`import/parse:173`、`fill.ts:232` 等均未 `await`。
- **问题**：所有记账都是「发了不等」。在 `import/parse` 这种长 SSE（`:15` `maxDuration=300`，多块多路调用）中，多笔未 await 的 prisma 写与 `controller.close()`（`:404`）并发；若进程在流关闭后被冻结/回收，在途写可能丢弃 → 成本记录丢失。属系统性软风险（client.ts 门面同款），对最长链路最敏感。
- **建议修复**：关键路径（导入/填表）在流关闭前 `await` 收集到的记账 Promise；或把记账改为事务内同步写。
- **影响范围**：极端长任务/高并发下的成本记录完整性。

### P2-3｜记账 role 多为 "assistant"，成本看板无法按功能拆分
- **位置**：`fill.ts:234`、`outline:235`、`plan-chapter:126`、`characters/expand:83`、`import/commit:99` 均 `role:"assistant"`；仅 `import/parse:173` 用 `role:"import_parse"`。
- **问题**：R3 P2 已提「role 全为 assistant 无法按功能拆分」。本轮仅 import/parse 修了对的 role，其余 5 处仍 `"assistant"`。看板只能看总量，不能区分「填表/大纲/扩写/章纲/导入合并」各自花费。
- **建议修复**：分别改为 `babylore_fill / generate_outline / plan_chapter / characters_expand / import_commit`（与 import_parse 并列）。
- **影响范围**：成本看板功能维度分析。

### P2-4｜babyloreFillAll 的 processed 把失败章也计入（语义偏差）
- **位置**：`src/core/babylore/fill.ts:468` `processed++` 在 `if(r.ok)` 之外，失败章也 +1；而 `FillAllResult.processed` 文档（`:38`）写「实际填表章节数」。
- **问题**：返回 `processed` 包含失败尝试，与「实际填表」语义不符，前端展示「已处理 N 章」会虚高。无数据丢失，仅统计口径偏差。
- **建议修复**：`processed` 仅成功时 +1，或新增 `attempted` 字段区分。
- **影响范围**：一键填表结果统计展示。

### P2-5｜import/commit 的 AI 合并无重试（有规则兜底，但缺韧性）
- **位置**：`src/app/api/import/commit/route.ts:73-120` `mergeOneBatch` 单发 fetch，无重试；`:94` `if(!r.ok) return null` → 走 `ruleMergeChar/Lore`（`:467-483/:570-585`）。
- **问题**：虽已有「AI 失败→规则合并」兜底（不丢数据），但一次 429/5xx 就放弃 AI 合并、退化为规则合并，导入质量下降且无提示。与 P1-1 同因，但因有兜底，降为 P2。
- **建议修复**：`mergeOneBatch` 内加与 P1-1 一致的退避重试，减少无谓降级。
- **影响范围**：导入合并质量（非阻断）。

---

## ⑤ 一句话结论
Round 3 两条 P0 修复**均真实落地、无回归**：import/parse 已补记账、babyloreFillAll 失败章已用 `if(r.ok)` 守卫（不再永久标记、可跨轮重试），监控「是否记账」盲区已全清零。但**剪刀差仍在**：R3 只补了「记账」，没补「韧性」与「准确度」——

- **P0-1（新硬伤）**：import/parse 分块失败**静默丢弃且无重试**，且 `importTask.status` 一律标 `completed`（`:397`），大批量导入丢角色无感知 → 失败静默 + 数据丢失。
- **P1**：6 处手动裸 fetch 全部绕过 `client.ts` 的退避重试/故障转移（P1-1）；import/parse 记账用 `countTokens` 估算而非真实 `usage`，成本看板对最大路径失真（P1-2）；babyloreFillAll 每章 `fs.writeFileSync` 全量重写致 O(N²) 阻塞（P1-3）；import/parse 记账漏 `projectId` 不可归因（P1-4）。
- **P2**：saveFilled 无锁并发覆盖、recordLlmCall 全 fire-and-forget 长流可能丢记、role 仍多为 assistant、processed 计入失败章、import/commit AI 合并无重试。

优先级：**先修 P0-1（import/parse 重试 + 任务态如实）**，再让 6 处裸 fetch 复用 `client.ts` 门面（顺手统一真实 `usage` 记账 + 正确 `role` + `projectId`），最后优化 `saveFilled` 原子/异步写。以上全部为纯逻辑改动，无需架构重构。
