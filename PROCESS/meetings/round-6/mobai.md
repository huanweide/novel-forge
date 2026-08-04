# Round 6 复验报告 —— 墨白（数据存储与填表透镜股东）

> 透镜：一键填表（babylore）· 防重复 · 归属表(cross-table) · 跨表同名/同类别校验 · 导出
> 方法：只读源码（HEAD 截至 `fill.ts` Aug 4 07:23 / `fill.selfcheck.test.ts` Aug 4 07:19）+ 静态数据流推演；未运行任何写库命令。
> 铁律：未修改任何 .ts/.tsx/.json 源码、未改 `src/lib/changelog-data.ts`/`CHANGELOG.md`/MEMORY/其他 round 报告；以下发现均带 `文件:行号` + 代码事实。
> 标记：`【读码确认】`= 源码定位可复现。

---

## 〇 复验结论：Round 5 四项修复全部落地，读码可复现，无回归

**① 伪行守卫（update/delete 缺有效 match 列 → 跳过，不插值「undefined」伪行）——【读码确认】**
- `fill.ts:287-294` update 分支：`if (!col || !cols.some((c) => c.key === col)) { warnings.push(...); continue; }`。旧版 `:288` `String(r[undefined])` 恒 `"undefined"` 落入 else 推 `{..."undefined":val}` 伪行 → 现被 `continue` 截断，**确实不再插脏键伪行，也不误删**。
- `fill.ts:309-316` delete 分支同构守卫：缺有效列则 `continue`，**不删除任何行**（旧版按 `undefined` 列过滤会 no-op 或误删，现已显式跳过）。
- 守卫产生的 skip 提示已并入 `applyOps` 的 `warnings`（`fill.ts:292,314`），经 `runFillForText` 的 `r.warnings`（`fill.ts:240`）、`babyloreFillAll` 前缀（`fill.ts:487`）、UI（`tables/page.tsx:228-232,275-279`）**真实回传并展示**。✔

**② 空内容守卫（babyloreFill 入口）——【读码确认】**
- `fill.ts:357-359`：`if (!(chapterText||"").trim()) return {ok:false,...,error:"空内容跳过填表"}`。正常有正文章节不受影响；`babyloreFillAll` 另在 `fill.ts:444` 过滤空节点，双重保险、无副作用。✔

**③ 跨表判定 `distinct.length>=2`（同类别多表不再漏报）——【读码确认】**
- `fill.ts:561-574`：`if (distinct.length >= 2)`，并据 `info.categories.size===1` 区分「同类别多表同名」/「跨类别同名」文案。原 `categories.size>=2` 硬门槛已移除，两张 `custom` 表互错填可报。
- 配套单测已补：`fill.selfcheck.test.ts:53-100`（跨类别 + 同类别两用例，断言 `crossTableIssues>=1` 且 issues 含对应文案）。✔ Round 5 的「零单测」盲区已闭环。

**④ `warnings` 回传链路完整——【读码确认】**
- `applyOps` 返回 `warnings`（签名 `fill.ts:253`，返回 `fill.ts:327`）；`FillResult.warnings`（`fill.ts:33`）、`FillAllResult.warnings`（`fill.ts:43`）均承载；API 路由 `route.ts` 原样 `NextResponse.json(res)`；UI 渲染见上。✔

---

## P0 组（数据正确性·静默缺口）

### P0-1 空 ops / 全失效 ops 的章节被永久标记「已填」→ 静默数据缺口
- **文件:行号**：`fill.ts:225-228`（3 次重试仍 `ops.length===0` 时 `if (attempt<3) continue` 在第 3 次为 false → 不 continue）+ `fill.ts:229-240`（`applyOps([])` 后 `return {ok:true, operations:0, applied:0}`）；`babyloreFillAll:489` `if (r.ok) filledSet.add(ch.id)`；`loop.ts:181` `if (babylore.ok && nodeId) markChapterFilled(...)`。
- **现状（代码事实）**：`runFillForText` 仅在「3 次 attempt 全抛错」时返回 `ok:false`（`:246`）；但「模型返回空/不可解析 JSON 3 次」或「返回的 ops 全部 `op.table` 不在 `byKey`（`fill.ts:260` continue）」→ `ops.length===0` 或 `applied===0` 却仍 `return ok:true`，**`lastErr` 被吞掉**。随后 `babyloreFillAll`/`safeFillAfterWriting` 仅以 `r.ok` 为门槛标记该章「已填」。
- **后果**：真正没填上的章节被永久标记为已填 → 一键填表与写章自动填表都永久跳过 → 事实缺失、召回退化、剧情失稳，且**全程无 error/warning 暴露**（静默）。这正是「防重复」机制的反噬：把「失败」误当「完成」。
- **期望 / 修法建议**：标记完成应以「实际落地」为准——改为 `if (r.ok && r.applied > 0)`（或 `r.operations>0 && r.applied>0`）；无事实可填的章节不标记，下次 fill-all 安全重跑（幂等）。并补单测：注入「模型连续返回空 ops」场景，断言该章**不**进入 filled 集合。无需改签名。

---

## P1 组

### P1-1 update 未命中时的静默 upsert 不校验身份列唯一性（伪行风险换了入口）
- **文件:行号**：`fill.ts:302-307`（update 分支 `idx<0` 的 else）vs 守卫 `:291-294`。
- **现状（代码事实）**：守卫只拦「`col` 无效」。一旦 `col` 有效但库内无匹配（`idx<0`），`:304` 直接 `rows.push({ row_id:maxId+1, [col]:val, ...(op.values||{}) })`——**这是隐形 insert**。若 `col !== 身份列 idCol`（如按 `related`/`status` 匹配），新行可能：① 身份列空缺；② 身份值与既有行的某条重复（`:304` 不走 insert 的 `findIndex` 去重 `:271-273`）。即「脏伪行」以一种更隐蔽的形态回归。
- **修法建议**：`idx<0` 时，若 `col !== idCol` 先按 `idCol` 去重；或直接改为「update 未命中则记 warning 并跳过」（upsert 语义需显式开关），避免无意识插行。

### P1-2 归表（错误表）单名漏报——`crossTable` 只能发现「同名跨表」
- **文件:行号**：`fill.ts:559-574`（跨表判定）+ `buildWarnings:331-346`（仅查正文是否含名）。
- **现状（代码事实）**：归属错误的两种情形之一 ≡「唯一名称被写进错误表」（人名写进 `geo` 表、且无任何其它表含该名）→ `distinct.length===1` → **不报**；若该名恰在正文出现，`buildWarnings` 也放行。即「写错表但名在正文」= 完全静默的归表错误。
- **修法建议**：在 `STRICT_SYSTEM_PROMPT`（`:146-162`）注入每张表的 `category` 语义约束（如 `geo` 仅收地点类）；`selfCheckFill` 增加「按类别预期校验」——例如 `category:"geo"` 表的身份值不应与 `characters` 类表的身份值撞车。属设计层缺口，需提示词 + 自检双保险。

### P1-3 跨表判定 `distinct.length>=2` 的误报噪声
- **文件:行号**：`fill.ts:561-574`。
- **现状（代码事实）**：同一实体「合理」出现在两张表（如 角色总表 + 出场统计表，或 章节事实表 与 关系表）也会被标「归属待确认」→ `issues` 翻倍（每表一条）+ `crossTableIssues++`。属可接受但偏吵的误报。
- **修法建议**：引入「同名白名单 / 合理跨表对」（如 `characters↔relations`）抑制噪声；或把判定升级为「跨 category 才标红、同 category 仅提示」两档，降低误报。

### P1-4 繁简/异体不归一 → insert 造重复行 + 自检误报
- **文件:行号**：去重 `:273`、update 匹配 `:296`、delete 匹配 `:319` 均仅 `toLowerCase()`；未做繁简/异体归一。
- **现状（代码事实）**：正文写「青龙镇」、LLM 填「青龍鎮」→ `toLowerCase` 不归并 → insert 造两条；`selfCheckFill` 若按简体正文检索则对繁体那条报「疑似错误地名」。系统提示词（`:150`）已禁止繁简混用，但**代码层无兜底**。
- **修法建议**：匹配/去重层加轻量繁简归一（OpenCC 或自维护映射表），或在自检中支持异体等价匹配。

### P1-5 每 op 一次整表写库（Round 5 ③遗留，仍开）
- **文件:行号**：`fill.ts:325` `await prisma.loreTable.update(...)` 位于 `for (const op of ops)`（`:259`）循环体内。
- **现状（代码事实）**：同章对同一表的 K 个 op → K 次串行整表 JSON 重写；批量填表跑 N 章时写放大 = O(章×op×表大小)，长表（数千行）每 op 重写整表，存在超时/性能雪崩风险（正确性无碍）。
- **修法建议**：把 `:325` 移出 op 循环，按 `t.id` 收集脏表，循环后每表只写一次；或包事务批量。

---

## P2 组

### P2-1 导出缺口：结构化表格无独立 CSV/Excel 导出
- **文件:行号**：`src/app/api/projects/[id]/backup/route.ts:7-16,44`（`.nfproject` 全量 JSON 备份含 `loreTables`）—— 全项目 grep「csv/download/导出表格」仅命中小说正文导出（`export/route.ts`）与 workshop preset 导出，**无单表结构化数据导出入口**。
- **现状**：用户无法便捷把单张 LoreTable 导出为 CSV/Excel 做人工校验/迁移，只能整包 `.nfproject`。
- **修法建议**：在 `lore-tables` 路由或 `tables/page.tsx` 增加「导出本表为 CSV」；与备份的 JSON 形成粒度互补。

### P2-2 完整性校验仅查身份列空值
- **文件:行号**：`fill.ts:537-540`（仅 `idCol` 空才记 `completenessIssues`）。
- **现状**：其它必填列（如 `status`/`relation`/`desc`）为空不报，自检覆盖不全。
- **修法建议**：按 `columns` 中标记为 `required` 的列扩展空值扫描（需建表时支持 `required` 标记）。

### P2-3 `buildWarnings` 单章正文 `includes` 的假阴/假阳
- **文件:行号**：`fill.ts:331-346`（仅 `chapterText.toLowerCase().includes(v.toLowerCase())`）。
- **现状**：名称含分隔符/被拆词、或长名子串误命中 → 偶发误报；名称首次出现于后续章却被本章填表触发 → 实为意图内但仍告警。
- **修法建议**：改为「分词 + 边界匹配」或放宽到全正文 corpus（与自检一致）以降低误报。

### P2-4 前端 warnings 截断（>30 条被隐藏）
- **文件:行号**：`tables/page.tsx:232,279` `fillResult.warnings.slice(0,30)`；后端 `fill.ts:581` `issues.slice(0,200)`。
- **现状**：一键填表长运行产生 >30 条 warning 时，UI 仅显示前 30，余下需翻 API；自检 issues 上限 200 亦可能截断。
- **修法建议**：UI 提供「展开全部 / 下载完整 warnings」或分页。

---

## ⑤ 回总结（≤160字）

Round 5 四项修复（伪行守卫、空内容守卫、跨表 `distinct.length>=2`、warnings 回传）经读码全数落地、无回归，跨表单测已补。新挖：P0-1——`r.ok` 门槛把「空 ops/全失效 ops」章节误标永久已填，造成静默数据缺口（fill.ts:225-240,489 / loop.ts:181）；P1 含 update 静默 upsert 不校验身份唯一（:302-307）、归表单名漏报（:559-574）、繁简不归一（:273,296,319）、每 op 整表写库（:325）；P2 含缺单表导出、完整性仅查身份列等。
