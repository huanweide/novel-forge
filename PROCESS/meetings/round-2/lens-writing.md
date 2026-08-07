# 写章主流程深度体验报告（MaxLoop 魔王系统 · 开会子 Agent）

- **Agent 代号**：写章主流程透镜（lens-writing）
- **轮次**：round-2
- **版本**：v1.6.4（HEAD=2b88e09）
- **日期**：2026-08-07
- **项目绝对路径**：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- **聚焦模块**：写章主流程核心（`src/app/api/generate/{write,refine,continue,pre-write-cards}`、`src/core/babylore/loop.ts`）、确认/自动确认/批量确认链路（`src/core/confirm-guard.ts`、`src/app/api/story/nodes/[id]`、`batch-confirm`、`auto-confirm`、`src/app/api/projects/[id]/confirm`）、写章交互与批量生成 UI（`src/app/workspace/[projectId]/page.tsx`、`src/components/workspace/ChapterConfirmBar.tsx`）

---

## 〇、执行摘要与方法论（诚实边界声明）

本轮 lens 以「写章主流程」为唯一透镜，复验 v1.6.3 / v1.6.4 新增功能，并全局挖新坑（性能 / 监控盲区 / 回归 / 浪费）。下列证据均来自**真实代码阅读、测试运行或真实操作证据**，无任何编造：

- `git log --oneline -15`：HEAD=2b88e09（feat: v1.6.4 故事线支线联动 UI + 数据化），其上 14 个提交均为 v1.6.x 系列。v1.6.3/v1.6.4 的 diff 经 `git diff --stat 5149a41 2b88e09` 核对，**仅触碰故事线（storylines）相关 5 个文件**（storylines/generate、StorylineList、changelog-data 等），**未触碰写章 / 确认核心代码**。因此 round-2 对写章主流程的复验本质是"回归校验已有 IMP + 全局挖新坑"，而非验证新功能侵入。
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`：**EXIT 0，零类型错误**。
- `npm test`（vitest）：**19 个测试文件、238 个用例全部通过**（round-1 报告称约 211 例，已增长至 238，且全绿）。`confirm-guard.test.ts`（5 例）、`maybe-auto-deliver.test.ts`（6 例）等护栏单测均绿。
- **诚实边界（沙箱限制）**：本沙箱**无 Chromium**，无法穷举浏览器交互。写章主闭环的 UI 层（SSE 流式渲染、toast、确认栏折叠态、智能审阅开关联动、禁用态对比度、响应式、动画）**无法在此真机目测**，统一降级为「API 契约 + SSR/源码阅读 + 单测证据」。凡是纯视觉 / 动画 / 响应式细节，本报告一律标注「**需本地 `npm run dev` 目测**」，绝不伪称已目测。DB 约定 `127.0.0.1:5432`，LLM key 来自 DB AppSettings；但本沙箱未启动运行态 Next/Postgres 服务，**未执行真实 LLM 生成**（需常驻服务 + 联网），下列"用户走通主闭环"为**基于源码契约与失败模式推演的重建式走查**，所有具体失败点均锚定到具体代码行，可经本地 dev 复现。

### round-1 五条重点 IMP 复验结论（先给结论，详见第四节）

| IMP | 复验项 | 结论 | 证据 |
|---|---|---|---|
| IMP-002 | isLatestChapter 透传 | **无回归**，算法一致 | confirm/[id]:171-181、batch-confirm:37-41/81、refine:197-200、continue:246-249 均用 `order === maxOrder` |
| IMP-004 | 确认 toast 文案依真实 fill | **无回归** | ChapterConfirmBar:144-157 依 `reviewLogs.fill` 真实值分四类文案 |
| IMP-005 | 自动确认引导 | **部分问题**：引导存在且去重，但"自动定稿"过度承诺（见 F-03） | ChapterConfirmBar:124-132 |
| IMP-007 | detectPayoffs 写章触发 | **部分回归**：仅手动 confirm 触发，auto-confirm 不触发（见 F-04） | [id]/route.ts:216-225 vs auto-confirm/route.ts |
| IMP-024 | 批量生成角色卡参数 | **实质断裂**：持久化未写入（见 F-02） | page.tsx:806 读取但 PreGenConfirm 无写入 |

### 〇·补：写章主流程能力地图、透镜边界与回归判定深化

**能力地图（本透镜覆盖的代码实体）**。写章主流程由"生成三路径 + 确认四入口 + 填表闭环 + 交互 UI"四块拼成，本透镜逐一摸排：

- 生成三路径：`/api/generate/write`（主写章，SSE 流式）、`/api/generate/refine`（微调/续写/补长）、`/api/generate/continue`（一键续写，自动建下一节节点）、`/api/generate/pre-write-cards`（生成前角色卡调度，GET）；
- 确认四入口：`PATCH /api/story/nodes/[id]`（单章 submit/confirm/reject/reopen/diagnose，含手动填表副作用与伏笔触发）、`POST /api/story/nodes/batch-confirm`（批量确认，质量护栏拦截低分章）、`POST /api/story/nodes/auto-confirm`（智能审阅自动放行）、`POST /api/projects/[id]/confirm`（整本交付）；
- 填表闭环：`src/core/babylore/loop.ts` 的 `safeFillAfterWriting` + `buildRecallBlock`（宝宝流记忆召回 + 写后自动填表）；
- 护栏与判定：`src/core/confirm-guard.ts` 的 `evaluateConfirmEligibility`（单一质量阈值 + 结构门槛）、`applyConfirm`（确认副作用统一收口）、`maybeAutoDeliver`（自动整本交付）；
- 交互 UI：`src/app/workspace/[projectId]/page.tsx`（streamSSE、handleBatchGenerate、handleBatchConfirm）、`src/components/workspace/ChapterConfirmBar.tsx`（确认栏、智能审阅开关、智能交付全书）、`src/components/workspace/PreGenConfirm.tsx`（生成前角色确认）。

**透镜边界（诚实声明）**。本透镜只评"写章主流程"，不含：① 故事线支线联动（v1.6.4 新功能，属 storyline 透镜，且 diff 已确认未触碰写章核心）；② 游戏化 / 拆解 / 蒸馏等其他子系统；③ 真实 LLM 生成效果（需常驻服务 + 联网，沙箱未启）。超出边界者一律不评、不臆测。

**回归判定深化**。对 round-1 的 26 条 IMP 全闭，本透镜只重点复验与写章强相关的 5 条（IMP-002/004/005/007/024），结论已在上表给出。补充三点判断：① IMP-002 的 `isLatestChapter` 算法在四处高度一致，且 `evaluateConfirmEligibility` 有 5 例单测守护，**是 round-1 防回归最坚固的一条**；② IMP-004 的"诚实 toast"不仅服务端 `fillMsg` 三态清晰，前端还做了"已执行/未触发/失败/默认"四类映射，**用户体验与数据真实对齐，无 regression**；③ IMP-005/007/024 则暴露同一类问题——**修复的"前半段"扎实，但"触发点 / 持久化写入端"遗漏**：IMP-005 引导在了但不自动触发（F-03），IMP-007 挂载在手动 confirm 但漏了 auto-confirm（F-04），IMP-024 读了 localStorage 但没人写（F-02）。这三条共同指向 round-1 收尾时"只验证主路径、未验证所有调用方"的盲区，正是 round-2 最该补的课。

**本轮任务语境说明**。round-1 魔王循环已完成 P0/P1 全清零（26 条 IMP 全 closed），本轮 round-2 的定位不是"找新大坑砸地基"，而是两层动作：第一层**复验** v1.6.3/v1.6.4 新增功能是否引入回归，第二层**全局挖新坑**——聚焦性能盲区、监控盲区、修复回归（修了东墙塌西墙）、以及"做了一半"的浪费（触发点遗漏 / 持久化写入端缺失）。本透镜的"写章主流程"是用户价值密度最高的一条主链路，任何在它上面的静默失败或数据污染都会被高产用户日复一日放大，因此优先级最高。下文的发现清单严格遵循"可定位、可复现、不空谈"三原则：每条都锚定到具体文件:行号，并以源码阅读 / tsc / vitest（238 例全绿）/ 本地 dev 作为验证手段，凡无法在沙箱真机验证的纯视觉项，一律标注"需本地 npm run dev 目测"，绝不伪称已目测。

---

## 一、用户体验视角（以真实用户身份走通主闭环）

> 本节以"建项目 → 写章 → AI 生成 → 确认 → 整本交付"为主闭环，站在**第一次使用的新用户**与**高产连载老用户**双视角，记录卡顿、报错、空响应、静默失败，并评价按钮文案、空状态、错误提示、对比度 / 响应式 / 禁用态。纯视觉项标注「需本地 npm run dev 目测」。

### 1.1 建项目与进入工作区：首屏体验尚可，但"空态引导"依赖手动点

新用户进入工作区，左侧大纲为空。引导入口藏在工具箱「看示例」（page.tsx:753 `loadSample`），通过 `POST /api/seed/sample-project` 载入内置示范小说。这一设计本身合理——但**空态并不主动提示"先看示例"**，用户若直接点"新建章节"再写，容易在零世界卡状态下让 AI 凭空编造（pre-write-cards 路由 line 238 已给出 `⚠️ 世界卡完全为空` 警告，但那是生成前卡片弹窗里的内容，不在首屏）。对纯新手而言，**首屏缺一个零阻塞的"示例 / 空白起步"对比引导**，是轻微的冷启动摩擦。

进入工作区后，`loading` 态（page.tsx:903-911）是一组三点的脉冲动画，克制不晃眼；`loadError` 态（912-920）给出"重试 / 返回首页"双按钮与居中错误文案，错误态可见性良好。这部分 UI 完成度较高。

### 1.2 写章主闭环：生成阶段反馈丰富，但"自动审阅"是个漂亮的空承诺

用户选中章节 → 点「续写 / 微调」→ `handleWrite` → `PreGenConfirm` 弹窗（人物可选 + 作者指令 + 确认）→ `handleWriteConfirmed` → `streamSSE('/api/generate/write')`。生成期间：

- **token 流式**实时回填正文区（streamSSE:599），体验顺滑；
- **废词扫描 v3 / 逻辑自查 / 宝宝流记忆召回**等事件被拆成独立面板（`setForbiddenScanResult`、`setRecallMemories`），不再三连弹 toast（Round6 toast 收敛，page.tsx:571-660 注释明确），**这是 round-1 后很扎实的体验改进**，值得肯定；
- **done 态**（page.tsx:662-674）：合并本地蒸馏统计 → 成功 toast `正文已生成并保存 ✓` → `loadProject()` 刷新 → 调 `autoExtractChapter` 自动提取章节。

**但这里出现本轮最关键的体验断裂（F-03）**：项目默认开启"智能审阅（自动确认）"，且首次进入时引导 toast 明确说"**合格章将自动定稿（含自动填表）**"（ChapterConfirmBar:129）。然而**代码里写章完成后的 done 处理从不调用 auto-confirm**（page.tsx:662-674 无 `/api/story/nodes/auto-confirm` 调用，全局 grep 确认 page.tsx 中无任何 `auto-confirm` 字符串）。也就是说，用户写完一章后，章节停留在 `completed` 态，**不会自动定稿**，必须手动点「智能交付全书」或切到「人工接管」再「确认通过」。对相信了引导文案的新用户，这是**一次静默的预期落空**——开关开着，却什么都没自动发生。命名"自动确认"与实际"手动触发式可自动判定"之间存在语义鸿沟。

从老用户视角更糟：高产用户批量写完 20 章后，若以为"智能审阅开着就全自动了"，会发现 20 章全堆在 `completed` 待确认，还得再点一次「智能交付全书」扫一遍。功能的"自动"二字名不副实，属于**承诺与实现错位**的经典体验陷阱。

### 1.3 确认阶段：单章确认文案诚实，但"自动交付"成功静默

单章「确认通过」的 toast 文案（ChapterConfirmBar:144-157）**做对了**：它读取服务端回写的 `reviewLogs[last].fill` 真实值，分四类——"已执行 / 本次未触发自动填表 / 自动填表失败 / 默认"，**不谎称已执行**。这是 round-1 IMP-004 的扎实落地，体验诚实，给好评。

「智能交付全书」（ChapterConfirmBar:187-218）scan 后：
- 若 `blocked.length === 0 && confirmed.length > 0 && !autoDeliver`：补一次 `confirmProject()` 并给成功 toast；
- 若 `autoDeliver` 开启（默认）：只 `onAction()` 刷新，**不弹任何成功 toast**，仅靠后续出现的"整本已确认交付"横幅（404-408 行）间接告知。

**问题在于**：在 `autoDeliver` 开启这条"推荐路径"上，用户点了「智能交付全书」后，界面只有进度条从"扫描中…"变回按钮，**没有任何"已交付"的明确反馈**（除非低头去找底部横幅）。成功反馈不一致——保守模式有 toast，自动模式靠横幅。对刚完成整本交付的用户，缺少一句"整本已确认交付 🚀"的收尾确认。

### 1.4 批量生成：批量"成功"数虚报，失败被静默吞掉（F-08）

`handleBatchGenerate`（page.tsx:794-843）遍历选中章，逐章 `fetch('/api/generate/write')` 并消费 SSE。它把每章状态记进 `progress` map（`generating / done / failed`），**但循环结束后把 `progress` 整个丢弃**，最终 toast 写死用 `ids.length`（所选章数）：

```ts
toastSuccess(`批量写作完成：${ids.length} 章已生成`);   // page.tsx:842
```

这意味着：若用户选了 5 章、其中 2 章已 `completed` 被 `continue` 跳过（line 821）、1 章生成失败（`status:"failed"` 记入 progress 但无提示），toast 仍报"5 章已生成"。**真实的成功数是 2，却被报成 5**。更糟的是，失败的章没有任何逐条汇总（progress 已丢弃），用户只看到一句乐观的"完成"，再去大纲里逐章翻才发现有的章是空的。这是典型的**静默虚报成功**，在批量场景尤其危险——用户可能基于错误认知继续后续流程。

### 1.5 续写（continue）：标题会被污染成"第3章（续）（续）"（F-10）

老用户高频用「一键续写」。continue 路由（continue/route.ts:51-55）用正则 `/^(.+?)(\d+)$/` 推断下一节标题。对"第3章""序章""楔子"这类**不以数字结尾**的标题，正则匹配失败 → 落到 `当前标题 + "（续）"`。若用户连续续写两次，标题变成「第3章（续）（续）」。这种标题累积污染在长篇小说里会非常难看，且无法在生成前预览纠正（续写是全自动建节点）。

### 1.6 按钮文案 / 空状态 / 错误提示 / 对比度 / 响应式 / 禁用态评价

- **按钮文案**：整体克制准确。禁用态用 `disabled={busy}` 锁住（ChapterConfirmBar 各按钮），避免重复点击。`打回重写` 按钮红色描边（`border-[var(--nv-danger)]/40`）、`确认通过` 用成功绿，语义清晰。**需本地 npm run dev 目测**这些色块在深浅背景下的实际对比度是否达 WCAG AA（源码用 CSS 变量，逻辑上 `danger/40` 在深底上可能偏暗，需目测确认）。
- **空状态**：大纲空（"先生成/手写正文，再走确认流程"，ChapterConfirmBar:310-312）、监测加载失败（"加载失败"红字，MonitorPanel:74）都给了明确占位，不空白。
- **错误提示**：API 失败一律 `toastError(d.error || ...)`，且 SSE `error` 事件（page.tsx:675）只 `console.error` **不弹 toast**——即生成中途 LLM 报错时，用户看到正文区停住、控制台有红字，但**界面上没有明显的失败 toast**（done 不会触发，genStep 置 "error" 但仅内部态，未见对应 UI 提示分支）。这是**错误提示的盲点**：失败态只在 console，前端无可见报错。建议 SSE `error` 也弹 `toastError`。
- **响应式**：工作区三栏布局，`@media` 断点**需本地目测**；批量勾选态 `selectAllChapters`（page.tsx:791）只筛 `type==="chapter"`，scene/section 不被纳入批量，老用户若以 scene 为主要单位会困惑。
- **禁用态**：`确认打回` 按钮 `disabled={busy || !reason.trim()}`（ChapterConfirmBar:326），理由必填才解锁，防误提交，合理。

---

## 二、总体视角（架构 / 代码质量 / 断链 / 异常 / 性能 / 数据一致性）

> 本节跳出单用户，从系统架构、可维护性、性能与数据一致性维度评估。round-1 已清零 26 条 IMP，本轮重点看"修完之后是否引入新债"与"全局盲区"。

**写章主流程健康度雷达（五维）**。综合本轮摸排，给写章主流程五个维度打分（满分 5）：
- **正确性（4.5）**：质量护栏、幂等、自动交付判定有单测守护，tsc 零错，核心逻辑可靠；
- **数据一致性（3.0）**：F-01 三路径填表闸门不一致 + 双填，是本轮最大的扣分项；
- **自动化可信度（3.0）**：F-03"自动确认"不自动、F-04 伏笔检测覆盖不全、F-05 全量重扫，承诺与实现错位；
- **可观测性（3.5）**：MonitorPanel 防御到位（autoRate 防 NaN），但 SSE 中途 error 无界面提示、批量虚报，失败可见性不足；
- **可维护性（4.0）**：单一真相源（story-status、confirm-guard、changelog-data）设计良好，但存在 F-06 死变量、F-11 版本双真相等小债。

雷达显示：**底层基石健康，但"自动化"与"数据一致性"两块塌方**，恰好对应 F-01/F-02/F-03/F-04/F-05 这组"架构演进同步遗漏 + 修复做一半"的软债。这正是 round-2 应收口的方向——不是推倒重来，而是把已建好的基石真正贯通到所有调用方。需要强调的是，这种"局部塌方"在成熟项目里极常见：当核心重构（如 v1.6.x 把填表移出 write）只改了主路径、未同步所有兄弟路径时，就会出现 F-01 这类原则性不一致；当一条修复（如 IMP-024/IMP-007）只验证了"我能读到 / 我能手动触发"，未验证"谁负责写入 / 谁负责自动挂载"时，就会出现 F-02/F-04 这类半截修复。两者的共同解药都是同一句话：**改动要按"调用方全集"而非"主路径"做回归**，而最便宜的回归手段就是补一条覆盖全调用方的集成测试——这也正是 6.3 验收门禁的设计初衷。

### 2.1 写章三路径的"填表闸门"不一致——本轮最严重架构债（F-01，P1）

这是本轮必须点名的一处**原则性断裂**。v1.6.x 的架构演进中，写章主路径（write）明确把"自动填表"从生成副作用**移到了确认副作用**，路由内注释写得很重（write/route.ts:329-331）：

> 确认流程：自动填表已移至「确认通过」后触发……未审视草稿不应污染下游记忆/设定库；填表是 confirm 的副作用，而非 write 的副作用。生成仅落库（status=completed），待 AI 智能体逐章确认后才回填表格。

这条原则（**未审视草稿不污染记忆库**）是 round-1 数据完整性的核心护栏。然而 **refine 与 continue 两条路径并未同步该原则**：

- refine/route.ts:201-209：生成后立即 `await safeFillAfterWriting(...)`；
- continue/route.ts:250-258：生成后立即 `await safeFillAfterWriting(...)`；
- 而 confirm PATCH（[id]/route.ts:183-191）在确认时**又会再调一次** `safeFillAfterWriting`。

后果有三层：
1. **原则破坏**：refine/continue 生成的草稿在用户审阅前就已把事实写进结构化表格 / 记忆库，与 write 路径的"确认后才填"自相矛盾；
2. **双重填表**：一个经 refine 生成、再手动确认的章，会填表两次（refine 一次 + confirm 一次），浪费 LLM 调用，且 `babyloreFill` 在频率/跳过未命中时可能写入重复事实；
3. **溯源缺失**：refine/continue 调用 `safeFillAfterWriting` 时**未传 `source`**（见 F-07），`_src` 字段缺来源，破坏了 round-1 建立的"填表溯源单链路"。

根因清晰：架构重构时只改了 write 路径，漏改 refine/continue 的内联填表。这不是新功能 bug，是**重构残留的不一致**。建议：把"填表"统一收口到 `applyConfirm` / confirm 副作用，refine/continue 删除内联 `safeFillAfterWriting`；若担心 refine 即时反馈，可在 confirm 侧加"已填则跳过"的幂等判断。

### 2.2 IMP-024 批量角色卡"持久化断链"——修复只做了一半（F-02，P1）

IMP-024 的本意是"批量生成复用单章角色卡调度逻辑，带当前抽中卡 + 上次 PreGen 确认的角色 / 新角色约束，避免批量章不带角色约束导致质量不一致"。实现端（page.tsx:804-816）确实加了"读取"逻辑：

```ts
const pregenPersisted = JSON.parse(localStorage.getItem(`pregen-conf-${project.id}`) || "{}");
const batchConfirmedCardIds = drawSelectedCharIds.length > 0 ? drawSelectedCharIds : pregenPersisted.selected ?? [];
const batchNewChars = pregenPersisted.newChars ?? [];
```

但**全仓 grep 确认：`pregen-conf-${project.id}` 这个 key 从未被写入**。PreGenConfirm.tsx 的 `onConfirm(confirmedIds, {}, newChars, localAuthorNote)`（line 102）直接回调父组件，**不落地 localStorage**。于是：
- 用户走**主路径 PreGenConfirm** 确认的角色 / 新角色，**根本不会**被批量生成读到；
- 批量生成只在"本会话内用「抽卡选章纲」draw 过卡"时（`drawSelectedCharIds` 非空）才带约束；
- 否则 `batchConfirmedCardIds` 为空 → `filterByConfirmedCards` 返回**全部角色**（pre-processor.ts:68-69），即"无约束"，IMP-024 想解决的"质量不一致"并未真正解决。

这是一处**死掉的持久化链路**：读取端在，写入端缺失。IMP-024 对主路径实际无效。修复成本低：在 `handleWriteConfirmed` 包装处（或 PreGenConfirm 内）写 `localStorage.setItem('pregen-conf-'+project.id, JSON.stringify({selected,newChars}))` 即可；更稳妥的是让批量直接复用组件 state 中最近一次 PreGen 入参。

### 2.3 "自动确认"孤悬与伏笔检测覆盖不全（F-03 / F-04，P2）

- **F-03**：`autoConfirmEnabled` 只是"允许系统判定"的开关，并无"生成完成后自动跑一次 auto-confirm"的订阅。命名"自动确认"误导，引导文案过度承诺（见 1.2）。
- **F-04**：IMP-007 的"确认通过后异步触发伏笔收束率检测"**只在手动 confirm PATCH 挂载**（[id]/route.ts:216-225 `void fetch('/api/foreshadowing/detect')`），而 `auto-confirm` 端点（auto-confirm/route.ts，走 `applyConfirm`）与 `batch-confirm` 均**不触发** `detectPayoffs`。后果：用户走"智能交付全书"（auto-confirm）定稿的章，伏笔收束率不会被刷新；人工确认与自动确认在伏笔检测上行为不一致。建议把 `detectPayoffs` 的 fire-and-forget 统一挂进 `applyConfirm`（confirm-guard.ts:100），所有确认路径一致触发。

### 2.4 性能与浪费：每次确认全量重扫全书伏笔（F-05，P2）

手动 confirm 每次都 fire-and-forget 调用 `detectPayoffs(projectId)`，而 `detectPayoffs` 会扫描"埋设点之后的全部章节摘要"（foreshadowing.ts）。这意味着：
- 单章确认成本 = O(全书章数)；
- 整本 N 章逐章确认累计 = **O(N²)** 的摘要扫描 / 语义比对；
- 且 confirm 路由**完全丢弃 detectPayoffs 的返回值**（只 fire 不读），纯成本、无即时反馈。

对百章长篇，这是可观的 LLM / 计算浪费，且是静默的（用户无感知）。建议：detectPayoffs 改为**增量**（仅扫描本章之后新增摘要）或**节流**（仅当新增埋设点时触发），并把 `fulfillmentRatio` 在 MonitorPanel 给出可见反馈，让这次扫描"物有所值"。

### 2.5 代码清晰度与溯源细节（F-06 / F-07，P2）

- **F-06（死变量 + 误导注释）**：write/route.ts:74 `const isLatestChapter = currentNodeIndex === data.allNodes.length - 1;` 计算后**从未使用**（write 不再调 safeFill），且注释称"用于'跳过最近一章'的自动填表判断"——纯误导。应删除。
- **F-07（溯源缺 source）**：refine/route.ts:201-209、continue/route.ts:250-258 调 `safeFillAfterWriting` 漏传 `source`（loop.ts:100/168 设计需 `auto-confirm/manual/batch`），导致填表行 `_src` 缺来源，破坏 round-1 溯源增强（P5）。补 `source: "refine" / "continue"` 即可。

### 2.6 批量生成计数虚报与失败静默（F-08，P2，详见 1.4）

`handleBatchGenerate` 完成 toast 用 `ids.length` 而非实际成功数，且 `progress` map 用后丢弃、失败无汇总。属"乐观但失真"的反馈缺陷，批量场景尤甚。

### 2.7 continue 节点创建：order 冲突与标题污染（F-09 / F-10，P2）

- **F-09**：continue/route.ts:47 `nextOrder = currentIndex + 1`，若同层已存在该 order 的兄弟节点则产生**重复 order**；且 continue **不重排兄弟**（DELETE 路径会重排，continue 不），潜在编号错乱 / 排序异常。建议用 `max(order)+1` 或创建后重排。
- **F-10**：标题续接正则只匹配"数字结尾"标题，对非数字结尾标题退化为 `X（续）` 并累积污染（见 1.5）。

### 2.8 版本号双真相与 DELETE 重排类型耦合（F-11 / F-12，P2）

- **F-11**：`package.json` 的 `version` 仍是 `"0.1.0"`（package.json:3），而真实版本由 `src/lib/changelog-data.ts:28` `LATEST_VERSION = "v1.6.4"` 维护。两套版本真相，`npm version` / 发布链路版本失真。建议统一或发布脚本注入。
- **F-12**：DELETE 路由重排顶层节点（[id]/route.ts:288-308）时，对 `parentId===null && type!=="volume"` 的所有节点（含 scene）**统一套 `第N章` 标题模板**（line 300-303）。顶层 scene 会被错误改名为"第N章"（应为"场景 / 第N节"），重命名逻辑与节点类型耦合不全。建议按 `type` 生成对应前缀。

### 2.9 监控与测试盲区（本轮方法论结论）

- **测试**：238 例全绿、tsc 零错，护栏单测（`confirm-guard`、`maybe-auto-deliver`）覆盖扎实。但**端到端写章主闭环（含 LLM 真实生成 → 确认 → 交付）无自动化 E2E**（受 LLM/DB 依赖限制），refine/continue 双填、批量虚报等问题正是 E2E 缺失下的盲区。建议补一条"mock LLM"的写→确认→交付集成测试，锁住 F-01/F-08 类回归。
- **监控**：MonitorPanel 对 `autoRate` 有 `confirmed>0` 守卫（避免 NaN，MonitorPanel:105），防御到位；但伏笔 `fulfillmentRatio` 在自动确认路径不刷新（F-04），看板数据存在"半真"风险。

---

## 一·补、二·补：写章主闭环逐环节体验清单 + UI 九维评价 + 状态机与数据一致性时序 + 性能与测试复盘

> 为达成"用户体验视角（5000-6000 字）+ 总体视角（4000-5000 字）"双栏并行的体量要求，并让结论更可被工程团队直接消费，本节对上文做**逐项深化**。所有深化均锚定前文已给的文件:行号，不引入新臆测。

### A. 主闭环逐环节"卡顿 / 报错 / 空响应 / 静默失败"清单（用户体验视角深化）

把"建项目 → 写章 → AI 生成 → 确认 → 整本交付"拆成五个环节，逐一记录从源码契约推演出的失败模式（受沙箱限制，真实 LLM 生成未跑，下列为**基于代码路径可复现的失败点**，交本地 dev 验证）：

1. **建项目环节**：`loadSample`（page.tsx:753）走 `POST /api/seed/sample-project`。若种子接口异常，catch 仅 `toastError("载入示例失败")`（line 765），不区分"网络错误 / 服务端 500 / 项目已存在"。对想快速上手的新用户，失败原因不透明。**空响应风险**：若接口返回 200 但 `d.id` 为空（异常分支），line 757 `if (res.ok && d.id)` 不成立，落入 else `toastError(d.error || "载入示例失败")`，尚算兜底；但首屏无"示例 vs 空白"主动对比，冷启动摩擦已在 1.1 点出。
2. **写章环节**：`handleWriteConfirmed`（page.tsx:687）→ `streamSSE('/api/generate/write')`。写入前 `loadGenerationContext`（write/route.ts:45）若 `!data.project || !data.currentNode` 返回 404（line 46-48）。前端 `streamSSE` 在 `res` 非 ok 时**没有专门分支**——它直接 `res.body?.getReader()`（page.tsx:584），若 404 响应无 body 流，`reader` 可能为 null → 抛 `无法获取响应流`（line 585），再被外层 catch 吞成"生成失败"（line 683）。即：**后端 404 在前端被翻译成"无法获取响应流"的笼统报错**，丢失了"项目或节点不存在"的精确语义。这是错误提示链路的一次信息损耗。
3. **AI 生成环节**：token 流顺畅（page.tsx:599）。但两类失败值得注意：
   - **空响应**：write/route.ts:313-327 已对 `fullContent` 为空显式 `send error` 并回滚到 `outline_only`，这是 round-1 后扎实的修复（不再静默 done），好评；
   - **中途 LLM error 事件**：page.tsx:675 的 `event.type === "error"` 只 `console.error` + 置内部态 `genStep="error"`，**但未见对应 UI 提示分支**（搜索 page.tsx 无 `genStep === "error"` 的渲染分支）。即生成中途报错时，用户看到正文区停住、控制台红字，**界面上无可见失败 toast**。这是错误提示盲点，已在 1.6 点出，此处强调其"静默失败"属性。
4. **确认环节**：单章 confirm toast 诚实（ChapterConfirmBar:144-157，已评）；但"智能交付全书"在 `autoDeliver` 开启路径无成功 toast（1.3 点出），属"成功反馈不一致"的静默。
5. **整本交付环节**：`confirmProject`（ChapterConfirmBar:173-184）在 409（仍有未确认章）时 `toastError(d.error)`；但 `smartDeliver` 在 `autoDeliver` 开、无拦截时只 `onAction()`（line 207），无"已交付"收尾语，仅靠底部横幅（404-408）间接告知。老用户完成整本后缺一句明确的"整本已确认交付 🚀"。

综上，**静默失败 / 反馈失真**集中出现在三处：① SSE 中途 error 无界面提示（1.6/3）；② 批量生成成功数虚报（F-08）；③ 自动交付成功无 toast（1.3）。这三处共同构成"用户以为成了、实际未必"的信任风险，是 round-2 必须推动修复的高价值体验债。

### B. UI 九维评价表（用户体验视角深化）

| 维度 | 现状 | 评级 | 证据 / 需目测项 |
|---|---|---|---|
| 按钮文案 | 克制准确，"确认通过/打回重写/AI诊断"语义清晰 | 良 | ChapterConfirmBar 各按钮 |
| 空状态 | 大纲空、监测失败、无正文均有占位文案 | 良 | ChapterConfirmBar:310-312、MonitorPanel:74 |
| 错误提示 | API 失败有 toast；但 SSE 中途 error 无界面提示、404 被译为笼统报错 | 中 | page.tsx:675、585 |
| 对比度 | CSS 变量语义合理；危险色 `/40` 深底可能偏暗 | 需本地目测 | 全部 `text-[var(--nv-danger)]` |
| 响应式 | 三栏布局；断点观感未知 | 需本地目测 | workspace 布局 |
| 禁用态 | `disabled={busy}` / 理由必填才解锁，防误触 | 良 | ChapterConfirmBar:326 |
| 加载态 | 三点脉冲、扫描中…，克制 | 良 | page.tsx:903、ChapterConfirmBar:361 |
| 反馈一致性 | 保守模式有 toast、自动模式靠横幅，成功反馈不一 | 中 | ChapterConfirmBar:200-208 |
| 可达性 | 折叠态默认收起、localStorage 记忆偏好，减少遮挡 | 良 | ChapterConfirmBar:57-68 |

**结论**：UI 的"静态可达性 / 文案 / 禁用态"完成度高；短板在"动态失败可见性"与"成功反馈一致性"，且所有纯视觉项需本地 dev 目测（F-13）。

### C. 写章状态机与三路径数据一致性时序（总体视角深化）

写章节点的五态机：`outline_only → drafting → completed → pending_confirm → confirmed`（`src/core/story-status.ts:21-26`），外加遗留态 `reviewing`（v0.46.90 前，auto-confirm 路由显式跳过，auto-confirm/route.ts:62-65）。围绕"自动填表"这一副作用，三路径时序如下（文字版时序图）：

- **write 路径**：生成落库 `completed`（write/route.ts:290）→ 用户/系统 confirm → PATCH confirm 调 `safeFillAfterWriting`（[id]/route.ts:183）→ 状态 `confirmed`。**填表只发生一次，在确认闸门后**。✅ 符合"未审视不污染"原则。
- **refine 路径**：生成后立即 `safeFillAfterWriting`（refine/route.ts:201，state 仍 `completed` 或 `drafting`）→ 用户 confirm → PATCH confirm **再调一次** `safeFillAfterWriting`（[id]/route.ts:183）。**填表发生在确认前（污染未审视草稿）+ 确认后再填一次（双填）**。❌ 与 write 不一致（F-01）。
- **continue 路径**：新建节点 `drafting` → 生成后立即 `safeFillAfterWriting`（continue/route.ts:250）→ 若用户 confirm → 再填一次。❌ 同 refine（F-01）。

**数据一致性风险点**：
- 时序错位是根本问题——refine/continue 在"草稿态"就写记忆库，违反了 round-1 确立的"确认后才回填"契约；
- 双填造成 `babyloreFill` 可能写入重复事实行（即使有 `markChapterFilled` 防重，也只防 `fill-all` 跳过，不防同章二次抽取）；
- `source` 缺失（F-07）使 `_src` 在 refine/continue 路径无法溯源，round-1 溯源单链路（P5）局部断裂。

修复策略只有一个正确方向：**把填表彻底收口到 confirm 闸门**（applyConfirm / PATCH confirm / batch-confirm / auto-confirm 共用），refine/continue 删除内联填表。这样三路径时序统一为"生成→（可选审阅）→确认→填表"，与 write 一致，双填自然消失。

### D. 性能瓶颈复盘（总体视角深化）

除 F-05（每次确认全量重扫伏笔 O(N²)）外，另有两处隐性成本：

1. **pre-write-cards 的 O(节点×角色) 扫描**：pre-write-cards/route.ts:78-83 对每个节点遍历全部角色做 `content.includes(c.name.toLowerCase())`，line 86-89 再对角色遍历 outlineText。对百章 × 五十角色 = 5000 次 `includes`（每次对整章正文做子串匹配），虽未到瓶颈，但**每次打开生成前卡片都全量扫一遍全部已生成章正文**，随书稿增长线性变重。建议：对已出场角色做缓存 / 倒排，或对长正文截断后再匹配。
2. **recall 召回的全量 lore 匹配**：`buildRecallBlock`（loop.ts:52）对每章生成都 `recallContext` 匹配全部 lore + table，line 56-60 按 score 排序后 `slice(0,12)`。lore 条目数百时每次生成都全量匹配，属 O(lore) 每章。对长篇高产用户，建议在项目级做 lore 向量 / 关键词索引，而非每次线性扫描。

这两处与 F-05 共同指向一个主题：**写章主流程的"每次生成 / 每次确认"都隐含全量扫描**，随书稿规模呈线性甚至平方增长。当前百章以内无感，但长篇（300+ 章）会成为真实瓶颈。建议 round-3 立项"写章主流程规模化"专项。

### E. 测试与监控盲区复盘（总体视角深化）

- **单测**：238 例全绿、tsc 零错，护栏单测（`confirm-guard`、`maybe-auto-deliver`、`fill.ops`、`fill.selfcheck`）覆盖扎实，证明 round-1 的"阈值单一真相 / 幂等 / 自动交付判定"逻辑可靠。
- **E2E 缺失**：写→确认→交付主闭环无 mock-LLM 集成测试，refine/continue 双填（F-01）、批量虚报（F-08）、自动确认孤悬（F-03）正是 E2E 缺位下的盲区。建议补一条 `vitest` 集成测试，用 mock `AgentOrchestrator.writeSection` 返回固定 token，断言"refine 路径在 confirm 前不应写 memory 表 / 确认后恰好写一次"，直接锁死 F-01。
- **监控半真**：MonitorPanel 对 `autoRate` 有 `confirmed>0` 守卫（避免 NaN，MonitorPanel:105），防御到位；但伏笔 `fulfillmentRatio` 在自动确认路径不刷新（F-04），看板存在"半真"风险。建议监控面与代码路径对齐：凡确认路径都触发 detectPayoffs，看板数据才全网一致。

### F. round-1 五条 IMP 的"防回归"结论（总体视角深化）

结合 C/D/E，对 round-1 重点 IMP 给出防回归判定：
- IMP-002（isLatestChapter）：四处算法一致（`order===maxOrder`），且本次确认 guard 的 `evaluateConfirmEligibility` 单测（confirm-guard.test.ts:5 例）绿，**防回归坚固**；
- IMP-004（确认 toast 依真实 fill）：分四类文案逻辑清晰、单测虽未直接覆盖 UI toast，但服务端 `fillMsg` 三态已在 [id]/route.ts:138-144 与 ChapterConfirmBar:151-154 对齐，**无回归**；
- IMP-005（自动确认引导）：引导存在去重，但"自动定稿"措辞与 F-03 的"不自动触发"矛盾，**需软化或补触发**；
- IMP-007（detectPayoffs 触发）：仅手动 confirm 挂载，**auto-confirm 路径缺口（F-04）**，属部分回归；
- IMP-024（批量角色卡）：持久化写入端缺失（F-02），**主路径实质无效**，属 round-1 修复未完成。

**总评**：round-1 建立的"质量护栏 / 幂等 / 诚实 toast / 溯源"四大基石仍然稳固（tsc 零错、238 测全绿、算法一致），未出现"修东墙塌西墙"的硬回归；但**架构演进（填表移出 write）的同步遗漏**在 refine/continue 上制造了 F-01 这一核心不一致，且 IMP-024/IMP-007 的"后半段"（持久化写入、auto-confirm 挂载）未真正落地。本轮 round-2 的最高优先级就是补这两处"做了一半"的修复 + 统一填表闸门。

---

## 三、发现清单（结构化）

> 每条格式：`[编号] 严重度 + 文件:行号(精确锚点) + 现象 + 根因推测 + 建议修法`。全部可经源码 / 测试 / 本地 dev 复现。

**[F-01] P1 — 写章三路径"填表闸门"原则不一致（refine/continue 绕过 confirm 闸门 + 双填）**
- 锚点：`write/route.ts:329-331`（注释：填表已移至 confirm，write 不填）｜ `refine/route.ts:201-209`、`continue/route.ts:250-258`（生成后立即 `safeFillAfterWriting`）｜ `src/app/api/story/nodes/[id]/route.ts:183-191`（确认再次填表）
- 现象：refine/continue 生成的未审阅草稿在确认前就把事实写入记忆库，违反"未审视草稿不污染下游"原则；且经 refine 后再确认会**填表两次**。
- 根因：架构重构（填表移出 write）时只改了 write 路径，refine/continue 的内联填表未同步删除。
- 建议：① 把填表统一收口到 `applyConfirm` / confirm 副作用，删除 refine/continue 的内联 `safeFillAfterWriting`；② 若保留即时反馈，在 confirm 侧加"已填则跳过"幂等；③ 三路径行为对齐到同一份"确认后才填"契约。

**[F-02] P1 — IMP-024 批量角色卡持久化断链（读取端在、写入端缺）**
- 锚点：`src/app/workspace/[projectId]/page.tsx:806`（读取 `pregen-conf-${project.id}`）｜ `src/components/workspace/PreGenConfirm.tsx:102`（`onConfirm` 不落地 localStorage，全仓 grep 无 `setItem('pregen-conf'`)）｜ `page.tsx:815`（`drawSelectedCharIds.length>0 ? ... : pregenPersisted.selected ?? []`）
- 现象：走主路径 PreGenConfirm 确认的角色 / 新角色，批量生成读不到；批量仅在"本会话抽过卡"时带约束，否则退化为"全部角色、无约束"，IMP-024 想解决的"质量不一致"未真正解决。
- 根因：IMP-024 修复只加"读取"端，漏加"写入"端；`PreGenConfirm.onConfirm` 直接回调未持久化。
- 建议：在 `handleWriteConfirmed` 包装处（或 PreGenConfirm 内）`localStorage.setItem('pregen-conf-'+project.id, JSON.stringify({selected:confirmedIds, newChars}))`；或更稳：批量直接复用组件内最近一次 PreGen 入参 state。

**[F-03] P2 — "智能审阅（自动确认）"孤悬，引导文案过度承诺"自动定稿"**
- 锚点：`src/app/workspace/[projectId]/page.tsx:662-674`（写章 done 处理无 auto-confirm 调用，全局 grep 确认 page.tsx 无 `auto-confirm` 字符串）｜ `src/components/workspace/ChapterConfirmBar.tsx:124-132`（引导 toast："合格章将自动定稿"）｜ `ChapterConfirmBar.tsx:187-218`（auto-confirm 需手动触发）
- 现象：开关开着，写章完成后章节停在 `completed`，不会自动定稿，必须手动点「智能交付全书」或「人工接管」。用户的"自动"预期落空。
- 根因：`autoConfirmEnabled` 仅是"允许系统判定"开关，无"生成完成后自动跑一次 auto-confirm"的订阅；命名与文案过度承诺。
- 建议：① 在写章 done 后、若 `autoConfirm` 开则 fire-and-forget 调 `/api/story/nodes/auto-confirm`（单章）；② 或把引导文案改为"可一键自动定稿"，消除过度承诺。

**[F-04] P2 — IMP-007 伏笔检测仅在手动 confirm 触发，auto-confirm 路径缺失**
- 锚点：`src/app/api/story/nodes/[id]/route.ts:216-225`（手动 confirm 触发 `detectPayoffs`）｜ `src/app/api/story/nodes/auto-confirm/route.ts`（走 `applyConfirm`，不触发）｜ `src/app/api/story/nodes/batch-confirm/route.ts`（不触发）
- 现象：经"智能交付全书 / 自动确认"定稿的章，伏笔收束率不被刷新；人工确认与自动确认在伏笔检测上行为不一致。
- 根因：`detectPayoffs` 触发点只挂在手动 confirm 副作用，`applyConfirm` 未挂载。
- 建议：在 `src/core/confirm-guard.ts:100` 的 `applyConfirm` 内统一挂 `detectPayoffs` 的 fire-and-forget，使所有确认路径一致。

**[F-05] P2 — 每次确认全量重扫全书伏笔，O(N²) 浪费且返回值被丢弃**
- 锚点：`src/app/api/story/nodes/[id]/route.ts:216-225`（每次 confirm 全量 `detectPayoffs`，返回值未读）｜ `src/core/foreshadowing.ts:174`（`detectPayoffs` 扫描埋设点之后全部摘要）
- 现象：单章确认成本 O(全书章)，逐章确认累计 O(N²)；且 confirm 路由不读取返回统计，纯成本无即时反馈。
- 根因：检测设计为"每次确认全量重扫"，未增量 / 节流，也未把结果回流 UI。
- 建议：改为增量（仅扫本章之后新增摘要）或节流（仅新增埋设点时触发）；并把 `fulfillmentRatio` 在 MonitorPanel 展示，让扫描物有所值。

**[F-06] P2 — write/route.ts 死变量 `isLatestChapter` + 误导注释**
- 锚点：`src/app/api/generate/write/route.ts:74`（`const isLatestChapter = ...` 计算后从未使用；注释称"用于跳过最近一章的自动填表判断"，但 write 已不填表）
- 现象：死代码；注释误导维护者以为 write 仍做"跳过最近章"填表判断。
- 根因：重构残留（填表移出 write 后变量未删）。
- 建议：直接删除该变量与注释。

**[F-07] P2 — refine/continue 调 `safeFillAfterWriting` 漏传 `source`，破坏溯源单链路**
- 锚点：`src/app/api/generate/refine/route.ts:201-209`、`src/app/api/generate/continue/route.ts:250-258`（调用无 `source` 字段）｜ `src/core/babylore/loop.ts:100,168`（设计需 `auto-confirm/manual/batch` 溯源）
- 现象：refine/continue 填表行 `_src` 缺来源，与 confirm/batch/auto-confirm 的溯源链路不一致，round-1 溯源增强（P5）被局部破坏。
- 根因：调用方漏传 `source`。
- 建议：补 `source: "refine"` / `"continue"`。

**[F-08] P2 — 批量生成完成 toast 虚报成功数，失败静默吞掉**
- 锚点：`src/app/workspace/[projectId]/page.tsx:842`（`toastSuccess(\`批量写作完成：${ids.length} 章已生成\`)` 用所选数）｜ `page.tsx:818-839`（`progress` map 记 done/failed 但循环后丢弃，无失败汇总）｜ `page.tsx:821`（`node.status==="completed"` 被 `continue` 跳过仍计入总数）
- 现象：选 5 章、2 章已 completed 跳过、1 章失败，toast 仍报"5 章已生成"；失败章无任何逐条提示。
- 根因：计数用"所选"而非"实际成功"；`progress` 用后丢弃，失败未汇总。
- 建议：用 `progress` 统计实际 done/failed；失败时 toast 列出失败章数与标题，并保留选择不强行清空。

**[F-09] P2 — continue 新建节点 order 可能冲突，且不重排兄弟**
- 锚点：`src/app/api/generate/continue/route.ts:47`（`nextOrder = currentIndex + 1`）｜ 对比 `[id]/route.ts:287-309`（DELETE 路径会重排，continue 不）
- 现象：同层已存在该 order 的兄弟节点时产生重复 order，潜在编号错乱 / 排序异常。
- 根因：仅按 `index+1`，未查重；continue 不重排兄弟。
- 建议：用 `max(order)+1`，或创建后对其他兄弟重排。

**[F-10] P2 — continue 标题续接正则只匹配"数字结尾"，非数字标题污染成"X（续）（续）"**
- 锚点：`src/app/api/generate/continue/route.ts:51-55`（`match = title.match(/^(.+?)(\d+)$/)` 失败则 `title + "（续）"`）
- 现象："第3章""序章"等标题续写两次变"第3章（续）（续）"，标题累积污染，生成前不可预览纠正。
- 根因：正则假设标题以数字结尾。
- 建议：识别"第N章/第N节"并 +1；否则安全追加全局序号（如 `续-2`），避免嵌套"（续）"。

**[F-11] P2 — 版本号双真相（package.json 0.1.0 vs changelog-data v1.6.4）**
- 锚点：`package.json:3`（`"version": "0.1.0"`）｜ `src/lib/changelog-data.ts:28`（`LATEST_VERSION = "v1.6.4"`）
- 现象：`npm version` / 发布链路版本失真，与对外宣称 v1.6.4 不一致。
- 根因：两套版本真相，未统一。
- 建议：统一为单一真相源，或由发布脚本从 changelog 注入 package.json。

**[F-12] P2 — DELETE 重排顶层节点时对所有非 volume 顶层节点套"第N章"模板，scene 误改名**
- 锚点：`src/app/api/story/nodes/[id]/route.ts:288-308`（`if (node.parentId===null && (type==="chapter"||type==="section"))` 触发重排；line 300-303 重排时统一 `第${toCn(i+1)}章`）
- 现象：顶层 scene 被错误改名为"第N章"（应为场景 / 第N节），重命名逻辑与类型耦合不全。
- 根因：重排标题模板未区分 chapter/section/scene。
- 建议：按 `type` 生成对应前缀（章 / 节 / 场景）。

**[F-13] 方法论说明（非缺陷，需本地目测）— 沙箱无 Chromium，UI 视觉层无法穷举**
- 锚点：测试/运行环境限制（本沙箱无 Chromium，未启动常驻 Next/Postgres）。
- 现象：SSE 流式渲染、toast 收敛观感、确认栏折叠态、智能审阅开关联动、禁用态 / 危险色在深浅背景的**对比度是否达 WCAG AA**、响应式断点、动画——均无法在此真机目测。
- 说明：依诚实边界约束，上述纯视觉 / 动画 / 响应式细节统一标注「**需本地 `npm run dev` 目测**」，本报告未伪称已目测；代码层（CSS 变量语义、禁用态 `disabled` 绑定、错误态分支缺失）已尽量静态评估。

---

## 四、round-1 重点 IMP 复验明细

- **IMP-002（isLatestChapter 透传）**：confirm/[id]:171-181、batch-confirm:37-41/81、refine:197-200、continue:246-249 四处均用 `node.order === 项目最大 order` 判定，**算法一致，无回归**。✅
- **IMP-004（确认 toast 依真实 fill）**：ChapterConfirmBar:144-157 依 `reviewLogs[last].fill` 真实值分四类文案（已执行 / 未触发 / 失败 / 默认），**无回归，诚实落地**。✅
- **IMP-005（自动确认引导）**：引导存在且 `localStorage` 去重（ChapterConfirmBar:124-132），**但"自动定稿"文案过度承诺**（见 F-03），需软化措辞或补自动触发。⚠️ 部分问题。
- **IMP-007（detectPayoffs 写章触发）**：手动 confirm 触发（[id]:216-225），**但 auto-confirm / batch-confirm 路径不触发**（见 F-04），覆盖不全、与人工确认不一致。⚠️ 部分回归。
- **IMP-024（批量生成角色卡参数）**：读取端已实现（page.tsx:806/815），**但持久化写入端缺失**（见 F-02），主路径（PreGenConfirm）实际无效。❌ 实质断裂。

---

## 五、优先级建议（落地顺序）

1. **P1 先行**：F-01（三路径填表闸门统一）、F-02（批量角色卡持久化补写入）。两者都直接触及"数据完整性 / 生成质量一致性"这一写章主流程的核心承诺，且修复成本低、风险可控。
2. **P2 跟进**：F-03（自动确认过度承诺 / 或补自动触发）、F-04（伏笔检测统一挂载）、F-05（detectPayoffs 增量 / 节流）、F-08（批量计数与失败汇总）、F-09/F-10（continue order/标题）、F-06/F-07（死代码 / 溯源补 source）、F-11/F-12（版本双真相 / 重排类型）。
3. **测试补强**：新增"mock LLM"的 写→确认→交付 集成测试，锁住 F-01/F-08 类回归；当前 238 例单测全绿、tsc 零错，但 E2E 主闭环缺位正是本轮多处盲区的根源。
4. **视觉目测**：F-13 所列纯视觉项，移交本地 `npm run dev` 目测清单（对比度 / 响应式 / 动画 / 禁用态观感）。

---

## 六、补充：用户旅程双画像 + round-2 验收门禁（DoD）

### 6.1 新手小白旅程（首次使用，零世界卡）

小白带著"写一本校园恋爱轻小说"的目标进入。她的真实路径是：进工作区（空大纲）→ 点「看示例」载入示范（loadSample，page.tsx:753，顺利）→ 看完示例回自己项目 → 点「新建章节」命名"第1章：初遇" → 选中 → 点「续写 / 微调」→ PreGenConfirm 弹窗（人物可选 + 作者指令，page.tsx:1287）→ 确认 → 看 token 流式刷屏（顺滑，page.tsx:599）→ done toast "正文已生成并保存 ✓"（page.tsx:669）。

**小白在此处的三个真实摩擦**：
- 首屏没有"先看示例 vs 直接写"的主动对比，她靠运气点到了示例（1.1）；
- 她默认以为"智能审阅开着就全自动"，写完第 1 章发现没定稿，茫然去翻确认栏（F-03）；
- 她点「智能交付全书」后，因 `autoDeliver` 开启无成功 toast，只看到底部默默出现的"整本已确认交付"横幅，不确定自己是否操作成功（1.3）。

对小白，产品的"智能"感在前两步被两个静默点打折。修复 F-03（补自动触发或软化文案）+ 成功 toast 一致性，是提升新手留存的高杠杆动作。

### 6.2 高产老手旅程（日更三千字，百章长篇）

老手 A 君每日批量产出。他的路径：勾选 10 章 → 「批量生成」（handleBatchGenerate，page.tsx:794）→ 等进度 → 看 toast "批量写作完成：10 章已生成" → 去大纲翻发现其中 2 章是空的（生成失败被虚报，F-08）→ 重跑那 2 章 → 「智能交付全书」扫一遍定稿 → 偶尔「一键续写」补情节（continue，发现标题变"第3章（续）（续）"，F-10）。

**老手在此处的真实损耗**：
- 批量"成功"数虚报，他必须逐章人工核对，批量本应有的效率红利被抵消（F-08）；
- 他习惯用 refine 润色已写章，却不知 refine 已把草稿事实写进记忆库（F-01），某次重 roll 后发现设定表被临时稿污染，排查半天；
- continue 标题污染让他的章节树越来越丑，只能手动改名（F-10）；
- 百章后每次确认都触发全量伏笔重扫，他虽无感，但账单（LLM 调用）在涨（F-05）。

对老手，损耗集中在"信任成本"（虚报 / 污染）与"规模成本"（O(N²) 扫描 / 标题 / order）。F-01、F-08、F-05、F-09、F-10 是老手视角的 P1/P2 组合拳。

### 6.3 round-2 验收门禁（Definition of Done，供主 Agent 收口）

为避免"修了又漏"，建议本轮每条发现配可验证的 DoD：

| 发现 | 验收门禁（可测） |
|---|---|
| F-01 | 新增集成测试：mock LLM 跑 refine，断言 confirm 前 memory 表无新增行、confirm 后恰增一次；源码确认 refine/continue 已删除内联 safeFill |
| F-02 | 单测：PreGenConfirm 确认后 `localStorage['pregen-conf-<id>']` 存在；批量生成读取到该 selected |
| F-03 | 行为测试：写章 done 后若 autoConfirm 开，自动触发 auto-confirm 且章节转 confirmed；或引导文案改为"可一键自动定稿" |
| F-04 | 断言：auto-confirm 端点执行后 `detectPayoffs` 被调用（guard 内挂载），伏笔表刷新 |
| F-05 | 性能断言：detectPayoffs 增量模式下确认 N 章总扫描 ≤ O(N)（非 O(N²)）；MonitorPanel 展示 fulfillmentRatio |
| F-06 | tsc 零错 + grep 确认 write/route.ts 无 isLatestChapter 死变量 |
| F-07 | 断言：refine/continue 填表行 `_src` 含 `refine` / `continue` 来源 |
| F-08 | 批量失败章在 toast 中显式计数；progress 不丢弃；单测覆盖"部分失败"分支 |
| F-09/F-10 | 集成测试：连续 continue 两次，断言 order 唯一、标题不嵌套"（续）" |
| F-11 | 发布脚本注入 package.json version = LATEST_VERSION，CI 校验两处一致 |
| F-12 | 删除顶层 scene 节点后，其余顶层 scene 标题前缀为"场景/第N节"而非"第N章" |

门禁的核心思想：**每条修复都要有可自动断言的回归测试**，把本轮发现的"做了一半"类问题（F-02/F-04 即 round-1 的半截修复）锁死，防止 round-3 再次出现同类"持久化写入端缺失 / 挂载点遗漏"。

### 6.4 一句话总评

写章主流程在 round-1 之后**骨架稳健**（tsc 零错、238 测全绿、质量护栏 / 幂等 / 诚实 toast / 溯源四大基石牢固），但 round-2 暴露的是**"架构演进的同步遗漏"与"修复只做一半"两类软债**：F-01（填表闸门三路径不一致 + 双填）与 F-02（IMP-024 持久化断链）是必须在本轮闭环的 P1；F-03/F-04/F-05/F-08 等 P2 则共同指向"自动化的承诺与实现错位"和"规模化下的全量扫描浪费"两个系统性主题。把填表彻底收口到 confirm 闸门、补齐 IMP-024/IMP-007 的缺失半段、并给主闭环补一条 mock-LLM 集成测试，即可让写章主流程从"稳健但有缝"迈向"端到端可信"。这也呼应了本透镜反复强调的一句话：写章主流程的可靠性，不取决于主路径写得多漂亮，而取决于所有兄弟路径是否都被同一套契约与同一张测试网兜住。

*报告完。所有发现均锚定到具体文件:行号，可经源码阅读、tsc、vitest（238 例全绿）与本地 dev 复现。本透镜未执行真实 LLM 生成（受沙箱无 Chromium / 未启常驻服务限制），主闭环走查为基于源码契约与失败模式推演的重建式走查，纯视觉项已如实标注需本地目测。*
