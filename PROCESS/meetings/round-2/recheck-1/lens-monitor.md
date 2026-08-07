# 魔王系统 round-2 阶段五复检 · 监控与性能透镜（lens-monitor）

- 复检员：独立代码复检员（monitor 透镜）
- 复检对象：R2-011（API 巡检脚本误报）、R2-012（生成上下文无界全量加载）
- 基线：v1.6.4（HEAD = 2b88e09）
- 方法：Trust but verify —— 逐文件 Grep + Read 当前内容，能实跑的项实跑，诚实标注未实测项
- 报告日期：2026-08-07

---

## 一、两条复检项逐条验证结论

### R2-011（P1）：API 巡检脚本 100% 误报 —— 结论：生效（已真实落地）

**原问题回顾**：整合清单诊断 `scripts/audit-api-refs.cjs` 报 20 个 MISS，但真实断链为 0；其中 6 处为模板字面量截断、13 处为 changelog 文档性字符串、1 处为清单滞后。修复预期为：跳过 `${` 模板插值、白名单跳过 changelog-data.ts、后端路由用 `src/app/api` 文件系统动态发现取并集，跑出 `REAL_BROKEN_LINKS 0`。

**当前文件 `scripts/audit-api-refs.cjs` 关键逻辑（已 Read 全文 140 行）**：

1. 模板插值跳过逻辑（行 92-104）：正则 `/[\`"'](\/api\/[^\`"'?}]+)/g` 提取引用，对捕获的 `k` 做 `if (k.includes("${")) { ignoredTemplate++; continue; }`。即凡路径内含有 `${` 的引用整条忽略，不计入断链核对。这与修复预期一致。
2. 文档性白名单（行 23-24、86-90）：`DOC_FILE_WHITELIST = [/changelog-data\.ts$/]`，在 walk 中对命中白名单的相对路径文件整体 `continue`，计 `ignoredDoc`。`changelog-data.ts` 中的 `/api/` 文案不计入调用。
3. 后端路由双来源取并集（行 27-70）：
   - 来源 1：`loadManifestRoutes()` 读取 `scripts/.api-routes.txt` 静态清单；
   - 来源 2：`discoverFsRoutes()` 从 `src/app/api` 目录递归发现真实 `route.ts/route.tsx` 文件，直接消除「清单滞后」；
   - 最终 `routes = new Set([...loadManifestRoutes(), ...discoverFsRoutes()])`。
4. 交叉核对（行 112-140）：仅当 `routeExists(k)` 为 false 才记 `missing`，并输出 `REAL_BROKEN_LINKS`。`routeExists` 先做精确匹配，再做段数相等的动态段 `[id]` 兼容匹配。

**实跑结果（已执行 `node scripts/audit-api-refs.cjs`，退出码 0）**：

```
TOTAL_REFS 70 REAL_BROKEN_LINKS 0
IGNORED_TEMPLATE_INTERPOLATION 70 IGNORED_DOC_STRINGS 1
```

- `REAL_BROKEN_LINKS 0`：无任何真实断链，原 20 个误报已全部消除。符合修复预期。
- `IGNORED_TEMPLATE_INTERPOLATION 70`：脚本自报跳过 70 处模板插值。我做了独立交叉验证：`grep -rEn "/api/[^\"'\`]*\$\{" src` 计得含 `/api/${` 的行约 87 处；差异源于「一行多匹配只计 1 行」「changelog-data.ts 被白名单跳过不计入」等，量级与 70 一致，证明脚本的模板跳过是真实生效、非伪造。
- `IGNORED_DOC_STRINGS 1`：changelog-data.ts 被整体跳过（计 1 个文件，而非原诊断的 13 条 MISS），符合白名单预期。
- 运行输出无任何 `BROKEN ...` 行，印证报告无虚假 MISS。

**结论**：R2-011 修复真实落地、逻辑闭环、实跑通过。脚本从「100% 误报」变为「REAL_BROKEN_LINKS 0」。

**诚实边界**：实跑是在当前代码树（src 下全部 .ts/.tsx）上进行的，覆盖的是「当前真实存在的路由表」。若后续新增 catch-all 路由或路由组（见新坑清单第 5、6 条），该脚本的匹配逻辑会重新暴露潜在误报——这一点本轮未实测（因当前无此类路由），但属于 R2-011 修复的固有盲区，已在新坑中列出。

---

### R2-012（P1）：生成上下文无界全量加载 —— 结论：主体生效，存在一处功能退化隐患（部分）

**原问题回顾**：整合清单诊断 `src/lib/context-loader.ts` 每次生成拉取全部节点/角色/世界书/表格，长项目白拉 10-20MB。修复预期为：全量节点查询改为轻量 `select`（只取结构字段），按需拉取 `keepWindow（≥5）` 章正文。

**注意**：整合清单原文指向 `src/lib/context-loader.ts`，但当前代码树中该文件实际位于 `src/core/pipeline/context-loader.ts`（写作主流程已统一收敛到 `src/core/pipeline`）。我以当前真实存在的文件 `src/core/pipeline/context-loader.ts` 为复检对象（已 Read 全文 163 行）。

**已落地的修复（逐行确认）**：

1. 轻量 `select`（行 37-51）：`prisma.storyNode.findMany` 改为 `select` 仅取结构字段 `id / parentId / type / title / order / status / branchId / activeLoreIds / activeCharacters`，不再拉 `content` 等重字段。这与「长项目省 10-20MB 无效内存」的预期一致，代码层面已真实落地。
2. 按需补回近期窗口正文（行 99-119）：
   - `keepChapters = (project?.contextKeepChapters) ?? 4`，`keepWindow = Math.max(keepChapters, 5)`（覆盖 continue 硬编码的 -5）；
   - `curIdx = allNodesLight.findIndex(n => n.id === nodeId)`；
   - `prevIds = allNodesLight.slice(Math.max(0, curIdx - keepWindow), curIdx).map(n => n.id)`；
   - `prevFull = prisma.storyNode.findMany({ where: { id: { in: prevIds } } })`（无 select，拉全字段正文）；
   - `allNodes = allNodesLight.map(n => full ? full : n)`，顺序/索引不变，下游无感。
3. 下游消费侧核对（已 Read write/route.ts、refine/route.ts、continue/route.ts、outline-context.ts、assembly/engine.ts、babylore/fill.ts）：
   - write/route.ts:67-72：`previousNodes = allNodes.slice(currentNodeIndex - keepChapters, currentNodeIndex)`，默认 `keepChapters=4`，落在 `keepWindow≥5` 内，故这 4 个紧邻前章有正文。无回归。
   - refine/route.ts:57：同写章，取前 4 章，`keepWindow≥5` 覆盖。无回归。
   - continue/route.ts:90-92：`previousNodes = allNodes.filter(n => n.order <= current.order && n.content).slice(-5)`，取最近 5 个有正文的章；`keepWindow≥5` 保证这 5 章在窗口内。无回归。
   - `babylore/fill.ts:652`：自动填表走独立 `prisma.storyNode.findMany({ where: { projectId, content: { not: null } } })`，不依赖 context-loader 的 allNodes，不受本修复影响。无回归。
   - `assembly/engine.ts:307/366/375`：读取 `window.shortTerm` 滑动窗口的 `n.content`，该窗口由独立数据路径构建（游戏/酒馆模式），非 context-loader 的 allNodes，不受本修复影响。

**结论（主体）**：R2-012 的轻量 select 与按需补回窗口正文两段逻辑均真实落地，write/refine/continue 三个主生成路径的紧邻前文上下文完整保留，未出现「前文缺失导致上下文断裂」的硬回归。

**功能退化隐患（部分）**：见新坑清单第 1 条——`extractPrevContext` 按「章序号」取前 5 章正文，而 `keepWindow` 按「整体节点序号」取前 5 个节点；当项目穿插 `volume/section/scene` 等非章节点时，前 5 章可能超出整体序号窗口，导致 `extractPrevContext` 注入的前文上下文被截断（第 5、第 4 章正文缺失退化为「无」）。该隐患逻辑上已证实，但需在「多卷/多节结构」的真实项目上跑一次 chapter-outline 路由才能确认影响面，故标注为「待实测」。

**诚实边界**：「长项目省 10-20MB」属于内存/IO 量级收益，依赖真实长项目（数百章、每章数 KB 正文）的性能基准才能量化。本轮沙箱无此类数据集，未做基准实测，仅从代码层确认「不再全量拉 content」这一机制成立。该项标注为「未经实测，待验证」。

---

## 二、新坑清单（round-2 未发现、真实存在的新缺陷）

### 新坑 1（R2-012 引入的回归，中危）：keepWindow 按整体序号计，与下游「按章序号取前 N 章」不对齐，多卷项目前文上下文被截断

- 文件:行号：
  - `src/core/pipeline/context-loader.ts:104-109`（keepWindow 用整体节点序号 `curIdx - keepWindow`）
  - `src/core/pipeline/outline-context.ts:118-128`（`extractPrevContext` 默认 `prevCount=5`，按 `chapters`（已过滤 type===chapter||section）数组取前 5 章）
- 问题：R2-012 为省内存，把「全量节点」改为「轻量 select + 窗口内补正文」。窗口 `keepWindow` 以「整体节点 index」度量（min 5），但 `extractPrevContext` 以「章/节数组 index」度量（取前 5 章）。项目若穿插 `volume / section / scene` 等非章节点（已通过 Grep 确认 `volume`、`section`、`scene` 均为真实存在的节点类型），则「前 5 章」对应的整体序号跨度可能 >5。例如第 9 章（整体 index 20）前 5 章可能落在整体 index 14~19，而 keepWindow 只覆盖 15~19，则整体 index 14 的那章（第 4 章）无正文，被 `extractPrevContext` 退化为「无」。修复前全量有正文，5 章均在；修复后该章正文缺失。这是 R2-012「轻量 select 遗漏必要字段致功能退化」的具体表现。
- 影响范围：`extractPrevContext` 服务于 `chapter-outline/route.ts:48` 与 `chapter-outline/draw/route.ts:43`（章节大纲规划），影响大纲质量；`extractLastChapterHook`（取紧邻上一章，在窗口内）与 write/refine/continue（取紧邻前 N 章，在窗口内）均不受影响。
- 复现思路：构造一个含 `volume` 卷节点 + `section` 节节点穿插的多章项目（如 第1卷(volume) → 第1章 → 第2章 → 第2卷(volume) → 第3章 ...），定位到靠后的某一章（其前 5 章与当前章之间至少夹 1 个 volume/section 节点），调用 `loadGenerationContext` + `extractPrevContext`，断言返回的前文上下文包含 5 章的 `contentEnd` 非空；预期会失败（部分章 contentEnd 为「无」）。
- 修复建议：`keepWindow` 应以「章/节节点序号」而非「整体节点序号」度量；或在 `extractPrevContext` 中只取窗口内（有正文的）前 N 章，并把窗口下限放宽到「前 N 章所需的最小整体跨度」（如按章数组 index 反推整体 index 再补拉）。

### 新坑 2（监控自身反模式，中危）：stats/monitor 路由拉取未使用的 reviewLogs 重字段

- 文件:行号：`src/app/api/stats/monitor/route.ts:51`（select 含 `reviewLogs: true`），且全文（行 59-221）从未读取 `n.reviewLogs`。
- 问题：监控面板每次冷缓存未命中（30s TTL 之外）都会对项目的全部节点执行 `findMany`，并额外 `select` 了 `reviewLogs` 字段（关系/JSON 字段），但响应体完全不使用该字段。这是监控路由自身的性能反模式——恰恰是本透镜关注的「性能」主题，讽刺地出现在监控代码里。对节点基数大的项目，每次监控刷新都白拉全部 `reviewLogs`，放大 DB 压力与序列化开销。
- 复现思路：在含大量节点（且 reviewLogs 有数据）的项目上调用 `GET /api/stats/monitor?projectId=...`，用 Prisma query log 或 DB 侧观察 `SELECT ... "reviewLogs" ... FROM "StoryNode"`，确认该字段被选中却未在响应 JSON 中出现。
- 修复建议：从 select 中删除 `reviewLogs: true`。

### 新坑 3（监控盲区，中危）：数据库连接池未纳入任何监控/健康探针

- 文件:行号：
  - `src/lib/prisma.ts:11-16`（配置了 PrismaPg 连接池，`max` 默认 10，`idleTimeoutMillis 30_000`）
  - `src/app/api/health/route.ts:31-41`（仅 `prisma.$queryRaw\`SELECT 1\`` 探活）
  - `src/app/api/stats/monitor/route.ts`（无任何池指标）
- 问题：项目已显式配置连接池（注释明言「避免高并发流式请求下连接耗尽」），但没有任何探针暴露池的运行状态：活跃连接数、等待获取连接的请求数、获取超时次数、空闲回收情况均为盲区。`health` 路由的 `SELECT 1` 只验证「DB 可达」，不验证「池有新连接可分配」；当池耗尽（Prisma 错误 P2024 `Timed out fetching a new connection from the connection pool`）时，`SELECT 1` 同样可能拿不到连接而失败，但 health 无法区分「DB 宕机」与「池耗尽」，monitor 也无独立池指标。高并发流式生成下，池耗尽导致的 500 不会被监控发现。
- 复现思路：将 `PRISMA_POOL_MAX` 设为很小值（如 2），用并发请求压测生成/流式接口直至触发 P2024，观察 `GET /api/health` 与 `GET /api/stats/monitor` 是否给出任何「池饱和」信号——预期两者均无对应指标。
- 修复建议：在 health 或 monitor 路由中暴露 `prisma.$metrics.pipeline`（Prisma 自带 metrics，含 `prisma_pool_connections_open` / `prisma_pool_connections_busy` 等），或读取底层 pg.Pool 的 `totalCount / idleCount / waitingCount` 并上报。

### 新坑 4（监控盲区，中危）：特定异常类别无分类计数/告警，仅透传 jsonError

- 文件:行号：
  - `src/app/api/stats/monitor/route.ts:222-224`（整体 `catch (err) { return jsonError(err); }`）
  - `src/app/api/health/route.ts:33-40,48-51`（用 `classifyError` 但仅用于「DB 不可达 / LLM 未配置」两类提示，不分类计数）
- 问题：写章/生成主链路与监控链路对 Prisma 特定错误类别（P2024 连接池超时、P2002 唯一约束冲突、P2003 外键冲突）以及 LLM 侧特定错误（HTTP 429 限流、超时、鉴权失败）均未做「分类计数 + 阈值告警」。错误仅被 `jsonError` 包成响应返回给前端，后台无任何聚合指标。一旦某类错误（如 429 限流）开始频发，监控面板与运维侧完全无感，直到用户投诉。这是 round-2 观察池已提及「监控五类盲区」的延续，但本轮在代码层坐实：没有任何 `classifyError` 后的分类落库/计数。
- 复现思路：在写章接口注入一次 P2002 唯一约束冲突（如重复插入同一 title 唯一键），观察 `generation-metrics` / monitor 是否出现该错误类别的计数增长——预期无。
- 修复建议：在 `jsonError` 或统一错误中间件中按 `classifyError` 的错误码做 Prometheus/内存计数，并在 MonitorPanel 展示近 N 分钟错误类别分布。

### 新坑 5（R2-011 潜伏误报，低危）：catch-all 路由 `[...slug]` 与多段引用段数不匹配

- 文件:行号：`scripts/audit-api-refs.cjs:16-21`（`normUrl` 把 `[...slug]` 归一成 `[id]`，长度塌为 2）+ `112-128`（`routeExists` 要求 `rs.length === ks.length`）。
- 问题：若未来引入 catch-all API 路由 `src/app/api/files/[...path]/route.ts`，`normUrl` 将其归一成 `files/[id]`（2 段）；而前端引用 `/api/files/a/b/c`（3 段）经 `normUrl` 后为 `files/a/b/c`（3 段）。`routeExists` 因段数不等（3≠2）直接 `continue` 跳过，最终判为 BROKEN——即 catch-all 路由的真实引用会被误报为断链。当前代码树无 catch-all API 路由（`find src/app/api -type d -name '[...*'` 为空），故未触发；但 R2-011 的修复未覆盖 catch-all 语义，属潜伏误报源。
- 复现思路：新建 `src/app/api/foo/[...slug]/route.ts`，在前端某处加 `fetch('/api/foo/a/b')`，重跑 `node scripts/audit-api-refs.cjs`，预期出现 `BROKEN foo/a/b`（假阳性）。
- 修复建议：`routeExists` 对「路由侧为 catch-all（`[...x]`）」的情况，允许引用侧段数 ≥ 路由侧非 catch-all 段数时匹配。

### 新坑 6（R2-011 潜伏误报，低危）：路由组 `(group)` 导致 FS 发现跳过整棵子树

- 文件:行号：`scripts/audit-api-refs.cjs:55-58`（`const seg = e.name.replace(/^\(.*\)$/, ""); if (seg === "") continue;`）。
- 问题：Next.js 路由组 `(group)` 不贡献 URL 段，但其内部路由仍服务于「去掉组名」的路径。脚本遇到 `(group)` 目录时 `seg` 变空并 `continue`，结果是**不递归进入该目录**，组内 `route.ts` 永不被发现。若前端引用该组内路由且静态清单（`.api-routes.txt`）为空（当前就是空，纯 FS 发现），该引用会被误报 BROKEN。这直接削弱了 R2-011「消除清单滞后」的机制——引入路由组会重新制造误报。当前代码树 `src/app/api` 下无 `(` 或 `@` 特殊目录（`find` 检查为空），故未触发。
- 复现思路：新建 `src/app/api/(internal)/secret/route.ts`，前端加 `fetch('/api/secret')`，重跑脚本，预期 `BROKEN secret`（假阳性）。
- 修复建议：路由组目录应「去掉段名但继续递归」（`walk(full, prefix)` 而非 `continue`），而非整棵跳过。

### 新坑 7（R2-011 潜伏漏检，低危）：拼接式 / 变量拼接路径静默漏检

- 文件:行号：`scripts/audit-api-refs.cjs:92`（`/[\`"'](\/api\/[^\`"'?}]+)/g`）。
- 问题：正则只匹配「字面量中以 `/api/` 开头且不含反引号/引号/`?`/`}` 的连续片段」。对于拼接构造的路径——如 `const u = "/api/" + name; fetch(u)`、`fetch(API_BASE + "/foo")`——正则抓不到完整路径，既不误报也不做任何核对，属于「静默漏检」：若此类拼接引用指向一个真实不存在的路由，脚本永远不会发现。这并非 R2-011 引入（原脚本也有此局限），但 R2-011 强调「交叉核对真实断链」，而该盲区使其覆盖不完全。发生概率低，但属真实覆盖缺口。
- 复现思路：在前端写 `const p = "/api/" + "nope"; fetch(p);`，重跑脚本，预期 `nope` 既不在 TOTAL_REFS 也不在 BROKEN，即被完全忽略。
- 修复建议：对常量拼接（同文件内可静态求值的字符串加法）做简单常量折叠；或明确文档化为「仅核对字面量静态路由，拼接路由需人工/单测保障」。

---

## 三、复检员诚实声明

**已实跑并确认的项**：
- `node scripts/audit-api-refs.cjs` 已实跑，输出 `REAL_BROKEN_LINKS 0`、`IGNORED_TEMPLATE_INTERPOLATION 70`、`IGNORED_DOC_STRINGS 1`，无任何 `BROKEN` 行。R2-011 的「消除误报」结论基于真实运行输出，非仅看 diff。
- 对模板插值跳过量（70）做了独立 Grep 交叉计数（含 `/api/${` 的行约 87，量级一致），确认非伪造。
- R2-012 的轻量 select 与按需补回窗口正文两段逻辑，已 Read 全文并逐一核对下游 write/refine/continue/fill/engine 的消费方式，确认主生成路径紧邻前文上下文完整保留。

**已读代码确认但需真机实测才能定量的项**：
- R2-012「长项目省 10-20MB」：仅从代码层确认「不再全量拉 content」机制成立，未做长项目内存/IO 基准实测，标注为「未经实测，待验证」。
- 新坑 1（keepWindow 与章序号不对齐）：逻辑上已证实（volume/section/scene 节点类型经 Grep 确认存在），但需在多卷结构真实项目上跑 chapter-outline 路由才能确认截断影响面，标注为「逻辑已证实，待真机实测」。

**仅静态分析、未实跑的项**：
- 新坑 2（reviewLogs 未使用却被 select）：基于 Read 确认 select 含该字段且响应体未引用，未做 DB query log 实测，但属确定性代码事实。
- 新坑 3/4（连接池与异常类别监控盲区）：基于 Read `prisma.ts`/`health/route.ts`/`stats/monitor/route.ts` 确认无对应指标，未做并发压测触发 P2024 实测。
- 新坑 5/6/7（R2-011 潜伏误报/漏检）：基于 Read 脚本逻辑推导，当前代码树无 catch-all 路由、无路由组、无明显拼接漏检触发点，故未触发；复现思路已给出，可在引入对应结构后复验。

**未发现误收敛迹象**：R2-011 与 R2-012 的修复均非「只在 git diff 里改了注释」，而是逻辑真正落地（模板跳过分支、白名单分支、FS 发现并集、轻量 select、按需补回）。未把「未经实测」伪装成「已验证」。

---

## 四、小结

- R2-011：生效（实跑 REAL_BROKEN_LINKS=0，模板跳过 70、文档白名单 1，FS 动态发现就位）。
- R2-012：主体生效（轻量 select + 窗口补正文落地，主生成路径无硬回归）；但暴露 1 处功能退化隐患（新坑 1，多卷项目前文上下文截断，待实测），以及监控侧自身反模式（新坑 2）。
- 本轮新增真实缺陷 7 条（新坑 1-7），其中 1 条为 R2-012 修复直接引入的回归，2 条为监控基础设施既有盲区（连接池、异常类别），3 条为 R2-011 脚本的潜伏误报/漏检（catch-all、路由组、拼接路径），1 条为监控路由自身性能反模式。
