# 魔王系统 Round-3 复检循环 · 监控/UI 双透镜独立复检（recheck-1）

- **复检员**：独立代码复检员（monitor + ui 双透镜，隶属魔王系统 Round-3）
- **复检对象**：Round-3 修复 E「监控 R2-012 退化（fix-monitor-r2-012）」、修复 F「UI surface-3 对比度（fix-ui-surface3-aa）」
- **项目根**：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- **方法**：Trust but verify —— 逐文件 Grep + Read 改后源码/CSS，确认改动真实落地；对比度用手写 WCAG 2.1 相对亮度公式复算，并用 Node 脚本独立核算双向校验；对依赖浏览器/运行时才能确认的项明确标注「未经实测，待验证」。
- **诚实边界**：对比度数值为数学合成计算（半透明表面按 alpha 合成到 background 之上），未包含真实浏览器 `backdrop-filter`、抗锯齿、父级多层叠加带来的像素偏差；真实长/多卷项目生成质量、浏览器目测清晰度均标注「未经实测，待验证」。
- **报告日期**：2026-08-07

---

## 一、两条修复逐条验证结论

### 1. 修复 E（监控 R2-012 退化）：结论 —— 生效（改动真实落地，多卷/多节前文截断逻辑已闭环）

**验证路径与证据（逐行 Grep + Read `src/core/pipeline/context-loader.ts` 全文 258 行）：**

1. **原 R2-012 退化根因（来自 round-2 recheck-1/lens-monitor.md 新坑 1）**：`keepWindow` 以「整体节点序号」度量（`curIdx - keepWindow`），而下游 `extractPrevContext`（`outline-context.ts:143-146`）以「章/节数组序号」度量（取 `prevCount=5` 的前 5 章）。项目穿插 `volume/section/scene` 等非章节点时，「前 5 章」的整体序号跨度 > 5，导致 `extractPrevContext` 注入的前文被截断（部分章正文缺失退化为「无」）。

2. **当前 context-loader.ts 的修复真实落地**（已 Read 全文，关键区间 99-214 行）：
   - 行 116-117：`keepChapters`/`keepWindow` 定义保留（≥ max(4,5)=5），兼容 write/refine/continue 的整体序号窗口（A）。
   - 行 119-125：构建 `chapterNodes = allLight.filter(n => CHAPTER_SECTION.has(n.type))`（CHAPTER_SECTION = {chapter, section}），与 `extractPrevContext` 的过滤口径**逐字符一致**；`curChIdx = chapterNodes.findIndex(id===nodeId)` 以章/节数组序号定位。
   - 行 127-147：构建 `parentOf`/`nodeById` 映射与 `findVolumeId`（沿 parentId 向上回溯到 `type==="volume"` 的祖先），并预计算 `chVolumeIds`（每个章/节节点所属卷 id），为多卷感知做准备。
   - 行 149-156：**窗口（A）整体序号窗口**保留，覆盖 write/refine/continue。
   - 行 158-198：**窗口（B）章/节序号窗口 + 多卷感知**。默认 `windowStart = max(0, curChIdx - keepWindow)` 与 `extractPrevContext` 的 prevCount=5 对齐；当存在所属卷时，下限下探到「当前卷在章/节数组起始下标」（`chVolumeIds.indexOf(curVolumeId)`），并向上包含「上一卷尾部衔接章」（`TAIL_BRIDGING=3`，行 182-184）；最后以 `MAX_CHAPTER_WINDOW=60`（行 190-193）约束跨度，保留 R2-012 性能收益。
   - 行 200-214：两窗口取并集（`prevIds` 为 Set），仅对并集节点执行一次 `findMany`（显式 `orderBy: { order: "asc" }`，行 205），再以 `allLight.map(n => full ?? n)` 按 id 回填到按 order 升序的骨架列表，**绝不重排**，下游 `n.order` 与章序号严格 1:1 对应。

3. **prev-5 覆盖的鲁棒性证明（核心验证点）**：`extractPrevContext` 的两个真实调用点均使用默认 `prevCount=5`（`chapter-outline/route.ts:48`、`chapter-outline/draw/route.ts:43`，Grep 确认无调用方传入更大 prevCount）。窗口（B）的默认下限 `windowStart = max(0, curChIdx - keepWindow)`，由于 `keepWindow ≥ 5`，恒有 `windowStart ≤ curChIdx - 5`。而 `extractPrevContext` 需要的 prev 5 = `chapters.slice(curChIdx-5, curChIdx)`，其下标区间 `[curChIdx-5, curChIdx-1]` 完全落在 `[windowStart, curChIdx-1]` 之内。**因此无论卷/节如何穿插、当前卷是否很短、是否存在上一个卷，prev 5 章必然落在窗口（B）内**——原 R2-012 退化（章序号窗口超出整体序号窗口）被结构性消除，而非仅靠「恰好够用」的巧合。多卷感知的「上一卷尾部衔接章」扩展是**叠加**的额外上下文，不影响 prev 5 的确定性覆盖。我对「当前卷只有 2 章、上一卷有 100 章」等极端形状做了手推：默认 keepWindow 项已保证 `windowStart = curChIdx-keepWindow ≤ curChIdx-5`，prev 5 仍全部命中，逻辑自洽。

4. **类型检查**：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 退出码 0，零错误（与 fix-monitor-r2-012.md 声称一致，纯本地复跑确认）。

5. **下游消费侧未改动**：`extractPrevContext`、`write/refine/continue` 路由、`post-processor` 均原样保留；修复仅替换 context-loader 内部窗口计算与合并逻辑，write/refine/continue 的紧邻前文上下文（落在 keepWindow≥5 内）保持无回归。

**结论**：修复 E 真实落地、逻辑闭环、prev-5 覆盖在数学上对所有卷形状鲁棒，原 R2-012 退化（多卷/多节前文截断 + 章序号错位）已消除。**判定：生效。**

---

### 2. 修复 F（UI surface-3 对比度）：结论 —— 生效（深色主题），但浅色/苍青主题存在覆盖缺口（P1 新坑，见第二节 UI-NEW-1）

**验证路径与证据（Grep + Read `src/app/globals.css` 与组件调用点）：**

1. **令牌定义真实落地（三套主题均已定义）**：
   - 深色 `:root`（`globals.css:111`）：`--nv-text-muted-on-surface-3: #96948B;`（注释明确写「surface-3 上约 4.77:1，达 WCAG AA，且仍低于 tertiary 保层级」）。
   - 浅色 `.light`（`globals.css:283`）：`--nv-text-muted-on-surface-3: #696C75;`（复用浅色 muted）。
   - 苍青 `html.azure`（`globals.css:1194`）：`--nv-text-muted-on-surface-3: #6A807C;`（复用苍青 muted）。
   - Grep `nv-text-muted-on-surface-3` 全量命中：globals.css 3 处定义 + 组件 8 处调用，与 fix-ui-surface3-aa.md 声称的「3 处令牌 + 8 处组合」完全吻合，确认非虚假落地。

2. **8 处 muted-on-surface-3 调用点全部改用新令牌（Grep 确认）**：
   - `MonitorPanel.tsx:224`（日期标签）、`:282`（节奏方块未达标态）、`:285`（星期标签）；
   - `AIChatHeader.tsx:64`（只读徽标）；
   - `MemoryDecayDialog.tsx:120/126/142/158/162/166`（6 处摘要/进度/结果标签）；
   - `dissect/new/page.tsx:149`（取消按钮）。
   - 同文件内其他 `text-[var(--nv-text-muted)]`（如 MonitorPanel :249、MemoryDecayDialog 标题等落在默认/纯底上的文字）按「最不打扰其他 surface」原则未改动，符合修复设计。

3. **对比度手算过程（WCAG 2.1 相对亮度公式，深色主题）**：
   - 通道线性化：`c ≤ 0.03928` 时 `c/12.92`，否则 `((c+0.055)/1.055)^2.4`；相对亮度 `L = 0.2126·R + 0.7152·G + 0.0722·B`；对比度 `CR = (L_亮+0.05)/(L_暗+0.05)`。
   - **surface-3 合成实色**：`rgba(255,255,255,0.09)` 以 alpha 合成到 `--background` `#0E1424`(14,20,36)：`R=round(255·0.09+14·0.91)=round(22.95+12.74)=36`，`G=round(22.95+18.20)=41`，`B=round(22.95+32.76)=56` → **`#242938`**，`L_bg = 0.02246`。
   - **修复前 muted `#8E8B82`**(142,139,130)：线性后 `R=0.27075, G=0.25811, B=0.22331`，`L_fg = 0.2126·0.27075 + 0.7152·0.25811 + 0.0722·0.22331 = 0.25828`；`CR = (0.25828+0.05)/(0.02246+0.05) = 0.30828/0.07246 = 4.254`（< 4.5，原未达标 ✓）。
   - **修复后 muted-on-surface-3 `#96948B`**(150,148,139)：线性后 `R=0.29530, G=0.28870, B=0.25985`（估算），`L_fg ≈ 0.29528`；`CR = (0.29528+0.05)/0.07246 = 0.34528/0.07246 = 4.765`（≥ 4.5 ✓）。
   - **对照 tertiary `#98968C`**(152,150,140)：`L_fg ≈ 0.30382`，`CR = 4.883`（> 4.765，证明四级层级 primary>secondary>tertiary>muted-on-surface-3 保持完整 ✓）。

4. **Node 脚本独立复算（双向校验，实跑）**：
   ```
   node -e '...WCAG 公式...'
   输出：
     surface-3 composite: [36, 41, 56]
     old muted  L 0.25828  CR 4.254
     new muted  L 0.29528  CR 4.765
     tertiary   L 0.30382  CR 4.883
   ```
   手算与脚本逐项吻合，证明深色主题 surface-3 上 muted 对比度由 **4.254 提升至 4.765**，达 WCAG AA，且新值仍低于同表面的 tertiary（层级未压）。

5. **残留组合复核**：Grep 形如「同元素 `bg-[var(--nv-surface-3)]` + `text-[var(--nv-text-muted)]`（满 alpha，非 `/NN` 减弱）」的组合，命中者均已是改用新令牌的 8 处（MonitorPanel:282、AIChatHeader:64、dissect/new:149），其余未迁移的 surface-3+muted 同元素组合均为 `/10`、`/30`、`/50` 等减弱 alpha（合成背景更暗，muted 对比度更高，已核算 ≥4.5），确认满 alpha 的 surface-3+muted 漏网为 0。

**结论**：修复 F 在**深色主题**真实生效，surface-3 上 muted 对比度 4.765 ≥ 4.5，达 AA，且与 tertiary 层级关系完好。**判定：深色主题生效；浅色/苍青主题存在覆盖缺口（见 UI-NEW-1）。**

---

## 二、新坑清单（round-3 改动引入或遗留的新缺陷）

### MONITOR-NEW-1 ｜ P3（耦合性/可维护性）：多卷衔接尾章数 `TAIL_BRIDGING=3` 与 `extractPrevContext` 的 `prevCount=5` 未对齐、硬编码

- **文件:行号**：`src/core/pipeline/context-loader.ts:182`（`const TAIL_BRIDGING = 3;`），对照 `outline-context.ts:141`（`prevCount = 5`）。
- **问题**：多卷感知的「上一卷尾部衔接章」数量被硬编码为 3，而 `extractPrevContext` 实际向前取 5 章。虽然如前所述，窗口（B）默认的 `keepWindow≥5` 已确定性覆盖 prev 5（不会截断），但「跨卷衔接上下文」的设计意图是让卷过渡更平滑——当前硬编码 3 意味着当当前卷极短（< 3 章）且需要从上卷借更多上下文时，衔接窗口只补 3 章而非与 prevCount 联动的 5 章。这不是正确性缺陷（prev 5 仍由 keepWindow 兜底），而是**魔法数字与下游常量脱钩**的耦合脆弱点：一旦将来 `extractPrevContext` 的 `prevCount` 被调大（例如改 7），或新增 `prevCount` 入参的调用方，衔接尾章数不会自动跟随，可能在「当前卷短 + 需要更多跨卷前文」场景重新出现上下文偏薄。
- **影响范围**：仅影响「跨卷衔接平滑度」，不影响 prev 5 的正确性；属低危但应在下一轮收敛。
- **复现思路**：把 `extractPrevContext` 的 `prevCount` 改为 8 并构造「当前卷 2 章、上卷 100 章」项目，观察当前章前文是否仅含上卷最后 3 章而非应有的更多跨卷承接。
- **建议**：将 `TAIL_BRIDGING` 改为 `Math.max(prevCount, 3)` 或从 `extractPrevContext` 导出常量引用，消除魔法数字耦合。

### MONITOR-NEW-2 ｜ P3（已知残留，round-3 已声明）：`scene` 节点穿插时 `continue` 路由的「最近 5 个有正文节点」仍可能少取

- **文件:行号**：`src/core/pipeline/context-loader.ts:151-156`（窗口 A 仅以整体序号度量，含 scene）；对照 `continue/route.ts` 的 `allNodes.filter(n => n.order <= cur.order && n.content).slice(-5)`。
- **问题**：round-3 修复把「章/节窗口」对齐到了 `extractPrevContext`，但 `continue` 路由依赖的是「整体节点中最近 5 个有正文的节点」（可能是 scene）。当 scene 节点密集穿插且超出窗口 A 的整体序号跨度时，部分带正文的 scene 仍可能落在窗口外。该边界已在 fix-monitor-r2-012.md 诚实声明第 5 段明确披露（「若项目在章/节之间穿插带正文的 scene 节点……极端情况下 continue 的 filter(n.content).slice(-5) 仍可能少取」），属 round-3 **已声明但未处理**的残留，非本轮新引入，特此归并记录，便于后续轮次跟进（建议将 scene 纳入章/节窗口口径）。本复检不重复计入「新引入缺陷」，仅作透明登记。

### UI-NEW-1 ｜ P1（覆盖缺口）：浅色/苍青主题的 surface-3 上 muted 仍低于 WCAG AA，round-3 未核算、未修复

- **文件:行号**：`src/app/globals.css:283`（浅色 `--nv-text-muted-on-surface-3: #696C75`）、`:1194`（苍青 `#6A807C`），对照 `:259`（浅色 `--nv-surface-3: rgba(15,18,30,0.08)`）、`:1170`（苍青 `--nv-surface-3: rgba(190,230,235,0.08)`）；深色对照 `:85`/`#96948B`（已由 round-3 修复达标）。
- **问题**：round-3 为「保证令牌在任意主题下均有定义，不会回退到 inherit」，在浅色/苍青主题直接**复用各自原有 muted 值**（#696C75 / #6A807C）作为 surface-3 变体，**但未重新核算这些复用值在其各自 surface-3 合成背景上的对比度**。两个主题的 `--nv-surface-3` 与深色不同——浅色是「深色微染叠在近白底」、苍青是「青色微染叠在近黑底」——而复用值并未针对这两种合成背景调亮/调暗。本复检用 Node 脚本（与第四节同公式）独立核算：
  - **浅色主题**：surface-3 合成实色 `rgba(15,18,30,0.08)` 叠到 `#F3EFE8`(243,239,232) → `#E1DDD8`(225,221,216)；`#696C75`(105,108,117) 对 `#E1DDD8` 的 `CR = 3.881`（< 4.5，未达 AA）。
  - **苍青主题**：surface-3 合成实色 `rgba(190,230,235,0.08)` 叠到 `#04090C`(4,9,12) → `#131B1E`(19,27,30)；`#6A807C`(106,128,124) 对 `#131B1E` 的 `CR = 4.149`（< 4.5，未达 AA）。
  - 对比：深色主题已修到 4.765（达标），但**浅色 3.881、苍青 4.149 双双低于阈值**。这意味着原本 round-2 复检 NEW-UI-1（surface-3 上 muted 未达 AA）只在深色主题被清零，在浅色/苍青主题**原样残留**——而且 round-3 新增的令牌制造了「已修复」的错觉（三套主题都定义了同名令牌），极易让后续维护者误以为全局已达标。
- **影响范围**：使用浅色/苍青主题的用户，在监测面板节奏标签、MemoryDecayDialog、AIChatHeader 只读徽标等 surface-3 容器上的 muted 文字仍偏糊（与深色修复前同源的可用性缺陷）。这三个主题是真实可选主题（`.light` / `html.azure` 在 globals.css 中独立定义），影响面非理论。
- **复现思路**：切换浅色主题 → 打开工作区监测面板 → 看「写作节奏」日期/星期小标签（落在 surface-3 方块上）清晰度；或以本报告公式核算 muted(#696C75) vs 浅色 surface-3 合成色(#E1DDD8) = 3.88:1；苍青同理。
- **建议**：对浅色/苍青主题分别计算各自的 surface-3 合成对比度并单独调校 muted-on-surface-3 值（浅色需更深的灰、苍青需更亮的青灰），使三套主题各自 ≥4.5；或把「muted 在各 surface 上的合成对比度」纳入 `scripts/lint-colors.mjs` 做 CI 断言，防止再回归（round-3 已将此列为后续建议但未实施）。

### UI-NEW-2 ｜ P3（相邻预存在缺陷，与 round-3 同源体系）：`--nv-surface-4` 令牌被引用但未定义

- **文件:行号**：`src/components/workspace/ForeshadowingPanel.tsx:381`（`hover:bg-[var(--nv-surface-4)]`），对照 `src/app/globals.css`（Grep `--nv-surface-4:` 全量无匹配）。
- **问题**：组件引用了 `--nv-surface-4`，但 globals.css 三套主题均未定义该令牌。按 CSS 自定义属性语义，未定义的变量引用会使该 background 声明失效（回退到 `initial`/继承或无效值），hover 态浮起面无预期视觉反馈。此缺陷**非 round-3 引入**（surface-4 引用早于本轮），但属于与 surface-3 修复同源的「表面令牌体系不完整」问题，且 round-3 在扩充 surface-3 变体令牌时未顺手补全 surface-4，故并列记录，建议在下一轮一并清理（要么定义 surface-4，要么改为 surface-3）。严重性低（仅 hover 微反馈缺失）。

### UI-NEW-3 ｜ P3（回归防护缺口）：surface-3 对比度达标无 CI 断言，跨层嵌套 muted 未被穷举

- **文件:行号**：`src/app/globals.css`（令牌）、`scripts/lint-colors.mjs`（CI 颜色断言，round-3 未改动）、各 surface-3 容器组件。
- **问题**：round-3 修复仅靠「人工 Grep 同元素 `bg-surface-3`+`text-muted` 组合」定位 8 处并手工迁移，且 fix-ui-surface3-aa.md 诚实声明已承认「若存在跨多层的间接嵌套（父为 surface-3、孙为 muted 且中间隔其他元素），无法被本次静态 Grep 完全穷举」。当前没有任何 CI 断言把「muted 在 surface-1/2/3 上的合成对比度」固化，因此：① 未来新增的 surface-3 容器若内嵌 muted 文字，会在无告警情况下重新跌破 AA；② 浅色/苍青的 UI-NEW-1 缺口也不会被任何自动化检查捕捉。这是 round-3 修复「治标未治本」的结构性盲区。
- **复现思路**：在任一 surface-3 容器内新增一个 `text-[var(--nv-text-muted)]` 的深层子节点（父 surface-3、中间隔一层 div），重跑现有 lint/测试，预期无任何对比度告警。
- **建议**：在 `scripts/lint-colors.mjs` 中增加「各文字令牌 × 各 surface 令牌的合成对比度 ≥4.5（正文级）/≥3（非文本级）」断言，覆盖三套主题；并将 surface-3 变体令牌的引入一并纳入，使后续 surface-3+muted 组合自动被校验。

---

## 三、复检员诚实声明

### 3.1 真正做过并确认的（代码层 + 数学层，可复现）

1. **逐文件 Grep + Read 改后源码/CSS**：
   - 修复 E：`context-loader.ts` 全文 258 行已 Read。窗口（A）整体序号窗口（行 151-156）、窗口（B）章/节序号窗口 + 多卷感知（行 158-198）、并集补拉与按 id 回填（行 200-214）均真实存在；`CHAPTER_SECTION`/`findVolumeId`/`chVolumeIds` 与 `extractPrevContext` 的过滤口径（`outline-context.ts:143`，`type===chapter||section`）逐字符一致。
   - 修复 F：globals.css 三处令牌定义（行 111/283/1194）与 8 处组件调用点（MonitorPanel/AIChatHeader/MemoryDecayDialog/dissect-new）均经 Grep 命中确认，与 fix-ui-surface3-aa.md 声称一一对应，非仅停留在 diff 宣称。
2. **对比度手算 + Node 脚本双向核算**：深色 surface-3 合成 `#242938`，muted 旧值 4.254、新值 4.765、tertiary 4.883，手算与脚本逐项吻合；并额外核算 surface-1(5.039)/surface-2(4.718) 的 muted 均 ≥4.5（深色其他面无缺口），以及浅色(3.881)/苍青(4.149) 的 muted-on-surface-3 均 <4.5（UI-NEW-1）。全部过程公开、可由上述公式与脚本独立复现。
3. **prev-5 覆盖的鲁棒性证明**：通过 `prevCount` 恒为默认 5、`keepWindow≥5` ⇒ `windowStart ≤ curChIdx-5` 的代数推导，确认无论卷/节如何穿插、当前卷长短、是否有上一卷，extractPrevContext 需要的 prev 5 必然落在窗口（B）内；并对「当前卷 2 章 + 上卷 100 章」形状做了手推验证，逻辑自洽。
4. **类型检查实跑**：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 退出码 0，零错误（与两份修复报告声称一致）。

### 3.2 未经实测、明确标注待验证的项（绝不伪装已验证）

1. **真实长/多卷项目生成质量**：修复 E 消除了截断逻辑，但「数百章、每章数 KB 正文」的多卷项目端到端「前文衔接」生成质量提升、以及「省 10-20MB 内存」性能收益，依赖真实长项目数据集与真机 chapter-outline / write 路由跑测才能量化。本轮沙箱无此类数据集，**标注未经实测，待验证**。
2. **浏览器实际渲染对比度**：本报告所有对比度数值基于「半透明表面按 alpha 合成到 background 之上」的数学模型，未包含真实浏览器 `backdrop-filter` 玻璃模糊、抗锯齿、父级多层背景叠加带来的微小像素偏差。深色 4.765 较 4.5 阈值有约 0.27 余量、结论稳健；但**真实肉眼清晰度与浅色/苍青的实际观感均标注未经实测，待验证**（本沙箱无 Chromium）。
3. **MONITOR-NEW-1 的耦合后果**：TAIL_BRIDGING 与 prevCount 脱钩属可维护性隐患，仅在「prevCount 被调大」假设下才会显现，未做实际改 prevCount 的跑测，但属确定性代码事实（魔法数字 3 与 5 不一致）。
4. **surface-4 未定义的实际渲染影响（UI-NEW-2）**：未做浏览器实测确认 hover 失效的具体观感，但「引用未定义 CSS 变量」属确定性代码事实。

### 3.3 总体判定

- **修复 E（监控 R2-012 退化）**：**生效**。双窗口 + 多卷感知逻辑真实落地，prev-5 覆盖对所有卷形状鲁棒，原截断/错位退化已消除；遗留仅 MONITOR-NEW-1（耦合性，低危）与 MONITOR-NEW-2（scene 边界，round-3 已声明）。
- **修复 F（UI surface-3 对比度）**：**深色主题生效**（4.765 ≥ 4.5，层级完好）；**浅色/苍青主题存在覆盖缺口（UI-NEW-1，P1）**——复用值未重算，分别为 3.881 / 4.149，低于 AA，且新增令牌制造「已全局修复」错觉；另有 UI-NEW-2（surface-4 未定义，P3，预存在）与 UI-NEW-3（无 CI 断言，P3）。
- 本轮复检共记录真实新缺陷/残留 **5 条**（MONITOR-NEW-1、MONITOR-NEW-2、UI-NEW-1、UI-NEW-2、UI-NEW-3），其中 P1 一条（浅色/苍青 surface-3 muted 仍不达标）、P3 四条。所有行号、对比度比值、过滤口径均可由上述 Grep/Read 路径与公式独立复现，欢迎后续轮次据此做回归核对。

> 落盘完成。本报告基于真实代码阅读、WCAG 公式手算 + Node 脚本复算、prev-5 覆盖代数推导、tsc 零错误验证，未编造任何现象、行号或比值；对依赖浏览器/运行时的项已如实标注待验证。
