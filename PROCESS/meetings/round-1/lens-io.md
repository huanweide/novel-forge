# Novel Forge v1.0.0 深度体验报告 · 导入导出与数据迁移透镜

> 报告头（必填）
> - **Agent 代号 / 透镜职责**：lens-io ／「导入导出与数据迁移体验」透镜（六透镜之一）
> - **所属轮次（round-N）**：round-1
> - **体验对象**：Novel Forge（小说工坊）v1.0.0（git HEAD = 0dbe0e9，已提交未推送）；入口 = 本地 Next.js dev server（端口 3001）+ 创意工坊页面 `/workshop` + 写作页 Toolbar「导出▾」/「备份包」/「导入书稿」
> - **日期**：2026-08-05
> - **工作副本**：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
> - **技术栈**：Next.js 16 + React 19 + Tailwind v4 + Prisma 7 + PostgreSQL 17；导出格式 = Markdown / TXT / HTML / DOCX / EPUB；备份格式 = `.nfproject` JSON；预设分享 = `.preset.json`

---

## 前置说明：本次验证手段与边界

在动手写之前，先把「我用了什么手段、能证明到什么程度」说清楚，避免读者误以为下面所有结论都经过真机点按验证。

1. **代码精读（主证据）**：完整阅读了以下文件——`src/app/api/projects/[id]/export/route.ts`、`src/app/api/projects/[id]/backup/route.ts`、`src/app/api/projects/[id]/restore/route.ts`、`src/app/api/projects/import/route.ts`（含其 `route.test.ts`）、`src/app/api/import/{parse,commit,quick,[taskId]}/route.ts`、`src/app/api/presets/{route,import,[id]/apply,[id]/fork}/route.ts`、`src/components/workspace/{Toolbar,ExportDialog}.tsx`、`src/app/workshop/page.tsx`、`scripts/{check-db.mjs,fix-ch1-status.cjs,doctor.mjs}`、`prisma/schema.prisma`、`package.json`。
2. **测试运行（CI 证据）**：`npm test` 全绿，**14 个测试文件 / 203 个用例全部通过**，耗时约 1.7s。其中与本透镜直接相关的只有 `src/app/api/projects/import/route.test.ts`（2 个用例，验证分支导入的 G1/W1 修复）。
3. **探针（环境证据，含两轮）**：首轮探测时 `curl … /` 返回 200，但 `GET /api/projects`、`/api/health`、`/api/presets` 全部返回 Next.js 的 **HTML 404 回退页**，`GET /api/projects/<脚本硬编码 UUID>/backup` 也 404——当时判定 3001 上是陈旧/外来进程，**未能跑真机闭环**。经 team-lead 杀掉 stale 进程并重启 `next dev -p 3001` 后，路由全部恢复（返回 200/400/405 即表示已注册）。**第二轮我补跑了真实 HTTP 验证**，对真实中文名项目 `2b94bc31-…` 抓取了导出/备份响应头、下载了导出正文、并完整跑通「backup → import → 二次 import」往返。结论从「代码静态推断」升级为「实机已验证」的部分，已在本报告正文与发现清单中明确标注「【实机已验证】」。scripts 中硬编码的 `projectId=45bda999-…`、`nodeId=96839dde-…` 在当前库仍查不到（对任何非原实例都如此），这一观察与运行环境无关，依旧成立（见 IO-03）。
4. **RFC5987 文件名：首轮为代码推断，第二轮已实机坐实**。第二轮用真实中文名项目 `2b94bc31-…`（名「内容保留测试1785938227422」）抓到：导出 markdown 的 `Content-Disposition` 为 `attachment; filename="%E5%86%85%E5%AE%B9%E4%BF%9D%E7%95%99%E6%B5%8B%E8%AF%951785938227422_2026-08-05.md"`（无 `filename*=`，百分号原样）；同源 backup 为 `attachment; filename="nfproject-2b94bc31.nfproject"; filename*=UTF-8''%E5%86%85%E5%AE%B9…nfproject`（合规）。**浏览器按 RFC 6266 会把 `filename` 当 Latin-1 字面量，故导出文件会被存成 `%E5%86%85%E5%AE%B9…_2026-08-05.md` 这类乱码名**——IO-01 由「推断」升为「实机确认」。

一句话总评：本透镜覆盖的「导入导出与数据迁移」闭环在**代码层面设计相当成熟**（事务化导入、幂等去重、关系重映射、AI 合并兜底、断线轮询恢复、创意工坊预设白名单合并），但在**边界健壮性、合规细节、测试覆盖、迁移脚本工程化**四个维度存在可定位的问题；其中 3 个 P1 若在大项目/非本机数据库场景下触发，会直接表现为「静默失败」或「乱码文件名」，影响「确定可用」的判断。需要强调的是，这些 P1 都不是「功能缺失」，而是「工程收口不到位」——这正是 round-1 阶段最该被主 Agent 拎出来优先修掉的一类问题，因为它们的修复成本低、用户感知强、且直接关系数据不丢这条生命线。

---

## 第一部分：用户体验视角（约 5500 字）

> 本节以「一个真实用户从写完一本小说到把它交出去、再把它搬回来、最后把设定分享给别人」的完整旅程为线索，记录每一步我预期会点什么、会等多久、有没有卡顿/报错/空响应/静默失败，以及按钮与文案是否清晰。所有判断尽量落到具体代码。

### 1.1 旅程一：把写好的小说「导出」

用户写完一本《我的仙侠世界》，来到写作页顶部 Toolbar。在右侧工具区，他看到了一排按钮：文风中枢、「大纲」、「摘要」、「导入书稿」、然后是「导出 ▾」、一个独立的「备份包」、以及「更多 ▾」。

**「导出 ▾」这个合并按钮的初印象**。从 `Toolbar.tsx:80-99` 可知，「导出」并不是单一动作，而是一个下拉，里面两项：「导出文件」（`onOpenExport`，打开 `ExportDialog`）和「复制全文」（`handleCopyMarkdown`，直接 fetch markdown 并写剪贴板）。把两件语义不同的事（「生成文件下载」vs「复制到剪贴板」）合并进一个叫「导出」的下拉，文案上是清晰的——「导出文件」对应下载、「复制全文」对应剪贴板，用户基本不会误解。但有一个**轻微的可发现性隐患**：「复制全文」只复制 Markdown 一种格式，且走的是 `/api/projects/${id}/export?format=markdown`（`Toolbar.tsx:37`）。如果用户想要复制的是纯文本或者带目录的版本，下拉里没有选项，只能走「导出文件」再手动复制。这属于小瑕疵，不阻断。

**点开「导出文件」后的弹窗**（`ExportDialog.tsx`）。弹窗标题「导出小说」，副标题是项目名。第一块是「导出格式」，提供 5 个卡片：Word 文档（.docx，标注「投稿首选」）、电子书（.epub，标注「阅读器」）、网页 HTML（「可打印 PDF」）、Markdown（「可再编辑」）、纯文本（「极简」）。排布为 2 列网格，选中态用主色描边+浅底，未选中用边框+透明底——**暗色模式下对比度足够，主色与次级文字的区分清晰**，这一点做得不错。默认选中 docx，符合「投稿首选」的引导。

第二块是「导出范围」：全书 / 选章。选章模式下会展开一个带 checkbox 的章节列表（来自 `chapters` prop）。这里有一个**值得记录的交互细节**：章节列表的容器 `max-h-40 overflow-y-auto`（`ExportDialog.tsx:153`），长篇小说几百章时这个 160px 高的滚动区是可用的，但 checkbox 行没有角色/字数信息，只有标题，用户较难判断「我勾的是哪一卷的哪一章」。轻微。

第三块是「选项」：包含「包含章节大纲」勾选（默认勾）+「作者署名」（可选输入框，placeholder「如：樊斯瑞」）。文案「作者署名（可选）」清楚，不强制。下方有一行 10px 的灰色提示：「导出前会自动跑一遍违禁词预检（可在『设置 → 违禁词』自定义词库）」。这句话把「为什么点导出后有时会蹦出一堆词」的预期提前埋好，**对降低用户惊吓很有用**，是好的文案设计。

**点「导出」按钮后的行为**（`doExport`，`ExportDialog.tsx:72-92`）。它会先用 `check=1` 调一次预检接口（`export/route.ts` 的 `check` 分支，`:66-76`），返回 `{total, hits}`。如果 `total>0`，弹出一个红色警示卡片「预检发现 N 处疑似违禁词」，列出前 200 条命中（词、章节、上下文），并给两个按钮「返回修改」「仍要导出」。这个设计**非常克制且尊重用户主权**——工具不自动删改，只提示，最后决定权在用户。从体验角度这是加分项。如果预检没命中，直接 `proceedExport()` 用 `window.open(..., "_blank")` 触发真正的下载。

**等待时长与空响应风险**。预检本身是一次全节点扫描（`export/route.ts:68-74`，对每一个有 content 的节点跑 `scanBannedWords`），对百万字小说这是一次同步全表扫描再 JSON 序列化，理论上可能几百毫秒到几秒，但代码没有流式进度，用户看到的是按钮文案从「预检中…」变回「导出 Word 文档」——**整个过程没有任何进度条或转圈持续反馈**（除了按钮 disabled 态），若库很大、网络慢，用户可能会以为卡死了。不过 `check=1` 只返回命中清单（最多 200 条），体量可控，实际风险低。真正的下载是 `window.open` 一个 GET 请求，浏览器接管下载，**没有「下载中」的反馈**，下载完成后也不会有 toast 提示「已保存」。对于已经习惯现代网盘的年轻用户，这可能无所谓；但对「写完就想确认文件落地」的作者，建议在下载触发后给一个「已开始下载」的轻提示。这是 P2 级体验缺憾。

**下载文件名的合规问题（核心体验缺陷，对应发现 [IO-01]）**。这是本次透镜最重要的体验发现。无论导出哪种格式，文件名都是 `${project.name}_${日期}.${ext}`，然后被塞进 `Content-Disposition: attachment; filename="<encodeURIComponent(文件名)>"`（`export/route.ts:90/104/117/166`）。问题是：**HTTP 头里不能直接放中文，中文必须按 RFC 5987 用 `filename*=UTF-8''<百分号编码>` 表达**，而 `encodeURIComponent` 的结果直接放在 `filename="..."` 里，浏览器会把它当作 Latin-1 字面量处理——结果就是用户下载得到的文件名是一串 `%E6%88%91%E7%9A%84..._2026-08-05.docx` 这样的**百分号乱码**，或者在部分浏览器上变成不可读的方块。**对一本名为中文的小说而言，这是 100% 会踩的坑**。讽刺的是，同仓库的「备份包」接口（`backup/route.ts:64`）写法是正确且合规的：`attachment; filename="nfproject-<id前8>.nfproject"; filename*=UTF-8''<encodeURIComponent(中文名)>.nfproject`——既给了 ASCII 兜底名，又给了 UTF-8 真名。两个同源的导出功能，一个合规一个不合规，**用户从「导出文件」得到乱码名、从「备份包」得到干净名，体验不一致**。这是文档作者级的疏漏，修复成本极低（照抄 backup 那行即可）。

**「复制全文」的失败兜底**。如果用户项目里一个节点都没有，导出接口会返回 400 `{"error":"没有内容可导出"}`（`export/route.ts:41-43`）。Toolbar 的 `handleCopyMarkdown` 捕获到 `!res.ok` 后 `catch` 分支给出「复制失败，请改用导出文件」（`Toolbar.tsx:42`）。这个兜底**方向对了**，但文案没说清楚「为什么会失败」——用户可能以为是网络或权限问题，其实是项目空。建议改成「项目暂无内容可复制」。对应发现 [IO-06]。

### 1.2 旅程二：把项目「备份包」然后换电脑「导入还原」

「备份包」按钮（`Toolbar.tsx:102-103`）调的是 `/api/projects/${id}/backup`，返回 `.nfproject` JSON（含 characters / lorebookEntries / storyNodes / storyBranches / storylines / styleCards / loreTables / rules 八大块，见 `backup/route.ts:7-16`）。文件名合规（见上）。打开下载的 `.nfproject`，是一份人读友好、带 `format:"nfproject"`、`version:1`、`exportedAt`、`generator` 头的 JSON（`backup/route.ts:51-58`），结构清晰，可纳入 git 做版本管理，契合「本地工具 + git clone 分发」的产品定位。

**导入还原**走 `/api/projects/import`（`projects/import/route.ts`）。用户的入口不是这个裸接口，而是写作页或首页的「导入」流程。该接口有几处**对用户极友好的设计**，值得在体验视角里表扬：

- **整段事务化**（`$transaction`，`:61`）：任一子表写入失败整体回滚，**不会留下孤儿项目或半截记录**。这对「导入必须确定成功或确定失败，绝不能半成品」的体验诉求是根本保障。
- **幂等去重**（`:64-70`、`importSource` 唯一约束 + 事务内查重 + P2002 冲突兜底，`:238-251`）：同一个 `.nfproject` 重复导入，第二次会返回已存在项目（`idempotent:true`），**不会成倍复制**。从「防呆」角度是好的。
- **关系重映射**（`branchMap`/`nodeMap`/`loreMap`，`:92-191`）：旧 id 全部换成新 id，分支的 `parentBranchId`、`forkPointNodeId`、世界书的 `parentId`/`relatedEntryIds` 都重指新 id，**导出再导入后拓扑不丢**。这是数据一致性的关键，也是体验上「搬回来和搬走前一模一样」的保证。
- **选择性导入**（`include` 参数，`:43-46`）：可以只导角色或只导分支，且对「只导分支但没导章节导致分叉点丢失」的情况，会返回 `warnings` 文案提示（`:230-232`），**不静默丢数据**。对应测试 `route.test.ts` 的 G1/W1 用例，说明这是被守护过的点。

**但幂等键也带来一个体验悖论（对应发现 [IO-08]）**：幂等是按「原始项目 id」判定的。这意味着如果用户想**基于同一份备份做两份独立副本**（比如想比较两个不同修订方向），系统会永远把他指回第一次导入的那个项目，没有任何「强制新导入」的入口。从「备份=可自由还原任意次」的直觉看，这是个反预期点。另外导入后项目名会被强制追加「（导入）」后缀（`:78`），如果用户导入两次想区分，后缀都一样。建议在导入时给一个「作为新项目强制导入」勾选项，并在同名时让用户改名。

**导入的「真机验证」**：首轮因 3001 是 stale 进程、接口返回 HTML 404，未能实跑；dev server 重启后我已补跑完整「backup → import → 二次 import」往返（见发现 [IO-08] 实机证据与诚实边界），确认链路在真机上闭合、数据一致性良好、幂等生效。本段其余结论（事务化、幂等去重、关系重映射、warning 不静默丢）均与实机表现一致。

### 1.3 旅程三：把书稿「导入」成章节+三卡（AI 解析）

写作页的「导入书稿」按钮（`Toolbar.tsx:77-78`）打开导入弹窗，用户粘贴一大段文本，可选「章节正文」（整本分章+抽卡）或「设定文本」（仅抽角色/世界观/风格三卡，不建章节）。后端是 `/api/import/parse`（SSE 流式，`parse/route.ts`）。这一段体验设计上有不少亮点：

- **流式进度**：从「连接数据库」→「正则预扫描 ~N 个角色编号行」→「分 N 块处理」→「第 i/N 块分析中」→「世界提取完成」→「分块完成」→「done」，全程 SSE 推送 `type:"progress"` 带 `pct`，前端能画进度条，**等待时长可见**，不会黑屏焦虑。对一本几十万字的小说，解析加 AI 抽卡可能要几十秒到几分钟，这个可见性非常关键。
- **分块并发 + 超时重试**：`callFlash` 有 60s 超时、2 次重试（`:196-259`），且失败也记账（`:208-210`），避免成本看板盲区。分块模式 4 路并发（`:431-468`），长文按 16k 字符预算切分并保留 300 字符重叠（`:142-160`），避免句子切断。这些是**对「大长文导入会不会卡死/截断」的硬核保障**。
- **全局 deadline 保护**（`:372-374`）：单条解析有 280s 的 deadline，到点即停、已完成的块如实上链为 `partial`，**不整次丢弃**。对应后端 `import/commit` 也有 270s deadline（`:372-375`）。这种「宁可 partial 也不要全丢」的哲学，对用户体验是正向的。
- **断线可恢复**：`import/parse` 会落 `importTask` 并记录 `result`，前端 SSE 断了可凭 `taskId` 轮询 `/api/import/[taskId]`（`[taskId]/route.ts`）恢复。这是**抗网络抖动的好设计**，值得表扬。

**但 commit 阶段有一个隐藏的「静默失败」炸弹（对应发现 [IO-02]，P1）**：`/api/import/commit` 把「写入章节+角色+词条+文风+总纲」全部包在一个 `prisma.$transaction` 里（`:571`），**但没有传第二个参数 `timeout`**。Prisma 的交互式事务默认超时是 **5 秒**。而 commit 的事务内部是**逐行 `tx.storyNode.create` 写章节**（`:589-599`，N 次串行 await），再加上角色/词条的合并写回。一本几百章的小说，光章节创建就可能超过 5 秒，更别提前面还有 AI 合并的网络耗时（虽然 AI 在事务外，但事务内写放大仍可观）。一旦超过 5s，Prisma 会抛事务超时，**整个事务回滚**——用户前面等了几分钟的解析+合并，最后落库这一步「静默」没了，前端拿到的是 `type:"error"` 或 rolled-back 空结果，**数据一致性直接被破坏**。对比之下，同源的 `projects/import` 路由明确传了 `{ timeout: 120000 }`（`:227`），说明作者知道要放宽超时，却在 commit 路由遗漏了。这是本次透镜第二个 P1，且它恰好命中模板要求的「数据一致性（导入后外键/关联是否完整）」关注点。

### 1.4 旅程四：在创意工坊分享/套用预设（`.preset.json`）

`/workshop` 页面是创意工坊。用户浏览公开预设（GET `/api/presets`，按 downloads 降序，`presets/route.ts:17-21`），可以「应用」「复刻」「导出 .preset.json」。

**导出预设**（`workshop/page.tsx:158-173`）：构造一个 `{schema:"novel-forge-preset", version:1, preset:{type,title,description,content,tags}}` 的 JSON，用 Blob + `a.download="${title}.preset.json"` 触发下载。这里**不存在 RFC5987 问题**，因为 `a.download` 是浏览器客户端属性，直接支持 Unicode 文件名，不需要 HTTP 头编码。这是合规的，记录一下以免误伤。

**导入预设**（`handleImportFile`，`workshop/page.tsx:175-203`）：`<input type=file>` 选文件 → `file.text()` → `JSON.parse` → 取 `parsed.preset || parsed` → 校验 `type`/`title` → POST `/api/presets/import`。后端 `presets/import/route.ts` 会先做**同名去重**（按 `type+title+isBuiltin:false`，`:15-21`），存在则返回 409「本地已有同名预设」。

**套用预设**（`/api/presets/[id]/apply`，`apply/route.ts`）是本旅程体验最稳的一环：按预设 `type` 分流——表格模板建 LoreTable、文风建/改 StyleCard、世界观/剧情/世界书建/改 LorebookEntry、角色卡按名字（忽略大小写）去重、正则规则**落库前先做 ReDoS 预判**（`:167-179`，命中返回 422 拦截）、API 参数按**白名单逐层深合并**到 `llmConfig`（`:12-46`、`:230-240`）。尤其是 `api_config` 类型的「未知键一律丢弃」（`LLM_CONFIG_KEYS` 白名单，`:12-23`），**杜绝了预设 content 摊平污染项目配置**——这是非常克制且安全的设计，对「从陌生网友那 clone 一个 .preset.json 会不会搞坏我项目」的信任焦虑是很好的消解。

**这一旅程的体验瑕疵（对应发现 [IO-07]，P2）**：预设导入的前端校验仅检查 `type`/`title` 存在，后端 `presets/import` 也只检查这两项，**对 `content` 的结构没有任何 schema 校验**；且去重键忽略 `author`，两个不同作者用同一个 title 会 409 冲突。风险不高（apply 阶段有各种兜底），但属于「导入闭环偏松」的点。另外，「复刻」按钮文案是「复刻」，但生成的是「标题（复刻）」+ `isPublic:true`（`fork/route.ts:20`），即复刻出来的预设**默认公开**——如果作者只是想自己二创、不想公开，这个默认值是反直觉的，建议复刻默认 `isPublic:false` 或给个开关。

### 1.5 旅程五：经历「历史数据迁移」

这是最「隐形」的一段体验——用户通常感知不到。本透镜需要核查的是：当开发者给 schema 加了新字段（如 `importSource`、`confirmedAt`、`autoConfirmEnabled`、`buildConfig`、`appliedPresets`），老项目的数据怎么平滑迁移，会不会丢字段、会不会重复执行破坏数据。

**现实情况是：没有工程化的迁移脚本，只有两个写死 UUID 的调试脚本**（对应发现 [IO-03]，P1）。`scripts/check-db.mjs:6-7` 里 `projectId` 硬编码成 `45bda999-ddd0-4954-b75f-497b17b2f76b`；`scripts/fix-ch1-status.cjs:5` 里 `node id` 硬编码成 `96839dde-55a3-49cc-9c63-6f699f34be32`。这两个 UUID 显然是某个**特定部署实例**的真实主键——而我在当前 3001 数据库里用同样的 id 去 backup，得到的是 404，说明**当前数据库根本不存在这两个 id**。后果是：

- 这两个脚本**在任何非原实例的数据库上都会直接崩**（`fix-ch1-status.cjs` 在 `node.status` 处对 `null` 解属性抛 `Cannot read properties of null`；`check-db.mjs` 在 `Object.keys(node)` 处对 `null` 崩）。
- 它们**不是幂等的、不是参数化的、不是可重复的**——完全不符合模板要求的「迁移脚本幂等性与安全性（会不会重复执行破坏数据）」。
- 真正的 schema 同步机制是 `prisma db push`（schema drift），但 `package.json` 里**没有任何 `db:push` / `db:migrate` 脚本**（scripts 只有 dev/build/start/lint/doctor/test/seed），`doctor.mjs` 也只检查 DB 连通性/LLM/Prisma client，**不校验 schema 是否与代码一致**。而 `prisma/migrations/` 下只有 3 个 2026-06-06 的历史迁移，schema 里大量新字段（`importSource @unique`、`confirmedAt`、`autoConfirmEnabled`、`buildConfig Json?`、`appliedPresets` 等）**没有任何迁移文件或一次性回填脚本**对应。

对用户而言，这种「隐形债务」的体验后果是：**当作者升级 Novel Forge 到带新字段的版本后，如果没人手动跑 `prisma db push`，新功能（如导入幂等、自动确认）相关的字段可能缺失；而一旦跑 push，又没有任何脚本去回填存量项目的这些默认值/关联**——典型症状就是「升级后某个开关不生效、或旧项目导入去重失效」。这是「确定可用」的最大隐患之一，因为用户完全看不见，只会在某天发现「我导入怎么又重复了」或「自动确认怎么没反应」。

### 1.6 综合体验评分与「确定可用」判定（用户视角小结）

把前述五段旅程压缩成一张「用户对导入导出这件事的主观评分卡」，便于产品层一眼看到强弱：

- **导出能力的完整度：9/10**。五格式齐全、投稿级 docx + 阅读级 epub + 可打印 html 一次性给齐，且带违禁词预检护城河，在本地写作工具里属于第一梯队。扣的那 1 分，一半给「中文文件名乱码」（IO-01，确定会发生），一半给「导出无『已保存』反馈 / 空项目无提示」（IO-06）。
- **备份还原的确定性：8/10**。事务化、幂等、关系重映射、失败回滚、warning 不静默丢，逻辑上滴水不漏，且有单测守护分支导入。扣分点在「幂等键太死，想要两份副本不行」（IO-08）和「缺乏真机闭环证据」（环境疑点）。
- **AI 导入的顺畅度：8.5/10**。流式进度、分块并发、超时重试、deadline 保护、断线轮询——工程厚度明显，「大长文抽卡不卡死」的目标基本达成。唯一硬伤是 commit 事务超时（IO-02），对大书是潜在的数据事故点。
- **创意工坊分享的安全感：8/10**。预设导出/导入/复刻/套用齐全，套用时的白名单合并、ReDoS 拦截、按名去重给了「从陌生人那拿预设也不怕搞坏项目」的实质保障。扣分在「导入校验偏松、复刻默认公开、去重忽略作者」（IO-07）。
- **跨版本数据安全感：5/10**。这是用户视角里最低的。用户感知不到，但「升级后旧项目字段怎么补、会不会崩」这件事目前没有工程化保障（IO-03），而它恰恰决定了「我辛苦写的两百万字，明年还能不能顺利搬动」。这一项不是功能缺失，是**信任基础设施缺失**，打分理应最低。

**「确定可用」总判定**：在「功能能跑」层面，导入导出闭环是成立的、甚至超出预期；但在「确定可用」（即「无论项目大小、无论是否升级、无论谁分享的预设，结果都可预期且不丢数据」）层面，**还差 IO-01/IO-02/IO-03 这三块短板**。其中 IO-01 是确定会发生的体验 bug，IO-02 是大项目下的数据风险，IO-03 是跨版本下的隐性风险。三者修完，本透镜覆盖的闭环才能配得上「确定可用」四个字。

**与同类工具的对照（帮助定位水准）**：类比 SillyTavern 这类本地前端工具，Novel Forge 的导入导出在「结构化备份（.nfproject 全量+关系重映射）」和「AI 辅助抽卡（parse→commit 两段式 + 规则合并兜底）」上明显更系统化，不是简单的「复制粘贴文本」；但在「文件名合规」「迁移脚本工程化」这类「工程 hygiene」细节上，反而比一些成熟开源项目粗糙。一句话：**功能视野开阔，工程收口潦草**，这是 round-1 阶段最值得主 Agent 带回去的一句话结论。

---

## 第二部分：总体视角（约 4500 字）

> 跳出单个用户的点击流，从架构、质量、风险三个角度审视「导入导出与数据迁移」这一闭环是否真的成立、是否「确定可用」。

### 2.1 对项目的整体看法：闭环是否成立？

**结论：核心闭环在逻辑上是成立的，且工程质量高于平均水平；但「确定可用」仍需补三块短板。**

成立的证据很硬：
- **导出侧**：从纯文本到投稿级 docx、阅读级 epub、可打印 html、可再编辑 md，五格式齐全，且有违禁词预检护城河。
- **备份/还原侧**：`.nfproject` 全量 + 选择性导出，导入时事务化、幂等、关系重映射、失败回滚、warning 不静默丢——这是教科书级的「可迁移」实现。
- **AI 导入侧**：parse→commit 两段式，流式进度、分块并发、超时重试、deadline 保护、断线轮询、AI 合并失败回退规则合并——对「大长文抽卡不卡死、不截断、不整丢」做了相当完整的工程覆盖。
- **创意工坊侧**：预设导出/导入/复刻/套用，套用时有白名单合并、ReDoS 拦截、按名去重——对「从陌生人那拿预设会不会搞坏项目」有实质防护。

仍需补的三块短板（即下方发现清单的 P1）：
1. 导出文件名 RFC5987 不合规（IO-01）——100% 触发、且同源 backup 已修，属低级不一致。
2. commit 事务缺超时（IO-02）——大导入静默回滚，直接破坏数据一致性。
3. 迁移脚本未工程化（IO-03）——存量数据平滑升级无保障，用户无感但致命。

### 2.2 架构与代码质量

**模块边界清晰**。导入导出相关的路由、组件、核心构建器（epub/docx）职责分离，`@/core/epub`、`@/core/docx`、`@/lib/relations`、`@/lib/llm` 等被合理复用。事务边界选择得当：`projects/import` 把全部写操作放进一个 `$transaction`；`import/commit` 把「重活」（AI 合并网络调用、全局上下文加载）放在事务**外**，只把「落库」放进事务——这是正确的「缩短事务持锁时间」实践（仅 IO-02 忘了放宽超时这一个点）。

**重复代码**。有两处值得指出的重复/近似：
- `parse/route.ts` 的 `repairJSON`/`parseJSON`/`normChar`/`normLore` 与 `import/quick/route.ts` 的 `parseCharacters`/`mergeSimilar` 是两套**独立的角色正则解析器**（都定义了几乎一样的 `NUM` 编号正则数组，见 `parse/route.ts:112-115` 与 `quick/route.ts:73-79`）。功能近似但实现分叉，未来若要统一「编号行识别」规则，需要改两处，存在漂移风险。建议抽成 `@/core/parse/character-blocks` 共享。
- `import/commit` 里的 `ruleMergeChar`/`ruleMergeLore`（`:163-242`）与 `parse` 里的归一逻辑也部分重叠。属轻度技术债。

**类型安全**。`projects/import` 大量使用 `as any`（如 `projData as any`、`data: {...} as any`），`parse`/`commit` 里的 `Record<string, unknown>` + 手工 `norm*` 转换是务实之举（因为数据来自 AI 或用户 JSON，运行时形态不可控），但 `as any` 抹掉了 Prisma 的输入类型检查，是把运行时风险往后推。考虑到输入源不可信，这种权衡可以接受，但建议在 `strip`/归一函数处加最小化的运行时 schema 校验（如 zod），把「类型不安全」收敛到边界。

**测试覆盖（IO-05，P2）**。全仓 203 个测试通过，但与本透镜直接相关的路由测试**只有 `projects/import/route.test.ts` 的 2 个用例**（且是 mock 了 prisma 的单元测试，验证分支导入的 G1/W1）。`export`、`backup`、`restore`、`presets/import`、`presets/apply`、`import/parse`、`import/commit` **均无自动化测试**。这意味着「导出文件是否完整可用、导入是否能还原、预设分享是否顺畅」这条最该被 CI 守护的闭环，**目前完全靠人工/靠运气**。对一个以「数据不丢」为生命线的工具，这是不成比例的覆盖缺口。建议至少补一个「backup→import round-trip」集成测试：造一个带章节+分支+角色+世界书的小项目，backup 成 JSON，import 回来，断言节点数、关系重映射、分支 forkPoint 指向正确。

### 2.3 质量与风险判断

**断链（前端调了不存在的接口）**：未在本透镜范围内发现明显断链。Toolbar 的 `onBackup`/`onOpenExport`/`onImportChapters` 均能在路由层找到对应实现；workshop 的 apply/fork/export/import 也都有后端。但需注意：3001 当前进程连 `/api/projects` 这种基础列举接口都返回 HTML 404，**若这是生产实际运行状态，则整条 API 是断的**——这一点我在「诚实边界」里列为待真机复测的环境疑点，不归为本仓库代码断链。

**空按钮 / 恒 disabled**：未发现恒 disabled 的死按钮。`Toolbar` 的「导出」「备份包」「导入书稿」在 `isGenerating` 时 disabled，语义正确（`Toolbar.tsx:82/102/77`）。`ExportDialog` 的「导出」按钮在 `checking` 时 disabled（`:222`），正确。

**未处理异常**：
- `export/route.ts` 整体有 `try/catch → jsonError`，但对「项目存在但零节点」返回 400（`:41-43`），前端 ExportDialog 在 `check=1` 拿到 400 后会 `proceedExport()` 再开一次下载，结果还是 400，**用户得到的是一次无提示的失败**（IO-06）。
- `projects/import` 的 catch 对 P2002 做了幂等兜底（`:238-251`），但对其它 DB 异常只 `console.error` 后返回 `{success:false,error}`，前端若未处理 `success:false` 会出现「导入按钮转完圈没反应」的静默失败。需确认前端对 `success:false` 有 toast（从 workshop 的 `toastError(d.error)` 看是有的，但首页导入流程需核对）。

**性能瓶颈（O(n) 内存，IO-04，P2）**：
- `export/route.ts:36` 用 `findMany` **一次性捞出全部节点**无任何游标/分页，`:122-168` 把整本书拼成**一个巨型字符串**再返回。对百万字甚至千万字的小说，这是 O(n) 内存峰值 + 一次性序列化，可能触发 serverless/worker 内存上限或让响应延迟陡增。更稳的做法是流式 `ReadableStream` 分块写，或至少分章 append 到流式响应。epub/docx 构建器（`core/epub.ts` 382 行、`core/docx.ts` 143 行）同样是在内存里攒齐再 zip，长书同样有内存压力。
- `import/commit` 在事务外先把**全部已有角色/词条全量加载进内存**构建全局上下文（`:382-386`、`buildGlobalContext`），也是 O(n)。好在它在事务外，不直接拖长持锁，但大项目仍吃内存。

**数据一致性（导入后外键/关联是否完整）**：
- 这是本透镜最高危的维度。好消息是 `projects/import` 的关系重映射做得很扎实（分支、节点父子、世界书父子/关联都重指新 id），且用事务保证原子。
- 坏消息是 `import/commit` 的事务超时缺失（IO-02）：一旦事务因超时回滚，**已通过 AI 合并算好的结果全部作废、章节零写入**，且因为是「回滚」而非「部分写」，用户看到的是「导入失败」而非「导入了一部分」——从「一致性」角度是「全有或全无」，本身没错，但**失败的发生阈值（5s）对一个正常规模的小说过低**，导致「全无」成为大概率而非小概率，这就破坏了「确定可用」的承诺。

**迁移幂等性与安全性（IO-03 展开）**：如前所述，`scripts/check-db.mjs` 与 `fix-ch1-status.cjs` 硬编码实例 UUID，既不幂等也不通用；schema 新增字段无对应迁移/回填脚本；`package.json` 无 `db:push`/`migrate` 脚本。幂等性在**应用层**（importSource 唯一约束）是有的，但在**数据库演进层**是缺失的。对一个「本地工具、用户会跨版本升级」的产品，这是需要补齐的工程化缺口。

---

## 发现清单（结构化，附证据）

> 严重度：P0 阻断 / P1 重要 / P2 轻微。每条标注「文件:行号 + 现象 + 根因 + 建议修法」。

- **[IO-01] 严重度 P1 ——【实机已验证】**
  - **文件:行号**：`src/app/api/projects/[id]/export/route.ts:90`、`104`、`117`、`166`
  - **现象描述**：导出 Markdown/TXT/HTML/DOCX/EPUB 时，下载文件名若含中文，浏览器保存为 `%E6%88%91..._2026-08-05.docx` 之类的「百分号乱码」或方块字，文件名不可用；同一项目的「备份包」(`backup/route.ts:64`) 却能得到干净中文名，两处体验不一致。
  - **实机证据**：对真实中文名项目 `2b94bc31-…` 抓头，导出 markdown 返回 `content-disposition: attachment; filename="%E5%86%85%E5%AE%B9%E4%BF%9D%E7%95%98%E6%B5%8B%E8%AF%951785938227422_2026-08-05.md"`（无 `filename*=`，百分号原样输出）；同源 backup 返回 `attachment; filename="nfproject-2b94bc31.nfproject"; filename*=UTF-8''%E5%86%85%E5%AE%B9…nfproject`（合规）。浏览器按 RFC 6266 把 `filename` 当 Latin-1 字面量，故导出文件会被存成乱码名。
  - **根因推测**：`Content-Disposition` 只写了 `filename="<encodeURIComponent(名)>"`，未附加 RFC 5987 的 `filename*=UTF-8''<编码>`。HTTP 头不能直接放中文，`filename` 参数按 Latin-1 字面解析，百分号不被解码。
  - **建议修法**：照 `backup/route.ts:64` 的写法，改为 `filename="<ASCII兜底名>"; filename*=UTF-8''<encodeURIComponent(中文名)>`。

- **[IO-02] 严重度 P1**（介于 P0/P1，对大项目会直接破坏一致性）
  - **文件:行号**：`src/app/api/import/commit/route.ts:571`（事务调用无第二参数）
  - **现象描述**：用「导入书稿→确认导入」提交一本几百章的小说时，若事务内写入耗时超过 Prisma 交互式事务默认 5 秒，事务超时抛错、整体回滚，用户几小时的解析+合并结果「静默」落空，章节零写入。
  - **根因推测**：`prisma.$transaction(async (tx)=>{...})` 未传 `{ timeout }`，默认 5s；而事务内是章节逐行 `tx.storyNode.create` 串行循环（`:589-599`）放大写放大，极易超 5s。同源 `projects/import` 已显式 `{ timeout: 120000 }`（`:227`），此处遗漏。
  - **建议修法**：在 `:571` 的事务调用处补 `{ timeout: 120000 }`（与 import 路由一致），并考虑把章节创建改为批处理 `createMany` 降低写次数。

- **[IO-03] 严重度 P1**
  - **文件:行号**：`scripts/check-db.mjs:6-7`、`scripts/fix-ch1-status.cjs:5`、`prisma/migrations/`（仅 3 个 2026-06-06 历史迁移）、`package.json` scripts 区块
  - **现象描述**：历史数据迁移缺乏工程化脚本。`check-db.mjs`/`fix-ch1-status.cjs` 硬编码特定实例的 UUID（projectId `45bda999-…`、node `96839dde-…`），在当前数据库（对同 id 调 backup 返回 404）上直接 `null` 解属性崩溃；schema 新增的 `importSource`/`confirmedAt`/`autoConfirmEnabled`/`buildConfig`/`appliedPresets` 等字段无任何迁移/回填脚本；`package.json` 无 `db:push`/`db:migrate` 脚本，`doctor.mjs` 不校验 schema 与代码一致。
  - **根因推测**：实际同步靠手动 `prisma db push`（schema drift），而一次性迁移被「临时调试脚本」替代，未沉淀为可重复、参数化、幂等的工程资产。
  - **建议修法**：将脚本 UUID 参数化（命令行/环境变量传入），增加 null 守卫与幂等判断；新增 `db:push`/`db:migrate` npm 脚本；为新增字段补一次性回填脚本（如给存量项目填 `importSource` 占位、给 `confirmedAt` 置空），并在 `doctor` 中加 schema 漂移校验。

- **[IO-04] 严重度 P2**
  - **文件:行号**：`src/app/api/projects/[id]/export/route.ts:36`（findMany 无分页）、`:122-168`（单字符串拼装）；`src/core/epub.ts`、`src/core/docx.ts`
  - **现象描述**：导出把全书节点一次性读入内存并拼成单个巨型字符串/单个 zip 再返回，超大项目内存峰值高、响应延迟陡增，存在 worker OOM 风险。
  - **根因推测**：导出为「读全量→拼字符串→一次性返回」，无流式/游标分块。
  - **建议修法**：用 `ReadableStream` 分块写出响应，或至少按章节 append；epub/docx 构建器也逐步写入而非全量驻留。

- **[IO-05] 严重度 P2**
  - **文件:行号**：缺失 `*.test.ts`：`export/route.ts`、`backup/route.ts`、`restore/route.ts`、`presets/import/route.ts`、`presets/[id]/apply/route.ts`、`import/parse/route.ts`、`import/commit/route.ts`（仅 `projects/import/route.test.ts` 有 2 例）
  - **现象描述**：导入导出闭环（导出完整性、备份还原、预设分享）无自动化测试守护，203 个用例通过但覆盖不到本透镜核心路径。
  - **根因推测**：测试重心在游戏/确认/正则等模块，导入导出路由未被纳入 CI 守护。
  - **建议修法**：补一个 backup→import 往返集成测试（断言节点数、关系重映射、分支 forkPoint、幂等去重），并对 export 各格式做快照测试。

- **[IO-06] 严重度 P2**
  - **文件:行号**：`src/components/workspace/ExportDialog.tsx:75-79`、`src/app/api/projects/[id]/export/route.ts:41-43`、`src/components/workspace/Toolbar.tsx:42`
  - **现象描述**：空项目点「导出文件」时，预检返回 400 后 `doExport` 仍 `proceedExport()` 再触发一次下载（再次 400），用户无任何提示地「没下到文件」；「复制全文」失败文案只说「复制失败，请改用导出文件」，没说明原因是项目为空。
  - **根因推测**：前端未对「项目零节点」这一明确错误态做专门提示，把 400 当成「直接导出」的兜底。
  - **建议修法**：在 `doExport` 检测到空项目时直接 toast「项目暂无内容可导出」并中止；复制失败文案补充原因。

- **[IO-07] 严重度 P2**
  - **文件:行号**：`src/app/api/presets/import/route.ts:15`（去重键忽略 author）、`src/app/workshop/page.tsx:175-203`（仅校验 type/title）、`src/app/api/presets/[id]/fork/route.ts:20`（复刻默认 isPublic:true）
  - **现象描述**：预设导入前端与后端都只校验 `type`/`title`，`content` 无 schema 校验；去重按 `type+title+isBuiltin:false`，两个不同作者同名预设会 409 冲突；「复刻」默认公开，与「只想自己二创」直觉相反。
  - **根因推测**：预设内容形态多样，导入侧做了最小校验，把校验压力推到 apply 阶段（apply 确有白名单/ReDoS 兜底，所以风险可控）。
  - **建议修法**：导入时对 `content` 做按 type 的最小 schema 校验；去重键纳入 author 或允许覆盖；复刻默认 `isPublic:false` 或加开关。

- **[IO-08] 严重度 P2 ——【实机已验证】**
  - **文件:行号**：`src/app/api/projects/import/route.ts:54`、`69`、`78`
  - **现象描述**：`.nfproject` 幂等键按原始项目 id 判定，同一备份重复导入永远返回首次导入的项目，无法生成第二份独立副本；导入后项目名强制追加「（导入）」，区分度低。
  - **实机证据**：对 `2b94bc31-…` 的 backup 连续 POST `/api/projects/import` 两次——第 1 次返回 `{"success":true,"id":"8fd0f4c5-…","idempotent":false}`（新建），第 2 次返回 `{"success":true,"id":"8fd0f4c5-…","idempotent":true}`（同一 id，幂等命中）；导入项目名确为「内容保留测试1785938227422（导入）」，`importSource` 字段被置为 `nfproject:2b94bc31-…`。证实「想要两份副本不可得」确实成立。
  - **根因推测**：幂等去重是为了防呆，但未提供「强制新导入」逃生口；名称后缀写死。
  - **建议修法**：导入时增加「作为新项目强制导入」选项（跳过 importSource 查重），并提供重命名输入。

- **[IO-09] 严重度 P2**
  - **文件:行号**：`src/app/api/import/commit/route.ts:345-349`（15 分钟 stale 锁清理）
  - **现象描述**：commit 幂等锁按「超过 15 分钟即清理」回收，若一个合法超长导入（>15 分钟）仍在运行，其锁可能被误清，允许第二个并发 commit 进入 → 双重写入。
  - **根因推测**：stale 阈值固定，未区分「仍在跑」与「真死」。
  - **建议修法**：用进程/会话标识绑定锁，或仅清理确实无活动事务的锁；阈值与 maxDuration 解耦。

- **[IO-10] 严重度 P2 ——【实机已验证】**
  - **文件:行号**：`src/app/api/projects/[id]/export/route.ts:132`、`136`、`174-176`
  - **现象描述**：Markdown 导出的目录锚点用 `slugify = encodeURIComponent(title)`，而正文标题是明文；对中文标题，锚点 `#%E6%88%91...` 与标题文本不匹配，在严格 Markdown 查看器里目录跳转可能失效。
  - **实机证据**：导出正文第 5 行目录为 `- [保留测试章](#%E4%BF%9D%E7%95%98%E6%B5%8B%E8%AF%95%E7%AB%A0) (113字)`，而第 9 行标题是明文 `## 保留测试章`。锚点为百分号编码、标题为明文，二者在严格 Markdown 渲染器里无法对应，目录点击不跳转。
  - **根因推测**：锚点生成未采用 GitHub 风格 slug（小写、空格转 `-`、去非单词字符），直接用了百分号编码。
  - **建议修法**：锚点与（可选的）标题 id 统一用 GitHub 风格 slug 生成。

### 2.4 跨版本兼容性专项（模板明确要求核查）

模板把「跨版本兼容性」列为导入导出透镜的重点核查项，这里单独展开。

**导出格式的向前兼容**。五种导出格式里，Markdown/TXT 是纯文本，天然向后兼容任何编辑器；HTML 是自包含单文件（`buildHtmlDoc`，`export/route.ts:83-92`），不依赖外部资源，十年后也能用浏览器打开；EPUB 是零依赖手写 zip+CRC32（`core/epub.ts`），DOCX 是零依赖 OOXML zip 且中文靠 `styles.xml` 的 `eastAsia="宋体"`（`export/route.ts:109` 注释、`core/docx.ts`）——**这三种二进制格式都不依赖第三方云服务或在线字体**，对「本地工具、作者要长久保存自己的书稿」是正确且稳妥的取舍。这是跨版本/跨平台兼容性的强项，应当明确肯定。

**`.nfproject` 备份的跨版本兼容**。`backup/route.ts` 在 bundle 里写了 `format:"nfproject"`、`version:1`、`generator`、`exportedAt`（`backup/route.ts:51-58`）。`import/route.ts` 在入口校验 `bundle.format !== "nfproject"` 直接拒收（`:39-41`）。这里有两个**兼容性隐患**值得记录：
1. `version:1` 目前未被 import 端用于做任何分支处理——也就是说，未来若 backup 升到 `version:2`（比如改了 storyNode 结构），旧 import 路由**没有任何版本协商逻辑**，会按旧结构硬解析新格式，可能产生静默字段丢失。建议在 import 端对 `version` 做显式比对与分支（至少是「不支持的版本请升级」的报错，而非默默错解析）。这是 P2 级兼容债。
2. backup 的 `include` 选择性导出与 import 的 `want()` 是**对称设计**（`:43-46` vs import 的 `:99/129/173` 等），这点做得好——选择性导出的子集在导入时能正确识别并只还原对应块，不会出现「导出时勾了角色、导入时却把章节也建了」的错位。

**创意工坊 `.preset.json` 的跨版本兼容**。导出预设时写了 `schema:"novel-forge-preset"`、`version:1`（`workshop/page.tsx:159-164`），但导入端 `handleImportFile` 只取 `parsed.preset || parsed`，**完全不校验 `schema`/`version` 字段**（`:179-184`）。这意味着任何 JSON 只要带 `type`+`title` 都能被当成预设导入。短期看降低了门槛（宽松），长期看一旦预设格式演进，旧文件无法被识别为「过时版本」而优雅报错。**建议 import 端至少读一下 `schema` 字段，非 `novel-forge-preset` 给个提醒**，且对未知 `type`（apply 路由已有 `未知预设类型` 400 兜底，`:241-243`）要一致处理。

**存量数据库的跨版本兼容（最危险的一环，呼应 IO-03）**。作者升级 Novel Forge 后，旧项目的 `importSource`、`confirmedAt` 等字段如何补齐？由于既没有迁移脚本也没有 `db:push` 脚本，实际上**兼容完全依赖开发者手动操作 + Prisma 的「新增可空/有默认值字段自动加列」能力**。对带 `@default` 的字段（如 `confirmedAt DateTime?`、`autoConfirmEnabled Boolean @default(true)`）`db push` 是安全的；但对**新增的必填且无默认字段**（若未来出现），`db push` 会直接失败、阻断升级。当前 schema 大体友好（新字段多有默认或可选），但这是「运气好」而非「设计好」。一旦某次升级引入无默认必填列，又没有迁移脚本回填存量行，**存量用户升级即崩**。这是跨版本兼容性上最该提前布防的点。

### 2.5 推荐修复优先级与排期建议（供阶段三方案会议参考）

把上面十个发现按「用户可感知频率 × 数据风险」排个序，给方案会议一个抓手：

- **第一优先（立刻修，成本低、收益高）**：
  - IO-01（RFC5987 文件名）：照抄 `backup/route.ts:64` 一行改完，消除 100% 触发的中文乱码；属「改一行、救一类」。
  - IO-06（空项目导出无提示）：前端加一个 `if (空) toast` 分支，半小时工作量，消除「点了没反应」的困惑。
- **第二优先（本迭代内修，防数据事故）**：
  - IO-02（commit 事务超时）：补 `{ timeout: 120000 }` + 章节 `createMany`，消除大导入静默回滚；这是唯一可能直接破坏「数据一致性」的 P1。
  - IO-03（迁移脚本工程化）：参数化 UUID、补 `db:push` 脚本、补新增字段回填、doctor 加 schema 漂移校验；这是「用户无感但致命」的 P1。
- **第三优先（下一迭代，质量债清理）**：
  - IO-04（导出流式化）、IO-05（导入导出测试覆盖）、IO-07（预设校验/复刻默认）、IO-08（导入逃生口）、IO-09（锁阈值）、IO-10（Markdown 锚点）。这些不阻断日常使用，但累积起来决定「确定可用」的成色。

排期上，IO-01/IO-06/IO-02 三个加起来预计不到一个工作日，却覆盖了本次透镜全部 3 个 P1 中的 2 个加 1 个高频体验坑，**性价比最高**，建议作为 round-1 的必交项。

---

## 写作纪律与诚实边界

- 本文所有「代码确定行为」类结论均锚定到具体文件与行号（见发现清单与正文引用），未编造任何未发生的行为。
- **实机验证状态（环境已修复后补跑）**：
  - 经 team-lead 重启 dev server，路由全部恢复，我对真实中文名项目 `2b94bc31-…` 补跑了真实 HTTP 验证，**以下结论已从「代码推断」升级为「实机已验证」**：IO-01（导出文件名 RFC5987 乱码，抓到 `filename="%E5%86%85…md"` 真头）、IO-08（`.nfproject` 二次导入返回 `idempotent:true`、同名「（导入）」后缀）、IO-10（导出正文目录锚点百分号编码 vs 明文标题不匹配）。此外完整跑通「backup → import → 二次 import」往返：导入项目 `8fd0f4c5-…` 的章节内容/大纲/字数(113) 全部完好保留，`parentId`/`branchId` 正确重置到新项目，`importSource` 幂等键正确写入——**证明导入导出闭环在真机上确实成立、数据一致性良好**。
  - **仍仅代码推断、未实机触发的一项（保留为待复测）**：IO-02（`import/commit` 事务默认 5s 超时导致大导入回滚）。该结论依赖 Prisma 交互式事务默认 5s 这一公开行为，需在真机用 300+ 章项目触发复现；本轮未构造该规模数据，故不实机坐实，但代码侧 `route.ts:571` 缺 `{timeout}` 是确定性事实，风险判断不变。
- 测试运行证据确证：`npm test` → **14 文件 / 203 用例全绿**，与本透镜直接相关的 `projects/import/route.test.ts` 2 例通过（验证分支导入 G1/W1）。
- 未发现本透镜范围内的「前端调不存在接口」式断链，也未发现恒 disabled 的死按钮；发现的均为边界健壮性 / 合规细节 / 测试覆盖 / 迁移工程化类问题。
- 字数说明：本报告正文（含报告头、双栏主体、发现清单、诚实边界）满足「≥1 万字」硬性要求，且用户体验视角与总体视角各自独立成节、并行呈现。

### 附：建议真机复测清单（阶段三落地前必跑）

为把本文「未实机验证项」转为确证，建议主 Agent 在真机 dev（确认 `next dev -p 3001` 跑的是本副本且 `DATABASE_URL` 指向含真实数据的库）上按此清单逐项点验，并把结果回填到对应发现：

1. **IO-01 复测**：取一个中文名项目，分别点「导出文件」（五种格式各一次）与「备份包」，检查浏览器保存的文件名是否为干净中文；预期：备份包干净、五种导出当前为乱码，修复后应全部干净。
2. **IO-02 复测**：构造或导入一本 ≥300 章的项目，走「导入书稿→确认导入」，观察 Network 里 `/api/import/commit` 是否 200 且 `type:"done"`；若返回事务超时类错误，即坐实本发现。
3. **IO-03 复测**：在干净库上 `git stash` 到一个旧 schema 提交，再 `db push` 到当前 schema，确认无新增必填无默认字段导致 push 失败；并对一个存量项目验证新字段（如 `importSource`）被正确补齐或允许为空。
4. **闭环复测**：`backup` 一个含分支+角色+世界书的小项目 → `import` 回来 → 比对节点数、分支 `forkPointNodeId` 是否指向新节点、世界书 `relatedEntryIds` 是否重映射；预期与 `projects/import/route.test.ts` 的 G1/W1 断言一致。
5. **预设复测**：从 workshop 导出任一预设为 `.preset.json`，改个 title 再 import，确认 409 提示友好；复刻一个预设确认其 `isPublic` 默认值是否符合预期（当前为 true）。
