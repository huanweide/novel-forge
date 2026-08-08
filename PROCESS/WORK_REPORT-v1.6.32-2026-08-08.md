# 工作单元报告：v1.6.32 —— post-processor 的 `(currentNode as any)` 收口

> 费曼式沉淀。读者默认零基础，每个黑话先讲「它怎么运作」再配类比。

## 一、干了什么（一句话）

把生成后处理单点文件 `src/core/pipeline/post-processor.ts` 里 **6 处 `(currentNode as any)` 绕过类型系统的写法**全部消除，让 TypeScript 能真正替我们检查这些字段访问；只在「把审校日志写进数据库」这一处**保留 `as any` 桥接**并写清理由。运行时零行为变化，纯类型层收口。

## 二、为什么这么做（底层原理，第一性原理）

### 黑话 1：`as any` 是什么，为什么是坏味道
TypeScript 是「给 JavaScript 加一套类型说明书」的工具。它的价值是：你写 `obj.foo`，如果 `foo` 不存在，它立刻报错，逼你在写错时当场发现。
`as any` 相当于对编译器说「这一句你别管了，我相信它一定是对的」——**等于亲手拆掉了这处的安全气囊**。字段名改了它不报错、字段类型错了它不报错，是典型的「静默坏味道」。
类比：`as any` 像你在电路上贴了张「此处勿检」的胶带，平时没事，一旦真接错线，电闸不会跳，直接烧设备。

### 黑话 2：为什么 currentNode 之前要 `as any`
本项目连续几个版本（v1.6.27/29/31）在做「类型债总清」：`currentNode` 是从数据库取出的章节节点，本应是明确类型 `StoryNode`。但历史上 `post-processor` 的函数参数 `currentNode` 没显式定型（或定型为 any），所以代码里每个访问 `currentNode.reviewLogs` / `.content` 的地方都得先 `(currentNode as any)` 才能通过编译。
v1.6.31 已经把来源参数 `PostPipelineParams.currentNode` 明确定型为 `StoryNode`（且非 null），**所以这些 `as any` 立刻变成了纯冗余**——编译器本来就能确认类型，是历史遗留的胶带没撕。

### 黑话 3：Json 列鸿沟（为什么有一处必须保留 as any）
数据库里 `reviewLogs` 这个字段在 Prisma 里被定义为 `Json` 类型（存任意 JSON）。Prisma 要求写入 `Json` 列的数据必须满足 `InputJsonValue`（一种「能被序列化成 JSON 的值」的严格类型）。而我们代码里手写的 `StoryNode.reviewLogs` 是 `ReviewLog[]`（一个具体的 TS 接口数组），它**没有字符串索引签名**，不满足 Prisma 的 `InputJsonValue`。
结果：直接把 `reviewLogs` 数组塞进 `prisma.storyNode.update({ data: { reviewLogs } })` 会触发 `TS2322` 类型不兼容错误。
类比：邮局规定「寄的东西必须装进标准纸箱（InputJsonValue）」，你拿了个「定制铁盒（ReviewLog[]）」去寄，尺寸对不上。解决办法是在交接那一瞬间把铁盒「伪装」成标准纸箱（`as any`），因为最终邮局的卡车其实什么都能运——这只是类型系统的规矩，不是运行时的真问题。
这就是为什么**只在「写入数据库这一处」保留 `as any`，读取那一堆标量字段（content/wordCount/revisionCount/order/title）一律不加**——读取时 TS 能确认类型，加了反而拆掉安全气囊。

## 三、用了什么方法、效果如何

### 循环（诊断→修复→验证→交付）
1. **检测**：git diff 亲核当前 `post-processor.ts` 改动，确认 6 处 `(currentNode as any)` 实际分布（prevContent/prevWordCount/existingReviewLogs/revisionCount/auto-confirm 的 order/章节命名 curTitle）。
2. **修复**：把 6 处降级为 `currentNode?.字段`（可选链，因为 currentNode 可能理论上为 null，但类型已定 StoryNode 非 null，?. 是防御性保留）。仅在 `prisma.storyNode.update` 的 `reviewLogs` 处加 `as any` 桥接 + 注释标明 Json 列不兼容。
3. **验证（双门禁）**：
   - `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → **0 错误**（确认类型收口无引入新错，reviewLogs 桥接处通过）。
   - `npx vitest run` → **31 文件 309/309 全绿**（无新增测试，靠双门禁 + 源码逐处核实）。
4. **交付**：升双 changelog（changelog-data.ts 三处：LATEST_VERSION / CHANGELOG_BRIEF / VERSIONS 插条 + CHANGELOG.md 头条），跑门禁复验，commit + 代理推送。

### 诚实边界（反自欺）
- **grep 实锤残留**：交付前用 `grep '(currentNode as any)'` 确认 6 处全部归零（输出「无残留 ✓」），而非凭记忆说「改完了」。
- **其余 as any 不在范围**：post-processor 里仍残留约 20 处 `as any`（如 `activeCharacters as any`、`statusHistory as any[]`、`classifyAndConvert(... as any)`），这些是 orchestrator 返回值、第三方函数入参、Json 历史字段，**与 currentNode 类型收口无关**，如实标注未动，不自欺说「全清了」。
- **运行时零变化**：as any 原来有就能读到字段，去掉也不影响行为，纯类型层价值（防止未来误改字段名静默通过）。

## 四、关键取舍

| 决策点 | 选项 | 选择 | 理由 |
|---|---|---|---|
| reviewLogs 写入处 | 保留 as any / 强行重构 ReviewLog 满足 InputJsonValue | **保留 as any** | 重构 ReviewLog 接口加字符串索引签名会污染业务类型，成本远大于收益；桥接仅在写入边界，已注释标明根因 |
| 6 处标量读取 | 逐个加 as any / 降级为 currentNode?.字段 | **降级强类型** | 来源参数已定 StoryNode，as any 纯冗余，去掉让 TS 真正检查 |
| 是否顺手清 game-engine 的 (nodeForConfirm as any) | 一并清 / 留后续 | **留后续** | 该处源参数 `session: any` 未定型，去 as any 需先定型参数，属范围蔓延 + 风险，违反「砍伪工作」原则 |

## 五、收口意义（与历史版本呼应）
novel-forge 的 currentNode 类型债是一条完整链路：
- **编排侧**（v1.6.27/29）：Project 类型补字段，消 `(project as any)`。
- **读取侧**（v1.6.31）：context-loader 引入 `StoryNodeLight`，消读取端 `(currentNode as any)`（返回处因 Json 列保留桥接）。
- **写入侧**（v1.6.32 本轮）：post-processor 消写入端 `(currentNode as any)`（reviewLogs 写入处因 Json 列保留桥接）。

三端收口，仅在「Json 列 ↔ 强类型数组」这一物理鸿沟处诚实保留桥接——这是 Prisma Json 类型的客观限制，不是代码偷懒。

## 六、复现命令（照做即可验证）
```bash
cd /c/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge
# 1. 确认 6 处 as any 已清零
grep -n '(currentNode as any)' src/core/pipeline/post-processor.ts   # 应无输出
# 2. 双门禁
SAFE_DELETE_DISABLE=1 npx tsc --noEmit      # 应 EXIT 0
npx vitest run                               # 应 309 passed
```
