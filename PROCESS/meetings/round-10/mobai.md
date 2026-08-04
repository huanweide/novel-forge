# Round 10 L1 只读复验 · 股东·墨白

## 复验角色
**股东·墨白** —— maxloop 质量循环六位股东人格之一。
**透镜**：写章流程 + 自动填表 / 自检 / 防重复 / 归属（填表零错名、写章→填表联动、短章 / 空章边界）。

## 复验性质
**Round 10 L1 只读复验**。遵守约束：`src/` 严格只读，未改动任何源码；不重启 dev 进程（PID 37396）；真机端到端 LLM 填表需代理 `127.0.0.1:7897`，**未经实测，待验证**。本报告所有结论均基于真实代码行号（file:line）+ vitest 实测。

## 复验对象
- **配套提交**：
  - `7814d03` Round 9 实现（v0.46.72）：数字边界守卫 + abort 语义干净 + 填表死循环消除 + 流式成本可见 + 移动抽屉无障碍 + 正则回归修复 / 导入幂等落库。
  - `c824cd2` Round 9 记忆三件套回写。
- **当前 HEAD**：`c824cd2`（工作树干净，仅 `PROCESS/meetings/round-10/` 未跟踪）。
- **复验三件事**：① 回归验证 Round 9 对墨白透镜修复（P1-A、P1-D）是否落地且无回退；② 评估 Round 9 递延开放项 P1-B / C / E / F；③ 挖新坑并确认 Round 9 是否引入新回归。

---

## 一、回归验证（Round 9 修复是否落地、无回退）

### P1-A ✓ 通过 ——「全跳过」error 结构化区分 no_dirty vs all_skipped_mislabeled
- `src/core/babylore/fill.ts:36-45` 新增 `FillErrorMeta` 接口，`kind` 四态：`no_dirty | all_skipped_mislabeled | partial_failed | no_applied`，并携带 `nodeIds` 列表。
- `src/core/babylore/fill.ts:556-560`：`processed===0 && skipped===0` → `kind:"no_dirty"`（本轮真无脏数据）。
- `src/core/babylore/fill.ts:561-565`：`processed===0 && skipped>0` → `kind:"all_skipped_mislabeled"`，error 文案携带「脏标记」字样 + `nodeIds` 列表。
- 测试证据：`src/core/babylore/fill.ops.test.ts:187-211` 断言全 clean → `no_dirty`；`:213-227` 断言全 skipped → `all_skipped_mislabeled` 且 `nodeIds` 含 `c1/c2`。
- **结论**：P1-A 在代码与测试双重层面真实落地，无回退。

### P1-D ✓ 通过 —— 脏标记 `.runtime/babylore-filled.json` 每节点评估后清除，灭无限重填死循环
- `src/core/babylore/fill.ts:513-526`：skip 分支对每个跳过节点调用 `markChapterFilled`（幂等清除路径），确保「已填=干净」语义。
- `src/core/babylore/fill.ts:534-539`：成功落地章 `filledSet.add` + 增量 `saveFilled`（每章持久化）。
- `src/core/babylore/fill.ts:90-97`：`markChapterFilled` 幂等（`if (set.has(nodeId)) return;`），杜绝重复写入。
- 测试证据：`src/core/babylore/fill.ops.test.ts:229-253` 断言二次运行 `skipped===1 && processed===1`，证明全 clean 项目重跑不死循环。
- **结论**：P1-D 真实落地，无限重填死循环已消除，无回退。

### vitest 回归全套 ✓ 通过 —— 16/16 全绿
- 运行命令：`npx vitest run src/core/babylore/fill.ops.test.ts src/core/babylore/fill.selfcheck.test.ts`
- 结果：`fill.ops.test.ts` 10/10 + `fill.selfcheck.test.ts` 6/6 = **16/16 全绿**。
- 注：`fill.selfcheck.test.ts` 依赖真实 DB（`PROJECT_ID=577ed326-b241-4f67-9481-c9332cb03626`），验证错名 / 跨表同名 / 归表错误检测，已通过。
- 注：Vite config 有 ESM 警告（`configLoader:'native'` 不支持 CommonJS），仅 warning，不影响测试通过。
- **结论**：Round 9 对墨白透镜的修复有测试守护，断言了「区分（P1-A）」与「清除（P1-D）」行为。

**回归验证总评**：P1-A、P1-D 均 ✓ 通过，vitest 16/16 全绿，无回退。

---

## 二、Round 9 递延开放项评估（P1-B / C / E / F）

> 以下四项在 Round 9 被显式递延，本轮逐项读真实代码定位精确 file:line，**确认仍开放**。

### P1-B（严重度 P1，仍开放）—— 单章填表不跑 selfCheck 归属自检
- **问题**：`babyloreFillAll` 在末尾调用 `selfCheckFill`（`fill.ts:546`），但单章入口 `babyloreFill`（`fill.ts:381-435`）**全程无 `selfCheckFill` 调用**，仅返回 `r.ok/applied/warnings`（`fill.ts:428-434`）。
- **延伸**：写章自动填表链路 `safeFillAfterWriting`（`loop.ts:164`）调 `babyloreFill` 成功后仅 `markChapterFilled`（`loop.ts:182-188`），同样不跑归属自检。
- **后果**：用户「写一章即自动填表」的闭环里，新填事实的错名 / 跨表同名 / 归表错误**不会被即时发现**，只有手动点「一键填表」才会触发自检。短章 / 空章边界下单章填表最频繁，归属风险最高却最缺自检。
- **建议方向**：在 `babyloreFill` 成功返回前（或 `safeFillAfterWriting` 标记已填前）调用 `selfCheckFill(projectId)` 并对单章 delta 行做轻量归属校验，将 `issues` 随 `FillResult` 回传 UI。

### P1-C（严重度 P1，仍开放）—— 单 op 失败软静默丢数据
- **问题**：`applyOps`（`fill.ts:274-359`）对无效 op 以 `warnings.push` + `continue` 静默跳过（`fill.ts:316-318` update 缺 match、`fill.ts:344-346` delete 缺 match、`fill.ts:330-332` update 非身份列未命中）。
- **延伸**：`babyloreFillAll` 循环里单章 `r.ok` 判定（`fill.ts:534`）只看 `ok && applied>0`，op 级 warning 不阻断章节成功，但**warning 未与具体丢失的 op 绑定**，运维无法定位「哪张表哪条事实被丢掉」。
- **后果**：LLM 偶发给出缺 `match` 列的 update / delete 时，对应事实静默丢失且无可追溯记录，违背「填表零错名 / 不丢数据」原则。
- **建议方向**：`applyOps` 返回 `skippedOps: {op, reason, table}[]`；`babyloreFillAll` 将其并入 `FillAllResult`，UI 展示「被跳过的 N 个操作」并支持一键查看明细。

### P1-E（严重度 P1，仍开放）—— 同名静默合并，无归属确认
- **问题**：`applyOps` insert 去重合并（`fill.ts:296-310`）、update 按名命中合并（`fill.ts:321-325`）均为**大小写不敏感同名即合并**，不区分「同一实体」与「撞名不同实体」。
- **延伸**：`selfCheckFill` 仅检测**跨表**同名（`fill.ts:661-694`：同值落在 ≥2 表才告警），**表内合并不报警**；且告警只是 `issues` 列表，无强制归属确认环节。
- **后果**：「青龙镇（地名）」与「青龙（人名）」若被 LLM 误归一表，合并后归属错误且不被拦截，后续章节基于错误归属继续累积。
- **建议方向**：同名合并时若跨类别（geo vs entity）或跨语义，写入 `pendingMerge` 待用户确认；`selfCheckFill` 增加「表内同名但来源章节不同」弱告警。

### P1-F（严重度 P1，仍开放）—— 填表结果不可回溯
- **问题**：`applyOps` 每 op 后 `prisma.loreTable.update({ data:{ rows } })`（`fill.ts:356`）**整体覆盖写回**，无版本 / 来源 / 时间戳字段。
- **后果**：合并冲突、误填、LLM 幻觉写入后，无法定位「哪次填表、哪章、哪个 LLM 调用」引入的改动，回滚只能整表重置，违背「归属可追溯」。
- **建议方向**：`rows` 每行增加 `_src`（章节 order + 填表批次 id）与 `_ts`；或独立 `loreRowHistory` 表记录增量，支持按章节回滚。

---

## 三、新发现问题

### 新 P2-①（严重度 P2）—— tables 页不展示 fillErrorMeta 且无「清理脏标记」出口
- **位置**：`src/app/workspace/[projectId]/tables/page.tsx:268-297`（结果展示）、`runFillAll` 调用 `:156-180`。
- **问题**：Round 9 给 `fill-all` 返回加了结构化 `fillErrorMeta`（`kind` + `nodeIds`），但 UI 只展示 `error` 文案（`page.tsx:271`）、`selfCheck.issues`（`page.tsx:286-292`），**完全不读取 / 不展示 `fillErrorMeta.kind` 与 `nodeIds`**。
- **断裂**：`fill.ts:564` 文案写「建议清理脏标记后重试」，但全仓**无任何 clearFilled / 清脏标记 API 或 UI 按钮**。Round 9 修了「诊断」却未给「出口」，错误文案不可执行。
- **建议方向**：① UI 展示 `fillErrorMeta.kind` 与 `nodeIds`；② 新增 `POST /api/babylore/clear-filled` + 「清理脏标记」按钮，命中 `all_skipped_mislabeled` 时一键清除 `.runtime/babylore-filled.json` 对应项。

### 延续 P2-1（严重度 P2）—— delete 按全量同名过滤，可能误删
- **位置**：`fill.ts:350-353`：`rows.filter(... !== val)` 删除**所有**同名行（含不同实体撞名）。
- **建议**：delete 需同时带身份列 + 类别约束，避免撞名误删。

### 延续 P2-2（严重度 P2）—— `crossTableIssues` 计数口径不一致
- **位置**：`fill.ts:661-694`：跨表同名每表 +1（`fill.ts:664`、`:684`），但单向归表告警每触发一次也 +1；与 `issues` 条目数不对齐，UI 计数（`page.tsx:284`）易误导。
- **建议**：统一用 `issues.length` 或显式区分「同名对数 / 告警条数」。

### 延续 P2-3（严重度 P2）—— `applied===0` 分支为死代码风险
- **位置**：`fill.ts:570-573`：`applied===0` 分支在 `processed>0` 时理论上可达，但 `runFillForText` 任一章 `applied>0` 才计入 `processed`（实际 `processed++` 在 `fill.ts:528` 不论 applied），故该分支与 `partial_failed` 优先级需复核。
- **建议**：明确 `applied===0` 与 `partial_failed` 的互斥关系，补单测覆盖。

### 延续 P2-4（严重度 P2）—— insert 空名行可落库
- **位置**：`fill.ts:305-309`：`newVal==null` 时仍 `rows.push(row)` 且 `applied++`，生成身份列为空的伪行。
- **建议**：`newVal==null` 时不插行、记 warning（与 update 守卫对齐）。

### 延续 P2-5（严重度 P2）—— 单章填表无 geo / entity 类别拦截
- **位置**：`babyloreFill`（`fill.ts:381-435`）不调用 `selfCheckFill`，单章无法触发 `fill.ts:679-692` 的归表错误判定。
- **建议**：同 P1-B，将单章 delta 纳入轻量类别校验。

---

## 四、结论

### P0 / P1 / P2 计数
- **P0 = 0**：Round 9 已修复墨白 P0-1（整体覆盖丢前序章）、P0-3（完成门槛）并消除无限重填死循环，本轮未发现新 P0，Round 9 无新回归。
- **P1 = 4**：P1-B（单章不跑归属自检）、P1-C（单 op 失败静默丢数据）、P1-E（同名静默合并无确认）、P1-F（结果不可回溯）—— 均为 Round 9 递延开放项，本轮确认仍开放。
- **P2 = 6**：新 P2-①（UI 不展示 fillErrorMeta + 无清脏标记出口）＋ 延续 P2-1 ~ P2-5。

### 是否达「全员无 P0 / P1」
**未达**。回归验证（P1-A、P1-D）通过且 vitest 16/16 全绿，但仍有 **4 个 P1 开放**（B / C / E / F），不满足「全员无 P0 / P1」放行门槛。

### 最优先项
1. **P1-B**：单章填表（写章自动填表主链路）不跑 `selfCheckFill`，零错名 / 归属自检在最高频路径缺位 —— 应优先补单章 delta 归属校验。
2. **P1-C**：单 op 失败静默丢数据且无可追溯记录 —— 需补 `skippedOps` 回流与 UI 展示，守住「不丢数据」。

### 声明
- 真机端到端 LLM 填表（需代理 `127.0.0.1:7897`）**未经实测，待验证**；本报告测试均为 mock fetch 或真实 DB 非真实 LLM 调用。
- `src/` 全程只读，未改源码；未重启 dev 进程（PID 37396）。
