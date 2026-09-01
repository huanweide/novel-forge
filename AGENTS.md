<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:novel-forge-rules -->
# Novel Smith 项目规则 — 每次会话必定加载

## 🔴 第零条：动手前先建快照（最高优先级，改任何文件前必做）

本仓库已配好快照工具，**改任何文件之前必须先跑一次**，否则改坏了没法回退：

```bash
./scripts/git-snapshot.sh create "一句话说明这次要改什么"
# PowerShell 用：.\scripts\git-snapshot.ps1 create "一句话说明"
```

- 快照 = git 标签（管已入库文件）+ tar 包（管还没 add 的文件）+ bundle（连 .git 被删都能还原）。
- 回滚：`./scripts/git-snapshot.sh restore <标签>`（安全模式开新分支，main 不动）。
- 查历史：`./scripts/git-snapshot.sh list`
- 完整台账、真身路径、GitHub 现状、版本历史全在 **`agent.md`**，动手前先读一遍。

### ⚠️ 真身路径（改错目录等于白干）

真身只有这一个：`C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
（判断标准：`git remote get-url origin` 返回 `novel-smith`，`package.json` 的 name 是 `novel-smith`）
`C:\c\Users\...\novel-forge` 是 v3.1.53 的旧镜像，**别在上面改**。详见 agent.md 第一节。

## 🔴 公告更新流程（强制 — 每次代码变更后必做）

每次对代码做任何修改并 commit 后，必须同步更新公告系统。这是硬性要求，不可跳过。

### 公告数据有两个文件，必须同时更新：

1. **`CHANGELOG.md`** — 人类可读的版本记录（项目根目录）
2. **`src/lib/changelog-data.ts`** — 前端公告系统的数据源

### 具体步骤（4步，缺一不可）：

```
第1步：更新 CHANGELOG.md
  - 在文件顶部（## v旧版本 上方）插入新版本条目
  - 格式：## vX.Y.Z — YYYY-MM-DD，然后是功能分类列表

第2步：更新 src/lib/changelog-data.ts
  - LATEST_VERSION → 新版本号
  - CHANGELOG_BRIEF → 新版本的4条摘要
  - VERSIONS 数组最前面插入新版本条目（version/date/title/sections）

第3步：git commit（CHANGELOG.md + changelog-data.ts 一起提交）

第4步：确认本地 dev server 已热更新（Turbopak 自动）
```

### 检查清单（commit 前自问）：
- [ ] CHANGELOG.md 版本号对了吗？
- [ ] changelog-data.ts LATEST_VERSION 对了吗？
- [ ] changelog-data.ts CHANGELOG_BRIEF 是当前版本的摘要吗？
- [ ] changelog-data.ts VERSIONS 数组第一条是当前版本吗？
- [ ] localhost:3001/changelog 能看到最新版本吗？

---

## 🚀 本地部署上线流程（强制 — 每次 commit 后必做）

每次 git commit + push 完成后，必须执行以下步骤确保本地真正上线：

```
第1步：TypeScript 编译检查
  cd C:/Users/Administrator/Projects/novel-forge
  npx tsc --noEmit --pretty
  → 有错误必须修，零错误才能继续

第2步：公告同步检查
  - CHANGELOG.md 最新版本号 == changelog-data.ts LATEST_VERSION ?
  - 不一致 → 立即修复再继续

第3步：清除缓存 + 重启 dev server（Turbopak 热更新不可靠时）
  netstat -ano | grep ":3001" | grep LISTENING | awk '{print $5}' | xargs -I{} taskkill //PID {} //F
  rm -rf C:/Users/Administrator/Projects/novel-forge/.next
  cd C:/Users/Administrator/Projects/novel-forge && npx next dev --turbo -p 3001 &

第4步：验证服务
  curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3001
  → 必须返回 HTTP 200

第5步：验证 changelog 页面
  curl -s http://localhost:3001/changelog | grep -o "v[0-9.]*" | sort -u
  → 必须包含最新版本号

第6步：验证 API 可用（用项目真实 ID）
  curl -s http://localhost:3001/api/parse-settings -X POST \
    -H "Content-Type: application/json" \
    -d "{\"projectId\":\"<用户当前项目ID>\",\"rawText\":\"测试\",\"mode\":\"lorebook\",\"autoCreate\":false}"
  → 必须返回 JSON（不能是模型名错误）

第7步：打开浏览器
  start msedge http://localhost:3001/workspace/<用户当前项目ID>
  start msedge http://localhost:3001/changelog
```

### 上线检查清单（重启后自问）：
- [ ] tsc 零错误？
- [ ] HTTP 200？
- [ ] changelog 页面有最新版本？
- [ ] API 不报模型名错误？
- [ ] Edge 已打开 workspace + changelog 两个页面？

---

## 📁 架构目标参考 (`docs/architecture-reference/`)

两份索引：**整理版（A-J）** 按功能域分类，去重去矛盾，边界清晰；**原始分析（01-23）** 是逆向分析原文，做原始参考。

### 整理版 —— 按功能域分类（优先阅读）

| 文件 | 功能域 | 覆盖内容 | 来源 |
|------|--------|---------|------|
| **A-平台总览** | 架构全貌 | 三层架构、19模块、58工具、核心设计哲学 | 01+21+23 |
| **B-生成引擎** | 正文生成 | chapter_generate_content参数、SSE协议、叙事引擎 | 02+10+23 |
| **C-记忆与上下文** | 记忆系统 | 三层记忆、S/A/B分级注入、Token优化、伏笔五状态机 | 04+09+12+23 |
| **D-蒸馏与后处理** | 写后分析 | 八步后处理、命名模式库、归属推断、事件评分、数据反哺 | 03+14+22+23 |
| **E-规则与质量** | 质量控制 | 规则冲突裁决、禁用词/句式、六维质量矩阵、文风参数 | 07+11+13 |
| **F-UI交互** | 前端界面 | 全局布局、实体追踪、文风面板、规则管理、大纲编辑器 | 06+17+18+19+20 |
| **G-数据模型** | 数据结构 | Pinia/Zustand stores、数据库核心表概览 | 08 |
| **H-Agent系统** | 智能调度 | Agent行为规则、工具调度、提示词分层、对话压缩 | 15+23 |
| **I-游戏模式** | 互动写作 | 轮次制互动、四选项系统、实体追踪 | 16 |
| **J-导入与拆书** | 外部导入 | 五阶段导入流水线、章边界检测、别名消歧 | 05 |

### 原始分析 —— 按编号（底层参考）

| 编号 | 文件 | 对应功能 |
|------|------|---------|
| 01 | architecture-overview | 总体架构概览 |
| 02 | writing-modes | 写作模式（续写/润色/生成） |
| 03 | distillation-system | S/A/B/C 四级事件蒸馏 |
| 04 | token-strategy | Token 管理策略 |
| 05 | book-splitting | 分书/分卷机制 |
| 06 | ui-entity-system | 前端实体系统 |
| 07 | writing-styles-and-modes | 文风与写作模式 |
| 08 | pinia-stores | 状态管理（Pinia stores） |
| 09 | pending-commitments | 伏笔/承诺追踪 |
| 10 | sse-protocol | SSE 流式协议 |
| 11 | rules-engine-specificity | 规则冲突裁决引擎 |
| 12 | memory-injection-template | 记忆注入模板 |
| 13 | writing-quality-standards | 写作质量标准 |
| 14 | postprocessing-pipeline | 8 步后处理流水线 |
| 15 | agent-system-prompt | Agent 系统提示词 |
| 16 | game-mode | 交互式游戏模式 |
| 17 | complete-ui-inventory | 完整 UI 组件清单 |
| 18 | ui-writing-style | 文笔风格面板 UI |
| 19 | ui-rules-management | 规则管理 UI |
| 20 | ui-outline-editor | 大纲编辑器 UI |
| 21 | platform-full-architecture | 平台完整功能架构+生成引擎 |
| 22 | data-flow-distillation | 数据全生命周期+蒸馏层技术 |
| 23 | core-architecture-patterns | 核心架构模式 |

**使用规则：** 规划新功能 → 先读整理版（A-J）对应功能域文件 → 定位到具体实现 → 如需细节再看原始分析（01-23）对应编号。不改架构，只加模块。
<!-- END:novel-forge-rules -->
