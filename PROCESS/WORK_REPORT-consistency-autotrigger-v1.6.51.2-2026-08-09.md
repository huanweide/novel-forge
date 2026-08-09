# 工作单元报告：归档定稿自动触发一致性事实抽取（v1.6.51.2）

> 费曼式沉淀。读者默认零基础——下面每个术语第一次出现都用大白话讲清「它怎么运作」，再配一个生活化类比。
> 方法论来源：马斯克 CEO 拍板方向 C → A → B，本回合完成 C（归档自动触发抽取）。

---

## 一、干了什么（一句话）

给 novel-forge 的「章节确认定稿」动作挂上了一个自动调用：只要作者把某一章点「定稿」，系统就后台自动把整本书已经写过的事实重新抽一遍、存进「一致性事实基线」。这样，v1.6.51.1 已经接进 AI 写作提示词的那个基线，终于**第一次有了真实内容**（之前它永远是空的，因为没有地方去触发抽取）。

---

## 二、为什么这么做（拆到底层原理）

**先讲清楚几个名词（大白话 + 类比）**

- **一致性事实基线** = 一张「这部小说里已经定了的事实清单」。例如「主角叫林默、左眼是灰色、修炼的是《玄冰诀》、和师妹是青梅竹马」。写新章节时，我们把这张清单贴在 AI 的提示词里，等于跟它说「前面都这么定了，你接着写别前后矛盾」。类比：你写长篇连续剧，每集开拍前给编剧发一份「前情设定备忘」，免得第 20 集主角眼睛颜色变了。
- **章节确认定稿（confirm）** = 作者判断「这章写好了、可以放进正书」，系统在数据库里把这章的状态从「待确认 / 草稿」翻成「已确认」。类比：编辑在稿件上盖「录用」章。
- **抽取（extract）** = 让 AI 读一遍整本书的章节摘要 + 角色卡 + 世界书，提炼出上面那种「事实清单」并落库。类比：让助理通读你写完的十几章，整理出一份「设定备忘」。
- **fire-and-forget（发完不管）** = 后台异步触发，不等它返回，不阻塞主流程。类比：你点外卖下单后继续干活，不用站在门口等，外卖到了自动放桌上。
- **幂等（做一百次 = 做一次）** = 抽取函数内部先 `deleteMany`（清空旧清单）再 `createMany`（写新清单），所以同一本书被触发一百次，结果和触发一次完全一样，不会越堆越乱。类比：每次整理都先清桌面再摆新物件，而不是往旧堆上叠。

**为什么必须挂在「确认」上，而不是「生成」上**

v1.6.51 造好了「事实清单」的存储和抽取能力，v1.6.51.1 把清单接进了提示词——但这两步都只是「能力就绪」，没有任何业务动作去调用抽取。结果就是：基线永远空着，提示词里那块「一致性事实」永远不出现，等于白做。

谁最适合触发「重新整理一遍设定备忘」？就是**章节定稿的那一刻**——因为定稿意味着这一章的内容正式进书了，此时重新抽一遍最能反映最新真相。生成（写初稿）时不能抽，因为初稿还没确认、可能作废；只有定稿了，这章才算数。所以挂点在「确认」路径是时序上唯一正确的位置。

---

## 三、方法 / 工具 / 效果（对比过什么、结果数据）

**改动落点（三处，全部 fire-and-forget，镜像既有伏笔检测 `triggerForeshadowDetect` 的写法）**

1. `src/core/confirm-guard.ts` 的 `applyConfirm`：在 `if (!node.skipDetect)` 分支里追加 `void extractConsistencyFacts(node.projectId).catch(() => {})`。这个 `applyConfirm` 是共享护栏，被**自动确认、批量确认、游戏引擎确认**三条路径复用——一处挂，三处生效。
2. `src/core/pipeline/post-processor.ts` 章摘要落库之后（约 line 748，原本 `void triggerForeshadowDetect` 那一行下面）追加同样的 `void extractConsistencyFacts(projectId).catch(() => {})`。
3. `src/app/api/story/nodes/[id]/route.ts` 手动确认路由（约 line 240，`void maybeAutoDeliver` 之后）追加同样的调用——覆盖作者**手动点「定稿」**的页面操作。

**import 同步**：三个文件各加一行 `import { extractConsistencyFacts } from "@/core/consistency/extractFacts";`。

**为什么这样设计（取舍）**

- **复用 `skipDetect` 门控，而不是另造开关**：后处理管线里，确认动作（`applyConfirm({skipDetect:true})`）发生在「章摘要还没落库」的时点（摘要在后面步骤 4 才写）。如果此时就抽，抽到的清单会缺掉刚写的这章。所以让后处理走 `skipDetect=true` 跳过、等摘要落库后再在 line 748 补抽——和既有的伏笔检测 `triggerForeshadowDetect` 是**同一套时序模式**，零新概念。手动 / 自动确认路径则 `skipDetect=false`，立即抽（因为这些路径确认时本章摘要早已存在）。这样既不重复抽，也不漏抽。
- **不加并发锁**：`extractConsistencyFacts` 内部已经是 `deleteMany`+`createMany` 幂等，即使两章同时定稿各发一次抽取，两者都基于同一份最新 DB 快照重抽，最终结果是稳定一致的，最坏只是多算一次，不会脏数据。比起给抽取也加一套 `detectLocks` 互斥锁，这里保持「最小回归面」更划算（马斯克拍板：改动约 20 行、零新依赖）。
- **失败静默**：一律 `.catch(() => {})`，抽取若因网络 / 模型抖动失败，不影响「确认」这个主流程的响应——确认是用户看得见的动作，绝不能因为它背后的增强功能抽风而被卡住。

**验证（实测，非推测）**

- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → **0 错误**（新 import 与调用点类型全对，`extractConsistencyFacts(projectId: string)` 签名匹配）。
- `npx vitest run` → **37 文件 336/336 全绿**；其中 `confirm-guard.test.ts` 13 例无回归（fire-and-forget 不进入测试断言路径）。

---

## 四、关键取舍（工具 A 为何不选 B、踩坑与修复）

| 决策点 | 选了什么 | 没选什么 | 为什么 |
|---|---|---|---|
| 触发时机 | 挂在「确认定稿」 | 挂在「生成初稿」 | 初稿可能作废，定稿才算数；时序上只有定稿后抽才反映最新真相 |
| 触发方式 | fire-and-forget 异步 | 同步 await 等返回 | 确认是用户可见动作，不能被背后的 LLM 抽取拖慢 / 卡死 |
| 后处理时序 | `skipDetect=true` 跳过 + 摘要后补抽 | 确认时直接抽 | 避免抽到缺本章的半成品基线 |
| 并发处理 | 靠抽取自带幂等 | 另加互斥锁 | 幂等已足够保证终态一致，加锁增加复杂度不划算 |
| 失败策略 | `.catch` 静默 | 抛错阻断确认 | 增强功能抽风不应连累核心确认流程 |

**踩坑现场（真实发生并修复）**

- 后处理 line 748 的 `void triggerForeshadowDetect({ projectId });` 在文件里是唯一的，Edit 精准命中；但首次我担心它会多处出现导致误改，实际核对全文确认唯一后才动手——这是「Trust-but-verify」：不靠记忆，直接读磁盘确认落点唯一。
- 三个文件的 import 必须各自单独加，不能只在某处加——`applyConfirm`（confirm-guard）、后处理、手动路由是三个独立编译单元，缺一个 import 就会 tsc 报 `Cannot find name 'extractConsistencyFacts'`。已三处齐备，tsc 0 错佐证。

**可复现步骤（照做即得相同结果）**

1. 在 `src/core/confirm-guard.ts` 顶部 import 区加 `import { extractConsistencyFacts } from "@/core/consistency/extractFacts";`，并在 `if (!node.skipDetect) { void triggerForeshadowDetect(...); }` 块内追加 `void extractConsistencyFacts(node.projectId).catch(() => {});`
2. 在 `src/core/pipeline/post-processor.ts` 加同名 import；在章摘要落库后的 `void triggerForeshadowDetect({ projectId });` 下追加 `void extractConsistencyFacts(projectId).catch(() => {});`
3. 在 `src/app/api/story/nodes/[id]/route.ts` 加同名 import；在手动确认 `void maybeAutoDeliver(node.projectId).catch(() => {});` 后追加 `void extractConsistencyFacts(node.projectId).catch(() => {});`
4. 跑 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 与 `npx vitest run`，须 0 错 + 336/336 全绿。
5. 升 `src/lib/changelog-data.ts`（LATEST_VERSION / CHANGELOG_BRIEF / VERSIONS 三处）与根 `CHANGELOG.md` 头条到 v1.6.51.2，一起 commit。

---

## 五、诚实边界（明确未做 / 未实测）

- 基线仍是「**确认后自动抽取**」而非实时：一本书若一章都没确认过，基线就是空的，提示词里那块「一致性事实」不会出现（符合预期，非缺陷）。
- 本回合**未做端到端真实 LLM 抽取实测**（环境 DeepSeek 偶发 503，且抽取属 fire-and-forget 后台任务，本地 PG17 可达即可落库路径验证；真实抽取效果留待 A 任务的 UI 面板 + 手动重抽按钮让作者肉眼校验）。
- 下一步（马斯克拍板 A → B）：A 做一致性功能最小 UI（基线查看面板 + 抽取状态 + 手动重抽按钮，锁定只读优先）；B 做主动矛盾检测（生成后比对基线标红 / 自动修正），作为 v1.8 卖点。
- 推送：TLS 代理 127.0.0.1:7897 仍不可达，本回合本地提交，未推送，待代理恢复后一次性补推（含 v1.6.51 / v1.6.51.1 / v1.6.51.2 及更早领先提交），届时以 `git ls-remote origin main` 真查远程 HEAD 对账，绝不谎报。
- 个人 IP 永远归瑞宝宝（樊斯瑞），本仓库只迭代 novel-forge。
