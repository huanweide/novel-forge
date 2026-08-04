# Round 13 诊断报告 · 墨白（会员股东视角 · 只读）

- 产品：novel-forge（Next.js 16 + React 19 + Tailwind v4 + Prisma 7 + PostgreSQL 17）
- 工作副本：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge\`
- 版本：`v0.46.77`（health 接口确认）
- dev 服务：`http://127.0.0.1:3001`（HTTP 200）；LLM：真实 DeepSeek `deepseek-v4-flash` @ `https://api.deepseek.com`，health 报 `db.ok=true / llm.ok=true`
- 测试方法：curl/PowerShell 调真实 API（真实 DeepSeek 落库取证）+ 逐文件读源码（file:line）+ SSR HTML 抓取。沙箱无 Chromium/显示，纯浏览器交互项标注「需本地浏览器验收」。
- 诊断探针项目（本人隔离创建，未触碰团队共享 fixture）：`bbe1dccf-…（R13-mobai-probe）`、`050d403f-…（R13-mobai-M2）`，可忽略或删除。

---

## 概要（一句话）

填表主链路「自动填表(write/continue/refine) + 一键填表(fill-all)」的 Round 12 修复依然稳（`ch{n}` 真实章号、M2 跨表防错放、脏标记清除出口均生效），但**手动单填路径（`/api/babylore/fill` 及其表格页按钮）存在三处回归/缺陷：`_src` 章号恒为 `ch?:batchmanual`、单章 selfCheck 因 corpus 仅取 storyNode 而全量假阳性、归表启发式把合法地名误报为写错表**——填表质量与安全网在手动路径上名存实亡。

---

## P0（阻断级）

**无。** 主线填表仍可完成（真实 DeepSeek 落库成功，`applied>0`），不存在阻断可用性的缺陷。

---

## P1（重要）

### P1-1　手动单填 `_src` 章号缺失（`ch?:batchmanual`）—— Round 12 修复未覆盖手动路径

- **复现/证据**
  - 源码：`src/core/babylore/fill.ts:565` `srcLabel = \`ch${options?.chapterOrder ?? "?"}\``，手动调用不传 `chapterOrder` 即落 `ch?`。
  - 路由：`src/app/api/babylore/fill/route.ts:15` 仅 `babyloreFill(projectId, chapterText, { tableKeys })`，**未透传 `chapterOrder`**。
  - UI：`src/app/workspace/[projectId]/tables/page.tsx:128-131` `runFill` 只发 `{ projectId, chapterText }`，无章号。
  - 实测 DB（探针项目 `bbe1dccf` 手动填）：写入行 `_src='ch?:batchmanual'`（余杭镇/醉仙楼/李逍遥 三行皆然）。
  - 对照实测（同项目建 storyNode 后跑 `/api/babylore/fill-all`）：写入行 `_src='ch0:batch1785833516230'`（`ch0` 取自 `node.order`，`fill.ts:675`），**证明自动/批量路径章号正确、仅手动单填坏**。
- **影响**
  1. 手动填表溯源断线（与 Round 10 同款缺陷在「非自动」路径重现），Round 12 的 `_src` 修复只覆盖了 `safeFillAfterWriting`（写后自动填）与 `fill-all`。
  2. **连带灭掉「表内同名异源弱告警」**：`fill.ts:826-827` 解析 `order = src.startsWith("ch") ? src.split(":")[0] : …`，手动行全为 `ch?` → `orders` 集合恒为 1（`fill.ts:833-834` 要求 `orders.size>=2`），于是手动数据里「青龙镇 vs 青龍镇」这类异体分行**永不触发弱告警**，该 Round 12 护卫特性对手动数据完全失效。
  3. 残留 `ch?:` 行即便后续跑 `fill-all` 也未必被刷新（fill-all 只刷新它本次命中的行；探针中 `李逍遥` 仍停留在 `ch?:batchmanual`），溯源缺陷具粘性。
- **建议修复方向**
  - 手动填表路由接收可选 `chapterOrder`（body 已有 `projectId/chapterText/tableKeys`，加一并 `route.ts:15` 透传）；表格页「自动填表」按钮在用户粘贴时若已知来源章（如从某章正文面板发起）则带上 `order`，否则至少在 UI 让用户输入/选择「来源章号」。
  - 对历史 `ch?:batchmanual` 行提供回溯修正入口（fill-all 命中即刷新 `_src` 已实现，可顺带清理；或加一次性迁移）。

### P1-2　手动单填「单章 selfCheck」全量假阳性（corpus 仅取 storyNode，手动填不落 storyNode）

- **复现/证据**
  - 源码：`src/core/babylore/fill.ts:767-773` `selfCheckFill` 用 `storyNode.findMany({where:{content:not null}})` 拼接 `corpus`；而手动填表**不创建 storyNode**（`tables/page.tsx:128` 只发 `chapterText`，`babyloreFill` 直接写 `loreTable.rows`）。
  - 实测（探针 `bbe1dccf` 仅手动填、storyNodes=0）：`selfCheckIssues` 把 `余杭镇/醉仙楼/李逍遥` 全部判为 `疑似错误地名/名称（全正文检索不到原文）`——而这些名称**确在提交的正文里**。
  - 对照实测（同项目建 storyNode 含同样正文后跑 fill-all）：`selfCheck.nameIssues=0`，证明假阳性根因就是 corpus 为空。
- **影响**：Round 12 引入的「填后自检（名称真实性 + 空值完整性）」在手动路径上**名存实亡**——它校验的是「项目已存正文」，而非「本次所填正文」。结果是对正确填写疯狂误报，侵蚀用户对自检报告的信任，反而可能诱导用户去改动/删除正确数据。
- **建议修复方向**
  - `babyloreFill`（`fill.ts:568`）调 `selfCheckFill(projectId)` 时，把本次 `chapterText` 作为**额外可信原文源**并入 corpus（最小改动、立即消除手动路径假阳性）；或 `selfCheckFill` 增加可选 `extraCorpus` 参数。
  - 或 UI 侧明确提示「粘贴的章节未作为正文节点保存，自检基于项目已存正文」，避免误导。

### P1-3　「归表错误」启发式大量误报——合法地名被标「疑似写错表」，淹没真实跨表错放

- **复现/证据**
  - 源码：`src/core/babylore/fill.ts:874-894` else 分支：只要某 `geo` 类表的唯一名存在，且项目存在**任一有值的 entity 类表**（person/item/…），即报 `唯一名「X」仅落在「geo」类表，但项目同时含人物/组织等表，疑似写错表`——**未校验 X 本身是否真是人物**。
  - 实测（探针 `bbe1dccf`，地点表+人物表并存）：`余杭镇`、`醉仙楼` 均为合法地点、正确落在 `地点表/geo`，却被各报一次 `归表` 错误（`fill-all` 响应 `selfCheck.crossTableIssues=2`，issues 全为这两条）。
- **影响**：任何「地点表 + 人物表并存」的项目（最常见配置），地点会**逐个被误报为归表错误**。噪声级别足以淹没真正的跨表错放（如人物真的落进 geo 表），使 M2 的「安全网」（selfCheck 跨表告警）失真——用户要么被假阳性轰炸而忽略，要么误把正确地点挪走。
- **建议修复方向**
  - 该分支判定前先用 `inferEntityType(val, corpus)`（`fill.ts:210`）确认该名确为人物再报；或干脆**删除该宽松 else 分支**，仅保留 `distinct.length>=2`（同名跨表）的判定——后者才是真正的「归属待确认」信号。
  - 注：M2 写入期拦截（`fill.ts:408-424`）本身有效（实测 `李逍遥` 未落 geo 表），问题出在事后自检的宽松启发式，二者需配套修正。

---

## P2（次要 / 存量）

### P2-1　单项目成本面板「失明」——生成调用未带 `projectId`

- **证据**：`src/core/llm/client.ts:400-408` 与 `412-420` 的 `recordLlmCall` **不传 `projectId`**（所有 write/continue/refine/outline 等生成走此中央 client）；而仅有 `src/core/babylore/fill.ts:359` 与少数路由带 `projectId`。
  - `GET /api/stats/monitor?projectId=…` 的 `projectLlm.byProject` 出现巨大 `projectId: null` 桶：`calls:88, tokens:581468, cost:0.03498`（占全站 `$0.039` 的 ~90%）。全局 `llmUsage` 真实（`totalCalls:101, totalTokens:601426, totalCost:$0.039`），但**按项目归因几乎全丢**。
- **影响**：监测面板「按项目」token/费用严重低估，与「归属」诉求相悖；用户无法基于单项目成本做决策。
- **建议**：`LLMRequest` 透传 `projectId`，`client.ts` 的 `recordLlmCall` 带上（已在 fill 路径验证可行）。

### P2-2　「关闭思考链」仅声明、未下发实际参数

- **证据**：`fill.ts:9` 注释称「关思维链（COT）+ 严格 JSON」，但实际请求仅发 `response_format: { type: "json_object" }`（`fill.ts:334`）+ 指令「不要任何解释文字」；grep `thinking|reasoning|stream` 在 `fill.ts` 无任何命中。
- **影响**：当前模型 `deepseek-v4-flash` 为 chat 模型、无思考链，功能无碍；但若用户切换到 reasoner 类模型，思考 token 可能出现且不被抑制，潜在撑爆上下文/污染 JSON 解析与成本。属「声明与实现不符」的存量隐患。
- **建议**：注释改为如实描述（强 JSON + 指令禁解释），或对接模型原生的禁用思考参数。

### P2-3　脏标记存文件非 DB，与项目生命周期脱钩、无可视化清单

- **证据**：`fill.ts:89` `FILLED_PATH = .runtime/babylore-filled.json`（JSON 文件，按 `projectId` 聚合）；`clear-filled` 仅操作该文件。项目删除（`projects/[id]`）不会同步清对应键。
- **影响**：脏标记与项目删除不联动，多项目共享一个 json；UI 无「已填章节」清单，排障靠猜；文件损坏即丢失全部防重复标记。
- **建议**：迁入 DB（如 `StoryNode.filledAt` 或一个独立表），或在删除项目时清理对应键。

### P2-4　端点命名偏差：`/api/projects/[id]/tables` 不存在，真实为 `/lore-tables`

- **证据**：`GET /api/projects/[id]/tables` 返回 SSR HTML（落到页面兜底，非 JSON）；真实结构化表格接口是 `GET /api/projects/[id]/lore-tables`（`src/app/api/projects/[id]/lore-tables/route.ts`）。
- **影响**：按文档调 `tables` 端点会拿到 HTML 而非 JSON，易被误判为接口缺失。
- **建议**：统一命名或加别名/重定向。

---

## 全局体验清单（20 点精神）核对小结

| 维度 | 结论 |
|---|---|
| 逐按钮/页面交互 | 表格页「自动填表/一键填表/清理脏标记并重填」按钮均接线（`tables/page.tsx:123/156/183`）；手动填按钮即 P1-1 缺陷入口。**其余按钮逐一点击穷举需本地浏览器。** |
| 世界卡三卡去重 | 「三卡」= 角色卡+世界书+风格卡（`parse-settings/route.ts:19`）。去重目前仅靠 prompt 指令「去重去矛盾，分类组织」（`SettingsImporter.tsx:142`），**代码层无强制去重逻辑**，质量需本地浏览器验收。 |
| LLM 上下文记忆排序 | `buildRecallBlock`（`loop.ts:32-85`）按 `score`（命中关键词长度）降序、table 优先于 lorebook、截断 12 条——排序逻辑存在；真实长文命中效果**需本地浏览器验收**。 |
| 约束遵守（OOC/禁词/风格） | OOC 与风格约束确实注入生成系统提示（`layered-prompt.ts:75`「严禁：OOC——角色言行必须符合其性格特征和对话风格」）。「禁词」强制拦截未在生成层确认（疑似走 post-process），**需本地浏览器验收**。 |
| 游戏流畅度（/game 流式） | 流式走 `chatStream`（`client.ts:434`），机制存在；实际流畅度/首字延迟**需本地浏览器验收**。 |
| 监测面板 token/费用 | 全局真实（`llmUsage`）；按项目归因缺失见 P2-1。 |
| 按钮意义/教程/防误触 | 一键填表有 confirmDialog 二次确认（`tables/page.tsx:157`）；首用教程、悬浮说明、其余防误触覆盖度**需本地浏览器验收**。 |
| a11y | 键盘可达性、对比度、aria 标注等**需本地浏览器验收**（沙箱无渲染）。 |
| 强 JSON | 稳定：`response_format: json_object` + `parseOps` 容错（`fill.ts:132-150`，兼容 ```json``` 围栏与裸括号）。✅ 无问题。 |
| _src 溯源章号 | 自动/批量稳（`ch{n}`）；手动单填坏（`ch?:`）→ P1-1。 |
| 跨表防错放（人物不落地理表） | 写入期 M2 拦截有效且单测覆盖（`fill.ts:408-424`、实测 `李逍遥` 未落 geo）；但事后自检误报见 P1-3。 |
| 单章 selfCheck | 自动路径有效；手动路径假阳性见 P1-2。 |
| 脏标记清除出口 | 存在且接线（`clear-filled` + `tables/page.tsx:183`）→ ✅ Round 12 修复稳；存储实现见 P2-3。 |
| 归属 | 见 P1-1（`_src`）+ P2-1（成本 projectId）。 |
| Round 12 修复点是否仍稳 | 自动填 `_src`、fill-all `_src`、M2 写入拦截、全跳过语义（no_dirty/all_clean/mislabeled，`fill.ts:713-742`）、脏标记清除——**均稳**；仅手动单填 `_src` 与手动 selfCheck 未被覆盖（P1-1/P1-2）。 |

### 需本地浏览器验收项（诚实标注，未在本轮验证）
悬浮/hover 提示文案、首用教程、纯点击穷举交互、游戏流式流畅度与首字延迟、a11y（键盘可达/对比度/aria）、世界卡三卡去重实际质量、LLM 记忆排序在真实长文下的命中与约束（OOC/禁词/风格）遵守效果、按钮防误触二次确认覆盖度。沙箱无 Chromium/显示，无法用 curl/源码穷尽，以上标注待本地浏览器验收。

---

## 末尾明确回答

**本轮是否还有 P0/P1 建议：是。**
- P0：无（0 条）。
- P1：3 条（P1-1 手动单填 `_src` 章号缺失；P1-2 手动单填 selfCheck 全量假阳性；P1-3 归表启发式把合法地名误报为写错表）。
- P2：4 条（P2-1 单项目成本面板失明；P2-2 关闭思考链仅声明；P2-3 脏标记存文件脱钩；P2-4 端点命名偏差）。

> 一句话摘要：Round 12 修复在自动/批量填表路径稳健，但手动单填路径（`/api/babylore/fill`）存在 `_src` 章号恒为 `ch?:batchmanual`、单章 selfCheck 因 corpus 仅取 storyNode 而全量假阳性、归表启发式误报合法地名三处 P1 缺陷；另含 4 条 P2（单项目成本归因失效等）。无 P0。
