# 青砚 · Round 5 L1 只读复验报告

- 角色：股东·青砚（玄幻大世界 200+ 词条；透镜=三卡检索词边界 + 召回注入 + 自动建卡去重 + 禁词扫描）
- HEAD：v0.46.67（commit 0a62a1f）
- 方法：Read/Grep/Glob 读源码 + `SAFE_DELETE_DISABLE=1 npx vitest run src/core/text`（12/12 通过）+ 内联 tsx 实测 matchNameStrict 行为（仅读、未落盘任何文件）
- 铁律：未改任何源码/测试/changelog/配置；仅此报告。

---

## ① P0 — 2字名闭边界过度收紧，OOC/召回在最常见名长上几乎「不命中」（Round 4 回归）

**证据**
- `src/core/text/match.ts:96-102` `isClosedBoundary` 要求匹配处「前后字符若存在，都不是 CJK」；
  `src/core/text/match.ts:118-125` 对 `len===2 && keywordIsCjk` 套用此闭边界过滤，任一处闭边界才 return true。
- `src/core/assembly/trigger.ts:69` `findCharacterByName` 已接线 `matchNameStrict`（OOC 角色名检测）。
- tsx 实测（连续中文正文）：
  - `matchNameStrict('叶凡怒喝','叶凡')` → **false（漏检）**
  - `matchNameStrict('他喊叶凡','叶凡')` → **false（漏检）**
  - `matchNameStrict('村头叶凡走过','叶凡')` → **false（漏检）**
  - 仅 `matchNameStrict('叶凡。','叶凡')` → true（句尾接标点才命中）

**现状**：中文无空格，2字名在正文里几乎总被 CJK 前后包围 → 闭边界永不成立 → 玄幻最常见的2字角色名（萧炎/叶凡/林动/云澈…）在 OOC 检测与 worldbook 召回中基本不命中。这是 Round 4「灭尾随误命中」的**过度修正**：把 `matchKeyword` 原有的「任一侧边界(`||`，match.ts:69)」改成了「两侧都闭边界」，对2字名是净回归。

**期望**：2字名在句首/句中/句尾（任一侧为边界，或被 CJK 夹住）均应按 `matchKeyword` 的「任一侧边界」语义命中。

**修法**：`match.ts:118-125` 的 `len===2` 分支**不再套用 `isClosedBoundary`**，直接 `return base`（即沿用 `matchKeyword` 的 `任一侧边界`）；闭边界守卫仅保留给 `len===1`（match.ts:104-112，单字仍需两侧非CJK 灭「林」in「森林」）。代价是重现极个别「李星」前缀伪命中（李星 in 李星云剑法），但其危害（多召回一段上下文）远小于漏检角色名导致 OOC 失检/设定断裂。

---

## ② P1 — 3字关键词未加闭边界，且 changelog 旗舰示例自相矛盾

**证据**
- `src/core/text/match.ts:55` `len>=3 && !isPureDigit → return true`；`:116-126` `len>=3` 直接 `return base`，**完全不调用 `isClosedBoundary`**。闭边界仅作用于 `len===2`。
- `src/lib/changelog-data.ts:33、:54` 声称「灭『李星云剑法』误命中『李星云』」。但『李星云』是 **3字**，恰落在未受闭边界保护的分支。
- tsx 实测：`matchNameStrict('李星云剑法','李星云')` → **true（仍误命中）**，与 changelog 声明直接冲突。

**现状**：3字名作为更长词前缀（功法名/地名复合，如「李星云剑法」「苍穹山脉」）仍按 len≥3 直命中被误召回；同时 changelog 把修复范围写成覆盖该 3字示例，属声明与实现不符。

**期望**：要么真正治理3字前缀误召回，要么把 changelog/注释的修复范围明确收敛为「2字闭边界」。

**修法（二选一）**：
- (a) 若需治理：对 `len===3 && keywordIsCjk` 增加「匹配处**紧后字符非 CJK**」的前缀守卫（仅防前缀，不要两侧闭边界，否则会误杀「青龙镇坐落」这类合法3字名后接CJK）；
- (b) 否则在 `changelog-data.ts:33/54` 与 `match.ts:76-85` 注释中把修复范围改写为「CJK 2字闭边界 + 单字闭边界」，删除 3字示例的误导措辞。

---

## ③ P2 — matchNameStrict 零单测覆盖（Round 4 核心函数无回归护栏）

**证据**
- `src/core/text/match.test.ts:2-7` 仅 import `isCjkChar / matchKeyword / scoreKeyword / dedupSubstring`，**未覆盖 `matchNameStrict`**。
- `SAFE_DELETE_DISABLE=1 npx vitest run src/core/text` → 12/12 通过，但全部针对旧函数；`matchKeyword` 未被改动，故「既有测试是否被新增逻辑影响」= **无影响**。
- 然而 Round 4 的核心新增函数 `matchNameStrict`（含 ① 的过度收紧 bug）**没有任何自动化覆盖**，后续改动极易再次静默退化。

**现状**：验证 ①/②/③ 的边界组合（单字闭边界、2字连续中文命中、3字前缀、纯数字边界、繁简不等）全靠手测，无回归网。

**修法**：在 `match.test.ts` 补 `describe("matchNameStrict")`：单字「云」在乌云/句尾/前接数字各用例；2字「叶凡」在叶凡怒喝/他喊叶凡/村头叶凡走过（按 ① 修复后均应 true）、星云 in 李星云剑法（false）；纯数字 2049 独立 true / 120499 内 false。

---

## ④ P2 — 自动建卡：2字繁简/错字变体不去除重（玄幻最常见名长仍建重卡）

**证据**
- `src/lib/entity-auto-creator.ts:76-85` `isSimilarName`：长度差>2 否；**`if (x.length<=2 || y.length<=2) return false;`** —— 短名仅精确匹配，放弃相似度去重。
- 调用点 `:141` `existingNameList.find(en => isSimilarName(en, name))` 用于跳过重名。
- 后果：玄幻最常见的2字名，繁简变体（萧炎/蕭炎、林动/林動、云澈/雲澈）或错字变体（叶凡/叶帆 编辑距离1）**会各建一张卡**，污染 200+ 词条大世界；而 ≥3字（青龙镇/青龍镇）能正常去重。

**现状**：注释 `:7-8` 称已「灭繁简/错别字变体重复」，但只对 ≥3字生效，2字名是明确缺口。

**修法**：对 ≤2字名在 `isSimilarName` 中先做**繁简归一化**再比较（归一后相同即判重复），保留「归一后仍不同才不并」以避开「白云/白衣」误并；或在归一化基础上允许编辑距离≤1。需配套单测覆盖 萧炎/蕭炎、叶凡/叶帆。

---

## 附：其他已收敛/备注项（非主条目）
- ✅ **trigger OOC 不再暴力 includes**：`trigger.ts:69` 已用 `matchNameStrict`（原 `:68` 注释的 `matchKeyword` 亦为边界匹配），暴力子串问题已解决——收敛。
- ⚠️ **大世界召回爆量**：主路径 `loop.ts:56-60` 已 `sort+slice(0,12)` 截断，200+ 词条不会撑爆 prompt——基本收敛；但 `src/app/api/generate/outline/route.ts:94-103` 直接 `recallContext(...)` 注入大纲 prompt **未截断**，大世界下仍可能超量，建议同源加 `.slice` 上限。
- ⚠️ **禁词扫描未接词边界**：`src/lib/forbidden-checker.ts:204` 精确词用 `text.indexOf(item.pattern)` 裸子串，无词边界（如「此外」会命中「除此之外」）；`src/lib/banned-words.ts:88-89` 仅对非CJK≤2字做边界。属预检+作者复核场景，危害较低，列 P2 待办。

---

## 总结（≤150字）
Round 4 的 matchNameStrict 在2字名上**过度收紧**（闭边界要求两侧非CJK），实测叶凡怒喝/他喊叶凡/村头叶凡走过全部漏检，使 OOC 与召回在最常见名长上近乎失效（P0，真回归）。3字关键词仍走 len≥3 直命中，与 changelog「灭李星云剑法误命中李星云」声明矛盾（P1）。matchNameStrict 零单测（P2）、自动建卡2字繁简变体仍建重卡（P2）。trigger OOC 暴力 includes 已收敛；主召回路径已截断。建议优先修 P0（2字名改回任一侧边界）+ 补单测。
