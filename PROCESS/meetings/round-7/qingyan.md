# 青砚 · Round 7 L1 只读诊断（文本检索/匹配/高亮透镜）

> 日期：2026-08-04 ｜ 只读复验 Round 6（v0.46.69）青砚两项修复 + 挖掘新坑
> 审查文件：`src/core/text/match.ts` `match.test.ts` `src/lib/entity-auto-creator.ts` `entity-auto-creator.test.ts` `src/core/entity-highlighter.ts` `src/core/babylore/recall.ts` `src/core/assembly/trigger.ts`
> 约束：未改任何源码/CHANGELOG/MEMORY，仅产出本报告。

---

## 一、Round 6 复验结论（本透镜修复是否过关）

**结论：Round 6 青砚两项修复均真实生效，无功能回退。**

- **P0-1（matchNameStrict 3字+ 改最长匹配优先）— 过关。**
  - `match.ts:128-154`：3字+ 撤销 Round5 前缀守卫，改直接子串命中；仅当命中位紧后 CJK 且 `knownNames` 中存在从该位起更长的已知名时才被吞并。
  - 手工核验：「李星云看见」「碎玉轩内」常规行文恢复命中 ✅；「李星云剑法」遇 `knownNames:["李星云剑法"]` 被吞并为 false ✅。
  - `recall.ts:34-49`、`trigger.ts:76-79` 均已正确传入 `knownNames` 候选集合 ✅。
  - `match.test.ts` 21 项全绿，含最长匹配两条用例（line 99-106）。
- **P1（entity-highlighter 补介词头边界）— 过关。**
  - `entity-highlighter.ts:189-191`：`isHeadBoundary` 已并入介词（在/于/为/从/到/让/使/叫）+ 连词集，「在萧炎」类前置场景可高亮 2字名 ✅。

> 运行验证：`npx vitest run match.test.ts entity-auto-creator.test.ts` → 2 文件 25 测试全过。

---

## 二、新坑（按严重度分组）

### P0（功能错误）
**无。** Round 6 两项修复逻辑正确，未发现 P0 级回归。

### P1（明显缺陷）

**P1-1 · OOC 已知名集合缺词条文，3字角色名在更长词条文内误命中（Round 6 引入的误报回归）**
- 位置：`src/core/assembly/trigger.ts:76-79` + `src/core/text/match.ts:128-154`
- 现象：Round 6 撤销 3字前缀守卫后，`findCharacterByName` 的 `knownNames` 仅含**角色名+别名**，**不含世界书/表格名**。若某 3字角色名是更长**词条文**的前缀（如角色「李星云」、词条文「李星云剑法」），文本出现「李星云剑法」时因 `knownNames` 无该词条 → 不被吞并 → `matchNameStrict` 返回 true → OOC 误报「李星云」已出场（Round5 前缀守卫本不会命中）。
- 严重度：P1（R6 直接引入的误报，与「灭误命中」目标相悖；仙侠「XX剑法/XX诀」以角色命名极常见）。
- 建议：OOC `knownNames` 同时并入 lorebook 的 `keys` 与表格关键列值（或传入统一实体名集合），使吞并保护覆盖词条侧更长名。

### P2（优化 / 已知坑）

**P2-1 · entity-auto-creator 长名分支未繁简归一，全繁体 3字名静默入库重复（R6 已知坑未修）**
- 位置：`src/lib/entity-auto-creator.ts:108-119`（长名走 `levenshtein<=1`，未先 `normalizeTraditional`）+ `:51-71`（`TRAD_TO_SIMP` 仅 ~22 字、覆盖不全）
- 现象：手工核验 `levenshtein("青龍鎮","青龙镇")=2`，故 `isSimilarName` 返回 false → 全繁体 3字名会被当成新实体写入 DB，造成重复词条/角色卡。现有测试 `entity-auto-creator.test.ts:19-21` 用「青龍镇」（混繁体，仅 龍1 字不同，距离=1）通过，**给假绿**，未覆盖全繁体场景。
- 严重度：P2（R6 已列为 P2 排期；但会污染 DB，建议尽早修）。
- 建议：长名分支先 `normalizeTraditional(x/y)` 再算 `levenshtein`；并扩充 `TRAD_TO_SIMP`（滅/戰/關/東/無/後/實/聲/劍/靈/寶/問/開/與…）。

**P2-2 · entity-highlighter 介词头边界修复零测试覆盖；3字+ 名完全无边界检查**
- 位置：`src/core/entity-highlighter.ts:189-194`（无 `findEntitiesInText` 单测文件存在）+ `:193`（3字+ 名 `passesBoundary` 恒 true）
- 现象：
  1. R6 P1 的「在萧炎」高亮修复**没有任何单测**（全仓无 `findEntitiesInText` 测试），回归无护栏。
  2. 设计取舍：3字+ 名不做头/尾边界检查（为修复召回漏检），当更长实体名未注册时，「碎玉轩」可能在「碎玉轩内某事」中段被高亮——属可接受但建议知晓。
- 严重度：P2（测试缺口 + 文档化取舍）。
- 建议：补 `findEntitiesInText` 单测，覆盖「在萧炎」高亮、与「李星云剑法」最长名优先占用。

**P2-3 · recall/trigger 的 knownNames 随规模增长，吞并判定为 O(hits × |knownNames|)**
- 位置：`src/core/babylore/recall.ts:34-49`、`src/core/assembly/trigger.ts:76-79`、`src/core/text/match.ts:138-146`
- 现象：每次 `matchNameStrict` 命中每位都遍历全量 `knownNames`（词条所有 keys + 表关键列值）。大项目（数百词条/数千行表）下 OOC/召回可能随文本与词条数二次增长。当前典型规模无碍，但属潜伏性能隐患。
- 严重度：P2（优化）。
- 建议：将已知名按首字/前缀建索引（如 Map<首字符, name[]>），避免全量线性遍历。

---

## 三、复验小结
| 项 | 结果 |
|---|---|
| R6 P0-1 3字+ 最长匹配优先 | ✅ 过关，逻辑+测试双验证 |
| R6 P1 介词头边界高亮 | ✅ 过关（代码验证） |
| 新 P0 | 无 |
| 新 P1 | 1（OOC knownNames 缺词条名 → 误报回归） |
| 新 P2 | 3（长名未归一/去重假绿、高亮零测试、knownNames 性能） |
