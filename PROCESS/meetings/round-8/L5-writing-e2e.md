# 透镜 L5 写章流程端到端审计（round-8 / v1.6.9）

审计员角色：只读深度审计员（MaxLoop Overlord round-8）
审计基线：已发布 v1.6.9（commit `fc5a662`，与 origin/main 一致）
审计日期：2026-08-07
透镜范围：写章流程端到端（write / refine / continue 路由 → orchestrator → pipeline 后处理 → 状态机 → 导入），聚焦长文截断、流式中断恢复、token 估算/超限、重试重复、并发写、状态机一致性、导入校验、上下文拼接超长。
铁律遵守：全程只读，未修改任何源码；所有发现均带 `file:line` 真实证据；无法验证处标注「未验证」。

---

## 一、审计方法与范围

**方法**
1. 逐行阅读三条生成路由：`src/app/api/generate/write/route.ts`、`continue/route.ts`、`refine/route.ts`（v1.6.9 全文）。
2. 追踪编排与模型调用：`src/core/agents/orchestrator.ts`（`writeSection`）、`src/core/llm/client.ts`（流式/重试/截断）、`src/core/assembly/engine.ts`（上下文预算拼接）。
3. 追踪后处理与状态落库：`src/core/pipeline/post-processor.ts`（快照/覆盖/状态）、`src/core/story-status.ts`（状态机枚举）。
4. 追踪导入落库：`src/app/api/import/commit/route.ts`。
5. 全局证据检索：`grep` `finish_reason` / `maxTokensPerRequest` / `targetWordCount` / `AbortSignal` / `request.signal`，确认截断检测、signal 透传、令牌上限的真实实现状态。
6. 未执行 `tsc` / `vitest` 全量（由 Chair 统一跑）；仅做轻量静态证据核对。

**范围边界（明确不在本透镜深挖）**
- 前端 `streamSSE` 消费逻辑、UI 展示（仅引用 `page.tsx:690/825` 作为 signal 来源侧旁证）。
- 伏笔 detect、审校 D 模型、摘要质量本身（属其他透镜）。
- 数据库迁移/schema 物理结构（仅按代码中的 Prisma 调用推断）。

---

## 二、发现清单

| ID | 严重度 | file:line | 问题描述 | 证据 / 复现 | 修复建议 |
|----|--------|-----------|----------|-------------|----------|
| **L5-01** | **P0** | `src/core/llm/client.ts:533`<br>`src/core/agents/orchestrator.ts:229`<br>`src/app/api/generate/write/route.ts:190`<br>`continue/route.ts:191`<br>`refine/route.ts:146`<br>`src/core/llm/client.ts:300-380` | **长文硬截断且无任何截断检测**：`maxTokensPerRequest` 固定默认 `4096`（`client.ts:533`），与 `targetWordCount`（默认 3000、可设更高，如 6000）完全脱钩。模型被要求「目标字数约 N」，但输出被硬卡在 ~4096 token。流式 `readStream` 全程不读取 `finish_reason`（仅 `client.ts:209` 非流式路径检查了 `content_filter`），所有路由既无 `finish_reason==='length'` 检测，也无「实际字数 ≈ 目标字数」校验。结果：目标 >~4000 中文字的章节在 max_tokens 处被静默截断，正文残缺却被当作正常结果进入**待确认（drafting）**状态，用户极易误确认发布残章。写/续从空节点起步时 `prevContent` 为空 → 后处理不存版本快照 → **残缺章无恢复点**。 | 复现：设 `targetWordCount=6000` 点写章 → 跑到 ~4096 token 即停，章节不完整但进待确认。证据：`client.ts:533` 默认 `4096`；`writeSection` 用 `this.config.maxTokensPerRequest`（orchestrator:229）；`readStream` 的 `data.choices?.[0]?.finish_reason` 从未被读取/透传；三路由均无长度比对。changelog-data.ts:6658 显示「输出截断检测——检查 finish_reason==='length'」仍只是**未实现的 TODO**。 | ①`max_tokens` 按 `targetWordCount` 动态计算（如 `min(modelCtx, max(4096, targetWordCount*1.6))`）；②流式透传 `finish_reason`，路由检测到 `'length'` 时标记截断、回滚该节点并提示用户重试；③生成后比对实际字数 vs 目标，不足阈值则降级为「草稿未完成」并告警，而非静默进待确认。 |
| **L5-02** | **P1** | `src/app/api/generate/refine/route.ts:145-178`<br>`src/core/pipeline/post-processor.ts:167-177` | **refine 截断会覆盖原完整正文（可经版本快照恢复，但线上态损坏）**：refine 生成期间循环仅累积 `newContent`，**无定期落盘**（对比 write 每 300 字存草稿）。若模型在 max_tokens 处截断，`newContent` 为非空但残缺，进入 `runPostGenerationPipeline` 以 `content=newContent` 覆盖 `currentNode.content`。空守卫（refine:172）只拦「全空」，漏掉「截断但非空」。虽 `post-processor.ts:167` 先 `snapshotRevision` 存了上一版完整正文（可恢复），但线上节点内容立即变为残缺，导出/阅读看到残章，用户可能确认。 | 证据：refine 循环（145-157）无 `prisma.storyNode.update`；空守卫仅 `!newContent \|\| newContent.trim().length===0`（172）；pipeline 第 3 步 `content` 直接覆盖（post-processor:199-202）；同一处 `prevContent` 快照（167）。 | ①refine 也接入 L5-01 的流式截断检测，截断时回滚到原 `content`；②或 refine 生成期间定期存草稿，截断时丢弃新残片保留原稿。 |
| **L5-03** | **P1** | `src/app/api/generate/continue/route.ts:67-85`<br>`continue/route.ts:174-228`<br>`write/route.ts:176-179` | **continue 中断/503 留下孤儿 drafting 节点且无法恢复**：`continue` 每次都 `storyNode.create` 新节点（74）。若 SSE 中断或 DeepSeek 网关偶发 503 发生在生成中途，新节点停在 `status:"drafting"` + `content` 含 `[PARTIAL_DRAFT]`。`continue` 路由**永远新建下一个节点**，不提供「恢复本次草稿」入口；write 路由的 `[PARTIAL_DRAFT]` 恢复逻辑（write:176）只对「用户点该节点的 write」触发，而 continue 生成的节点用户通常继续点 continue。多次重试 503 会**堆积多个残缺 drafting 孤儿节点**，污染章节树与导出。 | 证据：continue 始终 `create` 新节点（67-85）；生成循环无「恢复已有 drafting 节点」分支；write 的 resume 由 `data.currentNode.status===STATUS_DRAFTING` 触发（write:177），但 continue 产物用户不会去点 write。 | ①continue 起点前检测当前 project 是否存在「本会话新建的 drafting 且含 [PARTIAL_DRAFT]」节点并复用/清理；②SSE 中断时删除该孤儿节点（与 L5-04 配合）。 |
| **L5-04** | **P1** | `src/app/api/generate/write/route.ts:157`<br>`refine/route.ts:132`<br>`continue/route.ts:174`<br>`src/core/llm/client.ts:438-489`<br>`orchestrator.ts:187-239` | **客户端断连未中止服务端生成，浪费 token 且（continue）留孤儿**：三条路由的 `ReadableStream` 均**未把 `request.signal` 传入 LLM 流**。`writeSection` 调用不传 signal，`chatStream` 的 `request.signal` 参数始终为 undefined。前端在 `page.tsx:825` 虽传了 `signal: controller.signal` 给 fetch，但 route 内部没有把该 signal 衔接到 LLM 调用。断连后服务端仍持续消费模型流、每 300 字写 `[PARTIAL_DRAFT]`，浪费 token 并在（continue）路径留下孤儿节点。 | 证据：write/refine/continue 的 `orchestrator.writeSection(...)` 调用（write:190 / refine:146 / continue:191）均未传 signal；`writeSection` 签名（orchestrator:187）无 signal 参数；`chatStream`（client.ts:438）的 `request.signal` 仅由 `AbortSignal.any` 与超时合并（client.ts:266），route 未提供。`page.tsx:825` 仅证明前端侧有 signal。 | route 内将 `request.signal` 透传至 `writeSection` → `chatStream` 的 `request.signal`；断连即 `AbortSignal` 中止 fetch，停止生成与落盘。 |
| **L5-05** | **P2** | `src/app/api/generate/write/route.ts:45,241`<br>（无锁） | **同一 nodeId 并发写无互斥**：两个并发写请求（双点击 / 双标签页 / 网络自动重试）会各自 `loadGenerationContext`（45）读到同一 status，并行生成并每 300 字互相 `update` 覆盖 `content`，最后写胜出但中途内容可能交错污染；`[PARTIAL_DRAFT]` 恢复基于请求开始时的快照，并发下易错乱。round-7 仅给 `continue` 的 order 加了 `$transaction` 行锁（continue:67），write 路径未加任何锁。 | 证据：write route 生成段未用 `$transaction`/`FOR UPDATE`；continue 已用事务锁（67-68）；write 的 save 为裸 `prisma.storyNode.update`（241）。单用户产品但浏览器重试/重复提交可触发。 | 写前对该 `nodeId` 加行锁或幂等键（如 `SELECT ... FOR UPDATE` 或 ImportCommitLock 同款唯一约束思路），并发第二次直接拒绝或排队。 |
| **L5-06** | **P2** | `src/app/api/import/commit/route.ts:590-598`<br>（441、521） | **导入章节缺 content schema 校验，单章畸形致全事务回滚**：commit 仅跳过缺 `name`/`title` 的条目（441、521），未校验 `ch.content` 的存在性与类型。若某章节 `content` 为 `undefined`/数字/对象，`tx.storyNode.create` 的 `content: ch.content`（595）触发 Prisma 类型/必填错误，整条 120s 事务回滚，全部导入失败且只返回笼统错误。无 zod/运行时 schema 校验。 | 证据：route 无字段 schema 校验；`content: ch.content` 直接写入（595）；事务包裹（572）；错误被泛化为 `code:"FIELD"`（736）但已整体回滚。 | 导入前对每个 chapter 做字段校验（content 必须为非空字符串；缺失/类型错误则跳过该章并告警），逐章容错而非整体回滚。 |
| **L5-07** | **P2** | `src/core/assembly/engine.ts:181-184`<br>`src/core/agents/orchestrator.ts:683-1247` | **修仙/玄幻体裁 systemPrompt 被静默截断**：该体裁的「白金修仙模拟引擎」systemPrompt 体积极大（orchestrator 内数万字）。`buildSystemSection` 用 `truncateByTokens(systemPrompt, budget.allocations.systemPrompt)` 截断，预算 = `8% × contextWindowSize` ≈ 5243 token（65536 上下文）。超出部分被静默丢弃，大量写作铁律/格式规则在该体裁下不生效。属上下文预算透镜但由写章路径触发，移交 Chair。 | 证据：`engine.ts:181` `truncateByTokens(systemPrompt, maxTokens)`，maxTokens=5243；orchestrator 体系统 prompt 远超此量级（683-1247 行）。 | 体裁引擎拆分「常驻精简版 + 按需注入」，或提升 systemPrompt 预算占比 / 对体裁路径使用独立大上下文模型。 |

---

## 三、已确认无问题的区域（诚实边界）

- **重试导致重复正文**：`chatStream` 仅在「建立流」阶段重试（`client.ts:448`），一旦进入 token 流即不再重试（`client.ts:450` 注释明确），故无「半路重试产生重复正文」风险。摘要步骤独立 3 次重试（`post-processor.ts:529`）只重跑 summarize，不重生成正文。round-7 的 write 空响应回滚守卫有效。✓
- **空响应守卫（round-7 已修）**：write（write:279）、continue（continue:219）、refine（refine:172）均已实现空响应前置回滚，不会进入后处理产生孤儿摘要/实体。✓
- **导入事务原子性 + 幂等**：commit 整体 `$transaction` + `ImportCommitLock` 唯一约束 + 陈旧锁清理（continue:348-362），并发提交被 409 拦截，失败整体回滚。✓
- **上下文超窗拼接**：`assemblePrompt` 各区块均有 `truncateByTokens` / 预算折叠（短/中/长期记忆、伏笔、故事线），长书上下文拼接不会超出 `contextWindowSize`（见 engine.ts 各 `buildXxxSection`）；远楼层有 AI 压缩摘要兜底。✓（但系统提示自身被截断见 L5-07）
- **状态机枚举统一定义**：`src/core/story-status.ts` 提供单一真相源 `STORY_NODE_STATUSES`，核心链路引用常量而非字面量，降低状态字符串拼写漂移。✓
- **版本快照兜底（写/续/润覆盖前）**：`post-processor.ts:167` 在覆盖前 `snapshotRevision`，使 refine 截断等可经版本历史恢复（见 L5-02  mitigating）。✓

---

## 四、需 Chair 关注的跨透镜风险（可选）

1. **L5-01（截断检测缺失）是基础设施级缺口**：实现需在 `client.ts` 流式协议透传 `finish_reason`，并改造三条路由的收尾判定。属「流式协议 / 模型调用」透镜与「写章」透镜交界，建议 Chair 统筹排期，单透镜无法闭环。
2. **L5-04（断连不中止生成）与成本/性能透镜强相关**：每次 SSE 异常断连都白白消耗 DeepSeek token（网关偶发 503 时尤甚），既是健壮性也是成本问题，建议与「网关 503 重试 / token 成本」透镜合并评估。
3. **L5-07（体裁 systemPrompt 截断）属上下文预算透镜**：建议移交负责 memory/context 预算的透镜深挖（是否所有大 systemPrompt 都受影响，而非仅修仙体裁）。
4. **孤儿节点累积（L5-03）影响下游导出/统计**：残缺 `drafting` 节点进入章节树后，导出、字数统计、伏笔 detect 全量重算都会带上它，可能污染跨章一致性判断，需与「数据一致性」透镜对齐清理策略。

---

## 五、结论摘要（一句话回传用）

L5 透镜共发现 **P0×1 / P1×3 / P2×3**。最严重：**L5-01**（max_tokens 固定 4096 与 targetWordCount 脱钩 + 流式无 finish_reason 截断检测，长章被静默截断并进入待确认，写/续从空节点起步无版本快照可恢复）。
