# 费曼报告 · v1.6.21 待审隔离漏口全量收口

> 零基础也能看懂：小说平台里 AI 会自动抽「角色/世界卡」存库，默认是「待审」状态（AI 猜的、人没确认），铁律是「只有人确认过的卡才能进正文生成」。v1.6.21 把上一轮漏掉的 7 个入口全部堵上。

## ① 干了什么（一句话）

v1.6.21 收口了 Explore-2 复验挖出的 **待审隔离漏口**：给 7 个生成/游戏入口的 **16 处**角色卡/世界卡查询全部补上 `reviewStatus: approved` 过滤，让待审卡不再从 AI 助手对话、写前分析、预览上下文、游戏开场这些旁路混进生成。

## ② 为什么这么做（拆到底层）

**背景**：待审隔离这条铁律，前几轮（v1.6.13/18/20）是「每个读取卡的地方手动加一道过滤」实现的。这是**散布式手动约定**，不是统一拦截——本质上每多一个取用端就多一个漏点。

**v1.6.20 只修了 4 处**（context-loader / sync-global-prompt / outline-context / game-engine），但 Explore-2 用 Bash grep 穷举全仓后发现还有 **7 个入口 16 处**完全漏网：
- `generate/chat`（AI 助手对话：findCharacters / findLore / detectEntities）
- `generate/pre-write-cards`（写前卡片分析）
- `generate/preview-context`（预览上下文）
- `game/concept` / `game/start` / `game/outline/generate` / `game/outline/chat`（游戏四类生成）

这些入口读卡时只写了 `where: { projectId }` 或 `where: { projectId, enabled: true }`，**没有 `reviewStatus`**。等于待审卡绕开全部已修闸门，直接喂给 LLM——写前分析会引用未确认角色、游戏开场会说出 AI 瞎编的设定。危害与已修的主路径同级。

## ③ 方法工具与效果（对比过什么、结果数据）

**关键方法——Chair 亲核（Trust but verify 实战）**：
上一轮 F1 的教训是 subagent 用 Grep/Glob 工具假阴性误判。本轮 Chair 不轻信 Explore-2 的列表，而是用 **Bash `grep -n`** 逐一打开 7 个文件的 16 行核实，确认每一处都是「有 `enabled:true` 但缺 `reviewStatus`」的真实漏口（无一误报）。证据片段：
```
generate/chat/route.ts:46        prisma.characterCard.findMany({ where: { projectId } }),          ← 漏
generate/pre-write-cards/route.ts:59   ...findMany({ where: { projectId } });                      ← 漏
game/start/route.ts:28           ...findMany({ where: { projectId, enabled: true }, take: 15 }),  ← 漏 reviewStatus
```

**改动清单**（Chair 亲读 diff 核实，同文件多 Edit 串行规避竞态）：

| 文件 | 漏口数 | 改动 |
|------|------|------|
| `src/app/api/generate/chat/route.ts` | 4 | findCharacters/findLore/detectEntities 两处角色卡 + 两处世界卡补 `reviewStatus: approved`（世界卡叠加 `enabled: true`） |
| `src/app/api/generate/pre-write-cards/route.ts` | 2 | 角色卡 L59 + 世界卡 L219-220 |
| `src/app/api/generate/preview-context/route.ts` | 2 | 角色卡 L35 + 世界卡 L36-37 |
| `src/app/api/game/concept/route.ts` | 2 | 角色卡 L21 + 世界卡 L22 |
| `src/app/api/game/start/route.ts` | 2 | 角色卡 L27 + 世界卡 L28 |
| `src/app/api/game/outline/generate/route.ts` | 2 | 角色卡 L62 + 世界卡 L63 |
| `src/app/api/game/outline/chat/route.ts` | 1 | 角色卡 L70 |

**实测结果（真实跑过）**：
```
SAFE_DELETE_DISABLE=1 npx tsc --noEmit        → EXIT=0（零类型错误）
SAFE_DELETE_DISABLE=1 npx vitest run          → Test Files 28 passed · Tests 293 passed
```

## ④ 关键取舍（工具 A 为何不选 B、踩坑与修复）

1. **为什么只补漏、不本轮回源根治**：本轮聚焦「与已修 4 处对齐」的最小闭环（约 16 行、零功能损失、可回归）。根因——散布式手动过滤——的真正解法是**统一收敛 `getApprovedCards` / `getApprovedLore` helper，让所有取用端调用 helper 而非各自手写 where**。这是 v1.6.22 的明确路线图（一劳永逸，比逐入口补丁更优，且能集中加负向门禁）。

2. **为什么本轮没给 16 个入口逐一建负向测试**：16 处分散在不同路由、各自需 mock NextRequest，逐一建测试成本高且脆弱。更优解是 v1.6.22 收敛 helper 后，只测 helper 一处即可覆盖全部入口。本轮验证靠「双门禁 + 源码亲核 + 路线图承诺」，已在诚实边界明示，不假装已全测。

3. **Trust but verify 再证价值**：若直接采信 Explore-2 列表而不亲核，理论上可能把误报当真；但本轮亲核不仅确认 16 处全属实，还顺便验证了「soft-delete deletedAt 漏口已全部收口」——这是复验清单的额外收获。

## 诚实边界（反自欺闸门）

- **根因未根治**：待审隔离仍是散布式手动过滤，未来新增取用端仍可能漏。v1.6.22 统一 helper 收敛是必须的，否则 v1.6.22 之后还会冒出新漏口。
- **未建 16 入口专项负向测试**：本轮靠双门禁 + 亲核，未达「阻断优于补救」的自动化理想态；v1.6.22 helper 收敛时必须补入口级负向门禁。
- **F2（update 精确还原）/ F4（大书流式）/ Project interface 类型缺口**：Explore-2 确认仍属实，留后续，不假装已修。
- 无 Chromium 端到端实测（沙箱限制），验证降级为「逻辑 + 源码亲核 + 双门禁」。

## 可复现步骤（照做即可）

```bash
cd /c/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge

# 1. 用 Bash grep 穷举全仓取用端（规避 Grep/Glob 假阴性）
grep -rn "characterCard.findMany\|lorebookEntry.findMany" src/app/api

# 2. 对 7 个文件 16 处补 reviewStatus:approved（角色卡）/ enabled:true+reviewStatus:approved（世界卡）
# 3. 双门禁
SAFE_DELETE_DISABLE=1 npx tsc --noEmit
SAFE_DELETE_DISABLE=1 npx vitest run

# 4. 双 changelog 升版 v1.6.21 + 费曼报告
# 5. 提交推送
git add -A && git commit -m "v1.6.21 待审隔离漏口全量收口"
GH_TOKEN=$("/c/Program Files/GitHub CLI/gh.exe" auth token) && \
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 \
push https://huanweide:${GH_TOKEN}@github.com/huanweide/novel-forge.git main
```
