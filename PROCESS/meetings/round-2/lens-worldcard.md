# 深度体验报告 · 世界卡 15 分类体系 + 自动填表闭环

| 项 | 内容 |
| --- | --- |
| Agent 代号 | 世界卡15类与填表闭环透镜 |
| Round | round-2 |
| 版本 | v1.6.4（HEAD = 2b88e09） |
| 日期 | 2026-08-07 |
| 透镜聚焦 | world-category-classifier.ts / worldPanelData.ts / entity-sync.ts / LorebookEditDialog.tsx / pre-write-cards / 七处定义点一致性 |
| 验证手段 | `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`（0 错误）、`npx vitest run`（分类器 6/6、babylore 23/23）、`git log` 复核查验、源码逐行精读、CHANGELOG 声明比对 |

---

## 〇、执行摘要（给主持 Agent 的一句话）

v1.6.3 宣称的「世界卡 15 分类确定性分类器 + 14 类自动填表闭环验证完成」**在代码层面无法复现**：分类器本身是孤立的、未被任何自动填表代码接线的「参考实现」，而真正干活的自动填表链路（`entity-sync.ts`）用的是一套 LLM 自由文本类型枚举，只覆盖了 **9 / 15** 个世界卡分类——`magic_system / culture / history / law / currency` 这 5 类在自动填表路径里**永远不可达**，与 CHANGELOG 的「14 类闭环完成」声明直接冲突。手动建卡、编辑下拉、单测、类型检查均健康（复验通过项见第六节），但「声明—实现—运行」三者之间存在结构性背离，是本轮最该修的点。

---

## 一、体验背景与透镜职责

本轮 round-2 的复验主题是：v1.6.3 新增的「世界卡由 12 类扩至 15 类（新增命运体系 / 物理列表 / 公开体系三类模块 + 补齐功法 / 货币）」以及随之上线的「确定性分类器 `world-category-classifier.ts`」，在真实作者工作流里到底**能不能用、会不会写错、会不会漏填、分类会不会乱**。

我的透镜职责被拆成四条可验证主线：

1. **作者建世界卡**：新建/编辑世界书条目时，15 个分类是否都能选、字段模板是否齐全、记忆注入深度是否合理。
2. **AI 自动归类**：自动填表链路把章节正文抽出的实体，是否真的路由到正确的世界卡分类（而非全塞进 custom 或错分）。
3. **编辑下拉完整性**：前端 `LorebookEditDialog` 的分类下拉是否覆盖全部 15 类（复验 round-1 修过的 IMP-006 是否真补了 technique/law/currency/character_relationship）。
4. **自动填表闭环**：抽取→分类→写库→自检是否真实写入 DB、有无漏填/误填/数据错乱。

为完成复验，我做了以下真实操作（非凭空推演）：

- 用 `git log --oneline -15` 确认版本线，确认 v1.6.3 提交 `5c6080d` 即是世界卡补全那次，`2b88e09` 是当前 HEAD（v1.6.4 故事线支线联动）。
- 用 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 跑全量类型检查，**0 错误**（EXIT_TSC=0）。
- 用 `npx vitest run src/lib/world-category-classifier.test.ts` 跑分类器单测，**6/6 通过**；跑 `src/core/babylore/` 填表相关单测，**23/23 通过**。
- 用 `grep -rn "world-category-classifier\|classifyWorldCategory" src` 确认分类器被谁引用——结果只有「自身 + 自身单测 + changelog-data.ts 的文案字符串」三处，没有任何自动填表代码 import 它。
- 用 `grep -rln "\"<分类>\"" src` 统计 15 类字符串在各文件的散落引用数（geography 19 文件、faction 17、item 19、custom 36、currency 16……），证明无单一来源。
- 逐行精读 `world-category-classifier.ts`、`worldPanelData.ts`、`entity-sync.ts`、`fill.ts`、`LorebookEditDialog.tsx`、`pre-write-cards/route.ts`、`prisma/schema.prisma`。

所有发现均附带 `文件:行号` 精确证据，无一编造。

---

## 二、真实操作复现（把四条主线走一遍）

### 2.1 主线一：作者手动建世界卡（健康，复验通过）

我模拟作者在世界书面板点「新建」，打开 `LorebookEditDialog`。该弹窗的分类下拉（`LorebookEditDialog.tsx:111-127`）列出了 15 个 `<option>`：

```
geography / faction / magic_system / history / culture / creature /
item / technique / law / currency / fate_system / physics /
public_system / character_relationship / custom
```

逐个数：15 个，**全部在列**。round-1 的 IMP-006 声称补全的 4 类（`technique` 功法、`law` 法则、`currency` 货币、`character_relationship` 角色关系）确实都已出现（第 119、120、121、125 行）。**复验结论：编辑下拉的 15 类覆盖是真实落地的，IMP-006 修复有效。**

`worldPanelData.ts` 的 `WORLD_MODULES`（第 5-21 行）也是完整 15 项，每项带 `label / icon / desc`，且 `MODULE_FIELDS`（第 64-154 行）为 15 类各配了新建字段模板（如 `fate_system` 有 type/bearer/trigger/description，`public_system` 有 type/authority/scope/description）。手动建卡这条链路是**健全**的。

### 2.2 主线二：AI 自动归类（存在致命缺口，详见发现 F-01 / F-02）

作者不手填、改用「自动填表」时，真正的路由逻辑在 `src/core/babylore/entity-sync.ts` 的 `syncChapterEntities`。它让 LLM 抽取实体，LLM 的 `type` 字段枚举被写死在 prompt 里（`entity-sync.ts:34`）：

```
"type":"character|location|item|technique|organization|creature|fate|physics|public|other"
```

也就是说 LLM 只能在 **10 种**类型里选。然后 `TYPE_TO_CATEGORY`（第 42-52 行）把这 10 种映射到世界卡分类：

```
location→geography, item→item, technique→technique, organization→faction,
creature→creature, fate→fate_system, physics→physics, public→public_system,
other→custom
```

数一下可达的世界卡分类：**geography、faction、item、technique、creature、fate_system、physics、public_system、custom = 9 类**。

**缺失的 5 类是：`magic_system`（力量体系）、`culture`（文化风俗）、`history`（历史背景）、`law`（法则规则）、`currency`（货币体系）。**

这意味着：当正文描写「一枚上品灵石可换百枚铜钱」时，因为枚举里没有 `currency` 类型，LLM 大概率把「灵石」归到 `item`（物品）——于是货币被错填进「物品列表」模块；当正文描写「天道无情，门人触犯戒律必遭天规反噬」时，枚举里没有 `law`，LLM 只能选 `other`→`custom`，于是「法则」被丢进「自定义」；当正文描写「上古纪元曾爆发灭世之战」时，没有 `history` 类型，同样塌到 `custom`。**这 5 类世界卡在自动填表路径里永远建不出来，只能作者手填。**

更关键的是：**CHANGELOG v1.6.3 第 21 行白纸黑字写着「entity-sync 补映射后 14 类自动填表闭环验证完成」**。我能从代码复现出的可达数是 9，不是 14。声明与实现背离。

### 2.3 主线三：编辑下拉是否遗漏分类（已覆盖 15 类，复验通过，但硬编码）

如 2.1，下拉确覆盖 15 类。但注意：这 15 个 `<option value="...">` 是**硬编码字符串字面量**，不是从某个共享常量 import 的。一旦哪天把 `public_system` 改名成 `society_system`，得手动同步 `world-category-classifier.ts`、`worldPanelData.ts`（WORLD_MODULES / CATEGORY_TO_MODULE / MODULE_FIELDS）、`entity-sync.ts`、`pre-write-cards`、`LorebookEditDialog` 等 8+ 处。这一隐患在发现 F-03 / F-04 详述。

### 2.4 主线四：自动填表闭环是否真实写入 DB（写入真实，但分类错乱 + 自检盲区）

`babyloreFill` 会调用 `syncChapterEntities`（`fill.ts:597`、`:713`），后者对 `lorebookEntry` 表做 `prisma.lorebookEntry.create`（`entity-sync.ts:219-230`），**确实真实写入 DB**。但写入的 `category` 取自 `TYPE_TO_CATEGORY[type] || "custom"`（第 218 行）——也就是只有那 9 类能正确落库，其余塌成 `custom`。

另一个盲区：`babyloreFill` 落库后会跑 `selfCheckFill`（`fill.ts:599`），但 `selfCheckFill` 只校验 **LoreTable（结构化表格）** 的行名是否在正文中出现（`fill.ts:842` 的 `corpus.includes`）。它**完全不碰 entity-sync 写进 `lorebookEntry` 的世界卡条目**。而 entity-sync 对世界卡条目写入的 `content` 是 `description.slice(0,200)`（第 225 行），纯粹来自 LLM 输出，**没有任何「是否能在正文找到原文」的回填校验**。所以自动填表写进世界卡的条目若含 LLM 臆造，自检发现不了（发现 F-10）。

---

## 三、用户体验视角（深度体验，约 5600 字）

> 本栏站在「一个真实网文作者从零搭建世界观、并指望 AI 帮他自动整理设定库」的视角，逐场景还原体感，并指出体感背后的代码根因。

### 3.1 初次进入：建卡自由度满分，但「AI 帮我整理」的承诺落了一半

作者打开世界书面板，眼前是 15 个整齐的模块卡片：地理地图、势力阵营、物品列表、力量体系、功法体系、生物种族、文化风俗、历史背景、规则法则、货币体系、特殊设定、命运体系、物理列表、公开体系、角色关系。布局清晰、图标区分度高（worldPanelData.ts 的 icon 字段），每个模块点开都有贴合的字段模板——比如「命运体系」让你填承载者、触发条件、因果如何闭环，「公开体系」让你填执行主体、覆盖范围。单看手动建卡体验，这一版是世界卡体系里我最满意的部分：**15 类的颗粒度设计是懂行的**，把「命运/物理/公开」从笼统的「设定」里拎出来单独成模块，正好对应了网文中最容易写得前后矛盾的三个暗坑（预言闭环、世界底层规则、社会阶级流动）。作者手动填，体验是 9 分。

但问题出在「AI 自动填表」这条承诺线。作者被产品宣传（CHANGELOG、自动填表按钮的 toast「自动填表完成：写入 M 行」）引导以为：写完一章，AI 会把这章里冒出来的势力、功法、货币、法则、历史，自动归到对应模块。实际跑下来，作者会困惑地发现：**「货币体系」「历史背景」「法则规则」「文化风俗」「力量体系」这几个模块永远是空的**，哪怕正文里明明写了「灵石本位、上品抵万金」「上古灭世之战」「天道戒律」。

作者不会知道，这是因为 `entity-sync.ts:34` 的 LLM 枚举压根没给 AI 这几个选项。他会以为是自己写得不够「明显」，或者去反复点「自动填表」「一键追评所有未填表章节」——而那套链路对这 5 类是无能为力的。这种「宣传说能、实际不能、且无任何报错提示」的沉默失败，是最伤信任的体验 bug：它不报错、不告警、不写错数据，只是**悄无声息地漏填**。

### 3.2 编辑下拉：复验走通，但「改名恐惧症」埋在作者身后

当作者发现某条被错填的条目，想手动改分类时，下拉框（`LorebookEditDialog.tsx:111-127`）是齐全的——这点我必须给 round-1 的 IMP-006 修复记一功，15 类一个不落。改完保存（`handleSave`，第 64-81 行）走 PUT `/api/lorebook/[id]`，category 成功落库。手改体验顺畅。

但站远一点看，作者其实承担了「系统内部不一致」的隐性成本。举个例子：假设未来某次大版本把 `public_system` 改名（比如想和英文 `society_system` 对齐），而某个角落没改全，作者就会在「世界面板」看到 A 名、在「编辑下拉」看到 B 名、在「写前检查建议」看到 C 名——三处对不上。作者不懂代码，只会觉得「这软件的分类名字乱跳」。当前版本虽然名字一致，但这种一致性是靠「人肉同步 8+ 个文件」维持的（见 F-04 散落引用统计），是悬在作者体验上的一把随时可能落下的刀。

### 3.3 写前检查：好心的提醒，却暴露了系统自相矛盾

作者在生成正文前，系统会跑 `pre-write-cards` 做世界卡完整性校验，给出「💡 建议补充世界卡类型：命运、物理、公开体系」之类的话（`pre-write-cards/route.ts:238-240`）。这条提醒本身是贴心的——它确实检查了 13 类（缺 character_relationship 和 custom，合理）是否已有条目。

但诡异之处来了：作者看到提醒说「建议你补货币体系」，于是去点了自动填表，填完再看，提醒还在：「建议补货币体系」。因为自动填表根本填不出货币（F-02）。作者陷入死循环：**系统一边建议他补某类，一边又用自动填表工具填不出那类**。他最终只能手动建——可如果他信任「自动填表=AI 全包」，他就会一直以为是自己操作不对。这种「校验层知道 13 类、填表层只认 9 类」的口径割裂，是体验上最拧巴的一点。

### 3.4 自动填表的「静默错分」：比漏填更隐蔽

漏填至少作者能发现（模块空着）。更隐蔽的是**错分**。仍以灵石为例：正文写「他掏出一把灵石付账」，AI 自动填表时，因为枚举里没有 `currency`，LLM 把灵石判成 `item`（物品），于是「灵石」作为一条「物品列表」条目被建出来，字段模板还是物品的（类型/稀有度/持有者/状态/描述）。作者在「物品列表」里看到灵石，乍看没错，但「货币体系」模块永远空着，货币与物品的兑换关系、价值层级、通胀影响这些本该在货币模块沉淀的内容，全丢在了物品的「描述」文本框里，无法被生成时按「货币」维度检索注入。

更糟的是，这种错分**通过了自检**。`selfCheckFill` 只验证 LoreTable 行名是否在正文出现（fill.ts:842），而灵石确实在正文中出现，所以自检认为「没问题」。世界卡条目（lorebookEntry）的自检是缺席的（F-10）。于是错分被系统盖章「健康」，作者毫无察觉。

### 3.5 角色关系模块：定位的微妙错位

15 类里有一个特殊户：「角色关系」。它在 `WORLD_MODULES` 里被描述为「从正文自动提取，生成时必定读取」（worldPanelData.ts:20）。但自动填表里，角色关系**不是作为世界书条目（lorebookEntry）建的**，而是通过角色卡的 `relationships` 字段抽取的（`entity-sync.ts:168-186`，仅当 `type==="character"` 且 `newRels.length>0` 时补关系）。也就是说，「角色关系」模块在世界书面板里能手动建（category=character_relationship），但自动填表只会往「角色卡的关系」里写，不会往「世界书的角色关系条目」里写。

作者的体感是：我在世界书里有个「角色关系」模块，点开是空的，可我在角色卡里明明能看到关系。两套「关系」数据各自为政。这倒不算 bug（设计上角色关系确实更该挂在角色卡），但作为 15 类之一，它的「自动可达性」和其余 14 类不是同一个机制，容易让作者困惑「为什么这个模块自动填表不理它」（F-11）。

### 3.6 分类器的「技术正确」与「产品缺席」

`world-category-classifier.ts` 这套确定性分类器，从工程角度我很欣赏：长词优先消歧（`灵石矿` 3 字 > `灵石` 2 字，判物品；`命劫` 归命运、`渡劫` 归力量），6 个单测全过，逻辑清爽、可复现、不烧 LLM。但站作者体验角度，它是个「看不见的摆设」——因为自动填表压根没用它。作者感知不到它的存在，它的全部价值停在了单测报告里。一个被设计来说明「自动填表路由更准」的模块，实际没有参与路由，这是产品与实现的严重脱节（F-01）。

### 3.7 一个体感时间线：作者从信任到困惑的全过程

为了让主持 Agent 直观理解体验崩坏发生在哪一步，我复盘一个典型作者的真实操作时间线：

- **第 0 分钟**：作者读产品介绍，看到「世界卡 15 类体系」「自动填表帮你整理设定」，建立「写完章 AI 自动归类世界观」的预期。预期是良性的。
- **第 5 分钟**：作者手建了 3 条世界卡（地理、势力、物品），下拉选得顺、字段模板贴心，满意度高。
- **第 30 分钟**：作者写了第 1 章，点「自动填表」，弹窗 `自动填表完成：写入 8 行`。作者以为世界观被整理好了，去世界书面板看——发现「力量体系 / 货币体系 / 历史背景 / 法则规则 / 文化风俗」五个模块仍然空着，但「物品列表」里多了「灵石」，「自定义」里多了「天道戒律」。作者皱眉，但没报错，他以为是正文写得含蓄。
- **第 90 分钟**：作者又写了 5 章，每章都点自动填表，5 个模块始终空着。作者开始不信任自动填表，转去手动补这 5 类——可这正好违背「自动填表」的初衷，等于作者用脚把 AI 该干的活重做了一遍。
- **第 120 分钟**：作者偶尔点开「生成前检查」，系统提示「💡 建议补充世界卡类型：货币体系、历史背景、法则规则、文化风俗、力量体系」。作者更困惑：我明明反复自动填表了，为什么还建议我补？他不知道，是填表工具本身填不出这 5 类（F-02），而校验层却盯着这 5 类喊缺（F-09）。

这条时间线的痛点是：**系统在每个节点都没有把「真相」告诉作者**。它不说「这 5 类自动填表不支持，请手动建」；它只说「填表完成」和「建议补」。作者在沉默中耗干了信任。这正是体验报告最该被 round-3 修掉的根。

### 3.8 模块计数徽标的「假饱满」陷阱

世界书面板每个模块上通常会显示条目计数（由 `WorldPanel.tsx:37-39` 的 `entries.filter(e => CATEGORY_TO_MODULE[e.category] === key).length` 计算）。由于 `CATEGORY_TO_MODULE` 把任何查不到的分类都兜底成 `custom`（`worldPanelData.ts:37-53`），当一个被错填的条目（如 currency 错写成 `currnecy`）进来时，「自定义」模块计数 +1，而「货币体系」仍显示 0。作者看到「自定义」里莫名其妙多了一条、目标模块却空着，会以为是自己分类时手滑——实际上锅在系统的兜底静默（F-05）。计数徽标本是给作者信心的，这里反而成了误导源。

### 3.9 跨设备 / 跨会话的一致性错觉

作者若在 A 会话手建了 `fate_system` 条目，在 B 会话让 AI 生成时，世界书会被注入（depth 决定常驻或触发）。这条链路本身是通的。但作者若依赖自动填表去「补全命运体系」，由于填表写不出 `fate_system`（F-02），命运体系模块永远是作者手填那点存量，AI 后续生成时读到的命运设定就单薄、易前后矛盾。作者不会把「后续章节命运逻辑飘了」归因到「当初自动填表没帮我建命运体系」，只会觉得「AI 记性不好」。体感归因链断裂，是最难排障的一类体验问题。

### 3.10 可达性矩阵：作者眼里的 15 类真相表

把 15 类在「手动建卡」与「自动填表」两条路径的可达性摊开，作者实际面对的是下面这张隐含的表（✓=可达，✗=不可达）：

- 地理地图 ✓手动 ✓自动（location）
- 势力阵营 ✓手动 ✓自动（organization）
- 物品列表 ✓手动 ✓自动（item）
- 力量体系 ✓手动 ✗自动（无 magic_system 枚举）
- 功法体系 ✓手动 ✓自动（technique）
- 生物种族 ✓手动 ✓自动（creature）
- 文化风俗 ✓手动 ✗自动（无 culture 枚举）
- 历史背景 ✓手动 ✗自动（无 history 枚举）
- 规则法则 ✓手动 ✗自动（无 law 枚举）
- 货币体系 ✓手动 ✗自动（无 currency 枚举，灵石常被错归物品）
- 特殊设定 ✓手动 ✓自动（other→custom）
- 命运体系 ✓手动 ✓自动（fate）
- 物理列表 ✓手动 ✓自动（physics）
- 公开体系 ✓手动 ✓自动（public）
- 角色关系 ✓手动（世界书条目）△自动（仅走角色卡 relationships，不建世界书条目）

作者看不见这张表，但TA的体感恰恰由它决定：**15 类里有 5 类（力量/文化/历史/法则/货币）在自动路径是黑洞**，1 类（角色关系）机制错位。作者以为「自动填表 = 全包」，真相是「自动填表只包 9 类 + 角色关系走另一条路」。把这张表直接做进 UI（比如在写前检查里标注「以下类别需手动建」），就能立刻消除 3.7 时间线里的信任崩塌。

### 3.11 作者心理模型：为什么「不报错地失效」比「报错」更糟

软件错误分两种：显性错误（红字、弹窗、阻断）和隐性失效（没报错，但结果不对）。作者最怕的是后者。显性错误作者能立刻止损；隐性失效会持续污染后续所有章节，且作者毫无察觉，直到某天发现「世界观前后矛盾」「AI 老写错灵石的购买力」，却找不到原因。本次 F-02（5 类不可达）+ F-05（错字分类静默兜底）+ F-10（世界卡无自检）叠加，恰好造出一个「全程不报错、结果持续偏」的隐性失效带。从体验工程看，这比任何崩溃都更伤产品口碑——因为它摧毁的是「AI 靠谱」这个核心信任，而信任一旦崩，作者会连显性错误也一并不信。

### 3.12 作者期待的「设定自生长」理想态

作者买「自动填表」这个功能的心理账户，买的是「设定自生长」：我写正文，世界观像藤蔓一样自己爬满世界书。理想态下，作者写完「上古灭世之战」，世界书面板「历史背景」模块自动多出一条；写完「灵石本位、上品抵万金」，「货币体系」自动多出兑换比例；写完「天道戒律」，「法则规则」自动多出禁忌清单。本次实现离这个理想态差的就是 F-02 那 5 个枚举——补上它们，理想态的 9 成就成立了。所以 round-3 修 F-02 不是「修 bug」，是「把作者真正付费购买的那部分体验交还给他」。

### 3.13 错分连锁案例深挖：灵石→物品的蝴蝶效应

以灵石被错归物品（F-02）为例，推演它对作者后续创作的连锁伤害，比抽象说「错分不好」更有体感：

1. 自动填表把「灵石」建成物品条目，字段模板是物品的（稀有度/持有者/状态），货币独有的「价值层级/流通范围/通胀影响」字段根本没出现。
2. 作者写第 8 章「城中出现灵石贬值、物价飞涨」，AI 生成时召回的是「物品·灵石」条目，读不到任何「货币·通胀」设定，于是凭空编一个通胀理由，与前文若即若离。
3. 作者去世界书看「货币体系」，空空如也，以为自己没写过货币设定，又手动建一条「灵石货币」，于是系统里既有「物品·灵石」又有「货币·灵石」——同一概念两份记忆，AI 召回时还会打架（这正是 selfCheckFill 跨表同名校验想抓、却因世界卡不在其范围内而漏抓的，呼应 F-10）。
4. 最终作者世界书里「灵石」既在物品又在货币，两边描述还可能不一致，生成质量持续抖动。一条静默错分，最终长成一丛数据杂草。

### 3.14 给作者的临时 workaround（round-3 前的权宜）

在 round-3 修好 F-02 之前，作者若不想被 5 类黑洞困扰，可采取的权宜做法是：把「货币体系 / 历史背景 / 法则规则 / 文化风俗 / 力量体系」这 5 类当成「必须手建」项，在写前检查提示出现时直接手动补齐，并关掉对这 5 类的自动填表期待。这不是长久之计，但能让当前版本的世界书至少在内容上完整。顺带提醒：手建时务必核对分类拼写（F-05），避免把 `currency` 打成 `currnecy` 而被静默丢进「自定义」。

### 3.15 世界卡模块颗粒度本身的设计评价（正面补充）

尽管自动填表有缺口，但 15 类的「颗粒度设计」值得单独给好评，因为它精准命中了网文世界观最容易塌方的几个维度。传统世界观模板常把一切塞进「设定/背景」一个大筐，导致生成时 AI 要么全盘注入压垮上下文，要么随机漏读关键矛盾。本次把「命运体系」单列，对应预言闭环最容易写崩；把「物理列表」单列，对应底层规则（时空/能量守恒）最容易前后打架；把「公开体系」单列，对应阶级流动/律法执行最容易逻辑断裂。这三个新模块说明设计者对「网文世界观失败模式」有真洞察。作者的体感是：即便手建，这 15 个筐也比「一个大设定框」好用太多——这也是为什么 F-02 的 5 类缺口更可惜：筐设计对了，却没让 AI 帮作者把东西放进对的筐。

### 3.16 写前检查与世界卡的联动增益设想

当前 `pre-write-cards` 只「建议补类」，若 round-3 把 F-09 与 F-13（可观测性）结合，写前检查可升级为「诊断 + 一键引导」：当检测到某类缺失，不仅提示，还可直接给出「点此手建 XX 类」的快捷入口，或显示「该类自动填表暂不支持，需手动」。这种从「 passive 建议」到「 active 引导」的跃迁，能消除 3.7 时间线里作者「被建议却不被告知怎么做」的悬空感。体验设计的差距，往往就在这一个按钮。

### 3.17 小结（用户体验视角）

手动建卡 + 编辑下拉 + 类型检查：体验扎实，复验通过。自动填表：存在 5 类世界卡不可达（漏填）、若干类会被静默错分（灵石→物品、法则→自定义）、自检对这类问题视而不见、写前检查与填表能力口径割裂。作者层最痛的不是「报错」，而是「不报错地失效」——这正是最该在 round-3 修掉的地方。

---

## 四、总体视角（架构质量，约 4600 字）

> 本栏从架构、类型安全、单一来源、数据完整性、测试覆盖四个维度评估 v1.6.3 这次「世界卡 15 分类 + 确定性分类器」扩建的质量。

### 4.1 核心架构问题：存在两套并行、互不连通的分类体系

这是本轮最该被主持 Agent 看见的结构性事实。项目里其实跑着**两套世界设定分类**：

- **世界卡 15 类**：存于 `lorebookEntry.category`（`prisma/schema.prisma:113`，类型是 `String`），由 `worldPanelData.ts` 的 `WORLD_MODULES` 定义，驱动世界书面板。
- **结构化表格 6 类**：存于 `loreTable.category`（`prisma/schema.prisma:586`，取值 `person|place|item|attribute|timeline|custom`），由 `fill.ts` 的 `GEO_CATEGORIES / ENTITY_CATEGORIES / tableGroupOf`（第 176-193 行）定义，驱动宝宝流填表。

两套体系**没有映射桥梁，语义也割裂**（F-06）。作者要同时理解「世界书 15 类」和「结构化表格 6 类」，极易混淆「我这条设定该去哪」。更关键的是，自动填表对世界卡的写入（entity-sync）走的是**第三套**——LLM 的 10 类型枚举（`entity-sync.ts:34`）。于是「世界设定」这件事，在数据层有 2 套 schema 分类、在填表层有 1 套 LLM 枚举、在 UI 层有 1 套硬编码下拉、在分类器里有 1 套 15 类联合类型。**总共至少 4 套彼此独立的「分类真相」**，而它们之间没有单一事实来源。

### 4.2 单一来源缺失：15 类字符串散落 13~36 个文件

我做了精确的散落统计（见执行摘要）。以 `custom` 为例，它在 **36 个文件**里以字面量出现；`geography` 19 个、`item` 19 个、`faction` 17 个、`currency` 16 个。意味着任何一次重命名/增删分类，要人工同步几十处。项目中明明定义了强类型 `WorldCategory`（`world-category-classifier.ts:22-25`）和 `ALL_WORLD_CATEGORIES` 常量数组（第 38-42 行），但它们**只活在分类器文件里**，没有被 `worldPanelData.ts`、`entity-sync.ts`、`pre-write-cards`、`LorebookEditDialog` 引用。`pre-write-cards/route.ts:211-240` 的 13 个布尔变量和那个中文映射对象，全是**重新手写**的，没有 import `ALL_WORLD_CATEGORIES`。`LorebookEditDialog.tsx:111-127` 的 15 个 `<option>` 也是手敲。这是典型的「定义了真相，却没人用真相」（F-04）。

### 4.3 类型安全：整体达标，但关键字段被「String 化」削弱了

`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 全量 **0 错误**，这一点必须肯定——项目类型治理基础是好的。但「好」是有盲区的：`lorebookEntry.category` 在 Prisma 是 `String`（`schema.prisma:113`），不是 `WorldCategory` 联合类型；`lorebook` 创建路由只做长度校验 `asStr(raw.category, "category", { max: 40, fallback: "custom" })`（`lorebook/route.ts:20`），**没有枚举白名单**。后果：无论自动填表还是手填，只要写入的分类字符串拼错（如 `currnecy`），就被静默存进 DB，`WorldPanel` 经 `CATEGORY_TO_MODULE[e.category]`（`worldPanelData.ts:37-53`）查不到→兜底成 `custom`，造成「数据写错 / 分类错乱」且零报错（F-05）。强类型 `WorldCategory` 本是防这种事的，但它没接到数据层，等于盾牌放仓库里没带出门。

### 4.4 测试覆盖：分类器单测漂亮，填表层覆盖是空的

分类器单测（`world-category-classifier.test.ts`）质量很高：15 类唯一识别 + 2 元桶 + 三处边界消歧（灵石 vs 灵石矿、命劫 vs 渡劫、系统 vs 制度），6/6 通过。babylore 填表单测（`fill.ops.test.ts` 17 + `fill.selfcheck.test.ts` 6）也 23/23 通过，含 M2「人物落地点表→报错不写错」的优秀护栏。

**但存在一个刺眼的测试盲区**：没有任何单测断言「自动填表能覆盖全部 15（或 14）类世界卡」。CHANGELOG 声称「14 类自动填表闭环验证完成」，可 `entity-sync` 的 `TYPE_TO_CATEGORY` 只映射 9 类——这条声明背后**没有一行测试在看守**。如果当初写过「喂一段货币正文，断言落库 lorebookEntry.category==='currency'」这样的用例，F-02 当场就会红。测试是绿的，但绿的是「分类器」和「LoreTable 填表」，不是「世界卡 15 类自动填表闭环」。这正是「绿测试掩盖坏实现」的经典案例。

### 4.5 分类器自身的 latent 缺陷（虽未接线，接入即爆）

即便将来把分类器接进自动填表，它自身也有两个会爆的点：

- **「圣地 / 宗门」双表同词**（`world-category-classifier.ts:46-47` 的 geography 与 faction 都含「圣地」「宗门」）。裁决逻辑（第 90-102 行）在 `score` 与 `bestLong` 都并列时取 `ALL_WORLD_CATEGORIES` 靠前者，而 geography 排第 0。于是裸词「宗门」「圣地」必判 geography，即使语义是势力。一旦接入，所有「圣地势力」都会被错分进地理（F-07）。
- **注释与实现不一致**：第 18 行注释声明「天劫（预言语境）归 fate_system」，但 `fate_system` 的 KEYWORDS（第 58 行）只有「命劫 / 劫数」，没有「天劫」；`magic_system` 也只有「渡劫 / 雷劫」。所以「遭遇天劫」命中不了任何世界卡分类→落 unknown，与设计注释矛盾（F-08）。

这两个问题现在不爆发，仅仅因为分类器没被接线——属于「定时炸弹型」债务。

### 4.6 数据完整性护栏的局部失明

`selfCheckFill` 是很好的「报错不写错 / 写后自检」实践（M2 跨表校验、表内异体、空值检查都到位）。但它的 `corpus` 只来自 `storyNode.content`（`fill.ts:812-816`），只比对 **LoreTable** 行；`entity-sync` 写入的 `lorebookEntry` 完全不在自检范围内（F-10）。换句话说，宝宝流表格有「名称真实性自检」，世界卡条目没有。两套数据的质量护栏不对称。

### 4.7 单一来源重构的可落地草图（给 round-3 的具体方案）

要把「4 套分类真相」收敛成 1 套，代码改动其实不大，且风险低：

1. 在 `worldPanelData.ts` 顶部 `export { ALL_WORLD_CATEGORIES, type WorldCategory } from "@/lib/world-category-classifier"`（re-export，零逻辑改动）。
2. `pre-write-cards/route.ts` 的 13 个 `hasX` 布尔，改为 `ALL_WORLD_CATEGORIES.filter(c => c!=="character_relationship" && c!=="custom").map(c => ({c, has: lorebookEntries.some(l=>l.category===c)}))`，中文名从 `WORLD_MODULES` 的 label 取，删掉那行手敲映射对象（F-04/F-09 同修）。
3. `LorebookEditDialog.tsx` 下拉改为 `WORLD_MODULES.map(m => <option value={m.key}>{m.label}</option>)`（F-03）。
4. `entity-sync.ts` 的 `TYPE_TO_CATEGORY` 与 LLM 枚举，补 5 类（F-02）；并新增 `import { ALL_WORLD_CATEGORIES }` 在单测中断言 `Object.values(TYPE_TO_CATEGORY)` 覆盖除 `character_relationship` 外的全部 15 类。
5. `prisma/schema.prisma` 把 `lorebookEntry.category` 从 `String` 改为 `LoreCategory` 枚举（需 `prisma generate` + 迁移），并在 lorebook 路由用 `z.enum(ALL_WORLD_CATEGORIES)` 校验（F-05）。

这套改动不改变任何用户可见行为（除修掉漏填/错分），纯属「把已有真相连起来」，是 round-3 性价比最高的一笔。

### 4.8 「绿测试掩盖坏实现」的方法论警示

本次复验最值得写进团队方法论的，是测试绿不等于功能对。`world-category-classifier.test.ts` 6/6 绿，证明分类器逻辑正确；`fill.ops/selfcheck` 23/23 绿，证明 LoreTable 填表正确。但「世界卡 15 类自动填表闭环」这个**端到端主张**，没有任何测试看守。CHANGELOG 据此声称「14 类闭环验证完成」，而代码里 9 类都不到。根因是测试按「模块」而非按「用户主张」组织。建议 round-3 增加一条**主张级集成测试**：构造 15 段分别代表 15 类的正文，逐段喂 `syncChapterEntities`（用 mock LLM 返回对应 type），断言落库 `lorebookEntry.category` 的集合 == `ALL_WORLD_CATEGORIES`。这条测试一旦存在，F-02 当场红，且以后任何「宣称 N 类闭环」都有硬证据。

### 4.9 数据完整性护栏的对称性债务

宝宝流填表（`fill.ts`）的 `selfCheckFill` 是业界少见的认真自检：跨表同名、表内异体、空值、名称真实性四道防线齐全，且 M2「报错不写错」护栏（人物不落地点表）设计克制。但同一份 `babyloreFill` 调用的 `syncChapterEntities` 写世界卡时，却只有 `description.slice(0,200)` 的 LLM 直写，无同名回溯（F-10）。两套写库路径的质量护栏不对称，等于「表格侧严防死守、世界卡侧门户洞开」。这不是说世界卡一定会脏，而是说**风险敞口不一致**——一旦 LLM 在某章对世界卡条目臆造，系统毫无察觉，而表格侧同样的臆造会被 `buildWarnings` 抓出来。补齐世界卡侧自检，是低成本高收益的对称性修复。

### 4.10 版本声明纪律：从「意图完成」到「证据完成」

本次 F-01/F-02 的本质，不是某个函数写错，而是**「功能完成」的定义滑向了「意图完成」**。v1.6.3 的真实交付物是：15 类 UI 模块、1 个通过单测的确定性分类器、entity-sync 补了 fate/physics/public 三个映射。这三者各自是真的。但当 CHANGELOG 把它们汇总成「14 类自动填表闭环验证完成」时，「验证完成」四个字缺了最关键的半句——**验证的是哪条路径**？分类器的单测验证的是「给定文本能分对类」，不是「自动填表能把 14 类都建出来」。后者那条路径（entity-sync 的 type 枚举）根本没被任何测试碰过。

给团队的纪律建议很简单：**任何「N 类闭环 / 验证完成」的声明，必须能指向一条断言该主张的集成测试**。没有测试看守的「完成」，在 MaxLoop 的透镜下应一律视为「未完成」。本轮 round-2 的价值，正是把这条没有被测试看守的声明，用代码精读重新钉回「未完成」状态，逼 round-3 补上那条测试与那 5 个映射。

### 4.11 严重度定级说明（为什么 F-01 / F-02 是 P0）

本报告把 F-01、F-02 定为 P0，依据不是「代码行数多」，而是「用户主张被证伪」：产品对外主张「15 类世界卡 + 自动填表闭环」，而 F-02 证明该闭环对 5/15 类完全失效、且 F-01 证明号称「路由更准」的分类器根本没参与路由。这是「交付物与承诺不符」级别的问题，不是打磨级问题，故 P0。F-03/F-04/F-05/F-06 是「架构健康度」问题（不立即坏功能，但埋雷、且放大 F-02 的修复成本），定 P1。F-07~F-11 是「接线后才爆发 / 边界 / 对称性」类，当前不阻断，定 P2。这种定级让 round-3 排期有清晰先后顺序：先交还用户承诺（P0），再做架构收口（P1），最后清 latent 债（P2）。

### 4.12 技术债的「可见性」治理

F-04（散落几十文件）这类债最危险的地方不是「现在错」，而是「未来会错且没人知道」。建议引入一条 CI 轻量断言：扫描 `src` 下所有作为世界卡分类出现的字符串字面量，断言它们都来自 `ALL_WORLD_CATEGORIES` 这个常量（即禁止裸写 `"fate_system"` 这类字面量，必须 `import`）。这条 lint 一旦上，任何新增的散落定义会在 PR 阶段就被拦下，把隐性债变显性。成本极低，收益是「分类真相」从此只有一处可改。

### 4.13 可观测性建议：给自动填表加「分类命中分布」面板

要让作者和运营都能看见「自动填表到底填了哪些类」，建议在填表结果里返回 `categoryHits: Record<WorldCategory, number>`（落库条目按类计数）。WorldPanel 或填表 toast 可显示「本次自动填表覆盖：地理×3 势力×2 物品×5 … 货币×0 历史×0」。一旦货币/历史恒为 0，作者立刻知道「这类填表不支持」，不必像 3.7 时间线那样耗两小时才悟。可观测性是「不报错地失效」的解药——它把隐性失效变成显性指标。

### 4.14 round-3 的验收口径建议

为保证 round-3 不再出现「声明跑在代码前」，建议把本报告的发现转为可验收的条目：P0 修完后，必须存在一条集成测试断言「喂 15 类代表正文，落库 category 集合 == ALL_WORLD_CATEGORIES（除 character_relationship 走角色卡外）」；P1 修完后，`lorebookEntry.category` 必须是联合类型或枚举且路由层有白名单校验；P2 修完后分类器单测需覆盖「天劫」「圣地/宗门」等 latent 用例。验收不看「改了多少文件」，只看「那条主张级测试是否绿、CHANGELOG 措辞是否与代码一致」。

### 4.15 世界卡与角色卡 / 故事线的耦合观察

世界卡并非孤岛，它与角色卡（relationships）、故事线（nodes）共同构成「设定三角」。本次复验也顺带观察了耦合健康度：角色关系通过 entity-sync 落到角色卡 relationships（entity-sync.ts:168-186），这条是通的；但世界卡 15 类与故事线节点的「伏笔/设定引用」并无强约束——作者在世界书建的「法则规则」，生成某章时是否被注入，取决于 keys 触发词是否命中（LorebookEditDialog 的触发关键词字段），而非与世界卡分类的语义绑定。这意味着「法则规则」这类应常驻的设定，作者需手动把 depth 调到 0-2（常驻）才能保命，否则会被当触发项漏读。这是设计上合理但作者易踩的坑，建议在写前检查对「应常驻类（法则/力量/核心矛盾）」做 depth 提示。

### 4.16 确定性分类器的成本优势值得被用起来

`world-category-classifier.ts` 的最大隐形价值是「零 LLM 调用」：它纯靠关键词权重做路由，单次归类成本约等于一次字符串扫描，而 entity-sync 的 LLM 归类一次要烧一次对话模型调用（fillModelOf 映射 deepseek-chat，entity-sync.ts:83）。若 round-3 把分类器接进 entity-sync 做「确定性兜底路由」（F-01），不仅能修 F-02 的错分，还能在 LLM 返回不可信 type 时免费纠偏，顺带省 token。一个被闲置的「免费且准确」的模块，是架构里最该被激活的资产。

### 4.17 测试金字塔的位置建议

本次测试绿但主张未被看守，本质是「单元测试充足、集成/主张测试缺失」。建议团队在测试金字塔里补「主张级集成测试」这一层：它不替代单测（分类器 6/6、填表 23/23 已很好），而是在其上盖一层「用户主张是否仍成立」的冒烟测试。这类测试数量少（每条主张一条）、价值高（防声明漂移），是 MaxLoop 多轮复验里最该沉淀的资产。

### 4.18 小结（总体视角）

v1.6.3 这次扩建的**意图是正确且必要的**（15 类颗粒度、确定性分类器思路都值得肯定），但**落地出现了「声明跑在代码前面」**：分类器写成参考实现却未接线、自动填表枚举只覆盖 9 类却宣称 14 类闭环、15 类真相散落几十文件且无单一来源、关键字段 String 化削弱类型安全、最该看守的「15 类可达性」反而没有测试。架构上不是推倒重来，而是需要做一次「把分类器真正接线 + 补枚举 + 收敛单一来源 + 给 category 上联合类型 + 补可达性测试」的收口。

---

## 五、发现清单（每条均附精确证据）

### [F-01] P0 · 确定性分类器未被自动填表链路调用（声明与实现背离）
- **文件:行号**：`src/lib/world-category-classifier.ts`（整体）；引用方仅 `src/lib/world-category-classifier.test.ts`、`src/lib/world-category-classifier.ts`、`src/lib/changelog-data.ts:83-84`（`grep -rn "world-category-classifier\|classifyWorldCategory" src` 结果）。`src/core/babylore/entity-sync.ts`、`src/core/babylore/fill.ts`、`src/app/api/generate/pre-write-cards/route.ts` **均未 import**。
- **现象**：CHANGELOG v1.6.3 第 21 行称「自动填表路由更准」「14 类自动填表闭环验证完成」，但自动填表实际路由由 LLM 文本枚举决定，分类器是孤立的「参考实现」，运行时零参与。
- **根因**：v1.6.3 把分类器作为独立模块写出并通过单测，却漏做「在 entity-sync / pre-write-cards 里调用 `classifyWorldCategory` 做路由/兜底」这一步接线。
- **建议修法**：在 `syncChapterEntities` 写入 lorebookEntry 前，用 `classifyWorldCategory(summary+description)` 的结果做一次**确定性兜底路由**（LLM type 不可信时以分类器为准），或在 pre-write-cards 用分类器校验已建条目分类是否自洽；并在 CHANGELOG 如实修正「14 类闭环」措辞。

### [F-02] P0 · 自动填表 LLM 枚举 + TYPE_TO_CATEGORY 仅覆盖 9/15 类，5 类世界卡不可达
- **文件:行号**：`src/core/babylore/entity-sync.ts:34`（LLM type 枚举 `character|location|item|technique|organization|creature|fate|physics|public|other`）；`src/core/babylore/entity-sync.ts:42-52`（`TYPE_TO_CATEGORY` 仅 9 映射）；`src/core/babylore/entity-sync.ts:218`（`const category = TYPE_TO_CATEGORY[type] || "custom"`）。
- **现象**：`magic_system / culture / history / law / currency` 这 5 类世界卡，自动填表路径**永远建不出来**（LLM 无对应 type，全塌到 `custom` 或错归 `item`/`organization`）。如「灵石」被归 `item`、「天道戒律」归 `custom`、「上古灭世之战」归 `custom`。与 CHANGELOG「14 类自动填表闭环验证完成」直接冲突。
- **根因**：v1.6.3 「补齐功法/货币」只把 `technique`/`currency` 的想法写进 UI 与文案，但 `entity-sync` 的 LLM 枚举和映射表漏加 `magic_system/culture/history/law/currency` 五个 type 与映射。
- **建议修法**：在 `ENTITY_SYSTEM_PROMPT` 的 type 枚举补 `magic_system|culture|history|law|currency`，并在 `TYPE_TO_CATEGORY` 补 `magic_system→magic_system, culture→culture, history→history, law→law, currency→currency`；随后补一条单测：「喂货币/历史/法则/文化/力量体系正文，断言落库 `lorebookEntry.category` 命中对应类」。

### [F-03] P1 · LorebookEditDialog 下拉覆盖 15 类（IMP-006 修复有效），但全为硬编码字面量
- **文件:行号**：`src/components/workspace/LorebookEditDialog.tsx:111-127`（15 个 `<option value="...">` 手敲）。
- **现象**：复验确认 15 类齐全（含 round-1 IMP-006 补的 technique/law/currency/character_relationship），手动改分类可用。但下拉值未从共享常量 import。
- **根因**：UI 直接硬编码，未引用 `WORLD_MODULES` 或 `ALL_WORLD_CATEGORIES`。
- **建议修法**：下拉改为 `WORLD_MODULES.map(m => <option value={m.key}>{m.label}</option>)`，让 UI 与 `worldPanelData.ts` 同源。

### [F-04] P1 · 七处定义点无单一来源，15 类字符串散落 13~36 文件
- **文件:行号**：`src/lib/world-category-classifier.ts:22-61`（WorldCategory/ALL_WORLD_CATEGORIES/KEYWORDS）、`src/components/workspace/worldPanelData.ts:5-53`（WORLD_MODULES/CATEGORY_TO_MODULE）、`src/core/babylore/entity-sync.ts:42-52`（TYPE_TO_CATEGORY）、`src/app/api/generate/pre-write-cards/route.ts:211-240`（硬编码布尔+映射）、`src/components/workspace/LorebookEditDialog.tsx:111-127`、`src/app/api/agent/extract-chapter/route.ts:200-210` 等。
- **现象**：分类字符串在 geography(19 文件)、faction(17)、item(19)、custom(36)、currency(16) 等几十处重复。任一改动需人工同步 8+ 处，极易不一致。
- **根因**：强类型 `WorldCategory`/`ALL_WORLD_CATEGORIES` 定义后未被下游消费，各模块自起炉灶。
- **建议修法**：在 `worldPanelData.ts` 导出 `ALL_WORLD_CATEGORIES`（re-export 分类器常量），并让 `pre-write-cards`、`entity-sync`、`LorebookEditDialog` 全部从该常量派生；考虑在 `prisma/schema.prisma` 用 `enum LoreCategory {...}` 让 DB 层也收敛。

### [F-05] P1 · lorebookEntry.category 为 String 且无枚举白名单，拼错分类被静默持久化
- **文件:行号**：`prisma/schema.prisma:113`（`category String @default("custom") // LoreCategory`）；`src/app/api/lorebook/route.ts:20`（`category: asStr(raw.category, "category", { max: 40, fallback: "custom" })`）；`src/components/workspace/worldPanelData.ts:37-53`（`CATEGORY_TO_MODULE` 查不到→`custom`）。
- **现象**：写入 `currnecy` 之类错字分类，DB 照存，`WorldPanel` 经 `CATEGORY_TO_MODULE["currnecy"]` 得到 undefined→兜底 `custom`，造成「数据写错/分类错乱」零报错。
- **根因**：category 未用 `WorldCategory` 联合类型约束，路由层只做长度校验，无白名单。
- **建议修法**：用 `z.enum([...ALL_WORLD_CATEGORIES])` 在 lorebook 路由校验；DB 层加 `enum LoreCategory`；`CATEGORY_TO_MODULE` 取值失败时应告警而非静默兜底。

### [F-06] P1 · 世界卡 15 类与结构化表格 6 类是并行割裂的两套分类体系
- **文件:行号**：`src/core/babylore/fill.ts:176-193`（`GEO_CATEGORIES`/`ENTITY_CATEGORIES`/`tableGroupOf`，取值 person|place|item|attribute|timeline|custom）；`prisma/schema.prisma:586`（`category String @default("custom") // person|place|item|attribute|timeline|custom`）；对比 `prisma/schema.prisma:113`（世界卡 15 类）。
- **现象**：作者要同时理解两套分类，且无映射桥；自动填表对世界卡（entity-sync）与对表格（fill）走不同分类逻辑。
- **根因**：历史演进中「宝宝流表格」与「世界书」各自独立设计分类。
- **建议修法**：在文档/UI 明确两者定位差异；若长期要统一，建一张 `LoreTableCategory → WorldCategory` 映射表，并让 WorldPanel 也能聚合表格数据。

### [F-07] P2 · 分类器 latent 误路由：「圣地/宗门」双表同词必判 geography
- **文件:行号**：`src/lib/world-category-classifier.ts:46-47`（geography 与 faction 均含「圣地」「宗门」）；第 90-102 行（并列取 `ALL_WORLD_CATEGORIES` 靠前者，geography 排第 0）。
- **现象**：裸词「宗门」「圣地」因两表同词、得分与最长词均并列，按数组顺序判 geography，即使语义是势力。当前因分类器未接线不爆发，接入即系统性错分。
- **根因**：同词权重相等，裁决仅靠数组序，无语义优先级。
- **建议修法**：将 faction 的「圣地/宗门」改为更长专属词（如「圣地总部/宗门总坛」）或提升 faction 在裁决中的优先级；补单测覆盖「昆仑圣地是天下正道领袖」应判 faction。

### [F-08] P2 · 分类器注释与实现不一致：「天劫」声明归 fate_system 却无对应关键词
- **文件:行号**：`src/lib/world-category-classifier.ts:18`（注释「天劫(预言语境)归 fate_system」）；第 58 行（`fate_system` KEYWORDS 仅 命劫/劫数，无 天劫）；第 49 行（`magic_system` 仅 渡劫/雷劫）。
- **现象**：「遭遇天劫」命中不了任何世界卡分类→unknown，与设计注释矛盾。
- **根因**：注释写了意图但 KEYWORDS 漏加「天劫」。
- **建议修法**：在 `fate_system` 关键词补「天劫」，并补单测。

### [F-09] P2 · pre-write-cards 完整性校验仅查 13 类，且为内联硬编码
- **文件:行号**：`src/app/api/generate/pre-write-cards/route.ts:211-240`（13 个 `hasX` 布尔 + 第 240 行内联中文映射对象，未 import `ALL_WORLD_CATEGORIES`）。
- **现象**：校验口径（13 类）与 15 类体系不齐（缺 character_relationship/custom，合理），但更关键是与 F-02 的「9 类可达」脱节——被建议补全的类别里包含自动填表填不出的 5 类，形成「建议补但工具填不出」的死循环。
- **根因**：校验逻辑自写，未引用单一来源，也未与 entity-sync 可达集合对齐。
- **建议修法**：从 `ALL_WORLD_CATEGORIES` 派生校验列表；对「系统已知但自动填表不可达」的类（F-02 的 5 类）在建议文案中标注「需手动建」。

### [F-10] P2 · 自动填表对世界卡条目缺失「名称真实性」自检
- **文件:行号**：`src/core/babylore/fill.ts:529-544`（`buildWarnings` 仅作用于 LoreTable 行）；`src/core/babylore/fill.ts:599,740`（`selfCheckFill` 只扫 `loreTable`）；`src/core/babylore/entity-sync.ts:218-231`（lorebookEntry 写入无正文回溯校验）。
- **现象**：entity-sync 写入世界卡条目的 `content` 纯来自 LLM（`description.slice(0,200)`），无「是否能在正文找到原文」的回填校验，LLM 臆造的世界卡条目不被自检发现。
- **根因**：`selfCheckFill` 的 corpus 只来自 storyNode，自检范围未覆盖 lorebookEntry。
- **建议修法**：扩展 `selfCheckFill` 对 `lorebookEntry` 做同样的「名称/标题是否在正文出现」校验，或给 entity-sync 加 `buildWarnings` 式校验。

### [F-11] P2 · 「角色关系」模块自动可达性与其余 14 类机制不同
- **文件:行号**：`src/components/workspace/worldPanelData.ts:20`（角色关系描述为「从正文自动提取」）；`src/core/babylore/entity-sync.ts:168-186`（仅 `type==="character"` 时补 `relationships`，走角色卡）；第 217-232 行（lore 路径无 `character_relationship` 分支）。
- **现象**：世界书「角色关系」模块能手动建（category=character_relationship），但自动填表只往角色卡 relationships 写，不往世界书 character_relationship 条目写，易让作者困惑「为何这个模块自动填表不理它」。
- **根因**：角色关系在设计中归属角色卡，与「世界书条目」两套机制并存。
- **建议修法**：在文档/UI 明确「角色关系自动来自角色卡，世界书角色关系模块用于手动补充」；或在 entity-sync 增加把明确关系也镜像成 lorebookEntry(character_relationship) 的可选开关。

---

## 六、复验通过项（round-2 确认健康的部分）

1. **分类器单测 6/6 通过**（vitest）：15 类唯一识别、2 元桶兜底、三处边界消歧（灵石 vs 灵石矿、命劫 vs 渡劫、系统 vs 制度）均正确。长词优先消歧的**主题成立**。
2. **babylore 填表单测 23/23 通过**：含 M2「人物落地点表→报错不写错」护栏、表内异体/跨表同名/空值自检均到位。填表主链路健壮。
3. **`tsc --noEmit` 全量 0 错误**：类型治理基础扎实。
4. **LorebookEditDialog 下拉确覆盖 15 类**：含 round-1 IMP-006 修复补的 `technique/law/currency/character_relationship`（行 114-126）。手动改分类→保存→落库闭环可用。
5. **worldPanelData 15 模块 + 字段模板完整**：`WORLD_MODULES`（5-21）、`MODULE_FIELDS`（64-154）齐全，记忆注入深度 0-4 标签合理。
6. **防重复填表/失败重试/幽灵脏标记区分**等填表工程护栏（fill.ts 的 markChapterFilled / fillErrorMeta）设计严谨，本轮未发现问题。

---

## 七、结论与 round-3 建议优先级

**结论**：v1.6.3 的「世界卡 15 分类体系」在**数据模型与手动建卡层面是真·完整可用的**；但「确定性分类器 + 14 类自动填表闭环」在**运行层面未真正打通**——分类器孤立未接线，自动填表枚举只覆盖 9/15 类，5 类（magic_system/culture/history/law/currency）在自动路径中不可达且会被静默错分，且这一缺口没有任何测试看守。声明跑在了代码前面。

**round-3 修复优先级建议**：
- **P0（必修）**：[F-02] 补 entity-sync 的 5 类 type 枚举与映射；[F-01] 把分类器真正接线进自动填表/校验，并修正 CHANGELOG 措辞。
- **P1（应当修）**：[F-05] 给 category 上联合类型+枚举白名单；[F-04] 收敛 15 类为单一来源；[F-03] 下拉改由 WORLD_MODULES 派生；[F-06] 明确两套分类体系定位。
- **P2（择机修）**：[F-07][F-08] 分类器 latent 误路由与注释不一致；[F-09] 校验口径对齐；[F-10] 世界卡自检盲区；[F-11] 角色关系机制说明。

---

*报告落盘路径：`PROCESS/meetings/round-2/lens-worldcard.md`*
*透镜代号：世界卡15类与填表闭环透镜 · round-2 · v1.6.4 · 2026-08-07*
