# 深度体验报告 · 监控 / 性能 / 可观测透镜

> 本轮（round-1）六透镜之一：**监控 / 性能 / 可观测**。
> 诚实边界：本报告所有结论均基于真实代码阅读（`Read`/`Grep`/`Glob`）、真实测试运行（`npm test` 输出）、以及对运行实例的真实探测（`curl`），未编造任何现象或测试数据。确实无法真机命中接口的部分，已在「验证方法与环境说明」中如实标注。

---

## 报告头（必填）

- **Agent 代号 / 透镜职责**：`lens-monitor` —— 监控 / 性能 / 可观测透镜（MaxLoop 魔王系统开会子 Agent）
- **所属轮次**：round-1
- **体验对象**：Novel Forge（AI 小说工坊）v1.0.0 正式版（git HEAD = `0dbe0e9`，已提交未推送）；入口为本地 Next.js 开发服务器 `http://127.0.0.1:3001`，工作副本 `C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- **日期**：2026-08-05

---

## 验证方法与环境说明（诚实边界前置）

1. **静态精读**：完整阅读了监控透镜覆盖的全部核心文件（见下文「精读清单」）。
2. **测试运行**：`npm test` → `vitest run`，结果 **14 个测试文件、203 个用例全部通过（Duration 1.08s）**。需注意：这 203 个用例里**没有任何一个**覆盖监控子系统本身（详见发现 [P1-3]）。
3. **真机探测（先受限、后补跑）**：初测时 dev server 在 3001 返回首页 `200`，但 `/api/generation-metrics`、`/api/narrative-energy`、`/api/stats/monitor` 乃至核心路由 `/api/projects` 探测**全部返回 `404`**（响应体是 Novel Forge 自身的 404 HTML）。经 team-lead 确认这是占用 3001 的 stale 进程所致，并已杀掉重启。环境修复后我补跑了真实 HTTP 验证（见文末「真机验证补跑附录」），**原 [P2-13] 环境阻塞已解除**，下列发现已获端到端实证：[P1-1]（全局冒充项目数据）、[P2-4]（byProject 白算）、confirmStats/autoRate 闭环正确性。其余未单独点名的结论仍以静态分析为准，但接口已确认可正常返回。

### 精读清单（均已 Read）

- `src/app/api/generation-metrics/route.ts`（生成延迟硬指标聚合）
- `src/components/workspace/GenerationLatencyPanel.tsx`（生成延迟面板）
- `src/components/workspace/MonitorPanel.tsx`（节点监测 / 项目概览面板）
- `src/components/workspace/NarrativeEnergyPanel.tsx`（叙事能量曲线面板）
- `src/components/workspace/RightPanel.tsx`（右栏三 tab + 监测三面板折叠逻辑）
- `src/app/api/narrative-energy/route.ts` + `src/core/narrative-energy.ts`（能量曲线核心）
- `src/app/api/stats/monitor/route.ts`（监测面板聚合数据源）
- `src/core/confirm-guard.ts` + `src/core/confirm-guard.test.ts`（auto-confirm 护栏与单测）
- `src/core/llm/client.ts`（LlmCallLog 计时埋点 recordLlmCall）
- `prisma/schema.prisma`（`LlmCallLog` / `ChapterSummary` / `StoryNode` 模型与索引）
- `scripts/agent-smart-deliver-verify.cjs`（智能交付闭环验证脚本，断言 autoRate=100%）

---

# 第一部分：用户体验视角（约 5600 字）

> 视角设定：我是一名正在用 Novel Forge 写长篇小说的真实作者，右手边开着「监测」面板，想知道「我的书写节奏好不好、生成快不快、AI 花了多少钱、自动确认靠不靠谱」。以下按「我实际会怎么操作、看到什么、是否易懂」逐条记录。

## 1. 进入监测面板：默认折叠的「历史减法」

我打开一个项目，点开右侧三 tab 里的「监测」。映入眼帘的不是数据，而是**三个可点击的折叠标题**：叙事能量曲线、生成延迟、节点监测（`RightPanel.tsx:151-170`）。默认全部收起（`openSections` 初始为空对象），而且代码里有明确注释「三面板默认折叠，按需展开；折叠时不挂载子组件以省 fetch」。

从「历史减法」的产品哲学看，这是合理的——避免一进页面就被四五个面板刷屏。但站在监控透镜的可观测性角度，这带来一个**可见性缺口**：可观测闭环默认是「关着的」。一个新用户如果不逐一点开这三个标题，根本不知道系统还提供了能量曲线、延迟硬指标、成本看板这些能力。点开后才触发 `useEffect` 里的 `fetch`。也就是说，**监测数据是「按需抓取」而非「常驻可见」**。

对比顶栏底部那一行常驻的「总字数 / 角色 / 词条 / 节点」（`RightPanel.tsx:177-181`）——那是永远可见的。监控透镜的核心三面板却藏在折叠里。我理解减法，但建议至少在「监测」tab 顶部给一行最关键的实时摘要（例如「近 300 次生成 P95 1.8s · 本周写 1.2 万字 · 自动放行率 60%」），让可观测性至少有一条「默认睁开的眼睛」。

## 2. 叙事能量曲线：好看，但「峰谷标注」在边缘会被切掉

点开「叙事能量曲线」，加载态是「加载叙事能量曲线...」一行灰字，很快变成一张 SVG 折线图（`NarrativeEnergyPanel.tsx:93-166`）。

**直观感受**：折线 + 半透明面积填充 + 0.5 能量基线虚线，视觉是干净的。顶部三格「均值 / 峰值 / 谷值」用「第 N 章」呈现，对作者很友好——不用懂什么是归一化能量，直接告诉你「高潮在第 7 章、低谷在第 3 章」。底部「节奏诊断」给出自然语言建议（如「张力起伏过平，建议在过渡章穿插转折」、「存在连续 3 章走低的段落，可能带来读者流失风险」）。这一块的**产品价值是实打实的**，它把抽象的「写得好不好」量化成了可对照的曲线和诊断，而且零 LLM、零成本、确定性强，这点我非常认可。

**但有两个真实问题**：

（1）**边缘标注被裁切**。viewBox 是固定的 `0 0 300 130`（`NarrativeEnergyPanel.tsx:116`）。峰值/谷值标注用 `textAnchor="middle"`，坐标 `x(peak.index)`。当峰值恰好落在最后一章（`index = n-1`）时，`x = PAD.l + plotW = 26 + (300-26-12) = 288`；标注文字「峰 0.95」以 288 为中心，向右延伸到约 303，**超出了 viewBox 右边界 300，文字右侧被 SVG 裁掉**（见发现 [P2-5]）。我实测读代码确认：末章若是峰值，作者看到的就是一个被切掉半个字的「峰 0.9…」。这是个低烈度但真实存在的渲染 bug。

（2）**加载失败被伪装成「无数据」**。代码逻辑是：`res.ok` 时才 `setData`；`catch` 里只 `console.warn` 一句，然后 `setLoading(false)`，此时 `data` 仍是 `null`。而渲染分支 `if (!data || data.points.length === 0)` 会显示「暂无章节摘要数据。先写几章正文…」（`NarrativeEnergyPanel.tsx:67-76`）。也就是说，**如果接口挂了 / 网络断了，用户看到的不是「加载失败」，而是「你还没写章节」**。这种把「错误态」吞进「空态」的做法对用户是误导——他可能以为是自己数据不够，而不会去怀疑服务（见发现 [P2-6]）。理想做法是区分 `loading / error / empty` 三态。

另外，能量曲线依赖 `ChapterSummary`。如果作者从未触发过章节摘要生成（摘要是某些流水线步骤的产物），曲线就永远是空态文案。这一点面板文案已经诚实说明，给好评。

## 3. 生成延迟面板：硬指标很好，但「它是全站的，不是本项目的」

点开「生成延迟」，面板标题下方有一行小字「智能体团队硬指标」，立刻传递了严肃性。加载后是四格指标：**首 token / 总延迟 P95 / 吞吐 / 样本**，下面还有「本地 vs 云端（总延迟 P95）」对比条，以及一段解释文字（见 `GenerationLatencyPanel.tsx:125-178`）。

**优点**：
- 「总延迟 P95 超过 2s 阈值」时会弹出红色告警块（`overThreshold`），文案直接说「按『超过两秒就是失败』原则，生成链路偏慢」，并建议切本地推理。这条规则与产品团队「延迟当硬指标」的铁律一致，且**红色标红阈值 2s 的视觉是直观的**——不用解释，作者一看红色就知道「慢了」。
- 解释文字写得通俗：「首 token = 流式到首个字」「吞吐 = 输出速度 tok/s」「本地推理 = Ollama 本机 GPU，零网络往返；云端 = DeepSeek / 硅基流动等 API」。对非技术作者，**术语被翻译成了人话**，这是这个面板做得最好的一点。
- 空态文案也很好：「尚无生成记录。生成任意正文 / 摘要后，这里会显示真实耗时分布…」——明确告诉用户「现在没数据是正常的」。

**致命的语义错位（见发现 [P1-1]）**：面板请求的接口是 `/api/generation-metrics`，**没有带 `projectId`**（`GenerationLatencyPanel.tsx:82`）。而 `generation-metrics/route.ts:48` 里 `projectId` 是可选的——不传就聚合**全站所有项目、所有时间的 LlmCallLog（取最近 300 条）**。于是出现一个诡异场景：我在一个只有 3 章、全是本地 Ollama 推理的小项目里打开「生成延迟」，看到的 P95 可能混入了另一个项目走云端 API 的慢调用，甚至 `overThreshold` 的红告警也可能来自别的项目。面板身处「某项目」的上下文，展示的却是全站数据——**用户以为在看自己这本书的生成速度，实际在看全站平均速度**。本地 vs 云端那条对比也因此失真。这是监控透镜里最该修的一条。

**另一个数据盲区（见发现 [P2-1]）**：「首 token」这一格，如果作者的生成走的不是流式（`chatStream`）而是同步 `chat()`，那么 `recordLlmCall` 在同步路径根本没传 `firstTokenMs`（`client.ts:403-412`），该字段为 `null`，面板就显示「—」。换言之，**非流式生成越多，「首 token」越可能是横杠**，即使系统明明生成过很多次。面板标签写「首 token」却可能恒为「—」，作者会困惑「为什么我的首 token 永远是 —」。

还有一个**度量口径偏差（见发现 [P2-2]）**：`durationMs` 的起点 `start` 设在 `chat()` 入口（`client.ts:395`），而不是某次成功 attempt 的起点。一次「先失败 1 次、再成功」的调用，它的 `durationMs` 包含了那次失败 attempt 的耗时。面板文案自己也写「含重试全链路」。这没问题，但意味着这个「总延迟 P95」量的是「到最终成功的总耗时」，不是「模型本身的生成速度」。当作者看到红色 2s 告警时，有可能是模型快、但中途一次网络抖动拖慢了——口径需要讲清楚，否则「超过两秒就是失败」会被误读为「模型不行」。

## 4. 节点监测面板：信息密度高，但「节点监测」这名不对实

点开「节点监测」，这是信息量最大的一块（`MonitorPanel.tsx`）。从上到下依次是：字数概览（总字数 / 完成率 / 当前章 / 均章字数）、确认流程看板（待确认 / 已确认定稿 / 智能自动放行 / 人工确认 / 整本确认进度条）、Token 估算、AI 成本看板（全项目·本月 + 当前项目·本月）、章节分布、数据记录、写作节奏（近 7 天柱状图）、每日目标（环形进度 + 近 7 天打卡）。

**优点**：
- 「确认流程」看板把 `autoConfirmed`（智能自动放行）和 `autoRate`（占比）单独拎出来（`MonitorPanel.tsx:105-110`），配合 `stats/monitor/route.ts:41-47` 里基于 `reviewLogs` 中 `action === "auto-confirm"` 的统计——**自动确认这件事第一次有了可量化的透明度**。作者能直观看到「我这本书 80% 的章节是系统自动放行的，只有 20% 是我人工点的」。这对建立信任很重要。
- 「AI 成本」用 `¥` + `≈ $` 双币种展示，并诚实标注「模型不在价格表」时显示「单价未知」（`MonitorPanel.tsx:140-145`）。没有伪造精确数字，这点克制得好。
- 「写作节奏」近 7 天柱状图 + 每日目标环形进度，是从「写小说」这件事本身出发的设计，作者有感。

**问题一：命名与内容不符（见发现 [P2-11]）**。这个面板叫「节点监测」，但里面 90% 是项目级概览（总字数、成本、章节分布、写作节奏），跟「单个节点（章节）的实时状态监测」关系不大。作者点「节点监测」预期看到「当前这章生成到哪了、卡没卡」，结果看到的是全本项目账单。建议改名「项目概览 / 性能」。

**问题二：本地/云端、成本这些与「当前选中章节」无关的数据，每次切章都重算（见发现 [P1-2]）**。面板 `useEffect` 依赖 `[projectId, nodeId]`（`MonitorPanel.tsx:57-71`）。`nodeId` 是「当前选中章节」。每当我点开另一章，`nodeId` 变 → 整个 `/api/stats/monitor` 重新拉取。而该接口里**本月全量的 `llmCallLog` 聚合（4 次查询：全局 aggregate + 全局 groupBy model + 项目 aggregate + 项目 groupBy projectId）** 和 `nodeId` 毫无关系（`stats/monitor/route.ts:95-153`）。也就是说，**我每点一次章节，系统就重跑一遍全月 AI 成本扫描**。对于只是想换个章节看的作者，这是无谓的等待和数据库压力。更糟的是，其中 `projectLlm.byProject`（按 projectId 分组的 groupBy）算出来后**前端根本没用到**（MonitorPanel 只取了 `projectLlm.totalCalls/totalTokens/cost` 和全局 `llmUsage.totalTokens` 算占比），等于白查一次（见发现 [P2-4]）。

**问题三：Token 估算是「拍脑袋」式的（可接受但需讲清）**。面板里「生成 Token ≈ 总字数 ×0.8」「Prompt ≈ 生成 ×2.5」（`stats/monitor/route.ts:57-59`），文案已注明「基于字数估算…精确值需启用 token 日志」。诚实，但作者看到「Token 估算 1.2M」时未必意识到这是推导值而非实测值。考虑到 `LlmCallLog` 里其实有真实的 `promptTokens/completionTokens`，这里完全可以用真实聚合替代估算——只是当前 `client` 层不总是带 `projectId` 落库，导致无法精确 per-project。这是数据一致性上的「能更准却没更准」。

**问题四：每日目标存在 localStorage，换设备/清缓存即丢**。目标存在 `nf-daily-goal-${projectId}`（`MonitorPanel.tsx:50, 266`），纯前端。小问题，但作者跨设备写作时目标不同步，略坑。

## 5. 文案总体观感（本透镜内）

监控透镜的文案整体是**六透镜里最克制、最说人话的**：「超过两秒就是失败」「本地推理零网络往返」「模型不在价格表」这类表达，把工程指标翻译成了作者能懂的话。错字/语病我没发现。主要的文案问题是**语义错位**（全局数据说成本地、面板名不副实），属于「信息架构」层面而非字面错误。

---

# 第二部分：总体视角（约 4600 字）

> 跳出单个用户，从架构、可维护性、可靠性、性能与数据一致性审视监控子系统整体。

## 1. 可观测闭环是否成立？

**部分成立，且有实质亮点。** Novel Forge 在 v1.0.0 把「可观测」做成了产品功能而非运维附属：能量曲线（创作质量维度）、生成延迟（性能维度）、成本/确认看板（经营维度）三者齐全，且能量曲线与延迟都强调「零 LLM、确定性、可单测」——这是非常健康的工程取向，意味着监控本身不会成为新的失败源或成本源。

**但闭环有两个断点**：
- 断点 A：**默认不可见**（第一部分已述）。可观测性如果默认关闭，等于「装了监控但没人看」。
- 断点 B：**度量口径跨层不一致**。延迟聚合来自 `LlmCallLog`（client 层落库），但 client 层「不持有 project 上下文」（`stats/monitor/route.ts:89-91` 注释自己也承认），导致 per-project 精确聚合长期做不准；能量曲线来自 `ChapterSummary`，而摘要只在部分流水线触发。两套数据源的生命周期不一致，作者在不同阶段看到的面板「时有时无」，闭环体验是断裂的。

## 2. 数据是否「确定可用」？

给出一个偏谨慎的判断：**核心逻辑可用，但「可验证性」薄弱（见发现 [P1-3]）**。

- `computeNarrativeEnergy` 有完整的 `try/catch` 兜底返回空结构（`narrative-energy.ts:138-150`），`narrative-energy/route.ts` 也有 `try/catch` 返回 500——**不会因单点异常拖垮页面**，这是「确定可用」的底线保障，做得好。
- `generation-metrics` 同样 `try/catch` 返回 500（`:117-122`），且把失败记账（`role` 以 `fail:` 前缀）排除在延迟统计之外——**避免失败重试拉高 P95 失真**，设计意图正确。
- 但是：**整个监控子系统没有任何自动化测试**。`npm test` 的 203 个用例覆盖了 entity-detector、game-engine、confirm-guard、regex 防护、import 等，但 `generation-metrics`、`narrative-energy`、`stats/monitor` 三个路由，以及 `GenerationLatencyPanel`、`MonitorPanel`、`NarrativeEnergyPanel` 三个组件，**零用例**。`confirm-guard` 虽有 10 个单测（且质量不错，覆盖了 NaN 分数、机械重复、空正文拦截等边界），但 `autoRate` 的聚合逻辑（在 `stats/monitor/route.ts:41-47`）只在一个需要联网服务器的 `scripts/agent-smart-deliver-verify.cjs` 里被断言（`autoRate === 100`）。**一旦 `stats/monitor` 的聚合 SQL 改错，单元测试发现不了，只能靠人工跑 cjs 脚本且还得有一个正常服务的服务器**——而这个服务器在当前环境恰恰是 404 的（[P2-13]）。可验证性是真问题。

## 3. 指标聚合的复杂度与性能风险

这是监控透镜最该被严肃对待的部分。

**(a) `generation-metrics` 的查询在大表下偏慢（[P1-4]）。** 路由用 `findMany`，`where` 含 `role: { not: { startsWith: "fail:" } }` 与 `durationMs: { not: null }`，`orderBy: { createdAt: "desc" }`，`take: 300`（`generation-metrics/route.ts:50-67`）。`LlmCallLog` 的索引只有单列 `createdAt / projectId / model / role`（`schema.prisma:614-617`），**没有 `(projectId, createdAt)` 复合索引，也没有 `(durationMs not null)` 的部分索引**。Postgres 在执行「按 createdAt 倒序取 300 条、但要求 role 不以 fail: 开头且 durationMs 非空」时，要么走 createdAt 索引逐行回表过滤（大表里要扫很多行才能凑够 300 条命中），要么走 projectId 索引再内存排序。无论哪种，**表越大越慢，且 `take:300` 的「轻量」是假象**。`LlmCallLog` 是只增不删的流水表，没有保留策略，几个月后这张表会非常胖。建议补复合索引 + 部分索引，并为表加 TTL/归档。

**(b) `stats/monitor` 在每次切章时重跑全月聚合（[P1-2]，已在 UX 段详述）。** 本质是「把与节点选择无关的重聚合挂在了 nodeId 这个高频变化依赖上」。即便不切章，单次接口也发 8 条查询（nodes + 3 个 count + 4 个 llmCallLog 聚合），其中 4 条扫描全月 `llmCallLog`。好处是 createdAt 有索引，range scan 尚可控；坏处是**每次打开监测 tab、每次点章都来一轮**，高并发（多开项目/多用户本地多实例少见，但作者快速点章很常见）下是纯浪费。

**(c) 内存与传输膨胀。** `stats/monitor` 的 `nodes` 查询 `select` 包含了 `reviewLogs` 这个 Json 字段（`stats/monitor/route.ts:25`），而 `autoConfirmed` 统计只用到其中 `action === "auto-confirm"`。`reviewLogs` 随每个节点返回，项目节点多时响应体偏大。且代码里大量 `(n as any).reviewLogs` 的 `any` 转型（`:44-46`），类型安全弱。

**(d) `computeNarrativeEnergy` 的摘要全量加载（[P2-8]）。** `chapterSummary.findMany` 不带 `take`，按 `createdAt desc` 取全部，再在 JS 里按 `chapterId` 去重保留最新（`:96-111`）。章节多且每章多版本摘要时，一次性加载全部摘要并不优雅。理想做法是 SQL 层按 chapterId 取每组最新（窗口函数或子查询），而非全量拉回再 JS 去重。

**(e) 并发生成竞争。** `LlmCallLog` 的 `recordLlmCall` 是 fire-and-forget（`client.ts` 注释），落库失败不影响主流程，这本身是对的（监控不能拖慢生成）。但 `applyConfirm` 里的幂等守卫用 `updateMany` + `status in CONFIRMABLE_STATUSES`（`confirm-guard.ts:133-144`），并发二次确认会 `count=0` 跳过——这点处理得当，确认看板的 `autoRate` 不会被并发重复计数。性能与并发层面，确认侧比指标侧更稳。

## 4. 架构边界、重复代码与技术债

- **单一真相源做得好**：`confirm-guard.ts` 顶部注释明确「单一质量阈值真相；批量确认 / 自动确认 / 流水线挂载三处复用」，并 `export QUALITY_PASS_THRESHOLD`。盲测驱动的 `MIN_AUTO_CONFIRM_LENGTH` + 机械重复检测（`confirm-guard.ts:16-27`）也是把「实证结论」固化进代码的范例。这部分架构清晰、无重复。
- **指标聚合散落两处**：`generation-metrics/route.ts` 与 `stats/monitor/route.ts` 都聚合 `LlmCallLog`，前者算延迟分位，后者算成本与调用次数，**两份聚合逻辑未抽取共享函数**。本地/云端判定 `isLocal` 只在前者有（`generation-metrics/route.ts:40-43`），后者没有（也就没做本地/云端成本拆分）。可抽取一个 `aggregateLlmCalls` 工具。
- **类型安全**：监控路由多处 `as any`（`stats/monitor/route.ts`），组件 props 接口定义完整（`MonitorPanel.tsx:13-42` 的 `MonitorData` 接口很规范）。整体类型覆盖偏上，但有局部债。
- **疑似文档与代码脱节（[P2-12]）**：任务说明书要求精读 `computePayoffStats.ts（复用逻辑）`，但全仓库 `grep` 结果里**不存在该文件**（仅 `foreshadowing.ts` 里出现过 "payoff" 字样）。监控相关的「复用逻辑」文件缺失，要么是计划文档笔误，要么是某模块漏建。这属于任务交接层面的信息债，提醒阶段三方案会议时核对。

## 5. 数据一致性风险汇总

- **本地 vs 云端判定脆弱（[P2-3]）**：正则 `/localhost|127\.0\.0\.1|0\.0\.0\.0|:11434/` 匹配 baseURL 任意位置。任何 URL 里出现字符串 `11434`（例如某云网关临时带了该端口号）都会被误判为「本地 Ollama」。Ollama 默认端口确实是 11434，但用「端口号出现在任意位置」做判断太宽。
- **延迟口径含重试（[P2-2]）**：已述，P95 可能高估。
- **首 token 仅流式有（[P2-1]）**：非流式恒「—」。
- **成本 per-project 不精确（[P2-11] 关联）**：client 层不持 project 上下文，per-project 成本靠 `projectId` 落库补全，旧调用无 projectId，因此「当前项目·本月」成本可能漏算历史调用。

---

## 发现清单（结构化，附证据）

> 严重度：P0 阻断 / P1 重要 / P2 轻微。共 4 个 P1 + 13 个 P2。

- **[P1-1] 严重度 P1** ｜ `src/components/workspace/GenerationLatencyPanel.tsx:82` + `src/app/api/generation-metrics/route.ts:48` ｜ **现象**：生成延迟面板 `fetch("/api/generation-metrics")` 未带 `projectId`，route 中 `projectId` 为可选，不传则聚合全站最近 300 条 LlmCallLog；身处某项目上下文却展示全站延迟与 `overThreshold` 红告警。 ｜ **根因**：面板调用方漏传 `projectId`，route 宽松接受全局查询。 ｜ **建议**：面板 fetch 追加 `?projectId=`，route 已支持，无需改后端即可修复语义。

- **[P1-2] 严重度 P1** ｜ `src/components/workspace/MonitorPanel.tsx:57-71` + `src/app/api/stats/monitor/route.ts:95-153` ｜ **现象**：面板 `useEffect` 依赖 `[projectId, nodeId]`，每次切换选中章节都重拉整个监测接口，其中包含 4 次「本月全量 `llmCallLog`」聚合（全局 aggregate/groupBy + 项目 aggregate/groupBy），与 `nodeId` 完全无关。 ｜ **根因**：把 node 无关的重聚合挂在了高频变化的 `nodeId` 依赖上；成本聚合未与节点选择解耦。 ｜ **建议**：将 `llmUsage`/`projectLlm` 拆成独立端点或前端短时缓存，避免切章触发全月扫描。

- **[P1-3] 严重度 P1** ｜ 测试覆盖缺口（`npm test` 203 passed，0 监控用例） ｜ **现象**：`generation-metrics`、`narrative-energy`、`stats/monitor` 三个路由及 `GenerationLatencyPanel`/`MonitorPanel`/`NarrativeEnergyPanel` 三个组件**无任何自动化测试**；`autoRate` 聚合仅在需联网服务器的 `scripts/agent-smart-deliver-verify.cjs` 中断言。 ｜ **根因**：监控子系统为 round 后期新增，测试未跟进。 ｜ **建议**：补 `vitest` 单测，用 mock `prisma` 覆盖分位计算、空数据、本地/云端分组、`autoRate` 统计与边界。

- **[P1-4] 严重度 P1** ｜ `src/app/api/generation-metrics/route.ts:50-67` + `prisma/schema.prisma:614-617` ｜ **现象**：`findMany` 的 `where` 含未索引的 `role not startsWith "fail:"` 与 `durationMs not null`，叠加 `orderBy createdAt desc + take 300`；`LlmCallLog` 仅单列索引，无 `(projectId, createdAt)` 复合索引、`durationMs` 部分索引；流水表只增不删。 ｜ **根因**：索引设计未覆盖该查询的过滤+排序组合，大表下退化为扫描过滤。 ｜ **建议**：加 `(projectId, createdAt)` 复合索引与 `durationMs not null` 部分索引，并为表加保留/TTL 策略。

- **[P2-1] 严重度 P2** ｜ `src/core/llm/client.ts:403-412`（chat 路径无 `firstTokenMs`）vs `:438-467`（chatStream 有） ｜ **现象**：同步 `chat()` 的 `recordLlmCall` 不传 `firstTokenMs`，面板「首 token」对非流式生成恒显示「—」。 ｜ **根因**：首 token 计时仅在流式 `onFirstToken` 回调设置。 ｜ **建议**：同步调用也记录近似首 token，或面板文案注明「仅流式有效」。

- **[P2-2] 严重度 P2** ｜ `src/core/llm/client.ts:395, 441` ｜ **现象**：`durationMs`/`firstTokenMs` 起点设在 `chat()`/`chatStream()` 入口，含失败 attempt 耗时，「总延迟 P95」实为「到最终成功的总耗时」，可能高估并误触 2s 红告警。 ｜ **根因**：计时起点在重试链之外。 ｜ **建议**：仅计时最后一次成功 attempt，或单独记 attempt 级耗时并向用户说明口径。

- **[P2-3] 严重度 P2** ｜ `src/app/api/generation-metrics/route.ts:40-43` ｜ **现象**：`isLocal` 正则 `/localhost|127\.0\.0\.1|0\.0\.0\.0|:11434/` 匹配 baseURL 任意位置，含 `11434` 的云端端点会被误判本地。 ｜ **根因**：用松散字符串匹配判定 provider 类型。 ｜ **建议**：用 URL 主机解析或配置字段 `isLocalProvider` 显式标记。

- **[P2-4] 严重度 P2** ｜ `src/app/api/stats/monitor/route.ts:132-153, 147-153` + `src/components/workspace/MonitorPanel.tsx`（未引用 `byProject`） ｜ **现象**：`projectLlm.byProject`（按 projectId groupBy 全月）计算并返回，但前端从未使用，属一次无用全月聚合。 ｜ **根因**：后端多算、前端未消费。 ｜ **建议**：删除该 groupBy，或前端补「各项目成本占比」展示。

- **[P2-5] 严重度 P2** ｜ `src/components/workspace/NarrativeEnergyPanel.tsx:116, 149-164` ｜ **现象**：viewBox `0 0 300 130` 固定；峰值/谷值标签 `textAnchor="middle"`，末章（`index=n-1`）坐标 `x≈288` 超出右边界 300，文字被裁切。 ｜ **根因**：边缘标签未做对齐翻转。 ｜ **建议**：末章/首章标签改为左/右对齐，或增大 viewBox 横向 padding。

- **[P2-6] 严重度 P2** ｜ `src/components/workspace/NarrativeEnergyPanel.tsx:48-52, 67-76` ｜ **现象**：fetch 失败时 `catch` 仅 `console.warn`，`data` 保持 `null`，渲染落入「暂无章节摘要数据」空态，把错误伪装成无数据。 ｜ **根因**：未区分 `error` 与 `empty` 状态。 ｜ **建议**：增加 `error` 态，明确提示「加载失败，请重试」。

- **[P2-7] 严重度 P2** ｜ `src/core/llm/client.ts:416-424` vs `src/app/api/generation-metrics/route.ts:51` ｜ **现象**：失败记账 `recordLlmCall` 不带 `durationMs`（null），被 route 的 `durationMs not null` 排除；当前靠「失败记账恒 null」这一隐式约定保证过滤正确，若未来失败记账带 durationMs 会漏统计。 ｜ **根因**：过滤依赖隐式约定而非显式字段。 ｜ **建议**：增加 `isFailed` 布尔列或在 role 约定外显式区分。

- **[P2-8] 严重度 P2** ｜ `src/core/narrative-energy.ts:96-111` ｜ **现象**：`chapterSummary.findMany` 不带 `take`，全量拉回后在 JS 按 `chapterId` 去重保留最新；章节多、摘要版本多时一次性加载量大。 ｜ **根因**：去重在应用层而非 SQL 层。 ｜ **建议**：用窗口函数/子查询按 chapterId 取每组最新，或加分页。

- **[P2-9] 严重度 P2** ｜ `src/components/workspace/RightPanel.tsx:151-170` ｜ **现象**：监测三面板默认全部折叠且折叠时不挂载（`mounted=false`），监测数据默认不可见，可观测闭环未默认呈现。 ｜ **根因**：历史减法设计，但牺牲了默认可观测性。 ｜ **建议**：保留折叠，但在「监测」tab 顶部常驻一行关键指标摘要。

- **[P2-10] 严重度 P2** ｜ `src/app/api/stats/monitor/route.ts:22-31, 44-46` ｜ **现象**：`nodes` 查询 `select` 含 `reviewLogs` Json 全量返回，`autoConfirmed` 统计只用其中 `action==="auto-confirm"`；多处 `(n as any).reviewLogs` 转型，类型安全弱、传输体偏大。 ｜ **根因**：为读一个标记拉取整列 Json。 ｜ **建议**：类型化 `reviewLogs`，或单独 select 自动确认标记列。

- **[P2-11] 严重度 P2** ｜ `src/components/workspace/RightPanel.tsx:157` + `src/components/workspace/MonitorPanel.tsx:1-5` ｜ **现象**：面板名为「节点监测」，实际展示总字数/成本/章节分布/写作节奏等**项目级概览**，与「单节点实时状态」语义不符；且成本 per-project 不精确（client 层历史调用无 projectId）。 ｜ **根因**：命名与内容错位。 ｜ **建议**：更名为「项目概览 / 性能」，并在文案区分「估算」与「实测」。

- **[P2-12] 严重度 P2** ｜ 全仓库 grep 结果 ｜ **现象**：任务要求精读的 `computePayoffStats.ts` 在仓库中不存在（仅 `foreshadowing.ts` 出现 "payoff" 字样），监控相关「复用逻辑」文件缺失。 ｜ **根因**：计划文档与代码脱节或漏建。 ｜ **建议**：阶段三方案会议核对是否笔误或漏建模块。

- **[P2-13] 严重度 P2（环境/基础设施 · 已修复）** ｜ 当前运行实例 `http://127.0.0.1:3001` ｜ **现象（初测）**：首页返回 200，但 `/api/generation-metrics`、`/api/narrative-energy`、`/api/stats/monitor` 乃至核心 `/api/projects` 均返回 `404`（响应体为 Novel Forge 自身 404 页），监控接口无法做端到端真机验证。 ｜ **根因（初测）**：占用 3001 的进程其 API 路由清单不含这些 `/api/*`（疑似陈旧构建/不同进程；`.next` 构建时间 08-05 18:19，`dev3002.log` 有 `next dev -p 3001 -p 3002` 端口冲突失败记录）。 ｜ **修复与复测（2026-08-05）**：team-lead 杀掉 stale 进程重启后，所有 `/api/*` 恢复正常（projects→200、generation-metrics→200、stats/monitor→200、narrative-energy→200）。真机验证见文末附录，原阻塞已解除；本发现保留作环境复盘记录。

---

## 真机验证补跑附录（环境修复后，2026-08-05）

> 方法：对 `http://127.0.0.1:3001` 直接发真实 HTTP 请求（urllib/python 与 `node scripts/agent-smart-deliver-verify.cjs`），全部成功返回 JSON，无 404。以下为真实响应摘录（非伪造）。

### A. generation-metrics：实证 [P1-1] 全局冒充项目数据

- **不带 projectId**：`HTTP 200`，`empty=false`，`sampleSize=79`，`overThreshold=True`，`total.p95=33032`（即 **33 秒**）。
  → 面板 `GenerationLatencyPanel` 的 `fetch("/api/generation-metrics")`（无 projectId）会显示**全站 79 次调用、P95 33s、红色「超 2s 阈值」告警**。
- **带 projectId**（取真实项目 `2b94bc31-…`）：`HTTP 200`，`empty=True`，`sampleSize=null`，`total=null`，`byProvider=null`。
  → 同一套代码，传了 projectId 反而空。结合 `LlmCallLog.projectId` 历史上常为空（client 层不持 project 上下文），**per-project 路径几乎总是空，面板因此永远回退到展示全局数据**——[P1-1] 的「身处项目却看全站」被实锤。更危险的是：全局 P95 33s 会让每个项目的用户都看到刺眼的红色「失败」横幅，纯属误导。

### B. stats/monitor：实证 confirmStats/autoRate 正确、[P2-4] byProject 白算

真实项目「游戏轻确认验证」`89a11b4f-…` 响应（节选）：

```
confirmStats = {"pending":0,"confirmed":1,"total":1,"progress":100,"autoConfirmed":1,"autoRate":100}
llmUsage.totalCalls = 282,  llmUsage.totalTokens = 1203404
projectLlm.totalCalls = 1,  projectLlm.has byProject = True
```

- `autoRate=100`、`autoConfirmed=1` 计算正确 → 确认看板的可信度有真机背书。
- `llmUsage.totalCalls=282` 而 `projectLlm.totalCalls=1` → 印证 per-project 成本因历史调用缺 projectId 而严重偏低，数据一致性风险属实。
- `projectLlm.byProject` 确实返回（`has byProject=True`）但前端未渲染 → [P2-4]「白算一次 groupBy」被实锤。

### C. agent-smart-deliver-verify.cjs：实证 autoRate 闭环端到端

运行 `node scripts/agent-smart-deliver-verify.cjs`，**exit=0、输出 `VERIFY_PASS ✓`**，关键行：

```
首次扫描: confirmed= 2 blocked= 1
首次整本交付: 409 还有 1 章未确认，无法整本交付
二次扫描(C改优质): confirmed= 1 blocked= 0
二次整本交付: 200 2026-08-05T14:29:22.032Z
confirmStats: {"pending":0,"confirmed":3,"total":3,"progress":100,"autoConfirmed":3,"autoRate":100}
```

→ auto-confirm 护栏（拦截低质 C、放行 A/B 与改质后的 C）、整本交付 409/200 状态机、`autoRate=100` 聚合三者联动正确。**这同时验证了 [P1-3] 的判断**：该闭环的正确性目前只能靠这个需联网服务器的 cjs 脚本断言，`npm test` 里没有对应单测——逻辑对，但可验证性仍薄弱。

### D. narrative-energy：空态正常

带真实 projectId 请求 `HTTP 200`，`ok=true`，`points=0`，`peak=null` → 无章节摘要时返回空结构、不崩溃，与 `NarrativeEnergyPanel` 的空态分支一致（[P2-6] 的「错误伪装成空」在此样本未触发，因接口本身正常返回空而非报错）。

---

## 总结（本透镜结论）

Novel Forge v1.0.0 的监控/可观测子系统**方向正确、产品化到位**（能量曲线零成本确定性强、延迟硬指标有铁律、成本/确认看板有透明度），但存在三类必须修的短板：**(1) 语义错位**——延迟与成本面板多用全局/估算数据却身处项目上下文（P1-1、P2-11）；**(2) 性能与可验证性**——监控接口缺索引支撑的高频重聚合（P1-2、P1-4）与零自动化测试（P1-3）；**(3) 度量口径一致性**——首 token 仅流式、延迟含重试、本地/云端判定脆弱（P2-1/2/3）。其中最关键的三条是 **P1-1（延迟面板未传 projectId 导致全局数据冒充项目数据）、P1-2（切章触发全月成本重聚合）、P1-3（监控子系统零测试覆盖）**。当前环境 dev server 的 404 也需基础设施层面先解决，否则任何透镜都做不了真机验证。
