# 工坊视角：确认流程的工程落地评估

## 一、核心诊断：现有代码里有没有能当"确认"用的东西

直接结论：零件基本都在，但没有显式闸门。我翻了 `prisma/schema.prisma` 和 `src/app/api/generate/write/route.ts`，现状是——章节生成后，流式阶段写 `status: "drafting"`，后处理管线跑完直接落 `status: "completed"`，正文即刻可见、可进时间线、可召回。根本没有"作者逐章确认/打回"这一跳。

但可复用的底子很厚：`StoryNode.status` 已是 `ContentStatus` 枚举（`outline_only / drafting / completed`），天然适合扩状态；`reviewLogs`（Json 数组）和 `qualityScore`（Float，null=未评估）已经把"审校记录"和"自动评分"的存储位留好了；`StoryNodeRevision` + `editVersion` 乐观锁则意味着版本快照与并发防护已经就位。也就是说，我们要做的不是从零造轮子，而是把"已完成"拆成"待确认 → 已确认 / 已打回"这一道闸，并接上按钮。缺口只在三处：枚举缺 `pending_review / confirmed / rejected` 三态、缺少确认动作触发的 API、缺少批量确认与管理界面。

## 二、提升框架：我心目中的确认流程

按钮清单建议落在两处。其一是中栏正文区与 PostGenPanel 顶部，新增一组状态动作：「确认本章」「打回重写」「诊断/迭代」；PostGenPanel 已有"审校"Tab（ReviewTab 输出 `{passed, issues}`）和 `qualityScore`，确认按钮可直接吃这份现成结果做二次校验。其二是左栏项目树的章节节点上加状态徽标，并新增一个"批量确认"入口，支持勾选多章一键 `confirmed`。

状态机很轻：`outline_only` →（生成）`drafting` →（后处理 done）`pending_review` →（确认）`confirmed`、或（打回）`rejected` →（重写/迭代）回到 `drafting` → `pending_review`。`confirmed` 章才允许进时间线展示与批量导出，`rejected` 章保留 `StoryNodeRevision` 快照便于回滚。布局上确认动作紧贴 PostGenPanel 顶部"审校"结果之后，状态徽标复用现有左栏节点渲染，几乎不新增页面。

复用与新增清单：复用 `story/nodes/[id]` 的 PATCH 路由承载单章确认、复用 `reviewLogs` 追加确认/打回/诊断记录、复用 `qualityScore`；新增一个批量路由（如 `POST /api/story/nodes/batch-confirm`）和 `ContentStatus` 三个枚举值即可，无需新表。

## 三、最省力的可落地步骤

第一步，在 `src/core/types/index.ts` 的 `ContentStatus` 类型与 `prisma/schema.prisma` 的 `StoryNode.status` 注释里补 `pending_review / confirmed / rejected`，`prisma db push` + `generate`（注意项目规范要先 push 再 generate）。第二步，在现有 `story/nodes/[id]/route.ts` 的 PATCH 中加 `action: confirm|reject|diagnose` 分支，写 `status` 并向 `reviewLogs` push `{type, at, note, score}`，同时 `revisionCount += 1`。第三步，PostGenPanel 顶部加三按钮，调用既有 PATCH；左栏节点加状态色标。第四步，批量确认新建一个轻路由，循环复用单章逻辑。第五步，按项目双 changelog 习惯更新 `src/lib/changelog-data.ts` 与根 `CHANGELOG.md`。整个改动不涉及新数据表，落地成本约一个中等 PR。

## 四、风险提示

状态一致性是第一坑：`write/route.ts` 流式阶段每 ~300 字就异步 `update status:"drafting"`，若确认状态与后台续写/自动填表（`safeFillAfterWriting`）竞态，可能出现"已确认又被改回 drafting"。需要以 `editVersion` 乐观锁做条件更新（`where: {id, editVersion}`），确认动作带版本号校验。并发上单用户风险低，但游戏模式与手动编辑并行时仍要防脏写。tsc 门禁务必 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 零错误，枚举扩张容易漏改 `generated/prisma` 之外的类型断言，建议改完先跑一次 tsc。

## 五、与其他职能的张力

与"产品/作者体验"的张力在于：作者可能反感每章多一道确认点击，闸门要可配置（如"自动确认"开关），否则降低写作流。与"数据/召回"职能的张力在于：宝宝流自动填表（`loop.ts`）发生在 `completed` 之后，若改为 `pending_review` 才填表，会延迟记忆召回；需明确"填表在待确认阶段即跑、确认只影响可见性"。与"质量审校"职能的张力在于：他们想用 `qualityScore` 做自动拦截，而确认流程是人工闸门，二者要分清"机器建议"与"人拍板"，避免重复造状态。
