# Round-7 复检报告：伏笔检测「全漏斗闭环」子系统

- 复检对象：`novel-forge` v1.6.7（commit a68be8a）
- 复检范围：伏笔收束率检测（detect）的触发漏斗、降级路径、`detectPayoffs` 实时正文读取、面板更新链路
- 复检方法：通读焦点文件 + 全仓 Grep 触发点，逐条对照源码给出文件:行与证据，**未修改任何源码**

## 术语速记（第一次出现加白话）

- **伏笔收束率（payoff）**：作者埋下的"坑"（PendingCommitment）后来被正文"填上了"的比例。系统用确定性字符串命中回写每条伏笔的状态/兑现度。
- **detect 漏斗**：正文写完/确认/导出后，后端会 fire-and-forget 调用 `POST /api/foreshadowing/detect`，触发 `detectPayoffs` 全量重算收束率。所谓"全漏斗闭环"= 每个会写新正文的入口都要触发这次检测。
- **本地蒸馏（distillation）**：写章后的一段零 Token 规则，从新正文里抽"埋设/回收/深化"信号，直接建/改 PendingCommitment。
- **fire-and-forget**：触发方不等 detect 返回结果、不阻塞主流程（用 `void` 调用）。

## 摘要

挖到 **5 条**问题，分级分布：**P0 = 0，P1 = 2，P2 = 3**。
- 未发现崩溃级（P0）缺陷。
- 两条 P1 均为"功能退化/静默错数据"：①面板不会随后端 detect 自动刷新；②refine 改写会把"埋设章自己"重新扫进搜索域，导致已埋伏笔被误判回收（Round-4 引入的回归）。
- 三条 P2：auto-confirm 路由对 N 个节点各触发一次全量 detect（与 batch-confirm 的"只触发一次"原则相悖）；import 导入章节不触发 detect；detect 的 fetch 超时硬编码 5s 对大书偏紧。

> 诚实边界：AbortSignal 防护、batch-confirm 单次触发、空正文兜底、detect 路由整体容错——经逐行核对，确认无问题（见文末"已确认无问题"）。

---

## 坑位表

### F1 — 面板不随后端 detect 自动刷新（闭环在"展示"环节断开）
- **分级**：P1（功能退化：信号算了但前端看不到，必须手动点）
- **文件:行**：
  - `src/components/workspace/ForeshadowingPanel.tsx:93-113`（数据仅在 `useEffect([projectId])` 挂载时拉一次 `/api/foreshadowing/list`）
  - `src/components/workspace/ForeshadowingPanel.tsx:192-217`（`runDetect` 仅由"重新检测"按钮调用，手动触发才刷新）
  - `src/components/workspace/RightPanel.tsx:175`（`<ForeshadowingPanel projectId={project.id} />`，无 key、无刷新 prop，常驻不重挂）
  - `src/app/workspace/[projectId]/page.tsx:613-615`（SSE `foreshadow_update` 只更新本地 `distillAccum` 计数，不重新拉 `/api/foreshadowing/list`）
- **现象**：write / refine / confirm / batch-confirm 触发的 `detectPayoffs` 确实回写了 DB（伏笔 status、fulfillmentRatio、payoffRate），但右侧伏笔面板的 `data` 仍是挂载时的旧快照——收束率进度条、各伏笔状态都**不会变**，除非用户手动点「重新检测」或切走再回项目。
- **证据**：`ForeshadowingPanel` 的全部数据来源只有 `useEffect` 的初次 `fetch` 和 `runDetect` 里的 `fetch`；没有任何 `useQuery`/事件总线/随 SSE 重拉逻辑。后端 detect 与前端刷新之间**没有任何连线**。
- **复现路径**：打开项目 → 写/确认一章（背后触发 detect，DB 中某伏笔被标 fulfilled）→ 观察右侧面板，收束率与状态**无变化** → 点「重新检测」→ 才更新。
- **建议修复**：在 workspace 的 SSE `done`/confirm 完成后，向 `ForeshadowingPanel` 推一个 refresh 信号（如 Context 计数 +1、或 `queryClient.invalidate`），或让面板订阅 detect 完成事件后自动 `runDetect`。

### F2 — refine 改写导致已埋伏笔被"自己回收"误判（Round-4 回归）
- **分级**：P1（静默错数据：收束率虚假偏高）
- **文件:行**：
  - `src/core/foreshadowing.ts:222`（锚点 `const anchor = c.detectedAt || c.createdAt;`）
  - `src/core/foreshadowing.ts:227`（`const laterNodes = nodes.filter((n) => (n.updatedAt ?? n.createdAt) > anchor);`）
  - `src/core/foreshadowing.ts:250-259`（命中 ≥2 短语→fulfilled / =1 且 pending/detected→partially_fulfilled）
- **现象**：某章首次写完时埋下伏笔 F（detectedAt≈T2），当时该章节点 `updatedAt`（T0/T1）早于 T2，故"埋设章自身"被正确排除在 F 的搜索域外，F 保持 detected。此后用户对该章做 **refine（改写）**：refine 会 `prisma.storyNode.update` 重写正文，把该章 `updatedAt` 推到 T_refine ≫ T2。于是 `laterNodes` 把"埋设章自身"重新纳入 F 的 haystack；而 F 的 `description` 本就由该章正文提炼而来，`extractSeeds` 抽出的 3+ 字中文短语几乎必然原样出现在该章正文中 → **≥2 命中即误标 fulfilled（或 1 命中误标 partially_fulfilled）**。埋设章被自己的旧内容"回收"了。
- **证据**：锚点用 `detectedAt`，而节点选择用 `updatedAt`，两套时钟。Round-4（`src/lib/changelog-data.ts:83`、`foreshadowing.ts:191-227` 注释）为修"refine 只看陈旧摘要"而把实时正文纳入 haystack，但正文路径用 `updatedAt` 比较，refine 会把埋设章的 `updatedAt` 推过 `detectedAt`，从而把埋设章自身重新扫入——这是该修复引入的新盲点。摘要路径（`createdAt > anchor`）因 refine 不刷新摘要而天然安全，问题只出在"实时正文"路径。
- **复现路径**：
  1. 写第 3 章，正文埋下伏笔 F（本地蒸馏创建 PendingCommitment，status=detected，detectedAt=T2）。
  2. 等 detect 跑完（初次：第 3 章 `updatedAt`<T2，被排除，F 仍为 detected，正确）。
  3. 对第 3 章执行 refine 改写 → 节点 `updatedAt` 更新为 T_refine。
  4. refine 触发 detect（`refine/route.ts:200`）。`detectPayoffs` 中 F 的 `laterNodes` 现含第 3 章 → haystack 含其正文 → ≥2 短语命中 → F 被误标 **fulfilled**，收束率假性上升。
- **建议修复**：节点选择应统一用"埋设之后的章节"语义，而不是 `updatedAt` 单时钟。可改为"节点 createdAt/order 严格晚于伏笔所在章"，或对"埋设章自身"在 `haystack` 中排除（即跳过 `sourceNodeId === 当前章` 的节点内容），避免用 updatedAt 把埋设章重新捞回。

### F3 — auto-confirm 路由对 N 个节点各触发一次全量 detect
- **分级**：P2（性能/冗余：与 batch-confirm 原则相悖的 N 次全扫）
- **文件:行**：
  - `src/app/api/story/nodes/auto-confirm/route.ts:93-98`（`applyConfirm({...})` 在循环内调用，**未传 `skipDetect`**）
  - `src/core/confirm-guard.ts:180-181`（`applyConfirm` 内 `if (!node.skipDetect) void triggerForeshadowDetect(...)`）
  - 对照：`src/app/api/story/nodes/batch-confirm/route.ts:119-120`（循环外仅触发一次）
- **现象**：`/api/story/nodes/auto-confirm` 一次处理 N 个节点，每个 `applyConfirm` 默认就会 fire-and-forget 一次 `detectPayoffs`（整本 O(章数×伏笔数) 全量重算）。于是 N 章 = N 次全扫，且几乎同时并发，既浪费又在 detect 本就偏慢时相互加剧超时（见 F5）。batch-confirm 已专门优化成"只触发一次"，auto-confirm 却漏了同样的收口。
- **证据**：`applyConfirm` 的 detect 触发由 `skipDetect` 控制，默认触发；auto-confirm 路由循环内未设 `skipDetect:true`，且循环结束处也没有像 batch-confirm 那样统一补一次。
- **复现路径**：调用 `POST /api/story/nodes/auto-confirm` 带 20 个 nodeIds → 后端同时发起 20 次 `/api/foreshadowing/detect` 全量重算。
- **建议修复**：auto-confirm 路由循环内传 `skipDetect:true`，循环结束后像 batch-confirm 那样 `if (confirmed.length>0) void triggerForeshadowDetect({ projectId, origin })` 只触发一次。

### F4 — import 导入章节不触发 detect（漏斗之外的漏触发路径）
- **分级**：P2（功能缺口：导入章对已有伏笔的回收信号不被扫描）
- **文件:行**：
  - `src/app/api/import/commit/route.ts:571-600`（章节 `tx.storyNode.create` 直接 `status:"completed"` 写全文，**不跑** `runPostGenerationPipeline`、不蒸馏、不调 detect）
  - 全仓 Grep：import/commit 无任何 `triggerForeshadowDetect` / `detectPayoffs` / `runPostGenerationPipeline` 调用
- **现象**：用户从外部文本批量导入章节时，节点直接以 `completed` 落库并带全文，但既不会为新正文创建/更新 PendingCommitment（无蒸馏），也不会触发 detect。结果：①已有伏笔若被导入章节"填上"，收束率不会更新；②导入章节本身不产出新伏笔。只有用户事后手动点「重新检测」才能补齐——这属于任务清单明确要查的"auto-confirm / 手动确认 / 游戏导出 / refine / batch 之外"的漏触发路径。
- **证据**：import/commit 的整段事务（`route.ts:571-690`）只写 storyNode/characterCard/lorebookEntry/styleCard，无 detect 调用；且导入章节 `status:"completed"` 绕过 confirm 漏斗，后续也没有任何确认动作去补触发。detect 路由本身其实**能**扫到导入章（它读 `storyNode.content`，不依赖摘要），缺的只是"触发"。
- **复现路径**：导入一本含多章的小说 → 其中某章正文命中了早前大纲埋下的伏笔 → 收束率面板不更新 → 必须手动点「重新检测」。
- **建议修复**：import/commit 事务完成后，若创建了章节节点，fire-and-forget 调一次 `triggerForeshadowDetect`（并视需要补跑蒸馏以从导入正文抽新伏笔；至少先保证已有伏笔的回收能被扫到）。

### F5 — detect 的 fetch 超时硬编码 5s，对大书偏紧
- **分级**：P2（潜在静默失败：大书收束率可能永远不更新）
- **文件:行**：
  - `src/core/confirm-guard.ts:206`（`const TIMEOUT_MS = 5000;`）
  - `src/core/confirm-guard.ts:214`（`signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(TIMEOUT_MS) : undefined`）
  - `src/core/foreshadowing.ts:195-284`（`detectPayoffs` 同步读全部章节摘要+正文并做 `haystack.includes(seed)` 扫描，复杂度 O(章数×伏笔种子数×正文量)）
- **现象**：`triggerForeshadowDetect` 给 detect 请求套了 5s 超时，且对项目规模无感知。`detectPayoffs` 对全书所有章节正文做字符串 `.includes` 命中，章数多/正文长时单次可能 >5s。超时后 abort→重试一次→再超时→`console.error` 放弃。对大书，detect 可能**总是跑不完**，收束率于是静默地永远停在旧值（fire-and-forget，前端也无提示）。
- **证据**：超时常量写死 5000，无按章节数/伏笔数缩放；`detectPayoffs` 的 haystack 在 `foreshadowing.ts:228-236` 拼接全部节点 content 且无任何长度上限（见下条），大书扫描成本高。重试仍用同一 5s 窗口。
- **复现路径**：项目积累到几十上百章、每章数千字且伏笔众多 → 多次确认触发 detect → 服务端 detect 偶发 >5s → 连接被 abort → 重试仍超时 → 收束率不再刷新（仅后台 error 日志）。
- **建议修复**：超时按规模放宽（如 `min(5000, 基数 + 章数×系数)`），或把 detect 改为不依赖客户端超时的后台任务；并在前端 detect 失败时给出可见提示（目前 F1 已说明前端也不刷新）。

### （附）detect 实时正文读取无大小上限
- 与 F5 同源：`detectPayoffs`（`foreshadowing.ts:228-236`）把所有 `chapter/section/scene` 节点的 `content` 直接 `.join("\n")` 拼成大字符串做命中，没有针对超长正文/超大书的截断或分片。属性能边界，单列提示，归 P2。空 content 已用 `(n.content || "")` 兜底（`foreshadowing.ts:235`），不会崩。

---

## 已确认无问题（诚实边界）

1. **AbortSignal.timeout 防护不抛同步错误**：`confirm-guard.ts:214` 用 `typeof AbortSignal?.timeout === "function"` 判存在——若 `AbortSignal` 整个未定义，可选链返回 `undefined`，`typeof undefined` 为 `"undefined"` 不进入函数分支，降级为 `undefined` signal，`fetch` 仍正常发出。无同步抛错路径（与 `confirm-guard.test.ts:105` 的 `resolves.not.toThrow()` 印证）。✅

2. **batch-confirm 只触发一次全量 detect、无 N 次重扫**：`batch-confirm/route.ts:119-120` 在循环外用 `if (confirmed.length > 0) void triggerForeshadowDetect(...)`，且 batch 路径内联确认逻辑、根本不调 `applyConfirm`，故无重复触发。✅

3. **其他触发点均存在且正确**：
   - 手动确认 `nodes/[id]` PATCH confirm → `route.ts:217` 直接触发一次（`triggerForeshadowDetect`，带真实 origin）。✅
   - refine：因 `skipSummarize:true` 跳过 4.5，已在 `refine/route.ts:200` 显式兜底触发一次。✅
   - write / continue：`runPostGenerationPipeline` 未设 `skipSummarize`，步骤 4.5（`post-processor.ts:701`）触发。✅
   - 游戏导出：`game-engine.ts:666` 走 `applyConfirm`（未 skipDetect，会触发 detect），且仅在 `autoConfirmOn && eligible` 时；非自动确认章留 drafting 由后续手动确认覆盖（与正常章流程一致，不单列 bug）。✅

4. **空正文/异常不崩**：`detectPayoffs` 对 `content` 用 `|| ""` 兜底（`foreshadowing.ts:235`）；整段 `try/catch` 任何异常返回零值统计（`foreshadowing.ts:297-307`），`detect` 路由也同样容错返回 `ok:false` 不抛 500（`route.ts:27-32`）。✅

5. **无"半截正文"竞态**：detect 用 `Promise.all` 一次性快照读取 `summaries` 与 `nodes`；节点 `content` 由单行 `update` 原子写入，不会被读到半截；真正的"埋设章被重扫"问题已在 F2 单列（属逻辑语义，非并发损坏）。✅

---

## 结论

v1.6.7 的伏笔 detect 漏斗在**触发点覆盖**与**后端降级/容错**上已经相当稳（AbortSignal 防护、batch 单次触发、路由容错均无问题）。真正剩下的退化集中在两端：
- **前端展示闭环断开（F1）**：后端算了、DB 写了，但面板不自动刷新，用户看不到。
- **refine 语义回归（F2）**：Round-4 为修"refine 只看陈旧摘要"而纳入实时正文，却用 `updatedAt` 比较把"埋设章自己"重新捞回搜索域，导致已埋伏笔被误判回收。

这两条 P1 建议优先于三条 P2（auto-confirm 重复全扫 F3、import 漏触发 F4、大书 5s 超时 F5）处理。
