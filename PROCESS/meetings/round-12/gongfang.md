# Round 12 只读复验报告 · 工坊透镜（gongfang-r12）

- 项目：novel-forge ｜ HEAD：`1cee64d`（Round 11 落地）｜ 复验范围：备份/导入合并、创意工坊预设、正则安全
- 方法：纯只读（Read/Grep），未改动 src/、changelog/version/MEMORY。

---

## 一、回归结论（Round 11 工坊 2 个 P2 纵深防御）

### A.1 forbidden-checker.ts 复用 isLikelyUnsafeRegex 做 ReDoS 预判 —— **PASS**
- 证据 `src/lib/forbidden-checker.ts:15` 导入 `@/core/post-process/regex` 的 `isLikelyUnsafeRegex`；`:168-171` 编译通过后调用，命中即 `throw new Error("正则存在灾难性回溯风险，已拒绝（${unsafe}）")`。
- 抛出被 `:240-253`（句式）与 `:283-296`（身体模板）两处 `try/catch` 捕获，记录为 `severity:"info"`、提示跳过、**不崩溃**。
- 内置规则（如 `/不是.{1,30}而是/u`）均为有界量词，不会被误判；仅 user 可控正则走此路径，符合纵深防御意图。

### A.2 presets/[id]/apply 入口前移 isLikelyUnsafeRegex 校验、命中 422 拦截不写库 —— **PASS**
- 证据 `src/app/api/presets/[id]/apply/route.ts:3` 导入 `isLikelyUnsafeRegex`；`:2` 用 `import { jsonError as apiJsonError } from "@/lib/api"` 别名，规避与 `:1` `@/lib/api-error` 的 `jsonError(e:unknown)` 同名冲突。
- `:170-179` 在读取 project、任何 `prisma.*.create/update` **之前**遍历 `content.rules` 做预判，命中即 `return apiJsonError(msg, 422)` → **先于写库返回**，满足“422 不写库”。
- 别名签名核对：`@/lib/api:17` `jsonError(message, status=500)`，与 `apiJsonError(msg,422)` 调用一致；`@/lib/api-error:105` `jsonError(e)` 单参，二者不冲突。

---

## 二、新挖问题清单（工坊透镜）

### 【P0】含故事分支的 .nfproject 备份导入必然整体失败
- 文件:行：`src/app/api/projects/import/route.ts:99`（配合 `prisma/schema.prisma:213`）
- 现象：只要备份含 `storyBranches`，导入返回 500、且因外层 `$transaction` 回滚 → **完全不创建任何项目**（备份静默失败）。
- 根因：`:99` 用 `strip(b, ["id","projectId","createdAt","forkPointNodeId"])` 把 `forkPointNodeId` 从建分支数据里删掉，但 schema 中 `forkPointNodeId String`（**非可选、无默认值**）。`tx.storyBranch.create` 缺必填字段 → Prisma 抛 “Missing a required value” → 事务回滚。
- 建议改法：建分支时给占位值，再在 3.5 回填处统一更新；或把 `forkPointNodeId` 移出 strip 列表并即时用 `nodeMap` 映射（分支创建需排在节点 pass1 之后，或先建空值再回填）。最简：`create` 时 `forkPointNodeId: nodeMap[b.forkPointNodeId] ?? b.forkPointNodeId ?? ""`（字符串必填），回填逻辑保持不变。

### 【P1】parentBranchId 未重映射 → 分支层级悬空
- 文件:行：`route.ts:99`（以及缺 remap）／ schema `parentBranchId String?`（无 @relation，纯字符串）
- 现象：导入后子分支的 `parentBranchId` 仍指向**旧备份的 branch id**，新库无此 id → 分支树在 UI 断裂。
- 根因：strip 列表未含 `parentBranchId`，且 `branchMap` 仅用于 `forkPointNodeId`/`storyNode.branchId` 回填，未对 `parentBranchId` 做 `branchMap[old]` 映射。
- 建议改法：建分支前缓存 `branchParentMap[b.id]=b.parentBranchId`，填充数据与 forkPoint 同期用 `branchMap` 重映射（旧 id 不存在则置 null）。

### 【P1】forkPoint 重映射依赖“同时导入章节”，选择性导入会丢拓扑
- 文件:行：`route.ts:126-136`
- 现象：仅导入 `branches` 而不导入 `chapters` 时，`nodeMap` 为空，`if (oldFork && nodeMap[oldFork] && …)` 恒假 → 分叉点 **静默丢弃**。
- 根因：3.5 回填强依赖节点 pass1 建好的 `nodeMap`，但 `want("chapters")` 为 false 时 `nodeMap={}`。
- 建议改法：选择性导入时若 `branches` 含 forkPoint，应提示“分叉点需随章节一并导入”，或允许 forkPoint 指向 null 并在回执标注丢失。

### 【P1】交互事务超时 60s 相对 maxDuration 300s 偏紧
- 文件:行：`route.ts:194`（`{ timeout: 60000 }` vs `:6` `maxDuration=300`）
- 现象：超大备份（数千章节串行 `await tx.storyNode.create`/update）可能超过 60s → 事务超时回滚，导入失败。
- 建议改法：按规模把 timeout 提到 120000–300000；或改批处理（createMany + 内存建 map）减少往返。

### 【P2】.preset.json 对外部酒馆格式无迁移垫片
- 文件:行：`src/app/api/presets/import/route.ts:11-13` + FE `src/app/workshop/page.tsx:180-184`
- 现象：本机 `.preset.json` 格式自洽（`{schema,preset:{type,title,...}}` 可往返）。但外部酒馆 `.preset.json`（含 `prompt`/`temperature`/`regexes`）缺 `type/title` → 400 泛错，无自动转换。
- 建议改法：导入入口识别 `prompt`/`regexes` 形态并映射到 `regex`/`api_config` 预设；或返回更明确的“非本格式”提示。

### 【P2】deepMergeLLMConfig 内层对象仍按顶层白名单过滤
- 文件:行：`route.ts:30-46`
- 现象：已知键下的嵌套对象（如未来 `llmConfig.xxx:{...}`）其子键也会被 `LLM_CONFIG_KEYS` 顶层白名单剔除，可能误删合法子键。
- 建议改法：递归时仅在“已知对象型键”内做白名单；或改为“已知键整体放行”，避免扁平白名单误伤。

### 【P2】import 幂等仅依赖 origId，无 id 备份可重复建库
- 文件:行：`route.ts:54,202`
- 现象：备份若缺 `project.id`（`origId=null`）则 `importSourceKey=null`，无去重保护，重复导入会成倍复制项目；P2002 兜底也被 `&& importSourceKey` 短路。
- 建议改法：对缺 origId 的备份生成确定性指纹（内容 hash）作为幂等键，或明确文档“无 id 备份不支持幂等”。

---

## 三、小结
- 回归：**A.1 PASS、A.2 PASS**（两处纵深防御均生效，422 先于写库、不崩溃）。
- 新挖：**P0 ×1（分支备份导入整体失败，必修）**、**P1 ×3（parentBranchId 悬空 / forkPoint 选择性丢失 / 事务超时）**、**P2 ×3（外部 .preset.json、深层白名单、无 id 幂等）**。
