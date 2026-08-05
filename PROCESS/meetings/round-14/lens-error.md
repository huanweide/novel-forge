# Round-14 深度审计 · 透镜：异常处理与错误边界

- 审计对象：`novel-forge`（Next.js 16 + React 19 + Prisma 7 + PostgreSQL 17），工作副本 `C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`，HEAD=v1.0.2（918c7d7）
- 审计角色：异常处理与错误边界透镜（只读）
- 审计方式：逐文件读源码 + 历史 `_integration.md` 复验，未运行测试/未改动代码

---

## 一、摘要

整体结论：**错误处理成熟度较高，未发现 P0/P1 级「必崩/必丢数据」类问题**。

- 全部 **99 个** API `route.ts` 均含 `catch` 块，未发现裸异常逃逸导致默认 500 的路由。
- 两处数据库写入事务（`import/commit`、`projects/import`）均正确使用 `prisma.$transaction` + 显式 `timeout`，失败自动回滚，且 `projects/import` 额外处理了 P2002 并发幂等，无孤儿数据残留风险。
- LLM 客户端具备重试 / 故障转移 / 超时 / 限流降级（`DEFAULT_RETRIES=3`、`isRetryable`、`backoffDelay`、`AbortSignal.timeout`、`AbortSignal.any`），故障降级路径完备。
- 文件导入/解析（`.nfproject` 备份还原、markdown 导入）均有清晰错误分支、partial 降级、JSON 修复、超时重试、deadline 兜底；前端 `ImportDialog`/`BackupDialog` 有 `try/catch` + toast + 错误回显。
- 前端存在 `error.tsx` 与 `global-error.tsx` 两层错误边界。
- 历史闭环复核：IMP-013（导出文件名中文乱码，默认 markdown/txt 分支漏修）在 round-1 复验曾被标「假收敛」，当前代码 `export/route.ts:166` 已补齐 `filename*=UTF-8''...`，**已真正闭环**。

发现的待修项均为 **P2（错误分类/语义一致性，非崩溃）**，外加若干观察池项。诚实边界：以下 P2 不影响功能正确性，仅影响错误状态码准确性与排障友好度。

---

## 二、逐条发现

### 发现 1（P2）· `classifyError` 的「网络」分类分支实际失效（死分支）
- **证据**：
  - `src/core/llm/client.ts:178-182`：`attemptChat` 捕获网络异常后 `return { ok:false, fatal:false, error: new Error("无法连接 AI 服务：...") }` —— 把原始 `TypeError` **包成普通 `Error`**。
  - `src/lib/api-error.ts:86-93`：`classifyError` 的网络识别依赖 `err instanceof TypeError && /fetch|network|.../`。由于上游已被包成普通 `Error`，该分支在 LLM 网络故障路径上**永远不会命中**。
- **触发条件**：AI 服务不可达 / 网络中断时，异常经 `chat()` 抛出 → 路由 `jsonError(e)` → 落入 `classifyError` 默认分支（`api-error.ts:96-101`），返回 **`status:500, code:INTERNAL` + 通用 hint**，而非预期的 `502 NETWORK`。
- **影响**：错误状态码不准（应为 502）、丢失 `NETWORK` hint。但 `error` 文案本身为中文可读（"无法连接 AI 服务..."），**降级正确、不崩溃**，故定为 P2。
- **修复建议**：在 `client.ts` 抛出时保留 `name:"AbortError"`/自定义标记，或在 `classifyError` 中按消息正则（已含 `fetch|network|Failed to fetch|ENOTFOUND|ECONNREFUSED`）**先匹配消息再判断 instanceof**，使网络分支可达。

### 发现 2（P2）· 两套 `jsonError` 并存，3 个路由丢失 `classifyError` 的分类与 hint
- **证据**：
  - `src/lib/api.ts:17-20`：`jsonError(message: string, status=500, code?)` —— 仅透传字符串与状态码，**无分类、无 hint**。
  - `src/lib/api-error.ts:105-111`：`jsonError(e: unknown)` —— 调用 `classifyError`，输出 `{error, code, hint}` 且自动映射 Prisma/网络/LLM。
  - 使用 `@/lib/api` 版的路由：`src/app/api/projects/[id]/config/route.ts:25,80`（DB 故障走 `jsonError(err instanceof Error ? err.message : "...", 500)`）、`src/app/api/seed/presets/route.ts:36`。
  - 例外已确认正确：`src/app/api/presets/[id]/apply/route.ts` 同时 `import` 两套，但分别用于「字符串校验报错（422）」与「兜底异常分类（285 行 `jsonError(e)`）」，**用法正确，非混用 bug**。
- **触发条件**：上述 2 个路由若遇 Prisma 连接/建表错误，返回**裸 500 + 原始 Prisma message + 无 hint**；若改用 `@/lib/api-error` 版则可得到 503 + 中文可读 hint。
- **影响**：仅 DB 异常时的 UX/排障降级，非崩溃。P2（代码一致性/分类完整性）。
- **修复建议**：统一收敛到 `@/lib/api-error` 的 `jsonError(e)`；若需手动状态码，提供 `jsonError(e, overrideStatus?)` 重载以保留分类与 hint。

### 发现 3（P2 / 观察）· 前端个别 fetch 不检查 `res.ok`，非 2xx 错误 JSON 被当成正常数据吸收
- **证据**：
  - `src/components/CommandPalette.tsx:84-85`：`const res = await fetch(.../api/projects/${id}); const p = await res.json();` —— 未判 `res.ok`，若 404/500 返回合法错误 JSON，`p` 即错误对象并继续当作项目数据使用。
  - `src/components/workspace/RelationshipGraph.tsx:203-208`：同理 `fetch("/api/agent/analyze-relationships")` 后直接 `res.json()` 使用，未判 `res.ok`。
- **说明**：两处均在 `try/catch` 内（CommandPalette:83/96、RelationshipGraph:202/214），因此**不会崩溃**；但若接口返回 2xx 之外的错误 JSON，错误不会被显式提示，仅静默走后续逻辑。
- **触发条件**：对应接口返回 4xx/5xx 且 body 为 JSON 时。
- **影响**：局部逻辑可能误用错误体，UI 表现不如预期，但无未捕获崩溃。P2/观察（其余 155 处前端 fetch 多已判 `res.ok`）。

---

## 三、历史复核（IMP-013 等）

按任务要求核对 `PROCESS/meetings/round-1~4` 的 `_integration.md` 与 `recheck-io.md`：

- **round-1~4 `_integration.md` 现状**：仓库中仅存在 `round-1/_integration.md` 与 `agent-confirm-round-1/_integration.md`；`round-2/3/4/5` 的 `_integration.md` **不存在**（目录存在但无该文件）。后续轮次（round-6~12）有 `_integration.md`。即"前几轮 round-2~5 的 _integration.md"在本仓库无法读取，无法据此核对；以下仅就可查的 round-1 材料复核。
- **IMP-013（导出文件名中文乱码，缺 `filename*=`）**：
  - round-1 `_integration.md:102` 曾标「✅ 已修复（第一批）」，但 `recheck-io.md:15,50,110` 复验判定为**假收敛**——仅修了 `export/route.ts:90/104/117`（html/epub/docx 三非默认分支），**漏掉默认 markdown/txt 分支（当时 :166）**，真机 curl 抓头证实默认导出头无 `filename*=`。
  - **当前代码核验**：`src/app/api/projects/[id]/export/route.ts` 现四处（html:90 / epub:104 / docx:117 / markdown·txt:166）**均含** `filename*=UTF-8''${encodeURIComponent(filename)}`，默认分支已与另三处一致 → **IMP-013 已真正闭环**（recheck 提出的"默认路径漏修"已修复）。
  - 残留建议（recheck 提出、本轮未核实是否已补）：导出路径（content-disposition、slugify 锚点）**零自动化测试守卫**，仅靠 `npm test` 门禁无法拦截回归。属观察项，非本轮必须。
- **IMP-014 / IMP-015 / IMP-026（同批复核对象）**：recheck 报告称 IMP-014 有"新坑（forceNew 同名无编号）"、IMP-015 复核无需改、IMP-026 真修复；当前 `projects/import/route.ts:51-58,83-85` 已实现 `forceNew` 副本名加「（副本）」并去重既有后缀（`replace(/(（副本）|（导入）)+$/g,"")`），IMP-014 的相关补丁看起来已落地。IMP-015/026 不在本轮错误边界透镜主责范围，未深入。

---

## 四、观察池（不建议立即改，记录备查）

1. **SSE 解析失败静默忽略**：`src/core/llm/client.ts:364` `readStream` 中对单行 JSON 解析失败的 `catch {}` 静默吞掉。正常 SSE 仅传 JSON 行，影响极小；但若上游流中途损坏，可能静默丢 token 且无提示。建议至少 `console.warn` 一次。
2. **成本/任务记账 fire-and-forget 静默丢弃**：`src/lib/llm.ts:282`（`recordLlmCall` 的 `.catch(()=>{})`）、`src/app/api/import/parse/route.ts:281/531/537`（`importTask.update(...).catch(()=>{})`）。设计取舍（不阻塞主流程），代价是 DB 不可用时成本看板/任务状态静默丢失，不影响业务正确性。
3. **`projects/import` 与 `parse` 路由 catch 返回裸 `err.message`**：`src/app/api/projects/import/route.ts:262` 与 import/parse 内部 SSE 错误事件均直接透传 `err.message`，**未走 `classifyError`**。可读性尚可，但缺统一分类/hint（与发现 2 同源，统一收敛后可一并解决）。
4. **`getSettings` 对 DB 错误的吞并与降级**：`src/lib/llm.ts:104-108` 仅当错误 message 含 "LLM" 才向上抛，其余（含 Prisma 连接错误）被静默吞并回退到环境变量配置。属有意的"DB 不可用时降级到 env"设计，但意味着 DB 配置类错误的可见度依赖最终 env 配置是否齐全。

---

## 五、结语（回报）

未发现 P0/P1 级必须修的崩溃或数据损坏问题；发现 **2 个 P2 级**错误分类/一致性问题（网络状态码误判为 500、两套 `jsonError` 致 2 个路由丢失分类与 hint）及若干观察项。历史 IMP-013 已核实真正闭环。
