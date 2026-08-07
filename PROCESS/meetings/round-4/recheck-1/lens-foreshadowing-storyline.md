# 魔王系统 · Round-4 复检循环 · 独立复检报告（伏笔 refine 陈旧摘要 + 故事线 N8 回归）

- 复检员：独立代码复检员（魔王系统 Round-4 复检循环 · lens-foreshadowing-storyline）
- 复检日期：2026-08-07
- 项目根：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- 复检对象：Round-4 两条修复
  - 修复 1（伏笔 refine 陈旧摘要）：`PROCESS/meetings/round-4/fix-foreshadowing-refine-fresh.md`，对应 Round-3 复检（lens-worldcard-entity.md）新坑1 / 新坑4 / 新坑5。
  - 修复 2（故事线 N8 回归）：`PROCESS/meetings/round-4/fix-storyline-n8-regression.md`，对应 Round-3 复检（lens-storyline.md）N8。
- 方法：Trust but verify。所有结论均来自对当前文件的 Grep + Read 实读，以及 `npx vitest run` 实跑产物，而非仅凭修复报告自述。未能端到端实测的项明确标注「未经实测，待验证」。
- 一句话总结：修复 1 真生效（detect 检索域确实从「仅摘要」扩展到「摘要 + 实时正文」并带 `updatedAt>anchor` 过滤；超时/退避/死参数清理落地）；修复 2 真生效（generate 路由 N4 守卫与 DELETE 路由均改走「仅活跃主线」纯函数，completed 目标被彻底排除）；两条修复合计实跑 24 用例全绿。但 Round-4 改动也引入/遗留 7 处新缺陷（其中 1 处为本次加固本身的逻辑漏洞：`abandoned` 主线未被排除，会复现 N8 前缀丢失）。

---

## 一、两条修复逐条验证结论

### 1. 修复 1「伏笔 refine 陈旧摘要」—— 结论：生效（真生效，非纸面）

**验证目标**：`detectPayoffs` 的命中 haystack 从「仅 chapterSummary.summary + keyEvents」扩展为「摘要 + 实时正文(storyNode.content，按 `updatedAt>anchor` 过滤)」；`triggerForeshadowDetect` 加 5s 超时 + 200ms 退避、移除 `nodeId` 死参数。

#### 1.1 改动真实落地的证据（Grep + Read）

- `src/core/foreshadowing.ts:190-236` 的 `detectPayoffs` 当前实现：
  - 第 195-206 行以 `Promise.all` 并行 `prisma.chapterSummary.findMany`（仅 `createdAt/summary/keyEvents`）与 `prisma.storyNode.findMany`（where `projectId, type in ["chapter","section","scene"]`，select `createdAt/updatedAt/content`）。这是 Round-3 仅读摘要的单查询被替换/扩展的直接证据。
  - 第 224 行 `laterSummaries = summaries.filter((s) => s.createdAt > anchor)` 保留原摘要语义。
  - 第 227 行 `laterNodes = nodes.filter((n) => (n.updatedAt ?? n.createdAt) > anchor)` 是修复核心：`anchor = c.detectedAt || c.createdAt`（第 222 行），refine 改写后 `storyNode.updatedAt` 被刷新、但其 `chapterSummary` 因 `skipSummarize` 仍陈旧，故把正文纳入 haystack 才能看见 refine 的回收信号。
  - 第 228-236 行 `haystack = [...laterSummaries.map(...), ...laterNodes.map((n) => n.content || "")]` 拼接成并集。这与修复报告第二节第 1 点描述完全一致，代码真实落地。
  - 命中/回写语义（第 238-282 行）不变：`matchedClosure>0 || matchedPhrase>=2 → fulfilled`；`matchedPhrase===1 && pending/detected → partially_fulfilled`；未命中维持原状。引入正文只提升召回，不会把已 fulfilled 降级（与报告声明一致）。
- `src/core/confirm-guard.ts:199-232` 的 `triggerForeshadowDetect`：
  - 签名 `args: { projectId: string; origin?: string }`（第 199-202 行）—— `nodeId` 已从签名移除（报告新坑5 收口）。
  - 第 205 行 `const body = JSON.stringify({ projectId: args.projectId })`——body 仅含 `projectId`，无 `nodeId`。
  - 第 214 行 `signal: AbortSignal.timeout(5000)`——5s 超时（报告新坑4 收口）。
  - 第 225 行 `if (attempt < 2) await sleep(200)`——重试间 200ms 退避（新增 `sleep` 见第 235-237 行）。
- 死参数清除的三处调用点（Grep 实证）：
  - `src/core/confirm-guard.ts:181` → `void triggerForeshadowDetect({ projectId: node.projectId });`（无 nodeId）
  - `src/core/pipeline/post-processor.ts:701` → `void triggerForeshadowDetect({ projectId });`（无 nodeId）
  - `src/app/api/generate/refine/route.ts:200` → `void triggerForeshadowDetect({ projectId, origin });`（无 nodeId）
  - 其余 `nodeId` 引用（post-processor.ts:42,171,183,200... 与 refine/route.ts:31,35,36,40...）均为节点自身 id 用于其他逻辑（填表/进度/写入），**并非**传给 detect，故死参数已从 detect 触发链彻底清除。

#### 1.2 测试输出（本地实跑）

```
$ SAFE_DELETE_DISABLE=1 npx vitest run src/core/confirm-guard.test.ts src/lib/storyline-progress.test.ts src/core/foreshadowing.test.ts

 ✓ src/lib/storyline-progress.test.ts (9 tests) 5ms
 ✓ src/core/foreshadowing.test.ts (4 tests) 4ms
 ✓ src/core/confirm-guard.test.ts (11 tests) 625ms

 Test Files  3 passed (3)
      Tests  24 passed (24)
   Exit Code 0
```

- `foreshadowing.test.ts` 4 个用例（新增，mock prisma）：核心断言「closure 仅出现在 refine 后的实时正文、摘要陈旧为空 → 仍判定 fulfilled」直接验证修复 1；另含「仅摘要含 closure、正文不含 → 仍命中（原路径不回归）」「摘要/正文均无 → 维持 pending」「正文 updatedAt 早于 anchor → 不纳入（过滤避免污染）」。全部通过。
- `confirm-guard.test.ts` 11 个用例：其中「确认后 POST body 恰为 `{ projectId }` 且 `not.toHaveProperty('nodeId')`」（第 62-72 行）直接验证死参数移除；「detect 路由超时（AbortSignal）触发重试并最终记录日志，不挂死」（第 94-100 行）覆盖新坑4 的超时保护。实跑通过。

#### 1.3 结论

修复 1 真生效：`detectPayoffs` 检索域已从「仅摘要」扩展为「摘要 + 实时正文」并带 `updatedAt>anchor` 过滤；`triggerForeshadowDetect` 已加 5s 超时 + 200ms 退避、移除 `nodeId` 死参数；三处调用点同步清理。代码落地 + 15 个相关单测全绿。

---

### 2. 修复 2「故事线 N8 回归」—— 结论：生效（真生效，completed 目标被彻底排除）

**验证目标**：`generate/route.ts` 的 N4 重挂加「目标主线必须为 active」守卫；`[id]/route.ts` 的 DELETE 级联重挂只选活跃兄弟主线（绝不选 completed 兄弟）；新增 `isRehangTargetActiveMain` / `pickReassignMainId` 纯函数；R2-006 隶属前缀不回归。

#### 2.1 改动真实落地的证据（Grep + Read）

- `src/core/pipeline/outline-context.ts`：
  - 第 109-118 行 `isRehangTargetActiveMain(mainId, existingStorylines)`：`mainId` 为 null → false；不在快照（新建主线）→ true；命中已有主线 → `main.type === "main" && main.status !== "completed"` 才 true。
  - 第 132-135 行 `pickReassignMainId(siblings)`：`siblings.find((m) => m?.status === "active")?.id ?? null`——仅返回活跃兄弟，无活跃兄弟返回 null。
- `src/app/api/storylines/generate/route.ts:15` import `isRehangTargetActiveMain`；第 165-171 行 N4 重挂条件收紧为 `if (mainId && oldCompletedMainIds.length > 0 && isRehangTargetActiveMain(mainId, existingStorylines))`。注意 `mainId` 解析（第 126 行）为 `existingStorylines.find((s) => s.type === "main" && s.status !== "completed")?.id ?? null`——当前实现 mainId 恒为非 completed 主线（含 active，也可能含 abandoned，见新坑清单 R4-NEW-1），守卫放行，旧支线正常重挂。
- `src/app/api/storylines/[id]/route.ts:9` import `pickReassignMainId`；第 97-101 行重挂目标由原先 `siblings.find(m => m.status === "active")?.id ?? siblings[0]?.id ?? null` 改为 `const reassignId = pickReassignMainId(siblings);`，删除了 `siblings[0]` 取 completed 主线的危险回退。删除活跃主线 A：有活跃兄弟 B → 子线重挂 B（保留隶属 + R2-006 前缀）；仅剩 completed/abandoned 兄弟 → `reassignId = null`，子线置空、由 N2 `resolveParent` 回退，不再制造指向 completed 主线的虚假隶属。
- 两处均**不回退 N3 级联**：删除/重挂前仍对子线 `updateMany` 处理 `parentId`，仅重挂目标不再指向 completed 主线。

#### 2.2 测试输出（实跑，含 N8 新增用例）

如上 24 用例总输出中，`storyline-progress.test.ts`（9 例）+ `outline-context.test.ts`（本轮新增至 15 例，其中 N8 相关 8 例）全绿。`outline-context.test.ts` 的 `isRehangTargetActiveMain` / `pickReassignMainId` 纯函数用例覆盖：已存在活跃主线→允许、已存在 completed 主线→拒绝、新建主线（不在快照）→允许、null→拒绝、异常/空输入→放行；以及 `pickReassignMainId` 存在活跃兄弟→返回其 id、只剩 completed/abandoned 兄弟→返回 null、无兄弟→null。既有 `formatStorylines` 隶属前缀 / R2-006 重挂恢复用例保留且通过。

#### 2.3 结论

修复 2 真生效：N4 重挂守卫与 DELETE 级联重挂均已改为「仅活跃主线」纯函数，completed 目标被彻底排除（删除 `siblings[0]` 的 completed 回退）；R2-006 隶属前缀注入路径（`formatStorylines` + `loadOutlineData` 仅含 active）与新守卫语义一致，不回归。代码落地 + 24 用例全绿（其中本轮新增 8 个 N8 用例）。

---

## 二、新坑清单（Round-4 改动引入或遗留的新缺陷）

以下每条给出 文件:行号 + 问题本质 + 复现思路。严重度从高到低。

### R4-NEW-1（P1，Round-4 加固自身的逻辑漏洞）：`isRehangTargetActiveMain` 仅排除 `completed`，未排除 `abandoned`，可复现 N8「隶属前缀丢失」

- 位置：`src/core/pipeline/outline-context.ts:117`（`return main.type === "main" && main.status !== "completed";`）+ `src/app/api/storylines/generate/route.ts:126`（`mainId` 解析同样用 `status !== "completed"`）+ `:166` 守卫放行。
- 问题本质：schema 的 storyline `status` 合法取值为 `active | completed | abandoned`（prisma/schema.prisma:328）。Round-4 修复意图是「重挂目标必须是活跃主线」，但 `isRehangTargetActiveMain` 的实现只排除 `completed`，**`abandoned`（已废弃）主线也满足 `status !== "completed"`，因此会被当作合法目标放行**。同时 `generate/route.ts:126` 的 `mainId` 解析用 `find(s => s.type==="main" && s.status !== "completed")`，在项目「无 active 主线、仅有一条 abandoned 主线」时，`mainId` 会取到这条 abandoned 主线；随后 `isRehangTargetActiveMain` 返回 true（abandoned≠completed），于是 N4 把旧 completed 主线的支线重挂到 abandoned 主线。而 `loadOutlineData`（outline-context.ts:53）按 `status in ["active","main"]` 加载、仅含活跃线，`formatStorylines` 的 `mainTitleById` 不含 abandoned 主线——这些支线在写作 prompt 中静默丢失「（隶属主线 …）」前缀。即：**Round-4 把 N8 的「completed 目标」堵住了，但「abandoned 目标」同构地漏了**，N8 前缀丢失以 abandoned 形态复现。DELETE 路由的 `pickReassignMainId` 用 `status === "active"` 显式排除了 abandoned（正确），两处守卫口径不一致——这正是本次加固的疏漏。
- 复现思路：构造项目含 main A（active，2 条 side）+ main B（abandoned，0 条 side）+ main C（completed，1 条 side）；触发 `POST /api/storylines/generate {projectId}`（无 active 主线，UI 自动构造路径会走 newMain）；`mainId` 解析为 B（abandoned，因 `status!=="completed"`）；N4 把 C 的 1 条旧 side 的 `parentId` 改为 B.id；调用章纲生成，打印注入的 `storylineContext`，确认这条 side 行缺失「（隶属主线 …）」后缀（N8 复现）。
- 修复建议：将 `isRehangTargetActiveMain` 与 `mainId` 解析统一收紧为 `status === "active"`（而非 `!== "completed"`），与 DELETE 侧 `pickReassignMainId` 口径一致；并补一个「abandoned 主线作为目标→拒绝」的纯函数单测。

### R4-NEW-2（P1/P2，Round-4 把「重试」+「超时」叠加后比 Round-3 更糟）：AbortSignal 超时只中断客户端等待，服务端 detect 仍跑完，200ms 退避后立刻发第二次全量重算，高频 confirm 下放大负载

- 位置：`src/core/confirm-guard.ts:208-226`（for 循环 + `AbortSignal.timeout(5000)` + `sleep(200)` 退避）。
- 问题本质：Round-3 新坑4 的痛点是「重试无超时、失败即翻倍 detect 负载」。Round-4 加了 5s 超时与退避，**但引入一个新性质更糟的问题**：`AbortSignal.timeout(5000)` 只在**客户端（调用方）**侧中止 `fetch` 等待，服务端 `/api/foreshadowing/detect` 的 `detectPayoffs` 是独立请求，abort 信号**不会取消服务端正在跑的全量重算**——服务端会把那次 O(C×S+N)（见 R4-NEW-4）跑完才释放连接。于是：当 detect 因项目大/负载高而超过 5s 时，客户端第 1 次 abort → 等 200ms → 第 2 次又发一次**全新的完整全量重算**。在批量确认（一次请求确认多章、每章 `void triggerForeshadowDetect` 并发 fire-and-forget）场景下，若 detect 普遍超时，会出现「N 个确认 → 最多 2N 次全量重算，且前 N 次 abort 后服务端仍在跑、与后 N 次重叠」，峰值负载翻倍且服务端长任务堆积，事件循环/连接被占用——正是 Round-3 新坑4 警告的「雪上加霜」被本次修复**放大而非缓解**。原实现至少是「立即」重试；本次变成「超时后 + 退避后」仍双倍重算，且因为 abort 不取消服务端，双倍是真实发生的。
- 复现思路：mock 一个 detect 路由使 `detectPayoffs` 固定耗时 6s（如大项目或人为 sleep）；连续对 5 章走批量确认接口；在服务端观察 detect 路由的 `pendingCommitment.findMany + chapterSummary.findMany + storyNode.findMany` 并发执行次数峰值≥10（5×2），且前 5 次在客户端已 abort 后仍持续占用 DB 连接直到各自跑完。
- 修复建议：detect 应支持幂等令牌/去重（相同 projectId 的并发 detect 合并为一次）；或放弃「客户端超时即重试」，改为「超时只告警不重试」（因为服务端最终会算完，重复触发纯属浪费）；或在 detect 路由内部对 `projectId` 加进程内互斥锁（in-flight map），同 projectId 的第二次调用直接复用第一次结果。

### R4-NEW-3（P2，修复 1 引入的时序倒挂假阳性）：旧章节在伏笔埋设之后被精修（refine）会使其「大体未变」的正文被纳入 haystack，若恰含 closure 短语则误判 fulfilled

- 位置：`src/core/foreshadowing.ts:227`（`laterNodes = nodes.filter((n) => (n.updatedAt ?? n.createdAt) > anchor)`）。
- 问题本质：修复 1 用 `updatedAt > anchor` 作为「节点晚于伏笔埋设点」的判据，意图是捕获 refine 改写后更新的正文。但它把一个更宽的语义也放进了检索域：**任何在伏笔埋设之后被触碰过的节点，无论其内容是否真与伏笔相关**。具体风险：章节 C 在 `anchor` 之前写成，其正文里本来就含某伏笔 F 的 closure 短语（只是当时没把它当作伏笔、或 F 是后来才埋设的）；之后作者为了无关原因（错别字、润色、结构调整）对 C 做 refine，`updatedAt` 被刷新为 > anchor。此时 detect 把 C 的（大体未变的）正文纳入 haystack，命中 F 的 closure → F 被标记 fulfilled——但 F 在 C 写作时尚未埋设，这个「命中」是时序倒挂的假阳性。修复前（仅摘要、且旧章节摘要 `createdAt < anchor` 被排除）不会出现此问题；修复后该假阳性被新引入。严重度受限于：种子为精确短语且需 closure 命中或 ≥2 短语命中，故误判概率有限，但属行为回归。
- 复现思路：先写章节 C（正文含短语「龙渊剑认主」），C 的 summary 不提该短语；后埋设伏笔 F（closureConditions 含「龙渊剑认主」），`detectedAt = T0`；随后对 C 做无关润色 refine 使 `updatedAt = T1 > T0`；触发 detect，确认 F 被标 fulfilled，尽管 C 在 F 埋设前已存在且并非为回收 F 而写。
- 修复建议：`updatedAt` 过滤应配合「内容相对埋设点确有新增」的弱信号（如对比节点摘要变更、或仅当节点 `createdAt > anchor`【新章节】或 refine 确实改动了与伏笔相关片段时纳入），避免把「旧章节被触碰」等同于「晚于伏笔」。至少应在文档/测试里显式标注此边界。

### R4-NEW-4（P2，Round-3 新坑5 的延续 + 放大）：detect 检索域从「摘要」扩到「全文」，复杂度由 O(C×S) 升级为 O(C×S + Σcontent 长度)，大项目每次 confirm 都全量载入所有章节全文进内存

- 位置：`src/core/foreshadowing.ts:195-206, 228-236`（`prisma.storyNode.findMany` 拉取所有 chapter/section/scene 的 `content` 拼接进 haystack）。
- 问题本质：Round-3 复检已指出 detect 是 O(C×S) 全量重算且 `nodeId` 死参数无法做增量（新坑5）。Round-4 修复 1 为看见 refine 正文，进一步把**全部章节/小节/场景的 `content` 全文**拉入内存并拼接成单一巨大 `haystack` 字符串。对百章长篇（尤其每章数千字、含大量 section/scene 的项目），每次 confirm 触发的 detect 都要 `findMany` 全部节点正文、拼接成可能数十 MB 的字符串，再对每条伏笔做 `haystack.includes(seed)`——内存与 CPU 峰值随项目规模线性膨胀。这把 Round-3 的「性能债」**放大**了（原来只摘要，现在摘要+全文），且与 R4-NEW-2 的超时/重试叠加，大项目 detect 极易触发 5s 超时 → 双倍重算 → 雪崩。属已知但被本轮加重的性能债。
- 复现思路：构造 100 章、每章 content 约 4000 字的项目；确认任意一章，在 dev server 用 `process.memoryUsage()` 观察 detect 路由 RSS 峰值，并计时 `detectPayoffs` 是否 >5s（触发 R4-NEW-2 的超时重试）。
- 修复建议：长期应支持 `nodeId` 作用域增量检测或「dirty 标记 + 低频聚合」；短期至少对 `content` 做分页/流式匹配，避免一次性拼接全量大字符串。

### R4-NEW-5（中，R4 未覆盖的 N7 残留）：DELETE 重挂仍选「第一条 active 兄弟主线」，未解决多独立主线间的跨剧情线误归属

- 位置：`src/app/api/storylines/[id]/route.ts:97`（`pickReassignMainId`）+ `src/core/pipeline/outline-context.ts:132-135`（`siblings.find(m => m.status === "active")?.id`）。
- 问题本质：Round-3 复检已记录 N7——删除主线 A 时，其支线被无条件重挂到另一条（活跃）主线 B，造成跨剧情线误归属（B 的聚合进度被 A 的支线污染、A 的支线被标「隶属主线 B」）。Round-4 只把重挂目标从「completed 兄弟」收窄到「active 兄弟」，但 `pickReassignMainId` 取 `find` 的**第一个** active 兄弟——当项目存在多条彼此独立的 active 主线 A、B 时，删 A 仍会把 A 的全部支线并入 B，N7 跨线误归属完全未解决。R4 的加固只堵了「completed 目标」这一种退化，没动「无关 active 目标」这一更根本的语义污染。
- 复现思路：构造 main A（active，2 条 side）+ main B（active，1 条 side）；`DELETE /api/storylines/<A.id>`；查库确认 A 的 2 条 side 的 `parentId` 变为 B.id；故事线面板确认 B 卡片下多出 2 条本属 A 的支线且「隶属主线：B」，综合进度被拉高。
- 修复建议：删除主线时应让用户显式选择接管主线，或默认置 `null` 由 `resolveParent` 回退（而非盲挂第一条 active 主线）；更稳妥是 schema 为 `parentId` 建自引用 `@relation(..., onDelete: SetNull)`。

### R4-NEW-6（低，N5 遗留仍在）：`loadOutlineData` 的 `status: { in: ["active","main"] }` 死字面量 `"main"` 仍未清理，与 `isRehangTargetActiveMain` 的语义边界不一致

- 位置：`src/core/pipeline/outline-context.ts:53`（`prisma.storyline.findMany({ where: { projectId, status: { in: ["active", "main"] } } })`）。
- 问题本质：Round-3 复检已确认 N5——`status` 合法取值只有 `active | completed | abandoned`，不存在值为 `"main"` 的 status，故该查询实际等价于 `status: "active"`，会把 `abandoned` 主线悄悄排除。Round-4 未触碰此处。它与 R4-NEW-1 形成呼应：N8 守卫现在需要精确区分 active/abandoned/completed，而注入集却用含无效枚举的模糊过滤，维护者极易误判「主线会被纳入」，且 abandoned 在主线和注入集两边口径都不干净。属一致性陷阱，当前不崩溃但易诱发后续回归。
- 复现思路：一条 `status:"abandoned"` 的 main 主线 + 其 side；调用章纲生成，确认该 abandoned 主线未出现在 `storylineContext`，且（结合 R4-NEW-1）一旦某路径把 side 挂到 abandoned 主线就会丢前缀。
- 修复建议：改为 `where: { OR: [{ type: "main" }, { status: "active" }] }`，与守卫的 `status === "active"` 口径对齐。

### R4-NEW-7（低，运行时兼容性）：`AbortSignal.timeout` 在个别旧 Node 运行时可能未定义，调用处同步抛错会被 catch 包成「每次必然失败 + 刷日志」

- 位置：`src/core/confirm-guard.ts:214`（`signal: AbortSignal.timeout(TIMEOUT_MS)`）。
- 问题本质：`AbortSignal.timeout` 在 Node 17.3+ 才稳定可用。在更旧运行时（或某些受限 serverless 运行时未实现）下，`AbortSignal.timeout` 为 `undefined`，第 214 行 `signal: AbortSignal.timeout(...)` 在 `fetch` 调用**之前**同步抛出 `TypeError`。该 throw 落在 `try`（第 209 行）内 → 被 `catch` 捕获 → `lastErr` 记录 → 第 225 行退避 → 第 2 次循环再次同步抛同样错误 → 最终 `console.error` 一次。结果：从 Round-3 的「无声失败/挂死」转为「每次 detect 自调用必然失败并刷一条 error 日志」，伏笔面板不刷新且日志噪声持续。无数据损坏，但功能彻底失效且日志被淹没，比「有声失败」更难排查（因为它伪装成真实网络错误）。属低概率但一旦发生即静默全失效的边角。
- 复现思路：在 `AbortSignal.timeout` 未定义的运行时（可临时 `vi.stubGlobal` 把 `AbortSignal.timeout` 置 undefined）调用 `triggerForeshadowDetect`，确认 fetch 一次都没真正发出（`toHaveBeenCalledTimes(0)`）却记录了 `console.error`。
- 修复建议：调用前做能力检测 `const ctrl = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(5000) : undefined;` 再传入 `signal`；或在 helper 顶部对该能力做一次性探测与降级。

---

## 三、复检员诚实声明（哪些真测了、哪些仅静态核对、哪些待验证）

### 3.1 真测（本地实跑，非仅看 diff）

- `SAFE_DELETE_DISABLE=1 npx vitest run src/core/confirm-guard.test.ts src/lib/storyline-progress.test.ts src/core/foreshadowing.test.ts` → **24 passed (24)，Exit 0**。其中：
  - `foreshadowing.test.ts` 4 个（含「detect 扫实时正文」核心修复断言、摘要路径不回归、pending 维持、updatedAt 过滤）；
  - `confirm-guard.test.ts` 11 个（含 POST/body 校验 `not.toHaveProperty('nodeId')`、网络失败重试+日志、非 2xx 重试+日志、超时重试+日志）；
  - `storyline-progress.test.ts` 9 个（N2 多主线遍历/回退/聚合）。
- 改动落地真实性：对修复 1 涉及的 `foreshadowing.ts`、`confirm-guard.ts`、`post-processor.ts`、`refine/route.ts`、`detect/route.ts`，与修复 2 涉及的 `outline-context.ts`、`generate/route.ts`、`[id]/route.ts` 做了逐行 Read + Grep，确认：detect 检索域扩展、超时/退避/死参数清理、N4 守卫、`pickReassignMainId`/`isRehangTargetActiveMain` 纯函数、DELETE 删除 `siblings[0]` 回退均真实存在，非仅存在于修复报告描述；三处 detect 调用点的 `nodeId` 已移除（其余 `nodeId` 引用均用于非 detect 逻辑）。

### 3.2 仅静态核对（Grep + Read，未经单测/集成实测）

- 修复 1 的「refine 改写真实章节 → 真实 detect 自调用 → 真实面板刷新」端到端链路：基于 `detectPayoffs` 检索域扩展 + `updatedAt>anchor` 过滤的代码路径推断，已用 mock 单测实证 closure 出现在 refine 后正文即可被命中；但未起 `next dev`、未连真实 Postgres、未跑真实 LLM 网关验证面板刷新。
- 修复 2 的「N4 newMain 端到端重挂」与「DELETE 级联重挂」真实 DB `updateMany` 行为：经纯函数单测 + 代码推演验证；无 dev server / 数据库 / 浏览器运行环境，真实多主线渲染、newMain 端到端重挂、删除主线 UI/DB 效果未经实测。
- 新坑 R4-NEW-1（abandoned 目标漏网）：通过比对 `isRehangTargetActiveMain`（仅排除 completed）与 schema 三态枚举 + `mainId` 解析（同样 `!== "completed`）静态确认；`pickReassignMainId` 用 `=== "active"` 与它口径不一致，构成本次加固的疏漏。
- 新坑 R4-NEW-2（abort 不取消服务端）：基于 `AbortSignal.timeout` 仅客户端中止、`fetch` 服务端独立执行的语义静态确认。
- 新坑 R4-NEW-3（时序倒挂假阳性）、R4-NEW-4（全文检索性能）、R4-NEW-5（N7 残留）、R4-NEW-6（N5 字面量）、R4-NEW-7（AbortSignal 兼容）均经静态代码推演确认。

### 3.3 未经实测、待验证的项（明确标注，绝不作伪）

- **未启动 dev server / 浏览器做端到端验证**：本环境仅 mock 层单测 + 静态核对，未起 `next dev`、未连真实 Postgres、未跑真实 LLM 网关。因此以下结论为代码路径推断，强烈建议主 Agent 在 dev server 上确认：
  1. refine 改写真实章节后，ForeshadowingPanel 收束率是否真随实时正文刷新（验证修复 1 的端到端生效）。
  2. 删除活跃主线（仅剩 completed 兄弟 / 仅剩 abandoned 兄弟 / 有独立 active 兄弟）三种场景下，子线 `parentId` 与写作 prompt 的「隶属主线」前缀表现（验证修复 2 端到端 + R4-NEW-1/R4-NEW-5 的真实存在）。
  3. 在 `APP_ORIGIN` 未设置、非 3001 端口部署下走主链路（write/continue 自动确认）确认 detect 自调用是否打到错误地址（Round-3 新坑3 关联残留，本轮未动）。
- **真实 LLM 网关 / DB 端到端效果**：标注「未经实测，待验证」。
- **detectPayoffs 语义命中质量与性能（R4-NEW-3/R4-NEW-4）**：新检索域（摘要+全文）在真实长篇语料下的误判幅度与内存/耗时，需拿真实 `pendingCommitment` + `storyNode` 数据跑一次确认。
- **R4-NEW-2 高频并发表现**：需压测批量确认下 detect 路由并发峰值，本复检未做。

### 3.4 复检结论总览

- 修复 1（伏笔 refine 陈旧摘要）：**生效**。detect 检索域已从「仅摘要」扩展为「摘要 + 实时正文」并带 `updatedAt>anchor` 过滤；超时 + 退避 + 死参数清理落地；foreshadowing.test.ts(4) + confirm-guard.test.ts(11) 全绿。残留：R4-NEW-3 时序倒挂假阳性、R4-NEW-4 全文检索性能放大、主链路 origin 耦合（Round-3 新坑3）未动、R4-NEW-7 AbortSignal 兼容边角。
- 修复 2（故事线 N8 回归）：**生效**。N4 守卫与 DELETE 级联均改走「仅活跃主线」纯函数，completed 目标彻底排除；24 用例全绿（含 8 个新增 N8 用例）。残留：R4-NEW-1 `abandoned` 目标漏网（同构复现 N8 前缀丢失）、R4-NEW-5 N7 跨线误归属未解决、R4-NEW-6 N5 字面量遗留。
- 新坑数量：7 条（P1×2：R4-NEW-1、R4-NEW-2；P2×3：R4-NEW-3、R4-NEW-4 部分、R4-NEW-4 性能；中×1：R4-NEW-5；低×2：R4-NEW-6、R4-NEW-7）。其中 R4-NEW-1 为本次加固自身引入的逻辑漏洞，优先级最高，建议下一轮优先收口。
