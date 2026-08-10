# Chair 现场观察笔记

> 观察对象：novel-forge v1.8.9 故事线工作台
> 入口：`http://localhost:3001/workspace/577ed326-b241-4f67-9481-c9332cb03626`
> 截图：`PROCESS/meetings/round-1/chair-shot-workbench.png`
> 时间：2026-08-10

## 已确认的运行状态

- dev server HTTP 200 在线
- `shot2.cjs` 直接截 workspace 只能拿到主界面；需点击「故事线」标签 → 选故事线才能打开工作台弹窗
- 工作台弹窗打开后 **NO_CONSOLE_ERRORS**
- 左侧「故事线」已置顶常显（v1.8.9 修复生效）

## Chair 独立发现的细节问题（待 Agent 投票）

### C-01：「结局（待收束）」标签与空值占位符重复
- **严重度**：P2
- **位置**：`src/components/workspace/StorylineWorkbench.tsx:40`（ELEMENT_META label）、`:728-731`（渲染）
- **现象**：标签已叫「结局（待收束）」，空值又显示「待收束」，视觉上像标签重复。
- **建议**：空值占位符改为「未填写」或「—」，或把标签简化为「结局」。

### C-02：线索集标题硬编码项目专属示例
- **严重度**：P2
- **位置**：`src/components/workspace/StorylineWorkbench.tsx:773`
- **现象**：标题为「线索集 / 纸集（融合龙王寨、菜市场注释、尸检报告等）」，示例与当前项目耦合，作为通用组件不合适。
- **建议**：改为「线索集 / 纸集」+ 单独一行小字说明「如：龙王寨 / 尸检报告」。

### C-03：左侧列表完结标记触控区域小且易误触
- **严重度**：P2
- **位置**：`src/components/workspace/StorylineWorkbench.tsx:862-875`
- **现象**：完结标记圆圈/check 仅 12px，与选择按钮紧邻，stopPropagation 虽防止触发选择，但小目标+紧邻仍易误触。
- **建议**：图标加大到 14-16px，或增加 padding，或将完结操作移入详情区按钮组。

### C-04：七要素空值占位符「—」对新手不友好
- **严重度**：P2
- **位置**：`src/components/workspace/StorylineWorkbench.tsx:731`
- **现象**：空值统一显示「—」，未说明这是什么字段或如何填写。
- **建议**：hover/聚焦时显示提示，或在编辑入口附近引导。

### C-05：时间轴空状态缺乏行动指引
- **严重度**：P2
- **位置**：`src/components/workspace/StorylineWorkbench.tsx:760-762`
- **现象**：仅说明「暂无章节进展记录（写作时会自动回写大事件）」，未告诉用户现在能做什么。
- **建议**：增加一句「去写作章节，大事件会自动汇总到这里」。

### C-06：DialogInput 单行输入框 placeholder 颜色未统一
- **严重度**：P2
- **位置**：`src/components/workspace/DialogUI.tsx:50-58`
- **现象**：textarea 有 `placeholder:text-[var(--nv-text-tertiary)]`，input 没有，暗色模式下 placeholder 可能对比度不足。
- **建议**：input 也加上 placeholder 颜色类。

### C-07：LeftPanel 注释过时
- **严重度**：P2
- **位置**：`src/components/workspace/LeftPanel.tsx:63`
- **现象**：注释仍写「故事线 / 规则 收起」，但代码中故事线已置顶。
- **建议**：已 Chair 亲修（改为「规则收起，故事线已置顶常显」）。

### C-08：ClueRow 更新失败无错误反馈
- **严重度**：P1
- **位置**：`src/components/workspace/StorylineWorkbench.tsx:344-355`
- **现象**：handleCluePatch 调用 PATCH 后 UI 立即显示新值，若请求失败只 toast，但本地 state 已变，用户可能以为保存成功。
- **建议**：等待 PATCH 成功后再更新本地 state，或失败时回滚。

### C-09：StorylineWorkbench 错误态未用统一 ErrorState
- **严重度**：P2
- **位置**：`src/components/workspace/StorylineWorkbench.tsx:503-509`
- **现象**：加载失败用了裸 div + 重试按钮，未复用 `src/components/ui/States.tsx` 的 ErrorState。
- **建议**：替换为 `<ErrorState title="加载失败" ... action={<button>重试</button>} />`。

### C-10：AI 生成按钮禁用时无提示
- **严重度**：P2
- **位置**：`src/components/workspace/StorylineWorkbench.tsx:400`
- **现象**：`disabled={generating || !!genSuggestions}`，有 genSuggestions 时禁用但无 tooltip/提示说明原因。
- **建议**：hover 时显示 tooltip「请先采用或放弃当前生成结果」。

## Chair 备注

- 以上问题来自 Chair 独立读图+读源码，待 5 份 Agent 报告提交后进入阶段二投票。
- 已提前修复 C-07（过时注释）。
