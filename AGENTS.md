<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:novel-forge-rules -->
# Novel Forge 项目规则 — 每次会话必定加载

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

项目根目录下的 `docs/architecture-reference/` 包含 20 份 aixiaoshuojia.cn 逆向分析文档（01~20），是本项目的架构设计目标参考。**每次规划新功能前必须先查阅对应文档，理解目标平台的实现方式后再动手。**

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
| 21 | platform-full-architecture | 平台完整功能架构+生成引擎（三层输入→五步处理→单格式输出） |
| 22 | data-flow-distillation | 数据全生命周期——每类数据如何读→注入→生成→蒸馏反哺（含蒸馏层不调API的技术详解） |
| 23 | core-architecture-patterns | 核心架构模式——记忆系统三层/章节五阶段/时间线过滤/工具调度/蒸馏引擎/提示词分层 |

**使用规则：** 开发对应功能时，先读分析文档理解目标架构，再结合本项目现有代码做增量改造。不改架构，只加模块。
<!-- END:novel-forge-rules -->
