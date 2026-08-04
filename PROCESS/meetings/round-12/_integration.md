# Round 12 整合修复计划（Chair 视角）

> 复验基线：v0.46.74（commit 6a85c02，tsc 0 错误，144 vitest 全过）
> 复验输入：6 份人格透镜报告（mobai/qingyan/ayou/gongfang/qinglan/panshi）+ 1 份最强 E2E 测试员 20 点报告（e2e-report），共 7 份，全部只读、零 src 改动。
> LLM 可用现况：DB `AppSettings` 已有可用 DeepSeek key（e2e 实测真实生成成功）；用户要求改用 `deepseek-v4-flash`（SiliconFlow 模型），但 `HUAN` 环境变量在沙箱三作用域均读不到，且裸 `v4-flash` 在 api.deepseek.com 返回 400。本轮先用可用 `deepseek-chat` 跑通修复与复测；换 v4-flash 待用户补 key/确认 base URL。

---

## 一、回归总览（Round 11 修复是否稳住）

| 透镜 | 回归结论 | 备注 |
|------|----------|------|
| 墨白 | A1–A4 全 PASS | `_src` 主链路 write 已接回；continue/refine/手动填表仍漏（见 M1/M2） |
| 青砚 | A1–A5 全 PASS | 别名去重/变体收敛真实生效、无回流 |
| 阿游 | A1/A2/A3 PASS；**A4 FAIL** | GameState `@@unique` 仅 schema+client，**未落库** → 本轮 `prisma db push` 已确认同步（约束现已落库），再补 P2002 重试 |
| 工坊 | A.1/A.2 PASS | 两处 ReDoS 纵深防御生效（422 先拦截、不崩溃） |
| 清览 | A1–A4 PASS | inert 焦点陷阱真实生效（React19 布尔语义） |
| 磐石 | A1–A4 PASS | commit 限流/parse deadline/并发隔离/totalTokens 回退真实生效 |

**结论**：Round 11 的 11 P1 全部稳住、零回流。新挖问题如下。

---

## 二、Round 12 新挖问题汇总（去重合并后）

### P0（1 条，数据安全，必修）
- **G1（工坊 P0）**：含 `storyBranches` 的 `.nfproject` 备份导入必然整体失败——`projects/import/route.ts:99` 的 `strip` 把必填 `forkPointNodeId` 删掉 → Prisma 抛 Missing required value → `$transaction` 整体回滚、零项目创建。

### P1（14 条，按透镜归并）
- **M1（墨白 / e2e P1-2）**：填表 `_src` 章节段缺失（`ch?:batchmanual`）。根因：`continue/route.ts:243`、`refine/route.ts:194`、`babylore/fill/route.ts:15` 未透传 `chapterOrder`+`nodeId`（`write/route.ts` 已正确传）。同源：mobai B1/B2。
- **M2（墨白 / e2e P1-3）**：填表跨表错放（角色「萧薰儿」落「妃嫔居住建筑表」）。根因：填表无「实体类型↔表类型」对应约束。
- **Q1（青砚 / e2e P1-1）**：自动建卡把句子碎片当实体（一次生成抽 47/49 条碎片如「右手拇指」「核桃壳在他指」），污染世界书并反向注入后续上下文。根因：本地蒸馏分段器在标点/「的」处错误切分。
- **Q2（青砚 P1-1/P1-2）**：`matchNameStrict` 2字分支无「被更长 knownName 覆盖则吞并」保护→误召回（「云山」在「青云山」误触发）；3字+ 吞并仅「同起点前缀」漏「中段嵌入」（「星云剑」在「李星云剑法」误命中）。同处改写为「覆盖区间吞并」即可双修。
- **Q3（青砚 P2-1 + 清览 B3/B4）**：① `detectEntities` push 点从不填 `aliases`→批内别名去重是死代码；② 实体高亮 2字名只查头边界不查尾边界→「王林」在「王林海」误亮；③ 实体类型仅靠颜色区分（WCAG 1.4.1 色盲不可及）。三者均在 `entity-detector.ts` / `entity-highlighter.ts`，归青砚 Agent 统一处理，避免与清览冲突。
- **A1（阿游 A4/B3 + B7）**：GameState `@@unique` 现已 db push 落库；补 `game-engine.ts:416-431` 对 P2002 的幂等重试，避免并发/重试直接失败。
- **A2（阿游 B1）**：`reconcile.ts:68-83` 前端背包镜像仅处理 gain/consume/discard/equip，遇 unequip/destroy/skip 临时错乱（直到 reconcile 自愈）。补三分支与后端对齐。
- **A3（阿游 B2）**：`types.ts:66-70` `ItemChange.operation` 联合类型仅 4 值，实际运行时 7 类，类型谎言。扩为 7 值。
- **A4（阿游 P2-4/5/6，quick win）**：OP_MAP 补同义动词（吃/喝/摘下/破坏/出售…）→消告警噪音；世界卡按 `title+owner` 去重；开局 start 也建世界卡。
- **W1（工坊 P1×3）**：`parentBranchId` 未重映射→分支树悬空；`forkPoint` 依赖同时导入章节、选择性导入静默丢失；交互事务超时 60s 相对 maxDuration 300s 偏紧→提到 120s。均 `projects/import/route.ts`。
- **L1（清览 B1/B2 + P2-5/6/7/8）**：命令面板搜索框无 aria-label（`CommandPalette.tsx:153`）；Prompt 弹窗输入框无 label（`toast.tsx:292`）；暗色 select option 聚焦态、bare Modal 缺 label 警告、遮罩 aria-hidden、窄栏截断 title。
- **P_a（磐石 P1-1）**：`commit/route.ts` 缺全局 deadline，大导入被 300s 平台强杀整段丢弃。加 `COMMIT_DEADLINE_MS`+`pastDeadline`，到点停放飞、已完成照常落库、未放飞降级 ruleMerge 并报 partial。
- **P_b（磐石 P1-2）**：`parse/route.ts:244` totalTokens 仍朴素求和，与 commit 回退口径不一致→monitor 低估。对齐 `usage?.total_tokens ?? usage?.totalTokens ?? 求和`。

### P2（用户明确要求 / 监控相关，本轮顺带做）
- **P_c（磐石 / e2e P2-2/3/4，用户#16 监测面板）**：填表路径绕过 `recordLlmCall`→成本面板对填表失明；监测费用仅全局月度、无按项目；上下文预算 `usage%` 计数不自洽可能误报。磐石 Agent 负责：填表路径补记账、monitor 增加按项目 token/费用聚合、usage% 自洽。
- 其余纯优化 P2（e2e P2-5 systemPrompt 14k 冗余、P2-1 selfCheck 误报、P2-9 禁词前置拦截；mobai B3–B7；qingyan P2-3/4；ayou 无新增；panshi P2-1/2/3/4/5）→ 记录为下一轮优化，本轮若 Agent 顺手可改则改，不阻塞终止。

---

## 三、L2 任务分派（6 Agent 并行，各限文件、保 tsc 干净）

| Agent | 负责项 | 主要文件 | 验收 |
|-------|--------|----------|------|
| 墨白 | M1, M2 | continue/route.ts, refine/route.ts, babylore/fill/route.ts, core/babylore/loop.ts, fill.ts, tables/page.tsx | `_src` 形如 `ch3:batchmanual`；跨表错放改告警/路由到正确表；补单测 |
| 青砚 | Q1, Q2, Q3 | entity-detector.ts, entity-auto-creator.ts, match.ts, entity-highlighter.ts, apply-extraction/route.ts | 碎片实体被过滤；覆盖式吞并双修；别名填充+2字尾边界+非颜色线索；单测 |
| 阿游 | A1, A2, A3, A4 | game-engine.ts, reconcile.ts, types.ts, game-prompts.ts, start/route.ts | P2002 重试；前端镜像三分支；type union 7 值；OP_MAP/世界卡 |
| 工坊 | G1, W1 | projects/import/route.ts | 含分支备份导入成功；parentBranchId 重映射；forkPoint 选择性保护；超时 120s |
| 清览 | L1 | CommandPalette.tsx, toast.tsx, globals.css, Modal.tsx, explore/page.tsx(+workspace/game 遮罩) | 输入框 aria-label；select/Modal/遮罩/窄栏 a11y |
| 磐石 | P_a, P_b, P_c | commit/route.ts, parse/route.ts, llm.ts, monitor/route.ts, 成本面板组件 | commit 全局 deadline；totalTokens 对齐；填表记账+按项目费用+usage% 自洽 |

**Chair 收尾（统一门禁，Trust but verify）**：
1. 等 6 Agent 全部写入 → 亲自 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → 读 git diff 核对作用域 → 跑 vitest。
2. 双 changelog 升 **v0.46.75**（保留 v0.46.74 头条防 TS1128）；若有 schema 变更需 `prisma generate`+`db push`。
3. commit + 代理 push。
4. 派 e2e-tester 做 Round 12 综合复测（真实 LLM 走通），逐项核验 P0/P1 闭环；若有回流则再修、再测，直至满意（魔王系统循环）。

---

## 四、终止条件
本轮 P0×1 + P1×14 全修且 e2e 复测无回流 → 视为「全员无 P0/P1」达成，循环收尾。剩余纯优化 P2 记入下一轮优化 backlog，不阻塞收尾。
