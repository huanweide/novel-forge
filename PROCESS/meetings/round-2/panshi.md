# Round 2 股东「磐石」QA 报告 —— 回归复验 + 监控盲区扩张 + 串行/扫描

> 身份：会员股东「磐石」，透镜 = 填表 token 消耗 + 召回上下文大小 + 防重复效率 + 监控统计。
> 方法：只读分析（Read/Grep 核对真实行号），不改任何 src 源码，结论均可在 file:line 证实。
> 对照：PROTOCOL.md、round-1/panshi.md（上轮 P0 串行整轮/全表重发、P1 监控盲区/自检扫描/召回笛卡尔、P2 截断/去重平方/防重复写）。

## 术语大白话
- **recordLlmCall（记账函数）**：每次真正调用大模型后，把"用了多少输入/输出 token、花多少钱、什么模型"写进数据库，供成本看板（MonitorPanel「AI 成本」）显示。是监控统计的**唯一总闸**。定义于 `src/lib/llm.ts:245`，目前**仅**在 `src/core/llm/client.ts:362`（chat 成功返回）与 `:398`（chatStream 流结束）两处被调用。
- **监控盲区**：某条调大模型的路径没走记账函数，成本看板对其完全失明（看不见 token 与花费）。
- **裸 fetch**：不通过统一封装（`client.chat`/`chatStream`），自己直接 `fetch(.../chat/completions)` 调大模型——会绕过记账、重试、故障转移。
- **增量落盘**：每填完一章就立刻把"已填"标记写到硬盘，而不是等全部跑完才写一次（避免中途崩溃丢全部进度）。

---

## 回归验证

### 回归 1：babyloreFillAll 循环内每章后是否增量 saveFilled（上轮 P0「防重复仅末尾落盘」）
- **问题**：上轮指出 `filledSet` 直到整个循环跑完才 `saveFilled`，中途超时/崩溃 → 已填章节全丢 → 防重复形同虚设。
- **预期**：循环内每章后调用 `saveFilled`（增量落盘），使断点可恢复——已填章节不丢，仅单章内容可能重填。
- **实际**：
  - `src/core/babylore/fill.ts:456` `const r = await runFillForText(...)` —— 仍**纯串行** `await`（单章阻塞全轮，未改）。
  - `fill.ts:461` `filledSet.add(ch.id);`
  - `fill.ts:463-464` `filledMap[projectId] = Array.from(filledSet); saveFilled(filledMap);` —— **每章填完即增量落盘**。
- **结论：通过（增量落盘已落地）**。中途超时/崩溃时，已填章节不再全损，下一轮 fill-all 可跳过已完成章节。
- ⚠️ 但发现新漏洞（见下文 P2 备注）：`fill.ts:461` 的 `filledSet.add` 在 `r.ok === false`（填表失败）时**仍执行** → 失败章节被永久标记为已填，下轮 fill-all 跳过它、再无重试机会。应在 `if (r.ok)` 内才标记。

### 回归 2：safeFillAfterWriting（写章自动填表）是否调用 recordLlmCall / 被监控统计
- **问题**：上轮 P1 指出 babylore 填表用裸 fetch，从不调 recordLlmCall，成本看板对填表完全失明。
- **预期**：写章自动填表与一键 fill-all 这两条重消耗路径应被 recordLlmCall 统计，成本看板可见其 token/花费。
- **实际**（逐跳核对全链路）：
  - `src/core/babylore/loop.ts:106` `safeFillAfterWriting` → `loop.ts:164` `babyloreFill(...)` → `fill.ts:328` `babyloreFill` → `fill.ts:168` `runFillForText` → **`fill.ts:195` 裸 `fetch(url, ...)` 直连 DeepSeek**。
  - 全链路**从不调用** `recordLlmCall`。`recordLlmCall` 定义于 `src/lib/llm.ts:245`，调用点仅 `src/core/llm/client.ts:362,398`（chat/chatStream 门面内）。
- **结论：有漏洞（上轮 P1 未修复）**。填表路径仍在监控盲区，成本看板看不到填表的 token 与花费——而这恰是高频、逐章、全表重发的重消耗路径。

---

## 新发现

### P0｜监控盲区不止填表：5 处裸 fetch 调 LLM 全部绕过 recordLlmCall

- **现象**：成本看板（MonitorPanel「AI 成本」）对多类高频 / 大 token 的生成路径失明，作者无法看清"钱花在哪"。
- **根因**：记账唯一总闸 `recordLlmCall` 只在 `core/llm/client.ts` 的 `chat`/`chatStream` 门面内触发；凡用**裸 fetch** 直连 `/chat/completions` 的路径都不计入。
- **file:line（均为真实 LLM 后端调用，非前端→API）**：
  1. `src/core/babylore/fill.ts:195` —— babylore 填表（写章自动填表 + 一键 fill-all，最高频、逐章、全表重发）。
  2. `src/app/api/generate/outline/route.ts:205` —— 整本大纲 / 总纲生成，`max_tokens:16384`（大消耗）。
  3. `src/core/pipeline/plan-chapter.ts:103` —— 每章生成前的剧情规划，`AbortSignal.timeout(60000)`。
  4. `src/app/api/characters/expand/route.ts:59`（`callDS`）—— 角色扩写 / 抽卡类。
  5. `src/app/api/import/commit/route.ts:73` —— 导入时 LLM 合并角色卡 / 词条（`TIMEOUT_MS=45000`）。
- **对照（已确认走 client 被监控，非盲区）**：`analyze-chapter`（route.ts:167）、抽卡 `draw`（chapter-outline/draw 经 `completeText`）、`chapter-outline`（经 `completeText`）、`explore`、`game`、`chat`、`conflict`、`extract-chapter` 等。
  - 注：`src/lib/llm.ts:139` `testLLMConnection` 也是裸 fetch，但它是设置页的连通性探测 ping，排除在成本外合理，不计为盲区。
- **修复方案（伪代码）**——任选其一，逐处改造上述 5 个裸 fetch：
  - **方案 A（推荐）**：改为走统一门面，自动记账 + 重试 + 故障转移。
    ```ts
    import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
    const cfg = getEffectiveConfig(options?.projectLlmConfig || {});
    const client = createLLMClient(cfg);
    const resp = await client.chat({
      system, prompt, maxTokens, role: "babylore_fill", // role 区分成本来源
    });
    ```
  - **方案 B**：裸 fetch 返回后手动补记账（最小改动）。
    ```ts
    import { recordLlmCall } from "@/lib/llm";
    const usage = data?.usage || {};
    recordLlmCall({
      role: "babylore_fill",
      model,
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
    });
    ```
  - 优先级：先改 `fill.ts:195`（最高频）与 `import/commit/route.ts:73`（每批都有 token 账单但全盲）。

### P1｜babyloreFillAll 仍纯串行，无并发、无单批超时

- **现象**：几十 / 上百章项目一键填表时，总耗时 = Σ(单章含 120s×3 重试)，单章慢即卡死全轮；前端干等无进度。
- **根因**：`fill.ts:451` `for (const ch of chapters)` 纯串行 `await`；单章信号 `AbortSignal.timeout(120000)` 且重试 3 次（最坏 360s），无批次并发、无整体预算上限。
- **file:line**：`src/core/babylore/fill.ts:451-465`。
- **修复方案（伪代码）**——参考 `import/commit/route.ts:26`（`BATCH_SIZE=4`）+ `:447-449`（`Promise.all` 分批）+ `:68`（`TIMEOUT_MS` 单批超时）既有模式：
  ```ts
  const BATCH_SIZE = 4;            // 与 import/commit 一致
  const BATCH_TIMEOUT_MS = 120_000;
  const pending = chapters.filter((ch) => !filledSet.has(ch.id));
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (ch) => {
        const r = await runFillForText(ch.content, tables, llm, options?.tableKeys);
        if (r.ok) markChapterFilled(projectId, ch.id); // 仅成功才标记（同时修回归备注漏洞）
        else console.warn(`[fill] 第${ch.order}章填表失败，留待下轮`);
        return r;
      }),
    );
    // 汇总 results → operations/applied/warnings；失败批次不标记、下轮可重试
  }
  ```
  - **注意**：并发写"已填标记"时**不要再共享 `filledMap` 变量后统一 `saveFilled`**（否则并发覆盖丢标记）；改用现有 `markChapterFilled`（`fill.ts:74`，自带 `loadFilled`→改→`saveFilled` 各自原子读写），每章成功即各自落盘。

### P1｜selfCheckFill 全量语料线性扫描 O(行数 × 正文长度)

- **现象**：大项目（如 50 万字 / 百表千行）每次 fill-all 末尾自检明显变慢，甚至比填表本身还久。
- **根因**：`selfCheckFill`（`fill.ts:485`）在 `fill.ts:491` 把整本书 `join("\n").toLowerCase()` 拼成一份巨串 `corpus`，再 `fill.ts:508` 对**每一行名称**做 `corpus.includes(s.toLowerCase())` 全串扫描 → 复杂度 O(行数 × 全文长度)；正文越长、行数越多越慢，无索引、无分块。
- **file:line**：`src/core/babylore/fill.ts:491, :508`。
- **修复方案（伪代码）**——把全文建成小写词集合，把"逐行全串 includes"降为常数级命中查询：
  ```ts
  // 把 corpus 切成词/子串集合（中文可按字符滑动窗口，或直接用"所有已填名称"建索引）
  const corpusSet = new Set<string>();
  for (const tok of corpus.split(/(?<=[\u4e00-\u9fff])|[^\u4e00-\u9fff]+/)) {
    const t = tok.trim().toLowerCase();
    if (t) corpusSet.add(t);
  }
  // 改写 fill.ts:508 的判断
  if (s.length >= 2 && !corpusSet.has(s.toLowerCase()) && !corpus.includes(s.toLowerCase())) {
    nameIssues++; /* 疑似错误地名 */
  }
  ```
  - 更优：用 Aho–Corasick / 预编译正则一次扫描匹配全部名称，彻底消除逐行 `includes`。

### P2 备注（不计入上方 3 个 P0/P1，供 L3 复验参考）
- **失败章节被标记已填**（回归漏洞延伸）：`fill.ts:461` 的 `filledSet.add(ch.id)` 应在 `if (r.ok)` 守卫内，否则失败章节永久跳过、无法重试。
- **召回笛卡尔**（上轮 P1 未修）：`recall.ts:34-43`（世界书 × 关键词）+ `:46-70`（表行 × 关键列）× `matchKeyword`（`match.ts:56-63` 逐位置 `includes` 全串扫描）→ 输入扫描成本随"词条数 × 正文长度"无封顶；输出 `slice(0,12)`（`loop.ts:60`）仅封顶输出，不封顶输入。大世界书项目每章生成都背此成本。
- **dedupSubstring O(k²)**（上轮 P2 未修）：`match.ts:79-84` `uniq.some(other => other.length>k.length && other.includes(k))` 关键词数平方复杂度，大词条场景隐藏二次项。
- **防重复整 map 美化写**（上轮 P2 未修）：`fill.ts:68-71` `JSON.stringify(m, null, 2)` 整文件重写、无并发锁，`saveFilled`/`loadFilled` 并发会丢标记。

---

## 优先级建议（本周最该先做的 1–2 项）

1. **先修 P0 监控盲区**（至少 `fill.ts:195` + `import/commit/route.ts:73` 两处高频 / 大 token 路径）。让成本看板恢复对重消耗路径的可见性——"看清钱花哪"是优化其它性能问题的前提；且改动小、风险低（只接 `recordLlmCall` 或换 `client.chat` 门面，不加新逻辑）。
2. **再做 P1 串行→分批并发 + 单批超时**（`fill.ts:451-465`），直接提升一键填表在大项目的可用性；顺手把并发写标记改为 `markChapterFilled` 并修掉"失败章节被标记"漏洞，同时可一并改 `selfCheckFill` 为词集合索引（P1）。

> 一句话结论：
> 增量落盘已落地（已填不丢），但监控盲区仍未修且扩张到大纲/章纲/扩写/导入 5 处裸 fetch 绕过记账；串行整轮与自检线性扫描仍需分批并发与词集合索引改造。
