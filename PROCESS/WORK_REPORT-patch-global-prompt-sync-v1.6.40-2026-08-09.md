# 工作单元报告：v1.6.40 修复 PATCH 路由漏同步 globalPrompt（防 AI 生成读旧提示词）

> 费曼式沉淀 · 零基础可懂 · 瑞宝宝专属工作产出

## 一、干了什么（一句话）

修了一个**真实数据一致性 bug**：作者在项目设置页改了「作品类型 / 基调 / 总纲 / 作者指令」后，AI 写下一章时仍然读取**旧的**全局提示词，等于白改。根因是项目更新接口（PATCH）改了这些字段，却忘了顺手刷新全局提示词缓存。

## 二、为什么这么做（第一性原理）

**globalPrompt 是什么（类比）**：把 AI 想象成一个按「小抄」写作的枪手。`globalPrompt` 就是那张小抄——它由四部分编译而成：「作品信息」（类型/基调/总纲/作者指令）+「角色卡」+「世界书」+「风格卡」。AI 每写一章，都先读这张小抄。

**漏同步的后果**：项目设置页的 PATCH 接口允许作者修改「作品信息」四个字段（genre / synopsis / toneKeywords / authorNote），而这四个字段恰恰是小抄的「作品信息」段落的**渲染源**。但 PATCH 改完数据库后，没有调用 `syncGlobalPrompt()` 去重写小抄。结果：作者在设置页把「科幻」改成「武侠」、把总纲大改，下一章 AI 拿出来的还是旧小抄（仍按科幻写）——生成质量静默失真，作者还以为改生效了。

**为什么是 bug 不是 feature**：角色卡、世界书、风格卡改动后都有 `syncGlobalPrompt()` 兜底（代码里十几个调用点），唯独「作品信息」主入口 PATCH 漏了。这是不一致，不是有意设计。

## 三、方法 / 工具与效果

**1. 检测（真实 grep，非假阴性）**
- 全仓 grep `syncGlobalPrompt` 的调用点，读 `src/core/sync-global-prompt.ts` 确认它渲染哪些字段 → 发现读 `project.genre / synopsis / toneKeywords / authorNote`。
- 再 grep 写这些字段的路由 → 锁定 `src/app/api/projects/[id]/route.ts` 的 `PATCH`：它 `prisma.project.update({ data: { genre, synopsis, ... } })` 却**没有**在成功后调 `syncGlobalPrompt()`。实证确认真实缺口。

**2. 拍板（马斯克人格执行 CEO 子 Agent）**
- 给候选 A（修 PATCH 漏同步）/ B（agent-browser UI 复检，只读）/ C（llmConfig 强类型收口，前轮已暂缓）。
- 子 Agent 拍板：**只做 A**。理由：A 是真 bug、改动极小（PATCH 后加一个受控 sync 调用）、零行为回归、性价比碾压；B 纯只读无代码改动不当迭代驱动器；C 前轮已拍板暂缓（30+ 处 `as any` 读取，重构蔓延引回归）。其反馈即用户本人，未回头问。

**3. 修复（受控 sync，零回归）**
在 PATCH 的 `prisma.project.update` 成功后加：
```ts
const touchedWorkInfo =
  body.genre !== undefined || body.synopsis !== undefined ||
  body.toneKeywords !== undefined || body.authorNote !== undefined;
const manualGlobalPrompt = body.globalPrompt !== undefined;
if (touchedWorkInfo && !manualGlobalPrompt) {
  syncGlobalPrompt(id).catch(() => {});
}
```
- 仅当「改了作品信息字段」且「未显式手动覆盖 globalPrompt」才刷新——避免清掉作者手动编辑的小抄。
- `syncGlobalPrompt` 是确定性重渲染（读最新库字段重算），不改变任何现有逻辑，纯补一道刷新。

**4. 验证（双门禁全绿）**
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit --incremental false` → **0 错误**（关增量缓存防幽灵）。
- `npx vitest run` → **34 文件 320/320 全绿**（较上轮 314 新增 6 项）。
- 新增 `src/app/api/projects/[id]/route.test.ts` 用 `vi.mock` 隔离 prisma 与 `syncGlobalPrompt`，6 项断言：改 genre/synopsis/toneKeywords/authorNote → 触发同步；显式传 globalPrompt → 不触发且保留手动值；仅改 name（非作品信息字段）→ 不触发。

## 四、关键取舍（踩坑与修复）

- **受控守卫**：作者若手动编辑 globalPrompt（前端显式传该字段），则**不**自动 sync，避免覆盖手动内容。这是与 characters/explore/lorebook 既有同步范式一致的防御。
- **行为等价**：syncGlobalPrompt 是确定性重渲染，本修复不改变任何现有分支逻辑，仅补一道刷新，运行时零感知。
- **路径视图坑（重要经验）**：本仓库 git 真实根在 `C:\Users\Administrator\WorkBuddy\...\novel-forge`（无 c），但工具链初始 cwd 显示为 `/c/c/Users/...`（MSYS 双映射假象）。python 子进程会被 MSYS 把任何 `C:/Users` 或 `/c/Users` 形式参数强制改写成 `C:\c\Users\...` 导致 `FileNotFoundError`，Edit/Read 工具的 `C:\c` 视图也找不到 git 文件。最终用 **Bash 的 sed/awk 直接改文件**（sed 能正确访问 `C:\Users` 视图），并用 `vi.hoisted` 包裹测试里的 mock 变量（否则 vitest 报「Cannot access before initialization」）。awk 插入用 `autoDeliverEnabled` 上下文唯一锁定 PATCH 的 `});`，避免误伤 GET/DELETE 路由。
- **IP 铁律**：个人 IP 永远归瑞宝宝（樊斯瑞），本轮只做 novel-forge 工程迭代，未另立 IP/品牌/项目/拉新引流。

## 五、交付物

- `src/app/api/projects/[id]/route.ts`：PATCH 成功后受控调用 `syncGlobalPrompt(id)`。
- `src/app/api/projects/[id]/route.test.ts`：新增 6 项回归断言。
- `src/lib/changelog-data.ts`：LATEST_VERSION/CHANGELOG_BRIEF/VERSIONS 三处升 v1.6.40。
- `CHANGELOG.md`：头条追加 v1.6.40。
- 已推送 `origin/main`。
