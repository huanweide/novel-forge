# Round-7 修复报告 · 监控去误报 + UI 可达性（monitor/ui-theme 修复 Agent）

- 修复对象：novel-forge（Next.js 16 / React 19 / Tailwind v4 / Prisma 7 / Postgres）工作树当前 HEAD = `4a07c24`（v1.6.8，含 round-7 收口）。
- 复检报告：`PROCESS/meetings/round-7/recheck-monitor-ui-theme.md`（基于 a68be8a 状态撰写）。
- 本 Agent 负责范围：**浅色主题 tertiary 令牌（globals.css）+ 监控相关组件/接口（MonitorPanel、monitor/route.ts）+ API 巡检脚本**。
- 严守边界：**未触碰 ForeshadowingPanel 及任何其他 Agent 文件**；未删除任何现有测试；未破坏其他功能。

## 术语速查（大白话）

- **WCAG AA**：网页无障碍国际标准里的对比度及格线，普通小字要求「前景色 : 背景色」对比度 ≥ 4.5:1。
- **相对亮度对比度公式**：`(L1 + 0.05) / (L2 + 0.05)`，其中 `L` 是把颜色按 sRGB 转成「相对亮度」的值；分子取较亮色、分母取较暗色。**比值越大越清晰**，< 4.5 即「不及格」。
- **令牌（token）**：CSS 变量（如 `--nv-text-tertiary`），一处定义、全局换肤复用。
- **合成色**：浅色令牌 `--nv-surface-1` 是 `rgba(15,18,30,0.025)`（半透明叠在页面底上），需先算它在页面底 `#F3EFE8` 上的「合成不透明色」再算对比度。
- **lookbehind（后行断言）**：正则里「前面必须是某字符才匹配」的写法，这里用来保证只抓引号/反引号包住的真实 `/api/` 字符串，避免误伤正则字面量。

---

## 发现与处理总览

| 项 | 分级 | 文件:行 | 处理 | 结果 |
|---|---|---|---|---|
| F1 浅色 tertiary 对比度 | P1 | `src/app/globals.css:281` | 工作树已是合规值 `#5E616B`，复核确认三背景全 ≥4.5，**未改动** | 已达标（验证） |
| F2 监控接口每次切章全量扫节点 | P2 | `src/app/api/stats/monitor/route.ts:48-57` | 新增按 projectId 短 TTL 内存缓存 | 已修复 |
| F3 巡检脚本注释/模板两类脆弱点 | P2 | `scripts/audit-api-refs.cjs` | ① 过滤注释；② 模板归一后核对（嵌套模板保守忽略） | 已修复 |

> 说明：复检报告基于 a68be8a 撰写，当时 globals.css:281 为 `#6B6E78`。但工作树已推进到 v1.6.8（commit `4a07c24`，round-7 收口），该值已被改为 `#5E616B`（NEW-UI-WC-2）。本 Agent 对 F1 重新核算后确认该值已满足 AA，故**保留不回退**（回退到 `#6B6E78` 反而会让浅色 tertiary 重新不及格）。

---

## F1 ｜ 浅色主题 `--nv-text-tertiary` 对比度（P1，已达标·验证）

### 文件:行
- `src/app/globals.css:281`：`--nv-text-tertiary: #5E616B;`（工作树现值为此，非复检报告所写的 `#6B6E78`）

### 改动要点
**无代码改动**。工作树里该令牌已为 `#5E616B`（由 v1.6.8 收口落地），本 Agent 独立用 WCAG 2.1 相对亮度公式复核。

### 对比度核算（公式 `(L亮+0.05)/(L暗+0.05)`，sRGB 相对亮度）
浅色三背景取值：
- 页面底 `#F3EFE8`（不透明）
- `--nv-surface-1` = `rgba(15,18,30,0.025)` 叠在 `#F3EFE8` 上的**合成色** = `#EDE9E3`（即 MonitorPanel `StatBlock` 背景）
- `--nv-surface-3` = `#E1DDD8`

| 候选值 | 页面底 | surface-1(StatBlock) | surface-3 | 最小值 |
|---|---|---|---|---|
| `#6B6E78`（复检原值） | 4.44 | 4.22 | **3.76** | 3.76 ❌ |
| **`#5E616B`（现工作树值）** | **5.39** | **5.13** | **4.57** | **4.57 ✅** |
| `#60636D`（复检建议之一） | 5.23 | 4.98 | **4.44** | 4.44 ❌ |
| `#5A5D67`（muted-on-surface-3） | 5.73 | 5.45 | 4.86 | 4.86 ✅ |

核算结论：
- 现工作树值 **`#5E616B` 在三背景上分别为 5.39 / 5.13 / 4.57，最小值 4.57 ≥ 4.5**，已达标。
- 复检报告建议的 `#60636D` 经实测在 surface-3 上仅 **4.44 < 4.5**（复检报告当时称「surface-1 约 4.5」但漏算了最严苛的 surface-3），故 `#60636D` 实际上**不达标**；v1.6.8 选的 `#5E616B` 才是正确的合规值。
- 层级：tertiary `#5E616B`（surface-3 上 4.57）仍**弱于**专用 `--nv-text-muted-on-surface-3` `#5A5D67`（4.86），且明显弱于 secondary `#4A4D57`、primary `#1A1C22`，层级未倒挂、仍需可读的目标达成。

### 组件影响（grep 确认）
- 全仓 `#6B6E78` 仅残留在 `changelog-data.ts` 的变更说明文本与 globals.css 注释里（属文档，非样式）。
- `MonitorPanel.tsx` 等组件均通过 `text-[var(--nv-text-tertiary)]` 引用令牌 → **自动受益**，无需改组件；未发现任何组件硬编码 tertiary 等价色（grep 无命中），故未做组件层修正。

### 验证
- 独立 node 脚本按 WCAG 公式核算（见上表），最小值 4.57 ≥ 4.5。
- 未改动 globals.css，浅色三主题层级与已有修复一致。

### 是否真生效
是（工作树现状态已生效，非本次新写）。残留风险：无（值已正确）。

### 残留风险
极低。唯一边角：`#5E616B` 在 surface-3 上 4.57 仅比 4.5 高 0.07（约 1.5% 余量），若日后 surface-3 明度被调暗需重测；当前安全。

---

## F2 ｜ 监测接口每次切章无缓存全量扫节点（P2）

### 文件:行
- `src/app/api/stats/monitor/route.ts:48-57`（现 `:88-122` 改造后）

### 改动要点（关键 diff 片段）
新增与现有 LLM 聚合缓存**同机制、同护栏**的「节点扫描缓存」（按 `projectId` 短 TTL 内存缓存，命中即跳过全量 `findMany`）。`currentNode` 仍依赖 `nodeId`，从（缓存/实查的）`nodes` 中 `find`，**不随聚合缓存整段跳过**。

```ts
// 新增缓存（route.ts 顶部，紧接 monitorCache 之后）
const NODE_SCAN_CACHE_TTL_MS = 15_000;   // 15s 短 TTL
const NODE_SCAN_CACHE_MAX_SIZE = 512;    // 与 MONITOR_CACHE_MAX_SIZE 同护栏
type MonitorNode = { id:string; title:string; type:string; status:string;
  wordCount:number; order:number; updatedAt:Date; reviewLogs:unknown };
interface NodeScanEntry { ts:number; nodes:MonitorNode[]; summaries:number; beats:number; commitments:number; }
const nodeScanCache = new Map<string, NodeScanEntry>();
function getCachedNodeScan(projectId:string){ const h=nodeScanCache.get(projectId);
  if(h && Date.now()-h.ts < NODE_SCAN_CACHE_TTL_MS) return h; return null; }
function setCachedNodeScan(projectId:string, nodes, summaries, beats, commitments){ ...容量护栏... }

// try 顶部改造：原无条件 Promise.all(findMany+3 count) 改为缓存优先
const cachedScan = getCachedNodeScan(projectId);
let nodes: MonitorNode[]; let summaries:number; let beats:number; let commitments:number;
if (cachedScan) {
  ({ nodes, summaries, beats, commitments } = cachedScan);   // 命中：跳过全量扫描
} else {
  [nodes, summaries, beats, commitments] = await Promise.all([ findMany(select{...}),
    chapterSummary.count, storyBeat.count, pendingCommitment.count ]);
  setCachedNodeScan(projectId, nodes, summaries, beats, commitments);
}
```

### 为什么这样改
- `MonitorPanel` 的 `useEffect` 依赖 `[projectId, nodeId]`，切章时 `nodeId` 变 → 重新请求；但「节点清单 + 三个 count」只随 `projectId` 变，与 `nodeId` 无关。
- 缓存按 `projectId` 命中（15s TTL）：同一作品内反复切章，前 15s 内直接复用，避免对长项目（数千节点）每次切章重跑全量 `findMany`。
- 轻量：纯 `Map` 内存缓存 + 容量护栏，**未引入任何重型缓存库**；与既有 `monitorCache` 风格一致。
- `currentNode`（依赖 nodeId）仍从 `nodes` 中 `find`，行为不变。

### 验证
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`：本文件 0 错误（仅出现与本次无关的他人半成片错误，见「待统一 tsc 复验」）。
- 无 monitor 路由的单测文件（已 grep 确认 `src` 下无测试 import `stats/monitor`），不影响 283 vitest 全绿门禁。

### 是否真生效
逻辑生效（命中分支跳过 `findMany`）。运行时需真实 Postgres 才能端到端验证；类型与结构已通过 tsc。建议后续在长项目上手动验证「连续切章 → 第二次请求不再出现全量扫描延迟」。

### 残留风险
- 节点数据在 15s TTL 内被编辑后，监测面板最多有 15s「读到旧扫描结果」（但 `currentNode` 标题/字数等来自同一缓存 nodes，自洽；LLM 成本段另有 30s 缓存）。属可接受的短延迟，非数据错误。
- `reviewLogs: true` 使缓存持有各节点 reviewLogs（Json，非正文），内存占用受 `MAX_SIZE=512` 与 15s TTL 双重封顶，无泄漏风险。

---

## F3 ｜ API 巡检脚本两类脆弱点（P2）

### 文件:行
- `scripts/audit-api-refs.cjs`：提取段 `:91-92`（现 `:94-120`）、输出 `:138-139`（现 `:158-159`）

### 改动要点（关键 diff 片段）

**① 过滤 `//` 与 `/* */` 注释**（避免注释里的 `/api/` 被当真引用误报；用 `[^:]` 保护 `http://`/`https://` 不被误删）：

```js
const c = cRaw
  .replace(/\/\*[\s\S]*?\*\//g, " ")        // 块注释 → 空格
  .replace(/([^:])\/\/[^\n]*/g, "$1")       // 行注释（非 :// 后）删除
  .replace(/^\/\/[^\n]*/gm, "");            // 行首 // 注释删除
```

**② 模板插值不再「整条忽略」，改为动态段归一后照常核对**；用 lookbehind 保证只抓引号包住的 `/api/`，完整捕获含 `${...}` 的模板；归一 `${...}`→`[id]` 后走 `routeExists` 动态段匹配。对**嵌套/复杂模板字面量**（归一后残留反引号或 `${`）保守退回「忽略」，避免误报：

```js
const m = c.matchAll(/(?<=['"`])\/api\/[^\s`'"?]*(?:\$\{[^}]*\}[^\s`'"?]*)*/g);
for (const x of m) {
  const raw = x[0];
  let k = normUrl(raw);
  if (!k) continue;
  if (k.includes("${")) {
    const normalized = raw.replace(/\$\{[^}]*\}/g, "[id]");
    if (/[`]/.test(normalized) || normalized.includes("${")) { ignoredTemplate++; continue; } // 保守：嵌套模板忽略
    k = normUrl(normalized);
    templateHandled++;
    if (!k) continue;
  }
  const list = refs.get(k) || []; list.push(rel); refs.set(k, list);
}
```

输出行新增透明指标：`TEMPLATE_NORMALIZED_AND_CHECKED`（归一并核对数量）。

### 为什么这样改
- 修复前：70 处模板插值（如 `/api/projects/${id}`）被**整条忽略** → 真死链（如 `/api/does-not-exist/${id}`）会被静默放过（漏检）；且注释里的 `/api/` 未剔除 → 潜在误报。
- 修复后：简单模板（单段 `${var}` 作动态路由）被归一为 `[id]` 并纳入 `routeExists` 动态段匹配，**真死链会被报出**；注释里的 `/api/` 被剥离，杜绝误报；**嵌套模板字面量**（如 `GenerationLatencyPanel.tsx` 的 `` `/api/generation-metrics${projectId ? `?projectId=...` : ""}` ``）无法可靠解析，保守忽略，避免引入误报——契合任务「保守处理，避免真死链被放过的风险扩大」的边界要求。

### 验证（脚本实际运行）
```
TOTAL_REFS 101  REAL_BROKEN_LINKS 0
IGNORED_TEMPLATE_INTERPOLATION 1  TEMPLATE_NORMALIZED_AND_CHECKED 69  IGNORED_DOC_STRINGS 1
```
- `REAL_BROKEN_LINKS 0`：**无新增误报**（未像初版那样把嵌套模板误报为 `generation-metrics${projectId}`）。
- `IGNORED_TEMPLATE_INTERPOLATION 1`：仅 GenerationLatencyPanel 的嵌套模板被保守忽略（原 70 处中的复杂项）。
- `TEMPLATE_NORMALIZED_AND_CHECKED 69`：69 个简单模板已归一并核对（此前这些被整条忽略）。
- 对比初版（误报 1 个 `generation-metrics${projectId}`）已消除。

### 是否真生效
是。脚本输出 `REAL_BROKEN_LINKS 0` 且不再误报嵌套模板；简单模板现在进入核对路径。

### 残留风险
- 真死链若恰好写在**嵌套模板字面量**内（极罕见，如 `GenerationLatencyPanel` 那种），仍按「忽略」处理，理论上可能漏检。但此类写法通常动态拼接，常规路由核对本就难覆盖；且原规则「整条忽略」已覆盖此情形，未扩大风险。
- 注释过滤用 `[^:]` 保护 `http://`；若某行 `//` 前字符恰为 `:` 但仍为代码（非协议），理论上可能漏剥，但后端路由不会以 `://` 形式出现在注释外，风险可忽略。

---

## 验证汇总

| 项 | 命令 / 方式 | 结果 |
|---|---|---|
| F1 对比度 | 独立 node 脚本按 WCAG 公式核算 | `#5E616B` 三背景 min 4.57 ≥ 4.5 ✅（未改文件） |
| F2 tsc | `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` | `monitor/route.ts` 0 错误 ✅ |
| F3 脚本 | `node scripts/audit-api-refs.cjs` | `REAL_BROKEN_LINKS 0`，无误报、模板已归一核对 ✅ |
| 测试门禁 | grep 确认无测试 import `stats/monitor`；脚本非 vitest 覆盖 | 283 vitest 全绿不受影响（未触碰被测代码）✅ |

### 待统一 tsc 复验（非本 Agent 责任，他人半成片）
`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 仍报 2 处错误，均位于**非本 Agent 文件**：
- `src/app/api/story/nodes/auto-confirm/route.test.ts:49,14`：`Object is possibly 'undefined'`
- `src/app/api/story/nodes/auto-confirm/route.test.ts:49,19`：`Tuple type '[]' of length '0' has no element at index '0'`

该文件为 `??`（未跟踪）状态，属其他 Agent 的半成片测试，**非本次改动引入**，按指令标注「待统一 tsc 复验」，不在本 Agent 修复范围。

---

## 边界与诚实声明
- **未改动** ForeshadowingPanel 及任何其他 Agent 负责文件。
- **未删除**任何现有测试或破坏其他功能。
- F1 在工作树中已由 v1.6.8 收口落地（`#5E616B`），本 Agent 复核确认其合规后**保留不回退**（回退会重新制造对比度不达标）。
- F2/F3 均为轻量、局部改动，未引入新依赖库。
