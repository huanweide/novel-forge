# Round 1 整合 · 确认流程（Chair / tri）

> 客观理性中间人整合。七份人格报告 + 三份观测报告已全部落盘。本文件不压缩各角色思想，剖析共识与张力，并据偏差观测的纠偏指令（M1–M6）收敛出**单一权威 UI 规格** `agent-confirm-spec.md`。

---

## 一、会议是否开成了会议

进度观测：七份全部实质长文（600+ 字，均引真实代码），同题收敛，无卡死。质量观测：7/7 达标，5 优 2 良。偏差观测：全部围绕「确认流程按钮 UI」，但共同犯了两个错——①把"智能体团队确认"写成"作者确认"（主语漂移）；②各给一套不兼容规格（状态机 7 套、按钮命名 5 种、布局互相打架）。

结论：会议成功产出了真知，但**未经整合的七份报告对工程无用**——必须归一。下面先存真，再纠偏。

---

## 二、七种声音的实质（不削薄）

**乔布斯（优）**——"你们根本没有门"。最锋利的一刀：系统有分析、有监测、有状态字段，唯独缺一个"作者必须亲手推开的确认闸门"。确认是品味的主权。主张：确认栏作为 `PostGenPanel` 的 sticky footer（非弹窗），主按钮大、圆角、`--nv-primary`、始终可点；诊断是选项不是前置税；打回保留上一版快照。

**智能体团队（优）**——唯一精准点出**时序根因 bug**：`safeFillAfterWriting` 在 `/api/generate/write` 生成后自动跑（route.ts:304），把未审视草稿静默污染下游记忆表。白痴指数论证：原材料（qualityScore/reviewLogs/PostGenPanel/监测 tab）100% 已付费，成品（确认闸门）零交付。五步算法推演：质疑需求（闸门必须存在因填表时序错）→删（删"生成=接受"假设、删默认批量自动确认）→简化（扩展既有 `ContentStatus` 词表，不建新表）→加速（复用 qualityScore 内联）→自动化（诊断迭代复用后处理审校 + `StoryNodeRevision` 快照）。

**PG（优）**——"没有作者拥有的确认"。独特视角：系统其实有隐式确认（不删不改即默许），缺的是"由作者亲手按下、且能被其他模块信赖的状态"。主张极简 2 态（draft ⇄ locked），把打回并回"解除锁定"。**张力点**：PG 把闸门弱化成开关，可能名存实亡——这正是偏差观测拉响的警报。

**张雪峰（优）**——普通人（写网文的小透明）根本不卡"怎么点按钮"，卡在三件：没有后悔药（写到 80 章发现 30 章人设崩，回不去）、没有交付感（AI 吐完缺"我认了"动作）、怕 AI 写得自己认不出（一致性快检缺失）。刚需主张：**每次确认必落版本快照 + 一致性快检**。代码精度略弱但组件引用真实。

**芒格（优，最长）**——逆向四坑法最严谨：形式主义闸门（确认须带依据，复用 review/qualityScore，不能空白点过）→打回即销毁（须保留 `StoryNodeRevision` 快照）→批量确认清空问题（低 qualityScore/有 error 的章禁止进批量）→状态死锁（确认非终态，允许已确认→重开）。复用清单最全。

**费曼（良）**——"讲不清就是假装设计"。主张状态机砍成五态可枚举可校验，按钮全用汉字零基础友好（提交确认/打回重写/AI诊断/确认通过），批量确认仅在"待确认归零"后于项目级浮"整本确认完成"。**两处需 Round 2 修正**：误称"Chapter 节点"（实为 StoryNode）；另提新 `confirmStatus` 字段——应扩展既有 `status` 而非新增。

**工坊（良，最可操作）**——落地路径最清晰：扩 `ContentStatus` 类型与 schema 注释 → `prisma db push`+`generate` → PATCH 路由加 `action: confirm|reject|diagnose` 写 status 并 push `reviewLogs`、`revisionCount+1` → PostGenPanel 顶部三按钮 + 左栏色标 → 新建批量路由 → 双 changelog。约一个中等 PR。**重要事实更正**：质量观测曾判工坊"称枚举缺 rejected 是事实错误"，但经 Chair 核实 `src/core/types/index.ts:149` 的 `ContentStatus` 当前只有 `outline_only | drafting | completed` 三值，既无 rejected 也无 reviewing/revised——**工坊没错，缺的正是确认态，质量观测反被判反了**。

---

## 三、共识与张力（最有价值的干货）

**三层硬共识**（七份一致，且被真实代码坐实）：
1. 当前无显式确认闸门（`write/route.ts:304` 生成后直接落库 + 自动填表）。
2. 控件贴中栏底部 / PostGenPanel 页脚，状态点挂左栏，KPI 进右栏监测 tab；反对弹窗。
3. 复用既有 `StoryNode.status` / `reviewLogs` / `StoryNodeRevision` / `editVersion`，不新造表。

**四处建设性张力**（留给 Round 2 交锋）：
- **T1 按钮范式**：PG 2 键（锁定开关）vs 乔布斯/费曼 4–5 键（确认/打回/诊断/批量）。极简 vs 防呆。
- **T2 状态机**：PG 2 态 vs 智能体团队 3 态 vs 芒格 4–5 态。中间态"待确认"要不要？
- **T3 确认时序**：填表在"确认后"跑（智能体团队/张雪峰/芒格，堵记忆污染）vs"待确认阶段即跑"（工坊，避免延迟召回）。
- **T4 主语**：6/7 份写成"作者确认"，偏离"AI 智能体确认"这一用户真实约束。

---

## 四、Chair 纠偏与归一（据 M1–M6）

偏差观测的六条纠偏指令全部采纳，收敛为单一规格 `agent-confirm-spec.md`。核心决策：

- **主语锚定AI 智能体**（M1）：所有文案/状态/操作者字段以"AI 智能体"为主语，因为它要真实走通验证。
- **唯一按钮清单 4 键**（M2）：`提交确认` / `打回重写（须填理由）` / `AI诊断` / `批量确认（带护栏）`。否决 PG 无中间态弱化方案。
- **唯一状态机 5 态**（M3）：`outline_only → drafting → pending_confirm → confirmed → project_confirmed`。`drafting` 即"已生成未提交"；`pending_confirm` 即"待智能体团队确认"；`confirmed` 即"定稿"；`project_confirmed` 即"整本交付"。打回 `pending_confirm → drafting` 留快照；已确认可 `confirmed → drafting` 重开。
- **唯一布局**（M4）：确认条固定 PostGenPanel 底部常驻栏 + 左栏状态徽标（灰/橙/绿）+ 右栏监测 tab「确认看板」。
- **显式计划流程**（M5）：单列端到端顺序，标注**自动填表必须推迟到 `confirmed` 之后**（采纳智能体团队时序根因修复，这是最高杠杆改动）。
- **收敛纪律**（M6）：规格单文件输出，异见仅作附录。

---

## 五、最高杠杆修复（先于 UI）

七份报告 + 三观测共同指向同一根因：**自动填表跑在确认之前**。这不只是"体验问题"，是"未审视草稿污染设定库"的真 bug。无论 UI 怎么设计，第一步必须：
> 把 `src/app/api/generate/write/route.ts:304` 的 `safeFillAfterWriting` 调用，从「生成后」移到「章节被确认（`confirmed`）后」触发。

这一行时序改动，堵住记忆污染，也让"确认"第一次有了真实意义。

---

## 六、留给 Round 2 的未决项

1. T1/T2 经 Round 1 已归一（4 键 / 5 态），Round 2 只验"是否真不啰嗦"。
2. T3 填表时序：采用"确认后填表"，Round 2 验"召回延迟是否可接受"。
3. 游戏模式是否走"轻确认"（费曼提议）——Round 2 决。
4. 批量确认护栏阈值（低 qualityScore 拦截线）取多少——待AI 智能体实测定。

---

*整合：Chair(tri)。七份人格报告见同目录 `jobs/agent/pg/zhangxuefeng/munger/feynman/gongfang.md`；三观测见 `observer-progress/quality/deviation.md`。单一规格见 `agent-confirm-spec.md`。*
