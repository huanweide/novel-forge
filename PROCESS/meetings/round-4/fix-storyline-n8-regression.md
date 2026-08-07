# 故事线 N8 回归修复报告（Round-4）

- 修复 Agent：魔王系统 Round-4 代码修复 Agent（独立修复、自验、落盘，未向主 Agent 追问）
- 项目根：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- 复检依据：`PROCESS/meetings/round-3/recheck-1/lens-storyline.md`（N8 细节）、`PROCESS/meetings/round-3/fix-storyline-n1-n4.md`（N4 实现）
- 本轮范围：N8 回归（重挂/重指派绝不指向 completed 主线，保住 R2-006 隶属前缀）

---

## 一、N8 问题定位（与复检文档的对应）

复检文档 `lens-storyline.md` 第二节「N8」把回归定位在 `src/app/api/storylines/[id]/route.ts:93-94`（删除主线级联重挂）：删除活跃主线 A、仅剩 completed 兄弟主线 B 时，`reassignId = siblings[0]` 取到 completed B，把 A 的子线重挂到 B；而 `loadOutlineData`（`outline-context.ts:53`）按 `status: { in: ["active","main"] }` 加载、仅含活跃线，`formatStorylines`（`:99-110`）构建的 `mainTitleById` 不含 B，导致这些子线在写作 prompt 中静默丢失「（隶属主线 …）」前缀——即 R2-006 成果回归。

用户修复计划聚焦「N4 newMain 重挂」。经核对：`generate/route.ts` 中 N4 的 `mainId` 由 `existingStorylines.find(s => s.type==="main" && s.status !== "completed")` 或本轮新建主线（schema:328 默认 `status:"active"`）决定，**当前实现 mainId 恒为 active，本身不会重挂到 completed 主线**。但为彻底消除「重挂到 completed 主线」这一类风险（含未来/边界场景），并修复复检文档真实记录的 N8 位置，本修复在两处同时加固：

1. **N4 newMain 重挂**（`generate/route.ts`）：增加「目标主线必须为 active」守卫（防御性，不回退 N4 新建行为）。
2. **DELETE 删除级联重挂**（`[id]/route.ts`）：真正的 N8 位置，收紧重挂目标为「仅活跃兄弟主线」。

两处均**不回退 N3 级联**：删除/重挂前仍对子线执行 `updateMany` 处理 `parentId`；只是重挂目标绝不再指向 completed 主线（剩余场景置 `null`，由 N2 `resolveParent` 回退到活跃主线）。

---

## 二、改动文件 / 行

### 1. `src/core/pipeline/outline-context.ts`（新增两个可测纯函数）

- 在 `getCompletedMainIds`（:88-94）之后新增 `isRehangTargetActiveMain(mainId, existingStorylines)` 与 `pickReassignMainId(siblings)`。
- `isRehangTargetActiveMain`：
  - `mainId` 为 null → false；
  - `mainId` 不在 `existingStorylines` 快照中（即本轮新建主线，默认 active）→ true（不回退 N4 新建行为）；
  - `mainId` 命中已有主线 → 仅当 `type==="main" && status !== "completed"` 才 true，否则 false。
- `pickReassignMainId`：仅返回 `status==="active"` 的兄弟主线 id；无活跃兄弟（只剩 completed/abandoned）则返回 `null`。

### 2. `src/app/api/storylines/generate/route.ts`（N4 重挂守卫）

- :15 import 增加 `isRehangTargetActiveMain`。
- :162-169 N4 重挂条件由 `if (mainId && oldCompletedMainIds.length > 0)` 收紧为：
  ```ts
  if (mainId && oldCompletedMainIds.length > 0 && isRehangTargetActiveMain(mainId, existingStorylines)) {
    await prisma.storyline.updateMany({
      where: { projectId, type: "side", parentId: { in: oldCompletedMainIds } },
      data: { parentId: mainId },
    });
  }
  ```
  mainId 为新建活跃主线时守卫放行，旧支线正常重挂新主线；若 mainId 指向 completed 主线则跳过重挂（避免 N8 前缀丢失）。

### 3. `src/app/api/storylines/[id]/route.ts`（DELETE 级联重挂，真实 N8 位置）

- :9 import 增加 `pickReassignMainId`。
- :93-98 重挂目标由 `siblings.find(m => m.status === "active")?.id ?? siblings[0]?.id ?? null` 改为：
  ```ts
  const reassignId = pickReassignMainId(siblings);
  await prisma.storyline.updateMany({
    where: { projectId: target.projectId, parentId: id },
    data: { parentId: reassignId },
  });
  ```
  删除活跃主线 A：若存在活跃兄弟 B，子线重挂 B（保留隶属 + R2-006 前缀）；若只剩 completed 兄弟，则 `reassignId = null`，子线置空、由 N2 `resolveParent` 后续回退到活跃主线，不再制造指向 completed 主线的虚假隶属（N8 根因消除）。

---

## 三、重挂修正逻辑小结

- 重挂/重指派的唯一合法目标是 **active 主线**；completed 主线永远不作为重挂目标。
- 当无可用的 active 目标时，子线 `parentId` 置 `null`（而非挂到 completed 主线）；`null` 由 N2 `resolveParent` 回退到活跃主线，比「挂到 completed 主线却不在 prompt 注入集」更诚实，且不触发 N8 前缀丢失。
- `formatStorylines` 的 `mainTitleById` 仍只收录本批注入的 active 主线（未改动），重挂后旧支线 `parentId` 指向 active 主线即可正确注入「（隶属主线 …）」前缀，R2-006 不回归。

---

## 四、测试补充

在 `src/core/pipeline/outline-context.test.ts` 新增两组共 8 用例（文件由 7 升至 15 用例）：

- `N8 isRehangTargetActiveMain`：已存在活跃主线→允许；已存在 completed 主线→拒绝；新建主线（不在快照）→允许（不回退 N4）；null→拒绝；异常/空输入→放行。
- `N8 pickReassignMainId`：存在活跃兄弟→返回其 id；只剩 completed/abandoned 兄弟→返回 null；无兄弟→null。

既有用例（`filterActiveStorylines` / `getCompletedMainIds` / `formatStorylines` 隶属前缀 / R2-006 重挂恢复）全部保留并仍通过。

---

## 五、验证结果

- `cd 项目根 && SAFE_DELETE_DISABLE=1 npx tsc --noEmit`：**零错误（EXIT 0）**。
- `npx vitest run src/lib/storyline-progress.test.ts src/core/pipeline/outline-context.test.ts`：**2 文件 / 24 用例全绿（EXIT 0）**（storyline-progress 9 例 + outline-context 15 例，较上一轮 16 例新增 8 例 N8 相关）。
- grep 复核：
  - `generate/route.ts` N4 重挂已加 `isRehangTargetActiveMain` 守卫；
  - `[id]/route.ts` 删除重挂已改用 `pickReassignMainId`（不再使用 `siblings[0]` 取 completed 主线）。

---

## 六、诚实声明（边界）

- **已实测**：`tsc --noEmit` 零错误；vitest 24 用例全绿，覆盖 N8 两守卫纯函数、N4 新建主线放行、DELETE 仅选活跃兄弟、R2-006 隶属前缀恢复、N1/N2/N4 既有逻辑无回归。
- **未经实测、标注待验证**：
  - N4 newMain 端到端重挂与 DELETE 级联重挂的真实 DB `updateMany` 行为仅经纯函数单测 + 代码推演验证，本环境无 dev server / 数据库 / 浏览器，**真实多主线渲染、newMain 端到端重挂、删除主线的 UI/DB 效果未经实测**，标注待验证。
  - 「重挂后 AI 写作 prompt 是否确实验证可见『隶属主线』前缀」属端到端集成表现，建议后续以集成测试或手动 E2E 最终确认。
- **范围**：N1~N4 其他已生效逻辑（死过滤清除、多主线遍历、删除级联）均保留，未回退。本次未处理 recheck 文档中的 N7/N9/N10/N11/N12 及 N5/N6（非本轮范围，建议后续轮次跟进）。
- 注：用户任务将 N8 归因为「N4 newMain 重挂」，而复检文档实际将 N8 定位在 DELETE 路由。本修复按复检文档真实位置（DELETE）与用户修复意图（N4 守卫）两处一并加固，确保「重挂/重指派绝不指向 completed 主线」这一类回归被彻底消除。
