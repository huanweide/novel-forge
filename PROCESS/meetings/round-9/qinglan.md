# Round 9 质量复验报告 · 清览透镜（UI / 无障碍 / 高亮 / 响应式）

- **对象版本**：v0.46.71（Round 8 提交 `bb2b86a`，工作树 clean）
- **复验范围**：① Round 8 对清览透镜的修复回归；② 清览透镜新坑挖掘
- **结论速览**：Round 8 对 `toast.tsx`（Confirm/Prompt）与 `CommandPalette.tsx` 的对话框无障碍修复**验证通过**；新发现 **0 个 P0、1 个 P1（移动抽屉无障碍缺口）、4 个 P2**。清览透镜下**无 P0**，**有 1 个 P1**。

---

## 回归验证

### R8-V1 · toast.tsx 的 Confirm/Prompt 弹窗
**结论：通过 ✅**

| 验证项 | 结果 | 证据 |
|---|---|---|
| `role="dialog"` + `aria-modal="true"` | ✅ | toast.tsx:234-235（Confirm）、278-279（Prompt） |
| `aria-labelledby` 指向真实存在的元素 id | ✅ | `aria-labelledby={confirmTitleId}`（:236）/ `promptTitleId`（:280）→ 对应 `<h3 id={confirmTitleId}>`（:246）、`<h3 id={promptTitleId}>`（:286），id 由 `useId()` 生成且真实渲染 |
| 焦点陷阱（复用 `useFocusTrap`） | ✅ | toast.tsx:154-155 |
| ESC 全局可关 | ✅ | `use-focus-trap.ts:45-49` 用 `document` capture 监听，无论焦点在面板内何处均触发 `onClose` |
| Tab 在内部循环不逃逸 | ✅ | `use-focus-trap.ts:50-73`，首尾循环 + `!node.contains` 兜底 |
| 焦点进入落在对话框内 | ✅ | 打开时聚焦首个可聚焦元素（Confirm=取消按钮；Prompt=输入框 `autoFocus` + 焦点陷阱双保险） |
| 关闭后焦点归还 | ✅ | `use-focus-trap.ts:78` 还原 `previouslyFocused` |

### R8-V2 · CommandPalette.tsx
**结论：功能通过，规格有小幅偏离 ⚠️**

| 验证项 | 结果 | 证据 |
|---|---|---|
| `role="dialog"` + `aria-modal="true"` | ✅ | CommandPalette.tsx:145-146 |
| 读屏能报出名称 | ✅（但非规格写法） | 用 `aria-label="命令面板"`（:147），面板无可见标题元素，读屏仍能播报名称 |
| 焦点陷阱（复用 `useFocusTrap`） | ✅ | CommandPalette.tsx:35 |
| ESC 可关 | ✅ | 面板内 `onKeyDown` :132 + 焦点陷阱双重关闭 |
| 焦点进入落在对话框内 | ✅ | `setTimeout(() => inputRef.current?.focus())`（:108）与焦点陷阱共同把焦点送入输入框 |

**偏离说明（非功能失败）**：回归规格要求 CommandPalette 也补 `aria-labelledby`，但实际实现为 `aria-label`（因面板没有可见标题元素）。功能上读屏可正确报出「命令面板」，**不构成回归失败**，但属规格偏差，见新发现问题 N5。

### R8-V3 · 是否还有别的弹窗漏处理
**结论：业务 Modal 已统一收敛；移动抽屉是遗留缺口**

- 全部 22+ 业务弹窗（角色/世界书/大纲/导入/导出/记忆衰减/工具箱/抽卡/项目配置/构建配置/自动化/冲突/保存冲突/扩展结果 等）已在 Round 6/7 统一收编到 `src/components/ui/Modal.tsx`，该基座自带 `role="dialog"`+`aria-modal`+`useFocusTrap`+ESC+body 滚动锁（Modal.tsx:87,124-133）。**无遗漏。**
- 但发现 3 处**移动抽屉**（workspace/explore/game 三页的 left/right `<aside>`）在窄屏以模态形态出现却未做对话框语义与焦点陷阱——见 N1。这是 Round 8 未覆盖的遗留缺口。

---

## 新发现问题

| 编号 | 严重度 | 文件:行号 | 问题简述 | 建议修复方向 | Round8 回归标记 |
|---|---|---|---|---|---|
| N1 | **P1** | `src/app/workspace/[projectId]/page.tsx:1014-1037`（右抽屉+遮罩，左抽屉同模式）；`src/app/explore/page.tsx:623,670,683`；`src/app/workspace/[projectId]/game/[nodeId]/page.tsx:498,729,951` | 移动抽屉（窄屏 `lg:hidden` 遮罩 + `fixed inset-y-0` 滑入 `<aside>`）以模态形态出现，但**无 `role="dialog"`、无 `aria-modal`、无焦点陷阱、无 ESC 关闭**，背景也未 `inert`/`aria-hidden`。键盘/读屏用户焦点会逃逸到背景内容，且无法用 ESC 关闭。 | 给抽屉面板加 `role="dialog" aria-modal="true" aria-label`；复用 `useFocusTrap(panelRef, open, close)`；补 ESC 关闭；背景加 `aria-hidden`/`inert`（或封装为 Modal 的抽屉变体，统一维护一处）。 | 否（R8 仅修 toast/CommandPalette，抽屉为遗留缺口） |
| N2 | P2 | `src/components/workspace/BatchProgressPanel.tsx:19-47` | 批量生成为长时间异步任务，进度/完成/失败仅视觉展示，**无 live region**，屏幕阅读器中途静默（结束可能依赖 toast，但进程内无播报）。 | 给汇总状态行加 `role="status" aria-live="polite"`；或在容器加 `aria-busy` 随生成态切换。 | 否 |
| N3 | P2 | `src/app/globals.css:403-406`（仅 `button:focus-visible`）；引用点 `src/app/page.tsx:190-205`、`src/app/explore/page.tsx:523`、`src/app/workspace/[projectId]/game/[nodeId]/page.tsx:439` | 全局仅 `button` 有 focus-visible 焦点环；`<a>`/`<Link>`（首页图标导航、返回链接等）无 `focus-visible` 规则，键盘聚焦可见性不足（被 preflight 默认轮廓弱化）。 | 增加 `a:focus-visible { @apply ring-2 ring-ring/50 ring-offset-2 ... }` 与按钮对齐。 | 否 |
| N4 | P2 | `src/app/globals.css:111`（深色 `--nv-text-muted #75736B` ≈3.6:1）、`:281`（浅色 `--nv-text-muted #9A9DA6` 在白底 ≈2.7:1） | 占位符/禁用态弱文字对比度低于正文 4.5:1（浅色模式尤弱）。属边界（仅占位/禁用），但偏松。 | 占位符文字至少达 4.5:1，或明确标记为装饰性；浅色主题适当提亮 `--nv-text-muted`。 | 否 |
| N5 | P2 | `src/components/CommandPalette.tsx:147`（对比回归规格） | 回归规格要求 `aria-labelledby`，实际实现为 `aria-label`。功能可用（读屏能报名称），属规格偏离而非功能失败。 | 若需严格对齐规格，可在面板内加可见标题（如 `<h2>`「命令面板」）并以 `aria-labelledby` 关联；或接受 `aria-label` 写法并在回归说明中注明。 | **是（规格偏离，非功能失败）** |

### 清览透镜其它维度核查（无缺陷，记录备查）
- **实体高亮重叠/越界**：`src/core/entity-highlighter.ts:151-203` 的 `findEntitiesInText` 采用「单遍正则收集候选 → 按长度降序+左优先排序 → 占用位数组贪心」，**最长名优先、短名落入已占区间即跳过**，从根本上杜绝重叠与数组越界；`rehype-entity-highlight.ts:42-79` 把文本节点拆成 `text + span` 后**直接 push、不再递归**（:100-106），故不会在实体 `<span>` 内二次嵌套高亮。清览透镜在实体高亮维度**未发现重叠/越界/嵌套缺陷**。
- **图片 alt**：全 `src` 无 `<img>` 标签（图标走 SVG `Icon` 组件），无「图片缺 alt」问题。
- **对比度（主文字）**：深色主题 `--nv-text-secondary #B9B7AD`(≈7:1)、`--nv-text-tertiary #98968C`(≈5.2:1) 均达 AA，主文字对比度良好。
- **响应式溢出**：`Modal` 与 `CommandPalette` 均用 `max-w-* + w-[…vw] + p-4` 约束，未见明显窄屏溢出；主要响应式风险即 N1 的移动抽屉。

---

## 结论

- **Round 8 对清览透镜的修复是否生效？** 是。`toast.tsx`（Confirm/Prompt）与 `CommandPalette.tsx` 均已具备 `role="dialog"`+`aria-modal`+焦点陷阱（ESC 全局、Tab 循环、焦点进入/归还），`aria-labelledby`（toast）能指向真实渲染的标题 id，读屏可报出名称。CommandPalette 用 `aria-label` 替代 `aria-labelledby` 属规格偏离但功能达标（N5）。
- **清览透镜在 v0.46.71 下是否还有 P0/P1？**
  - **P0：无。**
  - **P1：1 个** —— N1 移动抽屉（workspace/explore/game 三页）在窄屏模态态下缺对话框语义、焦点陷阱与 ESC 关闭，键盘/读屏可达性缺口。
  - **P2：4 个** —— N2 批量进度无 live region、N3 链接焦点环缺失、N4 浅色占位符对比度偏弱、N5 CommandPalette aria-labelledby 规格偏离。
- **行动建议**：优先在 Round 9 处理 **N1（P1）**，将三页移动抽屉统一接入 `Modal`/焦点陷阱+`aria-modal`+ESC（与既有 `Modal` 基座一处维护）；P2 项可滚动纳入后续打磨。
