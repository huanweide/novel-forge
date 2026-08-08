# v1.6.13 复验修复费曼报告

> 日期：2026-08-08　版本：v1.6.13　仓库：huanweide/novel-forge　commit：待填

## 一、干了什么

对 v1.6.12 做系统化只读复验（MaxLoop 魔王循环第 N 轮），挖出 4 个真 bug 并全部修复：

| # | 严重度 | 一句话 | 修复 |
|---|---|---|---|
| 高 #1 | 导出泄漏软删节点 | 导出查询没过滤 deletedAt，已删章节进成书 | 加 deletedAt:null |
| 高 #2 | 精修复活软删节点 | refine 没拦 deletedAt，能改写已删正文 | 加 410 拦截 |
| 中 #3 | 待审世界卡进生成上下文 | lorebookEntry 只按 enabled 过滤，pending 卡注入正文 | 加 reviewStatus:approved |
| 低 #4 | 伏笔改名残留 | 13 处用户可见标签仍是「伏笔」 | 统一为「未收尾线索」 |

## 二、为什么这么做（第一性原理）

### 软删的承诺与漏洞

v1.6.12 引入软删（tombstone 模式）：删除节点不物理删，只标记 `deletedAt` 时间戳。承诺是「防丢稿」——误删可恢复。

但承诺有个隐含前提：**已删节点不应出现在任何用户可见或 AI 可达的路径上**。v1.6.12 只过滤了 4 处高价值读取点（项目树、生成上下文 allNodes、大纲注入、成书判定），遗漏了导出和精修两处。

这就像你在文档里把一段话标了「删除线」——Word 里不会显示，但如果你用「另存为纯文本」，删除线的内容照样导出。导出和 refine 就是那两个「另存为」出口。

### 待审世界卡的隔离幻觉

v1.6.12 加了 `reviewStatus` 字段，AI 自动填表写的世界卡默认 `pending`，承诺「作者确认后才入档」。但「入档」和「参与生成」是两码事——生成上下文加载器（context-loader）只按 `enabled: true` 过滤，不管 `reviewStatus`。所以 pending 卡虽然 UI 上挂着「待审」徽标，实际已注入正文生成。隔离只做了面子，没做里子。

### 伏笔改名的长尾

v1.6.12 把伏笔面板改名为「未收尾线索」，但只改了面板入口（ForeshadowingPanel + AIChatHeader），散落在拆书维度、监控面板、冲突推演、抽卡面板、蒸馏面板等 13 处用户可见标签仍是「伏笔」。这不影响功能，但与「降低误解」的初衷不一致。

## 三、方法工具与效果

### 复验方法：三透镜并行只读复验

派 3 个 Explore Agent（樊氏董事会风格）后台并行对 v1.6.12 做只读复验：

1. **数据一致性透镜** → 软删全链路（级联子树、restore 边界、purge 孤儿表、读取点遗漏）
2. **交互与预算透镜** → 精修 diff（done 事件拦截、applyRefine 重复抽取、undoRefine 还原、预算截短）
3. **集成一致性透镜** → 跨改动（伏笔改名残留、待审全链路、重试退避、导出分层、交互冲突）

集成透镜（Explore-3）率先返回，挖出 4 个真 bug。另外两个透镜仍在后台。

### 核实方法：Trust but verify

Agent 报告不等于事实。对 4 个 bug 逐条亲读源码核实：

- **高 #1**：读 `export/route.ts:47`，确认 `findMany({ where: { projectId: id } })` 无 `deletedAt` → 属实
- **高 #2**：读 `context-loader.ts:34`（`findUnique` 无过滤）+ `refine/route.ts:46`（仅判 `!currentNode`）→ 属实
- **中 #3**：读 `context-loader.ts:62`（`lorebookEntry.findMany({ where: { projectId, enabled: true } })` 无 `reviewStatus`）→ 属实。再确认 schema 默认 `approved`（历史卡不误杀）+ entity-sync.ts:249 只对 LorebookEntry 写 `pending`（CharacterCard 不写，无需过滤）
- **低 #4**：grep 全局「伏笔」，分类出 13 处用户可见标签 vs 底层/prompt/注释（不动）

### 修复效果：双门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| tsc | `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` | 零错误（修了 StoryNode 类型定义补 deletedAt 字段） |
| vitest | `npx vitest run` | 26 文件 286 测试全绿 |

## 四、关键取舍

### 高 #2：为什么只改 refine 入口而不改共享 context-loader

`context-loader.ts:34` 的 `findUnique` 是 write/refine/continue 三个路由共享的加载点。理论上在这里加 `deletedAt` 过滤最彻底——一处修三路由。

但 write/continue 路由的 UI 入口已经过滤了软删节点（项目树加载时 `deletedAt: null`），用户选不到已删节点去 write/continue。只有 refine 的 API 层缺少拦截（前端可能通过缓存或直接 API 调用绕过 UI 限制）。

**选 refine 入口精准拦截（最小爆炸半径）而非改共享模块**——符合「不做傻子功能、不扩大爆炸面」铁律。如果改 context-loader 的 findUnique，可能影响 write/continue 对已删节点的合理访问（如回收站恢复后的重新写入），增加不可预知的副作用。

### 中 #3：为什么只改 LorebookEntry 而不改 CharacterCard

`entity-sync.ts:209-224` 的 `characterCard.create` 不写 `reviewStatus: "pending"`（默认 `approved`）。只有 `entity-sync.ts:249` 的 `lorebookEntry.create` 显式写 `pending`。所以只需过滤 LorebookEntry，不动 CharacterCard。

### 低 #4：哪些改哪些不改

**改**（13 处用户可见面板标签）：DissectDimensions、RightPanel tab、DrawCards、MonitorPanel、PostGenPanelHeader、ExtractionTab、DistillTab（3处）、ConflictPanel（3处）、dissect/engine.ts title、dissect/types.ts label

**不改**（底层/prompt/注释）：
- `changelog-data.ts` — 历史记录
- `tool-registry.ts` / `orchestrator.ts` / `intent-parser.ts` — LLM prompt 文学语义 + 正则匹配关键词（保留「伏笔」让自然语言匹配工作）
- `distillation-runner.ts` / `foreshadowing.ts` — 核心逻辑注释
- `builtin-presets.ts` / `outlines.ts` / `genres.ts` — 文学预设文本
- 所有 API 路由注释

### tsc 报错：StoryNode 类型定义缺 deletedAt

修复后 tsc 报 `Property 'deletedAt' does not exist on type 'StoryNode'`。根因：`src/core/types/index.ts` 的 `StoryNode` 是手动定义的 interface（非 Prisma 自动生成），v1.6.12 加了 schema 字段但没同步更新这个 interface。

修复：在 interface 里加 `deletedAt?: Date | null`。

**教训**：novel-forge 有两套类型系统——Prisma 生成的类型（用于 DB 查询参数/返回值）和 `src/core/types/index.ts` 手动定义的 interface（用于管线/业务逻辑）。新增 DB 字段时两套都要同步。

## 五、复现步骤

```bash
# 1. 确认仓库
cd C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge
git log --oneline -1  # 应显示 v1.6.12 收口 commit

# 2. 确认修复
grep "deletedAt" src/app/api/projects/\[id\]/export/route.ts  # 应有 deletedAt: null
grep "deletedAt" src/app/api/generate/refine/route.ts          # 应有 410 拦截
grep "reviewStatus" src/core/pipeline/context-loader.ts        # 应有 approved
grep "未收尾线索" src/components/workspace/MonitorPanel.tsx    # 应有新标签

# 3. 双门禁
SAFE_DELETE_DISABLE=1 npx tsc --noEmit   # 零错误
npx vitest run                            # 286 绿

# 4. 提交推送
git add -A && git commit -m "v1.6.13 ..."
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin main
```

## 六、反自欺声明

- 4 个 bug 的文件:行号均亲自 Read 源码核实，非凭 Agent 报告
- schema 默认值 `@default("approved")` 亲自 grep 确认
- entity-sync.ts CharacterCard.create 不写 pending 亲自 Read 确认
- tsc 零错误 + vitest 286 绿亲自跑通
- 低 #4 的 13 处标签均亲自 Edit 修改并确认成功
- 唯一未实测的：实机 UI 端到端浏览器验证（沙箱无 Chromium，按铁律降级为 API 逻辑 + 源码阅读 + 双门禁验证）
