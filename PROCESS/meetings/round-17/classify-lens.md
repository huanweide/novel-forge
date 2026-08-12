# 分类标签体系专项透镜报告

- **透镜职责**：全面体检 novel-forge 中「分类 / 标签 / 枚举」体系的一致性与前端可用性（只读诊断）。覆盖 schema 分类字段、枚举取值定义、前端编辑/展示/筛选 UI 的统一程度。
- **所属轮次**：round-17（MaxLoop 魔王系统 · 开会子 Agent 只读诊断）
- **日期**：2026-08-12
- **项目**：novel-forge（AI 长篇小说写作平台）
- **技术栈**：Next.js 16 + React 19 + TypeScript + Tailwind v4 + Prisma 7 + PostgreSQL(Neon) + Zustand
- **只读声明**：本报告所有结论均基于实际代码阅读（`schema.prisma` + `src/` 检索），未修改任何代码或文件。锚点以 `文件:行号` 给出，可逐条复现。

---

## 一、schema 分类字段全景（已核对）

| 字段 | 类型 | schema 注释的取值 | 实际权威定义位置 |
|---|---|---|---|
| `Project.genre` | `String[]` | 类型标签（自由文本） | `core/explore/types.ts:65` `GENRE_OPTIONS`（12）+ `PaperBoats.tsx:40` `GENRE_TO_TYPE`（~25）+ `PaperBoats.tsx:537` 演示数组（6） |
| `LorebookEntry.category` | `String` | `LoreCategory`（注释引用，无真实类型） | `src/components/workspace/worldPanelData.ts:5` `WORLD_MODULES`（15 值） |
| `LoreTable.category` | `String` | `person\|place\|item\|attribute\|timeline\|custom`（6 值） | schema:731；前端 `src/app/workspace/[projectId]/tables/page.tsx:32` 默认 `"custom"` 自由串 |
| `Preset.type` | `String` | `table_template\|story_progression\|style\|worldview\|character\|regex\|lorebook\|api_config` | `src/app/workshop/page.tsx:34` `TYPE_LABEL`（8 值，完整） |
| `Preset.tags` | `String[]` | 题材标签 玄幻/言情/科幻…（自由文本） | 无受控词表；前端仅展示/上传，无筛选 |
| `CharacterCard.role` | `String` | `CharacterRole`（注释引用，无真实类型） | `src/lib/character-parse.ts:10` `CHARACTER_ROLE_OPTIONS`（7 值） |
| `CharacterCard.tags` | `String[]` | 自由文本 | 无受控词表；前端有按 tags 过滤（角色列表）但词表自由 |
| `Rule.category` | `String` | `writing\|world\|character\|style\|custom` | `src/components/workspace/RulesPanel.tsx:16` `CATEGORY_LABELS`（5 值） |
| `Storyline.type` | `String` | `main\|side` | UI 实际多一值 `thread`：`src/components/workspace/StorylineWorkbench.tsx:18,884` |
| `PendingCommitment.itemType` | `String` | `foreshadow_recovery\|character_arc\|plot_turn\|user_note`（注释在 `PendingItem` 上） | 前端无编辑/筛选 UI（`ForeshadowingPanel` 不暴露 itemType） |
| `ConsistencyFact.category` | `String` | `character\|world\|plot\|relationship` | `src/components/workspace/ConsistencyPanel.tsx:12` 与 `src/core/consistency/extractFacts.ts:16` 各定义一份 |
| `WorldCategory`（自动填表分类器） | TS 类型 | 15 值 | `src/lib/world-category-classifier.ts:22` |

**核心结论**：novel-forge 的"分类/标签"在 DB 层全部是 `String`/`String[]`（无 Prisma native enum），取值约束完全依赖前端手抄的常量数组与 LLM 提示词。历史上曾为"世界卡分类"做过一次统一（`world-category-classifier.ts` 的 15 值 + 类型强制覆盖），但**仅覆盖世界书词条这一支**，其余分类体系（LoreTable、genre、role 展示、规则、storyline、preset.tags）仍处于多源手抄、互不同步的状态。

---

## 二、发现清单

### F-01 · [P0 阻断] 世界分类体系存在 4+ 套互不兼容的 taxonomy，同一"世界设定"要学两套不通约词汇

- **文件:行号**：
  - `prisma/schema.prisma:179`（LorebookEntry.category，注释 `LoreCategory`）
  - `prisma/schema.prisma:731`（LoreTable.category：`person|place|item|attribute|timeline|custom`）
  - `src/components/workspace/worldPanelData.ts:5-21`（`WORLD_MODULES`，15 值：geography/faction/item/magic_system/technique/creature/culture/history/law/currency/custom/fate_system/physics/public_system/character_relationship）
  - `src/lib/world-category-classifier.ts:22-25`（`WorldCategory`，15 值，与 WORLD_MODULES 同源对齐）
  - `src/app/api/import/parse/route.ts:406`（导入提示词手抄 `geography|faction|magic_system|history|culture|creature|item|custom`，仅 8 值）
- **现象描述**：「世界书」被拆成两种存储模型——词条（`LorebookEntry`，15 分类）与结构化表格（`LoreTable`，6 分类）——二者分类键**几乎不重叠**（唯一交集是 `item`）。用户面对同一本世界设定，在词条里用 `geography`，在表格里却要用 `place`；词条里没有 `person/attribute/timeline`，表格里没有 `faction/magic_system/technique/...`。此外自动填表分类器（`WorldCategory`）与导入提示词又各手抄了一份，取值数量还不一致（15 vs 8）。
- **根因推测**：世界书功能分两期演进（先词条、后结构表），各自定义分类；自动填表链路独立写分类器；导入功能是后期手抄提示词，未引用权威源。`schema.prisma` 的注释（"LoreCategory"）指向一个**并不存在的类型**，说明早期设想用枚举但从未落地。
- **建议修法**：确立 `WORLD_MODULES`（15 值）为"世界分类"唯一权威源；`LoreTable.category` 与 `LorebookEntry.category` 共用同一套键（或明确映射关系）；导入提示词改引用 `ALL_WORLD_CATEGORIES` 而非手抄；修正 schema 注释，移除并不存在的 `LoreCategory` 引用。

### F-02 · [P1 重要] `LORE_COLORS` 仅覆盖 15 个世界分类中的 11 个，4 类实体无颜色

- **文件:行号**：`src/core/entity-highlighter.ts:20-32`
- **现象描述**：`LORE_COLORS` 只有 `faction/item/geography/magic_system/technique/creature/culture/history/law/currency/custom` 共 11 个键。**缺失** `fate_system`、`physics`、`public_system`、`character_relationship`。这 4 类世界书实体在正文高亮、图例着色时 `LORE_COLORS[category]` 为 `undefined`，颜色回退/丢失。
- **根因推测**：`LORE_COLORS` 手抄，未与 `WORLD_MODULES` / `ALL_WORLD_CATEGORIES` 同源。历史上新增 `fate_system/physics/public_system/character_relationship` 4 类（见 `world-category-classifier.ts` 注释 Round-5 修复）时，`LORE_COLORS` 漏改。
- **建议修法**：由 `WORLD_MODULES` 派生 `LORE_COLORS`（仿 `WORLD_CATEGORY_SECTIONS` 的 `Record<WorldCategory,{emoji,label}>` 派生思路），用 TypeScript 类型强制覆盖全部 15 类，新增分类时 tsc 直接报错。

### F-03 · [P1 重要] `ChapterEntitiesPanel` 仅识别 8/15 世界分类，其余 7 类被吞入"其他"桶

- **文件:行号**：`src/components/workspace/ChapterEntitiesPanel.tsx:30-41`
- **现象描述**：`buildGroups` 的 `groupDefs` 仅定义了 `faction/item/geography/magic/technique/creature/culture/history` + 兜底 `other`。`law/currency/custom/fate_system/physics/public_system/character_relationship` 共 7 类**无专属分组**，所有实体落入 `other`（label "其他"），丢失语义分组与正确配色。此外分组 `key: "magic"` 与 category 值 `"magic_system"` 不一致（仅靠 `match: (m) => m.category === "magic_system"` 勉强纠正）。
- **根因推测**：同 F-02，分组定义手抄、与 `WORLD_MODULES` 不同源；`magic` 的 key 命名漂移是早期另起的别名。
- **建议修法**：分组由 `WORLD_MODULES` 派生，消除 7 类遗漏；统一 key 命名与 category 值一致。

### F-04 · [P1 重要] 角色 `role` 有集中定义，但 3 处展示 UI 各写各的硬编码标签，导致部分角色被错标

- **文件:行号**：
  - 权威源：`src/lib/character-parse.ts:10-18`（`CHARACTER_ROLE_OPTIONS`，7 值：protagonist/antagonist/supporting/mentor/love_interest/catalyst/background）
  - `src/components/dissect/DissectDimensions.tsx:133-138`（仅处理 protagonist/antagonist/mentor/supporting）
  - `src/components/editor/ContextPreview.tsx:414`（仅 protagonist/antagonist 走特殊渲染）
  - `src/components/editor/ImportWizard.tsx:964`（仅 protagonist/antagonist/supporting）
- **现象描述**：`CHARACTER_ROLE_OPTIONS` 是规范的 7 值列表，但三个展示组件没有复用它，而是各自写 `role === "x" ? "标签" : ...` 三元表达式。结果：`love_interest`/`catalyst`/`background` 三类角色在 `DissectDimensions` 全部落到默认 `●配角`（**错误标签**），在 `ContextPreview` 无区分，在 `ImportWizard` 回退为"配角"。新增一个角色类型时，这 3 处必然漏改。
- **根因推测**：展示组件图省事直接内联三元，未引入 `role → 中文 label` 的单一映射（如 `CHARACTER_ROLE_LABELS`）。
- **建议修法**：导出 `CHARACTER_ROLE_LABELS: Record<string,string>`，三处统一用 `CHARACTER_ROLE_LABELS[r.role] ?? r.role`（或 `find`），消除硬编码三元。

### F-05 · [P1 重要] `genre`（类型）存在 3 套互不同步的列表，且 `Project.genre`(数组) 与 `buildConfig.genre`(单串) 双轨脱节

- **文件:行号**：
  - `src/core/explore/types.ts:65-67`（`GENRE_OPTIONS`，12 值：玄幻/仙侠/都市/科幻/历史/言情/悬疑/武侠/奇幻/末世/游戏/军事）
  - `src/components/home/PaperBoats.tsx:40-47`（`GENRE_TO_TYPE`，~25 键映射，含 推理/灵异/恐怖/谍战/爱情/田园…）
  - `src/components/home/PaperBoats.tsx:537`（演示数据硬编码 6 值数组：仙侠/玄幻/科幻/悬疑/言情/历史）
  - `src/components/workspace/BuildConfigDialog.tsx:85-86`（genre 以**单字符串**写入 `buildConfig.genre`）
  - `prisma/schema.prisma:16`（`Project.genre` 为 `String[]`）
- **现象描述**：(1) 三个 genre 列表互不同步：`GENRE_OPTIONS` 含"末世"但 `GENRE_TO_TYPE` 无此键 → 首页船型回退为 `drift`；`GENRE_TO_TYPE` 的多数键（推理/灵异/恐怖/谍战…）在下拉里根本没有选项。(2) `Project.genre` 字段是 `String[]`，但"探讨模式"配置 `BuildConfigDialog` 用单字符串 `buildConfig.genre` 存储，首页 `PaperBoats` 读的是 `Project.genre` 数组（`PaperBoats.tsx:49` 的 `for (const g of genre)`）。两条数据通路不互通，用户在配置中心选的题材不会反映到首页船型。
- **根因推测**：题材列表多处手抄无单一源；genre 同时在"项目主表数组"和"配置 JSON 单串"两种结构里表达，缺乏统一契约。
- **建议修法**：以 `GENRE_OPTIONS` 为唯一权威并派生 `GENRE_TO_TYPE`；统一 `Project.genre` 为数组，配置中心的题材改为多选并回写 `Project.genre`。

### F-06 · [P2 轻微] `Storyline.type` schema 注释仅列 `main|side`，但 UI 实际持久化第三种值 `thread`

- **文件:行号**：`prisma/schema.prisma:437`；`src/components/workspace/StorylineWorkbench.tsx:18`、`884`、`703`
- **现象描述**：schema 注释写 `type String @default("side") // "main" | "side"`，但 `StorylineWorkbench` 把 `type` 当成 `"main" | "side" | "thread"` 三元（`thread`=伏笔），且下拉 `:884` 提供 `<option value="thread">伏笔</option>` 可被选中持久化。即 DB 里实际存在 schema 注释未声明的第三值。
- **根因推测**：`thread`（伏笔类故事线）是后期功能（`WORK_REPORT-故事线三级架构-thread伏笔类-#223`），schema 注释未同步更新；`type` 为自由 `String` 无约束，可写入任意值。
- **建议修法**：更新 schema 注释为 `main|side|thread`（或以注释明确"可扩展"）；建议把 storyline 类型纳入统一分类治理，避免再次出现游离值。

### F-07 · [P2 轻微] `Preset.tags`（题材标签）为自由文本、无受控词表、无筛选 UI → 题材检索形同虚设

- **文件:行号**：`prisma/schema.prisma:774`；`src/app/workshop/page.tsx:283`（上传切分）、`:443`（展示）、`:21-31`（`TABS` 仅按 `type` 筛选）
- **现象描述**：`Preset.type` 有完整 `TYPE_LABEL` + `TABS` 筛选（8 类，覆盖齐全，是本次体检中**正面样板**），但 `Preset.tags`（schema 注释举例 玄幻/言情/科幻）是纯自由 `String[]`，前端既没有受控词表（同义不同词无法归一），也没有按 tags 过滤的入口——tags 只能看、不能搜。用户无法"按题材找预设"，注释承诺的"题材标签"能力未落地。
- **根因推测**：tags 被当作开放标签，未接入受控枚举，且无筛选交互。
- **建议修法**：题材标签接入受控词表（可复用 `GENRE_OPTIONS`）；workshop 增加 tags 多选筛选器。

### F-08 · [P2 轻微] `ConsistencyCategory` 类型被重复定义两份，未来必漂移

- **文件:行号**：`src/components/workspace/ConsistencyPanel.tsx:12`；`src/core/consistency/extractFacts.ts:16`
- **现象描述**：`export type ConsistencyCategory = "character" | "world" | "plot" | "relationship"` 在两处各定义一次。当前值一致，但两份独立维护，与 `world-category-classifier.ts` 注释里记录的 Round-2/5 教训（"多源漂移"）同构——任何一处增删类，另一处不会报错。
- **根因推测**：类型随组件/核心逻辑各自声明，未抽到共享类型文件。
- **建议修法**：抽到单一类型模块导出，两处 `import`。

### F-09 · [P2 轻微] 规则 `Rule.category` 自成 5 值 taxonomy，与世界分类命名重叠但取值独立

- **文件:行号**：`prisma/schema.prisma:550`；`src/components/workspace/RulesPanel.tsx:16-18`（`CATEGORY_LABELS`：writing/world/character/style/custom）
- **现象描述**：规则分类含 `world`/`character`，与世界书/角色的分类概念**命名重叠但取值体系完全独立**（规则是"写作约束"维度，本身可接受），用户需在"规则分类"与"世界分类"两套之间切换心智。属设计边界模糊而非硬 bug。
- **根因推测**：规则模块独立演进，未在世界分类治理中标注其归属。
- **建议修法**：在统一分类治理文档中显式区分"约束维度（规则）"与"内容维度（世界/角色）"，避免命名混淆；如未来收敛，可把 `Rule.category` 也并入统一分类管理器。

### F-10 · [P2 轻微] `PendingItem.itemType` 分类在 DB 存在但前端完全不暴露（不可见/不可筛）

- **文件:行号**：`prisma/schema.prisma:702`（`itemType: foreshadow_recovery|character_arc|plot_turn|user_note`）；`src/components/workspace/ForeshadowingPanel.tsx`（全文件无 `itemType` 引用）；`src/core/pipeline/post-processor.ts:474`（仅后端写 `user_note`）
- **现象描述**：伏笔/承诺追踪（`PendingItem`）的 `itemType` 是一个有 4 值定义的分类，但前端 `ForeshadowingPanel` 既不编辑也不按 `itemType` 分组/筛选，用户看不到"这是伏笔回收 / 角色弧光 / 剧情转折 / 用户笔记"的区分；分类完全由后端启发式写入。
- **根因推测**：该表由自动填表/蒸馏链路写入，前端只做"列出+闭环"，未把 `itemType` 作为用户可见维度。
- **建议修法**：在伏笔面板增加 `itemType` 维度的展示与筛选（`foreshadow_recovery/character_arc/plot_turn/user_note`），让用户能按类型管理承诺。

---

## 三、分类标签体系优化 · 优先级建议（按 风险 × 收益 排序）

1. **[最高优先级] 确立"世界分类"单一权威源，合并 LorebookEntry / LoreTable / 自动填表分类器 / 导入提示词四套 taxonomy（对应 F-01/F-02/F-03）**。
   风险：当前"同一世界设定两套不通约词汇"直接造成用户认知混乱与数据不可比；收益：一次性消除 4 套漂移、修复 4 类实体无颜色 + 7 类被吞入"其他"两个衍生 bug。建议以 `WORLD_MODULES`（15 值）为权威，`LORE_COLORS`/`ChapterEntitiesPanel` 分组/`ALL_WORLD_CATEGORIES`/导入提示词全部由其派生。

2. **[高优先级] 统一 `genre` 题材数据源并打通 `Project.genre` 与 `buildConfig.genre`（对应 F-05）**。
   风险：3 套列表互不同步 + 数组/单串双轨，导致首页船型与配置中心题材错位、用户选了题材却不生效；收益：题材选择端到端一致，且为 Preset.tags 复用同一词表铺路。

3. **[高优先级] 角色 `role` 全量复用 `CHARACTER_ROLE_OPTIONS` 的 label 映射（对应 F-04）**。
   风险：当前 `love_interest/catalyst/background` 三类角色被错标为"配角"，且新增角色类型必在三处漏改；收益：改动小、覆盖全、消除展示错标。

4. **[中优先级] 受控词表化自由标签 + 补齐筛选 UI（对应 F-07/F-10）**。
   包括 `Preset.tags` 接入 `GENRE_OPTIONS` 受控词表并加筛选、`PendingItem.itemType` 在伏笔面板可见可筛、`CharacterCard.tags` 在角色列表已有过滤但词表自由（可统一）。收益：让"标签"真正可用于检索而非仅展示。

5. **[中低优先级] 收敛"注释即枚举"的漂移面（对应 F-06/F-08/F-09）**。
   把 `ConsistencyCategory`、`Storyline.type`、`Rule.category` 等从手抄字符串/重复类型收敛到共享类型与统一分类管理器，更新 schema 注释使其与运行时一致（移除并不存在的 `LoreCategory`/`CharacterRole` 引用）。收益：长期维护成本下降，新增分类有类型护栏。

---

### 附：正向样板（本轮体检中值得保留的做法）
- `Preset.type`：`TYPE_LABEL`（`workshop/page.tsx:34`）集中且覆盖 8 值齐全，`TABS` 筛选完整——是"枚举 + 标签 + 筛选"统一落地的好范例，建议其它分类治理参照此模式。
- `world-category-classifier.ts` 的 `WORLD_CATEGORY_LABELS`/`WORLD_CATEGORY_SECTIONS` 用 `Record<WorldCategory, X>` + 类型强制覆盖全部 15 类，从机制上杜绝多源漂移——证明本项目已有成熟范式，问题在于**未推广到其它分类**。
