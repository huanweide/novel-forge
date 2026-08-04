# Round 13 诊断报告 · 游戏全链路（只读）

- **诊断人**：阿游（会员股东 / 真实使用者 + 监控后台视角）
- **工作副本**：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge\`
- **版本**：HEAD = `v0.46.77`（Round 12 末版）
- **运行时**：dev 服务 `http://127.0.0.1:3001`（HTTP 200）；LLM = `deepseek-v4-flash`（DeepSeek 官方，推理模型，`https://api.deepseek.com`）；PostgreSQL 17 `127.0.0.1:5432`
- **测试方法**：curl 真机调 API（start / action-SSE / state）+ 离线忠实复刻 `game-engine` 流水线 + 逐文件源码取证（file:line）。所有 runtime 证据均粘贴真实响应。沙箱无 Chromium/显示，纯交互/悬浮项标注「需本地浏览器验收」。
- **测试数据落库说明**：真机测试统一跑在 Round12 测试专用项目 `40fe92c4-…`（节点 `45e24129-…`），未触碰真实用户小说。

---

## 概要（一句话）

游戏全链路在 `deepseek-v4-flash` 下**真机非空、流式可用、幂等与前后端对齐均已稳**（N1 预算修复确认生效、A1 幂等确为有效 where），但 **`game/start` 端点缺空响应保护**（而 `game/action` 有），偶发 LLM 空响应会被落库成「空开场轮次」——这是本轮唯一 P1，无 P0。

---

## 一、Round 12 修复复测结论（A1–A4 + N1，是否仍稳）

| 修复项 | 结论 | 证据 |
|---|---|---|
| **N1** 推理模型预算保护（`resolveMaxTokens` 强制 ≥2500） | ✅ 稳，且真机生效 | `client.ts:83-91` 正则含 `v4-flash` → `deepseek-v4-flash` 命中；start 端点硬编码 `maxTokens:2500`（`start/route.ts:80`）、action 端点 `maxTokens:2500`（`game-engine.ts:333`）。真机 start 调用实测 `max_tokens=2500`，DeepSeek 返回 `completion_tokens=713`（含 `reasoning_tokens=310`）→ 正文非空。5 次离线忠实复刻（同提示词/同上下文）连续返回 narrative 478/360/865/496/601 字，内容稳定非空。 |
| **A1** GameState 写轮次幂等（防 P2002） | ✅ 稳（`upsert` + 命名唯一约束有效） | `game-engine.ts:419-457` 用 `prisma.gameState.upsert({ where: { sessionId_round: … } })`；`schema.prisma:376` 有 `@@unique([sessionId, round])`；生成的 Prisma 客户端确认 `GameStateWhereUniqueInput.sessionId_round?: GameStateSessionIdRoundCompoundUniqueInput` 为合法 where 输入（`src/generated/prisma/models/GameState.ts:283`），故 upsert 不抛 P2002，重试/并发同轮幂等。 |
| **A2/A3**（同义动词归一 / 7 值枚举对齐） | ✅ 稳 | 见 P0/P1 章节「OP_MAP / ItemChange 枚举」取证。 |
| **A4** 开局建世界卡 + owner 去重 | ✅ 稳（代码层确证，本轮测试未触发 itemChange 故未落库实测） | `ensureItemLorebook`（`game-engine.ts:478-499`）按 `归属：{owner}` 标签做去重：仅当「同 title 且同 owner」缺失才 `create`，否则保留。start（`start/route.ts:124-127`）与 action（`game-engine.ts:402-406`）均对 `gain` 物品补世界卡，维度含 owner。 |

---

## 二、P0 / P1 / P2 分列

### P0（阻断级）—— 无
本轮未发现阻断级问题。N1（正文非空）、A1（轮次幂等）、SSE 流式、abort/停止、前后端背包/枚举对齐均正常工作。

### P1（建议修复）

**P1-1 · `game/start` 缺少「空响应保护」，偶发空开场会被落库**

- **问题描述**：`game/action` 在流式结束后有空响应保护——`if (!fullResponse.trim()) { yield error; return }`（`game-engine.ts:354`），空轮次不会提交。但 `start/route.ts` **没有对等保护**：若 DeepSeek 偶发返回空正文（推理模型/网络抖动），`parseGameOutput("")` 得到 `narrative=""`、无选项 → 走 `finalOptions.length<2` 兜底（`start/route.ts:96-102`），随后仍 `prisma.gameState.create({ round:1, narrative:"" … })`（`start/route.ts:130-142`）**写成一轮空叙事**。
- **复现 / 证据（真实响应）**：
  - 真机 `POST /api/game/start`（测试项目节点 `45e24129-…`）返回 `HTTP 200 time=29.6s`，但解析结果：
    ```
    narrativeLen = 0
    options = [{"index":1,"text":"仔细观察周围环境"},{"index":2,"text":"与身边的人交谈"},{"index":3,"text":"继续探索前进"}]  // 兜底3项
    items = []  newEntities = []  totalWords = 0  currentRound = 1
    ```
    即空叙事 + 兜底选项已被持久化为第 1 轮（实测落库）。
  - 离线忠实复刻同端点流水线（`buildGameSystemPrompt`+`chatStream`+`parseGameOutput`，同 project/node/上下文）：首次跑 `FULL LEN = 0`（空），随即连续 5 次 `478/360/865/496/601` 非空——证明空响应是**间歇性**而非必然，但一旦发生即污染数据库。
- **影响**：真实用户点「开始游戏」时偶发得到空白开场章节 + 通用兜底选项，且已写入 DB / 世界书联动，需手动重开（resetGameSession 会删重建，但体验受损）。属于可靠性缺口，定性 P1。
- **建议修复方向**：
  1. 在 `start/route.ts` 收集完 `fullResponse` 后，照搬 `game-engine.ts:354` 的空保护：`if (!fullResponse.trim())` → 重试一次（或直接 4xx/error 让前端提示「生成失败，请重试」），**不要在空响应时 `gameState.create`**。
  2. 可选：对 start 也加 1 次重试（与 `client.ts` 的 3 次网络重试区分，属于「空业务响应」重试）。

### P2（优化级）

**P2-1 · 推理模型 2500 预算地板偶发「触顶」，潜在叙事截断 + token 浪费**
- 证据：`LlmCallLog` 实测多条 `completionTokens = 2500`（恰为 `maxTokens` 上限），例如：
  ```
  {"model":"deepseek-v4-flash","completionTokens":2500,"totalTokens":3267}  // 09:06:43
  {"model":"deepseek-v4-flash","completionTokens":2500,"totalTokens":3434}  // 09:06:22
  ```
  其余为 743 / 2096 / 974 等。2500 = 撞到预算上限，意味着该轮 `finish_reason` 很可能是 `length`（被截断），推理 + 正文合计吃完 2500 token。游戏开场本只求 300–600 字，2500 地板对推理模型偏保守且浪费；若某轮推理偏长，正文被截。
- 影响：偶发叙事被截断、成本偏高。
- 建议：对游戏轮次按 `round` 动态预算（如开场/收尾给足、中间轮可酌情下调）；或评估 DeepSeek 是否支持 reasoning 预算单独配置，避免正文被思考链挤占。

**P2-2 · 选项解析兜底率偏高（action 走 fallback 选项）**
- 证据：真机 `POST /api/game/action`（explore）SSE 正常（`HTTP 200 time=9.9s`，**412 个 token 事件**，`game_done.narrativeLen = 624`，无 error），但返回选项恰为兜底三项 `["继续向前探索","仔细观察周围环境","与身边的人交谈"]`（`game-engine.ts:366-370`）——说明 AI 本轮输出的选项未被 `parseGameOutput` 捕获（候选块判定 / 非数字编号 / 字母编号 `A.` 等未命中）。start 的离线复刻则正常解析出 4 个选项，故为**格式依赖的间歇性**问题。
- 影响：用户每轮看到的选项不全是 AI 真实产出，交互质量下降。
- 建议：强化 `parseGameOutput` 选项区识别（放宽编号：`A–D`/中文数字/`①②③`；允许选项与叙事之间空行；对「末尾连续候选块」判定更宽容）。

**P2-3 · 监测面板「按项目成本」UI 需本地浏览器验收**
- 数据层正常：`LlmCallLog` 累计 125 条，按 `model/role/promptTokens/completionTokens/totalTokens/estimatedCost/baseURL` 记录，推理 token 已计入（见下「推理 token 计入」）。面板渲染（图表/筛选）属纯前端，沙箱无法验收。

**P2-4 · 全局交互（按钮教程 / 防误触 / 悬浮）需本地浏览器验收**
- 已取证：`game/[nodeId]/page.tsx` 关键按钮具备基础 a11y（`返回工作区` `aria-label:446-447`、左右抽屉 `role="dialog" aria-modal aria-labelledby:509-511/748-750`、`GameParticles` `aria-hidden`）。「停止」按钮 `handleStop`（`page.tsx:339-340`，`Icon name="stop"`）已接 `AbortController` 并透传 `signal`（`page.tsx:221-234`）。但教程提示、误触拦截（如结束导出二次确认）、悬浮卡等需浏览器实操验收。

---

## 三、诊断焦点逐项取证（游戏全链路）

1. **`game/start` 在 deepseek-v4-flash 下真机非空？**
   - 预算层：✅ 强制 2500 生效（见 N1）。
   - 真机非空：⚠️ 偶发空（见 P1-1，真机本次返回 `narrativeLen=0`）。非空路径验证充分（5/5 离线 + 1 次真机非空 action）。
2. **`game/action` SSE 流式真机非空？**
   - ✅ 验证：`POST /api/game/action` → `HTTP 200`，SSE 抓取 **412 个 `token` 事件**，`game_done` 含 `narrativeLen=624`、3 选项、`wordCount=624`、无 `error` 事件。流式 token 逐个产出、结尾 `game_done` 汇总，链路完整。
3. **GameState upsert 轮次幂等（防 P2002）？**
   - ✅ 见 A1：`sessionId_round` 为合法 where 输入，upsert 同轮更新不抛错。运行时未强制复现重试（需注入故障），但类型 + schema + 代码三重确认。
4. **前端背包镜像含 unequip/destroy/skip 分支？**
   - ✅ `applyFrontendItemChanges`（`reconcile.ts:35-104`）覆盖 `gain` / `consume|discard` / `equip` / `unequip`（`:82-87`）/ `destroy`（`:88-97`）/ `skip`（`:98-101`），与后端 `applyItemChanges`（`game-engine.ts:40-135`）语义对齐；均返回新数组（不可变更新），适配 React。
5. **ItemChange.operation 7 值枚举前后端对齐？**
   - ✅ 类型定义 7 值 `gain|consume|equip|discard|unequip|destroy|skip`（`types.ts:67-79`）；后端 `applyItemChanges` 分支逐一对应（`game-engine.ts:40/58/68/71/75/85/96` + 兜底 `:99-134`）；前端 `applyFrontendItemChanges` 同上。后端 `parseGameOutput` 经 `OP_MAP` 归一为这 7 个英文枚举（`game-prompts.ts:413`），前端直接消费归一后枚举，无二次比较错位。
6. **OP_MAP 同义动词归一化？**
   - ✅ `game-prompts.ts:18-102` 覆盖获得/消耗/装备/丢弃/卸下/流转/损毁 七大类及大量同义词（拾取/捡到/吃掉/喝/损毁/烧毁/典当…），唯一归一化点（注释明言「无需四处改比较逻辑」）。兜底 `SAFE_SKIP`/`GAIN_LIKE`/`未知→warn+skip` 收窄，避免静默丢物/反向加物（`game-engine.ts:103-134`）。
7. **开局建世界卡 + owner 去重？**
   - ✅ `ensureItemLorebook`（`game-engine.ts:478-499`）以 `归属：{owner}` 内容标签去重，start（`start/route.ts:124-127`）与 action（`game-engine.ts:402-406`）均对 `gain` 物品建/补 item 类世界卡，维度含 owner，主角与同名 NPC 物品各建独立词条（Round12 A4b）。
8. **推理模型 reasoning token 是否计入用量？**
   - ✅ 计入。流式侧：`readStream` 对 `delta.reasoning_content` 增量计入 `completionTokens`（`client.ts:345-347`），并在收到最终 `data.usage` 时用 API 真实值覆盖（`client.ts:358-361`），`onUsage` → `recordLlmCall`（`client.ts:445-454`）落 `LlmCallLog`。DeepSeek 返回的 `completion_tokens` 本身包含 `reasoning_tokens`（实测 `completion_tokens_details.reasoning_tokens:310`），故监测面板统计已含推理消耗。实测 `LlmCallLog` 记录正常（125 条，含 `completionTokens` 743/2500/2096/974 等）。

---

## 四、全局体验清单（20 点精神）覆盖情况

- **逐按钮/页面交互**：游戏页「观察/对话/战斗/探索/使用物品/休息/自定义/选项/停止」按钮（`page.tsx` 动作区），`AbortController` 停止链路闭环（`:119/:221-234/:339-340`）。实际点击渲染 → **需本地浏览器验收**。
- **填表溯源**：属导入/三卡（角色卡/世界卡/势力卡）透传溯源，非游戏链路主体；本轮未单独复测，建议后续轮次覆盖（Round12 已实现「填表透传溯源与跨表防错放」）。
- **世界卡去重**：✅ 见焦点 7（owner 维度去重）。
- **LLM 上下文记忆**：✅ `loadGameContext` 注入 `previousTurns`（最近 6 轮，`game-prompts.ts:265-274`）、实体/背包/章纲/已有正文，保证跨轮记忆连贯。
- **监测面板 token/费用**：✅ 数据层（`LlmCallLog` 全量记录，含推理 token）；面板 UI 渲染 → **需本地浏览器验收**。
- **按钮意义/教程/防误触**：按钮有 `title`/`aria-label`（`:446-447` 等）；教程引导、结束导出二次确认、误触拦截 → **需本地浏览器验收**。
- **a11y**：基础属性已具备（`aria-label`、`role="dialog"`、`aria-modal`、`aria-hidden` 装饰层）；完整键盘可达性/对比度/读屏流程 → **需本地浏览器验收**。

---

## 五、诚实标注「需本地浏览器验收」项

1. 游戏页全部按钮点击渲染、选项选择、背包拖拽/装备/卸下交互的实际 UI 表现。
2. 「停止生成」后的前端对账覆盖视觉效果（后端逻辑已证：abort → 不提交 → `GET /api/game/state` 拉权威态）。
3. 监测面板（token / 按项目成本）图表与筛选 UI。
4. 教程提示、防误触（结束导出二次确认等）、悬浮卡。
5. 完整 a11y 走查（键盘导航、对比度、读屏播报）。

---

## 六、结论回答

**本轮是否还有 P0/P1 建议：是。**
- P0：无（0 项）。
- P1：1 项 —— `game/start` 缺空响应保护，偶发 LLM 空响应被落库为空开场轮次（对比 `game/action` 已有 `game-engine.ts:354` 保护）。
- P2：4 项（2500 预算触顶截断、选项解析兜底率、监测面板 UI、全局交互/a11y 浏览器验收）。

> 说明：以上仅产出诊断报告，**未修改任何源码 / 配置**。真机测试统一在 Round12 测试专用项目（`40fe92c4-…`）节点（`45e24129-…`）进行，已避免污染真实用户小说数据。
