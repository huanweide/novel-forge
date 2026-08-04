# 工坊透镜 · Round 10 只读复验报告（v0.46.72，HEAD=7814d03）

> 复验人：股东 Agent（人格=工坊；透镜：备份 / 导入合并 / 预设 / 正则）
> 范围：回归验证 Round 9 两项修复（commit 7814d03）+ 工坊透镜内新坑挖掘。全程只读，未改动任何源码。
> 测试实跑：`npx vitest run src/core/post-process/regex.test.ts` → **23 passed**（与声明一致）。
> 配套提交：Round 9 实现 `7814d03`（v0.46.72），含 `prisma db push` 已建 `importSource` 唯一约束（Round9 _integration.md:41 佐证，generated 客户端 `models/Project.ts` 已含 `importSource` 字段与 `unique` 推断）。

---

## 回归验证

### R1 · `src/core/post-process/regex.ts` — `?` 移出 `repeated` 集（N1）
**Round9 标记：是（本次交付，复验确认落地）**

| 验证项 | 结果 |
|---|---|
| `(https?://)?` / `(a+)?` / `(a?)?` 合法可选组放行 | ✅ 通过（`regex.ts:78` `repeated = next==="*" \|\| next==="+" \|\| next==="{"`，已无 `?`） |
| 真 ReDoS `(a?)+` / `(a?)*` / `((a?))+` 仍拦截 | ✅ 通过（内层 `?` 经 `:90-95` 计入 `hasQuantInside`，外层 `* / +` 触发 `:81-82`） |
| 非捕获/前瞻组 `(?:…)` `(?=…)` 不误伤 | ✅ 通过（`?` 处理处 `:92` `pattern[i-1] !== "("` 排除组修饰符） |
| 重叠交替 `(a|aa)+` / `(a|b)+` 拦截 | ✅ 通过（`regex.ts:84-86` 命中 `hasAlternation`） |
| `regex.test.ts` 23 passed | ✅ 实跑确认（含 3 条“可选组应放行”+ 2 条“真 ReDoS 仍拦”新增用例） |

**结论：Round 9 N1 修复落地且未回退。合法可选组不再被误杀，真 ReDoS 覆盖零损失。✓**

### R2 · `prisma/schema.prisma` + `import/route.ts` — importSource @unique + 并发幂等（N2）
**Round9 标记：是（本次交付，复验确认落地）**

| 验证项 | 结果 |
|---|---|
| `Project.importSource String? @unique` 已加 | ✅ 通过（`schema.prisma:45`） |
| generated 客户端同步含 `importSource` 字段 + `unique` | ✅ 通过（`src/generated/prisma/models/Project.ts` 多处含 `importSource`，`inlineSchema` 含 `@unique`） |
| `import/route.ts` 写入 `importSource` 顶层字段 | ✅ 通过（`route.ts:86` `projData.importSource = importSourceKey`） |
| 事务内查重（`findUnique({where:{importSource}})`） | ✅ 通过（`route.ts:64-70`） |
| P2002 兜底返回已存在项目（幂等） | ✅ 通过（`route.ts:202-213` `code==="P2002" && importSourceKey` 查回 `existing` 返回 `idempotent:true`） |
| origId 缺失 → importSource=null → 按新建（多 null 不冲突） | ✅ 通过（`route.ts:54,86`） |

**结论：Round 9 N2 修复落地且未回退。DB 唯一约束 + 事务内查重 + P2002 兜底三层幂等，并发重复导入不再建重复项目。✓**

---

## 新发现问题

### N3 · P2 · 导出备份未含 `appliedPresets` / `importSource` 等顶层字段（备份还原不完整）
- **文件:行号**：`src/app/api/projects/[id]/backup/route.ts:7-16`（INCLUDE）、`:37-46`（include 投影）、`:51-58`（bundle）
- **问题简述**：备份 `include` 只含 8 类关联子表（characters/lorebookEntries/storyNodes/storyBranches/storylines/styleCards/loreTables/rules），但 `project` 本体落库时 `projData` 已含 `appliedPresets`、`importSource`（`schema.prisma:31,45`）等顶层字段。导出 `bundle.project` 取的是 `findUnique` 完整对象，故 `appliedPresets` 实际会被序列化进备份；但 `import` 侧 `strip` 列表（`route.ts:73-77`）把 `appliedPresets` 一并剥离重建为新数组——**导入后项目丢失“已应用预设”追踪记录**，与配置中心“移除预设”功能脱节。属“备份恢复不完整”。
- **建议修复方向**：导入时若不重放预设应用，应在 `strip` 中保留 `appliedPresets` 原值（或导入后回写）；并在备份 `bundle` 显式声明顶层字段白名单，避免隐式依赖整对象序列化导致未来 schema 增字段时静默差异。
- **是否 Round9 回归标记**：**否**。

### N4 · P2 · 导入 `.nfproject` 不校验 `version`，且 `include` 与备份 `include` 语义错位风险
- **文件:行号**：`src/app/api/projects/import/route.ts:39-46`（仅校验 `format`）、`backup/route.ts:29-33`（默认全 8 类）
- **问题简述**：导入只认 `format==="nfproject"`，完全不读 `bundle.version`（备份写 `version:1`，`backup/route.ts:53`）。未来 v2 备份若变更 schema，旧导入路由会静默错读。另：备份导出 `include` 用 `lorebook` 键（`backup/route.ts:39` `lorebookEntries`），导入 `want("lorebook")`（`import/route.ts:140`）键名**对称一致** ✓，但导入侧对用户传入任意 `bundle.include` 不做白名单校验——若前端传错键名（如 `"lore"`），`want()` 返回 false，该部分整段静默跳过且无任何提示，用户以为导入成功实则缺数据。属“导入合并覆盖/丢失数据 + 静默失败”。
- **建议修复方向**：导入对 `bundle.include` 做白名单过滤（未知键告警/忽略并记录），并对 `version` 做范围校验；版本不兼容时显式 400 提示。
- **是否 Round9 回归标记**：**否**。

### N5 · P2 · 预设 `api_config` 仍为浅合并，且 `content` 整体摊平污染 llmConfig
- **文件:行号**：`src/app/api/presets/[id]/apply/route.ts:177-186`（`{...current, ...content}`）
- **问题简述**：Round 9 报告 N5（原编号）所述浅合并问题**仍存在且未修**。若 `content` 含嵌套对象（如 `models`、`retry`、`templates`），整段被外层同名键覆盖而非深合并子字段丢失；且 `content` 整体摊平进 `llmConfig`，混入非配置键会污染配置。与 Round 9 N1/N2 修复无关，属历史 P2 未收敛。
- **建议修复方向**：按已知 `llmConfig` 子键白名单 + 逐层合并（仅对象型子键深合并），剔除未知键。
- **是否 Round9 回归标记**：**否**（Round 9 已记录为 N5，本轮复验确认仍未修）。

### N6 · P2 · 预设未知 type 仍静默 no-op（Round 9 N4 仍未修）
- **文件:行号**：`src/app/api/presets/[id]/apply/route.ts:30-187`（if/else if 链无 else）、`:189-217`（仍写 `appliedPresets` + `downloads+1`）
- **问题简述**：Round 9 N4 所述“未知/新版本 `type` 穿透所有分支直接 no-op，仍写 `appliedPresets`、仍 `downloads+1`”**仍存在**。用户以为套用成功实则什么都没落库。属“预设兼容性 / 数据静默丢失”。
- **建议修复方向**：`apply` 末尾加 `else { return 400 未知预设类型 }`，杜绝静默失败；导入时对 `type` 做枚举白名单。
- **是否 Round9 回归标记**：**否**（Round 9 已记录为 N4，本轮确认仍未修）。

### N7 · P2 · `regex` 预设应用不校验规则本身是否会被 ReDoS 防护拒绝（前端无反馈）
- **文件:行号**：`src/app/api/presets/[id]/apply/route.ts:124-148`（regex 分支仅按 name 去重合并，不调 `isLikelyUnsafeRegex`）
- **问题简述**：预设 regex 规则写入 `postProcessingRules` 时**不预检** `isLikelyUnsafeRegex`。若预设含真 ReDoS 规则（如 `(a+)+`），写入成功但后续 `write/refine/continue` 路由 `applyRegexRules` 会静默丢弃（`regex.ts:142-148`）——用户套用预设“成功”却无任何规则生效，且无提示。属“正则 UI / 预设套用静默失败”。注意：`isLikelyUnsafeRegex` 仅用于运行期拒绝，预设入库期未复用同一守卫，两处语义不一致。
- **建议修复方向**：预设 regex 应用期复用 `isLikelyUnsafeRegex` 预检，拒绝并提示不安全规则（或至少返回被跳过规则清单给前端）；与运行期守卫保持一致。
- **是否 Round9 回归标记**：**否**。

### N8 · P3 · 导入分支 `forkPointNodeId` 重映射仅覆盖 `branchForkMap` 命中项
- **文件:行号**：`src/app/api/projects/import/route.ts:96-102`（缓存 `b.forkPointNodeId`）、`:126-136`（回填）
- **问题简述**：`branchForkMap[b.id] = b.forkPointNodeId` 缓存分叉点，回填时 `if (oldFork && nodeMap[oldFork] && branchMap[b.id])` 三者齐备才更新。若备份中 `forkPointNodeId` 指向的节点**不在导入范围**（例如用户只导入 `branches` 未导入 `chapters`，但分支本就依赖节点），`nodeMap[oldFork]` 为 undefined → 分叉点保留旧 id（指向已不存在/新项目外的节点），分叉关系拓扑断裂且无报错。属“forkPoint 重映射 + 部分导入边界”隐患。
- **建议修复方向**：部分导入时校验分支所依赖的 `forkPointNodeId` 是否在导入集内；不在则置 null 并告警，或在 `want("branches")` 且缺 `chapters` 时拒绝/提示。
- **是否 Round9 回归标记**：**否**。

### N9 · P3 · `regex.ts` 死代码分支（Round 9 N9 仍未修）
- **文件:行号**：`src/core/post-process/regex.ts:51-60`
- **问题简述**：Round 9 N9 所述 `if (pattern[i+1]==="?")` 与 `else` 两分支代码完全相同（都是 `stack.push(...); continue;`），注释称“跳过 `?: (?=` 修饰符”实际未跳过，纯代码气味/误导，无功能危害。本轮复验确认**仍未删**。
- **建议修复方向**：删除无效 `if` 分支与误导性注释，或在分支内真正 `i+=1` 跳过 `?` 修饰符（与注释意图一致）。
- **是否 Round9 回归标记**：**否**（Round 9 已记录为 N9，本轮确认仍未修）。

---

## 新回归确认（N1/N2 是否引入）

- **N1（regex）对调用方影响**：`isLikelyUnsafeRegex` 行为变更（放行合法可选组）仅放宽判定，无破坏性。`applyRegexRules` 三处调用方（`write/route.ts:248`、`refine/route.ts:160`、`continue/route.ts:205`）均依赖“被拒规则静默跳过”，放宽后只会增加生效规则数，不引入回归。✓ 无新回归。
- **N2（schema importSource）对客户端类型影响**：`generated/prisma` 的 `Project` 模型已重新生成并含 `importSource`（含 `unique` 推断），所有引用 `Project` 的 `where`/`create`/`update` 类型一致；grep 全仓除 `import/route.ts` 外无其他代码引用 `importSource`，无类型破坏。DB 约束经 `prisma db push` 已建（Round9 _integration.md:41 佐证）。✓ 无新回归。
- **N2 对存量数据影响**：`importSource` 为 `String? @unique`，Postgres 多 null 不冲突，存量项目 `importSource=null` 合法，不影响既有查询/唯一约束。✓ 无新回归。

**结论：Round 9 N1/N2 改动未引入任何新回归，客户端类型与运行路径一致。**

---

## 结论

工坊透镜在 **v0.46.72（Round 9，HEAD=7814d03）** 下的复验结论：

1. **P0：无。** 未发现崩溃、数据损坏或不可恢复丢失的 P0 级问题。Round 9 两项修复（N1 `?` 移出 `repeated`、N2 `importSource @unique` + 并发幂等）均落地且未回退，未引入新回归。

2. **P1：无新增。** Round 9 的两项 P1（N1 合法可选组误杀、N2 并发重复建项目）已在本轮坐实修复，复验全绿。

3. **P2：有 5 项**。
   - **N3**（备份 `appliedPresets` 导入后被剥离，配置中心追踪脱节）
   - **N4**（导入不校验 `version` + `include` 键名无白名单致静默跳过）
   - **N5**（预设 `api_config` 浅合并污染 `llmConfig`，Round 9 遗留未修）
   - **N6**（预设未知 type 静默 no-op 仍写 `appliedPresets`/`downloads+1`，Round 9 遗留未修）
   - **N7**（预设 regex 入库期不预检 ReDoS，套用“成功”却静默失效）

4. **P3：有 2 项**。
   - **N8**（部分导入时 `forkPointNodeId` 重映射断裂无报错）
   - **N9**（regex.ts 死代码分支误导，Round 9 遗留未修）

**股东建议**：Round 10 优先收敛 N5/N6（Round 9 已记录但未修的预设静默失败，直接影响用户预设套用可信度），其次补 N3/N4/N7 的备份/导入/预设守卫一致性；N8/N9 为健壮性/代码气味，可排入技术债。N1/N2 修复质量良好，无需额外动作。
