# Round 7 L1 只读诊断 — 磐石（性能/监控透镜）

> 日期：2026-08-04 ｜ 只读审查，未改动任何源码/CHANGELOG/MEMORY/其他 round 报告
> 范围：`src/app/api/import/parse/route.ts`、`src/components/editor/ImportWizard.tsx`、`src/app/api/import/commit/route.ts`

---

## 一、Round 6 修复复验结论（磐石透镜 4 项）

| 项 | Round6 修复 | 复验位置 | 结论 |
|---|---|---|---|
| P1-1 callFlash 60s 超时+≤2 重试 | route.ts:166-220 | 已落地。`CALLFLASH_TIMEOUT_MS=60_000` + `CALLFLASH_MAX_RETRIES=2`（attempt 0/1/2 共≤3次）；AbortController 每次重试重建；4xx 立即返回不重试（197）；网络/超时重试（215）。 | ✅ 真实生效 |
| P1-2 ImportWizard 消费 status/worldFailed | ImportWizard.tsx:373-410, 855-861 | 已落地。`done` 分支读取 `event.status` 与 `meta.worldFailed`，failed→回 input 报错，partial→进预览 + 黄色警示横幅。 | ✅ 真实生效 |
| P1-4 commit 加 projectId 幂等锁 | commit/route.ts:17-19,305-311,661 | 已落地。内存 Map+TTL 300s，并发 409 拒绝，finally 释放。但**存在空载荷锁泄漏**（见 P0）。 | ⚠️ 生效但有新坑 |
| P1-3 分块改字符预算 16000/块+重叠 | route.ts:17-19,142-160,286-355 | 已落地。`CHUNK_CHAR_BUDGET=16000`/`CHUNK_OVERLAP=300`，`chunkByBudget` 段落边界回退+重叠推进；分块触发条件（286）。但 world 提取仅取前 16000 字（见 P1-2）。 | ⚠️ 生效但有覆盖缺口 |

---

## 二、新坑（复验 + 深挖）

### P0（功能错误/阻断合法写入）

**P0-1 · commit 幂等锁空载荷泄漏，误阻塞合法导入**
- 位置：`src/app/api/import/commit/route.ts:311` 与 `:312-313`
- 现象：锁在 `commitLocks.set(pid, Date.now())`（311）**先于**空数据校验设置；当 `chapters/characters/loreEntries` 全为空时，`:313` 直接 `return NextResponse.json(...,400)` 提前返回，**未走 SSE 的 `finally`（661）释放锁**。该项目的锁残留最多 300s（COMMIT_LOCK_TTL）。期间任何合法 `commit`（含真实重试）都会被判 `409「该项目正在导入中」`而被拒绝。
- 严重度：**P0**（幂等锁自身引入的写阻塞/拒绝服务，恰与防护目标相反；API 可被直接调用且防御性校验必须配对释放）。
- 建议：将空数据校验（312-313）移到 `commitLocks.set`（311）**之前**；或在所有提前 `return` 前 `commitLocks.delete(pid)`。

### P1（明显缺陷，高价值）

**P1-1 · 世界/文风提取只读前 16000 字，长文后段设定永不抽取**
- 位置：`src/app/api/import/parse/route.ts:388-389`（`const loreText = needsChunking ? text.slice(0, 16000) : text;`）
- 现象：分块模式下角色提取覆盖全文，而 B 路世界/文风提取只喂 `text.slice(0, 16000)`。对 >16k 字的长篇，第 16k 字之后的世界设定/势力/法则**永远不被 LLM 看见**，且 `worldFailed` 不触发（静默缺失），与磐石 Round5 灭「谎报完成」精神相悖——监控只见 partial 横幅但不知是覆盖缺失。
- 严重度：**P1**（大书数据完整性缺口，监控无法区分「真失败」与「未覆盖」）。
- 建议：分段对 world 抽样（如头/中/尾各取一段拼接），或显式在 meta 标注 `worldCoverage="head-only"` 供前端提示。

**P1-2 · commit 缺整体 $transaction，中途崩溃留孤儿写，且锁期内无法重试**
- 位置：`src/app/api/import/commit/route.ts:315-663`（章节逐条 create、createMany、merge 更新均无外层事务包裹）
- 现象：章节写入→新卡 createMany→分批 merge 更新是离散写。任一环节抛错，已写部分**持久化为孤儿**（与工坊在 import/route 做的 `$transaction` 不一致）；同时 `finally` 释放锁前若进程崩溃，锁按 TTL 残留 300s，用户**无法在锁期内补做合法重试**，只能等待。
- 严重度：**P1**（部分写数据污染 + 重试可用性受限）。
- 建议：关键阶段包 `$transaction`；崩溃恢复依赖 TTL 可接受，但应补充「上次中断进度可续传」提示。

**P1-3 · worldFailed + 全块失败被判 partial 仍进预览，failed 阻断不区分原因**
- 位置：`src/app/api/import/parse/route.ts:442` + `src/components/editor/ImportWizard.tsx:386-410, 856`
- 现象：`importStatus = anyFailed ? (failedChunks>=totalChunks && !worldFailed ? "failed":"partial") : "completed"`。当 `worldFailed=true` 且全部角色块失败，`failedChunks>=totalChunks` 因 `!worldFailed` 为 false → 落 `partial` 并进预览（实际角色几乎为空）；反之 `failed` 直接回 input 但**不展示失败块数/原因**，用户无法判断是重试还是放弃。
- 严重度：**P1**（状态语义与 UI 反馈错位，误导用户决策）。
- 建议：`worldFailed` 与角色全失败应单独区分；`failed` 横幅展示 `failedChunks/totalChunks` 与具体错误摘要。

### P2（排期）

- **P2-1 监控估算偏差**：`parse/route.ts:205-207` 的 `recordLlmCall` 用本地 `countTokens` 估算（system+user+raw），非真实 `data.usage`；与 `commit/route.ts:100-108` 已取真实 usage 不一致，成本看板 `import_parse` 数值为近似。建议 parse 也解析 `data.usage`。
- **P2-2 重试虚记**：`parse/route.ts:207` 每次成功尝试（含重试的第 2、3 次）均记一条 `recordLlmCall`，重试频繁时 token 计数虚高。建议重试只在最终成功记一条或标注 retry。
- **P2-3 角色分类错标**：`commit/route.ts:103` `recordLlmCall({role:"assistant",...})` 未用 `import_commit`，成本看板按 role 拆分时混入 assistant，丧失导入合并专属归类。
- **P2-4 魔法数重复**：`parse/route.ts:389` 硬编码 `16000` 与常量 `CHUNK_CHAR_BUDGET`（18）重复，易漂移。建议复用常量。
- **P2-5 锁跨实例失效**：`commit/route.ts:18` 锁为进程内存 Map，serverless/多实例下不共享，并发请求命中不同实例仍会双写。若部署为单实例可忽略，否则需 Redis/DB 锁。

---

## 三、结论
Round 6 磐石 4 项加固**主体真实生效**（超时重试/前端消费状态/幂等锁/字符预算分块）。新挖 1 个 P0（幂等锁空载荷泄漏反致合法写被 300s 阻塞）与 3 个 P1（world 仅取头 16k 长文覆盖缺口、commit 缺事务孤儿写、状态语义/UI 反馈错位），以及若干监控精度 P2。建议 Round 7 优先修 P0-1 与 P1-1/P1-2。
