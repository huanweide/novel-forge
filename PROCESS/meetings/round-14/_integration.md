# Novel Forge · Round-14 深度审计整合（MaxLoop 魔王系统）

- Chair：千惠（受信任负责人，亲自验真）
- 日期：2026-08-06
- HEAD：v1.0.2 (918c7d7)
- 审计策略：继 round-1~4 把「功能正确性」清零（P0/P1=0、211 passed）后，本轮换打法——派 5 个只读透镜深挖「逻辑/异常/数据一致性/安全/性能」这些功能测试覆盖不到的深层坑。每个 Agent 必须带 file:line 证据，Chair 亲自读源码验真，不轻信回报。

## 一、阶段二：评审与投票收敛（改进清单）

5 个透镜回报汇总后，经 Chair 源码验真，裁定如下：

| 编号 | 标题 | 严重度 | 来源 | 验真结论 | 决策 |
|---|---|---|---|---|---|
| IMP-501 | 备份包 round-trip 静默丢失 6 类数据 | P1 | lens-data F1 | **实锤**：`backup/route.ts:7-16` INCLUDE 仅 8 类，确缺 ChapterSummary/StoryBeat/PendingCommitment/PendingItem/StoryNodeRevision/GameSession；UI 未告知用户「记忆层/游戏进度不进备份包」→ 静默丢失。代码注释写明「匹配计划」属产品设计取舍，但缺用户告知 | **修**：导出回执显式声明不含项 + 还原侧一致性校验 |
| IMP-502 | markdown 回灌角色关系键不一致（targetCharacterId vs targetName） | P1 | lens-data F2 | **实锤**：`parser.ts:367` 存 `targetCharacterId`（实为名字）；`relations.ts:18` 只认 `targetName??target` 不认 `targetCharacterId` → 被 filter 丢弃；`sync-global-prompt.ts:128` 读 `targetName` 缺失渲染 `?(?)` | **修**：`parser.ts` 输出 `targetName` 对齐契约 |
| IMP-503 | import/commit 事务缺 timeout | P1 | lens-data F3 | **实锤**：`import/commit/route.ts:571` `$transaction(async tx)` 仅 1 参数，缺 `{ timeout }`；对照 `projects/import/route.ts:234` 有 `{ timeout: 120000 }`。Prisma 默认值 5s，大书串行 create 易超时整段回滚零写入 | **修**：补 `{ timeout: 120000 }` |
| F1~F6 / O1~O4 | 并发覆盖写、前端缓存无限增长、生成全量 content 内存放大、监控重查询、slug 碰撞、quantity 未校验等 | P2 / 观察 | 各透镜 | 全部验真成立但不阻断（功能测试难触发、单 tab 前端、设计取舍） | **留观察池**：不阻塞本轮，F1 entity-highlighter 与 round-2 同类建议后续一并闭环 |

**诚实剔除（Agent 自证偏乐观/与其他透镜冲突）**：data 透镜「两处事务均正确使用 timeout」与 error 透镜及源码冲突——以源码为准，commit 事务确缺 timeout。沙箱无 Chromium，前端目测类（slug 碰撞、缓存增长实际表现）标注「需本地目测」。

## 二、阶段三：方案（完整可落地，见 _solutions.md）

- IMP-501：备份 GET 回执 bundle 增 `excluded: [...]` 字段；导入还原若命中 excluded 缺失做 warn 日志不静默；BackupDialog 前端展示「本次备份不含：游戏进度/版本历史/记忆摘要/伏笔追踪/待兑现事项，如需迁移请使用文本导出」。
- IMP-502：`parser.ts:367-372` 改写为 `targetName: r.target`（与 normalizeRelationships / AIChatBar / analyze-relationships 一致）。
- IMP-503：`import/commit/route.ts:571` 改为 `prisma.$transaction(async (tx) => {...}, { timeout: 120000 })`。

## 三、终止判定

本轮 3 条 P1 全修且经 Chair tsc + 测试 + 真机验证后，改进清单归零（P1=0），升 v1.0.3 收口。P2 留观察池归档于本文末尾（不阻塞「项目已无问题」判定，因非阻断且前几轮功能已清零）。
