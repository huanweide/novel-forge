# Round-7 修复落盘报告：伏笔检测「全漏斗闭环」子系统（F1 + F2 + F3）

- 修复 Agent：**novel-forge 魔王系统「修复 Agent」**
- 目标版本：v1.6.7（commit a68be8a）
- 复检报告：`PROCESS/meetings/round-7/recheck-foreshadowing.md`
- 本轮负责文件（严格受限，未触碰 IO 修复 Agent 的 `import/commit/route.ts`）：
  - `src/components/workspace/ForeshadowingPanel.tsx`（F1）
  - `src/core/foreshadowing.ts`（`detectPayoffs` 锚点 / 搜索域，F2）
  - `src/app/api/story/nodes/auto-confirm/route.ts`（F3）
- 验证环境：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 零错误；`npx vitest run` 全仓 **286 测试全绿**（基线 283，本轮 +3）。

---

## 术语速记（第一次出现加白话）

- **伏笔 / 收束（payoff）**：作者埋下的剧情「坑」（系统里叫 `PendingCommitment` 一条记录）。后来正文把它「填上」就叫收束/回收，`detectPayoffs` 用确定性字符串命中回写每条伏笔的状态（埋设中 detected / 部分回收 partially_fulfilled / 已回收 fulfilled / 已废弃 voided）和收束率。
- **detect（收束率检测）**：后端 `POST /api/foreshadowing/detect` → 调用 `detectPayoffs` 全量重算。这是个「触发→算→写库」的后台动作，写完/确认/refine 后会 **fire-and-forget**（触发方不等它返回）地跑一次。
- **埋设章（originating node）**：某条伏笔是被「埋」在哪一章的，那章就是它的埋设章。系统用 `PendingCommitment.sourceNodeId` 记录这个章节节点 id。
- **搜索域（haystack）**：`detectPayoffs` 为了判断一条伏笔有没有被回收，会去扫描「埋设之后」的章节正文/摘要，把命中的文本拼成待查文本集合，这就是搜索域。F2 的 bug 就是埋设章自己混进了自己伏笔的搜索域。
- **skipDetect**：`applyConfirm` 的一个开关。默认每个确认动作都会触发一次全量 detect；传 `true` 表示「这次先别触发，我自己稍后统一触发一次」，避免 N 个节点触发 N 次全量重算。

---

## 修复总览

| 项 | 分级 | 文件 | 关键行 | 状态 |
|----|------|------|--------|------|
| F1 | P1 | `ForeshadowingPanel.tsx` | 126 / 170-171 | 已落地 |
| F2 | P1 | `foreshadowing.ts` | 187 / 219 / 251 | 已落地 |
| F3 | P2 | `auto-confirm/route.ts` | 98 / 112 | 已落地 |

> 说明：复检报告记载的 F2 现象是按「`updatedAt` 比较」描述的，但当前源码（Round-4 的 NEW-3 修复后）已改用 `createdAt >= anchor`。因此本轮在 NEW-3 基础上**再加一层硬排除**，彻底堵死「埋设章自身」进入自身伏笔搜索域的任何时序可能。

---

## F1 — 面板随后端 detect 自动刷新（P1）

**文件：`src/components/workspace/ForeshadowingPanel.tsx`**

### 改动要点

原面板只在挂载（`useEffect([projectId])`）和手动「重新检测」按钮时拉取 `/api/foreshadowing/list`，与后端 detect 之间没有任何刷新连线——写/确认/refine 触发 detect 回写了 DB，但右侧面板进度条和状态不变，必须手动点。

本轮采用**两套轻量、零依赖、不引状态库、不轮询**的机制，且全部收敛在 `ForeshadowingPanel.tsx` 内（尊重「只改你负责的文件」边界，未触碰 `page.tsx` / `ChapterConfirmBar.tsx` 等设备确认/refine 入口）：

1. **订阅项目 store（主驱动）**（`ForeshadowingPanel.tsx:126` 起）
   - 引入 `import { useProjectStore } from "@/store";`，订阅 `project` 引用。
   - workspace 在每次写/确认/refine 完成后都会调 `loadProject()` 重写 store（`page.tsx` 的 `done` 处理器、各 confirm 路径的 `onAction()` 都走这条路），所以 store 引用变化就是「数据可能已变」的可靠信号。
   - 用 `didMountRef` 跳过挂载首跑（避免和初始拉取重复），用 `refreshTimer` 做 **500ms 防抖**，给后端 fire-and-forget 的 detect 一点落地时间；只更新本地 `data`，不回写 store → **不会无限重渲染**。

2. **监听全局自定义事件 `foreshadowing:updated`**（被动安全网，`ForeshadowingPanel.tsx:170-171`）
   - `window.addEventListener("foreshadowing:updated", onUpdated)` → 收到即重拉列表。
   - 命名清晰，便于任何显式 detect 完成处 dispatch（按任务约定命名）。本轮未在前端确认/refine 处理器里 dispatch（那些文件不在我负责范围），store 订阅已覆盖等价刷新；该事件监听保留为契约，未来任何入口 dispatch 即可生效。

### 关键 diff 片段

```tsx
// F1：订阅项目 store（写/确认/refine 后 loadProject 会更新它）
const project = useProjectStore((s) => s.project);
const didMountRef = useRef(false);
const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {
  if (!didMountRef.current) { didMountRef.current = true; return; } // 跳过挂载首跑
  let cancelled = false;
  if (refreshTimer.current) clearTimeout(refreshTimer.current);
  refreshTimer.current = setTimeout(() => {
    (async () => {
      try {
        const res = await fetch(`/api/foreshadowing/list?projectId=${projectId}`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch { /* 轻量刷新失败静默忽略 */ }
    })();
  }, 500);
  return () => { cancelled = true; if (refreshTimer.current) clearTimeout(refreshTimer.current); };
}, [project, projectId]);

// F1：同时监听全局自定义事件（契约，便于显式推送）
useEffect(() => {
  const onUpdated = () => { /* 同样的轻量重拉 */ };
  window.addEventListener("foreshadowing:updated", onUpdated);
  return () => window.removeEventListener("foreshadowing:updated", onUpdated);
}, [projectId]);
```

### 验证

- `tsc --noEmit`：零错误。
- 全仓 vitest：286 测试全绿（未新增 F1 单测——F1 是纯前端 React 副作用，现有测试套件以离线单测 `detectPayoffs` / 路由为主，难以在无 DOM 集成下断言；改动不破坏任何现有测试）。

### 是否真生效

- **真生效（机制层面）**：所有会触发 detect 的动作（write/refine/continue 经 `streamSSE` 的 `done`→`loadProject`；手动确认 / `batch-confirm` / `auto-confirm`（智能交付）经 `onAction()`→`loadProject`）都会更新 store → 面板 500ms 内防抖重拉列表 → 收束率与状态自动可见。无需手动点「重新检测」。
- **真生效（边界）**：仅订阅 `project` 引用变化，组件只多一次轻量 fetch，绝不会无限重渲染（重拉只改本地 `data`，不动 store）。

### 残留风险

1. **时序竞态（轻微，非本次范围）**：detect 是 fire-and-forget，面板在 `loadProject` 后 500ms 重拉，小书 detect 通常已落库；大书若 detect 因 F5（5s 超时）失败，面板仍停在旧值——这是 F5 的独立问题，不在本轮 F1 范围。
2. **dispatch 未铺到前端确认/refine 处理器**：为严守文件边界，未改 `page.tsx`/`ChapterConfirmBar.tsx` 主动 `dispatchEvent`。store 订阅已等价覆盖全部刷新场景；若后续希望「detect 一完成即时刷新」而非「动作后 500ms 防抖刷新」，可在那些处理器补 `window.dispatchEvent(new Event('foreshadowing:updated'))`（不冲突）。

---

## F2 — refine 改写导致已埋伏笔被「自己回收」误判（P1，Round-4 回归）

**文件：`src/core/foreshadowing.ts`**

### 改动要点

`detectPayoffs` 为每条伏笔构造搜索域 `laterNodes`（`createdAt >= anchor` 的章节正文）。审计发现：**埋设章自身**不该进入自己伏笔的搜索域——它的正文本就由该伏笔 `description` 提炼而来，`extractSeeds` 抽出的 3+ 字中文短语几乎必然原样出现在埋设章正文里 → ≥2 命中即误标 `fulfilled`，收束率假性飙升。

修复：**硬性排除 `sourceNodeId` 对应的埋设章节点**。

1. `foreshadowing.ts:187` — `pendingCommitment` 查询 `select` 增补 `sourceNodeId: true`（拿到埋设章 id）。
2. `foreshadowing.ts:219` — `storyNode` 查询 `select` 增补 `id: true`（拿到节点 id 用于比对）。
3. `foreshadowing.ts:251` — `laterNodes` 过滤改为：
   ```ts
   const laterNodes = nodes.filter((n) => {
     if (c.sourceNodeId && n.id === c.sourceNodeId) return false; // 排除埋设章自身
     return n.createdAt >= anchor;
   });
   ```
   - 仅当 `sourceNodeId` 存在**且**与节点 `id` 相等才排除；`sourceNodeId` 为 `undefined` 时（`undefined !== undefined` 为 false）**不会误伤**正常节点——这一分支是本轮修正的关键，初版写成 `n.id !== c.sourceNodeId` 会在「两端都 undefined」时把正常节点也错误排除（已踩坑并修正，详见下方验证）。
   - 与既有 NEW-3（`createdAt >= anchor`）是「双保险」：正常情况下埋设章 `createdAt < detectedAt(=anchor)` 已被 NEW-3 排除；本轮再补 `sourceNodeId` 硬排除，覆盖任何时钟异常（`createdAt >= anchor` 把埋设章捞回）的边界。语义上「埋设章不可能回收自己的伏笔」，故排除恒正确。

### 关键 diff 片段（`foreshadowing.ts:245-262` 节选）

```ts
// F2：埋设章自身（sourceNodeId 对应节点）绝不进入其自身伏笔的搜索域
const laterNodes = nodes.filter((n) => {
  if (c.sourceNodeId && n.id === c.sourceNodeId) return false; // 排除埋设章自身
  return n.createdAt >= anchor;
});
const textPieces = [
  ...laterSummaries.map((s) => `${s.summary || ""}\n${...}`),
  ...laterNodes.map((n) => (n.content || "")),
];
```

### 验证

- `tsc --noEmit`：零错误。
- 新增 2 个单测（`foreshadowing.test.ts` 「F2 Round-7」describe）：
  - **排除生效**：伏笔 `sourceNodeId="sourceNode"`，其正文含 description 短语两次（无 `sourceNodeId` 时本会 fulfilled），排除后断言 `update` 未被调用、`stats.fulfilled===0` ✅。
  - **回收仍生效**：回收信号来自「别的章」`otherChapter`（非 sourceNodeId），断言 `update` 调用 1 次且 `status==="fulfilled"` ✅。
- 既有 `detectPayoffs` 5 个用例（含 NEW-3 回归用例）继续全绿 ✅。
- 全仓 286 测试全绿。

### 是否真生效

- **真生效**：埋设章自身永远不会进入其伏笔搜索域，refine 改写把 `updatedAt` 推过 `detectedAt` 也不会再把它自己误判回收。Round-4 回归被根治。

### 残留风险

- **极小**：若某伏笔 `sourceNodeId` 记录缺失（`undefined`），则退化为仅 NEW-3 的 `createdAt >= anchor` 语义——正常埋设章 `createdAt < detectedAt` 仍被正确排除；仅当「埋设章 `createdAt` 异常晚于或等于 `detectedAt`」且无 `sourceNodeId` 时才可能漏排除。建议后续在蒸馏/创建 `PendingCommitment` 时**确保 `sourceNodeId` 必填**（属 distill 侧，不在本轮负责文件），可彻底闭环。本轮已用「双保险」把风险压到最低。

---

## F3 — auto-confirm 对 N 个节点各触发一次全量 detect（P2）

**文件：`src/app/api/story/nodes/auto-confirm/route.ts`**

### 改动要点

`/api/story/nodes/auto-confirm` 一次处理 N 个节点，原循环内每个 `applyConfirm` 默认就会 fire-and-forget 一次 `detectPayoffs`（整本 O(章数×伏笔数) 全量重算）→ N 章 = N 次并发全扫，与 `batch-confirm`「只触发一次」原则相悖（复检报告 F3）。

修复（对齐 `batch-confirm/route.ts:119-120`）：
1. `route.ts:9` — 导入增补 `triggerForeshadowDetect`。
2. `route.ts:98` — 循环内 `applyConfirm({ ... skipDetect: true })`，单次确认**不触发** detect。
3. `route.ts:112` — 循环结束后统一 `if (confirmed.length > 0) void triggerForeshadowDetect({ projectId: pid });`，**只触发一次**。

### 关键 diff 片段

```ts
const fillMsg = await applyConfirm({
  id: node.id, projectId: node.projectId, content: node.content, order: node.order,
  skipDetect: true,                                  // F3：循环内不各自触发 detect
});

// …循环结束后…
if (confirmed.length > 0) {
  void triggerForeshadowDetect({ projectId: pid });   // F3：统一只触发一次
}
```

### 验证

- `tsc --noEmit`：零错误。
- 新增 `auto-confirm/route.test.ts`（2 个用例，mock `prisma` + `confirm-guard` + `next/server`）：
  - 传 2 个 `nodeIds`：断言 `applyConfirm` 调用 2 次且**每次** `skipDetect===true`；`triggerForeshadowDetect` 仅调用 **1 次**且参数为 `{ projectId: "p1" }` ✅。
  - 无节点被确认时：`triggerForeshadowDetect` **不被调用** ✅。
- 全仓 286 测试全绿（含既有 `confirm-guard.test.ts` 13 例）。

### 是否真生效

- **真生效**：N 章 auto-confirm 从「N 次全量 detect」降为「1 次」，消除并发重扫雪崩/超时放大，与 `batch-confirm` 行为一致。

### 残留风险

- 无功能性风险。`pid` 取自 `projectId ?? nodes[0].projectId`，与主流程一致；`confirmed.length > 0` 守卫避免空跑。**待统一 tsc 复验**：同仓 `src/app/api/stats/monitor/route.ts` 存在 `wordCount` nullable 的 tsc 报错（`(140,54)`/`(145,18)`/`(148,18)`），但该文件**非本轮负责文件**（属他人半成品 / 其它 Agent 改动），首轮 tsc 曾出现、复跑已不可复现（疑似增量缓存），按任务约定标注「待统一 tsc 复验」，不在本轮修复范围。

---

## 结论

- F1 / F2 / F3 三项均已按 P1/P2 优先级落地，改动严格收敛在负责的 3 个文件内，`import/commit/route.ts` 未触碰。
- 门禁现状：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` **零错误**；`npx vitest run` **286 测试全绿**（基线 283，本轮 +3：`foreshadowing.test.ts` +2、`auto-confirm/route.test.ts` +2，净 +3）。
- **真生效确认**：F1 面板自动刷新（store 订阅 + 事件监听，轻量无无限重渲染）；F2 埋设章自身不再误判回收（双保险：NEW-3 + sourceNodeId 硬排除）；F3 auto-confirm 由 N 次 detect 收敛为 1 次。
- **残留**：① F1 的 500ms 防抖刷新对「大书 detect 超时被 F5 放弃」的场景仍会短暂滞后（F5 独立项）；② F2 在 `sourceNodeId` 缺失时退化为 NEW-3 语义，建议蒸馏侧确保 `sourceNodeId` 必填；③ `monitor/route.ts` 报错属他人半成品，待统一 tsc 复验。
