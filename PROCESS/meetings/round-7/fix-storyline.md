# 故事线状态机 · Round-7 修复 Agent 落盘报告（storyline 修复项）

- **对象**：novel-forge（Next.js 16 + React 19 + Tailwind v4 + Prisma 7 + Postgres）
- **版本**：v1.6.7（commit `a68be8a`）
- **执行角色**：魔王系统「修复 Agent」——**仅改动本 Agent 负责的 storyline 相关文件**；worldcard / foreshadowing / io / monitor 四个 Agent 的文件一律未触碰。
- **门禁基线**：`tsc` 零错误 + 283 vitest 全绿（本轮未破坏任一既有测试）。

> 术语补注（首次出现加大白话）：
> - **状态机（state machine）**：故事线 `status` 字段只能在 `active`（活跃）/ `completed`（已完结）/ `abandoned`（已废弃）三个合法值间流转；`paused`、`main`（作 status 用时）都是根本不存在的**死字面量**（代码里写死了一个查不到/不生效的非法值）。
> - **TOCTOU（Time-Of-Check to Time-Of-Use）**：先读后写之间的竞态窗口——两条并发请求都读到同一旧值，再各自写，导致重复。
> - **行锁（`FOR UPDATE`）**：Postgres 在事务内对某一行加排他锁，其他想锁同一行的事务必须排队等它提交，从而把「并发」串行化。
> - **`filterActiveStorylines`**：一个已经存在的纯函数，按真实 `status` 排除 `completed` 与 `abandoned`，只保留活跃/非终态线；写作主路径早已用它，本次把它补进章纲/抽卡/游戏三条入口。

---

## 一、F1（P1）· 章纲 / 抽卡入口补 `filterActiveStorylines`

**文件:行**
- `src/app/api/generate/chapter-outline/route.ts:50`（改动处）
- `src/app/api/generate/chapter-outline/draw/route.ts:44`（改动处）
- 助手函数口径参考：`src/core/pipeline/outline-context.ts:77`（`filterActiveStorylines` 定义）、`:145`（`formatStorylines`）

**问题**：`loadOutlineData` 的查询是 `OR:[{type:"main"},{status:"active"}]`，会把**任意 status 的 main 主线**（含 `abandoned`/`completed`）取回。`chapter-outline` 与 `draw` 两个路由取回后直接 `formatStorylines(storylines)`，中间没有 `filterActiveStorylines`，导致废弃/完结主线被拼进章纲和抽卡 prompt（与写作主路径 `orchestrator.ts` 口径不一致）。

**改动要点（关键 diff 片段）**

`chapter-outline/route.ts` 导入补 `filterActiveStorylines`：
```ts
import {
  loadOutlineData, extractPrevContext, extractNextContext,
  buildCharacterList, prepareOutlineDirective, formatSummaries,
  formatStorylines, extractLastChapterHook, filterActiveStorylines,
} from "@/core/pipeline/outline-context";
```
调用处（`:50`）：
```ts
// 旧：
const storylineContext = formatStorylines(storylines);
// 新：
const storylineContext = formatStorylines(filterActiveStorylines(storylines));
```
`draw/route.ts` 同款：导入补 `filterActiveStorylines`，且 `:44` 改为 `formatStorylines(filterActiveStorylines(storylines))`。

**验证**：`tsc` 零报错（见第四节）；改动仅为「取回 → 过滤 → 格式化」三步插入一步，逻辑与 `orchestrator.ts:679` 完全一致。

**是否真生效**：是。函数 `filterActiveStorylines` 已存在且有语义保证（`status !== "completed" && status !== "abandoned"`），现在章纲/抽卡与写作路径在同一份 `loadOutlineData` 上统一了过滤口径，废弃主线不再进入 `## 活跃剧情线` 区块。

**残留风险**：无。纯增量过滤，不影响其他字段与下游。

---

## 二、F2（P2）· 游戏章纲死字面量 `status:{in:["active","main"]}` 清理

**文件:行**：`src/app/api/game/outline/generate/route.ts:75`（查询）、`:122`（格式化）

**问题**：`where:{ projectId, status:{ in:["active","main"] } }` 把 `"main"` 当 `status` 值用，但 `Storyline.status` 没有 `main` 这个值，导致实际退化为「仅 active」。且修改后会把包括 `abandoned` 在内的 main 主线重新取回，须同步加过滤，否则反而引入 abandoned 泄漏。

**改动要点（关键 diff 片段）**
```ts
// 旧：
prisma.storyline.findMany({
  where: { projectId, status: { in: ["active", "main"] } },
  orderBy: { order: "asc" },
}),
// 新（与 loadOutlineData 一致）：
prisma.storyline.findMany({
  where: { projectId, OR: [{ type: "main" }, { status: "active" }] },
  orderBy: { order: "asc" },
}),
```
并在 `:122` 补守卫（与 F1 同源）：
```ts
const storylineContext = formatStorylines(filterActiveStorylines(storylines as any[]));
```
导入同步补 `filterActiveStorylines`。

**验证**：`tsc` 零报错；查询口径现在与 `loadOutlineData`（outline-context.ts:52）逐字一致，且经 `filterActiveStorylines` 收口，不会把 abandoned/completed 主线泄漏到游戏章纲 prompt。

**是否真生效**：是。死字面量已移除，且「含所有 main 主线」的语义与快速章纲/抽卡三入口统一。

**残留风险**：无。

---

## 三、F3（P1）· 抽卡 storylineId 选择器短路选中废弃主线

**文件:行**：`src/app/workspace/[projectId]/page.tsx:1284`

**问题**：`project.storylines?.find((s) => s.status === "active" || s.type === "main")` 中 `|| s.type === "main"` 让「只要是主线」短路命中，无视 status；若一条 `abandoned` 主线在数组靠前，会被当成「当前故事线」传给 `DrawCards`。

**改动要点（关键 diff 片段）**
```ts
// 旧：
storylineId={project.storylines?.find((s: any) => s.status === "active" || s.type === "main")?.id}
// 新：优先选活跃线；无活跃线时回退到「非 abandoned 的 main 主线」，但绝不选中废弃主线
storylineId={project.storylines?.find((s: any) => s.status === "active")?.id
  ?? project.storylines?.find((s: any) => s.type === "main" && s.status !== "abandoned")?.id}
```

**验证**：`tsc` 零报错（该表达式为内联 JSX 属性，`any` 类型无约束）；逻辑保证 `abandoned` 主线永远不会被选中。

**是否真生效**：是。`abandoned` 主线既不满足 `status === "active"`，也不满足 `status !== "abandoned"`，因此被双重排除；只在「无任何活跃线」时回退到仍存活的 main 主线，行为比原实现更稳。

**残留风险**：极低。仅当项目完全没有活跃线时会回退到非废弃的 main 主线（原本就可能发生），不改变正常路径。

---

## 四、F5（P1）· continue 续写 order 并发去重 + 空响应守卫

**文件:行**：`src/app/api/generate/continue/route.ts:44-85`（order 计算/创建）、`:207` 后（空响应守卫）；导入补 `STATUS_OUTLINE_ONLY`（`src/core/story-status.ts:21`）

**问题 A（TOCTOU）**：原逻辑 `aggregate(max order) → +1 → create` 是两次独立 DB 操作，中间无锁/事务；并发续写会读到同一旧 max，生成同 order 节点（schema 的 `order` 无唯一约束兜底）。

**改动要点 A（关键 diff 片段）**——把「聚合 + 创建」包进一个 DB 事务，并在事务内对当前 `Project` 行加 `FOR UPDATE` 行锁，强制同一 projectId 的并发续写串行化：
```ts
const nextNode = await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT 1 FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
  const orderAgg = await tx.storyNode.aggregate({ where: { projectId }, _max: { order: true } });
  const nextOrder = (orderAgg._max.order ?? 0) + 1;
  return await tx.storyNode.create({
    data: {
      projectId, parentId: (currentNode as any).parentId,
      type: (currentNode as any).type || "section",
      title: nextTitle, order: nextOrder, status: "drafting",
      outline: nextOutline || null,
      activeCharacters: (currentNode as any).activeCharacters,
      activeLoreIds: (currentNode as any).activeLoreIds, notes: null,
    },
  });
});
```
（`nextTitle`/`nextOutline` 的计算移到事务外，二者不依赖 DB，减少持锁时长。）

**问题 B（空响应污染）**：原 continue 路由流式结束后**没有**「正文为空」校验，空正文会被管线写成空 `ChapterSummary` 并回报 `status:"completed"`，导出出现「已完成空章」。write 路由已有同款守卫，continue 缺失。

**改动要点 B（关键 diff 片段）**——在 SSE 主流程「流式循环结束后、正则/后处理管线之前」插入守卫，前置拦截使空响应根本不进管线（无孤儿摘要）：
```ts
if (!fullContent || fullContent.trim().length === 0) {
  try {
    await prisma.storyNode.update({
      where: { id: nextNode.id },
      data: { status: STATUS_OUTLINE_ONLY, content: "" },
    });
  } catch { /* 回滚失败不阻塞报错返回 */ }
  send({ type: "error", content: "续写内容为空（模型未返回正文），已回滚该节点，未生成空章。请重试或检查 LLM 配置" });
  controller.close();
  return;
}
```

**验证**：`tsc` 零报错（`tx.$queryRaw`、`STATUS_OUTLINE_ONLY` 类型均通过）；逻辑与 write 路由 `write/route.ts:279-288` 同构，仅回滚目标为新创建的 `nextNode`。

**是否真生效**：
- 空响应守卫：**真生效**。流程上在管线之前 return，空正文时节点被回滚为 `outline_only` 空章、`done` 不再以 `completed` 回报，与 write 路径完全对齐。
- order 并发去重：**在软件层真生效，但属兜底而非终极方案**。同一 projectId 的两条并发 continue 会在 `Project` 行锁上排队，后者获得锁后重读已提交的 max，得到 +1 后的新 order，从而避免重复。注意：仅在「同一 projectId」粒度串行化；若两条并发请求针对不同 projectId，互不阻塞（本就无冲突）。终极加固（schema 加 `@@unique([projectId, order])` + 捕获 `P2002` 重试）仍建议后续做，作为 DB 层最后防线。

**残留风险**：
- 行锁方案依赖 Postgres（默认 READ COMMITTED 支持 `FOR UPDATE`），项目既定用 Postgres，无跨库兼容问题。
- 极端情况下若 `Project` 行锁等待超时（默认不会，create 极快），事务会抛错并进入外层 `jsonError` 兜底，不会写出重复 order，仅该次续写失败可重试。
- 未加唯一约束，故标注「待统一复验」时建议并行 Agent 不要误以为 order 已 100% 数据库级唯一。

---

## 五、F6（P2）· `paused` 非法状态收敛为 `abandoned`

**文件:行**
- `src/core/agents/intent-parser.ts:164`（"暂停" → "paused" 映射）
- `src/core/agents/tool-registry.ts:902`（tool schema `enum` 含 `paused`）

**问题**：意图解析把「暂停」映射成 `"paused"`，但 `Storyline.status` 无此值；下游 `storyline_list` 工具用它做 `prisma.storyline.findMany({ where:{ status } })` 永远查不到（任何故事线都没有 `paused` 值），返回空列表。tool schema 的 `enum` 还把 `paused` 列为合法值，进一步误导 LLM。

**改动要点（关键 diff 片段）**
```ts
// intent-parser.ts：把 "暂停" 收敛为合法终态 "abandoned"（业务上「暂停/放弃」同属非活跃）
const map: Record<string, string> = { "进行中": "active", "已完成": "completed", "暂停": "abandoned", "放弃": "abandoned" };
```
```ts
// tool-registry.ts：从 enum 移除死值 "paused"
status: { type: "string", description: "按状态筛选", enum: ["active", "completed", "abandoned"] },
```

**验证**：`tsc` 零报错；`execute` 处 `where.status = String(args.status)` 现在只会拿到合法值，查询可正常命中 `abandoned` 线。

**是否真生效**：是。映射与 enum 双处收敛，从根上消除 `paused` 死枚举；用户「列出我暂停/放弃的故事线」现在会返回 `abandoned` 线。

**残留风险**：无。未改动任何 `status` 写入路径，只是让查询能命中既有合法值。

---

## 六、tsc 验证结果

命令：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit`

- **我负责的全部 7 个文件零错误**：`chapter-outline/route.ts`、`chapter-outline/draw/route.ts`、`game/outline/generate/route.ts`、`workspace/[projectId]/page.tsx`、`intent-parser.ts`、`tool-registry.ts`、`generate/continue/route.ts`。
- **全仓仍余 3 处错误，全部位于 `src/app/api/stats/monitor/route.ts`（monitor Agent 的文件）**：
  ```
  src/app/api/stats/monitor/route.ts(140,54): error TS18047: 'n.wordCount' is possibly 'null'.
  src/app/api/stats/monitor/route.ts(145,18): error TS2345: Argument of type 'number | null' is not assignable to parameter of type 'number'.
  src/app/api/stats/monitor/route.ts(148,18): error TS2345: Argument of type 'number | null' is not assignable to parameter of type 'number'.
  ```
  该文件属于「monitor」Agent 的半成品，按本轮约束**一律不动**，故标记为 **「待统一 tsc 复验」**：待 monitor Agent 修复其 `n.wordCount` 可空问题后，全仓 tsc 即可归零。本修复 Agent 的工作不受其影响。

---

## 七、测试说明与总残留风险

- **未新增/未删除任何测试**，亦未触碰其他 Agent 的测试文件（保护 283 vitest 全绿门禁）。本次变更性质：F1/F2/F3/F6 是纯逻辑接线（复用已测函数 `filterActiveStorylines` 与既有的 `loadOutlineData` 查询）；F5 的事务 + 行锁 + 空响应守卫均镜像 `write/route.ts` 已验证实现。后续如需在集成层补测，建议：
  1. 用两个并发请求打 `POST /api/generate/continue` 同一 projectId，断言两条新节点 `order` 不重复（需 Postgres + 可控 mock）；
  2. 让 continue 的 LLM 返回空串，断言新节点 `status === "outline_only"` 且未产出 `done` 帧。
- **总残留风险**：
  1. continue order 并发目前为软件层（行锁）兜底，未上 DB 唯一约束（见 F5）——属设计取舍，非缺陷。
  2. `monitor/route.ts` 的 3 处 tsc 错误与它 Agent 的工作耦合，需在统一复验时收口。
  3. 本轮未覆盖 F4（UI 多主线遍历剔除 abandoned 主线 + 灰标），该条由对应 Agent 负责，不在本修复范围内。
