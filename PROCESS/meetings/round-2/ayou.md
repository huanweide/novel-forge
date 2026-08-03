# Round 2 复验+挖坑报告 · 阿游（游戏模式链路）

> 身份：会员股东「阿游」，自有项目互动游戏小说（分支剧情 + 物品收集）。
> QA 透镜：游戏模式流式（/api/game/* 回合引擎、选项解析、物品/世界卡联动、主线一致性）。
> 方法：严格只读。本轮实际 Read 了 `game-engine.ts`、`game-prompts.ts`、`api/game/action/route.ts`、`api/game/[nodeId]/page.tsx` 与相关 grep 核对，未改任何 src 源码。运行约定见 PROTOCOL.md。
> 术语大白话：① SSE（Server-Sent Events）= 服务端用 `text/event-stream` 持续单向推数据给浏览器的流式协议；② 围栏（fenced block）= 用 `===xxx===` 之类包裹、要求模型把结构化指令写在其中的标记段落；③ 去重过松 = 判断"是否已存在"只做精确相等，相似名各自建一条；④ 主线一致性 = 游戏里冒出的角色/设定，与正文大纲、角色卡是否冲突；⑤ `game_done` = 引擎一回合跑完、发"结束"事件给前端。

---

## 回归验证（逐项：问题 / 预期 / 实际 file:line / 结论）

### R-1 · ensureItemLorebook 的 keys 已移除字面量"物品"，且去重仍过松

- **问题（对照 R1 发现 4）**：R1 指出 `ensureItemLorebook` 的 `keys` 固定含字面量 `"物品"`，导致按"物品"召回会命中全部道具词条；且去重仅精确匹配，相似名会重复建卡。
- **预期**：`keys` 只含 `itemName`；全链路不再有把"物品"二字当召回关键词的写法；相似名（如"铁剑"/"铁剑·破损"）应归一去重。
- **实际**：
  - `game-engine.ts:317-335` 现状：`keys: [itemName]`（line 328），已**移除**字面量"物品"。CHANGELOG（`src/lib/changelog-data.ts:34`、`64`）也记录"ensureItemLorebook 移除字面量「物品」键灭召回噪音"。✅
  - 全 src grep「物品」：游戏世界卡召回（lorebookEntry.keys）只在 `ensureItemLorebook` 一处生成；`dissect/engine.ts:782` 有 `keys:["物品","法宝",...]` 但属于「章节解剖」模块，与游戏链路无关。故游戏链路已无"物品"召回噪音。✅
  - **去重仍过松**：`game-engine.ts:319-321` 仍是 `findFirst({ where: { projectId, category: "item", title: itemName } })` 精确匹配，未复用 `entity-auto-creator.ts:76` 的 `isSimilarName`（该函数仅在 `entity-auto-creator.ts:141` 用于填表建卡，游戏链路未引用）。"铁剑"与"铁剑·破损"会各建一条 item 词条，且 `title` 带全角空格/句号/繁简变体也会重复。❌
- **结论**：keys 修复 **通过**；但「相似名去重过松」**有漏洞（未修）**。

### R-2 · 抽卡/选项是否推进"主线/活跃剧情线"，及主线一致性闸门

- **问题（对照 R1 发现 5）**：R1 指出游戏导出不校验与主线/角色卡一致性，且 `newEntities` 不回写主线。
- **预期**：存在"主线/活跃剧情线"对象被抽卡与所选选项推进；导出前有与角色卡、已写章节的一致性闸门。
- **实际**：
  - 全 `game-engine.ts` grep `storyline|主线`：**无任何匹配**。仅存在 `plotProgress`（一个 0–100 的数字）相关（line 39/72/137/275/286/297/308）。`plotProgress` 来自 AI 自报（`game-prompts.ts:51-52`、`242-246`），仅 `parsed.plotProgress > 0 ? parsed.plotProgress : session.plotProgress`（line 275）原样存储，**非基于真实剧情线推导**，无法保证一致性。
  - 选项对剧情线无影响：`processGameTurn` 接收 `selectedOption`/`targetItem`（line 34-40），但全文未消费这两个字段——既不进 prompt、也不推进任何 storyline 状态；选项仅作 UI 选择（`page.tsx:651` 渲染 `state.options`）。即"选了哪个选项"不会推进任何剧情线对象。
  - 导出闸门缺失：`endGameAndExport`（`game-engine.ts:361-467`）只做"拼叙事 + 生成结尾 + 存 StoryNode.content"（377-453），无与角色卡/已写章节/主线比对；`newEntities` 仅存进 `gameState.entities`，从不回写 `CharacterCard` 或主线。
- **结论**：**有漏洞（未修）**——既无"活跃剧情线"被选项推进，也无主线一致性闸门；`plotProgress` 仅是 AI 自报数字，对一致性无约束力。

> 附带确认（服务端正根因仍存，详见「新发现」）：R1 的 P1「断流分叉」（`game-engine.ts:277-299` 先落库、`302` 才发 `game_done`；`page.tsx:230/242/309` 客户端需 `game_done` 才能提交）与 P1「回退不落库」（`api/game` 下无 `DELETE /api/game/state` 路由，grep 零命中）**均未修复**。

---

## 新发现（P0/P1：现象 / 根因 / file:line / 修复方案）

> 本轮回到的 3 个 P1 实为 R1 发现 1/2/6 的遗留未修项（经本轮重新 Read 确认根因仍在）。按协议 L3「复验+挖坑」，列为仍开放的 P1。

### N-1（P1）· 断流分叉：SSE 中断后服务端/客户端状态错位，无对账
- **现象**：网络抖动或模型超时导致 `game_done` 事件未送达时，前端报"未收到游戏回合结果"，但服务端其实已落库该轮（含叙事/背包/轮次）。此后用户看到的剧情/背包与服务端导出内容永久错位；下一轮客户端用本地旧 `currentRound` 续写，漏掉服务端已提交的回合。
- **根因**：持久化在 `game_done` **之前**完成——`processGameTurn` 先 `prisma.gameState.create`（277-289）再 `gameSession.update`（292-299），最后才 `yield game_done`（302-310）。客户端（`page.tsx`）只有收到 `game_done` 才把 `doneData` 合并进本地 `state`（230→242→286-297）；若 `reader` 在 `game_done` 前结束，`doneData` 为 null → 抛错（242）→ `catch`（309）仅复位 `status:"playing"` + `error`，`state.narrative` 停留在上一轮，且流式期间已写入 `lastNarrative` 的半截 token 残留在界面（224-229）。无任何调用 `getSessionSummary` 与服务端对账的接口。
- **file:line**：`game-engine.ts:277-310`（落库先于 game_done）、`page.tsx:224-229,242,309-315`。
- **修复方案**：① 把落库挪到 `game_done` 发出**之后**（或改为"先发 game_done、客户端确认后再二次提交"）；② 客户端断流后调用 `getSessionSummary`（接口已存在，`game-engine.ts:49`）拉回真实 `states` 对账并重建 `narrative/items/currentRound`；③ 显示"本轮已保存但显示未刷新，已自动同步"而非笼统报错。

### N-2（P1）· 回退不落库：前端回退不删后端轮次，且落库两段写非事务
- **现象**：游戏页"回退"按钮只改前端 `turns`，被回退的轮次仍留在 DB；随后"结束并导出"会把回退内容连同其获得的物品重新拼进章节正文，与用户预期"撤销该轮"矛盾。另：引擎落库分两步（`create` + `update`），若第二步失败会留下孤立 `gameState` 且 `currentRound` 不增，下一轮回合数错位、物品快照用旧值。
- **根因**：① `api/game` 下无 `DELETE /api/game/state` 或等价回退接口（grep 零命中）；回退纯前端 slice（行为见 R1:570-589，本轮未改）。② `endGameAndExport` 拼接 `session.states`（377-381）包含被回退轮；③ 引擎 277-299 两步写未包 `prisma.$transaction`。
- **file:line**：`game-engine.ts:277-299`（非事务两步写）、`game-engine.ts:377-381`（导出拼接全部 states）、缺失的 `DELETE /api/game/state` 路由。
- **修复方案**：① 新增 `DELETE /api/game/state?round=N` 后端接口，按 round 删该轮及之后状态、回滚 `currentRound` 与 `items` 快照（复用 `resetGameSession` 思路）；回退按钮改调该接口。② 若暂不做后端，应禁用回退或明确标注"仅本地预览，导出仍含此轮"。③ 引擎两步写包进 `$transaction`，避免半落库孤儿态。

### N-3（P1）· 选项解析脆弱：编号硬限 1–4，且会误伤叙事、丢超界选项
- **现象**：AI 若给出第 5 个选项，被静默丢弃并残留进 `narrative` 污染正文；反之叙事里任何以"数字. "开头的句子（如"1. 剑光如雪。"）会被误判为选项，导致 `narrative` 被截断到首个选项前，正文残缺并最终进导出章节。
- **根因**：`parseGameOutput` 用全局正则 `/^(\d)[\.、\s]+(.+)$/gm`（line 182）扫描**整段** `rawOutput`，且 `idx>=1 && idx<=4` 硬编码（187）；一旦命中选项行，就把 `narrative` 截到 `firstOptionStart`（198-201）。它不区分"选项区"与"正文中恰巧以数字开头的句子"，也不容超界选项。
- **file:line**：`game-prompts.ts:182-201`（选项正则 + 截断）、`game-engine.ts:212-219`（选项 <2 才兜底，未处理超界/误截）。
- **修复方案**：① 仅当**连续多行**「N. 文本」成块（≥2 行且编号连续）才视为选项区，避免单行误判；② 上限放宽到 1–6，超界选项一并收集、不残留进 narrative；③ 选项区之外的"数字. "句子原样保留在 narrative，不截断。

---

## 优先级建议

**P1（本轮必修，已确认根因仍在）**
1. N-1 断流分叉——直接造成"显示剧情"与"导出正文"永久不一致，是体验硬伤。
2. N-2 回退不落库——回退形同虚设，导出会把撤销内容重新端上桌。
3. N-3 选项解析脆弱——会静默污染/截断正文，且发生在每次回合解析，触发概率高。

**P2（建议纳入下一轮，均为 R1 遗留未修）**
- 围栏外泄漏（R1 发现 3）：`parseGameOutput` 只认 `===新实体===`/`===角色物品变动===` 围栏（`game-prompts.ts:204,222`）；模型把 `CI|获得|青锋剑|1` 散写在叙事段落时，既不进背包又原样泄漏进 `narrative`→导出正文。建议解析后对 narrative 跑 `/\b(CI|NE)\|[^|\n]*(?:\|[^|\n]*){0,4}/g` 兜底清洗并并入变动。
- 物品世界卡去重过松（R-1 已确认）：复用 `isSimilarName` 做归一去重（`game-engine.ts:319-321`）。
- 主线一致性缺失（R-2 已确认）：导出前对 `newEntities` 跑角色卡/已写章节比对，输出"疑似与主线冲突"清单（`endGameAndExport` 361-467）。

**R1 已确认修复项（本轮复验通过）**
- ensureItemLorebook 移除字面量"物品"键（`game-engine.ts:328`），召回噪音已灭。

---

## 结论
R1 仅"物品"召回键修复通过；断流分叉、回退不落库、选项解析脆弱三项 P1 根因仍在，会直接污染游戏剧情与导出正文，须优先修复。
