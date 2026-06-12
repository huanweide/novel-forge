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
<!-- END:novel-forge-rules -->
