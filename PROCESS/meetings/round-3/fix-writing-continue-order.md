# Round-3 修复报告：续写（continue）路径章号（order）不递增

- 修复 Agent：魔王系统 Round-3 代码修复 Agent（独立执行）
- 修复对象：复检 NEW-3（任务编号为 NEW-1 的 order 字段问题）
- 日期：2026-08-07

## 一、问题定位

文件：`src/app/api/generate/continue/route.ts`

原代码（第 44-47 行）：

```ts
// ── 创建下一节节点 ──
const siblings = (allNodes as any[]).filter((n: any) => n.parentId === (currentNode as any).parentId);
const currentIndex = siblings.findIndex((n: any) => n.id === currentNodeId);
const nextOrder = currentIndex >= 0 ? currentIndex + 1 : siblings.length;
```

问题性质：`currentIndex` 是「当前节点在兄弟数组中的下标」（0 起），却被当成全局 `order` 字段写入新建节点。`order` 是项目内全局序列（`context-loader` 按 `order asc` 排序、`continue` 用 `n.order <= currentNode.order` 过滤前情、`isLatestChapter` 用 `order === max(order)` 判定），并非兄弟内相对位次。在嵌套/分卷结构（章的 order 非从 0 连续）下，新建节点 `order` 会等于某个已存在兄弟的 order，产生重复或倒挂，破坏章节时序与「最新章」识别。

## 二、修改内容

仅修改 `src/app/api/generate/continue/route.ts` 第 44-47 行，其余逻辑（含 `isLatestChapter` 的 max 聚合、safeFillAfterWriting 的 `source:"continue"` 透传）保持不变。未触碰 `write/route.ts` 与 `refine/route.ts`。

新代码：

```ts
// ── 创建下一节节点 ──
// R3 修复（复检 NEW-3 / 任务 NEW-1 章号不递增）：order 必须严格递增且不重复。
// 旧逻辑用「兄弟数组下标 + 1」当全局 order，在嵌套/分卷结构下会与既有节点撞号，
// 导致续写章 order 倒挂或重复，破坏「order 即序列位次」不变量与 isLatestChapter 判定。
// 改为基于数据库当前最大 order + 1：实时聚合，避免读取陈旧内存快照（并发更安全）。
const orderAgg = await prisma.storyNode.aggregate({
  where: { projectId },
  _max: { order: true },
});
const nextOrder = (orderAgg._max.order ?? 0) + 1;
```

order 递增逻辑说明：

- `nextOrder = 全局（project 级）最大 order + 1`。由于取的是数据库实时聚合的 max，无论当前节点位于哪一卷、其本地下标是多少，新建章的 order 都严格大于现有全部节点，保证**单调递增**与**全项目唯一**（无唯一约束时，该赋值逻辑本身不会产生重复值）。
- 对 `isLatestChapter` 判定的影响：下游第 248 行再次 `aggregate({ where: { projectId }, _max: { order } })` 计算，新建节点 order 即为新 max，故 `contIsLatest` 恒为 true，与预期一致（续写产生的新章即最新章），无回归。
- `previousNodes` 的 `n.order <= currentNode.order` 过滤（第 90-92 行）依赖 order 单调递增，修复后前情窗口计算正确，无回归。

并发考量：

- 现有代码无事务/行锁。本修复改为「在创建节点前即时 `aggregate` 读最新 max」，相比原来基于 `loadGenerationContext` 返回的内存快照计算，能降低（但不能完全消除）并发竞态下读到陈旧 max 的概率。
- 诚实说明：若两个续写请求在同一毫秒并发且都读到相同 max，理论上仍可能生成相同 order（因 `StoryNode.order` 无 `@unique` 约束）。该残留竞态需在数据层加唯一约束或串行化才能根除，超出本次「只改 continue、最小改动」范围，已在诚实声明中标注。

## 三、验证结果

- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`：退出码 0，零类型错误（已实跑）。
- continue / write 相关单元测试：全代码库 Grep `*.test.ts` 中与 continue / write / generate 相关的测试文件为 0（确认无相关测试可跑）。因此采用静态闭环推演验证：
  - 类型层面：移除的 `siblings` / `currentIndex` 变量已无其余引用（Grep 确认无残留），`currentNodeId` 仍被 `loadGenerationContext` 使用，未造成未定义引用。
  - 逻辑层面：`nextOrder` 取值来源由「兄弟下标」改为「DB 实时 max + 1」，严格递增且唯一；下游 `isLatestChapter` 与 `previousNodes` 计算不受影响。
  - 未改动 write 路径：write 路由本就不创建新节点（它写入的是传入的已存在 `nodeId`），order 由其他流程管理，本次修改对 write 零影响。

## 四、诚实声明

1. 已实跑验证：`tsc --noEmit` 零错误（强证据）；Grep 确认无 `siblings`/`currentIndex` 残留引用（强证据）。
2. 静态推演已覆盖：`order` 严格递增、不重复，`isLatestChapter` 与 `previousNodes` 计算无回归，write 路径不受影响。
3. 未经实测、待验证：
   - 真实多章续写（连续点多次「一键续写」）的端到端顺序效果未实跑 dev server / 真实数据库确认，属**未经实测，待验证**。逻辑推演表明每次都会取实时 max + 1，应严格递增，但需真实项目数据固化。
   - 高并发续写的 order 唯一性残留竞态（见上文「并发考量」）未根除，需数据层唯一约束或串行化才能彻底消除，本次未做。
4. 本修复只解决 `order` 字段（任务 NEW-1 的 order 维度）。复检报告中同属续写章号问题的「标题不递增」（原 NEW-1，正则 `^(.+?)(\d+)$` 对「第N章：xxx」标题失效）不在本任务 scope 内，未改动；如需修复应另立项处理。
