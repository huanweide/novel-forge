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
| 包名 / 版本 | `novel-smith` v3.1.59 |
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
| 默认分支 | `main`（另有陈旧的 `master` 遗留，可择机删） |
| 最新 Release | `v3.1.58 品牌改名 Novel Smith + 微信收款码上线`（2026-08-31） |
| 最近推送 | `0fb601d`（ci: 快照标签不触发流水线，2026-09-01） |
| CI | 最近 5 次全部 success |
| 今日实测（2026-09-02 全站灰度） | HTTP 11/11 页面 200、浏览器实测 8/8 主页面零 JS 错误、写作视图完整渲染、API 链路通；**未发现严重 bug**；3 个体验痛点（首屏 10-12s 黑屏、写作区视野不够、章节首写引导弱）见 `PROCESS/analysis/novel-smith-精进分析-2026-09-02.md` |
| Issue | 0 |
| 待处理 PR | 4 个 dependabot 依赖升级：prisma 7.10.0 / @types/node 26.4.0 / vitest 4.1.11 / eslint 10.9.1 |
| Topics | 20 个（已达 GitHub 上限，加新的要先删旧的） |
| 预览站 | `https://novel-forge-nu.vercel.app`（Vercel 项目名还是旧名，改名需瑞宝宝授权） |

**改名背景（为什么要从 novel-forge 改成 novel-smith）**：赛道里已有一个同名且高度重合的开源项目 `RhythmicWave/NovelForge`（Python，1150 star，仍在活跃更新），搜 NovelForge 时别人先看到它，我们被完全淹没。改名后 GitHub 旧链接自动 301 跳转，不失效。**内部标识刻意没改**（localStorage 的 `novel-forge-*` 键名、预设 schema）——改了老用户数据会找不着。

---

## 五、版本更新记录（最新在上）

### v3.1.59 — 2026-09-02 — 本地过审自检入线（HUMANIZE，P0 大杀器落地）

- **把写完没接线的 `src/core/humanize/` 正式接进写作面板**：`CenterPanel` 顶部按钮组新增「过审自检」按钮，点击弹出 `HumanizePanel`（新增组件 14.7KB + 测试 4.9KB）。
- **产品定位**：纯本地规则引擎，不联网、不调 AI、不花一分钱，正文一个字节都不出用户电脑——这是相对所有云端 AI 检测（必须上传未发表稿件）的决定性差异，也是本地优先项目才敢说的话。
- **能看什么**：总分 + 四档等级（基本干净／轻微痕迹／痕迹明显／痕迹严重）+ 六个可解释原始数据（总字数、破折号每千字几个、平均句长、句长波动、短句占比、AI 词密度）+ 逐段命中原文高亮（每条写明「为什么像 AI 写的」和「怎么改」）+ 按严重度筛选。
- **产品底线（测试守着）**：免责声明永远可见（不保证通过平台 AI 率审核）；命中必给证据；面板关闭时不计算；正文不足 50 字按钮置灰，不给误导读数。
- **检测能力补强**：新增「不仅…而且…」递进句规则；修好否定式排比只认「…而是」收尾的漏判（纯三重否定以前整条检不出来）。实测典型 AI 文本命中 2 处 → 5 处，人写文本仍判干净。
- **质量门禁**：tsc `--incremental false` 0 错误；1289 条测试全绿（较 v3.1.58 的 1242 条新增 47 条）。
- **版本五件套**：package.json → 3.1.59；changelog-data.ts（LATEST_VERSION + VERSIONS + CHANGELOG_BRIEF）；CHANGELOG.md 顶部段落。
- 快照 `snap/20260902-173049-v3.1.59` 已建（改代码前拍的）。

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

1. 处理 4 个 dependabot PR（eslint 10 / @types/node 26 是大版本跳跃，需跑完整门禁再合）。
2. 把 `src/core/humanize/` 去 AI 味模块接线到生成流程（差异化计划 #1「本地过审自检」，需求规模已被 38.9k star 的去 AI 味工具验证）。
3. Vercel 预览站改名 `novel-forge-nu.vercel.app` → 新名（需瑞宝宝授权 Vercel 项目操作）。
4. 陈旧的 `master` 分支择机删除（确认无引用后）。

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
