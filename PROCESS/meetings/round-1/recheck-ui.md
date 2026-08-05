# 阶段五复检报告 · UI 交互无障碍透镜

- **Agent 代号 / 透镜职责**：UI 交互无障碍复检子 Agent（MaxLoop 魔王系统 · 阶段五）
- **所属轮次**：round-1
- **体验对象**：novel-forge（AI 小说写作工具）· 工作副本 `C:/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge` · 分支 main · dev 端口 3001（健康 200）
- **复验范围**：上轮 round-1 阶段四"声称修复"的 IMP-016 / IMP-017 / IMP-018 / IMP-025
- **日期**：2026-08-05
- **门禁现状（Chair 已核验）**：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` EXIT=0；`npm test` 211 passed

> 复验纪律：每个 IMP 均 `git diff` + 读上下文 +（必要时）真机 curl SSR + 计算对比度。禁止以"未发现"冒充"没问题"。沙箱无 Chromium，纯视觉/动画/真机交互项一律标注"需本地目测"。

---

## 第一部分：用户体验视角（复验结论 + 复验证据）

### IMP-016 ｜ viewport 禁缩放（WCAG 1.4.4 / 1.4.10 违例）

**复验结论：已真实修复，无残留。**

- **复验证据**：
  - `git diff src/app/layout.tsx` 旧行 `- <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />`，新行 `+ <meta name="viewport" content="width=device-width, initial-scale=1.0" />` —— 确认 `maximum-scale=1.0` 与 `user-scalable=no` 均已删除（layout.tsx:35）。
  - 全仓 `grep -rn "user-scalable\|maximum-scale" src/` 返回 **NONE (clean)** —— 无第二处残留禁缩放。
- **挖新坑（viewport 放开后是否布局错位）**：通读 layout.tsx 与 workspace 布局，应用采用响应式断点（`lg:hidden`/`lg:static`/`overflow-hidden`）而非依赖禁缩放锁布局。放开缩放下，低视力用户可在 iOS/Android 放大页面阅读，不会触发"依赖禁缩放"的错位逻辑。未发现代码层依赖禁缩放的组件。**结论：放开安全，无新坑。**

### IMP-017 ｜ `--nv-text-muted` 对比度不足

**复验结论：修复有效且方向正确，但对"页背景"达标、对"深色主题浅色化表面"仍不达标（残留 P2）。**

- **复验证据（git diff globals.css 三处 muted）**：
  - dark `:root` 111：`#75736B`（原 3.6:1）→ `#83807A`
  - light `.light` 282：`#9A9DA6` → `#696C75`（注意：浅色主题反向调**暗**，适配浅底，方向正确）
  - azure `html.azure` 1192：`#5A6F6C` → `#6A807C`
- **对比度实算（WCAG 相对亮度法，#RRGGBB→linear→L→(L1+0.05)/(L2+0.05)）**，取每主题最劣背景：

  | 主题 | muted | 背景 | 对比度 | AA 4.5 |
  |------|-------|------|--------|--------|
  | DARK | #83807A | 页背景 #0E1424 | **4.66:1** | ✅ PASS |
  | DARK | #83807A | 卡片/表面 surface-2(#191F2E 量级) | **≈4.08–4.10:1** | ❌ FAIL |
  | LIGHT | #696C75 | 页背景 #EEF0F4 | **4.60:1** | ✅ PASS |
  | LIGHT | #696C75 | 输入框白底 #FFFFFF | **5.25:1** | ✅ PASS |
  | AZURE | #6A807C | 页背景 #04090C | **4.76:1** | ✅ PASS |
  | AZURE | #6A807C | 卡片 #081218 | **4.54:1** | ✅ PASS（临界） |

- **挖新坑（调亮是否影响依赖该变量的组件可读性 / 是否仍不达标）**：
  - 修复把三主题 muted 均调亮/调暗到位，原 ≈3.6–3.78:1 普遍提升至 ≥4.5（对页背景）。
  - **残留 P2**：深色主题（dark / azure）的卡片、输入、surface-2/3 等是"白透叠加"，比页背景**更亮**；muted 为浅色文字，背景越亮对比度越低。dark 主题 muted 落在这些表面时实测 **≈4.0–4.1:1，仍 <4.5:1**。而 muted 的绝大多数实际落点正是这些表面（见下用量证据），故修复作者"`达 WCAG AA`"的声明仅在"对页背景"条件下成立，对常见容器并不全成立。
  - **用量佐证（grep `var(--nv-text-muted)`）**：`BuildConfigPanel.tsx:98/153`（`bg-[var(--nv-surface-2)] … placeholder:text-[var(--nv-text-muted)]`）、`SettingsImporter.tsx:127/138/234`、`StyleEditor.tsx` 多处面板标签/空状态、`ContextPreview.tsx` 空态，均将 muted 渲染在 surface-2/3/卡片之上 —— 即落在 FAIL 区间的落点很常见。
  - 调亮**未**造成负作用：muted(#83807A) 仍明显浅于 secondary(#B9B7AD)/tertiary(#98968C) 的层级区分未破坏；disabled/placeholder 语义清晰。

### IMP-018 ｜ 抽屉 inert 包裹主区（需本地目测开合态）

**复验结论：代码逻辑自洽 + 真机 SSR 证伪初始误锁死；"抽屉开合 inert 增删"的运行时联动与视觉项仍标注需本地目测。**

- **复验证据（读 `src/app/workspace/[projectId]/page.tsx`）**：
  - inert 包裹三处主区：`Toolbar`（:913）、header 按钮栏（:928）、`CenterPanel` 中间编辑区（:978），绑定 `inert={leftDrawerOpen || rightDrawerOpen}`。
  - 两个抽屉本身（左 `leftDrawerRef` :951、右 `rightDrawerRef` :1128）为**兄弟节点，不在上述 inert 包裹内** —— 抽屉开启时主区变 inert、抽屉自身保持可交互，逻辑自洽（不会"把抽屉自己也 inert 掉"）。
  - 初始态：`useState(false)`（:125-126）→ SSR/首屏 `inert={false||false}=false`，**初始不会误锁死**。
  - **真机 SSR 关键证据**：`curl http://127.0.0.1:3001/workspace/<pid>` 抓取 SSR HTML，`grep -o "inert"` 计数为 **0**（且 `<noscript>` 也存在）。结合 `package.json` 中 **react 19.2.4 / next 16.2.7**：React 19 对布尔属性 `inert={false}` 会**正确省略属性**（不渲染 `inert="false"`）。这从框架行为 + 真实 SSR HTML 双重证伪了 round-1 担心的"false 渲染成 `inert='false'` 致主区永久锁死"风险 —— 该风险在 React 18 才成立，本仓 React 19 不成立。
  - 配套 `useFocusTrap(leftDrawerRef, leftDrawerOpen, …)`（:132-133）在抽屉开启时聚焦陷阱，与 inert 协同正确。
- **诚实边界（仍待本地目测）**：
  - 抽屉**开合时** `inert` 增删的运行时联动（点击切换 → state 变更 → React 重渲染 inert 属性）、focus-trap 与 inert 的协同、动画（`.transition-transform duration-200` :956）观感，需真实浏览器 `npm run dev` 目测确认。沙箱无 Chromium，未做真机点击验证。
  - 宽屏（`lg:`）下抽屉为 `lg:static` 常驻，此时 `leftDrawerOpen` 由 `lg:hidden` 的切换按钮控制、桌面一般保持 false；逻辑上桌面不会误触发 inert，但建议本地在桌面+移动两种视口各点一次切换按钮确认。

### IMP-025 ｜ 工作区 SSR 空壳无 noscript 兜底

**复验结论：已真实修复，真机 SSR 确认存在。**

- **复验证据**：
  - `git diff src/app/layout.tsx` 在 `<body>`（:66-70）新增 `<noscript>` 块，文案："本应用需要启用 JavaScript 才能运行。请在现代浏览器中开启 JavaScript 后访问 Novel Forge。"（背景 #0E1424、文字 #F8F7F2，深色主题可读）。
  - **真机 SSR 抓取**：`curl /`（首页，37786 字节）与 `curl /workspace/<pid>`（24217 字节）均含 `<noscript>`，且 workspace SSR 中 `grep -c "noscript"` = 1，`grep -o "需要启用 JavaScript"` 命中。noscript 位于共享 `RootLayout`，全路由继承，工作区路由确证存在。
- **挖新坑（文案是否覆盖关键操作提示）**：
  - 文案告知"需启用 JS"，对纯 SPA 合理。未明确列举"禁用 JS 时无法使用编辑器/写作/导入导出"等具体功能，但 nodscript 兜底本就不承载功能，属可接受。
  - 无代码层新坑：noscript 为纯静态 div，不影响水合、不引入新依赖。

---

## 第二部分：总体视角

- **四项 IMP 收口质量**：IMP-016 / IMP-025 为"确定性代码改动 + 真机/全仓验证"，可判定**真实修复、零残留**；IMP-017 为"方向正确、页背景达标、深色表面临界未达"，属**部分修复**，留 P2 残留；IMP-018 为"逻辑自洽 + SSR 证伪初始锁死 + React 19 框架层排除永久锁死风险"，**代码层可判修复有效**，仅"开合运行时联动 + 视觉"待本地目测（诚实边界）。
- **质量与风险判断**：
  - 无断链、无空按钮、无编译/测试回归（门禁 tsc 0 / test 211 已 Chair 核验，本透镜不再重复跑，未举证部分不臆断）。
  - IMP-017 的残留属"验证口径偏差"：修复者以页背景为基准声明 AA 达标，但 muted 多数落在更亮的卡片/表面，深色主题下实际未全达标。这是本轮唯一实质性新坑。
  - IMP-018 风险已通过"React 19 + SSR 无 inert 属性"双重证据降级，但上轮"待本地目测"标记仍成立，不能仅凭 SSR 断言运行时开合正确。

---

## 发现清单（结构化 + 复验证据）

- **[IMP-017-残] P2（轻微）**
  - **文件:行号**：`src/app/globals.css:111`（dark muted `#83807A`）；影响面 `BuildConfigPanel.tsx:98,153` / `SettingsImporter.tsx:127` / `StyleEditor.tsx` 多处 / `ContextPreview.tsx` 空态（均为 `text-[var(--nv-text-muted)]` 渲染在 surface-2/3/卡片上）
  - **现象描述**：深色主题下，占位符、面板标签、空状态等 muted 文字落在"白透叠加"的卡片/输入/表面时，对比度 ≈4.0–4.1:1，低于 WCAG AA 4.5:1（页背景态 4.66 达标，但常见容器态不达标）。
  - **根因推测**：muted 对比度以"页背景"为基准调亮，而深色主题卡片是 `rgba(255,255,255,0.045~0.08)` 叠加，比页背景更亮；浅色文字在更亮背景上对比度下降。修复验证口径未覆盖常见容器背景。
  - **建议修法**：把 dark 主题 `--nv-text-muted` 再提亮一档（如 #8C8A82 量级，目标对 surface-2 ≥4.5），或让 muted 文本容器改用更深的表面；建议在 CI 加一条"对 surface-2/3/card 背景"的对比度断言。

- **[IMP-018-残] 诚实边界（非代码缺陷，待本地目测）**
  - **文件:行号**：`src/app/workspace/[projectId]/page.tsx:913,928,978`（inert 包裹）；:951,1128（抽屉兄弟节点）；:132-133（focus-trap）
  - **现象描述**：代码逻辑自洽、SSR 已证无初始误锁死、React 19 排除 `inert="false"` 永久锁死风险；但"点击切换 → inert 增删的运行时联动 + focus-trap 协同 + 抽屉滑入动画"未做真机点击验证。
  - **根因推测**：无（非缺陷），仅沙箱无浏览器所致验证缺口。
  - **建议修法**：本地 `npm run dev` 在桌面(≥lg)与移动(<lg)视口各点一次"大纲/侧栏"切换，确认①主区变灰不可点、②抽屉可交互、③关闭后主区恢复、④焦点被 trap 在抽屉内。

---

## 诚实边界（本透镜能力声明）

- **已确证**（有 git diff / grep / 真机 curl / 对比度实算证据）：IMP-016 删除禁缩放且无残留；IMP-017 三主题 muted 已调亮且对页背景达标（数字见上表）；IMP-025 noscript 真实存在于 SSR 输出；IMP-018 初始态未误锁死（SSR 0 个 inert 属性 + React 19 框架行为）。
- **需本地目测**（沙箱无 Chromium，不臆断）：IMP-018 抽屉开合的运行时 inert 增删联动、focus-trap 协同、滑入动画观感；viewport 放开后移动端真实缩放体验（代码层已判无依赖禁缩放的布局，但真机缩放手感需人眼确认）；深色主题 muted 在真实卡片上的肉眼可读性。
- **未重复跑**：tsc / npm test 由 Chair 已核验门禁（EXIT=0 / 211 passed），本透镜不复跑、不重复举证。

---

## 复验证据汇总

| IMP | 复验方式 | 关键证据 | 结论 |
|-----|----------|----------|------|
| IMP-016 | git diff + 全仓 grep | layout.tsx:35 删除禁缩放；`grep user-scalable\|maximum-scale` → NONE | ✅ 真实修复，无残留 |
| IMP-017 | git diff + 对比度实算 + 用量 grep | 三主题 muted 已调；页背景 4.66/4.60/4.76 达标；dark 表面 ≈4.08 FAIL | ⚠️ 部分修复，留 P2 残留 |
| IMP-018 | 读代码 + SSR curl + React 版本 | inert 包裹主区、抽屉为兄弟；SSR 0 个 inert 属性；react 19.2.4 | ✅ 代码层修复有效；开合运行时联动待本地目测 |
| IMP-025 | git diff + 真机 SSR curl | layout.tsx:66-70 新增；首页/工作区 SSR 均含 `<noscript>` | ✅ 真实修复，无残留 |

---

## 本透镜复验结论

- **IMP-016 / IMP-025**：真实修复，确定性证据充分，**零残留**。
- **IMP-017**：修复方向正确、主体有效（对页背景均 ≥4.5），但**深色主题下 muted 落在卡片/输入/表面等浅色化容器时仍 ≈4.0–4.1:1，未达 WCAG AA**——属部分修复，留 **P2** 残留（验证口径偏差，建议把 dark muted 再提亮或在 muted 容器用更深表面）。
- **IMP-018**：代码逻辑自洽，且经**真机 SSR（0 个 inert 属性）+ React 19 框架行为**双重证伪初始误锁死；上轮"待本地目测"标记仍成立——**抽屉开合时的 inert 增删运行时联动、focus-trap 协同、滑入动画需本地 `npm run dev` 目测确认**，沙箱无 Chromium 不臆断。

**残留问题数：P0=0 / P1=0 / P2=1**（仅 IMP-017 深色表面对比度残留一条；IMP-018 的本地目测缺口属诚实边界、非代码缺陷，不计入缺陷数）。

**IMP-018 复核结论**：代码层修复有效、初始态误锁死已用真机证据排除；开合态运行时联动与视觉体验标注"需本地目测"，上轮待办状态在诚实边界内维持。
