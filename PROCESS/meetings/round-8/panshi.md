# Round 8 L1 只读诊断 — 磐石（性能/监控透镜）

> 日期：2026-08-04 ｜ 透镜：性能/监控（幂等、事务、token 计量、重试、成本看板盲区）
> 只读审查：复验 Round 7 修复 + 挖掘新坑。未改任何源码/changelog/MEMORY。

## 一、Round 7 复验结论（本透镜内）

| 修复项 | 位置 | 复验 | 结论 |
|---|---|---|---|
| 空载荷校验前置加锁前（P0-2 DoS） | `src/app/api/import/commit/route.ts:308-318` | 空载荷判断（`:310`）位于 `commitLocks.set`（`:318`）**之前**，`!projectId`（`:304`）亦在锁前 | ✅ 真实生效，400 提前返回不再残留锁 |
| world/文风长文三段采样 | `src/app/api/import/parse/route.ts:168-179` + `:408` | `needsChunking` 时 `loreText = buildLoreSample(text)`，原「仅 `slice(0,16000)`」已改头/中/尾采样 | ✅ 生效；`worldFailed` 仍正常触发 partial |
| commit 整体 `$transaction` 回滚 | `src/app/api/import/commit/route.ts:495-614` | 章节/角色/词条/文风/总纲全部包进 `prisma.$transaction`，`catch` 抛错→整体回滚、`finally` 释放锁 | ✅ 无孤儿写 |

复验小结：Round 7 三项修复均真实落地、无回退。

---

## 二、新坑（P0 / P1 / P2）

### P0
无纯功能性阻断级新坑。下列 P1 在多实例/长事务部署下可升级为 P0（数据双写），已在 P1-1 标注。

### P1

**P1-1 · 幂等锁内存化 + TTL 旁路 → 跨实例无效 / 长提交并发双写**
- 文件:行号：`src/app/api/import/commit/route.ts:18-19`（模块级 `Map`）、`:314-318`（加锁）、`:315`（TTL 校验）
- 现象：锁是**进程内存** `Map`，serverless/多实例下各实例独立，跨实例并发 commit 不被拦截；且 TTL（300s）到点即放行第二个请求——若首个大导入事务仍在进行（>300s），两者并发 → 重复写库。这正是 Round 7 P0-2 修复的副作用边界。
- 严重度：P1（多实例/长事务可升级 P0）
- 建议方向：改用 DB 行锁（`select ... for update`）或唯一约束（projectId 防重），或 Redis 分布式锁；以「持有中状态」而非时间戳 TTL 判定，移除 TTL 旁路。

**P1-2 · import_parse 失败 Flash 调用不记账 → 成本看板盲区**
- 文件:行号：`src/app/api/import/parse/route.ts:189-239`（`callFlash`），成功记账在 `:224-226`
- 现象：`callFlash` 仅在 `res.ok` 成功分支 `recordLlmCall`；重试耗尽/超时/4xx 返回 error 时**不记账**。失败时 import_parse 调用量被低估、成功率失真。
- 严重度：P1（监控透镜核心盲区；`client.ts:377-385` 已用 `FAIL_ROLE_PREFIX` 记账，二者口径不一致）
- 建议方向：失败分支也 `recordLlmCall({ role: "fail:import_parse", promptTokens:0, ... })`，与 client.ts 对齐。

**P1-3 · commit 合并用裸 fetch：无重试、无退避、失败不记账**
- 文件:行号：`src/app/api/import/commit/route.ts:40-125`（`mergeOneBatch`），仅成功记账 `:101-109`
- 现象：单次 `fetch` + 手动 45s 超时，**无重试/无故障转移/无退避**；遇 5xx/429 静默 `return null` → 回退规则合并，且不记失败账。质量（AI 合并降级）与监控（失败不可见）双缺口，与 `client.ts` 的 3 次重试+fallback 体系不一致。
- 严重度：P1
- 建议方向：复用 `createLLMClient().chat()`（自带重试/退避/失败记账），或在 `mergeOneBatch` 补重试 + 失败 `recordLlmCall`。

**P1-4 · buildLoreSample 超长文本中段大块永不采样**
- 文件:行号：`src/app/api/import/parse/route.ts:168-179`
- 现象：仅头 16k + 中段 14k 窗口（`mid±7k`）+ 尾 14k。对 >32k 文本，中段之外的区间（如 10 万字符稿的 3.2 万~8.6 万）**永不进入 LLM**，世界/文风设定缺失，却仅标记 `partial`（非 `failed`），用户难察觉。Round 7 修复只解决了「前 16k」截断，未解决「长文中段」。
- 严重度：P1
- 建议方向：改 N 段均匀采样（按长度等分 ≥3 段各取片段）或滑动窗口全量覆盖，而非单点中段窗口。

### P2

**P2-1 · token 计量口径不一致（估算 vs 真实）**
- 文件:行号：`parse/route.ts:224-226`（`countTokens` 估算） vs `commit/route.ts:101-109`（API `usage` 真实值）
- 现象：import_parse 用本地 tokenizer 估算，import_commit 用 API 返回真实 usage，两路不可直接比对，看板聚合失真。
- 建议方向：统一优先用 API `usage`；估算仅作降级兜底。

**P2-2 · findCharBlocks 内 `ranges` 死代码**
- 文件:行号：`parse/route.ts:128-133`
- 现象：`ranges` 计算后未使用（`chunkByBudget` 替代），可删减，降低维护噪音。

**P2-3 · importStatus 全失败却落 partial**
- 文件:行号：`commit/route.ts:461`
- 现象：`failedChunks>=totalChunks && !worldFailed` 才判 `failed`；若「全块失败 + worldFailed」则因 `&&!worldFailed` 为假 → 落 `partial`，全失败仍显示「部分」，略误导。

**P2-4 · 锁释放依赖 finally，进程被杀靠 TTL**
- 文件:行号：`commit/route.ts:630-633`
- 现象：正常 `finally` 释放锁；若进程被杀，靠 300s TTL，期间合法重试被 409 阻塞（Round 7 P0-2 修复的副作用边界，与 P1-1 同源）。

---

## 三、优先建议（按 ROI）
1. **P1-1** 幂等锁改 DB 行锁/分布式锁（灭双写，最关键）。
2. **P1-2 / P1-3** 失败调用统一记账 + commit 合并复用 client.ts 重试（补监控盲区、提合并质量）。
3. **P1-4** buildLoreSample 改均匀采样（灭长文中段缺失）。
