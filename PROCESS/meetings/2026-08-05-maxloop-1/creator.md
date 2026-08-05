# 创造检验报告：真实创作 + 确认链路验证

> 检验对象：Novel Forge v0.46.95（Next.js16+Prisma7+PG）
> 方式：全走 API（localhost:3001），测试项目已软删，无残留
> 诚实标注：**第1章走真实 LLM（deepseek-v4-flash，SSE 流）**；**第2章走降级方式（直接写 content）**——为规避 autoConfirmEnabled 无 API 关入口、以测手动确认链路，两章均如实记录。

## ① 真实创作过程与结果

- 建项目「创造检验 20260805」（科幻，autoConfirmEnabled=true 默认）。建 2 个章节节点（含【章尾悬念】章纲）。
- **第1章（真实 LLM）**：POST /api/generate/write（SSE）成功，token 流 → summarize → classify → logic_check → done。产出正文 1256 字、qualityScore=88。**状态流转**：outline_only →（生成中）drafting → **管线内 auto-confirm 自动置为 confirmed**。reviewLogs 含 postgen 审校条目（logic_flaw major, passed=false）+ auto-confirm 日志。
- **第2章（降级）**：PUT 直接写 330 字正文（status=completed），走**手动确认**：submit → pending_confirm → confirm → confirmed（qualityScore 保持 null，无质量评估）。confirm 触发自动填表（首次因 fill 慢客户端超时，重试后成功）。
- 两章 confirmed 后，整本交付 POST /api/projects/[id]/confirm → 200，项目 confirmedAt 置位；reopen 第1章 → 项目 confirmedAt 被清空（副作用符合预期）。
- 填表副作用：生成「章节事实表」11 行（ch0 7 行 / ch1 4 行，同名去重无重复）；同时生成 2 条**残词世界书词条**。

## ② 发现的问题清单

**P1 生成 done 事件状态与实际不同步（看起来对但实际已变）**
现象：SSE done 返回 `status:"drafting"`，但 GET 节点已是 `confirmed`（管线内 auto-confirm 又改了状态）。根因：done 携带 runPostGenerationPipeline 落库时的快照，未反映其后的 auto-confirm 更新。建议：done 事件前重查库状态，或明确 done.status 仅为生成快照、由前端拉取权威状态。

**P2 审校 passed=false 仍被 auto-confirm 放行**
现象：logic_check 发现 major 逻辑缺陷（passed=false），qualityScore=88 照样自动确认。根因：post-processor 的护栏只调 evaluateConfirmEligibility（纯分数），不读 reviewLogs 的 passed。建议：major 缺陷或 passed=false 应阻断自动确认，人工介入。

**P3 三条确认路径护栏不一致**
现象：auto-confirm / batch-confirm 走 confirm-guard（<60 分拦截）；**单章手动 confirm（PATCH）无任何质量门槛**，qualityScore=null 也直接确认（第2章实证）。建议：手动确认至少补齐「正文长度」校验，或统一走 applyConfirm 共享逻辑。

**P4 自动填表抽取产生残词实体**
现象：世界书新增「片空旷区域」「林舟原」两个 location 词条，正文切词残留（"空无一物的坐标区"→"片空旷区域"）。根因：实体名抽取缺完整性校验。建议：过滤 <2 字/以方位词结尾的片段，或与正文片段做回查。

**P5 填表 _src 溯源标记不准**
现象：事实表行 _src 一律 `ch0:batchmanual / ch1:batchmanual`，但实际触发路径是 auto-confirm / 手动 confirm。建议：safeFillAfterWriting 接收来源枚举并写入。

**P6 reviewLogs 结构不统一**
现象：审校条目用 {id,passed,timestamp}，确认日志用 {at,action}，auto-confirm 与 batch 的 action 值各异（auto-confirm/confirm+batch:true）。前端统一渲染需多态适配。建议：收敛为统一 ReviewLog 结构。

**P7 超时重试下确认计数与日志不一致**
现象：fill 慢导致 confirm 超时，重试后 revisionCount 与 reviewLogs 确认次数偏差 1（第1章 rev=3 但确认日志仅 2 次）。根因：单章 PATCH confirm 用 update 单条无幂等守卫，与 applyConfirm（updateMany 守卫）实现分裂。建议：确认动作统一幂等化，重复请求不重复计数。

**P8 autoConfirmEnabled 无 API 写入入口**
现象：projects/[id] PATCH 不支持该字段，测试者无法经 API 切换确认模式（仅 DB/UI）。建议：补 API 字段，便于自动化测试与运营配置。

## ③ 下一步检验方向

1. **低质量章三路径行为差异**：构造 score<60 正文，实测 auto/batch/手动三条确认路径的拦截差异（验证 P3 修复）。
2. **确认幂等压力测试**：并发/重试 confirm 请求，核对 revisionCount、reviewLogs、事实表行是否重复（验证 P7）。
3. **填表抽取边界用例**：长句、无标点、歧义切词文本的实体名完整性（验证 P4）。
4. **审校→护栏联动**：将 logic_check 的 passed 纳入 auto-confirm 决策后回归验证（验证 P2）。
5. **done 事件状态同步**：真实生成流中对比 done.status 与库态时序（验证 P1）。
