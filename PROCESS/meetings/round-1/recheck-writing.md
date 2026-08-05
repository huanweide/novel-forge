# 阶段五复检报告 · 写作主流程透镜

- **Agent 代号 / 透镜职责**：写作主流程复检子 Agent（MaxLoop 魔王系统 · 阶段五）
- **所属轮次**：round-1
- **体验对象**：novel-forge（AI 小说写作工具）· 工作副本 `C:/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge` · 分支 main · dev 端口 3001（健康 200）· PostgreSQL 127.0.0.1:5432
- **复验范围**：上轮 round-1 阶段四"声称修复"的 IMP-002 / IMP-003（写作侧）/ IMP-004 / IMP-005 / IMP-019 / IMP-023 / IMP-024
- **日期**：2026-08-05
- **门禁现状（Chair 已核验）**：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` EXIT=0；`npm test` 211 passed

> 复验纪律：每个 IMP 均 `git diff` + 读上下文 +（必要时）真机 curl dev/DB + 跑相关单测。禁止以"未发现"冒充"没问题"。沙箱无 Chromium，纯浏览器视觉（toast 动画、抽屉开合）标注"需本地目测"。对仍声称"已修复"但缺乏自动化覆盖的项，如实标注测试缺口。

---

## 第一部分：用户体验视角（复验结论 + 复验证据）

### IMP-002 ｜ skipLatestChapter 死计算（isLatestChapter 恒 false 不生效）

**复验结论：已真实修复，5 处调用站点 + write 路径全部改用"node.order === 项目最大 order"计算透传，无残留硬编码 `false`。**

- **复验证据（git diff + 全仓 grep 交叉验证）**：
  - `grep -rn "isLatestChapter: *false" src/` 返回 **NONE（clean）** —— 无任何站点仍硬编码 `false`。
  - 五个写/确认站点现已计算透传：
    - `src/core/confirm-guard.ts:117-123`（`applyConfirm`）：`agg = prisma.storyNode.aggregate(... _max:order)` → `isLatestChapter = node.order === (agg._max.order ?? node.order)`；被 `auto-confirm/route.ts:93`、`game-engine.ts:650`、`post-processor.ts:231` 复用。
    - `src/app/api/story/nodes/[id]/route.ts:170-177`（手动 confirm）：同算法。
    - `src/app/api/story/nodes/batch-confirm/route.ts:35-39,81`：先算 `maxOrderAgg._max.order`，逐节点 `node.order === maxOrder`。
    - `src/app/api/generate/refine/route.ts:195-206`（Chair 扩充）：`refineIsLatest = data.currentNode.order === (agg._max.order ?? data.currentNode.order)`。
    - `src/app/api/generate/continue/route.ts:244-255`（Chair 扩充）：`contIsLatest = (nextNode).order === (agg._max.order ?? (nextNode).order)`。
    - 既有 write 路径 `src/app/api/generate/write/route.ts:74`：`isLatestChapter = currentNodeIndex === data.allNodes.length - 1`（本就正确，一致性已确认）。
  - 真正生效的门控在 `src/core/babylore/loop.ts:127-132`：`skipLatest = cfg?.skipLatestChapter ?? false`，当 `skipLatest && isLatestChapter` 时 `return { ok:false, applied:0, error:"跳过最近一章（用户可能重 roll）" }`。**此前 isLatestChapter 恒为 false，故该分支永远不进（死计算）；修复后终于按真实最新章命中。**
- **跑相关测试**：`npx vitest run src/core/confirm-guard.test.ts` → **5 passed**（guard 分支矩阵；safeFillAfterWriting 已 mock，单测不触库）。
- **挖新坑（修复是否真生效 / 默认口径）**：
  - **残留 P2（观察项，非回归）**：门控 `skipLatest` 取自 `cfg?.skipLatestChapter ?? false`，而 Prisma schema `Project.skipLatestChapter @default(false)`，故**默认值为 false**——即"跳过最近一章"默认关闭，最新章默认照常填表。但 `loop.ts:128` 注释写"默认跳过最近一章"，`AutomationSettingsDialog.tsx:24` 的 UI 初值也设 `true`（但加载真实配置后若 DB 为 null 会被覆盖为 false）。结论：IMP-002 把"死计算"修对了，但修复**仅在用户显式开启 skipLatestChapter 后才可观测**；注释/UI 初值与 DB 默认(false) 存在口径不一致。属配置意图偏差，非代码回归。

### IMP-003 ｜ 游戏导出静默回填世界书（写作/确认路径逻辑，与游戏透镜共享）

**复验结论：写作/确认路径的 `safeFillAfterWriting` 真实返回值确实驱动文案；游戏导出侧回填提示的数据契约正确（truthful fillMsg → autoFilled → 前端提示）。**

- **复验证据（代码层，共享逻辑）**：
  - `src/core/confirm-guard.ts:127-145`：`applyConfirm` 返回 `fillMsg`，文案严格来自 `fillRes.ok && fillRes.applied > 0`（"自动填表已执行"）或否则 "未触发自动填表（…）" / "自动填表失败（…）"。**不谎称执行**。
  - `src/core/game/game-engine.ts:650-658`：游戏导出调用 `applyConfirm(...)` 后 `autoFilled = typeof fillMsg === "string" && fillMsg.includes("已执行")` —— 用真实返回值判定，而非恒真。
  - `src/app/api/game/end/route.ts:31`：把 `autoFilled` 纳入响应体回传前端。
  - 由此游戏侧 `handleEnd` 的"已自动回填设定库"提示是**条件式真值**，不再静默改动世界观却无提示。
- **诚实边界**：游戏侧 toast 文案 UI 属游戏透镜复检范围；本透镜仅确认"写作/确认路径的真实返回值驱动文案"这一共享契约成立，已证。

### IMP-004 ｜ 确认 toast 谎称「自动填表已执行」

**复验结论：已真实修复，文案严格由服务端回写的 `reviewLogs[last].fill` 真实状态决定，不再无条件声称"已执行"。**

- **复验证据（git diff + 上下文）**：
  - 服务端：`src/app/api/story/nodes/[id]/route.ts:191-199` 依 `fillRes.ok && fillRes.applied > 0` 决定 `fillMsg`；`:208` 将 `fill: fillMsg` 写入 `reviewLogs`（`pushLog({ action:"confirm", fill: fillMsg })`）；`:225-226` 返回完整节点 `fresh`。
  - 客户端：`src/components/workspace/ChapterConfirmBar.tsx` confirm 分支读取 `d.reviewLogs` 末条 `fill`：
    - 含"已执行" → "已确认定稿 ✓（自动填表已执行）"
    - 以"("开头 / 含"未触发" / "跳过" / "关闭" → "本次未触发自动填表"
    - 含"失败" → "自动填表失败，详见日志"
    - 其它 / 无 fill 字段 → 中性 "已确认定稿 ✓"（**绝不冒称已执行**）
  - 服务端三种 `fillMsg`（"自动填表已执行" / "未触发自动填表（…）" / "自动填表失败（…）" / "（无正文，跳过填表）"）与客户端四分支逐一对应，逻辑闭合。旧代码 `toastSuccess("已确认定稿 ✓（自动填表已执行）")` 的恒真谎称已删除。
- **诚实边界（需本地目测 / 测试缺口）**：
  - 沙箱无 Chromium，toast 实际渲染动画/文案观感**需本地目测**（逻辑已证，视觉未目测）。
  - **测试缺口（P2）**：IMP-004 的分支（服务端 fillMsg 计算 + 客户端文案映射）**当前无自动化单测直接覆盖**。本轮 `confirm-guard.test.ts` 被重写为只测 `evaluateConfirmEligibility` 分支矩阵（5 passed），`safeFillAfterWriting` 被 mock，未断言 `fillMsg` 文案；`ChapterConfirmBar.tsx` 是客户端组件未单测。逻辑由人工读码确认，建议补一条"confirm 后 reviewLogs.fill 决定 toast 文案"的契约测试。

### IMP-005 ｜ 默认开启自动确认无引导

**复验结论：已真实修复（一次性引导 toast），但 `localStorage.setItem` 未包裹 try/catch，隐私模式下可能抛错。**

- **复验证据（git diff + toast 模块核验）**：
  - `src/components/workspace/ChapterConfirmBar.tsx:63-74` 新增 `useEffect`：`autoConfirmEnabled` 为真且 `localStorage.getItem(KEY)` 为空时，`setItem(KEY,"1")` + `toastInfo("智能审阅已开启：…如需逐章人工把关，可在设置中关闭。")`。
  - `toastInfo` 确已导出：`src/components/ui/toast.tsx:74` `export function toastInfo(...)`；导入行同步修改（ChapterConfirmBar.tsx:13）。
  - 依赖 `typeof window !== "undefined"` 守卫，SSR 安全。
- **挖新坑（隐私模式 / 异常路径）**：
  - **P2**：`localStorage.setItem(KEY,"1")`（ChapterConfirmBar.tsx:71）未被 try/catch 包裹。部分浏览器隐私模式（如旧版 Safari 无痕）对 `setItem` 抛 `QuotaExceededError`，该异常会在 `useEffect` 内未捕获抛出，可能上抛至 ErrorBoundary 或污染组件渲染。现代 Chrome/Firefox/Edge 隐私模式允许 setItem，故主流环境无碍，但属健壮性缺口。建议把 `setItem` 包进 try/catch。

### IMP-019 ｜ 延迟面板未传 projectId 致全局冒充项目

**复验结论：已真实修复，真机证据充分——带 projectId 返回 `empty:true`（空态），不带则仍返回全站红告警。**

- **复验证据（git diff + 真机 curl dev/3001，决定性证据）**：
  - `src/components/workspace/GenerationLatencyPanel.tsx:80-83`：从 `window.location.pathname` 正则提取 `projectId`；`:88` 请求 `/api/generation-metrics${projectId ? `?projectId=...` : ""}`；`:107` 依赖项 `[projectId]`。
  - 面板挂载确认：`src/components/workspace/RightPanel.tsx:156` `{ node: <GenerationLatencyPanel /> }`（工作区右栏）。
  - 路由侧已支持：`src/app/api/generation-metrics/route.ts:48,54` 读取并按 `projectId` 过滤；`:69-71` 无数据时返回 `{ ok:true, empty:true }`；面板 `:125-129` 对 `data.empty` 渲染空态提示而非红告警。
  - **真机 curl（dev 3001，决定性）**：
    - 全局（无 projectId）：`{"ok":true,"empty":false,"sampleSize":87,"total":{"p95":34069,...},"overThreshold":true,"thresholdMs":2000,...}` → 即修复前每个项目都会看到的**全站红告警**。
    - 带 projectId（真实项目 `45bda999-…` 与伪造 uuid 同结果）：`{"ok":true,"empty":true}` → 现在按项目作用域，**无记录显示空态，不再冒充项目红告警**。
  - **单测**：`npx vitest run src/app/api/generation-metrics/route.test.ts src/core/auto-rate.test.ts` → **8 passed**（route 3 + auto-rate 5）。
- **挖新坑（边界）**：若 pathname 不含 `workspace/` 段（面板被挪到非工作区页），`projectId` 为 undefined → 回退全站查询（回到旧行为）。但面板当前仅挂载于工作区右栏，故正常路径必带 projectId。可接受，无需改。

### IMP-023 ｜ 后处理 / 确认反馈不透明与静默失败

**复验结论：已真实修复（SSE `postprocess_skip` → 非阻塞 warning toast）。**

- **复验证据（git diff + grep 交叉验证）**：
  - 发射端（后端静默降级处）确有 `postprocess_skip`：`src/app/api/generate/write/route.ts:291`、`refine/route.ts:190`、`continue/route.ts:239`，均为后处理 catch 分支 `send({ type:"postprocess_skip", content: ... })`。
  - 接收端：`src/app/workspace/[projectId]/page.tsx:656-658` `else if (event.type === "postprocess_skip")` → `toastWarning("后处理（摘要/审校）已跳过：…正文已生成并保存，可稍后手动重试。")`。
  - `toastWarning` 已导出：`src/components/ui/toast.tsx:71`（导入行 page.tsx:35 同步）。
  - 事件名 `postprocess_skip` 发射与接收**完全一致**，SSE 解析沿用同文件既有 `event.type` 分发，闭合。
- **诚实边界**：该 toast 仅在后处理**异常降级**时触发（正常流程不触发），属安全网；真机触发需构造后处理异常（如正则规则执行抛错），未做端到端触发验证，但事件名/接收逻辑已证一致。

### IMP-024 ｜ 批量生成漏传角色卡参数致质量不一致

**复验结论：已真实修复，批量生成复用单章角色卡参数；空卡/无卡边界安全不崩溃。**

- **复验证据（git diff + 辅助函数 + 持久化契约核对）**：
  - `src/app/workspace/[projectId]/page.tsx:782-805`：`handleBatchGenerate` 先读 `localStorage` 持久化 `pregen-conf-${project.id}`（`:784-793`），取 `batchConfirmedCardIds = drawSelectedCharIds.length>0 ? drawSelectedCharIds : pregenPersisted.selected ?? []`（:794-795）、`batchNewChars = pregenPersisted.newChars ?? []`（:796）；请求体携带 `confirmedCardIds / cardNotes:{} / newCharacterRequests:batchNewChars`（:805）。
  - **持久化契约一致**：写入端 `src/components/workspace/PreGenConfirm.tsx:82` `localStorage.setItem("pregen-conf-${projectId}", JSON.stringify({ selected: confirmedIds, newChars, authorNote }))` 与读取端 `page.tsx:786,794-796` 的 `selected`/`newChars` 字段**完全对齐**。
  - **写端点确实消费**：`src/app/api/generate/write/route.ts:35-37,53,57` 读取 `confirmedCardIds/cardNotes/newCharacterRequests`；`:57` `filterByConfirmedCards(allChars, confirmedCardIds)`。
  - **空卡/无卡边界安全**：`src/core/pipeline/pre-processor.ts:64-73` `filterByConfirmedCards` 在 `!Array.isArray(confirmedCardIds) || length===0` 时**返回全部角色**（不崩溃）；`prepareAuthorNote`（:107-122）对 `cardNotes:{}` → `buildCardNotesText` 返回 ""（:80-86 空对象早退），仅拼接 baseNote + 规则。**批量无卡时传 `[]`/`{}` 不会崩，等同于带全角色约束。**
- **挖新坑（小屏/复用语义）**：
  - 边界已验安全，无崩溃。
  - 次要 UX 观察（非缺陷）：`drawSelectedCharIds`（page.tsx:392，抽卡选择）代表"当前选中单章"的卡；若用户对某章抽卡后又批量生成其它章，该单章卡会被套用到所有批量章。这与"复用角色卡参数"意图一致，但属"全批同卡"语义，符合 IMP-024 目标，不计入缺陷。

---

## 第二部分：总体视角

- **七项 IMP 收口质量**：IMP-002 / IMP-019 / IMP-024 为"确定性代码改动 + 全仓 grep / 真机 curl / 辅助函数核对"，可判**真实修复、零代码残留**；IMP-003（写作侧）/ IMP-004 / IMP-005 / IMP-023 为"逻辑契约/文案映射已读码确认"，修复方向正确、闭环成立，其中 IMP-004 缺自动化单测覆盖、IMP-005 有隐私模式异常缺口，均属 P2 残留。
- **质量与风险判断**：
  - 无断链（面板 projectId 透传、写端点 confirmedCardIds 消费均存在）、无空按钮、无编译/测试回归（门禁 tsc 0 / test 211 已 Chair 核验，本透镜跑的相关单测亦全绿：confirm-guard 5 + generation-metrics 3 + auto-rate 5）。
  - 唯一实质性新坑为 IMP-005 的 `localStorage.setItem` 未 try/catch（隐私模式抛错），及 IMP-004 缺契约单测（测试缺口，非功能缺陷）。
  - IMP-002 的"默认 skipLatestChapter=false 与注释/UI 初值口径不一致"是配置意图偏差（观察项），不阻断功能、非本轮回归。
- **复验方法论诚实性**：所有"已修复"结论均基于 `git diff` 实际改动 + 上下文逻辑阅读 + 相关单测绿 +（IMP-019）真机 curl 三方证据，未用"未发现"冒充"没问题"。

---

## 发现清单（结构化 + 复验证据）

- **[IMP-002-残] P2（轻微 · 观察项，非回归）**
  - **文件:行号**：`src/core/babylore/loop.ts:128`（注释"默认跳过最近一章"）；`src/core/babylore/loop.ts:127`（`skipLatest = cfg?.skipLatestChapter ?? false`）；`prisma/schema.prisma` `Project.skipLatestChapter @default(false)`；`src/components/workspace/AutomationSettingsDialog.tsx:24`（UI 初值 `true`）。
  - **现象描述**：IMP-002 把"isLatestChapter 死计算"修对了，但"跳过最近一章"功能默认关闭（DB 默认 false）；注释与 UI 初值却暗示"默认开启"。用户不显式开启则看不到修复效果。
  - **根因推测**：schema 默认与一处注释/UI 初值口径不一致；属配置意图偏差。
  - **建议修法**：要么把 schema 默认改为 `true`（与注释/UI 初值一致），要么改注释与 UI 初值为 false 并显式提示用户开启；二选一消除口径歧义。

- **[IMP-004-残] P2（轻微 · 测试缺口，非功能缺陷）**
  - **文件:行号**：`src/app/api/story/nodes/[id]/route.ts:191-208`（fillMsg 计算 + reviewLogs 写入）；`src/components/workspace/ChapterConfirmBar.tsx:84-104`（toast 文案映射）；`src/core/confirm-guard.test.ts`（本轮重写为只测 `evaluateConfirmEligibility`）。
  - **现象描述**：确认 toast 不再谎称"已执行"的修复逻辑已读码确认正确，但**无自动化单测**覆盖"fillRes 不同返回值 → 对应 toast 文案"的契约；`safeFillAfterWriting` 在单测中被 mock，未断言 `fillMsg`。
  - **根因推测**：本轮测试重写聚焦护栏分支，漏覆盖修复后新增的文案映射契约。
  - **建议修法**：补一条契约测试——给定 `reviewLogs[last].fill` 为"已执行/未触发/失败/无"，断言 ChapterConfirmBar 文案分支；或对 `applyConfirm` 注入不同 `fillRes` 断言 `fillMsg` 文案。

- **[IMP-005-残] P2（轻微 · 健壮性缺口）**
  - **文件:行号**：`src/components/workspace/ChapterConfirmBar.tsx:70-72`（`localStorage.setItem(KEY,"1")` 未 try/catch）。
  - **现象描述**：隐私模式（如旧版 Safari 无痕）`setStorage.setItem` 抛 `QuotaExceededError`，该异常在 `useEffect` 内未捕获，可能上抛污染组件渲染/触发 ErrorBoundary。现代主流浏览器隐私模式允许 setItem，故默认环境无碍。
  - **根因推测**：引导 toast 逻辑仅守卫了 `typeof window`，未守卫隐私模式对 `localStorage` 写操作的抛错。
  - **建议修法**：把 `setItem` 包进 `try { … } catch { /* 隐私模式忽略 */ }`，与同文件其它 localStorage 读取的容错风格对齐。

---

## 诚实边界（本透镜能力声明）

- **已确证（git diff / grep / 真机 curl / 单测绿）**：IMP-002 五站点无硬编码 false、`loop.ts:129` 门控真实生效；IMP-019 真机 curl 证明"带 projectId→empty:true 空态 / 不带→全站红告警"，面板已透传 projectId；IMP-024 `filterByConfirmedCards` 空数组返全角色、PreGen 持久化键与批量读取键对齐、写端点消费 confirmedCardIds；IMP-003/004/005/023 逻辑契约闭合（toastInfo/toastWarning 均导出、事件名收发一致、fill 真实驱动文案）。
- **真机未端到端触发（逻辑已证，行为未目测）**：
  - IMP-004 的 toast 实际渲染文案/动画：沙箱无 Chromium，未做浏览器点击确认；且当前真实项目 `45bda999-…` 无 `pending_confirm` 节点，构造端到端 confirm 需污染真实数据，故以代码级契约确认替代，标注需本地目测。
  - IMP-023 的 `postprocess_skip` toast：需构造后处理异常方能触发，仅验证发射/接收事件名一致。
- **未重复跑**：tsc / 全量 npm test 由 Chair 已核验门禁（EXIT=0 / 211 passed）；本透镜仅跑相关子集（confirm-guard 5 + generation-metrics 3 + auto-rate 5，全绿），不复跑全量、不重复举证。

---

## 复验证据汇总

| IMP | 复验方式 | 关键证据 | 结论 |
|-----|----------|----------|------|
| IMP-002 | git diff + 全仓 grep + 读 loop.ts | 无 `isLatestChapter:false` 残留；5 站点计算透传；`loop.ts:129` 门控生效 | ✅ 真实修复，零代码残留（留 P2 口径观察） |
| IMP-003 | 读 game-engine/route/confirm-guard | `applyConfirm` 真实 fillMsg → `autoFilled=fillMsg.includes("已执行")` → 响应回传 | ✅ 写作/确认路径真实返回值驱动文案（共享契约成立） |
| IMP-004 | git diff + 上下文 + 单测绿 | `[id]/route.ts:208` 写 fill 入 reviewLogs；ChapterConfirmBar 末条 fill 映射四分支；旧恒真文案删除 | ✅ 真实修复（缺单测，P2 测试缺口） |
| IMP-005 | git diff + toast 模块核验 | ChapterConfirmBar useEffect + toastInfo 导出；setItem 未 try/catch | ✅ 真实修复（P2 隐私模式缺口） |
| IMP-019 | git diff + 真机 curl + 单测绿 | 带 projectId→`empty:true`；不带→`overThreshold:true` 红告警；面板:80-83 透传 | ✅ 真实修复，真机证据充分 |
| IMP-023 | git diff + grep 发射/接收 | write/refine/continue 均 emit `postprocess_skip`；page.tsx:656 接收 toastWarning | ✅ 真实修复（端到端触发需造异常） |
| IMP-024 | git diff + 辅助函数 + 持久化契约 | 批量复用卡；`filterByConfirmedCards` 空数组返全角色；PreGen 键对齐；写端点消费 | ✅ 真实修复，空卡边界安全 |

---

## 本透镜复验结论

- **IMP-002 / IMP-019 / IMP-024**：确定性代码改动 + 全仓 grep / 真机 curl / 辅助函数核对，**真实修复、零代码残留**。IMP-019 有真机决定性证据（带/不带 projectId 行为差异已 curl 复现）。
- **IMP-003（写作侧）/ IMP-004 / IMP-005 / IMP-023**：修复方向正确、逻辑契约闭合，读码确认无谎称/无断链；其中 IMP-004 缺自动化契约单测、IMP-005 有隐私模式 `setItem` 抛错缺口，均属 P2 残留。
- **IMP-002 默认口径**：修复本身无残留，但"skipLatestChapter 默认 false"与注释/UI 初值（暗示默认开启）口径不一致，标为 P2 观察项（非本轮回归、非功能阻断）。

**残留问题数：P0=0 / P1=0 / P2=3**
1. IMP-002-残：skipLatestChapter 默认 false 与注释/UI 初值口径不一致（观察项，P2）
2. IMP-004-残：toast 文案映射契约无自动化单测覆盖（测试缺口，P2）
3. IMP-005-残：引导 toast 的 `localStorage.setItem` 未 try/catch，隐私模式可能抛错（健壮性，P2）

均非阻断级；代码层修复全部成立，无 P0/P1 回归。
