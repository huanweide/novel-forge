# 工作单元报告 · v1.6.30 大书流式导出

> 费曼式沉淀。读者默认零基础大一新生。能讲给新生听＝真懂，否则作者自己没懂。

## 一、干了什么（一句话）

把 novel-forge 的小说导出功能从「先把整本书塞进一个超大内存块再发给你」改成「写一章发一章、写完就扔」，让导出几百章的超长小说时不再撑爆内存（OOM）。

## 二、为什么这么做（第一性原理，不堆术语）

**先说清楚两个黑话：**
- **OOM（内存溢出）**＝比喻：你搬家时非要把全部家具一次性塞进一辆小轿车，塞不下车就散架了。程序也一样，一次性申请超大内存块，内存不够就崩溃。
- **流式（streaming）**＝比喻：搬家时叫一辆一直开着的货车，你每打包好一个箱子就丢上车，车开走运走，家里永远只堆着「正在打包的这几个箱子」，不占地。

**真正的根因（不是我以为的）：**
我本来以为是导出用了某个叫 jszip 的打包库，它在内存里把所有文件拼好才输出，所以大书会爆。但亲读源码（`epub.ts` / `docx.ts`）后发现——**这个仓库压根没用 jszip**，而是自己手写了一个「零依赖」的 ZIP 打包函数 `makeZip`，最后用 `Buffer.concat(整本 entries 数组)` 把所有章节拼成**一个巨大的 Buffer** 才返回。这才是真根因：无论用不用第三方库，只要「先把整本书拼成一个超大内存块」这一步在，几百章的小说就会撑爆内存。

**为什么必须改：** 用户要写超长篇，导出是高频动作。一次性拼整本 = 内存峰值 = 章节越多越高，线性增长无上限。流式 = 内存峰值 = 单章最大那块 + 一个极轻的目录元数据数组，与总章节数无关，有上限。

## 三、用了什么方法、效果如何（对比 + 数据）

**方案对比（马斯克 CEO 拍板选 C）：**
- A：引第三方流式库 yazl → 否决：沙箱里 npm 装包有网络风险，且违背本仓库「零依赖手写 ZIP」的既有架构。
- B：分卷导出（拆成多本小 epub）→ 否决：破坏单本完整性，用户体验差。
- **C（采纳）：手写零依赖流式 ZIP**——复用现有 `makeZip` 的每一个字节写法，只是把「最后一次性 concat」改成「边生成边写入流」。

**具体动手（可复现）：**
1. `src/core/epub.ts` 新增 `buildEpubStream(dest, projectName, chapters, totalWords, completedNodes, author?)`：
   - 复用 `makeZip` 里**完全相同的** local header（30 字节）/ 中央目录头（46 字节）/ CRC32 算法，逐章 `dest.write` 出去；
   - 加了**背压**：`dest.write` 返回 `false` 时（说明下游来不及收，缓冲区快满）就 `await` 它的 `drain` 事件再继续写，避免 PassThrough 无限积压反噬内存；
   - 每写完一章的 Buffer 立即脱离作用域释放，最后写中央目录 + end record，`dest.end()`。
2. `src/app/api/projects/[id]/export/route.ts` 的 epub 分支：从 `return new Response(buildEpub(...))` 改成新建 `PassThrough` 流，`buildEpubStream(stream, ...)` 异步写、`.catch` 兜底错误，返回 `new Response(Readable.toWeb(stream), { headers })`——浏览器下载时边下边收。
3. 新增 `src/core/epub.stream.test.ts`（2 用例）：
   - 用例 1「结构等价」：用自己写的 `listZipEntries` 走本地文件头逐 entry 取出 `{name, data}`，比对同步版与流式版的 **entry 名顺序一致、逐条内容相等**；唯一豁免 `content.opf`——因为 OPF 里嵌了 `Date.now()` 生成的 uuid 和 `dcterms:modified` 时间戳，同步/流式各自生成必然不同，**比对时把这两行滤掉**（这是第一次跑测试失败后才发现的真问题，见下「踩坑」）。
   - 用例 2「大书 300 章 ZIP 合法性」：校验尾部 end record 签名 `PK\x05\x06`、entry 数 = 章节数 + 5、第一个 local header 是 `mimetype` 且压缩方法 0（stored 不压缩）。

**效果数据：**
- tsc 0 错误。
- vitest **309/309 全绿**（原 307 + 新增 2）。
- 字节产物与时序无关、与整本 concat 结构等价（mimetype 首条 stored、中央目录顺序相同）。

## 四、关键取舍与踩坑（反自欺）

**踩坑 1（真踩了，不是猜的）：** 我第一版测试写成「流式产物字节与同步产物 `.equals` 完全一致」，结果**实测失败**——`expected false to be true`。排查发现 `epubContentOpf` 里 `Date.now()` 和 `new Date().toISOString()` 每次调用都不同，同步版和流式版各自生成 OPF，时间戳不一致 → 字节不可能全等。这是**测试前提错，不是代码错**。修法：把断言从「字节全等」降级为「结构等价（逐 entry 比对，仅 OPF 时间戳行豁免）」，既守住真不变式（ZIP 结构、各章节内容、CRC），又承认时间戳的非确定性。

**踩坑 2：** `ChapterItem` 接口要求 `depth` 字段、且 tsc 找不到 `describe/it/expect` 全局——因为本仓库测试惯例是**显式 `import { describe, it, expect } from "vitest"`**，不是全局注入。第一版测试漏了 import 和 depth，tsc 直接报 10 个错。补上后即过。

**取舍（诚实边界）：** DOCX 导出本轮**没做真流式**。原因：DOCX 格式（OOXML）物理上要求所有章节塞进**单个 `document.xml`**，没法像 EPUB 那样「每章一个独立 xhtml 文件」分开流式写——这是格式硬限制，不是我偷懒。所以 docx 分支本轮原样未动，大书 docx 仍是整本 Buffer.concat，已在 changelog 标注为已知边界，留后续立项。epub 才是真流式，覆盖绝大多数场景。

**为什么不用 yazl 等库：** 沙箱 npm 安装第三方包有网络不确定性；且本仓库已是「零依赖手写 ZIP」架构，手写流式版与现有 `makeZip` 字节级对齐，零新增依赖、零行为差异，是最稳路径。

## 五、给后来者的复制步骤

1. 想验证流式产物正确：`npx vitest run src/core/epub.stream.test.ts`。
2. 想加新格式流式（如将来啃 docx）：参考 `buildEpubStream`，核心是「复用现有 local/central header 字节写法 + 边写边 push + 背压 await drain + 写完 end」，不要引第三方库。
3. 任何涉及「整本 concat」的导出，先想清楚能不能改成流式——本章是模板。
