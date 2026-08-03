# 股东·工坊（数据迁移控）— Round 5 L1 只读复验报告

- HEAD: v0.46.67 (commit 0a62a1f) ｜ 透镜: 备份导出/导入 · 导入合并 · 预设应用 · 正则规则校验
- 复验范围: `src/app/api/projects/import`、`projects/[id]/backup`、`import/commit`、`presets/[id]/apply`、`core/post-process/regex.ts`、`core/rules.ts`、Prisma schema、UI `ProjectConfigPanel.tsx`
- 测试证据: `SAFE_DELETE_DISABLE=1 npx vitest run src/core/babylore` → 1 文件 / 2 测试全过（babylore 自测无回归，但本报告问题均在 API 路由层，该套件未覆盖）。

---

## 一、历史修复复验（Round 3 N2 关系归一化）

**结论：收敛，无 P0/P1。**

`normalizeRelationships` 在两条导入路径对 `CharacterCard.relationships` 一致生效：
- `src/app/api/import/commit/route.ts:423`（新卡）、`:460`（AI 合并回写）、`:151-154`（`ruleMergeChar` 兜底合并）。
- `src/app/api/projects/import/route.ts:101`（备份还原角色卡）。

经 Prisma schema（`src/generated/prisma/internal/class.ts` Line 23 内联 schema）确认：**`LorebookEntry` 无 `relationships` 字段**（仅有 `keys/content/depth/parentId/relatedEntryIds`）。故"世界书关系归一化"本就不适用——工坊 N2 在角色卡上已全链路一致，无需补丁。

---

## 二、新坑（数据迁移透镜）

### ① P2 — 备份导出 `included` 与导入读取 `include` 键名不一致（include 选择无法往返）
- **现状**：导出 `src/app/api/projects/[id]/backup/route.ts:56` 写 `included: Array.from(allowed)`；导入 `src/app/api/projects/import/route.ts:27-29` 读 `bundle.include`。键名不匹配 → 重导部分备份时 `bundle.include` 为 undefined → `include=null` → 走"全量"分支。当前因部分导出仅填充被选中的关系字段（其余字段在 JSON 中缺省），`p.xxx||[]` 自然为空，**未造成数据错乱**，但内嵌的选择元数据被静默丢弃，`want()` 过滤逻辑对真实备份形同虚设。
- **期望**：导出/导入的"选择性包含"键名统一、可往返；`projects/import` 的 `want()` 真正对备份生效。
- **具体修法**：备份导出统一改用 `include` 键（或在导入侧改读 `included`）。低风险但属"include 键名不一致"遗留隐患——一旦未来导出改为包含全部关系字段（含空数组），该 filter 将立即失效并误导入空数据，宜尽早对齐。

### ② P2 — `.nfproject` 还原无 `maxDuration`、无进度、无事务，大备份可靠性存疑（对应坑⑤）
- **现状**：`src/app/api/projects/import/route.ts` **未设 `maxDuration`**（对比 `import/commit/route.ts:15` 已设 300）；全部用逐条 `prisma.xxx.create`（行 40/47/58/77/98/109/114/119/124），**无 SSE、无进度事件、无 `$transaction` 回滚**。几百章逐条 await，极易超过默认超时上限；中途失败已建部分不回滚，产生"半截项目"。
- **期望**：大备份导入有超时保护、分批进度反馈、失败可回滚/重试。
- **具体修法**：补 `export const maxDuration = 300`；章节/词条改用 `createMany` 或分批 + `try/catch` 记录已建 id 以便补偿回滚；若需进度，参照 `import/commit` 的 `send({type:'progress',...})` 改 SSE 流式返回。

### ③ P2 — 预设 `character` 类型套用不查重 → 重复套用产生重复角色卡（对应坑⑥）
- **现状**：`src/app/api/presets/[id]/apply/route.ts:101-114` 直接 `prisma.characterCard.create`，**未按 name 去重**；而同文件 worldview/lorebook 已按 `category+title` 去重（行 79 / 146），regex 按 `name` 去重（行 122-133）。同一角色预设套用两次 → 两张同名卡。
- **期望**：预设套用幂等，同名角色去重（跳过/更新），与世界观/正则保持一致。
- **具体修法**：套用前 `findFirst({where:{projectId, name:{equals:c.name, mode:'insensitive'}}})`，存在则跳过或 `update`，缺失才 `create`。

### ④ P2 — 正则运行时 `applyRegexRules` 静默吞掉非法正则（防御纵深缺口，对应坑④）
- **现状**：`src/core/post-process/regex.ts:17-22` 对非法 `new RegExp(pattern, flags||'g')` 仅 `console.error` 后跳过该规则。UI 侧 `ProjectConfigPanel.tsx:109-115`（保存前全量校验）、`:171-178`（新增模态校验）均已校验，故正常路径存储干净；但**经备份/预设注入的非法正则会在此无声失效、用户无任何提示**。
- **期望**：非法正则应在存储或运行时给出明确告警，而非静默丢弃。
- **具体修法**：在 `applyRegexRules` 收集失败规则名并以结构化形式返回/告警（或于应用/导入处复用 UI 同一校验并向前端暴露错误文案）；至少将静默 `catch` 改为累计告警并体现在生成结果提示中。

---

## 三、总结（≤150字）

本轮 L1 复验：Round 3 N2 关系归一化在 import/commit 与 projects/import 对角色卡一致生效，世界书因无 relationships 字段本不适用——历史修复收敛，无 P0/P1。新挖 4 条 P2：①导出 `included`/导入 `include` 键名不一致；②`.nfproject` 还原无超时/进度/事务，大备份易半截失败；③预设 character 套用不查重致重复卡；④正则运行时静默丢弃非法规则。均建议下轮排期修复。
