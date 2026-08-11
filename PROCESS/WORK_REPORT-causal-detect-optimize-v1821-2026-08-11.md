# 工作单元报告：v1.8.21 因果链检测优化 + 帮助文案修正

## 一、干了什么

继续跑 v1.8.20 的因果链角色标注无头检测，真正验证"点选角色 → 落库 → 统计联动"整条链路，并修复检测过程中发现的一个文案 bug：帮助框把角色按钮的位置说错了。

最终交付：
- 无头检测脚本 `tmp_detect_causal_v1820.cjs` 跑通（零报错、零 503、role 真实落库）。
- 修正 `StorylineWorkbench.tsx` 帮助文案："节点右上角小图标" → "节点下方按钮"。
- `.gitignore` 增加 `.next-detect*`，避免检测用独立 distDir 污染 git。
- 版本升级到 v1.8.21，已 commit（`cb6a164`）并 push 到 `huanweide/novel-forge` main。
- 双门禁：tsc 0 错 + vitest 46 文件 408/408 全绿。

## 二、为什么这么做

v1.8.20 已经把"推进点/卡点/分支选择点"三态角色标注做进代码，但之前没能在干净 dev server 上完整跑一遍真实 UI。原因有两个：

1. **旧 3001 dev server 是 stale 的**：它启动时 Prisma client 还没有 `role` 字段，所以 PUT role 会返回 503。这个进程被平台高权限 token 锁住，kill 不掉。
2. **`.next/dev/types/routes.d.ts` 被截断**：旧 server 留下的生成文件是半截的，导致 tsc 报 TS1005/TS1002（环境残留，非代码缺陷）。

所以本轮的核心目标就是：绕过 stale server，起一个干净的 dev server，把因果链角色标注的真实效果跑通；同时根据截图和 DOM 反馈把发现的 UI 文案问题修掉。

## 三、方法、工具与效果

### 3.1 绕过 stale server

我用的是 Next.js 的 `distDir` 配置项，给检测单独指定一个缓存目录（`.next-detect`），这样新 server 不会和被锁住的 `.next/dev` 抢文件，也不会复用旧 server 的生成产物。

具体操作：
1. 临时在 `next.config.ts` 加 `distDir: ".next-detect"`。
2. 起 `npx next dev -p 3002`（后来发现端口 3001 上已经有另一个干净的 `.next-detect` server PID 53876 在跑，直接用它即可）。
3. 检测完把 `distDir` 删掉，配置还原。

效果：3001 上的干净 server 能正常处理 `PUT /api/storyline-events/[id]`，不再 503。

### 3.2 无头检测流程

工具：Playwright + Chromium + pg 直连。

路径：
```
/workspace/{PID} → 点「故事」tab → 点主线「保守备份 vs 主动扩张」→ 点「因果链」tab
```

关键步骤：
1. 验证空状态：标题「这条线还没有事件」、帮助文案「怎么读这条链？」。
2. 在浏览器内临时造 3 条事件（MILESTONE、EVENT、CLUE），统一 tag `DETECT_TEMP_2026` 方便清理。
3. reload 后验证：因果链主体有 2 个节点（MILESTONE + EVENT），CLUE 进入「悬而未决的因」，节点间有「先发生 → 后导致」流向标记。
4. 用原生 JS 点击第一个节点的「剧情推进点」按钮。
5. 断言顶部统计按钮由「推进 0」变成「推进 1」。
6. pg 直连查 `StorylineEvent.role`，确认被点击事件持久化为 `advance`。
7. DELETE 临时事件。

检测结果 JSON：
```json
{
  "errors": [],
  "responses503": [],
  "nodeCount": 2,
  "causalMarks": 1,
  "pendingCause": 1,
  "advanceAfter": 1,
  "roleDb": "advance",
  "cleaned": 3
}
```

零 console 报错、零 503、role 真实落库、统计实时联动、临时数据清理干净。

### 3.3 发现的文案 bug 与修复

截图显示角色按钮其实位于节点卡片的**下方**（`mt-2` 的按钮组），但帮助文案写的是"点击节点右上角小图标"。这会让用户按文字找不到按钮。

修复：改成"点击节点下方的角色按钮"。

### 3.4 双门禁与版本登记

- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`：0 错误。
- `npx vitest run`：46 文件 408/408 全绿。
- 同步更新 `src/lib/changelog-data.ts` 和 `CHANGELOG.md` 到 v1.8.21，commit + push。

## 四、关键取舍

### 取舍 1：不杀旧 3001 server，改用独立 distDir

我尝试了 `taskkill /PID 19092 /F` 和 `taskkill /PID 53876 /F`，都"拒绝访问"。如果继续死磕杀进程，会浪费大量时间还没结果。改用独立 `distDir` 起新 server 是性价比最高的方案，副作用只是把 `.next-detect` 目录加入 `.gitignore`。

### 取舍 2：临时改 `next.config.ts`，检测完立刻还原

因为 Next.js 16 这个版本的 `next dev --config` 不识别 `--config` flag，没法用外部覆盖配置。所以不得不临时改主配置加 `distDir`，检测后还原。改动了 4 次（`.next-detect` → `.next-detect2` 试错 → 最终确认 3001 可用 → 还原），但每次都在 `git status` 里确认还原成功，没有带进 commit。

### 取舍 3：保留 CLUE 不进主链的设计

检测里 `nodeCount=2` 但造了 3 条事件，一开始可能会误以为丢了一条。实际上 CLUE 作为"悬而未决的因"单独浮在链顶，这是 v1.8.18 就定下的设计，本轮只是再次验证它工作正常。

## 五、可复现步骤

如果你以后需要复现这次检测，按下面做：

```bash
cd C:/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge

# 1. 确认 3001 干净 server 在跑（或自己起一个独立 distDir 的 server）
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/
# 期望输出 200

# 2. 跑检测
node tmp_detect_causal_v1820.cjs

# 3. 看截图
ls _detect_shots/
# 04_causal_empty.png   空状态
# 05_causal_nodes.png   有节点
# 06_role_advance.png   点选推进点后的状态

# 4. 跑双门禁
SAFE_DELETE_DISABLE=1 npx tsc --noEmit
npx vitest run
```

## 六、学到了什么（费曼一句话版）

stale dev server 不是代码 bug，但会伪装成代码 bug（503 + tsc 报截断文件）。下次遇到"代码没问题但服务端行为异常"，先看进程是不是旧的、缓存目录是不是被锁，不要直接改业务代码。
