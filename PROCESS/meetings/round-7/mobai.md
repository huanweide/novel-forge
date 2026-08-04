# Round 7 L1 只读诊断 — 墨白（填表/数据存储透镜）

> 日期：2026-08-04 ｜ 复验对象：Round 6 墨白透镜修复（CHANGELOG v0.46.69 + round-6/_integration.md P0-3 / P1-① / P1-②）
> 审查文件：`src/core/babylore/fill.ts`、`fill.selfcheck.test.ts`、`fill.ops.test.ts`、`loop.ts`
> 约束：仅只读 + 本报告；未改动任何源码/CHANGELOG/MEMORY。

---

## 一、Round 6 修复复验（均真实生效）

| 修复 | 位置 | 复验 | 单测覆盖 |
|---|---|---|---|
| P0-3 完成门槛 `ok`→`ok && applied>0`，空 ops/全失效章不标已填、可重试 | `fill.ts:233-235,246,250` / `fill.ts:507-512` / `loop.ts:182` | ✅ 三处门槛一致生效 | `fill.ops.test.ts:62-80` 覆盖单章空 ops（ok:false, applied:0） |
| P1-① update 非身份列未命中 → 告警跳过、不建伪行 | `fill.ts:313-319` | ✅ 已跳过且零写库 | `fill.ops.test.ts:82-95` 覆盖 |
| P1-② 跨表唯一名写错表告警 | `fill.ts:611-630` | ✅ geo→entity 方向生效 | `fill.selfcheck.test.ts:142-153` 覆盖 |

> 复验结论：**三项 Round 6 墨白修复全部真实落地、无功能回退，且均有对应单测断言拦截**。无新引入的回退。

---

## 二、新坑（复验 + 挖坑）

### P0
无确证的本轮新引入 P0（未发现新的静默丢数据确证）。以下 P1 为最接近 Round 6 治理主题（"静默假完成"）的残余。

### P1（高）

**P1-1 `babyloreFillAll` 恒返回 `ok:true` — 静默假完成**
- 文件:行号：`src/core/babylore/fill.ts:517-518`
- 现象：`return { ok: true, ... }` 在主成功路径硬编码。即便全部章节填表失败（`applied=0`、`processed=0`，如 LLM 不可用/网络断），仍向调用方/前端回报成功。这与 Round 6 全力消灭的"假完成 / 静默丢数据"同源——用户/上游据此误判数据已全填，不再重试，缺口就此沉默。
- 严重度：P1（高）
- 建议方向：将 `ok` 改为真实汇总，如 `applied > 0 && failedChapters === 0` 或至少 `applied > 0`；并把失败章数与重试提示写入 `FillAllResult`（新增 `failed` 字段），前端据此呈现"部分失败"。

**P1-2 单章 `babyloreFill` 标记路径 / `babyloreFillAll` 标记路径无直接单测（测试缺口）**
- 文件:行号：`src/core/babylore/fill.ts:507-512`、`loop.ts:182`（逻辑）/ `fill.ops.test.ts`（仅测单章阈值，未mock `markChapterFilled` 与 `babyloreFillAll`）
- 现象：P0-3 真正防丢数据的"标记已填"分支位于 `babyloreFillAll` 与 `safeFillAfterWriting`，但现有测试只驱动单章 `babyloreFill` 的 `applied>0` 阈值，未验证"空章确实不被 `markChapterFilled`、可重试"。该核心保护路径处于无测试拦截状态，后续重构易静默回退。
- 严重度：P1（中，偏测试债）
- 建议方向：补 `babyloreFillAll` 单测——注入"空 ops 章"，断言 `filledSet` 不含该章且 `skipped/processed` 正确；补 `safeFillAfterWriting` 在 `applied=0` 时不调 `markChapterFilled` 的断言。

### P2（排期）

**P2-1 归表错误检测单向，反向/其它类别错归漏报**
- 文件:行号：`src/core/babylore/fill.ts:611-630`
- 现象：唯一名"写错表"告警仅在 `g === "geo"` 且存在有值 `entity` 表时触发（单向）。反向——地名误写进 `characters` 类表，或唯一名落在 `other`/`auto`/`custom` 类表——完全不告警；changelog 所称"跨表唯一名写错表告警"被实现为单向，覆盖面不完整。且 `fill.selfcheck.test.ts` 仅测了 geo→entity 方向（line 142-153），反向漏报无测试兜底。
- 严重度：P2
- 建议方向：将判定扩展为双向（entity 类唯一名 + 项目含 geo 表亦告警），或把 `other` 纳入"非预期表"集合；并补反向用例。

**P2-2 防重复标记基于文件系统而非 DB，重置即丢**
- 文件:行号：`src/core/babylore/fill.ts:62-83`（`FILLED_PATH` = `.runtime/babylore-filled.json`）
- 现象：已填章节标记落在本地 JSON 文件，非数据库。容器重启 / volume 丢失 / 多实例部署时标记消失，导致 `babyloreFillAll` 全部章节重放。虽 `applyOps` 的 insert→update 去重可防真重复行，但仍浪费 LLM 调用、并可能重复触发告警/写库压力。
- 严重度：P2
- 建议方向：将标记持久化入 DB（如 `storyNode` 新增 `babyloreFilled` 布尔列，或独立 `BabyloreFilled` 表），与项目数据同源、可跨实例。

**P2-3 insert 缺身份列值仍插空名行**
- 文件:行号：`src/core/babylore/fill.ts:279-296`
- 现象：`insert` 时若 `idCol` 值缺失（`newVal == null`），仍走 `else` 分支建行（`{ row_id, ...values }` 无名称）。`buildWarnings` 对 `v.length < 2` 跳过不报警，仅 `selfCheckFill` 完整性（line 559）事后捕获。与已加固的 `update` 非身份列守卫（P1-①）不对称。
- 严重度：P2
- 建议方向：对 `insert` 无身份列值的情况，告警并跳过（对齐 `update` 守卫），避免落地空名行后再靠自检兜底。

---

## 三、小结
Round 6 三项墨白修复全部真实生效、无回退。本轮新坑以 **P1-1（`babyloreFillAll` 恒 `ok:true` 假完成）** 为首——最贴近 Round 6 治理主题却未被根治；其次为测试缺口（P1-2，核心标记路径无拦截）及三项 P2（归表单向漏报、标记文件化、insert 空名行）。建议下轮回填 P1-1/P1-2。
