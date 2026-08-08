# novel-forge v1.6.16 复验修复循环 · 费曼报告

> 零基础也能看懂的「为什么 + 怎么做 + 取舍」。所有术语第一次出现都先讲人话，再讲术语。

## 一、干了什么（一句话）

v1.6.16 这一轮，我接着 v1.6.15 的「软删（tombstone，墓碑）漏洞复验」继续查，自己重新把代码翻了一遍，发现前一轮还有 **12 处「已删章节仍然能被读出来」的漏网之鱼**，把它们全部堵上；顺手把一处用户界面的用词统一；最后跑通质量门禁、升了版本、推上线。

## 二、为什么这么做（底层原理，第一性原理）

novel-forge 里「删除一个章节」**不是真删**，而是给这条记录打一个时间戳标记（字段名 `deletedAt`），就像图书馆把书贴上「已下架」标签而不真烧掉——这叫**软删 / 墓碑机制**（tombstone：字面是墓碑，比喻「标记死亡但不清除尸体」）。好处是章节能进回收站、可一键恢复，防止误删丢稿。

代价也很明确：所有「读取章节」的代码，都得主动声明「**只看没下架的**」（查询条件 `where: { deletedAt: null }`）。只要有一处读取忘了加这个过滤，已下架的章节就会悄悄混进正文生成、字数统计、AI 分析里——这就是「**读泄漏**」。

v1.6.15 修了一大半读泄漏，但那一轮我是派**子代理（Explore，一种自动扫描代码的帮手）**去查的，子代理报回来的清单不全。这一轮我自己用 grep 把全仓库所有「读 StoryNode（故事节点，即章节/卷/场景等树形结构的统称）」的代码穷举了一遍，才把剩下的 12 处挖出来。

## 三、方法、工具与效果

- **工具与手法**：
  - 用 grep 全仓搜索 `prisma.storyNode` 的全部读取点（`findFirst` / `findMany` / `findUnique` / `.count` / `.aggregate`）。
  - 亲读 Prisma schema（数据库表结构定义）确认：**只有 `StoryNode` 这一个模型有 `deletedAt` 字段**；角色卡、世界卡、章节摘要、待兑现记录都没有——这意味着只需修 StoryNode 的读取，其他模型的查询天然安全，不用动。
  - 上述两步把修复范围**精准锁死在 StoryNode 读取**，避免无谓改动引入新风险。

- **改了什么**（12 处查询 + 1 处文案，跨 5 个文件）：
  - `tool-registry.ts` 8 处：大纲树、新节点排序、最新章取用、章节数统计、总字数统计、AI 章节分析、关系抽取清单、关系同步语料。
  - `extract-chapter` 路由 1 处：下一章衔接（跳过回收站节点）。
  - `memory-decay` 路由 1 处：记忆衰减的「最新章」基准判定。
  - `story/nodes/[id]` 路由 2 处：最新章判定、级联子树收集。
  - `MemoryDecayDialog` 组件 1 处文案：「伏笔」→「未收尾线索」（符合 v1.6.13 既定「只改用户可见文案、不动底层字段」的防爆约定）。

- **质量门禁（两道，必须全过）**：
  - 类型检查 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → **0 错误**
  - 测试 `npx vitest run` → **286 个测试全绿**

- **效果**：已删章节不再渗进大纲树、最新章取用、章节数与总字数统计、AI 章节分析与关系抽取语料、下一章衔接、记忆衰减基准、最新章判定、级联子树收集。

## 四、关键取舍

- **子代理清单不能全信（Trust but verify，信任但要查证）**：子代理适合大面积扫描，但这一轮证明它会**漏报**。最终我亲自用 grep 穷举 + 读源码逐条确认，而非轻信子代理给的清单。子代理说「修完了」≠ 真修完。
- **误报要敢于不改**：子代理还报了一个 `DrawCards` 组件的「渲染错用」问题。我亲读源码判定是**误报**——那是 6 个小节统一的标题渲染约定（用带【】括号的 `meta.key`，如【伏笔】），改 `meta.label` 会破坏统一格式，且保留【伏笔】是 v1.6.13 既定的大纲文本切分原则。没有盲改。
- **先读 schema 再下刀**：动手前先确认「到底哪些表有 deletedAt」，把范围从「整个数据库」收窄到「仅 StoryNode 读取」，既快又稳。

## 五、可复现步骤（照做就能复现）

```bash
cd /c/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge

# 1. 穷举所有 StoryNode 读取点
grep -rn "prisma.storyNode" src/ | grep -i "findFirst\|findMany\|findUnique\|\.count\|\.aggregate"

# 2. 逐个确认查询是否带了 deletedAt: null，没带的补上（位置见第三节清单）

# 3. 双门禁必须全过
SAFE_DELETE_DISABLE=1 npx tsc --noEmit   # 必须 0 错误
npx vitest run                            # 必须 286 全绿

# 4. 双 changelog 同步（changelog-data.ts 三处 + CHANGELOG.md 头条）
#    注意：字符串内禁用 ASCII 双引号，用「」防 TS1005 断串

# 5. 提交 + 代理推送（代理环境下 gh credential helper 不触发，需 token 直传）
git add -A
git commit -m "v1.6.16 软删读泄漏补全 12 处 + 文案统一 + 误报核实"
GH_TOKEN=$("C:\Program Files\GitHub CLI\gh.exe" auth token) && git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push https://huanweide:${GH_TOKEN}@github.com/huanweide/novel-forge.git main
```

## 六、一句话总结

软删机制下，**「读」比「删」更容易漏**——每一处读取都要记得过滤墓碑标记；子代理的清单不能全信，自己 grep 穷举 + 读 schema 锁范围，才是把漏洞挖干净的正路。
