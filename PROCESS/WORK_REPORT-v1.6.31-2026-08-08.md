# 工作单元报告 · v1.6.31 StoryNode 类型收口

> 费曼式沉淀。读者默认零基础大一新生。能讲给新生听＝真懂，否则作者自己没懂。

## 一、干了什么（一句话）

把小说平台里「读取章节节点时图省事用 `as any` 绕开类型检查」的写法，换成老老实实的类型——但只换那些「数据源本来就是完整章节对象」的地方；对「故意只取部分字段的轻量节点」引入一个诚实的 `StoryNodeLight` 类型，而不是假装它是完整节点。

## 二、为什么这么做（第一性原理，不堆术语）

**先讲两个黑话：**
- **`as any`（类型绕过）**＝比喻：你让搬家公司搬箱子，却跟他们说「别看标签了，随便搬」。短期省事，但哪箱是易碎品、哪箱装了啥你全丢了——后面想用「这箱的内容」时，编译器（保镖）不会拦你，运行时才可能炸。
- **轻量节点 vs 完整节点**＝比喻：图书馆有两套卡片——「目录卡」只写书名+架号（轻量，用来找书快），「详情卡」写了全书摘要+借阅记录（完整，用来细读）。你要是拿「目录卡」却假装它有「全书摘要」，就是自己骗自己。

**为什么要做：** 项目铁律厌恶 `as any`（v1.6.27/29 已清掉一大批 project 维度的）。残留的 `(currentNode as any).title` 这类写法，明明 `currentNode` 在路由层已经确认「不是空」且是完整章节对象，却还绕过类型——纯惰性，删掉更干净、后续维护不易误读。

**为什么不能一刀切全删（关键洞察）：** 我用 Bash grep 穷举发现两类 `as any`：
1. **惰性绕过（该删）**：`continue`/`write` 路由里 `currentNode` 来自 `GenerationData`（已经是 `StoryNode` 完整类型），只是作者没意识到，多写了 `as any`。
2. **诚实桥接（该留）**：`context-loader` 里 `allNodesLight` 是用 SQL `select` 只取了「结构字段」（id/父类/类型/标题/排序…），**故意不含正文 content**——为省内存（长书能省 10~20MB）。这种节点如果强转成 `StoryNode`（声称有 content），就是「假类型信心」：代码以为能读正文，其实没有，比 `as any` 更危险。所以这里不该删 `as any` 硬转，而该**新建一个只含这些字段的 `StoryNodeLight` 类型**，诚实描述它「就是个目录卡」。
3. **更深的桥接（必须留）**：`context-loader` 返回 `currentNode` 时，`prisma.storyNode.findUnique` 查出来的 `reviewLogs` 字段是数据库 JSON 类型（Prisma 的 `JsonValue`），而我们手写的 `StoryNode` 接口说它是 `ReviewLog[]` 数组——两边对不上（`as StoryNode` 会直接报 TS2352 不兼容）。这是「数据库原始 JSON ↔ 手写强类型数组」的鸿沟，跟 v1.6.27/29 的 `as unknown as Record` 同源，必须用 `as any` 桥接，删不掉也别硬删。

**所以本版的真价值：** 分清「哪些是懒、哪些是真有道理」，只删懒的，给轻量的建诚实类型，给 Json 鸿沟留必需桥接——而不是一刀切假装类型很完美。

## 三、用了什么方法、效果如何（对比 + 数据）

**具体动手（可复现）：**
1. `src/core/types/index.ts` 新增 `StoryNodeLight` interface（8 个字段，严格对齐 select 子集，不含 content），紧挨 `StoryNode` 定义。
2. `src/core/pipeline/context-loader.ts`：
   - `import type { Project, StoryNodeLight }`；
   - `const allLight = allNodesLight as StoryNodeLight[]`（替代 `as any[]`）；
   - 节点字段 `(n as any).parentId` → `n.parentId`、`.order` → `n.order`、`Map<string,any>` → `Map<string,StoryNodeLight>`；
   - `currentOrder` 改 `currentNode?.order ?? 0`（currentNode 可能是空，可选链诚实兜底）。
3. `src/app/api/generate/continue/route.ts`：`(currentNode as any)` 全部 → `currentNode`（路由 L46 已 `if(!currentNode) return` 守卫，之后编译器知道它不是空）；`(nextNode as any)` → `nextNode`（nextNode 是数据库新建返回的全字段对象）。
4. `src/app/api/generate/write/route.ts`：`(data.currentNode as any)` → `data.currentNode`（L51 守卫后）；`(n:any)` 回调 → `(n:StoryNode)`，补 `import type { StoryNode }`；顺带移除 `previousNodes as any` 透传。
5. `src/core/pipeline/pre-processor.ts`：`(data.currentNode as any).order` → `data.currentNode?.order ?? 0`。

**效果数据：**
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 零错误。
- `npx vitest run` **309/309 全绿**（31 文件，无新增测试——纯类型层改动，靠双门禁 + 源码逐处核实）。
- 运行时零行为变化。

## 四、关键取舍与踩坑（反自欺）

**踩坑（实测真踩，非猜）：** 我最初想把 `context-loader` 返回处的 `currentNode as any` 也改成 `currentNode as StoryNode`（更精确）。tsc 直接报 **TS2352**：`reviewLogs` 的 `JsonValue` 与 `ReviewLog[]` 不兼容，无法转换。这反而证实——原 `as any` 不是懒，是 Json↔强类型鸿沟的**必需桥接**。当场改回 `as any` 并在代码注释 + changelog 标注「诚实桥接」，不假装修掉。

**取舍（诚实边界）：**
- `allNodes`（line 216）是「补了正文的完整节点 + 轻量节点」混合数组，本就 `(any[])` 合理，没强行定型——定型反而掩盖混合本质。
- `post-processor` 的 `(currentNode as any)`、`game-engine` 的 `(nodeForConfirm as any)`：它们的数据源参数没显式定型（`session: any`），要去 `as any` 得先给参数定型，属范围蔓延 + 回归风险，本轮**如实留后续**，不凑版本。
- sync-global-prompt 全仓覆盖率经 v1.6.21/26 两轮穷举已完整，再扫属边际收益，不空耗一个版本。

**为什么不用 Grep 工具：** 本仓库 Grep/Glob 在绝对路径 + glob 下会假阴性（前序已写入铁律），全仓漏口核对一律走 `Bash grep`，避免漏判。

## 五、给后来者的复制步骤
1. 想验证类型：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit`（零错误即过）。
2. 遇到 `as any` 先问自己三句：①数据源是不是已经是我声称的类型？②是不是故意的子集（轻量节点）？③是不是 Json↔强类型鸿沟？——只对「①是且②否且③否」的惰性绕过下手。
3. 轻量节点就建 `StoryNodeLight` 这类诚实子集类型，别硬转完整类型制造假信心。
