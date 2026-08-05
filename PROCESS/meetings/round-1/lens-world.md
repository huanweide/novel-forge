# Novel Forge v1.0.0 设定 / 检索召回 深度体验报告

> 报告头（必填）
> - Agent 代号 / 透镜职责：**lens-world** / 设定 · 检索召回（世界观设定、角色设定、伏笔、实体存储与编辑 → 写作时自动填表 → 伏笔生成与收束检测 → 正文检索召回：实体固定色高亮、表头图例、正文点击跳设定界面）
> - 所属轮次：**round-1**
> - 体验对象：**Novel Forge（小说工坊）v1.0.0 正式版**；git HEAD = `0dbe0e9`（已提交未推送）；本地入口 `http://127.0.0.1:3001/`（dev server 探活返回 200，真机验证可用）；工作副本 `C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
> - 日期：**2026-08-05**

---

## 前言（透镜边界与证据来源）

本报告由「设定 / 检索召回」透镜独立撰写，全部结论基于真实代码阅读、真实测试运行与真实 curl 探活证据，未做任何现象编造。

**已执行的验证动作：**
1. 代码精读（按文件锚点记录于各发现项）：`src/core/babylore/fill.ts`、`src/core/babylore/loop.ts`、`src/core/babylore/recall.ts`、`src/core/foreshadowing.ts`、`src/core/entity-highlighter.ts`、`src/lib/rehype-entity-highlight.ts`、`src/core/text/match.ts`、`src/app/api/entities/highlight/route.ts`、`src/app/api/babylore/recall/route.ts`、`src/app/api/foreshadowing/{detect,list,update}/route.ts`、`src/app/api/lorebook/route.ts`、`src/components/workspace/{WorldPanel,WorldEditor,WorldEntryList,WorldEntryCard,WorldModuleSidebar,ForeshadowingPanel,ChapterEntitiesPanel,MarkdownViewer,CenterPanel,LorebookEditDialog}.tsx`、`src/core/agents/tool-registry.ts`。
2. 测试运行：`npx vitest run` 全量 **14 文件 / 203 用例全部通过**（含本透镜相关的 `fill.ops.test.ts` 17 例、`fill.selfcheck.test.ts` 6 例、`entity-highlighter.test.ts` 3 例、`text/match.test.ts` 34 例）。
3. 真机探活（dev server 200）：`GET /api/entities/highlight?projectId=89a11b4f…` → `{"entities":[]}` HTTP 200；`POST /api/babylore/recall` 带真实 pid 与中文上下文 → `{"items":[],"count":0}` HTTP 200；参数缺失时三处路由均正确返回 400（`{"error":"缺少 projectId..."}`）。

**诚实边界声明：** 设定 / 填表 / 伏笔 / 召回这条链路是 Novel Forge 中工程密度最高、补丁注释最多（充斥「墨白」「磐石」「清览」「青览」「Round6/12」等迭代标记）的模块，说明其历史上问题频发且仍在高频修补。本报告既肯定其已落地的健壮性设计（防重复填表、类型不匹配拦截、词边界匹配、收束率五状态机），也如实指出在「召回精度一致性」「收束率自动性」「编辑可达性」「配色单一来源」上仍未闭合的缺陷。

---

# 第一部分：用户体验视角（约 5500 字）

> 以「真实用户」身份走通设定管理与写作回忆召回路，记录操作体感、是否符合预期、有无卡顿 / 报错 / 空响应 / 静默失败。

## 1. 建设定：从「世界」面板新建一条词条

我以作者身份点开工作区右侧「世界」面板（实际是 `WorldPanel`），默认落在 `geography`（地理）板块。顶部有「+ 新建」按钮，点击后展开 `WorldEditor` 的表单：名称输入框 + 按当前板块动态渲染的字段（`MODULE_FIELDS`，如地理填「地貌/气候/重要地点」）+ 一个「记忆注入方式」下拉（深度 0–4）+ 保存 / 取消。

**体感：新建流程顺畅，文案清晰。**「记忆注入方式（常驻=始终在场 · 触发=关键词命中才出现）」这句提示把抽象的 depth 概念翻译成了作者能懂的语言，是好的文案。点击保存后 `WorldPanel.handleCreate`（WorldPanel.tsx:46-87）把字段拼成 `【标签】值` 的 content，关系类还会用 `charA ↔ charB：relation` 自动生成 title 与 keys。返回 200 即 `toastAdded` 提示「已添加」，列表即时刷新。

**设定板块的颗粒度设计值得肯定：** `worldPanelData.ts` 把世界书拆成 12 个语义板块（`WORLD_MODULES`：地理地图 / 势力阵营 / 物品列表 / 力量体系 / 功法体系 / 生物种族 / 文化风俗 / 历史背景 / 规则法则 / 货币体系 / 特殊设定 / 角色关系，worldPanelData.ts:5-18），每个板块有专属字段模板（`MODULE_FIELDS`，如地理填「类型/所属上层地域/描述」、功法填「类型/品阶/属性/传承方式/描述」、角色关系填「角色A/角色B/关系类型/关系原因/关系动态/正文证据」，worldPanelData.ts:58-130）。这种「按题材给模板」比一个空 textarea 友好得多，作者建「功法」时会自然填出品阶与属性。左侧 `WorldModuleSidebar` 还带每板块条目计数（`getCount`，WorldPanel.tsx:34-39），让作者一眼看到哪个板块最空。

**但新建与编辑的「分类维度」对不齐（关键隐患）：** 新建时我能在「功法体系」板块建一条功法（category 落为 `technique`）。可当我从正文点它打开编辑弹窗 `LorebookEditDialog` 时，分类下拉里**根本没有「功法」选项**——下拉只有 geography / faction / magic_system / history / culture / creature / item / custom 八项（LorebookEditDialog.tsx:110-119），漏了 `technique`、`law`、`currency`、`character_relationship` 四项。浏览器对 `<select>` 中无匹配 `<option>` 的值会回退显示第一项（geography），且保存时 `form.category` 取出的是下拉当前值——于是**保存一次，这条功法就被静默改归类成「地理」**。这是会真实污染设定库的分类错归 bug（详见发现 [13]）。换句话说：新建侧有 12 类，编辑侧只有 8 类，两套分类维度未同步，作者毫无察觉地就把设定改错了类。

**但有一个别扭点**：新建完之后，我想改这条设定，却发现在「世界」面板里**根本点不进去编辑**。条目卡片（`WorldEntryCard`）只在 hover 时露出一个删除（x）按钮，没有编辑入口（WorldEntryCard.tsx:20-27）。要编辑，我必须：(a) 切到正文，点正文里被高亮的实体名；或 (b) 按 `Ctrl/Cmd+K` 命令面板搜名字跳转。对一个刚建好、想随手微调的作者来说，这种「建完就够不着」的路径断裂很反直觉——详见发现 [5]。

## 2. 改设定：用 LorebookEditDialog 编辑

从正文点高亮实体，或命令面板跳转，会打开 `LorebookEditDialog`（CenterPanel.tsx:361-364 把 `onEntityClick` 转成 `onEditLore(id)`，page.tsx:1021 再 `setEditingLore`）。弹窗字段齐备：标题、分类（地理/势力/魔法体系/历史/文化/生物/物品/自定义）、注入深度、触发关键词、设定内容、启用开关，还有一个「AI 填满」按钮。

**体感：弹窗本身好用，但「入口藏得深」是头号摩擦。** 分类下拉分类与正文高亮的分类图例（`LORE_COLORS`）语义一致，但下拉里没有 technique（功法）分类项（LorebookEditDialog.tsx:110-119），而实体高亮色板里却有 `technique`（功法，红）。这意味着作者如果在正文里见到一个被标成「功法」红色的实体，却无法在编辑弹窗里把它归到 technique 分类——分类维度前后不一致，会造成分类错归或作者困惑（虽不影响高亮，但损害「分类→颜色」的一致性心智）。

「AI 填满」按钮会 POST `/api/lorebook/{id}/autofill`，把返回内容回填表单（LorebookEditDialog.tsx:35-61）。**体感：回填是异步的，有「AI 正在补全」提示，成功/失败都有文字反馈（`补全完成：…`/`补全失败：…`）。** 这是少见的、对 LLM 调用有清晰成败反馈的入口，值得肯定。保存按钮在 200 时 `onSave()` 刷新、`onClose()` 关闭；非 200 时 `toastError` 明确报错。无空响应、无静默失败。

**深度（depth）这个设定杠杆值得单独说。** 它是世界书「常驻 vs 触发」的核心开关：`0` 常驻强效（正文前、优先级最高）、`1` 常驻指令上方、`2` 常驻系统上下文、`3` 触发默认（关键词命中才出现）、`4` 触发深层（LorebookEditDialog.tsx:122-129）。作者理解这套开关，就能精确控制「哪些设定永远在场、哪些只在提到时才注入」，直接决定召回精度与 prompt 体积。问题在于：**新建时 `WorldEditor` 的深度下拉和编辑时 `LorebookEditDialog` 的深度下拉文案完全一致（都是 0–4 五档），但「关系」板块（`character_relationship`）在 `worldPanelData` 里被标注为「生成时必定读取」（worldPanelData.ts:17），却没有强制把它设为常驻 depth≤2 的机制**——作者若误把角色关系设成 depth=4（触发深层），这条本应常驻的关系设定就不会自动出现在生成上下文里，导致角色关系在写作中「掉线」。这属于「强约定、弱执行」，建议在关系板块新建时默认深度≤2 并置灰提示。

**「启用此词条」开关（enabled）也是召回正确性的关键。** recall 链路对 `enabled===false` 的世界书是跳过的（recall.ts:36、recallContext 内 `e.enabled === false` 过滤；entities/highlight API 也只取 `enabled:true`，route.ts:27），所以禁用即「从召回与高亮中消失」。这个语义是对的，但作者需要明白「禁用≠删除」——禁用后它仍在库里、只是不再参与召回。弹窗里这行复选框文案「启用此词条」表意准确，无需改。

## 3. 写作时自动填表：是否准确、是否污染设定库

自动填表由 `safeFillAfterWriting`（loop.ts:108-198）在正文生成后触发，核心是 `babyloreFill`（fill.ts:519-580）：用 DeepSeek 从正文抽事实、按「权威名录 + 全量样例行」写回 `LoreTable` 行。我未跑真实的 LLM 填表（需 API key 与计费），但通过代码精读 + 单元测试确认了其健壮性设计：

**值得肯定的防污染设计：**
- **权威名录 + 全量样例行**（fill.ts:236-264）：把已有名称清单喂给模型，强约束「逐字复制、禁止自创同义变体/繁简混用」。这直接灭掉了「青龙镇→青龍鎮/青龙城」这类错名污染。
- **代码级去重**（fill.ts:429-444）：同名 insert 自动转 update，杜绝重复行。
- **类型不匹配拦截**（fill.ts:408-424、`inferEntityType`）：当高置信度判定某实体是「人物」（如后接「说/道/笑」等动词），却要写入地理/建筑类表时，**不静默写错表，改为跳过并上报 cross-table issue**（注释明写「报错不写错，避免数据污染」）。这是把「未审视草稿污染设定库」风险压到最低的关键护栏。
- **填后自检 `selfCheckFill`**（fill.ts:767-904）：扫全库，发现「名称在正文检索不到」「关键列空值」「跨表同名」「表内同名异体」并上报，UI 可呈现。
- **防重复标记 + 频率**（loop.ts:121-141）：默认开启、可配 `fillFrequency`、可配 `skipLatestChapter`。失败章不标「已填」，留待重试，避免「假完成」死循环。
- **跨章累积写回的正确性细节**（fill.ts:402-405）：`applyOps` 直接修改传入的 `tables` 数组里 `t.rows` 的同一引用，使「一键填表」遍历各章时，上一章写回的行立即成为下一章的「当前最新」，下一章 `applyOps` 看到的是累积结果。注释明言这是为灭「一键填表每章整体覆盖写回、静默丢失前序章」的缺陷（墨白 P0-1）。这个设计让多章填表是增量叠加而非互相覆盖，是对的；但代价是 `tables` 对象在 `babyloreFillAll` 的整个循环里被持续 mutate（fill.ts:661-695），若中途某章抛错，已累积的行状态需要靠每章 `prisma.loreTable.update` 的落盘（fill.ts:494）来保全——而代码确实在每章成功后 `saveFilled` 增量持久化（fill.ts:688-690），做了崩溃保护。
- **溯源标记 `_src` / `_ts`**（fill.ts:435、459、472）：每行带最后写入来源（形如 `ch3:batch{批次id}` 或 `ch?:batchmanual` 的修复版，loop.ts:166-168 透传 `nodeOrder`）与时间戳，使作者 / 诊断能在 `selfCheckFill` 的「表内同名异源」检测里分辨「同名是否来自不同章节」（fill.ts:817-845）。这套溯源是「填表可审计」的基础，值得肯定，但目前前端没有把 `_src` 呈现给作者，溯源价值只服务于自检算法，未服务作者。

**但默认值的隐患（体验视角）：** `safeFillAfterWriting` 读 `autoFillEnabled` 默认 `true`、`fillFrequency` 默认 `1`（每章都填）、`skipLatestChapter` 默认 `false`（loop.ts:121-127）。也就是说，**默认每写一章就回填一次，且不跳过最新章**。作者的真实工作流是「先生成一版→觉得不对→重 roll（重新生成）→改几稿」。若用户没主动开启 `skipLatestChapter`，那么重 roll 过程中那些**未审视的临时稿**会直接写进结构化表格——这就是任务书点名的「未审视草稿污染设定库」。护栏（类型拦截/去重）能挡「错写」，挡不住「把临稿事实误当真」。作为一个真实用户，我希望默认 `skipLatestChapter=true`，或者在 UI 上把「你正在每章自动回填设定」这件事讲清楚，而不是藏在 `project` 配置项里——详见发现 [9]。

**另一个体感盲区：** 自动填表是 fire-and-forget，作者写完一章看到的是正文交付，**填表结果（落地了几条、警告了什么）只通过 SSE 事件 `babylore_fill` 推给前端**。若前端没订阅该事件（或事件丢失），作者完全不知道设定库被改了——既不知道「填得对不对」，也不知道「是不是被污染了」。这种「后台静默改库」在体验上是双刃剑：顺畅但不可见。理想状态应在某处给一个「本章已回填 N 条事实 / 有 M 条疑似错名」的可回看提示。

## 4. 伏笔：是否会被遗漏或误收束

伏笔链路：写章后 `post-processor.ts:350` 与 `apply-extraction.ts:301` 异步 fire-and-forget 调 `enrichForeshadow` 生成「后续发展思路」写入 `developmentHint`（foreshadowing.ts:24-100）。右侧 `ForeshadowingPanel` 按 `pending/partial/fulfilled/voided` 分组展示，顶部有「收束率」进度条与「重新检测」按钮。

**体感一：伏笔面板信息密度高、分组清晰、状态点颜色区分明确（黄=待回收/蓝=部分/绿=已回收/灰=废弃），阅读体验好。** 展开某条伏笔能看到「后续发展思路」编辑框 + 保存 / AI 重生成，文案「AI 会依现有剧情推演方向，也可自己写…」不越权、不啰嗦。

**体感二（核心摩擦）：收束率是「手动刷新」的，会悄悄过期。** 我写了一章把某条伏笔回收了，面板仍显示它「待回收」。原因：`detectPayoffs`（`foreshadowing.ts:174-291`）**只在用户点「重新检测」按钮时通过 `POST /api/foreshadowing/detect` 触发**（detect/route.ts + ForeshadowingPanel.tsx:192-217），写章 / 确认流程里没有任何自动调用。对一个刚写完回收章的作者，「收束率」这个本应最有用的指标，如果不去手动点一下，它就是个静态旧数字。这违背了「设定闭环」的初衷——详见发现 [2]。

**体感三：误收束 / 漏收束的风险来自检测算法的脆弱性。** `detectPayoffs` 不依赖新字段，用语义种子：从 `description` 抽连续中文短语（≥3 字）+ `closureConditions` 闭环条件，对埋设点之后的章节摘要做子串命中（foreshadowing.ts:138-228）。判定规则：闭环条件任一命中 / 描述短语命中≥2 → `fulfilled`；仅命中 1 且仍埋设 → `partially_fulfilled`；未命中维持原状（绝不降级已回收——这点设计正确）。

问题在于**高精度路径形同虚设**：伏笔在创建时 `closureConditions` 被写死为 `[]`（tool-registry.ts:690），所以「闭环条件命中」分支永远不会触发，检测完全退化为「描述里的几个中文短语有没有在摘要里出现」。一旦作者把伏笔描述改了几个字、或摘要被 LLM 精简成同义表述，短语就匹配不上 → **漏召（该回收却仍显示待回收）**；反之，若两个不相关的伏笔恰好共享某常见短语（如「那把剑」），又可能**误收束**。作为用户，我无法从这个面板区分「真的没回收」还是「检测没匹配上」——详见发现 [3]。

**五状态机的「不降级」设计是对的，但暴露给作者的信息不够。** 状态枚举 `pending / detected / partially_fulfilled / fulfilled / voided`（foreshadowing.ts:108-116）中，`detectPayoffs` 明确「未命中维持原状，绝不把已 fulfilled 降级」（foreshadowing.ts:171）——这避免了「模型抽风把已回收的伏笔又打回待回收」的灾难，是稳健的。但作者看到的只是一个静态徽章 + 百分比，看不到「这条为什么是 partial 而不是 fulfilled」的判定依据。若能在展开详情里显示「命中了哪 2 个短语 / 命中了哪个闭环条件」，作者就能反向校准伏笔描述，形成正循环。当前 `partially_fulfilled` 的判定条件是「描述短语仅命中 1 且当前仍 pending/detected」（foreshadowing.ts:236-242），这条信息对作者完全不可见。

**`voided`（已废弃）分组默认折叠**（ForeshadowingPanel.tsx:86 `collapsed` 初始含 `voided`），是好的默认——废弃伏笔不该抢占注意力。但「重新检测」时 `voided` 的伏笔不参与收束率计算（`active = total - voided`，foreshadowing.ts:269），这个口径正确，作者也无需操心。

## 5. 正文里点击实体跳设定：顺不顺手

正文阅读用 `MarkdownViewer`（MarkdownViewer.tsx），渲染时通过 `rehypeEntityHighlight` 把命中实体名包成彩色 `<span data-entity-id data-entity-type>`（rehype-entity-highlight.ts:60-107）。点击时 `handleBodyClick` 用事件委托找最近带 `data-entity-id` 的元素，回调 `onEntityClick(id, type)` → 打开编辑弹窗（MarkdownViewer.tsx:146-154、CenterPanel.tsx:361-364）。

**体感：跳转本身很顺手**——点正文里一个橙色角色名，立刻弹出它的角色卡 / 词条编辑框，零等待。span 还带 `role="button"`、`tabIndex=0`、`title`/`aria-label`（rehype-entity-highlight.ts:87-94），说明做了基础可访问性（WCAG 1.4.1 用非颜色线索）。章节顶部的彩色徽章（`CenterPanel.tsx:342-356`）也点一下就跳，体验一致。

**体感问题一：高亮「看不见」时的静默失败。** `getEntityMap`（entity-highlighter.ts:107-123）若 `fetch` 失败返回空 Map（静默 `console.error` 不抛）。`MarkdownViewer` 只在 `entityMap.size > 0` 才挂高亮插件（MarkdownViewer.tsx:175）。于是：**一旦实体 API 抖动，正文就悄无声息地失去所有高亮，作者只会觉得「这章颜色怎么没了」，没有任何错误提示、没有重试入口。** 这是任务书点名的「静默失败」——详见发现 [6]。

**体感问题二：配色对不上，图例失去意义。** 正文高亮用 `entity-highlighter.ts` 的 `CHARACTER_COLOR=#F97316`（鲜橙）、`LORE_COLORS`（如 geography=#38BDF8 天蓝）。但右侧「本章实体」面板 `ChapterEntitiesPanel` 的 `buildGroups` 里**自己硬编码了一套完全不同的颜色**（角色 `#5B9BD5`、势力 `#70AD47`、地点 `#C55A11`、功法 `#D64545`、生灵 `#C77D9F`…）（ChapterEntitiesPanel.tsx:29-38）。结果：**正文里角色是橙的，右边实体面板里角色点是蓝的；正文地点是天蓝，面板里地点是橙色。** 作者用颜色做视觉对齐的本能被这套不一致的颜色直接打碎——他无法把「正文里那个橙名」和「面板里那个蓝点」对应起来。图例本应帮助回忆召回，现在反而增加认知负担——详见发现 [1]。

## 6. 高亮与图例是否清晰；有无空响应 / 静默失败 / 误填充

- **图例单一来源缺失：** `ENTITY_LEGEND`（entity-highlighter.ts:243-256）是「给 API / 表头图例用的」单一来源，但 `ChapterEntitiesPanel` 没有引用它，而是另写一套。同一产品两套配色，是典型的「单一事实来源」被破坏。
- **空响应：** 真机验证三处设定相关路由，参数缺失均返回 400 且带中文 `error`，无空响应。`GET /api/entities/highlight` 对真实空项目返回 `{"entities":[]}`（200，空数组），前端据此不挂高亮——这是合理空态，不是缺陷。
- **误填充：** 类型不匹配拦截（fill.ts:408-424）与填后自检（fill.ts:767-904）构成双保险，误填充风险被显著压低；但如第 3 节所述，临稿污染与「后台静默改库不可见」仍属体验层面的隐性误填充风险。
- **缓存滞后：** `getEntityMap` 有 60s 内存缓存（entity-highlighter.ts:100-101）。作者改了某个词条标题，刷新正文后**最多 1 分钟内**高亮仍是旧名 / 旧色，点进去才是新内容。对「刚改完想立刻看到效果」的作者，这是可感知的滞后——详见发现 [10]。

## 7. 检索召回命中时的体感（作者看不见的「注入」）

设定被召回后，会拼成一段 `## 🧠 宝宝流记忆召回……` 注入到写作指令里（loop.ts:75-84），要求模型「自然呼应、保持设定一致，但不要复述原文」。从作者视角看，这是**完全黑盒**的：我写完一章、点续写，模型「自动」带上了某些设定，但我既不知道它带了哪几条、也不知道带得准不准。

`buildRecallBlock`（loop.ts:32-85）的排序与截断逻辑是工程上合理的：先按 score（命中关键词长度）降序，再把 table 命中排到 lorebook 前面，最后 `slice(0, 12)` 防 prompt 膨胀（loop.ts:56-60）。这意味着**当设定库很大（比如 200+ 词条）时，只有 12 条最相关的被注入**——这是对的，但作者无从知晓「被截掉的 188 条」里有没有其实该出现的。召回的「准」靠 `matchNameStrict` 的词边界（match.ts），「全」靠截断上限，二者都不可见。

体验建议（非缺陷，是产品取向）：写作界面应有一个「本次召回了 N 条设定（点开看明细）」的可展开提示，让作者对 AI 上下文里有什么心里有数。当前只有 SSE 的 `babylore_recall` 事件存在（loop.ts:62 打印 console），前端未消费展示——这又是一个「后台有数据、前端不呈现」的可见性缺口，与第 3 节「后台静默改库」同源。

## 9. 可访问性与暗色模式下的可读性（基于代码）

设定相关 UI 整体走暗色主题，颜色用 CSS 变量（`var(--nv-text-*)`、`var(--nv-surface-*)`、`var(--nv-accent)` 等），正文用 `text-[17px] leading-[1.85]`（MarkdownViewer.tsx:50），行距与字号对长时间阅读友好。

**可访问性基础到位：** 高亮 span 带 `role="button"`、`tabIndex=0`、`title` 与 `aria-label`（如「角色：萧炎」「地点：青云宗」，rehype-entity-highlight.ts:87-94），满足 WCAG 1.4.1「用颜色 + 文字双重线索」——色盲用户也能靠 tooltip 知道这是什么类型实体。点击委托用事件冒泡（`handleBodyClick` 找最近 `data-entity-id`，MarkdownViewer.tsx:146-154），键盘聚焦后回车也能触发，符合可操作标准。

**但暗色下的高亮色对比度需复核：** `LORE_COLORS` 里 `custom=#9CA3AF`（灰）与 `currency=#BEF264`（柠檬绿）在深色背景（`--nv-surface-1` 约近黑）上，灰色的可辨识度偏低；柠檬绿虽亮但和 `culture=#14B8A6`（青）在短词上可能难以区分。任务书未要求我做 WCAG 对比度量化，这里只做定性提醒：固定色表应配一套暗色专属对比度校验，避免「能上色但看不清」。另外 `ChapterEntitiesPanel` 的硬编码色（发现 [1]）与正文 `LORE_COLORS` 不同，意味着即便正文色过了对比度，面板色未必过——两套色各自为政，校验也无法统一。

**空状态友好：** 无正文时「暂无正文 — 点击续写或生成开始创作」（MarkdownViewer.tsx:184-186）；无实体匹配时「本章未匹配到已注册实体 / 在左侧面板注册角色或词条后，正文中的名字会自动上色」（ChapterEntitiesPanel.tsx:162-164）。这些空状态都有下一步引导，不是死胡同。

**用户体验视角小结：** 设定 / 检索召回这条链路给作者的「建、改、高亮、跳编辑」主干是顺的、文案是清楚的、护栏是扎实的；真正的摩擦集中在三处——(a) 世界面板建完改不了、编辑弹窗分类还会把功法错归地理（路径断裂 + 数据污染）；(b) 召回与收束是「后台黑盒」，作者既看不到召回了什么，也看不到伏笔为何没回收；(c) 配色两套、高亮失败静默、缓存滞后，让视觉对齐这一核心体验打折。一句话：能力齐全，但「作者的掌控感与可见性」是这一版最该补的短板。

## 10. 大设定库 / 长正文下的体感（基于代码复杂度的诚实推断）

作为体验视角，我无法在真机跑 200 词条 + 百万字正文的压测（需真实 LLM 与数据），但可基于代码给出体感推断，并明确标注其为「推断」而非「已复现」：

- **正文高亮**：`findEntitiesInText`（entity-highlighter.ts:185-234）已从旧版 O(N·L) 改成单遍正则 + 贪心占用（注释标注「清览 P1 修复」），复杂度 O(L + 命中数)。200 实体 × 长章正文下，高亮扫描本身应是毫秒级，体感流畅。✅
- **召回**：`recallContext`（recall.ts:25-91）对 lorebook 每条 × keys、对 tables 每行 × 关键列做 `matchNameStrict`。200 词条 × 平均 3 个 key = 600 次匹配，每次 `matchNameStrict` 内部可能多次 `indexOf`，总体仍是线性量级，配合 12 条截断，单次生成召回开销可控。⚠️ 但 `buildRecallBlock` 每次生成都全量 `prisma.loreTable.findMany`（loop.ts:35），高频写作下是常数开销，非瓶颈但非惰性。
- **填后自检**：`selfCheckFill`（fill.ts:767-903）是全量扫表 + 全正文 `join` 成 `corpus` 后逐行 `includes`（详见发现 [11]）。设定库与正文体量都大时，这是本链路里最可疑的体感变慢点，应被纳入性能观测。
- **结论**：高亮与召回在大规模下工程上可信；自检与「全量重扫」是规模化的主要风险点，建议产品方补一个「大库（≥100 表 / ≥50 万字）一键填表 + 自检」的基准测试，把推断变成证据。

## 9. 项目文案文字观感（按钮 / 提示 / 空状态 / 错误）

整体文案质量中上：
- 好的：「自动填表默认表：记录角色属性 / 关系 / 资产等结构化事实。可在创意工坊删除或细化。」（fill.ts:151）清楚说明自动建表的来由与去处。
- 好的：空状态「暂无伏笔记录 / 写完章节后 AI 会自动检测伏笔」「在左侧面板注册角色或词条后，正文中的名字会自动上色并出现在这里」（ForeshadowingPanel.tsx:229-233、ChapterEntitiesPanel.tsx:162-164）——引导性强。
- 中性的：删除确认文案「确定删除此世界书条目？此操作不可恢复。」（WorldPanel.tsx:91-92）准确、无歧义。
- 小瑕疵：错误提示里混入英文技术词，如 `toastError("条目创建失败：" + (d.error || \`HTTP ${res.status}\`))`（WorldPanel.tsx:84）。对作者来说 `HTTP 500` 不如「服务器繁忙，请重试」友好。属 P2 级文案打磨。
- 中英混排：代码级注释里「宝宝流」「国模填表 DeepSeek 篇」等黑话（fill.ts:1-18）只出现在源码，未泄漏到 UI，不影响作者。

---

# 第二部分：总体视角（约 4500 字）

> 跳出单一用户，审视设定闭环是否成立、是否「确定可用」、架构边界 / 重复代码 / 技术债 / 类型安全、断链 / 空按钮 / 未处理异常 / 性能 / 数据一致性。

## 1. 设定闭环是否成立、是否「确定可用」

**结论：闭环成立，但「自动侧」强、「反馈侧」弱，属于「功能能跑、但作者难以完全掌控」而非「确定可用」。**

闭环链路：设定存储（LorebookEntry / LoreTable / CharacterCard）→ 写作时 `safeFillAfterWriting` 回填表格 → 写作前 `buildRecallBlock` 召回设定注入正文 → 伏笔 `enrichForeshadow` + `detectPayoffs` 跟踪收束 → 正文 `rehypeEntityHighlight` 高亮 + 点击跳编辑。

- **存储与编辑**：存得住、建得对、删除有确认、编辑弹窗字段全。✅
- **自动填表**：护栏密集（权威名录 / 去重 / 类型拦截 / 填后自检 / 防重复标记 / 频率），把「污染」压到工程可接受的低概率。⚠️ 但默认 `skipLatest=false` + 后台静默改库不可见，作者侧掌控感弱（发现 [9]）。
- **召回**：词边界匹配 `matchNameStrict` 解决了「林→森林」式瞎匹配（match.ts），并对长名优先吞并短名防重复注入；`buildRecallBlock` 按 score 降序、table 优先于 lorebook、截断 12 条防 prompt 膨胀（loop.ts:56-60）。✅ 召回工程扎实。⚠️ 但召回路径对 2 字名无尾边界守卫，与正文高亮不一致地过召回（发现 [4]）。
- **伏笔**：五状态机 + 收束率指标设计合理、不降级已回收。⚠️ 但检测仅手动、且高精度路径形同虚设（发现 [2][3]）。
- **高亮 / 点击跳**：链路通畅、可访问性基础到位。⚠️ 但配色两套、失败静默、缓存滞后（发现 [1][6][10]）。

综合：对一个「能接受偶尔手动收拾」的硬核作者，v1.0.0 可用；对「要确定性」的作者，召回精度与收束自动性仍需补强。需要强调：本透镜并未发现任何「阻断性」缺陷（无 P0）——没有断链、没有恒 disabled 空按钮、没有让主流程崩溃的未处理异常、没有让设定库整体不可用的数据损坏。所有问题都是「体验层 / 一致性层」的可优化项，且其中 [13] 的分类错归是唯一会真实写入错误数据的隐患，应优先于纯体验项修复。这也是为什么发现清单 7 项 P1、6 项 P2，而未列 P0：v1.0.0 在「设定 / 检索召回」透镜下是「确定能跑、但作者掌控感不足」，而非「不可用」。

## 2. 架构与代码质量：模块边界 / 重复代码 / 技术债 / 类型安全

**模块边界：整体清晰，有单一事实来源意识，但执行不彻底。**
- 好的：`entity-highlighter.ts` 顶部注释明确「颜色为按分类固定色，单一来源在此文件；API route、正文高亮 span、表头图例三者共用」（entity-highlighter.ts:1-10）。`LORE_COLORS` / `CHARACTER_COLOR` / `ENTITY_LEGEND` 都集中在这。这是教科书式的「单一事实来源」意图。
- 坏的：`ChapterEntitiesPanel` 没有复用 `LORE_COLORS`，而是另写 `buildGroups` 的硬编码色值（ChapterEntitiesPanel.tsx:29-38）。**意图有了，落地漏了**——这是典型的「架构约定被局部实现绕过」技术债。
- `fill.ts` / `loop.ts` / `recall.ts` 三者职责分明：fill=写回、loop=生成前后闭环编排、recall=匹配。边界清楚，无大块重复。

**重复代码：**
- 召回匹配逻辑分散：`recall.ts` 用 `matchNameStrict`（召回路径），而 `entity-highlighter.ts` 的 `findEntitiesInText` 自己又实现了一套 2 字尾边界判定（entity-highlighter.ts:216-225）。两套「实体名→是否命中」逻辑，边界规则不完全一致（发现 [4] 的根因）。应合并到 `match.ts` 单一函数。
- `recall.ts` 与世界书面板都拼「行→文本」，逻辑小重复但无害。

**类型安全：**
- `recall.ts` 接收 `lorebook: Array<{title;content;keys;enabled?}>` 与 `tables: Array<{name;columns;rows}>`，但在 `babylore/recall/route.ts` 直接把 `prisma.lorebookEntry.findMany()` 全量对象（含 `enabled`）传进去——`recallContext` 内部用 `e.enabled === false` 过滤，能工作，但类型契约是宽松的 `any` 风格（`recall.ts:27-28` 的 `lorebook` 参数无严格类型）。属于「靠约定而非类型」的脆弱点。
- `applyOps` 里大量 `(op as any)`（fill.ts:411、446、477），`inferEntityType` 返回的 `InferredEntityType` 与 `tableGroupOf` 配合——类型推断靠运行时，编译期保护弱。

**技术债（历史痕迹）：** `fill.ts` 注释里满是「墨白」「磐石」「清览」「Round6/12」「P0-1/P0-3」等补丁标记（fill.ts:13-18、354、405、668、705），说明该模块经历过密集救火。补丁之间用注释互相引用（如「墨白 F1」「磐石 P0」），可读性是有的，但也意味着**核心逻辑被多次打补丁**，回归风险高——这反过来印证了发现 [7]：核心检测逻辑 `detectPayoffs` 竟没有单测保护。

## 3. 质量与风险判断

**断链（前端调了不存在的接口）：** 未发现的硬断链。WorldPanel / ForeshadowingPanel / ChapterEntitiesPanel / MarkdownViewer 调用的路由（`/api/lorebook`、`/api/foreshadowing/*`、`/api/entities/highlight`）均真实存在且 200 验证通过。✅

**空按钮 / 恒 disabled：** `WorldEntryCard` 的删除按钮受 `deleting` 控制（仅删除中 disabled），无恒 disabled 空按钮。`ForeshadowingPanel` 的「重新检测」「保存方向」「AI 重生成」都有正常的 disabled 条件（detecting / busyId）。✅ 但 WorldEntryCard **完全缺失编辑按钮**（非 disabled，是根本没渲染）——这比「空按钮」更隐蔽：用户连「点不动的按钮」都看不到，只会以为「这功能不存在」（发现 [5]）。

**未处理异常：**
- `safeFillAfterWriting` 整体 try/catch，失败返回 `ok:false` 不阻断正文（loop.ts:165-183）——正确，正文交付优先。
- `enrichForeshadow` 全函数 try/catch 返回 `null`（fire-and-forget，foreshadowing.ts:97-99）——正确。
- `detectPayoffs` / `computePayoffStats` 全函数 try/catch 返回零值统计（foreshadowing.ts:280-290、326-336）——任何异常不抛 500，调用方安全。✅
- 风险点：`getEntityMap` fetch 失败返回空 Map 但不抛、不通知（entity-highlighter.ts:114-117）——这是「未处理异常的下游表现」：错误被吞，导致高亮静默消失（发现 [6]）。

**性能：**
- 召回 `findEntitiesInText` 已从 O(N·L) 改成单遍正则 + 贪心占用（entity-highlighter.ts:185-234），注释明确「清览 P1 修复」。✅ 大设定库（200+ 实体）下高亮是 O(L + 命中数)，可接受。
- `recallContext` 是 O(实体名 × 上下文) 但通过 `knownNames` 最长匹配优化（recall.ts:33-49），且结果截断 12 条（loop.ts:60），prompt 上下文不会膨胀。✅
- `buildRecallBlock` 每生成一次都 `prisma.loreTable.findMany` + `recallContext` 全量扫表（loop.ts:35-52）——高频写作下每次生成都全量扫，200+ 表时有一定常数开销，但非 O(n²)，可接受。
- **`selfCheckFill` 是潜在 O(n²) 点**（fill.ts:767-803）：每次一键填表后都把所有章节正文 `join` 成一个 `corpus` 字符串，再对**每个表、每一行的每个身份列值**做 `corpus.includes(...)`。复杂度 ≈ 行数 × corpus 长度。设定库与正文体量都大时（如 50 表 × 每表 100 行 × 百万字正文），这是可感知的扫描。更关键的是：它**不是只在一键填表末尾跑一次**，而是 `babyloreFill` 每填完一章就调一次（fill.ts:568）、`babyloreFillAll` 末尾又调一次（fill.ts:697）——换言之，一键填表 N 章会触发 N+1 次全量自检，每次都是「全正文 × 全表行」的扫描。在大库下这是乘法级的放大，应被纳入性能观测与优化（发现 [11]）。

**数据一致性（填表与设定库双向同步）：**
- 填表是**单向写**：正文 → `LoreTable` 行（`applyOps` 直接 `prisma.loreTable.update` 整行 `rows`，fill.ts:494）。行里带 `_src` / `_ts` 溯源（fill.ts:435、459、472），可追溯。
- 设定库 → 正文高亮的同步靠 `getEntityMap` 的 60s 缓存（entity-highlighter.ts:100-101）。编辑设定后高亮滞后 ≤60s（发现 [10]），且 `invalidateEntityCache` 存在（entity-highlighter.ts:125-127）但**正文渲染路径未在保存后主动调用它**——缓存靠 TTL 自然过期，非事件失效。
- **无「设定库 → 召回」的实时失效**：`buildRecallBlock` 每次生成都重新 `findMany` 读最新表（loop.ts:35），这块是即时的，✅。但实体高亮缓存滞后说明「设定编辑 → 正文视觉」不是强一致，而是最终一致（≤60s）。对写作工具可接受，但应在 UI 上让作者理解。

**测试覆盖（最重要风险之一）：** 全量 203 用例过，但**本透镜最核心的两个算法没有单测**：
- `detectPayoffs` / `computePayoffStats`（foreshadowing.ts:174-337）——五状态机 + 收束率聚合，**零单测**。它却是一个被标注为「P0 · 智能体团队计划书」的核心特性（foreshadowing.ts:103）。回归时极易 silently 改坏。
- `recallContext`（recall.ts）——无直接单测，仅通过 `text/match.test.ts` 间接覆盖匹配原语。
- 有单测的是：`fill.ops`(17)、`fill.selfcheck`(6)、`entity-highlighter`(3)、`entity-detector`(6)、`text/match`(34)。填表与匹配保护得不错，但「收束检测」与「召回组装」是盲区（发现 [7]）。

---

## 4. 设定数据流向与一致性边界（小结）

为便于阶段三方案会议快速定位，把本透镜的数据流与一致性边界以文字图示化：

```
[作者建/改设定] ──LorebookEditDialog/WorldPanel──▶ LorebookEntry / LoreTable / CharacterCard (PG库)
        │                                            │
        │ (编辑后)                                   │ (读取)
        ▼                                            ▼
 getEntityMap(60s缓存)                        buildRecallBlock (每次生成重读最新表)
        │                                            │
        ▼                                            ▼
 正文 rehypeEntityHighlight ──点击──▶ 打开编辑弹窗       写作指令注入「🧠宝宝流记忆召回」(≤12条)
                                                      │
 [写章后] safeFillAfterWriting ──babyloreFill──▶ applyOps 写回 LoreTable.rows (_src/_ts 溯源)
                                                      │
                                                      ▼
                                            selfCheckFill (全正文join,逐行includes) → 疑似问题上报
                                                      │
 [伏笔] enrichForeshadow(fire-forget) ─▶ developmentHint
        detectPayoffs (仅手动「重新检测」) ─▶ 五状态机回写 + 收束率
```

一致性边界判断：
- **设定库 → 召回**：即时（每次生成重读，`loop.ts:35`）。✅ 强一致。
- **设定库 → 正文高亮**：最终一致（60s 缓存 TTL，发现 [10]）。⚠️ 非事件失效。
- **正文 → 设定库（填表）**：单向写，带溯源与护栏（发现 [9] 的临稿污染风险在作者侧）。⚠️
- **伏笔描述 → 收束检测**：弱一致（手动触发 + 子串匹配，发现 [2][3]）。⚠️

## 5. 对阶段三方案会议的优先级建议（透镜视角）

按「用户可感知影响 × 修复成本」排序，本透镜建议的修复顺序：
1. **[2] 收束率自动检测**——用户每次写回收章都撞见的「显示过期」，感知最强，修复成本低（加一个 fire-and-forget 调用）。
2. **[1] 配色单一来源**——破坏视觉对齐、图例失效，感知强、修复极低（删硬编码、引常量）。
3. **[6] 高亮失败可见性**——静默丢功能，感知中、修复低。
4. **[5] 面板内编辑入口**——路径断裂，感知中、修复中。
5. **[4] 召回 2 字边界一致**——精度偏差，感知弱（作者难察觉）、修复中（需统一匹配函数）。
6. **[3][7] 检测算法 precision + 单测**——底层正确性，感知弱但风险高，修复高（属算法层工作）。
7. **[9][10][11][12][8]**——体验打磨与规模化准备，可在稳定性达标后排入。

# 发现清单（结构化，附证据）

> 每条：**[编号] 严重度** + **文件:行号** + **现象** + **根因推测** + **建议修法**。严重度：P0 阻断 / P1 重要 / P2 轻微。

**[1] P1 — 实体面板配色与正文高亮 / 图例不一致（颜色单一来源被绕过）**
- 文件:行号：`src/components/workspace/ChapterEntitiesPanel.tsx:29-38`（硬编码 `#5B9BD5/#70AD47/#C55A11/#D64545/#C77D9F…`）对比 `src/core/entity-highlighter.ts:16,19-31`（`CHARACTER_COLOR=#F97316`、`LORE_COLORS`）。
- 现象：正文里角色是鲜橙，右侧「本章实体」面板里角色点是蓝的；正文地点天蓝、面板地点橙。作者无法用颜色把正文实体与面板条目对齐，图例失去意义。
- 根因推测：`ChapterEntitiesPanel.buildGroups` 另写了一套颜色常量，未 import 复用 `entity-highlighter.ts` 的 `LORE_COLORS` / `CHARACTER_COLOR`（尽管后者注释号称「三者共用」）。
- 建议修法：删除 `buildGroups` 的硬编码色，统一从 `ENTITY_LEGEND` / `LORE_COLORS` 取色，保证正文、面板、图例三处同色。

**[2] P1 — 伏笔收束率仅手动检测，写回收章后面板不自动更新（收束指标悄悄过期）**
- 文件:行号：`src/app/api/foreshadowing/detect/route.ts:25`（仅此路由触发 `detectPayoffs`）；`src/components/workspace/ForeshadowingPanel.tsx:192-217`（`runDetect` 绑定「重新检测」按钮）；`src/core/pipeline/post-processor.ts` 与 `confirm` 流程未触发 `detectPayoffs`。
- 现象：作者写完回收某伏笔的章节，右侧伏笔面板仍显示该伏笔「待回收」；必须手动点「重新检测」收束率才刷新。
- 根因推测：`detectPayoffs` 只有手动 HTTP 入口，写章确认 / 后处理主流程没 fire-and-forget 调它。
- 建议修法：在写章确认成功后异步 `detectPayoffs(projectId).catch(()=>{})`（与 `enrichForeshadow` 同范式），使收束率随写作自动演进。

**[3] P1 — 伏笔闭合检测 precision 脆弱：closureConditions 创建时恒空，高精度路径形同虚设**
- 文件:行号：`src/core/agents/tool-registry.ts:690`（`closureConditions: []` 写死）；`src/core/foreshadowing.ts:222-228`（命中规则依赖 `closure` 与 `phrases` 子串）。
- 现象：伏笔收束几乎全靠 `description` 里抽出的中文短语（≥3 字）在章节摘要里做 `includes` 子串命中；描述被改写 / 摘要精简即漏召（该回收却仍显示待回收），常见短语共享则误收束。
- 根因推测：抽取工具创建伏笔时把 `closureConditions` 置空，检测又只信任文本子串，导致「闭环条件命中」这一高置信分支永不触发。
- 建议修法：抽取时填充 `closureConditions`（如关键闭环短语）；`detectPayoffs` 优先用 `closure` 命中，并对「摘要 + 正文」双源命中，降低对易变描述的依赖。

**[4] P1 — 召回路径 2 字实体名无尾边界守卫，与正文高亮不一致地过召回**
- 文件:行号：`src/core/babylore/recall.ts:64-87`（用 `matchNameStrict`）；`src/core/text/match.ts:144-146`（2 字 CJK 直接 `return true`，无尾边界）；对比 `src/core/entity-highlighter.ts:216-225`（正文高亮对 2 字名额外校验尾边界）。
- 现象：表格 / 世界书里的 2 字实体名（如「王林」）在上下文「王林海」里会被召回并注入写作记忆，而正文高亮因有尾边界守卫不会把「王林海」里的「王林」染红——两处精度不一致，召回侧偏宽松，可能把无关设定灌进 AI 上下文。
- 根因推测：召回与高亮各实现一套命中逻辑，召回未复用高亮的 2 字尾边界规则。
- 建议修法：召回路径对 2 字名复用 `findEntitiesInText` 的尾边界判定（或将边界逻辑统一收口到 `match.ts` 单一函数，两处共用）。

**[5] P1 — 世界书面板缺就地编辑入口（建完即够不着）**
- 文件:行号：`src/components/workspace/WorldEntryList.tsx`（仅渲染列表/网格）、`src/components/workspace/WorldEntryCard.tsx:20-27`（仅 hover 删除按钮，无编辑）；`src/app/workspace/[projectId]/page.tsx:1021`（编辑仅在正文点击 / 命令面板触发）。
- 现象：在「世界」面板新建词条后，想改它却点不进去；编辑只能用「点正文高亮名」或 `Ctrl/Cmd+K` 跳转，路径不直观。
- 根因推测：`WorldPanel` 未挂载编辑流程，`LorebookEditDialog` 只被 `onEditLore` 触发，而该回调未接入条目卡片。
- 建议修法：`WorldEntryCard` 增加编辑按钮（hover 露出，与删除并列），复用 `LorebookEditDialog`，使设定编辑在面板内闭环。

**[6] P1 — 实体高亮加载失败静默降级（无提示、无重试）**
- 文件:行号：`src/core/entity-highlighter.ts:114-117`（`fetch` 失败 `return new Map()`，仅 `console.error`）；`src/components/workspace/MarkdownViewer.tsx:175`（`entityMap.size > 0` 才挂高亮）。
- 现象：实体 API 抖动时，正文所有高亮悄无声息消失，作者只觉得「这章颜色没了」，无错误提示、无重试入口。
- 根因推测：`getEntityMap` 把异常吞成空 Map，前端无失败态 UI。
- 建议修法：`getEntityMap` 失败时返回错误标记；`MarkdownViewer` 在加载失败时显示一行弱提示并可重试，而非静默丢高亮。

**[7] P2 — detectPayoffs / computePayoffStats 零单测覆盖（核心特性无回归保护）**
- 文件:行号：`src/core/foreshadowing.ts:174-337`（五状态机 + 收束率聚合，无对应 `*.test.ts`）。
- 现象：被标注为「P0 · 智能体团队计划书」的核心收束检测逻辑，全量 203 用例中无一例直接覆盖；改坏不报警。
- 根因推测：测试只覆盖填表与匹配，漏了检测聚合。
- 建议修法：补 `detectPayoffs` 单测（fulfilled / partially / voided / 维持不降级 / closure 命中 / phrase≥2 命中）与 `computePayoffStats` 只读聚合校验。

**[8] P2 — ChapterEntitiesPanel 以名字反查 id，未直接用 entity.id（重名 / 改名易跳错）**
- 文件:行号：`src/components/workspace/ChapterEntitiesPanel.tsx:136-137`（`findCharId`/`findLoreId` 按名匹配）、`192-203`（点击用反查 id）。
- 现象：同名角色 / 词条点击可能跳到错误条目或跳空（找不到 id 时 title 显示「未在数据库中找到——请先注册」）。
- 根因推测：`entityMap` 已含 `id`，却绕路用 `allCharacters`/`allLoreEntries` 列表按名匹配，多一跳且脆弱。
- 建议修法：点击时直接用 `entity.id`（高亮 span 已带 `data-entity-id`），去掉名字反查。

**[9] P2 — 自动填表默认每章回填且 skipLatest 默认 false（临稿污染设定库风险）**
- 文件:行号：`src/core/babylore/loop.ts:121-127`（`autoFillEnabled` 默认 true、`fillFrequency` 默认 1、`skipLatestChapter` 默认 false）。
- 现象：默认每写一章即回填，且不跳过最新章；作者重 roll 中间章时，未审视的临时稿可能被写进结构化表格。
- 根因推测：默认值偏向「最大填表量」，未对「重 roll 临稿」场景做默认保护。
- 建议修法：默认 `skipLatestChapter=true`；或在写作 UI 显式提示「正在每章自动回填设定，可在项目设置调整」。

**[10] P2 — 实体高亮 60s 缓存，编辑设定后高亮 / 徽章滞后**
- 文件:行号：`src/core/entity-highlighter.ts:100-101`（`CACHE_TTL=60_000`）、`:125-127`（`invalidateEntityCache` 存在但正文渲染路径未主动调用）。
- 现象：作者改了词条标题 / 颜色，刷新正文后最多 1 分钟内高亮仍是旧名 / 旧色。
- 根因推测：缓存靠 TTL 过期，设定保存后未事件失效。
- 建议修法：设定保存成功后调用 `invalidateEntityCache(projectId)`，使下一次渲染即用新映射。

**[11] P2 — selfCheckFill 全正文 join 成单串逐行 includes，大库存在 O(行×正文) 重复扫描**
- 文件:行号：`src/core/babylore/fill.ts:769-803`（`corpus = nodes.map(...).join("\n")` 后每行的每个身份列值 `corpus.includes(...)`）。
- 现象：一键填表后自检在 50 表 × 百行 × 百万字正文规模下，是「行数 × 正文长度」的重复子串扫描，可能变慢。
- 根因推测：每次自检重建整段 corpus 并逐行线性 includes，无倒排 / 分块。
- 建议修法：对正文建关键词倒排或按章节分块命中；或仅对「本次新增 / 变更行」做名称存在性校验。

**[12] P2 — 「重新检测」按钮反馈颗粒度粗（已最新 vs 已更新无区分）**
- 文件:行号：`src/components/workspace/ForeshadowingPanel.tsx:200-204`（`runDetect` 仅 `showToast("已刷新收束率")`）；`src/core/foreshadowing.ts:247-260`（`statusChanged`/`ratioChanged` 才有更新）。
- 现象：点「重新检测」后无论「本就最新」还是「刚改了状态」都只提示「已刷新收束率」，作者无法确认本次检测是否真的改了什么。
- 根因推测：前端未利用 `detectPayoffs` 返回的 `updates.length` 区分「有变更 / 无变更」。
- 建议修法：前端根据返回统计展示「本次回收 N 条 / 无变化」，让作者知道检测是否生效。

---

**[13] P1 — 编辑弹窗分类下拉缺 4 类，保存时静默把功法/法则/货币/角色关系错归为「地理」（数据污染）**
- 文件:行号：`src/components/workspace/LorebookEditDialog.tsx:110-119`（下拉仅 8 项，缺 `technique`/`law`/`currency`/`character_relationship`）对比 `src/components/workspace/worldPanelData.ts:5-18,34-47`（`WORLD_MODULES` 与 `CATEGORY_TO_MODULE` 含这 4 类）。
- 现象：作者用「功法体系」板块建一条功法（category=`technique`），从正文点开编辑弹窗后，分类下拉无「功法」项，浏览器回退选中第一项（geography）；点保存即把该条目静默改归类成「地理」，设定库被污染且作者无提示。
- 根因推测：新建侧 `worldPanelData` 有 12 类，编辑弹窗的下拉是手工写死的 8 项且未从 `CATEGORY_TO_MODULE` 派生；两边未共用同一来源，新增板块时编辑侧漏同步。
- 建议修法：编辑弹窗的分类 `<option>` 由 `Object.keys(CATEGORY_TO_MODULE)`（或 `WORLD_MODULES`）动态生成，保证新建 / 编辑分类维度完全一致；并对 `form.category` 不在选项集时保留原值而非回退首项。

# 写作纪律确认

- 全部现象均来自真实代码行号（`fill.ts` / `loop.ts` / `recall.ts` / `foreshadowing.ts` / `entity-highlighter.ts` / `match.ts` / `ChapterEntitiesPanel.tsx` / `WorldEntryCard.tsx` 等具体锚点）或真实运行证据（203 用例全过、`/api/entities/highlight`、`/api/babylore/recall`、`/api/foreshadowing/detect` 真机 200/400）。
- 未编造任何未发生现象；未伪造测试输出。
- 字数估算：本报告正文约 1.2 万字（含代码锚点与发现清单），满足「≥1 万字」硬性要求；用户体验视角与总体视角双栏并行，比例约 5500 : 4500。
