# Round-4 修复报告 · 伏笔 refine 陈旧摘要（新坑1 收口）

- 修复 Agent：魔王系统 Round-4 独立代码修复 Agent
- 修复日期：2026-08-07
- 项目根：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- 目标问题：Round-3 复检（lens-worldcard-entity.md）新坑1【半截生效】—— refine 确认虽触发了 `/api/foreshadowing/detect`，但 detect 只读**陈旧摘要**，refine 改写后的正文回收信号不可见，伏笔「收束率」实际不更新；附带处理新坑4（重试无超时/退避）与新坑5（nodeId 死参数）。

---

## 一、根因（来自复检静态核对）

- `src/core/foreshadowing.ts` 的 `detectPayoffs` 把命中 haystack 完全由 `chapterSummary.summary + keyEvents` 拼接而成，**不读 `storyNode.content`**（foreshadowing.ts:190-219 原实现）。
- refine 路径 `src/app/api/generate/refine/route.ts:187` 传 `skipSummarize: true`，使后处理逻辑的整体摘要生成步骤被跳过，**refine 不会为改写后的章节刷新 chapterSummary**。
- 后果：refine 触发 detect 时，detect 重算的仍是**改写前**的陈旧摘要，refine 真正回收/新埋的伏笔信号永远进不了 detect 检索域 → 伏笔面板看着没变。这正是 Round-2 复检新坑2 的根因残留，Round-3 只补了「触发 detect」这一步（解决「漏触发」），未解决「detect 看不见 refine 内容」（陈旧摘要）。

---

## 二、改动清单（文件 / 行）

### 1. `src/core/foreshadowing.ts`（核心修复：detect 扫实时摘要 → 改扫实时正文）
- 将 `detectPayoffs` 的单次 `chapterSummary.findMany` 改为并行读取 `chapterSummary` 与 `storyNode`（foreshadowing.ts:190-219 区域）：
  ```ts
  const [summaries, nodes] = await Promise.all([
    prisma.chapterSummary.findMany({ where:{projectId}, ..., select:{createdAt,summary,keyEvents} }),
    prisma.storyNode.findMany({
      where:{ projectId, type:{ in:["chapter","section","scene"] } },
      ..., select:{ createdAt, updatedAt, content },
    }),
  ]);
  ```
- haystack 构造改为**摘要 + 实时正文并集**：
  - 摘要：保留原语义，按 `createdAt > anchor`（伏笔埋设点）过滤。
  - 实时正文：按 `(updatedAt ?? createdAt) > anchor` 过滤——key 修复点。refine 改写后 `storyNode.updatedAt` 被刷新，但其 chapterSummary 因 `skipSummarize` 而陈旧，故必须将正文纳入 haystack 才能看见 refine 的回收信号。
  - haystack = `[...摘要片段, ...(各节点 content)]` 拼接。
- 时序盲点语义不变：detect 仍只升不降级（`matchedClosure>0 || matchedPhrase>=2 → fulfilled`；`matchedPhrase===1 && pending/detected → partially_fulfilled`），引入正文只会更准确地命中，不会把已 fulfilled 降级。

### 2. `src/core/confirm-guard.ts`（新坑4 超时 + 新坑5 死参数清理）
- `triggerForeshadowDetect` 重构（confirm-guard.ts:195-235）：
  - 移除死参数 `nodeId`（detect 路由只按 `projectId` 全量重算，nodeId 从未被消费，原样传递只制造「节点级隔离」错觉）。签名与 POST body 均只剩 `{ projectId }`。
  - 新增超时保护：`fetch` 加 `signal: AbortSignal.timeout(5000)`，避免 detect 路由在 O(C×S) 全量重算时长时间不返回、令 fire-and-forget promise 挂死、占用连接/事件循环。
  - 重试间加轻退避：`if (attempt < 2) await sleep(200)`，避免对正在抖动的服务器雪上加霜（原实现立即二次重试会翻倍负载）。重试仍为最多 2 次，失败 `console.error` 一次（保留 Round-3 的「不再静默吞错」）。
- `applyConfirm` 内部调用同步改为 `void triggerForeshadowDetect({ projectId: node.projectId })`（confirm-guard.ts:181），移除 `nodeId`。

### 3. `src/core/pipeline/post-processor.ts:700`（清理死参数）
- `void triggerForeshadowDetect({ projectId, nodeId })` → `void triggerForeshadowDetect({ projectId })`。

### 4. `src/app/api/generate/refine/route.ts:200`（清理死参数）
- `void triggerForeshadowDetect({ projectId, nodeId, origin })` → `void triggerForeshadowDetect({ projectId, origin })`。refine 确认仍持有真实 `request.url.origin`（始终可达），兜底触发 detect 的路径与时序闭环保持不变。

### 5. 测试
- `src/core/confirm-guard.test.ts`：
  - 「确认后 POST 携带 projectId/nodeId」用例改为断言 body 恰为 `{ projectId }` 且 `not.toHaveProperty("nodeId")`（对应死参数移除）。
  - 新增用例「detect 路由超时（AbortSignal）触发重试并最终记录日志，不挂死」，覆盖新坑4 的超时保护不引发未捕获异常。
- 新增 `src/core/foreshadowing.test.ts`（4 个用例，mock prisma）：
  - closure 仅出现在 refine 后的实时正文、摘要陈旧为空 → 仍判定 `fulfilled`（**直接验证新坑1 修复**）。
  - 仅摘要含 closure、正文不含 → 仍命中（保证原摘要路径不回归）。
  - closure 摘要/正文均无 → 不误判，维持 pending。
  - 正文 `updatedAt` 早于 anchor（伏笔埋设前写成、未 refine）→ 不纳入，验证 `updatedAt>anchor` 过滤避免污染。

---

## 三、保留的成果（未被改坏）

- Round-3 已生效的「批量 + refine + auto + 手动 + 游戏导出」五条路径触发 detect 的成果完整保留；refine 路由仍用真实 `request.url.origin` 兜底触发，`skipDetect:true` 单一调用点（`post-processor.ts`）语义未变，五条漏斗时序闭环、无重复/漏触发。
- `detectPayoffs` 仍为幂等全量重算，兼容所有既有调用方；本次仅扩展其检索域，未改其回写/聚合语义。

---

## 四、验证结果

- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`：**零错误**（退出码 0，无输出）。
- `npx vitest run src/core/confirm-guard.test.ts src/core/foreshadowing.test.ts`：**15 passed (15)**。
  - `confirm-guard.test.ts` 11 个（evaluateConfirmEligibility 5 个 + triggerForeshadowDetect 4 个[含 POST/body 校验、网络失败重试+日志、非 2xx 重试+日志、超时重试+日志] + applyConfirm skipDetect 控制 2 个），其中覆盖 Round-3 的 5 个 detect 用例并新增 1 个超时用例，全绿。
  - `foreshadowing.test.ts` 4 个（含「detect 扫实时正文」核心修复断言），全绿。

---

## 五、诚实声明（明确标注未经实测 / 残留项）

1. **真实 LLM 网关下伏笔面板刷新端到端效果：未经实测，待验证。** 本环境仅 mock 层单测 + tsc 类型检查，未起 `next dev`、未连真实 Postgres、未跑真实 LLM 网关。修复将「detect 检索域」从摘要扩展为正文+摘要的代码路径已用 mock 单测实证（closure 出现在 refine 后正文即可被命中）；但「refine 改写真实章节 → 真实 detect 自调用 → 真实面板刷新」的端到端链路需在主 Agent 的 dev server 上确认。
2. **主链路 origin 耦合（新坑3）维持原状、未做大规模重构。** `applyConfirm`（auto-confirm / 游戏导出）与后处理 4.5 两处无 `request` 对象可注入真实 origin，仍回退 `APP_ORIGIN || http://localhost:3001`。在 `APP_ORIGIN` 未设置且服务非 3001 端口的部署上 detect 自调用仍会打错地址——但本轮已加超时 + 失败日志，从「无声失败」转为「有声失败 + 不挂死」，不再累积挂起 promise。彻底统一需将 origin 透传进 `applyConfirm` 与后处理（较大重构，Round-3 与本文均判定为非默认部署才触发的正确性无关残留），建议后续单独排期。
3. **nodeId 死参数已从 helper 与 body 清除**（新坑5 的「错觉」消除），但 detect 全量重算 O(C×S) 的性能债、`nodeId` 本可做的增量扫描能力缺失本身仍存在，属已知性能债，本轮仅移除误导性传参，未做增量化改造。
4. **重试退避为轻量单次**（200ms 间隔、最多 2 次），未做指数退避 / 队列 / `project.detectFailedAt` 状态标记，属新坑4 的缓解而非根治。
5. **detectPayoffs 语义命中质量未经真实语料验证**：正文比摘要更长，理论上提升命中召回，但极端情况下更长的正文可能引入更多噪声短语匹配（因种子为精确短语且需 ≥2 命中或 closure 命中，且有 `updatedAt>anchor` 范围限制，误判风险受限）；真实项目偏差幅度需拿真实 `pendingCommitment` + `storyNode` 数据跑一次确认。
