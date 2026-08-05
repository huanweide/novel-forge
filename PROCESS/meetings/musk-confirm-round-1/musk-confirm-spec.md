# 马斯克确认流程 · 单一 UI 规格（musk-confirm-spec）

> 本文件是 Round 1 会议的**唯一权威输出**，工程实现与马斯克智能体验证均以本规格为准。异见见 `_integration.md` 第三节，不混入主规格。

---

## 一、主语与范围

- **操作者 = 马斯克智能体**（由 `elon-musk-perspective` 驱动），全程真实走通验证。
- **作用对象 = Novel Forge 章节（StoryNode）**，单用户本地工具，无多人审批链。
- **目标**：写完/生成完章节后，由马斯克智能体逐章「确认 / 打回 / 诊断 / 批量确认」，最终「项目确认完成」。

---

## 二、状态机（5 态，扩展既有 ContentStatus）

```
outline_only ──(生成正文)──▶ drafting
drafting     ──(提交确认)──▶ pending_confirm
pending_confirm ──(确认通过)──▶ confirmed
pending_confirm ──(打回重写, 填理由, 留快照)──▶ drafting
confirmed     ──(重开, 留历史)──▶ drafting
confirmed     ──(批量/整本)──▶ project_confirmed
```

- `outline_only`：仅有大纲（已有）。
- `drafting`：已生成/已手写正文，未提交确认（**替代原 `completed` 的"已生成"语义**）。
- `pending_confirm`：待马斯克确认。
- `confirmed`：定稿，**此后才触达下游**（导出/时间线/自动填表）。
- `project_confirmed`：整本交付完成（所有章节 confirmed 且马斯克点「项目确认完成」）。

**实现**：`src/core/types/index.ts` 的 `ContentStatus` 由 `outline_only | drafting | completed` 扩展为 `outline_only | drafting | pending_confirm | confirmed`（保留 `completed` 向后兼容或迁移为 `drafting`）；schema `StoryNode.status` 为 String，无需新枚举，仅加注释。

---

## 三、按钮清单（4 键，常驻）

中栏 PostGenPanel 底部常驻确认栏，4 个汉字按钮（零基础友好，费曼校验）：

| 按钮 | 触发动作 | 状态变更 | 约束 |
|---|---|---|---|
| **提交确认** | 当前章 `drafting → pending_confirm` | 写 `reviewLogs` 留痕 | 草稿可继续往下写，提交非终态 |
| **打回重写** | `pending_confirm → drafting` | 须填理由（空着拦截），`revisionCount+1`，保留 `StoryNodeRevision` 快照 | 不打覆盖，留可对比历史 |
| **AI诊断** | 打开诊断（不改动状态） | 复用 PostGenPanel 五 Tab / `analyze-chapter` | 可选动作，非前置税 |
| **确认通过** | `pending_confirm → confirmed` | 写 `reviewLogs`；**触发 `safeFillAfterWriting`** | 仅 `pending_confirm` 态可点 |

**批量键**（项目级，非每章）：
- **批量确认本卷**：左栏卷节点多选 → 批量 `pending_confirm → confirmed`（仅对无 error / qualityScore 达阈值的章放行，否则拦截并提示）。
- **项目确认完成**：右栏确认看板在「待确认归零」后浮出，点 `confirmed(全部) → project_confirmed`。

---

## 四、布局（三处，反对弹窗）

1. **确认条**：PostGenPanel 底部 sticky footer，4 按钮常驻，主按钮（`确认通过`）`--nv-primary`、大、圆角、始终可点（乔布斯：诊断是选项不是前置税）。
2. **左栏状态徽标**：每个章节节点显示色点——灰(`drafting`) / 橙(`pending_confirm`) / 绿(`confirmed`)，全书"确认健康度"一眼可见。
3. **右栏确认看板**（监测 tab 新增子组件）：待确认数 / 已确认数 / 未诊断数 / 低质量拦截数 / 项目确认进度条。

---

## 五、最高杠杆修复（先于 UI，堵记忆污染根因）

`src/app/api/generate/write/route.ts:304` 的 `safeFillAfterWriting` 调用，**从「生成后」移到「章节 `confirmed` 后」触发**：
- 新增确认路由（PATCH `story/nodes/[id]` 带 `action: confirm`）在置 `confirmed` 后调用 `safeFillAfterWriting`。
- 生成时仅落 `drafting`，不污染下游记忆表。
- 这是七份报告 + 三观测共同指向的唯一真 bug。

---

## 六、端到端计划流程（马斯克智能体走通顺序）

```
1. 建项目（/api/projects）
2. 写章：/api/generate/write → 落 drafting（不填表）
3. 对每章：AI诊断（可选）→ 提交确认 → 确认通过（→ confirmed，触发填表）
   或：打回重写（留快照）→ 重新生成 → 再确认
4. 批量确认本卷（护栏拦截低分章）
5. 全部 confirmed 后 → 项目确认完成（project_confirmed）
6. 输出《验证报告》：按钮可用性 / 状态流转 / 无死锁 / 内容连贯
```

---

## 七、约束与护栏

- 版本快照撑库风险：StoryNodeRevision 设上限 + 清理策略（张雪峰预警）。
- 状态一致性：`editVersion` 乐观锁防并发脏写（工坊预警）。
- 确认疲劳防呆：草稿可继续写，确认是"定稿"非"每步审批"（费曼预警）。
- 单用户无鉴权：禁止引入多人审批链（张雪峰/费曼预警）。

---

*规格版本 v1（Round 1 产出）。待 Round 2 验"是否真不啰嗦"与游戏模式轻确认边界。*
