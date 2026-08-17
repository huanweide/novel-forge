# round-29 改进清单（IMP）

> 来源：阶段一 Chair 亲验 + 子代理审计（useEffect 项待并入）。严重度 P0 崩溃/数据错乱 · P1 泄漏/竞态/UX崩 · P2 一致性/轻微。
> 收口规则：每批修复须过 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`（0 错）+ `npm test`（全绿）+ 双 changelog 升版 + 代理推送。

## IMP-1 ｜ API 输入校验统一（P1）
- 现状：仅 3/30+ 路由用 `requireFields`；其余裸 `await req.json()` 无 try/catch，畸形 JSON → 500。
- 方案：在 `src/lib/api-body.ts` 新增 `safeJson(request)` → `{ok:true, body} | {ok:false, response(400)}`；全路由替换裸 `req.json()`。
- 覆盖（grep 实证）：explore/{adopt,chat,create}、dissect/{start,chat,to-project}、game/{concept,start,end,outline/generate,outline/chat,action}、babylore/clear-filled、imitate/start、settings/models、projects/[id]/build-config。
- 验证：新增 `api-body.test.ts` 的 `safeJson` 单测（畸形 JSON→400、合法→body）；tsc 0 + 全绿。

## IMP-2 ｜ game/action SSE 错误契约统一（P2）
- 现状：`game/action/route.ts:53` 发 `error` 字段，其余生成路由发 `content`，前端各自对应无 live bug，但契约分裂。
- 方案：改 `game/action` 用 `sseError()` 统一 `content` 字段；前端 `game/[nodeId]/page.tsx:357,486` 弹性读取 `event.content || event.error`。
- 验证：tsc 0 + 游戏相关测试全绿 + 无头点验错误流。

## IMP-3 ｜ useEffect 无 AbortController 清理（P1 → 已精确化）
- 现状（general-purpose 子代理审计实证）：src/ 共 100 个 useEffect，绝大多数已用 alive/cancelled 标志 + cleanup 或 AbortController 防护。真实命中极少：
  - **P1** — `src/components/dissect/ImitationPanel.tsx:54`：effect 内 fetch 无 abort、无 cleanup、无标志位（唯一高危，卸载后可能 setState/泄漏）。
  - **P2** — `src/components/editor/StyleEditor.tsx:168`（fetch 无 abort）；7 处轮询 effect（setInterval+fetch 仅 clearInterval、缺 abort）；`src/components/workspace/ForeshadowingPanel.tsx:155`（事件 handler 返回的 cleanup 被忽略 → cancelled 标志永不重置）。
- 方案：对 P1 的 ImitationPanel 加 AbortController + 卸载标志；P2 项加 abort/标志位重置。纯日志型 useEffect（error.tsx）不改。
- 验证：tsc 0 + 全绿 + ImitationPanel 无头截图对比（含快速卸载场景）。

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
- 验证：tsc 0 + 导出单测（控制字符/空书/大书）+ 无头点验产物可开。

## IMP-6 ｜ 前端大书性能（P1）
- 来源：general-purpose-3 性能审计。
- 命中：CenterPanel.tsx:58,534 流式正文未拆独立 memo 子组件→逐 token 整面板重渲；MarkdownViewer.tsx:193 ReactMarkdown 随流式累加全量重解析；OutlineTree.tsx:23 每节点 `allNodes.filter(parentId===id)` + 无 memo→千节点 O(n²)；RelationshipGraph.tsx:455 拖动无 rAF/节流整 SVG 重渲、:292-309 全书正文正则扫描阻塞主线程。
- 方案：流式正文拆 memo 子组件、Markdown 增量/缓存、大纲树 memo + 预建 childrenMap、关系图拖动 rAF 节流 + 出场扫描按需。
- 验证：tsc 0 + 大书（千节点/长章）无头截图对比帧率、无卡顿。

## 阶段二投票（降级下由 Chair 自审收敛；待另外 3 份报告到齐后定稿）
- 已收 2/5 并行报告（导出、性能）；待 a11y / 游戏模式 / 数据层。
- 当前倾向：IMP-1（P1 必做）、IMP-3（P1 精确化）、IMP-5（P1+潜在P0）、IMP-6（P1）过半通过；IMP-2（P2）、IMP-4（P2 暂缓）通过/暂缓。
- 下一轮：3 份到齐→整合评审→阶段三方案细化→阶段四代码执行（IMP-1 与 IMP-5 控制字符项优先，因潜在 P0）→阶段五复检。
