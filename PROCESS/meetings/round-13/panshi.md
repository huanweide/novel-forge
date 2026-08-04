# Round 13 诊断报告 · 磐石透镜（监控 / 成本 / import 记账）

> 角色：会员股东「磐石」——真实使用者 + 监控后台视角，只读诊断，**未改动任何源码/配置**。
> 产品位置：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge\`
> 版本基线：HEAD=`c820c82`（Round 12 文档收尾，v0.46.77）；dev 服务 `http://127.0.0.1:3001`（HTTP 200）。
> LLM：DB `AppSettings` 已配真实 DeepSeek，`deepseek-v4-flash`（api.deepseek.com），推理模型；实测 `import/parse` 真实返回 3 角色 / 42.1s。
> 方法：① curl 真实 API（monitor / import-parse 实测）；② 逐文件读源码取证（file:line）；③ 全局体验清单交叉核对。沙箱无 Chromium，纯浏览器交互项标注「需本地浏览器验收」。

---

## 概要（一句话结论）
监控-成本-import 主链路稳健：**P_a**（commit 270s 优雅 partial）、**P_b**（parse/commit totalTokens 口径统一）、**N1**（推理模型 reasoning token 真实计入 completionTokens）、**llmCallLog 真实落库**均验证通过；但 **P_c「按项目成本」聚合虽已实现，却因主流量路径（client.ts 生成 + import parse/commit）未注入 `projectId`，线上 89% 的 LLM 调用归入 `null`，per-project 成本面板严重失真**——这是本轮唯一必须修的 **P1**；另发现 commit 在超大导入下「事务写」阶段可能越过 300s 平台强杀的潜在 P1（边缘，需超大导入复测）。

---

## 一、Round 12 修复回归（P_a / P_b / P_c / N1）

| 验收点 | 结论 | 证据 |
|---|---|---|
| **P_a** commit 全局 deadline 270s 优雅 partial | **稳** | `import/commit/route.ts:372` `COMMIT_DEADLINE_MS=270_000`；`:374-375` `pastDeadline()`；`:405-409` worker 取批前检测、到点 `deadlineHit=true` 并回报 `⏱️ 全局 deadline 到点，停止放飞新批`；`:698-701` `status: deadlineHit ? "partial" : "completed"`，未放飞批次在事务内走 `ruleMerge` 兜底。逻辑完整。 |
| **P_b** parse/commit totalTokens 口径统一 | **稳** | `import/commit/route.ts:139` `totalTokens: usage?.total_tokens ?? usage?.totalTokens ?? (promptTokens + completionTokens)`；`import/parse/route.ts:244` 同式。蛇形/驼峰双兼容 + 缺失回退求和，已对齐。 |
| **P_c-1** 填表路径补记账 | **稳（局部）** | `src/core/babylore/fill.ts:359-367` 已带 `projectId: projectId ?? null` 落库；`src/app/api/generate/outline/route.ts:233-241` 同样带 `projectId`。 |
| **P_c-2** monitor 按项目 token/费用聚合 | **代码稳，数据失真（见 P1-1）** | `stats/monitor/route.ts:114-141` 已实现 `projectAgg`（按当前 projectId 过滤）+ `projectByProject`（groupBy projectId）查询，UI `MonitorPanel.tsx:138-156` 渲染「当前项目·本月」+「占全局比」。但上游绝大多数调用不传 projectId，聚合结果被 `null` 吞噬。 |
| **P_c-3** usage% 自洽 | **稳** | `src/app/api/generate/preview-context/route.ts:218-224` 分母用真实 `contextWindowSize`（否则 `budget.total||1` 防 0），分子 `budget.used`，`Math.max(0, Math.min(100, pct))` 夹取，杜绝 >100%/负值/NaN。 |
| **N1** 推理模型 reasoning token 计入 completionTokens | **稳** | `src/core/llm/client.ts:342-347` 流式读 `delta.reasoning_content` 计入 completionTokens；关键在 `:358-361` `data.usage` 到达时**覆盖** `promptTokens/completionTokens` 为供应商真实值（DeepSeek 的 `completion_tokens` 已含推理 token）。最终落库用真实 usage，reasoning 不漏算。 |

---

## 二、P0（无）

无 P0。无数据安全/崩溃级问题。

## 三、P1（2 条）

### P1-1 · 按项目成本面板失明——主流量路径未注入 `projectId`，89% 调用归入 `null`
- **文件**：`src/core/llm/client.ts:400-408, 412-420, 445-454, 459-467`（chat/chatStream 四处 `recordLlmCall` 均无 `projectId`）；`src/app/api/import/parse/route.ts:244`（无 `projectId`）；`src/app/api/import/commit/route.ts:134-141`（无 `projectId`）；`src/core/pipeline/plan-chapter.ts:124-131`、`src/app/api/characters/expand/route.ts:81-88`（均无 `projectId`）。
- **现象（真实 API 证据）**：`GET /api/stats/monitor?projectId=79bd79a4-…`（R12-E2E-M2b）
  - 测试前：`llmUsage.totalCalls=99`，`byProject` 中 `{projectId:null, calls:88, tokens:581468, cost:0.03498}` —— **88/99（89%）无项目归属**；该 project 自身 `calls:3, tokens:3600, cost:0.00071`。
  - 实测 `POST /api/import/parse`（同 projectId，真实返回 3 角色）后复查：`totalCalls=104`，**`null` 桶 88→91（+3）**，而该 project 计数器**仍为 3（不变）**。证明 import 调用全部落入 `null`，per-project 面板对该 project「视而不见」。
  - 占比推算：`0.03498 / 0.03848 ≈ 91%` 的本月成本属于「未分配项目」。
- **根因**：成本记账单点 `recordLlmCall`（`src/lib/llm.ts:247`）虽接受 `projectId`，但最高频的调用方——统一客户端 `client.ts`（承载正文 write/refine/continue/summarize 等全部生成）与 import parse/commit、plan-chapter、characters/expand——均未传入 `projectId`。仅 babylore 填表（`fill.ts:366`）与大纲生成（`outline:240`）两路传入。
- **影响**：用户看「当前项目·本月」只看到填表+大纲的零星调用，**正文生成与导入解析/合并的全部花费都被藏进 `null`**；`MonitorPanel.tsx:152` 的「占全局比」用 `projectLlm.totalTokens / llmUsage.totalTokens` 计算，对 R12-E2E-M2b 仅显示 `0.6%`，严重误导成本判断。本质与 Round 12 用户#16「想看每个项目 AI 花费」的诉求相悖。
- **建议修复方向**：
  1. 在 `client.ts` 的 `LLMRequest` 增加 `projectId?`，`chat()/chatStream()` 落库时透传（`recordLlmCall({…, projectId: request.projectId ?? null})`）；上层生成路由（write/refine/continue/summarize）已持有 `projectId`，直接注入。
  2. 给 `import/parse:244`、`import/commit:134`、`plan-chapter:124`、`characters/expand:81` 补 `projectId`。
  3. 短期兜底：在 `MonitorPanel` 显式渲染 `null` 桶为「未分配项目：X%」，避免用户误以为自己项目花费很低。

### P1-2 · commit 超大导入下「事务写」阶段可能越过 300s 平台强杀（潜在静默失败）
- **文件**：`src/app/api/import/commit/route.ts:16`（`maxDuration=300`）、`:372`（deadline 270s）、`:102`（`TIMEOUT_MS=45000` 单批）、`:419`（await 所有 worker）、`:571`（整体事务写）。
- **现象/推演**：merge 阶段有 270s 总闸，但单批 `mergeOneBatch` 超时高达 45s。若最后一批在 ~270s 临界放飞，最迟 ~315s 才结束 → `Promise.all(workers)` 在 ~315s 才 resolve → **事务写（`:571`）在 300s 平台硬杀之后才启动**，请求被切断、事务未提交即回滚。SSE 已回报「合并中…」却永不发 `done`，用户端表现为超时/连接断开，**导入数据未落库（算力+数据双失）**。
- **影响**：仅对「大到逼近 270s deadline 的导入」触发（数百角色/词条级），典型小导入无碍；但一旦触发即为静默失败，与 P_a 想消灭的「整段丢弃」同源。
- **建议修复方向**：
  1. 收紧余量：将 `COMMIT_DEADLINE_MS` 从 270s 降到 ~240s，并/或将 `TIMEOUT_MS` 单批降到 30s，确保「merge 截止 + 最迟一批 + 事务写」落在 300s 内；或
  2. 解耦：merge 结果先落临时表/任务，DB 写改为后台任务（不依赖 SSE 请求生命周期），从根本上避开平台 maxDuration。
- **诚实标注**：本项无法在沙箱小文本触发 270s，需本地/超大导入复测确认边界。逻辑推演成立，列为 P1（边缘）。

---

## 四、P2（5 条，均为 Round 12 已记录、本轮未修，复核仍成立）

### P2-1 · totalTokens 回退口径不一致（部分调用方回退为 0）
- **文件**：`src/core/babylore/fill.ts:364`、`src/core/pipeline/plan-chapter.ts:129`、`src/app/api/generate/outline/route.ts:238`、`src/app/api/characters/expand/route.ts:86`、`src/core/llm/client.ts:236` 均用 `?? 0`；而 `import/parse:244` / `import/commit:139` 用 `?? (promptTokens+completionTokens)`。
- **现象**：若供应商不返回 `total_tokens`，上述 5 处会把 `totalTokens` 记 0，monitor 的 `llmUsage.totalTokens` 聚合低估。DeepSeek 当前返回 `total_tokens` 故线上未暴露，但属潜在失真。
- **建议**：统一改为 `?? (promptTokens + completionTokens)`。

### P2-2 · import parse 失败记账按 attempt 刷行，虚增 monitor 调用数
- **文件**：`src/app/api/import/parse/route.ts:209,233,253,257`（`callFlash` 内 `recordFail`，每次 attempt 各记一条，`CALLFLASH_MAX_RETRIES=2` → 单块失败最多 3 行 `fail:import_parse`）。
- **现象**：`monitor.totalCalls` 按 `_count` 展示，失败重试被重复计数（金额=0，但调用次数指标失真）。
- **建议**：`recordFail` 改为每次 `callFlash` 调用只记一次。

### P2-3 · recordLlmCall 全量 fire-and-forget，重导入并发下静默丢记账
- **文件**：`src/lib/llm.ts:249-265`（`prisma.llmCallLog.create().catch(()=>{})` 不 await）；调用点 parse/commit。
- **现象**：parse 4 worker + B 路、commit 4 路并发各自写库，DB 抖动时失败被静默吞 → 成本看板系统性低估（仅影响监控）。
- **建议**：导入路径改用有界批量写或对失败计数告警（SSE 末帧附 `llmLogDropped`）。

### P2-4 · commit 幂等锁清理 fire-and-forget，失败残留
- **文件**：`src/app/api/import/commit/route.ts:345-349, 710-714`（`finally` 内 `deleteMany().catch(()=>{})`）。
- **现象**：清理失败静默丢弃；`STALE_LOCK_MS=15min` ≫ `maxDuration=5min`，同进程崩溃场景残留窗口偏长。
- **建议**：陈旧阈值收窄到 ~6min；清理失败记 warn 日志。

### P2-5 · import parse 世界采样与 chunk[0] 头部 16k 重叠重复计费
- **文件**：`src/app/api/import/parse/route.ts:381,422`（分块模式 `buildLoreSample(text)` 的 `HEAD=16000` 与 chunk[0] `text.slice(0,~16000)` 重叠）。
- **现象**：长文里这 16k 被 A 路、B 路各发一次，浪费 ~16k 输入 token/次解析。
- **建议**：世界采样跳过与 chunk[0] 重叠的头部，或复用 chunk[0] 文本。

---

## 五、全局体验清单（用户 20 点精神）交叉核对

> 本透镜聚焦监控-成本-import；纯交互/视觉项沙箱无法跑，标注「需本地浏览器验收」。凡能读源码取证的已给 file:line。

- **import 世界卡去重**：`import/commit/route.ts:521-524` 按 `title.toLowerCase()` 内存查重；`:517` 同批 `seenLoreTitles` 去重防 `createMany` 重复行；角色侧 `:430-456` 按名+别名查重。逻辑在位 → 需浏览器验证渲染无重复卡。
- **填表溯源（_src 章节段）**：Round 12 已修 write/refine/continue/babylore 透传 `chapterOrder+nodeId`（`round-12/_integration.md` M1），`fill.ts:366` 已带 projectId。→ 需浏览器验收溯源链。
- **LLM 上下文记忆**：非本透镜核心；`preview-context/route.ts` 预算注入逻辑在位。→ 需浏览器验收跨章记忆。
- **游戏流畅度 / 按钮意义·教程·防误触**：非本透镜核心；N1 已保推理模型正文非空。→ 需本地浏览器验收。
- **a11y**：Round 11 `inert` 焦点陷阱（React19 布尔语义）已生效；Round 12 L1 已补 CommandPalette/Toast 输入框 `aria-label`、Modal/遮罩 `aria-hidden`（`round-12/_integration.md` L1）。→ 需本地浏览器用 axe 复验。
- **监控面板 SSR 渲染**：`/api/stats/monitor` 返回结构完整（见上真实响应），`MonitorPanel.tsx` 渲染分支齐全。SSR 取数正常。

---

## 六、诚实标注「需本地浏览器验收」项
1. import 超大导入（数百角色/词条）触发 270s deadline + 300s 平台边界的真实行为（P1-2 复测）。
2. 真实 LLM 生成下 `client.ts` 流式 reasoning token 计数与 `usage%` 可视表现（N1 仅源码+聚合验证，未目视）。
3. 世界卡去重、填表溯源、游戏流畅度、按钮教程/防误触、a11y（axe）的浏览器交互验证。
4. per-project 成本面板在真实多项目生成场景下的视觉误导程度（P1-1 的 UI 侧确认）。

---

## 七、本轮是否还有 P0/P1 建议
**是。**
- P0：**0 条**。
- P1：**2 条** ——
  - **P1-1**（必修）：per-project 成本面板因 `client.ts` 生成 + `import parse/commit` 等主流量未注入 `projectId`，线上 89% 调用归入 `null`，按项目费用/占比严重失真（真实 API 已复现）。
  - **P1-2**（边缘，需超大导入复测）：commit 在逼近 270s deadline 的超大导入下，事务写阶段可能越过 300s 平台强杀，导致静默导入失败。
- P2：5 条（均为 Round 12 已记录、本轮复核未修，口径不一致/记账虚增/静默丢/锁残留/重叠计费）。

> 一句话给 Chair：监控-成本-import 主修复全稳，但 P_c「按项目费用」被上游 projectId 断流架空（89% 归 null），这是本轮唯一必须补的 P1；另建议在 commit 收紧 270s/45s 余量以防超大导入被平台强杀。
