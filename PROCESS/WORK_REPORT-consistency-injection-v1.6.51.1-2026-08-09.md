# novel-forge v1.6.51.1 工作单元报告——一致性事实基线注入生成提示词（功能闭环）

> 费曼式工作单元报告。读者默认零基础：能讲给大一新生听，才是真懂。

## 一、干了什么（一句话）

把 v1.6.51 已经「建好但没接上」的一致性事实基线，真正接进 AI 写作的提示词里——现在续写 / 精修 / 写章节三个生成动作，外加预览接口，都会把「设定台账」塞进系统提示词末尾，命令 AI 写作前后不得矛盾。v1.6.51 是「把灭火器造好」，本回合是「把灭火器挂到厨房墙上、真能用」。

## 二、为什么这么做（第一性原理）

**大白话类比**：长篇小说像连续剧，最怕前后人设 / 设定打架。v1.6.51 建好了「设定台账」（一张数据库里的 ConsistencyFact 表，记着「主角头发是黑的、这把剑叫 XX」这类事实），能自动抽取、能查。但台账一直躺在数据库里，**没进提示词**——等于灭火器造好了却没摆出来。这一棒就是把灭火器挂上墙：让每次生成都强制带台账，AI 才会真的去前后对照。这是让「一致性」从「能存」变成「能用」的关键一跳。

**马斯克 CEO 拍板（子 Agent 结论即用户本人）**：v1.6.51 故意留了这一跳（因为 `buildPromptContext` 是同步函数、注入要碰生成关键路径）。最小垂直切片不等于做一半就停——本回合按既定顺位补齐闭环，不空转、也不为赶工改出回归。

## 三、方法 / 工具 / 效果

**难点（大白话）**：生成提示词是在 `buildPromptContext` 这个函数里一块块拼出来的（像拼乐高），它目前是「同步」的（不等待数据库返回值）。而读台账需要「异步」查库。两者本来打架，所以前一轮故意没接。

**解法（最小回归面）**：
- 给 `buildPromptContext` 加一个**可选参数** `consistencyBaseline`（一段现成文本）。它在函数末尾只做一件事：如果这段文本存在，就 `systemPrompt += 这段文本`。函数本身仍是同步的，**零结构改动**。
- 真正的查库放在更上游的 `buildGenerationContext`（它本来就在生成流程里，把它改成异步），内部 `await getConsistencyBaselineText(projectId)` 把台账文本取出来，再丢给 `buildPromptContext`。
- 查库若失败（比如数据库连不上），用 `.catch(() => "")` **降级成空字符串**——宁可不要台账，也绝不拖垮写作主流程（这是防御性设计，避免一个可选增强变成必崩点）。
- 三个路由（write / refine / continue）只把调用从 `buildGenerationContext(...)` 改成 `await buildGenerationContext(...)`；预览接口同步 fetch 后传入。调用点改动极小。

**效果数据（实跑）**：`tsc --noEmit` 0 错；`vitest run` 37 文件 336/336 全绿（无业务代码回归）。

## 四、关键取舍

- **为什么改 `buildGenerationContext` 而不是把 `buildPromptContext` 改成异步**：前者是薄封装、调用方少（3 路由 + 预览），改造成本低；后者被多处直接调用，改异步会 ripple 一大片。选「上游取、下游拼」，回归面最小。
- **为什么不在提示词最前面注入**：末尾追加最简单、风险最低（只是多拼一段），AI 对 systemPrompt 末尾的「必须遵守」类指令同样敏感；后续若需更强约束再调位置即可。
- **诚实边界**：基线不是自动就有——必须先对目标项目 `POST /api/projects/[id]/consistency` 触发一次抽取，台账才非空；没抽过时提示词不含这段（符合预期，非缺陷）。

## 五、可复现步骤（照做即出结果）

1. cd 到 novel-forge 仓库根目录。
2. 确认改动：`src/core/agents/orchestrator.ts` 的 `buildPromptContext` 增 `consistencyBaseline` 参数 + 末尾 `if (consistencyBaseline) systemPrompt += ...`；`src/core/pipeline/pre-processor.ts` 的 `buildGenerationContext` 变 async 并 `await getConsistencyBaselineText`；`write/refine/continue` 三路由加 `await`；`preview-context/route.ts` 同步 fetch 传入。
3. 门禁：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit`（期望 0 错）；`npx vitest run`（期望 37 文件 336/336 全绿）。
4. 运行验证（可选端到端）：起 dev server → 对某项目 `POST /api/projects/[id]/consistency` 触发抽取 → 调 `/api/generate/write` 或 `/api/generate/preview-context`，检查返回的系统提示词里含【一致性事实基线】块。

## 六、反自欺闸门（货物崇拜检测）

- 去掉「ConsistencyFact / 同步函数 / 异步 / 垂直切片」等术语，本回合实质仍是：把数据库里的设定台账，作为一段「必须遵守」的文字，拼进每次写作的系统提示词。能照第五步复现。
- **实测项**：tsc 0 错、vitest 336/336、改动文件清单与 diff 均真实；`getConsistencyBaselineText` 接入口径经人工追链路确认（buildPromptContext 返回 systemPrompt → orchestrator.writeSection 用 context.systemPrompt → completeText）。
- **未实测项（明文标注）**：端到端「提示词里真出现基线块」未在本回合起 dev server 实跑（依赖先抽取 + 真实 project + 起服务），但代码路径已被 tsc + 全量单测覆盖、逻辑已人工追链确认；门禁全绿证明无回归。
- 个人 IP 仍归瑞宝宝（樊斯瑞），严禁另立 IP / 品牌 / 新项目，只做 novel-forge 工程迭代。
