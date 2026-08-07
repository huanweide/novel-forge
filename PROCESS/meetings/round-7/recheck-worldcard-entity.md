# Round-7 复检报告：世界卡 15 分类体系「全链路同源」

- **复检对象**：novel-forge v1.6.7（commit a68be8a）
- **子系统**：世界卡 15 分类体系「全链路同源」（分类器权威源 → 生成侧 / 装配引擎 / 自动填表 / API 白名单 / UI 下拉）
- **复检方式**：通读 6 个聚焦文件 + 全仓 Grep 旁支硬编码 + 逐条逻辑链核对；未修改任何源码。
- **术语说明**：
  - **同源**（single source of truth）：分类的「键名 / 中文标签 / 板块标题 / 下拉项」只应有一份权威定义，其余地方全部引用它，改动一处全链路自动同步。反之「手抄常量」就是每处各自写一份 15 类清单，一处漏改就漂移。
  - **WorldCategory**：分类器里定义的「15 个世界卡分类名」联合类型（如 `geography`、`faction`、`custom` 等）。
  - **兜底路由**：自动填表时 LLM 给的实体类型若不可信（或不在映射表），用确定性分类器对「名称+描述」重新判定分类，避免错归 `custom`。

---

## 摘要

共挖到 **8 条**发现，分级分布：

| 分级 | 数量 | 编号 |
|------|------|------|
| P0（数据错误/崩溃） | 0 | — |
| P1（功能退化/明显错） | 2 | F1、F5 |
| P2（边角/体验/同源不彻底） | 6 | F2、F3、F4、F6、F7、F8 |

- **F1（P1）**：`PUT /api/lorebook/[id]` 不做 category 白名单校验，可写入任意非法分类并被生成侧静默丢弃。
- **F5（P1）**：`entity-auto-creator` 的世界实体路由无分类器兜底，除 5 类外全部静默落 `custom`——正是「漏网 type 静默落 custom」的真实发生点（entity-sync 已修，此旁支未修）。
- **F2~F4、F6~F8（P2）**：第二/第三份手抄常量（UI 模块表、agent 工具 enum、独立类型定义）、装配渲染顺序不一致、emoji 撞车、创意工坊独立命名空间交叉风险。

> 诚实边界：本次**未发现 P0**。权威源本身、sync-global-prompt、engine 的 section 派生、entity-sync 的兜底（对 15 类）、lorebook **POST** 白名单、pre-write-cards 校验均确认已正确从权威源派生，详见末节「已确认无问题」。

---

## 坑位表

### F1 ｜ P1 ｜ `PUT /api/lorebook/[id]` 未做 category 白名单校验

- **文件:行**：`src/app/api/lorebook/[id]/route.ts:14-26`（写入）；对照 `src/app/api/lorebook/route.ts:18,38`（POST 有白名单）
- **现象**：更新词条时，`category` 字段被原样写入数据库，没有任何合法性校验；而创建词条（POST）有 `VALID_CATEGORIES = new Set(ALL_WORLD_CATEGORIES)` 的 400 拦截。两条写路径规则不一致。
- **证据**：
  ```ts
  // POST 有（route.ts:18,38）
  const VALID_CATEGORIES = new Set<string>(ALL_WORLD_CATEGORIES);
  if (!VALID_CATEGORIES.has(body.category)) { return badRequest(...); }

  // PUT 没有（[id]/route.ts:14-26）
  const entry = await prisma.lorebookEntry.update({
    where: { id },
    data: { /* ... */ category: body.category, /* ... */ },  // 直接落库，无校验
  });
  ```
- **复现路径**：
  1. `PUT /api/lorebook/<id>` 且 `body.category = "currnecy"`（错字）或任意字符串。
  2. 该值被持久化。
  3. 进入 `buildGlobalPrompt`（`sync-global-prompt.ts:178-185`）：`catOrder = ALL_WORLD_CATEGORIES`（仅 15 类），分组条件 `(e.category || "custom") === cat`——非法值永远不匹配任何 cat，**该词条在世界书板块中被静默丢弃，生成上下文拿不到它**（数据「写库正确但生成侧消失」）。
  4. 若经装配引擎触发注入，则 `WORLD_CATEGORY_SECTIONS[cat]` 为 undefined → 被归到 `custom` 并以「📦 自定义」标题错误呈现（engine.ts:232,239）。
- **建议修复**：在 `PUT` 路由复用同一份 `VALID_CATEGORIES`，非法值返回 `badRequest`（与 POST 一致）；最好抽成共享校验函数，杜绝两处规则漂移。

---

### F5 ｜ P1 ｜ `entity-auto-creator` 的世界实体路由无分类器兜底，漏网 type 静默落 custom

- **文件:行**：`src/lib/entity-auto-creator.ts:30-37`（映射表）、`:325`（路由）、对照 `src/core/babylore/entity-sync.ts:228-238`（已修的兜底）
- **现象**：自动建卡的另一条链路（entity-auto-creator）对世界实体的分类，只显式映射了 5 个 type，其余一律 `|| "custom"`，**且不像 entity-sync 那样用确定性分类器重路由**。这会导致 faction / creature / culture / history / law / currency / fate_system / physics / public_system 等实体一旦经此路径，被静默误归 `custom`。
- **证据**：
  ```ts
  // entity-auto-creator.ts:30
  const ENTITY_TYPE_TO_CATEGORY: Record<string, string> = {
    pill: "item", artifact: "item", technique: "technique",
    location: "geography", material: "item",
  };
  // entity-auto-creator.ts:325（世界实体分支）
  const category = ENTITY_TYPE_TO_CATEGORY[entity.type] || "custom"; // 未命中 → 直接 custom

  // 对照 entity-sync.ts:232-238（已正确修复的兜底）
  if (category === "custom") {
    const cr = classifyWorldCategory(`${name} ${description}`);
    if (cr.category && cr.category !== "character_relationship") category = cr.category;
  }
  ```
- **复现路径**：
  1. 某章节实体经 `entity-auto-creator` 建卡，其 `entity.type` 为 `faction` / `creature` / `culture` 等（不在 5 项映射内）。
  2. `ENTITY_TYPE_TO_CATEGORY["faction"]` 为 undefined → `category = "custom"`。
  3. 该世界卡在 UI / 生成侧被标为「📦 自定义」，与 entity-sync 路径（会正确归到 faction 等）行为不一致，分类统计与「全链路同源」目标背离。
- **建议修复**：与 entity-sync 对齐——`|| "custom"` 后追加 `classifyWorldCategory` 重路由（排除 `character_relationship` / 元桶），或直接复用 `TYPE_TO_CATEGORY` + 分类器；至少把映射表类型收紧为 `Record<string, WorldCategory>` 并补充 15 类全覆盖。

---

### F2 ｜ P2 ｜ `WORLD_MODULES` / `CATEGORY_TO_MODULE` 是第二份手抄 15 类常量，与分类器标签不同源

- **文件:行**：`src/components/workspace/worldPanelData.ts:5-21`（模块表）、`:37-53`（映射）
- **现象**：UI 侧（WorldPanel 分类切换、LorebookEditDialog 下拉、pre-write-cards 标签）用的分类「键+中文标签+图标+描述」来自 `WORLD_MODULES`，而生成侧（globalPrompt / 装配引擎）用的是分类器的 `WORLD_CATEGORY_LABELS`。两套**同名不同词**的标签并存，且 `CATEGORY_TO_MODULE` 是弱类型 `Record<string, ModuleKey>`，**无编译期 15 类全覆盖约束**。
- **证据**：
  ```ts
  // worldPanelData.ts:5（标签例）
  { key: "geography", label: "地理地图", ... },
  { key: "faction",   label: "势力阵营", ... },
  // 分类器 world-category-classifier.ts:48-64
  geography: "🗺 地理", faction: "🏛 势力",
  ```
  `CATEGORY_TO_MODULE: Record<string, ModuleKey>`（`:37`）逐项手列 15 类，纯手写、不引用 `WorldCategory`。
- **复现路径**：若在 `ALL_WORLD_CATEGORIES` 新增一类但漏改 `WORLD_MODULES` → `LorebookEditDialog` 下拉（`LorebookEditDialog.tsx:113-115`）与 WorldPanel 模块列表静默缺该类，**且无 tsc 报错**（因为 `WORLD_MODULES` 是 `as const` 数组，与 `WorldCategory` 无类型绑定）。
- **建议修复**：`WORLD_MODULES` 的 `key` 类型改为 `WorldCategory`、补全校验测试断言「键集 == ALL_WORLD_CATEGORIES」；UI 标签优先复用 `WORLD_CATEGORY_LABELS`（或至少建立一处派生关系），消除两套中文标签漂移。

---

### F3 ｜ P2 ｜ `tool-registry.ts` 存在 4 处独立 enum 数组（agent 工具 schema）

- **文件:行**：`src/core/agents/tool-registry.ts:325, 352, 382, 446`（4 个 `enum: [...]` 各列 15 类），`:400-401, 462-463`（中文→分类映射 `CATEGORY_MAP`）
- **现象**：LLM agent 工具的 `category` 参数 schema 把 15 类手写进了 4 个不同的 enum 数组，且附两份中文映射。这些**全部不引用 `ALL_WORLD_CATEGORIES`**，属于又一份手抄源。
- **证据**：
  ```ts
  category: { type: "string", description: "分类筛选",
    enum: ["geography","faction","item","magic_system","technique","creature",
           "culture","history","law","currency","character_relationship",
           "fate_system","physics","public_system","custom"] }  // 出现在 325/352/382/446 共 4 处
  ```
- **复现路径**：在分类器增/改一类，这 4 处 enum 与 2 处 `CATEGORY_MAP` 不会收到任何编译或运行告警，agent 工具的描述与可选值会滞后，造成 LLM 与系统认知不一致。
- **建议修复**：把 enum 改为 `ALL_WORLD_CATEGORIES`（运行时数组可由该常量生成），中文映射统一指向分类器；或以单点 helper 生成工具 schema。

---

### F4 ｜ P2 ｜ 分类「联合类型」存在多份平行定义，未复用 `WorldCategory`

- **文件:行**：`src/core/types/index.ts:95-110`（`LoreCategory`）、`src/core/settings/parser.ts:99`（ParsedLoreEntry.category 联合）、对照权威 `src/lib/world-category-classifier.ts:22-25`（`WorldCategory`）
- **现象**：`LoreCategory` 与 `WorldCategory` 是两份内容相同的平行联合类型；`settings/parser.ts` 又有一份。类型层未复用权威源，增类需手动同步（虽在跨类型赋值时可能触发 tsc 报错，但类型定义自身无强制对齐）。
- **证据**：`LoreCategory` 行 95-110 逐项手写 15 类字符串字面量，与 `WorldCategory` 行 22-25 结构重复、彼此无引用。
- **复现路径**：重命名某分类（如 `magic_system`→`power_system`）时，需同步改 3 处类型 + 分类器 + 标签；任一处漏改只在类型交叉赋值处才可能暴露，纯类型声明本身不会告警。
- **建议修复**：`export type LoreCategory = WorldCategory;` 直接复用；`settings/parser.ts` 同样引用，从根上消灭类型层漂移。

---

### F6 ｜ P2 ｜ 装配引擎板块分组用 Map 插入序，与 canonical 15 类顺序不一致

- **文件:行**：`src/core/assembly/engine.ts:229-235`（`buildLoreSection`）、`:258-264`（`renderLoreEntries`）；对照 `src/core/sync-global-prompt.ts:178-185`（按 `ALL_WORLD_CATEGORIES` 顺序）
- **现象**：引擎用 `new Map<string, ...>` 按「首次出现顺序」分组，渲染顺序依赖触发序；而 globalPrompt 严格按 `ALL_WORLD_CATEGORIES` 顺序。同一批世界卡在「常驻/触发注入」与「globalPrompt 预编译」两处板块顺序不一致（非数据错误，体验/一致性）。
- **证据**：
  ```ts
  const grouped = new Map<string, typeof sorted>();
  for (const t of sorted) {
    const cat = ((t.entry as any).category as WorldCategory) || "custom";
    const key = WORLD_CATEGORY_SECTIONS[cat] ? cat : "custom";
    if (!grouped.has(key)) grouped.set(key, []);  // 顺序 = 触发序
    grouped.get(key)!.push(t);
  }
  ```
- **建议修复**：分组后按 `ALL_WORLD_CATEGORIES.indexOf(cat)` 排序再渲染，与生成侧顺序统一。

---

### F7 ｜ P2 ｜ emoji / 图标撞车（同视觉标识指向不同分类）

- **文件:行**：`src/lib/world-category-classifier.ts:50,63`（faction 与 public_system 都用 `🏛`）；`src/components/workspace/worldPanelData.ts:15,16`（currency 与 custom 都用 icon `gem`）
- **现象**：两个不同分类共享同一 emoji/图标，UI 与生成 prompt 中视觉难区分（纯边角体验问题，键名无漂移）。
- **证据**：
  ```ts
  faction: "🏛 势力",        // classifier.ts:50
  public_system: "🏛 公开体制", // classifier.ts:63（同 🏛）
  // worldPanelData.ts
  currency: { ..., icon: "gem" }, custom: { ..., icon: "gem" }  // 同 gem
  ```
- **建议修复**：给 public_system 换一个不与 faction 重复的 emoji；currency / custom 区分图标。

---

### F8 ｜ P2（边界/旁支）｜ 创意工坊预设使用独立 category 命名空间，与 15 类交叉

- **文件:行**：`src/app/api/presets/[id]/apply/route.ts:116,131,220`（写入 `worldview`/`story_progression`/`lorebook`）；对照 `LorebookEditDialog.tsx:113-115`、`src/core/agents/orchestrator.ts:606`（`STATIC_LORE_CATS`）
- **现象**：创意工坊预设把世界书词条写成 `category="worldview" | "story_progression" | "lorebook"`，**均不在 15 类内**。其中 `lorebook` 既不是 15 类、也不在 orchestrator 的 `STATIC_LORE_CATS`（仅含 worldview/story_progression）中：
  - 在 `buildGlobalPrompt` 的 15 类分组中无归属 → 被静默丢弃；
  - 在 `LorebookEditDialog` 下拉（`WORLD_MODULES` 键集不含 `lorebook`）中，`<select value="lorebook">` 无匹配 option → 编辑时分类框显示空白/错位。
- **证据**：
  ```ts
  // preset apply route.ts:220
  category: "lorebook",
  // orchestrator.ts:606
  const STATIC_LORE_CATS = new Set(["worldview", "story_progression"]); // 不含 lorebook
  ```
- **复现路径**：套用一个 `type:"lorebook"` 的预设 → 生成的词条 `category="lorebook"` → 打开编辑弹窗时分类下拉无选中项；该词条也不进 globalPrompt 世界板块。
- **建议修复**：要么把预设 `lorebook` 落库时归并到 15 类之一（如 `custom` 或按内容分类），要么在 `WORLD_MODULES` 增加 `lorebook` 键并在 globalPrompt 增加对应分组；明确「预设命名空间」与「15 类命名空间」的边界并在 UI 上区分。
- **说明**：此项属创意工坊特性与 15 类体系的交叉，非 15 类同源核心链路问题，列为边界观察。

---

## 已确认无问题（诚实边界）

以下内容经逐行核对，**确认已从权威源正确派生、无漂移、无静默漏网**，本轮无需改动：

1. **分类器权威源本身**：`ALL_WORLD_CATEGORIES`（15 项）、`WORLD_CATEGORY_LABELS`、`WORLD_CATEGORY_SECTIONS`（`world-category-classifier.ts:38-82`）键名拼写一致、类型 `Record<WorldCategory, ...>` 强制 15 类全覆盖；`WORLD_CATEGORY_SECTIONS` 由 `WORLD_CATEGORY_LABELS` 经 `split(" ")` 派生，非手抄。测试 `world-category-classifier.test.ts` 覆盖 15 类映射与分类逻辑。

2. **生成侧 globalPrompt**：`sync-global-prompt.ts:178-179` 中 `catOrder = ALL_WORLD_CATEGORIES`、`catLabel = WORLD_CATEGORY_LABELS`，**真正从权威源派生**（非硬编码）。历史注释中提到的「2 虚构分类 + 漏 7 类」硬编码已清除。

3. **装配引擎 section**：`engine.ts:36,215` 直接 `import { WORLD_CATEGORY_SECTIONS }`，键入 `WorldCategory`，覆盖 15 类；旧的「11/15 手抄 CATEGORY_SECTIONS」已替换。

4. **entity-sync 的 custom 兜底对 15 类无漏网**：`entity-sync.ts:47-62` 的 `TYPE_TO_CATEGORY` 覆盖 14/15 类（缺 `character_relationship`，而该类的职责本就由角色卡 `relationships` 承担，见 `:235` 显式排除 + 元桶 `character`/`unknown` 正确不落库）。其余不可信 type 经 `classifyWorldCategory` 重路由（`:232-238`），**15 类世界卡不会因兜底静默错归 custom**。

5. **lorebook POST 白名单**：`route.ts:18,38` 用 `Set(ALL_WORLD_CATEGORIES)` 校验，非法值 `badRequest` 400 拒绝；`asStr(..., { fallback: "custom" })` 的兜底值本身合法，不会误拦。

6. **pre-write-cards 完整性校验**：`route.ts:215-217` 的 `LORE_CHECK_CATEGORIES` 由 `ALL_WORLD_CATEGORIES` 派生（排除 `character_relationship`/`custom`，合理——前者走角色卡、后者非具体世界观分类），非手抄。

7. **分类关键词与边界裁决**：长词优先权重 + 并列最长词裁决 + 元桶降级（`world-category-classifier.ts:106-154`）逻辑自洽，测试覆盖角色互动 / 未知 / 货币 vs 器物 / 命劫 vs 雷劫 / 系统金手指等边界。

> 注：本复检**未改动任何源代码**，仅记录上述发现。F1、F5 为建议优先修复的 P1。
