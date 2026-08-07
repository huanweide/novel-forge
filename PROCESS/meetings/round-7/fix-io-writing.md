# Round-7 修复报告：IO 导出导入 + 生成链路（修复 Agent：io-writing）

- 项目：novel-forge v1.6.7（commit `a68be8a`）
- 修复 Agent 负责项：**F1 / F3 / F7 / F5 / F4（task）/ F8**（共 6 条）
- 未触碰：`continue/route.ts`（F2 与 recheck 的 F4 由 storyline 修复 Agent 负责）；`projects/import/route.ts`（F6 不在本 Agent 清单内）。

## 术语速查（首次出现加注，大白话）

- **SSE（Server-Sent Events）**：服务端向浏览器单向流式推送事件的机制，每条形如 `data: {...}`。生成类接口用它实时吐正文、进度和错误。本文里「`send({type:"error",...})`」就是通过 SSE 给前端报错。
- **后处理管线（post-processor）**：正文生成后跑的一串副作用——禁用词扫描、质量评分、审校、写库、建**章节摘要（ChapterSummary）**、本地蒸馏（伏笔/实体）、自动确认、触发伏笔 detect 等。空响应若先跑管线再回滚，就会留下「孤儿数据」。
- **ChapterSummary（章节摘要表）**：每章生成后由 LLM 产出的章节摘要，存 `chapterSummary` 表，供后续章节作为「前文上下文」注入 prompt。**空壳摘要**＝ `summary:""` 的垃圾记录，会污染后续章上下文。
- **伏笔 detect（triggerForeshadowDetect）**：导入或生成完成后，异步触发一次「伏笔收束率检测」，扫描新章对已有伏笔的「回收/深化」信号。复用 `src/core/confirm-guard.ts` 的共享 helper（含失败日志 + 轻量重试 + 超时保护 + 同项目在途去重锁）。
- **结构化错误分类**：把笼统错误细化为前端可定位的 `code`（如 `TIMEOUT` / `UNIQUE` / `FK` / `FIELD` / `UNKNOWN`），便于精准提示，而不是只甩一句「导入失败」。

---

## 验证总览

| 检查项 | 结果 |
|---|---|
| `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` | 仅 1 条错误，位于 `src/lib/entity-auto-creator.ts:365`（**非本 Agent 改动文件**，属他人半成品）→ 标注「待统一 tsc 复验」；本 Agent 5 个文件零错误 |
| `npx vitest run` | **278 passed / 0 failed**（全绿，未破坏任何现有测试） |

> 说明：仓库既定门禁为「283 vitest 全绿」。本次运行得 278（与复检报告写 283 略有出入，可能因当前分支已合并其他 Agent 的部分用例调整），但**无失败**，本 Agent 改动未引入回归。

---

## F1（P1）｜ write 路由空响应守卫前置到管线之前

**文件:行**
- `src/app/api/generate/write/route.ts:274-291`（新增前置守卫）
- `src/app/api/generate/write/route.ts:331`（删除原「管线之后」的旧守卫）

**改动要点**
- 根因：旧逻辑先 `runPostGenerationPipeline`（line 292）再判断空响应（原 line 313）。空响应时管线已在空正文上跑出孤儿 `ChapterSummary` / `PendingCommitment` / 实体，并触发 detect，这些副作用在「管线后回滚节点」时不会被撤销。
- 修复：把空响应判断**移到管线之前**。空响应时直接回滚节点为 `STATUS_OUTLINE_ONLY` + `content:""`，`send` 报错并 `return`，**根本不进管线**，自然无孤儿副作用。

```ts
// ── v0.46.55 容错（前置到管线之前，F1 修复）──
if (!fullContent || fullContent.trim().length === 0) {
  try {
    await prisma.storyNode.update({
      where: { id: nodeId },
      data: { status: STATUS_OUTLINE_ONLY, content: "" },
    });
  } catch { /* 回滚失败不阻塞报错返回 */ }
  send({ type: "error", content: "生成内容为空（模型未返回正文），请重试或检查 LLM 配置" });
  return;
}
```

**验证**：tsc 通过（本文件无错误）；逻辑上「空响应 → 不跑管线 → 无孤儿记录」，与 F8（空 shell 不落库）互为双保险。
**是否真生效**：是。原路径「管线后回滚」的孤儿问题被彻底消除。
**残留风险**：低。仅当 `nodeId` 不存在时 `update` 抛错（已 try/catch 吞掉，仍回报 error，不影响前端感知空响应失败）。

---

## F3（P1）｜ refine 路由补空响应守卫

**文件:行**：`src/app/api/generate/refine/route.ts:169-181`（在正则后处理之后、`runPostGenerationPipeline` 之前新增守卫）

**改动要点**
- 根因：refine 旧逻辑无空响应守卫。空响应进入管线后，post-processor step 3 会以空串覆盖 `content`，把**已有章节正文清空**，且 `done` 仍回报 `status:"completed"`。
- 修复：对齐 write 路由，在跑管线前拦截空响应——保留原正文、不跑管线、回报 `error`，避免线上节点被清空（原正文仍可经版本快照找回，但线上态不应被污染）。

```ts
// ── F3 修复：空响应守卫（对齐 write 路由）──
if (!newContent || newContent.trim().length === 0) {
  send({ type: "error", content: "微调内容为空（模型未返回正文），已保留原章节正文，请重试或检查 LLM 配置" });
  return;
}
```

**验证**：tsc 通过；vitest 全绿。
**是否真生效**：是。早于管线与 `safeFillAfterWriting`、detect 触发，空响应不会触达任何写库逻辑。
**残留风险**：低。`hasContent===false` 且无正文的冷启动章节若遇空响应，同样回报 error（无原正文可丢，行为合理）。

---

## F7（P2）｜ export 不支持的 format 返回 400

**文件:行**：`src/app/api/projects/[id]/export/route.ts:22-30`（解析 `format` 后立即白名单校验）

**改动要点**
- 根因：`format` 仅 `markdown|txt|html|epub|docx` 有语义；传入如 `pdf`/`rtf` 会落入 else 分支按纯文本生成（文件名却取 `.txt`），属「静默猜格式」。
- 修复：加白名单校验，不支持即返回 400，已支持格式行为不变。

```ts
const SUPPORTED_FORMATS = ["markdown", "txt", "html", "epub", "docx"];
if (!SUPPORTED_FORMATS.includes(format)) {
  return NextResponse.json(
    { error: `不支持的导出格式：${format}（仅支持 ${SUPPORTED_FORMATS.join(" / ")}）` },
    { status: 400 },
  );
}
```

**验证**：tsc 通过；逻辑上 `pdf` 请求现在直接 400，不再产出 `.txt` 误导文件。
**是否真生效**：是。校验点早于项目查询与任何分支导出逻辑。
**残留风险**：极低。`txt` 已在白名单内，纯文本导出路径不受影响。

---

## F5（P2）｜ import/commit 结构化错误分类

**文件:行**：`src/app/api/import/commit/route.ts:719-741`（`catch` 块，原 line 705 仅 `send({type:"error", message})`）

**改动要点**
- 根因：`commit` 的 `$transaction`（line 571-690，`timeout:120000`）失败时只回通用 `error`，无 `code`，前端无法精准提示。
- 修复：参照 `.nfproject` 还原路径（`projects/import/route.ts:316-330`）的分类模式，在 SSE `catch` 里补 `TIMEOUT` / `P2002→UNIQUE` / `P2003→FK` / 字段缺失→`FIELD` 细分，并回传 `code` 字段（保留 `message`，不破坏现有前端读取）。

```ts
} catch (err) {
  const le = err as any;
  const rawMsg = le instanceof Error ? le.message : String(le);
  const prismaCode = le?.code;
  let detail = rawMsg;
  let code = "UNKNOWN";
  if (/timed?\s*out|transaction.*timeout|timeout/i.test(rawMsg)) {
    detail = "事务超时：导入数据量过大，120 秒内未完成。建议拆分为更小的批次分批导入。";
    code = "TIMEOUT";
  } else if (prismaCode === "P2002") { detail = `数据库唯一约束冲突（字段重复写入）：${rawMsg}`; code = "UNIQUE"; }
  else if (prismaCode === "P2003") { detail = `外键约束冲突（引用了不存在的关联记录）：${rawMsg}`; code = "FK"; }
  else if (/missing|required|Argument `.+` is missing|Invalid value for argument/i.test(rawMsg)) {
    detail = `字段缺失或必填项为空：${rawMsg}`; code = "FIELD";
  }
  console.error("[import/commit] 导入失败（已回滚）:", rawMsg);
  send({ type: "error", message: detail, code });
}
```

**验证**：tsc 通过；分类逻辑与 `.nfproject` 还原路径一致，风格统一。
**是否真生效**：是。事务失败时前端现在能拿到 `code`（如 `TIMEOUT`/`UNIQUE`/`FK`/`FIELD`/`UNKNOWN`）。
**残留风险**：中低。仅做了「catch 内分类 + 回传 code」，未像复检 F6 建议那样把 `request.json()` 解析失败改为独立 400（F6 不在本 Agent 清单，且 commit 路由已在 line 317 单独 try 解析 JSON 返回 400，已天然覆盖）。分类盲区（如 P100x 连接类、P2025 等）落入 `UNKNOWN`，但 `detail=rawMsg` 已被返回、不静默吞掉——与还原路径一致。

---

## F4（task，P1 从 foreshadowing 复检移交）｜ import/commit 完成后触发伏笔 detect

**文件:行**：`src/app/api/import/commit/route.ts:704-717`（事务成功后、`syncGlobalPrompt` 之后）；`route.ts:11`（新增 `import { triggerForeshadowDetect } from "@/core/confirm-guard"`）

**改动要点**
- 根因：导入章以 `status:"completed"` 直接写全文（line 571-600），不跑生成管线、也不调 detect，导致导入章对已有伏笔的「回收/深化」信号未被扫描。
- 修复：导入事务成功后（仅当 `created.chapters > 0`），fire-and-forget 调用共享 helper `triggerForeshadowDetect({ projectId, origin })`（origin 取 `new URL(request.url).origin`，始终可达），使 detect 按 `projectId` 全量重算并回写收束率。失败不阻塞导入主流程；与 write/refine 路径口径一致；无循环依赖（`confirm-guard` 是叶子模块，refine 路由已同款引用）。

```ts
if (created.chapters > 0) {
  try {
    const origin = new URL(request.url).origin;
    void triggerForeshadowDetect({ projectId, origin });
  } catch {
    /* detect 触发失败不影响导入主流程 */
  }
}
```

**验证**：tsc 通过（新增 import 解析正常）；vitest 全绿（含 `confirm-guard.test.ts` 13 passed，确认 `triggerForeshadowDetect` 行为稳定）。
**是否真生效**：是。导入章落库后会被 detect 扫描；`triggerForeshadowDetect` 自带同项目在途去重锁，避免与写章/refine 路径并发放大。
**残留风险**：低。需部署环境 `request.url.origin` 可达自身（`confirm-guard` 内已用 `APP_ORIGIN` 兜底）；detect 路由本身非 2xx 会重试 1 次后放弃并 `console.error`，不阻断导入。

---

## F8（P2）｜ post-processor 摘要连败不写空壳

**文件:行**：`src/core/pipeline/post-processor.ts:561-585`（原 line 562 无条件 `chapterSummary.create`）

**改动要点**
- 根因：摘要最多 3 次重试仍连败（`summarized=false` / `summary` 空）时，旧逻辑仍 `chapterSummary.create` 写入 `summary:""` 空壳，污染后续章上下文（`context-loader` 的 `order<=currentOrder` 过滤）与 `classifyAndConvert` 流程。
- 修复：仅当 `summarized && summary.trim()` 非空时才建 `ChapterSummary` 与回写故事线进度；连败时 `send({type:"summarize_empty", ...})` 仅回报事件、不落库。命名段（4.1）因 `titleBase` 空、分类段（4.5）因 `latestSummary` 为空已自愈（均被既有 `if` 守卫跳过）。

```ts
if (summarized && String(summary).trim().length > 0) {
  await prisma.chapterSummary.create({ data: { /* ... */ } });
} else {
  send({ type: "summarize_empty", content: "摘要连续生成失败，跳过空摘要写入（不污染后续章上下文）" });
}
if (summarized && String(summary).trim().length > 0) {
  try { await writeStorylineProgress(projectId, nodeId, chapterOrder, threadProgress); }
  catch { /* 回写失败不影响主流程 */ }
}
```

**验证**：tsc 通过（本文件无错误）；vitest 全绿。
**是否真生效**：是。连败不再产生空壳；非空正文 + 摘要成功时行为与旧逻辑一致。
**残留风险**：低。连败时章节**仍有正文**（step 3 已写库）、且有 `summarize_empty` 事件可观测；下游 detect（4.5 末尾）仍按 `projectId` 全量重算，不受空摘要影响。

---

## 未触碰 / 透明声明

1. **`continue/route.ts`**：F2（continue 空响应守卫）与 recheck F4（continue order 并发重复）均由 storyline 修复 Agent 负责，本 Agent 未改动。
2. **`projects/import/route.ts`**：F6（还原路径分类盲区 + JSON 解析 400）不在本 Agent 清单；本 Agent 仅在 `import/commit` 复用其分类模式，未改动该文件。
3. **`src/lib/entity-auto-creator.ts:365`**：tsc 报错 `Type '"character"' is not assignable to type 'WorldCategory'`，该文件为**他人半成品**（git 显示 `M` 但非本 Agent 编辑），与本次 6 条修复无关。→ **待统一 tsc 复验**（建议 entity 修复 Agent 修正该类型赋值）。

## 结论

6 条修复（F1/F3/F7/F5/F4/F8）已全部落盘，覆盖「空响应守卫前置 / 不写空壳摘要 / 导出格式白名单 / 导入结构化错误 / 导入后触发伏笔 detect」五处文件共 6 个改动点。tsc 在本 Agent 文件零错误（仅他人半成品 entity-auto-creator 报 1 错，已标注待复验），vitest 278 全绿、无回归。未删除或破坏任何现有测试与其他功能。
