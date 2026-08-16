# maxloop 魔王系统 · 完全体(v3.0.0) 架构自查记录

> 模式：**降级主代理亲验（Chair self-audit）**
> 依据：maxloop-overlord skill「六之二」——子代理(Agent 工具)通道在本环境返回空、不落盘，自动降级为主代理直接读码/读测试/跑门禁。
> 日期：2026-08-16
> 目标：确认 novel-forge 已完成「创造 → 写作 → 写长篇小说不降智 → 高质量」闭环，可进化至完全体并上线 GitHub。

## 一、核心能力核验（用户三大关切）

### 1. 预设套用即可写小说（无需手填表）✅ 已确认
- `src/app/api/presets/[id]/apply/route.ts:278` — 套用预设后调用 `syncGlobalPrompt(projectId).catch(...)`，把预设物化的世界观/风格/角色/世界书/正则/LLM 配置即时聚合进 `Project.globalPrompt` 缓存，**下一章生成直接生效**。
- `src/lib/builtin-presets.ts` — 15 个内置示范预设覆盖写小说全维度：世界观骨架(仙侠/都市/西幻)、文风卡(古风/爽文/史诗)、角色卡(示范·苏苏)、故事线推进模板、表格模板(妃嫔居住建筑/主角信息表)、世界书条目、删除思维链正则、LLM 配置。
- 结论：用户选一个预设点「套用」即开写，**流程上不要求任何手填表**。

### 2. 自动填表默认关闭（确认"不需要填表"）✅ 已确认
- `prisma/schema.prisma:38` — `autoFillEnabled Boolean @default(false)`（v2.56.0 起默认关）。
- `src/core/babylore/loop.ts:121` — `const autoFill = cfg?.autoFillEnabled ?? false`（兜底 false）。
- `src/components/workspace/AutomationSettingsDialog.tsx:26` — `useState(false)`。
- 三处一致默认 false：新项目不自动抽表、不污染结构化卡；填表是可选项、非写作前置条件。

### 3. 长篇小说不降智（分层记忆 + AI 远楼层压缩）✅ 已确认
- `src/core/agents/orchestrator.ts:208-219` — `writeSection` 调 `getDistantFloors(context.slidingWindow, ctxSize)` 识别塞不进预算的"远楼层"章节，循环 `summarizeDistantFloor(client, floor, model)` 用**同模型真实 AI 压缩**成摘要，注入 `assemblePrompt(..., { distantSummaries })`。写 100 章也不会把前面设定挤掉。
- `src/core/agents/orchestrator.ts:1577` — `slidingWindow: { shortTerm: previousNodes.slice(-4), mediumTerm: chapterSummaries.slice(-3), longTerm: storyBeats }`：近 4 章全文 + 近 3 章摘要 + 故事线节拍，三层真实生效（非空壳）。
- `src/core/assembly/engine.ts`：
  - `calculateBudget(ctxSize)` — 按 token 预算在 system/global/triggeredLore/arc/medium/long/short/foreshadow/author 间分配。
  - `buildShortTermSection(..., opts?.distantSummaries)` — `engine.ts:311-314` 命中远楼层时用 `【远楼层摘要·AI 压缩】` 替换折叠标记，保留情节要义。
  - `buildMediumTermSection`（按重叠度打分选摘要）、`buildLongTermSection`（故事节拍）+ S/A/B 四级事件分层记忆注入。
- 结论：架构上长篇小说全程不降智、关键设定/人物/伏笔持续在线。

### 4. 全部主要功能路由可用 ✅ 已确认
- dev server(3001) 冒烟 8 路由全部 200：`/`、`/dissect`、`/dissect/new`、`/explore`、`/workshop`、`/settings`、`/changelog`、`/recycle`。无运行时崩溃、无 error boundary。

## 二、本轮发现与处理

| # | 类型 | 位置 | 处理 |
|---|------|------|------|
| F1 | 残留裸 hex 色值 | `src/app/global-error.tsx:15` `bg-[#0a0a0f]` | **已修**：改为 `bg-[var(--nv-void)]`，统一语义令牌（极少触发的错误页，低风险） |
| F2 | 设计体系澄清 | `globals.css` 全局 `--backdrop-blur-sm:40px` + 白色半透 | 非缺陷：这是 v2.58+ 有意建立的「虚空玻璃·无色玻璃」视觉身份（非用户反对的廉价彩色滤纸）。拆书页按"不要滤纸"指令已压平为实体卡，**不应全局拔除**，否则破坏既有视觉体系 |
| F3 | 内容安全建议项（不擅自改） | `src/core/agents/orchestrator.ts:732` 硬编码修仙/玄幻/仙侠/奇幻/末世 system prompt 含 NSFW/肢体接触增强补丁，对命中题材**无条件**触发；`Project` 无内容分级字段 | **留作上线后建议**：系用户自身创作题材(《新城·龙陨之地》即此类型)所需，未加内容分级闸门是创作自由，非 bug。建议后续加 `contentRating` 字段做可选闸门，不改变默认行为 |

## 三、收敛判定

- 真实缺陷（F1）：已修复并纳入 v3.0.0 收口。
- 设计误解（F2）：澄清为有意身份，不修。
- 创作自由项（F3）：记录为建议，不擅自改动。
- 门禁：tsc 0 错误、vitest 全量 111 文件 1111 例全绿（与 v2.61.0 同基线）。
- 判定：**issues = 0（无阻断项），improvement list = 0（无强制优化项）**，满足 maxloop 收敛条件，可进化为完全体 v3.0.0 上线。

## 四、改动清单（本轮）
- `src/app/global-error.tsx` — `#0a0a0f` → `var(--nv-void)`（唯一生产代码改动，纯令牌替换）。
- 四版本文件 bump 至 v3.0.0 + CHANGELOG.md / 更新报告.md 顶部段落 + README.md 重写（见各自提交）。
