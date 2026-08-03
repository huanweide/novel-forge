# Round 1 QA 报告 · 工坊（数据迁移控）

> 角色透镜：备份导出/导入选择 + 导入合并 + 预设应用 + 正则规则
> 方法：严格只读源码分析（`src/`），未修改任何源码；`npm test` 27/27 通过。
> 范围已实测确认正常：备份 `?include=` 过滤生效、正则后处理已接 write/refine/continue 三路由、创意工坊预设各类型均有落地。

---

## 发现 1 — P1：导入合并时同名角色/词条会重复创建（无库内唯一约束）
- **文件:行号**：`src/app/api/import/commit/route.ts:353-421`（角色）、`:479-521`（词条）
- **问题描述**：去重 map（`charByName`/`loreByTitle`）仅在开始时从“已有库”加载一次；新角色/词条推入 `charNewData`/`loreNewData` 后**未把新名字回填**到 map。若本次导入列表内出现同名（长文分块抽取常见，或外部备份本身含重名），两条都进入 `createMany`。`CharacterCard`（`prisma/schema.prisma:60-79`）无 `@@unique([projectId, name])` 约束，于是静默落库成两张同名卡。
- **预期 vs 实际**：预期同名应合并/去重；实际直接重复写。
- **建议修法**：写库前对 incoming 列表自身按 name（不区分大小写）去重；或给 `CharacterCard`/`LorebookEntry` 加 `@@unique([projectId, name])`，并把 `createMany` 改为逐条 upsert/容错。

## 发现 2 — P1：导入不校验/规范化 relationships 格式，错键会静默失效
- **文件:行号**：`src/app/api/import/commit/route.ts:410`、`:143-144`；`src/app/api/projects/import/route.ts:96-98`
- **问题描述**：下游消费者（sync-global-prompt.ts:129、CharacterDialog.tsx:36、RelationshipGraph、生成提示词）均假定关系对象为 `{targetName, relation, dynamic}`。但两个导入入口都 `Array.isArray(...) ? ... : []` 原样存储，无校验/归一化。若备份是 v0.46.55 之前的旧键名（`target`/`type`，CHANGELOG 已记过该 bug）或外部写错键，关系会显示成 `?(?)`、关系图断裂；且 `ruleMergeChar`（commit:143-144）按 `r.targetName` 去重，错键关系在合并时既无法去重又可能与正常关系并存，造成关系重复。
- **预期 vs 实际**：预期导入层至少归一化关系键名；实际完全透传。
- **建议修法**：导入时做格式归一化（兼容 `target→targetName`、`type/relationship→relation`，缺 `dynamic` 补空）；非数组/非对象则丢弃并告警。

## 发现 3 — P2：备份包 `included` 字段在导入端被忽略，导出选择未约束导入
- **文件:行号**：`src/app/api/projects/[id]/backup/route.ts:56`；`src/app/api/projects/import/route.ts:26-29`
- **问题描述**：备份把实际选中范围写入 `bundle.included`，但导入路由不读它，只认 `ImportDialog` 勾选框覆盖写入的 `bundle.include`（默认 8 项全选）。`include=characters` 导出的包，导入时默认“尝试”导入全部 8 类（数据缺失故实质只进角色，但语义误导，误选会产生空导入）。
- **预期 vs 实际**：预期导入尊重备份自带 include；实际以客户端勾选为准，元数据成死字段。
- **建议修法**：导入端优先以 `bundle.included` 初始化勾选集，ImportDialog 初始选中基于它而非硬编码全选。

## 发现 4 — P2：正则后处理规则内联编辑无 new RegExp 校验，非法正则静默失效
- **文件:行号**：`src/components/workspace/ProjectConfigPanel.tsx:315-326`（内联直存）、`:164-169`（新增弹窗有校验）
- **问题描述**：新增规则弹窗提交前用 `new RegExp(pattern, flags||"g")` 拦截非法正则（正确）；但已有规则的 `pattern`/`flags` 是内联文本框直改直存，无校验。若把 flags 改成非法组合（如 `"gg"`），保存不报错，生成时 `applyRegexRules`（regex.ts:18）单条 `new RegExp` 抛错被 catch 静默跳过——用户“加了规则却没生效”且零提示。
- **预期 vs 实际**：预期所有写入入口都校验；实际仅新增弹窗校验。
- **建议修法**：内联编辑失焦/保存时同样跑 `new RegExp` 校验，非法给红字提示并禁止保存。

## 发现 5 — P2：QA 巡检表指向的“正则规则 UI”路径已失效
- **文件:行号**：预期 `src/app/workspace/[projectId]/settings/page.tsx` 不存在；实际正则后处理 UI 在 `ProjectConfigPanel.tsx`，创作铁律在 `RulesPanel.tsx`（全局 `settings/page.tsx` 无正则校验）。
- **问题描述**：按给定路径找不到文件，说明 QA 检查清单与实际布局不一致，易漏检。
- **建议修法**：更新 QA 清单路径，将“正则后处理（ProjectConfigPanel）”与“创作铁律（RulesPanel）”分开登记。
