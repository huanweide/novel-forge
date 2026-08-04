# Round 10 质量复验报告 · 清览透镜（UI / 无障碍 / 高亮 / 响应式）

- **复验角色**：股东·清览（关键词高亮 + 名称高亮 + 暗色下拉 + 弹窗滚动 + 书卡可见 + 响应式；关心高亮重叠/嵌套、对比度、溢出、移动端）
- **复验性质**：L1 只读复验（对 `src/` 严格只读，仅产本报告；不动源码、不重启 dev）
- **复验对象**：HEAD = `c824cd2`（Round 9 收尾），基线为 Round 9 实现提交 `7814d03`（v0.46.72，工作树 clean）
- **配套提交**：`7814d03`「Round 9 实现（v0.46.72）：…移动抽屉无障碍…」（三页窄屏模态抽屉无障碍修复）
- **结论速览**：Round 9 对清览透镜的修复**部分落地——6 个窄屏抽屉中 5 个通过、1 个失败**（`explore` 右抽屉漏接 role/aria-modal/aria-labelledby 且焦点陷阱 ref 未挂载 → 焦点陷阱与 ESC 实际失效）。新发现 **1 个 P1（即上述回归缺口）、3 个 P2（抽屉溢出/ inert 覆盖不全/介词漏高亮）+ 2 个 Round 9 遗留 P2 仍未修（链接焦点环、浅色弱文字对比度）**。清览透镜下**无 P0**。

---

## 回归验证

### R9-V1 · 三页窄屏模态抽屉无障碍（Round 9 N1 修复）

Round 9 声称给 workspace/explore/game 三页的 **left/right `<aside>`/`<div>` 抽屉**统一补 `role="dialog"` + `aria-modal` + `aria-labelledby`（关联 sr-only `<h2>`）+ 焦点陷阱（复用 `use-focus-trap`）+ ESC 全局关 + 背景 `inert`。逐抽屉核对当前代码：

| 页 | 抽屉 | role/aria-modal/aria-labelledby | 焦点陷阱(ref 挂载) | ESC(陷阱 capture) | 背景 inert | 遮罩 | 结果 |
|---|---|---|---|---|---|---|---|
| `workspace/[projectId]/page.tsx` | 左 | ✅ :886-888（role 条件渲染）+ `<h2 id=leftDrawerTitleId>` :894 | ✅ `ref={leftDrawerRef}` :884 + `useFocusTrap` :127 | ✅ | ✅ `<div inert>` :911 | ✅ :1060 | **通过 ✅** |
| `workspace/[projectId]/page.tsx` | 右 | ✅ :1034-1036 + `<h2 id=rightDrawerTitleId>` :1041 | ✅ `ref={rightDrawerRef}` :1032 + :128 | ✅ | ✅ | ✅ | **通过 ✅** |
| `explore/page.tsx` | 左 | ✅ :634-636 + `<h2 id=leftDrawerTitleId>` :639 | ✅ `ref={leftDrawerRef}` :632 + :45 | ✅ | ✅ `<main inert>` :645 | ✅ :698-699 | **通过 ✅** |
| `explore/page.tsx` | **右** | ❌ **缺失**（:686 无 role/aria-modal/aria-labelledby，无 `<h2>`） | ❌ **`rightDrawerRef` 未挂载**（:42 注册 `useFocusTrap(rightDrawerRef,...)` :46，但 :686 `<aside>` 无 `ref`）→ 陷阱指向 null，**不生效** | ❌ 同上，ESC 失效 | ✅ `<main inert>` :645 | ✅ :698-699 | **失败 ✗** |
| `workspace/[projectId]/game/[nodeId]/page.tsx` | 左 | ✅ :509-511 + `<h2 id=leftDrawerTitleId>` :514 | ✅ `ref={leftDrawerRef}` :508 + :117 | ✅ | ✅ `<main inert>` :670 | ✅ :975 | **通过 ✅** |
| `workspace/[projectId]/game/[nodeId]/page.tsx` | 右 | ✅ :748-750 + `<h2 id=rightDrawerTitleId>` :753 | ✅ `ref={rightDrawerRef}` :746 + :118 | ✅ | ✅ | ✅ | **通过 ✅** |

**结论：R9-V1 部分通过 ⚠️**。`workspace`（左/右）、`explore`（左）、`game`（左/右）共 5 个抽屉已正确接好；**`explore` 右抽屉（已采纳面板，`explore/page.tsx:686`）漏接**——`role`/`aria-modal`/`aria-labelledby` 全部缺失，且 `rightDrawerRef` 从未挂载到该 `<aside>`，导致为该抽屉注册的 `useFocusTrap` 成为空操作（焦点不进抽屉、Tab 不被困、ESC 不关闭）。该抽屉在窄屏以 `fixed inset-y-0 right-0 z-40` 模态形态出现（`max-w-[85vw]`），与左抽屉同等模态语义，理应被同批修复却遗漏。**这是 Round 9 修复未完全落地，属回归验证失败项，记为 P1（N6）。**

> 证据链：`git show 7814d03 -- src/app/explore/page.tsx` 的 diff 仅触及 explore 左抽屉（:628-641）+ `<main inert>`（:645），**未触碰右抽屉（:686）**，且新增的 `useFocusTrap(rightDrawerRef, rightDrawerOpen, ...)`（:46）在 JSX 中无对应 `ref={rightDrawerRef}`。

### R9-V2 · 是否还有其他裸弹窗/模态漏处理

全局检索 `useFocusTrap` / `aria-modal` / `role="dialog"` 调用点（见下方汇总），结论：

- 业务 Modal 统一收口于 `src/components/ui/Modal.tsx`（自带 `role="dialog"`+`aria-modal`+`useFocusTrap`+ESC+body 滚动锁，:87,124-133）。
- 手写模态：`toast.tsx` Confirm/Prompt（:234-235 / :278-279）、`CommandPalette.tsx`（:145-146）—— 均具备完整对话框语义。
- 6 个窄屏抽屉：5 个通过（见 R9-V1），仅 `explore` 右抽屉失败。
- 其余 `absolute`/`fixed` 浮层为下拉菜单 / Tooltip / Popover 类，**非模态**，不应套 `role="dialog"`，不在本次口径内。

**结论：除已记录的 `explore` 右抽屉外，未发现新的裸模态缺 `role=dialog`/焦点陷阱/ESC。** ⚠️（唯一缺口即 R9-V1 的回归失败项）

---

## 新发现问题

| 编号 | 严重度 | 文件:行号 | 问题简述 | 建议修复方向 | 是否 Round9 回归缺口 |
|---|---|---|---|---|---|
| N6 | **P1** | `src/app/explore/page.tsx:686`（右抽屉 `<aside>`）；关联 :42、:46（`rightDrawerRef` 注册但未挂载） | 窄屏「已采纳」右抽屉模态形态，**缺 `role="dialog"`/`aria-modal`/`aria-labelledby`/sr-only 标题**；`rightDrawerRef` 未挂到该 `<aside>`，致 `useFocusTrap` 空操作——**焦点不进抽屉、Tab 不困、ESC 不关**，键盘/读屏用户无法以模态方式操作该抽屉。与左抽屉(:631-641)同等模态却漏修。 | 在 :686 `<aside>` 补 `ref={rightDrawerRef}`、`tabIndex={-1}`、`role={rightDrawerOpen?"dialog":undefined}`、`aria-modal`/`aria-labelledby`（指向新增 `<h2 id={rightDrawerTitleId} className="sr-only">已采纳</h2>`），与左抽屉(:631-641)对齐一处维护。 | **是（Round9 N1 修复未覆盖此抽屉）** |
| N7 | P2 | `src/app/workspace/[projectId]/page.tsx:889`（左抽屉）、:1037（右抽屉） | 两个抽屉容器 `<div>` **无 `overflow-y-auto`**（同页 grep `overflow-y-auto` 计数为 0；而 explore/game 抽屉均有）。抽屉为 `fixed inset-y-0 h-full`，内部 `LeftPanel`/`RightPanel` 虽各有内层 `flex-1 overflow-y-auto`，但其高度依赖父容器约束；当面板内容高于视口（窄屏长列表/多 tab）时，存在内容溢出视口且**外层无兜底滚动**的风险。 | 在抽屉容器 className 追加 `overflow-y-auto`（与 explore :637/:686 一致），或确保 `LeftPanel`/`RightPanel` 根节点有 `h-full` 以让内层 `flex-1 overflow-y-auto` 真正生效（二选一，建议前者，改动最小）。 | 否（Round9 前即存在，非引入；属复验新挖） |
| N8 | P2 | `src/app/explore/page.tsx:645` / `src/app/workspace/[projectId]/page.tsx:911` / `src/app/workspace/[projectId]/game/[nodeId]/page.tsx:670` 的 `inert`，及三页顶部工具条（如 workspace :861-877、game :460-500） | Round 9「背景主内容 inert」**仅覆盖 `<main>`/中间列 `<div>`，未覆盖顶部工具条**。三页的抽屉切换按钮及「项目设定/记忆衰减/项目配置/结束并导出」等**会再开 Modal 的按钮位于 `inert` 区域之外**。遮罩(`z-30`)挡住了指针点击，但键盘 Tab / 读屏浏览模式仍可抵达这些按钮——抽屉以模态打开时，键盘用户仍能触发**嵌套 Modal 堆叠**。 | 将整页背景（含顶部工具条）在抽屉打开时一并 `inert`，或把抽屉切换按钮之外的工具条控件在 `leftDrawerOpen||rightDrawerOpen` 期间 `aria-hidden`/`inert`（切换按钮本身需保留以可关闭抽屉）。 | 部分（Round9 修复口径为「主内容 inert」，此处为覆盖不全的残留） |
| N9 | P2 | `src/core/entity-highlighter.ts:191`（头部边界字符集正则） | 名称高亮 2 字名的「头部边界」字符集含 与和跟同及等把被给向对由的在於为从到让使叫 等介词/连词，但**缺 将/替/比/朝/按/凭/趁/随 等常见介词**。当 2 字名（如「萧炎」）被这些介词**直接前置**（如「替萧炎」「将萧炎」「按萧炎」）时，`isHeadBoundary` 判否 → **2 字名漏高亮**（假阴性）。此为「介词边界漏高亮」口径内的真实缺口。 | 在 :191 正则字符组内补充缺失介词：…`将替比朝按凭趁随`…，或改用更稳妥的「CJK 介词词表 + 非 CJK 即边界」判定，避免逐字枚举遗漏。 | 否（复验新挖，属名称高亮透镜） |
| N3（遗留） | P2 | `src/app/globals.css:403-406`（仅 `button:focus-visible`）；引用 `src/app/page.tsx:190-205`、explore :523、game :439 等 `<a>`/`<Link>` | 全局仅 `button` 有 focus-visible 焦点环；`<a>`/`<Link>`（首页图标导航、返回链接）无 `focus-visible` 规则，键盘聚焦可见性不足。Round 9 未处理，**仍待修**。 | 增 `a:focus-visible { @apply ring-2 ring-ring/50 ring-offset-2 … }` 与按钮对齐。 | 否（Round9 遗留，本轮确认仍未修） |
| N4（遗留） | P2 | `src/app/globals.css:111` 浅色 `--nv-text-muted #9A9DA6`（白底≈2.7:1）、`:281` 浅色 `--nv-text-tertiary #6B6E78` 等 | 占位符/禁用态弱文字在浅色模式对比度低于 4.5:1（深色模式已达标）。属边界（仅占位/禁用），但偏松。Round 9 未处理，**仍待修**。 | 占位符文字至少达 4.5:1，或明确标记为装饰性；浅色主题适当提亮 `--nv-text-muted`/`--nv-text-tertiary`。 | 否（Round9 遗留，本轮确认仍未修） |

### 清览透镜其它维度核查（无缺陷，记录备查）

- **实体高亮重叠/越界/嵌套（关键词 + 名称高亮）**：
  - `entity-highlighter.ts:181-198` 采用「候选按长度降序 + 左优先排序 → 占用位数组贪心」，**最长名优先、短名落入已占区间即跳过**，从根本上杜绝「最长名被短名截断」（任务关切点一）。已验证：regex 交替项按长度降序构造(:164-167)、`lastIndex=idx+1` 捕获重叠候选(:177)、贪心占用(:186-198)。✅
  - `rehype-entity-highlight.ts:99-114` 把文本节点拆成 `text + span` 后**直接 push、不再对实体 `<span>` 递归**(:100-106 分支未调用 `walkAndHighlight`)，故不会在实体 span 内二次嵌套高亮。✅ 任务关切点「嵌套」无缺陷。
  - `matchNameStrict`（`match.ts:115-179`）对 2 字 CJK 直接子串命中、3 字+ 最长匹配优先 + knownNames 吞并保护，逻辑自洽（与 Round 6/7 一致）。
  - 唯一名称高亮缺口即 **N9（介词边界漏高亮）**，见上表。
- **暗色下拉/select/option 对比度**：`globals.css:1268-1280` 已为 `select option/optgroup` 设 `background-color: var(--nv-abyss)`（深色 = 不透明 `#161E34`，:83）+ `color: var(--nv-text-primary)`（:108 `#F8F7F2`，对比度极高）。暗色下可读。✅（注：原生 `<option>` 展开列表的最终渲染仍受操作系统/浏览器样式影响，**未经真机实测**，但已做不透明暗色兜底，优于默认白底。）
- **Tooltip 对比度**：`globals.css:716-740` 默认 `background: rgba(15,15,20,0.95)` + `color: var(--nv-text-secondary)`（暗色 `#B9B7AD` ≈7:1）；`:377-382` 浅色覆盖为 `background: rgba(255,255,255,0.97)` + 同变量（浅色 `#4A4D57` 深灰）。**两主题对比度均达标**。✅
- **长弹窗溢出/滚动**：统一 `Modal` 基座 `max-h-[88vh]/[90vh] + overflow-y-auto`（:119-120）；explore 左右抽屉、game 左右抽屉均有 `overflow-y-auto`（grep 计数 explore=2、game=4）。**唯一缺口是 workspace 左右抽屉（N7）**。
- **书卡（抽卡）响应式可见性**：`DrawCards.tsx:226` 网格 `cards.length<=3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"`——移动端恒为 **1 列**（全宽，可见性最佳），断点合理。✅ `AdoptedContentPanel`（explore 右抽屉卡片）内层 `flex-1 overflow-y-auto`（:45）在窄 `max-w-[85vw]` 抽屉内可滚动。✅

---

## 结论

- **Round 9 对清览透镜的修复是否完全生效？** 否——**部分生效**。`workspace`(左/右)、`explore`(左)、`game`(左/右) 共 5 个窄屏抽屉已正确接入 `role="dialog"`+`aria-modal`+`aria-labelledby`+焦点陷阱+ESC+背景 inert；但 **`explore` 右抽屉（:686）漏接 role/aria 且 `rightDrawerRef` 未挂载 → 焦点陷阱与 ESC 实际失效**，属 Round 9 N1 修复未覆盖的回归失败项。
- **Round 9 是否引入新回归？**
  - `inert` 兼容/SSR：React 19.2.4（:33）将 `inert` 作为布尔属性正确处理（`inert={false}` 省略属性，无「恒 inert」灾难）；初始态抽屉关闭，SSR 不输出 inert；仅要求现代浏览器（Chrome102+/FF112+/Safari15.5+），且即便不支持，`useFocusTrap` 仍守住键盘 Tab——**无硬回归**（渐进增强）。
  - 焦点陷阱释放：`useFocusTrap` 清理函数还原 `previouslyFocused`（:78），关闭后焦点归还，**无「陷阱未释放」**。唯一陷阱异常是 `explore` 右抽屉陷阱因 ref 缺失**从未激活**（见 N6），非「释放失败」而是「从未生效」。
- **清览透镜在 v0.46.72 下是否还有 P0/P1/P2？**
  - **P0：0 个。**
  - **P1：1 个** —— N6（`explore` 右抽屉无障碍缺口，Round 9 修复遗漏）。
  - **P2：5 个** —— N7（workspace 抽屉缺 overflow-y-auto）、N8（inert 未覆盖顶部工具条，可嵌套 Modal 堆叠）、N9（名称高亮介词边界漏高亮）、N3（链接焦点环缺失，遗留）、N4（浅色弱文字对比度偏低，遗留）。
- **行动建议**：Round 10 优先修 **N6（P1）**——将 `explore` 右抽屉与左抽屉(:631-641)对齐，补 `ref`/`role`/`aria-modal`/`aria-labelledby`/sr-only 标题（一处维护）；P2 批次（N7/N8/N9 + 遗留 N3/N4）可滚动纳入后续打磨。整体看，Round 9 把清览透镜的「裸模态收敛」推进到了 5/6，差最后一抽屉即闭环。
