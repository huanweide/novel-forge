# 工坊透镜 · Round 9 只读复验报告（v0.46.71）

> 复验人：股东 Agent（人格=工坊；透镜：备份 / 导入合并 / 预设 / 正则）
> 范围：回归验证 Round 8 修复 + 工坊透镜新坑挖掘。全程只读，未改动任何源码。
> 测试实跑：`npx vitest run src/core/post-process/regex.test.ts` → **18 passed**（与声明一致）。

---

## 回归验证

### R1 · `src/core/post-process/regex.ts` — `?` 量词嵌套检测
**Round8 回归标记：是（本轮已交付，但发现反向回归，见 N1）**

| 验证项 | 结果 |
|---|---|
| `(a?)+` / `(a?)*` / `((a?))+` 被拦截 | ✅ 通过（实测 + 代码走查，内层 `?` 计入 `hasQuantInside`，外层 `*`/`+` 触发 `repeated`） |
| 合法非捕获 / 前瞻组 `(?:…)` `(?=…)` 不误伤 | ✅ 通过（`?` 处理处 `pattern[i-1] !== "("` 排除组修饰符；实测 `(?:colou?r)`、`(?=a)+` 均放行） |
| `regex.test.ts` 18 passed | ✅ 实跑确认 |

**结论：Round 8 对 `?` 嵌套量词的拦截目标达成，合法非捕获/前瞻组无误伤。**
但为覆盖 `(a?)+`，Round 8 把 `?` 一并写进了外层 `repeated` 触发集（第 76 行），导致**反向误判合法可选组**（N1），属本次复验发现的新回归点。

### R2 · `src/app/api/projects/import/route.ts` — 外键剥离 / pass2 回填 / 事务内幂等
**Round8 回归标记：是（部分达成，并发幂等声明未真正兜底，见 N2）**

| 验证项 | 结果 |
|---|---|
| 创建 storyNode 剥离 `parentId/branchId` | ✅ 通过（`route.ts:105` 的 `strip(n,[…,"parentId","branchId"])`） |
| pass2 按旧→新映射回填父/分支指针 | ✅ 通过（`route.ts:109-116`，`nodeMap` / `branchMap` 重映射） |
| 悬空外键置 null | ⚠️ 间接达成：未显式赋值，因创建时已 `strip` 掉故字段默认 null；但**未做显式 null 写入**，逻辑依赖“不赋值即 null”，脆弱 |
| 幂等查重移入 `$transaction` 内 | ✅ 代码位置正确（`route.ts:57-68` 在事务回调内 `findFirst`） |
| 并发导入不重复建节点 | ❌ **未真正保证**（见 N2：无 DB 唯一约束，READ COMMITTED 下仍竞态重复） |

**结论：单连接/串行语义下 Round 8 修复成立；并发幂等仅“代码移入事务内”而未加 DB 约束，声明未落地。**

---

## 新发现问题

### N1 · P1 · 合法可选组被误判为 ReDoS（Round8 反向回归）
- **文件:行号**：`src/core/post-process/regex.ts:76`（兼 `:88-94`）
- **问题简述**：第 76 行 `repeated = next === "*" || next === "+" || next === "{" || next === "?"` 把 `?`（可选，最多 1 次）也当作“外层重复触发”。但灾难性回溯要求组被**真正重复**（`*`/`+`/`{n,}`），`?` 不会产生指数回溯。导致对 `(https?://)?`、`(a+)?`、`(.*)?`、`(a?)?` 等完全合法、最常见的可选组模式判为“嵌套量词不安全”而被 `applyRegexRules` 静默丢弃（见 `regex.ts:139-146`）。这会直接废掉大量用户合法正则预设（如可选协议、可选后缀）。
- **建议修复方向**：从 `repeated` 集合中**移除 `?`**（仅保留 `* + {`）；内层 `?` 仍按 `:88-94` 计入 `hasQuantInside`，故 `(a?)+`、`(a?)*`、`((a?))+` 仍由外层 `*`/`+` 正确拦截，零覆盖损失。并补充测试用例 `(https?://)?`、`(a+)?`、`(a?)?` 期望 `toBeNull()`。
- **是否 Round8 回归标记**：**是**（为修 `(a?)+` 引入的过宽判定）。

### N2 · P1 · 并发导入仍可能重复建项目（幂等无 DB 约束兜底）
- **文件:行号**：`src/app/api/projects/import/route.ts:57-68`；`prisma/schema.prisma:29`（无唯一约束佐证）
- **问题简述**：去重仅靠事务内 `tx.project.findFirst({ buildConfig.path(["importSource","projectId"]) })` 的 SELECT-then-INSERT。PostgreSQL 默认 READ COMMITTED 下，两个并发相同备份请求各自在对方提交前 SELECT 都看不到行，于是都 INSERT → **两个重复项目**。schema 中 `buildConfig` 为 `Json?` 且无任何 `@@unique`/`@@index` 针对 `importSource`（全库仅 2 处 `@@unique`，均与导入无关），故无 DB 层兜底。Round7/8 声称的“幂等锁/并发不重复”未真正落实。
- **建议修复方向**：在 `project` 上加 DB 唯一约束（如单独 `importSourceProjectId` 列 + `@@unique([importSourceProjectId, importSourceSource])`，或表达式唯一索引），INSERT 冲突时回退到“返回已存在项目”；应用层 `findFirst` 保留作快路径。
- **是否 Round8 回归标记**：**否**（Round8/7 声称已修，但复验发现声明未落地；属历史缺口验证）。

### N3 · P1/P2 · 大备份串行 INSERT + 60s 事务超时（导入超时/内存）
- **文件:行号**：`src/app/api/projects/import/route.ts:104-186`（逐条 `await tx.xxx.create`）+ `:189`（`timeout: 60000`）
- **问题简述**：每个节点/词条/角色都是独立 `await` 串行写，节点数上千时事务内往返极多；60s 事务超时对超大 `.nfproject`（长篇 + 海量世界书）可能不够，触发整段回滚（虽不留孤儿，但导入失败需重试）。属“大文件导入超时/内存”透镜项。
- **建议修复方向**：节点/词条批量 `createMany`（或分块并行 + 显式 `maxDuration` 已 300）；`timeout` 调高或改为分批提交；对超大规模做流式解析与限速。
- **是否 Round8 回归标记**：**否**。

### N4 · P2 · 预设 `.preset.json` 无 schema/version 校验 + 未知 type 静默 no-op
- **文件:行号**：`src/app/api/presets/import/route.ts:9-13`（仅校验 `type`/`title`）、`src/app/api/presets/[id]/apply/route.ts:30-187`（类型分支 `if/else if` 链）
- **问题简述**：① 导入路由不校验 `format`/`version`、不校验 `content` 结构，任意含 `type+title` 的 JSON 都被当预设入库；② `apply` 对未知/新版本 `type` 会**穿透所有分支直接 no-op**（不报错、仍写 `appliedPresets`、仍 `downloads+1`），用户以为套用成功实则什么都没落库——典型的“预设兼容性 / 数据静默丢失”。
- **建议修复方向**：导入时校验最小 schema 与 `version`；`apply` 末尾加 `else { return 400 未知预设类型 }`，杜绝静默失败；对 `content` 按 type 做字段白名单校验。
- **是否 Round8 回归标记**：**否**。

### N5 · P2 · `api_config` 预设浅合并丢失嵌套配置
- **文件:行号**：`src/app/api/presets/[id]/apply/route.ts:181`（`{ ...current, ...content }`）
- **问题简述**：`llmConfig` 合并为浅合并，若 `content` 含嵌套对象（如 `models`、`retry`、`templates`），整段被外层同名键整体覆盖而非深合并，子字段丢失；且 `content` 整体摊平进 `llmConfig`，若来源预设混入非配置键会污染配置。
- **建议修复方向**：按已知 `llmConfig` 子键做白名单 + 逐层合并（deep merge 仅对对象型子键），剔除未知键。
- **是否 Round8 回归标记**：**否**。

### N6 · P2 · 小说导出缺 charset + 深层标题压平（导出格式错乱）
- **文件:行号**：`src/app/api/projects/[id]/export/route.ts:165`（无 `charset=utf-8`）、`:184`（`Math.min(depth+1,6)`）
- **问题简述**：① Markdown/纯文本 `Content-Type` 未带 `charset=utf-8`（备份路由 `:63` 有，本路由无，不一致），部分下载客户端对中文可能乱码；② 树深度 > 5 时标题全压成 `h6`，嵌套层级信息丢失；③ 目录锚点用 `encodeURIComponent` 生成，与 GitHub 实际锚点算法不一致，点击目录不跳转。
- **建议修复方向**：统一加 `; charset=utf-8`；深层标题改为带缩进的列表而非继续抬级；TOC 锚点对齐 CommonMark/GitHub 规则（小写、去标点、空格转 `-`）。
- **是否 Round8 回归标记**：**否**。

### N7 · P2 · 备份美化 JSON 无 maxDuration + 导入未校验 version（备份恢复不完整/兼容）
- **文件:行号**：`src/app/api/projects/[id]/backup/route.ts:61`（`JSON.stringify(bundle,null,2)` 美化）、无 `maxDuration`；`import/route.ts:37` 仅校验 `format` 不校验 `version`
- **问题简述**：① 备份对大项目做 2 空格美化，体积与解析开销翻倍，且本路由未设 `maxDuration`（对照 import 已 300），超大项目导出可能超时；② 导入只认 `format==="nfproject"`，不读 `version`（备份写 `version:1`），未来 v2 备份 schema 变更会被静默错读，造成“备份恢复不完整”。
- **建议修复方向**：备份默认紧凑序列化（或按 size 阈值切换）；补 `maxDuration`；导入对 `version` 做范围校验并提示不兼容。
- **是否 Round8 回归标记**：**否**。

### N8 · P2 · 导入时部分字段被硬置/丢弃（数据丢失）
- **文件:行号**：`src/app/api/projects/import/route.ts:105`（`revisionCount: 0` 硬置）、`strip` 列表（`:71-75`、`:94`、`:138` 等未含 `deletedAt` 但导入也不还原软删）
- **问题简述**：节点 `revisionCount` 被强制 0，备份中的修订计数丢失；备份若含 `deletedAt` 软删记录，导入后变为活跃（未还原删除态）；所有子表的 `updatedAt` 被剥离重建。属“导入合并覆盖/丢失数据”透镜项，单条影响小但累积可见。
- **建议修复方向**：`revisionCount` 从备份取值（缺失再默认 0）；按业务决定是否还原 `deletedAt`；写变更日志说明导入重置了哪些元数据。
- **是否 Round8 回归标记**：**否**。

### N9 · P2 · `regex.ts` 死代码分支（误导注释）
- **文件:行号**：`src/core/post-process/regex.ts:51-60`
- **问题简述**：`if (pattern[i+1] === "?")` 与 `else` 两分支代码完全相同（都是 `stack.push(...); continue;`），注释称“跳过 `?: (?=` 修饰符”，实际并未跳过，真正排除依赖 `:90` 的 `pattern[i-1] !== "("`。纯代码气味/误导，无功能危害，但易引发后续维护者误判。
- **建议修复方向**：删除该无效 `if` 分支与误导性注释，或在分支内真正 `i += 1` 跳过 `?` 修饰符（与注释意图一致）。
- **是否 Round8 回归标记**：**否**。

---

## 结论

工坊透镜在 **v0.46.71（Round 8）** 下的复验结论：

1. **P0：无。** 未发现会导致崩溃、数据损坏或不可恢复丢失的 P0 级问题。Round 8 的两处修复（正则 `?` 嵌套拦截、导入外键剥离/pass2 回填）在单连接语义下基本成立，未引入 P0。

2. **P1：有 2 项。**
   - **N1（正则）**——Round 8 为修 `(a?)+` 把 `?` 列入外层 `repeated` 触发集，反向误伤 `(https?://)?`、`(a+)?` 等合法可选组，会静默废掉用户正常正则预设。**这是 Round 8 引入的回归，建议优先修。**
   - **N2（导入合并）**——并发导入的“幂等防重复”仅应用层 SELECT-then-INSERT，无 DB 唯一约束，READ COMMITTED 下仍可能建出重复项目。Round7/8 的“并发不重复”声明未真正落地。

3. **P2：有 7 项**（N3 大导入超时/内存、N4 预设无校验/静默 no-op、N5 预设浅合并、N6 导出格式/编码、N7 备份体积/version、N8 导入字段丢失、N9 死代码）。均为兼容性、健壮性、性能与数据完整性层面的隐患，无即时危险但应在后续 Round 收敛。

**股东建议**：Round 9 应首先回收 N1（一行改动：从 `repeated` 移除 `?`，并补 3 条“可选组应放行”用例），其次补 N2 的 DB 唯一约束把“并发幂等”声明真正坐实；其余 P2 按优先级排入技术债清单。
