# Novel Forge 更新公告

---

## v1.0.2 — 2026-08-06
**稳定性补丁：补漏提交 + 副本名叠加 + 缓存泄漏护栏（MaxLoop round-2 观察池复核收口）**

- 补入上轮漏提交：IMP-003 游戏导出自动回填设定库的前端 `toastInfo` 提示此前未进 v1.0.1 仓（仅在工作树），本轮补入并核验与 game-engine autoFilled 链路一致，消除「记录与代码不一致」假收敛
- 导入副本名叠加修复：`import/route.ts` forceNew 路径导入前先去除已有「（副本）」「（导入）」后缀再追加，反复导入同一备份不再叠加成「xxx（副本）（副本）」
- 监控缓存泄漏护栏：`stats/monitor/route.ts` 内存缓存加 512 容量上限，超限删最旧，长运行不再无限增长泄漏内存（原仅 set 不删）
- 质量门禁：tsc 零错误 + 211 单元测试全绿；round-2 观察池约 50 条 P2 经 Chair 亲自核查——2 项真实小瑕疵已修、1 项漏提交补入、其余误报/维持现状/需本地目测诚实标注不修

---

## v1.0.1 — 2026-08-06
**复检修复版：导出文件名乱码、监控全站红误导、游戏复导出堆叠三项 P1 修复（MaxLoop 阶段五复检循环）**

- 导出文件名乱码：markdown/txt 默认分支 Content-Disposition 补 `filename*=UTF-8''`（此前仅 HTML/EPUB/DOCX 三处，默认分支漏修致中文名乱码），现 4 分支一致，浏览器正确解码中文名
- 延迟监控全站红误导：GenerationLatencyPanel 改用 `useParams()` 从 `[projectId]` 路由段取 id，替代旧正则（要求尾斜杠、Next.js 默认无尾斜杠→匹配失败→全站红误导），修复后仅显示本项目真实延迟
- 游戏复导出正文堆叠损坏：endGameAndExport 改用原正文快照（进入游戏前拍 `originalContentSnapshot` 存会话）作前置，多次导出不再把上次全量当原正文叠加；新增 schema 列 + 真机验证脚本 `agent-game-reexport-stack-verify.cjs`
- 质量门禁：tsc 零错误 + 211 单元测试（较 v1.0.0 增 8 例监控/确认单测）全绿；防假收敛机制生效（6 透镜复检暴露 2 条 P1 假收敛 + 1 条游戏 P1 并全修）

## v1.0.0 — 2026-08-05
**🎉 正式版发布：Max Loop 全量收口，全功能确认与真机验证通过**

- 版本迭代线 v0.46.x → v1.0.0 正式版：确认流程体系（护栏统一/幂等/审校联动/填表溯源/日志同构/状态枚举）与体验减法（徽章三档/toast 收敛/交付一步化/弹窗记忆）全部收敛
- 全功能巡检：99 个 API 路由 vs 前端 106 处引用 0 断链；空按钮 0 处；导航链路完整；TODO/FIXME 0 处
- 正式版用户旅程真机验证（agent-release-journey.cjs）：真实 LLM 生成 3416 字 → 自动定稿（质量分 87）→ 整本交付，9/9 全绿
- 验证矩阵：tsc 零错误 + 203 单元测试 + 8 个真机验证脚本全绿 + 游戏模式真机全链路
- 诚实边界：lint 存量 2542 债待专项（增量已归零）；沙箱无 Chromium 视觉未目测；Vercel 部署需用户侧控制台操作

## v0.46.103 — 2026-08-05
**状态枚举全面落地 + lint 增量归零 + 游戏导出状态提示（Max Loop Round9 收尾，tsc 零错误 / 203 测试绿）**

- 状态枚举单一真相全面落地：story-status 新增 STATUS_* 单态常量，核心确认链路 10 文件（auto-confirm / [id] PATCH / batch-confirm / nodes / rollback / game-engine / post-processor / stats-monitor / projects-confirm / generate-write）字面量全部接入；gameSession.status 与会话无关保留原样
- lint 增量归零：confirm-guard 唯一 any 修复（Prisma.JsonArray）；eslint.config 对 scripts/*.cjs 豁免 require（CommonJS 标准用法）；ChapterConfirmBar icon 类型化 + 未用 prop 移除、PreGenConfirm loadCards 提升；存量 2542 债基线存档待专项
- 游戏导出状态提示：ended 屏按轻确认结果区分——自动定稿（绿·质量分）/待手动确认（橙），导出链路 UI 闭环可见
- 全量 203 测试绿；tsc 零错误

## v0.46.102 — 2026-08-05
**体验减法第二刀：智能交付一步化 + 生成前弹窗记住选择（Max Loop Round7，tsc 零错误 / 203 测试绿）**

- 智能交付一步化：扫描无拦截且本轮有放行 → 自动整本交付（点击 2→1）；有拦截时保持清单+手动交付
- PreGenConfirm 记住选择：同项目 localStorage 预填角色勾选/作者指令/新角色，减少重复操作、保留角色调度控制
- 回归修复：agent-smart-deliver-verify.cjs 正文加长 >150 字（结构门槛后脚本过时），回归 VERIFY_PASS（autoRate 100%）
- 全量 203 测试绿；tsc 零错误

## v0.46.101 — 2026-08-05
**体验减法第一刀：状态徽章三档收敛 + toast 三连弹收敛为一条（Max Loop Round6，tsc 零错误 / 203 测试绿）**

- 状态徽章体验减法：StatusBadge 对齐 story-status 六态枚举（删历史假态 rejected/revised、confirmed 收敛为「已定稿」、未知兜底灰显）；视觉三档——灰=进行中/待处理、橙=需行动、绿=已定稿
- toast 收敛：生成完成 3 连弹（自动填表/记忆召回/完成）收敛为 1 条合并 toast——填表信息并入完成 toast，召回信息走「宝宝流记忆召回面板」展示不重复弹
- 枚举单一真相落地：前端状态徽章与后端状态机同源（src/core/story-status.ts）
- 全量 203 测试绿；tsc 零错误

## v0.46.100 — 2026-08-05
**状态枚举单一真相源 + auto-confirm reviewing 遗留态/幂等虚报修复（Max Loop Round5，tsc 零错误 / 203 测试绿）**

- 状态枚举化：新建 src/core/story-status.ts（STORY_NODE_STATUSES 六态文档化 + StoryNodeStatus 类型 + CONFIRMABLE_STATUSES），取代散落状态字符串；applyConfirm 条件更新改引用 CONFIRMABLE_STATUSES
- auto-confirm 修 reviewing 遗留态：显式 skip 交人工（v0.46.90 前旧态不再写入新数据）
- auto-confirm 消费 applyConfirm 返回值：幂等跳过（并发/重试已确认）计入 skipped 不再虚报 confirmed，数据一致性修复
- 全量 203 测试绿（幂等回归全绿）；tsc 零错误

## v0.46.99 — 2026-08-05
**autoConfirmEnabled API 入口 + reviewLogs 结构统一 + 盲测扩展实证（Max Loop Round4，tsc 零错误 / 203 测试绿）**

- P8：projects/[id] PATCH 支持 autoConfirmEnabled 字段——智能审阅开关获得 API 写入入口，自动化/测试无需直连 DB 切换确认模式
- P6：post-processor 审校条目补 action:review + at，reviewLogs 全链统一为 {action, at, ...}（确认/提交/打回/重开/诊断/审校同构），前端可统一渲染；旧字段向后兼容
- 盲测扩展（+3 样本共 12）：400 字同一句劣质文 analyzer 打 64 分仍过线、250 字口号文 77 分——机械重复结构门槛是必要防线（否则凑字数长文仅凭分数会被自动放行）；假放行率 100% 证伪记录完整
- 全量 203 测试绿；tsc 零错误

## v0.46.98 — 2026-08-05
**填表残词过滤 + _src 溯源增强（Max Loop Round3·创造检验 P4/P5，tsc 零错误 / 203 测试绿）**

- 填表残词过滤（P4）：实证世界书冒「片空旷区域」类切词残留——extractKeyTerms 无残词过滤；修复加 BAD_PREFIX（量词/虚词/人称/方位词开头）与 BAD_SUFFIX（的/了/着/们结尾）过滤，宁缺勿滥；函数导出 + 3 单测（片空旷区域拦、林舟原保留、正常专有名词不受影响）
- _src 溯源增强（P5）：safeFillAfterWriting 接受 source，srcLabel 追加来源段（ch{order}:batch{id}:auto-confirm/manual/batch）；applyConfirm/PATCH/batch-confirm 三入口分别标记，填表事实可追溯确认入口；fill.ops 溯源断言向后兼容
- 全量 203 测试绿（新增残词过滤 3 用例）；tsc 零错误

## v0.46.97 — 2026-08-05
**质量分闸门盲测证伪 + 自动放行结构门槛 + 阈值单一真相源 + batch 幂等（Max Loop Round2，tsc 零错误 / 200 测试绿）**

- 闸门盲测证伪（scripts/agent-quality-blind-test.ts）：9 多样本跑 analyzeQuality，劣质/短/空文本全部 ≥60 分过线（73~100 分），假放行率 100%——纯统计正则测的是表面特征不是内容质量，分数不能作唯一自动放行依据；短文本与空文本都得 100 分，空正文拦截是唯一有效防线
- 自动放行结构门槛（confirm-guard）：分数评估前叠加 MIN_AUTO_CONFIRM_LENGTH=150（<150 字不自动放行）+ 机械重复检测（≥5 句且去重唯一率 <60% 判「同一句凑字数」）；盲测劣质样本全拦、优质长文正常放行，分数降级为看板参考
- 阈值单一真相源：新建 src/core/quality-thresholds.ts 共享 QUALITY_PASS_THRESHOLD，quality-analyzer 消除内部硬编码 60；batch-confirm 补 updateMany 条件更新幂等（TOCTOU 修复）
- 单测新增结构门槛 2 用例共 10 个、全量 200 测试绿；round2/idempotency/batch-guard 三验证脚本回归全绿

## v0.46.96 — 2026-08-05
**Max Loop Round2 审查修复：手动确认护栏+幂等 / auto-confirm 审校联动 / 非法分数拦截 / done 状态同步 / CI 套件可跑（tsc 零错误 / 198 测试绿）**

- 审查发现：代码审查（NaN/Infinity 分数可绕过拦截、CI 套件含 DB 集成测试 Actions 必红、auto-confirm 不消费 applyConfirm 返回值）+ 创造检验（真实 LLM 生成验证：done 状态过期、审校 passed=false 仍自动放行、三条确认路径护栏不一致、超时重试计数/日志不一致）
- 手动确认补护栏+幂等（PATCH confirm）：空正文/过短(<50字) 422 拦截；updateMany 条件更新（仅 pending_confirm 才终态），重复确认 409 不重复计数/追加——真机验证 agent-round2-guard-verify.cjs 全绿（422/409/计数 1→1）
- auto-confirm 审校联动：任一审校 passed=false（如逻辑自查 major 缺陷）blocked 交人工，对照无审校失败章正常放行
- confirm-guard 非法分数拦截：采信处补 Number.isFinite（NaN/Infinity 回退本地重算，杜绝 NaN<60 恒 false 绕过）；单测 8 个、全量 198 测试绿
- done 事件状态同步 + CI 套件可跑：write done 前重查库态（反映 auto-confirm 结果）；fill.selfcheck 集成测试 skipIf(!DATABASE_URL)，CI 无 DB 自动跳过不再必红

## v0.46.95 — 2026-08-05
**护栏统一收编 + 单测门禁 + CI 真闸 + 幂等守卫（Max Loop Round1·Step2 检验落地，tsc 零错误 / 197 测试绿）**

- 护栏统一收编（batch-confirm 修复空正文拦截漏洞）：实证 batch-confirm/route.ts 内联复制阈值/gradeOf/护栏逻辑且丢失空正文/过短(<50字)拦截——同一空正文章 qualityScore=90 走 auto-confirm 被拦、走 batch-confirm 被放行，阈值分裂；收编评估到 confirm-guard 的 evaluateConfirmEligibility（保留 batch:true 日志语义），真机验证 scripts/agent-batch-guard-verify.cjs 全绿（空章拦截/优质章放行/两入口一致）
- confirm-guard 单元测试：src/core/confirm-guard.test.ts 7 个（gradeOf 边界、空正文/过短拦截、60/59 阈值边界、null 回退 analyzer、旁路语义、analyzer 空文本高分佐证）；全量 vitest 13 文件 197 测试全绿
- CI 真闸：ci.yml 去掉全部 || true，新增 tsc --noEmit + npm test 硬门禁，lint:colors/build 硬门禁；lint 存量 2542 问题（1134 errors 历史 no-explicit-any 债）保留豁免并标注待专项清理
- applyConfirm 幂等守卫：updateMany 条件更新（仅 drafting/pending_confirm 才终态），重复调用不重复 increment/append reviewLogs；真机验证 scripts/agent-idempotency-verify.cjs 全绿（revisionCount 1→1、日志 1→1）

## v0.46.94 — 2026-08-05
**游戏导出轻确认闭环（Round1 遗留边界 #519）：游戏模式导出章节纳入统一确认流程，自动定稿 + 自动填表 + 看板可见（tsc 零错误）**

- 游戏导出轻确认闭环（#519）：endGameAndExport 改写——导出正文后先 evaluateConfirmEligibility 评估质量分并落 drafting，再按项目 autoConfirmEnabled 开关走轻确认（开启且达标则 applyConfirm：confirmed + safeFillAfterWriting 自动填表 + reviewLogs auto-confirm 标记），否则维持 drafting 手动确认；qualityScore 回写供确认看板可见
- 根治「游戏导出章节在确认流程与监控看板隐形」缺口：原直接写死 status:completed 绕开 auto-confirm/自动填表/qualityScore/reviewLogs，现复用 Round3 #1 的 evaluateConfirmEligibility + applyConfirm，零新增填表逻辑，与正式章节确认体系完全统一
- 真机验证（scripts/agent-game-light-confirm-verify.cjs 全绿）：主路径导出 confirmed + auto-confirm 标记 + qualityScore 回写；边界切 autoConfirmEnabled=false 后导出 drafting，与正式章节一致
- 运维铁律重申：改 game-engine 源码后 dev 需重启（或 HMR 生效）加载新代码，否则游戏导出仍走旧 completed 逻辑

## v0.46.93 — 2026-08-05
**确认 UI 减法 + 一键智能交付全书 + 真机生成验收（Round3 #516/#517/#518 全绿，tsc 零错误）**

- 一键智能交付全书（#518）：ChapterConfirmBar 新增「智能交付全书🚀」主入口，调 auto-confirm 扫描全书（合格自动放行、不合格进 blocked 附 reason）+ 内联展示放行/拦截清单 + 一键 confirm 整本交付；后端复用既有 auto-confirm 端点 + projects/[id]/confirm，scripts/agent-smart-deliver-verify.cjs 验证全绿（首扫放行 A/B 拦截 C→409→C改优质→二次放行→整本交付 200 + confirmedAt + autoRate=100%）
- 确认 UI 减法（#516）：智能审阅态收敛人工4键为「系统自动判定+AI诊断+人工接管(折叠)」，合格章零点击；confirmed 章显「已自动定稿」、重开降级小字；保守模式保持原4键。MonitorPanel 确认看板加「自动放行率」指标（monitor 端点 confirmStats 新增 autoConfirmed/autoRate，从 reviewLogs auto-confirm 标记统计）
- 真机生成验收（#517）：重启 dev 修复 stale Prisma 客户端导致 auto-confirm 静默跳过的环境坑（v0.46.92 加字段后未重启 dev，post-processor select 新列查询抛错被 catch 吞掉）；重启后真机生成一章→直接 confirmed+自动填表+auto-confirm 标记，人工零点击（VERIFY_PASS）
- 运维铁律重申：改 schema/新增字段后必须重启 dev 加载新 Prisma 客户端，否则 post-processor 的 select 新列查询会因 stale client 抛错被 catch 吞掉、auto-confirm 静默不生效（非代码缺陷，属环境 stale client）

## v0.46.92 — 2026-08-05
**智能自动确认（Round3 #1）：生成完合格章自动确认 + 共享质量护栏 + 项目开关 + 端到端验证全绿（tsc 零错误）**

- 新增 POST /api/story/nodes/auto-confirm：智能审阅模式下扫描项目下所有 drafting/pending_confirm 章（或显式 nodeIds），合格章自动确认（含 safeFillAfterWriting 自动填表），不合格章（空正文/过短/质量分<60）进 blocked 并附 reason；返回结构与批量确认端点一致，前端看板可复用
- 抽离共享护栏 src/core/confirm-guard.ts：evaluateConfirmEligibility（空正文/过短优先拦截、qualityScore 非 null 采信省分析、null 回退本地 analyzeQuality 零 Token、<60 拦截）与 applyConfirm（自动填表副作用 + status=confirmed），批量确认/自动确认/生成流水线三处复用单一 QUALITY_PASS_THRESHOLD=60 真相，消除阈值分裂
- Project 模型新增 autoConfirmEnabled Boolean @default(true) 开关；post-processor 生成完落库后 best-effort 调用 applyConfirm——若项目开启且质量达标直接 confirmed（含 SSE auto_confirm 事件），失败 catch 降级为 drafting 不阻塞主流程；db push 同步数据库并对已有项目自动填充 true
- 端到端真机验证 scripts/agent-auto-confirm-verify.cjs 全绿（VERIFY_PASS）：建沙盒项目→建3章（A/B 优质留空质量分实时算、C 短文本）→扫全书自动确认→A/B 86/A 放行 confirmed、C 正文过短拦截 blocked、最终态 a/b=confirmed c=drafting；护栏路径（实时分析+过短拦截）覆盖；tsc 零错误

## v0.46.91 — 2026-08-05
**批量确认本卷（MCCS Round2）：批量确认端点 + 左栏批量确认按钮 + 质量护栏拦截低分章 + 端到端真机验证全绿（tsc 零错误）**

- 新增 POST /api/story/nodes/batch-confirm：左栏批量模式勾选 pending_confirm 章节后一键确认；质量护栏 requirePassed 默认 true，仅放行 qualityScore>=60 的章，低于阈值（含无法解析正文）进 blocked 并附 reason，不被蒙混过关
- 左栏 LeftPanel 批量工具栏新增「批量确认 N」按钮（仅当 selectedPendingCount>0 时显示），workspace page.tsx 加 handleBatchConfirm 回调与 batchConfirming 忙态；确认后 loadProject 刷新 + 清空选择 + 退出批量模式，toast 汇总放行/拦截/跳过数
- PUT /api/story/nodes/[id] 补 qualityScore 透传（qualityScore: body.qualityScore）；undefined 时为 Prisma no-op 不影响现有手动保存，与批量确认端点「score==null 才回退 analyzer、否则用 DB 值」护栏设计一致
- 端到端真机验证 scripts/agent-batch-verify.cjs 全绿（VERIFY_PASS）：A/B 章 qualityScore 留 null 经实时 analyzer 打 90/A 放行、C 章 30 分拦截、最终态正确，护栏两条路径（实时分析兜底 + DB 低分直判）均覆盖

## v0.46.90 — 2026-08-05
**确认流程断点修复：写章后状态恒为 drafting（不再卡 reviewing 死锁）+ AI 智能体端到端验证 12 章全闭环（tsc 零错误）**

- 根因：generate/write 后处理管线把生成后节点状态定为 reviewing（审校未过时），而确认栏仅认 completed/drafting，导致生成完的章节卡在 reviewing 且无任何确认按钮，流程死锁
- 修复：post-processor.ts 生成后状态由 reviewing/completed 改为恒为 drafting（契合 Round1 规格「生成仅落 drafting、诊断是选项不是前置税」）；后处理六维质量审校仍写 reviewLogs/qualityScore 供 AI诊断展示，但不决定节点状态
- 端到端验证：AI 智能体真实建项目「火种：多行星文明备份计划」→ 真实 LLM 写 12 章（约 3.98 万字）→ 逐章提交确认/AI诊断/确认通过（触发自动填表）→ 第5章走打回重写闭环 → 整本确认完成🚀，全部按钮与状态机闭环通过
- 运维注记：dev server 旧进程加载的 Prisma 客户端不含新增 confirmed_at 列会导致确认 503，重启加载新客户端即修复（非代码缺陷，属环境 stale client）

## v0.46.89 — 2026-08-05
**确认流程（MCCS Round1 落地）：中栏确认栏4键状态机 + 左栏确认态色标 + 右栏确认看板 + 自动填表移至确认后（tsc 零错误）**

- 由7人格专项会议（乔布斯/智能体团队/PG/张雪峰/芒格/费曼/工坊）+3观测智能体（进度/质量/偏差）+Chair整合，maxloop迭代收敛出单一权威规格 agent-confirm-spec.md，决定所有确认按钮UI与计划流程
- 5态状态机：outline_only→drafting→pending_confirm→confirmed→project_confirmed；ContentStatus 扩 pending_confirm/confirmed 两态，StoryNode/Project 各加 confirmedAt 时间戳
- 中栏确认栏 ChapterConfirmBar：4键（提交确认/确认通过/打回重写须填理由/AI诊断）+ 整本确认完成🚀；左栏 OutlineTree 加 pending_confirm 橙、confirmed 绿色标；右栏 MonitorPanel 加确认看板（待确认/已确认/进度条）
- 最高杠杆修复：自动填表 safeFillAfterWriting 从写章后移至确认通过后才触发，根治未审视草稿污染设定库；AI诊断走纯本地六维质量分析（零Token、不依赖代理）真实可用

## v0.46.88 — 2026-08-05
**填表闭环对齐计划 P1-2：默认每章自动填表（fillFrequency 3→1、skipLatestChapter true→false）+ 已有项目数据迁移**

- 填表闭环对齐计划（P1-2）：默认 fillFrequency 由每 3 章改为每章填（1）、skipLatestChapter 由跳过最新章改为当前章也填（false）——写一章即触发自动填表，闭环可见不再隐形
- 填表频率/跳过配置从 schema @default 与 loop.ts fallback 两处同步改为每章填；并对已有 24 个项目数据迁移为新默认，本地立即生效
- 填表/召回可观测性本就具备（前端 toast 已显示「已写入 N 行」「召回 N 条」）；此前因默认跳过最新章导致填表几乎不触发、前端静默，用户误判未工作——现已修复
- 保留可配性：项目仍可在设置里调回频率/跳过（防重 roll 污染），默认值仅改为对齐计划 P1-2 每章自动填表本意

## v0.46.87 — 2026-08-04
**部署自检加固（P0-3）：doctor 补 Prisma client 生成检查 + 端口 3001 占用检测；全面自查 tsc/vitest/API/build 全绿（tsc 零错误）**

- doctor 脚本新增 Prisma client 生成检查：检测 src/generated/prisma/client.ts 是否存在，未生成时 fail 并提示修复命令——直击已知坑（safe-delete 拦截 prisma generate，dev server 看似能起但所有 API 报 Cannot find module）
- doctor 新增端口 3001 占用检测：启动前用 net.createServer 探测，被占时 warn，避免端口冲突启动失败
- 修正 Prisma 7 client 检查路径（client.ts 非 index.js），doctor 实测自检通过
- 全面自查：tsc 零错误、vitest 190/190 全绿、API health/projects/settings 全 200、npm run build 通过；用户提过的问题代码层全部修复；部署站 health 404+projects 500 为 Vercel 侧，代码已就绪

---

## v0.46.86 — 2026-08-04
**删 UI 噪声（智能体团队优化计划 P3·先减法后乘法）：顶栏导出/更多下拉收敛 + 右栏监测三面板默认折叠 + 左栏5→3 tab（更多▾收故事线/规则）+ 后处理提取常显其余收高级▾（tsc 零错误）**

- 顶栏收敛：原本 9 个按钮压到 7 个可见（零删任何功能）——「导出文件」与「复制全文」合并进「导出▾」下拉，「自动化」「工具箱」收进「更多▾」下拉；文风 / 大纲 / 摘要 / 导入书稿 / 备份包 保持常显；下拉用 relative z-50 容器 + fixed inset-0 z-40 遮罩，点击外部即关闭（Toolbar.tsx）
- 右栏监测默认折叠：监测 tab 内「叙事能量曲线 / 生成延迟 / 节点监测」三面板改为可点开折叠区块，默认全收起；折叠时不挂载子组件（三者均带 fetch），展开才加载，省首屏请求与渲染（RightPanel.tsx）
- 左栏 5→3 tab：大纲 / 角色 / 世界 三个高频 tab 常显，低频的「故事线」「规则」收进「更多▾」（activeTab 落在隐藏 tab 时「更多」高亮），功能零丢失（LeftPanel.tsx）
- 后处理面板去过载：5 个 tab 的「章节提取」常显，「废词检测 / 逻辑自查 / 本地蒸馏 / 审校」4 个高级分析收进「高级▾」第二行（默认折叠，有问题时高级入口显红点角标）；用内联双行展开规避 PostGenPanel overflow-hidden 裁切（PostGenPanelTabs.tsx）

---

## v0.46.85 — 2026-08-04
**生成延迟硬指标（P2）：LlmCallLog 加 durationMs/firstTokenMs 计时埋点 + GET /api/generation-metrics 延迟聚合 + 生成延迟面板（本地vs云端对比 + 2s 阈值标红）（tsc 零错误）**

- 生成延迟硬指标：监测 tab 新增「生成延迟」面板（GenerationLatencyPanel），展示首 token 延迟 P95、总延迟 P95、输出吞吐 token/s、样本数，总延迟 P95 > 2000ms 时红色警示「超过两秒就是失败」（智能体团队原话铁律）；本地推理（Ollama）vs 云端 API 总延迟 P95 横向对比条形
- 零新增 schema 主表：复用既有 LlmCallLog 加 durationMs（总耗时）/firstTokenMs（首 token 延迟）两可空字段，db push + generate；在 src/core/llm/client.ts 的 chat（端到端总耗时）与 chatStream（readStream 新增 onFirstToken 回调测到首个正文 token 的 TTFB）埋点，经 src/lib/llm.ts 的 recordLlmCall 落库，fire-and-forget try-catch 容错，绝不阻塞生成主流程
- 新增 GET /api/generation-metrics 路由（force-dynamic）：聚合最近 300 条成功调用（role 不以 fail: 前缀、durationMs 非空，剔除重试/失败记账避免失真），算首 token/总延迟中位 P95 均值、整体输出吞吐、按 Base URL 含 localhost/11434 分本地/云端对比，返回 overThreshold 标志供面板标红
- 直接验证 P0 本地推理整合收益：本地推理走本机 GPU 零网络往返、云端走 API 受代理/限流影响，作者拿到真实延迟分布即可量化「本地推理到底值不值」，把延迟从玄学变成可观测硬指标

---

## v0.46.84 — 2026-08-04
**叙事能量曲线（叙事物理引擎雏形·P1）：ChapterSummary 事件分层确定性加权能量 + SVG 折线峰谷标注 + 节奏诊断（tsc 零错误）**

- 叙事能量曲线：监测 tab 顶部新增「叙事能量曲线」面板，SVG 折线图展示各章叙事能量（张力）随章节起伏，自动空心圈标注峰值（accent 色）/谷值（success 色）章节并附能量数值；概览卡显示均值 / 峰值章 / 谷值章
- 能量计算零新 schema 字段：复用 ChapterSummary 既有 eventImportances（S/A/B/C 四级事件分层）+ keyEvents 密度，确定性加权 raw = 1.0*S + 0.7*A + 0.4*B + 0.15*C + 0.05*keyEvents，再 /3.0 截断到 [0,1]；按 StoryNode.order 排章节序（缺失顺序按 createdAt 兜底），一章多条摘要取最新
- 节奏诊断：computeNarrativeEnergy(@/core/narrative-energy) 含峰谷定位、能量方差、首末趋势（虎头蛇尾）、峰谷落差（张力过平 <0.15 / 起落强烈 >0.5）、连续下降段（≥3 章且累计降幅 >0.4 提示流失风险）、平缓平台（≥4 章张力不动提示打破单调），输出 1-3 条可操作建议
- 新增 GET /api/narrative-energy?projectId=xxx 路由（force-dynamic，只读聚合无副作用，缺 projectId 返 400）；NarrativeEnergyPanel 仿 MonitorPanel 风格 fetch 渲染，空数据给引导文案；整段 try-catch 容错不阻断监测 tab

---

## v0.46.83 — 2026-08-04
**伏笔收束率指标（确定性语义种子检测，复用五状态机）+ 本地推理垂直整合（Ollama 免 Key 一键预设）（tsc 零错误）**

- 伏笔收束率指标：伏笔面板顶部新增收束率进度条（payoffRate = (已回收 + 0.5*部分回收) / 活跃伏笔）与「重新检测」按钮；POST /api/foreshadowing/detect 扫描埋设点之后的章节摘要，用语义种子确定性回写 status / fulfillmentRatio / fulfilledAt，线头收没收得住一眼可见
- 检测零新 schema 字段：复用五状态机 + fulfillmentRatio，新增 detectPayoffs（回写）/ computePayoffStats（只读聚合）于 @/core/foreshadowing.ts；种子取「描述中文短语(≥3字) + closureConditions 闭环条件」，命中规则为闭环条件任一命中或描述短语≥2 → 已回收，仅 1 且仍埋设 → 部分回收，未命中维持原状（绝不降级已回收）；免跨表解析角色卡/世界书 UUID，可单测、零 LLM 调用、永不超时
- 本地推理垂直整合：设置页新增「本地推理 (Ollama)」一键预设（默认 Base URL http://localhost:11434/v1），测试连接放行无 Key，getSettings 本地分支免 Key，LLM 客户端本就 OpenAI 兼容零改动——本机 GPU 跑模型，零 API 费用；白痴指数视角下这是杠杆最高的单项优化（此前 DeepSeek 托管推理占外部成本 ~9x）
- 新增 POST /api/foreshadowing/detect 路由（幂等、异常 ok:false 不抛 500）；list 路由附只读 payoffStats；PUT /api/settings 接受空 llmApiKey 落库；dev 端口 3001 不变

---

## v0.46.82 — 2026-08-04
**伏笔后续发展思路：面板可编辑 + AI 依缝合怪多线原则自动推演方向并落库，新增 update 路由（tsc 零错误）**

- 伏笔面板新增可编辑「后续发展思路」区：展开任意伏笔即见 AI 依现有剧情（缝合怪多线推进原则：主线/个人线/事件线多速率兑现）推演的 2-4 句方向，作为写作参考指示；作者可手填自己的判断，或点「AI 重生成」让模型按最新剧情重新推演
- PendingCommitment 模型新增 developmentHint 字段并落库：作者手填与 AI 生成的方向都持久化，刷新面板后保留，不复写原有埋设/检测/回收/废弃状态机
- 自动生成接入两条伏笔计入路径：正文后处理本地蒸馏检出的伏笔（post-processor）与拆书抽取计入的伏笔（apply-extraction）在创建后异步 fire-and-forget 调 enrichForeshadow 落库，不阻塞正文生成、LLM 异常静默回退
- 新增 POST /api/foreshadowing/update 路由：支持手填 developmentHint / 描述 / 状态 / 优先级，以及 regenerateHint 触发 LLM 重生成；面板「保存方向」「AI 重生成」按钮调此路由并即时本地刷新

---

## v0.46.81 — 2026-08-04
**实体高亮固定色 + 表头图例 + 正文点击跳转设定界面：角色醒目橙 + 世界书各分类高对比固定色，配色单一来源收敛（tsc 零错误）**

- 角色卡固定醒目橙（#F97316），世界书各分类升级为高对比固定色（势力绿/物品金/地点天蓝/法术紫/功法红/生灵粉/文化青/历史靛/法则琥珀/货币柠檬绿/自定义灰）；固定色单一来源收敛到「src/core/entity-highlighter.ts」的 CHARACTER_COLOR / LORE_COLORS，API route、正文高亮 span、表头图例三者共用，消除此前 API 复制硬编码导致的配色漂移
- 表头图例：正文上方新增固定色图例行（角色 + 世界书各分类，色块 + 中文标签），一眼看懂每种颜色代表哪类实体，与「本章实体」彩色徽章互补（徽章是本章实际涉及、图例是全局色卡分配）
- 正文点击跳转：高亮 span 现带 data-entity-id 并 role=button / tabIndex 可聚焦，MarkdownViewer 新增 onEntityClick 容器层事件代理，点击正文内被高亮实体名即打开其设定界面（角色→角色编辑器、世界书→世界书编辑器），复用 CenterPanel 既有的 onEditCharacter / onEditLore；globals.css 统一 hover / focus 浅底高亮（去旧角色蓝硬编码）
- 颜色引擎补 id 透传：EntityHighlight / EntityRaw / EntityMatch 加 id 字段，buildEntityMapFromData 与 findEntitiesInText 透传 id，rehype 插件把 id 写入 span 的 data-entity-id，支撑点击跳转；固定色纯展示不引入额外状态，与「不需要别的」约束一致

---

## v0.46.80 — 2026-08-04
**顶部栏导入入口去重：删除冗余「导入设定」按钮，保留「导入书稿」（弹窗内可切设定/章节/快速模式）（tsc 零错误）**

- 删除顶部栏「导入设定」按钮，仅保留「导入书稿」：二者均打开同一个 ImportWizard 弹窗，仅 initialMode 预选不同（settings / chapters）；弹窗内「导入类型」选择器可自由切换「章节正文 / 设定文本 / 快速导入」，删一个不丢能力
- 清理接线：Toolbar 移除 onImportSettings prop 与对应按钮；workspace 页移除 onImportSettings 处理器，统一走 onImportChapters（默认 chapters 模式，设定模式在弹窗内选择）；刷新后顶部栏少一个重复入口

---

## v0.46.79 — 2026-08-04
**首页纸舟星海静态化：降低船密度 + 向日葵螺旋分散 + 停止巡游动画 + 降像素比减卡顿（tsc 零错误）**

- 停止绕圈巡游：PaperBoats 中 orbitSpeed 置 0，删除每帧 boids-lite 分离避让（O(n^2) 计算，卡顿主因之一）与逐帧旋转/缩放/摇晃/入场坠落；船水平固定、船头朝向建船时固定朝外，仅随波浪轻浮贴合水面（自然停泊感，非巡游移动），相机一次缓动到位后静止
- 降低密度：3D 船数封顶 MAX_BOATS=12（作品再多也只渲染 12 艘），下方按钮列表仍列出全部作品、可点击进入写作区；减少 Draw Call 直接降卡顿
- 均匀分散：改用向日葵（黄金角）螺旋分布，轨道半径随 sqrt(i) 增大、Z 拉伸由 0.6 提到 0.85，船阵天然均匀散开、互不重叠、不再聚堆
- 减卡顿：渲染像素比上限 1.75→1.5，削减海面着色器像素开销；底部说明由「水面随机巡游」改为「星海静泊」

---

## v0.46.78 — 2026-08-04
**会员股东 Round 12 收尾 UI 批量修复增强：语法高亮仅颜色 + 去词条统计、章纲默认折叠、游戏模式检测粒子/高亮回归 + 进度条 + 构思开头前置 + 自动推进开关（tsc 零错误）**

- 语法高亮仅颜色区分 + 去词条统计：globals.css 删除「非颜色区分线索」整块（11 类差异化下划线 + ::before 前导形状标记），rehype 去除 font-weight:600，实体高亮回到只用颜色、无前缀无下划线；MarkdownViewer 删除正文下方 EntityLegend 分类计数，章节名下方不再显示统计词条
- 章纲默认折叠：CenterPanel 大纲区改为默认收起的「章纲·已设」按钮，点击才展开文本/编辑；轻量章纲/抽卡分镜等生成控制常驻可见，长章纲不再常驻占屏
- 游戏模式检测粒子与高亮回归：GameParticles 重构为 forwardRef 暴露 emitBurst（爆发粒子系统），handleStart/handleAction 检测到新实体即触发；新增顶部「发现：角色·名/势力·名/物品·名」浮动提示层（3 秒淡出），修回此前丢失的检测反馈手感
- 游戏模式进度条 + 构思开头 + 自动推进：载入/每轮生成(generating)/导出(ending)均显示顶部进度条，导出额外弹覆盖层；就绪界面新增「构思开头」按钮 + 新接口 /api/game/concept（LLM 生成开场构思），可预览并「采用此构思开场」带入 /api/game/start（start 路由新增 concept 入参融入开场提示词）；自动推进升级为可点开关，开启后每轮自动续推、停止生成即暂停

---

## v0.46.77 — 2026-08-04
**会员股东 Round 12 魔王系统 N1 修复：推理模型(deepseek-v4-flash)游戏端点空正文闭环 + 全局输出预算保护（tsc 零错误，真机游戏 start/action 复测非空）**

- N1 根因：deepseek-v4-flash 是推理模型，先吐思考链(reasoning_content)且与正文共用 max_tokens 预算；game/start、game/action(processGameTurn)、章尾收束三处预算仅 800/800/400，全部预算被思考链吃光导致正文 content 为空，游戏开局与回合返回空叙事（Round 12 e2e 复测 N1 实锤：max_tokens=800→content 0，max_tokens=2000→content 461）
- 客户端层推理模型最低输出预算保护：resolveMaxTokens 命中推理模型正则(含 v4-flash/reasoner/thinking/o1 等)时 max_tokens 强制不低于 2500，非推理模型保持原设定；三处游戏端点字面量同时抬到 2500 做防御纵深
- readStream 现把 reasoning_content 的 token 计入 completionTokens，流式用量计数与最终 usage 一致，灭监测面板少算推理消耗
- 真机复测(dev:3001 真实 DeepSeek)：game/start 返回 narrative 619 字 + 4 选项 + 建 session(世界卡联动跑通)；game/action SSE 返回 game_done.narrative 653 字 + 4 选项；均非零、叙事连贯，N1 闭环

---

## v0.46.76 — 2026-08-04
**会员股东 Round 12 魔王复测回流补丁：Q1 碎片过滤补强（tsc 零错误）**

- 碎片过滤器补强（青砚 Q1 回流）：FRAGMENT_FUNCTIONAL 扩充谓语/描述字（像/显/似/裸/得/用/号/潮/退/醒/剪/搁/斜/进/泡/记/住/顿/隔/刺/撬/打/问/远/处/拉/第/推）；新增 FRAGMENT_COMMON_PREFIX（车/桌/椅/床/门/窗/桥/路/书/笔/纸/墨/碗/杯/锅/灯/锁/钟/鼓/鞋/帽/衣/裤/袜/墙/房/屋/街/市/店/缸/盆/桶/梳/玻/璃 等普通名词短语首字）与 FRAGMENT_COMMON_PHRASES（手指/社区/中心/本子/封皮/玻璃/位于）灭「车铃」「玻璃门」「手指骨」「社区中心门」「位于新城」；isCompleteEntityName 内加两道拦截
- 保召回铁律：刻意不收 之/地/比/亮/朝/甲/曲 等会误杀真实专名（龙陨之地/比干/孔明之亮）的字；2字 CJK 名直接命中不吞并，真实专名（含之/地/比/亮/渊/海等字）零误杀
- 回归测试 + 真实样本直跑：entity-detector.test.ts 新增 24 条漏网碎片全拦截 + 真实专名零误杀双用例；tsx 直跑 83 条真实漏网样本全拦、真实专名零误杀（RESULT=ALL_GOOD）
- 存量清理：测试项目 lorebook 91 条 `[自动发现]` 占位（105→14）清退，避免污染世界书

---

## v0.46.75 — 2026-08-04
**会员股东 Round 12 复验闭环：分支备份导入 P0 修复 + 填表透传溯源与跨表防错放 + 三卡检索去污染与匹配词边界 + 游戏动词闭环与轮次幂等 + 导入 deadline/口径闭环 + 监测面板按项目成本 + a11y 闭环（tsc 零错误）**

- 分支备份导入 P0 闭环（工坊 G1+W1）：原 strip 删必填 forkPointNodeId 致含 storyBranches 的 .nfproject 备份导入整库回滚零创建 → 占位 nodeMap 重映射闭合；parentBranchId 重映射灭悬空、选择性导入 lostForks 提示、事务超时 60s→120s
- 填表透传溯源与跨表防错放（墨白 M1+M2）：continue/refine 透传 nodeOrder/nodeId 修复 _src 恒 ch?:batchmanual 断章节溯源；写入前校验人物实体不匹配地理表则报错不写错灭错放（萧薰儿落妃嫔居住建筑表）
- 三卡检索去污染与匹配词边界（青砚 Q1+Q2+Q3）：实体抽取过滤句子碎片（右手拇指/核桃壳在他指）灭 47/49 碎片污染世界书；matchNameStrict 3字+ 覆盖区间吞并修中段嵌入（李星云剑法误命中李星云），2字分支保持不吞并保召回；entity-detector 填 aliases 复活去重、高亮补 2字尾边界与非颜色线索
- 游戏动词闭环与轮次幂等（阿游 A1-A4）：GameState upsert 幂等抗 P2002、前端镜像补 unequip/destroy/skip、ItemChange.operation 扩 7 值；OP_MAP 同义动词大扩 + 开局建世界卡 + owner 去重
- 导入 deadline/口径闭环 + 监测面板按项目成本 + a11y（磐石 P_a/P_b/P_c + 用户#16 + 清览 L1）：commit 全局 deadline 270s 优雅 partial、totalTokens 口径统一；monitor/route 按 projectId 分组聚合本月 llmCallLog，MonitorPanel 新增 AI 成本卡片（调用次数/token/费用/占比）闭合用户#16；a11y 补 aria-label 与暗色高亮

---

## v0.46.74 — 2026-08-04
**会员股东 Round 11 复验闭环：填表主链路溯源修复 + 建卡别名去重/变体收敛 + 游戏动词闭环与轮次唯一 + 抽屉焦点逃逸修复 + 导入并发/超时/口径闭环 + 正则 ReDoS 纵深防御（tsc 零错误）**

- 填表主链路修复（墨白 2 P1）：loop 透传 chapterOrder 修复自动填表写入行 _src 恒为 ch?:batchmanual 断线；全跳过不再误判 mislabeled 诱导破坏性重填，仅脏标记含幽灵 id 才提示清理
- 建卡别名去重与变体收敛（青砚 2 P1）：apply-extraction/autoCreate 把 aliases 纳入查重灭「炎帝/萧炎」双卡；isSimilarName 长名编辑距离收紧为 0 灭「青云宗/青云山」误并漏建
- 游戏动词闭环与轮次唯一（阿游 2 P1）：OP_MAP 补吞下/舍弃/解下/损毁/典当等同义动词 + 引擎增 unequip/destroy/skip 分支灭静默污染背包；GameState 加 @unique([sessionId,round]) 防并发重复轮次
- 抽屉焦点逃逸修复（清览 P1）：三页 inert 上移顶栏灭窄屏 aria-modal 顶栏焦点逃逸
- 导入并发/超时/口径闭环（磐石 4 P1）：commit 并发限流 + parse 全局 280s deadline 优雅 partial + B 路并入并发 + totalTokens 口径统一
- 正则 ReDoS 纵深防御（工坊 2 P2）：forbidden-checker/预设 regex 复用 ReDoS 防护前移 422 拦截

---

## v0.46.73 — 2026-08-04
**会员股东 Round 10 复验闭环：填表完整性（单章自检/skippedOps/同名异体告警/行级溯源/清脏标记）+ 游戏归属与前后端对齐 + 抽屉无障碍闭环 + 导入真实记账与并发 + 建卡去重/预设守卫（tsc 零错误）**

- 填表完整性闭环（墨白 4 P1）：单章填表跑归属自检 + 单 op 失败可追溯 skippedOps + 表内同名异体弱告警 + 行级溯源 _src/_ts + 清脏标记出口 API
- 游戏归属/前后端对齐/主线一致（阿游 3 P1）：开局物品带 owner 灭同名混淆 + 开场背包前后端对齐 + 同义动词不再静默丢物
- 抽屉无障碍闭环（清览 P1）：explore 右抽屉补 role=dialog/焦点陷阱/ESC 闭环 Round9 漏修的最后一抽屉
- 导入真实记账 + 去冗余 + 并发（磐石 3 P1）：parse 用真实 usage 记账 + globalContext 去冗余 + 分块 4 路并发解 300s 超时
- 建卡去重（青砚 P2）：apply-extraction 精确+繁简变体去重防重复卡
- 预设守卫（工坊 P2）：api_config 深合并 + 未知 type 返 400 杜绝静默失败

---

## v0.46.72 — 2026-08-04
**会员股东 Round 9 复验闭环：数字边界守卫 + abort 语义干净 + 填表死循环消除 + 流式成本可见 + 移动抽屉无障碍 + 正则回归修复/导入幂等落库（tsc 零错误）**

- 数字关键词边界守卫（青砚 P1）：含数字≥3字关键词（「2049年」）加数字边界，灭「12049年」误命中——纪年/编号不再被相邻数字延长串误伤
- abort 语义彻底干净（阿游 P1）：流式 abort 不再被误判为 LLM 调用失败，用户停止=优雅放弃本轮，不污染回放/对账
- 填表死循环消除（墨白 P1）：全跳过 error 结构化区分真无脏/误标 + 脏标记清除，灭无限重填
- 流式成本可见 + 崩溃孤儿锁清理（磐石 P1）：establishStream 加 stream_options 真实 token 记账；默认模型进 MODEL_PRICING 成本可见；commit 锁陈旧清理灭孤儿锁
- 移动抽屉无障碍（清览 P1）：三页窄屏模态抽屉补 role=dialog/焦点陷阱/ESC/背景 inert
- 正则回归修复 + 导入幂等落库（工坊 P1）：`?` 移出 repeated 集修复 Round8 误杀合法可选组；Project.importSource @unique + 并发 P2002 幂等

---

## v0.46.71 — 2026-08-04
**会员股东 Round 8 实现：OOC/召回死代码接线 + 游戏abort透传彻底化 + 填表假完成修复 + 幂等锁跨实例/弹窗无障碍（tsc 零错误）**

- OOC/召回死代码接线（青砚 P0）：删无调用 findCharacterByName 死代码，matchLoreEntries 接收 tables 并补表格关键列值进 knownNames，灭「李星云剑法」内 3字 lorebook key 误召回——Round7 修复落到真路径
- 游戏 abort 透传彻底化（阿游 P1）：chatStream 透传 AbortSignal，停止后 LLM 真正中断不丢 token；空流跳过 $transaction 提交幻影空轮次
- 填表假完成修复（墨白 P1）：babyloreFillAll 全跳过真返 ok:false 掩脏标记，灭静默假完成
- 幂等锁跨实例 + 工程加固（磐石/工坊 P1）：commit 幂等锁改 DB 唯一约束 ImportCommitLock（跨实例有效）替进程 Map；import_parse 失败 Flash 记账；buildLoreSample 中段分块覆盖；regex 补 (a?)+ 量词检测；import 外键 parentId/branchId 剥离重映射 + 幂等查重移入事务内
- 弹窗无障碍补全（清览 P1）：toast Confirm/Prompt 与 CommandPalette 补 role=dialog/aria-modal/焦点陷阱，灭读屏报不出名与键盘逃逸

---

## v0.46.70 — 2026-08-04
**会员股东 Round 7 实现：abort 信号透传自愈 + 幂等锁空载荷 DoS 修复 + OOC 词条误报回归 + 填表假完成/不可变更新 + 导入分叉重映射/正则重叠交替/事务超时 + 19 处弹窗 aria（tsc 零错误）**

- abort 信号透传自愈（阿游 P0）：game-engine processGameTurn 收 AbortSignal，提交前 aborted 则不提交轮次/背包；前端停止后拉 GET summary 读权威态，灭流式中断前后端重新错位
- 幂等锁空载荷 DoS 修复（磐石 P0）：commit 空载荷校验移到加锁前，400 提前返回不再阻塞合法写入
- OOC 词条误报回归（青砚 P1）：trigger knownNames 补章节词条/技能/功法长名，灭「李星云剑法」内 3字角色名误报 OOC
- 填表假完成 + 游戏健壮性（墨白/阿游 P1）：babyloreFillAll 失败真返 ok:false；前端背包不可变更新 + entities 去重
- 导入/正则工程加固（工坊/磐石 P1）：forkPoint 重映射恢复分叉；交互事务 timeout 60s；regex 防 (a|aa)+ 重叠交替；world 长文三段采样；commit 整体事务
- 弹窗无障碍补全（清览 P1）：19 处裸弹窗补 aria 关联（StyleEditor 两状态 + 17 处标题关联）

---

## v0.46.69 — 2026-08-04
**会员股东 Round 6 实现：3字+名最长匹配优先 + 游戏流式中断自愈 + 填表空章节静默丢数据 + 连词/介词高亮 + 中文复合数字 + 背包owner隔离 + import事务幂等 + 正则ReDoS防护 + Modal无障碍（tsc 零错误）**

- 3字+角色名最长匹配优先（青砚 P0-1）：matchNameStrict 3字+ 名撤销 Round5 前缀守卫改最长匹配优先，直接子串命中、仅当紧后 CJK 且能拼出 knownNames 更长名时被吞并，灭「李星云剑法」误命中；中文常规行文（李星云看见/碎玉轩内）恢复命中、世界书召回断裂修复；recall/trigger 传入候选实体名集合
- 游戏流式中断前后端自愈（阿游 P0-2）：新增 GET /api/game/state 权威对账 + reconcile，abort/断网后前端整体覆盖轮次/背包，灭前后端永久错位
- 填表空章节静默丢数据（墨白 P0-3）：完成门槛 ok→ok&&applied>0，空 ops/全失效章不标已填、可重试，灭防重复反噬的静默丢数据；update 非身份列未命中告警跳过不建伪行；跨表唯一名写错表告警
- 中文复合数字 + 背包 owner 隔离（阿游 P1）：parseGameQuantity 支持十二/一百零五等复合数字；背包变动按 (name,owner) 二元组隔离同名物品
- 导入/正则工程加固（工坊/磐石 P1）：import 包 $transaction 失败回滚不留孤儿 + projectId+source 幂等去重；regex 加 isLikelyUnsafeRegex 防 ReDoS 挂死；callFlash 60s 超时+重试；ImportWizard 消费 status/worldFailed；commit 加幂等锁；分块改字符预算
- 连词高亮 + Modal 无障碍（青砚/清览 P1）：entity-highlighter 补介词边界灭「在萧炎」不高亮；Modal 加 labelledBy/ariaLabel，9 调用点补语义名灭 WCAG 4.1.2 缺口

---

## v0.46.68 — 2026-08-04
**会员股东 Round 5 实现：游戏物品变动归一化落库 + 角色名2字匹配回归 + 填表伪行/游戏回退错位 + 导入失败标记闭环 + 弹窗滚动/连词高亮（tsc 零错误）**

- 游戏物品变动全部修复（阿游 P0）：game-prompts.ts 的 parseGameOutput 设唯一归一化点 OP_MAP，中文操作 获得/消耗/装备/丢弃 映射英文枚举 gain/consume/equip/discard；引擎/前端/开局英文比较全部生效，修复 Round4 新增 equip/discard 与既有 gain/consume、世界卡自动补建、开场入包全部落库失败
- 角色名 2字匹配回归修正（青砚 P0）：matchNameStrict 的 2字名由 Round4 两侧闭边界改回任一侧边界命中，修复叶凡/萧炎等最常见2字角色名在 OOC 与召回中全漏检（修正 Round4 过度收紧的回归）
- 填表伪行 + 游戏回退错位（墨白/阿游 P1）：填表 update/delete 缺有效 match 列时跳过并告警，灭静默插带脏键 undefined 伪行；跨表同类别(custom)同名也报归属待确认；空章不触发 LLM 填表；游戏回退后前端用后端重算 summary 整体覆盖 totalWords/items，灭字数虚高与背包残留
- 导入失败标记闭环（磐石 P1）：import/parse 新增 worldFailed 标志，非分块 A路角色提取与 B路世界/文风提取失败纳入计数，失败即 partial/failed，灭小项目与 B路失败仍谎报 completed
- 弹窗滚动 + 2字名连词边界（清览 P1）：bare 弹窗补 max-h+overflow-y-auto（Modal 默认固化）；2字实体名头边界集补连词与全角引号，灭「萧炎与炎帝」仅高亮萧炎
- 自动建卡/下拉/书卡/备份/预设/正则（青砚P2/清览P2/工坊P2）：2字名繁简归一化去重（萧炎/蕭炎 不重复）；暗色下拉 option 改不透明暗色；书卡窄栏降 1 列 + 标题截断；备份 include 键名对齐、预设 character 按名去重、正则失败告警、.nfproject 补 maxDuration

---

## v0.46.67 — 2026-08-04
**会员股东 Round 4 实现：一键填表静默丢数据 + CJK2字尾随误命中 + 实体高亮最长名优先回归 + import分块失败标记 + 游戏状态断裂三修（tsc 零错误）**

- 一键填表静默丢数据修复（墨白 P0-1）：fill.ts 的 applyOps 改为直接累积改 tables 内 t.rows（同一引用贯穿多章循环），上一章写回后 t.rows 即最新、下一章看到累积结果，灭「一键填表每章整体覆盖写回、静默丢失前序章」的数据黑洞
- CJK2字尾随误命中 + 单字名漏检（青砚 P0-1/P0-2/P1-1）：match.ts 新增 matchNameStrict（CJK2字闭边界 + 单字闭边界检测），trigger.ts/recall.ts 全面接线，灭「李星云剑法」误命中「李星云」与 OOC 单字角色名漏检；不改动 matchKeyword 本体、不翻案既有测试
- 实体高亮最长名优先回归（清览 P0-1）：findEntitiesInText 改为先收集所有候选（含重叠，lastIndex=idx+1）再按长度降序+idx升序贪心占用，灭「李星云剑法」误高亮「李星云」这类最长名被短名截断，保留 O(L+命中) 复杂度
- import 分块失败如实标记（磐石 P0-1）：import/parse 分块 failedChunks/totalChunks 计数，每块失败累加，importStatus=全成功 completed / 全失败 failed / 否则 partial，done 事件与 task 更新如实带上 status 与 failedChunks，灭「部分失败却标 completed」的误导
- 游戏状态断裂三修（阿游 P0-2/P0-3）：game-engine 的 itemChanges 补 equip/discard 分支（CI|装备/丢弃 真实改变背包）；gameState.create+gameSession.update 包 $transaction 灭两步写断裂；新增 DELETE /api/game/state 回退落库重算 currentRound/totalWords/plotProgress，前端回退按钮 async 调接口灭假回退；GameItem 加 equipped 字段、game-prompts 中文数字选项兼容一并提交

## v0.46.66 — 2026-08-03
**会员股东 Round 3 实现：监控第6盲区 + 数字子串误伤 + 实体高亮 O(N·L) + 表格告警标红 + 游戏选项承接（tsc 零错误）**

- 监控盲区彻底清零（磐石 P0）：import/parse 的 callFlash 每次 Flash 调用补 recordLlmCall（role:import_parse），成本看板第6处盲区清零，导入解析 token 不再漏记；babyloreFillAll 失败章不再被永久标记跳过（filledSet.add 加 if(r.ok) 守卫），失败章留待重试，灭「一次失败永久跳过」的数据死区
- 数字子串误伤 + OOC 暴力子串（青砚 R-F4 + OOC）：match.ts 纯数字关键词（如 2049）无论长度都走词边界判定，灭 2049 误命中 120499；findCharacterByName 角色名/OOC 查找改 matchKeyword 词边界匹配，灭「阿游」暴力子串误命中「阿克游说」；banned-words 拉丁/数字短词（长度≤2 且非纯中文）走词边界判定，保留中文词子串，灭 vx 误命中 avx
- 实体高亮 O(N·L) → O(L+命中)（清览 P1）：findEntitiesInText 改为单遍正则扫描（一次遍历文本命中所有实体名），复杂度从 外层实体×内层 indexOf+占用切片 降为 文本长度 + 命中数，长正文高亮不再卡顿，保留最长名优先与边界判定
- 表格填表告警 UI（墨白 F2/F3/F6）：单章自动填表卡补 warnings 渲染（此前只显示 operations/applied/error）；selfCheckFill 加跨表同名归属校验（同一名称值出现在≥2个类别不同的表 → 标记归属待确认，灭自动填表把人名写进地点表等误归属）；LoreTableGrid 新增 flaggedRows prop，自检问题行红色高亮
- 游戏选项承接 + 解析健壮（阿游 P1-1）：selectedOption 显式进入 prompt 承接上一轮选项分支（并从上一轮 states 补全选项文本），playerAction 持久化带选项编号；parseGameOutput 选项解析重写（基于连续编号行块判定选项区，编号放宽 1–6、超界丢弃不残留、同号只取首次）

## v0.46.65 — 2026-08-03
**会员股东 Round 2 实现：监控盲区清零 + 边界修正 + 导入合并归一化 + 正则校验前置（tsc 零错误）**

- 监控盲区清零（磐石 P0）：填表(babylore runFillForText)、大纲(generate/outline)、章纲(plan-chapter)、角色扩写(characters/expand)、导入合并(import/commit) 5 处裸 fetch 全部补 recordLlmCall，成本看板不再漏记这几路 LLM 调用；usage 取自 OpenAI 兼容响应的 data.usage，失败/缺字段安全回退 0
- 实体高亮边界修正（青砚 F1 收尾）：match.ts 英文/拼音 2 字关键词改为「两侧都须为词边界」才算命中（beforeBoundary && afterBoundary），灭 waitAI/xAI/AIx 紧贴拉丁字母的伪词误触发；中文关键词保持任一侧边界即命中
- 导入 AI 合并关系归一化（工坊 P1）：import/commit 的 AI 合并成功写入分支（characterCard.update）也走 normalizeRelationships，旧格式 {target,type} 自动转 {targetName,relation}，灭合并后角色关系静默失效
- 正则后处理校验前置（工坊 P1）：ProjectConfigPanel 保存规则前校验全部正则（含手改已有规则）合法性，非法正则阻止保存并提示，灭生成后处理时因非法正则崩溃

## v0.46.64 — 2026-08-03
**会员股东 Round 1 收口：填表/召回/高亮精度 + 导入健壮性（10 项逻辑修复，tsc 零错误）**

- 写章自动填表 ↔ 一键 fill-all 防重复打通（墨白 F1）：safeFillAfterWriting 成功填表后写入 .runtime 防重复标记；fill.ts 导出 markChapterFilled 共享；write 路由补传 nodeId
- 实体高亮修复（清览 P1 + 青砚）：2 字实体名尾边界放宽（仅查头边界），灭「2 字实体名几乎不高亮」；match.ts 新增 isBoundaryChar 区分中英文边界，灭「AI」等英文 2 字边界退化误触发
- 填表/召回精度（墨白 F5 + recall + 阿游 P2）：applyOps 的 update/delete 改大小写不敏感（灭「青龙镇/青龙鎮」漏匹配）；recall 按关键词特异性 score 降序截断（灭 200+ 词条截断丢长词）；ensureItemLorebook 移除字面量「物品」键灭召回噪音
- 导入健壮性（工坊 P1）：同批重复角色/词条去重（灭 createMany 重复行）；角色关系字段归一化（旧格式 target/type 自动转 targetName/relation，灭 sync-global-prompt 编译出 ?(?)）；babyloreFillAll 每章增量落盘（灭中途超时丢全部进度）

## v0.46.63 — 2026-08-03
**全面修复：填表灭错名 + 三卡检索词边界匹配 + 自动建卡相似度去重 + 一键填表自检 + 游戏物品归属联动**

- 填表引擎灭错名（Bug F）：tablesText 不再只给最近8行，改为给每个表附【权威名录·已有名称】（去重全量）+ 全量样例行（前60行截断保护），LLM 看不到全量才造地名变体的根因消除；强化提示词铁律（名称零杜撰/复用已有/完整性/填后自检）；applyOps 的 insert 加同主键名代码级去重（已存在则自动转 update），杜绝同名重复行；返回疑似错误地名警告
- 三卡检索词边界匹配（Recall/F 瞎匹配）：新增 src/core/text/match.ts（matchKeyword 长度≥3 直接命中、长度2 需处词边界、长度1 直接拒绝；dedupSubstring 最长匹配优先；scoreKeyword 长度加权）；trigger.ts/recall.ts 全面接入，灭掉「林」误命中「森林」这类瞎匹配与错内容注入
- 自动建卡相似度去重（entity-auto-creator）：精确查重之外加编辑距离 ≤1 且长度差 ≤2 的相似度判定，灭掉「青龙镇/青龍镇」「李尘/李麈」繁简/错别字变体重复入库
- 一键填表 + 自检 + 游戏归属联动：新增 babyloreFillAll（按 order 遍历所有有正文章节，首章→最新；已填章节用 .runtime 标记跳过防重复；填完自动跑 selfCheck 地名正确性 + 信息完整性）+ /api/babylore/fill-all 路由 + 表格页「一键填表（首章→最新）」按钮与自检报告；游戏背包物品加 owner 归属字段（默认主角），CI| 支持归属者且背包 UI 显示「归属：XX」，游戏获得新物品若无对应 item 类世界书词条则自动补建（保留已有物品词条）

## v0.46.62 — 2026-08-03
**UI 质检 P0：墨灵面板去重 + 项目设定可滚动 + 原生下拉暗色适配 + 正则规则弹窗统一**

- 墨灵面板去重（Bug A）：删除 ChatMessageList 空状态块里与 AIChatHeader 完全重复的「AI 写作助手就绪 / 我能直接查角色卡…」文案，空状态由头部统一展示，避免就绪提示出现两次；同步移出已无引用的 hasHistory/loading 解构参数保持 tsc 零警告
- 项目设定弹窗可滚动（Bug H）：BuildConfigDialog 的 bare Modal 补 overflow-y-auto，长内容（流派标签/开关）超出 90vh 时不再截断、可正常滚动
- 原生下拉暗色适配（I-1）：globals.css 新增 select option/optgroup 的 --nv-surface-2 背景 + --nv-text-primary 文字色，暗色主题下原生下拉列表不再呈高亮刺眼白底
- 正则规则 UI 统一（I-2）：项目配置中心加「正则后处理（清洗正文）vs 创作铁律（约束 AI）」区分说明；「+ 新增规则」由内联行改为与规则面板一致的模态弹窗（提交前用 new RegExp 校验正则合法性，非法 pattern 明确报错）；实测确认正则规则确实生效（applyRegexRules 已接 write/refine/continue 三路由并发送 postprocess_regex SSE 事件，属后处理非上下文注入）

## v0.46.61 — 2026-08-03
**纸舟星海重做：圆角真实船体 + 意境分层命名 + 舷窗图案旗帜 + 随机配色 + 绕圈巡游避让**

- 船体圆角精细化：makeHull 从长方体形变改为截面半圆放样（龙骨尖底→舷弧→甲板闭合环沿船长 25 站放样、首尾收尖），彻底告别长方体；核潜艇保留赞誉的圆柱圆角建模
- 意境分层命名 + 弱化真实名：首页文案与书栏改用意境名（暗夜金帆/赤骨怒潮/幽海磷光/云港巨舰/银锋迅影/深蓝潜蛟/无名漂流），真实船名降级为 tooltip 小字；按一层平波/两层扬帆/三层连云归类
- 舷窗 + 定制图案旗帜 + 武器放大：每艘船两侧加环形发光舷窗，按船型挂不同图案旗帜（骷髅/幽灵漩涡/星徽/雷达棱纹/波浪鳍/问号）；航母舰载机放大 1.3 倍并增至 4 架、驱逐舰舰炮导弹架放大
- 等比例放大 + 随机配色 + 绕圈巡游避让：整体缩放上调至 0.95–1.9 并相机后拉、抬升吃水线至船高下 1/3 不再半沉；每型随机亮色相邻不撞色、未命中题材归未名舰队；船只椭圆轨道各自航速巡游并做 boids 分离避让避免穿模

## v0.46.60 — 2026-08-03
**彻底清除 Flash 品牌露出：写作区「Flash 章纲」→「轻量章纲」+ 补全遗漏的占位符/注释文案**

- 写作区轻量预览按钮去 Flash 化（v0.46.59 遗漏）：CenterPanel 的「Flash 章纲」按钮改名「轻量章纲」，同步清理其提示词输入框 placeholder（Flash 轻量预览提示词 → 轻量预览提示词）与按钮 title（移除 V4 Flash 字样）；功能不变，仍走默认模型
- 注释与占位符清理：chapter-outline/draw、agent/analyze-chapter、import/commit 三处「v4-flash 常返回…」健壮性注释改为中性「模型偶发返回…」；import/commit 文件头与合并引擎「V4 Flash」→「AI 模型/模型」；ProjectConfigPanel 模型名占位符示例 deepseek-v4-flash → deepseek-chat
- 全量 grep 复核：src 下 UI 与生成/分析/导入路由已无任何用户可见 Flash 字样
- 保留项：settings/page.tsx 与 lib/llm.ts 内真实模型默认值（用户需选型）、自动生成 Prisma 客户端、历史 CHANGELOG 记录均不删——非误导标签，移除会破坏功能或丢失记录

## v0.46.59 — 2026-08-03
**交互打磨：移除 Flash 模型名 / 游戏章纲剧情感知 / 目标字数默认3000 / 快速文本框跳转即丢 / 游戏入口常显 / AI助手面板活现化**

- 移除 Flash 模型名：快速章纲/抽卡/多章大纲删除「v4-flash」误导标签与「用 V4 Flash」复选框；实际模型始终走数据库默认设置，未硬编码 Flash
- 游戏模式：章纲生成注入活跃剧情线感知（与抽卡/快速章纲一致）；大纲树游戏按钮改为常显 + 清晰提示，入口可发现；后端 /api/game/start 实测可用
- 目标字数默认 3000 且可调（写作区 + write 路由兜底同步）；快速文本框（作者指令/章纲提示词/微调指令）移除 localStorage 与服务端持久化，导航即丢
- AI 助手面板活现化：渐变发光头像 +「墨灵 AI 写作助手就绪」+ 能力说明 + 实时统计条（总字数/角色/词条/节点）；试试 chips 加图标、发送按钮渐变发光、预设芯片更生动
- 章首高亮确认：rehype SKIP_TAGS 含 h1-h6/blockquote，章头不高亮，实体收集只在右侧面板 + 正文下方图例，已满足

## v0.46.58 — 2026-08-03
**全面质检升级：名字高亮优化 / Agent「墨灵」/ 备份选择 / 导入合并 / 正则预设 / 记忆衰减说明 / 游戏模式教程与融合**

- 名字高亮：章头（标题）不再高亮只正文高亮；常用词停用表防误判（世界卡/角色卡等完整词条名正常高亮）
- Agent「墨灵」：命名+渐变高亮身份；「能做什么」教学；设置页模式开关（默认可操作，只读=仅查信息后端禁写）；与 28 个工具联通
- 备份：导出/导入前弹窗勾选「保留哪些设定」；修复中文文件名 500 隐藏 bug
- 导入：书稿/设定合并进同一向导（书稿分章+抽卡 / 设定仅抽三卡）；摘要加确认（范围+产出说明）
- 正则：项目配置中心「从预设添加」（不用手写名字）；记忆衰减设置页说明；游戏模式首次教程+已有正文带入
- 诚实边界：tsc 0 + dev 200 + 备份 include 实测；视觉项需浏览器实跑验收

## v0.46.57 — 2026-08-03
**质检化处理：章纲人话化 + 章纲剧情感知 + 编辑保护（P0/P1/P2 全实施）**

- 章纲人话化：抽卡/章纲生成改自然语言六小节（场景/事件/人物/悬念钩子/伏笔/情绪），去 C| R| 代码前缀；抽卡卡片改人话分区展示（不再等宽字体+彩色代码标签）
- 章纲剧情感知：章纲生成注入活跃剧情线（含七要素）+ 上一章钩子 + 最近摘要——不再盲写，与剧情预设一致；实测第四章自动承接「周远征循潮痕追陈牧、龙渊叶凌云天台棋局」
- 编辑保护：章纲预览编辑后未确认写入就关窗 → confirm 防丢；保存边界铁律固化（正文自动保存 / 定义要求类显式保存 / 半成品不进上下文）
- 计划文档 PROCESS/QUALITY_PLAN.md（用户先审后实施）；tsc 0 + dev 200 + 回归实测
- 诚实边界：DeepSeek 并发限流偶发空卡；旧格式章纲卡片自动兼容展示

## v0.46.56 — 2026-08-03
**修复全局快捷键系统无限更新循环（Maximum update depth exceeded）**

- 根因：register 每次注册/注销 setVersion，而 context value 的 useMemo 依赖 version → ctx 引用变化 → useShortcut effect 重跑 → 注销再 setVersion → 无限循环（workspace 4 个快捷键同时注册时必现）
- 修复：register/注销不再触发 setVersion（注册表是 ref 实时读取，无需 state 参与）；value 依赖移除 version，ctx 引用稳定，注册零渲染
- 调用方依赖审计：handler 走 ref、combo/description 常量、opts 取标量——无其他循环源
- 诚实边界：tsc 零错误 + dev 200；快捷键速查功能不变

## v0.46.55 — 2026-08-03
**终极实验修复轮：抽卡/上下文预览/Agent 分析 JSON 解析鲁棒性 + 写作空正文容错**

- 全链路实测「新城 · 龙陨之地」：设定导入（16 角色+12 词条+文风）→ 主线 → 章纲/抽卡 → 写 3 章（2120/1140/1933 字）→ 后处理全管线 → 创意工坊 → Agent 工具调用，全部跑通
- 修复①抽卡 JSON 解析：v4-flash 的 markdown 包裹/尾逗号/截断 JSON 导致 3/3 解析失败 → 多级容错 + 正则兜底，修复后 2/3 成功
- 修复②上下文预览不读 project.authorNote（作者指令显示「无」）→ 回退数据库指令，验证通过
- 修复③Agent 章节分析 JSON 解析失败 → 同款鲁棒解析
- 修复④写作偶发空正文静默 done（还污染摘要）→ 空内容改明确 error 提示重试，实测生效
- 数据修正：16 角色关系字段格式（修复 ?(?) 编译）+ 樊斯瑞错误别名；globalPrompt 预编译验证通过（16 角色+55 词条+关系网）
- 诚实边界：DeepSeek 并发限流/偶发空响应为外部限制（重试即成功）；tsc 零错误 + dev 200

## v0.46.54 — 2026-08-03
**修复「我的作品」书卡不可见（入场动画依赖 observer 时序导致永久透明）**

- 根因：书卡初始 opacity:0，靠 IntersectionObserver 触发 is-visible 才显示——观察器未触发（挂载时机/10% 阈值/滚动拦截）则永久透明：书在 DOM 里可交互（hover 特效还在）但看不见
- 修复：数据加载完成后直接逐张播放入场动画（零异步依赖），is-visible 加 opacity:1 兜底（动画异常也强制可见）——每本书 100% 显示
- 排查：全局 opacity/visibility 扫描无其他隐藏源；tsc 零错误 + dev 200
- 诚实边界：动画改为页面加载后即播完（滚动到时书必完整可见），放弃「滚动到才浮现」叙事

## v0.46.53 — 2026-08-03
**船亮色涂装 + 光照提亮 + 主题按钮修复 + WebGL 降级兜底（诊断修复轮）**

- 船太黑修复：六种名船高辨识亮色涂装——黑珍珠亮金、复仇女王猩红、荷兰人幽绿、航母浅灰蓝甲板、驱逐舰浅蓝灰、核潜艇亮银（黑帆保留名船特征）；环境光 0.9→1.4 + 新增半球光 + 月光 0.85，所有船清晰可见不再只亮 8 艘
- 主题按钮修复：顶栏 z-index 10→40（滚动后不再被内容层覆盖导致点不动）；「示例/导入备份」窄屏隐藏，主题切换按钮常驻可点
- 我的作品：本地实证正常（API 200 + 9 部作品）；Vercel 线上站无数据库 /api/projects 500 → 线上永远空白，以本地为准；新增 WebGL 降级兜底（3D 失败不再拖垮整页组件树，作品区任何情况下都能显示）
- 整页提亮：暗角 0.48→0.22、网格降档、canvas 背景与雾色从近黑提到深海蓝 0x0a2a55
- 诚实边界：tsc 零错误 + dev 200 + 诊断六维度全绿；亮色涂装观感需浏览器实跑验收

## v0.46.52 — 2026-08-03
**主页调亮对比加强 + 顶栏悬浮下移 + 现代名船（黑珍珠/复仇女王/荷兰人/航母/驱逐舰/潜艇）**

- 调亮：页背景/卡片/文字全提亮一档（#0E1424 + 近白文字 17:1），书封书架同步亮化并补 color-mix 兜底（老浏览器不再一团黑）
- 顶栏：sticky top-2 悬浮圆角浮起，不再贴死顶部，系统提示文字完整可见
- 现代名船：黑珍珠号（黑色三桅黑帆金饰）、复仇女王号（黑胡子旗舰+骷髅）、飞翔的荷兰人（幽灵船幽绿光）、航空母舰（宽平甲板+舰岛+斜角甲板+甲板舰载机「子舰=作品」）、驱逐舰（舰桥+主炮+导弹架）、核潜艇（围壳+潜望镜）；题材→名船映射重排，交互全保留
- 精简：删「设计说明」四卡区块，区块说明压成一句；预览文件重写同步
- 诚实边界：tsc 零错误 + dev 200；现代船为低模程序化建模；Vercel 线上站无数据库作品区不可用，以本地 dev 为准

## v0.46.51 — 2026-08-03
**纸舟星海换回真实船型（用户指令：不要纸船，设计成真实的船型）**

- 恢复六种实体船模：乌篷（竹篷+长橹）/ 楼船（飞檐暗窗顶饰+墨红旗）/ 帆船（受风帆+桅索）/ 渔船（吊杆网具舱房）/ 龙舟（龙首+鼓+尾鳍）/ 机关舟（金属+冷蓝光缝+天线）
- 材质真实化：船体浅木纹（真实木船）、木料深木纹、帆布纹、竹篾篷、金属机关舟；删除宣纸纹与折纸工具
- 保留：漫画海 + 旋转缩放 + 悬浮书名 + 点击确认「你确认要进入《书名》吗？」+ 掉落扑通 + 真灯≤8
- 诚实边界：tsc 零错误 + dev 200；预览文件重写同步；船观感需浏览器实跑验收；Vercel 展示站未自动部署

## v0.46.50 — 2026-08-03
**纸舟/作品区交互与视觉升级（确认进入/悬浮书名/虚空特效/书架设计感）**

- 交互：点击纸船或书栏先弹确认「你确认要进入《书名》吗？」，确认后进写作区；鼠标悬浮纸船顶部浮现书名 chip；写作页返回按钮补 title/按下反馈（返回首页本就生效）
- 视觉：纸舟舞台切角棱框 + 折纸角装饰（有棱有角）；作品区加「+ 新建小说」卡（点进探讨模式）；书名放大加粗；hover 每本书呈现不同「虚空」特效（题材色光圈+黑洞，位置随序号变化）；书架加顶部横梁/底部底座/书脊纸页纹理
- 诚实边界：tsc 零错误 + 路由 200 自查；confirm/特效观感需浏览器实跑验收；Vercel 展示站未自动部署

## v0.46.49 — 2026-08-03
**三档主题系统（夜航/白昼/苍青）+ pipeline 自查全绿**

- 主题系统：三档 UI 风格——夜航（暗色·默认）/ 白昼（浅色）/ 苍青（新增青绿深色风格，整套 Void Glass 令牌换青绿系）；ThemeToggle 升级为三档选择器（图标+当前名+弹出菜单+勾选态），localStorage('nf-theme') 持久化，首屏防闪烁脚本三档
- 兼容处理：苍青同时挂 azure+dark 类保留 Tailwind `dark:` 变体，shadcn 组件在苍青下不失效；theme-color meta 同步
- 入口：首页顶栏新增常驻主题切换按钮（设置旁）；设置页「外观」区改「界面风格」三档说明
- pipeline 自查全绿：tsc 零错误；路由矩阵全 200（含 /workspace/{id}/tables；/tables 独立页 404 属正常已删入口）；顶栏 9 按钮 + 书架卡片按钮齐全；SSR 含主题脚本/三档菜单/纸舟星海/RuiTri 标记；OPTIMIZATION_PLAN 46 项 ✅ 全闭环
- 诚实边界：主题观感（尤其苍青色系配比）需浏览器实跑验收；线上 Vercel 展示站未自动部署

## v0.46.48 — 2026-08-03
**纸舟星海改版：漫画海 + 各式小纸船 + 旋转缩放 + 点击直达写作区**

- 海面漫画风：亮蓝主色 + 白色浪花线 + 扩散同心波纹（seaFrag 换色），清除色/雾/光照同步提亮
- 船改纸船（用户指令"不用真的船，改成各式各样的小纸船"）：删高模真船部件与金属/暗部/旗材质，新增折纸工具（纸板/纸杆/A 形纸棚/斜纸帆）；六种折法——经典/塔式/双帆/平筏/长龙/尖角，数量与作品一一对应，题材→折法映射保留，makeHull 段数降到 8/4 更棱角
- 交互：拖拽旋转视角（yaw/pitch 缓动跟随）+ 滚轮缩放（radius 6~26）；点击纸船或书栏直接 router.push 进入 /workspace/{id}（移除聚焦面板，一条直达）；入场从 12 高度掉落 + 落水扑通沉浮
- 书架清理与真书：书架只渲染真实项目（无占位假书），每本书按题材显示不同立体书封；右下角署名 GitHub + RuiTri；首页文案与设计说明更新（船即作品/灯即活性/海即漫画/点击即入）
- 诚实边界：tsc 零错误 + dev 200 + SSR 含「纸船进入写作区/RuiTri」标记；纸船为程序化折纸近似；预览文件重写同步；线上 Vercel 展示站仍为旧版

## v0.46.47 — 2026-08-03
**作品区书架化 + 纸舟材质/水/动感修饰（用户验收反馈一轮）**

- 书架：作品区 ProjectCard 升级为 3D 立体书（题材色渐变封面+左侧深色书脊+底部书页厚度），网格容器加书架板背景（一排排整齐立书）；hover/焦点「从书架抽出」突出效果（上浮+发光+题材色辉光），暗/浅主题双适配；卡片信息与入口全部保留
- 纸舟材质：宣纸纹（船体）/木纹（木料）/帆布纹（受风帆）/竹篾纹（乌篷）四种 Canvas 纹理客户端惰性构建（SSR 安全），船从平涂色块升级为有质感的墨色一笔；机关舟金属壳更名 METAL_MAT
- 水与动感：双层波波幅 0.16/0.11→0.19/0.13，海面 fresnel 增强+浪花高光 foam；船起伏摇曳 ±0.06/±0.05→±0.10/±0.07；系统「减弱动态」下船仍随海起伏（仅相机静止）
- 聚焦增强：点击船聚焦放大 1.15→1.32、相机推进 lerp 0.06→0.085
- 诚实边界：tsc 零错误 + dev 200 + SSR 含 nf-book3d 标记；纹理为程序化近似；预览文件重写同步；线上 Vercel 展示站仍为旧版（GitHub main 已更新，展示站未自动部署）

## v0.46.46 — 2026-08-03
**去花哨·回到实用版型：保留 3D 模型动态与 ≤8 真灯，所有书全量显示**

- 去花哨（页面层 + 海面层）：删除首页极光背景 AuroraBackground、星尘粒子 ParticleField（含卡片 hover 派发的 `nf-particle-attract` 联动）、Hero 光晕与轨道装饰；海面移除星点、船头加性光晕 sprite、光尾、涟漪、航线光带；仅留平静墨海 + 小船轻晃 + ≤8 真灯诚实受光；删除无引用源文件，设计说明「尾迹即坚持」改「舟即起伏」
- 保留与增强：6 种真实船型（乌篷/楼船/帆船/渔船/龙舟/机关舟）含高模细节（楼船飞檐暗窗顶饰、龙首下颌双眼鬃毛、楼船墨红旗、渔船渔网、龙舟鼓与尾鳍、机关舟侧鳍天线）；随墨海起伏 + 轻微摇曳；真灯池仍封顶 8，灯亮则船身受光；题材色折痕晕染保留
- 所有书显示 + 入口确认：首页 `/api/projects` 全量返回（含旧设置/题材骨架项目），ProjectCard「进入工作台 →」与纸舟书栏选书均正确路由 `/workspace/{id}`（已验证 HTTP 200）；3D 小船点选聚焦后「打开这本书」同路由
- 诚实边界：tsc 零错误 + dev 200 + SSR 无极光/粒子/光晕残留标记；修复渔网贴图模块顶层调用 `document` 的 SSR 报错（改客户端惰性创建）；3D 观感仍需浏览器实跑验收

## v0.46.45 — 2026-08-03
**纸舟星海 maxloop 第1轮：BoatFactory 6 真实船型 + ≤8 真灯性能纪律**

- 设计计划：六方董事会（PG/乔布斯/智能体团队/费曼/张雪峰/芒格）报告 → Chair 整合落盘 `会议/纸舟星海小船设计/整合.md`；共识=船型即语义、结构真实三要素、保留原 UI、性能纪律、统一墨色语法、真实≠堆细节
- BoatFactory：`makeHull` 参数化船体 + 部件库（篷/桅+受风帆/楼舱+飞檐/龙首/网具/冷蓝发光缝），`createBoat(type)` 按配方拼装，换船型=换配置不写新类；落地乌篷/楼船/帆船/渔船/龙舟/机关舟 6 型，题材→船型映射表驱动
- 性能纪律：全局真 `PointLight` 封顶 8（仅焦点+最近/最活跃），其余发光球+加性光晕 sprite 假光；共享船体/帆/篷材质；保留船大小=字数、灯亮=活跃度、光尾=连续性、折痕光=题材色语义；底部书栏+详情卡按钮、从书栏进入全部不变
- 诚实边界：tsc 零错误 + dev 200 + SSR 含关键标记验证；3D 观感（轮廓辨识度/墨色统一度）需浏览器实跑与用户验收，第2轮聚焦高模+真灯受光、第3轮 LOD+实例化收口

## v0.46.44 — 2026-08-03
**首页 UI 升级·润色修复（Phase 4）：stagger 致命修复 + 粒子场润色 + 无障碍**

- 致命修复：首页项目卡片 stagger 观察器时序——原 `useStaggerOnView` 用空依赖，网格在 loading 后才挂载导致观察器从未挂上、卡片永久 `opacity:0` 不可见；改为依赖 `ready` 标志（!loading && projects.length>0），数据加载完网格挂载后再挂 IntersectionObserver，卡片真正浮现
- 粒子场润色：粒子上限 90→150、密度公式放宽（area/16000），4K 等大屏不再稀疏；reduced-motion 增 `change` 监听，系统设置中途切换也能正确停/启动；`pointer:fine` 才做鼠标视差，触屏不抖
- 无障碍：项目卡片删除按钮在 `group-focus-within`/`focus-visible` 时也显形，键盘用户能看见并触发删除（原本仅 hover 显形）
- 诚实边界：tsc 零错误 + dev 200 验证；卡片可见性修复经代码审查确认（条件渲染 + ref 时序）；粒子密度/reduced-motion 实时切换/触屏行为需浏览器实跑最终确认

## v0.46.43 — 2026-08-03
**首页 UI 升级·联动润色（Phase 3）：卡片 stagger 入场 + 粒子聚拢**

- 项目网格包 `home-stagger` 容器，卡片进入视口逐张 `nf-card-in` 上浮入场（IntersectionObserver，间隔 60ms）
- 卡片 hover/focus 经 `window` 事件 `nf-particle-attract` 向粒子层注入目标点，附近星点轻微聚拢、移开弹性回位（局部受力、INP 友好）
- 入场动画作用于外层 `home-stagger-item`、hover 起伏作用于内层 `ProjectCard`，互不冲突；reduced-motion 双层降级
- 诚实边界：tsc 零错误 + dev 200 验证；首屏 loading 渲染骨架屏不含项目网格（已审查）；首页升级三阶段收官

## v0.46.42 — 2026-08-03
**首页 UI 升级·交互状态补全（Phase 2）：active 凹陷 / focus 间隙 / 骨架屏 / Bento 空态**

- 主按钮 `.btn-primary:active` 叠加 inset 凹陷阴影（沿用 --dur-micro 150ms）；全局 `button:focus-visible` 加 4px 透明间隙（ring-offset 随主题切换），键盘焦点更清晰
- 加载态由三点脉冲改为 `ProjectCardSkeleton` 骨架屏（与 ProjectCard 同形 + shimmer-line 流光），禁通用 spinner
- 空态三张等宽卡改不对称 Bento：主引导卡跨整行放大、副卡并排错落，避免 AI 默认三等分
- 诚实边界：tsc 零错误 + dev 200 + SSR 含 shimmer-line 验证；Bento/骨架屏观感需浏览器实跑；Phase 3 待续

## v0.46.41 — 2026-08-03
**首页 UI 升级·背景签名层（Phase 1）：极光漂移 + 星尘粒子**

- 新增 `src/components/home/AuroraBackground.tsx`（Layer A 极光）：fixed z-0 pointer-events-none 容器内 3 个超大模糊光斑（blur 120px，靛蓝/紫罗兰/金），仅动 transform/opacity 做 38~50s 极慢漂移呼吸，与 body 三层径向渐变叠加成流动星云
- 新增 `src/components/home/ParticleField.tsx`（Layer B 星尘）：canvas 2D 星点（60~90 按视口动态上限，30% 三色族点缀）+ 邻近星图连线；DPR 适配、requestIdleCallback 延迟启动、prefers-reduced-motion 静态降级、visibilitychange 暂停、鼠标视差、浅色主题重着色
- page.tsx 根 div 注入两固定层；Hero section 与 main 提至 relative z-10 确保内容在背景之上；globals.css 补 .aurora-blob 关键帧 + .light 降透明度适配；锁定三色族、在 Void Glass 体系增量升级，不重写
- 诚实边界：tsc 零错误 + dev 200 + SSR 含新标记验证；背景观感需浏览器实跑；Phase 2（状态补全）/3（联动润色）待续

## v0.46.40 — 2026-08-03
**清理 10 个 @deprecated API 端点（BE-8 收官）：死代码删除**

- 删除 10 个标记 `@deprecated` 的 API 端点路由文件（约 130KB）：`tools/execute`、`generate/detect-entities`、`generate/update-cards`、`generate/apply-updates`、`lorebook/summarize`(+`apply`)、`lorebook/import`、`lorebook/expand`、`pending-items`、`presets/[id]` 的 GET/PUT/DELETE
- 两轮交叉核验确认零 live 引用：全 src grep `@deprecated` 定位 10 个路由文件；再全 src（.ts/.tsx）搜路径串与无 `/api/` 前缀串，确认仅出现在 changelog 历史与路由自身注释——前端 `fetch` 与后端 route-to-route 调用均为 0；当初 BE-8 标注「与 U5 冲突保留」现证为过度谨慎
- 保留 `presets/[id]/apply` 与 `presets/[id]/fork`（创意工坊套用/复刻，活跃调用）；保留 `PendingItem` Prisma 模型（删路由不影响模型，ORM 层移除需迁移、无害故留）
- 诚实边界：文件式 API 路由删除不触发 tsc 报错，安全网靠全量 grep 零引用 + tsc 零错误兜底；未在浏览器逐个点击对应按钮验证（纯删除、无 UI 改动）；`core/llm/client.ts` 的 9+ `@deprecated` 导出仍被迁移期调用方引用，不在本次范围、保留

## v0.46.39 — 2026-08-03
**UI 审计·按钮清理（#217-2/#217-3）：导入按钮厘清 + 次级行去重**

- 导入按钮厘清（#238）：顶部栏「设定」→「导入设定」、「导入」→「导入书稿」，并补 tooltip 厘清主职责——`SettingsImporter` 粘贴设定文本拆三卡（不建章节）vs `ImportWizard` 粘贴整本书稿自动分章+抽卡；二者主输出不同（建章节树 vs 不建），强行合并会丢能力，故厘清而非硬并
- 次级按钮行去重（#240）：移除与「工具箱」对话框完全重复的「结构化表格」(`/workspace/{id}/tables`)、「创意工坊」(`/workshop`)；保留「项目设定」(`BuildConfigDialog`) / 「记忆衰减」 / 「项目配置」(`ProjectConfigPanel`) 并补 tooltip 区分
- 厘清「项目设定」（小说骨架：题材/受众/剧情结构/力量体系/金手指/风格标签）与「项目配置」（书名/模型/LLM 参数/作者注）职责不同、非重复，仅补说明
- 诚实边界：未做浏览器端到端实跑；「设定」与「导入」的概念重叠靠标签/tooltip 厘清而非删组件，若要把 `SettingsImporter` 轻量拆卡并入 `ImportWizard` 属更大重构、超出本次审计清理范围；tsc 零错误

## v0.46.38 — 2026-08-03
**UI 审计·文风机制整合（#217-1）：顶部栏文风控件统一 + 创意工坊文风联动**

- 文风控件统一（去重）：进入小说界面顶部栏原并排两套文风控件——基于 `styleCard` 的标签按钮（`/api/projects/[id]/style` GET 不返回 `styleDescription`，永远退化成空按钮）与只读硬编码 `STYLE_TEMPLATES` 的 `StyleSelector` 下拉，数据源错位且冗余；统一为单一「文风」入口，实时显示当前激活风格（`getTemplate(styleTemplateId)` 解析，未命中显示「✏️ 自定义文风」），点击打开 `StyleEditor` 统一风格中枢
- 删除冗余的 `StyleSelector` 头部下拉组件；`Toolbar`/`page.tsx` 清理 `styleCard`/`onStyleSelect`/`povLabel`/`ProjectData` 等未用引用；修复 `page.tsx` 加载时未水合 `styleTemplateId` 的隐性 bug（`setStyleTemplateId(styleData.styleTemplateId)`），按钮加载即显示真实风格
- 创意工坊文风联动：`StyleEditor` 新增「工坊文风」Tab，异步 `GET /api/presets?type=style` 拉取公开文风预设；「套用」把 `content.styleDescription` 并入本项目「风格笔记」、`povType` 与 `dialogueRatio`/`descriptionRatio` 按比例同步进 12 维度，并调 `POST /api/presets/[id]/apply` 同步更新 `StyleCard` 分析模型——文风与创意工坊真正联动（此前工坊文风预设只写 `StyleCard`、不驱动生成）
- 诚实边界：工坊文风「套用」为追加式（不覆盖用户原有风格笔记/维度）；`StyleCard` 三卡分析模型保持独立，仅作分析参考，生成仍以 `Project.llmConfig` 文风配置为准；未做浏览器端到端实跑（tsc 零错误 + 复用已验证 PUT 链路）

## v0.46.37 — 2026-08-03
**时间线视图（#216 收口）：FE-N6 左侧大纲新增「时间线」视图 + 节点世界时间标记**

- 时间线视图（FE-N6）：`StoryNode` 新增 `worldTime String?`（书中世界时间自由文本，如「天启三年春」／「星历2049」），已 `prisma db push` 同步本地 PG17 并 `prisma generate`；左侧大纲根 `volumeView: boolean` 二态重构为 `viewMode: "volume" | "flat" | "timeline"` 三态，与分卷/平铺并列；`OutlineTree` 新增时间线分支——过滤非卷节点、按 `worldTime` 字符串升序排序（未标记排末尾），每行渲染世界时间徽标 + 类型图标 + 标题 + 字数，点击即选中
- 视图切换：`LeftPanel` 切换 UI 改为「分卷 / 平铺 / 时间线」三按钮（沙漏图标），`page.tsx` 状态 `volumeView` → `viewMode` 枚举并下传 `onSetViewMode`
- 世界时间录入与持久化：`CenterPanel` 节点控制栏新增「世界时间」输入框（失焦/回车经 `handleSaveWorldTime` 回写库）；`PUT /api/story/nodes/[id]` 的 `data` 补 `worldTime: body.worldTime`，复用 FE-N8 乐观锁 `expectedVersion` 与冲突面板；`StoryNodeData` 类型补 `worldTime: string | null`；tsc 零错误
- 诚实边界：时间线排序用纯字符串序（不解析语义时间），作者想精确控序需填可比较文本（如统一前缀）；卷节点不参与时间线排序；#216 全部收口（ARCH-3/ARCH-6/ARCH-1/FE-N8/FE-N6 完成），ARCH-4 迁移历史维持暂缓

## v0.46.36 — 2026-08-03
**保存冲突乐观锁（#216 收口）：FE-N8 非流式保存带版本戳 + 冲突解决面板**

- 🔒 保存冲突乐观锁（FE-N8）：`StoryNode` 新增 `editVersion Int @default(1)`（每次 PUT 成功 +1）；`PUT /api/story/nodes/[id]` 支持可选 `expectedVersion`，条件更新（`where` 含 `editVersion`），库版本不符返回 409 + 库里当前快照（`conflict:true`）；无 `expectedVersion` 的旧调用走普通更新；并发窗口 `P2025` 也降级为 409
- 🧩 新建 `SaveConflictModal`：收到 409 弹出，并排展示「我的版本」与「库里版本」，三选项——用我的（覆盖）/ 用库里的（载入服务端）/ 保留双方（库里版本存为节点备注 `notes`，我的版本覆盖）
- 🖥️ 前端 3 处保存接入乐观锁：`handleSaveNode`（正文）/ `handleDrawSelect`（抽卡章纲）/ `onEditOutline`（大纲编辑）均携带 `expectedVersion`、成功回写新 `editVersion`、409 转交冲突面板；`StoryNodeData` 补 `editVersion` 字段
- 🚫 诚实边界：未处理「AI 流式改写直接覆盖未提交 textarea」的 UI 受控问题（UI 层，需单独改大纲编辑绑定）；`GameOutlineEditor` 等其它 PUT 暂未带 `expectedVersion`（兼容旧调用，不误冲突）；tsc 零错误

## v0.46.35 — 2026-08-03
**合并 LLM 抽象（#216·批次2）：ARCH-1 非流式调用统一到 core/llm 门面**

- 🧩 合并两套 LLM 抽象（ARCH-1）：新增统一门面便捷函数 `completeText(system, prompt, { model?, temperature?, maxTokens?, role?, config? })` 于 `src/core/llm/client.ts`，内部走 `getEffectiveConfig()` + `createLLMClient(config).chat()`，复用已验证的指数退避重试 + 故障转移链；6 个 API 路由（characters/classify、storylines/generate、generate/chapter-outline[+draw]、lorebook/import、lorebook/summarize）的非流式调用全部从旧 `callLLM`/`callSiliconFlow` 迁到 `completeText`，原 temperature/maxTokens 参数保持不变
- 🧹 删除旧层死代码：`src/lib/llm.ts` 的 `callLLM`/`callSiliconFlow`(别名)/`LLMCallOptions` 接口已移除——旧层降级为纯工具库，仅保留仍被大量引用的 `getSettings`/`mapLLMError`/`recordLlmCall`/`testLLMConnection`/`MODEL_PRICING` 价格表
- 📦 移除死依赖 `openai`：全源码无任何 `import "openai"`（统一门面与旧封装均用原生 fetch），已从 `package.json` + `package-lock.json` 删除并 `npm install` 同步
- 🚫 诚实边界：未强删 `core/llm/client.ts` 内 9+ 个 `@deprecated` 导出（仍有引用方，强删会破坏构建）——「合并」务实落地为「非流式调用统一走新门面」，而非字面删除全部 deprecated 符号；tsc 零错误

## v0.46.34 — 2026-08-02
**架构与测试收口（#216·批次1）：ARCH-3 输入校验层 + ARCH-6 测试护栏**

- 🛡️ 集中输入校验层（ARCH-3）：新增 `src/lib/validators.ts`（手写轻量类型守卫，零新依赖）——`asStr/asStrOrNull/asStrArray/asInt/asBool` + `ValidationError/badRequest` + `readValidatedBody(request, validate)` 统一入口（JSON 解析失败或字段校验失败返回 400，绝不直接进 prisma）；给 `characters/lorebook/story-nodes/rules` 四个裸信任入参的写路由补校验（projectId/name 必填、字段类型与长度约束），脏数据在落库前被拦下；`config` 路由已有手工 typeof 守卫 + 范围校验，标注合规不重复改
- 🧪 测试护栏（ARCH-6）：新增 `vitest.config.ts`（node 环境）+ `package.json` 加 `test` script（`vitest run`）；首个单测 `src/lib/__tests__/utils.test.ts` 覆盖 `safeJoin` 八分支（含 JSON 字符串数组解析、数字数组过滤），实跑 8 passed，验证管线可用
- 🚫 诚实边界：ARCH-3 未引入 zod（本地工具求轻，手写守卫已达成「防 500/防脏库」目标）；ARCH-6 目前仅纯函数测试，API 路由 mock 测试留后续；#216 其余子项（ARCH-1/FE-N8/FE-N6）待续，ARCH-4 迁移历史标注暂缓（schema 与 3 旧迁移已漂移，本地 db push 够用，强行 migrate 有重建全表风险）
- ✅ tsc 零错误；新增 devDep vitest；首个测试 8 passed

## v0.46.33 — 2026-08-02
**前端新功能（#215）：FE-N5 全局快捷键系统 + FE-N7 网文合规违禁词预检**

- ⌨️ 全局快捷键系统（FE-N5）：新增 `src/components/ShortcutProvider.tsx`，根布局挂单一 keydown 监听 + 注册表，各页面用 `useShortcut(id, combo, desc, handler)` 注册（卸载自动注销）；workspace 页接入 `mod+s` 保存、`[` 折叠左栏、`]` 切换右栏、`n` 新建章节；安全护栏：非 mod 组合在输入框内自动忽略不打断打字，带 mod 组合（如 mod+s）在输入框也照常；首次进入自动弹速查（localStorage 记忆可关），设置页「快捷键」板块实时渲染已注册列表
- 🚫 网文合规违禁词预检（FE-N7）：新增 `src/lib/banned-words.ts` 内置基础词库 + 自定义追加/重置；导出路由 `/api/projects/[id]/export` 新增 `?check=1` 模式（只扫描返回命中清单：词 + 行号 + 上下文，不生成文件）；`ExportDialog` 真正导出前先调 `?check=1`，命中即弹确认清单，可坚持导出或取消
- 📋 设置页增补：「违禁词管理」板块（展示内置词数、自定义词追加、一键重置）+「快捷键」速查板块（从已注册列表实时渲染）
- ✅ tsc 零错误、零新运行时依赖

## v0.46.32 — 2026-08-02
**后端深化与导入（#214）：BE-5 导入任务异步化 + FE-N3 多格式导入**

- 📥 多格式导入（FE-N3）：导入向导新增 `.epub`/`.docx` 支持，浏览器端用 jszip 解压抽取纯文本（epub 读 `xhtml/html`、docx 读 `word/document.xml` 按 `w:p` 段落），喂给现有 `import/parse`（仅收 `rawText`），后端无需感知格式；新增 `src/lib/manuscript-parse.ts` + `accept` 放宽到 `.txt,.md,.epub,.docx`
- ⚙️ 导入任务异步化（BE-5）：Prisma 新增 `ImportTask` model（status/progress/result/error/importMode/projectId，对齐已验证的 DissectionTask 模式），本地 PG17 已 `prisma db push` 同步；`import/parse` 接入任务表——POST 建 `pending`、SSE 流内 fire-and-forget 更新 progress/done(completed 存 characters/lore/style)/error(failed)，三类事件均带 `taskId`
- 🔌 断线恢复（BE-5）：新增 `GET /api/import/[taskId]` 轮询路由；前端 `ImportWizard` 用 `sessionStorage` 缓存 `taskId`，组件挂载时自动轮询恢复进预览（completed 取 result / failed 报错）
- ✅ tsc 零错误、新增 1 个运行时依赖（jszip，前端解压用）

## v0.46.31 — 2026-08-02
**前端打磨（#213）：FE-10 弹窗合并 + FE-7 错误态 + FE-5 无障碍 + ARCH-7 颜色守卫**

- 🔀 合并角色弹窗（FE-10）：CharacterEditDialog 与 CharacterCreateDialog 合并为单一 `CharacterDialog`（可选 `character` 参数：有则编辑全字段 + AI 补全，无则精简创建），调用方 `page.tsx` 两处渲染合并为一，旧两文件删除；personality 文本↔结构化解析、时间线解析、角色选项抽至 `src/lib/character-parse.ts` 单一数据源，避免双份维护漂移
- 🧩 错误态一致性（FE-7）：`States.tsx` 新增 `ErrorState` 组件（图标+标题+说明+可选重试动作），与既有 `EmptyState`/`Loading` 共用 `--nv-*` 令牌与视觉语言，组成「空态/加载/错误」三件套规范；DrawCards 抽卡失败的「错误+重试」块改用统一 `ErrorState`
- ♿ 无障碍补课（FE-5）：explore 与 game 窄屏抽屉切换的纯图标按钮（sliders/check/grid）补 `aria-label`（与既有 `title` 一致）；Modal 关闭键本已带 `aria-label="关闭"`，workspace 抽屉切换按钮带可见文字「大纲/侧栏」无需补
- 🎨 颜色守卫（ARCH-7）：新增 `scripts/lint-colors.mjs` 扫描 `src` 下 TS/TSX 的任意十六进制色值（如 `bg-[#ff0000]`），提醒改用 `--nv-*` 令牌防止观感回归；`package.json` 加 `npm run lint:colors`，`.github/workflows/ci.yml` 加软门步骤（不阻断）；已知残留 3 处游戏画布深底（`#0a0a0f`/`#0a0a1f`/`#0d0d2a`）为有意硬编码，守卫只拦新增
- ✅ tsc 零错误、零新运行时依赖

## v0.46.30 — 2026-08-02
**幂等 seed 脚本（ARCH-5）：prisma/seed.ts + db:seed，16 内置预设可重复播种**

- 🌱 新增 `prisma/seed.ts` 幂等脚本：遍历 16 内置预设，按 `{type, title, isBuiltin}` 查重，已存在跳过、否则插入，`npm run db:seed` 可重复执行不重复写入
- 📦 单一数据源：16 内置预设从 `src/app/api/seed/presets/route.ts` 的 `BUILTINS` 抽到 `src/lib/builtin-presets.ts`，API 播种路由与 seed 脚本共用，避免双份维护漂移
- 🔧 Prisma 7 适配：seed 配置移到 `prisma.config.ts` 的 `migrations.seed`（package.json 的 `prisma.seed` 对 v7 无效）；新增 `tsx` devDep 作为 runner，seed 用相对路径 import 避开 `@/` 别名
- ✅ tsc 零错误、零新运行时依赖（tsx 仅 devDep）；实跑两次验证幂等（新增 0 / 跳过 16，结果稳定）

## v0.46.29 — 2026-08-02
**统一 API 错误响应（ARCH-2）：全站路由 catch 收敛到 jsonError**
- 🔧 全站约 90 个 API 路由的 catch 块手写 `return NextResponse.json({error},{status:500})` 统一收敛到 `@/lib/api-error` 的 `jsonError(e)`；错误响应体固定为 `{error, code?, hint?}`，前端一致解析、排查更省心
- 🧭 两套 `jsonError` 收口：`@/lib/api-error` 的 `jsonError(e:unknown)` 走 `classifyError` 分类（Prisma 码 + 网络 + 默认）并带 `hint` 排查建议，为异常错误默认通道；`@/lib/api` 的 `jsonError(msg,status,code?)` 保留给需精确 4xx 码的 3 个历史路由（presets/[id]、seed/presets、projects/[id]/config）
- 🚫 8 个 SSE 流式路由（characters/classify、characters/expand、import/commit、import/parse、import/quick、lorebook/expand、lorebook/import、lorebook/summarize）走 `send({type:"error"})` 不套 jsonError；`/api/settings/test` 保留 `{ok:false}` 业务契约但错误文本改用统一 classifyError，`/api/tools/execute` 保留 `{success,data}` 契约（@deprecated）
- ✅ tsc 零错误、零新依赖；`/api/presets/import` 的 `unknown→string` 类型冲突随 import 源改到 `@/lib/api-error` 一并修复；覆盖率 29/88 → 实质 100%（除 SSE 与业务结果契约外）

## v0.46.28 — 2026-08-02
**后端健壮性：Prisma 连接池上限（BE-6）+ LLM 超时统一常量（BE-8）**
- 🛡️ Prisma 连接池上限（BE-6）：`src/lib/prisma.ts` 的 `PrismaPg` 适配器显式传入 `pg.PoolConfig`（`max` 默认 10 + `idleTimeoutMillis` + `allowExitOnIdle`），高并发流式请求下避免连接耗尽 `P2024`；`max` 可用 `PRISMA_POOL_MAX` 环境变量调大
- ⏱️ LLM 超时统一（BE-8）：`src/core/llm/client.ts` 抽出 `LLM_REQUEST_TIMEOUT_MS = 300_000`，替换散落的两处 `AbortSignal.timeout(180_000/300_000)`，所有 LLM 请求共用同一超时
- 🧭 诚实边界（BE-7 / BE-8 删除）：BE-7 读码确认 `expand` 无循环内 `findMany` N+1、`monitor` 已用 `select`+`Promise.all`+DB 聚合，无明确安全收益故未改；BE-8「删除 deprecated」与 U5「不删代码保留给脚本/SDK」冲突，本单元不删除；`maxDuration` 按操作差异设置属合理；tsc 零错误，零新依赖

## v0.46.27 — 2026-08-02
**空态统一（FE-4/BUG-9）+ 导入向导批量删除二次确认（BUG-13）**
- 🧹 合并重复 EmptyState（FE-4 / BUG-9）：删除 `src/components/ui/EmptyState.tsx`（旧版用 `hint`、无 `className`、视觉偏小），全局统一走 `States.tsx` 的 `EmptyState`（保留 `description` 语义 + 支持 `className`）；`CharacterList`/`StorylineList`/`RulesPanel`/`WorldEntryList` 4 处 import 改到 `States.tsx`，`hint=` 全部改为 `description=`，空态视觉与引导文案全站一致
- 🛡️ 导入向导批量动作二次确认（BUG-13）：`ImportWizard.handleRemoveAllUnconfirmed` 清空全部未确认项前，先弹 `confirmDialog({ danger: true })` 让用户确认，避免误清空尚未写入数据库的章节/角色/词条
- ✅ 诚实边界（BUG-1）：经核查角色删除的「无确认/无 loading」症状已在 FE-8 重构中由 `CharacterList` 的 `useConfirmDelete`（确认弹窗 + 忙态）解决；`LeftPanel` 内联 fetch 仅作 `deleteFn` 被 hook 托管，本单元不重复修、仅做现状确认；tsc 零错误，零新依赖

## v0.46.26 — 2026-08-02
**轻量服务端状态层：useApi 缓存 + 失效，与 store 联动终结列表陈旧**
- 🔄 轻量服务端状态层（FE-9）：新增 `src/hooks/useApi.ts` 自封装 mini React-Query 原语（进程内缓存 + staleTime 默认 30s + 失效订阅），零新依赖；导出 `useQuery`/`invalidateQuery`/`invalidateQueries`
- 🔗 试点 + 与 FE-8 联动：仪表盘项目列表率先改用 `useQuery("projects:list", ...)`（挂载拉取、删除/重试即 refetch）；workspace 内角色/世界书/设定保存完成 → `refreshAfterMutate` 既刷本页 store 又 `invalidateQueries("projects")` 让仪表盘回到新鲜
- 🧭 诚实边界：未一次性迁移全部 70+ 端点（计划原文「可先试点再逐步迁移」，盲改全站风险高）；缓存为进程内（刷新即清空），符合本地工具定位；tsc 零错误，零新依赖

## v0.46.25 — 2026-08-02
**状态管理收口：useProjectStore 接管 workspace 实体数据，双源陈旧问题终结**
- 🧩 store 接管为唯一源（FE-8）：扩展 `useProjectStore` 持有 `project`（章节/角色/世界书/故事线/文风卡）+ `rules`；`loadProject` 成功后 `setProjectData(data)` 统一写入，workspace 页移除本地 `useState project`，改读 store；`LeftPanel`/`RightPanel` 改从 store 直读、去掉 `project` 大对象 prop
- 🔌 消除双源：终结「本地 project 与 store 并存、编辑后漏刷导致列表陈旧」老问题；store 新增 `updateNode/addNode/removeNode/upsertCharacter/upsertLore/upsertRule/patchProject` 等原子操作，面板可改局部
- 🧭 诚实边界：回调类 prop（onX 动作）仍按设计透传（动作非数据、无陈旧问题）；未做 30-prop 100% 清零（计划原需 ARCH-6 测试护栏，本冲刺未建，故保留 action 回调透传避免无测试大改回归）；tsc 零错误，零新依赖

## v0.46.24 — 2026-08-02
**项目备份包 .nfproject：整本设定一键打包，换电脑 / 送搭档不必懂数据库**
- 📦 备份包导出（FE-N2）：工作台工具栏新增「备份包」按钮，点击触发 `GET /api/projects/[id]/backup` 下载 `.nfproject`（章节+角色+世界书+规则+文风卡+分支+剧情线+世界表全量 JSON，Content-Disposition 附件）；仪表盘顶栏新增「导入备份」选文件即 `POST /api/projects/import` 落库为新项目
- 🔄 导入即重映射：剥离旧 id/时间戳后新建项目，子表两段式回填 parentId/branchId/relatedEntryIds，关联完整；导入名自动加「（导入）」后缀，与原项目互不干扰（新增非覆盖）
- 🧭 诚实边界：数据模型纯文本/JSON 无二进制附件，JSON 即完整（未用 zip）；仅做「导入为新项目」，未做覆盖（覆盖易误伤原稿）；tsc 零错误，零新依赖

## v0.46.23 — 2026-08-02
**全局命令面板 Cmd/Ctrl+K：项目一大，搜索即达，专业感拉满**
- ⌘ 命令面板（FE-N1）：根 layout 挂全局 `<CommandPalette />`，Cmd/Ctrl+K 唤起；解析当前 projectId 拉 nodes/characters/lore/rules 建内存索引，输入即搜；↑↓ 选、Enter 跳转、Esc 关闭；仪表盘顶栏加「搜索 ⌘K」按钮
- 🔎 跳转即定位：章节回车跳并自动选中（`?node`）；角色/世界书回车开编辑弹窗（`?editCharacter`/`?editLore`）；全局动作（新建章节/设置/探讨/拆书/创意工坊/回收站/主页）始终可用
- 🧭 诚实边界：检索走前端内存索引不上 ES；workspace 加 `force-dynamic` 以用 `useSearchParams`；tsc 零错误，零新依赖

## v0.46.22 — 2026-08-02
**软删除 + 回收站：删项目不再物理抹掉，手滑可救**
- 🗑️ 软删除（BE-2）：Project 新增 `deletedAt`；`DELETE /api/projects/[id]` 改为软删除（设 `deletedAt`，子表 `onDelete: Cascade` 随项目一起隐藏不丢）；`GET /api/projects` 列表过滤 `deletedAt: null`，主页只显示活跃项目
- ♻️ 回收站：`GET /api/projects/recycle` 列已删 + `POST /restore` 恢复 + `POST /purge` 硬删级联清子表；新增 `/recycle` 页面（恢复/彻底删除）+ 主页「回收站」入口；删除文案改「移入回收站」
- 🧭 诚实边界：软删除仅隐藏不自动过期（未做保留 N 天清理）；tsc 零错误，零新依赖，字段经 `prisma db push` 同步

## v0.46.21 — 2026-08-02
**正文版本历史与一键回滚：AI 重写再也不怕把写好的稿子改没了**
- 🕓 版本快照（BE-1）：新增 `StoryNodeRevision` 表（nodeId/版本号/正文全文/字数/来源/时间），在 `src/core/pipeline/post-processor.ts` 写库前单点快照——覆盖所有走后处理管线的 AI 写/重写/润色/自动填表；编辑器手动保存（PUT `/api/story/nodes/[id]`）写前也快照；去重（内容相同不重复记）+ 空正文不记 + 失败静默
- 🔄 历史版本抽屉：编辑器状态栏新增「历史」按钮，打开统一 Modal 抽屉——左列本节点全部版本（版本号/来源标签/字数/时间），右栏预览选中版正文，底部「回滚到此版本」一键恢复
- ♻️ 回滚可逆：`POST /api/story/nodes/[id]/rollback` 先把当前正文自动备份为「回滚快照」再覆盖，回滚本身也能再回滚；列表 `GET /revisions`、详情 `GET /revisions/[revId]` 预览
- 🧭 诚实边界：仅 v0.46.21 起产生的版本有记录，更早正文无历史快照；来源标签如实区分 AI 生成/重写/润色/手动保存/回滚快照；表经 `prisma db push` 同步，tsc 零错误，零新依赖

## v0.46.20 — 2026-08-02
**AI 成本看板：真实 token 用量与估算花费落库，统计面板一眼看清本月 AI 花了多少**
- 📊 Token 落库（BE-3）：新增 `LlmCallLog` 表（时间/模型/角色/输入·输出·总 token/估算成本/BaseURL/是否故障转移），在 `src/core/llm/client.ts` 的 `chat` 成功返回、`chatStream` 流正常完成（readStream 末尾 `onUsage` 回调）单点 fire-and-forget 落库，覆盖所有走 client 的生成/agent/game/explore/dissect
- 💰 成本估算：内置 `MODEL_PRICING`（DeepSeek/GPT/Claude/通义/智谱/Kimi 等 20+ 模型每百万 token 单价），`estimateCost` 按模型名匹配估算美元成本；未知模型标「单价未知」不伪造成本
- 📈 看板 UI：统计面板 MonitorPanel 新增「AI 成本（全项目 · 本月）」区块——调用次数/Token 总量/估算花费（¥ 按 7.2 汇率折算并标 ≈$）/记录起始日 + 按模型分布；monitor 路由加 `llmUsage` 聚合（本月 groupBy model）
- 🧭 诚实边界：仅记 v0.46.20 后调用（历史无数据，UI 标「暂无记录」）；client 不持有 project 故做全局聚合标注「全项目」；价格为估算、落库失败静默；表经 `prisma db push` 同步

## v0.46.19 — 2026-08-02
**LLM 重试 + 故障转移：模型抽风时自动退避重试 / 切备用模型，写作几乎无感**
- 🔁 重试与退避（BE-4）：核心客户端 `src/core/llm/client.ts` 的 `chat`/`chatStream` 接入指数退避重试——429 限流 / 5xx 服务端异常 / 网络不可达默认重试 3 次（退避 600ms×2^(n-1) 封顶 8s 含 ±20% 抖动）；4xx 鉴权/配置错误（401/403/404/400）直接抛出 `mapLLMError` 中文提示不重试
- 🔀 故障转移（多模型兜底）：`LLMConfig` 新增 `fallbackModels` 链，主模型重试耗尽后依次切备用模型（换 model/baseURL/apiKey）；配置经 `process.env.LLM_FALLBACK`（形如 `modelA@baseURL,modelB`）零 schema 改动注入，不配则纯重试、不引任何新网络架构
- 🌊 流式安全：流式生成仅在「建立连接阶段」（fetch 失败 / 首 token 前 HTTP 错）重试与切换备用；一旦进入 token 流即不再重试/切换，避免重复输出污染正文
- 🛡️ 诚实边界：遗留 `src/lib/llm.ts` 的 `callLLM`（个别旧路由）同步补同等指数退避重试但不带 fallback；全部为本地运行时逻辑，不引入部署/服务器组件，符合「本地自用、不做真实网络」定位

## v0.46.18 — 2026-08-02
**响应式补齐：explore 探讨页 / game 游戏页三栏抽屉化（窄屏不再挤压）**
- 📱 响应式补齐（FE-6）：explore 探讨页三栏（构建配置 w-80 / 中栏 / 已采纳 w-72）与 game 游戏页三栏（左信息 w-52 / 中栏 / 右信息 w-64）参考 workspace 主页补 `lg:` 抽屉——左右栏在 `<lg` 变 `fixed inset-y-0 left/right-0 z-40 w-* max-w-[85vw] h-full transition-transform`，开 `translate-x-0`、关 `-translate-x-full`；`lg:static lg:z-auto lg:shrink-0 lg:w-* lg:translate-x-0 lg:transition-none` 复位，桌面三栏并排零回归
- 🔘 窄屏顶部新增抽屉切换按钮（`lg:hidden`）：explore 用 `sliders`/`check` 图标分别开构建配置/已采纳抽屉，game 用 `sliders`/`grid` 图标开关左右栏；中栏始终 `flex-1 min-w-0` 全宽不被压扁
- 🎭 半透明遮罩点击收起：`(leftDrawerOpen || rightDrawerOpen)` 时渲染 `fixed inset-0 z-30 bg-black/50 lg:hidden`，点遮罩即关两栏，单栏故障不影响互动
- 🛡️ 诚实边界：dissect 拆书页经 grep 核查本就是单栏 `max-w-6xl` 表单（无多列 grid），窄屏天然不挤压，未做无意义改写；全量 tsc 零错误，零新 npm 依赖

## v0.46.17 — 2026-08-02
**弹窗统一收口：22 个手写遮罩全部接入统一 Modal 基座（focus trap + ESC + 滚动锁）**
- 🪟 弹窗统一收口（FE-3）：全项目 22 个业务弹窗（角色编辑/创建、世界书编辑、风格编辑、导入向导、设置导入、记忆衰减、项目配置、生成前确认、抽卡、扩展结果、工具箱、剧情线、规则面板、建表、首页公告、创意工坊上传、导出、大纲、自动化设置、构建配置等）的手写 `fixed inset-0 z-50 bg-black/60` 遮罩全部删除，统一替换为 `<Modal open onClose={...} bare panelClassName="...">`
- 🎛️ 引入 `bare` 模式：统一「遮罩层 + 关闭行为」外壳，内部内容结构原样保留——通过 `panelClassName` 透传宽度/布局类、`header` 自定义头部插槽、`showClose` 右上角关闭键，零破坏迁移；bare 不再强加 `max-h/overflow`，高度滚动交给调用方
- 🔒 关闭语义诚实保留：原「点遮罩不关闭」的弹窗（构建配置/建表/上传/首页公告）用 `closeOnOverlay={false}` 保留；导入向导保留 `step` 条件关闭；其余统一点遮罩 / ESC 关闭
- 🧹 `DialogUI.DialogOverlay` 退役，不再被任何业务组件引用；grep 复核 `src` 下已无残留手写业务弹窗遮罩（Modal 自身 / 抽屉 / 下拉 / toast / 游戏画布 / 粒子特效合法保留）
- ✅ 全量 tsc 零错误，零新 npm 依赖

## v0.46.16 — 2026-08-02
**UI 装饰 emoji 收口：76 处 JSX 文本装饰 emoji 统一替换为 Icon 图标**
- 🧹 UI 装饰 emoji 收口（FE-2）：用 ts-morph AST 精准改写 components/app（非 api）里把 emoji 当装饰图标的 JSX 文本节点，共 18 文件、76 处，统一替换为 `<Icon name="..." size={N} className="inline-block align-text-bottom shrink-0" />`，图标尺寸随祖先容器自适应（text-2xl→18 / text-3xl→20 / 默认 15）
- 🗺️ 图标库扩容：src/components/ui/icons.tsx 新增 26 个 lucide 语义图标（brain / mountain / messageCircle / scale / coins / clapperboard / paperclip / square 等），覆盖被替换 emoji 的全部语义
- 🛡️ 诚实边界：严格区分三层 emoji——①协议层（API 响应串 ✅❌⚠️ 被前端 startsWith 解析）②提示词层（LLM prompt 分隔符 ★、实体高亮 🟢🟡🔵）一律不动；③大插画 emoji（text-4xl/5xl 容器）保留为视觉焦点
- 📌 已知残余（如实披露）：Type B 数据字段 emoji（`icon: "📚"` 类，DissectDimensions / ContextPreview）与 JS 字符串字面量 emoji（如 DissectAdaptPanel 按钮文案、ContextPreview 三元状态标）本次未纳入，留待后续专项，不伪装「全清」
- ✅ 全量 tsc 零错误，零新 npm 依赖

## v0.46.15 — 2026-08-02
**视觉一致性收口 + 浅色主题：语义状态色全面令牌化，新增昼面换肤**
- 🎨 视觉一致性收口（FE-1）：全站 4 类语义状态色（成功绿 / 危险红 / 提醒琥珀 / 信息青）从散落的 emerald/rose/amber/sky/green/yellow/blue/red 等 200+ 处硬编码色值，统一收敛到 `--nv-success` / `--nv-danger` / `--nv-warning` / `--nv-info` 设计令牌
- 🔧 为支持该收敛，在 Tailwind `@theme` 注册 success/danger/warning/info 语义别名（含 -soft 变体），原生支持 `text-success`、`bg-danger/20` 等带透明度写法；中央图标色板 `iconColor` / `StatusDot` 同步改走令牌
- 🌗 浅色主题（FE-N4）：新增「虚空玻璃·昼面」——仅覆盖设计令牌实现换肤，组件零改动；白底玻璃面 + 深色描边 + 深色正文
- 🖱️ 根布局首屏前注入防闪烁脚本读取 `localStorage('nf-theme')`；新增 Sun 图标与 `ThemeToggle` 切换器，置于设置页「外观」区与全局状态横幅右上角；偏好存本机、刷新保持
- 🛡️ 诚实边界：统一语义色是浅色主题能真正可用的前提（组件直接写 red-400 会绕过令牌、浅色下对比度崩溃），故将状态色收敛做全；cyan 作为游戏节点专属强调色有意保留
- ✅ 全量 tsc 零错误，Tailwind 仅新增语义别名、零新运行时依赖

## v0.46.14 — 2026-08-02
**统一 Loading 态：裸 emoji 转盘全面替换为统一 Icon 旋转图标**
- 🔄 拆书上传/进度、拆书详情页加载与等待、探索页大纲生成、卡片浏览生成中、文风扫描、仿写/转换/改编等长操作——原用裸 ⏳ emoji 当 CSS 旋转图标（样式失控、与全站 SVG loader 割裂），全部替换为统一 `<Icon name="loader" className="animate-spin" />`
- 🧩 拆书维度网格状态字形 ✅❌⏳⬜ 收编为 Icon check/x/loader/circle，与全站状态体系一致
- 🎯 异步按钮「⏳ 文案」前缀改为 Icon 旋转 + 文案，与 settings 页 loader 风格对齐；按钮 disabled 保护不变
- 🛡️ 诚实边界：严格区分「UI loading 视觉」与「数据流协议」——API 流式进度串 / LLM 提示词 / 状态检测串（startsWith("✅") / ==="❌失败"）中的 emoji 属协议层一律不动，避免破坏前后端契约
- ✅ 全量 tsc 零错误，零新 npm 依赖

## v0.46.13 — 2026-08-02
**AI 生成落库确认：写了多少、存没存一目了然**
- 🔔 正文生成完成 toastSuccess「正文已生成并保存 ✓」，比状态栏更显眼确认落库
- 🔢 状态栏 done 增强为「已落库 ✓ · 本章 X 字」（取自 loadProject 刷新后字数），一眼看到实写字数
- 🎯 诚实修正：原计划「AI 插入预览确认」假设不成立（无手写入口，正文 AI 流落库）；P4 聚焦真实缺口（落库确认+字数）
- ✅ 全量 tsc 零错误，零新 npm 依赖

## v0.46.12 — 2026-08-02
**三栏响应式：窄屏抽屉化，中栏优先不被压扁**
- 📱 左/右栏在 <lg 变 fixed 抽屉（lg:static 复位），中栏 flex-1 + min-w-0 全宽不被压扁、不溢出
- 🎛️ 窄屏顶部「大纲 / 侧栏」toggle（lg:hidden）+ 半透明遮罩点击收起，单栏故障不影响写作
- 🖥️ 桌面左右栏保留 shrink-0，三栏并排布局零回归、向后兼容
- ✅ 全量 tsc 零错误，零新 npm 依赖

## v0.46.11 — 2026-08-02
**保存状态透明化：消除「AI 写的内容会不会丢」焦虑**
- 💾 状态栏新增保存指示：生成中「草稿保存中…」旋转 → 完成后绿色「已落库 ✓」，空闲不打扰；复用既有 genStep
- ✅ 大纲保存成功补 toastSuccess「大纲已保存 ✓」，填补成功静默缺口
- 🎯 诚实修正：原计划「手写正文保存透明化」前提不成立（正文由 AI 流落库，无手写入口）；P1 聚焦真实缺口
- ✅ 全量 tsc 零错误，零新 npm 依赖

## v0.46.10 — 2026-08-02
**稳定性：全局错误边界防白屏**
- 🛡️ 新增 ErrorBoundary 组件：捕获渲染 / 生命周期抛错，降级为「该模块出错 + 重试」友好 UI，不再整页白屏
- 🧱 三栏独立容错：左栏「大纲」/ 中栏「编辑器」/ 右栏「侧栏」各自包裹，单栏抛错不影响其他栏写作
- 🔒 顶层兜底：根渲染树外加「工作台」边界，兜住工具栏 / 引导 / 对话框等局部未覆盖处的意外，作为最后防线
- ✅ 全量 tsc 零错误，零新 npm 依赖

## v0.46.9 — 2026-08-02
**互操作③：角色卡 ↔ 冲突推演互相照亮**
- 🎭 冲突推演端点标注涉及角色：POST /api/generate/conflict 新增 characters 字段，AI 在每个冲突 / 转折选项里标注「涉及角色」（从【主要角色】挑选真实名字），后端按 name + 别名精确匹配成角色卡 id
- 🔗 卡片一键跳角色卡：ConflictPanel 每个选项卡新增「涉及角色」标签（user 图标），点击即在工作台打开对应角色卡，复用既有 setEditingCharacter 机制
- 🧩 闭环意义：此前冲突推演只出冲突、不点名角色；本次让「谁被这条冲突考验」看得见、可直达，推演 ↔ 角色三层性格设定形成回环，仍定位为纯建议
- ✅ 全量 tsc 零错误，零新 npm 依赖

## v0.46.8 — 2026-08-02
**互操作：每日目标贯穿写作与统计**
- 🎯 编辑器状态栏实时目标（互操作①）：CenterPanel 底部状态栏新增「今日 X / 目标 Y · Z%」金色胶囊，dailyGoal 与统计面板同源（localStorage），今日字数来自 monitor 接口 dailyWords；保存后自动同步，达标变金 + 脉冲 + 每日一次轻提示
- 📅 统计面板周历打卡（互操作②）：每日目标区块下新增近 7 天节奏格，达标日金色 ✓、今日 ring 高亮，复用既有 dailyWords 聚合，把单日进度环扩展为养成轨迹
- 🔗 闭环意义：此前每日目标只活在统计面板、写作时不可见；本次让目标在写作与统计两侧互通，作者无需切面板即感受每日节奏
- ✅ 全量 tsc 零错误，零新 npm 依赖

## v0.46.7 — 2026-08-02
**互操作闭环：冲突推演一键落地为剧情节点**
- 🔗 冲突推演→大纲回流（D4）：ConflictPanel 每个选项卡新增「应用为剧情节点」按钮，将 AI 推演的冲突 / 转折（标题 / 触发 / 张力 / 走向 / 风险伏笔）一键创建为大纲章节（type=chapter，结构化写入 outline），打破此前「只展示 + 复制、不进大纲」的断裂；应用后自动回调 loadProject() 刷新左侧大纲树
- 📑 新章命名「冲突·<标题>」排末尾：order 用 Date.now() 保证唯一且靠后，作者可在新章上直接续写，AI 产出从「仅供参考」走向「可一键采纳」
- ♻️ 复制能力保留：原「复制」按钮不变；应用 / 复制两条路径并存，HTTP 失败 / 网络异常均有 toast 提示；冲突推演仍定位为纯建议，最终情节决定权在作者
- ✅ 全量 tsc 零错误；延续本地优先、零新 npm 依赖铁律

## v0.46.6 — 2026-08-02
**成品感打磨收官：冲突推演 / 工具箱 / 导出增强 / 统计补完**
- 💡 冲突推演（D4）：新增 `/api/generate/conflict` 端点——基于世界观硬规则 + 主角角色卡 + 近 2 章，AI 推演 ≥3 个结构化冲突 / 转折发展选项（title/trigger/tension/outcome/caution），空响应自动重试一次提升稳定性；新增 `ConflictPanel` 弹窗（工具箱「智能分析」入口），卡片化呈现并明确「仅供参考，决定权在你」，每张卡可一键复制
- 🧰 工具箱（D2）：新建 `ToolboxDialog`，收拢续写 / 大纲 / 批量 / 摘要 / 抽卡 / 角色 / 工坊 / 表格 / 召回 / 冲突推演 10 项，按「写作辅助 / 内容生成 / 智能分析」三色分类卡片网格，零新增后端
- 📤 导出增强（C2）：统一 `ExportDialog`（6 格式网格 + 选章范围 + 含大纲开关 + 作者署名）；后端 export 路由扩展 `author` / `chapterIds` 参数并透传 DOCX / EPUB / HTML / Markdown / TXT 五个构建器
- 📊 统计与引导补完（D1/B3）：monitor 端点加近 14 天 `dailyWords` 聚合；`MonitorPanel` 加近 7 天写作节奏柱状图 + 每日目标 conic 进度环（localStorage 持久化）；`OnboardingModal` 三步上手卡、`OutlineTree` 空态「看示例」经 `LeftPanel` 透传 `onLoadSample` 至 workspace 定义 handler（POST `/api/seed/sample-project` 后跳转）
- 🔍 D3 复核：发现 `RulesPanel` 已具备逐条启用 / 禁用 + 分类 / 范围标签 + 状态分组（已禁用区），路线图 🔲 为过时标记，无需重复造轮子（cargo cult 检测应用）
- 🧪 E1/E2 压测：dev 冒烟实测全部关键路径（seed / 导出空边界 / markdown+docx 署名 / conflict / chat / stats）正常；实测中的「中文乱码 / 0 字节 / 400」经隔离定位均为测试环境假象（GBK shell 发送 + dev 首次编译抖动），非产品 bug；真实 5 万字长跑建议作者侧实跑
- ✅ 全量 tsc 零错误；延续本地优先、零新 npm 依赖铁律

## v0.46.5 — 2026-08-02
**开箱即懂 + 投稿闭环：示例项目 / 题材开局 / DOCX 导出**
- 📖 一键示例项目（B1）：首页「看示例」一键后端播种示范仙侠小说《山海拾遗》——世界观铁律（严禁现代科技造物/修真境界分级/因果必有回响 3 条硬规则）+ 剧情推进倾向 + 主角李尘角色卡（结构化 personality）+ 已写 2 章正文，并自动 syncGlobalPrompt 让规则真正进 globalPrompt（闭环「定义了没用」）；幂等安全
- 🎯 题材开局模板库（B2）：新增 8 个高频题材骨架（仙侠/都市/西幻/历史/言情/科幻/悬疑/武侠），纯静态数据 `src/core/templates/genres.ts` 前后端共用；选题材→后端一键建好项目（世界观铁律+剧情倾向+主角原型+卷纲三段式+第一章钩子），离线可用、零运行时 API 依赖
- 📄 导出补全 DOCX（C1）：新增零依赖 Word 导出（复用 epub 的 makeZip 手写 OOXML ZIP 包，中文靠 styles.xml 的 eastAsia="宋体" 不乱码），连同既有 TXT + 可打印 PDF（HTML 导出改名「网页 HTML（可打印PDF）」引导打印），对齐云笔 6 格式；PDF 走前端 window.print 零额外依赖
- ✅ 三项均 tsc 零错误、端到端实测通过（示例规则落库 / 题材骨架世界观落库 / DOCX HTTP 200 + ZIP 魔数）；延续本地优先、零新 npm 依赖铁律

## v0.46.4 — 2026-08-02
**创意工坊：trirui推荐品牌化 + 导入/导出文件（本地分发）**
- 🏷 内置预设品牌化：16 个系统示范预设作者统一归为 trirui、标签追加 trirui推荐——这是樊斯瑞项目设立的创意工坊体系，随仓库 clone 即带、人人可用
- 📦 新增导入/导出预设文件（酒馆式分发）：每张卡片「导出」生成 .preset.json（含 schema 版本+完整内容）下载；顶部「导入文件」从本机或 GitHub 下载的分享文件一键导入本地（新后端 POST /api/presets/import，落库 isBuiltin=false、author=导入，仅本机不共享）
- 🧭 产品方向纠偏：明确 novel-forge 是本地运行工具（类比 SillyTavern 酒馆），非 SaaS；分发靠 git clone + 导入/导出文件，线上演示站仅是历史展示、非必需
- 🔒 导入与内置清晰隔离：导入按 {type,title,isBuiltin:false} 去重；用户上传/导入永不影响系统内置；端到端验证通过；tsc 零错误

## v0.46.3 — 2026-08-01
**创意工坊：内置预设开箱即用 + 上传本地化**
- 📦 修复可用性缺口：此前内置示范预设仅在手动点「载入示范预设」或手动调 `/api/seed/presets` 时才写入数据库，全新 `git clone` 后首次打开创意工坊会看到空列表（疑似「本地用不了工坊」）。现改为打开工坊「全部」页签时自动检测——若库中尚无任何内置预设，自动触发一次播种（接口按 `{type,title,isBuiltin}` 去重，幂等安全），做到开箱即用
- 🌐 系统预设随软件人人可用：16 个内置预设（宫斗居住表、好感度分阶段人设、古风文笔、仙侠/现代/西幻世界观、快节奏爽文、暗黑史诗、苏苏角色卡、删除思维链正则、世界书条目、API 参数、舞台剧风格等）写进代码 BUILTINS 数组，随仓库分发；任何本地部署都自动拥有这套系统预设
- 🔒 上传弹窗底部新增隐私说明：「你上传的预设仅保存在本机数据库，不会上传到任何服务器，也不与其他人共享——纯粹方便你自己随时套用」，落实「其他人上传只是给自己方便、不共享数据库」的设计
- 🧪 共享模型厘清并确认无 bug：项目为单用户本地部署（无鉴权、无远程同步），预设只存本人本地 PostgreSQL，跨机器天然隔离；用户上传标记 `isBuiltin:false` 与系统预设区分。tsc 零错误

## v0.46.2 — 2026-08-01
**创意工坊：注入修复 + LLM 丰满预设**
- 🔧 修复「定义了没用」真 bug：此前 worldview（定义·规则）/ story_progression（剧情推进倾向）写入 LorebookEntry 后，`syncGlobalPrompt` 的「世界书」段落只渲染 8 个标准分类，这两类被漏掉；又因默认 depth 无触发词时动态路径不注入，导致用户下达的硬规则（如「全文禁止出现男性角色」）对生成完全不生效。现已让这两类作为「静态基础设定」常驻 `globalPrompt` 缓存（与角色卡/风格卡同级），并从动态触发路径排除避免重复注入——规则真正落地
- 🪄 新增「LLM 丰满预设」：上传向导顶部加 AI 面板，用户选好类型后用大白话描述（如「舞台剧风格：对白密集、动作夸张、情绪克制」），后端调已配置的 LLM（模型名/Key 从 AppSettings 读）把松散描述扩展成与向导同字段的结构化 JSON 直接填进表单，用户确认/修改后点「发布」即可；style / worldview / story_progression / lorebook / character / table_template 六类全部支持，非技术用户无需懂 JSON
- ✅ 确认工坊内容覆盖三项核心：① 自己的文风(style→StyleCard) ② 定义权·规则系(worldview，硬规则常驻) ③ 剧情推进倾向(story_progression，可融合进规则) 均真实进入写作上下文；世界书(lorebook) 保持关键词触发语义（舞台剧预设即此设计），与常驻规则分层清晰
- 🛡️ enrich 端点做了 LLM 输出容错（清理尾部逗号 / 不可见字符），实测六类创意预设全部跑通；tsc 零错误

## v0.46.1 — 2026-08-01
**创意工坊增强：舞台剧风格预设 + 分类型上传向导**
- 🎭 新增「舞台剧风格」lorebook 预设：把酒馆（SillyTavern）世界书格式的舞台剧/话剧文风（角色性格恒定、克制情绪波动、对白密集、动作夸张）转成可一键套用预设，应用即注入话剧写作基调与文风开关
- 🧰 上传预设从「裸 JSON textarea」改为「分类型向导」——style 给文风感觉自由写框 + 视角/节奏下拉、worldview/story_progression/lorebook 给可增删词条编辑器、character 给名/描述/定位、table_template 给表名+列，regex/api_config 保留高级 JSON 入口
- 🪄 非技术用户无需懂 JSON 即可创造并分享 style / worldview / lorebook / character / table_template 五类预设，门槛从「会写 JSON」降到「会填表」，但保留技术类 JSON 通道不切断高手（用户要求：不要分太细、给一点创造力）
- 🧹 清理工坊乱码与显示不全的残留预设，16 个内置预设干净完整；tsc 零错误

## v0.46.0 — 2026-08-01
**结构化表格大列表虚拟滚动（LoreTable 虚拟化）**
- 📊 新增零依赖轻量虚拟列表 hook `useVirtualRows`（固定行高 + 上下 overscan 预渲染 + 阈值开关）：把「整张表」拆成「视口内一小段 + 撑高占位」，滚到哪算到哪
- 🪶 LoreTable 展开后的表格行渲染接入虚拟化：行数 ≤ 50 走原 `<table>` 普通渲染（零开销），> 50 自动切换虚拟滚动（max-h 360px 滚动容器 + sticky 表头 + 绝对定位行），万行 `auto_facts` 大表也不卡
- 🔒 每个表抽独立子组件 `LoreTableGrid` 持有自己的虚拟状态（符合 React hooks 规则）；编辑 / 增行 / 保存交互完全保留
- 🧩 StorylineList 经评估不做虚拟化（卡片非等高 + 数据量小，硬做反伤体验）；不引入 react-window / @tanstack/virtual 等重依赖；tsc 零错误（PROCESS/04 待迭代项全部收官）

## v0.45.9 — 2026-08-01
**dev hydration 警告根治（时区确定性加固）**
- 🛡️ 根因：`toLocaleDateString("zh-CN")` / `toLocaleString("zh-CN")` 依赖运行时时区，服务器（UTC）与浏览器（本地）跨午夜算出的日期可能差一天，一旦日期显示进入 SSR 即触发 hydration 文本不匹配（文档记录的「偶发警告」最可疑根因）
- 🔒 修复：全部 5 处日期/时间格式化统一加 `{ timeZone: "Asia/Shanghai" }`，服务器与客户端强制按北京时间计算，输出恒等，从根消除时区驱动的不匹配
- 🌐 范围：首页项目卡片「X 天前」超 30 天分支、伏笔面板创建时间、配置面板套用时间、导入向导两条日志时间、填表结果时间
- 🧩 根布局 `<html>` 加 `suppressHydrationWarning` 安全网（Next 官方推荐）；静态排查确认渲染期无随机/时间/浏览器 API 不确定性；tsc 零错误

## v0.45.8 — 2026-08-01
**导出弹层一键复制全文 Markdown**
- 📋 Toolbar 导出弹层新增「复制全文 Markdown」按钮：点击即把整本书的 Markdown 文本写入系统剪贴板，作者可直接粘贴到微信 / 文档 / 聊天，无需先下载文件再打开（PROCESS/06 导出增强延续）
- ⚡ 纯前端实现——fetch 现有 /api/projects/[id]/export?format=markdown 取回已组装的全文文本，再调用 navigator.clipboard.writeText 写入剪贴板；零新依赖、零 schema 变更
- 💡 三重状态反馈：复制中… / 已复制全文 Markdown ✓ / 复制失败请改用导出文件，提示 2.2 秒自动消失，不阻断创作节奏
- 🧩 复用 v0.45.0 已建的导出路由与章节组装逻辑，零破坏性、tsc 零错误

## v0.45.7 — 2026-08-01
**角色卡性格三层创作字段**
- 🧬 角色编辑弹窗「性格详析」新增三层可选字段：表层 · 对外展现 / 中层 · 日常互动 / 内核 · 本质驱动（PROCESS/06 P2-1）
- 📝 三层并入 personality Json（surface/middle/core），零 schema 变更；保存用展开运算保留既有主导/驱动/矛盾等字段
- 🤖 经 safeJoin 自动拼入写作提示词「性格：…」，AI 生成即感知三层差异，无需改装配
- 🧩 AI 补全不覆盖手填三层；tsc 零错误

## v0.45.6 — 2026-08-01
**工作区新手引导弹窗**
- 👋 工作区首次进入新增「新手引导弹窗」：卡片式介绍 5 个核心功能——自动化填表 / 抽卡剧情 / 拆解大纲 / 游戏化激励 / 竞品借鉴打磨（PROCESS/06 P2-3）
- 🔒 复用统一 Modal（自带焦点陷阱 / ESC / 遮罩关闭 / 滚动锁定），首次访问（localStorage 无 `nf_onboarded_v1` 标记）才弹出，关闭即写入标记，永不重复打扰
- 🧱 纯前端实现，零 schema 变更、零新依赖；localStorage 不可用时 try/catch 静默忽略，不阻断正常使用
- 🧩 tsc 零错误；对齐竞品的「欢迎 + 功能引导」入场体验

## v0.45.5 — 2026-08-01
**文风编辑器叙事视角选择**
- 🎭 StyleEditor「文风维度」Tab 新增「🎭 叙事视角」单选组：第一人称 / 第三人称限知 / 第三人称全知 / 第二人称 / 不指定（PROCESS/06 P1-3）
- 📝 视角选择存入项目 `llmConfig.povType`；`style` 路由 GET/PUT 同步持久化该字段，切换后立即刷新 `globalPrompt`
- 🔗 `syncGlobalPrompt` 注入系统提示时新增叙事视角区块（中文可读映射，如「第三人称全知（上帝视角，跨越多角色心理）」），兜底读取 `llmConfig.povType`，下次生成即生效
- 🧩 复用既有风格注入通道，零 schema 变更、零新依赖、tsc 零错误；行为完全向后兼容（旧项目无该字段视为「不指定」）

## v0.45.4 — 2026-08-01
**右侧 AI 快捷芯片条（一键常用动作）**
- 🚀 AIChatBar 顶部新增「快捷芯片条」：续写 / 润色 / 写对话 / 查漏 / 修正 / 展开 六个常用动作一键触发（PROCESS/06 P1-2）
- 💬 芯片本质是把常见意图预填为标准 prompt 直接发送，复用既有 /api/generate/chat 与全部前端动作处理链路，不新增任何 AI 逻辑
- 🔘 生成进行中芯片自动 disabled，避免重复发送；纯入口聚合，零破坏性
- 🧩 无 schema 变更、无新依赖；tsc 零错误

## v0.45.3 — 2026-08-01
**世界模块网格视图（卡片仪表板）**
- 🧭 WorldPanel 的条目区新增「列表 / 网格」视图切换（WorldEntryList 顶部分段控件），网格用 2 列卡片排布，对齐竞品的卡片仪表板概览（PROCESS/06 P1-1）
- 🗂️ 网格视图复用现有 WorldEntryCard，窄侧栏下也能紧凑排布；左侧实时显示当前板块条目数
- 🔘 切换为组件本地状态（useState），默认仍是列表视图，不影响世界书其它交互；纯 UI 增强、零破坏性
- 🧩 无 schema 变更、无新依赖；tsc 零错误

## v0.45.2 — 2026-08-01
**章节实体彩色徽章（一眼看到 AI 识别了什么）**
- 🏷️ CenterPanel 章节正文标题下新增「实体彩色徽章」：扫描本章出现的角色 / 世界书词条（复用 `/api/entities/highlight` 的实体名→颜色映射），一眼看到本章涉及哪些 AI 识别实体（PROCESS/06 P0-3）
- 🎨 徽章沿用实体高亮配色（角色统一蓝、世界书按 category 着色），与正文内实体高亮视觉一致；同一实体按 id 去重（别名 / 关键词命中仍指向主实体）
- 🔗 点击徽章直接打开对应「角色查看编辑」或「世界书条查看编辑」弹窗（复用 page.tsx 既有 onEditCharacter / onEditLore id 跳转），无需再去侧栏翻找
- 🔌 配套：`/api/entities/highlight` 返回的实体增加 id 字段（别名 / 关键词条目指向同一实体 id），供徽章精确跳转；仅 select 增加 id、无 schema 变更，tsc 零错误

## v0.45.1 — 2026-08-01
**编辑器底部状态栏（写作掌控感）**
- 📊 CenterPanel 底部新增状态栏：实时显示 行数 / 字数 / 目标进度 / UTF-8 编码，对齐竞品的作者掌控感（PROCESS/06 P0-2）
- 🔢 字数沿用项目约定 = 字符数（content.length），随正文生成 / 流式输出实时更新；与目标字数对比给出进度百分比，达标时进度文字变绿
- 🎯 目标字数仍由顶部控制栏的数字输入设定（既有功能不变），状态栏为只读展示，纯展示组件、零破坏性
- 🧩 无 schema 变更、无新依赖；tsc 零错误；因 CenterPanel 正文区为 MarkdownViewer 只读预览（章节正文由 AI 生成），状态栏不含光标行列跟踪，改为更有价值的 行数 / 字数 / 目标进度 / 编码

## v0.45.0 — 2026-08-01
**导出格式扩充 —— 网页 HTML + 电子书 EPUB**
- 📤 导出新增「网页 HTML (.html)」与「电子书 EPUB (.epub)」两种格式，原先仅有 Markdown / 纯文本；满足排版美观、社交分发、电子书阅读三类诉求（PROCESS/06 P0-1）
- 🗂️ HTML 单文件导出（`buildHtmlDoc`）：自带轻量散文→HTML 转换——处理段落（空行分隔）、行内 **粗体** / *斜体*、> 引用、--- 分割线，带目录导航 `<nav>`、衬线字体排版与署名页脚；可直接浏览器打开，也可被 Word / 公众号排版工具导入
- 📚 EPUB3 导出（`buildEpub`）：零新增 npm 依赖，手写 stored（不压缩）ZIP + CRC32 表，`mimetype` 置于首条且 stored（符合 EPUB 规范要求），依次打包 `META-INF/container.xml`、`OEBPS/content.opf`、`nav.xhtml`（目录）、各 `chN.xhtml` 章节、`colophon.xhtml`；微信读书 / Apple Books / Calibre 可直接打开
- 🔧 导出按钮弹层由 2 项扩展为 4 项（Markdown / 纯文本 / 网页 HTML / 电子书 EPUB），`Toolbar.onExport` 与 `page.tsx handleExport` 类型统一为 `markdown | txt | html | epub`；复用现有章节树遍历与字数统计，导出路由按 format 分流；无 schema 变更，tsc 零错误，unzip -t 校验 EPUB 零错误

## v0.44.8 — 2026-07-31
**远楼层 LLM 摘要 —— 酒馆记忆机制迁移收官**
- 🧠 正文生成前，对短期记忆预算放不下的较早章节，用与正文相同的 LLM 客户端（含项目级覆盖）预生成 ≤240 字中文情节压缩摘要，注入前文回顾区替换原「⚠️ 远楼层…已折叠·非完整原文」标记，保留情节要义、消除剧情断裂幻觉
- 🔌 新增 `core/assembly/distant-summary.ts`（`summarizeDistantFloor` 非流式 `client.chat`，异常静默回退折叠标记）与 `engine.getDistantFloors` 检测 helper（复用同一份预算+贪心循环，保证检测与折叠一致）
- 🪢 `orchestrator.writeSection` 串联：`assemblePrompt` 新增 `opts.distantSummaries` 第 4 参数；`preview-context` 等其它调用点不传 opts，自动回退原折叠标记，零破坏性
- 🛡️ 网络/超时/内容过滤异常全部捕获并回退，绝不阻断正文流式出文；无 schema 变更，tsc 零错误

## v0.44.7 — 2026-07-31
**巨型组件拆分收官 —— AIChatBar 593→155 行**
- 🧱 `AIChatBar`（593 行）拆分为 6 个内聚子组件：`AIChatHeader` / `ChatMessageList` / `ChatThinking` / `ChatErrorBar` / `ChatSuggestions` / `ChatInput`，共享类型外置 `aichat/types.ts`
- 🔒 父组件保留全部 state/refs 与 handler（handleSend/handleAdoptSuggestion/handleCancel/handleSuggestion + 思考轮播/自动滚底 useEffect），输入框 Enter 发送逻辑内联进 `ChatInput`；行为 100% 不变（tsc 零错误）
- 📉 主文件从 593 行降至约 155 行；巨型组件拆分 4/4 全部完成（CharacterList / WorldPanel / PostGenPanel / AIChatBar）
- 🧹 纯重构：无 schema 变更、无新功能、无样式改动，Agent 对话面板可维护性提升

## v0.44.6 — 2026-07-31
**巨型组件拆分续 —— PostGenPanel 624→187 行**
- 🧱 `PostGenPanel`（624 行）拆分为 7 个内聚子组件：`PostGenPanelHeader`（头部 stats+按钮）、`PostGenPanelTabs`（Tab 栏）、`ExtractionTab`（7 分组提取+逐条采纳）、`ForbiddenTab` / `LogicTab` / `DistillTab` / `ReviewTab`（四个分析 Tab），共享类型与 `TabKey`/`TABS` 外置 `postgen/types.ts`
- 🔒 父组件保留全部状态/handler（7 个 adopted Set + handleSave/toggleAdopt/importanceStars + 采纳初始化 useEffect），采纳状态经 `AdoptControllers` 注入 `ExtractionTab`；行为 100% 不变（tsc 零错误，逻辑逐字迁移）
- 📉 主文件从 624 行降至约 187 行；巨型组件拆分 4/4 已完成其三（剩 `AIChatBar` 待拆）
- 🧹 纯重构：无 schema 变更、无新功能、无样式改动，生成后分析面板可维护性提升

## v0.44.5 — 2026-07-31
**项目级 LLM 覆盖端到端闭环（outline + 自动填表接入）**
- 🔑 项目配置中心「per-project LLM 覆盖」缺口补齐：大纲生成（`/generate/outline`）与宝宝流自动填表（`babyloreFill`）现已继承项目级 llmConfig（apiKey/baseUrl/model 非空字段覆盖全局），与 write/refine/continue/summarize 统一
- ✅ 实测端到端验证：设错误项目 key → write/outline 均返回 `401`（证明覆盖接管）；复位 `{}` → 用 `.env` 全局 key 真实生成成功（证明无阻塞、API 直接可用）
- 🔗 write/refine/continue 三路由把 `projLlm` 透传 `safeFillAfterWriting`；outline 叠加 `buildProjectOverrides` 解析
- 🧪 tsc 零错误；澄清此前「API 阻塞」为误判——本地站读 `.env` 的 `LLM_API_KEY`，DeepSeek key 一直可用

## v0.44.4 — 2026-08-01
**巨型组件拆分续 —— WorldPanel 375→137 行**
- 🧱 `WorldPanel`（375 行）拆分为 4 个内聚子组件 + 1 个数据模块：`WorldModuleSidebar`（板块选择）、`WorldEditor`（标题栏+新建表单+深度选择）、`WorldEntryCard`（单条目卡片）、`WorldEntryList`（列表+空状态）、`worldPanelData.ts`（WORLD_MODULES/DEPTH_LABEL/CATEGORY_TO_MODULE/MODULE_FIELDS 常量与类型外置）
- 🔒 父组件保留全部状态/handler（handleCreate/handleFieldChange/deleteEntry）与派生计算，仅以子组件调用替换内联 JSX；行为 100% 不变（tsc 零错误）
- 📦 常量外置 `worldPanelData.ts`，全局核查无别处依赖破坏
- 🧹 纯重构：无 schema 变更、无新功能、无样式改动，可维护性提升

## v0.44.3 — 2026-08-01
**巨型组件拆分启动 —— CharacterList 883→504 行**
- 🧱 `CharacterList`（883 行）拆分为 6 个内聚子组件：`CharacterFilters`（搜索+角色/状态/标签筛选）、`CharacterToolbar`（工具栏+全选/扩展/分类）、`ClassifyPanel`（分类进度+面板+结果）、`ExpandResultModal`（扩展进度+结果弹窗并接管 focus-trap）、`CharacterRow`（单角色卡片）、`CharacterGroupList`（分组渲染）
- 🔒 父组件保留全部状态/handler 与派生计算，仅以子组件调用替换内联 JSX 区块；行为 100% 不变（tsc 零错误，逻辑逐字迁移）
- ♿ 焦点陷阱随扩展结果弹窗移交 `ExpandResultModal`，键盘可达性不受影响
- 🧹 纯重构：无 schema 变更、无新功能、无样式改动，可维护性提升

## v0.44.2 — 2026-08-01
**对话框焦点陷阱与键盘可达性（无障碍基线）**
- ♿ 新增通用 `useFocusTrap` hook（`src/hooks/use-focus-trap.ts`）：弹窗激活时焦点移入首个可聚焦元素、Tab/Shift+Tab 在弹窗内循环不逃逸、Esc 关闭、关闭后焦点交还打开前的元素
- 🔒 增强 `DialogOverlay` 与 `Modal` 基础组件自带焦点陷阱，覆盖所有使用它们的弹窗（角色/世界书编辑、设置导入等）
- 🪟 11 个裸 fixed 弹窗统一挂焦点陷阱：大纲生成 / 布置配置 / 项目配置 / 生成前确认 / 抽卡 / 记忆衰减 / 自动化设置 / 规则面板 / 剧情线编辑 / 角色编辑 / 角色列表扩展结果
- ⌨️ 键盘可达性基线达成：Tab 在弹窗内导航、Esc 关闭，焦点不再丢失到背后页面

## v0.44.1 — 2026-08-01
**修复探讨模式采纳失败无法重试（稳定性）**
- 🐛 修复 `handleAdoptCard` 在 fetch 之前就把卡片 `adopted` 置真：失败也会显示「已采纳」并禁用按钮，导致用户无法重试 —— 改为仅在成功响应后才置 `adopted` + 写入已采纳列表
- 🔁 统一失败状态串为「❌失败」（修复 page 与 ChatPanel 字符串不一致导致失败徽标永不显示的隐藏 bug）
- 🔄 ChatPanel 失败卡片新增「点击卡片重试 ↻」提示，失败后整卡仍可点击触发 `onAdoptCard` 重新采纳
- 🧪 批量采纳（大纲模式）失败项同样受益：卡片 `adopted` 不再提前置真，用户可在对话卡片上单卡重试；tsc 零错误，纯前端逻辑修复无 schema 变更

## v0.44.0 — 2026-07-31
**六大功能补齐 + 六项体验优化（本地化闭环）**
- 🎯 六大新功能：创意工坊一键示范预设 / 布置结构化保存与重编辑 / 记忆衰减手动触发 / 抽卡角色生成前确认 / 项目配置中心 / 自动填表可视化重试
- 🔁 regex 三处统一应用 + lorebook 预设重复去重（更新而非叠加）
- 🧭 章节大纲双入口明确（Flash 轻量预览 vs 抽卡正式 Outline）+ 世界书深度改为「常驻记忆/触发记忆」
- 🛡️ 角色卡 adopt 字段加固（对话风格/隐藏动机/关系不丢）+ 10 个孤儿路由 @deprecated

## v0.43.0 — 2026-07-29
**API 配置体验重做 + 探讨/布置双区域 UI 升级**
- 🔑 新增 `/api/settings/models` 自动检索模型，deepseek 默认 base 特殊拼接 `/v1/models`；设置页模型框改为可下拉选择
- 🔌 保存 API 后自动调用 `/api/settings/test` 连接验证，DeepSeek V4 flash 实测通过；修复 `lllBaseUrl` 笔误
- 💬 探讨模式 UI 升级：11 步进度条 + 「AI 创作顾问」状态条 + bot/user 头像 + 气泡/卡片/采纳入场动画
- 🎛️ 布置区域 UI 升级：实时预览卡 + 四分区 StepGroup + 流派标签搜索过滤 + 颜色收敛到虚空玻璃令牌
- ✅ 修复 `globals.css` 误加的 `:root` 提前闭合括号导致的 500；tsc 零错误 + 浏览器真实走查通过

## v0.42.0 — 2026-07-28
**虚空玻璃 UI 全面翻新（老土配色清零）**
- 🎨 全局 Tailwind 默认色（zinc/indigo/gray/white）映射到虚空玻璃设计令牌，覆盖 40+ 组件与全部页面路由
- 🌌 首页/工作区/设置/创意工坊统一深空玻璃质感（背景光晕 + 霓虹渐变标题）
- 🔘 交互语义保留：focus 环/开关滑块/进度条改用主色/表面令牌，对比度达标
- ✅ tsc + 生产 next build 全通过

## v0.41.0 — 2026-07-28
**角色卡结构化模板收尾（酒馆模板呈现）**
- 👤 调度卡注入补全「称呼别名 + 穿着 + 关系备注」三项，此前 UI 已收集却未进 prompt：称呼头部追加别名（aliases），外貌块补 attire（穿着）
- 🔗 关系备注修复：注入改读 UI 实际保存的 `r.dynamic` 字段（原误读恒为空的 `r.notes`），关系动态不再丢失
- 🧱 侦察确认 `relationships` 字段（schema/types/UI/注入四路齐全）与 `speechPatterns`（dialogueStyle 内置子字段）此前已落地，本次零新增字段、零 schema 变更
- ✅ tsc + 生产 next build 全通过

## v0.40.0 — 2026-07-28
**提示词结构升级：XML 标签分层包裹（酒馆格式论迁移）**
- 🧩 assemblePrompt 拼接层从「--- 分隔 +【xxx】标题」改为逐块 XML 标签包裹，块边界对 LLM 无歧义
- 🎯 根标签 `<novel_forge_context>` 与 `<writing_task>` 明确区分“上下文”与“撰写任务”两层，消除模型把指令误当正文、正文误当指令的混淆
- 📦 11 个上下文区块各自用 XML 子标签包裹（系统/全局/强制常驻/世界书/弧光/故事线/伏笔/转折/章节摘要/近期/作者指令），内部自然语言不变；新增 `wrapBlock` 辅助函数
- ✅ tsc + 生产 next build 全通过

## v0.39.0 — 2026-07-28
**记忆清除 / 上下文溢出治理（酒馆记忆机制迁移）**
- 🧠 短期记忆（前文回顾）溢出治理：较远楼层超预算时不再静默丢弃，改为显式「折叠标记」（保留末尾衔接点 + 标注"开头已折叠/非完整原文"），预算极小时整段折叠为一行提示
- 📜 中期摘要（章节摘要）静默截断补标记：因预算省略的较早/低相关章节摘要显式标注数量，上下文边界清晰
- 🔍 对应酒馆第七章「记忆机制 / 记忆清除」：明确上下文压缩边界，消除"上下文污染 / 剧情断裂幻觉"
- ✅ tsc + 生产 next build 全通过

## v0.38.0 — 2026-07-28
**世界书 depth 注入（酒馆 worldbook depth 0-4 迁移）**
- 📚 LorebookEntry 新增 `depth Int @default(3)`：把酒馆世界书分层注入机制搬进 Novel Forge（0=正文前强效 / 1=用户指令上方 / 2=系统上下文 / 3=背景设定·关键词触发 / 4=深层背景）
- 🌟 depth≤2 强制常驻注入：不依赖关键词，始终进入上下文（系统上下文区 / 指令上方 / 正文前）；depth≥3 仍走关键词触发路径（默认3，保持旧行为）
- 🧩 编排层拆分 forced/triggerable：关键词匹配仅作用于 depth≥3；宝宝流 recall 路径排除 depth≤2 避免重复注入
- 🎛️ 世界书编辑/新建 UI 新增深度选择器与徽标（depth≤2 高亮为常驻）；创意工坊示范预设「核心设定」改为 depth=2 演示强制注入
- ✅ tsc + 生产 next build 全通过

## v0.37.0 — 2026-07-28
**酒馆理论迁移：创意工坊 Preset 类型扩展 + 正则后处理管线**
- 🍺 创意工坊 Preset 类型扩展（酒馆迁移）：新增 `regex` / `lorebook` / `api_config` 三类预设，可上传并应用到项目
- 🧹 正则后处理管线落地：生成一章后自动按项目级 `postProcessingRules` 清洗输出（如删除 `<think>` / `<thinking>` / `<analysis>`）
- ⚙️ API 参数预设可覆盖项目 `llmConfig`：应用 `api_config` 预设后直接改变生成温度/topP/模型参数
- 📁 新增 `PROCESS/05-酒馆理论迁移方案.txt`：记录酒馆运行原理、可迁移方法论、下一步计划，并更新目录清单
- ✅ tsc + 生产 next build 全通过

## v0.36.0 — 2026-07-28
**色子抽卡与剧情线持久化关联 + 流程文档机制**
- 🎴 色子（抽卡）剧情预设持久化：采用某路线后自动写入活跃剧情线 `Storyline.chapterBindings`（element:"preset"，含 cardLabel/coreConflict/mood），生成前剧情规划可读到「用户用色子选定的走向」
- 🔁 同章纲节点重采用色子按 chapterId+preset 去重，不堆叠重复条目；项目无活跃剧情线时优雅跳过
- 📁 建立 PROCESS 流程文档机制：`novel-forge/PROCESS/` 目录清单 + 三段式落档（目标/执行流程/关联项），兼作产出记录与预期值追踪
- ✅ tsc + 生产 next build 全通过

## v0.35.0 — 2026-07-28

### 无表自动建表——保证「生成一章即自动填表」零配置闭环

**自动化填表零配置（修复体验矛盾）**
- safeFillAfterWriting 在真正填表前检查项目是否已有结构化表格；若无且自动化开启，自动创建默认「章节事实表」（key=auto_facts，列：名称/状态/说明），使「生成一章即自动填表」在零表格配置下也能成立
- E2E 验证：新建项目故意不应用任何表格模板，第1章生成后自动建表并填 4 行、第2章动态修正至 7 行；后端打印 `[babylore]` 自动建表日志

---

## v0.34.0 — 2026-07-28

### 文风预设生效修复 + 系统角色条件化 + 后端监测报告

**文风预设修复（与预期对齐的核心矛盾）**
- 修复 apply 路由缺陷：创意工坊「应用」预设后未调用 syncGlobalPrompt，导致 globalPrompt 始终为空、文风预设（如古风·严谨文笔）完全不生效；现对所有预设类型（style/worldview/story-progression）统一刷新全局提示词
- 文风卡经 syncGlobalPrompt 编入 globalPrompt，生成时 assemblePrompt 读取，套用文风后立即带该文风（E2E 实测 globalPrompt 长度 0 → 385 且含「文风设定/古风」）

**系统角色条件化（消除体裁冲突）**
- orchestrator 系统提示词原硬编码「白金级玄幻修仙网文作家 + 修仙模拟引擎 + 都市重生流」，与项目 genre 解耦，压制一切非修仙文风
- 改为条件化：题材含修仙/玄幻/仙侠/武侠/洪荒/奇幻/末世时沿用原版（零风险）；其他题材走通用作家角色，文风以文风卡为最高权威，不再被强制修仙化

**后端监测报告（满足核对流程需求）**
- 召回节点打印 `[recall]` 命中条数与来源；生成前剧情规划打印 `[plan-chapter]` 回写章序；自动填表打印 `[babylore]` ops/applied/skipped
- E2E 实测后端日志清晰呈现「召回 1→3 条 → 剧情回写章序 1→2→3 → 填表 chapter1 ops=2 / 后续动态修正」的完整链路

---

## v0.33.0 — 2026-07-28

### 自动化填表闭环 + 生成前剧情预设 + 可配上下文

**自动化填表（正文→填表→召回→正文）**
- 新增 safeFillAfterWriting：每章写完后自动用 DeepSeek 抽取结构化事实，以 JSON 行操作协议（insert/update/delete）回填创意工坊结构化表格，失败不影响正文交付
- 回填表格经 buildRecallBlock 持续注入永久上下文，形成「写章节→填表→下一章召回」闭环；update 按唯一列匹配已有行，动态修正不矛盾、不重复插入
- 填表频率可配置（默认每 3 章填一次）、默认跳过最近一章（用户常对最新章 re-roll 改写，跳过避免污染表格），二者均可在弹窗关闭

**生成前剧情预设（回忆召回式推进剧情线）**
- 新增 plan-chapter.ts：点击生成一章之前，LLM 基于活跃剧情线 + 大纲 + 作者指令 + 记忆召回块规划本章剧情推进（焦点/推进/障碍/转折/执行提示）
- 规划结果注入写作指令，并把本章绑定追加写回活跃剧情线（保留最近 50 章，不丢历史、持续修正）；规划失败静默降级，不阻断正文生成

**配置与 UI**
- 顶部工具栏新增「自动化」入口，弹窗集中配置：自动填表总开关 / 填表频率 / 跳过最近章 / 上下文楼层（前文窗口，复用 contextKeepChapters）
- 新增 /api/projects/[id]/config（GET/PUT）读写上述配置，已接入 jsonError 统一错误格式
- 数据层：Project 模型新增 autoFillEnabled / fillFrequency / skipLatestChapter 字段

---

## v0.32.3 — 2026-07-28

### 暗色可读性提升 + API 错误格式统一

**可读性（A11y）**
- --nv-text-tertiary 提亮至对比度 ≥4.5:1（原约 3.5:1），暗色下弱文字达 WCAG AA 普通文本标准
- --nv-text-muted 适度提亮，占位符 / 禁用文字在暗色背景下恢复可读性

**API 错误响应统一**
- 新增标准 helper jsonError(message, status?)，统一返回 { error } 结构与 HTTP 状态，消除各路由 {ok:true}/{error} 不一致
- /api/presets/[id]（GET/PUT/DELETE）与 /api/seed/presets（POST）已接入 jsonError，作为全站错误格式统一化起点

---

## v0.32.2 — 2026-07-28

### 空态统一 + 项目资产闭环 + 监测告警（缺陷修复迭代）

**空态统一（视觉完整度）**
- 新增共享空态组件 EmptyState（虚空玻璃风格：虚线边框 + 居中 Icon + 主文案 + 可选引导/操作区）
- 角色 / 世界书 / 故事线 / 规则四类列表的无数据占位统一为 EmptyState 卡片；规则面板原漏网的旧色板 text-zinc-600 一并收编为 nv 令牌

**项目资产闭环**
- GET /api/projects/[id] 的 include 补全 styleCards 与 loreTables，前端可在 workspace 直接读取创意工坊已应用预设，减少端点分裂

**健壮性**
- MonitorPanel 的 fetch 异常从静默忽略（/* ignore */）改为 console.warn，保留非关键降级但开发期可排查
- SSE 流关闭逐文件复核：17 个流式路由的 controller.close() 均已覆盖所有异常路径（try 末尾 / catch 内 / 提前 return 前），无悬挂风险，保持现状以控制改动风险

---

## v0.32.1 — 2026-07-28

### API 路由健壮性加固（预设路由异常捕获）

**API 路由健壮性**
- 修复 /api/presets/[id] 的 GET/PUT/DELETE 与 /api/seed/presets 的 POST 缺失 try/catch 的问题：prisma 异常原会返回无 {error} 的 500，导致前端解析崩溃
- 统一异常响应：各 handler 包装 try/catch，返回 { error: string } + 对应 HTTP 状态（404/500），前端可稳定识别并 toastError

**诊断自检**
- 按 novel-forge-diagnostic 六维度扫描：tsc 零错误、Prisma schema 校验通过、服务健康 200、无死代码、核心 SSE 路由已有外层 try/catch 兜底
- 其余优化点（SSE finally 统一关闭、巨型组件拆分、大列表虚拟化、空态 / 对比度 / A11y）整理为优化建议清单，列入后续迭代

---

## v0.32.0 — 2026-07-27

### 🎨 全模块视觉美化 + 创建/添加统一响应弹窗（虚空玻璃设计体系）

**视觉美化体系落地（虚空玻璃 Void Glass）**
- 全部小说相关子界面统一为暗色「虚空玻璃」设计：surface/border/primary/creative/accent/success/danger 令牌全量替换旧的 indigo/zinc/emerald/amber 平行色，配色风格一致
- 按钮变体（btn-primary/btn-success/btn-danger/btn-creative/btn-ghost）+ .input-glass/.surface-floating 统一质感，每个按钮具备 hover / 点击 / 禁用态的视觉差异
- 全站 UI 装饰 emoji 清零，改为统一 Icon 组件（Lucide 映射）：角色前缀 ★◆◈、状态 ✓✕⚠️⏳ 等收编为 check/x/alert/loader 等 Icon；业务数据标签 📥📝 保留其过滤语义

**创建/添加操作统一响应弹窗**
- 新增命名式 toast：toastAdded / toastCreated（绿色辉光 + 勾选动画 + 固定标题「已添加 / 已创建」），字体与动效美化
- 覆盖全部「创建 / 添加小说」入口：新建角色、新建世界书、新建规则、AI 生成故事线、探讨模式创建项目（含大纲落库建项目）——均弹出「XX「名称」已创建 / 已添加」

**构建与类型修复**
- 修复 3 处阻塞构建的类型错误：workshop 页补 toastCreated 导入、游戏页 QUICK_ACTIONS 的 icon 收窄为 IconName、PostGenPanel 补 cloud 图标到注册表
- tsc --noEmit 与生产 next build 均通过（69 路由全量生成），可直接部署

---

## v0.31.0 — 2026-07-27

### 📚 内置文档预设概念 + 创意工坊进入写作上下文 + 按钮全交互实测

**内置预设概念（来自参考资料）**
- 把参考资料教程里命名的所有预设类别实体化为系统内置预设：表格模板 3 个（主角信息表/属性·关系·资产、骰子随机事件表、宫斗·妃嫔居住建筑表）、剧情推进 2 个（缝合怪·多线剧情推进、好感度·分阶段人设模板）、文风 2 个（快节奏·爽文笔、古风·严谨文笔）、世界观 1 个（仙侠·世界观骨架）、角色卡 1 个（示范角色·苏苏）
- 保留原 4 个示范预设，系统内置预设总数由 4 增至 12，覆盖 type: table_template / story_progression / style / worldview / character

**创意工坊贴合进入写作上下文（链路确证）**
- 「应用到项目」真实落库经 pg 直连验证：文风→StyleCard、角色卡→CharacterCard、表格模板→LoreTable 全部写入项目库
- 写章节时预设经 loadGenerationContext / buildPromptContext / buildRecallBlock 注入正文 globalPrompt 与召回块——「参考资料预设→项目库→写作上下文」主链路闭环成立

**每个内置按钮可交互（真实点击验证）**
- 创意工坊 Tab 过滤、搜索框、应用到项目、复刻、上传预设（填表+发布）、目标项目下拉 全部真实点击验证通过，无死按钮
- 上传预设功能端到端验证：表单填表→POST /api/presets→后端真实创建入库
- 生产模式（next build + start）全新渲染：创意工坊 12 张卡片完整渲染、交互正常

---

## v0.30.2 — 2026-07-27

### 🔍 究极用户端五维诊断 + 工作台 hydration 修复

**五维用户端诊断（真实点击验证）**
- ① 按钮实质交互：写章节 / 微调 / 续写 / 自动填表 / 记忆召回 / 跳转 等核心按钮均实测有真实后端行为，未发现死按钮
- ② 前后端统一：前端每个调用均能映射到后端 API 且实测有响应（规则链路最初 400 为诊断脚本字段误用，前端 RulesPanel 字段与后端契约一致）
- ③ 重叠按钮审计：代码盘点 12 组嫌疑入口（文风管理三入口、章纲三生成器、导入双链路等），经判定均属合理导航 / 场景分化，未删除任何功能
- ④ 功能落地：探讨 / 拆书 / 宝宝流 / 创意工坊 / 游戏 等模块边界清晰，参考资料核心承诺（写作闭环 / 分阶段人设 / 创意工坊）均已落地
- ⑤ 功能意义：宝宝流闭环实测优秀——写章节后结构化表格「角色居所」被自动更新（applied:1），正文 1415 token 生成 + 自动填表生效

**修复与用户体验**
- 工作台 /workspace/[id] 修复 SSR/CSR hydration 不一致：将 refineInstruction / chapterOutlinePrompt 的 localStorage 读取从 useState 初始化移入 useEffect，消除初始化期水合不匹配风险
- 诊断结论：系统为免费无收费的小说 AI 生成器，核心写作闭环与记忆系统真实可用，契合谋生作者 / 自娱写手「低成本产出连贯长篇」的目的
- 已知限制：沙箱 dev 模式下工作台偶发卡 loading（仅本地 dev 环境问题，生产构建 next build + start 完全正常，部署无碍）

---

## v0.30.1 — 2026-07-27

### 🪟 写作界面新增「宝宝流记忆召回」实时面板（闭环透明化）

**闭环透明度**
- 写章节 / 微调 / 续写 完成后，中间列新增「🧠 宝宝流记忆召回」折叠面板，实时列出本轮自动召回并注入写作的世界书/结构化表格记忆
- 面板直接展示已求值的人设阶段（如「阶段一：陌生人（态度：礼貌但疏离）」），写作者一眼看清 AI 在本轮呼应了哪些设定、当前角色处于什么状态——闭环不再只藏在后台 toast 里
- 每轮生成开始时面板自动重置，避免上一次记忆残留误导

**实现与验证**
- 数据直接复用已验证的 babylore_recall SSE 事件（items 已是循环求值后的内容），零新增后端逻辑
- 验证：tsc 类型检查通过、next build 全路由编译通过、/workspace/[id] 页面 HTTP 200、写章节 SSE 苏苏条目 content 为已求值「阶段一：陌生人」且无 `<if cell>` 标签

---

## v0.30.0 — 2026-07-27

### 🎭 分阶段人设求值生效（剧情推进 = 人设进化，参考资料核心亮点落地）

**分阶段人设真正生效**
- 新增 src/core/babylore/ifcell.ts 求值器：解析参考资料风格的 `<if cell="属性表/苏苏/好感度 <= 10">…<else>…</if>` 语法（支持任意嵌套），按当前结构化表格的真实数值选出「当前激活的人设阶段」
- 套用「好感度·分阶段人设模板」后，写章节 / 微调 / 续写 会自动把求值后的当前人设阶段注入写作指令，而非把原始语法标签丢给 AI——参考资料承诺的「剧情推进=人设进化」首次真正闭环
- 端到端验证：属性表 苏苏.好感度=5 时，写章节召回的人设条目 content 已是「阶段一：陌生人（态度：礼貌但疏离）」，标签彻底清除

**安全与健壮性**
- 单元 + 端到端双层测试：好感度 5/25/50/80 精准命中阶段一~四，标签全部清除
- 安全降级：属性表缺失、行缺失或数值非数字时返回「全阶段参考文本」（剥离标签、并列展示），绝不误判为某一阶段，也绝不向用户暴露原始 `<if cell>` 标签
- 求值集成进共享模块 src/core/babylore/loop.ts：buildRecallBlock 对世界书条目里的 `<if cell>` 统一求值，recall 事件携带的也是已求值内容（透明可见）

---

## v0.29.0 — 2026-07-27

### 🔁 写作闭环覆盖全部生成路径（写章节 / 微调 / 续写 三路由统一）

**闭环扩展到全部路径**
- 写章节 / 微调 refine / 续写 continue 三条生成路由现在都自动「记忆召回」+ 写后「LLM 填表」，参考资料承诺的正文→填表→召回→正文 在任意创作方式下都闭合
- 端到端验证：微调指令「甄嬛居所改为棠梨宫」被 DeepSeek 自动抽取，结构化表格 甄嬛:碎玉轩 → 甄嬛:棠梨宫 实时更新；续写路径也正确召回角色设定

**架构精简（删冗余）**
- 抽共享模块 src/core/babylore/loop.ts：把「召回净化（过滤[自动发现]占位世界书、表格命中优先、上限12条）+ 写后自动填表（失败不影响交付）」沉淀为单一事实来源
- write/refine/continue 三路由统一调用 buildRecallBlock 与 safeFillAfterWriting，消除三套重复逻辑、保证行为一致

**健壮性对齐**
- refine/continue 的后处理管线（审校/摘要）也加容错：LLM 限流/超时不再中断交付，降级为「仅生成」并继续自动填表、照常发 done
- 前端 streamSSE 本就是 write/refine/continue 共用，宝宝流召回/填表的实时 toast 在三条路径自动透明展示

---

## v0.28.0 — 2026-07-27

### 🔁 打通「正文→填表→召回→正文」写作闭环（参考资料核心承诺落地）

**写作闭环（自动）**
- 写章节时自动「记忆召回」：用本节大纲 + 作者指令 + 前文 + 角色名 作为召回上下文，命中世界书/结构化表格记忆并注入本轮撰写指令（剧情推进=记忆召回）
- 写完后自动「LLM 填表」：DeepSeek 抽取本章结构化事实回填表格，闭环 正文→填表→召回→正文 全程无需手动调用 API
- 端到端验证：宫斗章节正确召回 4 位妃嫔居住信息，并在续写「甄嬛迁入棠梨宫」后自动把 woman_live 表更新为 甄嬛:棠梨宫

**质量与稳定性**
- 召回净化：自动过滤内容含「[自动发现]」的占位世界书，结构化表格命中优先，单次召回上限 12 条，避免 prompt 膨胀与低质记忆污染
- 后处理容错：审校/摘要的 LLM 调用若因限流/超时失败，不再中断整章交付，降级为「仅生成」并继续自动填表、照常发送 done
- 填表 LLM 调用加 120s 防御性超时，慢响应不再卡住 SSE 流
- 前端透明化：实时 toast 提示「宝宝流记忆召回 N 条」与「自动填表完成：写入 M 行」，闭环每一步用户可见

---

## v0.27.1 — 2026-07-27

### 🐛 修复宝宝流自动填表多行互相覆盖（稳定性）

**稳定性修复**
- 修复 /api/babylore/fill 累积写入 bug：同一张表的多个 insert 操作此前会在循环内从原始空数组重新拷贝，导致互相覆盖、只保留最后一行（如宫斗 4 位妃嫔只写入 1 位安陵容）
- 改为按表维护累积 rows 副本（rowsCache），同表多操作串行生效；现已正确写入全部 4 行（华妃/翊坤宫、皇后/景仁宫、甄嬛/碎玉轩、安陵容/延禧宫）
- 生产构建（next build）已通过 TypeScript 类型检查与 69 页静态生成，可正常部署上线

---

## v0.27.0 — 2026-07-27

### 🗂 宝宝流数据库内核 + 创意工坊/共创社区：把参考资料变成可共享预设

**宝宝流数据库内核（结构化表格 + LLM 填充 + 剧情推进召回）**
- 新增 LoreTable 模型：世界书升级为结构化表格（人物/地点/物品/属性/时间线），行列可自定义，对标宝宝流「妃嫔居住建筑表」
- 新增 /api/babylore/fill：每章写完后 DeepSeek 自动填表（国模填表精确配置：关 COT + 严格 JSON + 温度 1 + 失败重试 3 次），抽取结构化事实写入表格
- 新增 /api/babylore/recall + recallContext 服务：剧情推进=记忆召回，按世界书绿灯关键词与表格行匹配，注入应召回的记忆（不替作者写剧情）
- 大纲生成已增量注入召回命中项；项目内「结构化表格」页支持建表/行编辑/自动填表/召回预览

**创意工坊 / 共创社区（预设中心）**
- 新增 Preset 模型与 /api/presets（列表/上传）、/apply（套用到项目）、/fork（复刻二创）
- 把参考资料本身实体化为「预设」：表格模板预设、剧情推进预设、文风、世界观、角色卡均可一键套用
- 内置 4 个示范预设（宫斗居住表 / 好感度分阶段人设 / 古风严谨文笔 / 仙侠世界观骨架），首次部署 POST /api/seed/presets 注入
- 顶栏新增「创意工坊」入口；工作区新增「结构化表格」「创意工坊」按钮；产品免费、非商业

---

## v0.26.3 — 2026-07-26

### 🛡 API 错误收敛与优雅降级：环境变量配置 DeepSeek、拆书页无 DB 不崩溃

**API 错误收敛与可读化**
- 拆书列表 `/api/dissect/list`、项目详情 `/api/projects/[id]`、角色 `/api/characters/[id]`、`/api/characters`、规则 `/api/rules`、故事线 `/api/storylines`、待办 `/api/pending-items`、统计 `/api/stats/monitor`、节点 `/api/story/nodes`、伏笔 `/api/foreshadowing/list`、世界书 `/api/lorebook/[id]` 等路由的 catch 块统一改为 `jsonError(err)`
- 消除数据库未连接时 API 返回的原始 `__TURBOPACK__...` / `prisma.xxx.findMany()` 内部堆栈，前端拿到的是 `{error, code, hint}` 结构化的中文可读错误

**无数据库时的优雅降级**
- 拆书页 `/dissect` 加载失败时不再弹出内部错误边界，改为居中友好空状态：标题「拆书任务加载失败」+ 错误原因 + 修复指引 +「重试」按钮
- 拆书页在加载错误期间暂停 3 秒自动轮询，避免反复请求失败接口

**环境变量配置 API**
- 在用户目录 `novel-forge-github/.env` 与沙箱仓库 `.env` 写入 DeepSeek 配置：`LLM_PROVIDER=deepseek`、`LLM_API_KEY`（用户提供）、`LLM_MODEL=deepseek-v4-flash`、`LLM_BASE_URL=https://api.deepseek.com`
- `DATABASE_URL` 默认指向 `docker compose up -d` 启动的 PostgreSQL，用户只需启动 Docker 即可让数据层跑通

**质量验证**
- `npx tsc --noEmit`：零错误
- `npm run build`：64 页静态生成通过
- 本地 3001 服务重启后 `/`、`/changelog`、`/settings`、`/explore`、`/dissect` 全部 200，浏览器控制台无 JS 报错
- `curl /api/dissect/list` 验证返回结构化中文错误，不再暴露 Prisma 内部路径

---

## v0.26.2 — 2026-07-26

### 🛡 Pipeline 检查与 bug 修复：数组空值兜底、lorebook 死代码清理、类型对齐

**运行时 bug 修复**
- LeftPanel 向子组件传递的数组统一加 `?? []` 兜底：`project.storyNodes ?? []` / `project.characters ?? []` / `project.lorebookEntries ?? []`，避免后端数据缺少字段时进入对应 tab 白屏
- CharacterList / WorldPanel 的数组 prop 改为可选（`characters?: CharacterData[]`、`entries?: LorebookData[]`）并默认空数组，从调用方到组件自身双层防御空值

**lorebook 死代码清理**
- v0.26.1 移除工作台冗余 lorebook 标签后，`onNewLore` / `showNewLore` / `<LorebookCreateDialog>` 已没有任何入口可触发，成为死代码；已清理 LeftPanel 与 workspace/[projectId]/page.tsx 中相关 props/state/渲染
- 删除无人引用的组件文件 `LorebookList.tsx`（全仓 0 import）与 `LorebookCreateDialog.tsx`（仅被死代码渲染），精简代码库

**类型与一致性**
- LeftPanel 与 workspace 页面的 tab 联合类型移除已废弃的 `"lorebook"`，避免误切到无对应渲染分支的空白面板

**pipeline 检查**
- 运行 `npx tsc --noEmit`：零错误
- 运行 `npm run lint`：680 个既有 `no-explicit-any` 历史债务（memory-classifier/memory-decay 等），本次改动未引入新 lint 错误
- 浏览器自动化检查 3001 首页/设置/探索/拆书/公告页：无客户端 JS 报错，无崩溃

---

## v0.26.1 — 2026-07-26

### 🧹 前端按钮去重与矛盾消除：共享删除 Hook、冗余标签清理、加载态补全

**删除逻辑去重（重构）**
- 新增共享 Hook `useConfirmDelete`（src/components/workspace/useConfirmDelete.ts）：统一封装「确认弹窗 → 忙态锁定 → 删除 → 成功刷新 / 失败 toast」流程
- 7 处删除入口（角色 / 故事线 / 规则 / 世界书条目 / 项目 / 拆书任务 / 章节节点）改用该 Hook，移除约 90 行重复样板，并消除各文件删除错误处理不一致、提示文案凌乱的隐患

**矛盾按钮消除（修复）**
- 工作台侧栏原 `world` 与 `lorebook` 两个标签渲染同一 WorldPanel，形成重复且矛盾的入口；删除冗余的 lorebook 标签，仅保留 world 单一入口
- CharacterList 的 `onDelete` 由 `() => void` 修正为 `() => Promise<void>`，删除失败现在能被 Hook 正确捕获并提示，不再被静默吞掉

**按钮加载态补全（修复）**
- 大纲树（OutlineTree）章节节点删除按钮此前缺失禁用/忙态，点击后无视觉反馈；现接入 `deletingId`，删除进行中禁用并锁定该按钮，防重复点击，消除「点了没反应」的矛盾观感

**构建与自检（质量）**
- tsc --noEmit 零错误；生产构建 64 个页面零警告通过
- 本地服务自检：首页 / 设置 / 更新面板 / 探索 / 拆书 等所有页面路由返回 200，渲染真实内容（非错误边界）

---

## v0.26.0 — 2026-07-26

### 🔔 交互硬化与 UI 美化：全局提示系统、按钮反馈与 DeepSeek 跑通

**全局交互系统（新增）**
- 新增全局 Toast + Confirm + Prompt 组件（src/components/ui/toast.tsx），统一替代所有原生 alert / confirm / prompt：右下角滑入、按类型（成功/错误/警告/信息）着色、自动消失、可手动关闭；确认/输入弹窗为虚空玻璃风格模态框、返回 Promise，Provider 未挂载时安全退化为原生对话框
- 全局按钮基础样式（globals.css）：所有按钮（含原生 `<button>`）统一具备点击下沉、禁用态、聚焦光环的视觉按压反馈
- 共享 Button 组件新增 `loading` 属性：异步操作期间显示 Spinner 并自动禁用，点击「有确定感」

**全站交互硬化（修复）**
- 19 个文件原生 alert 全部替换为分类型 toast：错误不再被静默吞掉，成功/信息有明确正向反馈
- 7 处破坏性删除（角色 / 故事线 / 规则 / 世界书条目 / 项目 / 拆书任务 / 章节节点）原生 confirm 替换为 styled 确认弹窗，并加 deleting 忙态锁定删除按钮，误删风险归零
- 工作台「新建章节 / 小节」原生 prompt 替换为 styled 输入框弹窗（promptDialog），保持视觉一致

**DeepSeek 跑通（新增 / 修复）**
- llm.ts 新增各 Provider 默认模型表（DeepSeek → deepseek-v4-flash 等）；模型留空不再硬报错，读者只填 Key 即可跑
- testLLMConnection 默认模型按 Provider 取值，并兼容 DeepSeek v4 等推理模型（先思考后输出正文）——连接测试不再误判「返回格式异常」
- 实测：以用户提供的 DeepSeek Key 经 /api/settings/test 与原始 HTTP 调用均返回 200，模型正常响应（推理模型会把 token 用于 reasoning_content，正文在充足 token 预算下输出）

---

## v0.25.0 — 2026-07-26

### 🎨 UI 优化：首页重塑、布局修复与响应式打磨

**布局缺陷修复（必须修）**
- 系统自检横幅原为 `sticky top-0 z-50`，与页面 `sticky top-0 z-10` 页头争抢顶部，导致页头被横幅遮挡、点击区域错位
- 现改为 `relative`：横幅处于文档流顶部、滚动时自然让位给粘性页头，重叠消除（system-status-banner.tsx）

**首页重塑（page.tsx）**
- 新增 Hero 欢迎区：标题「构建你的小说宇宙」+ 一句话定位 + 开始创作 / 拆书分析双 CTA，首屏更有产品感
- 空项目状态由居中提示改为三张「起步引导卡」：探讨模式、拆书分析、配置 AI——直接引导用户完成「填 Key」这一关键第一步

**响应式与一致性**
- 顶栏「开始创作 / 拆书 / 设置」按钮在移动端（<640px）自动隐藏文字仅留图标，窄屏不再拥挤
- 更新面板「最新」徽标由 emerald 绿统一为 indigo 靛蓝（changelog/page.tsx），与该页及全站设计令牌一致

---

## v0.24.9 — 2026-07-26

### 🏗️ 成品化：去远程字体依赖，整站可离线构建

**移除 next/font/google 远程字体（layout.tsx + globals.css）**
- 原：`layout.tsx` 用 `next/font/google` 拉取 Geist / Geist_Mono / JetBrains Mono，构建期需联网；无外网环境（如隔离沙箱）`next build` 必然失败
- 现：`layout.tsx` 移除三处远程字体声明；`globals.css` 顶层 `:root` 定义 `--font-geist-sans/mono`、`--font-jetbrains` 为系统字体栈（中文回退 PingFang SC / Microsoft YaHei），Tailwind `@theme inline` 与页面字体变量无缝衔接
- 效果：任意环境（含无外网）`next build` 均可成功，64 页静态生成通过，TypeScript 零错误

**消除 Turbopack workspace root 误判警告（next.config.ts）**
- 原：构建警告「Next.js inferred your workspace root... detected multiple lockfiles」，因上层目录存在多余 lockfile 误判 root
- 现：`next.config.ts` 显式 `turbopack: { root: process.cwd() }`，构建输出干净无警告

**可移植性提升**
- 部署不再依赖构建期联网拉字体；`docker compose up -d` + `npx prisma db push` + `npm run dev`（端口 3001）即可起站

## v0.24.8 — 2026-07-26

### 🗑️ 修最后 1 处必须修：拆书任务删除假成功（未查 res.ok）

**拆书任务删除（dissect/page.tsx handleDelete）**
- 原逻辑：`await fetch(DELETE)` 后直接 `setTasks(filter)` 移除列表项，不检查 res.ok → 服务端 4xx/5xx 时 UI 显示已删而服务端仍在=假删除成功（数据丢失隐患）
- 现改为：先判 `res.ok`，失败 `alert` 具体 HTTP 状态且不移除列表项，成功才移除

**收敛里程碑**
- 至此前端所有写操作（保存/删除/开关/采纳/同步）与加载失败均显式可见，无剩余「必须修」静默吞错/假成功；原模板核心功能（探讨/拆书/游戏/Agent工具/记忆S-A-B/伏笔/规则中心/文风+废词/质量矩阵/更新表）集成完整、无死链。
- 部署侧 `docker compose up -d` 起 PostgreSQL 后即可完整跑站（沙箱无 DB/无外网字体，构建需在部署侧执行）。

---

## v0.24.7 — 2026-07-26

### 🔍 收口全局静默吞错（角色卡采纳/世界书新建/文风应用·保存 + 加载失败可见化）

**写操作假成功（4 处必须修）**
- AIChatBar handleAdoptSuggestion：采纳角色卡建议原不检查 GET/PUT 的 res.ok（非 2xx 静默）→ 现 GET 失败显式提示并 return、PUT 失败显式提示，不再「点了没反应」
- WorldPanel 新建世界书：原 `if(res.ok)` 无 else、catch 静默 → 现失败 alert 且不关闭表单
- StyleSelector 应用文风 / StyleEditor 保存文风：PUT 失败仍关弹窗=假成功 → 现失败 alert 且不开窗/不关闭，成功才生效

**加载失败可见化（4 处）**
- settings 加载设置：原 `if(res.ok)` 无 else、catch 空 → 现失败显式提示
- ContextPreview 上下文预览：加载失败原静默显示「无法加载上下文数据」→ 现显式报错条 + 原因
- StyleEditor 加载文风配置：失败原静默用默认配置 → 现显式报错弹窗
- ImitationPanel 拆书任务列表/维度加载：原 catch 静默置空 → 现显式提示失败原因

---

## v0.24.6 — 2026-07-26

### 🔍 收尾 P1 静默吞错（章节提取/节点操作/故事线/关系同步/角色·词条·规则删除·开关）

**章节与节点操作**
- autoExtractChapter（12 维度自动提取）：失败原仅 console.error 静默 → 现 alert 明确提示，不再「转圈后无结果」
- handleAddSection / handleSummarize：非 200 原静默 → 现失败 alert 具体原因；网络异常也提示
- handleDeleteNode：网络异常原静默 → 现 alert

**故事线面板（StorylineList）**
- 加载失败原误显「还没有故事线」空态 → 现显式报错条 + 重试按钮，区分「无数据」与「加载失败」
- handleSave / handleDelete：原不检查 res.ok（保存失败仍关弹窗=假成功）→ 现失败 alert 且不关弹窗/不刷新

**关系同步与侧栏删除·开关**
- AIChatBar relation_sync：原不检查 syncRes.ok 且 catch 静默 → 现非 200 抛错 + 失败 alert，同步真实结果才提示
- AIChatBar analyze_relationships 的 catch 静默 → 现失败 alert
- LeftPanel 角色删除 / WorldPanel 词条删除 / RulesPanel 规则删除·开关：原不检查 res.ok → 现失败 alert 且不刷新（避免误以为已删/已切换）

---

## v0.24.5 — 2026-07-26

### 🛡️ 修 P0 假成功/数据丢失（抽卡章纲 + 角色/词条弹窗 + 作者注记）

**抽卡章纲保存（handleDrawSelect）**
- 原逻辑：PUT 保存失败被 `catch {}` 静默吞掉，仍乐观显示「已采用」→ 用户以为章纲已存，刷新后丢失
- 现改为：先请求成功（`res.ok`）才更新显示「已采用」；失败 `alert` 明确原因，不再误导

**角色/词条 编辑·创建弹窗**
- CharacterEditDialog / LorebookEditDialog 的 `handleSave`：原直接 `await fetch` 后 `onSave+onClose`，不检查 `res.ok` → PUT 失败弹窗关闭=假成功（编辑丢失）
- CharacterCreateDialog / LorebookCreateDialog 的 `handleSave`：POST 失败无提示 → 点了没反应
- 现四个弹窗统一：检查 `res.ok`，失败 `alert` 且不关闭弹窗（保留用户输入可重试），成功才 `onSave+onClose`

**作者注记自动保存（handleAuthorNoteChange）**
- 防抖 PATCH 原 `catch {}` 静默 → 服务端未存时刷新即丢注记，用户无感
- 现失败 `alert` 提示（区分 5xx/网络），并保留 `localStorage` 兜底

---

## v0.24.4 — 2026-07-26

### 🔧 后端错误结构化 + 死代码清理

**后端错误响应结构化**
- explore/create、explore/chat（对话/一键生成/大纲三处）、agent/extract-chapter、imitate/start 外层共 6 个 catch 统一改用 `jsonError`
- 返回标准化 `{ error, code, hint }`：Prisma/网络连接错误给出针对性中文修复指引（如「请执行 `npx prisma db push` 建表」），不再只甩原始堆栈
- SSE 流式错误（explore 大纲流、imitate 流内）此前已用 SSE error 事件推送，保持不变；settings/test 维持 `{ ok:false, error }` 前端契约不改

**死代码清理**
- 删除 `src/lib/conversation-compressor.ts`——全代码库 0 引用（仅更新日志历史文本提及），属历史遗留冗余模块

---

## v0.24.3 — 2026-07-26

### 🛠️ 工作台静默错误清零（修白屏 + 修假成功）

**工作台加载失败不再白屏**
- workspace/[projectId] 的 `loadProject` 原本 catch 仅 `console.error` → 后端 / DB 未就绪时整页白屏且无任何提示
- 现统一错误状态：网络异常或 5xx 显示可读错误卡片（含原因）+「重试」按钮；仅 404 判定「项目不存在」跳转首页
- 错误提示明确指引：请检查后端服务是否已启动并连接数据库

**大纲保存假成功修复**
- `onEditOutline` 原 `catch {}` 乐观更新后静默吞错 → 保存其实失败时用户以为成功、数据已丢
- 现捕获 `prev`、请求非 2xx 或网络异常时回滚选中节点并 `alert` 明确原因，杜绝静默丢数据

---

## v0.24.2 — 2026-07-26

### 🚪 修复部署启动链路（直击「完全不能用」真实根因）

**端口错配修复（最关键）**
- README / AGENTS 全程写 `localhost:3001`，但 npm 脚本原是 `next dev`（Next 默认 3000）——用户照文档打开 3001 必然是空白页，极可能是「完全不能用」的真实主因
- `dev` / `start` 改为 `next dev -p 3001` / `next start -p 3001`，与文档完全对齐

**环境要求校正**
- `package.json` 加 `engines: { node: ">=20" }`，Next 16 强要求 Node ≥20（低于 20 会启动失败）
- README 表格 Node 版本 `18.x` → `20.x（≥20）`，安装说明同步强调；方式二「手动 PostgreSQL」补上 `echo DATABASE_URL > .env` 步骤（此前漏写会导致 `npx prisma db push` 直接失败）

**配套（见 v0.24.0 / v0.24.1）**
- 系统自检横幅 + `/api/health` 探针：打开即提示数据库 / AI 是否就绪
- `npm run doctor` 启动前自检；前端删除 / 拆书失败均显式提示

---

## v0.24.1 — 2026-07-26

### 🖥️ 前端错误不再静默（修「点了没反应」）

**前端 fetch 错误可见化**
- 仪表盘「删除项目」失败（含非 200 响应）现在弹窗明确提示原因，不再静默无反应
- 拆书列表加载失败显示红色报错条 + 重试按钮，不再误显示「还没有任务」空态误导用户
- 拆书详情轮询失败显示顶部报错条 + 重试，避免轮询静默后界面空白
- 首页底部链接「更新公告」统一更名为「更新面板」，与站内面板命名一致

**后端配套（见 v0.24.0）**
- 探讨/采纳、拆书、实体高亮、Agent 工具等高频路由 catch 改用 `jsonError`，返回 `{ error, code, hint }` 中文操作指引
- 全局 `error.tsx` / `global-error.tsx` 错误边界，未捕获异常显示中文友好页而非白屏

---

## v0.24.0 — 2026-07-26

### 📋 站内更新面板 + 高频路由错误可读化

**站内更新面板（/changelog）**
- 页面顶部突出「当前版本」号与「最新」徽标，用户随时回看每个版本的版本号与更新内容
- 固化记录协议：每次改动都在 `src/lib/changelog-data.ts` 的 `VERSIONS` 数组插入条目 + 同步本文件（两文件一起提交），面板即唯一记录出口

**高频 API 路由错误可读化**
- 探讨「采纳」、拆书「查询 / 删除 / 启动」、实体高亮、Agent 工具执行 等 5 个高频路由的 catch 统一改用 `jsonError`，返回 `{ error, code, hint }` 中文操作指引
- 彻底告别「点了没反应却不知为何」——前端拿到可读错误即可直接展示

**健壮性修复**
- 修复 `/api/health` 中 `llm.hint` 可能 `undefined` 的类型错误
- 新增全局 `error.tsx` / `global-error.tsx` 错误边界，未捕获异常显示中文友好页而非白屏

---

## v0.23.0 — 2026-07-25

### 🩺 系统自检与首启动引导（失败可读化）

**系统状态自检横幅**
- 根布局挂载全局 `SystemStatusBanner`，打开任意页面即调用 `/api/health` 探测 DB 与 AI 配置
- 数据库未连接 / AI 未配置时顶部弹出琥珀色横幅：说明原因 + 给出 `docker compose up -d && npx prisma db push` 一键修复命令（可复制）或「去设置页填 Key」入口
- 直击此前「完全不能用却找不到原因」的核心痛点——失败现在可读、可操作，而非静默空白

**健康检查探针**
- 新增 `GET /api/health`——只读轻量探针，返回 `{ db:{ok,error,hint}, llm:{ok,error,hint}, version }`
- DB 探测用 `SELECT 1` 实际连库（区分「环境变量存在 ≠ 有效」）；LLM 探测复用 `getSettings` 配置优先级
- 任何异常都被吞掉并返回结构化结果，自检本身绝不拖垮页面

**API 错误可读化**
- 新增 `src/lib/api-error.ts`：`classifyError` 把 Prisma 错误码（P1001 连不上 / P1000 登录失败 / P2021 表不存在 / P2024 连接池耗尽 / P2002 唯一冲突 …）翻译为中文操作指引
- `jsonError()` 统一返回 `{ error, code, hint }`，已接入 `/api/projects` 与 `/api/settings` 两个首个触点路由

**首页加载失败可见**
- 仪表盘加载项目失败时不再误显示「还没有小说项目」空态，改为明确报错卡片 + 重试按钮
- 提示用户查看顶部黄色自检横幅按指引修复

---

## v0.22.0 — 2026-07-25

### 🛡️ 稳定性与可观测性加固

**AI 错误可读化**
- 所有 LLM 调用（流式 / 非流式）的报错从 `LLM API Error 401: ...` 这类原始信息，统一翻译为可操作中文提示
- 覆盖 401（Key 无效 / 过期）· 403（无权限）· 404（模型不存在，附「硅基流动 deepseek-ai/DeepSeek-V4-Flash」vs「DeepSeek 官方 deepseek-v4-flash」格式提示）· 429（限流）· 5xx（服务端异常）· 网络不可达 等场景
- 网络层异常（如 Base URL 配错、服务断连）也会给出明确指引，不再静默 500

**启动自检（doctor）**
- 新增 `npm run doctor`——启动前自动校验 PostgreSQL 可连接、LLM 配置是否就绪
- 明确区分「环境变量存在 ≠ 有效」，避免「完全不能用」却找不到原因

**更新表同步**
- 本文件（CHANGELOG.md）与 `src/lib/changelog-data.ts` 同步更新至 v0.22.0

---

## v0.21.2 — 2026-06-21

### 📖 README 重写——安装体验大幅优化

**Docker 一键安装（最大改进）**
- 🐳 新增 Docker 作为首选安装方式——一条 `docker compose up -d` 替代手动装 PostgreSQL
- 快速开始拆为两条路径：Docker（推荐）和手动安装，各自独立可复制
- 详细教程新增"方式一：Docker"完整指南——4步从零到跑起来
- 补充 Docker 常见问题：关数据库、公网部署

**修复旧版 README 的坑**
- 环境表格补上 Git（之前只列了 Node.js/npm/PostgreSQL，克隆项目用的 Git 反而没写）
- PostgreSQL 创建命令从硬编码路径 `PostgreSQL\16` 改为 `createdb` 直调 + 版本号替换说明
- 新增"生产部署"章节——`npm run build && npm start`，日常使用更省资源

### 🔧 次要修复
- README 目录更新，新增 Docker 锚点链接

---

## v0.21.1 — 2026-06-18

### 🎨 虚空玻璃设计体系——全站UI体系重建

**3级深度表面系统**
- `surface-base`（基底面——CSS噪点纹理消除塑料感）
- `surface-elevated`（抬升面——卡片/面板，悬停边框辉光+阴影扩增）
- `surface-floating`（浮起面——模态/弹窗，最高模糊+最深阴影）
- 旧版兼容：`.glass-surface` / `.glass-surface-strong` 保留

**8色功能语义色彩（OKLCH空间）**
- 靛蓝(主操作/生成) · 翠绿(确认/保存) · 琥珀(提醒/待处理) · 玫瑰(删除/危险) · 紫罗兰(AI/魔法) · 青(提示/信息) · 金(强调/高亮) · 灰(禁用)

**4档动画系统**
- 弹性曲线(cubic-bezier 0.34,1.56,0.64,1) + 缓出/缓入/平滑
- 4档时长：150ms(微交互) / 250ms(标准) / 400ms(强调) / 600ms(页面)

**5种按钮变体**
- `btn-primary`(靛蓝渐变) / `btn-success`(翠绿渐变) / `btn-danger`(玫瑰渐变) / `btn-creative`(紫罗兰渐变) / `btn-ghost`(幽灵按钮)
- 统一 hover 上浮 + active 按压反馈
- `input-glass` 统一输入框——聚焦辉光 + 悬停边框

### 🧩 SVG图标系统

- **30+ Lucide图标**：`src/components/ui/icons.tsx`——`<Icon name="..." size={} />` 统一接口
- **StatusDot 彩色圆点**：替代 🟢🟡🔵🔴⚫，带辉光阴影
- **语义色彩预设**：`iconColor.primary/success/warning/danger/creative/info/accent/muted`
- **全站迁移**：15个页面/组件 emoji → SVG，约50处替换

### 🔤 字体优化

- **中文fallback链**：Geist Sans → PingFang SC → Microsoft YaHei → system-ui
- **等宽字体**：JetBrains Mono（替代Geist Mono）用于代码/API Key
- **4级文字明度**：L1主(#EEECE6 16:1) / L2辅(#9E9C94 6:1) / L3弱(#6B6962 3.5:1) / L4禁用(#484640)
- **排版比例变量**：`text-2xs`→`text-2xl` + `leading-tight/normal/relaxed`

### 🖱️ 悬停 + Tooltip 系统

- **3级悬停阴影**：`--shadow-hover-sm/md/lg` + **3色辉光**(indigo/success/creative)
- **Tooltip纯CSS**：`data-tooltip` 属性驱动，毛玻璃背景，零JavaScript依赖
- **链接悬停下划线动画**：`.link-underline`——伪元素 + width过渡
- **`prefers-reduced-motion`** 支持——尊重系统无障碍设置

---

## v0.21.0 — 2026-06-18

### ✨ UI 全面升级——玻璃态设计

- 35+组件统一视觉：`bg-white/[0.02] backdrop-blur-sm` 玻璃表面 + `active:scale-[0.97]` 按压反馈
- 首页/设置面板/更新公告/探讨页面/工作台/拆书页 全部页面 Premium 化
- 新增设计 token 类：`.glass-surface .btn-press .card-lift .glow-pulse .fade-in-up`
- 自定义滚动条样式 + 聚焦光环 + 渐变按钮阴影 + 悬停上浮效果
- 探讨页面拆分为 ChatPanel / OutlinePanel / CardBrowser / BuildConfigPanel / AdoptedContentPanel 五个独立组件

### 🎯 探讨模式架构重构

- 新增共享工具模块 `src/core/explore/utils.ts`——消除3处重复代码（stepToCategory / extractJson / extractKeysFromText）
- chat/route.ts 复用 extractJson（-15行）
- adopt/route.ts 复用 stepToCategory + tryExtractStructured + extractCharacterKeys（-55行）
- create/route.ts 复用 stepToCategory + extractKeysFromText，重写 generateDefaultRules()
- 删除废弃端点 outline/route.ts（207行死代码，零引用）
- 顶栏新增全局模式切换器（大纲模式也能切回聊天）

### 📝 写作铁律自动注入系统

- 新建项目时自动创建7条写作铁律到 Rule 表（scope=write_only, priority=94~100）
- 句式铁律——长短交错，禁止短句堆砌
- 人物指代——名字优先，禁止他/她连用
- 禁用符号与禁用句式——破折号/括号/数字对白全部禁止
- 禁止描写声音/语气/眼神/视线
- 白描铁律——只呈现可观察的动作和对白，零作者解读
- 节奏控制——细节密度20-30%，快慢节奏切换
- 情节与情绪——每章至少一次反转，抑扬交替
- 生成时自动注入：getActiveRules("write_only") → injectRules() → 拼入 Prompt 顶部

### 🔧 拆书功能增强

- 15维度智能拆解 + 仿写引擎 + 并行化8x提速
- 拆书结果 UI 重设计——双路径创建项目
- 角色扩展 Step 0 硬过滤 + 复合名智能拆分 + 预览迷你卡
- 世界书 AI 扩展五步管线（审计→拆分→删非词条→去重合并→扩展）

---

## v0.20.36 — 2026-06-18

### 🎯 探讨模式 —— 对话式构建小说世界

**核心体验**
- `/explore` 页面：三栏布局——左构建配置 / 中AI对话 / 右已采纳内容
- 11个构建步骤导航（开篇→世界观→主角→金手指→冲突→势力→力量→货币→地图→情节→自由讨论）
- 双模式切换：💬 自由对话 / 🃏 抽卡模式（AI给出3-5张候选方案卡片，点选立即采纳）

**构建配置面板**
- 基础：小说名称 + 主角名称 + 创作方向
- 进阶：12种类型 · 60+流派标签 · 受众定位 · 篇幅字数 · 情节结构（五幕式/三幕式/英雄之旅/起承转合/序破急）
- 深度：风格偏好8选 · 力量体系40选 · 金手指50选 · 核心冲突 · 强制原创命名

**创建项目**
- 📦 直接创建 —— 已采纳设定自动导入世界书（按步骤分类）+ 主角名创建角色卡
- 🤖 AI完善后创建 —— LLM检测缺失设定并补充
- 导航栏新增「🎯 探讨」入口

---

## v0.20.35 — 2026-06-18

### 🛡️ Step 0硬过滤 + 复合名智能拆分 + 拆书预览迷你卡

**Step 0 硬过滤（代码级预筛）**
- `characters/expand` 在AI审计前增加硬过滤——`isValidCharName()` 内联实现
- 100+字段标签硬黑名单 + 100+常见姓氏白名单
- 处理顺序：硬过滤删除→复合名拆分→AI审计→去重合并→并发扩展
- 彻底杜绝AI扩展后字段标签被填满假数据导致二次审计误判的问题

**复合名智能拆分**
- 「叶临渊 / 林玄言」在硬过滤阶段检测到 "/" → 自动拆为两个独立角色卡
- 拆分后继承原卡的 background/abilities/personality 等数据

**拆书预览迷你卡**
- 角色预览从简单name标签改为迷你角色卡（头像+名字+角色badge+描述）
- 角色定位色彩区分：★主角(amber) / ◆反派(red) / ◈导师(blue) / ●配角(gray)
- 预览格式匹配工作区CharacterList——导入前后视觉完全一致

---

## v0.20.34 — 2026-06-18

### 🔧 AI审计prompt修复 —— 字段标签黑名单

**角色扩展审计修复**
- 新增【🚨绝对非角色】黑名单——50+字段标签永久排除
- 分段标题（「一、主角」「二、主要配角」）直接标记为非角色
- 单字属性碎片（「在」「背」「与」「性」「说」等）永不误认
- 常见姓氏引导（李王张刘陈杨赵黄周吴等100+）辅助真人识别

**世界书扩展审计修复**
- 新增【🚨绝对非词条】黑名单——字段标签+角色名双重检测
- 2-4字中文姓名自动排除出世界书列表

**端到端检验**
- 琼明神女录项目实测：30角色→审计合并13组重复→17个去重
- 修复后再扩展：将正确删除12个字段标签→保留3-5个真实角色

---

## v0.20.33 — 2026-06-18

### 📚 世界书AI扩展 + 五步管线

**世界书AI扩展端点**
- 新增 `POST /api/lorebook/expand` — SSE流式，12并发
- 对标角色卡扩展端点（`/api/characters/expand`），完整五步管线
- LorebookList 新增「🤖 AI扩展」按钮——勾选词条后一键处理

**五步管线**
1. **AI审计**：一次LLM调用检测非词条（角色名混入）、组合词条（多主题混杂）、分类错误
2. **拆分**：组合词条按拆分方案各建独立词条，原内容按比例分配
3. **删非词条**：自动删除被识别为非词条的条目
4. **去重合并**：标题相似度检测→合并内容+触发词→删重复
5. **并发扩展**：12并发补全内容/生成触发词/修正分类/响应拆分请求

**UI**
- 扩展进度条：审计→预处理→逐词条完成状态
- 结果弹窗：成功列表+失败原因明细
- 与整理/导入/AI填满按钮形成完整世界书工具链

---

## v0.20.32 — 2026-06-18

### 🔧 角色名合法性校验 + 🤖 AI批量结构化

**核心修复——角色名过滤**
- 新增常见中文姓氏库（100+单姓 + 20+复姓如欧阳/慕容/尉迟）
- 2字名必须以常见姓氏开头才被识别为角色名
- 新增 FIELD_LABELS 过滤集（100+字段标签）——性别/年龄/外貌/说话风格/别名/称号/关键剧情等永远不会被误认为角色名
- `isValidCharacterName()` 统一校验：纯中文 + 长度2-5 + 含姓氏 + 不在标签集
- 含顿号的分段标题（「一、主角」「二、主要配角」）自动过滤
- 「叶临渊 / 林玄言」→ 自动拆分为两个独立角色

**AI批量结构化**
- `aiStructureCharacters()` — 兜底扫描出的角色名，一次LLM调用补全所有年龄/性别/外貌/性格/背景/能力
- 结构化输出完整映射 CharacterCard 字段
- AI失败自动降级为仅名字导入，不阻断流程
- 兜底导入角色自动加「🤖AI补全」标签

---

## v0.20.31 — 2026-06-18

### 🔧 角色导入修复 + 🤖 AI填满按钮 + 📋 格式统一

**角色导入修复（根因解决）**
- quick模式分割重试：维度内容<20字符自动尝试模糊匹配标题变体，仍失败则发起独立LLM重试
- 角色兜底提取：主维度解析失败时，自动从大纲摘要/故事核心/势力阵营/情节脉络扫描角色名
- 角色预览卡片：拆书完成页顶部展示提取到的角色数量+角色名列表

**AI填满按钮**
- 角色卡编辑标题栏新增 🤖 AI填满 按钮：自动检测空白字段（外貌/性格/对话风格/背景/能力/隐藏动机等），一键LLM补全
- 世界书编辑标题栏新增 🤖 AI填满 按钮：自动补全词条内容和触发关键词
- 新增 `POST /api/characters/[id]/autofill` + `POST /api/lorebook/[id]/autofill` 两个端点
- 补全后自动去除「📥拆书导入」标签

**格式统一**
- 拆书→导入角色完整映射CharacterCard字段：appearance/personality/dialogueStyle/hiddenMotives/aliases
- 年龄/性别正则提取（"XX岁"、"男性"等），缺失字段留空不伪造
- 导入预设总览：拆书完成页三卡片——角色数/世界书词条数/文风状态，一目了然

---

## v0.20.30 — 2026-06-18

### 🎨 拆书结果UI重设计 + 双路径创建

**结果展示彻底重做**
- 分组卡片式布局：总览/世界设定/力量体系/角色与剧情/物品与风格 5大组
- 每组可折叠，维度可展开——300字预览→点击展开全部
- 章节摘要双列网格，带编号+标题+摘要
- 告别裸Markdown糊脸，视觉层次分明

**双路径创建项目**
- 📦 **原样转为项目**：100%忠实还原原著，一键创建
- 🎨 **改编后转项目**：先跟Agent聊修改方案（换性别/改设定/调世界观），改到满意再创建
- 改编模式：左侧拆书数据参考 + 右侧Agent对话，聊完点"应用修改并创建"
- `to-project` API 接受 `modifications` 参数——改编要求写入项目 `authorNote` + `globalPrompt`

**技术细节**
- 新增 `DissectAdaptPanel` 组件：Agent对话+修改累积+一键创建
- `convertToProject()` 支持 `modifications` 可选参数
- 改编项目名自动加 `[改编]` 前缀，方便区分

## v0.20.29 — 2026-06-18

### 🔧 拆书进度可视化 + 防抖动优化

**SSE 实时进度（替代 fire-and-forget）**
- start API 改为 SSE 长连接——连接存活 = 任务在跑，不会丢异步上下文
- 进度实时推流：分章→维度提取→每个维度完成→章节摘要，全程可见
- 支持取消：前端 AbortController，用户随时中止
- 即使网络断开，DB 仍有进度，重进详情页可恢复（轮询回退）

**屏幕晃动修复**
- 进度条从 `width` 改为 `transform: scaleX()`——GPU 合成层，不触发 reflow
- 固定 `min-height` 容器：进度区 120px、维度网格 56px、内容区 60vh
- 章节进度区预分配空间（`minHeight: 20`），文本出现时不跳动
- `tabular-nums` 数字等宽，百分比变化时数字不位移
- `will-change: transform` 提前提升到合成层

**轮询逻辑重构**
- 用 `useRef` 存 interval——避免 useEffect 闭包陷阱导致的重复/遗漏轮询
- 始终轮询（不管什么状态），后端决定返回什么
- 任务完成后降频到 30s 一次（省资源）
- taskRef 同步最新状态给 interval 回调

## v0.20.28 — 2026-06-18

### ⚡ 拆书系统性能优化 — 并行化 + 智能采样

**维度提取并行化（~8x 提速）**
- 标准模式：4组维度并行跑 → 耗时从~80s 降至~20s
- 精细模式：15维度并发池(limit=8) → 耗时从~300s 降至~40s
- 快速模式不变（本身就是单次LLM调用）

**章节摘要并发池（~8x 提速）**
- `withConcurrency(8)` 模式——复用 `characters/expand` 的并发池
- 50章从串行~250s 降至并发~35s
- 单章失败不阻断其他章，容错性更好

**智能文本采样（省Token+提质量）**
- `buildDimensionTextSample()`：不同维度看文本不同部位
- 角色维度 → 对话密集段落 + 前5章完整出场
- 风格维度 → 头/中/尾三段代表性样本
- 情节维度 → 各章开头段落（情节通常在章首引入）
- 地图/势力 → 搜索含地名/势力名的段落
- 力量/功法 → 搜索含修炼术语的段落
- 货币/物品 → 搜索含交易/物品关键词的段落
- 预期效果：精准度提升 + Token 节省~30%

**技术实现**
- 通用并发池 `withConcurrency<T,R>(items, fn, limit=8)` —— 任意任务可复用
- 降级容错：单维度失败标记 failed 继续跑，不拖累整体
- 实时进度：每完成一个维度/章节就更新 DB，前端轮询可见

## v0.20.27 — 2026-06-18

### 📚 整本拆书系统 — 15维度智能拆解 + 仿写引擎

**拆书导航（3个新页面）**
- `/dissect` — 拆书任务列表，实时进度追踪，支持导出为 Novel Forge 项目
- `/dissect/new` — 新建拆书，支持TXT文件上传/直接粘贴，三级拆解深度（快速/标准/精细）
- `/dissect/[id]` — 结果展示（15维度标签页）+ 仿写面板（数据源选择+模式+相似度滑块+维度勾选）

**15维度拆解（覆盖世界卡全部维度）**
- 基本信息/世界观/故事核心/角色/情节脉络/大纲摘要/伏笔/地图/势力阵营/力量体系/特殊设定/货币体系/物品/功法体系/写作风格分析
- 三种深度：快速（1次LLM全提）/ 标准（4组分批）/ 精细（15维各单独LLM）
- 可选章节摘要提取：每章独立生成摘要+新角色+伏笔+情感基调

**仿写引擎（基于拆书记忆）**
- 三种模式：完全仿写（高还原）/ 部分仿写（留骨架创新）/ 创意改写（借灵感重写）
- 相似度滑块 0-100%，控制与原作的接近程度
- 15维度自由勾选——选哪些维度就用哪些原作设定
- SSE 流式输出，自定义要求 + 提示词库

**核心技术**
- 三层章边界检测（正则→语义→固定字数回退）
- Prisma 新模型：DissectionTask（JSON存15维度+章节列表）
- 转为项目：自动创建项目+角色卡+世界观条目+风格卡+大纲节点
- 仪表盘新增「拆书」入口

## v0.20.26 — 2026-06-18

### 📐 文风预设扩充 + 大纲模板系统

**10 种文风预设（从 9 种扩展到 11 种）**
- 新增「古风仙侠」——半文半白、修仙体系严密、战斗画面感、环境写意境
- 新增「现代都市」——贴近当代中文、场景驱动、对话为核心
- 11 种预设覆盖：热血/日常/黑暗/悬疑/恋爱/奇幻/科幻/情欲古风/仙侠/都市/自定义

**5 种大纲模板（outlines.ts）**
- 三幕式：建置25%→对抗50%→结局25%，电影级结构
- 起承转合：中国传统四段式，仙侠/玄幻首选
- 英雄之旅：12阶段坎贝尔原型，长篇成长型主角
- 章回体：每章独立成篇+章尾悬念钩子，网文连载节奏
- 自由结构：不拘套路，AI做执行者作者做结构师
- `calculateChapterPlan(template, totalChapters)` 一键计算每阶段建议章数
- `outlineTemplateToPrompt(template)` 注入生成 prompt

## v0.20.25 — 2026-06-18

### 🤖 Agent 工具层——智能调度 + 意图解析 + 分层提示词 + 对话压缩

**工具依赖图调度引擎（tool-scheduler.ts）**
- 拓扑排序：自动分析 21 个工具的依赖关系，并行跑独立查询、串行跑有依赖的
- 18 个查询类工具零依赖可直接并行，3 个生成/分析类工具有依赖自动排队
- 循环依赖检测——无法解析时剩余工具全部放入最后一阶段执行

**意图解析器（intent-parser.ts）**
- 纯规则引擎，零 Token 消耗——关键词 + 正则匹配拆解用户自然语言
- 覆盖 21 个工具的查/改/删/创/写/分析六大意图类别
- 自动从消息中提取角色名/章节号/关键词作为工具参数
- 置信度评分 + 去重（同一工具只取最高分）
- 低置信度/空结果 → `needsLLMFallback()` 返回 true，上游 LLM 兜底

**Agent 路由器（agent-router.ts）**
- 一条管道：自然语言 → intent-parser → tool-scheduler → 结果汇总为自然语言
- 21 种工具各有专属摘要模板（character_list 列角色、project_info 列统计等）
- frontendAction 收集——工具可触发前端动作（如 chapter_generate → 弹出写作面板）
- 失败时 `usedLLMFallback=true`，上游可调 LLM 重新解析

**分层提示词（layered-prompt.ts）**
- 五层结构：身份定义 / 硬规则(★★★) / 中等规则(★) / 动态上下文 / 工具说明
- 每层独立可启用/禁用/替换，管理员可编辑单层内容
- `assembleLayeredPrompt(config)` 按层组装，自动跳过空层/禁用层

**对话历史压缩器（conversation-compressor.ts）**
- 三层策略：自然淘汰(8000+token) → 主动压缩(6000+→300token摘要) → 极端压缩(仅保留最近3轮)
- 纯规则摘要——记录"做了什么"不记录"具体数据"，零 Token 消耗
- `getCompressionAdvice()` 轻量预览，不实际压缩

## v0.20.24 — 2026-06-18

### 🧠 S/A/B 三级记忆注入 + 长效记忆衰减

**S/A/B 三级记忆注入（Token 优化五策略）**
- 新建 `src/lib/memory-injector.ts`——把分级记忆转成优化文本块注入 prompt
- 策略1 JSON结构化：S 级用 `{"ch":3,"e":"事件","imp":"角色"}` 紧凑 JSON，省 ~40%
- 策略2 选择性字段：A 级只输出 Ch+描述，不输出元数据
- 策略3 增量去重：与最近上下文 30 字符窗口匹配，已出现的事件自动跳过
- 策略4 引用压缩：B 级用 `Ch3:玉佩伏笔 | Ch5:秘境试炼` 关键词索引
- 策略5 分层截断：S全量(40%)→A摘要(40%)→B关键词(20%)，超预算静默丢弃
- `pre-processor.ts` 在构建 context 前自动调用 `classifyEvents` 做 S/A/B 分级
- `orchestrator.ts` 在 systemPrompt 中注入优化后的分级记忆块

**长效记忆衰减引擎**
- 新建 `src/lib/memory-decay.ts`——模拟人类记忆遗忘曲线
- 衰减规则：S级永久 / A级30章 / B级15章 / C级5章
- 过期事件自动逐级降级（A→B→C→删除），一次性计算多级跳跃
- `cleanupExpiredMemories(projectId)` 遍历所有章节摘要，应用衰减后写库

**衰减清理 API**
- 新建 `GET /api/cron/memory-decay?projectId=xxx&dryRun=true`
- dryRun 模式预览衰减规则+当前统计，不实际写入
- 正式执行返回完整统计：kept/downgraded/deleted + 各层级事件分布

## v0.20.23 — 2026-06-18

### 🛡️ 写中实时质量拦截 + 六维质量矩阵 + 记忆系统时间线过滤

**实时规则检测（写中拦截）**
- write/route.ts 流式生成中每积累 ~200 字符实时扫描禁用词
- 违规通过 SSE `rule_violation` 事件即时推送——不用等写完整章再回头改
- 扫描耗时 < 2ms，不影响流式生成流畅度

**六维质量矩阵自动评分**
- 新建 `src/lib/quality-analyzer.ts`——纯本地算法，零 Token 消耗
- 六维：废词率 / 展示vs讲述比 / PoV一致性 / 句式多样性 / 对话自然度 / 主语多样性
- 每维 0-100 分 → 加权总分 → A/B/C/D 四级，结果写入 `StoryNode.qualityScore`
- 复用步骤1的禁用词扫描结果，避免重复计算

**记忆系统——时间线感知过滤**
- `context-loader.ts` 自动按 `currentNode.order` 过滤 summaries/storyBeats/pendingCommitments
- 写第7章时不会把第10章的金丹期状态注入生成上下文——根治跳章剧情污染

**待兑现事项追踪**
- 新增 `PendingItem` 模型 + CRUD API（`/api/pending-items`）
- post-processor 自动检测"下次/回头/以后/等下次"关键词 → 创建待办
- 下次生成时待办事项自动注入系统提示词

## v0.20.22 — 2026-06-18

### 🎯 12维风格参数注入生成提示词 + 代码去重

**12维风格参数端到端打通**
- 修复 Style API PUT 路由——`body.dimensions` 不再被静默丢弃，正确存入 `llmConfig`
- 修复 Style API GET 路由——返回 `dimensions` 字段
- orchestrator.ts `buildPromptContext` 读取 `llmConfig.dimensions`，生成风格参数块注入系统提示词
- 12维标签：词汇丰富度/句子长度/描写密度/对话比例/修辞手法/节奏速度/心理描写/环境描写/口语化/幽默感/暴力程度/暧昧程度

**continue/route.ts 消除内联查询**
- 改用 `loadGenerationContext(projectId, currentNodeId, 5)`，与 write/refine 统一
- 删除 9 表 Promise.all 内联查询

**chapter-outline 路由代码去重**
- 新建 `src/core/pipeline/outline-context.ts` 共享模块
- 提取 6 个共享函数：loadOutlineData / extractPrevContext / extractNextContext / buildCharacterList / prepareOutlineDirective / formatSummaries
- chapter-outline/route.ts 和 draw/route.ts 都改用共享函数，各减少 ~60 行重复代码

## v0.20.21 — 2026-06-17

### 🧹 全站架构自查+清理——砍掉 ~3500 行死代码

**前端死代码（5组件）**
- CardUpdater（1051行）— PostGenPanel 替代，已删
- ChapterExtractionPanel（612行）— PostGenPanel 替代，已删
- OutlineGenerator（327行）— OutlineDialog 替代，已删
- EntityDetector（253行）— 旧UI残留，已删
- StreamingText（11行）— MarkdownViewer 替代，已删

**后端死代码**
- /api/agent/logic-check — post-processor 已内联相同逻辑且更完整，已删
- /api/generate/check-all-cards — 三相位检查，前端不调用，已删
- /api/generate/update-style-card — 文风更新走 projects/[id]/style，已删
- commitment-tracker.ts — 完整类定义从未实例化，已删

**Schema 清理**
- Project.povCharacterId — 从未写入的死字段，已移除
- StoryNode.previousVersionId — 从未写入的死字段，已移除
- Store reviewPanelOpen — 不再有 ReviewPanel 组件，已移除

**重复修复**
- ReviewPanel 不再在 CenterPanel 中重复渲染（审校结果只在 PostGenPanel 看）
- PostGenPanel 改用统一的 ReviewIssue 类型，消除内联重复定义
- continue/route.ts 移除未使用的 loadGenerationContext 导入

**抽卡集成 P0 格式**
- DrawCards API 输出 P0 标准格式章纲（C|/R|/L|/G|/P|/CF|/M|/K|/EL|/T|）
- DrawCards 组件新增 P0 语法高亮着色（与 GameOutlineEditor 配色一致）

## v0.20.20 — 2026-06-17

### 📋 P0标准格式章纲系统 + 游戏页内置编辑器

**结构化章纲格式**
- 三层架构：章节元信息（C|/L0|/L1|/L2|）→ 叙事段落（R|/L|/G|/P|/⟨✍⟩）→ 技术规格（CF|/M|/K|/EL|/T|）
- 每行精确语义：R|角色行动 / L|场景切换 / G|金手指触发 / P|剧情推进 / CF|伏笔操作 / M|情绪 / K|金句 / EL|弧线 / T|过渡
- 写作指令 ⟨✍⟩ 作为导演批注，不构成故事内容

**章纲生成API**
- POST /api/game/outline/generate — Agent按P0格式一键生成章纲
- POST /api/game/outline/chat — 多轮对话确认章纲（SSE流式），支持"探讨-反馈-定稿"

**游戏页内嵌章纲编辑器**
- 三模式切换：✏️编辑（语法高亮） / 👁预览（着色渲染） / 💬对话（AI对话确认）
- 行类型着色：C|青 R|绿 L|青 G|金 P|灰 CF|紫 M|玫瑰 K|琥珀 EL|粉 T|青
- ⚡AI生成按钮 + 💾保存到StoryNode.outline

**章节树🎮入口**
- 每个章节节点悬停即显示🎮按钮，点击进入游戏模式
- 无需先在workspace选中章节再点游戏按钮

## v0.20.19 — 2026-06-17

### 🎮 游戏模式——互动文本冒险写作

**独立沉浸式 UI 页面**
- 全新路由 `/workspace/[pid]/game/[nid]`，全屏暗黑主题
- 三栏布局：左侧（情节/角色/势力）+ 主画布（叙事流+选项）+ 右侧（正文/背包/世界）
- 简单星空粒子背景，安静不喧闹

**核心游戏循环**
- 6 个快捷动作：观察/对话/战斗/探索/使用物品/休息 + 自定义文本输入
- AI 逐段生成 300-600 字叙事，每轮给出 2-4 个编号选项
- SSE 流式输出，实时打字感

**实体与背包追踪**
- 每轮自动追踪新实体（NE|格式），类型：角色/地点/物品/势力/功法/生物
- 背包系统（CI|格式），获得/消耗/装备追踪，右侧面板分类展示
- 情节进度百分比，基于章纲情节点自动推进

**结束并导出**
- 点击"结束并导出"→检查章尾悬念钩子→有钩子用钩子收尾，无钩子自然收束
- 拼接全部累积正文→保存为 StoryNode.content，与正常 AI 直写无差别
- 返回工作区即可看到完整章节正文

**后端**
- 新增 GameSession + GameState 两张数据表
- 新增 3 条 API：/api/game/start（初始化）/ /api/game/action（SSE回合）/ /api/game/end（导出）
- 新增 src/core/game/ 模块：game-engine.ts / game-prompts.ts / types.ts
- CenterPanel 新增 🎮 游戏模式入口按钮

## v0.20.18 — 2026-06-17

### 🎨 文风面板全面升级——12维度 + 废词检测内置

**文风编辑器重写**
- 10 种预设风格库（热血/日常/黑暗/悬疑/恋爱/史诗/科幻/古风/极简/自定义），一键切换
- 12 维度滑块微调：词汇丰富度、句子长度、描写密度、对话比例、修辞手法、节奏速度、心理描写、环境描写、口语化、幽默感、暴力程度、暧昧程度
- 三项 Tab：文风维度 / 废词检测 / LLM参数

**废词检测引擎 v3.0**
- 5 类检测器：精确禁用词、句式模式（正则）、身体模板（正则）、模糊词密度（每500字）、AI高频特征词
- 内置 50+ 条检测规则，支持自定义禁用词和正则表达式
- 质量评分 0-100，按严重度/类别分组展示
- [扫描当前章节] 按钮——即时检测并展示上下文+替换建议

### 📊 统一分析面板——4 Tab 替代旧版碎片UI

**PostGenPanel 内联面板**
- 替代旧版 ChapterExtractionPanel（全屏弹窗）+ CardUpdater（旧三卡）+ distillSummary 浮动横幅 + autoUpdateNotification 浮动横幅 + cardUpdatePending 浮动按钮 + "AI分析本章变化"正文下方按钮
- 4 Tab：📊章节提取 / 🔍逻辑自查 / ⚡本地蒸馏 / 📝审校
- 底部操作栏：[全部采纳] [✨继续写下一节] [关闭]

### 🔍 逻辑自查自动化

**新增 /api/agent/logic-check**
- 角色死活一致性：前文标记 dead 的角色本章出场 → error
- 时间线连续：前章时间标记 > 本章 → warning
- 关系突变检测：前文盟友 → 本章敌对，检查过渡描写
- 物品追踪：前3章出现的物品本章未提及 → info

### 🧹 前端大清理

**删除的重复/过时元素**
- ❌ 2 个浮动横幅（蒸馏通知 + 提取通知）
- ❌ 1 个浮动按钮（三卡待更新）
- ❌ 1 个全屏加载遮罩
- ❌ 2 个正文下方按钮（继续写下一节 + AI分析本章变化 → 移至 PostGenPanel）
- ❌ ChapterExtractionPanel 全屏弹窗
- ❌ CardUpdater 旧三卡分析弹窗
- ❌ autoAnalyzeChapter 旧函数

**保留但整合的**
- ✅ 章节提取 → PostGenPanel 📊提取 Tab
- ✅ 本地蒸馏 → PostGenPanel ⚡蒸馏 Tab
- ✅ 审校结果 → PostGenPanel 📝审校 Tab
- ✅ 继续写下一节 → PostGenPanel 底部按钮

---

## v0.20.17 — 2026-06-17

### 🤖 章节自动提取系统——12 维度一键入库

**生成完自动弹出提取面板**
- 一次 LLM 调用提取 12 个维度：出场角色、场景地点、势力阵营、道具物品、伏笔线索、情绪节奏、关键台词、章节摘要、下章衔接、写作要素、角色经历、关系变化
- 逐项展示，可单独采纳/编辑/取消，支持全部采纳/全部忽略
- 智能路人检测：提及 < 3 次 + 无对话 + 无行动 → 标记"疑似路人"，不自动建卡
- 提取结果自动写入对应数据表：角色卡（新建/经历追加/能力追加）、世界书（地点/势力/道具）、伏笔表、章节摘要、下章大纲衔接

**替代旧三卡分析**
- 旧的 CardUpdater 自动触发改为新的提取面板
- CardUpdater 保留手动触发（按钮+浮动按钮）作后备
- 提取失败自动回退到 CardUpdater

**上下游完整贯通**
- 后处理管线 → SSE done → 自动调提取 API → 面板弹出 → 用户选择 → 批量写入 → loadProject 刷新
- 与现有 post-processor 无冲突——提取面板 upsert chapterSummary，不重复写入

### 🕸️ 角色关系——世界书新维度

**数据模型**
- 关系存为世界书条目（`category=character_relationship`），零 schema 变更
- 关系条目格式：A ↔ B：关系类型，含原因、动态、正文证据
- WorldPanel 新增「角色关系」板块，支持手动创建和编辑

**Agent 自动同步**
- `relation_sync` 工具：从正文提取关系 → 自动写入世界书
- 融合替代策略：已有同角色关系 → 追加新内容；没有 → 新建条目
- `/api/agent/sync-relations` API

**生成时强制注入**
- 正文生成时，根据当前调度角色名强制加载对应的关系条目
- 注入到 systemPrompt「角色关系网」区域——不走触发词匹配，直接按角色名查询，保证不漏

**关系可视化**
- RelationshipGraph 重写为 Agent 正文分析驱动
- 每条关系带正文原句证据 + 来源章节
- 标记"角色卡记录但正文未体现"的过时关系

### 🧠 Agent 会话记忆 + 写后分析

**会话记忆**
- `src/lib/chat-sessions.ts`：内存存储，按 projectId 隔离
- 最多 20 条消息，30 分钟自动过期
- Agent 记住本轮对话上下文，问完"最强角色"再问"他和凌霜什么关系"——知道"他"是谁

**写后分析**
- `analyze_chapter` 工具：对比正文 vs 角色卡，找出 6 类缺失（能力/性格/关系/别名/状态/外貌）
- 分析结果卡片展示 + 一键采纳 → 自动更新角色卡
- `/api/agent/analyze-chapter` API

### 📐 变更

- `api/agent/extract-chapter/route.ts` — **新建**：LLM 一次提取 12 维度
- `api/agent/apply-extraction/route.ts` — **新建**：批量写入 5 张表
- `api/agent/sync-relations/route.ts` — **新建**：关系同步到世界书
- `api/agent/analyze-chapter/route.ts` — **新建**：章节 vs 角色卡对比
- `api/agent/analyze-relationships/route.ts` — **新建**：Agent 读正文提取关系网
- `components/workspace/ChapterExtractionPanel.tsx` — **新建**：提取面板 UI
- `components/workspace/RelationshipGraph.tsx` — **重写**：Agent 驱动的关系图
- `lib/chat-sessions.ts` — **新建**：Agent 会话记忆
- `page.tsx` — 集成提取面板，自动触发替代旧三卡分析
- `orchestrator.ts` — 生成时强制注入角色关系条目
- `tool-registry.ts` — +4 工具（analyze_chapter/analyze_relationships/relation_sync/extract_chapter），category 映射
- `WorldPanel.tsx` — +角色关系板块 + 字段模板
- `RightPanel.tsx` — +关系图子tab
- `AIChatBar.tsx` — 分析结果展示 + 一键采纳 + 关系同步
- `chat/route.ts` — 会话注入 + 路径E/F + 新工具速查
- `types/index.ts` — LoreCategory 新增 character_relationship

---

## v0.20.16 — 2026-06-17

### 🎨 右侧栏重构——三 tab 一体化

**顶部三 tab 切换**
- 🤖 **AI助手** — AI 对话栏从页面底部移入右侧面板，始终可见
- 🔍 **查询实体** — 实体追踪 + 伏笔，子 tab 切换
- 📊 **监测** — 实时统计数据面板

**监测面板**
- 字数概览：总字数、完成率、当前章字数、均章字数
- Token 估算：生成/提示/总计 Token 消耗（基于字数智能估算）
- 章节分布：最多/最少字数、完成进度
- 数据记录：摘要数、转折点数、伏笔数
- API：`/api/stats/monitor` 聚合查询

**交互**
- 最小化状态三条竖排标签可点击切 tab
- 底部统计栏 + 可折叠上下文监控保留

### 📐 变更
- `RightPanel.tsx` — 重写，三 tab 架构
- `MonitorPanel.tsx` — 新建
- `/api/stats/monitor` — 新建
- `page.tsx` — 移除底部 AIChatBar，AI 对话移入右侧面板

---

## v0.20.15 — 2026-06-17

### 🤖 Agent 工具箱全面升级——21 工具接管所有按钮

**从 4 工具扩展到 21 工具，覆盖全部 CRUD 操作：**

**🧑 角色管理 (5)**
- `character_list` — 列出全部角色（可按类型筛选）
- `character_get` — 查单个角色完整信息（性格/外貌/关系网/时间线/弧光）
- `character_create` — 创建角色（支持快速导入原文描述）
- `character_update` — 修改角色属性（姓名/性格/状态/弧光等）
- `character_delete` — 删除角色

**📖 世界书管理 (5)**
- `lore_list` — 列出世界书条目（按分类筛选：地理/势力/物品/功法等）
- `lore_get` — 按关键词查设定完整内容
- `lore_create` — 创建世界设定/势力/物品/功法
- `lore_update` — 修改词条
- `lore_delete` — 删除词条

**📋 大纲管理 (4)**
- `outline_list` — 查看大纲树（卷→章→节层级，含状态/字数）
- `outline_create` — 创建节点（可指定父节点）
- `outline_update` — 修改标题/大纲/状态
- `outline_delete` — 删除节点（含递归删除子节点）

**🔮 伏笔管理 (3)**
- `foreshadowing_list` — 列出伏笔（按状态筛选）
- `foreshadowing_create` — 创建伏笔
- `foreshadowing_update` — 修改状态/描述

**📝 正文 (2)**
- `chapter_get` — 查询章节正文内容
- `chapter_generate` — 触发 AI 写作面板（frontendAction 机制——通知前端弹面板）

**🔍 其他 (2)**
- `detect_entities` — 扫描正文实体引用
- `project_info` — 查看项目统计

**🖥️ 前端工具箱**
- AIChatBar 新增 6 个工具按钮：查角色/查设定/查伏笔/扫实体/大纲/项目
- 按钮点击→调 `/api/tools/execute`→显示格式化结果
- 工具输入行支持回车执行、Esc 取消
- `chapter_generate` 返回 `frontendAction`→前端可据此弹出写作面板

**🏗️ 架构**
- `tool-registry.ts` — 重写，ToolContext 新增 `prisma` 字段支持写操作
- `/api/tools/execute` — 新建接口，承接前端工具按钮调用
- `chat/route.ts` — 工具调用循环升级，支持 frontendAction 透传

### 📐 变更清单
- 重写 1 文件（tool-registry.ts 4→21 工具）
- 新建 1 文件（/api/tools/execute）
- 修改 2 文件（chat route + AIChatBar）

## v0.20.14 — 2026-06-17

### 🧠 记忆系统闭环 + Agent 工具层

**📊 规则分类接入后处理**
- `memory-classifier.ts`：新增 `tieredMemoryToImportances()` 和 `classifyAndConvert()` —— 将规则分级的 S/A/B 事件转为 EventImportances 格式
- `post-processor.ts`：step 4.5 —— LLM 摘要存储后，自动运行基于规则的 classifyEvents
  - 合并 LLM 的事件分层 + 规则分类结果，双保险
  - SSE 事件 `classify_done` 推送分类统计
  - 失败降级不阻塞主流程

**🔮 右侧伏笔页签**
- `ForeshadowingPanel.tsx` — **[新]** 伏笔追踪面板——按状态分组（⏳埋设中/🔄部分回收/✅已回收/❌已废弃）
  - 可折叠分组，点伏笔查看详情（预计回收章号、来源、完成度）
  - 状态徽章颜色编码：黄=待处理 蓝=部分 绿=已回收 灰=废弃
- `/api/foreshadowing/list` — **[新]** GET 接口，按 projectId 返回按状态分组的伏笔列表
- `RightPanel.tsx`：新增 tab 切换——📊 实体 | 🔮 伏笔，最小化状态显示当前 tab 名

**🤖 Agent 工具层**
- `tool-registry.ts` — **[新]** 工具注册表（单例），4 个内置工具：
  - `detect_entities`：扫描正文片段中的实体引用
  - `query_characters`：按名称模糊查角色卡
  - `query_lore`：按关键词查世界书词条
  - `check_foreshadowing`：按描述匹配已有伏笔
- `orchestrator.ts`：新增 `getToolSchemas()` 和 `executeToolCall()` 方法
- `llm/client.ts`：LLMRequest 支持 `tools` 参数，LLMResponse 支持 `toolCalls` 解析，ChatMessage 支持 tool 角色
- `chat/route.ts`：工具调用循环——LLM 可主动调用工具查询角色/设定/伏笔后再作答（最多 3 轮）

### 📐 架构变更
- 无 Prisma schema 变更
- 新增 3 文件，修改 6 文件

### 🧠 记忆系统——S级伏笔强制注入，AI不再忘掉自己埋的线

**🔴 S级记忆——未回收伏笔强制注入（最高优先级）**
- `assembly/engine.ts`：新增 `buildForeshadowingSection`——从 PendingCommitment 表加载所有未回收伏笔
  - 按到期章号排序（即将到期的排最前），注入 prompt 顶部
  - 标注 ⚠️ 待回收、预计回收章号、关联角色
  - Token 预算：从短期记忆分出 5% 给 S 级记忆
- `context-loader.ts`：所有生成路由并行加载 `pendingCommitment`（最多 30 条）
- `types/index.ts`：PromptContext 新增 `pendingCommitments` 字段
- `TokenAllocation` 新增 `foreshadowing` 预算项

**📊 记忆分级引擎**
- `memory-classifier.ts` — **[新]** S/A/B 三级分类逻辑
  - S 级：未回收伏笔 + impact=major 转折点 + 核心角色状态变化
  - A 级：最近 5 章 keyEvents + 角色重叠排序
  - B 级：更早章节 1 行摘要归档
  - `formatTieredMemory()` 按 token 预算截断注入

**🔗 数据流**
- `pre-processor.ts`：buildGenerationContext 透传 pendingCommitments
- `orchestrator.ts`：buildPromptContext 接收并传入 PromptContext
- `write/refine/continue` 三路由：通过共享的 context-loader 自动获得伏笔数据

**📐 Token 预算调整**
```
systemPrompt:  8%  ─ 不变
globalMemory: 10%  ─ 不变
triggeredLore:15%  ─ 不变
foreshadowing: 5%  ─ 新增（从 shortTerm 分出）
shortTerm:    20%  ─ 从 25% 降至 20%
mediumTerm:   10%  ─ 不变
longTerm:      5%  ─ 不变
responseReserve:23% ─ 不变
```

---

## v0.20.12 — 2026-06-17

### 📊 右侧实体追踪面板 + 💬 底部 AI 对话栏

**📊 实体追踪面板（替换上下文监控）**
- `ChapterEntitiesPanel.tsx` — **[新]** 扫描当前章节正文，按类型分组显示已出现的实体
  - 6 组：角色🧑 / 势力🏛️ / 物品💎 / 地点🗺️ / 世界观🌐 / 功法⚔️
  - 每组显示颜色圆点 + 实体名 + 数量标记
  - 点击实体名 → 打开编辑弹窗（复用 CharacterEditDialog / LorebookEditDialog）
  - 未在数据库中注册的实体标记为「未注册」
  - 底部统计：已注册实体数 + 本章匹配次数
- `RightPanel.tsx`：标题从"上下文监控"→"实体追踪"，上下文监控折叠到最底部
- `entity-highlighter.ts`：抽取 `findEntitiesInText()` 共享匹配逻辑（rehype 插件 + 面板复用）
- `rehype-entity-highlight.ts`：委托共享函数替换本地实现

**💬 底部 AI 对话栏**
- `AIChatBar.tsx` — **[新]** 页面底部常驻对话输入区
  - 4 条快捷建议按钮（改对话/加描写/查逻辑/加习惯动作）
  - 选中正文区间后自动带上文发送——显示"已选中：xxx…"标签
  - AI 回复显示在输入框上方，再次发送自动替换
  - Enter 发送，Shift+Enter 换行
- `api/generate/chat/route.ts` — **[新]** 短对话 API，200 字以内回复，温度 0.7
- workspace 页面：新增 `selectedText` 状态，三栏容器 `onMouseUp` 追踪选中文本

---

## v0.20.11 — 2026-06-17

### 📝 Markdown 默认渲染 + 实体颜色高亮 + 阅读排版优化

**🎨 正文显示升级——从纯文本到富文本**
- `MarkdownViewer.tsx` — **[新]** 基于 react-markdown + remark-gfm 的正文渲染组件
  - 支持标题（h1-h3）、粗体/斜体、引用块、列表、表格、代码块、删除线、链接
  - 深色主题定制样式——h1 居中大号、引用块左侧竖线、代码块琥珀色高亮

**📐 阅读排版优化——护眼舒适**
- 正文字号从 14px → **17px**，行距从 1.6 → **1.85 倍**
- 字间距 `0.02em`，颜色从刺眼纯白 → **柔白 #e2e2e2**
- 内容区最大宽度 **700px 居中**，左右留白呼吸感
- 章节标题自动居中显示（读 `selectedNode.title`）

**🔍 实体颜色高亮——低饱和度克制点缀**
- `entity-highlighter.ts` + API 路由 + rehype 插件
- 颜色从高饱和改为暗色背景适配的**低饱和度色板**：
  - 角色 `#5B9BD5` 柔蓝 / 势力 `#70AD47` 苔绿 / 物品 `#D4A017` 暗金
  - 地点 `#C55A11` 赭石 / 世界观 `#9B59B6` 淡紫 / 功法 `#D64545` 暗红
- 正文底部实体图例（颜色方块+类型名+计数）
- hover 时 1.5px 边框 + 同色背景晕染

**📋 流式兼容**
- 流式生成期间先渲染纯 Markdown（不加实体高亮，避免部分匹配误判）
- 流式结束后实体映射异步加载 → 自动补上高亮

---

## v0.20.10 — 2026-06-17

### 🎨 文风系统接通——模板 stylePrompt 真正注入生成提示词

**🔧 核心修复——模板选了白选的历史问题**
- `sync-global-prompt.ts`：现在读 `project.llmConfig.styleTemplateId` → 加载模板 → 注入 `stylePrompt` + 禁用词 + 节奏指引 + 对话指引 到 `globalPrompt`
- `style/route.ts`：切换模板后自动调 `syncGlobalPrompt` 刷新缓存，下次生成立即生效

**📋 注入内容（四个维度的风格约束）**
- `stylePrompt`：200-300 字详细写作指令，标注为「最高优先级」
- 禁用词/句式：从 `forbiddenPatterns` 转为 prompt 指令（不再仅后处理检查，LLM 生成时就知道要避开）
- 节奏指引 `pacingGuide`：场景节奏（慢→快→爆 / 流水式 / 压抑→爆发 等）
- 对话指引 `dialogueGuide`：对话风格（角色语域 / 占比 / 打断规则）

**⚠️ 之前状态**：9 个模板预设完全写好，`applyTemplate()` 函数存在但从未被任何生成路由调用。`stylePrompt` 只在一个 debug 端点（preview-context）中展示——不影响实际生成。用户选模板只影响 temperature/topP，本质的风格约束完全落空。

---

## v0.20.9 — 2026-06-17

### 👥 人物关系独立提取 + 自动应用模式

**🆕 人物关系——简单直白的 A对B 关系提取**
- `update-cards/route.ts`：prompt 新增 `characterRelations` 输出——sourceName/targetName/relation/reason 四字段
  - 关系类型：仇恨/爱慕/盟友/敌对/师徒/主仆/同门/血亲/恩人/利用/敬仰/嫉妒/竞争/合作
  - 附带一句话原因（如"因为A被B当众羞辱"）
- `apply-updates/route.ts`：多向总结——已存在的关系→追加原因，不存在→新建
- CardUpdater 新增 👥人物关系展示区域

**⚡ 自动应用模式——不再每次弹窗确认**
- CardUpdater 新增"自动应用"复选框（localStorage 持久化）
- 勾选后：章节写完 → 全选所有提取结果 → 自动调用 apply-updates → 关闭
- 不勾选保持原流程：弹出 CardUpdater → 手动勾选 → 手动应用

---

## v0.20.8 — 2026-06-17

### 🏗️ 世界构建面板拆分——11 板块独立管理

**🖥️ WorldPanel 替换单一世界书列表**
- `components/workspace/WorldPanel.tsx` — **[新]** 11 个独立板块，每个有自己的图标/描述/字段模板/新建表单
  - 🗺️地理地图 / ⚔️势力阵营 / 💎物品列表 / ⚡力量体系 / 📜功法体系
  - 🐉生物种族 / 🎭文化风俗 / 📚历史背景 / ⚖️规则法则 / 💰货币体系 / 🔮特殊设定
- `LeftPanel.tsx` — "世界书" tab 替换为 "世界" tab，集成 WorldPanel
- 每个板块独立计数，点击切换，空板块显示引导提示

**📝 独立新建表单——每板块字段不同**
- 地理：类型/父级/描述；势力：类型/阵营/首领/领地/描述
- 物品：类型/稀有度/持有者/状态/描述；功法：类型/品阶/属性/传承方式/描述
- 力量体系：等级序列/能量来源/突破条件/描述
- 货币：材质形态/价值层级/流通范围/描述
- 数据仍存入 LorebookEntry，category 字段区分板块

**💉 Prompt 注入按板块分组**
- `engine.ts`：`buildLoreSection` 改为按 category 分组注入
- 每板块独立小标题（如"🗺️ 地理环境"），宽松自然语言格式
- 格式：`- 条目名：内容描述`，不给 LLM 结构化压力

---

## v0.20.7 — 2026-06-17

### 📌 情节脉络 + 支线故事自动提取

**🆕 章节摘要 → Storyline 自动映射**
- `update-cards/route.ts`：prompt 新增 `plotLines`（情节脉络）和 `subPlots`（支线故事）两个输出维度
  - 每条包含 title/type/progress/stage（七阶段之一）/characters
- `apply-updates/route.ts`：
  - 自动创建/更新 Storyline 记录——已有同名线→追加阶段进展，新线→创建
  - 七要素自动填充：desire/obstacle/action/result/twist/turn/ending
  - chapterBindings 自动绑定当前章节
- `CardUpdater.tsx`：新增 📌情节脉络推进 / 🌿支线故事展开 两个展示区域

### 🔧 功法体系 category 补充
- `update-cards/route.ts`：newLoreEntries 的 category 选项新增 `technique`（功法体系）

---

## v0.20.6 — 2026-06-17

### 🔗 章节摘要 → 17 模块自动映射（第一阶段）

**🐛 修复伏笔数据被丢弃的 bug**
- `apply-updates/route.ts`：`newForeshadowings` 一直被接收但从未写入数据库——现在自动创建 PendingCommitment 记录（status: "detected"），关联角色 ID + 闭环条件

**🆕 扩展 LLM 提取维度**
- `update-cards/route.ts`：prompt 新增世界观构建/故事核心/全局时间线 3 个维度
  - `worldSettings`：时代背景/核心规则/特殊元素/主要冲突/社会结构/历史背景
  - `storyCore`：主线推进/核心谜题/主题呈现
  - `globalTimeline`：本章关键事件（标题/类型/重要性/参与角色）
- 新增字段全部加入 JSON schema 和 API 返回

**🆕 扩展数据写入路径**
- `apply-updates/route.ts`：
  - `worldSettings` → Project.description（追加合并）
  - `storyCore` → Project.synopsis（追加合并）
  - `globalTimeline` → StoryBeat 表（按事件逐条创建）

**🖥️ CardUpdater 面板扩展**
- 新增 3 个展示区域：🌐世界观设定 / 📖故事核心 / ⏱️全局时间线
- 用户确认后一键写入全部模块

---

## v0.20.5 — 2026-06-17

### 📡 前端 SSE 事件补全——蒸馏结果实时可见

**🖥️ 生成过程中实时展示本地蒸馏结果**
- `workspace/[projectId]/page.tsx`：`streamSSE` 新增 6 种事件处理——`distill_local_start/done`、`foreshadow_update`、`entity_auto_created/skip/error`
- `components/workspace/types.ts`：`SSEEvent` 类型扩展——`stats`/`stateChanges`/`foreshadowEvents`/`newEntities`/`created`/`updated`
- 绿色蒸馏完成通知横幅——生成完成后自动弹出，显示实体数/状态变化/伏笔信号/自动创建数
- 通知优先级：蒸馏通知 → AI深度分析通知 → CardUpdater 对话框，不堆叠
- 蒸馏累计数据在每次生成开始时自动重置

---

## v0.20.4 — 2026-06-17

### ♻️ 数据反哺——新实体自动入库

**🆕 蒸馏发现的实体不再只是展示，直接写入数据库**
- `src/lib/entity-auto-creator.ts` — 新实体自动创建器：
  - 角色 → CharacterCard（role: "supporting"，标记 🆕自动发现）
  - 地点 → LorebookEntry（category: "geography"）
  - 丹药/法宝/材料 → LorebookEntry（category: "item"）
  - 功法 → LorebookEntry（category: "technique"）
- 查重：大小写不敏感对比已有角色名 + 世界书标题，避免重复创建
- 新增 SSE 事件：`entity_auto_create_start` / `entity_auto_created` / `entity_auto_skip` / `entity_auto_create_error`
- 实体创建失败降级——单个实体失败不阻塞其他实体和后续流程

---

## v0.20.3 — 2026-06-17

### 🔮 伏笔自动检测——本地蒸馏驱动五状态机

**🆕 蒸馏发现的伏笔信号自动入库**
- `src/core/pipeline/post-processor.ts` — 本地蒸馏完成后自动处理伏笔事件：
  - 埋设信号（"他并不知道""冥冥之中"等 20 个）→ 自动创建 PendingCommitment（status: "detected"）
  - 回收信号（"原来""恍然大悟"等 13 个）→ 匹配已有伏笔 → 标记为 fulfilled
  - 深化信号（"再次出现""越来越"等 7 个）→ 匹配已有伏笔 → 标记为 partially_fulfilled
- 去重机制：同一信号词每章只处理一次，取置信度最高者
- 新增 SSE 事件：`foreshadow_update` / `foreshadow_update_error`
- 伏笔处理失败不阻塞主流程——单个伏笔异常不影响其他伏笔和后续 LLM summarize

### 🔧 默认模型修正
- `settings/page.tsx`：DeepSeek 默认模型 `deepseek-v4-pro` → `deepseek-v4-flash`（匹配当前 CodeX/CCX 配置）

---

## v0.20.2 — 2026-06-17

### 🧪 本地蒸馏引擎——实体检测不再烧 Token

**🆕 命名模式库 + 四遍扫描（双轨并行）**
- `src/lib/entity-detector.ts` — 命名模式库：5 类正则（丹药/法宝/功法/地点/材料）+ 排除词库 + 归属推断三层策略（属格 0.95 / 动词前置 0.85 / 段落主人 0.6）
- `src/lib/distillation-runner.ts` — 四遍本地扫描：实体识别 → 状态变化检测 → 伏笔模式匹配 → 一致性校验。零 Token 消耗，<1 秒/万字
- `src/core/pipeline/post-processor.ts` — Step 3（保存）和 Step 4（LLM 摘要）之间插入本地蒸馏。结果通过 SSE `distill_local_done` 推送前端
- 新增 SSE 事件：`distill_local_start` / `distill_local_done` / `distill_local_error`
- LLM summarize 继续运行不受影响——双轨并行，积累对比数据后再决定切换

### 🌐 全局默认模型切换
- 默认提供商：硅基流动 → **DeepSeek 官方**（`api.deepseek.com`）
- 默认模型：`deepseek-ai/DeepSeek-V4-Flash` → **`deepseek-v4-pro`**
- 修复 `outline/route.ts` 和 `characters/expand/route.ts` 中硬编码的硅基流动 URL，统一走全局设置

---

## v0.20.1 — 2026-06-17

### 🔑 API Key 动态透传——全局设置全面生效

**🐛 修复 401 "Invalid token"**
- `parser.ts`（parseSettings / parseLorebookOnly / parseStyleOnly）：fallback 从 `getDefaultClient()`（读 env vars，`.env` 无 `LLM_API_KEY` → 空 token → 401）改为 `getEffectiveConfig()` + `createLLMClient()`（从数据库 AppSettings 动态读取）
- `update-cards/route.ts`（章节变化检测）：同样从 `getDefaultLLMConfig()` + `getDefaultClient()` 改为 `getEffectiveConfig()` + `createLLMClient()`
- 至此全部 LLM 调用路径统一走数据库全局设置，用户在设置页改 Key/模型即时生效

---

## v0.20.0 — 2026-06-17

### ✍️ 写作质量闭环——禁用词v2.0 + 审校9维 + 管线全覆盖

**🔍 禁用词检查器 v2.0**
- 正则表达式支持：`/pattern/flags` 格式自动识别，强制 `g` 标志防死循环
- 三级严重度：error（必须修改）/ warning（建议修改）/ info（仅提示）
- 替换建议：每个禁用词可附带推荐替代词
- 无效正则自动降级为精确匹配，不静默丢弃

**📋 审校维度扩展（5→9维）**
- 新增：节奏问题（pacing）、对话质量（dialogue_quality）、描写密度（description_density）、情绪一致性（emotion_consistency）
- 审校 Prompt 从 5 个检查维度扩展到 9 个，覆盖叙事节奏/对话机械感/描写密度/情绪跳跃
- `ReviewIssueType` 联合类型同步扩展

**🔗 refine 路由接入管线**
- refine 路由不再内联扫描+存储，改用 `runPostGenerationPipeline({ skipReview: true, skipSummarize: true })`
- 消除最后一处后处理代码重复

**🐛 诊断修复（code-review 7代理审查）**
- 修复：`allNodes` 过滤 `content: not null` 导致新节点 previousNodes 全错
- 修复：审校/摘要用原始角色列表而非用户确认的角色集
- 修复：`prepareAuthorNote` 收到原始角色列表，新角色备注丢失
- 修复：审校步骤缺 try-catch，LLM 超时会崩掉整个请求
- 修复：authorNote 含 rules 文本在 systemPrompt 和 writingInstruction 中双重注入
- 修复：continue 路由 done 事件缺 status 字段
- 修复：正则无 `g` 标志时 exec 死循环（进程挂起）

---

## v0.19.1 — 2026-06-17

### 🏗 架构重构——生成管线抽取，消除 60% 路由重复代码

**📦 新增 `src/core/pipeline/` 共享管线模块**
- `context-loader.ts` — `loadGenerationContext()` 统一7表数据加载（原 write/refine/continue 各写一遍）
- `pre-processor.ts` — 角色自建/过滤/备注/规则注入/LLM配置提取/上下文构建 六合一
- `post-processor.ts` — `runPostGenerationPipeline()` 扫描→审校→存储→摘要 完整后处理链
- `types.ts` — 管线共享类型定义

**✂️ 路由精简**
- `write/route.ts`：424行 → ~170行
- `refine/route.ts`：277行 → ~140行
- `continue/route.ts`：420行 → ~190行
- 三个路由的重复代码从 ~350行 降至 ~0

**🔧 附带修复**
- write 和 continue 路由的 `summarizeChapter` 现在正确传入 `chapterOrder` 和 `existingSummariesCount`
- 摘要存储统一包含 `eventImportances` 四级事件分层
- StoryBeat 的 `impact` 字段根据 `impactScore >= 7` 动态判断 major/minor

---

## v0.19.0 — 2026-06-17

### 🧠 蒸馏系统上线——四级事件分层 + 伏笔追踪基础

**📊 S/A/B/C 四级事件评分引擎**
- 新增 `src/core/distillation/scorer.ts`：时效性×事件类型×伏笔关联×角色重要性 四因子评分
- 自动推断事件类型（突破/死亡/传承/转折/揭露/战斗/日常 8 种）
- S层(≥40分)完整注入、A层(≥20分)压缩注入、B层(≥10分)关键词索引、C层不注入仅存档
- 新增 `formatEventsForPrompt()` 格式化 [S-N]/[A-N] 标签注入

**📦 数据库扩展**
- `ChapterSummary` 新增 `eventImportances` JSON 字段
- 新增 `PendingCommitment` 模型（五状态机：pending→detected→partially_fulfilled→fulfilled/voided）
- 支持 closure_conditions 闭环条件数组 + status_history 完整审计链

**🔄 上下文组装升级**
- `buildMediumTermSection` 读取四级事件分层，差异化注入短期/中期记忆
- `summarizeChapter` 生成后自动评分分层
- summarize API 存储 closingSnapshot/characterImpulses/eventImportances

---

### 🌐 项目化——多模型支持 + 全局设置 + 代码清理

**🌐 多提供商 LLM 层**
- `src/lib/llm.ts` 重写：支持 OpenAI / 硅基流动 / DeepSeek 官方 / Groq / 自定义 OpenAI 兼容
- 配置优先级：数据库 AppSettings > 环境变量 LLM_API_KEY，向后兼容
- 60 秒内存缓存、`testLLMConnection()` 连接验证、`clearLLMCache()` 即时刷新

**⚙️ 全局设置系统**
- Prisma 新增 `AppSettings` 单例模型（llmProvider / llmApiKey / llmModel / llmBaseUrl）
- `GET/PUT /api/settings` + `POST /api/settings/test` 三个端点
- 设置页面 `/settings`：选提供商→填 Key→测试连接→保存，暗色 UI

**🏗 代码清理**
- LLM 调用统一：7 个路由删除本地 callFlash，净减 ~70 行、21 个冗余常量
- 删除 3 个死函数（povLabel/ndLabel/pct）+ 重复注释
- 4 个组件加 AbortController 竞态防护（page.tsx/RulesPanel/StorylineList/PreGenConfirm）
- README.md 完整替换为项目文档

---

## v0.17.0 — 2026-06-14

### 📏 规则中心 + 🧠 记忆压缩 + 🐛 Bug修复

**📏 规则中心——统一创作规则管理**
- Prisma 新增 Rule 模型：name/content/category(enabled/priority/scope) —— 9 字段
- CRUD API 完整：GET/POST /api/rules + GET/PUT/DELETE /api/rules/[id]
- 核心工具函数 `getActiveRules()` + `injectRules()` —— 一处定义，全局注入
- 规则注入 6 大 AI 路由：write/continue/refine/chapter-outline/outline/draw
- 规则按 category 编组后注入 authorNote，以「⚠️ 创作规则——铁律」最高优先级块呈现
- scope 分级：all(全局) / write_only(正文生成) / outline_only(大纲章纲) / review_only(审校)
- 前端 RulesPanel 组件 —— LeftPanel 新增「规则」Tab（第 5 个 Tab）
- 规则创建/编辑/删除/启用禁用的完整交互

**🧠 记忆压缩 MVP——告别「只看最近 3 章」**
- `summarizeChapter` 增强输出：impactScore(1-10)、threadProgress(故事线进度)、unresolvedQuestions(悬念列表)
- StoryBeat 不再硬编码 'minor'——impactScore≥7 自动标 major，影响排序优先注入
- `buildMediumTermSection`：固定取 3 章 → 角色重叠评分检索（Top-8 最相关 + 最后一章保底）
- 新增 `buildArcSection`：角色弧光追踪区块——有 arcProgress 的角色自动注入当前状态
- 新增 `buildStorylineSection`：活跃故事线当前状态——按七要素链展示每条线进度
- `assemblePrompt` 从 7 区块扩展到 9 区块——弧光 + 故事线实时追上
- TokenAllocation 新增 arcMemory + storylineMemory 预算分配

**🐛 代码质量——审查修复 6 个 Bug**
- page.tsx handleDrawSelect / onEditOutline：fire-and-forget fetch → await + try/catch
- ContextPreview.tsx / StyleEditor.tsx：useEffect 无 AbortController → 加全流程竞态防护
- DrawCards.tsx：3 重竞态防护（过期请求检查、AbortError 跳过、finally 只关当前 loading）
- DrawCards API route：personality 字段从提取未使用 → 正确拼入角色简介

**🛡 工程质量**
- 新建 `novel-forge-diagnostic` 专属诊断 skill——六维自检（TS/Prisma/React/API/质量/服务）
- TypeScript 零错误 · Prisma Rule 表 + db push · client regenerate

---

## v0.16.0 — 2026-06-14

### 🎴 抽卡模式 + 🏗️ 架构大重构 + 📖 故事线系统

**🔍 跨章逻辑评估增强**
- 现有审校体系增强——写/续写时自动检测跨章矛盾
- reviewContent 接收前3章摘要+角色状态快照+关键事件做真实跨章对比
- 新增 `cross_chapter_contradiction` 审校类型
- 审校 prompt 新增跨章铁律：角色生死/关系/事件必须与前文一致
- 零新建——不改路由、不新建组件、纯增强现有流程

**🎴 抽卡模式（模式C）**
- API：POST /api/generate/chapter-outline/draw——并行 3-5 次 Flash 调用
- 每条路线用不同 temperature（0.3~1.0）产出异构章纲
- 卡片含：章纲全文 / 核心冲突 / 情绪基调 / 伏笔方向 / 出场角色 / 选角标签
- 前端 DrawCards 组件——卡片网格布局，点击选中→采用写入节点大纲
- 支持「重抽」换一批路线，支持 3/4/5 张选择
- CenterPanel 新增「🎴抽卡」按钮

**🏗️ 前端拆分**
- 工作台主文件从 3652 行拆分为 14 个独立组件模块，精简 83%
- 四面板（Toolbar / LeftPanel / CenterPanel / RightPanel）独立化
- 6 弹窗 + OutlineTree + ReviewPanel 全部分拆到 `src/components/workspace/`
- 主 page.tsx 变为 ~600 行的纯状态管理 + 布局编排器

**📖 故事线系统（Storyline）——阶段二启动**
- Prisma 新增 Storyline 模型：type（主线/支线）+ 完整七要素字段
- 七要素：欲望 → 阻碍 → 行动 → 结果 → 意外 → 转折 → 结局
- chapterBindings JSON——七要素绑定具体章节
- CRUD API 完整：GET/POST /api/storylines + GET/PUT/DELETE /api/storylines/[id]
- AI 自动生成：POST /api/storylines/generate——V4 Pro 读总纲+角色→拆分主线+支线+填七要素
- 前端 StorylineList：展开查看七要素详情、编辑弹窗、AI 生成按钮
- LeftPanel 新增「故事线」Tab——大纲/故事线/角色/世界书 四 Tab 切换

---

## v0.15.8 — 2026-06-14

### 🤖 章纲 AI 自主选角

**两阶段生成**
- Step 1: AI 读取前 5 章大纲 + 上一章结尾 800 字 + 作者指令 → 自主决定本章出场角色
- Step 2: 只用选定角色的完整档案 → 生成详细章纲
- 作者指令作为最高优先级注入两个阶段
- 空闲角色不再塞入——AI 根据剧情逻辑选角，不写"等"来糊弄
- 结果展示选角列表 + 选角理由

**上下文增强**
- 前文：3 章 → 5 章，正文末段：300 字 → 800 字
- 新增后文伏笔读取

### ⚡ 系统提示词预缓存

- 三卡编译到 `Project.globalPrompt`，卡变动 <1 秒自动刷新
- 9 个同步钩子覆盖全部 CRUD + 导入/扩展/整理
- `buildPromptContext` 和 `chapter-outline` 有缓存时跳过 3 个 DB 查询

### 🔧 其他

- 去重四层：自去重 + 跨聚类 + 与已有 + 全局
- 范围选择器：`1-50`、`1,3,5-10`
- SSE 预览缓存：`previewId` 替代大数据传输

---

## v0.15.7 — 2026-06-13

### 🛡️ 信息零丢失架构 —— 输入估算 + 拆分 + 覆盖校验

**max_tokens 分级**
- Phase 1 聚类: 4096（输出仅 JSON，够用）
- Phase 2 整理: 16384~32768（按输入量自适应——输入超 5 万 tokens 自动升级到 32768）

**输入 token 估算 + 超大聚类拆分**
- 中文按 1.5 tokens/字估算，超 4 万 tokens 自动拆分
- 每批独立调用 Flash，批间标题去重，多批结果合并去重
- 输出截断检测——检查 `finish_reason === "length"`

**专有名词覆盖校验**
- 整理后自动提取原文专有名词（书名号/引号/括号内容）
- 比对输出，逐 cluster 报告缺失列表
- 前端确认面板实时展示——缺失标红

**确认面板**
- 展示：来源词条 → 新词条标题+摘要+关键词 + 拆分标记 + 覆盖警告
- 确认后调 apply 接口原子写入

**Phase 2 铁律**
- 禁止用"等"省略、禁止概括数字、禁止合并分歧来源、禁止删专有名词
- maxDuration 60→120s（分批处理）

---

## v0.15.6 — 2026-06-13

### 📋 章纲生成全面升级 —— 严格基于角色档案+风格设定

**角色信息**
- 从一行摘要 `[名字] 定位 性格词` → 完整档案：性格五维 + 背景300字 + 能力 + 关系 + 说话风格

**文风注入**
- 新增 styleCard 加载——文风描述/视角/句长/对话比/语气标记全传入

**Prompt 重写**
- 6条铁律：行为匹配性格五维、关系一致、不违背核心驱动、文风匹配、不凭空造角色、世界观铁律
- 章纲结构：核心冲突→情感基调→场景序列→关键对话点子→衔接钩子

**参数优化**
- temperature: 0.7 → 0.4，max_tokens: 2048 → 4096
- 前后文：2章 → 3章，正文取末段300字代替取前200字

---

## v0.15.5 — 2026-06-13

### 🆕 缺失角色自动发现 + 人物卡提示词全面升级

**缺失角色自动建卡**
- AI 审计新增第三项任务——扫描 background 中所有人物名
- 比对全项目已有角色卡，新人物自动建卡
- 去重保护，进度报告

**人物卡提取全面升级**
- parser.ts: personality 从 `["词"]` → `{dominant, drive, contradiction, habits, socialMask}` 五维
- background: "简述" → "复述原文全部细节，至少100字"
- 新增 abilities / timeline / dialogueStyle 等丰富字段
- import/parse: 全字段禁止"未知"，必须从原文提取或推断

**JSON 解析器**
- 第 2.5 层：多 JSON 对象粘连自动拆分

**限制解除**
- expand MAX_TOKENS: 16384 → 32768

---

## v0.15.4 — 2026-06-13

### 🧹 角色扩展预处理管线 + JSON 解析器修复

**扩展前预处理（四步管线）**
- AI 批量审计——一次 Flash 调用检查全部卡：是否真人 / 是否组合卡
- 拆组合卡——"张三、李四"→每人独立建卡，已有同名则合并信息不重复
- 删非角色——地名/物品/势力/概念混入角色列表的自动检测并删除
- 智能合并增强——去括号匹配，信息更丰富的卡优先保留，重复卡删除
- 全流程 SSE 进度推送

**JSON 解析器修复**
- `sanitizeUnescapedQuotes` 不再空转——字符串内未转义引号自动检测并转义
- 中文对话引号场景自动修复
- 接入解析管线第5/6/7层
- 错误消息扩展到 300 字 + JSON.parse 原始错误

---

## v0.15.3 — 2026-06-13

### ☁️ 全链路硅基流动 —— 16路由统一迁移 + 模型名修正

**API 迁移**
- `getDefaultLLMConfig()` → 硅基流动（连锁修复 detect-entities / update-style-card / settings/parser 等 5 场景）
- chapter-outline（章纲）/ outline（大纲）/ classify（角色分类）→ 硅基流动
- check-all-cards / import/commit / import/parse → 硅基流动
- lorebook/import / lorebook/summarize / characters/expand → 硅基流动
- 全部 `DEEPSEEK_API_KEY` → `LLM_API_KEY`，统一密钥管理

**模型名修正**
- 硅基流动实际支持的模型名：`deepseek-ai/DeepSeek-V4-Pro`、`deepseek-ai/DeepSeek-V4-Flash`
- 之前使用的 `deepseek-v4-pro` / `deepseek-v4-flash` 在硅基流动上不存在（400 code 20012）
- 16个文件批量替换，TypeScript 0 错误编译通过

**修复**
- 章纲生成 API 400 —— 模型名不存在
- 章纲生成 API 401 —— 用了失效的 DeepSeek 官方 key
- 大纲/分类/导入/世界书 全部存在同样的硬编码问题，一并根除

---

## v0.15.0 — 2026-06-12

### 🃏 导入设定一键出三卡——分界精确、无上限提取

**核心：三卡分界标准建立**
- `src/core/settings/parser.ts` 新增 `THREE_CARD_BOUNDARIES` —— 整个项目三卡提取的唯一权威规则源
- 角色卡：有名字的个体人物（外貌/性格/背景/能力/关系/对话风格/隐藏动机/时间线）
- 世界卡：非人物概念（地理/势力/力量体系/历史/文化/生物/器物/自定义），含触发关键词
- 风格卡：写作风格特征（视角/叙事距离/句式/比例/语气标记/词汇特征/文风描述/样本段落）
- 每张卡明确排除不属于它的内容——杜绝AI把地名写进角色卡、把文风写进世界卡

**SettingsImporter 补全三卡**
- `POST /api/parse-settings` 新增 StyleCard 创建（删除旧卡→建新卡，一个项目保留最新一张）
- 三卡并行写入：角色卡 + 世界书 + 风格卡一个 `Promise.all` 搞定
- 前端显示风格卡创建结果（粉色高亮）

**ImportWizard 统一三卡标准**
- `POST /api/import/parse` B 路 prompt 引用 `THREE_CARD_BOUNDARIES`，与 parser.ts 一致
- 分块模式下不再跳过世界+风格提取——改用文本前16000字独立调用
- maxTokens 全面提升：A路 12000/16000→16384，B路 8000→16384

**类型系统**
- 新增 `StyleProfile` 接口（对应 StyleCard 全部字段）
- `ParsedSettings` 新增 `styleProfile?: StyleProfile`
- 新增 `toStyleCardCreateParams()` 辅助函数
- `src/core/settings/index.ts` 导出全量更新

---

## v0.14.0 — 2026-06-12

### 🎨 文风系统重做——模板真正生效

**修复严重漏洞：模板的 stylePrompt 从未注入 LLM**
- `write` / `continue` / `refine` 三条路由现在统一注入模板的 stylePrompt、forbiddenPatterns、pacingGuide、dialogueGuide
- 模板的 temperature/topP 覆盖默认值，传递给 LLM API
- 选了模板不再等于没选

**新增：情欲古风模板**（`adult_romance`）
- 半文半白古风白话 · 直白情色描写 · 感官优先级（触觉→听觉→视觉→嗅觉→味觉）
- 6 种角色语域（仙子雅语 / 老汉粗俗 / 妩媚娇憨 等）
- 39 条禁用词（连接词 / 元叙事 / 学术腔 / 身体模板 / AI 通用禁用）
- Show Don't Tell 心理直嵌 · 变速齿轮节奏 · 对话毛边对抗

**新增：生成后禁用词扫描器**
- `src/lib/forbidden-checker.ts`：正文生成后逐字扫描，违规项通过 SSE 返回前端
- 全部 3 条生成路由均已接入（write/continue/refine）
- ContextPreview 面板实时显示模板注入状态和禁用词是否生效

**新增：风格卡自动更新**
- `POST /api/generate/update-style-card`：分析最新章节 → 更新 StyleCard 量化参数
- 句长、对话比、动作比、语气标记随写作演进而自动演进

### 🔬 三卡系统大修——无上限 + 一键检查

**实体检测 v2**（`detect-entities`）
- 分块扫描：文本自动分块（12K/块），不再硬截断 8000 字
- maxTokens 4096→16384，AI 输出不截断
- 新增第三维：大纲偏离检测（OOC/情节偏离/节奏/视角）

**角色扩展 v2**（`expand`）
- 模型 `deepseek-chat`→`deepseek-v4-flash`
- 去源文本截断（原 8000→20000+完整输入）
- maxTokens 8000→16384
- 并发 8→16，137 角色约 5 分钟完成（原 15 分钟+）

**分类优化**（`classify`）
- 超时 60s→120s
- 世界书上限 50→200 条

**新增：一键三卡检查**（`POST /api/generate/check-all-cards`）
- SSE 流式：实体检测 + 分类状态 + 大纲一致性 三路并行
- 返回完整报告：新角色/新词条/未分类/信息不完整/大纲偏离

**写前确认增强**（`pre-write-cards`）
- 新增世界卡完整性检查（缺失类型提示）

**模型统一**
- 全部分析类 API → `deepseek-v4-flash`

### 🛡️ 作者指令清理
- 作者指令不再默认填充，留空给用户自己写
- 世界规则迁移到世界卡（Lorebook），通过关键词触发自动注入

### 🔧 架构审计修复
- 修复 `closingSnapshot`/`impulses` 数据流因类型错位完全丢失的 bug
- 修复草稿保存竞态 — 加防重叠锁，吞错改记日志
- 修复 `apply-tags` 完全缺失 try/catch + 加项目归属校验
- 修复 `lorebook/summarize` 删除/创建非原子 — 包 `$transaction`
- 修复 `insertionOrder: 0` 被 `||` 误当 falsy
- 修复 `classify` 模块级 API_KEY 常量
- `CharacterCard` 类型补全 `timeline`/`abilities`/`TimelineEvent`
- 新建共享 `json-parser.ts` — 消灭 10+ 处重复 JSON 修复

---

## v0.9.1 — 2026-06-09

### 🔄 AI 分析本章变化 · 更新三卡——修复 + 增强

**修复**
- 手动点击「AI分析本章变化」按钮时，如果节点已有正文但本次会话未生成，不再报错——改为优先取节点已保存内容
- 正文内容不足 50 字时显示明确提示，不发请求
- API 返回具体错误信息（不再泛泛 400）

**新增：内联编辑**
- 每条检测到的变化旁有 ✏️ 按钮，点击可在弹窗内直接编辑 AI 建议的内容
- 纯文本直接改，数组/对象自动转 JSON 格式编辑
- 编辑过的条目标记「已编辑」

**新增：重要性过滤**
- AI 现在标记每条变化的 significance（high/medium/low）
- low 级变化默认不勾选，减少噪音
- 重要变化显示红色「重要」标签

**新增：三卡写入格式对齐**
- 角色更新标记章节来源（`第N章` 前缀），后续章节可追溯变化轨迹
- 新关系自动匹配已有角色 ID
- 性格信念转变兼容结构化（dominant/drive/contradiction）和旧格式
- 世界观词条自动去重，同名条目不重复创建
- 新增「性格信念转变」「获得重要物品/身份」检测

**分析质量提升**
- 分析上限 8000 → 10000 字
- Prompt 优化：明确要求不输出 markdown 代码块、只输出 high/medium 级变化
- 新伏笔检测后显示建议回收方式和关联角色

---

## v0.7.0 — 2026-06-07

### ⚡ 角色扩展（AI Expand）大幅加速
- **流式生成**：从干等 20 秒 → 3 秒开始出角色，逐角色推送进度
- **批量翻倍**：每批 4 个 → 8 个，100 角色从 25 批减到 13 批
- **Prompt 重写**：框架式模板 + 4 条铁律，输入缩 40%，生成更快更准
  - 禁止"无""未知""暂无"——缺信息按地位推敲
  - 同类型角色外貌性格必须可区分——俩长老不能长一样
  - 能力按地位推导：掌门 > 长老 > 执事 > 弟子
  - 输出纯 JSON

### 🗄️ Commit 查重优化
- 角色查重：复用已加载数据，0 次额外 DB 查询（旧：100 角色 = 100 次 findFirst）
- 词条查重：1 次批量 findMany 替代逐个查询
- 100 角色 + 100 词条：DB 查询从 200 次 → 1 次

---

## v0.6.1 — 2026-06-07

### 📊 解析进度可视化
- 流式检测中实时显示角色名计数（`~N 角色名`）
- 去重合并阶段逐角色推送——每发现一个新角色就发射 `char-found` 事件
- 前端实时显示已发现角色数和词条数

### 🔧 修复
- commit + expand 加 `maxDuration=300`，防止部署平台 60s 超时掐断
- commit 完成消息角色数双倍计数修复
- parse 注释更新为实际架构描述

---

## v0.6.0 — 2026-06-07

### 🐛 最后小块修复
- `smartChunk` 短尾块（<200 字）自动合并到前一块，不再丢弃
- 十万字文本的最后一段不会凭空消失

---

## v0.5.0 — 2026-06（更早）

### ✨ 功能
- 分块并行解析：Smart chunk by paragraph（≤6000 字/块），N 路 Flash 并行 + JS 去重
- Commit 分批并行：每批 4 个，SSE 进度
- AI Expand：选中角色卡一键批量扩展，globalPrompt 缓存世界书+风格卡
- 人物时间线：timeline 字段防 OOC
- 批量导入确认：可选确认/移除/一键删除/分批提交

### 📱 部署
- PWA manifest + Service Worker

### 🔧 后端
- DeepSeek V4 Flash：所有提取/合并/扩展任务
- DeepSeek V4 Pro：创意写作（generate 系列）
- 全链路 SSE 流式进度
- 无超时限制
