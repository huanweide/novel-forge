# Round 6 · L1 只读诊断报告 — 磐石（性能与监控透镜股东）

> 视角：LLM token 计量、失败重试、import 大文件超时、防重复执行、监控盲区。
> 范围：仅只读审查 `src/app/api/import/parse/route.ts`、`src/core/llm/client.ts`，并交叉核对 `src/lib/llm.ts`、`commit/route.ts`、`quick/route.ts`、`[taskId]/route.ts`、`components/editor/ImportWizard.tsx`。
> 结论：未修改任何源码，仅产出本报告。

---

## 一、Round 5 落地修复复验

### 复验 1：`worldFailed` 是否真的影响最终 `importStatus` 与前端提示

**代码闭环（正确 ✓）**
- `parse/route.ts:284` 声明 `let worldFailed = false;`
- `parse/route.ts:371`（B 路 `resB.error`）与 `:380`（B 路 `parseJSON` 失败）置 `worldFailed=true`。
- `parse/route.ts:399-400`：`anyFailed = failedChunks>0 || worldFailed;` → `importStatus = anyFailed ? (failedChunks>=totalChunks && !worldFailed ? 'failed':'partial') : 'completed'`。
- `parse/route.ts:409` 写入 `meta.worldFailed`；`:412` 写入 `importTask.result.worldFailed` 与 `status`。

**结论**：`worldFailed` 确实把 `importStatus` 从 `completed` 拉到至少 `partial`，且数据落库。**闭环逻辑正确**。

**但前端提示缺口（P1）**：`ImportWizard.tsx:364-380` 收到 `type:"done"` 后只 `setResult(event)` 并硬编码 `✅ 完成！提取了 X 个角色，Y 个词条`，从不读取 `event.status` / `event.meta.worldFailed`。全源码检索 `status === 'partial'` 无命中。即：`status=partial`（世界/文风提取失败）对用户仍呈现为「完全成功」，缺失的 lore/style 数据被静默吞掉。修复的「数据正确性」未转化为「用户警示」，**目的未完全达成**。

### 复验 2：`recordLlmCall` 失败计数是否真写入、token=0 是否误报、重试是否重复计费/死循环

**写入（正确 ✓）**：`client.ts:365-385`（`chat`）、`:410-432`（`chatStream`）在每次成功与每次失败/重试尝试都调用 `recordLlmCall`，底层 `lib/llm.ts:245` 为 `prisma.llmCallLog.create`（fire-and-forget，`.catch` 静默），确实落库。

**token=0 不会误报**：失败尝试多为 401/429/5xx/网络错，provider 通常不计费，`token=0` 准确；且用 `fail:` 前缀（`client.ts:78,379,426`）区分，成本看板可辨别「真 0 token 成功」与「失败尝试」。

**重试不会死循环**：`chat()` 循环 `for target of chain` × `while attempt<DEFAULT_RETRIES(3)`（`client.ts:75,359-391`），有界；不会重复计费——内部只记最终成功那次的真实 token，失败尝试记 0。

**复验小结**：两处修复逻辑均正确；唯一落地缺口＝`worldFailed` 未触达前端提示（见 P1-2）。

---

## 二、新坑（按严重度）

### P0
无绝对 P0（无数据破坏性死循环、无必崩路径）。

### P1

**P1-1 · import/parse `callFlash` 无超时且无重试（挂死风险）**
- 文件:行号：`src/app/api/import/parse/route.ts:160-164`（fetch 无 `signal`），`:152` 函数整体无 `AbortController`。
- 现象：上游 LLM 挂起时 `fetch` 永不 resolve，SSE 永久卡住，只能等平台 `maxDuration=300` 强杀；且此路径**完全绕过已加固的 `client.ts`**（那里有 300s 超时 + 3 重试 + 故障转移）。可靠性与一致性双输。
- 建议：删除自建 `callFlash`，统一走 `createLLMClient().chat()`；或至少加 `AbortSignal.timeout` + 限时重试。

**P1-2 · 前端不消费 `status`/`worldFailed`，partial 仍显示「✅ 完成」**
- 文件:行号：`src/components/editor/ImportWizard.tsx:364-380`（done 分支）。
- 现象：见复验 1。世界/文风提取失败时用户无感知，导入数据静默不全。
- 建议：`event.status==='partial'` 时渲染「⚠️ 部分提取失败」横幅并展示 `meta.worldFailed`/`failedChunks`；`status==='failed'` 阻断进入预览。

**P1-3 · 分块触发只看编号行数，不看文本长度/token**
- 文件:行号：`src/app/api/import/parse/route.ts:238-244`（`estimatedCount>CHUNK_SIZE(30)` 才分块）。
- 现象：大段未编号长文（如 200k 字散文）`estimatedCount<30` → 走单路全量发送 → 超模型上下文 → A 路失败、整篇角色丢失。
- 建议：分块阈值改为「token/字数预算」而非编号行数；超限即强制分块。

**P1-4 · commit 并发提交无幂等锁 → 重复写入**
- 文件:行号：`src/app/api/import/commit/route.ts:443`（char `Promise.all`）、`:552`（lore `Promise.all`）；去重仅 `seenCharNames`/`seenLoreTitles`（`:374,508`）为单次请求内存态。
- 现象：两个并发 commit（双击/重试）各自 `findMany` existing 后 `createMany` → 重复角色/词条入库；合并分支 `findFirst`+`update` 也非事务，存在竞态。
- 建议：按 `projectId` 加提交锁（DB 行锁/`$executeRaw` advisory lock）或整段包事务 + 唯一约束兜底。

**P1-5 · `LLM_REQUEST_TIMEOUT_MS=300s` × 重试远超路由预算**
- 文件:行号：`src/core/llm/client.ts:16`（`300_000`）；`:361,389` 重试；路由 `maxDuration=300`（`parse/route.ts:15`、`commit/route.ts:15`）。
- 现象：单次 `chat()` 最坏 300s×3×(1+N 备模型)；一旦上游慢/限流，重试风暴使路由在返回前被平台强杀，导入/合并中断且可能被前端判为失败。
- 建议：单尝试超时下调（如 60–90s），并对单次 `chat()` 设总预算上限；路由侧加「已用时间」早退。

### P2

- **P2-1 监控盲区（parse 错误分支不记账）**：`parse/route.ts:167`（`!res.ok` 直接 return 前未 `recordLlmCall`）、`:176`（`catch` 网络异常也未记）。仅成功/短内容路径记账 → HTTP/网络错误漏记。建议错误分支补 `recordLlmCall({role:'fail:import_parse',...})`。
- **P2-2 projectId 缺失无法归属**：`parse/route.ts:173` 与 `commit/route.ts:97-104` 的 `recordLlmCall` 均未传 `projectId`，成本看板不能按项目分摊。
- **P2-3 token 计量口径不一致**：parse 用本地 `countTokens()` 近似（`:171-172`），client/commit 用 provider `usage` → 看板数字跨路由不可比，估算成本失真。
- **P2-4 `isCharOnly` 禁用分块**：`parse/route.ts:286`（`needsChunking && !isCharOnly`）→ 大文本「仅人物」模式仍单路全量，易超上下文（与 P1-3 同源）。
- **P2-5 `importStatus='failed'` 边界轻微误标**：`parse/route.ts:400` 条件 `failedChunks>=totalChunks && !worldFailed`——角色全失败 + 世界也失败时得 `partial` 而非 `failed`。
- **P2-6 流式中内存驻留**：`parse/route.ts` 全程持有 `text` 并累积 `chars`/`lore`，超大稿本内存压力（低风险，受 300s 约束）。
- **澄清（非问题）**：`recordLlmCall` 为无共享可变状态的纯函数 + 独立 `prisma.create`，并行请求（commit 的 `Promise.all`）不会造成 token 计数错乱。

---

## 三、Top 问题速览

| 严重度 | 位置 | 问题 |
|---|---|---|
| P1 | parse/route.ts:160-164 | callFlash 无超时无重试，绕过 client.ts，上游挂死 |
| P1 | ImportWizard.tsx:364-380 | 不读 status/worldFailed，partial 仍显示「✅ 完成」 |
| P1 | commit/route.ts:443,552 | 并发 commit 无幂等锁，重复写库 |
| P1 | parse/route.ts:244 | 分块只看编号行数，大长文单路超上下文 |
