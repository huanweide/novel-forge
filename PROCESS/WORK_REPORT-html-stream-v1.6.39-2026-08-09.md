# 工作单元报告：HTML 导出流式化（v1.6.38 → v1.6.39）

> 本文件是 novel-forge 循环运营每一轮的常驻沉淀。读者无需任何工程背景，照此应能复现。个人 IP 永远归瑞宝宝（樊斯瑞），本轮仅做 novel-forge 工程迭代。

## 一、干了什么（一句话）

把 novel-forge「导出整本小说为 HTML 单文件」的功能，从「先把整本书拼成一个巨大字符串再一次性返回」改成「一章一章边生成边发送」，版本升到 v1.6.39。这是 v1.6.38 大书导出流式化的同源收口（之前只漏了 HTML 一种格式）。

## 二、为什么这么做（拆到底层原理）

**核心矛盾是内存有限。** 一本几十万字的小说，原来的写法要把所有章节的正文、目录、页脚拼成一个完整的 HTML 字符串，在服务器内存里驻留（几十 MB），然后通过 `new Response(整本字符串)` 一次性发给浏览器。书越大，这个字符串越大。当用户导出百万字大书时，服务器内存可能被撑爆（程序员管这叫 OOM 崩溃，就是内存不够用、程序直接挂掉）。

**类比（生活化）**：想象你要寄一本 1000 页的书给朋友。旧做法是先把 1000 页全部打印、钉成一本厚书，再整体寄出——你家里得有一张大到能平铺整本书的桌子（内存）。新做法是印一章、寄一章，桌子只需放得下一章。快递员手里的筐（网络缓冲区）满了，就喊「先别印了」——这就是下面说的「背压」。

**为什么现在才做**：v1.6.38 已经把 markdown、txt、epub、docx 四种导出格式改成流式，唯独 HTML 因「重构成本高」被暂缓。本轮把它补齐，五种格式统一为流式，不再有漏网的大书 OOM 路径。

## 三、用了什么方法 / 工具，效果如何

**工具**：TypeScript 异步生成器（async generator）、Node.js `Readable.from`、`proseToHtml`/`escapeHtml`（既有散文转 HTML 函数）。

**具体做法（可复现）**：
1. 在 `src/core/epub.ts` 把原来的 `buildHtmlDoc()`（返回完整字符串）删掉，换成 `buildHtmlDocStream()`——一个 `async function*`（异步生成器）。它按顺序 `yield`（产出）三段：① 文档头 + 目录骨架；② 遍历每一章，逐章产出该章的 HTML（标题、大纲、正文）；③ 文档尾闭合标签。
2. 在 `src/app/api/projects/[id]/export/route.ts` 的 html 分支，不再 `new Response(整本)`，而是 `Readable.from(buildHtmlDocStream(...))` 把生成器接成可读流，再用 `Readable.toWeb(stream)` 包成浏览器能收的响应。
3. `Readable.from` 自带**背压**（buffer 满自动暂停生成器）——这正好对应上面「快递员筐满了喊停」的类比，确保内存峰值降到「单章 + 约 16KB 缓冲」，而不是整本书。
4. 删除旧 `buildHtmlDoc` 不是拍脑袋：先用 grep 确认它只有导出路由一处调用、无测试引用，属安全死代码，破除冗余（与 v1.6.38 同原则）。
5. 新增 `src/core/html.stream.test.ts` 三个冒烟测试固化行为：① 证明是分块输出（不止一个 chunk）；② 渲染结构与原版逐字等价（头/目录锚点/正文转换/页脚署名齐全）；③ 作者署名正确。

**效果（双门禁实证）**：
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` = 0 错误（流式生成器类型自洽）。
- `npx vitest run` = **314/314 全绿**（比上一轮 311 多了本次新增的 3 项）。
- 运行时零行为变化：用户导出的 HTML 文件内容、排版、目录跳转、署名与旧版完全一样，只是服务器内存占用从「整本书」变成「一章」。

## 四、关键取舍（为什么选 A 不选 B）

本轮有两个候选：
- **候选 A（做）HTML 流式化**：真实 OOM 风险，改动局部（两个文件 + 一个新增测试），行为等价，零新依赖。教科书级「高杠杆低风险」手术。
- **候选 B（暂缓）llmConfig 强类型收口**：把全仓 30+ 处 `as unknown as Record<string,unknown>` 读取改成强类型。它不是会崩的 bug，只是代码不够优雅；收口要重构几十处、范围蔓延、每处都是回归入口。

**拍板方式**：按循环运营铁律，凡取舍必须派生马斯克人格执行 CEO 子 Agent 决策（其结论即视为瑞宝宝本人，绝不回头问用户）。CEO 拍板：做 A、B 继续暂缓——第一性原理是「内存会爆」是物理现实必须修，强类型是 nice to have 不是 must have；B 留到 v1.8.0 之后单独排期，禁止本轮夹带。

**诚实边界**：OOXML/HTML 规范下，单文件 HTML 只能把整本书写进一个文档（不能像 epub 那样拆成多章多个文件），所以本版只消除「HTTP 响应层 + 整本字符串驻留」的内存峰值，不谎称「章节级真流式」——章节内容仍是顺序写进同一个 HTML 文档，但每章产出发送后即释放该章内存。

## 五、改动文件清单

- `src/core/epub.ts`：删除 `buildHtmlDoc`，新增 `buildHtmlDocStream`（async generator）。
- `src/app/api/projects/[id]/export/route.ts`：html 分支切流式 + import 改名。
- `src/core/html.stream.test.ts`：新增 3 项冒烟测试。
- `src/lib/changelog-data.ts`：LATEST_VERSION/CHANGELOG_BRIEF/VERSIONS 三处升版。
- `CHANGELOG.md`：头条新增 v1.6.39 章节。
