# Round-3 修复报告 · UI-002 残留（surface-3 上 muted 未达 WCAG AA）

- **修复代号**：fix-ui-surface3-aa
- **轮次**：Round-3（魔王系统）
- **日期**：2026-08-07
- **项目根**：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- **针对问题**：Round-2 复检 `PROCESS/meetings/round-2/recheck-1/lens-ui.md` 的 NEW-UI-1（UI-002 残留）——R2-010 把 `--nv-text-muted` 调亮到 `#8E8B82`，在弹窗/卡片/纯底达 AA，但最深浮起面 `--nv-surface-3` 上 muted 文字仅 **4.25:1 < 4.5**，未达 WCAG AA。
- **基线 HEAD**：`2b88e09`（v1.6.4）

---

## 一、采用的做法

**采用做法①（最不打扰其他 surface）**：新增一个仅用于 surface-3 的 muted 变体令牌 `--nv-text-muted-on-surface-3`，并在所有「muted 文字落在 surface-3 背景上」的调用点改用该令牌；不动 `--nv-text-muted` 本身，因此 R2-010 在弹窗/卡片/纯底的成果（4.86 / 4.83 / 5.39）完全保留。

未采用做法②（调亮 surface-3 背景本身）：若把 `--nv-surface-3` 的白色 alpha 从 0.09 降到约 0.06 才能让现有 muted 达标，会与 `--nv-surface-2`（alpha 0.055）几乎重合，破坏设计体系的三级深度层次，故放弃。

未采用做法③（直接改用 tertiary）：复检建议可改用 `--nv-text-tertiary`，但那样会抹平 muted/tertiary 的层级区分；做法①可在达标的同时保住层级，故优先。

---

## 二、改了哪些文件 / 行

### 1. `src/app/globals.css`（令牌定义，3 处）
- 深色 `:root`（原 `--nv-text-muted` 行之后，约原 :110 之后）新增：
  `--nv-text-muted-on-surface-3: #96948B;`
- `.light` 主题（约原 :281 之后）新增：
  `--nv-text-muted-on-surface-3: #696C75;`（浅色未被 UI-002 复检标记，复用浅色 muted，避免令牌在浅色下未定义）
- `html.azure` 主题（约原 :1191 之后）新增：
  `--nv-text-muted-on-surface-3: #6A807C;`（苍青同理，复用其 muted）

> 仅在深色主题把值提亮为 `#96948B`；浅色/苍青保持原 muted 值，保证令牌在任意主题下均有定义，不会回退到 `inherit`。

### 2. 组件调用点（muted on surface-3 的 8 处组合，全部改用新令牌）
- `src/components/workspace/MonitorPanel.tsx`
  - :282 节奏方块未达标态 `bg-[var(--nv-surface-3)] text-[var(--nv-text-muted)]` → `... text-[var(--nv-text-muted-on-surface-3)]`（原 UI-002 高频扫读的日期/星期标签所在容器）
  - :224 日期标签 `<span ... text-[var(--nv-text-muted)]>{d.date.slice(5)}</span>`（落在 :219 的 surface-3 柱条上）→ 新令牌
  - :285 星期标签 `<span ... text-[var(--nv-text-muted)]>{wd}</span>`（落在 :282 的 surface-3 方块上）→ 新令牌
- `src/components/workspace/aichat/AIChatHeader.tsx`
  - :64 只读模式徽标 `bg-[var(--nv-surface-3)] text-[var(--nv-text-muted)]` → 新令牌
- `src/components/workspace/MemoryDecayDialog.tsx`
  - :120「已记录章节摘要」、:126「最新进度基准」（各自包在 `bg-[var(--nv-surface-3)]` 容器内）→ 新令牌
  - :142 衰减规则行值（包在 `bg-[var(--nv-surface-3)]` 容器内）→ 新令牌
  - :158「检查摘要」、:162「保留」、:166「降级」（包在 `bg-[var(--nv-surface-3)]` 结果容器内）→ 新令牌
- `src/app/dissect/new/page.tsx`
  - :149 取消按钮 `text-[var(--nv-text-muted)] ... bg-[var(--nv-surface-3)]`（同元素带 surface-3 背景）→ 新令牌

> 同一文件内其他 `text-[var(--nv-text-muted)]`（如 MonitorPanel :249 清除目标、MemoryDecayDialog :134 衰减规则标题、:100/:111 等落在默认/纯底上的文字）**未改动**，以遵循「最不打扰其他 surface」原则——这些位置原本对比度已 ≥4.5。

---

## 三、修复前后对比度计算（WCAG 2.1 相对亮度公式）

公式：
- 通道线性化：`c ≤ 0.03928` 时 `c/12.92`，否则 `((c+0.055)/1.055)^2.4`
- 相对亮度 `L = 0.2126·R + 0.7152·G + 0.0722·B`
- 对比度 `CR = (L_亮 + 0.05) / (L_暗 + 0.05)`

**surface-3 合成实色**：`rgba(255,255,255,0.09)` 以 alpha 合成到 `--background` `#0E1424`(14,20,36)：
`R=round(255·0.09+14·0.91)=36`，`G=41`，`B=56` → **`#242938`**，`L_bg = 0.02246`。

| 前景文字 | 颜色 | 相对亮度 L | 对比度 CR | 是否 AA(≥4.5) |
|---|---|---|---|---|
| 修复前 muted | `#8E8B82` | 0.25828 | **4.254** | 否（< 4.5） |
| 修复后 muted-on-surface-3 | `#96948B` | 0.29528 | **4.765** | 是（≥ 4.5） |
| tertiary（对照，验证层级未被压） | `#98968C` | 0.30382 | 4.883 | 是 |

**结论**：surface-3 上 muted 对比度由 **4.25:1 提升至 4.77:1**，达 WCAG AA；且新值（4.765）仍低于同表面上的 tertiary（4.883），**四级文字层级（primary > secondary > tertiary > muted-on-surface-3）保持完整**。

R2-010 原覆盖范围（弹窗/卡片/纯底）经复测不变：`#8E8B82` 对 popover `#161E34` = 4.86:1、对卡片合成 `#191F2E` = 4.83:1、对纯底 `#0E1424` = 5.39:1，均 ≥ 4.5，**未被本次改动影响**。

---

## 四、验证结果

- **TypeScript 类型检查**：`cd 项目根 && SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → 退出码 **0**，零错误（纯 CSS/类名令牌改动，不影响类型）。
- **残留组合复核**：在 `src` 全量 Grep 形如 `bg-[var(--nv-surface-3)] ... text-[var(--nv-text-muted)]`（同元素或同元素内同时出现两者，未带 `-on-surface-3`）的组合 → **无匹配**，确认已识别的 surface-3+muted 组合均已切换为新令牌。
- **令牌定义完整性**：深色 / 浅色 / 苍青三套主题均已定义 `--nv-text-muted-on-surface-3`，任意主题下引用不会未定义回退。

---

## 五、诚实声明

1. **对比度数值为数学合成计算**：基于「半透明 `rgba(255,255,255,0.09)` 表面按 alpha 合成到 `--background` 之上」的模型，未包含真实浏览器中 `backdrop-filter` 玻璃模糊、抗锯齿、父级多层背景叠加带来的微小像素偏差。计算显示修复后 4.77:1，较 4.5 阈值有约 0.27 的余量，结论稳健；但**真实浏览器目测清晰度标注「未经实测，待验证」**（本沙箱无 Chromium）。
2. **覆盖范围边界**：本次修复了已定位的、muted 文字直接落在 surface-3 背景上的 8 处组合（含监测面板节奏标签这一 UI-002 高频场景）。对「surface-3 更深嵌套层级内间接包含 muted 文字」的极端边界，已通过全量 Grep 同元素组合复核为 0 残留；但若存在跨多层的间接嵌套（父为 surface-3、孙为 muted 且中间隔其他元素），无法被本次静态 Grep 完全穷举。
3. **根治建议（非本次范围）**：复检 NEW-UI-1 建议把「muted 在 surface-1/2/3 上的合成对比度」纳入 `scripts/lint-colors.mjs` 做 CI 断言，以防回归。本次未改动 CI 脚本，列为后续建议。
4. **未触碰**：R2-010 的弹窗/卡片/纯底成果、浅色与苍青主题的 muted 值、设计体系三级深度层次，均保持不变。

> 落盘完成。本报告基于真实代码阅读、WCAG 公式手算 + Node 脚本复算、tsc 零错误验证，未编造任何现象、行号或比值；对依赖浏览器运行时的项已如实标注待验证。
