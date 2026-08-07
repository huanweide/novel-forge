# 游戏引擎复检报告（阶段五 · 镜头：game）

- 复检项：R2-013（P1）—— originalContentSnapshot 永不刷新致手动编辑被覆盖
- 复检员角色：独立代码复检员（魔王系统阶段五复检循环）
- 项目根：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- 被验证文件：`src/core/game/game-engine.ts`（720 行）、`src/app/api/game/start/route.ts`、`src/core/game/game-engine.test.ts`
- 复检方法：Grep + 全文件 Read（非仅 git diff）+ 实跑单测 + 调用链追溯 + 静态竞态推演

---

## 一、R2-013 验证结论

### 1.1 结论：生效（但验证来源是代码阅读，而非测试）

经逐行精读 `src/core/game/game-engine.ts` 当前内容（注意：本次复检一律以「文件当前落地内容」为准，不采信 git diff 描述），确认 R2-013 的修复逻辑已经真实落到 `resetGameSession` 中，并且与 `ensureGameSession`、`endGameAndExport`、`/api/game/start` 形成闭环。判定为「生效」。

### 1.2 证据链（逐跳确认）

**第一跳：resetGameSession 重写为「重拍实时 node.content」**

`src/core/game/game-engine.ts:702-720`：

```ts
export async function resetGameSession(projectId: string, nodeId: string) {
  const node = await prisma.storyNode.findUnique({ where: { id: nodeId } });
  const freshSnapshot = node?.content || "";          // 读取实时 node.content

  const existing = await prisma.gameSession.findUnique({ ... });
  if (existing) {
    await prisma.gameState.deleteMany({ where: { sessionId: existing.id } });
    await prisma.gameSession.delete({ where: { id: existing.id } });
  }
  return ensureGameSession(projectId, nodeId, freshSnapshot); // 用实时正文作新快照
}
```

关键变化：开局/重开时先 `prisma.storyNode.findUnique` 读取作者当前正在编辑的实时 `node.content`，将其作为 `freshSnapshot` 透传给 `ensureGameSession`。这与「死快照（首次入游写入的 node.content）」已彻底不同——旧实现若仅用首次入游时缓存的 `originalContentSnapshot`，则作者在导出后于工作区润色的内容绝不会被重新读取；新实现每次重开都重新向数据库取一次实时正文，因此手动编辑只要已落到 `node.content`，就会被重新纳入快照。

**第二跳：ensureGameSession 接受实时正文并写入快照列**

`src/core/game/game-engine.ts:162-165`：

```ts
const snapshot =
  originalContentSnapshot && originalContentSnapshot.length > 0
    ? originalContentSnapshot
    : (node.content || "");
```

由于 `resetGameSession` 传入的 `freshSnapshot` 是刚读取的 `node.content`，只要作者编辑过（非空），`snapshot` 就等于实时正文；随后 `:176` 将其写入 `originalContentSnapshot` 列。注意 `:160-165` 的注释仍提到「若传了 preservedSnapshot（来自上一局会话）则复用同一份原正文」——在新实现里，`resetGameSession` 永远传 `freshSnapshot`（即当前 node.content），因此每次重开都刷新，不再复用首次入游的旧快照，正是 R2-013 想要的效果。

**第三跳：endGameAndExport 以快照作导出前缀，手动编辑因此不被覆盖**

`src/core/game/game-engine.ts:565`：

```ts
const originalContent = session.originalContentSnapshot || session.node?.content || "";
const existingNarrative = [ originalContent, ...session.states.map((s) => s.narrative) ]
  .filter(Boolean).join("\n\n");
```

由于 `originalContentSnapshot` 现在等于「重开瞬间作者工作区的实时正文」，导出拼接时这一段就是作者润色后的内容，游戏轮次只追加在其后，作者手动编辑不会被无声覆盖。这正是 R2-013 的预期行为。

**第四跳：调用接线确认「每次开局都走 reset」**

`src/app/api/game/start/route.ts:21`：`const session = await resetGameSession(projectId, nodeId);`——开局入口固定调用 `resetGameSession`，即任何「开始/重开游戏」都会触发快照刷新。同一路由 `:36` 还以 `node.content` 作为 `existingContent` 喂给开场 prompt，与快照同源，避免「prompt 看到的已有正文」与「导出前缀快照」两处来源不一致。

**闭环结论**：手动编辑 → 落库到 `node.content` → 点击重开 → `resetGameSession` 读实时 `node.content` → 覆盖 `originalContentSnapshot` → 导出时该内容作前缀。整条链路在当前文件中自洽，R2-013 确属「生效」。

### 1.3 实跑测试输出

```
$ npx vitest run src/core/game/game-engine.test.ts

 RUN  v4.1.10  C:/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge

[applyItemChanges] 已知流转操作「出售」跳过入库（不计入背包）：宝物

 ✓ src/core/game/game-engine.test.ts (21 tests) 10ms

 Test Files  1 passed (1)
      Tests  21 passed (21)
   Duration  737ms
```

21 个测试全部通过。但必须诚实指出：**这 21 个测试中没有一条直接覆盖 `resetGameSession` 或 `originalContentSnapshot` 的刷新逻辑**。它们的覆盖范围如下：

- `applyItemChanges` 按 name+owner 隔离（6 条）
- abort 后对账回拉（2 条）
- abort 信号透传（6 条）
- `applyFrontendItemChanges` 不可变更新（6 条）
- `getSessionSummary` 实体跨轮去重（1 条）

即：测试全绿只能证明「背包隔离、abort 丢弃、对账、摘要去重」等既有能力未被回归破坏，**并不能证明 R2-013 生效**。R2-013 的验证在本轮完全来自代码阅读 + 调用链推演，而非自动化测试。测试文件中 `resetGameSession` 甚至未被 import。这是一个真实的验证缺口，应当补充针对 `resetGameSession` 的单元测试（断言：传入编辑后的 node.content，返回的 session.originalContentSnapshot 等于该编辑后内容，且旧的 gameState 已被清空）。

### 1.4 未覆盖的边界（依赖前端时序，待验证）

R2-013 的正确性有一个隐含前提：**前端在调用 `/api/game/start`（即 resetGameSession）之前，已经把作者的手动编辑持久化到了 `node.content`**。若前端 autosave 存在 debounce（常见 500ms~1s），作者在 debounce 尚未 flush 时就点击「重新开始游戏」，则 `resetGameSession` 读到的 `node.content` 仍是编辑前的旧值，手动编辑依然会被丢弃——此时 R2-013 在代码层面「生效」，但在用户实际路径上「假生效」。此边界属前端+后端协作时序，本环境未跑真实浏览器，标记为「待验证」（详见第三部分）。

---

## 二、重置取舍影响评估（IMP-001 语义偏离）

### 2.1 取舍原文

`src/core/game/game-engine.ts:707-708` 的注释已自陈此取舍：

> 若作者「导出后未手动编辑」就直接重开游戏，上一局的游戏正文会被并入新快照基线（即旧游戏输出现在成为新局的「原正文前置」），跨多次重开会持续累积；这与 IMP-001「重开即丢弃旧游戏输出、回到纯净原正文」的语义不同。

### 2.2 推演复现

设原正文为 `O`。

1. 作者首次入游，`node.content = O`。玩 G1，导出：`endGameAndExport` 拼 `O + G1_叙事 + 结尾` → `node.content = O + G1`。
2. 作者**未手动编辑**，直接重开：`resetGameSession` 读 `node.content = O + G1` → 新会话 `originalContentSnapshot = O + G1`。
3. 玩 G2，导出：前缀用快照 `O + G1`，追加 G2 → `node.content = (O + G1) + G2`。
4. 再未编辑重开：`snapshot = O + G1 + G2`；玩 G3 → `node.content = O + G1 + G2 + G3`。

可见：每发生一次「导出后不编辑即重开」，上一整局游戏输出就会作为新局的「原正文」被重新前置，跨多次重开呈线性累积。

### 2.3 真实影响判断

我对此取舍的判断是：**不会造成「脏数据崩溃」，但存在「正文膨胀 + 叙事自洽性风险」，属于可接受但应设防的隐患**。理由：

- **非崩溃性**：累积的是合法文本，导出拼接逻辑本身不报错，也不会出现 IMP-001 当初那种「整段重复堆叠损坏」（因为 `endGameAndExport` 始终以快照为单一前缀，旧游戏输出只出现一次，不会像早期 bug 那样把「上次全量」又当原正文叠加）。所以这不是「数据损坏」，而是「语义偏离 + 体量增长」。
- **自洽性风险**：`resetGameSession` 在重开时清除了 `gameState`（`:716`），即新一局游戏没有任何上一局的轮次/背包/实体状态连续；但 `loadGameContext`（`:263`）又把 `node.content`（含上一局完整输出）作为 `existingContent` 喂给模型。模型看到「已有正文里有一整段看起来像正文的故事」，却不知道那是上一局游戏产物，于是可能「重复推进」或「与其中情节矛盾」，产生叙事不连贯。
- **触发条件苛刻**：必须「导出后完全不编辑就重开」，且反复多次。典型作者工作流是「导出后在工作区润色，再重开玩第二遍」——这正是 R2-013 修复保护的场景，不受此取舍影响。因此线上实际触发概率中低。
- **与 IMP-001 的关系**：IMP-001 要的是「重开回到纯净原正文」，新实现要的是「重开反映作者最新工作区内容」。二者在「导出后编辑」场景下一致，仅在「导出后不编辑」场景下冲突。取舍本质是「优先保作者手动编辑」压过了「优先保纯净原正文」。

### 2.4 改进建议（消除累积，同时保留 R2-013 修复）

建议引入「手动编辑检测」守卫，区分两种重开：

- 在 `gameSession` 上新增一个不可变字段 `pristineOriginal`（仅在**第一次**入游该 node 时写入一次，之后永远不变），以及 `lastExportContent`（每次 `endGameAndExport` 写入最终导出内容）。
- `resetGameSession` 重开时：
  - 若 `node.content` 与 `lastExportContent` **相等**（说明导出后作者未手动编辑）→ 新快照采用 `pristineOriginal`（真正 IMP-001 语义：回到纯净原正文，不累积）。
  - 若 `node.content` 与 `lastExportContent` **不等**（说明作者已润色）→ 新快照采用 `node.content`（R2-013 修复：保留手动编辑，不被覆盖）。
- 这样既不破坏 R2-013 的核心诉求，又从根本上消除了「不编辑就重开」的累积问题，且不需要依赖前端时序判断。

该修复成本可控（两个字段 + 一次字符串比较），建议作为下一轮 P2 项跟进。

---

## 三、新坑清单（round-2 未发现、真实存在）

> 以下每条均为静态精读 + 代码路径推演得出。未运行时复现的项已在第三部分诚实标注。

### 新坑 A：resetGameSession 与在途回合竞态 → 在途回合崩溃（中危）

- 位置：`src/core/game/game-engine.ts:716-717`（删除旧会话/状态）与 `:433-471`（在途 `processGameTurn` 的事务提交）。
- 问题：`resetGameSession` 先 `deleteMany(gameState)` 再 `delete(gameSession)`；若此刻恰好有一个 `processGameTurn` 正在执行，它已在 `:303` 加载了旧 `session`，并在 `:388` 算好 `newRound`，即将在 `:433` 的 `$transaction` 里执行 `gameSession.update({ where: { id: session.id }})` 与 `gameState.upsert({ sessionId: session.id })`。由于旧 session 已被删除，`gameSession.update` 会抛 `P2025 RecordNotFound`，`gameState.upsert` 会因外键指向不存在的 session 抛约束违例。该事务未被 try/catch 包裹（`:433` 外层无保护），异常上抛到 `game/.../route.ts`。
- 影响：作者「游戏进行中点击重新开始」这一极常见交互，可能让正在生成的回合以 500/错误告终；新会话本身创建成功，但用户会看到一条难看的报错，且那一轮内容丢失。
- 复现思路：在前端对局进行到第二轮生成中途，快速点击「重新开始游戏」，观察后端日志是否出现 P2025 / 外键违例，以及前端是否收到错误而非新会话。
- 建议：重开前先对在途 turn 发 abort（共用 `signal`）；或 `processGameTurn` 在事务处捕获 `P2025` 并降级为「会话已重置，丢弃本轮」。

### 新坑 B：同一会话并发回合 → round 冲突丢轮（中危）

- 位置：`src/core/game/game-engine.ts:388`（`newRound = session.currentRound + 1`）与 `:433-471`（按 `sessionId_round` upsert）。
- 问题：`newRound` 取自 `:303` 加载的 `session.currentRound`；若同一会话在短时间内触发两次 `processGameTurn`（双击、弱网重试、前端未禁用重复提交），两者读到相同的 `currentRound`，算出**相同**的 `newRound`，随后都 `upsert` 同一个 `(sessionId, round)`。第二个 upsert 走 `update` 分支覆盖第一个，而 `gameSession.update` 的 `currentRound: newRound` 只 +1（而非 +2）。结果：**一次玩家行动凭空消失，无报错**。
- 注：原 `@@unique([sessionId, round])` + upsert 的设计意图是「同轮重试幂等」，但它同时掩盖了「两次不同逻辑回合」的碰撞。
- 复现思路：用两个并发请求同时 `POST /api/game/turn` 到同一 `sessionId`，断言最终 `currentRound` 与 `gameState` 条数是否只前进了一轮、且只保留一条叙事。
- 建议：用数据库原子自增或行锁（`SELECT ... FOR UPDATE`）分配 `currentRound`；或引入乐观锁 `version` 字段，冲突时拒绝后到请求。

### 新坑 C：实体状态冻结 → 上下文（喂模型）与摘要（面板）不一致（中危）

- 位置：`src/core/game/game-engine.ts:247-252`（`loadGameContext` 实体去重取「首现」）与 `:196-200`（`getSessionSummary` 实体去重取「末轮」）。
- 问题：两处去重策略相反。
  - `loadGameContext`（供 `processGameTurn` 组装 prompt）用 `if (!entityMap.has(e.name)) entityMap.set(...)`，即**首次出现**的实体状态胜出；
  - `getSessionSummary`（供前端面板）用 `entityMap.set(e.name, e)` 直接覆盖，即**末轮**实体状态胜出。
- 影响：若某实体在第 1 轮为「健康」、第 3 轮更新为「负伤」，模型在续写时拿到的仍是第 1 轮的「健康」状态（prompt 看不到负伤），而前端面板显示的却是「负伤」。前后端对实体状态的认知分裂，模型续写可能与实体最新状态自相矛盾，破坏叙事一致性。
- 复现思路：构造一个两轮游戏，第 1 轮实体 `李尘` 描述 A，第 3 轮同一实体描述 B；分别检查 `loadGameContext` 的 `entities` 与 `getSessionSummary` 的 `entities`，确认前者为 A、后者为 B。
- 建议：`loadGameContext` 改为与 `getSessionSummary` 一致的「末轮优先」去重（`entityMap.set(e.name, e)`），保证喂给模型的实体状态 == 面板状态。

### 新坑 D：resetGameSession 非事务化 delete+create → 删除后创建留空窗（低危/边界）

- 位置：`src/core/game/game-engine.ts:712-719`。
- 问题：`deleteMany(gameState)` + `delete(gameSession)` 与随后的 `ensureGameSession`（内部 `create`）不在同一 `$transaction`。若 `ensureGameSession` 因 `node` 不存在而在 `:157-158` 抛错，旧会话已被删、新会话未建，该 `nodeId` 会短暂处于「无游戏会话」状态；调用方 `game/start` 捕获异常返回错误，但 node 此刻没有 `gameSession`，需用户再次点击开始才能重建。
- 复现思路：对一个已被删除/不存在的 nodeId 调用 `resetGameSession`，观察是否抛错且旧会话已消失、新会话未建立。
- 建议：用 `$transaction` 包裹「删状态+删会话+建会话」；或改为「原地重置」（不删除旧会话，仅 `update` 其 `originalContentSnapshot / currentRound / totalWords / plotProgress` 等字段），彻底消除删建窗口与孤儿态。

### 新坑 E：reset 后自动创建的 item 世界卡词条跨局残留（低危/语义观察）

- 位置：`src/core/game/game-engine.ts:492-513`（`ensureItemLorebook`）与 `:716`（reset 仅删 session/state）。
- 问题：游戏中 `gain` 物品时 `ensureItemLorebook` 会向 `lorebookEntry` 写入 `category: "item"` 的世界卡词条（带归属标记）。`resetGameSession` 只删 `gameSession` 与 `gameState`，不清理这些自动创建的 item 词条。重玩再次 `gain` 同名同归属物品时，`ensureItemLorebook` 检测到已存在 → 跳过，不重复建。
- 影响：item 世界卡词条在多次重开后持续残留，作为「世界设定」存在。通常可接受（物品本属世界设定）；但若作者希望彻底清除某次游戏的临时物品设定，目前没有清理入口，可能造成世界书膨胀。
- 复现思路：玩一局 gain「怀表」，reset 后再玩一局 gain「怀表」，查询 `lorebookEntry` 中 `category=item` 且含「归属：主角」的条目数量，确认未被删除。
- 建议：明确自动 item 词条的生命周期语义；若应随会话清理，reset 时一并软删「由游戏自动创建」的 item 词条（可用 `source` 或独立标记区分「游戏临时」与「正式世界设定」）。

### 新坑 F：R2-013 修复对前端持久化时序的隐性依赖（边界，非后端 bug，待验证）

- 位置：`src/core/game/game-engine.ts:709` + `src/app/api/game/start/route.ts:21,36`。
- 问题：R2-013 正确性的前提是「调用 resetGameSession 前，手动编辑已写入 `node.content`」。若前端 autosave 有 debounce，作者在 flush 前点击重开，则 `:709` 读到编辑前内容，手动编辑仍被丢弃——代码层面修复「生效」，用户路径上「假生效」。
- 复现思路：在工作区编辑某游戏导出章节，编辑后**立刻**（< debounce 间隔）点击重新开始游戏，检查导出前缀是否为编辑前内容。
- 状态：依赖浏览器/前端行为，本环境未实跑，标记为「待验证」。建议：前端在触发重开前先强制 flush 保存，或后端 reset 时对「内容版本」做乐观校验。

---

## 四、复检员诚实声明

### 4.1 真测了什么

- **实跑单测**：执行 `npx vitest run src/core/game/game-engine.test.ts`，结果 **21 passed / 21**（输出见 1.3）。但已明确：这 21 条**不覆盖** `resetGameSession` 与快照刷新，因此「测试全绿」不能等同于「R2-013 已验证」。测试仅证明既有能力无回归。
- **真读代码**：完整 Read 了 `src/core/game/game-engine.ts`（720 行）、`src/app/api/game/start/route.ts`、`src/core/game/game-engine.test.ts`；用 Grep 追溯了 `resetGameSession` / `ensureGameSession` / `originalContentSnapshot` 的全部调用点与定义点（确认仅 `game/start/route.ts:21` 一处调用 `resetGameSession`，逻辑接线唯一）。
- **能确定的结论**：基于文件**当前落地内容**（非 git diff），R2-013 的修复代码确实已重写并闭环——`resetGameSession` 在 `:709` 读取实时 `node.content` 并在 `:719` 透传为快照，`endGameAndExport` 在 `:565` 以该快照作导出前缀。这是确定的、可复现的代码事实。

### 4.2 哪些未经实测（明确标注，绝不伪装已验证）

1. **R2-013 的端到端用户流程**（润色导出章节 → 重开 → 再导出，确认手动编辑不被覆盖）：需 dev server + 浏览器真实操作，本环境未启动前端，未实跑。验证来源为代码阅读 + 调用链推演。
2. **新坑 A / B 的运行时触发**：并发重开、并发回合属竞态，仅在静态代码路径上确认存在，未在运行时复现（需构造并发请求或真实交互竞态）。
3. **新坑 C / D / E 的运行时表现**：已在代码层面确认逻辑分歧/空窗/残留，但「实际导致叙事矛盾 / 抛错 / 词条残留」未在运行时跑通，属静态推演 + 路径确认。
4. **新坑 F 的前端时序边界**：依赖浏览器 autosave 行为，未实跑，标记为待验证。

### 4.3 总体判定

- R2-013：**生效**（代码逻辑已闭环，但缺少针对性自动化测试，验证强度为「代码阅读级」，非「端到端实测级」）。
- 重置取舍：可接受但有隐患，建议补充「手动编辑检测」守卫（见 2.4）。
- 新坑数量：**6 条**（A~F），其中 A、B、C 为中危，D、E、F 为低危/边界；A、B 为用户高频交互下的真实崩溃/丢轮风险，建议优先跟进。

---

*落盘时间：阶段五复检循环 · lens=game*
*复检员：独立代码复检员（trust but verify，未向主 Agent 反复询问）*
