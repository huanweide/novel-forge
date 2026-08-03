# 清览 · Round 2 体验报告（实体高亮正确性 / 暗色原生控件 / 渲染性能）

> 身份：会员股东，QA 透镜 = 实体高亮正确性 + 暗色原生控件可读性 + 正文高亮渲染性能
> 方法：严格只读，未改动任何 `src` 源码；逐项 Read 源码核对行号，对照 Round 1 报告与 v0.46.x CHANGELOG 预期。
> 名词小抄：
> - **实体高亮**：把正文里出现过的角色名/词条名染成对应颜色，方便一眼定位。
> - **头边界 / 尾边界**：判断一个名字前后是不是「词边缘」——边缘字符指空格、标点、句首/句尾；用来防止把长词中间的片段误当实体。
> - **SKIP_TAGS**：rehype 插件里一份「跳过名单」，名单内标签（如标题、代码块）里的文字不参与高亮。
> - **color-scheme**：CSS 属性，告诉浏览器「当前主题是亮色还是暗色」，浏览器据此自动把原生下拉框、复选框等控件渲染成对应配色。

---

## 回归验证

### 1）2 字实体名改为「仅查头边界」是否落地 + 是否引入误高亮副作用

- **问题（Round 1 · P1）**：2 字名（中文人名/地名主力）因同时要求头、尾都为边界，在连续中文里几乎从不高亮（大面积假阴性）。建议：保留头边界防护、去掉尾边界强制要求。
- **预期**：`findEntitiesInText` 对 `name.length < 3` 仅校验 `prevChar` 是否落在头边界集合，不再校验尾字符；3 字及以上行为不变。
- **实际 `src/core/entity-highlighter.ts:172-181`**：
  - `:173` `const isHeadBoundary = !prevChar || /[\s，。！？、；：""''（）【】《》\-\—]/.test(prevChar);`
  - `:176` `const passesBoundary = name.length >= 3 ? true : isHeadBoundary;`
  - `:178-181` 仅在 `passesBoundary` 成立时写 `matches` 并标记 `occupied`。
  - 改动已落地，且正与 Round 1 建议的「保留头边界、放开尾边界」一致。
- **副作用核验（"白云"在"白云观"里被高亮算不算误高亮）**：
  - 当"白云观"(3 字) 也注册为实体时：`sorted` 按长度降序（`:155-157`），"白云观"先于"白云"扫描；命中后 `occupied[0..2]` 被占用（`:180`）。随后"白云"扫描到 `idx=0`，`:169` `occupied.slice(0,2).some(Boolean)` 为 `true` → 不重复高亮。**长名优先 + 区间占用自动去重，无副作用。**
  - 当仅"白云"(2 字) 注册、而"白云观"未注册时：句首或标点后的"白云"按规则高亮（"观"留白）。这是"已注册实体在任意出现处上色"的**预期行为**，非缺陷。
  - 头边界仍拒绝 `prevChar` 为汉字的情形（如"小|白云"）：`isHeadBoundary=false` → 不高亮，防止把更长中文词中间的片段误当实体。防护有效。
- **结论：通过**（放宽正确落地，最长优先 + occupied 去重已消除子串误叠加；仅头边界放开属 Round 1 既定权衡）。

### 2）3 字及以上实体行为是否未变（仍不查边界）

- **问题（Round 1 边界约定）**：3 字及以上名应始终跳过边界校验，避免漏标。
- **预期**：`name.length >= 3` 时 `passesBoundary` 恒为 `true`，与改动前一致。
- **实际 `src/core/entity-highlighter.ts:176`**：`name.length >= 3 ? true : isHeadBoundary;` —— 3 字及以上恒 `true`，无边界校验，逻辑未变。
- **结论：通过**。

### 3）COMMON_STOP_WORDS 是否仍正确排除单字代词 / 极泛化双字

- **问题**：停用词表须拦截高频虚词（"我/你"等单字、 "什么/今天"等泛化双字），防止满屏色块。
- **预期**：单字实体整体被过滤；双字停用词不染色。
- **实际**：
  - `src/core/entity-highlighter.ts:131-143`：`COMMON_STOP_WORDS` 集合完整保留——单字代词/虚词（`:133-136`）、泛化双字（`:138-142`）。
  - `:156` 过滤条件 `name.length >= 2 && !COMMON_STOP_WORDS.has(name)`：单字实体（length<2）直接被 `length>=2` 过滤，且停用词双字被排除。
- **结论：通过**（停用词表未删减，单字+泛化双字双重拦截有效）。

---

## 新发现

### P1 — 高亮扫描为 O(实体数 × 正文长) 朴素逐名 indexOf，超长正文 + 多实体可能主线程卡顿

- **现象（透镜：渲染性能）**：`findEntitiesInText` 对每个实体名在全文做一次 `text.indexOf` 循环，且每次命中都要 `occupied.slice(idx,end).some(Boolean)` 新建子数组判重叠。复杂度为「实体数 × 正文长 + 命中数 × 区间长」。正文数万字 × 上百实体时，主线程同步计算有可观测延迟风险；该函数在两条路径均同步执行——`MarkdownViewer` 的 rehype 遍历整棵 HAST（`src/lib/rehype-entity-highlight.ts:30`）、`ChapterEntitiesPanel` 的 `useMemo`（`src/components/workspace/ChapterEntitiesPanel.tsx:107`）。
- **根因 `src/core/entity-highlighter.ts:159-186`**：
  - `:162-186` 外层 `for` 遍历每个实体名（N），内层 `while` + `indexOf` 扫描全文（L）；
  - `:169` `occupied.slice(idx,end).some(Boolean)` 每次命中重新分配子数组并遍历，是额外开销点。
- **修复方案（低成本，不破坏现有 longest-first + occupied 语义）**：
  - 预编译一次性多模式正则替代逐名 `indexOf`：`new RegExp(Array.from(entityMap.keys()).map(escapeRegExp).sort(byLenDesc).join("|"),"g")`，对正文做**单遍扫描**即可拿到所有候选区间；因正则按长度降序交替，天然长名优先。
  - 重叠判定改用 `boolean[]` 原地置位 + 线性跳过（避免每次 `slice` 分配）；或构建 Trie/Aho–Corasick。
  - 仅改 `entity-highlighter.ts` 内部实现，对外签名（`findEntitiesInText(text, map)`）不变，rehype 与面板两处调用方零改动。
- **结论**：非崩溃、量级受限，但属 Round 2 最高优先的可量化性能点，建议本轮修。

### P2 — 暗色原生控件：select 触发器 / 复选框等仍无显式暗色样式，但已被 `color-scheme: dark` 大幅缓解

- **现象（透镜：暗色原生控件可读性）**：Round 1 · P2 建议补 `select {…}` 基础样式与 `input[type=checkbox]{accent-color}`，本轮 grep 证实**仍未添加**（`src/app/globals.css:1268-1275` 仅覆盖 `select option / optgroup`，全文件无 `select {` 基础规则、无 `accent-color`）。原生 `<select>` 触发器与复选框在暗色下无统一品牌色。
- **根因 / 重要缓解**：`src/app/globals.css:418-421` 在 `.dark` 作用域对 `html` 设置了 `color-scheme: dark;`。现代浏览器（Chrome 96+ / Firefox / Safari 15+）会据此**自动把原生控件（select 触发器、checkbox、radio、date、color picker）渲染为暗色**，故 Round 1 担心的"刺眼白底/低对比"在当前实现下已被系统性缓解，而非真正白底。
- **修复方案（轻微，统一品牌观感）**：在 `.dark` 作用域补充 `select { background: var(--nv-surface-2); color: var(--nv-text-primary); border:1px solid var(--nv-border-2); }` 与 `input[type=checkbox],input[type=radio]{ accent-color: var(--nv-primary); }`，使勾选态与下拉框风格与"虚空玻璃"体系一致（而非仅依赖浏览器默认暗色）。属体验打磨，不阻断阅读。
- **结论**：风险较 Round 1 评估已显著降低（已缓解），降为 P2 轻微项；建议顺手补显式样式统一观感。

### P2 — 高亮覆盖盲区：非 markdown 文本区的实体名不染色（一致性缺口）

- **现象（透镜：高亮一致性）**：实体高亮只在两处生效——(a) `MarkdownViewer` 经 rehype 渲染的 **markdown 正文**（`src/lib/rehype-entity-highlight.ts:30`），(b) `ChapterEntitiesPanel` 的**侧栏计数**（`src/components/workspace/ChapterEntitiesPanel.tsx:107`）。其它以纯 React 文本渲染、不走 markdown 的区域，实体名不上色。
- **根因（调用点清单）**：
  - 高亮函数仅 2 个调用方：`rehype-entity-highlight.ts:30`（正文渲染）、`ChapterEntitiesPanel.tsx:107`（计数）。
  - markdown 表格单元格（`td/th`）**会被高亮**——SKIP_TAGS（`rehype-entity-highlight.ts:21`）不含 `td/th`，rehype 会走入单元格文本；代码块/标题/引用块**不会**（已在 SKIP_TAGS）。
  - **不会高亮**的区域：游戏模式对话气泡、数据仪表盘（tables 页 React 组件表格）、角色/词条卡列表项等为纯文本渲染，未接入 `findEntitiesInText`，实体名无颜色。
- **修复方案**：在需要"正文外也辨识实体"的展示组件（对话气泡、卡片列表、仪表盘表格）中复用 `findEntitiesInText` 做轻量包裹；或抽一个 `<EntityText>` 小组件统一承接。注意与 SKIP_TAGS 对齐，避免代码块/输入态误染。
- **结论**：功能正确性无错（该亮的都亮），但跨组件一致性存在可见缺口，建议后续轮次补；本轮记为 P2。

### （已验证无问题）章首 / 代码块误高亮

- `src/lib/rehype-entity-highlight.ts:21` `SKIP_TAGS` 含 `h1-h6 / blockquote / code / pre / a / script / style`；`:91` `walkAndHighlight` 遇 SKIP_TAGS 直接 `return`。故章节标题（章头）、引用块、代码围栏内**不会**被高亮，无"章头/代码块误染"回归。与 CHANGELOG v0.46.x「标题章头不高亮」预期一致。

---

## 优先级建议

1. **P1（本轮修）**：高亮扫描 O(N·L) 改单遍正则/Trie（`entity-highlighter.ts:159-186`），消除数万字正文 + 上百实体下的主线程卡顿风险，且对外零破坏性。
2. **P2（顺手补）**：暗色原生控件补 `select{}` 基础样式 + `accent-color`（globals.css，受 `color-scheme:dark` 已缓解，仅统一观感）。
3. **P2（后续轮）**：非 markdown 区域（对话气泡 / 卡片列表 / 仪表盘表格）接入 `findEntitiesInText`，补齐高亮一致性。

> 结论：2 字高亮放宽已正确落地且无副作用、3 字+与停用词表行为未变；唯一高优先新坑是 O(N·L) 扫描性能，可用单遍正则低成本消除。
