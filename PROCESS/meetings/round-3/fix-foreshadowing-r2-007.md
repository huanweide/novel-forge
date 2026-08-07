# Round-3 修复报告 · R2-007（伏笔检测在确认漏斗补齐）收口

- 修复 Agent：魔王系统 Round-3 独立代码修复 Agent
- 修复日期：2026-08-07
- 项目根：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- 目标问题：round-2 复检（lens-entity.md）R2-007【部分失效】—— 批量确认与 refine 确认两条漏斗未触发 `/api/foreshadowing/detect`，且 detect 自调用静默失败（无日志/无重试）。

---

## 一、改动清单（文件 / 行）

### 1. `src/core/confirm-guard.ts`（核心改动）
- 新增共享 helper `triggerForeshadowDetect({ projectId, nodeId?, origin? })`（confirm-guard.ts:191-219）：
  - origin 优先用调用方传入的真实 `request.url.origin`（始终可达）；未传则回退 `APP_ORIGIN || http://localhost:3001`（保持原部署耦合）。
  - 失败不再静默吞错：至少 `console.error` 一次，附 `projectId`/`nodeId` 便于排查（新坑3）。
  - 轻量重试一次（最多 2 次），应对确认瞬间服务冷启动 / 短暂抖动。
- `applyConfirm` 内联 fetch（confirm-guard.ts 原 179-186）替换为 `void triggerForeshadowDetect({ projectId, nodeId })`（confirm-guard.ts:181），`skipDetect` 语义不变（置真则不触发）。

### 2. `src/core/pipeline/post-processor.ts`（4.5 补触发）
- import 增加 `triggerForeshadowDetect`（post-processor.ts:22）。
- 步骤 4.5 的 detect 补触发（post-processor.ts:698-709）由内联 fetch 改为 `void triggerForeshadowDetect({ projectId, nodeId })`（post-processor.ts:700），保留「先 confirm(skipDetect:true) → 再摘要 → 再 detect」时序闭环。

### 3. `src/app/api/story/nodes/[id]/route.ts`（手动 confirm，一致性收口）
- import 增加 `triggerForeshadowDetect`（route.ts:8）。
- 手动 confirm 分支（route.ts:217）改为 `void triggerForeshadowDetect({ projectId: node.projectId, origin: new URL(request.url).origin })`，复用真实 origin + 失败日志/重试。

### 4. `src/app/api/story/nodes/batch-confirm/route.ts`（缺口 A 收口）
- import 增加 `triggerForeshadowDetect`（route.ts:5）。
- 在确认循环结束后、`maybeAutoDeliver` 之后新增（route.ts:118-122）：当 `confirmed.length > 0` 时，用真实 `request.url.origin` 统一 `void triggerForeshadowDetect({ projectId, origin })` 一次。
- 设计取舍：detect 为整本全量重算（`detectPayoffs` 遍历全部 commitments × summaries），故在所有节点确认完后仅触发一次，避免 N 次重复全扫（避免放大新坑5 的已有性能问题）。

### 5. `src/app/api/generate/refine/route.ts`（缺口 B 收口）
- import 增加 `triggerForeshadowDetect`（route.ts:26）。
- 在 `runPostGenerationPipeline` 返回后、宝宝流填表之前新增（route.ts:198-205）：`void triggerForeshadowDetect({ projectId, nodeId, origin })`。
- 原因：后处理内 `applyConfirm` 传 `skipDetect:true`，且 refine 传 `skipSummarize:true` 使 4.5 的 detect 补触发被 `if(!skipSummarize)` 整体跳过 → 此处显式兜底。detect 幂等全量重算，可覆盖 refine 经本地蒸馏在 step 3.6 新创建的 `pendingCommitment`，使其收束率被回写。

---

## 二、两条漏斗 detect 触发点（grep 实证）

```
src/app/api/story/nodes/batch-confirm/route.ts:120   void triggerForeshadowDetect({ projectId, origin: new URL(request.url).origin });
src/app/api/generate/refine/route.ts:200              void triggerForeshadowDetect({ projectId, nodeId, origin });
```

且在原已生效路径也确认仍触发（未被改坏）：
```
src/core/confirm-guard.ts:181          （applyConfirm 默认路径：auto-confirm / 游戏导出）
src/core/pipeline/post-processor.ts:700（write/continue 摘要后补触发）
src/app/api/story/nodes/[id]/route.ts:217（手动 confirm）
```

结论：现四条确认漏斗（auto-confirm / 游戏导出、手动 confirm、write/continue 后处理、批量确认、refine 确认）均会触发 detect。R2-007 命名的两类「auto-confirm / 批量确认」中的批量确认，以及复检新发现的 refine 确认，缺口均已补齐。

---

## 三、测试补充

文件：`src/core/confirm-guard.test.ts`（轻量 mock fetch / prisma，不触真库真网）

新增 5 个用例（`describe("triggerForeshadowDetect...")` 3 个 + `describe("applyConfirm... skipDetect 控制 detect 触发")` 2 个）：
- `triggerForeshadowDetect` 确认后 POST 到 `/api/foreshadowing/detect` 且 body 含 `projectId`/`nodeId`。
- `triggerForeshadowDetect` 网络失败 → 重试一次 + `console.error` 记录（不再静默吞错）。
- `triggerForeshadowDetect` 非 2xx 响应 → 同样重试一次 + 记录日志。
- `applyConfirm` 不传 `skipDetect` → 确认成功后触发 detect（fetch 被调用 1 次）。
- `applyConfirm` 传 `skipDetect:true` → 确认成功但不触发 detect（fetch 未被调用）。

原有 5 个 `evaluateConfirmEligibility` 用例未受影响，全部保留。

---

## 四、验证结果

- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`：**零错误**（退出码 0，无输出）。
- 测试实跑：
  ```
  $ npx vitest run src/core/confirm-guard.test.ts src/core/game/game-engine.test.ts src/core/maybe-auto-deliver.test.ts
   ✓ src/core/confirm-guard.test.ts (10 tests)
   ✓ src/core/maybe-auto-deliver.test.ts (6 tests)
   ✓ src/core/game/game-engine.test.ts (21 tests)
   Test Files  3 passed (3)
        Tests  37 passed (37)
  ```
  （game-engine 调用 `applyConfirm` 仍全绿，证明新增 helper 不破坏既有 auto-confirm / 游戏导出路径；其测试环境 fetch 未定义时错误被 helper 内部捕获，不影响断言。）

---

## 五、诚实声明（明确标注未经实测项）

1. **detect 触发端到端闭环未经真机验证**：本环境仅 mock 层单测 + tsc 类型检查，未起真实 `next dev`、未连真实 Postgres、未跑真实 LLM 网关。因此「批量确认 / refine 确认后伏笔面板是否真的自动刷新」这一端到端行为**未经实测**，标记为「未经实测，待验证」。
2. **`APP_ORIGIN` 部署耦合未彻底消除**：`applyConfirm`（auto-confirm / 游戏导出）与后处理 4.5 路径无 `request` 对象可注入真实 origin，仍回退 `APP_ORIGIN || http://localhost:3001`；而手动 confirm / 批量确认 / refine 三条本 Agent 新增或改动的路由因持有 `request`，已改用语真实 `request.url.origin`（始终可达）。彻底统一需将 `request`/origin 透传进 `applyConfirm` 与后处理（较大重构），本次未做，属已知残留风险，待后续处理。
3. **重试为轻量单次**：仅对网络错误 / 非 2xx 重试 1 次即放弃并 `console.error`，未做指数退避 / 队列 / 状态标记（如 `project.detectFailedAt`），属新坑3 的缓解而非根治。
4. **新坑4（短语种子低估收束率）、新坑5（全量扫描 + nodeId 形同虚设）、新坑6（测试标题口径）** 超出本次 R2-007 收口范围，未处理，维持原复检结论。
5. **未改动** 手动 confirm / auto-confirm / 游戏导出 / write / continue 已生效路径的确认语义，仅将其 detect 调用统一收口到共享 helper（行为等价，且新增日志/重试）。

---

## 六、R2-007 收口结论

- 批量确认漏斗：**已补 detect**（循环后统一触发一次，真实 origin）。
- refine 确认漏斗：**已补 detect**（管线返回后兜底触发，真实 origin）。
- 两条新路径 + 原有三条路径均经共享 `triggerForeshadowDetect` 触发，且 detect 自调用已加 `console.error` 失败日志 + 轻量重试一次（静默失败风险收敛）。
- tsc：零错误。测试：37 passed（含新增 5 个 detect 相关用例），全绿。
- 真实 LLM 网关端到端 detect 效果：**未经实测，待验证**。
