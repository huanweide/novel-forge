# 写作链路复检报告（maxloop-overlord · 阶段五复检循环）

- 复检员：独立代码复检员（writing 视角）
- 复检对象：round-2 整合清单四项修复（R2-003 / R2-004 / R2-006 / R2-012）
- 复检方法：Grep + Read 当前源码 + 实跑 vitest 命令 + 静态闭环推演（非 git diff 比对）
- 复检铁律：Trust but verify。凡是依赖 dev server / 浏览器 / 真实 LLM 生成才能端到端验证的项，一律标注「未经实测，待验证」，不伪装已验证。

---

## 一、四条复检项逐条验证结论

### 1. R2-003（P1）：refine / continue 补传 source 字段，闭合填表溯源链路

**结论：生效（静态闭环已确认）。**

**证据链：**

(1) `src/app/api/generate/refine/route.ts:202-211` 的 `safeFillAfterWriting` 调用中，确实新增了 `source: "refine"`：

```ts
const babylore = await safeFillAfterWriting({
  projectId, content: newContent, send,
  nodeOrder: data.currentNode.order,
  isLatestChapter: refineIsLatest,
  nodeId,
  source: "refine",                         // ← R2-003 补传
  projectLlmConfig: projLlm as Record<string, unknown> | null,
});
```

(2) `src/app/api/generate/continue/route.ts:251-260` 的 `safeFillAfterWriting` 调用中，确实新增了 `source: "continue"`：

```ts
const babylore = await safeFillAfterWriting({
  projectId, content: fullContent, send,
  nodeOrder: (nextNode as any).order,
  isLatestChapter: contIsLatest,
  nodeId: nextNode.id,
  source: "continue",                       // ← R2-003 补传
  projectLlmConfig: projLlm as Record<string, unknown> | null,
});
```

(3) 下游消费端确实读取 `source` 并写入行级溯源 `_src`。`src/core/babylore/fill.ts:594`：

```ts
const srcLabel = `ch${options?.chapterOrder ?? "?"}:batch${options?.batchId ?? "manual"}${options?.source ? ":" + options.source : ""}`;
```

而 `src/core/babylore/loop.ts:168` 把入参透传：`babyloreFill(projectId, content, { projectLlmConfig, chapterOrder: nodeOrder, source: input.source })`。注意 `loop.ts:109` 的解构虽未列出 `source`，但第 168 行直接用 `input.source` 透传，链路并未断裂。因此 refine 路径最终写入 `ch{n}:batchmanual:refine`，continue 路径写入 `ch{n}:batchmanual:continue`，与 confirm（manual）、auto-confirm、batch 三入口（`confirm-guard.ts:143`、`batch-confirm/route.ts:83`、`[id]/route.ts:190` 均已传 source）的溯源段格式完全对齐。

**调用链闭合性核对（防「source 另有未补传路径」）：** 全代码库 `safeFillAfterWriting` 的调用点共 5 处，逐一核对：
- refine/route.ts:209 → `source: "refine"`（补传，本次修复）
- continue/route.ts:258 → `source: "continue"`（补传，本次修复）
- confirm-guard.ts:143 → `source: "auto-confirm"`
- batch-confirm/route.ts:83 → `source: "batch"`
- [id]/route.ts:190 → `source: "manual"`

write 路由（`write/route.ts`）本身已不再直接调用 `safeFillAfterWriting`（填表已下移到确认动作，符合 v0.46.55 的架构决策），因此不存在「write 漏传 source」的第六个入口。结论：所有入口的溯源段一致，R2-003 的「单链路闭合」目标达成。

**诚实边界：** 本次仅验证「字段已补传 + 消费端已读取 + 格式对齐」的静态闭环。端到端是否真在真实项目库里写出 `:refine`/`:continue` 段，需要真实 LLM 生成 + 真实数据库才能观测，属「未经实测，待验证」。但代码路径本身的闭合性是确定的。

---

### 2. R2-004（P1）：批量角色卡持久化断链（新增 localStorage 写入端）

**结论：生效（读写两端闭合，键一致）。**

**证据链：**

(1) 写入端确实落地。`src/app/workspace/[projectId]/page.tsx:1294-1308` 的 PreGenConfirm `onConfirm` 回调中新增了写入：

```ts
onConfirm={(cards, notes, newChars, finalAuthorNote) => {
  if (project) {
    try {
      localStorage.setItem(
        `pregen-conf-${project.id}`,
        JSON.stringify({ selected: cards, newChars }),   // ← R2-004 写入端
      );
    } catch { /* 隐私模式静默降级 */ }
  }
  switch (preGenMode) { ... }
}}
```

(2) 读取端确实存在且键一致。Grep 全代码库 `pregen-conf-` 仅命中两处：
- 读：`page.tsx:806` → `localStorage.getItem(`pregen-conf-${project.id}`)`
- 写：`page.tsx:1302` → `localStorage.setItem(`pregen-conf-${project.id}`, ...)`

两处键模板均为 `pregen-conf-${project.id}`，**没有读写键不一致问题**（此点直接回应了「挖掘新坑」提示里的 localStorage 键不一致怀疑——经核对，键完全一致）。

(3) 读写数据形态一致。`onConfirm` 写入 `{ selected: cards, newChars }`；而 `handleBatchGenerate`（`page.tsx:804-816`）读取：

```ts
const pregenPersisted = (() => {
  try {
    return JSON.parse(localStorage.getItem(`pregen-conf-${project.id}`) || "{}") as {
      selected?: string[];
      newChars?: string[];
    };
  } catch { return {}; }
})();
const batchConfirmedCardIds =
  drawSelectedCharIds.length > 0 ? drawSelectedCharIds : pregenPersisted.selected ?? [];
const batchNewChars = pregenPersisted.newChars ?? [];
```

读取字段 `selected` / `newChars` 与写入字段精确对应。`PreGenConfirm.tsx:102` 的 `onConfirm(confirmedIds, {}, newChars, localAuthorNote)` 确认 `cards` 形参实传即为勾选的角色 ID 数组，与 `selected` 语义吻合。

**闭环判定：** 写入端（确认弹窗落库）→ 读取端（批量生成起手快照）两端均存在、键一致、字段对应，批量生成路径的角色约束默认来源因此被真实打通。此前「全代码库无写入端、批量章恒为空约束」的断链已修复。

**诚实边界：** 写入发生在用户单次 PreGen 确认的交互中，读取发生在后续「批量生成」交互起手——二者是跨交互的 localStorage 持久化，无法在单元测试里直接串联跑通（需浏览器 + 真实交互）。本次核对的是代码闭环与键/字段一致性；真实浏览器持久化行为属「未经实测，待验证」，但静态证据足够支撑「修复已落地」。

---

### 3. R2-006（P1，交叉验证）：formatStorylines 给支线标题追加「（隶属主线 Y）」

**结论：生效（独立再确认，逻辑正确）。**

**证据链：** `src/core/pipeline/outline-context.ts:71-95` 的 `formatStorylines`：

```ts
export function formatStorylines(storylines: any[]): string {
  if (!storylines || storylines.length === 0) return "";
  const mainTitleById = new Map<string, string>();
  for (const s of storylines) {
    if (s.type === "main" && s.id) mainTitleById.set(s.id, s.title);  // 建主线 id→title 映射
  }
  return storylines
    .map((s: any) => {
      let prefix = `【剧情线：${s.title}】${s.type === "main" ? "（主线）" : "（支线）"}`;
      if (s.type !== "main" && s.parentId && mainTitleById.has(s.parentId)) {
        prefix += `（隶属主线 ${mainTitleById.get(s.parentId)}）`;   // ← R2-006 追加
      }
      ...
    })
    .join("\n\n");
}
```

逻辑复核：
- 主线映射只收集 `type === "main"` 的线，正确。
- 支线（`type !== "main"`）仅在 `parentId` 命中主线映射时追加「（隶属主线 Y）」，避免凭空捏造隶属关系，正确。
- 该函数被 `buildPromptContext`（`src/core/agents/orchestrator.ts:681`）与章纲生成路径消费，注入写作/大纲 prompt，使模型感知「支线 X 隶属于主线 Y」。

**与 storyline 复检的衔接：** 写作链路（write/refine/continue）经 `context-loader.ts:83-86` 取 `status: "active"` 的全部剧情线（主线+支线）传入 `buildPromptContext`，故 `formatStorylines` 拿到的 `storylines` 同时含主线与支线，标签追加逻辑可正常触发。R2-006 在写作上下文注入侧工作正常。

**潜在关联隐患（见新坑 NEW-2）：** `formatStorylines` 本身逻辑正确，但它在「大纲生成路径」的上游数据源 `loadOutlineData`（`outline-context.ts:52-55`）存在一处筛选缺陷，可能让主线在传入 `formatStorylines` 前就被丢弃，从而使「（隶属主线 Y）」标签在大纲路径下静默消失。该缺陷不属于 R2-006 本身的回归，但会削弱 R2-006 承诺的覆盖范围，已列入新坑清单。

---

### 4. R2-012（P1）：每章生成无界全量加载 → 轻量 select + 按需拉取

**结论：生效（静态验证；无单测可跑）。**

**证据链：** `src/core/pipeline/context-loader.ts` 的 `loadGenerationContext` 改造为两段式加载：

(1) 全量节点改为轻量 select（仅结构字段，不含正文）：`context-loader.ts:37-51`

```ts
prisma.storyNode.findMany({
  where: { projectId },
  orderBy: { order: "asc" },
  select: {
    id: true, parentId: true, type: true, title: true,
    order: true, status: true, branchId: true,
    activeLoreIds: true, activeCharacters: true,
  },
}),
```

(2) 仅对当前章之前的「近期窗口」按需补全全量正文：`context-loader.ts:99-119`

```ts
const keepChapters = ((project as any)?.contextKeepChapters as number) ?? 4;
const keepWindow = Math.max(keepChapters, 5);   // 覆盖 continue 硬编码 -5
const curIdx = allNodesLight.findIndex((n) => n.id === nodeId);
const prevIds = curIdx >= 0
  ? allNodesLight.slice(Math.max(0, curIdx - keepWindow), curIdx).map((n) => n.id)
  : [];
const prevFull = prevIds.length > 0
  ? await prisma.storyNode.findMany({ where: { id: { in: prevIds } } })  // 无 select → 拉全量
  : [];
const prevFullMap = new Map(prevFull.map((n) => [n.id, n]));
const allNodes = allNodesLight.map((n) => { const full = prevFullMap.get(n.id); return full ? full : n; });
```

**不破坏功能的静态推演：**

- 三个消费方（write/refine/continue）对 `allNodes` 的正文需求，全部收敛到「当前章之前的近期窗口」节点，而这些节点已被 `prevFull` 补回 `content`，下游无感。
  - write：`previousNodes = data.allNodes.slice(curIdx - keepChapters, curIdx)`（`write/route.ts:69-72`），`keepChapters ≤ keepWindow`，故窗口内节点均有正文。
  - refine：`previousNodes = data.allNodes.slice(currentNodeIndex - 4, currentNodeIndex)`（`refine/route.ts:56-57`），4 ≤ keepWindow(=5)，窗口内节点有正文。
  - continue：`previousNodes = allNodes.filter(n => n.order <= currentNode.order && n.content).slice(-5)`（`continue/route.ts:90-92`），靠 `n.content` 真值过滤天然只取已补正文的近章。
- `buildPromptContext`（`orchestrator.ts:597-599`、`666`）只消费传入的 `previousNodes`（窗口内、有正文），不遍历 `allNodes` 取正文；`classifyEvents` 用 summaries/beats，不依赖 `allNodes.content`。故轻量 select 不会造成「渲染缺数据」。
- `keepWindow = Math.max(keepChapters, 5)` 保证：无论项目配置 `contextKeepChapters` 为多少，正文窗口都至少覆盖 continue 硬编码的 5 章，消除改造前 continue 用 `-5` 与改造后窗口不一致的风险。
- `loadGenerationContext` 仅被 write/refine/continue 三路由消费（Grep 确认无其他调用方），影响面可控，不会误伤大纲/抽卡等其他路径（那些走 `loadOutlineData` 的整表 `findMany`，未改动）。

**测试执行情况：** 按要求尝试实跑 `npx vitest run src/core/pipeline/`，结果：

```
RUN v4.1.10
No test files found, exiting with code 1
filter: src/core/pipeline/
```

`src/core/pipeline/` 下不存在任何 `*.test.ts`（也无 `__tests__` 目录）；全代码库 Grep `context-loader|outline-context|formatStorylines|pregen-conf` 在 `*.test.ts` 中零命中。因此 R2-012 的「不破坏功能」只能由静态闭环推演支撑，**没有可执行的单元测试**去断言「窗口外节点缺失 content 不会引发渲染缺数据」。这是诚实边界：本项属于「静态验证通过，但缺单测覆盖」。

---

## 二、新坑清单（round-2 未发现、真实存在的新缺陷）

以下每条均给出 文件:行号 + 问题性质 + 复现思路。优先级按「确定性与影响」排序。

### NEW-1（HIGH）：continue 路由章节号自增逻辑失效，续写章永远被命名为「上一章标题（续）」

- 位置：`src/app/api/generate/continue/route.ts:49-55`
- 代码：

```ts
let nextTitle = "";
if ((currentNode as any).title) {
  const match = (currentNode as any).title.match(/^(.+?)(\d+)$/);
  nextTitle = match ? `${match[1]}${parseInt(match[2]) + 1}` : `${(currentNode as any).title}（续）`;
} else {
  nextTitle = `第${(allNodes as any[]).length + 1}节`;
}
```

- 问题：`/^(.+?)(\d+)$/` 要求**标题以数字结尾**。但本系统章纲/写作链路生成的章节标题标准格式是 `第N章：xxx`（见 `post-processor.ts:618` 的自动命名 `第${chapterOrder+1}章：${titleBase}`）。例如 `currentNode.title = "第3章：觉醒"` 时，字符串以「觉醒」结尾，正则无法匹配（结尾不是数字），于是走 `:` 分支，得到 `第3章：觉醒（续）`。
- 后果：一键续写后，新节点标题恒为「上一章标题 + （续）」，章节号**永远不递增**。生成完成后 `post-processor.ts:614` 的占位判定 `isPlaceholder = !curTitle || /^第\s*\d+\s*章$/.test(curTitle)` 对「第3章：觉醒（续）」也为 false，因此自动命名逻辑不会纠正它，错误标题被原样保留。长期续写会产出一堆「第3章：觉醒（续）」「第3章：觉醒（续）（续）」式标题，章节序号语义彻底崩坏，且下游任何按「第N章」解析标题的逻辑都会失效。
- 复现：写一章（标题自动变为 `第3章：觉醒`）→ 点「一键续写」→ 观察新建节点 `title` 字段为 `第3章：觉醒（续）` 而非 `第4章：...`。

### NEW-2（MEDIUM）：大纲路径剧情线筛选把 status 与 type 混用，非 active 主线下 R2-006 标签静默消失

- 位置：`src/core/pipeline/outline-context.ts:52-55`（`loadOutlineData`）
- 代码：

```ts
prisma.storyline.findMany({
  where: { projectId, status: { in: ["active", "main"] } },
  orderBy: { order: "asc" },
}),
```

- 问题：Storyline 模型的 `status` 枚举是 `"active" | "completed" | "abandoned"`（`schema.prisma:328`），而 `"main"` 是 `type` 字段的值（`schema.prisma:324`），不是合法 status。这里把类型值塞进 status 筛选数组，属于 status/type 概念混用。其实际效果是：只返回 `status === "active"` 的剧情线（因为 `status` 几乎不可能等于字面量 `"main"`）。一旦某条**主线**的 `status` 被改为 `completed`/`abandoned`（主线完结是常见操作），它就不会进入 `storylines` 数组，于是 `formatStorylines`（`outline-context.ts:74-77`）的 `mainTitleById` 里根本没有这条主线，其下所有支线的「（隶属主线 Y）」标签便**静默消失**——直接削弱 R2-006 承诺的覆盖范围。
- 对比：写作链路（`context-loader.ts:83-86`）用的是 `status: "active"`（正确、类型无关），所以写章时 R2-006 标签正常；唯独大纲生成路径（`loadOutlineData`）因这处混用筛选，在「主线已完结」的项目里会漏标。两路径行为不一致，正是 round-2 没发现的隐性缺陷。
- 复现：新建主线 A（status=active）与支线 B（parentId=A.id）→ 正常大纲生成，B 显示「（隶属主线 A）」；把 A 的 status 改为 `completed` → 再次大纲生成，B 仅显示「（支线）」，隶属标注丢失。

### NEW-3（MEDIUM）：continue 路由 nextOrder 用「兄弟数组下标 +1」当全局 order，造成 order 值重复

- 位置：`src/app/api/generate/continue/route.ts:45-47`
- 代码：

```ts
const siblings = (allNodes as any[]).filter((n: any) => n.parentId === (currentNode as any).parentId);
const currentIndex = siblings.findIndex((n: any) => n.id === currentNodeId);
const nextOrder = currentIndex >= 0 ? currentIndex + 1 : siblings.length;
```

- 问题：`currentIndex` 是「当前节点在兄弟数组中的下标」（0 起），而 `nextOrder` 被当成全局 `order` 字段写入新建节点。两者语义不等价。`order` 是项目内全局序号（`context-loader` 按 `order asc` 排序、`continue` 用 `n.order <= currentNode.order` 过滤前情、`isLatestChapter` 用 `order === max(order)` 判定），并非「兄弟内相对位次」。
- 后果（可复现）：当项目存在嵌套结构（卷/章，或分卷后章节 order 非从 0 连续）时，siblings 的 `order` 是全局值（如某卷下两章 order=5、6）。若当前节点是 order=6（siblings 下标 1），则 `nextOrder = 1 + 1 = 2`，与已有节点（如另一卷首章 order=2）**撞号**；若当前节点是 order=5（下标 0），`nextOrder = 0 + 1 = 1`，撞上全局 order=1 的节点。总之新建节点的 `order` 总是等于某个已存在兄弟的 order，产生**重复 order**。Schema 中 `StoryNode.order` 无 `@unique` 约束（`schema.prisma:142` 仅 `Int @default(0)`），所以不会立即报错，但会破坏「order 即序列位次」的隐含不变量：后续「续写」再算 siblings 下标会继续错位，`previousNodes` 的 `order <=` 过滤与 `isLatestChapter` 的 `order === max` 判定都可能抓错节点，章节时序与「最新章」识别出现偏差。
- 正确做法应为 `nextOrder = currentNode.order + 1` 或 `Math.max(...siblings.map(s => s.order)) + 1`。
- 复现：建一卷含两章（order=5、6），对 order=6 的章点续写 → 检查新建节点 `order` 字段，应为 7，实际得到 2（与既有节点 order 冲突）。

### NEW-4（LOW）：buildPromptContext 用不存在的 `completed` 字段过滤剧情线，意图未实现（死代码）

- 位置：`src/core/agents/orchestrator.ts:679`
- 代码：

```ts
const activeStorylines = (storylines || []).filter((s: any) => !s?.completed);
```

- 问题：Storyline 模型（`schema.prisma:319-348`）根本没有 `completed` 字段，只有 `status`（active/completed/abandoned）。因此 `s?.completed` 恒为 `undefined`，`!undefined === true`，该过滤**永远放行全部剧情线**——「排除已完成剧情线」的设计意图并未实现，已完结（status=completed）的剧情线仍会被注入写作 prompt，提示模型继续推进一条本该收束的线。
- 影响：低。属误导性死代码 + 轻微质量损耗（让模型去推进已完结线）。但值得修：应改为 `s.status !== "completed"` 之类。
- 复现：建一条 status=completed 的剧情线 → 写章时观察 prompt 中的「故事线进度」区块，该已完成线仍出现。

### NEW-5（LOW/观察）：refine 路由对「空正文节点」的 mode 判定为 write，与 refine 语义无碍但命名略歧义

- 位置：`src/app/api/generate/refine/route.ts:216`
- 代码：`mode: hasContent ? "refine" : "write"`
- 说明：当 refine 的目标节点尚无正文（hasContent=false）时，done 事件 `mode` 标为 `"write"`。这是有意为之（从零撰写），不影响功能，仅在前端区分 refine/write 统计时可能造成口径偏差。列出供参考，非阻断性缺陷。

---

## 三、复检员诚实声明（哪些真测了、哪些待验证）

### 真做了的验证（有证据）
1. **Grep + Read 全量核对**了四条复检项对应的源码当前内容，确认改动真实落地：
   - R2-003：refine/route.ts:209 与 continue/route.ts:258 的 `source` 字段、fill.ts:594 的 `_src` 拼接、loop.ts:168 的透传，全部命中。
   - R2-004：page.tsx 中 `pregen-conf-${project.id}` 的 set（1302）与 get（806）两端均存在、键一致、字段（selected/newChars）对应。
   - R2-006：outline-context.ts:74-85 的 mainTitleById 构建与支线标签追加逻辑确认无误。
   - R2-012：context-loader.ts:37-51 轻量 select 与 99-119 窗口补正文，两段式加载确认落地。
2. **调用链闭合推演**：safeFillAfterWriting 全部 5 个调用点的 source 段逐一比对，确认无遗漏补传路径；localStorage 读写键一致性由 Grep 全库仅两处命中直接证明。
3. **实跑测试命令**：`npx vitest run src/core/pipeline/` 实际执行，返回「No test files found」——证明该目录无单测，R2-012 无法靠单测断言，已如实记录。

### 未经实测、待验证的项（绝不伪装已验证）
1. **R2-003 端到端溯源落库**：`ch{n}:batchmanual:refine/continue` 是否真写入真实数据库的行 `_src`，需要真实 LLM 生成 + 真实 Prisma 连接，无法在当前静态复检中跑通。仅证明代码路径闭合。
2. **R2-004 浏览器持久化行为**：写入发生在一次交互、读取发生在另一次交互，需真实浏览器 + 用户在 PreGen 弹窗勾选角色并确认 + 之后触发批量生成，方能端到端观测。仅证明代码闭环与键/字段一致。
3. **R2-006 / R2-012 运行时效果**：formatStorylines 标签注入、轻量 select 在长项目（数千章、正文累计数十 MB）下的内存/时延收益，需要真实数据库规模 + dev server 才能验证。静态推演表明不破坏功能，但「性能收益是否达成」「超大项目是否真无回归」属待验证。
4. **新坑 NEW-1/2/3/4 的运行时触发**：均通过代码逻辑推演 + 复现思路给出，未实际启动 dev server 跑出错误标题/重复 order。其中 NEW-1、NEW-3 为确定性逻辑缺陷（不依赖运行环境即可判定），NEW-2、NEW-4 为数据/语义缺陷，建议后续用真实项目数据或单测固化。

### 复检总体判断
四条 round-2 修复项在**代码落地与逻辑闭环层面均成立**（R2-003 生效、R2-004 生效、R2-006 生效、R2-012 生效），无假收敛迹象。但本次独立复检额外挖出 5 处 round-2 未发现的新缺陷，其中 NEW-1（续写章号不递增）与 NEW-3（order 重复）确定性较高、影响写作链路核心产物（章节命名与排序），建议优先排入下一轮修复；NEW-2 会削弱 R2-006 在大纲路径的覆盖，应一并修；NEW-4 为低危死代码，可顺手清理。
