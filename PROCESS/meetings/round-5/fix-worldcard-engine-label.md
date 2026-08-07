# Round-5 修复报告：装配引擎第二份手抄世界卡标签映射消除（P1 · NEW-UI-WC-1）

修复 Agent：魔王系统 Round-5 独立修复 Agent
修复对象：Round-4 复检 `lens-ui-worldcard.md` 挖掘的 P1「NEW-UI-WC-1」——装配引擎内存在第二份弱类型、11/15 覆盖的手抄世界卡标签映射，导致 fate_system / physics / public_system / character_relationship 共 4 类被塌缩到 custom，与 Round-4 已修的 sync-global-prompt.ts 的 catLabel 形成「多源漂移」残留。
修复日期：2026-08-07
项目根：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`

---

## 一、问题定位（实读确认）

- 文件 `src/core/assembly/engine.ts`（注：任务描述的 `src/core/game/game-engine.ts` 实为 `assembly/engine.ts`，全仓无 `game-engine.ts`，已按实际文件修复）。
- 原第 213-225 行存在 `const CATEGORY_SECTIONS: Record<string, { emoji: string; label: string }>`，手工列出 11 个 key，缺失 `character_relationship`、`fate_system`、`physics`、`public_system` 4 类；类型为弱类型 `Record<string,...>`，与 `WorldCategory` 无编译期联动。
- 消费逻辑（engine.ts:232、239、261、267）：`const key = CATEGORY_SECTIONS[cat] ? cat : "custom"` 与 `const sec = CATEGORY_SECTIONS[cat] || CATEGORY_SECTIONS.custom`。缺失 4 类命中后回退 `"custom"`，在真实拼装进 LLM 上下文的世界书章节里被错误并组进「📦 自定义」，与 sync-global-prompt 路径（已正确分组）呈现不一致。
- 即便 11 个共有项，emoji / 文案也与权威源 `WORLD_CATEGORY_LABELS` 多方分歧（如 geography `🗺️ 地理环境` vs `🗺 地理`、`custom` `🔮 特殊设定` vs `📦 自定义`）。

---

## 二、标签派生方案

将引擎的板块标签改为从分类器权威常量派生，与 catLabel（`sync-global-prompt.ts`）共用同一 `WORLD_CATEGORY_LABELS` 单一源，从源头消除手抄漂移与 4 类漏网。

### 文件 1：src/lib/world-category-classifier.ts（新增权威派生结构）
- 在 `WORLD_CATEGORY_LABELS`（第 48-64 行）之后新增 `WORLD_CATEGORY_SECTIONS: Record<WorldCategory, { emoji: string; label: string }>`（由 IIFE 从 `WORLD_CATEGORY_LABELS` 拆分 emoji + 文案生成）。
- 键入为 `Record<WorldCategory, ...>`（精确键入）：类型系统强制覆盖全部 15 类，一旦 `ALL_WORLD_CATEGORIES` 增删/改名某一类而此处漏改，tsc 直接报错；同时取代引擎内那份手抄映射。
- 拆分的依据：`WORLD_CATEGORY_LABELS` 的取值格式恒定是「emoji + 半角空格 + 文案」，按首个空格拆分即可得到 emoji 与 label，无空格歧义（文案为中文，不含空格）。

### 文件 2：src/core/assembly/engine.ts（改为派生引用）
- 顶部 import 扩展为 `import { WORLD_CATEGORY_SECTIONS, type WorldCategory } from "@/lib/world-category-classifier";`。
- 删除原第 213-225 行手抄 `CATEGORY_SECTIONS` 对象（11 项硬编码）。
- 全部 5 处消费点（`buildLoreSection` 与 `renderLoreEntries` 内）的 `CATEGORY_SECTIONS` 改为 `WORLD_CATEGORY_SECTIONS`；运行时 `cat` 经 `as WorldCategory` 转型后索引（保留非法分类回退 custom 的安全兜底，该转型仅为类型收窄，运行时非法值仍返回 undefined 走兜底）。
- 原 `custom` 兜底分支（`|| WORLD_CATEGORY_SECTIONS.custom`）保留，作为防御性兜底；现在 15 类全部有定义，合法分类永不再塌缩。
- 为支持单元测试，`buildLoreSection` 与 `renderLoreEntries` 两处纯函数新增 `export`。

### 同源保证
- 引擎板块标签、catLabel（sync-global-prompt）、分类清单（ALL_WORLD_CATEGORIES）三者现在全部派生自 `world-category-classifier.ts` 同一模块、同一 `WorldCategory` 类型，15 类中文标题 + emoji 永远 1:1，彻底消除 Round-4 视线漏掉的同源新缺陷（NEW-UI-WC-1）。
- 保留 Round-3 的 15 类覆盖成果与 Round-4 的 catLabel 派生成果，未回退。

---

## 三、改动文件 / 行

| 文件 | 行 | 改动 |
|---|---|---|
| src/lib/world-category-classifier.ts | 66-83（新增） | 新增 `WORLD_CATEGORY_SECTIONS: Record<WorldCategory, {emoji,label}>`，由 WORLD_CATEGORY_LABELS 派生，覆盖全部 15 类 |
| src/core/assembly/engine.ts | 34-36（import） | 引入 `WORLD_CATEGORY_SECTIONS` 与 `WorldCategory` 类型 |
| src/core/assembly/engine.ts | 212-215（删除） | 删除手抄 `CATEGORY_SECTIONS` 11 项硬编码对象 |
| src/core/assembly/engine.ts | 227 / 266 | `buildLoreSection` / `renderLoreEntries` 加 `export` 以便单测 |
| src/core/assembly/engine.ts | 231-232 / 239 / 261 / 267 | `CATEGORY_SECTIONS` → `WORLD_CATEGORY_SECTIONS`，`cat` 转型 `as WorldCategory` |
| src/lib/world-category-classifier.test.ts | import + 新增用例 | 引入 `WORLD_CATEGORY_SECTIONS`，新增「与 ALL_WORLD_CATEGORIES 同源、覆盖 15 类、emoji/label 非空」回归用例 |
| src/core/game/game-engine.test.ts | 新建 | 验证 buildLoreSection / renderLoreEntries 对 15 类均按自身标题分组、漏网 4 类不再塌缩 custom、非法分类仍回退 custom |

---

## 四、验证结果（本地实跑）

1. 类型检查：
   `cd 项目根 && SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → 退出码 0，零错误（无任何输出）。

2. 单元测试：
   `npx vitest run src/core/game/game-engine.test.ts src/lib/world-category-classifier.test.ts`
   → Test Files 2 passed (2)；Tests 12 passed (12)。
   - `world-category-classifier.test.ts` 8 个（原 7 个 + 1 个新增 WORLD_CATEGORY_SECTIONS 同源回归）。
   - `game-engine.test.ts` 4 个（关键词触发路径 + 强制注入路径，含 4 类漏网不再塌缩 + 非法分类回退）。
   - 关键断言：喂入 fate_system / physics / public_system / character_relationship 各一条，输出章节标题分别为 `【🔮 命运体系】` `【🔬 物理】` `【🏛 公开体制】` `【🔗 角色关系】`，且输出中**不包含** `【📦 自定义】`；15 类全量输入时章节数 == 15。

3. 静态核对（grep）：
   - `src/core/assembly/engine.ts` 中已无手抄 `CATEGORY_SECTIONS` 定义（grep `const CATEGORY_SECTIONS` 无匹配）。
   - `src/core/assembly/engine.ts` 中已无 `地理环境`/`势力阵营`/`特殊设定` 等手抄 label 文案（全部改为 `WORLD_CATEGORY_SECTIONS` 派生引用）。
   - `WORLD_CATEGORY_SECTIONS` 键集与 `ALL_WORLD_CATEGORIES` 完全一致，均由 `WorldCategory` 类型约束（tsc 强制 15 类全覆盖）。

---

## 五、诚实声明（未实测项，绝不伪装已验证）

1. **真实生成上下文端到端渲染效果「未经实测，待验证」**：本修复已通过 tsc 零错误 + 单测全绿（12 passed）+ grep 静态确认证明「引擎板块标签已派生、覆盖全部 15 类、4 类不再塌缩 custom」。但单测是直接调用 `buildLoreSection` / `renderLoreEntries` 纯函数构造最小输入，未启动 dev server、未走完整 `assemblePrompt` → 真实 LLM 网关 → 真实生成回读的闭环；逻辑上标签映射与权威源逐字一致、消费处写法不变，渲染输出应与修复前对 15 类的正确分组一致，但端到端链路未经实战触发。
2. **标签/emoji 收敛带来的文案变化「未经目测」**：为与权威源同源，引擎板块文案现收敛为分类器的值（如 `custom` 由「🔮 特殊设定」变为「📦 自定义」、`geography` 由「🗺️ 地理环境」变为「🗺 地理」）。这是消除多方分歧的预期结果，但变更后世界书章节在真实 prompt 中的观感未经人工目测确认。
3. **NEW-UI-WC-2 / WC-3 / WC-4 不在本轮范围**：浅色 tertiary 在 surface-3 上 <AA 倒挂、surface-4 未定义、explore/types.ts 第三份 emoji 源，均属 Round-4 复检遗留/低置信项，本次只修复 P1 的引擎第二份标签映射（NEW-UI-WC-1）。
4. **未触碰抽取/落库链路**：本修复位于生成侧注入端，与分类器关键词抽取、实体落库解耦，不受影响。

结论：装配引擎 `engine.ts` 的第二份手抄世界卡标签映射已改为从分类器权威常量 `WORLD_CATEGORY_SECTIONS`（同源 `WORLD_CATEGORY_LABELS`）派生，键入 `Record<WorldCategory,...>` 强制 15 类全覆盖、与 catLabel 同源，彻底消除 fate_system / physics / public_system / character_relationship 四类塌缩到 custom 的多源漂移（P1 · NEW-UI-WC-1），并保留 Round-3/Round-4 成果。tsc 零错误、相关测试全绿（12 passed）。真实生成侧标签渲染端到端效果未经实测，待验证。
