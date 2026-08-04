# 青砚透镜 · Round 9 只读质量复验报告

- 对象仓库：`/c/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge`（git `main`，HEAD = `8c82195` Round 8）
- 复验版本：`v0.46.71`（Round 8 实现 commit `bb2b86a`）
- 透镜：三卡检索词边界 + OOC 检测 + 自动建卡去重
- 方式：**只读**，未修改任何源码；本报告为唯一产出文件。

---

## 回归验证（Round 8 → v0.46.71 对青砚透镜的修复是否真接线）

### R1. `findCharacterByName` 死代码删除 —— 无遗留调用方 / import 风险 ✅
- 全仓 grep `findCharacterByName`：仅出现在 `src/lib/changelog-data.ts` 的历史文字记录中，**生产代码无任何 import 或调用**。
- `src/core/assembly/trigger.ts` 当前 import 仅为 `scoreKeyword, dedupSubstring, matchNameStrict`（trigger.ts:12），未残留对删除符号的引用。
- 结论：删除干净，无编译/运行风险（commit 注明 `tsc 零错误`）。

### R2. `loreTables` 真路径透传 —— 已接入生产 ✅
生产调用链（写/微调/续写）：
1. `src/core/pipeline/context-loader.ts:74-76` —— `prisma.loreTable.findMany({where:{projectId}})` 全量拉取，注入 `data.loreTables`（:125）。
2. `src/core/pipeline/pre-processor.ts:183` —— `buildGenerationContext` 透传 `loreTables: data.loreTables`。
3. `src/app/api/generate/preview-context/route.ts:76` —— 预览路径同样透传 `loreTables`。
4. `src/core/agents/orchestrator.ts:610` —— `matchLoreEntries(recentText, triggerableLore, 8, loreTables)` 第 4 参即表格。
- 表结构兼容：`prisma/schema.prisma:545-546` 定义 `columns Json` / `rows Json`，与 `collectTableKnownNames` 读取 `t.columns`/`t.rows` 完全一致。

### R3. `knownNames` 收集边界正确 ✅
- `trigger.ts:34` 与 `recall.ts:46` 均为 `v.length >= 2` 才并入候选；单字 / 空值 / 非字符串不入。
- 关键列回退 `TABLE_KEY_COLS`（name/title/key/live/place/building/type/status）—— 见 R6 关于 `status`/`type` 的复用风险（新发现 F3）。

### R4. 召回修复真的抵达输出 ✅
- `src/core/assembly/engine.ts:91`、`engine.ts:231` 的 `buildLoreSection` 消费 `context.triggeredLore` 并注入最终 prompt；`orchestrator.ts` 把 `matchLoreEntries` 结果写入 `triggeredLore`。
- ∴ `matchLoreEntries` 的 knownNames 吞并逻辑确实影响注入内容，非死代码假绿。

### R5. OOC 命中逻辑落真路径 ✅
- 原 Round 7「OOC 词条误报」修复写在死代码 `trigger.findCharacterByName`（含 `extraKnownNames`），属**假绿**；Round 8 删除该死代码，并把「已知更长度名吞并短名」逻辑搬入：
  - `matchLoreEntries`（活路径，trigger.ts:69-71 + :81 `matchNameStrict(..., {knownNames})`）
  - `recall.ts`（活路径，:39-49 + :55/:72）
- 二者均在生产被调用且已传 `tables`（R2）。
- LLM 侧 Agent D 审校的 OOC 分类（`orchestrator.ts:85` `"type":"ooc|..."`）本就在生成 prompt 内，非死代码，始终生效。
- 结论：Round 8 的 OOC/召回修复确为真接线。

### 回归结论
Round 8 对青砚透镜的修复**确为真接线，非死代码假绿**。但存在隐含前提「修复依赖更长名已落在 LoreTable 或 lorebook key」（见新发现 F2）。

---

## 新发现问题（青砚透镜）

### F1 —— P1 · 数字子串误伤：`matchKeyword` 纯数字边界守卫被绕过
- 位置：`src/core/text/match.ts:54-55`（及 `matchNameStrict` 经 `matchKeyword` 间接受影响）
- 问题：`isPureDigit = /^[0-9]+$/` 守卫仅对**纯数字**关键词生效；含数字但非纯数字的 ≥3 字关键词走到 `len >= 3 && !isPureDigit → return true` 的**直命中分支，无任何边界检查**。
  - 例：`「2049年」` 会误命中 `「12049年」`、`「22049年」`（子串命中）。
  - 例：`「第3章」` 会误命中 `「第13章」`、`「第23章」`。
  - 这正是「数字子串误伤」未覆盖的盲区——纯数字修好了，混合数字漏了。
- 影响：错误召回/注入 worldbook 或表格行，噪声甚至引发 OOC 式串味。
- 建议：将纯数字守卫扩展为「含数字且 ≥3 字」亦走词边界（命中位置前后非数字/非 CJK 才算边界）；或统一对含数字子串要求两侧非数字边界。
- 是否 Round 8 回归：**否**（历史遗留，Round 8 未改动 `matchKeyword`）。

### F2 —— P2 · 更长名吞并依赖 LoreTable / lorebook key 存在
- 位置：`trigger.ts:69`（collectTableKnownNames）+ `recall.ts:39`
- 问题：`knownNames` 仅吸收「已启用 lorebook key」+「LoreTable 关键列值」。若"更长名"只存在于**正文散文**（未建表、未建词条 key），3 字 lorebook key 仍会在其前缀内被误召回。
  - 回归基线已自证：`trigger.test.ts:60-68` 明确「未传表格时 3字 key 前缀仍被误命中」——修复依赖 tables 传入。
  - 即只遮盖"表/key 承载更长名"的场景，散文承载更长名的场景仍漏。
- 建议：从 `recentText` 抽取更长实体名并入 `knownNames`；或对纯 lorebook 召回增加"命中处前后 CJK 且能拼出上下文更长词"的吞并；至少文档化该限制。
- 是否 Round 8 回归：**部分**——Round 8 仅覆盖表/key 场景，散文场景仍存。

### F3 —— P2 · `TABLE_KEY_COLS` 复用：属性列混入"吞并候选"
- 位置：`trigger.ts:15,34` / `recall.ts:23,46`
- 问题：行召回匹配与吞并候选集（`knownNames`）共用同一组 `keyCols`，其中包含 `status`/`type` 等**属性列**。其列值（如 `status="已死亡"`、`type="修仙小说"`）既用于"行召回命中"，又被当作"更长名吞并候选"。
  - 属性值并非实体名，作为吞并候选可能误吞一个真实不同义的 3 字 lorebook key（如「修仙小…」类边缘情形）。
- 建议：吞并候选集仅纳入实体名类列（name/title/key/place/building/live）；`status`/`type` 仅用于行召回、**不进 knownNames**。
- 是否 Round 8 回归：**否**（Round 8 引入 `collectTableKnownNames` 时沿用旧 `keyCols`，未区分两类用途）。

### F4 —— P2 · `apply-extraction` 服务端无建卡/建词条去重
- 位置：`src/app/api/agent/apply-extraction/route.ts:66`（characterCard.create）/ `:130`（lorebookEntry.create）
- 问题：当 `suggestion==="create" && isNew` 时直接 `create`，**未先查重**。若前端重复提交、或两次抽取对同一角色都标 `isNew`，会建出**多张同名角色卡 / 多个同名词条**。
  - 对照：`src/lib/entity-auto-creator.ts:170-183` 已有「精确（大小写不敏感）+ 相似度 + 批次内」三重去重，但此路由**绕过**了它。
- 建议：create 前 `findFirst({where:{projectId, name:{equals: name, mode:'insensitive'}}})`；或加唯一约束 / `upsert`；或统一收敛到 `autoCreateEntities`。
- 是否 Round 8 回归：**否**（历来如此，非 Round 8 引入）。

### F5 —— P2 · 吞并逻辑可能致"漏召回"（短 key 真实出场被吞）
- 位置：`trigger.ts:81` / `recall.ts:55,72`（`matchNameStrict` 已知更长度名吞并分支，match.ts:128-154）
- 问题：3 字 lorebook key 紧后 CJK 且该位置恰是某个更长 `knownName` 前缀时，被吞并 `return false`。若该"更长名"与短 key **实为不同实体**（如 lorekey `「碎玉轩」` vs 表值 `「碎玉轩内」` 代表不同地点），则短 key 真实出场时**不被召回（漏召回）**。
- 建议：吞并仅在"更长名与短 key 同实体族"时成立；或允许短 key 与更长名共存时仍按 `score` 排序保留（召回宁可冗余勿漏）。
- 是否 Round 8 回归：**是**——Round 8 把吞并逻辑接入活路径，放大了该"吞并 vs 漏召回"权衡的暴露面（修复召回误报的同时引入了召回漏报风险）。

---

## 结论

Round 8（v0.46.71）对青砚透镜的修复**确为真接线、非死代码假绿**：`findCharacterByName` 死代码干净删除；`loreTables` 经 context-loader → pre-processor / preview-context → `buildPromptContext` → `matchLoreEntries` 完整透传；`knownNames` 收集边界（≥2 字）正确；召回改动经 `engine.ts` 真实注入输出；OOC 相关吞并逻辑已从死代码搬入两条活路径。

**青砚透镜在 v0.46.71 下是否还有 P0/P1？**
- **P0：无**。原 P0（3 字 lorebook key 在更长表值前缀内误召回）已在真路径修复。
- **P1：有 1 项** —— **F1（数字子串误伤：`matchKeyword` 纯数字边界守卫被混合数字关键词绕过，如「2049年」误命中「12049年」）**，属检索词边界盲区，建议优先修。

其余 F2/F3/F4/F5 均为 **P2**（召回精度边界、属性列混入吞并候选、apply-extraction 缺服务端去重、吞并致漏召回），其中 F5 为 Round 8 引入的权衡暴露面，F1/F2/F3/F4 非 Round 8 回归。

> 说明：本报告为只读复验，上述修复方向仅供 Round 10 参考，未改动任何源码。
