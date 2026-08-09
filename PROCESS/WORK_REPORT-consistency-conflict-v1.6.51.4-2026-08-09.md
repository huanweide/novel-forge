# 工作单元报告：主动矛盾检测（v1.6.51.4 · B 任务）

> 费曼式沉淀。读者零基础——术语第一次出现用大白话讲清「怎么运作」+ 类比。
> 本回合是「一致性事实基线」垂直切片的最后一棒（C 自动抽取 v1.6.51.2 → A 可见面板 v1.6.51.3 → B 主动矛盾检测 v1.6.51.4）。前三棒已让基线「自动产生 + 作者看得见」，本棒让它「真正发挥作用」——自动揪出前后矛盾。

---

## 一、干了什么（一句话）

给系统加了一个「矛盾警察」：每次新章节写定稿，后台自动把这一章的内容和「全书已确立的设定备忘（基线）」比对，发现「这章说的和之前定的不一样」就记下来、在面板里用红色标出来，作者点「已修正」或「忽略」就能把它消掉。**只报警、不改你的稿子**——创作主权始终在作者手里。

---

## 二、为什么这么做（底层原理）

**名词大白话**

- **矛盾（冲突）** = 新书章和旧设定打架。例如基线记「主角左眼灰色」，新章写「他漆黑的左眼」——这就是一条冲突。类比：你团队共享一份「客户档案」，有人在新邮件里写了和客户档案矛盾的生日，系统标红提醒，但不替你改档案。
- **标红不改写** = 系统只负责「亮红灯」，绝不替作者动笔改正文。类比：导航仪提示「前方限速 60」，但不会替你踩刹车。
- **落库 / 持久化** = 把冲突存进数据库，刷新页面还在，能逐条处理、能留历史。类比：待办清单写在本子上，不是脑子记完就忘。
- **fire-and-forget（发完不管）** = 检测在后台跑，不卡住「章节生成完成」这个作者看得见的动作。类比：你交稿后，编辑助理在后台核对设定，不让你干等。

**为什么必须落库、不能只在生成时弹一下**

冲突是「异步审阅工作流」：作者可能写完十章才回来统一看矛盾。如果只在生成那一刻闪一下就消失，等于没做。落库 + 面板常驻列表，作者随时能开面板逐条清，这才是这个功能存在的意义。

**为什么只标红不改写（马斯克拍板的核心）**

作者才是作品的意志主体。自动改写一旦下笔，就是篡创作主权，而且 AI 改写必然引入新噪声（可能改出新的矛盾）。信号该亮红灯，不该替人踩刹车——这是产品伦理的第一性原理。

---

## 三、方法 / 工具 / 效果（对比过什么、结果数据）

**代码结构（4 文件：2 新建 + 2 改）**

1. 新建 `prisma/schema.prisma`：`ConsistencyConflict` 模型 — `id, projectId(+级联删除), nodeId(章节), factId?(可空关联基线事实), category, description(冲突说明), excerpt(新章摘录), status(open/resolved/ignored), createdAt/updatedAt`，加 `@@index([projectId, nodeId, status])` 便于按章清旧。Project 加 `consistencyConflicts ConsistencyConflict[]` 关系。
2. 新建 `src/core/consistency/detectConflicts.ts`：
   - `parseConflictsFromLLM(text)` —— **纯函数**，剥 code fence、截数组、容错解析（与 `parseFactsFromLLM` 同构），独立单测。
   - `detectConsistencyConflicts(projectId, nodeId, chapterContent)` —— 编排：拉基线（无基线直接返回不误报）→ 拼「基线 + 新章」提示词 → 调既有 LLM 客户端 → 解析 → **先 deleteMany 同章 open 冲突再 createMany**（幂等，同章重测不堆积）→ 返回。
3. 改 `src/core/pipeline/post-processor.ts`：章摘要落库后、抽取调用下一行，加 `void detectConsistencyConflicts(projectId, nodeId, content).catch(() => {})` —— 与抽取**同位置同模式** fire-and-forget。
4. 新建 `src/app/api/projects/[id]/consistency/conflicts/route.ts`：`GET ?status=open` 列冲突；`POST {id,status}` 更新状态，**含 project 归属校验**（冲突必须属于该 project，防越权）。
5. 改 `src/components/workspace/ConsistencyPanel.tsx`：事实列表下加「冲突（需处理）」红色区块，列出 open 冲突（说明 + 摘录 + 关联基线事实 + 「已修正」「忽略」按钮），按钮 POST 更新后从列表移除；加载时一并 `fetch` open 冲突。

**为什么 status 用 String 而非 Prisma enum**

- 三态语义（open/resolved/ignored）用 String + 应用层 `VALID_STATUS` 数组校验完全满足。
- 用 enum 要在 PG 建枚举类型 + 生成客户端多一层，迁移与类型边界都更脆。String 是「最小回归面」的更稳选择（符合马斯克「删减到本质」）。

**验证（实测）**

- `npx prisma db push` → 本地 PG17（127.0.0.1:5432）"database is now in sync"，`ConsistencyConflict` 表已建；`prisma generate` → 客户端 7.8.0 已含该类型。
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → **0 错误**。
- `npx vitest run` → **38 文件 341/341 全绿**（新增 `detectConflicts.test.ts` 5 例：命中/无/可选 factId/容错/坏 JSON；336→341）。

---

## 四、关键取舍（B 为何这么切、踩坑与修复）

| 决策点 | 选了什么 | 没选什么 | 为什么 |
|---|---|---|---|
| 改写 vs 标红 | 只标红 | 自动改写正文 | 创作主权归作者；自动改写必引入新噪声（马斯克拍板） |
| 存储 | 落库 ConsistencyConflict | 生成时瞬时返回 | 异步审阅工作流，刷新即丢等于没做 |
| 触发 | post-processor fire-and-forget | 同步阻塞生成 | 不卡作者可见的「生成完成」响应 |
| UI | 扩展现有面板加区块 | 新开子 Tab | 同一视线看「基线↔冲突」对照，最小表面积 |
| status 类型 | String + 应用校验 | Prisma enum | 降 DB 迁移与生成客户端风险 |
| 裁剪 | 砍 severity、factId 可选、三态 | 分级/批量/去重/通知 | 最小可交付，先跑通闭环不空转 |

**踩坑现场（真实发生并修复）**

- `prisma db push --skip-generate` 在本机 Prisma 版本不被支持，直接打印帮助、未推送（PUSH_EXIT=1）。修复：去掉该标志重跑 `npx prisma db push`，664ms 同步成功；`--skip-generate` 本意是跳过生成，但 generate 已单独跑过，去掉无碍。**教训**：先用帮助确认标志可用性，别假设旧参数仍有效。
- 端点路径 `projects/[id]/consistency/conflicts/route.ts` 是嵌套路由，`params.id` 取的是 `[id]` 段的 projectId（Next App Router 向上匹配动态段），与事实端点 `consistency/route.ts` 共用同一 projectId，归属校验逻辑一致。

**可复现步骤（照做即得相同结果）**

1. `prisma/schema.prisma` 加 `ConsistencyConflict` 模型 + Project 关系数组；跑 `npx prisma db push` 与 `npx prisma generate`。
2. 新建 `src/core/consistency/detectConflicts.ts`：`parseConflictsFromLLM`（纯函数）+ `detectConsistencyConflicts(projectId, nodeId, content)`（拉基线→LLM→清旧建新）。
3. `post-processor.ts` 加 import 与 `void detectConsistencyConflicts(projectId, nodeId, content).catch(()=>{})`（接在抽取调用后）。
4. 新建 `conflicts/route.ts`：GET 列表（status 过滤）+ POST 更新（含 project 归属校验）。
5. `ConsistencyPanel.tsx` 加冲突区（fetch open 冲突 + 标红 + 已修正/忽略按钮 POST 后移除）。
6. 写 `detectConflicts.test.ts`（5 例）；跑 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`（0 错）+ `npx vitest run`（341/341）。
7. 升 `changelog-data.ts`（LATEST_VERSION / CHANGELOG_BRIEF / VERSIONS）+ 根 `CHANGELOG.md` 头条到 v1.6.51.4，一起 commit。

---

## 五、诚实边界（明确未做 / 未实测）

- **未做端到端真实 LLM 检测实测**：本回合只过类型检查 + 单测（纯函数已验）+ 契约对齐（端点/落库逻辑已与路由代码核对），未起 dev server 用真实小说跑一遍「生成→出冲突→面板标红」全链路（环境 DeepSeek 偶发 503，且检测属 fire-and-forget 后台）。逻辑与字段契约已对齐，端到端验证留待可联网/可起服务时补。
- **面板只读优先**：不提供编辑/删除基线事实本身的入口；冲突只做状态流转（open→resolved/ignored），不反向改事实。
- **一致性切片收官**：C（自动抽取）A（可见面板）B（主动检测）三棒完成，构成 v1.8 的核心护城河卖点。下一步朝 v1.8 的其余里程碑（由马斯克 CEO 拍板优先级）待排期。
- 推送：TLS 代理仍不可达（直连 + 7897 均 `TLS connect error`），本回合本地提交，未推送；代理恢复后以 `git ls-remote origin main` 真查远程 HEAD 对账后一次性补推（含 v1.6.51 / v1.6.51.1 / v1.6.51.2 / v1.6.51.3 / v1.6.51.4），绝不谎报。
- 个人 IP 永远归瑞宝宝（樊斯瑞），本仓库只迭代 novel-forge。
