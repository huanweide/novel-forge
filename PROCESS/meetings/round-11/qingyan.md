# Round 11 复验 — 青砚（检索与召回）

> 角色视角：实体名匹配（matchNameStrict / matchKeyword）、OOC 文本检测、lore 召回边界、实体自动建卡去重、knownNames 注入。
> 复验性质：**只读**；未修改任何源码/配置/文档，未跑 `tsc`、未 `git commit`。报告基于实际读到的代码与行号。

## 环境（HEAD、你读过的文件清单）

- **HEAD**：`b5901aa`（Round 10 记忆三件套回写；实现 commit `899a480` v0.46.73）。
- **读过并核对的关键文件**：
  - `src/app/api/agent/apply-extraction/route.ts`（Round 10 去重修复点，466 行）
  - `src/core/text/match.ts`（`matchKeyword` / `matchNameStrict` / `dedupSubstring` / `scoreKeyword`，199 行）
  - `src/core/babylore/recall.ts`（`recallContext`，宝宝流召回，91 行）
  - `src/core/assembly/trigger.ts`（`matchLoreEntries` + `collectTableKnownNames`，99 行）
  - `src/lib/entity-auto-creator.ts`（`isSimilarName` / `autoCreateEntities`，238 行）
  - `src/lib/entity-detector.ts`（`detectEntities` 命名实体 + 归属推断，447 行）
  - `src/core/agents/orchestrator.ts`（`matchLoreEntries(..., loreTables)` 接线，grep 确认）
  - `src/core/babylore/loop.ts:52`、`src/app/api/babylore/recall/route.ts:18`（recallContext 传 tables 确认）
  - `src/app/api/generate/outline/route.ts:94`（recallContext 传空表 `[]`，已标记）
  - `src/core/assembly/trigger.test.ts`（Round8 P0 回归测试，确认吞并依赖 `tables` 形参）
  - `CHANGELOG.md` / `src/lib/changelog-data.ts`（Round 10 v0.46.73、历史修复记载核对）

---

## 回归结论（Round 10 修复逐条 + 历史关键修复回流核查）

### Round 10（v0.46.73）建卡去重修复 — 已落地、逻辑正确、无新回归

| 目标 | 落地位置 | 结论 |
|---|---|---|
| G4 精确查重：`create` 前 `findFirst` 精确查重（name/title equals insensitive） | `route.ts:65-83`（`findExactDuplicate`），调用点 `route.ts:110`、`route.ts:204` | ✅ 生效。角色/世界书两条建卡路径均先走精确查重；角色创建还额外拦截了「与世界书条目重名」(`route.ts:128-132`)，避免跨类型重名卡。 |
| G5 变体去重：`isSimilarName` 繁简/错字变体去重 | `route.ts:86-92`（`isVariantDuplicate`），调用点 `route.ts:133-136`、`route.ts:209-212` | ✅ 生效。批次内 `variantNames` 同时喂入「已有角色名+世界书标题」(`route.ts:59`) 与「本批次已建名」(`route.ts:149/223`)，批内+批外去重闭环。 |
| 复用而非重复建卡 | `route.ts:113-127`（命中已有角色卡则补 timeline）、`route.ts:205-208`（命中则跳过） | ✅ 生效。 |

**Round 10 结论：两条去重链路（精确 + 繁简/错字变体）均真实接线到生产建卡路径，逻辑自洽，未发现新回归。**

### 历史关键修复回流核查 — 均无回流

| 历史坑 | 防护代码 | 核查结论 |
|---|---|---|
| 2字 CJK 角色名直接漏检（Round4/5 回归） | `match.ts:142-144`（`len===2 && keywordIsCjk → return true`） | ✅ 仍在。2字名直接子串命中，OOC/召回不再全漏检。 |
| 3字+ 最长匹配优先 + knownNames 吞并（Round6 P0-1） | `match.ts:150-176`；`recall.ts:34-49`、`trigger.ts:61-71` 注入 knownNames | ✅ 仍在。3字+ 直接子串命中，仅当紧后 CJK 且能拼出更长已知名才被吞并。 |
| 含数字≥3字关键词边界守卫（灭「2049年」误命中「12049年」，Round3） | `match.ts:54-77`（isPureDigit + 数字边界判定） | ✅ 仍在且正确。逐位置检查 `firstIsDigit&&beforeNum`、`lastIsDigit&&afterNum`，「12049年」内「2049年」被跳过；独立「2049年」正常命中。纯数字走 `WORDCHAR_RE` 含 0-9 的两侧重边界，同样防「2049」误中「120499」。 |
| OOC 单字角色名漏检（Round4） | `match.ts:128-138`（单字紧后非 CJK 前缀守卫） | ✅ 仍在。「云」在「云海」被拒、句尾「云」放行；不查前导，无回归。 |
| lorebook key 内 3字名误召回（Round7/8 P0） | `trigger.ts:61-71` 补入表格关键列值进 knownNames；`recall.ts:34-49` 同样补表值 | ✅ 仍在。生产路径确认传表：`orchestrator.ts:610`（`matchLoreEntries(..., loreTables)`）、`loop.ts:52`（`recallContext(..., tableShapes)`）、`recall/route.ts:18`（传 tables）。`trigger.test.ts:30-48` 回归用例通过。 |

---

## 新发现问题

### P0
**无。** 本轮未检出崩溃/越权/数据损坏类漏洞。两个建卡入口（apply-extraction、entity-auto-creator）均用 Prisma 参数化查询，无注入面；去重异常均 `catch` 后放行（Fail-open，属 P2 稳健性）。

### P1

#### P1-1 别名（aliases）未在去重中归一 —— 同义词漏去重 → 重复角色卡
- **症状**：已有角色卡「炎帝」含别名 `aliases:["萧炎"]`，用户随后提交新建角色「萧炎」（`suggestion:"create", isNew:true`）时，仍会建出一张独立的「萧炎」卡，造成同人双卡、召回/OOC 上下文被污染。
- **file:line**：
  - `route.ts:65-83`（`findExactDuplicate` 只查 `characterCard.name` / `lorebookEntry.title`，不查 `aliases`）；
  - `route.ts:86-92`（`isVariantDuplicate` 只比对 `variantNames`，而 `variantNames` 仅由 `name/title` 构成，`route.ts:59`）；
  - `entity-auto-creator.ts:142-180`（同样只比对 `existingNames`/`existingNameList`，未纳入已有卡的 `aliases`）。
- **根因**：去重候选集只含「主名」，未把已有实体的 `aliases` 一并并入比较。这是任务点名要查的「同义词未归一」边界遗漏。
- **建议改法**：查重前把当前项目所有角色卡/世界书条目的 `aliases` 也摊平进 `variantNames`/`existingNameList`；或在 `findExactDuplicate`/`autoCreateEntities` 中对 `aliases` 数组做 `hasSome` 查询。两处入口统一修。

#### P1-2 levenshtein≤1 对 3字名过松 —— 语义不同的实体被误并 → 漏建真实实体
- **症状**：世界书已有「青云宗」（宗门），AI 提议新建「青云山」（山脉）时，因 `levenshtein("青云宗","青云山")=1` 被判为「变体」而被跳过，**合法的独立实体丢失**（漏建档 + 后续该实体永不召回）。
- **file:line**：`entity-auto-creator.ts:109-120`（`isSimilarName`：长名 `return levenshtein(x,y) <= 1`）。
- **根因**：单字符替换在中文里常改变语义（宗/山、剑/刀）。当前阈值把「错别字变体」与「不同实体」混为一谈，偏向防重复卡，代价是漏建。属历史 deliberate 取舍，但**过度覆盖**会造成可感知的漏建。
- **建议改法**：3字+ 变体判等收紧——仅当「差异为繁简/全半角归一后单字不同」或「类型一致 + 编辑距离≤1」才并；跨语义（如 sect vs mountain）不建议自动并。至少应在 `autoCreateEntities` 中结合 `entity.type` 与已有实体 category 做一致性约束。优先级低于 P1-1（P1-1 是无条件硬漏洞），但确属漏建类 P1。

### P2

#### P2-1 已知更长名「吞并」导致 3字 key 漏召回（误吞合法子串）
- **file:line**：`match.ts:150-176`（3字+ 命中位置紧后 CJK 且 `knownNames` 中存在更长已知名 `hay.startsWith(nl, idx)` 时 `swallowed=true` → `return false`）。
- **症状**：词条 key「落霞城」(3字)、表格值「落霞城外」(4字) 同在项目；若正文**仅以「落霞城外」形式**出现（无独立「落霞城」字眼），该 location 词条不被召回——尽管「落霞城」确被提及。吞并逻辑无法区分「李星云剑法（异实体）」与「落霞城外（落霞城+方位）」。
- **建议**：吞并仅在「更长名属不同实体类别」或引入负向样本时成立；或放开「紧后 CJK 且子串即合法实体名」的命中（召回优先），以误召回为代价换召回完整。当前为「防误召回优先」，属可接受的保守策略，标记为 P2 边界。

#### P2-2 全半角 / 内部空格未归一 → 2字名漏去重 + 存储脏名
- **file:line**：
  - `entity-auto-creator.ts:109-120`（`isSimilarName` 仅 `trim()` + `toLowerCase()` + 短名 `normalizeTraditional`；不归一全半角 `３`↔`3`、`Ａ`↔`A`，不压内部空格）；
  - `route.ts:138-148` / `route.ts:213-222`（建卡前**未 `trim`**，直接 `name: c.name` 落库，可能写入带前后空格/全半角的脏名）。
- **症状**：① 2字全半角名在短名分支走 `normalizeTraditional` 不识别 → 漏去重建重卡；② 因精确查重 `equals insensitive` 不归一全半角，脏名入库后后续 `findExactDuplicate` 对干净名失效。`isSimilarName` 的 `trim` 能在当前请求兜住空格，但落库的脏名是潜在数据质量 + 后续查重隐患。
- **建议**：在 `isSimilarName`/比较前统一「全角→半角」并压缩内部空白；`route.ts` 建卡前对 `c.name`/`item.name` 做 `trim()`（与 `entity-auto-creator` 的 `entity.name.trim()` 对齐）。

#### P2-3 TRAD_TO_SIMP 仅 20 字，长名多繁体 / 缺字漏去重
- **file:line**：`entity-auto-creator.ts:51-80`（映射表仅 20 个高频字）；`entity-auto-creator.ts:116-118`（短名只做繁简归一，缺字即不识）。
- **症状**：「蕭動雲」(3繁) vs「萧动云」levenshtein=3>1 → 不相似 → 重复卡；「東方」(trad 東缺表) vs「东方」短名分支 `normalizeTraditional` 不识别 → 重复卡。
- **建议**：接入完整繁简映射（opencc 风格大表或 `npm:tinysegmenter`/现成繁简包），覆盖常用繁体。

#### P2-4 2字 CJK 无边界 → 嵌套名误召回（OOC 误报）
- **file:line**：`match.ts:142-144`（2字 CJK 直接 `return true`，无边界）。
- **症状**：角色「叶凡」与「苏叶凡」同在项目时，正文出现「苏叶凡」会误命中「叶凡」，召回无关角色卡 / 误触 OOC 上下文。属 Round5 为修 2字漏检所做的保守取舍，低频但存在。
- **建议**：2字命中时可加「整体词 ≠ 更长已知名」的负向判断（复用 knownNames 吞并思路），在不破坏 2字漏检修复前提下抑制嵌套误召回。

#### P2-5 并发双写重复卡（Fail-open 无唯一约束）
- **file:line**：`route.ts:108-148`、`entity-auto-creator.ts:166-234`（查重与建卡之间无事务/唯一约束保护）。
- **症状**：同一项目两个并发 apply-extraction / 自动建卡请求可能各自通过查重后各自 `create`，产生重复卡（查重只防「先查后建」单线程场景）。
- **建议**：对 `(projectId, name)`（及 lore 的 `(projectId, title)`）加 DB 唯一约束，建卡 `catch` `P2002` 转「跳过/复用」。

#### P2-6 吞并修复依赖调用方传 `tables`，缺参即回流
- **file:line**：`trigger.ts:49-71`（`matchLoreEntries(text, entries, maxResults, tables?)`）；`src/app/api/generate/outline/route.ts:94`（`recallContext(..., loreEntries, [])` 传空表）。
- **症状**：`trigger.test.ts:60-68` 已固化「不传 tables 则 3字 key 在更长词内仍误召回」。当前 orchestrator 正确传 `loreTables`，但 outline 路径传空表使该保护失活；未来任何新调用方漏传 `tables` 都会静默回流 Round8 P0。
- **建议**：在 `matchLoreEntries`/`recallContext` 内部对「更长名候选」至少兜底纳入 `entries` 自身的 keys（已含），并对表值缺失给出显式告警；outline 路径应传入项目真实 tables。

### P3

#### P3-1 两处去重实现重复且行为不一致
- **file:line**：`route.ts:65-92` 与 `entity-auto-creator.ts:142-180` 各写一套查重；后者**无跨类型查重**（角色「青龙镇」存在时仍可建同名 lore「青龙镇」），前者有。
- **建议**：抽一个共享 `dedupEntityName(projectId, name)` 工具（含 name/title/aliases + 跨类型 + 变体），两入口共用，消除不一致。

#### P3-2 数字守卫对「1949年1949年」连写、纯数字边界等无异常
- 复核 `match.ts:54-77` 各分支，`isPureDigit` 与「含数字≥3」分支边界判定一致，未引入新回归，记一笔确认无问题。

---

## 终止判定倾向（青砚透镜）

- **本透镜下是否还有 P0/P1？**
  - **P0：无。** 无崩溃/越权/数据损坏。
  - **P1：有 2 条，均属实但非阻塞性。**
    - **P1-1（别名漏去重）**：是明确的设计遗漏，会在真实项目中稳定产生同义词双卡，建议 **Round 12 必修**。
    - **P1-2（levenshtein≤1 过松误并漏建）**：历史 deliberate 取舍的过度覆盖，属「漏建真实实体」类，建议 **Round 12 收敛阈值**。
  - **P2：6 条**，多为边界/稳健性（吞并漏召回、全半角、繁简表不全、2字嵌套、并发、tables 缺参回流），建议在 Round 12 一并排期，但不阻断发版。
  - **P3：1 条**（去重实现重复/跨类型不一致），锦上添花。

- **Round 10 修复本身评级**：✅ 通过复验，无回流、无新回归。
- **终止建议**：当前可终止 Round 11 复验（Round 10 闭环成立）；下一轮（Round 12）青砚透镜优先项 = **P1-1 别名归一** + **P1-2 变体阈值收敛**，其次 P2-2/P2-6 的健壮性补强。
