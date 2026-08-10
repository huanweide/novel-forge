# Round-2 系统级大改企划草案 · interaction-flow 透镜

> 透镜角色：interaction-flow（交互流程透镜 / 魔王系统子代理）
> 基线版本：novel-forge v1.8.10（已完成 Round-1 小幅优化）
> 关注焦点：①主线/支线/剧情线索如何「推进」；②续写章节的交互流程（试探多章·对比·采纳）
> 交付物：本 Markdown 企划草案（before→after，附 file:line 与状态机/流程图）。**未改动任何源文件。**
> 复核方式：代码走读 + schema 核对 + 截图（workbench-view/edit/aigen.png）+ 控制台无报错。

---

## 0. 一句话结论

当前 v1.8.10 的「故事线工作台」在**推进机制**上名不副实：用户能做的推进操作只有「标记完结」和「被动自动记录」，而真正决定 AI 写什么的七要素、线索集**从未进入写作/抽卡 prompt**（一个 `s[k]` 写错层级的致命 bug，见 §3-F1）。续写流程里虽然 DrawCards 支持多候选「试探」，但它只绑定**自动挑中的一条**故事线、且采纳后只写**单章单线**，无法按「我想推哪条线、试探好几章、对比后投票决定」的 MaxLoop 工作流运作。本企划给出从「被动填充式」到「用户主导推进式」的 before→after 重构。

---

## 第一部分：用户体验视角 —— 主线/支线/线索集的「推进」现状

### 1.1 用户现在到底能怎么「把剧情往前推」

走查 `StorylineWorkbench.tsx`（v1.8.10），工作台里与「推进」相关的真实操作只有两类：

| 操作 | 入口 / 代码 | 对「剧情推进」的实质作用 |
|---|---|---|
| 标记完结 / 重新启用 | `handleToggleComplete` `StorylineWorkbench.tsx:204-223` | 仅翻转 `status`（active↔completed，abandoned→active）。**不生成任何内容、不注入任何上下文**，唯一的副作用是：当一条 main 被标 completed 且无其他 active main 时，服务器自触发 newMain 缝合怪生成（`storylines/[id]/route.ts:60-64`）。 |
| AI 生成七要素草稿 / 提交 | `handleGenerate:225-248`、`handleCommitGen:250-274` | 生成并落库 `sevenElements` JSON，但**仅存库**，不触发任何写作。 |
| 编辑说明 / 七要素正文 | 编辑保存 `276-333` | 纯数据维护。 |
| 线索集 CRUD | `ClueRow` `355-408` | 增删改 `StorylineEvent(kind=CLUE)`，但**从不进入写作上下文**。 |
| 关闭弹窗（被动） | `onTaskSettled` 清理 `genTaskId` `137/144` | 仅状态收尾。 |

**结论（体验层）：** 用户在界面上没有任何一个按钮叫「把这条线往前推一章」「按这条线的欲望→阻碍推进」。所谓的「推进」实际由两处**被动**机制完成：
1. 续写时 `storyline-writer.ts:writeStorylineProgress` 把 AI 自报的 `threadProgress` 反写进 `StorylineEvent(MILESTONE)`（仅当 stage 命中七要素白名单且 impactScore≥4）；
2. `plan-chapter.ts:applyChapterPlanToStorylines` 给**每一条** active 线各写一条 EVENT/MILESTONE。

也就是说：剧情往前推，靠的是 AI 写完之后「自我申报」，用户全程是观众。这正是瑞宝宝说的「布局与写入逻辑都不够好」的根。

### 1.2 七要素到底「怎么放」—— 当前是放对了地方但喂不进 AI

schema 设计本身是清晰的：`Storyline.sevenElements Json?`（`schema.prisma:381-383`，结构 `{desire,obstacle,action,result,twist,turn,ending}`），线索集是 `StorylineEvent(kind=CLUE)`（`schema.prisma:400-401`）。数据落库路径没问题。

**但致命点在于读取侧**：`formatStorylines`（`outline-context.ts:147-171`）是「把故事线喂给 AI」的唯一格式化函数，它被两处调用：
- 抽卡路由 `chapter-outline/draw/route.ts:47`；
- 主写作编排 `orchestrator.ts:buildPromptContext` 的 `## 故事线进度` 注入（`orchestrator.ts:716`）。

而该函数第 164-166 行：
```ts
const elems = SEVEN_ELEMENTS
  .map(([k, label]) => (s[k] ? `${label}:${s[k]}` : ""))   // ← 读 s[k]，顶层
  .filter(Boolean);
```
`sevenElements` 是**嵌套**在 `s.sevenElements` 上的 JSON，顶层 `s.desire/s.obstacle/…` 永远为 `undefined`。**结果：七要素在抽卡和写作两条主路径上 100% 静默丢失**，`elems` 永远是空数组，`parts` 里只有标题+说明。AI 根本不知道这条线的欲望/阻碍/转折是什么，所谓的「顺着这些线推进」（draw 路由注入的 `【活跃剧情线——本章必须顺着这些线推进】`）是空话。

同时 `events`（含全部 MILESTONE / 已发生大事件 / 线索集）**完全不在 `formatStorylines` 的输出里**（第 154-169 行只拼了 title/description/七要素）。用户辛辛苦苦维护的线索集，AI 一个字都看不到。

### 1.3 推进状态机（现状，问题态）

```
        ┌─────────────┐  标记完结    ┌─────────────┐
        │   active    │────────────▶│  completed  │
        │ (活跃/可写) │◀────────────│ (已完结)    │
        └─────┬───────┘  重新启用    └──────┬──────┘
              │                             │ 无其他active main
              │ 标记废弃                     │ 触发 newMain 自生成
              ▼                             ▼
        ┌─────────────┐              ┌─────────────┐
        │  abandoned  │              │ 新 main     │
        │ (已废弃)    │─────────────▶│ (active)    │
        └─────────────┘  重新启用     └─────────────┘
```

缺失的三条边（用户真正需要的）：
- `active ──[用户主动推进一章]──▶ active`：当前不存在，写作与故事线是两个互不呼应的孤岛。
- `active ──[推进后七要素某阶段达成]──▶ 自动建议完结`：当前七要素达成度 `computeStorylineProgress`（`storyline-progress.ts`）只算「填了几个字段」的比例，**与剧情是否真推进无关**。
- `线索集 CLUE ──[写入时引用]──▶ 写作上下文`：当前断开。

`computeStorylineProgress`（`storyline-progress.ts`）：`SEVEN_ELEMENT_FILL_KEYS = ["desire","obstacle","action","result","twist","turn"]`，整体百分比 = 已填字段/6。**这是「填写完成度」不是「剧情推进度」**——用户填满欲望阻碍后百分比就很高，但剧情可能纹丝未动。左侧导航条（`LineNav`）展示的就是这个误导性的进度条。

---

## 第二部分：整体视角 —— 续写章节的交互流程现状

### 2.1 当前续写链路（数据流）

```
用户点「续写/抽卡」
   │
   ▼
workspace/[projectId]/page.tsx:1350-1356
   DrawCards(projectId, nodeId, authorNote, storylineId=自动挑的第一条active/main)
   │
   ▼
chapter-outline/draw/route.ts
   formatStorylines(filterActiveStorylines(storylines))   ← 七要素/线索集丢失(§1.2)
   注入「【活跃剧情线——本章必须顺着这些线推进】」(实为空的)
   以 0.3~1.0 不同温度抽 3~5 张候选章纲卡
   │
   ▼ 用户选 1 张
handleDrawSelect → PreGenConfirm → CenterPanel 写正文
   │
   ▼ 写完后
storyline-writer.ts:writeStorylineProgress
   反写 MILESTONE（被动、且仅当 AI 自报 stage 命中白名单）
```

### 2.2 三个结构性问题

**P-A（抽卡不绑线）：** `page.tsx:1354` 的 `storylineId` 是 `find(s=>s.status==="active")?.id`——自动取**第一条** active 线，或退回第一条非废弃 main。**用户无法指定「我要推的是支线『龙王在菜市场』还是主线『复仇』」**。DrawCards 内部 `onSelect(card, storylineId, characterIds)` 虽带 storylineId，但上游只喂了「一条自动线」，多线并行试探无从谈起。

**P-B（多候选但单采纳、无对比）：** DrawCards 抽 3~5 张不同温度的卡，但采纳动作是「选一张 → 直接写正文」，**没有「先并排看三四章的试探稿、对比效果再投票决定」的环节**。用户只能凭一张卡的描述盲选，MaxLoop「所有人投票+提企划」的工作流在这里断开。

**P-C（规划噪声）：** `plan-chapter.ts:applyChapterPlanToStorylines` 给**每一条** active 线各写一条规划 EVENT/MILESTONE。一章写完，N 条 active 线各多一条事件，时间轴迅速被「规划噪声」淹没，真正发生的 MILESTONE 反而被稀释。这与 §1.1 的被动记录一起，让「推进」的反馈信号失真。

### 2.3 续写状态机（现状）

```
   [空闲] ──点抽卡──▶ [抽卡中 async] ──3~5卡──▶ [选卡]
        ▲                                          │
        │                                          ▼
   [已写正文] ◀── CenterPanel ── [PreGen确认] ◀── [选卡]
        │
        ▼ (被动)
   [反写MILESTONE] (仅AI自报命中)
```

缺环：`[选卡]` 到 `[对比/投票]` 之间没有节点；`[选卡]` 直接跳 `[PreGen确认]`。用户没有「多章试探 → 横向对比 → 集体投票采纳/废弃」的回路。

---

## 第三部分：Before → After 系统级大改企划草案

> 设计原则（呼应瑞宝宝原话）：①布局与写入逻辑重构；②用当前章节续写几章试探、多测试；③主线/支线/线索集清晰推进；④七要素真正落位；⑤投票+企划（MaxLoop）。

### 3.0 总览对照表

| 维度 | Before (v1.8.10) | After (企划) |
|---|---|---|
| 七要素进 AI | 永丢失（`s[k]` 层级错，`outline-context.ts:164`） | 扁平化后注入抽卡+写作双路径 |
| 线索集进 AI | 从不（`formatStorylines` 不含 events） | 按线注入 CLUE/MILESTONE 摘要 |
| 推进动作 | 仅「标记完结」+ 被动反写 | 新增用户主导「推进此线一章」动作 |
| 抽卡绑线 | 自动取第一条 active/main（`page.tsx:1354`） | 用户在工作台显式勾选「本次推进的目标线（可多选）」 |
| 多章试探 | 单卡→单章 | 单线可一次探 3~5 章草稿，并列对比 |
| 采纳决策 | 个人盲选一张 | 多候选并列 + 投票/企划采纳（MaxLoop） |
| 进度语义 | 字段填写率（`storyline-progress.ts`） | 字段填写率 **与** 时间轴实际推进双指标 |
| 规划噪声 | 每线各写一条（`plan-chapter.ts`） | 仅写目标线，且区分「规划」与「已发生」 |

---

### 3.1 F1 · 修复 `formatStorylines`：让七要素与线索集真正进 AI（最高优先级）

**文件**：`src/core/pipeline/outline-context.ts:147-171`

**Before**：
```ts
const elems = SEVEN_ELEMENTS
  .map(([k, label]) => (s[k] ? `${label}:${s[k]}` : ""))
  .filter(Boolean);
```
**After**：
```ts
const se = (s.sevenElements && typeof s.sevenElements === "object") ? s.sevenElements : {};
const elems = SEVEN_ELEMENTS
  .map(([k, label]) => (se[k] ? `${label}:${se[k]}` : ""))
  .filter(Boolean);
// 同时注入线索集/已发生大事件（按线，限量）
const events = Array.isArray(s.events) ? s.events : [];
const clues = events.filter((e:any)=>e.kind==="CLUE").slice(0,8)
  .map((e:any)=>`线索[${e.tag||"未分类"}] ${e.title}`);
const milestones = events.filter((e:any)=>e.kind==="MILESTONE").slice(-5)
  .map((e:any)=>`已发生·${e.title}`);
if (clues.length) parts.push("线索集：" + clues.join("；"));
if (milestones.length) parts.push("时间轴：" + milestones.join("；"));
```
**连带影响**：此函数被 `chapter-outline/draw/route.ts:47` 与 `orchestrator.ts:716` 共用，一处修复，抽卡与写作双路径同时受益。需在 `loadOutlineData`（`outline-context.ts:54-57`）的 `storyline.findMany` 中加 `include: { events: { orderBy:{position:"asc"} } }`，否则 `s.events` 为 undefined。

---

### 3.2 F2 · 新增「推进此线」用户主导动作（状态机补边）

**目标**：让用户明确「我要把这条线往前推」，并把这一意图显式传给抽卡/写作，而不是被动等 AI 自报。

**新增交互（工作台左侧 LineNav 每条线旁加「推进 ▶」按钮）**：
- 点击 → 打开「推进设置」：选择推进方式（顺七要素下一阶段 / 指定某个阶段 / 自由推进）、可选目标章节节点、可选角色。
- 该选择写入一个轻量「推进意图」结构：`{ storylineId, targetStage?, nodeId?, characterIds? }`，作为本次抽卡/写作的 **primary line**。

**状态机（After）新增的边**：
```
active ──[用户点「推进此线」+ 选章]──▶ 推进意图已设(active)
推进意图已设 ──[抽卡/写作完成]──▶ active(已记录MILESTONE)
推进意图已设 ──[七要素某阶段首次达成]──▶ 提示「可标记完结?」(建议,非强制)
```

**实现落点**：
- `StorylineWorkbench.tsx` 在 `LineNav` 渲染处（约 `:600-700` 区间的导航项）增加「推进」按钮与意图弹窗。
- 意图结构经 workspace 页透传给 `DrawCards`（`page.tsx:1350`），替换当前 `storylineId={自动挑选}`（`:1354`）为「用户勾选的目标线数组」。

---

### 3.3 F3 · DrawCards 改造：绑线 + 多章试探 + 对比/投票采纳（MaxLoop 核心）

**文件**：`src/components/workspace/DrawCards.tsx`、`chapter-outline/draw/route.ts`

**Before**：`storylineId` 单值、自动取一条；选一张卡直接进 PreGen。

**After 交互流程（三幕）**：

```
幕1 · 选线定题
   用户在工作台勾选「本次推进目标线」(可1~N条) + 每线试探章数(默认3)
        │
        ▼
幕2 · 并行试探（async 真后台，复用 generation-tasks 轮询）
   对每条目标线，以 0.3/0.6/0.9 温度各抽 1 张章纲卡
   → 得到 线×章数 张候选（如 2线×3章=6 张）
   每张卡标注：来自哪条线、温度、预估推进方向(摘七要素下一阶段)
        │
        ▼
幕3 · 对比 & 投票 & 采纳
   并列卡片墙：用户+（MaxLoop）各 lens 对每张卡投票(👍/👎/改)
   采纳规则：得票最高的卡 → 进入 PreGenConfirm → 写正文
   被弃卡：可「留作备选」或「丢弃」
   采纳后：自动把该卡归属的目标线写入推进 MILESTONE(而非每线各写,修复 P-C)
```

**状态机（After 续写）**：
```
[空闲]──选线定题──▶[并行试探 async]
       │                  │
       │                  ▼
       │            [卡片墙·对比/投票]
       │                  │ 采纳最高票
       │                  ▼
       └───◀──────[PreGen确认]──▶[写正文]──▶[按目标线记MILESTONE]
```

**落点细节**：
- `DrawCards` props 由 `storylineId:string` 改为 `targetLines: {id, chapters}[]`，`onSelect(card, storylineId, characterIds)` 保持但 `storylineId` 来自卡片自身归属。
- `draw/route.ts` 循环调用 LLM 抽卡（已支持温度参数，仅需改批量与归属标注），并用 `formatStorylines` 修正后的版本注入**该目标线**的七要素+线索集（F1 修复后自然生效）。
- 投票/企划环节可先做本地用户投票（MVP），MaxLoop 多 lens 投票通过现有 agent 协作通道接入（team-lead 编排）。

---

### 3.4 F4 · 进度语义双指标（修复误导）

**文件**：`src/lib/storyline-progress.ts`

**Before**：`overallPercent = 已填七要素字段/6`（填写率）。

**After**：返回 `{ fillPercent, advancePercent }`：
- `fillPercent`：保持原填写率（七要素骨架完整度）。
- `advancePercent`：基于 `events` 中 `kind=MILESTONE` 的数量与七要素 stage 命中数推算「实际推进度」。
- 左侧导航条同时展示两条细条（骨架灰 / 推进蓝），tooltip 说明差异，避免用户误以为「填完字段就写完了」。

---

### 3.5 F5 · 工作台布局重构（呼应「布局不够好」）

**Before**：`StorylineWorkbench.tsx` 为单模态弹窗，左导航(LineNav) + 右编辑区，AI 草稿/提交/空态挤在同一视图，Round-1 已修空态与死输入文案，但**结构未变**。

**After 三栏布局**（在弹窗内或独立路由页）：
```
┌─────────────┬──────────────────────────┬─────────────────────┐
│ 线导航+进度  │  选中线的七要素时间轴      │  推进/试探操作区      │
│ (主/支/线索) │  (七阶段因果链可视化)      │  (选线·抽卡·对比墙)   │
│ ·进度双条    │  desire→...→ending         │  ·本次目标线勾选      │
│ ·推进▶按钮   │  MILESTONE/CLUE 节点        │  ·试探章数           │
│ ·线索集折叠  │  (可点节点跳到对应章节)     │  ·候选卡片墙+投票     │
└─────────────┴──────────────────────────┴─────────────────────┘
```
- 七要素以**因果链**而非表单平铺呈现（`desire→obstacle→action→result→twist→turn→ending`），直观回答瑞宝宝「七要素到底怎么放」。
- 「推进」按钮与「试探卡片墙」同处右栏，形成「选线 → 试探 → 对比 → 采纳」的可见闭环。

---

### 3.6 F6 · 修复规划噪声（P-C）

**文件**：`src/core/pipeline/plan-chapter.ts:applyChapterPlanToStorylines`

**Before**：给每条 active 线各写一条规划 EVENT/MILESTONE。

**After**：只给「本次推进目标线」写规划事件；区分 `kind`：`PLAN`（规划，灰色）与 `MILESTONE`（已发生，实色）。时间轴默认折叠 PLAN，避免淹没真实推进信号。与 F2 的推进意图结构联动——无意图则跳过规划写入。

---

## 第四部分：落地发现清单（F1~F6 对应 file:line）

| ID | 严重度 | 文件:行 | 现象 | 根因 | 修复（企划） |
|---|---|---|---|---|---|
| F1 | **P0** | `outline-context.ts:164-166` | 七要素在抽卡+写作 prompt 中 100% 丢失；「顺着线推进」成空话 | 读 `s[k]`（顶层）而非 `s.sevenElements[k]`（嵌套 Json） | 扁平化读取 `se[k]`；并注入 `events` 的 CLUE/MILESTONE（`loadOutlineData` 加 `include events`，`outline-context.ts:54-57`） |
| F2 | P1 | `StorylineWorkbench.tsx:204-223,600-700`、`page.tsx:1354` | 用户无「主动推进此线」动作；推进全靠 AI 被动反写 | 推进意图未建模，只暴露「标记完结」 | 新增「推进▶」按钮+意图结构，透传为 DrawCards 目标线 |
| F3 | P1 | `DrawCards.tsx`、`draw/route.ts:47`、`page.tsx:1350-1356` | 抽卡只绑自动挑的一条线；多候选但单采纳、无对比投票 | `storylineId` 单值自动取；采纳直跳 PreGen | 改 `targetLines[]`；三幕（选线→并行试探→对比投票采纳），复用 generation-tasks 轮询 |
| F4 | P2 | `storyline-progress.ts` | 进度条=字段填写率，误导用户以为填完即推进 | `computeStorylineProgress` 只算 fill 比例 | 双指标 fillPercent/advancePercent，导航条双细条 |
| F5 | P2 | `StorylineWorkbench.tsx`(整体) | 布局单模态、七要素平铺、推进动线不清 | 弹窗单视图未重构 | 三栏：线导航+七要素因果链+推进/试探墙 |
| F6 | P2 | `plan-chapter.ts:applyChapterPlanToStorylines` | 每章给每条 active 线各写一条规划事件，时间轴噪声 | 无条件遍历全部 active 线写规划 | 仅写目标线，区分 PLAN/MILESTONE 且默认折叠 PLAN |

**跨路径确认**：F1 的 `formatStorylines` 被 `chapter-outline/draw/route.ts:47` 与 `orchestrator.ts:716` 共用，单点修复覆盖抽卡与主写作两条路径，是性价比最高的「系统级」修复。

---

## 第五部分：与相邻透镜的协作接口（供 team-lead 编排）

- **ui-ux-a11y / frontend-engineering**：F5 三栏布局、F4 双进度条的可视化与对比度需二者落地；七要素因果链用 SVG/组件实现。
- **copy-empty-state**：F2「推进▶」、F3「卡片墙投票」、F5 三栏的所有新增文案（按钮/空态/提示）由其统一润色，避免 Round-1 式的死输入文案回归。
- **musk-perspective**：F3 的「投票+企划」采纳规则可借鉴其「第一性原理筛选」——得票最高≠最优，需设「可逆采纳」（采纳后留备选、可回滚）。
- 数据层（F1 的 `include events`、F6 的 PLAN kind）需 schema/migration 评估：`StorylineEvent.kind` 已是字符串枚举，新增 `"PLAN"` 无需改 schema，仅代码约定即可，零迁移成本。

---

## 附录：验证步骤（供实现后回归）

1. `node shot2.cjs` 截工作台三栏新布局、卡片墙对比视图。
2. 在 DB/接口构造一条带 `sevenElements` 与 `events(CLUE/MILESTONE)` 的线，触发抽卡，断言生成的 prompt 含「欲望:…」「线索[…]」。
3. 控制台无报错；轮询 `generation-tasks` 在关页面后仍完成（复用 Round-1 已修的真后台）。
4. `computeStorylineProgress` 返回双指标单测；F6 验证仅目标线写入、PLAN 默认折叠。

> 报告完。未改动任何源文件，仅产出本企划草案。
