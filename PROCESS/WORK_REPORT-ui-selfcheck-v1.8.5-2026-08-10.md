# UI 自查优化闭环报告 —— v1.8.5

**执行 CEO**：马斯克人格（general-purpose-1）  
**授权人**：瑞宝宝（樊斯瑞）  
**日期**：2026-08-10  
**版本**：v1.8.5

---

## 一、干了什么

对 novel-forge 前端 UI 做了一轮完整的「自查 → 定位 → 修复 → 再验证」闭环。

1. **搭建截图证据链**：在复用系统 Chrome 的基础上，扩展 `shot2.cjs`：
   - 用 `context.addInitScript` 预置 `nf_onboarded_v1`，彻底阻止「欢迎来到小说工坊」引导弹窗遮挡页面。
   - 增加可选 `clickText` 参数，用于自动打开故事线工作台等需要二次点击的界面。
   - 移除误触兜底选择器 `button:has(svg)`，避免在 tables 等页面误点出「新建表格」弹窗。

2. **覆盖 8 个关键页面截图**：
   - `/workspace/<PID>` 默认工作区
   - `/workspace/<PID>?tab=storylines` 故事线列表
   - 故事线工作台 Modal
   - `/workspace/<PID>/tables`
   - `/settings`
   - `/workshop`
   - `/explore`
   - `/dissect`
   - `/recycle`
   - `/changelog`

3. **真实 UI 问题定位**：
   - **假阳性 1**：tables 页首次截图出现「新建结构化表格」弹窗。排查后发现是 `shot2.cjs` 的兜底关闭逻辑误点了「新建表格」按钮，修复脚本后恢复正常。
   - **假阳性 2**：changelog 全页截图为黑屏。排查后发现 DOM 完全正常，是 Playwright `fullPage` 在该页面截图异常；改用 viewport 截图后内容正常显示。
   - **真问题**：`StorylineWorkbench` 中关闭/删除图标按钮缺少 `title` 与 `aria-label`；支线进度条使用低对比的 `nv-text-tertiary`，有进度时可能看不清。

4. **修复并验证**：
   - 为故事线工作台关闭按钮、删除按钮补充 `title`/`aria-label`。
   - 支线进度条颜色改为 `nv-primary`。
   - 重新截图确认无回归，控制台无新增报错。

5. **质量门禁**：
   - `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → 0 错误。
   - `npx vitest run` → 42 文件 365/365 全绿。

6. **收口**：
   - git commit 前端改动。
   - 推送 main 到 GitHub（`e614a95..71f0bae`）。
   - 升版到 v1.8.5，同步更新 `src/lib/changelog-data.ts` 与 `CHANGELOG.md`。

---

## 二、为什么这么做

马斯克第一性原理：不假设 UI 没问题，必须亲自拿无头截图看证据。仅凭代码 review 无法发现视觉/交互/遮挡问题。本轮把截图脚本做成可复用工具，为后续每次大版本重构提供可重复的 UI 回归流程。

同时避免 cargo cult：不是为好看而大改 UI，而是只修真实问题——
- onboarding 弹窗遮挡会直接影响每次首次截图，必须先解决。
- 图标按钮缺少文本提示会损害无障碍。
- 低对比进度条是真实的可见性问题。

---

## 三、方法效果

| 检查项 | 方法 | 结果 |
| --- | --- | --- |
| 关键页面渲染 | 无头 Chrome 截图 + 多模态读图 | 8 个页面全部正常，无报错 |
| onboarding 遮挡 | `addInitScript` 预置 localStorage | 弹窗不再出现 |
| 控制台错误 | Playwright 监听 console.error/warning | 全站 0 报错 |
| 真实 UI 修复 | 改 `StorylineWorkbench.tsx` 3 处 | 截图对比无回归 |
| 代码质量 | tsc + vitest 双门禁 | 0 错 / 365 全绿 |

---

## 四、关键取舍

- **不改大布局**：故事线工作台本身视觉已经过 v1.8.4 重构，本轮仅做可访问性与对比度微调，不动骨架。
- **不处理 dev-only 元素**：`/dissect` 截图左下角出现 Next.js dev toolbar，仅在开发模式出现，不属于生产 UI 缺陷，未做代码改动。
- **保留临时脚本**：`shot.cjs`、`shot2.cjs`、`_fix_*.py`、`tmp_*.cjs` 等按项目规则保持 untracked，不进入 git。
- **截图辅助脚本不算交付物**：`shot2.cjs` 仅服务于本轮自查，未提交到 main。

---

## 五、反自欺声明

- 所有「修复」都经过热重载后重新截图确认；没有仅凭代码改动就宣称变好。
- tables 页弹窗与 changelog 黑屏都经过 DOM/控制台排查，确认是截图脚本或截图方式问题，未当作代码 bug 乱改。
- 双门禁在改动前后各跑一次，确实全绿。
- 没有为了「显得做了很多」而无意义调整样式或重命名。

---

## 六、可复现

```bash
# 1. 启动 dev server（已在 127.0.0.1:3001 运行）
# 2. 进入项目根目录
cd C:/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge

# 3. 截图关键页面（ onboarding 已自动关闭）
node shot2.cjs "http://127.0.0.1:3001/workspace/5550f26f-4237-427d-bb6d-e34b851cfe70" "shots/workspace.png" 6000 1500
node shot2.cjs "http://127.0.0.1:3001/workspace/5550f26f-4237-427d-bb6d-e34b851cfe70?tab=storylines" "shots/workspace-storylines.png" 6000 1500
node shot2.cjs "http://127.0.0.1:3001/workspace/5550f26f-4237-427d-bb6d-e34b851cfe70?tab=storylines" "shots/workspace-storylines-workbench.png" 6000 1500 "保守备份 vs 主动扩张"
node shot2.cjs "http://127.0.0.1:3001/workspace/5550f26f-4237-427d-bb6d-e34b851cfe70/tables" "shots/workspace-tables.png" 6000 1500

# 4. 质量门禁
SAFE_DELETE_DISABLE=1 npx tsc --noEmit
npx vitest run
```

---

## 七、交付清单

- [x] 8 个关键页面截图证据（位于 `novel-forge/shots/`）
- [x] 修复 `src/components/workspace/StorylineWorkbench.tsx`：3 处可访问性/对比度优化
- [x] `tsc --noEmit` 0 错误
- [x] `npx vitest run` 42 文件 365/365 全绿
- [x] git commit + push main（`71f0bae`）
- [x] 升版 v1.8.5，同步 `changelog-data.ts` 与 `CHANGELOG.md`
- [x] 本费曼报告 `PROCESS/WORK_REPORT-ui-selfcheck-v1.8.5-2026-08-10.md`
- [x] 项目记忆回写 `.workbuddy/memory/2026-08-10.md` 与 `MEMORY.md`
