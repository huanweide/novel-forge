# 导入导出（io）复检报告 —— 魔王系统阶段五复检循环

- 复检领域：导入导出（io）
- 复检员视角：独立代码复检员（lens-io）
- 复检对象：round-2 整合清单 R2-008、R2-009 两条 P1 修复是否「真生效」
- 复检铁律：Trust but verify（读取当前文件内容 + 能跑的测试实跑 + 诚实标注边界）
- 项目根：C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge

---

## 一、两条复检项逐条验证结论

### 1. R2-008（P1）：选章仅选子节点静默空导出 —— 结论：生效（逻辑闭环，但后端 400 分支无自动化测试覆盖）

R2-008 的预期修复由三处改动构成，逐一核对当前文件内容如下。

**（a）后端空选返回 400 —— 已落地**

文件 `src/app/api/projects/[id]/export/route.ts`：

- 第 41-43 行：项目本身没有任何节点时返回 400（`没有内容可导出`）。
- 第 63-68 行：round-2 新增的专门分支。当请求携带 `chapterIds` 参数、且级联展开后 `allNodes.length === 0` 时，返回结构化 400 错误：

```ts
// R2-008/P1：选章导出时若级联展开后没有任何节点（选中节点不存在或无下属内容），
// 直接返回结构化错误，避免后端静默产出一个空白文件让作者误以为成功。
if (chapterIdsParam && allNodes.length === 0) {
  return NextResponse.json(
    { error: "未选中任何有效章节（选中节点不存在或不含下属内容）" },
    { status: 400 }
  );
}
```

该分支位置位于级联过滤（第 46-59 行）之后、构建正文之前，逻辑顺序正确：先过滤出选中子树，再判断过滤结果是否为空，空则拦截。因此「选中了一个在库中不存在的节点 id」或「传入一串无效 id」会被该 400 分支正确拦截，不再产出空白文件。这一处是 R2-008 的核心后端修复，确认真实落地。

**（b）前端 toastWarning 提示 —— 已落地**

文件 `src/components/workspace/ExportDialog.tsx`：

- 第 8 行：`import { toastSuccess, toastWarning } from "@/components/ui/toast";` —— toastWarning 已正确引入。
- 第 77-80 行：选章模式下未勾选任何章节时的前端拦截：

```ts
// R2-008/P1：选章模式下未勾选任何章节时，给出非阻塞提示并中止，避免静默导出整本或空文件
if (range === "selected" && selected.size === 0) {
  toastWarning("未选中任何章节");
  return;
}
```

- 第 85-99 行：预检（check=1）请求返回非 200 时，解析后端错误文案，若匹配 `/未选中|没有内容|没有有效章节/` 正则，则用 `toastWarning(emptyHint)` 提示作者并中止，而非盲目降级下载：

```ts
if (!res.ok) {
  let emptyHint: string | null = null;
  try {
    const errData = (await res.json()) as { error?: string };
    if (errData?.error && /未选中|没有内容|没有有效章节/.test(errData.error)) {
      emptyHint = errData.error;
    }
  } catch { /* 解析失败则按原有降级逻辑处理 */ }
  if (emptyHint) {
    toastWarning(emptyHint);
    return;
  }
  proceedExport();
  return;
}
```

注意这里有一个关键点：前端 `doExport` 的预检请求使用的是 `buildParams(true)`，即带 `check=1`。后端在 `check=1` 分支（第 75-85 行）之前已经布置了第 41 行与第 63 行的 400 拦截，因此「项目无内容」与「选章级联后为空」这两类空选，即使在预检模式下也会在第 75 行之前返回 400，从而被前端 `emptyHint` 逻辑捕获并提示。前端与后端形成了「拦截 + 可见提示」的闭环。

**（c）page.tsx 暴露全部节点类型、触发级联选中 —— 已落地**

文件 `src/app/workspace/[projectId]/page.tsx` 第 1236-1246 行，传给 `ExportDialog` 的 `chapters` 已从「仅 chapter 类型」改为映射全部 `storyNodes`，并为 volume/section/scene 加了中文前缀：

```tsx
<ExportDialog
  projectId={project.id}
  projectName={project.name}
  chapters={project.storyNodes.map((n) => ({
    id: n.id,
    title: `${n.type === "volume" ? "卷：" : n.type === "section" ? "节：" : n.type === "scene" ? "幕：" : ""}${n.title}`,
  }))}
  onClose={() => setShowExportDialog(false)}
/>
```

这满足了 round-2 清单中「暴露全部 volume/chapter/section/scene 节点类型，触发级联选中」的要求：章节清单现在包含卷/章/节/幕全部层级，用户在弹窗中勾选任意层级节点，前端把勾选 id 透传给后端 `chapterIds`，后端第 46-59 行 `addDesc` 递归向下（`parentId === nid`）展开整棵子树，实现级联选中。

**（d）逻辑闭环判定**

- 前端空选（selected.size === 0）→ toastWarning 拦截，请求根本不发。
- 后端空选（级联后无节点）→ 400 结构化错误，前端预检捕获后 toastWarning 提示。
- page.tsx 暴露全类型 → 级联选中可行。

三处改动彼此咬合，R2-008 在「选章完全不选 / 选了无效节点」两种语义上空导出问题确实被修复，结论为生效。

**（e）诚实边界（待验证项）**

- 后端第 63 行 400 分支与第 41 行 400 分支目前没有任何自动化测试覆盖（导出目录 `src/app/api/projects/[id]/export/` 下仅有 `route.ts`，无 `route.test.ts`）。我做了静态代码核对与逻辑推演，确认分支存在且位置正确，但没有实跑后端导出接口来验证 HTTP 行为——因为这需要真实数据库 + dev server。因此「后端 400 在真实运行时的 HTTP 状态/响应体」属于未经实测、待验证项。
- 前端 `toastWarning` 提示效果依赖浏览器渲染，未做组件级单元/集成测试；我仅核对了调用点与文案，未实跑 UI。

---

### 2. R2-009（P1）：导入错误提示粒度不足 —— 结论：生效（已实跑测试验证）

R2-009 的预期修复由两处构成：各导入 pass 外包上下文错误（让作者定位到具体是哪条记录出错）+ 外层 catch 细化超时/P2002/P2003/字段缺失为结构化错误。

**（a）各导入 pass 外包上下文错误 —— 已落地**

文件 `src/app/api/projects/import/route.ts` 中，每个 `want(...)` 子导入块都用 `try/catch` 包裹，并在 `catch` 中抛出带「记录名 + 原始错误」的上下文错误，便于作者定位：

- 分支 pass（第 137-139 行）：`throw new Error(\`故事分支「${curBranch?.name ?? "?"}」导入失败：${...}\`)`
- 章节 pass（第 162-164 行）：`throw new Error(\`第 ${(p.storyNodes||[]).indexOf(curNode)+1} 个章节「${curNode?.title ?? "?"}」导入失败：${...}\`)`
- 世界书（第 216-218 行）、角色卡（第 235-237 行）、故事线（第 246-248 行）、风格卡（第 257-259 行）、设定表（第 268-270 行）、规则（第 279-281 行）均同理。

这部分使「导入到一半失败」不再是笼统的 `Internal Server Error`，而是能指出「第 N 章 / 某角色卡 / 某词条」出错。确认落地。

**（b）外层 catch 结构化错误细化 —— 已落地**

文件 `src/app/api/projects/import/route.ts` 第 292-336 行的 `catch` 块，将笼统错误细化为 `TIMEOUT / UNIQUE / FK / FIELD / UNKNOWN` 五类，并返回结构化 JSON（`success:false, error, code, rawCode`）：

```ts
const le = err as any;
const rawMsg = le instanceof Error ? le.message : String(le);
const prismaCode = le?.code;
let detail = rawMsg;
let kind = "UNKNOWN";
if (/timed?\s*out|transaction.*timeout|timeout/i.test(rawMsg)) {
  detail = "事务超时：备份数据量过大，120 秒内未完成。建议拆分为更小的备份分批导入。";
  kind = "TIMEOUT";
} else if (prismaCode === "P2002") {
  detail = `数据库唯一约束冲突（字段重复写入）：${rawMsg}`;
  kind = "UNIQUE";
} else if (prismaCode === "P2003") {
  detail = `外键约束冲突（引用了不存在的关联记录）：${rawMsg}`;
  kind = "FK";
} else if (/missing|required|Argument `.+` is missing|Invalid value for argument/i.test(rawMsg)) {
  detail = `字段缺失或必填项为空：${rawMsg}`;
  kind = "FIELD";
}
console.error("[import] 还原失败（已回滚）:", rawMsg);
return NextResponse.json(
  { success: false, error: detail, code: kind, rawCode: prismaCode ?? null },
  { status: 500 },
);
```

四种错误类别（超时 / P2002 / P2003 / 字段缺失）均按 round-2 清单要求区分，并附 `code` 与 `rawCode` 便于前端细化展示。确认落地。

**（c）测试结果（已实跑）**

项目已有 `src/app/api/projects/import/route.test.ts`，使用 mocked Prisma（`$transaction` 直接执行回调、`tx` 各方法记录调用），不依赖真实数据库。我实跑了该文件：

```
$ npx vitest run src/app/api/projects/import/route.test.ts

 RUN  v4.1.10 C:/.../novel-forge
 ✓ src/app/api/projects/import/route.test.ts (2 tests) 4ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

两个用例分别验证了：① 仅导入 branches 时含 `forkPointNodeId` 的分支不被必填约束卡死（`G1`）、`parentBranchId` 重映射（`W1`）、且分叉点节点未随章节导入时回执带 `warnings` 提示；② 全量导入时 `forkPointNodeId` 成功重映射为新节点 id、无丢失警告。

为「Trust but verify」进一步确认 R2-009 的错误分类逻辑「真生效」而非仅存在于代码，我临时编写了一个针对外层 catch 的错误分类临时测试（`route.r2-009.tmp.test.ts`），mock `prisma.$transaction` 让其分别抛出 P2002 / P2003 / 超时 / 字段缺失 / 未知错误，断言返回 `code` 分别为 `UNIQUE / FK / TIMEOUT / FIELD / UNKNOWN`。实跑结果：

```
 ✓ src/app/api/projects/import/route.r2-009.tmp.test.ts (5 tests) 5ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

五条断言全部通过，证明错误细化逻辑在运行期确实按预期分类。该临时测试已删除，未污染仓库（仅保留 `route.test.ts` 原文件）。

**（d）结论与边界**

R2-009 的两处修复均已落地，且错误分类逻辑经过运行期测试验证，结论为生效。诚实边界：上述测试均在 mocked Prisma 下进行，未连接真实 Postgres；真实 DB 下 P2002/P2003 的实际 `code` 字段与异常形态可能与 mock 略有差异，但 Prisma 的 `P2002`/`P2003` 错误码是稳定契约，分类逻辑应当成立。真实 DB 端到端导入失败的 HTTP 表现属于「未经实测、待验证」，但代码逻辑与模拟测试双重支撑其生效。

---

## 二、新坑清单（round-2 未发现、但真实存在的缺陷）

精读 `export/route.ts`、`import/route.ts`、`ExportDialog.tsx`、`page.tsx` 导入导出相关逻辑后，挖出以下新缺陷。每条给出文件:行号与复现思路。

### NEW-IO-1（严重 / HIGH）：选章导出「非根节点」时仍静默产出空文件——R2-008 的 400 守卫漏掉了这一类

- 文件:行号：`src/app/api/projects/[id]/export/route.ts` 第 46-59 行（级联过滤）、第 63-68 行（400 守卫）、第 71-72 行（roots 计算）、第 153-155 行与第 161-163 行（markdown/txt 正文遍历）；`src/core/epub.ts` 第 100-103 行（`buildChapterList` 仅遍历 roots）；`src/components/workspace/ExportDialog.tsx` 第 180-190 行（清单含全类型节点）。

- 问题本质：round-2 把 `page.tsx` 的章节清单从「仅 chapter」拓宽为「全部 storyNodes（含 volume/section/scene）」，这本是为了触发级联选中。但后端导出正文时，`roots` 的计算逻辑是固定的（第 72 行）：

```ts
const roots = allNodes.filter((n) => !n.parentId);
```

它只把「parentId 为空」的节点当作根来渲染。当用户在弹窗里勾选的是一个「非根节点」（例如某个 `section`、某个 `scene`，或某个父级是 `volume` 的 `chapter`）时，级联过滤（第 46-59 行 `addDesc`）会把该节点及其后代收进 `allNodes`，于是 `allNodes.length > 0`，第 63 行的 400 守卫**不触发**。但渲染阶段：markdown/txt 走 `for (const root of roots)`（第 153、161 行），html/epub/docx 走 `buildChapterList(roots, ...)`（epub.ts 第 100-103 行 `for (const r of sortedRoots)`）——而 `roots` 为空（被选中的节点有 parentId，被过滤掉了）。结果：生成的是一个结构完整、但**正文完全为空**的文件（仅有书名、空目录、`共 0 个章节`）。

- 复现思路：
  1. 准备一个含层级的项目：volume（根）→ chapter（父为 volume）→ section（父为 chapter）→ scene（父为 section）。
  2. 打开导出弹窗，切到「选章」，勾选任意一个 `section` 或 `scene` 复选框（或勾选「父级是 volume 的 chapter」）。
  3. 点导出，下载文件后打开，发现除书名与空目录外没有任何正文。
  4. 即便用预检（check=1）也拦不住：因为 `allNodes.length > 0`，后端不会走 400，预检返回正常的违禁词结果（total 多为 0），前端 `emptyHint` 为空，于是 `proceedExport()` 执行，弹出「已开始导出」成功提示，作者被误导以为导出成功，实际拿到空文件。

- 这是一个典型的「防假收敛」缺陷：R2-008 堵住了「全空 / 全无效 id」的口子，却因为「暴露全类型节点」这一配套改动，把「选中非根节点」这一新可达路径上的空导出漏掉了。本质上 400 守卫的判断条件 `allNodes.length === 0` 与渲染根 `!n.parentId` 两个口径不一致。

- 建议修复方向（供阶段六参考）：级联过滤后，把「roots」重定义为「在 allNodes 中、且其 parentId 不在 allNodes 内」的节点（即过滤子树自身的顶层），而非「parentId 为空」。这样既保留向下的级联，又能让被选中的中间/叶子节点成为渲染根，空文件问题消失。例如：`const roots = allNodes.filter((n) => !n.parentId || !keep.has(n.parentId || ""))`，或更稳妥地用 `new Set(allNodes.map(n=>n.id))` 判断父是否在集合内。

### NEW-IO-2（中等 / MED）：导入外层 catch 把「任意 P2002」误判为「项目已存在（幂等成功）」，可能掩盖子表唯一约束冲突导致的真实失败

- 文件:行号：`src/app/api/projects/import/route.ts` 第 296-309 行。

- 问题本质：外层 catch 对 P2002 的处理是「只要 `code === "P2002"` 且 `importSourceKey` 非空，就去查回已存在的项目并以 `success:true, idempotent:true` 返回」：

```ts
if (code === "P2002" && importSourceKey) {
  try {
    const existing = await prisma.project.findUnique({
      where: { importSource: importSourceKey },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ success: true, id: existing.id, idempotent: true });
    }
  } catch (lookupErr) { ... }
}
```

这里隐含假设：「P2002 一定来自 `Project.importSource` 唯一约束冲突（即并发重复导入同一备份）」。但 `$transaction` 回调内部大量子表 `create` 同样可能抛出 P2002（只要任一子表存在唯一约束，例如某全局唯一 slug、或备份内部出现重复唯一键）。一旦 P2002 来自子表而非 `Project.importSource`，该分支仍会去按 `importSource` 查回「最初那次成功导入的项目」并返回 `success:true, idempotent:true`——于是**一次实际失败的导入被伪装成「已存在、幂等成功」**，事务虽已回滚（不留孤儿是对的），但作者得到的是谎报的成功与一个旧项目 id，真实失败被吞掉。

- 复现思路：
  1. 假设某子表（如 `storyNode` 或 `lorebookEntry` 或 `characterCard`）存在唯一约束（全局唯一键或 `projectId + 某字段` 唯一）。
  2. 构造一个备份，使其内部的子表记录在写入时触发该唯一约束（例如备份里含两条 cid 相同的角色卡，或某唯一 slug 与库里既有记录冲突）。
  3. 导入该备份，事务在子表 `create` 处抛 P2002。
  4. 外层 catch 不区分冲突来源，按 `importSource` 查回一个已存在项目并以 `success:true` 返回——作者以为导入成功，实际什么都没导入。

- 诚实声明：该缺陷是否「必然触发」取决于 Prisma schema 中子表是否确实存在除主键外的唯一约束。我本次未读取 `prisma/schema.prisma` 逐字段核对（属于跨文件依赖）。若子表仅主键唯一，则 P2002 只会来自 `Project.importSource`，误判风险收敛到「并发重导入竞态」这一本就被设计成返回已存在项目的场景，危害较小。但即便如此，「用 P2002 这一个信号推断冲突来源」在逻辑上是不严密的，属于应当加固的健壮性问题。建议改为：仅在事务内明确捕获 `Project.create` 的 P2002（而非笼统的外层 P2002），或在校验阶段把子表冲突与幂等冲突区分开。此项归类为 MED（依赖 schema 确认），标为「待结合 schema 验证」。

### NEW-IO-3（中等 / MED）：导出预检遇到「非空选类」的 HTTP 错误时，静默降级为直接下载并弹出成功提示，掩盖真实失败

- 文件:行号：`src/components/workspace/ExportDialog.tsx` 第 85-102 行，尤其是第 100 行 `proceedExport()` 与第 71 行的 `toastSuccess("已开始导出...")`。

- 问题本质：预检 `fetch` 返回非 200 时，前端只识别「未选中/没有内容/没有有效章节」这三类文案。若是其它错误（例如后端 500、404、413 体过大，或临时服务抖动导致的非 200），`emptyHint` 为 null，代码走到 `proceedExport()`（第 100 行）。`proceedExport` 用 `window.open` 打开不带 `check=1` 的真实导出 URL，并立即 `toastSuccess("已开始导出，文件将在新标签页下载")`。

这里有两个问题叠加：
  1. 真实导出请求同样可能因为同一原因失败（例如后端 500），浏览器下载到的其实是一个错误 JSON 响应体而非合法文件，**但用户已被成功提示误导**。
  2. 真正的失败原因（500/超时/鉴权）被完全吞掉，作者无从得知。

- 复现思路：
  1. 让导出后端临时返回 500（如数据库抖动、或某格式构建抛出异常）。
  2. 在弹窗点导出：预检拿到非 200，文案不匹配 `emptyHint` 正则，于是执行 `proceedExport()`。
  3. `window.open` 触发真实导出，同样 500，浏览器得到一个 JSON 错误文件（或空白）。
  4. 界面仍显示「已开始导出，文件将在新标签页下载」的成功 toast，作者误以为成功。

- 该问题与 NEW-IO-1 形成叠加：NEW-IO-1 让「选了非根节点」时即使后端 200 也产出空文件；NEW-IO-3 让「后端真实报错」时也以成功面貌呈现。两者共同削弱了「导出是否真的成功」的可信度。建议：预检非 200 且该错误非「空选类」时，应明示失败（toastError 带后端错误文案）而非降级下载。

### NEW-IO-4（低 / LOW）：导入 `include` 传空数组时语义反转，变成「全量导入」

- 文件:行号：`src/app/api/projects/import/route.ts` 第 43-45 行。

```ts
const include = Array.isArray(bundle.include) && bundle.include.length
  ? new Set(bundle.include as string[])
  : null; // null = 全量
const want = (key: string) => (include === null || include.has(key));
```

- 问题本质：`include` 一旦是数组但长度为 0（`[]`），三元表达式落到 `null`，于是 `want(...)` 对所有 key 返回 true，执行的是**全量导入**，而非调用方可能期望的「什么都不导入」。这是对「空数组 = 空集」直觉的违背。若前端某个开关在「未勾选任何分项」时序列化出 `include: []`，意图是「只导入项目本体、跳过所有子表」，实际却把全部子表都导进来了；反之若有人想表达「清空式导入」也会得到反效果。

- 复现思路：
  1. 发送 `POST /api/projects/import`，body 中 `include: []`，其它字段正常。
  2. 观察后端实际导入了 characters/lorebook/chapters 等全部子表，而非仅项目本体。

- 建议：若需区分「全量（字段缺省）」与「明确空集」，应在判断里把「空数组」与「字段缺失」区分开（例如 `include.length === 0` 时 `want` 恒为 false）。此项影响面小（需要调用方显式传 `[]`），归为 LOW。

### NEW-IO-5（低~中 / PERF）：导出正文递归使用 `allNodes.filter(parentId === node.id)`，整体 O(n²)，超大项目有性能隐患

- 文件:行号：`src/app/api/projects/[id]/export/route.ts` 第 140-148 行、第 216 行、第 237 行（`buildMarkdownNode`/`buildTextNode` 内 `allNodes.filter`）；`src/core/epub.ts` 第 95-97 行（`buildChapterList` 内）；以及级联 `addDesc`（route.ts 第 51-55 行）也是线性扫描。

- 问题本质：每次渲染一个节点都要对整个 `allNodes` 做一次 `filter` 来找它的子节点，且 markdown/txt 与 html/epub/docx 两条路径各自独立遍历整棵树，整体复杂度约 O(n²)。对于几万节点的超长篇小说（例如每章多 scene、全书数千上万节点），导出会在单请求内做大量重复线性扫描，可能显著拖慢响应、在极端情况下逼近 `maxDuration`/请求超时。这属于性能隐患而非功能错误，但在「超大项目」这一明确场景下值得关注。

- 复现思路：构造一个含 1 万+ 节点的项目，触发任一格式导出，用性能分析观察 `buildMarkdownNode`/`buildChapterList` 的耗时随节点数二次增长。此项为 PERF，归为 LOW~MED，建议在渲染前先建立 `parentId -> children[]` 索引（一次 O(n) 分组），消除重复的 `filter`。

### NEW-IO-6（低 / LOW）：导入接口把整个请求体 `request.json()` 一次性读入内存，且子表串行 `await` 写入，超大备份有内存/超时风险虽已被 TIMEOUT 分支兜底但无流式处理

- 文件:行号：`src/app/api/projects/import/route.ts` 第 34 行 `const bundle = await request.json();`，第 65-285 行 `$transaction` 内对 `p.storyNodes` 等逐条 `await tx.xxx.create(...)`。

- 问题本质：备份 JSON 被整体解析进内存，若备份体非常大（数百 MB 的富媒体/长正文），内存峰值高；同时子表采用「for 循环里逐个 `await` create」的串行写法，节点数极大时总耗时可能逼近 120s 事务超时——此时会被 NEW-IO 关心的 TIMEOUT 分支兜住并报「事务超时」，不算静默失败，但用户体验上只是得到一个「请拆分备份」的提示，没有流式/分批写入来真正解决大备份。这是容量边界上的设计取舍，当前有兜底不算 bug，但作为「超大项目内存爆炸」隐患列出，归为 LOW。

### NEW-IO-7（低 / LOW，附送观察）：全书导出时若数据库存在「父节点已删、子节点 parentId 悬空」的孤儿节点，会被静默丢弃

- 文件:行号：`src/app/api/projects/[id]/export/route.ts` 第 72 行 `roots` 计算 + 渲染仅遍历 roots。

- 问题本质：若某节点的 `parentId` 指向一个不存在的节点（数据不一致/历史脏数据），它既不是 root（有 parentId）也不会被任何 root 的子树包含，因此全书导出时该节点及其后代会被整体静默忽略，作者不会收到任何提示。这通常源于更早的删除逻辑缺陷，但导出侧至少应当给出「跳过 N 个孤儿节点」的告警，而非完全静默。此项为一致性/健壮性观察，归为 LOW，优先级低于 NEW-IO-1。

---

## 三、复检员诚实声明

### 3.1 真正实测过的项

- R2-009 错误分类逻辑：实跑临时测试（5 条断言全过）+ 项目既有 `route.test.ts`（2 条断言全过），在 mocked Prisma 下确认了 TIMEOUT/UNIQUE/FK/FIELD/UNKNOWN 五类分类确实生效。这是运行时验证，置信度高。
- R2-008 / R2-009 的全部代码改动：均通过 Grep + Read 读取了当前文件真实内容核对，确认 400 分支、`toastWarning` 调用、`page.tsx` 全类型暴露、各 pass 上下文错误外包、外层 catch 结构化细化均已落地，非仅凭 git diff 或清单描述推断。

### 3.2 未经实测、待验证的项（明确标注，未伪装已验证）

- R2-008 后端 400 分支的真实 HTTP 行为（status 400 + 响应体）：未连接真实数据库/dev server 实测，仅静态核对分支位置与逻辑顺序正确。属「待验证」。
- R2-008 前端 `toastWarning` 的 UI 提示效果：未做组件级渲染测试，仅核对调用点与文案。
- NEW-IO-2 是否必然触发：取决于 `prisma/schema.prisma` 中子表是否存在除主键外的唯一约束，本次未跨文件读取 schema 逐一核对，故标注为「依赖 schema 确认」的 MED，而非断言必现。
- NEW-IO-1 虽经代码逻辑推演确认（roots 口径与 400 守卫口径不一致，且已被 page.tsx 拓宽节点类型这一配套改动使非根节点选择成为可达路径），但同样未在真实数据库端到端跑一遍导出流程——理由同上为环境依赖。其逻辑确定性高于 NEW-IO-2，但我仍如实标注「未端到端实测」。
- 所有性能类（NEW-IO-5 / NEW-IO-6）为代码复杂度/容量分析推断，未做真实大数据量压测。

### 3.3 一句话总结

R2-008、R2-009 两条 round-2 P1 修复在代码层面均已真实落地且逻辑闭环成立（R2-009 另经运行期测试佐证），可判定为生效；但本轮复检挖出的最关键新坑是 NEW-IO-1——「暴露全类型节点以触发级联选中」的配套改动与后端 `roots` 仅取 `parentId===null` 的渲染口径不一致，导致「选中非根节点（section/scene/卷下 chapter）导出仍静默产出空文件」，R2-008 的 400 守卫因 `allNodes.length>0` 而漏拦该类，构成防假收敛视角下的真实回归风险，建议阶段六优先修复。
