# Round 3 监控报告 · 青砚（玄幻大世界 · 三卡检索/召回/自动建卡/禁词透镜）

> 只读诊断，**未修改任何 src 源码**（唯一临时测试 `src/core/text/tmp_verify.test.ts` 已创建并立即删除，src 现状仅余 `match.ts`/`match.test.ts`，已核验）。
> 本轮任务＝回归上轮 F1 边界修复 + 复验禁词/OOC/数字三项待修。

---

## ① 历史修复回归核实（逐项 verdict + file:line）

### R-F1 · 英文/拼音 2 字边界「空串 bug」（上轮新坑 1 / P1）
- **预期**：`waitAI`/`xAI`/`AIx` 中的 "AI" 不再误命中；`isBoundaryChar` 空串处理不再导致误命中。
- **实际代码**（`src/core/text/match.ts`）：
  - `:64` `if (keywordIsCjk ? (beforeBoundary||afterBoundary) : (beforeBoundary&&afterBoundary)) return true;` —— **两侧都须为边界**的非中文分支已落地。✓
  - `:25` `if (ch === "") return true;` —— **空串 `return true` 仍在，未改动**。
- **实测（真实源码，7 项 vitest 全过）**：
  - `matchKeyword("waitAI","AI")` → false ✓
  - `matchKeyword("xAI","AI")` → false ✓
  - `matchKeyword("AIx","AI")` → false ✓
  - 独立词仍命中：`"他说 AI 会思考"` / `"AI"` → true ✓
- **结论**：**verdict=已修（路径≠描述）**。误命中确实消灭，但**不是靠改 `isBoundaryChar` 空串处理**，而是靠 `:64` 的"两侧 &&"逻辑兜住——当一侧紧贴拉丁（wordchar）时该侧 `beforeBoundary=false`，`&&` 直接 false，空串那侧即便 true 也无用。CHANGELOG v0.46.65:9 仅宣称改了 `&&` 逻辑、未提改空串，与代码一致；用户任务里"确认 isBoundaryChar 空串处理不再导致误命中"这句表述不准确——**空串处理压根没动，是 && 逻辑替它兜了底**。
- **残留**：`:25` 空串 `return true` 在 CJK 分支 + 文本尾部边界下会让"青云山"中的"云山"（尾边界）命中，属 2 字 CJK 既定的"尾边界即命中"行为（与 `match.test.ts` 第 34-39 行"潮痕在句尾命中"一致），非回归，仅作已知限制知会。

### R-F2 · trigger.ts OOC 角色查找仍暴力 includes（上轮 R5 / 新坑 2 / P1）
- **预期**：角色别名/短名接入边界引擎，1 字名不再命中"森林/落叶"。
- **实际**：`src/core/assembly/trigger.ts:69` `if (lowerText.includes(name.toLowerCase()))` —— **仍暴力子串，未调用 `matchKeyword`**。本文件 `:12` 已 import `matchKeyword`，`:37`（`matchLoreEntries`）已用，唯独 `findCharacterByName` 脱节。
- **结论**：**verdict=未修（漏）**。与上轮记录一致，本轮复验无变化。

### R-F3 · 禁词扫描未接边界引擎（上轮 R6 / 新坑 3-③ / P2）
- **预期**：2 字英文/数字违禁词复用 `matchKeyword` 边界判定。
- **实际**：
  - `src/lib/banned-words.ts:82-103` `scanBannedWords` 仍 `lower.indexOf(lw, from)` 纯子串；词库含 2 字拉丁 "vx"/"VX"（`:19`）。
  - `src/lib/forbidden-checker.ts:204` 精确禁用词同样 `text.indexOf(item.pattern, searchFrom)` 暴力子串（注：该文件词库多为 2+ 字中文/长串，子串误伤概率低，但机制一致未接边界）。
- **结论**：**verdict=未修（漏）**。与上轮一致，本轮复验无变化。

### R-F4 · 数字 len≥3 仍子串误伤（上轮 R7 残留 / 新坑 3-② / P2）
- **预期**：纯数字关键词不在更长数字里子串误伤。
- **实际**：`src/core/text/match.ts:49` `if (len >= 3) return true;` —— 纯数字长度≥3 直接命中、无边界判定。
- **实测**：`matchKeyword("120499","2049")` → **true（仍误伤）**；`matchKeyword("2049年","2049")` → true（正确命中）。
- **结论**：**verdict=未修（漏）**。与上轮一致，本轮复验无变化。

### 附带：上轮已彻底修复项（本轮不重复测，仅确认仍在位）
- R2 短名相似度 `entity-auto-creator.ts:83`（`<=2 字拒绝`）✓ 仍在
- R3 召回按 score 降序 `recall.ts:41/61` + `loop.ts:56` ✓ 仍在
- R4 dedupSubstring 接线 `recall.ts:40/60` ✓ 仍在

---

## ② 仍待修 / 新发现问题（P0/P1，纯逻辑 vs 需 UI）

### 待修（上轮遗留，本轮复验确认未动）
| 项 | 严重度 | file:line | 纯逻辑/需 UI | 修法 |
|---|---|---|---|---|
| OOC 角色查找暴力 includes | **P1** | `trigger.ts:69` | **纯逻辑** | 改用 `matchKeyword(text, name)`（`:12` 已 import）；至少对长度≤1 名直接拒绝，与 `matchLoreEntries` 统一 |
| 禁词 `scanBannedWords` 子串 | **P2** | `banned-words.ts:82-103` | **纯逻辑** | 对长度≤2 的拉丁/数字词复用 `matchKeyword` 边界；中文长词保留子串 |
| 数字 len≥3 子串误伤 | **P2** | `match.ts:49` | **纯逻辑** | 纯 `[0-9]+` 关键词无论长度都走边界判定，而非 `len>=3 return true` |

### 新发现
- **新坑 A（P2）· F1 修复无回归测试守护**：`match.test.ts` 12 项全为 CJK 用例，**没有一条覆盖英文/拼音 2 字边界**（`waitAI`/`xAI`/`AIx`/独立 `AI`）。本次修复靠人工推理 + 临时测试确认，若未来有人把 `:64` 改回 `||` 不会冒红。建议补 4 条英文边界用例进 `match.test.ts`（纯测试，非 src 逻辑改动）。
- **新坑 B（P2，知会）· 空串 `return true` 语义残留**：`:25` 空串恒边界在 CJK 尾部边界下会放大 2 字 CJK 误匹配（如"青云山"含"云山"尾部命中），当前与既有测试一致、属已知取舍，但 `isBoundaryChar` 的"空串=边界"与注释"两侧都是汉字则 false"的 CJK 语义在尾部是冲突的。可选清理：仅当 `ch===""` 且对侧为真实非汉字边界时才算边界。非阻断。

---

## ③ 建议（优先级 + 分类）
1. **P1 必修（纯逻辑，Chair 可直接改）**：`trigger.ts:69` 接 `matchKeyword`——已 import，改动极小，且与同文件 `matchLoreEntries` 自洽， fixing 成本低、风险低。
2. **P2 建议（纯逻辑）**：① `match.ts:49` 数字走边界；② `banned-words.ts` 2 字拉丁词接边界；两项均为纯逻辑、可并入本轮。
3. **P2 测试债（纯逻辑/测试）**：补英文 2 字边界 4 条用例进 `match.test.ts`，钉死 F1 修复，防回归。
4. **纯逻辑 vs 需 UI 结论**：**上述四项修复全部是纯逻辑/单测层面，无需任何 UI 改动**。`ForbiddenTab` 等 UI 组件消费 `scanBannedWords`/`scanForbiddenWordsEnhanced` 的返回结构，逻辑改完输出格式不变，UI 自动反映。OOC 的 `findCharacterByName` 是纯函数，改完即生效。无端到端 UI 阻塞项。

**一句话结论**：F1 英文边界误命中（waitAI/xAI/AIx）已在 v0.46.65 用"两侧 &&"逻辑真实消灭（实测 false），但靠的是 `match.ts:64` 而非改空串 `isBoundaryChar`（`:25` 原样未动，CHANGELOG 表述与代码一致，用户任务描述路径有误需澄清）；OOC 角色查找、禁词扫描、数字 len≥3 三项上轮遗留**本轮复验确认仍漏、未动**，均为纯逻辑可立即修、无需 UI；并补 F1 回归测试债。
