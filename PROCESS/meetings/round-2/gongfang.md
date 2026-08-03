# Round 2 QA 报告 · 工坊（数据迁移控）

> 角色透镜：备份导出/导入选择 + 导入合并 + 预设应用 + 正则规则
> 方法：严格只读源码分析（`src/`），**未修改任何源码**。本轮先回归复验上轮 5 条，再挖新坑。
> 术语小词典（首次出现大白话）：
> - **同批去重**：一次导入里若名单出现两个同名（长文分块抽取常见），只留第一个，避免重复写库。
> - **关系字段归一化**：把角色关系的旧键名 `{target, type}` 统一转成下游只认的 `{targetName, relation}`，否则关系会显示成「?(?)」且关系图断裂。
> - **备份 include 元数据**：导出备份包时，把"本次勾选了哪些范围"写进包里的字段，还原时应据此决定导入哪些。
> - **正则后处理内联编辑**：在配置面板里直接改已有正则规则的文本框（区别于"新增规则"弹窗）。
> - **AI 合并路径 / 规则合并兜底**：导入遇到同名角色时优先让 AI 合并；AI 超时或失败则回退到本地规则合并。

---

## 回归验证（逐项：问题 / 预期 / 实际 file:line / 结论）

### R1 — 同名角色/词条同批重复创建（上轮发现 1，P1）
- **问题**：`createMany` 前未对 incoming 列表自身去重，同名会落成两张卡。
- **预期**：导入循环内对本次名单按 name 去重，跳过重复项。
- **实际**：
  - 角色：`seenCharNames` 集合在 `route.ts:380` 声明，循环内 `:385` 命中则 `continue`、`:386` 加入；同名第二条被跳过。
  - 词条：`seenLoreTitles` 集合在 `route.ts:509` 声明，`:514` 命中跳过、`:515` 加入。
- **结论**：**通过**（已修复，且新卡落库前还走了 `normalizeRelationships`，见 R2）。

### R2 — 导入不校验/规范化 relationships 格式（上轮发现 2，P1）
- **问题**：旧格式 `{target, type}` 透传，关系字段静默失效。
- **预期**：导入层对关系字段做归一化（兼容旧键名 + 缺字段补空）。
- **实际**：
  - 新增 `normalizeRelationships` 函数：`route.ts:121-130`，把 `target→targetName`、`type→relation`、过滤非对象。
  - **已接的两条路径**：
    - 规则合并兜底 `ruleMergeChar`：`route.ts:157-158` 内部调用归一化。
    - 新角色直接写库 `charNewData.relationships`：`route.ts:429` 调用 `normalizeRelationships(char.relationships)`。
  - **未接的关键路径（漏洞见新发现 N1）**：AI 合并成功时直接写 `merged.result.relationships`，未归一化。
- **结论**：**部分通过**——规则合并与新卡已修，但 AI 合并成功路径仍漏（见 N1，仍是 P1）。

### R3 — 备份 include 元数据在还原端失效（上轮发现 3，P2）
- **问题**：备份包写入 `included` 但实际未在还原时约束导入范围。
- **预期**：还原时读取备份自带 include，按勾选范围导入，不丢该有的数据。
- **实际**：
  - 导出端确实写元数据：`backup/route.ts:56` `included: Array.from(allowed)`（字段名是 **included**，带 d）。
  - 还原端读的是另一个键：`projects/import/route.ts:26` `const include = Array.isArray(bundle.include) ...`——键名是 **include**（无 d）。
  - 二者不一致 → `bundle.include` 永远 `undefined` → `include = null` → 还原恒按"全量"跑。由于全量导入只会写入包里**实际存在**的数据，所以**部分导出备份还原时不会丢数据**（缺的数组本来就是 undefined，被跳过）。代价是：备份包自带的 include 选择形同死字段，还原端无法据此做范围约束/校验。
- **结论**：**有漏洞（键名不一致）**——但实测**不会造成数据丢失**（仅元数据失效、语义误导）。建议把 `import:26` 改为同时兼容 `bundle.included`（或导出/还原统一键名）。

### R4 — 正则后处理内联编辑无 new RegExp 校验（上轮发现 4，P2）
- **问题**：已有规则的 `pattern`/`flags` 内联文本框直改直存，非法正则静默失效。
- **预期**：所有写入入口（含内联编辑、保存）都跑 `new RegExp` 校验。
- **实际**：
  - 新增规则弹窗有校验：`ProjectConfigPanel.tsx:159-173`（`confirmNewRule`）在 `:165` 用 `new RegExp` 拦截非法正则。
  - **内联编辑无校验**：已有规则输入框 `:315-333`（改 `r.pattern` / `r.flags`）调用 `updateRule`（`:148-150`），只改 state，无校验。
  - **保存也无校验**：`saveRules`（`:106-125`）直接 PATCH `postProcessingRules: rules`，不校验。
  - 全文搜索确认 `ProjectConfigPanel.tsx` 内唯一 `new RegExp` 在 `:165`（仅新增弹窗）。
- **结论**：**有漏洞（未修复）**——内联改已有规则 + 保存两条路径均无校验，旧 bug 仍在。

### R5 — QA 巡检表路径失效（上轮发现 5，P2）
- **问题**：按给定路径找不到正则 UI 文件。
- **预期**：QA 清单路径与实际一致。
- **实际**：正则后处理 UI 确在 `ProjectConfigPanel.tsx`、创作铁律在 `RulesPanel.tsx`，与 R1 描述一致；原路径本身是个文档/清单登记错误，本轮源码侧已无对应错误。**但**进一步核实发现"导入后 QA 是否生效"这一更实质问题（见 N3），原 R5 仅表层，真问题在 N3。
- **结论**：**通过（表层路径问题已无关）**——但引申出 N3 的实质缺口。

---

## 新发现（P0/P1：现象 / 根因 / file:line / 修复方案）

### N1 — P1（最关键）：AI 合并成功路径漏掉关系字段归一化，旧格式关系依旧静默失效
- **现象**：同名角色走 AI 合并且模型成功返回时，若 AI 把关系写成旧键名 `{target, type}`，写库后下游（`sync-global-prompt`、`RelationshipGraph`、对话提示）只认 `{targetName, relation}`，关系显示为「?(?)」、关系图断裂——与上轮发现 2 完全相同的症状，只是发生在"AI 成功"分支而非"透传"分支。
- **根因**：`mergeOneBatch` 返回的 `m.result` 是模型原始 JSON，未过 `normalizeRelationships`；调用方在 AI 成功分支直接 `prisma.update({ data: { ...merged } })` 写入。注意 `ruleMergeChar`（兜底）和"新角色"两条路径都已归一化，唯独 AI 成功分支漏了。
  - 返回处：`src/app/api/import/commit/route.ts:103` `return merged.map(m => (m.result || {}) ...)`（裸返回）。
  - 写入处：`route.ts:451-465`，尤其 `:455` `const merged = aiResult[j]`、`:462` `data: { ...merged, name: pair.name, projectId: undefined }`——`merged.relationships` 原样落库，未归一化。
- **修复方案**：在 `mergeOneBatch` 返回前、或 `:462` 写入前，对 `merged.relationships` 调一次 `normalizeRelationships`（与 `:429` 一致）。最干净的做法是在 `:103` 处对每个 `m.result` 做 `relationships: normalizeRelationships(m.result.relationships)`，一劳永逸覆盖 AI 与兜底两条分支。
- **影响范围**：仅"同名角色 + AI 合并成功 + AI 返回旧键名"三条件同时成立时触发；但因为 AI 输出格式不可控，属**必然偶发**，应视为 P1 必修。

### N2 — P1：备份还原（projects/import）写入角色时不归一化关系，旧备份关系静默失效
- **现象**：从 `.nfproject` 备份还原项目时，若备份来自修复前的旧版本（关系存为 `{target, type}`），还原后角色关系同样显示「?(?)」、关系图断裂。
- **根因**：`projects/import/route.ts:95-99` 角色还原循环 `prisma.characterCard.create({ data: { ...strip(c, [...] ), projectId: newPid } })`，`c.relationships` 原样写入，全程未调用 `normalizeRelationships`（该函数定义在 `import/commit/route.ts`，还原路由未引入）。
- **修复方案**：在还原路由引入并复用 `normalizeRelationships`（或把该函数提到 `lib/` 共享），对 `c.relationships` 做归一化后再 `create`。同时可顺手修复 R3 的 `include`/`included` 键名不一致。
- **影响范围**：跨版本迁移、旧备份还原场景必现，属**数据完整性**问题，对"数据迁移控"透镜优先级高。

### N3 — P2：导入流程完全不跑 QA/禁词扫描，导入文本无质量检查
- **现象**：用户把已有稿件/外部文本导入后，系统不会对其做禁词扫描、废词率等质量分析；只有"生成"（write/refine/continue）时才跑。
- **根因**：grep 全 `src/app/api/import/**` 无 `forbidden/quality/qa` 命中；QA/禁词仅在 `core/pipeline/post-processor.ts:84`（生成后处理）与 `generate/write|refine|continue` 路由调用。导入 commit/parse/quick 路由均无此逻辑（已逐文件核对 `import/commit/route.ts` 全文、`import/parse/route.ts`、`import/quick/route.ts`）。
- **修复方案**：是否需要在导入时跑 QA 取决于产品意图——导入多为"搬入已有文本"，并非必须扫描。若希望"导入即体检"，可在 commit 完成后对 `chapters` 批量调 `analyzeQuality`/`scanForbiddenWordsEnhanced` 并回写告警；否则建议在导入完成消息里提供"一键质量体检"入口，而非静默跳过。本轮建议**先明确需求再决定**，列为 P2 观察项。
- **影响范围**：功能设计取舍，非阻断 bug，但 QA 巡检表若声称"导入含质量检查"则属描述失真。

### N4 — P2：AI 合并成功分支整体覆盖式 update，可能丢失 AI 未返回的字段
- **现象**：同名角色走 AI 合并成功时，`prisma.update({ data: { ...merged } })` 用模型返回的对象整体覆盖。若模型漏返回某字段（如 `appearance`、`timeline`），该字段会被置空/默认值，造成信息丢失。
- **根因**：`import/commit/route.ts:462` 用 `{ ...merged }` 全量覆盖，而非与现有记录做字段级合并；相比之下的兜底 `ruleMergeChar`（`:174-190`）是逐字段互补合并，更安全。
- **修复方案**：AI 成功分支也先做"字段级互补合并"（可复用 `ruleMergeChar` 思路，以 AI 结果为主、现有记录补缺），再 `update`；或至少在 prompt 强制要求返回完整卡面并校验返回字段完整性。属内容正确性隐患，P2。

---

## 优先级建议

1. **P1 · N1（AI 合并关系未归一化）** —— 上轮 P1 的残留漏洞，修复量极小（在 `route.ts:103` 或 `:462` 加一处 `normalizeRelationships`），但症状与上轮完全相同，属"修了半截"。**优先修。**
2. **P1 · N2（备份还原关系未归一化）** —— 跨版本迁移/旧备份还原必现，威胁数据完整性。把 `normalizeRelationships` 提到 `lib/` 共享后在还原路由复用，**与 N1 一并修最划算。**
3. **P2 · R4（内联正则无校验）** —— 旧 bug 未修，用户改已有规则会静默失效；改动小（在 `saveRules`/`updateRule` 失焦时跑 `new RegExp`），建议本轮顺手修。
4. **P2 · R3（include/included 键名不一致）** —— 不丢数据但元数据死字段，建议在 N2 的还原路由改动中顺带统一键名。
5. **P2 · N3 / N4** —— 设计取舍 + 覆盖式 update 隐患，建议明确需求后再排期，本轮不强制。

> **结论（一句话）**：上轮 5 条中同批去重与规则合并兜底已修，但关系归一化在"AI 合并成功"与"备份还原"两条分支仍漏、内联正则仍无校验，属修半截+新坑，均需补一处 `normalizeRelationships`/`new RegExp` 即可闭环。
