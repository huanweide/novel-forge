# Round 1 股东「磐石」QA 报告 —— babylore 填表/召回性能与监控

> 身份：会员股东「磐石」，透镜 = 填表 token 消耗 + 召回上下文大小 + 防重复效率 + 监控统计。
> 方法：只读分析（Read/Grep）+ 只读跑测试（`npx vitest run src/core/babylore` → 2 passed）。
> 所有结论均可在源码行号处证实，无编造。CHANGELOG v0.46.63 / WORK_REPORT 已对照。

---

## P0｜babyloreFillAll 串行无进度、无超时，且防重复标记仅末尾落盘

- **文件:行号**：`src/core/babylore/fill.ts:439-454`（循环）、`src/app/api/babylore/fill-all/route.ts:5`（`maxDuration=300`）。
- **问题描述**：`for (const ch of chapters)` 是纯串行 `await`，每章一次 LLM 调用（单次 `AbortSignal.timeout(120000)`，重试 3 次最坏 360s）。无并发、无整体超时、无任何分章进度回传（前端只能干等）。更严重：`filledSet` 直到整个循环跑完才 `saveFilled`（line 454），中途因 300s 函数超时（serverless）或崩溃被 kill 时，**`.runtime/babylore-filled.json` 根本没写** → 已填章节丢失 → 下次重跑全部重填，防重复形同虚设。
- **预期 vs 实际**：预期"某章慢/卡死不应拖垮整轮、且断点可恢复"；实际单章阻塞全轮、无进度、超时即全损。
- **建议修法**：① 分批并发（如 `Promise.all` 每 3–5 章一批）并保留单章失败隔离；② 每填完一章立即 `appendFilled(projectId, ch.id)`（增量写），而非末尾一次性写；③ 用流式/SSE 回传 `{order, ok, ops, applied, ms}` 进度；④ 单次调用超时收紧到 60s，循环加整体预算上限（如 240s）超限即停并报告已完成进度。

## P0｜buildTablesText 每章重发全表名录+样例行，无相关性筛选、无全局上限

- **文件:行号**：`src/core/babylore/fill.ts:105-132`（`buildTablesText`）被 `runFillForText` 每章调用（`:169`），循环每章传入（`:444`）。
- **问题描述**：填表给 LLM 的是**所有表**的【权威名录（前 80 名称）+ 全量样例（前 60 行 JSON）】。已有每表截断（80/60）是**单表上限**，但**无全局上限、无"与本章程相关"筛选**——几十张表 ×(80 名称 + 60 行 JSON) 每章全量重发。样例行 JSON 较长，N 张表 ≈ N×60 行 JSON 仅表上下文就可达 ~70k token/章，且随表数线性膨胀，逐章重复烧。更糟：`tables` 在循环内被 `applyOps` 就地累加行（rows 数组被改写），后续章节的 `buildTablesText` 把前面章节已填行也带进去，轮内 token 成本递增。
- **预期 vs 实际**：CHANGELOG 说"截断保护避免撑爆"——确实按表截断了，但这是**表数维度无封顶 + 全表无差别下发**，你问的"几十张表是否爆量"答案是会。
- **建议修法**：① 按本章召回命中（复用 `recallContext`）只下发"相关表"而非全部；② 全局 prompt 预算上限（如 tablesText 截断到 ≤6k token，超出按召回相关性保留）；③ 名录改为"按需查重"——填前先 `grep` 本章新名称是否已存在，而不是把全量名称每次塞给 LLM；④ 样例行改为"仅本表 schema + 极少样例"，名称去重交给 `applyOps` 代码级兜底（已有）。

## P1｜填表链路绕过 token 日志总闸，成本看板全盲

- **文件:行号**：`src/core/babylore/fill.ts:185`（`fetch` 直连，仅 import `buildProjectOverrides`）；对照 `src/core/llm/client.ts:11,189-212`（`recordLlmCall` 落 `LlmCallLog`）。
- **问题描述**：填表用裸 `fetch` 调 DeepSeek，**从不调用 `recordLlmCall`**。WORK_REPORT:173 声称"所有生成/润色/总结/游戏/探讨都经总闸门、一处接入全站覆盖"，但 babylore 填表不在其中。结果是 BE-3 成本看板（MonitorPanel「AI 成本」）**完全看不到填表的 token 与花费**——而这恰是高频、逐章、全表重发的重消耗路径。
- **预期 vs 实际**：预期成本看板覆盖全部 LLM 支出；实际填表 token 隐形，作者无法定位"钱花在哪"。
- **建议修法**：把 `runFillForText` 接到 `core/llm/client` 门面（或调用后手动 `recordLlmCall({role:'babylore_fill', model, promptTokens, completionTokens})`），让监控能区分并聚合填表成本。

## P1｜selfCheckFill 全量语料线性扫描（O(行数 × 全文)）

- **文件:行号**：`src/core/babylore/fill.ts:474-510`，语料 `corpus = nodes.map(content).join("\n").toLowerCase()`（`:480`），逐行 `corpus.includes(s.toLowerCase())`（`:497`）。
- **问题描述**：把整本书（50 万字项目约 500k 字符）拼成一份 lowercase 巨串，再对**每一行名称**做一次 `String.includes` 全串扫描 → 复杂度 O(行数 × 全文长度)。百表千行 × 500k ≈ 数亿次字符比较，且每次 fill-all 末尾必跑一次（`:456`）。无索引、无分块。
- **预期 vs 实际**：预期"查错名"应轻量；实际随行数与字数双重线性放大，大项目自检明显变慢。
- **建议修法**：把 corpus 建为小写分词集合/正则一次编译，或改用 `Set` 命中（先 `split` 成词表），把 O(行×文) 降为常数级；并对超长 corpus 做分块/采样。

## P1｜召回扫描是"词条×关键词×正文"笛卡尔积（O(n²) 量级）

- **文件:行号**：`src/core/babylore/recall.ts:32-40`（世界书）、`:43-65`（表格行×关键列），均对每个候选调 `matchKeyword(text, k)`（`src/core/text/match.ts:29` 内部 `hay.includes` 全串扫描 + 长度2 的 while 全出现位置扫描）。
- **问题描述**：200+ 世界书 × 每书若干关键词 × 全文长度，再加上"所有表×所有行×所有关键列×全文"逐条 `includes` 扫描。每次生成（写/润色/续写）都跑一遍，正文越长、世界书/表格越多，召回越慢。输出虽有 `slice(0,12)`（loop.ts:58）封顶，但**输入扫描成本无封顶**。
- **预期 vs 实际**：预期召回随规模可控；实际扫描是词条与正文的双重循环，大项目每章生成都背这个成本。
- **建议修法**：① 正文侧建一次性小写 + 关键词索引（如 Aho–Corasick / 预编译正则集合），把"每个候选扫全文"改为"一次扫描匹配全部关键词"；② 世界书按 `depth`/启用分层，常态只扫 forced + 命中层，避免 200 条全扫。

## P2｜召回块截断 12 条可能丢关键设定

- **文件:行号**：`src/core/babylore/loop.ts:55-58`（`recallItems.slice(0,12)`）。
- **问题描述**：命中超过 12 条时静默丢弃第 13+，且按 table 优先再按特异性排序——若某章同时命中多条关键世界书，低分但关键的条目可能被裁掉。
- **建议修法**：按"本章强相关度 + 词条 depth/优先级"加权截断，或动态上限 + 超额时提示"召回已达上限，建议拆分设定"。

## P2｜dedupSubstring 是 O(k²) 且每行/每条均调用

- **文件:行号**：`src/core/text/match.ts:64-69`，在 `recall.ts:38,57` 与 `trigger.ts:41` 每命中集调用一次。
- **问题描述**：`uniq.some(other => other.length>k.length && other.includes(k))` 是关键词数的平方复杂度；虽关键词数小影响有限，但在大词条/多列场景是隐藏的二次项。
- **建议修法**：按长度排序后单次遍历剔除被包含短词，降为 O(k log k)。

## P2｜防重复文件整文件写 + 美化格式

- **文件:行号**：`src/core/babylore/fill.ts:68-71`（`saveFilled` 用 `JSON.stringify(m, null, 2)` 整 map 写盘）。
- **问题描述**：每次 fill-all 把**整个项目 map**（含所有 project 的已填章节数组）按 2 空格美化重写。虽非每章写（仅末尾一次），但多项目共存或章节极多时写放大；且 `loadFilled`/`saveFilled` 无并发保护，两次 fill-all 并发会丢一方标记。
- **建议修法**：按 projectId 分文件（`.runtime/babylore-filled/{projectId}.json`）增量 append；取消美化（紧凑 JSON）；加写锁防并发覆盖。

---

## 验证状态与诚实边界

- 已实跑：`npx vitest run src/core/babylore` → `fill.selfcheck.test.ts` 2 passed（自检逻辑正确，但测试不覆盖性能/规模）。
- CHANGELOG v0.46.63 的"80 名称/60 行截断"确有其事，故本报告**不夸大**为"完全无上限"，而是指出"单表有上限、全局与相关性维度无上限"。
- 未做：真实 50 万字/200 世界书规模压测（沙箱直连 LLM 超时，见 WORK_REPORT:1644 自承未验证）；上述 O(n²)/token 量级为基于源码的静态推导，建议以"分章计时 + token 计数"实跑复核。
- 一句话结论：
  - P0 串行整轮：单章慢即卡死全轮，且超时丢防重复标记。
  - P0 全表重发：每章无差别下发所有表名录+样例行，表数维度无封顶、逐章烧 token。
  - P1 监控盲区：填表绕过 token 总闸，成本看板对填表完全失明。
  - P1 自检扫描：selfCheckFill 全量语料线性扫描，随行数×字数双重放大。
  - P1 召回笛卡尔：召回是"词条×关键词×正文"双重循环，大项目每章生成背此成本。
  - P2 召回截断：12 条硬截断可能丢弃关键世界书。
  - P2 去重平方：dedupSubstring 隐性 O(k²)，大词条场景累加。
  - P2 防重复写：整 map 美化重写、无并发保护。
