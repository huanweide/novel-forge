# 魔王系统·阶段五复检循环 — 世界卡（worldcard）复检报告

复检员：独立代码复检员（lens-worldcard）
复检对象：round-2 整合清单 4 条世界卡修复（R2-001 / R2-002 / R2-014 / R2-015）
复检原则：Trust but verify。所有结论均来自对当前文件的 Grep + Read 实读，以及本地实跑的单元测试；未能端到端实测的项明确标注「待验证」。
项目根：C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge

---

## 一、四条复检项逐条验证结论

### 1. R2-001（P0）世界卡确定性分类器接线 — 结论：生效（真生效，非纸面）

**验证过程与证据**

第一步，确认分类器本身存在且导出正确。读 `src/lib/world-category-classifier.ts`：
- 第 22–25 行导出联合类型 `WorldCategory`，覆盖 15 个世界卡分类 + 2 个元桶（`character` / `unknown` 在 `ClassifyBucket` 里）。
- 第 38–42 行导出 `ALL_WORLD_CATEGORIES: WorldCategory[]`，15 项齐全。
- 第 66 行 `export function classifyWorldCategory(text: string): ClassifyResult`，确定性、不依赖 LLM，逻辑为关键词权重（权重 = 字符长度，长词优先消歧）+ 无命中降级到角色/未知元桶。

第二步，确认 `entity-sync.ts` 确实 import 并接线分类器。读 `src/core/babylore/entity-sync.ts`：
- 第 18–22 行：`import { classifyWorldCategory, ALL_WORLD_CATEGORIES, type WorldCategory } from "@/lib/world-category-classifier";` —— import 真实存在，未缺失。
- 第 228 行：落库前 `let category: WorldCategory = (TYPE_TO_CATEGORY[type] || "custom") as WorldCategory;`
- 第 232–238 行（custom 兜底分支）：
  ```
  if (category === "custom") {
    const cr = classifyWorldCategory(`${name} ${description}`);
    if (cr.category && cr.category !== "character_relationship") {
      category = cr.category;
    }
  }
  ```
  即在 LLM 给出的 type 不可信（落到 custom / 未映射）时，用分类器对「名称 + 描述」重新路由，且明确排除「角色关系」元桶与「未知」空值（保持 custom），逻辑闭环正确。

第三步，确认该同步函数不是死代码（前几轮曾出现过「写了函数但无人调用」的假收敛）。Grep `syncChapterEntities` 调用点，命中 `src/core/babylore/fill.ts`：
- 第 26 行 import；
- 第 597 行 `await syncChapterEntities(projectId, chapterText, llm).catch(() => null);`
- 第 713 行 `await syncChapterEntities(projectId, ch.content || "", llm).catch(() => null);`
即自动填表主链路 `fill.ts` 在每章填表后真实调用了它，分类器接线落在了真实执行路径上。

第四步，实跑主张级测试。运行 `npx vitest run src/core/babylore/entity-sync.test.ts`，结果见下。其中 R2-001 的 3 个测试正是验证兜底路由：
- `灵石` + type=other → 断言落库 category === "currency"（而非静默 custom）；
- `灭世之战` + type=other → 断言 === "history"；
- 纯角色对话（无世界关键词）→ 断言保持 === "custom"，不被误归世界卡。
三者均通过，证明分类器在 custom 分支确实改变了落库 category，并非只在代码里「看起来接了」。

**测试输出（本地实跑）**
```
 ✓ src/core/babylore/entity-sync.test.ts (4 tests) 5ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```
（4 个用例 = R2-002 的 1 个 + R2-001 的 3 个，全绿。）

**结论**：R2-001 真生效。import 存在、落库逻辑在 custom 分支真实调用分类器、分类器自身导出正确、且函数被 fill 主链路调用。

---

### 2. R2-002（P0）LLM 枚举 + TYPE_TO_CATEGORY 补全 9/15 → 15/15 — 结论：生效

**验证过程与证据**

读 `src/core/babylore/entity-sync.ts`：
- `ENTITY_SYSTEM_PROMPT`（第 39 行）的 type 枚举现在为：
  `character|location|item|technique|organization|creature|fate|physics|public|magic_system|culture|history|law|currency|other`
  共 15 个取值，明确包含了此前缺失的 `magic_system / culture / history / law / currency` 5 类。
- `TYPE_TO_CATEGORY`（第 47–62 行）现含 15 条映射键：`location/faction/item/technique/organization/creature/fate/physics/public/magic_system/culture/history/law/currency/other`，其中新增的 5 类映射为 `magic_system→magic_system`、`culture→culture`、`history→history`、`law→law`、`currency→currency`，加上原本就在的 `fate→fate_system`、`public→public_system`。也就是说 13 个世界卡 type 全部能直接映射到对应 category，`other` 兜底为 `custom`。

新增测试 `src/core/babylore/entity-sync.test.ts` 的 R2-002 describe（第 54–100 行）做「主张级」断言：mock LLM 返回覆盖 13 个世界卡分类的 type，断言落库 category 集合 == 13 个（排除 `character_relationship` 与 `custom`），且 `cats.size === EXPECTED_LORE.length`，且角色卡「陈凡」单独入库不被误并。该测试与 R2-001 的 3 个合并为 4 个用例，全部绿色（见上节输出）。

**结论**：R2-002 真生效。枚举与映射补全、且集成测试覆盖 15 类可达性，实跑 4/4 绿。

---

### 3. R2-014（P1）lorebook category 白名单校验 — 结论：生效（功能达成，但实现技法与清单描述有出入，已如实记录）

**验证过程与证据**

读 `src/app/api/lorebook/route.ts`：
- 第 14 行：`import { ALL_WORLD_CATEGORIES } from "@/lib/world-category-classifier";`
- 第 18 行：`const VALID_CATEGORIES = new Set<string>(ALL_WORLD_CATEGORIES);`
- 第 38–43 行：
  ```
  if (!VALID_CATEGORIES.has(body.category)) {
    return badRequest(
      `category「${body.category}」非法：必须为 15 类世界卡分类之一`,
      "category",
    );
  }
  ```
  非法 category 返回 400，且不会落库（在 `prisma.lorebookEntry.create` 之前拦截）。

新增测试 `src/app/api/lorebook/route.test.ts`（4 个用例）实跑结果：
```
 ✓ src/app/api/lorebook/route.test.ts (4 tests) 7ms
      Tests  4 passed (4)
```
覆盖：合法 geography → 201 且落库；缺省 → 兜底 custom（合法）→ 201；非法「地理」→ 400 且零落库且 `json.field === "category"`；边界 custom 本身在白名单内 → 201。

**需要如实说明的出入**：R2-014 整合清单字面写的是「用 `z.enum([...ALL_WORLD_CATEGORIES])` 校验」。实际落地代码并未使用 zod 的 `z.enum`，而是用 `asStr(raw.category, "category", { max: 40, fallback: "custom" })`（第 26 行）+ 一个 `Set` 成员判断 + `badRequest` 返回 400。从功能意图看，白名单 + 400 拒绝已完全达成，测试也证明非法值被拒、合法值（含 custom）放行。因此 R2-014 的「目标」生效，但「实现技法」与清单描述不符——这属于诚实边界，应记录，而非假装用了 z.enum。

**结论**：R2-014 功能生效（4/4 绿），实现方式为 Set 校验而非 z.enum；其守卫完整性存在缺口见新坑 PIT-3。

---

### 4. R2-015（P1）15 类分类单一来源 — 结论：生效（所要求的两处已派生，但分类来源仍有多处重复，见 PIT-2）

**验证过程与证据**

第一项，`LorebookEditDialog.tsx`：读第 111–116 行，原硬编码的 15 个 `<option>` 已改为：
```
<select ... value={form.category} ...>
  {WORLD_MODULES.map((m) => (
    <option key={m.key} value={m.key}>{m.label}</option>
  ))}
</select>
```
Grep `<option` 确认除 depth 下拉（与分类无关）外，分类下拉完全由 `WORLD_MODULES.map` 派生，无任何残留硬编码分类字符串。

第二项，`pre-write-cards/route.ts`：读全文件确认原「13 个 hasX 布尔 + 内联映射」已删除，改为：
- 第 212–214 行：`LORE_LABELS: Record<string, string> = Object.fromEntries(WORLD_MODULES.map((m) => [m.key, m.label]));`
- 第 215–217 行：`LORE_CHECK_CATEGORIES = ALL_WORLD_CATEGORIES.filter((c) => c !== "character_relationship" && c !== "custom");`
即标签与检查集合均从 `WORLD_MODULES` / `ALL_WORLD_CATEGORIES` 派生，无内联字符串散落。Grep 印证该文件内已无 `hasGeography` 之类的布尔变量。

**结论**：R2-015 所要求的两处文件确实改为派生，无残留硬编码，生效。但「单一来源」只在这两处实现，全局仍有 6+ 处独立重复声明分类（见 PIT-2），故「根因」未彻底消除。

---

## 二、新坑清单（round-2 未发现但真实存在的缺陷）

以下均为本次精读 `entity-sync.ts`、`world-category-classifier.ts`、`lorebook/route.ts`、`LorebookEditDialog.tsx`、`pre-write-cards/route.ts` 及关联常量（`worldPanelData.ts`、`core/types/index.ts`、`sync-global-prompt.ts`、`entity-highlighter.ts`、`tool-registry.ts`、`post-processor.ts`）后发现。

### PIT-1（严重·静默失败）生成侧 globalPrompt 丢弃 7 类世界卡
- 文件：`src/core/sync-global-prompt.ts:170`（及 178–190 的渲染循环）
- 问题：构建全局生成上下文时使用的 `catOrder` 写死为
  `["worldview", "story_progression", "geography", "faction", "magic_system", "history", "culture", "creature", "item", "custom"]`
  仅 10 项。对照真实的 15 类世界卡分类，被遗漏的真实分类有 **7 个**：`technique`、`law`、`currency`、`character_relationship`、`fate_system`、`physics`、`public_system`。同时 `worldview` / `story_progression` 是并不存在于 15 类 taxonomy 中的虚构分类（lorebookEntry.category 永远不可能是这两个值），属于死代码。
- 后果链条：该函数第 21 行 `loreEntries = prisma.lorebookEntry.findMany({ where: { projectId, enabled: true } })` 取的是**全量**启用世界卡（含这 7 类），但第 178–190 行的循环只遍历 `catOrder`，于是这 7 类条目在组装 globalPrompt 时被**静默丢弃**，既不报错也不告警。
  这直接与 R2-002 背道而驰：自动填表现在能把 law/technique/currency 等 7 类正确写库，但到了真正要「喂给 AI 生成」的环节，它们根本没被注入。等于 R2-002 让这 7 类「可达」，但生成端又把它们「不可见」——功能被悄悄抵消一多半，且是静默的，用户不会得到任何错误提示。
- 复现思路：
  1. 通过 UI 或 API 写一条 `category = "law"`（或 technique/currency/fate_system/physics/public_system）的世界卡并启用；
  2. 触发 `syncGlobalPrompt(projectId)`（角色卡/世界书增删改后会自动触发，见 `route.ts` 第 59 行 / `[id]/route.ts` 第 28 行）；
  3. 取回 `project.globalPrompt` 字符串，检索该世界卡标题——**不会出现在「世界书」章节里**。
- 修复建议：`catOrder` / `catLabel` 应从 `ALL_WORLD_CATEGORIES`（排除 `character_relationship`）派生；删除虚构的 `worldview` / `story_progression`，或改用真正承载定义级内容的来源。

### PIT-2（系统性根因·多源漂移）15 类分类在 ≥6 处独立硬编码，无编译期联动
- 涉及文件：
  - `src/lib/world-category-classifier.ts`：`WorldCategory` 联合 + `ALL_WORLD_CATEGORIES` + `KEYWORDS`（其中 `KEYWORDS` 因声明为 `Record<WorldCategory, string[]>`，被 TypeScript 强制必须覆盖全部分类——这是唯一被类型守护的源）。
  - `src/components/workspace/worldPanelData.ts:5`：`WORLD_MODULES`（用 `as const`，**未与 `WorldCategory` 绑定**，漏加一项不会报类型错）。
  - `src/core/types/index.ts:95`：`LoreCategory` 联合（15 项，人工维护）。
  - `src/core/settings/parser.ts:99`：又一份 `category: "geography" | ... | "custom"` 联合。
  - `src/core/agents/tool-registry.ts`：至少 5 处硬编码 `enum: [...]` 数组（约第 325、352、382、446 行）及中文→分类映射（约第 401、463 行）。
  - `src/core/sync-global-prompt.ts:170`：`catOrder` / `catLabel`。
  - `src/components/workspace/ChapterEntitiesPanel.tsx:28`：又一份分组配置。
- 问题：R2-015 只在 2 个文件里做了「派生」，但 taxonomy 本身仍是多份手抄。除 `KEYWORDS` 外，其余各处之间没有任何类型或运行时约束能防止漂移。PIT-1 正是这种漂移的真实后果——`catOrder` 在分类从 ~10 扩到 15 时从未同步。未来任何人增删一个分类，必须手工改 6+ 处，否则就会出现「能写库但生成不注入 / UI 不显示 / 工具枚举缺项」之类的静默不一致。
- 修复建议：确立 `ALL_WORLD_CATEGORIES` 为唯一来源；`WORLD_MODULES` 用 `satisfies` 或显式类型约束到 `WorldCategory[]`；`catOrder` 用 `.filter` 派生；`tool-registry.ts` 的 enum 用 `[...ALL_WORLD_CATEGORIES]` 展开；`LoreCategory` / `parser.ts` 联合改为 `= WorldCategory` 的再导出或别名。

### PIT-3（R2-014 守卫不完整）编辑接口绕过白名单
- 文件：`src/app/api/lorebook/[id]/route.ts:14-27`
- 问题：PUT 处理函数直接 `category: body.category` 写入 `prisma.lorebookEntry.update`，**完全未做 `ALL_WORLD_CATEGORIES` 白名单校验**。R2-014 的 400 守卫只装在 `POST /api/lorebook`（新建），而「编辑已有词条」这条路径可以随意写入任意/错字 category 并持久化。也就是说 R2-014 想解决的「错字被静默持久化」，通过编辑接口依然会发生。
- 复现思路：对一条已存在的世界卡发 `PUT /api/lorebook/<id>`，body 带 `category: "地理"`（或任意乱码），观察落库 category 变成非法值，且接口返回 200。
- 修复建议：把 route.ts 的 `VALID_CATEGORIES` 校验抽成公共函数，POST 与 PUT 共用；或直接在中台层对 category 统一校验。

### PIT-4（轻微·UI 颜色缺失）正文高亮 4 类世界卡无专属色
- 文件：`src/core/entity-highlighter.ts:19-31`（LORE_COLORS 仅 11 项），第 179 行 `LORE_COLORS[category] || "#6b7280"` 兜底灰。
- 问题：`LORE_COLORS` 缺 `character_relationship` / `fate_system` / `physics` / `public_system` 4 类。虽因有 `||` 兜底不会崩溃（显示为灰色），但正文里这 4 类世界卡实体高亮时与自定义项无区分度，与 PIT-2 同源。
- 修复建议：LORE_COLORS 也由分类源派生补全（或至少补 4 个 key）。

### PIT-5（轻微·UI 分组丢失）章节实体面板 6 类退化为「其他」
- 文件：`src/components/workspace/ChapterEntitiesPanel.tsx:28-39`
- 问题：`groupDefs` 只有 `character` + 9 个 lore 分组 + 一个 `other` catch-all（`match: () => true`）。缺少 `law` / `currency` / `character_relationship` / `fate_system` / `physics` / `public_system` 的专属分组，这些条目全部落入「其他」组，标签与颜色不可区分。非崩溃，但章节实体面板的世界卡分类展示对 6 类退化为一团「其他」。
- 修复建议：分组配置同样从 `WORLD_MODULES` 派生。

### PIT-6（轻微·元数据残留）兜底重路由后 keys 仍含 stale "other"
- 文件：`src/core/babylore/entity-sync.ts:228` 与 `:244`
- 问题：当 LLM `type="other"` 被分类器重路由到 `currency`/`history` 等后，`keys: [name, type]` 仍然写入原始 `type` 字符串 `"other"`（第 244 行），没有把解析出的真实 category 写进 keys。后果：该世界卡的关键词/元信息里残留 `"other"` 字面量，可能影响后续按 `keys` 做关键词触发的注入匹配（例如把一条货币设定误标为 other 触发词）。
- 修复建议：兜底重路由后，将解析出的真实 category 一并写入 `keys`。

### PIT-7（边界·反向误路由）分类器兜底可能把真·自定义实体错归世界卡
- 文件：`src/lib/world-category-classifier.ts:86-102`（并列裁决）结合 `entity-sync.ts:232-238`
- 问题：R2-001 引入「custom 时分类器兜底」后，带来反向风险。分类器并列裁决只看「最长关键词长度」。若一个真正属于「金手指/系统」类的实体，其名称或描述里恰好含某个世界卡长关键词（如「灵根系统」含 `灵根`→magic_system，权重 2；同时含 `系统`→custom，权重 2），二者等长并列，而 `ALL_WORLD_CATEGORIES` 遍历顺序中 `magic_system`（索引 3）先于 `custom`（索引 11），于是被判为 `magic_system`，偏离本应保留的 `custom`。即原本会「静默归 custom」的实体，现在可能被「误归到某世界卡分类」，把系统流设定错填成力量体系。
- 复现思路：构造 `type="other"`、`description="他的灵根系统觉醒，绑定金手指面板"` 的实体喂给 `entity-sync`，观察落库 category 是否为 `magic_system` 而非 `custom`。
- 修复建议：在分类器或 entity-sync 兜底分支对「custom 关键词命中」（系统/金手指/血脉/面板等）做优先级保护；并在测试中显式覆盖此类「金手指/系统」实体，防止把系统流设定错填成力量体系。

---

## 三、复检员诚实声明

### 本次真实本地执行并验证的项
1. 单元测试实跑（非仅看代码）：
   - `npx vitest run src/core/babylore/entity-sync.test.ts` → **4 passed (4)**，覆盖 R2-002 的 13 类可达性断言 + R2-001 的 3 个兜底路由断言（灵石→currency、灭世之战→history、纯对话→custom）。
   - `npx vitest run src/app/api/lorebook/route.test.ts` → **4 passed (4)**，覆盖 R2-014 的合法/缺省/非法 400/边界 custom。
   - 附带实跑 `npx vitest run src/lib/world-category-classifier.test.ts` → **6 passed (6)**，确认分类器自身正确。
2. 接线真实性：通过 Grep 确认 `syncChapterEntities` 被 `fill.ts`（第 597、713 行）在真实自动填表主链路调用，排除「写了函数但无人调用」的假收敛。
3. 改动落地真实性：对 4 条修复涉及的 5 个目标文件做了逐行 Read，确认 import、落库分支、白名单、`<option>` 派生、枚举/映射补全均真实存在，非仅存在于 git diff 描述。

### 未能实测、需主 Agent 端到端确认的项（明确标注，绝不伪装已验证）
1. **未跑完整 `tsc --noEmit` 类型检查**：vitest 经 esbuild 去类型执行，只能证明运行时逻辑，不能捕捉类型错误。因此「多源分类是否类型一致」（PIT-2）仅通过人工比对代码确认，未用编译器强制；`WORLD_MODULES` 与 `WorldCategory` 之间缺乏类型联动这一判断，是基于 `as const` 与独立联合类型的人工推断。
2. **未启动 dev server / 浏览器做端到端验证**：因此以下结论为静态代码路径推断，强烈建议由主 Agent 在 dev server 上 confirm：
   - PIT-1（7 类世界卡被 globalPrompt 静默丢弃）的严重性，是基于「catOrder 循环 + loreEntries 全量查询」的代码逻辑结论；建议用一条 `law` 或 `technique` 世界卡实际触发一次 `syncGlobalPrompt` 并检索 `globalPrompt` 字符串做最终确认。
   - LorebookEditDialog 的 `<option>` 渲染、ChapterEntitiesPanel 分组效果，均为读代码推断，未真正在浏览器中目视。
3. **未调用真实 LLM 网关**：entity-sync 的 `fetch` 实体抽取路径仅通过 mock LLM 测试验证；真实 LLM 返回的 type 漂移、JSON 解析兜底（推理模型 content 为空时从 `reasoning_content` 提取，第 110–116 行）等不在本次复检范围。
4. **PUT 绕过（PIT-3）仅静态确认**：确认 `[id]/route.ts` 的 PUT 无白名单校验，但未实际发送 HTTP 请求验证返回 200 + 错字落库。
5. **分类器反向误路由（PIT-7）仅逻辑分析**：未实跑该具体用例，建议补一个针对「灵根系统/金手指」类实体的断言测试。

### 复检员总体判断
四条 round-2 修复（R2-001 / R2-002 / R2-014 / R2-015）均**真生效**，有代码证据与绿色测试支撑，不存在纸面修复。但本轮暴露出更深层的结构性问题：世界卡 15 类分类在代码中有 ≥6 处独立手抄，缺乏单一可信来源，直接导致生成侧 `sync-global-prompt.ts` 的 `catOrder` 未随分类扩张而同步（PIT-1，严重静默失败，会抵消 R2-002 一半收益）。以及 R2-014 白名单未覆盖编辑接口（PIT-3）、若干 UI 派生遗漏（PIT-4/5）、兜底后元数据残留（PIT-6）、分类器反向误路由（PIT-7）。建议优先修复 PIT-1 与 PIT-2（根因），其次 PIT-3。
