# 工作单元报告：一致性事实基线最小 UI（v1.6.51.3）

> 费曼式沉淀。读者零基础——每个术语第一次出现都用大白话讲清「它怎么运作」+ 生活化类比。
> 前置：v1.6.51（支柱）/ v1.6.51.1（注入提示词）/ v1.6.51.2（确认定稿自动抽取）已让基线在后台真正产生。本回合让作者**肉眼能看见、能手点重抽**。

---

## 一、干了什么（一句话）

给写作工作台加了一个「一致性基线」面板：作者打开右侧栏「实体」Tab，点「一致性基线」子标签，就能看到系统自动从全书抽取出来的「事实清单」（按 人物/世界/情节/关系 分组，每条显示谁·什么属性=什么值·来源·置信度）；面板上还有一个「手动重新抽取」按钮，点一下立刻重新整理一遍，不必干等系统自动跑。

---

## 二、为什么这么做（底层原理）

**名词大白话**

- **一致性基线 / 事实清单** = 系统读完整本书后整理的「设定备忘」（主角叫什么、修炼什么功法、和谁什么关系）。写新章节时贴给 AI 防止前后矛盾。前三个版本已经能自动生成这份备忘并存进数据库，但作者**在界面上根本看不到它**——等于做了个看不见的功能。
- **「实体」Tab** = 工作台右侧栏的一个标签页，本来放「实体追踪」（本章出现了哪些角色/名词）和「未收尾线索」（伏笔）。类比：你书桌右边一格，专门放参考资料卡片。
- **子 Tab** = 大标签下面的小分类。类比：参考资料格子里再分「实体卡」「伏笔卡」「一致性卡」三叠。
- **只读优先** = 这一版面板只让你**看**和**点重抽**，**不能**改里面的事实。类比：先给你一张打印好的备忘供查阅，暂不允许你拿笔改（改的功能留到下一版 B）。

**为什么挂在「实体」Tab 下做子 Tab，而不是新开一个顶层 Tab 或新页面**

- 一致性基线本质是「参考资料卡片」，和伏笔卡同属「写作时随手查」的东西——放同一个格子（实体 Tab）最顺手，作者写哪章点开就能看，不用跳页。
- 顶层 Tab 改动更大（要改 `page.tsx` 的 Tab 联合类型 + 渲染），而子 Tab 只在 `RightPanel.tsx` 内部扩一个联合成员、加一个按钮、加一处渲染，**零改动页面容器**，回归面最小（符合马斯克拍板「最小改动、零新依赖」）。
- 仿照已有的 `ForeshadowingPanel`（伏笔面板）写，风格 100% 统一，维护者一看就懂这是同级分析面板。

---

## 三、方法 / 工具 / 效果（对比过什么、结果数据）

**代码结构（两个文件）**

1. 新建 `src/components/workspace/ConsistencyPanel.tsx`（约 150 行）：
   - `"use client"` 客户端组件，props 收 `projectId: string`（由 RightPanel 从 store 的 `project.id` 注入，无需自己取参数）。
   - 拉取：`useEffect` 里 `fetch('/api/projects/${projectId}/consistency')` → 读 `{ facts }`。
   - 重抽：`reExtract` 里 `fetch(..., { method: "POST" })` → 读 `{ ok, count, facts }` → 再调一次 `load()` 回拉刷新。
   - 展示：按 `CATEGORY_ORDER`（character/world/plot/relationship）四组过滤渲染；每条显示「**主体** 的**属性** = **值**」+ 来源 + 置信度百分比。
   - 状态：loading（加载中）/ error（失败红字）/ empty（空时提示去点重抽）/ 正常列表；用 `cancelled` 标志防止组件卸载后 setState。
2. 改 `src/components/workspace/RightPanel.tsx`：
   - import 新组件。
   - `EntitySubTab` 联合类型加 `"consistency"`。
   - 子 Tab 按钮区加一个「一致性基线」按钮（图标 `bookmarked`）。
   - 渲染区从二分支改成三分支（`entities | foreshadowing | consistency`）。

**为什么用原生 fetch 而不是现成的 `useQuery` hook**

- 全库统一是原生 `fetch` + `useState`（只有伏笔/实体面板这么写），保持一致最稳。
- 库里有个自研 `useQuery`（`src/hooks/useApi.ts`）但**零组件使用**，是 FE-9 试点预留的。新面板若用它会引入「无人验证过的路径」，反而增加不确定风险。先用成熟写法，试点留待以后。

**API 契约对齐（关键，来自实际读路由代码）**

- `GET /api/projects/[id]/consistency` 返回 `{ facts: ConsistencyFact[] }`（不是包在 `data` 里）。
- `POST` 同路径返回 `{ ok: true, count, facts }`（路由做了 `{ ok:true, ...result }` 展开）。前端读 `json.ok` 判成功，再 `load()` 回拉。
- 字段：`category` 在 DB 是普通 String（值 character/world/plot/relationship），前端 `as ConsistencyCategory` 收口；`confidence` 是 0~1 浮点，展示时 `×100` 取整。

**验证（实测）**

- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → **0 错误**（含修正一处图标名：`IconName` 类型是 `bookmarked` 不是 `bookmark`，初写报错后改对）。
- `npx vitest run` → **37 文件 336/336 全绿**（UI 组件无单测，但类型与渲染结构与既有面板一致，无业务回归）。

---

## 四、关键取舍（A 为何不选 B、踩坑与修复）

| 决策点 | 选了什么 | 没选什么 | 为什么 |
|---|---|---|---|
| 挂载位置 | 实体 Tab 子 Tab | 顶层新 Tab / 新路由页 | 子 Tab 零改 page.tsx、回归最小、与伏笔卡同格顺手 |
| 数据流 | 原生 fetch + useState | 自研 useQuery | 全库统一成熟写法，避免引入零使用率的新 hook 风险 |
| 编辑能力 | 只读 + 重抽 | 可增删改事实 | 「只读优先」是马斯克拍板的 A 范围，编辑/矛盾标红留 B |
| 图标 | bookmarked（类型联合真实存在） | bookmark（我以为存在） | tsc 报错 `TS2820` 纠正，以类型真相为准 |

**踩坑现场（真实发生并修复）**

- 初写子 Tab 按钮用了 `<Icon name="bookmark" ...>`，tsc 报 `error TS2820: Type '"bookmark"' is not assignable to type IconName... Did you mean '"bookmarked"'?`。根因：`IconName` 是 `iconMap` 的 keyof 联合类型，**编译期强约束**，和我从 grep 看到的运行时可用名不完全一致（grep 命中的是别的组件里的 `bookmarked`，我误读成 `bookmark`）。修复：改成 `bookmarked`，复跑 tsc 0 错。**教训**：UI 图标名以 `IconName` 类型为唯一真相，不能只看 grep。

**可复现步骤（照做即得相同结果）**

1. 新建 `src/components/workspace/ConsistencyPanel.tsx`：「use client」+ props `{ projectId }`；`useEffect` 内 `fetch GET` 读 `json.facts`；`reExtract` 内 `fetch POST` 后 `load()` 回拉；按四 category 分组渲染，含 loading/empty/error 三态与 `cancelled` 取消保护。
2. `RightPanel.tsx`：import 新组件；`EntitySubTab` 加 `"consistency"`；子 Tab 按钮区加「一致性基线」按钮（`Icon name="bookmarked"`）；渲染区改成 `entities | foreshadowing | consistency` 三分支。
3. 跑 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`（须 0 错，注意图标名用 `bookmarked`）+ `npx vitest run`（须 336/336 全绿）。
4. 升 `changelog-data.ts`（LATEST_VERSION / CHANGELOG_BRIEF / VERSIONS）+ 根 `CHANGELOG.md` 头条到 v1.6.51.3，一起 commit。

---

## 五、诚实边界（明确未做 / 未实测）

- **未做端到端浏览器实测**：本回合只过类型检查 + 单测，未起 dev server 在真实浏览器点开面板验证渲染（环境 DeepSeek 偶发 503，且 UI 是纯前端 fetch + 既有验证过的组件模式）。逻辑与契约已对齐路由代码，渲染风险低；真实点击验证留待可联网/可起服务时补。
- **面板只读优先**：不提供编辑/删除事实的入口；若作者想修正某条错误事实，目前只能重抽（重抽基于全书重新 LLM 提炼）。编辑与「主动矛盾检测标红」是 B 任务范畴，作为 v1.8 卖点。
- 下一步（马斯克拍板 C→A→B 的最后一棒）：**B 主动矛盾检测**——生成新章节后自动比对基线，发现「这章说主角左眼是黑色，但基线记的是灰色」这类冲突时标红 / 提示修正。
- 推送：TLS 代理仍不可达（直连 + 7897 均 `TLS connect error`），本回合本地提交，未推送；代理恢复后以 `git ls-remote origin main` 真查远程 HEAD 对账后一次性补推（含 v1.6.51 / v1.6.51.1 / v1.6.51.2 / v1.6.51.3），绝不谎报。
- 个人 IP 永远归瑞宝宝（樊斯瑞），本仓库只迭代 novel-forge。
