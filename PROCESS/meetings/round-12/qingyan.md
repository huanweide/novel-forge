# Round 12 复验 · 青砚透镜（三卡检索词边界 / OOC / 自动建卡去重）

- 复验对象：`novel-forge` HEAD = `1cee64d`（Round 11 落地，git 未改 src/、changelog、version、MEMORY）
- 透镜定位：建卡去重边界（别名/繁简/变体阈值）、`matchNameStrict`/`recall` 召回精度、trigger 已知名注入、entity-highlighter 高亮边界
- 结论摘要：**Round 11 五条修复全部 PASS，无回归**；新挖 P1×2、P2×4，无 P0（未发现角色/实体级严重误召回或漏召回）。

---

## 一、回归结论（逐条 PASS/FAIL）

| 项 | 验证点 | 结果 | 证据 |
|----|--------|------|------|
| A1 | `findExactDuplicate` 把主名+别名摊平进 `variantNames`、建 `aliasToCharId` 索引；`autoCreateEntities` 拉取角色 aliases 并入 `existingNames/existingNameList` | **PASS** | `apply-extraction/route.ts:78-88`（摊平+索引）、`:148/:247`（查重）、`entity-auto-creator.ts:159-179`（拉 aliases 入查重集） |
| A2 | 长名(≥3字) `isSimilarName` 由 `≤1` 收紧为 `===0`（先 `normalizeTraditional` 繁简归一） | **PASS** | `entity-auto-creator.ts:120-125`；test `:24/:29`（青龙镇/青龍镇=true，青云宗/青云山=false） |
| A3 | `DetectedEntity` 接口新增 `aliases?:string[]` | **PASS** | `entity-detector.ts:31` |
| A4 | apply-extraction 建卡去重路径接上 | **PASS** | `route.ts:97-130` `findExactDuplicate`+`isVariantDuplicate`；`:148-174`（角色）、`:247-255`（lore）均走查重 |
| A5 | `isSimilarName` 仅用于建卡去重，未触达 `matchNameStrict`/`recall` | **PASS** | Grep：`isSimilarName` 仅出现于 `entity-auto-creator.ts:110,194` 与 `apply-extraction/route.ts:10,126`；`recall.ts`/`trigger.ts`/`match.ts` 均用 `matchNameStrict`，无回流 |

补充确认：A2 的短名(≤2字)分支（`entity-auto-creator.ts:120-122`）返回 false，保留「白云/白衣」「叶凡/叶帆」不误并——安全优先，符合预期。

---

## 二、新挖问题清单（青砚透镜）

### P1-1 · 2字 CJK 关键词在 `matchNameStrict` 无「更长已知名吞并」保护 → 误召回
- **文件:行**：`src/core/text/match.ts:142-144`
- **现象**：2字名走 `return true`（直接子串命中，为修 Round4 漏召回），但**完全不查 `knownNames`**。例：仅注册 lore key「云山」时，正文「青云山」「云山村」会命中并注入该词条；「玄铁」也会在「玄铁剑」「玄铁炉」中误触发。`dedupSubstring`（仅同词条内去重）救不了「只注册短名」场景。
- **根因**：吞并逻辑只在 `len>=3` 分支（`:150-176`）实现，2字分支在 `:142` 直接返回，绕过 `options.knownNames`。
- **建议**：在 2字 CJK 分支补「嵌于更长已知名」判定——若 `text` 在命中位置存在一个更长 `knownName` 覆盖该区间（即 `exist nl>needle && hay.indexOf(nl)` 区间包住 `[idx,idx+2)`），则视为被长名吞并返回 false。注意：不要复用 Round4「两侧闭边界」，否则会再次令「叶凡」类常见 2字名全漏检；仅当确有更长已知名覆盖时才吞并。

### P1-2 · `matchNameStrict` 吞并仅查「更长名同起点」，漏掉「中段嵌入」型误命中
- **文件:行**：`src/core/text/match.ts:160-168`
- **现象**：3字+ 吞并条件 `hay.startsWith(nl, idx)` 要求更长名**从命中位 idx 起**。若短名嵌在长名中段（如「星云剑」在「李星云剑法」idx1 处），因长名「李星云剑法」始于 idx0≠1，吞并失败→「星云剑」误命中。同理 P1-1 的「云山」在「青云山」idx1 处也属此类。
- **根因**：吞并判定用了「前缀」语义而非「覆盖」语义。
- **建议**：改为「覆盖」判定——`exists nl in knownNames, nl.length>needle.length, s=hay.indexOf(nl), e=s+nl.length, s<=idx && e>=idx+needle.length` 即吞并。一次修复 P1-1（2字）与中段嵌入两类。

### P2-1 · 蒸馏自动建卡路径 `DetectedEntity.aliases` 永不赋值 → 批内别名去重是死代码
- **文件:行**：`src/lib/entity-auto-creator.ts:200-209`（依赖 `entity.aliases`）；`src/lib/entity-detector.ts:317,342,366`（push 实体时均未设 `aliases`）
- **现象**：`A3` 给 `DetectedEntity` 加了 `aliases?` 字段，但 `detectEntities` 三个 push 点都不填充，故蒸馏自动建卡时 `entity.aliases` 恒为 undefined，`:200-209` 别名并入逻辑永不执行。别名去重只在 `apply-extraction`（`c.aliases` 来自 LLM 提取响应）生效，蒸馏路径无批内别名防双卡。
- **建议**：在 `matchEntities`/已知词典分支填充 `aliases: ke.aliases`（已知实体有别名时）；或在 `extractNewEntities` 时合并同义词，使蒸馏路径也能防别名双卡。

### P2-2 · entity-highlighter 不高亮别名，且 2字名头边界白名单漏掉常见前缀
- **文件:行**：`src/core/entity-highlighter.ts:55-73`（仅 `e.name` 建映射，忽略 `aliases`）、`:191`（头边界白名单缺「小/老/阿/大」等）
- **现象**：①角色别名（如「炎帝」）在正文中不以主名出现时不染色；②「小萧炎」「老萧炎」「阿萧炎」中 prev=「小/老/阿」不在 `:191` 正则白名单→不高亮，可见漏染。
- **建议**：`buildEntityMapFromData` 把 `aliases` 一并入 map；头边界白名单补常见称谓前缀（或改为「非 CJK 即边界」与 `matchKeyword` 对齐，但需复核 2字误染）。

### P2-3 · 单字名前缀守卫不对称：尾随命中但前导不查，1字角色名易在「乌云」类词误报
- **文件:行**：`src/core/text/match.ts:128-138`
- **现象**：单字只查「紧后非 CJK」。`matchNameStrict("乌云","云")===true`（test `:69` 固化此行为）。若存在 1字角色/实体名「云」，正文「乌云」（乌云）会被误判为该实体出现（OOC/召回误报）。前导侧完全不查，造成「尾随误命中、前导安全」的不对称。
- **建议**：评估 1字名是否应参与召回/OOC（天然歧义高）；若保留，对 1字名也要求「前导为边界」（两侧闭边界），并同步修订 `match.test.ts:69`。

### P2-4 · 纯数字关键词召回依赖「两侧非 wordchar」，但中文数字串边界与年份/编号语义未区分
- **文件:行**：`src/core/text/match.ts:43-95`（`matchKeyword` 数字分支）
- **现象**：`2049` 在「120499」已被防护（test `:90` PASS），但「2049年」与「2049」混用、或编号「编号2049」「2049号」等带后缀场景依赖 BOTH 边界，若正文写作「编号是2049。」可命中、「编号2049」亦命中，语义上「2049」作为独立年份/编号的边界判定偏宽（凡邻接非数字即算独立）。
- **建议**：非 P0，维持现状即可；仅在出现「2049」误吞「2049届/2049级」类真实误报时，把「数字+单位/届/级」纳入数字边界判定（紧后非数字但为量词也视为延长）。

---

## 三、复验判定
- Round 11 青砚透镜修复：**5/5 PASS，零回归**。
- 新挖：P1×2（2字无吞并、吞并仅同起点）、P2×4（别名死代码、高亮别名/前缀漏、单字不对称、数字边界偏宽）。**无 P0**。
- 优先修 P1-1/P1-2（同一处「覆盖式吞并」改写即可同时解决，改动小、收益大）。
