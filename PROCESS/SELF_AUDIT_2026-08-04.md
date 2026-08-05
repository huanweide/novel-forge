# Novel Forge 项目自查报告 · 2026-08-04

> 应用户要求：自查项目、核对"我提过的问题"、给出想法、按计划修复。

---

## 一、健康自查（全绿）

| 检查项 | 结果 |
|---|---|
| TypeScript 类型检查（tsc --noEmit） | ✅ 0 错误 |
| 单元测试（vitest run） | ✅ 190/190 通过（12 文件） |
| API /api/health | ✅ 200（version=v0.46.86, db=ok, llm=ok） |
| API /api/projects | ✅ 200（返回项目列表） |
| API /api/settings | ✅ 200（deepseek-v4-flash, hasKey=true） |
| 生产构建（npm run build） | ✅ 通过，全部路由构建成功 |
| DB（PostgreSQL 17） | ✅ 正常 |
| LLM（deepseek-v4-flash） | ✅ 正常 |

**结论：本地项目完全健康，无回归、无隐藏错误。**

---

## 二、你提过的问题清单及现状

| # | 问题 | 现状 | 落地版本 |
|---|---|---|---|
| 1 | 部署站不可用 | ⚠️ **未解决（用户侧 Vercel）** | P0 |
| 2 | 首页项目卡片看不见 | ✅ 已修（入场动画改确定性显示） | v0.46.44 / v0.46.54 |
| 3 | 船太黑看不清 | ✅ 已修 | v0.46.53 |
| 4 | UI 风格按钮无法交互 | ✅ 已修 | v0.46.53 |
| 5 | 船不够真实多样 | ✅ 已修（BoatFactory 6 船型 + ≤8 真灯 + 部件工厂） | 纸舟星海 maxloop |
| 6 | 废弃花里胡哨的装饰 | ✅ 已修（彻底删 orphan CSS） | v0.46.48 |
| 7 | 7 项 UI 反馈（语法高亮仅颜色/章纲默认折叠/游戏粒子高亮回归/进度条/构思开头前置/自动推进开关/去词条统计） | ✅ 全部已修 | v0.46.78 |
| 8 | P3 删 UI 噪声（顶栏收敛/右栏监测折叠/左栏精简/后处理高级折叠） | ✅ 已修（**待你本地目测**） | v0.46.86 |

**除部署站外，你提过的问题代码层全部修复，且 tsc/vitest/build 三重验证无回归。**

---

## 三、部署站诊断 + 修复方案（需你在 Vercel 侧操作）

**现状**（novel-forge-nu.vercel.app）：
- `/api/health` → **404**（部署构建过旧，Vercel 未重新部署最新代码）
- `/api/projects` → **500**（Neon DB 免费额度耗尽）
- `/`、`/changelog` → 200（静态页能渲染）

**代码侧已就绪**：
- `npm run build` 通过
- `postinstall: prisma generate` 会自动生成 Prisma client
- 最新代码已 push 到 huanweide/novel-forge main（HEAD=80c2470）

**修复操作清单**（需你操作 Vercel 控制台）：
1. **确认 Vercel 项目连接的仓库** = `huanweide/novel-forge`（若还连着旧的 `xiaoxiao3315/novelforge`，需改连新仓库）
2. **配置环境变量**：`DATABASE_URL`（指向可用 PG）+ `LLM_API_KEY` + `LLM_MODEL` + `LLM_BASE_URL`
3. **DB 修复**（三选一）：升级 Neon 付费档 / 迁移到 Vercel Postgres / 指向你自有的公网 PG
4. **触发重新部署**：push 一次或 Vercel 后台点 Redeploy
5. **验收**：部署站 `/api/health` 返回 200 + `/api/projects` 返回 200

---

## 四、改造计划表（v3）完成度

| Phase | 内容 | 状态 |
|---|---|---|
| P1 | 填表设定中枢（宝宝流闭环） | ✅ 端到端验证通过 |
| P2 | 预设中心（Preset 模型+API） | ✅ CRUD + fork + apply + import + 15 内置预设 |
| P3 | 生成工作流（续写/大纲/角色/润色） | ✅ continue/write/outline/refine 齐全 |
| P4 | 创意工坊（浏览/发布/Fork/应用） | ✅ workshop 页 + fork/apply API + 内置示范预设 |
| P5 | 体验打磨（引导/空状态/导出/changelog） | ✅ OnboardingModal + States 空状态 + 示例项目 seed + export |
| P0 | 部署站救活 | ⚠️ 用户侧 Vercel 待操作 |

---

## 五、唯一代码侧待办

- **P3 删 UI 噪声待你本地 `npm run dev`（端口 3001）目测**：下拉菜单、折叠区块的真实交互（遮罩关闭、z-index 层叠、overflow 裁切）沙箱无 Chromium 未浏览器验证。目测清单已给：`PROCESS/P3_E2E_CHECKLIST.md`。

---

## 六、下一步可推进方向（智能体团队优化计划书剩余项）

- **P1 收敛诊断环**：把现有 6 人格只读诊断 → 派 Agent 并行实现 → tsc 门禁的流程，固化为项目内可一键触发的常驻诊断能力。
- **P2 自愈合叙事图谱**：自动检测叙事断点/孤儿节点并建议补全（语义误报风险，需先定检测策略）。

> 这两项此前未拍板，需你给方向。代码侧当前无阻塞性待修问题。
