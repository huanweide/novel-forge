# Round-4 修复报告：世界卡 catLabel 手抄漂移根因消除（复检新坑 2 / 原 PIT-2）

修复 Agent：魔王系统 Round-4 独立修复 Agent
修复对象：Round-3 复检 `lens-worldcard-entity.md` 的「新坑 2」（P1/P2，多源漂移根因残留）—— `catLabel` 仍手抄硬编码，与 `ALL_WORLD_CATEGORIES` 无编译期联动
修复日期：2026-08-07
项目根：C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge

---

## 一、问题定位（实读确认）

Round-3 已把 `src/core/sync-global-prompt.ts` 的 `catOrder` 改为从 `ALL_WORLD_CATEGORIES` 派生（覆盖 15 类），但 `catLabel`（分类的中文标题映射）仍是一份手抄的 `Record<string, string>`（15 项），与 `ALL_WORLD_CATEGORIES` 是两份独立维护的源。

后果：一旦未来有人在 `ALL_WORLD_CATEGORIES` 增/删/改名某一类，`catLabel` 不会联动，新增类会走 `catLabel[cat] || cat` 兜底，在 `globalPrompt` 里显示裸英文 raw key（如 `public_system`），分组标题退化。原 Round-2 复检 PIT-2「多源漂移」的系统性根因并未真正消除，只是补上了最致命的「覆盖缺失」（PIT-1）。

经核查：`src/lib/worldPanelData.ts` 不存在；全仓库无 `WORLD_MODULES` 符号。因此唯一权威源就是 `src/lib/world-category-classifier.ts`，其已导出 `ALL_WORLD_CATEGORIES` 与 `WorldCategory` 联合类型，但未导出中文标签映射。

---

## 二、catLabel 派生方案

将中文标签映射提升为分类器内的单一权威常量，并让其键类型与 `ALL_WORLD_CATEGORIES` 共用同一 `WorldCategory` 联合类型，从而在编译期强制 1:1 对齐。

### 文件 1：src/lib/world-category-classifier.ts
- 在 `ALL_WORLD_CATEGORIES`（第 38-42 行）之后新增 `WORLD_CATEGORY_LABELS: Record<WorldCategory, string>`（第 44-60 行）。
- 键集与 `ALL_WORLD_CATEGORIES` 完全一致（15 类），标签文本沿用原 `catLabel` 的中文标题（含原图标前缀，以保持 `globalPrompt` 输出不变）。
- 关键点：`Record<WorldCategory, string>` 是**精确键入**——若该联合类型新增/改名任一成员而映射漏改，tsc 直接编译失败；反之若映射里出现分类清单之外的多余 key，tsc 同样报错。这就把「catOrder 与 catLabel 同步」从人工约定升级为编译期约束。

### 文件 2：src/core/sync-global-prompt.ts
- 第 11 行 import 扩展为 `import { ALL_WORLD_CATEGORIES, WORLD_CATEGORY_LABELS } from "@/lib/world-category-classifier";`。
- 第 173-174 行改为：
  ```ts
  const catOrder = ALL_WORLD_CATEGORIES;
  const catLabel = WORLD_CATEGORY_LABELS;
  ```
- 删除原第 174-180 行那一份 15 项手抄 `Record<string, string>`。
- 消费处（第 186 行）`catLabel[cat] || cat` 不变：`catLabel` 现已按 `WorldCategory` 键入，`catOrder` 遍历出的每一项必然有标签，`|| cat` 仅作运行时兜底保留。

### 同源保证
- `catOrder` 与 `catLabel` 现在都派生自 `world-category-classifier.ts` 的同一模块、`WorldCategory` 同一类型：分类清单与中文标题永远 1:1。
- 保留 Round-3 已生效的 15 类覆盖成果，未回退。

---

## 三、改动文件 / 行

| 文件 | 行 | 改动 |
|---|---|---|
| src/lib/world-category-classifier.ts | 11（import 行号不变）/ 44-60 | 新增 `WORLD_CATEGORY_LABELS: Record<WorldCategory, string>`，键集对齐 15 类 |
| src/core/sync-global-prompt.ts | 11 | import 增加 `WORLD_CATEGORY_LABELS` |
| src/core/sync-global-prompt.ts | 173-174 | `catOrder = ALL_WORLD_CATEGORIES` 保留；`catLabel` 由手抄改为 `= WORLD_CATEGORY_LABELS` |
| src/core/sync-global-prompt.ts | 174-180（删除） | 原 15 项手抄 `catLabel` 映射整体移除 |
| src/lib/world-category-classifier.test.ts | import + 新增用例 | 引入 `WORLD_CATEGORY_LABELS`，新增「标签与分类同源」回归测试 |

---

## 四、验证结果（本地实跑）

1. 类型检查：
   `cd 项目根 && SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → 退出码 0，零错误（无任何输出）。

2. 单元测试：
   `npx vitest run src/core/babylore/entity-sync.test.ts src/lib/world-category-classifier.test.ts`
   → Test Files 2 passed (2)；Tests 11 passed (11)。
   - `entity-sync.test.ts` 4 个（保持绿色，未改坏）。
   - `world-category-classifier.test.ts` 7 个（原为 6 个，新增 1 个「WORLD_CATEGORY_LABELS 与 ALL_WORLD_CATEGORIES 同源」回归用例，断言键集一致、标签非空、无多余 key）。

3. 静态核对（grep）：
   - `src/core/sync-global-prompt.ts` 中已无 `const catLabel` 的手写 15 类映射，只剩 `const catLabel = WORLD_CATEGORY_LABELS;`（第 179 行）。
   - `src/core/sync-global-prompt.ts` 中已无 `geography:`/`faction:`/`public_system:` 等手写 label 键值对（grep 仅命中第 179 行派生引用）。
   - `WORLD_CATEGORY_LABELS` 键集与 `ALL_WORLD_CATEGORIES` 完全一致，均由 `WorldCategory` 类型约束。

---

## 五、诚实声明（未实测项，绝不伪装已验证）

1. **真实生成侧标签注入端到端效果「未经实测，待验证」**：本修复仅通过 tsc 零错误 + 单测全绿 + grep 静态确认证明「catLabel 已派生、不再手抄、与 catOrder 同源」。未启动 dev server、未写一条世界卡、未真实触发 `syncGlobalPrompt` 并检索回写后的 `project.globalPrompt` 字符串确认中文分组标题实际出现在「世界书」章节。逻辑上：标签映射与原手写内容逐字相同（仅搬迁到分类器），消费处写法不变，故渲染输出应与修复前一致；但端到端链路未经实战触发，标注为「未经实测，待验证」。

2. **未调用真实 LLM 网关 / 真实 Postgres**：分类器与同步引擎的真实抽取/落库路径仅由 mock 单测覆盖；本修复位于生成侧注入端，与抽取端解耦，不受影响。

3. **UI 渲染未测**：catLabel 仅影响 `globalPrompt` 文本中的 `## 标题`，不影响任何 UI 组件；UI 侧分组遗漏属 PIT-5，不在本轮范围。

4. **未触碰 Round-3 复检其余新坑**：新坑1（refine detect 扫陈旧摘要）、新坑3（origin 耦合主链路）、新坑4（重试无超时/退避）、新坑5（nodeId 死参数）均不在本次修复范围内，本次只消除新坑2（catLabel 手抄漂移）。

结论：catLabel 已由手抄硬编码改为从分类器权威常量 `WORLD_CATEGORY_LABELS` 派生，与 `catOrder` 共用同一 `WorldCategory` 类型，编译期强制 1:1 对齐，彻底消除多源漂移根因（原 PIT-2），并保留 Round-3 的 15 类覆盖成果。tsc 零错误、相关测试全绿（11 passed）。真实生成侧标签注入效果未经端到端实测，待验证。
