# Round 3 复验+挖坑报告 · 阿游（游戏模式链路）

> 身份：会员股东「阿游」，透镜=游戏模式（抽卡/选项/剧情线联动/断流分叉）。
> 方法：严格只读诊断，未改任何 src 源码。本轮 Read 了 `src/core/game/game-engine.ts`、`src/core/game/game-prompts.ts`，grep 核对 `entity-auto-creator.ts:isSimilarName`、`types.ts`、`src/app/api/game/**` 路由清单。
> 注：任务称 v0.46.65，但 `package.json` 仍为 `0.1.0`（版本号非判断依据，以代码为准）。

---

## ① 历史修复回归核实（对照 Round 2 的 R-1/R-2/N-1/N-2/N-3）

### G-1 · ensureItemLorebook 的「物品」键已移除 ✅ 通过
- `game-engine.ts:317-335`：`keys: [itemName]`（line 328），**无字面量"物品"**。
- 全 src 仅此一处生成 item 类 lorebook 的 keys，游戏链路召回噪音已灭。
- **结论：无回归。**

### G-2 · 相似名去重（R-1 遗留 P2）❌ 仍未修
- `game-engine.ts:319-321` 仍是 `findFirst({ where: { projectId, category: "item", title: itemName } })` **精确匹配**。
- `isSimilarName`（编辑距离≤1，entity-auto-creator.ts:76-85）仍在填表建卡路径使用（line 141），**游戏链路从未引用**。
- 后果："铁剑"/"铁剑·破损"、"玄铁剑"/"玄铁剑·断"会各建一条 item 词条，且全角空格/句号/繁简变体也重复。
- **结论：回归核实 = 旧漏洞仍在，未修复。**

### G-3 · 主线一致性闸门（R-2 遗留 P2）❌ 仍未修
- `game-engine.ts` 全文件 grep `storyline|主线`：**零命中**。仍只用 `plotProgress`（AI 自报数字，line 275 原样存储）。
- `endGameAndExport`（361-467）：仅拼叙事+生成结尾+存 content，**无与角色卡/已写章节/大纲比对**，无"疑似冲突"清单。
- `newEntities` 只存进 `gameState.entities`，**从不回写 CharacterCard 或主线**。
- **结论：回归核实 = 旧漏洞仍在。**

### G-4 · 断流分叉（N-1 P1）❌ 未修
- 落库仍在 `game_done` **之前**：`prisma.gameState.create`(277-289) + `gameSession.update`(292-299)，最后才 `yield game_done`(302-310)。
- 两步写**未包 `$transaction`**（277-299），第二步失败会留孤儿态、currentRound 不增。
- `src/app/api/game/**` 路由清单：仅 `action/end/outline(chat,generate)/start`，**无断流对账/补偿接口**。
- **结论：旧漏洞仍在。**

### G-5 · 回退不落库（N-2 P1）❌ 未修
- 路由清单确认 `api/game` 下**无 `DELETE .../state` 或等价回退接口**。回退纯前端 slice 行为未变。
- `endGameAndExport` 导出拼接 `session.states` 全量（377-381），**含被回退轮**，回退内容会重新进章节正文。
- **结论：旧漏洞仍在。**

### G-6 · 选项解析脆弱（N-3 P1）❌ 未修
- `game-prompts.ts:182` 正则 `^(\d)[\.、\s]+(.+)$` 扫描**整段** rawOutput；`idx>=1 && idx<=4` 硬编码（187）。
- 选项区截断逻辑（198-201）仍按"首个选项行"切 narrative，单行"1. 剑光如雪。"会误截正文。
- 第 5+ 选项被静默丢弃并残留进 narrative。
- **结论：旧漏洞仍在。**

---

## ② 仍待修 / 新发现问题（P0/P1，标注纯逻辑 vs 需端到端）

### P1-1 · 选项根本不进剧情（新确认的硬根因，比 R-2 更明确）
- **现象**：用户"选了哪个选项 / 用了哪个物品"完全不影响后续剧情。
- **根因（本轮新取证）**：
  - `types.ts:84-85` 定义了 `selectedOption`、`targetItem`，`processGameTurn(input)` 也接收（game-engine.ts:147），但**全文 grep 确认这两个字段从未被消费**——不进 `buildActionPrompt`（只把 targetItem 当提示文案，game-prompts.ts:161，非强制）、不进 `buildGameSystemPrompt`、不推进任何状态。
  - 即：选项仅作 UI 渲染，对 LLM 下一轮 prompt **零影响**，"选择是否真的改变剧情"在代码层直接证伪——当前永远等于"没选"。
- **归类**：**纯逻辑可修**（把 selectedOption/targetItem 注入下一轮 userPrompt/systemPrompt，并记入 gameState 以便导出追溯）。但"选择是否产生可感知分支"需端到端实证。

### P1-2 · 选项解析硬编码 idx 1–4（G-6，N-3 重确认）
- 纯逻辑可修：① 仅当连续≥2行「N. 文本」成块才视为选项区；② 上限放宽 1–6；③ 选项区外"数字. "句子保留在 narrative 不截断；④ 超界选项一并收集不残留。

### P1-3 · 物品相似名去重过松（G-2）
- 纯逻辑可修：在 `ensureItemLorebook` 的精确匹配旁，复用 `isSimilarName` 做归一（先查精确，再查相似命中则复用已有条目的 title/keys）。

### P1-4 · 断流分叉 + 回退不落库（G-4/G-5）
- **需端到端实证**：根因在 SSE 时序（落库先于 game_done）与缺失后端回退/对账接口，纯读码已确认代码现状，但"断网后显示与导出永久错位"需真跑流式+人为断网复现。修复方案：① 落库挪到 game_done 之后或改"先发后确认二次提交"；② 新增 `DELETE /api/game/state?round=N` 后端接口删除该轮及之后并回滚 currentRound/items；③ 客户端断流后调 `getSessionSummary` 对账重建。

### P1-5 · 主线一致性缺失（G-3）
- 逻辑框架可加（纯逻辑）：导出前对 `newEntities` 跑角色卡/已写章节标题比对，输出"疑似冲突"清单；`plotProgress` 改为基于真实 state 推导而非 AI 自报。但"与章纲语义一致"判定**需端到端 + LLM 实证**。

### P1-6 · 新发现 · 新实体去重仅按 name 精确匹配（game-engine.ts:254-256）
- `newEntities.filter(ne => !existingEntities.find(e => e.name === ne.name))` 同样精确匹配，"李尘"/"李麈"会重复建。与 G-2 同源。
- 纯逻辑可修：复用 `isSimilarName` 归一。

### P2（轻，本轮不阻塞）
- 围栏外泄漏（R1 发现 3）：`CI|/NE|` 散写在叙事段落时不进背包且泄漏进 narrative（game-prompts.ts:204-239 仅认围栏）。建议对 narrative 兜底清洗 `/\b(CI|NE)\|.../`。
- 两步写非事务（G-4 已含）：包 `$transaction`。

---

## ③ 建议（按性价比排序，仅诊断不实现）

1. **先做纯逻辑三项**（P1-1 选项入 prompt、P1-2 选项解析放宽、P1-3/P1-6 相似名去重复用 `isSimilarName`）——风险低、覆盖 Round 2 全部遗留 P1/P2 的去重与"选择无效"硬伤，无需端到端即可验证（可加 vitest 单测 `parseGameOutput` 与 `ensureItemLorebook` 去重）。
2. **P1-4 断流/回退**与 **P1-5 主线一致**列为"需端到端"：建议 Chair 在 L2 实现后，用代理 127.0.0.1:7897 真跑一次"断网 + 回退 + 导出"，对照 `getSessionSummary` 与导出正文是否一致，再判定收敛。
3. **诚实标注**：当前"选择改变剧情"在代码层不成立（P1-1），这是比 Round 2 更根本的缺陷，建议提升为最高优先级——其余 P1 在选项无效的前提下价值折损。

> 结论：Round 2 的 1 项修复（G-1「物品」键）通过；5 项 P1/P2 漏洞（去重过松、主线闸门、断流、回退、选项解析）**全部未修复**，并新发现"选项完全不进剧情"（P1-1）这一根本缺陷。
