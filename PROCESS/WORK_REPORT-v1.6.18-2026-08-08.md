# Novel Forge v1.6.18 费曼报告：待审隔离根治 + 自动建卡入口统一

> 读者对象：零基础大学生。能用大白话讲清的，绝不堆术语；每个术语第一次出现都配一句「它到底怎么运作」。

---

## 一、干了什么（一句话）

我把小说创作平台里一个「AI 自动生成的角色卡 / 世界书会不经过人工确认就混进正文」的隐藏漏洞彻底堵死，并把所有同类入口统一成同一套防线。

---

## 二、为什么这么做（底层原理，不用「别人都这么做」当理由）

先把两个核心概念讲成大白话：

- **角色卡 / 世界书**：平台里两种「背景资料卡」。角色卡记人物（姓名、性格、背景），世界书记设定（地点、势力、法则）。写小说的 AI 需要这些卡当背景资料，才能写出连贯的情节。
- **正文注入链路（context-loader）**：大白话就是「打包工」——它负责决定把哪些卡发给写小说的 AI 当参考资料。它从数据库取卡时有两条规则，一条管世界书，一条管角色卡。

再讲「待审隔离」这套规矩是怎么来的（第一性原理）：平台有个 AI 自动填表功能，会从你写完的章节里自动抽出人物、地点、设定，生成上面说的卡塞进数据库。但这些卡未必都对——万一 AI 抽错了（比如把一句环境描写当成人物名），直接拿去喂写小说的 AI，就会污染正文。

所以 v1.6.13 定了一条规矩：**AI 自动建的卡先挂「待审」标签`（pending）`，用户点确认才变成「已批准」`（approved）`进正文**。这就像工厂流水线上的「待检品」——没盖章不能出厂。

但是（货物崇拜检测：这里的比喻要保留关键特征）——流水线上的「分拣员」context-loader 有两条取卡传送带：
- 世界书传送带：装了筛子「只取已批准」。
- 角色卡传送带：**漏装了筛子**——不管待审还是已批准，统统拿走。

这就是 v1.6.17 那次「表面修复」的根因：当时只给某处建卡贴了 pending 标签，但因为取卡时不过滤，标签形同虚设，卡照样进正文。等于给待检品贴了「待检」红标，却忘了分拣员根本不看红标。

本次 v1.6.18 干的就是两件事：① 给角色卡传送带装上筛子（根治）；② 把全厂所有「自动贴标」的工位都检查一遍，漏贴的统一定补上（统一防线）。

---

## 三、方法、工具与效果（对比过什么、结果数据是什么）

**1. 根治（最高优先级，一个改动让 v1.6.17 的标签真正生效）**

在 `src/core/pipeline/context-loader.ts` 的角色卡取卡处加上 `reviewStatus: "approved"` 过滤，与世界书对称：

```
// 改前：角色卡无论 pending/approved 全拿走
prisma.characterCard.findMany({ where: { projectId }, take: 50 })
// 改后：只拿已批准的
prisma.characterCard.findMany({ where: { projectId, reviewStatus: "approved" }, take: 50 })
```

**2. 统一防线（穷举 + 逐个补）**

用 grep 把全仓所有「AI 自动建卡」入口（`characterCard.create` / `lorebookEntry.create`）列出来，排除掉「用户手动点的」和「导入自己数据的」，给 9 类漏网入口补 `reviewStatus: "pending"`：

- `entity-sync.ts` 角色卡（自动填表同步）
- `characters/expand.ts` 三处（AI 拆组合卡 / 从背景发现新人物）
- `entity-auto-creator.ts` 角色 + 世界书（实体自动创建）
- `sync-relations.ts` 两处（关系卡自动生成）
- `game-engine.ts` 物品卡（游戏模式引擎，真实路径 `src/core/game/game-engine.ts`）
- `tool-registry.ts` 角色 + 世界书（AI 工具调用建卡）
- `generate/outline.ts` 大纲角色、`dissect-engine.ts` 拆书角色、`pre-processor.ts` 预处理角色

**3. 验证工具**：双门禁（这是项目的质量红线）
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → 退出码 **0**（零类型错误）
- `npx vitest run` → **26 文件 286 测试全绿**，退出码 0

**效果**：AI 自动生成的卡现在一律进待审区，用户一键确认才注入正文；手动建卡 / 导入（用户主动操作）保持 approved，不阻断工作流。

---

## 四、关键取舍（工具 A 为何不选 B、踩坑与修复）

- **哪些入口故意不补 pending**：`characters/route`（手动新建）、`explore`（探索采纳）、`import`（导入自有数据）、`seed`（demo 种子）、`presets`（应用预设）、`parse-settings`（用户主动粘贴设定文本让 AI 解析）。这些是**用户主动行为**，预期就是「我的内容直接生效」，补 pending 反而多一步确认打断体验。这是「安全 vs 体验」的权衡——我选了不打断主动操作。（注：`parse-settings` 三处建卡还是单行 helper 调用，要补需改 helper 函数且可能影响其他调用者，叠加语义属主动导入，故本轮不动。）

- **game-engine 路径修正**：前序复核记录把路径误写成 `src/core/game-engine.ts`，实际文件在 `src/core/game/game-engine.ts`，本次亲读核实修正，避免后续复验再走错路。

- **遗留 #6（undo 不回滚 babylore 副作用）**：确认属实，但属于「产品线增强」而非「安全漏洞」，留 v1.6.19+ 处理，不在本轮范围，避免一次改动面过大。

- **踩坑（真实发生）**：同文件多处分开编辑时，部分文件有保存时自动格式化（linter），导致并行编辑报「文件自读取后已被修改」。解决办法：同文件多处编辑改为串行、每次重新读取刷新快照再单独编辑，而非一条消息并行发多个 Edit。这是真踩过的坑，不是推测。

---

## 五、可复现步骤（照做就能复现）

```bash
cd <novel-forge 仓库根目录>

# 1. 核实漏洞：角色卡取卡不过滤
grep -n "reviewStatus" src/core/pipeline/context-loader.ts
# → 只有 lorebookEntry 行有 approved 过滤，characterCard 段没有

# 2. 根治：在 context-loader.ts 角色卡 findMany 的 where 加 reviewStatus:"approved"

# 3. 统一自动建卡入口补 pending（逐个文件 Edit，清单见第三节）

# 4. 双门禁验证
SAFE_DELETE_DISABLE=1 npx tsc --noEmit   # 期望：0 错误
npx vitest run                           # 期望：286/286 全绿

# 5. 升版双 changelog（changelog-data.ts + CHANGELOG.md 一起改、一起提交）
# 6. git commit + 代理推送 origin/main
```

---

## 六、反自欺闸门（写前必过）

- **我真的改了、真验证了吗？** 是：15 处编辑跨 10 个文件全部落地；tsc 与 vitest 均亲跑通过（退出码 0），非凭记忆推测。双 changelog 已同步，非只改一处。
- **弱项坦白**：`parse-settings` 三处建卡本轮未补——这是经过「语义属主动导入 + 改动影响面」判断后的取舍，不是图省事；若后续发现 AI 解析错误卡污染正文，再回头补。
- **货物崇拜检测（去掉形式还剩什么）**：去掉「pending/approved/context-loader」这些词，核心是「自动生成的内容默认不生效，人工确认才生效；取用端和生成端都要守住这道关」。这个原理不依赖任何框架名词，照此思路任何类似系统都能套用。

---

## 一句话总结

v1.6.18 把「AI 自动生成的卡必须经过人工确认才进正文」这条规矩，从「生成端贴标签」补成了「取用端也筛 + 所有生成端统一贴标」的闭环——之前只在生成端贴标、取用端漏筛，等于防线有个洞，这次堵上了。
