# Round 4 复验报告 —— 墨白（写实悬疑《龙陨之地》项目股东）

> 透镜：结构化表格 · 填表零错名 / 告警渲染 / 跨表归属 / 增量落盘安全 / 失败重试
> 方法：只读源码 + git 提交核对（commit `6ea0fda` 已含「墨白表格告警F2F3F6」）+ 静态数据流推演。未改任何 src。
> 标记：`【读码确认】`= 已在源码定位并可复现；`【推论】`= 由代码逻辑推演、需运行时实证。

---

## ① 回归确认（Round 3 表格修复 F2 / F3 / F6 是否生效）

### F2 · 单章填表卡 warnings 渲染 —— 【读码确认】已真修复，无回归
- `src/app/workspace/[projectId]/tables/page.tsx:228-235` 已新增 `fillResult.warnings?.length > 0` 渲染块（琥珀底色 + 「⚠ 疑似错误地名/名称(N)」+ `<ul>` 列表），与 fill-all 段 `:275-282` 同源写法一致。
- 数据通路完好：后端 `fill.ts:385-387` 在 `FillResult` 返回 `warnings`；`route.ts:16` `NextResponse.json(res)` 透传；`page.tsx:128-135` 的 `runFill` 把响应存入 `fillResult`。**结论：单章告警已对用户可见，F2 闭环成立。**

### F6 · LoreTableGrid flaggedRows 标红 —— 【读码确认】已真修复，双渲染路径均覆盖
- `page.tsx:51-62` 新增 `flaggedByTable` memo：从 `fillAllResult.selfCheck.issues` 抽取 `row`（数字）按 `table`(表名) 归组成 `Map<name, Set<row_id>>`，并显式跳过 `row === "跨表"`。
- `LoreTableGrid` 签名 `page.tsx:377-384` 已加 `flaggedRows?: Set<number>` prop；调用处 `page.tsx:338` 传 `flaggedRows={flaggedByTable.get(t.name)}`。
- 两条渲染路径都已条件标红：
  - 虚拟滚动路径 `page.tsx:412`：`flaggedRows?.has(Number(r.row_id)) ? "bg-[var(--nv-danger)]/10" : ""`
  - 普通路径 `page.tsx:443`：同条件 `bg-[var(--nv-danger)]/10`（否则 `border-t`）
- **结论：两种路径（≤50 行普通表 / >50 行虚拟表，见 `useVirtualRows` threshold:50）标红均生效，无回归。**

### F3 · selfCheckFill 跨表同名归属校验 —— 【读码确认】逻辑已落地，但有漏报（见 P1-1）
- `fill.ts:512-553` 已实现：先收集每个身份列值在哪些表/类别出现（`valueTables`），再对「出现在 ≥2 个不同表 且 ≥2 个不同类别」的值产出 `row:"跨表"` 的归属待确认 issue。
- 全量检索子集（名称真实性 + 空值完整性）仍在：`fill.ts:519-530`（corpus = 全项目正文 join 小写，`:505`），非空跑。
- **回归判定：F3 主体已生效、无回归；但跨表判定条件过严导致漏报（P1-1），且新增逻辑无单测护航（P1-2）。**

### 附带回归项（本透镜相关，确认无退步）
- 增量落盘：`fill.ts:473-478` 每章成功后 `filledSet.add` + `saveFilled` 即时落盘，未改动。✓
- 失败章不标记：`fill.ts:463-478` 仅 `r.ok` 才写入 filledSet → 失败章留待重试，未改动。✓
- insert/update/delete 大小写不敏感去重：`fill.ts:274-276 / 292 / 308`，未改动。✓

---

## ② P0 必修（数据错 / 漏 / 不可重试，按影响排序）

### P0-1 · 一键填表（fill-all）跨章写库用「启动快照」导致前序章节写入被后序章节整体覆盖 —— 静默丢数据
- **文件:行号**：`src/core/babylore/fill.ts:443-451`（tables 仅在函数入口取一次快照）→ `:462-479` 循环每章复用同一 `tables` → `runFillForText` `:176`（`filteredTables = tables.filter` 仍是同一批对象）→ `applyOps` `:256-261`（`getRows` 用 `[...(t.rows)]` 复制**快照**行，从不回写 `t.rows`）→ `:314` `prisma.loreTable.update({ data: { rows } })` 把「快照 + 本章 ops」整体覆盖写回 DB。
- **问题描述**：`babyloreFillAll` 在循环里从不重载 `tables`（`grep "tables\s*=" fill.ts` 除声明外无任何重赋值）。于是：
  - 第 1 章填「青龙镇」→ DB 写入 `原行 + 青龙镇(row_id=N)`；但内存 `t.rows` 仍是**最初的快照**（无青龙镇）。
  - 第 2 章填「赤焰山」→ `applyOps` 从**快照**复制出 `原行`，追加赤焰山，写回 DB → **把第 1 章的青龙镇整行覆盖抹掉**。
  - 结论：fill-all 跑完后，DB 仅保留「原行 + 最后一章的 ops」，**第 1…N-1 章所有贡献被静默丢失**。即使各章名称互不相同也照丢。
  - 与「失败章重试」叠加更糟：重试只处理未标记章，仍基于同一快照写回，照样覆盖前序已成功章。
- **可复现步骤**：
  1. 项目建 geo 表（原含若干行，row_id 1..K）。
  2. 写 ≥2 章正文，分别引入两个新地名 A（第1章）、B（第2章）。
  3. 点「一键填表（首章→最新）」。
  4. 直接查 DB `SELECT rows FROM "LoreTable" WHERE key='geo'` —— 只会看到 A 或 B 之一（取决于哪章最后写），不会两者都在；或看 `page.tsx` 表格仅剩末章结果。
- **建议修复**：在循环内每章 `runFillForText` 之后，把写回后的最新行同步回内存 `tables`（或每章前 `prisma.loreTable.findMany` 重新取 `tables`）。最小改动：让 `runFillForText`/`applyOps` 返回每个表更新后的 `rows`，由 `babyloreFillAll` 合并回 `tables[i].rows`；或循环体首行重查 `tables`。同时建议 `babyloreFillAll` 的 LLM 权威名录（`buildTablesText` `:117-144`）应基于已累积行，否则第 2 章起看不到第 1 章新增名，既损去重信号又加剧覆盖。
- **影响范围**：所有走「一键填表」的多章项目；数据完整性严重受损（多数章节事实沉淀丢失、自检对象也是被污染的末态）。单章填表 `babyloreFill`（`:358` 每次 fresh `findMany`）**不受影响**，写章自动填表 `loop.ts:164` 走单章也**不受影响**——只有「一键填表」这条入口坏。属于典型「不可见的数据丢失」，必须 P0 修。

---

## ③ P1 建议（告警 / 体验 / 逻辑缺陷）

### P1-1 · 跨表同名归属校验漏报：要求「不同类别」才报警，同类别多表错填不可见
- **文件:行号**：`src/core/babylore/fill.ts:544-553`（判定 `if (distinct.length >= 2 && info.categories.size >= 2)`）。
- **问题描述**：F3 的初衷是「自动填表可能把人名写进地点表」。但判定强制要求同名值出现在 **≥2 个不同 category** 才报。两类真实漏报：
  1. 用户自建表默认 `category:"custom"`（`page.tsx:32`）。若「地点」表与「人物」表都是 custom，误填的人名在两张 custom 表都出现 → `categories.size==1` → **不报警**。
  2. 某名称被错填进某表、且该名称在其它表**根本不存在**（仅错表独有）→ `distinct.length==1` → 不归入跨表；只能靠 `nameIssues`（全正文检索）兜底——若错名恰好也在正文出现（如角色同名地点），则连 nameIssues 也漏。
- **可复现步骤**：建两张 category=custom 的表 T1/T2；手动往 T2 误插一个本应属于 T1 的身份列值（该值也确实在 T1 存在）；跑 fill-all 自检 → `crossTableIssues` 为 0，UI 不提示归属问题。
- **建议修复**：放宽触发条件为「同名值出现在 ≥2 个不同表（distinct.length>=2）即提示归属待确认」，把「类别是否不同」作为**置信度**而非硬门槛（同类别跨表也报，但文案标注「同类别多表同名，请人工确认归属」）。或在提示里同时列出该值在每张表的出现，让用户判断。
- **影响范围**：跨表错填（F3 核心诉求）在同类别多表场景下完全失明；属告警缺失。

### P1-2 · 新增跨表逻辑无任何单测护航（Round 3 已建议补、未补）
- **文件:行号**：`src/core/babylore/fill.selfcheck.test.ts:1-46` 仍只有「幻海市」单表 nameIssues 用例；跨表分支（`fill.ts:544-553`）零覆盖。
- **问题描述**：Round 3 报告明确建议「补一条跨表错填单测」，本轮落地代码加了逻辑却**未补测试**。跨表判定（尤其 P1-1 的 `categories.size>=2` 门槛）正确性无人看守，回归无门。
- **可复现步骤**：直接在测试文件搜索 `crossTable` / `跨表` → 无命中。
- **建议修复**：在 `fill.selfcheck.test.ts` 增用例：两张不同类别表各含同名身份值 → 断言 `crossTableIssues>=1` 且 issues 含 `row:"跨表"`；并覆盖 P1-1 的同类别漏报场景以锁定修复。
- **影响范围**：测试盲区，未来改动易无声回归。

### P1-3 · 单章「重试」按钮未带 tableKeys，与首次填表范围可能不一致（顺带告警缺口）
- **文件:行号**：`page.tsx:224`（重试直接调 `runFill`）+ `runFill` `:123-139`（body 仅 `{projectId, chapterText}`，无 `tableKeys`）。
- **问题描述**：若首次填表通过 UI 其它入口带了 `tableKeys` 限定范围，单章卡的重试会**不带范围**、退化为全表重填，可能重复触发无关表写入（虽 applyOps 去重保命，但 token 浪费 + 告警口径漂移）。当前 tables 页单章填表本身无 tableKeys 选择 UI，属潜在不一致。
- **可复现步骤**：（需配合带 tableKeys 的调用链）重试后对比首次应用的表集合。
- **建议修复**：重试复用首次请求参数；或在 UI 暴露「仅对以下表填表」多选，重试沿用。
- **影响范围**：低频，但属「不可重试一致性」隐患。

---

## ④ P2 优化（边角 / 健壮性）

### P2-1 · flaggedByTable 以「表名」为 key，重名表会串色
- **文件:行号**：`page.tsx:51-62`（`m.set(it.table, ...)`）+ `:338`（`flaggedByTable.get(t.name)`）。
- **问题描述**：若项目存在两张同名表（如都叫「人物表」），issues 的行级标红会跨表错误合并/归因。
- **建议修复**：以表 `id` 而非 `name` 关联（issues 需同时带回 `tableId`，或前端用 `tables.find` 建 id→rows 映射）。
- **影响范围**：极端（同名表），纯视觉错位。

### P2-2 · 缺失 row_id 的问题行不会被标红
- **文件:行号**：`page.tsx:55-57`（`Number(it.row)` 非有限则 skip）；`fill.ts:523/529`（`row: r.row_id ?? "?"`）。
- **问题描述**：若某行无 `row_id`（历史/脏数据），selfCheck 能产出 issue，但 `flaggedByTable` 因 `Number("?")===NaN` 跳过 → 该行不标红，且 issues 文字列表 `page.tsx:289` 显示 `行?`，用户难定位。
- **建议修复**：selfCheck 对缺 row_id 的行补一个稳定索引（如数组下标）并在前端兜底标红；或写入时强制补齐 row_id。
- **影响范围**：脏数据场景，标红覆盖不全。

### P2-3 · 「跨表同名」计数与列表条数口径不一致（展示误导）
- **文件:行号**：`fill.ts:547`（`crossTableIssues++` 每个同名值 +1）vs `:549-551`（该值出现在几张表就 push 几条 issue）；UI `page.tsx:284` 显示 `crossTableIssues` 条，但 `:286-291` 列表展开为 `Σ distinct 表数` 条。
- **问题描述**：1 个跨表名出现在 3 张表 → 计数显示「1 条」，列表却列 3 行，用户以为漏数。
- **建议修复**：计数改为「涉及的问题行数」或文案改为「跨表同名 N 组 / 共 M 处」。
- **影响范围**：纯文案一致性。

### P2-4 · 单章 warnings 检索用全文、但喂 LLM 仅前 12000 字（Round 3 F10 已提，仍现状但反向安全）
- **文件:行号**：`fill.ts:186`（`chapterText.slice(0,12000)` 喂 LLM）vs `:230`（`buildWarnings(..., chapterText)` 用全文）。
- **问题描述**：与上轮担心相反——因 LLM 只看前 12000，超长章后半段名称不会被抽取，故 warnings 不会误报（已被正文前段覆盖或无数据）。但**超长章后半段的真实事实会被 LLM 漏抽**（截断即丢事实），属隐藏的数据遗漏，非告警问题。
- **建议修复**：超长章切片多次调用或显式提示「本章超过 12000 字，仅前段参与填表」。
- **影响范围**：超长单章的事实丢失（漏填），属数据完整性边角。

---

## ⑤ 反自欺小结

- **F2 / F6 真修复、无回归**：`page.tsx:228-235`（单章告警）、`:412/443`（双路径标红）、`:51-62/338`（flaggedByTable 流转）均【读码确认】落码；commit `6ea0fda` 佐证。
- **F3 主体落地但有漏报**：跨表逻辑 `fill.ts:512-553` 已真跑，但 `categories.size>=2` 硬门槛（P1-1）使同类别多表错填失明，且零单测（P1-2）。
- **P0-1 为新发现硬伤**：fill-all 复用启动快照写库，前序章节写入被后续章节整体覆盖，静默丢数据——单章填表不受影响。证据链：`fill.ts:443`（一次取快照）、`:176`（filter 同源对象）、`applyOps:256-261`（复制快照、不回写）、`:314`（整体覆盖写）。`grep` 确认循环内无重查。
- 本轮仅静态读码 + git 核对，未跑集成测试；P0-1 数据流推演严谨、可在本地 DB 直接复现，建议 L2 实现后由真实 LLM 验证。
