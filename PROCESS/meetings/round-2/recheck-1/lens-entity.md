# 阶段五复检 · 实体与伏笔（entity lens）独立复检报告

- 复检员：独立代码复检员（魔王系统 MaxLoop Overlord 阶段五复检循环 · lens-entity）
- 复检日期：2026-08-07
- 项目根：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- 复检领域：实体与伏笔（entity / foreshadowing）
- 复检对象：round-2 整合清单 R2-002（实体 15 类闭环 / 主张级集成测试）与 R2-007（伏笔检测在确认漏斗补齐）
- 方法：Trust but verify。所有结论均基于 Grep + Read 当前文件真实内容，以及 `npx vitest run` 实跑产物，而非仅凭 git diff 或 changelog 自述。

---

## 一、两条复检项逐条验证结论

### 1. R2-002（P0，交叉验证）—— 实体 15 类分类闭环 + 主张级集成测试

**结论：生效（落地真实 + 测试全绿）。但测试标题与断言口径存在一处命名偏差（非功能缺陷），文末"诚实声明"中单列说明。**

#### 1.1 改动真实落地的证据（Grep + Read 当前内容）

验证 `src/core/babylore/entity-sync.ts` 的 type 枚举与 `TYPE_TO_CATEGORY` 映射：

- 文件顶部 `ENTITY_SYSTEM_PROMPT`（entity-sync.ts:37-45）的 JSON 枚举中明确列出：
  `character|location|item|technique|organization|creature|fate|physics|public|magic_system|culture|history|law|currency|other`。
  其中新增的 5 类 `magic_system|culture|history|law|currency` 已写入 LLM 抽取指令，约束下游抽取输出。

- `TYPE_TO_CATEGORY` 映射表（entity-sync.ts:47-62）当前内容确认补齐了全部 5 条：
  ```ts
  magic_system: "magic_system",
  culture: "culture",
  history: "history",
  law: "law",
  currency: "currency",
  ```
  与既有的 `location/item/technique/organization/creature/fate/physics/public/other` 共同构成 14 个键。角色（`character`）在代码中走 `characterCard` 分支（entity-sync.ts:204-226），不进 `TYPE_TO_CATEGORY`。

- 分类器 `src/lib/world-category-classifier.ts` 的 `ALL_WORLD_CATEGORIES`（line 38-42）共 15 类：
  `geography, faction, item, magic_system, technique, creature, culture, history, law, currency, character_relationship, custom, fate_system, physics, public_system`。
  该表与 `TYPE_TO_CATEGORY` 的目标值完全对齐（custom 为兜底桶，character_relationship 由角色关系分支负责）。

- 交叉验证 R2-001 的确定性兜底仍完好（entity-sync.ts:228-238）：当 `TYPE_TO_CATEGORY[type]` 落到 `custom`（包括 `type==="other"` 或 LLM 返回未映射类型如 `geography`）时，会调用 `classifyWorldCategory(`${name} ${description}`)` 重新路由，且仅接受非 `character_relationship` 的世界卡分类。这意味着即便 LLM 误给 type，新 5 类仍有兜底可达，不存在"静默归 custom"的回归。

**闭环判定**：LLM 枚举（含 5 新类）→ `TYPE_TO_CATEGORY` 直接落库 → `ALL_WORLD_CATEGORIES` 覆盖全部目标 → R2-001 兜底兜住未映射漂移。**15 类世界卡分类的可达性与闭环在代码层面成立。**

#### 1.2 主张级集成测试真实存在且实跑通过

新增文件 `src/core/babylore/entity-sync.test.ts` 当前内容确认包含三组主张级断言：

- `describe("R2-002 15 类世界卡分类全部可达")`（line 54-100）：用 mock LLM 返回覆盖 13 个世界卡分类的实体数组（location/organization/item/magic_system/technique/creature/culture/history/law/currency/fate/physics/public 各一条，外加一个 character 角色卡），断言落库 `category` 集合 == `EXPECTED_LORE`（即 `ALL_WORLD_CATEGORIES` 排除 `character_relationship` 与 `custom` 后的 13 类），且 `cats.size === EXPECTED_LORE.length`（无脏分类），且角色卡单独入库。
- `describe("R2-001 确定性兜底")` 三条（line 102-139）：验证 `type=other` + 灵石正文 → `currency`、`type=other` + 灭世之战正文 → `history`、纯角色对话 → 保持 `custom`。覆盖了"不可信 type 被分类器纠正"与"角色关系不被误归世界卡"两个边界。

**实跑产物（复检员本地执行）**：

```
$ npx vitest run src/core/babylore/entity-sync.test.ts src/core/confirm-guard.test.ts

 RUN  v4.1.10
 ✓ src/core/confirm-guard.test.ts (5 tests) 3ms
 ✓ src/core/babylore/entity-sync.test.ts (4 tests) 5ms

 Test Files  2 passed (2)
      Tests  9 passed (9)
   Duration  425ms
```

entity-sync.test.ts 的 4 个用例（1 个 15 类闭环断言 + 3 个兜底断言）全部通过，证明了"5 新类经 `TYPE_TO_CATEGORY` 直接落库"与"R2-001 兜底路由"两类主张在集成层面都成立。测试对 `prisma`、`fetch` 做了 mock，断言直接校验 `lorebookEntry.create` 调用数据里的 `category` 字段，是货真价实的主张级校验，而非仅测"函数不抛错"。

**小结**：R2-002 在代码落地与测试覆盖两个维度均"真生效"。worldcard 复检（lens-worldcard.md）已查过的闭环，本 lens 独立再确认一致。

---

### 2. R2-007（P1）—— 伏笔检测在确认漏斗补齐（auto-confirm / 批量确认）

**结论：部分生效。applyConfirm 的 skipDetect 参数与后处理时序闭环确实落地（生效），但"批量确认"路径实际并未被本次修复覆盖（缺口），且 refine 确认路径因 skipSummarize 联动导致 detect 永不触发（缺口）。R2-007 命名的两类路径中，auto-confirm 闭环，批量确认与 refine 确认漏检。**

#### 2.1 预期修复中"生效"的部分（证据确凿）

**(a) `applyConfirm` 新增 `skipDetect` 参数 + fire-and-forget detect —— 落地真实。**

`src/core/confirm-guard.ts`：
- 节点入参新增 `skipDetect?: boolean`（line 112）。
- 注释（line 100-106）明确：确认成功后 fire-and-forget `POST /api/foreshadowing/detect`，与手动 confirm 路径一致；`skipDetect` 用于"调用方会在确认后再补一次 detect"的场景（如后处理在摘要生成后才触发），避免确认早于摘要导致 detect 漏看本章。
- 实现（line 175-186）：
  ```ts
  if (!node.skipDetect) {
    const origin = process.env.APP_ORIGIN || "http://localhost:3001";
    void fetch(`${origin}/api/foreshadowing/detect`, { method: "POST", ... body: JSON.stringify({ projectId, nodeId }) }).catch(() => {});
  }
  ```
  逻辑闭环成立：当 `skipDetect` 不置真时，确认成功后即触发 detect。

**(b) 后处理早调用 applyConfirm 传 `skipDetect:true`，摘要落库后补触发 detect —— 落地真实，时序闭环成立。**

`src/core/pipeline/post-processor.ts`：
- 步骤 3.1（line 235-244）：评估通过后 `await applyConfirm({ ... skipDetect: true })`，确认发生在步骤 4 摘要生成之前，刻意跳过 detect。
- 步骤 4.5（line 698-709）：摘要已落库（`prisma.chapterSummary.create` 在 line 562 完成）之后，补触发一次 detect：
  ```ts
  const origin = process.env.APP_ORIGIN || "http://localhost:3001";
  void fetch(`${origin}/api/foreshadowing/detect`, { method: "POST", ... body: JSON.stringify({ projectId, nodeId }) }).catch(() => {});
  ```
- Read 确认 detect 调用位于 `if (!skipSummarize)` 块内、且位于摘要创建（line 562）与章名回填（line 617-634）之后，时序上"先确认（早，跳过 detect）→ 再生成摘要 → 再 detect"的闭环成立。这确实解决了 R2-007 提出的"摘要晚于确认生成"的时序盲点。

**(c) 手动 confirm（PATCH）路径本来就触发 detect（对照基线完好）。**

`src/app/api/story/nodes/[id]/route.ts:215-225` 在确认成功（updateMany count>0）后，用 `new URL(request.url).origin` 触发 `POST /api/foreshadowing/detect`（fire-and-forget，`.catch(()=>{})`）。该路径未走 `applyConfirm`，但有独立 detect 触发，与 R2-007 预期一致。

**(d) auto-confirm 独立路由与游戏导出路径均触发 detect。**

- `src/app/api/story/nodes/auto-confirm/route.ts:93-98` 调用 `applyConfirm({...})` 且未传 `skipDetect` → 默认触发 detect。
- `src/core/game/game-engine.ts:666-671` 调用 `applyConfirm({...})` 同样未传 `skipDetect` → 触发 detect。

**因此，auto-confirm（生成时自动确认 / 智能审阅 / 游戏导出章）这条路径 R2-007 闭环生效。**

#### 2.2 预期修复中"未生效 / 缺口"的部分（本 lens 新发现）

**(缺口 A — 批量确认路径根本没被本次修复触及，R2-007 命名的两类之一漏网)**

`src/app/api/story/nodes/batch-confirm/route.ts` 是真正的"批量确认"入口（前端 `workspace/[projectId]/page.tsx:853` 调用 `POST /api/story/nodes/batch-confirm`）。复检 Read 全文件（line 1-126）确认：

- 它**没有复用 `applyConfirm`**，而是内联了一套独立的确认逻辑（line 47-110：质量护栏 `evaluateConfirmEligibility` → `safeFillAfterWriting` → `updateMany` 置 confirmed）。
- 全文件**没有任何一处 `fetch("/api/foreshadowing/detect")` 或 `applyConfirm` 调用**。确认成功（line 96-109）后直接 `push` 到 `confirmed` 数组，循环结束（line 110），最后只 `void maybeAutoDeliver(projectId).catch(()=>{})`（line 113）返回。
- 也就是说：批量确认后，伏笔面板的收束率（`payoffRate`）**不会被自动刷新**，必须依赖用户手动点"重新检测"按钮（`ForeshadowingPanel.tsx:195`）或后续某次 auto/manual 确认顺带触发。这与 R2-007 明确写明的"伏笔检测在 auto-confirm / 批量确认路径缺失"以及期望修复范围直接矛盾——本次修复只把 detect 接进了 `applyConfirm` 与后处理，却没把最大的"批量确认"漏斗改造成调用 `applyConfirm`（或显式触发 detect）。

对照 changelog（`src/lib/changelog-data.ts:539`）声称"自动交付钩子挂在三处确认漏斗——applyConfirm（...）/ node PATCH 手动确认 / batch-confirm 批量确认"，但代码的 batch-confirm 路由实际既不调用 applyConfirm、也不触发 detect。**changelog 自述与代码事实不一致，属于典型的"假收敛"信号**——这正是阶段五要挖的坑。

**(缺口 B — refine（微调）确认路径因 skipSummarize 联动，detect 永不触发)**

`src/app/api/generate/refine/route.ts:174-187` 调用后处理时传 `skipReview: true, skipSummarize: true`。结合 post-processor 的结构：
- 步骤 3.1 的 `applyConfirm` 永远带 `skipDetect: true`（post-processor.ts:243），所以 refine 路径在确认那一刻**不**触发 detect。
- 步骤 4（含 4.5 的 detect 补触发）整个被 `if (!skipSummarize)` 包裹（post-processor.ts:512），`skipSummarize:true` 时整段跳过，**detect 补触发也一并被跳过**。

后果：章节被 refine（重写）并经智能审阅自动确认后，伏笔面板既不会因本次确认刷新，又因为跳过摘要导致旧的章节摘要与 refine 后的正文不一致——即便将来某次 detect 跑起来，扫的也是过时的章节摘要，可能漏看 / 误判 refine 后新埋设或新回收的伏笔。**这是 R2-007 时序修复的副作用盲区：detect 被写死进了"生成摘要"分支，凡是不走摘要的确认路径一并失去 detect。**

> 注：continue（续写）路由 `src/app/api/generate/continue/route.ts:224` 也调用后处理，但其调用未传 `skipSummarize`（grep 确认 continue 路由没有 skipSummarize 字面），故 continue 走完整摘要 + detect，无此缺口。write 路由同理正常。只有 refine 显式 `skipSummarize:true` 触发缺口 B。

#### 2.3 confirm-guard.test.ts 实跑说明

`src/core/confirm-guard.test.ts` 当前仅覆盖 `evaluateConfirmEligibility` 纯函数（5 个用例，全绿），**并不包含对 `skipDetect` / fire-and-forget detect 的断言**。因此 R2-007 的"生效部分"缺乏单元测试背书，仅能靠代码 Read 确认逻辑闭环 + 集成路径核对。这一点在复检员诚实声明中单列（属于"未经单测实测，靠静态核对"）。

---

## 二、新坑清单（round-2 未发现、真实存在的缺陷）

下列每条均给出 文件:行号 + 问题本质 + 复现思路。按严重度从高到低。

### 新坑 1（P1，确认漏斗缺口）：批量确认路径不触发伏笔检测，R2-007 范围漏半

- 位置：`src/app/api/story/nodes/batch-confirm/route.ts`（全文件，尤其 line 47-124 确认循环、line 113 仅 maybeAutoDeliver；无任何 detect 调用）
- 问题：最大宗的"最后一章定稿"时机（批量确认）既未调用 `applyConfirm`（其内部含 detect），也未显式 `fetch('/api/foreshadowing/detect')`。批量确认后伏笔收束率面板不刷新，违背 R2-007 明示的修复范围。changelog 自述称已覆盖，但代码并未，构成"假收敛"。
- 复现：在 workspace 勾选多章 → 批量确认 → 观察 `pendingCommitment` 状态与 `payoffRate` 不变 → 必须手动点伏笔面板"重新检测"才更新。
- 建议（供主 Agent 决策，非本次修复）：在批量确认循环结束后（或在每个节点确认成功后）显式 fire-and-forget detect，或重构 batch-confirm 复用 `applyConfirm` 并把 `detect` 提到"所有节点确认完"之后统一触发一次（避免 N 次全量扫描）。

### 新坑 2（P1，时序副作用盲区）：refine 确认路径因 skipSummarize 跳过 detect

- 位置：`src/app/api/generate/refine/route.ts:186`（`skipSummarize:true`）→ `src/core/pipeline/post-processor.ts:243`（`applyConfirm({skipDetect:true})`）+ `post-processor.ts:512`（`if(!skipSummarize)` 包裹步骤 4）+ `post-processor.ts:698-709`（detect 仅在该分支内）
- 问题：detect 补触发被写死进"摘要"分支，凡 `skipSummarize` 的确认路径（refine）既在确认时跳过 detect，又在摘要阶段整体跳过 detect，导致 refine 后伏笔面板永不被本次确认刷新；且 refine 不重生成摘要，旧摘要与 refine 后正文漂移，后续 detect 也可能基于过时摘要误判。
- 复现：章节经微调 + 智能审阅自动确认 → 本章新埋/新收的伏笔不出现在面板；对比 write 路径（有摘要+detect）行为不一致。
- 建议：把 detect 触发从 `if(!skipSummarize)` 内剥离，改为"确认成功即触发（skipDetect 仍默认 false），仅在需要'先生成摘要'的 write 路径显式 skipDetect 并延后到摘要后"。或 refine 路径在确认后主动补一次 detect。

### 新坑 3（P1/P2，静默失败 + 环境耦合）：fire-and-forget detect 无日志、无重试，且依赖 APP_ORIGIN 默认值

- 位置：`src/core/confirm-guard.ts:180-185`、`src/core/pipeline/post-processor.ts:701-706`
- 问题：两处 detect 触发都用 `process.env.APP_ORIGIN || "http://localhost:3001"` 自调用，并用 `.catch(() => {})` 完全吞掉错误，无任何 console 日志、无重试、无指标。一旦：
  (a) `APP_ORIGIN` 未配置且服务不在 3001（容器/反向代理/变更端口部署）；或
  (b) 确认瞬间服务短暂不可用 / 路由冷启动超时；
  detect 请求静默失败，伏笔面板永远不刷新，且运维与开发侧**完全无法从日志察觉**。这与手动 confirm 路由使用 `new URL(request.url).origin`（永远可达）不一致——同一网站的两条 confirm 路径，一个用真实 origin、一个用写死的 env 默认值，健壮性不对称。
- 复现：在 `APP_ORIGIN` 未设置的非 3001 部署上确认章节 → catch 吞错 → 面板不刷新；翻服务端日志无任何 detect 失败记录。
- 建议：统一用 `request.url.origin`（或注入的 baseURL）；至少 `.catch` 内 `console.error` 一次；考虑对 detect 失败做轻量重试或状态标记（如 `project.detectFailedAt`）。

### 新坑 4（P2，逻辑弱召回）：detectPayoffs 短语种子易致收束率系统性低估（false-low）

- 位置：`src/core/foreshadowing.ts:157-158`（种子抽取）+ `:233-242`（命中规则）
- 问题：`extractSeeds` 用正则 `[一-龥]{3,}` 抽取 description 中的连续中文片段，**一段不间断中文即是一个"短语"**。绝大多数伏笔 description 是单句（一个中文 run）→ 仅 1 个 phrase。而 `detectPayoffs` 的判定是：`matchedClosure>0 或 matchedPhrase>=2` → fulfilled(1.0)；否则若 `matchedPhrase===1 且状态为 pending/detected` → partially_fulfilled(0.5)。这意味着仅靠"正文恰好包含该伏笔描述里的某个词一次"几乎永远只能到"部分回收"，要达 fulfilled 必须依赖作者显式填的 `closureConditions`，或 description 被标点拆成 ≥2 段中文。结果是大量本应"已回收"的伏笔被长期标为"部分回收"，`payoffRate` 系统性偏低，误导作者对"线头收没收得住"的判断（与 R2-007 追求的"可量化收束率指标"目标相悖）。
- 复现：建一条 `description="主角在古墓发现了神秘令牌"`（单中文 run，1 phrase）的 pendingCommitment，后续摘要出现"神秘令牌"一处 → detect 后状态 `partially_fulfilled`(0.5) 而非 `fulfilled`。
- 建议：短语命中阈值应结合伏笔长度/语义相似度放宽（如 ≥1 个长短语即升 fulfilled，或用语义重叠而非字面包含），或把"摘要里出现该伏笔关联实体名 + 回收信号词"作为 fulfilled 判据之一。

### 新坑 5（P2，性能/语义）：detectPayoffs 全量扫描且 nodeId 形同虚设，每次确认都重算整本

- 位置：`src/core/foreshadowing.ts:174-267`（遍历全部 commitments × 全部 summaries）、`confirm-guard.ts:184` 与 `post-processor.ts:705`（body 带 nodeId 但 route.ts:25 仅取 projectId，detectPayoffs 完全不读 nodeId）
- 问题：每次 confirm 触发的 detect 都是对整个项目的 `pendingCommitment × chapterSummary` 全量重算（O(C×S)）。长篇小说（数百章、上千伏笔）每次确认都触发一次重全量扫描，且无节点级增量。更糟的是传给 detect 的 `nodeId` 被完全忽略——既无法用于"只扫本章之后"，也无法用于"只更新受影响伏笔"，纯粹是死参数，容易让维护者误以为 detect 已做节点级隔离。
- 复现：对 50 章项目每确认一章，观察 detect 路由内部对 `pendingCommitment.findMany`（全量）+ `chapterSummary.findMany`（全量）的执行次数随确认次数线性累积；压测下确认接口被 detect 自调用拖慢。
- 建议：detect 支持 `nodeId` 作用域（只扫该节点 detectedAt 之后、或在仅当新增摘要时才重算）；或改为"确认后置 dirty 标记，由面板懒加载/低频任务聚合计算"。

### 新坑 6（P3，命名/文档一致性，非功能）：entity-sync.test.ts 标题写"15 类"但断言 13 类

- 位置：`src/core/babylore/entity-sync.test.ts:54`（`describe("R2-002 15 类世界卡分类全部可达…")`）vs `:45-47`、`EXPECTED_LORE = ALL_WORLD_CATEGORIES.filter(c => c!=="character_relationship" && c!=="custom")` → 实际 13 类
- 问题：测试断言的是 13 个世界卡分类（正确排除了 `character_relationship`（由角色关系分支负责）与 `custom`（兜底桶）），但 `describe` 标题与任务书口径都写"15 类"。真实闭环是"13 世界卡 + 角色卡路径 + custom 兜底"三件套，而非"15 类全经 TYPE_TO_CATEGORY"。标题夸大但不影响正确性，仅易造成审计误读。建议在标题/注释中注明"15 类世界卡分类体系中 13 类经自动填表直接落库，另 2 类分别由角色关系分支与兜底桶负责"。
- 复现：阅读测试文件即发现标题与 `EXPECTED_LORE.length` 不符；单测仍绿，无功能影响。

---

## 三、复检员诚实声明（哪些真测了、哪些仅静态核对、哪些待验证）

### 3.1 真测（本地实跑，非仅看 diff）
- `src/core/babylore/entity-sync.test.ts`：4 个用例全部本地 `npx vitest run` 通过，证明 R2-002 的 5 新类经 `TYPE_TO_CATEGORY` 直接落库 + R2-001 确定性兜底路由均成立。
- `src/core/confirm-guard.test.ts`：5 个用例全部通过，证明 `evaluateConfirmEligibility` 护栏（空/短拦截、阈值、机械重复）逻辑闭环。
- 上述两次实跑合并输出：`Test Files 2 passed (2)`， `Tests 9 passed (9)`。

### 3.2 仅静态核对（Grep + Read，未经单测/集成实测）
- R2-007 的"生效部分"：applyConfirm 的 `skipDetect` 参数、post-processor 时序闭环、auto-confirm 路由与游戏导出路径的 detect 触发、手动 confirm 路由的 detect 触发——均通过 Read 当前文件逐行确认逻辑闭环，**但没有任何单元测试覆盖 `skipDetect` 与 fire-and-forget detect**，故只能声明"代码落地且逻辑自洽"，不能声明"已被自动化测试守护"。
- 新坑 1（batch-confirm 缺 detect）：通过 Read 全文件 + grep 确认无 detect/fetch 调用，静态确凿。
- 新坑 2（refine skipSummarize 致 detect 缺失）：通过 Read refine 路由调用参数 + post-processor 分支结构静态确认。
- 新坑 3（detect 静默失败 / APP_ORIGIN 耦合）：通过 Read 两处 fetch 实现 + 对照 manual route 的 origin 用法静态确认。
- 新坑 4（短语种子低估收束率）、新坑 5（全量扫描 + nodeId 死参数）、新坑 6（标题口径）：通过 Read `foreshadowing.ts` 与测试文件静态确认。

### 3.3 未经实测、待验证的项（明确标注，绝不作伪）
- **detect 触发端到端闭环未经真机验证**：本复检环境的 `npx vitest` 只覆盖 mock 层，未起真实 dev server（`next dev -p 3001`）、未连真实 Postgres、未跑真实 LLM 网关。因此"确认一章后伏笔面板是否真的自动刷新"这一端到端行为**未经实测**。新坑 3 关于 `APP_ORIGIN` 默认值与 `.catch` 吞错的后果，属于基于代码路径的推断，需在真实部署配置下验证。
- **detectPayoffs 语义命中质量未经真实语料验证**：新坑 4 的"系统性低估"是基于正则种子规则的推导；真实小说里伏笔 description 是否多为单中文 run、摘要是否常命中 ≥2 phrase，需要拿真实 `pendingCommitment` + `chapterSummary` 数据跑一次 `detectPayoffs` 才能定量确认偏差幅度。
- **性能（新坑 5）未经压测**：O(C×S) 全量重算的实际影响需要在规模化数据（百章/千伏笔）下 benchmark，本复检未做。

### 3.4 复检结论总览
- R2-002：生效（代码落地 + 主张级测试全绿）。仅测试标题口径有一处非功能性夸大（新坑 6）。
- R2-007：部分生效。auto-confirm / 手动 confirm / 游戏导出三条路径闭环；但"批量确认"（新坑 1）与"refine 确认"（新坑 2）两条确认漏斗未触发 detect，且 detect 自调用存在静默失败与部署耦合风险（新坑 3）。R2-007 命名的"auto-confirm / 批量确认"中有一半（批量确认）实际未闭环，应退回修复。
- 新坑数量：6 条（P1×2：新坑1、新坑2；P1/P2×1：新坑3；P2×2：新坑4、新坑5；P3×1：新坑6）。
