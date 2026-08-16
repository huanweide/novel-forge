# novel-forge 五视角体验 · 整合版改动计划

> 评估对象：novel-forge v2.44.0（Next.js16 / React19 / Tailwind v4 / Prisma7 / PostgreSQL / Zustand）
> 方法：五视角（读者 / 写手 / 架构师 / 自我写作爱好者 / 美学UI大师）独立体验全部功能，各自产出报告，本文件去重、按主题合并、标注来源，形成统一路线图。
> 原始报告：`PROCESS/multi-perspective/{reader,writer,architect,hobbyist,uimaster}.md`（每条改动均附源码行号与截图证据）。

---

## 一、五视角共识（一句话方向）

功能闭环已经相当完整（流式落库、智能审阅、批量后台、游戏模式、记忆预算透明），但「门槛高、视觉密度过载、心流断点、听书半成品、架构债」五座山，让它现在更像「开发者自用工具」而非「人人能用的作家工坊」。

整合计划围绕两个主轴：
- **主轴A 让人敢用、让作家专心写**：降门槛 + 收敛视觉与信息密度。
- **主轴B 让写手心流不断、读者听得爽**：打通闭环断点 + 修性能/正确性。

---

## 二、P0 必做（跨视角紧急，建议作为 v2.45 核心）

### P0-A 新手第一步不被劝退（来源：自写爱好者）
- **首页不弹技术公告**：新增 `CHANGELOG_USER_BRIEF` 大白话常量（≤3 条，如「AI 写作助手更顺手了」），更新弹窗默认显示它，底部保留「查看完整公告」；无项目的新用户不自动弹公告，改显示欢迎引导。
- **新手引导前置到首页 + 大白话**：`OnboardingModal` 抽到首页（`localStorage nf_onboarded_v1` 控制），改 4 步交互引导（配 AI 钥匙 → 建第一本 → AI 写第一章 → 导出成书），每步配可点击示范，文案去「抽卡/填表/芯片」等内部词。
- **设置页默认「2 步配置」**：只留推荐提供商单选 + API Key 输入 + 测试连接；其余（违禁词/快捷键/记忆衰减/墨灵/BaseURL）收进「高级设置」折叠；选硅基流动/DeepSeek 时模型自动默认，免手动检索。
- **API Key 缺失给「怎么办」**：设置页加「我没有 API Key」图文教程（注册 → 复制 → 粘贴，3 步截图）；未配置时首页/explore 顶部非遮挡横幅引导，并给推荐 provider 注册链接与预估价格（约 1 元/万字）。

### P0-B 工作区视觉收敛 + 信息减负（来源：美学UI大师 + 自写爱好者 + 写手）
- **收敛彩虹分类芯片**：16 个分类色码改为专属 `--nv-cat-*` 令牌（18–22% 透明），实体名芯片统一玻璃灰、仅 hover 浮现金描边——让视觉重心回正文（也解决爱好者「不敢点彩色芯片」）。
- **实体高亮真正亮起来**：`.entity-highlight`（globals.css:862）改为香槟金渐变下划线 + hover 光晕，承担「导航锚点」功能。
- **品牌顶栏贯穿全站**：抽 `<NFHeader>` 组件，所有路由挂载金色发光线品牌符号。
- **左下角孤立 `N` 水印替换为 `nf-logo`**。
- **确认流程状态常驻主界面（并入写手 P0-1）**：在 CenterPanel/RightPanel 底部常驻极简章状态条（草稿/待确认/已定稿 + 一键 AI 诊断/定稿/打回），消除「写完 → 找确认」的跳转。

### P0-C 写作心流不断：闭环末端动作回主界面（来源：写手）
- **附身/对话产出一键落正文**：`CharacterChatDialog` 附身模式加「插入正文（光标处/章尾）」「复制到剪贴板」，调用现有 `PUT /api/story/nodes/:id` 追加。
- **生成前确认给「本次会话直接生成」通道**：`PreGenConfirm` 加勾选（`localStorage pregen-skip-<projectId>`），习惯固定的写手一次勾选后全程不被打断。

### P0-D 读者听书 / 阅读干净（来源：读者）
- **TTS 分段朗读 + 进度条 + 续播**：整章切句/段数组、`currentIndex` 驱动、上/下句跳转、`localStorage` 续播位置。
- **txt 导出必须清洗 Markdown**：`textNodeGen` 复用 `stripMarkdown`（保留段落结构），与 TTS 清洗逻辑统一。
- **朗读保留段落停顿 + 补念章节标题**：`stripMarkdown` 加 `preserveParagraphs`，TTS `text` 拼 `selectedNode.title`，每章开头报幕「第一章 XXX」。

### P0-E 性能与数据正确性止血（来源：架构师）
- **流式逐 token 全树重渲染 → 状态下沉 + memo**：把 `streamContent`/`genStep` 等高频状态下沉到 CenterPanel 或 `useWriterStore`，面板加 `React.memo` + props 稳定化（对大书生成流畅度影响最大、风险最低）。
- **SSE 路由泄露原始 `err.message` → 统一 `classifyError`**：`game/action` 的 catch 只写可读文案，与全仓错误收敛一致。
- **状态词表双轨 + 自由 String 无约束 → 根除脏数据**：建 `StoryNodeType`/`ContentStatus` 常量 + 字面量联合类型，全仓替换魔法串，路由入口 zod 校验，中长期改 Prisma `enum` + 一次性数据订正脚本（根除「type 全为 section」类脏数据）。

---

## 三、P1 明显提升（建议 v2.46 主力）

### 阅读体验（来源：读者）
- **沉浸阅读模式**：隐藏工具条/大纲/AI 面板，保留细条（章节标题/TTS/目录/字号·行距·主题），可选独立 `/read/[projectId]/[nodeId]` 路由。
- **导出 HTML/EPUB/DOCX 用完整 Markdown 渲染**：引入 `marked`/`remark`，前后端同渲染器，不再泄漏 `##`/`-`/`|`。
- **读者剧情导览入口**：沉浸模式/阅读页右侧滑出只读故事线 + 关系图，关系图增加「从本章正文自动抽取」兜底。

### 写作闭环补充（来源：写手）
- **章名规则可自定义**：项目设定加规则分区（前缀模板/最大长度/剥人名/自动），生成前可预览。
- **情节采纳支持批量 / 自动**：按 S/A 级自动采纳、采纳本卷全部；抽取结果落库不丢。
- **个人风格从正文反向萃取**：`StyleEditor` 加「从本书正文萃取」→ 回填 12 维 + 描述 → 存预设；两入口明示双向同步。
- **批量写作章纲跨批延续**：自动注入上批末章摘要/未收尾伏笔。

### 视觉质感（来源：美学UI大师）
- **移动端断点真测**：`<lg` 强制抽屉，三档（iPhone SE/14/iPad）Playwright 截图留档 `PROCESS/ui-shots/mobile/`。
- **工作区正文对比度/字号提升**：字色 `#F0EEE8`、18px、行高 1.9。
- **顶栏七件套分层**：主操作金色 vs 辅助 `btn-ghost` 分组分隔。
- **全站按钮体系统一**：`Button` variants + 玻璃按钮 `.btn-*` + `TagChip` 三类边界清晰。
- **浅色/苍青主题真实截图验收**（补 `PROCESS/ui-shots/themes/`）。
- **章节标题文案去重**（「第一章：第一章·启航」）。

### 降门槛（来源：自写爱好者）
- **探讨模式按题材切换术语和步骤**：玄幻/言情/悬疑通用模板，允许跳过步骤，「抽卡」改名「随机灵感」。
- **创意工坊隐藏开发者标签**：正则/API 参数收进高级开关，「缝合怪」改名，预设加人话说明。
- **故事线/因果链术语加翻译**：tooltip + 「这是什么」说明 + 空状态改「AI 先帮你理一条主线」。

### 架构健康（来源：架构师）
- **拆解上帝组件 `WorkspacePage`**（1493 行）：抽 `useWorkspace` hook + `WorkspaceDialogs` 配置表驱动。
- **入参校验统一闸门**：`withValidatedBody` 包裹写路由 + CI 检查。
- **Prisma 表名小写化**：`@@map("snake_case")` + 受控迁移（消大小写雷）。
- **Agent 工具注册表减负**：分类映射抽常量、工具拆独立文件、`prisma` 去 `any`。
- **局部更新替代全量 `loadProject`**：保存单节点只 PATCH + 局部 store 更新（大书保存开销从「下载整本」降到「一条记录」）。

---

## 四、P2 打磨与加固（建议 v2.47 及之后）

- **读者**：我的书架/继续阅读（`ReadingProgress` 表 + 首页继续阅读区）、探索页重定位为「发现」、可选高质量第三方 TTS。
- **写手**：长文记忆自动提示、游戏模式轻量档、全书摘要总览入口、章纲三条入口收敛、角色卡写手模式。
- **视觉**：首页 PaperBoats 真实验收截图、正文生成流光扫描反馈、角色立绘占位、设置段落编号去、Toast 动画、游戏模式 emoji 换 icon、噪点纹理取舍、品牌签名统一。
- **爱好者**：系统状态横幅分用户/开发者、角色管理默认收起批量、导出/备份术语贴近写作。
- **架构**：削减 1245 处 `any`、清理 136 `console` + 42 `TODO`、部署解耦 `localhost`、文档路径订正、迁移纪律、鉴权 `middleware` 预留。

---

## 五、建议交付节奏（版本路线）

| 版本 | 主题 | 包含 |
|---|---|---|
| **v2.45 让人敢用** | 降门槛 + 视觉收敛 | P0-A + P0-B + UI P1 轻量项（标题去重、正文对比度、按钮统一、NFHeader） |
| **v2.46 写得爽/听得爽** | 心流 + 读者 | P0-C + P0-D + P1 写作闭环补充（章名/情节/风格/批量延续）+ 沉浸阅读 + 导出完整渲染 |
| **v2.47 地基止血** | 性能/正确性 + 架构健康 | P0-E（性能+正确性）+ P1 架构健康（上帝组件/校验/表名/局部更新）+ 移动端真测 + P2 加固 |

---

## 六、附：五份原始视角报告索引
- `PROCESS/multi-perspective/reader.md` —— 读者视角
- `PROCESS/multi-perspective/writer.md` —— 写手视角
- `PROCESS/multi-perspective/architect.md` —— 架构师视角
- `PROCESS/multi-perspective/hobbyist.md` —— 自写爱好者视角
- `PROCESS/multi-perspective/uimaster.md` —— 美学UI大师视角

---

## 七、实际落地进度追踪（截至 v2.48.0 · 2026-08-16）

> 本节对照第二节~第四节，标注每项**真实落地状态**（代码证据，非凭记忆）。

### 已收口
- **v2.45 让人敢用** ✅ 完整：P0-A 降门槛 + P0-B 视觉收敛 + UI P1 轻量项（NFHeader / 标题去重 / 按钮统一 / 正文对比度）。
- **v2.46 写得爽/听得爽** ✅ 完整（commit b804806）：P0-C 心流（附身落正文 + 生成前确认跳过）+ P0-D 听书（TTS 分段/进度/续播 + Markdown 清洗）+ P1 写作闭环（章名/情节/风格萃取/批量延续）+ 沉浸阅读 + 导出完整渲染。
- **v2.47 地基止血（部分）**：✅ SSE 错误收敛（write/continue/refine 三路由 catch 改 `sseError()`，复用 `classifyError`）；✅ 入参校验统一（`requireFields` 闸门替换三路由手写校验）；✅ 节点类型常量化（`NODE_TYPE` 取代页面/路由/桥接裸串）。状态词表已常量化（`src/core/story-status.ts` 的 `STATUS_*`），page.tsx 裸串 grep 0 命中（仅 `"completed"` 零星残留）。
- **v2.48 地基止血（部分）**（commit ccd520e）：✅ 上帝组件纯逻辑外提（`src/core/workspace-derive.ts`：章节筛选/全书确认/叙事阶段推导 + 11 例单测）；✅ 保存/冲突解决后 `updateNode` 同步回写 store 节点（修脏数据隐患）。

### 已收口（截至 v2.50.0 · 2026-08-16）
- **v2.49.0 性能止血** ✅（commit 54aeaf8）：①流式 `streamContent` 下沉 `useWriterStore`（消除逐 token 全树重渲染）；②`/api/game/action` catch 复用 `sseError()`（保留 `error` 字段名，补齐 v2.47 漏项）；③done 后 `GET /api/story/nodes/:id` 单节点局部刷新替整本 `loadProject()`（失败兜底全量）。配套 `writer-store.test.ts` 4 例；tsc 0 错 + vitest 98 文件 931/931 全绿。
- **v2.50.0 架构拆弹·Agent 注册表减负** ✅（本版）：七组枚举抽 `as const` 常量（`CHARACTER_ROLES` 等）+ 世界书中文分类映射合并为唯一 `LORE_CATEGORY_MAP`（修 `lore_update` 漏映射）。纯常量外提、工具数与导出不变；双门禁全绿。

### 仍待办（按价值/风险/依赖重切后的剩余项）
- ⚠️ **P1 架构·上帝组件拆解（v2.50.1 目标）**：`WorkspacePage` 仍 1521 行、66 `useState`；v2.48 只外提纯逻辑，未抽 `useWorkspace` hook + 对话框配置表驱动。最高风险项，需单独聚焦版 + 读懂写组件测试防对话框/生成流回归。
- ❌ **P1 架构·Prisma 表名小写（v2.51.0 目标）**：40+ 个 model 均 PascalCase 且无 `@@map`（真实表名带引号大写，大小写雷仍在）；需 `@@map("snake_case")` + 对线上 Neon 跑受控重命名迁移（维护窗口、先备份）。
- ⚠️ **P1 架构·Agent 注册表去 any（并入 v2.51.0）**：`tool-registry.ts` 的 `prisma: any` / 各 `data: any` / `where: any` 属 P2 any-cut 红区上游，随 v2.51.0 数据层治理一并收窄；「工具拆独立文件」暂缓（大 churn，留待 v2.50.1 组件拆解时顺势做）。
- ❌ **P2 加固**：any 总量 5630（243 文件）、console 137 处、读者书架/继续阅读未做、移动端真机测试未做。

---

## 八、v2.49+ 剩余路线建议（新订立）

按「价值 / 风险 / 依赖」重新切版，避免 v2.47 一口吞太多导致半吊子。

### v2.49「性能止血」（推荐首刀 · 低成本高价值）
架构师原评流式 memo「风险最低、影响最大」，且 game 路由收敛、局部更新均已有 v2.47/48 铺垫，几乎零新风险：
1. **v2.49-1 game/action SSE 错误收敛**：复用 `sseError()` 替换 `route.ts:50` 裸写，与三路由一致。零风险。
2. **v2.49-2 流式渲染性能**：把 `streamContent`/`genStep` 等高频状态下沉到 `CenterPanel` 局部或 `useWriterStore`，`CenterPanel` 及高频子面板加 `React.memo` + props 稳定化。大书生成流畅度直接受益。
3. **v2.49-3 局部更新替代 done 后全量 loadProject**：done 事件后改用 store 局部更新（节点已落库，`useProjectStore.updateNode`/增量合并），不再整本重载；导入/新建等确需刷新的保留 `loadProject`。

### v2.50.0「架构拆弹·Agent 注册表减负」（已收口 · 2026-08-16）
纯常量外提：七组枚举抽 `as const` 共享常量 + 世界书中文分类映射合并为唯一 `LORE_CATEGORY_MAP`（修 `lore_update` 漏映射）。零行为变化、低风险、双门禁全绿。详见 v2.50.0 版本条目。

### v2.50.1「架构拆弹·上帝组件拆解」（下一聚焦版 · 高风险）
`WorkspacePage`（1521 行 / 66 `useState`）抽 `useWorkspace` hook + `WorkspaceDialogs` 配置表驱动，把上帝组件降到可维护粒度（续 v2.48）；「工具拆独立文件」顺势并入此版。需配套读懂写组件测试防对话框/生成流回归。

### v2.51.0「架构拆弹·数据层止血」（需维护窗口 · 高风险）
1. **Prisma 表名小写迁移**：`@@map("snake_case")` + 对线上 Neon 跑受控重命名迁移（维护窗口、先备份）。
2. **Agent 注册表去 any**：`prisma: any` / `data: any` / `where: any` 随数据层类型化一并收窄（P2 any-cut 红区上游）。

### v2.51+「P2 加固」（长期穿插）
- 削减 any（5630 处，按模块渐进）/ 清理 console（137 处）。
- 读者书架 + 继续阅读（`ReadingProgress` 表 + 首页继续阅读区）。
- 移动端真机测试（Playwright 三档 iPhone SE/14/iPad 截图留档 `PROCESS/ui-shots/mobile/`）。
- 其余 P2 打磨（角色立绘占位 / Toast 动画 / 游戏模式 icon 等）。

### 门禁纪律（不变）
每版走双门禁（`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 0 错 + `npx vitest run` 全绿）→ 版本四文件同步（package.json / changelog-data / CHANGELOG.md / 更新报告.md）→ commit + push origin/main → 记 memory。
