# Round-7 复检报告 · 监控去误报 + UI 可达性 + 主题 AA

- 复检对象：novel-forge（Next.js 16 / React 19 / Tailwind v4 / Prisma 7 / Postgres）v1.6.7（commit a68be8a）
- 复检范围：监控去误报（API 巡检）、UI 可达性（hover/焦点反馈、对比度）、主题 AA（深 / 浅 / 苍青三主题）
- 复检方式：**只读**通读 + 全仓 Grep + 对比度实测（WCAG 2.1 sRGB 相对亮度公式，非肉眼估算）。未修改任何源代码。
- 术语速查（大白话）：
  - **WCAG AA**：网页无障碍国际标准里的一档对比度及格线，普通小字要求前景色与背景色对比度 ≥ 4.5:1。
  - **对比度 4.5:1**：把两种颜色按亮度公式算成一个比值，越大越清晰；小于 4.5 即弱视/普通用户难辨认，算“不及格”。
  - **令牌（token）**：CSS 变量（如 `--nv-text-tertiary`），一处定义、全局换肤复用。

---

## 摘要

本轮在 v1.6.7 上做深度体检，**确认真实可复现缺陷 1 处（P1）**，潜在脆弱点 2 处（P2），其余聚焦子系统均经实测确认无问题。

| 分级 | 数量 | 条目 |
|---|---|---|
| P0（数据错误/崩溃） | 0 | — |
| P1（功能退化/明显错） | 1 | F1 浅色主题 tertiary 文字对比度全系低于 AA |
| P2（边角/体验） | 2 | F2 监控接口每次切章无缓存全量扫节点；F3 巡检脚本模板/注释两类漏检脆弱点 |
| 已确认无问题 | 5 | 见文末 |

> 结论基调：v1.6.7 在“监控去误报”和“surface-3 muted 三主题 AA”这两个上一轮重点修过的子系统上**扎实过关**；唯一真实缺口是**浅色主题第三级文字色（tertiary）对比度未达 AA**，且这一点代码内注释本身已自认（属“已知但未修”的退化，并非偶然回归）。

---

## 坑位表

### F1 ｜ 浅色主题 `--nv-text-tertiary` 对比度全面低于 WCAG AA —— P1

- **文件:行**
  - 定义：`src/app/globals.css:281`（`--nv-text-tertiary: #6B6E78;`）
  - 广泛调用：`src/components/workspace/MonitorPanel.tsx:86,100,112,125,131,150,160,188,199,274,301,303,311,322`（StatBlock / Row / TokenRow 标签几乎全用 `text-[var(--nv-text-tertiary)]`）；`src/app/workspace/[projectId]/page.tsx`、`settings`、`dissect`、`workshop`、`tables` 等页面同款用法上百处。
- **现象**：切换到浅色主题（`html.light`）后，大量“次级说明文字”对比度不足，弱视/普通用户在浅色页面看标签发灰、难辨认。
- **证据（实测对比度，WCAG 2.1）**：
  - `#6B6E78` on 页面底 `#F3EFE8` = **4.44:1**（< 4.5 不及格）
  - `#6B6E78` on `surface-1`（`rgba(15,18,30,0.025)` 合成 `#EDE9E3`，正是 MonitorPanel `StatBlock` 的背景）= **4.21:1**（不及格）
  - `#6B6E78` on `surface-3`（`#E1DDD8`）= **3.76:1**（明显不及格）
  - 仅在纯白卡片（`rgba(255,255,255,0.7)` 合成）上 = 4.88:1（压线及格）
  - 对照：深主题 `#98968C` on `#0E1424` = **6.18:1**，苍青 `#7C918D` on `#04090C` = **5.99:1**，两者均远超 AA。
- **代码自认**：`globals.css:283` 原注释明确写道——“浅色 tertiary `#6B6E78` 在同面仅 3.765:1（本身<AA）……按 recheck「浅色需更深的灰」取合规值”。但作者当时的取舍是“为保 muted<tertiary 层级”而**主动把 tertiary 留在了 AA 线以下**。
- **复现路径**：
  1. 用 `ThemeToggle` 切到浅色（`document.documentElement.className` 含 `light`）。
  2. 打开任意作品 → 右侧「监测面板」(MonitorPanel) 或「伏笔面板」。
  3. 看“字数概览 / 确认流程 / Token 估算 / 章节分布 / 数据记录”等小节标题与 `StatBlock` 标签（均为 tertiary）。
  4. 用浏览器无障碍工具（或 axe / 对比度插件）量取，即见 3.76–4.44:1，低于 4.5:1。
- **分级理由**：本子系统主题就是“主题 AA”，而 tertiary 是浅色主题里**最高频**的文字层级之一，全站浅色下普遍不及格，直接背离本轮体检目标，判 P1（但属“已知取舍”，非新引入回归）。
- **建议修复**：把浅色 `--nv-text-tertiary` 加深到约 `#5E616B`–`#63666F` 区间（实测 `#60636D` 在 `#F3EFE8` 上约 4.7:1、在 `surface-1` 上约 4.5:1 达标），同时校验仍保持 `muted(#696C75≈4.6) < tertiary` 的层级顺序（需把 muted 同步微调或确认顺序不反）；改后跑一次浅色主题全页对比度抽检。

---

### F2 ｜ 监测接口每次切章都无缓存全量扫节点 —— P2

- **文件:行**：`src/app/api/stats/monitor/route.ts:48-57`（每次请求都跑 `prisma.storyNode.findMany` 全量节点 + 3 个 count），缓存仅覆盖 `llmUsage/projectLlm` 段（`route.ts:15-36,117-180`）。
- **现象**：`MonitorPanel` 的 `useEffect` 依赖 `[projectId, nodeId]`（`MonitorPanel.tsx:71`），**每切换一章 nodeId 变化 → 重新请求**；而节点清单/摘要/节拍/承诺这 4 个查询（不含正文，内存安全）**每次都重跑全项目 `findMany`**，未随 LLM 聚合一起进 30s 缓存。
- **证据**：route.ts 第 48 行起的 `Promise.all([...findMany(where:{projectId}, select:{...})..., count, count, count])` 位于 try 顶部，在 `getCachedMonitor` 命中分支之外，必然每次执行；注释（line 13-14、115-116）只承诺“切章不再重跑全月 groupBy”，未覆盖节点扫描。
- **复现路径**：长项目（如数千节点）→ 在工作区左侧目录反复切章 → 每次切章 `/api/stats/monitor` 都返回全量节点扫描；项目越大单次请求越重（非 OOM，但属“超长请求”风险，且是重复无效负载）。
- **分级理由**：非崩溃、非数据错误，属长项目性能退化，判 P2。
- **建议修复**：把“节点清单 + 三个 count”也按 `projectId` 做短时缓存（如 10–15s，与现有 `MONITOR_CACHE_TTL_MS` 同机制、同 `MAX_SIZE` 护栏），命中即跳过；或节点查询改用 `take`/分页或仅在 `projectId` 变化时拉取。注意 `currentNode`（依赖 nodeId）需单独按 nodeId 取，不能整段缓存。

---

### F3 ｜ API 巡检脚本两类漏检脆弱点（当前 0 误报，但有潜在缺口）—— P2

- **文件:行**：`scripts/audit-api-refs.cjs`（重点 `:92-104` 提取、`R2-011` 反误报规则 `:4-8`）。
- **现象 / 风险点**（当前均未触发，但机制上脆弱）：
  1. **模板插值整体忽略（`:97-100`）**：凡 `/api/...` 内含 `${` 一律 `IGNORED_TEMPLATE_INTERPOLATION`（本轮实测 **70 处** 被忽略）。若某处写成 `` fetch(`/api/broken/${id}`) `` 指向后端不存在的路由，**不会被报出**——真死链被静默放过（漏检）。
  2. **注释中的 `/api/` 未被剔除**：`walk` 用正则 `matchAll(/[`"'](\/api\/...)/)` 抓字符串，但**不过滤 `//` 注释**。若某注释里残留一条指向已删除路由的 `/api/xxx`，会被当真引用 → 误报 BROKEN（误报）。（本轮 `REAL_BROKEN_LINKS 0`，故当前无此误报。）
- **证据 / 实测**：
  - 运行脚本：`TOTAL_REFS 70 REAL_BROKEN_LINKS 0`，`IGNORED_TEMPLATE_INTERPOLATION 70`、`IGNORED_DOC_STRINGS 1`（changelog 白名单命中）。
  - 我额外做了 **manifest ∪ 文件系统** 一致性核对：`MANIFEST_COUNT 99 / FS_COUNT 102 / 在清单但不在文件系统 = 0`（无清单滞后型误报），故“陈旧清单藏死链”的漏检路径当前为 0。
- **复现路径**：
  - 漏检：在任意 tsx 写 `` fetch(`/api/does-not-exist/${id}`) `` → 跑脚本 → `REAL_BROKEN_LINKS` 仍为 0（被模板规则吞掉）。
  - 误报：在注释写 `// 调用 /api/deleted-route` 且后端已删 → 跑脚本 → 出现 `BROKEN /api/deleted-route`（若该路由确已不存在）。
- **分级理由**：当前输出正确（0 误报、0 漏检），属“规则边缘脆弱”而非现存 bug，判 P2。
- **建议修复**：① 提取前先剥 `//` 与 `/* */` 注释行；② 对模板插值不要“整条忽略”，改为“抽取静态前缀 + 动态段归一”（如 `/api/projects/${id}` → `projects/[id]`）后照常走 `routeExists` 动态段匹配，从而把“真死链但带插值”也纳入核对。

---

## 已确认无问题（诚实边界）

以下子系统本轮**实测确认无真实缺陷**，如实标注，不夸大：

1. **API 巡检脚本核心（去误报）**：`REAL_BROKEN_LINKS=0`；manifest 与 `src/app/api` 文件系统并集一致（清单滞后型误报 = 0）；文档白名单（`changelog-data.ts`）生效。核心“去误报”目标达成。（残留脆弱点见 F3，非现存 bug。）

2. **ForeshadowingPanel hover 配色**：逐行核对 hover/焦点态——分组标题 `hover:bg-[var(--nv-surface-2)]`（`:297`）、条目 `hover:bg-[var(--nv-surface-2)]`（`:312`）、保存按钮 `hover:bg-[var(--nv-surface-3)]`（`:374`）、重生成按钮 `hover:bg-[var(--nv-surface-2)]`（`:381`），全部指向**已定义**令牌。上一轮修复的 `surface-4` 已在组件内清除；全仓唯一残留 `var(--nv-surface-4)` 仅出现在 `src/lib/changelog-data.ts` 的**变更说明文本**里（属文档，非真实样式），且本就被脚本白名单跳过。→ hover 反馈无“指向未定义令牌导致无反馈”问题。

3. **`--nv-text-muted-on-surface-3` 三主题 AA**：实测均 ≥ 4.5:1 且 muted<tertiary 层级未反：
   - 深：`#96948B` on `#242938` = **4.76:1**
   - 浅：`#5A5D67` on `#E1DDD8` = **4.86:1**
   - 苍青：`#708885` on `#131B1E` = **4.61:1**（临界达标，建议后续复核留 3% 余量）
   → surface-3 上的 muted 文字 AA 已修好。另：全仓 `text-[var(--nv-text-muted)]`（非 on-surface-3 变体）与 `bg-[var(--nv-surface-3)]` 同元素的真实组合**仅**出现在带 `/50·/30·/20·/10` 透明度修饰的位置（背景被进一步稀释→更暗→对比度反而更高），未发现“plain muted 直接压在满血 surface-3 上”的回归。

4. **context-loader OOM / 超长请求**：`src/core/pipeline/context-loader.ts` 已落实 R2-012——全量节点只 `select` 结构字段不拉正文（`:34-51`），窗口内正文补拉被 `MAX_CHAPTER_WINDOW = 60`（`:190-193`）与“卷感知下限”双重封顶，无无界 content 加载。→ 无 OOM 风险。

5. **深 / 苍青主题 tertiary 对比度**：深 `6.18:1`、苍青 `5.99:1`，均远超 AA；深/苍青的 muted、muted-on-surface-3 亦全部达标。→ 三主题里只有**浅色 tertiary** 不合格（F1）。

> 额外说明（非缺陷，边角观察）：Tailwind v4 对 `bg-[var(--nv-surface-3)]/50` 这类“对任意 `var()` 颜色加 `/NN` 透明度”会生成 `color-mix(... 50%, transparent)`，导致本就半透明的 surface 再被稀释，**hover 背景变化极微弱**（近乎不可见），属“反馈偏弱”而非“无反馈”。如需明确 hover 反馈，建议对这些按钮改用不透明的 `surface-2`/`surface-3` 或显式边框变化，而非在已透明令牌上叠加透明度。
