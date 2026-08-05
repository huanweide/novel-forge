# Novel Forge 深度审计 · 数据一致性与迁移透镜（Round-14）

> - **Agent 代号 / 透镜职责**：lens-data ／「数据一致性与迁移」只读审计员
> - **审计对象**：Novel Forge（小说工坊）HEAD=v1.0.2（commit 918c7d7）；工作副本 `C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`；PostgreSQL 127.0.0.1:5432
> - **技术栈**：Next.js 16 + React 19 + Prisma 7 + PostgreSQL 17
> - **日期**：2026-08-06
> - **审计约束**：只读。仅读取 schema 与源码、运行 `npx prisma validate`（结果：`The schema ... is valid 🚀`），未修改任何代码、未手动改动数据库。
> - **聚焦口径**：Prisma 字段约束 vs 代码假设、软删过滤、导入导出 round-trip 字段对应、孤儿数据、并发写原子性、历史 IMP-001/软删/导入去重闭环。

---

## 一、摘要

本轮对「数据一致性与迁移」做了静态代码 + schema 交叉审计，并结合 round-1~4 历史报告复核了 IMP-001（游戏 originalContentSnapshot）、软删、导入幂等三处历史债务是否真闭环。

**结论概览**
- 历史 IMP-001（游戏原正文快照）**已确证闭环**，复导出堆叠路径已消除。
- 软删机制**主体落地正确**（列表过滤 + 子表 Cascade），但残留一处与导入幂等的交互坑（F5）。
- 导入去重**主体闭环**（含 IMP-014 forceNew 逃生口），IO-08 已解决。
- **本轮新发现必须修的问题 3 项（P1）**：
  - **F1（P1）**：`.nfproject` 备份包 round-trip 静默丢失 6 类数据（中期记忆/长期记忆索引/伏笔追踪/待兑现事项/版本历史/游戏进度）。
  - **F2（P1）**：markdown 回灌角色卡的关系字段键不一致（`targetCharacterId` vs `targetName`），导致经 `/api/parse-settings` 导入的角色关系在世界书注入里渲染成 `?(?)`。
  - **F3（P1）**：`import/commit` 事务缺超时参数（历史 IO-02 未闭环），大书导入可能触发 5s 默认超时 → 整段回滚、章节零写入。
- **P2 共 3 项**：节点删除孤儿数据（F4）、软删+导入幂等交互（F5）、游戏并发写丢失更新（F6）。
- 观察池 4 项（含历史 IO-01 文件名乱码、IO-03 迁移脚本工程化等仍未闭环）。

**必须修（P0/P1）计数：3 条 P1。**
**未发现编造问题；凡无明证的均归入观察池或标注「未发现」。**

---

## 二、逐条发现

### F1 · P1 · 备份包 round-trip 静默丢失 6 类数据
- **证据**
  - `prisma/schema.prisma:234-251`（ChapterSummary）、`:299-312`（StoryBeat）、`:255-295`（PendingCommitment）、`:527-547`（PendingItem）、`:195-210`（StoryNodeRevision）、`:349-371`（GameSession/GameState）均为独立 model，且都挂在 Project 下。
  - `src/app/api/projects/[id]/backup/route.ts:7-16` 的 `INCLUDE` 仅含 8 张表：`characters / lorebookEntries / storyNodes / storyBranches / storylines / styleCards / loreTables / rules`。**未包含** ChapterSummary、StoryBeat、PendingCommitment、PendingItem、StoryNodeRevision、GameSession/GameState。
  - `src/app/api/projects/import/route.ts:200-231` 还原分支只重建上述 8 类，无任何对缺失 6 类的读取或重建。
- **影响**：`.nfproject` 备份→导入后，以下数据**静默不可逆丢失**：
  - `ChapterSummary`（中期记忆 / 章节压缩摘要）——AI 派生、重建成本高；
  - `StoryBeat`（长期记忆索引）——AI 派生；
  - `PendingCommitment`（伏笔/承诺追踪状态机）——部分用户维护；
  - `PendingItem`（待兑现事项）——**用户手填内容**，纯数据丢失无补偿；
  - `StoryNodeRevision`（正文版本快照/回滚点）——版本历史丢失；
  - `GameSession/GameState`（游戏进度与背包/实体快照）——游戏进度丢失。
  对一本已写过数十章、玩过游戏、维护过伏笔表的项目，备份还原后「记忆层」与「用户追踪层」整体蒸发，直接削弱后续生成连贯性。尤其 `PendingItem` 为用户手填，无任何重算来源。
- **严重度**：P1（数据不可逆丢失；备份=数据生命线，此路径破坏「确定可用」承诺）。
- **修复方向**：在备份 `INCLUDE` 与导入还原中补齐这 6 类；或至少在导出回执/导入回执显式声明「不含游戏进度/版本历史/记忆摘要」，避免静默。

### F2 · P1 · markdown 回灌角色卡关系字段键不一致（targetCharacterId vs targetName）
- **证据**
  - `src/core/settings/parser.ts:367-372`（`toCharacterCreateParams`）将关系写成：
    ```ts
    relationships: char.relations.map((r) => ({
      targetCharacterId: r.target,   // 注意：此处实际存的是“名字”，并非真正的 id
      relation: r.relation,
      dynamic: "",
      notes: "",
    }))
    ```
  - 规范消费端 `src/core/sync-global-prompt.ts:128-130`：
    ```ts
    const relText = c.relationships.map((r: any) =>
      `${r.targetName || "?"}(${r.relation || "?"}${r.dynamic ? `·${r.dynamic}` : ""})`)
    ```
    即当 `targetName` 缺失时渲染为 `?(?)`。
  - 全局正则归一 `src/lib/relations.ts:13-21`（`normalizeRelationships`）只认 `targetName ?? target`，**不认 `targetCharacterId`**；而角色卡编辑/关系图写入端（`src/components/workspace/AIChatBar.tsx:97`、`src/app/api/agent/analyze-relationships/route.ts:173`）均使用 `targetName`。
- **影响**：经 `/api/parse-settings`（mode=all / characters / lorebook）从 markdown 文本导入的角色卡，其 `relationships` 数组键为 `targetCharacterId`（值还是名字），与系统其余部分约定的 `targetName` 不一致。后果：
  1. `sync-global-prompt` 注入世界书时把这些关系渲染成 `?(?)`，角色关系在 prompt 中**失效**（影响生成质量，静默）；
  2. 若该项目后续被备份再导入，`normalizeRelationships` 会把这些关系 normalize 成空 `targetName`（因 `targetCharacterId` 未被识别），关系彻底灭失。
  所有 markdown 批量导入的角色都受影响，属「导入即污染」的数据一致性缺陷。
- **严重度**：P1（静默破坏角色关系在世界书/全局提示中的注入；且经备份放大为关系丢失）。
- **修复方向**：`toCharacterCreateParams` 统一输出 `{ targetName: r.target, relation, dynamic, notes }`，与 `normalizeRelationships` / `AIChatBar` 一致；对现存脏数据可加一次性归一脚本。

### F3 · P1 · import/commit 事务缺超时（历史 IO-02 未闭环）
- **证据**
  - `src/app/api/import/commit/route.ts:571` 调用 `await prisma.$transaction(async (tx) => {`（事务体一直延伸到约 `:690` 闭合），**无第二参数 `{ timeout }`**。全文件 grep `timeout` 仅命中 LLM abort 计时器（:104/125/152），事务处未见超时放开。
  - 同仓对照：`src/app/api/projects/import/route.ts:234` 明确传 `{ timeout: 120000 }`。
  - 事务体内为逐行 `tx.storyNode.create` 串行循环（章节落库），大书（数百章）极易超过 Prisma 交互式事务默认 **5s** 上限。
- **影响**：一旦超过 5s，Prisma 抛事务超时异常，**整个事务回滚**——用户此前几分钟的 AI 解析+合并结果作废，章节零写入。前端拿到 `type:"error"` 或空结果，「导入失败」而非「导入了一部分」。对大长篇这是高概率的静默数据事故，直接命中本透镜关注的「导入后关联/数据是否完整」。
- **严重度**：P1（大导入静默回滚，破坏数据一致性；历史 IO-02 经 round-1 已指出却未在 HEAD 闭环）。
- **修复方向**：在 `:571` 事务调用补 `{ timeout: 120000 }`（与 `projects/import` 一致），并考虑章节 `createMany` 批处理降低写次数。

### F4 · P2 · 节点删除遗留孤儿数据（ChapterSummary / StoryBeat / PendingCommitment）
- **证据**
  - `src/app/api/story/nodes/[id]/route.ts:268-312` 的 `DELETE`：删除目标节点 + `parentId:id` 子节点（`deleteMany`），但对 `ChapterSummary`、`StoryBeat`、`PendingCommitment` 无任何清理。
  - schema 中：`ChapterSummary.chapterId` 为纯 `String`（`schema.prisma:239`，无关联到 StoryNode 的 relation/onDelete）；`StoryBeat.nodeId` 为纯 `String`（`:304`）；`PendingCommitment.sourceNodeId` 为 `String?`（`:261`）。三者仅有 `projectId` 指向 Project（`onDelete: Cascade`），**没有指向 StoryNode 的级联**。
  - 对照：`GameSession`（`schema.prisma:365` `node StoryNode @relation(..., onDelete: Cascade)`）与 `StoryNodeRevision`（`:198` 同 Cascade）删除节点时会正确级联——已无孤儿风险。
- **影响**：删除章节/节点后，`ChapterSummary(chapterId)`、`StoryBeat(nodeId)`、`PendingCommitment(sourceNodeId)` 成为悬空引用（指向已不存在的节点 uuid）。由于节点 uuid 不复用，活跃节点查询不会误命中这些死行，**功能破损低**；主要风险是：(a) 数据无谓膨胀；(b) 记忆召回/伏笔检测若按这些 id 拉取会读到陈旧的「幽灵」记忆。属 P2（工程 hygiene / 潜在召回噪声）。
- **修复方向**：`DELETE` 节点时显式 `deleteMany` 上述三表的对应 id；或将来把 `chapterId/nodeId/sourceNodeId` 提升为带 `onDelete: Cascade` 的真实 relation。

### F5 · P2 · 软删 + 导入幂等交互（回收站项目被幂等指回但仍不可见）
- **证据**
  - `src/app/api/projects/import/route.ts:68-73`：命中 `importSource` 唯一键后直接 `return { pid: existing.id, idempotent: true, ... }`，**不清 `deletedAt`**。
  - `src/app/api/projects/[id]/backup/route.ts:35-47` 用 `findUnique`（不过滤 `deletedAt`），可回收站项目也能被备份。
  - 主列表过滤正确：`src/app/api/projects/route.ts:9` `where: { deletedAt: null }`。
- **影响**：若某项目曾被回收（deletedAt 非空）且其 `importSource` 仍指向最初的 `.nfproject` 源，用户重复导入同一备份会命中幂等、返回 `idempotent:true` 指向**仍在回收站**的项目——主列表不可见，用户以为「导入失败/没反应」。属边界交互瑕疵，非数据损坏。
- **严重度**：P2（UX/一致性边界；不丢数据，但幂等语义与软删状态耦合不清）。
- **修复方向**：幂等命中时若 `deletedAt` 非空，要么自动 restore（清 deletedAt），要么返回明确提示「该项目在回收站，已恢复/请先恢复」。

### F6 · P2 · 游戏并发写丢失更新（session 计数器非原子）
- **证据**
  - `src/core/game/game-engine.ts:303-313` 在回合入口读取 `session.currentRound/totalWords/plotProgress`；`:388` 计算 `newRound = session.currentRound + 1`；`:423` 计算 `newTotalWords = session.totalWords + wordCount`；`:433-471` 在 `$transaction` 内 `upsert(gameState round=newRound)` + `update(session counters)`。
  - 计数器的「读（:303）→ 改（:388/423）→ 写（:463-470）」发生在事务**之外**，基于回合开始时的一次性陈旧读取。
- **影响**：若两个回合并发进入（同一 `sessionId`），二者都读到相同 `currentRound`，都 upsert 同一 `round`（后者覆盖叙事），且都基于同一 `totalWords` 基数累加 → 其中一回合的字数/轮次增量**丢失**（写偏斜 / lost update）。`@unique([sessionId, round])` 仅防止重复行，无法保护 session 计数器。现实 UI 为串行点击，触发概率低；但代码层面并发非原子，属 P2 观察级。
- **修复方向**：用 `update({ where:{id, currentRound: session.currentRound}, data:{ currentRound:{increment:1}, totalWords:{increment: wordCount} } })` 的条件递增，或将计数累加放进事务并用 `updateMany` 乐观锁，杜绝丢失更新。

---

## 三、历史 IMP 闭环复核（round-1~4）

| 历史项 | 当时判定 | 本轮 HEAD 复核结论 | 证据 |
| --- | --- | --- | --- |
| **IMP-001** 游戏 originalContentSnapshot（复导出堆叠） | round-1 复检指出「首次导出已修复、复导出 P1-#1 残留」 | **已闭环** | `game-engine.ts:160-165` 创建会话时若传 `originalContentSnapshot` 则复用，否则取 `node.content`；`resetGameSession`（:706-713）保留 `preservedSnapshot` 跨 reset 复用；`endGameAndExport`（:565）前置 `session.originalContentSnapshot \|\| session.node?.content`。因快照跨 reset 固定，二次导出不会再把它当成「原正文」重复前置，堆叠路径消除。✓ |
| **软删**（deletedAt 列表过滤 + 子表隐藏） | round-1 称「列表加 `deletedAt:null`、子表 Cascade 随软删隐藏」 | **主体闭环，残留 F5** | `projects/route.ts:9` 列表过滤成立；schema 全部 Project 直接子表 `onDelete: Cascade`（:73/107/134/217/237/258/302/319/399/436/530/556），随项目软删一致隐藏、不丢数据。仅 import 幂等命中回收站项目时不清 deletedAt（见 F5）。✓（主体）/ 残留 P2 |
| **导入去重**（importSource 唯一 + 并发幂等） | round-1 IO-08 称「无强制新导入逃生口」 | **已闭环（含 IMP-014）** | `projects/import/route.ts:51-58` 已实现 `forceNew` 逃生口（跳过 importSource 查重、名称加「（副本）」），`:246-258` 保留 P2002 兜底。IO-08 的「想要两份副本不可得」已由 IMP-014 解决。✓ |

**诚实边界**：IMP-001 的闭环通过代码静态追踪确认（快照字段在 HEAD 真实存在且被 endGameAndExport 使用），未重新跑真机复导出来坐实；但代码路径与 round-1 复检报告的「修复建议」完全对齐，判定为已闭环。F5/F6 为在新代码上发现的交互/并发残留，非历史 IMP 本身未闭环。

---

## 四、观察池（未达 P1/P2 但值得记录；部分为历史 IO 仍未闭环）

1. **导出文件名 RFC5987 乱码（历史 IO-01，仍在）**
   `src/app/api/projects/[id]/export/route.ts:90/104/117/166` 的 `Content-Disposition` 仅写 `filename="<encodeURIComponent(中文名)>"`，缺 `filename*=UTF-8''`；而备份接口（`backup/route.ts:64`）写法合规。同源两处不一致，中文导出文件名会变成百分号乱码。属体验/合规缺陷，非数据一致性，但 round-1 已标 P1，HEAD 仍未修。

2. **备份 `version` 未做版本协商（历史 IO-02 兼容项）**
   `backup/route.ts:53` 写 `version:1`，`import/route.ts:39-41` 仅校验 `format==="nfproject"` 而**不对 `version` 做分支**。未来 backup 升 `version:2` 改结构时，旧 import 会按旧结构硬解析，可能产生静默字段丢失。建议 import 端对 version 显式比对。

3. **历史数据迁移脚本工程化缺失（历史 IO-03，仍在）**
   `scripts/check-db.mjs`、`scripts/fix-ch1-status.cjs` 硬编码特定实例 UUID（`45bda999-…` / `96839dde-…`），在任意非原实例库上直接 `null` 解属性崩溃；`prisma/migrations/` 仅 3 个 2026-06-06 历史迁移，schema 新增字段（`importSource`、`confirmedAt`、`autoConfirmEnabled`、`buildConfig`、`appliedPresets` 等）无对应迁移/回填；`package.json` 无 `db:push`/`db:migrate` 脚本。存量库跨版本升级依赖手动 `prisma db push`，存在「新增必填无默认字段则升级即崩」的隐性风险。

4. **备份→导入 round-trip 缺自动化测试（历史 IO-05，仍在）**
   仅 `projects/import/route.test.ts` 有 2 例（分支导入 G1/W1）；`export/backup/restore/presets/import/commit` 均无测试守护。建议补一个 backup→import 集成测试（断言节点数、关系重映射、分支 forkPoint、幂等去重），可顺带锁住 F1 的字段丢失回归。

5. **未发现**：本轮未在「字符卡 relationships 之外的其他 JSON 字段类型漂移」「Project 列表未过滤软删导致泄漏」「GameSession/StoryNodeRevision 级联缺失」等方向发现新问题——这些经核实已正确处理（见 F4 对照、F5 列表过滤、schema Cascade）。凡无明证者不列为缺陷。

---

## 五、一句话回报

**发现 3 条必须修的问题（均为 P1）：F1 备份包 round-trip 静默丢失 6 类数据、F2 markdown 回灌角色关系字段键不一致、F3 `import/commit` 事务缺超时（历史 IO-02 未闭环）；另有 3 条 P2（F4 节点删除孤儿数据、F5 软删+导入幂等交互、F6 游戏并发写丢失更新）；历史 IMP-001 与导入去重已确证闭环，软删主体闭环仅残留 F5。**
