# Round 3 QA 报告 · 工坊（数据迁移控）

> 透镜：导入合并是否干净、备份还原是否无损、正则规则是否安全可靠
> 方法：严格只读源码分析（`src/`），**未修改任何源码**。先回归 Round 2 的四项 P1，再挖新坑。
> 版本：按 task 指向 v0.46.65（`package.json` 仍是 `0.1.0` 占位，以源码实际为准）。

---

## ① 历史修复回归核实（逐项：预期 / 实际 file:line / 结论）

### 1. AI 合并成功路径漏归一化（Round 2 · N1，原 P1）
- **预期**：AI 合并成功写入分支 `characterCard.update` 的 `data` 已对 `relationships` 走 `normalizeRelationships`，且 `mergeOneBatch` 成功分支也接归一化。
- **实际**：
  - `commit/route.ts:475` `relationships: normalizeRelationships((merged as any)?.relationships)` —— AI 成功分支 `update` 时**已显式归一化**。`...merged`（含裸 `relationships`）在 :472 展开后，被 :475 覆盖为归一化结果。✓
  - 注意：`mergeOneBatch` 返回处 `:112` 仍是裸 `m.result`，未归一化；但因落库只用 :475 的结果，该裸返回**不构成实际漏洞**。Round 2 建议的"在 :112 一劳永逸"没采用，但功能已闭环。
- **结论：已修。**（AI 成功分支 + 兜底 `ruleMergeChar` :187 + 新卡 :438 三条路径均归一化。）

### 2. 内联正则无校验（Round 2 · R4，原 P2）
- **预期**：保存前对全部规则 pattern 跑 `new RegExp` 校验，非法阻止保存。
- **实际**：`ProjectConfigPanel.tsx:110-119` `saveRules` 内 `for (const r of rules)` 遍历，**每条** `r.pattern` 跑 `new RegExp(r.pattern, r.flags||"g")`，`catch` 即设提示并 `return` 阻断保存。新增弹窗 `confirmNewRule` :175-180 也有校验。两条写入入口均已覆盖。
- **结论：已修。**（内联编辑 `updateRule` 仅改 state，最终必经 `saveRules` 校验，无遗漏路径。）

### 3. 备份 include 键名不一致（Round 2 · R3，原 P2）
- **预期**：导出/还原键名统一，include 选择不被静默丢弃。
- **实际**：
  - 导出端 `backup/route.ts:56` 写 **`included`**（带 d）。
  - grep 全 `src`：`.included` / `included` **仅此一处写入**，无任何读取点 → `included` 是**纯死字段**，无人消费。
  - 实际过滤走另一条链路：前端 `ImportDialog.tsx:51` 在导入时把用户勾选项写入 **`bundle.include`**（无 d）→ 还原路由 `projects/import/route.ts:26` 读 **`bundle.include`**。键名一致，**过滤功能正常生效**。
- **结论：功能已无数据丢失风险（实为已修）。** 残留仅是备份包里的 `included` 死元数据（写入但永不读），属冗余/误导，非阻断。

### 4. 备份还原漏归一化（Round 2 · N2，原 P1）
- **预期**：`projects/import/route.ts:95-99` 角色还原时 `relationships` 应走 `normalizeRelationships`（旧 `{target,type}` 转 `{targetName,relation}`）。
- **实际**：`projects/import/route.ts:95-99`
  ```ts
  for (const c of p.characters || []) {
    await prisma.characterCard.create({ data: { ...strip(c, ["id","projectId","createdAt","updatedAt"]), projectId: newPid } });
  }
  ```
  `strip` 不剥离 `relationships`，原样落库；该路由**未引入** `normalizeRelationships`（该函数仅定义在 `commit/route.ts`）。旧备份 `{target,type}` 还原后下游只认 `targetName/relation`，关系显示「?(?)」、关系图断裂。复扫全 `src` 写入 `relationships` 的路径：仅 `commit/route.ts` 三处已归一化；**本还原路径是唯一的漏网**。
- **结论：未修（仍是 P1）。**

---

## ② 仍待修 / 新发现问题（P0/P1）

### N2（续）— P1：备份还原角色关系未归一化
- **现象 / 根因**：见上 ①-4。`projects/import/route.ts:95-99` 未归一化，且 `normalizeRelationships` 未共享到还原路由。
- **纯逻辑 vs 端到端**：**纯逻辑可修**。最小改动——把 `normalizeRelationships` 提到 `lib/`（或在本文件内联一份），还原循环改为
  ```ts
  data: { ...strip(c,[...]), relationships: normalizeRelationships(c.relationships), projectId: newPid }
  ```
  tsc + 单测（构造一条 `{target,type}` 旧卡，断言落库后变 `{targetName,relation}`）即可验，无需真跑整链。
- **影响**：跨版本迁移、旧备份还原必现，威胁数据完整性（工坊透镜高优先）。

### 新发现 · X1 — P2（残留死字段，非阻断）：备份 `included` 永不读取
- **现象**：`backup/route.ts:56` 写 `included`，但全代码库无读取。导入端用前端 `ImportDialog` 重注入 `bundle.include`，备份自带的导出范围选择被完全忽略。
- **根因**：导出元数据与还原读取脱节；还原端实际依赖前端二次勾选而非备份自带范围。
- **纯逻辑 vs 端到端**：
  - 若只清死字段 → **纯逻辑**（删 `backup/route.ts:56` 的 `included` 或统一为 `include`）。
  - 若想"导入默认沿用备份时导出的范围" → **需端到端**（ImportDialog 读 `bundle.included` 预勾选复选框，涉及前端语义）。但当前重勾选行为更安全（用户二次确认），建议**保持现状，仅清死字段**。
- **影响**：仅元数据冗余/误导，无数据丢失。

### 观察（不列入 P，防 padding）
- `commit/route.ts:112` 仍裸返回 `m.result` 未归一化：功能已被 :475 覆盖，无需改，但属代码异味（建议在 :112 统一处理以彻底消除认知负担）。记一笔，不强求。
- `characters/route.ts:37/64`、`characters/[id]/route.ts:45` 直接写 `body.relationships`（来自 `CharacterDialog` 表单，已是规范格式），非导入路径，不在本透镜范围，未深入。

---

## ③ 建议（优先级 / 落地方式）

1. **P1 · N2（还原归一化）** —— 本透镜最高优先，且是 Round 2 遗留的"修半截"。把 `normalizeRelationships` 提到 `lib/relations.ts` 共享，`commit/route.ts` 与 `projects/import/route.ts` 双双引用；还原循环 :95-99 接归一化。**纯逻辑，tsc + 单测可闭环**，建议本轮修。
2. **P2 · X1（清死字段）** —— 顺手把 `backup/route.ts:56` 的 `included` 改为 `include`（与还原端对齐）或直接删除；若选统一键名，可让 `ImportDialog` 未来读取做默认勾选，但本轮不必改前端。**纯逻辑。**
3. **不强制项** —— `commit/route.ts:112` 裸返回归一化、AI 成功分支覆盖式 `update` 可能丢字段（Round 2 的 N4），属内容正确性隐患，但非数据迁移阻断，列入观察。

> **一句话结论**：Round 2 四项的「AI 合并归一化」「内联正则校验」两项已修、include 过滤功能已正常（仅留死字段）；唯一未修且仍 P1 的是**备份还原路径的 `relationships` 未归一化（N2）**——纯逻辑可修，建议本轮闭环。
