# MaxLoop 魔王系统 · round-2 复检循环 · UI / 主题透镜（recheck-1）

- **复检代号**：lens-ui / recheck-1
- **轮次**：round-2 阶段五复检循环
- **复检日期**：2026-08-07
- **项目根**：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- **基线 HEAD**：`2b88e09`（v1.6.4）
- **复检范围**：R2-004 / R2-008 / R2-010 / R2-015 四项 UI 相关修复的「真生效」核验 + 全局新坑挖掘
- **方法**：Trust but verify —— 逐文件 Grep + Read 当前内容，确认改动真实落地、读写闭环；对比度用手写 WCAG 2.1 相对亮度公式 + Node 脚本双向核算；对依赖浏览器/运行时才能确认的项明确标注「未经实测，待验证」。
- **诚实边界**：纯浏览器视觉项（toast 实际弹出动画、实际像素渲染、localStorage 跨会话真实落盘）本沙箱无 Chromium，统一标注待验证，绝不伪装已验证；对比度数值为数学合成计算，已在下文展示完整过程。

---

## 一、四条复检项逐条验证结论

### R2-004 ｜ PreGenConfirm 的 onConfirm 新增 localStorage 写入端（批量角色卡持久化断链修复）

**结论：生效（读写闭环已建立，键一致，下游真实消费）。**

**验证路径与证据：**

1. 读取端（早已存在，R2-004 修复前唯一的端）位于 `src/app/workspace/[projectId]/page.tsx:804-816`。在 `handleBatchGenerate` 开头，通过一个 IIFE 读取：
   - `JSON.parse(localStorage.getItem(\`pregen-conf-${project.id}\`) || "{}")`，取出 `selected` 与 `newChars` 两个字段（:806-809）。
   - 随后 `batchConfirmedCardIds = drawSelectedCharIds.length > 0 ? drawSelectedCharIds : pregenPersisted.selected ?? []`（:814-815）。
   - `batchNewChars = pregenPersisted.newChars ?? []`（:816）。

2. 写入端（本次 R2-004 新增）位于 `src/app/workspace/[projectId]/page.tsx:1294-1308`，即 `PreGenConfirm` 的 `onConfirm` 回调内：
   - 守卫 `if (project)` 后 `try { localStorage.setItem(\`pregen-conf-${project.id}\`, JSON.stringify({ selected: cards, newChars })); } catch { /* localStorage 不可用时静默降级 */ }`（:1300-1308）。
   - 写入形状为 `{ selected: cards, newChars }`，与读取端期望的 `selected` / `newChars` 字段名完全对齐。

3. 写入值来源的真实形状：进入 `PreGenConfirm.tsx` 确认其核心调用 `onConfirm(confirmedIds, {}, newChars, localAuthorNote)`（PreGenConfirm.tsx:102）。其中 `confirmedIds = matchedIds.length > 0 ? matchedIds : cards.map((c) => c.id)`（:101），即 `cards` 参数在父组件中被当作 `string[]`（角色卡 id 数组）接收；`newChars` 为 `string[]`（角色名数组）。二者类型与读取端 `selected?: string[]` / `newChars?: string[]` 的类型注解一致，不存在序列化形状错配。

4. 下游真实消费：读取出的 `batchConfirmedCardIds` 与 `batchNewChars` 在 `handleBatchGenerate` 内被用于构造请求体 `body: JSON.stringify({ ..., confirmedCardIds: batchConfirmedCardIds, cardNotes: {}, newCharacterRequests: batchNewChars })`（page.tsx:825），发往 `/api/generate/write`。因此「写入 → 读出 → 实际进入生成请求」是一条完整闭环，不是孤立的写操作。

5. 键一致性：写入键 `pregen-conf-${project.id}`（:1302）与读取键 `pregen-conf-${project.id}`（:806）逐字符一致，均以 `project.id` 为命名空间。全代码库 Grep `pregen` 仅命中这两处（外加 PreGenConfirm.tsx 内的组件 id 与 aria，无关），不存在第三条读写端使用不同键名导致的「写 A 读 B」错配——这正是原始 R2-004 排查提示里担心的「localStorage 键不一致」风险，在本项中未出现。

**诚实边界与一处设计性前提（非缺陷，但须说明）：**
- 闭环成立，但 `batchConfirmedCardIds` 的生效有一个优先级前提：当且仅当 `drawSelectedCharIds.length === 0`（当前这一轮没有「抽中卡」）时，持久化的 `pregenPersisted.selected` 才会被采用；一旦本轮有抽中卡，抽中卡会覆盖持久化值（:814-815）。`newChars` 则无论是否有抽中卡都会采用持久化值（:816，无覆盖分支）。这意味着 R2-004 的持久化在「用户先单章确认角色、随后在未重新抽卡的情况下发起批量生成」这一路径上才真正生效。这是修复说明注释里明确写明的设计意图（「批量生成复用单章角色卡调度逻辑——带当前抽中卡 + 上次 PreGen 确认」），属有意为之，不构成读写未闭环。
- 我对 localStorage 的「运行时真实读写」未做浏览器实测（无 Chromium），但代码层面的读写键、形状、消费链路已逐行核对闭环，逻辑正确性可确认；运行时行为属于「待验证」。

---

### R2-008 ｜ 选章空导出前端 toastWarning 提示（导入导出族 P1）

**结论：生效（前端守卫 + 后端级联 + 后端结构化错误三重闭环；主场景已被真实拦截）。**

**验证路径与证据：**

1. 前端守卫（toastWarning 真实触发）：`src/components/workspace/ExportDialog.tsx:75-80` 的 `doExport` 函数在最开头即：
   ```
   if (range === "selected" && selected.size === 0) {
     toastWarning("未选中任何章节");
     return;
   }
   ```
   该守卫位于 `setChecking(true)` 之前，只要是「选章模式且零勾选」就立即中止并弹出非阻塞警告，不会走到后续 fetch。`toastWarning` 本身确实存在于 `src/components/ui/toast.tsx:71`（`export function toastWarning(description, title?)`），且 `ExportDialog.tsx:8` 已正确 import。函数真实存在、真实调用、真实接线，确认触发链路闭合。

2. 后端级联（根治「选父节点不级联子章节」这一原始 bug 的根）：`src/app/api/projects/[id]/export/route.ts:45-59`。当 `chapterIds` 存在且非空时，用 `addDesc` 递归把目标节点及其所有后代（`for (const n of allNodes) if (n.parentId === nid) addDesc(n.id)`）一并纳入 `keep` 集合，再 `allNodes = allNodes.filter((n) => keep.has(n.id))`。也就是说，**即便用户只勾选了一个「卷」节点**，后端也会把它名下的所有章、节、幕递归展开进导出集——原始 R2-008 描述的「选卷/父节点子章节未级联 → 空导出」在此被后端级联消除。这是比前端 toast 更彻底的根因修复。

3. 后端结构化错误 + 前端二次拦截（兜底空导出）：`export/route.ts:61-68` 在级联之后再次判断 `if (chapterIdsParam && allNodes.length === 0)`，返回 `{ error: "未选中任何有效章节（选中节点不存在或不含下属内容）" }` 并带 `status: 400`。前端 `doExport` 的 fetch 分支（ExportDialog.tsx:85-99）在 `!res.ok` 时解析 `errData.error` 并用正则 `/未选中|没有内容|没有有效章节/` 匹配，命中即 `toastWarning(emptyHint)` 并 return，**不会降级去下载空白文件**。注意正则明确覆盖了后端这条新错误消息里的「未选中任何有效章节」，确保后端兜底也能在前端以 toast 形式告知用户，而非静默。

4. `chapters` 数据源确认：`page.tsx:1240-1243` 把 `project.storyNodes` 全部节点（含 `volume/section/scene/chapter`）映射到 `{ id, title }`，标题带「卷：/节：/幕：」前缀。因此卷节点确实出现在可选列表里，可被勾选——这正好对应原始 bug 场景，而上述后端级联（路径 2）正是为此兜底。

**诚实边界与一处残留边缘（新坑 NEW-UI-4）：**
- 「选章且零勾选」与「勾选的节点级联后无任何后代内容」两种空导出场景，均已被拦截并提示。但存在第三种更隐蔽的边缘：**用户勾选了若干「存在但正文为空」的章节**（例如只写了大纲还没正文的占位章）。此时 `addDesc` 把这些节点纳入 `keep`，`allNodes.length > 0`，后端返回 200，前端 `proceedExport()` 照常 `window.open` 下载——而构建器 `buildChapterList` 通常跳过 `!n.content` 的节点，最终产出一个几乎空白的文件，且全程无任何 toast 提示。这条路径不在 R2-008 的任何一层拦截内，属真实残留缺陷，详见第二节 NEW-UI-4。严重程度中等（用户能意识到自己选了空章，但「导出成功」的暗示会造成困惑）。
- toast 的实际弹出动画/可读性是纯浏览器视觉，未做运行时目测，标注待验证；但触发逻辑与文案已确认接线。

---

### R2-010 ｜ 深色主题 `--nv-text-muted` 调亮至 #8E8B82（WCAG AA 修复）

**结论：生效（声明范围成立）——深色 :root 的 `--nv-text-muted` 已从 #83807A 改为 #8E8B82，弹窗(popover)实测 4.86:1 ≥ 4.5:1，卡片 4.83:1、纯底 5.39:1 均达标；浅色主题未被误改。但 surface-3 落点仍 4.25:1，属 UI-002 残留，未被本项覆盖（见 NEW-UI-1）。**

**验证路径与证据：**

1. 当前全局 CSS 状态（Grep + Read `src/app/globals.css`）：
   - 深色 `:root`（行 110）：`--nv-text-muted: #8E8B82;`（注释明确写「R2-010：提亮至落深色卡片/弹窗(popover #161E34)≥4.5:1，实测约 4.86:1」）。**确认已从原始 #83807A 修改。**
   - 浅色 `.light`（行 281）：`--nv-text-muted: #696C75;`，注释「浅色主题：对比度 4.6:1，达 WCAG AA」。**与修改前一致，确认浅色主题未被误改。**
   - 苍青 `html.azure`（行 1191）：`--nv-text-muted: #6A807C;`，独立主题，未动。

2. 深色主题相关表面令牌（globals.css:178-208、83-85）：
   - `--background: #0E1424`
   - `--card: rgba(255,255,255,0.045)`
   - `--popover: #161E34`
   - `--nv-surface-1: rgba(255,255,255,0.03)`
   - `--nv-surface-2: rgba(255,255,255,0.055)`
   - `--nv-surface-3: rgba(255,255,255,0.09)`

3. 对比度公式手算过程（WCAG 2.1 相对亮度）：
   对任意 sRGB 通道值 `c ∈ [0,1]`：
   - 若 `c ≤ 0.03928`，线性值 `= c / 12.92`；否则 `= ((c + 0.055) / 1.055) ^ 2.4`。
   - 相对亮度 `L = 0.2126·R + 0.7152·G + 0.0722·B`。
   - 对比度 `CR = (L_light + 0.05) / (L_dark + 0.05)`。

   半透明表面按「白色以 alpha 覆盖到 `--background` (#0E1424) 之上」做 alpha 合成：`out = round(channel_white · α + channel_bg · (1 − α))`。

   **（a）前景 #8E8B82 的相对亮度：**
   - R=142 → 0.55686；G=139 → 0.54510；B=130 → 0.50980。
   - R 线性：`((0.55686+0.055)/1.055)^2.4 = (0.58006)^2.4`。`ln(0.58006) = −0.54442`，`×2.4 = −1.30661`，`exp = 0.27075`。
   - G 线性：`((0.54510+0.055)/1.055)^2.4 = (0.56882)^2.4`。`ln = −0.56436`，`×2.4 = −1.35446`，`exp = 0.25811`。
   - B 线性：`((0.50980+0.055)/1.055)^2.4 = (0.53541)^2.4`。`ln = −0.62444`，`×2.4 = −1.49866`，`exp = 0.22331`。
   - `L_fg = 0.2126×0.27075 + 0.7152×0.25811 + 0.0722×0.22331 = 0.05757 + 0.18461 + 0.01612 = 0.25830`。

   **（b）弹窗背景 #161E34 的相对亮度：**
   - R=22 → 0.08627；G=30 → 0.11765；B=52 → 0.20392。
   - R 线性：`((0.08627+0.055)/1.055)^2.4 = (0.13388)^2.4`。`ln = −2.0104`，`×2.4 = −4.82496`，`exp = 0.00802`。
   - G 线性：`((0.11765+0.055)/1.055)^2.4 = (0.16360)^2.4`。`ln = −1.8106`，`×2.4 = −4.34544`，`exp = 0.01297`。
   - B 线性：`((0.20392+0.055)/1.055)^2.4 = (0.24536)^2.4`。`ln = −1.4056`，`×2.4 = −3.37344`，`exp = 0.03424`。
   - `L_popover = 0.2126×0.00802 + 0.7152×0.01297 + 0.0722×0.03424 = 0.001705 + 0.009276 + 0.002472 = 0.013453`。
   - **CR(popover) = (0.25830 + 0.05) / (0.013453 + 0.05) = 0.30830 / 0.063453 = 4.858 ≈ 4.86:1 ✓**（与代码注释一致，≥ 4.5 AA）。

   **（c）卡片背景（rgba(255,255,255,0.045) 合成到 #0E1424）：**
   - 合成实色：`R = round(255×0.045 + 14×0.955) = round(11.475 + 13.37) = 25`；`G = round(255×0.045 + 20×0.955) = round(11.475 + 19.10) = 31`；`B = round(255×0.045 + 36×0.955) = round(11.475 + 34.38) = 46`。即 `#191F2E`。
   - 计算得 `L_card ≈ 0.01382`，**CR(card) = (0.30830)/(0.01382+0.05) = 4.830 ≈ 4.83:1 ✓**。

   **（d）纯底色 #0E1424：** `L_bg0 ≈ 0.00719`，**CR(bg) = 0.30830 / 0.05719 = 5.39:1 ✓**。

   **（e）surface-2（rgba(255,255,255,0.055) 合成）：** 合成 `#1B2130`，`L ≈ 0.01674`，**CR(surface-2) = 0.30830/0.06674 = 4.72:1 ✓**。

   **（f）surface-3（rgba(255,255,255,0.09) 合成）：** 合成 `#242938`，`L ≈ 0.02247`，**CR(surface-3) = 0.30830/0.07247 = 4.25:1 ✗（< 4.5）**。

   上述数值已用 Node 脚本（WCAG 公式）独立复算，与手算逐项吻合（popover 4.86、card 4.83、bg 5.39、surface-2 4.72、surface-3 4.25）。

4. 解读：R2-010 的「预期修复」明确指向「落弹窗约 4.86:1 ≥ AA」，该目标已达成且经过手算与脚本双重确认。但必须如实指出：**修复注释只承诺了 popover（及纯底/卡片）达标，并未覆盖 surface-3**。而原始 round-2 透镜报告里的 UI-002 恰恰是「监测面板节奏标签落在 surface-3 仅 3.65:1（旧值）」——用新值 #8E8B82 核算后 surface-3 提升到 4.25:1，仍低于 4.5 阈值，**UI-002 因此未被本项真正清零**。这是「声明范围生效、但相邻同类缺陷未根治」的典型部分修复，必须在诚实声明里点明。

---

### R2-015 ｜ LorebookEditDialog 的 15 个 `<option>` 改为从 WORLD_MODULES.map 派生

**结论：生效（LorebookEditDialog 内分类下拉已完全派生，无硬编码分类残留）。但「15 类单一来源」的全局目标仍有残留（tool-registry 四份硬编码 enum、depth 下拉未复用 DEPTH_LABEL、多套 label 分歧），见 NEW-UI-2 / NEW-UI-3。**

**验证路径与证据：**

1. `src/components/workspace/LorebookEditDialog.tsx:111-117` 的「分类」`<select>`：
   ```
   <select ... value={form.category} ...>
     {WORLD_MODULES.map((m) => (
       <option key={m.key} value={m.key}>{m.label}</option>
     ))}
   </select>
   ```
   分类下拉已 100% 由 `WORLD_MODULES` 派生，无任何硬编码 `<option value="geography">地理</option>` 之类残留。

2. `WORLD_MODULES` 来源（`src/components/workspace/worldPanelData.ts:5-21`）确为 15 项：geography / faction / item / magic_system / technique / creature / culture / history / law / currency / custom / fate_system / physics / public_system / character_relationship。数量与「15 类」一致，且 `as const` 保证类型稳定。

3. 该对话框内另一处 `<select>`（记忆注入方式，LorebookEditDialog.tsx:119-125）仍硬编码 5 个 `<option>`（value 0~4）。这 5 个是「注入深度」而非「世界分类」，语义不同，不属于 R2-015 的范畴；但存在 `DEPTH_LABEL` 常量（worldPanelData.ts:27-33）定义了同样的 0~4 深度标签却未在对话框复用，属本透镜新发现的次要不一致（NEW-UI-3）。

4. 交叉验证「单一来源」是否在相关下游也落地（不只 LorebookEditDialog）：
   - `src/app/api/generate/pre-write-cards/route.ts:210-216`：`const LORE_CHECK_CATEGORIES = ALL_WORLD_CATEGORIES.filter((c) => c !== "character_relationship" && c !== "custom")`，由分类器常量派生 ✓。
   - `src/app/api/lorebook/route.ts:18`：`const VALID_CATEGORIES = new Set<string>(ALL_WORLD_CATEGORIES)`，校验白名单由同一常量派生 ✓。
   - 这两处与 LorebookEditDialog 共同构成「分类下拉 + 校验 + 路由检查」三端收敛，R2-015 的核心诉求（不再各写各的分类字符串）在 UI 与 API 主路径上已落实。

5. 但若把「15 类单一来源」放宽到全代码库，仍有硬编码残留（详见 NEW-UI-2）：`src/core/agents/tool-registry.ts` 在 `lore_list`(325)、`lore_get`(352)、`lore_create`(382)、`lore_update`(446) 四个工具 schema 里各写了一份完全相同的 15 类 `enum: [...]` 字面量数组，均未引用 `ALL_WORLD_CATEGORIES` 或 `WORLD_MODULES`。这是 R2-015 在「字符串散落 13~36 文件」维度上的残余，应作为新坑记录。

---

## 二、新坑清单（文件:行号 + 问题 + 复现思路）

### NEW-UI-1 ｜ P1 —— 深色 surface-3 上的 `--nv-text-muted` 仍 4.25:1，UI-002 未被 R2-010 清零

- **文件:行号**：`src/app/globals.css:110`（muted=#8E8B82）、`:85`（surface-3=rgba(255,255,255,0.09)）、`:182`（popover=#161E34，作为对照）；调用点 `src/components/workspace/MonitorPanel.tsx:224,282,285`（节奏条日期/星期标签 `text-[var(--nv-text-muted)]` 落在 `bg-[var(--nv-surface-3)]`）。
- **问题**：R2-010 仅把 muted 提亮到 popover/card 达标（4.86/4.83），但 surface-3 落点实测 **4.25:1 < 4.5**，UI-002（监测面板每天高频扫读的日期标签）依旧未达 WCAG AA。作者每日查看「今日写多少字」的面板，日期标签仍偏糊。
- **复现思路**：进入工作区 → 打开监测面板 → 看「写作节奏（近 7 天）」的日期/星期小标签（落在 surface-3 方块上），肉眼可见发灰；或以本报告公式核算 muted(#8E8B82) vs surface-3 合成色(#242938) = 4.25:1。
- **建议**：把 muted 在 surface-3 上进一步提亮，或在监测节奏标签改用 `--nv-text-tertiary`（surface-3 上约 5.5:1）；并把「muted 在 surface-1/2/3 上的合成对比度」纳入 `scripts/lint-colors.mjs` 做 CI 断言，防止再回归。

### NEW-UI-2 ｜ P1 —— 15 类分类 enum 在 tool-registry 硬编码四份，单一来源仍破裂

- **文件:行号**：`src/core/agents/tool-registry.ts:325`（lore_list）、`:352`（lore_get）、`:382`（lore_create）、`:446`（lore_update），四处各写了一整条 15 类 `enum: ["geography",...,"custom"]` 字面量数组。
- **问题**：R2-015 把 LorebookEditDialog / pre-write-cards / lorebook 路由的分类收敛到了 `WORLD_MODULES` / `ALL_WORLD_CATEGORIES`，但 agent 工具 schema 这四处仍各自硬编码同一份 15 类字符串。一旦将来新增/重命名/删除一个世界分类，下拉（已派生）与这四个工具 schema 会产生漂移——AI 工具将接受或拒绝与 UI 不一致的分类，造成隐蔽的数据不一致。`src/core/types/index.ts:96`、`src/core/settings/parser.ts:99` 也各有一份 `WorldCategory` 联合类型字面量，同样未引用统一常量。
- **复现思路**：Grep `enum: \["geography"` 可见 4 处完全相同的数组；与 `worldPanelData.ts:5` 的 `WORLD_MODULES` 对照，确认无引用关系。修改 `WORLD_MODULES` 增加一类后，验证这四个工具 schema 不会自动同步（需手工改）。
- **建议**：让工具 schema 的 category enum 由 `ALL_WORLD_CATEGORIES`（或 `WORLD_MODULES.map(m=>m.key)`）程序化生成，例如 `enum: [...ALL_WORLD_CATEGORIES]`；联合类型改 `type WorldCategory = (typeof WORLD_MODULES)[number]["key"]`，彻底收敛单一来源。

### NEW-UI-3 ｜ P3 —— LorebookEditDialog 的注入深度下拉未复用 DEPTH_LABEL 常量

- **文件:行号**：`src/components/workspace/LorebookEditDialog.tsx:119-125`（5 个硬编码 `<option>` 写「0 · 常驻·强效（正文前，优先级最高）」等）；对照 `src/components/workspace/worldPanelData.ts:27-33` 已存在 `DEPTH_LABEL: Record<number,string>`（值为「常驻·强效」「触发·默认」等简版）。
- **问题**：同一套「深度 0~4 → 文案」语义在两个地方各写一遍，且文案不一致（下拉里是「0 · 常驻·强效（正文前，优先级最高）」，常量里是「常驻·强效」）。属于 R2-015 同源的「单一来源」卫生问题，只是落在深度而非分类维度；未来调整深度语义要改两处。
- **复现思路**：打开词条编辑弹窗 → 看「记忆注入方式」下拉的 5 个选项 → 与 `worldPanelData.ts` 的 `DEPTH_LABEL` 对照，确认文案分歧。
- **建议**：下拉由 `DEPTH_LABEL` 派生（或在常量里补充完整描述字段），消除重复与分歧。

### NEW-UI-4 ｜ P2 —— 勾选「存在但正文为空」的章节时静默导出空白文件

- **文件:行号**：`src/components/workspace/ExportDialog.tsx:75-80`（仅拦截 `selected.size === 0`）；`src/app/api/projects/[id]/export/route.ts:45-59`（级联后只要 `allNodes.length > 0` 即放行）；构建器侧通常跳过 `!n.content` 节点。
- **问题**：R2-008 的三层拦截都基于「节点集合是否为空」。但若用户勾选了若干「已建节点但尚无正文」的占位章，级联后 `allNodes.length > 0`，后端返回 200，前端 `proceedExport()` 照常 `window.open` 下载，最终文件近乎空白且无任何提示——用户会以为导出成功。这是 R2-008 覆盖不到的第三类空导出。
- **复现思路**：新建一个项目，写几章大纲但不写正文 → 打开导出 → 选章模式勾选这些空章 → 点导出 → 下载的文件几乎无内容，但全程无 toast 警告。
- **建议**：在 `doExport` 的 `selected.size > 0` 分支，或后端 `?check=1` 预检阶段，统计「将被导出且含正文的节点数」，若有效内容节点为 0 则 `toastWarning("所选章节均无正文内容")` 并中止；或后端对 `allNodes` 过滤 `n.content` 后再判空。

### NEW-UI-5 ｜ P3 —— 世界分类的「中文显示名」存在三套分歧，跨面板不一致

- **文件:行号**：`src/components/workspace/worldPanelData.ts:6-20`（`WORLD_MODULES.label`：地理地图/势力阵营/物品列表/力量体系…）；`src/components/workspace/ChapterEntitiesPanel.tsx:30-37`（地点/势力/物品/世界观/功法/生物/文化/历史）；`src/core/entity-highlighter.ts:291-301`（地点/法术/生灵/货币…）。
- **问题**：同一个 `geography` 分类，在三个面板分别叫「地理地图」「地点」「地点」；`magic_system` 分别叫「力量体系」「世界观」「法术」。作者在不同面板看到同一世界观分类的不同名字，认知上会困惑，也说明分类的「展示名」没有单一来源。
- **复现思路**：分别打开世界书编辑面板、章节实体高亮面板、正文实体高亮，对照同一分类的显示文案差异。
- **建议**：所有展示名统一从 `WORLD_MODULES` 的 `label` 派生；`ChapterEntitiesPanel` 与 `entity-highlighter` 的局部 map 改为 `key → WORLD_MODULES.find(...).label`（必要时补充短名别名，但别名也应收口到常量）。

### NEW-UI-6 ｜ P3 —— 警告 toast 图标芯片 `text-warning` 在 `bg-warning/10` 上对比偏弱（低严重性）

- **文件:行号**：`src/components/ui/toast.tsx:118`（`warning: { ..., text: "text-warning", soft: "bg-warning/10" }`）、`:199`（图标芯片 `className={\`... ${s.soft} ${s.text}\`}`）；`src/app/globals.css:95`（`--nv-warning: oklch(0.74 0.16 85)`，琥珀色）。
- **问题**：需要澄清——**警告 toast 的正文文字并不用 warning 色**，而是 `text-[var(--nv-text-secondary)]`（toast.tsx:206，深色约 7:1，达标）。真正用 warning 色的是左上角的小图标芯片（`text-warning` 落在 `bg-warning/10` 的 10% 琥珀底上）。该芯片是装饰性告警三角图标，非正文；但严格按 WCAG 1.4.11（非文本对比度 ≥3:1）或正文级 4.5:1 来衡量，小芯片前景(amber oklch L≈0.74) 对 10% amber 叠深底的对比可能临界。正文可读性不受影响，故严重性低。
- **复现思路**：触发任意 warning toast（如 R2-008 的空选章）→ 看左上角琥珀图标芯片的清晰程度；或按本报告公式核算 `--nv-warning` 合成色 vs `bg-warning/10` 合成底。
- **建议**：图标芯片可改 `bg-warning/20` 或给图标加深描边，确保非文本对比度 ≥3:1；正文已达标，无需改。

---

## 三、复检员诚实声明

### 3.1 真正做过并确认的（代码层，可复现）

1. **逐文件 Grep + Read 当前源码**，确认四项修复均真实落入磁盘文件，而非仅停留在 git diff 或 changelog 宣称：
   - R2-004 写入端 `localStorage.setItem('pregen-conf-...')` 存在于 page.tsx:1300-1308，读取端存在于 :806，下游消费存在于 :825，键名逐字符一致。
   - R2-008 `toastWarning("未选中任何章节")` 存在于 ExportDialog.tsx:78，且 `toastWarning` 在 toast.tsx:71 真实定义并正确 import；后端级联 `addDesc` 与结构化 400 错误存在于 export/route.ts:45-68。
   - R2-010 深色 `--nv-text-muted` 确为 `#8E8B82`（globals.css:110），浅色 `#696C75`（:281）未被误改。
   - R2-015 LorebookEditDialog 分类下拉确由 `WORLD_MODULES.map` 派生（:113-116），无硬编码分类 `<option>` 残留。

2. **对比度用手写 WCAG 2.1 相对亮度公式逐项核算**（前景 #8E8B82 对 popover/card/bg/surface-2/surface-3 的相对亮度与对比度），并额外用 Node 脚本独立复算，两者吻合：popover 4.86、card 4.83、bg 5.39、surface-2 4.72、surface-3 4.25。计算过程与结论已在第一节完整展示。

3. **读写闭环逻辑推演**：R2-004 的写入形状 `{selected, newChars}`、读取期望字段、下游请求体字段三者对齐，类型注解一致；R2-008 的前端守卫 + 后端级联 + 后端 400 + 前端正则四层关系已逐行梳理。

### 3.2 未经实测、明确标注待验证的项（绝不伪装已验证）

1. **浏览器实际渲染对比度**：本报告对比度数值基于「半透明表面按 alpha 合成到 `--background` 之上」的数学模型。真实浏览器对 `rgba(...)` 表面的合成可能叠加父级多层背景、`backdrop-filter` 玻璃模糊、抗锯齿等，最终像素对比度可能与本模型有微小出入（通常同向、幅度很小）。因此「实际肉眼是否清晰」属待验证，需本地 `npm run dev` 目测；但数学层面 surface-3 仅 4.25:1 已低于阈值，结论稳健。

2. **toast 实际弹出**：R2-008 的 `toastWarning` 触发逻辑与文案已确认接线，但「点击导出按钮后 toast 是否真的在右下角滑入、文字可读、自动消失」属纯运行时视觉，本沙箱无 Chromium，未做目测，标注待验证。

3. **localStorage 跨会话真实落盘**：R2-004 的读写键、形状、消费链路已逻辑闭环，但「用户在单章确认后刷新页面再发起批量生成，角色约束是否真被带入」属运行时行为，未做真实浏览器实测，标注待验证。隐私模式等异常分支已有 `try/catch` 静默降级，逻辑上安全。

4. **NEW-UI-4 的空白导出边缘**：该路径基于代码静态分析推断（级联后非空 → 200 → 下载；构建器跳过空正文节点），未做真实导出运行验证，但逻辑推导成立，列为待运行时复验的中等严重度缺陷。

### 3.3 总体判定

- R2-004：**生效**（读写闭环、键一致、下游消费，逻辑可确认；运行时落盘待验证）。
- R2-008：**生效**（前端守卫 + 后端级联 + 后端结构化错误三层拦截主场景；仅「选空正文章」边缘残留，见 NEW-UI-4）。
- R2-010：**生效（声明范围）**（popover/card/bg/surface-2 均 ≥4.5；surface-3 仍 4.25 属 UI-002 残留，未被本项覆盖，见 NEW-UI-1）。
- R2-015：**生效（LorebookEditDialog 范畴）**（分类下拉完全派生）；但「15 类全局单一来源」在 tool-registry / 类型定义 / 展示名三处有残余，见 NEW-UI-2 / NEW-UI-3 / NEW-UI-5。

本轮复检发现的新坑合计 **6 条**（NEW-UI-1 ~ NEW-UI-6），其中 P1 两条（surface-3 muted 仍不达标、tool-registry 四份硬编码 enum）、P2 一条（空正文章静默空白导出）、P3 三条（depth 下拉未复用常量、分类展示名三套分歧、warning 图标芯片对比偏弱）。所有行号、对比度比值、读写键名均可由上述 Grep/Read 路径与公式独立复现，欢迎后续轮次据此做回归核对。

> 落盘完成。本报告基于真实代码阅读、WCAG 公式手算 + Node 脚本复算、读写闭环推演，未编造任何现象、行号或比值；对依赖浏览器/运行时的项已如实标注待验证。
