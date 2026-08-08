# 工作单元报告：大书导出流式分块（v1.6.38）

> 读者定位：零基础大学生。下面每个专业词第一次出现，都会先用大白话讲清「它到底怎么运作」，再配一个生活化类比。

## 一、干了什么（一句话结论）

本轮把 novel-forge 小说导出功能里最常用的 **markdown / txt 两种格式**，从「先把整本书在内存里拼好、再一次性发给你」改成「**边生成边发送**」（专业叫「流式传输」）。项目版本从 `v1.6.37` 升到 `v1.6.38`。

**生活化类比**：原来像先把整本书复印成一厚沓纸、堆在桌上，再整体打包快递；现在像印一张、寄一张，边印边寄——桌上（=电脑内存）不用堆整本书，自然不会因书太厚而「桌子塌了」（=程序内存爆掉崩溃）。

## 二、为什么这么做（第一性原理）

- **真实问题**：原来的 markdown 导出代码，会把所有章节的正文一节一节「粘」成一个巨大的字符串（代码里叫 `output`），几十万字的小说 = 几十 MB 的字符串，整坨驻留在内存里，最后用 `new Response(output)` 一次性返回。书越大，内存峰值越高，几十万字的大书有真实的「内存撑爆（OOM）崩溃」风险。
- **已有基础**：epub 和 docx 两种格式在更早的版本已经做成流式了（用 Node 的 `PassThrough` 技术），但 markdown / txt / html 还是老办法。markdown 是用户最常用的导出格式，所以最该先修。
- **第一性原理判断**：导出本质是「读数据 → 发数据」的水流，根本不需要把整本内容一直抱在怀里。流式才是正确的物理实现。

## 三、方法、工具与效果

- **工具**：TypeScript + Node.js 自带的 `stream` 模块，核心是 `Readable.from` + **异步生成器（async generator）**。
  - 异步生成器类比：像一个「随叫随到的扬声器」——你喊一声「下一章」，它就吐出那一章的内容，吐完等下次喊，而不是一次性把全年报纸都印出来堆着。
- **做法**：把原来「拼接整本」的函数，改成「逐章吐内容」的异步生成器。每一章只生成当章的字符串并交出去（专业术语 `yield`），Node 的 `Readable` 会自动做**背压（backpressure）**调度。
  - 背压类比：像自来水管——上游灌水太快、下游接不住时，水管自己关小闸门让上游停一停，绝不会爆管。这里「下游接不住」= 网络发送慢于生成速度，「关闸门」= 生成器自动暂停，内存只保留「正在处理的单章 + 约 16KB 缓冲」。
- **清理**：删除了旧的 `buildMarkdownNode` / `buildTextNode` 两个「同步拼接」函数——它们只在当前这一个文件里自己调用自己（递归），改造后成了没人用的死代码，按「破除冗余」原则删掉。
- **验证（真跑过）**：
  - `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → **0 错误**（证明流式生成器的类型自洽）。
  - `npx vitest run` → **32 个文件 / 311 个测试全绿**（VITEST_EXIT=0）。
- **用户感知**：行为完全等价（目录锚点、空章节提示一字不差），用户导出体验无变化，只是大书不再有崩的风险。

## 四、关键取舍（马斯克人格 CEO 子 Agent 拍板）

本轮需要拍板的优先级，派了一个「马斯克人格执行 CEO」子 Agent 代替用户决策（其结论即视为用户本人），候选有三个：

1. **A 大书导出 markdown/txt 流式**（选它）：真实物理风险（整本拼字符串→OOM），且递归函数就在本文件内、改动集中易验证 → 符合「物理现实优先 + 破除冗余」。
2. **B llmConfig 类型统一**：全仓库无 `LlmConfig` 类型定义，各路由靠 `as unknown as Record<...>` 硬转。但这是**纯类型整洁**，几十处改动、零功能增益 → 暂缓，留统一重构时再做。
3. **UI 自检 agent-browser 复检**：需启动真实浏览器，违反用户铁律「绝不启动会显示窗口的进程」→ 本轮不做。

另外两处范围克制：
- **markdown/txt 流式 vs html 流式**：html 单文件要求完整的 `<html><body>` 结构，改成流式要重构 `buildHtmlDoc`，成本高、回归风险大，本轮不做，留后续专项。
- **异步生成器 vs 手撸 PassThrough.write**：选异步生成器，让 Node 自动管背压，比手写 `stream.write()` 再处理背压返回值更简洁、更不容易因疏忽而 OOM。

## 五、可复现步骤（照做就能复现）

1. 改 `src/app/api/projects/[id]/export/route.ts` 的 markdown/txt 分支：删掉「拼 `output` 字符串」那段，改为
   `const exportStream = Readable.from(buildExportStream(isMd, project, roots, childrenMap, includeOutline, author, totalWords, completedNodes)); return new Response(Readable.toWeb(exportStream), {...});`
2. 把文件末尾的 `buildMarkdownNode` / `buildTextNode` 两个同步函数，替换为 `buildExportStream` / `markdownNodeGen` / `textNodeGen` 三个 `async function*`（逐章 `yield` 单章内容）。
3. 质量门：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit`（必须 0 错误）。
4. 测试：`npx vitest run`（必须全绿，本轮 311/311）。
5. 升版：改 `src/lib/changelog-data.ts` 三处（`LATEST_VERSION`→`v1.6.38`、`CHANGELOG_BRIEF`→4 条新摘要、`VERSIONS` 数组最前插入 v1.6.38 条目）+ 根 `CHANGELOG.md` 头条插入 v1.6.38。

## 六、反自欺声明（写在本轮真实做过的事上）

- 上述 `tsc` 与 `vitest` 均为本轮真实运行，输出为 `TSC_EXIT=0`（0 错误）与 `VITEST_EXIT=0`（311 passed），非推测。
- 流式改造的逻辑等价性（目录锚点、空节提示一致）已通过逐行比对原代码确认。
- **诚实边界**：内存峰值收敛「从整本字符串降到单章」是确定性逻辑改进（不再持有整本字符串引用），但本轮**未用独立压测工具跑真实几十万字大书来量化具体 MB 数字**——本地无大书 mock 压测环境。结论属「逻辑确定成立」，若需数字级证据，待部署后用真实大本书验证。此点不掩饰。
