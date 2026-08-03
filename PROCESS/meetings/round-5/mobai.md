# Round 5 复验报告 —— 墨白（写实悬疑《龙陨之地》项目股东）

> 透镜：结构化表格 · 一键填表零错名 / 写章→填表联动 / 短章·空章边界 / 跨表同名归属 / 防重复 / 填表 token 浪费
> 方法：只读源码（HEAD=v0.46.67, commit `0a62a1f`）+ 静态数据流推演 + 跑 `SAFE_DELETE_DISABLE=1 npx vitest run src/core/babylore`（2 passed）
> 铁律：未修改任何 src/测试/changelog/配置；以下发现均带 `文件:行号` + 代码事实。
> 标记：`【读码确认】`= 源码定位可复现。

---

## 〇 复验结论：Round 4 的 P0-1（applyOps 直接累积 t.rows）已稳固，无回归

**① 多章循环填表时 `t.rows` 确实贯穿累积、无每章覆盖重建 —— 【读码确认】**

数据流链路（同一批对象引用贯穿全程）：

- `babyloreFillAll` 仅在函数入口取一次 `tables`：`fill.ts:439` `const tables = dbTables.map(...)`；循环体 `fill.ts:458` `for (const ch of chapters)` 内调用 `fill.ts:463` `runFillForText(ch.content, tables, llm, ...)` —— **循环内从未重查/重赋 `tables`**（grep `tables\s*=` 除 439 外无任何赋值）。
- `runFillForText` `fill.ts:176` `filteredTables = tables.filter(t => ...)` 返回的是**同一批对象引用**（filter 不改元素）。
- `applyOps` `fill.ts:264` `const rows = Array.isArray(t.rows) ? t.rows : (t.rows = [])` —— **直接持有 `t.rows`（即 `tables[i].rows`）的同一数组引用**；所有 `push`/`rows[idx]=...`/`rows.length=0;rows.push(...)` 均为**原地累积**。
- 第 N 章 `applyOps` 写回后，`t.rows` 已是累积态；第 N+1 章 `buildTablesText`(`fill.ts:181`) 读到的权威名录/样例即含前序章结果 → 既灭数据丢失，**也顺带满足 Round 4 报告担心的「权威名录应基于已累积行」次级诉求**（旧版靠快照，新版的同名去重信号不再失真）。
- `fill.ts:310` `prisma.loreTable.update({ where:{id:t.id}, data:{ rows } })` 写回的 `rows` 就是累积数组，持久化正确。

**② applyOps 对边角安全 —— 【读码确认】**

- 空表：`t.rows` 非数组时 `fill.ts:264` 兜底 `t.rows = []`；`op.table` 在 `byKey` 中缺失则 `fill.ts:260` `continue`，不崩。
- 某章无改动：`ops` 为空 → `applyOps` 循环体不执行，`applied=0`；该章因 `r.ok`(`fill.ts:469`) 仍被标记 filled，无数据可丢，无害。
- 重名列（两列同 `key`）：`getIdentityCol`(`fill.ts:108-114`) 取首个命中 key，对象属性访问不会抛错，属历史脏数据问题、非本轮引入。
- `babyloreFill`（单章入口 `fill.ts:365`）每次 fresh `findMany`，与累积循环无关；`safeFillAfterWriting`(`loop.ts:164`) 走单章，亦不受影响。旧「只有 fill-all 坏」的结论不变。

**③ 新引入回归 —— 未发现。** 本次改动仅把「复制快照」换成「原地累积」，未触碰去重/大小写/失败重试/增量落盘（`:469-473` 仍在）。vitest 全绿（集成测依赖 DB `577ed…` + seed，已通过）。

---

## ① P1 · update 缺 `match` 时静默插入损坏行（防重复/归属漏防）

- **文件:行号**：`fill.ts:286` `const { col, val } = (op as any).match || {};` → `:294-296`（无匹配时的 else 分支 `rows.push({ row_id: maxId+1, [col]: val, ...(op.values||{}) })`）。
- **现状（代码事实）**：当 LLM 发出 `op.op==="update"` 却漏给 `match`（`col===undefined, val===undefined`）：
  - `:288` `String(r[undefined]??"")` 恒为 `"undefined"`，与 `String("")` 永不相等 → `idx=-1` → 落入 else。
  - `:296` 推入 `{ row_id:N, "undefined":undefined, ...op.values }`：**键被 JS 转成字符串 `"undefined"`**，产生一条带脏键的伪行；`applied++`(`:297`) 且因 `val==null` 不走 `:298` 的 `appliedNames`，**不触发任何 warning**（`buildWarnings` 收不到该名）。
  - 后果：伪行静默落库，且因持有新 `row_id`、带 `"undefined"` 脏键，后续 insert 去重(`:270-273`) 与 update 匹配(`:288`) 都**匹配不到它** → 它成为游离的重复/脏数据，直接破坏「零错名/防重复」。
  - `delete` 缺 `match`(`:301`) 反而无害：`String(r[undefined]??"")!==""` 恒真 → 全保留(`:304`)，`applied+=0`，属 no-op。
- **期望**：`match` 缺失（或 `col` 不存在于列集合）的 update/delete 应**整体跳过该 op**（最多记一条 warning），而非退化成插入伪行。
- **修法建议**：在 `:286` 后加守卫 `if (!col || !(t.columns||[]).some(c=>c.key===col)) { /* skip + push warning */ continue; }`；同理 `:301` delete 加同一守卫（当前 delete 缺 match 是 no-op，但 `col` 为不存在的列时同样 no-op，建议统一显式 skip）。无需改签名，纯防御。

## ② P1（Round 4 遗留·仍未修）· 跨表同名「同类别多表」漏报 + 零单测

- **文件:行号**：`fill.ts:542` `if (distinct.length >= 2 && info.categories.size >= 2)`；测试盲区 `fill.selfcheck.test.ts:1-46`（仅 `幻海市` 单表 nameIssues 用例，无 `crossTable`/`跨表` 覆盖）。
- **现状（代码事实）**：Round 4 报告已把 P1-1（同 category 多表错填失明）与 P1-2（无单测）列为建议，**但 commit `0a62a1f` 实现清单（一键填表静默丢数据 + CJK2尾随误命中 + 实体高亮 + import分块 + 游戏状态断裂）未含这两项** → 经本轮读码，`fill.ts:542` 仍强制 `categories.size>=2` 才报；用户自建表默认 `category:"custom"`(`loop.ts:150`/`page.tsx` 建表)，两张 custom 表互错填 → `categories.size==1` → **不报警**。且跨表分支仍零单测。
- **期望**：同名值出现在 ≥2 个不同表即提示归属待确认（类别差异作为置信度文案，而非硬门槛）；并补用例锁死该分支。
- **修法建议**：`:542` 改为 `if (distinct.length >= 2)`；文案据 `info.categories.size` 区分「跨类别/同类别」。在 `fill.selfcheck.test.ts` 增两表同名用例（断言 `crossTableIssues>=1` 且 issues 含 `row:"跨表"`）+ 同类别漏报用例。

## ③ P2 · 每 op 一次整表写库 + 长项目 token 膨胀（填表浪费）

- **文件:行号**：`fill.ts:310` `await prisma.loreTable.update(...)` 位于 `for (const op of ops)`(`:258`) **循环体内**；`buildTablesText` `fill.ts:117-144` 每章重发全量（名录取前 80、样例前 60）。
- **现状（代码事实）**：同一章对同一表的 K 个 op → K 次串行 `update`，每次都把**整张累积 `rows`** 重写一遍（正确性无碍，但重复 IO）；fill-all 跑 N 章，每章 `buildTablesText` 携带的 `rows` 随填表增长（封顶 60 行）+ 80 个名 → 长篇小说 prompt 持续膨胀，token 复用率低。
- **期望**：同章同表只落库一次（循环末按表批量写）；或仅传「增量 diff」给 LLM。
- **修法建议**：把 `:310` 移出 op 循环，改为按 `t.id` 收集脏表、循环后各写一次；`buildTablesText` 可对已超过 cap 的表仅发「名录取全量 + 样例发最近 N 行」以控 prompt。

## ④ P2 · 单章/写章自动填表入口无空内容守卫（短章·空章边界）

- **文件:行号**：`babyloreFillAll` 已过滤空章 `fill.ts:424` `chapters = nodes.filter(n => (n.content||"").trim().length>0)`；但单章入口 `babyloreFill`(`fill.ts:335`) 与写章联动 `safeFillAfterWriting`(`loop.ts:106`)→`babyloreFill`(`loop.ts:164`) **无空内容前置判断**。
- **现状（代码事实）**：若以空串/极短串进入 `runFillForText`，`fill.ts:186` `chapterText.slice(0,12000)` 为空 → LLM 拿不到正文，易返回 0 ops（浪费一次调用）或基于空文编造（被 `buildWarnings`(`fill.ts:326`) 发现则会全量 warning，但仍可能落库）。
- **期望**：入口对 `(content||"").trim().length===0` 直接返回 `{ok:false, applied:0, error:"章节内容为空，跳过填表"}`，省一次 LLM 调用并防误填。
- **修法建议**：在 `babyloreFill` 起始（`:339` 后）加 `if (!chapterText?.trim()) return {ok:false,operations:0,applied:0,error:"空内容跳过"};`；`safeFillAfterWriting` 调 `babyloreFill` 前同判。

---

## ⑤ 回总结（≤150字）

Round 4 的 P0-1 修复经读码确认稳固：`t.rows` 同引用贯穿多章循环、原地累积并无每章重建，数据丢失与去重信号失真一并消除，vitest 全绿、无新回归。本轮新挖：① P1——update 缺 `match` 静默插伪行，防重复漏防；② P1——Round 4 遗留的跨表同类别漏报+零单测仍未修；③④ P2——每 op 整表重写与空内容守卫缺失。建议优先修 ①，并闭环 ②。
