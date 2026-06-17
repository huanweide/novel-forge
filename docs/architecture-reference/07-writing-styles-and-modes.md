# 文笔风格 + 规则管理 + AI模式全集

## 一、文笔风格数据结构

风格 = 可复用的多维配置对象，定义AI生成文本的"语气、节奏、词汇偏好、句式结构"。

```json
{
  "name": "古典仙侠风",
  "is_default": true,
  "parameters": { "temperature": 0.65, "top_p": 0.90, "top_k": 50, "repetition_penalty": 0.12 },
  "linguistic_rules": {
    "sentence_length": { "target_avg": 18, "range": [8, 35] },
    "vocabulary": {
      "preferred_words": ["但见","只见","却见","赫然","竟","方","乃"],
      "avoided_words": ["突然","然后","而且","但是","所以"],
      "domain_terms": {
        "修炼": ["吐纳","运功","引气","冲关","周天"],
        "战斗": ["祭出","催动","化作","轰然","破空"],
        "对话": ["淡然道","沉声道","冷笑道","缓缓开口"]
      }
    },
    "rhetoric": {
      "metaphor_frequency": 0.3,
      "parallelism_frequency": 0.2,
      "four_char_idiom_frequency": 0.4
    },
    "perspective": "third_person_limited",
    "tense": "past"
  },
  "character_voice": {
    "narrator_tone": "沉稳典雅",
    "dialogue_tags": "以动作和神态代替'说'",
    "inner_monologue_style": "书面化，少用口语词",
    "environment_description_style": "工笔细描，多用意象"
  },
  "sample_passages": ["样本1", "样本2"]
}
```

### 创建方式
1. 手动配置：逐项填写
2. 从样本学习：输入3-5段文本样本 → 系统分析句长/词汇/修辞 → 自动生成配置 → 用户微调
3. 从已有项目复制

### 三层注入
1. **System Prompt注入**：在系统指令中嵌入风格要求（叙事视角/语言要求/修辞要求/参考样本）
2. **生成参数注入**：覆盖LLM API的temperature/top_p/top_k/repetition_penalty
3. **后处理修正**：替换违规词→调整句长→补充修辞→风格化对话标签

### 风格匹配优先级
```
章节级风格 > 项目默认风格 > 全局默认风格
```

## 二、规则管理系统

### 规则数据结构（条件-动作对）
```json
{
  "name": "苏月不可提前突破金丹",
  "enabled": true,
  "scope": { "type": "chapter_range", "range": [1, 19] },
  "condition": { "type": "event_trigger", "event_type": "突破", "target": "苏月", "target_realm": "金丹" },
  "action": { "type": "block_and_redirect", "severity": "hard_block", "redirect_to": "突破失败或遇到意外阻碍" },
  "priority": 100,
  "category": "剧情约束"
}
```

### 条件类型
- event_trigger: 检测到特定事件
- entity_appearance: 检测到特定实体出现
- relationship_change: 检测到关系变化
- location_change: 检测到地点切换
- item_acquire: 检测到物品获得
- timeline_violation: 检测到时间线矛盾

### 动作类型
- block_and_redirect: 阻止+引导到替代方向 (hard_block/soft_suggest)
- modify_content: 自动修改违规内容 (auto_fix)
- warn_and_continue: 仅警告 (warning_only)
- insert_content: 强制插入内容 (force_insert)
- add_constraint: 动态添加约束到prompt (dynamic)

### 作用域类型
global < volume < chapter_range < event_type < character_scene < conditional

### 冲突裁决
1. priority值（0-1000）→ 2. 作用域精度 → 3. 创建时间

### 实时检测
每生成200字检查一次 → 触发则执行action → hard_block回退重新生成

## 三、AI模式9个取值

| 模式 | 值 | 工具调用 | 记忆注入 | 输出 | 典型场景 |
|------|-----|:---:|:---:|------|------|
| Agent | `agent` | 完整 | 完整 | 自由格式 | 开放式创作 |
| 对话 | `dialogue` | 只读 | 精简 | 纯对话 | 头脑风暴 |
| 续写 | `writing` | 无 | 完整 | 仅正文 | 接着写 |
| 润色 | `polish` | 无 | 无 | 润色后文本 | 提升文笔 |
| 大纲 | `outline` | 大纲相关 | 仅大纲+事件线 | 结构化大纲 | 章节规划 |
| 审阅 | `review` | 读当前章 | 全本大纲+事件线 | 审阅报告 | 查漏洞 |
| 扩写 | `expand` | 无 | 风格+上下文 | 扩写后文本 | 写详细 |
| 压缩 | `compress` | 无 | 无 | 压缩后文本 | 精简 |
| 角色 | `character` | 角色相关 | 角色完整档案 | 角色分析 | 角色深度 |

## 四、去AI味润色

### AI味特征
- 词汇：过度使用"然而/但是/因此/不禁/微微一怔/心中一凛"
- 句式：每段"的"字开头，结构规整，长短句均匀
- 结构：起承转合模板化，对话-叙述节奏规律
- 情感：标准描写，缺少个人化感受，反应过于"合理"

### 七层策略
① 词汇多样性增强：AI高频词 → 人工替代（40%减少）
② 句式多样性：打乱规整结构，加入省略句/倒装/短句独立成段
③ 连接词删除：删除不必要的"然而/但是/因此"
④ 万能描写替换："微微一怔"→具体动作
⑤ 段长打破：极端长短句交错
⑥ 视角聚焦：去除"我们可以看到"等跳出叙事
⑦ 情感个性化：加入非理性/情绪化瞬间
