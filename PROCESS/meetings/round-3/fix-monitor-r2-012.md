# 魔王系统 Round-3 修复监控 · R2-012 功能退化修复

- 修复 Agent：代码修复 Agent（隶属魔王系统 Round-3）
- 修复对象：R2-012（生成上下文无界全量加载）引入的功能退化隐患（round-2 recheck 新坑 1）
- 目标文件：`src/core/pipeline/context-loader.ts`
- 副读文件：`src/core/pipeline/outline-context.ts`、`src/core/pipeline/post-processor.ts`
- 修复日期：2026-08-07

---

## 一、问题回顾（来自 round-2 recheck-1/lens-monitor.md 新坑 1）

R2-012 将「全量节点」改为「轻量 select（只取结构字段）+ 窗口内按需补回正文」以省内存。但其窗口度量口径存在错位：

- `keepWindow` 以「整体节点序号」度量（min 5），而下游 `extractPrevContext`（`outline-context.ts:113-129`）以「章/节节点序号（type===chapter||section）」度量（取前 5 章）。
- 当项目穿插 `volume / section / scene` 等非章节点时，「前 5 章」对应的整体序号跨度大于 5，导致 `extractPrevContext` 注入的前文被截断（部分章正文缺失退化为「无」），即补拉的正文与章序号错位。
- 文档同时指出：单一「最近 5 章」一刀切会在多卷项目里造成跨卷断崖（上一卷尾部衔接章丢失）。

---

## 二、改动文件与行

唯一改动文件：`src/core/pipeline/context-loader.ts`

- 改动区间：约 99 行（`// R2-012：按需补全...`）至 219 行（`allNodes` 合并结束；原实现位于 99-119 行，共约 21 行，替换为约 120 行的窗口计算 + 合并逻辑）。
- 未改动任何下游消费代码（write/refine/continue 路由、`extractPrevContext`、`post-processor` 均原样保留）。

---

## 三、窗口边界与排序修复（核心逻辑）

将原来单一的「整体序号窗口」拆分为两个窗口取并集，并新增多卷感知与排序约束：

### 1. 保留整体序号窗口（A）—— 兼容 write/refine/continue
- `curIdx = allLight.findIndex(id === nodeId)`
- 取 `allLight.slice(Math.max(0, curIdx - keepWindow), curIdx)` 的 id 补拉正文。
- 覆盖：`write/route.ts:69`（previousNodes = allNodes.slice(idx - keepChapters, idx)）、`refine`、`continue/route.ts:96`（filter(n.content).slice(-5)）。keepWindow ≥ keepChapters(默认4) 且 ≥5，故这些紧邻前文仍有正文，无回归。

### 2. 新增章/节序号窗口（B）—— 与 extractPrevContext 对齐
- 构建 `chapterNodes = allLight.filter(type===chapter||section)`（与 `extractPrevContext` 过滤口径完全一致）。
- `curChIdx = chapterNodes.findIndex(id === nodeId)`。
- 默认取 `chapterNodes.slice(Math.max(0, curChIdx - keepWindow), curChIdx)` —— 以章/节数组序号度量，彻底消除「整体序号 vs 章序号」的错位，使 `extractPrevContext` 的 prev5 章全部有正文。

### 3. 多卷感知（B 的下限扩展）—— 避免跨卷断崖
当当前章存在所属卷（`findVolumeId` 沿 `parentId` 向上回溯到 `type==="volume"` 的祖先）时：
- 下限下探到「当前卷在章/节数组中的起始下标」（`chVolumeIds.indexOf(curVolumeId)`），即至少覆盖当前卷全部章。
- 再向上包含「上一卷尾部衔接章」：取 order 小于当前卷的上一卷，取其章/节节点下标的最大值，向前扩展 `TAIL_BRIDGING = 3` 章，保证卷间过渡上下文不丢失。
- 即窗口下限 = min(keepWindow 起点, 当前卷起点, 上一卷尾部-3 起点)。

### 4. 安全上限（保留 R2-012 性能收益）
- `MAX_CHAPTER_WINDOW = 60`：当章/节窗口跨度超过 60 时回落到 `curChIdx - 60`，避免超大卷导致无界补拉正文（仍只补窗口内，不回退到全量加载）。

### 5. 排序与一一对应（杜绝错位）
- 补拉查询显式 `orderBy: { order: "asc" }`。
- 合并时按 id 回填到「按 order 升序的 allNodesLight 骨架列表」（`allLight.map(n => full ?? n)`）—— 绝不重排，下游 `n.order` 与章节序号严格 1:1 对应。

性能收益保留：轻量 select 仍只取结构字段；仅对并集中「窗口内节点」执行一次无 select 的 `findMany` 补拉正文，不无界全量拉 content。

---

## 四、验证结果

### 1. 类型检查
- 命令：`cd 项目根 && SAFE_DELETE_DISABLE=1 npx tsc --noEmit`
- 结果：退出码 0，零错误（无新增 TS 报错）。

### 2. 测试
- 项目根无 `context-loader` / `pipeline` 相关单元测试（已检索 `*.test.ts` 确认不存在）。
- 故采用「静态推演多卷场景」验证，并附可复现的纯逻辑模拟（不依赖数据库）。

### 3. 多卷场景静态推演（已实跑模拟，节选关键输出）
构造结构：`卷一(volume) → 第1-3章、第一节(section)、第4-5章`；`卷二(volume) → 第6-8章`。当前章 = 第8章。

- 旧逻辑（整体序号窗口 keepWindow=5）：补拉 `[第4章, 第5章, 卷二, 第6章, 第7章]`；`extractPrevContext` 需要的 prev5 = `[第一节, 第4章, 第5章, 第6章, 第7章]` → **缺失 `第一节`（被截断/错位）**。
- 新逻辑（章/节窗口 + 多卷感知 + 整体窗口并集）：补拉 `[第4章, 第5章, 卷二, 第6章, 第7章, 第一节]`；prev5 全部命中 → **缺失：无**。

结论：错位/截断已消除；当前卷（第6、7章）+ 上一卷尾部衔接章（第4、5章、第一节）均在窗口内，跨卷断崖问题解决。

---

## 五、诚实声明

- 代码层修复已落地并经 `tsc --noEmit` 零错误验证；多卷窗口逻辑经独立纯逻辑模拟实跑确认对齐与截断修复（模拟与源文件算法一致）。
- **未经实测项**：真实长/多卷项目（数百章、每章数 KB 正文）端到端的「前文衔接」生成质量提升效果，以及「省 10-20MB 内存」性能收益，均依赖真实长项目数据集与真机 chapter-outline / write 路由跑测才能量化。本轮沙箱无此类数据集，标注为**「未经实测，待验证」**。
- 已知边界：`keepWindow` 的章/节窗口仅覆盖 `chapter`/`section` 两类（与 `extractPrevContext` 过滤口径一致）；若项目在章/节之间穿插带正文的 `scene` 节点且 `continue` 路由依赖其正文，极端情况下 `continue` 的 `filter(n.content).slice(-5)` 仍可能少取（整体序号窗口已尽量覆盖最近节点）。该场景不在 R2-012 退化主诉范围内，未扩展处理以避免越界改动；如确需，可后续将 `scene` 纳入章/节窗口口径。
- 未改动任何下游路由与 `extractPrevContext` 实现，write/refine/continue 主生成路径的紧邻前文上下文保持 R2-012 已确认的无回归状态。
