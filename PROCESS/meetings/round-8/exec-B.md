# 路B 执行报告（round-8 · L2 安全）

> 执行 Agent：代码执行 Agent（路B）
> 基线：v1.6.9 / commit fc5a662
> 验收门禁（由 Chair 统一跑）：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` + `npx vitest run`
> 结论：**全部落地，无阻塞项**；一处范围扩展已在下方说明（非阻断，但需 Chair 知悉）。

## 一、新建文件

| 文件 | 对应 ID | 说明 |
|------|---------|------|
| `src/lib/rate-limit.ts` | L2-001 | 内存滑动窗口限流。导出：`createRateLimiter({windowMs,max})` → `(key)=>{ok,retryAfter?}`；`rateLimit(name,key,limit,windowMs)` 便捷函数（按 name 缓存限流器、`${name}:${key}` 作桶 key 防路由串扰）；`clientIp(request)`（取 `x-forwarded-for` 首段，回退 `local`）；`rateLimitResponse()`（统一 429 中文响应，无内部信息泄露）。模块级 `store`/`limiters` Map 单例常驻，惰性过期 + 60s 周期全量清理防内存增长。 |

## 二、修改文件（逐条约对应）

| 文件 | ID | 改动点 |
|------|----|--------|
| `src/lib/api-error.ts` | L2-003 | `classifyError` 默认分支 `error: err.message` → `error: "服务器内部错误，请查看日志"`；返回前 `console.error("[api-error] 未分类异常:", err)` 保留堆栈。 |
| `src/app/api/import/parse/route.ts` | L2-001 / L2-002 / L2-003 | ① 起始插入 `rateLimit("import/parse", clientIp(request), 5, 60000)`，超限 `rateLimitResponse()`（429）。② L2-002：`rawText.length > 500000` → 返回 413（放在 SSE 流创建前，确保 413 状态码生效；与下限判断逻辑一致）。③ L2-003：SSE 总 catch 改为 `send({type:"error", message:"服务器内部错误，请查看日志"})` 并 `console.error`，DB 落库仍保留 `msg`。 |
| `src/app/api/import/quick/route.ts` | L2-001 / L2-002 / L2-003 | ① 起始插入 `rateLimit("import/quick", clientIp(request), 5, 60000)`。② L2-002：在 `text.length < 20` 并列加 `text.length > 500000` → 413（此处在 SSE 流创建前，可直接返回状态码）。③ L2-003：SSE catch 改为泛化消息 + `console.error`。 |
| `src/app/api/generate/write/route.ts` | L2-001 / L2-003 | ① 起始插入 `rateLimit("generate/write", clientIp(request), 10, 60000)`。② L2-003：SSE 内 catch 改为泛化消息 + `console.error`（外层 catch 已走 `jsonError` 现亦泛化）。 |
| `src/app/api/generate/refine/route.ts` | L2-001 / L2-003 | ① 起始插入 `rateLimit("generate/refine", clientIp(request), 10, 60000)`。② L2-003：SSE 内 catch 泛化 + `console.error`。 |
| `src/app/api/generate/continue/route.ts` | L2-001 / L2-003 | ① 起始插入 `rateLimit("generate/continue", clientIp(request), 10, 60000)`。② L2-003：SSE 内 catch 泛化 + `console.error`。 |
| `src/app/api/generate/chapter-outline/route.ts` | L2-001 / L2-003 | ① 起始插入 `rateLimit("generate/chapter-outline", clientIp(request), 10, 60000)`。② L2-003：章纲生成 502 路径 `章纲生成失败：${err.message}` → 泛化 + `console.error`。 |
| `src/app/api/import/commit/route.ts` | L2-001 | 起始插入 `rateLimit("import/commit", clientIp(request), 5, 60000)`。其 SSE 失败 catch 原已实现结构化 code + `console.error`，未直接回显 `err.message` 给客户端，无需改动。 |
| `src/app/api/settings/test/route.ts` | L2-001 | 起始插入 `rateLimit("settings/test", clientIp(request), 3, 60000)`。 |

## 三、限流套用点汇总（阈值：窗口 60000ms）

| 路由 | 阈值 | 限流器 name |
|------|------|-------------|
| generate/write | 10 次/分 | `generate/write` |
| generate/refine | 10 次/分 | `generate/refine` |
| generate/continue | 10 次/分 | `generate/continue` |
| generate/chapter-outline | 10 次/分 | `generate/chapter-outline` |
| import/parse | 5 次/分 | `import/parse` |
| import/quick | 5 次/分 | `import/quick` |
| import/commit | 5 次/分 | `import/commit` |
| settings/test | 3 次/分 | `settings/test` |

- 全部限流调用均位于 handler 起始、`request.json()` 解析前（业务 LLM 调用前），超限即返回 429，不进入任何业务逻辑。
- 限流为纯新增代码，未改动任何路由既有业务逻辑/返回结构（除 L2-003 要求的错误文案泛化）。

## 四、实施偏差与说明（是否需汇报）

- **无需汇报（已落地）**：L2-001 / L2-002 / L2-003 三条均按计划落地。
- **需 Chair 知悉（非阻断）**：L2-003 的错误泛化范围按任务「搜索 import/parse 等 SSE 错误发送点」扩展到了 `generate/write`、`generate/refine`、`generate/continue`、`generate/chapter-outline` 的 SSE/502 catch（这些路由原也直接把 `err.message` 透传给客户端，属同一漏洞类）。我仅在**已分配给我编辑**的 6 个路由文件中实施，未触碰其它文件。若现有 vitest 用例对生成类错误的 SSE 文案做了精确断言，需同步更新为泛化文案（属预期内的安全修复副作用）。
- **L2-002 在 import/parse 的落点说明**：审计标注 `:287-288` 位于 SSE 流内部，但 SSE 流内无法改 HTTP 状态码，故将 413 拦截前置到 SSE 流创建前（body 解析后、rawText 取值时），功能等价且能正确返回 413；`import/quick` 的 `:282` 本就在流创建前，按原样并列加 413。
- **未覆盖**：审计 L2-003 的其它同类型点（如其它未分配文件的 SSE catch）不在本路独占文件清单内，已按「文件独占」原则交对应路处理，不越界。
