# novel-forge v1.6.20 修复循环评审 · AI安全合规审查

> 审查视角：樊氏集团董事会「AI安全」Ilya Sutskever
> 议题：v1.6.20 修复循环评审 + 「功能性-更新-检测-开会-修复」循环设计
> 结论：**F1/F3 定性为安全合规阻断项（release blocker），阻断优于补救，未修复前否决 v1.6.20 发布。**

---

## ① 核心诊断

我亲自读了代码，确认材料属实，并定位了泄露的精确路径：

- `schema.prisma:98,125` 定义了 `reviewStatus`（`pending=待确认 / approved=已确认`，自动填表默认写 `pending`）。这是 v1.6.17/18 建立的"待审隔离"信任边界意图。
- `sync-global-prompt.ts:21-22` 的取用端：`characterCard.findMany({ where: { projectId } })` 与 `lorebookEntry.findMany({ where: { projectId, enabled: true } })` **均无任何 `reviewStatus` 过滤**（世界书只筛了 `enabled`）。
- `orchestrator.ts:653-654` 将该 `globalPrompt` 直接拼入生成 prompt 的 `cardContext`，无差别注入每一次正文生成。

**结论：pending 卡确实会进入 generation prompt。** 一个作者尚未确认的自动填表内容，被静默提升为"系统设定"权威上下文参与生成——这正是"未审核内容进入生成 = 越权泄露"。纵深防御在此失效：schema 层装了门框（reviewStatus 意图），sync 取用端却没装门板，单点突破即全线失守。

F3 同源：`outline-context.ts:46`、`game-engine.ts:236-237` 及多个游戏路由的取用端同样漏 `reviewStatus`，等于把同一道缺口在章纲、游戏两条支线又各开了一遍。

F2（update/delete 填表不可精确撤销）是数据丢失风险；F4（大书导出内存峰值）是性能问题，均非阻断项。

## ② 提升框架

以 **纵深防御（defense in depth）** 为原则，信任边界必须有多层闸门，任何一层失效都不能直接触达生成：

1. **取用端过滤**：所有"读卡注入生成"的查询，默认拒绝非 `approved`。
2. **注入端断言**：orchestrator 注入 `globalPrompt` 前，断言其来源不含未确认条目，否则剥离/拒绝。
3. **回归固化**：用测试把边界钉死，防止下一轮循环改动再次撕开口子。

F1/F3 不是普通 bug，是**信任边界违规**，必须按阻断项处理。

## ③ 具体可落地步骤

1. `sync-global-prompt.ts:21-22` 两处 `findMany` 增加 `reviewStatus: "approved"`（角色卡）；世界书若也走待审，则同样加过滤。**仅约 2 行修复。**
2. `orchestrator.ts:654` 注入前加第二层断言：若 `globalPrompt` 检测到非 `approved` 来源则拒绝注入——纵深第二闸。
3. `outline-context.ts:46`、`game-engine.ts:236-237` 取用端补 `reviewStatus` 过滤；并封装统一的 `getApprovedCards()` / `getApprovedLore()` helper，消除多源漂移。
4. 加 vitest 回归：构造一个 `pending` 角色卡，断言 `globalPrompt` 不含其名、断言生成 prompt 的 `cardContext` 不含 → 固化门禁，让"循环评审"落在 CI 而非会议。
5. F2：对 update/delete 类填表引入软删除 + 操作日志 + 撤销栈，本轮排期但不阻断。
6. F4：大书导出改流式/分块，低优先级。

## ④ 风险提示

- "检测→开会→修复"循环若只以**会议**固化，会制造虚假安全感：每轮都"修复"，但下一轮改动可再次引入 pending 泄露。**必须以测试固化，而非以会议固化。**
- pending 卡进入生成不止是数据质量问题，更是**信任越权**：作者未确认内容被当作权威设定输出，且因其静默注入而难以察觉，可能污染正文且作者事后难追溯。
- 循环若让"检测"与"修复"同一主体执行（自我检测），会退化为自证清白；检测独立性（外部回归）是循环成立的前提。

## ⑤ 与其他职能的张力

- **vs Karpathy「系统化治理」**：我完全赞同系统化——把合规写进 CI/pipeline，而非依赖人工会议。本循环评审若能落到 vitest 回归门禁，正是系统化治理的落地，无张力，只有协同。
- **vs 马斯克「简单优先」**：新增过滤与断言看似增加复杂度。但 F1 修复仅 2 行，真正的复杂度来自"不修"——待审隔离本就是已有 schema 意图，我们只是补上缺失的门板，不引入新抽象。安全过滤若做成"默认拒绝 + 白名单注入"，反而比"默认全量注入再事后清理"更简单、出错面更小。**简单 ≠ 少写代码，简单 = 最小出错面。**

---

**AI安全裁决**：F1/F3 为阻断项，本轮回合必须合入且由回归测试固化；否则否决 v1.6.20 发布。阻断优于补救。
