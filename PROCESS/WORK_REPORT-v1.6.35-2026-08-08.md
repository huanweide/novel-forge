# v1.6.35 工作单元报告（全仓 as any 诚实分级审计 + 推翻自身预估）

> 费曼式教学沉淀。读者对象：零基础大学生。目标——让你看懂「为什么有些 `as any` 不能删」，以及「trust-but-verify 如何推翻自己的判断」。

## 一、干了什么（一句话结论）

v1.6.35 没改一行业务代码，而是做了一件「诊断」的事：把全仓 432 处 `as any` 按风险**诚实分级**，并亲手实测推翻了我在 v1.6.34 时一个错误预估——我以为 continue 路由的 `nextNode as any` 和 write/refine 路由一样「可以安全删掉」，结果 tsc 报错证明它**根本不能删**。这份诚实，比多删几行代码值钱。

质量门禁仍全绿：**tsc 0 错误 + vitest 32 文件 311/311 全绿**（本版无代码行为变更，continue 路由已还原到 v1.6.34 状态确保类型门不破）。

## 二、为什么这么做（拆到底层原理）

### 2.1 `as any` 是什么

**大白话类比**：TypeScript（TS）像一个严格的语法老师，会检查你每个变量是不是用对了类型。`as any` 等于你举手说「老师，这个变量我兜底，您别查了」。短期省事，长期埋雷——变量真用错了 TS 也不报警。

代码里散布几百处 `as any`，像个烂摊子。直觉是「全删了就干净了」。但——**有些 `as any` 是老师和学生之间的「必要翻译」**，删了反而 TS 报错。

### 2.2 为什么不能盲删（三类真实鸿沟）

我亲手实测 + 亲读代码，发现绝大多数 `as any` 在桥接三种「天然类型不一致」：

1. **Json 列鸿沟（B 类）**：数据库里有些字段存的是「任意 JSON」（Prisma 叫 `Json` 列，类型 `JsonValue`），但代码里想当「确定的结构体数组」用（比如 `ReviewLog[]`）。这两者 TS 认为不兼容，必须用 `as any` 翻译。强删触发 `TS2352`。
2. **Prisma 字段类型鸿沟（C 类，本次核心发现）**：数据库的 `type` 字段是「任意字符串」（`string`），但应用层规定它只能是几个固定值之一（联合类型 `StoryNodeType`，如 `"section"|"chapter"`）。`string` 不能直接当 `StoryNodeType` 用，必须 `as any` 翻译。
3. **上游参数 any 逼出（D 类）**：某个函数的参数本身就声明成 `any`（因为上游数据没定型），调用方被迫 `as any` 投喂。

只有「变量已经是确定类型、却还蒙老师眼」的那种（E 类）才该删。而 E 类极少。

## 三、方法 / 工具与效果（对比过什么、结果数据）

### 3.1 量化 + 分级

**工具**：Bash `grep -rn "as any" src`（仓库铁律：Grep 工具在绝对路径下会假阴性，必须用 Bash grep 亲核）。

**数据**：排除测试文件后全仓 432 处。按文件 TOP：changelog-data.ts 32、post-processor 26、continue 路由 21、characters/expand 20……

**分级**（详见 `PROCESS/as-any-audit-v1.6.35.md`）：
- **A 类 文案假阳性（32 处）**：这 32 处是更新日志**字符串里写「as any」当描述文字**（比如「data.currentNode as any 纯胶带——」），根本不是代码断言。grep 误计，零风险。
- **B 类 Json 列桥接**：reviewLogs / gameState / activeCharacters 等，必需保留。
- **C 类 Prisma 字段鸿沟**：continue 路由 nextNode（本次实证）。
- **D 类 上游参数 any**：buildGenerationContext 的 data 字段。

### 3.2 推翻自身预估（trust-but-verify 的实证）

v1.6.34 时我写：「continue 路由 currentNode 透传与 write/refine 同源可消除」。v1.6.35 我亲自动手把 continue 路由的两处 `currentNode: nextNode as any` 改成 `currentNode: nextNode`，**跑 tsc**——报错：

```
error TS2322: Type 'string' is not assignable to type 'StoryNodeType'
```

翻译：nextNode 的 type 是「任意字符串」，但目标位置只要「固定几个值之一」，TS 不让过。**真相**：continue 路由的 `nextNode` 来自 `prisma.storyNode.create`（数据库原生返回，type 是 string）；而 write/refine 路由的 `data.currentNode` 来源已是定型好的 `StoryNodeType`。二者同源不同命——我的「同源可消除」是估算式假阳性。

**诚实处理**：立刻 `git checkout` 把 continue 路由还原（恢复 `nextNode as any`），绝不提交会破坏类型门的代码；并在 changelog 明确标注「v1.6.34 的同源措辞仅对 write/refine/pre-processor 成立，对 continue 不成立，特此纠正」。

## 四、关键取舍（工具 A 为何不选 B、踩坑与修复）

| 决策点 | 选了什么 | 没选什么 | 理由 |
|--------|----------|----------|------|
| 是否盲删 432 处 as any | 不删，先做分级审计 | 逐处撕胶带 | 实测证明盲删触发 TS2322 / 误删 Json 桥接，收益低（运行时零变化）风险高（破坏构建） |
| continue 改动 | 实测报错后立刻还原 | 强行提交或硬转 as unknown | 类型门是铁律，绝不提交破坏构建的代码；诚实保留必需桥接 |
| 后续路线 | 源头桥接集中化（toAppStoryNode + Json 列收窄） | 继续逐处 as any | 在数据库返回处一次性翻译类型，下游不再散落 as any，治本 |

**踩坑现场**：v1.6.34 的「同源可消除」预估——我基于 write/refine 的成功推断 continue 也行，但没实测 continue 的 nextNode 来源。v1.6.35 用 tsc 实测推翻了自己，这正是「trust-but-verify 不轻信估算式结论」的活教材。

## 五、可复现步骤（照做就能重来）

```bash
cd /c/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge

# 1. 量化全仓 as any（排除测试）
grep -rn "as any" src --include="*.ts" --include="*.tsx" | grep -v "\.test\." | wc -l

# 2. 试删 continue 的 nextNode as any，验证是否真可去
#    把 continue/route.ts 的 currentNode: nextNode as any 改为 currentNode: nextNode
SAFE_DELETE_DISABLE=1 npx tsc --noEmit   # 预期报 TS2322 —— 证明不可删

# 3. 还原破坏性改动（绝不提交破坏构建的代码）
git checkout -- src/app/api/generate/continue/route.ts

# 4. 门禁确认零回归
SAFE_DELETE_DISABLE=1 npx tsc --noEmit && npx vitest run

# 5. 产出审计文档 + 升版日志后提交推送
```

**反自欺闸门**：本文档写的每一条都是亲测——continue nextNode 不可去是 tsc 实测（去掉即 TS2322）；32 处假阳性是亲读 changelog-data.ts 文案确认；432 处总量是 Bash grep 实跑。未对 432 处逐个体跑 tsc 的，审计文档已明确标注「待实证」，不伪装已验证。推翻自身预估这件事，本身就是「不自我欺骗」的实证。
