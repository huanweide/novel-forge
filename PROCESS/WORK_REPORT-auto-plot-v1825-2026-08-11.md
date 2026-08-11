# 工作单元报告：v1.8.25 自动情节化 —— 抽取关键事件一键归纳进故事线

> 费曼式沉淀 · 写给零基础也能照做的自己
> 日期：2026-08-11 · 项目：novel-forge（AI 小说创作平台）

---

## 一、干了什么（一句话）

给「生成后分析面板」加了一个叫**「情节」**的标签页：每章 AI 抽取出的「关键事件」不再只躺在章节摘要里，用户勾选后一键归纳进**故事线主线**，变成故事线时间轴上的真实节点。

这是 v1.9 路线图第二项（#2 自动情节化）的落地。零数据库结构变更（没动表、没加字段）。

---

## 二、为什么这么做（第一性原理）

**先讲背景：小说平台的两条「记忆」原本是断的。**

- 平台每写完一章，会跑一次「抽取」（`extract-chapter` 路由），用一次大模型调用把正文拆成角色、地点、伏笔、摘要……其中有一项叫 `summary.keyEvents`（本章关键事件，比如「主角觉醒血脉」「黑衣人揭示真相」）。
- 这些关键事件被存进「章节摘要」表里，**仅此而已**——它们从没接回「故事线」系统。
- 而故事线（Storyline）是另一套：作家手动或在工作台里维护的「主线 / 支线 / 伏笔线」时间轴，节点叫 `StorylineEvent`。

**问题本质**：AI 已经「读懂」了每章发生了什么（keyEvents），但这个结果没有自动沉淀成「故事线」这个更高层的叙事骨架。作家得手动重新录入，等于让 AI 白读一遍。这违背了「抽取一次、多处复用」的第一性原理——信息是现成的，缺的是一座把信息从 A 库搬到 B 库的桥。

**类比（生活化）**：快递站每天自动扫描包裹生成「今日重要件清单」（keyEvents），但这清单只贴在驿站墙上（章节摘要），从没同步进你的「家庭年度大事记」相册（故事线）。我们这次做的事，就是在清单旁加一个「勾选→归档进相册」的按钮，并自动把勾选的条目贴进相册对应年份那一页。

---

## 三、用了什么方法 / 工具，效果如何

### 方法总览（三处改动，一条数据流）

```
抽取章节(extract-chapter)  →  summary.keyEvents（已存在，本章关键事件）
        │
        ▼
PostGenPanel「情节」Tab（新增）  →  展示 keyEvents，用户勾选
        │  全局「全部采纳」按钮
        ▼
apply-extraction 路由（新增 plotEvents 分支）  →  把勾选文本映射成 StorylineEvent
        │
        ▼
故事线主线时间轴（StorylineEvent 表，kind=EVENT）
```

### 1) 纯函数先行（可单测，不绑数据库）

新增 `src/core/pipeline/plot-event.ts`，抽出 `computePlotEventAdoptions` 纯函数。

- **它干什么**：给定「待采纳情节文本列表 + 主线已有事件 + 来源章节 id + 起始 position」，算出一个「应该新建哪些事件、各自 position 多少」的清单。
- **为什么抽纯函数**：v1.8.24 我们刚吃过亏——注入逻辑当初写死在三处路由里，只能靠静态 grep 验证，覆盖不到真实代码路径。这次从源头就把它做成纯函数，让单测能直接喂数据、断言结果，不碰数据库、不调 LLM。
- **两个关键设计**：
  - **去重**：同一章节(nodeId)已采纳过同标题的事件不再新建；本批次内重复的标题也只建一次。这样用户反复点「全部采纳」不会把故事线灌爆。
  - **容错解析 sourceRefs**：这个字段历史上有两种存法（直接存数组、或存 JSON 字符串），纯函数两种都认。
- **效果**：`plot-event.test.ts` 7 个用例全过，覆盖空输入、顺序 position、空串跳过、批次内去重、同章节同标题去重、JSON 字符串兼容、跨章节同标题可采纳。

### 2) 落库分支（apply-extraction 路由）

在 `apply-extraction/route.ts` 第 8 节新增 `plotEvents` 处理：

- 找项目的**活跃主线**（`type='main' AND status='active'`）；若项目压根没主线（极少数情况），自动建一条默认「主线」当归纳目标。
- 查主线现有事件 + 当前最大 position，交给上面的纯函数算清单，再逐条 `prisma.storylineEvent.create`。
- 每个新事件：`kind='EVENT'`、`role=null`（叙事角色留给用户在因果链 UI 里后续标注）、`sourceRefs=[{type:'chapter', ref: 来源章节id}]`（记下它从哪章来，未来可一键跳回）。

### 3) 前端「情节」Tab（PostGenPanel）

- `postgen/types.ts`：TabKey 加 `"plot"`，TABS 加 `{key:'plot', icon:'gitBranch', label:'情节'}`，`AdoptControllers` 加 `plotEvents`。
- `PostGenPanelTabs.tsx`：把「情节」设为**第二个常显主 Tab**（和「章节提取」并列，不再塞进「高级」折叠），因为这是路线图头条特性，要突出。
- 新增 `postgen/PlotTab.tsx`：逐条展示 keyEvents，带勾选框；默认全选，用户可取消。
- `PostGenPanel.tsx`：加 `adoptedPlotEvents` 状态、纳入全局「全部采纳」的提交载荷。

### 工具与实效对比

| 环节 | 做法 | 结果 |
|------|------|------|
| 类型安全 | `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` | 0 错误 |
| 单测 | `npx vitest run` | **50 文件 437/437 全绿**（较上轮 430 +7） |
| 后端真实验证 | Node+pg 直连 星辰 库，打 apply-extraction API | 首次采纳建 3 事件(position 1/2/3、sourceRefs 含章节)；二次采纳去重生效(仍 3 条)；测试数据已清理 |
| 前端无头 | Playwright 加载 星辰 工作区 | 零控制台报错、零 pageerror（新组件编译并挂载正常） |

---

## 四、关键取舍（踩坑与修复）

1. **「自动落库」还是「用户审阅后采纳」？**
   两个都要。最初方案只想「抽取完自动塞进故事线」，但那样会污染主线（AI 抽的未必都该进线）。最终定为：**抽取展示在「情节」Tab，用户勾选→点全部采纳才落库**。兼顾自动与可控，也符合「让用户审阅/采纳」的路线图原话。

2. **去重逻辑放哪？**
   必须放落库前（路由里），不能只靠前端不重复提交——因为用户可能多次点保存、或多设备操作。纯函数 + 服务端双重保险，同一章节同标题永远只建一次。

3. **sourceRefs 历史两种存法**
   实测发现 `plan-chapter.ts` 旧代码把 `sourceRefs` 存成了 JSON 字符串，而 `storyline-writer.ts` / events 路由存的是数组。去重要解析它，所以纯函数里写了 `normalizeRefs` 兼容两种，单测也专门覆盖字符串形态。这是「货物崇拜」的反面教材提醒：别假设数据长一个样，先容错。

4. **测试能覆盖到哪、覆盖不到哪（反自欺闸门）**
   - ✅ 真验证过：纯函数 7 例单测（真跑过、真过）、真实 星辰 库建事件+去重+清理（真打 API、真查 pg）、工作区无头零报错（真开浏览器）。
   - ⚠️ 未走通：在「真实生成会话里用鼠标点 情节 Tab 勾选→保存」的端到端点击。这条路径要求先生成一章（依赖大模型 + 网络），而大模型调用是**服务端** fetch，Playwright 只能拦浏览器请求、拦不到服务端对 LLM 的调用，所以无法在无头里完整模拟。我的处理：核心落库逻辑已被真实 星辰 库集成测试覆盖，UI 组件已被类型检查 + 冒烟覆盖；这条端到端点击留作上线后人工点一遍即可，不伪造「已测」。

5. **零 schema 变更优先**
   全程没动 Prisma 表结构——复用现有 `StorylineEvent` 字段（kind/content/position/sourceRefs 都现成）。好处：不用 `prisma db push`、不用杀 dev server 重启、不触发 stale client 503，交付快且稳。

---

## 五、怎么复现（照做即可）

```bash
# 1. 双门禁（必须全绿才允许升版）
SAFE_DELETE_DISABLE=1 npx tsc --noEmit
npx vitest run

# 2. 后端真实验证（对 星辰 项目，需 dev server 在 3001、DATABASE_URL 在 .env）
node tmp_plot_verify.cjs
# 预期：创建 3 事件、position 1/2/3、二次去重仍 3 条、清理删除 3 行、输出 PASS

# 3. 前端无头冒烟
node tmp_detect_stage_smoke.cjs
# 预期：工作区加载、生成控制区可见、零控制台报错、输出 PASS
```

涉及文件：
- `src/core/pipeline/plot-event.ts`（新·纯函数）
- `src/core/pipeline/plot-event.test.ts`（新·7 单测）
- `src/core/pipeline/index.ts`（导出纯函数）
- `src/app/api/agent/apply-extraction/route.ts`（plotEvents 落库分支）
- `src/components/workspace/postgen/types.ts`（TabKey/TABS/AdoptControllers）
- `src/components/workspace/postgen/PlotTab.tsx`（新·情节 Tab）
- `src/components/workspace/postgen/PostGenPanelTabs.tsx`（常显主 Tab）
- `src/components/workspace/PostGenPanel.tsx`（状态 + 提交 + 渲染）
- `src/lib/changelog-data.ts` / `CHANGELOG.md`（升 v1.8.25）
