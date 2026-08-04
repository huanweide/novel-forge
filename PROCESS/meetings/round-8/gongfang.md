# Round 8 L1 只读诊断 — 工坊（工程/集成透镜）

> 日期：2026-08-04 ｜ 股东：工坊 ｜ 范围：import/route.ts、regex.ts、regex.test.ts
> 依据：CHANGELOG v0.46.70 + round-7/_integration.md（工坊 P1 三条：forkPoint 重映射、regex 重叠交替、事务 timeout 60s；Round6 事务回滚+幂等去重）

---

## 一、Round 7 修复复验（本透镜）

### 1. forkPoint 重映射（P1-①）— ✅ 生效，但有边角缺口
- 设计：`branchForkMap` 在分支创建前先缓存旧 `forkPointNodeId`（route.ts:90），待 `nodeMap` 建立后于 3.5 段回填重映射（route.ts:119-129）。
- 复验：`(旧节点id → 新节点id)` 映射表确实恢复分叉拓扑，全量导入场景正确。

### 2. regex 重叠交替扩展（P1-②）— ✅ 覆盖已声明用例，但存在 `?` 盲区
- 设计：`isLikelyUnsafeRegex` 在 `)` 后紧跟 `* + {` 时，若组内 `hasAlternation` 则拦截（regex.ts:76-78）。
- 复验：测试 `(a|aa)+$`、`(a|b)+`、`(x|y)+$`、`(a|[a-z])+$` 均被拒（regex.test.ts:18-32）。✅

### 3. 交互事务 timeout 60s（P1-③）— ✅ 生效
- route.ts:187 `{ timeout: 60000 }` 显式覆盖默认 5s，大备份不再因默认超时被整段回滚。

### 4. Round 6 修复复验 — ✅ 仍生效
- 事务回滚：`$transaction` 包裹全段（route.ts:67），catch 返回 500 且自动 rollback（route.ts:190-196），无孤儿。✅
- 幂等去重：`{projectId, source}` 查重返回已存在项目（route.ts:50-63）。主体逻辑保留。✅
- ReDoS 守卫：`applyRegexRules` 应用前调 `isLikelyUnsafeRegex`（regex.ts:126）。✅

---

## 二、新坑（P0 / P1 / P2）

### P1（明显缺陷，建议回填）

#### P1-① regex.ts:69,82-84 — `?` 可选量词被排除，漏检 `(a?)+` 类 ReDoS
- 现象：`hasQuantInside` 仅在遇到 `*`/`+`/`{` 时置位，`?` 被注释“风险低”排除（line 69）。导致经典灾难性回溯 `(a?)+`、`(a?)*`、`((a?))+` 在 `)` 后紧跟重复量词时因 `hasQuantInside=false && hasAlternation=false` 而返回 `null`，**未被拦截**。
- 严重度：P1（真实 ReDoS 绕过；V8 下 `(a?)+` 匹配 "a"*n+"!" 为指数级）。
- 建议方向：将 `?` 也纳入“组内含量词”判定（或在 `)` 后重复时，凡组内存在任何量词即视为嵌套风险）；补充 `(a?)+`、`(a?)*` 单测，并用 `safe-regex` 类库做对照。

#### P1-② import/route.ts:103,110 — 部分导入时 parentId/branchId 未剥离致外键悬空
- 现象：storyNodes 的 `strip` 列表（route.ts:103）仅去 `id/projectId/createdAt/updatedAt`，**未去 parentId/branchId**。pass2 仅在 `nodeMap[n.parentId]`/`branchMap[n.branchId]` 存在时才回填（route.ts:109-110）。当用户用 `include` 排除 branches 或仅部分章节时，旧 branchId/parentId 被原样写入新项目（projectId=pid 但引用旧 id），SQLite 开启 FK 时 create 抛错→整事务回滚导入失败；关闭时留悬空引用。
- 严重度：P1（部分导入功能 v0.46.58 引入的真实数据完整性故障）。
- 建议方向：`strip` 增加 `parentId,branchId` 或“未映射即置 null”；pass2 对缺失映射的目标显式 `upd.parentId=null`。

#### P1-③ import/route.ts:119-129 — forkPoint 重映射依赖 nodeMap，branches 单独导入时失效
- 现象：3.5 段回填以 `nodeMap[oldFork]` 存在为前提（route.ts:122）。若用户 `include` 含 branches 但不含 chapters，则 `nodeMap` 为空，forkPointNodeId 永不重映射 → 新分支指向旧节点 id（悬空）。
- 严重度：P1（Round7 forkPoint 修复的边角回归）。
- 建议方向：forkPoint 重映射与章节导入解耦——无章节时至少将 forkPointNodeId 置 null 并告警，而非静默保留旧 id。

#### P1-④ import/route.ts:50-63 — 幂等查重在事务外，存在并发重复导入竞态（TOCTOU）
- 现象：`findFirst` 去重在 `$transaction` 之前（route.ts:50-63），buildConfig 内 `importSource` 无 DB 唯一约束。两个相同备份的并发 POST 均可越过查重、各建一份 → 重复项目。
- 严重度：P1（概率低但正确性缺陷；Round6“幂等去重”仅靠串行读判断）。
- 建议方向：在 `importSource` 上加应用层唯一锁（如 `select ... for update` 或先占位行），或导入前对 `{origId,source}` 原子 upsert。

### P2（排期，本轮不强制）

#### P2-① import/route.ts:187 vs :6 — 事务 timeout(60s) 与 maxDuration(300s) 不匹配
- 现象：函数上限 300s，但交互事务 60s 即回滚。超大备份（需 60–300s）会在 60s 处整段回滚，仍无法导入。
- 严重度：P2（调优）。
- 建议方向：按备份规模分级 timeout，或改用批处理非交互事务；前端对超时失败提示“分块/增量导入”。

#### P2-② regex.ts:118-148 — 仅静态启发式，无执行期超时兜底
- 现象：`applyRegexRules` 直接 `result.replace(re,...)`，一旦启发式漏检（如 P1-①），恶意/畸形正则仍可在请求热路径挂死。
- 严重度：P2（纵深防御）。
- 建议方向：正则执行加时间预算（Web Worker / 子进程 + 超时终止），或引入 `safe-regex`/`recheck` 做二次校验。

#### P2-③ regex.test.ts — 缺 `(a?)+` 反向用例与“大输入执行不挂死”性能测试
- 现象：现有用例仅覆盖声明的重叠交替，未覆盖 `?` 盲区与执行耗时。
- 严重度：P2。
- 建议方向：补 `(a?)+`/`(a?)*` 拦截用例 + 对已知 ReDoS 模式跑“超时即失败”的性能断言。

---

## 三、复验小结
- Round 7 三条工程修复（forkPoint 重映射、regex 重叠交替、事务 60s 超时）**主体生效**；Round 6（事务回滚+幂等去重+ReDoS 守卫）**无回退**。
- 仍需回填：regex `?` 盲区（P1-①）、部分导入外键悬空（P1-②/③）、幂等并发竞态（P1-④）。
