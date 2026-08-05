# 质量观测报告 · 确认流程专项会议（Round 1）

> 观测智能体：质量观测员
> 观测对象：`agent-confirm-round-1/` 下 7 份人格报告
> 核验方式：Read 逐份读取 + 对 Novel Forge 真实代码（`src/app/api/generate/write/route.ts`、`prisma/schema.prisma`、`src/core/types/index.ts`、`src/components/workspace/PostGenPanel.tsx` 等）做交叉核验。

---

## ① 逐份质量评分表

| 文件名 | 角色 | 等级 | 字数 | 亮点 | 问题 / 瑕疵 |
|---|---|---|---|---|---|
| `jobs.md` | 乔布斯 | **优** | ~1900 字 | 第一性原理切入，"系统有分析、有状态字段、唯独没有作者必须推开的门"一针见血；主张"确认按钮始终可点、诊断是可选"直击确认疲劳；给出 sticky footer + 中栏只读描边 + 监测状态点的具体布局；明确复用 PostGenPanel 的 `onClose`/`onRefresh` 回调 | 提出新增 `/api/chapter/confirm` 端点，与其余多数"复用既有 PATCH 路由"的方案略发散，需统一 |
| `agent.md` | 智能体团队 | **优** | ~2000 字 | 五步算法（质疑/删除/简化/加速/自动化）成链；**唯一精准点出时序 bug**：`safeFillAfterWriting` 在生成后自动跑、污染下游记忆；白痴指数（成品价÷原材料）论证"建起来极便宜"；6 条可落地步骤逐条指向真实代码（`runPostGenerationPipeline`、StoryNodeRevision、`/api/stats/monitor`、editVersion 乐观锁） | 未注意到 `ContentStatus` 已有 `reviewing/rejected/revised` 三态，但其 `pending_confirm` 方案不冲突，影响小 |
| `pg.md` | Paul Graham | **优** | ~1700 字 | "不是没有确认，是没有作者拥有的确认"视角独特；反官僚、主张"锁定开关而非审批流"；2 态机（draft⇄locked）最简；明确"工程量小=用户真要、动大手术=我们自嗨"的判据 | 把"诊断/打回"并入"解除锁定"，实操上丢掉了"带理由打回"的留痕价值，与芒格/费曼的快照主张有张力 |
| `zhangxuefeng.md` | 张雪峰 | **优** | ~1700 字 | 普通写手视角最落地；直言普通人卡在"后悔药/交付感/AI 写崩"而非按钮；**"每次确认必须落地版本快照"** 是刚需级主张；提到 PostgreSQL 撑爆、单用户无鉴权过度设计等真问题 | 代码精度略弱（未引文件行号），但引用的 PostGenPanel、`/api/generate/write`、`tables/page.tsx` 的 `fillResult` 卡片均为真实组件 |
| `munger.md` | 芒格 | **优** | ~2300 字 | 逆向思维（invert）最严谨：先列"怎么坑用户"4 坑法再反推按钮；批量确认必须拦截低分/error 级章；区分"diagnosis 是动作不是态"呼应乔布斯减法；复用清单最全（StoryNodeRevision、`/api/generate/refine`、`/api/generate/continue`、`PreGenConfirm` 交互范式） | 状态机用 `pending_review/confirmed/reopened`，与既有类型 `reviewing/rejected/revised` 命名未对齐，存在语义重复 |
| `feynman.md` | 费曼 | **良** | ~1500 字（最短） | "讲不清确认了什么就是假装设计"的校验精神鲜明；按钮全用汉字、无图标黑话，零基础友好；指出确认疲劳与游戏模式轻确认分治 | ①称"schema.prisma 里 Chapter 节点（第 134 行）"——实际是 `StoryNode` 模型（模型 125 行、status 字段 134 行），"Chapter"命名不准；②另提新增 `confirmStatus(draft/pending/confirmed)` 字段，而既有 `StoryNode.status` 已可扩展，属重复造字段；③篇幅偏短 |
| `gongfang.md` | 工坊 | **良** | ~1550 字 | 工程落地最务实：明确"缺口只在三处（枚举值/确认 API/管理界面）"；给出 PATCH 分支 + `reviewLogs` push + `revisionCount+=1` + 双 changelog 的具体执行路径；提醒 `prisma db push` 先于 `generate`、`SAFE_DELETE_DISABLE=1 npx tsc` 门禁 | ①称"枚举缺 `pending_review/confirmed/rejected` 三态"——**事实错误**：`ContentStatus` 类型（src/core/types/index.ts:149）已含 `rejected`，另有 `reviewing/revised`；②把 status 称为"Prisma 枚举"，实际 schema 中是 `String` 字段 + TS 类型联合，非 Prisma enum，措辞不严谨 |

**总体结论**：7 份全部达到 600+ 字实质长文标准，5 份为「优」、2 份为「良」。无 JSON、无 10 字列点、无敷衍。逻辑链（诊断→框架→步骤→风险→张力）在每份内部均自洽成环。核心代码诊断被真实代码证实（见下），角色视角鲜明可辨。

---

## ② 跨报告共识点（Chair 可放心采信）

1. **确有关卡缺口，且被代码坐实**：7 份一致指出"生成结束 = 自动落库 completed = 自动填表，没有作者拍板点"。核验确认 `write/route.ts:304` 在生成后直接 `await safeFillAfterWriting(...)`、`:319` 写 `status:"completed"`，`PreGenConfirm` 只是生成**前**调度，与"写完后认不认可"无关。**这是真 bug，不是脑补。**
2. **最大风险是记忆污染时序**：智能体团队、芒格、工坊均指出 `safeFillAfterWriting` 应在"确认后"而非"生成后"触发——否则未审章节直接毒化设定库/伏笔召回。这是最高杠杆的真实修复点。
3. **全部主张复用、不新造表**： unanimous 复用 `PostGenPanel`、`StoryNode.status`、`reviewLogs`、`qualityScore`、`StoryNodeRevision`、`editVersion` 乐观锁。无一人要求新建数据表。
4. **确认控件落点一致**：中栏写作区底部 / `PostGenPanel` 页脚常驻确认条 + 右栏监测 tab 加"确认看板/进度"。无弹窗打断（乔布斯、费曼、张雪峰共同反对弹窗）。
5. **打回必须保留快照**：智能体团队、芒格、张雪峰、工坊一致要求用 `StoryNodeRevision` 兜底下，打回/迭代不丢历史。
6. **批量确认需护栏**：乔布斯（二次确认）、芒格（低分/error 拦截）、张雪峰（本卷/项目级）均反对无脑批量。

---

## ③ 最该被 Chair 采纳的观点

按杠杆与可执行度排序：

1. **【最高杠杆·真实修复】把 `safeFillAfterWriting` 从"生成后"挪到"确认通过后"**（智能体团队 + 芒格 + 工坊共识）。一行时序改动，直接堵住坏章不可逆污染长期记忆的根因。应在任何 UI 按钮之前先做。
2. **【防止流程变摆设】确认按钮始终可点、诊断可选**（乔布斯）。若每章强制走完五 Tab 才许确认，作者会绕过它——确认门必须零摩擦。
3. **【刚需定义】"确认 = 落一次版本快照 + 人设/伏笔一致性快检"**（张雪峰 + 费曼）。普通用户要的是"后悔药"和"这章稳了"的安全感，不是审批仪式。
4. **【风险护栏】批量确认前置拦截低分/error 章，且带依据确认**（芒格）。把"通过"变成有意识判断，而非肌肉记忆点按。
5. **【执行路径】复用 `story/nodes/[id]` PATCH 扩展 `action: confirm|reject|diagnose`，并遵守双 changelog 习惯**（工坊）。落地成本约一个中等 PR，无需新表。

**待 Chair 拍板的冲突**：
- 状态机之争：乔布斯 3 态 / PG 2 态 / 智能体团队 4 态+ / 芒格 4 态 —— 应统一到"扩展既有 `StoryNode.status` 枚举"，并清理与已有 `reviewing/rejected/revised` 的命名重叠。
- 显式 vs 轻量：张雪峰要显式闸门、智能体团队/PG 偏好轻量 —— 折中为"生成即草稿、作者主动确认、确认可一键"。

---

## ④ 质量结论

**整体质量：优（7/7 达标，5 优 2 良）。**

- 七份报告均为实质长文，逻辑自洽，给出了具体按钮清单、状态机（ASCII/文字）、布局与可复用代码路径，且核心诊断被真实代码（`write/route.ts`、`schema.prisma`、`types/index.ts`、各 panel 组件）交叉证实，**不是空中楼阁**。
- 角色视角鲜明：乔布斯（极简/门/品味）、智能体团队（五步/白痴指数/时序 bug）、PG（反官僚/作者主权）、张雪峰（普通人后悔药）、芒格（逆向/风险护栏）、费曼（真实可懂/零基础）、工坊（落地路径/双 changelog）——七种声音不雷同、互相咬合。

**需向会议反馈的两处准确度瑕疵（建议 Round 2 修正）：**
1. `feynman.md` 把 `StoryNode` 误称"Chapter 节点"，并主张新增 `confirmStatus` 字段——应改为扩展既有 `StoryNode.status`。
2. `gongfang.md` 称"枚举缺 rejected 三态"且称其为 Prisma 枚举——实际 `ContentStatus` 已是 TS 类型联合且**已含 `rejected`**（另有 `reviewing/revised`），schema 中 `status` 是 `String` 字段。建议统一术语、复用既有状态值，避免重复造语义。

**一句话给 Chair**：本轮产出可信、可直接进入方案收敛；优先做"确认闸门 + 填表时序后移"这一条真实代码改动，再据乔布斯减法与张雪峰快照诉求定 UI 形态。
