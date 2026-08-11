# 工作单元报告：恢复游戏模式前端入口（v1.8.22）

## 一、干了什么

把 v1.8.16 做好的「游戏模式」重新暴露给普通用户。

具体来说：
- 在写作页 CenterPanel 的生成控制区加了一个「游戏模式」按钮（游戏手柄图标）。
- 点击后调用页面上已有的 `onOpenGame` 回调，跳转到 `/workspace/[projectId]/game/[selectedNode.id]`。
- 用 Playwright 跑无头检测：选中章节 → 点按钮 → URL 跳转正确 → 页面出现「游戏模式 · 跑团式互动创作」说明卡和「开始冒险」按钮。
- 双门禁全绿后升版到 v1.8.22 并推送到 `huanweide/novel-forge` main。

## 二、为什么这么做

瑞宝宝发现「游戏模式」入口不见了。排查后发现：

- 后端 7 个 `/api/game/*` 路由、游戏引擎 `game-engine.ts`、三模式视觉组件（`GameCanvas` / `GameParticles` / `PointerGlow`）全都在，页面 URL 直访也能正常工作。
- 问题出在 Round-16 董事会决议里，把大纲树 🎮 按钮、CenterPanel 互动游戏按钮、新手引导三处入口主动移除了，只留了底层代码。
- 结果用户不知道这个 URL，功能等于不存在。

恢复入口是最小改动：不需要重写游戏逻辑，只需要把已经接好的线重新连到 UI 上。

## 三、方法、工具与效果

### 改动点
- `src/components/workspace/CenterPanel.tsx`：在「生成/重写」「微调」「批量写作」同一行追加「游戏模式」按钮，使用 `Icon name="gamepad"`，调用 `onOpenGame`。
- `src/lib/changelog-data.ts` 与 `CHANGELOG.md`：同步升版到 v1.8.22。

### 验证
- **类型门禁**：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → 0 错误。
- **测试门禁**：`npx vitest run` → 46 文件 408/408 全绿。
- **无头检测**：脚本 `tmp_detect_game_mode.cjs` 在 `http://127.0.0.1:3001` 跑通，零 `console.error` / `pageerror`。

### 效果
- 普通用户在写作页一眼就能看到「游戏模式」入口。
- 跳转后的游戏模式页面完整呈现（三模式视觉、背包、物品系统均未改动）。

## 四、关键取舍

1. **只在 CenterPanel 加按钮，没恢复大纲树 🎮 按钮**
   - 原因：CenterPanel 是用户选中章节后的主操作区，与「生成/重写」「批量写作」并列最自然；大纲树里再加一个图标会显得拥挤，Round-16 移除它也有界面降噪的考虑。
2. **不改游戏模式任何内部逻辑**
   - 原因：功能本身没坏，只是入口丢了。最小改动能降低回归风险。
3. **用无头检测验证，而不仅是截图**
   - 原因：要确认按钮真的可点击、URL 真的跳转、页面真的渲染，而不是静态摆着好看。

## 五、可复现步骤

1. 启动干净 dev server（因为旧 `.next/dev` 可能被锁，建议独立 distDir）：
   ```bash
   cd C:/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge
   npx next dev -p 3001
   ```
2. 跑无头检测：
   ```bash
   node tmp_detect_game_mode.cjs
   ```
3. 检查截图 `_detect_shots/09_game_mode_page.png`，应出现「游戏模式 · 跑团式互动创作」说明卡。

## 六、遗留关联

- v1.8.11 目标态里提到的「推进/试探墙」和「投票」仍没做，属于 v1.9 设计规格，本轮未涉及。
