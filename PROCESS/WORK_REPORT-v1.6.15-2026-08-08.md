# v1.6.15 费曼报告：软删防复活的「读泄漏」收口

> 零基础也能看懂：本报告的每个概念都先用大白话讲清「它怎么运作」，再配一个生活化类比。

## 一、干了什么（一句话）

派三透镜复验 v1.6.14 后，发现软删（回收站）机制还有两类残留漏洞——**写回类入口没拦住**和**读取类查询漏过滤**——本轮一次性补齐：9 处写回入口加 `deletedAt` 410 拦截，13 处 StoryNode 读取加 `deletedAt: null` 过滤，并补 apply-extraction 写回防护；双门禁（tsc 0 错误 + vitest 286 全绿）通过后升 v1.6.15 推送。

## 二、为什么这么做（底层原理）

**软删（tombstone，墓碑机制）** 是什么？类比：普通删除像把文件扔进碎纸机（物理没了，找不回）；软删像把文件移进「回收站」——文件本体还在磁盘上，只是打了个「已删除」时间戳（`deletedAt` 字段被填上时间）。好处是能随时撤销恢复，不丢稿。

软删有个铁律：**回收站里的东西，既不能改，也不能被当成正文读出来用**。否则就出现「幽灵复活」——一个已经被删的章节，因为某个写接口没检查 `deletedAt`，被 AI 重新写了正文，等于把垃圾从回收站拽回书架；或者它的旧内容被某个查询读出来，混进新章节的写作上下文、统计数字、去重语料里，污染整本书。

v1.6.13 / v1.6.14 已经堵了导出、refine、write 等几个高危口子，但**复验（像审计一样重新逐行检查）**发现还有更多入口漏网：生成章纲、游戏开始、Agent 工具更新、以及十几个只读查询。本轮就是把「漏网之鱼」全部捞干净，让 tombstone 在全链路闭环。

## 三、方法、工具与效果

### 用到的工具
- **三透镜并行只读复验**（Explore Agent）：只读不写，分别盯「待审 / 确认 / 伏笔」「软删边界」「类型 / 导出 / 构建」三个角度，结果不进主上下文省 token。
- **Trust-but-verify（信但核实）**：Agent 报告里每一条高危项，Chair（我）都亲自 `Read` 源码逐行确认，不轻信「已修复」四个字。
- **双门禁**：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit`（TypeScript 类型检查零错误）+ `npx vitest run`（286 个测试全过）。门禁是「质量守门员」，任何类型或逻辑回归都会被它拦下。
- **代理推送**：`gh` token 直传 URL 走 7897 代理，绕开 credential helper 在代理环境下失效导致 401 的坑。

### 按时间顺序的做法（含失败与修正）
1. **核实仓库真状态**：用 `git ls-remote origin main` 实查，确认 v1.6.14 已真上远程（本地缓存曾滞后显示旧值骗人）；工作区有前序 9 处写回 410 的未提交改动待收口。
2. **逐行精读 13 处读取泄漏点**：先 `Grep` 定位文件名，再 `Read` 逐文件确认——preview-context、pre-write-cards、foreshadowing、confirm-guard、babylore/fill、post-processor、stats/monitor、memory-decay、narrative-energy、analyze-relationships、projects/[id]/confirm、summarize、character-dedupe。每一处都是 `prisma.storyNode.findMany / findFirst / findUnique` 的 `where` 里缺 `deletedAt: null`。
3. **落地 20 处 Edit**：
   - 写回类 410（前序 9 处 + 本轮补 tool-registry）：`outline_update` 加 `if (existing.deletedAt) return fail(...)`；apply-extraction 的 `currentNode` / `nextNode` 加 `deletedAt: null` 过滤，避免把 AI 建议章首写进回收站节点。
   - 读泄漏 13 处：每处 `where` 加 `deletedAt: null`。其中 pre-write-cards、babylore/fill 用 `replace_all` 一次改掉两处同形态查询。
4. **tsc 抓出前序遗留 2 处类型错误**（关键修正）：rollback 与 story PUT 的 `findUnique` 用了 `select` 但没含 `deletedAt`，导致访问 `.deletedAt` 报 `TS2339: Property 'deletedAt' does not exist`。补 `deletedAt: true` 进 select 后修复。这正是门禁的价值——前序那 9 处 Edit 没跑门禁就留下了编译期隐患，本轮被门禁当场捕获。
5. **双门禁复跑**：tsc 0 错误；vitest 26 文件 286 测试全绿。
6. **升版**：changelog-data.ts 三处（LATEST_VERSION / CHANGELOG_BRIEF / VERSIONS）+ 根 CHANGELOG.md 头条同步。字符串禁用 ASCII 双引号（用「」），避免触发 TS1005 断串。

### 效果数据
- 改动 24 个文件，+108 / -29 行。
- tsc：0 错误。vitest：286 / 286 通过。
- 软删 tombstone 在全链路——生成、游戏、确认、Agent 工具、只读上下文——彻底闭环，已删章节对用户与 AI 均不可见、不可改。

## 四、关键取舍

- **为什么用 `findUnique({ where: { id, deletedAt: null } })` 而不是「先查再判」？** 两种写法 Prisma 7 都合法。直接加 `deletedAt: null` 更干净、与全站 findMany 风格一致；tsc 通过即证明生成类型允许该写法。已验证仓库内 15 处 findMany 都用此写法，行为可靠。
- **为什么读泄漏也一并修，而不只修写回？** 只读查询漏过滤虽不会「复活」节点，但会把已删章节的旧内容读回，混进 AI 写作上下文、统计面板、记忆衰减最新章判定、角色去重语料、整本交付确认判定——属于「数据污染」，危害同样真实。复验把两类都列为必须收口。
- **漏看的 preview-context L32 与 character-dedupe L35**：最初精读只盯 Agent 清单列的 L31，实际同文件还有一处 allNodes 的 findMany 也缺过滤。用 `Grep` 全仓交叉核对 `where: { projectId, content: { not: null } }` 才发现这两处——说明「清单驱动」必须配「全仓交叉核对」才不漏。
- **未修项（非阻塞，留待下轮复验）**：类型缺口（手动 interface 缺 `deletedAt` 字段，tsc 当前 0 错误属 latent 技术债）、全本导出零正文 400、大书导出流式分块、游戏大纲 SYSTEM_PROMPT 的「伏笔」文案统一。这些要么低危、要么会改变行为需单独评审，本轮不动，避免爆破半径。

## 五、可复现步骤

```bash
cd /c/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge

# 1. 读泄漏定位（全仓交叉核对，确认哪些 findMany 缺 deletedAt:null）
grep -rn "where: { projectId, content: { not: null } }" src --include=*.ts

# 2. 类型门禁（必须 0 错误）
SAFE_DELETE_DISABLE=1 npx tsc --noEmit

# 3. 测试门禁（必须 286 全绿）
npx vitest run

# 4. 代理推送（gh token 直传 URL，避开 credential helper 代理失效导致的 401）
GH_TOKEN=$("C:\Program Files\GitHub CLI\gh.exe" auth token) && \
  git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 \
  push https://huanweide:${GH_TOKEN}@github.com/huanweide/novel-forge.git main
```

## 六、一句话总结

软删不是「加个字段」就完事，而是要在**每一个会碰这个节点的读写入口**都加同一道闸——本轮用「三透镜复验 + 逐行核实 + 双门禁」把 v1.6.14 漏掉的写回与读泄漏 22 处一并收口，印证了「审计必须配全仓交叉核对，否则永远有漏网之鱼」。
