# 复检报告 · 游戏模式透镜（Round-1 / 阶段五）

> 本报告为 MaxLoop 魔王系统复检子 Agent 在「阶段五」对上轮 round-1「阶段四」**声称修复**的 3 个 IMP 进行的独立复验。
> 复验原则：**防假收敛** —— 每个 IMP 不轻信断言，逐一 `git diff` + 读源码上下文 + 跑相关测试 + 真机验证（可机验部分）+ 挖掘新坑。

| 项 | 内容 |
| --- | --- |
| Agent 代号 | 复检子 Agent（游戏模式透镜） |
| 透镜 | 游戏模式（game-engine / game-prompts / 导出回填 / 跨轮次记忆） |
| 轮次 | Round-1 / 阶段五（复检） |
| 对象 | `novel-forge`（分支 main，dev:3001，PostgreSQL:127.0.0.1:5432） |
| 复验 IMP | IMP-001（P0）/ IMP-003（P1）/ IMP-022（P1）（共 3 项） |
| 门禁快照 | `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` EXIT=0；`npm test` 211 passed（本轮亲跑确认） |
| 日期 | 2026-08-06 |

---

## 一、双栏速览

| 用户体验视角（U/X 是否真的变好） | 总体视角（工程是否真修复、有无新坑） |
| --- | --- |
| IMP-001：已有正文的章节开游戏并「结束导出」后，作者原正文**确实还在**。**（首次导出已修复，真机验证通过）** | IMP-001 修复把 `node.content` 前置拼接为第 0 段真实落地；但**复导出（重开游戏再导出）会把上一次游戏全文当作"原正文"重新前置拼接**，属 P1 残留。 |
| IMP-003：游戏导出触发自动回填设定库时，前端弹「已自动回填设定库」toast。**（已修复，链路真机验证通过）** | IMP-003 `autoFilled` 字段链路完整（engine→route→page）；异常路径不会误报（默认 false，仅真实回填>0 时置真）。残留 P2：toast 未提示"可能覆盖手动编辑"。 |
| IMP-022：长游戏（>6 轮）早期实体/伏笔/关键决策在后续 prompt 中**不再消失**。**（已修复，单测覆盖）** | IMP-022 `buildMemorySummary` 注入 system prompt，跨轮次实体/物品/早期决策补齐；逻辑自洽。残留 P2：超长游戏早期决策无数量上限，prompt 无限增长。 |

---

## 二、发现清单（含 文件:行号 + 复验证据）

### IMP-001 · 游戏导出覆盖写作原正文（数据丢失）
- **严重度**：✅ 单次导出**已修复**；⚠️ 复导出**残留 P1**（见第四节 P1-#1）
- **文件:行号**：`src/core/game/game-engine.ts:547-555`（修复点：`existingNarrative` 数组把 `session.node?.content` 前置为第 0 段）；`endGameAndExport` 导出落库 `:636-644`
- **现象（修复前）**：已有正文的章节开启游戏并「结束并导出」后，`node.content` 原写作正文被游戏轮次整体覆盖（真机验证原 41 字正文 `contains(PRE)=false`）。
- **根因（修复前）**：`endGameAndExport` 仅拼接 `session.states`，未把 `node.content` 作为第 0 段前置。
- **复验证据（首次导出修复成立）**：
  1. `git diff` + 读 `:550-555` 确认修复逻辑：
     ```ts
     const existingNarrative = [
       session.node?.content,
       ...session.states.map((s) => s.narrative),
     ]
       .filter(Boolean)
       .join("\n\n");
     ```
     再 `finalContent = (existingNarrative + "\n\n" + endingNarrative).trim();` → 原正文作为第 0 段保留。
  2. **真机验证（dev:3001 在线，health=200，db/llm ok）**：自建 curl/Node 流程 —— 建项目 → 建含作者原正文锚点 `【作者原正文锚点·KEEP9F3A】…` 的章节节点 → `/api/game/start` → `/api/game/action`×2（SSE）→ `/api/game/end` → `GET /api/story/nodes/{id}` 读回 `content`：
     - `C1.length = 1711`，`C1.includes(PRESET) === true`，锚点出现次数 `=== 1`（无重复、无丢失）。✓ **首次导出原正文保留确凿。**
  3. `npx vitest run src/core/game/game-engine.test.ts` → 21 passed、`game-prompts.test.ts` → 64 passed（合计 85，均含本透镜相关回归）。
- **建议**：同 P1-#1。

### IMP-003 · 游戏导出静默回填世界书
- **严重度**：✅ 已修复（字段链路 + 前端消费均真机验证通过）
- **文件:行号**：`src/core/game/game-engine.ts:646-662`（回传 `autoFilled`）；`src/app/api/game/end/route.ts:31`（透传 `autoFilled`）；`src/app/workspace/[projectId]/game/[nodeId]/page.tsx:455-456`（消费 → toast）
- **现象（修复前）**：主路径游戏导出触发 `safeFillAfterWriting` 改动设定库，界面无提示（静默改动世界观）。
- **根因（修复前）**：导出未把"是否回填"信号回传给前端。
- **复验证据（链路完整）**：
  1. `game-engine.ts:646-662`：`autoFilled = typeof fillMsg === "string" && fillMsg.includes("已执行");`，而 `applyConfirm`（`confirm-guard.ts:138-139`）仅在 `fillRes.ok && fillRes.applied > 0` 时返回 `"自动填表已执行"`；失败/跳过文案（`未触发自动填表`/`自动填表失败`/`节点已确认（幂等跳过）`）均**不含**「已执行」→ 字段语义精确，无来源串的误匹配。
  2. `route.ts:31` 在 JSON 响应中显式 `autoFilled: result.autoFilled`；`page.tsx:455-456`：`if (data.autoFilled) toastInfo("游戏导出已自动回填设定库（可在创意工坊查看/修订）");`。
  3. **真机验证**：同上 IMP-001 流程，`POST /api/game/end` 返回 `autoFilled: true`、`status: "confirmed"`（即自动确认 + 真实回填均发生）；`autoFilled` 为 boolean 字段、与真实回填行为一致。✓ **链路与前端消费成立。**
- **异常路径深挖（是否误报）**：
  - `autoFilled` 默认 `false`；仅当 `autoConfirmOn && el.eligible` 进入 `applyConfirm` 且 `applied>0` 才置真。
  - 若游戏意外中断、`/api/game/end` 未被调用 → `endGameAndExport` 不执行，`autoFilled` 不回传，**不会误报**。
  - 若 `updateMany` 幂等跳过（节点已 confirmed）→ `applyConfirm` 返回「节点已确认（幂等跳过）」不含「已执行」→ `autoFilled=false`，**不误报**。
  - 若 `autoConfirmEnabled=false` 或不达标 → 不入 `applyConfirm` → `autoFilled=false` → 无 toast（与"无回填"一致）。
  - **结论**：异常路径无虚假"已填"提示。
- **建议**：同 P2-#1（toast 文案可补"设定库以正文为准，如与手动编辑冲突将按正文刷新"的提示）。

### IMP-022 · 早期剧情记忆随轮次衰减
- **严重度**：✅ 已修复（单测覆盖跨轮次实体/早期决策注入）
- **文件:行号**：`src/core/game/game-prompts.ts:240-278`（`buildMemorySummary`）；`:283-348`（`buildGameSystemPrompt` 在 `:346` 注入 `{memorySection}`）；测试 `src/core/game/game-prompts.test.ts:193-261`
- **现象（修复前）**：`historySection` 仅取最近 6 轮、每轮截断 150 字，长游戏（>6 轮）早期实体/伏笔/关键决策在 prompt 中丢失。
- **根因（修复前）**：缺持久记忆摘要注入。
- **复验证据（修复成立）**：
  1. `buildMemorySummary` 从**跨全轮次持久**的 `ctx.entities`（合并去重）、`ctx.items`（当前背包）、`ctx.previousTurns` 中掉出最近 6 轮的早期决策提取摘要，注入 `historySection` 之前，且不改动 `historySection` 截断逻辑。
  2. `game-prompts.test.ts:193-261`：`buildMemorySummary` 块构造 8 轮长局，断言：
     - 注入 `## 跨轮次记忆摘要` 标题；
     - 列出全部持久实体（李尘/黑风寨/青云诀/断魂崖）含掉出最近 6 轮者；
     - 列出当前背包并保留归属者；
     - 回填第 1、2 轮早期决策、且**不含**第 8 轮（第 8 轮已在 `historySection`）；
     - 无实体/物品/早期决策时返回空串（不污染短局）。
  3. `npx vitest run src/core/game/game-prompts.test.ts` → **64 passed**（含本块 6 例）。✓ 跨轮次记忆注入逻辑成立。
- **超长游戏截断深挖**：
  - 实体/物品清单按全量列出、未做数量截断（设计上应保留，正确）。
  - 早期决策 `previousTurns.slice(0, max(0, length-6))` 取**全部**掉出最近 6 轮的轮次，**无数量上限**；每轮 `playerAction.slice(0,40)` 仅截断单行长度。
  - 影响：50 轮游戏 → 早期决策约 44 行被注入，prompt 随轮次线性增长（无硬上限）。属 P2 观察（非正确性 bug，但超长局 token 预算需关注）。见 P2-#2。
- **建议**：同 P2-#2（对早期决策设数量上限或抽样，避免极长局 prompt 无限膨胀）。

---

## 三、复验中挖掘的新坑（残留问题）

| 编号 | 严重度 | IMP 关联 | 文件:行号 | 现象 / 影响 | 建议 |
| --- | --- | --- | --- | --- | --- |
| P1-#1 | **P1（内容损坏·静默）** | IMP-001 | `game-engine.ts:550-555` + `:686-695`(`resetGameSession`) + `game/start/route.ts:21` | **复导出堆叠**：修复读取"实时 `node.content`"前置，而首次导出已把 `node.content` 改写为"原正文+游戏全文"。重开游戏（UI 允许 re-enter 后点"开始游戏"→`resetGameSession` 删旧会话、节点 content 不动）再次导出时，`endGameAndExport` 把**上一次游戏导出全文（含其开头与结尾）**当作"原正文"重新前置拼接。真机实测 `C2.startsWith(C1)===true`、`C2.length=4102` vs `C1.length=1711`。结果：多次游玩的叙事被无提示地首尾拼接成一章（多开头/多结局堆叠），内容逻辑错误。 | 在 `resetGameSession`/`ensureGameSession` 时**快照原正文**到 session（如 `originalContent` 字段），导出时前置 session 的快照而非实时 `node.content`；或导出前判断 `node.content` 是否已等于某次游戏导出产物，避免重复前置。 |
| P2-#1 | P2（UX 提示不足） | IMP-003 | `fill.ts:457-491`；`game/[nodeId]/page.tsx:455-456` | `babyloreFill` 对 loreTable 行执行 `update`/`delete` 操作（`:459` 命中即覆盖 `rows[idx]`、`:476-491` 可整表删行），会自动覆盖/删除作者手动编辑的设定行。toast 仅说"已自动回填设定库"，未提示"以正文为准、可能覆盖手动编辑"。 | toast 文案补一句"设定库以正文为准，如与手动编辑冲突将按正文刷新"；或在 overwrite/delete 发生时区分提示。 |
| P2-#2 | P2（token 预算） | IMP-022 | `game-prompts.ts:263-274` | `buildMemorySummary` 早期决策无数量上限（`slice(0, length-6)` 全取），超长游戏（如 50 轮）早期决策约 44 行被注入，prompt 随轮次线性增长无硬顶。 | 对早期决策设上限（如前 `min(8, n-6)` 轮）或按"含伏笔/实体提及"的重要性抽样，bound prompt 体积。 |

> P1-#1 为 IMP-001 修复引入的**新**内容损坏路径（首次导出正确，复导出堆叠）；P2-#1/#2 为既有设计语义下的 UX/预算提示级瑕疵，不破坏门禁（tsc 0 错、211 测试通过）。

---

## 四、诚实边界（沙箱能力声明）

- **环境限制**：沙箱无 Chromium / 可视化浏览器，所有"视觉层"断言（`page.tsx:455` 的 toast 是否真实弹出、ended 界面 badge 标注、抽屉层级）均**无法像素级目测**，已显式标注"需本地目测"。
- **已机验部分**：
  1. 三项 IMP 的代码改动（`git diff` + 读 `game-engine.ts` / `game/end/route.ts` / `page.tsx` / `game-prompts.ts` / `confirm-guard.ts` / `fill.ts`）全部核对。
  2. 相关单元测试：`game-engine.test.ts`（21 passed）+ `game-prompts.test.ts`（64 passed）= 85 passed；整库 `npx vitest run` → **211 passed**（确认门禁未回归）。
  3. **真机验证**（dev:3001 在线、无需鉴权）：自建 Node 脚本跑通「建章→写原正文→game/start→action×2→game/end→读 node.content」完整闭环，取得 IMP-001 原正文保留（`C1` 含锚点且唯一）与 IMP-003 `autoFilled=true` 真实回填的两组硬证据；并实测复导出 `C2.startsWith(C1)=true` 坐实 P1-#1。
- **未压测部分**：IMP-022 50+ 轮超长局的 prompt 实际体积、IMP-003 自动回填对"作者手动编辑行"的具体覆盖 case（需构造手动编辑+LLM 命中同名行的端到端），未做端到端压测，标注观察级。
- **门禁一致性**：本轮独立复验结果与 Chair 已核验门禁一致（`tsc --noEmit` EXIT=0；`npm test` 211 passed），未发现破坏门禁的回归。

---

## 五、本透镜复验结论

**游戏模式透镜复验完成**：上轮阶段四"声称修复"的 3 个 IMP（IMP-001 / IMP-003 / IMP-022）经 `git diff` + 源码上下文 + 单元测试 + 真机闭环（IMP-001 原正文保留、IMP-003 `autoFilled` 真实回填）独立复验，**核心修复均确认真实落地、逻辑自洽**：

- **IMP-001**：首次导出保留作者原正文 —— **确证修复**（真机 `C1` 含锚点且唯一）。
- **IMP-003**：`autoFilled` 字段链路（engine→route→page）+ 异常路径不误报 —— **确证修复**。
- **IMP-022**：跨轮次记忆摘要注入 system prompt、早期实体/决策不丢失 —— **确证修复**（单测 6 例覆盖）。

**残留问题数：P0: 0 / P1: 1 / P2: 2**
- **P1-#1（IMP-001 复导出堆叠）**：`game-engine.ts:550-555` 读取实时 `node.content` 前置，首次导出已改写该字段，重开游戏再导出会把上一次游戏全文当作"原正文"重新前置拼接（`C2.startsWith(C1)=true`），多次游玩叙事被无提示首尾拼接成章 —— 内容损坏，需快照原正文到 session 修复。
- **P2-#1（IMP-003 toast 提示不足）**：`fill.ts:457-491` 自动回填可覆盖/删除作者手动编辑的设定行，toast 未说明"以正文为准"。
- **P2-#2（IMP-022 超长局无上限）**：`game-prompts.ts:263-274` 早期决策无数量上限，极长局 prompt 线性膨胀。

> "需本地目测"项：`page.tsx:455` toast 实际弹出与 ended 界面 badge 视觉标注（沙箱无 Chromium）。
