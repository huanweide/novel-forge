# Round 7 L1 整合（Chair 视角）

> 日期：2026-08-04 ｜ 基于 6 份只读诊断报告（round-7/{qingyan,ayou,mobai,panshi,qinglan,gongfang}.md）

## 一、Round 6 复验结论（全员）
Round 6 六股东修复**全部真实生效、无回退**：
- 青砚：matchNameStrict 3字+ 最长匹配优先（knownNames 吞并）+ entity-highlighter 介词边界 —— 均过关（25 测试绿）。
- 阿游：复合中文数字解析 + 背包 (name,owner) 隔离 —— 稳健。
- 墨白：门槛 ok&&applied>0 + update 非身份列跳过 + 跨表唯一名归表告警 —— 均生效有单测。
- 磐石：callFlash 60s 超时+重试 + ImportWizard 消费 status + commit 幂等锁 + 字符预算分块 —— 主体生效。
- 清览：Modal labelledBy/ariaLabel + 9 调用点语义名 —— 灭 WCAG 4.1.2。
- 工坊：import $transaction 回滚 + 幂等去重 + regex ReDoS 守卫 —— 生效。

## 二、P0（功能错误，本轮回填必修）

### P0-1 阿游 · abort 信号未透传致流式自愈失效
- 位置：`src/app/api/game/action/route.ts:34` → `src/core/game/game-engine.ts:216,334` + `src/app/workspace/[projectId]/game/[nodeId]/page.tsx:365`
- 现象：abort 信号未透传到引擎 `processGameTurn`，后端在流式被停后仍照常 `$transaction` 提交轮次/背包；前端 abort 后 GET summary 常读到事务**前**旧快照 → 前后端重新错位（正是 Round6 P0-2 想灭的故障）。
- 修复：把前端 AbortSignal 透传到 `processGameTurn`（或流式循环），在 `$transaction` 提交前 `if (signal.aborted) return 中止态`；前端 abort 后 GET summary 读权威态（确保读到 abort 后的正确快照）。

### P0-2 磐石 · 幂等锁空载荷未释放致 DoS
- 位置：`src/app/api/import/commit/route.ts:311,313`
- 现象：空载荷 400 提前返回，但幂等锁已在加锁后获取、未释放 → 该项目合法写入被 300s 阻塞（锁反成拒绝服务）。
- 修复：空载荷校验**在加锁前**（先校验再锁），或 400 路径 `finally` 释放锁。

## 三、P1（明显缺陷，本轮回填）

| 股东 | 位置 | 问题 |
|---|---|---|
| 青砚 | trigger.ts:76-79 + match.ts:128-154 | OOC 的 knownNames 仅含角色名不含词条，「李星云剑法」内 3字角色名被误命中 → OOC 误报回归 |
| 阿游 | page.tsx:285/293 | 前端浅拷贝后原地改 existing.quantity，违反不可变更新，偶发显示错乱 |
| 阿游 | game-engine.ts:126 + state/route.ts:99 | 回拉 entities 跨轮 flatMap 不去重，重复累积 |
| 墨白 | fill.ts:517-518 | babyloreFillAll 恒返回 ok:true，全章失败仍报成功，静默假完成 |
| 磐石 | parse/route.ts:389 | world/文风仅取前 16000 字，长文后段设定永不抽取且 worldFailed 不触发 |
| 磐石 | commit/route.ts | 缺整体事务，中途崩溃留孤儿写，锁期内无法合法重试 |
| 清览 | StyleEditor.tsx:311,319 + ~15 处裸弹窗 | loading/error 弹窗与约 15 处裸弹窗可见 <h2> 标题未用 labelledBy 关联 dialog |
| 工坊 | import/route.ts:85-92 | forkPointNodeId 被 strip 且在节点前创建，无法重映射，分叉点丢失 |
| 工坊 | regex.ts:33-69 | 漏检 (a|aa)+ 等重叠交替类 ReDoS，防护被绕过 |
| 工坊 | import/route.ts:66-169 | 交互事务默认 5s 超时，大备份串行 await 整段回滚 |

## 四、P2（排期，本轮不强制）
- 青砚：长名分支未繁简归一、entity-highlighter 零单测。
- 墨白：归表检测仅 geo→entity 单向、防重复标记用文件系统非 DB。
- 清览：--nv-text-muted 暗色对比度 3.6:1 低于 AA。

## 五、L2 派发
6 股东 Agent 并行，各自负责本透镜内 P0+P1，限定文件、加单测、禁改版本/changelog/MEMORY、不自 commit。Chair 在 L3 前 git diff 审阅。
