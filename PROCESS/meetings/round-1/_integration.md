# MaxLoop Round 1 整合报告与改进清单

> 生成时间：2026-08-10
> Chair：主 Agent（千惠）
> 体验对象：novel-forge v1.8.9 故事线工作台（StorylineWorkbench / StorylineList / LeftPanel）
> 入口 URL：`http://localhost:3001/workspace/577ed326-b241-4f67-9481-c9332cb03626`
> 投票门槛：5 位 lens Agent，≥3 票（过半数）入改进清单；个例项由 Chair 据文件:行号证据背书后纳入。

## 一、原始报告索引（全部到齐）

| Agent | 报告 | 透镜职责 | 状态 | 发现数 |
|---|---|---|---|---|
| ui-ux-a11y | `ui-ux-a11y.md` | UI/UX 与可访问性（WCAG AA 实测） | ✅ | 16（F-01~F-16，无 P0 阻断） |
| frontend-engineering | `frontend-engineering.md` | 前端工程/性能/代码质量 | ✅ | 14（FE-001~FE-014） |
| copy-empty-state | `copy-empty-state.md` | 中文文案与空状态 | ✅ | 16（P0-01/02 + P1-01~06 + P2-01~10） |
| interaction-flow | `interaction-flow.md` | 交互流程与功能完整性（状态机/竞态） | ✅ | 18（001~018） |
| musk-perspective | `musk-perspective.md` | 马斯克第一性原理（删 50%/最短路径/收敛分叉） | ✅ | 18（MUSK-01~MUSK-18） |
| Chair（主 Agent） | `_chair-notes.md` | 现场读图+读源码独立发现 | ✅ | 10（C-01~C-10，C-07 已修） |

## 二、投票汇总与改进清单（IMP-xxx）

> 严重度：P0 阻断 / P1 重要（合规或体验硬伤）/ P2 次要 / P3 微调。
> 「票」= 直接提出或交叉印证的 lens 数（含 Chair 背书）。✅= 过半（≥3）或证据充分且 Chair 采纳。

### Round-1 实施批次（低成本高共识，本轮回闭环）

| ID | 严重度 | 模块 | 问题描述（文件:行号） | 提出方（票） | 改进方向（具体 before→after） |
|---|---|---|---|---|---|
| IMP-001 | P1 | a11y | 左列完结切换是 `<span onClick>` 非 `<button>`，键盘/读屏不可达 | F-01, FE-010, C-03（3） | 改 `<button type="button" aria-label={completed?'取消完结':'标记完结'} onClick={e=>{e.stopPropagation();onToggle();}}>`，复用右列详情已用的标准 button 范本 |
| IMP-002 | P1 | 对比度 | AI 生成按钮紫罗兰文字 on soft 底仅 3.75:1（要求 ≥4.5） | F-02（1+Chair） | 按钮改用实心 `.btn-creative` 风格（深底+浅字 #F0EEE8，对比度远高于 soft 底）；列表入口同改 |
| IMP-003 | P1 | 对比度 | 错误态「重试」链接 `--nv-primary` on 面板 3.79:1 不达标 | F-04（1+Chair） | 重试链接改用 `--nv-text-primary` 或加亮底，保证 ≥4.5:1 |
| IMP-004 | P2 | 对比度 | 输入框 placeholder 用 muted #8E8B82 = 4.33:1 临界 | F-06, C-06（2） | `DialogUI.tsx` 的 input 也加 `placeholder:text-[var(--nv-text-tertiary)]`（5.41:1）；globals.css 的 `input-glass::placeholder` 改用 tertiary |
| IMP-005 | P1 | 布局 | 左侧栏 `<aside>` 高度塌陷 283px vs 抽屉 805px | F-03（1+Chair） | `LeftPanel.tsx` 的 `<aside>` 加 `h-full`（或 `min-h-full`）；drawer 容器确保 flex stretch |
| IMP-006 | P0 | 文案 | 线索集标题硬编码「纸集」+「龙王寨/尸检报告」项目专属示例 | P0-01, C-02, MUSK-05（3）✅ | 改为 `线索集（伏笔、物证、人物备注等）`；去掉「纸集」与项目专有名词；相关 placeholder 通用化 |
| IMP-007 | P1 | 文案 | 「剧情线」vs「故事线」UI 层术语分裂（BackupDialog/ImportDialog/ForeshadowingPanel） | P0-02（1+Chair） | 面向用户的「剧情线」统一替换为「故事线」（UI 组件层，后台代码下轮） |
| IMP-008 | P1 | 轮询 | 轮询 `catch {}` 空吞网络错误，异常时无限空转卡死 | F-16, 交互003（2） | 累计网络错误次数，超阈值（5 次/约 30s）后 clearInterval + toast「生成状态同步失败，请重试」+ `setGenerating(false)`；并加最大轮询次数兜底 |
| IMP-009 | P1 | 轮询 | `startPolling` 设新 interval 前未清理旧 interval（双重轮询风险） | FE-004, 交互007（2） | 函数开头 `if (pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}` |
| IMP-010 | P1 | 断链 | 关闭弹窗 `setGenTaskId(null)` 丢任务 id，重开无法恢复轮询 | 交互002（1+Chair） | 关闭时仅卸载 UI，保留 `genTaskId` 直到任务 done/failed；重开工作台若有待处理 taskId 则自动恢复轮询 | ✅ **Chair 亲补闭环**：`StorylineWorkbench` 新增 `onTaskSettled` prop（L46-60 签名 + 轮询 done/failed 分支调用 L133-141）；`StorylineList` 渲染 `initialTaskId={genTaskId ?? undefined}`（任何打开均回传恢复轮询）+ `onTaskSettled={()=>setGenTaskId(null)}`（结算后清理）+ `onClose` 保留 `genTaskId` 不清除 |
| IMP-011 | P1 | 竞态 | 列表「AI生成」仅 `disabled={generating}`，批处理窗口内连点可建多个游离任务 | 交互001（1+Chair） | `handleGenerate` 开头加 `lockRef` 本地锁（或 `if(generating) return`），finally 释放 |
| IMP-012 | P2 | 文案 | `toastCreated("故事线","故事线")` 文案重复成「故事线 故事线已创建」 | FE-013, P2-07, 交互008（3）✅ | 改为 `toastCreated("故事线")`（只传实体名） |
| IMP-013 | P2 | 文案 | 「AI生成」（列表）vs「AI 生成」（弹窗）空格不统一 | F-15, P2-10（2） | 统一为「AI 生成」（带空格） |
| IMP-014 | P2 | 占位 | 七要素空值前 6 个显「—」、结局显「待收束」，标签又写「结局（待收束）」重复 | C-01（1+Chair） | 空值统一「—」或「未填写」；结局标签简化为「结局」，空值显「待收束」避免重复 |
| IMP-015 | P2 | 空态 | 时间轴空态仅一行弱灰字，未复用全局 EmptyState | F-11, C-05（2） | 复用 `<EmptyState icon="history" title="还没有章节进展" description="写作时会自动回写大事件" />` |
| IMP-016 | P2 | 错误态 | 加载失败用裸 div+button，未复用 ErrorState/Button | C-09, 交互018（2） | 改用 `<ErrorState ... action={<Button variant="outline">重试</Button>} />` |
| IMP-017 | P2 | 数据 | `handleCluePatch`/`handleClueDelete` 不检查 res.ok，失败静默且可能状态不一致 | C-08, FE-007, 交互010（3）✅ | 补 `if(!res.ok){toastError(...);return;}`；采用乐观更新+失败回滚 |
| IMP-018 | P2 | 数据 | 中间态「结局」字段可编辑但落库被强制 `ending:null` 静默丢弃 | FE-008, MUSK-14（2） | 中间态 ending 字段设为只读提示「结局将在落库后通过『标记收束』设定」，或移出 ELEMENT_META 编辑 |
| IMP-019 | P2 | 文案 | 中间态「额外要求」输入框是死输入（提交时不发送 genExtra） | 交互005, MUSK-07（2） | 文案改为「对下一次生成的补充要求（可选）」并说明当前草稿不含此内容；或落库时随 suggestions 附 extraPrompt |
| IMP-020 | P2 | 文案 | 「采用并落库/落库中/落库失败」jargon 暴露给用户 | MUSK-07, P1-01（2） | 按钮「采用并落库」→「保存到故事线」；loading「落库中…」→「保存中…」；错误「落库失败」→「保存失败」 |
| IMP-021 | P2 | a11y | 线索区编辑/删除图标按钮仅 `title` 缺 `aria-label` | F-05（1+Chair） | 补 `aria-label`（「编辑线索」「删除线索」），统一 icon-btn 约定 |
| IMP-022 | P2 | 布局 | 4px 自定义滚动条触控/粗指针难抓取 | F-12（1+Chair） | `@media (pointer:coarse)` 下加宽至 8-10px，或常显细滚动条 |
| IMP-023 | P2 | 文案 | 空状态缺 description 副文案（EmptyState 支持未用） | P1-04, P2-03（2） | 补 `description`：「让 AI 基于你的大纲自动规划主线与支线，填充七要素框架」 |
| IMP-024 | P2 | 文案 | abandoned 状态故事线完结按钮仍显「标记完结」，点了却变 active | 交互009, MUSK-03（2） | 按 status 显式区分：active→「标记完结」、completed→「重新开启」、abandoned→「重新启用」 |
| IMP-025 | P2 | 文案 | 时间轴「大事件」含义模糊 | P2-05, C-05（2） | 改为「关键情节节点」/「里程碑事件」 |
| IMP-026 | P3 | 死码 | `orphanSides` 含永假条件 `resolveParent(s)?.id===s.id` | FE-012（1+Chair） | 简化为 `sides.filter(s=>!resolveParent(s))` |
| IMP-027 | P3 | 文案 | 进度条 label「七要素 X/6」计数与「七要素」名不符 | FE-014, MUSK-13（2） | label 改「要素 X/6（不含结局）」，UI 标题可保留「七要素·总纲」并副标题注明 |
| IMP-028 | P2 | 样式 | 「放弃」按钮 `variant="outline"` + `btn-ghost` 可能叠加双边框 | F-14（1+Chair） | 核查 Button 组件 outline+btn-ghost 互斥规则，统一只用其一 |
| IMP-029 | P2 | 文案 | 省略号半角 `...` vs 全角 `…` 不一致（4 处） | P2-01, P2-02（2） | 全局 `...`→`…`；括号风格统一为全角（中文语境） |
| IMP-030 | P2 | 文案 | 「未知错误」兜底重复 8+ 处 | P2-03（1+Chair） | 抽 `UNKNOWN_ERROR` 常量；按 HTTP 状态码给友好文案（403/404/500） |

### 观察池 / 下轮（架构级，本轮回环处理）

| ID | 严重度 | 模块 | 问题描述 | 提出方 | 未入本轮理由 |
|---|---|---|---|---|---|
| D-01 | P1 | 架构 | 工作台用模态弹窗锁屏，与真后台异步生成自相矛盾；应改非模态侧边面板 | MUSK-04（1+Chair） | 大重构，需独立轮次；先做弹窗内轮询/断链修复（IMP-008/010）缓解 |
| D-02 | P1 | 性能 | 每次写操作 `onRefresh()`→`loadProject()` 全量刷新（N+1 refetch） | FE-002, 交互017, MUSK-09（3）✅ | 需引入局部刷新/缓存机制，独立轮次 |
| D-03 | P1 | 架构 | StorylineList 与 Workbench 重复列表/load/handleGenerate + 循环依赖 | FE-003, MUSK-02（2） | 抽共享 hook/组件，独立轮次 |
| D-04 | P0 | 测试 | 故事线组件/API 零单测覆盖 | FE-001（1+Chair） | 需建测试基建，独立轮次重点补 |
| D-05 | P1 | 架构 | 主线完结 newMain 仍走同步 LLM 且 fire-and-forget 无反馈；三条创建路径并存 | 交互004, MUSK-11, MUSK-12（3）✅ | 迁移到 generation-tasks + UI 反馈，独立轮次 |
| D-06 | P2 | 类型 | storyline-progress.ts 用 any 破坏类型链；form 用 Record<string,string> | FE-006, MUSK-08（2） | 类型收紧，独立轮次 |
| D-07 | P2 | 类型 | StorylineData.status 应为联合类型 | FE-009（1+Chair） | 随 D-06 一并 |
| D-08 | P2 | 文案 | 空线索集仍展示完整添加表单 | MUSK-16（1+Chair） | 与 IMP-015/023 同轮可顺带 |
| D-09 | P2 | 数据 | abandoned 状态无过滤/归档机制 | MUSK-15（1+Chair） | 与 IMP-024 同轮 |
| D-10 | P2 | 引导 | 空项目点 AI 生成无前置引导 | 交互011（1+Chair） | 与 IMP-023 同轮 |
| D-11 | P2 | 风险 | 真后台任务 Serverless 冷启可能丢失 | 交互013（1+Chair） | 架构风险，记入部署说明，非代码阻断 |
| D-12 | P3 | 文案 | 工作台 title 缺项目上下文 | 交互016（1+Chair） | 低优先，可顺带 |

## 三、马斯克决策（贯穿收敛）

按第一性原理，本轮聚焦「删 50% 噪音 + 收敛分叉 + 最短路径」：
- **收敛分叉**：AI 生成入口（IMP-002/011/013 统一文案与锁）、完结切换（IMP-001/024 统一为 button 与文案）、线索集标题（IMP-006 去硬编码）。
- **删冗余**：toastCreated 重复参数（IMP-012）、死输入额外要求（IMP-019）、多余 placeholder/死码（IMP-004/026）。
- **修矛盾**：轮询空 catch 卡死（IMP-008）、关闭丢任务（IMP-010）、结局静默丢弃（IMP-018）。
- **架构级**（D-01~D-05）确认存在但本轮回环处理，不过早叠加补丁。

## 四、Chair 备注

- 已提前修复 C-07（LeftPanel 过时注释）。
- 所有 IMP 均锚定真实文件:行号，无臆测；对比度数值来自 ui-ux-a11y 实测脚本。
- 双门禁（tsc 0 错 + vitest 全绿）由 Chair 在代码执行后亲验。
