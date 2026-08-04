# Round 7 L1 只读诊断 · 工坊（工程/集成透镜）

> 透镜：工程/集成（import 事务幂等、正则 ReDoS 防护）
> 复验对象：CHANGELOG v0.46.69 + PROCESS/meetings/round-6/_integration.md
> 审查文件：`src/app/api/projects/import/route.ts`、`src/core/post-process/regex.ts`、`src/core/post-process/regex.test.ts`
> 日期：2026-08-04 ｜ 全程只读，未改任何源码/CHANGELOG/MEMORY。

---

## 一、Round 6 复验结论（本透镜）

| 修复项 | 位置 | 复验结果 | 说明 |
|---|---|---|---|
| import 整段 `$transaction` 失败回滚 | route.ts:66-169 | ✅ 真实生效 | 所有 create 包裹在回调事务内，任一抛错 Prisma 自动 rollback，`catch` 返回 500，无孤儿/半吊子记录 |
| projectId+source 幂等去重 | route.ts:50-63 | ✅ 真实生效（有条件） | 带 `origId` 的备份二次导入返回 `idempotent:true`，不再成倍复制 |
| isLikelyUnsafeRegex 防 ReDoS | regex.ts:24-104 | ⚠️ 部分生效 | 嵌套量词 `(a+)+`、`(x*)*`、超大 `{n}`、超长 pattern、非法 flags 均拦截；但**漏检重叠交替类**（见 P1） |

结论：两项核心修复均真实落地、无功能回退；ReDoS 防护存在已知盲区。

---

## 二、新坑（P0 / P1 / P2 分组）

### P0
无。本轮未发现本透镜内会导致数据错乱或安全崩溃的 P0。

### P1

#### P1-1 分支 `forkPointNodeId` 未重映射且无法重映射 → 导入后分叉点丢失
- **文件:行号**：`src/app/api/projects/import/route.ts:88`（strip 丢弃 `forkPointNodeId`）；结构性根因在 `:85-92`（分支在节点之前创建，此时 `nodeMap` 仍为空）
- **现象**：`strip(b, [... "forkPointNodeId"])` 直接删除分支的分叉节点引用，且分支创建块位于 storyNodes pass1（`:96-102`）之前，`nodeMap` 尚未建立，即便想重映射也无从取值。导入后 `storyBranch.forkPointNodeId` 永远为空，章节树分叉关系断裂。
- **严重度**：P1（数据结构性丢失，项目能导入但剧情分支拓扑损坏）
- **建议方向**：将分支创建移到节点 pass2 之后，增加 `forkPointNodeId` 回填 pass（仿照 `:103-110` 节点 parentId 回填），`upd.forkPointNodeId = nodeMap[b.forkPointNodeId]`；单测覆盖「带分叉的分支导入后 forkPointNodeId 正确」。

#### P1-2 ReDoS 防护漏检「重叠交替 + 重复组」类灾难性回溯
- **文件:行号**：`src/core/post-process/regex.ts:33-69`（`isLikelyUnsafeRegex` 仅检测「组内含量词且组后紧跟量词」的嵌套结构）
- **现象**：经典 ReDoS `(a|aa)+$`、`(a|[a-z])+$`、`([a-z]+)+$` 中，重复组内部是**重叠交替/字符类**而非量词，`hasQuantInside` 不被置位，函数返回 `null`（判定安全）。该正则一旦落到生成长文本即指数级回溯，可在生成热路径挂死进程。测试 `regex.test.ts` 亦无此类用例。
- **严重度**：P1（防护被绕过，正是本守卫设立的核心目的；属 DoS 缺口）
- **建议方向**：在栈检测基础上补充「重复组内有交替 `|` 且分支可互相前缀重叠」或「组内有字符类/`.` 且组被量词重复」的启发式；或对所有「被 `+/*`/`{m,}` 重复的捕获/非捕获组」做保守拦截。补单测 `(a|aa)+$` 应被拒绝。

#### P1-3 交互事务默认 5s 超时，大备份顺序 await 多记录易整段回滚
- **文件:行号**：`src/app/api/projects/import/route.ts:66-169`（整段 `$transaction` 内对每个子表逐条 `await tx.xxx.create`）
- **现象**：Prisma 交互事务默认 `timeout: 5000ms`；`.nfproject` 含成千上万 storyNodes/lorebookEntries 时，循环内串行 DB 往返极易超过 5s，事务超时抛错 → 触发 `:172` 回滚，用户拿到 500 且导入彻底失败（即便 `maxDuration=300` 只放宽函数层，不放松 DB 事务超时）。
- **严重度**：P1（大项目导入必败，功能性阻塞）
- **建议方向**：为 `$transaction` 显式传 `{ timeout: 120000 }`（或按规模分批 `createMany`）；或拆分事务并保留补偿/去重键以便断点续导；加单测模拟 >5s 负载验证不再超时。

### P2

#### P2-1 幂等查在事务外（TOCTOU），并发同名备份可双建
- **文件:行号**：`src/app/api/projects/import/route.ts:50-63` 与 `:66`（findFirst 与 create 分属两段，无锁）
- **现象**：两个相同 `.nfproject` 的并发请求都通过 `:51` 查重，随后都进入事务新建，绕过幂等。
- **严重度**：P2（需并发触发，概率低但会产生重复项目）
- **建议方向**：对 `(projectId, source)` 简历唯一约束或在事务内先查后建，利用唯一索引兜底冲突。

#### P2-2 `origId` 缺失时跳过去重 → 无 id 备份反复导入成倍复制
- **文件:行号**：`src/app/api/projects/import/route.ts:47,50`（`if (origId)` 包住查重）
- **现象**：备份 `project.id` 为空/非字符串时 `origId=null`，整段查重被跳过，每次导入都新建。
- **严重度**：P2（仅影响无 id 备份）
- **建议方向**：退化为基于 `name`+`source` 或内容指纹去重，至少对缺失 id 的备份给出明确提示。

#### P2-3 固定重复 `{n}` 被误判为嵌套量词（过度拦截正常规则）
- **文件:行号**：`src/core/post-process/regex.ts:64`（`repeated` 含 `{`）
- **现象**：`(a+){2}`、`(a|b){3}` 等**有界**重复被当作嵌套量词拒掉，合法用户规则被静默丢弃（虽经 `failedRules` 告警，但规则不再生效）。
- **严重度**：P2（误杀正常规则，可用性损失）
- **建议方向**：仅当 `{` 后为**范围/无上界**（`{m,}`、`{m,n}`、`{n,}`）且内部有量词时才拦截，固定 `{n}` 放行。

#### P2-4 `SAFE_FLAGS` 允许重复 flag（`gg`）误判安全
- **文件:行号**：`src/core/post-process/regex.ts:15`（`^[gimsuy]*$` 不禁止重复）
- **现象**：`flags:"gg"` 通过校验，随后 `new RegExp` 抛错被 `:125` try/catch 兜底捕获（不致崩溃），但防护分类不准确。
- **严重度**：P2（已被后续 RegExp 兜底，仅分类瑕疵）
- **建议方向**：校验改 `^([gimsuy])(?!.*\1)*$` 或去重后校验。

#### P2-5 `revisionCount` 硬编码 0 丢失修订计数
- **文件:行号**：`src/app/api/projects/import/route.ts:99`（`revisionCount: 0`）
- **现象**：导入节点强制重置修订计数，原始修订历史不可见（影响轻微，节点主体内容保留）。
- **严重度**：P2
- **建议方向**：从备份原值映射（若存在），否则默认 0。

---

## 三、L2 派发建议（本透镜）
- **P1-1 / P1-3**：优先回填 `forkPointNodeId` pass 与事务超时参数，二者均为确定性功能缺陷，加单测即可闭环。
- **P1-2**：ReDoS 守卫补「重叠交替/字符类 + 重复组」检测，并补 `regex.test.ts` 用例，灭防护绕过。
- **P2**：排期处理，P2-3 过度拦截建议顺手修以免误杀用户规则。
