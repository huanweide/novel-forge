# 工程主审：Novel Forge 检验方向

## ① 核心诊断

结论先行：最该被检验的不是「流程能否跑通」——这已被 agent-*.cjs 真机脚本覆盖——而是**质量护栏的真实性**与**自动化验证的覆盖面**。

三个硬证据，均来自代码实察：

- 全项目最核心的共享模块 `src/core/confirm-guard.ts`（QUALITY_PASS_THRESHOLD=60、放行/拦截分支、applyConfirm 副作用）**没有任何单元测试**；同为护栏关键件的 `src/lib/quality-analyzer.ts`（482 行）同样无测试。放行逻辑仅靠 live API 脚本覆盖。
- `scripts/agent-smart-deliver-verify.cjs` 用 PUT 直接写 `qualityScore:30→90` 来「造」高低分——这是**客户端可写字段**，脚本根本没经过真实 analyzeQuality 评分路径，等于绕过了被测系统的核心算法。
- `.github/workflows/ci.yml` 每个 step 结尾 `|| true`，lint/build 失败照样绿；**vitest 测试完全未进 CI**。

因此检验重心应放在：质量分从哪来、是否可信、护栏在真实生成链路上是否真正生效，而非再堆一轮流程演示。

## ② 提升框架

- **可复现优先**：任何「真机验证」必须是脚本可重放、不依赖人工点击。dev 跑在 3001，就让 CI 里起 `next dev` 后台 job 跑 agent-*.cjs，而不是只在本地手敲。
- **自动化优先**：凡有确定性输出的纯函数（evaluateConfirmEligibility、gradeOf、analyzeQuality），一律进 vitest；只有涉及 DB+SSE 的链路才用 API 脚本。分层不是选择，是纪律。

## ③ 具体可落地步骤（5 个）

1. **给 confirm-guard 补单元测试（最高优先）**：vitest 直调 `evaluateConfirmEligibility` 覆盖分支矩阵——空正文、<50 字、qualityScore=59/60/85、qualityScore=null 走 analyzeQuality 回退、requirePassed=false 跳过护栏。约 20 行测试换整个确认体系的可信度，ROI 极高。
2. **vitest 接入 CI 并去掉 `|| true`**：`npm test` 写入 ci.yml，任何一步失败即红。这是「自动化验证是否真实覆盖」的试金石，也是对现有 11 个测试文件价值的第一次真检验。
3. **审计 qualityScore 写入面**：`grep -rn "qualityScore" src/` 落一份数据流清单，确认哪些 route/流水线允许客户端伪造分数（现有脚本已证明 PUT 可伪造）。给 auto-confirm 加规则：只采信流水线算出的分，客户端注入一律视为 null 重新分析。
4. **真机脚本升级为「真链验证」**：新增 `scripts/agent-quality-realpath-verify.cjs`——不写 qualityScore，走真实生成（短章）→ post-processor 出分 → auto-confirm 放行，断言 score 与 grade 一致、reviewLogs 追加正确、填表副作用真实发生。这是现有脚本全部绕过的盲区。
5. **applyConfirm 事务化与并发验证**：现实现是 read-then-write（findUnique reviewLogs → update），无 `$transaction`、无乐观锁。两个并行请求确认同一节点会丢 reviewLogs。补事务 + 写并发测试（同节点双请求，断言 reviewLogs 完整）。

## ④ 风险提示

- **技术债**：仓库根堆着 `_ssr_root.html`(37KB)、`.runtime/`、`dev3002.log`、`continue.sse`、`mon.json` 等调试残留，应清理并补 .gitignore。
- **性能**：全书扫描时无 qualityScore 的节点逐个实时 analyzeQuality，O(n) 尚可，但生成流水线已算过分、路径又重复算，需防调用点蔓延导致重复分析翻倍。
- **stale client 类运维坑**：SSE 长连接断开后前端可能停留在 drafting 视觉态；监控看板 autoRate 依赖 reviewLogs **追加式**写入，任何历史「覆盖式」写 reviewLogs 的路径都会污染统计——统一走 applyConfirm，别另开门。

## ⑤ 与其他职能的张力

- **与产品/方向**：产品要「流程看起来完整」，我坚持「护栏真实性优先」——autoRate 100% 在脚本里好看，但脚本绕过真评分，数字是虚的，不修会变成自我欺骗。
- **与真实性**：真实性职能主张全真 e2e，我同意目标但主张分层——纯函数单元测 + 链路脚本，避免把昂贵的全真用例堆在不该堆的地方。
- **与用户**：用户要「用起来没毛病」，我会直说当前 CI 形同虚设、质量分可被客户端伪造是比功能缺口更危险的债——先把门立起来，演示可以延后。
