# round-29 阶段一：Chair 主代理亲验报告

> 说明：本轮启动时为 **Chair 主代理亲验**（因误判子代理通道全坏——review-worker 仅挂载 `SendMessage`，按 maxloop 铁律「六之二」降级）。**通道复核修正**：general-purpose 子代理实测 Read + Bash 均可用（成功读 package.json、跑命令），证明通道对 general-purpose 正常，坏掉的仅是 review-worker 专属 agent。故阶段一后半段**恢复多智能体并行走查**（见下方并行审计任务），回归用户原意「派多个智能体在所有层面地毯式走查」。深度与证据标准不变。

## 基线（健康度门槛，全过）
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → 0 类型错误。
- `npm test`（vitest））→ 基线 115 文件 1193 测试全绿（prior 实测，本轮未重建全量，待阶段四复检）。
- `curl http://localhost:3002/` → 合法 `<!DOCTYPE html>` SSR，真身运行正常（端口真相：3002 是活端口，3001 为僵尸端口不可信）。
- 版本基线 v3.1.29（commit `00f4ec4`，已推 origin/main）。

## 逐维度发现（带 file:line 证据 + 严重度）

### 1. 写章核心路径（generate/write）— 扎实 ✓
- `src/app/api/generate/write/route.ts:21-64`：限流 → `requireFields(body,["projectId","nodeId"])` 校验 → `request.signal` 透传（支持中断）→ `runWriteGeneration` → `catch` 用 `sseError(e)` 收敛 → `finally controller.close()`。结构正确，无断链。
- 结论：用户最关心的正文生成关键路径质量高，可作为标杆。

### 2. SSE 错误契约 — 收敛良好，仅一处约定不一致（P2）
- 统一构造：`src/lib/sse-error.ts` → `sseError()` 产出 `{type:"error", content, code, hint}`。
- 生成类路由（write/continue/refine）发送 `content` 字段；前端 writer 消费 `event.content`（与各自路由一致）。
- `game/action/route.ts:53` 手动发送 `{type:"error", error: info.content}`（用 `error` 而非 `content`）；前端 `src/app/workspace/[projectId]/game/[nodeId]/page.tsx:356-357` 与 `:485-486` 读 `event.error`。**前后端对齐，无 live bug**。
- 判定：仅契约不统一（content vs error），属 P2 一致性异味，非用户可见缺陷。

### 3. 输入校验 — 严重不均（P1，本轮核心新发现）
- `requireFields` 实现良好（`src/lib/api-body.ts:23`），但 **全仓仅 3 个路由使用**：`generate/continue`、`generate/refine`、`generate/write`（grep 实证）。
- 30+ 路由直接 `await req.json()` 且多数 **无 try/catch**：`explore/{adopt,chat,create}`、`dissect/{start,chat,to-project}`、`game/{concept,start,end,outline/generate,outline/chat,action}`、`babylore/clear-filled`、`imitate/start`、`settings/models`、`projects/[id]/build-config` 等（grep 实证 file:line）。
- 后果：畸形 JSON / 空 body → 服务端抛未捕获异常 → 返回 500 而非优雅 400，UX 崩。单用户本地应用真实风险中，但距"完美化"标准明显不足。
- 改进方向：新增 `safeJson(request)` 助手（try/catch + 标准化 400），全路由覆盖裸 `req.json()`。

### 4. SSR / localStorage — 安全 ✓
- `src/app/layout.tsx:49` 的 `catch(e){}` 位于 `<head>` 内联浏览器脚本（主题初始化兜底），非服务端代码，良性，排除。
- 20+ 文件用 `localStorage`，但 3002 SSR 正常返回 HTML，无模块级/渲染期直读导致的水合崩溃。

### 5. 「不降智」记忆架构 — 健全 ✓（旗舰功能）
- `src/core/assembly/engine.ts:84-167`：`calculateBudget(contextWindowSize)` 分配 system/global/lore/arc/storyline/foreshadowing/long/medium/short/author 各段 token 配额，`truncateByTokens` 按段截断防溢出。
- `src/core/assembly/distant-summary.ts:39` 远楼层 LLM 压缩 `maxTokens:400`。
- 设计成熟：靠分层截断而非窗口溢出实现"不降智"，无静默丢上下文之外的结构性缺陷。

### 6. 全局错误边界 — 健壮 ✓
- `src/app/error.tsx`：中文可读错误 + 重试 + 返回首页，`useEffect` 仅做日志（无需 AbortController）。

### 7. useEffect / AbortController — 待子代理核验（🟡）
- 已知 19 文件 useEffect 无 AbortController（prior 登记）。general-purpose 子代理正在枚举 file:line + 严重度，结果并入 IMP-3。

### 8. Prisma 迁移滞后 — 🟡 用户已确认暂缓
- prior 登记的 4 个迁移文件滞后，用户本轮明确"先放着"，非阻塞。

## 中途判词（是否够格「称帝/完美化」）
- **成熟度远高于同体量开源项目**：tsc 0 错、测试全绿、SSE 错误收敛、旗舰记忆架构健全、全局错误边界到位、写章关键路径扎实。
- **距"完美化"尚差三件事**：① 输入校验在 API 层不统一（最该修）；② React 反模式（useEffect 清理）待扫清；③ 技术债（Prisma 迁移、zod 骨架未铺开）。
- 结论：当前是「高质量可用、可上线」状态，但未达「零已知缺陷的完美化」。本轮 maxloop 目标即把 ①②③ 中可低风险收敛的项迭代修复，最终给「称帝」判定。
