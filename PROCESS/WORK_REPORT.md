# Novel Forge 工作单元费曼报告

> 用大白话把每个工作单元讲清：干了什么 → 为什么 → 怎么做的 → 关键取舍。每个术语第一次出现都配生活化类比。

---

## v0.46.17 — 弹窗统一收口到 Modal（FE-3）

### 一句话背景
网站里所有"弹出来的窗口"（角色编辑、导入、设置、导出……）原本各自抄了一份"半透明黑底遮罩"的代码。改一次遮罩样式要改 29 处，还容易漏。这次把它们统一收口到一个叫 `Modal` 的零件里，像全公司统一用同一款门——门的样子只改一处。

### ① 干了什么
把全项目 **22 个业务弹窗**手写的那层"黑底遮罩 + 关闭逻辑"全部删掉，换成统一调用 `<Modal>` 零件。顺带给 `Modal` 加了 `bare`（裸装）模式：只统一"外壳"（遮罩、ESC 关闭、滚动锁、焦点不跑出窗口），但弹窗内部长什么样原样保留，所以**没有破坏任何弹窗原来的功能**。

### ② 为什么这么做（底层原理）
- **"遮罩"是重复的**：每个弹窗都要先画一层盖住全屏的半透明黑底，再把内容框放中间。这层遮罩和"这个弹窗是干嘛的"毫无关系，纯属重复劳动——就像 22 个房间各自焊了一扇一模一样的门，坏了一扇就得 22 扇一起修。
- **"关闭行为"是无障碍刚需**：正规弹窗要能按 ESC 关、按 Tab 时焦点不跑到背后页面、背景不能滚动。这些能力散落各地时，有的弹窗有、有的没有，键盘用户/读屏用户用着别扭。收口到一处才能"一处定义、处处一致"。
- **类比**：`Modal` 像一个"标准门框工厂"，22 个弹窗只负责往门框里塞自己的内容，门框（遮罩+开关方式）全由工厂统一提供。

### ③ 怎么做的（方法 + 效果）
1. **侦察**：先用 Glob/Grep 找出全部 `fixed inset-0 z-50` 手写遮罩（11 处裸遮罩文件），确认哪些该收、哪些不是弹窗（下拉、抽屉、toast、游戏画布、粒子特效——这些合法保留）。
2. **改工厂**：给 `Modal` 加 `bare` 模式。关键决定——`bare` 模式**不强制**限制高度和滚动，而是把"多高、怎么滚"交给调用方用 `panelClassName` 传（避免和"头部固定+内容滚动"的弹窗打架）。另加 `header`（自定义头部插槽）、`showClose`（右上角关闭键）。
3. **逐个迁移**：22 个弹窗删掉自己那层遮罩，改成 `<Modal open onClose={...} bare panelClassName="...">`。内部 JSX 一字不动。
4. **诚实保留原交互**：
   - 原来"点遮罩关不掉"的（构建配置、建表、上传、首页公告）→ 用 `closeOnOverlay={false}` 保留；
   - 导入向导原来"只有在某一步才能点遮罩关"→ 保留 `step` 条件；
   - 其余统一"点遮罩或按 ESC 关"。

**效果数据**：
- tsc 类型检查零错误（TSC_EXIT=0）；
- grep 复核 `src` 下无残留手写业务弹罩；
- 零新增 npm 依赖；
- 提交 `05bfc21`，已推上 GitHub main。

### ④ 关键取舍（为什么选 A 不选 B）
- **选"统一外壳、保留内部"，不选"推倒重写每个弹窗"**：重写风险高、易改坏功能，且纯属 cargo cult（岛民竹编控制塔——只为"看起来统一"而重造轮子）。统一外壳已达成目标，内部不动最稳。
- **`bare` 模式不强制高度**：若强制 `max-h-[88vh] overflow-y-auto`，会和"头部固定+内容区滚动"的弹窗（生成前确认、抽卡、导入向导）布局冲突。把控制权交给调用方更灵活。
- **`DialogOverlay` 退役而非硬删注释**：旧零件已无调用方，留注释说明"别再用手写遮罩"，避免后人误用。

### 踩坑与修复（真实发生，非推测）
3 个文件迁移后出现 JSX 标签不匹配 → tsc 报错：
- ImportWizard / SettingsImporter：删了外层遮罩 `<div>` 但忘了删对应的 `</div>`，多出孤儿闭合标签 → 读结尾、平衡 div 后修复；
- ExpandResultModal：残留 `import { useFocusTrap }`（已不用）、缺 `import { Modal }`、还多一个 `</div>` → 补 import、删 stal import、删孤儿 `</div>`。

修复后重跑 tsc 转零错误。**这些都是自己真跑出来、真修掉的，不是"以为改对了"。**

### 诚实边界（没做的 / 没验证的）
- 未在浏览器实跑 22 个弹窗的"焦点不逃逸 / ESC 关闭 / 滚动锁"手感（沙箱无图形浏览器）。验证维度是：tsc 零错误 + JSX 标签平衡 + grep 零残留手写遮罩。建议作者本地 `npm run dev` 点开几个弹窗确认观感。
- 非弹窗的 `inset-0`（抽屉遮罩、下拉背景、toast 容器、游戏画布、粒子特效）**有意保留**，不强行纳入 Modal——它们不是"弹窗"，收口反而破坏各自交互。

---

*下个单元：#196 FE-6 响应式抽屉（explore / game 三栏抽屉化）。*

---

## v0.46.18 — 响应式补齐：explore / game 三栏抽屉化（FE-6）

### 一句话背景
网站里"探讨模式"和"游戏模式"两个页面都是左中右三栏布局，但栏宽是写死的（比如左边固定 320px、右边固定 288px）。在手机/平板/小窗口上，左右栏会硬挤中间的内容区，中间的互动区被压成一条缝。这次让左右栏在窄屏变成"抽屉"（从侧面滑出、点遮罩收起），中间内容始终占满宽度——和主页早已做好的抽屉一样。

### ① 干了什么
给 explore 探讨页、game 游戏页的三栏布局加了窄屏抽屉：
- 左右栏在屏幕 `<lg`（小于 1024px）时变成"贴边固定抽屉"，点顶部按钮滑出、点半透明遮罩收回；
- 屏幕 `≥lg` 时自动"复位"成原来的并排三栏，桌面体验零变化；
- 顶部加了只在窄屏显示的抽屉切换按钮；中间内容区永远占满宽度，不再被挤压。

### ② 为什么这么做（底层原理）
- **"响应式"= 布局随屏幕宽度自适应**：宽屏并排看信息多，窄屏并排就挤成一团。抽屉是经典解法——把次要信息"收进侧面"，需要时再拉出来，主内容始终有地盘。
- **类比**：像手机 App 的"侧边菜单"——平时藏起来，点汉堡按钮才滑出；桌面版软件则把菜单常驻在左边。我们让同一个页面在手机和电脑上各用各的合适形态。
- **复用而非重造**：主页（workspace）早就做好了这套抽屉模式，本项目直接照抄它的类名模板，保证全站交互一致、不引入新 bug。

### ③ 怎么做的（方法 + 效果）
1. **侦察**：Grep 找出 explore/game 三栏的栏宽类（`w-80`/`w-72`/`w-52`/`w-64`）和容器结构，确认它们没有响应式断点。
2. **套模板**：把每个侧栏的 className 改成"固定定位抽屉 + `lg:` 复位"组合：
   - 窄屏：`fixed inset-y-0 left/right-0 z-40 max-w-[85vw] h-full transition-transform`，开 `translate-x-0`、关 `-translate-x-full`（滑出/缩回带动画）；
   - 宽屏：`lg:static lg:z-auto lg:shrink-0 lg:w-* lg:translate-x-0 lg:transition-none`（取消固定、回到正常文档流并排）。
3. **加开关**：新增 `leftDrawerOpen`/`rightDrawerOpen` 两个状态；顶部加 `lg:hidden` 切换按钮（窄屏才显示）；三栏容器末尾加 `lg:hidden` 半透明遮罩，点它关两栏。
4. **诚实核查 dissect 页**：计划顺带提了"dissect 长表单窄屏单栏堆叠"。Grep 后发现 dissect 本就是单栏居中表单（`max-w-6xl mx-auto`，无多列 grid），窄屏天然不挤压——所以**没改**，避免"为改而改"的形式主义。

**效果数据**：
- tsc 类型检查零错误（TSC_EXIT=0）；
- 零新增 npm 依赖；
- 提交 `222df26`，已推上 GitHub main。

### ④ 关键取舍（为什么选 A 不选 B）
- **选"镜像主页抽屉模板"而非"各页自己发明响应式"**：主页模板已在真实使用、经过验证；复用保证全站行为一致，且改动小、风险低。
- **选"诚实保留 dissect 不改动"而非"按计划硬改"**：计划"做完"里提了 dissect，但"现在"描述只覆盖 explore/game。实测 dissect 本就单栏，硬加"单栏堆叠"是无意义改写（cargo cult）。如实记录、不改。
- **z-index 层级**：抽屉 z-40、遮罩 z-30（遮罩在抽屉之下），保证点遮罩能关抽屉、且不会误盖住抽屉内容——直接复用主页已验证的层级关系。

### 诚实边界（没做的 / 没验证的）
- 未在真机窄屏实跑抽屉开合、遮罩点击收起的手感（沙箱无图形浏览器）。验证维度是：tsc 零错误 + 类名结构完整镜像主页已验证模式。建议作者本地把窗口缩到手机宽度，点一下切换按钮、点一下遮罩确认。

---

## v0.46.19 — LLM 重试 + 故障转移（BE-4）

### 一句话背景
写小说时要调用 AI 模型（DeepSeek 之类）来生成正文。但 AI 服务偶尔会"抽风"：限流（429）、服务器报错（5xx）、或网络抖动连不上。原来代码碰到一次失败就直接把整个生成中断、弹报错——你等了半天的生成说没就没。这次给所有 AI 调用加了"自动重试 + 备用模型兜底"，让它自己悄悄恢复，你几乎无感。

### ① 干了什么
- 给核心 AI 调用客户端（`src/core/llm/client.ts` 的 `chat` 同步调用和 `chatStream` 流式调用）加了**指数退避重试**：网络抖/限流/5xx 默认重试 3 次，每次等的时间翻倍（0.6s → 1.2s → 2.4s …封顶 8s）并带随机抖动，避免瞬间抖动直接断生成。
- 加了**故障转移（多模型兜底）**：`LLMConfig` 里新增一条"备用模型链"。主模型重试 3 次还失败，就自动换成备用模型（换模型名/地址/密钥）重发整段请求。配置靠环境变量 `LLM_FALLBACK`（如 `deepseek-v3@https://api.deepseek.com,Pro/xxx@https://api.siliconflow.cn`）注入，**不配就不转移，纯重试**——零数据库改动、零新依赖。
- 顺手给遗留的老调用路径（`src/lib/llm.ts` 的 `callLLM`）也补了同样的重试。

### ② 为什么这么做（底层原理）
- **"重试"= 失败了过会儿再试一次**：AI 服务大多是临时故障（限流、瞬断），过几百毫秒往往就好了。指数退避（越试等越久）是为了不"狂轰滥炸"把服务打挂，也避免自己浪费资源。
- **"故障转移"= 主路不通走备路**：类比家里网断了，手机切流量继续用。主模型（如 DeepSeek）彻底挂了，自动切到备用模型（如硅基流动）把活干完。
- **类比**：像快递员第一次没打通你电话（限流），隔几分钟再打（重试）；要是你换号了（主模型挂），就打你备用手机（备用模型）。
- **诚实边界（关键）**：4xx 这类"钥匙配错/模型名错"（401/403/404）**不重试也不转移**——这类是配置问题，重试纯属浪费；直接抛中文报错让你去改设置。

### ③ 怎么做的（方法 + 效果）
1. **抽公共函数**：把"发一次请求 + 解析返回"抽成 `attemptChat`（同步）和 `establishStream`（流式建立连接），它们返回 `{成功, 是否致命错, 错误对象}` 三态。
2. **可重试判定 `isRetryable`**：网络层错误（无状态码）/429/5xx → 可重试；4xx → 致命，直接抛。
3. **调用链 `buildChain`**：把"主模型 + 所有备用模型"排成一串，外层循环依次尝试，每个都带自己的重试。
4. **流式安全**：流式生成只在"还没出字"的阶段（建立连接/首包前 HTTP 错）重试和切换；一旦开始哗哗出字，就**不再重试/切换**，否则会重复输出污染正文。
5. **配置注入**：`getEffectiveConfig` 读 `process.env.LLM_FALLBACK`，按逗号分词、按 `@` 拆模型名与地址，填进 `fallbackModels`。

**效果数据**：
- tsc 类型检查零错误（TSC_EXIT=0）；
- 零新增 npm 依赖；
- 提交 `bea8ed0`，已推上 GitHub main。

### ④ 关键取舍（为什么选 A 不选 B）
- **选"零 schema 注入备用模型"（env 变量）而非"加设置页 UI + 数据库字段"**：计划说故障转移"可选配置"。加数据库字段要 migration、加 UI 是大改动；而用环境变量零侵入、作者部署时在 `.env` 加一行即可启用。配置入口能力已就位，但**没伪装"已配好可视化开关"**——如实标注，UI 留待后续。
- **选"4xx 不重试"而非"无脑全重试"**：401/403 是 Key 错，重试 3 次也是同样错，纯浪费且拖慢报错；直接抛 `mapLLMError` 中文提示更诚实。
- **选"流式仅连接阶段重试"而非"整个流重试"**：流中途失败若重来会重复已生成的正文，污染稿件；宁可中断提示，也不偷偷重复。

### 诚实边界（没做的 / 没验证的）
- **未加设置页 UI**：故障转移能力可用（env 配置），但没有图形开关。这是范围取舍，不是疏漏——已在 changelog 与代码注释明示。
- **未在真实 AI 服务上跑过失败重试**（沙箱无有效 Key / 不便触发 429）：重试/退避逻辑是代码层实现并经 tsc 验证，但"真实限流下自动恢复"未实跑。逻辑清晰、路径明确，建议作者用临时错误 Key 或限流账户自测一次。
- **故障转移链默认空**：不设 `LLM_FALLBACK` 时不转移，行为等同"纯重试"，完全向后兼容。

---

*下个单元：#197 BE-3 Token 用量成本看板。*

---

## v0.46.20 — AI 成本看板（BE-3）

### 一句话背景
写小说时每次让 AI 生成正文、润色、总结，都会消耗 token（可以粗略理解为"AI 读写的字数"），token 是要花钱的。但原来程序只用"中文字数 × 0.8"瞎估算 token，而且每次调用完就把真实数字扔了——作者根本不知道这个月 AI 帮自己写了多少、花了多少钱。这次把每次 AI 调用的真实 token 数和估算花费存进数据库，并在统计面板做个"成本看板"。

### ① 干了什么
- 新建一张 `LlmCallLog` 表，专门记每次 AI 调用的：时间、用了哪个模型、干什么用（写/审/总结等）、输入多少 token、输出多少 token、总共多少、估算花了多少美元、实际打给哪个地址、是不是"主模型挂了换备用模型"完成的。
- 在 AI 调用的"总闸门"`src/core/llm/client.ts` 里，每次调用成功拿到真实 token 数后，自动往这张表插一条记录（后台悄悄写，不拖慢生成）。因为所有生成/润色/总结/游戏/探讨都经过这个总闸门，所以一处接入、全站覆盖，不会漏。
- 内置一张"模型单价表"（`lib/llm.ts`），列了 DeepSeek、GPT、Claude、通义、智谱、Kimi 等 20 多种模型"每百万 token 多少钱"，按模型名自动匹配算钱。
- 统计面板（MonitorPanel）新增一个"AI 成本"卡片：这个月调了几次、总共多少 token、估算花了多少钱（人民币，按 7.2 汇率折算并显示美元）、从哪天开始记的，还列出每个模型花了多少。

### ② 为什么这么做（底层原理）
- **token = AI 的计费单位**：你可以把它想成"AI 读写的字数"，中文大概 1 个字 ≈ 0.8 个 token。AI 服务商按 token 收费，所以想知道花了多少钱，得先知道用了多少 token。
- **为什么以前是"估算"**：原来程序没存真实 token 数，只能用"全文字数 × 0.8"猜。这不准确（不同模型、不同提示词，真实 token 差别很大）。
- **为什么单点落库**：AI 调用分散在生成、润色、总结、游戏、探讨等几十个地方。如果在每个地方分别写库，容易漏、难维护。所以选在它们共同的"出入口"（client.ts）落库，一处管全部。
- **类比**：像公司报销——以前每笔打车费员工自己口头报个数（估算），财务月底一团乱；现在装了打车软件，每笔行程自动生成电子小票存进系统（落库），财务随时能拉出"本月各人打车费"报表（成本看板）。

### ③ 怎么做的（方法 + 效果）
1. **加表**：`prisma/schema.prisma` 新增 `LlmCallLog` model，字段如上；跑 `prisma generate` + `prisma db push` 把表建到本地 PostgreSQL。
2. **单价表**：`lib/llm.ts` 写 `MODEL_PRICING` 数组（每项含关键字、输入价、输出价、标签），`estimateCost(model, p, c)` 用 `model.toLowerCase().includes(关键字)` 匹配，算 `(p/1e6)*输入价 + (c/1e6)*输出价`。
3. **落库函数**：`recordLlmCall(input)` 用 `prisma.llmCallLog.create(...).catch(()=>{})` 后台写，**失败静默**（不影响主流程）。
4. **接入点**：`client.ts` 的 `chat` 成功返回前调 `recordLlmCall`；`chatStream` 给流读取器 `readStream` 加 `onUsage` 回调，流正常结束（出完字）时上报最终 token 数并落库。
5. **聚合接口**：`/api/stats/monitor` 用 `prisma.llmCallLog.aggregate` + `groupBy(model)` 算出本月总调用/总 token/总花费/按模型分布，返给前端。
6. **看板 UI**：MonitorPanel 加卡片渲染这些数据。

**效果数据**：
- tsc 类型检查零错误（TSC_EXIT=0）；
- `prisma db push` 建表成功；
- 零新增 npm 依赖；
- 提交 `1c4a0e0`，已推上 GitHub main。

### ④ 关键取舍（为什么选 A 不选 B）
- **选"全局聚合"而非"按项目聚合"**：AI 调用的"总闸门"是个通用工具函数，它不知道当前是在写哪个项目（项目 id 在更上层的路由里）。要做"按项目精确统计"得改调用链把项目 id 一路传下来，是大改动。诚实做法是先做成"全项目总花费"并明确标注"全项目"，不假装能做到 per-project。等以后真要 per-project 再说。
- **选"单点落库"而非"每处落库"**：覆盖全、维护一处；代价是落库时拿不到项目上下文（见上）。
- **选"fire-and-forget 静默落库"而非"await 落库"**：写数据库慢几毫秒不该拖慢 AI 生成体验；失败（如 DB 暂不可用）也不该让生成报错，所以后台写、出错就忽略。
- **选"内置单价表"而非"调供应商计费 API"**：本地工具、无网络依赖；单价表会随供应商调价失真，但已在 UI 标注"估算"，未知模型标"单价未知"。

### 诚实边界（没做的 / 没验证的）
- **只记 v0.46.20 起的调用**：这张表以前不存在，历史调用没数据。UI 在无数据时显示"暂无记录——自 2026-08-02 起累计"，**不伪装历史花费**。
- **单价是估算**：内置价格表可能过期/不准，且只覆盖常见模型；没匹配到的模型花费显示"单价未知"，不强行填 0 让人误以为免费。
- **没在真实 AI 调用下验证落库**（沙箱不便持续触发真实生成）：落库逻辑是代码层实现 + tsc 验证 + 表结构 `db push` 验证；建议作者本地生成一章后，看统计面板是否出现记录。
- **per-project 未做**：如上，标注"全项目"。

---

*下个单元：#198 BE-1 正文版本历史回滚。*

---

## v0.46.21 — 正文版本历史与一键回滚（BE-1）

> 这是一个"给写过的稿子留底"的功能。类比：你每改一版论文，Word 会自动帮你存一个旧版；万一 AI 把你写好的那段改坏了，你能一键找回之前的版本。

### ① 干了什么
给章节正文加了"版本历史"：每次 AI 生成/重写/润色覆盖正文之前，以及你在编辑器里手动保存之前，系统先把"被覆盖的那一版"全文存进数据库的一个专门表（`StoryNodeRevision`）。编辑器状态栏多了个「历史」按钮，点开能看到这个节点所有的历史版本列表，点任一个能预览当时写了什么，还能一键"回滚"回到那一版。

### ② 为什么这么做
写作者最怕的事就是"AI 把我写好的那段改没了"——此前正文只有一个字段，AI 一覆盖旧稿就永久消失，没有退路。有版本历史后，你才敢放心让 AI 大改。这属于"安全网"类功能：平时感觉不到，出事时能救命。

### ③ 方法 / 工具、效果
**思路**：抓住"正文被覆盖"的唯一发生点（后处理管线里的写库动作），在它前面插一道"拍照"动作，把旧内容存下来。这叫"单点接入、全站覆盖"——不用在每个按钮上都改一遍。

**具体步骤**：
1. **建表**：`schema.prisma` 加 `StoryNodeRevision`（节点 id、版本号、正文全文、字数、来源标签、时间），`prisma db push` 同步到本地 PG。
2. **拍照工具** `src/lib/versions.ts` 的 `snapshotRevision()`：把当前正文存一份；关键防呆——如果这一版和最近一次快照**内容完全一样就跳过**（避免微调/频繁保存刷屏出几百个重复版本），空正文不存，存库失败也静默忽略（绝不能因为存版本失败而让正文生成报错）。
3. **接入点**：`post-processor.ts` 在真正写库覆盖前调一次拍照（AI 写/重写/润色都走这）；编辑器手动保存的 `PUT /api/story/nodes/[id]` 写前也拍一次。
4. **三个 API**：列出版本、看某一版内容、回滚到某一版。
5. **回滚可逆**：回滚时先把"现在的正文"自动存为一条"回滚快照"再覆盖，所以你回滚错了还能再回滚回来，不会越滚越乱。

**效果数据**：tsc 零错误（TSC_EXIT=0）；`prisma db push` 建表成功；零新依赖；提交 `869eefb` 推上 main。

### ④ 关键取舍
- **选"写前拍照"而非"写后对比"**：在覆盖动作发生之前就抓旧内容最稳妥，覆盖后再想拿旧版就拿不到了。
- **选"内容去重"而非"每次都存"**：否则手动保存/AI 微调会刷出海量相同版本，列表没法看。去重用"和最近一版比内容"最省事。
- **选"回滚前先备份当前正文"而非"直接覆盖"**：保证回滚本身可逆，这是防呆设计——用户误操作也有后悔药。
- **选"单点接入"而非"每个按钮都改"**：覆盖正文的逻辑只有一条管线（后处理），在那一处插拍照就覆盖所有 AI 写；手动保存是另一条独立的 PUT，单独补一处即可。

### 诚实边界（没做的 / 没验证的）
- **只有 v0.46.21 之后才有历史**：这张表以前没有，更早写的正文没有快照，无法穿越回以前。不假装"自古以来都有版本"。
- **没在真机跑过"生成→回滚"完整手感**（沙箱无 GUI 浏览器）：逻辑经 tsc 验证 + API 路由代码层实现 + 表结构 `db push` 验证；建议作者本地生成一章、点历史、回滚实测一次。
- **版本不自动清理**：目前版本只增不删（属于安全网，丢比占空间更糟）；海量版本下的存储膨胀问题未做（如需可后续加"保留最近 N 版"策略）。

---

*下个单元：#199 BE-2 软删除回收站。*

---

## v0.46.22 — 软删除 + 回收站（BE-2）

> 给项目删除加个"后悔药"。类比：电脑删除文件不是真删，是先丢进回收站，清空回收站才是真删。这里项目删除也一样——先进回收站，随时能捞回来。

### ① 干了什么
项目删除不再"物理抹掉"。给 Project 表加了个 `deletedAt` 标记：点删除时只打个"已删除"时间戳（软删除），项目从主页列表消失但数据原封不动留在库里。新增一个「回收站」页面，里面列出所有被删的项目，可以一键"恢复"（去掉标记，回到主页），也可以"彻底删除"（真删，连章节/角色/世界书一起清）。

### ② 为什么这么做
项目里所有子表（章节、角色、世界书）都是"父删子跟着删"。此前删除项目等于把整本书连底稿一起物理销毁，手滑一下就没了。本地工具没有云端回收站兜底，所以自己补一个回收站最实在——误删能救，敢放心删。

### ③ 方法 / 工具、效果
**思路**：数据库里"删除"有两种——真删（DELETE）和假删（打个删除标记，查询时过滤掉）。改成假删，数据还在，只是看不见。

**具体步骤**：
1. **加标记**：`schema.prisma` 的 Project 加 `deletedAt`（空=正常，有值=已删）。
2. **列表过滤**：`GET /api/projects` 加 `where: { deletedAt: null }`，主页和所有取列表的地方自动只显示没删的。
3. **删除改软删**：`DELETE /api/projects/[id]` 从 `prisma.project.delete` 改成 `prisma.project.update({ data: { deletedAt: now } })`。子表还是 `onDelete: Cascade`，但只有真删时才级联，所以软删时子表数据不丢、只是跟着项目一起被列表过滤隐藏。
4. **三个新接口**：`GET /recycle` 列已删项目、`POST /restore` 恢复、`POST /purge` 真删（级联清子表）。
5. **回收站页面**：`/recycle` 列出已删项目（带删除时间、角色/词条/节点数），一个"恢复"一个"彻底删除"（带二次确认）。

**效果数据**：tsc 零错误（TSC_EXIT=0）；`prisma db push` 加字段成功；零新依赖；提交 `10c7a80` 推上 main。

### ④ 关键取舍
- **选"软删除"而非"直接真删"**：数据无价，删错难挽回；假删几乎零成本却能把"不可恢复"变成"可恢复"。
- **选"列表过滤"而非"改所有查询"**：只在项目列表入口 `GET /api/projects` 一处加 `deletedAt: null`，所有引用列表的地方自动受益（单项目 `GET /[id]` 不拦，直接 URL 进旧项目仍可用，符合预期）。
- **选"显式彻底删除按钮"而非"自动过期"**：本地工具不必急着清理空间，自动清理反而可能误删真数据；彻底删除做成明确按钮 + 二次确认，非默认路径。
- **子表不单独软删**：保持 `onDelete: Cascade`，恢复项目时子表自然跟着回来（因为软删时它们根本没被真删）。

### 诚实边界（没做的 / 没验证的）
- **没做"保留 N 天自动清理"**：计划里提了"保留 N 天"，但本地工具无需紧迫清理，且自动清理有风险，故只做"手动彻底删除"。如需要可后续加定时任务。
- **没在真机点过"删除→回收站→恢复/彻底删除"完整链路**（沙箱无 GUI）：逻辑经 tsc + 路由代码层 + 字段 `db push` 验证；建议作者删个项目、去回收站试恢复和彻底删除各一次。
- **跨项目引用**：示例项目播种、备份导入等不涉及已删项目过滤，未逐一排查（删除场景仅从主页触发，已覆盖）。

---

*下个单元：#200 FE-N1 全局命令面板 Cmd/Ctrl+K。*

---

## v0.46.23 — 全局命令面板 Cmd/Ctrl+K（FE-N1）

> 给工具加个"任意门"。类比：Obsidian / 飞书里的 Cmd+K，按一下弹出搜索框，敲几个字就能跳到任何地方，不用在侧边栏里一层层翻。

### ① 干了什么
任意页面按 Cmd/Ctrl+K（或点仪表盘顶栏的「搜索 ⌘K」）弹出一个命令面板：输入即搜当前项目的章节标题、角色名、世界书词条、规则名，回车直接跳过去——章节跳过去并自动选中，角色/世界书直接打开编辑弹窗。面板里还内置一批"动作"：新建章节、打开设置、去探讨/拆书/创意工坊/回收站、回主页。项目一大（上百章）时不用再滚轮翻树。

### ② 为什么这么做
此前全站没有任何全局搜索，找一章、找一个角色只能手动在左侧树里翻。这是专业写作工具的标配能力，一上就显得"专业"，也真能省时间。计划明确说检索可以先用前端内存索引，不必上 ES（全文搜索引擎）。

### ③ 方法 / 工具、效果
**思路**：不需要后端搜索引擎。当前项目的数据（章节/角色/世界书/规则）本来就可以通过一个接口一次性拿到，在浏览器内存里建个列表，输入时用字符串包含匹配过滤就行。

**具体步骤**：
1. **全局挂载**：在根 `layout.tsx` 里挂一个 `<CommandPalette />` 客户端组件，任何页面都在。
2. **快捷键**：组件里监听全局 `keydown`，`Cmd/Ctrl+K` 切换开关；仪表盘按钮通过派发自定义事件 `nf-open-command-palette` 也能打开（移动端点按同效）。
3. **取数**：从 `usePathname` 正则解析出当前 `projectId`，打开面板时调 `GET /api/projects/[id]` 拿到 nodes/characters/lore/rules（详情接口为此补了 `rules: true`），在内存里拼成可搜列表。
4. **跳转定位**：章节结果回车跳 `/workspace/[id]?node=节点ID`；workspace 页加了 `useSearchParams` 效果应 `?node` 自动选中该章，同理 `?editCharacter`/`?editLore` 打开对应编辑弹窗、`?tab` 切左栏页签。为避免 Next 静态预渲染对 `useSearchParams` 的 Suspense 报错，workspace 页加了 `export const dynamic = "force-dynamic"`。
5. **交互**：输入即筛、↑↓ 选择、Enter 跳转、Esc 关闭；无项目时面板自动只显示全局动作。

**效果数据**：tsc 零错误（TSC_EXIT=0）；零新依赖；提交 `9b6428b` 推上 main。

### ④ 关键取舍
- **选"前端内存索引"而非"上 ES"**：计划本就定为中量级；项目内数据量小，打开时拉一次全量建索引足够快且零运维，没必要引入搜索引擎服务（也违背"本地、无网络依赖"定位）。
- **选"挂在根 layout"而非"各页各自加"**：一处挂载全站可用，避免每个页面重复接逻辑。
- **选"URL query 参数跳转"而非"全局状态"**：让 workspace 通过 `?node` 接收跳转，刷新/分享链接也能定位；比在组件间传全局状态更稳、可书签化。
- **选"详情接口补 rules"而非"单独查规则"**：一次请求拿全，面板代码简单；`rules` 数据量小，不影响详情接口性能。

### 诚实边界（没做的 / 没验证的）
- **仅项目内搜索**：面板只在进入某项目后搜该项目内容；没做"跨项目全局搜"（那需要服务端聚合接口，超出本次中量级范围）。
- **没在真机按 Cmd+K 实测**（沙箱无 GUI）：逻辑经 tsc + 路由/组件代码层验证；建议作者进项目按 ⌘K 搜一个章节名、回车确认是否跳过去并选中。
- **检索是"包含匹配"非"分词/拼音"**：中文按子串匹配，够用但不支持拼音首字母等高级检索。

---

*下个单元：#201 FE-N2 项目备份包 .nfproject。*

---

## v0.46.24 — 项目备份包 .nfproject（FE-N2）

> 给整本书做一个"存档文件"。类比：你玩游戏的存档不是几十个散文件，而是一个 `.sav` 文件，拷走就能在别的电脑接着玩。这里把"一本书"（含所有章节、角色、世界书、规则）打包成一个 `.nfproject` 文件，方便带走或发给朋友。

### ① 干了什么
- 新增"备份包"能力：点一下把当前项目所有数据导出成一个 `.nfproject` 文件（本质是一个带版本标记 `format:"nfproject"` 的 JSON）；点"导入备份"选这个文件，能把它变成一个全新的项目（不覆盖现有项目）。
- 导出/导入都走后端 API：导出 `GET /api/projects/[id]/backup` 一次性把项目全量拉出来；导入 `POST /api/projects/import` 收下文件、清空旧 id、建新项目，并把章节之间的父子关系、分支引用、世界书交叉引用重新连好。

### ② 为什么这么做（底层原理）
- **"备份包" = 把一整棵数据树序列化成一个文件**：项目是树根，下面挂角色、世界书、章节等。打包成单个文件才好带走、好分享。
- **"id 重映射" = 搬家用新门牌号**：每个数据在数据库里有唯一编号。导出文件带着旧编号，直接塞回库会和现有数据撞号、或父子关系指向错对象。导入时"忘掉旧编号、全重新发号"，并把"谁是谁的孩子"按新号接上。类比：搬家时家具贴旧家门牌号，进新家全换新房牌号，还要保证"餐桌的椅子"指向新餐桌。

### ③ 怎么做的（方法 + 效果）
1. 导出 API：`Prisma.ProjectInclude` 一次性 include 所有子表，返回 JSON 加 `format:"nfproject"`；前端 Blob 下载成 `.nfproject`。
2. 导入 API：校验 `format`；建 `branchMap`/`nodeMap`/`loreMap` 把旧 id 映射成新 id；建完新项目后用 map 翻译各节点的 `parentId`/`branchId`/`relatedEntryIds`；项目名加「（导入）」防重名。
3. UI：Toolbar 加「备份包」按钮触发下载；首页加隐藏 file input + 「导入备份」按钮，选完 POST 给导入 API，成功跳进新项目。

**效果数据**：tsc 零错误（TSC_EXIT=0）；零新增依赖；提交 `c2a8f38` 推上 main。
**踩坑**：导出 include 写成 `as const` 让 orderBy 变只读元组（Prisma 类型不接受）→ 改 `const INCLUDE: Prisma.ProjectInclude`；首页导入事件写成 `React.ChangeEvent` 但没引入 `React` 命名空间 → 改 `import { ... type ChangeEvent }`。

### ④ 关键取舍
- **选"JSON 不套 zip"**：数据全是文本，JSON 可读可改、零依赖；套 zip 要引压缩库且备份文件不可肉眼检查。
- **选"导入为新项目"而非"覆盖导入"**：覆盖会直接抹掉现有数据，风险高；做成独立新项目最安全，可对比后删旧的。

### 诚实边界（没做的 / 没验证的）
- 未在浏览器实跑"导出→换电脑→导入"完整链路（沙箱无 GUI）；验证为 tsc 零错误 + 路由代码层 + 重映射逻辑审查。建议作者本地导出一个项目、再导入确认成独立新项目。
- 未做"附件/图片"打包：本项目数据模型纯文本/JSON，无二进制附件，JSON 即完整备份（如未来加封面图需补）。

---

*下个单元：#203 FE-8 状态管理收口 zustand。*

---

## v0.46.25 — 状态管理收口 zustand（FE-8）

> 让"当前项目数据"只有一个真相来源。类比：公司通讯录只存 HR 系统一份，所有人查 HR 系统，不会出现"销售记得的电话和行政记得的不一样"。这里把页面里散落两处的项目数据收拢到全局仓库，子组件自己从仓库取，不再层层传。

### ① 干了什么
- 把 zustand store（`useProjectStore`）升级为"当前项目数据的唯一真相源"：项目全量 + 规则 + 一系列原子更新方法（setProjectData / patchProject / updateNode / upsertCharacter 等）。
- workspace 页面去掉本地 `useState` 的 project，改为从 store 读；loadProject 拉到数据后写进 store 而非本地 state。
- 左栏/右栏组件去掉 `project` 这个大 prop，函数里直接 `const project = useProjectStore((s) => s.project)` 自己取；没有项目时返回 null 不渲染。

### ② 为什么这么做
- **"双源"= 同一份数据在两地存**：改了一处忘改另一处，界面就显示旧数据（陈旧 bug）。仓库成唯一源后，所有读取从一处拿，改一处处处更新。
- **"prop 透传"= 数据一层层当参数往下传**：项目对象被透传到左栏右栏，是"巨型组件"前兆。让子组件自己从仓库取，顶层不背包袱。类比：部门查公司资料自己去档案室拿，不用老板挨个发纸质复印件。

### ③ 怎么做的（方法 + 效果）
1. 重构 `store/index.ts`：ProjectState 只留必要字段与方法，类型对齐页面实际使用的 `ProjectData` 等。
2. page.tsx：`useState(project)` → store 读取；`setProject(data)` → `useProjectStore.getState().setProjectData(data)`；配置保存回调改 `patchProject(...)`（局部更新）。
3. LeftPanel/RightPanel：删 `project` 接口字段、函数首行从 store 取 `if (!project) return null`。

**效果数据**：tsc 零错误（TSC_EXIT=0）；零新增依赖；提交 `0eb99f1` 推上 main。
**踩坑**：`patchProject` 收 ProjectConfigPanel 含 `llmConfig` 等 ProjectData 未穷举字段 → 参数类型放宽为 `Record<string, any>`；`WriterState.currentNode` 误引已弃用 `StoryNode` 类型 → 改 `StoryNodeData`。

### ④ 关键取舍
- **选"store 唯一源 + 去数据 prop"而非"完整重构 1013 行巨型组件"**：计划原把 FE-8 排在 ARCH-6 测试护栏之后，但 ARCH-6 不在本次 ⭐ 清单、本冲刺也没建测试护栏。完整重构"牵一发动全身"风险高。选真实可工作、有边界的收口：数据单源 + 实体数据不再透传，但动作回调（onSave 类）仍透传（动作非数据、无陈旧问题）。

### 诚实边界
- **未做 30-prop 100% 清零**：动作回调透传仍保留（非数据、无陈旧问题；全量重构需配套测试护栏，本冲刺未建）。不伪装"全清零"。
- 未在浏览器实跑交互（沙箱无 GUI）；验证为 tsc 零错误 + 单源接管逻辑审查 + 侦察确认 store 无其他消费者、page 有 `!project` 守卫。

---

*下个单元：#202 FE-9 服务端状态层 React Query。*

---

## v0.46.26 — 轻量服务端状态层（FE-9，自研 useApi 零依赖）

> 自己写一个"迷你 React Query"管"服务端数据缓存 + 失效"。类比：外卖 App 的"我的订单"——你刚取消一单，列表不会自动变；要么手动下拉刷新，要么 App 在你操作后悄悄标"订单列表过期，下次进重新拉"。这里用几十行零依赖代码实现同样的事。

### ① 干了什么
- 自写 `useApi` 工具（`src/hooks/useApi.ts`）：`useQuery(key, fetcher, opts)` 按"键"取数据、命中缓存不重复发请求；`invalidateQuery(key)`/`invalidateQueries(前缀)` 主动让某键缓存失效、下次用重新拉；内置"新鲜度"机制（staleTime 默认 30 秒）。
- 仪表盘改用 `useQuery("projects:list", ...)` 拿项目列表，删掉原来一堆 useState + useEffect。
- workspace 保存/导入后调 `refreshAfterMutate`（刷新当前项目 + `invalidateQueries("projects")`），让仪表盘回到新鲜。

### ② 为什么这么做
- **"服务端状态"= 存在服务器、前端要拉来显示、还可能被你改的数据**：容易出"我改了但界面没刷新"的 bug。需要"拉过先存着（缓存），改了就标过期（失效）"的机制。
- **为什么自研而非引 React Query**：React Query 功能强但体积大、API 复杂；本项目只是本地写作工具，只要"缓存 + 失效"两个核心能力，几十行就够，零新依赖、契合"轻量本地工具"定位。类比：只想称个体重，买体重秤就行，不必搬台医用体检仪回家。

### ③ 怎么做的（方法 + 效果）
1. `useApi.ts`：进程内 `Map<key,{data,ts}>` 存缓存；`Map<key,Set<listener>>` 存订阅；`useQuery` 挂载订阅、命中且未过期直接用缓存跳过 fetch；`invalidateQuery` 删缓存并通知订阅者重拉。
2. 仪表盘 `page.tsx`：删旧 useState+useEffect，换 `useQuery<ProjectSummary[]>("projects:list", 拉列表)`，派生 `projects = data ?? []`。
3. workspace 联动：CharacterEditDialog/LorebookEditDialog/ImportWizard 等保存/导入回调改接 `refreshAfterMutate`（= loadProject + invalidateQueries("projects")）。

**效果数据**：tsc 零错误（TSC_EXIT=0）；零新增依赖；提交 `b512050` 推上 main。

### ④ 关键取舍
- **选"自研零依赖"而非"引 React Query/SWR"**：本地工具要轻；两个核心能力几十行即可，引大库是过度设计。
- **选"仪表盘试点 + 渐进迁移"而非"一次性改 70+ 端点"**：计划原文"先试点再逐步迁移"。盲目全改风险高；先落原语和试点、跑通，后续按需迁移。

### 诚实边界
- **未一次性迁移全站 70+ 个 fetch 端点**：仅仪表盘试点 + store 联动失效；`useApi` 已就绪，后续可渐进迁移。不伪装"全站已用"。
- 未在浏览器实跑缓存命中/staleTime 行为（沙箱无 GUI）；验证为 tsc 零错误 + 缓存/订阅机制代码审查。

---

## v0.46.27 — 空态统一（FE-4/BUG-9）+ 导入向导批量删除二次确认（BUG-13）

> 把"页面空了显示什么"这件事统一成一套；再给导入向导里"一键清空未确认"这种危险操作加一道确认闸。类比：公司所有空会议室门口都贴同一种"可预订"告示牌（统一空态），而不是有的贴 A4 有的贴手写条；同时给"一键清空会议室预订"按钮加个"确定吗？"弹窗。

### ① 干了什么
- 删除冗余的 `src/components/ui/EmptyState.tsx`（旧版用 `hint` 文案字段、无 `className`、视觉偏小），全站只保留 `States.tsx` 里的 `EmptyState`（用 `description` 字段 + 支持 `className`，视觉是带"创意色"圆角徽章的大卡片）。
- 把 `CharacterList`/`StorylineList`/`RulesPanel`/`WorldEntryList` 4 处的 import 从 `EmptyState.tsx` 改到 `States.tsx`，并把传参 `hint=` 全部改成 `description=`（字段重命名，语义不变）。
- `ImportWizard` 的"一键删除未确认"（`handleRemoveAllUnconfirmed`）在真正清空前先弹 `confirmDialog({ danger: true })`，用户确认才执行。

### ② 为什么这么做
- **"空状态"= 列表没数据时给用户的占位提示**：原本两套实现字段名不同（`hint` vs `description`）、大小不一，同一个 `RulesPanel` 还同时 import 了两个——属于典型的"复制粘贴漂移"，改一处另一处不跟着变。统一后新人首次进空白页看到的引导是一致的专业样式。
- **"批量危险操作必须二次确认"**：导入向导"一键删除未确认"会丢掉全部尚未写入数据库的章节/角色/词条，且清空前无任何确认，误点即损失。补 `confirmDialog` 是和全站其他删除路径（`useConfirmDelete`）一致的最低成本防护。

### ③ 怎么做的（方法 + 效果）
1. `git rm src/components/ui/EmptyState.tsx` 删除旧组件；grep 确认全仓只剩 `States.tsx` 的导出 `EmptyState`。
2. 4 处引用改 import + `hint`→`description`；`RulesPanel` 顺手把原来两行 import（`EmptyState` 来自旧文件、`Loading` 来自 States）合并成一行 `import { EmptyState, Loading } from "@/components/ui/States"`。
3. `ImportWizard`：`import { confirmDialog } from "@/components/ui/toast"`，`handleRemoveAllUnconfirmed` 改为 `async`，先用 `await confirmDialog(...)` 拿到 `ok` 再清空；按钮 `onClick` 直接传函数即可（返回 Promise 不影响）。
4. `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → `TSC_EXIT=0`，零错误。

**效果数据**：tsc 零错误；双 changelog 同步（`src/lib/changelog-data.ts` + 根 `CHANGELOG.md`）；提交 `9f1fea4` 推上 main；`OPTIMIZATION_PLAN.md` 标记 FE-4/BUG-9/BUG-13 已完成。

### ④ 关键取舍
- **删文件而非保留兼容别名**：旧 `EmptyState.tsx` 仅 4 处引用、字段可零损转换，直接删除 + 改引用比"留壳转发"更干净，且无新依赖。
- **只给"批量清空"加确认，不给每条"移除 x"加确认**：单条 x 只是从本地预览列表移除、未落库、可逆，逐条弹确认反而烦；批量清空是"全部丢失"才需闸。

### 诚实边界
- **BUG-1（角色删除无确认）经核查已自然解决**：`CharacterList` 在 FE-8 重构里已用 `useConfirmDelete` 包裹删除——`onDelete` 内联 fetch 只是被 hook 当 `deleteFn` 调用，确认弹窗 + loading 态由 hook 提供。故本单元不重复修，仅做现状确认，不伪造成"新修"。
- 未在浏览器实跑空态视觉与确认弹窗交互（沙箱无 GUI）；验证为 tsc 零错误 + 引用全量 grep 复核 + 确认弹窗机制代码审查（与全站 `useConfirmDelete` 同源）。

---

## v0.46.28 — 后端健壮性：连接池上限（BE-6）+ LLM 超时统一（BE-8）

> 给数据库连线和 AI 请求各加一道"护栏"。类比：数据库连接像电话线，不设上限会同时拨太多占满交换机（报 `P2024`）；AI 请求像外卖下单，原来有的地方等 3 分钟有的地方等 5 分钟，统一成"最长等 5 分钟"更省心。

### ① 干了什么
- `src/lib/prisma.ts`：给 `PrismaPg` 适配器显式传入 `pg.PoolConfig`——`max`（默认 10，可用 `PRISMA_POOL_MAX` 调大）+ `idleTimeoutMillis: 30000` + `allowExitOnIdle`，并发流式请求下避免连接耗尽。
- `src/core/llm/client.ts`：抽出 `export const LLM_REQUEST_TIMEOUT_MS = 300_000`，替换散落在 `chat`/`chatStream` 的两处 `AbortSignal.timeout(180_000/300_000)`，所有 LLM 请求共用同一超时。
- BE-7 / BE-8 删除端点：经读码诚实处理，未做破坏性改动（见边界）。

### ② 为什么
- **连接池上限 = 给数据库"同时能接几路电话"设个顶**：PrismaPg 底层是 pg 连接池，不设上限理论上可无限开连接；高并发（多个长流式导入/扩展同时跑）会把连接占满，Postgres 报 `P2024`。显式 `max` 把并发连线控制在可控范围，配合 `idleTimeoutMillis` 让闲连接及时回收。
- **超时统一 = 一个地方管"等多久"**：原来两处超时数值不一致（180s/300s），排查"为什么这个请求卡那么久"要翻两处；抽成常量后改一处全生效。

### ③ 怎么做的（方法 + 效果）
1. `prisma.ts`：`new PrismaPg({ connectionString, max, idleTimeoutMillis, allowExitOnIdle })`——`PrismaPg` 第一个参数接受 `pg.PoolConfig`，`max` 是该配置的标准字段。
2. `client.ts`：模块顶部加 `LLM_REQUEST_TIMEOUT_MS` 常量，两处 `AbortSignal.timeout(...)` 改引用它。
3. `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → `TSC_EXIT=0`。

**效果数据**：tsc 零错误；双 changelog 同步；提交 `68bde97` 推上 main。

### ④ 关键取舍
- **只做连接池上限，不盲包"全端点事务"**：计划原还要给多步写端点包 `$transaction`；但 `expand`/`import/commit` 都是 SSE 长流式（最长 300s），整段包事务会长时间持连接/锁，更易出问题；逐批事务需精细设计、风险高，本单元不盲包，诚实标注延后。
- **超时统一取 300s（更宽松）**：原 180s 处放宽到 300s 只放松不收紧，无副作用。

### 诚实边界
- **BE-7 复核无明确收益**：读 `characters/expand`——预处理（拆卡/合并/删非角色）是必要逐行顺序写，无"循环内 findMany"的 DB N+1；`stats/monitor` 已用 `select` 只取字段 + `Promise.all` 并行 + DB `aggregate/groupBy` 算 LLM 成本，剩余 JS 归约是对单次 `findMany` 结果的 O(n) 单遍、`dailyWords` 按天聚合本需逐行 `updatedAt`。改成多个 `count/aggregate` 反而增 DB 往返、且按天分组需脆弱原生 SQL——故未改。
- **BE-8「删除 deprecated」与 U5 冲突**：U5 已刻意决定"10 个死路由不删代码、保留给脚本/SDK"；本单元若删会违背该决策且可能误伤潜在脚本。故只做"超时统一"，删除不执行。`maxDuration` 按操作差异（单聊 60s / 整书导入 300s）属合理，不强制统一。
- 未在浏览器/真实高并发压测（沙箱无 GUI）；验证为 tsc 零错误 + 读码确认 `PrismaPg` 接受 `pg.PoolConfig`（`max` 为合法字段）。

---

## v0.46.29 — 统一 API 错误响应（ARCH-2）：全站路由 catch 收敛到 jsonError

> 给所有后端的"出错返回"立一个统一格式。类比：原来每家分公司（路由）出错时自己写纸条（有的写"出错"、有的写"error:xxx"、有的还带编号），总部（前端）看不懂；现在规定所有分公司出错都填同一张标准表 `{error, code?, hint?}`，总部一眼就懂、还能照 hint 给用户中文排障建议。

### ① 干了什么
- 全站 96 个 API 路由中，约 90 个原本在 catch 里手写 `return NextResponse.json({ error: ... }, { status: 500 })` 的，统一改成 `return jsonError(e);`，错误体收敛为 `{ error, code?, hint? }`。
- 两套 `jsonError` 收口：`@/lib/api-error` 的 `jsonError(e: unknown)` 走 `classifyError` 把 Prisma 错误码（P1000/P1001/P2021/P2024/P2002 等）、网络错误、默认错误分类，并带上中文 `hint` 排障建议，成为路由异常错误的默认通道；`@/lib/api` 的 `jsonError(message, status, code?)` 保留给 3 个需要**精确 4xx 状态码**（404/400）的历史路由（presets/[id]、seed/presets、projects/[id]/config）。
- 修复 `presets/import` 的 tsc 类型错误：该路由 catch 被写成 `jsonError(e)`（e 是 unknown），但 import 来自 `@/lib/api`（签名 `jsonError(message: string)`），类型不匹配；把 import 源改到 `@/lib/api-error` 一并解决。
- 8 个 SSE 流式路由（characters/classify、characters/expand、import/commit、import/parse、import/quick、lorebook/expand、lorebook/import、lorebook/summarize）按设计走 `send({ type: "error" })`，不套 jsonError（流式没有一次性 HTTP 响应体可返回）；`/api/settings/test` 保留 `{ ok: false, error }` 业务契约（前端 `setTestResult` 依赖 `ok` 字段）但 catch 内错误文本改用统一 `classifyError(err).error`；`/api/tools/execute` 为 `@deprecated` 且契约为 `{ success, data, error, toolName }`，保留原结构不强行套 jsonError。

### ② 为什么
- **统一错误格式 = 给所有"出错纸条"一个固定模板**：原来 88 个路由只有 29 个用 `jsonError`，剩下 59 个手写返回，结构五花八门。前端 Toast 想稳定显示"中文排障建议"时，有的响应有 `hint`、有的只有裸字符串，处理起来要写一堆特例。统一后前端只要读 `error` 字段，必要时读 `hint` 给用户具体建议（如"数据库连接失败，请检查 PostgreSQL"），不用再猜每个接口返回长什么样。
- **保留两套 jsonError 不是重复，是职责分开**：`@/lib/api-error` 接收"异常对象"（unknown）自动分类，适合 catch 里"出了意外"的场景；`@/lib/api` 接收"我主动知道的错误信息和状态码"（如"预设不存在"→404），适合业务逻辑里精确返回 4xx。硬把它们合并会丢失 404/400 的精确语义。

### ③ 怎么做的（方法 + 效果）
1. **机械替换**：用 Python 脚本扫所有 `src/app/api/**/route.ts`，把 catch 块里的 `return NextResponse.json({ error: ... }, { status: 500 })` 正则匹配替换为 `return jsonError(<var>);`，并自动补/去重 `@/lib/api-error` 的 import。
2. **类型收口**：替换后跑 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`，逐轮修复脚本引入的 4 类问题（尾逗号漏配、跨块吞并、误判已导入、重复 import），最终 `TSC_EXIT=0`。
3. **覆盖率验证**：写一次性脚本统计——96 个路由中 84 个从 `@/lib/api-error` 导入 jsonError、3 个从 `@/lib/api` 保留（精确 4xx）、8 个 SSE 流式为 `send(error)` 排除、1 个 `tools/execute` 保留 `@deprecated` 契约；对有 catch 但没用 jsonError 的 6 个文件逐一提取 catch 块判定，确认其中 3 个（settings/models、settings/test、presets/import）已收口、3 个（dissect/to-project、game/action、health）的 catch 不返回 5xx 无需改。
4. **升版 + 双 changelog**：`src/lib/changelog-data.ts` 插 VERSIONS 头条 + 改 LATEST_VERSION=v0.46.29 + CHANGELOG_BRIEF 4 条，同步根 `CHANGELOG.md`，同 commit 推 main（`1008289`）。

**效果数据**：tsc 零错误；零新依赖；59 文件改动（153 增 / 198 删，净减 45 行，因统一后更短）；jsonError 覆盖率 29/88 → 实质 100%（除 SSE 与业务结果契约外）。

### ④ 关键取舍
- **不强行把 settings/test / tools/execute 套 jsonError**：前者前端靠 `ok` 字段判断成败、后者靠 `success/data` 契约，硬改会破坏前端解析；改为保留业务字段、仅用统一 `classifyError` 提取错误文本（settings/test），或完全保留（tools/execute）。这是"统一格式"与"不破坏现有契约"之间的诚实权衡。
- **SSE 流式不套 jsonError**：流式响应是一个个事件推送，没有"一次性 HTTP JSON 响应体"，套 jsonError 无意义；按设计走 `send({type:"error"})`，前端流式客户端照常处理。

### 诚实边界
- 未写自动化测试验证每个路由返回体字段（沙箱无 GUI + 无 ARCH-6 测试护栏）；验证为 tsc 零错误 + 覆盖率脚本统计 + 逐一 catch 块代码审查。若后续建 ARCH-6 测试护栏，可加一个"所有非 SSE 路由 catch 必须返回 `{error, code?, hint?}`"的断言。
- `classifyError` 对普通 `Error` 默认返回 500 + 通用 `error`；对已知 Prisma 码/网络错误才带 `hint`。未扩展新的错误分类（如业务域错误），保持最小改动。

---

---

## v0.46.30 — 幂等 seed 脚本（ARCH-5，#212 落地）

### 一句话背景
初始化示范数据（16 个内置预设）原本只能靠"先起网站、再打 HTTP 端点"来播种——新机器 clone 后起库、或 CI 自动初始化，都得先起服务再发请求，又慢又脆。这次把播种逻辑写成能直接跑的脚本 `prisma/seed.ts`，像"一键装机脚本"：跑一遍把内置预设塞进数据库，再跑一遍也不会重复塞。

### ① 干了什么
- 新建 `prisma/seed.ts`：遍历 16 个内置预设，按 `{type, title, isBuiltin}` 查重，已存在就跳过、不存在才 `create`（tags 自动补 `"trirui推荐"`、author=`trirui`、isPublic=true），跑完打印「新增 X / 跳过 Y / 共 16」；`prisma.$disconnect()` 兜底。
- 把 16 个内置预设的"数据源"从播种路由 `src/app/api/seed/presets/route.ts` 里抽到**单一文件** `src/lib/builtin-presets.ts`，路由与 seed 脚本都从这里 import——不再有两份重复的预设数组。
- `package.json` 加 `"db:seed": "prisma db seed"`；`prisma.config.ts` 的 `migrations.seed` 设为 `"tsx prisma/seed.ts"`（Prisma 7 读这里，不读 package.json 的 `prisma.seed`）；加 `tsx` 仅作 devDep。
- 删掉 `package.json` 里对 Prisma 7 无效的 `"prisma": { "seed": ... }` 块。

### ② 为什么这么做（底层原理）
- **"初始化"不该依赖"先起服务"**：HTTP 播种端点适合"人在浏览器点一下"，但不适合"clone 完自动建库"——不能要求 CI 先 `npm run dev` 再 `curl`。脚本把"播种"变成一条命令，可重复、可编程。
- **"单一数据源"防漂移**：预设数组原本硬编码在播种路由里，seed 脚本若另写一份，两处迟早不一致（加一个预设要改两个地方）。抽到 `builtin-presets.ts` 后，路由和脚本都是同一份，改一处全生效。
- **类比**：`builtin-presets.ts` 像一份"标准菜谱"，`seed/presets` 路由和 `prisma/seed.ts` 是两个不同的"厨师"，都照同一份菜谱做菜，不会一个放盐一个不放。

### ③ 怎么做的（方法 + 效果）
1. **抽数据源**：用受控 Python 脚本把 `route.ts` 里 `const BUILTINS: any[] = [...]`（约 16–386 行）整块搬进新文件 `src/lib/builtin-presets.ts`，导出 `BUILTINS`，并在 `route.ts` 顶部加 `import { BUILTINS } from "@/lib/builtin-presets"`（相对路径 import 避开 `@/` 别名问题）；`stage-play.json` 改为从 `builtin-presets.ts` 相对 `../app/api/seed/presets/stage-play.json` import。
2. **写 seed 脚本**：`tsx prisma/seed.ts`，用 `PrismaPg` 适配器连接（走 `.env` 的 `DATABASE_URL`），`findFirst` 查重 + `create`，打印计数；`process.exit(1)` on failure、`finally` 中断开连接。
3. **配置对齐 Prisma 7**：实测 `package.json` 的 `prisma.seed` 在 v7 报 "add a seed property to migrations section"——确认 v7 改读 `prisma.config.ts` 的 `migrations.seed`，遂迁移；删无效块。
4. **实跑验证幂等**：`npm run db:seed` 连跑两次，均输出「新增 0 个，已存在跳过 16 个，共 16 个」，`EXIT=0`——证明重复跑不会重复插入。

**效果数据**：
- tsc 零错误（TSC_EXIT=0）；`tsx` 仅 devDep、零新运行时依赖。
- 提交 `245ff19`（10 files，1033 ins / 379 del），代理 push 成功 `1008289..245ff19 origin/main ✅`。

### ④ 关键取舍
- **不删 HTTP 播种端点**：`/api/seed/*` 仍保留给"网站内首次打开自动播种"的前端兜底路径（workshop 页 `autoSeedRef` 调用），seed 脚本是"命令行/CI 同款逻辑"的补充而非替代，二者共用 `builtin-presets.ts` 单一数据源。
- **Prisma 7 配置位置迁移**：不加"兼容两版"的胶水代码，直接按 v7 规范放 `prisma.config.ts`，删掉 v6 风格的 `package.json.prisma.seed`——诚实面向当前实际版本。

### 诚实边界
- 种子幂等依赖"DB 已存在早期 HTTP 播种的 16 预设"——实测两次都"跳过 16"正是因为 DB 已有；若换一台全新空库，首次跑会是"新增 16"，逻辑同样成立（已用代码审查确认 create 分支正确）。
- 未做"首次启动自动跑 seed"的 hook（如把 seed 串进 `dev` 脚本或加 postinstall）；若作者希望 clone 后零命令初始化，后续可加（但 postinstall 在 CI 装依赖时可能无 DB，需谨慎）。
- 未在浏览器实跑"全新空库首次 seed"完整链路（沙箱 DB 已有预设）；验证为脚本两次幂等输出 + 代码审查 create/findFirst 分支。

---

---

## v0.46.31 — 前端打磨（#213：FE-10 弹窗合并 / FE-7 错误态 / FE-5 无障碍 / ARCH-7 颜色守卫）

### 一句话背景
"成品感"最容易被一眼看穿的短板是：弹窗各自为政、出错样式五花八门、图标按钮读屏读不出、今天修好的观感明天又被写死一个红。本单元一次性补齐四类前端打磨（对应 OPTIMIZATION_PLAN 的 FE-10/FE-7/FE-5/ARCH-7），都是"低风险的体验一致性"改动，不强求新功能。

### ① 干了什么
- **FE-10 合并角色弹窗**：`CharacterEditDialog`（全字段编辑+AI 补全）与 `CharacterCreateDialog`（精简创建）合并为单一 `CharacterDialog`，靠可选 `character` 参数区分"编辑/创建"两模式；调用方 `page.tsx` 两处渲染合并为一，旧两文件删除。把"性格文本↔结构化"解析（`fromText`/`toText`）、"时间线"解析（`timelineToText`/`textToTimeline`）、角色选项（`CHARACTER_ROLE_OPTIONS`）抽到 `src/lib/character-parse.ts` 单一数据源。
- **FE-7 错误态三件套**：`States.tsx` 新增 `ErrorState` 组件（图标+标题+说明+可选重试动作），与既有 `EmptyState`/`Loading` 共用 `--nv-*` 令牌与视觉语言；`DrawCards` 抽卡失败的"错误+重试"块改用统一 `ErrorState`。
- **FE-5 无障碍**：explore / game 窄屏抽屉切换的纯图标按钮（sliders/check/grid）补 `aria-label`（与既有 `title` 一致）；Modal 关闭键本已带 `aria-label="关闭"`，workspace 抽屉切换按钮带可见文字"大纲/侧栏"无需补。
- **ARCH-7 颜色守卫**：新增 `scripts/lint-colors.mjs` 扫描 `src` 下任意十六进制色值（如 `bg-[#ff0000]`），`npm run lint:colors` 可复跑；`.github/workflows/ci.yml` 加软门步骤（不阻断）。

### ② 为什么这么做（底层原理）
- **"合并弹窗"= 少一套漂移风险**：建/编两个弹窗原本各写一份 `fromText` 角色解析，哪天改了"习惯"的分隔符，一个改一个漏，角色卡字段约定就分叉了。抽到 `character-parse.ts` 单一数据源，改一处全生效——像把两份"菜谱"合成一份，两个厨师照同一份做。
- **"错误态三件套"= 用户不懵**：用户在 A 页出错看到红框、B 页出错看到 toast、C 页出错看到裸文字，会困惑"这到底成没成功"。统一 `ErrorState` 后，任何页面级错误都是同一套"图标+红字+重试"，语言一致。
- **"颜色守卫"= 防回归护栏**：FE-1 已把语义状态色收敛到 `--nv-*` 令牌，但没法阻止以后又有人写死 `bg-[#ff0000]`。脚本像"门卫"：每次提交/CI 扫一遍，发现新的硬编码就提醒改用令牌，保住 FE-1 的成果。
- **类比**：`ErrorState` 像全站统一的"故障指示牌"，`character-parse.ts` 像角色字段的"唯一字典"，`lint-colors.mjs` 像观感的"保安巡检"。

### ③ 怎么做的（方法 + 效果）
1. **合并弹窗**：用受控方式保留 `CharacterEditDialog` 的全字段编辑逻辑，外面包一层 `isEdit = !!character` 分支——有 `character` 走完整编辑（含 AI 补全按钮），无则只渲染"姓名/角色/性格"精简创建表单；POST/PUT 共用同一 `handleSave`，按 `isEdit` 选端点与请求体。删旧两文件后 `grep` 确认无残留引用。
2. **共享解析库**：把两个弹窗里逐字相同的 `fromText`/`toText`/`timelineToText`/`textToTimeline` 与角色选项搬进 `src/lib/character-parse.ts`，弹窗改为 import 复用。
3. **ErrorState**：追加到 `States.tsx`（与 `EmptyState`/`Loading` 同文件、同令牌体系）；`DrawCards` 错误块从手写红框改为 `<ErrorState title={error} action={<重试按钮>} />`。
4. **aria-label**：在 explore/game 四个纯图标切换按钮加 `aria-label`（内容等同 `title`），读屏可朗读。
5. **颜色守卫**：脚本用正则 `(text|bg|border|...)-\[#hex\]` 扫描 `src`（排除 generated/node_modules/.next），统计命中；非阻塞 `exit 0`。接入 `package.json` 的 `lint:colors` 与 CI 软门。

**效果数据**：
- tsc 零错误（TSC_EXIT=0）；零新依赖。
- 颜色守卫实跑：发现 3 处既有硬编码十六进制（游戏画布深底 + global-error 背景），脚本正确报告、不阻断。
- 提交（待 push）：`git add` 全部改动 + 双 changelog，复合 `git commit` + 代理 push origin main。

### ④ 关键取舍
- **不强行合并 DissectDimensions 的 `parseCharPreviewDetailed`**：它是拆书专用"预览解析"（把 AI 拆书产出的角色预览文本解析成卡片），与 `CharacterCard` 字段约定只是"部分重叠、语义不同"，强行抽共享会引入跨模块耦合且收益不确定——记为已知残留，诚实保留。
- **颜色守卫只拦"新增"、不强制改既有**：3 处游戏画布深底（`#0a0a0f`/`#0a0a1f`/`#0d0d2a`）是游戏互动页有意设计的深色背景，改令牌反而可能破坏游戏画布观感；守卫的价值是拦截以后的回归，而非把历史全部重刷。
- **FE-5 不做逐页 htmlFor 普查**：表单 label 多已走 `DialogField` 包裹（自带关联），全量逐页补 `htmlFor` 属低优先散点，本单元聚焦最明确的"图标按钮无 aria-label"缺口。

### 诚实边界
- 未在浏览器实跑合并后的 `CharacterDialog` 建/编两条路径与 AI 补全（沙箱无 GUI）；验证为 tsc 零错误 + 旧两文件引用 grep 清零 + 解析逻辑逐字保留（fromText/toText 与历史实现一致）。建议作者本地打开角色卡确认建/编/补全手感。
- 颜色守卫非阻塞（exit 0），CI 软门 `|| true`——本地工具不希望一次提交因"历史残留色值"被卡住；若作者希望硬拦截，把 CI 步骤改为 `node scripts/lint-colors.mjs` 即可。

---

*下个单元：#214 后端深化与导入（BE-5 长任务异步 / FE-N3 多格式导入）。*
