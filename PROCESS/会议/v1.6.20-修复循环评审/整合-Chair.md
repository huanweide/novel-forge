# v1.6.20 修复循环评审 · Chair 整合报告（千惠 / tri 主持）

> 会议形式：樊氏 15 人格中 7 个技术/风险/方向相关角色并行写深度报告（马斯克技术主审、Karpathy AI工程主审、Ilya AI安全合规、塔勒布尾部风险、费曼真实性校验、PG 方向判断、乔布斯产品体验），Chair 整合。落盘：`PROCESS/会议/v1.6.20-修复循环评审/` 每角色一篇 + 本整合。
> 本轮额外价值：会议过程中暴露并纠正了一处**工具链假阴性导致的 subagent 误判**（详见第三节），印证「Chair 必须亲自核实、不可轻信 Agent 报告」。

## 一、共识（七份报告高度收敛的部分）

**1. F1/F3（待审隔离泄漏）是 v1.6.20 头号优先级，且必须 CI 固化。**
七位一致认定：v1.6.18 建立的「只取 `reviewStatus:"approved"` 卡注入生成」是一条全局不变式，但它被实现成「每个查询点手动加过滤」的散布式约定，已确认至少 3 处漏口：
- F1（高）：`src/core/sync-global-prompt.ts:21-22` 角色卡/世界书取用端无 `reviewStatus` 过滤，且该缓存经 `orchestrator.ts:654` 注入**每一次生成**——漏口在主生成链路，危害最大。
- F3（中）：`src/core/pipeline/outline-context.ts:46`、`src/core/game/game-engine.ts:236-237` 及多个游戏路由取用端同样漏闸。
Ilya 将其定性为**安全合规阻断项（release blocker）**：未审核的 pending 卡被静默提升为「系统设定」参与生成，是信任越权，阻断优于补救。PG 用「每工程小时的用户可见损害 = 严重度×爆炸半径×是否回归÷修复成本」算出 F1/F3 性价比最高（约 6 行、主路径、回归、零功能损失）。

**2. F2（#6 update/delete 类填表不可精确撤销）是真实数据丢失尾部风险，但非 v1.6.19 回归，应独立立项、克制实现。**
费曼/塔勒布/乔布斯均确认：v1.6.19 的 `revertBabyloreFill` 只删 insert 行，update 旧值未留存（快照拍了却丢弃），且本章 insert 行被后续章节 update 后会整行误删。但 PG 指出：这是**存量缺口**（lorebook 硬删除无 `deletedAt`，schema 无软删），不是本轮新引入；修复需要快照机制而非 2 行，不应塞进 v1.6.20 冲淡主线。

**3. F4（大书导出全量入内存）是脆性但低正确性影响，暂缓进 backlog。**
`export/route.ts:47-50` 一次性 `findMany` 全节点入内存，大书有 OOM 峰值，但输出永远正确。塔勒布认其为规模临界点脆性，主张「有界护栏 + 流式兜底」而非重写；PG 主张无真实大书用户前不预造管道（gold-plating）。

## 二、张力（最有价值的干货）

- **马斯克 vs 乔布斯（F2 范围）**：Musk 主张「复用已拍的 before 快照、零边际成本加冗余、绝不碰 OT」，Jobs 主张「撤销必须彻底——用户看不出这章存在过」，要求字段级溯源（存 `{row_id, 修改前快照}`，撤销时还原旧值而非整行删）。调和：外部感知必须简单（一键撤销），内部复杂度可藏但不能藏到让撤销失效；最小可行解是「复用 beforeRowsById 快照 + 增 `beforeValues` 字段 + update 回滚单测」，而非造通用 undo 中台。
- **马斯克 vs 循环本身（会议是否每轮必需）**：Musk 强烈质疑「对一个 2 行修复（F1）还开投票会」是官僚主义。他主张清晰修复免开会，会议只保留给真有取舍处（如 F2 范围）。这一点我会采纳进循环设计。
- **Ilya vs 「以会议固化」**：Ilya 指出「检测→开会→修复」若只以会议固化，会制造虚假安全感——下一轮改动可再次撕开口子。必须以 vitest 回归门禁固化（如「pending 卡不进 globalPrompt」负向断言），让边界钉在 CI 而非会议。
- **费曼 vs 「已修/循环在转」的自欺**：费曼警告「报告自洽即视为已修」与「会议纪要式空转」——本轮若只再写报告不落代码，就是空转。

## 三、重大纠偏：F1 真实性（工具链假阴性导致的 subagent 误判）

**费曼 subagent 在报告中称「`sync-global-prompt.ts` 全仓 glob 未命中、文件名疑似误标、F1 不能当事实用」——这个结论是错误的。**

Chair 亲自用 Bash grep 复核：
- `src/core/sync-global-prompt.ts` **真实存在**（在 `src/core/` 下），被 5+ 文件 `import` 使用；
- 该文件 `:21-22` 两处 `findMany` 确无 `reviewStatus` 过滤（与 Explore-1 断言逐字一致）；
- `orchestrator.ts:654` 确把 `project.globalPrompt`（未过滤缓存）读入生成。

**根因**：本仓库的 Grep/Glob 工具（即便指定绝对路径 + `glob: src/**/*.{ts,tsx}`）返回**假阴性**——`reviewStatus` 在 src 实际出现 113 次，工具却报「No matches」；`sync-global-prompt.ts` 实际存在，工具却报「No files found」。费曼 subagent 同样受此工具缺陷影响，基于错误的「文件不存在」得出错误推翻。

**教训（写入工程铁律）**：在本仓库验证必须用 Bash `grep`/`sed`/`Read`，**不可轻信 Grep/Glob 工具的零匹配结果**。Chair 对 Agent 报告一律 Trust but verify——本轮正是这一步抓出了 subagent 的误判，避免了 v1.6.20 漏修高危的待审隔离泄漏。

## 四、v1.6.20 决策（Chair 裁定）

1. **v1.6.20 范围 = F1 + F3（待审隔离收口）**：在 `sync-global-prompt.ts:21-22`、`outline-context.ts:46`、`game-engine.ts:236-237` 三处取用端补 `reviewStatus:"approved"`（世界书另带 `enabled:true`）。总计约 6 行，恢复三处生成路径隔离。
2. **加负向回归测试（永久门禁）**：构造一张 pending 角色卡，断言它不出现在 `globalPrompt` / 大纲 / 游戏上下文；并在 CI 加 grep 软断言「生成侧取用不得出现裸 `findMany` 无 `approved`」。把 Ilya 的「阻断」钉进测试而非会议。
3. **F2 独立立项（最小快照）**：给 `BabyloreFillBatch` 加 `beforeValues` 字段，`babyloreFill` 落库时写入被本 node update 行的旧值，`revertBabyloreFill` 改为「先还原 update 旧值、再删 insert 行」，并补**针对 update 回滚的单测**（当前 `fill.revert.test.ts` 零 update 覆盖）。明确不做 OT。
4. **F4 暂缓**至真实大书用户报告 OOM 再动手（游标分页 + 流式写出）。
5. **不膨胀**：F1/F3 就是 6 行过滤，修完即走；不借机搞「待审隔离重构 v2」（PG 反对 gold-plating）。`getApprovedCards` helper 收敛作为低风险 fast-follow 评估，不在 v1.6.20 强做。

## 五、循环设计定稿（功能性→更新→检测→开会→修复→循环）

会议确认这套循环是正确节奏，但按 Musk/费曼/Ilya 的意见做三处修正，避免空转与官僚主义：

1. **会议仅用于真取舍**：清晰修复（如 F1 的 6 行）免开会，直接进检测→修复；会议只保留给 F2 这类有范围取舍的议题。
2. **验证必须是代码级**：每轮复验判据 = 「测试通过 + 人工读关键函数」，**不是「又开了一场会/又写了一份报告」**。本次费曼的「F1 文件不存在」误判警示：Agent 的侦察结论必须 Chair 用可靠工具复核。
3. **补语义级负向门禁防「盲」**：当前循环的检测（tsc/vitest/HTTP）对 F2 这类「低频静默丢数据」结构性看不见（马斯克/塔勒布指出「无🔴」是 metric 幻觉）。必须把「撤销精确还原」「pending 卡不进生成」做成永久回归测试，让循环能看见 happy path 之外的尾部。

**结论**：v1.6.20 = F1+F3 收口待审隔离 + 负向测试固化；F2 用最小快照堵数据丢失尾部、独立排期；F4 暂缓。循环继续转，但每次只产出一个 verified fix，且会议只开在真有取舍处。
