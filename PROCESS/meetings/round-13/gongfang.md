# Round 13 只读诊断报告 · 工坊（股东视角）

- **产品**：novel-forge（Next.js 16 + React 19 + Tailwind v4 + Prisma 7 + PostgreSQL 17）
- **版本**：HEAD=v0.46.77，dev 服务 `http://127.0.0.1:3001`（HTTP 200，LLM=DeepSeek deepseek-v4-flash）
- **诊断焦点**：导入-备份-正则-预设链路（`.nfproject` 含 `storyBranches` 导入 / lostForks / 事务超时 / ReDoS / 预设未知 type / commit 并发幂等）
- **方法**：只读。源码逐文件取证（file:line）+ curl 真实 API 验证（粘贴真实响应）+ pg 直查库表。沙箱无 Chromium，纯点击/悬浮项标注「需本地浏览器验收」。未修改任何源码/配置。

---

## 概要

导入-备份-正则-预设主链路在 v0.46.77 **稳**，Round 12 的 G1（forkPointNodeId 占位防回滚）与 W1（分支分叉点丢失提示不静默丢）修复均经运行时复测确认仍稳，未发现新回归；本轮**无 P0/P1 建议**，仅余 3 条 P2 体验/健壮性优化。

---

## 一、已验证稳定项（真实运行时证据）

### 1.1 `.nfproject` 含 `storyBranches` 导入：forkPoint/parent 重映射完整
- **源码**：`src/app/api/projects/import/route.ts`
  - forkPointNodeId 占位（G1 修复）：`:110` `forkPointNodeId: nodeMap[b.forkPointNodeId] ?? b.forkPointNodeId ?? ""`
  - parentBranchId 第二趟重映射（W1 修复）：`:115-125`
  - 分叉点回填重映射：`:150-169`
  - 事务超时 120s：`:227` `timeout: 120000`
  - 幂等键 `importSource` 唯一：`:54`、`:64-69`、`:239-251`
- **真实验证（TEST1）**：POST `/api/projects/import` 传含 `storyBranches:[B1→N1, B2→N2,parent=B1]` 与 `storyNodes:[N1,N2,N3]` 的 `.nfproject`
  - 响应：`{"success":true,"id":"ea9b8fa5-...","idempotent":false}`（无 warnings）
  - pg 直查新项目 `ea9b8fa5`：**主线**.fork=`4d574a09`(=第一章), **支线A**.fork=`bba7f7af`(=第二章), **支线A**.parent=`08f141b2`(=主线) → **INTEGRITY OK，无旧 id 泄漏**。

### 1.2 仅导入 branches（缺章节节点）→ lostForks 提示，不静默丢
- **源码**：`:148-169`（fork 节点未导入则 `lostForks.push` 且 `forkPointNodeId` 置 `""`，不保留悬空旧 id）
- **真实验证（TEST2）**：传含 3 个分支但无 `storyNodes` 的备份
  - 响应：`{"success":true,"id":"3b9dba86-...","idempotent":false,"warnings":"已导入，但 3 个分支的分叉点节点未随章节导入而丢失（分叉点需随章节一并导入）"}`
  - pg 直查 `3b9dba86`：3 个分支 `fork` 均为 `""`（非悬空 `N1/N2/N3`），parent 仍正确重映射 → **INTEGRITY OK**。
  - ✅ W1 修复仍稳：分叉点丢失被显式标注，而非静默保留无效旧 id。

### 1.3 幂等重导入不翻倍
- **真实验证（TEST3）**：对同一 `origId=src-proj-forktest-001` 再次 POST 导入
  - 响应：`{"success":true,"id":"ea9b8fa5-...","idempotent":true}`（返回**同一**项目 id，未新建）
  - 库表 `WHERE "importSource"='nfproject:src-proj-forktest-001'` 仅 1 行。
- ✅ G1/W1 之外的幂等闭环仍稳。

### 1.4 备份↔导入 往返保真（分支拓扑不塌）
- **源码**：`src/app/api/projects/[id]/backup/route.ts:10-11,41,52` 备份包含 `storyBranches`+`storyNodes` 且 `format:"nfproject"`。
- **真实验证**：GET 备份 `ea9b8fa5` → 再 POST `/api/projects/import` 该备份
  - 新项目 `36140673` 分支：主线.fork=第一章、支线A.fork=第二章、支线A.parent=主线 → **INTEGRITY OK**。
  - ✅ 导出-还原链路对分支拓扑闭环可靠。

### 1.5 commit 并发/幂等（ImportCommitLock）
- **源码**：`src/app/api/import/commit/route.ts`
  - 空载荷 400 在加锁前（P0 修复）：`:338-339`
  - 陈旧锁 15min 清理：`:345-349`
  - P2002 → 409：`:356-357`
  - 全局 deadline：`:372`
- **真实验证（TEST4）**：对同一 scratch 项目并发发 2 个 commit（各含 1 个全新角色，无 AI 合并）
  - REQ1：`http=200`，SSE `type:done, created.characters:1`
  - REQ2：`http=409`，`{"error":"该项目正在导入中，请等待上一次提交完成（避免重复写入）"}`
  - ✅ 第二请求被锁拦截，**未产生重复角色**；并发幂等闭环仍稳。

### 1.6 正则 ReDoS 防护（恶意正则被拒不污染文本）
- **源码**：`src/core/post-process/regex.ts`
  - 启发式 `isLikelyUnsafeRegex`：嵌套量词/重叠交替/超长/非法 flags：`:24-131`
  - `applyRegexRules` 命中则跳过并告警、不污染文本：`:133-163`
  - 套用前预检（422）：`src/app/api/presets/[id]/apply/route.ts:170-179`
- **真实验证（TEST5）**：
  - 恶意预设 `pattern:"(a+)+$"` → apply 响应 `http=422` `{"error":"预设正则规则「evil」存在灾难性回溯风险，已拒绝（检测到嵌套量词，存在灾难性回溯风险），套用已中止"}`
  - 良性预设 `pattern:"<think>([\\s\\S]*?)</think>"` → `http=200` `{"ok":true,"created":[{"kind":"regex","name":"正则规则×1"}]}`
  - ✅ ReDoS 防护仍稳：恶意正则被拒、良性正则正常落库、运行期 `applyRegexRules` 跳过不安全规则而不污染文本。

### 1.7 预设未知 type → 400 不静默失败
- **源码**：`src/app/api/presets/[id]/apply/route.ts:241-244` `else { return 400 "未知预设类型" }`
- **真实验证（TEST6）**：建 `type:"totally_unknown_xyz"` 预设后 apply
  - 响应 `http=400` `{"error":"未知预设类型"}`
  - ✅ 未知类型穿透所有分支后显式 400，未静默 no-op（未写 appliedPresets/downloads）。

### 1.8 填表溯源 / 监测面板成本（全局清单，源码级）
- 填表溯源：`src/core/babylore/fill.ts:565`（`srcLabel=ch{order}:batch{id}`）、`:658`（批次号写行 `_src` 溯源）、`:434,458`（去重刷新溯源标记）→ Round 12「填表透传溯源」闭环在。
- 监测面板按项目成本：`src/app/api/stats/monitor/route.ts:112-132` 按 `projectId` 分组聚合 `estimatedCost`/`totalTokens` → Round 12「监测面板按项目成本」闭环在。
- a11y：组件广泛含 `aria-label`/`role`/`tabIndex`（`CommandPalette.tsx`、`ui/Modal.tsx`、`ui/toast.tsx`、`ui/button.tsx` 等）；Round 12 提交 `056aecd` 声明「a11y 闭环」。真实键盘/对比度交互**需本地浏览器验收**。

---

## 二、P0 / P1 / P2 分列

### P0
无。

### P1
无。

### P2（建议，非阻断）
**P2-1｜`/api/presets/import` 接受任意 `type` 并上架为公开预设**
- 问题：导入预设接口只校验 `type`/`title` 非空（`src/app/api/presets/import/route.ts:11-34`），不校验 type 是否在已知白名单。未知类型预设会被写入 `isPublic:true` 的工坊库，仅在「套用」时才以 400 暴露，期间污染创意工坊列表。
- 复现/证据：TEST 中 `POST /api/presets/import {"type":"another_unknown",...}` 返回 `200` 并成功创建 `type:"another_unknown"` 的公开预设。
- 影响：工坊可用性 + 用户困惑（看到套用即失败的预设）。
- 建议：import 阶段即按已知 type 白名单校验（非法返 400），或把未知类型预设标记/隔离、不在公开列表默认展示。

**P2-2｜`/api/projects/import` 事务超时 120s 对超大备份可能回滚失败**
- 问题：`src/app/api/projects/import/route.ts:227` `timeout:120000`。数万章节/词条的超大规模备份，串行 await 可能超过 120s → 事务超时整体回滚（已正确不留孤儿，但导入失败）。
- 影响：极端大备份导入失败（非静默损坏，但用户需拆包重试）。
- 建议：提供分片导入或按规模提示上限；或在不破坏原子性的前提下拉长/分层超时策略。

**P2-3｜lostForks 回执仅含数量，未附丢失分支清单**
- 问题：`src/app/api/projects/import/route.ts:230-233` warnings 文案只写「N 个分支的分叉点丢失」，未列出具体分支名称/id。
- 影响：用户仅导入 branches 时难以定位哪个分支分叉点丢失。
- 建议：回执附 `lostForks` 名称列表（已有数组，仅未序列化进 warnings 文本）。

---

## 三、全局体验清单覆盖（用户 20 点精神）

| 维度 | 结论 | 证据/标注 |
|---|---|---|
| 导入-分支重映射 | 稳 | TEST1/TEST4-pg（fork/parent 正确重映射，无旧 id 泄漏） |
| 备份-还原往返 | 稳 | 1.4 往返 INTEGRITY OK |
| lostForks 提示 | 稳 | TEST2（显式 warning，fork 置空不悬空） |
| 导入幂等/并发 | 稳 | TEST3（idempotent）+ 库 `@unique([importSource])`（schema:45） |
| commit 并发/幂等 | 稳 | TEST4（200+409，无重复写）+ `@unique([projectId,nodeId])`（schema:506） |
| 正则 ReDoS | 稳 | TEST5（422/+200，不污染文本） |
| 预设未知 type | 稳 | TEST6（400 不静默） |
| 填表溯源 | 稳（源码） | fill.ts:565,658,434,458 |
| 世界卡去重 | 稳（源码） | apply 路由 U2 按 projectId+category+title 去重（:113-140,202-229） |
| LLM 上下文记忆 | 源码在 | `syncGlobalPrompt` 套用预设后刷新（apply:278）；跨会话记忆落 `llmCallLog`/全局提示词；**长程记忆一致性需本地浏览器+实操验收** |
| 游戏流畅度 | 源码闭环 | Round 12 `c796d9a` 游戏端点空正文闭环 + 轮次幂等；**实时手感需本地浏览器验收** |
| 监测面板 token/费用 | 稳（源码） | monitor:112-132 按项目聚合 cost/tokens |
| 按钮意义/教程/防误触 | 部分源码 | Modal/CommandPalette/toast 有 a11y 与确认语义；**按钮 tooltip/教程文案与防误触弹窗需本地浏览器逐页验收** |
| a11y | 源码在 | 组件含 aria/role/tabIndex；**键盘导航/对比度实测需本地浏览器验收** |

**Round 12 G1/W1 回归核对**：G1（forkPointNodeId 占位防 `Missing required value` 事务回滚）与 W1（仅导入 branches 时分叉点丢失提示）均经 TEST1/TEST2 真实验证**仍稳，无新回归**。

---

## 四、需本地浏览器验收项（沙箱无 Chromium，本论无法实测）

1. 导入向导 SSR/交互渲染、进度条、错误 toast（curl 仅能取 SSR HTML 与 API，无法验证视觉/交互）。
2. 游戏实时流畅度与 N1 空正文闭环的端到端手感。
3. LLM 长程上下文记忆一致性（跨多章生成的角色/设定一致性）。
4. 按钮意义/教程文案/防误触确认弹窗的逐页核对。
5. a11y 键盘可达性、焦点管理、色彩对比度实测。
6. 预设套用后前端状态（appliedPresets 列表、文风即时生效）的可见反馈。

> 说明：上述项均已在源码层确认存在对应实现（file:line 见上），但「实际观感/交互正确性」需真实浏览器回归。

---

## 五、结论

**本轮是否还有 P0/P1 建议：否。**

导入-备份-正则-预设主链路在 v0.46.77 全部稳，Round 12 G1/W1 修复经真实 API + 库表验证仍稳、无新回归；仅余 3 条 P2 体验/健壮性优化（P2-1 预设 import 类型白名单、P2-2 超大备份事务超时、P2-3 lostForks 回执附清单）。无阻断性缺陷，建议下一轮按需处理 P2。
