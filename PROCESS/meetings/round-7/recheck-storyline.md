# 故事线状态机健壮性子系统 · Round-7 深度体检报告

- **对象**：novel-forge（Next.js 16 + React 19 + Tailwind v4 + Prisma 7 + Postgres）
- **版本**：v1.6.7（commit `a68be8a`，魔王 Round-2~6 收口，门禁 `tsc` 零错误 + 283 vitest 全绿）
- **范围**：故事线状态机健壮性（守卫口径 / abandoned 污染 / 多主线渲染 / continue 章号 / 删除级联重挂）
- **方法**：通读 6 个焦点文件 + 顺带全仓 Grep 旁支；每条发现均附 `文件:行号` + 代码证据 + 复现路径。未修改任何源代码。

> 术语补注：**状态机（state machine）** 大白话 = 故事线 `status` 字段只能在 `active`（活跃）/ `completed`（已完结）/ `abandoned`（已废弃）三者间流转；**死字面量** = 代码里写死了一个根本不存在的枚举值（本仓 `status` 根本没 `main` 这个值），会导致查询/判断失效。

---

## 摘要

本轮在 v1.6.7 仍挖出 **6 条**真实可复现问题：

| 分级 | 数量 | 编号 |
|------|------|------|
| P0（数据错误/崩溃） | 0 | — |
| P1（功能退化/明显错） | 3 | F1、F3、F5 |
| P2（边角/体验/代码异味） | 3 | F2、F4、F6 |

**最严重（P1）**：
- **F1**：章纲/抽卡两个入口把「废弃主线 / 已完结主线」直接注入生成上下文，与写作主路径（orchestrator）口径不一致——N1/N8 修复只覆盖了一半入口。
- **F3**：抽卡（DrawCards）的 storylineId 选择器 `s.type === "main"` 短路，会让废弃主线被选中当成「当前故事线」。
- **F5**：continue 续写章号 order 存在「读最大→+1→插入」的 TOCTOU 竞态，并发下可能产生重复 order（schema 无唯一约束兜底）。

---

## 坑位表

### F1 · P1 · 章纲/抽卡入口未过滤 abandoned/completed 主线，治理只覆盖了一半

- **文件:行**
  - `src/app/api/generate/chapter-outline/route.ts:43,50`
  - `src/app/api/generate/chapter-outline/draw/route.ts:38,44`
  - 对照（正确口径）：`src/core/agents/orchestrator.ts:679`
- **现象**：`loadOutlineData` 取回的故事线直接喂给 `formatStorylines`，没有先过 `filterActiveStorylines`，导致废弃/已完结主线仍被拼进章纲、抽卡 prompt。
- **证据**：
  1. `outline-context.ts:52-55` 的查询是 `where: { projectId, OR: [{ type: "main" }, { status: "active" }] }`——**任意 status 的 main 主线都会被取回**（含 `abandoned`、`completed`）。
  2. `chapter-outline/route.ts:50` 与 `draw/route.ts:44` 都是 `const storylineContext = formatStorylines(storylines);`，**中间无任何 `filterActiveStorylines` 调用**。
  3. 对照 `orchestrator.ts:679`：`const activeStorylines = filterActiveStorylines(storylines || []);` 写作/续写主路径是过滤过的。
  - 结论：同一份 `loadOutlineData`，写作路径过滤了、章纲/抽卡路径没过滤——**同一状态下两套入口对 abandoned 主线行为不一致**。
- **复现路径**：项目里建一条 `type:"main", status:"abandoned"` 的主线 → 打开某章「章纲生成」或「抽卡」→ 该废弃主线的标题与七要素会出现在发给 LLM 的 `## 故事线进度` 区块，AI 被要求继续推进一条已被作者废弃的主线。
- **分级**：P1（功能退化：废弃主线污染生成上下文，与已声明的 N1/N8 修复语义冲突）。
- **建议修复**：在 `chapter-outline/route.ts:50` 与 `draw/route.ts:44` 调用 `formatStorylines` 前先 `filterActiveStorylines(storylines)`；或把「loadOutlineData → filterActiveStorylines → formatStorylines」收成一次性 helper，消除三处入口各自为政。

---

### F2 · P2 · `game/outline/generate` 仍残留 `status: { in: ["active","main"] }` 死字面量

- **文件:行**：`src/app/api/game/outline/generate/route.ts:75`
- **现象**：`where: { projectId, status: { in: ["active", "main"] } }` 把 `"main"` 当 status 值用——但 `Storyline.status` 合法值只有 `active | completed | abandoned`（`prisma/schema.prisma:328` 注释确认），**根本不存在 `main` 这个 status**。
- **证据**：
  1. schema 确认 `status String @default("active") // "active" | "completed" | "abandoned"`（`prisma/schema.prisma:328`）。
  2. `"main"` 永远命中不到任何行，该查询实际退化为 `status = 'active'` 仅为活跃线。
  3. 这恰是用户点名的「`status: { in: [..., main] }` 无效枚举死字面量」同型缺陷——`outline-context.ts` 在 v1.6.7 已把它改为 `OR: [{ type: "main" }, { status: "active" }]`（见 `changelog-data.ts:32,48`），但**游戏章纲入口漏改**，形成同型缺陷残留。
- **影响边界（诚实说明）**：本路径因为退化为「仅 active」，恰好**不会**泄漏 abandoned 主线（比 F1 还更严）；但它同时把 `completed` 主线也排除掉，且与 `loadOutlineData` 的「含所有 main 主线」语义不一致——游戏章纲与快速章纲对「已完成主线要不要呼应」判断不同。属代码异味 + 语义不统一，无数据损坏。
- **复现路径**：直接读码即可确认；运行时表现为「游戏模式章纲看不到任何主线（含进行中主线的 completed 前驱），而快速章纲能看到」。
- **分级**：P2（死字面量/语义不一致，无数据损坏，但与已修复的 `outline-context` 口径不统一，应清理）。
- **建议修复**：改为与 `loadOutlineData` 一致：`OR: [{ type: "main" }, { status: "active" }]`；若游戏模式确实只想要活跃线，则显式写 `status: "active"` 并删掉 `"main"` 这一无效项，并加注释说明为什么与章纲口径不同。

---

### F3 · P1 · 抽卡 storylineId 选择器 `s.type === "main"` 会选中废弃主线

- **文件:行**：`src/app/workspace/[projectId]/page.tsx:1284`
- **现象**：`storylineId={project.storylines?.find((s) => s.status === "active" || s.type === "main")?.id}`——`|| s.type === "main"` 让「只要是主线」就短路命中，无视 status。
- **证据**：
  1. `project.storylines` 来自列表 API `GET /api/storylines`（`storylines/route.ts:16-19`），该 API `where: { projectId }` **不过滤 status**，返回的数组里含 `abandoned` 主线。
  2. `Array.find` 按数组顺序返回**第一个**满足 `(status==="active") || (type==="main")` 的元素。若一条 `abandoned` 主线在数组里排在任一 `active` 线之前，`find` 会先命中它并返回其 id。
  3. 该 id 传给 `DrawCards`（抽卡章纲路线选择）作为 `storylineId`，即抽卡会以一条**已废弃主线**作为上下文基线。
- **复现路径**：项目含 ≥1 条 `abandoned` 主线且其记录顺序靠前（如先建后废弃）→ 打开抽卡 → 选中的 story 上下文是废弃主线；作者想基于活跃主线抽卡却被废弃线带偏。
- **分级**：P1（功能退化：抽卡上下文选中废弃主线；与 F1 同源——「只要 type 是 main 就当活跃」的旧思维残留）。
- **建议修复**：选择器改为 `s.status === "active"`（或 `s.status === "active" && s.type === "main"`）；若想优先活跃主线再回退，用 `storylines.find(s => s.status === "active")?.id ?? storylines.find(s => s.type === "main" && s.status !== "abandoned")?.id`。

---

### F4 · P2 · 多主线遍历未剔除 abandoned 主线（UI 渲染泄漏，与 Round-5 声明矛盾）

- **文件:行**：
  - `src/lib/storyline-progress.ts:82`（`mains = list.filter(s => s.type === "main")`）
  - `src/components/workspace/StorylineList.tsx:162`（`mainLines.map(...)`）
  - `src/components/workspace/StorylinesModal.tsx:122`（`mainLines.map(...)`）
- **现象**：废弃主线仍出现在左侧栏与全屏总览；`fallbackMain` 在极端情况下会回退到 abandoned 主线。
- **证据**：
  1. `groupStorylinesByMain`（`storyline-progress.ts:80-98`）的 `mains` 仅按 `type === "main"` 过滤，**完全不看 status**；渲染侧 `StorylineList.tsx:162` 与 `StorylinesModal.tsx:122` 都是对所有 `mainLines` 遍历，没有 `status !== "abandoned"` 排除。
  2. `fallbackMain = mains.find(m => m.status === "active") || mains[0] || null`（`storyline-progress.ts:84`）：若项目里**所有主线都是 abandoned**（无 active），孤儿支线（parentId 为空）的 `resolveParent` 会回退归属到第一条 abandoned 主线——仅影响显示归属，不改数据。
  3. `changelog-data.ts:98` 声明 Round-5 已做「StorylineList 多主线遍历剔除 abandoned 主线」，但**当前代码并未剔除**——属修复回退/声明与实现不符（诚实标注：也可能是当初的「剔除」指的是写作上下文而非 UI，但代码侧没有任何过滤，UI 上废弃主线肉眼可见）。
- **影响边界**：纯 UI 显示，不污染写作上下文（写作上下文由 `filterActiveStorylines` 把关，见「已确认无问题」）。但会与用户预期冲突：标记为「已废弃」的主线依然像活跃主线一样陈列，且 `status==="abandoned"` 在卡片上不显示任何徽标（徽标只在 `status==="completed"` 时显示，`StorylineList.tsx:181`、`StorylinesModal.tsx:128`），导致废弃主线与活跃主线视觉上难以区分。
- **复现路径**：建一条 `abandoned` 主线 → 侧栏/全屏总览仍渲染该主线卡片，且无明显「已废弃」标识。
- **分级**：P2（UI 污染/体验，无数据错误；但建议与文档声明对齐）。
- **建议修复**：在 `groupStorylinesByMain` 的 `mains` 中排除 `status === "abandoned"`（或在两个渲染处加 `.filter(s => s.status !== "abandoned")`），并对仍要展示的废弃主线补「已废弃」灰标；`fallbackMain` 的 `|| mains[0]` 应改为 `|| mains.find(m => m.status !== "abandoned") || null`。

---

### F5 · P1 · continue 续写 order 存在 TOCTOU 竞态，并发下章号可重复

- **文件:行**：`src/app/api/generate/continue/route.ts:49-53,68`
- **现象**：章号 `order` 用「聚合当前最大 order → +1 → 创建节点」算出，读与写非原子；并发续写可拿到相同 order。
- **证据**：
  1. `route.ts:49-53`：`const orderAgg = await prisma.storyNode.aggregate({ where: { projectId }, _max: { order: true } }); const nextOrder = (orderAgg._max.order ?? 0) + 1;`
  2. `route.ts:68`：`prisma.storyNode.create({ data: { ..., order: nextOrder, ... } })`——在 `aggregate` 与 `create` 之间存在时间窗口。
  3. **schema 无兜底**：`StoryNode` 的 `order Int @default(0)`（`prisma/schema.prisma:389` 附近）只有 `@@index([projectId])`，**没有 `@@unique([projectId, order])`**；Postgres 不拒绝重复 order，两个并发请求同时读到同一 max 就会各插入一条同 order 节点。
  4. 注释 `route.ts:48` 称「实时聚合，避免读取陈旧内存快照（并发更安全）」——但聚合仍是基于快照的读后写，**并未消除竞态**，反而可能让人误以为已安全。
- **复现路径**：对同一 `projectId` + `currentNodeId` 几乎同时发两个 `POST /api/generate/continue` 请求 → 二者 `aggregate` 大概率读到同一 `_max.order` → 生成两条 `order` 相同的章节节点。下游 `isLatestChapter` 判定（`route.ts:254-256` 用 `order === _max.order`）、排序、续写定位都会错乱。
- **分级**：P1（并发下数据正确性受损：章号重复破坏「order 即序列位次」不变量）。
- **建议修复**：① 在 DB 层加 `@@unique([projectId, order])`，冲突时重试（catch `P2002` 并重算）；② 或在事务里用 `SELECT ... FOR UPDATE` / 乐观锁串行化；③ 最低成本：把「计算 nextOrder + create」放进一个 DB 事务并用 `order` 的 upsert 语义，避免两个请求读到同一快照。注意单请求内本身安全（只 create 一个节点），问题仅在并发。

---

### F6 · P2 · `paused` 不是合法 Storyline status，抽卡/过滤会失效

- **文件:行**：
  - `src/core/agents/intent-parser.ts:164`（"暂停" → "paused"）
  - `src/core/agents/tool-registry.ts:902`（`enum: ["active","completed","paused","abandoned"]`）
- **现象**：意图解析把「暂停」映射成 `"paused"`，但 `Storyline.status` 只有 `active | completed | abandoned`。
- **证据**：
  1. schema 确认 Storyline.status 无 `paused`（`prisma/schema.prisma:328`）。
  2. `intent-parser.ts:157-166` 的 `storyline_list` 工具 `extractArgs` 返回 `{ status: map[statusMatch[1]] }`——用户说「列出暂停的故事线」时，status 会被置为 `"paused"`；若下游 `storyline_list` 工具用它做 `prisma.storyline.findMany({ where: { status } })`，则查询 `status:"paused"` 永远空命中（没有任何故事线真有该值）→ 返回空列表，用户困惑「明明有暂停的线怎么查不到」。
  3. `tool-registry.ts:902` 的 tool schema `enum` 把 `paused` 列为合法状态，进一步误导 LLM 传入该值。
- **影响边界**：不会写脏数据（只是过滤查不到）；但属于与 schema 口径不符的非法枚举值，和 F2 同源（死/无效字面量）。
- **复现路径**：对话输入「列出我暂停的故事线」→ `storyline_list` 工具带 `status:"paused"` 查询 → 返回空（即使存在作者想标记为暂停的线，也应是 `abandoned`）。
- **分级**：P2（边角：查询语义失效，无数据损坏）。
- **建议修复**：把 `paused` 从映射与 enum 中去掉，或在 schema/业务上正式接纳 `paused`（但那样要同步改 `filterActiveStorylines`、UI 状态选择器等全套口径，成本更高）；最小改动是统一收敛为 `abandoned`。

---

## 已确认无问题（诚实边界）

以下子系统的本轮体检结果为**健康**，特予标注以免误报：

1. **`isRehangTargetActiveMain` 守卫已无 main 死字面量（F 用户首要关注点）**
   - `outline-context.ts:111-120`：`return main.type === "main" && main.status === "active";`——用 `status === "active"` 而非 `status: { in: [..., main] }`。v1.6.7 已修（见 `changelog-data.ts:32,48`）。✅

2. **`getCompletedMainIds` / `pickReassignMainId` 守卫口径正确**
   - `outline-context.ts:88-93` 只收 `type==="main" && status==="completed"`；`pickReassignMainId`（`outline-context.ts:134-137`）只返回 `status === "active"` 的兄弟主线，绝不回退到 completed/abandoned。✅

3. **删除主线级联重挂不会误挂废弃线（F5 删除边界）**
   - `[id]/route.ts:90-101`：先取兄弟主线 `type:"main"`，经 `pickReassignMainId` 只挑活跃兄弟；无活跃兄弟则 `reassignId = null`（子线 parentId 置空），**不会**把子线嫁接到 abandoned/completed 旧线。与 `formatStorylines` 的「含所有 active 主线」集合自洽，R2-006「隶属主线」前缀不丢失。✅

4. **写作/续写主路径的写作上下文过滤正确**
   - `orchestrator.ts:679` 在 `buildPromptContext` 内先 `filterActiveStorylines(storylines)` 再 `formatStorylines`，abandoned/completed 主线不进入正文 prompt。这是 F1 的「未被污染的对照基准」。✅

5. **`loadOutlineData` 的 OR 查询本身自洽**
   - `outline-context.ts:52-55` 用 `OR: [{ type: "main" }, { status: "active" }]`，是 v1.6.7 修正后的正确写法（不再含 `main` 作为 status）。调用方是否过滤是 F1 的问题，查询本身无误。✅

6. **`Storyline.status` 为无约束 `String`（根因层面的双刃说明）**
   - 模型层是 `String` 而非真正 enum（schema 注释式约束），所以 F2/F6 的非法字面量**不会在运行时报错**，而是静默退化为「查不到/语义偏差」。这既是「没崩」的原因，也是「死字面量能潜伏」的根因——建议长期收口为 DB enum 或应用层常量白名单。

---

## 结论与优先级建议

- **立即处理（P1，影响生成正确性）**：F1（章纲/抽卡补 `filterActiveStorylines`）、F3（抽卡 storylineId 选择器去掉 `|| type==="main"`）、F5（continue order 并发去重）。
- **随后清理（P2，一致性/体验）**：F2（游戏章纲死字面量）、F4（UI 剔除 abandoned 主线 + 补灰标）、F6（移除 `paused` 非法状态）。
- 本轮**未发现 P0**（无崩溃、无数据损坏）；但 F1/F3 表明 Round-2~6 的「abandoned 治理」只覆盖了写作主路径，**章纲 / 抽卡 / 游戏 三条生成入口的口径并未统一**，是本轮最该收口的结构性遗漏。
