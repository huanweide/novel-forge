# 规则引擎 — 作用域精度量化算法

## 一、双层计分模型

```
specificity_score = base_weight × dynamic_coefficient
```

### 固定基础权重

| 作用域类型 | 基础权重 | 含义 |
|-----------|---------|------|
| global | 1 | 全局适用，最宽泛 |
| volume | 2 | 限定到某一卷 |
| chapter_range | 3 | 限定到连续若干章 |
| event_type | 4 | 限定到某类事件 |
| character_scene | 5 | 限定到特定角色+场景组合 |
| conditional | 6 | 运行时条件判断，最精确 |

### 动态系数（同类型内精度区分）

| 作用域类型 | 动态系数公式 | 说明 |
|-----------|-------------|------|
| global | 固定 1.0 | 无额外参数 |
| volume | 1 / volume_count | 卷数越少，单卷越精确 |
| chapter_range | 1 / range_length | 范围越窄，精度越高 |
| event_type | 1 / event_type_count_in_project | 类型越少越精确 |
| character_scene | 1 / (max(char_count,1) × total_scenes) | 角色越少+场景越少越精确 |
| conditional | condition_count / max_conditions | 条件越多越精确（与上面相反！） |

## 二、典型对比

### chapter_range: [3,3] vs [1,5]
```
[3,3]: 3 × (1/1) = 3.000  ← 胜出
[1,5]: 3 × (1/5) = 0.600
```
范围越窄精度越高。

### character_scene vs event_type
```
character_scene: base=5（二维修正：谁+在哪）
event_type:      base=4（一维修正：什么类型）
→ character_scene 基础权重领先，通常胜出
```
极端情况（项目只有1场景+1事件类型）：
```
character_scene: 5 × 0.50 = 2.5  ← 仍胜出
event_type:      4 × 1.0  = 4.0  ← 看似更高...
```
但实际 dynamic 中 character_scene 分母用的是 total_scenes（项目总场景数）而非选中的场景数，所以通常不会出现此情况。

## 三、冲突裁决三段式

```python
def resolve_conflict(rule_a, rule_b):
    # 第一阶段：优先级（0-1000）
    if rule_a.priority != rule_b.priority:
        return rule_a if rule_a.priority > rule_b.priority else rule_b
    
    # 第二阶段：作用域精度
    spec_a = calculate_specificity(rule_a)
    spec_b = calculate_specificity(rule_b)
    if abs(spec_a - spec_b) > 1e-9:
        return rule_a if spec_a > spec_b else rule_b
    
    # 第三阶段：创建时间（先创建者胜）
    return rule_a if rule_a.created_at < rule_b.created_at else rule_b
```

## 四、精度计算伪代码

```python
def calculate_specificity(rule):
    scope = rule.scope
    base_weights = {
        'global':1, 'volume':2, 'chapter_range':3,
        'event_type':4, 'character_scene':5, 'conditional':6
    }
    base = base_weights[scope.type]
    
    if scope.type == 'global':
        dynamic = 1.0
    elif scope.type == 'volume':
        dynamic = 1.0 / get_project_volume_count(rule.project_id)
    elif scope.type == 'chapter_range':
        start, end = scope.params['start'], scope.params['end']
        dynamic = 1.0 / (end - start + 1)
    elif scope.type == 'event_type':
        dynamic = 1.0 / count_event_types_in_project(rule.project_id)
    elif scope.type == 'character_scene':
        chars = scope.params.get('character_ids', [])
        total_scenes = count_scenes_in_project(rule.project_id)
        dynamic = 1.0 / (max(len(chars), 1) * max(total_scenes, 1))
    elif scope.type == 'conditional':
        conds = scope.params.get('conditions', [])
        max_conds = get_max_condition_count_in_project(rule.project_id)
        dynamic = len(conds) / max_conds  # 条件越多越精确
    
    return base * dynamic
```

## 五、同类型同priority裁决

| 场景 | 结果 |
|------|------|
| 参数完全相同 | 降级到创建时间 |
| 参数不同（如不同范围长度） | 精度高者胜 |
| 同范围长度不同位置（如[1,3] vs [8,10]） | 精度相同 → 降级到创建时间 |

## 六、完整裁决示例

```
A: priority=8, chapter_range:[1,10]  → 3 × 0.100 = 0.300
B: priority=8, chapter_range:[5,5]   → 3 × 1.000 = 3.000 ← 胜出
C: priority=8, character_scene(李慕白,青木崖) → 5 × 0.050 = 0.250
D: priority=10, global                → 直接priority胜出（无需比精度）
```
