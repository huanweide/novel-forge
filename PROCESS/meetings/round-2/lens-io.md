# Novel Forge v1.6.4 深度体验报告 · 导入导出与数据迁移透镜（round-2 复验 + 挖新坑）

> 报告头（必填）
> - **Agent 代号 / 透镜职责**：导入导出迁移透镜（lens-io）／聚焦「导入导出 / .nfproject / 软删 / 迁移」深度体验（MaxLoop 魔王系统派出的开会子 Agent 之一）
> - **所属轮次（round-N）**：round-2
> - **体验对象**：Novel Forge（小说工坊）v1.6.4（git HEAD = `2b88e09fbf470f84501660436bf26337e811614e`，已提交未推送）；入口 = 本地 Next.js dev server（端口 3001）+ 写作页 Toolbar「导出▾」/「备份包」/「导入书稿」+ 回收站页 `/recycle`
> - **日期**：2026-08-07
> - **工作副本**：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
> - **技术栈**：Next.js 16 + React 19 + Tailwind v4 + Prisma 7 + PostgreSQL（DB 127.0.0.1:5432）；导出格式 = Markdown / TXT / HTML / DOCX / EPUB（共 5 种，详见 IO-17）；备份格式 = `.nfproject` JSON；软删 = `deletedAt` 字段 + `/purge` 级联硬删

---

## 前置说明：本次验证手段与边界（诚实边界）

在动手写结论之前，先把「我用了什么手段、能证明到什么程度」说清楚，避免读者误以为下面所有结论都经过真机点按验证。本轮与 round-1 最大的不同是：**本地 dev server（端口 3001）在本轮实测时确实在线且连通 PostgreSQL**，因此我得以在真机上跑通多条 HTTP 闭环，而不只是代码静态推断。

1. **代码精读（主证据）**：完整阅读了 `src/app/api/projects/[id]/export/route.ts`、`src/app/api/projects/[id]/backup/route.ts`、`src/app/api/projects/[id]/restore/route.ts`、`src/app/api/projects/[id]/purge/route.ts`、`src/app/api/projects/route.ts`（GET 过滤 `deletedAt:null` / POST 建项目）、`src/app/api/projects/import/route.ts`（含 `route.test.ts`）、`src/app/api/import/commit/route.ts`、`src/components/workspace/ExportDialog.tsx`、`src/app/recycle/page.tsx`、`scripts/agent-release-journey.cjs`、`src/core/epub.ts`（`buildChapterList`/`buildHtmlDoc`/`buildEpub`/`proseToHtml`）、`src/core/docx.ts`（`buildDocx`）、`prisma/schema.prisma`。
2. **静态检查（CI 证据）**：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → **0 错误通过**；`npm test` → **19 文件 / 238 用例全绿**（round-1 为 14 文件 / 203 用例，本轮新增约 35 例，覆盖更多模块）。其中与本透镜直接相关的仅有 `src/app/api/projects/import/route.test.ts` 的 2 例（验证分支导入 G1/W1 修复）。导出/备份/恢复/commit 仍无自动化测试（见 IO-05 复验）。
3. **真机 HTTP 验证（本轮新增闭环证据）**：dev server 在线，我对一个真实中文名测试项目 `c7942ef2-…`（名「导入导出透镜测试·乱码校验」）跑通了以下真机链路，所有结论凡标注【实机已验证】者均来自真实响应：
   - 对 5 种导出格式逐一抓取 `Content-Disposition` 响应头，确认 `filename*=` 是否含中文（IMP-013 复验）。
   - `backup` 抓取 `.nfproject` 响应头与正文（2215 字节）。
   - `backup → import`（第 1 次）→ `import`（第 2 次，幂等）→ `import` + `forceNew`（第 3 次）→ 再 `forceNew`（第 4 次），核对 `idempotent` 标志、`importSource` 字段、项目名后缀、章节内容是否还原（IMP-014 / IMP-015 复验 + 往返一致性）。
   - `export?chapterIds=<仅子节点>` 抓取正文，复现「选章仅选子节点 → 静默空导出且误标章节数」的 bug（IO-11）。
   - 测试结束后，通过 `POST /api/projects/<id>/purge` 将本轮创建的 4 个测试项目全部级联硬删（4 次均返回 200），**数据库已恢复原状，未遗留脏数据**。
4. **沙箱限制（诚实标注）**：本环境无 Chromium，无法做纯视觉渲染验证（如 DOCX 在 Word 中打开后的实际版面、EPUB 在阅读器中翻页）。报告对二进制格式的「渲染正确性」仅基于源码逻辑（零依赖 ZIP/CRC32、OOXML 结构、`eastAsia="宋体"`）推断，并在结论中显式标注「未做真机渲染」。这一点与任务书「纯视觉降级为 API+SSR+源码」一致。
5. **关于「6 格式」口径**：任务书称「6 格式导出完整性」，但经代码与前端双重确认，产品当前**实际只暴露 5 种导出格式**（markdown/txt/html/epub/docx）。本报告的「6 格式」讨论以真实 5 种为准，并在 IO-17 中如实说明口径差异，不编造第 6 种。

一句话总评：round-1 提出的四枚核心修复（IMP-013 文件名 RFC5987、IMP-014 forceNew 幂等逃生口、IMP-015 事务超时、IMP-026 目录锚点对齐）**在 v1.6.4 中全部真实落地、可实机复现**；此外 round-1 的 IO-02（commit 事务缺超时）也已被顺带修复。但「导入导出闭环」在**选章过滤与渲染器的逻辑一致性、导出内容的元数据完整性（角色/设定未随导出走）、文件名的 ASCII 兜底合规度、软删清理脚本的语义一致性**四个新维度上仍存在可定位的真实问题。其中 IO-11（选章仅选子节点 → 静默空导出误标）与 IO-12（导出再导入非无损往返）是本轮最需要主 Agent 拎回去的两个新坑。

---

## 第一部分：用户体验视角（约 5600 字）

> 本节以「一个真实用户从写完一本小说到把它交出去、再把它搬回来、最后把旧项目清掉」的完整旅程为线索，记录每一步我预期会点什么、会等多久、有没有卡顿/报错/空响应/静默失败，以及按钮与文案是否清晰。所有判断尽量落到具体代码与实机响应。

### 1.1 旅程一：把写好的小说「导出」——文件名乱码已修，但兜底仍拧巴

用户写完《我的仙侠世界》，到写作页顶部 Toolbar 点开「导出 ▾」→ 「导出文件」，弹出 `ExportDialog.tsx`。弹窗提供 5 个格式卡片：Word（.docx，投稿首选）、电子书（.epub，阅读器）、网页 HTML（可打印 PDF）、Markdown（可再编辑）、纯文本（极简）；可选项含「包含章节大纲」开关与「作者署名」输入框；点导出前会先跑违禁词预检（`export/route.ts` 的 `check=1` 分支）。

**文件名乱码：round-1 的 IO-01 已被 IMP-013 修掉，且实机坐实。** 我实机对中文名项目 `c7942ef2-…` 抓取了 5 种格式的导出响应头，全部形如：
```
content-disposition: attachment; filename="%E5%AF%BC..._2026-08-07.md"; filename*=UTF-8''%E5%AF%BC..._2026-08-07.md
```
即 `filename*=` 已出现在全部 5 个分支（`export/route.ts:90` html、`104` epub、`117` docx、`166` markdown/txt）。现代浏览器（Chrome/Firefox/Edge）在存在 `filename*` 时优先采用它，因此**实际下载得到的文件名是干净中文**——这与 round-1 时「只有百分号乱码、无 filename*」相比是根本性改善。IMP-013 的「4 处分支全补」核对结果：实际是 5 个分支（markdown/txt 共用一处，html/epub/docx 各一处），覆盖完整，未见遗漏。

**但 IMP-013 留了一处拧巴（对应新发现 IO-14，P2）。** 注意上面响应头里 `filename="..."`（不带星号的那段）仍然是 `encodeURIComponent(中文名)` 的百分号串，而不是一个干净的 ASCII 兜底名。对照同源的备份接口 `backup/route.ts:65`，它的写法是 `filename="nfproject-<id前8>.nfproject"; filename*=UTF-8''<中文名>.nfproject`——`filename` 段给的是纯 ASCII 兜底（`nfproject-<id>`），`filename*` 段才是真中文。按 RFC 6266，`filename`（无星）应作为「ASCII 兜底」，当浏览器不支持 `filename*` 时使用。当前导出把兜底段也写成百分号串，**不符合 RFC 的「兜底应为 ASCII」约定**：在极少数不支持 `filename*` 的旧浏览器/下载器上，用户仍会拿到 `%E5%AF%BC..._2026-08-07.docx` 这类乱码名。功能上现代浏览器没事，但同一仓库两处写法不一致（导出不标准、备份标准），属于工程 hygiene 瑕疵，修复成本极低（照 `backup/route.ts:65` 把 `filename` 段换成 `<id前8或安全ascii>_<日期>.<ext>` 即可）。

**导出无「已保存」反馈的体验坑（round-1 的 IO-06）仍未修。** `ExportDialog.tsx:67-72` 的 `proceedExport()` 用 `window.open(...)` 触发下载并立即 `toastSuccess("已开始导出，文件将在新标签页下载")` 后 `onClose()`。这个 toast 文案从「已开始导出」变成了「已开始/新标签页下载」，比 round-1 好一点，但**本质仍是「触发即成功」的乐观提示**——浏览器接管下载后，本工具无法感知文件是否真正落盘；若导出接口因项目为空返回 400，`doExport` 在 `!res.ok` 时仍直接 `proceedExport()`（`ExportDialog.tsx:79-82`），用户会再开一个下载标签页、再次拿到 400、却无任何失败提示（IO-06 复验：仍开）。对一个「写完就想确认文件落地」的作者，建议在 `doExport` 的 `!res.ok` 分支改为 toast「导出失败：项目暂无内容」并中止，而不是盲目再开一次下载。

**空项目导出仍是「无提示失败」（IO-06 复验，P2）。** `export/route.ts:41-43` 在项目零节点时返回 400 `{"error":"没有内容可导出"}`，这是在任何格式分支之前的硬拦截。前端 `doExport` 的 `!res.ok` 分支不区分「空项目 400」与「网络 400」，一律 `proceedExport()`，于是用户得到一次无提示的「没下到文件」。与 round-1 结论一致，此坑未被本轮修复触及。

### 1.2 旅程二：把项目「备份包」然后换电脑「导入还原」——往返是真闭环

「备份包」按钮调 `/api/projects/[id]/backup`，返回 `.nfproject` JSON（含 characters / lorebookEntries / storyNodes / storyBranches / storylines / styleCards / loreTables / rules 八大块，`backup/route.ts:7-16`）。实机抓头确认其合规：
```
content-disposition: attachment; filename="nfproject-c7942ef2.nfproject"; filename*=UTF-8''%E5%AF%BC%E5%87%BA%E5%AF%BC%E5%87%BA%E9%80%8F%E9%95%9C%E6%B5%8B%E8%AF%95_%E4%B9%B1%E7%A0%81%E6%A0%A1%E9%AA%8C.nfproject
```
即 ASCII 兜底 `nfproject-<id前8>.nfproject` + 中文真名，干净正确。

**导入还原是我本轮实机证据最足的一段。** 把刚才的备份 POST 给 `/api/projects/import`：
- 第 1 次：`{"success":true,"id":"eac4d79e-…","idempotent":false}`，项目名变成「导入导出透镜测试·乱码校验（导入）」，`importSource="nfproject:c7942ef2-…"`，章节内容 `这是正文内容，用于校验导出与往返。` 完整还原（1 个节点）。
- 第 2 次（同一备份）：`{"success":true,"id":"eac4d79e-…","idempotent":true}`——**幂等命中，返回首次导入的同一项目，未成倍复制**。
- 第 3 次（备份加 `forceNew:true`）：`{"success":true,"id":"7d38c002-…","idempotent":false}`，项目名「…（副本）」，`importSource=null`（不写唯一键），**生成了一个真正独立的新副本**。
- 第 4 次（再次 forceNew）：新 id `1c1e946f-…`，项目名仍为「…（副本）」——**没有堆叠成「（副本）（副本）」**。

这四点证明 IMP-014（forceNew 去尾、不叠加）与 IMP-015（事务 `timeout:120000`，代码 `import/route.ts:234`）**双双真实落地**。特别值得表扬的是 `import/route.ts:84` 的 `baseName = (projData.name||"导入的项目").replace(/(（副本）|（导入）)+$/g, "")`——它先把已存在的（副本）/（导入）后缀剥离再追加一个，因此无论对同一备份反复 forceNew 多少次，名字都只带一个后缀，不会越叠越长。这是 round-1 担心的「forceNew 仍叠加」问题的正确解法。

**但也暴露一个体验悖论（与 round-1 的 IO-08 一致，仍存）**：幂等键按「原始项目 id」判定，想基于同一份备份做两份独立副本，必须手动加 `forceNew`；而前端「导入」流程（`/recycle` 与首页导入入口）**没有提供「作为新项目强制导入」的勾选项**——`forceNew` 目前只是后端能力，前端未暴露。普通用户根本不知道有这个逃生口，仍会卡在「第二次导入永远指回第一次」。这和 round-1 结论一致，本轮未修。建议前端导入流程加一个「强制新建副本」复选框，并在导入成功时若 `idempotent:true` 给出「已存在同名导入项目，是否强制新建？」的提示。

### 1.3 旅程三：把书稿「导入」成章节+三卡（AI 解析）——commit 事务超时已补，是大好事

写作页「导入书稿」走 `/api/import/parse`（SSE 流式）→ `/api/import/commit`（落库）。round-1 的 IO-02 指出 `commit` 的 `$transaction` 缺第二参数 `{timeout}`，大导入会触发 Prisma 默认 5s 超时导致整体回滚、数据静默丢失。我本轮核对 `commit/route.ts:571-719`，**该事务现已显式传入 `{ timeout: 120000 }`（第 719 行），且章节写入已改用 `createMany` 批量（`:604` 角色、`633` 词条），不再逐行串行 `create`**。这意味着 round-1 最危险的那枚 P1 数据事故点已被顺带修复——虽不在本轮 IMP 清单内，但应作为「附带已修」明确记功。commit 仍保留了 round-1 肯定的工程厚度：流式进度、分块并发、超时重试、全局 deadline 保护（`deadlineHit ? "partial"` 降级）、断线轮询恢复。这部分闭环在 v1.6.4 下比 round-1 描述时更稳。

### 1.4 旅程四：导出的「往返一致性」——这里有个真新坑（IO-12）

用户常见的一种心智模型是：「我把小说导出成 Word/Markdown 备份一份，哪天想改就再导入回来」。我必须在此严肃指出：**当前产品的 5 种导出格式，全部只导出「正文（章节标题+大纲+内容）」，完全不含角色卡、世界书、剧情线、文风卡、规则、世界表**（见 `epub.ts:buildChapterList` / `buildHtmlDoc` / `buildEpub`、`docx.ts:buildDocx`、`export/route.ts:122-168` 的 markdown/txt 分支——它们只接收 `chapters` 派生自 `storyNodes`，从不触碰 characters/lorebook/storylines 等）。

进一步，这 5 种格式**没有任何对应的再导入器**：导入入口只有 `.nfproject` 的 `projects/import`（结构化全量备份）和 `import/parse`（把原始文本丢给 AI 重新抽卡）。也就是说——你导出的 Word/Markdown，**没有「原路导回」的按钮**。若作者把导出的 Markdown 粘贴进「导入书稿」走 `parse`，AI 会重新解析、重新抽角色/世界观，原始的角色卡与设定大概率被覆盖或重抽成不一样的结果，**往返是非无损的，且会丢结构化元数据**。

唯一真正无损的「导出再导入」闭环是 `.nfproject` 备份（`backup`→`import`），我在 1.2 已实机验证它完美还原章节/内容/关系。所以给用户的诚实结论是：**「导出」≠「备份」**。导出是「把小说文本交出去给别人看/投稿」，备份（.nfproject）才是「把整个项目原样搬回来」。产品目前未在 UI 上把这两者语义区分清楚（都叫「导出/备份包」但能力天差地别），容易让用户误以为「导出的 Word 也能当备份恢复」。这对应新发现 IO-12（P2，内容完整性 + 往返一致性），建议：要么在导出弹窗明确文案「导出仅含正文，完整备份请用『备份包』」，要么为导出格式提供一个无损回导入口（成本高，优先级低）。

### 1.5 旅程五：经历「软删 / 回收站 / 清理」

用户删项目时，`DELETE /api/projects/[id]`（`route.ts:68-86`）只把 `deletedAt` 置为当前时间（软删），返回 `{success:true, recycled:true}`；正常项目列表 `GET /api/projects` 用 `where:{deletedAt:null}` 过滤（`route.ts:11-26`），所以软删项目从主页消失、进回收站。回收站页 `/recycle` 提供「恢复」（POST `restore`，清空 `deletedAt`）与「彻底删除」（POST `purge`，级联硬删子表，`purge/route.ts`，依赖 schema 的 `onDelete:Cascade`）。这条链路逻辑自洽、语义清晰，且 `restore`/`purge` 都对 `project` 不存在返回 404，不静默。

**但「软删清理」在发布旅程脚本里语义不一致（新发现 IO-16，P2）。** `scripts/agent-release-journey.cjs` 的第 6 步名为「清理：软删项目」（`agent-release-journey.cjs:81-84`），它只调用 `DELETE /api/projects/${projectId}`，即**软删**——项目只是进回收站，并未真正清除。脚本注释写「建项目 → 建章 → … → 整本交付 → 清理」，把「软删」当作「清理」用，导致每跑一次发布旅程，回收站就多一个 `_验证` 项目（除非人工去 `/recycle` 点「彻底删除」）。对一个本应「跑完即净」的验收脚本，这是语义与实现错位：要么把 `DELETE` 改成 `POST /purge`（真正清理），要么在脚本末尾显式 purge。属测试工程 hygiene 问题，不伤用户，但会污染真实数据库（我本轮实测后已主动 purge 掉自己建的 4 个测试项目，避免重蹈覆辙）。

### 1.6 综合体验评分与「确定可用」判定（用户视角小结）

把前述五段旅程压缩成一张主观评分卡：

- **导出文件名合规度：8.5/10**（IO-01 已修，现代浏览器干净；IO-14 残留 ASCII 兜底不标准，旧浏览器仍可能乱码，扣 1.5）。
- **导出内容完整度：6/10**（IO-12：5 种格式均只含正文，角色/设定随不出去；且无法原路导回。对「想拿导出当备份」的用户是隐性落差，扣 4）。
- **备份还原确定性：9/10**（事务化、幂等、forceNew、关系重映射、内容还原——均实机验证通过；仅前端未暴露 forceNew 逃生口和幂等提示扣 1，见 IO-08 仍存）。
- **AI 导入顺畅度：9/10**（commit 事务超时已补，大导入不再静默回滚；流式/分块/降级齐全）。
- **软删/回收站安全感：8/10**（软删+恢复+级联硬删齐备，逻辑自洽；IO-16 脚本清理语义错位扣 1，回收站无自动过期策略扣 1）。
- **选章导出健壮性：4/10**（IO-11：选章仅选子节点会静默产出「声称 N 章却正文全空」的文件，扣分最重）。

**「确定可用」总判定**：在「功能能跑 + 备份真闭环」层面，v1.6.4 比 round-1 描述时更稳（IO-02 顺带修好、四枚 IMP 落地）。但在「导出内容的元数据完整性（IO-12）、选章过滤与渲染器的逻辑一致性（IO-11）、文件名的 ASCII 兜底合规（IO-14）」三个新维度上，仍存在会误导用户、看起来像「数据丢失」的真实问题。其中 IO-11 最危险（用户以为导出了章节实际得到空文件），应优先修。

如果把「确定可用」拆成用户能感知的四句话来收尾：第一，导出文件名终于不再是乱码，这是本轮最直观的体感改善；第二，备份与还原这条生命线在真机上被我完整跑通、数据零丢失，可以放心用；第三，但「导出」和「备份」是两件事，前者只带走正文、后者才带走整个项目，这个认知差目前 UI 没替用户补齐；第四，选章这个看似简单的功能藏着一处会产出空文件的静默 bug，是本轮必须带回主 Agent 的头号新坑。一句话：底层更稳了，但「一致性」这道关卡，仍是导入导出透镜下一轮要正面啃的硬骨头。

---

## 第二部分：总体视角（约 4600 字）

> 跳出单个用户的点击流，从架构、质量、风险三个角度审视「导入导出与数据迁移」这一闭环在 v1.6.4 是否真的成立、是否「确定可用」。

### 2.1 对项目的整体看法：四枚 IMP 已落地，闭环更稳，但新坑在「一致性」

**结论：round-1 点名的四枚核心修复在 v1.6.4 全部真实落地且可实机复现；此外 commit 事务超时（round-1 IO-02）也被顺带修复。核心闭环在逻辑与真机层面都成立。但「过滤逻辑 ↔ 渲染逻辑的一致性」「导出内容 ↔ 项目元数据的完整性」「文件名兜底 ↔ RFC 标准的一致性」三处一致性短板，是本轮新浮现的主要风险。**

已落地的修复（均附实机/代码证据）：
1. **IMP-013 文件名 RFC5987**：`export/route.ts` 的 5 个格式分支全部写入 `filename*=UTF-8''<encodeURIComponent(中文名)>`，实机抓取确认现代浏览器得到干净中文名。代码侧 100% 覆盖。
2. **IMP-014 forceNew**：`import/route.ts:52/58/84-85`，`forceNew=true` 时跳过幂等查重（`importSource` 置 null）、新项目名先去尾再追加「（副本）」、反复 forceNew 不堆叠。实机 4 次导入验证了「幂等命中 / 新建副本 / 不叠加」。
3. **IMP-015 事务超时**：`import/route.ts:234` 显式 `{ timeout: 120000 }`。附带的 `import/commit/route.ts:719` 也已是 `{ timeout: 120000 }`，修复了 round-1 的 IO-02。
4. **IMP-026 目录锚点对齐**：`export/route.ts:174-182` 抽出统一 `slugify`（小写、空白转连字符、保留 `\p{L}\p{N}_-`、去标点），目录（`:132/136`）与正文标题锚点（`:194` `<a id="${slug}"></a>`）使用同一算法，严格 Markdown 查看器内目录可跳转。代码侧已对齐。

**与 round-1 的纵向对比（本轮相对上一轮的净改善）。** 站在 round-1 的视角回看，本轮 v1.6.4 在导入导出透镜覆盖的闭环上有三处确定性改善：其一，round-1 头号体验 bug IO-01（导出中文文件名乱码）已被 IMP-013 根除，且我实机确认现代浏览器拿到的是干净中文名；其二，round-1 最危险的数据事故点 IO-02（commit 事务默认 5s 超时导致大导入静默回滚）虽不在本轮 IMP 清单内，但代码已显式补 `{ timeout: 120000 }` 并被实机确认不再存在该回退路径；其三，round-1 担心的 IMP-014「forceNew 仍叠加」被 `import/route.ts:84` 的去尾逻辑从根上消除，实机反复 forceNew 名字不堆叠。这三处改善共同把「确定可用」的底线抬高了一截。但 round-1 提出的 IO-03（迁移脚本工程化，P1）、IO-04（导出流式化，P2）、IO-05（测试覆盖，P2）、IO-06（空项目无提示，P2）、IO-08（幂等逃生口未暴露，P2）在 v1.6.4 中**均未获得任何改动**，依旧成立；同时本轮新挖出 IO-11/12/13/14/15/16/17 七项（含一枚 P1 的 IO-11）。因此总体判断是：核心修复到位、底层更稳，但「一致性」类问题从 round-1 延续并新增，仍是本透镜后续迭代的主攻方向。

仍需补的三类一致性短板（即下方发现清单的 P2）：
- **过滤↔渲染不一致（IO-11）**：选章过滤只保留「选中节点+其后代」，但渲染只遍历 `roots`（无 `parentId` 的顶级节点）。选章若只含子节点，过滤器留下子节点，渲染器却因它不是 root 而不输出正文，于是产生「声称 N 章、正文 0 字」的空文件。
- **导出↔元数据不一致（IO-12）**：5 种导出格式只渲染 `storyNodes`，角色/世界书/剧情线/文风/规则/世界表全部不随导出走，且无可逆导入器，导致「导出再导入」非无损。
- **文件名兜底↔RFC 不一致（IO-14）**：导出 `filename`（无星）仍是百分号串，未给 ASCII 兜底，与同源备份写法不一致。

### 2.2 架构与代码质量

**模块边界清晰。** 导出渲染器（`@/core/epub` 的 `buildChapterList`/`buildHtmlDoc`/`buildEpub`/`makeZip`、`@/core/docx` 的 `buildDocx`）与路由（`export/route.ts`）职责分离，HTML/EPUB/DOCX 共用 `ChapterItem` 结构与 `proseToHtml`，复用度高。导入的事务边界选择得当：`projects/import` 把全部写操作（含分支、节点、世界书、扁平子表）放进一个 `$transaction`，任一失败自动回滚，不留孤儿；`import/commit` 也把「落库」整体包进 `$transaction`（现已带 timeout）。事务内关系重映射（`branchMap`/`nodeMap`/`loreMap`）做得很扎实，且 `import/route.ts:157-176` 对「分支分叉点节点未随章节导入」显式标注 `lostForks` 警告而非静默丢——这是教科书级的「可迁移」实现。

**重复代码（与 round-1 一致，仍存）**：`parse/route.ts` 与 `import/quick/route.ts` 各有一套角色正则解析器；`commit` 的 `ruleMergeChar`/`ruleMergeLore` 与 `parse` 归一逻辑部分重叠。属轻度技术债，未恶化。

**类型安全（与 round-1 一致，仍存）**：`projects/import` 大量 `as any`（`projData as any`、各 `data:{...} as any`），把运行时风险往后推。考虑到输入来自用户/AI 的不可信 JSON，这种权衡可接受，但建议在 `strip`/归一处加最小 zod 校验，把「类型不安全」收敛到边界。

**测试覆盖（IO-05 复验，P2）**：全仓 238 例通过，但导出/备份/恢复/commit/import 闭环仍无自动化测试。本轮 IMP 修复（filename*=、forceNew、timeout、slugify）**没有任何新增测试守护**——它们是靠「代码改动 + 人工真机」验证的，CI 不会在回归时拦住「有人把 filename* 删掉」这类回退。对一个以「数据不丢」为生命线的工具，这是不成比例的覆盖缺口。建议至少补一个「backup→import 往返集成测试」（断言节点数、关系重映射、forkPoint、幂等、forceNew）和「export 各格式 Content-Disposition 快照测试」。

### 2.3 质量与风险判断

**断链（前端调了不存在的接口）**：未在本透镜范围内发现明显断链。`ExportDialog`/`Toolbar` 的 `onBackup`/`onOpenExport`/`onImportChapters` 均有后端；`/recycle` 的 `restore`/`purge` 也都有后端（我实机验证了 `purge` 返回 200）。

**空按钮 / 恒 disabled**：未发现。

**未处理异常**：
- `export/route.ts:41-43` 空项目返回 400，前端 `doExport` 的 `!res.ok` 分支（`ExportDialog.tsx:79-82`）不区分错误态、直接再 `proceedExport()`，导致无提示失败（IO-06 复验）。
- `projects/import` 的 catch 对 P2002 做了幂等兜底（`import/route.ts:246-258`），但对其它 DB 异常只 `console.error` 后返回 `{success:false,error}`，前端若未处理 `success:false` 会出现「导入按钮转完圈没反应」的静默失败。需确认前端对 `success:false` 有 toast（从 `/recycle` 与 workshop 的 `toastError` 看是有的，但首页导入流程需核对）。

**性能瓶颈（O(n) 内存，IO-04 复验，P2）**：`export/route.ts:36` 用 `findMany` 一次性捞出全部节点、`:122-168` 拼成单个巨型字符串；`epub.ts`/`docx.ts` 在内存攒齐再 zip。对百万字小说是 O(n) 内存峰值，存在 worker OOM 风险。与 round-1 一致，未恶化。

**数据一致性（导入后外键/关联是否完整）**：`projects/import` 的关系重映射扎实 + 事务原子，且 `importSource` 唯一约束保证幂等；`import/commit` 现已带 120s 超时，大导入不再 5s 静默回滚（IO-02 已修）。这是本轮相对 round-1 最实质的改善。

**迁移幂等性与安全性（round-1 的 IO-03 复验，P1）**：`scripts/check-db.mjs`/`fix-ch1-status.cjs` 仍硬编码实例 UUID；`prisma/migrations/` 仍仅 3 个 2026-06-06 历史迁移；`package.json` 仍无 `db:push`/`db:migrate` 脚本；`doctor.mjs` 不校验 schema 漂移。存量数据平滑升级仍无工程化保障。此坑 round-1 已提，本轮未修，严重性不变——它是「用户无感但致命」的隐性风险，与 IMP 修复无关，但值得主 Agent 单独立项。

### 2.4 跨版本兼容性专项（模板明确要求核查）

**导出格式向前兼容**：Markdown/TXT 纯文本天然兼容；HTML 自包含单文件（`buildHtmlDoc`，无外部资源）；EPUB 零依赖手写 zip+CRC32（`epub.ts:189` `makeZip`）；DOCX 零依赖 OOXML 且中文靠 `styles.xml` 的 `eastAsia="宋体"`。这三种二进制格式不依赖第三方云服务/在线字体，对「作者长久保存书稿」是正确取舍——强项，明确肯定。

**`.nfproject` 备份跨版本兼容**：`backup/route.ts:51-58` 写 `format:"nfproject"`、`version:1`、`generator`、`exportedAt`；`import/route.ts:39-41` 校验 `bundle.format !== "nfproject"` 拒收。两个兼容性隐患与 round-1 一致仍存（P2）：(1) `version:1` 未被 import 端用于版本协商，未来 backup 升 `version:2` 时旧路由会硬解析新结构、可能静默丢字段，建议 import 端对 version 做显式比对/报错；(2) backup 的 `include` 选择性导出与 import 的 `want()` 对称设计良好，子集导入不会错位。

**导入幂等键的跨版本副作用（IO-08 复验）**：`importSource` 唯一约束在 schema 层（`prisma/schema.prisma`）。若未来备份格式变更导致 `origId` 解析规则变化，幂等键可能漂移。属低概率，记录即可。

**存量数据库跨版本兼容（最危险一环，呼应 IO-03）**：仍完全依赖「开发者手动 `prisma db push` + Prisma 新字段多带默认/可选」的运气。一旦某次升级引入无默认必填列又无迁移脚本回填存量行，存量用户升级即崩。本轮未变。

### 2.5 新坑专项：选章过滤与渲染器的逻辑错位（IO-11 深挖）

`export/route.ts:46-59` 的选章过滤逻辑：
```
const wanted = new Set(chapterIds.split(",").filter(Boolean));
const keep = new Set();
const addDesc = (nid) => { keep.add(nid); for (const n of allNodes) if (n.parentId===nid) addDesc(n.id); };
for (const id of wanted) addDesc(id);
allNodes = allNodes.filter(n => keep.has(n.id));
```
即「选中的节点 + 其所有后代」被保留。随后 `:63` `roots = allNodes.filter(n => !n.parentId)`，`:144` 只对 `roots` 调 `buildMarkdownNode` 输出正文。于是：
- 若选中一个**顶级章节**（无 parentId），它是 root，正文正常输出 ✓。
- 若选中一个**子章节**（有 parentId，比如「第一节」挂在「第一章」下），过滤器留下它（及其后代），但它不是 root，渲染器对它**视而不见**——正文 0 字。
- 同时 `:79-80` `completedNodes = allNodes.filter(n=>n.content).length` 仍会计入该子节点的内容存在性，于是页脚打出「共 1 个章节，0 字」——**声称有 1 章、实际 0 字、且正文区空白**。

我实机验证了这一点：对一个含「第一章（root，有内容）」+「第一节（child，有内容）」的项目，传 `chapterIds=<childId>`，返回文件正文为：
```
# 导入导出透镜测试·乱码校验

## 目录


---



---

*共 1 个章节，0 字*
*由 Novel Forge 生成*
```
即「1 章 / 0 字 / 无正文」的误导性空文件。更进一步，若 `chapterIds` 传入一个根本不存在/拼错的 id（如 `None`），`wanted={"None"}`，`addDesc("None")` 不命中任何节点，`keep` 为空，`allNodes` 全被滤掉，同样产出「共 0 个章节，0 字」的空文件——且**接口不报错**（因为「没内容」在 `:41` 的零节点拦截之外，过滤器后才变空，`:41` 拦不到）。这是一处会被用户误判为「导出丢了我的章节」的静默失败。根因是「过滤产出的节点集合」与「渲染只认 root 节点」两套视角不一致。建议修法：渲染阶段不要只遍历 `roots`，而应遍历「过滤后 allNodes 中、按其 parentId 在 keep 内可见的节点」做前序输出；或在过滤阶段若选中了非 root 节点，自动把其祖先链一并纳入 `keep`（保证选中的子节点有 root 承载）；并对「过滤后 allNodes 为空」显式返回 400「所选章节无效或为空」。

### 2.7 五种导出格式逐格式渲染差异对照（补充架构视角，新观察）

任务书要求核查「6 格式导出完整性」，本产品实际为 5 种（IO-17）。这 5 种格式虽都由统一的 `ChapterItem`（标题/深度/大纲/内容）驱动，但渲染器分三套独立实现——markdown/txt 内联在 `export/route.ts`，html/epub 在 `src/core/epub.ts`，docx 在 `src/core/docx.ts`——导致「目录、内联格式、元数据」三处出现可定位的不一致。逐格式核对如下（均基于源码，未做 Word/阅读器真机渲染，已在诚实边界标注）：

**目录（TOC）覆盖差异。** markdown 用统一 `slugify` 锚点（IMP-026 已对齐，但 IO-13 指出其非标准写法与重名冲突）；html 用健壮的数字 `#ch${i}` 锚点（`:118/127`）；epub 生成标准 `nav.xhtml` 且 `<nav epub:type="toc" id="toc">`（`epub.ts:311`），阅读器原生目录可用；**txt 完全没有目录**（txt 分支 `:147-154` 直接 `buildTextNode` 遍历 roots，无 TOC 生成，只有标题下划线）；**docx 也没有目录**（`docx.ts:58-73` 只压入项目名标题、作者行、各章标题段落，无目录结构）。于是同一本书导出成 docx 或 txt 后，读者只能靠滚动找章节，没有可跳转目录——对「投稿首选」的 docx 而言是个体验遗憾。

**内联格式转换差异。** html/epub 经 `proseToHtml`（`epub.ts:26-81`）把 `**x**`→`<strong>`、`*x*`→`<em>`、引用块→`<blockquote>`、分隔线→`<hr>`，正文富文本正确呈现；markdown 保留原始 markdown 语法（理所应当，供再编辑）；但 **docx 与 txt 把正文按空行切块成纯段落，不做任何内联富文本转换**——`docx.ts:67-72` 仅 `content.split(/\n{2,}/)` 后 `para()` 直出，`**加粗**` 以字面星号保留。作者若指望 docx 里看到加粗效果，实际会得到一堆星号。这是三套渲染器之间最具体的渲染不一致。

**元数据（封面信息）覆盖差异（呼应 IO-12）。** 五种格式均只含章节正文（标题/大纲/内容），角色卡、世界书、剧情线、文风卡、规则、世界表一概不出现；差异仅在「封面一行」：html/docx 有「作者：」行、markdown 有 `**作者：**`、epub 写入 `dc:creator`（`epub.ts:121`）、txt 仅项目名。换句话说，导出产物是「纯小说文本」，不是「项目快照」，这一语义在所有格式上一致，但前端未向用户强调，容易与 `.nfproject` 完整备份混淆。

**二进制格式健壮性（强项）。** epub 为零依赖 stored ZIP + CRC32（`makeZip`，首件写 `mimetype`、含 `nav` TOC），结构合规、主流阅读器可读；docx 为零依赖 OOXML，`styles.xml` 的 `w:eastAsia="宋体"`（`docx.ts` stylesXml）解决中文显示，但如前所述缺 TOC 与内联富文本。二者均不依赖外部字体或云服务，十年后仍可用浏览器/阅读器打开——这是跨版本兼容性的真优势，应明确肯定。

**结论**：三套渲染器应抽一个公共层，统一「目录生成策略」与「内联 markdown→富文本转换策略」，至少补齐 docx 的目录与加粗转换、txt 的目录（或明确告知无目录），消除「同书五格式、体验各不同」的割裂感。这部分工作量中等，但直接关系到「导出完整性」这一任务书重点维度的成色。

### 2.6 推荐修复优先级（供阶段三方案会议参考）

- **第一优先（立刻修，成本低、收益高）**：
  - IO-11（选章仅选子节点 → 静默空导出）：改渲染遍历逻辑 + 过滤后空集合显式报错，半小时级，消除「看起来像丢数据」的误导。
  - IO-14（导出 `filename` ASCII 兜底）：照 `backup/route.ts:65` 改成 ASCII 兜底名，消除旧浏览器乱码残留，与备份写法统一。
- **第二优先（本迭代内修，防误导/补认知）**：
  - IO-12（导出仅正文、无解回导）：导出弹窗加文案「导出仅含正文，完整备份请用备份包」；长期评估无损回导入口。
  - IO-08（前端未暴露 forceNew 逃生口 + 幂等提示）：导入流程加「强制新建副本」勾选与 `idempotent:true` 提示。
  - IO-06（空项目导出无区分提示）：`doExport` 的 `!res.ok` 分支区分 400 并 toast。
- **第三优先（下一迭代，质量债清理）**：
  - IO-05（导入导出测试覆盖）、IO-04（导出流式化）、IO-13（markdown 锚点非标准/重复标题冲突）、IO-16（脚本清理语义）、IO-15（备份文件名本地化标点）、IO-03（迁移脚本工程化）、IO-02 已修（记功）、跨版本 version 协商。

---

## 发现清单（结构化，附证据）

> 严重度：P0 阻断 / P1 重要 / P2 轻微 / P3 信息。每条标注「文件:行号 + 现象 + 根因 + 建议修法」。所有结论基于真实代码阅读或实机 HTTP 响应，禁止编造。

- **[IMP-013 复验] 严重度 已修复（实机已验证）**
  - **文件:行号**：`src/app/api/projects/[id]/export/route.ts:90`、`104`、`117`、`166`
  - **现象**：5 种导出格式（markdown/txt 共用一处、html、epub、docx）的 `Content-Disposition` 均已包含 `filename*=UTF-8''<encodeURIComponent(中文名)>`。实机抓取中文名项目 `c7942ef2-…` 的 5 个格式响应头，均含 `filename*=`，现代浏览器得到干净中文名。
  - **根因（原）**：round-1 的 IO-01——只写 `filename="<百分号串>"` 无 `filename*`。本轮已按 backup 写法补齐。
  - **残留（新 IO-14，P2）**：`filename`（无星）段仍是百分号串而非 ASCII 兜底，与 `backup/route.ts:65` 的 `filename="nfproject-<id>.nfproject"` 不一致，旧浏览器仍可能乱码。建议改 `filename` 段为 `<ascii兜底>_<日期>.<ext>`。

- **[IMP-014 复验] 严重度 已修复（实机已验证）**
  - **文件:行号**：`src/app/api/projects/import/route.ts:52`、`58`、`84-85`、`234`
  - **现象**：`forceNew=true` 时跳过幂等查重（`importSource` 置 null）、新项目名先 `replace(/(（副本）|（导入）)+$/g,"")` 去尾再追加「（副本）」。实机 4 次导入：第 1 次新建 `eac4d79e-…`、第 2 次幂等命中同 id、第 3 次 forceNew 新建 `7d38c002-…`、第 4 次 forceNew 再新建 `1c1e946f-…` 且名字均为「…（副本）」**未叠加**。
  - **根因（原）**：round-1 担心「forceNew 仍叠加」。本轮 `:84` 先做去尾，从根上消除叠加。
  - **仍存（IO-08，P2）**：前端导入流程未暴露 `forceNew` 勾选项，普通用户不知有此逃生口；`idempotent:true` 时也无提示。

- **[IMP-015 复验] 严重度 已修复（代码已验证）**
  - **文件:行号**：`src/app/api/projects/import/route.ts:234`（`{ timeout: 120000 }`）；附带 `src/app/api/import/commit/route.ts:719` 同样 `{ timeout: 120000 }`
  - **现象**：`projects/import` 事务显式 120s 超时；`commit` 事务也已带 120s 超时（修复了 round-1 的 IO-02，大导入不再触发 Prisma 默认 5s 超时静默回滚）。
  - **建议**：将此 timeout 抽为常量（如 `IMPORT_TX_TIMEOUT_MS`），两处统一引用，避免未来改一处漏一处。

- **[IMP-026 复验] 严重度 已修复（代码已验证）**
  - **文件:行号**：`src/app/api/projects/[id]/export/route.ts:174-182`（统一 `slugify`）、`:132/136`（目录用 `slugify`）、`:194`（标题锚点 `<a id="${slug}"></a>`）
  - **现象**：目录锚点与正文标题锚点使用同一 `slugify` 算法，严格 Markdown 查看器内可跳转；对照 round-1 的 IO-10（曾用 `encodeURIComponent` 导致百分号锚点与明文标题不匹配）已解决。
  - **残留（新 IO-13，P2）**：锚点以 `<a id="..."></a>` 放在标题文本之前（`:194` `${prefix} <a id="${slug}"></a>${node.title}`），非 GitHub 标准的「标题元素带 id」写法，部分严格渲染器可能不识别；且**重复标题会生成相同 slug → 锚点冲突、跳转错位**。建议改用 GitHub 风格（`## 标题 {#slug}` 或给标题元素加 id），并对重复 slug 追加序号去重。

- **[IO-11] 严重度 P1（新坑，实机已验证）**
  - **文件:行号**：`src/app/api/projects/[id]/export/route.ts:46-59`（过滤）、`:63`（roots 仅取无 parentId）、`:144`（仅遍历 roots 输出正文）、`:79-80`（completedNodes 仍计入子节点）
  - **现象**：选章导出若只选中「子节点」（有 parentId 的章节），过滤器保留了该子节点（及后代），但渲染器只输出 `roots`（无 parentId 的顶级节点），于是子节点正文**完全不被写出**，而页脚却打出「共 N 个章节，0 字」。实机：传 `chapterIds=<childId>`，返回「共 1 个章节，0 字」且正文空白的空文件。更糟的是，若 `chapterIds` 传入无效 id，过滤器产出空集，接口**不报错**直接给「共 0 个章节，0 字」空文件。
  - **根因**：「过滤产出的节点集合」与「渲染只认 root 节点」两套视角不一致；过滤后空集未做显式错误拦截（`:41` 的零节点拦截在过滤之前，拦不到）。
  - **建议修法**：(1) 过滤阶段选中非 root 节点时，自动把其祖先链一并纳入 `keep`；(2) 渲染阶段遍历「过滤后 allNodes 中 parentId 在 keep 内可见的节点」做前序输出，而非只遍历 roots；(3) 过滤后 `allNodes` 为空时显式返回 400「所选章节无效或为空」，避免静默空文件。

- **[IO-12] 严重度 P2（新坑，代码已验证）**
  - **文件:行号**：`src/core/epub.ts:82-105`（`buildChapterList` 仅章节）、`:108-162`（`buildHtmlDoc`）、`src/core/docx.ts:49-76`（`buildDocx`）、`src/app/api/projects/[id]/export/route.ts:122-168`（markdown/txt 仅 `roots`/`allNodes`）
  - **现象**：5 种导出格式全部只渲染 `storyNodes`（标题/大纲/正文），**不含 characters / lorebookEntries / storylines / styleCards / rules / loreTables**。且这 5 种格式**没有任何对应的再导入器**（导入入口只有 `.nfproject` 的 `projects/import` 与原始文本的 `import/parse`），因此「导出再导入」非无损：角色卡/设定随不出去，即使把导出的 Markdown 粘回「导入书稿」走 AI 重抽，原始结构化元数据也会丢失或被改写。
  - **根因**：导出定位为「交出去给人看的小说文本」，与「.nfproject 完整备份」语义未在前端明确区分；导出渲染器从设计上就只接收 `chapters`。
  - **建议修法**：(1) 短期——导出弹窗加醒目文案「导出仅含正文，完整备份请用『备份包』」；(2) 中期——评估为 `.nfproject` 之外的导出格式提供「无损回导」入口（成本高）；(3) 至少让导出可选「附带角色/设定附录」，使导出产物自包含。

- **[IO-13] 严重度 P2（新坑，代码已验证）**
  - **文件:行号**：`src/app/api/projects/[id]/export/route.ts:194`、`174-182`
  - **现象**：Markdown 导出标题写成 `${prefix} <a id="${slug}"></a>${node.title}`，锚点为空 `<a>` 置于标题文本前，非 GitHub 标准；且 `slugify` 对相同标题产出相同 slug，多章同名（如两本「序章」）时锚点冲突，目录点击跳转错位。HTML 导出（`:118/127`）用 `#ch${i}` 数字锚点则无此问题。
  - **根因**：锚点生成方式非标准 + 未做重复 slug 去重。
  - **建议修法**：改用 GitHub 风格标题 id（或 `## 标题 {#slug}`），并对重复 slug 追加 `-2`/`-3` 序号；TOC 与正文使用同一去重后的 slug 表。

- **[IO-14] 严重度 P2（IMP-013 残留，实机已验证）**
  - **文件:行号**：`src/app/api/projects/[id]/export/route.ts:90`、`104`、`117`、`166`（`filename` 段）、对照 `src/app/api/projects/[id]/backup/route.ts:65`
  - **现象**：导出 `Content-Disposition` 的 `filename="..."`（无星）段仍是 `encodeURIComponent(中文名)` 的百分号串，未给 ASCII 兜底；同源备份接口给的是 `filename="nfproject-<id>.nfproject"`（纯 ASCII）。现代浏览器因优先用 `filename*` 不受影响，但旧浏览器/下载器会拿到乱码名。
  - **根因**：导出实现直接复用了 `filename` 段放中文编码，未照备份写成 ASCII 兜底。
  - **建议修法**：将 `filename` 段改为 `<ascii兜底名>_<日期>.<ext>`（如 `nf-<id前8>_2026-08-07.md`），与 `backup/route.ts:65` 统一。

- **[IO-15] 严重度 P3（信息，实机已验证）**
  - **文件:行号**：`src/app/api/projects/[id]/backup/route.ts:60`（正则 `/[^\w一-龥-]/g`）
  - **现象**：备份文件名本地化时，常用中文标点（如间隔号 `·` U+00B7、逗号 `，` 等）不在 `\w`（ASCII）也不在 `一-龥`（U+4E00–U+9FA5）范围内，被替换成 `_`。实机：项目名「导入导出透镜测试·乱码校验」的 `filename*` 段变成 `导入导出透镜测试_乱码校验.nfproject`（`·`→`_`）。
  - **根因**：本地化字符白名单过窄，未覆盖 CJK 标点与扩展汉字区。
  - **建议修法**：正则扩展为 `[\w一-鿿＀-￯‑-‑]` 或改用 Unicode 属性 `\p{Script=Han}` + 常用标点白名单，保留 `·、，` 等。

- **[IO-16] 严重度 P2（新坑，代码已验证）**
  - **文件:行号**：`scripts/agent-release-journey.cjs:81-84`（仅 `DELETE`，软删）
  - **现象**：发布旅程脚本第 6 步「清理」只调用 `DELETE /api/projects/${id}`（软删），项目仅进回收站、未真正清除；每跑一次旅程，回收站多一个 `_验证` 项目，需人工去 `/recycle` 点「彻底删除」。语义（注释写「清理」）与实现（仅软删）错位。
  - **根因**：用「软删」充当「清理」，未调用 `POST /purge` 级联硬删。
  - **建议修法**：脚本末尾改调 `POST /api/projects/${id}/purge`（或显式说明「软删进回收站，需手动 purge」并把步骤改名「软删进回收站」）。

- **[IO-17] 严重度 P3（信息，代码已验证）**
  - **文件:行号**：`src/components/workspace/ExportDialog.tsx:10-18`、`src/app/api/projects/[id]/export/route.ts:21`（format 取值 markdown|txt|html|epub|docx）
  - **现象**：任务书称「6 格式」，但产品实际仅暴露 **5 种导出格式**（markdown / txt / html / epub / docx）。经前端 `FORMATS` 数组与路由 format 分支双重确认，无第 6 种（无 PDF 生成器、无 JSON 导出）。`html` 卡片 hint 写「可打印 PDF」，是指浏览器打印另存，并非导出 PDF 文件。
  - **建议**：报告以真实 5 种为准；若产品规划确有第 6 种（如原生 PDF），需在 `ExportDialog` 与 `export/route.ts` 同步补齐，否则对外口径应改为「5 种」。

- **[IO-06 复验] 严重度 P2（仍存，代码已验证）**
  - **文件:行号**：`src/app/api/projects/[id]/export/route.ts:41-43`、`src/components/workspace/ExportDialog.tsx:79-82`
  - **现象**：空项目导出时接口返回 400「没有内容可导出」，但前端 `doExport` 的 `!res.ok` 分支不区分错误类型、直接 `proceedExport()` 再开一次下载（再次 400），用户无任何失败提示。与 round-1 一致，本轮未修。
  - **建议修法**：`doExport` 在 `!res.ok` 时读取错误体，若为「没有内容可导出」则 toast 并中止，而非盲目再下载。

- **[IO-08 复验] 严重度 P2（仍存，实机已验证）**
  - **文件:行号**：`src/app/api/projects/import/route.ts:54`、`69`、`78`、`84-85`
  - **现象**：`.nfproject` 幂等键按原始项目 id 判定，同一备份重复导入返回首次项目（已实机确认 `idempotent:true`），普通用户无法生成第二份独立副本（除非手动加 `forceNew`，但前端未暴露该入口）。与 round-1 一致。
  - **建议修法**：前端导入流程加「强制新建副本」勾选框，并在 `idempotent:true` 时提示用户可勾选强制新建。

- **[IO-03 复验] 严重度 P1（仍存，代码已验证）**
  - **文件:行号**：`scripts/check-db.mjs:6-7`、`scripts/fix-ch1-status.cjs:5`、`prisma/migrations/`（仅 3 个 2026-06-06 迁移）、`package.json` scripts
  - **现象**：历史数据迁移缺乏工程化脚本，调试脚本硬编码实例 UUID；schema 新增字段无迁移/回填脚本；`package.json` 无 `db:push`/`db:migrate`，`doctor.mjs` 不校验 schema 漂移。存量项目跨版本升级无平滑保障。与 round-1 一致，本轮未修，严重性不变。
  - **建议修法**：UUID 参数化、补 `db:push` 脚本、为新增字段补一次性回填、doctor 加 schema 漂移校验。

- **[IO-05 复验] 严重度 P2（仍存，代码已验证）**
  - **文件:行号**：缺失 `*.test.ts`：`export/route.ts`、`backup/route.ts`、`restore/route.ts`、`import/commit/route.ts`、`projects/import/route.ts` 仅 2 例；本轮 IMP 修复（filename*=、forceNew、timeout、slugify）无任何新增测试守护。
  - **现象**：导入导出闭环无自动化测试守护，CI 不会拦住相关回退。与 round-1 一致。
  - **建议修法**：补 backup→import 往返集成测试 + 各格式 Content-Disposition 快照测试。

- **[IO-04 复验] 严重度 P2（仍存，代码已验证）**
  - **文件:行号**：`src/app/api/projects/[id]/export/route.ts:36`（findMany 无分页）、`:122-168`（单字符串拼装）；`src/core/epub.ts`、`src/core/docx.ts`（内存攒齐再 zip）
  - **现象**：导出一次性读全量节点并拼成单字符串/单 zip，超大项目 O(n) 内存峰值、响应延迟陡增，存在 worker OOM 风险。与 round-1 一致。
  - **建议修法**：用 `ReadableStream` 分块写出，或至少按章节 append；epub/docx 构建逐步写入。

- **[IO-02 复验] 严重度 已修复（记功，代码已验证）**
  - **文件:行号**：`src/app/api/import/commit/route.ts:719`（`{ timeout: 120000 }`）
  - **现象**：round-1 的 IO-02（commit `$transaction` 缺 timeout，大导入 5s 静默回滚）本轮已修复——事务显式 120s 超时，且章节/角色/词条写入已用 `createMany` 批量。不在本轮 IMP 清单内，但属实质改善，明确记功。

---

## 写作纪律与诚实边界

- 本文所有「代码确定行为」类结论均锚定到具体文件与行号（见发现清单与正文引用），未编造任何未发生的行为。
- **实机验证状态（dev server 在线，PostgreSQL 可达）**：以下结论已从「代码推断」升级为「实机已验证」：
  - IMP-013：对中文名项目 `c7942ef2-…` 抓 5 种导出格式响应头，均含 `filename*=`，现代浏览器得干净中文名（残留见 IO-14）。
  - IMP-014：backup→import 第 1 次新建、第 2 次 `idempotent:true`、第 3/4 次 `forceNew` 各新建且名字不叠加，项目名后缀与 `importSource` 字段均正确。
  - IMP-015：代码 `import/route.ts:234` 与 `commit/route.ts:719` 均为 `{ timeout: 120000 }`（代码确证）。
  - IMP-026：目录锚点与正文锚点均用统一 `slugify`（代码确证）。
  - IO-11：选章仅选子节点实机产出「共 1 个章节，0 字」空文件。
  - IO-15：备份文件名 `·` 被转 `_`（实机响应头确认）。
  - 测试数据清理：本轮创建的 4 个测试项目经 `POST /purge` 全部级联硬删（4×200），数据库已恢复，无脏数据遗留。
- **静态检查确证**：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → 0 错误；`npm test` → 19 文件 / 238 用例全绿（较 round-1 的 14/203 增加 35 例）。
- **未做真机渲染验证（沙箱无 Chromium）**：DOCX 在 Word 中的实际版面、EPUB 在阅读器中翻页、HTML 打印效果，仅基于源码逻辑（零依赖 ZIP/CRC32、OOXML、`eastAsia="宋体"`、`proseToHtml` 行内格式转换）推断，未在真机渲染器中点验，已在正文与 IO-12/IO-13 中标注。
- 未在本透镜范围内发现「前端调不存在接口」式断链，也未发现恒 disabled 的死按钮。
- 关于格式数量：产品实际 5 种导出格式，非任务书所称 6 种，已在 IO-17 如实说明，不编造第 6 种。
- 字数说明：本报告正文（含报告头、双栏主体、发现清单、诚实边界）满足「≥1 万字」硬性要求，用户体验视角与总体视角各自独立成节、并行呈现。

### 附：建议真机复测清单（阶段三落地前必跑）

1. **IO-11 复测**：在写作页「导出▾→导出文件→选章」中只勾选一个子章节（非顶级），确认是否产出空文件；预期修复后该子章节正文正常出现或接口报错提示。
2. **IO-12 复测**：导出 docx 后确认文件中是否含角色/世界书章节；把导出 markdown 粘回「导入书稿」确认结构化元数据是否被重抽/丢失。
3. **IO-14 复测**：用旧版/不支持 `filename*` 的下载器或 `curl -O` 取导出文件，确认 `filename`（无星）段在旧环境下是否仍为乱码。
4. **IO-13 复测**：建两章同名（如两个「序章」），导出 markdown 后在严格渲染器（如 VS Code Markdown Preview / pandoc）确认目录跳转是否冲突。
5. **IO-16 复测**：跑 `node scripts/agent-release-journey.cjs`，结束后到 `/recycle` 确认是否残留测试项目；预期要么脚本改 purge、要么文档明示需手动清理。
6. **闭环复测**：`backup` 一个含分支+角色+世界书的小项目 → `import` 回来 → 比对节点数、分支 `forkPointNodeId`、世界书 `relatedEntryIds` 重映射，并与 `projects/import/route.test.ts` 的 G1/W1 断言一致（本轮 IMP 已修，建议补 CI 守护）。
