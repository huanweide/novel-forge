# novel-forge 长期事实（持续更新）

## 项目基线
- 项目根：`C:/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge`
- 技术栈：Next.js 16 + React 19 + Tailwind v4 + Prisma 7 + PostgreSQL 17
- 本地 dev server：`http://127.0.0.1:3001`
- 系统 Chrome：`C:/Program Files/Google/Chrome/Application/chrome.exe`
- 星辰项目 PID：`5550f26f-4237-427d-bb6d-e34b851cfe70`

## 质量门禁
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 必须 0 错误。
- `npx vitest run` 必须全绿（当前基线 93 文件 879 测试，v2.40.0）。
- 每次改 schema.prisma 后必须杀 dev server 重启，否则 stale Prisma client 会 503。

## 已知环境限制
- Playwright `fullPage:true` 在 `/changelog` 截图会黑屏；改用 viewport 截图。
- 无头截图需预置 localStorage 关闭弹窗：onboarding(`nf_onboarded_v1`)、更新公告(`novel-forge-last-version` 设当前 LATEST_VERSION)、快捷键速查(`nf-shortcuts-seen`)。shot2.cjs 已动态读取版本号注入。
- `/dissect` 等 dev 模式页面显示 Next.js dev toolbar 属开发环境现象，非生产缺陷。
- PostgreSQL 表名大小写敏感：实际表名 `"Storyline"`/`"StorylineEvent"`/`"StoryNode"`；列名 camelCase 需引号 `"projectId"`/`"storylineId"`/`"sourceRefs"`；`deletedAt`→`"deleted_at"`。星辰数据 `StoryNode.type` 全为 `"section"`（无 `"chapter"`）。
- 生成 Prisma client 在 `src/generated/prisma`（仅 TS），独立脚本改用 `pg` 驱动 + Node fetch 做集成核验。

## 近期关键交付
- v1.8.16 游戏模式三模式视觉 + 物品跟踪 + 故事线逻辑修复。
- v1.8.17 上下文窗口重新摘要 + 摘要确认。
- v1.8.18→v1.8.21 因果链视图：四栏升级、叙事角色(advance/probe/vote)、无头检测优化、帮助文案修正。
- v1.8.22 恢复游戏模式前端入口。
- v1.8.23 摘要大纲：长期记忆融入世界卡与上下文（timelineDigest/storylineDigest）。
- v1.8.24 叙事阶段：narrative role 注入写作上下文（WORK_REPORT-narrative-stage-v1824）。
- v1.8.25 自动情节化：抽取关键事件一键归纳进故事线（Task #265，零 schema 变更）。双门禁 0 错/437 全绿；真实 星辰 库集成核验通过。已知未做：live 生成会话端到端点击未走通（服务端 LLM 调用 Playwright 拦不到，核心落库已被真实库集成测试覆盖，留上线人工点验）。
- v2.0.0 长征收口：质量总分聚合条、前台批量统一后台异步、角色对话会话落库、安全规则库用户可配、记忆单源、文风两入口互标、叙事阶段被动展示（commit 6004fe8）。
- v2.0.1 摘要大纲根治：digest-aggregate 纯函数去重+垃圾过滤+标题归一；入口 isGarbageSummary 守卫拒收脏数据；清理 新城/星辰 脏行（commit 49635e0）。
- v2.0.2 游戏模式 SSE 流式 + 写作节奏后台收尾修复 + 摘要入口整合 + 正文内联编辑（commit 6602e26）。
- v2.0.3 批量写作进度UX/章纲延续自查、角色去重改 LLM 驱动+默认开启、删自动分类死代码改自建标签、移除死板自动发现改 LLM 发现源头防脏卡、摘要大纲直连章纲（commit 5bf0d6b）。

## 工作原则
- IP 永远归瑞宝宝；不另立 IP/品牌/项目。
- 临时脚本（`_fix_*.py`、`tmp_*.cjs`、截图辅助脚本）保持 untracked，不进 git。
- 每条 UI 优化都要有无头截图前后对比证据；双门禁全绿才允许升版/推送。
- v1.9 路线图（已全部落地，2026-08-11 v1.9.0 收官）：#1 因果链（v1.8.18-21）、#2 自动情节化（v1.8.25）、#3 角色对话/附身、#4 文风定制 Tab、#5 内容安全审核（含 character-chat/possess 双模式、文风定制、内容安全审核 Tab）；叙事角色 advance/probe/vote 三态（推进点/卡点/分支选择点）已完整接进 StorylineWorkbench 因果链视图（三态按钮组+筛选+统计+左侧色条）。后续进入"打磨期"，候选方向见 ROADMAP 阶段四/五/六基础设施与锦上添花项（导出增强 EPUB/Word、统计仪表盘、TTS 朗读、关系图可视化、快捷键等），或按 max loop 亲验发现的新痛点推进。
