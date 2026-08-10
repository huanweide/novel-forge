# 工作单元报告：v1.8.9 马斯克检验后细节收口

## 一、干了什么

按瑞宝宝「马斯克想法继续推进」的指令，本次不是再派 Agent 代查，而是**主 Agent 亲自跑无头截图、亲自读图观察细节**，把 v1.8.8 代码统一后的真实 UI/UX 摩擦一一收口，最终升版 **v1.8.9（马斯克检验后版本）**。

具体改动：
- **shot2.cjs**：动态读取 `src/lib/changelog-data.ts` 的 `LATEST_VERSION`，在浏览器上下文预置 `nf_onboarded_v1` / `novel-forge-last-version` / `nf-shortcuts-seen` 三个 localStorage 标记，让截图工具默认关闭 onboarding、更新公告、快捷键速查三类自动弹窗。
- **ShortcutProvider.tsx**：移除「首次进入工作台自动弹出快捷键速查」的 useEffect；`openHelp()` 与设置页入口仍保留，用户可主动查看。
- **LeftPanel.tsx**：把「故事线」从「更多」收起菜单移出，与「大纲 / 角色 / 世界」并列在工作台左栏顶部，核心创作路径直接可见。
- **changelog-data.ts + CHANGELOG.md**：v1.8.8 日期从 `2026-08-09` 修正为 `2026-08-10`；插入 v1.8.9 头条。

## 二、为什么这么做

v1.8.8 完成了代码层面的双路径统一，但**代码对了不等于体验对了**。马斯克检验的核心是「第一性原理去掉摩擦」：
- 首屏被自动弹窗覆盖，用户第一眼看不到核心界面，这是不必要的摩擦。
- 故事线是刚重点改造的核心功能，入口却藏在「更多」里，发现成本高。
- 截图验收工具本身不稳定（会被弹窗干扰），导致每次回归都要人工处理，也是摩擦。

所以这一轮不新增大功能，只做「让正确代码以正确面貌呈现给用户」的细节收口。

## 三、方法、工具与效果

1. **亲自截图观察**：用 Playwright + 系统 Chrome 跑 13 个页面/交互态（home、changelog、explore、recycle、settings、workshop、dissect、workspace、大纲生成弹窗、角色面板、世界面板、故事线列表、故事线工作台），viewport 截图避免 changelog fullPage 黑屏。
2. **读图找摩擦**：第一次截图发现首页被更新公告覆盖、workspace 被快捷键速查覆盖；DOM 检查排除「故事线列表同时显示空状态」的读图误判。
3. **定位并修复**：Grep 找到弹窗触发代码与左栏 tab 定义，四文件小改后重截验证。
4. **双门禁闭合**：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 0 错；`npx vitest run` 43 文件 368/368 全绿。

效果：v2 截图中 workspace 左栏顶部直接可见「故事线 (1)」标签，首页与工作台均无自动弹窗。

## 四、关键取舍

- **自动弹窗 vs 主动入口**：没有直接删除快捷键帮助功能，只移除自动触发；设置页「键盘快捷键」板块和 `openHelp()` 仍保留，避免用户找不到帮助。
- **故事线可见 vs 左栏拥挤**：w-64 的左栏从 3 个常显 tab 变成 4 个 + 更多，中文标签仍紧凑；若未来 tab 继续增加，可考虑自适应折叠，但目前 4 个核心创作 tab 直接可见收益大于成本。
- **不改 LLM 管线**：v1.8.8 的双路径代码逻辑已经验证，本轮只修 UI/UX 与工具链，不碰生成逻辑。

## 五、可复现步骤

```bash
cd C:/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge

# 1. 跑全站 viewport 截图（自动关弹窗）
node _shots_v189.cjs

# 2. 双门禁
SAFE_DELETE_DISABLE=1 npx tsc --noEmit
npx vitest run
```

## 六、反自欺声明

- 13 张截图均由主 Agent 亲自跑、亲自读图；其中 12 张 `NO_CONSOLE_ERRORS`，home 页仅有 THREE.js WebGL 性能 warning（第三方 3D 背景库，非前端 bug）。
- v1.8.9 升版与双门禁均在本对话内由主 Agent 亲跑验证。
- 「故事线列表同时显示空状态」为第一次读图误判，经 DOM 检查与重截后排除。
