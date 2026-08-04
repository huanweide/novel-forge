# 清览（UI/a11y）透镜 · Round 12 只读复验

- 项目：novel-forge ｜ HEAD = `1cee64d`（src 实际态 = `6a85c02` v0.46.74，Round 11 已落地）
- 复验性质：**只读**，未改动 src / changelog / version / MEMORY
- 关键前提：React 19.2.4 把 `inert` 当作真正的布尔属性，`inert={false}` 会**省略属性**而非渲染 `inert="false"`，故 Round 11 的 inert 方案真实生效（无“整页恒 inert”反坑）。

---

## 一、回归结论（A 类，逐条 PASS/FAIL）

| # | 验收点 | 证据 | 结论 |
|---|--------|------|------|
| A1 | explore 抽屉打开时顶栏 header 加 inert + StepProgress 包 inert | `src/app/explore/page.tsx:525`（header `inert={leftDrawerOpen||rightDrawerOpen}`）、`:625`（StepProgress 外包 `<div inert=…>`） | **PASS** |
| A2 | workspace Toolbar + 次级栏包 inert | `src/app/workspace/[projectId]/page.tsx:848`（Toolbar 外 div inert）、`:863`（次级交互条 inert） | **PASS** |
| A3 | game 顶栏 header 加 inert | `src/app/workspace/[projectId]/game/[nodeId]/page.tsx:442`（header inert） | **PASS** |
| A4 | 对话框本身不参与 inert、焦点陷阱仍生效 | 三页抽屉 `aside` 为 inert 包裹的**兄弟节点**（explore:633/688、workspace:885/1037、game:510/749），未被 inert；`useFocusTrap` 已挂（explore:45-46、workspace:127-128、game:117-118）；`role=dialog`+`aria-modal` 仅抽屉开时生效（如 explore:636-638、692-694） | **PASS** |

**结论**：A1–A4 全部真实落地。抽屉开启时 header/StepProgress/Toolbar/次级栏/main 被 inert，键盘 Tab 与读屏被挡在背景外；抽屉本身（dialog）保持可聚焦 + 焦点陷阱，Tab 在 dialog 内循环、ESC 关闭、关闭后焦点归还。读屏/键盘可达性正确。

---

## 二、新挖问题清单（B 类，按严重级）

### P0（键盘/读屏完全不可用）
**无。** 全部模态/抽屉/Toast/Confirm/Prompt/CommandPalette 均具备 `role=dialog`+`aria-modal`+焦点陷阱；Toast 用 `role="status"/"alert"`（toast.tsx:195）自带 live 语义，读屏可播报。

### P1（可见 a11y 缺陷）

**B1 · 命令面板搜索框无可访问名称**
- 文件:行：`src/components/CommandPalette.tsx:153`
- 现象：`<input>` 仅有 `placeholder`，无 `aria-label`/`aria-labelledby`。WCAG 4.1.2——表单控件缺可访问名称，读屏仅报“编辑文字/空白”，用户不知输入框用途。
- 根因：placeholder 不计入 accessible name。
- 建议：`aria-label={projectId ? "搜索章节/角色/世界书/规则或执行操作" : "搜索操作/页面跳转"}`（或直接 `aria-labelledby` 指向面板标题）。

**B2 · Prompt 弹窗输入框无 label**
- 文件:行：`src/components/ui/toast.tsx:292`
- 现象：`, autoFocus` 的 `<input>` 无 `aria-label`，仅有上方 `<h3>`/`<p>` 标题，输入框本身无名称。
- 建议：`aria-label={promptState.opts.title}` 或 `aria-labelledby={promptTitleId}`。

**B3 · 实体高亮按 2 字名“只查头边界、不查尾边界”导致误高亮**
- 文件:行：`src/core/entity-highlighter.ts:193`（`passesBoundary = c.name.length >= 3 ? true : isHeadBoundary`）
- 现象：2 字实体名仅校验前置字符为边界，**后置字符不校验**，会误匹配更长词的内部片段。例如实体「王林」在正文「王林海」中高亮“王林”；「小医」在「小医院」中误亮。这是可见的高亮错误（也影响依赖高亮做实体识别的下游）。
- 根因：中文无空格分词，放宽尾边界以提升召回，但未排除“尾随可成词字符（CJK 汉字）”的情形。
- 建议：2 字名增加尾边界校验——`end` 处字符为边界**或**非 CJK 汉字（正则 `[一-龥]` 之外）才匹配，即 `!isTailExtend = !/[一-龥]/.test(text[c.end] ?? '')`；可在不伤召回前提下消除“王林海/小医院”类误判。

**B4 · 实体高亮类型仅靠颜色区分（WCAG 1.4.1）**
- 文件:行：`src/core/entity-highlighter.ts:11-26`（11 类各一 hue）、渲染层 `MarkdownViewer.tsx`/`rehype-entity-highlight.ts`
- 现象：角色/词条类型（人物·势力·物品·功法…共 11 色）仅凭色相区分，无色盲可及的非颜色线索（点/下划线/纹理/角标），色觉障碍用户无法分辨实体类别。
- 建议：在 `<mark>` 上叠加非颜色线索——如类别小圆点、虚线下划线条纹、或 `title`/aria 标注类别；最低限度给每类加 1px 差异化的下划线样式。

### P2（可优化）

**B5 · 暗色原生 `<select>` option 聚焦态未定制**
- 文件:行：`src/app/globals.css:1268-1280`
- 现象：已设 `option` 的 `background-color/color`，但**选中/键盘高亮态**依赖浏览器默认（常为系统蓝），跨浏览器对比度不一致，暗色下部分内核高亮白字蓝底可读、部分发灰。
- 建议：补 `option:hover, option:checked { background: var(--nv-primary); color: #fff }`（至少 Firefox/Chromium 生效），或迁移到自定义 listbox。

**B6 · bare Modal 缺 label 时无强制约束**
- 文件:行：`src/components/ui/Modal.tsx:111-114`（`dialogLabelledBy`/`dialogAriaLabel` 二者皆空时 dialog 无名，仅报“对话框”）
- 现象：调用方若用 `bare` 但既未传 `labelledBy` 也未传 `ariaLabel`，弹窗无 accessible name。当前多已传，属防护缺口。
- 建议：对 `bare && !labelledBy && !ariaLabel` 在 dev 下 `console.warn`，或要求 bare 必填其一。

**B7 · 窄屏抽屉遮罩缺 `aria-hidden`**
- 文件:行：`src/app/explore/page.tsx:708`（及 workspace:1062、game:975）
- 现象：遮罩 `fixed inset-0 z-30` 仅作点击关闭，未加 `aria-hidden`。当前背景靠 `inert` 从 AT 树移除（现代浏览器已支持），但极端旧 AT 仍可能读背景。
- 建议：遮罩加 `aria-hidden="true"`（轻量，与 inert 双保险）。

**B8 · 书卡/项目卡窄栏（<360px）文本截断无兜底**
- 文件:行：`src/components/home/PaperBoats.tsx`（书卡）、`src/app/explore/page.tsx` 的 `CardBrowser` 窄栏
- 现象：卡片标题/描述在极窄视口用 `truncate` 省略，未全部配 `title` 全量 tooltip；窄栏下信息不可见。需真机/窄窗目检确认（本次仅静态定位，未跑 UI）。
- 建议：对截断文本补 `title={fullText}` 或改用 `line-clamp-2` 多行展示。

---

## 三、复验口径说明
- A 类均经源码逐行核对（含 React 19 `inert` 布尔语义验证），非仅看 changelog。
- B 类为静态只读审查；B3/B4/B8 涉及渲染效果，建议后续用 axe-core + 真机窄屏目检交叉确认。
- 未运行 `tsc`/构建（只读要求），不影响结论。

---
**回报（一句话）**：A 类 4 条全部 PASS；新挖问题 **0 个 P0、4 个 P1（B1/B2 输入框无名、B3 两字名误高亮、B4 颜色唯一区分）、4 个 P2（B5–B8）**。
