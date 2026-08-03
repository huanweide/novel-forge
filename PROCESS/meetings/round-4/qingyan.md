# Round 4 复验报告 · 青砚（玄幻大世界 · 三卡检索/召回/自动建卡/禁词透镜）

> 只读诊断，**未修改任何 src 源码**。本轮用临时探针（`src/core/text/tmp_qingyan_r4.test.ts`，15 项用例全过）实证的结论已删除探针、`git status` 核验 `src/core/text/` 仅余 `match.ts`/`match.test.ts`。
> `src/core/game/game-prompts.ts` 存在差异（M），非本轮文本匹配改动、属 Chair 其他实现，不属本透镜，未深究。

---

## ① 回归确认（Round 3 三项文本匹配修复是否稳）

| 项 | 预期 | 现状 | 实证（真实源码） | verdict |
|---|---|---|---|---|
| R-F4 数字子串误伤 | 纯数字走边界 | `match.ts:54-55` `isPureDigit` 判定 + `len>=3 && !isPureDigit` 才直命中 | `matchKeyword("120499","2049")`→**false**；`("2049年","2049")`→true；`("公元2049年","2049")`→true；`("id2049","2049")`→false | **已修 ✓** |
| R-F2 OOC 暴力 includes | findCharacterByName 改 matchKeyword | `trigger.ts:69` 已实现（`:12` 早 import） | `findCharacterByName("苏沐在练剑",[{name:"苏沐"}])`→命中 c1 | **已修 ✓** |
| R-F3 禁词拉丁短词边界 | 2 字拉丁走边界 | `banned-words.ts:88-105` `useBoundary` + 双侧 `a-z0-9` 边界 | `scanBannedWords("avx 处理器")` 无 vx；`("加我vx")` 命中 vx；`("vxvx")` 无 vx | **已修 ✓** |
| F1 英文 2 字边界 | 两侧 `&&` | `match.ts:69` 非中文分支 `&&` 原样在位 | `matchKeyword("waitAI","AI")`→false | 稳 ✓ |
| F1 空串 `return true` | （上轮指未动） | `match.ts:25` `if (ch==="") return true;` 原样未动 | 与 round-3 一致，无回归亦无修复 | 不变 |

**结论**：Round 3 三项文本匹配修复本轮**全部真实生效、无回归**。反向佐证：`round-3` 遗留的 `tmp_verify_match.test.ts` 第 6 条断言 `matchKeyword("120499","2049")` 应为 true（"预期仍误伤"），如今必然失败——证明旧误伤已灭。

### 仍存的测试债（不算回归，但无守护）
- `match.test.ts` 12 项仍**全为 CJK 用例**，无一条英文/拼音 2 字边界（waitAI/xAI/AIx/独立 AI）——round-3 新坑 A 至今未补。本轮修复靠人工推理 + 临时探针确认，若未来有人把 `match.ts:69` 非中文分支改回 `||` 不会冒红。

---

## ② P0 必修（误伤/误触发 → 错误内容注入，按影响排序）

### P0-1 · OOC 经 matchKeyword「任一侧边界(`||`)」在 2 字名尾随/句末误命中 → 误判角色出场
- **文件:行号**：`src/core/text/match.ts:69`（CJK 分支 `beforeBoundary || afterBoundary`）；暴露面 `src/core/assembly/trigger.ts:69`（`findCharacterByName` 本轮刚接入）。
- **问题**：CJK 2 字关键词只要「任一侧是边界」（开头/结尾/相邻非汉字）即命中。当 2 字角色名出现在更长地名/人名的**尾部或句末标点后**，会误命中。本轮把 OOC 查找从 `includes` 换成 `matchKeyword`，使该缺陷**新增影响 OOC 判定**——误判某角色出场，进而误触发 OOC 审查或对未出场角色空跑校验。
- **可复现**：
  ```
  findCharacterByName("他登上青云山。", [{id:"c5", name:"云山", aliases:[]}])
  // → ["c5"] 命中（期望不命中：青云山≠云山，山后紧跟句号→after 边界）
  findCharacterByName("紫云山", [{id:"c4", name:"云山", aliases:[]}])
  // → ["c4"] 命中（期望不命中：紫云山≠云山）
  ```
- **建议修复**（不碰共享引擎、不动既有 `matchKeyword` 测试）：在 `trigger.ts` 内对角色名包装一层严格边界，例如新增本地 `matchNameStrict(text, name)`：先 `matchKeyword` 命中，再对「长度 2 且全 CJK」的名字追加「匹配处前后都不是汉字相邻」校验（即闭边界），角色名独立成词才认。这样既不推翻 `match.test.ts`，又堵住 OOC 误判。
- **影响范围**：OOC 角色出场识别（`findCharacterByName` 所有调用方）；直接关系「误判角色在场 → 错误 OOC 提示/漏判」。属内容/判定注入型误触发，P0。

### P0-2 · 召回/触发：CJK 2 字 key 尾随误召回 → 错误世界书/表格内容注入 Prompt
- **文件:行号**：`src/core/text/match.ts:69`（同上 `||`）；调用点 `trigger.ts:37`（`matchLoreEntries`）、`src/core/babylore/recall.ts:37`（lorebook）、`recall.ts:54`（表格行关键列，已 `v.length>=2` 才进）。
- **问题**：与 P0-1 同源。若作者把 2 字词（如"云山""龙镇"）设为世界书 key 或表格关键列值，正文写到包含它的更长词（"青云山""青龙镇"）且该 2 字恰在尾部/句末，会**错误召回并注入**对应世界书/表格片段。`dedupSubstring`（`match.ts:87`）只在「同一 entry 内的 hitKeys」去重，**救不了跨词**——因为并没有"青云山"这个 key，只是"云山"是"青云山"的连续子串。
- **可复现**：
  ```
  matchKeyword("青云山", "云山")  → true   // 期望 false
  matchKeyword("青龙镇", "龙镇")  → true   // 期望 false（龙镇两侧皆汉字，本应被夹心排除）
  ```
  （注："龙镇"在"青龙镇"前后皆汉字，`||` 却因 `beforeBoundary=false` 被 `afterBoundary`（镇后无字符→""）拉成 true——即**句尾型**才漏；"龙镇"在正文若写成"青龙镇外"则 after="外"汉字→不命中，说明误命中仅在尾部/句末发生。）
- **建议修复**：根因是中文无空格、靠 `||` 单侧边界换取句首/句尾真实词命中。两条路：
  1. **保守（推荐本轮）**：把 P0-1 的 `matchNameStrict`/闭边界思路同样用于召回的 CJK 2 字 key——要求前后都不是汉字相邻才命中（闭边界）；代价是"潮痕"句尾命中（`match.test.ts:36/38`）会变 false，需同步改这两条用例并双 changelog。
  2. **根治（大改）**：在 `matchLoreEntries`/`recallContext` 收集完 hitKeys 后，对 CJK ≤2 字命中做「扩展窗口判定」：若命中位置左右扩展一位仍是连续汉字，则视为更长汉字串的一部分、剔除。需引入滑动窗口，复杂度上升，建议作为后续专项。
- **影响范围**：所有世界书/表格召回注入（`trigger.ts`/`recall.ts` 全部调用方）。错误设定注入 Prompt 会带偏正文生成，P0（但仅当作者使用 2 字短 key 时触发，实战概率中）。

---

## ③ P1 建议

### P1-1 · 单字角色名/别名被 matchKeyword 静默丢弃（false negative，OOC 漏检）
- **文件:行号**：`src/core/text/match.ts:50` `if (len <= 1) return false;`；经 `trigger.ts:69` 命中 OOC。
- **问题**：Round 4 把 `findCharacterByName` 从 `includes` 换成 `matchKeyword`，**副作用**：单字名/`单字别名`再也不会被识别——而旧 `includes` 是能匹配的。玄幻常见单字称呼/别名（如"林""苏""夜"），或角色别名恰为 1 字，会导致 OOC **漏检该角色出场**，对该角色失守 OOC 校验。
- **可复现**：
  ```
  findCharacterByName("他走入森林", [{id:"c2", name:"林", aliases:[]}])   → []  // 期望命中 c2
  findCharacterByName("夜深了",     [{id:"c3", name:"夜王", aliases:["夜"]}]) → []  // 期望命中 c3（别名"夜"被拒）
  ```
- **建议修复**：在 `findCharacterByName` 内对「长度≤1 的 name/alias」走**精确全字/词边界**匹配而非直接丢弃——单字角色名要求文本中该字独立成词（前后非汉字相邻或标点/边界），既堵住"林"误命中"森林"，又保留单字真名检测。注意：此处不能复用 `matchKeyword`（它直接拒单字），需单独实现单字闭边界。
- **影响范围**：OOC 角色识别完整度；沉默回归（无报错、仅漏检），P1。

### P1-2 · 禁词 `scanBannedWords` 与 `forbidden-checker` 边界策略不统一（2 字中文词仍纯子串）
- **文件:行号**：`src/lib/banned-words.ts:82-103`（仅 `lw.length<=2 && !isPureCjk` 走边界，纯中文 2 字仍 `indexOf` 子串）；`src/lib/forbidden-checker.ts:204/282/298/336`（精确禁用词全 `indexOf` 子串，round-3 已记、本轮未动）。
- **问题**：本轮禁词边界只覆盖了「拉丁/数字短词」，**中文 2 字禁用词仍是裸子串**。若作者自定义 2 字中文违禁词（如"A片"类规避写法、或普通词误入），会像旧 `includes` 一样在更长词里误报；`forbidden-checker` 的精确禁用词同理未接边界。
- **可复现**：`scanBannedWords("微微信")` 因含"微信"（2 字 CJK，子串）→ 标记为命中（此处算合理），但若词库有高频 2 字中文词且作者正文正常叙述包含其长词变体，则误报。属潜在误报，非必现。
- **建议修复**：将 `useBoundary` 阈值从「仅非纯 CJK ≤2 字」扩为「所有 ≤2 字词」（含中文），中文 2 字改用与 `matchKeyword` CJK 分支一致或稍严的边界（至少一侧非汉字）；`forbidden-checker` 精确词若为 2 字中文同样接边界。统一边界语义，避免两套逻辑漂移。
- **影响范围**：禁词预检误报率；作者复核负担。误报非注入，P1。

---

## ④ P2 优化

### P2-1 · `match.test.ts` 补英文/拼音 2 字边界回归用例（round-3 新坑 A 仍未补）
- **文件:行号**：`src/core/text/match.test.ts`（全 12 项均 CJK）。
- **问题**：无 waitAI/xAI/AIx/独立 AI 用例，F1 修复无守护。
- **建议**：补 4 条 `matchKeyword("waitAI","AI")→false`、`("xAI","AI")→false`、`("AIx","AI")→false`、`("他说 AI 会思考","AI")→true`。纯测试，不碰 src。

### P2-2 · 实体高亮 3 字名无尾边界 → 「小青龙镇」误高亮「青龙镇」
- **文件:行号**：`src/core/entity-highlighter.ts:184` `passesBoundary = name.length >= 3 ? true : isHeadBoundary;`（3 字及以上完全不查边界）。
- **问题**：3 字实体名在更长地名内部会被高亮，造成满屏错染（属清览透镜，但从「角色名/词条名误匹配」角度附带）。实证：`findEntitiesInText("小青龙镇很美", {青龙镇})` → 命中"青龙镇"。
- **建议**：对 ≥3 字名也补「闭合边界」（前后非汉字相邻）判定，至少排除"被更长汉字串包含"的情形；高亮层改动不影响注入，风险低。

### P2-3 · `findEntitiesInText` 命中区间占用用 `occupied.slice(idx,end).some(Boolean)`
- **文件:行号**：`src/core/entity-highlighter.ts:178`。
- **问题**：每次命中 O(end-start) 切片扫描，长正文多命中时退化为 O(L·命中数)；磐石透镜的潜在性能项，青砚附带知会。可改用「记录已占区间并跳过」的区间合并或正则 lastIndex 推进。

### P2-4 · `isBoundaryChar` 空串 `return true` 语义残留（round-3 新坑 B，未动）
- **文件:行号**：`src/core/text/match.ts:25`。
- **问题**：`ch===""` 恒边界，与 CJK 分支「两侧都是汉字则 false」语义在尾部冲突，放大 2 字 CJK 尾随误匹配（即 P0-1/2 的根）。与既有测试一致、属已知取舍，但建议未来仅在「对侧为真实非汉字边界」时才把空串算边界。

---

## ⑤ 一句话结论
Round 3 三项文本匹配修复（数字边界、OOC 改 matchKeyword、禁词拉丁短词边界）**本轮实证全部生效、无回归**；但把 OOC 接入 `matchKeyword` 后，CJK 2 字「任一侧边界(`||`)」的尾随/句末误命中（青砚核心关切：错误世界书/角色内容注入）**新增暴露到 OOC 与召回**，定级 **P0-1/P0-2**；并发现 **P1-1 单字角色名被静默丢弃（本轮修复的沉默回归）**、**P1-2 禁词中文 2 字仍裸子串**；测试债与高亮边界列 P2。除 `game-prompts.ts`（Chair 其他实现）外，本轮未改动任何源码。
