# 清览 · Round 5 复验报告（实体高亮回归 + 阅读/弹窗/卡片/下拉 UI 实地核查）

> 身份：会员股东·清览，透镜 = 实体高亮正确性 + 暗色下拉对比度 + 弹窗滚动溢出 + 书卡可见 + 响应式断点
> 方法：**严格只读**。证据来源三类：① 逐项 Read `src` 源码核对行号；② 通过 `npx tsx` **直接 import 真实 `src/core/entity-highlighter.ts`**（取 `m.default`）跑边界/性能实测；③ 读 `globals.css` 与组件样式类事实。
> 基线：`HEAD=0a62a1f`（v0.46.67，Round 4 落地）。复验对象 = Round 4 我的 P0-1 修复（`entity-highlighter.ts` 候选收集改造）。
> 铁律遵守：未 Write/Edit 任何 `src`/测试/changelog/配置；本报告为唯一新建文件。

---

## 一、Round 4 P0-1 修复复验（必查 ①②③④）

### ① 嵌套/重叠实体名取最长 —— ✅ 已修复（实测）
- 修复落点：`entity-highlighter.ts:170-196`。收集阶段 `regex.lastIndex = idx + 1`（`:177`，每命中仅前进 1，捕获偏移重叠候选）；排序 `b.name.length - a.name.length || a.idx - b.idx`（`:181`，最长优先 + 左优先）；贪心占用 `occupied`（`:184-195`）。
- 实测（真实源码，`m.default.findEntitiesInText`）：
  - `李星云`(3) + `星云剑法`(4)，正文 `李星云剑法` → 输出 **`["星云剑法@1"]`**（长名胜，正确；Round 4 描述的回归 `李星云@0` 已消除）。
  - 同起点 `白云观`/`白云` → `白云观@2`（最长优先，正确）。
- 结论：偏移重叠与同起点重叠均正确取最长。

### ② 候选收集完整性（边界） —— ✅ 三类边界全过；但发现连词边界缺口（见新坑 P1-2）
- 实测真实源码：
  - **实体名在文本最末**：`白云观` 在 `终点白云观` → `白云观@2`（正则命中末位，lastIndex 推进至末尾后 `exec` 返回 null，候选完整收集）。
  - **连续重复名**：`李星云李星云` → `["李星云@0","李星云@3"]`（两个候选均收集）。
  - **同名多次出现（非连续）**：`李星云来李星云走` → `["李星云@0","李星云@4"]`。
- 三类边界均正确。但 **2 字名头边界集缺连词**（`entity-highlighter.ts:189` 边界正则不含 `与/和/跟/同/等`），导致 `萧炎与炎帝` → 仅 `["萧炎@0"]`，`炎帝@3` 因前导 `与` 非边界且长度为 2 被丢弃（见 P1-2）。

### ③ 复杂度仍为近似线性 —— ✅（实测）
- 实测：N=264 唯一实体名、L=30000 字正文，单次 `findEntitiesInText` ≈ **0ms**（<1ms，远低于 16ms 掉帧阈值）。
- 扫描每步 `lastIndex` 至少 +1（命中前进 1、未命中由正则内部 +1）→ 扫描 O(L)；排序 O(k·log k)；`occupied.slice(...).some` 每候选 O(名字长，常数级)。**无 O(N·L) 回退**，Round 3 修复未回归。正则全为 `escapeRegExp` 字面量 alternation（`:164`），无 `*`/`+`/嵌套分组 → 无 ReDoS。

### ④ 与关键词/OOC 名称高亮叠加冲突 —— ✅ 当前无冲突（已收敛，附防患）
- 阅读渲染路径仅 **单一着色层**：`MarkdownViewer.tsx:159-166` 仅向 `rehypePlugins` 推 `rehypeEntityHighlight`（单一插件），`rehype-entity-highlight.ts` 是唯一的文本节点拆分器；`ChapterEntitiesPanel` 另走一份 `findEntitiesInText` 但不产生嵌套 span。
- 全仓 grep `关键词/keyword/OOC` 命中的组件（`ContextPreview`/`LorebookEditDialog`/`WorldEditor`/`WorldEntryCard`）均为「触发关键词」字段标签，**阅读正文无第二种高亮 overlay**。故「同段文本既匹配关键词又匹配实体名」的嵌套冲突当前不存在。
- 防患建议（非当前 bug）：若未来接入关键词高亮，二者都是对 HAST 文本节点的 span 拆分器，须保证同一文本节点只被一个拆分器切分（互斥），否则会产生 span 嵌套/区间重叠渲染错乱。
- 「高亮 vs 选中态样式冲突」：核查 `entity-highlight` span 用内联 `style="color:...;font-weight:600"` + hover `box-shadow:0 0 0 1.5px currentColor`（`globals.css:784-799`），无祖先 `.selected` 覆盖其 `color` 的写法 → **当前无冲突，收敛**。

---

## 二、新坑（实地挖出，基于源码/样式事实）

### P1-1 — 多个 bare 弹窗缺 `max-h`/`overflow`，长内容溢出视口且不可滚动（弹窗滚动溢出）
- **文件:行号**：`src/components/workspace/BackupDialog.tsx:59`、`ImportDialog.tsx:69`、`MemoryDecayDialog.tsx:92`、`ExportDialog.tsx:95`。
- **现状**：均用 `<Modal bare panelClassName="...">`。其中：
  - `BackupDialog`(`max-w-md`)、`ImportDialog`(`max-w-md`)、`MemoryDecayDialog`(`w-[460px] max-w-[92vw]`)——**既无 `max-h` 也无 `overflow`**，面板高度完全由内容撑开；内容较长或视口偏矮时，面板超出屏幕高度却无任何滚动容器，底部按钮/说明不可达。
  - `ExportDialog`(`max-h-[85vh]`)——**有 `max-h` 但无 `overflow-y-auto`**，内容超 85vh 时被裁切、底部无法滚动到达（其内部仅有预览区 `:64` 自带 `overflow-y-auto`，但格式选择网格 + 标题 + 页脚整体不滚动）。
- **对照**：同批 `BuildConfigDialog`/`OutlineDialog`/`PreGenConfirm`/`ProjectConfigPanel` 等正确加了 `overflow-y-auto`（或 `flex flex-col overflow-hidden` + 内层滚动），说明约束是约定俗成而非强制——缺约束的这几处是漏网。
- **期望**：任何 bare 弹窗内容都可能超出视口，应统一保证「面板有 `max-h-[…vh]` + `overflow-y-auto`」，或采用「header `shrink-0` + 内容区 `flex-1 overflow-y-auto` + footer `shrink-0`」三段式（后者体验更好，header/footer 常驻）。
- **具体修法**：为上述四处补约束。例：`BackupDialog`/`ImportDialog`/`MemoryDecayDialog` 改为 `panelClassName="… max-h-[88vh] overflow-y-auto"`；`ExportDialog` 在 `max-h-[85vh]` 后补 `overflow-y-auto`。更彻底：在 `Modal.tsx:98-100` 的 `bare` 分支默认追加 `max-h-[90vh] overflow-y-auto`（与 `non-bare` 一致），把约束固化进组件，杜绝后续遗漏。

### P1-2 — 2 字实体名头边界集缺连词/引号/方头括号 → 高亮遗漏（高亮正确性，我的透镜）
- **文件:行号**：`src/core/entity-highlighter.ts:189`（头边界正则 `/[\s，。！？、；：""''（）【】《》\-\—]/`）。
- **现状**：2 字实体名只查**头边界**（`:191` `name.length >= 3 ? true : isHeadBoundary`）。该集合含全角圆括号 `（）`、书名号 `《》`、方括号 `【】`，但**缺常见连词 `与/和/跟/同/等/把/被/给/向/对/由` 与全角引号 `“”‘’`、方头括号 `「」『』`**。
- **实测**（真实源码）：`萧炎与炎帝` → `["萧炎@0"]`，`炎帝@3` 因前导 `与` 非边界且长度 2 被丢弃。对话/内心独白中「`与/和`+2字名」极普遍（如「`与林惊羽`」「`和萧炎`」），导致 2 字实体名在连词后**静默漏高亮**，阅读时人称忽明忽暗、侧栏计数偏低。
- **对照**：Round 4 我的 P1-1 仅补了全角引号/方头括号的建议，但**当时未落地**（当前 `:189` 仍不含），且连词缺口从未被覆盖——本条是 P1-1 的延续 + 扩大。
- **期望**：中文连词与引号/方头括号均为明确的词边界，应纳入头边界集合，使 2 字名在它们之后正常高亮。
- **具体修法**：将边界集补全为
  `/[\s，。！？、；：""''“”‘’「」『』（）【】《》\-\—与和跟同及等把被给向对由的]/`
  （非 ASCII 引号/方头括号直接入字符组，无需转义）。仅扩大「视为边界」范围，对已在集内情形无负作用；3 字+名本就不查边界不受影响。

### P2-1 — 暗色原生下拉 `option` 背景用半透明 token，对比度脆弱（暗色下拉对比度）
- **文件:行号**：`src/app/globals.css:1268-1275`（`select option, select optgroup { background-color: var(--nv-surface-2); color: var(--nv-text-primary); }`）。
- **现状**：全仓有 20 处原生 `<select>`（`grep -rn "<select" src/components src/app`）。暗色主题下 `--nv-surface-2 = rgba(255,255,255,0.055)`（`globals.css:85`）——**近乎透明的半透明值**。原生 `<option>` 弹出层背景依赖浏览器/OS 合成：透明背景在弹层中常回退为 OS 默认（Windows/Linux Chrome 弹出层常呈浅色），而文字 `color: var(--nv-text-primary)` 在暗色下为 `#F8F7F2`（近白，`globals.css:108`）。一旦弹出层背景回退为浅色，**近白文字落在浅底 → 对比度崩塌、文字近乎不可见**（经典暗色下拉 bug）。
- **期望**：下拉弹出层文字与背景对比度 ≥ 4.5:1（WCAG AA），且不依赖页面穿透。
- **具体修法**：将 `option` 背景改为**不透明暗色**而非半透明 token，例如 `background-color: var(--nv-abyss);`（`#161E34`，`globals.css:83`），保留 `color: var(--nv-text-primary)`；并在 `:root.light` 下给浅色版（背景白、文字 `#1A1C22`）。让弹出层对比度由自身颜色决定，而非依赖页面透视。

### P2-2 — 书卡网格窄栏不降级 + 卡片标题无溢出保护（书卡可见/响应式）
- **文件:行号**：`src/components/workspace/WorldEntryList.tsx:34`（`grid grid-cols-2 gap-2`）；`src/components/workspace/WorldEntryCard.tsx:15`（根 `div` 无 `min-w-0/overflow-hidden`）、`:19`（标题 `span` 无 `truncate`/`line-clamp`）。
- **现状**：右侧栏在 `<lg` 时为抽屉 `w-80 max-w-[85vw]`（≈320px，`workspace/[projectId]/page.tsx:1015-1017`），此处书卡网格**硬编码 `grid-cols-2`**，每张卡约 140px；卡片根容器未加 `min-w-0`，标题 `span`（`:19`）未截断。当书名为长英文/无空格长 token 时，标题不折行 → **横向溢出卡片、挤压相邻卡或触发横向滚动**；窄栏下 2 列也过于拥挤。
- **对照**：列表视图（`space-y-1`，`:34`）为整宽，无此问题；问题集中在网格视图窄容器。
- **期望**：窄容器下网格自动降为 1 列，且卡片标题/内容不溢出。
- **具体修法**：`WorldEntryList.tsx:34` 改为 `grid grid-cols-1 min-[360px]:grid-cols-2`（或 `sm:grid-cols-2`）随可用宽度降级；`WorldEntryCard.tsx` 根 `div` 加 `min-w-0 overflow-hidden`，标题 `span`（`line 19`）加 `truncate`（或 `line-clamp-2`），与内容区已有的 `line-clamp-3`（`:30`）保持一致。

---

## 三、优先级小结

| 级别 | 项 | 文件:行号 | 一句话 |
|---|---|---|---|
| P1 | 弹窗长内容溢出 | BackupDialog:59 / ImportDialog:69 / MemoryDecayDialog:92 / ExportDialog:95 | bare 弹窗缺 max-h/overflow，长内容/矮视口下不可滚动、按钮不可达 |
| P1 | 2字名连词边界遗漏 | entity-highlighter.ts:189 | 头边界集缺 `与和跟同…` 与全角引号/方头括号 → `萧炎与炎帝` 漏高亮 `炎帝` |
| P2 | 暗色下拉对比度 | globals.css:1270-1274 | `option` 背景用半透明 `--nv-surface-2`，弹出层易回退浅底 + 近白字 → 不可见 |
| P2 | 书卡窄栏 | WorldEntryList.tsx:34 / WorldEntryCard.tsx:15,19 | 网格硬编码 `grid-cols-2` 不降级，卡片标题无截断/溢出保护 |

> 反自欺备注：① Round 4 P0-1 修复经 `npx tsx` 直接 import 真实 `src/core/entity-highlighter.ts` 实测复现（重叠/末位/连续/多次四类边界 + N=264/L=30000 性能 ≈0ms），非推断；② 新坑四条均指向具体文件:行号与样式类事实（`--nv-surface-2`/`--nv-text-primary`/`--nv-abyss` 取值取自 `globals.css`），未改动任何源码。

---

## 总结

Round 4 的 P0-1（最长名优先）修复稳固：实测 `李星云剑法→星云剑法@1`、末位/连续/多次边界全过、复杂度仍 ≈0ms 无 O(N·L) 回退、与关键词/OOC 高亮无叠加冲突（阅读路径仅单一着色层）。新挖 2 项 P1：bare 弹窗缺滚动约束致长内容不可达、2 字名连词边界遗漏致高亮漏失；2 项 P2：暗色原生下拉半透明背景对比度脆弱、书卡网格窄栏不降级。均无 P0，整体收敛向好。
