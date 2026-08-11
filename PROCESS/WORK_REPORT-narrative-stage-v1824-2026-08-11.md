# 工作单元报告：v1.8.24 全书写作节奏控制（6 阶段渐进 + 防抢跑注入）

> 费曼式沉淀 · 读者定位为零基础大学生 · 用大白话讲清「怎么运作」，不堆术语
> 日期：2026-08-11 · 项目：novel-forge（Next.js 16 + React 19 + Tailwind v4 + Prisma 7 + PostgreSQL）

---

## 一、干了什么（一句话）

给 AI 写小说平台加了一个「**全书写到第几步了**」的判断器：根据「当前是第几章 / 一共已写几章」算出小说处在开篇、早期、中期、后期、高潮、收尾六个阶段中的哪一个，然后给 AI 发一条「**这个阶段不许做什么**」的指令，防止它写几十章后提前剧透结局、过早打决战、或者结尾又开新大线。

---

## 二、为什么这么做（拆到底层原理，第一性原理）

### 1. 问题的本质：AI 没有「长线节奏感」

大白话类比：你让一个人写一部 100 章的小说，他第 3 章就把凶手写出来了、第 10 章就把最终 boss 打败了、第 95 章又突然冒出一个需要再写 50 章的新设定——这就是「抢跑」。真人作者会拿大纲卡住自己「现在还不能写终局」，但 AI 每次只接一小段上下文，它**不知道整本书写到哪了**，于是容易把后面的大事件提前抖出来。

### 2. 之前的版本为什么缺这个

v1.8.23 刚做了「摘要大纲」：把每章摘要 + 主线大事件聚合成「此前发生了什么」，让 AI 写下一章时「全部读取」前情。这解决了「**AI 忘了前面写了啥**」。

但「读过前文」不等于「**知道全书进度**」。AI 仍可能：读过前文 → 觉得铺垫够了 → 第 20 章就发动终局决战。它缺的是一句「**现在才 20%，决战要留到第 90%**」的节拍器。

### 3. 为什么用「已存在章节总数」做分母（关键取舍）

- 候选方案 A：让用户填「计划总章数」作为进度分母。最准，但要加 UI、加 Project 字段、要用户先想清楚写多少章——成本高、且很多用户根本没规划。
- **方案 B（采用）**：分母用「当前已存在的章节总数」。进度会随写作自然前移（写了 50 章时，第 5 章就是 10% 的开篇区，第 45 章就是 90% 的高潮区）。本身就是合理的「动态进度」估算，**零 schema 变更、零新 UI、零新依赖**。
- 取舍理由：先用 B 把能力落地、直接增强 v1.8.23 的注入链路；「计划总章数」作为后续增强（Project.targetChapters 字段预留，本次不动）。

---

## 三、用了什么方法 / 工具，效果如何（可复现）

### 技术栈与改动清单

| 文件 | 改动 | 作用 |
| --- | --- | --- |
| `src/core/pipeline/narrative-stage.ts`（**新建**） | 纯函数 `computeNarrativeStage` / `formatStage` | 核心：算阶段 + 转成注入文本 |
| `src/core/pipeline/narrative-stage.test.ts`（**新建**） | 11 个单测 | 覆盖 6 阶段边界、越界夹紧、空值、文本格式 |
| `src/core/pipeline/index.ts` | 导出两函数 + 类型 | 让路由能从 `@/core/pipeline` 直接引 |
| `src/core/pipeline/types.ts` | `GenerationData` 加 `narrativeStage?` | 数据载体加字段 |
| `src/core/pipeline/context-loader.ts` | 返回前算 `narrativeStage` 并透传 | 写/续写/微调三路由的数据源 |
| `src/core/pipeline/outline-context.ts` | 返回前算 `narrativeStage` 并透传 | 章纲路由的数据源 |
| `src/app/api/generate/write/route.ts` | `formatStage(data.narrativeStage)` 追加到指令 | 注入「写下一章」 |
| `src/app/api/generate/continue/route.ts` | 同上 | 注入「续写」 |
| `src/app/api/generate/refine/route.ts` | 同上 | 注入「微调」 |
| `src/app/api/generate/chapter-outline/route.ts` | 同上 | 注入「写章纲」 |
| `src/lib/changelog-data.ts` + `CHANGELOG.md` | 升版 v1.8.24 | 强制同步的版本记录 |

### 核心代码（怎么运作，逐行讲）

```ts
// 六个阶段，每个有「进度上限百分比」和「防抢跑指令」
const STAGES = [
  { key: "opening", label: "开篇",      until: 8,   directive: "严禁揭晓终局、严禁提前引爆主线决战…" },
  { key: "early",   label: "早期发展",  until: 30,  directive: "严禁让核心冲突提前进入决战状态…" },
  { key: "mid",     label: "中期发展",  until: 55,  directive: "严禁在此揭晓终极谜底、严禁提前发动终极对决…" },
  { key: "late",    label: "后期发展",  until: 78,  directive: "严禁让终极对决提前发生、严禁过早给出终局答案…" },
  { key: "climax",  label: "高潮",      until: 92,  directive: "允许并应当安排最大冲突、关键转折与终极对决…" },
  { key: "ending",  label: "收尾",      until: 100, directive: "严禁开启新的重大情节线、严禁引入需要长线展开的新设定…" },
];

// 算当前在第几阶段
export function computeNarrativeStage(chapterIndex, totalChapters) {
  const safeTotal = Math.max(1, totalChapters);          // 分母至少 1，避免除零
  const safeIdx   = Math.max(0, Math.min(chapterIndex, safeTotal - 1)); // 索引夹紧到合法区间
  const percent   = Math.round(((safeIdx + 1) / safeTotal) * 100);     // 例：第 1 章/共 10 章 → 10%
  const stage     = STAGES.find(s => percent <= s.until) ?? STAGES[STAGES.length - 1]; // 第一个上限≥进度的阶段
  return { key: stage.key, label: stage.label, percent, directive: stage.directive };
}

// 转成塞进 AI 指令的文本；空则返空串，调用方据此跳过注入，不污染 prompt
export function formatStage(stage) {
  if (!stage) return "";
  return `【全书进度阶段：${stage.label}（约 ${stage.percent}% 完成）】\n` + stage.directive;
}
```

**运作链条（大白话）**：
1. 用户在 workspace 选中某一章 → 前端调 `/api/generate/write`（或续写/微调/章纲）。
2. 服务端 `context-loader` 数一下「当前项目一共有几章、选中的是第几章」，调 `computeNarrativeStage` 算出阶段。
3. 路由把 `formatStage` 生成的「阶段 + 防抢跑指令」文本，拼到 v1.8.23 的「长期记忆摘要」后面，一起发给 AI。
4. AI 拿到这条指令，就知道「我现在才 15%，不能写终局」。

### 效果数据（实测，非推测）

- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → **0 错误**。
- `npx vitest run` → **48 文件 423/423 全绿**（新增 narrative-stage.test.ts 11 例）。
- 四路由静态接线已 grep 确认：每个路由都 `const stageBlock = formatStage(data.narrativeStage)` 且追加到指令。

### 具体可复现步骤

```bash
cd novel-forge
# 1. 看新阶段纯函数单测
npx vitest run src/core/pipeline/narrative-stage.test.ts
# 2. 全量门禁
SAFE_DELETE_DISABLE=1 npx tsc --noEmit && npx vitest run
# 3. 升版同步（每次改动必做）
#    改 src/lib/changelog-data.ts 的 LATEST_VERSION / CHANGELOG_BRIEF / VERSIONS
#    + 根 CHANGELOG.md 插同版小节，两文件一起提交
```

---

## 四、关键取舍（工具 A 为何不选 B、踩坑与修复）

### 取舍 1：纯函数 vs 塞进路由里内联

- **选纯函数**：`computeNarrativeStage` 独立成文件，可被四路由、两加载器、单元测试共用。若内联到路由，单测要 mock 整个 Next.js 请求对象，极难测。
- 结果：11 个单测直接测纯逻辑，边界（0 章、1 章、第 100% 章、越界索引）全覆盖，比「靠手测几个例子」可靠。

### 取舍 2：分母用「已存在章节数」vs「计划总章数」

- 见第二节第 3 点。先落地零成本方案，计划总章数留作增强。

### 取舍 3：「防抢跑」指令 vs「规定必须写什么」

- 指令只说「**不该做什么**」（开篇不揭终局…），不说「必须写铺垫场景」。给 AI 创作自由，只堵破坏长线节奏的抢跑。这是调研竞品 ai-novel-writer 后定的调性——它的「6 阶段渐进控制」也是渐进放宽大纲范围，而非硬性规定。

### 踩坑与修复（本单元实际发生）

1. **tsc 报中文串被 ASCII 双引号截断**：directive 初稿误用 `"立"/"解"` 等 ASCII 引号，字符串提前闭合（TS1005）。修复：改中文引号「立」/「解」/「厚」/「合」/「起」。
2. **tsc 报 continue/route.ts 缺字段**：该路由手拼 `data` 字面量漏了 `narrativeStage`。修复：在 `data` 加 `narrativeStage: genData.narrativeStage`（genData 来自 loadGenerationContext）。
3. **vitest 2 例断言写错（非代码 bug）**：把 `computeNarrativeStage(0,10)` 误期望 opening（实际 10%→early）；formatStage 文本是「约 1% 完成」非「8%」。修正两条断言后 423 全绿。
4. **真实 DB 验证脚本废弃**：临时 `tmp_stage_check.mjs` 先遇 PrismaClient 命名导出问题，再遇独立 node 脚本无生成客户端（`.prisma/client/default` 缺失）。决策：纯逻辑 + 类型接线已被 tsc 0 错 + 423 单测充分覆盖，真实 LLM prompt 注入 live 验证需长篇小说 + 真实 token，性价比低，删除脚本不跑。

### 关于「无头检测验证」的诚实说明（反自欺闸门）

本单元**没有跑 Playwright 无头截图**，原因：v1.8.24 是纯服务端 prompt 注入、**零新增 UI**，没有可截图的界面。注入验证采用与 v1.8.23 摘要注入**完全一致**的方式——纯函数 11 单测 + 四路由静态接线（grep）+ tsc 类型贯通。二者都没有对「prompt 真正到达 LLM」做烧 token 的 live 实测，这是既定成本/收益决策，如实标注，不伪装成已端到端验证。

---

## 五、结论与后续

- v1.8.24 已落地：novel-forge 首次具备「全书进度节拍器」，直接增强 v1.8.23 的长期记忆注入链路。
- 已提交推送 `origin/main`（commit 见 git log）。
- 后续（v1.9 路线图，见 `PROCESS/PLAN-novel-forge-v19-roadmap-2026-08-11.md`）：可加「计划总章数」锚点、把当前阶段在 UI 透明展示、以及自动情节化 UX、角色附身、文风定制、内容安全审核等。其中「推进/试探墙」「投票」仍缺一句话设计规格，未擅自落地。

---

## 六、检验优化（v1.8.24 交付后补做，瑞宝宝指令「检验优化」）

### 为什么要做这一轮

第五节诚实标注了「注入只靠纯函数单测 + 四路由静态接线 + tsc 类型贯通，没对真实代码路径做单测」。静态 grep 只能证明「四路由都写了 `formatStage(data.narrativeStage)`」，不能证明这段代码**真的、按正确顺序、且对空值安全**地拼进了指令。这一轮把这段逻辑变成可被单测直接覆盖的真实代码路径，并补一次无头回归。

### 做了什么（检验 + 优化）

1. **抽共享纯函数** `src/core/pipeline/instruction-context.ts` 的 `injectContextBlocks(base, blocks)`：把「长期记忆摘要 + 全书节奏阶段」按数组顺序、空行分隔追加到指令尾部，空块/纯空白块自动跳过。write / refine / continue 三路由原本各自内联 6 行近乎相同的拼装代码，现统一改为 `writingInstruction = injectContextBlocks(writingInstruction, [digestBlock, stageBlock])`——**去重（优化）+ 让注入逻辑可单测（检验）**。
2. **新增单测** `instruction-context.test.ts`（7 例）：覆盖顺序（digest 在前 stage 在后）、空块跳过、纯空白块跳过（健壮性）、全空原样返回、单块追加、以及「digest + stage 都非空」的真实组合（断言 stage 出现在 digest 之后、块间无多余空行）。**这是第一次对 v1.8.24 注入的真实代码路径做单测**，而非只 grep。
3. **无头回归冒烟** `tmp_detect_stage_smoke.cjs`：Playwright 加载 星辰 工作区 → 确认左侧大纲树 + 生成控制区渲染 → 全程零 console / pageerror。结果 **PASS**。

### 关键约束（为什么无头检测没直接验证「prompt 含阶段指令」）

LLM 调用是**服务端** `fetch`（`src/core/llm/client.ts:206` 的 `${baseURL}/chat/completions`），Playwright 只能拦截浏览器发往 Next.js 的请求，**拦截不到服务端对 LLM 的调用**。因此：
- 浏览器拦截 `/api/generate/chapter-outline` 只能验证「请求离开客户端」，看不到服务端注入的 prompt；
- 要真看到注入的 prompt 必须让服务端跑真实 LLM（烧 token）或在服务端埋日志（侵入）。
- 结论：注入**内容**由 `instruction-context.test.ts` 单测覆盖（真实代码路径）；无头冒烟只验证「重构没破坏应用外壳 + 生成入口」，二者分工明确，不伪装成已做 live 端到端 prompt 实测。

### 踩坑与修复（本单元实际发生）

- **单测首跑 1 例失败**：`injectContextBlocks` 初版只判断 truthy，`"   "`（纯空白）被当非空块追加成 `\n\n   ` 污染 prompt。修复：改为 `if (block && block.trim())`，空白串也跳过。这本身是个该补的**健壮性优化**。

### 效果数据（实测）

- 抽取 + 单测后双门禁：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 0 错误；`npx vitest run` **49 文件 430/430 全绿**（较 v1.8.24 基线 +1 文件 +7 测试）。
- 无头冒烟 PASS：工作区加载、大纲树与生成控制区可见、零控制台报错。
- 本次为 v1.8.24 的**内部重构 + 测试补全**，行为完全等价（零用户可见变更），故**不升版号**、不写 CHANGELOG 条目，仅提交源码 + 测试。
