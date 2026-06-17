# pending_commitments 完整状态机

## 一、状态定义（5个状态）

```
                    ┌──────────┐
                    │  pending  │ ← 初始状态
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        ┌─────────┐ ┌──────────┐ ┌────────┐
        │detected │ │partially │ │voided  │
        │(已检测)  │ │_fulfilled│ │(废弃)  │
        └────┬────┘ │(部分兑现) │ └────────┘
             │      └─────┬────┘
             │            │
             └─────┬──────┘
                   ▼
            ┌────────────┐
            │  fulfilled  │ ← 终态
            │  (已兑现)    │
            └────────────┘
```

| 状态码 | 含义 | 终态 |
|--------|------|:--:|
| pending | 承诺已创建，尚未被正文覆盖 | 否 |
| detected | 生成过程中检测到可能被覆盖（过渡态） | 否 |
| partially_fulfilled | 承诺被部分满足 | 否 |
| fulfilled | 承诺被完整覆盖，闭环 | 是 |
| voided | 因大纲修改/剧情变更/超期等原因主动废弃 | 是 |

## 二、状态转换触发条件

### pending → detected
- 触发时机：chapter_generate_content 前置注入阶段
- 条件：承诺关键词/实体与当前章大纲摘要 embedding 相似度 > 0.65
- 动作：注入到生成 prompt「待兑现记忆」段

### detected → partially_fulfilled
- 触发时机：正文生成后处理阶段
- 条件：正文提到核心实体+部分关键行为，但缺少完整闭环条件
- 动作：更新 fulfillment_ratio

### detected → fulfilled（直接兑现）
- 条件：正文完整覆盖所有关键要素，满足闭环判定规则

### partially_fulfilled → fulfilled
- 触发时机：后续章节后处理阶段
- 条件：新正文补全了之前缺失的闭环条件
- 动作：合并前后兑现记录

### partially_fulfilled → voided
- 条件：累计超过20章未完全兑现，且 fulfillment_ratio < 0.3
- 原因：timeout_low_coverage

### pending → voided
- 条件：大纲节点被删除（级联）/ 大纲摘要修改后语义相似度 < 0.3 / 用户主动 / 超期

### voided → pending（复活）
- 触发：用户手动点击"恢复"

## 三、闭环检测（3层匹配流水线）

### 第1层：实体匹配
- 承诺涉及实体在正文中同时出现
- 词距约束：两个实体 < 50 token

### 第2层：行为/事件匹配
- 解析承诺行为谓词 → 在正文中检测同义/近义词
- NLP依存句法分析确认主谓宾关系正确

### 第3层：closure_conditions 检查（最关键）
```json
{
  "closure_conditions": [
    {"type": "location", "value": "青木崖", "required": true},
    {"type": "action", "value": "突破", "required": true},
    {"type": "state_change", "entity": "李慕白", "from": "炼气期", "to": "筑基期", "required": true}
  ]
}
```
- 全部 required=true 满足 → fulfilled
- 部分满足 → partially_fulfilled, ratio = 已满足/总条件
- 无一满足 → 状态不变

## 四、超期机制

| 参数 | 默认值 | 说明 |
|------|--------|------|
| max_unfulfilled_chapters | 20 | 超过此章数触发处理 |
| low_coverage_threshold | 0.3 | 覆盖率低于此值视为"几乎未写" |

| 策略 | 条件 | 动作 |
|------|------|------|
| 主动提醒 | >10章 | 写作面板高亮提醒 |
| 自动降级 | >15章, ratio<0.3 | 不再注入到prompt |
| 自动废弃 | >20章, ratio<0.3 | → voided |
| 关联废弃 | 大纲节点被删 | 级联废弃 |
| 语义废弃 | 摘要修改后相似度<0.3 | 自动废弃 |

## 五、存储结构

```sql
CREATE TABLE pending_commitments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL,
    source          TEXT NOT NULL,              -- 'outline_summary'|'user_intent'|'ai_inference'|'foreshadow'
    source_node_id  INTEGER,
    priority        TEXT DEFAULT 'medium',      -- 'high'|'medium'|'low'
    
    description     TEXT NOT NULL,
    entity_ids      JSON,
    closure_conditions JSON,                    -- 闭环条件JSON数组
    
    -- 状态机
    status          TEXT NOT NULL DEFAULT 'pending',
    fulfillment_ratio REAL DEFAULT 0.0,
    void_reason     TEXT,
    
    -- 兑现记录
    fulfilled_chapter_id    INTEGER,
    fulfilled_content_snippet TEXT,
    partially_fulfilled_ids JSON,
    
    -- 状态变更追踪
    status_history  JSON NOT NULL DEFAULT '[]',  -- 完整审计链
    
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    fulfilled_at    TEXT,
    voided_at       TEXT,
    detected_at     TEXT,
    
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (fulfilled_chapter_id) REFERENCES chapters(id)
);

CREATE INDEX idx_pc_project_status ON pending_commitments(project_id, status);
CREATE INDEX idx_pc_source_node ON pending_commitments(source_node_id);
```

### status_history JSON 结构

```json
[
  {
    "from": "pending",
    "to": "detected",
    "trigger": "pre_injection",
    "chapter_id": 5,
    "timestamp": "2024-01-15T10:30:00Z",
    "details": "承诺关键词'玄天剑'与第5章大纲'寻剑'语义匹配度0.72"
  }
]
```
