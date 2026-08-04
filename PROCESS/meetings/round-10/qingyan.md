# 青砚透镜 · Round 10 只读质量复验报告

- 对象仓库：`/c/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge`（git `main`，HEAD = `c824cd2` Round 9 记忆回写）
- 复验版本：`v0.46.72`（Round 9 实现 commit `7814d03`）
- 透镜：三卡检索词边界 + 召回注入 + 自动建卡去重 + 禁词扫描（关心「林」误命中、繁简/错字变体重复、大世界 200+ 词条召回截断）
- 方式：**只读**，未修改任何源码；本报告为唯一产出文件。

---

## 回归验证（Round 9 → v0.46.72 对青砚透镜的修复是否真落地且没回退）

### VR1. `matchKeyword` 含数字关键词的数字边界守卫 —— 已落地 ✅
- `git show 7814d03 -- src/core/text/match.ts` 确认：原 `if (len >= 3 && !isPureDigit) return true;`（match.ts:55 旧）被替换为「含数字则走词边界循环」分支（match.ts:56-77）。
- 守卫逻辑（match.ts:58-74）：对含数字且非纯数字的 ≥3 字关键词，逐位置检查——
  - `firstIsDigit && beforeNum`（首字符是数字且紧前也是数字）→ 跳过该位置；
  - `lastIsDigit && afterNum`（末字符是数字且紧后也是数字）→ 跳过该位置；
  - 否则 `return true`。
- 代入青砚 P1 用例：
  - `「2049年」` vs `「12049年」`：命中位置紧前 `「1」` 是数字且首字符 `「2」` 是数字 → 跳过 → 不命中 ✓（正是预期修复）。
  - `「2049年」` vs `「到了2049年发生了」`：`before="了"`(CJK)、`after="发"`(CJK) 均非数字 → `return true` → 命中 ✓。
- 结论：数字边界守卫确为真接线，逻辑与青砚 P1 描述一致。

### VR2. 纯数字 / 无数字关键词行为不变 ✅
- 纯数字（如 `「2049」`）：仍走 `isPureDigit` 守卫（match.ts:54），进入下层长度判定，行为同 Round 8（测试 `纯数字「2049」仍走词边界逻辑、不命中「120499」` 通过）。
- 无数字关键词（如 `「青龙镇」`）：`/[0-9]/.test(needle)` 为 false，直接 `return true`（match.ts:76），直命中分支未受影响（测试 `无数字关键词「青龙镇」保持直命中` 通过）。
- 结论：`7814d03` 仅新增「含数字」子分支，纯数字与无数字路径零改动，无回退。

### VR3. `match.test.ts` 全绿且覆盖青砚 P1 用例 ✅
- `npx vitest run src/core/text/match.test.ts` → **28 passed (28)**（8ms）。
- 含专项用例（match.test.ts:115-145）：
  - `「2049年」` 不命中 `「12049年是个节点」`（L118，`toBe(false)`）✓
  - `「2049年」` 命中 `「到了2049年发生了」`（L122，`toBe(true)`）✓
  - `「2049年」` 命中句尾 `「故事终结于2049年」`（L126）✓
  - `「第3章」` 命中 `「本章标题为第3章内容」`（L130）✓
  - `「第3章」` 不命中 `「第13章」`（L134，字符串层面非子串）✓
- 结论：青砚 P1 修复有真实测试背书，非假绿。

### VR4. `trigger.test.ts` 全绿 —— 吞并逻辑无回归 ✅
- `npx vitest run src/core/assembly/trigger.test.ts` → **5 passed (5)**（4ms）。
- 已知 3字+ 最长匹配吞并（`knownNames` 机制）在 Round 9 未被触碰，行为延续 Round 8，无回归。

### VR5. `matchNameStrict` 经数字守卫一致、无连带回归 ✅
- `matchNameStrict` 对 `len>=3 且非 2字CJK` 走 `base = matchKeyword(text, keyword)`（match.ts:147）。`「2049年」`(len4, 含数字, keywordIsCjk=false) 经 `matchKeyword` 数字守卫，故 `matchNameStrict("12049年…","2049年")` 也返回 false，与 `matchKeyword` 行为一致。
- `len>=3 且 keywordIsCjk` 分支（match.ts:150）仅当 `keywordIsCjk` 为真才进入吞并逻辑；含数字关键词 `keywordIsCjk=false`，不受此分支影响，回退 `base`，无连带改动。

### 回归结论
Round 9（v0.46.72）对青砚透镜的**数字边界守卫确为真落地、无回退**：
- 含数字关键词（如 `「2049年」「第3章」）的数字子串误伤已被守卫消除；
- 纯数字、无数字、以及 `matchNameStrict` 的吞并/边界分支行为均未改变；
- `match.test.ts`(28) 与 `trigger.test.ts`(5) 全部通过，无新回归。

---

## 新发现问题（青砚透镜）

### G1 —— P2 · 2字 CJK 名不受 `knownNames` 吞并保护（OOC/召回误检）
- 位置：`src/core/text/match.ts:142-144`（`matchNameStrict` 的 2字 CJK 分支直接 `return true`，不进入吞并逻辑）。
- 问题：3字+ 名有最长匹配吞并（match.ts:150-176），但 2字 CJK 名（如 `「叶凡」「林动」）命中后一律 `true`，**无法被已知更长名吞并**。若正文出现更长不同名 `「叶凡一」「林动天」`，名为 `「叶凡」「林动」` 的 lorebook/角色卡会被误召回，污染 OOC 召回上下文——与任务点「OOC 角色名检测漏检」对应。这是 Round 4 P0（2字无条件命中防漏检）与 Round 8 吞并保护（仅3字+）之间的缺口。
- 建议（精确修法，仅增加可选吞并、不改变无 `knownNames`/常规行文的 P0 语义）：
  ```ts
  if (len === 2 && keywordIsCjk) {
    const known = options?.knownNames;
    if (known && known.length) {
      let idx = hay.indexOf(needle);
      while (idx >= 0) {
        const afterIdx = idx + len;
        const after = afterIdx < hay.length ? hay[afterIdx] : "";
        if (after !== "" && isCjkChar(after)) {           // 紧后 CJK 才可能属更长名前缀
          let swallowed = false;
          for (const n of known) {
            const nl = n.toLowerCase();
            if (nl.length > needle.length && hay.startsWith(nl, idx)) { swallowed = true; break; }
          }
          if (swallowed) { idx = hay.indexOf(needle, idx + 1); continue; }
        }
        return true;                                      // 未被吞并 → 仍命中（保留 P0）
      }
      return false;
    }
    return true;                                          // 无 knownNames → 维持原 P0 行为
  }
  ```
- 是否 Round 9 回归：**否**（历史遗留，Round 9 未改 2字 分支）。

### G2 —— P2 · 禁词精确词无词边界（中英文混排误报）
- 位置：`src/lib/forbidden-checker.ts:201-217`（`exact_word` 用 `text.indexOf(item.pattern, searchFrom)` 纯子串，无边界判定）。
- 问题：
  - 英文/拼音精确禁用词（或自定义词如 `「AI」`）会命中任意子串：`indexOf("ai")` 命中 `「email」`(idx1)、`「said」`(idx1)、`「waiter」`——中英文混排边界缺失，产生误报。
  - 中文词 `「此外」` 命中 `「除此之外」`（子串），属无边界误报。
- 建议：精确词匹配增加词边界判定——英文/拼音词要求前后非 `[A-Za-z0-9]`（可复用 `match.ts` 的 `isBoundaryChar` 思路）；中文词保持子串（中文无空格），但至少对自定义英文词加边界，避免 `email` 误报 `AI`。
- 是否 Round 9 回归：**否**（历来如此，与数字边界无关）。

### G3 —— P2 · `recallContext` 无内部上限 + `knownNames` 大世界爆量（性能/上下文）
- 位置：`src/core/babylore/recall.ts:90`（出口 `return items` 无 slice）+ recall.ts:34-49（`knownNames` 累积全部 lorebook keys + 表格所有关键列值，无去重/上限）；仅 `src/core/babylore/loop.ts:60` 用 `.slice(0, 12)` 兜底。
- 问题：200+ 词条时 `knownNames` 可达数百~上千；`matchNameStrict` 对 3字+ 在每个命中位置遍历 `knownNames`（recall.ts:55、:72）。复杂度约 `O(词条×键×文本位×knownNames)`，200+ 词条易达数亿次比较，单次召回延迟显著；且 `recallContext` 自身不截断，完全依赖 `loop.ts` 的 12 上限——若新增调用方未截断即上下文爆量（与任务点「大世界 200+ 词条召回截断」对应）。
- 建议：`knownNames` 先 `new Set` 去重；或在 `recallContext` 出口加 `slice(maxResults??15)` 双保险；词匹配时可只对长度相近的 knownName 做前缀判定（减少遍历）。
- 是否 Round 9 回归：**否**（Round 9 未改 recall）。

### G4 —— P2 · `apply-extraction` 建卡/建词条无服务端去重（重复建卡）
- 位置：`src/app/api/agent/apply-extraction/route.ts:64-77`（`characterCard.create`）、`:129-139`（`lorebookEntry.create`）。
- 问题：`suggestion==="create" && isNew` 直接 `create`，**未先查重**。对照 `src/lib/entity-auto-creator.ts:170-183` 已有「精确（大小写不敏感）+ 相似度 + 批次内」三重去重，但此路由**绕过**它。前端重复提交或 LLM 对同一角色标 `isNew` 两次 → 多张同名角色卡 / 多个同名词条（与任务点「自动建卡去重」对应）。
- 建议：create 前 `findFirst({where:{projectId, name:{equals:name, mode:'insensitive'}}})`；或收敛到 `autoCreateEntities`；或 DB 加唯一约束 + 捕获 P2002。
- 是否 Round 9 回归：**否**（与 Round 9 无关）。

### G5 —— P2 · `apply-extraction` 建卡无繁简/错字变体去重（重复建卡）
- 位置：`src/lib/entity-auto-creator.ts:109-120`（`isSimilarName` 含繁简归一 + 编辑距离，✓ 已防护）**vs** `src/app/api/agent/apply-extraction/route.ts:64-139`（直接 create，完全不调用 `isSimilarName`）。
- 问题：蒸馏自动建卡走 `autoCreateEntities` 有变体去重；但 `apply-extraction` 路由建卡既不精确去重也不变体去重。于是「青龙镇」已存在时，该路由仍可建 `「青龍镇」「青龙填」` 等同义变体 → 重复建卡（与任务点「繁简/错字变体重复」直接对应）。
- 建议：`apply-extraction` 建卡前复用 `isSimilarName` 做变体查重（与 `autoCreateEntities` 对齐）。
- 是否 Round 9 回归：**否**。

### 遗留未决（非新发现，来自 Round 9 报告 F5，本轮复测仍存）
- `matchNameStrict` 3字+ 吞并（`match.ts:150-176`）在「更长名与短 key 实为不同实体」时会致短 key 真实出场被吞、漏召回（recall.ts:55、trigger.ts:81 经 `knownNames`）。属 Round 8 引入的权衡暴露面，Round 9/10 均未动。不计入本轮回新 P 计数。

---

## 结论

Round 9（v0.46.72）对青砚透镜的**数字边界守卫确为真落地、无回退**：`matchKeyword` 含数字 ≥3 字关键词已加数字边界循环，`「2049年」` 不再误命中 `「12049年」` 且命中 `「到了2049年」`；纯数字/无数字/吞并分支零改动；`match.test.ts`(28) 与 `trigger.test.ts`(5) 全绿，无新回归。

**青砚透镜在 v0.46.72 下是否有 P0/P1？**
- **P0：无**。
- **P1：无**（Round 9 的青砚 P1 数字子串误伤已闭环；新挖问题均未达 P1）。
- **P2：5 项**（G1 2字名吞并缺口 / G2 禁词词边界 / G3 大世界召回爆量 / G4 apply-extraction 无去重 / G5 apply-extraction 无繁简变体去重）。

最优先项：**G4 + G5**（`apply-extraction` 建卡既无精确去重也无繁简变体去重）——直接命中「自动建卡去重 / 繁简错字变体重复」核心透镜，且修复成本极低（复用已有 `isSimilarName` / 加 `findFirst` 查重），可避免持久化重复角色卡/词条污染三卡召回与 OOC 上下文。

> 说明：本报告为只读复验，未改动任何源码；涉及真机 LLM 的 OOC 分类（`orchestrator.ts` Agent D）未经实测、待验证。
