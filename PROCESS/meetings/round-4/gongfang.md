# Round 4 复验报告 · 工坊（数据迁移控）

> 透镜：导入合并 / 备份还原 / 创意工坊预设 —— 专挑「数据丢失、还原不全、字段未归一化、预设不生效」
> 方法：严格只读源码分析（`src/`），**未修改任何源码**。先回归 Round 3 N2，再挖新坑。
> 版本：源码实际为准（`package.json` 仍为占位 `0.1.0`）。
> 范围：`src/app/api/import/*`、`src/app/api/projects/import/route.ts`、`projects/[id]/backup|export|restore`、`presets/*`、`src/lib/relations.ts`。

---

## ① 回归确认（Round 3 · 工坊 N2 关系归一化是否稳）

**结论：已修且稳，无回归。**

`normalizeRelationships` 已抽到共享模块 `src/lib/relations.ts:13`。三处写入路径全部复用：

| 路径 | 行号 | 状态 |
|------|------|------|
| `import/commit/route.ts` 新卡 | `:423` `relationships: normalizeRelationships(char.relationships)` | ✓ |
| `import/commit/route.ts` 规则合并兜底 | `:151-154` `ruleMergeChar` 内 old/new 双归一化 | ✓ |
| `import/commit/route.ts` AI 合并成功分支 | `:460` `relationships: normalizeRelationships((merged as any)?.relationships)` | ✓（但见 P1-1 隐患） |
| `projects/import/route.ts` 备份还原 | `:101` `relationships: normalizeRelationships((c as any).relationships)` | ✓（Round 3 唯一漏网点已闭环） |

- 还原路径 `strip(c, [...])` 不剥离 `relationships`（`:100`），`relationships:` 在 `:101` 显式覆盖 spread，旧 `{target,type}` → 新 `{targetName,relation}` 正确。**无回归。**
- Round 3 其余三项（AI 合并归一化、内联正则校验、include 过滤功能）保持已修状态。

**遗留死字段（Round 3 X1，仍 P2，见 P2-X1）：** `backup/route.ts:56` 仍写 `included`（带 d），还原端读 `bundle.include`（无 d），从未消费。

---

## ② P0 必修（按影响排序）

**本轮工坊透镜无「必现整段数据丢失 / 还原不可用」级 P0。** 所有还原路径的标量字段（含 `postProcessingRules`、`llmConfig`、`appliedPresets`、`authorNote`、`buildConfig`）均随 `project` 对象透传、未被 `strip` 丢弃（`projects/import/route.ts:33-37` 只剥离子表与 id/时间戳），故**项目级正则规则与 LLM 配置在备份还原中实际不丢**。下列为真正会丢字段的 P1。

---

## ③ P1 建议（数据丢失 / 预设不生效）

### P1-1 — AI 合并成功分支会清空已存在角色的关系（导入合并字段遗漏）
- **文件:行号**：`src/app/api/import/commit/route.ts:457-461`
- **问题**：AI 合并成功时 `data: { ...merged, name, projectId: undefined, relationships: normalizeRelationships((merged as any)?.relationships) }`。`merged` 是模型返回卡面，而角色提取 prompt 的输出模板（`:278`）**未列出 `relationships`**，模型常省略该字段 → `merged.relationships` 为 `undefined` → `normalizeRelationships(undefined)` 返回 `[]` → 把已存在角色的历史 `relationships` **整体清空**。规则合并兜底 `:151-154` 正确保留，唯独 AI 路径丢。
- **可复现步骤**：项目已有角色「林羽」且含 `relationships:[{targetName:"苏挽月",relation:"恋人"}]`；用「导入文本」喂入一段重定义林羽背景但模型未回显关系的文本 → 同名触发 AI 合并（`:444` 成功分支）；合并后查库 `林羽.relationships === []`。
- **建议修复**：合并 old/new 关系而非用 AI 单源覆盖：
  ```ts
  relationships: normalizeRelationships([
    ...(pair.old?.relationships || []),
    ...((merged as any)?.relationships || []),
  ])
  ```
  （`pair.old` 在 `:399` 已含 `existing.relationships`，可直接取用；AI 回显则叠加、未回显则保留原值。）
- **影响范围**：所有「导入文本并触发 AI 合并」的存量角色，关系图断裂、关系字段静默归零（工坊透镜高优，命中任务点名「AI 合并字段遗漏」）。

### P1-2 — 角色预设套用丢失 relationships / aliases / abilities 等字段
- **文件:行号**：`src/app/api/presets/[id]/apply/route.ts:101-114`
- **问题**：`character` 类型预设只写 `name/role/background/personality/appearance/tags`（`content` 即 `c`，但仅取这 6 个键）。预设里常见的 `relationships`、`aliases`、`abilities`、`age`、`gender`、`timeline`、`hiddenMotives`、`currentStatus`、`arcProgress` **全部丢弃**，且 `relationships` 未走归一化。
- **可复现步骤**：构造 `type:"character"` 预设，`content:{ name:"苏挽月", relationships:[{targetName:"林羽",relation:"宿敌"}], aliases:["挽月"] }` → `POST /api/presets/[id]/apply` → 查新建 `CharacterCard`：`relationships=[]`、`aliases=[]`。
- **建议修复**：展开除 `id` 外的全部字段并归一化关系：
  ```ts
  data: { projectId, ...c, id: undefined,
    relationships: normalizeRelationships((c as any).relationships),
    aliases: Array.isArray(c.aliases)?c.aliases:[],
    age: String(c.age||"未知"), gender: String(c.gender||"未知"),
  } as any
  ```
  （需在文件头 `import { normalizeRelationships } from "@/lib/relations";`）
- **影响范围**：创意工坊分享的「角色卡预设」套用后缺关系/别名，等于半残卡（命中任务点名「预设导入不应用」）。

### P1-3 — 正则预设 apply / import 不校验 pattern，非法正则静默成「死规则」
- **文件:行号**：`src/app/api/presets/[id]/apply/route.ts:117-139`（apply 重写逻辑无 `new RegExp` 校验）；`src/app/api/presets/import/route.ts:22-33`（导入不校验 `content.rules[].pattern`）
- **问题**：apply 的 regex 分支仅 `if (!r.name || !r.pattern) continue;`（`:125`）——只判非空，**不编译校验**。若酒馆分享的 `.preset.json` 含非法正则（如 `"[未闭合"`），它被原样写进 `project.postProcessingRules`。生成时 `applyRegexRules`（`src/core/post-process/regex.ts:18`）用 `try/catch` 吞掉编译错误、仅 `console.error` 跳过，**前端无任何提示**，规则等于不存在。
  - 对照：内联编辑 `ProjectConfigPanel.tsx:110-119` `saveRules` 已逐条 `new RegExp` 校验拦截（Round 3 R4 已修）。**唯独预设链路漏校验。**
- **可复现步骤**：`type:"regex"` 预设 `content.rules=[{name:"X",pattern:"([",replace:""}]` → apply → `project.postProcessingRules` 含该规则 → 跑一次「写章」，控制台报 `[regex-postprocess] 规则 "X" 编译失败`，正文未被该规则处理，用户无感。
- **建议修复**：在 apply 的 regex 分支循环内（`presets/[id]/apply/route.ts:124`）对每个 `r` 做：
  ```ts
  if (!r.name || !r.pattern) continue;
  try { new RegExp(r.pattern, r.flags || "g"); } catch { /* 跳过并记录，不写入 */ continue; }
  ```
  （可选：同时在 `presets/import/route.ts` 导入期提示非法 pattern，避免脏预设入库。）
- **影响范围**：所有经创意工坊分发的正则预设，一旦含笔误正则 → 套用后「正则规则不生效」，且难以自查（命中任务点名「正则规则不生效」）。

---

## ④ P2 优化（非阻断）

### P2-X1 — 备份 `included` 死字段（Round 3 遗留）
- **文件:行号**：`src/app/api/projects/[id]/backup/route.ts:56` 写 `included`；还原读 `bundle.include`（`projects/import/route.ts:27`）；`src/components/workspace/ImportDialog.tsx:51` 用复选框覆盖 `bundle.include`，从不读 `included`。
- **问题**：备份包自带的导出范围选择（`?include=`）写入 `included` 后**无人消费**；ImportDialog 默认全选（`:32`），导入一个「仅导出角色」的备份包会默认把章节等也勾上 → 可能导入超出预期范围。
- **可复现**：`GET /api/projects/[id]/backup?include=characters,lorebook` → 包体 `included:["characters","lorebook"]`；ImportDialog 打开该包，复选框默认 8 项全勾。
- **建议修复（纯逻辑）**：删掉 `:56` 的 `included`，或改为 `include` 与还原端对齐；若希望「导入默认沿用备份范围」，让 ImportDialog 初值读 `bundle.included || 全选`。

### P2-2 — 备份还原丢失分支 forkPointNodeId
- **文件:行号**：`src/app/api/projects/import/route.ts:48`
- **问题**：`strip(b, ["id","projectId","createdAt","forkPointNodeId"])` 剥掉 `forkPointNodeId` 且在 pass2 未重映射 → 还原后分支的 fork 起点引用为 `null`。
- **建议修复**：建分支时收集 `forkMap[b.forkPointNodeId]=cb.id`，pass2 回填 `forkPointNodeId`（仿照 `branchId` 重映射 `:66`）。

### P2-3 — 备份还原 storyNode.revisionCount 被硬编码 0
- **文件:行号**：`src/app/api/projects/import/route.ts:59`
- **问题**：`revisionCount: 0` 覆盖原值，原项目的章节修订计数丢失。
- **建议修复**：`revisionCount: n.revisionCount ?? 0`。

### P2-4 — 导入/预设的世界书 subFields 结构化字段被丢弃
- **文件:行号**：`src/app/api/import/commit/route.ts:529-534`（新词条 `loreNewData` 未写 `subFields`，`buildLoreContent` 把 subFields 摊平进 `content`）；`src/app/api/presets/[id]/apply/route.ts:87-96`（worldview/lorebook 分支只写 `content/keys/depth`）。
- **问题**：带结构化 `subFields`（时代/法则/势力等）的词条经导入或预设套用后，结构化字段丢失、仅留摊平文本，后续无法按字段检索。
- **建议修复**：`loreNewData` 增加 `subFields: (entry.subFields && typeof entry.subFields==="object")?entry.subFields:{}`；预设写入同样携带 `subFields`。

### P2-5 — 小说文本导出中文文件名 header 缺 `filename*=UTF-8''`
- **文件:行号**：`src/app/api/projects/[id]/export/route.ts:90,104,117,166`（html/epub/docx/md-txt 四处均仅 `filename="${encodeURIComponent(filename)}"`）
- **问题**：备份路由（`backup/route.ts:64`）已用 RFC 5987 `filename*=UTF-8''` 正确支持中文；但本文本导出只给 `filename=`（百分号编码 UTF-8），部分浏览器/下载器对非 ASCII `filename` 处理不一致，中文项目名可能乱码或下载失败。
- **建议修复**：统一为 `filename="fallback.ascii"; filename*=UTF-8''${encodeURIComponent(filename)}`（参照 backup 路由写法）。

---

## ⑤ 一句话结论

- **回归**：Round 3 N2（关系归一化）已稳，三处写入路径全复用 `src/lib/relations.ts`，无回归。
- **本轮 P1（均属「字段遗漏 / 预设不生效」，命中任务点名项）**：① AI 合并成功分支清空存量角色 `relationships`（`commit/route.ts:457-461`）；② 角色预设套用丢 `relationships/aliases/abilities` 等（`apply/route.ts:101-114`）；③ 正则预设 apply/import 不校验 `pattern`，非法正则静默成死规则（`apply/route.ts:117-139` + `presets/import/route.ts`）。
- **P2**：备份 `included` 死字段、分支 forkPoint 丢失、revisionCount 归零、世界书 subFields 摊平丢失、文本导出中文文件名 header 不一致。
- 无 P0（项目级标量配置在还原中实际不丢，已逐字段核对 `strip` 列表确认）。
