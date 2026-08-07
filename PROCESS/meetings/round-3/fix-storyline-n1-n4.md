# 故事线 N1~N4 修复报告（Round-3 收口）

- 修复 Agent：魔王系统 Round-3 代码修复 Agent（独立修复、自验、落盘，未向主 Agent 追问）
- 项目根：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- 复检依据：`PROCESS/meetings/round-2/recheck-1/lens-storyline.md`（N1~N6）
- 本轮范围：N1、N2、N3、N4（N5/N6 不在本轮范围，见末尾诚实声明）

---

## 一、N1（HIGH）orchestrator 死过滤 — 已修复

**文件 / 行号**
- `src/core/pipeline/outline-context.ts:77-84`（新增可测函数 `filterActiveStorylines`）
- `src/core/agents/orchestrator.ts:44`（import 增加）、`src/core/agents/orchestrator.ts:679`（替换为真实过滤）

**修复逻辑**
- 原代码 `const activeStorylines = (storylines || []).filter((s: any) => !s?.completed);`
  Storyline 模型只有 `status` 字段（active | completed | abandoned），**不存在 `completed` 布尔字段**，`s.completed` 永远 `undefined`，`!s?.completed` 恒为 `true`，系死过滤。
- 改为提取纯函数 `filterActiveStorylines`：按真实 `status` 排除 `completed` 与 `abandoned`，保留 `active` 及任何其他非终态线。与全仓 status 语义一致。
- orchestrator 改用 `filterActiveStorylines(storylines || [])`。即便将来 `context-loader` 不再预过滤，已完结/废弃主线也不会再被注入正文写作 systemPrompt。
- 未改动 R2-005/R2-006 已生效逻辑；仅替换过滤判定，不影响 `formatStorylines` 注入链。

**确认无副作用**：`formatStorylines` 本身不改；`status: "active"` 预过滤链路保留；仅为防御性增强。

---

## 二、N2（HIGH）多主线只渲染第一条 — 已修复

**文件 / 行号**
- `src/lib/storyline-progress.ts:80-117`（新增纯函数 `groupStorylinesByMain`，含 `mains / sides / fallbackMain / resolveParent / childrenOf`）
- `src/components/workspace/StorylineList.tsx:13`（import）、`:133`（调用）、`:162`（`mainLines.map(...)` 渲染循环，逐条主线聚合支线 + 综合进度）
- `src/components/workspace/StorylinesModal.tsx:9`（import）、`:78`（调用）、`:122`（`mainLines.map(...)` 渲染循环）

**修复逻辑**
- 旧逻辑 `mainLine = storylines.find(s => s.type === "main")` 只取第一条（最旧主线），newMain 缝合怪产生的「新 active 主线」在 UI 中被吞掉，且悬空支线被误归属旧 completed 主线。
- 新逻辑遍历 `mains = all type==="main"`，对每条主线分别用 `childrenOf(mainId)` 聚合旗下支线并计算 `combinedProgress`（主 70% + 子均 30%）。
- `resolveParent` 回退改为优先 `status === "active"` 主线（而非数组第一条）：悬空支线不再误显示为隶属于旧 completed 主线。
- 两条主线均展示「已完结」徽标，避免用户混淆。
- `groupStorylinesByMain` 为纯函数，便于单测；左右栏（StorylineList）与全屏弹窗（StorylinesModal）共用，行为一致。

**确认**：R2-005/R2-006 隶属注入逻辑未被回退；`resolveParent` 仍服务支线「隶属主线」标注与联动进度。

---

## 三、N3（MEDIUM）删除主线悬空 parentId — 已修复

**文件 / 行号**
- `src/app/api/storylines/[id]/route.ts:79-104`（DELETE 路由改写）

**修复逻辑**
- 原代码 `prisma.storyline.delete({ where: { id } })` 直接删，无级联；schema 的 `parentId` 是普通 `String?`，无外键 `onDelete`，子线 `parentId` 悬空。
- 现删除前先读取目标，找出同项目其他 `type==="main"` 且 `id !== 目标` 的主线；优先选 `status==="active"` 的作为接管主线，否则取第一条，再无则 `null`。
- 对 `parentId === 被删id` 的子线执行 `updateMany({ data: { parentId: reassignId } })`：
  - 有其他主线 → 子线重挂到接管主线（优先活跃），隶属关系不丢；
  - 无其他主线 → 置 `null`，由 N2 的 `resolveParent` 回退到活跃主线，避免悬空误判。
- 删除主线与支线类型均安全（删支线时 `updateMany` 命中为空，无副作用）。

---

## 四、N4（MEDIUM）newMain 旧支线未重挂 — 已修复

**文件 / 行号**
- `src/core/pipeline/outline-context.ts:88-94`（新增 `getCompletedMainIds`）
- `src/app/api/storylines/generate/route.ts:15`（import）、`:159-167`（建主线后重挂）、`:162`（调用）

**修复逻辑**
- R2-005 只保证了「新建支线不误挂旧 completed 主线」，未处理**已存在的旧支线**（其 `parentId` 仍指向已完结旧主线）。在 `loadOutlineData` 按 `status: { in: ["active","main"] }` 加载时，旧 completed 主线不在 `mainTitleById` 中，旧支线因此丢失「隶属主线」前缀。
- 新建主线（main 循环）拿到 `mainId` 后，调用 `getCompletedMainIds(existingStorylines)` 取得所有「已完结旧主线」id；对其名下 `type==="side" && parentId in 旧主线` 的支线执行 `updateMany` 重挂到 `mainId`（当前活跃新主线）。
- 仅更新 `parentId` 命中旧已完结主线的支线，不影响已正确挂载的线；与 R2-005（新支线挂新主线）、R2-006（隶属注入）共存不冲突——重挂后旧支线 `parentId` 指向活跃新主线，`formatStorylines` 的 `mainTitleById` 能解析，恢复「隶属主线」前缀。

---

## 五、测试补充

- 新增 `src/core/pipeline/outline-context.test.ts`（7 用例）：
  - N1：`filterActiveStorylines` 排除 completed/abandoned、保留 active；并显式断言「旧死过滤 `!s.completed` 会全部保留」以证明新实现与之不同。
  - N4：`getCompletedMainIds` 只识别 `type=main && status=completed`；空/异常输入安全。
  - R2-006：`formatStorylines` 支线命中活跃主线标注「隶属主线」；模拟 newMain 重挂后（parentId→新活跃主线）前缀恢复。
- 扩展 `src/lib/storyline-progress.test.ts`（新增 N2 分组 6 用例，文件总计 9 用例）：
  - `groupStorylinesByMain` 返回所有主线（新活跃不被吞）、`fallbackMain` 优先 active（悬空支线不再误归属旧主线）、`childrenOf` 按各自主线正确聚合、空/异常输入安全。
- 既有 `computeStorylineProgress` 5 用例保持不变，全部通过。

---

## 六、验证结果

- `cd 项目根 && SAFE_DELETE_DISABLE=1 npx tsc --noEmit`：**零错误（EXIT 0）**。
- `npx vitest run src/lib/storyline-progress.test.ts src/core/pipeline/outline-context.test.ts`：**2 文件 / 16 用例全绿（EXIT 0）**。
- grep 复核：
  - N1 死过滤已移除——`src` 中仅剩 `outline-context.ts` 注释与测试里的「旧写法」对照引用，orchestrator.ts:679 已改用 `filterActiveStorylines`。
  - N2 已改为遍历——两组件均使用 `mainLines.map(...)` 而非 `mainLine = find(...)` 单对象。

---

## 七、诚实声明（边界）

- **N1**：`filterActiveStorylines` 纯函数已单测覆盖；其被 orchestrator 注入写作 prompt 的调用经静态核对 + 类型检查确认，但「AI 因此是否真的不再朝已完结主线推进」属 LLM 行为，未实跑 LLM 生成验证，标注**待验证**。
- **N2/N3/N4**：逻辑经 `groupStorylinesByMain` / `getCompletedMainIds` 单测与 `tsc` 静态校验，DELETE、generate 路由的 DB `updateMany` 路径仅经代码推演（无 dev server / 数据库 / 浏览器运行环境），**真实多主线渲染、删除级联、newMain 端到端重挂的 UI/DB 效果未经实测**，标注**待验证**。
- **N5 / N6（recheck 同批发现，不在本轮范围）**：本轮未处理。N5（`loadOutlineData` 的 `status: { in: ["active","main"] }` 含无效 `"main"` 枚举）与 N6（零主线静默孤儿 + 重复主线无服务端校验）仍待后续轮次收口，建议单独跟进，避免本轮范围蔓延。
- 所有改动均**保留 R2-005（支线不挂完结主线）/ R2-006（隶属注入）已生效逻辑，未回退**。
