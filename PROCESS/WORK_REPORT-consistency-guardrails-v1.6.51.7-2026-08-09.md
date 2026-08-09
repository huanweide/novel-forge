# 工作单元报告：一致性切片「成本/频率护栏」（v1.6.51.7 / Next-3，v1.8 发布前打磨）

> 费曼式沉淀 · 零基础可读 · 瑞宝宝专属

## 一句话结论

给整条一致性切片（抽取→注入→检测→建议→人工纠错）做发布前最后一道收口：两处「小而硬」的护栏——(1) 抽取时按 `subject|attribute` 去重，防基线堆重复行；(2) 纯续写时不再每次全量重抽基线，省 DeepSeek 调用。零 schema 变更。随后即可 mint v1.8.0。

---

## 一、干了什么

1. 抽出纯函数 `dedupeFacts`（按 subject+attribute 去重，key 大小写不敏感、忽略首尾空格），`extractConsistencyFacts` 调用它后再入库；新增 4 例单测。
2. `PostPipelineParams` 加 `skipConsistencyExtract` 开关；`post-processor` 仅在非续写时触发基线重抽；`refine` 路由在「纯续写意图」(`isContinuationIntent`) 时传 `true` 跳过。
3. 升版 v1.6.51.7，写 changelog。

验证：tsc 0 错，vitest 41 文件 357 测试全过。

---

## 二、为什么这么做（底层原理）

**问题从哪来**：一致性基线靠每次生成后调一次大模型（2500 token 上限）全量重抽得到。两个浪费点——
- 大模型偶尔把同一条事实（如「主角发色=墨黑」）在单次返回里写两三遍，直接入库就成重复行，基线越来越脏。
- 作者改稿时常处于「续写循环」：一段段接着写，每次都触发全量重抽。续写不改变「主角几岁、什么门派」这类事实密度，重复重抽纯烧 token、还拖慢响应。

**为什么去重用纯函数而不是在 SQL 层加唯一约束**（第一性原理）：
- 加唯一索引 `(projectId, subject, attribute)` 要 `prisma db push` 迁移，而线上 Neon 额度耗尽、靠本地 PG17 验证，能不迁移就不迁移（降风险）。
- 去重是「业务逻辑」（归一化大小写/空格后再判同），放 SQL 约束表达不了归一化。抽到内存里用纯函数处理，零依赖、可单测、与 DB 解耦。能用代码解决、又不必动 schema 的，就别动 schema。

**为什么闸门只跳「重抽」不跳「冲突检测」**（第一性原理）：
- 重抽 = 重读所有章节 + 调大模型，重且贵；续写不改事实密度，跳过安全。
- 冲突检测 = 拿新章节正文和**现有**基线比，便宜且每次生成都该跑（新写的句子可能和设定打架）。所以闸门只罩着重抽，detect 照常。各司其职。

**类比**（秒懂）：
- 「基线重抽」= 每次改稿都把整本设定集重新打字一遍。续写时其实只加了一句话，没必要重打全集——闸门就是「续写时别重打，要重打你手动按按钮」。
- 「去重」= 大模型手抖把同一条设定写了两遍，入库前先筛掉重复的，设定集不堆废纸。

---

## 三、方法 / 工具与效果

### 实施步骤（时间顺序）

| 步骤 | 动作 | 结果 |
|---|---|---|
| 1 | 读 post-processor / refine 路由，定位重抽调用点与 `isContinuationIntent` 变量 | 确认闸门可接 |
| 2 | 抽 `dedupeFacts` 纯函数 + 4 例单测 | 去重逻辑可测、可锁 |
| 3 | `extractConsistencyFacts` 改用 `dedupeFacts` | 重复事实不再入库 |
| 4 | 加 `skipConsistencyExtract` 参数 + post-processor 守卫 + refine 路由传值 | 续写不重抽 |
| 5 | 升版 v1.6.51.7 + 双门禁 | tsc 0 + vitest 357 全过 |

### 关键代码（已实测）

```ts
// 去重纯函数
export function dedupeFacts(facts: RawFact[]): RawFact[] {
  const seen = new Set<string>();
  const out: RawFact[] = [];
  for (const f of facts) {
    const key = `${f.subject.trim().toLowerCase()}|${f.attribute.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...f, subject: f.subject.trim(), attribute: f.attribute.trim(), value: f.value.trim() });
  }
  return out;
}

// post-processor 守卫
if (!skipConsistencyExtract) {
  void extractConsistencyFacts(projectId).catch(() => {});
}

// refine 路由
skipConsistencyExtract: isContinuationIntent,
```

### 测试（4 例全过）
1. 同 subject+attribute 重复 → 仅留首条
2. 不同 attribute → 全留
3. 大小写/空格差异 → 视为同一条
4. 空输入 → 空

---

## 四、关键取舍

**A. 为什么只闸「续写」不闸「新章/靶向修改」**
新章（write 路由）必抽——首次建立该章事实；靶向修改（refine 非续写）可能改角色设定，抽了才有用。只有「续写」是高频、低新增事实价值的，精准闸它，平衡成本与正确性。

**B. 为什么不做更大的重构（如按章节增量抽取）**
增量抽取要追踪「哪章新增了哪些事实、旧章删了哪些」，状态管理复杂、易错。当前「全删自动事实 + 重插去重结果」已正确且简单。Next-3 定位「小而硬」，不过度设计——马斯克第一性原理：能小改解决就别大改。

**C. 踩坑实录（真实）**
- 初稿把去重逻辑内联在 `extractConsistencyFacts` 里，后来抽成 `dedupeFacts` 纯函数——因为内联无法单测、且与其他解析纯函数（parseFactsFromLLM 等）风格不一致。抽出来后单测直接锁死行为，符合项目「解析逻辑必抽纯函数 + 单测」的惯例。
- 无新增图标/类型陷阱，本次改动面干净，tsc 一次过。

---

## 五、可复现步骤（照做即得）

```bash
cd novel-forge
npx vitest run src/core/consistency/extractFacts.dedupe.test.ts   # 4/4 过
SAFE_DELETE_DISABLE=1 npx tsc --noEmit                           # 0 错
npx vitest run                                                   # 41 文件全过
```

---

## 六、下一步

- **mint v1.8.0**：v1.8 印章条件（Next-1+Next-2 完成且全绿）v1.6.51.6 已满足，本版打磨完毕，随即 bump 到 v1.8.0 作为一致性切片里程碑；changelog 头条汇总「抽取→注入→检测→建议→纠错→护栏」全链路。
- 推送：TLS 代理 7897 恢复后一次性补推本地领先提交（v1.6.51 ~ v1.8.0），`git ls-remote origin main` 真查远程 HEAD 对账，绝不谎报。
