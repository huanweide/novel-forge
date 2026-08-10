# 前端工程 · Round-2 系统级大改企划草案：故事线工作台「写入逻辑 + 续写集成」

**提案人**：frontend-engineering（MaxLoop 魔王系统 lens）
**提案对象**：novel-forge 故事线工作台（StorylineWorkbench / StorylineList / LeftPanel）
**关联系统**：章节续写管线（write / refine / continue）、`loadGenerationContext`、`writeStorylineProgress`、generation-tasks 真后台任务
**当前版本**：v1.8.10（HEAD `7536895`，Round-1 已完成 30 项优化）
**dev 验证址**：`http://127.0.0.1:3001/workspace/577ed326-b241-4f67-9481-c9332cb03626`
**提案性质**：**不修改任何文件**，仅输出架构方案，供六 lens 投票

---

## 一、Round-1 复盘：哪些已修、哪些仍残留

Round-1（v1.8.10，commit `7536895`）落地了我上一轮（Round-1 前端工程 lens）的 14 条发现中的 5 条，本次大改必须在其余残留项之上做系统性重构，而非继续打补丁。

| 上轮编号 | 内容 | Round-1 状态 | 本轮处理 |
|---------|------|------------|---------|
| FE-004 | 双重 interval | ✅ 已修（清旧 interval） | 纳入统一 hook |
| FE-007 | 线索 patch/delete 缺 res.ok | ✅ 已修（L386/L399 已检查） | 纳入统一 mutation |
| FE-011 | 轮询无停止阈值 | ✅ 已修（netErrCount>5 停轮询） | 纳入统一 polling |
| FE-012 | orphanSides dead code | ✅ 已修（删 `?.id === s.id`） | — |
| FE-013 | toastCreated 参数冗余 | ✅ 已修（`toastCreated("故事线")`） | — |
| **FE-002** | **每次写操作全量 N+1 refetch** | ❌ 残留 | **本轮核心重构** |
| **FE-003** | **Workbench/List 重复逻辑 + 循环依赖** | ❌ 残留 | **本轮核心重构** |
| **FE-005** | **卸载后 in-flight setState / 无 AbortController** | ❌ 残留 | 纳入统一数据层 |
| **FE-006** | **storyline-progress.ts 全量 any** | ❌ 残留 | 纳入类型契约 |
| **FE-008** | **结局字段落库被静默丢弃** | ❌ 残留 | 数据模型重构统一处理 |
| **FE-009** | **StorylineData.status 用 string** | ❌ 残留 | 类型契约 |
| **FE-010** | **LineNav toggle 用 span+onClick（a11y）** | ❌ 残留（属 ui-ux 共担） | 组件拆分时一并修 |

> 结论：Round-1 解决的是「轮询健壮性」与「文案/对比度」这类**局部止血**，但未触及**写入逻辑架构**与**组件重复**这两个本质债。这正是用户所说"布局与写入逻辑都不够好"的根因所在。

---

## 二、现状深度剖析

### 2.1 写入逻辑（Write Logic）

#### 2.1.1 全量 N+1 refetch 现状（FE-002 残留）

StorylineWorkbench 中**所有 8 处状态变更**成功后都执行 `void load()`，触发 `GET /api/storylines?projectId=`（后端 `storylines/route.ts` 用 `include: { events }` 返回全部故事线及其全部事件）：

```
L189  load() 的 useEffect 初始化
L218  handleToggleComplete → void load()      // 标记完结
L267  handleCommitGen      → void load()      // AI 落库
L326  handleSave           → void load()      // 编辑保存
L346  deleteStoryline.onSuccess → void load() // 删除
L374  handleAddClue        → void load()      // 新增线索
L391  handleCluePatch      → void load()      // 编辑线索
L404  handleClueDelete     → void load()      // 删除线索
```

StorylineList 侧同样：`L72` 初始化、`L261` onRefresh 链。

**代价**：一次"编辑某条线索的 tag"这种细粒度操作，会让客户端重新下载整个项目的 `storylines + events` 全量 JSON 并重渲染整个工作台。在中长篇项目（数十条线、数百事件）下，每次按键后的保存都会触发一次重量级重传与 `O(n²)` 的 `groupStorylinesByMain` 重算（见 L193 / L115）。

#### 2.1.2 无乐观更新（Optimistic Update 缺失）

当前模式是**悲观刷新**：先 `await fetch` → 成功 → `void load()` 全量重拉。用户感知到的延迟 = 网络 RTT×2（写入 + 重载）。没有任何本地先行更新。对于线索这种高频操作，体验明显滞后。

#### 2.1.3 重复逻辑与循环依赖（FE-003 残留）

| 重复块 | StorylineWorkbench | StorylineList | 差异点 |
|-------|-------------------|---------------|-------|
| `load()` | L168-186 | L54-72 | 完全相同 ~18 行 |
| `handleGenerate()` | L225-248 | L75-112 | 同构，仅收尾不同 |
| `groupStorylinesByMain(list)` | L193 | L115 | 同构 |
| 进度条 UI | LineNav L877-884 | L189-196 | 同构 markup |

**循环依赖**：`StorylineList.tsx:8` 导入 `StorylineWorkbench`（值导入），`StorylineWorkbench.tsx:11` 导入 `StorylineList` 的 `StorylineData`（类型）。形成 `List ↔ Workbench` 双向引用。

#### 2.1.4 状态管理复杂度

StorylineWorkbench 当前持有 **17 个 useState + 2 个 useRef（pollRef / netErrCount）**，并直接内联 `startPolling`（L110-159，含 setInterval + 网络计数 + onTaskSettled 回调）。续写接入后，状态面还会继续膨胀（任务进度、续写章节队列、七要素对账……）。继续在组件内堆 state 不可持续。

### 2.2 续写数据流现状（Storyline ⇄ Chapter）

关键发现：**故事线其实已经双向打通章节管线**，只是"不在工作台内可视化、不可从工作台主动驱动"。

#### 2.2.1 输入侧（storyline → 续写）

- `src/core/pipeline/context-loader.ts:88-92`：`loadGenerationContext` 加载 `status: ACTIVE` 全部故事线进 `GenerationData.storylines`。
- `src/app/api/generate/write/route.ts:51` 调用 `loadGenerationContext`，`L148` 将 `storylines` 透传给生成循环（write/refine/continue 三路由共用）。
- `src/core/pipeline/plan-chapter.ts:70` 过滤 ACTIVE 线，用 `sevenElements` 拼 `slText` 作为章节情节驱动。

→ **结论**：续写（continue）已经在"吃"故事线的七要素，但用户在工作台里看不到、也控制不了"哪条线在驱动当前续写"。

#### 2.2.2 回写侧（续写 → storyline）

- `src/core/pipeline/storyline-writer.ts:38-77`：`writeStorylineProgress` 在章节生成后（post-processor）被调用，按 `threadProgress`（每条线 stage∈七要素、impactScore≥4）向 `StorylineEvent` 写 `MILESTONE` 事件（kind=MILESTONE, tag=stage, position=chapterOrder, sourceRefs={nodeId}）。
- 用 `withStorylineLock` 按 storylineId 串行化，避免并发丢失更新。

→ **结论**：续写结果已经在回写时间轴，但工作台靠 `void load()` 被动刷新，回写发生时不实时、且不与七要素"计划"对账。

#### 2.2.3 当前断点（Gap）

```
            [ 工作台 StorylineWorkbench ]              [ 章节编辑器 CenterPanel ]
故事线七要素   ── 看不到 ──►  (续写实际在吃它)           续写触发在编辑器，不在工作台
时间轴 MILESTONE ←── 被动 void load() ──  回写在写/refine/continue 之后
```

用户要的是"**在主/支/线索推进视图里，点一条线 → 续写几章 → 看七要素被实际推进**"。当前架构把这个闭环拆成了两个互不相通的入口。

---

## 三、根因：为什么"布局与写入逻辑都不够好"

1. **单向数据流 + 全量重拉**：组件是"请求-重载"的薄壳，没有任何本地缓存/增量层，导致 N+1 与无乐观更新。
2. **没有共享数据层**：List 和 Workbench 各自 `useState` + `load()`，同一份数据两份真相，重复逻辑不可避免，续写回写也无法共享。
3. **组件即状态机**：轮询、任务、表单、线索 CRUD 全部堆在一个 900+ 行组件内，续写接入只会让复杂度爆炸。
4. **七要素语义分裂**：`sevenElements` 是"计划（静态总纲）"，`StorylineEvent` 是"实际进展（动态）"，但 UI 没把两者关联，用户困惑"七要素到底怎么放"。
5. **续写与工作台解耦**：续写的输入/输出都经由全局管线（context-loader / storyline-writer），但请求入口在编辑器，工作台只是旁观者。

---

## 四、系统级大改企划草案（Before → After）

### 4.1 企划 A：统一故事线数据层（消除 N+1 + 重复 + any）

**Before**：
```
StorylineWorkbench: 17 useState + load()/void load() 全量重拉
StorylineList:      9 useState + 自身 load()/void load()
storyline-progress.ts: computeStorylineProgress(s: any) / groupStorylinesByMain(storylines: any[])
StorylineData.status: string
```

**After**：抽出一个**单一数据源** `useStorylines` hook（基于 SWR 或自研轻量缓存），List 与 Workbench 都订阅它：

```
src/lib/storyline-store.ts          // 新建：缓存 + mutation + polling 收敛
src/components/workspace/useStorylines.ts      // 新建 hook
src/types/storyline.ts              // 新建：StorylineData/Event/Suggestion 类型契约（破循环依赖）
```

`useStorylines(projectId)` 返回：

```ts
{
  storylines, loading, error,
  reload,                                  // 全量校准（极少调用）
  // —— 增量 mutation（乐观更新，不再全量重拉）——
  updateStoryline(id, patch),              // optimistic + 服务端校验 + 回滚
  toggleComplete(id),
  removeStoryline(id),
  addClue(id, {tag, content}),             // 返回新 event 直接 splice 进本地
  patchClue(eventId, patch),
  deleteClue(eventId),
  generate(taskId?),                       // 复用 generation-tasks 真后台
}
```

- **乐观更新范例（addClue）**：
  ```ts
  addClue: async (lineId, payload) => {
    const tempId = `tmp_${Date.now()}`;
    // 1) 本地先行插入（UI 立即响应）
    setStorylines(prev => prev.map(s => s.id === lineId
      ? { ...s, events: [...s.events, { id: tempId, kind: "CLUE", ...payload }] }
      : s));
    // 2) 服务端落库
    const res = await fetch(`/api/storylines/${lineId}/events`, {...});
    if (!res.ok) { /* 回滚 tempId + toastError */ return; }
    const saved = await res.json();
    // 3) 用真实 id 替换临时记录（增量 patch，无全量重拉）
    setStorylines(prev => prev.map(s => s.id === lineId
      ? { ...s, events: s.events.map(e => e.id === tempId ? saved : e) }
      : s));
  }
  ```
- **消除 N+1**：8 处 `void load()` 收敛为"乐观更新 + 变更后精准 patch"；仅 `reload()`（下拉刷新/外部失效）才走全量。预计网络请求量下降 80%+。
- **消除重复**：List 与 Workbench 的 `load`/`handleGenerate`/`groupStorylinesByMain` 全部下沉到 hook，两组件退化为"纯展示 + 回调转发"。
- **消除 any（FE-006/FE-009）**：`storyline-progress.ts` 签名改为 `computeStorylineProgress(s: StorylineData)`、`groupStorylinesByMain(storylines: StorylineData[])`，返回类型 `StorylineGroup { mains: StorylineData[]; ... }`；`StorylineData.status: StorylineStatus`（联合类型）。
- **AbortController（FE-005）**：`useStorylines` 在 unmount 时 `abortController.abort()`，并持有 `mountedRef`，杜绝卸载后 setState。

**文件:行号映射**：
- 删除 `StorylineWorkbench.tsx:168-186` 的 `load`、`:204-223` toggle、`:250-274` commit、`:295-333` save、`:355-404` 线索 CRUD（改为调用 hook）
- 删除 `StorylineList.tsx:54-72` 的 `load`、`:75-112` 的 `handleGenerate`（改为调用 hook）
- 改写 `storyline-progress.ts:25,57-64,67,73`（去 any）
- 改写 `StorylineList.tsx:27`（status 联合类型）

---

### 4.2 企划 B：工作台成为「剧情推进驾驶舱」（续写集成）

**Before**：续写在编辑器 `CenterPanel` 触发；工作台只看不驱动；回写靠 `void load()` 被动刷新。

**After**：在工作台内新增"推进"动作，复用现有 `generation-tasks` 真后台任务模式，把"某条故事线 → 续写 N 章 → 回写时间轴"闭环收口到工作台。

#### 4.2.1 新增任务类型 `storyline-advance`

复用 `src/app/api/generation-tasks/route.ts` 的 `targetType` 字段（当前默认 `"storyline"`），新增 `targetType: "storyline-advance"`，在 `src/core/storyline/execute-task.ts` 的 dispatcher 中分支：

```
POST /api/generation-tasks
{ projectId, targetType:"storyline-advance",
  payload: { storylineId, fromNodeId, chapters: 3, driverPrompt } }
        │
        ▼
runStorylineAdvanceTask(taskId)
  ├─ 取当前章 fromNodeId（context-loader 时间线过滤）
  ├─ 循环 chapters 次：
  │    ├─ loadGenerationContext（已含 ACTIVE storylines，含本线 sevenElements）
  │    ├─ 以该 storyline.sevenElements + 未结算 stage 作为"情节驱动"注入 continue 路由
  │    ├─ 写一章（现有 write 管线）
  │    ├─ writeStorylineProgress → MILESTONE 事件（已存在，L61-71）
  │    ├─ progress: (i+1)/chapters*100 写回 task
  │    └─ 发布事件总线通知工作台"本线有新 MILESTONE"
  └─ done: result={ advancedStorylineId, newChapterIds, stagesHit }
```

#### 4.2.2 工作台内 UI 入口

在 StorylineWorkbench 详情面板（选中一条线后）加"推进 N 章"按钮（仅对 `status === "active"` 的线可用）。点击 → 弹出轻量配置（章数、可选额外要求）→ 调用 `useStorylines().advance(lineId, n)` → 进入轮询态（复用现有 startPolling 模式）。进度条复用 `genTask.progress`。

#### 4.2.3 实时回写可视化

续写每完成一章，`writeStorylineProgress` 写一条 MILESTONE。工作台通过 `useStorylines` 订阅该 storylines 的 events 变更（或任务 result 中包含的 `newChapterIds`/`stagesHit`），**增量**把新 MILESTONE 追加到时间轴，无需全量 `reload()`。用户在"推进中"就能看到时间轴一条条长出新节点。

#### 4.2.4 数据流图（After）

```
┌──────────────────────── StorylineWorkbench ────────────────────────┐
│  选中 storyline (active)                                            │
│    ├─ 七要素总纲 (计划)                                              │
│    ├─ [推进 N 章] ──advance(lineId,n)──┐                            │
│    └─ 时间轴 MILESTONE (实际进展) ◄────┘ 增量订阅                    │
└───────────────────────────┬─────────────────────────────────────── ┘
                            │ POST /api/generation-tasks (targetType: storyline-advance)
                            ▼
                runStorylineAdvanceTask(taskId)  【真后台，断页不中断】
                  ├─ loadGenerationContext(projectId, fromNodeId)
                  │     └─ ACTIVE storylines（含本线 sevenElements）──┐
                  ├─ for i in 1..n:                                  │
                  │    continue 路由 ── 写一章 ──► writeStorylineProgress
                  │         ▲ 情节驱动 = sevenElements 未结算 stage   │
                  │         │                                       │
                  │         └──────── MILESTONE 事件 ────────────────┘ 写回 StorylineEvent
                  └─ progress 写回 task；done → result{newChapterIds, stagesHit}
                            │ GET /api/generation-tasks/:id (轮询 1.5s)
                            ▼
                  useStorylines 增量 patch：追加 MILESTONE 到时间轴
```

**架构成本评估**：
- **服务端**：+1 个 `targetType` 分支（复用 90% 现有 execute-task + write 管线），约 60-100 行新增。
- **前端**：`useStorylines` 增加 `advance()` + 订阅机制；Workbench 加 1 个配置弹层 + 复用轮询。约 120-160 行新增，并**删除**约 200 行重复 state/handler。
- **风险**：续写本身是已有能力，本方案只是"换入口 + 实时可视化"，不改变生成质量；N 章上限需在任务层加 `maxChapters` 护栏（防误触生成百章）。

---

### 4.3 企划 C：七要素到底怎么放（计划 vs 实际 双轨模型）

用户原话"七要素到底怎么放"本质是**语义混乱**：七要素既是"计划"又是"进度"，但代码里七要素只有"计划"一份，进度散在 MILESTONE 的 `tag` 里，两者没有视觉/数据关联。

**After 数据模型**：

| 维度 | 存储 | 含义 | UI 位置 |
|------|------|------|--------|
| 七要素（计划） | `Storyline.sevenElements` | 作者预设的弧线骨架（desire/obstacle/…/ending 填空） | 详情面板"总纲"网格 |
| 七要素（实际） | `StorylineEvent.tag ∈ {desire,obstacle,…}` | 续写实际推进到的阶段（MILESTONE） | 时间轴 + 总纲的"已达成"勾选 |
| 结尾状态 | `Storyline.status` / 显式 `endingFilled` | 完结或收束标记 | 总纲结局格 |

**UI 改造**：总纲网格每个要素卡显示两态——左半"计划内容"（来自 sevenElements），右半"实际达成"（来自该线 MILESTONE 中 tag 匹配的进度 note）。续写推进后，对应要素的"实际达成"自动点亮。这样"七要素到底怎么放"有了明确答案：**计划写在 sevenElements，实际写在 MILESTONE，工作台把两者并排对照**。

**顺带解决 FE-008（结局丢弃）**：把结局从"可编辑但落库 null"改为**只读展示 + 显式"标记收束"动作**（写入 `Storyline.endingFilled`/`status=completed`），语义自洽，不再有静默丢弃。

---

## 五、架构图汇总

### 5.1 当前架构（问题态）

```
[StorylineList] ──load()──► GET /api/storylines ► 全量JSON
      │ (循环依赖)
      ▼ 渲染 + 自身 state
[StorylineWorkbench] ──load()/void load()×8──► GET /api/storylines ► 全量JSON
      ├─ startPolling(setInterval) ─► generation-tasks
      └─ 17 useState，组件即状态机
                         │
         续写(continue) 在 CenterPanel 触发，与工作台无关
                         │
         写/refine/continue ─► context-loader(ACTIVE storylines) ─► LLM
                         │                                        ▲
                         └─ writeStorylineProgress ─► MILESTONE ───┘ (被动 void load 才看到)
```

### 5.2 目标架构（After）

```
                 ┌──────────── useStorylines (单一数据源) ────────────┐
                 │  SWR 缓存 │ 乐观 mutation │ AbortController │ 订阅 │
                 │  + polling(生成/推进任务)                          │
                 └───────┬───────────────────────────┬───────────────┘
           订阅(push)    │                           │  订阅(push)
        ┌───────────────▼──────┐            ┌────────▼──────────────┐
        │   StorylineList      │            │  StorylineWorkbench   │
        │  (纯展示+回调转发)    │            │  (纯展示+回调转发)     │
        └──────────────────────┘            │  +[推进N章]驾驶舱      │
                                            └────────┬───────────────┘
                                                     │ advance(lineId,n)
                                                     ▼
                                          generation-tasks (storyline-advance)
                                                     │ 真后台
                              ┌────────────────────────┴─────────────────┐
                              ▼                                            ▼
                   continue 路由(吃 sevenElements)              writeStorylineProgress
                              │                                            │ MILESTONE
                              └────────── 实时回写工作台时间轴 ◄───────────┘
```

---

## 六、落地步骤（分阶段，附文件:行号）

**阶段 0 — 类型契约（低风险，解循环依赖）**
- 新建 `src/types/storyline.ts`：`StorylineData`/`StorylineEventData`/`StorylineSuggestion`/`StorylineStatus`。
- `StorylineList.tsx:27` status 改联合类型；`StorylineList.tsx:8,11` 与 `StorylineWorkbench.tsx:11` 改从新文件导入，破循环依赖。
- `storyline-progress.ts:25,57-64,67,73` 去 any。

**阶段 1 — 统一数据层（核心，解 FE-002/FE-003/FE-005）**
- 新建 `src/lib/storyline-store.ts` + `src/components/workspace/useStorylines.ts`。
- 把 `StorylineWorkbench.tsx:168-404` 与 `StorylineList.tsx:54-112` 的 load/handleGenerate/CRUD 全部下沉为 hook 的乐观 mutation。
- 两组件改为订阅 hook，删除重复 state/handler。

**阶段 2 — 续写驾驶舱（解"布局与续写解耦"）**
- `src/core/storyline/execute-task.ts` 增加 `targetType: "storyline-advance"` 分支（复用 write 管线 + storyline-writer 回写）。
- `useStorylines` 增加 `advance()`；Workbench 详情面板加"推进 N 章"配置层，复用轮询态。
- 时间轴改为订阅式增量追加 MILESTONE。

**阶段 3 — 七要素双轨 + a11y（解 FE-008/FE-010）**
- 总纲网格改为"计划/实际"双态；结局改为显式收束动作。
- `StorylineWorkbench.tsx` LineNav 的 toggle span（L862-875 区域）改为 `<button type="button">`。

**验证门禁（沿用 Round-1 双门禁）**
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 0 错
- `npx vitest run` 全绿 + 新增 `useStorylines` 单测（乐观更新/回滚/Abort）
- Playwright 截图验证：推进 N 章时时间轴实时生长、无全量闪白

---

## 七、风险与权衡

| 风险 | 影响 | 缓解 |
|------|------|------|
| SWR 引入增加包体/学习成本 | 中 | 可用自研轻量缓存替代（防抖 reload + 内存 Map），不强制依赖 |
| 乐观更新回滚逻辑复杂 | 中 | 仅在"失败"分支回滚临时记录，成功分支增量替换 |
| 续写 N 章失控 | 低 | 任务层 `maxChapters` 护栏（建议 ≤10），且走真后台不阻塞 UI |
| 阶段 1 重构面大、易回归 | 中 | 双门禁 + 先写 `useStorylines` 单测再迁移组件，灰度替换 |
| 七要素双轨模型改动数据读取 | 低 | 只读新增"实际达成"派生，不改 sevenElements 写入路径 |

---

## 八、协作补充：onWriteChapter 回调依赖（来自 copy-empty-state lens）

copy-empty-state 在 `PROCESS/meetings/round-2/copy-empty-state.md` §5/§6 提出：工作台空状态、单线详情头部、单线空骨架需新增三个"去写一章 / 据此续写"CTA，文案已规格好；但**触发逻辑是前端工程项，非纯文案**。本 lens 已核实代码，结论如下。

### 8.1 现状核实：当前无任何"故事线→写作"通道

- `StorylineWorkbench` 当前 props 仅 `projectId, initialId, initialSuggestions, initialTaskId, onClose, onRefresh`（`StorylineWorkbench.tsx:47-60`），**无 `onWriteChapter`**。
- `LeftPanel` 渲染 `<StorylineList projectId onRefresh={loadProject} />`（`LeftPanel.tsx:124-125`），未透传任何写作回调；`LeftPanel` 自身也未从 workspace 页收到此类回调。
- 现有写作流完全在 `CenterPanel`：`onWrite={handleWrite}`（`[projectId]/page.tsx:1057`）→ `handleWrite`（page L562）**前置守卫 `if (!selectedNode || !project) return`**，即写作必须依赖一个已选中的章节节点；确认后 `handleWriteConfirmed`（L708）调 `streamSSE("/api/generate/write", { nodeId: selectedNode.id, ... })`。
- 故事线对写作的影响目前**仅是隐式全局注入**：`loadGenerationContext` 加载全部 ACTIVE 线进 prompt（`context-loader.ts:88-92`），无法按"某条线"精确约束。

→ **结论**：`onWriteChapter` 是本次系统级大改的**必要新增工程项**，无现成通道可复用。

### 8.2 需要的工程改动（4 层 prop 透传 + 1 个页级 handler）

```
StorylineWorkbench         新增 prop: onWriteChapter?: (storylineId?: string) => void
  ↑ (透传)
StorylineList              新增 prop: onWriteChapter?，转发给 <StorylineWorkbench onWriteChapter={onWriteChapter} />
  ↑ (透传)
LeftPanel                  新增 prop: onWriteChapter?，在 <StorylineList onWriteChapter={onWriteChapter} /> 透传（L124-125）
  ↑ (透传)
[projectId]/page.tsx       新增 handler: handleWriteFromStoryline = (storylineId?: string) => { ... }，传给 <LeftPanel onWriteChapter={handleWriteFromStoryline} />
```

`handleWriteFromStoryline(storylineId?)` 的契约：
1. **解析目标章节节点**：现有 `handleWrite` 要求 `selectedNode`。若当前无选中节点，需先建/选一个目标章（复用既有"新增章节"能力，如 `OutlineTree` 的 `onAddSection` 链路），否则 `handleWrite` 会因守卫直接 return。
   - **空项目边界**（copy-empty-state 提醒）：若项目当前**完全没有章节**，"去写一章"会先走到"新建/选择章节"这一步；该环节的引导文案（建议大意："先建一章，写完回来这条线的进度就会自动长出来"）属**文案侧（copy-empty-state）责任**，本 lens 仅负责在该步触发既有新建章流程，并把 storylineId 透传过去，闭环接回工作台时间轴。
2. **暂存 storyline 约束**：把 `storylineId` 存入 `pendingStorylineIdRef`（或 state），供写作确认时注入。
3. **打开既有写作流**：`setPreGenMode("write"); setPreGenOpen(true)`（同 `handleWrite` L562），由用户走预生成确认 → `handleWriteConfirmed` 落章。
4. **（精度增强，可选）** 在 `streamSSE("/api/generate/write", { ..., storylineId })` 透传 `storylineId`，服务端让 `loadGenerationContext`/prompt 构建优先该线七要素（当前是全量 ACTIVE，需小改 `context-loader.ts:88-92` 或 write 路由 L148 的透传）。

三个 CTA 触发点（copy-empty-state §5）：
- 时间轴空状态「去写一章」→ `onWriteChapter()`（无 id，全局约束）
- 单线详情头部「据此续写」→ `onWriteChapter(selected.id)`
- 单线空骨架引导卡「据此续写」→ `onWriteChapter(selected.id)`

### 8.3 与企划 B 的关系：MVP 走"手动 handoff"，autonomous task 作为增强

copy-empty-state 提出的 `onWriteChapter` 是**轻量、用户在线、单章**的集成（契合"试写一章看效果"）；本 lens 原 企划 B 的 `targetType:"storyline-advance"` 是**真后台、批量 N 章**的集成。两者**不冲突、可分层**：

- **MVP（建议优先）= `onWriteChapter` 手动 handoff**：复用 100% 现有 CenterPanel 写作流，风险极低，直接满足三个 CTA + "试写一章"。
- **增强（后续阶段）= `storyline-advance` 真后台任务**：仅在需要"一键推进 N 章、离开页面也跑"时才引入。

因此**修订 企划 B 落地顺序**：阶段 2 先交付 `onWriteChapter`（含 8.2 的 4 层透传 + 页级 handler + 可选 storylineId 精度增强），把 autonomous 任务降级为"阶段 2.5 增强"。这同时降低了 Round-2 的整体风险面——不必为 MVP 发明新任务类型。

---

## 九、投票建议（供六 lens 合议）

- **本 lens 主张**：优先做 **阶段 1（统一数据层）**，因为它同时消解 FE-002/FE-003/FE-005/FE-006/FE-009 共 5 条上轮残留债，且是阶段 2（续写集成）的前置地基。**阶段 2 的 MVP 走 `onWriteChapter` 手动 handoff**（来自 copy-empty-state 协同，见第八节），直接满足三个"去写一章/据此续写"CTA 与"试写一章看效果"诉求，风险最低；autonomous `storyline-advance` 任务降为阶段 2.5 增强。
- **需其他 lens 协同**：ui-ux 负责"推进 N 章"配置层与七要素双态的视觉；interaction-flow 负责工作台内"选中线→推进/据此续写"的动线；**copy-empty-state 负责三个 CTA 文案（§5 已规格）+ "结局收束"文案，并依赖本 lens 落地 `onWriteChapter` 回调链路（4 层透传 + 页级 handler）**；musk-perspective 评估"续写驾驶舱"是否符合"第一性原理/极致简洁"。

> 本提案为**架构草案**，未改动任何源码。如获多数投票通过，将进入实施阶段并按第六节的文件:行号落地。
