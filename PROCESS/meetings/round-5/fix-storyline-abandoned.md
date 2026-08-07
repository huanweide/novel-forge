# 故事线 abandoned 主线漏网修复报告（Round-5 收尾轮 · P1）

- 修复 Agent：魔王系统 Round-5 代码修复 Agent（独立修复、自验、落盘，未向主 Agent 追问）
- 项目根：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- 复检依据：`PROCESS/meetings/round-4/recheck-1/lens-foreshadowing-storyline.md`（R4-NEW-1）+ `PROCESS/meetings/round-4/fix-storyline-n8-regression.md`
- 本轮范围：收口 R4-NEW-1——重挂守卫只排除 `completed`，漏掉 `abandoned` 主线，同构复现 N8「隶属前缀丢失」。

---

## 一、问题定位

Round-4 的 N8 加固把重挂目标从「completed 主线」收窄，但 `isRehangTargetActiveMain` 与 `generate/route.ts` 的 `mainId` 解析都用 `status !== "completed"` 作为「活跃」判据。schema 的 storyline `status` 合法取值为 `active | completed | abandoned`（prisma/schema.prisma），因此：

- `abandoned` 主线满足 `status !== "completed"`，会被误判为「可重挂目标」放行；
- `generate/route.ts:126` 的 `mainId` 解析 `find(s => s.type==="main" && s.status !== "completed")` 在项目「无 active 主线、仅有一条 abandoned 主线」时会取这条 abandoned 主线；
- 随后 `isRehangTargetActiveMain` 返回 true（abandoned ≠ completed），N4 把旧 completed 主线的支线重挂到 abandoned 主线；
- `loadOutlineData`（outline-context.ts:53）仅加载活跃线，`formatStorylines` 的 `mainTitleById` 不含 abandoned 主线 → 这些支线在写作 prompt 中静默丢失「（隶属主线 …）」前缀，N8 以 abandoned 形态复现。

DELETE 侧的 `pickReassignMainId` 已用 `status === "active"` 正确排除 abandoned，两处守卫口径不一致，正是本次加固的疏漏。

---

## 二、改动文件 / 行

### 1. `src/core/pipeline/outline-context.ts:109-118`（`isRehangTargetActiveMain`）

- 判定由 `main.type === "main" && main.status !== "completed"` 收紧为 `main.type === "main" && main.status === "active"`。
- 同步更新函数头部注释：说明排除 completed 与 abandoned 等所有非 active 终态，与 DELETE 侧 `pickReassignMainId` 口径一致。
- 效果：`abandoned` / `completed` 主线均被拒绝作为重挂目标，仅 `active` 主线放行；新建主线（不在快照）仍默认 active 放行，N4 新建行为不回退。

### 2. `src/app/api/storylines/generate/route.ts:123-126`（`mainId` 解析）

- 由 `existingStorylines.find((s) => s.type === "main" && s.status !== "completed")?.id ?? null` 改为 `existingStorylines.find((s) => s.type === "main" && s.status === "active")?.id ?? null`。
- 同步更新上方注释（优先复用「活跃」主线，明确标注 R4-NEW-1 的 abandoned 误当目标风险）。
- 第 159-170 行 N4 重挂块注释同步更新：N8 加固改为「绝不把旧支线重挂到 completed 或 abandoned 等任何非 active 终态主线」，并指出该判定由 `isRehangTargetActiveMain` 的 `status==="active"` 一并覆盖。

### 3. `src/app/api/storylines/[id]/route.ts`（DELETE 级联）

- 重挂目标筛选 `pickReassignMainId(siblings)`（:97）本就用 `status === "active"`（见 :132-135），已正确排除 abandoned / completed，**本轮无需改动**，仅确认口径已与重挂守卫一致。
- N3 级联 `updateMany` 处理 `parentId` 逻辑保留，不回退。

### 重挂目标筛选扩展小结

| 位置 | 改动前 | 改动后 |
| --- | --- | --- |
| `isRehangTargetActiveMain` | 排除 `completed`（abandoned 漏网） | 仅 `status === "active"`（排除 completed + abandoned 等所有非 active 终态） |
| `generate/route.ts` mainId 解析 | `status !== "completed"`（abandoned 可被取为 mainId） | `status === "active"` |
| `pickReassignMainId`（DELETE） | `status === "active"`（已正确） | 不变，确认一致 |

---

## 三、R2-006 隶属前缀不回归确认

- `formatStorylines`（outline-context.ts:138-162）未改动，仍用本批注入的 active 主线构建 `mainTitleById`。
- 重挂守卫收紧后，旧支线只可能被重挂到 `active` 主线；该主线必在 `loadOutlineData` 注入集中，`mainTitleById` 能解析，重挂后 `formatStorylines` 仍注入「（隶属主线 …）」前缀，R2-006 不回归。
- 测试 `R2-006 formatStorylines` 两组用例（`（隶属主线 主战）`、`（隶属主线 新主线）`）保留并仍通过。

---

## 四、测试补充

在 `src/core/pipeline/outline-context.test.ts` 的 `N8 isRehangTargetActiveMain` 描述块新增 1 用例：

- `R4-NEW-1：mainId 为已存在 abandoned 主线 → 拒绝重挂（与 completed 同构，避免 N8 前缀丢失复现）`：构造含 active/completed/abandoned 三条主线的 `existing` 快照，断言 `isRehangTargetActiveMain("abandonedMain", existing)` 为 `false`。

文件用例数由 15 升至 16。`pickReassignMainId` 既有用例已覆盖「只剩 completed/abandoned 兄弟 → 返回 null」，无需新增。

---

## 五、验证结果

- `cd 项目根 && SAFE_DELETE_DISABLE=1 npx tsc --noEmit`：**零错误（EXIT 0）**。
- `npx vitest run src/lib/storyline-progress.test.ts src/core/pipeline/outline-context.test.ts`：**2 文件 / 25 用例全绿（EXIT 0）**（storyline-progress 9 例 + outline-context 16 例，较上一轮新增 1 例 abandoned 用例）。
- grep 复核：
  - `isRehangTargetActiveMain` 现为 `main.status === "active"`；
  - `generate/route.ts` mainId 解析为 `s.status === "active"`；
  - `[id]/route.ts` 删除重挂仍用 `pickReassignMainId`（口径 `status === "active"`），无 `siblings[0]` 取 completed/abandoned 主线的回退。

---

## 六、诚实声明（边界）

- **已实测**：`tsc --noEmit` 零错误；vitest 25 用例全绿，覆盖 abandoned 主线被拒绝作为重挂目标、completed 主线仍被拒绝、active 主线放行、DELETE 仅选活跃兄弟、R2-006 隶属前缀恢复、N1/N2/N4 既有逻辑无回归。
- **未经实测、标注待验证**：
  - 重挂守卫与 DELETE 级联重挂的真实 DB `updateMany` 行为仅经纯函数单测 + 代码推演验证，本环境无 dev server / 数据库 / 浏览器，**真实多主线渲染、abandoned 主线被自动排除后的端到端重挂、删除主线的 UI/DB 效果未经实测**，标注待验证。
  - 「重挂后 AI 写作 prompt 是否确实验证可见『隶属主线』前缀」属端到端集成表现，建议后续以集成测试或手动 E2E 最终确认。
- **范围**：仅收口 R4-NEW-1（abandoned 主线漏网），未改动 R4 已生效的 N8 加固、N3 级联、N4 新建行为、R2-006 前缀注入。本轮**未处理**同复检文档中的其他新坑（R4-NEW-2 超时重试放大、R4-NEW-3 时序倒挂假阳性、R4-NEW-4 全文检索性能、R4-NEW-5 N7 跨线误归属、R4-NEW-6 N5 "main" 字面量、R4-NEW-7 AbortSignal 兼容），建议后续轮次跟进。R4-NEW-6 的 `loadOutlineData` 死字面量 `["active","main"]` 与本次 abandoned 修复无冲突（其实际等价于仅 active，已排除 abandoned），故未一并改动以控制范围。
