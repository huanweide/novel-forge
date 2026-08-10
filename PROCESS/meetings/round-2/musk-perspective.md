# Novel Forge v1.8.10 → Round-2 系统级大改企划草案（musk-perspective · 第一性原理透镜）

> **报告头**
> - **Agent 代号 / 透镜职责**：musk-perspective —— 用第一性原理拍板方向：砍掉多余、收敛分叉、最短路径、数据模型对齐心智模型。
> - **轮次 / 任务**：round-2 系统级大改企划草案（所有人投票 + 企划）。当前版本 v1.8.10（Round-1 已完成 30 项小幅优化，含线索集硬编码示例清除、genExtra 文案修正、结局只读、保存文案去 jargon、网络轮询兜底）。
> - **入口**：`http://127.0.0.1:3001/workspace/577ed326-b241-4f67-9481-c9332cb03626`
> - **方法**：精读当前实现（`StorylineWorkbench.tsx`、`StorylineList.tsx`、`LeftPanel.tsx`、`src/core/pipeline/*`、`src/core/assembly/engine.ts`、`src/app/api/generate/continue/route.ts`、`DrawCards.tsx`、`page.tsx`）后，用第一性原理对三个问题拍板。**不修改任何文件，仅输出企划**。
> - **核心结论**：故事线的能力（注入写作、回写时间轴、抽卡绑定、续写引擎）已经 100% 存在，真正的缺陷是「故事线被当作被动上下文、从未成为写作驱动主轴」。大改方向不是再加东西，而是**把故事线从「被查看的模块」重构为「写作的驾驶舱」**。

---

## 0. 拍板结论（TL;DR）

| 问题 | 第一性原理拍板 |
|---|---|
| 1. 「用当前章节续写几章」指什么？是否接 awesome-novel？ | 指复用现有 `/api/generate/continue` 连续生成下一节，用真实章节验证「故事线是否驱动写作」。**不接 awesome-novel**——novel-forge 已有完整续写引擎，引入第二条写作系统=重复与脆弱。最短路径：给 continue 路由加 `storylineId`/`targetStage`，让每章明确推进某条线的某个七要素阶段。 |
| 2. 七要素到底怎么放？ | 砍掉 7 格固定表单，重构为**一条可读的因果链**（欲望▸阻碍▸行动▸结果▸意外▸转折▸结局）。查看态是叙事，编辑态点环就地改，下一个缺口自动成为续写目标。 |
| 3. 布局/写入整体怎么改？ | **砍掉模态弹窗**，故事线改为左栏 tab 内联详情；收敛「AI 生成」「标记完结」到单入口；新增「用这条线续写下一章」，形成「规划→写作→回写」单向闭环。 |

---

## 一、现状事实核查（基于代码，非猜测）

在拍板前，必须先确认「能力到底缺不缺」。核查结果：

1. **故事线已经注入写作上下文**。`context-loader.ts:88-92` 加载所有 `active` 故事线；`engine.ts:513-526 buildStorylineSection` 把七要素压成一条链「欲望→阻碍→行动…」注入 write/continue 的 prompt。即：七要素**已经**影响每一章生成。
2. **写作已经回写故事线**。`storyline-writer.ts` 把 orchestrator 算出的 `threadProgress` 写成 `MILESTONE` 事件；`plan-chapter.ts:155-196 applyChapterPlanToStorylines` 把每章规划回写到**所有** active 故事线。
3. **绑定机制已存在但仅抽卡在用**。`DrawCards.tsx` 接收 `storylineId`，`page.tsx:357-397` 把抽卡结果写进故事线的 `chapterBindings`，供 `plan-chapter.ts` 读取。
4. **续写引擎已存在**。`/api/generate/continue/route.ts:28-346` 自动建下一节节点、流式生成、后处理、回写，全程 SSE。

**结论**：novel-forge 不缺「故事线驱动写作」的零件，缺的是**把这些零件组装成一条以故事线为主轴的写作闭环**。当前故事线是「写完之后被动被读、写完之后被动被填」的配角，而不是「写之前定目标、写之中被驱动、写之后回写」的主角。这正是 Round-2 要改的本质。

---

## 二、问题一：「运用当前章节继续续写几章」指什么？是否接 awesome-novel？

### 2.1 「续写几章」的真实含义
用户原话的「用当前章节继续续写几章试探、多测试看效果」，本质是一句**测试方法学指令**：拿当前章节节点，调用 `/api/generate/continue` 连点几章，观察生成的章节是否真的被故事线（七要素/主线/支线）牵引。这是验证手段，不是新功能需求。

但验证会立刻暴露一个真问题：**当前续写不接收 `storylineId`**（`continue/route.ts:34-37` 只收 `currentNodeId`/`authorNote` 等），`buildStorylineSection`（`engine.ts:513-526`）只是把七要素作为**被动提示**塞进 prompt，没有任何「本章必须推进某条线的某个阶段」的强指令。所以「续写几章」目前是「自由发挥几章」，故事线只是背景板。

### 2.2 是否应接入 awesome-novel 的续写能力？——**不接**
第一性原理判断：
- novel-forge **已经有一套完整的续写引擎**：`AgentOrchestrator.writeSection` + `context-loader` + `engine.ts` 上下文装配 + `runPostGenerationPipeline` 后处理 + `safeFillAfterWriting` 填表 + `storyline-writer` 回写。它深度绑定 novel-forge 的数据模型（`StoryNode`/`Storyline`/`StorylineEvent`/抽卡/一致性引擎）。
- `awesome-novel` 是一个**独立的创作工作流技能系统**（设定→卷纲→章纲→提示词→写作→评审），其章节模型、提示词格式、后处理都与 novel-forge 的节点/事件模型不同。把它「接入」= 在 novel-forge 运行时里并行维护第二套写作引擎，两套引擎会争夺同一份 `StoryNode` 数据的写入权，制造不可调和的冲突。
- 这违反马斯克清单第 4 条（「因为别人这么做」而引入复杂）和第 1 条（是否必要）。**正确做法是让 novel-forge 自己的续写「吃」故事线，而不是再买一台机器。**

### 2.3 最短路径：让故事线直接驱动续写
- **后端**：`continue/route.ts` 增加可选 `storylineId` 参数；在 `buildStorylineSection`（`engine.ts:513-526`）之上新增「驱动模式」——当指定 `storylineId` 时，计算该线**下一个未填充的七要素**（欲望→阻碍→…→结局），把「本章目标：推进《线名》的『<阶段>』」作为高优写作指令注入 `writingInstruction`（`continue/route.ts:163-171`）。
- **前端**：在每条故事线（详情头部或 `LineNav`）增加「用这条线续写下一章」按钮，调用 continue 并带 `storylineId`。这把全局「续写」拆成「按线续写」，用户点哪条线，下一章就朝那条线的缺口走。
- **回写**：续写完成后 `storyline-writer.ts` 自动把该线进度写成 `MILESTONE`，时间轴更新；`plan-chapter.ts:155-196` 的「回写所有 active 线」噪声逻辑应改为**只回写被驱动的那条线**（避免每条章给每条线都塞事件）。
- **效果**：这样「续写几章」=「用主线连续推进几章」或「用某支线推进几章」，自然且可验证地测试故事线驱动效果，且零新引擎。

---

## 三、问题二：七要素到底怎么放（重构而非堆砌）

### 3.1 现状问题
七要素当前是**7 个固定格子**：编辑态 7 个 textarea（`StorylineWorkbench.tsx:679-689`）、查看态 7 张卡（`StorylineWorkbench.tsx:765-795`）。问题：
- 刚性：空值的格子用「—」占位，永远占屏，逼用户填表。
- 进度条虚假：`computeStorylineProgress` 把 0/6→6/6 折算成 0%→100% 连续进度条（`storyline-progress.ts:31`），暗示「故事完成度」。
- 与「驱动写作」脱节：七要素只是被展示，没成为续写目标。

### 3.2 信息架构最短路径：因果链（Causal Chain）
七要素的本质是**一条剧情因果链**，不是一张调查表。重构为 `SevenElementChain` 组件：
- **查看态**：渲染成可读叙事链
  `欲望：主角想救妹妹 ▸ 阻碍：妹妹是反派之女 ▸ 行动：… ▸ … ▸ 结局：待收束（徽章）`
  已填的显示内容；未填的显示为淡色虚位（如「待补：行动」），一眼看出缺口在哪。
- **编辑态**：**点链上某一环就地展开该环输入框**，不是一次铺开 7 个框。只改你要改的那一环。
- **结局特殊化**：结局不是输入框，是「收束/待收束」状态徽章（与 Round-1 已在 AI 草稿态做的「结局只读」一致，`StorylineWorkbench.tsx:507-513`）。
- **与写作联动**：因果链的「下一个缺口」自动成为「用这条线续写下一章」按钮的默认目标——七要素即章节生成计划。

### 3.3 before→after
| | before | after |
|---|---|---|
| 七要素呈现 | 7 张卡/7 textarea 常驻（`StorylineWorkbench.tsx:679-689,765-795`） | 一条 `SevenElementChain` 因果链，点环就地编辑 |
| 结局 | textarea 可填（编辑态）/「待收束」占位（查看态） | 收束状态徽章，不可手填 |
| 进度 | 0→100% 连续进度条 | 「已填 2/6 要素」文字徽章，不伪装完成度 |
| 与续写关系 | 无 | 下一缺口 = 续写目标 |

---

## 四、问题三：布局/写入整体重构最短路径

### 4.1 砍掉（明确清单）
1. **砍模态弹窗**：`StorylineWorkbench.tsx:382` 的 `<Modal>` 改为左栏「故事线」tab 内的**内联详情区**（与 Round-1 提出的 MUSK-04 一致，本轮落地）。模态锁屏与 v1.8.6 之后的真后台异步生成自相矛盾，必须消除。
2. **砍弹窗内第二套列表**：`StorylineWorkbench.tsx:819-888` 的 `LineNav` 是 `StorylineList`（`StorylineList.tsx:41-258`）的重复实现。去模态后，导航唯一用 `StorylineList`。
3. **砍详情头部「标记完结」按钮**：`StorylineWorkbench.tsx:729-746` 在 Round-1 未被砍。完成态是列表级轻操作，只留列表项圆形图标（`LineNav` 已含，`StorylineWorkbench.tsx:921-936`）。
4. **砍空时间轴常驻区块**：时间轴是写作自动回写（`StorylineWorkbench.tsx:797-823`），空时折叠为单行提示，不占屏。
5. **砍 `abandoned` 状态**：`StorylineWorkbench.tsx:658` 的「已废弃」选项。它与删除心智无差，却长期污染列表，改用删除/回收站。

### 4.2 保留（明确清单）
- `StorylineList` 作为**唯一**列表 + 展开/折叠 + 完成图标。
- 七要素因果链（重构形态，见第三节）。
- 线索集（CLUE）：作为每条线的轻量笔记区，**折叠 + 内联「添加线索」按钮**（Round-1 已把硬编码示例改成通用文案 `StorylineWorkbench.tsx:832`，保留）。
- AI 生成**单入口**（见 4.3）。
- timeline `MILESTONE` 回写（`storyline-writer.ts`）：这是「写作驱动故事线」的真实闭环，要**强化**而非砍。

### 4.3 收敛分叉
- **AI 生成入口**：删 `StorylineWorkbench.tsx:398-413` 的弹窗入口（去模态后自然消失），只留 `StorylineList.tsx:118-133` 一处；`genExtra` 作为该入口的可选展开输入框。
- **标记完结入口**：只留列表项图标一处。
- **三条创建路径**：保留「手动创建 `POST /api/storylines`」+「真后台任务 `/api/generation-tasks`」；**删除 `/api/storylines/generate` 的 LLM 分支**（`generate/route.ts:23-222`），其 commit 能力并入库路径 3 的结果提交端点，避免 prompt/解析逻辑双份维护（Round-1 已指出）。

### 4.4 写入闭环最短路径
去模态后的故事线 tab 体验：
```
左栏故事线 tab → 点一条线 → 右侧/下方内联详情（因果链 + 时间轴 + 线索集）
                                     ↓
                    点「用这条线续写下一章」→ 调 continue(storylineId)
                                     ↓
                    生成章节 → storyline-writer 回写该线 MILESTONE → 时间轴更新
```
一条**规划（七要素）→ 写作（续写驱动）→ 回写（时间轴）**的单向闭环，无弹窗、无第二列表、无分叉入口。

---

## 五、系统级大改 before→after 总表

| 模块 | 现状（文件:行号） | after | 动作 |
|---|---|---|---|
| 容器形态 | `StorylineWorkbench.tsx:382` 模态弹窗 | 左栏 tab 内联详情区 | **砍** |
| 导航列表 | `StorylineList.tsx:41-258` + `StorylineWorkbench.tsx:819-888` 两套 | 仅 `StorylineList` 一套 | **砍重复** |
| 七要素 | 7 卡/7 textarea（`:679-689,765-795`） | `SevenElementChain` 因果链，点环编辑 | **改** |
| 结局字段 | textarea 可填/占位 | 收束状态徽章 | **改** |
| AI 生成入口 | 列表 `:118-133` + 弹窗 `:398-413` | 单入口（列表） | **收敛** |
| 标记完结入口 | 列表图标 + 详情按钮 `:729-746` | 仅列表图标 | **收敛** |
| 时间轴（空） | 常驻区块 `:797-823` | 折叠单行 | **砍冗余** |
| abandoned 状态 | `:658` | 删除/回收站 | **砍** |
| 续写驱动 | continue 无 storylineId（`:34-37`） | continue 接收 storylineId，推进下一缺口 | **加** |
| 续写回写 | 回写所有 active 线（`plan-chapter.ts:155-196`） | 仅回写被驱动线 | **改** |
| 创建路径 | 3 条（POST /api/storylines、/generate、/generation-tasks） | 2 条（手动 + 后台任务） | **砍 1** |
| 故事线→章节绑定 | 仅抽卡用（`page.tsx:357-397`） | 统一为「用这条线续写」驱动 | **复用/统一** |

---

## 六、落地路径（分阶段，最短路径优先）

- **Phase 0 · 测试基线**：用当前章节 `/api/generate/continue` 连点 3 章，记录生成章是否提及/推进了某条故事线、时间轴是否回写。这是「多测试看效果」的基线，必须在改代码前留存。
- **Phase 1 · 去模态 + 收敛入口**：`StorylineWorkbench` 拆为 `StorylineDetail`（非 Modal），嵌入 `LeftPanel` 故事线 tab（`LeftPanel.tsx:124-126`）；删弹窗内 `LineNav` 与弹窗 AI 生成/标记完结。零新功能，纯减法，风险最低。
- **Phase 2 · 七要素因果链**：新增 `SevenElementChain` 组件替换 7 卡网格；结局改徽章；进度改文字徽章。
- **Phase 3 · 续写驱动故事线**：`continue/route.ts` 加 `storylineId`；`engine.ts` 增加驱动模式指令；`StorylineDetail` 加「用这条线续写下一章」；`plan-chapter.ts` 回写收窄到被驱动线。
- **Phase 4 · 清债**：删 `/api/storylines/generate` 的 LLM 分支；删 `abandoned`；空时间轴折叠；`chapterBindings` 与「续写驱动」统一语义。

---

## 七、测试方法论（呼应「多测试看效果」）

验证「故事线直接驱动续写」是否成立的硬性检查点：
1. 点「用这条线续写下一章」生成 3 章后，生成的章节正文是否明确推进了该线的**下一个未填七要素**阶段（欲望→阻碍→…）。
2. 该线的 `StorylineEvent` 是否新增对应 `MILESTONE`，时间轴是否增长。
3. 其他非驱动线的 `MILESTONE` 是否**不再**被无关章节污染（`plan-chapter.ts` 收窄后）。
4. 七要素因果链的「下一个缺口」是否随续写自动前移。
任一不达标，说明驱动指令强度不够，需在 `engine.ts` 把目标阶段提升为「最高优先级作者指令」。

---

## 八、第一性原理预判的反对意见与回应

- **反对「砍模态弹窗」**：「弹窗聚焦、不打扰写作。」→ 回应：故事线是高频轻编辑，不是导出/删除级重操作；弹窗锁屏与真后台异步生成矛盾，且弹窗内又套列表纯属冗余。聚焦可用「内联详情 + 高亮选中」实现。
- **反对「七要素改因果链」**：「7 卡网格更直观、能一眼看全。」→ 回应：对 0 填充用户，7 个空框是负担不是帮助；因果链只在有内容时展开，缺口显式标出，信息密度更高、与写作目标绑定。
- **反对「不接 awesome-novel」**：「别人有完整写作工作流，直接复用省事。」→ 回应：两个写作引擎争夺同一份 `StoryNode` 写入权，必然产生数据冲突与双倍维护；novel-forge 自己的引擎已能「吃」故事线，复用优于重写。

---

## 九、一句话拍板

**故事线的零件已经齐全，Round-2 不加法、只重构：砍掉模态与第二列表、把七要素压成一条因果链、让续写直接吃故事线——用最短路径把「被查看的故事线」变成「驾驶写作的故事线」。** 是否接入 awesome-novel：否。是否用当前章节续写几章测试：是，且测试应验证「续写是否真的被某条线的下一个七要素缺口驱动」。
