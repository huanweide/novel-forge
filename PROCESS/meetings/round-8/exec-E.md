# 路E 执行报告（L5 写章流程端到端）

执行人：代码执行 Agent（路E：L5 写章端到端）
基线：v1.6.9（commit fc5a662）
日期：2026-08-07

## 改动清单（独占文件 6 处）

### 1. `src/core/llm/client.ts`
- **`LLMRequest` 接口**：新增 `targetWordCount?: number` 字段（L5-01）。
- **`resolveMaxTokens`**：改为动态推算——若 `request.targetWordCount > 0`，则
  `target = min(ctxLimit, max(4096, ceil(twc*1.6)))`，`ctxLimit = floor(contextWindowSize*0.8)`；
  否则回退 `requested ?? fallback`。推理模型最低预算保护（N1）仍优先（L5-01）。
- **`attemptChat` / `establishStream`**：调用 `resolveMaxTokens` 时透传 `targetWordCount` 与 `contextWindowSize`（L5-01）。
- **`readStream`**：解析 SSE `data.choices[0].finish_reason` 并记忆，在两段 `done` 产出（含 `[DONE]` 早返回与兜底）中携带 `finishReason` 字段；生成器类型增加 `finishReason?: string`（L5-01 流式透传）。

对应 ID：**L5-01**（动态 maxTokens + finish_reason 透传）。

### 2. `src/core/agents/orchestrator.ts`
- **`writeSection`**：签名新增 `signal?: AbortSignal` 参数（第 8 位，可选）；将 `targetWordCount` 与 `signal` 透传到 `client.chatStream({...})` 的 `targetWordCount` 与 `request.signal`（L5-01 / L5-04）。
- 返回类型补充 `finishReason?: string`。

对应 ID：**L5-01 / L5-04**。

### 3. `src/app/api/generate/write/route.ts`
- **L1-005**：删除重复的 `prisma.project.findUnique(...llmConfig)`，改复用 `loadGenerationContext` 已加载的 `(data.project as any).llmConfig`（该查询本就加载完整 project）。
- **L5-04**：`orchestrator.writeSection(...)` 第 8 个实参传入 `request.signal`，断连即中止生成与落盘。
- **L5-01 收尾截断保护**：流式循环捕获 `finishReason`（新增 `chunk.type === "done"` 分支）；空响应守卫之后新增——若 `finishReason === "length"`，将节点状态置回 `STATUS_DRAFTING`（保留已落盘的 partial draft，含 `[PARTIAL_DRAFT]`），发送 `done`（`status: drafting, truncated: true` + 告警），**不进入后处理/待确认**，用户可「继续生成」从断点恢复。

对应 ID：**L5-01 / L5-04 / L1-005**。

### 4. `src/app/api/generate/refine/route.ts`
- **L1-005**：删除重复 `prisma.project.findUnique(...llmConfig, postProcessingRules)`，改复用 `data.project.llmConfig` / `data.project.postProcessingRules`。
- **L5-04**：`writeSection(...)` 传入 `request.signal`。
- **L5-02 截断保护**：捕获 `finishReason`；若 `=== 'length'`，**跳过后处理管线**，保留线上原完整正文（post-processor 已在覆盖前 `snapshotRevision` 存上一版完整正文，可经版本历史恢复），发送 `done`（`truncated: true` + 告警），不把残片覆盖线上节点。

对应 ID：**L5-02 / L5-04 / L1-005**。

### 5. `src/app/api/generate/continue/route.ts`
- **L5-03 孤儿清理**：建节点前，删除「本 project 中 `order === 当前最大 order` 且 `status:'drafting'` 且 `content` 含 `[PARTIAL_DRAFT]`」的尾部孤儿节点——仅命中尾部，避免误删用户正在撰写的中部草稿；防止每次失败都新建节点导致残缺节点堆积。
- **L5-04**：`writeSection(...)` 传入 `request.signal`。
- **L5-03 + L5-04 断连删除**：`start` 的 `catch` 中，若 `request.signal?.aborted`（客户端断连/中止），删除本次新建的 `nextNode` 孤儿 drafting 节点，避免 SSE 中断/503 残留残缺节点污染章节树。

对应 ID：**L5-03 / L5-04**。

### 6. `src/app/api/import/commit/route.ts`
- **L5-06 逐章容错**：事务前对 `chapters` 做内容校验——`typeof content !== 'string' || 空串` 的畸形章（undefined/数字/对象/空）跳过并收集 `chapterWarnings`；事务内改用 `validChapters`（卷节点循环、章节循环、`sourceChapterCount`、总纲 `first` 取数均同步切换）。`done` 返回新增 `warnings` 字段与汇总提示。单章畸形不再触发整 120s 事务回滚。

对应 ID：**L5-06**。

## 设计说明 / 取舍（透明报备，非阻塞）
- **L5-01 截断判定阈值**：采用 `finishReason === 'length'` 作为唯一硬门槛（可靠信号）。未另设「实际字数 < 目标阈值即阻断进待确认」的独立硬门槛，以免对模型自然偏短完成（无 length 截断）产生误判；字数比较仅用于在已截断时决定告警措辞（是否「明显不足」）。因 `resolveMaxTokens` 已按 `1.6×target` 放大预算，模型在正常情况拥有充足空间，靠 `length` 即可准确识别硬截断。
- **L5-03 选用「清理」而非「复用」**：复用可能导致把用户正在中部撰写（低 order）的 drafting 草稿误当成续写目标并覆盖；故采用「清理尾部孤儿」+「本次新建节点在断连时删除」双保险，既消除堆积又不误伤。

## 是否需汇报
否（全部 6 条 ID 已落地，无阻塞问题；上述取舍为设计透明说明，不阻断）。
