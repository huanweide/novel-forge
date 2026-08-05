# 复检报告 · 设定检索召回归透镜（Round-1 / 阶段五）

> 本报告为 MaxLoop 魔王系统复检子 Agent 在「阶段五」对上轮 round-1「阶段四」**声称修复**的 7 个 IMP 进行的独立复验。
> 复验原则：**防假收敛** —— 每个 IMP 不轻信断言，逐一跑 `git diff` + 读源码上下文 + 跑相关测试 + 真机验证（可机验部分）+ 挖掘新坑。

| 项 | 内容 |
| --- | --- |
| Agent 代号 | 复检子 Agent（设定检索召回归透镜） |
| 透镜 | 设定检索召回归（Lorebook / 实体 / 伏笔检测 / 世界卡片 召回与一致性） |
| 轮次 | Round-1 / 阶段五（复检） |
| 对象 | `novel-forge`（分支 main，dev:3001，PostgreSQL:127.0.0.1:5432） |
| 复验 IMP | IMP-006 / 007 / 008 / 009 / 010 / 011 / 012（共 7 项） |
| 门禁快照 | `tsc --noEmit` EXIT=0；`npm test` 211 passed |
| 日期 | 2026-08-05 |

---

## 一、双栏速览

| 用户体验视角（U/X 是否真的变好） | 总体视角（工程是否真修复、有无新坑） |
| --- | --- |
| IMP-006：世界设定编辑弹窗的分类下拉现已完整含 12 类，功法不再被误归地理。**（已修复）** | IMP-006 代码改动真实落地；但分类仍**硬编码**于 select，未从 `worldPanelData.WORLD_MODULES` 动态生成（技术债 P2）。 |
| IMP-007：用户写完一章确认后，伏笔/报偿自动被重新检测，无需手动触发。**（已修复，真机验证触发成功）** | IMP-007 fire-and-forget POST 真实存在于 `route.ts:211-224` 并附 `.catch` 兜底；端点 `detect/route.ts` 真机返回 `ok:true`。**无新坑**。 |
| IMP-008：正文高亮的实体色、面板图例色、API 返回色三者现已统一，不再两套配色冲突。**（已修复）** | IMP-008 三处共用 `CHARACTER_COLOR` / `LORE_COLORS` 单一来源，一致性成立。**无新坑**。 |
| IMP-009：伏笔的"收束条件"不再恒为空，详情页能展示推导出的条件。**（已修复，但抽取质量有瑕疵）** | IMP-009 `deriveClosureConditions` 用 `[一-鿿]{2,}` 抽 ≥2 字片段，与 `extractSeeds` 的 `[一-龥]{3,}`（≥3 字）阈值错配，2 字噪声可经 closure 分支误召（P2）。 |
| IMP-010：2 字实体名仍保持"不吞并、保召回"，未因上轮改动被破坏。**（维持现状，复核合理）** | IMP-010 `match.ts:144-146` Round4 铁律完好；`match.test.ts` 34 例全过（含 2 字锁定用例）。维持现状决策经源码+测试双重确认合理。 |
| IMP-011：世界卡片现有一键编辑入口，点铅笔即复用 LorebookEditDialog，不再"只读不可改"。**（已修复）** | IMP-011 `onEditEntry` 透传链 WorldEntryCard→WorldEntryList→WorldPanel→LeftPanel→page.tsx 全链路完整，末端复用 LorebookEditDialog。**无新坑（弹窗视觉定位需本地目测）**。 |
| IMP-012：实体高亮地图获取失败时不再静默返空导致整页失色，会重试一次并降级复用上一次成功结果。**（已修复）** | IMP-012 `getEntityMap` 失败重试一次 + `lastGoodMap` 降级，逻辑自洽。**无竞态新坑（极端并发场景未压测，标注观察）**。 |

---

## 二、发现清单（含 文件:行号 + 复验证据）

### IMP-006 · LorebookEditDialog 分类漏 4 类致功法错归地理
- **严重度**：✅ 已修复（附 P2 技术债）
- **文件:行号**：`src/components/workspace/LorebookEditDialog.tsx:118-121`（新增 option）；同源对照 `src/components/workspace/worldPanelData.ts:5-18`
- **现象（修复前）**：编辑弹窗 `<select>` 仅含 8 类，漏 technique/law/currency/character_relationship 4 类，用户无法将功法体系正确归类，导致功法被错归地理。
- **根因**：分类清单与 `worldPanelData.WORLD_MODULES` 不同源，新增分类时只改了一处。
- **复验证据**：
  1. `git diff` 确认在 `:118-121` 补 `<option value="technique">功法体系</option>` 等 4 项。
  2. 读源码确认 select 现已含全部 12 类：`geography / faction / magic_system / history / culture / creature / item / technique / law / currency / character_relationship / custom`，与 `worldPanelData.ts` 值逐一比对一致。
- **建议**：将 select 改为从 `WORLD_MODULES` 动态 `map` 生成，消除硬编码同源债（见 P2-#1）。

### IMP-007 · detectPayoffs 不随写章触发
- **严重度**：✅ 已修复（真机验证通过）
- **文件:行号**：`src/app/api/story/nodes/[id]/route.ts:211-224`；端点 `src/app/api/foreshadowing/detect/route.ts`（全文）
- **现象（修复前）**：confirm 成功写章后，伏笔/报偿检测不会自动重跑，需用户手动触发，召回链路断裂。
- **根因**：缺少在写章确认成功后的自动触发钩子。
- **复验证据**：
  1. `git diff` 确认在 `upd.count > 0` 成功分支后新增 fire-and-forget POST：
     ```ts
     const base = new URL(request.url).origin;
     void fetch(`${base}/api/foreshadowing/detect`, {
       method: "POST", headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ projectId: node.projectId }),
     }).catch(() => {});
     ```
  2. 真机验证：dev:3001 运行中，`curl -X POST localhost:3001/api/foreshadowing/detect -d '{"projectId":"..."}'` 返回 `{"ok":true,"stats":{...payoffRate:0...}}`（EXIT=0），证明端点真实存在、读取 projectId、执行 `detectPayoffs`。
  3. 读 `detect/route.ts` 确认缺 projectId 返 400、异常 catch 返 500 ok:false，契约完整。
- **建议**：无。`void fetch(...).catch()` 已做错误兜底，不阻塞主流程。

### IMP-008 · 实体配色两套冲突
- **严重度**：✅ 已修复（三处单一来源一致）
- **文件:行号**：`src/components/workspace/ChapterEntitiesPanel.tsx:11,29-38`（面板）；`src/core/entity-highlighter.ts:16-31`（色源）；`src/app/api/entities/highlight/route.ts:11,45-62`（API）
- **现象（修复前）**：面板图例与正文高亮 span 使用两套硬编码配色，同一实体类别颜色对不上。
- **根因**：配色分散硬编码，无单一来源。
- **复验证据**：
  1. `git diff` 确认 `ChapterEntitiesPanel.tsx:11` import 改为含 `CHARACTER_COLOR, LORE_COLORS`；`:29-38` `buildGroups` 删除 10 个硬编码色值，改用 `CHARACTER_COLOR` / `LORE_COLORS.faction` 等。
  2. 读 `entity-highlighter.ts:16-31` 确认单一来源：
     ```ts
     export const CHARACTER_COLOR = "#F97316";
     export const LORE_COLORS = { faction:"#22C55E", item:"#FACC15", geography:"#38BDF8", magic_system:"#A855F7", technique:"#EF4444", creature:"#EC4899", culture:"#14B8A6", history:"#818CF8", law:"#F59E0B", currency:"#BEF264", custom:"#9CA3AF" };
     ```
  3. 读 `entities/highlight/route.ts:45-62` 确认 API 也引用同一 `CHARACTER_COLOR`/`LORE_COLORS`（注释"固定色单一来源"）。正文高亮 span、面板图例、API 三者引用同一常量，一致性成立。
- **建议**：无。

### IMP-009 · closureConditions 恒 []（附 P2 新坑）
- **严重度**：✅ 已修复（但抽取阈值与检测逻辑错配，P2）
- **文件:行号**：`src/core/agents/tool-registry.ts:665-682,706`；检测侧 `src/core/foreshadowing.ts:138-164`
- **现象（修复前）**：`closureConditions` 恒为 `[]`，伏笔详情页"收束条件"永远空白。
- **根因**：注册工具时未从 description 抽取闭包条件。
- **复验证据（修复成立）**：
  1. `git diff` 确认新增 `deriveClosureConditions(description)`：
     ```ts
     function deriveClosureConditions(description: string): string[] {
       if (!description) return [];
       const segments = description.match(/[一-鿿]{2,}/g) || [];
       const seen = new Set<string>(); const out: string[] = [];
       for (const s of segments) { if (seen.has(s)) continue; seen.add(s); out.push(s); if (out.length >= 8) break; }
       return out;
     }
     ```
  2. `:706` 已替换为 `closureConditions: deriveClosureConditions(description)`，不再恒 `[]`。
- **⚠️ 新坑（P2-#2 抽取阈值错配）**：
  - `deriveClosureConditions` 用 `[一-鿿]{2,}`（≥2 字）抽取闭包条件片段；
  - 但同模块 `foreshadowing.ts:138-164` 的 `extractSeeds` 抽 phrases 用 `[一-龥]{3,}`（≥3 字，过滤 2 字噪声）。
  - `detectPayoffs` 命中规则为"closureConditions 任一命中 **OR** phrases≥2 → fulfilled"。closure 分支因接受 2 字片段（如"一把/发现"等噪声），比 phrases 分支更宽松，存在 2 字噪声经 closure 分支误召的风险。
  - 影响：原"恒空"退化已修复，召回质量提升；但抽取粒度不一致，可能引入低质量/误召的收束条件。属观察级瑕疵，非阻断。
- **建议**：将 `deriveClosureConditions` 的正则阈值统一为 `[一-龥]{3,}`（与 `extractSeeds` 一致），消除 2 字噪声误召；或显式注释两处阈值差异的设计意图。

### IMP-010 · 2 字实体名无尾边界过召回（复核：维持现状是否合理）
- **严重度**：复核结论 —— 维持现状**合理**（Round4 铁律未破坏）
- **文件:行号**：`src/core/text/match.ts:140-146`；锁定用例 `src/core/text/match.test.ts`（含 :122 / :136）
- **现象（上轮处置）**：上轮判定为"移观察池·维持现状"，未改动，理由是 Round4 铁律"2 字不吞并保召回"及锁定用例 `match.test.ts:122/136` 不可破坏。
- **复验证据（复核通过）**：
  1. 读 `match.ts:140-146` 2 字 CJK 分支：
     ```ts
     if (len === 2 && keywordIsCjk) return true; // 直接命中，保召回
     ```
     注释明确："L1 报告 Q2 曾误判为缺陷，实为 Round4 既定铁律；trigger.test.ts 的「2字无吞并」回归用例已权威锁定"。铁律完好。
  2. `npx vitest run src/core/text/match.test.ts` → **34 passed**（含 2 字锁定用例 :122 / :136），无回归。
  3. `git diff` 确认本轮未触碰 `match.ts` 2 字分支（无改动），与上轮"维持现状"决策一致。
- **结论**：上轮"维持现状"工程决策**合理且已被本轮独立复验确认**。改动会破坏 Round4 铁律与锁定回归用例，维持现状为正确选择。

### IMP-011 · 世界卡片无编辑入口（附诚实边界：弹窗视觉定位需本地目测）
- **严重度**：✅ 已修复（全链路透传完整，复用 LorebookEditDialog）
- **文件:行号**：`src/components/workspace/WorldEntryCard.tsx:22-30`；`WorldEntryList.tsx:47`；`WorldPanel.tsx:131`；`LeftPanel.tsx:139`；末端 `src/app/workspace/[projectId]/page.tsx:1042,1146-1148,1163`
- **现象（修复前）**：世界卡片只读展示，无编辑按钮，用户须绕路到别处修改，召回/维护链路断裂。
- **根因**：`WorldEntryCard` 未暴露 `onEdit` 回调。
- **复验证据**：
  1. `git diff` 确认 `WorldEntryCard.tsx:22-30` 新增 `onEdit?` prop + 铅笔按钮 `onClick={() => onEdit?.(entry)}`。
  2. `WorldEntryList.tsx:47` 透传 `onEdit={onEdit}`；`WorldPanel.tsx:131` 透传 `onEdit={onEditEntry}`；`LeftPanel.tsx:139` `<WorldPanel ... onEditEntry={onEditLore} />`。
  3. 末端 `page.tsx`：`onEditLore={(id)=>{const l=project.lorebookEntries.find(x=>x.id===id); if(l) setEditingLore(l);}}` → `{editingLore && <LorebookEditDialog entry={editingLore} ... />}`。
  4. 全链路确认复用既有 `LorebookEditDialog`，无新建弹窗、无重复实现。
- **诚实边界**：沙箱无 Chromium，无法对"铅笔按钮视觉定位 / 弹窗在抽屉中的层级与遮挡"做像素级目测，标注**需本地目测**。

### IMP-012 · getEntityMap 失败静默返空
- **严重度**：✅ 已修复（重试 + lastGoodMap 降级）
- **文件:行号**：`src/core/entity-highlighter.ts:103-130`（含模块级 `lastGoodMap`）
- **现象（修复前）**：实体高亮地图获取失败时静默返回空 Map，导致正文整页失色且无任何提示。
- **根因**：catch 分支直接 `return new Map()`，无重试、无降级。
- **复验证据**：
  1. `git diff` + 读 `:103-130` 确认新增模块级 `lastGoodMap`；`getEntityMap` 封装 `fetchOnce()`（失败 `console.warn` 返 null），失败重试一次，两次均失败降级返 `lastGoodMap.get(projectId)`，仍无则返 `new Map()`。
  2. `npx vitest run src/core/entity-highlighter.test.ts` → **3 passed**（含降级路径）。
  3. 不再"静默返空"：至少会 `console.warn` 一次，且优先复用上一次成功结果，正文失色概率大幅下降。
- **诚实边界**：极端并发（多项目交替失败/恢复）下的 `lastGoodMap` 竞态未做压测，标注**观察级**（逻辑上为单进程内存 Map，常规使用无障碍）。

---

## 三、复验中挖掘的新坑（残留问题）

| 编号 | 严重度 | IMP 关联 | 文件:行号 | 现象 / 影响 | 建议 |
| --- | --- | --- | --- | --- | --- |
| P2-#1 | P2（技术债） | IMP-006 | `LorebookEditDialog.tsx:118-121` vs `worldPanelData.ts:5-18` | 分类仍硬编码于 select，未从 `WORLD_MODULES` 动态生成；未来新增分类需两处同步改，易再次漏类。 | 改为 `WORLD_MODULES.map(m => <option .../>)` 单一来源。 |
| P2-#2 | P2（质量瑕疵） | IMP-009 | `tool-registry.ts:668` vs `foreshadowing.ts:138-164` | `deriveClosureConditions` 用 `[一-鿿]{2,}`（≥2 字），与 `extractSeeds` 的 `[一-龥]{3,}`（≥3 字）阈值错配；closure 分支接受 2 字噪声，可能经"任一命中"规则误召收束条件。 | 统一为 `[一-龥]{3,}`，或显式注释阈值差异意图。 |

> 无 P0 / P1 级残留问题。两处 P2 均不破坏现有功能、不破坏门禁（tsc 0 错、211 测试通过），属可排期优化项。

---

## 四、诚实边界（沙箱能力声明）

- **环境限制**：沙箱无 Chromium / 可视化浏览器，所有"视觉层"断言（按钮定位、弹窗层级、色块肉眼比对）均**无法机验**，已显式标注"需本地目测"。
- **已机验部分**：全部 7 项 IMP 的代码改动（`git diff`）、源码上下文（Read）、相关单元测试（`vitest run`：entity-highlighter 3 + match 34 = 37 passed）、以及 IMP-007 端点真机触发（`curl` 返 `ok:true`）均已实测通过。
- **未压测部分**：IMP-012 `lastGoodMap` 极端并发竞态、IMP-011 弹窗在复杂抽屉布局中的视觉层级，未作压力/像素级验证，标注观察级。
- **门禁一致性**：本轮独立复验结果与 Chair 已核验门禁一致（`tsc --noEmit` EXIT=0；`npm test` 211 passed），未发现破坏门禁的回归。

---

## 五、本透镜复验结论

**设定检索召回归透镜复验完成**：上轮阶段四"声称修复"的 7 个 IMP 中，6 项（IMP-006/007/008/009/011/012）经代码 diff + 源码 + 测试 + 真机（IMP-007）独立复验，**确认真实修复且逻辑自洽**；IMP-010"维持现状"决策经 `match.ts` 铁律 + `match.test.ts` 34 例锁定用例**复核确认合理**，未引入回归。

- **残留问题数**：**P0: 0 / P1: 0 / P2: 2**
  - P2-#1：IMP-006 分类硬编码同源技术债（`LorebookEditDialog.tsx:118-121` vs `worldPanelData.ts:5-18`）
  - P2-#2：IMP-009 抽取阈值错配致 2 字噪声误召风险（`tool-registry.ts:668` vs `foreshadowing.ts:138-164`）
- **IMP-010 复核结论**：维持现状**合理**（Round4 铁律 `match.ts:144-146` 完好，`match.test.ts` 34 例通过，上轮未改动 2 字分支）。
