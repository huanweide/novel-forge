# v1.6.14 费曼报告 —— 三透镜复验修复循环

> 日期：2026-08-08｜版本：v1.6.14｜前置：v1.6.13
> 模式：MaxLoop 魔王系统（三透镜并行复验 → Chair 亲读源码核实 → 实施 → 双门禁 → 升版 → 推送）

---

## 一、干了什么（一句话）

v1.6.13 收口后，派出 3 个并行只读复验透镜（软删边界 / 精修+待审隔离 / 伏笔改名+类型一致性）深挖新坑，共挖出 **3 高 5 中 3 低 + 2 高 6 中 6 低 + 7 UI 遗漏**，经 Chair 逐条亲读源码核实后，落地 **8 项修复（5 高 + 3 中）**，双门禁（tsc 0 + vitest 286 绿）通过后升版 v1.6.14 并推送。

---

## 二、为什么这么做（第一性原理）

**核心矛盾**：v1.6.12 加了软删（tombstone 范式——删除=标记 `deletedAt` 不物理删，回收站可恢复），v1.6.13 补了导出/refine 两处泄漏点。但「软删安全」不是单点修复，而是**全链路一致性问题**——只要有一个读取/写入入口漏过滤，回收站保护就被绕过。

**为什么必须全链路核查**：软删本质是「约定」，不是数据库约束。PostgreSQL 不会自动阻止你 `findMany` 软删节点——它只看你写的 `where` 条件。所以每个查询都「自觉」加 `deletedAt: null` 才能闭环。一个入口漏了，用户「以为删了」的节点又被读出来/写进去，软删就名存实亡。

**待审隔离同理**：v1.6.13 的 `reviewStatus: "approved"` 过滤，只在 `context-loader` 这一处生效。但 outline 路由为了取大纲数据，**绕过了 context-loader 自取 `project.lorebookEntries`**——于是 AI 自动填表的 `pending` 待审卡（用户还没确认的世界观猜测）直接渗进大纲 Prompt，污染上游。

**用大白话讲**：软删像「把文件丢进回收站」。v1.6.12 建了回收站，v1.6.13 堵了导出和精修两个口子。但还有 5 个口子（写章/续写/大纲替换/智能体删除/批量确认）能把回收站里的文件翻出来或彻底粉碎——这次全堵上。

---

## 三、方法工具与效果

### 3.1 三透镜并行复验（Explore 只读 Agent）
- **Explore-1（软删边界）**：Grep 全仓 70+ 处 `storyNode` 查询，逐处判过滤点。挖 3 高（write 缺 410 / outline replaceAll 硬删 / Agent outline_delete 硬删）+ 5 中 + 3 低。
- **Explore-2（精修+待审）**：深挖 refine 410 边界 + context-loader 隔离链路 + undo 回滚面。挖 2 高（outline 绕过 context-loader / 其他建卡路径不置 pending）+ 6 中 + 6 低。
- **Explore-3（伏笔+类型）**：全仓「伏笔」字样 + 两套类型系统逐字段比对。挖 7 处 UI 遗漏 + 类型缺口。

### 3.2 Trust but verify（Chair 亲读源码核实）
不轻信 Agent 报告。对每条高危，亲自 Read 源码确认：
- `write/route.ts:51` 只有 `!data.currentNode`，无 `deletedAt` 拦截 ✓ 属实
- `outline/route.ts:325-332` replaceAll 的 `findMany` 无 `deletedAt`，直接 `deleteMany` ✓ 属实
- `tool-registry.ts:628-643` `outline_delete` 递归 `.delete()` 硬删 ✓ 属实
- `outline/route.ts:31` `include: { lorebookEntries: true }` 裸 include ✓ 属实
- `settings/page.tsx:492` 等 7 处「伏笔」文案 ✓ 属实

### 3.3 修复清单（8 项，去重后）

| 编号 | 级别 | 文件 | 改法 |
|------|------|------|------|
| A | 高 | `generate/outline/route.ts:326` | replaceAll 的 `findMany` 加 `deletedAt: null` |
| B | 高 | `generate/write/route.ts:53` 后 | 加 `if (data.currentNode.deletedAt) return 410` |
| C | 高 | `generate/continue/route.ts:48` 后 | 加 `if (currentNode.deletedAt) return 410` |
| D | 高 | `core/agents/tool-registry.ts:633-641` | `outline_delete` 递归 `delete` → `updateMany(deletedAt)` 软删 |
| E | 高 | `generate/outline/route.ts:31` | `include` 改 `lorebookEntries: { where: { enabled: true, reviewStatus: "approved" } }` |
| F | 中 | `story/nodes/batch-confirm:22` + `auto-confirm:23,26` | `findMany` 加 `deletedAt: null` |
| G | 中 | 7 处 UI 文件 | 「伏笔」→「未收尾线索」 |
| H | 中 | `workspace/[projectId]/page.tsx:740` | undo 只发 `{content, wordCount}`，去掉 `...selectedNode` 透传 |

### 3.4 双门禁验证
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → **EXIT_TSC=0**（零错误）
- `npx vitest run` → **286 passed (286)**，26 文件全绿

### 3.5 升版 + 推送
- `changelog-data.ts` 三处（LATEST_VERSION / CHANGELOG_BRIEF / VERSIONS 数组最前插入 v1.6.14）
- 根 `CHANGELOG.md` 头条插入 v1.6.14 段落
- git commit + 用 gh token 直传 URL 解决 credential helper 401

---

## 四、关键取舍

1. **防爆半径优先**：refine 的 410 拦截放在路由入口（精准），不在共享 `context-loader` 改（避免影响 write/refine/continue 三兄弟）。同理 outline 的 H1 修复只改该路由的 include，不动 `context-loader`。
2. **本轮聚焦已知 bug，不摊大**：Explore-2 的 H2（统一建卡 helper 默认 pending）是设计层重构（8+ 文件），本轮不动——它影响「未来新增建卡路径的防护」，不是当前 pending 卡泄漏点（H1 才是）。留 v1.6.15 专项。
3. **类型系统缺口（Explore-3）本轮不动**：StoryNode/Project 手动 interface 缺字段，但当前 tsc 0 错误说明代码未访问这些字段，属潜在非阻塞。补字段有引入新 tsc 错误的风险，留后续。
4. **undo 精确回滚（M2）只发必要字段**：去掉 `...selectedNode` 展开，避免 `revisionCount` 等元数据被回退到「弹窗打开那一刻」。M3（undo 不回滚 babylore 副作用）是产品语义，本轮不动。
5. **G7 一处 Edit 我手滑截断 new_string**，已 Read 核对文件现状并重新精确替换修复——证明「改完必须回读确认」的铁律。

---

## 五、复现步骤（照做可复现）

```bash
# 1. 进入项目
cd /c/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge

# 2. 三透镜复验（只读 Agent，不在此列具体 prompt，见 WORK_REPORT 流程）
#    每个透镜 Grep 全仓 storyNode 查询 / context-loader 调用 / 「伏笔」字样

# 3. Chair 亲读核实高危项
#    Read generate/write/route.ts 确认无 deletedAt 拦截
#    Read generate/outline/route.ts:325-332 确认 replaceAll 硬删
#    Read core/agents/tool-registry.ts:628-643 确认 outline_delete 硬删

# 4. 实施 8 项修复（Edit 工具，见上表）

# 5. 双门禁
SAFE_DELETE_DISABLE=1 npx tsc --noEmit   # 期望 EXIT_TSC=0
npx vitest run                            # 期望 286 passed

# 6. 升版双 changelog（changelog-data.ts 三处 + CHANGELOG.md 头条）

# 7. commit + 推送（gh token 直传解决 401）
git add -A && git commit -m "v1.6.14 ..."
GH_TOKEN=$("C:\Program Files\GitHub CLI\gh.exe" auth token) && git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push https://huanweide:${GH_TOKEN}@github.com/huanweide/novel-forge.git main
```

---

## 六、反自欺声明

- 8 项修复**全部已落地**（15 处 Edit 均返回 success，G7 截断已修复并回读确认）。
- tsc / vitest **真实跑过**：tsc EXIT_TSC=0，vitest 286/286 绿（非推测）。
- 3 个透镜的**每条高危都亲读源码核实**，非直接照搬 Agent 报告。
- 未做端到端浏览器实测（沙箱无 Chromium），按铁律降级为 API 逻辑 + 源码阅读 + 双门禁验证；星辰实机 UI 复检留待 agent-browser。
- 未修项（H2 建卡 helper / 类型缺口 / M3 undo 副作用）**明确留待后续**，非遗漏。
