# 复检报告：Round-3 IO 空导出 + 续写章号 独立复检（lens-io-writing）

- 复检员：独立代码复检员（lens-io-writing，隶属魔王系统 Round-3 复检循环）
- 复检铁律：Trust but verify（Grep + Read 当前源码 → 确认改动真实落地、逻辑闭环 → 能跑的测试实跑、无测试则静态闭环推演 → 诚实标注未实测边界）
- 复检对象：Round-3 两条修复——修复 C「IO 空导出边角」、修复 D「续写章号递增」
- 关联背景：Round-2 复检 `lens-io.md`（NEW-IO-1）、`lens-writing.md`（NEW-1 / NEW-3）
- 项目根：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- 复检日期：2026-08-07

---

## 〇、复检方法与范围声明

本次复检严格遵循「Trust but verify」：不依赖修复报告的自述，而是直接对改后源码做 Grep + Read 全量核对，确认三处改动的真实落地点与逻辑闭环；对有测试的项实跑命令、对无测试的项做静态闭环推演并明确标注「无测试可跑」；对需要真实数据库 / dev server / 浏览器 / 真实 LLM 才能端到端确认的效果，一律标注「未经实测，待验证」。

本次实际读取并核对的文件：

- `src/app/api/projects/[id]/export/route.ts`（导出路由，全量 259 行）
- `src/components/workspace/ExportDialog.tsx`（导出弹窗，全量 253 行）
- `src/app/api/generate/continue/route.ts`（续写路由，全量 290 行）
- `src/core/epub.ts`（仅 `buildChapterList` 第 82-105 行，确认 roots 渲染路径）

已实跑的核对命令（非测试，仅为确认仓库状态）：

- `Grep siblings|currentIndex` 于 `continue/route.ts`：零命中，确认旧变量无残留引用。
- `Grep *.test.ts` 全 `src` 目录匹配 `route.test.ts|continue.*test|export.*test`：零文件命中，确认导出 / 续写路径无任何单元测试文件。

---

## 一、两条修复逐条验证结论

### 1. 修复 C（IO 空导出边角）—— 结论：生效（后端 400 守卫 + roots 口径修正 + 前端正则同步，三者闭环成立）

修复 C 的验收标准有三：(a) `export/route.ts` 新增「所选范围无可导出正文」400 守卫；(b) `roots` 口径由「仅 `parentId === null`」修正为「子树顶层（父不在选中集合内）」；(c) `ExportDialog.tsx` 正则同步捕获「无可导出正文」提示。逐一核对如下。

**(a) 后端 400 守卫已真实落地 —— 命中 `export/route.ts:70-79`**

```ts
// R3-IO：选章导出时若级联展开后的整棵子树「没有任何正文」……
if (chapterIdsParam && !allNodes.some((n) => n.content)) {
  return NextResponse.json(
    { error: "所选范围无可导出正文" },
    { status: 400 }
  );
}
```

该分支位于第 63 行 R2-008 守卫之后、第 81 行 `roots` 计算之前、第 90 行 `check=1` 预检分支之前。三个关键顺序确认无误：

1. `chapterIdsParam &&` 前置：全书导出（不传 `chapterIds`）时该守卫与 R2-008 守卫都被短路跳过，主场景逻辑零回退。这与修复报告第 25 行声明一致，且我直接读到 `const chapterIdsParam = url.searchParams.get("chapterIds");`（第 46 行）与后续 `if (chapterIdsParam)` 过滤块（47-59 行）的衔接，确认 `chapterIdsParam` 语义为「URL 中存在该参数且值在 `wanted.size > 0` 时被用于过滤」，但守卫判断的 `chapterIdsParam` 是「参数是否存在」这一字符串真值——即便传入空串 `chapterIds=`（前端 `selected.size === 0` 时已在 `ExportDialog.tsx:77` 拦掉，不会传空串），该前置也能正确区分「全书」与「选章」。
2. `!allNodes.some((n) => n.content)`：基于 `addDesc` 递归展开（第 51-56 行）后的 `allNodes` 全集做「任一节点有正文」检测。展开后无任何正文章 → 400；存在正文 → 放行。逻辑与修复报告第 24 行描述完全一致。
3. 守卫位置在 `check` 预检之前（第 90 行），意味着「选章空正文」在预检阶段即返回 400，前端可捕获并提示，而非进入违禁词扫描后盲下载。

**(b) roots 口径修正已真实落地 —— 命中 `export/route.ts:81-87`**

```ts
const idsInScope = new Set(allNodes.map((n) => n.id));
const roots = allNodes.filter((n) => !n.parentId || !idsInScope.has(n.parentId));
```

旧逻辑 `allNodes.filter((n) => !n.parentId)`（即 Round-2 复检 `lens-io.md` 第 195 行所指出）只取整棵树最顶层。新逻辑把「父节点不在当前选中集合内」的节点也视为子树顶层。我额外核对了下游全部四条渲染路径，确认 roots 口径修正不会漏渲染：

- HTML / EPUB / DOCX 三条路径均经 `buildChapterList(roots, allNodes, includeOutline)`（`route.ts:108 / 121 / 135`），而 `src/core/epub.ts:88-103` 的 `walk` 从 `roots` 递归遍历全部后代（`for (const c of children) walk(c, depth + 1)`），只要 root 正确，后代全量渲染。已 Read 确认。
- Markdown / TXT 两条路径直接 `for (const root of roots)` 调 `buildMarkdownNode` / `buildTextNode`（`route.ts:154 / 168 / 176`），这两个函数内部同样 `allNodes.filter((n) => n.parentId === node.id)` 递归（`route.ts:231 / 252`）。已 Read 确认。

因此选中非根节点（section / scene / 卷下 chapter）时，该节点成为渲染根、其后代由递归展开，NEW-IO-1 描述的「展开后有正文却 roots 为空 → 静默空文件」被消除。

**(c) 前端正则同步已真实落地 —— 命中 `ExportDialog.tsx:90`**

```ts
if (errData?.error && /未选中|没有内容|没有有效章节|没有可导出正文|无可导出正文/.test(errData.error)) {
```

后端返回「所选范围无可导出正文」，被 `无可导出正文` 分支命中 → `emptyHint = errData.error` → `toastWarning(emptyHint)` 并 `return`（第 96-98 行），中止导出而非降级。`proceedExport()`（第 100 行）仅在「非空选类错误」时执行。与 R2-008 既有的「未选中 / 没有内容 / 没有有效章节」提示逻辑并存，未改动原有行为，符合修复报告第 47 行声明。

**闭环推演（场景验证，无测试文件，故为静态推演）：**

- 场景 A（勾选空 section，其后代 scene 也空）：`allNodes.length = 2 > 0` 不触发 R2-008；`some(content) = false` 触发 R3-IO 返回 400「所选范围无可导出正文」。✔ 拦截静默空文件。
- 场景 B（勾选有正文的 section）：`some(content) = true` 放行；新 roots 口径令 section 成为渲染根，正常导出。✔ 有正文正常导出。
- 场景 C（全书导出，不传 chapterIds）：两道守卫因 `chapterIdsParam` 为 null 跳过，全书导出行为不变。✔ 主场景保留。
- 场景 D（前端预检拿到 400）：正则新增「无可导出正文」匹配 → `toastWarning` 提示，不降级下载。✔ 前端提示闭环。

**测试情况：** 导出目录 `src/app/api/projects/[id]/export/` 下仅有 `route.ts`，无任何 `route.test.ts`（已 Grep 全 `src` 零命中）。遵循任务要求，未新增测试，仅以 TypeScript 类型检查 + 静态闭环推演支撑。修复报告声称 `tsc --noEmit` 零错误，本次复检未重跑 tsc（属类型层强证据，修复报告已实跑，我信任其结论并在诚实声明中转述）。

**结论：修复 C 三条改动均已真实落地、逻辑闭环成立，判定为生效。**

---

### 2. 修复 D（续写章号递增）—— 结论：生效（order 改为全局 max+1，无残留引用，下游无回归）

修复 D 的验收标准：将 `continue/route.ts` 中新建节点的 `order` 由「兄弟数组下标 + 1」改为「数据库实时最大 order + 1」，严格递增不重复。核对如下。

**源码落地点 —— 命中 `continue/route.ts:44-53`**

```ts
// ── 创建下一节节点 ──
// R3 修复（复检 NEW-3 ……）：order 必须严格递增且不重复。
// 改为基于数据库当前最大 order + 1：实时聚合，避免读取陈旧内存快照（并发更安全）。
const orderAgg = await prisma.storyNode.aggregate({
  where: { projectId },
  _max: { order: true },
});
const nextOrder = (orderAgg._max.order ?? 0) + 1;
```

旧逻辑（`siblings` / `currentIndex` / `currentIndex + 1`）所在的第 44-47 行区块已被整段替换，且我用 Grep 在 `continue/route.ts` 全文件搜索 `siblings` / `currentIndex`，零命中——确认旧变量无任何残留引用（无悬空变量、无未定义引用）。`currentNodeId` 仍被 `loadGenerationContext(projectId, currentNodeId, 5)`（第 37 行）使用，未受影响。

**下游影响核对：**

- `nextNode` 创建时 `order: nextOrder`（第 72 行），写入全局 max+1。
- `isLatestChapter` 判定（第 252-256 行）再次 `aggregate` 取全局 max，`nextNode.order` 即为新 max → `contIsLatest` 恒为 true，与「续写产生的新章即最新章」预期一致，无回归。
- `previousNodes` 过滤（第 96-98 行）`n.order <= currentNode.order && n.content` 依赖 order 全局单调递增，修复后前情窗口计算正确，无回归。
- `safeFillAfterWriting` 透传 `nodeOrder: (nextNode as any).order` 与 `source: "continue"`（第 257-266 行），溯源段格式与 write/confirm/batch/manual 四入口对齐（即 Round-2 复检 NEW-3 之外的 R2-003 已实现）。

**闭环推演（无测试，静态推演）：**

- 类型层：移除的 `siblings` / `currentIndex` 已无其余引用（Grep 已证），`currentNodeId` 仍被消费。
- 逻辑层：`nextOrder` 取值来源由「兄弟下标」改为「DB 实时 max + 1」，无论当前节点位于哪一卷、本地下标多少，新建章 order 严格大于现有全部节点，保证单调递增与全项目唯一（该赋值逻辑本身不产生重复值，除非并发竞态，见新坑 NEW-CONT-A）。
- 未改动 write 路径：`write/route.ts` 本就不创建新节点（写入已存在 `nodeId`），order 由其他流程管理，本次修改对 write 零影响。

**测试情况：** 全代码库 Grep `*.test.ts` 中 `continue / write / generate` 相关测试文件为零（已确认无相关测试可跑）。采用静态闭环推演，结论与修复报告一致。

**结论：修复 D 已真实落地、逻辑闭环成立，判定为生效。**

---

## 二、新坑清单（Round-3 改动引入或遗留的缺陷）

以下每条均给出 文件:行号 + 问题性质 + 复现思路，按「确定性 / 影响」排序。其中部分为 Round-3 为堵旧坑而引入的新边界，部分为 Round-3 半修后暴露的遗留不一致。

### NEW-IO-A（中等 / MED）：R3-IO 400 守卫过激拦截「纯大纲 / 骨架导出」，误伤正常导出

- 文件:行号：`src/app/api/projects/[id]/export/route.ts:74-79`；关联 `src/components/workspace/ExportDialog.tsx:90-98`。
- 问题性质：R3-IO 守卫以「展开后无任何 `n.content`」为拦截条件。但导出功能本身对「无正文节点」并非毫无产出——Markdown / TXT 路径对空节点会渲染 `（此节暂无内容）`（`route.ts:227`），且 `includeOutline` 时还会渲染大纲（`route.ts:220-222 / 244-246`）。因此对一个「只有标题 + 大纲、尚未动笔」的卷 / 章 / 节做选章导出，是一个合理需求（作者想先导出结构骨架与大纲审阅）。但 R3-IO 守卫会将其一律 400，彻底剥夺「导出大纲骨架」能力。这是为堵「静默空文件」而引入的过激拦截，属于误伤正常导出（设计取舍缺陷）。
- 复现思路：
  1. 准备一个项目，建一个 `section` 节点，仅填 `title` 与 `outline`，`content` 留空，使其下也全为空壳。
  2. 打开导出弹窗，切「选章」，勾选该 section。
  3. 点导出：后端 `addDesc` 展开后 `allNodes.some(n => n.content)` 为 false → 第 74 行返回 400「所选范围无可导出正文」。
  4. 前端正则命中 `无可导出正文`（`ExportDialog.tsx:90`）→ `toastWarning` 提示并中止，作者无法导出该大纲骨架。
- 诚实判定：该行为是否算「bug」取决于产品意图。若产品本就禁止导出无正文范围，则属预期；但若作者期望「导出大纲 + 标题结构」，则是明确的功能缺失。建议：将拦截条件从「无任何 content」收紧为「既无 content 也无 outline 且无子节点」，或在 400 文案中提示「可勾选包含大纲的父级节点」，以免误伤骨架导出。归为 MED（语义误伤）。

### NEW-IO-B（中等 / MED，残留边角）：循环父引用（数据损坏）仍导致 roots 为空、正文静默丢失

- 文件:行号：`src/app/api/projects/[id]/export/route.ts:81-87`（roots 计算）、`route.ts:154 / 168 / 176`（渲染起点）、`src/core/epub.ts:103`。
- 问题性质：R3 把 roots 重定义为「父不在选中集合内」，解决了「非根节点被选中」这一可达路径。但它仍未覆盖「父引用成环」的数据损坏情形：若某节点 A 的 `parentId` 指向 B、而 B 的 `parentId` 又指向 A（或更长环），且 A、B 都在 `allNodes` 内（例如全书导出时整库都进 `allNodes`），则二者 `parentId` 均在 `idsInScope` 内 → 二者都 `!idsInScope.has(n.parentId)` 为 false，且都 `!n.parentId` 为 false → 二者都不是 root。渲染从空 `roots` 出发，body 全空，且 `some(content)` 若为真（环中某节点有正文）则 R3-IO 守卫也不拦截——于是产出「结构完整但正文丢失」的静默错误文件，正是 NEW-IO-1 想要消灭的那一类。
- 此坑是 NEW-IO-1 / NEW-IO-7（Round-2 复检已指出孤儿节点静默丢弃）的闭环盲区：R3 只修了「子树顶层」口径，未对「父引用非法（环 / 指向集合内但非祖先）」做防御。对于从旧版本迁移、或删除逻辑留下脏数据的项目，环引用是真实可达的。
- 复现思路：
  1. 在数据库手动构造两条 `storyNode`：A.parentId = B.id，B.parentId = A.id（或 A.parentId = B、B.parentId = C、C.parentId = A）。
  2. 全书导出（不传 chapterIds）→ 整库进 `allNodes`，A、B 互在 `idsInScope` → 都非 root → `roots = []`。
  3. 四条渲染路径都从空 roots 出发 → 文件正文为空（或仅书名），前端若用预检则 `total` 多为 0，`proceedExport()` 盲目下载，作者被「已开始导出」成功提示误导。
- 建议：roots 计算应额外排环（拓扑 / 访问标记），或在渲染前检测「有 content 的节点未被任何 root 覆盖」时发出告警。归为 MED（依赖脏数据，确定性逻辑缺陷）。

### NEW-IO-C（低 / LOW）：Markdown / TXT 目录仅展开两级，选中非根节点作为 root 后目录扁平化

- 文件:行号：`src/app/api/projects/[id]/export/route.ts:154-164`（markdown 目录）、`route.ts:176-178`（TXT 正文起点，无显式 TOC 但层级依赖递归）。
- 问题性质：Markdown 目录生成仅遍历 `root` 与其「直接子节点」两层（`for (const root of roots) { ... for (const child of children) ... }`，第 154-164 行），并不像 `buildMarkdownNode`（第 231 行）那样递归到任意深度。Round-2 之前全书导出的 root 都是顶层卷，目录只列「卷 + 直接子章」尚可接受；但 R3 让「选中的非根节点（如 section）」成为 root 后，该 section 下的 scene / 子 section 在目录里只显示一层直接子，更深的层级在目录中消失（正文仍全量递归渲染）。结果：选中中间层级导出时，目录与正文深度不一致，长链「节/幕/子幕」结构在目录中扁平化，读者无法从目录导航到深层小节。
- 复现思路：
  1. 建结构：volume → chapter → section（选中此 section）→ scene1 → subScene1（scene1 的子）。
  2. 选章勾选该 section 导出 Markdown。
  3. 观察目录：仅列 section 与 scene1（直接子），`subScene1` 不出现在目录，但正文里有。
- 建议：目录生成应与正文一样递归到任意深度（复用 `buildMarkdownNode` 的递归或单独递归收集 TOC 项）。归为 LOW（展示瑕疵，不影响内容完整性，但 R3 放大了其可见性）。

### NEW-CONT-A（中等 / MED，残留竞态）：续写 order 并发竞态未根除，高并发下仍可能重复

- 文件:行号：`src/app/api/generate/continue/route.ts:49-53`（order 计算）、`route.ts:68-78`（create）、`src/core/pipeline/...`（无事务包裹）。
- 问题性质：R3 将 order 由「内存快照兄弟下标」改为「`prisma.storyNode.aggregate` 实时 max + 1」，确实降低了读到陈旧快照的概率，但**完全未引入事务 / 行锁 / 唯一约束**。`StoryNode.order` 在 `schema.prisma` 中仅 `Int @default(0)`，无 `@unique`（Round-2 复检 `lens-writing.md` 第 262 行已确认）。因此当两个续写请求在同一毫秒并发：二者都 `aggregate` 读到同一个 `max`（例如 10），都算得 `nextOrder = 11`，并发 `create` 两次 → 两个节点 order 同为 11，重复。修复报告第 49-50 行已诚实承认此残留，但作为复检我仍将其列为新坑（因为它未被本次修复根除，且在「多端同时续写 / 前端连点多次触发」的真实场景可复现）。
- 复现思路：
  1. 起 dev server + 真实数据库，准备一个至少含 1 章的项目。
  2. 用脚本近乎同时（并发）发送两个 `POST /api/generate/continue`（同一 currentNodeId）。
  3. 查询新建两节点的 `order` 字段，预期应分别为 11、12，实际可能都为 11。
- 建议：在数据层给 `StoryNode(order)` 加 `(projectId, order)` 唯一约束 + 捕获 P2002 重试，或在 `create` 外用事务 `aggregate`+`create` 串行化。归为 MED（并发场景，确定性理论缺陷，需真实并发压测固化）。

### NEW-CONT-B（中等 / MED，R3 半修引入的不一致）：order 已正确但 title 仍「（续）」，序列号脱节

- 文件:行号：`src/app/api/generate/continue/route.ts:55-61`（nextTitle 计算）、`route.ts:57`（正则 `^(.+?)(\d+)$`）、`src/core/post-process/regex.ts` 自动命名逻辑（Round-2 复检 `lens-writing.md` 第 230-231 行指出占位判定不纠正「（续）」标题）。
- 问题性质：R3 仅修 `order` 维度（任务 NEW-1 的 order 部分），明确声明标题递增（同属 NEW-1 的 title 维度）不在 scope（修复报告第 67 行）。但这造成一个 R3 半修后更显眼的新不一致：新建节点 `order` 已严格递增（例如 11），但其 `title` 仍是 `第K章：xxx（续）`（因为 `continue/route.ts:57` 的正则要求标题以数字结尾，而系统标准标题 `第N章：xxx` 以中文结尾，正则不匹配 → 走 `（续）` 分支）。于是：
  - 按 `order` 排序展示 / 导出时，时序正确；
  - 但标题文字显示错误序号（永远是「上一章标题（续）」），且 `post-processor.ts` 的占位判定 `isPlaceholder = !curTitle || /^第\s*\d+\s*章$/.test(curTitle)` 对「第3章：觉醒（续）」为 false，不会纠正；
  - 下游任何按「第N章」解析标题的逻辑（如大纲、目录、统计）都会因标题序号不递增而失效；长期续写累积出 `第3章：觉醒（续）` / `第3章：觉醒（续）（续）` 式标题。
  - 这是 R3「修一半」导致的 order 与 title 序列号脱节的矛盾：order 对了、title 错了，二者在导出 / 展示时相互打架，比修复前（order 也错）更隐蔽。
- 复现思路：
  1. 写一章，标题自动变为 `第3章：觉醒`（order=3）。
  2. 点「一键续写」→ 观察 `nextNode.title` 为 `第3章：觉醒（续）`、`nextNode.order` 为 4（正确）。
  3. 再次续写 → 标题 `第3章：觉醒（续）（续）`，order=5。标题序列彻底崩坏，但 order 正确递增。
- 建议：将 title 递增与 order 递增同轮修复——把正则改为匹配 `第(\d+)章`（或解析 `chapterOrder` 重建 `第${currentNode.order+1}章：...`），而非依赖结尾数字。归为 MED（确定性逻辑缺陷，R3 半修放大）。

### NEW-CONT-C（低 / LOW）：全局 max+1 可能因历史高 order 节点产生稀疏 order 跳变

- 文件:行号：`src/app/api/generate/continue/route.ts:49-53`。
- 问题性质：R3 之后 `nextOrder = 全局最大 order + 1`。若项目中存在由其他路径（write / refine / auto-confirm / batch，它们可能用 `currentNode.order + 1` 或各自逻辑）创建的、order 值偏高的历史节点（例如某次批量导入把 order 顶到 200），则续写会将后续所有章节 order 从 201 起跳，与「分卷内相对序号」的直觉产生大 gap。这本身不破坏单调性（无功能错误），但会引起视觉 / 展示上的不连续（如卷二首章 order 突跳到 201 而非紧接卷一末章），并可能让依赖「order 连续」假设的统计 / 进度条出现空洞。
- 复现思路：
  1. 用导入 / 批量接口制造一个 order 很大的节点（如 200）。
  2. 对此项目任一章续写 → `nextOrder = 201`，与既有低 order 章节形成大间隔。
- 建议：若业务期望 order 紧连续，应在各创建路径统一「全局 max+1」语义，或在展示层用「相对序号」而非裸 order。归为 LOW（语义 / 展示问题，非功能 bug）。

### 附送观察（低 / LOW，非 R3 引入，但复检中发现）：`export/route.ts:82` 的 `nodeMap` 为死代码

- 文件:行号：`src/app/api/projects/[id]/export/route.ts:82` `const nodeMap = new Map(allNodes.map((n) => [n.id, n]));` 在全文件中后续无任何引用（渲染走 `allNodes.filter(parentId === ...)` 而非 `nodeMap.get`）。属无害死代码，列出供清理，非阻断性缺陷。

---

## 三、复检员诚实声明

### 3.1 真正实测 / 强证据确认的项

- **修复 C 三处落地点**：均通过 Read 直接读取 `export/route.ts:70-79`、`export/route.ts:81-87`、`ExportDialog.tsx:90` 当前真实内容核对，确认 400 守卫、`roots` 口径修正、前端正则同步三者均已落地，非仅凭修复报告推断。
- **修复 D 落地点**：通过 Read 核对 `continue/route.ts:44-53` 的 `aggregate` + `max+1` 逻辑；并通过 Grep 全文件确认 `siblings` / `currentIndex` 旧变量零残留引用，证明改动干净、无悬空引用。
- **下游渲染安全**：Read 了 `src/core/epub.ts:82-105` 的 `buildChapterList` walk 实现，确认其从 `roots` 递归遍历全部后代，R3 的 roots 口径修正对 html/epub/docx 路径不会漏渲染。
- **无测试可跑**：Grep 全 `src` 目录确认导出 / 续写路径无任何 `*.test.ts`，故两条修复均无自动化测试覆盖——这是事实，已在正文如实记录，未伪装有测试。

### 3.2 未经实测、待验证的项（明确标注，不伪装已验证）

- **修复 C 的真实 HTTP 行为**：后端 400 在真实运行时的 status / 响应体、以及前端 `toastWarning` 的 UI 提示效果，均未连接真实数据库 / dev server / 浏览器实测。本次仅通过静态代码核对 + 逻辑闭环推演确认分支存在且位置正确。属「未经实测，待验证」。
- **修复 C 各格式端到端导出文件正确性**：「勾选非根节点 → 下载文件 → 打开验证非空且层级正确」未真实跑一遍（环境依赖真实 Postgres + dev server）。静态推演表明 roots 口径修正后非根节点能正确成为渲染根，但真实文件内容未经眼见确认。属「未经实测，待验证」。
- **修复 D 的真实多章续写顺序效果**：连续点多次「一键续写」的端到端顺序（order 严格 4、5、6…递增）未实跑 dev server / 真实数据库确认。静态推演表明每次取实时 max+1 应严格递增，但需真实项目数据固化。属「未经实测，待验证」。
- **修复 D 并发竞态（NEW-CONT-A）**：两个并发续写是否真产生重复 order，需真实并发压测（脚本并发请求）才能观测。逻辑推演表明无事务 / 唯一约束时理论上必现，但本次未实跑并发。属「未经实测，待验证」。
- **新坑 NEW-IO-A / B / C、NEW-CONT-B / C 的运行时触发**：均通过代码逻辑推演 + 复现思路给出，未启动 dev server 实际跑出错误结果。其中 NEW-IO-B（环引用空 roots）、NEW-CONT-B（title「（续）」）为确定性逻辑缺陷（不依赖运行环境即可判定），NEW-IO-A 为语义设计缺陷（取决于产品意图），NEW-IO-C、NEW-CONT-C 为展示 / 语义瑕疵。

### 3.3 一句话总结

Round-3 修复 C（IO 空导出边角：400 守卫 + roots 口径修正 + 前端正则同步）与修复 D（续写章号递增：order 改全局 max+1）在**代码落地与逻辑闭环层面均真实生效**，无假收敛迹象；但本轮复检挖出 6 处新坑（NEW-IO-A / B / C 三项 IO 侧，NEW-CONT-A / B / C 三项续写侧），其中 NEW-IO-A（过激拦截骨架导出，误伤正常导出）、NEW-CONT-B（R3 半修导致 order 与 title 序列号脱节）两项确定性较高、影响作者实际体验，建议优先排入下一轮修复；NEW-CONT-A（并发 order 竞态）为已知残留、需数据层唯一约束根除；NEW-IO-B（环引用静默空文件）为 R3 未覆盖的脏数据盲区。
