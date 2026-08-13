# round-21 v2.0.17 检验并优化 — 解决方案留痕

> 触发：用户「继续 检验并且优化」（round-20 v2.0.16 收尾后）。
> 目标：主动巡检代码质量 + 针对真实问题做优化 + 处置游离 git 的技术债。

## 一、检验（基线 + 巡检）

1. **质量门禁基线**
   - `tsc --noEmit`：0 错误。
   - `vitest run`：60 文件 514/514 全绿（确认 vitest 默认收集所有 `*.test.ts`，故未跟踪的 `prompt-eval.test.ts`、`rollback/route.test.ts` 也被纳入并全过）。

2. **静态巡检（grep 反模式）**
   - console 泄漏：`src` 内大量 console.error/warn 多在 catch 降级路径（合理诊断日志，保留）。
   - **噪声日志（高频后台任务）**：
     - `sync-global-prompt.ts:44` 成功 console.log，每次 sync 刷屏。
     - `babylore/fill.ts:360/373/407` 每次 LLM 调用（含重试）打印 attempt/http/raw_len/finish 调试日志。
     - `babylore/loop.ts:195` 每章填表打印结果汇总 console.log（信息已 SSE 到前端）。
   - `any` 滥用：`tool-registry.ts`、`explore/page.tsx`、`store/index.ts`、`assembly/*` 大量 `any`——历史债务，收紧风险高、改动面大，本轮不碰（留待单点谨慎推进）。

3. **游离 git 的未跟踪代码体检**
   - `prompt-eval.ts`（178 行）+ test：#320「prompt 当代码」评测集，`evaluatePromptVersions` 要素守护纯函数，零 LLM、确定性，有 5 例测试。
   - `rollback/route.ts`（API）+ test：#319 prompt 版本回滚，mock prisma 测正常+4 类边界，逻辑可靠。
   - 结论：二者类型/测试健康、功能完整，长期游离 git 外是技术债，应正式入库。

## 二、优化方案与改动

### A. 日志噪声治理（低风险、明确收益）
- `sync-global-prompt.ts`：删除成功 console.log（第44行），保留失败 console.error（第41、47行）。
- `babylore/fill.ts`：删除 attempt/http（360）、raw_len/finish（373）调试日志；失败日志（407）由 console.log 降级为 console.warn（保留失败可观测性）。
- `babylore/loop.ts`：删除每章填表汇总 console.log（195），信息已通过 `send({type:"babylore_fill", ...})` 到前端。
- 原则：仅清「后台高频循环任务」调试日志；保留错误诊断（console.error）与一次性导入/回写流程日志。

### B. 守护型代码入库（检验处置）
- `git add` 4 个文件：`prompt-eval.ts`、`prompt-eval.test.ts`、`rollback/route.ts`、`rollback/route.test.ts`。
- 前端暂未调用 rollback API（纯后端闭环），UI 后续可接，符合「增量集成」原则。

### C. 版本记录同步
- `changelog-data.ts`：`LATEST_VERSION`→v2.0.17；CHANGELOG_BRIEF 头条插入 v2.0.17 摘要；VERSIONS 数组头部插入 v2.0.17 对象（日志治理 + 入库 + 验证三 section）。
- `CHANGELOG.md`：顶部插入 `## v2.0.17 — 2026-08-13` 段。

## 三、验证
- `tsc --noEmit`：0 错误。
- `vitest run`：60 文件 514/514 全绿。
- 提交 `53e2838`（9 文件 +438/-7），SSH-over-代理(7897)隧道推送 `2250377..53e2838 main -> main` 成功；remote 恢复 https，临时 ssh conf 用完即删。
- 无 schema 迁移、无新依赖。

## 四、关键取舍
- **不碰 `any` 债务**：收紧需逐文件重构类型，易牵一发动全身、引入新错，违背「低风险快优化」基调，留待专门轮次。
- **不强行接虚拟滚动**：单项目几十~几百条目，普通 map 足够；memo 已覆盖主要重渲染痛点；盲目引入 windowing 库属过度优化。
- **rollback API 先入库后接 UI**：API 先行是合理增量，后端闭环已被测试守护，前端入口后续按需补。
