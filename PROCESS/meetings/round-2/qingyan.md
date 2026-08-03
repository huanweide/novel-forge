# Round 2 监控报告 · 青砚（玄幻大世界 · 三卡检索/召回/自动建卡/禁词透镜）

> 只读诊断，**未修改任何 src 源码**。本轮任务＝回归验证上轮修复 + 挖新坑。
> 术语首次出现大白话解释：
> - **词边界匹配**：中文没有空格分词，纯 `includes` 会让「林」在「森林」里反复命中；「边界」指关键词两侧必须是空白/标点/汉字边缘才算真正命中，否则视为夹在长词里的片段、不算数。
> - **特异性打分（score）**：关键词越长越具体、分给越高，召回截断时优先保留长词高价值设定。
> - **OOC**：Out-Of-Character，角色一致性检查，靠角色名/别名在正文里检索来判定谁出场。

---

## 回归验证（逐项：问题 / 预期 / 实际 file:line / 结论）

### R1 · 英文/拼音 2 字关键词边界失效（上轮 P1）
- **预期**：长度=2 的英文/拼音关键词（如 "AI"）只在空白/标点/中文相邻处算命中，不能命中 "maid""waitAI" 这类夹在拉丁串里的伪边界。
- **实际**：新增 `isBoundaryChar(ch, keywordIsCjk)`（`src/core/text/match.ts:24-28`），`matchKeyword` 在 `:54` 用 `needle.split("").every(isCjkChar)` 判定 `keywordIsCjk`，`:56-64` 按"任一侧是真实边界"判定。拉丁判定用 `WORDCHAR_RE = /[A-Za-z0-9]/`（`:17`）。
  - 内部拉丁已修：`matchKeyword("少女 maid 倒茶","AI")` → "ai" 两侧为 `m`/`d`（都是 wordchar，非边界）→ **不再误命中**。✓
  - **残留漏洞**：`isBoundaryChar` 把空串 `""`（串首尾）恒判为边界（`:25`）。于是 `matchKeyword("waitAI","AI")` → "ai" 紧贴串尾，after="" 被判边界 → **仍返回 true**；同理 `"xAI"`（首部紧贴）、`"AIx"`（尾部紧贴）都命中。而本文件 `:22-23` 的注释明确宣称要灭掉 "AI 命中 waitAI"，**实际未达成**。
- **结论**：**部分通过 / 有漏洞**。主体（内部拉丁）已修，但"串首尾紧贴拉丁"的伪边界未灭，与代码注释自相矛盾。

### R2 · 自动建卡相似度对短名过宽（上轮 P1）
- **预期**：2 字名要求完全相等才判同，杜绝「白云/白衣」被误并。
- **实际**：`src/lib/entity-auto-creator.ts:83` 新增 `if (x.length <= 2 || y.length <= 2) return false;`，短名（≤2 字）仅允许完全相同；≥3 字才走 `levenshtein≤1`（`:84`）。
- **结论**：**通过**。`isSimilarName("白云","白衣")` 现返回 false。取舍：2 字真变体（如「李尘/李麈」）也不再自动并，符合注释意图。

### R3 · 召回不按特异性排序会丢长词（上轮 P1）
- **预期**：召回注入前按 score（关键词长度）降序，长词高价值设定优先保留；且 score 相同时顺序稳定、不抖动。
- **实际**：`src/core/babylore/recall.ts:12` 已 `import {…scoreKeyword}`，`:41`/`:61` 用 `kept.reduce(…scoreKeyword(k),0)` 算 score；`src/core/babylore/loop.ts:56` 先 `[...recallRaw].sort((a,b)=>b.score-a.score)`（V8 稳定排序），`:57-60` 再 table 优先分区后 `slice(0,12)`。
- **结论**：**通过**。长词不再被短词挤掉；`Array.prototype.sort` 在现代 V8 稳定，同分时顺序确定，**无抖动**；"短高频词抢在长词前"已解决。

### R4 · recall.ts 中 dedupSubstring 死代码（上轮 P2）
- **预期**：命中关键词的最长匹配优先去重应真正接线（之前 `dedupSubstring(...)` 未赋值被丢弃）。
- **实际**：`src/core/babylore/recall.ts:40`、`src/core/babylore/recall.ts:60` 均 `const kept = dedupSubstring(hitKeys);`，并在 `:41`/`:61` 用于 score 计算。
- **结论**：**通过**。死代码已接线。

### R5 · findCharacterByName 仍用旧 includes（上轮 P2）
- **预期**：OOC 角色别名/短名检索应接入边界匹配，至少长度=1 拒绝，与三卡引擎一致。
- **实际**：`src/core/assembly/trigger.ts:69` 仍是 `if (lowerText.includes(name.toLowerCase()))` —— 暴力子串，未调用 `matchKeyword`。
- **结论**：**漏洞（未修复）**。1 字别名「林」仍会命中「森林」、「叶」命中「落叶」，OOC 角色识别误判，且与同文件 `matchLoreEntries`（`:37` 已接入 `matchKeyword`）自相矛盾。

### R6 · 禁词扫描未接入边界引擎（上轮 P2）
- **预期**：2 字英文/数字违禁词复用 `matchKeyword` 边界判定，降低无意义误报。
- **实际**：`src/lib/banned-words.ts:82-103` 的 `scanBannedWords` 仍用 `lower.indexOf(lw, from)` 纯子串扫描，未 import/调用 `matchKeyword`。
- **结论**：**漏洞（未修复）**。2 字违禁词 "vx"（`:19`）会命中 "avx"（CPU 指令名）、"VX" 命中 "AVX" 等长串，产生无意义误报噪声。

### R7 · 数字/emoji 边界（上轮 P2）
- **预期**：2 位数字关键词不应在长数字里误命中；emoji 边界语义清晰。
- **实际**：`match.ts:17` 的 `WORDCHAR_RE` 含 `0-9`，`:24-28` 对 `keywordIsCjk=false` 的关键词把相邻数字判为非边界。
  - 2 位数字已修：`matchKeyword("1234","23")` → 两侧 `1`/`4` 都是 wordchar → 非边界 → false。✓
  - **残留**：长度≥3 数字（如 "2049"）走 `:49` `len>=3 return true` 直接命中，会子串误伤更长数字（"120499" 含 "2049" → 命中）。emoji 因 `split("")` 拆成代理对且非 CJK，`keywordIsCjk=false`，边界判定退化为"相邻非 wordchar 即边界"，语义不清（低严重度）。
- **结论**：**部分通过**。2 位数字已修；len≥3 数字子串误伤仍存在（可接受但应知会），emoji 边界未特殊处理。

---

## 新发现（P0/P1：现象 / 根因 / file:line / 修复方案）

### 新坑 1（P1）· 英文/数字 2 字边界在"串首尾紧贴拉丁"仍误命中
- **现象**：`matchKeyword("waitAI","AI")`、`matchKeyword("xAI","AI")`、`matchKeyword("AIx","AI")` 均返回 true，但 "AI" 实为夹在拉丁串里，不该命中。代码注释 `:22-23` 宣称要灭此情形，实未灭。
- **根因**：`isBoundaryChar`（`:24-28`）对串首尾空串 `""` 恒返回 true（`:25`），且 `keywordIsCjk=false` 分支只排除"相邻是 wordchar（拉丁/数字）"，没排除"紧贴拉丁且位于串首尾"——串边界被无条件当边界。
- **file:line**：`src/core/text/match.ts:24-28`（边界判定）、`:56-64`（逐位置判定，after/before 取 `""` 触发恒真）。
- **修复方案**：`keywordIsCjk=false` 时，把"`ch===""` 恒为边界"改为"首尾也需相邻字符是空白/标点/CJK 才算边界；若相邻是拉丁/数字则非边界"。即空串边界判定也走 `!WORDCHAR_RE.test` 的语义（仅在确实无相邻字符时才是边界——但紧贴拉丁的首尾不应算）。更稳妥：仅当 `ch===""`（真·文本边界）且**该侧不存在拉丁相邻**时才算边界。

### 新坑 2（P1）· trigger.ts OOC 角色查找仍用暴力 includes，未接入边界引擎
- **现象**：角色别名/短名（尤其 1 字如「林」「叶」）会在「森林」「落叶」等长词里误命中，导致 OOC 一致性检查把未出场角色判为出场，或反之。
- **根因**：`findCharacterByName`（`src/core/assembly/trigger.ts:59-77`）`:69` 直接用 `lowerText.includes(name.toLowerCase())`，与同文件 `matchLoreEntries`（`:37` 已用 `matchKeyword`）脱节，属于检索一致性漏洞。
- **file:line**：`src/core/assembly/trigger.ts:69`。
- **修复方案**：对 `name`/`aliases` 复用 `matchKeyword(text, name)`（已在 `:12` import 了 `matchKeyword`）；至少对长度≤1 的名称直接拒绝，与三卡引擎统一。

### 新坑 3（P2）· 召回"table 优先"覆盖 score 排序 + 数字/禁词残留
- **现象**：① 当命中条目 >12 且 table 命中较多时，`loop.ts` 的 table 优先分区会把高分 lorebook 长词设定挤出前 12（与"优先保留高价值长词"目标局部冲突）；② 长度≥3 数字关键词仍子串误伤（R7）；③ 禁词扫描仍未接边界引擎（R6）。
- **根因**：`loop.ts:57-60` 先按 source 分区再 `slice`，使 table 低分也能压过 lorebook 高分；数字 len≥3 走 `match.ts:49` 直接命中；`banned-words.ts` 未复用 `matchKeyword`。
- **file:line**：`src/core/babylore/loop.ts:57-60`；`src/core/text/match.ts:49`；`src/lib/banned-words.ts:82-103`。
- **修复方案**：① 在 table/lorebook 分区前先做稳定的 score 截断，或对 table 也按 score 与 lorebook 混合排序后再保留"table 精确命中"的轻微加权，避免低分 table 饿死高分 lorebook；② 数字关键词（纯 `[0-9]+`）无论长度都走边界判定而非 len≥3 直接命中；③ `scanBannedWords` 对长度≤2 的词复用 `matchKeyword` 边界。

---

## 优先级建议
1. **P1 必修**：新坑 1（英文/数字 2 字串首尾误命中）—— 直接打脸本文件注释承诺，且影响世界书/召回注入精度。
2. **P1 必修**：新坑 2（trigger.ts OOC 仍 includes）—— 角色一致性检查正确性，且与已修的 `matchLoreEntries` 自相矛盾，修复成本低（已 import `matchKeyword`）。
3. **P2 建议**：新坑 3 三项（table 优先级微调、数字 len≥3 边界、禁词接边界引擎）—— 严重度低、影响面小，可并入下一轮或作为产品取舍记录。
4. **回归结论**：上轮 7 项中 4 项已彻底修复（R2/R3/R4 + R7 的 2 位数字），2 项仍漏（R5/R6 未动），1 项半修（R1 主体修但首尾残留）—— 本轮新坑 1 正是 R1 的残留面。

---

**一句话结论**：上轮核心修复（英文内部边界、短名相似度、召回按分排序、去重接线）已落地且正确，但英文/数字 2 字关键词在串首尾紧贴拉丁时仍误命中（与注释承诺相悖），且 OOC 角色查找与禁词扫描仍未接入边界引擎，属必须收口的 P1 残留。
