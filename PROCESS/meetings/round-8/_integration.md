# Round 8 整合（Chair）—— L2 派发依据

> 复验对象：Round 7（v0.46.70）。六股东 L1 只读诊断整合。结论：Round 7 修复基本全部真实生效、无回退；新挖 **1 P0（架构债）+ 8 P1 + 若干 P2**。

## 一、复验结论（Round 7 修复是否过关）
- 青砚 P1（trigger knownNames 补词条）：**未真正接线**——`findCharacterByName` 全仓无生产调用方，属死代码；修复运行态零效果（见 P0）。
- 阿游（abort 透传 / 不可变更新 / entities 去重）：**全过**。
- 墨白（babyloreFillAll 不恒 ok:true）：**过**。
- 磐石（空载荷锁前置 / world 三段采样 / commit 事务）：**过**。
- 清览（19 处 Modal aria）：**过**（Modal 体系闭合）。
- 工坊（forkPoint 重映射 / regex 重叠交替 / 60s 事务）：**过**。

## 二、Round 8 必修清单（P0 + P1）

### 青砚（文本/匹配/高亮）
- **P0 `trigger.ts:74-106` + `recall.ts:34-49`**：① 消除 `findCharacterByName` 死代码误导（删除或真正接线到 OOC 文本预检）；② 修复生产路径 `matchLoreEntries` 的 `knownNames` 完整性——使其接收 `tables`，knownNames 含 lorebook keys **+ 表格关键列值**（特别是长名/3字列值作为前缀时吞并），灭「李星云剑法」内 3字 lorebook key 误触发召回/OOC。确保 R7 修复落到真路径。
- P2（可选）：`entity-auto-creator.ts` 长名分支补繁简归一。

### 阿游（游戏）
- **P1 `game-engine.ts:274`**：`chatStream` 未透传 abort 信号→停止后 LLM 仍持续生成丢 token。把 `signal` 透传到 processGameTurn 内的 chatStream 调用。
- **P1 `game-engine.ts:280-350`**：空流时跳过 abort 检查并 `$transaction` 提交幻影空轮次→空流/abort 时不提交轮次（与 P0-2 自愈一致）。
- P2（可选）：entities 末轮/首轮去重策略统一。

### 墨白（填表）
- **P1 `fill.ts:533-535`**：全跳过即 `ok:true` 掩盖旧版误标脏标记，重演静默假完成→全跳过且无 applied 时返回 `ok:false`（带 warning 摘要），与 Round6/7 门槛一致。
- P2（可选）：`fill.ts:631` crossTableIssues 计数与 issues 条目一致（UI 不翻倍）。

### 磐石（性能/监控）
- **P1 `commit/route.ts:18-19,314-318`**：幂等锁为进程内存 Map+300s TTL，跨实例/长事务并发双写→改 DB 唯一约束或乐观锁（基于 projectId+nodeId），跨实例有效。
- **P1 `parse/route.ts:189-239`**：import_parse 失败 Flash 调用不记账→失败路径也 `recordLlmCall`（与 client.ts 口径一致），成本看板不缺。
- **P1 `parse/route.ts:168-179`**：buildLoreSample 仅头/中段窗/尾采样，>32k 中段区间永不进 LLM→改为滚动窗或分块覆盖中段，或超阈值标 `worldFailed` 提示不完整。

### 清览（UI/无障碍）
- **P1 `toast.tsx:206,:251`**：Confirm/Prompt 手写 `fixed inset-0` 模态，无 `role="dialog"`/`aria-modal`/`aria-labelledby`/焦点陷阱→补对话框语义 + 焦点陷阱（ESC 关闭、Tab 循环）。
- **P1 `CommandPalette.tsx:132`**：命令面板缺对话框语义与焦点陷阱、ESC 仅在输入框聚焦生效→补 `role="dialog"` + `aria-modal` + 焦点陷阱 + 全局 ESC。
- P2（可选）：`globals.css` `--nv-text-muted` 三主题对比度提到 ≥4.5:1。

### 工坊（工程/集成）
- **P1 `regex.ts:69,82-84`**：`?` 量词被排除，漏检 `(a?)+` 类 ReDoS→补 `?` 量词嵌套检测（与 `*`/`+` 同列）。
- **P1 `import/route.ts:103,110`**：部分导入 `parentId/branchId` 未剥离致外键悬空→导入时剥离并校验存在性，悬空则置空/重映射。
- **P1 `import/route.ts:50-63`**：幂等查重在事务外，并发重导入重复→查重移入事务内或加 DB 唯一约束。

## 三、L2 执行纪律（重要）
- 6 Agent 并行实现各自透镜 P0/P1，**限定文件**、加单测、禁改版本/changelog/MEMORY、不自 commit。
- **Chair 统一 tsc 门禁**：所有 Agent 写入完成后，Chair 亲自跑 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`。**禁止采信单个 Agent 并行跑 tsc 的「预存错误」**（上一轮已证为文件写入竞态假象）。
- 各 Agent 返回后 Chair Trust-but-verify 抽查 P0 核心 diff + `git status` 确认无越界。

## 四、终止判定
- Round 8 若仅剩 P2、无新 P0/P1，则循环达「全员无 P0/P1」终止条件，Round 8 L3 可仅回写记忆不升版（或升小版本收尾）。本轮回填全部 P0/P1。
