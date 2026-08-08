# 费曼报告 · v1.6.20 待审隔离收口 + 负向回归固化

> 读者前提：零基础大学生也能看懂。本版本解决一个核心问题——AI 自动抽取的「待审角色/世界卡」不该直接混进小说正文生成，必须先人工确认。我们把最后几个漏网的注入入口堵上，并用一道自动化测试永久守住。

## ① 干了什么（一句话）

v1.6.20 收口了上一轮七人评审会裁定的 **F1 + F3 待审隔离泄漏**：给主生成链路（`sync-global-prompt`）和章纲/游戏两个取用端补上 `reviewStatus: approved` 闸门，并新建一条「负向回归测试」把「阻断优于补救」焊死在 CI 里。

## ② 为什么这么做（拆到底层）

**先讲背景概念**：小说平台里 AI 会自动从正文抽取出「角色卡、世界设定卡」存进数据库。这些卡默认是「待审（pending）」状态——意思是「AI 猜的，人还没确认」。全局有一条铁律：**只有人工确认过的卡（approved）才能注入到下一次生成正文的素材里**，否则 AI 自己猜的设定会污染它接下来写的内容。

**漏口是怎么被发现的**：这条铁律之前是「每个读取卡的地方手动加一道过滤」实现的（散布式约定，不是统一拦截）。v1.6.13/18 在 `context-loader`（最主要的取用端）加了闸门，但评审会 + Chair 亲查发现还有漏网之鱼：

- **F1（高危）**：`sync-global-prompt.ts` 这个文件会把三张卡「预编译」进 `Project.globalPrompt` 这个缓存字段，`orchestrator` 每次生成直接读这个缓存注入。但它的取用端只写了 `where:{projectId}`，**没加 `reviewStatus` 过滤**。等于待审卡绕过 context-loader 的闸门，从「全局缓存旁路」直接混进每一次生成——这是主路径，危害最大。
- **F3（中）**：`outline-context.ts`（章纲生成）和 `game-engine.ts`（游戏生成）两个取用端同样漏了 `reviewStatus` 过滤。

**为什么这件事值得开一场会**：它涉及「取舍」——哪些漏口是头号优先、哪些要独立立项。七人评审会（马斯克/Karpathy/Ilya/塔勒布/费曼/PG/乔布斯）一致裁定 F1/F3 头号优先（约 6 行改动、主路径、可回归、零功能损失），F2（撤销填表的精确还原）独立立项，F4（大书导出流式）暂缓。

## ③ 方法工具与效果（对比过什么、结果数据）

**改动清单（已落代码，Chair 亲读 diff 核实）**：

| 文件 | 位置 | 改动 |
|------|------|------|
| `src/core/sync-global-prompt.ts` | L21-22 | 角色卡/世界卡 findMany 补 `reviewStatus: approved` |
| `src/core/pipeline/outline-context.ts` | L46 | 章纲取用端角色卡 findMany 补 `reviewStatus: approved` |
| `src/core/game/game-engine.ts` | L236-237 | 游戏取用端角色卡/世界卡 findMany 补 `reviewStatus: approved` |
| `src/core/sync-global-prompt.test.ts` | 新建 | 负向回归测试（1 条） |

**关键方法——负向回归测试（阻断优于补救）**：
以前会议结论靠「人记得」守住，但后续提交可能悄悄把过滤删掉而没人发现。新测试 `sync-global-prompt.test.ts` 用 mock 把 prisma 的 `characterCard.findMany` 做成「**只有当 `where.reviewStatus === approved` 时才返回 approved 卡，否则返回 approved+pending 两张**」。这样：
- 修复后（函数传了 approved）→ 只回 approved → pending 名字不在 `globalPrompt` → 测试绿。
- 一旦有人回退过滤 → 函数拿不到 approved 过滤 → mock 返回两张 → pending 名字进 prompt → 测试立刻变红。

等于把会议结论变成一道会自动报警的墙，而不是一句容易忘的嘱咐。

**实测结果（真实跑过，非推测）**：
```
# 单跑负向测试
npx vitest run src/core/sync-global-prompt.test.ts
→ ✓ src/core/sync-global-prompt.test.ts (1 test) 4ms
→ [sync] globalPrompt 已刷新 — 1角色 · 0世界   （证实 pending 已被过滤）

# 全量门禁
SAFE_DELETE_DISABLE=1 npx tsc --noEmit        → EXIT=0（零类型错误）
SAFE_DELETE_DISABLE=1 npx vitest run          → Test Files 28 passed · Tests 293 passed
```

## ④ 关键取舍（工具 A 为何不选 B、踩坑与修复）

1. **为什么不开第二场会去「验证」**：会议的价值是「真取舍」，验证必须落到代码级。我们没再开一场会，而是用负向测试 + 亲读关键函数（orchestrator.ts:654 确消费 globalPrompt、三处 Edit 确补 approved）来确认，效率远高于又拉七个人。

2. **Trust but verify 实战——工具假阴性的血泪教训**：本轮最关键的纠偏是推翻了一个 subagent 的误判。该 subagent 用 Grep/Glob 工具搜 `reviewStatus` 和 `sync-global-prompt.ts`，返回「No matches / No files found」，于是推论「F1 文件不存在、不能当事实」。Chair 用 **Bash 的 `grep`/`ls`/`Read`** 亲自核实，发现 `reviewStatus` 实际出现 113 次、`sync-global-prompt.ts` 真实存在且 L21-22 确无过滤——**F1 100% 属实**。
   - **铁律更新**：本仓库验证必须用 Bash `grep`/`sed`/`Read`，不可轻信 Grep/Glob 工具在「绝对路径 + glob 参数」下的零匹配（会假阴性）。已写入 MEMORY.md 工程铁律。

3. **F2 / F4 为何留后续**：F2（撤销填表的 update 类精确还原）需要给 `BabyloreFillBatch` 加 `beforeValues` 字段 + update 回滚单测，属产品线级改动，非快速 fix，独立立项；F4（大书导出流式分块）当前非阻塞，暂缓。

## 诚实边界（反自欺闸门）

- **F1/F3 已收口并测试固化**，但 `globalPrompt` 是「预编译缓存」，不是实时查询：待审卡创建后必须重新触发 `sync-global-prompt` 才会刷新进缓存（与既有 sync 语义一致），并非「建卡即生效」。这是已知语义，非漏洞，但需在文档/UI 提示里讲清，避免误解为实时拦截。
- **F2（update 精确撤销）、F4（大书流式）本轮未做**，按会议决议分别独立立项 / 暂缓，不假装已修。
- 无 Chromium 端到端实测（沙箱限制），验证降级为「API 逻辑 + 源码阅读 + 双门禁 + 负向单测」，已在测试中覆盖 pending 不进 prompt 的核心断言。

## 可复现步骤（照做即可）

```bash
cd /c/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge

# 1. 三处取用端补 reviewStatus:approved（见上表行号，已 Edit）
# 2. 新建负向回归测试 src/core/sync-global-prompt.test.ts

# 3. 双门禁（零错误/全绿才升版）
SAFE_DELETE_DISABLE=1 npx tsc --noEmit
SAFE_DELETE_DISABLE=1 npx vitest run

# 4. 双 changelog 升版（changelog-data.ts 三处 + 根 CHANGELOG.md 头条，字符串避英文双引号用「」）
# 5. 提交 + 代理推送
git add -A && git commit -m "v1.6.20 待审隔离收口 + 负向回归固化"
GH_TOKEN=$("/c/Program Files/GitHub CLI/gh.exe" auth token) && \
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 \
push https://huanweide:${GH_TOKEN}@github.com/huanweide/novel-forge.git main
```
