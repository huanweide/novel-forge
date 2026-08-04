# Round 11 复验 — 墨白（数据完整性）

## 环境（HEAD、你读过的文件清单）

- **HEAD**：`b5901aa`（Round 10 记忆三件套回写；工作树干净）。
- **配套实现提交**：`899a480` Round 10 实现（v0.46.73）：填表完整性闭环 + 游戏归属/前后端对齐 + 抽屉无障碍闭环 + 导入真实记账与并发 + 建卡去重/预设守卫；双 changelog 同 commit，tsc 零错误。
- **说明**：纯只读复验。未改动任何 `src/` 源码/配置/文档，未跑 tsc 改写，未重启进程。所有结论基于真实 Read 行号；未做需要代理的真机 LLM 端到端实测。

### 读过的文件清单

| 文件 | 用途 |
|---|---|
| `src/core/babylore/fill.ts` | 填表核心：applyOps / babyloreFill / babyloreFillAll / selfCheckFill / 脏标记生命周期 |
| `src/core/babylore/loop.ts` | 写章自动填表 `safeFillAfterWriting`、召回块 |
| `src/core/babylore/types.ts` | 类型定义 |
| `src/app/api/babylore/fill/route.ts` | 单章手动填表路由 |
| `src/app/api/babylore/fill-all/route.ts` | 一键填表路由 |
| `src/app/api/babylore/clear-filled/route.ts` | 清脏标记出口 |
| `src/app/workspace/[projectId]/tables/page.tsx` | 表格页 UI（fillErrorMeta 展示 + 清脏按钮） |
| `src/app/api/projects/import/route.ts` | 导入链路（磐石改动，间接核对） |
| `src/core/babylore/fill.ops.test.ts` | P1-A/C/D/F 测试守护（293 行） |
| `src/core/babylore/fill.selfcheck.test.ts` | selfCheckFill 跨表/归表测试（154 行） |
| `PROCESS/meetings/round-10/mobai.md` | Round 10 复验报告（对齐 4 个 P1 定义） |

---

## 回归结论（Round 10 修复逐条：生效？回流？新回归？）

Round 10（v0.46.73）承诺的 6 个修复点，逐条对照真实代码：

### ① babyloreFill 落库后跑 selfCheckFill 回传归属/跨表 issues —— ✅ 生效，无回流
- `src/core/babylore/fill.ts:467-468`：在 `babyloreFill` 内 `runFillForText` 之后调用 `selfCheckFill(projectId)`，并把 `selfCheckIssues` 并入 `FillResult`（`fill.ts:475`）。
- 写章链路 `safeFillAfterWriting` 也回传 `selfCheckIssues`（`src/core/babylore/loop.ts:170`）。
- 对照 Round 10 的 P1-B，已在代码层落地。无回流。

### ② applyOps 收集 skippedOps:{op,reason,table} 使单 op 失败可追溯 —— ✅ 生效，无回流
- `applyOps` 声明 `skippedOps`（`fill.ts:314`），在三种无效 op 处 push：`update` 缺有效 match 列（`fill.ts:352`）、`update` 非身份列未命中（`fill.ts:368`）、`delete` 缺有效 match 列（`fill.ts:383`）。
- `babyloreFillAll` 汇总为 `allSkippedOps`（`fill.ts:577`）并写入 `FillAllResult.skippedOps`（`fill.ts:631`）。
- 测试 `fill.ops.test.ts:257-279` 断言 `skippedOps` 非空且 reason 与 warning 文本一致。对照 Round 10 的 P1-C，落地且有测试守护。

### ③ selfCheckFill 加表内同名异源弱告警（不静默合并）—— ✅ 逻辑落地（但主链路失效，见新 P1-①）
- `src/core/babylore/fill.ts:692-720`：对每张表扫描相同身份列值出现在 ≥2 行且来源章节（`_src` 中的 `ch` 序号）不同 → 推 `issues` 弱告警，仅报告不合并。
- 逻辑本身正确，但依赖 `_src` 携带可解析的 `ch{order}`；在写章自动填表主链路 `_src` 恒为 `ch?:batchmanual`（见新 P1-①），导致该告警对主链路产生的同名异源**无法跨章节触发**。属"落地但被上游溯源缺陷削弱"。

### ④ 写入行附 _src(章节+批次)/_ts 溯源（rows 为 JSON 列不改 schema）—— ⚠️ 部分生效，主链路失效（见新 P1-①）
- 代码确实在每次落库行写入 `_src`/`_ts`：`insert` 去重合并（`fill.ts:335`）、`insert` 新行（`fill.ts:340`）、`update` 命中（`fill.ts:359`）、`update` 身份列新建（`fill.ts:372`）。`rows` 仍为 JSON 列、未改 schema，符合要求。
- **缺陷**：`srcLabel` 由 `options.chapterOrder` 决定（`fill.ts:465`）。但写章自动填表主链路 `safeFillAfterWriting` 调用 `babyloreFill` 时仅传 `{ projectLlmConfig }`（`loop.ts:164`），**未传 `chapterOrder`**（`nodeOrder` 在 `loop.ts:107` 已解构但未透传）。结果主链路溯源恒为 `ch?:batchmanual`，**无法溯源到具体章节**。P1-F 的"章节溯源"在主链路名存实亡。

### ⑤ 新增 /api/babylore/clear-filled 清脏标记出口 —— ✅ 生效，无回流
- `src/app/api/babylore/clear-filled/route.ts` 全量实现 `POST {projectId,nodeId?}` → 调 `clearFilledChapters`（`fill.ts:111-126`），返回 `{ok,cleared}`。
- `clearFilledChapters` 支持全清与单章（`fill.ts:115-125`），幂等删除空列表。
- 对照 Round 10 的 P2-①，出口已补齐。

### ⑥ tables 页展示 fillErrorMeta + 清脏按钮 —— ✅ 生效，无回流
- `src/app/workspace/[projectId]/tables/page.tsx:312-319` 展示 `fillErrorMeta.kind` 与 `nodeIds`。
- `page.tsx:320-322`：仅当 `kind === "all_skipped_mislabeled"` 时显示「清理脏标记并重填」按钮，调 `clearDirtyAndRefill`（`page.tsx:183-197`）。
- 已落地。但"全跳过=误标"的判定本身有误分类（见新 P1-②）。

**回归总评**：Round 10 的 4 个 P1（B/C/E/F）与 P2-① 均在代码层落地、vitest 有守护、无回流；但 P1-F（溯源）与 P1-E（跨章同名告警）在写章自动填表主链路被一个上游传参缺失（新 P1-①）实质性削弱，需在本轮修复。

---

## 确认墨白 4 个 P1 无回流

| P1 | 定义（Round 10） | 本轮状态 |
|---|---|---|
| **P1-B** 单章 selfCheck | 单章 `babyloreFill` 不跑归属自检 | **无回流**。`fill.ts:468` 已接 `selfCheckFill`，`loop.ts:170` 回传 issues。✅ |
| **P1-C** 单 op 静默丢 | 无效 op 静默丢且无追溯 | **无回流**。`skippedOps` 已回传并测试守护（`fill.ts:352/368/383`、`fill.ops.test.ts:257-279`）。✅ |
| **P1-E** 同名静默合并 | 表内同名合并无弱告警 | **无回流但削弱**。弱告警已加（`fill.ts:692-720`），但因 P1-① 主链路 `_src` 缺章节号，该告警对自动填表产生的同名异源无法跨章节触发。⚠️ |
| **P1-F** 不可回溯 | 行无来源/时间戳，无法溯源 | **无回流但削弱**。`_src/_ts` 已写（`fill.ts:335/340/359/372`），但主链路 `chapterOrder` 未透传（`loop.ts:164`），溯源章节号恒为 `ch?`。⚠️ |

**结论**：4 个 P1 均无"逻辑回流"（代码仍存在、行为未退化为静默）；但 P1-E / P1-F 的**有效性在主链路被新缺陷削弱**，不构成干净收尾。

---

## 新发现问题

### P0（无）

本轮未发数据丢失、崩溃、并发竞态致数据损坏级别的 P0。并发竞态（见 P2-②）属理论/边界风险，非已确认的数据损坏。

### P1

#### P1-①　写章自动填表主链路未透传 `chapterOrder` → P1-F 溯源失效 + P1-E 跨章同名告警失效
- **症状**：
  1. 写章自动填表（最高频路径）写入行的 `_src` 全是 `ch?:batchmanual`，无法溯源到具体章节；
  2. P1-E 的"表内同名异源弱告警"依赖解析 `_src` 的 `ch{order}` 区分来源章节（`fill.ts:701-705`）；主链路所有行 `order` 均为 `ch?`，同名异源行永远落在同一 order 集合内，告警**永不触发**，静默放过"青龙镇/青龙"类撞名异体合并。
- **代码位置**：
  - `src/core/babylore/loop.ts:164`：`const fillRes = await babyloreFill(projectId, content, { projectLlmConfig });` —— 仅传 `projectLlmConfig`，漏传 `chapterOrder`（与 `nodeId`）。
  - 对比 `loop.ts:107` 已解构 `nodeOrder?: number;` 且 `loop.ts:183` 后续用 `nodeOrder` 判门槛，但前面调用未传入。
  - `src/core/babylore/fill.ts:465`：`const srcLabel = ch${options?.chapterOrder ?? "?"}:batch${options?.batchId ?? "manual"};` —— `chapterOrder` 缺省即 `ch?`。
  - `src/core/babylore/fill.ts:701-705`：弱告警用 `src.startsWith("ch") ? src.split(":")[0] : ...` 取 order；`ch?` 无法区分章节。
  - 注：`fill-all` 路径（`fill.ts:571` 用 `ch${ch.order}`）正常，仅单章主链路坏。
- **根因**：Round 10 在 `babyloreFill` 加了 `_src` 溯源能力，但调用方 `safeFillAfterWriting` 没把已有的 `nodeOrder` 透传进去，形成"能力具备、输入端未接线"。
- **建议改法**：`loop.ts:164` 改为
  `babyloreFill(projectId, content, { projectLlmConfig, chapterOrder: nodeOrder, nodeId })`。
  这样 `_src` 变为 `ch{真实章序}:batchmanual`，既修复溯源，又让 P1-E 弱告警在自动填表路径可正常跨章节触发。低改动、零风险。

#### P1-②　"已成功填表后重跑"被误判为 `all_skipped_mislabeled` → UI 诱导破坏性"清脏+重填"
- **症状**：一次成功的 fill-all 会把所有章节写入脏标记文件（`filledSet` 持久化）。用户再次点「一键填表」时，全部节点 `filledSet.has` 命中 → 全跳过 → `processed===0 && skipped>0` → 返回 `kind:"all_skipped_mislabeled"`、error 含"疑似旧版误标脏标记"，UI 弹出「清理脏标记并重填」按钮（`tables/page.tsx:320-322`）。点击后会 `clear-filled` 清掉全部脏标记并重新对**全部已校验章节**跑 LLM 重填（`page.tsx:183-197` → `runFillAll`）。
- **代码位置**：
  - `src/core/babylore/fill.ts:607-611`：`processed===0 && skipped>0` 一律判 `all_skipped_mislabeled`。
  - `src/app/workspace/[projectId]/tables/page.tsx:320-322`：仅该 kind 显示清脏按钮。
  - `src/core/babylore/fill.ops.test.ts:169-180` 与 `:213-227` **已把"干净重跑"也断言为 `all_skipped_mislabeled`**——说明当前是把"全部已干净"与"真误标"故意混为一谈。
- **根因**：脏标记文件是唯一信号，但无法区分"本次跳过的节点都是真实存在的正文章节（= 真的全干净）"与"跳过的节点是旧版误标的幽灵 id（= 真问题）"。诊断面过宽，把合法干净态误诊为"误标"，进而制造一条用户无法辨别、且会覆盖已校验数据的破坏性路径（LLM 重填会按 dedupe 走 update，可能用新抽取的较差值覆盖人工/历史已核验的列值）。
- **建议改法**：
  - 在 `babyloreFillAll` 的 `processed===0 && skipped>0` 分支，额外核验 `skippedNodeIds` 是否都对应 DB 中真实存在的、有正文的 `storyNode`；
  - 仅当存在"在 DB 找不到对应正文节点"的幽灵 id 时，才 `kind:"all_skipped_mislabeled"` 并展示清脏按钮；
  - 否则判 `kind:"all_clean"`（或 `ok:true` + 仅提示"已全部填表完成"），**不展示**清脏按钮，杜绝对干净数据做破坏性重填。
  - 同步修正 `fill.ops.test.ts:169-180/213-227` 的断言，使其区分两种语义。

### P2

#### P2-①　写章自动填表每次都全量跑 selfCheckFill（O(N²) 扫描）
- **位置**：`fill.ts:468` 单章 `babyloreFill` 内调用 `selfCheckFill`（`fill.ts:642-648` 把**全部**章节正文 `join` 成 corpus 全量扫描）。写一章即扫描全库正文一次；N 章写完后累计 O(N²) 文本处理。大项目（数百章）下自动填表明显变慢，并增加写章流程超时/失败面（虽 `safeFillAfterWriting` 兜底不阻断交付，但填表自身易失败）。
- **建议**：单章回填后只做"本章 delta 行"轻量校验（名字是否在**本章**正文中），全量 `selfCheckFill` 仍保留给 fill-all 末尾一次性跑；或给 `selfCheckFill` 加 `scope: 'chapter' | 'full'` 参数。

#### P2-②　babyloreFillAll 无项目级并发锁 + 按 op 多次全量写回
- **位置**：`fill.ts:544-585` 读一次 `loadFilled()`，循环内按 op `prisma.loreTable.update({data:{rows}})`（`fill.ts:394`）整体覆盖写回；`babyloreFillAll` 路由（`fill-all/route.ts`）无互斥。
- **风险**：
  1. 同一项目并发两次 fill-all：`loadFilled`→`saveFilled` 基于全文件覆盖，后写者可能覆盖前写者的进度（脏标记竞态，边缘但存在）；
  2. fill-all 运行期间若用户在表格页手动 `PUT /lore-tables/[id]` 编辑某行（`lore-tables/[tableId]/route.ts:13`），fill-all 的**内存** `t.rows` 是入口时的快照，下一次 op 写回会把手动编辑**整体覆盖丢弃**（stale 覆盖丢数据）。
- **建议**：① fill-all 入口加项目级 in-process 互斥（参考 `game-engine.ts` 已有 mutex 模式）；② 每个章节处理前 `reload` 该表最新 `rows`，或把手动编辑与自动填表在行级合并而非整表覆盖。

#### P2-③　脏标记存于 `.runtime/babylore-filled.json` 文件系统而非 DB
- **位置**：`fill.ts:87-126`。脏标记是防重复/清脏生命周期的"单一事实源"，却落在 `.runtime/` 普通 JSON 文件。
- **风险**：`.runtime` 被清、重部署、或横向多实例部署时，脏标记丢失/不共享 → 已填章节被重复重填（靠 dedupe 兜底不丢行，但浪费 token 且触发 P1-② 的破坏性重填）。对"脏标记生命周期"这一墨白核心职责而言，持久层选择脆弱。
- **建议**：将脏标记移入 DB（如 `project` 表加 `filledChapterIds String[]` 字段，或独立 `babyloreFilled` 表），与项目生命周期绑定、可备份、跨实例一致。

#### P2-④　表内同名异源弱告警缺单测守护；且其对手动填表无效
- **位置**：`fill.ts:692-720` 为新逻辑，但 `fill.ops.test.ts` / `fill.selfcheck.test.ts` 中**无**针对"表内同名 + 不同 `_src` 章节 → 触发 issues"的断言（现有 selfCheck 测试只覆盖跨表同名与归表错误）。且手动填表（`/api/babylore/fill`）同样不传 `chapterOrder`（`fill/route.ts:15` → `babyloreFill` 无 `chapterOrder`），其 `_src` 也是 `ch?:batchmanual`，弱告警对手动填表同样失效（与 P1-① 同源）。
- **建议**：补单测（构造同表两行同名、`_src` 分别为 `ch3:...`/`ch5:...` → 断言 `issues` 含"表内同名疑似异体"）；并随 P1-① 一并把 `chapterOrder` 透传给手动填表入口。

#### 延续 P2-1　delete 按全量同名过滤，可能误删
- **位置**：`fill.ts:388` `rows.filter(r => String(r[col]) !== val)` 删除**所有**同名行（含不同实体撞名变体）。
- **建议**：delete 需同时带身份列 + 类别约束，避免撞名误删。

#### 延续 P2-2　`crossTableIssues` 计数口径不一致
- **位置**：`fill.ts:739-769` 跨表同名每表 +1、单向归表告警每次 +1，与 `issues.length` 不对齐，UI 计数（`page.tsx:301`）易误导。
- **建议**：统一用 `issues.length` 或显式区分"同名对数/告警条数"。

#### 延续 P2-3　`applied===0` 分支为死代码风险
- **位置**：`fill.ts:616-620`。`failedChapters` 在 `processed>0` 时必 >0（凡 `applied===0` 的章都计入 failed），故该分支与 `partial_failed`（`fill.ts:612-615`）互斥且不可达。
- **建议**：删除死分支或补单测明确覆盖；当前不影响正确性，仅代码整洁。

#### 延续 P2-4　insert 空名行可落库
- **位置**：`fill.ts:338-343` `newVal==null` 时仍 `rows.push(row)` 并 `applied++`，生成身份列为空的伪行（与 update 守卫不一致）。
- **建议**：`newVal==null` 时不插行、记 warning（与 `fill.ts:350` update 守卫对齐）。

### P3

#### P3-①　单章手动 fill（`/api/babylore/fill`）不 markChapterFilled
- **位置**：`fill/route.ts:15` → `babyloreFill` 无 `nodeId`，不写脏标记；而写章自动填表（`loop.ts:183-189`）会标记。手动填表后跑 fill-all 会重处理该章（靠 dedupe 兜底，不丢但浪费 token）。
- **建议**：手动填表入参加 `nodeId`，成功后 `markChapterFilled`，与自动填表行为一致。

#### P3-②　单章 fill 的 UI 未展示 `selfCheckIssues`
- **位置**：`tables/page.tsx:236-254`（`runFill` 结果区）只渲染 `warnings`，未渲染单章已回传的 `selfCheckIssues`（`babyloreFill` 已返回，见 `fill.ts:475`）。单章归属/跨表问题只在 fill-all 结果里可见。
- **建议**：`runFill` 结果区补充 `selfCheckIssues` 列表渲染。

#### P3-③　delete 不记录 `_src/_ts` 且无历史表，删除不可追溯
- **位置**：`fill.ts:376-392` delete 分支只过滤，不写溯源；无 `loreRowHistory`。合并冲突/误填/幻觉写入后只能整表重置，与 P1-F "归属可追溯"目标尚有差距。
- **建议**（蓝图，非本轮必做）：独立 `loreRowHistory` 表记录每行增量，支持按章节回滚。

#### 其他透镜改动间接影响核对（阿游 / 磐石）
- **阿游（物品 owner）**：grep 确认 `src/core/game/*`、`src/app/api/agent/*` 的 `owner` 写入**不触碰 `loreTable.rows`**（全仓写 `loreTable.rows` 仅 `fill.ts`、`lore-tables/[tableId]/route.ts`、`presets/[id]/apply/route.ts`、`projects/import/route.ts`、`loop.ts:144`）。故阿游物品 owner 改动**不污染**填表数据完整性，无间接影响。
- **磐石（导入真实记账与并发）**：`projects/import/route.ts:182-186` 仅 `tx.loreTable.create` 新建表（含备份自带 `rows`，其 `_src/_ts` 溯源随导入保留，属正向），不触碰 `babylore-filled.json`，不破坏填表数据模型；并发幂等靠 `P2002` 捕获回查（`route.ts:198-210`）。**无负面间接影响**。但导入后新项目无脏标记 → fill-all 会对所有章节重跑（dedupe 兜底不丢行，仅重派生，见 P2-③ 同源脆弱性）。
- 综上，Round 10 其他透镜改动对墨白透镜负责的填表数据完整性**无回归、无间接数据风险**。

---

## 终止判定倾向（墨白透镜下是否还有 P0/P1？继续循环还是收尾？）

**本轮仍有 2 个 P1 未闭环，不满足「全员无 P0/P1」放行门槛，建议继续循环（至少一轮）。**

- **P1-①**（主链路 `chapterOrder` 未透传）：修复极小（`loop.ts:164` 一行加参），直接复活 P1-F 溯源与 P1-E 跨章告警的有效性，优先级最高。
- **P1-②**（干净态误判 mislabeled → 诱导破坏性重填）：修复为"区分真误标幽灵 id 与全干净"，消除对校验数据的破坏性路径，属脏标记生命周期核心职责。

**P0 = 0**；**P1 = 2（新）**；**P2 = 8（含 4 项延续）**；**P3 = 3**。

**建议下一轮最小收尾动作**：
1. `loop.ts:164` 透传 `chapterOrder`（ resuscitates P1-F & P1-E）→ 灭 P1-①；
2. `fill.ts:607-611` 增加"幽灵 id"甄别，干净态不再判 `all_skipped_mislabeled`、不展示清脏按钮 → 灭 P1-②；并同步修正 `fill.ops.test.ts` 对应断言；
3. 补 P1-E 弱告警单测（P2-④）。

完成上述 3 项后，墨白透镜下可望达到"无 P0/P1"，建议收尾；P2/P3 作为稳健性 backlog 跟踪即可。
