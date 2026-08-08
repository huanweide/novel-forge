# novel-forge v1.6.20 循环评审 — AI工程主审报告（Karpathy 视角）

> 角色：樊氏集团董事会 AI工程总监 / 代码主审
> 议题：v1.6.20 修复循环评审 + 「功能性→更新→检测→开会→修复」循环设计
> HEAD：v1.6.19 (commit 33cb223) · 已核实代码事实见正文复核

---

## ① 核心诊断

系统健康六维度全绿（TS 零错误、Prisma 同步、API try/catch、无渲染副作用、HTTP 200），这说明工程的**局部质量**是好的。但我主审的视角始终是「整体架构与局部的关系」——局部正确不代表系统正确。本次最关键的失效不是某个 bug，而是一条**架构级约束的落地方式错了**：

「待审隔离」（只取 `reviewStatus:"approved"` 的卡/世界书喂给生成）本应是一条全局不变式，却被实现成**「每个查询点手动加 `reviewStatus`」的散布式约定**。我亲自复核代码，确认同一条规则有至少 5 处实现、其中 3 处漏掉：

- ✅ `context-loader.ts:58,62` —— 正确带 `reviewStatus:"approved"`
- ❌ `sync-global-prompt.ts:21-22` —— 裸查，无过滤（F1）
- ❌ `outline-context.ts:46` —— 裸查，无过滤（F3）
- ❌ `game-engine.ts:236-237` —— 裸查，无过滤（F3）
- ⚠️ `generate/outline/route.ts:31` —— 正确，但另一条章纲路径 `loadOutlineData` 走的是 `outline-context.ts`（漏）

这不是偶发笔误，是**多源漂移（multi-source drift）**：同一语义被手抄 N 份，漏一份就全局污染。F1 尤其严重——`globalPrompt` 是预编译缓存，由 `orchestrator.ts:654` 喂给**每一次生成**，漏过滤等于把所有待审卡/世界书永久注入全部产出。这违背了「单一可信源」原则：我们应该有一个地方定义"什么算可生成用的世界设定"，现在却散落在五个地方，且没有一处是"默认安全"的。

---

## ② 提升框架：把过滤收敛到单一取用层

治理思路不是再补三行 `reviewStatus`，而是**消除失效的根因**。我主张建立「单一取用层（single access layer）」：

- 抽象 `core/context/approvedCards.ts`，导出 `getApprovedCharacters(projectId, take?)` 与 `getApprovedLoreEntries(projectId, {take, enabledOnly})`，**函数内部永远绑定 `reviewStatus:"approved"`（世界书另加 `enabled:true`）**。
- 所有生成/上下文消费点（sync-global-prompt、outline-context、game-engine、各游戏路由、context-loader）强制调用 helper，**删除重复内联查询**。
- 关键洞察：`globalPrompt` 是"预编译单一出口"。只要 `syncGlobalPrompt` 走 helper，所有经 `orchestrator` 读取 `globalPrompt` 的生成路径**天然被治理**——一个改动 fan-out 到全部编排生成。这正是「简洁即可靠」：把 5 个分散查询并成 1 个定义 + N 个调用，漂移面归零。

---

## ③ 具体可落地步骤

1. **建 helper**：`approvedCards.ts` 内置 `reviewStatus:"approved"`，保留 `take` 上限（避免长书搬运全集）。
2. **替换**：`sync-global-prompt.ts`、`outline-context.ts`、`game-engine.ts`、游戏路由、`context-loader.ts` 全部改调 helper，删内联 `findMany`。
3. **F1 单点修复**：`syncGlobalPrompt` 走 helper → 一次改动覆盖所有编排生成路径。
4. **加回归测试**：断言 helper 生成的 `where` 含 `approved`；加 CI grep 断言"生成侧不得出现裸 `findMany` 无 `approved`"，把软约束变成硬门禁。
5. **F2（撤销精确化）**：schema 给 `BabyloreFillBatch` 加 `ops Json`；`applyOps` 抓 `before` 快照；`revertBabyloreFill` 据 `prev` 还原 update 旧值。**不必引入 OT**，快照回放即可，避免"本章 insert 行被后续章 update 后整行误删"。
6. **F4（大书导出）**：`export/route.ts:47-50` 改流式（cursor 游标 + 分块写入），杜绝全量入内存 OOM。
7. **部署顺序**：先合 F1/F3 + helper（2 行级风险极小），F2/F4 独立 PR，本轮不阻塞。

---

## ④ 风险提示

- **缓存一致性窗口**：`globalPrompt` 是存量缓存。修复上线后**必须主动 rebuild 所有项目缓存**，否则旧缓存仍喂待审卡——修复了代码，但线上行为没变。
- **勿砍功能字段**：`context-loader.ts:53-56` 注释已警告：下游消费 `background/aliases/timeline/keys` 等字段，**统一 helper 时勿窄列**，否则"修隔离、断功能"。
- **F2 快照要覆盖两类 op**：`update` 与 `insert` 都必须留 `before`，否则 revert 仍不完整。
- **遗留黄点勿忽视**：fire-and-forget fetch 缺 `.catch`、SSE close 在错误分支未显式关闭——纳入下一轮复验，不阻塞本轮但必须进循环。

---

## ⑤ 与其他职能的张力

**vs 马斯克「能否更简单」**：单一 helper 恰恰是"更少零件"的答案。对方会质疑"合并会不会损失每处精确控制"。我的回应：统一后 `take` 仍可参数化，控制力不丢，但漂移面从 5 降到 1。拒绝收敛、保留 5 份手抄，才是复杂度的来源。

**vs Ilya「安全阻断」**：待审隔离是安全边界。散布式约定本质是"靠人记得加过滤"的软约束，本质不可靠——Ilya 会要求做成**结构性、默认安全**的。helper 的默认值设计正满足这点：`approved` 是默认，要取待审必须显式 opt-in 且打标。这样漏写不会"漏隔离"，而是"漏写的那处根本拿不到数据"（fail-visible）——安全失败（fail-safe）优于悄悄成功（silent pass）。

**结论**：F1/F3 不要散补，要**收敛到单一取用层 + 默认安全的 helper + CI 门禁**。这是把"靠纪律"升级为"靠结构"，符合「单一可信源、可观测可测试、简洁即可靠」的工程哲学。
