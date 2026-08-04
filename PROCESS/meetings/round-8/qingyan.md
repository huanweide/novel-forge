# 青砚 · Round 8 L1 只读诊断（文本检索/匹配/高亮透镜）

> 日期：2026-08-04 ｜ 只读复验 Round 7（v0.46.70）青砚 P1 修复 + 挖掘新坑
> 审查文件：`src/core/text/match.ts` `match.test.ts` `src/lib/entity-auto-creator.ts` `entity-auto-creator.test.ts` `src/core/entity-highlighter.ts` `src/core/assembly/trigger.ts` `src/core/babylore/recall.ts`
> 约束：未改任何源码/CHANGELOG/MEMORY/其他 round 报告，仅产出本报告。
> 测试核验：`npx vitest run match.test.ts trigger.test.ts entity-auto-creator.test.ts` → 30/30 全绿。

---

## 一、Round 7 修复复验结论（青砚 P1 是否过关）

**结论：R7 青砚 P1 修复「逻辑正确、单测通过，但从未在运行时生效」——属未接线/死代码，复验不通过。**

- **R6 两项修复仍有效**（对照 R7 round-7/qingyan.md）：
  - `match.ts:128-154` 3字+ 最长匹配优先 + 吞并逻辑：match.test.ts 21 项绿，含「李星云剑法」吞并、「李星云看见」命中用例 ✅。
  - `entity-highlighter.ts:189-194` 介词头边界：R6 P1 仍就位，「在萧炎」可高亮 ✅。
- **R7 青砚 P1（`trigger.ts` knownNames 补词条长名灭 OOC 误报）：逻辑通过、但死代码。**
  - `findCharacterByName`（`trigger.ts:74-106`）新增 `extraKnownNames` 并入词条/技能/功法/地点长名，单元测试 `trigger.test.ts`（5 项）全绿，确实能令「李星云剑法」内「李星云」被吞并不误报。
  - **但全仓无任何生产调用方**：该函数仅被定义、被 `index.ts:4` 再导出、被 `trigger.test.ts` 单测（见全局 grep）。真正接入生产的是 `matchLoreEntries`（`orchestrator.ts:608` 世界书注入），而 OOC 角色一致性走 `orchestrator.ts` 的 LLM 路径，**无人调用 `findCharacterByName`**。
  - 后果：R7 声称「灭『李星云剑法』内 3字角色名误报 OOC」在运行态**不可验证且实际不发生**——要么该 OOC 文本检测从未接线（真实缺口），要么修复形同虚设。CHANGELOG 与此修复描述存在误导。

> 验证方法：全仓 grep `findCharacterByName` → 仅 `trigger.ts`(定义) / `index.ts`(再导出) / `trigger.test.ts` / `changelog-data.ts`(数据) / 历史 PROCESS md，零业务调用。

---

## 二、新坑（按严重度分组）

### P0（功能错误 / 验证失败）

**P0-1 · R7 青砚 P1 修复未接线：`findCharacterByName` 是死代码，修复在运行时零效果**
- 文件:行号：`src/core/assembly/trigger.ts:74-106` + `src/core/assembly/index.ts:4`（仅再导出）+ 全仓无生产调用
- 现象：上节已述。R7 的 OOC 误报修复停在一个从未被调用的纯函数里，单元绿但运行无效。
- 严重度：P0（文档声称已修复的功能在运行态并未修复；若 OOC 文本检测本应有接线点，则为真实缺口）。
- 建议方向：
  1. 在真实 OOC 文本检测路径（如角色出场一致性检查）调用 `findCharacterByName`，并传入同章节词条/技能/功法/地点长名作为 `extraKnownNames`；
  2. 若系统 OOC 纯靠 LLM，则删除该 orphan 函数并修正 CHANGELOG 措辞，避免后续 round 基于「已修复」误判。

### P1（明显缺陷）

**P1-1 · `matchLoreEntries` 的 knownNames 比 `recall.ts` 窄（缺表格关键列值）→ 召回误触发风险**
- 文件:行号：`src/core/assembly/trigger.ts:30-37`（knownNames 仅 lorebook keys）对比 `src/core/babylore/recall.ts:34-49`（lorebook keys + 表格关键列值）
- 现象：两者都调用 `matchNameStrict` 的 3字+ 吞并逻辑，但生产路径 `matchLoreEntries`（`orchestrator.ts:608`）的 `knownNames` 只含 lorebook keys，不含表格行值。`matchLoreEntries` 也**不接收 tables 参数**，根本无法并入。当某 3字 lorebook key 恰为某表格长值（如地点「李星云庄」）的前缀时：文本出现「李星云庄」→ 该 lorebook 3字 key 紧后 CJK 且 knownNames 无「李星云庄」（它是表值非 lorebook key）→ 不被吞并 → 误触发该 lorebook 条目；而 `recall.ts` 会因含表值正确吞并。
- 严重度：P1（生产召回路径存在误触发，与 recall 行为不一致）。
- 建议方向：给 `matchLoreEntries` 增加 `tables` 入参，把表格关键列值并入 knownNames（与 `recall.ts` 对齐），或抽公共 `buildKnownNames(lorebook, tables)` 复用。

### P2（优化 / 已知坑未修）

**P2-1 · entity-auto-creator 长名(≥3字)未繁简归一 → 全繁体 3字名重复入库；测试假绿**
- 文件:行号：`src/lib/entity-auto-creator.ts:109-119`（长名走 `levenshtein<=1`，未先 `normalizeTraditional`）+ `:51-71`（`TRAD_TO_SIMP` 仅 ~22 字不全）
- 现象：R6/R7 已列，本轮仍未修。`isSimilarName` 对 ≥3 字名直接 `levenshtein(x,y)<=1`（x,y 仅小写未归一），故 `levenshtein("青龍鎮","青龙镇")=3` → 判不相似 → 全繁体 3字名被当新实体写入。测试 `entity-auto-creator.test.ts:19-21` 用「青龍镇」（仅 龍1 字不同，距离=1）通过，**未覆盖全繁体**，假绿。
- 严重度：P2（污染 DB，但非即时功能错误）。
- 建议方向：长名分支先 `normalizeTraditional(x)`/`normalizeTraditional(y)` 再算 `levenshtein`；扩充 `TRAD_TO_SIMP`（滅/戰/關/東/無/後/實/聲/劍/靈/寶/問/開/與…）；补全繁体单测。

**P2-2 · entity-highlighter 无 `findEntitiesInText` 单测；3字+ 名无边界检查**
- 文件:行号：`src/core/entity-highlighter.ts:193`（`passesBoundary` 对 3字+ 恒 true）+ 全仓无 `entity-highlighter.test.ts`
- 现象：R6 P1「在萧炎」高亮修复**零测试护栏**；3字+ 名不做头/尾边界（设计取舍，靠注册表避免误高亮），一旦更长实体未注册，「碎玉轩」可在「碎玉轩内」中段被高亮，无回归保护。
- 严重度：P2（测试缺口 + 文档化取舍）。
- 建议方向：补 `findEntitiesInText` 单测，覆盖「在萧炎」高亮、与「李星云剑法」最长名优先占用。

**P2-3 · knownNames 线性遍历，OOC/召回随规模二次增长**
- 文件:行号：`src/core/text/match.ts:140-146` + `trigger.ts:30-37` + `recall.ts:34-49`
- 现象：每次 `matchNameStrict` 3字+ 命中每位都遍历全量 `knownNames`。大项目（数百词条/数千行表）下 O(hits × |knownNames|) 潜伏性能隐患。
- 严重度：P2（优化）。
- 建议方向：已知名按首字/前缀建索引（Map<首字符, name[]>），避免全量线性遍历。

---

## 三、复验小结
| 项 | 结果 |
|---|---|
| R6 P0-1 3字+ 最长匹配优先 | ✅ 仍有效（逻辑+测试） |
| R6 P1 介词头边界高亮 | ✅ 仍有效 |
| R7 青砚 P1 trigger knownNames 补词条长名 | ❌ 逻辑过、测试过，但 `findCharacterByName` 死代码，**运行态零效果（P0 验证失败）** |
| 新 P0 | 1（修复未接线/死代码） |
| 新 P1 | 1（matchLoreEntries knownNames 缺表值→召回误触发） |
| 新 P2 | 3（长名未归一假绿、高亮零测试、knownNames 性能） |
