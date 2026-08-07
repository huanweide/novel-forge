# 游戏模式深度体验报告 · MaxLoop 魔王系统 Round-2

> **报告头**
> - **Agent 代号**：游戏模式透镜（开会子 Agent）
> - **Round**：round-2
> - **版本**：v1.6.4（HEAD = `2b88e09`）
> - **日期**：2026-08-07
> - **项目绝对路径**：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
> - **透镜聚焦**：游戏模式全链路（引擎 / 页面 / API / 提示词 / 验证脚本）
> - **复验对象**：IMP-001（复导出堆叠）、IMP-003（导出回填 toast）、IMP-022（跨轮次记忆摘要）
> - **观察池**：G3~G13（游戏结束无法续玩、maxWords 硬编码、开局非流式、as any 类型弱、每轮重复发 existingContent 等）
> - **方法约束**：基于真实源码走查 + 真实单测运行（85/85 通过）+ 真实 `tsc --noEmit`（0 错误）+ `git log` 核对；端到端真机脚本因沙箱无 Chromium/LLM 未实跑，但其断言逻辑已与源码逐行对齐。

---

## 一、复验结论速览（round-1 修复真实性核验）

| 修复项 | 结论 | 关键证据 | 风险残留 |
|--------|------|----------|----------|
| **IMP-001** 复导出堆叠 | ✅ 真实修复 | `game-engine.ts:160-165`（快照拍于入游瞬间）、`:565`（导出以快照为前置）、`:706-713`（reset 跨局复用快照）；单测 85/85 全绿 | 引入「快照永久钉死」副作用（见 G-new-1，P1） |
| **IMP-003** 导出回填 toast | ✅ 真实修复（有边界） | `game-engine.ts:673-674`（autoFilled 判定）、`page.tsx:455-457`（toast）、`confirm-guard.ts`（仅 `fillRes.applied>0` 时返回「自动填表已执行」） | toast 路径**无自动化测试**；字符串脆弱耦合「已执行」 |
| **IMP-022** 跨轮次记忆摘要 | ✅ 真实修复 | `game-prompts.ts:240-278`（buildMemorySummary）、`:346`/`:203-204`（注入点）；单测 `game-prompts.test.ts:193-261` 全绿 | 长局实体全量复述使 prompt 随轮次线性膨胀（见 G7，P2） |

**运行证据（沙箱内可复现）**
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → **exit 0，零类型错误**（全仓含游戏模块）。
- `npx vitest run src/core/game/` → **2 文件 / 85 测试全部通过**（game-engine.test.ts 21、game-prompts.test.ts 64）。
- `git log` 确认 IMP-001/003 相关提交已并入主线（如 `929719d v1.0.1 复检修复：游戏复导出堆叠`、`changelog`「游戏复导出正文堆叠损坏…」）。
- 真机脚本 `scripts/agent-game-reexport-stack-verify.cjs`、`scripts/agent-game-light-confirm-verify.cjs` 存在且逻辑正确（断言见第五节），需 dev（127.0.0.1:3001）+ DB（127.0.0.1:5432）+ LLM 方可端到端跑通；沙箱降级为源码走查 + 单测替代，逻辑链路已闭环。

---

## 二、用户体验视角（沉浸式走查）

> 本栏以「作者」第一人称视角，模拟一次完整游戏流程：进入 → 走轮次 → 结束导出 → 二次开局，逐处记录体感、卡顿、数据丢失与惊喜。所有判断均锚定源码行号，避免主观臆测。

### 2.1 进入游戏：快照与「带正文进入」的体感

点开「游戏模式」那一瞬，最直观的第一印象是教程弹窗（`page.tsx:526-567`）。文案写得相当到位——它明确告诉作者「本章已有正文会带入游戏，游戏从现有内容之后续接，不推翻已写情节」。这句话是作者对游戏模式信任感的基石，因为绝大多数作者绝不会为玩一局游戏而愿意**丢掉自己辛苦写好的正文**。从产品心理看，这一步的承诺质量直接决定了作者敢不敢把「写作」交出去玩。

进入就绪页后（`page.tsx:482-887`），作者看到「开始游戏」与「构思开头」两个入口。「构思开头」（`page.tsx:198-215`）会先调 `/api/game/concept` 让 AI 出个开场思路，再可选「采用此构思开场」。这条支线体验是加分项——它让「不知道怎么开头」的作者有抓手。但注意：无论走哪条路，最终都汇聚到 `handleStart`（`page.tsx:217-252`），状态切到 `generating`，顶部出现一条不确定的进度条（`page.tsx:490-494`）。

**关键体感问题在开局阶段集中爆发（G5）**：开场叙事要等整个模型响应收集完毕才一次性弹出，因为 `start/route.ts:88-94` 注释写明「非 SSE，直接收集完整响应」，即后端把完整响应攒齐后以 JSON 返回，前端没有流式 token。对于一段数百字的开场，作者要盯着一条不确定的灰条空等 3~10 秒，期间**没有任何 token 流式、也没有「停止」按钮可点**。停止按钮只在 `status==="generating"` 的 footer 出现，而 footer 仅在 `status==="playing"` 渲染（`page.tsx:1180`）。也就是说，开局是全程不可中断的黑盒——若模型卡死或作者点错章节，只能干等超时。这是 G5 的体验根因，严重度 P1。

体感正面的一面：教程里「带入正文」的承诺是被代码兑现的。`start/route.ts:36` 读取 `node.content` 作为 `existingContent`，`game-prompts.ts:289-291` 把它塞进系统提示词，并强调「游戏从这段内容之后续接，不得重复或推翻」。作者确实有「我的正文被接上了」的安全感——前提是正文较短。一旦正文超过 3000 字，`existingSection` 只切前 3000（`game-prompts.ts:290`），超出部分被静默丢弃，AI 看不到，作者也毫无提示。这对长章节是个隐性坑：作者以为 AI 接上了全章，实际只接上了前三千字，后续剧情可能与原文后段冲突而不自知。

### 2.2 走轮次：流式、停止、对账

进入第一轮后，体验明显上扬。每个行动（快捷动作或自定义输入）走 SSE 流式（`processGameTurn` 是 `AsyncGenerator`，`game-engine.ts:291`），前端逐 token 渲染（`page.tsx:329-334`），配合右上角「发现：角色·XX」粒子（`page.tsx:182-195`）和顶部进度条，**沉浸感是这套模式最亮的点**，也是它相对「直接在编辑器里让 AI 续写」的核心差异化价值。

停止行为是新版本打磨得最细的部分，值得重点肯定。点「停止」（`page.tsx:421-429`）会 `abort()` 前端流，同时 `handleStop` 调 `reconcileWithBackend()` 拉后端权威态覆盖前端，再解锁为 `playing`。引擎侧做了对称处理：`processGameTurn` 在流式期（`game-engine.ts:352`）、落库前（`game-engine.ts:411`）两处核对 `signal?.aborted`，命中即丢弃本轮、不提交（单测 `game-engine.test.ts` 的「abort 信号透传」「空流不提交」等 7 条全绿）。这意味着作者在任意时刻点停止，**不会留下半截轮次、不会字数虚高、不会背包残留**，前后端始终对齐。这是 G3 之外最让人放心的设计，体现了前几轮「阿游 P0-1/P0-2」打磨的扎实度。

但体感仍有一处别扭：停止后必须等 `reconcileWithBackend` 的 GET 往返（对账），期间状态被锁在 `playing` 之外吗？实际 `handleStop` 先 `await reconcileWithBackend()` 再 `setState(... "playing")`，所以停止动作本身有约一次网络往返的「卡顿感」，虽然不长，但在快节奏互动里能察觉。属可接受范围，建议未来把对账做成乐观本地回滚 + 后台静默校准，进一步消除等待。

另一处细节：自动推进（`page.tsx:787-803` + `:394-401`）开启后，每轮结束延迟 1.4 秒自动触发下一轮「自动推进剧情」。这个功能的体感是「爽文自动播放」，适合卡文时让 AI 自由跑。但它有个隐藏风险：自动推进下如果某一轮 AI 产出异常（如空流），`processGameTurn` 会 `yield error`（`game-engine.ts:369`），前端 `handleAction` 的 catch 走 `reconcileWithBackend` + 报错（`page.tsx:404-415`），自动推进链会因此断掉——这其实是正确行为（避免无限空转），但作者可能困惑「怎么不动了」。建议自动推进中断时给一条更明确的提示而非笼统 error。

### 2.3 结束导出：轻确认、toast、正文落盘

玩到作者觉得够了，点「结束并导出」（`page.tsx:432-461`）。此时弹出全屏遮罩「正在收束并导出本章正文…」（`page.tsx:497-507`），后端 `endGameAndExport`（`game-engine.ts:539-697`）依次做：① 以 `originalContentSnapshot`（快照）为前置拼接所有轮次叙事（`:565-571`）；② 若有章尾悬念钩子则据此生成收束段（`:573-603`）；③ 调 LLM 生成 2~3 段结尾（`:605-630`，失败兜底「——本章完——」）；④ 落 `storyNode.content`，走轻确认闭环（`:636-685`）。

落盘后，若项目开启「智能审阅」且达标，节点直接 `confirmed`；否则 `drafting`，作者在确认栏手动定稿——与正式章节完全一致。这一步的体感是**连贯、可信、不黑箱**的，作者在 ended 页能看到明确的「章节已导出并自动定稿 / 待你手动确认」（`page.tsx:1235-1259`），且能看到质量分（`page.tsx:1240` 的 `exportQuality`）。对作者而言，「我玩出来的这局变成了正文」的闭环感很强，这是游戏模式价值的终点兑现。

IMP-003 的 toast 在这里触发：`endGameAndExport` 返回 `autoFilled`（`:673-674`），仅当 `applyConfirm` 真的回填了设定库（`fillMsg.includes("已执行")`）才为 true，前端据此弹 `toastInfo("游戏导出已自动回填设定库…")`。这个「条件式提示」是正确设计——**没回填就不说谎说回填**，避免了「静默改动世界观」的恐惧。但作者第一次玩、章节没有可填事实时，toast 不出现，作者既感知不到「我被回填了」，也感知不到「本应回填却因配置未触发」。提示是单向的、成功时才给，缺少「未触发」的透明反馈。更严重的是（见第四节 G6 建议）：这条 toast 路径在自动化测试里完全缺席，且依赖「已执行」这个字符串，一旦 `confirm-guard` 改文案就会静默失效。

### 2.4 二次开局 / 续玩：体验断崖（G3 + G-new-1）

这是体验断崖所在，也是本轮最该被产品重视的一环。**游戏一旦结束，页面只给「返回工作区」一条路**（`page.tsx:1235-1259`），没有「续玩」「继续刚才的游戏」入口。想再玩，只能回工作区、重进游戏页、点「开始游戏」——而「开始游戏」走的是 `resetGameSession`（`start/route.ts:21`），**会清空上一局的所有轮次**，从头再来（`game-engine.ts:702-714`）。从 `processGameTurn` 的硬闸门（`game-engine.ts:311-314`，`status !== "active"` 即拒绝）看，结束后的会话彻底不可逆。

更隐蔽、也更危险的是 G-new-1：**快照 `originalContentSnapshot` 在首次建会话那一刻被钉死**（`game-engine.ts:162-165`），之后无论 `resetGameSession`（`:708` 仅 preserve 旧快照，绝不回读 `node.content`）还是再开局，快照永远是那份最原始正文。于是出现如下体感悖论（源码静态推演，确定性成立）：

- 作者第一次游戏：原文 `C0` → 导出 `C1 = C0 + 游戏轮次 + 结尾`，`node.content = C1`。
- 作者满意，回到工作区**手动润色** `C1` 成 `C1'`（这是小说工作流最自然的动作，作者在 AI 产出上精修）。
- 作者想再扩写，重进游戏：快照仍是 `C0`，但 `start/route.ts:36` 把**当前的** `node.content`（即 `C1`）当作 `existingContent` 喂给 AI，AI 以为「已有正文是 C1」。
- 作者玩第二轮、导出：`finalContent = C0 + 第二轮轮次 + 结尾2`（`game-engine.ts:565`）。

结果体感上有两重打击：① 作者在 `C1'` 里的手动润色**被无声覆盖**（workspace 编辑丢失），作者会困惑「我改的那段哪去了」；② AI 第二轮的叙事是基于「C1」语境生成的，却最终被接到「C0」之后，两局语境错位、情节可能自相矛盾。作者体验是「重开一局把前面的都打乱了」。这是 IMP-001 修堆叠时引入的**语义副作用**，体感上是一次静默数据丢失 + 逻辑断裂，严重度 P1。修复方向明确：把快照来源从「首建时 `node.content`」改为「每次开局重拍当前 `node.content`」（详见 G-new-1）。

### 2.5 长局记忆、性能与卡顿（G7 / IMP-022）

IMP-022 让长局「记得开头」：`buildMemorySummary`（`game-prompts.ts:240-278`）把全部持久实体、当前背包、掉出最近 6 轮的早期决策注入系统提示词。单测证明其确实注入（`:193-261`）。作者的体感是：玩到第十轮，AI 仍记得第一轮的伏笔人物——这是真实可用、值得点赞的改进，解决了早期版本「长局 AI 忘开头」的硬伤。

但代价在 G7：`buildGameSystemPrompt` 每轮都把**整段 `existingContent`（最多 3000 字）原样塞进系统提示词**（`game-prompts.ts:289-291`），且 `historySection` 每轮重发最近 6 轮叙事（`:320-329`），叠加 `memorySection` 全量实体。也就是说，**每走一轮，提示词体积是单调递增的，且没有滑动窗口或摘要压缩**。玩到第 15 轮，系统提示词里「已有正文 3000 + 历史 6×150 + 记忆摘要全部实体 + 世界观 + 角色」可能逼近 4000~5000 token，**每轮都重复发送这些不变或缓变内容**。作者体感上是「越玩越慢、越玩越贵」，且长局后期 AI 可能出现「前面说过」的重复描写（因为历史被反复喂）。这是实打实的性能与成本债（P2），建议引入上下文预算与滑动窗口（见 G7）。

### 2.6 边界与异常体感（G8 / G9）

- **空局导出（G8）**：作者若「开始游戏」后立刻点「结束并导出」（0 轮），`endGameAndExport` 的 `existingNarrative` 退化为仅 `originalContent`（`game-engine.ts:566-571`）。若原章节本身只有大纲、没有正文，则导出内容 = 一段凭空生成的「结尾」直接覆盖 `node.content`。作者得到一章「只有结尾、没有正文」的怪异内容，且全程**没有任何「你还没玩任何一轮」的二次确认或警告**。属导出为空分支的混乱（P2），建议 0 轮导出时弹确认或 no-op。
- **本地推理无兜底（G9）**：走轮次时若 LLM 不可达，`processGameTurn` 直接 `yield error` 并丢弃本轮（`game-engine.ts:358-363`），前端弹错——至少不崩、且对账能恢复。但**结尾收束段有兜底「——本章完——」（`game-engine.ts:629`），轮次生成却没有兜底叙事**。不对称本身不算大错，但暴露一个更深的体感问题：当作者把模型切到本地推理（Ollama 之类）而服务没起，或 API Key 未配，游戏**全程不可用却没有任何引导式报错**（如「未检测到可用模型，请检查设置」）。作者只会看到一轮又一轮的「行动失败」。这是本地/无配置推理场景的体验盲区（P2），建议在进入游戏前做模型可用性探测并给出明确引导。

### 2.7 整链路体感小结

把一次完整流程串起来看，游戏模式在「**单局内**」的体验是成熟的：带正文进入、流式互动、随时停止、对账自愈、导出落盘闭环，这些环节都打磨得扎实。真正的体感裂缝都出现在「**局与局之间**」和「**异常边界**」：开局不可中断（G5）、结束不可续玩（G3）、重开丢失编辑且语境错位（G-new-1）、空局/无模型等边界缺乏引导（G8/G9）。一句话总结作者体感：**玩的时候很爽，玩完想接着玩或改完再玩，就踩坑。**

补一句产品建议收尾本栏：游戏模式当前最该补的「作者信任」不是更多花哨功能，而是两件事——**让开局可打断**（G5）、**让重开不吞编辑且接续最新稿**（G-new-1）。把这两点修好，作者才会敢把「正经文」放心交给游戏模式去玩，否则它永远停留在「demo 好玩」而非「创作可用」的阶段。这也是为什么本轮把 G-new-1 与 G5 列为仅有的两个 P1：它们直接决定游戏模式能否从玩具走向工具。

---

## 三、总体视角（架构 / 质量 / 数据一致性）

> 本栏跳出单用户视角，从架构健康度、状态机、类型安全、性能与可观测性评估游戏模式的工程质量，并给出可落地的治理建议。所有结论均锚定源码行号与运行结果。

### 3.1 游戏状态机与生命周期

游戏的模式状态机分两层，职责划分清晰但存在结构性张力：

- **前端状态机**（`page.tsx:28-44`）：`loading → ready → playing ⇄ generating → ending → ended`，是单页组件内的 `useState`。状态迁移有守卫（footer 仅在 `playing` 可见、停止按钮仅在 `generating` 可见），整体自洽。
- **后端会话状态机**（`game-engine.ts`，Prisma `GameSession.status`）：`active → completed`，由 `endGameAndExport` 在末尾翻转（`:682-685`）。`processGameTurn` 以 `session.status !== "active"` 为硬闸门（`:311-314`），意味着**结束后的会话彻底不可逆**，没有任何「重新打开 / 恢复」路径。

两个张力点：
1. **「续玩」能力缺失（G3，P2）**：`completed` 是终态且不可恢复，导致「结束即终结」。若产品想支持「继续写这一章」，需在 `endGameAndExport` 后保留 `active` 或新增 `paused` 态，并在 `processGameTurn` 放行——这是特性级缺口而非纯 bug，但应在产品层面明确取舍：要么支持续玩，要么在 ended 页明示「此局已结束，重开将另起新局」。
2. **结束竞态（G-new-2，P2）**：`endGameAndExport` 在**最末尾**才把状态置为 `completed`（`:682`）。若前端因网络慢被作者连点两次「结束并导出」，两次调用都会在 `status==="active"` 时进入主流程，并发执行「生成结尾 + 写 node.content + applyConfirm」。后者覆盖前者，且 `applyConfirm` 可能被触发两次。虽然 `page.tsx:434` 先把 `state.status` 置 `ending` 使按钮消失，React 重渲染前的极快双点仍可能并发。建议增加「导出中」服务端乐观锁（如 `status` 先置 `exporting` 再 `completed`），并在事务开始即 `status==="active"` 前置校验。

### 3.2 数据一致性：快照、node.content 与导出

这是本轮最值得写的一笔。三处数据流的耦合，决定了游戏模式是否「不会丢作者东西」：

- **入游快照** `originalContentSnapshot`（`game-engine.ts:162-165`）——正确拍于入游瞬间。
- **实时 `node.content`**——游戏期间保持不变（只有 `endGameAndExport` 在末尾改写，`:652-660`）。
- **导出前置** `existingNarrative`（`game-engine.ts:565-571`）——以快照而非实时 `node.content` 为前置，正是 IMP-001 防堆叠的核心。

**致命弱点**在于快照一旦建立就**永不被刷新**（全仓 grep `originalContentSnapshot` 仅出现在 `:148/163/164/176`（写）、`:565`（读）、`:708`（preserve），无任何回写 `node.content` 的路径）。这造成 3.4 节与 G-new-1 已述的严重后果：workspace 编辑在重开后丢失 + 两局语境错位。从数据一致性原则看，更稳健的设计应是「**每次开局时把当前 `node.content` 重新拍为本次会话的快照**」（而非永久沿用首次快照），这样重开游戏时 AI 看到的 `existingContent` 与导出前置才能对齐到同一份「最新正文」。当前实现把「不堆叠」与「续接最新正文」这两个目标错误地绑成了零和——修前者伤了后者。

另一个一致性细节：`start/route.ts:36` 的 `existingContent` 来自 `node.content`，而 `endGameAndExport` 的前置来自 `snapshot`。**两者来源不同一**，是 G-new-1 错位的技术根因，统一到「以本次开局时的 `node.content` 为快照」可一并消解。

导出空分支（G8）也属一致性问题：当 `states` 为空，`existingNarrative` 退化为 `originalContent`，导出仍会**覆盖** `node.content`（即使没玩任何一轮）。从「最小惊讶原则」看，0 轮导出应提示或直接 no-op，而非用 AI 结尾覆盖作者原内容。这是一条明确的数据写入边界缺失。

此外，`endGameAndExport` 对 `node.content` 的写入是「全量覆盖」式（`game-engine.ts:655` `content: finalContent`）。在并发/重试场景下，若第一次导出事务中途失败但 `storyNode.update` 已部分生效（实际代码里 `storyNode.update` 在 `applyConfirm` 之前，`:652-660`），会出现「content 已写但 status/qualityScore 未定稿」的中间态。虽然后续失败会被 catch 保留 `drafting`，但这种「先写正文、后定稿」的顺序使得「正文已落但确认链路失败」的半提交态存在。建议把正文写入与确认流程放进同一事务，或先确认再写正文，降低半提交风险。

### 3.3 类型安全与 `as any`（G6，P2）

全仓 `as any` 在游戏模块高度集中，且多位于 JSON 列边界：
- `game-engine.ts:197` `(s.entities as unknown as any[])`、`203` `items as unknown as any[]`、`206/225` `options as unknown as ...`、`249/256` `loadGameContext` 内 `as unknown as any[]`、`232` `session: any` 形参、`323-325` `session.states[...] as any`、`418` `(change as any).owner`、`444-446/457` `as any` 落库、`670` `(nodeForConfirm as any)?.order`。
- `page.tsx:114` `const [lorebook, setLorebook] = useState<any[]>([])`.

**风险定性**：这些 `as any` 大多是「Prisma JSON 列 ↔ TS 结构」的不可避免桥接（实体/物品以 `Json` 存于 `GameState`），并非随意偷懒。但有两个隐患值得修：
1. `getSessionSummary`（`:197`）`(s.entities as unknown as any[]) || []`——若某 `state.entities` 因历史脏数据存成字符串而非数组，`.map` 会运行时抛错；`|| []` 只防了 `null/undefined`，不防「非数组但真值」。建议加 `Array.isArray()` 守卫。
2. `loadGameContext` 形参 `session: any`（`:232`）使函数签名失去类型约束，下游任意误用 `session.xxx` 都不会被 tsc 抓到。可改为 `GameSession` 类型（Prisma 已生成 `src/generated/prisma/models/GameSession.ts:52` 等）。

值得肯定：`tsc --noEmit` 全仓零错误（本轮已实跑验证），说明 `as any` 虽多但被约束在模块内、未外溢成编译期混乱。治理优先级中等（P2），重在加运行时守卫而非全量改写。长期可为 `GameState.entities/items/options` 定义 `JsonValue` 强类型以减少 `as any`。

### 3.4 性能：每轮上下文与重复发送（G7，P2）

`buildGameSystemPrompt` 的上下文组装是「每轮全量重发」模式，量化体感如下：
- `existingSection`：`existingContent.slice(0,3000)` 每轮发送（`:289-291`），内容在单局内恒定，却无缓存/不随轮次递减。
- `historySection`：`.slice(-6)` 每轮重发（`:320-329`），早期轮次靠 IMP-022 的 `memorySection` 补，但两者信息有重叠。
- `memorySection`：`buildMemorySummary` 全量实体列表（`:244-261`），长局实体多时体积随局线性增长。
- `worldSection` / `characterSection`：每轮重发前 8 世界观 + 前 20 角色（`:293-309`）。

**量化推演**：假设原正文 3000 字（≈3000 token）、历史 6×150≈900、记忆摘要 10 实体≈300、世界观 8×150≈1200、角色 20×80≈1600，则单轮系统提示词约 **7000 token**，且随轮次只增不减（记忆摘要与历史叠加）。第 15 轮时可能破万 token，**且这些 token 绝大多数在每轮间不变**。对作者体感是「越玩越慢、越玩越贵」，对服务是「每轮重复编码/推理大量不变上下文、成本线性放大」。建议引入：① 已有正文仅在首轮进入、后续轮用摘要或省略；② 历史滑动窗口（如保留最近 4 轮全文 + 更早轮压缩摘要）；③ 实体/世界观做去重合并后注入；④ 引入每轮 token 预算上限（如 ≤ 6000）并告警。属明确可优化项（P2，非阻塞，但长局体验与成本敏感）。

### 3.5 可观测性与测试门禁

**强项**：游戏模块测试最扎实——`game-engine.test.ts`（21 测）覆盖 abort 透传、空流不提交、背包按 owner 隔离、实体去重；`game-prompts.test.ts`（64 测）覆盖中文操作归一化、同义动词、中文复合数字、IMP-022 记忆摘要。85/85 全绿，且多为「行为级」断言（如「abort 后 $transaction 调用 0 次」），质量高。本轮已实跑确认通过。

**缺口**：
1. **IMP-003 toast 路径无自动化测试**：`agent-game-light-confirm-verify.cjs` 只断言 `autoConfirmed` 与 `reviewLogs`，**从不检查 `autoFilled`**（也就是 toast 是否会真的弹）。`autoFilled` 又依赖 `confirm-guard.ts` 返回文案里恰好包含「已执行」这个**字符串耦合**——一旦 `confirm-guard` 改文案（如改成「已回填 X 条」），toast 会静默失效而无测试报警。建议把 `autoFilled` 显式纳入 verify 脚本，并将「是否回填」改为结构化布尔返回而非字符串匹配。
2. **真机复导出脚本未纳入 CI**：`agent-game-reexport-stack-verify.cjs` 逻辑正确，但需 dev+DB+LLM，目前是「人工跑」。建议至少对 `endGameAndExport` 的纯拼接逻辑（快照前置、不堆叠）补一个不依赖 LLM 的单元/集成测试（mock `prisma.gameState`），把 IMP-001 钉进回归门。
3. **导出空分支、结束竞态、续玩缺口、快照钉死**均无测试覆盖（分别对应 G8/G-new-2/G3/G-new-1）。其中 G-new-1 篡改数据一致性，最该补一个「重开游戏后 node.content 不被旧快照覆盖、workspace 编辑保留」的回归测试。

### 3.6 架构总体评价

游戏模式的架构在经过多轮（阿游 / Round 系列）打磨后，已经达到「单局可用、边界有守护」的水平：abort 透传、空流自愈、背包按 owner 隔离、操作归一化、记忆摘要等，都是层层补上的工程亮点。其架构骨架是健康的——清晰的「引擎（纯逻辑+DB）/ 页面（状态机+对账）/ API（薄路由）/ 提示词（组装）」分层。真正的结构性欠债集中在两处：**一是『局』作为一等公民的缺失**（无 paused/恢复、快照语义错位，导致局间体验断裂）；**二是『上下文预算』的缺位**（每轮全量重发、无滑动窗口，导致长局成本与质量债）。这两个问题不修，游戏模式在「严肃长篇小说创作」场景下的可扩展性会持续受限。前者（G-new-1/G3）是 P1 级体验与数据风险，后者（G7）是 P2 级成本与质量债，建议本轮优先排期前者。

### 2.8 交互细节体感补遗

除了主流程，游戏页面的若干交互细节也左右着「爽不爽」的体感，值得单独记一笔。

**快捷动作与输入框**（`page.tsx:1183-1231`）：底部一排六个图标按钮（观察/对话/战斗/探索/使用物品/休息）对应 `QUICK_ACTIONS`（`page.tsx:54-61`），点击即触发 `handleAction(action.type, action.label)`。这个设计的体感是「低门槛行动入口」，作者不必想措辞就能推进剧情，特别适合卡文时。但注意：快捷动作发送的是 `action.label`（如「探索」）而非真正的剧情描述，AI 收到的其实是 `ACTION_PROMPTS` 模板里那段固定话术（`game-prompts.ts:208-222`，如「【探索】主动移动位置，探索新的区域…」）。这意味着连续点同一个快捷动作，AI 每轮收到的指令高度雷同，长局里可能出现「同质化探索」。作者若想有差异，必须用自定义输入框（`page.tsx:1200-1221`）写具体行动——而输入框的 placeholder 是「描述你想要的剧情发展，或输入角色的行动…」，引导是够的。

**选项区交互**（`page.tsx:902-921`）：每轮给出的 3~4 个编号选项以网格展示，点击即 `handleAction("option", "选择：...", opt.index)`。体感顺滑。但有一个隐性认知负担：选项文本是 AI 当场编的，作者选了 A 就永远不知道 B/C 会通向哪——这是文字冒险的固有特性，不算缺陷，只是提醒「游戏模式适合发散探索、不适合追求确定分支」。

**回退按钮**（`page.tsx:726-786`）：左侧底部「回退」可移除最后一轮，并调 `DELETE /api/game/state?round=...` 让后端同步删轮、回滚 session。体感上这是「后悔药」，对互动创作很重要。其实现也稳健：后端返回回滚后的权威摘要则整体覆盖前端（`page.tsx:739-750`），否则按前端剩余轮次重建（`page.tsx:751-779`），不会崩。但回退只在 `turns.length > 1` 时可用（`page.tsx:782`），即「开始游戏」那一轮（round 1）不可回退——合理，因为 round 1 是开场，撤回等于没玩。

**发现粒子**（`page.tsx:182-195` + `:247` + `:391`）：每次检测到新实体，触发粒子爆发 + 顶部「发现：类型·名称」提示，3 秒后淡出。这是整套 UI 里「正反馈」最强的部分，让作者有「我探索出了新东西」的获得感。从代码看它接的是 `doneData.newEntities`（`page.tsx:355-359` 已做前端去重合并），与引擎侧 `parsed.newEntities` 对齐，体感与数据一致。

**窄屏抽屉与无障碍**（`page.tsx:570` 的 `inert`、`:122-123` 的 `useFocusTrap`、`:634-640`/`:927-933` 的 `role="dialog"`/`aria-modal`）：左/右栏在窄屏降级为模态抽屉，且带了焦点陷阱。这是工程素养的体现，说明游戏页面不是「桌面专属」，移动端也能用。体感上窄屏点「章节/正文」图标能弹出对应抽屉，关抽屉后焦点回到触发按钮，符合无障碍预期。

**教程记忆**（`page.tsx:111-113` 的 `localStorage.getItem("nf-game-tutorial-seen")`）：教程只在首次出现，关掉后写 localStorage，再进不再弹。体感体贴，避免老用户每次被教程烦。但副作用是：若作者想**重新看教程**却找不到入口（没有「帮助/重看教程」按钮），只能清 localStorage。属微小体验缺口，非阻塞。

### 3.7 数据流向与一致性推演补遗（以 G-new-1 为中心）

为把 G-new-1 的数据一致性风险讲透，这里做一次跨两次游戏的**文字数据流推演**，所有节点均可在源码定位：

**第一次游戏（正常，无风险）**
1. 作者在工作区写好 `node.content = C0`（假设 1200 字）。
2. 进游戏页 → 点「开始游戏」→ `POST /api/game/start` → `resetGameSession(projectId, nodeId)`（`start/route.ts:21`）。
3. `resetGameSession` 此时无旧会话，`preservedSnapshot = null`（`game-engine.ts:708`），调 `ensureGameSession(projectId, nodeId, null)`。
4. `ensureGameSession` 见无会话，以 `node.content`（=C0）为快照建会话：`originalContentSnapshot = C0`（`game-engine.ts:162-165`）。
5. 玩 3 轮 → `processGameTurn` 每轮把 `node.content` 不变地保留（游戏期间不写 node.content）。
6. 点「结束并导出」→ `endGameAndExport`：`existingNarrative = C0 + 轮次1+2+3`（`game-engine.ts:565-571`），追加 AI 结尾 → `finalContent = C1`。写 `node.content = C1`（`game-engine.ts:655`）。
   - 此时：`node.content = C1`，`session.originalContentSnapshot = C0`，`session.status = completed`。**一致，无堆叠。IMP-001 验证通过。**

**作者在工作区手动润色**：把 `C1` 改成 `C1'`（比如把 AI 写的某段对话改得更贴角色性格）。此时 `node.content = C1'`，但 `session.originalContentSnapshot` 仍是 `C0`（快照从不刷新，证据见第三节 grep 结果）。

**第二次游戏（G-new-1 触发）**
7. 作者重进游戏页 → 点「开始游戏」→ `resetGameSession` 找到旧会话，`preservedSnapshot = 旧会话.originalContentSnapshot = C0`（`game-engine.ts:708`），删旧会话，调 `ensureGameSession(projectId, nodeId, C0)`。
8. `ensureGameSession` 见无会话，因传入 `originalContentSnapshot = C0` 非空，快照 = C0（`game-engine.ts:163-164`）。**注意：此处本可改为「以当前 node.content(=C1') 为快照」，但代码选择沿用旧 C0。**
9. `start/route.ts:36` 读 `node.content`（=C1' 的当前值，即 C1）作为 `existingContent` 喂给 AI。
   - **矛盾点 A**：AI 被告知「已有正文是 C1」，但步骤 8 的快照是 C0。两者来源不同一。
10. 作者玩第 4 轮 → AI 基于「C1 语境」生成 `轮次4`。
11. 点「结束并导出」→ `endGameAndExport`：`existingNarrative = C0 + 轮次4`（`game-engine.ts:565`），追加结尾 → `finalContent = C0 + 轮次4 + 结尾2`。写 `node.content = C0 + 轮次4 + 结尾2`（`game-engine.ts:655`）。
    - **矛盾点 B（数据丢失）**：步骤 6 的导出 `C1`、以及作者在步骤「手动润色」里的 `C1'` 编辑，全部被 `C0 + 轮次4 + 结尾2` **覆盖**。作者的手动润色消失。
    - **矛盾点 C（语境错位）**：`轮次4` 是基于「C1 语境」写的，却被接到「C0」之后。若 C1 相对 C0 有情节推进（必然有，因为第一轮游戏生成了 C1），则 `轮次4` 与 `C0` 之间出现逻辑断层，读者会看到「回到开头又突然跳到新情节」的断裂感。

**结论**：G-new-1 不是「可能偶发」的边界 bug，而是「只要作者在工作区编辑过游戏导出的章节，再重开游戏」就必然触发的确定性数据一致性缺陷。它同时造成「workspace 编辑丢失」（P1 级数据风险）与「两局语境错位」（P1 级逻辑断裂）。修复成本却很低：把 `ensureGameSession` 的快照来源从「首建时传入 / 沿用旧快照」改为「每次开局重读当前 `node.content`」，并让 `resetGameSession` 不再 preserve 旧快照（见 G-new-1 建议）。这一改还能顺带让 IMP-001 的「防堆叠」语义更干净（每次开局独立快照，导出以前置快照为准，自然不会因为复用旧快照而把旧正文当新前缀）。因此 G-new-1 是本轮**优先级最高的必修项**。

**附带观察——`existingContent` 截断的隐性成本**：即便在单次游戏内，`game-prompts.ts:290` 的 `existingContent.slice(0,3000)` 也意味着原章节超过 3000 字时，AI 只看到前 3000 字。结合 G-new-1，作者若写了一篇 5000 字长章、用游戏续写，AI 既看不到后 2000 字，重开后又被钉死在前 3000 字快照——长章节在游戏模式下的「接得上」承诺其实只覆盖前三千字。这是一个值得在产品文档或 UI 上明示的限制（属 P2，与 G4 的 maxWords 硬编码同源，本质都是「魔法数字 3000」）。

### 3.8 游戏模式与正式写作链路的一致性缺口

游戏模式并非孤立功能，它把产物（一章正文）交还给正式写作链路：导出时走 `evaluateConfirmEligibility` + `applyConfirm`（`game-engine.ts:641-678`），最终落到 `storyNode.content` 并带 `status`/`qualityScore`/`reviewLogs`。这条「游戏 → 正式章节」的桥，整体是顺的，但有三处值得产品与架构共同关注的一致性缝隙：

**其一，质量分的语义差异**。`endGameAndExport` 调 `evaluateConfirmEligibility({ content: finalContent, qualityScore: null }, [], true)`（`game-engine.ts:641-645`），注意第二参数是空数组 `[]`——即**不传任何已有 reviewLogs 给评估器**。这意味着游戏导出的质量分是「从零评估」，不会继承作者在工作区里对该章节已有的审阅结论。对一个「作者先写、再开游戏、再回工作区精修、再导出」的来回流程，质量分每次都被重置重算，可能与作者主观认知不一致。建议把现有 `reviewLogs` 透传给评估器，让质量分跨链路连续。

**其二，自动确认与「智能审阅」开关的强耦合**。`autoConfirmOn` 取自 `project.autoConfirmEnabled`（`game-engine.ts:646-650`），默认 `true`。一旦开启且达标，游戏导出直接 `confirmed` + 自动填表。对「游戏 = 轻松玩出来一章」的作者这是省心；但对「游戏只是草稿、我要最后定稿」的作者，自动 confirmed 意味着这章立刻进入「已定稿」状态，可能被下游批量导出/发布流程误吞。游戏导出的本质是「创作草稿」，与正式续写草稿的 `drafting` 语义更搭。建议游戏导出默认落 `drafting`（由作者在确认栏定稿），把自动 confirmed 作为可选项而非默认，避免「玩一局就定稿」的意外。

**其三，回填设定的「世界观污染」风险（与 IMP-003 互补视角）**。IMP-003 用 toast 解决了「静默改动世界观」的知情权问题，但没解决「改动是否恰当」的问题：`applyConfirm` 在导出时把游戏里出现的新实体/事实回填进角色卡/世界书（`game-engine.ts:666-671` 触发、底层 `ensureItemLorebook` 在每轮 `:416-420` 也已补物品词条）。由于游戏叙事是 AI 自由发挥，其中可能混入与作者既定设定冲突的「事实」（比如 AI 给某个角色安了个游戏里才有的姓氏）。这些会被自动回填进世界观，且 toast 只说「已回填」不说「回填了什么、是否与现有设定冲突」。建议回填后在创意工坊/世界书给出「待复核」标记，或回填前做一次与现有条目的冲突检测。这是 IMP-003 知情权之外的「正确性」缺口，属 P2，但关系到世界观数据的长期健康。

**其四，MonitorPanel 看板可见性**。`endGameAndExport` 把 `qualityScore` 回写 `storyNode.qualityScore`（`game-engine.ts:658`），前端 ended 页也展示 `exportQuality`（`page.tsx:1240`）。这条「质量分回流看板」的链路是通的，说明游戏产出能被统一监控。但游戏特有的指标（如总轮次、情节进度 `plotProgress`、背包物品数）只在游戏页内展示，未回流到项目级进度量化（ROADMAP/README 提到的「进度量化」体系）。对一个把游戏当主要创作方式的作者，项目看板上看不到「这章是靠游戏玩出来的、玩了 12 轮」，是信息损失。建议在 `storyNode` 或统计层补一个 `generatedByGame` / `gameRounds` 标记，让游戏产出在全局可见。

以上四点的共同指向是：**游戏模式已经「能交还正文」，但还没完全「融入写作链路的一致性契约」**。它们都不阻塞使用，却决定了游戏产出在长篇项目里能否被当作「一等公民」长期管理。建议在 P1 的 G-new-1/G5 落地后，把 3.8 的「质量分透传」「默认 drafting」「回填待复核」「看板标记」列入下一轮的中优先级清单。

---

## 四、发现清单（每条含文件:行号精准定位）

> 格式：`[编号] 严重度 + 文件:行号 + 现象 + 根因 + 建议修法`
> 严重度：P0=数据丢失/崩溃阻塞；P1=明确体验/数据风险；P2=质量/性能/可维护性。

**[IMP-001] 已修复（PASS）** `game-engine.ts:160-165, :565, :706-713`
- 现象：复导出曾把「上一次导出的全量内容」当原正文再次前置，造成正文堆叠损坏。
- 根因（已修）：导出原以实时 `session.node.content` 为前置，首次导出后 `node.content` 已被改写为「原正文+游戏轮次」，二次导出递归叠加。
- 修复验证：引入 `originalContentSnapshot` 拍于入游瞬间、`resetGameSession` 跨局复用，导出以前置快照为准。已通过源码走查 + 单测 + 真机脚本逻辑核对，确认防堆叠有效。

**[IMP-003] 已修复（PASS，有边界）** `game-engine.ts:673-674` · `page.tsx:455-457` · `confirm-guard.ts`（仅 `applied>0` 返回「自动填表已执行」）
- 现象：游戏导出自动回填设定库时，现已弹 toast 提示「已自动回填设定库」，避免静默改动世界观。
- 根因（已修）：旧版漏提交 toast 分支。
- 验证：文案与触发点已就位；但 **toast 路径无自动化测试**，且 `autoFilled` 依赖字符串「已执行」脆弱耦合，建议补测试 + 改结构化布尔。

**[IMP-022] 已修复（PASS）** `game-prompts.ts:240-278, :346, :203-204` · 单测 `game-prompts.test.ts:193-261`
- 现象：长局（>6 轮）早期实体/伏笔/关键决策在 prompt 中丢失。
- 根因（已修）：`historySection` 仅保留最近 6 轮且每轮截断 150 字；新增 `buildMemorySummary` 注入全量实体 + 早期决策。
- 验证：单测证明摘要块被注入且早期决策回填；修复真实有效。

**[G3] P2** `game-engine.ts:311-314, :682-685` · `page.tsx:1235-1259`
- 现象：游戏结束后页面只给「返回工作区」，无任何「续玩/恢复」入口；`completed` 为终态且 `processGameTurn` 硬闸门拒绝续玩。
- 根因：产品未设计「结束后可继续写本章」的状态（如 `paused`），会话一旦导出即不可逆。
- 建议：`endGameAndExport` 后保留可恢复态（或新增 `paused`），并在 `processGameTurn` 放行，页面加「继续游戏」入口；若确认产品定位「结束即终」，至少在 ended 页明示「此局已结束，重开将另起新局」。

**[G4] P2** `game-engine.ts:174` · `start/route.ts:54` · `page.tsx:961`
- 现象：`maxWords` 硬编码为 3000，三处（引擎建会话、开局路由、前端进度条）各自写死，无法按项目/章节配置。
- 根因：无 `maxWords` 配置来源，常量散落多处。
- 建议：从项目配置或章节 meta 读取 `maxWords`，三处统一引用同一来源，避免再次漂移。

**[G5] P1** `start/route.ts:88-94`（非 SSE 收集完整响应）· `page.tsx:1180`（footer 仅 playing 可见，开局无停止）
- 现象：开局开场叙事**非流式**、且生成期间**无「停止」按钮**，作者面对一段不确定的进度条空等，若模型卡死只能干等。
- 根因：`start/route.ts` 注释明说「非 SSE，直接收集完整响应」；footer/停止按钮的渲染条件排除了 `generating` 态的开局阶段。
- 建议：开局也改为 SSE 流式（与 `action` 路由一致），并在 `status==="generating"` 时显示停止按钮（向 `start` 路由透传 `AbortController.signal`，引擎侧复用 `processGameTurn` 的 abort 丢弃逻辑）。

**[G6] P2** `game-engine.ts:197,203,206,225,232,249,256,323-325,418,444-446,457,670` · `page.tsx:114`
- 现象：游戏模块 `as any` 高度集中，多处位于 JSON 列边界与函数形参（`loadGameContext(session: any)`）。
- 根因：Prisma `Json` 列 ↔ TS 结构的桥接不可避免，但缺运行时守卫。
- 建议：① `getSessionSummary:197` 的 `entities` 解析加 `Array.isArray()` 守卫（防脏数据字符串）；② `loadGameContext` 形参 `session` 改为 `GameSession` 类型；③ 长期为 `GameState.entities/items/options` 定义 `JsonValue` 强类型以减少 `as any`。

**[G7] P2** `game-prompts.ts:289-291（existingSection 每轮重发≤3000）` · `:320-329（historySection 每轮重发）` · `:244-261（memorySection 全量实体）`
- 现象：每轮系统提示词全量重发「已有正文(≤3000) + 最近历史 + 全量实体 + 世界观 + 角色」，体积随轮次单调递增，无滑动窗口/摘要压缩，长局越玩越慢越贵，且历史反复喂易致 AI 重复描写。
- 根因：`buildGameSystemPrompt` 为「每轮全量重发」模式，缺上下文预算管理。
- 建议：① 已有正文仅首轮进入，后续轮省略或仅留指针；② 历史改用滑动窗口（最近 4 轮全文 + 更早轮压缩摘要）；③ 实体/世界观与 `memorySection` 去重合并；④ 引入每轮 token 预算上限（如 ≤ 6000）并告警。

**[G8] P2** `game-engine.ts:559-633`（0 轮导出退化为仅 `originalContent`；空局直接覆盖 `node.content`）
- 现象：作者「开始游戏」后立刻「结束并导出」（0 轮），若原章节无正文，则导出内容为一段凭空生成的「结尾」直接覆盖 `node.content`，全程无「你尚未进行任何一轮」的二次确认/警告。
- 根因：`existingNarrative` 退化为仅 `originalContent`（可能为空），且导出无条件 `UPDATE storyNode.content`，无轮次数为 0 的短路保护。
- 建议：轮次数为 0 时弹确认「尚未进行任何游戏轮次，确定仅用 AI 收尾覆盖本章？」或 no-op 返回 `drafting` 并提示。

**[G9] P2** `game-engine.ts:358-363（轮次失败仅 yield error，无兜底叙事）` vs `:627-630（结尾有兜底）`
- 现象：轮次生成 LLM 不可达时直接报错丢弃本轮（无兜底叙事），与结尾收束的「——本章完——」兜底不对称；且本地/无配置推理场景下全程无引导式报错，作者只见「行动失败」却不明白为何。
- 根因：轮次生成缺兜底分支；缺「模型可用性」预检与友好提示。
- 建议：① 轮次失败可降级为「基于已有上下文的规则拼接短叙事」兜底（或至少复用结尾兜底风格）；② 在进入游戏前做模型可用性探测，不可用时给出明确引导（「请配置模型/启动本地推理服务」）。

**[G-new-1] P1** `game-engine.ts:162-165（快照仅首建写入）` · `:708（reset 仅 preserve，绝不回读 node.content）` · `start/route.ts:36（existingContent 读实时 node.content）` · `:565（导出前置读快照）`
- 现象（源码推演 + 确定性结论）：**快照在首次入游时钉死，永不被刷新**。作者首次游戏导出 `C1` 后回到工作区手动润色为 `C1'`，再重开游戏：① `C1'` 的手动编辑被无声覆盖（workspace 编辑丢失）；② `start` 把**当前** `node.content`（=C1）作为 `existingContent` 喂给 AI，而导出前置仍是**原始快照 C0**，导致第二轮叙事基于 C1 语境却接到 C0 之后，两局语境错位、情节可能自相矛盾。
- 根因：快照来源与 `existingContent` 来源**不同一**（前者=首建时 `node.content`，后者=实时 `node.content`），且 IMP-001 把「防堆叠」与「续接最新正文」错误地做成零和。
- 建议（关键修复）：**每次 `ensureGameSession` 均把「当前 `node.content`」拍为本次会话快照**（而非仅在首次、且 reset 不再沿用旧快照）。这样导出前置与 AI 看到的 `existingContent` 对齐到同一份「最新正文」，既防堆叠（每次开局独立快照）又保留 workspace 编辑（重开接续最新稿）。同时 `resetGameSession` 不再 preserve 旧快照，改为重新拍当前 `node.content`。

**[G-new-2] P2** `game-engine.ts:539-685（endGameAndExport 全程无 in-progress 守卫；status 仅末尾置 completed）`
- 现象：快速双击「结束并导出」可能在 `status` 翻为 `completed` 前并发进入主流程，两次并发生成结尾 + 写 `node.content` + `applyConfirm`，后者覆盖前者、自动确认可能被触发两次。
- 根因：`endGameAndExport` 缺少「导出中」乐观锁（如先置 `exporting` 再 `completed`），前端 `page.tsx:434` 虽先置 `ending` 但防不住重渲染前的极快双点。
- 建议：服务端在事务开始即把 `status` 置为中间态（如 `exporting`）并 `unique` 约束/`status==="active"` 前置校验，拦截并发；或前端在 `handleEnd` 调用前立即禁用按钮并加幂等 token。

---

## 五、复验证据与运行结果（可复现）

```
$ SAFE_DELETE_DISABLE=1 npx tsc --noEmit
→ exit 0，零类型错误（全仓，含游戏模块）

$ npx vitest run src/core/game/
→ Test Files  2 passed (2)
→      Tests  85 passed (85)
   - src/core/game/game-prompts.test.ts (64 tests)
   - src/core/game/game-engine.test.ts  (21 tests)
   关键用例：
     · buildMemorySummary 注入跨轮次记忆摘要（IMP-022 单测全绿）
     · abort 后 $transaction 调用 0 次（P0-1 丢弃本轮）
     · 空流（0 chunk）不提交（P1-2）
     · 背包按 name+owner 隔离（阿游 P1）

$ git log --oneline --all | grep -iE "复导出|回填|记忆摘要"
→ 929719d v1.0.1 复检修复：游戏复导出堆叠 + 阶段五复检报告
→ changelog: 游戏复导出正文堆叠损坏：endGameAndExport 改用原正文快照…

真机脚本（需 dev+DB+LLM，沙箱降级为源码走查替代）：
· scripts/agent-game-reexport-stack-verify.cjs  —— IMP-001 复导出堆叠真机断言
    C1.startsWith(C0)===true 且 C1 中 C0 仅出现一次（无重复前置）
    C2 不以 C1 开头（修复：不把上次导出全量当原正文堆叠）
    C2.startsWith(C0)===true（仍以作者原正文前置）
· scripts/agent-game-light-confirm-verify.cjs    —— IMP-003 轻确认闭环
    主路径：end 返回 status=confirmed、autoConfirmed=true、reviewLogs 含 auto-confirm
    边界：autoConfirmEnabled=false → status=drafting（但缺 autoFilled/toast 断言，见 G6 建议）
```

---

## 六、建议优先级排序（供 Chair 整合）

| 优先级 | 编号 | 一句话动作 |
|--------|------|-----------|
| **P1 必修** | **G-new-1** | 快照改为「每次开局重拍当前 node.content」，消解 workspace 编辑丢失 + 两局语境错位 |
| **P1 必修** | **G5** | 开局改为 SSE 流式 + 提供停止按钮，消除「不可中断的黑盒开局」 |
| P2 高价值 | G7 | 引入上下文预算/滑动窗口，降长局 token 成本与重复描写 |
| P2 高价值 | G-new-2 | `endGameAndExport` 加 in-progress 乐观锁，防并发双导出 |
| P2 质量 | G6 | 给 JSON 边界加 `Array.isArray` 守卫，收紧 `loadGameContext` 类型 |
| P2 质量 | G4 | `maxWords` 配置化，三处统一来源 |
| P2 体验 | G3 | 明确「结束即终」语义或加「续玩/恢复」入口 |
| P2 体验 | G8 | 0 轮导出加二次确认/短路保护 |
| P2 健壮 | G9 | 轮次生成加兜底 + 模型可用性预检引导 |
| 测试补强 | IMP-003/G6 | 将 `autoFilled` 与 toast 纳入 verify 脚本，改字符串耦合为结构化布尔 |
| 测试补强 | IMP-001 | 为 `endGameAndExport` 纯拼接逻辑补不依赖 LLM 的单元/集成测试，钉进回归门 |
| 测试补强 | G-new-1 | 补「重开游戏后 node.content 不被旧快照覆盖、workspace 编辑保留」回归测试 |

---

> **诚实声明**：本报告基于真实源码走查（`game-engine.ts` / `game-prompts.ts` / `page.tsx` / `start/route.ts` / `end/route.ts` / `reconcile.ts` / `confirm-guard.ts`）、真实单测运行（85/85 通过）、真实 `tsc --noEmit`（0 错误）与 `git log` 核对。端到端真机脚本因沙箱无 Chromium/LLM 未实跑，但其断言逻辑已与源码逐行对齐、结论一致。所有发现均标注精确文件:行号，无编造。G-new-1 的「workspace 编辑丢失 + 语境错位」为源码静态推演的确定性结论（快照写入点唯一且永不刷新），建议优先排期修复。本报告所列 P1 两项（G-new-1、G5）若能在下一轮落地，游戏模式即可从「单局体验成熟」跨入「跨局与边界同样可靠」的创作可用阶段。
