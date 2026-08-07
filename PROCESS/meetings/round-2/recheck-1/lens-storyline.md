# 故事线复检报告（recheck-1 / lens-storyline）

- 复检领域：故事线（storyline）
- 复检员：独立代码复检员（魔王系统阶段五复检循环）
- 复检对象：round-2 整合清单 R2-005、R2-006
- 复检方式：Grep + Read 当前文件「真实落地内容」+ 单测实跑 + 跨文件一致性推演（非仅看 git diff）
- 项目根：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`

---

## 一、两条复检项逐条验证结论

### 1.1 R2-005（P1）：缝合怪 newMain 流支线误挂已完结旧主线

**结论：生效。** 改动真实落地，逻辑闭合，语义正确。

**证据（src/app/api/storylines/generate/route.ts:122-125）：**

```ts
// 主线 id：优先复用【未完结】主线；若现有主线均已完结（newMain 缝合怪·构造新主线），
// 则不接管旧主线，置 null 交由本次新建的主线接管，避免支线误挂到已完结旧主线（R2-005）
let mainId: string | null =
  existingStorylines.find((s) => s.type === "main" && s.status !== "completed")?.id ?? null;
```

复检要点逐条核对：

1. **改动落地**：`find(s => s.type === "main" && s.status !== "completed")` 已把 `status !== "completed"` 条件加进 mainId 解析。对比整合清单原始描述（`generate/route.ts:123-124,154` 的 mainId 不接管已存在主线），当前代码已按建议实现「status!=completed 优先并显式接管 mainId」。

2. **语义正确**：
   - 当项目存在「未完结（非 completed）」主线时，`find` 命中并返回其 id，`mainId` 指向该活跃主线，后续支线 `buildData(line, "side", ..., mainId)`（route.ts:162）挂到活跃主线。符合预期。
   - 当现有主线全部 `status === "completed"`（即 newMain 缝合怪场景：旧主线已完结）时，`find` 返回 `undefined`，`mainId` 落为 `null`。随后 route.ts:150-156 先建新主线，`if (!mainId) mainId = m.id;` 把 `mainId` 显式接管为本次新建主线的 id；再建支线时全部挂到这条新主线（route.ts:159-165）。由此「支线误挂旧已完结主线」的根因被切断——新建支线绝不会指向 completed 的旧主线。

3. **边界无崩溃**：`?.id ?? null` 的空安全链保证即使 `existingStorylines` 为空也不抛错；`mainId` 类型为 `string | null`，与 `buildData` 的 `parentId: string | null` 形参一致。

4. **与触发链一致**：`src/app/api/storylines/[id]/route.ts:47-66` 的缝合怪自动构造逻辑，仅在「主线被标记 completed 且无其他 active 主线（`activeMain === 0`）」时才发起 `mode: "newMain"` 请求。这从上游保证了进入 newMain 分支时旧主线确为 completed、且不存在其他活跃主线，与 R2-005 的 `status !== "completed"` 解析形成闭环，不会出现「两个活跃主线争抢 mainId」的竞态。

**结论判定：R2-005 真生效。**

---

### 1.2 R2-006（P1）：融入写作未注入「支线→主线」隶属关系

**结论：生效。** `formatStorylines` 的 `mainTitleById` 映射与「隶属主线」追加逻辑真实存在，且已被注入到写作/章纲的 prompt 文本中。

**证据一（src/core/pipeline/outline-context.ts:70-95，映射与追加逻辑）：**

```ts
/** 活跃剧情线摘要：每条线的 title + description + 非空七要素；支线标注隶属主线（R2-006） */
export function formatStorylines(storylines: any[]): string {
  if (!storylines || storylines.length === 0) return "";
  // 主线 id -> title 映射，用于支线隶属解析（仅本批注入的 active 线，约束保持）
  const mainTitleById = new Map<string, string>();
  for (const s of storylines) {
    if (s.type === "main" && s.id) mainTitleById.set(s.id, s.title);
  }
  return storylines
    .map((s: any) => {
      const parts: string[] = [];
      let prefix = `【剧情线：${s.title}】${s.type === "main" ? "（主线）" : "（支线）"}`;
      if (s.type !== "main" && s.parentId && mainTitleById.has(s.parentId)) {
        prefix += `（隶属主线 ${mainTitleById.get(s.parentId)}）`;
      }
      parts.push(prefix);
      if (s.description) parts.push(`说明：${s.description}`);
      const elems = SEVEN_ELEMENTS.map(([k, label]) => (s[k] ? `${label}:${s[k]}` : "")).filter(Boolean);
      if (elems.length) parts.push(elems.join(" | "));
      return parts.join("\n");
    })
    .join("\n\n");
}
```

核对要点：

1. **mainTitleById 映射存在**：outline-context.ts:74-77 用 `Map<string,string>` 建立「主线 id → 主线 title」映射，仅收录 `type === "main" && s.id` 的线。
2. **「隶属主线」追加逻辑存在**：outline-context.ts:83-85，当 `s.type !== "main"`（即支线）且 `s.parentId` 命中 `mainTitleById` 时，prefix 追加 `（隶属主线 ${mainTitleById.get(s.parentId)}）`。这正是 R2-006 要求的「支线 X 隶属于主线 Y」层级说明。
3. **键匹配正确**：`parentId` 与 `mainTitleById` 的键同为 storyline 的 `id`（Prisma schema 中 `id String @id @default(uuid())`、`parentId String?`，同类型），键匹配无类型错位风险。

**证据二（注入到写作 prompt 的落点）：**

- `src/app/api/generate/chapter-outline/route.ts:50` 调用 `const storylineContext = formatStorylines(storylines);`，并在 route.ts:209-210 注入：
  ```ts
  【活跃剧情线——本章必须顺着这些线推进（v0.46.57 剧情感知）】
  ${storylineContext || "（暂无剧情线，按总纲自由推进）"}
  ```
- `src/app/api/generate/chapter-outline/draw/route.ts:44、103` 同样的调用与注入。
- `src/core/agents/orchestrator.ts:44` 导入、`orchestrator.ts:681` 注入：
  ```ts
  ? `\n## 故事线进度（必须持续推进，避免偏离主线/支线设定）\n${formatStorylines(activeStorylines)}\n`
  ```

即：`formatStorylines` 的输出（含「隶属主线」层级说明）确实进入章纲生成 prompt（chapter-outline / draw）与正文写作 systemPrompt（orchestrator），AI 写章时能看到「支线 X（隶属主线 Y）」的层级关系。语义达成。

**数据来源一致性**：`loadOutlineData`（outline-context.ts:52-55）以 `status: { in: ["active", "main"] }` 加载 storylines；正文路径 `context-loader.ts:83-86` 以 `status: "active"` 加载。两条路径都把「主线 + 活跃支线」喂给 `formatStorylines`，`mainTitleById` 能拿到当前活跃主线的 title，支线 `parentId` 可正确解析。

**结论判定：R2-006 真生效。**

> 诚实边界：R2-006 的「文本含层级说明」我通过「代码静态确认调用链 + 注入位置」验证，已确证文本会被拼入 prompt。但「AI 是否因此真的在生成中利用了该隶属关系写出更贴合的章节」属于需要真实 LLM 生成 + 人工/评测判读的项，未经实测，标注为「待验证」（见第三节）。

---

## 二、新坑清单（round-2 未发现的真实缺陷）

> 以下每条均给出「文件:行号 + 问题本质 + 复现思路」。严重程度以对真实用户/数据的影响评估。

### N1（中危·潜伏型）orchestrator.ts:679 用不存在的 `completed` 字段过滤，死过滤

**位置**：`src/core/agents/orchestrator.ts:679`
```ts
const activeStorylines = (storylines || []).filter((s: any) => !s?.completed);
```

**问题**：Storyline 数据模型（prisma/schema.prisma:328）只有 `status` 字段（取值 `active | completed | abandoned`），**不存在 `completed` 布尔字段**。因此 `s.completed` 永远为 `undefined`，`!s?.completed` 永远为 `true`——这个过滤器是**死代码**，对数组没有任何过滤作用。

**当前为何没爆**：上游 `context-loader.ts:83-86` 已用 `status: "active"` 预过滤，传给 orchestrator 的 `storylines` 本就只含活跃线，所以死过滤「碰巧」无害。

**风险**：这是一个会误导维护者的陷阱。一旦将来有人把 `context-loader` 的过滤改成「取全部 status」或新增「含 abandoned」的召回逻辑，已完结/废弃主线将**未经任何拦截直接注入正文写作 systemPrompt**（orchestrator.ts:681），造成 AI 继续朝已完结主线推进剧情。修复方式应为 `s?.status !== "completed"` 或 `!["completed","abandoned"].includes(s?.status)`，与全仓其他处的 `status` 语义保持一致。

**复现思路**：在 context-loader 中临时把 `status: "active"` 改为不过滤（或加入 completed），构造「1 条 completed 主线 + 1 条 active 支线」，调用正文生成，观察 systemPrompt 是否仍出现 completed 主线内容——预期会出现（证明死过滤未拦截）。

---

### N2（高危·显示缺失 + 误归属）多主线项目下 StorylineList 只渲染第一条主线，新主线被吞掉

**位置**：`src/components/workspace/StorylineList.tsx:132-146`
```ts
const mainLine = storylines.find(s => s.type === "main");   // 只取「第一条」主线
const sideLines = storylines.filter(s => s.type === "side");
...
const resolveParent = (s) => {
  if (s.parentId) { const p = storylines.find(m => m.id === s.parentId); if (p) return p; }
  return mainLine ?? null;   // 回退到「第一条」主线
};
const childLines = mainLine
  ? sideLines.filter((s) => resolveParent(s)?.id === mainLine.id)
  : [];
```

**问题本质**：组件把「主线」当成**单一**对象处理（`mainLine`），而 R2-005 所服务的 newMain 缝合怪场景**必然产生多条主线**（旧 completed 主线 + 新 active 主线）。在 GET 列表的排序 `orderBy: [{ type: "asc" }, { order: "asc" }]`（src/app/api/storylines/route.ts:18）下，字符串比较 `"main" < "side"` 让主线排在前，且**最旧的主线（被完结的旧主线）排第一**。于是：

1. **新活跃主线在 UI 中完全消失**：`mainLine` 只取 `find` 返回的第一条（旧 completed 主线）；新 active 主线 `type === "main"` 既不等于 `mainLine`（已是被旧主线占用），也不在 `sideLines`（`filter type === "side"`）里——**渲染分支（:182 渲染 mainLine 卡片、:224 遍历 sideLines）都覆盖不到它**，导致当前正在推进的活跃新主线在故事线列表里「看不见」。
2. **误归属**：`resolveParent` 的回退返回 `mainLine`（旧 completed 主线）。任何 parentId 为空/悬空的支线都会被显示为「隶属主线：<旧 completed 主线>」。
3. **支线联动聚合失真**：`childLines` 以 `mainLine.id`（旧主线）为准，挂到新 active 主线的支线被排除在「支线联动」聚合进度之外，:147-154 的 `combinedProgress` 计算基于错误的子线集合。

**严重程度**：高。这是 R2-005 开启「多主线」现实后直接放大的 UI 缺陷，用户会看到「主线还是那条已经完结的旧线、新的正在写的主线不见了、支线联动进度算错」。

**复现思路**：
- 准备一个项目，先 AI 生成 1 主线 + N 支线；
- 在 UI 把旧主线标记 completed（触发缝合怪自动构造 newMain，生成新 active 主线 + 新支线）；
- 打开故事线面板：观察「主线」卡片标题是否为**旧 completed 主线**；在数据库/全屏弹窗核对是否存在一条 `status=active` 的新主线未被左侧卡片展示；核对支线卡片的「隶属主线」是否多指向旧主线；核对「支线联动 综合 X%」是否只统计了旧主线的子线。

**修复方向**：组件应支持「多主线」——按 `status` 区分当前活跃主线（取 `status==="active"` 且 `type==="main"`，若存在多条则列出多条），对每条主线分别聚合其子线；`resolveParent` 回退应优先 `status === "active"` 的主线而非数组第一条。

---

### N3（中危）删除主线不清理/不改挂子线，产生悬空 parentId

**位置**：`src/app/api/storylines/[id]/route.ts:79-82`
```ts
export async function DELETE(_request, { params }) {
  const { id } = await params;
  await prisma.storyline.delete({ where: { id } });   // 直接删，无级联
  return NextResponse.json({ success: true });
}
```

**问题**：schema 中 `parentId` 是普通 `String?` 字段，**没有定义到 Storyline 自身的外键关系与 `onDelete` 级联**（prisma/schema.prisma:325 仅 `parentId String?`，无 `parent Storyline? @relation(...)`）。删除一条主线后，其子支线的 `parentId` 指向已不存在的 id，成为**悬空引用**：

- 在 `formatStorylines`（outline-context.ts:83）：`mainTitleById` 不再含被删主线，`mainTitleById.has(s.parentId)` 为 false → 这些支线**静默丢失「隶属主线」标注**（不报错，但 AI 失去隶属上下文）。
- 在 StorylineList（:137-143）：`resolveParent` 找不到 `s.parentId` 对应对象，回退到 `mainLine`（另一条主线）→ 把孤儿支线**误显示为隶属于另一条主线**。

**复现思路**：项目里建 1 主线 + 2 支线（支线 parentId=主线 id）；在 UI/API 删除该主线；再打开故事线面板，观察两条支线是否仍显示「隶属主线：<某主线>」（应为误归属）；同时在章纲生成时观察支线是否不再带「隶属主线」前缀。

**修复方向**：DELETE 时把 `parentId === id` 的支线 `updateMany` 置 `parentId: null`（或改挂到另一条活跃主线），并/或在 schema 为 parentId 建立自引用关系 + `onDelete: SetNull`。

---

### N4（中危）newMain 场景下「旧支线」未被重新归属，隶属关系静默丢失

**位置**：`src/app/api/storylines/generate/route.ts:122-166` + `src/core/pipeline/outline-context.ts:52-55`

**问题**：R2-005 只解决了「新建支线不再误挂旧 completed 主线」，但**未处理已存在的旧支线**。newMain 流程的典型时序是：

1. 旧主线（active）+ 若干旧支线（active，parentId=旧主线 id）；
2. 用户把旧主线标记 completed → 触发 newMain → 生成新主线（active）+ 新支线（parentId=新主线）；
3. 此时**旧支线仍保留 parentId=旧 completed 主线 id**。

而 `loadOutlineData`（outline-context.ts:53）以 `status: { in: ["active","main"] }` 加载——旧 completed 主线被排除在 `mainTitleById` 之外。于是：
- 旧支线虽 `status=active` 仍被注入章纲 prompt，但其 `parentId` 在 `mainTitleById` 里查不到 → **不再带「隶属主线」前缀**，AI 写章时无法感知这些旧支线属于哪条（已完结的）主线；
- 这些旧支线在故事线推进上「悬在半空」：它们既不属于新活跃主线，又没被归档。

R2-005 的修复是「向前正确」，但遗留了「向后兼容旧支线」的缺口，构成体验层面的退化。

**复现思路**：同上 N2 的构造；newMain 后，在数据库查看旧支线 `parentId` 是否仍指向旧 completed 主线；用章纲生成一条章，打印注入的 `storylineContext`，确认旧支线行**缺失**「（隶属主线 …）」后缀。

**修复方向**：newMain 创建新主线后，可把仍指向旧 completed 主线的旧支线 `updateMany` 改挂新主线（或显式保留旧主线并标注「（前主线遗留）」），保证隶属关系不丢失。

---

### N5（低危·一致性陷阱）loadOutlineData 的 status 过滤混入无效枚举值 `"main"`

**位置**：`src/core/pipeline/outline-context.ts:53`
```ts
prisma.storyline.findMany({ where: { projectId, status: { in: ["active", "main"] } }, orderBy: { order: "asc" } });
```

**问题**：`status` 合法取值只有 `active | completed | abandoned`（schema:328），**不存在值为 `"main"` 的 status**。于是 `"main"` 是个永远不匹配的死字面量，查询实际等价于 `status: "active"`。

影响评估（低，但属典型「把 type 当 status」的认知错位）：
- 当前行为可接受：只取活跃线，completed 主线被排除（写章时不朝已完结主线推进，符合意图）；
- 但作者显然**意图**是「把主线也纳入」（所以写了 `"main"`），正确的语义应是「type==='main' 或 status==='active'」即 `where: { OR: [{ type: "main" }, { status: "active" }] }`。当前写法让「被用户置为 abandoned 的主线」被悄悄排除（可能非预期），且是个会让后续维护者误判的烟雾弹。

**复现思路**：把某条主线 `status` 改为 `abandoned`，调用章纲生成，确认该主线（即便 type=main）不出现在 `storylineContext`——证明 `"main"` 字面量未起作用、实际只按 `active` 过滤。

**修复方向**：改为 `where: { OR: [{ type: "main" }, { status: "active" }] }`，或补充说明「仅活跃线参与写章」的注释以消除歧义。

---

### N6（低-中危·静默数据缺口）AI 返回零主线时支线 parentId 全为空；且对「重复主线」无唯一性约束

**位置**：`src/app/api/storylines/generate/route.ts:119-120, 150-166`

**问题 A（静默丢层级）**：`mainLines = lines.filter(l => l.type === "main")`；若 AI 在任意模式下返回 0 条主线（非 newMain 模式下 AI 也可能只产出支线，或 newMain 模式下 AI 漏产出主线），则 `mainId` 始终为 `null`，`sideLines` 全部以 `parentId: null` 被创建（route.ts:162）。这些支线**静默变成无隶属的孤儿线**，且接口不返回任何警告。在 newMain 场景下尤其危险：用户以为「构造了新主线承接」，实际只得到一批 floating 支线。

**问题 B（重复主线）**：非 newMain 模式（route.ts:90-92 的分支「主线已存在，只生成支线」）依赖 AI 遵守「不再产出 main」的指令；若 AI 仍返回 `type:"main"` 行，`for (const line of mainLines)` 会再建一条主线。此时因 `mainId` 已被既有活跃主线占用（route.ts:155 `if (!mainId)` 不覆盖），新主线虽被建出但 `mainId` 仍指向旧主线，支线挂在旧主线——产生**第二条孤立主线**。虽然 UI 自动构造路径（`activeMain===0` 守卫）降低了触发概率，但 `generate` 路由本身对「是否已有活跃主线」没有任何服务端校验，外部直接 POST `{projectId, mode:"newMain"}` 可在已有活跃主线时制造双活跃主线。

**复现思路 A**：用 mock 让 `completeText` 返回 `{"lines":[{"type":"side",...}]}`（无 main），调用 generate，查库确认所有新建支线 `parentId` 为 null。
**复现思路 B**：项目已有 1 条 active 主线时，直接 `POST /api/storylines/generate {projectId, mode:"newMain"}`，查库确认是否出现第二条 `type:"main" && status:"active"` 主线。

**修复方向**：generate 后对「主线数量 > 1 且存在多条 active 主线」做校验/告警；当 `mainLines` 为空且 mode==="newMain" 时至少记录告警，或把既有活跃主线作为 parentId 兜底而非置 null。

---

## 三、复检员诚实声明

**真测了什么（实测）**：
- 用 `npx vitest run src/lib/storyline-progress.test.ts` **实跑**了故事线领域唯一可跑的单测：5 个用例全部通过（3ms）。它验证了 `computeStorylineProgress` 的七要素填充率 / 章节绑定率 / 综合进度的计算逻辑正确。但需明确：该测试**不覆盖** R2-005、R2-006 的修复逻辑（那两条都在需要 DB + LLM 的 API/路由层）。
- 用 Grep + Read 静态核对了 `generate/route.ts`、`outline-context.ts`、`orchestrator.ts`、`context-loader.ts`、`StorylineList.tsx`、`storylines/route.ts`、`storylines/[id]/route.ts`、`prisma/schema.prisma` 的**当前真实内容**，确认两条修复已落地、调用链闭合（R2-005 见 route.ts:124-125；R2-006 见 outline-context.ts:74-85 及注入点 chapter-outline/route.ts:210、draw/route.ts:103、orchestrator.ts:681）。

**未经实测、标注待验证的项**：
- 「R2-006 注入的『隶属主线』文本是否真的让 LLM 写出更贴合隶属关系的章节」：这需要真实 LLM 生成 + 人工/评测判读，本环境无 dev server / 浏览器 / 真实 LLM，无法实测，标注待验证。
- 「R2-005 在真实 newMain 时序下（旧主线 completed → 自动构造 → 支线挂新主线）端到端不误挂」：我通过代码推演确认了主路径正确，但端到端行为（含缝合怪自动构造的异步 fetch、并发）未经运行验证，标注待验证。
- N1–N6 中凡涉及「改库/改过滤后观察 AI 输出」的复现思路，均为**可执行的代码级复现路径**，但我未实际启动 dev server 跑通（无运行环境），故这些新坑的「存在性」基于**静态代码与数据模型推演**，属高置信度代码缺陷，但建议由集成测试或手动 E2E 最终确认。

**复检独立性声明**：本报告由复检员独立完成，未向主 Agent 追问；所有结论基于读到的当前文件内容，而非信任 git diff 或 round-2 清单描述。

---

## 四、一句话小结（供主 Agent 速览）

- R2-005：生效（route.ts:124-125 已加 `status!=="completed"`，新建主线优先接管未完结主线，语义闭环）。
- R2-006：生效（outline-context.ts:74-85 的 mainTitleById + 「隶属主线」追加已落地，并经 chapter-outline/draw/orchestrator 三处注入写作 prompt）。
- 新坑数量：6 条（N1 死过滤 / N2 多主线 UI 吞主线+误归属 / N3 删主线悬空 / N4 旧支线未重挂 / N5 status 无效枚举 / N6 零主线静默孤儿+重复主线无校验）。
