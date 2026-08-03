# Round 3 诊断报告 —— 墨白（写实悬疑《龙陨之地》项目股东）

> 透镜：写章流程 + 自动填表（灭错名 / 自检 / 防重复 / 归属）
> 方法：只读源码 + 实际 Read 核对行号（非仅凭上轮报告），未改任何 src。
> 区分标记：`【读码确认】`= 已在源码定位证据；`【需运行时验证】`= 仅能从代码推断、需真实 LLM/UI 实证。

---

## ① Round 2 / 历史修复回归核实

### F1 · 写章路由与一键 fill-all 防重复互通 —— 【读码确认】通过，无回归
- `src/core/babylore/loop.ts:180-187` —— `if (babylore.ok && nodeId) { try { markChapterFilled(projectId, nodeId); } ... }`：填表成功且带 nodeId 时标记，**未改动**。
- `src/app/api/generate/write/route.ts:304-312` —— `safeFillAfterWriting({ projectId, content: fullContent, send, nodeOrder, isLatestChapter, nodeId, projectLlmConfig })`，**明确传 nodeId**（第 310 行），**未改动**。
- `src/core/babylore/fill.ts:74-82` —— `export function markChapterFilled` 仍存在并写 `FILLED_PATH`（=`.runtime/babylore-filled.json`）；`babyloreFillAll` 的增量落盘（`:471-474`）与 `markChapterFilled`（`:76-81`）共用同一 `loadFilled/saveFilled`，写入同一文件、同一 Set 语义。
- 判定：**成立，无回归**。三处契约未变；写路的成功标记与 fill-all 跳过共用唯一防重复源。

### F5 · update/delete 大小写归一化 —— 【读码确认】通过（本轮一并复验）
- `src/core/babylore/fill.ts:291`（update `findIndex` `toLowerCase`）、`:307`（delete `filter` `toLowerCase`）仍在，与 insert 去重 `:275` 一致。无回归。

### 增量落盘（磐石 P0，上轮复验项）—— 【读码确认】通过
- `src/core/babylore/fill.ts:461-475` —— 循环体内每章处理后 `filledSet.add(ch.id)` 后立即 `saveFilled(filledMap)`（`:473-474`），非仅循环末写。无回归。

### F2 · 单章填表 warnings 渲染 —— 【读码确认】仍未实现（纯 UI 缺口）
- 后端已返回：`src/app/api/babylore/fill/route.ts:15-16` 直接 `NextResponse.json(res)`，而 `babyloreFill` 的 `FillResult.warnings`（`fill.ts:33,385`）含疑似错名列表。
- 单章结果卡：`src/app/workspace/[projectId]/tables/page.tsx:204-214` 仅渲染 `ok/operations/applied/error/at`，**无任何 `fillResult.warnings` 引用**。
- 对照 fill-all 段 `page.tsx:252-258` 已正确渲染 warnings —— 两处 UI 不一致，与上轮结论一致，**未修**。

### F3 · selfCheckFill 查错表（跨表错填） —— 【读码确认】"全量检索+空值"已真跑，但"错表"未实现
- `selfCheckFill`（`src/core/babylore/fill.ts:495-531`）**非空跑**：① 身份列为空 → `completenessIssues`（`:512-515`）；② 名称值 `>=2` 且 `!corpus.includes(s.toLowerCase())` → `nameIssues`（`:518-521`）。`corpus` 为全项目正文 `join` 小写（`:501`），确为全量检索。
- **但**：无任何"该名称是否属于当前这张表"的跨表归属校验。把「青龙镇」误填进 `treasure` 表（geo 表也有青龙镇）→ corpus 含青龙镇 → 自检判通过，**错表不可见**。
- 测试佐证：`src/core/babylore/fill.selfcheck.test.ts:33-39` 仅注入"正文不存在"的 `幻海市` 断言被检出；**无跨表错填用例**，印证错表检测未落地。
- 判定：本透镜的 F3（错表语义）**未实现**；但其"名称真实性 + 空值完整性"子集已实现且真实有效（非空跑）。

### F6 · 表格网格对告警行标红 —— 【读码确认】仍未实现（纯 UI 缺口）
- `LoreTableGrid`（`page.tsx:353-440`）入参仅 `table/busy/onUpdateCell/onAddRow/onSave`，**无 `flaggedRows`/`issues` 入参**。
- 两处 `<tr>` 渲染（虚拟 `:385-399`、普通 `:416-428`）对每行统一样式，无 `className` 条件。
- 调用处 `page.tsx:311-318` 未传告警集；issues 文字列表 `page.tsx:263-269` 未向网格流转。与上轮一致，**未修**。

---

## ② 仍待修 / 新发现问题

### 仍待修（上轮遗留，本轮确认未动）
- **F2 · P1 · 单章 warnings 丢弃【纯逻辑/纯 UI 可立即修】**：后端已返回字段，UI 照搬 `page.tsx:252-258` 的渲染即可，零后端改动，性价比最高。
- **F3 · P1 · 错表不可检【纯逻辑可立即修】**：仅在 `selfCheckFill`（`fill.ts:495-531`）内增"跨表身份索引 + 归属校验"（上轮已给伪码），产出 issues 已由 `page.tsx:263-269` 文字渲染，**无需 UI 改动**；需补一条跨表错填单测。
- **F6 · P1 · 行标红【纯 UI 可立即修】**：给 `LoreTableGrid` 加 `flaggedRows?: Set<string>` prop + `<tr>` 条件类，调用处 `page.tsx:312` 传 `flagged.get(t.name)`。纯前端。

### 新发现的写作闭环漏洞
- **F8 · P1 · 写章自动填表默认被大幅削弱【需产品决策 + 逻辑可改默认，但需 UI 提示】**：`safeFillAfterWriting` 默认 `skipLatestChapter=true`（`loop.ts:125`）+ 频率 `freq=3`（`loop.ts:124`）。后果：最新章**永远不自动填**（`:127-130` 直接返回 ok:false），且只有"章序号+1 整除 3"的非最新章才填。即默认下绝大多数写出的章节**不进表**，与 `loop.ts:141` 注释"生成一章即自动填表闭环成立"相矛盾。闭环承诺在默认配置下实际未兑现。建议：默认 `skipLatestChapter=false` 或 UI 显式提示"最新章待填/本张因频率跳过"，否则用户以为写完即填、实则空跑。
  - 注意：`markChapterFilled` 仅在 `babylore.ok` 时调用（`:181`），被 skip/frequency 跳过时不标记，与 fill-all 不冲突（一致性 OK），**但暴露了"闭环较弱"的认知落差**。
- **F9 · P1 · 写章闭环 warnings 无处呈现【需 UI / 运行时验证】**：写章 SSE `done` 事件已携带 `babylore`（`route.ts:324`），内含 `warnings`；但**写作/生成页是否把该 warnings 渲染给用户未知**（本次仅核 tables 页，未核写作页）。若写作页丢弃，则写章路径的"疑似错名"对用户同样不可见——与 F2 同源缺口。需核 `src/app/workspace/[projectId]` 写作页或生成结果组件。
- **F10 · P2 · buildWarnings 检索切片截断误报【纯逻辑可小修】**：`runFillForText` 传给 LLM 与 `buildWarnings` 的是 `chapterText.slice(0,12000)`（`fill.ts:185`），但自检 `selfCheckFill` 用全量 corpus。若某名称出现在正文 >12000 字之后，`buildWarnings`（`fill.ts:329`）会把它判为"正文中找不到"而误发 warnings（单章路径尤其）。建议 warnings 检索用全文或用 `includes` 的章节原文全量。
- **F4 · P2 · 多表单次 LLM 无表级隔离【纯逻辑，上轮遗留】**：`runFillForText`（`fill.ts:169-246`）把选中表合并一次 fetch，单表坏 JSON 拖累整章。仍现状。

---

## ③ 建议（按性价比）

1. **立即修 F2（纯 UI，零后端）**：照搬 fill-all 的 `page.tsx:252-258` warnings 渲染到 `page.tsx:204-214`；同时把单章卡从二态改为"成功但带告警→琥珀色"，强化可见性。
2. **立即修 F3（纯逻辑）**：在 `selfCheckFill` 加跨表身份索引归属校验（上轮伪码），并补跨表错填单测；其 issues 已由 `page.tsx:263-269` 渲染，无需额外 UI。
3. **立即修 F6（纯 UI）**：`LoreTableGrid` 加 `flaggedRows` prop + 两处 `<tr>` 条件标红，`page.tsx:312` 传 `flagged.get(t.name)`。
4. **F8 需产品拍板**：默认 `skipLatestChapter` 是否翻 false；至少 UI 显式提示"本张因频率/最新章跳过未填"，否则闭环承诺名不副实。
5. **F9 排期核写作页**：确认写章 `done.babylore.warnings` 在写作页渲染，否则写章路径错名告警同样黑洞。
6. **F10 顺手修**：`buildWarnings` 用 `chapterText` 全量（非切片）做 `includes`，消除长章误报。

> 反自欺小结：F1/F5/增量落盘均为【读码确认】通过、无回归；F2/F3(错表)/F6 均为【读码确认】未实现（纯 UI/纯逻辑，可立即修）；F8/F9/F10 为【需运行时验证 / 需产品决策】的新漏洞。本轮未跑集成测试（仅静态读码），F3 是否真正"全量非空跑"已由 `fill.ts:501,518` 与 `fill.selfcheck.test.ts` 的 `幻海市` 用例【读码确认】佐证。
