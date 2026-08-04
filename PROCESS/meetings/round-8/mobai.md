# Round 8 L1 只读诊断 — 墨白（填表/数据存储透镜）

> 日期：2026-08-04 ｜ 复验对象：Round 7 墨白透镜修复（CHANGELOG v0.46.70 + round-7/_integration.md 墨白 P1「babyloreFillAll 恒 ok:true 假完成」）
> 审查文件：`src/core/babylore/fill.ts`、`fill.selfcheck.test.ts`、`fill.ops.test.ts`、`loop.ts`
> 约束：仅只读 + 本报告；未改动任何源码/CHANGELOG/MEMORY/其他 round 报告。

---

## 一、Round 7 修复复验（已真实生效）

| 修复 | 位置 | 复验 | 单测覆盖 |
|---|---|---|---|
| 墨白 P1：`babyloreFillAll` 不再恒 `ok:true`；任一章失败（`failedChapters>0`）或 `applied=0` 时返回 `ok:false` 并带 error 摘要，门槛与 Round6 `ok&&applied>0` 一致 | `fill.ts:527-542`（ok 计算）/ `fill.ts:511`（标记门槛）/ `fill.ts:234-236`（单章 applied=0 告警） | ✅ 生效。全失败→`ok:false`、部分失败→`ok:false` 且 error 含 `m/n`、全跳过→`ok:true`（正常），均符合合约 | `fill.ops.test.ts:137-177` 三用例覆盖全失败/部分失败/全跳过 |
| Round 6 P0-3 完成门槛 `ok`→`ok&&applied>0` | `fill.ts:247`、`fill.ts:511`、`loop.ts:182` | ✅ 三处一致，无回退 | `fill.ops.test.ts:84-102` |
| Round 6 P1-① update 非身份列/无效 match 列 → 跳过不建伪行 | `fill.ts:303-306`、`fill.ts:314-320` | ✅ 生效，零写库 | `fill.ops.test.ts:104-132` |
| Round 6 P1-② 跨表同名/唯一名写错表告警 | `fill.ts:628-661` | ✅ 生效（geo→entity 方向 + 跨类别/同类别） | `fill.selfcheck.test.ts:53-154` |

> 复验结论：**Round 7 墨白 P1 修复真实落地；Round 6 三项修复全部保留、无功能回退，且均有单测拦截。**

---

## 二、新坑（挖坑 P0/P1/P2）

### P0
无确证的新引入 P0（未发现新的静默丢数据确证）。

### P1（高）

**P1-1 「全跳过 → ok:true」掩盖历史脏标记，重演静默假完成**
- 文件:行号：`src/core/babylore/fill.ts:533-535`
- 现象：当所有章节因 `.runtime` 已填标记被跳过（`processed===0 && skipped>0`）时，无条件 `ok=true` 且 `applied:0`。这些标记若来自 Round 6 之前旧版的「恒 ok:true + 无条件 markChapterFilled」误标——旧版会把事实未落地（甚至 LLM 失败的）章节也记为已填——则升级后一键填表全部跳过，对外宣称成功却数据不全。这正是 Round 6/7 全力消灭的"假完成"家族残余：报告成功但不验证。
- 严重度：P1（中高，仅影响旧版残留标记，但语义上仍属"盲报完成"）
- 建议方向：对 skipped-only 场景不要直接 `ok:true`；改为跑一次轻量 `selfCheckFill` 或由 `babyloreFill` 复核 skipped 章实际 `applied>0`/`rows` 非空后再定 `ok`；或前端对 `applied:0 && skipped>0` 显式提示"已填标记未经验证"。

**P1-2 核心标记/汇总路径仍无单测拦截（测试债延续）**
- 文件:行号：`src/core/babylore/fill.ts:511`（标记门槛）/ `loop.ts:180-188`（`safeFillAfterWriting` 标记）/ `fill.ops.test.ts`（未 mock `markChapterFilled` 与 `babyloreFillAll` 标记分支）
- 现象：本轮 `babyloreFillAll` 的 `ok` 计算（527-542）是防假完成的核心，但单测只断言返回值，未断言"失败章确实不入 `filledSet`、可重试"；`safeFillAfterWriting` 的 `applied>0 && nodeId` 标记守卫也无断言。核心保护路径依旧无测试兜底，后续重构易静默回退。
- 严重度：P1（中）
- 建议方向：补 `babyloreFillAll` 单测——注入空 ops 章，断言该章不在 `.runtime` 标记内、`processed/failed` 正确；补 `safeFillAfterWriting` 在 `applied=0` 时不调 `markChapterFilled` 的断言。

### P2（排期）

**P2-1 `crossTableIssues` 计数与 `issues` 条目数不一致**
- 文件:行号：`src/core/babylore/fill.ts:631` vs `fill.ts:637-639`
- 现象：同名值出现时 `crossTableIssues` 每值 +1，但 `issues` 数组对值出现的每个表各 push 一条（即 `distinct.length` 条）。若 UI 以 `issues.length` 而非 `crossTableIssues` 为准计数，会按表数翻倍展示，统计口径错位。
- 严重度：P2
- 建议方向：统一口径——按"值"计问题（与 `crossTableIssues` 对齐），或明确文档说明 `issues` 含每表重复条目。

**P2-2 `applied===0` 分支为不可达死代码**
- 文件:行号：`src/core/babylore/fill.ts:539`（`else if (applied === 0)`）
- 现象：`processed>0` 时一旦 `failedChapters>0` 即在 line 536 先行 `ok=false` 返回；而 `failedChapters===0` 必然 `applied>0`，故 line 539 对任何可达路径永不触发。属冗余死分支，且易误导维护者以为此处额外兜底——若未来改动 line 536 条件，可能在此处引入真正缺口却被误判已覆盖。
- 严重度：P2
- 建议方向：删除 line 539 死分支，或在注释中明示"失败已由 `failedChapters>0` 兜底"，以免后续误改。

**P2-3 `delete` 按身份列命中会一次删除全部同名重复行**
- 文件:行号：`src/core/babylore/fill.ts:337`（`filter` 大小写不敏感全量删除）
- 现象：若表内因 insert 去重失效残留多个同名行，一次 `delete` 会全部清除而非仅删指定一行，潜在误删（如本欲删一条、却清空全部同名词条）。
- 严重度：P2
- 建议方向：`delete` 仅移除首个匹配行（`findIndex` 后 splice 一处），或显式限定 `limit` 语义。

**P2-4（延续）归表错误检测仍为单向 + 标记文件化 + insert 空名行**
- 文件:行号：`fill.ts:640-659`（单向 geo→entity）、`fill.ts:62-83`（`.runtime` JSON 非 DB）、`fill.ts:279-296`（insert 缺身份列仍建空名行）
- 现象：与 Round 7 报告 P2-1/P2-2/P2-3 一致，本轮未变，仍属排期项；其中 insert 空名行与已加固的 update 守卫不对称，最值得优先收口。
- 严重度：P2

---

## 三、小结
Round 7 墨白 P1（`babyloreFillAll` 假完成）已根治、单测到位；Round 6 三项修复零回退。本轮新坑以 **P1-1（全跳过盲报 ok:true 掩盖旧版脏标记）** 为首，仍属"假完成"家族残留；其次为测试债（P1-2）。三项 P2（计数错位、死分支、delete 误删）与前轮 P2-4 一并排期。建议下轮回填 P1-1/P1-2。
