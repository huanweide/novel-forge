# 清览 · Round 1 体验报告（UI 可读性 / 暗色 / 无障碍 / 移动端）

> 身份：会员股东，QA 透镜 = 关键词高亮 + 名称高亮 + 暗色下拉 + 弹窗滚动 + 书卡可见 + 响应式
> 方法：严格只读，未改动任何 `src` 源码；对照 CHANGELOG v0.46.62 / v0.46.63 与 WORK_REPORT 预期行为。
> 结论：共发现 1 个 P1、2 个 P2（均为可证实的真实问题）；书卡可见修复已生效、嵌套弹窗已正确规避、弹窗滚动已补，未发现回归。

---

## P1 — 2 字实体名在连续中文正文里几乎从不高亮（名称高亮核心功能严重打折）

- **文件:行号**：`src/core/entity-highlighter.ts:174-181`（边界判定），`:156-157`（排序）
- **问题描述**：`findEntitiesInText` 对 `name.length < 3` 的名称强制要求前后字符落在标点/空白/首尾集合内（`isWordBoundary`），否则不匹配；而 `name.length >= 3` 直接跳过边界校验。中文正文没有空格，名字后紧跟的几乎都是另一个汉字（不在该标点集合里），于是「张三走了」中的「张三」因 `nextChar="走"` 非边界 → `isWordBoundary=false` 且长度=2 → **整条不匹配**。中文人名/地名绝大多数是 2 字，导致正文中这类高亮大面积漏标（假阴性）。
- **预期 vs 实际**：预期「已注册的 2 字实体名在正文出现即上色」；实际「只有恰好被标点/首尾包裹的 2 字名才上色，连续行文里基本看不到」。
- **建议修法**：对 CJK 放宽尾字符边界，但保留头部防护：当 `prevChar` 是汉字（如「李|张三」）时拒绝，防止嵌入更长词；当 `prevChar` 为空或标点/空白时即允许匹配（去掉对 `nextChar` 的强制边界要求）。可引入 `\p{Script=Han}` 判断是否汉字再分流，而非一刀切。

---

## P2 — 原生 `<select>` 触发器与 `<input type=checkbox>` 未做暗色适配（刺眼白底/低对比度）

- **文件:行号**：`src/app/globals.css:1268-1275`（仅 `select option / optgroup`）；全文件无 `select {…}` 基础样式、无 `checkbox`/`accent-color` 规则
- **问题描述**：v0.46.62 的 I-1 只修了下拉**展开列表**（`option`/`optgroup`）的背景与文字色，但**折叠态的 `<select>` 触发器本身**以及原生**复选框**没有任何暗色样式。在 Windows / Chrome 等环境下，未美化的 `<select>` 收起框和复选框会渲染为系统默认浅色（白底或浅灰底），与「虚空玻璃」暗色体系冲突，出现刺眼白块、勾选框低对比度，损害可读性与无障碍。
- **触发位置（已 grep 证实原生控件存在）**：`src/app/workshop/page.tsx`（348/515/565/577/653 等多个 `<select>`，创意工坊主入口）、`src/components/explore/BuildConfigPanel.tsx:417`、`<input type=checkbox>` 出现于 `DissectUpload.tsx:216`、`ImitationPanel.tsx:283`、`ImportWizard.tsx:582/859/916/986`。文本类 `input`/`textarea` 已被 `input-glass` 暗色覆盖（globals.css:591+），无此问题。
- **预期 vs 实际**：预期「暗色主题下所有原生控件一致、无白底」；实际「下拉触发框 + 复选框仍是系统浅色」。
- **建议修法**：在 `globals.css` 增加 `select { background: var(--nv-surface-2); color: var(--nv-text-primary); border: 1px solid var(--nv-border-2); }` 并统一箭头；复选框用 `input[type=checkbox]{ accent-color: var(--nv-primary); }` 或自定义暗色勾选样式，覆盖 workshop / 拆解 / 导入向导等所有入口。

---

## P2 — 高亮扫描为 O(N·L) 朴素逐名 indexOf，长正文 + 多实体可能主线程卡顿

- **文件:行号**：`src/core/entity-highlighter.ts:159-186`（尤其是 `:164` 的 `text.indexOf` 与 `:169` 的 `occupied.slice(idx,end).some(Boolean)`）
- **问题描述**：算法按名称长度降序，对每个实体名在全文做一次 `indexOf` 扫描，且每次命中后都 `occupied.slice(idx,end)` 分配新数组并遍历判重叠。复杂度为「实体数 × 文本长度 + 命中数 × 文本长度」。对于几千字章节 × 几十~上百实体尚可（毫秒级），但极长章节（数万字）+ 大量实体时，主线程同步计算可能带来数十~上百毫秒卡顿；且该函数在 `MarkdownViewer`（rehype 遍历整棵 HAST）与 `ChapterEntitiesPanel`（已 `useMemo`）两条路径均同步执行。
- **预期 vs 实际**：预期「任意长度正文高亮无感知延迟」；实际「超长正文 + 多实体有可观测延迟风险」（非崩溃，量级受限）。
- **建议修法**：用一次性多模式匹配替代逐名 `indexOf`：将实体名按字典序/长度构建转义后的正则交替（`new RegExp(names.map(escapeRegExp).join("|"),"g")`），或在 `buildEntityMap` 阶段构建 Trie/Aho–Corasick，单遍扫描即可，同时天然处理「长名优先 + 区间占用」。

---

## 已验证为「无问题 / 已修复」（尽职核验，非缺陷）

- **书卡可见（opacity:0）**：v0.46.54 已在 `globals.css:874-881` 加 `.is-visible{opacity:1}` 兜底，且 `src/app/page.tsx:41-55` 改为 `ready` 后直接逐张加 `is-visible`（弃用 IntersectionObserver）。grep 确认 `workshop/page.tsx`、`workspace/[projectId]/page.tsx`、`explore/*` 均**无** `opacity-0 / invisible / IntersectionObserver` 书卡隐藏逻辑——创意工坊/工作台入口无同源隐患，无回归。
- **弹窗滚动**：非 bare 的 `Modal`（`src/components/ui/Modal.tsx:100`）已带 `overflow-y-auto`；bare 的 `ProjectConfigPanel`（:177）与 `BuildConfigDialog` 均在 `panelClassName` 显式补 `overflow-y-auto`，长内容（流派标签/开关）可滚。
- **嵌套弹窗定位**：正则规则弹窗（`ProjectConfigPanel.tsx:394-396`）刻意与外层 Modal **同级渲染**，注释明确「避免嵌套在 animate-spring 面板内被 transform 影响 fixed 定位」——嵌套错乱风险已规避。
- **响应式**：tables 页 `grid-cols-1 md:grid-cols-2` + 表区 `overflow-x-auto`；game 页 `lg:hidden` 抽屉切换 + `fixed` 抽屉 `max-w-[85vw]`，窄屏折叠左右栏，未发现明显溢出/堆叠错乱。
