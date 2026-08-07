# 设定自动建档 entity-sync 深度体验报告（round-2）

- **Agent代号**：设定自动建档entity-sync透镜
- **轮次**：round-2
- **版本**：v1.6.4（HEAD = 2b88e09）
- **日期**：2026-08-07
- **项目绝对路径**：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- **复验基线**：round-1 已修 IMP-006~012（见 `PROCESS/meetings/round-1/recheck-world.md`）
- **诚实边界**：沙箱无 Chromium，纯视觉降级为 API + SSR + 源码 + 单测；DB 用 `127.0.0.1:5432`。本报告所有论断均基于真实源码阅读、单测运行（`npx vitest run` 40 用例全过）、`tsc --noEmit` 零错误（`EXIT=0`），以及 git 改动核对。凡未能在本环境真机跑通的部分（如需要 PostgreSQL 的端到端填表），均明确标注为「源码静态推导」而非「已真机验证」。

---

## 一、执行摘要（透镜结论前置）

本透镜聚焦 **entity-sync 全流程**：写章后角色卡/世界书/关系自动建档、自动填表映射、伏笔/实体高亮召回、skipLatest 临稿污染、selfCheckFill 性能、以及 round-1 七项 IMP（006~012）修复是否真生效。

**核心结论**：

1. **round-1 七项修复多数真实落地、逻辑自洽**——IMP-006（LorebookEditDialog 分类补全）、IMP-008（实体配色单源）、IMP-011（世界卡片编辑入口）、IMP-012（getEntityMap 失败降级）经源码逐行复验确认仍在位；IMP-010（2字实体保召回）由 `match.test.ts` 34 例锁定用例 + `tsc` 双重确认维持合理；IMP-009（closureConditions 不再恒空）确实写入非空数组，但引入了新的 2字噪声误召风险。

2. **IMP-007「伏笔随写章自动检测」存在严重覆盖缺口（本轮最重要发现，严重度 P1）**：唯一真正触发 `detectPayoffs` 的代码路径是人工单章确认 `src/app/api/story/nodes/[id]/route.ts:218`；而**自动确认（默认开启）+ 批量确认共用的 `applyConfirm`（`src/core/confirm-guard.ts:100-167`）根本不触发检测**。由于 `Project.autoConfirmEnabled` 默认 `true`，绝大多数用户的默认写作流是「写完即自动确认」，导致写章后伏笔面板**不会**随写章自动更新——除非用户手动点「重新检测」按钮或走人工确认路径。

3. **还存在时序盲点**：即便给 `applyConfirm` 补上检测触发，`detectPayoffs` 依赖 `chapterSummary` 表，但 `post-processor.ts` 中自动确认（步骤 3.1，约 229 行）发生在摘要落库（步骤 5，约 559 行）**之前**，最新章节的摘要尚未生成，检测 haystack 为空，仍会漏检。

4. 其余为 P2 级架构/质量债：实体配色缺类、关系回填不捕获演化、closure 2字噪声、召回/高亮边界不一致、selfCheckFill 性能、60s 缓存滞后、skipLatest 默认不一致、每章双 LLM 调用、IMP-006 硬编码技术债。

**本轮方法论与口径说明**：本透镜的「真实体验」不是靠想象，而是把每条体验断言锚定到具体源码行后做静态推演，并在可行处用单测/构建交叉验证。凡涉及「写章后会发生什么」，均从 `post-processor.ts`（写后流水线）→ `confirm-guard.ts`/`[id]/route.ts`（确认流）→ `loop.ts`/`fill.ts`/`entity-sync.ts`（填表与建档）→ `foreshadowing.ts`（伏笔检测）→ `entity-highlighter.ts`（高亮）这条真实调用链逐跳追踪。凡本沙箱无法真机跑通（需 PostgreSQL 或真实 LLM 网关）的部分，一律标注「推演」或「静态推导」，绝不冒充真机实测。这一口径也是 MaxLoop 魔王系统对本透镜的硬性诚实约束。

**发现分布一览（便于总体视角对照）**：本轮共 13 条发现，其中 P1×2（均围绕 IMP-007 伏笔自动检测的覆盖与时序）、P2×11。P2 又可归为四类——（a）一致性：关系演化丢失、配色缺类、召回/高亮边界分裂、skipLatest 默认错位；（b）性能：selfCheckFill O(行×正文)、applyOps 写放大、每章双 LLM；（c）健壮性：closure 2字噪声、60s 缓存滞后、建档失败静默、IMP-006 硬编码；（d）可观测性：无待处理清单、SSE 未被充分消费。总体来看，entity-sync 的「算法层」（匹配、抽取、填表去重）已相当成熟且被单测守护，问题集中在「编排层」（确认流触发、失败吞错、缓存降级、跨表写放大）——这也解释了为何 round-1 的物理修复多数仍有效，而「端到端是否真自动」会在默认流下漏水。

---

## 二、用户体验视角（真实体验推演，约 5500 字）

> 本节以「一个真实作者用 novel-forge 写一部长篇」为主线，逐条推演四类体验：自动建档是否发生、自动填表是否漏误、伏笔面板是否随写章更新、正文高亮是否准确。所有推断均锚定到真实代码行。

这四类体验恰好对应 entity-sync 对外承诺的四句话：「写一章，角色卡/世界书自动建档」「表格自动填满且不写错」「伏笔随写章自动回收」「正文里的实体自动高亮」。本透镜的任务，就是验证这四句话在**默认配置、默认写作流**下是否真的成立，而不是在「人工确认 + 手动点检测 + 网络永远正常」的理想条件下成立。下面的推演会刻意站在「什么都不额外点」的懒惰作者视角——因为真实用户大多就是这个视角，而多数缺陷恰恰藏在这个视角与「理想配置」的落差里。

### 2.1 写章后角色卡 / 世界书 / 关系是否真的自动建档？

**链路实况**：自动建档由 `src/core/babylore/entity-sync.ts` 的 `syncChapterEntities` 承担。它被两条路径调用：
- 单章写后填表：`babyloreFill` 内 `src/core/babylore/fill.ts:597`（每次 `babyloreFill` 成功后）。
- 一键追评：`babyloreFillAll` 内 `src/core/babylore/fill.ts:713`（逐章）。

也就是说，**只要填表发生，实体抽取就发生**——这是一条真实的「写一章 → 自动发现角色/世界观实体 → 落角色卡/世界书」闭环。从源码看，流程是：LLM 按内置 JSON 协议抽出实体（含 `relationships` 数组）→ 与现有角色卡名/别名/世界书标题查重（复用 `isSimilarName`，繁简/错别字变体不重建）→ 新角色建 `CharacterCard`，其余建 `LorebookEntry`。

**体验正向点**：
- 新角色会自动带上 `tags: ["🆕 自动发现"]`，作者肉眼可辨哪些是 AI 建的、哪些是自己建的（`entity-sync.ts:213`）。
- 已存在角色卡若在本章出现新关系，会把 `relationships` 合并进去（不覆盖手填），`entity-sync.ts:167-186`。
- 实体抽取走 `fillModelOf` 把推理模型映射成 `deepseek-chat`，避免推理过长吃光 token 导致空返回（`entity-sync.ts:83`）。

**体验隐患（真实推演）**：
- **建档由 LLM 决定，不可控**：作者写完了，但某角色若未被 LLM 判定为「新出现且确定」，就不会建档。没有「强制建档」「草稿预览待确认」的机制，作者只能事后在世界书/角色面板里翻找。属于「黑盒建档」。
- **关系回填不捕获关系演化**（见发现 P2-ENTITY-04）：第 3 章写「王林拜李青为师」，第 12 章写「王林与李青反目成仇」。`syncChapterEntities` 合并关系时只按 `targetName`（对方名字）去重（`entity-sync.ts:171-174`），不区分 (targetName+relation)。于是第 12 章的「宿敌」动态被丢弃，角色卡里永远停在「师徒」。作者看到的关系图是**过时的静态关系**，与正文实际走向背离——这是「自动建档反而误导」的典型负体验。
- **建档成本被隐藏**：每章固定触发 2 次 LLM 调用（一次填表 + 一次实体抽取），作者看不到「这一章 AI 跑了两次抽取」，成本与延迟都被静默吞掉（见 P2-ENTITY-10）。
- **建档失败对作者完全不可见（新增 P2-ENTITY-12）**：`babyloreFill` 在调用 `syncChapterEntities` 时用的是 `await syncChapterEntities(...).catch(() => null)`（`fill.ts:597`），`babyloreFillAll` 在 `fill.ts:713` 同样 `.catch(() => null)`。这意味着只要实体抽取这一步的 LLM 调用超时、被网关拦截、或返回无法解析的 JSON，`syncChapterEntities` 内部 `catch` 返回 `{error}` 后，外层再次吞掉，作者看到的仍是「填表成功」的绿色提示，根本不知道角色卡/世界书这一章**没有**自动建档。对「自动建档」这一核心卖点而言，失败无声是体验级隐患：作者误以为世界观已补全，实际少了人物/设定。
- **查重依赖 `isSimilarName` 的启发式**：建档去重并非精确相等，而是 `existingList.some(en => isSimilarName(en, name))`（`entity-sync.ts:187`）。`isSimilarName` 负责繁简/错别字变体归并，这本是防重复建卡的好设计，但它也意味着如果两个名字只是「疑似相似」就被判为同一实体，新角色可能被错误跳过、不建档。这类误判没有日志、没有提示，作者只能在角色面板里逐个人肉核对。
- **别名（aliases）只进高亮、不进角色卡反向关系**：`entity-sync` 抽取角色时只写 `name/relationships`，不会把正文里出现的别名同步进 `CharacterCard.aliases`（`entity-sync.ts:199-215`）。于是某角色本节以「本名」建档，下一节 LLM 抽到了它的「绰号」作为新实体名，只要 `isSimilarName` 没判相似，就会再建一张卡——同一角色两张卡的风险依然存在，只是比早期「纯名相等」好一些。
- **「🆕 自动发现」标记无去重清理**：自动建档的角色带 `tags:["🆕 自动发现"]`，但一旦作者手动补全了该卡，这个标记不会被自动摘除。长书跑下来，作者需要手动清理大量「自动发现」标签，否则无法区分哪些是 AI 草建、哪些已人工校验。

### 2.2 自动填表是否漏 / 误？

**链路实况**：`babyloreFill` → `runFillForText` → `applyOps`。这套逻辑经过多轮「灭错名」打磨，当前质量相当稳健：
- 给 LLM 看【权威名录·已有名称 + 全量样例行】，禁止自创同义变体（`fill.ts:238-265`）。
- 代码级去重：同名 insert 自动转 update（`fill.ts:458-473`）。
- 类型约束：人物实体试图写进地理/建筑类表时「报错不写错」，跳过并上报（`fill.ts:443-453`，`inferEntityType`）。
- 落库后跑 `selfCheckFill` 自检地名/空值/跨表（`fill.ts:599`）。

**体验正向点**：作者写一章，表格里的人物、地点、功法会被结构化回填，且不容易产生「青龙镇 / 青龍镇 / 青龙城」这种变体污染。类型错放（人名进地理表）会被拦下。这对长篇小说的世界观一致性是实打实的帮助。

**体验隐患（真实推演）**：
- **skipLatest 默认不一致导致临稿污染风险**（见 P2-ENTITY-09）：UI 开关 `AutomationSettingsDialog` 初始 `useState(true)`（跳过最新章），但 `Project.skipLatestChapter` schema 默认 `false`，`loop.ts:127` 用 `?? false`。未显式配置过的项目，实际是「填最新章」。作者若开了「自动确认」又反复 `re-roll`（重新生成）最新章，临稿里的临时人名/地名会被填进表。好在 `selfCheckFill` 的跨表/同名检测能事后报警，但「报警」不等于「不污染」。
- **freq 频率跳章**：`loop.ts:134-141` 按 `nodeOrder+1 % freq` 决定是否填表。默认 `freq=1`（每章填）。但若作者把频率调成「每 3 章填一次」，中间两章的事实不会被抽取，作者可能在第 2 章埋的伏笔/人物细节到第 4 章才进表，存在「时间差漏填」。这是设计取舍，但 UI 没有给作者任何「这两章还没填」的提示（只有 SSE `babylore_fill skipped frequency` 事件，前端若没订阅就无感知）。
- **空 ops / 全失效章被标「未填」可重试**（`fill.ts:383-404`）：这是正向修复（round 的 P0-3），避免了「假完成」把章节永久标脏。但作者侧体验是：某章反复出现在「待填」里，却看不到为什么没填成（warning 只在后端日志/`selfCheckIssues` 里）。
- **类型约束是启发式而非确定性**：`inferEntityType`（`fill.ts:211-225`）靠「名后紧跟人物动词（说道/笑道/皱眉）」或「引号式对话」判定人物。这对标准小说的第三人称叙述很准，但遇上第一人称内心独白、或叙述者用「它」指代拟人化器物时，会漏判或误判。漏判的后果是：本该被拦下的「人物进地理表」错放没拦住（虽然后续 selfCheck 的跨表检测能事后报警，但已经是写错后再报警）。
- **update 缺 match 列会静默丢操作**：`applyOps` 对 `update` 缺有效 `match` 列时，跳过该 op 并记 warning（`fill.ts:479-483`）；`delete` 同理（`fill.ts:510-514`）。这是正向护栏，避免插伪行/误删整表。但副作用是：LLM 偶尔漏给 match 时，那一行的「更新」就静默丢了——作者若在表格里看到某字段没更新，难以追溯是 LLM 漏给还是系统吞掉。
- **权威名录截断风险**：`buildTablesText` 把已有名称名录截断到前 80 个、样例行截断到前 60 行（`fill.ts:245-255`）。对超大表（数百行），LLM 看不到全量名称，仍可能造出「青龙镇 / 青龙城」式变体——名录防重的前提是「名称在前 80」，超出部分防重失效。这是「防重靠喂全量」设计在规模下的退化点。
- **`auto_facts` 默认表类别 `custom` 不在 LORE 颜色体系考量内**：无表项目首次写章会自动建 `auto_facts`（category=`auto`，`fill.ts:146-160`）。这个 `auto` 类别在 `LORE_COLORS` 里也没有，相关高亮/图例同样回退灰色（与 P2-ENTITY-03 同源）。

### 2.3 伏笔面板是否随写章更新？（本轮最关键的负体验）

**链路实况——这是 IMP-007 的本意**：写章/确认后，伏笔收束率应自动重算，面板自动反映「哪条线收了、哪条还悬着」。

**源码真相（已逐行核对）**：
- 唯一触发点：`src/app/api/story/nodes/[id]/route.ts:214-224`，在人工点「确认通过」(`action:"confirm"`) 之后，fire-and-forget `POST /api/foreshadowing/detect`。
- **不触发点 1**：`applyConfirm`（`src/core/confirm-guard.ts:100-167`）——被「自动确认」（智能审阅，默认开启）和「批量确认本卷」共用，**完全没有 POST detect 的代码**。
- **不触发点 2**：`src/app/api/story/nodes/batch-confirm/route.ts` 批量确认路径，grep 确认无 `foreshadowing/detect` 引用。

**体验推演（默认配置下）**：
作者写第 5 章，前文埋了「神秘剑法的来历」这条伏笔（pending）。第 5 章正文里揭晓了剑法来历。由于 `autoConfirmEnabled` 默认 `true`，第 5 章在 `post-processor` 步骤 3.1 自动确认（`post-processor.ts:229`），走的是 `applyConfirm`——**不触发 detect**。作者打开伏笔面板，那条伏笔依然显示「待回收」「收束率 0%」。作者会困惑：「我明明写回收了啊？」只有手动点「重新检测」按钮（`ForeshadowingPanel.tsx:195`）才会刷新——但默认流把这一步藏起来了。

更严重的是**时序盲点**：即便给 `applyConfirm` 补上 detect，`detectPayoffs`（`src/core/foreshadowing.ts:190-219`）扫描的是 `chapterSummary` 表，而且是「detectedAt 之后创建的摘要」。但 `post-processor` 里自动确认（229 行）发生在摘要落库（约 559 行 `prisma.chapterSummary.create`）**之前**。也就是说，第 5 章的摘要还没写进库，detect 就已经跑完了，haystack 里根本没有第 5 章的内容 → 仍然漏检。这是「逻辑上触发了，但时间上太早」的双重失效。

**结论**：IMP-007 在 round-1 号称「写章/确认流程不调 → 已修复」，但真实覆盖只到「人工单章确认」这一条支路，自动确认/批量确认两条主干都没接上，且主干默认开启。对默认用户体验而言，伏笔面板**基本不会随写章自动更新**。这是本轮必须升级的严重度 P1 缺陷。

**补充推演——收束率算法的体验含义**：`detectPayoffs` 的判定规则（`foreshadowing.ts:233-242`）是「closureConditions 任一命中，或描述短语命中 ≥2 → fulfilled/1.0；短语仅命中 1 且仍 pending/detected → partially_fulfilled/0.5」。收束率 `payoffRate = (fulfilled + 0.5*partial)/active`（`foreshadowing.ts:270`）。问题在于：这条算法扫描的是**章节摘要**而非正文。摘要由 LLM 压缩生成，可能把「回收伏笔」这种关键信息压缩掉（尤其长章节摘要默认 ≤200 Token）。于是即便作者正文写明了回收，只要摘要没提到，detect 仍判 pending——作者看到「收束率 0%」会怀疑系统坏了，其实是摘要丢失了信号。这是「依赖二手摘要而非一手正文」带来的体验失真，建议（同 P1-ENTITY-02）让 detect 同时扫正文。
**补充推演——`computePayoffStats` 与 `detectPayoffs` 的分工**：面板列表展示走只读聚合 `computePayoffStats`（`foreshadowing.ts:296`，无副作用），它本身不触发检测，只是把已有 `status/fulfillmentRatio` 聚合。所以「面板数字」反映的是「上一次 detect 的结果」，而非实时。如果 detect 从不被触发（默认流），面板数字永远停在「创建时」的 pending/0%，与作者写作进度彻底脱钩。这正是默认用户体验崩坏的根。

### 2.4 正文高亮是否准确？

**链路实况**：`src/core/entity-highlighter.ts` 的 `findEntitiesInText` 做正文扫描，`getEntityMap` 从 `/api/entities/highlight` 拉实体映射。颜色由 `CHARACTER_COLOR` / `LORE_COLORS` 单源驱动（IMP-008 修复确认有效）。

**体验正向点**：
- 2字角色名做了头+尾边界校验（`entity-highlighter.ts:264-272`），「王林」不会在「王林海」里误亮，比早期版本准。
- 单遍正则 + 最长名优先 + 贪心占用（`entity-highlighter.ts:239-276`），复杂度 O(L + 命中数)，长名夹短名（「李星云剑法」里的「星云剑法」）能被正确捕获。
- 停用词表屏蔽「什么/怎么/现在」等泛化词（`entity-highlighter.ts:200-212`），避免满屏染色。
- IMP-012 生效：API 失败重试一次，再失败降级用 `lastGoodMap`，正文不会静默失色。

**体验隐患（真实推演）**：
- **60s 缓存滞后 + 失败降级被缓存**（见 P2-ENTITY-08）：`getEntityMap` 失败后把 `lastGoodMap` 写回 `cache`（`entity-highlighter.ts:163`），带 60s TTL。这意味着一旦 API 抖动，接下来 60s 内即使实体已新增，正文也不会显色——作者刚建的角色卡，要等最多 60s 才在正文中变色。对「即时反馈」体验是可见的延迟。
- **配色缺类**（见 P2-ENTITY-03）：`LORE_COLORS` 没有 `fate_system` / `public_system` / `physics`。而 `entity-sync` 自动建档恰好会产出这三类（`TYPE_TO_CATEGORY`）。这些实体在正文高亮/面板图例里回退成灰色 `#6b7280`，与「单源统一配色」的设计意图自相矛盾——作者会看到一堆灰色高亮，分不清类别。
- **召回与高亮边界分裂**（见 P2-ENTITY-06 / IMP-010 设计张力）：世界书触发召回用 `matchNameStrict`，2字中文**直接子串命中、无尾边界**（`match.ts:140-143`）；正文高亮用 `findEntitiesInText`，2字**要求尾边界**（`entity-highlighter.ts:269`）。于是「王林」作为触发词会在「王林海」章节被召回注入设定，但正文不高亮——同一名字两套行为，作者若debug会非常困惑。round-1 把这条定为「维持现状」，但张力仍在。

#### 2.5 作者可观测性（贯穿上述四类体验的共性短板）

把 2.1~2.4 串起来看，entity-sync 全流程最大的体验问题不是「功能有没有」，而是「作者能不能看见系统在做什么」。具体表现：

- **静默失败**：实体抽取失败被 `.catch(()=>null)` 吞掉（见 P2-ENTITY-12）；填表 warning 只在后端日志，前端除非主动订阅 SSE `babylore_fill` 事件否则无感知。
- **无「待处理」清单**：跳频章（freq>1 中间章）、建档失败章、填表失败章，都没有一个统一的「这几章还没处理完」面板。作者只能事后在世界书/表格里人肉发现遗漏。
- **SSE 事件未被前端充分消费**：`safeFillAfterWriting` 会通过 `send` 推送 `babylore_fill skipped frequency/skipLatestChapter` 等事件（`loop.ts:123,130,138`），但前端若未订阅或订阅后未展示，作者对这些「跳过」毫不知情，埋下「为什么这章没填」的困惑。
- **状态文案与真相可能不一致**：`applyConfirm` 返回的 `fillMsg` 是诚实的（「未触发自动填表（xxx）」，`confirm-guard.ts:138-141`），这点做得好；但 `babyloreFill` 整体 `ok` 仅代表「本轮 applied>0」，不代表「全项目事实完整」——作者容易把「填表成功」误解为「世界观已同步」。

可观测性的短板，使得上面所有「漏/误/滞后」在真实写作中更隐蔽、更难以自愈，是本轮建议优先补的产品级方向。

#### 2.6 端到端走查示例（把上述透镜结论压进一条真实写作流）

为了让非工程读者也能感知这些问题的叠加效应，下面用一个具体场景串起整条链路。设定：作者用默认配置（autoConfirm 开启、skipLatest 关、freq=1）写一部叫《星海》的玄幻长篇，主题是「幽蓝剑法的诅咒」。

- **第 1 章《初遇》写完**：正文出现主角「林夜」、师姐「苏璃」，以及功法「幽蓝剑法」。`post-processor` 步骤 3.1 触发自动确认 → 走 `applyConfirm` → `safeFillAfterWriting` 跑填表（`confirm-guard.ts:128`）。填表 LLM 把林夜、苏璃抽进 `CharacterCard`，把幽蓝剑法抽进 `LoreTable`（或世界书）。同一函数内 `syncChapterEntities` 也跑了一遍（`fill.ts:597`），把林夜/苏璃建角色卡、幽蓝剑法建世界书条目。`babyloreFill` 末尾跑 `selfCheckFill`（599 行）。到这里，**自动建档是真实发生的**，作者能在角色面板看到两张新卡、世界书多一条。但 `applyConfirm` 没有触发 `detectPayoffs`——此时作者还没建伏笔，无感。
- **作者在第 1 章后手动建伏笔**：在伏笔面板输入「幽蓝剑法的诅咒何时解除」，priority=high，状态 pending。此刻 `closureConditions` 由 `deriveClosureConditions` 抽成若干 2字+ 片段（`tool-registry.ts:678`），其中含「诅咒」「解除」等。
- **第 2 章《暗涌》写完**：正文铺垫「林夜发现剑法反噬加剧」。再次自动确认 → 再次填表 + 建档，但**再次不触发 detect**。摘要此时才由 `post-processor` 步骤 5 生成（约 559 行），且默认 ≤200 Token 压缩。伏笔面板仍显示 pending / 收束率 0%。
- **第 3 章《解咒》写完**：正文明确写道「林夜以本命精血破了幽蓝剑法的世代诅咒」。自动确认、填表、建档第三次发生。角色卡里林夜与苏璃的 `relationships` 在第 1 章被写成「师徒」，第 3 章若 LLM 抽出「宿敌」动态，会因只按 targetName 去重而被丢弃（P2-ENTITY-04），角色卡关系图仍显示「师徒」——与时间线背离。伏笔面板**依旧** pending / 0%，因为 detect 从没被触发。
- **作者的困惑时刻**：作者打开伏笔面板，看到「幽蓝剑法的诅咒」还是 0% 回收，怀疑系统坏了。他手动点「重新检测」（`ForeshadowingPanel.tsx:195`）→ 这次 detect 终于跑了，扫章节摘要。但第 3 章摘要若把「破诅咒」压缩成了「林夜解开隐患」，没出现 closure 片段「诅咒」「解除」二字，detect 仍判 pending（P1-ENTITY-02 时序 + 摘要丢信号的叠加）。作者彻底困惑。
- **高亮侧的同步失真**：第 3 章建的世界书「命运体系」类实体（假设 LLM 归类 fate_system），在正文里高亮成灰色（P2-ENTITY-03），作者分不清它是什么类别。若此刻 `/api/entities/highlight` 因网关抖动失败一次，`getEntityMap` 会把降级 map 写进 60s 缓存（P2-ENTITY-08），新建的林夜要等最多 60s 才在正文变色。
- **沉默的失败**：假如第 2 章那次 `syncChapterEntities` 的 LLM 调用超时，外层 `.catch(()=>null)`（`fill.ts:597`）把它吞掉，作者在第 2 章看到的仍是「填表成功」，根本不知道苏璃这一章的世界书设定没建档（P2-ENTITY-12）。

这条走查说明：单个缺陷单独看都「不致命」，但它们沿着「自动确认默认开启 → detect 不触发 → 摘要滞后 → 高亮/配色/关系各有一处失真 → 失败静默」的链路**叠加**，最终呈现给作者的就是「我写了回收，系统却说没回收；我建了角色，关系却不对；高亮还灰了一块」的整体失灵感。而这正是 entity-sync 透镜要暴露的——功能点都在，但**默认流下的端到端一致性崩了**。修复优先级应按「先补 detect 触发（P1）→ 再补编排层测试与可观测性（P2）→ 再修配色/关系/性能债」的顺序推进。

---

## 三、总体架构质量视角（约 4500 字）

### 3.1 填表频次控制 / skipLatest 临稿污染

`loop.ts:108-198` 的 `safeFillAfterWriting` 是唯一频率/跳过裁决中心，职责收敛得好：
- `autoFillEnabled` 总开关（122 行）。
- `freq` 每 N 章填（126、134-141 行），整除才填。
- `skipLatest`（127、129-132 行）：最新章跳过。**关键确认**：`loop.ts` 在 132 行 `return` 早于 `babyloreFill`，所以 skipLatest 命中时**填表与实体抽取双双跳过**，不存在「只跳填表不跳建档」的半截污染。这点设计是自洽的。

**问题在默认值错位**：UI `AutomationSettingsDialog:26` 初值 `true`（以为跳过最新），但 schema `skipLatestChapter @default(false)`，`loop.ts:127` 用 `?? false`。未配置项目实际填最新章。若作者以为「开着跳过」而反复 re-roll 最新章，临稿会被填进表（靠 selfCheck 事后报警）。属 P2，但会直接导致「作者以为安全实则污染」的认知错位。

**另一个频次副作用**：`freq>1` 时中间章不填，但没有任何持久化标记告诉作者「这几章待填」。与 round 的「防重复标记 `.runtime/babylore-filled.json`」不同，跳频章既不是「已填」也不是「脏」，处于三不管。作者重跑「一键追评」时，这些章会被补填（babyloreFillAll 不读 freq），于是 freq 配置对一键追评**完全无效**——两处频率语义不一致。

**freq 与 skipLatest 的叠加盲区**：当 `freq=3` 且 `skipLatest=true` 时，假设最新章是第 10 章（10%3≠0 本就该填），skipLatest 又把它跳过——两条「跳过」规则叠加，作者更难判断第 10 章到底填没填。这种「多规则叠加跳过且无汇总提示」的设计，把可控性交给了运气。

**`babyloreFillAll` 的 `babylore-filled.json` 是进程内 JSON 文件，非数据库**：防重复标记落在 `.runtime/babylore-filled.json`（`fill.ts:90`），这是文件系统而非 Postgres。多实例部署或 `.runtime` 被清时，标记丢失 → 已填章节被重复填（虽然 applyOps 有同名转 update 兜底，不会造重复行，但会重复消耗 LLM 调用与自检开销）。属部署级隐患，单实例本地开发无碍。

### 3.2 数据一致性

- **类型约束**（M2，`fill.ts:443-453`）：人物实体误写地理表被拦，是高质量一致性护栏，「报错不写错」。但它只在「高置信度人物动词」命中时生效（`inferEntityType`），漏判的人物仍可能错放——属启发式，非 100%。
- **跨表/同名自检**（`selfCheckFill`，`fill.ts:891-938`）：能发现「人名写进地点表」「同名录多表」等错放，是兜底一致性网。
- **关系回填一致性缺口**（P2-ENTITY-04）：`entity-sync` 合并关系只按 targetName 去重，关系演化丢失，角色卡 `relationships` 与时间线实际走向不一致。
- **章节摘要时序**（P1-ENTITY-02）：detectPayoffs 依赖 summaries，但确认早于摘要生成，导致伏笔检测与主流程数据新鲜度错位。
- **实体抽取查重**：`existingNames` 同时含角色名、别名、世界书标题，但 `charByName` 只含角色卡（`entity-sync.ts:125-142`）。若某名字恰好既是世界书标题又是角色卡名，命中逻辑会先走角色分支——边界 case，但无测试覆盖。
- **`syncChapterEntities` 逐章重查全量角色/世界书**：每次调用都 `findMany` 拉全部 `CharacterCard` 与 `LorebookEntry`（`entity-sync.ts:121-124`），逐章写后都重拉一次。长书数百张卡时，每章一次全量查询 + 一次 LLM + 一次建卡/更新，耦合在写章热路径上。建议按项目缓存或增量 diff。
- **关系回填的「读-改-写」无并发保护**：`entity-sync` 先读 `relationships`、合并、再 `update`（`entity-sync.ts:170-182`）。若同一章对同一角色被并发触发两次（如自动确认 + 手动确认竞态），后一次读到的可能是前一次未提交的中间态，存在丢失更新的理论窗口。当前靠 confirm 幂等守卫降低概率，但未在 DB 层加 `editVersion` 乐观锁（角色卡模型没有类似 `StoryNode.editVersion` 的字段），属一致性薄弱点。

### 3.3 性能瓶颈

- **selfCheckFill O(行 × 正文)**（P2-ENTITY-07）：`fill.ts:810-847` 把全项目正文 `join` 成 `corpus`，再对每个实体行值做 `corpus.includes(s.toLowerCase())`。每次 `babyloreFill`（599 行）和 `babyloreFillAll`（740 行）末尾都跑。写一部长篇（数百实体行 × 数十万字正文）时，单章填表后自检是 O(实体行数 × 全正文长度) 的字符串扫描。且 `babyloreFillAll` 是**每章都重跑一次全量 selfCheck**（740 行在循环外，仅在末尾跑一次——这点还好），但单章 `babyloreFill` 是每章一次全量自检，随项目长大线性变慢。建议只在 fill-all 末端或显式「诊断」时跑，或缓存 corpus、建倒排。
- **每章双 LLM 调用**（P2-ENTITY-10）：填表 + 实体抽取两次独立调用，且无开关。长书批量写作时成本翻倍。
- **getEntityMap 60s 缓存**（P2-ENTITY-08）：不是性能问题，是新鲜度问题；但失败降级写 cache 的设计会让恢复期最长 60s 不重试。
- **`buildTablesText` 的 prompt 膨胀**：每次填表把「全量名称名录（前 80）+ 样例（前 60 行）」拼进 user prompt（`fill.ts:238-265,320-326`），大表下 prompt 可达数千字，叠加 `chapterText.slice(0,12000)` 上限，单章填表请求的 token 体量可观。这是「防重靠喂全量」的必然成本，与 2.2 的截断风险同源。
- **`corpus` 每次重建**：`selfCheckFill` 每次都 `prisma.storyNode.findMany` + `join` 重建 corpus（`fill.ts:811-816`），未跨调用缓存。即便同一分钟内连续填两章，corpus 也重建两次。属低优先级冗余。
- **`applyOps` 逐 op 写库**：`fill.ts:523` 每个表在循环内对每个 op 后都 `prisma.loreTable.update`（实际是循环内每个 op 都 update 一次整表 rows）。一章若有 10 个 op 落在同一表，该表被 update 10 次——应是「聚合本次所有 op 后一次性 update」。当前实现把整表 rows 反复序列化写库 10 次，是明显的写放大（`fill.ts:523` 在 `for (const op of ops)` 循环体内，每次都全量 update）。这是性能与写放大的实打实缺陷，建议提到 P2 修复。

### 3.4 类型安全

- `tsc --noEmit` 本轮零错误（`EXIT=0`），类型门禁健康。
- `entity-sync.ts` 多处 `as any` 强转（`entity-sync.ts:200-214` 的 `data:{...} as any`、`relationships: newRels as any`），是把 JSON 协议结果塞进 Prisma 模型时的防御性转换。功能无碍，但绕过了部分类型检查——若 Prisma schema 改列，编译器不会在这里报错。属可接受的务实取舍，建议后续补一层 zod 校验 `entities` 结构。
- `fill.ts` 的 `LoreTableOp` 类型约束良好，applyOps 对 `op.table`/`op.op` 有守卫。

### 3.5 round-1 IMP-006~012 复验结论（逐条，基于真实代码）

| 编号 | 修复内容 | round-2 复验结果 | 证据 |
|---|---|---|---|
| IMP-006 | LorebookEditDialog 分类漏 4 类 | **仍生效**。select 含全部 15 项（含 technique/law/currency/character_relationship，`LorebookEditDialog.tsx:112-126`）。但分类仍硬编码 vs `worldPanelData` 不同源（技术债持续，P2-ENTITY-11）。 | 源码逐行 |
| IMP-007 | detectPayoffs 随写章触发 | **部分失效（P1）**。仅人工单章确认触发（`[id]/route.ts:218`）；自动确认/批量确认共用 `applyConfirm`（`confirm-guard.ts:100-167`）不触发。默认 autoConfirm 开启 → 默认流不触发。 | 源码 + grep |
| IMP-008 | 实体配色两套冲突 | **仍生效（单源）**。ChapterEntitiesPanel（`ChapterEntitiesPanel.tsx:29-38`）与 highlight API（`route.ts:11,54`）均复用 `CHARACTER_COLOR/LORE_COLORS`。但 LORE_COLORS 缺 fate_system/public_system/physics 三类（P2-ENTITY-03）。 | 源码 |
| IMP-009 | closureConditions 恒 [] | **确已非空白**。tool-registry.ts:714 写入 `deriveClosureConditions(description)`。但该函数用 `[一-鿿]{2,}` 抽全部 ≥2字片段，引入 2字噪声误召风险（P2-ENTITY-05）。 | 源码 |
| IMP-010 | 2字实体过召回（维持现状） | **维持合理**。match.test.ts 34 例全过（含 2字锁定 `match.test.ts:74-80,98-138`）；`matchNameStrict` 2字直命中铁律完好（`match.ts:140-143`）。召回/高亮边界不一致张力仍在（P2-ENTITY-06）。 | 单测 34 passed |
| IMP-011 | 世界卡片无编辑入口 | **仍生效**。WorldEntryCard 标题点击 + 铅笔按钮均 `onEdit?.(entry)`（`WorldEntryCard.tsx:23,30`），透传链完整。 | 源码 |
| IMP-012 | getEntityMap 失败静默返空 | **仍生效**。重试一次 + `lastGoodMap` 降级（`entity-highlighter.ts:131-167`）。但失败降级写 cache 致 60s 滞后（P2-ENTITY-08）。 | 源码 |

**复验总评**：6/7 的物理修复仍在位且逻辑自洽；IMP-007 因覆盖范围缺失从「已修复」降级为「部分失效」，是本轮必须回到代码层补的回归点；IMP-010 维持现状决策经测试权威确认合理。

### 3.6 测试覆盖与回归风险矩阵（针对 entity-sync 透镜）

基于 `vitest.config.ts`（`environment: "node"`，`include: src/**/*.test.ts`）与现有测试文件，对透镜范围内的模块做覆盖评估：

- **`match.test.ts`（34 例，纯逻辑，无需 DB）**：覆盖 2字保召回铁律、≥3字直命中、数字边界、尾边界等，`tsc` + 单测双锁，IMP-010 极稳。**风险低**。
- **`world-category-classifier.test.ts`（6 例）**：世界卡确定性分类器有单测，**风险低**。但 entity-sync 的 `TYPE_TO_CATEGORY` 与 classifier 是两套映射，前者无单测保护（见 P2-ENTITY-03 缺类），**风险中**。
- **`entity-auto-creator.test.ts` / `entity-detector.test.ts`**：覆盖建档/抽取基础逻辑，但疑似依赖 DB 或内存，本沙箱未起库未跑；其中 `isSimilarName` 的边界（繁简/错别字）是 2.1 查重误判的来源，建议补「相似但不等」的边界用例。
- **`fill.selfcheck.test.ts`**：覆盖自检逻辑（地名/空值/跨表），是 P2-ENTITY-07 性能问题的同模块测试；但当前测试未覆盖「大库 O(行×正文)」的规模退化，建议在 CI 加一个规模基准。
- **`applyConfirm` / `detectPayoffs` / `syncChapterEntities` / `getEntityMap`**：**均无单测**。这正是 IMP-007 回归（applyConfirm 漏触发 detect）能溜进 round-1 却没被单测拦下的根因——「确认后是否触发 detect」这条契约没有任何测试断言。建议补：`applyConfirm` 后断言发生过 `POST /api/foreshadowing/detect`（或抽成可注入的钩子做断言）。同理 `getEntityMap` 的失败重试/降级应补单测（用 mock fetch），把 IMP-012 从「逻辑自洽」升级为「测试守护」。
- **总结**：entity-sync 的「纯函数/算法层」测试充足，「编排/副作用层」（确认流触发、LLM 失败吞错、缓存降级、跨表写放大）测试稀薄，正是本轮多处 P2 隐患的滋生地。补编排层测试是性价比最高的加固。

### 3.7 架构总体 verdict（透镜收口）

把 3.1~3.6 收拢成一句话：**entity-sync 是一个「算法扎实、编排脆弱、可观测性缺失」的子系统**。它的原子能力——中文边界匹配、零杜撰填表、类型约束、查重、自检——都经过多轮打磨且被单测守护，单独拿出来都很能打；但当这些原子能力被串进「写章→自动确认→填表→建档→检测→高亮」这条跨多文件、跨多进程的编排链时，衔接处全是「信任调用方会做对」的隐式契约：确认流信任「有人会触发 detect」（实际没接）、建档信任「LLM 不会失败」（失败被吞）、高亮信任「API 永远可达」（降级被缓存）、填表信任「一次 update 足够」（实际写放大）。这些隐式契约没有任何测试或显式校验兜底，于是默认流下必然漏水。

对 v1.6.4 的总体评价：从「功能有没有」看，entity-sync 已是成熟特性；从「默认流端到端对不对」看，它还差最后一块——把编排层的隐式契约变成显式契约（触发点补全 + 失败可见 + 测试守护）。这恰是 round-2 相对 round-1 的增量价值：round-1 修的是「每个零件」，round-2 指出的是「零件之间的缝」。补上 P1-ENTITY-01/02 两条缝，并在编排层补测试，就能让「写章即自动建档、伏笔随写章回收、高亮即时准确」从 demo 级承诺变成默认可用的体验。

---

## 四、发现清单（编号 + 严重度 + 文件:行号 + 现象 + 根因 + 建议）

> 全部基于真实代码/测试证据，零编造。P1 表示体验级阻断（默认流功能缺失），P2 表示质量/一致性/性能债。

### [P1-ENTITY-01] 伏笔自动检测覆盖不全（IMP-007 回归）
- **文件:行号**：`src/core/confirm-guard.ts:100-167`（`applyConfirm` 无 detect）；`src/app/api/story/nodes/batch-confirm/route.ts`（整文件无 detect）；对照唯一触发点 `src/app/api/story/nodes/[id]/route.ts:214-224`。
- **现象**：写章确认后伏笔面板不随写章自动更新（默认 autoConfirm 开启场景下彻底不触发）；只有人工单章确认或手动点「重新检测」才刷新。
- **根因**：round-1 只在「人工 confirm 动作」分支接了 fire-and-forget detect，但自动确认与批量确认走共享的 `applyConfirm`，该共享函数从未包含 detect 调用；而 `Project.autoConfirmEnabled` 默认 `true`，默认写作流绕开了唯一触发点。
- **建议**：在 `applyConfirm` 末尾追加 `void fetch(\`${origin}/api/foreshadowing/detect\`, {method:"POST",...}).catch(()=>{})`；并同步在批量确认 `batch-confirm/route.ts` 末端触发。或把 detect 收敛进 `post-processor` 摘要落库之后统一触发，避免三处重复。

### [P1-ENTITY-02] detectPayoffs 时序盲点（确认早于摘要）
- **文件:行号**：`src/core/pipeline/post-processor.ts:229`（自动确认步骤 3.1）早于 `src/core/pipeline/post-processor.ts:559`（`chapterSummary.create`）；`src/core/foreshadowing.ts:190-219`（detect 扫 summaries）。
- **现象**：即便补上 detect 触发，最新章节的摘要尚未入库，detect 的 haystack 为空，仍漏检刚写章的伏笔回收。
- **根因**：`detectPayoffs` 只扫 `chapterSummary`（且 `createdAt > anchor`），但摘要生成排在确认之后。两步顺序错配。
- **建议**：把 detect 触发点移到摘要 `create` 之后；或增强 `detectPayoffs` 同时扫描 `storyNode.content` 全文（按 anchor 时间过滤章节），不再单一依赖摘要，鲁棒性更高。

### [P2-ENTITY-03] 实体配色覆盖不全（IMP-008 单源缺类）
- **文件:行号**：`src/core/entity-highlighter.ts:19-31`（LORE_COLORS 无 fate_system/public_system/physics）；`src/core/babylore/entity-sync.ts:42-52`（TYPE_TO_CATEGORY 会产出这三类）；`src/app/api/entities/highlight/route.ts:54`（`LORE_COLORS[e.category] || "#6b7280"`）。
- **现象**：自动建档产生的「命运体系/公开体系/物理列表」类实体在正文中高亮、面板图例回退为灰色 `#6b7280`，与「单源统一配色」意图背离，作者无法从颜色区分这些类别。
- **根因**：LORE_COLORS 调色板未同步覆盖 entity-sync 会自动写入的全部 category。
- **建议**：在 LORE_COLORS 补齐 fate_system/public_system/physics 三色；或加单测断言「TYPE_TO_CATEGORY 的所有 value 都在 LORE_COLORS 中有定义」，防回归。

### [P2-ENTITY-04] 关系回填不捕获关系演化
- **文件:行号**：`src/core/babylore/entity-sync.ts:168-186`（合并仅按 `targetName` 去重，171-174 行 `merged.some(x=>x.targetName===r.targetName)`）。
- **现象**：同一目标角色的关系类型后续变化（师徒→宿敌）被丢弃，角色卡 `relationships` 停在过去的关系，与正文走向背离，关系图误导作者。
- **根因**：去重键只用了 targetName，未含 relation；新 relation 命中同名即 `continue`。
- **建议**：去重键改为 `(targetName, relation)`；若同 target 且 relation 不同，则保留最新 `dynamic` 覆盖旧条目（或追加为多条）。

### [P2-ENTITY-05] closureConditions 2字噪声误召
- **文件:行号**：`src/core/agents/tool-registry.ts:678-700`（`deriveClosureConditions` 用 `/[一-鿿]{2,}/g`）；`src/core/foreshadowing.ts:222-228`（closure 任一命中即 `fulfilled`）。
- **现象**：描述里「他发现了神秘剑法」会被抽成 ["他发现","发现","现了","了神","神秘","剑法",…] 一堆 2字碎片；后续摘要里只要巧合出现「神秘」二字就判 fulfilled，伏笔被假阳性回收。
- **根因**：closure 种子阈值（≥2字）低于短语种子（≥3字，`foreshadowing.ts:158`），且未过滤通用停用词；closure 命中规则是「任一命中即满」。
- **建议**：closure 种子限定 ≥3字，或先过一遍 COMMON_STOP_WORDS 类停用词过滤；与 `extractSeeds` 的 `[一-龥]{3,}` 阈值对齐（round-1 P2-#2 已指出，本轮确认仍未修）。

### [P2-ENTITY-06] 召回匹配与高亮边界不一致（IMP-010 设计张力持续）
- **文件:行号**：`src/core/text/match.ts:140-143`（`matchNameStrict` 2字 CJK 直接子串命中，无尾边界）vs `src/core/entity-highlighter.ts:264-272`（`findEntitiesInText` 2字要求头+尾边界）。
- **现象**：世界书触发词「王林」会在「王林海」章节被召回注入设定，但正文不高亮——同一名字两套边界语义，作者 debug 时困惑。
- **根因**：两套独立匹配函数，各自为战；round-1 把 2字保召回定为铁律故未统一。
- **建议**：在文档中明确两条链路的语义差异与适用边界；或抽一个共享的「中文 2字边界」判定函数供两端复用，消除非预期分裂。

### [P2-ENTITY-07] selfCheckFill 性能 O(行 × 正文)
- **文件:行号**：`src/core/babylore/fill.ts:810-847`（`corpus = nodes.map(content).join("\n")` 后逐行 `corpus.includes`）；触发点 `fill.ts:599`（单章）、`fill.ts:740`（一键填表末端）。
- **现象**：项目越大（实体行多、正文长），每章填表后自检越慢，是随规模线性恶化的扫描开销。
- **根因**：全量正文 join 成单串，每个实体名做整串 `includes`，复杂度为实体行数 × 正文长度。
- **建议**：仅在「一键追评」末端或显式「诊断」按钮跑全量自检；单章填表后用增量检查（只验本章新增名是否在本章正文）；或缓存 corpus、改为按章分片 + 倒排。

### [P2-ENTITY-08] 实体高亮 60s 缓存滞后 + 失败降级被缓存
- **文件:行号**：`src/core/entity-highlighter.ts:124-167`（失败降级 `cache.set(projectId,{map:fallback,...})` 带 60s TTL，163 行）。
- **现象**：API 抖动后，接下来 60s 内即使实体已新增也迟迟不显色；恢复期最长 60s 不再重试。
- **根因**：把 `lastGoodMap` 降级结果写入带 TTL 的 `cache`，缓存命中优先返回陈旧 map。
- **建议**：失败降级只回 `lastGoodMap` 引用、不写入长期 `cache`；或在写操作后调用 `invalidateEntityCache`（`entity-highlighter.ts:170`）主动失效；或把 TTL 缩短到 10-15s。

### [P2-ENTITY-09] skipLatest 默认不一致（UI 初值 true vs schema 默认 false）
- **文件:行号**：`src/components/workspace/AutomationSettingsDialog.tsx:26`（`useState(true)`）vs `src/app/api/projects/[id]/config/route.ts:18,74`（`skipLatestChapter: true` 写库却 schema `@default(false)`，见 generated prisma class 行）vs `src/core/babylore/loop.ts:127`（`?? false`）。
- **现象**：未显式配置的项目，UI 显示「跳过最新章」开启，实际 fill 仍填最新章；作者 re-roll 临稿可能被填入表。
- **根因**：UI 初值与持久化 schema 默认不一致，且 `loop.ts` 用 `?? false` 兜底。
- **建议**：统一默认（推荐 UI 与 schema 都 false，或都 true 并同步 config 初值）；或 UI 初值改为读取 schema 默认而非硬编码。

### [P2-ENTITY-10] 每章双 LLM 调用成本
- **文件:行号**：`src/core/babylore/fill.ts:596-597`（babyloreFill 内先填表再 `syncChapterEntities`），`src/core/babylore/fill.ts:711-713`（babyloreFillAll 同）。
- **现象**：每章固定 2 次抽取 LLM 调用（填表 + 实体），批量写作时长书成本翻倍，且无独立开关。
- **根因**：两条抽取链路各自独立发起 LLM 调用，未合并。
- **建议**：合并为一次抽取 prompt（同一返回既出表 ops 又出实体）；或给 entity-sync 加开关，允许只填表不建档。

### [P2-ENTITY-11] IMP-006 分类硬编码技术债（round-1 P2-#1 持续）
- **文件:行号**：`src/components/workspace/LorebookEditDialog.tsx:112-126`（select 硬编码 15 项）vs `src/components/workspace/worldPanelData.ts`（`WORLD_MODULES` 动态源）。
- **现象**：分类下拉与 `WORLD_MODULES` 不同源，未来新增类别需两处同步改，极易再次漏类（本次已因硬编码导致过 IMP-006）。
- **根因**：历史硬编码遗留，未重构为单一来源。
- **建议**：改为 `WORLD_MODULES.map(m => <option value={m.key}>{m.label}</option>)`，单一真相。

### [P2-ENTITY-12] 实体抽取失败对作者完全不可见
- **文件:行号**：`src/core/babylore/fill.ts:597`（`babyloreFill` 内 `syncChapterEntities(...).catch(()=>null)`）；`src/core/babylore/fill.ts:713`（`babyloreFillAll` 内同款 `.catch(()=>null)`）；`src/core/babylore/entity-sync.ts:113-116`（`syncChapterEntities` 内部 catch 返回 `{error}`）。
- **现象**：自动建档（角色卡/世界书）这一步若因 LLM 超时/网关拦截/JSON 解析失败而失败，外层 `.catch(()=>null)` 静默吞掉，作者只看到「填表成功」，不知道本章角色/设定**没有**自动建档。
- **根因**：`syncChapterEntities` 的返回值（含 `error`）在调用处被无条件丢弃，没有并入 `FillResult.warnings` 或 `selfCheckIssues`。
- **建议**：把 `syncChapterEntities` 返回的 `error/skipped` 并入 `babyloreFill` 的 `warnings`/结果，前端在填表提示里显式告知「本章自动建档失败/跳过 N 个」，至少让作者有迹可循。

### [P2-ENTITY-13] applyOps 逐 op 全量写库（写放大）
- **文件:行号**：`src/core/babylore/fill.ts:414-526`（`applyOps` 循环体），`fill.ts:523`（`prisma.loreTable.update` 在 `for (const op of ops)` 内对每个 op 后都执行）。
- **现象**：同一章若有多个 op 落在同一张表，该表的 `rows` 会被反复整表序列化写库多次（10 个 op → 10 次整表 update），是明显的写放大与无谓的 JSON 序列化开销。
- **根因**：`prisma.loreTable.update` 放在逐 op 循环内，而非「先在内存累积所有 op 的 rows 变更，循环结束后一次性 update」。
- **建议**：把 `rows` 的内存累积留在循环内（当前已累积），但将 `prisma.loreTable.update` 移出循环，改为按表聚合后一次性持久化；或在循环内仅标记脏表、循环后批量 update。

---

## 五、证据附录

### 5.1 构建 / 测试证据
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → `EXIT=0`（零类型错误，类型门禁健康）。
- `npx vitest run src/core/text/match.test.ts src/lib/world-category-classifier.test.ts` → `Test Files 2 passed (2)`，`Tests 40 passed (40)`（其中 match 34 例含 2字锁定用例全过，确认 IMP-010 维持合理）。
- 其余 DB 相关测试（`fill.selfcheck.test.ts`、`entity-auto-creator.test.ts`、`entity-detector.test.ts`）需 PostgreSQL（127.0.0.1:5432），本沙箱未起库，未跑；相关结论基于源码静态推导，已在正文明确标注。

### 5.2 git 证据
- HEAD = `2b88e09` feat: v1.6.4 故事线支线联动 UI + 数据化。
- round-1 IMP-006~012 修复记录见 `PROCESS/meetings/round-1/recheck-world.md` 与 `PROCESS/meetings/round-1/_integration.md`（已引用其行号与结论，本轮逐条复验）。

### 5.3 诚实边界声明
- 纯视觉（Chromium 像素级 / 弹窗层级目测）无法在本沙箱执行，故 IMP-011 弹窗视觉定位、IMP-012 极端并发竞态未做像素/压测级验证，结论限于源码逻辑自洽性。
- 端到端「写章→真机填表→真机检测」流程需 PostgreSQL + 真实 LLM 网关，本环境未具足，相关体验推演均锚定源码行并标注为「推演」而非「真机实测」。

---

**一句话交付**：round-2 透镜（设定自动建档 entity-sync）复验确认 round-1 的 IMP-006/008/009/010/011/012 物理修复仍在位，但挖出 **11 条发现（2×P1 + 9×P2）**，最关键的是 **IMP-007 伏笔自动检测仅人工单章确认路径触发、自动确认/批量确认两条默认主干未接（且与章节摘要生成存在时序盲点）**，必须回到代码层补 detect 触发点方能兑现「伏笔随写章更新」的承诺。

**附：本轮透镜相对 round-1 的增量价值**。round-1 回答的是「每个零件坏没坏」，本轮回答的是「零件之间的缝漏没漏」。具体增量有三：其一，把 IMP-007 从「已修复」重新定性为「部分失效」——通过逐跳追踪确认流，发现唯一触发点在人工单章确认分支，而默认开启的自动确认与批量确认共用 `applyConfirm` 根本没接 detect；其二，指出 detect 即便补上也受限于「摘要晚于确认生成」的时序盲点，需同时扫正文才能根治；其三，把散落在各处、单看都不致命的小缺陷（配色缺类、关系不演化、召回/高亮边界分裂、建档失败静默、60s 缓存滞后、写放大）用「默认流端到端走查」串成一条可被感知的体验塌方，证明它们不是孤立 P2，而是同一类「编排层隐式契约无兜底」症状的多种表现。这决定了修复顺序：先补 P1 两条缝（让承诺在默认流成立），再用编排层测试把缝焊死（防 regression），最后清 P2 债（让体验从「可用」到「好用」）。
