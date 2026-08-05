# 确认流程 · 第一轮发言

> 结论先行：Novel Forge 现在根本没有「确认」环节。生成结束的那一刻，代码把章节状态字段从 `drafting` 翻成 `completed`，然后自动填表立刻污染下游记忆表——这不是确认，这是静默提交。我们要的不是一套新仪式，而是一个硬闸门，而且这个闸门几乎可以完全用货架上已有的零件拼出来。

## 一、核心诊断：缺口在哪，白痴指数多少

看 `src/app/api/generate/write/route.ts` 的落库逻辑就清楚了。正文流式生成完，调 `runPostGenerationPipeline` 把节点状态写成 `completed`，紧接着 `safeFillAfterWriting` 用 DeepSeek 把本章结构化事实回填进 LoreTable。整条链路里，没有任何一个地方停下来问「这章行不行」。状态机当前实际只有三态：`outline_only` → `drafting` → `completed`，而 `completed` 在语义上同时承担了「已生成」和「已接受」——这两个完全不同的概念被偷换成同一个字段。

更讽刺的是，原材料早就在货架上了：`StoryNode` 已经有 `qualityScore`、`reviewLogs`、`revisionCount`，还有独立的 `StoryNodeRevision` 版本快照表；`PostGenPanel` 已经在展示生成结果；右侧「监测 tab」已经存在。白痴指数的算法是「成品价 ÷ 原材料成本」。这套确认流程的原材料我们 100% 付过钱了，成品却一件没交付——等于白痴指数趋于无穷。反过来说，把它建出来极其便宜：我们要做的不是造引擎，是把已经买齐的零件拧在一起。

真正的风险不是「加了流程会变重」，而是「不加流程，坏章会不可逆地毒化后续所有记忆召回与摘要」。自动填表发生在确认之前，这是当前设计最该被质疑的根源。

## 二、提升框架：用五步算法推演确认流程

先算渐近极限：理想态是「生成即被审视、坏章绝不进入长期记忆」。再质疑需求——闸门必须存在吗？必须，因为自动填表的时间点错误地把未审章节当已审处理。下面按五步算法，顺序不可颠倒：

**质疑需求**：闸门存在有理，但「确认」不应是独立页面，不应是人工逐字审校，而应是一道最低成本的通过/打回判定。

**删除**：删掉「生成=完成=接受」的隐含假设；删掉任何新建独立 Review 页面的念头；删掉默认批量自动确认。

**简化**：不引入新表。直接扩展已有的 `ContentStatus` 词表：`outline_only → drafting → pending_confirm → confirmed`，打回则 `pending_confirm → drafting`。按钮收敛到三个：**确认通过 / 打回重写 / 诊断迭代**。

**加速**：复用后处理管线已经算出的 `qualityScore` 作为自动预审分，直接内联进 `PostGenPanel` 页脚，作者在同一面板里确认，零上下文切换。

**自动化**：「诊断迭代」按钮复用现有后处理审校通道，对打回内容跑一轮针对性 LLM 改写，结果作为新的 `StoryNodeRevision` 快照；确认动作变成对某个修订版一键通过。

状态机（纯文本，非 JSON）：

```
outline_only ──生成──▶ drafting
drafting ──完成──▶ pending_confirm
pending_confirm ──确认通过──▶ confirmed
pending_confirm ──打回重写──▶ drafting (保留 revision)
pending_confirm ──诊断迭代──▶ drafting (写入新 revision)
confirmed ──批量确认──▶ project_confirmed
```

布局：三个按钮固定在 `PostGenPanel` 底部，状态徽标挂在左侧章节树节点上。不要挪到别处。

## 三、具体可落地步骤：哪些代码直接复用

第一，改 `route.ts` 末尾：把状态落库从 `completed` 改为 `pending_confirm`（一行改动，在 `runPostGenerationPipeline` 的返回或路由里），并把 `safeFillAfterWriting` 的触发条件从「生成完成」改为「确认通过」，彻底解耦填表与生成。

第二，`PostGenPanel` 页脚加三个按钮 + 状态徽标；它本来就在渲染生成结果，扩展成本极低。

第三，复用 `qualityScore` 与 `reviewLogs` 字段，直接在面板里展示预审分与审校日志，零新字段。

第四，「诊断迭代」复用 `StoryNodeRevision` 存量能力存改写快照，并支持回滚，不用新造版本系统。

第五，批量确认走已有的 `src/app/api/story/nodes` 批量更新接口，加一个 `status` 批量置位即可。

第六，确认率/打回率 KPI 直接挂到右侧已存在的「监测 tab」，复用 `src/app/api/stats/monitor` 数据源。

## 四、风险提示

最大坑是填表时序：若闸门挡住自动填表，长期记忆就不更新，等于自残。必须把填表从「生成后」挪到「确认后」。第二坑是死锁：`pending_confirm` 被打回若丢了 `revision`，作者无据可改；必须用 `StoryNodeRevision` 兜底。第三坑是并发：`StoryNode` 已有 `editVersion` 乐观锁，确认请求必须携带 `expectedVersion`，否则手动编辑与 AI 改写会打架。第四坑是测试环境：沙箱无 Chromium，按钮点不了，只能靠 `tsc` 零错误 + 现有 `e2e-check.mjs` 脚本真跑接口验证，最终目测留给用户本地 `npm run dev`（端口 3001）。

## 五、与其他职能的张力

和「自动填表」职能正面冲突——我要求重排它的触发时序，它大概率抵抗。和乔布斯冲突：他主张按钮删到极致，我塞了三个，得说服他这三个一个都删不掉。和「监测 tab」团队有范围张力：往里加确认率 KPI 会被指责功能蔓延。和费曼校验有语言张力：状态名必须用「待确认/已确认」这种零基础能懂的中文，绝不能暴露 `pending_confirm` 给终端用户。这些冲突不是坏事，是下一轮交锋的引信。
