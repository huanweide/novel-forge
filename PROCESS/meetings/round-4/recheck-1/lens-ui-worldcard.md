# 魔王系统 Round-4 复检循环 · UI 浅色/苍青 surface-3 + 世界卡 catLabel 独立复检（recheck-1）

- 复检员：独立代码复检员（魔王系统 Round-4 复检循环 · lens-ui + lens-worldcard）
- 复检日期：2026-08-07
- 项目根：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- 复检对象：
  - Round-4 修复一 `fix-ui-surface3-all-themes.md`（UI-NEW-1：浅色/苍青主题 surface-3 上 muted 未达 WCAG AA）
  - Round-4 修复二 `fix-worldcard-catlabel.md`（复检新坑 2 / 原 PIT-2：catLabel 手抄漂移根因消除）
- 方法：Trust but verify。所有结论均来自对当前文件的 Grep + Read 实读，以及 `npx vitest run` 实跑产物与 WCAG 2.1 相对亮度公式手算 + Node 脚本复算，而非仅凭修复报告自述。未能端到端实测的项明确标注「未经实测，待验证」。
- 一句话：两条修复均真实落地、三主题 surface-3 上 muted 对比度全部 ≥4.5、catLabel 已派生同源、测试 11 passed（7+4）；但复检在 `src/core/assembly/engine.ts` 挖到一处性质相同、范围更大的「第二份手抄世界卡标签映射」（11/15 覆盖、4 类漏网塌缩到 custom、标签与 emoji 多方分歧），属 Round-4 未触及的同源新缺陷（P1），另发现浅色 tertiary-on-surface-3 仍 <AA 且被 muted 反超的层级隐患、surface-4 仍未定义等残留。

---

## 一、两条修复逐条验证结论

### 1. 修复一「UI 浅色/苍青 surface-3 上 muted 未达 AA」—— 结论：生效（三主题全部达标，非纸面）

**验证路径与证据（逐行 Grep + Read `src/app/globals.css`）：**

1. 令牌定义真实落地，三主题均已定义且取值与修复报告一致：
   - 深色 `:root`（`globals.css:111`）：`--nv-text-muted-on-surface-3: #96948B;`（Round-3 已修，**本轮未动**，报告声称一致 ✓）。
   - 浅色 `.light`（`globals.css:283`）：`--nv-text-muted-on-surface-3: #5A5D67;`（由 `#696C75` 改为 `#5A5D67` ✓，行内注释明确标注「Round-4 补修」）。
   - 苍青 `html.azure`（`globals.css:1194`）：`--nv-text-muted-on-surface-3: #708885;`（由 `#6A807C` 改为 `#708885` ✓，行内注释标注「Round-4 补修」）。
   - Grep `--nv-text-muted-on-surface-3` 全量仅命中 globals.css 三处，与「3 处令牌」完全吻合，非虚假落地。

2. surface-3 合成背景定义（`globals.css:85 / 259 / 1170`）与修复报告一一对应：
   - 深色 `--nv-surface-3: rgba(255,255,255,0.09)`；浅色 `rgba(15,18,30,0.08)`；苍青 `rgba(190,230,235,0.08)`。

3. 组件调用点：8 处 `text-[var(--nv-text-muted-on-surface-3)]`（MonitorPanel / AIChatHeader / MemoryDecayDialog / dissect-new）在 Round-3 已迁移完毕，本轮仅改令牌值即全主题生效，符合修复设计（未做新增组件改动）。

4. **对比度手算（WCAG 2.1 相对亮度公式）—— 三主题 surface-3 合成背景 + 修复后 muted 前景，全部手算 + Node 脚本双向核算：**

   公式约定：通道 `c ≤ 0.03928` 时线性化 `c/12.92`，否则 `((c+0.055)/1.055)^2.4`；相对亮度 `L = 0.2126·R + 0.7152·G + 0.0722·B`；对比度 `CR = (L_亮 + 0.05) / (L_暗 + 0.05)`。

   - **深色主题**：surface-3 合成 `rgba(255,255,255,0.09)` 叠到 `#0E1424`(14,20,36) → 合成实色 `#242938`(36,41,56)，`L_bg = 0.02246`；muted 前景 `#96948B`(150,148,139)，`L_fg = 0.29528`；`CR = (0.29528+0.05)/(0.02246+0.05) = 0.34528/0.07246 = 4.765`（≥4.5 ✓）。
   - **浅色主题**：surface-3 合成 `rgba(15,18,30,0.08)` 叠到 `#F3EFE8`(243,239,232) → 合成实色 `#E1DDD8`(225,221,216)，`L_bg = 0.72678`；muted 前景 `#5A5D67`(90,93,103)，`L_fg` 手算：`R=90/255=0.3529→lin≈0.1022`，`G=93/255=0.3647→lin≈0.1094`，`B=103/255=0.4039→lin≈0.1357`，`L_fg = 0.2126·0.1022 + 0.7152·0.1094 + 0.0722·0.1357 = 0.1098`；`CR = (0.72678+0.05)/(0.1098+0.05) = 0.77678/0.1598 = 4.862 ≈ 4.860`（≥4.5 ✓）。
   - **苍青主题**：surface-3 合成 `rgba(190,230,235,0.08)` 叠到 `#04090C`(4,9,12) → 合成实色 `#131B1E`(19,27,30)，`L_bg = 0.01016`；muted 前景 `#708885`(112,136,133)，`L_fg` 手算：`R=112/255=0.4392→lin≈0.1621`，`G=136/255=0.5333→lin≈0.2462`，`B=133/255=0.5216→lin≈0.2348`，`L_fg = 0.2126·0.1621 + 0.7152·0.2462 + 0.0722·0.2348 = 0.2275`；`CR = (0.2275+0.05)/(0.01016+0.05) = 0.2775/0.06016 = 4.613 ≈ 4.612`（≥4.5 ✓）。

   Node 脚本（`node -e` 实跑）输出与手算逐项吻合：深色 4.765、浅色 4.860、苍青 4.612，三主题 surface-3 上 muted 均达 WCAG AA（正文级 ≥4.5）。

5. **层级复核（与修复报告交叉验证）**：苍青 tertiary `#7C918D` 在 surface-3 合成色上 `CR = 5.229`，高于 muted `4.612`，muted<tertiary 层级保持 ✓；深色 tertiary `#98968C` `CR = 4.883` > muted `4.765` ✓。详见第二节新坑清单中对浅色 tertiary 的反向观察。

**结论**：修复一真实落地、三主题 surface-3 上 muted 对比度全绿（4.765 / 4.860 / 4.612），深/浅/苍青三套主题不再存在「已全局修复」的错觉。**判定：生效。**

### 2. 修复二「世界卡 catLabel 手抄漂移根因消除」—— 结论：生效（派生同源，编译期约束）

**验证路径与证据（Grep + Read `src/lib/world-category-classifier.ts` 与 `src/core/sync-global-prompt.ts`）：**

1. 权威常量真实新增（`world-category-classifier.ts:44-64`）：`export const WORLD_CATEGORY_LABELS: Record<WorldCategory, string>`，键集与 `ALL_WORLD_CATEGORIES`（同文件 :38-42，15 类）逐字符一致，标签文本沿用原 catLabel 中文标题（含图标前缀）。关键点：类型为 `Record<WorldCategory, string>`，**精确键入**——若 `WorldCategory` 增删/改名一员而映射漏改，tsc 直接编译失败；映射出现多余 key 同样报错。这是把「catOrder 与 catLabel 同步」从人工约定升级为编译期约束。

2. 派生真实落地（`sync-global-prompt.ts`）：
   - 第 11 行 import 已扩展为 `import { ALL_WORLD_CATEGORIES, WORLD_CATEGORY_LABELS } from "@/lib/world-category-classifier";` ✓。
   - 第 178-179 行：`const catOrder = ALL_WORLD_CATEGORIES;` 保留；`const catLabel = WORLD_CATEGORY_LABELS;`（原第 174-180 行 15 项手抄 `Record<string,string>` 已整体删除）。Grep `src/core/sync-global-prompt.ts` 中已无 `geography:`/`faction:`/`public_system:` 等手写 label 键值对，仅剩第 179 行派生引用 ✓。
   - 消费处第 185 行 `catLabel[cat] || cat` 不变：`catLabel` 已按 `WorldCategory` 键入，`catOrder` 遍历出的每一项必然有标签，`|| cat` 仅作运行时兜底保留（对合法 cat 永不触发，属防御性兜底）。

3. **测试实跑（与验证铁律一致）：**
   ```
   $ npx vitest run src/core/babylore/entity-sync.test.ts src/lib/world-category-classifier.test.ts

    ✓ src/lib/world-category-classifier.test.ts (7 tests) 6ms
    ✓ src/core/babylore/entity-sync.test.ts (4 tests) 5ms

    Test Files  2 passed (2)
         Tests  11 passed (11)
   ```
   `world-category-classifier.test.ts` 现为 7 个（原 6 个 + 1 个新增「WORLD_CATEGORY_LABELS 与 ALL_WORLD_CATEGORIES 同源」回归用例，断言键集一致、标签非空、无多余 key）；`entity-sync.test.ts` 4 个保持绿色，证明分类器/落库共享同一权威源的前提未破裂。

4. 同源保证：`catOrder` 与 `catLabel` 现在都派生自 `world-category-classifier.ts` 的同一模块、`WorldCategory` 同一类型，分类清单与中文标题永远 1:1，彻底消除 Round-3 复检「新坑 2」指出的最后一处手抄漂移根因（原 PIT-2），并保留 Round-3 的 15 类覆盖成果（未回退）。

**结论**：catLabel 已由手抄硬编码改为从分类器权威常量 `WORLD_CATEGORY_LABELS` 派生，与 `catOrder` 共用同一 `WorldCategory` 类型，编译期强制 1:1 对齐。代码落地 + 测试全绿（11 passed）。**判定：生效。**

---

## 二、新坑清单（Round-4 改动引入或遗留的新缺陷）

以下每条均给出 文件:行号 + 问题本质 + 复现思路。按严重度从高到低。

### NEW-UI-WC-1 ｜ P1（Round-4 未触及的同源新缺陷）：装配引擎 `engine.ts` 内存在「第二份手抄世界卡标签映射」，11/15 覆盖、4 类漏网塌缩到 custom、标签与 emoji 与权威源多方分歧

- **位置**：`src/core/assembly/engine.ts:213-225`（`const CATEGORY_SECTIONS: Record<string, { emoji: string; label: string }>`），对照 `src/lib/world-category-classifier.ts:48-64`（本轮刚建立的权威 `WORLD_CATEGORY_LABELS`）。
- **问题本质**：Round-4 把 `sync-global-prompt.ts` 的 `catLabel` 改为从 `WORLD_CATEGORY_LABELS` 派生，消除了「世界卡中文标题」的一处手抄漂移；但它**只扫了生成侧 precompile 路径**。在另一条生成路径——装配引擎 `buildLoreSection`（engine.ts:227，被 engine.ts:91 在上下文拼装时调用，真正把世界书词条注入到模型上下文里）—— 仍存在一份**完全独立、且未与 `WorldCategory` 联动**的标签映射 `CATEGORY_SECTIONS`。这恰恰是同一类根因（多源漂移）在 Sister 模块的重演，只不过本轮修复的视线只落在 `sync-global-prompt.ts`，漏掉了它。
  具体缺陷有两类，都比单纯「标签不一致」更严重：
  1. **覆盖缺口（漏 4 类）**：`CATEGORY_SECTIONS` 仅列了 11 个 key（geography / faction / item / magic_system / technique / creature / culture / history / law / currency / custom），**缺失 `character_relationship`、`fate_system`、`physics`、`public_system` 共 4 类**。代码逻辑（engine.ts:242）`const key = CATEGORY_SECTIONS[cat] ? cat : "custom";` 对这 4 类直接回退到 `"custom"` 分组；标题生成（engine.ts:249）`CATEGORY_SECTIONS[cat] || CATEGORY_SECTIONS.custom` 也回退到 `【🔮 特殊设定】`。后果：在装配进真实生成上下文的「世界书」章节里，`fate_system`/`physics`/`public_system`/`character_relationship` 这 4 类词条（正是 Round-3 PIT-1 点名补回的 7 类中的 4 类）**不会以自身分组标题出现，而统统被塞进「特殊设定/自定义」分组**，与它们在 `globalPrompt`（sync-global-prompt 路径，已正确分组）里的呈现完全不一致——同一本小说，precompile 的世界书按 15 类分组、实际拼进上下文的世界书却把 4 类塌缩成 1 类，LLM 拿到的是被错误并组、丢失分类边界的世界设定。
  2. **标签/emoji 多方分歧**：即便 11 个共有项，文本与 emoji 也普遍与权威源不一致，例如：
     - geography：`🗺️ 地理环境`（engine）vs `🗺 地理`（classifier）—— emoji 与文案双分歧；
     - faction：`⚔️ 势力阵营` vs `🏛 势力` —— emoji 与文案双分歧；
     - magic_system：`⚡ 力量体系` vs `⚙️ 力量体系` —— emoji 分歧；
     - technique：`📜 功法技能` vs `📘 功法体系` —— emoji 与文案双分歧；
     - history：`📚 历史背景` vs `📜 历史` —— emoji 与文案双分歧；
     - custom：`🔮 特殊设定` vs `📦 自定义` —— emoji 与文案双分歧；
     - creature / culture / law / item 文案也各有一字之差（生物种族 vs 生物、文化风俗 vs 文化、世界法则 vs 规则法则、重要物品 vs 器物）。
     由于 `CATEGORY_SECTIONS` 类型是弱类型 `Record<string,...>`（**不是** `Record<WorldCategory,...>`），`WorldCategory` 增删/改名时 tsc **不会**报错，未来维护者改了分类器却忘了同步 engine.ts，缺陷会静默发生——这与 Round-3 PIT-2「多源漂移、无编译期约束」的系统性根因**完全一致**，只是换了个战场。
- **影响范围**：真实生成上下文的世界书分组错误 + 标题/图标不一致，直接削弱 LLM 对 fate/physics/public_system/character_relationship 四类设定的可检索性。这是 P1 级（与 Round-3 PIT-1/PIT-2 同源、但本轮漏网的真实覆盖缺陷），不是纯 cosmetic。
- **复现思路**：写一条 `category="fate_system"` 的世界卡并启用，触发真实生成上下文装配（或单元调用 `buildLoreSection` 喂入 `category="fate_system"` 的 `TriggeredLore`），观察输出章节标题是否为 `【🔮 特殊设定】` 而非应有的 `【🔮 命运体系】`；再写 `physics`/`public_system`/`character_relationship` 各一条，确认四者均塌缩到同一 custom 分组。对比 `syncGlobalPrompt` 输出的 `globalPrompt`，可见同一批词条在两处世界书章节中分组不一致。
- **修复建议**：将 `engine.ts` 的 `CATEGORY_SECTIONS` 改为从 `WORLD_CATEGORY_LABELS` 派生（拆出 `{emoji, label}` 或统一 emoji 进分类器常量），并把类型收敛为 `Partial<Record<WorldCategory, ...>>` 或直接在分类器里导出「emoji + label」权威结构，让引擎复用；同时补一条单测断言 `CATEGORY_SECTIONS` 的 key 集 ⊆ `ALL_WORLD_CATEGORIES` 且对全部 15 类都有覆盖（消除 4 类漏网）。

### NEW-UI-WC-2 ｜ P2/P3（Round-4 muted-only 修复遗留的同源边界）：浅色主题 tertiary-on-surface-3 仍 <AA，且 muted 反超 tertiary 形成层级倒挂（当前为潜在/语义级，非活跃视觉 bug）

- **位置**：`src/app/globals.css:281`（`--nv-text-tertiary: #6B6E78`，浅色），对照 `:259`（`--nv-surface-3: rgba(15,18,30,0.08)`）；耦合 `--nv-text-muted-on-surface-3: #5A5D67`（`:283`，本轮新值）。
- **问题本质**：Round-4 严格按 recheck 报告「浅色需更深的灰」的指引，**只**调校了 muted-on-surface-3 一个令牌以满足 AA。但同一表面上的 **tertiary** 令牌本轮未动，而浅色 tertiary `#6B6E78` 在 surface-3 合成色 `#E1DDD8` 上的对比度经手算/脚本核算为 **3.765:1（< 4.5 AA）**。这与 Round-3 的 UI-NEW-1 是**同一类根因**——「某文字令牌在某 surface 上的合成对比度未逐一核算」——只不过 UI-NEW-1 暴露的是 muted，本轮又暴露了它的 sibling tertiary。更要紧的是，本轮把 muted 提到 4.860 之后，在 surface-3 这一面上出现了 **muted(4.860) > tertiary(3.765)** 的对比度倒挂：语义上更弱的「muted」文字反而比「tertiary」文字更清晰，破坏了设计体系「primary > secondary > tertiary > muted」的四级亮度顺序。修复报告第五节已诚实披露「浅色 tertiary 在 surface-3 上本就 <AA，无法同时保持 muted<tertiary 又达 AA」，但停留在披露，**没有把 tertiary 也纳入本轮修复**，因此该倒挂被本轮的 muted 提亮**固化**了下来。
- **活跃性说明（诚实）**：修复报告第五节同时指出「实际 UI 中 tertiary 令牌并不用于 surface-3」，故当前不是一眼可见的视觉 bug，属**潜在/语义层级不一致**；但凡未来任何组件在 surface-3 容器上用 `--nv-text-tertiary`（例如某个新加的提示文字），就会立即命中 3.765 这一不达标的对比度，且没有 CI 断言会拦住它。
- **复现思路**：在任一 `bg-[var(--nv-surface-3)]` 容器内新增一处 `text-[var(--nv-text-tertiary)]` 子节点（如 surface-3 卡片里的次级说明），切换浅色主题目测，或以本报告公式核算 tertiary(#6B6E78) vs 浅色 surface-3 合成色(#E1DDD8) = 3.765:1；对照同面 muted(#5A5D67) = 4.860:1，可见倒挂。
- **修复建议**：将浅色 tertiary 也按 surface-3 合成背景单独调校（与 muted 一样给 surface-3 一个变体令牌），或接受「tertiary 在 surface-3 上改用 muted 级亮度」的重新设计；并把「各文字令牌 × 各 surface 令牌的合成对比度」纳入 `scripts/lint-colors.mjs`（见 NEW-UI-WC-4 关联）做 CI 断言，从根上防止 muted/tertiary/secondary 任一在任一 surface 上漏算。

### NEW-UI-WC-3 ｜ P3（预存在、本轮未消除、复检再次确认）：`--nv-surface-4` 令牌被引用但未定义

- **位置**：`src/components/workspace/ForeshadowingPanel.tsx:381`（`hover:bg-[var(--nv-surface-4)]`），对照 `src/app/globals.css`（Grep `--nv-surface-4:` 全量无匹配，三主题均未定义 surface-4）。
- **问题本质**：组件引用了 `--nv-surface-4`，但 globals.css 三套主题均未定义该令牌。按 CSS 自定义属性语义，未定义的变量引用会使该 background 声明失效，hover 态浮起面无预期视觉反馈。此缺陷非 Round-4 引入（surface-4 引用早于本轮），且属于与 surface-3 修复同源的「表面令牌体系不完整」问题；Round-3 复检 UI-NEW-2 已登记，Round-4 在扩充 surface-3 变体令牌时仍未顺手补全 surface-4，故在此**再次确认**其存在，建议下一轮一并清理（要么定义 surface-4，要么改为 surface-3）。
- **复现思路**：悬停 ForeshadowingPanel 相关元素，观察 hover 浮起背景是否无变化（回退到无效/继承值）；或在 devtools 计算该元素 hover 态的 background，确认 `--nv-surface-4` 为未定义导致声明丢弃。
- **修复建议**：在 globals.css 三主题中补 `--nv-surface-4`（取比 surface-3 更深/更亮的浮起层级），或将该处引用降为 `--nv-surface-3`。

### NEW-UI-WC-4 ｜ P3（低置信、关联提示）：`src/core/explore/types.ts` 疑似第三份世界类 emoji 映射，存在额外漂移源

- **位置**：`src/core/explore/types.ts:42-45`（`factions: "🏛️"`、`currency: "💰"`、`map: "🗺️"` 等 emoji 映射），对照权威 `WORLD_CATEGORY_LABELS`。
- **问题本质**：探索/游戏模式里又出现一份以 emoji 字符串硬编码的世界相关分类映射（factions / currency / map 等键名与 `WorldCategory` 体系不完全一致，属 explore 自有维度的图标表）。它不是 `WorldCategory` 的 15 类全集，键名也不同于 classifier（如 `map` 而非 `geography`），但其中 `currency: "💰"`、`factions: "🏛️"` 与 classifier 的 currency/势力 emoji 仍可能随权威源改动而悄悄分歧。这一处**不属本轮范围**（explore 维度 ≠ 世界书分类维度），且与 NEW-UI-WC-1 的 engine.ts 相比键集本就不同，故标为**低置信关联提示**而非确定缺陷：仅提醒维护者，凡是「世界/势力/货币」等语义的 emoji 在代码库里至少已散落三处（classifier、engine.ts、explore/types.ts），任何一处改了文案/图标而其余未跟，都会造成用户在不同界面看到不一致的世界设定图标。建议长期收敛为单一 emoji 权威源。
- **复现思路**：在分类器里改 `currency` 的 emoji，搜全仓 `💰` 出现位置，确认 explore/types.ts 与 engine.ts 不会自动跟随。
- **修复建议**：将 emoji 也并入 `world-category-classifier.ts` 的权威常量（与 label 同处），各 UI/引擎模块统一引用，消除第三处手抄源。

---

## 三、复检员诚实声明

### 3.1 真测（本地实跑，非仅看 diff）

- **CSS 改动落地真实性**：对 `globals.css` 三处 `--nv-text-muted-on-surface-3`（:111 深色未动、:283 浅色改 `#5A5D67`、:1194 苍青改 `#708885`）与三处 `--nv-surface-3`（:85/:259/:1170）做了 Grep + Read 命中，确认取值与修复报告逐字一致，非仅停留在 diff 宣称。
- **catLabel 派生落地真实性**：对 `world-category-classifier.ts:44-64`（WORLD_CATEGORY_LABELS）、`sync-global-prompt.ts:11`（import）与 `:178-179`（catOrder/catLabel 派生）做了逐行 Read + Grep，确认原手抄 15 项映射已删除、派生写法真实存在、类型 `Record<WorldCategory,string>` 精确键入。
- **对比度手算 + Node 脚本双向核算**：三主题 surface-3 合成实色（#242938 / #E1DDD8 / #131B1E）与修复后 muted 前景（#96948B / #5A5D67 / #708885）的对比度，手算与脚本逐项吻合：4.765 / 4.860 / 4.612，均 ≥4.5；并额外核算苍青/浅色/深色 tertiary（5.229 / 3.765 / 4.883）以交叉验证层级关系与浅色 3.765 的残留缺口。全部过程公开、可由上述公式与脚本独立复现。
- **测试实跑**：`npx vitest run src/core/babylore/entity-sync.test.ts src/lib/world-category-classifier.test.ts` → **11 passed (11)**（world-category-classifier 7 个含新增同源回归、entity-sync 4 个），与验证铁律要求一致。
- **新坑挖掘**：对 `src/core/assembly/engine.ts`（NEW-UI-WC-1）、`globals.css` 浅色 tertiary（NEW-UI-WC-2）、`ForeshadowingPanel.tsx:381`（NEW-UI-WC-3）、`explore/types.ts`（NEW-UI-WC-4）做了 Grep + Read 实证，确认 engine.ts 的 `CATEGORY_SECTIONS` 弱类型、11/15 覆盖与标签/emoji 分歧均为当前代码事实。

### 3.2 未经实测、明确标注待验证的项（绝不伪装已验证）

1. **真实浏览器目测对比度**：本报告所有对比度数值基于「半透明 surface 按 alpha 合成到 `--background` 之上」的数学模型，未包含真实浏览器 `backdrop-filter` 玻璃模糊、抗锯齿、父级多层背景叠加带来的微小像素偏差。深色 4.765、浅色 4.860、苍青 4.612 较 4.5 阈值分别有约 0.27 / 0.36 / 0.11 余量（**苍青余量最小，结论稳健但裕度偏紧**），真实肉眼清晰度与浅色 0.11 余量下的边缘清晰度均**标注未经实测，待验证**（本沙箱无 Chromium）。
2. **catLabel 派生后的端到端生成侧注入**：仅通过 tsc 零错误 + 单测全绿 + 静态 Grep 确认「catLabel 已派生、不再手抄、与 catOrder 同源」；未启动 dev server、未写一条世界卡、未真实触发 `syncGlobalPrompt` 并检索回写后的 `project.globalPrompt` 字符串确认中文分组标题实际出现在「世界书」章节。逻辑上标签映射与原手写内容逐字相同（仅搬迁），消费处写法不变，渲染输出应与修复前一致，但端到端链路未经实战触发，**标注未经实测，待验证**。
3. **NEW-UI-WC-1 的端到端影响**：`engine.ts` 的 `CATEGORY_SECTIONS` 4 类塌缩到 custom 已通过静态 Read 确认（键集缺失 + 回退逻辑），但「该塌缩是否真实导致生成质量下降」需拿真实 `fate_system`/`physics` 等词条跑一次 `buildLoreSection` 或真实生成上下文装配才能量化，**标注未经实测，待验证**（复现思路已在第二节给出，建议主 Agent 在 dev server 上确认）。
4. **surface-4 未定义的实际渲染影响（NEW-UI-WC-3）**：未做浏览器实测确认 hover 失效的具体观感，但「引用未定义 CSS 变量」属确定性代码事实。
5. **NEW-UI-WC-2 活跃性**：浅色 tertiary 在 surface-3 上 3.765 <AA 为确定数学事实，但「tertiary 当前是否真被用在 surface-3 容器」经核查报告称未使用，故属潜在/语义层级倒挂，非活跃视觉 bug，已如实标注。

### 3.3 总体判定

- **修复一（UI 浅色/苍青 surface-3 上 muted AA）**：**生效**。三主题 surface-3 上 muted 对比度 4.765 / 4.860 / 4.612 全部 ≥4.5，深/浅/苍青不再有「已全局修复」错觉；苍青 muted<tertiary 层级保持。残留：浅色 tertiary-on-surface-3 仍 3.765 <AA 且被 muted 反超（NEW-UI-WC-2），surface-4 仍未定义（NEW-UI-WC-3）。
- **修复二（世界卡 catLabel 派生同源）**：**生效**。catLabel 已派生自 `WORLD_CATEGORY_LABELS`，与 catOrder 共用 `WorldCategory` 类型，编译期强制 1:1 对齐，原 PIT-2 最后一处手抄漂移根因消除；测试 11 passed。残留：装配引擎 `engine.ts` 内仍存在第二份弱类型、11/15 覆盖的手抄标签映射（NEW-UI-WC-1，P1，Round-4 视线漏掉的同源新缺陷）；explore/types.ts 疑似第三份 emoji 源（NEW-UI-WC-4，低置信）。
- **新坑数量**：共 **4 条**（P1×1：NEW-UI-WC-1 engine.ts 第二份标签映射漏 4 类；P2/P3×1：NEW-UI-WC-2 浅色 tertiary 倒挂；P3×1：NEW-UI-WC-3 surface-4 未定义；P3×1：NEW-UI-WC-4 explore 第三份 emoji 源）。所有行号、对比度比值、标签分歧均可由上述 Grep/Read 路径与公式独立复现，欢迎后续轮次据此做回归核对。

> 落盘完成。本报告基于真实代码阅读（globals.css、world-category-classifier.ts、sync-global-prompt.ts、engine.ts、ForeshadowingPanel.tsx、explore/types.ts）、WCAG 2.1 公式手算 + Node 脚本复算、`npx vitest run` 实跑（11 passed），未编造任何现象、行号或比值；对依赖浏览器/运行时的项已如实标注待验证。
