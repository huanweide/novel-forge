# 魔王系统 · Round-3 复检循环 · 独立复检报告（世界卡 + 伏笔）

- 复检员：独立代码复检员（魔王系统 Round-3 复检循环 · lens-worldcard-entity）
- 复检日期：2026-08-07
- 项目根：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- 复检对象：Round-3 两条修复
  - 修复 A（世界卡 catOrder 最后一公里）：`PROCESS/meetings/round-3/fix-worldcard-catorder.md` + 背景 `PROCESS/meetings/round-2/recheck-1/lens-worldcard.md` 的 PIT-1
  - 修复 B（伏笔 R2-007 收口）：`PROCESS/meetings/round-3/fix-foreshadowing-r2-007.md` + 背景 `PROCESS/meetings/round-2/recheck-1/lens-entity.md` 的 R2-007 / 新坑1 / 新坑2 / 新坑3
- 方法：Trust but verify。所有结论均来自对当前文件的 Grep + Read 实读，以及 `npx vitest run` 实跑产物，而非仅凭修复报告自述。未能端到端实测的项明确标注「未经实测，待验证」。
- 一句话结论：**修复 A 真生效，修复 B 真生效（代码落地 + 测试全绿），但两者均为「半截修复」，各自残留一处会在未来或当前就造成偏差的缺陷，新坑共 5 条（其中 1 条为 Round-3 新增 helper 引入的轻微缺陷，2 条为既有根因残留且本轮未彻底消除，2 条为既有死参数/负载问题关联确认）。**

---

## 一、两条修复逐条验证结论

### 1. 修复 A「世界卡 catOrder 最后一公里」—— 结论：生效（真生效，非纸面）

**验证目标**：`src/core/sync-global-prompt.ts` 的 `catOrder` 已从硬编码改为从 `ALL_WORLD_CATEGORIES` 派生、覆盖全部 15 类、生成侧全局提示确实注入这 15 类。

#### 1.1 改动真实落地的证据（Grep + Read）

- `src/core/sync-global-prompt.ts:11` 新增 import：
  `import { ALL_WORLD_CATEGORIES } from "@/lib/world-category-classifier";` —— import 真实存在，未缺失。
- `src/core/sync-global-prompt.ts:173`：
  `const catOrder = ALL_WORLD_CATEGORIES;` —— 已从权威常量派生，不再是修复前那条 10 项硬编码数组（`["worldview","story_progression","geography","faction","magic_system","history","culture","creature","item","custom"]`）。
- `src/lib/world-category-classifier.ts:38-42` 的 `ALL_WORLD_CATEGORIES` 确认为 15 项：
  `geography, faction, item, magic_system, technique, creature, culture, history, law, currency, character_relationship, custom, fate_system, physics, public_system`。
- `src/core/sync-global-prompt.ts:182-194` 消费处：
  ```ts
  for (const cat of catOrder) {
    const group = loreEntries.filter((e) => (e.category || "custom") === cat);
    if (group.length === 0) continue;
    parts.push(`\n## ${catLabel[cat] || cat}（${group.length}条）`);
    ...
  }
  ```
  循环遍历 `catOrder`（= 全量 15 类），`catLabel[cat] || cat` 有兜底；除该循环外，全文不存在任何对 `category` 的二次过滤或白名单截断（已用 Grep 确认 `catOrder` 的唯一消费处就是第 182 行的 for 循环）。因此 15 类世界卡条目只要 `enabled: true` 且 `category` 属于 15 类之一，就必然被渲染进 `globalPrompt`。

**catLabel 覆盖核对（关键，防止「覆盖 15 类但标题漏 key 退化」）**：
逐条比对 `ALL_WORLD_CATEGORIES`（15 项）与 `src/core/sync-global-prompt.ts:174-180` 的 `catLabel` 手写键集合：

| ALL_WORLD_CATEGORIES | catLabel 是否含该 key |
|---|---|
| geography | 是（🗺 地理） |
| faction | 是（🏛 势力） |
| item | 是（💎 器物） |
| magic_system | 是（⚙️ 力量体系） |
| technique | 是（📘 功法体系） |
| creature | 是（🐉 生物） |
| culture | 是（🎭 文化） |
| history | 是（📜 历史） |
| law | 是（⚖️ 规则法则） |
| currency | 是（💰 货币体系） |
| character_relationship | 是（🔗 角色关系） |
| custom | 是（📦 自定义） |
| fate_system | 是（🔮 命运体系） |
| physics | 是（🔬 物理） |
| public_system | 是（🏛 公开体制） |

15/15 键值全部存在，无遗漏、无虚构分类（原 `worldview` / `story_progression` 已删除，已用 Grep 确认文件内仅剩一处说明性注释，无运行时引用）。原先被静默丢弃的 `technique / law / currency / character_relationship / fate_system / physics / public_system` 共 7 类现在全部进入渲染循环，且 `character_relationship` 此前正是 PIT-1 点名的 7 个漏网之一，本轮一并补上。

#### 1.2 测试输出（本地实跑）

```
$ npx vitest run src/core/babylore/entity-sync.test.ts src/lib/world-category-classifier.test.ts src/core/confirm-guard.test.ts

 ✓ src/lib/world-category-classifier.test.ts (6 tests) 5ms
 ✓ src/core/confirm-guard.test.ts (10 tests) 8ms
 ✓ src/core/babylore/entity-sync.test.ts (4 tests) 6ms

 Test Files  3 passed (3)
      Tests  20 passed (20)
   Duration  478ms
```

其中 `world-category-classifier.test.ts`（6 个）覆盖分类器自身正确性，包括 15 类可达性；`entity-sync.test.ts`（4 个）覆盖 R2-002 的 13 类世界卡落库闭环 + R2-001 的 3 个兜底路由断言。这两组测试虽不直接断言 `catOrder` 派生，但它们与修复 A 共享同一权威源 `ALL_WORLD_CATEGORIES`，可佐证「单一来源」这一前提未破裂。

#### 1.3 结论

修复 A 真生效：`catOrder` 已派生自 `ALL_WORLD_CATEGORIES`，循环遍历全量 15 类，无二次截断，`catLabel` 15/15 全覆盖，原 PIT-1 的「7 类世界卡在生成侧被静默丢弃」已消除。代码落地 + 分类器/落库测试全绿。

---

### 2. 修复 B「伏笔 R2-007 收口」—— 结论：生效（真生效，但为半截修复，见新坑1）

**验证目标**：批量确认与 refine 确认两条漏斗已补触发 `/api/foreshadowing/detect`（新增共享 helper `triggerForeshadowDetect`）；detect 自调用有失败日志 + 重试。

#### 2.1 共享 helper 真实落地（Grep + Read）

`src/core/confirm-guard.ts:195-225` 新增 `triggerForeshadowDetect`：
```ts
export async function triggerForeshadowDetect(args: { projectId: string; nodeId?: string; origin?: string; }): Promise<void> {
  const origin = args.origin || process.env.APP_ORIGIN || "http://localhost:3001";
  const url = `${origin}/api/foreshadowing/detect`;
  const body = JSON.stringify({ projectId: args.projectId, nodeId: args.nodeId });
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!res.ok) { lastErr = new Error(`detect 返回非 2xx 状态码 ${res.status}`); continue; }
      return;
    } catch (e) { lastErr = e; }
  }
  console.error("[foreshadowing/detect] 自调用失败（已重试1次，放弃）:", ..., { projectId, nodeId });
}
```
失败不再静默吞错（至少 `console.error` 一次，附 `projectId`/`nodeId`），且轻量重试一次（最多 2 次）。这与修复报告一致。

#### 2.2 五处调用点全部到位（Grep 实证）

```
src/core/confirm-guard.ts:181            applyConfirm 默认路径（auto-confirm / 游戏导出） → void triggerForeshadowDetect({ projectId, nodeId })
src/core/pipeline/post-processor.ts:700  步骤 4.5（write/continue 摘要后补触发）        → void triggerForeshadowDetect({ projectId, nodeId })
src/app/api/story/nodes/[id]/route.ts:217         手动 confirm                       → void triggerForeshadowDetect({ projectId, origin: new URL(request.url).origin })
src/app/api/story/nodes/batch-confirm/route.ts:120 批量确认（缺口 A 收口）            → void triggerForeshadowDetect({ projectId, origin: new URL(request.url).origin })
src/app/api/generate/refine/route.ts:200           refine 确认（缺口 B 收口）         → void triggerForeshadowDetect({ projectId, nodeId, origin })
```

批量确认（缺口 A）与 refine 确认（缺口 B）两个此前漏网的漏斗 now 确实触发 detect，且两者均使用真实 `request.url.origin`（始终可达），与手动 confirm 一致。

#### 2.3 时序闭环与「无重复触发」核对（重要，排除引入重复触发的新坑）

- `post-processor.ts:238-244` 的 `applyConfirm` 调用确实传入 `skipDetect: true`（已 Read 确认第 243 行）。
- 因此 write/continue 路径：步骤 3.1 `applyConfirm(skipDetect:true)` 不触发 detect → 步骤 4.5（`if(!skipSummarize)` 块内，第 700 行）触发一次。路径内仅 1 次 detect，无重复。
- refine 路径：步骤 3.1 `applyConfirm(skipDetect:true)` 不触发 → `if(!skipSummarize)` 整体跳过（步骤 4.5 不执行）→ refine 路由第 200 行兜底触发 1 次。路径内仅 1 次 detect，无重复。
- auto-confirm / 游戏导出：`applyConfirm` 默认（不传 skipDetect）→ 第 181 行触发 1 次。
- 全代码库 `skipDetect: true` 的运行时调用点仅有 `post-processor.ts:243` 一处（已 Grep 确认），无其他路径误传导致 detect 漏发。

**结论：Round-3 修复 B 没有引入「重复触发」或「漏触发」回归，五条确认漏斗（auto-confirm/游戏导出、手动 confirm、write/continue 后处理、批量确认、refine 确认）均会触发 detect，且 detect 自调用已有失败日志 + 轻量重试。**

#### 2.4 测试输出（本地实跑，含 5 个新增 detect 用例）

`src/core/confirm-guard.test.ts` 当前共 10 个用例：
- `evaluateConfirmEligibility` 纯函数护栏 5 个（绿）；
- 新增 `describe("triggerForeshadowDetect（R2-007 收口…）")` 3 个（绿）：POST 到 detect 且 body 含 `projectId`/`nodeId`；网络失败 → 重试 1 次 + `console.error`；非 2xx → 重试 1 次 + 记录日志；
- 新增 `describe("applyConfirm（R2-007 收口：skipDetect 控制 detect 触发）")` 2 个（绿）：`skipDetect` 不传 → 确认后 fetch 被调 1 次；`skipDetect:true` → fetch 未被调用。

即修复报告所称「5 个新增 detect 用例」全部真实存在且实跑通过，合并进 20 passed 的总输出（见 1.2）。

#### 2.5 结论

修复 B 真生效：批量确认与 refine 确认两条漏斗已补触发 detect，共享 helper 含失败日志 + 重试，五处调用点到位且时序闭环、无重复/漏触发。但需注意：refine 触发的 detect 实际能扫到的数据与「收束率真正更新」之间存在半截缺口（见新坑1），故本轮给修复 B 标「生效（半截）」。

---

## 二、新坑清单（Round-3 改动引入或遗留的新缺陷）

以下每条均给出 文件:行号 + 问题本质 + 复现思路。按严重度从高到低。

### 新坑 1（P1，半截修复）：refine 确认虽触发 detect，但 detect 扫的是「陈旧摘要」，refine 文本的收束信号仍不可见

- 位置：`src/app/api/generate/refine/route.ts:186`（`skipSummarize: true`）+ `src/core/pipeline/post-processor.ts:512`（`if(!skipSummarize)` 包裹整个步骤 4，含步骤 4.5 的摘要创建）+ `src/app/api/generate/refine/route.ts:198-203`（兜底触发 detect）+ `src/core/foreshadowing.ts:190-219`（detectPayoffs 只读 chapterSummary）。
- 问题：Round-3 修复报告 2.4 节声称「detect 幂等全量重算，可覆盖 refine 经本地蒸馏在 step 3.6 新创建的 pendingCommitment，使其收束率被回写」。这一收益论述**不成立**：`detectPayoffs` 的命中 haystack 完全由 `chapterSummary.summary + keyEvents` 拼接而成（foreshadowing.ts:212-219），**不读 `storyNode.content`**；而 refine 路径 `skipSummarize:true` 使步骤 4 整体跳过，**refine 不会为改写后的章节生成或更新 chapterSummary**（refine 路由自身也只做 `safeFillAfterWriting` 填表 + 后处理存储正文，不创建 summary）。后果：refine 改写后的正文里明确回收/新埋的伏笔信号，永远不会进入 detect 的检索域；即便 detect 被触发，也只是对**改写前的陈旧摘要**重算一遍，refine 真正的收束效果不会被回写。即「触发了 detect」与「detect 能看见 refine 的内容」是两回事，本轮只解决了前者，未解决后者。这与 Round-2 复检 新坑2（「skipSummarize 致 detect 缺失」）的**根因完全一致且未被消除**——detect 被写死进「摘要」分支，凡不走摘要的确认路径，既在确认时跳 detect（已修），又在语义上无法让 detect 观察到该路径的新内容。
- 复现思路：写一章埋设伏笔 A（pendingCommitment，状态 pending）；对该章做 refine 改写，使正文明确回收 A（如出现 A 的 closureConditions 关键词）；refine 自动确认后观察 ForeshadowingPanel，A 仍为 pending / partially_fulfilled，未被回写为 fulfilled。
- 修复建议：refine 路径要么在确认后增量更新该章 chapterSummary（或至少补生成一次摘要），要么将 `detectPayoffs` 的 haystack 由「仅摘要」扩展为「摘要 + 对应 storyNode.content」，使其能观察到非摘要路径的正文变化。

### 新坑 2（P1/P2，多源漂移根因残留）：catLabel 仍手抄，与 ALL_WORLD_CATEGORIES 无编译期联动，修复 A 只解决「覆盖」未解决「标签同步」

- 位置：`src/core/sync-global-prompt.ts:174-180`（`catLabel` 为 15 项手抄 `Record<string,string>`），对照 `:173` 已派生的 `catOrder = ALL_WORLD_CATEGORIES`。
- 问题：修复 A 把 `catOrder` 改为从权威常量派生（消除了 PIT-1 的「覆盖缺失」），但**故意保留** `catLabel` 的手写中文标签（修复报告诚实声明第 4 条明说本轮不做此扩展）。于是「分类清单」与「分类中文标题」重新分裂为两处手抄源：`ALL_WORLD_CATEGORIES` 是权威 15 类，`catLabel` 是另一份同样 15 项的手抄映射。一旦未来有人在 `ALL_WORLD_CATEGORIES` 增/删/改名一类，`catLabel` 不联动，新增类会走 `catLabel[cat] || cat` 兜底，在 `globalPrompt` 里显示裸英文 raw key（如 `public_system`），分组标题退化且与 `WORLD_MODULES` 的中文 label 不一致。PIT-1 的系统性根因（多源漂移，原 PIT-2）并未真正消除，只是把「最致命的覆盖缺失」补上了，标签同步这一半仍是手抄。
- 复现思路：向 `ALL_WORLD_CATEGORIES` 追加一类 `artifact`，写一条 `category="artifact"` 的世界卡并启用，触发 `syncGlobalPrompt`，检索 `project.globalPrompt`，该分组标题显示为裸 `artifact` 而非中文。
- 修复建议：将 `catLabel` 改为从 `WORLD_MODULES`（或新增的「分类→中文名」单一映射）派生，与 `catOrder` 共用同一权威源，彻底消除最后一处手抄。

### 新坑 3（P1，部署耦合残留，影响面比 Round-3 描述更大）：auto-confirm / write / continue 主链路 detect 自调用仍回退 APP_ORIGIN，非 3001 部署必失败

- 位置：`src/core/confirm-guard.ts:181`（`applyConfirm` 默认路径：auto-confirm / 游戏导出，未传 origin）+ `src/core/pipeline/post-processor.ts:700`（write/continue 后处理 4.5，未传 origin）。两者调用 `triggerForeshadowDetect` 时未注入真实 `origin`，回退 `process.env.APP_ORIGIN || "http://localhost:3001"`。
- 问题：Round-3 仅在 batch-confirm / `[id]` / refine 三个「持有 request 的路由」改用真实 `request.url.origin`；而**日常写作最大的主链路**（write 路由、continue 路由、auto-confirm、游戏导出）仍走 env 默认值。修复报告诚实声明第 2 条把这点列为「残留」，但低估了其影响面——它覆盖的不是边缘路径，而是**用户每次写章/续写自动确认**的核心路径。在 `APP_ORIGIN` 未设置且服务端口非 3001 的部署（容器映射、反向代理、本地换端口调试）上，这些主链路的 detect 自调用会打到错误地址；现在至少会 `console.error` + 重试 1 次（比 Round-2 的静默吞错好），但**必然失败**，伏笔面板同样不刷新，只是从「无声失败」变成「有声失败」。
- 复现思路：`APP_ORIGIN` 不设，服务跑在 3002；写一章走 write 路由自动确认 → detect 请求打到 `http://localhost:3001/api/foreshadowing/detect` 失败 → 面板不刷新 → 服务端日志出现 `[foreshadowing/detect] 自调用失败` 记录。
- 修复建议：把 `request`/origin 透传进 `applyConfirm` 与后处理（较大重构），或在这些无 request 的上下文中也注入真实 baseURL（如从运行环境推断），消除主链路的 env 耦合。

### 新坑 4（P2，Round-3 新增 helper 引入的轻微缺陷）：triggerForeshadowDetect 重试无超时/无退避，且失败即翻倍 detect 负载

- 位置：`src/core/confirm-guard.ts:200-219`（fetch 无 `AbortSignal`/`timeout`；重试为 `for` 循环立即二次调用，无间隔/退避）。
- 问题：Round-3 为消除「静默吞错」新增了轻量重试，但引入两个轻微副作用：(a) **无超时**：`fetch` 默认无超时，在 serverless/边缘环境里，若 detect 路由因 O(C×S) 全量重算（见新坑 5）而长时间不返回，这个 fire-and-forget 的 promise 会长时间挂起、占用连接/事件循环任务，在高并发确认下可能累积；(b) **失败即翻倍负载**：retry 会向本就可能在重负载下出错的 detect 路由再发一次完整的全量重算请求，对正在抖动的服务器是雪上加霜，而非退避缓解。这是「为修静默失败而加重试」时常见的轻率实现，建议补 `AbortSignal.timeout(...)` 与最小退避。
- 复现思路：制造 detect 路由慢响应（如超大项目使 detectPayoffs 跑数秒），连续确认多章，观察 fire-and-forget promise 挂起数量与第二次重试请求的并发峰值。
- 修复建议：`fetch` 加 `signal: AbortSignal.timeout(5000)`（按项目规模调参）；两次尝试间 `await sleep(200)` 轻退避；或仅在 `res.ok===false` 而非超时长任务时重试。

### 新坑 5（P2，既有死参数关联确认）：detect 路由完全忽略 nodeId，所有「detect 补触发」的 nodeId 均为死参数，节点级增量不可能

- 位置：`src/app/api/foreshadowing/detect/route.ts:14-25`（只取 `body.projectId`，`nodeId` 不读）+ `confirm-guard.ts:202`（body 带 nodeId 但路由丢弃）。
- 问题：这是 Round-2 复检 新坑5 的关联确认，并非 Round-3 引入，但 Round-3 把 `nodeId` 继续作为调用参数在 batch-confirm / refine / applyConfirm 四处传递（如 `triggerForeshadowDetect({ projectId, nodeId, origin })`），强化了「detect 已做节点级隔离」的**错觉**。实际上 `detectPayoffs` 永远对整本 `pendingCommitment × chapterSummary` 全量重算（O(C×S)），`nodeId` 是纯死参数。在 Round-3 收口后，每确认一章（无论 write/continue/auto/batch/refine）都会触发一次整本全量扫描；对百章千伏笔的长篇，这会让确认接口被 detect 自调用拖慢，且无法靠 `nodeId` 做增量。属已知性能债，Round-3 未触碰，复检在此显式标注以免维护者被死参数误导。
- 复现思路：对 50 章项目每确认一章，观察 detect 路由内部 `pendingCommitment.findMany`（全量）+ `chapterSummary.findMany`（全量）执行次数随确认次数线性累积。
- 修复建议：detect 支持 `nodeId` 作用域（只扫该节点 `detectedAt` 之后的摘要，或仅当新增摘要时才重算），或改为「确认后置 dirty 标记，由面板懒加载/低频聚合任务计算」。

---

## 三、复检员诚实声明（哪些真测了、哪些仅静态核对、哪些待验证）

### 3.1 真测（本地实跑，非仅看 diff）

- `npx vitest run src/core/babylore/entity-sync.test.ts src/lib/world-category-classifier.test.ts src/core/confirm-guard.test.ts` → **20 passed (20)**，其中：
  - `world-category-classifier.test.ts` 6 个（分类器自身 + 15 类可达性）；
  - `confirm-guard.test.ts` 10 个（含 5 个新增 detect 相关用例：triggerForeshadowDetect 的 POST/body 校验、网络失败重试+日志、非 2xx 重试+日志；applyConfirm 的 skipDetect 控制触发 2 个）；
  - `entity-sync.test.ts` 4 个（R2-002 的 13 类落库闭环 + R2-001 的 3 个兜底路由）。
- 改动落地真实性：对修复 A 涉及的 `sync-global-prompt.ts`、`world-category-classifier.ts`，以及修复 B 涉及的 `confirm-guard.ts`、`post-processor.ts`、`batch-confirm/route.ts`、`refine/route.ts`、`[id]/route.ts`、`detect/route.ts` 做了逐行 Read + Grep，确认 import、派生写法、helper 定义、5 处调用点、`skipDetect:true` 单一调用点均真实存在，非仅存在于修复报告描述。

### 3.2 仅静态核对（Grep + Read，未经单测/集成实测）

- 修复 A 的「15 类世界卡内容确实进入 `globalPrompt` 文本」：基于 `catOrder = ALL_WORLD_CATEGORIES` 全量遍历 + 无二次过滤 + `catLabel` 15/15 覆盖的代码路径推断，已实跑分类器/落库测试但未实跑「写一条 law 类世界卡 → 触发 syncGlobalPrompt → 检索 globalPrompt 字符串」的端到端断言。
- 修复 B 的五条漏斗 detect 触发：调用点与 `skipDetect` 语义通过 Read 逐行确认，且 5 个新增单测覆盖了 helper 与 `applyConfirm` 的触发控制；但 **detect 触发后整条链路（detect 路由 → detectPayoffs → 面板刷新）未经集成实测**。
- 新坑 1（refine detect 扫陈旧摘要）：通过 Read `refine/route.ts` 的 `skipSummarize:true` + `post-processor.ts:512` 的 `if(!skipSummarize)` 包裹 + `foreshadowing.ts:190-219` 的 haystack 仅由 summary 构成，静态推断得出，未实跑「refine 回收伏笔 → 面板不更新」的端到端用例。
- 新坑 2（catLabel 手抄漂移）：通过比对 `catOrder` 派生源与 `catLabel` 手写键集，静态确认两者分离维护。
- 新坑 3（origin 耦合主链路）：通过 Read 两处未传 origin 的调用点静态确认。
- 新坑 4（重试无超时/无退避）：通过 Read helper 的 fetch 调用静态确认。
- 新坑 5（nodeId 死参数）：通过 Read detect 路由只取 projectId 静态确认。

### 3.3 未经实测、待验证的项（明确标注，绝不作伪）

- **未启动 dev server / 浏览器做端到端验证**：本环境仅 mock 层单测 + 静态核对，未起 `next dev`、未连真实 Postgres、未跑真实 LLM 网关。因此以下结论为代码路径推断，强烈建议主 Agent 在 dev server 上确认：
  1. 写一条 `law` / `technique` / `public_system` 类世界卡，触发 `syncGlobalPrompt`，检索 `project.globalPrompt`，确证该 7 类（含 character_relationship）真正出现在「世界书」章节（验证修复 A 的端到端注入）。
  2. 写一章埋设伏笔 A，refine 改写回收 A，确认后看 ForeshadowingPanel 是否仍不更新（验证新坑 1 的真实存在）。
  3. 在 `APP_ORIGIN` 未设置、非 3001 端口部署下走 write 路由自动确认，看伏笔面板是否因 detect 打到错误地址而不刷新（验证新坑 3 的真实影响）。
- **detectPayoffs 语义命中质量未经真实语料验证**：新坑 1 的「refine 文本不可见」是基于 haystack 仅由 summary 构成的推导；真实项目里 refine 是否普遍不更新 summary、detect 是否常基于陈旧摘要误判，需要拿真实 `pendingCommitment` + `chapterSummary` 数据跑一次确认偏差幅度。
- **性能（新坑 5）未经压测**：O(C×S) 全量重算在规模化数据下的实际影响需 benchmark，本复检未做。
- **重复/漏触发结论未经集成实测**：新坑 3 部分已通过单测（`applyConfirm` 的 skipDetect 控制）守护，但「五条漏斗在真实请求下各恰好触发一次」的集成断言未写，仅靠静态核对。

### 3.4 复检结论总览

- 修复 A（世界卡 catOrder 最后一公里）：**生效**。catOrder 已派生自 ALL_WORLD_CATEGORIES，循环遍历全量 15 类，catLabel 15/15 覆盖，原 PIT-1 的 7 类静默丢弃已消除；分类器/落库测试 + 新增 confirm-guard 测试全绿（20 passed）。残留：catLabel 仍手抄（新坑 2，PIT-2 根因未消除）。
- 修复 B（伏笔 R2-007 收口）：**生效（半截）**。批量确认与 refine 确认两条漏斗已补触发 detect，共享 helper 含失败日志 + 重试，五处调用点到位、时序闭环、无重复/漏触发；5 个新增 detect 用例实跑通过。残留：refine 触发的 detect 扫描的是陈旧摘要，收束率实际不更新（新坑 1）；主链路 origin 耦合仍导致非 3001 部署 detect 失败（新坑 3）；重试无超时/退避（新坑 4）；nodeId 死参数（新坑 5）。
- 新坑数量：5 条（P1×2：新坑1、新坑3；P1/P2×1：新坑2；P2×2：新坑4、新坑5）。
