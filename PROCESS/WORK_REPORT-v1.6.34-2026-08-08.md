# v1.6.34 工作单元报告（docx 真流式导出 + 路由端 currentNode 类型收口）

> 费曼式教学沉淀。读者对象：零基础大学生。目标——让你照着做能复现，听完能讲给同学听。

## 一、干了什么（一句话结论）

v1.6.34 干了两件互相独立、却被混在同一个版本号里交付的事：

1. **docx 导出从「整本攒内存再一把写出」改成「边生成边流式写出」**——这是 v1.6.30 给 epub 做了流式之后、被遗漏的 docx 分支（诚实边界见第三节）。
2. **消除了 3 处 `currentNode as any` 历史胶带**——这是 v1.6.31 声称已消除、实测却还活着 3 处的「类型债谎言」纠偏。

两件事都通过了质量门禁：**tsc 0 错误 + vitest 32 文件 311/311 全绿**（比上一版多了 2 个新建的 docx 流式测试用例）。运行时零行为变化。

## 二、为什么这么做（拆到底层原理）

### 2.1 docx 为什么必须流式

**大白话类比**：写一本书导出成 Word 文件（.docx），好比把几百页信纸装进一个快递箱。旧做法是先把所有信纸叠成一摞超厚的纸砖（把所有章节拼成一个巨大的 `document.xml` 文本），再把整摞纸砖一把塞进箱子（整本 ZIP 一次性 `Buffer.concat`）。书小没问题；书一大（几百章），这摞纸砖本身就占满你的桌子（内存），箱子还没封口桌子就塌了——这就是 OOM（内存溢出崩溃）。

**底层原理**：.docx 本质是 ZIP 包。旧 `buildDocx` 把 7 个内部文件（封面表、关系表、正文 document.xml、样式表等）全部生成后，用 `Buffer.concat` 把整本 ZIP 在内存里拼成一块大 Buffer 再返回。大书时这块 Buffer 可达数百 MB，Node.js 单进程内存撑不住就崩。

**诚实边界（关键）**：但有个绕不开的物理限制——Word 的 OOXML 规范强制 `word/document.xml` 必须是**单文件**，所有章节正文都得拼进这**一个** XML 里，不能像 epub 那样「每章一个独立 HTML 文件、逐章塞进 ZIP」。所以 docx 的「真流式」只能做到一半：正文那一块 XML 仍然整块驻留内存，我们只是在「ZIP 装箱」这一层不再整本攒、改成边装箱边发走（流式 HTTP 响应）。**不谎称「章节级真流式」**——这是和 v1.6.30 epub 的本质区别，必须讲清楚。

### 2.2 currentNode 为什么收口

**大白话类比**：`as any` 像是给 TypeScript（一个会帮你查错的类型保镖）蒙上眼睛说「这人我熟，别查了」。代码里 `currentNode: data.currentNode as any` 就是告诉保镖「这个节点字段别管类型」。但实测这个字段本来就是确定的「故事节点」类型（StoryNode），保镖本可以帮你查错，却被胶带蒙了眼。

v1.6.31 的更新日志声称已经在路由端撕掉了这层胶带，但我（trust-but-verify）实测 grep 发现 write 路由、refine 路由、pre-processor 三处还活着。这是「谎报已修复」——必须补齐。

## 三、方法 / 工具与效果（对比过什么、结果数据）

### 3.1 docx 流式怎么做的

**复用而非重写**：epub.ts 里 v1.6.30 已经写好一个流式装箱函数 `buildEpubStream`（带背压的逐文件写出）。我把它底层那段「写 ZIP 条目」的逻辑抽成一个通用 helper `streamZip(dest, entries)`（epub.ts L391），算法一字不差（local 头 30 字节、central 头 46 字节、CRC32 校验、末尾 central 目录 + end record 签名）。`buildEpubStream` 原封不动保留，所以 epub 的测试零回归。

docx.ts 复用 `streamZip` 新增 `buildDocxStream`（L152）：和旧的 `buildDocx` 用**完全相同**的 7 个内部文件构造逻辑，只是最后一步从「`makeZip` 整本拼」改成「`await streamZip` 流式写」。导出路由的 docx 分支改成 `PassThrough` 流式管道（与 epub 分支同源）。

**为什么不装现成库**（jszip / archiver）：项目基调是零三方依赖手写 ZIP（epub 已手写多年），且文本用 stored（不压缩）模式足够、CRC32 可控；复用自有 `streamZip` 零新依赖，风险最低。

**效果数据**：新建 `docx.stream.test.ts` 两个用例固化——
- 测试 1：结构等价——`buildDocx` 与 `buildDocxStream` 产出的 entry 名顺序、逐条内容完全一致（仅 `docProps/core.xml` 里的时间戳行豁免，因为流式时戳是实时生成的）；
- 测试 2：大书 300 章 DOCX 固定只有 7 个 entry（OOXML 单文件铁律），首条 `[Content_Types].xml` 必须是 stored（压缩方法 0），end record 签名正确。

### 3.2 currentNode 收口怎么做的

把三处 `data.currentNode as any` 直接改成 `data.currentNode`。因为 `data.currentNode` 在 `GenerationData` 里已是确定的 `StoryNode` 类型、`PostPipelineParams.currentNode` 字段也是 `StoryNode`，去掉 `as any` 后 TypeScript 真正开始校验这个字段的访问（比如 `.title`、`.order`），将来写错会编译报错。

### 3.3 trust-but-verify 当场抓到的真问题

我亲读 git diff 时发现：**代码改动其实包含两个主题，但当时的更新日志只写了 currentNode 收口、完全漏了 docx 流式**。这就是「代码做了 A+B，日志只记 A」的诚实缺口。我没有盲提交，而是把 v1.6.34 的 CHANGELOG.md 头条 + `changelog-data.ts` 的 CHANGELOG_BRIEF + VERSIONS 三条全部重写为双主题，让日志如实反映代码。这本身就是「不谎报」的实证。

## 四、关键取舍（工具 A 为何不选 B、踩坑与修复）

| 决策点 | 选了什么 | 没选什么 | 理由 |
|--------|----------|----------|------|
| docx 流式粒度 | ZIP 层流式 + HTTP 流式响应，document.xml 仍单文件 | 章节级真流式（逐章拆 entry） | OOXML 规范强制 document.xml 单文件，物理做不到章节拆分；如实标边界 |
| 实现方式 | 抽 `streamZip` 复用 | 重写一套 / 引 jszip | 零新依赖、epub 已验证算法、零回归 |
| 版本号策略 | 双主题合并进 v1.6.34 | 拆成 v1.6.34 + v1.6.35 两个版本 | 代码已混改在同一工作区，拆版需拆 git 改动成本高；保持单版但日志双主题如实 |
| 是否盲信前序日志 | 亲 grep 验证 | 直接信 v1.6.31「已消除」 | 抓出 3 处存活 + 日志漏报 docx，避免谎言固化 |

**踩坑现场**：最初拿到的工作区状态，CHANGELOG/changelog-data 把 v1.6.34 占用了 currentNode 主题，而 docx 流式的实质代码（epub.ts +86 行、docx.ts +106 行、route.ts 改流式、新测试文件）都已在工作区但没有任何日志记载。若直接 `git commit` 就会把「代码与日志不符」推上线。修复动作就是重写三处日志双主题化。

## 五、可复现步骤（照做就能重来）

```bash
# 1. 进仓库
cd /c/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge

# 2. 类型门禁（必须 0 错误才升版）
SAFE_DELETE_DISABLE=1 npx tsc --noEmit

# 3. 测试门禁（必须全绿；本版 32 文件 311 测试）
npx vitest run

# 4. 验证 docx 流式新测试确实跑过（不是假设）
npx vitest run src/core/docx.stream.test.ts

# 5. 亲核改动，不盲信 summary / 前序日志
git diff --stat
grep -n "streamZip" src/core/epub.ts
grep -n "buildDocxStream" src/core/docx.ts

# 6. 升版日志（CHANGELOG.md 头条 + changelog-data.ts 三处同步）后提交推送
```

**反自欺闸门**：本文档写的每一条都是我亲手跑过、亲眼验证过的——`tsc 0`、`vitest 311/311`、`docx.stream.test.ts` 实跑通过、`git diff` 亲核、日志双主题化重写。OOXML 单文件限制是真实规范约束（不是偷懒借口），已在第三节标为诚实边界。
