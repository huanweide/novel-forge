# round-8 集体评审收敛清单（Chair 汇总 / v1.6.9 → v1.6.10）

## 一、评审方法
5 个透镜 Agent（L1 性能 / L2 安全 / L3 数据并发 / L4 UI 无障碍 / L5 写章端到端）并行只读审计 v1.6.9（commit `fc5a662`），各产结构化发现（file:line 证据）。Chair 亲读 5 份报告，并对 P0/P1 核心证据点抽样真实验证（Trust but verify）：

| 验证点 | 结论 |
|---|---|
| L5-01：`client.ts:533` 默认 `4096` | 已确认 `maxTokensPerRequest: ... ?? parseInt(... \|\| "4096")` |
| L1-001：`post-processor.ts:652-664` 四 findMany 无 take | 已确认（chapterSummary/storyBeat/pendingCommitment/characterCard 全量） |
| L2-001：全仓限流 | Grep `rateLimit|ratelimit|@upstash|throttle` 零命中，已确认 |
| L4-F01：`globals.css:276` 浅色 `--nv-accent` | 已确认 `oklch(0.68 0.14 95)`（亮金，CR≈2.51） |
| L3-001：schema 裸 String 引用列 | 已确认 `ChapterSummary.chapterId(242)`/`PendingCommitment.sourceNodeId(264)`/`PendingItem.sourceNodeId(562)` 为裸 String 无 Cascade |

## 二、收敛原则
- **P0（2 条）**：必入，本轮必修。
- **P1（12 条）**：评估证据属实，全入，本轮必修。
- **P2（28 条）**：选高价值 10 条本轮修，其余 18 条暂缓（多为架构/多租户/SSRF/大重构，需单独评估，记入清单不修）。

## 三、改进清单（本轮修，共 24 条）

| ID | 透镜 | 严重度 | file:line | 派工路 |
|----|------|--------|-----------|--------|
| L1-001 | L1 | P0 | post-processor.ts:652-664 | A |
| L5-01 | L5 | P0 | client.ts:533 + 三路由 | E |
| L1-002 | L1 | P1 | context-loader.ts:52-55 | A |
| L1-003 | L1 | P1 | post-processor.ts:662 × context-loader.ts:52 | A |
| L2-001 | L2 | P1 | 全仓（无限流） | B |
| L2-002 | L2 | P1 | import/parse:287-288 / import/quick:282 | B |
| L3-001 | L3 | P1 | schema:242/264/562 + nodes/[id]:276 + storylines/[id]:103 | C |
| L3-002 | L3 | P1 | post-processor.ts:566/599 | A |
| L3-003 | L3 | P1 | storyline-writer.ts:43-55 / plan-chapter.ts:158-177 | C |
| L3-004 | L3 | P1 | entity-auto-creator.ts:260-269/350/374 | C |
| L4-F01 | L4 | P1 | globals.css:276 + 各引用页 | D |
| L5-02 | L5 | P1 | refine/route.ts:145-178 / post-processor.ts:167 | E |
| L5-03 | L5 | P1 | continue/route.ts:67-85/174-228 | E |
| L5-04 | L5 | P1 | write/refine/continue 未传 signal / client.ts:438 | E |
| L1-004 | L1 | P2 | post-processor.ts:652/656/659/662 | A |
| L1-005 | L1 | P2 | write/route.ts:149 | A |
| L1-006 | L1 | P2 | post-processor.ts:566/634/684 | A |
| L1-009 | L1 | P2 | export/route.ts:47-50/165-175/242/263 | A |
| L1-011 | L1 | P2 | world-category-classifier.ts:117-118 | A |
| L2-003 | L2 | P2 | api-error.ts:96-101 / import/parse:535 | B |
| L3-005 | L3 | P2 | 状态字面量散落（storyline-writer/plan-chapter/confirm-guard/context-loader/storylines/[id]） | C |
| L3-006 | L3 | P2 | confirm-guard.ts:122-154 vs 158-170 | C |
| L4-F03 | L4 | P2 | workspace/[projectId]/page.tsx:47-58 + CenterPanel | D |
| L5-06 | L5 | P2 | import/commit/route.ts:590-598 | E |

## 四、暂缓清单（18 条，记入不修，后续轮次评估）

| ID | 透镜 | 严重度 | 暂缓原因 |
|----|------|--------|----------|
| L1-007 | L1 | P2 | 伏笔循环串行（量小，非瓶颈） |
| L1-008 | L1 | P2 | 远楼层摘要串行（低频，可后续） |
| L1-010 | L1 | P2 | 导入全量读（低频一次性） |
| L1-012 | L1 | P2 | recordLlmCall 写放大（非阻塞，需归档策略） |
| L1-013 | L1 | P2 | 前端无虚拟化（需 UI 重构，单独评估） |
| L2-004 | L2 | P2 | API Key 明文（需加密层，架构改动） |
| L2-005 | L2 | P2 | llmBaseUrl SSRF（需部署架构评估，localhost 暂不暴露） |
| L2-006 | L2 | P2 | 世界卡 parentId 跨项目（单用户影响有限） |
| L2-007 | L2 | P2 | 提示词注入（不导致代码执行，需质量透镜） |
| L2-008 | L2 | P2 | 全局鉴权层（多租户前置，单用户暂不暴露） |
| L3-007 | L3 | P2 | 草稿未 await（与 L5-04 signal 部分重叠） |
| L3-008 | L3 | P2 | db push 演进风险（需迁移流程治理，单独议题） |
| L3-009 | L3 | P2 | 故事线删除事务（并入 L3-001 路C 已部分覆盖，残留标注） |
| L4-F02 | L4 | P2 | 浅色 primary 临界 4.42（差值 0.08，可后续微调） |
| L4-F04 | L4 | P2 | 二级页响应式（静态推断，需实测） |
| L4-F05 | L4 | P2 | 图标按钮 aria-label（体验增强） |
| L4-F06 | L4 | P2 | 正文 overflow-wrap（体验增强） |
| L5-05 | L5 | P2 | 同节点并发写锁（需 DB 锁，风险高，后续） |
| L5-07 | L5 | P2 | 体裁 systemPrompt 截断（上下文预算透镜，单独评估） |

## 五、投票结果
5 透镜全部汇报完毕，无空返回、无编造。P0+P1 经 Chair 复核证据属实，过半数认可入清单；P2 选 10 条高价值入。本轮修 24 条，暂缓 18 条（记入清单，下轮复检跟踪）。
