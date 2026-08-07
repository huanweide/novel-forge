# Round-3 修复报告：世界卡 catOrder 静默失败（复检 PIT-1）

修复 Agent：魔王系统 Round-3 独立修复 Agent
修复对象：复检 round-2/recheck-1 的 PIT-1（严重·静默失败）—— 生成侧 globalPrompt 丢弃 7 类世界卡
修复日期：2026-08-07
项目根：C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge

---

## 一、问题定位（实读确认）

复检报告 `PROCESS/meetings/round-2/recheck-1/lens-worldcard.md` 的 PIT-1 指出：
`src/core/sync-global-prompt.ts` 第 170 行的 `catOrder` 硬编码为仅 10 项，其中还包含 2 个
并不存在于 15 类 taxonomy 中的虚构分类（worldview / story_progression），真实世界卡分类被遗漏 7 个：
technique / law / currency / character_relationship / fate_system / physics / public_system。

后果链条：entity-sync（R2-002）已把世界卡正确归类为 15 类之一并写库（`lorebookEntry.category`），
但 `syncGlobalPrompt` 第 21 行取的是全量启用世界卡，第 178–190 行遍历 `catOrder` 时只渲染了那 8 个
真实分类，导致其余 7 类条目在组装 globalPrompt 时被静默丢弃（不报错、不告警），世界卡内容不进写作上下文。
这是 R2-002 的「最后一公里」断点。

注：用户指令中给出的路径 `src/lib/sync-global-prompt.ts` 与实际不符，真实文件位于
`src/core/sync-global-prompt.ts`（已用 find 确认）。权威分类常量在 `src/lib/world-category-classifier.ts`
的 `ALL_WORLD_CATEGORIES`（15 项，第 38–42 行）。

---

## 二、改动清单

### 文件 1：src/core/sync-global-prompt.ts

改动点 A（第 9–11 行，新增 import）：
```ts
import { prisma } from "@/lib/prisma";
import { getTemplate } from "@/core/templates";
import { ALL_WORLD_CATEGORIES } from "@/lib/world-category-classifier";   // 新增：引入权威分类常量
```

改动点 B（原第 165–176 行，替换为派生写法）：

- `catOrder` 由原硬编码数组改为：
  ```ts
  const catOrder = ALL_WORLD_CATEGORIES;
  ```
  即从权威常量派生，不再硬编码，杜绝多源漂移（对应 PIT-2 根因的局部缓解）。

- `catLabel` 补齐为覆盖全部 15 类的标签映射，新增 technique / law / currency /
  character_relationship / fate_system / physics / public_system 六个标签，
  并删除 worldview / story_progression 两个虚构分类的标签（它们已被移除）。

- 注释同步更新：说明此改动是为了修复 PIT-1 的静默丢弃，并标注「禁止再硬编码、
  必须与分类器同步」，以及说明虚构分类属死代码（移除前本就只遍历空分组）已删除。

消费处确认：`catOrder` 仅在第 178 行 `for (const cat of catOrder)` 循环消费，第 182 行
`catLabel[cat] || cat` 有兜底；除该循环外不存在任何对 category 的二次过滤或白名单截断，
因此 15 类世界卡条目只要 `enabled: true` 就一定会被注入 globalPrompt。

---

## 三、catOrder 修复前后对比

修复前（硬编码，10 项，含 2 虚构）：
```
["worldview", "story_progression", "geography", "faction", "magic_system",
 "history", "culture", "creature", "item", "custom"]
```
覆盖的真实 taxonomy 分类：geography / faction / magic_system / history / culture / creature / item / custom（8 个）
缺失的真实分类（写了库但生成侧丢弃）：technique / law / currency / character_relationship / fate_system / physics / public_system（7 个）
死代码分类（永不可达）：worldview / story_progression（2 个）

修复后（从 ALL_WORLD_CATEGORIES 派生，15 项全量）：
```
ALL_WORLD_CATEGORIES  // 即 geography, faction, item, magic_system, technique,
                       //    creature, culture, history, law, currency,
                       //    character_relationship, custom, fate_system, physics, public_system
```
覆盖范围：15 类世界卡分类 100% 纳入生成侧注入，无任何遗漏、无虚构分类。

---

## 四、验证结果（本地实跑）

1. 类型检查：
   `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → 退出码 0，零错误（无任何输出）。

2. 单元测试：
   `npx vitest run src/core/babylore/entity-sync.test.ts src/lib/world-category-classifier.test.ts`
   → Test Files 2 passed (2)；Tests 10 passed (10)。
   其中 entity-sync.test.ts 4 个（含 R2-002 的 13 类可达性断言 + R2-001 的 3 个兜底路由断言）；
   world-category-classifier.test.ts 6 个。全部保持绿色，未改坏现有功能。

3. 静态核对（grep）：
   - `const catOrder = ALL_WORLD_CATEGORIES;`（第 173 行）已派生自权威常量。
   - `ALL_WORLD_CATEGORIES` 在分类器内为 15 项。
   - 文件中已无 worldview / story_progression 的运行时引用（仅剩一处注释说明其被删除）。

---

## 五、诚实声明（未实测项，绝不伪装已验证）

1. **未启动 dev server / 真实触发 syncGlobalPrompt 注入核对**：
   本次修复后的「15 类世界卡内容确实进入写作上下文」是基于代码路径（catOrder 全量遍历 +
   无二次过滤）的逻辑结论，未实际写一条 law/technique 类世界卡、触发 `syncGlobalPrompt` 并检索
   回写后的 `project.globalPrompt` 字符串做端到端确认。该项标注为「未经实测，待验证」。
   逻辑上：只要条目 `enabled: true` 且 `category` 属于 15 类之一，即必然被渲染进 globalPrompt。

2. **未调用真实 LLM 网关**：entity-sync 的真实抽取路径仅通过 mock LLM 测试覆盖；
   真实 LLM 返回的 type 漂移不影响本修复（本修复在生成侧注入端，与抽取端解耦）。

3. **未测 UI 渲染**：catLabel 的中文分组标题变更仅影响 globalPrompt 文本中的 `## 标题`，
   不影响 UI 组件；UI 侧分组（如 ChapterEntitiesPanel）的同类遗漏属于 PIT-5，不在本轮范围。

4. **标签（catLabel）仍为独立硬编码**：本修复优先用 `ALL_WORLD_CATEGORIES` 解决了「分类覆盖」
   这一致命问题；但中文标签本身仍是手抄（共 15 项），与 WORLD_MODULES 的 label 存在潜在二次漂移
   风险（属 PIT-2 系统性根因的一部分）。当前已在注释中标注「必须与分类器同步」，建议后续将
   catLabel 也改为从 WORLD_MODULES 派生以消除最后一处手抄。本轮未做此扩展，以避免改动范围过大。

结论：PIT-1 的严重静默失败已修复，catOrder 与权威 15 类分类对齐，tsc 零错误、相关测试全绿。
端到端注入效果建议由主 Agent 在 dev server 上做一次确认（见声明第 1 条）。
