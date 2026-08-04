# 墨白透镜 · Round 9 只读复验报告（v0.46.71 / Round 8）

- 复验角色：墨白（透镜 = 填表 / 防重复 / 归属）
- 复验性质：只读；未修改任何源码，仅产出本报告
- 复验对象：`src/core/babylore/fill.ts`（673 行）、`src/core/babylore/loop.ts`、`fill.ops.test.ts`、`fill.selfcheck.test.ts` 及 tables 页 UI
- 配套提交：`bb2b86a`（Round 8 实现）、`8c82195`（Round 8 记忆回写）

---

## 回归验证

R8 对墨白透镜的核心修复是「填表假完成」：把 `babyloreFillAll` 的**全跳过分支**由 `ok:true` 改为 `ok:false` 带 error 摘要，门槛与 Round6 的 `ok && applied>0` 对齐。逐条确认如下。

### R8-1 全跳过确实返 `ok:false` 且带 error 摘要 —— ✓ 通过
`src/core/babylore/fill.ts:533-538`：
```ts
} else if (processed === 0 && skipped > 0) {
  ok = false;
  error = `全部 ${skipped} 个章节被跳过（已填标记存在但本次无事实落地 applied=0）：可能是旧版误标脏标记或数据缺失，请核对已填标记真实性后再重试`;
}
```
- 触发条件精确为 `processed===0 && skipped>0`（真正"一章都没填、全被跳过"），与 Round6 完成门槛 `ok && applied>0` 同义延伸，灭「UI 显示成功其实全跳过」。
- error 明确写出 `applied=0` 与「已填标记存在」，足以让上游知会用户"本轮没落地任何事实"。**确认修复落地，无回退。**

### R8-2 error 摘要能否区分「真的无脏数据」与「疑似旧版误标」—— ✗ 不能（见新发现 P1-A）
当前 error 是**单一模板文案**，无法区分两种语义：
- "真已填完成"：用户曾成功填完（每章 `applied>0` 已标记），重跑时全部跳过 → 数据本就完整；
- "旧版误标脏标记"：Round6 前旧版把失败/空章也标已填 → 数据缺失。
`.runtime/babylore-filled.json`（`fill.ts:62-83`）只存 `nodeId` 集合，**不记录该章当时是否真的 `applied>0`**，因此运行期无任何信息可区分二者。R8-1 的修复是正确的方向，但 error 无法区分，导致"真干净"的项目也被吓成"脏标记"——修复不完整。详见 P1-A。

### R8-3 正常「部分成功」（`applied>0`）仍返 `ok:true` —— ✓ 通过
`fill.ts:527-545` 的 `else { ok=true }` 分支：只要 `processed>0 && failedChapters===0 && applied>0` 即 `ok:true`。混入若干"正常单条跳过"（`skipped>0` 但仍有章节成功）不会触发任何失败分支，仍判成功。对照测试 `fill.ops.test.ts:95-101`（正常 insert → `ok:true, applied:1`）通过。**确认未过度收紧。**

### R8-4 正常单条跳过 与 全跳过 不混淆 —— ✓ 通过
- 单章跳过在循环内处理：`fill.ts:499-503`（`if filledSet.has(ch.id) { skipped++; continue }`），不影响 `ok`。
- 全跳过分支有独立守卫 `processed===0 && skipped>0`（`fill.ts:533`），仅当"零处理 + 有跳过"才命中。单章项目被跳过（只有一章且已填）会正确归类为全跳过，不会误判为部分成功。
- 混合场景（部分跳过 + 部分成功）走 `else ok=true`，互不串扰。**确认未混淆。**

### R8-5 测试配套 —— ✓ 通过（计数说明）
- `fill.ops.test.ts` 旧「全跳过→ok:true」用例已改为断言 `ok:false` 且 `error` 含「跳过」「脏标记」（`fill.ops.test.ts:168-179`）。
- 任务所述"13 passed" = `fill.selfcheck.test.ts`(6) + `fill.ops.test.ts`(7) 之和（babylore 填表测试合集），非单文件 13 例；单文件 ops 实为 7 例。断言方向正确、可复跑。

---

## 新发现问题

> 严重度：P0 / P1 / P2；标注「Round8 回归」= R8 修复直接引入或暴露；「延续」= 前轮已报、本轮仍存在。

### P1-A（Round8 回归）全跳过 error 无法区分「真已填完成」与「旧版脏标」
- 文件:行号：`src/core/babylore/fill.ts:533-538` + `fill.ts:62-83`
- 问题：R8-1 让全跳过返回 `ok:false`，但文案统一为"疑似旧版误标脏标记"。对**数据本就完整**的项目，重跑 fill-all 必落入此分支 → 永远 `ok:false` + "脏标记"告警，用户拿不到"已填完"的干净信号，也无法区分"该重试"与"没事"。这是 R8 修复的**过冲**，与任务"error 摘要能区分真无脏数据 vs 疑似旧版误标"直接相悖。
- 建议方向：在 `.runtime/babylore-filled.json` 的每章标记附元数据（如 `{ nodeId, applied, ts }`），fill-all 全跳过时据 `applied>0` 比例区分"全章曾真实落地 → 报 ok:true 并提示'已全部填完'"与"存在 applied=0 的脏标记 → ok:false 提示复核"；或新增 `verify` 模式仅做已填标记真实性对账、不改写。

### P1-B 单章填表不跑 cross-table / 归属校验，跨表同名校验仅 fill-all 末态触发
- 文件:行号：`src/core/babylore/fill.ts:368-422`（`babyloreFill` 无 selfCheck 调用） vs `fill.ts:522`（`selfCheckFill` 仅 `babyloreFillAll` 末态调用）
- 问题：写章自动填表走 `safeFillAfterWriting → babyloreFill`（`loop.ts:106-193`），此路径**完全不调用 `selfCheckFill`**。跨表同名 / 归表错误检测只在用户手动跑"一键填表"末尾才发生。若用户主要用自动填表、从不跑 fill-all，则"人物写进地点表"等归属错乱**长期不被发现**。且 selfCheck 是**事后检测非拦截**，填错已经发生。
- 建议方向：在 `babyloreFill` 落库前对本章 `appliedNames` 做轻量 cross-table 检查（复用 `valueTables` 逻辑），命中疑似归表错误时即便 `applied>0` 也附强告警并返回 `warnings`；UI 单章填表结果（tables 页 `fillResult.warnings`）已能呈现，无需改 UI。

### P1-C 批量填表单条 op 失败"软静默丢数据"
- 文件:行号：`src/core/babylore/fill.ts:234-252`（`ok = applied>0`）、`fill.ts:303-341`（单 op 失败仅 `warnings.push` + continue）、`fill.ts:511-519`（章级以 `r.ok` 判 filled）
- 问题：一章内若 9/10 个 op 落地、1 个 op 因"update 缺 match 列 / delete 缺列"等被跳过，则 `applied=9>0` → 该章 `ok:true` → 被 `markChapterFilled` 永久标记为已填。**失败的那 1 个 op 仅进 warnings、永不重试、数据丢失**。该 op 的 warning 虽在 UI 展示，但章已"完成"，用户无机制补填。
- 建议方向：引入章内"部分失败"标志——`runFillForText` 返回 `partialFailures` 计数；当 `partialFailures>0` 时即便 `applied>0` 也不标记 filled（或标记但置 `needsRetry`），使单 op 失败可重跑；或在 `babyloreFillAll` 汇总 `partialFailures` 计入 `failedChapters`。

### P1-D 防重复脏标记无清除/重置出口，全跳过改 `ok:false` 后成死循环
- 文件:行号：`src/core/babylore/fill.ts:62-83`（`.runtime` JSON，仅 `markChapterFilled` 写，无 unmark/clear）、`fill.ts:489-519`（只读不重置）
- 问题：R8 让全跳过报 `ok:false` 后，用户若想重填（schema 变更、用 selfCheck 修正后重抽）却**没有任何 API/UI 清标记**——只能手动删 `.runtime/babylore-filled.json`（丢失全部进度、整轮重跑，昂贵）。且无"强制重填"接口。标记为本地 JSON 非 DB，也不随项目导入/迁移。用户一旦见"脏标记"，陷入"重试→仍跳过→仍 ok:false"死循环，无出口。
- 建议方向：新增 `babyloreResetFilled(projectId, nodeId?)` 导出函数 + `/api/babylore/reset-filled` 路由，支持"清单章 / 清全项目"；UI 在 fill-all 结果区提供"清除已填标记并重填"按钮。标记可酌情迁 DB（`ProjectFilledMark` 表）以便备份与多端一致。

### P1-E 行级同形/同名合并（homonym merge）—— 两个不同实体被静默并为一行
- 文件:行号：`src/core/babylore/fill.ts:283-298`（insert 按大小写不敏感名称去重转 update）、`fill.ts:307-325`（update 按名称命中即改同 Row）
- 问题：去重键是"名称列大小写不敏感相等"，**未校验是否同一实体**。若正文先后出现两个不同角色却同名（小说常见：同名配角、父子同名、化名），后填的章节会把前者的行直接覆盖/合并，造成**归属错乱 + 历史事实丢失**。而 `selfCheckFill` 只报**跨表**同名（`fill.ts:631-664`），**表内同名合并完全不报警**——错误被"去重"悄悄消化。
- 建议方向：`insert`/`update` 去重命中时，若待写字段与已有行存在**非空冲突**（而非单纯补全），视为"疑似同名异体"，转为新建行（带区分后缀）或强告警而非静默覆盖；selfCheck 增补"表内同名多行 merge 风险"检测。

### P1-F 填表结果不可回溯（无版本 / 无审计 / 无来源章节）
- 文件:行号：`src/core/babylore/fill.ts:343`（`prisma.loreTable.update` 整体覆盖 `rows` 数组）
- 问题：LoreTable 行**无版本号、无修改时间戳、无来源 `nodeId`、无操作人/来源 LLM**。applyOps 每章把整张 `rows` 数组覆盖写回。一旦出现错填/误合并（见 P1-E）或 LLM 抽错，既无法定位"哪章引入"，也无法回滚到上一章状态。这与墨白"防重复 / 归属"透镜直接冲突：防重复靠标记、但错填后无锚点可纠。
- 建议方向：每行增 `createdFromNodeId` / `updatedAt`；或在 `loreTable` 加 `rowsHistory`（最近 N 版快照），fill 前 push 快照，支持 UI"撤销本次填表"；至少把来源章节写回行，便于 selfCheck 与人工复核。

### P2-1（延续）`delete` 大小写不敏感全量删除同名行，可能误删
- 文件:行号：`src/core/babylore/fill.ts:337`
- 问题：`filter` 会清除全部同名行而非仅一条；若表内因去重失效残留多同名行，一次 delete 清空全部。延续 Round8 P2-3。
- 建议方向：仅移除首个匹配行（findIndex + splice）。

### P2-2（延续）`crossTableIssues` 计数与 `issues` 条目数口径不一致
- 文件:行号：`src/core/babylore/fill.ts:631-639`
- 问题：每值 `crossTableIssues+1`，但 `issues` 对该值出现的每个表各 push 一条（`distinct.length` 条），UI 若按 `issues.length` 计数会翻倍。延续 Round8 P2-1。
- 建议方向：统一按"值"计，或文档明示 `issues` 含每表重复条目。

### P2-3（延续）`applied===0` 分支为不可达死代码
- 文件:行号：`src/core/babylore/fill.ts:542-545`
- 问题：`processed>0` 时 `failedChapters>0` 已在 `:539` 先行返回；`failedChapters===0` 必 `applied>0`，故 `:542` 永不触发。延续 Round8 P2-2。
- 建议方向：删除死分支或注释明示"失败已由 `failedChapters>0` 兜底"。

### P2-4（延续）`insert` 缺身份列仍建空名行，与 update 守卫不对称
- 文件:行号：`src/core/babylore/fill.ts:279-296`
- 问题：update/delete 已加"缺 match 列则跳过"守卫，但 insert 在 `newVal==null` 时仍 `rows.push({row_id,...})` 建空名行，污染身份列。延续 Round8 P2-4。
- 建议方向：insert 身份列缺值时跳过并告警（与 update 对称）。

### P2-5 单章填表对"人物写进 geo 表"无即时拦截
- 文件:行号：`src/core/babylore/fill.ts:617-664`（归表错误检测在 selfCheck，非填表入口）
- 问题：见 P1-B 延伸——LLM 把人物 insert 进 `geo` 类表时，单章路径无拦截，依赖末态 selfCheck 才发现。
- 建议方向：与 P1-B 一并，在 `babyloreFill` 落库前做类别-值冲突轻量校验。

---

## 结论

**墨白透镜在 v0.46.71 下是否还有 P0 / P1？**

- **P0：无。** Round6/7/8 已根治"空章静默丢数据""空 ops 假完成""全跳过假完成""幂等/防重复"等 P0 家族，本轮复验未新发现 P0。
- **P1：有，共 6 项，需在 Round 9 收口：**
  - `P1-A`（Round8 回归）全跳过 error 无法区分"真已填完成 / 旧版脏标"——R8 修复过冲；
  - `P1-B` 单章填表不跑 cross-table/归属校验；
  - `P1-C` 批量填表单条 op 失败软静默丢数据；
  - `P1-D` 脏标记无清除出口、改 ok:false 后成死循环；
  - `P1-E` 行级同名静默合并（homonym merge）归属错乱；
  - `P1-F` 填表结果不可回溯（无版本/审计/来源章节）。
- **P2：5 项**（P2-1~P2-5，多为前轮延续的技术债）。

**回归验证总评**：R8-1~R8-4 全部通过（`ok:false` 落地、部分成功仍 `ok:true`、单条/全跳过不混淆、测试已改向），Round6 门槛零回退。但 R8-1 的修复**本身遗留 P1-A**（无法区分真完成与脏标），属"修了一半"；且本次新挖的 P1-B~P1-F 暴露墨白透镜在「归属」（P1-B/E/F）、「防重复」（P1-C/D）、「填表可靠性」（P1-A/C）三个维度仍有实质缺口。**建议 Round 9 优先级：P1-A（补区分能力）→ P1-D（给清标记出口）→ P1-E（防同名合并）→ P1-C（单 op 失败可重填）→ P1-B/F（单章校验 + 审计溯源）。**
