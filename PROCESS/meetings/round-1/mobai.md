# Round 1 体验报告 —— 墨白（写实悬疑《龙陨之地》项目股东）

> 透镜：写章流程 + 自动填表（灭错名 / 自检 / 防重复 / 归属）
> 方法：只读源码 + 跑测试 + 对照 CHANGELOG/WORK_REPORT v0.46.63，未改任何 src。
> 测试：`fill.selfcheck.test.ts` 2/2 通过、`match.test.ts` 12/12 通过（共 14/14 绿）。

## 总览结论
v0.46.63 的"灭错名三件套"（全量权威名录 + STRICT 提示词 + applyOps 同名转 update）方向正确，历史"空正文静默 done"bug 已在 write/route.ts:294 用显式 error 修掉。但**自动填表闭环在"两路去重不互通""错表不可检""UI 告警丢失"三处存在真实缺口**，与本版本承诺的"防重复 / 自检 / 用户可见"不符。

---

## 发现清单

### F1 · P1 · 写章路由与一键填表路由防重复机制不互通
- 位置：`src/core/babylore/loop.ts:102-179`（`safeFillAfterWriting` 全程未调用 `saveFilled`）；`src/core/babylore/fill.ts:452-454`（`saveFilled` 仅 `babyloreFillAll` 使用）；`src/app/api/generate/write/route.ts:304`（写章调 `safeFillAfterWriting`）。
- 问题：防重复标记 `.runtime/babylore-filled.json` 只有 `babyloreFillAll`（fill-all 路由）在维护，写章路由的自动填表从不写入该标记。结果：用户写完若干章（write 自动填过）→ 再点"一键填表"，fill-all 会**重新处理已被写路由填过的章节**，违背 CHANGELOG 承诺的"已填章节自动跳过防重复"，浪费 token 且可能用新值覆盖旧行。
- 预期 vs 实际：CHANGELOG v0.46.63 宣称"两路闭合防重复"；实际只有单路记录，写路不参与去重契约。
- 建议：让 `safeFillAfterWriting` 在成功填表后也 `saveFilled(projectId, nodeId)`（复用 fill.ts 的导出），使 fill-all 真正跳过；或在 fill-all 启动前先扫描"已被写路填过"的章节。

### F2 · P1 · 单章自动填表 UI 完全丢掉 warnings（错名告警不可见）
- 位置：`src/app/workspace/[projectId]/tables/page.tsx:204-214`（`fillResult` 渲染段）。
- 问题：`runFill` 的回填卡片只展示 `ok / operations / applied / error`，**从未渲染 `fillResult.warnings`**。`babyloreFill` 返回的"疑似错误地名"警告在单章填表场景被彻底丢弃——用户粘贴一章正文点"运行自动填表"后，即使填出了正文不存在的名字，也毫无提示。
- 预期 vs 实际：fill-all 段（page.tsx:252-258）有 warnings 列表展示，但单章填表段遗漏；两处 UI 一致性缺失。
- 建议：在 `fillResult` 卡片内照搬 fill-all 的 warnings 渲染逻辑（`fillResult.warnings?.length>0` 列表）。

### F3 · P1 · selfCheckFill 无法检出"错表"类错名（把 A 地填进 B 地表）
- 位置：`src/core/babylore/fill.ts:474-510`（`selfCheckFill` 逻辑）；`src/core/babylore/fill.selfcheck.test.ts:1-46`（测试仅注入"正文不存在"的名字）。
- 问题：`selfCheckFill` 只做两件事：① 身份列是否为空；② 名称值能否在**全正文 corpus** 里 `includes` 到。它**不校验该名称是否属于当前这张表**。把"青龙镇"误填进 `treasure`（宝物）表、而正文里"青龙镇"确实存在于 geo 上下文，自检会判定"名字在正文里=通过"，错表完全不可见。
- 预期 vs 实际：WORK_REPORT 自称"自检地名正确性"，但"正确性"仅指"名字是否真实存在"，不含"归属是否正确表"。测试也未覆盖跨表错填。
- 建议：自检增加"跨表归属校验"——若某名称在它表（如 geo）身份列出现、却在当前表（如 treasure）被当作宝物名，则标红为"疑似错表"。

### F4 · P2 · 多表填充无失败隔离（一次 LLM 调用拖累所有表）
- 位置：`src/core/babylore/fill.ts:158-226`（`runFillForText`：`buildTablesText(filteredTables)` 把选中所有表合成一个 prompt，单次 `fetch`）。
- 问题：geo/treasure/faction 全部塞进同一次 LLM 调用。若该次调用超时或 JSON 解析失败（3 次重试仍败），返回 `ok:false`，**该章三张表全部落空**，互相拖累；仅做到"章节级"隔离，无"表级"隔离。
- 预期 vs 实际：用户问"一张表 LLM 失败是否拖累其它表"——现状是会拖累同章其它表。
- 建议：至少把"该章失败"与"其它章"隔离（已满足）；进一步可在单次调用失败时，对该章按表拆分重试，避免单表坏 JSON 拖垮整章。

### F5 · P2 · applyOps 的 update match 大小写敏感不一致 + 未命中静默转 insert
- 位置：`src/core/babylore/fill.ts:268-281`（update 分支）。
- 问题：insert 去重用 `toLowerCase()`（255 行）匹配，而 update 的 `match` 用 `String(r[col]) === String(val)` **大小写敏感**（270 行）；且当 match 未命中（idx<0）时**静默 `push` 一条新行**（277-281），可与已存在行（仅大小写/繁简差异）产生重复。这与 v0.46.63 主打的"杜绝同名重复行"自相矛盾。
- 预期 vs 实际：灭重复逻辑在 insert 路径生效，update 路径存在缝隙。
- 建议：update 的 match 也做大小写/繁简归一化；未命中时应先按归一化身份列查重，确属新名才 insert，否则视为更新目标行。

### F6 · P2 · 自检报告有文字列表，但表格网格不对命中行标红
- 位置：`src/app/workspace/[projectId]/tables/page.tsx:263-269`（issues 文字列表）+ `:353-440`（`LoreTableGrid` 渲染无高亮）。
- 问题：一键填表自检结果以纯文字列表呈现（`表「X」行Y：…—疑似错误地名`），但展开编辑的表格网格对所有行**一视同仁渲染，无任何标红/高亮**。用户无法直接看到"哪几行被告警"，只能凭 row_id 手动比对。
- 预期 vs 实际：用户诉求"能否看到哪几行被标红"——当前不能。
- 建议：把 `selfCheck.issues` 的 `row` 收集成 Set 传入 `LoreTableGrid`，对命中行加红色边框/背景。

### F7 · P2 · 写章路由默认不填最新章，"写后自动填表闭合"对最新章不发生
- 位置：`src/core/babylore/loop.ts:120-135`（默认 `freq=3` + `skipLatestChapter=true`）。
- 问题：写章自动填表默认每 3 章一次且跳过最新章（防重 roll）。这意味着刚写完的最新章事实**默认不会进表**，必须用户手动跑一键填表——但该一键填表又与写路去重不互通（见 F1）。两件套叠加，新手极易"以为写章已自动填表，其实最新章没填"。
- 预期 vs 实际：CHANGELOG 把"写章→填表→召回→正文"称为闭环，但最新章默认断开闭环。
- 建议：在写章 UI 明确提示"最新章待填，请跑一键填表"；或将 skipLatest 默认改为 false 并提供"重 roll 后清理"机制。

---

## 已验证无问题（正向）
- 空正文不再静默 done：`write/route.ts:294` 在填表前显式 `error` 并返回，历史 bug 已修。
- 单测：`match.test` 12/12 证明"林"不再误命中"森林"；`fill.selfcheck.test` 2/2 证明"注入正文不存在的幻海市"能被标红。
- applyOps insert 同名转 update（fill.ts:250-267）确实抑制同章内同名重复行。

## 优先级排序（建议本轮修）
P1：F1（去重互通）→ F2（单章告警丢失）→ F3（错表不可检）
P2：F5（update 缝隙）→ F6（行标红）→ F4（表级隔离）→ F7（闭环提示）
