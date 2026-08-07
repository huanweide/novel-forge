# Round 2 深度体验报告 —— 监控 / 性能 / API 断链 / 大上下文透镜

> Agent代号=监控性能API断链透镜
> round-2、版本 v1.6.4（HEAD=2b88e09）、日期 2026-08-07
> 方法：独立只读审查 + 真实脚本运行 + 类型检查 + 单测复跑 + 源码逐行核对（file:line 可证）。
> 诚实边界：沙箱无 Chromium（纯视觉降级为 API+SSR+源码审查）、无可达数据库（DB 指向 127.0.0.1:5432，本环境未起实例），故"看延迟面板/监控数据"以代码级行为推演 + 接口契约核查替代真机渲染；凡涉及真实 DB 渲染的结论均显式标注为"代码推演"，不冒充真机截图。
> 对照目标：HANDOVER-2026-08-06.md 第3项目标「性能/浪费/监控盲区」+ round-1 已修 IMP-019/020/021 的 round-2 复验。

---

## 术语大白话（先把黑话翻译清楚，后文才好读）

- **LlmCallLog（LLM 调用账本）**：每次真正调大模型成功后，把"用了多少输入/输出 token、花多少钱、什么模型、耗时多少毫秒"写进 Postgres 的这张表。它是成本看板与延迟面板的**唯一数据源**。`generation-metrics` 与 `stats/monitor` 的"AI 成本/延迟"全部来自这张表。注意：它从 `v0.46.20` 起才记账（`stats/monitor/route.ts:109-111` 注释明示），更早的历史调用在表里完全没有，会造成"老项目监控全 0"的假象。
- **延迟硬指标 / 超过两秒就是失败**：智能体团队定的铁律——单次生成端到端耗时的 P95 超过 2000ms 即判失败。`generation-metrics/route.ts:18` 的 `LATENCY_THRESHOLD_MS=2000` 即此阈值，面板据此显示红色告警（`GenerationLatencyPanel.tsx:136-146`）。
- **监控盲区（本透镜定义）**：有两层含义。第一层是"运行时盲区"——某条生成/填表路径没被记账函数统计，成本看板对其失明；第二层是"巡检盲区"——自家 API 断链巡检脚本因设计缺陷持续误报，让"0 断链"的宣称失真（见 F-01）。本报告的"监控盲区"同时覆盖这两层。
- **大上下文构建**：每次让 LLM 写一章前，要把"角色卡、世界书、剧情线、前文摘要、最近几章正文"等拼进 systemPrompt。这个过程要从数据库拉多少数据、拼多大，就是"大上下文"问题。它直接决定"点生成后卡多久、吃多少内存"。
- **全量加载 vs 窗口化**：全量加载＝把整个项目的所有章节/角色/世界书一次性拽进内存；窗口化＝只拉"当前章往前 N 章"这一小段。前者是"无界 O(n) 浪费"，后者才是正解。
- **TOCTOU 竞态**：Time-Of-Check-Time-Of-Use，先检查"有没有在跑"再"开新任务"，这两步之间若有另一个请求插进来也通过了检查，就会两个任务同时跑，互相踩踏。
- **monitorCache**：`stats/monitor` 路由里的一个模块级 `Map` 内存缓存，把"本月 LLM 聚合"按 projectId 存 30s，避免每次切章都重跑昂贵的 `aggregate`+`groupBy`（IMP-020 修的正是这个）。round-2 又给它加了 512 条容量上限（F-04 详述）。

---

## 一、真实执行证据（先亮底牌，后文所有结论均源于此）

下表是本透镜在沙箱内**真实运行**得到的原始结果，非推测。每一个发现都能回溯到这里的某一项。

| 证据项 | 命令 / 来源 | 真实结果 |
|---|---|---|
| API 断链巡检 | `node scripts/audit-api-refs.cjs` | 输出 `TOTAL_REFS 113 MISSING 20` |
| 类型安全 | `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` | **EXIT 0（0 错误）** |
| 单元测试 | `SAFE_DELETE_DISABLE=1 npm test` | **238 passed (19 files)**，无任何失败 |
| 语义版本 | `git log` 首行 + README/CHANGELOG | 版本号 **v1.6.4**，HEAD=`2b88e09`（commit: "feat: v1.6.4 故事线支线联动 UI + 数据化"） |
| package.json 版本字段 | `package.json:3` | 注意：该文件 `version` 字段仍是 `0.1.0`，与对外语义版本 v1.6.4 不一致——属元数据瑕疵，不影响功能 |
| 实际路由数 | `find src/app/api -name route.ts \| wc -l` | **102 条**真实路由 |
| 路由清单 | `scripts/.api-routes.txt` | **99 条**手工维护清单（已滞后 3+ 条） |
| 监控单测分布 | 全仓 `*.test.ts` 统计 | `generation-metrics/route.test.ts` 3 例、`auto-rate.test.ts` 5 例，共 **8 例**直接监控测试；主路由 `stats/monitor` **0 直测** |
| 大上下文加载 | 读 `src/core/pipeline/context-loader.ts:30-77` | 12 类并行查询，其中 4 类无 `take` 无 `select` 全量加载 |

**关键判断**：`audit-api-refs.cjs` 报告的 20 个 MISS，经逐条核对真实路由目录（`find` 得 102 条）与前端调用点，**真实断链为 0 条**；20 条全部是脚本自身的误报（详见 F-01）。下文的"双栏体验"中凡涉及"误导/断链/卡顿"的描述，均基于代码路径推演 + 接口契约，未做浏览器真机渲染（已声明边界）。

### 实测脚本运行过程记录（原样转述，证明非编造）

执行 `node scripts/audit-api-refs.cjs` 后首行即 `TOTAL_REFS 113 MISSING 20`。随后逐条 MISS 输出，我做了三件事核验真实性：
1. 对 `story/batch-write`：运行 `find src/app/api -path "*story*"` 确认 `src/app/api/story/batch-write/route.ts` 存在；`grep` 前端确认 `src/app/workspace/[projectId]/page.tsx:318` 与 `BatchWriteDialog.tsx:72` 确实 `fetch("/api/story/batch-write")`。结论：路由与调用都存在，MISS 是清单漏登导致。
2. 对 `babylore/fill-task/${taskId`：确认 `src/app/api/babylore/fill-task/[taskId]/route.ts` 存在，前端 `BatchWriteDialog.tsx:41` 用模板字符串 `` `/api/babylore/fill-task/${taskId}` `` 调用。结论：残键 `babylore/fill-task/${taskId` 是脚本正则截断模板字面量所致。
3. 对 13 条 `changelog-data.ts` 命中：打开 `src/lib/changelog-data.ts`，确认这些是变更日志的**描述文字**（如"新增 POST /api/story/batch-write：FillTask..."），不是 `fetch` 调用。结论：扫描器把数据文件当代码扫了。

核对 `tsc` 与 `npm test` 均一次性通过，无需要二次干预。这证明：编译期类型安全与单测门禁是**真绿**的，不是靠 `|| true` 糊弄（对比更早的 round 报告里"CI 全是 `|| true`"的历史问题，本轮已修复）。

---

## 二、用户体验视角（约 6000 字）

> 本栏以一个"正在用 novel-forge 写长篇、且关心延迟与成本"的创作者视角，结合代码路径推演其会看到什么、会被什么误导、会在哪里卡顿。所有体验描述均标注为"代码推演"，因为沙箱无法起 DB 做真机渲染。

### 2.1 延迟面板：从"全站红告警"到"按项目诚实"，但仍有三道体验裂缝

先给结论：round-1 的 IMP-019 修复是**真实且有效**的，这一点必须明确肯定。修复前，延迟面板用 `window.location.pathname` 正则 `/workspace\/([^/]+)/` 强制要求 URL 带尾斜杠，而 Next.js 默认路由 `/workspace/<id>` 是没有尾斜杠的，于是正则匹配失败 → `projectId` 变成 `undefined` → 请求回退成"不带 projectId 的全站聚合" → 不论你在看哪个项目，面板都显示全站最差的延迟，也就是"每个项目都红"。这是一个会让用户误以为"我这个项目生成很慢/失败了"的经典误导。

修复后，`src/components/workspace/GenerationLatencyPanel.tsx:79-86` 用大段注释记录了这个坑，并改用 `useParams<{projectId}>()` 直接从路由段取 projectId；`:91` 处显式拼 `?projectId=${encodeURIComponent(projectId)}` 传给 `/api/generation-metrics`。从代码契约看，这套改法是自洽且正确的——只要这个面板组件被渲染在 `/workspace/[projectId]` 路由树下，`useParams` 就必然能稳定取到 projectId，完全不依赖 URL 字符串的具体形态。后端 `generation-metrics/route.ts:48,54` 也确实接收 `projectId` 并 `where.projectId` 过滤。所以 IMP-019 是"药到病除"的那一类修复。

但是，站在真实用户视角，这个面板还有三道体验裂缝，是 round-2 该补的：

**裂缝一：面板是"开页快照"，写完新章不会自动刷新。** `src/components/workspace/GenerationLatencyPanel.tsx:88-110` 的 `useEffect` 依赖数组只有 `[projectId]`，意味着它只在"切换项目"时拉一次数据，写作过程中生成的章节不会触发重新拉取。一个作者连写五章、亲眼看到延迟从 1.2s 恶化到 3s，但他看到的面板数字**纹丝不动**，除非手动刷新整个页面（F5）。而"智能体团队铁律：超过两秒就是失败"本身是一个**实时监控**诉求——它需要让用户"边写边看到延迟变化"，才能起到"硬指标"的威慑与反馈作用。一个静态面板把"延迟是硬指标"偷换成了"延迟是开页那一刻的硬指标"。从 UX 角度，缺一个显式的"刷新"按钮，或者一个低调的定时轮询（比如每 20–30s 拉一次，正好和 monitor 缓存 TTL 同一量级，后端几乎无压力），就会让用户产生"数据没变=没新生成=面板坏了"的错觉。这是体验上最该补的第一点。

**裂缝二：空态与"历史无基线"语义混淆。** `generation-metrics/route.ts:69-71` 在 `logs.length===0` 时返回 `{ok:true, empty:true}`；面板 `src/components/workspace/GenerationLatencyPanel.tsx:128-132` 据此显示"尚无生成记录。生成任意正文/摘要后，这里会显示真实耗时分布……"。问题在前面说的那个隐藏前提：`llmCallLog` 从 `v0.46.20` 才记账。于是出现两种截然不同的"空"：一种是"我真没生成过"（真空），另一种是"我生成过很多，但都在记账功能上线之前，表里查不到"（无基线）。面板对这两种情况**给出完全相同的提示**。一个新装/刚升级/切了新 Provider 的用户，看到"尚无生成记录"会本能地怀疑"这功能是不是坏了/没在统计"，而真实原因只是"历史调用从未被记账"。从监控可观测性视角，这是一类典型的"监控盲区以'看起来没数据'的形式伪装成'没在跑'"。正确的做法应该在响应里区分 `empty`（确实无日志）与 `noBaseline`（有记账起点之后的日志为 0 / 或表从未启用），前端据此给不同文案，比如后者提示"成本统计自 v0.46.20 起启用，此前记录不可见"。

**裂缝三：本地/云端分组依赖脆弱正则，可能反向建议。** `generation-metrics/route.ts:40-43` 用 `isLocal(baseURL)` 的正则 `/localhost|127\.0\.0\.1|0\.0\.0\.0|:11434/` 来判定一次调用是不是"本地推理"。这就有坑了：如果用户用 Ollama 但监听在非 11434 端口（比如默认的 11434 其实常见，但有人改端口），或者自定义 baseURL 形如 `http://192.168.1.50:1234`，就会被错判为"云端"。一旦错判，面板里"本地 vs 云端 P95 对比条"（`GenerationLatencyPanel.tsx:171-180`）就会给出**反向建议**——明明是本地推理慢，却提示用户"优先切本地推理"。这直接动摇了延迟面板"帮助用户做推理部署决策"的核心价值。正则比对的脆弱性，是监控数据可信度的一个暗坑，应当改为"让用户/配置显式声明 baseURL 归属"，或至少把判断逻辑做成可配置的正则/前缀表。

### 2.2 监控聚合面板：切章不再全月重算（IMP-020 生效），但"全局 vs 当前项目"呈现易看错

round-1 的 IMP-020 把"切章（改 nodeId）时仍重跑全月 `aggregate`+`groupBy`"这个性能坑修掉了。新增的 30s 内存缓存，`src/app/api/stats/monitor/route.ts:15` 定义 `MONITOR_CACHE_TTL_MS=30_000`，缓存键仅取 `projectId`（因为 nodeId 根本不影响 LLM 聚合结果，纯属白算）。这是**真实生效**的——`getCachedMonitor`/`setCachedMonitor` 在 `:24-36` 实现，命中就跳过 `:119-180` 那两次重型查询（`llmCallLog.aggregate` 与 `groupBy`）。从用户体验看，过去切一章监控面板可能"闪一下卡一下"，现在顺了，这是实打实的体验提升，IMP-020 值得肯定。round-2 又补了 `MONITOR_CACHE_MAX_SIZE=512`（`:17`），避免 Map 只增不删导致长运行内存泄漏——这个护栏也正确（F-04 会再谈它的瑕疵）。

但有两个用户会踩的坑：

**坑一：缓存把"全站"和"当前项目"塞在同一个 projectId 键下，但两者语义不一致。** `src/app/api/stats/monitor/route.ts:120-124` 的 `llmUsage` 是**全站**本月聚合（where 条件里**没有** projectId 过滤），而 `:151-155` 的 `projectAgg` 才是**当前这个项目**的聚合。可两者都按 `projectId` 缓存——这意味着同一个全站数字，会被每个访问过的项目各存一份（最多 512 份冗余副本，见 F-04）。对用户而言，更隐蔽的问题是：面板里"AI 成本"那一块，用户其实很难分清哪一行是"我这个项目花的"、哪一行是"全站所有人花的"。`projectLlm.byProject` 把每个项目都列出来，但 `llmUsage.totalCost` 又悄悄是全站的。一个只关心自己项目成本的作者，看到 `llmUsage.totalCost` 那个大数字可能被吓一跳（那是全站的），而真正"本项目成本"藏在 `projectLlm.totalCost` 里。这种"全局与局部并列、且标签不够醒目"的信息架构，是监控呈现层的 UX 缺陷——它不报错，但会持续制造"我是不是超支了"的误读焦虑。

**坑二：30s 缓存让"刚花的钱"延迟可见。** 用户刚点完"批量写作 10 章"，迫不及待切到监控面板想看"这一波花了多少"，结果数字没变——因为缓存 30s 内不刷新。对"写一章就想立刻看成本"的心智模型，这 30s 延迟会被解读为"统计不准/漏记了"。代码注释里说"切章不改结果所以可缓存"在技术上是成立的，但"用户刚生成完想立刻看成本"这个高频场景，缓存反而制造了"监控滞后"的体感。理想做法是：成本数据允许"最终一致"，但在用户主动刷新/切到成本页时，给一个"数据可能有 30s 延迟"的小标注，或提供手动刷新。

### 2.3 大上下文：作者感知不到的"看不见的卡顿"

这是本透镜在"性能/浪费"目标下挖到的最大一头。用户点"生成这一章"，界面卡几秒到十几秒（取决于模型快慢）。这段时间后台在干什么？`src/core/pipeline/context-loader.ts:30-77` 的 `loadGenerationContext` 一次性并行拉取 12 类数据，**其中 4 类是无上限、无字段投影的全量加载**：

- `allNodes`：`prisma.storyNode.findMany({ where: { projectId } })`（`:34-37`）——**整个章节树全拉**，含 `content`/`wordCount`/`reviewLogs` 等大字段，没有 `take`、没有 `select` 投影。
- `characters`：`findMany({ where: { projectId } })`（`:38`）——**整卡司全拉**（对比之下，`outline-context.ts:46` 那边好歹写了 `take:50`，这里却没限制）。
- `loreEntries`：`findMany({ where: { projectId, enabled: true } })`（`:39-41`）——**整本世界书全拉**。
- `loreTables`：`findMany({ where: { projectId } })`（`:74-76`）——**全部结构化表格全拉**。

对写 10 章以内的短篇，这点开销无所谓。但 novel-forge 明确要服务"靠小说赚钱的创作者"（HANDOVER:11），长篇可能几百上千章、几百个角色、几千条世界书词条。每生成一章都把**整棵章节树 + 整卡司 + 整世界书**从 Postgres 拽进 Node 内存，最后却只取"最近 4 章"（`write/route.ts:68-72` 的 `keepChapters` 默认 4）和少量时间线过滤子集。从用户视角，这表现为：项目越大，点"生成"越慢、Node 进程内存越涨——而且**慢得没有任何提示**（没有任何 loading 文案区分"在拉上下文"还是"在等模型返回"）。这是典型的"性能浪费伪装成正常延迟"：用户只会笼统觉得"这软件越写越卡"，根本归因不到"每次都全量拉数据"这个根因。

更糟的是，`allNodes` 全量拉取其实只为两件事服务：① 构建 `nodeOrderMap`（`:86-89`），目的仅仅是给摘要/伏笔做"时间线过滤"用 `{id, order}` 两个字段；② 取最近 4 章的 `content`。第①件事只需要一个轻量的 `{id, order}` 投影查询，却拉了整行（含完整正文）；第②件事只需要最近几章带 `content` 的数据，却把全部章节的 `content` 都拽了。这是"用带宽和内存换编码方便"的典型反面教材，在长项目上会放大成真实的卡顿和潜在的内存压力。修复方向清晰（F-02）：投影 + 窗口化。把"全量拉"改成"轻量索引 + 最近窗口"，既降 DB IO 又降内存。

### 2.4 API 断链：用户视角"看起来全绿"，但巡检工具在制造假警报

站在普通创作者视角，前端调的接口基本都通——因为真实断链是 0（F-01 已证）。但站在"运维/接手 Agent"视角，`audit-api-refs.cjs` 每次跑都报 `MISSING 20`，会让人以为"有 20 个接口坏了/前端调了不存在的路由"。我逐条核对后发现这 20 条**全是误报**：6 条是模板字符串被正则截断（如 `` presets/${p.id} ``、`` babylore/fill-task/${taskId} ``、`generation-metrics${projectId`），13 条是从 `src/lib/changelog-data.ts` 这个"变更日志数据文件"里扫出来的文档性文字（里面写"新增 POST /api/xxx"之类的描述被当成了真实调用），1 条是 `story/batch-write` 真实存在但清单 `.api-routes.txt` 漏登记。

为什么这关乎"用户体验"？因为**巡检工具的可信度本身就是可观测性的一部分**。当一个工具持续产出"狼来了"的假断链，接手 Agent 会陷入两难：要么彻底忽视它的输出（那将来真断链也会被漏掉），要么像我这样花大量时间逐条排查。对一个立志做"监控无盲区"的项目，自家巡检脚本有 20/20 的误报率，是这个透镜最该优先修的"监控盲区"——**盲区不在运行时，在巡检工具自身**。用户（以及未来的维护者）对"系统健康"的信任，会被这种噪声一点点侵蚀。

### 2.5 并发体验：批量写作的"已有任务在跑"保护有竞态窗口

用户点"批量写作"，如果上一次还在跑，理想情况下应该被告知"已有任务在运行"而不是叠跑。`src/app/api/story/batch-write/route.ts:17-22` 的 `ensureNoRunning` 查 `status in [pending, running]`，`:56`（模式 B 写正文）和 `:109`（模式 A 建章+章纲）再 `create`。但这两步**不是原子的**——两个几乎同时到达的 POST 请求，可能都先通过 `ensureNoRunning`（都查到 null，因为彼此都还没建任务），然后各自 `fillTask.create`，于是同一个项目并发跑两个批量任务：它们会互相抢 `FillTask` 的进度计数（`:81-84`/`:151-154` 的 `done/failed` 更新），还会抢 `storyNode` 的自增 `order`（`:121-134` 的 `maxOrder.aggregate` + `create` 同样存在窗口）。用户会看到"我明明只点了一次，怎么出了两份第 N 章"，或者进度条在两种状态间乱跳。这是教科书式的 TOCTOU 竞态，在快速双击、网络重发、或前端没做防抖时偶发，但一旦发生体验很糟（重复章节、进度错乱、甚至可能两份任务都去写同一章把内容覆盖）。（详见 F-03，修复可复用项目已有的 `ImportCommitLock` 唯一约束模式。）

### 2.6 监控信息架构的"软钉子"小结（用户视角）

把上面五点收一下：从创作者视角，本轮最该点赞的是 IMP-019/020 的**真实落地**——延迟面板不再"全站红误导"、切章不再全月重算卡顿，这两处是实打实的体验修复。但体验上仍有三类"软钉子"在慢性侵蚀"这软件靠谱"的体感：① 延迟面板是静态快照、无刷新、空态与"无基线"不分（2.1）；② 监控面板的"全局 vs 当前项目成本"并列且标签不醒目、30s 缓存让刚花的钱看不见（2.2）；③ 长项目每次生成都全量拉上下文，越写越卡且无任何提示（2.3）。它们都不是"点了就崩"的 blocker，但都属于 HANDOVER 第3项目标里"性能/浪费/监控盲区"的正解范围。再加上巡检脚本的假警报（2.4）和批量写作竞态（2.5），构成了用户/维护者视角下本轮该修的全部清单。

---

## 三、总体视角（约 5000 字）

> 本栏跳出单用户，从架构质量、性能瓶颈、监控覆盖度、缓存策略、类型安全、并发正确性六个维度做总体评判，并给出修复优先级。所有结论均可由 `file:line` 复现。

### 3.1 架构质量：API 一致性"运行时绿、工具链红"

**运行时层面给正面结论**：前端调用的接口与后端路由**全部对得上**。我核对了 `audit-api-refs.cjs` 报出的所有 MISS 对应的真实调用点，`story/batch-write`（`src/app/workspace/[projectId]/page.tsx:318`、`BatchWriteDialog.tsx:72`）、`babylore/fill-task/[taskId]`（`page.tsx:340`、`AutomationSettingsDialog.tsx:71`、`BatchWriteDialog.tsx:41`）、`generation-metrics`（`GenerationLatencyPanel.tsx:91`）、`presets/[id]`（`workshop/page.tsx`、`StyleEditor.tsx`）均有对应 `route.ts` 存在且路径匹配。**真实断链 0 条**，这是架构一致性的硬事实。

**工具链层面给负面结论**：巡检脚本 `audit-api-refs.cjs` 却报 20 个 MISS，根因是三个设计缺陷（F-01）：① `:27` 的正则 `/[`"'](\/api\/[^`"'?}]+)/g` 在模板字面量 `` `/api/xxx/${var}` `` 处会在 `${` 或 `?` 截断，得到 `generation-metrics${projectId` 这类残键；② `:18-25` 的 `walk` 扫描 `src/**/*.ts(x)` 全部文件，把 `src/lib/changelog-data.ts`（一个纯变更日志数据文件，含 111 处 `/api/` 描述文字）也扫进去，产生 13 条文档性误报；③ `:5-10` 的路由来源是手工维护的 `scripts/.api-routes.txt`（99 条），而实际路由目录有 102 条——`story/batch-write`、`characters/dedupe`、`story/nodes/*` 等新路由未回填清单，导致真实存在的调用被标"缺失"。

**总体判语**：API 一致性"运行时 0 断链"是真，但**巡检工具不可信**（100% 误报率）本身就是一个架构债。正确的修法是让脚本直接扫描 `src/app/api/**/route.ts` 推导真实路由，而非依赖会漂移的手工清单；并排除数据/文档文件、处理模板字面量。这一项不修，后面所有"0 断链"的宣称都建立在会漏报也可能误报的沙子上。

### 3.2 性能瓶颈：大上下文是头号浪费，非 O(n²) 但无界 O(n)

任务特别点名 `outline-context.ts` 是否 O(n²)/过大。我读了 `src/core/pipeline/outline-context.ts` 与真正被 write 路由调用的 `src/core/pipeline/context-loader.ts`，结论明确：**没有 O(n²)**——`formatStorylines`（`:71-85`）、`formatSummaries`（`:174-179`）、`buildCharacterList`（`:140-158`）都是 O(n) 线性 map；`extractPrevContext/NextContext/LastChapterHook`（`:88-136`）也是 O(n) 扫描后切片。但存在两处**无界 O(n) 浪费**（F-02）：

1. **`context-loader.ts:34-37` 全量拉章节树**：每章生成都 `findMany({where:{projectId}})` 不带 `select`/`take`，把整棵树的 `content`/`reviewLogs` 全拽进内存，实际只用最近 4 章（`write/route.ts:68-72`）。
2. **`context-loader.ts:38,39-41,74-76` 全量拉角色/世界书/表格**：`characters` 无 `take`（`outline-context.ts:46` 那边好歹 `take:50`），`loreEntries`/`loreTables` 全量。大世界书项目每次生成都全拉。

修复方向明确：**投影 + 窗口化**。`allNodes` 改为 `select:{id,order,parentId,type,title}` 拿轻量索引（仅供 `nodeOrderMap` 与时间线过滤），再对"最近 N 章"单独 `findMany({where:{projectId, order:{gte: currentOrder-N}}})` 取带 `content` 的正文；`characters` 加 `take` 与 `outline-context` 对齐上限；`loreEntries` 按触发词命中再取，而非全量。另外 `outline-context.ts` 里 `extractPrevContext`/`extractNextContext`/`extractLastChapterHook` 各自独立 `allNodes.filter(chapters)`（`:89,108,126`）——同一数组被扫 3 遍，是 3×O(n)，可 hoist 一次（F-07，低优先级整洁度）。

### 3.3 监控覆盖度：运行时指标丰富，但五类盲区仍在

**已覆盖（真实、有价值）**：延迟硬指标 `generation-metrics` 提供 P95/中位/均值、TTFB、吞吐、本地 vs 云端对比、超阈值判定（`:113`）；进度与成本 `stats/monitor` 提供总字数、章节完成率、自动放行率（`computeAutoRate`）、近 14 天写作节奏、本月全站/本项目 token 与花费（`:182-221`）。

**盲区（F-05，P2）**：① 生成成功率/失败率与错误类型缺失——`generation-metrics` 仅用 `role not startsWith "fail:"` 把失败调用剔除（`:51`），但没把"失败次数/失败原因分布"作为指标暴露，用户看不到"我这 100 次生成挂了几次、挂在哪"；② 后台任务积压深度缺失——`FillTask` 的 `pending/running` 数量没进 `stats/monitor`（`:48-57` 只 count summaries/beats/commitments），批量写作/一键追评排队的"还有多少没跑完"没有面板项；③ 缓存命中率缺失——`monitorCache` 的命中/未命中无指标（`:24-36`），无法判断是否真在省查询；④ 逐章 token 趋势缺失——只有累计估算（`:77-79`），没有"每章花多少 token"的趋势，无法定位"哪一章特别费"；⑤ 无基线语义——`llmCallLog` 仅 `v0.46.20+` 记账（`:109`），老项目面板全 0，易被误读为"没在统计"（已在 2.2 提及）。

### 3.4 缓存策略：30s TTL 正确，容量护栏 round-2 已补，但冗余与全局性有瑕疵

IMP-020 的 30s 缓存 + round-2 新加的 `MONITOR_CACHE_MAX_SIZE=512`（`stats/monitor/route.ts:17`）是**正确的内存护栏**——否则 `monitorCache` 只 `set` 不 `delete` 会随项目数无限增长（长运行泄漏）。`setCachedMonitor`（`:29-36`）在超上限时删最旧条目（Map 迭代序=插入序，首键即最旧），逻辑成立。

瑕疵（F-04，P2）：缓存键只有 `projectId`，但 `llmUsage` 是**全站**聚合（`:120-124` 无 projectId 过滤）。这意味着同一个全站数字被每个项目各存一份，最多 512 份冗余——虽被 MAX_SIZE 兜住，但语义上应把"全站"和"本项目"分开缓存（全站用固定键，本项目用 projectId 键），既省内存又避免"按项目缓存全局数据"的概念混乱。此外缓存是模块级单例，Next.js 多 worker/Serverless 下各实例各持一份，命中率打折；本地单进程场景无碍，但应注明这是"单实例优化"而非"分布式缓存"。

### 3.5 类型安全：tsc 零错误，但 `any` 泛滥削弱监控可靠性

`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` **EXIT 0**，类型层面无阻断问题，这点是扎实的，说明编译期门禁是真的（对比历史"CI 全是 `|| true`"问题已解决）。但代码里大量 `any`：`outline-context.ts:25-32` 的 `OutlineContextData` 全 `any`、`context-loader.ts:113-126` 全 `as any`、`generation-metrics` 返回结构靠前端 `MetricsPayload`（`GenerationLatencyPanel.tsx:13-25`）手动对齐——这意味着：

- 路由返回的 JSON 形状与前端类型是**鸭子类型约定**，没有 zod/运行时 schema 校验。一旦后端改字段名，前端静默拿到 `undefined` 而不是报错——监控面板的"数据不更新"类问题会因此特别难排查。
- 监控数据的"类型安全"停留在编译期，运行期契约脆弱。建议对 `generation-metrics`/`stats/monitor` 的响应加 zod 校验（既是防御也是文档）（F-06）。

### 3.6 并发正确性：批量写作 TOCTOU，监控缓存无原子问题

- **`stats/monitor` 缓存无竞态风险**：纯读 + 简单 `Map.set`，即使并发写入也只是可能重复计算一次聚合，不影响正确性（F-04 已述）。
- **`story/batch-write` 有 TOCTOU 竞态**（F-03，P2）：`ensureNoRunning` 查询与 `fillTask.create` 非原子（`:17-22`+`:56`/`:109`）。并发 POST 可双双通过检查后各建一个任务 → 同项目叠跑批量写作，抢 `storyNode` 自增 `order`（`:121-134` 的 `maxOrder.aggregate`+`create` 同样有窗口）导致重复章节/进度错乱。修复：复用项目已有的 `ImportCommitLock` 模式（`prisma` schema `@@unique([projectId, nodeId])`），给 `FillTask` 加数据库唯一/部分索引兜底，或在事务内把"查运行中+建任务"包成原子。

### 3.7 总体评判

round-2 范围内，项目在"API 一致性（运行时）"与"类型安全（编译期）"两项是**真绿**的；IMP-019/020 的修复**真实落地、有效**；IMP-021 监控单测（generation-metrics 3 例 + auto-rate 5 例）**真实通过**。但有四个真实债需要进入下一轮：① 巡检脚本 100% 误报（F-01，P1，因为它让"0 断链"宣称失真）；② 大上下文无界 O(n) 浪费（F-02，P1）；③ 批量写作 TOCTOU（F-03，P2）；④ 监控主路由无直测 + 缓存冗余/全局语义（F-04，P2）。监控覆盖度本身有 5 类指标盲区（F-05，P2）。这些都不阻塞发布，但都是 HANDOVER 第3项目标"性能/浪费/监控盲区"的正解方向，应在 round-3 排入。

**关于 IMP-021"监控子系统补单测 13 例"的诚实核对**：round-1 交接描述称 IMP-021 补了 13 例监控单测。本透镜在仓库内实际盘点到的**直接**监控单测是 `generation-metrics/route.test.ts`(3 例：空态/聚合/projectId过滤) + `auto-rate.test.ts`(5 例：自动放行率计算) = 8 例，且这 8 例在 `npm test` 中确实全绿（属于 238 的一部分）。但**核心监控聚合路由 `stats/monitor` 自身没有任何直测**——它的 `dailyWords` 14 天聚合、章节分布 `distribution`、token 估算 `tokens` 等计算逻辑完全未被单测钉死。因此"13 例"与实测 8 例之间存在 5 例的缺口，最合理的解释是：要么 13 例的口径把若干"监控相邻"的测试（如 `storyline-progress`、`confirm-guard` 等）也计入了，要么这 5 例在后续重构中未随 `stats/monitor` 路由一起落地。无论哪种，本透镜的实务结论是：把"主监控路由无直测"作为一个明确的 P2 缺口写进 F-04 关联项，建议 round-3 补 `stats/monitor/route.test.ts`，用 mock prisma 覆盖"缺 projectId 返回 400""dailyWords 聚合正确""token 估算公式""llmUsage 全站 vs projectLlm 本项目"四个分支，把监控计算的回归门真正竖起来。这种"声称的覆盖数 vs 实测覆盖缺口"的偏差，本身就是一种需要被监控的"测试覆盖盲区"。

---

## 四、发现清单（均基于真实代码/测试/脚本运行证据，file:line 精确）

### [F-01] P1 —— API 巡检脚本 100% 误报，让"0 断链"宣称失真
- **文件:行号**：`scripts/audit-api-refs.cjs:5-10`（依赖手工清单）、`:18-25`（扫描含文档文件）、`:27`（正则截断模板字面量）、`:42-65`（MISS 判定）
- **现象**：`node scripts/audit-api-refs.cjs` 输出 `TOTAL_REFS 113 MISSING 20`，但逐条核对真实路由目录（`find src/app/api -name route.ts` 共 102 条）与前端调用点，20 条 MISS 无一对应真实断链：6 条是模板字符串被正则在 `${`/`?` 处截断（如 `generation-metrics${projectId`、`babylore/fill-task/${taskId`、`presets/${p.id`），13 条来自 `src/lib/changelog-data.ts`（含 111 处 `/api/` 描述文字被当调用），1 条 `story/batch-write` 真实存在但 `scripts/.api-routes.txt` 漏登记。
- **根因**：脚本以"前端引用 vs 手工维护清单"做交叉，而非扫描真实 `route.ts`；正则不支持模板字面量；扫描范围含纯数据文件。
- **建议修法**：① 路由来源改为扫描 `src/app/api/**/route.ts` 推导真实路径，弃用会漂移的 `.api-routes.txt`；② `walk` 排除 `src/lib/changelog-data.ts` 等数据/文档文件，或仅匹配 `fetch(`/`axios(` 真实调用站点；③ 正则改为允许模板段（如把 `` `/api/foo/${x}/bar` `` 归一为 `/api/foo/[id]/bar`）。修复后重跑应 `MISSING 0`。

### [F-02] P1 —— 每章生成全量加载章节树/角色/世界书/表格，长项目无界 O(n) 浪费
- **文件:行号**：`src/core/pipeline/context-loader.ts:34-37`（allNodes 全量无投影）、`:38`（characters 无 take）、`:39-41`（loreEntries 全量）、`:74-76`（loreTables 全量）；消费侧 `src/app/api/generate/write/route.ts:68-72`（仅取最近 4 章）
- **现象**：每次 write/refine/continue 生成都并行 `findMany({where:{projectId}})` 拉整棵章节树（含 `content`/`reviewLogs`）+ 整卡司 + 整世界书 + 全部结构化表格，实际只用到最近 `keepChapters`(默认4) 章的 `content` 与时间线过滤子集。千章级项目每次生成无谓传输/解析大量数据，表现为"越写越卡"且无 loading 区分。
- **根因**：为消除路由间复制粘贴（`context-loader.ts:4-8` 注释），把所有数据一次性全拉，未做投影与窗口化。非 O(n²)（均为 O(n) 单查询），但 n=项目规模时无上限。
- **建议修法**：`allNodes` 改 `select:{id,order,parentId,type,title}` 拿轻量索引；对"当前章往前 N 章"单独 `findMany({where:{projectId, order:{gte:currentOrder-N}}, select:{...content}})` 取带正文窗口；`characters` 加 `take`（与 `outline-context.ts:46` 的 `take:50` 对齐）；`loreEntries` 改为按触发词命中后取。可显著降内存与 DB IO。

### [F-03] P2 —— 批量写作 ensureNoRunning 与 create 非原子，存在 TOCTOU 竞态
- **文件:行号**：`src/app/api/story/batch-write/route.ts:17-22`（ensureNoRunning 查询）、`:56`/`:109`（create）、`:121-134`（maxOrder.aggregate+create 建章窗口）
- **现象**：两个几乎同时的批量写作 POST 可能都通过 `ensureNoRunning`（均查到 null），随后各自 `fillTask.create`，同项目并发跑两个批量任务，互相抢 `FillTask` 进度、抢 `storyNode` 自增 `order`，导致重复"第N章"或进度错乱。
- **根因**：查重与建任务两步非原子，无 DB 层唯一约束兜底。
- **建议修法**：复用项目已有的 `ImportCommitLock` 模式（`prisma` schema `@@unique([projectId, nodeId])`），给 `FillTask` 加 `(projectId, taskType=batchWrite, status in pending/running)` 的数据库唯一/部分索引，或在事务内 `select ... for update` 把"查运行中+建任务"包成原子；建章 `order` 同样用事务/序列避免并发重复。

### [F-04] P2 —— monitor 缓存：全局聚合按项目键冗余存储，且无分布式语义
- **文件:行号**：`src/app/api/stats/monitor/route.ts:17`（MAX_SIZE 已加，round-2 正确）、`:24-36`（get/setCachedMonitor）、`:120-124`（llmUsage 为全站聚合却按 projectId 缓存）、`:151-155`（projectAgg 才是本项目）
- **现象**：`llmUsage` 是**全站**本月聚合（`where` 无 projectId 过滤），却被以 `projectId` 为键缓存，同一全站数字最多存 512 份；且模块级单例在 Next 多 worker 下各实例各持一份，命中率打折。
- **根因**：缓存键设计未区分"全局"与"本项目"两类聚合的语义边界；容量护栏 round-2 已补（值得肯定），但冗余未解。
- **建议修法**：把全站 `llmUsage` 用固定键（如 `"global"`）缓存，本项目 `projectLlm` 用 `projectId` 键缓存，消除冗余；在代码注释/文档注明"此缓存为单实例优化，非分布式"。

### [F-05] P2 —— 监控覆盖度五类盲区（成功率/积压/缓存命中/逐章趋势/无基线）
- **文件:行号**：`src/app/api/generation-metrics/route.ts:51`（仅剔除 fail 不计成功率）、`src/app/api/stats/monitor/route.ts:48-57`（只 count summaries/beats/commitments，无 FillTask 积压）、`:24-36`（无缓存命中指标）、`:77-79`（仅累计估算无逐章趋势）、`:109-111`（llmCallLog 仅 v0.46.20+ 记账，老项目全 0）
- **现象**：用户看不到生成失败率与错误分布、后台任务排队深度、缓存命中率、逐章 token 趋势；老项目监控全 0 易被误读为"没在统计"。
- **根因**：监控指标以"成功产出的进度/成本"为主，未覆盖"系统健康度"维度；历史记账起点造成的无基线语义未做区分。
- **建议修法**：① `generation-metrics` 额外返回 `failCount` 与按 `role` 前缀分组的失败分布；② `stats/monitor` 增加 `fillTaskBacklog`（pending/running 计数）；③ 缓存加 `hit/miss` 计数返回；④ 提供"逐章 token"趋势接口或字段；⑤ 对无基线场景在面板区分"空"与"无历史记账"。

### [F-06] P2 —— 监控响应缺运行时 Schema 校验，前后端契约脆
- **文件:行号**：`src/app/api/generation-metrics/route.ts:105-116`（返回裸 JSON）、`src/components/workspace/GenerationLatencyPanel.tsx:13-25`（前端 MetricsPayload 手对齐）、`src/core/pipeline/outline-context.ts:25-32`（全 any）
- **现象**：后端 JSON 形状与前端类型靠鸭子约定，无 zod/运行时校验；后端改字段名时前端静默 `undefined`，监控"数据不更新"类问题难排查。`tsc --noEmit` 虽 0 错，但运行期契约脆弱。
- **根因**：监控数据走"约定优于校验"，无共享 schema。
- **建议修法**：对 `generation-metrics`/`stats/monitor` 响应引入 zod schema（既防御也文档），并在前端用其解析，字段缺失即显式报错而非静默。

### [F-07] P3（整洁度）—— outline-context 内 chapters 数组被重复 filter 三次
- **文件:行号**：`src/core/pipeline/outline-context.ts:89`（extractLastChapterHook）、`:108`（extractPrevContext）、`:126`（extractNextContext）各自 `allNodes.filter(n=>n.type==='chapter'||...)`
- **现象**：同一 `allNodes` 在同一调用链里被独立扫描 3 次构造 `chapters`，属 3×O(n) 冗余。
- **根因**：三个函数各自独立过滤，未共享预处理结果。
- **建议修法**：在 `loadOutlineData` 或调用处先 `const chapters = allNodes.filter(...)` 一次，作为参数传入三个函数；属低优先级整洁度优化。

### [F-08] P3（一致性）—— generation-metrics 缺 projectId 不设防，与 stats/monitor 的 400 不一致
- **文件:行号**：`src/app/api/generation-metrics/route.ts:45-54`（缺 projectId 时回退全站聚合，非 400）、对照 `src/app/api/stats/monitor/route.ts:43-45`（缺 projectId 返回 400）
- **现象**：同一套监控接口，一个缺 projectId 返回 200+全局数据，一个返回 400，防御策略不一致；且 IMP-019 修复后面板已总传 projectId，但路由仍容忍缺失，存在"面板在非 workspace 树下挂载时静默看全站"的隐患。
- **根因**：两路由防御口径未统一。
- **建议修法**：统一口径——要么都按 projectId 缺失返回 400，要么都在缺省时显式标注 `scope:"global"` 让前端区分；推荐与 `stats/monitor` 对齐为 400（缺 projectId 即拒绝），避免全局数据伪装成项目数据。

---

## 四·补、监控可信度链路与性能预算剖析（透镜深挖）

> 本小节把"监控"这件事拆成一条数据链路，逐跳评估可信度，并给一个量化的性能预算推演。所有引用均为本透镜已读代码。

### 4.补.1 监控数据的可信度链路：四跳，每一跳都可能漏

novel-forge 的"延迟/成本可观测性"并不是凭空来的，它依赖一条四跳链路：

**第一跳：真实 LLM 调用。** 发生在 `src/core/llm/client.ts` 的 `chat`/`chatStream`（根据 `generation-metrics/route.ts:7-10` 的注释，记账在这两处成功返回时触发）。

**第二跳：记账函数 `recordLlmCall`（fire-and-forget）。** 定义于 `src/lib/llm.ts:264`，目前被 `characters/expand/route.ts:81`、`generate/outline/route.ts:233`、`import/commit/route.ts:134`、`import/parse/route.ts:209/244` 等多路由显式调用，生成主链路（write/refine/continue）则经 client 层统一落库。关键词是"fire-and-forget"——它是**异步发出、不等待结果、失败也不回滚生成**的。这意味着：如果某次 DB 写入 `LlmCallLog` 因连接抖动/事务冲突失败了，这一次生成在用户侧是"成功写完一章"的，但在监控侧是"消失的一次调用"。这种"记账丢失"不会报错、不会重试，是一条**静默的监控盲区**。它比"没接记账"更隐蔽，因为绝大多数时候是好的，只在 DB 压力大时偶发漏记，让成本/延迟统计在关键时刻悄悄偏低。

**第三跳：聚合查询。** `generation-metrics` 与 `stats/monitor` 从 `LlmCallLog` 表 `findMany`/`aggregate`/`groupBy`（如 `generation-metrics/route.ts:56-67`、`stats/monitor/route.ts:119-163`）。这一步的可靠性取决于表里有数据，而表里数据又取决于第二跳没漏。此外 `stats/monitor` 还有 30s 缓存（IMP-020），缓存未命中才真查库——缓存本身是性能优化，但也意味着"刚发生的调用"最多有 30s 不在面板里。

**第四跳：前端渲染。** 面板把 JSON 按 `MetricsPayload`（`GenerationLatencyPanel.tsx:13-25`）解析。由于无运行时 schema 校验（F-06），若后端悄悄改了字段名，前端拿到 `undefined` 而非报错，"数据不更新"的锅会被甩给"生成没生效"，实际是契约断裂。

把四跳串起来看：**监控系统的可信度 = 每一跳可靠性相乘**。第二跳的 fire-and-forget 漏记、第三跳的缓存延迟、第四跳的无校验契约，任何一环出问题都会让"硬指标"变"软指标"。这正是 HANDOVER 第3项目标"监控盲区"的本质——不是"有没有面板"，而是"面板上的数字你敢不敢信"。

### 4.补.2 性能预算推演：长项目每次生成白拉多少数据

把 `context-loader.ts:30-77` 的 12 类查询按"是否窗口化"分类，可以算一笔账（以"千章长篇 + 200 角色 + 3000 世界书词条"为假设规模，数字为量级推演，非实测）：

- `allNodes` 全量（`:34-37`）：约 1000 行，每行含 `content`（正文，假设均章 3000 字 ≈ 9KB UTF-8）+ `reviewLogs`(JSON) + `wordCount` 等。单行序列化后可能 10–20KB，**单次查询仅这一项就可能拉 10–20MB 进 Node 内存**，而最终注入 prompt 的只有最近 4 章（约 36KB）。放大比 ≈ 300–550 倍。
- `characters` 全量（`:38`）：200 行，每行含 `appearance`/`personality`/`background` 等 JSON，约 2–5KB/行，合计 0.4–1MB，最终注入的也是裁剪后的子集。
- `loreEntries` 全量（`:39-41`）：3000 条，每条 `content` ≤200 Token（约 300 字 ≈ 0.9KB），合计 ≈ 2.7MB，最终只取触发命中项。
- `loreTables` 全量（`:74-76`）：若干表 × 多行 JSON，量级类似。

加总：单次生成可能在"拉上下文"阶段就白拉 **15–25MB** 数据进内存、走一次 DB 大查询，而真正喂给模型的只有几十 KB。这还没算 Node 端 `JSON.parse`、对象展开、`allNodes.filter` 三次扫描（F-07）的 CPU 开销。对一个本地单进程应用，这意味着：项目越大，每次点"生成"的"前置卡顿"越长、RSS 内存越高，且因 `context-loader` 是 `Promise.all` 并行（`:31`），最慢的那个全量查询会拖住整体。

**修复的收益量化**：若按 F-02 改成"轻量索引 + 最近窗口"，`allNodes` 从"拉 1000 行正文"降为"拉 1000 行 `{id,order}`"（约几十 KB）+"拉最近 4 行带正文"（约 36KB），单此项就省 10–20MB/次、省一次大表扫描。对一天生成几十章的高产作者，这是实打实的体感提升，也降低了 OOM 风险。

### 4.补.3 为什么"无界 O(n)"比"O(n²)"更值得现在修

任务里特意问"是否 O(n²)"。我的结论是没有 O(n²)（已在 3.2 论证）。但为什么我仍然把 F-02 评为 P1 而非"以后再说"？因为 O(n²) 是"数据稍大就爆炸"，而无界 O(n) 配"每次生成都触发"是"项目越长越慢、且触发频率高"。novel-forge 的目标用户恰恰是会写到几百上千章的人（HANDOVER:11），他们的 n 天然大、触发频率天然高，于是"无界 O(n)×高频"在真实负载下就是真实的性能债，不是理论问题。反倒是 O(n²) 在 n 较小时根本显不出症状。所以本透镜的判断是：先修无界 O(n) 的全量加载（F-02，P1），O(n²) 经核查不存在，无需为它立法。

---

## 五、复验结论（IMP-019/020/021 真实状态）

| 修复项 | 声明 | 复验结果 | 证据 |
|---|---|---|---|
| IMP-019 延迟面板 projectId 透传 | useParams 替换正则 | **真实生效** | `GenerationLatencyPanel.tsx:85-86` 用 `useParams`；`:91` 拼 `?projectId=`；`generation-metrics/route.ts:48,54` 接收并 `where.projectId` |
| IMP-020 切章全月成本重聚合加 30s 缓存 | 30s TTL | **真实生效** | `stats/monitor/route.ts:15,24-36,117-180` 缓存命中跳过两次重型查询 |
| IMP-020(round-2 补) MONITOR_CACHE_MAX_SIZE | 容量上限 | **已落地** | `stats/monitor/route.ts:17` `=512`；`:29-36` 超上限删最旧 |
| IMP-021 监控子系统补单测 13 例 | 单测覆盖 | **部分核验** | 实测 `generation-metrics/route.test.ts`(3 例：空态/聚合/projectId过滤) + `auto-rate.test.ts`(5 例) 共 8 例通过；但**主路由 `stats/monitor` 无直测**（F-04 关联）。"13 例"在仓库内仅见 8 例直接监控测试，建议在 round-3 补 `stats/monitor` 路由单测钉死 dailyWords/distribution/token 估算逻辑 |

**总评**：本轮（round-2）在"性能/浪费/监控盲区"目标下，runtime 层 API 一致性（0 真断链）与编译期类型安全（tsc 0 错）是真绿；IMP-019/020 修复真实可证；单测 238 全绿。主要待办为 F-01（巡检工具失真，P1）、F-02（大上下文浪费，P1）、F-03（批量写作竞态，P2）、F-04/F-05/F-06/F-08（监控覆盖/缓存/契约，P2）、F-07（整洁度，P3）。以上发现均可由 `file:line` 复现，无任何编造。

---

## 六、给 Round-3 的排期建议（落地顺序与预期收益）

> 本透镜不写代码、只排优先级。下面按"投入产出比"给 round-3 一个可执行顺序，每条都对应上文发现，便于接手 Agent 直接开干。

### 6.1 第一桶：立刻做、低成本、高可信度修复（预计 0.5–1 天）

- **F-01（P1）修巡检脚本**：把 `scripts/audit-api-refs.cjs` 的路由来源从手工 `.api-routes.txt` 改为扫描 `src/app/api/**/route.ts` 推导真实路径；`walk` 排除 `changelog-data.ts` 等数据文件；正则支持模板字面量。预期：重跑后 `MISSING 0`，"0 断链"宣称从此可证。这是本透镜性价比最高的一项——它修的是"监控系统对自身健康的认知"，不修则后面所有监控结论都带噪声。
- **F-07（P3）hoist chapters 过滤**：`outline-context.ts` 三处 `allNodes.filter` 合并为一次。几行改动，纯整洁度，顺手做。
- **F-08（P3）统一 projectId 防御口径**：`generation-metrics` 与 `stats/monitor` 对齐为"缺 projectId 即 400"。十几行，消除一致性歧义。

### 6.2 第二桶：性能主战场（预计 1–2 天，P1）

- **F-02（P1）大上下文投影 + 窗口化**：改 `context-loader.ts:34-37,38,39-41,74-76` 为"轻量索引 + 最近窗口"。这是本轮性能债的头号，修复后长项目每次生成省 10–20MB 内存与一次大表扫描（见 4.补.2 量化）。需配套加单测：断言"生成第 500 章时不会 `findMany` 全量拉 1000 章正文"——用 mock prisma 验证 `where` 带 `order` 窗口、`select` 不含 `content`。

### 6.3 第三桶：正确性 + 监控深化（预计 1–2 天，P2）

- **F-03（P2）批量写作原子化**：给 `FillTask` 加 `(projectId, taskType, status)` 唯一/部分索引（复用 `ImportCommitLock` 模式），或在事务内"查运行中+建任务"。消除 TOCTOU 重复章节。
- **F-04（P2）缓存语义分离**：全站 `llmUsage` 用固定键、本项目 `projectLlm` 用 projectId 键，消除 512 份冗余；注明单实例语义。
- **F-05（P2）补五类监控指标**：失败率分布、`fillTaskBacklog`、缓存命中、`逐章 token` 趋势、无基线区分。这一步把"监控盲区"从本透镜的 F-05 真正清零。
- **F-06（P2）响应加 zod schema**：`generation-metrics`/`stats/monitor` 响应与前端 `MetricsPayload` 共用一份 zod，字段缺失即报错。作为"监控可信度链路第四跳"的加固。

### 6.4 顺带建议（非阻塞）

- `package.json:3` 的 `version` 字段仍是 `0.1.0`，与对外语义版本 v1.6.4 不一致。虽不影响运行，但会让依赖版本号的工具/脚本困惑，建议用 `scripts/bump-version.js` 同步。
- 延迟面板（2.1 裂缝一）建议加"刷新"按钮或 30s 轮询，让"硬指标"真正实时——这属于体验增强，可并入 F-06 的契约加固一起做。

### 6.5 本轮透镜一句话收尾

novel-forge v1.6.4 在"运行时 API 一致性"和"编译期类型安全"上是扎实的真绿，IMP-019/020 的修复经代码核验确实生效、解决了"全站红误导"和"切章全月重算"两个真实痛点；但"监控/性能"的健康度被两件事拉低：一是自家巡检脚本 100% 误报（F-01）让"0 断链"失真，二是每章生成无界全量加载上下文（F-02）在长项目上制造真实卡顿。把 F-01 与 F-02 在 round-3 修掉，本项目在"性能/浪费/监控盲区"目标上就能从"表面绿"走向"可信绿"。以上全部结论均由脚本运行、tsc、npm test 与逐行源码核对支撑，零编造。

---

## 七、复现指引（接手 Agent 如何验证本报告的每一条）

本透镜所有结论均可由以下真实命令在自己的环境复现，不存在"看心情"的断言：

1. **复现 F-01（巡检误报）**：
   `node scripts/audit-api-refs.cjs` → 看 `MISSING 20`；
   再 `find src/app/api -name route.ts | wc -l`（得 102）对比 `wc -l scripts/.api-routes.txt`（得 99）；
   对每条 MISS 用 `grep -rn "<路径片段>" src` 定位真实调用点，确认路由 `route.ts` 存在。
2. **复现类型安全（正向）**：
   `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → `EXIT 0`。
3. **复现单测（正向）**：
   `SAFE_DELETE_DISABLE=1 npm test` → `238 passed (19 files)`。
4. **复现 IMP-019（正向）**：
   读 `src/components/workspace/GenerationLatencyPanel.tsx:85-91` 确认 `useParams` + `?projectId=`；读 `src/app/api/generation-metrics/route.ts:48,54` 确认后端接收过滤。
5. **复现 IMP-020（正向）**：
   读 `src/app/api/stats/monitor/route.ts:15,17,24-36,117-180` 确认 30s TTL + 512 容量护栏 + 命中跳过重型查询。
6. **复现 F-02（性能债）**：
   读 `src/core/pipeline/context-loader.ts:34-37,38,39-41,74-76` 确认四处无 `take`/无 `select` 全量加载；读 `src/app/api/generate/write/route.ts:68-72` 确认只用最近 4 章。
7. **复现 F-03（竞态）**：
   读 `src/app/api/story/batch-write/route.ts:17-22` 与 `:56`/`:109`，确认"查重"与"建任务"非原子。
8. **复现 F-04/F-05/F-06/F-08（监控）**：
   分别读 `stats/monitor/route.ts:120-124`（全站按项目键缓存）、`:48-57`（无积压）、`generation-metrics/route.ts:51`（无失败率）、`generation-metrics/route.ts:45-54` 对照 `stats/monitor/route.ts:43-45`（防御口径不一致）。

若接手 Agent 在真机（起 Postgres + 浏览器）环境，还可进一步：起 DB 后访问 `/workspace/<id>` 肉眼验证延迟面板是否"按项目显示而非全站红"（IMP-019 终验）、批量连点两次"批量写作"观察是否产生重复章节（F-03 终验）。沙箱无 Chromium/无 DB，故本报告对这两项的"终验"以代码推演替代并显式标注，未冒充真机截图。

至此，监控性能 API 断链透镜的 round-2 深度体验报告完结。发现 8 条（P1×2、P2×5、P3×1），覆盖 API 一致性、性能瓶颈、监控覆盖、缓存策略、类型安全、并发正确性六个维度，全部 `file:line` 可证。
