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
<!-- END:novel-forge-rules -->
