# 工作单元报告：v1.8.7 全面自查收口（v1.8.4/1.8.5/1.8.6 复核 + 截图证据链）

## 一句话结论

派「马斯克视角」自治 Agent 对 v1.8.4（故事线重构）、v1.8.5（UI 自查）、v1.8.6（真后台 AI）三轮成果做了一轮彻底回头看：全部正确落地、无 regression；12 个核心页面无头截图全部通过；双门禁全绿；唯一发现的架构不一致是「双 AI 生成路径并存」，本轮记录为已知后续项、不仓促大改。

---

## 一、干了什么

1. **梳理三轮改动清单**：让 Agent 对照 git log 与代码，确认 v1.8.4（17 文件）、v1.8.5（1 文件 + changelog）、v1.8.6（11 文件）的关键功能点都已正确落地。
2. **12 页无头截图自查**：覆盖首页、changelog、explore、recycle、settings、workshop、dissect、workspace×2、故事线工作台、角色编辑弹窗、世界书编辑弹窗。
3. **双门禁复核**：主 Agent 亲自重跑 `tsc --noEmit` 和 `vitest run`，确认 0 错、43 文件 368 测试全绿。
4. **升版 v1.8.7**：更新 `src/lib/changelog-data.ts` 与 `CHANGELOG.md`，把自查结论与双路径已知项写进版本公告。
5. **清理 Agent 临时脚本**：删除 3 个 `_tmp_*.cjs` 截图辅助脚本，保持仓库整洁。

---

## 二、为什么这么做

新功能连续三轮密集上线后，最容易出现两种幻觉：

- **「我以为它在了」**：代码提交了，但某个角落的交互、空状态、可访问性其实没对齐。
- **「测试绿了就等于好了」**：单测能拦逻辑 bug，但拦不住 UI 错位、对比度崩塌、console 报错、不同路径行为不一致。

所以要做一次系统级「回头看」：不仅看代码在不在，还要看页面长什么样、用户点下去会经历什么、新旧功能有没有互相踩脚。这轮自查相当于给三轮成果做一次「出厂质检」。

---

## 三、方法、工具与效果

### 1. 马斯克视角自治 Agent

用户之前反复要求「让马斯克自查自测、自己修复、订立计划、每个 UI 截图给自己看」。本轮把这套流程交给 general-purpose Agent 后台执行：

- **订立计划**：明确自查范围（v1.8.4/1.8.5/1.8.6 + 核心页）、截图命令、双门禁标准、禁止事项。
- **截图读图**：用 `shot2.cjs` 复用系统 Chrome 无头截图，1440×900，自动注入 `nf_onboarded_v1` 关闭 onboarding；changelog 用 `FULLPAGE=0` 截 viewport 防黑屏。
- **自主判断**：Agent 用 Read 工具逐张读 PNG，判断对比度、布局、空状态、console 错误、可访问性。
- **自修闭环**：发现不满意就改代码、跑双门禁、保留前后截图。

效果：Agent 自查结论是「12 张截图全部通过，无需修复」。

### 2. 主 Agent trust-but-verify

Agent 汇报后，我亲自做了三件事：

- 重跑双门禁：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 0 错；`npx vitest run` 43 文件 368 测试全绿。
- 抽查 3 张核心截图：故事线工作台、角色编辑弹窗、世界书编辑弹窗，确认视觉质量确实达标。
- 代码级确认双路径：Grep 确认 `StorylineList.tsx:75` 调 `/api/storylines/generate`，`StorylineWorkbench.tsx:143` 调 `/api/generation-tasks`。

### 3. 升版脚本

`src/lib/changelog-data.ts` 是 CRLF 文件，手动 Edit 容易换行出错。用 Python 脚本归一化换行后做字符串替换，再写回 CRLF：`LATEST_VERSION` 改 `v1.8.7`、`CHANGELOG_BRIEF` 换 4 条、`VERSIONS` 数组头部插入条目；`CHANGELOG.md` 顶部插入对应 markdown。

---

## 四、关键取舍

### 取舍 1：本轮要不要统一「双 AI 生成路径」？

**发现的问题**：

- `StorylineList.tsx` 左侧栏的「AI生成」按钮仍走 v1.8.4 同步路径：直接 POST `/api/storylines/generate`，阻塞等待 LLM，拿到 suggestions 后打开工作台中间态。
- `StorylineWorkbench.tsx` 工作台内的「AI 生成」按钮已走 v1.8.6 异步路径：POST `/api/generation-tasks` 创建任务，前端 1.5s 轮询，显示「生成中… X%」，拿到结果后进入中间态。

**不统一的考虑**：

- 两条路径当前都正常工作，双门禁全绿，视觉自查通过。
- 统一需要改造 `StorylineList` 与 `StorylineWorkbench` 之间的状态传递：左侧创建任务后要把 `taskId` 传给工作台，工作台 mount 时自动轮询。这会新增 prop、useEffect 自动轮询逻辑、边界状态处理，还要补测试。在本轮「自查收口」里做这种架构改动，容易把已经稳定的 v1.8.6 轮询逻辑改出 regression。
- 马斯克视角决策：不冒进，先把问题记录清楚，后续专门做一轮「统一真后台路径」更可控。

**结果**：把双路径并存写进 v1.8.7 changelog 的「已知项」，方向明确、不伪装已优化。

### 取舍 2：Agent 说无需修复，是否硬要找优化点？

12 张截图和双门禁都通过，说明当前版本视觉和功能都健康。硬找「优化点」容易改成负优化。本轮的价值就是「确认健康 + 建立截图证据链 + 记录真实遗留项」。

---

## 五、可复现步骤

1. 启动 dev server：`npm run dev`（端口 3001）。
2. 跑双门禁：
   ```bash
   cd C:/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge
   SAFE_DELETE_DISABLE=1 npx tsc --noEmit
   npx vitest run
   ```
3. 无头截图（复用系统 Chrome）：
   ```bash
   # 默认 fullPage
   node shot2.cjs http://127.0.0.1:3001/changelog shots/changelog-viewport.png 4000 1500
   # changelog 等长页用 viewport 防黑屏
   FULLPAGE=0 node shot2.cjs http://127.0.0.1:3001/changelog shots/changelog-viewport.png
   ```
4. 查看截图：`shots/01-home.png` 到 `12-lorebook-dialog.png`。
5. 确认双路径：
   ```bash
   grep -nE "storylines/generate|generation-tasks" src/components/workspace/StorylineList.tsx src/components/workspace/StorylineWorkbench.tsx
   ```

---

## 六、反自欺声明

- 本报告的截图结论基于 Agent 生成的 12 张 PNG + 主 Agent 抽查的 3 张 PNG，均用 Read 工具实际读图，非凭空想象。
- 双门禁由主 Agent 亲自重跑，结果真实：tsc 0 错、vitest 43 文件 368 测试全绿。
- 双生成路径并存已用 Grep 在真实代码中定位到行号，不是推测。
- 本轮没有为了「显得有优化」而做不必要的代码改动；v1.8.7 是一个「自查合规确认版」，不是功能增强版。
