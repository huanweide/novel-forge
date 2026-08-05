# Max Loop Round1·Step2 护栏修复代码审查（主审报告）

审查范围：v0.46.95 五项护栏修复（batch-confirm 收编 / confirm-guard 单测 / CI 真闸 / applyConfirm 幂等守卫）。只读审查 + 允许范围的真机验证，未修改任何文件。实测手段：`git show 2a05e71` 对账、全库 grep、重跑 7 单测、重跑 2 个验证脚本、tsx 边界分支实测、模拟无 DB 环境跑集成测试。

## 一、逐项审查结论

### 1. batch-confirm 收编 confirm-guard —— 通过
- `src/app/api/story/nodes/batch-confirm/route.ts:5` 已 import `evaluateConfirmEligibility`，`:54-59` 统一评估，内联阈值/gradeOf 已删（`git show 2a05e71` 该文件 -39 行）。
- 残留扫描：`src/app/api/story/nodes/` 与 `src/core/` 下已无内联 `QUALITY_PASS_THRESHOLD` / `gradeOf` 实现。唯一 60 其余出现点：`src/lib/quality-analyzer.ts:463/478`（analyzer 内部硬编码，非 confirm 子系统）。
- 四入口对账：auto-confirm（route.ts:61）、batch-confirm（route.ts:55）、game-engine（game-engine.ts:619）三处均走 guard，空正文/过短拦截生效。**例外**：`src/app/api/story/nodes/[id]/route.ts:158-185` 的 PATCH 手动 confirm 不经 guard、也无空正文拦截——但这是人工点击动作，质量盲放行属设计语义（人工有权定稿低分章），风险低，记观察项。
- 真机重跑 `scripts/agent-batch-guard-verify.cjs` 全绿：空正文章（伪造 qualityScore=90）被 batch 与 auto 双入口一致拦截，优质章正常放行。

### 2. confirm-guard 单测 —— 部分通过（存在实测漏洞 + 覆盖缺口）
- 7 用例重跑全绿（`vitest run src/core/confirm-guard.test.ts` 7/7）。
- 覆盖缺口经 tsx 实测确认：**非有限分数漏过是真漏洞**。`evaluateConfirmEligibility({content:长正文, qualityScore:NaN})` → `eligible:true`（`confirm-guard.ts:53` 处 `NaN < 60` 为 false 绕过拦截，`gradeOf(NaN)="D"`）；`Infinity` 同样放行且判 A。建议 `confirm-guard.ts:38` 采信处补 `Number.isFinite` 检查并拦截。非法类型（字符串 `'90'`）实测回退本地重算 → 行为正确但未测；`content:null` 实测正确拦截，亦未测。
- 单测 #7 前提成立且严重：实测 `analyzeQuality("")` → `overallScore:100 / passed:true / grade:"A"`，空文本被六维正则"六维全部达标"。若无显式空正文拦截，空章会以满分被确认——双防线是必要的，防的就是 analyzer 分数失灵。

### 3. CI 真闸 —— 部分通过（门禁是真的，但套件在 Actions 上必红）
- `ci.yml` 已去全部 `|| true`（lint 豁免保留并带 `::warning::`，合理）；tsc --noEmit / npm test / lint:colors / build 均为硬门禁，步骤语法正确，`on:[push,pull_request]` 合理。本地 `tsc --noEmit` exit 0。
- **关键问题**：`npm test` 包含 `src/core/babylore/fill.selfcheck.test.ts`——真实 DB 集成测试（硬编码 PROJECT_ID，需已 seed 的 geo 表，beforeAll 直查库）。Actions 环境无 postgres service 也无 DATABASE_URL，我以 `DATABASE_URL=postgresql://postgres@127.0.0.1:1/none` 模拟实测：该文件多个用例以 `PrismaClientKnownRequestError` 失败 → `npm test` 门禁在干净 runner 上必红。"真闸"成立但红在抵达。需补 postgres service + seed，或对该测试 `skipIf(!process.env.DATABASE_URL)`。
- 次要项：`npm ci || npm install` 掩盖 lockfile 漂移；`src/generated` 被 gitignore，靠 npm ci 的 postinstall（prisma generate）补类型，可过但脆弱；build 在无 DB 环境是否触发静态数据 DB 查询未验证。

### 4. applyConfirm 幂等守卫 —— 部分通过
- 守卫本体正确：`confirm-guard.ts:101-114` updateMany 条件更新（status in drafting/pending_confirm），READ COMMITTED 下并发第二条会重评 WHERE → count=0，不重复 increment/append。真机重跑 `agent-idempotency-verify.cjs` 绿（revisionCount 与日志 1→1）。
- 反作用对账：
  - game-engine：applyConfirm 前先 `update status="drafting"`（game-engine.ts:630-638）→ 守卫必过，无副作用。
  - batch-confirm：**不用 applyConfirm**，用无状态条件的 `storyNode.update`（batch-confirm/route.ts:81）→ 并发双击存在 TOCTOU 双 increment/双日志，幂等守卫并未覆盖它（任务说明"batch 用自己的确认逻辑"成立）。
  - auto-confirm：status 是自由字符串（代码见 outline_only/drafting/pending_confirm/confirmed/completed/reviewing）。若节点处 reviewing 等遗留态且达标 → applyConfirm count=0，但 auto-confirm/route.ts:73-79 **不检查返回值**仍 push 进 confirmed → 响应误报已确认、DB 实际未变。轻微数据一致性错报。
  - 填表副作用：safeFillAfterWriting 在守卫之前执行（confirm-guard.ts:83-97），极端并发下会双跑填表（守卫只护 increment/log，不护填表）。

### 5. 验证脚本回归 —— 通过
两个脚本在 dev 3001 上重跑均绿（见上）。

## 二、发现的残留 / 风险

1. **P1：NaN/Infinity 非有限分数可被放行确认**（confirm-guard.ts:38-62），分支未测且语义反常（应拦截却放行）。
2. **阈值软分裂**：analyzer 内部硬编码 60（quality-analyzer.ts:463/478），仅靠注释声明与 `QUALITY_PASS_THRESHOLD` 一致，未共享常量。
3. **batch-confirm 无幂等/并发保护**（TOCTOU），auto/batch 的填表副作用均不在幂等保护内。
4. **auto-confirm 误报 confirmed**：不消费 applyConfirm 返回值，对非 drafting/pending_confirm 态节点可能虚报。
5. **CI 套件含 DB 集成测试**，Actions 上 npm test 必红；`npm ci || npm install` 兜底。
6. PATCH 手动 confirm 无空正文拦截（低风险，人工动作）。

## 三、后续审查方向

1. **质量分盲测**：analyzer 对空文本给 100/A 是"分数失灵"实证，应对六维算法补样本盲测（短文本过誉、纯对话体、无标点长句等），并把 `Number.isFinite` 纳入 guard 与单测。
2. **填表副作用对账**：safeFillAfterWriting 在 auto/batch/PATCH/game 四处触发，需审计填表幂等性、失败补偿与并发双跑影响。
3. **状态机收敛**：status 自由字符串 + reviewing 遗留态，建议枚举化并统一消费 applyConfirm 返回值。
4. **CI 可运行化**：补 postgres service + seed 或 skipIf，去掉 `npm ci || npm install` 兜底，验证 build 在无 DB 环境可过。
5. **阈值单一真相收口**：将 analyzer 的 passed/grade 阈值引到 QUALITY_PASS_THRESHOLD 常量，加一致性单测钉死。
