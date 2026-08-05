# 阶段五复检报告 · 监控性能可观测透镜（监控子系统）

> 复检对象：round-1 阶段四声称修复的 IMP-019 / IMP-020 / IMP-021
> 复检 Agent 代号：lens-monitor（监控性能可观测透镜）
> 所属轮次：round-1（阶段五复检）
> 体验对象：novel-forge v1.0.0（仓库 `C:/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge`，分支 main，dev 端口 3001，PostgreSQL 127.0.0.1:5432）
> 日期：2026-08-06
> 门禁现状（Chair 已核验）：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` EXIT=0；`npm test` 211 passed。

---

## 报告头（复检口径）

| 项 | 内容 |
|----|------|
| Agent 代号 / 透镜职责 | lens-monitor — 监控子系统（延迟面板、成本聚合、监控单测）可观测性与正确性 |
| 所属轮次 | round-1 阶段五复检 |
| 复验 IMP | IMP-019（延迟面板 projectId 透传）、IMP-020（成本聚合 30s 缓存）、IMP-021（监控单测 13 例） |
| 复验方法 | `git diff` + 源码逻辑推演 + 真机 curl + 真机 `npm test` |
| 诚实边界 | 仅基于真实源码、真实 curl 输出、真实测试运行；前端 React 渲染无法 curl 抓取，但正则 bug 为静态确定性缺陷，与构建无关 |

---

## 第一部分：用户体验视角（监控面板真实行为）

### 1. 延迟面板（GenerationLatencyPanel）真实走到哪一步
- 我以真实用户视角推演：进入工作区 `/workspace/<id>`，右侧「生成延迟」面板应只展示**当前项目**的延迟分布。
- 真机 curl 已证实：不带 `projectId` 调 `/api/generation-metrics` 会返回**全站聚合**（`overThreshold:true, sampleSize:83, P95=34415ms`）——即"全站红"。这正是 IMP-019 要消灭的现象。
- **但修复后的前端在最常见路由 `/workspace/<id>`（无尾斜杠）下根本取不到 projectId**（见 F1），于是它仍会以"无 projectId"方式打到后端，拿到全局红数据。用户实际看到的和修复前一模一样：每个项目都显示全站红告警。
- 结论：对走标准路由的用户，**IMP-019 的修复是"假收敛"**——代码改了，但用户可感知的误导行为未消除。

### 2. 成本监控面板（stats/monitor）切章体感
- 切章时 `nodeId` 变化、`projectId` 不变。IMP-020 缓存键为 `projectId`，因此切章命中缓存、跳过全月 `groupBy`，体感上不再卡顿——逻辑自洽（详见第二部分 IMP-020 复核）。未观察到跨项目串味。

### 3. 空状态 / 错误提示观感
- generation-metrics 后端对"无数据"返回 `empty:true`，前端 `GenerationLatencyPanel.tsx:125` 展示「尚无生成记录」引导文案，清晰、不显红。空态文案合格。
- 但后端**缺 projectId 时并不返回空态，而是返回全局红**（见 F2），防御性不足。

---

## 第二部分：总体视角（代码与架构正确性）

### IMP-019 复核（延迟面板 projectId 透传）
- 前端 diff（`GenerationLatencyPanel.tsx:80-83,88,107`）确实加了从 URL 提取 projectId 并透传、依赖项改为 `[projectId]`。
- 后端 `generation-metrics/route.ts` 的 `git diff` 为**空**——说明该路由**早已**支持 `if (projectId) where.projectId = projectId`（`:54`），后端无需改。修复重心本就应在前端透传，方向正确。
- **致命缺陷在正则本身**（F1）：`/workspace\/([^/]+)/` 要求 id 后紧跟斜杠。Next.js 默认无 `trailingSlash`（已查 `next.config.ts`），标准 pathname 为 `/workspace/<id>`，正则不匹配 → `projectId=undefined`。
- 我用 Node 实测了 4 种 pathname，确认 `/workspace/abc123` 与 `/workspace/abc123?x=1` 均 **NO MATCH**；仅 `/workspace/abc123/`、`/workspace/abc123/chapters` 能命中。即主工作区页（最常见入口）完全失效。

### IMP-020 复核（成本聚合 30s 缓存）
- diff 确认：`stats/monitor/route.ts:15-27` 新增 `MONITOR_CACHE_TTL_MS=30_000` + `Map` + `getCachedMonitor/setCachedMonitor`；`:110-171` 将 `llmUsage`/`projectLlm` 的聚合包进 `cachedMonitor ?? await (...)()`。
- 缓存键**含 projectId**（`:getCachedMonitor(projectId)` / `:setCachedMonitor(projectId,...)`）——满足"按 projectId"。
- **未命中才查**：`const { llmUsage, projectLlm } = cachedMonitor ?? await (...)`——满足条件（源码 `route.ts:108-110`）。
- 切章：`nodeId` 改变、`projectId` 不变 → 同键命中 → 跳过两次 `groupBy`，达成"切章不再重聚合"目标。
- **无跨项目串味**：缓存键是 projectId，不同项目不同键，`projectLlm`（按 projectId 分组）不会泄漏到别的项目。我推演了 A→B 顺序请求，B 的 `getCachedMonitor(B)` 为 null，独立重算，正确。
- 残留（F3）：`Map` 无 TTL 淘汰、无容量上限，长期运行进程会随 projectId 数量单调增长——慢内存泄漏（P2）。
- 备注（非缺陷）：`llmUsage` 是全局聚合（不含 projectId 过滤），却按 projectId 键冗余存储——同一全局值在每个项目键下各缓存一份，无害但冗余。

### IMP-021 复核（监控单测 13 例）
- 真机运行 `npm test -- src/core/auto-rate.test.ts src/app/api/generation-metrics/route.test.ts src/core/confirm-guard.test.ts` → **13 passed (13)**，3 文件全绿。
- 断言有意义，非"不报错"：
  - `auto-rate.test.ts`（5 例）：校验 `autoRate=0/100/33`、`reviewLogs` 非数组不误判、`countAutoConfirmed` 仅统计 confirmed+auto-confirm。
  - `generation-metrics/route.test.ts`（3 例）：校验空库→`empty:true`、带日志→`overThreshold=true` 且 `byProvider.local/cloud` 均真、且 `where.projectId==="abc"` 真正传入查询。
  - `confirm-guard.test.ts`（5 例）：校验空/过短/低分/合格/机械重复各分支的 `eligible` 与 `reason`。
- 零数据/极端值 NaN 排查：`computeAutoRate`（`auto-rate.ts:28`）有 `confirmedChapters > 0 ? ... : 0` 除零保护；`summarize`（`generation-metrics/route.ts:29-38`）空数组返回 `null`，`quantile`（`:20-27`）空数组返回 `0`。零数据不 NaN。极端值（超大 durationMs）走 `Math.round`，无 NaN 路径。

---

## 发现清单（结构化，附证据）

- **[F1] P1** — IMP-019 修复在标准路由下失效，全局红误导复现
  - **文件:行号**：`src/components/workspace/GenerationLatencyPanel.tsx:80-83`（正则 `/workspace\/([^/]+)/`）
  - **现象描述**：用户进入 `/workspace/<id>`（无尾斜杠，Next.js 默认），面板取不到 projectId，仍以无 projectId 方式请求，展示全站红延迟告警——与修复前一致。
  - **根因推测**：正则强制要求 id 后有 `/`，而真实路由 `src/app/workspace/[projectId]/page.tsx` 的 pathname 为 `/workspace/<id>`（无尾斜杠）；`next.config.ts` 未设 `trailingSlash`。
  - **复验证据**：Node 实测 `/workspace/abc123`.match(`/workspace\/([^/]+)/`) → `undefined`；curl 验证不带 projectId 的接口返回 `overThreshold:true`（全局红）。
  - **建议修法**：改用 `window.location.pathname.split("/")[2]` 或对 id 段允许行尾，如 `/\/workspace\/([^/?#]+)/`。

- **[F2] P2** — generation-metrics 后端对缺 projectId 未做防御（返回全局红而非空态）
  - **文件:行号**：`src/app/api/generation-metrics/route.ts:45-54,69-71`
  - **现象描述**：当不带 projectId 调用（例如任一路由回归、或被直接调用），后端回退为全站聚合并返回 `overThreshold:true`，而非 `empty:true`/400。与 integration 声称"不带 projectId 应返回空态不显红"不符。
  - **根因推测**：修复只在前端透传 projectId，后端未加"缺 projectId 即空态/拒绝"的防御分支（对照 `stats/monitor/route.ts:38-40` 已对缺 projectId 返回 400）。
  - **复验证据**：curl 不带 projectId → `{"ok":true,"empty":false,...,"overThreshold":true}`；带不存在 projectId → `{"ok":true,"empty":true}`。
  - **建议修法**：后端在 `projectId` 缺失时直接 `return NextResponse.json({ok:true, empty:true})` 或 400，避免任何调用方触发全局红。

- **[F3] P2** — stats/monitor 缓存 Map 无上界，长期运行内存泄漏
  - **文件:行号**：`src/app/api/stats/monitor/route.ts:21-27`（模块级 `monitorCache = new Map()`）
  - **现象描述**：缓存条目永不淘汰、无容量上限，进程存活越久、不同 projectId 越多，Map 越大。
  - **根因推测**：仅以 TTL 判断命中与否，命中后不清理过期键，也不限制 Map 大小。
  - **复验证据**：源码 `getCachedMonitor` 仅在 `Date.now()-hit.ts < TTL` 时返回，无 delete/裁剪逻辑；`setCachedMonitor` 仅 `set`，无容量检查。
  - **建议修法**：命中后顺手 `delete` 过期键（懒淘汰），或加 `maxSize` 环形裁剪。

- **[F4] 信息（不计入残留）** — llmUsage（全局）按 projectId 键冗余缓存
  - **文件:行号**：`src/app/api/stats/monitor/route.ts:21-27,168`
  - **现象描述**：全局聚合被存到每个 projectId 键下；同一全局值重复缓存，无害但浪费。
  - **说明**：非正确性 bug，仅作架构备注；不计入 P 级残留。

---

## 诚实边界

- 前端 React 渲染结果无法用 curl 抓取，但 F1 为**静态确定性正则缺陷**（pathname 字符串匹配），与是否构建/运行时无关，已用 Node 实测 4 种 pathname 佐证，确定性高。
- IMP-020 缓存"无跨项目串味"为源码推演结论（键=projectId、不同项目不同键），已穷举 A→B 顺序请求路径验证；未做百万级并发压测，但不影响该结论。
- IMP-021 的 13 例为真实 `npm test` 运行产物（输出见上），非编造；断言具体数值/字段，非"仅不报错"。
- `npm test` 全量 211 passed 与 `tsc --noEmit` EXIT=0 为 Chair 已核验门禁，本透镜未重跑全量（仅针对 IMP-021 三文件重跑确认绿）。

---

## 复验证据汇总

| 验证项 | 命令/方法 | 结果 |
|--------|-----------|------|
| IMP-019 后端空态 | `curl .../api/generation-metrics?projectId=nonexistent` | `{"ok":true,"empty":true}` ✓ |
| IMP-019 后端全局红 | `curl .../api/generation-metrics`（无 projectId） | `overThreshold:true, sampleSize:83` ✓（证明缺 projectId 即红） |
| IMP-019 前端正则失效 | Node 实测 `/workspace/abc123`.match(re) | `undefined` ✗（F1） |
| IMP-020 缓存键含 projectId | 读 `getCachedMonitor(projectId)/setCachedMonitor(projectId,...)` | 含 projectId ✓ |
| IMP-020 未命中才查 | 读 `cachedMonitor ?? await (...)` | 满足 ✓ |
| IMP-020 无跨项目串味 | 源码推演 A→B 顺序 | 不同键不泄漏 ✓ |
| IMP-021 测试绿 | `npm test -- <3 files>` | 13 passed (13) ✓ |
| IMP-021 零数据 NaN | 读 `auto-rate.ts:28` / `quantile:20-27` | 有除零保护与空返回，无 NaN ✓ |

---

## 本透镜复验结论

IMP-019 **未真正修复**（标准路由下前端正则失效，全局红误导复现，属假收敛）；IMP-020 **逻辑正确**（缓存键含 projectId、未命中才查、无跨项目串味，仅缓存无上界属轻微）；IMP-021 **已落地且真机全绿**（13/13，断言有意义，零数据无 NaN）。

**残留问题数：P0=0，P1=1（F1），P2=2（F2、F3）。**
