# 首页 UI 升级美化计划（Homepage UI Upgrade Plan）

> 配套资产：项目设计体系 `src/app/globals.css`（虚空玻璃 Void Glass）、首页组件 `src/app/page.tsx`  
> 适用范围：仅首页（`/`）及首页背景层；不改动工作台、创意工坊等其他路由。  
> 总原则：**在现有 Void Glass 体系上增量升级，不另起炉灶、不推翻重写。**



---

## 0. Design Read 与三旋钮

**Design Read：** 本地 AI 小说工具的首页改版，受众是写作者，气质为「暗色技术玻璃风（Void Glass 延续）」，技术栈 Tailwind v4 工具类 + 原生 CSS + 一处轻量 canvas 粒子。用户明确要求「炫酷且令人印象深刻的背景视觉」，因此动效强度上调，但严守性能与无障碍底线。

**三旋钮（全局变量，全文同名引用，不发明别名）：**

| 旋钮                       | 取值    | 依据                               |
| ------------------------ | ----- | -------------------------------- |
| `DESIGN_VARIANCE`（设计方差）  | **7** | 保留现有克制对称，但 hero 与空态改用不对称留白，避免模板感 |
| `MOTION_INTENSITY`（动效强度） | **7** | 用户点名要动态渐变/粒子/光影；但所有动效必须可降级、可暂停   |
| `VISUAL_DENSITY`（视觉密度）   | **3** | 首页是入口页，留白优先、聚焦 CTA，不堆信息          |

**签名元素（Signature）：** 全页只在一处重金投入「星尘粒子场 + 极光漂移背景」，隐喻「小说宇宙 / 记忆星图」，其余界面一律安静克制。签名元素即整页最难忘的那一点。

---

## 1. 现状盘点（已有资产，复用优先）

改版诊断基于真实代码，以下均为**已存在且应保留**的能力：

- **设计令牌**：`--nv-void #050508`（页底）、`--nv-surface-1/2/3`（三级玻璃面）、`--nv-border-1/2/3`、`--nv-primary oklch(0.62 0.19 270)`（靛蓝）、`--nv-creative oklch(0.58 0.21 295)`（紫罗兰）、`--nv-accent oklch(0.75 0.14 95)`（金）、`--nv-text-primary/secondary/tertiary/muted`（四档文字明度）。
- **三级玻璃表面**：`.surface-base` / `.surface-elevated` / `.surface-floating`，均带 `backdrop-filter: blur` 与 `transition`。
- **按钮体系**：`.btn-primary / .btn-ghost / .btn-success / .btn-danger / .btn-creative`，各自已有 `:hover`（上浮+增辉）与 `:active`（scale 回弹）。全局 `button` 基线已含 `transition + :active:not(:disabled){scale(.98)} + :disabled{opacity-50} + :focus-visible{ring-2}`。
- **页背景**：`body` 已有三层径向渐变（靛蓝顶部、紫罗兰右上、翠绿左下），`background-attachment: fixed`。
- **Hero 光晕**：`.hero-glow`（模糊圆斑，`filter: blur(90px)`），首页用了两团。
- **动画关键帧**：`fade-in-up`、`spring-in`、`glow-pulse`（`.glow-dot`）、`shimmer-scan`（`.shimmer-line` 流光）、`border-breathe`（渐变边框呼吸）、`nf-card-in / nf-bubble-in`；卡片 `card-lift:hover{translateY(-2px)}`。
- **文本渐变**：`.text-gradient`（靛蓝→紫罗兰→金，标题用）。
- **无障碍**：已存在 `prefers-reduced-motion` 全局兜底（动画/过渡归零）。
- **首页组件现状**：顶栏（btn-primary + 多个 btn-ghost）、Hero（hero-glow×2 + text-gradient）、主区四态（加载三点脉冲 / 加载失败居中卡 / 空态三张等宽 FeatureCard / 项目网格 ProjectCard）。

**与前沿纪律的刻意偏差（用户已点名要，故保留）：** 技能默认「渐变关、紫蓝光晕禁、单强调色」。但本项目是暗色技术风且用户明确要求动态渐变与光影，因此背景特效**有意保留并强化**多色极光，但限定在既有三色族（靛蓝/紫罗兰/金）内，不引入第四装饰色。功能色（绿/玫瑰/青）仅用于语义状态（成功/危险/信息），不进入背景装饰。

---

## 2. 统一视觉风格与一致性要求（令牌锁定）

改版必须锁死以下基线，任何新写法都从令牌推导，禁止硬编码新色值/新曲线：

1. **强调色锁定（背景特效）：** 粒子与极光只使用 `--nv-primary`(270) / `--nv-creative`(295) / `--nv-accent`(95) 三色，低透明度（≤0.18），与 `.text-gradient` 同源。语义色（绿/玫瑰/青）绝不进入背景层。
2. **圆角体系：** 继承 `--radius 0.625rem` 派生档（`radius-2xl ≈ 1.125rem` 用于卡片，`radius-xl` 用于按钮/标签）。全页一套，不混用 sharp/pill。
3. **字体：** 继承 `--font-sans`（已离线化的系统栈，含中文回退）。**不引入任何新 Web Font**，以维持无网可构建（历史教训：曾因 Google Fonts 联导致 build 失败）。
4. **玻璃层级：** 复用 `.surface-*` 三级深度；背景特效层固定 `z-0` 且 `pointer-events-none`，内容层 `z-10`，模态 `z-50`，保证 `backdrop-filter` 层级不被破坏。
5. **动效语言：** 时长只准用 `--dur-micro(150ms)/standard(250ms)/emphasis(400ms)/page(600ms)`；曲线只准用 `--ease-out-smooth / --ease-spring / --ease-out-expo`。禁止发明新 cubic-bezier、禁止动 `width/height/top/left/margin/padding` 等布局属性。
6. **主题锁定：** 暗色为主（已 `color-scheme: dark`），浅色主题（`.light`）同步适配：粒子改用低饱和深蓝灰、光晕透明度下调，确保浅色下不刺眼且对比达标。
7. **签名唯一性：** 炫酷视觉只集中在背景签名元素，按钮/卡片/导航保持现有的安静精致，不各自加光效（避免满屏都在动）。

---

## 3. 首页背景整体方向（炫酷视觉：光影层次三层法）

采用**三层光影叠加**，全部 GPU 友好（只动 transform/opacity，不连续动大面 filter）：

### Layer A — 极光底（漂移的径向渐变）

- 复用现有 `body` 三层径向渐变作为静态底，新增一层 `AuroraBackground` 固定容器（`position: fixed; inset: 0; z-0; pointer-events-none`）。
- 容器内放 3 个绝对定位的大模糊光斑（延续 `.hero-glow` 思路，`filter: blur(120px)`，比 hero 更大更柔），分别代表靛蓝/紫罗兰/金。
- **漂移实现：** 用 `transform: translate3d()` + `opacity` 做极慢位移与呼吸（`30s~45s ease-in-out infinite alternate`），**不**对 filter 做连续动画（性能纪律）。光斑初始位置呼应现有 body 渐变布局，视觉连续无跳变。

### Layer B — 星尘粒子场（canvas，签名元素）

- 新增 `ParticleField.tsx`（client 组件，canvas 2D）。粒子隐喻「故事星尘 / 记忆碎片」，契合「小说宇宙」主题。
- **视觉：** 60~90 个微小光点（依视口面积动态上限），约 30% 带三色族淡着色；邻近粒子用极淡连线构成「星图」感（仅对近距离成对绘制，开销可控）。
- **交互：** 整层 canvas 随鼠标做轻微 `transform` 视差（不重算粒子坐标，纯位移合成）；可选：光标邻近粒子做微弱避让（仅影响局部，不全局重绘）。
- **性能与降级：**
  - 启动延后到 `requestIdleCallback`，不阻塞 LCP；目标 LCP < 2.5s、INP < 200ms、CLS < 0.1。
  - `devicePixelRatio` 适配，避免高分屏模糊。
  - `prefers-reduced-motion` 或低性能设备：渲染**静态星点**（无 rAF 循环）。
  - 页面隐藏（`visibilitychange` / `IntersectionObserver`）时暂停 rAF，回到前台再恢复。
  - `will-change` 仅在动画进行中临时加，停止即移除。

### Layer C — 光影点缀（hero 强化）

- 现有 hero 两团 `.hero-glow` 升级为「缓慢呼吸 + 极慢位移」版本（复用 `border-breathe` 思路，但作用于 opacity/transform）。
- 新增一条横贯 hero 底部的细「极光带」过场（复用 `.shimmer-line` 流光技法，方向改为横向缓扫），作为 hero 与下方内容的视觉过渡。

**整体观感一句话：** 深空底色上，三色极光缓缓流淌，星尘粒子随风轻移、偶尔连成星图，光标掠过带起微光涟漪，既炫酷又不抢内容。

---

## 4. 各交互状态规范（逐状态：现状 / 规范 / 落点）

> 落点指建议新增或修改的 CSS 类 / 组件位置。类名优先复用 globals.css 既有项。

### 4.1 常态（Normal / Resting）

- **现状：** 卡片 `.surface-elevated`、按钮 `.btn-*`、文字四档 `--nv-text-*` 已规范；背景特效常驻但静止（reduced-motion / 低性能时）。
- **规范：** 常态即「安静」基准态，所有 hover/active 都以常态为起点做增量；背景粒子常态稀疏、慢速、低透明度。
- **落点：** 无新增，锁定为基准。

### 4.2 悬浮态（Hover）

- **按钮：**
  - `.btn-primary:hover` 已有上浮+增辉；**新增**微光描边（复用 `border-breathe` 思路做 1px `--nv-primary/30` 呼吸边）。
  - `.btn-ghost:hover` 已有底色提亮+文字转 primary；**补充**图标同步微亮。
- **卡片：** `.card-lift:hover{translateY(-2px)+shadow-hover-lg}` 已有；ProjectCard 删除按钮 `group-hover:opacity-100` 已做；**补充**「进入工作台 →」箭头在 hover 时 `translateX(3px)` 位移（复用现有箭头）。
- **链接：** `.link-underline` 下划线展开已有，保留。
- **可选增强（性能允许时）：** 卡片 hover 时背景粒子向该卡片轻微聚拢（仅局部粒子受力，不全局重绘）。
- **落点：** globals.css 新增 `.btn-primary:hover` 描边规则；`page.tsx` ProjectCard 箭头加 `group-hover:translate-x-1 transition-transform`。

### 4.3 点击态（Active / Pressed）

- **现状：** 全局 `button:active:not(:disabled){scale(.98)}`、`.surface-elevated:active{scale(.985)}`、`.btn-primary:active{scale(.97)}` 已有。
- **规范：** 统一「按压凹陷」语义——主按钮按下时额外加 `inset` 阴影（视觉下陷），过渡缩短到 `120ms`（比 standard 更快的触感反馈）；触摸设备 `:active` 同样生效（现有基线已覆盖）。
- **落点：** globals.css 新增 `.btn-primary:active{ box-shadow: inset 0 2px 6px rgba(0,0,0,.35) }`（在现有 scale 基础上叠加）；时长用 `--dur-micro`。

### 4.4 聚焦态（Focus / Focus-visible）

- **现状：** 全局 `:focus-visible{ring-2 ring-ring/50}`、`.input-glass:focus{3px 柔光环}` 已有；`.focus-ring` 工具类已有。
- **规范：** 键盘 `Tab` 焦点统一 2px `--nv-primary/50` 环 + 4px 透明间隙（`ring-offset` 透明），确保可见且不贴边；**新增可选**「焦点聚光」——焦点元素附近的背景粒子短暂向焦点汇聚（仅键盘导航时触发，鼠标点击不触发，避免干扰）。
- **必过：** 键盘可达、焦点可见、不依赖颜色 alone（焦点环之外辅以位置/位移提示）；图标按钮均有 `aria-label`，装饰图标 `aria-hidden`。
- **落点：** globals.css 完善 `.focus-ring`（offset 间隙既定）；焦点聚光为可选增强，默认关、仅在 reduced-motion 关闭时启用。

### 4.5 加载态（Loading）

- **现状：** 项目列表加载用 3 个 `animate-pulse` 圆点（技能视为「通用 spinner」不推荐）；按钮 `loadingSample/loadingGenre` 仅切文字。
- **规范（对齐技能）：**
  - **网格加载改骨架屏**：与最终 ProjectCard **同形**的占位卡（圆角 2xl + 标题/描述/统计条占位），叠加 `.shimmer-line` 流光横扫，禁通用圆形 spinner。
  - **按钮加载**：内联小型 spinner（复用 glow-dot 思路做环形旋转或三点）+ `disabled` + 文案变「载入中…」，禁止整页阻塞；`loadingGenre` 的「创建中…」微文案保留并统一。
- **落点：** `page.tsx` 加载分支新增 `<ProjectCardSkeleton />`（`surface-elevated` + `shimmer-line`）；按钮内联 spinner 组件复用现有动画类。

### 4.6 空态（Empty）

- **现状：** 三张等宽 `FeatureCard`（探讨/拆书/配置）+ 主 CTA「一键载入示例」+ 「按题材开局」展开。**问题：** 等宽三卡是 AI 默认布局（技能明确不推荐），且三入口视觉权重相同。
- **规范：**
  - **改不对称 Bento 布局**：1 张主引导卡（探讨模式，最大）+ 2 张副卡（拆书/配置）错落排布，拉开视觉层级；主 CTA 保持 `.btn-primary` 醒目。
  - 文案保持邀请式（现有「还没有小说项目，从下面任选一种方式开始」已是邀请语态，保留，避免道歉腔）。
  - 空态背景粒子**稀疏但存在**，不让空屏显得死板。
- **落点：** `page.tsx` 空态分支改用 Bento 网格（CSS Grid，细胞数=内容数，无空细胞）；主卡跨列放大。

### 4.7 过渡态（Transition）

- **现状：** `fade-in-up` / `spring-in` / `nf-card-in` 已定义；Modal 用 `nf-bubble-in`。
- **规范：**
  - 项目卡片列表入场用 **stagger 逐个上浮**（IntersectionObserver 触发，逐张 `nf-card-in`，间隔 60ms），叙事上像「书一本本浮现」。
  - 路由切换/弹窗保持现有 bubble-in；主题切换时背景渐变做平滑过渡，不闪。
  - 所有过渡时长走 `--dur-*` 档位，入场用 ease-out，禁线性。
- **落点：** `page.tsx` 项目网格包一层 stagger 容器；背景层主题切换加 `transition`（仅 opacity/transform）。

---

## 5. 落地技术栈与文件改动清单（可执行）

> 仅列出计划改动，执行需逐 phase 验证。不改动现有令牌、按钮体系、浅色调色板（仅适配）。

| 文件                                                    | 改动                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/home/AuroraBackground.tsx`（新建，client） | Layer A 极光漂移容器（3 模糊光斑 + transform/opacity 漂移），`fixed z-0 pointer-events-none`                                                         |
| `src/components/home/ParticleField.tsx`（新建，client）    | Layer B canvas 星尘粒子场；DPR 适配、idle 启动、reduced-motion 静态降级、可见性暂停、鼠标视差                                                                    |
| `src/app/page.tsx`                                    | 根容器渲染 `<AuroraBackground/>`+`<ParticleField/>`（z-0）；加载改骨架屏；空态改 Bento；箭头 hover 位移；卡片 stagger 入场                                        |
| `src/app/globals.css`                                 | 新增：粒子画布样式、极光呼吸关键帧（复用 border-breathe 思路）、骨架屏 shimmer 类（复用 shimmer-line）、主按钮 active inset 阴影、focus-ring offset 完善；`.light` 下粒子/光晕降透明度适配 |
| `src/hooks/usePrefersReducedMotion.ts`（新建，可选）         | 封装 `matchMedia('(prefers-reduced-motion: reduce)')`，供背景组件订阅                                                                           |

**性能红线：** 粒子 rAF 仅在动画态运行；背景层零布局抖动（CLS=0）；LCP 不被背景阻塞（idle 启动）；reduced-motion 全量静止。

---

## 6. 预检清单（交付前逐条过，对齐 frontend-mastery）

- [ ] Design Read 已声明，三旋钮有依据（非静默默认）
- [ ] 背景特效有动机（星尘/星图叙事），且全页仅此一处炫酷
- [ ] 动效只动 transform/opacity；无大 surface 连续 blur/filter 动画
- [ ] `prefers-reduced-motion` 尊重：粒子静态、极光静止、过渡归零
- [ ] 强调色全页一致（背景仅三色族）；圆角体系全页一致
- [ ] 加载态用骨架屏（非通用 spinner）；空/加载/错误三态齐全
- [ ] 空态非三等分默认布局（改 Bento 不对称）
- [ ] 每个 CTA 文本对比度 AA，标签不折行；无重复意图 CTA
- [ ] 焦点可见（focus-visible 环 + 间隙）；键盘可达；图标按钮有 aria-label
- [ ] 主题锁定暗色，`.light` 浅色已适配并测过
- [ ] 真实图片或明确占位，无 div 假截图；文案自审无 AI 腔/语病
- [ ] Core Web Vitals：LCP<2.5s、INP<200ms、CLS<0.1
- [ ] 一套设计系统（Void Glass），未混用其他体系
- [ ] 全页 0 个 ASCII em-dash（中文标点除外）

---

## 7. 执行顺序建议（分阶段，便于逐步验证）

- **Phase 1 — 背景层骨架：** 新建 `AuroraBackground` + `ParticleField`，接入 `page.tsx` 固定层，`pointer-events-none`。目标：不影响任何现有功能，仅背景变炫酷；完成即 `tsc` 零错误 + 本地起服务肉眼验证 + commit。
- **Phase 2 — 状态规范补全：** active 凹陷阴影、focus-ring offset、骨架屏加载、Bento 空态。目标：四态齐全且达标；逐组件验证后 commit。
- **Phase 3 — 联动润色：** hover 粒子聚拢（可选）、卡片 stagger 入场、焦点聚光（可选）。目标：叙事连贯；reduced-motion 回归测试后 commit。

每 phase 独立可回滚；全部完成后升一次版本号并双写 changelog（遵循项目既有发版纪律）。

---

## 诚实边界

- 本计划为**设计规格文档**，不含实现代码；落地以 Phase 1→3 逐步执行为准。
- 粒子「星图连线」与「hover 聚拢 / 焦点聚光」为可选增强，是否启用取决于 Phase 3 实测性能，若 INP 超标则降级为静态星点。
- 背景视觉的具体观感需在浏览器实跑确认；文档中的色值/时长均引用现有令牌，未实测的渲染效果以实际为准。

---

## 8. 执行状态（2026-08-03 收官）

三阶段全部落地、tsc 零错误、dev 编译 200、代理推送 main：

| Phase | 内容 | 版本 | Commit | 状态 |
| ----- | ---- | ---- | ------ | ---- |
| Phase 1 | 背景签名层：AuroraBackground 极光漂移 + ParticleField 星尘粒子（DPR/idle/reduced-motion/visibility/视差/连线/浅色） | v0.46.41 | `7e55164` | ✅ |
| Phase 2 | 状态补全：主按钮 active inset 凹陷、focus 4px 间隙、ProjectCardSkeleton 骨架屏、空态 Bento 不对称 | v0.46.42 | `97e6567` | ✅ |
| Phase 3 | 联动润色：卡片 stagger 入场（IntersectionObserver 60ms）、粒子聚拢（hover/focus 经 window 事件） | v0.46.43 | `94f0cf9` | ✅ |

- 验证：每个 phase `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 零错误；dev（:3001）首页编译 200、SSR HTML 含对应新标记（aurora-layer/-inset-6/aurora-blob → shimmer-line → 无错误页），无运行时错误页。
- 诚实边界：粒子连线/hover 聚拢为签名增强，已实现且 INP 友好（局部受力、不全局重绘）；背景流动、星点密度、stagger 节奏、聚拢幅度等具体观感需在浏览器实跑最终确认；首屏 loading 渲染骨架屏故首屏 SSR 不含 home-stagger-item（已代码审查，非遗漏）。
