# Round 3 股东「磐石」QA 报告 —— 监控盲区回归复验 + 串行/扫描复验 + 新盲点

> 身份：会员股东「磐石」，透镜 = 监控后台 + 架构（LLM 成本/调用监控是否全、整轮处理是否串行阻塞可并行）。
> 方法：只读分析（Read/Grep 核对真实行号），**未改任何 src 源码**。结论均可在 file:line 证实。
> 对照：round-2/panshi.md（P0 监控盲区 5 处裸 fetch / P1 串行整轮 / P1 自检线性扫描 / P2 失败章被标记等）。
> 代码基准：CHANGELOG 标注 v0.46.65（package.json 仍写 0.1.0，未同步，不采用）。

---

## ① 历史修复回归核实

### 回归 1：Round 2 的 5 处裸 fetch 是否真的都补了 recordLlmCall —— 是，逐处确认
全项目 grep `recordLlmCall`，除门面 `src/core/llm/client.ts:362,398` 外，Round 2 点名的 5 处**全部已接**，且均在「HTTP 200 且解析到响应」的成功路径上调用（非死代码）：

| 路径 | 裸 fetch 行 | recordLlmCall 行 | 成功路径确认 |
|---|---|---|---|
| 填表 `src/core/babylore/fill.ts` | `:196` | `:231` | 在 `applyOps` 之后、return ok 之前调用 ✓ |
| 大纲 `src/app/api/generate/outline/route.ts` | `:205` | `:233` | `llmRes.ok` 后、`structuredContent=` 前 ✓ |
| 章纲 `src/core/pipeline/plan-chapter.ts` | `:103` | `:124` | `res.ok` 后、解析 plan 前 ✓ |
| 角色扩写 `src/app/api/characters/expand/route.ts` | `:59` | `:81` | `r.ok` 后、取 raw 前 ✓ |
| 导入合并 `src/app/api/import/commit/route.ts` | `:73` | `:96` | `r.ok` 后、取 raw 前 ✓ |

提取字段均 `usage?.prompt_tokens ?? usage?.promptTokens ?? 0` + 驼峰兼容，`baseURL`/`projectId` 透传。写法与 `src/lib/llm.ts:245` 的 `LlmCallLogInput` 签名一致。
**结论：Round 2 的 P0（原 5 处）已真实落地，非空谈。**

### 回归 2：监控盲区是否「全清零」 —— 否，漏掉第 6 处裸 fetch（新 P0）
Round 2 的清单**不完整**。我以「`fetch(` + 命中 `/chat/completions` 且非门面/非 ping」为口径全量扫了一遍，真正的 LLM 推理裸 fetch 共 9 处：

- `client.ts:144, :241`（门面，已记账）
- 上述 5 处（已记账）
- `src/lib/llm.ts:139` `testLLMConnection`（设置页连通性 ping，排除在外合理）
- **`src/app/api/import/parse/route.ts:160` `callFlash` → 裸 fetch `/chat/completions`，全文件 grep `recordLlmCall` 为 0（即从未记账）← 漏网**

**这处很重、很该记：**
- 这是「AI 解析导入」（`/api/import/parse`）人物提取 + 世界设定 + 文风抽取，`max_tokens: 32768`（`import/parse/route.ts:163`），单次输出上限拉满，单批 token 消耗极大。
- 角色 ≥30 时进入分块模式：`for` 循环每 30 个角色一块独立调一次（`route.ts:286-303`），块数 = ⌈N/30⌉，外加一次世界/文风抽取（`route.ts:351`）。导入 100 个角色 = 约 4 次分块 + 1 次世界 ≈ 5 次 32768-out 的重调用，**全部对成本看板失明**。
- 它和已修的 `import/commit` 是同一导入流程的前后脚，Round 2 只修「合并」漏了「解析」，盲区仍在导入链上。

> 诚实判定：**监控盲区未全清零**。原 5 处归零，但 `import/parse` 是第 6 处、且消耗量级最高之一，成本看板对「导入解析」完全失明。「看清钱花哪」仍不成立。

### 回归 3：Round 2 P2「失败章节被永久标记已填」 —— 仍存在（升级为 P0）
`src/core/babylore/fill.ts:466-474`：
```ts
const r = await runFillForText(...);
processed++;
...
filledSet.add(ch.id);          // :471 无 if (r.ok) 守卫
filledMap[projectId] = Array.from(filledSet);
saveFilled(filledMap);         // :474 增量落盘
```
`r.ok === false`（填表失败）时仍 `add` 并落盘 → 该章被标「已填」，下轮 `babyloreFillAll` 在 `:462` `if (filledSet.has(ch.id)) { skipped++; continue; }` 直接跳过，**永不重试**。这会造成「失败章节静默丢失重试机会」的数据正确性问题，比纯性能更严重。Round 2 列为 P2，本轮建议**升 P0**（与防丢失同一优先级家族）。

---

## ② 仍待修 / 新发现问题（P0 / P1，纯逻辑 vs 需架构）

| 项 | 严重度 | 位置 | 现状 | 可修性 |
|---|---|---|---|---|
| **新 P0｜import/parse 裸 fetch 未记账** | P0 | `import/parse/route.ts:160`（`callFlash`） | 全文件无 `recordLlmCall`；导入解析链对成本看板失明，且是 32768-out 重路径、可多批 | **纯逻辑**（抄已修 5 处写法即可） |
| **P0｜失败章节被标已填、永不重试** | P0 | `fill.ts:471`（无 `if(r.ok)` 守卫） | 仍每章无条件 `add`+`saveFilled` | **纯逻辑**（包一层 `if (r.ok)`） |
| **P1｜babyloreFillAll 仍纯串行** | P1 | `fill.ts:461-475` | `for (const ch of chapters) await runFillForText` 逐章阻塞，无批次并发、无整轮预算；单章 `AbortSignal.timeout(120000)`×3 重试最坏 360s 卡全轮 | **纯逻辑**（批次 `Promise.allSettled`+`markChapterFilled`） |
| **P1｜selfCheckFill 逐名全串扫描 O(行数×全文长)** | P1 | `fill.ts:501`（`join` 巨串）、`:518`（`corpus.includes`） | 每行名称对整个正文巨串 `includes`，无索引；大项目自检比填表还慢 | **纯逻辑**（建词集合索引） |
| P2（沿用）｜召回笛卡尔 / match 全串扫描 | P2 | `recall.ts` + `match.ts:56-63` | 输入随「词条数×正文长」无封顶，仅 `slice(0,12)` 封顶输出 | **纯逻辑** |
| P2（沿用）｜`dedupSubstring` O(k²) | P2 | `match.ts:79-84` | `uniq.some(other => other.length>k.length && other.includes(k))` 关键词平方 | **纯逻辑** |
| P2（沿用）｜`saveFilled` 整 map 美化重写、无锁 | P2 | `fill.ts:69-71` | `JSON.stringify(m,null,2)` 全量重写；并发写会丢标记 | **纯逻辑**（改为 `markChapterFilled` 原子读写） |
| P2（新）｜记账 role 全为 `"assistant"`，无法按功能拆分 | P2 | 5 处补记点均 `role:"assistant"` | 成本看板只能看总数，无法区分「填表/大纲/扩写/导入」各自花费 | **纯逻辑**（传 `role:"babylore_fill"` 等） |

### 关于「需架构/端到端」的判定
本轮所有项**均为纯逻辑可修**，无一件需要架构重构或端到端改造：
- `babyloreFillAll` 并发化是服务端内部循环改写，`/api/babylore/fill-all` 对外仍是「一次性返回结果」，前端（tables/page.tsx:152 调 `fill-all`）不依赖逐章进度流，并发不改变接口契约 → 零前端改动。
- `import/parse` 补记账、`selfCheckFill` 建索引、`if(r.ok)` 守卫、`saveFilled` 改原子读写，都是局部改，不触碰数据模型/流协议。
- 唯一需留意的**集成小点**（不算架构）：`babyloreFillAll` 并发后，`runFillForText` 内部对 `prisma.loreTable.update`（`:313`）是每表一次写，并发批次间若操作同一表需确认无竞态——但填表按章串行改各自表行的既有模式不变，批次间章节不同、表相同也仅是多章写同一表的不同 row，prisma 按 row_id 覆盖，无冲突。可在实现时加注。

---

## ③ 建议（含并行化 / 扫描优化具体写法）

### 1. 新 P0：给 `import/parse/route.ts` 补记账（抄 5 处已验证写法）
在 `callFlash` 取到 `data` 后补，因分块/世界多路调用，建议在**返回 `{raw,sec}` 前**记账，使每路调用都记一条：
```ts
// import/parse/route.ts — callFlash 内，约 :168 之后
const data = await res.json().catch(() => null);
const usage = (data as any)?.usage;
recordLlmCall({
  model: cfg.model,
  role: "import_parse",                 // 与已修 5 处分开，便于成本看板按功能聚合
  promptTokens: usage?.prompt_tokens ?? usage?.promptTokens ?? 0,
  completionTokens: usage?.completion_tokens ?? usage?.completionTokens ?? 0,
  totalTokens: usage?.total_tokens ?? usage?.totalTokens ?? 0,
  baseURL: cfg.baseURL,
});
const raw = data?.choices?.[0]?.message?.content || "";
```
并 `import { getSettings, recordLlmCall } from "@/lib/llm";`（当前仅 import 了 `getSettings`）。风险：零（与 outline/commit 同源写法）。

### 2. P0：失败章节不再被标已填（fill.ts:471）
把 `filledSet.add` + `saveFilled` 移入成功守卫：
```ts
const r = await runFillForText(ch.content || "", tables, llm, options?.tableKeys);
processed++;
operations += r.operations;
applied += r.applied;
for (const w of r.warnings) warnings.push(`第${ch.order}章...：${w}`);
if (r.ok) {                                  // ← 仅成功才标记
  markChapterFilled(projectId, ch.id);       // ← 改用原子读写，替代 filledSet.add+saveFilled
}
```
顺手把 `fill.ts:471-474` 的 `filledSet.add + saveFilled` 整段删掉，改用 `markChapterFilled`（`fill.ts:75`，自带 `loadFilled→改→saveFilled` 单文件原子写），既修失败标记 bug，又消灭「共享 `filledMap` 变量后统一 `saveFilled`」在并发下的覆盖风险（为第 3 项铺路）。

### 3. P1：babyloreFillAll 批次并发（fill.ts:461-475）
```ts
const BATCH_SIZE = 4;                         // 与 import/commit 一致
const pending = chapters.filter((ch) => !filledSet.has(ch.id));
let skipped = chapters.length - pending.length;
for (let i = 0; i < pending.length; i += BATCH_SIZE) {
  const batch = pending.slice(i, i + BATCH_SIZE);
  const results = await Promise.allSettled(
    batch.map(async (ch) => {
      const r = await runFillForText(ch.content || "", tables, llm, options?.tableKeys);
      if (r.ok) markChapterFilled(projectId, ch.id);   // 成功才标记，零共享变量
      else console.warn(`[fill] 第${ch.order}章填表失败，留待下轮`);
      return r;
    }),
  );
  for (let k = 0; k < batch.length; k++) {
    const r = results[k].status === "fulfilled" ? results[k].value : { ok:false, operations:0, applied:0, warnings:["并发异常"] };
    processed++; operations += r.operations; applied += r.applied;
    for (const w of r.warnings) warnings.push(`第${batch[k].order}章《${batch[k].title||"未命名"}》：${w}`);
  }
}
```
注意：`runFillForText` 内部 `:313` `prisma.loreTable.update` 按 row_id 覆盖，批次间不同章节写同表不同行不冲突；`markChapterFilled` 已是单文件原子读写，并发安全。单章 `120s×3` 重试保留（串行重试本就正确，无需改）。

### 4. P1：selfCheckFill 词集合索引（fill.ts:501, :518）
把「逐名 `corpus.includes`」降为常数级命中查询：
```ts
// fill.ts:501 改为建词集合（中文按字符滑窗、西文按非中文字符切）
const corpus = nodes.map((n) => (n.content || "")).join("\n").toLowerCase();
const corpusSet = new Set<string>();
for (const tok of corpus.split(/(?<=[\u4e00-\u9fff])|[^\u4e00-\u9fff]+/)) {
  const t = tok.trim();
  if (t) corpusSet.add(t);
}
// fill.ts:518 判断改为
if (s.length >= 2 && !corpusSet.has(s.toLowerCase()) && !corpus.includes(s.toLowerCase())) {
  nameIssues++; ...
}
```
更优（大项目）：Aho–Corasick / 预编译正则一次扫描匹配全部名称，彻底消除逐行 `includes`（参考青砚透镜的召回匹配也可共用）。

### 5. P2 顺手项（实现成本低，可并入同批 PR）
- `match.ts:79-84` 的 `dedupSubstring` O(k²)：先按长度降序排，长串先入集，再 `uniq.filter(k => !seen.some(long => long!==k && long.includes(k)))`，复杂度降到 O(k·logk + k·去重后长串数)。
- `recall.ts` 输入封顶：在 `matchKeyword` 前对「世界书条目数×正文长」做预算截断（如单章召回注入 token ≤ N），与现有 `slice(0,12)` 输出封顶呼应。
- 5 处补记点把 `role:"assistant"` 改成 `babylore_fill / generate_outline / plan_chapter / characters_expand / import_commit / import_parse`，成本看板即可按功能拆分。

---

## 一句话结论
Round 2 的 5 处裸 fetch 已真清零，但监控盲区**未全清零**——`/api/import/parse` 的 `callFlash`（32768-out、可分多批）是漏掉的第 6 处、且最该被记账，成本看板对导入解析仍失明；串行整轮、自检线性扫描两件 P1 未动；Round 2 的「失败章被标已填永不重试」建议升 P0。上述全部为纯逻辑可修，无需架构改动；优先级：先补 `import/parse` 记账 + 修失败标记（P0），再做 `babyloreFillAll` 批次并发 + `selfCheckFill` 词集合索引（P1）。
