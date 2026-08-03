# Round 2 诊断报告 —— 墨白（写实悬疑《龙陨之地》项目股东）

> 透镜：写章流程 + 自动填表（灭错名 / 自检 / 防重复 / 归属）
> 方法：只读源码 + 实际 Read 核对行号（非仅凭上轮报告），未改任何 src。
> 本轮交付：① 上轮 F1/F5 + 增量落盘的回归复验；② 在本透镜内挖掘新坑（F2/F3/F6 复验 + 其他断裂点）。

术语大白话：
- **「填表闭环」**：写完一章正文 → 自动抽事实写进表格 → 之后写新章时召回这些表格 → 新正文更一致。就像"写完记笔记，下次写作翻笔记"。
- **「防重复标记」**：记哪些章已经填过表，避免一键填表时重复劳动、用新值覆盖旧行。
- **「错表」**：把本应进 A 表（如地点表）的名字，误填进了 B 表（如宝物表）。
- **`warnings`**：填表后系统给出的"这个名字正文中找不到原文，疑似错名"的告警列表。

---

## 回归验证

### ① F1 · 写章路由与一键填表防重复互通
- **预期**：写章自动填表成功后，把该章写入防重复标记（`.runtime/babylore-filled.json`），使一键 fill-all 真正跳过；且写章路由调用 `safeFillAfterWriting` 时传了 `nodeId`；`markChapterFilled` 是导出函数、写该 json。
- **实际代码**：
  - `src/core/babylore/loop.ts:180-187` —— `if (babylore.ok && nodeId) { try { markChapterFilled(projectId, nodeId); } catch {...} }`，成功填表后确实调用 `markChapterFilled`，**带 nodeId**。
  - `src/app/api/generate/write/route.ts:304-312` —— 调用 `safeFillAfterWriting({ projectId, content: fullContent, send, nodeOrder, isLatestChapter, nodeId, projectLlmConfig })`，**明确传了 `nodeId`**（第 310 行）。
  - `src/core/babylore/fill.ts:74-81` —— `export function markChapterFilled(projectId, nodeId)` 为导出函数；内部 `loadFilled()`→`set.add(nodeId)`→`saveFilled(m)`；`FILLED_PATH` 在 `fill.ts:60` 指向 `.runtime/babylore-filled.json`。写路径与 fill-all 路径共用同一 `loadFilled/saveFilled`。
- **结论**：**通过**。三处全部落地，写路已并入防重复契约，`markChapterFilled` 写 `.runtime/babylore-filled.json`。

### ② F5 · applyOps 的 update/delete 大小写归一化
- **预期**：update 与 delete 的 `match` 匹配与 insert 去重一致，用 `toLowerCase()`，避免「青龙镇」/「青龙鎮」因字形/大小写漏匹配或产生重复。
- **实际代码**：
  - `src/core/babylore/fill.ts:281` —— update 分支 `const idx = rows.findIndex((r) => String(r[col] ?? "").toLowerCase() === String(val ?? "").toLowerCase());`（已 `toLowerCase()`）。
  - `src/core/babylore/fill.ts:297` —— delete 分支 `rows.filter((r) => String(r[col] ?? "").toLowerCase() !== String(val ?? "").toLowerCase());`（已 `toLowerCase()`）。
  - 对照 insert 去重 `fill.ts:265` 同为 `toLowerCase()`，三处一致。
- **结论**：**通过**。update/delete 的 match 已与 insert 一致做大小写归一化。

### ③ 增量落盘（磐石 P0 防丢进度，本轮一并复验）
- **预期**：`babyloreFillAll` 循环内每填完一章即持久化防重复标记，而非只在循环结束后写一次，避免中途超时/崩溃丢失全部进度。
- **实际代码**：
  - `src/core/babylore/fill.ts:451-465` —— `for (const ch of chapters) { if (filledSet.has(ch.id)) { skipped++; continue; } ...; filledSet.add(ch.id); filledMap[projectId] = Array.from(filledSet); saveFilled(filledMap); }`。**在循环体内、每章处理后即调用 `saveFilled`**（第 463-464 行），注释也写明"增量落盘：每填完一章即持久化"。
- **结论**：**通过**。已增量落盘，非仅循环末写入。

---

## 新发现

（本轮在本透镜内复验上轮 P1/P2 是否真修：F2 单章告警 UI、F3 错表不可检、F6 行标红——三项经实际 Read 确认**均未修复**，仍为真实缺口。另附 F7 等遗留。）

### F2 · P1 · 单章自动填表 UI 仍彻底丢弃 `warnings`（错名告警不可见）
- **现象**：在 tables 页"自动填表（LLM 填充）"卡片粘贴一章正文点运行，即使填出了正文里不存在的名字（系统已生成 `warnings`），用户也看不到任何告警。
- **根因**：单章填表结果卡片只渲染 `ok / operations / applied / error / at`，从未读取 `fillResult.warnings`。API 侧实际**有返回**该字段（`src/app/api/babylore/fill/route.ts:15-16` 直接 `NextResponse.json(res)`，而 `babyloreFill` 的 `FillResult` 含 `warnings`，见 `fill.ts:32`），是 UI 丢弃而非后端缺失。
- **file:line**：
  - `src/app/workspace/[projectId]/tables/page.tsx:204-214`（`fillResult` 渲染段，无 `warnings` 引用）。
  - 对比已正确渲染的 fill-all 段：`page.tsx:252-258`（有 `fillAllResult.warnings?.length>0` 列表）。两处 UI 不一致。
- **具体修复方案**：在 `page.tsx` 的 `fillResult` 卡片内照搬 fill-all 的 warnings 渲染逻辑（字段名 `fillResult.warnings`）。伪代码：
  ```tsx
  {fillResult.ok && fillResult.warnings?.length > 0 && (
    <div className="mt-2 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1.5">
      <div className="font-medium mb-1">⚠ 疑似错误地名/名称（{fillResult.warnings.length}）</div>
      <ul className="list-disc pl-4 space-y-0.5 max-h-40 overflow-auto">
        {fillResult.warnings.slice(0, 30).map((w: string, i: number) => <li key={i}>{w}</li>)}
      </ul>
    </div>
  )}
  ```
  建议同时把该卡片从 `fillResult.ok ? success : danger` 的二态，改为 success 但带告警时显示琥珀色提示，强化可见性。

### F3 · P1 · selfCheckFill 仍无法检出"错表"类错名（把 A 地填进 B 地表）
- **现象**：把「青龙镇」（地点名）误填进 `treasure`（宝物）表，而正文里"青龙镇"本就存在（在 geo 上下文），自检会判定"名字在正文里=通过"，错表完全不可见。
- **根因**：`selfCheckFill`（`src/core/babylore/fill.ts:485-521`）只做两件事：① 身份列为空→`completenessIssues`（:502-505）；② 名称值能否在**全正文 corpus** 里 `includes`→`nameIssues`（:508-511）。**没有"该名称是否属于当前这张表"的归属校验**。测试 `fill.selfcheck.test.ts` 也只注入"正文不存在"的名字，未覆盖跨表错填。
- **file:line**：`src/core/babylore/fill.ts:485-521`（自检主逻辑）；`src/core/babylore/fill.ts:508-511`（仅 `corpus.includes` 判定）。
- **具体修复方案（含如何判定错表 + 避免误报）**：
  在 `selfCheckFill` 开头构建**跨表身份索引**，再对每行做归属校验。核心思路：若某名称同时是**另一张"强类型"表**（非 `auto_facts` 通用表）的身份列主名，则高度疑似被填错表。

  ```ts
  // 1) 建跨表身份索引：normName -> Set<tableKey>
  const identityIndex = new Map<string, Set<string>>();
  for (const t of dbTables) {
    const idCol = getIdentityCol({ columns: t.columns as any[] });
    for (const r of (t.rows as any[]) || []) {
      const v = r[idCol];
      if (v == null || String(v).trim() === "") continue;
      const k = String(v).trim().toLowerCase();
      if (!identityIndex.has(k)) identityIndex.set(k, new Set());
      identityIndex.get(k)!.add(t.key);
    }
  }
  // 2) 在行遍历中增加归属校验（仅对"强类型表"互相比对，跳过 auto_facts 避免噪声）
  for (const t of dbTables) {
    if (t.category === "auto") continue;            // 通用表不参与错表判定
    const idCol = getIdentityCol({ columns: t.columns as any[] });
    for (const r of (t.rows as any[]) || []) {
      const v = r[idCol];
      if (v == null || String(v).trim() === "") continue;
      const k = String(v).trim().toLowerCase();
      const owners = identityIndex.get(k);
      // 该名称还是另一张"强类型表"的身份主名 → 疑似错表
      const otherTyped = [...(owners || [])].filter(
        (key) => key !== t.key && dbTables.find((x) => x.key === key)?.category !== "auto"
      );
      if (otherTyped.length > 0) {
        nameIssues++;
        issues.push({
          table: t.name, row: r.row_id ?? "?", value: String(v).trim(),
          issue: `疑似错表：名称「${String(v).trim()}」同时是表「${otherTyped.join("、")}」的身份列主名，可能被填错表`,
        });
        continue; // 已被错表规则抓到，不再重复走 corpus 判定
      }
    }
  }
  ```
  **避免误报**：① 仅 `category !== "auto"` 的强类型表互相比，通用 `auto_facts` 表不触发；② 用身份列精确匹配（同一字符串是另一表主名才告警），而非模糊子串；③ 名称长度本就 `>=2`（`fill.ts:507` 已有），降低单字误撞；④ 这仅是"疑似"告警（与现有 `nameIssues` 同级别），用户最终判定，不会误删数据。
  配套：在 `fill.selfcheck.test.ts` 增加一条——伪造一个 geo 表含「青龙镇」、treasure 表误填「青龙镇」，断言 `selfCheckFill` 产出 `issue` 含"疑似错表"。

### F6 · P1 · 自检告警有文字列表，但表格网格不对命中行标红
- **现象**：一键填表自检结果以纯文字列表呈现（`表「X」行Y：…—疑似错误地名`），但展开编辑的表格网格对所有行一视同仁渲染，无任何标红/高亮。用户无法直观看到"哪几行被告警"，只能凭 row_id 手动比对。
- **根因**：`LoreTableGrid` 接收的是 `table` 本身，**没有任何告警行集合入参**；其渲染（`page.tsx:353-440`，尤其 `:384-399` 与 `:416-429` 两个分支的 `<tr>`）对每行统一样式，无 `className` 条件。
- **file:line**：
  - `src/app/workspace/[projectId]/tables/page.tsx:263-269`（issues 文字列表，未向网格传递 row 集合）。
  - `src/app/workspace/[projectId]/tables/page.tsx:311-318`（`LoreTableGrid` 调用处，未传 `flaggedRows`/`issues`）。
  - `src/app/workspace/[projectId]/tables/page.tsx:353-440`（`LoreTableGrid` 实现，无高亮逻辑）。
- **具体修复方案**：
  1. 在 `TablesPage` 内计算告警行集合：`const flagged = useMemo(() => { const m = new Map<string, Set<number|string>>(); (fillAllResult?.selfCheck?.issues||[]).forEach(it => { if(!m.has(it.table)) m.set(it.table,new Set()); m.get(it.table)!.add(it.row); }); return m; }, [fillAllResult]);`
  2. 给 `LoreTableGrid` 加 props：`flaggedRows?: Set<number|string>`，并在两个 `<tr>` 渲染处加条件类：
     ```tsx
     const isFlag = flaggedRows?.has(r.row_id);
     <tr ... className={isFlag ? "border-t ... bg-[var(--nv-danger)]/10" : "border-t border-[var(--nv-border-2)]"}>
     ```
     同时可给 row_id 单元格加红字。
  3. 调用处改为 `<LoreTableGrid ... flaggedRows={flagged.get(t.name)} />`（:312 附近）。
  注意 `it.row` 类型是 `number | string`，与 `r.row_id` 比对时统一用 `String()` 比较更稳。

### 附：上轮遗留、本轮未重点复验但仍在（供 Chair 排期）
- **F4 · P2** 多表填充单次 LLM 调用无表级隔离（`fill.ts:168-236` `runFillForText` 把选中表合一次 fetch）——仍现状，影响"单表坏 JSON 拖累整章"。
- **F7 · P2** 写章默认 `skipLatestChapter=true`（`loop.ts:125`）+ 频率默认 3 章（`loop.ts:124`），最新章默认不进表，与"闭环"承诺有落差；建议 UI 提示"最新章待填"或将默认改为 false。本轮未改，仅记录。

---

## 优先级建议

本轮最该先做的 2 项（均直接拉高"填表正确性 / 用户可感知的告警"）：
1. **F3（错表不可检，P1）**——闭环"灭错名"的承诺缺口最大：当前自检只能查"名字是否在正文"，查不出"名字是否进错表"。错表比错名更隐蔽（自检反而判通过），应在本轮修，并补一条跨表错填单测。
2. **F2（单章 warnings 丢弃，P1）**——后端已返回、纯 UI 遗漏，改动极小（照搬 fill-all 渲染逻辑），却能立刻让单章填表的"疑似错名"对用户可见，性价比最高。

次优先：**F6（行标红）**——把自检文字告警落到网格可视，体验增益明显但改动稍大，可紧随 F2 之后。
