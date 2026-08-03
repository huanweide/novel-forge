# 会员股东·无限会议 — Round 5 L1 只读复验报告【股东·磐石】

- 角色透镜：性能/监控控（填表 token 消耗 · 召回上下文大小 · 防重复效率 · 监控统计漏记）
- 复验对象：Round 4 磐石 P0-1（import 分块失败如实上链）；新坑：O(n²) 扫描 / 大项目召回爆量 / 防重复 / 监控漏记 / token 浪费
- HEAD：`0a62a1f`（v0.46.67）| 方法：Read/Grep 源码 + `SAFE_DELETE_DISABLE=1 npx vitest run src/core/babylore/fill.selfcheck.test.ts`（2 passed）| 铁律：未改动任何源码/测试/changelog

---

## ①【P1】importStatus 仅统计「分块角色块」失败，非分块路径与 B路世界提取失败被排除 —— Round4 P0-1 闭环声明有残留缺口

**现状（证据）**
- `src/app/api/import/parse/route.ts`
  - `failedChunks` 初始化为 0、`totalChunks=1`（L282-283）；仅在**分块模式**的角色块 `callFlash` 报错（L299）或 `parseJSON` 抛错（L309）时 `failedChunks++`。
  - **B路世界设定+文风提取**（`!isCharOnly` 分支，L342-379）：`resB.error`（L367）与 `parseJSON` 抛错（L375）只 `send` 一条 `⚠️ 世界提取失败` 的 progress 提示，**从不 `failedChunks++`**；`lore` 仍为空数组。
  - **非分块模式**（角色<30 时的常见路径，L314-335）：`resA.error`（L324）、`resA` 的 `parseJSON` 抛错（L332）同样只发 warning，**从不 `failedChunks++`**；此时 `failedChunks` 恒为 0。
  - 最终 `importStatus = failedChunks===0 ? "completed" : (failedChunks>=totalChunks ? "failed":"partial")`（L393），且 `done.status`(L396)、`meta.failedChunks`(L402)、持久化 `importTask.status`(L405) 全部只源自该计数。
- CHANGELOG.md:11 声明 Round4 已「灭『部分失败却标 completed』的误导」。但代码显示：该修复**仅覆盖分块模式的角色块**；而（a）所有规模项目的 B路世界提取失败、（b）<30 角色项目的整条非分块路径，失败仍会让 `done.status`/`importTask.status` 报 `completed`，且 `chars/lore` 可能为空 → 用户/前端按 `completed` 接收却丢了数据，与声明矛盾。

**期望**：`done.status` 与 `importTask.status` 应如实反映**全部**提取阶段（A路角色 + B路世界/文风）的成败，非分块模式同样需要计数。

**修法**：把 B路（L367/L375）与非分块 A路（L324/L332）的失败也纳入计数 —— 可引入 `failedStages`/`worldFailed` 标志，最终 `importStatus` 改为 `if (failedChunks>0 || worldFailed) ...`。复杂度/规模依据：失败计数属 O(1)，零额外开销；但修复后才能让常见的小项目导入（非分块）不再谎报成功。

---

## ②【P2】所有 LLM 调用站点的「失败/重试」分支统一未记账 —— 监控统计漏记 + 重试 token 浪费

**现状（证据）**
- 主链路 `src/core/llm/client.ts`：`chat()` 仅在 `res.ok` 成功时 `recordLlmCall`（L362）；`chatStream()` 经 `onUsage` 回调在成功流末尾记账（L398）。**失败重试（L358-377，DEFAULT_RETRIES=3，L75）与最终抛错（L380）均不记账**。
- 各路由级裸 fetch 站点全部同样「仅成功路径记账」：`babylore/fill.ts:232`、`plan-chapter.ts:124`、`import/parse/route.ts:173`、`generate/outline/route.ts:233`、`characters/expand/route.ts:81`、`import/commit/route.ts:97`。
- 结论：Round 2/3 补齐的 5 处裸 fetch 盲区现已全部补齐（无新增裸点）；`lib/llm.ts:139` 为 `testLLMConnection` 连通性测试，非内容生成，不记账合理。**但失败调用与重试重发不被 LlmCallLog 记录** → 调用次数/成功率统计失真；且 `chat()` 每次重试（429/5xx 可重试，L90-95）都重发完整 prompt，属无效重试 token 浪费（规模：每章生成遇限流可能多烧 1–2 倍 prompt token）。

**期望**：LlmCallLog 至少覆盖最终成败与尝试次数；重试重发应可观测、可被节流。

**修法**：在 `client.ts` 的 `attemptChat` 失败重试处或 `chat()` 兜底，对每次尝试 `recordLlmCall`（新增 `success:false`/`attempt` 字段，或单列 attempt 计数）；并对 429 触发指数退避而非盲目 3 次满额重试。复杂度/规模依据：仅追加 fire-and-forget 写库，O(1)/次，不阻塞主流程。

---

## ③【P2】selfCheckFill 对全表每行做「全正文 `corpus.includes`」扫描 —— 典型 O(行数 × 全文长度) 爆量点

**现状（证据）**
- `src/core/babylore/fill.ts`
  - `selfCheckFill`（L495-558）：L501 `corpus = nodes.map(n=>n.content).join("\n").toLowerCase()` 构建**全项目正文**小写串；L523 对每个表行的身份列值 `corpus.includes(s.toLowerCase())` 判断名称是否真实。
  - 复杂度 = O(表行数 × 全文长度)。每次 `babyloreFillAll` 末尾必跑（L477）。
- 规模假设：200 行 ×（100 章 × ~5000 字 ≈ 5×10⁵ 字符）≈ **10⁸ 次字符比较/次**；若正文更长或行更多线性恶化。已通过 `fill.selfcheck.test.ts`（2 passed）确认该路径真实执行。

**期望**：大项目一键填表自检不应随行数×正文长度平方级恶化；名称真实性校验应可索引。

**修法**：反向建索引 —— 取所有行身份列值集合，对 `corpus` 做**单次**扫描（Aho–Corasick 或多模式匹配 / 或把 corpus 切词入 `Set` 后查 `Set.has`），将 O(行×文) 降为 O(文 + 行)。复杂度/规模依据：单次扫描 O(文)，行查询 O(行)，较现状 1–2 数量级改善。

---

## ④【P2】recallContext 逐实体扫全文（O(实体×键×文本)）—— 但注入侧已收敛，列为观察项

**现状（证据）**
- `src/core/babylore/recall.ts`：L34-43 对每个世界书条目的每个 `keys` 调 `matchNameStrict(text,k)`；L46-70 对每个表行的每个 `keyCols` 调 `matchNameStrict`。`matchNameStrict`（`src/core/text/match.ts:86`）内部 `hay.includes(needle)` + CJK 闭边界多次 `indexOf`，单次 O(文本长度)。整体复杂度 O((lore键数 + 表行数×keyCols) × recallText长度)，**每章生成（write/continue/refine）都跑一次**。
- **亮点（爆量已收敛）**：`src/core/babylore/loop.ts:56-60` 已按 score 降序并 `.slice(0, 12)` 截断注入，召回 prompt 注入**有上限 12 条**，故「大项目召回上下文爆量导致 token 暴涨/截断」风险在注入侧已被控制。
- 规模假设：200 实体 × 平均 3 键 × ~4000 字 recallText ≈ 2.4×10⁶ 次匹配/章，当前规模可接受；但随实体数线性增长，超大项目（数百词条）可能成为每章生成的隐性算力税。

**期望**：保持注入截断；扫描成本不随实体数失控。

**修法（可选）**：预建「关键词→实体」倒排索引，召回时由文本命中索引而非逐实体扫全文，将 O(实体×文) 降为 O(命中)。复杂度/规模依据：索引构建 O(实体×键)，查询 O(文)，适合超大规模；当前规模可暂缓。

---

## 总结（收敛）

Round 4 磐石 P0-1 修复**未完全闭环**：importStatus 仍只统计分块角色块，非分块路径与 B路世界提取失败会谎报 `completed`（P1，建议升级复核）。监控面：9 处 LLM 站点成功路径均已记账、无新增裸点（Round2/3 缺口保持闭合），但失败/重试分支统一漏记（P2）。性能面：selfCheckFill 全表×全文扫描（P2 实锤优化点）、recall 逐实体扫全文（注入已 slice(0,12) 收敛，P2 观察）。防重复（fill.ts 代码级去重 + 已填标记增量落盘）与召回注入截断两项设计到位，未见新隐患。本轮 1×P1 + 3×P2，建议优先修 ①。
