# Round 4 复验+挖坑报告 · 阿游（游戏模式链路）

> 身份：会员股东「阿游」，透镜=游戏模式（选项承接 / 背包归属 / 世界卡物品联动 / 断流分叉 / 状态丢失）。
> 方法：严格**只读诊断**，未改任何 src 源码。本轮 Read 了 `game-engine.ts`、`game-prompts.ts`、`types.ts`、`game-prompts.test.ts`、`api/game/{start,action,end}/route.ts`、`app/workspace/[projectId]/game/[nodeId]/page.tsx`、`components/game/GameCanvas.tsx`。
> 诚实边界：沙箱无法真跑流式 LLM（须走代理 127.0.0.1:7897），"选择是否产生可感知分支/断流错位"属代码层可达性确认，端到端需用户在本地验收。所有结论均给文件:行号、可复现、修法、影响范围。

---

## ① 回归确认（Round 3 游戏选项承接 P1-1 修复）

### ✅ 修复已生效、无回归

Round 3 提出的「选项根本不进剧情（P1-1）」已在代码层落实，且做了正确增强：

- `game-engine.ts:176-184`：处理回合时，**从上一轮 states 取出所选选项文本**（`opts.find(o => o.index === input.selectedOption)`），再传 `selectedOptionText` 给 `buildActionPrompt`。
- `game-prompts.ts:163-168`：`buildActionPrompt` 在 userPrompt 头部注入 `（承接上一轮，玩家选择了选项 N：文本）`，**对 LLM 下一轮强提示分支**。
- `game-engine.ts:289-292`：`playerAction` 已记录 `选择选项N：文本`，落库可追溯。
- `parseGameOutput`（`game-prompts.ts:189-228`）已重写：基于**连续编号行块**判定选项区，编号放宽 **1–6**，超界丢弃不残留（195-219），选项区外"数字. "句子不误截（202-228 只截最靠后连续块之前）。

**结论：选项承接链路打通，Round 3 该修复稳。**

### ⚠ 回归后仍存在的边界漏洞（与 P1-1 相关）

**R-A · 承接分支文本取不到时静默退化（真实边界 bug）**
- 位置：`game-engine.ts:177-184` + `game-prompts.ts:164-168`。
- 现象：若上一轮 `finalOptions` 是**兜底选项**（引擎兜底 3 条，game-engine.ts:220-227），即 `states[last].options` 里的 index 不等于本次 `selectedOption` 的数字键……实际上兜底选项的 index 是 1/2/3，与正常一致；但若 AI 上一轮**强行给超界/重复编号**、或前端 `opt.index` 与 stored options 因排序出现错位，`hit` 为 undefined，`selectedOptionText` 不赋值——此时 `buildActionPrompt` 仍注入 `（承接上一轮，玩家选择了选项 N）` **却无文本**（game-prompts.ts:166-167 分支），AI 收到一个"选了但不知选了啥"的半句话，分支承接彻底失效。
- 可复现：制造上一轮 options 被兜底（AI 仅回 1 个选项）后用户选选项 2 的场景 → 下一轮 prompt 头部只有 `（承接上一轮，玩家选择了选项 2）`，无文本。
- 建议：承接分支必须有文本兜底——当 `selectedOptionText` 取不到时，优先用前端传来的 `opt.text`（page.tsx:658 已传 `opt.text` 到 actionText，但引擎只用 `selectedOption` 去 states 查，没用 actionText 兜底）；或在 `buildActionPrompt` 用 actionText 兜底文本。
- 影响：分支承接在兜底/编号错位时退化，比"完全不承接"隐蔽，属 P1。

**R-B · 选项区截断对「narrative 内自身编号列表」仍可能误伤（P1-2 残留）**
- 位置：`game-prompts.ts:200-228`。
- 规则只取**最靠后**连续块。若 AI 在正文里写了一段连续编号（如"1. 拔剑 2. 格挡 3. 反击"作为战斗描写），且这段是全文**最后**的连续编号块，会被误当成选项区并截断 narrative，正文物段丢失、且把动作描写当选项塞进 `options`。
- 可复现：构造 rawOutput 末尾为连续编号战斗描写、其后无真选项 → parseGameOutput 把该段当 options，narrative 被切。
- 建议：选项区判定除"连续块"外，增加**密度/位置/是否在 NE/CI 之后**启发式；或要求选项必须位于 `===` 围栏之后/文末且与 NE/CI 同行区隔。
- 影响：叙事丢失+假选项，P1（偶发但破坏体验）。

---

## ② P0 必修（交互断裂 / 状态丢失，按影响排序）

### P0-1 · 回退只改前端内存，后端不落库 → 导出与显示永久错位
- 位置：`page.tsx:570-589`（回退按钮仅 `setTurns`/`setState` 内存裁剪），`game-engine.ts:280-310`（落库在回退前已写全量 states），`api/game/**`（**无 DELETE /state 接口**）。
- 复现：玩到第 4 轮 → 点「回退」→ 前端显示回到第 3 轮 → 点「结束并导出」。
- 结果：`endGameAndExport` 拼接 `session.states` 全量（game-engine.ts:389-392，**含被回退的第 4 轮**）→ 回退掉的内容重新进章节正文，且 `gameSession.currentRound/totalWords` 不回滚。用户看到的和导出的不是同一份。
- 建议：新增 `DELETE /api/game/state?sessionId&round=N`，删除该轮及之后所有 gameState 并回滚 session 的 currentRound/totalWords/plotProgress；前端回退改为调该接口。
- 影响范围：所有使用回退功能的用户，导出正文错误，最高优先级。

### P0-2 · 落库先于 game_done，两步写非事务 → 断流留孤儿态
- 位置：`game-engine.ts:285-310`。`prisma.gameState.create` + `gameSession.update` **未包 `$transaction`**；SSE `game_done` 在二者之后才 yield（313-321）。
- 复现：流式 token 已发到前端、用户看到叙事，但网络断开/刷新发生在 `gameState.create` 成功、`gameSession.update` 失败之间。
- 结果：`states` 多一轮而 `currentRound` 不增 → 下一轮 `loadGameContext` 读到错位的 lastState，选项承接取的是上上轮；`totalWords` 不累加造成字数统计偏低；`getSessionSummary` 与导出对账不一致。无断流对账/补偿接口。
- 建议：将两步写包进 `prisma.$transaction`；或改为"先发 game_done，客户端确认后再二次提交"。
- 影响范围：任何断网/刷新场景，状态机错位，P0。

### P0-3 · CI| equip/discard 操作被完全忽略 → 背包状态丢失
- 位置：`game-engine.ts:232-258`（itemChanges 循环只处理 `gain`/`consume`，**无 `equip`/`discard` 分支）；types.ts:65-69 定义的操作却含 `equip`/`discard`；提示词 game-prompts.ts:48-49 也只示范 gain/consume。
- 复现：AI 输出 `CI|装备|玄铁剑|1` 或 `CI|丢弃|断剑|1` → 背包无任何变动，物品既不标记已装备也不移除。
- 结果：玩家"装备/丢弃"动作在游戏链路**零效果**，世界书与背包脱节；与 P0-1 叠加时玩家以为丢了/装备了其实没变。
- 建议：在 232-258 增加 `equip`（`existing.equipped=true`）与 `discard`（等同 consume 减到 0 移除）分支，并在提示词中示范。
- 影响范围：所有装备/丢弃交互，P0。

---

## ③ P1 建议（体验卡点）

### P1-1 · 「使用物品」按钮是死按钮（targetItem 永远不传）
- 位置：`page.tsx:54,925-936`（QUICK_ACTIONS 有 `use_item`，但 `handleAction(action.type, action.label)` **从不传 targetItem**）；`api/game/action/route.ts:16-39`（已接收 targetItem 但前端没给）；`game-engine.ts` 全程未消费 targetItem 真正约束 AI 用该物。
- 复现：玩家点「使用物品」→ 仅发 `actionType:"use_item"`，actionText="使用物品"，无物品名 → AI 不知道用哪个，提示词里 `{itemHint}` 走兜底"请列出可以使用的物品"（game-prompts.ts:161）。
- 结果：玩家**无法真正使用背包里具体物品**，游戏链路里"用物品推进"断裂；提示词里提到要带 `targetItem`（game-prompts.ts:74-75）但从未接线。
- 建议：点「使用物品」应弹出背包选择，把选中物品名作为 `targetItem` 传入；并在 prompt 中强制"本回合主角须使用 targetItem"。
- 影响范围：use_item 整条交互，P1。

### P1-2 · 进度/字数上限无硬收束，只有软提示
- 位置：`game-engine.ts` 全程无 `maxWords` 终止判断；仅提示词 game-prompts.ts:53 "接近或超过应开始收束"。`ensureGameSession` 默认 `maxWords:3000`（game-engine.ts:38），start 路由也写死 3000（start/route.ts ctx.maxWords）。
- 复现：玩到 6000 字仍可选「继续」，无"已达上限请结束"阻断；前端字数进度条 page.tsx:701-704 仅是 `min(100, total/3000)`，超了也只显示 100%。
- 结果：章节可能被玩到失控长度，与"收束到有意义方向"承诺不符；且该上限 3000 写死，不受项目/章纲控制。
- 建议：引擎在 `totalWords >= maxWords` 时，下一轮 `options` 强制收敛为"走向结尾"类，或直接禁用新选项、引导结束；`maxWords` 应可配置。
- 影响范围：长流程体验，P1。

### P1-3 · 多轮选项记忆未进 system prompt 的"历史"，承接仅单轮
- 位置：`buildGameSystemPrompt` 的 historySection（game-prompts.ts:123-132）只渲染 `playerAction.slice(0,80)` + `narrative.slice(0,150)`，且**不记录玩家选了哪个选项**；承接分支只依赖单轮 `selectedOptionText`（engine:177-184）。
- 复现：玩家连续多轮选不同分支，AI 看不到"我之前选了哪条线"，长线分支记忆弱。
- 建议：historySection 增加 `(玩家选择：选项N-文本)` 字段；或把 `selectedOptionText` 持久进 `previousTurns`。
- 影响范围：长线分支体验，P1。

### P1-4 · 相似名物品/实体仍精确匹配 → 重复建卡（G-2/G-6 遗留）
- 位置：`game-engine.ts:330-332`（ensureItemLorebook 精确匹配）、`game-engine.ts:262-264`（newEntities 精确匹配）。
- 复现："铁剑"/"铁剑·破损"各建一条 item 词条；"李尘"/"李麈"重复实体。Round 3 已报未修。
- 建议：复用 `entity-auto-creator.ts:isSimilarName`（编辑距离≤1）做归一。
- 影响范围：背包/世界书噪音，P1（遗留）。

### P1-5 · 新实体 type 解析脆弱（中文类型未归一）
- 位置：`game-engine.ts:262-264` 仅按 name 去重；newEntities 的 type 直接来自 AI 文本 `NE|名|类型|描述`（game-prompts.ts:235-241）。
- 复现：AI 写 `NE|王五|配角` 或 `NE|王五|反派角色`，type 字段自由文本，前端 `leftTab==="characters"` 只 filter `e.type==="角色"`（page.tsx:531），导致"配角/反派"类角色**不显示在角色栏**。
- 建议：type 取值做白名单归一（角色/地点/物品/势力/功法/生物/其他）。
- 影响范围：左栏角色/势力展示遗漏，P1。

---

## ④ P2 优化

- **P2-1 围栏外泄漏**：`CI|/NE|` 散写在叙事段落时不进背包且泄漏进 narrative（game-prompts.ts:230-266 仅认 `===` 围栏块）。建议对 narrative 兜底清洗 `/\b(CI|NE)\|.../`。
- **P2-2 玩家行动字段语义不一致**：前端选项按钮 actionText 写成 `选择：${opt.text}`（page.tsx:658），但引擎 playerAction 在选选项时**覆盖**成 `选择选项N：文本`（engine:289-292），两者并存，UI 的 turns 列表显示的是前端临时值、导出的 playerAction 是引擎值，回放时两套文本。建议统一。
- **P2-3 自动推进无 selectedOption**：page.tsx:591 `handleAction("custom","自动推进剧情")` 不带选项，且"自动推进"与"选选项"互斥策略未说明，连续点可能跑飞。
- **P2-4 错误重试**：`handleAction` catch（page.tsx:309-317）把 status 恢复 `playing` 但**不清空可能已部分累加的 `totalWords`**（前端 totalWords 在 game_done 成功后才累加，见 244-245，所以此处实际还好）；但 SSE 中途 `error` 事件后 `doneData` 为 null 抛"未收到游戏回合结果"（page.tsx:242），该轮前端**不落 memory 但后端可能已落库**（见 P0-2），造成前后端不一致。建议 SSE error 后前端主动 `getSessionSummary` 对账。
- **P2-5 背包"装备/货币"分类永远空**：后端 itemChange 只产 `other` category（engine:243,267），前端却分 4 类展示（page.tsx:727-822），equipment/quest/currency 区**永远空白**，给用户"背包分类坏了"的观感。

---

## ⑤ 结论与优先级建议

- **Round 3 P1-1（选项承接）已生效、稳**，但 R-A/R-B 暴露了承接在兜底/编号错位时的退化与误截，需补强。
- **本轮新确认 3 个 P0**（回退不落库 P0-1、断流孤儿态 P0-2、equip/discard 丢失 P0-3）：均为**真实状态丢失/交互断裂**，纯读码即可定位，无需端到端即可修，建议 L2 优先。
- **P1** 中「使用物品死按钮 P1-1」「无上限收束 P1-2」「相似名重复 P1-4」性价比最高。
- 诚实标注：P0-1/P0-2 的"断网后导出与显示永久错位"需用户在本地 `NODE_OPTIONS="--import ./proxy-setup.mjs" LLM_PROXY=... npm run dev` 真跑一次验收；其余 P0/P1 已给可复现步骤与文件:行号。

> 行数：约 130（含空行），远低于 400 行上限。
