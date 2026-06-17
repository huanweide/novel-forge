# SSE 流式协议完整规范

## 一、事件类型一览

```
event: start → 生成启动，含 session_id/config/phases
event: memory(loading) → 记忆模块加载中（4个模块依次）
event: memory(done) → 记忆模块加载完成
event: token → 逐 token 流式推送（每50token夹带统计）
event: distillation_progress → 蒸馏4个子阶段进度
event: distillation_done → 蒸馏完成，含摘要/关键事件/新增承诺
event: done → 整轮生成完成，含 stats/post_processing/chapter_meta
event: error → 可恢复/致命错误
event: resume → 断线重连确认（仅重连场景）
```

## 二、各事件完整 JSON Payload

### event: start
```json
{
  "type": "start",
  "chapter_id": null,
  "outline_node_id": 42,
  "project_id": 12849,
  "session_id": "gen_20240115_103000_abc123",
  "generation_id": "gen_20240115_103000_abc123",
  "timestamp": "2024-01-15T10:30:00.123Z",
  "mode": "outline",
  "total_estimated_tokens": 3500,
  "phases": ["memory_injection","context_assembly","entity_loading","generation","post_processing","distillation"],
  "config": {"temperature":0.85,"max_tokens":4096,"free_writing":true,"prohibit_new_entities":false}
}
```

### event: memory (loading)
```json
{
  "type": "memory",
  "subtype": "loading",
  "phase": "memory_injection",
  "module": "pending_commitments",
  "status": "loading",
  "loaded_count": 0,
  "total_count": 12,
  "progress": 0.0,
  "message": "正在加载待兑现事项..."
}
```
4个模块依次：pending_commitments → character_state → story_recap → breakthrough_events

### event: memory (done)
```json
{
  "type": "memory",
  "subtype": "done",
  "phase": "memory_injection",
  "module": "pending_commitments",
  "status": "done",
  "loaded_count": 12,
  "total_count": 12,
  "progress": 0.25,
  "message": "待兑现事项加载完成（12条，其中高优先级3条）",
  "summary": {"high_priority":3,"medium_priority":5,"low_priority":4,"overdue_count":1}
}
```

### event: token
```json
{
  "type": "token",
  "phase": "generation",
  "token": "李",
  "index": 0,
  "timestamp": "2024-01-15T10:30:05.456Z"
}
```
每约50token推送累积统计：`"cumulative":{"chars":312,"tokens":156,"elapsed_ms":12340,"tokens_per_second":12.64}`
特殊标记flags：`section_break`, `dialogue_start`, `paragraph_end`

### event: done
```json
{
  "type": "done",
  "phase": "complete",
  "session_id": "...",
  "chapter_id": 187,
  "outline_node_id": 42,
  "timestamp": "...",
  "stats": {
    "total_tokens": 3287, "total_chars": 8562, "elapsed_ms": 165678,
    "tokens_per_second": 19.84,
    "cost_estimate": {"input_tokens":4850,"output_tokens":3287,"estimated_cost_cny":0.089}
  },
  "post_processing": {
    "new_entities_created": 1, "foreshadows_detected": 2,
    "pending_commitments_fulfilled": 1, "pending_commitments_partial": 2,
    "pending_commitments_created": 3, "breakthrough_events_recorded": 0
  },
  "distillation": {
    "summary_generated": true, "summary_length": 186,
    "key_events_extracted": 4,
    "characters_involved": ["李慕白","玄天剑","青木崖"],
    "tone_tags": ["热血","突破","悬念"],
    "emotional_arc": "rising"
  },
  "chapter_meta": {
    "title": "青木崖上", "word_count": 8562,
    "status": "writing", "is_new_chapter": true
  }
}
```

### event: distillation_progress
```json
{
  "type": "distillation_progress", "phase": "distillation",
  "sub_phase": "extract_key_events", "status": "in_progress",
  "progress": 0.3,
  "message": "正在提取关键事件...",
  "detail": {"current_step":"extract_key_events","total_steps":4,
    "step_names":["extract_key_events","generate_summary","update_character_arcs","update_timeline"]}
}
```
4个子阶段按序：extract_key_events → generate_summary → update_character_arcs → update_timeline

### event: distillation_done
```json
{
  "type": "distillation_done", "phase": "complete",
  "session_id": "...",
  "summary": {
    "chapter_summary": "...", "word_count": 186,
    "tone": "热血激昂", "emotional_arc": "rising"
  },
  "key_events": [
    {"id":1,"event":"...","entities":["..."],"type":"arrival"}
  ],
  "pending_commitments_created": [
    {"description":"...","priority":"high","source":"distillation_inference"}
  ],
  "character_states_updated": [
    {"character":"李慕白","changes":{"realm":"炼气九层→筑基初期","key_items":["玄天剑"],"mood":"振奋"}}
  ],
  "foreshadows_updated": [
    {"id":5,"name":"魔窟封印","status":"planted","chapter_id":187}
  ]
}
```

### event: error
可恢复：`severity:"recoverable"`, codes: RATE_LIMITED(429/指数退避3次), TIMEOUT_PARTIAL(断点续传), MODEL_BUSY(503/等2s), CONTEXT_OVERFLOW(413/自动压缩)
致命：`severity:"fatal","terminate":true`, codes: AUTH_FAILED, INVALID_PROJECT, MODEL_UNAVAILABLE, INTERNAL_ERROR, OUTLINE_NODE_DELETED

## 三、断线续传机制

### 服务端缓存
- Redis Key: `gen:session:{session_id}:tokens` → List<string>，按index存储
- Redis Key: `gen:session:{session_id}:meta` → Hash，含status/total_tokens/expires_at
- TTL: 30分钟

### 重连流程
```
客户端断开 → 随机延迟1-3s → POST /api/v1/generate/resume
  {"session_id":"...","last_token_index":156,"last_event_type":"token"}

情况A: 会话仍在生成 → 从 last_token_index+1 继续推送
情况B: 会话已完成 → 返回完成状态
情况C: 会话已过期 → 410 Gone，需重新发起
```

### 重连确认事件
```json
event: resume
data: {
  "type":"resume","session_id":"...",
  "resume_from_index":157,"missed_tokens_count":0,
  "reconnected_at":"...",
  "message":"已从第157个token恢复生成"
}
```

### 批量回放（断线期间丢失的token）
```json
event: token
data: {
  "type":"token","phase":"generation","batch":true,
  "tokens":["的","剑","光"],"start_index":157,"end_index":163
}
```

### 重试策略
| 次数 | 延迟 |
|------|------|
| 1 | 1-3s随机 |
| 2 | 5s |
| 3 | 15s |
| >5 | 停止，提示用户 |

## 四、完整时序

```
start → memory(loading×4/done×4) → token(×N,每50含cumulative) →
distillation_progress(×4子阶段) → distillation_done → done
```

注意：distillation_done 先于 done（蒸馏完成 → 整轮完成）
