# round-22 角色栏 UI 统一 + 去重/合并架构重做 — 方案（会议结论）

> 时间：2026-08-12 | 主持：千惠（tri）| 依据：两个只读探查子代理报告 + 核心文件通读
> 用户原话核心：统一 UI 栏位整洁大小；自动发现要"自然"识别小名/别称/称呼=同一人并直接合并，不要各建新人卡；伏笔/隐藏身份/马甲应独立卡正常写"他是马甲"、不合并；通过三路判断（①直接 ②后文揭露 ③大纲）找同一人；不要自动分类。

## 一、根因（已查清）

1. **脏标记污染全链路**：LLM 在实体名里直接输出 `🆕自动发现` / `待审` 等标记，`entity-auto-creator.ts:418` 建卡时 `name` 原样存 `entity.name`，下游所有启发式失效——`isHonorificVariant`（长度守卫 2~5，超长 false）、`coreTokenOf`（剥不掉后缀）、`resolveVariantTarget`（找不到正主）全判 false → 各建脏卡。
2. **两变体互不合并**：自动发现阶段只走 `resolveVariantTarget`（要求"变体 + 唯一**普通正主**"才合并）。"韩姓男子""韩先生"都是变体、都无正主 → 互不合并，各建卡。
3. **马甲会被错合**：若清洁名字，"迭戈·美第奇"经 `coreTokenOf` 的 `split("·")[0]` 得"迭戈"，反而会与"迭戈""迭戈先生"**错误合并**——比漏合更危险。
4. **纯名字维度**：`dedupeCharacters` 只喂角色卡名，无大纲/后文上下文，无法做"大纲写明 X 即 Y""后文揭露身份"判断。
5. **UI 不一致**：`CharacterRow` 硬编码 4 种字号 3 种圆角；缺共享徽章组件；工具栏 `px-1` 与行 `px-2` 错开 4px；`CharacterList.tsx:398` 用了未定义 token `--nv-warn`（应为 `--nv-warning`）。
6. **自动分类违规**：`dedupeCharacters` 末尾自动给薄弱卡打 `🎭 龙套` 标记 = 自动分类，与诉求冲突。

## 二、新架构设计

### 3.1 入库即规范化（清洗发现标记）— entity-auto-creator.ts
新增 `normalizeDiscoveryName(raw)`：用正则剥离 `🆕自动发现` / `（自动发现）` / `待审` 等名字内标记，trim，返回 `{ name, hadMarker }`。在 L346 之后应用；清洗后为空或 <2 字则 skip。
→ 效果："韩姓男子 🆕 自动发现" → "韩姓男子"；"待审 迭戈·美第奇 🆕 自动发现 待审" → "迭戈·美第奇"。"待审"作为 `reviewStatus:pending` 的 UI 状态保留显示，不作为名字污染。

### 3.2 自动发现阶段实时别名合并（含"两变体互并"）— entity-auto-creator.ts
增强变体→主卡解析，新增 `resolveDiscoveryMergeTarget(allNames, variantName)`：
- 若 `name` 是变体（honorific / 姓+描述 / 单字缩写）；
- 提取 surname，候选 = 同姓、≠name、非"明显不同人"的已有名；
- **候选唯一即合并**（无论候选是普通正主还是另一个变体）→ 把 `name` 追加进该卡 `aliases`，skip 建卡；
- 候选 ≥2 → 返回 null（歧义，建新卡，等后续 LLM/大纲判断）。
→ 效果：先有"韩姓男子"建卡；再来"韩先生"，同姓候选唯一 [韩姓男子] → 合并加别名。先有"迭戈"；再来"迭戈先生" → 合并加别名。

### 3.3 马甲 / 隐藏身份：含"·"独立建卡、不合并 — entity-auto-creator.ts
- 含 `·`/`•`/`・` 或明显"身份后缀"（X·家族名 / X·称号）的 name **不参与 3.2 自动合并**，独立建卡。
- 建卡时打 tag `🎭 隐藏身份（待确认）`，`background` 注明"疑似 [核心名] 的马甲/隐藏身份，待大纲或后文确认"。
- 后续若三路判断（3.4）证明同一人，再合并。
→ 效果："迭戈·美第奇"独立卡，不与"迭戈"错合。

### 3.4 三路判断（直接 / 后文 / 大纲）— character-dedupe.ts
`dedupeCharacters` 增取项目大纲/后文上下文注入 LLM：
- 取 `Project.globalPrompt` + `synopsis` + 已批准 `StoryNode.outline`（限制总字符，控成本）；
- 注入 `llmDetectSamePersonGroups` prompt，让 LLM 识别"大纲写明 X 即 Y""后文揭露身份"；
- **"·"马甲组**除非 LLM 高置信 + 大纲/后文证据明确，否则不自动合并（low → pending 待用户确认）。

### 3.5 不自动分类
- 移除 `dedupeCharacters` 末尾的自动龙套标记（`markedRockets` 逻辑），符合"不要自动分类"。
- 角色 `role` 维持默认 `"supporting"`（这是默认桶，非分类推断，保留）。

### 3.6 置信度与回滚保持
- `computeConfidence` high/low + `CharacterCardRevision` 快照回滚机制保持不变。
- 3.2 的"加 alias"是低风险追加操作（只 append，不丢内容），不强制快照；`dedupeCharacters` 的实质合并仍留快照。

## 三、UI 统一方案（任务 #30）
1. 新增 `src/components/ui/character-badges.tsx`：导出 `RoleBadge`(主角/配角)、`StatusBadge`(复用现有，扩 alive/dead)、`PendingBadge`(待审)、`TagChip`；统一 `text-[10px]`、`rounded-full`、固定 padding。
2. 新增 CSS token（globals.css 或 characterTokens.ts）：`--c-avatar:20px`、`--c-name:12px`、`--c-chip:9px`、`--c-badge:10px`、`--c-row-pad:8px`，消除硬编码魔法值。
3. `CharacterRow.tsx`：头像/姓名/标签/待审改引用 token + 共享组件；复选框加 `h-3.5 w-3.5` 定宽；若需展示主角/配角/状态，复用 `RoleBadge`/`StatusBadge`。
4. `CharacterFilters.tsx`：角色/状态 pill 复用 `RoleBadge`/`StatusBadge`（选中态用选中色），字号统一。
5. `CharacterToolbar.tsx`：`px-1`→`px-2` 与行对齐；按钮密度与行统一。
6. `CharacterList.tsx:398`：`--nv-warn`→`--nv-warning`。
7. `RightPanel.tsx:236` 工具箱徽章对齐 `TagChip` 风格。

## 四、文件级改动清单
| 文件 | 改动 |
|---|---|
| `src/lib/entity-auto-creator.ts` | 新增 `normalizeDiscoveryName`；`resolveVariantTarget` 增强为"两变体互并"；含·独立建卡打 `🎭 隐藏身份` 标记；保留 fire-and-forget dedupe |
| `src/core/character-dedupe.ts` | `dedupeCharacters` 注入大纲/后文；"·"马甲组不自动合并；移除自动龙套标记；缓存 key 升级戳 |
| `src/components/ui/character-badges.tsx` | 新增共享徽章组件 |
| `src/components/workspace/CharacterRow.tsx` | 引用 token + 共享组件；复选框定宽 |
| `src/components/workspace/CharacterFilters.tsx` | 复用共享徽章 |
| `src/components/workspace/CharacterToolbar.tsx` | `px-2` 对齐 |
| `src/components/workspace/CharacterList.tsx` | 修 `--nv-warn`→`--nv-warning` |
| `src/app/globals.css` | 角色栏尺寸 token |
| 单测 | 别名实时合并 / 两变体互并 / 含·不合并 / 大纲判断 / UI 字段渲染 |

## 五、边界 case 验收（新城 16 角色）
1. 韩姓男子 + 韩先生 → 合并为同一卡（aliases 含两者）✓
2. 迭戈 + 迭戈先生 → 合并 ✓
3. 迭戈·美第奇 → 独立卡 + `🎭 隐藏身份` 标记，不与迭戈合并 ✓
4. 韩立 + 韩雪 + 韩先生 → 韩先生歧义（≥2 同姓候选）→ 建卡等 LLM，不误并 ✓
5. 繁简（萧/蕭）→ 已归一不重复建 ✓
6. UI：16 卡栏位尺寸/字体/徽章一致，工具栏对齐 ✓

## 六、验证计划
- 单测：mock 角色集覆盖上述 6 case，断言 merge/alias/pending 结果。
- 门禁：`tsc --noEmit` 0 错 + `vitest run` 全绿。
- 推送：SSH over 代理隧道推 `huanweide/novel-forge`，线上验证新城项目。
- 版本：v2.0.18。

## 七、评审结论与定稿修正（2026-08-12 评审会）
评审 agent 挑出 1 个高风险（F 缓存）+ 若干中风险，均已修正入设计：

- **A 变体主卡副作用（中）**：3.2 实时合并仅在「唯一候选是 plain 名（非变体、不含·）」时加 alias；若候选也是变体/含·则**不自动合并**（建卡，等 dedupe 阶段处理），避免建出以变体名为 name 的主卡、破坏「主卡必为正名」不变量。
- **B ·马甲（低）**：保留 `computeConfidence` 对含·降 low→pending 机制，每轮 dedupe 重浮待确认；建卡时 `background` 结构化记「疑似核心名=X」线索；高置信+大纲证据合并时允许以全名为主（调整 `pickMain`）。
- **C 三路判断成本（中）**：注入上下文**截断 2–4k 字硬预算**；按组注入；含·组即便 LLM 高置信也要求大纲/后文出现显式证据串（「X 即 Y」「X 化名 Y」）才升 high，否则强制 low。
- **D 移除龙套（中）**：移除 dedupe 龙套自动标记后，同步更新 `CharacterToolbar.tsx:83` tooltip、`CharacterList.tsx:262/409` 文案（去龙套句）；`CharacterFilters` 仍兼容旧 🎭龙套 卡显示。
- **E UI 回归（低）**：`character-badges.tsx` 的 `StatusBadge` **必须 re-export 现有** `status-badge.tsx`（调用方 ChapterConfirmBar/OutlineTree），增量 props 保持六态签名兼容。
- **F 缓存 stale bug（高，必改）**：`dedupeGroupCache` key 额外拼接 `globalPrompt+synopsis+已批准 outline` 内容指纹，否则大纲/后文变化不触发重判，三路判断失效。
- **遗漏1 别名审计**：3.2 加 alias 至少写一条审计记录（`source=auto_alias`），便于追溯。
- **遗漏2 归一时间**：`normalizeDiscoveryName` 先清洗再判 <2 字；实体 `aliases` 列表也清洗标记。
- **遗漏3 单字名保护**：`isSurnameAbbrevOrDescriptor` 任意单字=变体，仅当项目存在同姓 plain 正主时才走合并，否则视为独立角色（安全优先，避免误并真单字角色「莫」「厉」）。
