# round-8 修复方案（逐条可落地 / 5 路分治，文件独占避免冲突）

> 适配层：novel-forge。门禁 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`（零错误）+ `npx vitest run`（全绿）。
> 升版：双 changelog（changelog-data.ts 三处 + CHANGELOG.md 头条），字符串用「」避 ASCII 引号。
> 推送：`git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin main`。

## 派工路总览（文件独占）
- **路A（L1 性能 + 摘要）**：`src/core/pipeline/post-processor.ts`、`src/core/pipeline/context-loader.ts`、`src/app/api/projects/[id]/export/route.ts`、`src/lib/world-category-classifier.ts`
- **路B（L2 安全）**：新建 `src/lib/rate-limit.ts`；`import/parse/route.ts`、`import/quick/route.ts`、`src/lib/api-error.ts`、套用 `generate/*`、`import/*`、`settings/test`
- **路C（L3 数据）**：`src/app/api/story/nodes/[id]/route.ts`、`src/app/api/storylines/[id]/route.ts`、`src/core/pipeline/storyline-writer.ts`、`src/core/pipeline/plan-chapter.ts`、`src/lib/entity-auto-creator.ts`、`src/core/story-status.ts`（扩常量）
- **路D（L4 UI）**：`src/app/globals.css`、`src/app/workspace/[projectId]/page.tsx`、`src/components/workspace/CenterPanel.tsx`
- **路E（L5 写章）**：`src/core/llm/client.ts`、`src/app/api/generate/write/route.ts`、`src/app/api/generate/refine/route.ts`、`src/app/api/generate/continue/route.ts`、`src/app/api/import/commit/route.ts`

---

## 路A 方案（L1 性能 + L3-002 摘要去重）

### post-processor.ts（L1-001 / L1-003 / L1-004 / L1-006 / L3-002）
4.5 段（约 651-672）：
1. **窄列 select**：四个 findMany 加 `select`——summary 取 `id,chapterId,content,order,nodeId`；beat 取 `id,nodeId,content`；commitment 取 `id,sourceNodeId,type,content`；character 仅 `id,name,role,arcProgress,currentStatus`（避免拉 background/timeline/relationships/appearance 重字段）。
2. **take 上限**：chapterSummary `take:50` 按 `createdAt:desc`（取最近）；storyBeat `take:60`；pendingCommitment `take:30`；characterCard 因已被 context-loader 加载，本路不再独立查（见 L1-003）。
3. **Promise.all**：四个查询改为 `const [allSummaries,allBeats,allCommitments,allCharacters] = await Promise.all([...])`（L1-004）。
4. **复用 context-loader 的 characters（L1-003）**：post-processor 函数签名接收已加载的 `data.characters`（窄列投影），删除 662 行独立 `characterCard.findMany`。
5. **摘要去重（L3-002）**：写 ChapterSummary 前 `await prisma.chapterSummary.deleteMany({where:{projectId,chapterId}})`；写 StoryBeat 前 `await prisma.storyBeat.deleteMany({where:{projectId,nodeId}})`（先清旧再建新，杜绝重复行挤占 take 窗口）。
6. **复用 create 返回（L1-006）**：566 行 `chapterSummary.create` 返回值存变量，634/684 的 `findFirst` 重查改为直接用该对象 id/字段。

### context-loader.ts（L1-002 / L1-005）
- 52-55 行 `characterCard.findMany` / `lorebookEntry.findMany` 加 `take:50`（对齐 `loadOutlineData` 的 take:50）+ `select` 窄列（characters 仅 id/name/role/arcProgress/currentStatus；lorebook 仅 id/title/category/content 摘要）。返回 `data.characters` 供 post-processor 复用。
- L1-005：write/route.ts:149 的重复 `project.findUnique` 改用 `data.project.llmConfig`（若 context-loader 已加载则删除该独立查询；refine:122 同理）。

### export/route.ts（L1-009）
- 递归建树前的 `allNodes.filter(n=>n.parentId===node.id)` 改为：先一次性 `const childrenMap = new Map<string,StoryNode[]>()`，遍历 allNodes 填充（O(N)），递归内查 `childrenMap.get(node.id)`。消除 O(N²)。

### world-category-classifier.ts（L1-011）
- 模块级预计算 `const LOWER_KEYWORDS: Record<Cat,string[]> = Object.fromEntries(...KEYWORDS 每项 toLowerCase())`；内层循环 `t.includes(kw.toLowerCase())` 改为 `t.includes(lowerKw)`。

---

## 路B 方案（L2 安全）

### 新建 src/lib/rate-limit.ts
- 内存滑动窗口/令牌桶：`createRateLimiter({windowMs, max})` 返回 `async (key:string) => {ok:boolean, retryAfter?:number}`；用 `Map<string,{count,resetAt}>` 实现，定时清理过期。
- 导出 `rateLimit(name, key, limit, windowMs)` 便捷函数。

### 套用限流（L2-001）
在以下路由 handler 起始（鉴权后、业务前）调用：`generate/write`、`generate/refine`、`generate/continue`、`generate/chapter-outline/*`、`import/parse`、`import/quick`、`import/commit`、`settings/test`。key 用 `ip`（从 `request.headers.get('x-forwarded-for')` 或 fallback）+ 路由名；阈值：生成类 1 分钟 10 次、导入类 1 分钟 5 次、settings/test 1 分钟 3 次。超限返回 `429 Too Many Requests`。

### import/parse + import/quick（L2-002）
- `import/parse/route.ts:287-288`：`rawText` 加上限 `if (text.length > 500000) return 413`；同理 `import/quick/route.ts:282`。

### api-error.ts（L2-003）
- `classifyError` 默认分支 `error: err.message` 改为 `error: "服务器内部错误，请查看日志"`；明细仅 `console.error(err)`。SSE 错误路径（`import/parse:535` 类）同样用泛化消息，不回显原始 `err.message`。

---

## 路C 方案（L3 数据）

### story/nodes/[id]/route.ts（L3-001 孤儿清理）
删除节点（约 276-277）时，包 `$transaction`：先 `deleteMany` 关联孤儿——`chapterSummary`(where chapterId)、`storyBeat`(where nodeId)、`pendingCommitment`(where sourceNodeId)、`pendingItem`(where sourceNodeId)；再删节点。

### storylines/[id]/route.ts（L3-001 / L3-009 事务）
- 98-103 的 `updateMany` 重挂 + `delete` 包 `$transaction`（原子）。
- 删除后清理引用该故事线的 `chapterBindings`：扫描相关 storyNode 的 bindings JSON，剔除 `storylineId===id` 的条目并 `update`。

### storyline-writer.ts + plan-chapter.ts（L3-003 原子 + 结构统一）
- 对同一条 Storyline 的 `chapterBindings` 改写包 `prisma.$transaction`（或 `FOR UPDATE` 行锁）。
- 统一 bindings 数据结构为 `{storylineId, chapterId, chapterOrder, element, note, focus, advance, at}`，两函数写入同形状，消除解析脆弱。
- write/route.ts:142 与后处理 step4 的两次非原子改写合并为一次事务内原子操作。

### entity-auto-creator.ts（L3-004 去重兜底）
- 写入前二次查重（按 `projectId+name` / `projectId+title`）；`create` 用 `try/catch` 捕获 `P2002`（若后续加唯一约束）转 skip；保留内存 Set 去重减少重试。

### story-status.ts（L3-005 状态常量化）
- 新增 `STORYLINE_STATUS = {ACTIVE:'active', ABANDONED:'abandoned', COMPLETED:'completed', PAUSED:'paused'}` 与 `COMMITMENT_STATUS = {PENDING:'pending', DETECTED:'detected', FULFILLED:'fulfilled', PARTIAL:'partially_fulfilled'}`。
- 全仓替换字面量：`storyline-writer.ts`、`plan-chapter.ts`、`confirm-guard.ts`、`context-loader.ts`、`storylines/[id]/route.ts`。

### confirm-guard.ts（L3-006 幂等前置）
- 将 158-170 的幂等 `updateMany where status in CONFIRMABLE_STATUSES` 判定前置到 122 的 `safeFillAfterWriting` 之前；仅当状态会真正跃迁时才执行填表副作用。

---

## 路D 方案（L4 UI）

### globals.css（F01 浅色 accent 文字变体）
- 浅色主题（约 276 行后）新增 `--nv-accent-text-on-light: oklch(0.50 0.12 95)`（目标 CR≥4.5 on 浅色背景）。
- 将金色小文字引用处（settings:491、recycle:91、workshop:438、page:320、game:1071/1243、status-badge:25/26 的"待确认/审校中"等）改用 `--nv-accent-text-on-light`；`--nv-accent` 仍用于图标/边框（非小号文字）。保留深色/苍青不变。

### page.tsx + CenterPanel.tsx（F03 aria-live）
- 展示 `genStep` 标签的容器（page.tsx:47-58,1049）加 `aria-live="polite"`；error 状态用 `aria-live="assertive"`。或新增 `sr-only` 的 `<div aria-live="polite">` 同步 genStep 文案与"生成完成/出错"。CenterPanel 接收 genStep 处同步加 aria-live。

---

## 路E 方案（L5 写章端到端）

### client.ts（L5-01 maxTokens 动态 + finish_reason 透传）
- `resolveMaxTokens` 改为：`target = config.maxTokensPerRequest`；若请求带 `targetWordCount`，则 `target = Math.min(modelCtxLimit, Math.max(4096, Math.ceil(targetWordCount*1.6)))`；默认仍 4096。
- 流式 `readStream` 透传 `finish_reason`：解析 SSE `data.choices[0].finish_reason`，在流结束回调/返回值中携带；`chatStream` 返回对象含 `finishReason`。
- `buildFromStream`/路由侧据此判断 `'length'` 截断。

### write/route.ts（L5-01 / L5-04）
- 收尾检测 `finishReason==='length'`：若截断，回滚节点（保留 outline/draft，标记 `truncated`，提示用户重试）；且比对实际字数 vs targetWordCount，不足阈值降级为「草稿未完成」告警而非静默进待确认。
- 将 `request.signal` 透传至 `orchestrator.writeSection(...)` → `chatStream` 的 `request.signal`（L5-04）；断连即中止生成与落盘。

### refine/route.ts（L5-02 / L5-04）
- 接入 L5-01 截断检测，截断时回滚到 `prevContent`（snapshotRevision 已有完整原稿），不覆盖线上节点为残片。
- 透传 `request.signal`（L5-04）。

### continue/route.ts（L5-03 / L5-04）
- 起点前（67 前）检测本 project 是否存在「本会话新建的 status:'drafting' 且 content 含 `[PARTIAL_DRAFT]`」的节点；有则复用/清理，而非永远新建。
- SSE 中断/503 时删除该孤儿 drafting 节点（与 L5-04 signal 中止配合）。
- 透传 `request.signal`（L5-04）。

### import/commit/route.ts（L5-06 content 校验）
- 导入前逐章校验 `ch.content` 为非空字符串；缺失/类型错误（undefined/数字/对象）则跳过该章并在返回中告警，逐章容错而非整 120s 事务回滚。

---

## 验证方式（统一）
1. 各路改完本地 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 零错误（最终由 Chair 单跑，避免竞态）。
2. 新增/调整测试：限流中间件、截断检测回滚、孤儿清理、摘要 upsert、并发实体去重、rawText 上限、content 校验。
3. Chair 最终统一跑 `npx vitest run` 全绿（目标 ≥286，新增测试计入）。
4. 双 changelog 升 v1.6.10，commit + 代理 push + 费曼报告 + 记忆回写。
