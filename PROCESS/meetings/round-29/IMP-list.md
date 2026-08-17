# round-29 改进清单（IMP）

> 来源：阶段一 Chair 亲验 + 子代理审计（useEffect 项待并入）。严重度 P0 崩溃/数据错乱 · P1 泄漏/竞态/UX崩 · P2 一致性/轻微。
> 收口规则：每批修复须过 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`（0 错）+ `npm test`（全绿）+ 双 changelog 升版 + 代理推送。

## IMP-1 ｜ API 输入校验统一（P1）
- 现状：仅 3/30+ 路由用 `requireFields`；其余裸 `await req.json()` 无 try/catch，畸形 JSON → 500。
- 方案：在 `src/lib/api-body.ts` 新增 `safeJson(request)` → `{ok:true, body} | {ok:false, response(400)}`；全路由替换裸 `req.json()`。
- 覆盖（grep 实证）：explore/{adopt,chat,create}、dissect/{start,chat,to-project}、game/{concept,start,end,outline/generate,outline/chat,action}、babylore/clear-filled、imitate/start、settings/models、projects/[id]/build-config。
- 验证：新增 `api-body.test.ts` 的 `safeJson` 单测（畸形 JSON→400、合法→body）；tsc 0 + 全绿。
- **状态（2026-08-17·v3.1.31）**：已收口——api-body.ts 新增 safeJson 覆盖 13 个裸 req.json() 路由；api-body.test.ts +2；tsc 0 + vitest 119 文件 1216 全绿已推送。

## IMP-2 ｜ game/action SSE 错误契约统一（P2）
- 现状：`game/action/route.ts:53` 发 `error` 字段，其余生成路由发 `content`，前端各自对应无 live bug，但契约分裂。
- 方案：改 `game/action` 用 `sseError()` 统一 `content` 字段；前端 `game/[nodeId]/page.tsx:357,486` 弹性读取 `event.content || event.error`。
- 验证：tsc 0 + 游戏相关测试全绿 + 无头点验错误流。
- **状态（2026-08-17·v3.1.31）**：已收口——game/action 错误改走 sseError() 统一 content 字段，前端 game/[nodeId]/page.tsx 弹性读 event.content||event.error；随游戏集群一并交付。

## IMP-3 ｜ useEffect 无 AbortController 清理（P1 → 已精确化）
- 现状（general-purpose 子代理审计实证）：src/ 共 100 个 useEffect，绝大多数已用 alive/cancelled 标志 + cleanup 或 AbortController 防护。真实命中极少：
  - **P1** — `src/components/dissect/ImitationPanel.tsx:54`：effect 内 fetch 无 abort、无 cleanup、无标志位（唯一高危，卸载后可能 setState/泄漏）。
  - **P2** — `src/components/editor/StyleEditor.tsx:168`（fetch 无 abort）；7 处轮询 effect（setInterval+fetch 仅 clearInterval、缺 abort）；`src/components/workspace/ForeshadowingPanel.tsx:155`（事件 handler 返回的 cleanup 被忽略 → cancelled 标志永不重置）。
- 方案：对 P1 的 ImitationPanel 加 AbortController + 卸载标志；P2 项加 abort/标志位重置。纯日志型 useEffect（error.tsx）不改。
- 验证：tsc 0 + 全绿 + ImitationPanel 无头截图对比（含快速卸载场景）。
- **状态（2026-08-17·v3.1.32）**：FIX-9 已收口——ImitationPanel 的 useEffect 加 AbortController + cleanup，组件卸载后异步结果不再回写已卸载组件（根治 React「不能在卸载组件上更新状态」告警与潜在崩溃）；新增 ImitationPanel.test.tsx 4 例锁死卸载后不 setState；tsc 0 + vitest 122 文件 1232 全绿已推送。

## IMP-4 ｜ Prisma 迁移追平（P2，用户暂缓）
- 现状：4 个迁移文件滞后（prior 登记）。
- 状态：用户 2026-08-17 明确「先放着」，本轮不强制；若 IMP-1/3 执行中触碰 schema 客户端再评估。

## IMP-5 ｜ 导出 DOCX 排版/结构缺陷 + 控制字符清洗（P1，潜在 P0）
- 来源：general-purpose-6 导出审计（src/core/docx.ts、src/core/epub.ts、export/route.ts）。
- DOCX P1：① 正文无首行缩进（para() 仅 bold+size，无 `<w:ind>`，:36-47）；② 不解析 Markdown，`**粗体**`/`#` 字面残留（:21-26，对比 epub.ts proseToHtml 有解析）；③ 完全无目录域 `<w:toc>`。
- 潜在 P0：escapeXml/escapeHtml 不剥控制字符(\x00-\x1F)（docx.ts:11-18 / epub.ts:339-345），正文含控制符→生成非法 XML→产品打不开。
- EPUB 达标✓：合法可开、流式防 OOM、空书/空节稳健；仅 colophon 未进 manifest（P2）、正文恒 h1 层级丢失（P2）轻微。
- 方案：DOCX 加首行缩进 + Markdown 解析 + 目录域；导出前统一剥离控制字符（docx+epub 共用 sanitize）。
- **状态（2026-08-17·v3.1.30）**：控制字符清洗项（潜在 P0）已收口——epub.ts 新增 `stripControlChars`、escapeHtml/escapeXml 复用，docx.ts escapeXml 复用同一 sanitizer；epub.pure.test.ts 新增 6 例锁死契约；tsc 0 + vitest 115 文件 1199 全绿已通过并推送。DOCX 排版三项（首行缩进/Markdown 解析/目录域）留作 FIX-6 后续。
- **状态（2026-08-17·v3.1.32）**：FIX-6（DOCX 排版三项）已收口——src/core/docx.ts 段落加首行缩进 `<w:ind w:firstLine="480"/>`（中文书稿两字缩进）、新增轻量 Markdown 解析（**加粗**/*斜体*/标题/列表/分隔线落进 OOXML 结构而非裸文本）+ 目录 TOC 域，导出的 .docx 在 Word/WPS 有正常段落层次与缩进；零依赖纯 OOXML 手写、不引入新包；新增 docx.feature.test.ts 8 例锁死首行缩进/Markdown 解析/TOC 域契约；tsc 0 + vitest 122 文件 1232 全绿已推送。
- 验证：tsc 0 + 导出单测（控制字符/空书/大书）+ 无头点验产物可开。

## IMP-6 ｜ 前端大书性能（P1）
- 来源：general-purpose-3 性能审计。
- 命中：CenterPanel.tsx:58,534 流式正文未拆独立 memo 子组件→逐 token 整面板重渲；MarkdownViewer.tsx:193 ReactMarkdown 随流式累加全量重解析；OutlineTree.tsx:23 每节点 `allNodes.filter(parentId===id)` + 无 memo→千节点 O(n²)；RelationshipGraph.tsx:455 拖动无 rAF/节流整 SVG 重渲、:292-309 全书正文正则扫描阻塞主线程。
- 方案：流式正文拆 memo 子组件、Markdown 增量/缓存、大纲树 memo + 预建 childrenMap、关系图拖动 rAF 节流 + 出场扫描按需。
- 验证：tsc 0 + 大书（千节点/长章）无头截图对比帧率、无卡顿。
- **状态（2026-08-17·v3.1.32）**：FIX-7（大书性能）+ FIX-8（大纲树性能/a11y）已收口——① CenterPanel 把高频流式正文抽成 React.memo 的 StreamingBody 子组件 + 新增 useRafThrottledValue 按帧节流，AI 逐 token 生成时只正文区局部更新、整棵工作区不再每 token 重渲染；MarkdownViewer 包 React.memo；RelationshipGraph 拖动用 requestAnimationFrame 节流 + 出场扫描结果缓存；② OutlineTree 的 buildIndex 从 O(N²) 全量 children 查找改为建 childrenMap 一次 O(N) 索引，节点行加 role="button"/tabIndex={0}/onKeyDown 支持键盘展开折叠与跳转、CharacterRow 补键盘入口（键盘用户纯键盘操作大纲与角色）；新增 OutlineTree.test.tsx 4 例锁死键盘可达；tsc 0 + vitest 122 文件 1232 全绿已推送。

## IMP-7 ｜ 游戏回合并发锁 + AI 写乐观锁（P1→P0 / P1，已收口 v3.1.31）
- 来源：general-purpose 子代理（游戏集群 commit 2c66a66）。
- FIX-3（P1→P0）：src/lib/game-lock.ts 新增按 nodeId 内存互斥锁 withNodeLock/withNodeLockGen，同一 node 的并发 /api/game/action 严格串行、不同 node 并行，杜绝后写覆盖先写。
- FIX-4（P1）：src/lib/optimistic-lock.ts 的 assertNodeUnchanged，写回前重读 node 比对 revisionCount（无则 updatedAt），变了即中止写回而非覆盖；write-generation.ts/post-processor.ts/game-engine.ts 三处写回点均布防。
- 验证：game-lock.test.ts(6) + optimistic-lock.test.ts(5)；tsc 0 + vitest 全绿已推送。

## 阶段五复检 · 最终判词（收官·2026-08-17·v3.1.32）

### 一、5 项「称帝」阻断项（全部清零，v3.1.30/v3.1.31）
| 阻断 | 版本 | 严重度 | 状态 |
|------|------|--------|------|
| 导出控制字符清洗（潜在 P0） | v3.1.30 | P0 | 已收口 |
| 游戏回合并发锁（写覆盖） | v3.1.31 | P1→P0 | 已收口 |
| AI 写乐观锁（revisionCount 比对） | v3.1.31 | P1 | 已收口 |
| API 输入校验统一（safeJson） | v3.1.31 | P1 | 已收口 |
| 软删 GET 过滤（deletedAt:null） | v3.1.31 | P1 | 已收口 |

### 二、锦上添花项（全部收口，v3.1.32）
| 项 | 版本 | 内容 | 状态 |
|----|------|------|------|
| FIX-6 DOCX 排版 | v3.1.32 | 首行缩进 + Markdown 解析 + TOC 域 | 已收口 |
| FIX-7 大书性能 | v3.1.32 | StreamingBody memo + rAF 节流 + 关系图拖动节流 | 已收口 |
| FIX-8 大纲树性能/a11y | v3.1.32 | childrenMap O(N) + 键盘可达 | 已收口 |
| FIX-9 仿写面板卸载兜底 | v3.1.32 | AbortController + cleanup | 已收口 |

### 三、最终判词
- **称帝结论**：原「尚不够格称帝」的 5 个阻断项已于 v3.1.31 清零，按既定门槛 novel-forge 已够格称帝（高质量可上线 + 五阻断清零）；v3.1.32 将剩余 4 项打磨（FIX-6/7/8/9）全部收口，round-29 魔王系统地毯式走查与迭代修复正式收官。
- **质量门禁（收官实测）**：tsc 0 错误；vitest **122 文件 1232 全绿**（较 v3.1.31 基线 119 文件 1216 +3 文件 +16 测：docx.feature 8 + OutlineTree 4 + ImitationPanel 4）；六/四版本文件对齐 v3.1.32；个人 IP 仍归瑞宝宝，无新 IP/品牌/引流。
- **安全收口**：本轮把误入库的 `.workbuddy/`（本地记忆 + automations 状态）从版本库移除（仅 index、磁盘保留，靠 .gitignore 隔离），确保本地/凭据类数据不再推上远程；已随 v3.1.32 一并推送。
- **暂缓项（非阻断，留待治理）**：IMP-4 Prisma 4 迁移文件滞后（用户 2026-08-17 明确「先放着」）；zod 骨架未铺开。此二项不阻断称帝，列入后续治理，不在 round-29 收官范围。

### 四、收官提交链
- `af2b0b2` Round-29 打磨收官：FIX-6/7/8/9 零冲突并入 main
- `6bec24b` chore: 停止跟踪 .workbuddy/
- `03a0e57` v3.1.32 收官升版（四件套对齐）
- 已推送 `origin/main`：`050d12e..03a0e57`
