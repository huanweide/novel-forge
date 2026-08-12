# 流程透镜报告 · round-17 · 核心流程与 API 质量

- **透镜职责**：体检核心写章 / 确认 / 一致性流程的真实质量，以及前端调用的 API 是否存在断链（只读诊断，未修改任何源码）。
- **Round**：round-17
- **日期**：2026-08-12
- **项目**：novel-forge（AI 长篇小说写作平台）· 绝对路径 `C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- **技术栈**：Next.js 16 + React 19 + TypeScript + Tailwind v4 + Prisma 7 + PostgreSQL(Neon) + Zustand

---

## 一、门禁结果（附录·运行证据）

| 门禁 | 命令 | 结果 |
|------|------|------|
| TypeScript 类型检查 | `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` | **0 错误**（通过，耗时 ~6s） |
| 单元测试 | `npm test`（vitest run） | **59 文件 / 513 用例全过，0 失败**（耗时 ~4.5s） |
| API 断链静态巡检 | `node scripts/audit-api-refs.cjs` | **TOTAL_REFS 120, REAL_BROKEN_LINKS 0**；IGNORED_TEMPLATE_INTERPOLATION 1, TEMPLATE_NORMALIZED_AND_CHECKED 95, IGNORED_DOC_STRINGS 1 |

> 注：API 巡检验证的是「前端 `/api/...` 静态引用 → 后端真实路由存在」的**存在性**。**它不验证运行期 origin 匹配、参数/响应形态、以及服务端自调用的可达性**。本透镜在第三、四节发现了存在性之外、运行期才暴露的断链与静默失败。

---

## 二、已确认健康（v2.0.x 新功能与一致性模块）

经实际阅读代码，以下模块**未发现静默失败，设计完整**，给本轮以正面结论：

- **一致性抽取 / 冲突检测**（`src/core/consistency/extractFacts.ts`、`detectConflicts.ts`、`factValidation.ts`、`suggestFix.ts`）：`parseFactsFromLLM` / `parseConflictsFromLLM` 均对 code fence、前后废话、JSON 解析失败做了容错（失败返回空而非抛错）；`extractConsistencyFacts` 幂等（先清 `source != "manual"` 再插，保留作者手填基线）；`detectConsistencyConflicts` 按 `nodeId` 幂等删除 open 再写。基线与冲突只标红不自动改写，符合「创作主权归作者」。✅
- **摘要大修 / timelineDigest / storylineDigest**（`src/core/pipeline/digest.ts`、`digest-aggregate.ts`）：v2.0.4 改为聚合各章 `node.outline`（不再依赖易脏的 ChapterSummary）；`isGarbageSummary` 与 `buildTimelineDigest` 共用 `MIN_SUMMARY_LEN` 阈值一致性修复；纯函数式聚合 + 模板元应答残片过滤，无 LLM 幻觉。✅
- **Prompt 版本化 GlobalPromptRevision**（`src/core/sync-global-prompt.ts`、`src/app/api/projects/[id]/prompt-revisions/route.ts`、`.../rollback/route.ts`）：`recordGlobalPromptRevision` 与 sync 解耦、fire-and-forget、失败仅 log 不阻塞；回滚路由写回 `globalPrompt` 并以 `source="rollback"` 落新版本快照（git-revert 语义）、正确回写 `currentPromptVersion`。无静默失败。✅
- **自动确认护栏**（`src/core/confirm-guard.ts`）：`evaluateConfirmEligibility` 对空/过短/机械重复/NaN 分数均有拦截；`applyConfirm` 有 willTransition 幂等前置 + `updateMany` 状态过滤，并发/重复确认安全。✅
- **确认路由状态机**（`src/app/api/story/nodes/[id]/route.ts`）：`confirm` 严格只接受 `PENDING_CONFIRM`（line 182），`submit/reject/reopen` 各有状态守卫；软删 `#123` 防复活贯穿 GET/PUT/PATCH/DELETE；乐观锁（editVersion）冲突降级 409。✅

---

## 三、发现清单

### [F1] P1 · 续写路由缺失 max_tokens 截断处理，被截断的正文被当作「completed」静默交付
- **文件:行号**：`src/app/api/generate/continue/route.ts:238-263`（只处理 `chunk.type==="token" | "error"`，未消费 `chunk.type==="done"` 的 `finishReason`）；对照 `src/core/write-generation.ts:309-379`（write 路径已处理 `finishReason === "length"`）。
- **现象描述**：续写（`generate/continue`）的流式循环丢弃了终止分片里的 `finishReason`。当模型在 `max_tokens` 处被硬截断（`finish_reason==="length"`）时，continue 路由不会像 write 路径那样保留 `drafting` + `truncated` 告警，而是让 `fullContent`（残缺）一路进入正则后处理 → `runPostGenerationPipeline` → 无条件的 `safeFillAfterWriting` → 最终以 `status:"completed"` 发出 `done`。
- **根因推测**：写章与续写两条入口**重复实现了整段流式逻辑却未共享截断保护**。write 路径在 `post-processor` 之前单独拦截 `length`，continue 路径完全遗漏该分支。结果是「同一类生成失败，两种结局」。
- **建议修法**：把 write 路径的截断保护抽成共享 helper（如 `finalizeGeneration({finishReason, content, ...})`），两条路由都调用；检测到 `finishReason === "length"` 时回退为 `STATUS_DRAFTING` + `truncated:true` 告警，**禁止**进入后续处理与填表/确认流程。同时补一条针对 continue 截断的单测。

### [F2] P1 · 写章 vs 续写的「确认门」状态机不一致：续写绕过确认门槛直接填表
- **文件:行号**：`src/core/write-generation.ts:416-418`（注释明确「自动填表已移至确认通过后才触发，生成仅落库（status=completed），待 AI 智能体逐章确认后才回填表格」）；`src/app/api/generate/continue/route.ts:328`（在 `runPostGenerationPipeline` 之后**无条件** `await safeFillAfterWriting({... source:"continue"})`）。
- **现象描述**：write 路径下，未确认的章节（DRAFTING/completed）**不会**触发下游记忆/设定库回填（仅在手动 confirm 或 auto-confirm 时才填）。但 continue 路径在生成一结束就无条件填表——未审视的草稿立即污染世界书/角色卡/伏笔等下游结构。更严重：若项目开启 `autoConfirmEnabled`，post-processor 内 `applyConfirm`（line 244）已填一次，continue 的 line 328 又填一次 → **双重触发/重复落表风险**（取决于 `safeFillAfterWriting` 幂等边界）。
- **根因推测**：续写是「一键自动完成」的便捷入口，但把「生成即填表」写死，违背了 write 路径确立的「填表是 confirm 副作用」单一真相原则，导致两个生成入口对「确认门槛」行为不一致。
- **建议修法**：续写路径与 write 对齐——填表只发生在确认（手动 confirm 或 auto-confirm）时；删除 line 328 的无条件 `safeFillAfterWriting`，改由 `applyConfirm`（已被管线/确认复用）统一负责。若确需续写后自动收口，也应显式以「确认态」为前置，而非绕过。

### [F3] P2 · 流式草稿落库竞态，`[PARTIAL_DRAFT]` 标记可能泄漏进最终正文
- **文件:行号**：`src/core/write-generation.ts:293-307` 与 `src/app/api/generate/continue/route.ts:252-256`（草稿保存为 `prisma.storyNode.update({ data:{ content: draft + "\n\n[PARTIAL_DRAFT]", status:"drafting" }})`，**fire-and-forget 未 await**）；对照 `src/core/pipeline/post-processor.ts:203-225`（clean `content` 的正式落库为 `await`）。
- **现象描述**：流式过程中每隔 ~300 字发起的草稿保存是未 await 的 fire-and-forget；而正式 clean 落库（post-processor line 203，写 `content` 不带标记）是 await 的。二者对同一条 `storyNode` 的更新顺序由连接池调度决定，不确定。若某个 fire-and-forget 草稿保存在 clean 落库**之后**才执行，最终库内 `content` 会变成 `clean正文 + "\n\n[PARTIAL_DRAFT]"`，该字面串直接展示给用户章节正文。
- **根因推测**：草稿保存与正式保存两条写入路径没有串行化/互斥，依赖「先发起的一般先完成」的隐含假设，在 Prisma 连接池与高负载下不成立。
- **建议修法**：成功路径只由 `postPostGenerationPipeline` 单次 `await` 落库 clean 内容；流式期间的草稿仅作为「客户端断连/崩溃」的兜底（保留 marker），且在正式落库成功后应丢弃/覆盖该 marker（例如用事务或对 marker 做末端清除）。最低成本修复：把流式草稿保存改为「仅当尚未开始正式落库时才允许写」，或在 done 路径显式 `UPDATE ... SET content = REPLACE(content,'\n\n[PARTIAL_DRAFT]','')`。

### [F4] P2 · 服务端自调用（伏笔检测/故事线生成）origin 硬编码回退 localhost:3001，部署耦合且静态审计无法发现
- **文件:行号**：`src/core/confirm-guard.ts:222`（`const origin = args.origin || process.env.APP_ORIGIN || "http://localhost:3001"`）；`src/app/api/storylines/[id]/route.ts:92`（同款 `process.env.APP_ORIGIN || "http://localhost:3001"`）；`.env` 未设置 `APP_ORIGIN`。
- **现象描述**：`audit-api-refs.cjs` 报 0 断链（路由存在），但运行期：auto-confirm / 摘要落库后由 post-processor 触发的 `void triggerForeshadowDetect({ projectId })`（无 origin）会 `fetch("http://localhost:3001/api/foreshadowing/detect")`。一旦应用**不在 localhost:3001**（容器、反向代理、沙箱、非 3001 端口）运行，该自调用连接拒绝/超时（5s 超时 + 1 次重试后 `console.error` 静默失败），伏笔收束率面板不会随自动确认/生成自动更新。
- **根因推测**：架构不一致——post-processor 里其余生成后副作用（`rebuildProjectDigest`、`writeStorylineProgress`、`extractConsistencyFacts`、`detectConsistencyConflicts`，见 `post-processor.ts:583/593/753/757`）都是**进程内直接函数调用**，唯独伏笔检测走 **HTTP 自回环**，于是成为唯一暴露在 origin/部署耦合下的断点。
- **建议修法**：将 `triggerForeshadowDetect` 改为与 digest/抽取一致的**进程内直接函数调用**（引入 `detectPayoffs(projectId)` 并直接 await，保留超时/重试/错误日志），彻底消除 HTTP 自回环与 origin 假设；若必须保留 HTTP 自调，应始终从 `request.url.origin` 或标准转发头透传 origin，并在 `.env`/部署清单强制 `APP_ORIGIN`。同理修复 `storylines/[id]/route.ts:92` 的自调用。

---

## 四、核心流程待修项优先级（按 风险 × 收益）

| 优先级 | 编号 | 项 | 风险 | 收益 | 建议动作 |
|--------|------|----|------|------|----------|
| **1** | F1 | 续写截断未拦截，残缺章当 completed 交付 | 高（静默错误交付 + 污染下游） | 高（抽共享 helper 同时修 write/continue，且可单测） | 抽 `finalizeGeneration` 共享截断保护，补 continue 单测 |
| **2** | F2 | 续写绕过确认门槛直接填表（状态机不一致） | 高（未审视草稿污染世界书/角色卡） | 中高（删除 line 328，复用 applyConfirm 单一真相） | 对齐 write 的「确认才填表」原则 |
| **3** | F4 | 服务端自调用 origin 硬编码，部署期死链 | 中（仅非 localhost:3001 部署触发，且 fire-and-forget） | 中（改为进程内直调，消除唯一 HTTP 自回环） | 伏笔检测改直调，删 origin 假设 |
| **4** | F3 | `[PARTIAL_DRAFT]` 标记竞态泄漏进正文 | 低-中（概率低但可见、数据损坏） | 中（串行化/末端清除 marker） | 成功路径统一单次 await 落库 |

> 总体结论：类型与单测门禁全绿、API 静态链路 0 断链、v2.0.x 新功能（prompt 版本化 / 摘要大修 / 一致性）完整无静默失败；但**两条生成入口（write / continue）行为不一致**是本轮最值得修的系统性问题（F1+F2 同源），建议优先收敛到同一套「生成→（截断保护）→确认门→填表」流程。
