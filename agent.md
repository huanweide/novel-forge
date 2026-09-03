# agent.md — Novel Smith 更新台账 & 回滚手册

> 这份文件是给「以后每一个接手的 AI 会话」和瑞宝宝自己看的。
> 干什么用：① 一眼看清项目现在啥状态；② 每次改了什么有账可查；③ 改坏了能一键回到改之前。
> 维护规则：**动代码前先建快照，改完在「版本更新记录」最上面加一段**。快照索引表由脚本自动追加，不要手改。

---

## 一、真身在哪（改错目录等于白干）

机器上躺着好几个同名文件夹，只有下面这个是真身（连着 GitHub、版本最新）：

| 项 | 值 |
|---|---|
| **真身路径** | `C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge` |
| GitHub 仓库 | `https://github.com/huanweide/novel-smith`（公开） |
| 默认分支 | `main` |
| 本地分支 | `main` |
| 包名 / 版本 | `novel-smith` v3.1.83 |
| 本地端口 | 3001 |

**这些是冒牌货 / 旧副本，别在上面改代码：**

| 路径 | 是什么 | 状态 |
|---|---|---|
| `C:\c\Users\...\2026-07-25-14-19-44\novel-forge` | 同名旧镜像 | 停在 v3.1.53，remote 还是旧名 novel-forge，**落后 5 个版本** |
| `C:\Users\Administrator\Projects\novel-forge` | 很老的克隆 | 停在 v0.26，分支 master |
| `C:\Users\Administrator\Desktop\Projects\novel-forge-ours` | 很老的克隆 | 停在 v0.26，分支 master |
| `C:\Users\Administrator\Desktop\Projects\novel-forge-github(.bak)` | **竞品** RhythmicWave/NovelForge 的克隆 | 只用来做竞品调研，不是我们的 |

> 判断真身的唯一标准：`git remote get-url origin` 返回 `novel-smith`，且 `package.json` 的 name 是 `novel-smith`。

---

## 二、快照怎么用（就三行命令）

```bash
# 改代码之前——拍一张快照（引号里写你这次要干啥）
./scripts/git-snapshot.sh create "这次要改什么的说明"

# 改完之后——看看历史快照都长啥样
./scripts/git-snapshot.sh list

# 改坏了——回到某张快照（安全模式：开新分支，main 不动）
./scripts/git-snapshot.sh restore snap/20260901-194000-v3.1.58
```

PowerShell 环境用 `.\scripts\git-snapshot.ps1`，参数和上面完全一样。

**两张模式的区别：**

| 命令 | 后果 |
|---|---|
| `restore <标签>` | 新建 `restore/xxx` 分支切过去，main 原样不动。随便看随便测，不满意删掉分支就行。 |
| `restore <标签> --hard` | 当前分支指针直接拽回快照点，**没提交的改动全丢**，会二次确认。 |

**快照里到底存了什么：**

| 内容 | 怎么存的 | 能还原吗 |
|---|---|---|
| 已入库文件 | git 注释标签 `snap/时间戳-版本号` | 能，秒级 |
| 未入库文件（新建了还没 add 的） | `.snapshots/时间戳-untracked.tar.gz` | 能，`tar -xzf` 解回仓库根目录 |
| 整个仓库全量 | `.snapshots/时间戳.bundle` | 能，**连 .git 目录被删都能还原**：`git clone xxx.bundle 新目录` |

`.snapshots/` 已加进 `.gitignore`，不入库（bundle 每个几十 MB，塞进 git 会把仓库撑爆）。

**异地备份**：快照标签会推到 GitHub（`git push origin snap/xxx`），只推标签、不推 bundle——标签几乎不占空间。这样即使本机硬盘挂了，也能从 GitHub 拉回任何一个快照点的代码；bundle 留在本机，专门防 `.git` 目录被误删。两条保险互相独立。
CI 已配 `tags-ignore: snap/*`，推快照标签不会触发流水线（否则每拍一次快照白烧 4 分钟）。

---

## 三、三条铁律（改代码必守）

1. **先快照，再动手。** 没有快照就改代码，等于走钢丝不系绳。
2. **改代码必 bump 版本，五件套一起改**：`package.json` 的 version、`src/lib/changelog-data.ts` 的 `LATEST_VERSION` + `CHANGELOG_BRIEF`、`CHANGELOG.md` 顶部段落。少改一处就不算完成。
3. **推送前必过门禁**：`npx tsc --noEmit --incremental false` 零错 + `npx vitest run` 全绿 + 生产构建通过。
   另外按零号安全铁律，push 前 grep 一遍凭据特征（`sk-` / `ck_` / `postgresql://真实密码` / `SESSDATA=` 等），确认零命中再推。

---

## 四、GitHub 现状（截至 2026-09-02）

| 项 | 状态 |
|---|---|
| 仓库 | `huanweide/novel-smith`，**公开** |
| Star / Fork | 1 / 0 |
| 默认分支 | `main`（陈旧的 `master` 分支已于 2026-09-02 删除；其 2 个独有提交——Postgres 直连旧方向的 `14c00be`/`ae4ceb9`——用 `backup/master-legacy-20260902` 标签异地保护，可随时还原） |
| 最新 Release | `v3.1.83 失败提示全站收尾——扫清剩余约 18 个组件 HTTP 裸状态码漏点（HTTP-STATUS-SWEEP）`（2026-09-03，Latest） |
| 最近推送 | `0fb601d`（ci: 快照标签不触发流水线，2026-09-01） |
| CI | 最近 5 次全部 success |
| 今日实测（2026-09-02 全站灰度） | HTTP 11/11 页面 200、浏览器实测 8/8 主页面零 JS 错误、写作视图完整渲染、API 链路通；**未发现严重 bug**；3 个体验痛点（首屏 10-12s 黑屏、写作区视野不够、章节首写引导弱）见 `PROCESS/analysis/novel-smith-精进分析-2026-09-02.md` |
| Issue | 0 |
| 待处理 PR | 0 个。本次（2026-09-02）本地统一合并 6 个 dependabot 升级中的 5 个：prisma 7.8→7.10、vitest 4.1.10→4.1.11、tailwindcss 4→4.3.3、@types/node 20→26.4、CI 的 setup-node 4→7；**eslint 9→10 暂留 v9**（eslint-config-next@16.2.7 内置的 eslint-plugin-react@7.37.5 调用了 ESLint 10 已删除的 `context.getFilename()` API，强升会打挂 lint，等生态就绪再升）。 |
| Topics | 20 个（已达 GitHub 上限，加新的要先删旧的） |
| 预览站 | `https://novel-forge-nu.vercel.app`（Vercel 项目名还是旧名，改名需瑞宝宝授权） |

**改名背景（为什么要从 novel-forge 改成 novel-smith）**：赛道里已有一个同名且高度重合的开源项目 `RhythmicWave/NovelForge`（Python，1150 star，仍在活跃更新），搜 NovelForge 时别人先看到它，我们被完全淹没。改名后 GitHub 旧链接自动 301 跳转，不失效。**内部标识刻意没改**（localStorage 的 `novel-forge-*` 键名、预设 schema）——改了老用户数据会找不着。

---

## 五、版本更新记录（最新在上）

### v3.1.83 — 2026-09-03 — 失败提示全站收尾——扫清剩余约 18 个组件 HTTP 裸状态码漏点（HTTP-STATUS-SWEEP）

- **收尾**：承接 v3.1.82 根因修复（isRawHttpStatusText）+ 6 处高频页，本棒把散落其余约 18 个组件的同类裸状态码漏点一次性扫清。
- **改动**：所有 error || HTTP 状态码 裸串拼接改走 describeHttpError，翻译成人话；零新逻辑、零数据层改动。
- **门禁**：类型检查 0 错、vitest 1363 全绿、生产构建通过。个人 IP 仍归瑞宝宝。
### v3.1.82 — 2026-09-03 — 失败提示全站说人话——根治 HTTP 裸状态码甩脸（HTTP-STATUS-DEHUMANIZE）

- **根因**：describeHttpError 翻译层被客户端兜底的 error: HTTP 500 裸码绕过，原样显示；default 分支自己也甩「服务返回了异常状态（HTTP 500）」。
- **修复**：新增 isRawHttpStatusText 识别裸状态码、改交状态码分支翻译；default 改写纯人话；连带中和 CharacterList / ImportWizard / explore 等约 7 处漏点。
- **高频直改**：StyleEditor（3 处）、dissect/[id]（1 处）、dissect（2 处）共 6 处改走 describeHttpError。
- **门禁**：类型检查 0 错、vitest 1363 全绿（新增 2 条）、生产构建通过。其余约 15 个组件同类漏点留作下一棒专项。个人 IP 仍归瑞宝宝。
### v3.1.81 — 2026-09-03 — 切章重置章内查找/替换状态（RESET-ON-NODE-SWITCH）

- **问题（真实缺陷）**：`selectedNode` 是父组件传入的 prop，切章时 `CenterPanel` 不卸载只换 prop，而查找词/替换词/计数三态没随切章重置，旧章词会带进新章，误点「替换全部」会跨章改写正文（不可逆）。
- **改动**：新增依赖 `[selectedNode?.id]` 的 `useEffect`，切章时清空查找词/替换词/匹配计数；同章内 AI 生成不变 id 不触发，符合预期。
- **达成效果**：切章后查找/替换框自动归零，杜绝跨章误替换。
- **质量门禁**：tsc 0 错、vitest 1361 全绿、build EXIT=0；零数据层改动，只改 CenterPanel.tsx 一处新增 effect。

### v3.1.80 — 2026-09-03 — 替换落库失败不再报假成功（REPLACE-FAIL-HONEST）

- **问题（真实缺陷）**：v3.1.78/79 的 commitContent 内部把落库异常吞掉、不向上抛，而 replaceOne/replaceAll 在 await 后无条件 toastSuccess，服务器保存失败时仍弹"已替换"成功。
- **改动**：commitContent 改为返回 Promise<boolean>（成功 true / 失败 false）；replaceOne/replaceAll 依返回值决定提示，成功才弹成功；replaceAll 在成功分支才清空「替换为」框。
- **达成效果**：替换没真的存上时会明确报错，不再"假成功"误导，用户数据一致性有兜底。
- **质量门禁**：tsc 0 错、vitest 1361 全绿、build EXIT=0；零数据层改动，只改 CenterPanel.tsx。

### v3.1.79 — 2026-09-03 — 替换后位置同步（替换当前处不再弹回第1处 · REPLACE-KEEP-POSITION）

- **问题（真实缺陷）**：v3.1.78 的 replaceOne 调 commitContent 时，commitContent 内部把 matchIdx 硬重置为 0，连续替换多处时每替换一处就被弹回第 1 处。
- **改动**：commitContent 新增 nextMatchIdx 参数，替换第 K 处后保持 matchIdx 指向下一处；replaceAll 传 0 回到起点并清空「替换为」框；替换框显示条件收紧为「有匹配才显示」。
- **达成效果**：框定查找词后连点「替换当前处」即可一路顺替，不用反复跳回开头。
- **质量门禁**：tsc 0 错、vitest 1361 全绿、build EXIT=0；零数据层改动，只改 CenterPanel.tsx。

### v3.1.78 — 2026-09-03 — 章内替换（当前章节正文里找词并替换成新词 · INTEXT-REPLACE）

- **问题（真实缺陷）**：v3.1.77 章内查找是只读的——找到词没法就地改。改角色名/统一术语/批量修正笔误仍得手动一段段找改。
- **改动**：新增 replaceMatches 纯函数（复用 countMatches 同款子串匹配，slice 拼接不解释 $&/$1，支持单处 occurrenceIndex 与全部 all，从后往前防偏移）+ 查找条下方替换行（「替换为…」输入框 + 替换当前处/替换全部）；对源文本走纯函数生成新正文后直接 PUT 落库，全程不碰 DOM。配套 11 条单测。
- **门禁**：tsc 0 错、vitest 1361 全绿（+11）、build EXIT=0。

### v3.1.77 — 2026-09-03 — 章内查找高亮（当前章节正文里找词并计数跳转 · INTEXT-SEARCH）

- **问题（真实缺陷）**：全局检索（v3.1.75）能跨全部章节找某段话在哪，但不解决「就在当前这一章几千字里精确定位某个词出现的位置」这个日常刚需。
- **改动**：新增纯函数内核 src/lib/in-text-search.ts（countMatches/hasNativeFind/jumpToMatch）+ 正文显示区查找条（放大镜+输入框+命中计数+↑/↓跳转）；浏览器原生 find 不可用时安全降级。配套 10 条单测。
- **门禁**：tsc 0 错、vitest 1350 全绿（+10）、build EXIT=0。

### v3.1.76 — 2026-09-03 — 三层自动保存（写一半崩了也不丢稿 · AUTOSAVE）

- **问题（真实缺陷）**：正文编辑只有点「完成」才落库，手动编辑时**没有保存状态指示器、没有 LocalStorage 断电兜底**，写几千字没存就崩/误关 = 全丢。ROADMAP 5.1 三层自动保存标 `[ ]` 未做。
- **改动**：新增 `src/lib/auto-save.ts` 纯函数内核（12 条单测）+ CenterPanel 接入——敲字 500ms 写本地、3s 自动落库、底部四态指示器、打开章节提示恢复未存草稿。
- **门禁**：tsc 0 错、vitest 1340 全绿（+12）、build EXIT=0。

### v3.1.75 — 2026-09-03 — 全文检索（写了几十万字也能秒定位那段话 · GLOBAL-SEARCH）

- **问题（真实缺陷，换维度找痛点）**：四大面板搜索（大纲/角色/世界书/伏笔）已全补齐，再做搜索就是重复劳动。换维度——长篇用户写到几十万字后，想找「某个角色第一次出现的地方」「那把铜钥匙在哪章提过」，**没有任何跨章节全文检索**（横扫 `src/app/api/` 无 search/find 路由，RightPanel 也无入口）。这是比面板搜索更大的一块缺失。
- **改动**：① 新增纯函数核心 `src/core/story-search.ts`（`searchStoryNodes`/`scanHits`/`buildSnippet`，零 IO 可单测）；② 新增 `GET /api/story/search` 路由（只 select content/outline 必需字段、按 order 升序、projectId 必填校验、搜索词≤100字）；③ 新建 `FullTextSearchPanel.tsx`（防抖 300ms 自动搜 + 回车立即搜、`reqId` 丢弃过期请求、命中词 `<mark>` 高亮、点结果跳章）；④ `RightPanel` 加 `search` 子 tab + `onJumpToNode` prop；⑤ workspace 页接 `onJumpToNode`（按 id 查 `project.storyNodes` 后 `handleSelectNode`）。
- **为什么不用搜索引擎**：中文无空格分词，子串 indexOf 已符合直觉且零依赖；几十万字 = 几 MB 字符串，原生 indexOf 毫秒级，不需要引倒排索引库。
- **防爆与体验**：单章最多 5 命中片段、最多 50 命中章节（超了提示「换更具体的词」）；空态/无匹配/错误态都给明确文案不黑屏；命中来源标注「正文/大纲/标题」；大小写不敏感、中英文都行。
- **零数据层改动**：不动 schema / API 存储；只改 RightPanel 接入口与 workspace 页传回调。
- **门禁**：tsc 0 错、vitest **1328 全绿（+15）**、build EXIT=0。

### v3.1.74 — 2026-09-03 — 伏笔搜索（几十条线索里一秒捞出要看的那条 · FS-SEARCH）

- **问题（真实缺陷）**：写作台面板横扫显示——`OutlineTree`（v3.1.72 已补）、`CharacterList`（早有完整筛选）、`WorldPanel`（v3.1.73 已补）都有搜索，唯独 `ForeshadowingPanel.tsx`（459 行）**零搜索**，只能靠分组折叠 + 肉眼翻。长篇用户伏笔几十上百条，这是与大纲/世界书同源的高频刚需。
- **改动**：`ForeshadowingPanel.tsx` 单文件——① 顶部统计条下方加紧凑搜索框（Icon search + input + 清空 X）；② `useMemo` 计算 `filteredGroups`，**命中保留原分组结构**（pending/partial/fulfilled/voided），空组自动隐藏；③ 实时计数「匹配 X / Y 条线索」；④ 无匹配独立分支，与「暂无未收尾线索」真空态分开。
- **匹配逻辑抽成模块级纯函数 `matchForeshadowItem` 并导出**（本轮唯一有逻辑的新代码），配 7 条单测：空关键词不过滤 / 描述中文子串 / developmentHint / 来源中英文 / 优先级中文（高/中/低）/ 章节号（第12章）/ 字段缺失不炸。匹配池 = description + developmentHint + SOURCE_LABEL 中文 + source 英文原值 + PRIORITY_TEXT + priority 原值 + 章节号。
- **测试揪出一处设计瑕疵**：原本 `SOURCE_LABEL[x] ?? x` 写法导致来源有中文映射时英文原值不参与匹配（搜 `outline` 不中）。改成中文标签与英文原值**双双进匹配池**，中英文都能搜。
- **踩坑（JSX 三元括号）**：在 `{cond ? (<div/>) : ( groupOrder.map(...) )}` 结构里，结尾闭合是 `}))}`（关 map 回调体 → 关 map( → 关三元括号 → 关 JSX 表达式），比原 `})}` 多两层；连错三次才对（TS1005 / TS1381）。**教训：大块 JSX 包三元时，先想清楚括号层数再落笔，别边写边补。**
- **零数据层改动**：纯前端 useState + useMemo（**useMemo 必须写在所有条件 return 之前**，否则违反 Hooks 规则），不动 schema / API / 存储；无障碍 input + 按钮均 aria-label。
- **门禁**：tsc 0 错、vitest **1313 全绿（+7）**、build EXIT=0。

### v3.1.73 — 2026-09-03 — 世界书搜索（设定多了照样一秒定位 · WORLD-SEARCH）

- **问题（真实缺陷）**：角色面板（CharacterList）早就有完整搜索 + 状态 / 标签筛选系统，但**世界书（WorldPanel）完全没有板块内搜索**——只能在左侧选板块（地理 / 种族 / 势力 / 历史 / 设定 / 其他）做粗筛，板块内找特定词条仍要肉眼一条条扫。长篇用户世界书动辄上百条设定，这是和「大纲搜索」同源的高频刚需。
- **改动**：`WorldPanel.tsx` 单文件——① 板块内加紧凑搜索框（放大镜 + 输入框 + 清空 X）；② `useMemo` 模糊匹配 title / keys（数组 join）/ content 前 200 字符；③ 实时计数「匹配 X / Y 个词条」；④ 无匹配走独立分支「没有匹配「{关键词}」的地理词条」+「清空搜索」，与「暂无地理设定」真空态分开（避免误以为设定丢了）。
- **零数据层改动**：纯前端 useState + useMemo，不动 schema / API / 存储；无障碍 input + 按钮均有 aria-label。
- **顺带修正 v3.1.72 的两处遗漏**：`changelog-data.ts` 的 `LATEST_VERSION` 没跟着升（停在 v3.1.71）、`CHANGELOG.md` 的 v3.1.72 条目只有标题无正文。本轮三处版本号（package.json / CHANGELOG.md / LATEST_VERSION）全对齐 v3.1.73。
- **门禁**：tsc 0 错、vitest 1306 全绿、build EXIT=0。

### v3.1.72 — 2026-09-03 — 大纲搜索（长篇高频刚需 · OUTLINE-SEARCH）

- **问题（真实缺陷）**：写作台左栏 `OutlineTree.tsx` grep 无任何 search / filter 关键词——**大纲完全没有搜索或过滤**。长篇用户写几百章后找某一章只能肉眼一个一个扫。先扫了 `catch {}` 空捕获（只有 layout.tsx:49 的 localStorage 兜底，合理非缺陷）、`AbortController` 缺失、`finally setLoading(false)` 缺失三个维度，工程纪律都已做到位，本轮从「用户体验」维度定位到这一真实痛点。
- **改动**：`OutlineTree.tsx` 单文件——① 顶部紧凑搜索框（Icon search + input + 清空 X）；② `useMemo` 模糊匹配 title / content 前 200 字符 / 状态文字；③ 命中节点沿 parentId 上溯保留祖先链（卷 / 分卷不隐藏上下文）；④ 实时计数「匹配 X / Y 个节点（含 Z 个祖先卷 / 分卷）」；⑤ 无匹配独立分支与「没有章节」空状态分开。
- **零数据层改动**：纯前端 useState + useMemo，不动 schema / API / 存储；无障碍 input + 按钮均有 aria-label。
- **门禁**：tsc 0 错、vitest 1306 全绿、build EXIT=0。commit `5fd620d`。

### v3.1.71 — 2026-09-03 — 失败说人话全站铺开（拆书/探讨/游戏/导入/仿写/角色扩展全部讲人话 · GEN-FAIL-VISIBLE-FULL）

### v3.1.70 — 2026-09-03 — 生成失败不再闷声（失败时说人话、告诉你下一步 · GEN-FAIL-VISIBLE）

- **问题（真实缺陷，非文档待办）**：写作台生成主链路 `streamSSE` 有两条「沉默失败」路径——① 不检查 `res.ok`，服务端返回 500 的错误响应被当流读掉、逐行跳过（`!trimmed.startsWith("data: ")` 全 continue），用户零反馈；② 网络层异常只 `console.error` 打进控制台，界面毫无提示。两者共同后果：按钮恢复可点、正文没变、不说为什么，用户以为没点上而反复点击 = 重复计费。
- **修法**：新增 `src/lib/stream-error.ts` 翻译层（`describeStreamError` 处理网络异常 / `describeHttpError` 处理 HTTP 非 2xx，优先转述服务端 `jsonError` 已写好的 `{error, hint}`），在 `!res.ok` 与外层 catch 两处接入 `toastError(描述, 标题)`。写测试时发现并确认：`describeStreamError` 对 AbortError 返回 null，保持「用户主动停止」安静不打扰。
- **范围验证（重要）**：全库 12 处 `getReader()` 流式点逐一复查，**仅写作台这一处缺 `res.ok` 检查**，explore / game / ImitationPanel / ImportWizard 等 11 处均已有检查——本棒精准命中唯一漏洞，未扩大改动面。
- 门禁：tsc 0 错、vitest 1306 全绿（新增 17 条 stream-error 测试）、build EXIT=0。

### v3.1.69 — 2026-09-03 — 写作台顶部多项目快捷切换（切项目不再回首页 · PROJECT-SWITCHER）

- **用户视角**：写作台顶栏的项目名后面，多了一个「▾」小按钮。点开是个下拉，列出你全部项目（按最近更新倒序），当前这个标着「当前」不能点，其他的标「打开」，点一下直接跳到那个项目的写作台——以前要「回首页 → 再点项目」两步，现在一步到位。
- **底层原理（大白话）**：这个下拉是「纯前端展示」——你点开它的时候，才向 `GET /api/projects` 要一次项目清单（名字、题材、章节数），之后就缓存住不再反复请求；你点某个项目，它就走 Next.js 的客户端路由 `router.push('/workspace/新id')` 无刷新跳过去，正文区立马换成新项目的内容。全程只改了顶栏一个文件（`Toolbar.tsx`），没动数据库、没动任何存储结构，所以最稳、最不会出 bug。
- **工程**：`Toolbar` 左侧项目名后新增下拉按钮 + 浮层列表（复用导出菜单同款透明全屏遮罩，点外部自动收起）；新增 `useRouter` + `loadProjects`（首开拉取、缓存、`catch` 静默失败兜底）；当前项目 `disabled` 不可点。零数据层改动。
- **质量门禁**：类型检查 0 错误、1289 条测试全绿、生产构建通过。

### v3.1.68 — 2026-09-02 — 大纲章节过审分绿/黄/红（让大纲一眼看出哪章机器味重 · HUMANIZE-MAP）

- **用户视角**：大纲里每一章的标题后面，都多了一个「过」字小色块（绿/黄/红）。它显示的是你用「过审自检」给这一章打出来的本地过审分——分数越高，说明这一章读起来越像机器写的。绿色（≤30）基本干净、蓝灰（≤60）轻微痕迹、橙黄（≤80）痕迹明显、红色（>80）痕迹严重，一眼就能看出哪章机器味重、需要返工。在过审面板点一下「保存过审分」，这个分数就钉在了大纲上，下次打开直接能看到，不用每次都重测一遍。
- **底层原理（大白话）**：你每写完一章，用写作面板里的「过审自检」扫一遍，它会在你电脑本地、不联网不调 AI 的情况下，找出读起来像机器写的痕迹（破折号滥用、句长像尺子量过一样均匀、否定式排比之类），打出 0-100 分。以前这个分数看完就散了、只在弹窗里闪一下。现在把这个分数「沉淀」成每章的标记——点保存，它就写进这一章的数据里（一个专门的保存接口，只写这一列、不动正文、不生成多余的历史版本），打开大纲直接看到色块，等于给整本书做了张「机器味地图」。
- **工程**：`StoryNode` 数据表新增 `humanizeScore` 列（和已有的 `qualityScore` 质量分同构），`prisma db push` 安全加列 + 补迁移文件夹 `20260902000000_add_humanize_score`；新增 `POST /api/story/nodes/[id]/humanize` 专用端点只写这一列（不触发正文快照、不动 `editVersion`）；`OutlineTree` 在质量分色块之后渲染「过」色标（四档颜色），`HumanizePanel` 新增「保存过审分」按钮（保存后 `updateNode` 就地更新、`useProjectStore` 状态刷新、大纲立即变色）；`CenterPanel` 把当前章节 `nodeId` 传给 `HumanizePanel`。共改动 8 个文件，本地库已 `db push` 落列。
- **质量门禁**：类型检查 0 错误、1289 条测试全绿、生产构建通过。

### v3.1.67 — 2026-09-02 — 写作时提示「该角色上次出现在第 X 章」（让写作台真正「感知」角色 · LAST-SEEN）

- **用户视角**：角色卡、世界书卡片上多了一行小字「上次出现：第 X 章 · 章节名」（时钟图标）。它直接告诉你这个角色 / 设定最近一次是在哪章登场的——你写新章时，再也不用翻遍全文找「上回这人出现在哪」。点一下这行小字，正文立刻跳到那一章，随手就能翻回上次出场处对照前后剧情。
- **底层原理（大白话）**：这套提示是「纯前端现算」的——打开写作台时，直接用你全部章节的正文，拿角色名、别名、词条名、触发词一个个去正文里找，谁最后被提到、就在第几章，当场算出来。它跟正文里黄色高亮用的是同一套匹配规则，所以不会出现「高亮有、提示没有」的矛盾；全程不联网、不查库、不新增接口，所以最稳。
- **工程**：新增纯函数 `src/lib/workspace-appearance.ts` 的 `computeLastAppearances`（扫描 storyNodes.content，按 order 取最后出现章节）；LeftPanel 用 useMemo 算好两张表（角色 / 世界书各一张），经 CharacterList→CharacterGroupList→CharacterRow、WorldPanel→WorldEntryList→WorldEntryCard 透传，卡片渲染提示并 onClick 经 onSelectNode 跳章。共改动 8 个文件，零数据层改动。
- **顺带修 v3.1.66 漏接**：v3.1.66 给世界书卡片加了「定位」按钮，但 WorldPanel 当时没把定位回调透传下去，按钮是死的。本轮补上 `onLocate={onLocateEntity}`，世界书「定位」按钮复活。
- **质量门禁**：类型检查 0 错误、1289 条测试全绿、生产构建通过。

### v3.1.66 — 2026-09-02 — 实体面板与写作区反向联动（点角色卡 / 世界书卡片，正文定位并高亮 · LOCATE-LINK）

- **用户视角**：角色卡、世界书卡片上多了一个「定位」小按钮（靶心图标，鼠标划过才显示）。你在一个角色卡上点它，正文会自动滚到这个角色第一次出场的地方，并黄光闪一下告诉你「就在这儿」。以前只能从正文里点高亮名字跳到卡片（正向），现在反过来从卡片也能定位正文（反向），两个方向终于打通了。
- **底层原理（大白话）**：正文里每个被高亮的角色 / 设定名，背后都偷偷挂了个「身份证号」（data-entity-id）。定位按钮一按，就用这个身份证号在正文里找到它第一次出现的位置，把屏幕滚到中间，再让它黄光呼吸两下。整个过程都在你浏览器里完成，不联网、不查数据库、不新增任何数据接口，所以最稳、最不会出 bug。切章节时自动清空定位，不会跑到上一章去高亮；这章根本没提这个角色时，就弹个提示告诉你「本章没提这人」。
- **工程**：WorkspacePage 新增 `selectedEntityId` 状态，往下传给左栏角色卡 / 世界书 → 中栏正文；中栏 `MarkdownViewer` 收到 `locateEntityId` 后在 `loaded` 后触发定位 effect（querySelector + scrollIntoView + Element.animate）。卡片「定位」按钮 `stopPropagation`，避免误触编辑 / 删除；target 图标复用 icons.tsx 已有注册。共透传 11 个文件，零数据层改动。
- **质量门禁**：类型检查 0 错误、1289 条测试全绿、生产构建通过。
- **顺带修正上轮漏改**：v3.1.65 的 VersionEntry 当时只写了 CHANGELOG.md，漏进 `changelog-data.ts` 的 `VERSIONS` 数组与 `CHANGELOG_BRIEF`，本轮一并补回，三个版本文件彻底对齐。

### v3.1.65 — 2026-09-02 — 导出前排版预览（导完不再翻车 · EXPORT-PREVIEW）

- **用户视角**：导出对话框里多了一个「预览排版」按钮（眼睛图标）。点一下，对话框会变成一个内嵌的网页预览框，把整本书按 HTML 排版渲染出来——标题层级、段落、大纲引用一目了然，你确认排版对味了，再点「导出」下载。不用再像以前那样「导完才发现格式不对、白等半天」。五种格式（Markdown / TXT / HTML / Word / EPUB）都能用，预览用的就是和导出同一套排版，所见即所得。
- **底层原理（大白话）**：以前导出是「盲导」——选个格式、点导出，浏览器才开始打包下载，下载完打开才发现排版别扭，但时间已经花了。现在等于在下载前先给你看一眼「成品长什么样」。它调的是和导出完全相同的那个接口（只把格式固定成 HTML、沿用你选的整本 / 选章、是否带大纲、作者署名），所以预览里看到的排版，跟最终文件里的一模一样，不是另写一套假预览。
- **工程**：`src/components/workspace/ExportDialog.tsx` 新增 `previewExport`（fetch html 格式导出接口 → 把返回的整本 HTML 字符串塞进 `previewHtml` state → 切到预览视图）；`Modal` 按 `showPreview` 状态动态切换宽度（普通导出 max-w-md ↔ 预览 max-w-3xl）与内容（表单 ↔ 内嵌 iframe，占位高 `h-[88vh]`）；iframe 用 `sandbox` 隔离、HTML 样张纯静态自包含。选章模式没勾章节会 toast 提示先选章；预览失败（如空书 / 接口报错）走 toast 不卡死。只动 ExportDialog 一个组件，零数据层改动。
- **质量门禁**：类型检查 0 错误、1289 条测试全绿、生产构建通过。

### v3.1.64 — 2026-09-02 — 写作台沉浸写作模式（把 Zen 专注升级为真全屏 · IMMERSIVE）

- **用户视角**：写作台顶栏多了一个「沉浸写作」按钮（最大化图标），点一下，大纲栏、AI 助手、工具栏全部隐去，浏览器进入全屏——地址栏标签栏消失，正文占满整块屏幕，像 Ulysses / Scrivener 那样纯粹地写。再按 `Esc` 或 `Cmd/Ctrl + .` 就退出。
- **底层原理（大白话）**：这等于给之前的 Zen 专注「补了两块拼图」——原来 Zen 只藏了工具栏和左边栏，右边 AI 助手还占着 35% 视野，也没真全屏；现在把右边也藏了、再让浏览器进物理全屏，正文区才算彻底拉满。退出时监听浏览器全屏状态变化，你按 Esc 退出全屏它会自动跟着退出沉浸，不会出现「屏幕回来了但侧栏还藏着」的怪状态。就算某些环境（比如嵌在别的页面里）浏览器不让全屏，也只是全屏失败、布局沉浸照常生效，不报错。
- **工程**：`src/app/workspace/[projectId]/page.tsx` 在 zenMode 状态变化处加两个 effect（进入时 `requestFullscreen`、退出时 `exitFullscreen` + 监听 `fullscreenchange` 同步）；顶栏二级栏加「沉浸写作」按钮（`setZenMode(true)`）；`src/components/ui/icons.tsx` 图标注册表新增 `maximize`（Lucide `Maximize`）。纯 UI 状态增强，无数据层改动。
- **质量门禁**：类型检查 0 错误、1289 条测试全绿、生产构建通过。

### v3.1.63 — 2026-09-02 — 写作台加载骨架屏（告别首屏黑屏 · SKELETON）

- **用户视角**：打开写作台（/workspace）加载时，不再是「黑屏 + 三个跳动小圆点」的漫长空等，而是立刻出现跟真实界面一模一样的三栏骨架——顶部项目名 + 按钮、左边大纲栏、中间正文区、右边面板，全部用微光动画占位，底部一行「正在载入你的小说宇宙…」。App 一就绪就无缝替换成真内容，你一眼就知道「它在加载、快好了」，不会再以为卡死。
- **底层原理（大白话）**：这就像你去餐厅，桌上先摆好餐具和菜单的空框（骨架屏），而不是让你在黑暗里干坐。之前的首屏 10-12s 黑屏是因为开发模式下页面要先编译一大堆代码才能显示，这期间屏幕啥都没有；骨架屏不依赖任何数据，纯用 CSS 占位先画好布局，把「黑屏空窗」变成「有明确预期的加载中」。它只改了「还在加载时显示什么」这个分支，完全没碰真正取数据、渲染内容的逻辑，所以零风险。
- **工程**：`src/app/workspace/[projectId]/page.tsx` 的 `if (loading) return (...)` 分支从「三个跳动小圆点 + 黑底」替换为贴合真实三栏布局的骨架屏；复用现有 `shimmer-line` 微光动画（与首页项目卡骨架屏同一套）；深浅主题自适应，无新接口、无状态改动、无数据层变更。
- **质量门禁**：类型检查 0 错误、1289 条测试全绿、生产构建通过。

### v3.1.62 — 2026-09-02 — 写作面板新增「下一步建议」首写引导（WRITEGUIDE）

- **用户视角**：打开任意章节，控制栏下方多了一行浅色引导条——它看你这章写了多少字，实时告诉你「下一步该干嘛」：空白章提示先写开头或点生成起草、不到 500 字提示继续续写铺场景、500-1500 字提示润色/检查冲突、超过 1500 字提示过审自检/标记完成。
- **底层原理（大白话）**：这就是个「写作教练小贴士」——完全不碰你的任何按钮（只读取当前字数、章节状态、是否正在生成三个已有状态），所以绝不会误触发操作。它解决的是此前实测发现的痛点：写作面板一上来 8 个按钮，新手根本不知道先点哪个；现在直接用一句话把「你该干嘛」顶到眼前。
- **工程**：`src/components/workspace/CenterPanel.tsx` 控制栏插入一段纯展示 JSX（IIFE 计算建议，只读 `currentWords`/`selectedNode.status`/`isGenerating`，生成中自动隐藏）；无新接口、无数据层改动。
- **质量门禁**：tsc 0 错、生产构建通过。

### v3.1.61 — 2026-09-02 — 首页新增「灵感火花」创意启发板块（SPARK）

- **用户视角**：首页文体墙下方多了一块「灵感火花」——不知道写啥时，点一下「抽一张灵感牌」，系统从题材×开局×张力×反转四个维度随机拼出一段完整灵感（如「仙侠｜一觉醒来昨天的记录都被抹去…核心张力：记忆与遗忘；一句话反转：而真相是这一切都是你亲手设计的」）；「换一张」重抽，「用这个开局」直接带着这枚火花跳进探讨模式，AI 接着它往下聊。
- **底层原理（大白话）**：这就是个「灵感骰子」——把 8 种题材、10 个开局情境、8 种张力、8 种反转各写成一叠牌，每次随机抽四张拼成一句话。全程在浏览器本地算、不联网不调 AI，所以零成本、零延迟、拔网线也能用，正好契合项目「本地优先、数据不出本机」的调性。视觉上沿用首页的「虚空玻璃」玻璃卡风格（题材色光晕 + 悬浮浮起发光），深色浅色都好看，图标全用现成的 Lucide、不塞 emoji。
- **工程**：新增 `InspirationSpark` 组件（`src/app/page.tsx`）+ 配套 CSS（`src/app/globals.css`）；扩展 `/explore` 消费 `inspiration` 参数、给出针对性开场白（首页带过来的灵感牌会显示进对话）。
- **质量门禁**：tsc `--incremental false` 0 错误；1289 条测试全绿；生产构建通过。

### v3.1.59 — 2026-09-02 — 本地过审自检入线（HUMANIZE，P0 大杀器落地）

- **把写完没接线的 `src/core/humanize/` 正式接进写作面板**：`CenterPanel` 顶部按钮组新增「过审自检」按钮，点击弹出 `HumanizePanel`（新增组件 14.7KB + 测试 4.9KB）。
- **产品定位**：纯本地规则引擎，不联网、不调 AI、不花一分钱，正文一个字节都不出用户电脑——这是相对所有云端 AI 检测（必须上传未发表稿件）的决定性差异，也是本地优先项目才敢说的话。
- **能看什么**：总分 + 四档等级（基本干净／轻微痕迹／痕迹明显／痕迹严重）+ 六个可解释原始数据（总字数、破折号每千字几个、平均句长、句长波动、短句占比、AI 词密度）+ 逐段命中原文高亮（每条写明「为什么像 AI 写的」和「怎么改」）+ 按严重度筛选。
- **产品底线（测试守着）**：免责声明永远可见（不保证通过平台 AI 率审核）；命中必给证据；面板关闭时不计算；正文不足 50 字按钮置灰，不给误导读数。
- **检测能力补强**：新增「不仅…而且…」递进句规则；修好否定式排比只认「…而是」收尾的漏判（纯三重否定以前整条检不出来）。实测典型 AI 文本命中 2 处 → 5 处，人写文本仍判干净。
- **质量门禁**：tsc `--incremental false` 0 错误；1289 条测试全绿（较 v3.1.58 的 1242 条新增 47 条）。
- **版本五件套**：package.json → 3.1.59；changelog-data.ts（LATEST_VERSION + VERSIONS + CHANGELOG_BRIEF）；CHANGELOG.md 顶部段落。
- 快照 `snap/20260902-173049-v3.1.59` 已建（改代码前拍的）。

### v3.1.60 — 2026-09-02 — 依赖升级与工程维护（chore）

- **合并 5 个 dependabot 升级**：prisma/@prisma/client 7.8→7.10、vitest 4.1.10→4.1.11、tailwindcss 4→4.3.3、@types/node 20→26.4、CI 的 setup-node 4→7。
- **eslint 9→10 暂留 v9**：`eslint-config-next@16.2.7` 内置 `eslint-plugin-react@7.37.5` 调用了 ESLint 10 已删除的 `context.getFilename()`，强升会打挂 lint；PR #14 关闭并注明原因，等生态就绪再升。
- eslint 忽略项补 `.next-detect/**`（一次性构建实测残留目录，防误扫）。
- **门禁**：tsc 0 错、vitest 1289 全绿、生产构建通过。未 bump  behavīor；lint 仍为非阻塞存量债。
- 快照 `snap/20260902-183824-v3.1.59`（合并 dependabot 前拍的，仍在 v3.1.59 标签）。

### 2026-09-02 — 全站灰度测试 + 精进分析报告（**不 bump 产品版本**）

- 实测覆盖：11 页面 HTTP 200 / 浏览器实测 8 个主页面零 JS 错误 / 工作区写作视图完整渲染 / API 链路通（projects / settings / parse-settings 200，characters 有 400 输入校验）。
- **未发现严重 bug**；发现 3 个体验痛点（首屏 10-12s 黑屏、写作区视野挤压、章节首写引导弱）。
- 出深度分析报告：`PROCESS/analysis/novel-smith-精进分析-2026-09-02.md`（不入 git）。P0 = 接线 humanize（**已写完未入线的 32KB 去 AI 味模块**）+ 首屏并行化；P1 = 沉浸模式 / 写作建议 / 实体联动 / 导出预览；P2 = 章节过审分颜色化 / 模板市集 / 多项目切换 / 移动端；P3 = README 视频化 / 插件 API / 双语文档站。
- 关键发现：`src/core/humanize/` 是中文写作圈需求最旺的「本地去 AI 味评分器」，**32KB 规则库已写完但未接线**——是 0→1 差异化大杀器，竞争对手追需要重写。
- 9 张实测截图存 `tmp/shots/0-*.png`（不入 git，但快照已保护）。
- **不 bump 产品版本**：纯调研与报告，按 doc/asset 约定。

### 2026-09-01 — 工程基建：git 快照与回滚体系（**不 bump 产品版本**）

- 新增 `scripts/git-snapshot.sh` 与 `scripts/git-snapshot.ps1`（功能相同，bash / PowerShell 各一份），四个命令：`create` / `list` / `restore` / `verify`。
- 新增本文件 `agent.md`：项目台账（真身路径、GitHub 现状、版本历史、未入库工作、待办、快照索引）。
- `.gitignore` 追加 `/.snapshots/`（每个 bundle 约 31 MB，入库会把仓库撑爆）。
- `AGENTS.md` 顶部加「第零条：动手前先建快照」，后续每个接手的 AI 会话强制先跑快照再改代码。
- **基线快照 `snap/20260901-194546-v3.1.58`**，已实测三项全过：`verify` 显示 bundle 完好；`restore` 安全模式正确落到 `8724f1e`（main 未受影响）；未入库包解出 12 个文件，`src/core/humanize/` 三件套（7228 / 21987 / 3160 字节）与中文路径 `会议/2.0-plan/` 六份文档全部完好。
- **为什么不 bump 版本**：这批是开发工具与文档，不改产品行为，按既有约定「doc/asset 修正不 bump」。若后续把快照脚本接进产品功能，届时再 bump。

### v3.1.58 — 2026-08-31 — 品牌改名 + 收款码上线

- **改名 novel-forge → novel-smith**，31 个文件：GitHub 仓库名、git remote、package.json、README 中英、PWA manifest、banner 横幅、界面文案（首页/设置页/更新面板）、导出 DOCX/EPUB 水印、安全公告链接。内部存储键与预设 schema 保持原样。
- **微信收款码上线**：`public/sponsor/wechat-qr.png`（93248 字节）已入库，设置页「8. 赞助支持」显示真码，GitHub FUNDING 指向同一张，占位文案已移除。
- **首屏辨识标签**：README 中英标题下补 `TypeScript · Local-First · 分层记忆引擎 · 中文长篇 · 数据不出本机`。
- **门禁**：tsc 0 错、122 文件 / 1232 测试全过、生产构建 140 路由通过、CI 双 run success。
- 提交 `8724f1e`，Release v3.1.58 已发布。

### v3.1.57 — 2026-08-30 — 赞助支持

- 设置页新增「8. 赞助支持」区块（图片 onError 容错占位）；`.github/FUNDING.yml` 配 custom 指向收款码 raw 链接，仓库主页显示 Sponsor 按钮。
- README 中英加赞助说明，版本号同步。

### v3.1.56 — 2026-08-30 — 安全升级 + 老库迁移

- **阻断级修复**：字段改 Json 后旧库 `Project.genre` 存裸字符串，解析报 `SyntaxError` 导致首页 500 空白。新增 `scripts/migrate-json-fields.mjs`（幂等、自动备份），把裸字符串补引号。仅旧库升级需跑一次。
- **Next.js 16.2.7 → 16.3.3**，修 9 个 high 级漏洞（Middleware bypass、SSRF、缓存混淆、DoS 等）。

---

## 六、未入库的工作 & 待办

**未入库（git 还没跟踪，快照会单独打包保护）：**

| 路径 | 内容 |
|---|---|
| `src/core/humanize/` | 去 AI 味 / 本地过审自检模块：`index.ts`(7.2KB) + `rules.ts`(22KB) + `types.ts`(3.2KB)，共约 32KB，功能尚未接线 |
| `会议/2.0-plan/` | 董事会讨论文档 6 份（chair-integration / elon / jobs / karpathy / munger / zhangxuefeng） |

**待办：**

1. ~~处理 dependabot PR~~ **【已完成 2026-09-02】** 实际有 6 个 OPEN PR：#7 setup-node 4→7、#12 tailwind 4.3.0→4.3.3、#14 eslint 9.39.4→10.9.1、#15 vitest 4.1.10→4.1.11、#16 @types/node 20→26.4.0、#17 @prisma/client 7.8.0→7.10.0。本地统一升级 + 全门禁（tsc 0错 / vitest 1289 全绿 / 生产构建通过）。其中 #14 eslint 10 因 `eslint-config-next` 不兼容暂留 v9（关闭 PR 并注明原因），其余 5 个合入后关 PR。
2. ~~把 `src/core/humanize/` 去 AI 味模块接线到生成流程~~ **【已完成 v3.1.59】** 已作为「本地过审自检」入线（CenterPanel 一键过审，纯本地、不联网、不花一分钱）。
3. Vercel 预览站改名 `novel-forge-nu.vercel.app` → 新名（需瑞宝宝授权 Vercel 项目操作）。
4. ~~陈旧的 `master` 分支~~ **【已删除 2026-09-02】** 删除前先诊断：master 领先 main 2 个独有提交（`14c00be`/`ae4ceb9`，均为 Postgres 直连旧方向，与现 SQLite 架构冲突、属被放弃方向），已先打 `backup/master-legacy-20260902` 标签异地保护，再删 origin/ghssh 两远程 + 本地 master 分支，并 `fetch -p` 清理过期追踪引用；远程默认分支确认是 `main`，无引用、零丢失。
5. **首屏并行化实测结论（2026-09-02，不 bump）**：生产构建首屏 JS 体积仅为开发的 1/6（工作区 1.67MB vs 9.9MB），配合预渲染 HTML 首屏立即可见，生产首屏基本秒开；开发模式 10-12s 黑屏是 dev 模式固有成本（Turbopack 实时编译未压缩 chunk），**属假象，无需做首屏并行化优化**。

---

## 七、快照索引（脚本自动追加，别手改）

| 标签 | 时间 | 版本 | 分支 | 说明 | 大小 |
|---|---|---|---|---|---|
| `snap/20260901-194546-v3.1.58` | 2026-09-01 19:45 | v3.1.58 | main | 基线快照：v3.1.58（改名+收款码已完成），建立快照体系前 | 31M |
| `snap/20260901-194854-v3.1.58` | 2026-09-01 19:48 | v3.1.58 | main | 快照体系已落地并提交 81b318a，推送前 | 31M |
| `snap/20260901-200738-v3.1.58` | 2026-09-01 20:07 | v3.1.58 | main | 开始使用体验与灰度测试，动手前 | 31M |
| `snap/20260902-150934-v3.1.58` | 2026-09-02 15:09 | v3.1.58 | main | 接手灰度测试：全站 UI 实测 + 生成链路监管，动手前 | 31M |
| `snap/20260902-152317-v3.1.58` | 2026-09-02 15:23 | v3.1.58 | main | 灰度测试 + 精进分析报告完成，落地前 | 31M |
| `snap/20260902-152537-v3.1.58` | 2026-09-02 15:25 | v3.1.58 | main | P0：接线 humanize 去AI味过审，动手前 | 31M |
| `snap/20260902-173049-v3.1.59` | 2026-09-02 17:30 | v3.1.59 | main | 手动快照 | 31M |
| `snap/20260902-181738-v3.1.59` | 2026-09-02 18:17 | v3.1.59 | main | 首屏并行化生产构建实测，动手前 | 31M |
| `snap/20260902-183824-v3.1.59` | 2026-09-02 18:38 | v3.1.59 | main | 合并 dependabot 依赖升级前 | 31M |
