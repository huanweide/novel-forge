# 芒格 · 风险逆向：确认流程最该防的是什么

> 我是芒格。别人都在讨论"该加哪些按钮"，我只关心一件事：这套流程上线后，最可能以什么方式把用户坑了。把坑填掉，正确的按钮自己会浮现。这叫 invert，always invert。

## 一、核心诊断：你缺的不是按钮，是一道闸门

翻完 `src/app/api/generate/write/route.ts` 和 `prisma/schema.prisma`，结论很清楚：Novel Forge 现在**根本没有显式的"确认"环节**。

现状是：作者点生成，`write` 路由走完流式生成 + 后处理管线（`runPostGenerationPipeline` 包含扫描、审校、摘要），节点 `status` 从 `outline_only` 直接翻成 `completed`，正文落库即视为成品。后处理那套 PostGenPanel（提取 / 废词 / 逻辑自查 / 蒸馏 / 审校五个 Tab）只是"分析"，它不锁章、不阻断、不要求作者拍板——`PostGenPanel.tsx` 的 `onClose` 一关就完事，章节依然 `completed`。`PreGenConfirm.tsx` 倒是叫"确认"，但那是生成**前**的角色调度，跟"写完之后认不认可"毫无关系。

缺口就一句话：**系统把"机器跑完了"和"我认可了"当成同一件事**。更糟的是，这正是激励错位的温床——一旦"生成完成"被默认等于"工作完成"，作者（包括AI 智能体批量跑 10+ 章时）就会把未审视的草稿当成定稿，下游的自动填表（`safeFillAfterWriting`）和伏笔收束扫描会直接拿这些没过脑子的文本去污染设定库。你不是在加功能，你是在给一个已经有裂缝的水坝补一道该有却没有的闸门。

## 二、提升框架：先想它怎么坑人，再反推按钮

要想让确认流程把用户坑惨，该怎么做？把坑列出来，反推就是设计。

**坑法一：形式主义的闸门。** 每章强制弹确认框，作者无脑点"通过"，确认毫无信息量，纯增摩擦。反推：确认必须是"带依据的决定"。按钮旁边要直接显示 PostGenPanel 已有的 review 结论、`qualityScore`、逻辑自查结果——让"通过"是一个有意识的判断，而不是空白点一下。

**坑法二：打回即销毁。** 打回=把整章丢进垃圾桶重生成，已经写得好的段落也跟着没，浪费 token 且打断连贯性。反推：打回必须保留 `StoryNodeRevision` 快照（`schema.prisma` 里 `revisions` 模型和 `revisionCount` 已就绪），并允许在原文上"局部迭代/改写"，状态退回但不丢历史。

**坑法三：批量确认=一键清空所有问题。** 作者批量通过 30 章，把未诊断的废稿也锁死，之后再也发现不了。反推：批量确认必须前置拦截——`qualityScore` 低于阈值、或 review 有 `error` 级问题的章节，禁止进入批量确认。

**坑法四：状态机死锁。** 确认后想改发现改不了，或 `pending` 永远卡着。反推：确认不是终态，必须允许"已确认→重开"。

据此我心中的状态机（只四态，diagnosis 是动作不是态，呼应乔布斯减法）：

```
outline_only → drafting → completed(已生成)
completed → pending_review(待确认)
pending_review ──[确认通过]──▶ confirmed(已确认)
pending_review ──[打回重写]──▶ completed(保留 revision 快照)
pending_review ──[诊断]──▶ diagnosis_report(复用 logic/review 数据) ──[迭代]──▶ completed(refine/continue)
confirmed ──[重开]──▶ completed
confirmed*N ──[批量确认]──▶ project_confirmed
```

**布局**：不要新开弹窗堆砌。把"确认条"做成中栏写作区底部、PostGenPanel 之上的结算条——显示当前章状态 + 四个动作【确认通过】【打回重写】【诊断报告】【迭代】。右栏"监测 tab"新增一块"确认看板"：全项目 pending / confirmed 比例、未诊断章节数、低质量拦截数。批量确认入口放在 OutlineTree 或项目级工具栏，按勾选节点聚合。

## 三、具体落地：哪些能复用现有代码

- **状态字段**：`StoryNode.status` 已有，仅需扩展枚举值（`pending_review` / `confirmed` / `reopened`），零新表、零迁移成本。
- **版本快照**：`StoryNodeRevision` + `revisionCount` 已存在，打回/迭代直接 snapshot，免造轮子。
- **诊断依据**：PostGenPanel 的 logic / review / `qualityScore` 已经产出数据，确认条直接读取当"确认依据"，不需要新跑一次 LLM。
- **动作留痕**：`reviewLogs(Json)` 字段已存在，确认/打回记一条 log（谁、何时、结论、依据摘要）。
- **局部改写**：`/api/generate/refine`、`/api/generate/continue` 已存在，迭代按钮直接调。
- **交互范式**：`PreGenConfirm` 的 Modal + 角色卡交互可借鉴到诊断弹窗。
- **落点**：在 `workspace/[projectId]/page.tsx` 装配 PostGenPanel 之处上方挂确认条，`CenterPanel` 底部渲染。

## 四、风险提示

- **激励偏差**：若"确认通过"是进入下一步的唯一关卡，作者会养成肌肉记忆式点通过。系统应让"通过"附带最小信息成本（看到 review 摘要），把确认变成有意识决定，而不是又一道被自动跳过的门。
- **自动化反噬**：自动填表和后处理已在生成后自动跑，确认环节若再偷偷自动跑诊断，等于双重调用 LLM 烧 token。确认必须是人触发的明确动作，别隐蔽自动化。
- **状态爆炸**：别加太多态让 UI 混乱。只留"已生成 / 待确认 / 已确认 / 重开"四态，diagnosis 是动作不是态。
- **乐观锁冲突**：`editVersion` 乐观锁在，确认/迭代同时要小心和手动编辑冲突，确认动作应走带 version 的更新，避免手动改稿被 AI 覆盖。

## 五、与其他职能的张力

- **智能体团队（主审/减法）**：他会嫌"又加一套流程"，白痴指数要低。必须证明确认条不增加 token——它只是把已有的 PostGenPanel 数据翻到台前。若确认导致每章多一次 LLM 调用，他会否掉。
- **乔布斯（品味/减法）**：确认条本质是"加按钮"，直接冲突其"删到几个才不脏"。张力在于必须证明这是必要闸门而非噪声 UI。
- **费曼（真实可懂）**：状态名不能黑话，`pending_review` 要对零基础用户可读，最好界面显示"待你确认"。
- **工坊（工程）**：新增状态值要同步迁移脚本，且不能破坏现有 `completed → 后续章节上下文加载`（`contextKeepChapters` 依赖已完成章节），确认态的语义要向后兼容。
- **自动填表 / 伏笔收束**：只有 `confirmed` 章节才算定稿，后续自动填表与伏笔收束扫描应只对 confirmed 章节生效，否则未确认草稿会污染设定库——这是确认流程真正的价值锚点。
