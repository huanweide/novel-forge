# Round 14 只读深度审计 · 性能与资源泄漏透镜（工坊）

> 角色：性能与资源泄漏透镜
> 方法：严格只读源码分析（`src/` + `PROCESS/meetings` 历史轮次），**未修改任何源码**。
> 工作副本：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`，HEAD=v1.0.2（commit 918c7d7）。
> 聚焦：N+1 查询 / 全局缓存无限增长 / 大文件大输入 OOM / 前端 useEffect·setInterval·事件监听泄漏。

---

## 摘要

本轮对「性能与资源泄漏」专项深挖，结论分三块：

1. **前几轮修复的泄漏护栏已生效**：round-2 的 `monitorCache` 512 上限 + 删最旧已落地（`stats/monitor/route.ts:17,23,32-35`）；`chat-sessions.ts` 的会话 Map 有 20 条上限 + 30 分钟过期 + 5 分钟清理，受控。**服务端已无已知的无限增长缓存。**
2. **发现与 round-2 同类的两处「模块级 Map 无限增长」漏洞（浏览器侧）**：`entity-highlighter.ts` 的 `cache` 与 `lastGoodMap` 均无容量上限、无淘汰；`useApi.ts` 的 `listeners` Map 在 Set 变空后不删除 key（空 Set 永久残留）。二者与 round-2 修复的 `monitorCache` 是同一反模式，但发生在前端模块，影响半径较小（单 tab、按 projectId 累积）。
3. **发现 per-request 内存放大与重查询（非持久泄漏，但属性能隐患）**：`context-loader.ts` 生成时 `findMany` 全量章节不投影 `content`、`monitor` 面板每次拉取全节点 `reviewLogs`。导入已有 `createMany` 分批(100) + LLM 分块护栏，OOM 风险受控。

**严重度总览**：P0 = 0 条；P1 = 0 条；P2 = 4 条（F1~F4）；观察池 = 3 条。未发现服务端 P0/P1 级必须立即修的泄漏，但 F1 与 round-2 修复的反模式完全一致，建议一并闭环。

---

## 逐条发现

### F1 — P2（最关键）：`entity-highlighter.ts` 两个模块级缓存 Map 无上限、无淘汰（与 round-2 同类反模式）

- **证据**：
  - `src/core/entity-highlighter.ts:100` `const cache = new Map<string, { map: ...; ts: number }>();`（仅 60s TTL，但 TTL 只用于**读取命中判断**，`getEntityMap` 成功路径 `:139` `cache.set`、降级路径 `:148` `cache.set`，**从未删除过期条目**；`invalidateEntityCache` `:154` 仅删单个 key）。
  - `src/core/entity-highlighter.ts:104` `const lastGoodMap = new Map<string, Map<...>>();`——**无任何 TTL、无任何删除逻辑**，仅在 `:140` `lastGoodMap.set(projectId, map)` 写入，永不淘汰。
- **影响场景**：`getEntityMap` 是浏览器端（`fetch('/api/entities/highlight...')`，`:119`）实体高亮数据获取入口，被 MarkdownViewer / CenterPanel / ChapterEntitiesPanel 等多处调用。每访问一个不同 `projectId`，就在 `cache` 与 `lastGoodMap` 各留一份「该项目全部实体名→高亮映射」的 Map。长期在同一 tab 切换多项目、或项目数持续增长时，这两个模块级 Map **随项目数无限增长**，且 `lastGoodMap` 永不回收（持有整份实体 Map 引用）。这是与 round-2 `monitorCache`（服务端、随项目数无限增长已修为 P0）**完全同构**的反模式，只是发生在前端。
- **严重度**：P2。浏览器单 tab 上下文，重开即清，爆炸半径小于服务端；但属于「已修过的同类坑却未统一治理」，且 `lastGoodMap` 无任何兜底，建议参照 `monitorCache` 加容量上限（如 256）+ 定期/命中时淘汰，**与 round-2 一并闭环**最划算。
- **修复方案（只读不实施，供参考）**：给两 Map 加 `MAX_SIZE` 与 LRU/超时淘汰；`lastGoodMap` 至少随 `invalidateEntityCache` 一并删除，或引入与 `cache` 相同的 TTL 清理。

### F2 — P2：`useApi.ts` 的 `listeners` Map 空 Set 永久残留 + `cache` 无上限（前端）

- **证据**：
  - `src/hooks/useApi.ts:16` `const listeners = new Map<string, Set<() => void>>();`
  - `useQuery` 卸载清理仅 `:88` `listeners.get(key)?.delete(load)` 删除函数，**但 `key → 空 Set` 条目从不删除**（`listeners` Map 里每个曾用过的 query key 都留下一个空 Set）。
  - `:15` `const cache = new Map<string, Entry>();` 同样**无容量上限**（`invalidateQuery` 仅删指定 key，从不按大小/时间淘汰）。
- **影响场景**：`useApi` 是 FE-9 试点的 mini React-Query，被新页面使用。长期运行的应用中，每产生一个 distinct query key（如 `projects`、`characters:xxx`、`monitor:xxx`），`listeners` 与 `cache` 就各留一条，随交互累积。单 tab 内增长，重开即清；属于轻量泄漏。
- **严重度**：P2（前端，轻量）。与 F1 同源，建议加容量上限或引用计数式删除空 Set。

### F3 — P2：`context-loader.ts` 生成时 `findMany` 全量章节且不投影 `content`（per-request 内存放大）

- **证据**：
  - `src/core/pipeline/context-loader.ts:34-37` `prisma.storyNode.findMany({ where: { projectId }, orderBy: { order: "asc" } })`——**未加 `select`**，因此把每个节点的全部列（含 `content` 整章正文）全部取出；随后 `allNodes` 被原样返回（`:116`）。
  - 该函数被 `write / refine / continue` 三个生成路由在每次生成前调用（`Promise.all` 一次性拉 11 张表）。
- **影响场景**：写第 N 章时，把**整本书所有章节的正文全文**都载入 Node 进程内存，再经由 `GenerationData` 传给提示词拼装。长篇小说（百章 × 数万字中文）会在单次生成请求内产生显著内存峰值与 DB→应用的大体积传输；而 `allNodes` 的 `content` 实际仅当前章生成需要，绝大多数被白白载入。属于 per-request 放大（请求结束可 GC，**非持久泄漏**），但在低内存容器/超大项目下有 OOM 风险，且浪费带宽。
- **严重度**：P2（性能 + 潜在 OOM，非持续泄漏）。建议对 `allNodes` 查询加 `select` 排除 `content`（或仅当前章取 content、其余仅取元数据/order/title/status）。
- **补充**：`monitor/route.ts:49-53` 的 `findMany` 也类似地 `select` 了 `reviewLogs: true`（见 F4）。

### F4 — P2：`monitor/route.ts` 每次请求全量拉取节点 `reviewLogs`（重查询未纳入缓存）

- **证据**：
  - `src/app/api/stats/monitor/route.ts:49-57` `prisma.storyNode.findMany({ ..., select: { ..., reviewLogs: true } })`——对**每个节点**把其全部 `reviewLogs`（审阅日志，无分页/条数限制）一并选出。
  - 该查询与 `summaries/beats/commitments` 计数属于**基础数据**（`Promise.all` 第一批），只有后续 LLM 聚合部分（`:117-180`）被 30s `monitorCache` 命中跳过；基础查询**每次调用都重跑**。
- **影响场景**：监测面板（`/api/stats/monitor`）在切章（带 `nodeId`）或轮询刷新时高频调用。项目节点多、每节点审阅日志多时，每次都要 `findMany` 全节点 + 全 `reviewLogs`，属未缓存的重查询。性能隐患，非内存泄漏。
- **严重度**：P2（性能）。建议：`reviewLogs` 改为按需（面板实际只用了节点状态/字数，审阅日志未参与返回字段），去掉该 `select` 或限制条数；并对基础聚合结果也做短 TTL 缓存（与 LLM 部分一致）。

---

## 历史复核

### round-2（monitorCache 泄漏修复）— 通过 ✅
- 修复已落地：`src/app/api/stats/monitor/route.ts:17` `MONITOR_CACHE_MAX_SIZE = 512`；`:23` 声明；`:32-35` `setCachedMonitor` 内 `size > 512` 时删最旧 key（`monitorCache.keys().next()` 为插入顺序首元素 = 最旧）。与描述一致，**服务端缓存泄漏已闭环**。

### 其他全局缓存复核（round-2 之后是否还有同类）— 部分未治理 ⚠️
- `chat-sessions.ts:28-31,90-99`：会话 Map 受控——`MAX_MESSAGES=20` 截断 + `MAX_AGE_MS=30min` + 每 5 分钟清理 `setInterval`。**已受控，非泄漏**（仅 dev HMR 可能重复注册 timer，见观察池 O1）。
- `entity-highlighter.ts:100,104`：**未受控**（F1）。与 round-2 修复的 `monitorCache` 同反模式，但未一并治理。
- `useApi.ts:15,16`：**未受控**（F2）。
- **无 `globalThis` / `global.` 跨请求缓存**（已全局搜索 `globalThis.`/`global.` → 0 命中），故 SSR/服务端无跨请求持久化泄漏风险。

### round-4（端到端是否真稳定）— 无法从源码断言「真稳定」
- 仓库存在 `e2e-check.mjs` / `e2e-dice.mjs` / `e2e-auto-table.mjs` 等真机验证脚本（HEAD 918c7d7 即「新增端到端集成真机验证脚本」），目标 `BASE = http://localhost:3001`（`e2e-check.mjs:4`），依赖 `data.type` SSE 事件解析。
- 本轮**只读未执行**（任务要求不跑构建/测试）。基于源码层面：
  - 前端轮询/定时器存在脆弱点（见 O1 拆书页双 effect 共用 `intervalRef`；O3 前端模块缓存），但无阻断性死循环或卸载不清理的明显 bug。
  - 影响「稳定性」的风险点更可能在**异步挂起**而非泄漏：多处 `fetch` 未设超时/重试上限（如 `dissect` 轮询、各生成路由依赖 `lib/llm.ts` 25s 超时）；若后端某次请求挂起，前端 spinner/轮询可能长期空转。建议在 e2e 中补 `AbortController` 超时与失败重试上限断言，才能坐实「真稳定」。

### round-13 探针复核（导入健壮性）
- `PROCESS/meetings/round-13/_probe_import_*` 表明导入路径做过全量/丢 fork 探针；本轮确认导入层已有护栏：`import/commit/route.ts:35-37` `chunkPairs` 分批；`import/quick/route.ts:257` `createMany` 每批 100 条；`import/parse/route.ts` 有 LLM 分块（HEAD/SEG/尾）与超时重试（`CALLFLASH_TIMEOUT_MS`）。**导入侧 OOM/泄漏受控**，仅理论边界见 O3。

---

## 观察池（非必须修，诚实记录）

### O1 — dissect/[id]/page.tsx:64-82 双 useEffect 共用 `intervalRef` 的脆弱轮询
- 两个 effect 都读写同一个 `intervalRef.current`：effect A（`:64`）以 `POLL_INTERVAL` 起轮询；effect B（`:74`）在 `completed/failed` 时降到 30s。B 的 cleanup（`:79-81`）每次 `[task?.status, fetchTask]` 变化都 `clearInterval(intervalRef.current)`。正常「运行→完成」单向流转下：B 的 cleanup 会先清掉 A 起的 interval，再由 B 起重降频 interval，**卸载时两者 cleanup 都清**，不泄漏。但在 `task` 对象引用变化而 `status` 不变的边界下会重置 interval（非双倍），以及 dev HMR 重挂载可能产生瞬时双实例。属「可工作但脆弱」，建议合并为单 effect 用 ref 管理，降低误读风险。**非确认泄漏。**

### O2 — chat-sessions.ts:90 模块顶层 `setInterval` 的 dev HMR 重复注册
- `if (typeof setInterval !== "undefined") setInterval(...)` 在模块顶层注册 5 分钟清理定时器。生产构建单实例，无碍；但 Next.js **dev 热重载**会重复执行模块，可能注册多个清理 timer（每个仅做 `sessions.delete` 过期项，开销极低，且 `sessions` 为同一模块实例并不会真的多份）。属 dev-only 观察，影响可忽略。

### O3 — 导入整包体读入内存无显式体积上限（理论 OOM 边界）
- `import/parse`、`projects/import`（`.nfproject` 备份还原）读取上传体到内存后再分块/分批。未发现对请求体积（`request.headers['content-length']` 或 body 字节上限）的显式校验。超大 `.nfproject`（数百 MB）理论上会在解析前占满内存。但下游已有 `createMany` 分批(100) + LLM 分块护栏，实际 OOM 概率低。**建议补一个上传体积上限（如 50MB）并返回明确错误**，属健壮性补强而非紧急修复。

### O4 — 前端 `setTimeout` 状态清除类定时器普遍未存 ref 清理
- 如 `workspace/[projectId]/page.tsx:385,514,643,1021-1029`、`settings/page.tsx:196`、`system-status-banner.tsx:81` 等大量 `setTimeout(() => setX(""), N)` 用于清除提示态。组件卸载时若定时器未触发，回调会对已卸载组件 `setState`（React 18 仅警告、无崩溃）。属常见轻量缺陷，不在本次「必须修」范围，记录备查。

---

## 一句话结论
未发现 P0/P1 级（服务端）必须立即修的泄漏——round-2 的 `monitorCache` 上限已生效、`chat-sessions` 已受控、无 `globalThis` 跨请求缓存；但发现 **4 条 P2**（其中 F1 `entity-highlighter` 的 `cache`/`lastGoodMap` 与 round-2 修复的是同一无限增长反模式，建议一并闭环；F2 `useApi` 空 Set 残留；F3 生成时全量章节 content 内存放大；F4 监控面板未缓存的重查询），以及 4 条观察池项。
