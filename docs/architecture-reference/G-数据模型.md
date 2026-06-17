# G — 数据模型

> 整合自：08-pinia-stores
> 边界：只管前端状态管理和数据库核心表概览。详细的表字段定义见各功能域文档（C→记忆表、D→蒸馏表等）。
> 最后更新：2026-06-17

---

## 1. 前端状态管理（Pinia → Zustand）

> 目标平台用 Pinia（Vue 3），本项目用 Zustand（React）。

| Store | 职责 | 核心状态 |
|-------|------|---------|
| editorStore | 编辑器状态 | 当前正文、光标位置、草稿状态、保存状态 |
| projectStore | 项目元信息 | 项目 ID、名称、当前章节 ID、大纲节点 ID |
| aiStore | AI 生成状态 | SSE 连接状态、生成进度、流式 Token 缓存 |
| entityStore | 实体追踪 | 当前正文中检测到的角色/物品/地点/伏笔列表 |
| outlineStore | 大纲树 | 完整大纲树结构、选中节点、展开/折叠状态 |
| timelineStore | 时间线 | 事件列表、按章节筛选、时间顺序 |
| plotStore | 情节脉络 | 主线进度、支线列表、进度百分比 |
| worldviewStore | 世界观设定 | 各项设定字段、分类筛选 |
| uiStore | UI 状态 | 侧栏展开/折叠、面板 Tab 切换、主题、通知 |

### Store 间协作关系

```
aiStore（生成完成）
  → entityStore（更新实体列表）
  → editorStore（更新正文内容）
  → timelineStore（更新事件线）
  → outlineStore（更新章节完成状态）

outlineStore（切换章节）
  → editorStore（加载对应正文）
  → projectStore（更新当前章节 ID）
```

---

## 2. 数据库核心表概览

> 详细字段定义分散在各功能域文档中：C→记忆表、D→蒸馏输出表、B→章节表

### 内容层
- `projects` — 项目元信息
- `chapters` — 章节正文（关联 outline_nodes）
- `outline_nodes` — 大纲树（volume + chapter，parent_id 层级）

### 设定层
- `characters` + `character_archives` — 角色 + 状态档案
- `character_relationships` — 人物关系图
- `foreshadows` / `pending_commitments` — 伏笔 / 承诺追踪
- `worldview` — 世界观设定
- `geo_map` — 地理地图（parent_id 层级）
- `factions` — 势力阵营
- `items` — 物品
- `power_system` — 力量体系
- `skills` — 功法体系
- `special_settings` — 特殊设定/金手指

### 记忆层
- `chapter_summaries` — 章节摘要
- `story_recaps` — 分层故事回顾
- `pending_items` — 待兑现事项
- `writing_memos` — 写作备忘录

### 时间层
- `timeline` — 全局时间线
- `events` — 事件（关联 chapters + characters）
- `character_events` — 角色事件线

### 规则层
- `rules` — 写作规则
- `writing_habits` — 写作习惯统计

### 系统层
- `sessions` — 会话管理
- `conversation_context` — 对话上下文
- `style_cards` — 风格卡
- `app_settings` — 全局设置（LLM Key/Model/BaseURL）

---

## 3. 与 novel-forge-ours 对照

| 内容 | 实现状态 |
|------|---------|
| 前端状态管理 | ✅ Zustand stores（src/store/） |
| 角色 + 档案 | ✅ CharacterCard + 档案字段 |
| 伏笔追踪 | ✅ PendingCommitment |
| 地理层级 | ❌ 无独立 geo_map 表（混在世界书中） |
| 规则冲突检测 | ✅ Rule 模型有 priority/specificity |
| 写作习惯统计 | ❌ 无 |
| 对话上下文 | ❌ 无 session 管理 |
