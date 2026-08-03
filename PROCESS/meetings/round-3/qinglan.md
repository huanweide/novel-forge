# 清览 · Round 3 体验报告（实体高亮正确性 / 暗色原生控件 / 渲染性能）

> 身份：会员股东，透镜 = 实体高亮正确性 + 暗色原生控件可读性 + 正文高亮渲染性能
> 方法：严格只读，未改动任何 `src` 源码；逐项 Read 源码核对行号，对照 Round 1/2 报告与当前代码（v0.46.65）。
> 范围：复验 Round 2 已通过项是否有回归 + 复验 Round 2 提出的 P1 O(N·L) 是否已被修 + 挖新坑。

---

## ① 历史修复回归核实

### 1）2 字实体名「仅查头边界」放宽 —— 仍在位，无回归
- `src/core/entity-highlighter.ts:176`：`const passesBoundary = name.length >= 3 ? true : isHeadBoundary;`
  - 与 Round 2 报告核对的行完全一致，**字符级未变**。2 字名仅校验 `prevChar` 头边界，3 字+恒 `true`（不查边界）。
- 头边界集合 `:173` 仍为 `/[\s，。！？、；：""''（）【】《》\-\—]/`，未删改。
- 最长优先 + `occupied` 去重仍在（`:155-157` 长度降序排序；`:180` 命中后置位；`:169` 子串命中跳过）。
- **结论：通过**，Round 1 放宽仍在，Round 2 担忧的「白云观/白云」子串误叠加仍由 longest-first + occupied 自动规避。

### 2）3 字及以上行为未变 —— 通过
- `:176` 3 字+ `passesBoundary` 恒 `true`，与改动前一致，无回归。

### 3）COMMON_STOP_WORDS 停用词表 —— 通过，未删减
- `:131-143` 单字代词/虚词 + 双字泛化词集合完整；`:156` 过滤 `name.length >= 2 && !COMMON_STOP_WORDS.has(name)` 仍在。
- 单字实体（length<2）仍被 `length>=2` 直接拦掉，停用词双字仍不染色。无回归。

### 4）暗色原生控件（Round 2 · P2）—— 未变，仍仅 `color-scheme:dark` 兜底
- `globals.css` 仍无 `select {}` 基础规则与 `accent-color`（`color-scheme: dark` 在 `.dark` 作用域仍在，浏览器自动暗色渲染）。即 Round 2 评估的「已缓解、仅观感缺口」状态保持不变。本轮不重复计 P，见 ③。

---

## ② 仍待修 / 新发现问题（纯逻辑 vs 需实测）

### P1 — 高亮扫描 O(N·L) 朴素逐名 indexOf **至今未修**（纯逻辑可修，但量级需实测确认）
- **现状**：Round 2 提出的 P1 在 v0.46.65 仍是 Open 状态，代码未动。
  - `entity-highlighter.ts:162-186`：外层 `for` 遍历每个实体名（N），内层 `while`+`text.indexOf(name, pos)` 扫描全文（L）。复杂度 = **实体数 × 正文长**。
  - `:169` `occupied.slice(idx, end).some(Boolean)` 每次命中新建子数组并遍历，是叠加开销点。
- **更糟的现实放大器（本轮新确认）**：`findEntitiesInText` 在 rehype 路径是**按文本节点逐次调用**，不是整章一次。
  - 调用链：`walkAndHighlight`(`rehype-entity-highlight.ts:84`) → 每个 text 子节点 `splitTextNode(:100)` → `findEntityRanges(:30)` → `findEntitiesInText`。
  - 即一章有 M 个文本节点，则 `findEntitiesInText` 执行 M 次，每次对**全部 N 个实体**扫描该节点文本。总工作量 = Σ_nodes(N × len(node)) = **N × L_total**（与一次整段等价，但节点数放大了重复调度开销，且每节点重建 `occupied` 数组）。
  - 另一调用方 `ChapterEntitiesPanel.tsx:107` 在 `useMemo` 中整段调用一次（随 `chapterContent`/`entityMap` 变化重算），量级同上。
- **是否纯逻辑可修**：是。整段算法改写（单遍正则 / Trie / 首字分桶）都不依赖任何浏览器/DOM API，签名 `findEntitiesInText(text, map)` 不变，两个调用方零改动（已用 Grep 确认仅 2 个调用点：`rehype-entity-highlight.ts:30` 与 `ChapterEntitiesPanel.tsx:107`）。
- **是否需运行时实测**：是（仅用于**量化**与**决定是否需要 Web Worker**，不改方向）。
  - 估算：N=300、L=30000 → 约 9×10⁶ 次 char 比较 + 每命中 `slice` 分配；V8 原生 `indexOf` 快，最坏约数十 ms。N=500、L=10⁵（大世界长篇）可能触达 100ms+，在低端机输入/滚动时可见卡顿。但这是量级推断，**未真机测量**，不视为已证实「必卡」。

### P2（维持 Round 2，非新坑）— 非 markdown 区域实体名不上色（一致性缺口）
- 高亮仍只在 (a) markdown 正文 rehype、(b) 侧栏计数 两处生效。游戏对话气泡 / 卡片列表 / 仪表盘表格（纯 React 文本）不染色。正确性无错，一致性缺口。纯逻辑可补（抽 `<EntityText>` 复用 `findEntitiesInText`），但需与 SKIP_TAGS 对齐避免代码块误染。

### 本轮未新增其他 P0/P1 缺陷
- 章头/代码块误高亮：SKIP_TAGS 含 `h1-h6/blockquote/code/pre/a` 且 `walkAndHighlight:91` 遇之直接 `return`，无回归。
- 头边界对汉字前缀仍拒绝（如「小|白云」→ `isHeadBoundary=false`→不高亮），防护有效，未因放宽退化。

---

## ③ 建议（含具体可落地优化写法）

### 建议 A（P1，立即落地，纯逻辑）— 单遍正则替代逐名 indexOf
保留全部现有语义（最长优先、2 字仅头边界、occupied 去重），仅改 `findEntitiesInText` 内部循环。

```ts
// entity-highlighter.ts —— 仅替换 :159-186 的 for/while 块
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findEntitiesInText(
  text: string,
  entityMap: Map<string, EntityHighlight>,
): EntityMatch[] {
  const sorted = Array.from(entityMap.entries())
    .filter(([name]) => name.length >= 2 && !COMMON_STOP_WORDS.has(name))
    .sort((a, b) => b[0].length - a[0].length);   // 长度降序 → 左最长优先
  if (sorted.length === 0) return [];

  const occupied = new Array(text.length).fill(false);
  const matches: EntityMatch[] = [];

  // 单遍扫描：按长度降序拼接，regex 在每位置先试长名 → 天然最长优先
  const pattern = new RegExp(
    "(" + sorted.map(([n]) => escapeRegExp(n)).join("|") + ")",
    "g",
  );

  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const idx = m.index;
    const name = m[0];
    const end = idx + name.length;

    // 区间内已被更长匹配占用 → 跳过（原 occupied 去重语义保留）
    let hit = false;
    for (let i = idx; i < end; i++) if (occupied[i]) { hit = true; break; }
    if (hit) { pattern.lastIndex = idx + 1; continue; }

    // 边界：仅 2 字名查头边界（与现有 :173/:176 语义一致）
    const prevChar = text[idx - 1];
    const isHeadBoundary =
      !prevChar || /[\s，。！？、；：""''（）【】《》\-\—]/.test(prevChar);
    const passes = name.length >= 3 ? true : isHeadBoundary;
    if (!passes) { pattern.lastIndex = idx + 1; continue; }

    const ent = entityMap.get(name)!;
    matches.push({ name, color: ent.color, type: ent.type, category: ent.category, start: idx, end });
    for (let i = idx; i < end; i++) occupied[i] = true;
  }
  return matches;
}
```

- **复杂度**：由 O(N·L) 降到 **O(L + 命中数)**（单遍）。按首字符分桶 / Aho–Corasick 是更优备选（实体极多时 regex 交替开销略升），但 regex 单遍实现最小、风险最低、语义等价，优先采用。
- **等价性核验点**：最长优先靠「降序拼接 + 每位置先试长名」保证；2 字头边界、occupied 去重逐字保留；节点首字符 `prevChar` 为 `undefined` 时仍判为边界（与现有 `!prevChar` 一致）。调用方零改动。

### 建议 B（P1，需实测决策）— 是否上 Web Worker
- 单遍改写后即使 L=10⁵ 也应在数 ms 级，主线程风险基本消除。仅当真机实测长篇仍 >16ms（掉帧）才考虑把 `findEntitiesInText` 移入 Worker；属架构改动，**非纯逻辑**，留待实测后定，本轮不强制。

### 建议 C（P2，纯逻辑）— 非 markdown 区接入高亮
- 抽 `<EntityText text />` 小组件复用 `findEntitiesInText`，在对话气泡 / 卡片列表 / 仪表盘表格复用；注意避开代码块/输入态（对齐 SKIP_TAGS 语义）。

### 建议 D（P2，纯 CSS）— 暗色原生控件补显式样式
- 在 `.dark` 作用域加 `select{background:var(--nv-surface-2);color:var(--nv-text-primary);border:1px solid var(--nv-border-2);}` 与 `input[type=checkbox],input[type=radio]{accent-color:var(--nv-primary);}`，仅统一观感，`color-scheme:dark` 已兜底，不阻断阅读。

---

## 优先级
1. **P1（纯逻辑，本轮应修）**：`entity-highlighter.ts` 单遍正则改写，消除 O(N·L) 及「按文本节点逐次调用」的叠加开销，对外零破坏性。
2. **P1（需实测）**：真机量化大作品（数百实体 × 数万字）耗时，决定是否需 Web Worker。
3. **P2**：非 markdown 区高亮一致性、暗色原生控件显式样式。

> 反自欺备注：O(N·L)「可能卡顿」是复杂度推断，**非已测量事实**；本轮只诊断未改码，A 方案为可落地但未经实施的写法，待 Chair 实现后由下一轮复验实测耗时。
