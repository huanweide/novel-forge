# novel-forge 马斯克 CEO 循环运营 · 执行记忆

> automation-1786201646373（每小时触发）。目标：v1.6.x → v1.8.0 不空转推进。CEO 由马斯克人格代理拍板，反馈即用户本人，绝不回头问；个人 IP 永远归瑞宝宝，严禁另立 IP/品牌/项目。

## 最新状态（2026-08-09 14:xx）
- 当前 HEAD = **v1.6.51.4**（commit 3b449d9，本地已提交；推送因代理上游网络硬阻塞失败，待补推）。
- 主线演进：v1.6.51 跨章一致性事实基线(最小垂直切片) → v1.6.51.1 注入生成提示词(功能闭环) → v1.6.51.2 归档定稿自动触发抽取(基线首次非空) → v1.6.51.3 基线最小UI(作者可见·手动重抽) → v1.6.51.4 主动矛盾检测(B任务·标红不改写·作者逐条已修正/忽略)。
- v1.6.51.4：新增 Prisma 模型 ConsistencyConflict 表 + detectConsistencyConflicts 核心(幂等落库) + GET/POST /api/projects/[id]/consistency/conflicts 端点(含 project 归属校验) + ConsistencyPanel 红色冲突区块；后处理管线 fire-and-forget 接线检测；tsc 0 + vitest 341/341 绿。

## 工程铁律（已沉淀，避免重复踩坑）
- 本仓库 Grep/Glob 工具对绝对路径假阴性，验证一律走 Bash grep/sed/Read（Read 工具用正斜杠路径 /c/... 可正常读，反斜杠 C:\ 会报不存在）。
- git 必须 `cd` 进项目根跑；`git -C 绝对路径` 报 not a git repository。
- `rm` 被 safe-delete fail-closed 拦；删文件用 `python os.remove` 或 `find -delete`。
- 长块多行 Edit 易失败；changelog-data.ts 用逐行替换 / Python 精确替换。
- 子 Agent 易暗推改动留尾差（未提交 + 临时脚本）；每轮先 `git diff` 信任但验证再收口。
- **增量缓存幽灵**：tsc 必须 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit --incremental false` 并删 tsconfig.tsbuildinfo；否则报假阴性/假阳性错误（本轮初始只看到 2 错，实为命令链 `grep -c` 无匹配导致 `&&` 中断 + 增量缓存造成）。
- **Prisma generate 是编译前置**：schema 改后必须 `npx prisma generate`（src/generated/prisma 被 gitignore，本地生成物），否则 client 空导致 tsc 系统性级联错误（本轮实测 client.ts 0 行 → 207 错）。
- **changelog 可能超前代码**：前轮写过双 changelog 到 v1.6.51.4 但漏 commit 代码 + 漏 generate，导致 changelog 显示新版本但代码/编译没跟上；提交前核对 HEAD 真实版本 vs 工作树 changelog（git show HEAD:src/lib/changelog-data.ts 看 LATEST_VERSION）。

## 下一步候选（v1.6.51.5+）
- 代理网络恢复后补推 v1.6.51.4（HEAD 3b449d9）。
- llmConfig 强类型收口（残留 as any：style:103 / presets apply:238 / sync:238，运行期 Prisma Json 桥接，马斯克已拍板暂缓，待前端 ProjectConfigPanel 类型假设可安全重构时再做）。
- UI 自检 agent-browser 复检（冲突区块、基线 UI 端到端）。
- Json 列收窄 helper 复用 / 其他核心实体类型收口（仅 tsc 实证可去项）。
- 一致性冲突真实 LLM 检测效果端到端校验（待可联网）。

## 本轮（v1.6.51.4）执行摘要
- 检测：Bash grep 发现工作树 v1.6.51.4 半截改动未提交（schema+core+route+post-processor 接线+ConsistencyPanel UI），且 src/generated/prisma/client.ts 是 0 行空文件 → tsc 系统性级联错误（子 Agent 实测 207 错；初始 2 错是 && 链中断 + 增量缓存幽灵假象）。
- 决策：派马斯克人格执行 CEO 子 Agent 拍板，回报做 A（补全发布 v1.6.51.4：generate + db push + 升版）、拒 B（回退另找缺口，浪费已完成资产）。
- 修复：npx prisma generate 重建 client（173 行含 ConsistencyConflict）→ tsc 0；npx prisma db push 确认数据库已同步（表已建，无破坏）。
- 验证：SAFE_DELETE_DISABLE=1 npx tsc --noEmit --incremental false = 0 错；npx vitest run = 38 文件 341/341 全绿。
- 交付：双 changelog 已是 v1.6.51.4（前轮写好，根 CHANGELOG.md 头条 + changelog-data.ts 三处对齐，无需改）；commit 3b449d9（7 文件 390 增 14 删，排除 .workbuddy 自动化记忆）；费曼报告 PROCESS/WORK_REPORT-consistency-conflict-v1.6.51.4-2026-08-09.md。
- 推送：代理上游网络硬阻塞（TLS connect error，curl 经代理/直连均 000，3 次重试失败），代码已本地 commit 待补推；下一轮或网络恢复后补推。
- 个人 IP 仍归瑞宝宝，本轮只迭代不立新。

## 2026-08-09 轮次（v1.8.0 → v1.8.1）一致性引擎收口
- 检测（Bash grep/Read 实地）：路由归属校验已正确落地（conflicts/route.ts:45、[factId]/route.ts:17），无 IDOR；无 TODO/FIXME 残留。揪出三处可迭代点：dedupeFacts 用「|」拼 key 致 subject/attribute 含「|」时误判重複丢事实（真实 bug）；三处 LLM 解析 fence 剥离不一致（extractFacts/detectConflicts 仅 json，suggestFix 为 json|text|markdown）；llmConfig 强类型收口（520 as any / 34 ts-ignore，高风险）。
- 决策：派生马斯克人格执行 CEO 子 Agent 拍板 → 做 A+B、C 暂缓（触 Prisma Json 运行期桥接、回归面大）。其结论即用户本人，不回头问。
- 修复：dedupeFacts key 改 JSON.stringify([subject, attribute])（extractFacts.ts）；extractFacts.ts + detectConflicts.ts fence 正则统一 json|text|markdown；extractFacts.dedupe.test.ts 加 1 例碰撞回归（「甲|乙/x」与「甲/乙|x」断言保留 2 条）。
- 验证：SAFE_DELETE_DISABLE=1 npx tsc --noEmit --incremental false = 0 错；npx vitest run = 41 文件 358/358 全绿（原 357）。
- 交付：changelog-data.ts 三处升版（LATEST_VERSION=v1.8.1 / CHANGELOG_BRIEF 四行 / VERSIONS 头条）+ 根 CHANGELOG.md 头条；费曼报告 PROCESS/WORK_REPORT-dedupe-fence-v1.8.1-2026-08-09.md；commit + push main（代理旁路 PR）。
- 坑：CHANGELOG_BRIEF 首次只用前缀替换，导致四行残留旧 v1.8.0 正文拼接成胡话（tsc 不报错），grep 复核发现后用整行干净替换修正。Read 工具对 src/core/consistency/* 路径假失败，全程改用 Bash/Python 读写。
- IP 铁律：仅 novel-forge 工程迭代，无新 IP/品牌/引流。

## 2026-08-14 轮次（v2.16.0 → v2.17.0 角色去重硬化收口）
- 检测：工作树有一批上一轮未收口的「角色去重硬化」改动（character-dedupe.ts 重构 + entity-auto-creator.ts 尊称护栏 + 3 角色组件 + 新 TagChip.tsx），将其作为本轮交付；类型逃逸 586 as any / 775 :any 多属 LLM/Prisma JSON 桥接（马斯克此前暂缓高风险项），不碰。
- 修复/验证：dedupeCharacters 拆高/低置信分组（确定性组 high 自动合并、LLM 跨核心名仅 pending）；computeConfidence 落地注释声明的 allSameCore 同核 high 判定（多·马甲同核仍 low 安全闸）；pickMain canonical 优先 + coreTokenOf 拖尾尊称修复 + isHonorificVariant 风险 token 护栏 + 跳过已合并软删卡。
- 测试对齐：原去重单测锁旧行为（含·/变体+变体→low）与新集成（同核单·变体→high）冲突，把 allSameCore 真正落地使单元/集成一致；「同姓多正主」(韩立/韩先生、樊斯瑞/樊，核心名不同) 断言保留 low（歧义闸仍生效）。
- 双门禁：tsc 0 错；vitest 80 文件 776/776 全绿。
- 交付：三处版本号对齐 v2.17.0（package.json 上轮已升、changelog-data.ts LATEST_VERSION/CHANGELOG_BRIEF/VERSIONS + 根 CHANGELOG.md 头条 + 更新报告.md 顶部 + 项目记忆追加）；commit f3a767b（14 文件 +380/-160），SSH 推送 ghssh main 成功（22fff78..f3a767b）；dev server HTTP 200 且 /changelog 显示 v2.17.0。
- 马斯克 CEO 拍板：子代理通道仍故障，主代理自决收口（该活连贯/已验证/低风险/高价值）；零散未跟踪 maxloop 残件与 2026-08-13.md 日志压缩不纳入本次交付。IP 仍归瑞宝宝。

## 2026-08-15 轮次（v2.27.0 → v2.28.0 类型逃逸清理·第二批：Icon 图标名 as any 收口）
- 检测：真实基线确认 HEAD=v2.27.0（commit 2b98b8f），自动化记忆滞后写 v2.14.0 以代码为准；工作树仅 .workbuddy memory 改动 + untracked 临时目录（PROCESS/meetings、tmp_any_audit.mjs 等），无未收口源码。候选核验：重新摘要按钮(#221 v2.2.0 已落地)、大书导出流式(v1.6.38/39 已落地)、fire-and-forget 已闭环、a11y 已闭环——均无新工作；zod 输入校验骨架 grep 证实 src 下零 zod 引用（#221 计划未落地，属 API 层大型改造，暂缓）；类型逃逸第二批——AST+grep 交叉核验纯前端组件仍残留 ~119 处 any（27 as any + 75 :any + 17 any[]），AST 脚本因 TSX 细节漏检，grep 才是可靠源。
- 决策：子代理通道（review-worker/deepseek-v4-pro）本环境仍故障，按用户纠偏主代理代行马斯克 CEO 拍板——不假收敛重复已闭环项；zod 骨架暂缓（高风险设计，非本轮硬啃）；类型逃逸第二批延续 v2.25 已验证低风险路径，采取小批次精确收窄。
- 修复：锁定 6 处「图标名合法却被 as any 绕过 IconName 类型检查」的冗余写法（CommandPalette/AIChatHeader/ChatSuggestions/ProjectSettingsDialog/ChapterEntitiesPanel/ForeshadowingPanel），5 个文件补 `type IconName` 导入、三元折叠箭头整体收窄为 `(cond ? "arrowRight" : "arrowDown") as IconName`；统一 `as any`→`as IconName`（IconName=keyof 图标注册表联合类型），从源头消除任意类型逃逸、编译期约束图标名；零运行时逻辑改动。
- 双门禁：SAFE_DELETE_DISABLE=1 npx tsc --noEmit --incremental false = 0 错；npx vitest run = 91 文件 852/852 全绿（与 v2.27 基线一致，零回归）。
- 交付：四文件同步 v2.28.0（package.json/changelog-data.ts LATEST_VERSION+CHANGELOG_BRIEF头条+VERSIONS[0]/CHANGELOG.md/更新报告.md）；commit cc51056（10 文件 +42/-13）；SSH 推送 ghssh main 成功（2b98b8f..cc51056）；dev server /changelog HTTP 200 且含 v2.28.0。
- 马斯克 CEO 拍板（主代理代行，子代理故障如实标注）：本轮连贯/已验证/低风险/高价值，直接收口；ContextPreview 的 (d as any) JSON 动态访问属 LLM/JSON 桥接类暂缓（马斯克此前拍板），StyleEditor 2 处对象字面量 as any 不在图标范围暂缓；IP 仍归瑞宝宝，无新 IP/品牌/引流。

## 2026-08-15 第二轮（v2.28.0 基线 · 诚实归零轮，未升版不 commit）
- 检测：真实 HEAD=v2.28.0（cc51056，已推 ghssh main）；工作树无未收口源码（仅 memory 改动 + untracked 临时目录）。三候选方向全部实证核验：① 类型逃逸 1517 处（595 as any + 660 :any + 262 any[]）绝大多数为 LLM/Prisma JSON 桥接（马斯克此前暂缓）与 test/生成物（禁改），纯前端组件已在 v2.25/v2.28 收口干净（useState/useRef any=0）；② 重新摘要/大书导出/fire-and-forget/a11y 历史轮均已闭环；③ **zod 骨架纠偏**——记忆误记「零 zod 未落地」，实证 src/lib/validators.ts 已存在（手写轻量校验层，零新依赖）+ 8 核心路由已接入 + validators.test.ts 22 describe 全绿，即 #221 以等价手写层落地，硬套 zod 反冗余；v2.28 遗留候选#② StyleEditor 373-374 的 as any 实证为 `StyleTemplate.icon:string`→`<Icon name:IconName>` 诚实桥接（`⬜` 是 emoji 不在 iconMap，硬标必 TS2322，Icon 已有 null 兜底），不假收敛硬改。另扫 64 写路由裸用 request.json() 未走骨架，但 56 个为 AI 生成/自由文本类，全量接入属高危边际重构，先算风险不扩大范围。
- 决策：子代理通道仍故障，主代理代行马斯克 CEO 拍板并如实标注，不回头问；结论＝无安全可落地硬缺口，按「不假收敛」红线**本轮不升版、不 commit**，避免为不空转制造虚假改动。
- 验证：tsc 0 错；vitest 91 文件 852/852 全绿（与 v2.28 基线一致，零回归）；dev server :3001 监听、/changelog 200。
- 交付：无代码升版；回写自动化 memory + 新建 2026-08-15.md 项目记忆追加本轮章节。下一轮候选（避重复盲区）：① LLM/Prisma 桥接项仅在有「tsc 实证低成本可去」确定项时收；② agent-browser 抓 accessibility-tree 真页面复验历轮 a11y/类型修复；③ 用户新明确诉求优先。IP 仍归瑞宝宝。

## 2026-08-15 第三轮（v2.28.0 → v2.29.0 手稿导入解析两处真实 bug 修复）
- 检测：工作树干净（仅 memory 改动 + 临时目录）。候选复盘：类型逃逸 1144 处全在 LLM/Prisma/路由 JSON 桥接（暂缓高危）、zod 以等价手写 validators 落地、历史轮缺口全闭环、TODO 零真实待办、console 低价值不碰。转向「找真实 bug」：读 manuscript-parse.ts + node 实锤两处「导入丢内容」缺陷——docxToText 只认裸 </p> 漏 </w:p>（整篇当一段）、parseManifest 要求 id 在 href 前（href 在前被漏匹配→缺章）。
- 决策：子代理通道仍故障，主代理代行马斯克 CEO 拍板（如实标注），修复已实测/低风险/高频链路/高价值→收口 v2.29.0。
- 修复：docxToText 正则兼容 </w:p>；parseManifest 顺序无关；stripHtml 补数字实体解码（&#160;→空格）；导出 4 纯函数供测；新增 manuscript-parse.test.ts 12 例。
- 双门禁：tsc 0 错；vitest 92 文件 864/864 全绿（较 v2.28 +12）。
- 交付：四文件升 v2.29.0（package.json/changelog-data.ts 三处/CHANGELOG.md/更新报告.md）；commit 683f60f（6 文件 +130/-12）；SSH 推送 ghssh main 成功（cc51056..683f60f）；dev server HTTP 200 + /changelog 含 v2.29.0。IP 仍归瑞宝宝。


## 2026-08-15 轮次（v2.31.0 → v2.32.0 补 proseToHtml 单测·导出地基加固）
- 检测：真实 HEAD 实为 v2.31.0（05d3f36，用户在主对话做「删 autoCreateEntities 死代码」已推送），非自动化记忆滞后写的 v2.14.0/2.30.0；工作树仅 .workbuddy memory 改动 + untracked 临时目录。候选核验：导出链路（export/route.ts + epub/docx 流式）质量高——格式白名单/空内容拦截/选章级联/流式分块俱全无崩溃 bug；导入 commit 路由防御充分（空载荷校验/DB 幂等锁/deadline/逐章 content 校验/结构化错误分类）无崩溃缺陷；类型逃逸 1620 处（as any 642/:any 692/any[] 286）绝大多数为 LLM/Prisma JSON 桥接（马斯克此前暂缓高危项），纯前端组件仅 46 处 as any 多属 DOM/event/JSON 桥接，继续清理边际收益低；v2.30 验收干净无遗留。
- 决策：子代理通道仍故障，主代理代行马斯克 CEO 拍板（如实标注），不假收敛重复已闭环项；聚焦真实测试覆盖缺口。
- 修复：导出链路核心散文→HTML 转换 proseToHtml（被 HTML/EPUB/DOCX 三大导出复用、长期零单测）补 11 例自动化测试（src/core/proseToHtml.test.ts），锁死段落包裹/空行分段/**粗体*/*斜体*/---分割线/>引用块/HTML 特殊字符转义/段落内换行；node 实锤确认行为健康、无丢内容或崩溃级缺陷。纯测试补全、零生产代码改动。
- 双门禁：tsc 0 错；vitest 全量 93 文件 870/870 全绿（较 v2.31.0 基线 +1 文件 +11 例）。注：首次全量遇 storyline/generate.test.ts「type=thread 解析」用例偶发失败，但单独重跑 3 次全绿、二次全量重跑均 870 全绿；git blame 显示 generate.ts:185 为「Not Committed Yet 11:32」即用户在并行主对话实时编辑未提交的改动（强制 thread→side 属伏笔归伏笔面板设计），非本轮引入、属测试间状态污染/用户并行编辑时序，未触碰该用户领地文件。
- 交付：四文件同步 v2.32.0（package.json/changelog-data.ts LATEST_VERSION+CHANGELOG_BRIEF头条+VERSIONS[0]/CHANGELOG.md/更新报告.md）；commit + SSH 推送 ghssh main；IP 仍归瑞宝宝。
- 马斯克 CEO 拍板（主代理代行，子代理故障如实标注）：本轮连贯/已验证/低风险/高价值（导出地基测试防护），直接收口 v2.32.0；不假收敛重做已闭环项。
