# 工坊（工程与集成透镜）— maxloop Round 6 L1 只读诊断

> 视角：备份恢复 / 导入合并 / 创意工坊预设(.preset.json) / 正则处理 / 键名一致性 / 幂等 / 冲突
> 审查文件：`backup/route.ts`、`import/route.ts`、`presets/[id]/apply/route.ts`、`core/post-process/regex.ts`
> 只读复验，未改动任何源码。

---

## 一、复验结论（Round 5 落地项）

| # | 修复点 | 复验结果 | 证据 |
|---|--------|----------|------|
| R5-1 | 备份写 `included`→`include`，对齐导入侧读取 | ✅ 通过 | `backup/route.ts:56` 写 `include: Array.from(allowed)`；`import/route.ts:31` 读 `bundle.include`。键名集合完全一致：`characters/lorebook/chapters/branches/storylines/style/tables/rules`，导入侧 `want()` 使用同一套键（`import/route.ts:52,64,84,106,118,124,130,136`），无漂移。 |
| R5-2 | `import` 补 `maxDuration=300`；catch 返回 `{success:false,error,built}` | ✅ 大导入覆盖已具备；catch 行为正确 | `import/route.ts:6` `export const maxDuration = 300;`，与 `import/commit`、`babylore/fill-all` 等重活路由一致。`import/route.ts:147-150` catch 返回 `built` 计数。❗但 `built` 仅用于排查，部分已写数据未回滚（见 P1-1）。 |
| R5-3 | 预设 character 套用前 `findFirst({projectId, name:{equals, mode:'insensitive'}})`，存在则 skip、缺失才 create | ✅ 键名与大小写不敏感正确；误 skip 风险见 P2-3 | `presets/[id]/apply/route.ts:105-107` 实现正确。`mode:'insensitive'` 下大小写归一匹配，去重语义正确。 |
| R5-4 | `regex.ts` 收集 `failedRules`，循环后 `console.warn` 汇总（含规则名） | ✅ 通过，规则名确实打出 | `regex.ts:23` `failedRules.push(r.name || "(未命名规则)")`；`regex.ts:27-31` `console.warn` 输出 `failedRules.join("、")`。非法正则不再静默。 |

**复验总评**：Round 5 四项修复均真实落地且正确，无回退。

---

## 二、新坑（按严重度）

### P0
无。四项修复无缺陷、无数据损坏级回归。

### P1

**P1-1 导入无事务回滚 + 非幂等 → 孤儿数据 / 重复项目**
- 文件：`src/app/api/projects/import/route.ts:18-151`（catch 段 `:144-151`）
- 现象：导入全程逐条 `await create`，任一子表写入抛错时，已写入的 project 及其 children 全部留在库里，返回 `{success:false, built}` 但**不回滚**；且每次调用都 `prisma.project.create`（`:44`）新建项目。后果：①失败导入留下孤儿项目（用户在项目列表看到残缺项目）；②重复导入同一 `.nfproject` 生成第 2/3 个同名项目（名带"（导入）"），所有章节/角色/词条成倍复制。R5 明确将"事务回滚列为后续"，但当前仍是可靠性主坑。
- 建议方向：用 `prisma.$transaction` 包裹整段，或失败时按 `newPid` 级联删除（`onDelete: Cascade` 已配置，删 project 即可清 children）；并引入"基于源备份指纹/原 projectId 的幂等导入"或"覆盖导入模式"，避免重复恢复产生副本。

**P1-2 正则规则无 ReDoS/执行边界保护（用户可控模式跑在生成热路径）**
- 文件：`src/core/post-process/regex.ts:20-21`（调用点 `generate/write|refine|continue/route.ts:248,205,160`）
- 现象：`new RegExp(r.pattern, r.flags||"g")` 后 `result.replace(re, ...)`。规则来源于创意工坊预设（`presets/[id]/apply/route.ts:144` 写入 `postProcessingRules`）与 `.nfproject` 备份（导入时随 `project.postProcessingRules` 直接带入，见 `import/route.ts:37-41` 未 strip 该字段 → 保留）。恶意/劣构模式如 `(a+)+$`、`(x*)*y` 可触发灾难性回溯，**挂死生成请求线程（DoS）**，影响 write/refine/continue 三个高频端点。当前仅 try/catch 捕获"编译期"异常，运行期回溯不设防。
- 建议方向：①导入/套用时对 pattern 做基础校验（长度上限、禁止已知危险结构、白名单 flags）；②执行外层加超时/步数熔断或 Node `worker_threads` 隔离；③`applyRegexRules` 单条规则包 try/catch（已部分有）并限制替换次数。

### P2

**P2-1 备份导出缺 `maxDuration`**
- 文件：`src/app/api/projects/[id]/backup/route.ts:21`（整文件）
- 现象：该路由无 `export const maxDuration`。大项目（数千章节/词条）`JSON.stringify(bundle, null, 2)`（`:61`）可能超过平台默认函数时长（部分部署默认 ~10s）而 504，用户拿不到备份。导入侧已设 300，导出侧不对称。
- 建议方向：补 `export const maxDuration = 300;`，与导入对称；超大项目考虑流式/分页导出。

**P2-2 预设 character 重套用只 skip 不更新（与 lorebook/worldview/style 行为不一致）**
- 文件：`src/app/api/presets/[id]/apply/route.ts:108-123`
- 现象：同名角色存在时仅 `skipped:true` 不更新。而 worldview/lorebook（`:80-99,156-175`）、style（`:66-72`）均"存在则 update 覆盖"。若作者更新了角色预设的 background/personality，用户重套用不会生效，且无提示。属幂等语义不一致。
- 建议方向：存在同名角色时 `update` 覆盖关键字段（或返回 `updated` 标志并提示用户），与词条/文风保持一致；或不更新但显式返回"已存在，跳过"。

**P2-3 character 大小写不敏感匹配的误 skip 边界**
- 文件：`src/app/api/presets/[id]/apply/route.ts:105-107`
- 现象：去重正确，但大小写归一意味着项目里已有 "alice" 时，套用名为 "Alice" 的**不同概念**角色会被 skip 而不新建。属低频语义误判（角色名大小写通常指代同一人），影响面有限。
- 建议方向：可保留，但建议在 `created` 中明确 `skipped:true` 并提示；或加 `role` 维度辅助区分。

**P2-4 regex 预设合并：同名整条替换 + 缺字段静默跳过**
- 文件：`src/app/api/presets/[id]/apply/route.ts:133-148`
- 现象：①同名规则直接整条替换为预设版本（`:135-138`），会静默覆盖用户对该规则的手改 replace/flags；②`!r.name || !r.pattern` 的项被 `continue` 静默丢弃（`:134`），与 R5-4 的"告警"精神不一致（此处无 warn）。
- 建议方向：同名规则合并时 diff 提示或保留用户自定义字段；缺 name/pattern 的项记录到返回结果并 `console.warn`。

**P2-5 api_config 预设浅合并可能整体覆盖嵌套配置**
- 文件：`src/app/api/presets/[id]/apply/route.ts:181`
- 现象：`merged = {...current, ...content}` 为浅合并。若 `llmConfig` 含嵌套对象（如 `modelTemplate`、`retry`），预设只要提供同名顶层键即整体替换，丢失其他子键。
- 建议方向：对 `llmConfig` 做受控字段白名单深合并，而非整对象覆盖。

**P2-6 空 `include:[]` 触发静默丢数据**
- 文件：`src/app/api/projects/import/route.ts:31-34`
- 现象：`Array.isArray(bundle.include) && bundle.include.length` 为假时 `include=null`（全量导入）。但若备份被构造为 `include:[]`，导入按全量处理，而 `bundle.project` 实际不含任何关联数组（备份侧按 include 过滤），循环 `p.x || []` 全空 → **静默导入出空项目**且无报错。
- 建议方向：将 `include` 为空数组显式视为"无选中项"而非"全量"；或对缺失关联数组给出告警。

**P2-7 命名歧义：/restore 仅回收站恢复，备份还原实为 import→新建**
- 文件：`src/app/api/projects/[id]/restore/route.ts:6`（实为 `deletedAt=null`）、`import/route.ts`
- 现象：用户直觉的"恢复备份"走的是 `import`（永远新建项目），`restore` 仅把回收站项目 `deletedAt` 清空。二者语义分离，且备份还原缺乏"覆盖到指定现有项目"的能力，放大 P1-1 的重复问题。
- 建议方向：文档/UI 明确区分；后续可提供 `import?targetProjectId=` 覆盖模式。

---

## 三、结论摘要
Round 5 四修复全部正确落地（键名对齐、maxDuration、character 去重、正则告警均复验通过）。新坑以 **P1-1（导入无事务回滚+非幂等孤儿/重复数据）** 与 **P1-2（用户可控正则 ReDoS 跑在生成热路径）** 为最高优先，二者均需在后续 round 纳入修复；P2 多为一致性/边界稳健性，可排期处理。
