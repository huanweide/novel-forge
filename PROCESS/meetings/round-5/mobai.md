# Round 5 深度体验报告 —— 墨白（写章流程 + 确认流程）

> 透镜：从「打开项目 → 选中章节 → 生成正文 → 生成后分析 → 确认/打回 → 整本交付」的端到端体验
> 方法：只读源码（HEAD = v1.1.1, commit fd7f953）+ 静态交互推演 + 关键路径代码定位（均带 文件:行号）
> 铁律：未修改任何 src/测试/changelog/配置；下列发现均可复现
> 基准：yunix-reference-analysis.md（云笔布局语言）+ 00-启动与反思.md（本轮铁律）
> 说明：本轮铁律要求「必须截图」，本人为只读诊断人格，不启动 dev 真机；下文每条问题均给出「截图建议」，交由 Chair 真机复核。

---

## 〇、v1.1.1 已完成项（本轮不再列为待办）

经核验源码，以下事项已完成，本报告的 P0/P1/P2 不再包含：

- 统一 Switch 组件：src/components/ui/switch.tsx（云笔式右对齐药丸 Toggle，配色收敛 --nv-primary/--nv-surface-3）。
- ChapterConfirmBar 折叠区标题与操作左右分离（ChapterConfirmBar.tsx:283-313，标题「全书智能交付」+ Switch 在左，主按钮在右）。
- checkbox → Switch 已完成（ChapterConfirmBar.tsx:293-300 调用 Switch）。
- 火箭图标已完成（ChapterConfirmBar.tsx:309,337 用 Icon name=rocket）。

---

## 一、体验路径（端到端）

1. 打开项目：src/app/workspace/[projectId]/page.tsx 三栏布局；加载/错误/空态分支见 :883-907。
2. 选中章节：左侧 LeftPanel 大纲树 → CenterPanel 顶栏出现标题 + 状态 + 字数 + 历史（CenterPanel.tsx:204-213）。
3. 世界时间 / 章纲：控制栏第二行世界时间输入（:216-223）；第三行章纲折叠（默认收起，outlineExpanded=false，:238-246）+ 轻量章纲/抽卡分镜入口。
4. 生成正文：生成控制行 :283-320，含主按钮、微调切换、游戏模式、目标字数、作者指令；流式进度 :369-401；落库后底部状态栏 :406-435。
5. 生成后分析：PostGenPanel 内联 5 Tab（提取/废词/逻辑/蒸馏/审校），容器 PostGenPanel.tsx:181；Tab 栏「高级」折叠 PostGenPanelTabs.tsx:65-77。
6. 确认流程（核心）：ChapterConfirmBar 贴正文下方（page.tsx :1067-1094）。
   - 智能审阅态（默认开）：常态仅「系统自动判定，仅拦截异常」+ AI诊断 + 人工接管（:208-216）；点接管后展开提交/确认/打回/AI诊断（:217-234）；已定稿显「已自动定稿」+ 弱化「重开」（:253-260）。
   - 保守态：逐章 4 键（提交确认/确认通过/打回重写/AI诊断，:236-252）。
7. 打回/重开：行内理由必填（:267-278）；重开仅 ghost 小字（:258）。
8. 全书智能交付：折叠区默认收起（deliverOpen=false，:62）；标题行常驻「全书智能交付」(chevron) + 自动交付(Switch) + 智能交付全书主按钮（:283-313）；展开后说明 + 扫描结果（:314-343）。
9. 整本交付：扫描无拦截且放行>0 → 自动交付开时服务端置 confirmedAt，前端仅刷新（:172-183）；关时显「确认整本交付」按钮（:335-339）；项目已交付后底部一行「整本已确认交付」（:346-350）。
10. 另一条批量入口（左侧隐藏）：LeftPanel「批量」→ 勾选 → 「批量确认 N」（LeftPanel.tsx:103,117-119），走 POST /api/story/nodes/batch-confirm（page.tsx :828-854）。

---

## 二、与云笔参考站对照

| 维度 | 云笔表现（基准） | novel-forge v1.1.1 现状 | 差距 |
|---|---|---|---|
| 开关样式 | 紫色 iOS 药丸 Toggle 右对齐（一·开关、三·2） | 已统一为 Switch（云笔式药丸），自动交付已用（ChapterConfirmBar.tsx:293） | 已对齐 |
| 折叠面板 | 统一可折叠分组，chevron + 标题（三·4） | 确认栏用 chevronRight/Down 图标（:290）；章纲用 ▸/▾ 文本字形（CenterPanel.tsx:244）；更多菜单 ▾（LeftPanel.tsx:68）；高级 Tab ▾（PostGenPanelTabs.tsx:68） | 中：同一产品出现「图标 chevron」与「文本字形 ▸▾」两套折叠范式，至少 3 处文本字形 |
| 卡片化 | 图标+标题+描述+右侧操作统一卡片（三·1） | 交付区已是行式（左右分离达标）；但与 PostGenPanel 卡片视觉层级并列，未做成云笔式「图标+描述」卡片 | 中 |
| 状态色 | 绿/紫主色，状态清晰 | 三档（灰/橙/绿）映射六态（ChapterConfirmBar.tsx:34-41） | 低：但 completed/drafting 同为灰，语义易混；且 CenterPanel 顶栏口径不同（:206） |
| 主题色 | 紫色主色收敛 | 主色 --nv-primary（紫），成功绿、危险红 | 已对齐 |
| 底部三按钮 | 重置/取消/保存统一（三·3） | 无统一底部栏 | 低 |

核心可借鉴点：① 统一折叠交互范式（消除 ▸▾ 文本字形）；② 状态文案/配色按「是否还需人类动作」在三种口径间统一；③ 批量确认入口显式化、去重；④ 自动交付成功强反馈。

---

## 三、问题清单

每条格式：问题 / 位置 / 严重程度 / 截图建议。

### 【P0】无（本轮未发现阻断性缺陷）
功能正确性层面：确认/打回/自动填表/自动交付/质量护栏链路完整，无阻断或明显功能缺陷。

---

### P1-1 状态徽章语义在智能审阅态误导（同状态两处口径冲突）
- 问题：StatusBadge 把 completed 标为「已生成·待提交」（灰，ChapterConfirmBar.tsx:37），drafting 标「草稿」（灰，:36）；而 CenterPanel 顶栏却把 completed 标为「已完成」（:206）。同一状态 completed 在两处含义冲突。更关键：智能审阅默认开时，completed 章会被系统自动定稿，但徽章长期显示「已生成·待提交」，作者易误以为还需手动提交，与真实行为（无需提交）矛盾，造成误导。
- 位置：ChapterConfirmBar.tsx:34-41（StatusBadge 映射）；CenterPanel.tsx:206（顶栏状态文案）。
- 严重程度：P1（信息准确性，直接影响作者对章节状态的判断）。
- 截图建议：
  1. 智能审阅态下一张 completed 章确认栏截图，红框标「已生成·待提交」与下方「已自动定稿」并存矛盾。
  2. 同一章在正文顶栏（CenterPanel）显示「已完成」的截图，并排对比两处口径冲突。

### P1-2 自动整本交付成功反馈不足（静默成功）
- 问题：开启自动交付时，smartDeliver 扫描无拦截后只调 onAction() 刷新（:172-183），不弹 toast；且全书交付区默认收起（deliverOpen=false，:62），成功结果清单（自动放行 N 章）不展示。用户点「智能交付全书」主按钮只见「扫描中…」短暂闪过，既无 toast 也无结果，仅最终由底部「整本已确认交付（时间）」(:346-350) 弱提示。对比保守路径手动点「确认整本交付」会弹「整本确认完成」（:150），自动路径确定感明显不足，易误以为失败/没反应。
- 位置：ChapterConfirmBar.tsx:159-190（尤其 :172-183）；:346-350。
- 严重程度：P1（反馈缺失导致不确定，关键环节成就感弱）。
- 截图建议：自动交付开 + 扫描无拦截后的整屏截图，重点看是否有明确成功提示（预期：仅底部一行，无 toast，且交付区仍折叠）。

### P1-3 批量确认入口隐藏且双机制并存（命名/入口分散）
- 问题：入口一（确认栏）「智能交付全书」语义是「扫描整本书→自动放行」，用户只想批量确认本卷时语义过重，且说明默认折叠（:314-318）。入口二（左侧）需先点「批量」(LeftPanel.tsx:103) → 勾选章节 → 才出现「批量确认 N」(:117-119)，且仅当 selectedPendingCount>0 显示，是条件式深层隐藏入口。两条批量路径（auto-confirm 全书 vs batch-confirm 本卷）并存但 UI 互不提示，命名也不一致（智能交付 / 批量确认），新用户难以察觉「批量确认本卷」的存在。与云笔「集中操作、统一卡片」思路不符。
- 位置：LeftPanel.tsx:103-119；ChapterConfirmBar.tsx:301-313；后端 page.tsx:828-854(batch-confirm) vs :159-190(auto-confirm)。
- 严重程度：P1（核心批量能力发现成本高，且双入口易混淆）。
- 截图建议：
  1. 左侧大纲 Tab 默认态截图（无「批量确认」按钮，证明隐藏）。
  2. 点「批量」并勾选 pending 章后的截图（露出「批量确认 N」）。
  3. 确认栏下半部分截图（仅有「智能交付全书」，无「本卷批量确认」）。

### P1-4 保守模式下 completed 灰显不突出（关键待办被淹没）
- 问题：StatusBadge 中 completed、drafting、outline_only 三者同为灰色（nv-surface-3，:35-37）。但在保守模式（智能审阅关）下，completed 章需用户手动「提交确认」才是关键待办动作；灰显使其与纯草稿无区分，作者容易遗漏提交步骤。
- 位置：ChapterConfirmBar.tsx:35-37。
- 严重程度：P1（关键动作可达性）。
- 截图建议：保守模式下一张 completed 章确认栏截图，红框标灰显徽章与右侧需手动「提交确认」的动作之间的视觉脱节。

### P2-1 折叠交互两套范式并存（▸▾ 文本字形 vs chevron 图标）
- 问题：确认栏「全书智能交付」用 chevronRight/chevronDown 图标（ChapterConfirmBar.tsx:290）；而章纲折叠用文本字形 ▸/▾（CenterPanel.tsx:244），「更多」菜单用 ▾（LeftPanel.tsx:68），PostGenPanel「高级」Tab 也用 ▾（PostGenPanelTabs.tsx:68）。同一产品出现「图标 chevron」与「文本字形 ▸▾」两套折叠视觉，至少 3 处文本字形。云笔要求折叠面板统一，当前未达成。
- 位置：CenterPanel.tsx:244；LeftPanel.tsx:68；PostGenPanelTabs.tsx:68；ChapterConfirmBar.tsx:290。
- 严重程度：P2（一致性/学习成本）。
- 截图建议：同屏截取章纲折叠按钮、PostGenPanel「高级」折叠、确认栏「全书智能交付」折叠，标注字形（▸▾ 文本）与图标（chevron）差异。

### P2-2 PostGenPanel 关闭即清空 AI 诊断结论，与确认栏脱节
- 问题：确认栏「AI诊断」(onDiagnose) 触发 /review 并写入 reviewResult（page.tsx:1078-1091），PostGenPanel 依赖它显示审校 Tab。但只要用户点 PostGenPanel 的关闭「×」（onClose → reviewResult=null，page.tsx:1119），诊断结果立即清空；且智能审阅态文案「系统自动判定，仅拦截异常」(:211-212) 无法内联展示具体拦截理由，用户看不到刚才 AI 诊断的结论。
- 位置：page.tsx:1078-1091（onDiagnose）、:1096-1123（PostGenPanel 渲染）、PostGenPanel.tsx onClose 调用处（page.tsx:1119）。
- 严重程度：P2（信息连贯性）。
- 截图建议：点确认栏「AI诊断」→ PostGenPanel 出现审校 Tab 展示结论截图；再点 PostGenPanel「×」后确认栏区域截图（结论消失，仅剩「系统自动判定」泛化提示）。

### P2-3 自动交付开关反馈不对称 + 与按钮语义易混
- 问题：toggleAutoDeliver 开启时有 toastInfo（:84），关闭时无提示（仅乐观回滚）。开关操作反馈不对称。此外「自动交付」(Switch, 全局策略) 与「智能交付全书」(按钮, 立即执行一次扫描) 文案相近、同处一个折叠标题行（:283-313），作者易把全局持久开关误认为「本次是否自动交付」的临时勾选。
- 位置：ChapterConfirmBar.tsx:69-92（toggleAutoDeliver）、:283-313。
- 严重程度：P2（认知负担 / 操作反馈对称性）。
- 截图建议：确认栏交付区整行截图，框出 Switch「自动交付」与按钮「智能交付全书」的相邻关系与语义混淆点。

### P2-4 自动交付开关本地态不与 prop 实时同步
- 问题：autoDeliver 初始自 autoDeliverEnabled ?? true（:64），组件内无 useEffect 在 prop 变化时同步。若用户在别处（项目设置）改了 autoDeliverEnabled 而确认栏未卸载重挂，勾选状态会与实际库值脱节，直到切换章节刷新。
- 位置：ChapterConfirmBar.tsx:63-64，:69-92。
- 严重程度：P2（跨面板实时性边界）。
- 截图建议：设置页关掉自动交付 → 不切换章节直接回看确认栏 Switch 状态，验证是否仍显示旧值。

### P2-5 PostGenPanel 采纳后自动关闭，与确认栏无衔接引导
- 问题：「全部采纳」成功后 setTimeout(() => onClose(), 1500) 自动关闭（PostGenPanel.tsx:146）；采纳后确认栏仍显示「待提交/待确认」，两面板（分析 vs 确认）缺乏状态衔接提示，作者需自行回到确认栏操作，无「可前往确认」引导。
- 位置：PostGenPanel.tsx:143-146；page.tsx:1096-1123。
- 严重程度：P2（流程衔接）。
- 截图建议：点「全部采纳」→ 1.5s 后 PostGenPanel 关闭、确认栏仍「待提交」的截图。

### P2-6 PostGenPanelHeader 含 emoji 字面量（违反图标规范）
- 问题：saveMessage 判断是否以 ✅ 开头（PostGenPanelHeader.tsx:44），但 handleSave 实际生成「保存完成：…」（PostGenPanel.tsx:144），从不带 ✅——属死分支；且字面 emoji 违反 icons.tsx「UI 图标禁止直接用 emoji」规则（:7）。
- 位置：PostGenPanelHeader.tsx:44；PostGenPanel.tsx:144。
- 严重程度：P2（规范一致性 / 死代码）。
- 截图建议：点「全部采纳」后 Header 右侧 saveMessage 文本截图，确认无 ✅ 也走不到成功色分支。

---

## 四、改进建议（具体可落地）

### A. 状态语义按「是否还需人类动作」统一（对应 P1-1 / P1-4）
- 抽离单一 StatusBadge 组件，被 ChapterConfirmBar 与 CenterPanel 顶栏共用，消除两处口径冲突。
- 智能审阅开时：completed 文案改为「待系统定稿」、drafting 改为「生成中·将自动定稿」；已定稿章标注「自动定稿 / 人工定稿」来源（读 reviewLogs 的 auto-confirm 标记）。
- 颜色真正映射人类动作必要性：仍需人类动作=橙（如保守态 completed/pending_confirm），系统已处理/已定稿=绿，纯草稿=灰。解决保守态 completed 灰显被淹没（P1-4）。

### B. 自动交付成功强反馈（对应 P1-2）
- smartDeliver 成功路径（尤其 autoDeliver 静默分支 :176-179）补 toastSuccess 提示「整本已自动交付（共放行 N 章）」；并在交付区（即使折叠）短暂展示「已自动交付」绿色徽章，与底部「整本已确认交付」行互补，消除「没反应」错觉。
- 可选：扫描成功且 deliverOpen=false 时，自动展开交付区一次展示结果清单，再允许收起。

### C. 批量确认入口显式化 + 去重（对应 P1-3）
- 在确认栏交付区并列增加「批量确认本卷」按钮，复用已有 POST /api/story/nodes/batch-confirm（page.tsx:828 handleBatchConfirm），传入当前选中卷 nodeIds；与「智能交付全书」形成「本卷 / 全书」两级批量，明确区分范围。
- 左侧 LeftPanel「批量确认 N」保留，但当前卷存在 pending 章时，在非 batchMode 下也于大纲 Tab 底部常驻弱入口（不必先点「批量」），降低发现成本；两处 hover tooltip 说明「本卷/全书」差异，避免与 auto-confirm 混淆。

### D. 统一折叠组件（对应 P2-1）
- 抽离 Collapsible（chevron 图标 + 标题 + 可选描述），CenterPanel 章纲、LeftPanel 更多菜单、PostGenPanelTabs 高级、ChapterConfirmBar 全书智能交付全部改用，消除 ▸/▾ 文本字形（至少 3 处：CenterPanel.tsx:244、LeftPanel.tsx:68、PostGenPanelTabs.tsx:68）。云笔基准要求统一折叠。

### E. 诊断结论持久化 + 内联（对应 P2-2）
- AI 诊断（/review）结果写入后，不因 PostGenPanel 关闭而清空；在确认栏智能审阅态直接内联展示最近一次 AI 诊断的「拦截理由 / 综合分」，不必跳到下方 PostGenPanel；或把诊断 Tab 结论缓存到节点级 state，切换章节才清。

### F. 交付开关反馈对称 + 语义区分（对应 P2-3 / P2-4）
- toggleAutoDeliver 关闭分支也补 toastInfo（如「已关闭自动交付：全书定稿后需手动点整本交付」）。
- 新增 useEffect(() => setAutoDeliver(autoDeliverEnabled ?? true), [autoDeliverEnabled]) 修复 P2-4 的 prop 不同步。
- 文案上区分：Switch=「自动整本交付（项目级策略）」；按钮=「立即扫描并交付全书」。

### G. 采纳→确认衔接引导（对应 P2-5）
- 「全部采纳」成功后，确认栏对应章状态旁显示「本章分析已采纳」勾选态，并提示「可前往确认栏定稿」；或采纳回调后主动把确认栏滚动/高亮到当前章。

### H. 清理 emoji 死分支（对应 P2-6）
- 移除 saveMessage 是否以 ✅ 开头的判断（PostGenPanelHeader.tsx:44），改为按 saving/saveMessage 是否含「失败」判定成功/失败色，符合 icons 规范。

---

## 五、总结

本轮只读诊断聚焦「写章流程 + 确认流程」全链路。v1.1.1 已在功能正确性（智能审阅收敛、双模式、自动填表、自动交付、质量护栏）与基础风格（统一 Switch、checkbox→Switch、火箭图标、折叠标题/操作分离）上达标，上述已完成项不再列为待办。

体验层仍存可落地优化，按严重程度：
- P1（4 项）：状态徽章语义在智能审阅态误导（含 CenterPanel 顶栏口径冲突）、自动整本交付静默成功反馈不足、批量确认入口隐藏且双机制并存、保守模式 completed 灰显被淹没。
- P2（6 项）：折叠交互两套范式（▸▾ 文本字形 vs chevron）、诊断结论随面板关闭丢失、交付开关反馈不对称且语义易混、开关 prop 不同步、采纳→确认无衔接、emoji 死分支。

对照云笔参考站，最值得立即做：① 统一折叠组件（去 ▸▾）；② 状态语义按「人类动作必要性」统一并消除两处口径冲突；③ 确认栏内显式补「批量确认本卷」入口去重；④ 自动交付成功补 toast/徽章。以上均不破坏现有 API 与 数据模型，属纯前端体验增强，建议纳入本轮集成清单。
