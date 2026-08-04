# Round 12 复验报告 · 墨白透镜（babylore 填表 / 防重复 / 归属可信度 / 数据底座）

> 复验对象：novel-forge @ HEAD `1cee64d`（Round 11 落地，tsc 0 错误，144 vitest 全过）
> 只读复验，未修改 src/ / changelog / version / MEMORY。

---

## 一、回归结论（Round 11 墨白透镜修复，逐项 PASS/FAIL）

| # | 复验点 | 结论 | 证据 |
|---|--------|------|------|
| A1 | `babyloreFill` 透传 `chapterOrder: nodeOrder` | **PASS** | `src/core/babylore/loop.ts:166` → `babyloreFill(projectId, content, { projectLlmConfig, chapterOrder: nodeOrder })`；`fill.ts:465` 用其拼 `ch${chapterOrder}:batch...`，写入行 `_src` 形如 `ch3:batchmanual`（章节段非空），溯源主链路已接回 |
| A2 | `babyloreFillAll` 全跳过判定重写 | **PASS** | `fill.ts:47` 联合类型已含 `"all_clean"`；`fill.ts:607-622` 仅在 `ghostIds`（脏标记中 DB 找不到正文章节的幽灵 id）存在时判 `all_skipped_mislabeled`（ok:false 诱导清理），否则判 `all_clean`（ok:true 不诱导） |
| A3 | 清理按钮显示条件改为 `... && !fillAllResult.ok` | **PASS** | `src/app/workspace/[projectId]/tables/page.tsx:320` → `{fillAllResult.fillErrorMeta?.kind === "all_skipped_mislabeled" && !fillAllResult.ok && (` |
| A4 | `fill.ops.test.ts` 断言同步（注入 ghost-999 才判 mislabeled） | **PASS** | `fill.ops.test.ts:169-180` 断言干净跳过 `kind==="all_clean"`；`:213-227` 注入 `markChapterFilled("proj-p1a-mis","ghost-999")` 后断言 `kind==="all_skipped_mislabeled"` 且 `error` 含 `ghost-999`，与 `fill.ts:617/621` 实现一致 |

**结论：A1–A4 全部真实落地、无回归。** 但 A1 的修复仅覆盖 `write` 路由，详见下「B1/B2」。

---

## 二、新挖问题清单（墨白透镜 · 按 P0/P1/P2）

> 严重级：P0=数据丢失或错误归属；P1=可见质量缺陷；P2=可优化。

### B1 · P1（临界 P0：错误归属）· 续写/微调路由未透传 nodeOrder+nodeId，归因与防重复双双失效
- **文件:行**：`src/app/api/generate/continue/route.ts:243`、`src/app/api/generate/refine/route.ts:194`
- **现象**：二者调用 `safeFillAfterWriting({ projectId, content, send, projectLlmConfig })`，**既无 `nodeOrder` 也无 `nodeId`**；而 `write/route.ts:304-312` 已正确传入。结果：续写/微调章节写入行的 `_src` 恒为 `ch?:batchmanual`（章节段缺失），且因无 `nodeId` 永不调用 `markChapterFilled`。
- **根因**：Round 11 只把 `nodeOrder` 补进 `write` 路径，`continue`/`refine` 路径的 `chapterOrder`（`:234`/`:183` 已算好）未复用进 `safeFillAfterWriting`。
- **影响**：① 错误归属——该两类章节所有表格行溯源章节不可知（rubric 定义的"错误归属"，临界 P0）；② 表内同名异源弱告警（P1-E）因解析不到真实章节段（`src.split(":")[0]`→`ch?`）永不触发；③ 防重复失效致一键填表对这些章节重复跑 LLM（靠 `applyOps` 按名去重兜底，不造重复行，仅浪费 token）。
- **建议改法**：`continue` 改 `safeFillAfterWriting({ projectId, content: fullContent, send, nodeOrder: (nextNode as any).order, nodeId: nextNode.id, projectLlmConfig })`；`refine` 改传入 `(data.currentNode as any).order` 与 `nodeId`。与 `write` 对齐即可复用 A1 修复。

### B2 · P1 · 手动填表 API 未传 chapterOrder，同源归因缺口
- **文件:行**：`src/app/api/babylore/fill/route.ts:15` → `babyloreFill(projectId, chapterText, { tableKeys })`
- **现象**：tables 页「粘贴正文→运行自动填表」走此入口，未传 `chapterOrder`，写入行 `_src` 恒 `ch?:batchmanual`。
- **根因**：前端 `runFill`（page.tsx:123）未携带当前章节信息，路由也未补。
- **建议改法**：tables 页单填若能关联章节（节点选择/章节下拉）则携带 `chapterOrder`+`nodeId`；否则在 `babyloreFill` 的 `srcLabel` 对"无章节"场景明确标注 `manual`（已是 `batchmanual`，可接受），但**至少保证续写/微调（B1）补上**。B2 优先级低于 B1。

### B3 · P2 · `fillErrorMeta.nodeIds` 回传的是干净真实节点，幽灵 id 仅埋在 error 串，UI 展示误导
- **文件:行**：`fill.ts:556,613-617`（`skippedNodeIds` vs `ghostIds`）、`page.tsx:312-318`
- **现象**：`all_skipped_mislabeled` 时 `fillErrorMeta.nodeIds` = `skippedNodeIds`（被跳过的真实干净节点，如 c1/c2），而真正的幽灵 id 只出现在 `error` 文本（`[ghost-999]`）。UI 据此渲染"问题节点=[c1,c2]"，把干净节点标成脏。
- **根因**：`ghostIds` 已算出但未并入 `FillErrorMeta`（类型 `fill.ts:45-54` 无该字段）。
- **建议改法**：`FillErrorMeta` 增 `ghostIds?: string[]`，在 `:617` 赋值 `ghostIds`；UI 优先展示 `ghostIds`，避免误导。

### B4 · P2（大表升至 P1）· selfCheck 疑似问题 `slice(0,200)` 静默截断，弱告警被丢弃
- **文件:行**：`fill.ts:788` `issues: issues.slice(0, 200)`；叠加 `page.tsx:305` 再 `slice(0,40)`
- **现象**：项目表行数/疑似问题 >200 时，超出部分被悄悄裁掉，既不报警也不聚合，"弱告警静默丢失"。
- **建议改法**：返回总数 `totalIssues` 与 `cap`，前端提示"仅展示前 N/共 M 条"；或将截断上移到 500 并分页。

### B5 · P2 · 防重复"已填"标记持久化于本地 JSON（非 DB），容器/目录重置即全清
- **文件:行**：`fill.ts:87` `FILLED_PATH = .../.runtime/babylore-filled.json`
- **现象**：`.runtime` 为本地目录，非 Prisma/DB。部署重置、清缓存后所有已填标记丢失 → 一键填表整库重跑（靠去重兜底不造重复，但全量重跑 LLM 浪费 token，且 `markChapterFilled` 前出现"误判无脏→all_clean"的窗口）。
- **建议改法**：将"已填标记"落 `storyNode` 字段（如 `babyloreFilledAt`）或独立表；或至少在 `.runtime` 之外提供重建入口。属"数据底座完整性"隐患。

### B6 · P2 · 跨表同名异源仅"报告"不提供合并/迁移动作，重复行长期滞留
- **文件:行**：`fill.ts:734-781`（跨表同名→只 push issue，无合并）
- **现象**：人名误写进地点表等跨表同名仅告警，系统永不自动合并或提示迁移，重复数据长期存在。
- **根因**：P1-E 设计取舍"仅报告不自动合并，避免回归"。
- **建议改法**：在前端对跨表同名 issue 增加「合并到主表 / 迁移」按钮，复用 `applyOps` 的 update+delete 协议，半自动消化重复行。

### B7 · P2 · `clearFilledChapters` 不区分幽灵 id，清理出口无反馈明细
- **文件:行**：`fill.ts:111-126`、`clear-filled/route.ts:18-19`
- **现象**：清理返回 `cleared` 总数，但不告知其中多少是幽灵 id；`clearDirtyAndRefill`(page.tsx:183) 一键清全项目标记后整库重填，可能把本就干净的章节也重跑。
- **建议改法**：`clearFilledChapters` 返回 `{ cleared, ghost }`；UI 对"纯幽灵"场景仅清幽灵 id 而非全清，缩小重填面。

---

## 三、小结
- 回归 A1–A4 全部 **PASS**，Round 11 墨白修复真实有效、无回归。
- 新挖：**P0=0，P1=2（B1、B2，同源根因：chapterOrder/nodeId 透传缺口），P2=5（B3–B7）**。
- 最需优先修的是 **B1**：`write` 已修、`continue`/`refine` 漏修，使续写/微调章节仍写 `ch?:batchmanual` 且防重复失效——属"错误归属"临界 P0，建议下一轮补 `nodeOrder`+`nodeId` 对齐 `write`。
