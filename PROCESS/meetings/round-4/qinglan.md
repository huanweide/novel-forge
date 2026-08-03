# 清览 · Round 4 复验报告（实体高亮 / 阅读渲染 / 长文性能）

> 身份：会员股东·清览，透镜 = 实体高亮正确性 + 阅读渲染性能 + 长文体验
> 方法：**严格只读**，未改动任何 `src` 源码。逐项 Read 源码核对行号，并以 `tsx` 直接 import 真实 `src/core/entity-highlighter.ts` 跑了 4 个复验脚本（`_verify.ts` / `_cmp.ts` / `_perf.ts` 及引号边界单测）取实测证据。
> 范围：① 复验 Round 3 的 O(N·L)→O(L+命中) 正则修复是否真生效、有无回归/边界漏洞；② 以清览视角挖 NEW 真实 bug。
> 版本基线：当前 `entity-highlighter.ts` 已落地 Round 3 建议 A（单遍正则）。

---

## ① 回归确认（Round 3 修复是否稳）

**结论：性能修复稳，但引入 1 处高亮正确性回归（P0）+ 边界集仍有遗漏（P1）。**

- **性能 O(N·L)→O(L) 已生效，实测稳**：
  - 代码：`entity-highlighter.ts:162-166` 单遍正则 `new RegExp("(" + escaped.join("|") + ")", "g")`，取代原 `for 名 × while indexOf` 的 O(N·L)。
  - 实测（`_perf.ts`）：N=264 唯一实体名、L=30000 字正文，单次 `findEntitiesInText` ≈ **0.54ms**，远低于 16ms 掉帧阈值。原 O(N·L) 在最坏 N=300/L=3e4 约 9e6 次比较，现已消除。✅
  - 正则全部为 `escapeRegExp` 后的字面量 alternation（`entity-highlighter.ts:164`），**无 `*`/`+`/嵌套分组 → 线性时间，无 ReDoS 风险**。✅
- **历史语义未退化**：最长优先（同起点）、2 字仅头边界、停用词表、occupied 去重、输出按 `start` 升序（供 `splitTextNode` 依赖）——逐项 `_verify.ts` 复测通过，详见 ② 对照。
- **新增回归**：正则 alternation 的「最长优先」仅对**同起点**生效，**偏移重叠（长名起点更靠后）失效**，见 P0。

---

## ② P0 必修（高亮错误，按影响排序）

### P0-1 — 正则 alternation「最长名优先」在偏移重叠下失效（高亮指向错误实体，Round 3 修复直接引入的回归）

- **文件:行号**：`src/core/entity-highlighter.ts:172-191`（`while ((m = regex.exec(text)) ...)` 主循环）；根因是 `:166` 的 alternation 拼接方式 + `:178` 的 occupied 跳过发生在扫描后。
- **问题**：正则全局扫描 left→right，在某位置先命中**较短且靠前**的实体就 `lastIndex` 跳过后半段，导致起点更靠后、但更长更具体的实体**永远扫不到**而被跳过。这与旧 `indexOf`+最长优先排序（长名先处理、先占区间）行为不一致，也违反 `rehype-entity-highlight.ts:5` 注释声明的「最长名优先，避免短名提前吃掉长名的前缀」。
- **可复现**（实测 `_cmp.ts`，真实源码）：
  - 实体 `李星云`(3) + `星云剑法`(4)，正文 `李星云剑法`
    - **OLD**（indexOf 最长优先）：`星云剑法@1`（长名胜，正确）
    - **NEW**（当前正则）：`李星云@0`（短名胜，错误）
  - 即：读者看到被染色的反而是较泛的角色名，点击跳转/侧栏计数指向**错误实体**；更具体的功法/武器名反而漏高亮。
- **触发条件（真实且常见）**：某**短实体名 S** 在正文作为合法独立词出现于位置 p，且另一**更长实体 L**（词条/功法/武器/招式）与 S 共享中后段字符、且 L 起点落在 S 区间内（p < L.start ≤ p+|S|）。中文玄幻「角色名 + 其功法/招式/武器名」共用字极普遍（如 `林惊羽`/`惊羽诀`、`萧炎`/`炎帝` 类），一旦相邻书写即触发。
- **对照**：同起点重叠（`白云观`/`白云`→`白云观@0`，`_verify.ts` 通过）、无重叠（`萧炎`/`炎帝`→两者都中，`_cmp.ts` 通过）均无问题——**仅偏移重叠坏**。
- **建议修复**（保留 O(L) 单遍、恢复全局最长优先）：
  ```ts
  // entity-highlighter.ts:171-191 改为：先收集所有候选（lastIndex 每次 +1 以捕获重叠），再按长度降序贪心占用
  const raw: { name: string; idx: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    raw.push({ name: m[0], idx: m.index, end: m.index + m[0].length });
    regex.lastIndex = m.index + 1; // 关键：前进 1 而非匹配长度，捕获偏移重叠
  }
  raw.sort((a, b) => b.name.length - a.name.length || a.idx - b.idx);
  for (const r of raw) {
    if (occupied.slice(r.idx, r.end).some(Boolean)) continue;
    const prevChar = text[r.idx - 1];
    const isHeadBoundary = !prevChar || BOUND.test(prevChar);
    if (r.name.length >= 3 ? true : isHeadBoundary) {
      const entity = byName.get(r.name)!;
      matches.push({ name: r.name, color: entity.color, type: entity.type, category: entity.category, start: r.idx, end: r.end });
      for (let i = r.idx; i < r.end; i++) occupied[i] = true;
    }
  }
  ```
  - 复杂度：扫描 O(L)（每位置 advance 1，匹配次数少），排序 O(命中·log 命中)，仍为 O(L) 级，远优于旧 O(N·L)。名字长度均 ≥2 → `lastIndex=idx+1>idx` 必前进，**无死循环**。
  - 调用方（`rehype-entity-highlight.ts:30`、`ChapterEntitiesPanel.tsx:107`）签名不变、零改动。
- **影响范围**：所有经 `findEntitiesInText` 的高亮路径（正文 rehype 着色 + 侧栏实体计数 + 章节彩色徽章）。仅当库中存在「短名是长名中/后缀子串且相邻出现」的实体组合时可见，概率随大世界词条数上升。

---

## ③ P1 建议（阅读体验 / 高亮遗漏）

### P1-1 — 头边界集遗漏全角引号与方头括号 → 引号/书名号内的 2 字实体名不高亮（高亮遗漏）

- **文件:行号**：`src/core/entity-highlighter.ts:181`（边界正则 `/[\s，。！？、；：""''（）【】《》\-\—]/`）。
- **问题**：2 字实体名只查**头边界**（`:184` `name.length >= 3 ? true : isHeadBoundary`）。该集合含全角圆括号 `（）`、书名号 `《》`、方括号 `【】`，但**缺全角双引号 `“”‘’` 与方头括号 `「」『』`**——而这两类正是中文小说对话/内心独白最常紧接角色名的标点。结果：紧接 `“` 或 `「` 的 2 字名被判定「非边界」而**漏高亮**，阅读时人称忽明忽暗、体验断裂。（3 字+名不受影响，因其不查边界。）
- **可复现**（实测单测，真实源码）：
  - `“白云”` → 白云**未高亮** ⚠
  - `「白云」` → 白云**未高亮** ⚠
  - `《白云》` → 白云高亮@1（书名号在集内，对照正确）
  - `（白云）` → 全角 `（）` 在集内应高亮；半角 `(` 不在集内（符合现状，仅全角缺口需补）
- **建议修复**：边界集补全全角标点：
  ```ts
  /[\s，。！？、；：""''“”‘’「」『』（）【】《》\-\—]/
  ```
  注意 `「」『』` 与 `“”‘’` 为非 ASCII，直接写进字符组即可（无需转义）。仅扩大「视为边界」的范围，不会对已在集内的情形产生负作用。
- **影响范围**：所有 2 字实体名出现在引号/方头括号内处（对话、独白密集章节省略高亮），与 P0-1 同两调用方。

### P1-2 — CenterPanel 章节实体徽章扫描仍是 O(N·L) `.includes`（Round 3 修掉的同一退化味，未清）

- **文件:行号**：`src/components/workspace/CenterPanel.tsx:185-192`（`chapterEntities` 的 `for (const e of projectEntities) if (e.name && displayContent.includes(e.name))`）。
- **问题**：每渲染对**每个项目实体**做一次 `displayContent.includes(e.name)`。这是 `O(实体数 × 正文长)` 的朴素扫描——正是 Round 3 在 `findEntitiesInText` 里刚消除的 O(N·L) 退化味，只是换了个组件。`.includes` 是 V8 原生 `indexOf`，单次快，但随「大世界 200+ 词条 × 数万字正文」线性放大；且 `displayContent` 在流式/编辑期变化即重算。
- **可复现**：注册 200 实体 + 3 万字章 → `chapterEntities` 每次重渲染约 6×10⁶ 次字符比较（量级，未真机计时）；与 P0 修复同源，建议顺手根治。
- **建议修复**：复用高亮结果，避免二次全扫描。在 `findEntitiesInText` 已跑过的位置，把命中的 `name`→`entity` 去重收集即为本章实体集；或在 `MarkdownViewer` 完成高亮后通过回调/共享 memo 把去重实体名回传 `CenterPanel`，徽章直接消费，O(L) 一次扫描两用。
- **影响范围**：`CenterPanel` 章节彩色徽章条；随实体数/正文长退化，长文 + 大世界时主线程开销可观。

---

## ④ P2 优化（性能 / 一致性）

### P2-1 — `MarkdownViewer` 未 `React.memo`，父组件任意重渲染触发整章 markdown 重解析

- **文件:行号**：`src/components/workspace/MarkdownViewer.tsx:141`（函数组件无 memo）；调用方 `src/components/workspace/CenterPanel.tsx:331`。
- **问题**：`ReactMarkdown` 在每次渲染都重跑 remark/rehype 管线。父 `CenterPanel` 的 `worldTime` 草稿输入、`dailyGoal` 重读等状态变化都会触发 `MarkdownViewer` 重渲染，对**长章**等于无谓地把整章重新解析 + rehype 树遍历跑一遍（即便 `content` 未变）。
- **可复现**：打开长章 → 在「世界时间」输入框打字 → 正文区随每次按键重解析整章 markdown（DevTools Performance 可见长任务）。
- **建议修复**：`export default React.memo(MarkdownViewer)`（或 `export const MarkdownViewer = memo(function ...)`），并确认 `content`/`projectId`/`isStreaming` 引用稳定；`rehypePlugins` 已 `useMemo` 可复用。长章主线程开销降至仅在正文/实体变化时才解析。
- **影响范围**：阅读页长章交互流畅度。

### P2-2 — `useVirtualRows` 滚动回调无 rAF 节流，大表快速滚动重渲染抖动

- **文件:行号**：`src/hooks/use-virtual-rows.ts:32-35`（`onScroll` 直接 `setScrollTop(el.scrollTop)` 每事件触发 setState）；调用方 `src/app/workspace/[projectId]/tables/page.tsx:386-398`。
- **问题**：每次 `scroll` 事件（高频）同步 `setState` → 每次都重算 `virtualItems` 并重渲染行。万行表快速滚动时产生大量中间重渲染，若 overscan 不足可见中缝闪烁（撕裂感）。当前 `overscan=10`（≈340px 缓冲）较厚，通常能兜住，但重渲染本身浪费。
- **可复现**：在 >50 行结构化表（如大世界词条表）快速拖滚动条 → Performance 面板出现密集的 scroll→render 长任务。
- **建议修复**：`onScroll` 用 `requestAnimationFrame` 节流 + `passive` 监听；或在 rAF 内读取 `scrollTop` 仅在跨越行阈值时更新 state。行 `key={r.row_id}`（tables/page.tsx:411）稳定，无需改 key 逻辑。
- **影响范围**：结构化数据表（tables 页）大表滚动体验。

### P2-3 — 非 markdown 纯文本区实体名仍不上色（一致性缺口，Round 3 已记，未修）

- **文件:行号**：`src/core/entity-highlighter.ts` 仅被 `rehype-entity-highlight.ts` 与 `ChapterEntitiesPanel.tsx` 两处调用；游戏对话气泡 / 卡片列表 / 仪表盘表格（纯 React 文本）未接入。
- **问题**：正确性无错，但同一实体在正文中彩色、在侧栏/对话气泡中黑白，阅读一致性断裂。
- **建议修复**：抽 `<EntityText text />` 复用 `findEntitiesInText`，在纯文本区复用；对齐 `SKIP_TAGS` 语义避开代码块/输入态。纯逻辑，风险低。
- **影响范围**：全局实体着色一致性。

---

## ⑤ 优先级小结

| 级别 | 项 | 一句话 |
|---|---|---|
| P0 | ②P0-1 | 正则偏移重叠最长优先失效 → 高亮指向错误实体（Round 3 修复直接引入） |
| P1 | ③P1-1 | 头边界集缺全角引号/方头括号 → 引号内 2 字名漏高亮 |
| P1 | ③P1-2 | 章节徽章 `includes` 仍是 O(N·L)，与 Round 3 修掉的退化同源 |
| P2 | ④P2-1 | `MarkdownViewer` 未 memo，长章重渲染重解析 |
| P2 | ④P2-2 | 虚拟滚动 onScroll 无 rAF 节流 |
| P2 | ④P2-3 | 非 markdown 区未接入高亮（一致性） |

> 反自欺备注：P0-1 / P1-1 / P1-2 均经真实源码 `tsx` 实测复现；性能数字来自 `_perf.ts` 实测（单次 0.54ms），非推断。所有结论指向具体文件:行号，未改动任何源码。临时复验脚本（`_verify.ts`/`_cmp.ts`/`_perf.ts`）已留于本目录备查，可随时删除。
