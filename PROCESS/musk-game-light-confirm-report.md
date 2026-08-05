# 游戏导出轻确认闭环（#519）费曼报告

> 读者设定：零基础大学生，不懂任何专业名词。能讲给大一新生听，才说明真懂。

## 一句话结论
游戏模式导出的章节，现在和正式手写的章节走**同一条确认流水线**：质量达标就自动定稿 + 自动填进设定库，不达标就留给你手动确认。之前游戏导出的章节是「黑户」——直接标成「完成」、绕开确认环节，在监控看板里根本看不见。

---

## ① 干了什么

改了 `src/core/game/game-engine.ts` 里 `endGameAndExport`（游戏结束时把累积正文存回章节）的最后一笔「写库」：

1. 先算这章的质量分，章节状态先落 `drafting`（待确认）；
2. 看项目开关 `autoConfirmEnabled`（智能审阅总开关）：
   - **开着且质量达标** → 调 `applyConfirm`：状态变 `confirmed`（已定稿）+ 自动把正文里的人物/设定填进设定库 + 在审阅日志写一条「auto-confirm」标记；
   - **关着、或质量不达标** → 停在 `drafting`，等你在确认栏手动拍板。
3. 顺手把质量分（`qualityScore`）写回章节，让监控看板的「自动放行率」也能统计到游戏导出章。

同时把 `/api/game/end` 返回里加上 `status / autoConfirmed / qualityScore` 三个字段，前端和验证脚本都能读到最终结果。

---

## ② 为什么这么做（第一性原理）

确认流程本质上是一套「状态机」：章节从 `drafting`（待确认）→ 你确认 → `confirmed`（定稿）。

游戏模式本该是这套流程的「另一个入口」——你玩游戏，AI 写正文，最后导出成章节，理应也进确认流程。但原来的代码在游戏导出那一步**直接跳到 `completed`**，等于绕过了三件事：
- 自动确认（`auto-confirm`）
- 自动填设定库（`safeFillAfterWriting`）
- 质量分记录（`qualityScore` / 审阅日志）

后果：游戏写的章节在确认看板里「隐形」，自动化率统计也不准，而且和正式章节体验割裂（正式章要确认、游戏章不要）。

**根因**：游戏每轮叙事落在单独的 `gameState` 表，不经过确认流程；只有最后导出才写回章节，而那一笔偷懒写了死状态。补上「轻确认」= 让游戏这个入口也走确认护栏，和正式章节**共用同一套 `confirm-guard` 规则**，不重写逻辑。

---

## ③ 用了什么方法 / 效果

- **复用，不重写**：直接调用已经验证过的 `src/core/confirm-guard.ts` 里的两个函数——
  - `evaluateConfirmEligibility`：评估质量（空正文/过短优先拦、有分数采信、没分数本地实时算、低于 60 分拦）；
  - `applyConfirm`：自动填表 + 置 `confirmed` + 写审阅日志。
  
  游戏导出和正式章节用的是**同一个函数**，规则永远一致，不会出现「两套管委会各说各话」。
- **真机验证**：写了 `scripts/agent-game-light-confirm-verify.cjs`，真实调本地 API 玩一局游戏（start → 两轮 action → end）：
  - 主路径（开关默认开）：导出章 `status=confirmed`、`autoConfirmed=true`、质量分 85、审阅日志里出现 `auto-confirm` 标记（证明自动填表真跑了）。
  - 边界（手动把开关关掉）：同一项目再导出一章，`status=drafting`、`autoConfirmed=false`——关掉智能审阅就乖乖等你手动确认，和正式章节一致。
- **零类型错误**：`tsc --noEmit` 通过；双 changelog 升 v0.46.94；已推送到 GitHub `huanweide/novel-forge`。

---

## ④ 关键取舍（踩过的坑）

- **为什么复用 `confirm-guard` 而不是游戏里另写一套**：避免规则分裂（之前就因「两套阈值」出过 bug）。代价是游戏导出要读一次 `Project.autoConfirmEnabled` 字段——该字段在 Round3 已加，无需改 schema。
- **Windows 下脚本执行坑**：验证脚本里切开关用 `prisma db execute`，但 `execSync` 在 Windows 默认用 `cmd.exe`，`./node_modules/.bin/prisma` 这种无扩展名路径 cmd 不认、正斜杠也不认。改成 `path.join(ROOT,'node_modules','.bin','prisma.cmd')` 绝对路径才跑通。
- **改源码必须重启 dev**：新 `game-engine` 代码要 dev 重新加载才生效（旧进程还是写 `completed` 的老逻辑）。本次重启时还踩了「端口被旧进程占、pkill 没杀掉、taskkill 才成」的坑——Git Bash 的 `kill` 对 Windows 原生进程无效，得用 `taskkill /F /PID`。

---

## 可复现步骤（照做就能验证）

1. 项目根起 dev：`npm run dev`（端口 3001）。
2. 跑验证：`node scripts/agent-game-light-confirm-verify.cjs`。
3. 看输出：
   - 主路径 `✓ PASS: 主路径：导出节点 status=confirmed`
   - 边界 `✓ PASS: 边界：关闭智能审阅时导出节点 status=drafting`
   - 最后 `✅ 游戏导出轻确认 #519 真机闭环全部通过`
4. 验证脚本会自动建项目、玩游戏、断言、软删清理，不留在数据库里留垃圾。

---

## 诚实边界（反自欺）

- 浏览器视觉（游戏结束界面会不会显示「已自动定稿 / 待确认」小角标）沙箱无 Chromium 没目测；但读了前端 `handleEnd` 源码确认它只消费正文和字数、不依赖旧 `completed` 状态，所以导出节点变 `confirmed/drafting` 不会破坏游戏界面。
- 边界「关开关 → drafting」是真机跑出来的（不是只靠代码推断）；主路径质量分 85 是 `analyzeQuality` 实时算的，不是写死的。
- 本次验证消耗了真实 LLM 调用（游戏 start/action/end 各触发一次真实生成），是端到端真机，不是 mock。
