# C — 记忆与上下文

> 整合自：04-token-strategy + 09-pending-commitments + 12-memory-injection-template + 23-core-architecture-patterns（记忆部分）
> 边界：只管记忆如何存储、如何注入、Token如何优化。不涉及蒸馏实现（→D）、不涉及生成流程（→B）。
> 最后更新：2026-06-17

---

## 1. 记忆三层架构

```
第1层：工作记忆（Working Memory）
  存储：session 表 + conversation_context 表
  内容：当前对话上下文 + 最新工具调用结果
  生命周期：当前对话结束即消失
  容量：~8000 token

第2层：短期记忆（Short-term Memory）
  存储：chapter_summaries + writing_habits
  内容：最近 3-5 章摘要 + 最近 10 章事件线 + 写作习惯统计
  生命周期：跨对话保持，新章节覆盖旧数据

第3层：长期记忆（Long-term Memory）
  存储：characters / foreshadows / worldview / timeline / items / factions ...
  内容：所有角色完整档案 + 完整伏笔链 + 完整世界观
  生命周期：永久保存，无容量上限
```

**读取规则（写第 N 章时）：** 只加载第 1 章到第 N-1 章之间的状态。第 N+1 章及以后的状态不可见。这是时间线感知过滤器的核心。

---

## 2. 记忆注入模板（S/A/B 三级分层）

每次写正文时，记忆按重要性分三级注入 Prompt：

| 层级 | 内容 | 数量上限 | 选择逻辑 |
|------|------|---------|---------|
| S 级 | 当前章大纲直接关联的事件和伏笔 | 最多 5 条 | 语义相似度匹配当前大纲 |
| A 级 | 最近 3-5 章的关键事件 | 最多 10 条 | 按重要性 + 时效性排序 |
| B 级 | 世界观、势力、地点等背景数据 | 最多 20 条 | 按触发词相关性筛选 |

**注入格式（实际拼入 Prompt 的结构）：**

```
【待兑现事项（S 级——必须在本章处理）】
1. [高优先级] 第3章埋设的"玉佩身世"伏笔——本章需要揭示或明显推进
2. [中优先级] 神秘老者的身份——可以再铺垫，不用完全揭示

【主角状态档案】
李尘：筑基中期 → 当前位置：苍云城 → 核心目标：寻找破境丹材料
持有物品：青锋剑、神秘铁片、聚气玉佩
关系网络：苏月瑶（好感85）、赵长老（信任90）

【分层故事回顾】
超短版（50字）：李尘在宗门大比中崭露头角，获得秘境资格
短版（150字）：获得神秘铁片，玉佩开始发光，赵长老神色异常
中版（500字）：从第1章到当前章节的完整事件链
长版（全量）：所有已发生事件的详细记录
```

---

## 3. Token 优化五策略

| 策略 | 方法 | 节省比例 |
|------|------|---------|
| JSON 结构化 | 数据以结构化 JSON 注入，而非自然语言叙述 | ~40% |
| 选择性字段注入 | 只注入本章涉及的字段（角色只注姓名+修为，不注完整背景） | ~30% |
| 增量注入 | 前文已有信息不重复注入 | ~20% |
| 引用压缩 | 事件用 ID 引用而非全文重复 | ~15% |
| 分层优先级截断 | S 级全量 → A 级摘要 → B 级关键词，低优先级被截断时丢弃 | ~50% |

**综合效果：100 章小说，Token 总消耗降低约 68%。**

---

## 4. 伏笔追踪——五状态机

```
pending → detected → partially_fulfilled → fulfilled
                    → voided（超时或不可能完成）
                                            → expired
```

### 三层闭环检测流水线

```
第1层：实体匹配
  正文中出现伏笔关联的角色名/物品名/地点名 → 标记为"可能涉及"

第2层：行为匹配
  正文中出现伏笔描述的行为模式 → 标记为"正在推进"

第3层：条件检查
  检查 closureConditions（预定义的回收条件）是否全部满足
  全部满足 → fulfilled
  部分满足 → partially_fulfilled
  超时 → expired
  不可能完成 → voided
```

### 数据库字段

```
PendingCommitment {
  id, projectId, description, status (五状态),
  createdChapterId, detectedChapterId, fulfilledChapterId, voidedChapterId,
  closureConditions: Json,      // 回收条件列表
  statusHistory: Json,          // 完整审计轨迹
  entityId, entityType,         // 关联的实体
  fulfillmentRatio              // 完成比例 0-100
}
```

### 超时策略

- 短期伏笔（importance=一般）：10 章内未回收 → expired
- 中期伏笔（importance=重要）：20 章内未回收 → 提醒用户
- 长期伏笔（importance=核心）：50 章内未回收 → 提醒用户，永不过期

---

## 5. 对话历史压缩策略

### 三层压缩

| 层 | 触发条件 | 方法 |
|----|---------|------|
| 自然淘汰 | 对话超过 8000 token | 早期对话被上下文窗口自然挤出 |
| 主动压缩 | 对话超过 6000 token | 调用 summarize 把早期对话压缩为摘要（200-300 token） |
| 极端压缩 | 对话极长 | 只保留最近 3 轮完整对话 + 之前全部内容的摘要 |

### 摘要规则

```
✅ 好的摘要："用户查询了当前章节正文、角色列表和伏笔信息。我分析了出场角色和伏笔回收情况。"
❌ 坏的摘要："用户查询了正文（3000字）、角色列表（50个角色，包括李尘、苏月瑶...）、伏笔列表（15条）..."
```

摘要只记录**发生了什么事**，不记录**具体数据**。因为具体数据已经过时，需要重新查。

---

## 6. 数据库表结构（记忆相关）

```sql
-- 当前会话
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project_id INTEGER NOT NULL,
  current_chapter_id INTEGER,
  current_outline_node_id INTEGER
);

-- 对话上下文
CREATE TABLE conversation_context (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  user_message TEXT,
  agent_action TEXT,
  agent_response TEXT,
  relevant_entities JSON
);

-- 章节摘要
CREATE TABLE chapter_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL,
  summary TEXT NOT NULL,            -- 300字以内
  key_events JSON,                  -- 关键事件列表
  characters_involved JSON,         -- 出场角色 ID
  items_mentioned JSON,             -- 提及物品 ID
  foreshadows_touched JSON          -- 涉及伏笔 ID
);

-- 主角状态档案
CREATE TABLE character_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL UNIQUE,
  current_realm TEXT,
  current_location TEXT,
  current_goal TEXT,
  inventory JSON,
  relationships JSON,
  arc_progress JSON,
  last_updated_chapter INTEGER
);

-- 分层故事回顾
CREATE TABLE story_recaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  recap_level TEXT NOT NULL,         -- 'ultra_short'/'short'/'medium'/'long'
  content TEXT NOT NULL,
  valid_from_chapter INTEGER,
  valid_to_chapter INTEGER
);

-- 待兑现事项
CREATE TABLE pending_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,           -- '伏笔回收'/'角色弧线'/'剧情转折'/'用户笔记'
  content TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT '未兑现',
  source TEXT,                       -- '用户手动'/'蒸馏引擎'/'大纲自动'
  deadline_chapter INTEGER,
  fulfilled_at TIMESTAMP
);

-- 写作备忘录
CREATE TABLE writing_memos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  tags JSON,
  related_chapter_ids JSON
);
```

---

## 7. 与 novel-forge-ours 对照

| 功能 | 实现状态 |
|------|---------|
| 三层记忆架构 | ⚠️ 第2层部分（ChapterSummary），第1层无 |
| S/A/B 分级注入 | ⚠️ 部分（buildPromptContext 有类似逻辑但无显式分级） |
| Token 优化 | ❌ 无针对性优化 |
| 五状态伏笔机 | ✅ PendingCommitment 模型已建，检测逻辑待完善 |
| 对话压缩 | ❌ 无 |
| 时间线感知过滤 | ⚠️ 部分（previousNodes 按 order 过滤但无显式跳章保护） |
| 待兑现事项 | ❌ 无独立模型（混在伏笔和 storyBeat 中） |
