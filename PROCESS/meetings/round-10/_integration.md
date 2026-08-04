# Round 10 整合报告（v0.46.72 复验 → L2 实施清单）

> Chair 整合 6 份 L1 只读复验报告（墨白/青砚/阿游/工坊/清览/磐石）。
> 结论：**Round 9 修复 5 透镜完全通过，仅清览 explore 右抽屉未闭环（重判 P1）；本轮挖出 11 个 P1（零 P0）**，必须进 L2 闭环。
> 执行纪律：6 个 L2 Agent 各自限定文件实现 + 自测；**禁止**改 version/changelog/MEMORY；Chair 等全部写入后统一跑 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 门禁（避免并行 tsc 竞态假象）。

## 一、L1 回归总判定（Round 9 修复是否真落地）
| 透镜 | Round9 修复 | 回归结果 |
|---|---|---|
| 墨白 | P1-A 全跳过 error 区分 no_dirty/all_skipped_mislabeled；P1-D 脏标记清除灭死循环 | ✓ 通过（vitest 16/16） |
| 青砚 | 含数字≥3字关键词数字边界守卫（「2049年」不误命中「12049年」） | ✓ 通过（match.test 28/28） |
| 阿游 | game-engine catch 区分 AbortError（abort 不再当 LLM 失败） | ✓ 通过（game-engine.test 15/15） |
| 工坊 | N1 regex `?` 移出 repeated；N2 Project.importSource @unique 幂等 | ✓ 通过（regex.test 23/23） |
| 清览 | 三页窄屏抽屉无障碍 | ⚠️ 部分：5/6 通过，**explore 右抽屉漏接（重判 P1 N6）** |
| 磐石 | N1 stream_options 真实记账；N2 默认模型定价；N3 陈旧锁清理 | ✓ 通过（vitest 10/10） |

## 二、L2 实施清单（11 P1，按透镜分派；另收 2 项高价值 P2 作 bonus）

### 墨白（fill.ts 家族，4 P1）
- **P1-B**：`babyloreFill`（fill.ts:381-435）不跑 `selfCheckFill`（仅 `babyloreFillAll:546` 末态调）。改：在 `babyloreFill` 落库后调 `selfCheckFill(projectId)`，把 `issues` 并入 `FillResult`；`loop.ts` 的 `safeFillAfterWriting` 也把 issues 透传 UI。
- **P1-C**：`applyOps`（fill.ts:274-359）无效 op 仅 `warnings.push+continue`，丢失的 op 无可追溯。改：`applyOps` 返回 `skippedOps:{op,reason,table}[]`；`babyloreFillAll` 并入 `FillAllResult`（UI 读取可选，本轮回写结构即可，不强求新 UI）。
- **P1-E**：insert 去重（fill.ts:296-310）/ update 按名合并（321-325）撞名不同实体静默并。改：合并命中且待写字段与已有行存在非空冲突时，selfCheckFill 增补「表内同名不同源章节」弱告警（不静默覆盖即可）。
- **P1-F**：`prisma.loreTable.update` 整体覆盖 `rows`（fill.ts:356），无溯源。改：每行写入时附 `_src`（章节 order + 填表批次 id）与 `_ts`（ISO 时间）字段——**rows 为 JSON 列，不需改 schema / 不跑 prisma generate**。

### 阿游（游戏家族，3 P1）
- **N1**：`game/start/route.ts:108-119` `initialItems.push` 未写 `owner`。改：`owner: change.owner || "主角"`（与 processGameTurn 对齐）。
- **N2**：`game/start/route.ts:146-155` 响应无 `items` + `game/[nodeId]/page.tsx:174` 硬置 `items:[]`。改：响应补 `items: initialItems`；前端 `handleStart` 收到后用 `applyFrontendItemChanges([], data.itemChanges, 1)` 预建，使首轮即与后端一致。
- **N3**：`game-prompts.ts:18-23` OP_MAP 仅 4 词，同义动词（拾取/佩戴/吃掉/丢掉…）透传后 `applyItemChanges` 静默丢物。改：扩展 OP_MAP 覆盖常见同义词；真未知动词 `console.warn` 且默认当 gain 处理（避免无提示丢物）。

### 清览（explore 抽屉，1 P1）
- **N6**：`explore/page.tsx:686` 右抽屉（`已采纳`面板）缺 `role="dialog"`/`aria-modal`/`aria-labelledby`，`rightDrawerRef` 未挂载致焦点陷阱/ESC 失效。改：与左抽屉（:631-641）对齐——补 `ref={rightDrawerRef}`、`tabIndex={-1}`、`role={rightDrawerOpen?"dialog":undefined}`、`aria-modal`/`aria-labelledby`（关联新增 sr-only `<h2 id={rightDrawerTitleId}>已采纳</h2>`）。

### 磐石（import/perf 家族，3 P1）
- **F2**：`import/parse/route.ts:240-242` 用 `countTokens` 估算，丢弃 `data.usage` 真实值。改：成功分支用 `data.usage.prompt_tokens/completion_tokens`（缺失退回 `countTokens` 兜底），与 commit/mergeOneBatch 口径统一。
- **F3**：`import/commit/route.ts` `globalContext` 逐批重复发送（约 30 万+ token 冗余 + 后段丢失）。改：`mergeOneBatch` 仅拼与本批相关的邻近角色/词条名清单，或压缩 globalContext 上限并去重；保留 globalContext 构造但降低重复。
- **F4**：`import/parse/route.ts:365-392` 分块串行，超大书超 `maxDuration(300s)` 被强杀。改：分块解析改为**限流并发**（如 4 路 `Promise.all` 池），保留 SSE 进度推送；完整后台任务迁移留作后续，本轮只解超时截断。

### 青砚（P2 bonus，高价值低风险的去重，属本透镜核心）
- **G4+G5**：`agent/apply-extraction/route.ts:64-139` 建卡不查重。改：create 前 `findFirst({where:{projectId,name:{equals:name,mode:'insensitive'}}})`；复用 `entity-auto-creator.ts` 的 `isSimilarName` 做繁简/变体去重；已存在则跳过/复用。

### 工坊（P2 bonus，预设静默失败，属本透镜核心）
- **N5**：`presets/[id]/apply/route.ts:177-186` `api_config` 浅合并污染 `llmConfig`。改：按 `llmConfig` 子键白名单逐层深合并，剔除非配置键。
- **N6**：同上 `apply` 未知 type 静默 no-op 仍写 `appliedPresets`/`downloads+1`。改：`else { return 400 未知预设类型 }`，杜绝静默失败。

## 三、文件归属（避免并行冲突）
| Agent | 拥有文件 |
|---|---|
| 墨白 | src/core/babylore/fill.ts、loop.ts、新增 src/app/api/babylore/clear-filled/route.ts、tables/page.tsx（P2-① 展示 fillErrorMeta） |
| 阿游 | src/app/api/game/start/route.ts、src/core/game/game-prompts.ts、game-engine.ts、src/app/workspace/[projectId]/game/[nodeId]/page.tsx |
| 清览 | src/app/explore/page.tsx |
| 磐石 | src/app/api/import/parse/route.ts、src/app/api/import/commit/route.ts、src/app/api/stats/monitor/route.ts（F6 顺带修 since 硬编码） |
| 青砚 | src/app/api/agent/apply-extraction/route.ts |
| 工坊 | src/app/api/presets/[id]/apply/route.ts |

## 四、终止条件判定
本轮 **P1 = 11 > 0，未达「全员无 P0/P1」终止条件**，继续 L2 闭环。若 L2 全修且 L3 tsc 零错误、Round 11 复验无回流，则下一轮可达终止。
