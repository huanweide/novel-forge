# Round-7 复检报告：IO 导出导入 + 生成链路子系统

- 复检对象：novel-forge v1.6.7（commit `a68be8a`）
- 复检范围：`export` / `import`（含 `.nfproject` 还原 + 文本导入 `parse/commit`）/ `generate/{continue,pre-write-cards,refine,write}` / `core/pipeline/{context-loader,post-processor}`
- 复检原则：每条发现均基于亲自读到的代码，给出 `文件:行号` + 证据 + 复现路径；**未做推断、未编造**。本报告只做体检，未改动任何源码。

## 术语速查（首次出现加注）

- **SSE（Server-Sent Events）**：服务端向浏览器单向流式推送事件的机制，每个事件形如 `data: {...}` 文本帧；生成类接口用它实时吐正文。
- **ChapterSummary（章节摘要表）**：每章生成后由 LLM 产出的章节摘要，存 `chapterSummary` 表，供后续章节作为“前文上下文”注入 prompt。
- **STATUS_OUTLINE_ONLY**：节点“仅存了大纲、尚未生成正文”的状态（区别于 `drafting` / `completed`），是 write 路由对“模型空响应”的回滚态。
- **TOCTOU（Time-of-check to time-of-use）**：先读后写之间的竞态窗口——两条并发请求都读到同一旧值，再各自写，导致重复。
- **幂等去重**：同一导入操作重复执行只生效一次。

---

## 摘要

共挖到 **8 条**可复现问题，分级分布：

- **P0（数据错误/崩溃）：0 条**
- **P1（功能退化/明显错）：4 条** —— F1、F2、F3、F4
- **P2（边角/体验）：4 条** —— F5、F6、F7、F8

> 说明：P0 为 0，并非“系统完美”，而是本轮聚焦的 5 个方向上没有发现会直接崩溃或造成不可逆数据丢失的缺陷（refine 空白章有版本快照可恢复，见 F3）。但 P1 中有 3 条是“模型偶发空响应”这一代码自身已承认的真实场景，且 continue/refine 完全缺失 write 已有的空响应守卫，属明确功能退化。

---

## 坑位表

### F1 ｜ P1 ｜ write 路由的空响应回滚（STATUS_OUTLINE_ONLY）不清理后处理管线已写入的孤儿记录
- **文件:行**：`src/app/api/generate/write/route.ts:292`（先跑管线）、`src/core/pipeline/post-processor.ts:562`（无条件建摘要）、`src/app/api/generate/write/route.ts:313-327`（后跑空响应守卫）
- **现象**：当模型返回空正文时，write 路由会把节点回滚成 `STATUS_OUTLINE_ONLY` + `content:""`，但**后处理管线已经在回滚之前跑完**，期间生成的 `ChapterSummary`（以及可能的 `PendingCommitment`/实体、`autoConfirm`、`triggerForeshadowDetect`）不会被撤销，留下与“已回滚节点”不一致的孤儿数据。
- **证据**：
  - 空响应守卫在 `runPostGenerationPipeline(...)`（line 292）**之后**才执行（line 313: `if (!fullContent || fullContent.trim().length === 0)`）。
  - 管线内 `if (!skipSummarize)` 分支**无条件** `await prisma.chapterSummary.create(...)`（post-processor.ts:562），即使 `summary` 为空也会落一条 `chapterId = nodeId` 的空/垃圾摘要。
  - write 路由的回滚只改 `storyNode`（line 317-320），**没有删除**该 `ChapterSummary`。
  - 下游污染：`context-loader.ts:222-228` 的摘要过滤 `order <= currentOrder` 会把这条空/垃圾摘要当作“前文上下文”注入未来章节的 prompt（其 `chapterId` 的 order 必然 ≤ 后续章）。
- **复现路径**：让 write 接口的 LLM 返回空串（或网关抖动返回空）→ 观察 DB：`storyNode` 状态变 `outline_only` 但 `chapterSummary` 表里多了一条 `chapterId=该节点` 的空摘要；再续写下一章时，prompt 上下文里混入这条空摘要。
- **建议修复**：空响应守卫应**前置**到管线之前（或在守卫分支内 `deleteMany` 掉本次 `chapterSummary`/`storyBeat` 等管线副作用）；或在 `post-processor.ts` 中，当 `content` 为空时跳过摘要/实体写入（上行 `skipSummarize` 同理）。

### F2 ｜ P1 ｜ continue 路由完全缺失“空响应守卫”，空正文被标记 completed 污染导出
- **文件:行**：`src/app/api/generate/continue/route.ts:173-274`（SSE 主流程）、对比 `write/route.ts:312-327`（write 有守卫）
- **现象**：continue 路由在流式生成结束后**没有任何“正文为空”校验**。若 LLM 成功返回但正文为空（无 `error` 帧，只是 0 个 token），节点会被建为 `status:"completed"` + 空 `content`，并在导出时渲染成“（此节暂无内容）”的“已完成空章”。
- **证据**：
  - continue 的流循环只对 `chunk.type === "error"` 做提前返回（line 202-206）；空正文（无 token、无 error）会正常走完循环。
  - 之后 `runPostGenerationPipeline`（line 230）把空内容写库、建空摘要；最终 `send({ type:"done", ... status: result?.status || "completed" })`（line 268-274）把节点报成“已完成”。
  - 全文件检索确认 continue 路由**不存在** `fullContent`/空响应判断（write 路由有，continue 没有）。
- **复现路径**：对某一节点触发“一键续写”，使模型返回空 → 前端收到 `done` 且 `status:"completed"`；该节点在正文列表/导出里显示为已完成的空节。
- **建议修复**：在 continue 流末尾（建摘要之后、`done` 之前）补与 write 同款的空响应守卫：空则把新节点回滚为 `outline_only` 并清理本次摘要，回报 `error` 帧而非 `done`。

### F3 ｜ P1 ｜ refine 路由缺失空响应守卫，空响应会把已存在章节正文“清空”
- **文件:行**：`src/app/api/generate/refine/route.ts:175-191`（跑管线）、`src/core/pipeline/post-processor.ts:199-219`（step 3 直接覆盖 content）
- **现象**：refine（微调/重写）在模型返回空正文时，后处理管线 step 3 会把节点 `content` 写成空串，等于**把原有章节正文抹掉**，同时 `done` 仍回报 `status:"completed"`。
- **证据**：
  - refine 把 `content: newContent`（line 177）传给管线；`newContent` 为空时，post-processor step 3 执行 `prisma.storyNode.update({ data: { content, ... } })`（line 199-219），`content` 即为空串。
  - refine 路由同样**没有**空响应守卫；`done` 在 line 226-231 回报 `status:"completed"`。
  - 可恢复性：step 3 前 `snapshotRevision`（line 169）仅在 `prevContent` 存在时把旧正文存入版本历史，故原文可经版本快照找回，但**线上节点已被清空**，属功能性数据退化。
- **复现路径**：对已有正文的章节触发 refine，让模型返回空 → 该章 `content` 变空、`status` 仍 `completed`；用户需手动从历史版本恢复。
- **建议修复**：与 write/continue 一致，在 refine 跑管线前/后做空响应守卫；空响应时**不要**用空串覆盖 `content`（保持原正文或回滚为 `drafting`），并回报 `error`。

### F4 ｜ P1 ｜ continue 续写章号采用 max+1 读后写，并发下会产生重复 order
- **文件:行**：`src/app/api/generate/continue/route.ts:49-53`（聚合 max 后 +1 再 create）、`prisma/schema.prisma:142`（`order Int @default(0)`，无 `@unique`，仅有 `@@index([projectId])`）
- **现象**：continue 用 `aggregate({ _max: { order } })` 读到当前最大 order，再 `+1` 作为新节点 order。这是典型的 **TOCTOU**：两条并发 continue 请求会读到同一旧 max，从而**创建出两个 order 相同**的节点，破坏“order 即序列位次”不变量（代码注释称“实时聚合，并发更安全”，但实际并未加锁/事务/唯一约束）。
- **证据**：
  - `const nextOrder = (orderAgg._max.order ?? 0) + 1;`（line 53）与紧随其后的 `prisma.storyNode.create({ data: { order: nextOrder } })`（line 68-78）是两次独立 DB 操作，中间无事务包裹、无乐观锁。
  - schema 确认 `order` 字段**无 `@unique`**（grep `prisma/schema.prisma`：仅有 `order Int @default(0)` 与 `@@index([projectId])`、`@@index([parentId])` 等索引，无唯一约束），故并发插入重复 order 不会被数据库拒绝。
  - 后果：`context-loader.ts` 的 `order <= currentOrder` 时间线过滤、`isLatestChapter` 判定（`order === max`）、以及导出排序 `order asc, createdAt asc` 都会因重复 order 出现歧义/双“最新章”。
- **复现路径**：对同一个项目、同一 currentNode **几乎同时**发两条 continue 请求（或用脚本并发调用）→ 查 `storyNode` 表可见两条 `order` 相同的新节点。
- **建议修复**：用单条事务 + `select ... for update`（Postgres）或在 `(projectId, order)` 上加唯一约束并捕获 P2002 重试；或采用“插入占位并 `update` 自增”的原子写法，杜绝读后写竞态。

### F5 ｜ P2 ｜ 文本导入 `import/commit` 未做结构化错误细分（与 `.nfproject` 还原路径不一致）
- **文件:行**：`src/app/api/import/commit/route.ts:705-707`（仅 `send({type:"error", message})`）；对照 `src/app/api/projects/import/route.ts:296-335`（已细分 TIMEOUT/P2002/P2003/FIELD/UNKNOWN）
- **现象**：用户任务要求确认“import 错误是否真结构化细分”。实际导入小说正文的主路径是 `parse → commit`，而 `commit` 路由在事务失败（超时/P2002/P2003/字段缺失等）时只回一个**通用 `error` 消息**，没有像 `.nfproject` 还原路径那样给出 `code: TIMEOUT|UNIQUE|FK|FIELD` 的结构化分类，前端无法据此做精准提示。
- **证据**：`commit` 路由整段 `$transaction`（line 571-690，`timeout:120000`）的异常只在 `catch (err) { send({ type:"error", message: err instanceof Error ? err.message : "导入失败" }) }`（line 705-707）兜底，无 code 分类；而 `projects/import/route.ts` 的 catch 明确做了 `kind` 细分（line 316-330）。
- **复现路径**：构造一个会让 `commit` 事务失败的场景（如超大导入触发 120s 超时、或外键/唯一约束冲突）→ 前端收到的只是 `{type:"error", message:"..."}`，拿不到 `code`。
- **建议修复**：把 `projects/import/route.ts` 的错误分类逻辑抽成共享 helper，在 `commit` 的 `catch` 里复用，统一返回 `code` 字段。

### F6 ｜ P2 ｜ `.nfproject` 还原路由错误分类仍有未覆盖类型（连接类/记录不存在/请求体非法）
- **文件:行**：`src/app/api/projects/import/route.ts:34`（JSON 解析在 try 内）、`:316-330`（分类分支）
- **现象**：该路由虽有分类，但存在两类未覆盖/不当覆盖：
  1. **请求体非法 JSON**：`await request.json()` 在 `try` 块内（line 34），解析失败抛 `SyntaxError` 被外层 catch 接住，走 500 + `kind:"UNKNOWN"`，本应 400。
  2. **连接类错误（P1000–P1019）、记录不存在（P2025）、空值约束（P2011）、值过长（P2000）等** 均不匹配现有正则/`prismaCode` 分支 → 落入 `kind:"UNKNOWN"`，虽然 `detail=rawMsg` 会被返回（**不静默吞掉**），但前端无法区分，属分类盲区。
- **证据**：分类分支仅命中 `TIMEOUT` 正则、`P2002`、`P2003`、字段缺失正则，其余 `kind` 保持默认 `"UNKNOWN"`（line 316）。
- **复现路径**：导入时制造 DB 连接抖动（P1001）→ 返回 `{success:false, code:"UNKNOWN", error:"..."}`；传入非法 JSON → 返回 500 而非 400。
- **建议修复**：补 `P100x` 连接类、`P2025/P2011/P2000` 等分支；把 `request.json()` 移到独立 `try`（解析失败直接 400）。

### F7 ｜ P2 ｜ export 对不支持的 format 静默降级为纯文本，未返回 400
- **文件:行**：`src/app/api/projects/[id]/export/route.ts:21`（默认 markdown）、`:107-144`（显式处理 html/epub/docx）、`:146-185`（其余走 markdown/txt 分支）
- **现象**：`format` 仅 `markdown|txt|html|epub|docx` 有语义；传入如 `format=pdf`/`rtf` 等未定义值时，代码不会报错，而是落入 `else` 分支按纯文本生成（line 171-179），文件名后缀却按 `format==="markdown"?"md":"txt"` 取（line 185）→ 一个 `pdf` 请求会得到 `.txt` 文件、Content-Type 为 `text/plain`。属“静默猜格式”而非明确拒绝。
- **证据**：分支结构在 line 107/120/134/146 用 `if (format === "...")` 显式判断，无 `else if (非法) return 400` 收口；line 185 的三元只区分 markdown/txt。
- **复现路径**：`GET /api/projects/<id>/export?format=pdf` → 下载到名为 `<项目>_日期.txt` 的纯文本，而非预期报错。
- **建议修复**：在 line 21 之后加白名单校验：`if (!["markdown","txt","html","epub","docx"].includes(format)) return 400`。

### F8 ｜ P2 ｜ 后处理管线摘要 3 次连败后仍写入空 ChapterSummary，空壳不清理
- **文件:行**：`src/core/pipeline/post-processor.ts:529-559`（最多 3 次重试）、`:562-576`（无条件 `chapterSummary.create`）、`:617`（命名段因 `titleBase` 空而安全跳过）
- **现象**：任务关注“摘要连败是否真安全跳过、空壳是否真清理”。实测：摘要 3 次全空/异常后 `summarized` 仍为 `false`、`summary` 为空，但代码**仍会** `chapterSummary.create`（line 562，未判断 `summarized`），写入一条 `summary:""` 的空壳记录；命名段因 `titleBase` 为空被安全跳过（line 617，正确），但空壳摘要本身**未被清理**，会参与下游 `classifyAndConvert`（line 656）与后续章上下文注入。
- **证据**：line 562 的 `create` 在 `for` 重试循环之外、无条件执行；连败时 `summary`/`keyEvents` 等全为空默认值。
- **复现路径**：让 summarizeChapter 连续 3 次返回空/抛错 → DB 出现 `chapterId=该节点`、`summary:""` 的 `chapterSummary` 行。
- **建议修复**：连败时跳过 `chapterSummary.create`（或写入带标记 `empty:true` 的记录并显式清理），避免空壳进入上下文与分类流程。

---

## 已确认无问题（诚实边界）

以下为本次重点排查方向中**经通读确认无真实 bug** 的子系统，列出以免误判：

1. **导出空范围守卫（选中非根节点、子树无正文）**：`export/route.ts:63-68`（级联展开后 0 节点 → 400）与 `:74-79`（展开后无任何 `content` → 400）均已正确拦截，**不会**静默产出空白文件。整库导出也在 `:41-43` 对 0 节点返回 400。✅
2. **context-loader 窗口度量与无界拉取退化**：`allNodesLight` 只 `select` 结构字段、不拉 `content`（context-loader.ts:37-51）；正文仅在 `keepWindow`/`MAX_CHAPTER_WINDOW=60` 限定的 `prevIds` 内按需补拉（`:195-214`）。**10~20MB 无界拉取退化确已消除**。✅
3. **context-loader (B) 章/节窗口与 extractPrevContext 对齐**：`extractPrevContext` 过滤 `type==="chapter"||"section"`、`prevCount=5`（outline-context.ts:187-190），与 context-loader 的 `CHAPTER_SECTION` 集合（context-loader.ts:123）及默认 `keepWindow=max(keepChapters,5)`（:116-117）口径一致；多卷感知（:158-198）在超大卷（>60 章）时由 `MAX_CHAPTER_WINDOW` 安全截断，属设计取舍而非 bug。✅
4. **continue 单请求下 order 单调性**：非并发时 `max(order)+1` 严格递增、不会跳号/重复（F4 仅针对并发竞态）。✅
5. **import `.nfproject` 还原的事务回滚与幂等**：`$transaction` 包裹（projects/import/route.ts:65-285），失败自动 rollback 不留孤儿；`importSource` 唯一键 + 事务内查重 + P2002 兜底（:68-74、:296-309）使重复导入返回 `idempotent:true`，无成倍复制。✅
6. **pre-write-cards 路由**：纯只读查询 + 角色调度打分，无写入/导出副作用，未发现边界问题。✅

---

## 附：复检未覆盖 / 需另行 Round 的范围（透明声明）

- 未运行实际 DB/LLM 联调，以上均基于静态通读 + 代码路径推演；P1 的“空响应”复现依赖可构造的空返回模型，属代码已注释承认的真实场景（write/route.ts:312）。
- `src/app/api/import/parse/route.ts`（543 行）、`quick/route.ts`（383 行）、`[taskId]/route.ts` 仅做了规模与入口确认，未逐行深读；若需对“文本导入解析”做同样深度的 round-8，建议单独立项。
- `babylore/loop.ts`、`fill.ts` 等填表闭环路径本次未逐行体检，其 `storyNode.findMany` 不在 write/refine/continue 的“上下文装载”主链路，未计入无界拉取回归评估。
