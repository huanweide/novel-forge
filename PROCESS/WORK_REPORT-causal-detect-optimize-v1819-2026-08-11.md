# v1.8.19 因果链视图检测后视觉优化

## 一、干了什么

对刚发布的 v1.8.18「故事线工作台因果链第四栏」做一次完整无头检测（playwright + 无头 Chromium），根据实际截图发现的可读性问题做针对性视觉优化，升版到 v1.8.19 并推送。

## 二、为什么这么做

项目长期工作原则写得很清楚："每条 UI 优化都要有无头截图前后对比证据"。v1.8.18 发布时我诚实交代了"只跑了逻辑门禁，没跑逐页无头截图"。用户这次说"检测一次，优化"，就是把欠的那一环补上：先真实跑一遍，再根据看到的问题改。

## 三、方法、工具与过程

### 3.1 检测脚本设计

文件：`novel-forge/tmp_detect_causal.cjs`（untracked，不进入 git）。

思路：用 playwright 在浏览器里完整走一遍用户路径，而不是只看代码。

1. 访问 `http://127.0.0.1:3001/workspace/{projectId}`。
2. 预置 localStorage 关闭 onboarding / 更新公告 / 快捷键速查弹窗。
3. 点击左侧「故事」tab → 进入故事线列表 → 截图。
4. 点击主线「保守备份 vs 主动扩张」→ 进入工作台 → 截图。
5. 点击「因果链」tab → 此时主线 events=0 → 截图空状态。
6. 浏览器内临时 POST 造 3 条事件到同一条主线：
   - MILESTONE："灾变降临·龙陨之地"
   - EVENT："主角获得龙元碎片"
   - CLUE："神秘的第七个白日"
7. 刷新页面重新导航到因果链 tab → 截图节点渲染状态。
8. DOM 断言：`<ol li>` 节点数、"因 → 果" 标记数、"悬而未决的因" 区出现次数。
9. 监听 `console` 与 `pageerror`，收集所有报错。
10. 清理：脚本末尾用 `pg` 直连数据库，`DELETE FROM "StorylineEvent" WHERE tag='DETECT_TEMP_2026'`，确保不污染真实数据。

### 3.2 运行命令（可复现）

```bash
cd C:/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge
node tmp_detect_causal.cjs
```

输出示例：

```json
{
  "errors": [],
  "emptyVisible": 1,
  "s1": 201,
  "s2": 201,
  "s3": 201,
  "nodeCount": 2,
  "causalMarks": 1,
  "pendingCause": 1,
  "mainBadge": 5,
  "shotDir": ".../_detect_shots"
}
```

`cleaned events: 3` 表示临时数据已删除。

### 3.3 检测结果

- **零控制台报错**：`errors: []`。
- **空状态正确**："这条线还没有事件" 文案与"去写一章"按钮正常。
- **节点渲染正确**：2 个节点（MILESTONE + EVENT），1 个"因 → 果"连接，CLUE 正确浮在"悬而未决的因"区。
- **数据清理完整**：造 3 条、删 3 条。

### 3.4 截图发现的问题

读 `_detect_shots/04_causal_empty.png` 和 `05_causal_nodes.png` 后，发现 3 个可读性问题：

1. 头部说明文字用 `text-tertiary`，在深色背景上偏暗。
2. 时间轴竖线用 `border-2`，对比度低，链的骨架不够明显。
3. 节点间"因 → 果"标记用 `text-muted`，流向提示偏淡。

另外节点卡片没有 hover 反馈，交互感弱。

## 四、优化内容与取舍

只改 `src/components/workspace/StorylineWorkbench.tsx` 的因果链渲染区，零逻辑改动：

| 位置 | 改动前 | 改动后 | 理由 |
|------|--------|--------|------|
| 头部说明文字 | `text-tertiary` | `text-secondary` | 提升深色背景可读性 |
| 时间轴竖线 | `border-2` | `border-1` | 让因果链骨架更明显 |
| "因 → 果" 标记 | `text-muted` | `text-secondary` | 增强流向可读性 |
| 节点卡片 | 无 hover | `hover:border-border-1` + `hover:bg-surface-2` | 强化可交互反馈 |

**没做的**：没有因为截图好看就大幅重绘（比如改成亮色卡片、加阴影、改布局）。只解决检测到的真实问题，保持风格一致。

## 五、验证结果

- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`：**0 错误**。
- `npx vitest run`：**46 文件 403/403 全绿**。
- 重新跑检测脚本：截图显示说明文字、竖线、标记均比优化前更清晰；零报错；数据清理完成。
- 提交 `ffa389a` 已 push 到 `huanweide/novel-forge` main（3 文件，+46/−9）。

## 六、反自欺闸门

- **是否真跑过检测**：是。`tmp_detect_causal.cjs` 在本地运行两次，输出和截图都已验证。
- **临时数据是否真的清理**：是。脚本末尾 pg 直连删除，返回 `cleaned events: 3`。
- **优化效果是否夸大**：有提升，但不剧烈。只是 className 颜色层级调整，无法解决所有深色主题可读性问题；跨线聚合中"支线/伏笔" badge 的真实渲染没有截图验证，因为当前项目只有 1 条主线、无支线。
- **是否有未验证的视觉证据**：hover 效果是交互态，静态截图无法呈现，需要真机鼠标悬停才能确认。
