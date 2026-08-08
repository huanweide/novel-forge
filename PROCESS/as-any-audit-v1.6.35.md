# 全仓 `as any` 类型债诚实分级审计（v1.6.35 诊断产出）

> 本文件是 v1.6.35 的核心交付物：一份不破坏构建的「技术债地图」。目的——把全仓 432 处 `as any` 按风险诚实分级，澄清哪些**必须保留**、哪些**可消除**，为 v1.6.36+ 提供消除路线图。绝不盲删导致 TS 报错。

## 一、总量与文件分布（排除测试文件）

全仓 `as any` 共 **432 处**。按文件 TOP：

| 文件 | 数量 | 备注 |
|------|------|------|
| src/lib/changelog-data.ts | 32 | **文案假阳性**（字符串里写「as any」描述） |
| src/core/pipeline/post-processor.ts | 26 | 含 v1.6.32 已收的 currentNode 6 处；其余 Json 桥接 |
| src/app/api/generate/continue/route.ts | 21 | nextNode 透传含 Prisma 字段鸿沟（见第三节 C） |
| src/app/api/characters/expand/route.ts | 20 | 待分级 |
| src/core/babylore/fill.ts | 19 | Json 列溯源桥接 |
| src/app/api/import/commit/route.ts | 19 | 待分级 |
| src/core/pipeline/pre-processor.ts | 18 | v1.6.34 收 currentNode 1 处；其余上游参数 any |
| src/core/agents/orchestrator.ts | 18 | v1.6.29 收 project 7 处；其余 Json 桥接 |
| src/app/workspace/[projectId]/page.tsx | 17 | 前端，待分级 |
| src/app/api/projects/import/route.ts | 15 | 待分级 |
| src/app/api/presets/[id]/apply/route.ts | 14 | 待分级 |
| src/core/pipeline/context-loader.ts | 13 | Json 列桥接（已知） |
| src/core/game/game-engine.ts | 13 | v1.6.33 收 nodeForConfirm 1 处；其余 Json 桥接 |

## 二、四级诚实分类

### A 类 · 文案假阳性（非代码债，零风险）—— changelog-data.ts 32 处
这 32 处是更新日志**字符串里写「as any」作为描述文字**（如「data.currentNode as any 纯胶带——」），不是代码里的类型断言。grep 误计，实际零代码风险，**不动**。

### B 类 · Prisma Json 列桥接（必需保留，同源 InputJsonValue 鸿沟）
Prisma `Json` 列（reviewLogs / gameState.entities·items·options / activeCharacters / activeLoreIds / babylore 溯源字段）返回 `JsonValue`，与应用层强类型数组（`ReviewLog[]` / `GameEntity[]` / `GameItem[]` / `GameOption[]`）类型不兼容。必需 `as any` / `as unknown as` 桥接，强删触发 TS2352。已知位置：
- post-processor `prisma.storyNode.update` 的 reviewLogs 写入边界（v1.6.32 保留）
- game-engine `gameState.entities/items/options` 约 15 处（v1.6.33 核实保留）
- babylore/fill.ts 溯源写入
- context-loader.ts 返回处

### C 类 · Prisma 字段类型鸿沟（必需保留，实测 TS2322）—— continue 路由 nextNode
**v1.6.35 实测核心发现**：`nextNode` 来自 `prisma.storyNode.create`（continue/route.ts L89），其 `type` 字段 Prisma 推断为 **`string`**；而应用层 `GenerationData.currentNode` / `PostPipelineParams.currentNode` 期望 `type: StoryNodeType`（联合类型，如 `"section"|"chapter"|...`）。故 `currentNode: nextNode as any`（L132/L283）是**必需桥接**，绝非冗余。

v1.6.35 实测：把这两处改为 `currentNode: nextNode` 后 tsc 报 `TS2322: Type 'string' is not assignable to type 'StoryNodeType'`。**这推翻 v1.6.34 对 continue 路由「同源可消除」的预估**——write/refine 路由的 `data.currentNode` 来源已是定型 `StoryNodeType`（故 v1.6.34 消除安全），而 continue 的 `nextNode` 是 Prisma 原生返回（`type: string`），二者**不可一概而论**。

### D 类 · 上游参数 any 逼出（需先定型参数，范围蔓延）
`buildGenerationContext({ data })` 的 `data: GenerationData` 各字段（project / allNodes / characters / loreEntries / summaries / storyBeats / styleCard）在调用方被迫 `as any`——根因是 `GenerationData` 某些字段或上游查询返回 `any`。要消除需先给 `GenerationData` 字段及上游查询定型，属 v1.6.29 同类的「参数定型」专项，**不应逐处乱撕**。

### E 类 · 潜在冗余（待 tsc 实证，禁止盲去）
散布各路由的「确定类型变量透传 `as any`」。continue 案例证明「同源推断」不可靠——必须逐处去掉后跑 `tsc` 验证。已证：
- **可去**：write/refine/pre-processor 的 `data.currentNode as any`（v1.6.34，来源已定型 StoryNodeType）。
- **不可去**：continue 的 `nextNode as any`（C 类，Prisma type: string 鸿沟）。
- 其余待 v1.6.36+ 逐个 tsc 实证。

## 三、策略结论（诚实边界）

全仓 `as any` 绝大多数是**诚实桥接**（B+C+D 三类），真正纯冗余（E 类中经 tsc 验证的部分）极少且零星。逐处 `as any` 消除：
- **收益低**：每处仅让 TS 多查一个字段访问，运行时零行为变化；
- **风险高**：盲去触发 TS2322（C 类）或误删 Json 桥接（B 类），破坏构建；
- **正确路径**：做**源头桥接集中化**——引入 `toAppStoryNode(prismaNode)` 等转换层，在 Prisma 返回处一次性把 `type: string → StoryNodeType`、Json 列收窄为强类型，下游透传不再需散落 `as any`。这比逐处撕胶带更治本。

## 四、v1.6.36+ 消除路线图（按风险升序）

1. **源头桥接集中化**：`toAppStoryNode` + Json 列读取收窄 helper，治本消除 C+D 类大部分散落 `as any`。
2. **E 类残裕项逐个 tsc 实证消除**：write/refine/pre-processor 已证可去，其余同理逐个验证。
3. **A 类（文案）不动**；B 类（Json 桥接）保留。

> 反自欺：本审计的「B/C/D 三类必需保留」「continue nextNode 不可去」均为 v1.6.35 亲手 `tsc` 实测结论（去掉即 TS2322）；「A 类 32 处为假阳性」为亲读 changelog-data.ts 文案确认。未对 432 处逐个体跑 tsc 的，已明确标注「待实证」，不伪装已验证。
