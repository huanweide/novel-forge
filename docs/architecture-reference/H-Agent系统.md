# H — Agent 系统

> 整合自：15-agent-system-prompt + 23-core-architecture-patterns（工具调度部分）
> 边界：只管 Agent 的行为规则、工具调度逻辑、提示词结构。不涉及具体功能模块的生成/蒸馏逻辑。
> 最后更新：2026-06-17

---

## 1. Agent 身份与定位

Agent 是用户和数据库之间的智能层。它不直接操作数据库，而是通过**工具调用**来查询和操作数据。

核心行为约束：
- 每次用户问"当前章节"，必须重新调用工具查询最新数据——不能复用对话缓存
- 写正文的唯一正确方式是调用 `chapter_generate_content`——禁止通过 `chapter_update` 手动塞入长正文
- 章节操作严格区分：create（建空壳）、update（改标题/状态）、generate（写正文）
- 每次只做明确要求的操作，不确定时主动提问

---

## 2. 工具调度系统

### 依赖图模型

```
工具依赖关系：
  chapter_generate_content → depends_on:
    [character_query, foreshadow_query, outline_query, worldview_query]
    → 这些依赖可并行执行（都是只读查询）

  character_update → depends_on: [character_query]（先查再改）

并行组（无相互依赖，可同时调用）：
  [character_query, foreshadow_query, outline_query,
   worldview_query, faction_query, geo_map_query]
```

### 意图解析：关键词 → 工具映射

```
"分析" → [chapter_content_query, character_query, foreshadow_query, plot_line_query]
"写"   → [chapter_generate_content]
"修改" → [character_update, outline_update, chapter_update]
"查询" → [character_query, foreshadow_query, outline_query]
"创建" → [character_create, faction_create, item_create]
```

### 调度策略

```
阶段1：并行执行所有无依赖的只读查询
阶段2：串行执行有依赖关系的工具
错误处理：必需工具失败 → 整体失败；可选工具失败 → 忽略继续
```

---

## 3. 提示词分层结构

Agent 自身的系统提示词分为 5 层：

```
第1层：身份定义（语气最正式）
  "你是小说创作 AI 智能助手（Agent 模式）。"

第2层：硬规则（★★★ 标记，命令式语气）
  必须/禁止/严禁——违反会导致严重问题

第3层：中等规则（★ 标记，建议式语气）
  建议/可以/优先——最佳实践指导

第4层：动态上下文
  当前项目名称、当前编辑章节

第5层：工具说明（JSON Schema 格式）
  每个工具的名称、参数、返回值格式
```

**设计关键：** 硬规则用视觉标记（★★★）区分强度；模型对符号标记比纯文本更敏感。

---

## 4. Agent 行为规则（11 条提取）

1. 写正文必须调用 `chapter_generate_content`——它自动弹出写作面板
2. 禁止用 `chapter_create/chapter_update` 手动写入长篇正文——会绕过记忆注入和蒸馏
3. 如果当前章节 ID 为 null，直接用 `chapter_generate_content` 即可——它会自动创建
4. 任何时候用户问"当前章节"，必须重新调用工具查询，不能复用缓存
5. 工具调用遵循最小数据原则——只返回必要的字段
6. 多个独立查询应并行调用而非串行
7. 对话历史压缩时只记录"做了什么"，不记录具体数据
8. 不确定用户意图时调用 agent_ask_user 提问
9. 每次只做明确要求的操作，不擅自扩大范围
10. 数据量太大时分批返回，避免一次性撑满上下文
11. 工具返回值用自然语言总结给用户，不要直接 dump 原始 JSON

---

## 5. 对话历史压缩策略

```
触发条件：对话超过 6000 token
方法：把早期对话压缩成 200-300 token 摘要

摘要规则：
  ✅ "用户查询了当前章节正文和角色列表。分析了出场角色情况。"
  ❌ "用户查询了正文（3000字），角色列表（50个角色：李尘、苏月瑶...）"

原则：记录发生了什么，不记录具体数据。具体数据过时了，需要重新查。
```

---

## 6. 数据不缓存原则

Agent **故意不缓存**业务数据。原因：

| 做法 | 后果 |
|------|------|
| 缓存数据 | 占用上下文 → 可能过时 → 检测不到用户已手动修改 |
| 重新查询 | 0.1 秒延迟 → 数据一定最新 → 上下文干净 |

---

## 7. 与 novel-forge-ours 对照

| 功能 | 实现状态 |
|------|---------|
| Agent 工具层 | ❌ 本项目无 Agent 层（直接用 API 路由，无工具调度） |
| 提示词分层 | ✅ systemPrompt 路径有类似分层（HUD + 硬规则 + 软建议） |
| 意图解析 | ❌ 无（API 路由不解析意图） |
| 并行工具调用 | ❌ 无（API 路由串行处理） |
| 对话压缩 | ❌ 无（无会话管理） |
| 不缓存数据 | ⚠️ 部分（getSettings 有 60s 缓存但 clearLLMCache 可刷新） |
