# round-29 阶段二：整合评审与「称帝」判词

> 输入：Chair 亲验 6 维 + 5 份 general-purpose 并行走查（导出 / 性能 / a11y / 游戏模式 / 数据层）+ useEffect 审计。
> 纪律：证据带 file:line；严重度 P0 崩溃/数据错乱 · P1 泄漏/竞态/UX崩 · P2 一致/轻微。

## 一、全量发现汇总（按模块）

### A. 写章核心路径（Chair）
- ✅ 扎实：`generate/write` 限流+`requireFields`+`request.signal` 透传+`sseError`+`finally close`。

### B. SSE 错误契约（Chair）
- ⚠️ P2：`game/action` 发 `error` 字段，生成类路由发 `content`；前端各自对应无 live bug，但契约分裂。

### C. API 输入校验（Chair → IMP-1, P1）
- ❌ 仅 3/30+ 路由用 `requireFields`；其余裸 `req.json()` 无 try/catch → 畸形 JSON 直接 500。

### D. 记忆架构 / 错误边界 / SSR（Chair）
- ✅ 健全：token 预算分段 + `truncateByTokens`；`error.tsx` 健壮；localStorage 无水合崩溃。

### E. useEffect（审计 → IMP-3, P1→精确）
- ❌ P1 `ImitationPanel.tsx:54` fetch 无 abort/cleanup/标志位；P2 `StyleEditor.tsx:168`、7 处轮询 effect、`ForeshadowingPanel.tsx:155`。

### F. 导出（gp-6 → IMP-5, P1 + 潜在 P0）
- ✅ EPUB 合法可开、流式防 OOM、空书稳健。
- ❌ DOCX P1：无首行缩进(:36-47)、Markdown 残留(:21-26)、无目录域。
- 🔴 潜在 P0：`escapeXml/escapeHtml` 不剥控制字符(\x00-\x1F)（docx.ts:11-18 / epub.ts:339-345）→ 正文含控制符生成非法 XML → 产品打不开。

### G. 前端性能（gp-3 → IMP-6, P1）
- ❌ CenterPanel:58,534 流式逐 token 整面板重渲；MarkdownViewer:193 全量重解析；OutlineTree:23 O(n²) 过滤无 memo；RelationshipGraph:455 拖动整 SVG 重渲、:292-309 全书扫描阻塞。

### H. a11y（gp-2 → IMP-7, P1）
- ✅ 整体良好近生产级；4 套主题令牌 CR≥4.5 AA；对话框 focus trap/Esc/aria-modal 全覆盖。
- ❌ P1：`OutlineTree.tsx:32`、`CharacterRow.tsx:45` 裸 `<div onClick>` 无键盘入口。
- ⚠️ P2：Icon SVG 缺 `aria-hidden`；`--nv-text-muted` 浮层缺专用变体。

### I. 游戏模式（gp-4 → IMP-8, P1 / 可升 P0）
- ✅ 状态机/SSE/中断/错误路径健康。
- ❌ P1 持久化：`initGame` 不恢复、开始游戏无条件删旧会话 → 刷新清空进度。
- 🔴 P1→P0 竞态：后端无锁，双连点两生成器各 `upsert round N+1` 互相静默覆盖叙事与 `totalWords`。

### J. 数据层（gp-5 → IMP-9, P1×5）
- ✅ 无硬 P0 数据丢失；乐观锁/幂等/事务关键路径基本就位。
- ❌ P1-1 AI 写盲写 `where:{id}`（write-generation.ts:295 / post-processor.ts:250 / game-engine.ts:849）绕过 `editVersion` → 长生成期手动保存被覆盖。
- ❌ P1-2 软删泄漏：`story/nodes/[id]/route.ts:19` GET 不滤 `deletedAt`，Project GET 同样泄漏已删。
- ❌ P1-3 N+1：`renumberLiveTopChapters` 循环逐章 `update`。
- ⚠️ P1-4 `withStorylineLock` 仅进程内 Map，多实例/Serverless 失效。
- ⚠️ P1-5 节点软删子树+重编号未包 `$transaction`。

## 二、「称帝 / 完美化」判词

**当前结论：高质量可上线，但未达零缺陷完美化 —— 尚不够格「称帝」。**

- 强项（已达生产级）：写章路径、SSE 错误收敛、记忆架构、错误边界、a11y 基础、EPUB 导出、游戏状态机/中断。
- 阻断项（修复前不能称帝）：
  1. 🔴 导出控制字符未清洗（潜在 P0，产品可能打不开）
  2. 🔴 游戏回合并发无锁（P1→P0，静默丢稿）
  3. ❌ AI 写绕过乐观锁（P1，手动保存被覆盖）
  4. ❌ API 输入校验缺失（P1，畸形请求 500）
  5. ❌ 软删泄漏（P1，回收站数据可读）
- 体验项（修复后更接近完美）：DOCX 排版、大书性能、a11y 键盘入口、ImitationPanel useEffect。
- 暂缓（用户已确认）：Prisma 迁移滞后。

## 三、阶段三→四执行优先级（迭代修复顺序）

1. **FIX-1（潜在 P0）**：导出控制字符清洗（docx+epub 共用 sanitize）。
2. **FIX-2（P1）**：`safeJson` 助手 + 全路由覆盖裸 `req.json()`（IMP-1）。
3. **FIX-3（P1→P0）**：游戏回合并发锁 + 断点续玩（IMP-8）。
4. **FIX-4（P1）**：AI 写加乐观锁版本校验（IMP-9-1）。
5. **FIX-5（P1）**：软删 GET 统一过滤 `deletedAt`（IMP-9-2）。
6. **FIX-6（P1）**：DOCX 首行缩进+Markdown 解析+目录域（IMP-5）。
7. **FIX-7（P1）**：大书性能（流式 memo / Markdown 增量 / 大纲树 memo）（IMP-6）。
8. **FIX-8（P1）**：a11y 键盘入口（IMP-7）。
9. **FIX-9（P1）**：ImitationPanel useEffect（IMP-3）。
10. **FIX-10（P2）**：game/action SSE 字段统一（IMP-2）+ N+1/事务/锁（IMP-9-3/4/5）。

> 每批过 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` + `npm test` + 双 changelog 升版 + 代理推送。修复至 FIX-5 后复评「称帝」门槛。
