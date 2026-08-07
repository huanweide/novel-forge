# 故事线 N1~N4 复检报告（Round-3 recheck-1 / lens-storyline）

- 复检领域：故事线（storyline）N1~N4（round-3 修复项）
- 复检员：独立代码复检员（魔王系统 Round-3 复检循环）
- 复检方式：Grep + Read 当前文件「真实落地内容」+ vitest 实跑 + 跨文件一致性推演（非仅看修复报告或 git diff）
- 复检依据：PROCESS/meetings/round-3/fix-storyline-n1-n4.md、PROCESS/meetings/round-2/recheck-1/lens-storyline.md（N1~N6）
- 项目根：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- 复检独立性：本报告由复检员独立完成，未向主 Agent 追问；所有结论基于读到的当前文件真实内容。

---

## 一、N1~N4 逐条验证结论

本轮复检对 round-3 修复报告中声称的 N1~N4 四处改动，逐一用 Grep + Read 读取改后源码，并实跑测试交叉验证。结论先给：**四处改动全部真实落地、逻辑闭环，无回退 R2-005/R2-006 已生效逻辑的现象。** 下面逐条给出证据链。

### 1.1 N1（orchestrator 死过滤）— 生效，且是有效的防御性增强

**声称修复**：`orchestrator.ts:679` 原 `const activeStorylines = (storylines || []).filter((s: any) => !s?.completed);` 用不存在的 `completed` 布尔字段做过滤（永远为真，系死过滤），已改为 `filterActiveStorylines(storylines || [])`。

**实地核验**：

- `src/core/agents/orchestrator.ts:44` 确有 `import { formatStorylines, filterActiveStorylines } from "@/core/pipeline/outline-context";`。
- `src/core/agents/orchestrator.ts:679` 实测内容为 `const activeStorylines = filterActiveStorylines(storylines || []);`，死过滤代码已不存在。
- `src/core/pipeline/outline-context.ts:77-82` 新增纯函数 `filterActiveStorylines`：
  ```ts
  export function filterActiveStorylines(storylines: any[]): any[] {
    if (!Array.isArray(storylines)) return [];
    return storylines.filter(
      (s: any) => s?.status !== "completed" && s?.status !== "abandoned",
    );
  }
  ```
  语义与全仓 `status` 字段（schema:328 `active | completed | abandoned`）一致，按真实状态排除终态线，保留 `active` 及任何其他非终态线。
- Grep 全仓 `src` 目录确认：`!s?.completed` / `s.completed` 仅出现在 `outline-context.test.ts:21,27`（作为「旧写法对照」正向断言）与 `outline-context.ts:73`（注释说明历史），**业务代码已无任何死过滤残留**。

**上游联动确认（验证增强价值）**：复检进一步追溯 orchestrator 的 `storylines` 来源。`src/core/pipeline/context-loader.ts:83-85` 以 `prisma.storyline.findMany({ where: { projectId, status: "active" } })` 预过滤，即传入 orchestrator 的 `storylines`（orchestrator.ts:581 解构、:1530 回传）本就只含活跃线。因此 N1 修复在「当前」语境下属于**防御性增强**：即便将来 context-loader 改为不过滤或加入 `abandoned` 召回，`filterActiveStorylines` 仍能在 orchestrator 注入写作 prompt 前（orchestrator.ts:680-682）兜底拦截终态线，避免 AI 朝已完结/废弃主线推进剧情。修复方向正确、无副作用。

**结论：N1 真生效。**

### 1.2 N2（多主线只渲染第一条）— 生效，遍历全部主线且回退优先活跃主线

**声称修复**：`StorylineList.tsx`、`StorylinesModal.tsx` 由「只取第一条主线 `find(s => s.type === "main")`」改为「遍历所有主线分别聚合」，并新增纯函数 `groupStorylinesByMain`。

**实地核验**：

- `src/lib/storyline-progress.ts:80-98` 新增 `groupStorylinesByMain`，核心逻辑：
  - `mains = list.filter(s => s && s.type === "main")` —— 返回**所有**主线，不再只取第一条；
  - `fallbackMain = mains.find(m => m.status === "active") || mains[0] || null` —— 回退主线**优先活跃主线**，而非数组第一条旧主线；
  - `resolveParent` 先按 `parentId` 精确匹配，失败再回退 `fallbackMain`；`childrenOf(mainId)` 按各自主线聚合旗下支线。
- `src/components/workspace/StorylineList.tsx:13` import `groupStorylinesByMain`；`:133` `const { mains: mainLines, sides: sideLines, resolveParent } = groupStorylinesByMain(storylines);`；`:162` `mainLines.map((mainLine) => { ... })` 逐条主线渲染并聚合 `childLines`、计算 `combinedProgress`（主 70% + 子均 30%，:170-171）；`:181-183` 对 `completed` 主线展示「已完结」徽标。
- `src/components/workspace/StorylinesModal.tsx:9` import；`:78` 同样解构；`:122` `mainLines.map(...)` 渲染循环。

**逻辑闭环确认**：旧实现 `mainLine = find(type==="main")` 只取最旧主线、新活跃主线被吞、悬空支线误归属旧主线的根因已消除。新实现下，newMain 缝合怪产生的「旧 completed 主线 + 新 active 主线」两条均被渲染，悬空支线经 `resolveParent` 回退到活跃主线，不再误显为隶属于旧 completed 主线。两侧组件共用同一纯函数，行为一致。

**结论：N2 真生效。**

### 1.3 N3（删除主线悬空 parentId）— 生效，删除前级联重挂/置空子线

**声称修复**：`src/app/api/storylines/[id]/route.ts` 的 DELETE 路由，删除前先读取目标、查找同项目其他 `type==="main"` 主线，优先选 `active` 作为接管主线，否则取第一条，再无则 `null`；对 `parentId === 被删id` 的子线执行 `updateMany` 重挂/置空。

**实地核验**（`src/app/api/storylines/[id]/route.ts:79-104`）：

```ts
const target = await prisma.storyline.findUnique({ where: { id }, select: { id: true, projectId: true, type: true } });
if (target) {
  const siblings = await prisma.storyline.findMany({
    where: { projectId: target.projectId, type: "main", id: { not: id } },
    select: { id: true, status: true },
  });
  const reassignId = siblings.find((m) => m.status === "active")?.id ?? siblings[0]?.id ?? null;
  await prisma.storyline.updateMany({
    where: { projectId: target.projectId, parentId: id },
    data: { parentId: reassignId },
  });
}
await prisma.storyline.delete({ where: { id } });
```

- schema 层面确认（prisma/schema.prisma:325）：`parentId String?` 仅普通字段，**无自引用 @relation 与 `onDelete` 级联**——印证旧实现 `prisma.storyline.delete(...)` 直接删必然产生悬空 `parentId`。round-3 在应用层补上了级联处理，方向正确。
- 逻辑分支：有其他主线 → 子线重挂接管主线（优先活跃）；无其他主线 → 置 `null`，由 N2 的 `resolveParent` 回退到活跃主线，避免悬空误判。删支线时 `updateMany` 命中为空，无副作用。

**结论：N3 真生效。**

### 1.4 N4（newMain 旧支线未重挂）— 生效，建新主线后把旧支线重挂新主线

**声称修复**：新增 `getCompletedMainIds`；`generate/route.ts` 建主线后，对其名下 `type==="side" && parentId in 旧主线` 的支线 `updateMany` 重挂到当前活跃新主线 `mainId`。

**实地核验**：

- `src/core/pipeline/outline-context.ts:88-93` 新增 `getCompletedMainIds`：
  ```ts
  export function getCompletedMainIds(storylines: any[]): string[] {
    if (!Array.isArray(storylines)) return [];
    return storylines.filter((s: any) => s?.type === "main" && s?.status === "completed").map((s: any) => s.id);
  }
  ```
- `src/app/api/storylines/generate/route.ts:15` import；`:162-168`：
  ```ts
  const oldCompletedMainIds = getCompletedMainIds(existingStorylines);
  if (mainId && oldCompletedMainIds.length > 0) {
    await prisma.storyline.updateMany({
      where: { projectId, type: "side", parentId: { in: oldCompletedMainIds } },
      data: { parentId: mainId },
    });
  }
  ```
- `existingStorylines` 来自 `:22-27` 的 `prisma.storyline.findMany({ where: { projectId } })`——**全量**（不过滤 status），故 `getCompletedMainIds` 能正确捕获已完结旧主线。
- 时序确认：`:151-157` 先建新主线并令 `mainId = m.id`（当无现存活跃主线时）；N4 重挂（:164）在此之后、新建支线（:171-177）之前，故重挂只影响**既有**旧支线，不会误伤即将新建的支线；新建支线 `parentId = mainId` 本就正确挂载。

**与 R2-005/R2-006 共存确认**：N4 仅 `updateMany` 命中旧已完结主线的支线，`getCompletedMainIds` 的 id 与活跃主线 id 互斥（一条主线不可能同时 completed 与 active），故不影响已正确挂载的线；重挂后旧支线 `parentId` 指向活跃新主线，`formatStorylines` 的 `mainTitleById` 能解析，恢复「隶属主线」前缀（已由 outline-context.test.ts 的「重挂后恢复前缀」用例覆盖）。R2-005（新支线挂新主线）、R2-006（隶属注入）均未被回退。

**结论：N4 真生效。**

### 1.5 测试实跑交叉验证

复检按验证铁律实跑指定测试：

```
npx vitest run src/lib/storyline-progress.test.ts src/core/pipeline/outline-context.test.ts
```

结果：**Test Files 2 passed (2)；Tests 16 passed (16)；Exit Code 0。** 其中：
- `storyline-progress.test.ts` 9 用例（含 N2 `groupStorylinesByMain` 6 用例 + `computeStorylineProgress` 5 用例中的 3 组合，文件总计 9）；
- `outline-context.test.ts` 7 用例（N1 死过滤对比 3 用例、N4 `getCompletedMainIds` 2 用例、R2-006 隶属前缀 2 用例）。

16 例全绿且**无回归**（既有 `computeStorylineProgress` 用例仍通过）。复检独立确认修复报告第六章的测试结论属实。

**N1~N4 总判定：四处修复均真生效、逻辑闭环、测试覆盖到位、无回退已生效逻辑。**

---

## 二、新坑清单（round-3 改动引入或遗留的真实缺陷）

> 本清单在「Trust but verify」原则下，精读 `outline-context.ts`、`StorylineList.tsx`、`StorylinesModal.tsx`、`storylines/generate/route.ts`、`storylines/[id]/route.ts` 后得出。每条含文件:行号 + 问题本质 + 复现思路。凡涉及「改库后观察行为」的复现思路为可执行代码级路径，但未实跑 dev server（见第三节诚实声明）。

### N7（中危·round-3 引入）DELETE 重挂把被删主线子线并入其他主线，造成跨剧情线误归属

**位置**：`src/app/api/storylines/[id]/route.ts:93-98`

```ts
const reassignId = siblings.find((m) => m.status === "active")?.id ?? siblings[0]?.id ?? null;
await prisma.storyline.updateMany({
  where: { projectId: target.projectId, parentId: id },
  data: { parentId: reassignId },
});
```

**问题本质**：N3 引入的级联逻辑，把被删主线 A 的全部子线**无条件重挂到另一条主线 B**（优先活跃，否则第一条）。但 round-3 已通过 N2 确立「多主线是常态」（newMain 缝合怪本就会产生多条主线）。当项目存在多条彼此独立的主线 A、B 时，删除 A 会把 A 的支线静默并入 B，造成：
1. B 的「支线联动」聚合进度（StorylineList.tsx:164-171）被 A 的子线污染、虚高；
2. `formatStorylines` 把这些支线标为「隶属主线 B」（outline-context.ts:108-109），即把 A 的剧情错误地归属到 B；
3. 用户视角：A 名下的支线「搬家」到 B，叙事层级错乱。

N3 的设计意图是「隶属关系不丢」，但其默认策略（盲挂第一条/活跃兄弟主线）在多主线场景下等价于「把一条故事线的全部子线嫁接到另一条无关故事线」，属语义污染而非修复。

**复现思路**：构造项目含 main A（active，2 条 side）+ main B（active，1 条 side）；通过 UI 或 `DELETE /api/storylines/<A.id>` 删除 A；查库确认 A 的 2 条 side 的 `parentId` 变为 B.id；打开故事线面板，确认 B 卡片下多出 2 条本属 A 的支线且「隶属主线：B」，综合进度被 A 的子线拉高。

**修复方向**：删除主线时，若同项目仍存在其他主线，应让用户显式选择接管主线，或将子线 `parentId` 置 `null` 由 `resolveParent` 回退（而非盲挂第一条主线）；更稳妥的是在 schema 为 `parentId` 建立自引用 `@relation(..., onDelete: SetNull)` 让数据库层保证不悬空、不误挂。

### N8（中危·round-3 引入的回归）DELETE 重挂到「completed 兄弟主线」后，子线在写作 prompt 中丢失「隶属主线」前缀

**位置**：`src/app/api/storylines/[id]/route.ts:93-94` 联同 `src/core/pipeline/outline-context.ts:80, 108`

**问题本质**：N3 的 `reassignId` 在「无其他活跃主线、仅剩 completed 兄弟主线」时取 `siblings[0]`（即那条 completed 主线）。此时被删活跃主线 A 的子线被改挂到 completed 主线 B。但注入写作 prompt 的两条数据路径都会**排除 completed 主线**：
- `context-loader.ts:84` 正文路径：`status: "active"` 预过滤，B 不在 `storylines` 中；
- `outline-context.ts:53` 章纲路径：`status: { in: ["active", "main"] }`（N5 见下，实际等价于 `active`），B 同样被排除。

于是 `formatStorylines`（outline-context.ts:99-102）构建的 `mainTitleById` 不含 B，这些本属 A、现挂 B 的活跃子线在 `s.parentId`（=B）命中不了 `mainTitleById`，**静默丢失「（隶属主线 …）」前缀**——AI 写章时失去这些支线的隶属上下文。相比删除前（它们隶属活跃 A、前缀正常），这是一次**功能回归**。

**复现思路**：构造项目含 main A（active，2 条 side）+ main B（completed，0 条 side）；`DELETE /api/storylines/<A.id>`；查库确认 2 条 side 的 `parentId = B.id`；调用章纲生成（`/api/generate/chapter-outline`）打印注入的 `storylineContext`，确认这 2 条 side 行**缺失**「（隶属主线 …）」后缀（删除前该前缀存在）。

### N9（中低危·round-3 引入）N4 重挂在非 newMain 模式也触发，跨线合并旧主线支线

**位置**：`src/app/api/storylines/generate/route.ts:162-168`

```ts
const oldCompletedMainIds = getCompletedMainIds(existingStorylines);
if (mainId && oldCompletedMainIds.length > 0) {
  await prisma.storyline.updateMany({
    where: { projectId, type: "side", parentId: { in: oldCompletedMainIds } },
    data: { parentId: mainId },
  });
}
```

**问题本质**：该重挂逻辑不区分 `mode`。只要「存在 `mainId`（既有活跃主线或被新建主线）且存在已完结旧主线」，调用 `POST /api/storylines/generate`（即便不带 `mode`、意图仅是「给活跃主线追加几条新支线」）也会把已完结旧主线的全部支线静默并入 `mainId`。这与 N7 同源：在有多条主线的项目里，一次「追加支线」操作顺带把另一条（已完结）主线的支线嫁接到当前主线，造成跨剧情线污染，且用户无任何提示。

**复现思路**：构造项目含 main B（active，1 条 side）+ main A（completed，2 条 side）；`POST /api/storylines/generate {projectId}`（不传 mode）；查库确认返回的新支线 + A 的 2 条旧 side 现在 `parentId` 全部 = B.id。

**修复方向**：N4 重挂应仅在 `mode === "newMain"`（或旧主线确为「被缝合怪接管」的语义）时执行；非 newMain 的「追加支线」不应动既有旧主线的支线归属。

### N10（低危·一致性陷阱）StorylinesModal 不展示支线「隶属主线」标签，与 StorylineList 行为不一致

**位置**：`src/components/workspace/StorylinesModal.tsx:146-165`

**问题本质**：左侧栏 `StorylineList.tsx:234-238` 对支线渲染「隶属主线：<parent.title>」标签，但全屏弹窗 `StorylinesModal` 的 `sideLines.map` 仅渲染支线自身，**既不调用 `resolveParent` 也不显示隶属关系**，也没有「支线联动」综合进度。二者同为故事线浏览入口，信息不一致：用户在左侧栏看到「隶属主线 B」，点开全屏总览却看不到任何隶属说明，易误判支线为独立线。

**复现思路**：构造一条 side 且其 `parentId` 指向某 main；分别在左侧栏与全屏弹窗打开故事线，对比支线卡片是否都有「隶属主线」标注。

**修复方向**：`StorylinesModal` 同样用 `resolveParent` 渲染「隶属主线」标签，保持与左侧栏一致。

### N11（低危·边界）groupStorylinesByMain 的 fallbackMain 在「全部主线都 completed」时回退到第一条主线（可能为 completed）

**位置**：`src/lib/storyline-progress.ts:84`

```ts
const fallbackMain = mains.find((m) => m.status === "active") || mains[0] || null;
```

**问题本质**：当项目所有主线均为 `completed`（例如用户把新主线也标记完结、又未触发缝合怪），`fallbackMain` 取 `mains[0]`（依 API `orderBy:[{type:"asc"},{order:"asc"}]`，即 order 最小者），它是一条 completed 主线。任何 `parentId` 为空/悬空的支线经 `resolveParent` 回退到该 completed 主线，UI 会显示「隶属主线：<completed 主线>」，而该主线已完结，语义上支线被挂靠到一条已结束的剧情线。属低危展示误导，不崩溃。

**复现思路**：项目 2 条主线均 completed，1 条 side 无 parentId；打开故事线面板，确认该 side 显示「隶属主线：<某 completed 主线>」。

### N12（低危·边界）filterActiveStorylines 仅排除 completed/abandoned，未来新增非终态枚举会被一律保留

**位置**：`src/core/pipeline/outline-context.ts:80`

**问题本质**：`s?.status !== "completed" && s?.status !== "abandoned"` 是「黑名单」式判断。若将来 `status` 增加如 `paused`/`archived` 等需从写作上下文排除的状态，本函数会将其当作「非终态」保留并注入 prompt，重现 N1 类「不该注入的线被注入」问题。属未来健壮性隐患，当前无实际影响。

**修复方向**：可改为白名单 `["active"].includes(s?.status) || (s?.status == null)`（仅保留明确活跃或状态缺失者），与 README/文档中 status 语义强绑定。

### N5（低危·一致性陷阱，不在本轮范围）loadOutlineData 的 status 过滤混入无效枚举值 "main" — 仍存在

**位置**：`src/core/pipeline/outline-context.ts:53`

```ts
prisma.storyline.findMany({ where: { projectId, status: { in: ["active", "main"] } }, orderBy: { order: "asc" } });
```

**现状确认**：本轮未处理，且复检读取当前源码确认该死字面量 `"main"` 依然存在。`status` 合法取值只有 `active | completed | abandoned`（schema:328），不存在值为 `"main"` 的 status，故该查询实际等价于 `status: "active"`。当前行为可接受（只取活跃线），但会让后续维护者误判「主线会被纳入」，且把 `abandoned` 的主线悄悄排除。建议后续改为 `where: { OR: [{ type: "main" }, { status: "active" }] }`。**N5 仍存在，待后续轮次收口。**

### N6（低-中危·静默数据缺口，不在本轮范围）AI 返回零主线时支线 parentId 全空；且对「重复主线」无服务端校验 — 仍存在

**位置**：`src/app/api/storylines/generate/route.ts:119-120, 150-166`

**现状确认**：本轮未处理，且复检确认以下两点仍成立：

1. **零主线静默孤儿**：`mainLines = lines.filter(l => l.type === "main")`；若 AI 在任意模式下返回 0 条主线（非 newMain 模式下 AI 也可能只产出支线，或 newMain 模式下 AI 漏产出主线），则 `mainId` 始终为 `null`，`sideLines` 全部以 `parentId: null` 被创建（route.ts:174）。这些支线静默变成无隶属孤儿线，接口不返回任何警告。在 newMain 场景尤其危险：用户以为「构造了新主线承接」，实际只得到一批 floating 支线。
2. **重复主线无校验**：generate 路由对「是否已有活跃主线」没有任何服务端校验（仅上游 UI 自动构造路径有 `activeMain === 0` 守卫）。`mainLines` 来自 AI 返回，若 AI 在非 newMain 模式下仍返回 `type:"main"` 行，`for (const line of mainLines)` 会再建一条主线；因 `mainId` 已被既有活跃主线占用（:156 `if (!mainId)` 不覆盖），新主线虽被建出但 `mainId` 仍指向旧主线——产生**第二条孤立活跃主线**。外部直接 `POST {projectId, mode:"newMain"}` 可在已有活跃主线时制造双活跃主线。

**复现思路 A**：mock `completeText` 返回 `{"lines":[{"type":"side",...}]}`（无 main），调用 generate，查库确认新建支线 `parentId` 全为 null。
**复现思路 B**：项目已有 1 条 active 主线时，直接 `POST /api/storylines/generate {projectId, mode:"newMain"}`，查库确认是否出现第二条 `type:"main" && status:"active"` 主线。

**结论：N6 仍存在，建议单独跟进。**

---

## 三、诚实声明（边界与实测范围）

**真测了什么（实测）**：
- 用 `npx vitest run` **实跑**了故事线领域全部可跑单测：`storyline-progress.test.ts`（9 用例）+ `outline-context.test.ts`（7 用例）= **16 用例全绿（Exit 0）**。这些测试覆盖了 N1（`filterActiveStorylines` 排除终态 + 旧死过滤对照）、N2（`groupStorylinesByMain` 多主线遍历/回退优先活跃/聚合/空安全）、N4（`getCompletedMainIds` 识别 + `formatStorylines` 重挂后恢复前缀）的核心逻辑，并确认 `computeStorylineProgress` 既有用例无回归。
- 用 Grep + Read **静态核对**了 `outline-context.ts`、`orchestrator.ts`、`storyline-progress.ts`、`StorylineList.tsx`、`StorylinesModal.tsx`、`storylines/route.ts`、`storylines/[id]/route.ts`、`storylines/generate/route.ts`、`context-loader.ts`、`prisma/schema.prisma` 的当前真实内容，确认 N1~N4 四处改动已落地、调用链闭合、无回退 R2-005/R2-006 已生效逻辑。
- 额外追溯了 orchestrator 的 `storylines` 上游来源（context-loader.ts:84 `status:"active"` 预过滤），确认 N1 是有效防御性增强。

**未经实测、标注待验证的项**：
- **N1 真实 LLM 行为**：`filterActiveStorylines` 纯函数已单测覆盖，其被 orchestrator 注入写作 prompt 的调用经静态核对 + 类型检查确认；但「AI 因此是否真的不再朝已完结主线推进剧情」属 LLM 行为，本环境无 dev server / 真实 LLM，未实跑生成验证，标注**待验证**。
- **N2/N3/N4 端到端效果**：`groupStorylinesByMain`、`getCompletedMainIds` 已单测；DELETE、generate 路由的 DB `updateMany` 路径仅经代码推演（无 dev server / 数据库 / 浏览器运行环境）。**真实多主线渲染、删除级联重挂、newMain 端到端重挂的 UI/DB 效果未经实测**，标注**待验证**。
- **新坑 N7~N12 的存在性**：基于静态代码与数据模型推演（含 schema 无 `onDelete`、两路 prompt 注入均排除 completed 主线等事实），属高置信度代码缺陷；其「触发后的具体表现」建议由集成测试或手动 E2E 最终确认。其中 N7/N8/N9 为 round-3 改动（N3 级联重挂、N4 重挂）引入/暴露的跨线误归属与隶属前缀回归，应优先在后续轮次评估修复。

**复检独立性声明**：本报告由复检员独立完成，未向主 Agent 追问；所有结论基于读到的当前文件内容，而非信任 git diff 或 round-3 修复报告的描述。

---

## 四、一句话小结（供主 Agent 速览）

- N1：生效（orchestrator.ts:679 改用 `filterActiveStorylines`，死过滤已彻底清除，纯函数已单测覆盖，且为 context-loader 预过滤之上的有效防御增强）。
- N2：生效（StorylineList/StorylinesModal 均用 `groupStorylinesByMain` 遍历所有主线、回退优先活跃主线，新活跃主线不再被吞、悬空支线不再误归属旧主线）。
- N3：生效（DELETE 路由删除前级联重挂/置空子线 `parentId`，schema 无 `onDelete` 故应用层补级联正确）。
- N4：生效（generate 路由建新主线后 `updateMany` 把旧已完结主线的支线重挂新主线，仅命中旧主线、不误伤正常支线）。
- 新坑数量：6 条（N7 DELETE 跨线误归属 / N8 DELETE 重挂 completed 主线致 prompt 丢失隶属前缀回归 / N9 N4 重挂在非 newMain 模式也跨线合并 / N10 Modal 不显示隶属标签 / N11 全 completed 时 fallbackMain 取 completed 主线 / N12 filterActiveStorylines 黑名单式未来隐患），另顺带确认 N5、N6 仍存在。
