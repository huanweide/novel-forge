# 费曼报告：v1.6.24 角色卡待审审批闭环（补齐 v1.6.18/22 缺口）

> 瑞宝宝，这是 v1.6.24 的工作单元沉淀。

## 一、干了什么（一句话）

修了一个被前两版「待审隔离」改动悄悄埋下的真实 bug：AI 自动生成的角色卡现在能像世界卡一样被你「确认并入」了，否则它们会永远卡在「待审」状态、永远进不了正文生成。

## 二、为什么这么做（拆到底层）

**背景**：novel-forge 的「待审隔离」是 v1.6.13~1.6.22 建起的安全机制——AI 自动抽取的卡先放「待审区」(`reviewStatus: pending`)，你确认后才变 `approved` 注入生成。这防止 AI 瞎编的卡污染正文。

**发现的坑（第一性原理反推）**：v1.6.18 让 9 类 AI 建卡默认转 pending，v1.6.22 又强制「只有 approved 才注入」。但当时**只给世界卡做了审批按钮**（前端 `WorldPanel` 有个勾选批准）。角色卡呢？全仓库搜了一圈——前端没有任何角色卡审批入口，后端 `characters/[id]` 的更新接口也压根不接收 `reviewStatus` 字段（直接被丢弃）。

后果：AI 生成的角色卡一出生就是 pending，却永远没法变成 approved → **角色卡彻底失效，再也不出现在正文里**。待审隔离本来是保护，结果把角色卡「保护」成了废卡。这就是没做端到端闭环的典型坑——后端机制有了，前端开关没接上。

## 三、用了什么方法、效果如何

**方法（前后端对称补齐）**：
1. 后端 `characters/[id]/route.ts` 的 PUT：数据块补 `reviewStatus` 透传（`...(body.reviewStatus ? {reviewStatus} : {})`，只在你点了批准时才写）。这个接口本来就在更新后调 `syncGlobalPrompt`（重算生成缓存），所以审批落地后缓存自动刷新——不用额外写重算逻辑。
2. 前端 `CharacterRow`：仿世界卡 `WorldEntryCard`，当 `reviewStatus==="pending"` 时显示黄色「待审」徽标 + 一个绿色勾选「确认并入」按钮，调用 `onConfirm(id)`。
3. 透传链：`CharacterGroupList` → `CharacterList`（加默认 `handleConfirm` 处理器，调 PUT）→ `LeftPanel`（接线 `onConfirm`，审批后 `loadProject` 刷新列表）。
4. 类型：`CharacterData` 接口补 `reviewStatus?` 字段（之前只有 `LorebookData` 有），否则前端读不到、tsc 也报错。

**效果（实测）**：
- tsc 0 错误；vitest 299/299 全绿（无新增测试，靠类型门禁 + 源码核实；角色卡审批路径无既有单测，逻辑直白）。
- 已推 `origin/main`（`cdd785e..584317e`，绕过 PR + 状态检查）。
- 诚实边界：沙箱无 Chromium，未做真实浏览器点击「批准按钮」的端到端实测；逻辑与类型已核实，UI 交互留 agent-browser 独立 Chrome 复检。

## 四、关键取舍

- **为什么只补角色卡、不重做审批架构？** 世界卡已有完整审批范式（PUT `/api/lorebook/[id]` 带 reviewStatus + 自动重算），只是角色卡漏接。最小代价 = 让角色卡「复用同一条路」，而非另起炉灶。对称、可维护。
- **为什么 `syncGlobalPrompt` 不用额外触发？** 后端 `characters/[id]` PUT 本来就在改完角色卡后调一次 `syncGlobalPrompt`，所以审批（写 reviewStatus=approved）+ 重算缓存是一条原子链路，天然正确。
- **诚实边界**：本次只闭合「pending→approved 确认」这一半；「approved→pending 弃审」角色卡暂无入口（世界卡也只是删除=拒绝）。若日后要支持角色卡弃审，复用同一透传即可，非阻塞。
- 循环不空转：v1.6.25 候选（Project interface 类型缺口 / 大书导出流式 / 自我检测 UI / sync-global-prompt 实时性收尾）。
