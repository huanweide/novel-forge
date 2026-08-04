# Round 11 复验 — 工坊（工程稳健性）

> 股东透镜：工程稳健性工程师（备份/导入/合并、预设应用、正则安全、事务幂等）
> 复验性质：**只读**；未修改任何源码/配置/文档，未 `git commit`，未改 `tsc`。
> 复验时间：maxloop Round 11（基于 Round 10 v0.46.73 记忆回写之后）

---

## 环境

- **Git HEAD**：`b5901aa2de778b461f192b485b63eb8cf7c72ec9`
  - HEAD 提交信息：`Round 10 记忆三件套回写（WORK_REPORT Round10 费曼段；MEMORY/日志为本地文件不进仓）`
  - `git status --short`：仅 `?? PROCESS/meetings/round-11/`（即本报告所在目录，尚未纳入版本控制），源码/配置/文档无任何改动，工作区干净。
- **复验关注面**：备份/导入/合并流程、创意工坊预设应用（`.preset.json`）、正则安全（ReDoS 防护）、数据库事务与幂等、外键重映射。
- **本轮读过的文件清单**（均为 `Read` 实际确认，行号来自真实读取）：

| 文件 | 行数 | 用途 |
|---|---|---|
| `src/app/api/presets/[id]/apply/route.ts` | 273 | 预设应用核心，Round 10 修复目标 |
| `src/app/api/import/commit/route.ts` | 663 | 导入提交，事务/幂等/去重/外键重映射 |
| `src/core/post-process/regex.ts` | 164 | `isLikelyUnsafeRegex` ReDoS 静态分析与 `applyRegexRules` |
| `src/app/api/import/parse/route.ts` | 526 | 导入解析（分块/采样/修复/超时） |
| `src/app/api/presets/[id]/fork/route.ts` | 35 | 预设复刻 |
| `src/lib/builtin-presets.ts` | — | 内置预设（含 api_config 示范） |
| `src/app/api/presets/import/route.ts` | 39 | `.preset.json` 导入去重 |
| `src/lib/forbidden-checker.ts` | 447 | `parseRegexPattern` / `scanForbiddenWordsEnhanced` |
| `src/core/pipeline/post-processor.ts` | — | 生成后处理（废词扫描热路径） |
| `src/app/api/generate/write/route.ts` | — | 实时流式扫描热路径 |
| `src/app/api/projects/[id]/applied-presets/route.ts` | 49 | 预设卸载（DELETE） |
| `src/components/editor/StyleEditor.tsx` | — | 文风编辑器（客户端扫描/保存） |
| `src/lib/quality-analyzer.ts` | — | 质量分析（调用扫描，未传自定义正则） |
| `src/core/post-process/regex.test.ts` | — | ReDoS 防护测试 |
| `prisma/schema.prisma` | — | `importSource @unique` / `forkPointNodeId` / `ImportCommitLock` 唯一约束 |

---

## 回归结论

### 1. Round 10 修复点（v0.46.73）逐条复验

**修复点 A — `api_config` 由整体摊平改为 `deepMergeLLMConfig` 深合并（白名单逐层）**

- 位置：`src/app/api/presets/[id]/apply/route.ts`
- 确认落地：
  - 行 10–21：`LLM_CONFIG_KEYS` 白名单 `Set`（含 `model`/`baseUrl`/`baseURL`/`apiKey`/`temperature`/`topP`/`maxTokens` 等）。
  - 行 28–44：`deepMergeLLMConfig(current, incoming)` 按白名单逐层深合并；非配置键被剔除（`if (!LLM_CONFIG_KEYS.has(key)) continue;`）。
  - 行 215–224：`api_config` 分支执行 `const merged = deepMergeLLMConfig(current, incoming);` 合并写入 `Project.llmConfig`。
- 逻辑复核：
  - **不丢用户本地值**：不同键相互独立保留；嵌套对象逐层深合并；同键标量被预设覆盖属预期行为（预设即“应用覆盖”）。
  - 扁平示范预设（`builtin-presets.ts` 行 361–367：`{ temperature: 1.2, topP: 0.9, maxTokens: 4000 }`）深合并路径正确，不会误删用户其他 `llmConfig` 字段。
- 结论：**已正确落地，逻辑无误。** ✅

**修复点 B — `if/else` 链末尾加 `else { return 400 未知预设类型 }`，杜绝静默 no-op 仍写 `appliedPresets/downloads`**

- 位置：`src/app/api/presets/[id]/apply/route.ts` 行 226–229（位于写 `appliedPresets`/`downloads` 之前）。
- 确认：`else { return NextResponse.json({ error: "未知预设类型" }, { status: 400 }); }` 在行 231+ 的写库逻辑**之前** `return`。
- 逻辑复核：未知 `type` 现在真阻断——请求在写 `appliedPresets`/`downloads` 之前以 400 返回，不存在“静默成功但无副作用”的脏状态。
- 结论：**已正确落地，真阻断生效。** ✅

### 2. 历史关键修复无回流核查

| 历史修复 | 当前位置/证据 | 状态 |
|---|---|---|
| 导入 `$transaction` 回滚 + 幂等去重 | `import/commit/route.ts` 整体 `prisma.$transaction`（约行 512–631）；同批去重 `seenCharNames`/`seenLoreTitles`（约行 371/454）防 `createMany` 重复 | 在位 ✅ |
| 并发幂等锁 `ImportCommitLock` 移入事务 | 锁检查约行 315–335（`P2002 → 409`）；空载荷校验在加锁前（约行 312–313）；15 分钟陈旧锁清理（约行 319–323） | 在位 ✅ |
| 正则 `isLikelyUnsafeRegex` ReDoS 防护 | `regex.ts` 行 24–131；`applyRegexRules` 行 133–163 应用前调用，命中则跳过并告警 | 在位 ✅ |
| `?` 不列入 `repeated` 误杀 | `regex.ts` 行 78 注释明确 `(https?://)?`、`(a+)?` 合法 | 在位 ✅ |
| `Project.importSource @unique` | `prisma/schema.prisma` 行 45 | 在位 ✅ |
| `forkPoint` / 外键重映射（`parentId`/`branchId` 剥离） | 导入 `volume` 节点 `parentId: null` 剥离（约行 522）；`forkPointNodeId`（schema 行 213） | 在位 ✅ |
| `.preset.json` 导入按 `type+title+isBuiltin=false` 去重 | `presets/import/route.ts`（约行 39，409 冲突） | 在位 ✅ |
| `regex.test.ts` 覆盖 `(a?)+`/`(a?)*`/`((a?))+`/`(a+)?`/`(https?://)?` 误杀验证 | 测试完备 | 在位 ✅ |

- **结论：Round 10 两处修复均正确落地；全部历史关键修复无回流。** ✅

---

## 新发现问题

### P0（数据损坏 / 崩溃 / 安全漏洞 / 并发竞态）
**无。** 本轮未发现活跃 P0。

### P1（静默失败 / 预设冲突 / 可感知错误）
**无。** 预设深合并保留用户非冲突值、未知 `type` 以 400 真阻断、ReDoS 静态分析在位且 `applyRegexRules` 对超大文本（约 500 字符上限）与嵌套量词均有拦截，无灾难性回溯；导入事务原子、幂等、去重、外键剥离均到位。

### P2（稳健性 / 边界 / 纵深防御）

**P2-① 禁用词扫描 `parseRegexPattern` 未复用 ReDoS 静态防护（纵深防御缺口，latent）**

- **症状**：`src/lib/forbidden-checker.ts` 的 `parseRegexPattern`（行 149–159）对用户提供的正则仅做 `try/catch` 捕获**编译期**错误（`new RegExp(...)` 非法语法），**未调用** `isLikelyUnsafeRegex` 做 ReDoS 启发式拦截。
  ```ts
  function parseRegexPattern(pattern: string): { regex: RegExp; source: string } | null {
    try {
      const lastSlash = pattern.lastIndexOf("/");
      const source = pattern.slice(1, lastSlash);
      const flags = pattern.slice(lastSlash + 1);
      const allFlags = flags.includes("g") ? flags : "g" + flags;
      return { regex: new RegExp(source, allFlags), source }; // ← 仅编译期校验，无 ReDoS 防护
    } catch { return null; }
  }
  ```
- **file:line**：`src/lib/forbidden-checker.ts:149-159`（调用处：行 225、行 254，服务于 `customSentencePatterns`/`customBodyTemplates` 句式/身体模板类正则）。
- **根因**：ReDoS 防护逻辑集中在 `src/core/post-process/regex.ts` 的 `isLikelyUnsafeRegex`，但 `forbidden-checker.ts` 内另有一套独立的 `parseRegexPattern`，两套正则编译路径未打通；后者只防“编译失败”，不防“编译成功但灾难性回溯”。
- **当前是否活跃**：经全仓调用链核查，**当前并非活跃风险**：
  - 服务端生成热路径 `post-processor.ts:56` 与实时扫描 `write/route.ts:190` 均只传 `customExactWords` 且显式过滤 `/` 前缀（`!p.startsWith("/")`），即正则类用户输入被剔除，不会进入 `parseRegexPattern`。
  - 客户端 `StyleEditor.tsx:281` 的扫描/保存同样只传 `customExactWords` 且过滤 `/` 前缀。
  - `quality-analyzer.ts:99` 调用 `scanForbiddenWordsEnhanced(text)` 不传任何自定义项。
  - 全仓无任何调用方传入用户提供的 `customSentencePatterns`/`customBodyTemplates`。
  - 因此 `parseRegexPattern` 当前仅处理内置安全固定正则，ReDoS 路径未被用户输入触发。
- **风险性质**：属**潜在（latent）纵深防御缺口**——一旦未来新增“用户自定义句式/身体模板正则”入口（且未先经 `isLikelyUnsafeRegex`），即可能以超大文本触发灾难性回溯，造成请求线程卡死（服务端）或页面冻结（客户端）。
- **建议改法（防御性，非紧急）**：
  1. 在 `parseRegexPattern` 返回前复用 `isLikelyUnsafeRegex(source)`，命中则返回 `null` 并打告警日志；
  2. 或在 `scanForbiddenWordsEnhanced` 入口对 `customSentencePatterns`/`customBodyTemplates` 统一做静态拦截，与 `regex.ts` 共用同一套白/黑名单；
  3. 长期建议将两个正则编译入口收敛为单一工厂函数，避免防护逻辑分叉。

**P2-② 预设 `regex` 类型仅按 `name` 合并，apply 时未独立做 ReDoS 校验（依赖执行期兜底）**

- **症状**：`presets/[id]/apply/route.ts` 中 `regex` 预设（约行 162–186）仅按 `name` 合并进 `postProcessingRules`，apply 阶段不调用 `isLikelyUnsafeRegex`；其防护完全依赖后续 `applyRegexRules`（`regex.ts:133-163`）执行时拦截。
- **根因**：预设内容在进入 `postProcessingRules` 时未做静态预检，ReDoS 校验被后置到执行期。
- **当前是否活跃**：**不活跃**——`applyRegexRules` 已对每条规则执行 `isLikelyUnsafeRegex`，命中即跳过并告警，用户文本内容也有约 500 字符上限兜底，无灾难性回溯实证。
- **建议改法**：可在预设 apply 阶段对 `regex` 类型规则做一次预校验（命中则拒绝应用并返回 422），把“坏预设”拦在写入 `postProcessingRules` 之前，错误反馈更靠前、更明确。属体验优化，非必需。

### P3（锦上添花）

**P3-① 并发锁残留与陈旧锁清理的边界**
- `import/commit/route.ts` 已有“空载荷校验在加锁前”与“15 分钟陈旧锁清理”逻辑（约行 312–323），稳健性良好。可考虑补充锁持有者标识（如 `requestId`）以便观测与人工介入，但非必要。

**P3-② 预设卸载幂等性可进一步显式化**
- `applied-presets/route.ts` DELETE 按 `ruleNames`/`configKeys` 移除，逻辑正确。可考虑在卸载时对“不存在的 key/rule”返回 204 而非报错，提升并发卸载的容错观感，属体感优化。

---

## 终止判定倾向

> 本透镜（工程稳健性：备份/导入/合并、预设应用、正则安全、事务幂等）下，**未发现活跃 P0 / P1 问题**。

- **Round 10 修复**：两处（api_config 深合并、未知 type 400 阻断）均正确落地且逻辑无误。
- **历史修复**：事务幂等、ReDoS 静态分析、`@unique` 约束、`?` 不误杀、外键剥离、`ImportCommitLock` 并发锁、`.preset.json` 去重——全部在位、无回流。
- **新发现**：仅 P2 级纵深防御缺口 2 项（均 **latent、非活跃**），以及 P3 体感优化 2 项。
  - P2-①（`forbidden-checker.parseRegexPattern` 缺 ReDoS 防护）最具代表性，但已被现有调用方“仅传 `customExactWords` 且过滤 `/` 前缀”所遏制，当前服务端生成链路不会以用户正则触发该路径。
- **建议**：可不阻断 Round 11 收口；将 P2-① 作为“未来新增用户自定义正则入口前的必做防护项”登记进待办，避免后续功能上线时引入活跃 ReDoS 风险。

**倾向结论：本轮可安全终止（无 P0/P1 阻塞项）；P2-① 建议登记为预防性技术债。**
