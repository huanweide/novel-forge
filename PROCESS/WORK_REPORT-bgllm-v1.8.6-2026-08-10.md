# 工作单元报告：novel-forge v1.8.6 真后台 AI 生成（关闭 #174）

> 写给零基础读者：下面每个术语第一次出现，都先用大白话讲清「它怎么运作」，再配一个生活化类比。

## 一句话结论
把故事线「AI 生成」从「你盯着厨师炒完才走」改成「点单拿号、厨房后台做、你先走、过会儿看进度取餐」——关掉页面 AI 也在服务端继续跑，回来轮询就能拿结果。

## 一、干了什么
- 新增「后台生成任务」体系：创建任务 → 服务端异步跑 LLM → 前端轮询拿结果。
- 抽出故事线生成核心逻辑（纯函数，方便测试），新增真后台执行器，新增两个 API（创建任务、轮询单条），前端「AI 生成」按钮改为轮询模式并实时显示进度。
- 升版 v1.8.6，双门禁全绿，端到端实跑通过。

## 二、为什么这么做（第一性原理）
之前点「AI 生成」，前端要**同步**等 LLM 返回（可能几十秒）。类比：你在餐厅点餐，必须站在柜台盯着厨师把菜炒完才能走——页面一旦关掉或刷新，请求断掉，生成白费。

真实痛点：LLM 生成慢、用户可能想去干别的。正确做法是「任务写进数据库、服务端独立跑、前端拿个号随时查」。这正是 v1.8.4 就预埋的 `GenerationTask` 模型（当时标注「待启用」）要解决的——#174 就是把它真正接上。

## 三、方法、工具与效果
1. **抽出纯生成函数** `src/core/storyline/generate.ts`：把原来混在 API 里的「拼提示词 + 调 LLM + 解析 JSON + 转 suggestions」抽成独立函数，只依赖 `completeText`（LLM 调用），不碰数据库——方便单测时 mock 掉 LLM。
2. **后台执行器** `src/core/storyline/execute-task.ts`：拿到 taskId 后，先把状态置 `running`，取项目上下文（角色/世界观/已有故事线），调生成函数，成功写 `done+result`，失败写 `failed+error`。关键：**所有异常都被 try/catch 捕获写进数据库**，绝不抛给「没人 await 的异步协程」（否则变成未捕获崩溃，任务卡死）。
3. **两个 API**：
   - `POST /api/generation-tasks`：创建 `pending` 任务，**立即返回 taskId**，然后用「进程内 fire-and-forget（扔出去不等待）」启动执行器——响应立刻走人，任务在后台跑。
   - `GET /api/generation-tasks/[id]`：前端每 1.5 秒轮询一次，看 `status/progress/result`。
4. **前端改造** `StorylineWorkbench.tsx`：`handleGenerate` 改成「创建任务 → `setInterval` 轮询 → 拿到 suggestions → 进中间态编辑」。按钮显示「生成中… X%」，失败时弹错误原因。组件卸载只清定时器（服务端任务不受影响），关页面不中断生成。

**效果验证**：
- 单测（mock LLM）：成功路径→done+result；失败路径→failed+error 且不抛；任务不存在→静默退出。3 项全过。
- 端到端实跑（星辰项目）：创建任务 → 服务端约 30s 跑通**真实** LLM → 状态 `done`、progress 100 → 轮询拿到 4 条故事线建议，七要素齐全（含科幻线「零点四赫兹的指纹」）。**这次 LLM 在本地真调通了，不是 mock**。

## 四、关键取舍
- **真后台用「进程内异步」而非消息队列**：Next.js 路由返回后，Node 进程（dev/自托管）继续跑未 await 的 promise。简单、零新依赖、符合项目现状。代价：serverless（如 Vercel 冷启动回收）不保证跑完——当前架构务实落地，后续可换持久队列。已在代码注释写明。
- **后台只生成「预览 suggestions」，不自动落库**：保持原有「中间态可编辑再确认落库」交互，不做破坏式改动。
- **复用 v1.8.4 已落地的 `GenerationTask` 模型**：零 schema 变更、零迁移，只把「待启用」变成「已启用」。

## 五、反自欺声明
- 端到端 LLM 调用是**真实跑通**（星辰项目真生成了 4 条线），不是模拟；单测里的 LLM 才是 mock（用于不依赖外部网络验证状态机）。
- 双门禁亲验：`tsc --noEmit` 0 错；`vitest run` 43 文件 368/368 全绿（基线 365，新增 3 项执行器单测）。
- 局限（已知简化，非 bug）：未做「重开工作台自动恢复未完成任务」——关页面再进来需手动再点一次（服务端任务其实还在跑，只是前端没自动续轮询）。

## 六、可复现命令
```bash
# 质量门禁
SAFE_DELETE_DISABLE=1 npx tsc --noEmit
npx vitest run

# 端到端（dev server 在 3001）
node tmp_e2e_bg.cjs   # 创建任务 → 轮询 → 打印最终 status/suggestions

# 升版（CRLF 兼容 Python 脚本，双文件同步）
python tmp_fix_v186.py
```

## 七、交付清单
- 新增：`src/core/storyline/generate.ts`、`src/core/storyline/execute-task.ts`、`src/core/storyline/execute-task.test.ts`
- 新增：`src/app/api/generation-tasks/route.ts`、`src/app/api/generation-tasks/[id]/route.ts`
- 修改：`src/components/workspace/StorylineWorkbench.tsx`（轮询模式）、`src/lib/changelog-data.ts`、`CHANGELOG.md`（v1.8.6）
- 零 schema 变更，复用 `GenerationTask` 模型。
