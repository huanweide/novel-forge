# 修复报告：IO 空导出边角（非根节点勾选静默空文件）

- 修复 Agent：魔王系统 Round-3 代码修复（独立修复、自验、落盘）
- 关联缺陷：round-2 复检 NEW-IO-1（HIGH）—— `lens-io.md` 第 188-208 行
- 问题本质：R2-008 的 400 守卫只拦截「级联展开后 `allNodes.length === 0`」（全空 / 全无效 id），未覆盖「选中节点展开后 `allNodes.length > 0` 但子树内无任何正文章」的情况；同时渲染 `roots` 仅取 `parentId === null`，导致选中非根节点（section / scene / 父级为 volume 的 chapter）时 `roots` 为空，静默产出结构完整、正文全空的文档。

## 一、改动文件与行号

### 1. `src/app/api/projects/[id]/export/route.ts`

**(a) 新增 R3-IO 正文空判定守卫（第 70-79 行，位于 R2-008 守卫之后）**

```ts
// R3-IO：选章导出时若级联展开后的整棵子树「没有任何正文」……返回结构化错误而非静默产出空白文件。
// 仅当展开后仍无任何正文章才拦截；若选中节点本身或其后代存在正文则正常放行。
if (chapterIdsParam && !allNodes.some((n) => n.content)) {
  return NextResponse.json(
    { error: "所选范围无可导出正文" },
    { status: 400 }
  );
}
```

- 判定逻辑：递归展开（级联 `addDesc`，第 51-56 行）后，对 `allNodes` 用 `some` 检测是否存在任一 `n.content` 非空。无任何正文 → 400；存在正文 → 放行。
- 该守卫 `chapterIdsParam &&` 前置，确保「全书导出」（不传 `chapterIds`）永不被误拦，R2-008 主场景逻辑完整保留、未回退。

**(b) `roots` 口径修正（第 81-86 行）**

```ts
const idsInScope = new Set(allNodes.map((n) => n.id));
const roots = allNodes.filter((n) => !n.parentId || !idsInScope.has(n.parentId));
```

- 旧逻辑：`allNodes.filter((n) => !n.parentId)` —— 仅取整棵树最顶层，选中非根节点时该节点被排除，渲染为空。
- 新逻辑：`parentId` 为空 **或** 其父不在当前选中集合内 → 视为子树顶层。选中中间/叶子节点时它成为渲染根，其后代由 `buildMarkdownNode` / `buildChapterList.walk` 递归展开，空文件问题消失。
- 验证过下游渲染：`src/core/epub.ts` 第 88-99 行 `walk` 从 roots 递归遍历全部后代；markdown/txt 路径同样从 roots 递归（route.ts `buildMarkdownNode` / `buildTextNode`），改 roots 不会漏渲染。

### 2. `src/components/workspace/ExportDialog.tsx`

**(c) 前端错误文案正则扩展（第 90 行）**

```ts
if (errData?.error && /未选中|没有内容|没有有效章节|没有可导出正文|无可导出正文/.test(errData.error)) {
```

- 后端返回「所选范围无可导出正文」时，被 `无可导出正文` 分支命中 → `emptyHint = errData.error` → `toastWarning(emptyHint)` 提示作者并中止，而非静默降级为 `proceedExport()` 盲目下载。
- 与 R2-008 既有「未选中/没有内容/没有有效章节」提示逻辑并存，未改动原有行为。

### 未改动项（确认保留）

- `src/app/workspace/[projectId]/page.tsx` 第 1236-1246 行：传全类型节点给 `ExportDialog` 的逻辑保留不变（级联选中入口）。
- route.ts 第 41-43 行（项目无内容 400）、第 63-68 行（R2-008 级联后空 400）均保留。

## 二、递归展开与空判定逻辑小结

1. 收集项目全部节点 → 2. 若传 `chapterIds`，`addDesc` 递归向下收集选中节点及其全部后代入 `allNodes` → 3. R2-008 守卫：`allNodes.length === 0` → 400（全空/无效 id）→ 4. **R3-IO 守卫：`!allNodes.some(n=>n.content)` → 400「所选范围无可导出正文」**（展开后无正文）→ 5. 计算 `roots` 为子树顶层（含非根节点）→ 6. 各格式沿 roots 递归渲染正文。
   - 拦截时机：步骤 3、4 均在 `check=1` 预检分支（第 87 行起）之前，因此预检即返回 400，前端可捕获并提示。

## 三、验证结果

- **tsc 零错误**：`cd 项目根 && SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → 退出码 0，无任何输出。
- **export 相关测试**：导出目录 `src/app/api/projects/[id]/export/` 下仅有 `route.ts`，**无 `route.test.ts`**（已确认）。本次未新增测试文件（遵循任务要求：若无测试则至少做静态闭环推演），静态推演如下：
  - 场景 A（勾选空 section，其后代 scene 也空）：`allNodes.length=2>0` 不触发 R2-008；`some(content)=false` 触发 R3-IO 返回 400「所选范围无可导出正文」。✔ 拦截静默空文件。
  - 场景 B（勾选有正文的 section）：`some(content)=true` 放行；新 roots 口径令 section 成为渲染根，正常导出。✔ 有正文正常导出。
  - 场景 C（全书导出，不传 chapterIds）：两道守卫因 `chapterIdsParam` 为 null 跳过，全书导出行为不变。✔ 主场景保留。
  - 场景 D（前端预检拿到 400）：正则新增「无可导出正文」匹配 → toastWarning 提示，不降级下载。✔ 前端提示闭环。

## 四、诚实声明

- **真实浏览器导出文件的端到端效果（真实数据库 + dev server 跑一遍「勾选非根节点 → 下载文件 → 打开验证非空」）未经实测，待验证。** 本次仅通过 TypeScript 类型检查 + 静态代码推演确认逻辑闭环，未连接真实 Postgres 运行 HTTP 接口。
- R3-IO 守卫与 roots 口径修正二者互为补充：前者解决「展开后无正文」的静默空文件拦截，后者解决「展开后有正文但 roots 取错导致渲染为空」的潜在遗漏，共同作用后才能完整覆盖 NEW-IO-1 描述的非根节点路径。
- 关联 NEW-IO-3（预检非 200 非「空选类」时降级下载并弹成功）本次未处理，属独立 MED 项，按任务范围仅修复 R3 指定的空导出边角。
