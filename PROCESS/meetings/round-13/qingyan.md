# Round 13 诊断报告 · 青砚透镜（实体-匹配-世界书）

- 产品：`novel-forge` 工作副本 `C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge\`
- HEAD = `v0.46.77`（`c820c82`）；dev 服务 `http://127.0.0.1:3001`（HTTP 200）；LLM = 真实 DeepSeek `deepseek-v4-flash`；PostgreSQL 17 @ `127.0.0.1:5432`
- 透镜定位：**实体检测 → 匹配词边界 → 世界书** 全链路只读体检 + 全局体验清单（用户 20 点精神）
- 方法：真实 API 调用（curl）+ 真实函数 runtime 探针（tsx 载入真实模块 `entity-detector.ts`/`match.ts`/`entity-highlighter.ts`）+ 逐文件源码取证（file:line）+ 生产库抽样。**未修改任何源码/配置。**
- 实验用项目：`R12-E2E-GEN`（`757834b6-...`，23 词条/3 章节节点，真机数据）

---

## 概要（一句话体验结论）

世界书仍被**谓语短语碎片**大规模污染——Round 12 的 Q1「碎片过滤补强」只是扩充了黑名单，并未结构性堵住「动词+后缀字」类碎片，当前 `v0.46.77` 代码对真实泄露样本仍有 **16/28 通过**；同时 `game/start` 在推理模型下稳定返回空正文（缺空流保护），且自动生成词条把「地点/location/法宝/artifact」这类通用词写进触发词污染高亮与召回——**本轮仍有 P0/P1 建议**。

---

## Round 12 Q1/Q2/Q3 复验结论（先回答核心问题）

| 项 | Round 12 承诺 | 本轮实测 | 是否仍稳 |
|----|--------------|----------|----------|
| **Q1** `isCompleteEntityName` 碎片过滤 | 车铃/玻璃门/手指骨 等不再漏进世界书 | 上述三例确被拦截 ✓；但「动词+后缀字」类谓语短语（`倒提长剑`/`摸出一块铁`/`转动眼珠`/`只能横剑`）在**当前代码仍 `true` 进世界书** | ❌ **部分失稳** |
| **Q2** `matchNameStrict` 词边界 | 2字保召回不吞并；3字+ 覆盖区间吞并防「李星云剑法」误命中「李星云」 | 2字 `王林`/`叶凡`=true（保召回）✓；3字+「李星云」全内嵌于「李星云剑法」=false ✓；中段嵌「星云剑」于「李星云剑法」=false ✓ | ✅ **稳定** |
| **Q3** aliases 去重复活 + 高亮尾边界 + 非颜色线索 | 别名入映射防双卡；「王林」不在「王林海」误亮；title/aria-label | 别名进 map ✓（`buildEntityMapFromData`）;「王林」不在「王林海」误亮 ✓（2字尾边界）；title/aria-label 非颜色线索 ✓（`rehype-entity-highlight.ts:87-88`） | ⚠️ **基本稳，但有召回副作用** |

> 结论：**Q2 稳、Q3 基本稳；Q1 名义修复但实际结构未堵，仍是本轮头号问题。**

---

## P0

### P0-1 · 世界书碎片过滤器结构性失效：谓语短语（动词+后缀字）仍大规模漏进世界书
- **问题描述**：`isCompleteEntityName`（`src/lib/entity-detector.ts:216-243`）的拦截逻辑是「黑名单功能词 / 末字功能词 / ≥5字须后缀 / ≤3字首字器物」的组合。当碎片是「动词+实体后缀字」且不含黑名单动词时（如「倒提长剑」「摸出一块铁」「转动眼珠」「只能横剑」「出一口带铁」「牙拧转剑」「雾气变」「一步步」「但握剑」「崖壁石」「偏右侧石」「几粒碎石」「刀没入水银」「指骨一根根」「切下几根」），全部判 `true` 进入世界书。该 gate 在 `src/lib/entity-auto-creator.ts:190-193`（`autoCreateEntities`）被调用，是自动建卡唯一闸门。
- **证据（runtime 探针，当前 v0.46.77 真实代码）**：
  ```
  倒提长剑  len=4  => 过闸=true  (进世界书)
  摸出一块铁  len=5  => 过闸=true
  转动眼珠  len=4  => 过闸=true
  只能横剑  len=4  => 过闸=true
  出一口带铁  len=5  => 过闸=true
  牙拧转剑  len=4  => 过闸=true
  雾气变    len=3  => 过闸=true
  一步步    len=3  => 过闸=true
  但握剑    len=3  => 过闸=true
  崖壁石    len=3  => 过闸=true
  偏右侧石  len=4  => 过闸=true
  几粒碎石  len=4  => 过闸=true
  刀没入水银  len=5  => 过闸=true
  指骨一根根  len=5  => 过闸=true
  切下几根  len=4  => 过闸=true
  李星云剑  len=4  => 过闸=true   (李星云剑法的子串，与正词条重复建卡)
  ```
  这些名字 100% 通过 `isCompleteEntityName`，且 `detectEntities` 的武器/材料/地点正则（`entity-detector.ts:71-117`）会真实产出它们。
- **生产佐证（API 真机）**：`GET /api/entities/highlight?projectId=757834b6-...` 返回 31 条，其中 **28 条是句子碎片**（如「转动眼珠」「倒提长剑」「插进崖边石」「摸出一块铁」「羽顺势后退三步」「用碎石」…），仅「青石镇」等少数为真专名。这些词条 `content` 为 `[自动发现] 物品「…」`（模板来自 `entity-auto-creator.ts:250`），证明它们经 `autoCreateEntities`→`isCompleteEntityName` 闸门漏入。
  - 注：该库数据生成于 `2026-08-04 15:08Z`，早于 Q1 补强提交 `dbe1289`（`16:23+0800`），属「修复前」数据；但**探针证明当前代码仍放行上述 16/28**，故问题未因修复消失，只是从 28 降到约 12（该数据集）。
- **影响**：世界书被垃圾词条淹没 → 这些碎片同时作为召回触发词注入 LLM 上下文（`entities/highlight` 返回 `keys` 作为触发词），**反向污染生成质量**；且「李星云剑」类子串会与「李星云剑法」重复建卡。直接击穿「实体→世界书」链路可信度。
- **建议修复方向**：黑名单补强不可持续。改为**结构性判定**：
  1. 对 2–4 字候选增加「首字/前缀是否为动词或方位/数词」判别（如 `倒/摸/转/插/出/退/用/切/但/偏` 等动作字 + 后缀字 → 视为动宾短语，拒）；
  2. 引入「名词性后缀须有修饰限定成分」规则：仅「形容词/专有修饰+后缀」（青锋/玄铁/千年灵芝）放行，裸「动词+单后缀字」拒；
  3. 对 `detectEntities` 正则收紧：武器/材料/地点后缀前 1–3 字若整体构成动宾/方位/数量结构则不下标；
  4. 子串与已存在正词条构成「前缀包含」时跳过（灭「李星云剑」）。

---

## P1

### P1-1 · `game/start` 在推理模型下稳定返回空正文（缺空流保护），游戏开局白屏
- **问题描述**：`POST /api/game/start` 对 `deepseek-v4-flash`（推理模型）返回 `narrative:""`（len=0）+ 3 个兜底选项，开局无任何叙事文本。而 `game/action`（`processGameTurn`）同模型同 prompt 结构却返回 704 字非空正文。
- **证据（API 真机，两次独立调用）**：
  - 节点 `0bcb5207-...`（已有 1332 字正文）：`narrativeLen: 0`，`options:[仔细观察周围环境, 与身边的人交谈, 继续探索前进]`
  - 节点 `be0174eb-...`（空正文）：`narrativeLen: 0`，`options:3`
  - 对照 `game/action`（选 option 1）：`narrativeLen: 704`，首句「崖底的景象与崖口判若两个世界…」
- **根因**：`processGameTurn` 在 `src/core/game/game-engine.ts:354-360` 有**空流保护**（`if (!fullResponse.trim()) { yield error; return; }`，不提交空轮），而 `src/app/api/game/start/route.ts` 整条 `start` 路径**无此保护**——`fullResponse` 为空时直接 `parseGameOutput("")`→空 narrative + 兜底选项，静默返回白屏开局。链路同用 `client.chatStream` 收集 `chunk.content`（`game-engine.ts:339`、`start/route.ts:79`），说明推理模型对 start 提示词吐出了空 body（思考链吃掉预算的典型表现），start 未像 action 那样兜底/重试。
- **影响**：游戏开局体验断裂（只有三个按钮、无故事），与 Round 12 N1 验收「start/action 复测非空」**直接矛盾**（疑似回归或 N1 仅覆盖了 action）。
- **建议修复方向**：① 给 `game/start` 加上与 `processGameTurn` 一致的空流保护 + 一次重试；② start 提示词强制「先叙事后选项」并禁止把正文放进 reasoning；③ 若 `existingContent` 非空，可回退把现有正文作为首屏 narrative 渲染，避免空白。

### P1-2 · 自动建卡把通用类别/类型词写进触发词 → 高亮与召回双重污染
- **问题描述**：`autoCreateEntities` 建词条时 `keys: [name, label, entity.type]`（`src/lib/entity-auto-creator.ts:249`）。其中 `label`/`entity.type` 是通用词（如 `地点`/`location`/`法宝`/`artifact`/`材料`/`功法`）。`GET /api/entities/highlight`（`src/app/api/entities/highlight/route.ts:63-68`）把这些 `keys` 全量作为高亮/触发词返回。
- **证据（API 真机）**：`entities/highlight` 返回名含 `地点 | location | 法宝 | artifact | 材料 | material | 功法 | technique` 等通用词。正文任何出现「地点」「法宝」之处都会被**染成实体色**并被当作世界书触发词注入上下文。
- **影响**：高亮噪声 + 召回误触发（无关 lore 被反复注入），与「匹配去污染」目标背道而驰；手动建卡不受影响（keys 为用户自有），仅自动建卡路径中招。
- **建议修复方向**：自动建卡 `keys` 仅取 `[name]`（及真实别名），**不要**把 `label`/`entity.type` 当触发词；类别信息走 `category` 字段，不进 `keys`。

### P1-3 · 世界书词条缺结构化溯源/归属字段，「填表溯源」对 lore 不完整
- **问题描述**：`LorebookEntry` 模型（`prisma/schema.prisma:98-112`）仅有 `title/category/keys/content/depth/...`，**无任何 source 节点 / owner 归属字段**。对照 `StoryNode` 有 `source`+`sourceNodeId`（`schema.prisma:251-252`）、角色卡在 `entity-auto-creator.ts:227` 把 `[第${sourceNodeId}章自动发现]` 写入 `background`；但自动建 lore 时 `content` 仅写 `[自动发现] ${label}「${name}」，待补充设定。`（`entity-auto-creator.ts:250`），**不记来源章节、不记归属角色**。
- **证据**：schema 字段清单 + `entity-auto-creator.ts:244-255` 建卡逻辑无 source/owner 赋值。
- **影响**：用户无法从世界书条目反查「它从哪章来/属于谁」，与 Round 12「填表溯源/归属」目标在 lore 维度缺位；归因清理困难（尤其 P0-1 的碎片一旦入书，无法定位来源章节批量回滚）。
- **建议修复方向**：`LorebookEntry` 增加 `sourceNodeId?`/`owner?` 字段，自动建卡时写入来源章节与（如可推断的）归属角色；UI 展示「来源：第X章 / 归属：Y」。

---

## P2

### P2-1 · 2字角色名/别名在连续正文中几乎不高亮（2字尾边界副作用，Q3 召回回归）
- **问题描述**：`findEntitiesInText` 对 2字名要求**头尾均为边界**（`src/core/entity-highlighter.ts:205-214`）。中文连续正文里 2字名后几乎总跟 CJK 字 → 尾边界不成立 → 不高亮。这虽灭了「王林」误亮「王林海」（✓ Q3 目标），但令「王林」「叶凡」「小林(别名)」在正常行文里极少被染色。
- **证据（runtime 探针）**：文本「王林海是王林的师兄，小林后来也来了。」→ matches 仅 `["王林海@0-3"]`；「王林」紧随「的」前、别名「小林」后接「后」(CJK) 均被尾边界拦下，未高亮。
- **影响**：2字角色高亮召回严重偏低（a11y/可读性的视觉锚点缺失）。Q3 用精度换召回，代价偏大。
- **建议修复方向**：对 2字名改用「覆盖式吞并」而非「尾边界硬拒」——仅当命中区间被更长已知名完全覆盖（如「王林海」包住「王林」）时才跳过，否则正常高亮。与 Q2 的 `matchNameStrict` 覆盖逻辑对齐。

### P2-2 · 监测面板「按项目成本」实际低估：大量 LLM 调用未带 projectId
- **问题描述**：`/api/stats/monitor` 的 `projectLlm.byProject`（`src/app/api/stats/monitor/route.ts`）确实按 `projectId` 聚合成本（R12「监测面板按项目成本」已落地），但 `llmCallLog` 中大量记录 `projectId: null`（本次真机：全局 125 次调用里 **112 次 projectId=null**），仅 2 次归因到当前项目。代码注释自承「client 层不持有 project 上下文」。
- **证据（API 真机）**：`projectLlm.byProject` 含 `{projectId:null, calls:112, tokens:690508, cost:0.0576}` 与本项目 `{calls:2, cost:0.00124}`。
- **影响**：per-project 成本面板**系统性低估**（多数调用不计入任何项目），预算管控失真。
- **建议修复方向**：在 LLM 调用链（client 层）统一注入 `projectId`（至少生成类/游戏类端点显式传参落库），消除 null 归因。

### P2-3 · 2字「普通名词+武器/材料后缀」仍漏为实体（车铃类部分修复的余数）
- **问题描述**：`FRAGMENT_COMMON_PREFIX`（`entity-detector.ts:182-186`）只屏蔽首字 `车/门/玻…`，未覆盖 `风/铜/马/水` 等。故「风铃」「铜铃」「马鞭」「水镜」经 `detectEntities`（artifact 正则）产出且 `isCompleteEntityName`=true → 进世界书。
- **证据（runtime 探针）**：`isCompleteEntityName("风铃")=true`、`("马鞭")=true`、`("水镜")=true`；`detectEntities("…听见风铃…")` 确产出 `[artifact]听见风铃`/`[artifact]风铃`。
- **影响**：轻度世界书污染（与 P0-1 同类，属 Q1 黑名单覆盖不全的余数）。
- **建议修复方向**：并入 P0-1 的结构性方案（动词/方位/数量+后缀字统拒），或在 `FRAGMENT_COMMON_PREFIX` 增补常见器物首字。

### P2-4 · `isCompleteEntityName` 仅作「黑名单+后缀」启发式，对 4–5 字动宾碎片仍放行
- **问题描述**：`≥5字须以 ENTITY_END_SUFFIXES 结尾` 规则（`entity-detector.ts:241`）对以非后缀字结尾的 5字碎片有效，但对「动词+后缀字」型（如「摸出一块铁」len5 以「铁」结尾、「刀没入水银」len5 以「银」结尾）仍放行——因末字恰为后缀字。
- **证据**：见 P0-1 探针（摸出一块铁/刀没入水银=`true`）。
- **影响**：同 P0-1，纳入结构性修复一并解决。

---

## 需本地浏览器验收（沙箱无 Chromium/显示，无法验证）

- **实体高亮视觉渲染**：`MarkdownViewer` 为 `"use client"`（`src/components/workspace/MarkdownViewer.tsx:8`），高亮靠客户端 `fetch(/api/entities/highlight)`+`rehypeEntityHighlight`（`MarkdownViewer.tsx:163`）注入；**SSR HTML 不含高亮 span**（首屏服务端 map 为空）。需在浏览器观察实际染色、`title` 悬浮提示、`aria-label` 读屏播报。
- **hover/悬浮 tooltip 文案与对比度**：非颜色线索（title/aria-label）已在源码确认（`rehype-entity-highlight.ts:87-88`），但视觉对比度、tooltip 展示、读屏实际播报需真机。
- **按钮意义/教程/防误触**：全局清单中「每个按钮是否有明确语义、新手教程、危险操作二次确认」属纯 UI 交互，需人工点检（如世界书删除、分支导入、游戏重开等破坏性行为）。
- **游戏流畅度主观体验**：真实多轮对玩的节奏/选项质量/卡顿，需浏览器连续操作。
- **a11y 全量**：键盘可达性、焦点管理、ARIA 角色完整性需读屏+键盘走查。

---

## 末尾明确回答

**本轮是否还有 P0/P1 建议：是。**
- P0 × 1：世界书碎片过滤器结构性失效（谓语短语仍漏，当前代码 16/28 真实样本通过，生产库 28/31 为碎片）。
- P1 × 3：① `game/start` 空正文白屏（缺空流保护，与 R12 N1 验收矛盾）；② 自动建卡通用词（地点/法宝/…）污染触发词与高亮；③ 世界书词条缺溯源/归属字段。
- P2 × 4（见上）。

> 一句话给 team-lead：Q2/Q3 边界逻辑稳，但 Q1「碎片过滤」只补了黑名单没堵结构，世界书依旧被动词短语淹没，且游戏开局在推理模型下白屏——这两处建议本轮优先排期。
