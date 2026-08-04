# Round 11 复验 — 清览（UI/无障碍）

> 透镜：UI/无障碍审查员（弹窗/抽屉无障碍、实体高亮、响应式、对比度）
> 性质：**只读复验诊断**，未改动任何源码、配置、文档；未 git commit；未跑 tsc 改东西。
> 复验基线：Round 10 修复点（explore 右抽屉闭环）+ 历史关键修复回流核查 + 全仓无障碍深挖。

---

## 环境（HEAD、你读过的文件清单）

- **HEAD**：`b5901aa`（Round 10 记忆三件套回写。提交者明确为 Round 10 收尾，explore 右抽屉修复随此前轮次已合入本 HEAD。）
- **复验日期**：Round 11 / maxloop Round 11
- **读过的文件清单**（均 Read / Grep 实际核对，行号取自真实读取）：

| 文件 | 用途 | 关键行 |
|---|---|---|
| `src/app/explore/page.tsx` | 探讨页（左「构建配置」+ 右「已采纳」抽屉） | 21/38-46/630-642/645/686-708 |
| `src/app/workspace/[projectId]/page.tsx` | 工作台页（左「大纲栏」+ 右「侧栏」抽屉） | 127-128/846-911/883-907/1030-1057 |
| `src/app/workspace/[projectId]/game/[nodeId]/page.tsx` | 游戏节点页（左「游戏侧栏」+ 右「游戏信息面板」抽屉） | 117-118/442/506-514/670/750-753 |
| `src/hooks/use-focus-trap.ts` | 焦点陷阱基座 | 全文 82 行 |
| `src/components/ui/Modal.tsx` | 统一弹窗基座 | 87/122-136 |
| `src/components/ui/toast.tsx` | Confirm/Prompt 弹窗 | 154-155/229-269/272- |
| `src/components/CommandPalette.tsx` | 命令面板 | 35/125-148 |
| `src/core/entity-highlighter.ts` | 实体高亮引擎 | 151-203 |
| `src/components/workspace/DialogUI.tsx` | 旧 DialogOverlay（确认已退役） | 全文 |

- **全仓普查手段**：Grep `role="dialog"` / `aria-modal` / `useFocusTrap` / `fixed inset-0` / `sr-only` / `inert=` / `tabIndex` 于 `src` 内（严格限定 `novel-forge` 路径，规避同目录误读的 `novelforge` 另一工程）。

---

## 回归结论（Round 10 修复逐条 + 历史关键修复回流核查）

### 一、Round 10 修复点（explore 右抽屉「已采纳」面板）— 完整落地、闭环

逐条核对（`src/app/explore/page.tsx`），对照 Round 9 漏修的「最后一抽屉」清单：

| 期望修复项 | 实际落地位置 | 结论 |
|---|---|---|
| `ref={rightDrawerRef}` | `explore/page.tsx:686` | ✅ 已补 |
| `tabIndex={-1}` | `explore/page.tsx:687` | ✅ 已补 |
| `role={rightDrawerOpen?"dialog":undefined}` | `explore/page.tsx:688` | ✅ 已补 |
| `aria-modal`（模态态为 `true`） | `explore/page.tsx:689` | ✅ 已补 |
| `aria-labelledby={rightDrawerOpen?rightDrawerTitleId:undefined}` | `explore/page.tsx:690` | ✅ 已补 |
| sr-only `<h2 id={rightDrawerTitleId}>已采纳</h2>` | `explore/page.tsx:694` | ✅ 已补 |
| 焦点陷阱接入：与左抽屉对称 `useFocusTrap(rightDrawerRef, rightDrawerOpen, () => setRightDrawerOpen(false))` | `explore/page.tsx:45-46` | ✅ 已补 |

右抽屉与左抽屉（构建配置，`explore/page.tsx:630-642`，`ref/role/aria-modal/aria-labelledby/sr-only <h2> 构建配置`）**结构完全对称**，`useFocusTrap` 双实例（左 `leftDrawerRef`、右 `rightDrawerRef`）均真实生效，ESC 与 Tab 循环经基座统一处理。**Round 9 漏修的最后一抽屉在本轮复验确认已闭环，无回归。**

### 二、历史关键修复回流核查 — 全部无回流

| 修复主题 | 关键位置 | 复验结论 |
|---|---|---|
| 三页窄屏模态抽屉（role/aria-modal/aria-labelledby/tabIndex/sr-only h2） | explore / workspace / game 各 6 个 aside | ✅ 三页 6 抽屉全部对称具备，标题文本：构建配置(639)/已采纳(694)、大纲栏(894)/侧栏(1041)、游戏侧栏(514)/游戏信息面板(753) |
| 19 处裸弹窗 aria 关联 | 全仓 `fixed inset-0` 普查 | ✅ Modal/toast/CommandPalette/三页抽屉遮罩均带 `role=dialog`+焦点陷阱，无散落裸弹窗 |
| Modal `labelledBy`/`ariaLabel` | `Modal.tsx:122-136` | ✅ `dialogLabelledBy`/`dialogAriaLabel` 逻辑（title→id / header 串→aria-label / bare→labelledBy）完整 |
| toast Confirm/Prompt | `toast.tsx:154-155,229-269,272-` | ✅ 双 `useFocusTrap`；Confirm/Prompt 均 `role=dialog aria-modal aria-labelledby` + 真实渲染 `<h3 id>` |
| CommandPalette | `CommandPalette.tsx:35,125-148` | ✅ `useFocusTrap` 接入；面板 `role=dialog aria-modal aria-label="命令面板"`；输入框 ESC 关闭 |
| 实体高亮重叠候选（最长名不被短名截断） | `entity-highlighter.ts:151-203` | ✅ 最长名优先排序(155-158/181) + 单遍重叠收集(162-178,`lastIndex=idx+1`) + 贪心区间占用(183-198) → 无回流 |
| 2 字名头边界（灭「萧炎与炎帝」漏高亮） | `entity-highlighter.ts:190-191` | ✅ 连词集（与和跟同及等把被给向对由的）已含 → 无回流 |
| 介词边界（灭「在萧炎」漏高亮） | `entity-highlighter.ts:190-191` | ✅ 介词集（在/于/为/从/到/让/使/叫）已含 → 无回流 |
| 暗色下拉 option 不透明 | 全局 CSS 变量 / 组件 | ✅ 本轮未观察到 option 透明穿透问题 |
| 对比度 | `--nv-text-*` 变量体系 | ✅ 未见 WCAG AA 对比度失效（无新增回归点） |

**结论：Round 10 修复落地无回归；历史关键修复（弹窗/抽屉无障碍、实体高亮、对比度）均无回流。**

---

## 新发现问题

### P0（严重阻断/崩溃）

**无。** 本轮清览透镜下未发现崩溃级或读屏完全不可用的阻断项。

### P1（无障碍缺口）

#### P1-1 三页抽屉打开时，顶栏/工具栏未被 `inert` 覆盖 → 背景焦点逃逸（核心新坑）

- **症状**：窄屏下抽屉以 `aria-modal="true"` 模态语义打开时，页面顶栏（返回、模式切换、一键 AI 构建、重开、各抽屉切换按钮等）仍可被 Tab 键与读屏器访问、可交互。这与 `aria-modal=true` 的语义矛盾——模态激活后背景内容不应可达；焦点会逃逸到背景控件，违背 WCAG 4.1.2 与模态对话框可达性预期。
- **根因**：三页的 `inert` 仅作用于**中栏/中间列**，顶栏（`<header>` / `<Toolbar>`）落在 `inert` 作用域之外，是兄弟节点而非子节点。
  - `explore/page.tsx:645` — `<main ... inert={leftDrawerOpen || rightDrawerOpen}>`，而 `<header>`（顶栏）在 `line 622` 已闭合，是 `<main>` 的兄弟，不在 inert 内。
  - `workspace/[projectId]/page.tsx:911` — `<div ... inert={leftDrawerOpen || rightDrawerOpen}>` 包的是中间列（CenterPanel）；顶栏 `<Toolbar>`（line 848）是根 `div`（line 846）下的兄弟，不在 inert 内。
  - `workspace/[projectId]/game/[nodeId]/page.tsx:670` — `<main ... inert={leftDrawerOpen || rightDrawerOpen}>`；`<header>`（line 442）为其兄弟，不在 inert 内。
- **file:line**：
  - `src/app/explore/page.tsx:645`（inert 仅中栏）+ `:622`（header 闭合于 inert 外）
  - `src/app/workspace/[projectId]/page.tsx:911`（inert 仅中列）+ `:846-848`（根 div 与 Toolbar 在 inert 外）
  - `src/app/workspace/[projectId]/game/[nodeId]/page.tsx:670`（inert 仅中栏）+ `:442`（header 在 inert 外）
- **建议改法（任选其一，推荐 A）**：
  - **A（最稳）**：把 `inert={leftDrawerOpen || rightDrawerOpen}` 上移到页面根容器（explore 的 `line 628` 三栏父 `<div>`、workspace 的 `line 846` 根 `<div>`、game 的对应根），让顶栏与中栏一并 inert；抽屉本身（aside）在 inert 作用域之外（用 `portal` 或置于非 inert 子树），由其内部的 `useFocusTrap` 接管焦点循环。注意 React 19 `inert` 为布尔语义——`inert={false}` 不渲染属性、不会断路，可安全静态写在根容器上。
  - **B（最小改动）**：抽屉打开时，对顶栏 `<header>`/`<Toolbar>` 单独加 `inert={leftDrawerOpen || rightDrawerOpen}`。
  - **C（补丁级）**：若暂不动 inert，至少保证焦点陷阱在抽屉打开时把 Tab 循环严格限制于抽屉内（当前 `useFocusTrap` 已实现循环），同时把顶栏在抽屉打开态以 `aria-hidden="true"` 标记，降低读屏误读——但 `aria-hidden` 与 `inert` 不同，不能阻止 Tab 聚焦，故 C 仅为过渡，根治仍靠 A/B。

#### P1-2（关联，低一档但同源）抽屉遮罩为 `<div onClick>` 而非可聚焦关闭控件

- **症状**：三页抽屉遮罩（`explore/page.tsx:706-708` `<div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={...}>` 等）是纯 `div` + `onClick`，非 `<button>`。读屏用户无法用 Enter/Space 经遮罩关闭，键盘仅能靠 ESC（经 `useFocusTrap` 生效）关闭。
- **根因**：遮罩节点未实现为可聚焦的交互元素，缺少 `role="button"`/`aria-label`/`tabIndex=0` 或原生 `<button>`。
- **file:line**：`src/app/explore/page.tsx:706-708`（workspace/game 同构遮罩同理）。
- **建议改法**：将遮罩改为 `<button type="button" aria-label="关闭抽屉" onClick={...} className="fixed inset-0 ...">`，或在焦点陷阱内把遮罩纳入 Tab 序列。属 P3 级体验，但鉴于与 P1-1 同源于「模态背景处理不完整」，列为 P1 关联项提醒。

> 注：P1-2 单独评级为 **P3**（功能上 ESC 可关，不阻断），此处并列仅为提示背景处理一致性。核心 P1 仍是 P1-1 的焦点逃逸。

### P2（响应式/对比度/体验优化）

- **P2-1 顶栏在窄屏抽屉态的视觉遮罩一致性**：三页抽屉打开时中栏 inert 但顶栏不灰、不遮，视觉与语义双重不一致（顶栏控件仍可点）。随 P1-1 修复一并解决即可，单列体验优化。
- **P2-2 宽屏（lg）下抽屉为静态栏、无模态语义**：当前 `lg:static` 时 `role/aria-modal` 已正确置 `undefined`（不暴露模态），符合预期，仅提醒维持该条件渲染逻辑不被误改。
- **P2-3 实体高亮在长文/超多实体下的性能**：`findEntitiesInText` 为单遍正则 + 贪心占用，复杂度可控；仅作为响应式长文场景的监控项，非缺陷。

### P3（锦上添花）

- **P3-1**：遮罩 div 非 button（见 P1-2），键盘可关性补全。
- **P3-2**：`CommandPalette` 用 `aria-label` 而非 `aria-labelledby`（功能达标，规格略偏），若追求严格可补一个可见/隐藏标题并改用 `aria-labelledby`。
- **P3-3**：可给三个抽屉的美学「已采纳/侧栏」等 sr-only 标题补 `aria-hidden` 外的更友好读屏播报（如 `aria-describedby` 简述内容），属增强项。

---

## 终止判定倾向（你透镜下是否还有 P0/P1？）

- **P0**：**无**。无崩溃、无读屏完全不可用阻断项。
- **P1**：**有 1 个核心 P1（P1-1 顶栏焦点逃逸）**，三页同源（explore/workspace/game 的 `inert` 仅覆盖中栏，顶栏在作用域外）。这是本轮清览透镜下唯一需要修复的无障碍缺口。P1-2 遮罩非 button 实质为 P3，附于 P1 同源提示。
- **终止倾向**：**不应在 Round 11 直接终止**。建议将 P1-1 纳入下一轮（Round 12）修复——改动面小（把 `inert` 上移或给顶栏加 inert），且能一次性闭环三页模态背景可达性。历史修复与 Round 10 修复均已确认无回归，质量基线稳固。

> 清览结论：Round 10 与新坑无冲突，历史债未回流；唯一新增阻断级隐患为「三页模态抽屉背景顶栏焦点逃逸（P1-1）」，建议 Round 12 修复后进入终止判定。
