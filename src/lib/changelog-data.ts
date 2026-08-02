/**
 * Novel Forge 更新公告 —— 前端公告系统数据源
 *
 * ⚠️ 强制同步规则（每次代码变更 + commit 前必做）：
 *   本文件必须与项目根目录 CHANGELOG.md 保持同步。
 *   两个文件一起更新、一起 commit——缺一不可。
 *
 * 步骤：
 *   1. 在本文件 VERSIONS 数组最前面新增版本条目
 *   2. LATEST_VERSION → 新版本号
 *   3. CHANGELOG_BRIEF → 新版本4条摘要
 *   4. 同步更新 CHANGELOG.md（项目根目录）
 *   5. 两个文件一起 git commit
 *
 * 验证：localhost:3001/changelog 能看到最新版本
 */

export interface VersionEntry {
  version: string;
  date: string;
  title: string;
  sections: Array<{
    label: string;
    items: string[];
  }>;
}

export const LATEST_VERSION = "v0.46.23";

/** 首页公告弹窗摘要（只列最新版本的关键项） */
export const CHANGELOG_BRIEF = [
  "⌘ 全局命令面板 Cmd/Ctrl+K（FE-N1）：任意页面按 Cmd/Ctrl+K 唤起面板，输入即搜当前项目的章节标题 / 角色名 / 世界书词条 / 规则，回车直达；也支持「新建章节 / 打开设置 / 探讨 / 拆书 / 创意工坊 / 回收站 / 返回主页」等动作跳转",
  "🔎 跳转即定位：搜到章节回车跳到该章并自动选中；角色 / 世界书词条回车直接打开编辑弹窗；不在项目页时面板自动聚焦全局操作（页面跳转）",
  "💡 可发现性：仪表盘顶栏新增「搜索 ⌘K」按钮（移动端点按同样能开），面板内 ↑↓ 选择、Enter 跳转、Esc 关闭",
  "✅ 全量 tsc 零错误、零新 npm 依赖；检索走前端内存索引（打开时拉当前项目数据），不上 ES；workspace 加 `?node`/`?editCharacter`/`?editLore`/`?tab` 参数接收跳转",
];

/** 完整版本历史（最新在前） */
export const VERSIONS: VersionEntry[] = [
  {
    version: "v0.46.23",
    date: "2026-08-02",
    title: "全局命令面板 Cmd/Ctrl+K：项目一大，搜索即达，专业感拉满",
    sections: [
      {
        label: "命令面板（FE-N1）",
        items: [
          "根 layout 挂载全局 `<CommandPalette />`：监听 Cmd/Ctrl+K 切换，也可由仪表盘顶栏「搜索 ⌘K」按钮派发 `nf-open-command-palette` 事件打开",
          "从 `usePathname` 解析当前 `projectId`，打开时 `GET /api/projects/[id]` 拉取 nodes/characters/lore/rules 建内存索引（项目详情接口已补 `rules: true`）；输入即过滤标题/副标题，↑↓ 选择、Enter 跳转、Esc 关闭",
        ],
      },
      {
        label: "跳转即定位",
        items: [
          "章节结果 → `/workspace/[id]?node=节点ID`，workspace 页新增 `useSearchParams` 效果应 `?node` 自动 `handleSelectNode` 选中该章；`?editCharacter`/`?editLore` 直接打开对应编辑弹窗；`?tab` 切左栏页签",
          "角色 / 世界书 / 规则结果分别回车打开编辑 / 跳规则页签；全局动作（新建章节 / 设置 / 探讨 / 拆书 / 创意工坊 / 回收站 / 主页）始终可用，不在项目页时面板自动聚焦这些动作",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "检索走前端内存索引（打开时拉一次当前项目数据），不上 ES / 全文库——符合计划「中」量级，项目内实时性足够；若需跨项目全局搜后续可加服务端接口",
          "workspace 页加 `export const dynamic = 'force-dynamic'` 以安全使用 `useSearchParams`（避免静态预渲染的 Suspense 报错）；全量 tsc 零错误、零新 npm 依赖",
        ],
      },
    ],
  },
  {
    version: "v0.46.22",
    date: "2026-08-02",
    title: "软删除 + 回收站：删项目不再物理抹掉，手滑可救",
    sections: [
      {
        label: "软删除（BE-2）",
        items: [
          "Project 模型新增 `deletedAt`（软删除标记）；`DELETE /api/projects/[id]` 改为 `update` 设 `deletedAt = now()`（软删除）而非 `delete`（物理删），子表均 `onDelete: Cascade` 故随项目软删一起被列表隐藏、不丢数据",
          "`GET /api/projects` 列表加 `where: { deletedAt: null }` 过滤，主页与所有取项目列表处只显示活跃项目；单项目 `GET /api/projects/[id]` 仍正常返回（直接 URL 进旧项目仍可用）",
        ],
      },
      {
        label: "回收站页面",
        items: [
          "新增 `GET /api/projects/recycle`（列出 `deletedAt != null`）、`POST /api/projects/[id]/restore`（清 deletedAt 恢复）、`POST /api/projects/[id]/purge`（硬删除，级联清全部子表）",
          "新增 `/recycle` 回收站页面：列出已删项目（含删除时间 + 角色/词条/节点计数），一键「恢复」或「彻底删除」（带二次确认）；主页顶栏加「回收站」入口；删除确认文案改为「移入回收站，可在回收站恢复」",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "软删除仅「隐藏」不「自动过期」——未做「保留 N 天自动清理」定时任务（本地工具无需紧迫清理，避免误删真数据；如需可后续加 cron 或启动时清理）",
          "全量 tsc 零错误、零新 npm 依赖；字段经 `prisma db push` 同步本地 PG；彻底删除走硬删除 + 级联，与旧行为一致但变为显式「彻底删除」按钮，非默认路径",
        ],
      },
    ],
  },
  {
    version: "v0.46.21",
    date: "2026-08-02",
    title: "正文版本历史与一键回滚：AI 重写再也不怕把写好的稿子改没了",
    sections: [
      {
        label: "版本快照（BE-1）",
        items: [
          "新增 `StoryNodeRevision` 表（nodeId / 版本号 version / 正文全文 content / 字数 / 来源 source / 时间），在 `src/core/pipeline/post-processor.ts` 写库前单点快照（覆盖所有走后处理管线的 AI 写 / 重写 / 润色 / 自动填表），并在 `src/app/api/story/nodes/[id]` 的 PUT（手动保存）写前也快照",
          "去重逻辑：若上一版内容与本节点最近一次快照完全相同则跳过，避免微调 / 频繁保存产生大量重复版本；空正文不快照；快照失败静默忽略，绝不阻断正文生成",
        ],
      },
      {
        label: "历史版本抽屉与回滚",
        items: [
          "编辑器状态栏新增「历史」按钮，打开统一 Modal 抽屉：左列本节点全部版本（版本号 / 来源标签 / 字数 / 时间），右栏预览选中版本正文，底部「回滚到此版本」一键恢复",
          "回滚 API `POST /api/story/nodes/[id]/rollback`：先把当前正文自动备份为「回滚快照」再覆盖，保证回滚可逆；成功后自动刷新节点内容；列表 / 详情分别由 `GET /revisions` 与 `GET /revisions/[revId]` 提供",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "仅 v0.46.21 起产生的版本有记录，此前的历史正文无快照（无法穿越回溯）；来源标签如实区分 AI 生成 / 重写 / 润色 / 手动保存 / 回滚快照",
          "全量 tsc 零错误、零新 npm 依赖；表经 `prisma db push` 同步本地 PG；快照为「安全网」，失败静默不影响主流程",
        ],
      },
    ],
  },
  {
    version: "v0.46.20",
    date: "2026-08-02",
    title: "AI 成本看板：真实 token 用量与估算花费落库，统计面板一眼看清本月 AI 花了多少",
    sections: [
      {
        label: "Token 落库与成本估算（BE-3）",
        items: [
          "新增 `LlmCallLog` 表（时间 / 模型 / 角色 / 输入·输出·总 token / 估算成本 / BaseURL / 是否故障转移），在 `src/core/llm/client.ts` 的 `chat` 成功返回、`chatStream` 流正常完成时（readStream 末尾 `onUsage` 回调）单点 fire-and-forget 落库，覆盖所有走 client 的生成 / agent / game / explore / dissect，不漏",
          "内置常见模型每百万 token 单价表（`lib/llm.ts` 的 `MODEL_PRICING`，含 DeepSeek / GPT / Claude / 通义 / 智谱 / Kimi 等 20+ 项），`estimateCost(model, prompt, completion)` 按模型名关键字匹配估算美元成本；未知模型标「单价未知」不伪造成本",
        ],
      },
      {
        label: "成本看板 UI",
        items: [
          "统计面板 MonitorPanel 新增「AI 成本（全项目 · 本月）」区块：本月调用次数 / Token 总量 / 估算花费（¥，按 7.2 汇率折算并标注 ≈$）/ 记录起始日，附按模型分布（次数·token·花费）小条",
          "monitor 路由 `/api/stats/monitor` 新增 `llmUsage` 聚合（本月 `groupBy model` 的 count/sum）；原字数估算 Token 区块保留不动",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "client 层不持有 project 上下文，故看板做「全局」聚合并明确标注「全项目」——不伪装 per-project 精确统计（如需 per-project 需在调用链注入 projectId，属独立优化）",
          "仅记录 v0.46.20 之后产生的调用，历史无数据；UI 在无记录时显示「暂无记录——自 2026-08-02 起累计」，不假装历史花费；价格随供应商调价失真，UI 标注「估算」",
          "全量 tsc 零错误、零新 npm 依赖；落库失败静默忽略不影响主流程；表经 `prisma db push` 同步本地 PG（无迁移历史文件）",
        ],
      },
    ],
  },
  {
    version: "v0.46.19",
    date: "2026-08-02",
    title: "LLM 重试 + 故障转移：模型抽风时自动退避重试 / 切备用模型，写作几乎无感",
    sections: [
      {
        label: "重试与退避（BE-4）",
        items: [
          "核心 LLM 客户端 `src/core/llm/client.ts` 的 `chat` / `chatStream` 接入指数退避重试：429 限流 / 5xx 服务端异常 / 网络不可达（fetch TypeError）默认重试 3 次，退避 600ms × 2^(n-1) 封顶 8s 并带 ±20% 抖动，避免瞬时抖动直接断生成",
          "4xx 鉴权/配置错误（401/403/404/400）视为不可重试——直接抛出 `mapLLMError` 中文提示，不浪费重试次数（这类是 Key 配错，重试无意义）",
        ],
      },
      {
        label: "故障转移（多模型兜底）",
        items: [
          "`LLMConfig` 新增 `fallbackModels: FallbackModel[]` 链；主模型重试耗尽后依次用备用模型重发整段请求（换 model / baseURL / apiKey）。配置经 `process.env.LLM_FALLBACK` 注入（形如 `deepseek-v3@https://api.deepseek.com,Pro/xxx@https://api.siliconflow.cn`），不配则纯重试、零 schema 改动",
          "call 链抽象为「主模型 → 备用模型」统一遍历，对所有生成/agent/game/explore/dissect 入口透明生效；设置页可视化开关留待后续（配置入口已就绪，未伪装「已配 UI」）",
        ],
      },
      {
        label: "流式安全与诚实边界",
        items: [
          "流式生成仅在「建立连接阶段」（fetch 失败 / 首 token 前 HTTP 错）重试与切换备用；一旦进入 token 流即不再重试/切换，避免重复输出污染已生成正文",
          "遗留路径 `src/lib/llm.ts` 的 `callLLM`（个别旧路由）同步补同等指数退避重试，但不带 fallback（避免范围膨胀）；全部为本地运行时逻辑，不引入任何部署/服务器组件，符合「本地自用、不做真实网络」定位",
        ],
      },
    ],
  },
  {
    version: "v0.46.18",
    date: "2026-08-02",
    title: "响应式补齐：explore 探讨页 / game 游戏页三栏抽屉化（窄屏不再挤压）",
    sections: [
      {
        label: "响应式补齐（FE-6）",
        items: [
          "explore 探讨页三栏（构建配置 w-80 / 中栏 / 已采纳 w-72）与 game 游戏页三栏（左信息 w-52 / 中栏 / 右信息 w-64）参考 workspace 主页补 `lg:` 抽屉：左右栏在 `<lg` 变 `fixed inset-y-0 left/right-0 z-40 w-* max-w-[85vw] h-full transition-transform`，开 `translate-x-0`、关 `-translate-x-full`；`lg:static lg:z-auto lg:shrink-0 lg:w-* lg:translate-x-0 lg:transition-none` 复位，桌面三栏并排零回归",
          "窄屏顶部新增抽屉切换按钮（`lg:hidden`）：explore 用 `sliders`/`check` 图标分别开构建配置/已采纳抽屉，game 用 `sliders`/`grid` 图标开关左右栏；中栏始终 `flex-1 min-w-0` 全宽不被压扁",
        ],
      },
      {
        label: "遮罩与交互",
        items: [
          "三栏容器末尾新增 `lg:hidden` 半透明遮罩：`(leftDrawerOpen || rightDrawerOpen)` 时渲染 `fixed inset-0 z-30 bg-black/50`，点击即关两栏；桌面 `lg:hidden` 自动隐去、不拦截交互",
          "explore 桌面「构建配置」内联开关改为 `hidden lg:inline-flex`（与窄屏抽屉切换分工清晰）；原 `showConfig` 状态保留控制桌面内联可见性",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "dissect 拆书页经 grep 核查本就是单栏 `max-w-6xl mx-auto` 表单（无 `grid-cols-*` / 多列并排），窄屏天然不挤压——未做无意义改写，避免 cargo cult 式硬凑「单栏堆叠」",
          "game 页根布局 `flex h-screen flex-col overflow-hidden` + 三栏 `flex flex-1 overflow-hidden` 保持不变，抽屉 `fixed` 脱离文档流后中栏自然占满，零布局回归",
          "全量 tsc 零错误、零新 npm 依赖；未在真机窄屏实跑手感，建议作者本地缩窗确认抽屉开合与遮罩点击收起",
        ],
      },
    ],
  },
  {
    version: "v0.46.17",
    date: "2026-08-02",
    title: "弹窗统一收口：22 个手写遮罩全部接入统一 Modal 基座（focus trap + ESC + 滚动锁）",
    sections: [
      {
        label: "弹窗统一收口（FE-3）",
        items: [
          "全项目 22 个业务弹窗（角色编辑/创建、世界书编辑、风格编辑、导入向导、设置导入、记忆衰减、项目配置、生成前确认、抽卡、扩展结果、工具箱、剧情线、规则面板、建表、首页公告、创意工坊上传、导出、大纲、自动化设置、构建配置等）的手写 `fixed inset-0 z-50 bg-black/60` 遮罩全部删除，统一替换为 `<Modal open onClose={...} bare panelClassName=\"...\">`",
          "统一基座 `src/components/ui/Modal.tsx` 自带：focus trap（Tab/Shift+Tab 在弹窗内循环不逃逸）、ESC 关闭、body 滚动锁、`role=\"dialog\" aria-modal` 无障碍语义——此前这些能力散落在各弹窗的 `useFocusTrap` + 手写遮罩里，现在只维护一处",
        ],
      },
      {
        label: "bare 模式与零破坏迁移",
        items: [
          "Modal 新增 `bare`（无默认标题栏）+ `panelClassName`（透传宽度/布局类）+ `header`（自定义头部插槽）+ `showClose`（bare 模式下右上角关闭键）四个 prop，统一「遮罩外壳 + 关闭行为」而保留各弹窗内部结构与样式",
          "bare 模式不再强加 `max-h-[88vh] overflow-y-auto`，把高度与滚动完全交给 `panelClassName`，避免与「头部固定 + 内容区滚动」类弹窗（生成前确认、抽卡、导入向导等）布局冲突",
          "DialogUI 的 `DialogOverlay` 已退役不再被任何业务组件引用，统一走 Modal",
        ],
      },
      {
        label: "关闭语义诚实保留",
        items: [
          "原「点遮罩不关闭」的弹窗（构建配置、建表、创意工坊上传、首页公告）用 `closeOnOverlay={false}` 诚实保留原交互；导入向导保留 `step === \"input\" || \"done\"` 才可点遮罩关闭的语义；其余统一点遮罩 / ESC 关闭",
          "全量 tsc 零错误、零新 npm 依赖；grep 复核 `src` 下已无残留手写业务弹窗遮罩（Modal 自身、移动抽屉、StyleSelector 下拉、toast、游戏画布、粒子特效等合法保留）",
        ],
      },
    ],
  },
  {
    version: "v0.46.16",
    date: "2026-08-02",
    title: "UI 装饰 emoji 收口：76 处 JSX 文本装饰 emoji 统一替换为 Icon 图标",
    sections: [
      {
        label: "UI 装饰 emoji 收口（FE-2）",
        items: [
          "用 ts-morph AST 精准命中 components/app（非 api）里把 emoji 当作装饰图标的 JSX 文本节点（JsxText），共改写 18 个文件、76 处，统一替换为 `<Icon name=\"...\" size={N} className=\"inline-block align-text-bottom shrink-0\" />`",
          "图标尺寸随祖先容器自适应（text-2xl→18 / text-3xl→20 / 默认 15），inline 对齐基线、不挤压文字；缺失 import 时自动补 `import { Icon } from \"@/components/ui/icons\"`",
        ],
      },
      {
        label: "图标库扩容",
        items: [
          "src/components/ui/icons.tsx 新增 26 个 lucide 语义图标：brain / mountain / messageCircle / smile / heart / scale / coffee / compass / hand / link / flask / radio / coins / clapperboard / swords / flower / rocket / drama / sliders / ruler / key / ban / party / landmark / paperclip / square",
          "覆盖被替换 emoji 的全部语义（📥下载 🤖AI 🎨风格 ⚡节奏 🧠记忆 🎯目标 💡灵感 🎉庆祝 📚章节 🌍世界 👥角色 🎒道具 📊图表 🔮伏笔 🗺地图 ⚖权衡 ☕氛围 🔗关联 🔬考据 📡广播 💰成本 🎬脚本 🥋交锋 🌸意境 🚀高潮 🎭戏剧 🎚参数 🏯场景 🚫禁止 📌锚点 等）",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "严格区分三层 emoji：①协议层（API 响应串 ✅❌⚠️，前端靠 startsWith(\"✅\") / ===\"❌失败\" 解析）②提示词层（LLM prompt 分隔符 ★、实体高亮 🟢🟡🔵）一律不动，动了破坏前后端契约或降 prompt 质量——本改写只命中 JsxText，天然不触碰这两层",
          "大插画 emoji（text-4xl/5xl 容器内，如空态 📭、成功大勾 ✅）保留为视觉焦点，换成小线性图标会视觉退化",
          "已知残余（如实披露，不伪装全清）：Type B 数据字段 emoji（DissectDimensions / ContextPreview 的 `icon: \"📚\"` 类，需改 render 链且半数无对应图标）与 JS 字符串字面量 emoji（如 DissectAdaptPanel 按钮文案 `🎨 应用修改`、ContextPreview 三元 `✅/❌` 状态标）本次未纳入，留待后续专项",
        ],
      },
    ],
  },
  {
    version: "v0.46.15",
    date: "2026-08-02",
    title: "视觉一致性收口 + 浅色主题：语义状态色全面令牌化，新增昼面换肤",
    sections: [
      {
        label: "视觉一致性收口（FE-1）",
        items: [
          "全站 4 类语义状态色（成功绿 / 危险红 / 提醒琥珀 / 信息青）从散落的 emerald-400/500/600、rose、amber、sky、green、yellow、blue、red 等 200+ 处硬编码色值，统一收敛到 --nv-success / --nv-danger / --nv-warning / --nv-info 设计令牌",
          "为支持该收敛，在 Tailwind @theme 注册 success/danger/warning/info 语义别名（含 -soft 变体），原生支持 text-success、bg-danger/20 等带透明度的写法",
          "中央图标色板 iconColor 与 StatusDot 组件同步改走令牌，全站状态点/图标颜色一处定义、处处一致",
        ],
      },
      {
        label: "浅色主题（FE-N4）",
        items: [
          "新增「虚空玻璃·昼面」浅色主题：仅通过覆盖设计令牌实现，组件零改动即可换肤——白底玻璃面 + 深色描边 + 深色正文",
          "根布局首屏前注入防闪烁脚本读取 localStorage('nf-theme')；新增 Sun 图标与 ThemeToggle 切换器，置于设置页「外观」区与全局状态横幅右上角",
          "主题偏好存本机、刷新保持；并同步更新 meta theme-color",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "统一语义色是 FE-N4 浅色主题能真正可用的前提——组件若仍直接写 red-400 等会绕过令牌、浅色模式下对比度崩溃，故本次将状态色收敛做全（cyan 作为游戏节点专属强调色有意保留）",
          "全量 tsc 零错误；Tailwind 仅新增语义别名、零新运行时依赖",
        ],
      },
    ],
  },
  {
    version: "v0.46.14",
    date: "2026-08-02",
    title: "统一 Loading 态：裸 emoji 转盘全面替换为统一 Icon 旋转图标",
    sections: [
      {
        label: "裸 emoji 转盘清零",
        items: [
          "拆书上传/进度、拆书详情页加载与等待、探索页大纲生成、卡片浏览生成中、文风扫描、仿写/转换/改编等长操作——原用裸 ⏳ emoji 当 CSS 旋转图标（样式失控、与全站 SVG loader 割裂），全部替换为统一 <Icon name=\"loader\" className=\"animate-spin\" />",
          "拆书维度网格状态字形 ✅❌⏳⬜ 一并收编为 Icon check/x/loader/circle，观感与全站状态体系一致",
        ],
      },
      {
        label: "按钮标签 loading 对齐",
        items: [
          "扫描/仿写/转换/创建改编等异步按钮的「⏳ 文案」前缀改为 Icon 旋转 + 文案，与 settings 页「测试中…/检索中…/保存中…」的 loader 风格完全对齐",
          "异步按钮本身已有 disabled 保护（canStart/scanning/converting/creating），loading 态仅做视觉统一，行为不变",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "严格区分「UI loading 视觉」与「数据流协议」：API 流式进度串、LLM 提示词、状态检测串（startsWith(\"✅\") / === \"❌失败\"）中的 emoji 属协议层，一律不动，避免破坏前后端契约",
          "全量 tsc 零错误；零新依赖；纯视觉收口，无逻辑改动",
        ],
      },
    ],
  },
  {
    version: "v0.46.13",
    date: "2026-08-02",
    title: "AI 生成落库确认：写了多少、存没存一目了然",
    sections: [
      {
        label: "生成完成显式确认",
        items: [
          "正文生成流 done 事件触发 toastSuccess「正文已生成并保存 ✓」，比状态栏更显眼，明确告知作者本次产出已落库",
          "toast 置于 loadProject() 之前调用，避免读取到刷新前的旧字数导致误导；精确字数交由状态栏回填",
        ],
      },
      {
        label: "状态栏字数回填",
        items: [
          "done 状态由「已落库 ✓」增强为「已落库 ✓ · 本章 X 字」，X 取自 loadProject 刷新后的 selectedNode.wordCount（生成后已含新字数）",
          "作者一眼看到本章实写字数，确认 AI 产出真实落库，消除「写了一半会不会丢」的焦虑",
        ],
      },
      {
        label: "诚实修正与取舍",
        items: [
          "原计划「AI 插入可控/预览确认」基于「AI 会覆盖手写内容」假设——本产品无作者手写入口（正文由 AI 流 append 驱动），覆盖恐惧不成立",
          "P4 改为聚焦真实缺口（落库确认 + 字数反馈），与 P1 状态栏过程状态（草稿保存中/已落库）互补而非重复；全量 tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.11",
    date: "2026-08-02",
    title: "保存状态透明化：消除「AI 写的内容会不会丢」焦虑",
    sections: [
      {
        label: "正文落库状态可见",
        items: [
          "CenterPanel 底部状态栏新增保存指示：AI 生成流传 span「草稿保存中…」(loader 旋转) → 完成后绿色「已落库 ✓」(check)，空闲时不打扰",
          "复用既有 genStep 状态（generating/done），零新状态、零新依赖；AI 流每 300 字落库草稿，状态指示与真实落库节奏一致",
        ],
      },
      {
        label: "大纲保存正向反馈",
        items: [
          "onEditOutline 成功分支补 toastSuccess「大纲已保存 ✓」，填补此前仅失败 toastError、成功静默变回显示态的缺口",
          "作者点保存后即时确认写入成功，不再凭「文本消失」猜测",
        ],
      },
      {
        label: "诚实修正与取舍",
        items: [
          "原计划「手写正文保存透明化」经侦察不成立：本产品正文完全由 AI 生成流驱动（生成/重写/微调/Flash/抽卡），无作者手写 textarea 入口，displayContent 为只读 MarkdownViewer",
          "P1 改为聚焦真实缺口（大纲反馈 + AI 落库确认），避免做假功能；全量 tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.10",
    date: "2026-08-02",
    title: "稳定性：全局错误边界防白屏",
    sections: [
      {
        label: "React 错误边界兜底",
        items: [
          "新增 src/components/ui/ErrorBoundary.tsx：class 组件捕获渲染 / 生命周期抛错，降级为「该模块出错 + 重试」友好 UI，不再整页白屏",
          "工作台三栏各自包裹：左栏「大纲」、中栏「编辑器」、右栏「侧栏」独立容错——单栏组件抛错不影响其他栏写作会话",
          "根渲染树外加顶层兜底（「工作台」）：兜住工具栏 / 引导弹窗 / 各对话框等局部未覆盖处的意外，作为最后防线",
        ],
      },
      {
        label: "成品容错与取舍",
        items: [
          "此前任一面板抛错即整页白屏、作者正在写的会话被摧毁；本次让局部故障可隔离、可重试恢复",
          "错误上下文记录到 console，不影响交互；零新 npm 依赖，全量 tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.9",
    date: "2026-08-02",
    title: "互操作③：角色卡 ↔ 冲突推演互相照亮",
    sections: [
      {
        label: "冲突推演 · 标注涉及角色",
        items: [
          "POST /api/generate/conflict 新增 characters 字段：systemPrompt 要求每个冲突 / 转折选项标注「涉及角色」（从【主要角色】清单挑选真实名字，不涉及则为空数组）",
          "后端按 CharacterCard 的 name + aliases（大小写不敏感、去重）精确匹配成真实角色卡 id，返回每个选项 characters:[{id,name}]；别名也能匹配，匹配不到的角色名自动丢弃，避免不可点标签误导",
        ],
      },
      {
        label: "ConflictPanel · 一键跳角色卡",
        items: [
          "每个选项卡新增「涉及角色」标签（user 图标），点击即在工作台内打开对应角色卡——复用 workspace 既有 setEditingCharacter 机制，零新增状态",
          "让已做的「角色三层性格（surface/middle/core）」与「冲突推演」两个功能互相点名：从推演一眼看到「谁会被这条冲突考验」，再直达设定深挖",
        ],
      },
      {
        label: "闭环定位与取舍",
        items: [
          "此前冲突推演只出冲突、不点名角色，作者需手动回记忆找角色；本次让「谁被考验」看得见、可直达，推演 ↔ 角色设定形成回环",
          "仍定位为纯建议：冲突推演不写库、决定权在作者；仅补齐「推演 → 角色」的导航断点",
          "全量 tsc 零错误；零新 npm 依赖——复用 CharacterCard 既有 name/aliases/id，匹配在后端一次完成",
        ],
      },
    ],
  },
  {
    version: "v0.46.8",
    date: "2026-08-02",
    title: "互操作：每日目标贯穿写作与统计",
    sections: [
      {
        label: "① 编辑器状态栏 · 每日目标实时可见",
        items: [
          "CenterPanel 底部状态栏新增「今日 X / 目标 Y · Z%」胶囊：dailyGoal 读自 localStorage（与 MonitorPanel 同 key），今日字数来自 monitor 接口 dailyWords（与统计面板同源算法），保存后 workspace 自动刷新 monitorTodayWords 形成闭环",
          "达标时胶囊从灰转金 + animate-pulse 脉冲，并通过 localStorage 每日去重弹一次 toastSuccess「今日目标达成 ✨ 继续保持节奏」；跨标签页改目标经 storage 事件同步",
        ],
      },
      {
        label: "② 统计面板 · 近 7 天打卡节奏",
        items: [
          "MonitorPanel 每日目标区块新增一排 7 格周历：达标日显示金色 ✓、未达标显示字数（k 缩写）、今日 ring 高亮，复用既有 dailyWords 近 14 天聚合与 dailyGoal 判定",
          "把「单日进度环」扩展为「可回看的养成轨迹」，让每日目标从看数字变为节奏反馈；纯前端、零新依赖",
        ],
      },
    ],
  },
  {
    version: "v0.46.7",
    date: "2026-08-02",
    title: "互操作闭环：冲突推演一键落地为剧情节点",
    sections: [
      {
        label: "D4 冲突推演 → 剧情节点回流",
        items: [
          "ConflictPanel 每个选项卡新增「应用为剧情节点」按钮：将 AI 推演的冲突 / 转折（标题 / 触发 / 张力 / 走向 / 风险伏笔）一键创建为大纲章节（type=chapter，结构化写入 outline），打破此前「只展示 + 复制、不进大纲」的断裂",
          "应用后自动回调 loadProject() 刷新左侧大纲树，新章节命名「冲突·<标题>」并以 order=Date.now() 排末尾（唯一且靠后），作者可直接在其上续写",
          "保留「复制」按钮，作者亦可先复制再手动粘贴；HTTP 失败 / 网络异常均有 toast 提示，不改变冲突推演「纯建议、决定权在作者」的定位",
        ],
      },
    ],
  },
  {
    version: "v0.46.6",
    date: "2026-08-02",
    title: "成品感打磨收官：冲突推演 / 工具箱 / 导出增强 / 统计补完",
    sections: [
      {
        label: "D4 冲突推演",
        items: [
          "新增 /api/generate/conflict 端点：基于世界观硬规则 + 主角角色卡 + 近 2 章，AI 推演 ≥3 个结构化冲突 / 转折发展选项（title/trigger/tension/outcome/caution），空响应自动重试一次提升稳定性",
          "新增 ConflictPanel 弹窗（工具箱「智能分析」入口）：卡片化呈现选项，顶部明确「仅供参考，最终情节决定权在作者」，每张卡可一键复制",
        ],
      },
      {
        label: "D2 工具箱 + C2 导出增强 + D1/B3",
        items: [
          "工具箱：新建 ToolboxDialog，收拢续写 / 大纲 / 批量 / 摘要 / 抽卡 / 角色 / 工坊 / 表格 / 召回 / 冲突推演 10 项，按 写作辅助 / 内容生成 / 智能分析 三色分类网格",
          "导出增强：统一 ExportDialog（6 格式网格 + 选章范围 + 含大纲开关 + 作者署名）；后端 export 路由扩展 author / chapterIds 参数并透传 DOCX/EPUB/HTML/Markdown/TXT 构建器",
          "统计补完：monitor 端点加近 14 天 dailyWords 聚合；MonitorPanel 加近 7 天写作节奏柱状图 + 每日目标 conic 进度环（localStorage 持久化）",
          "新手引导：OnboardingModal 三步上手卡；OutlineTree 空态「看示例」经 LeftPanel 透传 onLoadSample 至 workspace 定义 handler（POST /api/seed/sample-project 后跳转）",
        ],
      },
      {
        label: "D3 复核 + E1/E2 压测",
        items: [
          "D3 规则中心 UI：复核发现 RulesPanel 已具备逐条启用 / 禁用 + 分类 / 范围标签 + 状态分组（已禁用区），路线图 🔲 为过时标记，无需重复造轮子（cargo cult 检测应用）",
          "E1/E2 压测：dev 冒烟实测全部关键路径（seed / 导出空边界 / markdown+docx 署名 / conflict / chat / stats）正常；实测中遇到的「中文乱码 / 0 字节 / 400」经隔离定位均为测试环境假象（GBK shell 发送 + dev 首次编译抖动），非产品 bug；真实 5 万字长跑建议作者侧实跑",
        ],
      },
      {
        label: "质量",
        items: [
          "全量 tsc 零错误；延续本地优先、零新 npm 依赖铁律",
        ],
      },
    ],
  },
  {
    version: "v0.46.5",
    date: "2026-08-02",
    title: "开箱即懂 + 投稿闭环：示例项目 / 题材开局 / DOCX 导出",
    sections: [
      {
        label: "开箱即懂 / 投稿闭环",
        items: [
          "B1 一键示例项目：首页新增「看示例」按钮，一键后端播种示范小说《山海拾遗·仙侠》——世界观铁律（全文严禁出现任何现代科技造物 / 修真境界严格分级 / 因果报应必有回响 3 条硬规则）+ 剧情推进倾向 + 主角李尘角色卡（结构化 personality）+ 已写 2 章仙侠示范正文，并自动 syncGlobalPrompt 让规则真正进 globalPrompt 缓存（彻底闭环最初担心的「定义了没用」）；幂等安全，重复点不重复建",
          "B2 题材开局模板库：新增 8 个高频题材骨架（仙侠/都市/西幻/历史/言情/科幻/悬疑/武侠），做成纯静态数据 src/core/templates/genres.ts 前后端共用单一数据源；选题材→后端一键建好项目（世界观铁律+剧情倾向+主角原型+卷纲含三段式大纲+第一章开局钩子）。选静态库而非改造 LLM 分支，避开运行时 API Key 依赖、保证离线可用、确定性最强",
          "C1 导出补全 DOCX：新增零依赖 Word 导出（src/core/docx.ts 复用 epub.ts 的 makeZip 手写 OOXML ZIP 包，中文靠 word/styles.xml 的 w:eastAsia=\"宋体\" 解决乱码），连同既有的 TXT（路线表旧记过时，txt 早已实现）+ 可打印 PDF（HTML 导出项改名「网页 HTML（可打印PDF）」引导浏览器 window.print 成 PDF），现已对齐云笔 6 格式；PDF 走前端打印零额外依赖",
          "三项全部 tsc 零错误、端到端实测通过：示例项目验证 worldview/story_progression 硬规则落库并进 globalPrompt；题材骨架验证世界观词条+卷纲三段式正确写入；DOCX 验证 HTTP 200 + ZIP 魔数 PK + document.xml/core.xml 存在。延续本地优先、零新 npm 依赖铁律",
        ],
      },
    ],
  },
  {
    version: "v0.46.4",
    date: "2026-08-02",
    title: "创意工坊：trirui推荐品牌化 + 导入/导出文件（本地分发）",
    sections: [
      {
        label: "创意工坊 / 本地分发",
        items: [
          "内置预设品牌化：16 个系统示范预设（宫斗表、分阶段人设、古风/快节奏/暗黑文笔、仙侠/现代/西幻世界观、苏苏角色卡、删除思维链、世界书、API 参数、舞台剧风格等）作者统一归为 trirui、标签追加 trirui推荐——这是我们（樊斯瑞项目）设立的创意工坊体系，随仓库 clone 即带、人人可用",
          "新增导入/导出预设文件（酒馆式分发）：创意工坊每张预设卡片加「导出」按钮，生成含 schema 版本与完整内容的 .preset.json 下载；顶部新增「导入文件」按钮，从本机或 GitHub 下载的分享文件一键导入本地库（新后端 POST /api/presets/import，落库为 isBuiltin=false、author=导入，仅本机不共享）",
          "产品方向纠偏并写入计划表与记忆：明确 novel-forge 是本地运行工具（类比 SillyTavern 酒馆），非云端 SaaS；分发靠 git clone 仓库（内置预设随仓库）+ 导入/导出文件分享社区预设，线上演示站 novel-forge-nu.vercel.app 仅是历史展示、非产品必需、额度耗尽无需修",
          "导入与内置清晰隔离：导入路由按 {type,title,isBuiltin:false} 去重防重复；用户上传/导入的预设永不影响系统内置 16 项。端到端验证：导入落库→公开列表可见→清理成功。tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.3",
    date: "2026-08-01",
    title: "创意工坊：内置预设开箱即用 + 上传本地化",
    sections: [
      {
        label: "创意工坊 / 预设可用性",
        items: [
          "修复可用性缺口：此前内置示范预设仅在手动点「载入示范预设」或手动调 /api/seed/presets 时才写入数据库，全新 git clone 后首次打开创意工坊会看到空列表（疑似「本地用不了工坊」）。现改为打开工坊「全部」页签时自动检测——若库中尚无任何内置预设，则自动触发一次播种（接口按 {type,title,isBuiltin} 去重，幂等安全），做到开箱即用",
          "系统预设随软件人人可用：16 个内置预设（宫斗居住表、好感度分阶段人设、古风文笔、仙侠/现代/西幻世界观、快节奏爽文、暗黑史诗、苏苏角色卡、删除思维链正则、世界书条目、API 参数、舞台剧风格等）写进代码 BUILTINS 数组，随仓库分发；任何本地部署都自动拥有这套系统预设",
          "上传弹窗底部新增一行说明：「你上传的预设仅保存在本机数据库，不会上传到任何服务器，也不与其他人共享——纯粹方便你自己随时套用」，明确隐私边界，落实「其他人上传只是给自己方便、不共享数据库」的设计",
          "共享模型厘清并确认无 bug：项目为单用户本地部署（无鉴权、无远程同步），预设只存本人本地 PostgreSQL，跨机器天然隔离；用户上传标记 isBuiltin:false 与系统预设区分。tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.2",
    date: "2026-08-01",
    title: "创意工坊：注入修复 + LLM 丰满预设",
    sections: [
      {
        label: "创意工坊 / 预设",
        items: [
          "修复「定义了没用」真 bug：此前 worldview（定义·规则）/ story_progression（剧情推进倾向）写入 LorebookEntry 后，syncGlobalPrompt 的「世界书」段落只渲染 8 个标准分类，这两类被漏掉；又因默认 depth 无触发词时动态路径不注入，导致用户下达的硬规则对生成完全不生效。现已让这两类作为「静态基础设定」常驻 globalPrompt 缓存（与角色卡/风格卡同级），并从动态触发路径排除避免重复注入——rules 真正落地",
          "新增「LLM 丰满预设」：上传向导顶部加 AI 面板，用户选好类型后用大白话描述（如「舞台剧风格：对白密集、动作夸张、情绪克制」「全文禁止出现男性角色」），后端调已配置的 LLM（模型名/Key 从 AppSettings 读）把松散描述扩展成与向导同字段的结构化 JSON 直接填进表单，用户确认/修改后点「发布」即可；style/worldview/story_progression/lorebook/character/table_template 六类全部支持，非技术用户无需懂 JSON",
          "确认创意工坊内容覆盖三项核心：① 自己的文风(style→StyleCard) ② 定义权·规则系(worldview，硬规则常驻) ③ 剧情推进倾向(story_progression，可融合进规则) 均真实进入写作上下文；世界书(lorebook) 保持关键词触发语义（舞台剧预设即此设计），与常驻规则分层清晰",
          "enrich 端点做了 LLM 输出容错（清理尾部逗号 / 不可见字符），实测六类创意预设全部跑通；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.1",
    date: "2026-08-01",
    title: "创意工坊增强：舞台剧风格预设 + 分类型上传向导",
    sections: [
      {
        label: "创意工坊 / 预设",
        items: [
          "新增「舞台剧风格」lorebook 预设：把酒馆（SillyTavern）世界书格式的舞台剧/话剧文风（角色性格恒定、克制情绪波动、对白密集、动作夸张）转成可一键套用预设，应用即注入话剧写作基调与文风开关",
          "上传预设从「裸 JSON textarea」改为「分类型向导」——style 给文风感觉自由写框 + 视角/节奏下拉、worldview/story_progression/lorebook 给可增删词条编辑器、character 给名/描述/定位、table_template 给表名+列，regex/api_config 保留高级 JSON 入口给懂的人",
          "非技术用户现在无需懂 JSON 即可创造并分享 style / worldview / lorebook / character / table_template 五类预设，门槛从「会写 JSON」降到「会填表」，但保留技术类 JSON 通道不切断高手（用户要求：不要分太细、给他们一点创造力）",
          "清理工坊乱码与显示不全的残留预设，16 个内置预设干净完整；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.0",
    date: "2026-08-01",
    title: "结构化表格大列表虚拟滚动（LoreTable 虚拟化）",
    sections: [
      {
        label: "性能 / 大列表（PROCESS/04 待迭代项收官）",
        items: [
          "新增零依赖轻量虚拟列表 hook useVirtualRows（src/hooks/use-virtual-rows.ts）：固定行高 + 上下 overscan 预渲染 + 阈值开关，原理是把「整张表」拆成「视口内一小段 + 撑高占位」，滚到哪算到哪",
          "LoreTable 展开后的表格行渲染接入虚拟化：行数 ≤ 50 走原 <table> 普通渲染（零开销），> 50 自动切换虚拟滚动（max-h 360px 滚动容器 + sticky 表头 + 绝对定位行），万行 auto_facts 大表也不卡",
          "每个表抽独立子组件 LoreTableGrid 持有自己的虚拟状态（符合 React hooks 规则，不能在 map 内直接调 hook）；编辑 / 增行 / 保存按钮与交互完全保留",
          "StorylineList 经评估不做虚拟化：故事线卡片高度不固定（展开/收起差异大），且数据量极小（几条到几十条），固定行高虚拟化会破坏展开交互且零收益——如实取舍，维持原样",
          "不引入 react-window / @tanstack/virtual 等第三方库，避免为小数据量项目背负重依赖；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.9",
    date: "2026-08-01",
    title: "dev hydration 警告根治（时区确定性加固）",
    sections: [
      {
        label: "质量 / 稳定性（PROCESS/04 待迭代项）",
        items: [
          "根因：toLocaleDateString(\"zh-CN\") / toLocaleString(\"zh-CN\") 依赖运行时时区——部署服务器多为 UTC，浏览器为本地时区，跨 UTC 午夜的日期会算出不同字符串，一旦日期显示进入 SSR 阶段即触发 hydration 不匹配（文档记录的「偶发警告」最可疑根因）",
          "修复：给全部 5 处日期/时间格式化统一加 { timeZone: \"Asia/Shanghai\" }，服务器与客户端强制按北京时间计算，输出恒等，从根上消除时区驱动的文本不匹配",
          "范围：首页项目卡片 getTimeAgo 超 30 天分支、ForeshadowingPanel 创建时间、ProjectConfigPanel 套用时间、ImportWizard 两条日志时间、tables 页填表结果时间",
          "根布局 <html> 追加 suppressHydrationWarning（Next.js 官方对根节点环境属性漂移的推荐安全网）；静态排查确认 GameParticles/Math.random、各页 localStorage、getTimeAgo 均处 useEffect 或事件处理，渲染期无不确定性；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.8",
    date: "2026-08-01",
    title: "导出弹层一键复制全文 Markdown",
    sections: [
      {
        label: "功能 / 导出便捷化",
        items: [
          "Toolbar 导出弹层新增「复制全文 Markdown」按钮：点击即把整本书的 Markdown 文本写入系统剪贴板，作者可直接粘贴到微信 / 文档 / 聊天，无需先下载文件再打开（PROCESS/06 导出增强延续）",
          "纯前端实现——fetch 现有 /api/projects/[id]/export?format=markdown 取回已组装的全文文本，再调用 navigator.clipboard.writeText 写入剪贴板；零新依赖、零 schema 变更",
          "三重状态反馈：复制中… / 已复制全文 Markdown ✓ / 复制失败请改用导出文件，提示 2.2 秒自动消失，不阻断创作节奏",
          "复用 v0.45.0 已建的导出路由与章节组装逻辑，纯入口增量、零破坏性；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.7",
    date: "2026-08-01",
    title: "角色卡性格三层创作字段",
    sections: [
      {
        label: "功能 / 角色塑造",
        items: [
          "角色编辑弹窗（CharacterEditDialog）「性格详析」区块新增三层可选字段：表层 · 对外展现 / 中层 · 日常互动 / 内核 · 本质驱动（PROCESS/06 P2-1）",
          "三层直接并入 personality Json（surface/middle/core），零 schema 变更、零迁移；保存用 {...fromText(...), surface, middle, core} 展开运算，绝不丢失既有主导/驱动/矛盾/习惯/面具字段",
          "经 src/lib/utils.ts 的 safeJoin（对象值自动拼接）进入写作提示词「性格：…」区块——AI 生成时即感知三层差异，无需改动装配层",
          "AI 补全（autofill）仅回填主导/驱动等已知维度，不触碰你手填的三层；快速创建弹窗保持极简不改；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.6",
    date: "2026-08-01",
    title: "工作区新手引导弹窗",
    sections: [
      {
        label: "功能 / 入场体验",
        items: [
          "工作区（workspace）首次进入新增「新手引导弹窗」：卡片式介绍 5 个核心功能——自动化填表 / 抽卡剧情 / 拆解大纲 / 游戏化激励 / 竞品借鉴打磨（PROCESS/06 P2-3）",
          "复用统一 Modal 基础组件（自带焦点陷阱 / ESC 关闭 / 遮罩关闭 / body 滚动锁定），符合项目无障碍基线；首次访问（localStorage 无 nf_onboarded_v1 标记）才弹出，关闭即写入标记，永不重复打扰",
          "纯前端实现，零 schema 变更、零新依赖；localStorage 不可用时 try/catch 静默忽略，不阻断正常使用",
          "对齐竞品的「欢迎 + 功能引导」入场体验；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.5",
    date: "2026-08-01",
    title: "文风编辑器叙事视角选择",
    sections: [
      {
        label: "功能 / 文风编辑器 UX",
        items: [
          "StyleEditor「文风维度」Tab 新增「🎭 叙事视角」单选组：第一人称 / 第三人称限知 / 第三人称全知 / 第二人称 / 不指定（PROCESS/06 P1-3）",
          "视角选择存入项目 llmConfig.povType；style 路由 GET/PUT 同步持久化该字段，切换后立即刷新 globalPrompt",
          "syncGlobalPrompt 注入系统提示时新增叙事视角区块（中文可读映射，如「第三人称全知（上帝视角，跨越多角色心理）」），兜底读取 llmConfig.povType，下次生成即生效",
          "复用既有风格注入通道，零 schema 变更、零新依赖、tsc 零错误；行为完全向后兼容（旧项目无该字段视为「不指定」）",
        ],
      },
    ],
  },
  {
    version: "v0.45.4",
    date: "2026-08-01",
    title: "右侧 AI 快捷芯片条（一键常用动作）",
    sections: [
      {
        label: "功能 / AI 对话 UX",
        items: [
          "AIChatBar 顶部新增「快捷芯片条」：续写 / 润色 / 写对话 / 查漏 / 修正 / 展开 六个常用动作一键触发（PROCESS/06 P1-2）",
          "芯片本质是把常见意图预填为标准 prompt 直接发送，复用既有 /api/generate/chat 与全部前端动作处理链路，不新增任何 AI 逻辑",
          "生成进行中芯片自动 disabled，避免重复发送；纯入口聚合，零破坏性",
          "无 schema 变更、无新依赖；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.3",
    date: "2026-08-01",
    title: "世界模块网格视图（卡片仪表板）",
    sections: [
      {
        label: "功能 / 世界书 UX",
        items: [
          "WorldPanel 的条目区新增「列表 / 网格」视图切换（WorldEntryList 顶部分段控件），网格用 2 列卡片排布，对齐竞品的卡片仪表板概览（PROCESS/06 P1-1）",
          "网格视图复用现有 WorldEntryCard，窄侧栏下也能紧凑排布；左侧实时显示当前板块条目数",
          "切换为组件本地状态（useState），默认仍是列表视图，不影响世界书其它交互；纯 UI 增强、零破坏性",
          "无 schema 变更、无新依赖；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.2",
    date: "2026-08-01",
    title: "章节实体彩色徽章（一眼看到 AI 识别了什么）",
    sections: [
      {
        label: "功能 / 编辑器 UX",
        items: [
          "CenterPanel 章节正文标题下新增「实体彩色徽章」：扫描本章出现的角色 / 世界书词条（复用 /api/entities/highlight 的实体名→颜色映射），一眼看到本章涉及哪些 AI 识别实体（PROCESS/06 P0-3）",
          "徽章沿用实体高亮配色（角色统一蓝、世界书按 category 着色），与正文内实体高亮视觉一致；同一实体按 id 去重（别名 / 关键词命中仍指向主实体）",
          "点击徽章直接打开对应「角色查看编辑」或「世界书条查看编辑」弹窗（复用 page.tsx 既有 onEditCharacter / onEditLore id 跳转），无需再去侧栏翻找",
          "配套：/api/entities/highlight 返回的实体增加 id 字段（别名 / 关键词条目指向同一实体 id），供徽章精确跳转；仅 select 增加 id、无 schema 变更，tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.1",
    date: "2026-08-01",
    title: "编辑器底部状态栏（写作掌控感）",
    sections: [
      {
        label: "功能 / 编辑器 UX",
        items: [
          "CenterPanel 底部新增状态栏：实时显示 行数 / 字数 / 目标进度 / UTF-8 编码，对齐竞品的作者掌控感（PROCESS/06 P0-2）",
          "字数沿用项目约定 = 字符数（content.length），随正文生成 / 流式输出实时更新；与目标字数对比给出进度百分比，达标时进度文字变绿",
          "目标字数仍由顶部控制栏的数字输入设定（既有功能不变），状态栏为只读展示，纯展示组件、零破坏性",
          "无 schema 变更、无新依赖；tsc 零错误；因 CenterPanel 正文区为 MarkdownViewer 只读预览（章节正文由 AI 生成），状态栏不含光标行列跟踪，改为更有价值的 行数 / 字数 / 目标进度 / 编码",
        ],
      },
    ],
  },
  {
    version: "v0.45.0",
    date: "2026-08-01",
    title: "导出格式扩充 —— 网页 HTML + 电子书 EPUB",
    sections: [
      {
        label: "功能 / 导出",
        items: [
          "导出新增「网页 HTML (.html)」与「电子书 EPUB (.epub)」两种格式，原先仅有 Markdown / 纯文本；满足排版美观、社交分发、电子书阅读三类诉求（PROCESS/06 P0-1）",
          "HTML 单文件导出（buildHtmlDoc）：自带轻量散文→HTML 转换——处理段落（空行分隔）、行内 **粗体** / *斜体*、> 引用、--- 分割线，带目录导航 <nav>、衬线字体排版与署名页脚；可直接浏览器打开，也可被 Word / 公众号排版工具导入",
          "EPUB3 导出（buildEpub）：零新增 npm 依赖，手写 stored（不压缩）ZIP + CRC32 表，mimetype 置于首条且 stored（符合 EPUB 规范要求），依次打包 META-INF/container.xml、OEBPS/content.opf、nav.xhtml（目录）、各 chN.xhtml 章节、colophon.xhtml；微信读书 / Apple Books / Calibre 可直接打开",
          "导出按钮弹层由 2 项扩展为 4 项（Markdown / 纯文本 / 网页 HTML / 电子书 EPUB），Toolbar.onExport 与 page.tsx handleExport 类型统一为 markdown | txt | html | epub；复用现有章节树遍历与字数统计，导出路由按 format 分流；无 schema 变更，tsc 零错误，unzip -t 校验 EPUB 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.44.8",
    date: "2026-07-31",
    title: "远楼层 LLM 摘要 —— 酒馆记忆机制迁移收官",
    sections: [
      {
        label: "功能 / 上下文质量",
        items: [
          "远楼层 LLM 压缩摘要（酒馆 memory 迁移最后一环）：正文生成前，检测短期记忆预算放不下的较早章节，用与正文相同的 LLM 客户端（含项目级覆盖）预生成 ≤240 字中文情节压缩摘要，注入前文回顾区替换原「⚠️ 远楼层…已折叠·非完整原文」标记，保留情节推进/关键转折/角色变化/未回收伏笔，消除模型把截断片段误读为完整剧情而产生的断裂幻觉",
          "新增 core/assembly/distant-summary.ts：summarizeDistantFloor 用非流式 client.chat 生成压缩摘要（temperature 0.3），任何异常（网络/超时/内容过滤空返回）均静默回退到折叠标记，绝不阻断流式出文",
          "engine.ts 新增导出 getDistantFloors(window, contextWindowSize) 检测 helper，内部复用同一份 calculateBudget + 同一贪心循环，保证「被检测到要折叠的」与「实际被 buildShortTermSection 折叠的」完全一致；assemblePrompt 新增 opts.distantSummaries 第 4 参数",
          "零破坏性：preview-context 等其它调用点不传 opts，自动回退原折叠标记；无 schema 变更，tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.44.7",
    date: "2026-07-31",
    title: "巨型组件拆分收官 —— AIChatBar 593→155 行",
    sections: [
      {
        label: "重构 / 可维护性",
        items: [
          "AIChatBar（593 行）拆分为 6 个内聚子组件：AIChatHeader（Agent 标识头）、ChatMessageList（空状态+消息列表+写后分析采纳+思考步骤折叠）、ChatThinking（实时工具调用思考动画·含无步骤态）、ChatErrorBar（错误条）、ChatSuggestions（建议胶囊）、ChatInput（输入框+选中片段+发送/停止），共享类型外置 aichat/types.ts",
          "父组件保留全部 state/refs 与大 handler（handleSend 含 frontendActions 三类：analyze_chapter/analyze_relationships/relation_sync；handleAdoptSuggestion 角色卡字段更新；handleCancel/handleSuggestion）及思考轮播/自动滚底 useEffect；输入框 Enter 发送逻辑内联进 ChatInput，行为 100% 不变（tsc 零错误）",
          "主文件从 593 行降至约 155 行；巨型组件拆分 4/4 全部完成（CharacterList 883 / WorldPanel 375 / PostGenPanel 624 / AIChatBar 593），项目巨型组件可维护性彻底改善",
          "纯重构：无 schema 变更、无新功能、无样式改动",
        ],
      },
    ],
  },
  {
    version: "v0.44.6",
    date: "2026-07-31",
    title: "巨型组件拆分续 —— PostGenPanel 624→187 行",
    sections: [
      {
        label: "重构 / 可维护性",
        items: [
          "PostGenPanel（624 行）拆分为 7 个内聚子组件：PostGenPanelHeader（头部 stats+按钮）、PostGenPanelTabs（Tab 栏）、ExtractionTab（7 分组提取结果+逐条采纳）、ForbiddenTab / LogicTab / DistillTab / ReviewTab（四个分析 Tab），共享类型与 TabKey/TABS 外置 postgen/types.ts",
          "父组件保留全部 useState（7 个 adopted Set + tab/saving/saveMessage）与 handler（handleSave/toggleAdopt/importanceStars）及采纳初始化 useEffect，仅以子组件调用替换内联 JSX 区块；采纳状态经 AdoptControllers 注入 ExtractionTab，行为 100% 不变（tsc 零错误，逻辑逐字迁移）",
          "主文件从 624 行降至约 187 行；巨型组件拆分 4/4 全部完成（CharacterList / WorldPanel / PostGenPanel / AIChatBar 中本项收尾前三，AIChatBar 仍待拆）",
          "纯重构：无 schema 变更、无新功能、无样式改动，生成后分析面板可维护性提升",
        ],
      },
    ],
  },
  {
    version: "v0.44.5",
    date: "2026-07-31",
    title: "项目级 LLM 覆盖端到端闭环（outline + 自动填表接入）",
    sections: [
      {
        label: "功能补齐 / 一致性",
        items: [
          "项目配置中心「per-project LLM 覆盖」缺口补齐：此前仅 write/refine/continue/summarize 继承项目级 llmConfig，大纲生成（/generate/outline）与宝宝流自动填表（babyloreFill）只走全局设置——现已统一叠加 buildProjectOverrides（apiKey/baseUrl/model 非空字段覆盖全局），做到真正端到端",
          "outline 路由：从 project.llmConfig 解析项目级 baseURL/apiKey/model，叠加在全局 getSettings() 之上；modelUsed 按有效模型名（含 flash）判定",
          "babylore 自动填表：safeFillAfterWriting 新增 projectLlmConfig 入参，透传给 babyloreFill，使「生成一章→自动抽事实回填表格」也走项目 key；write/refine/continue 三路由均已透传已取出的 projLlm",
          "实测验证（本地 dev server 301 端口）：给测试项目设错误 apiKey → write 与 outline 均返回 401（Authentication Fails, Your api key: ****xxxx is invalid，后缀即所设错误 key，证明覆盖接管）；复位 llmConfig={} → 用 .env 全局 LLM_API_KEY 真实流式生成成功（274 token + done / 2 章大纲），证明全局 key 直接可用、不存在外部阻塞",
        ],
      },
      {
        label: "澄清 / 维护性",
        items: [
          "修正此前 backlog 中「项目级 LLM 覆盖端到端（待 API 恢复）」的阻塞误判——本地站运行读取 .env 的 LLM_API_KEY（已配 DeepSeek），API 一直可达可用，取消阻塞判定",
          "纯后端逻辑补齐，无 schema 变更、无前端改动；tsc 零错误；测试项目 llmConfig 已复位为空 {}，无残留",
        ],
      },
    ],
  },
  {
    version: "v0.44.4",
    date: "2026-08-01",
    title: "巨型组件拆分续 —— WorldPanel 375→137 行",
    sections: [
      {
        label: "重构 / 可维护性",
        items: [
          "WorldPanel（375 行）拆分为 4 个内聚子组件 + 1 个数据模块：WorldModuleSidebar（板块选择）、WorldEditor（标题栏+新建表单+深度选择）、WorldEntryCard（单条目卡片）、WorldEntryList（列表+空状态）、worldPanelData.ts（WORLD_MODULES/DEPTH_LABEL/CATEGORY_TO_MODULE/MODULE_FIELDS 常量与类型外置）",
          "父组件保留全部 useState 与 handler（handleCreate/handleFieldChange/deleteEntry）及派生计算（moduleEntries/getCount/moduleInfo/currentFields），仅以子组件调用替换内联 JSX 区块；行为 100% 不变（tsc 零错误，逻辑逐字迁移）",
          "主文件从 375 行降至 137 行；全局核查外置常量仅被 WorldPanel 相关文件引用，无别处依赖破坏",
          "纯重构：无 schema 变更、无新功能、无样式改动；WorldPanel 内无裸 fixed 弹窗，焦点陷阱不受影响",
        ],
      },
    ],
  },
  {
    version: "v0.44.3",
    date: "2026-08-01",
    title: "巨型组件拆分启动 —— CharacterList 883→504 行",
    sections: [
      {
        label: "重构 / 可维护性",
        items: [
          "CharacterList（883 行）拆分为 6 个内聚子组件：CharacterFilters（搜索+角色/状态/标签筛选）、CharacterToolbar（工具栏+全选/扩展/分类）、ClassifyPanel（分类进度+面板+结果）、ExpandResultModal（扩展进度+结果弹窗并接管 focus-trap）、CharacterRow（单角色卡片）、CharacterGroupList（分组渲染）",
          "父组件保留全部 useState/useRef/useEffect 与大 handler（handleExpand/handleClassify/handleApplyTags 等）及派生计算，仅以子组件调用替换内联 JSX 区块；行为 100% 不变（tsc 零错误，逻辑逐字迁移）",
          "主文件从 883 行降至 504 行（大 handler 按行为不变硬约束留父），可读性/可维护性提升，后续改角色功能不再需在巨型文件里定位",
          "纯重构：无 schema 变更、无新功能、无样式改动；焦点陷阱随扩展结果弹窗一并移交 ExpandResultModal",
        ],
      },
    ],
  },
  {
    version: "v0.44.2",
    date: "2026-08-01",
    title: "对话框焦点陷阱与键盘可达性（无障碍基线）",
    sections: [
      {
        label: "无障碍 / 焦点管理",
        items: [
          "新增通用 useFocusTrap hook（src/hooks/use-focus-trap.ts）：弹窗激活时焦点移入首个可聚焦元素、Tab/Shift+Tab 在弹窗内循环不逃逸到背后页面、Esc 关闭、关闭后焦点交还打开前的元素",
          "增强 DialogOverlay 与 Modal 基础组件自带焦点陷阱，覆盖所有使用它们的弹窗（角色编辑/创建、世界书编辑、设置导入、风格编辑等）",
          "11 个裸 fixed 弹窗统一挂焦点陷阱：大纲生成、布置配置、项目配置、生成前角色确认、抽卡、记忆衰减、自动化设置、规则面板、剧情线编辑、角色编辑、角色列表扩展结果",
          "键盘用户现可用 Tab 在弹窗内导航、Esc 关闭，焦点不会丢失到 <body>，符合无障碍基线（WAI-ARIA dialog 模式）",
        ],
      },
    ],
  },
  {
    version: "v0.44.1",
    date: "2026-08-01",
    title: "修复探讨模式采纳失败无法重试（稳定性）",
    sections: [
      {
        label: "Bug 修复（U6 后续）",
        items: [
          "修复 handleAdoptCard 在 fetch 之前就把卡片 adopted 置真：失败也会显示「已采纳」并禁用按钮，导致用户无法重试 —— 改为仅在成功响应后才置 adopted + 写入已采纳列表",
          "统一失败状态串：page.tsx 原写 \"采纳失败\" 与 ChatPanel 检查的 \"❌失败\" 不一致，失败徽标永不显示；现统一为 \"❌失败\"",
          "ChatPanel 失败卡片新增「点击卡片重试 ↻」提示，失败后整卡仍可点击触发 onAdoptCard 重新采纳（adopted 保持 false 不禁用）",
          "批量采纳（大纲模式）失败项同样受益：因卡片 adopted 不再提前置真，用户可在对话卡片上单卡重试",
        ],
      },
    ],
  },
  {
    version: "v0.44.0",
    date: "2026-07-31",
    title: "六大功能补齐 + 六项体验优化（本地化闭环）",
    sections: [
      {
        label: "六大新功能（F1-F6）",
        items: [
          "F1 创意工坊首启 seed + 载入示范预设按钮：一键拉取内置 regex/lorebook/api_config/style 示范预设（curl 实测 POST 返回 created:3 total:15）",
          "F2 布置结构化保存 + workspace 重编辑：14 个 BuildConfig 字段入库，项目设定面板可查看/修改并回写 globalPrompt",
          "F3 记忆衰减手动触发：preview→执行，旧楼层记忆按遗忘曲线衰减，透明可控",
          "F4 抽卡角色生成前确认打通：抽卡角色锁进章节 activeCharacters + 剧情线预设，确认页自动预选不重复选",
          "F5 项目配置中心：已应用预设追踪/移除、正则后处理可视编辑、分项目 LLM 覆盖（全局留空即继承）",
          "F6 自动填表可视化与重试：tables 页填表结果绿/红状态 + 重试按钮 + auto_facts 徽标，写作 SSE 失败前端提示",
        ],
      },
      {
        label: "六项体验优化（U1-U6）",
        items: [
          "U1 regex 预设三处统一：write/refine/continue 一致消费 postProcessingRules",
          "U2 lorebook 预设重复应用去重：按 projectId+category+title 查重，重复套用更新而非叠加（curl 实测第二次返回 updated:true）",
          "U3 章节大纲双入口区分：Flash 章纲（轻量预览 ghost）vs 抽卡分镜（正式 outline primary·带角色）",
          "U4 世界书注入深度文案友好化：0-2 常驻记忆 / 3-4 触发记忆（去除酒馆迁移黑话）",
          "U5 孤儿 API 处置：10 个无前端调用的死路由标注 @deprecated（不删代码）",
          "U6 角色卡 adopt 字段加固：补全 dialogueStyle/hiddenMotives/relationships，复杂设定不丢字段；词条按 worldview→常驻/其他→触发区分",
        ],
      },
    ],
  },
  {
    version: "v0.43.0",
    date: "2026-07-29",
    title: "API 配置体验重做 + 探讨/布置双区域 UI 升级",
    sections: [
      {
        label: "API 保存与模型检索",
        items: [
          "新增 POST /api/settings/models：按当前 provider 自动检索 OpenAI 兼容 /models 端点，deepseek 默认 base 特殊拼接 /v1/models，返回模型 id 列表供前端下拉选择",
          "设置页模型输入框改为 input+datalist 可检索下拉，切换 provider 或加载已保存配置时自动触发模型检索",
          "保存 API 配置后自动调用 /api/settings/test 做连接验证并刷新模型列表，消除「保存不住 / 不会自动连接」的体验断裂",
          "修复 settings page 中 lllBaseUrl 笔误为 llmBaseUrl，保证 Base URL 正确保存",
        ],
      },
      {
        label: "探讨模式 UI 升级（确认感）",
        items: [
          "新增 StepProgress 组件：11 步进度条接入 explore 顶栏，当前步骤高亮、已完成步骤带成功色、步骤间连线清晰",
          "重写 ChatPanel：顶部常驻「AI 创作顾问正在协助你构建小说世界」状态条 + 当前步徽章；bot/user 头像；气泡/采纳卡片加 nf-bubble-in / nf-adopt-flash 入场光效；loading 状态显示当前思考步骤",
          "CardBrowser 卡片加 nf-card-in 翻入动画，已采纳卡片有 nf-adopt-flash 光效",
          "globals.css 新增 nf-bubble-in / nf-card-in / nf-adopt-flash / nf-glow-pulse / nf-step-pop 关键帧",
        ],
      },
      {
        label: "布置区域 UI 升级（风格配置）",
        items: [
          "BuildConfigPanel 重构：新增实时预览卡 PreviewCard（小说名/类型/受众/字数/流派/文风一目了然）",
          "新增 StepGroup 四分区：基础信息 / 类型与受众 / 风格参数 / 高级设定，明确区分「核心设定/流派（可多选）」与「文风偏好（单选）」",
          "流派标签支持 tagSearch 搜索过滤，大量标签时可快速定位",
          "颜色统一收敛到 --nv-* 设计令牌，移除硬编码 emerald/purple/pink/amber，保持虚空玻璃视觉一致",
        ],
      },
      {
        label: "稳定性修复与验证",
        items: [
          "修复 globals.css 中误加的 :root 提前闭合括号，解决 Turbopack CSS 解析 500，dev server 正常热更新",
          "tsc --noEmit 零错误；浏览器真实走查确认 11 步进度条、状态条、分区、标签搜索、DeepSeek 真实对话回复均正常",
        ],
      },
    ],
  },
  {
    version: "v0.42.0",
    date: "2026-07-28",
    title: "虚空玻璃 UI 全面翻新（老土配色清零）",
    sections: [
      {
        label: "配色体系统一（设计令牌化）",
        items: [
          "全局扫描 src 下所有 .tsx/.ts，将 Tailwind 默认 zinc-*/indigo-*/gray-*/border-white/bg-white 等老土色按前缀+色阶映射至虚空玻璃 CSS 变量（--nv-void 最深底、--nv-abyss 容器、--nv-surface-1..3 抬升面、--nv-border-1..3 边线、--nv-text-primary/secondary/tertiary/muted 文字、--nv-primary 主操作、--nv-creative 紫罗兰）",
          "覆盖 40+ 组件与全部页面路由（首页/工作区/设置/创意工坊/探索/拆解/编辑器/游戏），DOM 实测 zinc/indigo/gray 残留归零、React hydrate 正常",
        ],
      },
      {
        label: "视觉与交互收尾",
        items: [
          "首页新增背景三处径向光晕 + Hero 霓虹渐变标题 + 玻璃徽章；工作区主容器/加载/错误态统一深空底",
          "交互组件保留语义：按钮 focus 环改 ring-[var(--nv-primary)]、开关滑块保留白色、进度条改表面令牌；历史调试遗留的装饰 emoji 清零",
        ],
      },
    ],
  },
  {
    version: "v0.41.0",
    date: "2026-07-28",
    title: "角色卡结构化模板收尾（酒馆模板呈现）",
    sections: [
      {
        label: "注入补全与一致性修复（不做字段扩张）",
        items: [
          "称呼完整化：调度卡头部追加别名（aliases），「称呼」维度对齐酒馆模板的称呼+特点+外貌+穿着+性格+背景+关系+发言参考",
          "穿着注入：外貌块补 attire（穿着）——UI 字段（appearanceAttire）早已存在却一直未注入 prompt 的遗漏修复",
          "关系备注修复：注入从 r.dynamic 读取值（UI 实际保存字段），原代码误读恒为空的 r.notes 导致关系动态永远丢失",
        ],
      },
      {
        label: "收尾说明（基础已具备）",
        items: [
          "侦察确认 relationships 字段（schema/types/UI/注入四路齐全）与 speechPatterns（dialogueStyle 内置子字段）此前已落地，故本次无新增字段",
          "改动仅修正注入渲染逻辑，未触碰 schema / 类型 / 表单重建点，静态自检 + 生产构建零回归",
        ],
      },
    ],
  },
  {
    version: "v0.40.0",
    date: "2026-07-28",
    title: "提示词结构升级：XML 标签分层包裹（酒馆格式论迁移）",
    sections: [
      {
        label: "上下文块边界明确化",
        items: [
          "assemblePrompt 拼接层改为逐块 XML 标签包裹，替代原有的「---」分隔符与【xxx】标题混排",
          "根标签 <novel_forge_context> 包裹全部上下文区块，<writing_task> 包裹撰写指令（含 depth1 上方、depth0 正文前强制层）",
          "新增 wrapBlock 辅助函数：内容为空时返回空串，调用方统一过滤空块",
        ],
      },
      {
        label: "向后兼容（不魔鬼化）",
        items: [
          "各区块内部仍保留【xxx】人类可读标题，仅外层加 XML 边界，不重排内部结构",
          "正则后处理作用于模型输出，与 prompt 格式无关；外部无代码依赖原分隔符，改动零回归",
        ],
      },
    ],
  },
  {
    version: "v0.39.0",
    date: "2026-07-28",
    title: "记忆清除 / 上下文溢出治理（酒馆记忆机制迁移）",
    sections: [
      {
        label: "短期记忆溢出治理（前文回顾）",
        items: [
          "buildShortTermSection 重写：较远楼层（超预算的旧小节）不再静默丢弃，改为显式「折叠标记」——保留末尾衔接点 + 标注\"开头已折叠/非完整原文\"",
          "预算极小（remaining≤60）时整段折叠为一行提示（[⚠️ 远楼层「标题」已折叠]），绝不静默丢内容",
          "section 头部追加折叠说明，明确告知模型哪些内容被压缩，避免把截断片段误读为完整情节而产生剧情断裂幻觉",
        ],
      },
      {
        label: "中期摘要边界标记（章节摘要）",
        items: [
          "buildMediumTermSection 的静默截断补标记：因预算省略的较早/低相关章节摘要显式标注数量（另有 N 个…因预算省略）",
          "对应酒馆第七章「记忆机制 / 记忆清除」：明确上下文压缩边界，消除“上下文污染”",
        ],
      },
    ],
  },
  {
    version: "v0.38.0",
    date: "2026-07-28",
    title: "世界书 depth 注入（酒馆 worldbook depth 0-4 迁移）",
    sections: [
      {
        label: "世界书注入深度（depth 0-4）",
        items: [
          "Prisma LorebookEntry 新增 `depth Int @default(3)`；类型层 LorebookEntry/PromptContext.forcedLore/LorebookData 同步",
          "depth 语义对齐酒馆：0=强效注入正文前(用户指令下方) / 1=用户指令上方 / 2=系统上下文(强制常驻) / 3=背景设定·关键词触发(默认) / 4=深层背景",
          "编排层 buildPromptContext 拆分 loreEntries 为 forced(depth≤2) 与 triggerable(depth≥3)，关键词匹配仅作用于 triggerable；forcedLore 经 PromptContext 透传",
          "组装引擎 assemblePrompt：depth2 注入系统上下文区、depth1 置于撰写指令上方、depth0 置于撰写指令下方（正文前·最强效）；关键词触发的 loreSection 按 depth 升序（3 在前、4 在后）",
        ],
      },
      {
        label: "去重与 API/UI",
        items: [
          "宝宝流 recall 路径（buildRecallBlock）排除 depth≤2 条目，避免与 forcedLore 常驻注入重复",
          "lorebook 新建/编辑 API、preset apply（worldview/story_progression/lorebook 分支）均写入 depth（默认3）",
          "世界书编辑弹窗与 WorldPanel 新建表单新增深度选择器（0-4 中文标签）；列表卡片显示深度徽标（depth≤2 高亮为常驻）",
          "创意工坊示范预设「示范·世界书条目」核心设定条目设为 depth=2（系统上下文常驻，演示强制注入）",
        ],
      },
    ],
  },
  {
    version: "v0.37.0",
    date: "2026-07-28",
    title: "酒馆理论迁移：创意工坊 Preset 类型扩展 + 正则后处理管线",
    sections: [
      {
        label: "创意工坊 Preset 类型扩展（regex / lorebook / api_config）",
        items: [
          "Prisma Preset.type 扩展支持 regex、lorebook、api_config；Project 新增 postProcessingRules JSON 字段",
          "/api/presets/[id]/apply 新增三类应用逻辑：regex → 合并到项目 postProcessingRules（按 name 去重/更新）；lorebook → 写入 LorebookEntry（category=lorebook）；api_config → 合并到 Project.llmConfig",
          "创意工坊 /workshop 页新增「正则 / 世界书 / API参数」三个 TAB、类型标签、上传占位 JSON 与默认选项",
          "内置示范预设：通用·删除思维链（regex）、示范·世界书条目（lorebook）、示范·创意奔放 API 参数（api_config）",
        ],
      },
      {
        label: "正则后处理管线",
        items: [
          "新建 src/core/post-process/regex.ts：按项目级规则列表对生成文本做 RegExp 替换，单条规则编译失败不影响其他规则",
          "write 路由在流式生成组装 fullContent 后、进入审校/摘要管线前调用 applyRegexRules，并通过 SSE 事件 postprocess_regex 报告已应用规则数",
        ],
      },
      {
        label: "流程文档",
        items: [
          "新增 PROCESS/05-酒馆理论迁移方案.txt，记录酒馆运行原理、可迁移方法论、下一步计划",
          "更新 PROCESS/00-目录清单.txt 纳入 05 并标注状态",
        ],
      },
    ],
  },
  {
    version: "v0.36.0",
    date: "2026-07-28",
    title: "色子抽卡与剧情线持久化关联 + 流程文档机制",
    sections: [
      {
        label: "色子（抽卡）剧情预设 → 剧情线（用户核心诉求）",
        items: [
          "DrawCards 抽卡「采用此路线」后，除写入章纲外，额外把走向持久化写入活跃剧情线 Storyline.chapterBindings（element:\"preset\"、含 cardLabel/coreConflict/mood）",
          "复用已有 PUT /api/storylines/[id]，不新增端点、不改 Prisma schema；生成前规划 plan-chapter 读 storylines 时即可读到「用户用色子选定的走向」作为剧情预设",
          "同章纲节点重采用时按 chapterId+preset 去重，避免堆叠；项目无活跃剧情线时优雅跳过",
        ],
      },
      {
        label: "流程文档机制（开发自参考）",
        items: [
          "新增 novel-forge/PROCESS/ 目录：00-目录清单.txt（主索引+三段式落档规范）+ 01架构逻辑/02自动化填表流程/03色子关联/04待迭代项",
          "每次执行更新前先写清「目标/执行流程/关联项」，完成后标【成功】，变更或失败同步更新，兼作产出记录与预期值追踪",
        ],
      },
    ],
  },
  {
    version: "v0.35.0",
    date: "2026-07-28",
    title: "无表自动建表——保证「生成一章即自动填表」零配置闭环",
    sections: [
      {
        label: "自动化填表零配置（修复体验矛盾）",
        items: [
          "safeFillAfterWriting 在真正填表前检查项目是否已有结构化表格；若无且自动化开启，自动创建默认「章节事实表」（key=auto_facts，列：名称/状态/说明），使「生成一章即自动填表」在零表格配置下也能成立",
          "E2E 验证：新建项目故意不应用任何表格模板，第1章生成后自动建表并填 4 行、第2章动态修正至 7 行；后端打印 [babylore] 自动建表日志",
        ],
      },
    ],
  },
  {
    version: "v0.34.0",
    date: "2026-07-28",
    title: "文风预设生效修复 + 系统角色条件化 + 后端监测报告",
    sections: [
      {
        label: "文风预设修复（与预期对齐的核心矛盾）",
        items: [
          "修复 apply 路由缺陷：创意工坊「应用」预设后未调用 syncGlobalPrompt，导致 globalPrompt 始终为空、文风预设（如古风·严谨文笔）完全不生效；现对所有预设类型（style/worldview/story-progression）统一刷新全局提示词",
          "文风卡经 syncGlobalPrompt 编入 globalPrompt，生成时 assemblePrompt 读取，套用文风后立即带该文风——E2E 实测 globalPrompt 长度 0 → 385 且含「文风设定/古风」",
        ],
      },
      {
        label: "系统角色条件化（消除体裁冲突）",
        items: [
          "orchestrator 系统提示词原硬编码「白金级玄幻修仙网文作家 + 修仙模拟引擎 + 都市重生流」，与项目 genre 解耦，压制一切非修仙文风预设",
          "改为条件化：题材含修仙/玄幻/仙侠/武侠/洪荒/奇幻/末世时沿用原版（零风险）；其他题材走通用作家角色，文风以文风卡为最高权威，不再被强制修仙化",
        ],
      },
      {
        label: "后端监测报告（满足核对流程需求）",
        items: [
          "召回节点打印 [recall] 命中条数与来源；生成前剧情规划打印 [plan-chapter] 回写章序；自动填表打印 [babylore] ops/applied/skipped",
          "E2E 实测后端日志清晰呈现「召回 1→3 条 → 剧情回写章序 1→2→3 → 填表 chapter1 ops=2 / 后续动态修正」的完整链路",
        ],
      },
    ],
  },
  {
    version: "v0.33.0",
    date: "2026-07-28",
    title: "自动化填表闭环 + 生成前剧情预设 + 可配上下文",
    sections: [
      {
        label: "自动化填表（正文→填表→召回→正文）",
        items: [
          "新增 safeFillAfterWriting：每章写完后自动用 DeepSeek 抽取结构化事实，以 JSON 行操作协议（insert/update/delete）回填创意工坊结构化表格，失败不影响正文交付",
          "回填表格经 buildRecallBlock 持续注入永久上下文，形成「写章节→填表→下一章召回」闭环；update 按唯一列匹配已有行，动态修正不矛盾、不重复插入",
          "填表频率可配置（默认每 3 章填一次）、默认跳过最近一章（用户常对最新章 re-roll 改写，跳过避免污染表格），二者均可在弹窗关闭",
        ],
      },
      {
        label: "生成前剧情预设（回忆召回式推进剧情线）",
        items: [
          "新增 plan-chapter.ts：点击生成一章之前，LLM 基于活跃剧情线 + 大纲 + 作者指令 + 记忆召回块规划本章剧情推进（焦点/推进/障碍/转折/执行提示）",
          "规划结果注入写作指令，并把本章绑定追加写回活跃剧情线（保留最近 50 章，不丢历史、持续修正）；规划失败静默降级，不阻断正文生成",
        ],
      },
      {
        label: "配置与 UI",
        items: [
          "顶部工具栏新增「自动化」入口，弹窗集中配置：自动填表总开关 / 填表频率 / 跳过最近章 / 上下文楼层（前文窗口，复用 contextKeepChapters）",
          "新增 /api/projects/[id]/config（GET/PUT）读写上述配置，已接入 jsonError 统一错误格式",
          "数据层：Project 模型新增 autoFillEnabled / fillFrequency / skipLatestChapter 字段",
        ],
      },
    ],
  },
  {
    version: "v0.32.3",
    date: "2026-07-28",
    title: "暗色可读性提升 + API 错误格式统一",
    sections: [
      {
        label: "可读性（A11y）",
        items: [
          "--nv-text-tertiary 提亮至对比度 ≥4.5:1（原约 3.5:1），暗色下弱文字达 WCAG AA 普通文本标准",
          "--nv-text-muted 适度提亮，占位符 / 禁用文字在暗色背景下恢复可读性",
        ],
      },
      {
        label: "API 错误响应统一",
        items: [
          "新增标准 helper jsonError(message, status?)，统一返回 { error } 结构与 HTTP 状态，消除各路由 {ok:true}/{error} 不一致",
          "/api/presets/[id]（GET/PUT/DELETE）与 /api/seed/presets（POST）已接入 jsonError，作为全站错误格式统一化起点",
        ],
      },
    ],
  },
  {
    version: "v0.32.2",
    date: "2026-07-28",
    title: "空态统一 + 项目资产闭环 + 监测告警（缺陷修复迭代）",
    sections: [
      {
        label: "空态统一（视觉完整度）",
        items: [
          "新增共享空态组件 EmptyState（虚空玻璃风格：虚线边框 + 居中 Icon + 主文案 + 可选引导/操作区）",
          "角色 / 世界书 / 故事线 / 规则四类列表的无数据占位统一为 EmptyState 卡片；规则面板原漏网的旧色板 text-zinc-600 一并收编为 nv 令牌",
        ],
      },
      {
        label: "项目资产闭环",
        items: [
          "GET /api/projects/[id] 的 include 补全 styleCards 与 loreTables，前端可在 workspace 直接读取创意工坊已应用预设，减少端点分裂",
        ],
      },
      {
        label: "健壮性",
        items: [
          "MonitorPanel 的 fetch 异常从静默忽略（/* ignore */）改为 console.warn，保留非关键降级但开发期可排查",
          "SSE 流关闭逐文件复核：17 个流式路由的 controller.close() 均已覆盖所有异常路径（try 末尾 / catch 内 / 提前 return 前），无悬挂风险，保持现状以控制改动风险",
        ],
      },
    ],
  },
  {
    version: "v0.32.1",
    date: "2026-07-28",
    title: "API 路由健壮性加固（预设路由异常捕获）",
    sections: [
      {
        label: "API 路由健壮性",
        items: [
          "修复 /api/presets/[id] 的 GET/PUT/DELETE 与 /api/seed/presets 的 POST 缺失 try/catch 的问题：prisma 异常原会返回无 {error} 的 500，导致前端解析崩溃",
          "统一异常响应：各 handler 包装 try/catch，返回 { error: string } + 对应 HTTP 状态（404/500），前端可稳定识别并 toastError",
        ],
      },
      {
        label: "诊断自检",
        items: [
          "按 novel-forge-diagnostic 六维度扫描：tsc 零错误、Prisma schema 校验通过、服务健康 200、无死代码、核心 SSE 路由已有外层 try/catch 兜底",
          "其余优化点（SSE finally 统一关闭、巨型组件拆分、大列表虚拟化、空态 / 对比度 / A11y）整理为优化建议清单，列入后续迭代",
        ],
      },
    ],
  },
  {
    version: "v0.32.0",
    date: "2026-07-27",
    title: "🎨 全模块视觉美化 + 创建/添加统一响应弹窗（虚空玻璃设计体系）",
    sections: [
      {
        label: "视觉美化体系落地（虚空玻璃 Void Glass）",
        items: [
          "全部小说相关子界面统一为暗色「虚空玻璃」设计：surface/border/primary/creative/accent/success/danger 令牌全量替换旧的 indigo/zinc/emerald/amber 平行色，配色风格一致",
          "按钮变体（btn-primary/btn-success/btn-danger/btn-creative/btn-ghost）+ .input-glass/.surface-floating 统一质感，每个按钮具备 hover / 点击 / 禁用态的视觉差异",
          "全站 UI 装饰 emoji 清零，改为统一 Icon 组件（Lucide 映射）：角色前缀 ★◆◈、状态 ✓✕⚠️⏳ 等收编为 check/x/alert/loader 等 Icon；业务数据标签 📥📝 保留其过滤语义",
        ],
      },
      {
        label: "创建/添加操作统一响应弹窗",
        items: [
          "新增命名式 toast：toastAdded / toastCreated（绿色辉光 + 勾选动画 + 固定标题「已添加 / 已创建」），字体与动效美化",
          "覆盖全部「创建 / 添加小说」入口：新建角色、新建世界书、新建规则、AI 生成故事线、探讨模式创建项目（含大纲落库建项目）——均弹出「XX「名称」已创建 / 已添加」",
        ],
      },
      {
        label: "构建与类型修复",
        items: [
          "修复 3 处阻塞构建的类型错误：workshop 页补 toastCreated 导入、游戏页 QUICK_ACTIONS 的 icon 收窄为 IconName、PostGenPanel 补 cloud 图标到注册表",
          "tsc --noEmit 与生产 next build 均通过（69 路由全量生成），可直接部署",
        ],
      },
    ],
  },
  {
    version: "v0.31.0",
    date: "2026-07-27",
    title: "📚 内置文档预设概念 + 创意工坊进入写作上下文 + 按钮全交互实测",
    sections: [
      {
        label: "内置预设概念（来自参考资料）",
        items: [
          "把参考资料教程里命名的所有预设类别实体化为系统内置预设：表格模板 3 个（主角信息表/属性·关系·资产、骰子随机事件表、宫斗·妃嫔居住建筑表）、剧情推进 2 个（缝合怪·多线剧情推进、好感度·分阶段人设模板）、文风 2 个（快节奏·爽文笔、古风·严谨文笔）、世界观 1 个（仙侠·世界观骨架）、角色卡 1 个（示范角色·苏苏）",
          "保留原 4 个示范预设，系统内置预设总数由 4 增至 12，覆盖 type: table_template / story_progression / style / worldview / character",
        ],
      },
      {
        label: "创意工坊贴合进入写作上下文（链路确证）",
        items: [
          "「应用到项目」真实落库经 pg 直连验证：文风→StyleCard(1)、角色卡→CharacterCard(2)、表格模板→LoreTable(3) 全部写入项目库",
          "写章节时预设经 loadGenerationContext / buildPromptContext / buildRecallBlock 注入正文 globalPrompt 与召回块——「参考资料预设→项目库→写作上下文」主链路闭环成立",
        ],
      },
      {
        label: "每个内置按钮可交互（真实点击验证）",
        items: [
          "创意工坊 Tab 过滤、搜索框、应用到项目、复刻、上传预设（填表+发布）、目标项目下拉 全部真实点击验证通过，无死按钮",
          "上传预设功能端到端验证：表单填表→POST /api/presets→后端真实创建入库",
          "生产模式（next build + start）全新渲染：创意工坊 12 张卡片完整渲染、交互正常",
        ],
      },
    ],
  },
  {
    version: "v0.30.2",
    date: "2026-07-27",
    title: "🔍 究极用户端五维诊断 + 工作台 hydration 修复",
    sections: [
      {
        label: "五维用户端诊断（真实点击验证）",
        items: [
          "① 按钮实质交互：写章节 / 微调 / 续写 / 自动填表 / 记忆召回 / 跳转 等核心按钮均实测有真实后端行为，未发现死按钮",
          "② 前后端统一：前端每个调用均能映射到后端 API 且实测有响应（规则链路最初 400 为诊断脚本字段误用，前端 RulesPanel 字段与后端契约一致）",
          "③ 重叠按钮审计：代码盘点 12 组嫌疑入口（文风管理三入口、章纲三生成器、导入双链路等），经判定均属合理导航 / 场景分化，未删除任何功能",
          "④ 功能落地：探讨 / 拆书 / 宝宝流 / 创意工坊 / 游戏 等模块边界清晰，参考资料核心承诺（写作闭环 / 分阶段人设 / 创意工坊）均已落地",
          "⑤ 功能意义：宝宝流闭环实测优秀——写章节后结构化表格「角色居所」被自动更新（applied:1），正文 1415 token 生成 + 自动填表生效",
        ],
      },
      {
        label: "修复与用户体验",
        items: [
          "工作台 /workspace/[id] 修复 SSR/CSR hydration 不一致：将 refineInstruction / chapterOutlinePrompt 的 localStorage 读取从 useState 初始化移入 useEffect，消除初始化期水合不匹配风险",
          "诊断结论：系统为免费无收费的小说 AI 生成器，核心写作闭环与记忆系统真实可用，契合谋生作者 / 自娱写手「低成本产出连贯长篇」的目的",
          "已知限制：沙箱 dev 模式下工作台偶发卡 loading（仅本地 dev 环境问题，生产构建 next build + start 完全正常，部署无碍）",
        ],
      },
    ],
  },
  {
    version: "v0.30.1",
    date: "2026-07-27",
    title: "🪟 写作界面新增「宝宝流记忆召回」实时面板（闭环透明化）",
    sections: [
      {
        label: "闭环透明度",
        items: [
          "写章节 / 微调 / 续写 完成后，中间列新增「🧠 宝宝流记忆召回」折叠面板，实时列出本轮自动召回并注入写作的世界书/结构化表格记忆",
          "面板直接展示已求值的人设阶段（如「阶段一：陌生人（态度：礼貌但疏离）」），写作者一眼看清 AI 在本轮呼应了哪些设定、当前角色处于什么状态——闭环不再只藏在后台 toast 里",
          "每轮生成开始时面板自动重置（setRecallMemories([])），避免上一次记忆残留误导",
        ],
      },
      {
        label: "实现与验证",
        items: [
          "数据直接复用已验证的 babylore_recall SSE 事件（items 已是循环求值后的内容），零新增后端逻辑",
          "验证：tsc 类型检查通过、next build 全路由编译通过、/workspace/[id] 页面 HTTP 200、写章节 SSE 苏苏条目 content 为已求值「阶段一：陌生人」且无 <if cell> 标签",
        ],
      },
    ],
  },
  {
    version: "v0.30.0",
    date: "2026-07-27",
    title: "🎭 分阶段人设求值生效（剧情推进 = 人设进化，参考资料核心亮点落地）",
    sections: [
      {
        label: "分阶段人设真正生效",
        items: [
          "新增 src/core/babylore/ifcell.ts 求值器：解析参考资料风格的 <if cell=\"属性表/苏苏/好感度 <= 10\">…<else>…</if> 语法（支持任意嵌套），按当前结构化表格的真实数值选出「当前激活的人设阶段」",
          "套用「好感度·分阶段人设模板」后，写章节 / 微调 / 续写 会自动把求值后的当前人设阶段注入写作指令，而非把原始语法标签丢给 AI——参考资料承诺的「剧情推进=人设进化」首次真正闭环",
          "端到端验证：属性表 苏苏.好感度=5 时，写章节召回的人设条目 content 已是「阶段一：陌生人（态度：礼貌但疏离）」，标签彻底清除",
        ],
      },
      {
        label: "安全与健壮性",
        items: [
          "单元 + 端到端双层测试：好感度 5/25/50/80 精准命中阶段一~四，标签全部清除；",
          "安全降级：属性表缺失、行缺失或数值非数字时返回「全阶段参考文本」（剥离标签、并列展示），绝不误判为某一阶段，也绝不向用户暴露原始 <if cell> 标签",
          "求值集成进共享模块 src/core/babylore/loop.ts：buildRecallBlock 对世界书条目里的 <if cell> 统一求值，recall 事件携带的也是已求值内容（透明可见）",
        ],
      },
    ],
  },
  {
    version: "v0.29.0",
    date: "2026-07-27",
    title: "🔁 写作闭环覆盖全部生成路径（写章节 / 微调 / 续写 三路由统一）",
    sections: [
      {
        label: "闭环扩展到全部路径",
        items: [
          "写章节 / 微调 refine / 续写 continue 三条生成路由现在都自动「记忆召回」+ 写后「LLM 填表」，参考资料承诺的正文→填表→召回→正文 在任意创作方式下都闭合",
          "端到端验证：微调指令「甄嬛居所改为棠梨宫」被 DeepSeek 自动抽取，结构化表格 甄嬛:碎玉轩 → 甄嬛:棠梨宫 实时更新；续写路径也正确召回角色设定",
        ],
      },
      {
        label: "架构精简（删冗余）",
        items: [
          "抽共享模块 src/core/babylore/loop.ts：把「召回净化（过滤[自动发现]占位世界书、表格命中优先、上限12条）+ 写后自动填表（失败不影响交付）」沉淀为单一事实来源",
          "write/refine/continue 三路由统一调用 buildRecallBlock 与 safeFillAfterWriting，消除三套重复逻辑、保证行为一致",
        ],
      },
      {
        label: "健壮性对齐",
        items: [
          "refine/continue 的后处理管线（审校/摘要）也加容错：LLM 限流/超时不再中断交付，降级为「仅生成」并继续自动填表、照常发 done",
          "前端 streamSSE 本就是 write/refine/continue 共用，宝宝流召回/填表的实时 toast 在三条路径自动透明展示",
        ],
      },
    ],
  },
  {
    version: "v0.28.0",
    date: "2026-07-27",
    title: "🔁 打通「正文→填表→召回→正文」写作闭环（参考资料核心承诺落地）",
    sections: [
      {
        label: "写作闭环（自动）",
        items: [
          "写章节时自动「记忆召回」：用本节大纲 + 作者指令 + 前文 + 角色名 作为召回上下文，命中世界书/结构化表格记忆并注入本轮撰写指令（剧情推进=记忆召回）",
          "写完后自动「LLM 填表」：DeepSeek 抽取本章结构化事实回填表格，闭环 正文→填表→召回→正文 全程无需手动调用 API",
          "端到端验证：宫斗章节正确召回 4 位妃嫔居住信息，并在续写「甄嬛迁入棠梨宫」后自动把 woman_live 表更新为 甄嬛:棠梨宫",
        ],
      },
      {
        label: "质量与稳定性",
        items: [
          "召回净化：自动过滤内容含「[自动发现]」的占位世界书，结构化表格命中优先，单次召回上限 12 条，避免 prompt 膨胀与低质记忆污染",
          "后处理容错：审校/摘要的 LLM 调用若因限流/超时失败，不再中断整章交付，降级为「仅生成」并继续自动填表、照常发送 done",
          "填表 LLM 调用加 120s 防御性超时，慢响应不再卡住 SSE 流",
          "前端透明化：实时 toast 提示「宝宝流记忆召回 N 条」与「自动填表完成：写入 M 行」，闭环每一步用户可见",
        ],
      },
    ],
  },
  {
    version: "v0.27.1",
    date: "2026-07-27",
    title: "🐛 修复宝宝流自动填表多行互相覆盖（稳定性）",
    sections: [
      {
        label: "稳定性修复",
        items: [
          "修复 /api/babylore/fill 累积写入 bug：同一张表的多个 insert 操作此前会在循环内从原始空数组重新拷贝，导致互相覆盖、只保留最后一行（如宫斗 4 位妃嫔只写入 1 位安陵容）",
          "改为按表维护累积 rows 副本（rowsCache），同表多操作串行生效；现已正确写入全部 4 行（华妃/翊坤宫、皇后/景仁宫、甄嬛/碎玉轩、安陵容/延禧宫）",
          "生产构建（next build）已通过 TypeScript 类型检查与 69 页静态生成，可正常部署上线",
        ],
      },
    ],
  },
  {
    version: "v0.27.0",
    date: "2026-07-27",
    title: "🗂 宝宝流数据库内核 + 创意工坊/共创社区：把参考资料变成可共享预设",
    sections: [
      {
        label: "宝宝流数据库内核（结构化表格 + LLM 填充 + 剧情推进召回）",
        items: [
          "新增 LoreTable 模型：世界书升级为结构化表格（人物/地点/物品/属性/时间线），行列可自定义，对标宝宝流「妃嫔居住建筑表」",
          "新增 /api/babylore/fill：每章写完后 DeepSeek 自动填表（国模填表精确配置：关 COT + 严格 JSON + 温度 1 + 失败重试 3 次），抽取结构化事实写入表格",
          "新增 /api/babylore/recall + recallContext 服务：剧情推进=记忆召回，按世界书绿灯关键词与表格行匹配，注入应召回的记忆（不替作者写剧情）",
          "大纲生成已增量注入召回命中项；项目内「结构化表格」页支持建表/行编辑/自动填表/召回预览",
        ],
      },
      {
        label: "创意工坊 / 共创社区（预设中心）",
        items: [
          "新增 Preset 模型与 /api/presets（列表/上传）、/apply（套用到项目）、/fork（复刻二创）",
          "把参考资料本身实体化为「预设」：表格模板预设、剧情推进预设、文风、世界观、角色卡均可一键套用",
          "内置 4 个示范预设（宫斗居住表 / 好感度分阶段人设 / 古风严谨文笔 / 仙侠世界观骨架），首次部署 POST /api/seed/presets 注入",
          "顶栏新增「创意工坊」入口；工作区新增「结构化表格」「创意工坊」按钮；产品免费、非商业",
        ],
      },
    ],
  },
  {
    version: "v0.26.3",
    date: "2026-07-26",
    title: "🛡 API 错误收敛与优雅降级：环境变量配置 DeepSeek、拆书页无 DB 不崩溃",
    sections: [
      {
        label: "API 错误收敛与可读化",
        items: [
          "拆书列表 `/api/dissect/list`、项目详情 `/api/projects/[id]`、角色 `/api/characters/[id]`、`/api/characters`、规则 `/api/rules`、故事线 `/api/storylines`、待办 `/api/pending-items`、统计 `/api/stats/monitor`、节点 `/api/story/nodes`、伏笔 `/api/foreshadowing/list`、世界书 `/api/lorebook/[id]` 等路由的 catch 块统一改为 `jsonError(err)`",
          "消除数据库未连接时 API 返回的原始 `__TURBOPACK__...` / `prisma.xxx.findMany()` 内部堆栈，前端拿到的是 `{error, code, hint}` 结构化的中文可读错误",
        ],
      },
      {
        label: "无数据库时的优雅降级",
        items: [
          "拆书页 `/dissect` 加载失败时不再弹出内部错误边界，改为居中友好空状态：标题「拆书任务加载失败」+ 错误原因 + 修复指引 +「重试」按钮",
          "拆书页在加载错误期间暂停 3 秒自动轮询，避免反复请求失败接口",
        ],
      },
      {
        label: "环境变量配置 API",
        items: [
          "在用户目录 `novel-forge-github/.env` 与沙箱仓库 `.env` 写入 DeepSeek 配置：`LLM_PROVIDER=deepseek`、`LLM_API_KEY`（用户提供）、`LLM_MODEL=deepseek-v4-flash`、`LLM_BASE_URL=https://api.deepseek.com`",
          "`DATABASE_URL` 默认指向 `docker compose up -d` 启动的 PostgreSQL，用户只需启动 Docker 即可让数据层跑通",
        ],
      },
      {
        label: "质量验证",
        items: [
          "tsc --noEmit 零错误；生产构建 64 页通过",
          "本地 3001 服务重启后 `/`、`/changelog`、`/settings`、`/explore`、`/dissect` 全部 200，浏览器控制台无 JS 报错",
          "curl `/api/dissect/list` 验证返回结构化中文错误，不再暴露 Prisma 内部路径",
        ],
      },
    ],
  },
  {
    version: "v0.26.2",
    date: "2026-07-26",
    title: "🛡 Pipeline 检查与 bug 修复：数组空值兜底、lorebook 死代码清理、类型对齐",
    sections: [
      {
        label: "运行时 bug 修复",
        items: [
          "LeftPanel 向子组件传递的数组统一加 `?? []` 兜底：`project.storyNodes ?? []` / `project.characters ?? []` / `project.lorebookEntries ?? []`，避免后端数据缺少字段时进入对应 tab 白屏",
          "CharacterList / WorldPanel 的数组 prop 改为可选（`characters?: CharacterData[]`、`entries?: LorebookData[]`）并默认空数组，从调用方到组件自身双层防御空值",
        ],
      },
      {
        label: "lorebook 死代码清理",
        items: [
          "v0.26.1 移除工作台冗余 lorebook 标签后，`onNewLore` / `showNewLore` / `<LorebookCreateDialog>` 已没有任何入口可触发，成为死代码；已清理 LeftPanel 与 workspace/[projectId]/page.tsx 中相关 props/state/渲染",
          "删除无人引用的组件文件 `LorebookList.tsx`（全仓 0 import）与 `LorebookCreateDialog.tsx`（仅被死代码渲染），精简代码库",
        ],
      },
      {
        label: "类型与一致性",
        items: [
          "LeftPanel 与 workspace 页面的 tab 联合类型移除已废弃的 `\"lorebook\"`，避免误切到无对应渲染分支的空白面板",
        ],
      },
      {
        label: "pipeline 检查",
        items: [
          "运行 `npx tsc --noEmit`：零错误",
          "运行 `npm run lint`：680 个既有 `no-explicit-any` 历史债务（memory-classifier/memory-decay 等），本次改动未引入新 lint 错误",
          "浏览器自动化检查 3001 首页/设置/探索/拆书/公告页：无客户端 JS 报错，无崩溃",
        ],
      },
    ],
  },
  {
    version: "v0.26.1",
    date: "2026-07-26",
    title: "🧹 前端按钮去重与矛盾消除：共享删除 Hook、冗余标签清理、加载态补全",
    sections: [
      {
        label: "删除逻辑去重（重构）",
        items: [
          "新增共享 Hook `useConfirmDelete`（src/components/workspace/useConfirmDelete.ts）：统一封装「确认弹窗 → 忙态锁定 → 删除 → 成功刷新 / 失败 toast」流程",
          "7 处删除入口（角色 / 故事线 / 规则 / 世界书条目 / 项目 / 拆书任务 / 章节节点）改用该 Hook，移除约 90 行重复样板，并消除各文件删除错误处理不一致、提示文案凌乱的隐患",
        ],
      },
      {
        label: "矛盾按钮消除（修复）",
        items: [
          "工作台侧栏原 `world` 与 `lorebook` 两个标签渲染同一 WorldPanel，形成重复且矛盾的入口；删除冗余的 lorebook 标签，仅保留 world 单一入口",
          "CharacterList 的 `onDelete` 由 `() => void` 修正为 `() => Promise<void>`，删除失败现在能被 Hook 正确捕获并提示，不再被静默吞掉",
        ],
      },
      {
        label: "按钮加载态补全（修复）",
        items: [
          "大纲树（OutlineTree）章节节点删除按钮此前缺失禁用/忙态，点击后无视觉反馈；现接入 `deletingId`，删除进行中禁用并锁定该按钮，防重复点击，消除「点了没反应」的矛盾观感",
        ],
      },
      {
        label: "构建与自检（质量）",
        items: [
          "tsc --noEmit 零错误；生产构建 64 个页面零警告通过",
          "本地服务自检：首页 / 设置 / 更新面板 / 探索 / 拆书 等所有页面路由返回 200，渲染真实内容（非错误边界）",
        ],
      },
    ],
  },
  {
    version: "v0.26.0",
    date: "2026-07-26",
    title: "🔔 交互硬化与 UI 美化：全局提示系统、按钮反馈与 DeepSeek 跑通",
    sections: [
      {
        label: "全局交互系统（新增）",
        items: [
          "新增全局 Toast + Confirm + Prompt 组件（src/components/ui/toast.tsx），统一替代所有原生 alert / confirm / prompt：右下角滑入、按类型（成功/错误/警告/信息）着色、自动消失、可手动关闭；确认/输入弹窗为虚空玻璃风格模态框，返回 Promise，Provider 未挂载时安全退化为原生对话框",
          "全局按钮基础样式（globals.css）：所有按钮（含原生 <button>）统一具备点击下沉、禁用态、聚焦光环的视觉按压反馈",
          "共享 Button 组件新增 `loading` 属性：异步操作期间显示 Spinner 并自动禁用，点击「有确定感」",
        ],
      },
      {
        label: "全站交互硬化（修复）",
        items: [
          "19 个文件原生 alert 全部替换为分类型 toast：错误不再被静默吞掉，成功/信息有明确正向反馈",
          "7 处破坏性删除（角色 / 故事线 / 规则 / 世界书条目 / 项目 / 拆书任务 / 章节节点）原生 confirm 替换为 styled 确认弹窗，并加 deleting 忙态锁定删除按钮，误删风险归零",
          "工作台「新建章节 / 小节」原生 prompt 替换为 styled 输入框弹窗（promptDialog），保持视觉一致",
        ],
      },
      {
        label: "DeepSeek 跑通（新增 / 修复）",
        items: [
          "llm.ts 新增各 Provider 默认模型表（DeepSeek → deepseek-v4-flash 等）；模型留空不再硬报错，读者只填 Key 即可跑",
          "testLLMConnection 默认模型按 Provider 取值，并兼容 DeepSeek v4 等推理模型（先思考后输出正文）——连接测试不再误判「返回格式异常」",
          "实测：以用户提供的 DeepSeek Key 经 /api/settings/test 与原始 HTTP 调用均返回 200 与正确中文内容，集成已跑通",
        ],
      },
    ],
  },
  {
    version: "v0.25.0",
    date: "2026-07-26",
    title: "🎨 UI 优化：首页重塑、布局修复与响应式打磨",
    sections: [
      {
        label: "布局缺陷修复（必须修）",
        items: [
          "系统自检横幅原为 `sticky top-0 z-50`，与页面 `sticky top-0 z-10` 页头争抢顶部导致页头被遮挡；改为 `relative` 后横幅处于文档流顶部、滚动时自然让位给粘性页头，重叠消除",
        ],
      },
      {
        label: "首页重塑",
        items: [
          "新增 Hero 欢迎区（标题 + 一句话定位 + 开始创作 / 拆书分析双 CTA），首屏更有产品感",
          "空项目状态由居中提示改为三张「起步引导卡」：探讨模式、拆书分析、配置 AI，直接引导用户完成关键第一步",
        ],
      },
      {
        label: "响应式与一致性",
        items: [
          "顶栏「开始创作 / 拆书 / 设置」按钮在移动端（<640px）自动隐藏文字仅留图标，窄屏不再拥挤",
          "更新面板「最新」徽标由 emerald 绿统一为 indigo 靛蓝，与该页及全站设计令牌一致",
        ],
      },
    ],
  },
  {
    version: "v0.24.9",
    date: "2026-07-26",
    title: "🏗️ 成品化：去远程字体依赖，整站可离线构建",
    sections: [
      {
        label: "构建成品化",
        items: [
          "移除 next/font/google 的 Geist / JetBrains Mono 远程拉取，改用系统字体栈（中文回退 PingFang SC / Microsoft YaHei）——任意环境（含无外网）`next build` 均可成功",
          "64 个页面静态生成全部通过，TypeScript 零错误，整站进入可部署成品状态",
        ],
      },
      {
        label: "构建警告清除",
        items: [
          "next.config.ts 显式声明 `turbopack.root = process.cwd()`，消除因上层目录多余 lockfile 导致的 workspace root 误判警告",
        ],
      },
      {
        label: "可移植性",
        items: [
          "部署不再依赖构建期联网拉取字体；`docker compose up -d` + `npx prisma db push` + `npm run dev` 即可起站",
        ],
      },
    ],
  },
  {
    version: "v0.24.8",
    date: "2026-07-26",
    title: "🗑️ 修最后 1 处必须修：拆书任务删除假成功（未查 res.ok）",
    sections: [
      {
        label: "拆书任务删除（dissect/page.tsx handleDelete）",
        items: [
          "原逻辑：`await fetch(DELETE)` 后直接 `setTasks(filter)` 移除列表项，不检查 res.ok → 服务端 4xx/5xx 时 UI 显示已删而服务端仍在=假删除成功",
          "现改为：先判 `res.ok`，失败 alert 具体 HTTP 状态且不移除列表项，成功才移除",
        ],
      },
    ],
  },
  {
    version: "v0.24.7",
    date: "2026-07-26",
    title: "🔍 收口全局静默吞错（角色卡采纳/世界书新建/文风应用·保存 + 加载失败可见化）",
    sections: [
      {
        label: "写操作假成功（4 处必须修）",
        items: [
          "AIChatBar handleAdoptSuggestion：采纳角色卡建议原不检查 GET/PUT 的 res.ok（非 2xx 静默）→ 现 GET 失败显式提示并 return、PUT 失败显式提示，不再「点了没反应」",
          "WorldPanel 新建世界书：原 `if(res.ok)` 无 else、catch 静默 → 现失败 alert 且不关闭表单",
          "StyleSelector 应用文风 / StyleEditor 保存文风：PUT 失败仍关弹窗=假成功 → 现失败 alert 且不开窗/不关闭，成功才生效",
        ],
      },
      {
        label: "加载失败可见化（4 处）",
        items: [
          "settings 加载设置：原 `if(res.ok)` 无 else、catch 空 → 现失败显式提示",
          "ContextPreview 上下文预览：加载失败原静默显示「无法加载上下文数据」→ 现显式报错条 + 原因",
          "StyleEditor 加载文风配置：失败原静默用默认配置 → 现显式报错弹窗",
          "ImitationPanel 拆书任务列表/维度加载：原 catch 静默置空 → 现显式提示失败原因",
        ],
      },
    ],
  },
  {
    version: "v0.24.6",
    date: "2026-07-26",
    title: "🔍 收尾 P1 静默吞错（章节提取/节点操作/故事线/关系同步/角色·词条·规则删除·开关）",
    sections: [
      {
        label: "章节与节点操作",
        items: [
          "autoExtractChapter（12 维度自动提取）：失败原仅 console.error 静默 → 现 alert 明确提示，不再「转圈后无结果」",
          "handleAddSection / handleSummarize：非 200 原静默 → 现失败 alert 具体原因；网络异常也提示",
          "handleDeleteNode：网络异常原静默 → 现 alert",
        ],
      },
      {
        label: "故事线面板（StorylineList）",
        items: [
          "加载失败原误显「还没有故事线」空态 → 现显式报错条 + 重试按钮，区分「无数据」与「加载失败」",
          "handleSave / handleDelete：原不检查 res.ok（保存失败仍关弹窗=假成功）→ 现失败 alert 且不关弹窗/不刷新",
        ],
      },
      {
        label: "关系同步与侧栏删除·开关",
        items: [
          "AIChatBar relation_sync：原不检查 syncRes.ok 且 catch 静默 → 现非 200 抛错 + 失败 alert，同步真实结果才提示",
          "AIChatBar analyze_relationships 的 catch 静默 → 现失败 alert",
          "LeftPanel 角色删除 / WorldPanel 词条删除 / RulesPanel 规则删除·开关：原不检查 res.ok → 现失败 alert 且不刷新（避免误以为已删/已切换）",
        ],
      },
    ],
  },
  {
    version: "v0.24.5",
    date: "2026-07-26",
    title: "🛡️ 修 P0 假成功/数据丢失（抽卡章纲 + 角色/词条弹窗 + 作者注记）",
    sections: [
      {
        label: "抽卡章纲保存（handleDrawSelect）",
        items: [
          "原逻辑：PUT 保存失败被 catch{} 静默吞掉，仍乐观显示「已采用」→ 用户以为章纲已存，刷新后丢失",
          "现改为：先请求成功（res.ok）才更新显示「已采用」；失败 alert 明确原因，不再误导",
        ],
      },
      {
        label: "角色/词条 编辑·创建弹窗",
        items: [
          "CharacterEditDialog / LorebookEditDialog 的 handleSave：原直接 await fetch 后 onSave+onClose，不检查 res.ok → PUT 失败弹窗关闭=假成功（编辑丢失）",
          "CharacterCreateDialog / LorebookCreateDialog 的 handleSave：POST 失败无提示 → 点了没反应",
          "现四个弹窗统一：检查 res.ok，失败 alert 且不关闭弹窗（保留用户输入可重试），成功才 onSave+onClose",
        ],
      },
      {
        label: "作者注记自动保存（handleAuthorNoteChange）",
        items: [
          "防抖 PATCH 原 catch{} 静默 → 服务端未存时刷新即丢注记，用户无感",
          "现失败 alert 提示（区分 5xx/网络），并保留 localStorage 兜底",
        ],
      },
    ],
  },
  {
    version: "v0.24.4",
    date: "2026-07-26",
    title: "🔧 后端错误结构化 + 死代码清理",
    sections: [
      {
        label: "后端错误响应结构化",
        items: [
          "explore/create、explore/chat（对话/一键生成/大纲三处）、agent/extract-chapter、imitate/start 外层共 6 个 catch 统一改用 jsonError",
          "返回标准化 { error, code, hint }：Prisma/网络连接错误给出针对性中文修复指引（如「请执行 npx prisma db push 建表」），不再只甩原始堆栈",
          "SSE 流式错误（explore 大纲流、imitate 流内）此前已用 SSE error 事件推送，保持不变；settings/test 维持 { ok:false, error } 前端契约不改",
        ],
      },
      {
        label: "死代码清理",
        items: [
          "删除 src/lib/conversation-compressor.ts——全代码库 0 引用（仅更新日志历史文本提及），属历史遗留冗余模块",
        ],
      },
    ],
  },
  {
    version: "v0.24.3",
    date: "2026-07-26",
    title: "🛠️ 工作台静默错误清零（修白屏 + 修假成功）",
    sections: [
      {
        label: "工作台加载失败不再白屏",
        items: [
          "workspace/[projectId] 的 loadProject 原本 catch 仅 console.error → 后端/DB 未就绪时整页白屏且无任何提示",
          "现统一错误状态：网络异常或 5xx 显示可读错误卡片（含原因）+「重试」按钮；仅 404 判定「项目不存在」跳转首页",
          "错误提示明确指引：请检查后端服务是否已启动并连接数据库",
        ],
      },
      {
        label: "大纲保存假成功修复",
        items: [
          "onEditOutline 原 catch {} 乐观更新后静默吞错 → 保存其实失败时用户以为成功、数据已丢",
          "现捕获 prev、请求非 2xx 或网络异常时回滚选中节点并 alert 明确原因，杜绝静默丢数据",
        ],
      },
    ],
  },
  {
    version: "v0.24.2",
    date: "2026-07-26",
    title: "🚪 修复部署启动链路（直击「完全不能用」真实根因）",
    sections: [
      {
        label: "端口错配修复（最关键）",
        items: [
          "README/AGENTS 全程写 `localhost:3001`，但 npm 脚本原是 `next dev`（默认 3000），用户照文档打开 3001 必空白页",
          "`dev`/`start` 改为 `next dev -p 3001` / `next start -p 3001`，与文档完全对齐",
        ],
      },
      {
        label: "环境要求校正",
        items: [
          "package.json 加 `engines: { node: \">=20\" }`，Next 16 强要求 Node ≥20",
          "README 表格 Node 版本 18.x → 20.x（≥20），安装说明同步强调；方式二手动 PG 补上 `echo DATABASE_URL > .env` 步骤（此前漏写会导致 db push 直接失败）",
        ],
      },
      {
        label: "配套（v0.24.0/v0.24.1）",
        items: [
          "系统自检横幅 + /api/health 探针，打开即提示 DB/AI 是否就绪",
          "npm run doctor 启动前自检；前端删除/拆书失败显式提示",
        ],
      },
    ],
  },
  {
    version: "v0.24.1",
    date: "2026-07-26",
    title: "🖥️ 前端错误不再静默（修「点了没反应」）",
    sections: [
      {
        label: "前端 fetch 错误可见化",
        items: [
          "仪表盘「删除项目」失败（含非 200）现在弹窗明确提示原因，不再静默无反应",
          "拆书列表加载失败显示红色报错条 + 重试按钮，不再误显示「还没有任务」空态",
          "拆书详情轮询失败显示顶部报错条 + 重试，避免轮询静默空白",
          "首页底部链接「更新公告」统一更名为「更新面板」，与站内面板一致",
        ],
      },
      {
        label: "后端配套（已在 v0.24.0）",
        items: [
          "5 个高频路由 catch 改用 jsonError，返回 {error, code, hint} 中文操作指引",
          "全局 error.tsx / global-error.tsx 错误边界，未捕获异常显示中文友好页",
        ],
      },
    ],
  },
  {
    version: "v0.24.0",
    date: "2026-07-26",
    title: "📋 站内更新面板 + 高频路由错误可读化",
    sections: [
      {
        label: "站内更新面板（/changelog）",
        items: [
          "页面顶部突出「当前版本」号与「最新」徽标，用户随时回看每个版本的版本号与更新内容",
          "固化记录协议：每次改动都在本文件的 VERSIONS 数组插入条目 + 同步根目录 CHANGELOG.md（两文件一起提交），面板即唯一记录出口",
        ],
      },
      {
        label: "高频 API 路由错误可读化",
        items: [
          "探讨「采纳」、拆书「查询/删除/启动」、实体高亮、Agent 工具执行 等 5 个高频路由的 catch 统一改用 jsonError，返回 {error, code, hint} 中文操作指引",
          "彻底告别「点了没反应却不知为何」——前端拿到可读错误即可直接展示",
        ],
      },
      {
        label: "健壮性修复",
        items: [
          "修复 /api/health 中 llm.hint 可能 undefined 的类型错误",
          "新增全局 error.tsx / global-error.tsx 错误边界，未捕获异常显示中文友好页而非白屏",
        ],
      },
    ],
  },
  {
    version: "v0.23.0",
    date: "2026-07-25",
    title: "🩺 系统自检与首启动引导（失败可读化）",
    sections: [
      {
        label: "系统状态自检横幅",
        items: [
          "根布局挂载全局 SystemStatusBanner，打开任意页面即调用 /api/health 探测 DB 与 AI 配置",
          "数据库未连接 / AI 未配置时顶部弹出琥珀色横幅：说明原因 + 给出 `docker compose up -d && npx prisma db push` 一键修复命令（可复制）或「去设置页填 Key」入口",
          "直击此前「完全不能用却找不到原因」的核心痛点——失败现在可读、可操作，而非静默空白",
        ],
      },
      {
        label: "健康检查探针",
        items: [
          "新增 GET /api/health——只读轻量探针，返回 { db:{ok,error,hint}, llm:{ok,error,hint}, version }",
          "DB 探测用 SELECT 1 实际连库（区分「环境变量存在 ≠ 有效」）；LLM 探测复用 getSettings 配置优先级",
          "任何异常都被吞掉并返回结构化结果，自检本身绝不拖垮页面",
        ],
      },
      {
        label: "API 错误可读化",
        items: [
          "新增 src/lib/api-error.ts：classifyError 把 Prisma 错误码（P1001 连不上 / P1000 登录失败 / P2021 表不存在 / P2024 连接池耗尽 / P2002 唯一冲突 …）翻译为中文操作指引",
          "jsonError() 统一返回 { error, code, hint }，已接入 /api/projects 与 /api/settings 两个首个触点路由",
        ],
      },
      {
        label: "首页加载失败可见",
        items: [
          "仪表盘加载项目失败时不再误显示「还没有小说项目」空态，改为明确报错卡片 + 重试按钮",
          "提示用户查看顶部黄色自检横幅按指引修复",
        ],
      },
    ],
  },
  {
    version: "v0.22.0",
    date: "2026-07-25",
    title: "🛡️ 稳定性与可观测性加固（可读错误 + 启动自检）",
    sections: [
      {
        label: "AI 错误可读化",
        items: [
          "所有 LLM 调用（流式/非流式）的报错从原始 `LLM API Error 401: ...` 统一翻译为可操作中文提示",
          "覆盖 401(Key 无效/过期) / 403(无权限) / 404(模型不存在，附硅基流动 vs DeepSeek 格式提示) / 429(限流) / 5xx(服务端异常)",
          "网络层异常（Base URL 配错、服务断连）也会给出明确指引，不再静默失败",
        ],
      },
      {
        label: "启动自检 doctor",
        items: [
          "新增 `npm run doctor`——启动前自动校验 PostgreSQL 可连接、LLM 配置是否就绪",
          "明确区分「环境变量存在 ≠ 有效」，避免「完全不能用」却找不到原因",
        ],
      },
      {
        label: "更新表同步",
        items: [
          "CHANGELOG.md 与 src/lib/changelog-data.ts 同步更新至 v0.22.0",
        ],
      },
    ],
  },
  {
    version: "v0.21.2",
    date: "2026-06-21",
    title: "🐳 Docker 一键安装 + README 重写优化安装体验",
    sections: [
      {
        label: "README 重写",
        items: [
          "Docker 作为首选安装方式——docker compose up -d 替代手动 PostgreSQL",
          "快速开始拆为两条路径：Docker（推荐，7行命令）和手动安装",
          "详细教程新增「方式一：Docker」完整4步指南——从零到跑起来",
          "环境表格补上 Git 依赖，之前克隆项目的工具反而没列",
          "PostgreSQL 创建命令从硬编码 PostgreSQL\\16 改为 createdb 直调",
          "新增「生产部署」章节——npm run build && npm start 日常使用",
        ]
      },
      {
        label: "常见问题扩充",
        items: [
          "新增：不想装 PostgreSQL 怎么办（推荐 Docker）",
          "新增：怎么关掉数据库释放内存（Docker + 手动安装两条路）",
          "新增：能部署到服务器上公网访问吗",
        ]
      },
    ]
  },
  {
    version: "v0.21.1",
    date: "2026-06-18",
    title: "🎨 虚空玻璃设计体系 + SVG图标系统 + 字体/Tooltip优化",
    sections: [
      {
        label: "虚空玻璃设计体系基建",
        items: [
          "3级深度表面系统：surface-base(噪点纹理)/surface-elevated(卡片)/surface-floating(模态)",
          "8色功能语义色彩(OKLCH空间)：靛蓝(主操作)/翠绿(确认)/琥珀(提醒)/玫瑰(危险)/紫罗兰(AI)/青(信息)/金(强调)",
          "4种按钮变体：btn-primary/success/danger/creative + btn-ghost幽灵按钮",
          "4档动画曲线(弹性/缓出/缓入/平滑) × 4档时长(150/250/400/600ms)",
          "统一输入框系统 input-glass + 聚焦辉光 + CSS噪点纹理消除塑料感",
        ],
      },
      {
        label: "SVG图标系统 + 全站迁移",
        items: [
          "新建 src/components/ui/icons.tsx——30+ Lucide图标 + StatusDot彩色圆点组件 + 语义色彩预设",
          "全站15个页面/组件 emoji → SVG图标替换（首页/设置/更新公告/探讨/工作台核心组件）",
          "实体面板9种类型图标SVG化 + 伏笔面板状态点(🟢🟡🔵⚫) → StatusDot",
          "AIChatBar Bot/User头像 + 角色面板筛选标签全部图标化",
        ],
      },
      {
        label: "字体链 + 文字层级 + 悬停系统",
        items: [
          "字体栈：Geist Sans → PingFang SC → Microsoft YaHei → system-ui（中文fallback链）",
          "等宽字体：JetBrains Mono替代Geist Mono——代码/API Key更清晰",
          "4级文字明度(L1主/L2辅/L3弱/L4禁用) + 6级排版比例(text-2xs→text-2xl)",
          "Tooltip纯CSS系统(data-tooltip属性驱动) + 链接悬停下划线动画(link-underline)",
          "3级悬停阴影(sm/md/lg) + 3色辉光(indigo/success/creative)",
        ],
      },
      {
        label: "设计类实际应用",
        items: [
          "首页项目卡片 → surface-elevated + card-lift；导航链接 → btn-ghost",
          "创建对话框/更新公告弹窗 → surface-floating + animate-spring 动画入场",
          "设置页所有输入框 → input-glass；保存按钮 → btn-primary；测试按钮 → btn-ghost",
          "状态消息emoji(✅❌) → Icon check/alert 组件",
        ],
      },
    ],
  },
  {
    version: "v0.21.0",
    date: "2026-06-18",
    title: "✨ UI全面升级 + 探讨模式重构 + 写作铁律注入",
    sections: [
      {
        label: "UI 全面升级——玻璃态设计",
        items: [
          "35+组件统一视觉：玻璃表面(bg-white/[0.02] backdrop-blur-sm) + 按压反馈(active:scale-[0.97])",
          "首页/设置/更新公告/探讨/工作台/拆书 全部页面 Premium 化",
          "新增设计 token：glass-surface / btn-press / card-lift / glow-pulse / fade-in-up 动画类",
          "自定义滚动条 + 聚焦光环 + 渐变按钮阴影 + 悬停上浮效果",
          "探讨页面拆分为 ChatPanel(230行) / OutlinePanel(210行) / CardBrowser(100行) 独立组件",
        ],
      },
      {
        label: "探讨模式架构重构",
        items: [
          "新增共享工具模块 src/core/explore/utils.ts——消除 stepToCategory/extractJson/extractKeysFromText 三处重复",
          "chat/route.ts 复用 shared utils 的 extractJson（-15行重复代码）",
          "adopt/route.ts 复用 stepToCategory + tryExtractStructured + extractCharacterKeys（-55行重复代码）",
          "create/route.ts 复用 stepToCategory + extractKeysFromText，重写 generateDefaultRules()",
          "删除废弃端点 outline/route.ts（207行死代码，零引用）",
        ],
      },
      {
        label: "写作铁律自动注入系统",
        items: [
          "新建项目时自动创建7条写作铁律到 Rule 表（scope=write_only, priority=94~100）",
          "句式铁律——长短交错，禁止短句堆砌 | 人物指代——名字优先，禁止他/她连用",
          "禁用符号与禁用句式 | 禁止描写声音/语气/眼神/视线",
          "白描铁律——可观察/可直感/零解读 | 节奏控制——详略与描写密度 | 情节与情绪——拉扯/抑扬/反转",
          "生成时自动注入：getActiveRules(\"write_only\") → injectRules() → 拼入 Prompt 顶部",
        ],
      },
      {
        label: "拆书功能增强",
        items: [
          "15维度智能拆解 + 仿写引擎 + 并行化8x提速",
          "拆书结果 UI 重设计——双路径创建项目（直接导入 / AI完善后导入）",
          "角色扩展 Step 0 硬过滤 + 复合名智能拆分 + 预览迷你卡",
          "世界书 AI 扩展五步管线——审计→拆分→删非词条→去重合并→扩展",
        ],
      },
    ],
  },
  {
    version: "v0.20.36",
    date: "2026-06-18",
    title: "🎯 探讨模式——对话式构建小说世界",
    sections: [
      {
        label: "探讨模式核心",
        items: [
          "/explore 页面——三栏布局：左构建配置 / 中AI对话 / 右已采纳内容",
          "11个构建步骤导航：开篇→世界观→主角→金手指→冲突→势力→力量→货币→地图→情节→自由讨论",
          "双模式切换：💬对话模式(自由交流) / 🃏抽卡模式(AI出3-5张候选卡，点选采纳)",
          "POST /api/explore/chat——AI对话端点，上下文来自构建配置+已采纳内容+当前步骤",
        ],
      },
      {
        label: "构建配置面板",
        items: [
          "基础字段：小说名称/主角名称/创作方向",
          "类型选择：12种小说类型(玄幻/仙侠/都市/科幻/历史/言情/悬疑/武侠/奇幻/末世/游戏/军事)",
          "流派标签：60+流派(系统流/重生/穿越/无敌流等)，多选自由组合",
          "受众定位+篇幅字数+情节结构(五幕式/三幕式/英雄之旅/起承转合/序破急)",
          "风格偏好8选+力量体系40选+金手指50选+核心冲突+强制原创命名+自动生成故事线",
        ],
      },
      {
        label: "创建项目",
        items: [
          "POST /api/explore/create——从构建配置+已采纳内容创建项目",
          "📦 直接创建——采纳的设定→世界书词条(按步骤自动分类)+主角名→角色卡",
          "🤖 AI完善后创建——LLM检测缺失设定并补充后再创建",
          "导航栏新增「🎯 探讨」入口，与拆书/设置并列",
        ],
      },
    ],
  },
  {
    version: "v0.20.35",
    date: "2026-06-18",
    title: "🛡️ Step 0硬过滤 + 复合名拆分 + 拆书预览迷你卡",
    sections: [
      {
        label: "Step 0 硬过滤",
        items: [
          "characters/expand 在AI审计前增加代码级预过滤——isValidCharName()内联实现",
          "100+字段标签硬黑名单（性别/年龄/外貌/一、主角/二、配角/在/背/与/性/说...）",
          "100+常见姓氏白名单——2字名须以姓氏开头",
          "硬过滤先删→再AI审计→再扩展，三步递进确保零垃圾残留",
        ],
      },
      {
        label: "复合名智能拆分",
        items: [
          "「叶临渊 / 林玄言」在硬过滤阶段检测到斜杠→自动拆为两个独立角色卡",
          "拆分后继承原卡的background/abilities/personality等数据",
          "自动标记「🆕 自动拆分」标签",
        ],
      },
      {
        label: "拆书预览迷你卡",
        items: [
          "DissectDimensions角色预览从简单name标签→迷你角色卡（头像+名字+角色badge+描述）",
          "角色定位badge色彩区分：★主角(amber)/◆反派(red)/◈导师(blue)/●配角(gray)",
          "parseCharPreviewDetailed()返回CharPreviewItem结构（name+role+description+abilities）",
          "预览格式匹配工作区CharacterList，导入前后视觉完全一致",
        ],
      },
    ],
  },
  {
    version: "v0.20.34",
    date: "2026-06-18",
    title: "🔧 AI审计prompt修复——字段标签黑名单",
    sections: [
      {
        label: "角色扩展审计修复",
        items: [
          "新增【绝对非角色】黑名单——50+字段标签（性别/年龄/外貌/说话风格/别名/称号等）",
          "分段标题检测——「一、主角」「二、主要配角」「三、反派」等直接标记为非角色",
          "单字属性检测——「在」「背」「与」「性」「说」「年」「外」「能」「动」「别」「关」",
          "常见姓氏引导——李王张刘陈杨赵黄周吴等100+姓氏作为角色识别辅助",
        ],
      },
      {
        label: "世界书扩展审计修复",
        items: [
          "新增【绝对非词条】黑名单——角色字段标签+分段标题+角色名检测",
          "2-4字中文姓名检测——不会再把角色名保留在世界书列表中",
          "审计失败降级为全保留——避免误删正常词条",
        ],
      },
      {
        label: "端到端检验",
        items: [
          "琼明神女录项目实测：30角色→AI审计合并13组重复→17个去重后→扩展中",
          "修复后再次扩展将正确删除「在剧情中的作用」等12个字段标签",
          "最终预期：保留3-5个真实角色（裴语涵/季婵溪/叶临渊/林玄言/俞小塘）",
        ],
      },
    ],
  },
  {
    version: "v0.20.33",
    date: "2026-06-18",
    title: "📚 世界书AI扩展 + 五步管线",
    sections: [
      {
        label: "世界书AI扩展",
        items: [
          "POST /api/lorebook/expand — SSE流式，12并发，对标角色卡扩展端点",
          "五步管线：AI审计 → 拆分组合词条 → 删除非词条 → 去重合并 → 并发扩展",
          "每完成一个词条即时推送SSE进度 + 结果弹窗展示成功/失败列表",
          "LorebookList新增「🤖 AI扩展」按钮——勾选词条后一键处理",
        ],
      },
      {
        label: "AI审计",
        items: [
          "检测非词条——角色名/无关内容混入世界书列表→自动删除",
          "检测组合词条——一个词条涵盖多个独立主题→自动拆分新建",
          "检测分类错误——标题/内容与category不匹配→自动修正（geography/faction/magic_system等10类）",
          "审计失败不阻塞流程——降级为保留原数据继续扩展",
        ],
      },
      {
        label: "单词条扩展",
        items: [
          "补全短内容/空内容——基于标题和项目世界观推断",
          "生成触发词——从扩展后内容提取5-8个关键词",
          "拆分请求——AI判断内容混杂时返回shouldSplit+splitEntries",
          "失败降级——解析失败用safeMerge保留原数据",
        ],
      },
    ],
  },
  {
    version: "v0.20.32",
    date: "2026-06-18",
    title: "🔧 角色名合法性校验 + AI批量结构化 + 智能拆分",
    sections: [
      {
        label: "角色名合法性校验",
        items: [
          "常见中文姓氏库（100+单姓+20+复姓）——2字名必须以常见姓氏开头才认",
          "FIELD_LABELS 过滤集（100+字段标签）——性别/年龄/外貌/说话风格等永不误认",
          "isValidCharacterName() 统一校验——纯中文/长度2-5/含姓氏/不在标签集",
          "含顿号分段标题过滤——「一、主角」「二、主要配角」不被当成角色名",
        ],
      },
      {
        label: "AI批量结构化",
        items: [
          "aiStructureCharacters()——一次LLM调用补全所有兜底角色的年龄/性别/外貌/性格",
          "结构化输出匹配 CharacterCard 完整字段：appearance/personality/background/abilities/aliases",
          "AI失败自动降级为仅名字导入，不影响流程",
          "兜底导入角色自动加「🤖AI补全」标签，方便识别",
        ],
      },
      {
        label: "智能拆分与后处理",
        items: [
          "「叶临渊 / 林玄言」→ 自动拆分为两个独立角色，共享原有描述上下文",
          "parseCharacterList 结尾统一过滤——所有策略的产出都过合法性校验",
          "extractCharacterNamesFromAllDimensions 双重过滤——parseCharacterList + isValidCharacterName",
        ],
      },
    ],
  },
  {
    version: "v0.20.31",
    date: "2026-06-18",
    title: "🔧 角色导入修复 + AI填满按钮 + 格式统一",
    sections: [
      {
        label: "角色导入修复",
        items: [
          "quick模式分割重试：维度内容<20字符自动模糊匹配+独立LLM重试",
          "全字段映射：age/gender/aliases/appearance/dialogueStyle完整导入CharacterCard",
          "兜底扫描：角色维度解析失败时从大纲摘要/故事核心/势力阵营扫描角色名",
          "角色预览：拆书完成页显示提取到的角色名列表，一目了然",
        ],
      },
      {
        label: "AI填满按钮",
        items: [
          "角色卡编辑：🤖 AI填满按钮检测空白字段（外貌/性格/对话风格/背景等）自动补全",
          "世界书编辑：🤖 AI填满按钮补全词条内容和触发关键词",
          "POST /api/characters/[id]/autofill + /api/lorebook/[id]/autofill 两个端点",
          "补全后自动去除「📥拆书导入」标签，标记为已人工处理",
        ],
      },
      {
        label: "格式统一",
        items: [
          "拆书导入映射完整CharacterCard字段：appearance/personality/dialogueStyle/hiddenMotives等",
          "缺失字段留空（年龄=未知/性别=未知），不伪造数据",
          "DissectDimensions顶部新增三卡片导入预览：角色数/世界书词条数/文风状态",
          "characterPreview函数快速预扫角色名，不依赖完整解析",
        ],
      },
    ],
  },
  {
    version: "v0.20.30",
    date: "2026-06-18",
    title: "🎨 拆书结果UI重设计 + 双路径创建项目",
    sections: [
      {
        label: "结果展示重做",
        items: [
          "分组卡片式：总览/世界设定/力量体系/角色剧情/物品风格 5大组可折叠",
          "维度内嵌展开：300字预览→点击展开全部Markdown内容",
          "章节摘要双列网格：编号+标题+摘要，一目了然",
          "空维度自动隐藏，有内容的才显示",
        ],
      },
      {
        label: "双路径创建",
        items: [
          "📦 原样转项目：一键100%还原，角色/世界观/情节全部照搬",
          "🎨 改编后转项目：与Agent讨论修改方案，改满意后应用并创建",
          "to-project API 接受 modifications 参数，改编要求写入 authorNote + globalPrompt",
          "改编项目名自动加[改编]前缀，方便与原版区分",
        ],
      },
      {
        label: "改编讨论面板",
        items: [
          "新增 DissectAdaptPanel 组件：左侧参考拆书数据，右侧Agent对话",
          "修改要求自动累积，点击「应用修改并创建」时一起提交",
          "复用 /api/generate/chat 端点，零额外API开销",
        ],
      },
    ],
  },
  {
    version: "v0.20.29",
    date: "2026-06-18",
    title: "🔧 拆书进度可视化 + 防抖动优化",
    sections: [
      {
        label: "SSE 实时进度",
        items: [
          "start API 从 fire-and-forget 改为 SSE 长连接——连接存活 = 任务在跑",
          "不再丢异步上下文——之前 POST 返回后 Next.js 可能回收执行环境",
          "实时推流阶段：分章→维度提取(每完成一个维度推一次)→章节摘要",
          "前端 AbortController 支持中途取消",
          "SSE 断开后 DB 有完整进度,重进详情页轮询恢复",
        ],
      },
      {
        label: "屏幕晃动修复",
        items: [
          "进度条从 width 动画改为 transform: scaleX()——GPU 合成层,不走 reflow/layout",
          "will-change: transform 提前提升到合成层",
          "固定 min-height 容器：进度区 120px、维度网格 56px、内容区 60vh",
          "章节进度预分配空间(minHeight:20),文本出现不跳动",
          "tabular-nums 数字等宽,百分比变化时数字不位移",
        ],
      },
      {
        label: "轮询逻辑重构",
        items: [
          "useRef 存 interval——消除 useEffect 闭包陷阱导致的重复/遗漏轮询",
          "始终轮询(不管什么状态),后端决定返回什么——不再有条件判断导致停轮",
          "taskRef 实时同步最新状态给 interval 回调",
          "任务完成后降频到 30s 一次(省资源)",
        ],
      },
    ],
  },
  {
    version: "v0.20.28",
    date: "2026-06-18",
    title: "⚡ 拆书系统性能优化 — 并行化 + 智能采样",
    sections: [
      {
        label: "维度提取并行化",
        items: [
          "标准模式：4组维度并行跑 → 耗时从~80s降至~20s（4x提速）",
          "精细模式：15维度并发池(limit=8) → 耗时从~300s降至~40s（~8x提速）",
          "快速模式不变（本身单次LLM调用，无法再拆）",
          "通用并发池 withConcurrency<T,R>()——任意批处理任务可复用",
        ],
      },
      {
        label: "章节摘要并发池",
        items: [
          "withConcurrency(8) 模式——复用 characters/expand 的并发池设计",
          "50章从串行~250s降至并发~35s（~8x提速）",
          "单章失败不阻断其他章——容错性比串行更好",
        ],
      },
      {
        label: "智能文本采样（省Token+提质量）",
        items: [
          "buildDimensionTextSample()：每个维度只看对它最有价值的文本部位",
          "角色维度→对话密集段落+前5章完整出场",
          "风格维度→头/中/尾三段代表性样本（避免头重脚轻）",
          "情节维度→各章开头段落（情节引入点）",
          "地图/势力→搜索含地名/势力名的段落",
          "力量/功法→搜索含修炼术语的段落",
          "货币/物品→搜索含交易/物品关键词的段落",
          "预期：精准度提升 + Token节省~30%",
        ],
      },
      {
        label: "容错与进度",
        items: [
          "降级容错：单维度/单章失败自动标记failed，继续跑不拖累整体",
          "实时进度：每完成一个维度/章节就更新DB，前端轮询2s可见",
          "DB更新失败静默忽略（.catch(()=>{})），不影响提取主流程",
        ],
      },
    ],
  },
  {
    version: "v0.20.27",
    date: "2026-06-18",
    title: "📚 整本拆书系统 — 15维度智能拆解 + 仿写引擎",
    sections: [
      {
        label: "拆书导航（3页面）",
        items: [
          "/dissect — 任务列表，实时进度轮询，删除管理，转为项目快捷入口",
          "/dissect/new — 新建拆书，TXT文件上传/粘贴文本，三级深度选择，逐章摘要开关",
          "/dissect/[id] — 结果+仿写双标签页，15维度切换查看，仿写面板全功能",
        ],
      },
      {
        label: "15维度拆解",
        items: [
          "覆盖世界卡全部维度：基本信息/世界观/故事核心/角色/情节脉络/大纲摘要/伏笔/地图/势力阵营/力量体系/特殊设定/货币体系/物品/功法体系/写作风格分析",
          "三种深度：快速（1次LLM全提）/ 标准（4组分批）/ 精细（15维各单独LLM调用）",
          "可选逐章摘要：每章独立提取摘要+新角色+伏笔+情感基调",
        ],
      },
      {
        label: "仿写引擎",
        items: [
          "三种仿写模式：完全仿写（高还原原作风骨）/ 部分仿写（留骨架创新）/ 创意改写（借灵感重写）",
          "相似度滑块 0-100%，控制与原作结构/风格/RU的接近程度",
          "15维度自由勾选——选哪些原作维度，仿写就继承哪些设定",
          "SSE 流式实时输出，自定义额外要求栏位",
        ],
      },
      {
        label: "技术实现",
        items: [
          "Prisma 新模型 DissectionTask：JSON字段存15维度+章节列表，@db.Text 存全文",
          "核心引擎 src/core/dissect/：types(15维度定义) + prompts(提取模板) + engine(分章+逐维提取+转项目) + imitation-engine(仿写上下文构建+SSE流)",
          "5个新API：start / [id] / list / dimensions / to-project / imitate/start",
          "4个新组件：DissectUpload + DissectProgress + DissectDimensions + ImitationPanel",
          "仪表盘新增「📚 拆书」导航入口",
        ],
      },
    ],
  },
  {
    version: "v0.20.26",
    date: "2026-06-18",
    title: "📐 文风预设11种 + 5种大纲模板 + 游戏模式就绪",
    sections: [
      {
        label: "大纲模板（outlines.ts 新建）",
        items: [
          "三幕式：建置25%→对抗50%→结局25%，电影级结构",
          "起承转合：中国传统四段式，起20%/承35%/转30%/合15%，仙侠首选",
          "英雄之旅：12阶段坎贝尔原型，启程30%/启蒙45%/归来25%，长篇成长型",
          "章回体：每章独立成篇+章尾悬念钩子+对仗标题，网文连载标准节奏",
          "自由结构：不拘套路，AI做执行者，作者做结构师",
        ],
      },
      {
        label: "文风预设扩充",
        items: [
          "styles.ts 从9种扩充到11种：新增古风仙侠（半文半白+修仙体系）+ 现代都市（当代中文+场景驱动）",
          "覆盖全类型：热血/日常/黑暗/悬疑/恋爱/奇幻/科幻/情欲古风/仙侠/都市/自定义",
          "每种预设含 stylePrompt + temperature/topP + forbiddenPatterns + pacing/dialogueGuide",
        ],
      },
      {
        label: "游戏模式（已有）",
        items: [
          "game-engine.ts 446行 + game-prompts.ts 261行 + types.ts + 5个API路由 + 3个前端组件",
          "start/action/end 完整回合循环 + outline/generate + outline/chat 大纲辅助",
          "GameCanvas + GameParticles + GameOutlineEditor 前端就绪",
        ],
      },
    ],
  },
  {
    version: "v0.20.25",
    date: "2026-06-18",
    title: "🤖 Agent 工具层——智能调度 + 意图解析 + 分层提示词 + 对话压缩",
    sections: [
      {
        label: "工具依赖图调度 + 意图解析 + 路由",
        items: [
          "tool-scheduler.ts——拓扑排序自动分析21个工具依赖，18个并行+3个串行",
          "intent-parser.ts——纯规则引擎，关键词+正则拆解自然语言，覆盖六大意图类别",
          "agent-router.ts——一条管道串起 解析→调度→执行→汇总，21种工具各有专属摘要模板",
          "低置信度/空结果→needsLLMFallback()返回true，上游LLM兜底",
        ],
      },
      {
        label: "分层提示词 + 对话压缩",
        items: [
          "layered-prompt.ts——五层结构：身份/硬规则★★★/中等规则★/动态上下文/工具说明",
          "每层独立可启用/禁用/编辑，assembleLayeredPrompt()按层组装",
          "conversation-compressor.ts——三层策略压缩对话，纯规则摘要零Token",
          "主动压缩(6000+token→300摘要) / 极端压缩(8000+→仅保留最近3轮)",
        ],
      },
    ],
  },
  {
    version: "v0.20.24",
    date: "2026-06-18",
    title: "🧠 S/A/B 三级记忆注入 + Token 优化五策略 + 长效记忆衰减",
    sections: [
      {
        label: "S/A/B 三级记忆注入（Token 优化五策略）",
        items: [
          "memory-injector.ts——JSON结构化（省40%）、选择性字段、增量去重、引用压缩、分层截断",
          "pre-processor.ts 自动调用 classifyEvents 做 S/A/B 分级，orchestrator 注入 systemPrompt",
          "S级用紧凑JSON、A级只注章节号+描述、B级用关键词索引，综合节省~60% Token",
        ],
      },
      {
        label: "长效记忆衰减引擎",
        items: [
          "memory-decay.ts——S级永久/A级30章/B级15章/C级5章，过期自动逐级降级",
          "computeEventDecay() 单事件衰减计算，支持多级跳跃（A→C一次性跨级）",
          "cleanupExpiredMemories() 遍历所有 ChapterSummary.eventImportances 应用衰减",
        ],
      },
      {
        label: "衰减清理 API",
        items: [
          "GET /api/cron/memory-decay?projectId=xxx&dryRun=true——预览/执行两种模式",
          "正式执行返回 kept/downgraded/deleted + S/A/B/C 各层级分布统计",
          "dryRun 模式轻量预览：不写库，仅返回衰减规则+当前摘要数+最新章号",
        ],
      },
    ],
  },
  {
    version: "v0.20.23",
    date: "2026-06-18",
    title: "🛡️ 实时质量拦截 + 六维质量矩阵 + 记忆系统升级",
    sections: [
      {
        label: "实时规则检测",
        items: [
          "write/route.ts 流式生成中每 ~200 字符实时扫描禁用词",
          "违规通过 SSE rule_violation 即时推送——写中拦截，不等写完",
          "扫描耗时 <2ms，不影响流式流畅度",
        ],
      },
      {
        label: "六维质量矩阵自动评分",
        items: [
          "新建 quality-analyzer.ts——废词率/展示vs讲述/PoV/句式/对话/主语，六维纯本地算法",
          "每维 0-100 分加权总分 → A/B/C/D 四级 → 写入 StoryNode.qualityScore",
          "复用步骤1禁用词扫描结果，避免重复计算，零 Token 消耗",
        ],
      },
      {
        label: "记忆系统——时间线过滤",
        items: [
          "context-loader.ts 自动按 currentNode.order 过滤摘要/事件/伏笔",
          "根治跳章剧情污染——写第7章不会注入第10章的角色状态",
        ],
      },
      {
        label: "待兑现事项追踪",
        items: [
          "新增 PendingItem 模型 + /api/pending-items CRUD",
          "post-processor 自动检测「下次/回头/以后」关键词 → 自动创建待办",
          "下次生成时待办事项自动注入系统提示词，提醒AI兑现",
        ],
      },
    ],
  },
  {
    version: "v0.20.22",
    date: "2026-06-18",
    title: "🎯 12维风格参数注入 + 代码去重",
    sections: [
      {
        label: "12维风格参数端到端打通",
        items: [
          "修复 Style API PUT——body.dimensions 不再被静默丢弃，正确存入 llmConfig",
          "修复 Style API GET——返回 dimensions 字段",
          "orchestrator.ts 读取 llmConfig.dimensions → 生成风格参数块注入系统提示词",
          "12维标签完整映射：词汇丰富度/句子长度/描写密度/对话比例/修辞手法/节奏速度/心理描写/环境描写/口语化/幽默感/暴力程度/暧昧程度",
        ],
      },
      {
        label: "continue/route.ts 消除内联查询",
        items: [
          "改用 loadGenerationContext(projectId, currentNodeId, 5)，与 write/refine 统一",
          "删除 9 表 Promise.all 内联查询块",
        ],
      },
      {
        label: "chapter-outline 路由代码去重",
        items: [
          "新建 src/core/pipeline/outline-context.ts 共享模块",
          "6 个共享函数：loadOutlineData/extractPrevContext/extractNextContext/buildCharacterList/prepareOutlineDirective/formatSummaries",
          "chapter-outline/route.ts 和 draw/route.ts 各减少 ~60 行重复代码",
        ],
      },
    ],
  },
  {
    version: "v0.20.21",
    date: "2026-06-17",
    title: "🧹 全站架构自查+清理",
    sections: [
      {
        label: "前端死代码清理（-2300行）",
        items: [
          "CardUpdater（1051行）— PostGenPanel 替代",
          "ChapterExtractionPanel（612行）— PostGenPanel 替代",
          "OutlineGenerator（327行）— OutlineDialog 替代",
          "EntityDetector（253行）— 旧UI残留",
          "StreamingText（11行）— MarkdownViewer 替代",
        ],
      },
      {
        label: "后端死代码清理",
        items: [
          "/api/agent/logic-check — post-processor 已内联相同逻辑且更完整",
          "/api/generate/check-all-cards — 前端不调用",
          "/api/generate/update-style-card — 文风走 projects/[id]/style",
          "commitment-tracker.ts — 完整类从未实例化",
        ],
      },
      {
        label: "Schema + Store 清理",
        items: [
          "移除 Project.povCharacterId / StoryNode.previousVersionId 死字段",
          "移除 Store reviewPanelOpen 死状态",
          "移除 core/types 中对应的死类型定义",
        ],
      },
      {
        label: "重复修复 + P0 集成",
        items: [
          "ReviewPanel 不再在 CenterPanel 重复渲染，审校结果只看 PostGenPanel",
          "PostGenPanel 改用统一 ReviewIssue 类型",
          "抽卡 DrawCards API 输出 P0 标准格式章纲 + 语法高亮着色",
        ],
      },
    ],
  },
  {
    version: "v0.20.20",
    date: "2026-06-17",
    title: "📋 P0标准格式章纲系统 + 游戏页内置编辑器",
    sections: [
      {
        label: "结构化章纲格式",
        items: [
          "三层架构：元信息(C|/L0|/L1|/L2|) → 叙事段落(R|/L|/G|/P|/⟨✍⟩) → 技术规格(CF|/M|/K|/EL|/T|)",
          "R|角色行动 L|场景切换 G|金手指 P|剧情推进 CF|伏笔 M|情绪 K|金句 EL|弧线 T|过渡",
          "⟨✍ 写作指令⟩ 导演批注，不构成故事内容，只指导AI怎么写",
        ],
      },
      {
        label: "章纲生成API",
        items: [
          "/api/game/outline/generate — Agent按P0格式一键生成，自动匹配角色白名单+地点+伏笔+前后章约束",
          "/api/game/outline/chat — 多轮对话确认章纲（SSE流式），支持探讨-反馈-定稿循环",
        ],
      },
      {
        label: "游戏页内置章纲编辑器",
        items: [
          "三模式切换：✏️编辑（语法高亮） / 👁预览（着色渲染） / 💬对话（AI对话确认）",
          "10种行类型着色：C|青 R|绿 L|青 G|金 P|灰 CF|紫 M|玫瑰 K|琥珀 EL|粉 T|青",
          "⚡AI生成按钮 + 💾保存到StoryNode.outline",
        ],
      },
      {
        label: "章节树游戏入口",
        items: [
          "每个章节/分节节点悬停即显示🎮按钮，点击直接进入游戏模式",
          "无需先在workspace选中章节再点游戏按钮",
        ],
      },
    ],
  },
  {
    version: "v0.20.19",
    date: "2026-06-17",
    title: "🎮 游戏模式上线——互动文本冒险写作",
    sections: [
      {
        label: "独立沉浸式 UI",
        items: [
          "全新路由 /workspace/[pid]/game/[nid]，全屏暗黑主题三栏布局",
          "6 个快捷动作按钮：观察/对话/战斗/探索/使用物品/休息 + 自定义文本输入",
          "简单星空粒子背景动画，安静不喧宾夺主",
        ],
      },
      {
        label: "核心游戏循环",
        items: [
          "SSE 流式输出：用户行动 → AI 生成 300-600 字叙事 → 2-4 个编号选项 → 循环",
          "每轮产出实体追踪（NE|格式）+ 背包变动（CI|格式）+ 情节进度百分比",
          "左侧面板：情节/角色/势力 Tab，右侧面板：正文/背包/世界 Tab",
        ],
      },
      {
        label: "结束并导出",
        items: [
          "点击\"结束并导出\"→检查章纲\"章尾悬念\"钩子→有钩子用钩子收尾，无钩子自然收束",
          "拼接全部累积正文→保存为 StoryNode.content，与 AI 直写无差别",
          "返回工作区即可看到完整章节正文",
        ],
      },
      {
        label: "后端新增",
        items: [
          "新增 GameSession + GameState 两张数据表",
          "3 条 API：/api/game/start /action（SSE） /end",
          "新增 src/core/game/ 模块：game-engine.ts / game-prompts.ts / types.ts",
          "CenterPanel 新增 🎮 游戏模式入口按钮",
        ],
      },
    ],
  },
  {
    version: "v0.20.18",
    date: "2026-06-17",
    title: "文风面板12维度升级 + 统一分析面板 + 逻辑自查 + 前端大清理",
    sections: [
      {
        label: "文风面板全面升级",
        items: [
          "10种预设风格库（热血/日常/黑暗/悬疑/恋爱/史诗/科幻/古风/极简/自定义），一键切换",
          "12维度滑块微调：词汇丰富度/句子长度/描写密度/对话比例/修辞手法/节奏速度/心理描写/环境描写/口语化/幽默感/暴力/暧昧",
          "废词检测引擎v3.0：5类检测器（精确禁用词/句式模式/身体模板/模糊词密度/AI高频词），内置50+规则，质量评分0-100",
          "三Tab面板：文风维度/废词检测（含扫描按钮）/LLM参数",
        ],
      },
      {
        label: "统一分析面板 PostGenPanel",
        items: [
          "4 Tab：📊章节提取/🔍逻辑自查/⚡本地蒸馏/📝审校，替代旧版6个碎片UI",
          "删除2个浮动横幅+1个浮动按钮+1个全屏加载遮罩+ChapterExtractionPanel+CardUpdater",
          "\"继续写下一节\"按钮移至PostGenPanel底部操作栏，\"AI分析本章变化\"改为自动触发",
        ],
      },
      {
        label: "逻辑自查自动化",
        items: [
          "新增 /api/agent/logic-check：角色死活一致性/时间线连续/关系突变/物品追踪，零Token",
          "切换到逻辑自查Tab自动运行，可手动重新检查",
        ],
      },
      {
        label: "前端大清理",
        items: [
          "删除 autoAnalyzeChapter 旧函数，统一为 autoExtractChapter → PostGenPanel",
          "删除 cardUpdatePending/pendingCardUpdateNodeId/autoUpdateNotification/preCardUpdateResult 等过时state",
          "CenterPanel 删除\"继续写下一节\"和\"AI分析本章变化\"两个按钮",
        ],
      },
    ],
  },
  {
    version: "v0.20.17",
    date: "2026-06-17",
    title: "章节自动提取系统 + 角色关系维度 + Agent 会话记忆",
    sections: [
      {
        label: "章节自动提取（12 维度）",
        items: [
          "生成完自动弹出提取面板：角色/场景/势力/道具/伏笔/情绪/台词/摘要/衔接/要素/经历/关系",
          "逐项采纳/编辑/取消，智能路人检测（提及<3次+无对话+无行动→不建卡）",
          "批量写入 5 张表：角色卡/世界书/伏笔/章节摘要/下章大纲",
          "替代旧 CardUpdater 自动触发，CardUpdater 保留手动入口作后备",
        ],
      },
      {
        label: "角色关系——世界书新维度",
        items: [
          "关系存为世界书条目 (character_relationship)，零 schema 变更",
          "Agent 从正文自动提取关系 → 融合替代写入世界书",
          "正文生成时强制注入涉及角色的关系条目（不走触发词，直接按角色名查）",
          "WorldPanel 新增「角色关系」板块，RelationshipGraph 重写为正文分析驱动",
        ],
      },
      {
        label: "Agent 会话记忆 + 写后分析",
        items: [
          "会话记忆：内存存储，按项目隔离，最多 20 条，30 分钟过期",
          "写后分析：对比正文 vs 角色卡，一键采纳更新能力/性格/关系/别名/状态/外貌",
          "新增 4 个 Agent 工具：analyze_chapter / analyze_relationships / relation_sync / extract_chapter",
        ],
      },
    ],
  },
  {
    version: "v0.20.16",
    date: "2026-06-17",
    title: "右侧栏重构——三 tab 一体化",
    sections: [
      {
        label: "三 tab 架构",
        items: [
          "🤖 AI助手——AI 对话栏从页面底部移入右侧面板",
          "🔍 查询实体——实体追踪 + 伏笔，子 tab 切换",
          "📊 监测——字数概览/Token估算/章节分布/数据记录",
        ],
      },
      {
        label: "监测面板",
        items: [
          "总字数/完成率/当前章字数/均章字数 实时展示",
          "Token 估算：生成/提示/总计（中文 1字≈0.8生成token）",
          "章节分布：最多/最少字数、完成进度",
        ],
      },
      {
        label: "交互优化",
        items: [
          "最小化状态三条竖排标签可点击切 tab",
          "底部统计栏 + 可折叠上下文监控保留",
        ],
      },
    ],
  },
  {
    version: "v0.20.15",
    date: "2026-06-17",
    title: "Agent 工具箱全面升级——21 工具接管所有按钮",
    sections: [
      {
        label: "角色管理 (5)",
        items: [
          "character_list/get/create/update/delete——完整 CRUD，create 支持快速导入原文描述",
          "character_get 返回完整信息：性格/外貌/对话风格/关系网/时间线/弧光",
        ],
      },
      {
        label: "世界书管理 (5)",
        items: [
          "lore_list/get/create/update/delete——覆盖地理/势力/物品/功法/生物/文化等全部 10 种分类",
          "lore_create 自动设置触发关键词，正文出现关键词时自动注入",
        ],
      },
      {
        label: "大纲管理 (4)",
        items: [
          "outline_list 返回完整大纲树（卷→章→节层级，含状态/字数）",
          "outline_create/update/delete——支持指定父节点、递归删除子节点",
        ],
      },
      {
        label: "伏笔 + 正文 + 其他 (7)",
        items: [
          "foreshadowing_list/create/update——创建/追踪/回收伏笔",
          "chapter_get/generate——查询正文 + 触发写作面板（frontendAction 机制）",
          "detect_entities + project_info——实体扫描 + 项目统计",
        ],
      },
      {
        label: "前端工具箱",
        items: [
          "AIChatBar 新增 6 个工具按钮：🧑查角色 📖查设定 🔮查伏笔 🔍扫实体 📋大纲 📊项目",
          "/api/tools/execute 接口——前端按钮直接执行任意工具",
          "chat route 支持 frontendAction 透传——工具可以通知前端弹面板",
        ],
      },
    ],
  },
  {
    version: "v0.20.14",
    date: "2026-06-17",
    title: "记忆系统闭环 + Agent 工具层",
    sections: [
      {
        label: "规则分类接入",
        items: [
          "memory-classifier 新增 tieredMemoryToImportances + classifyAndConvert 转换函数",
          "post-processor step 4.5 自动运行规则分类，LLM+规则双保险合并存入 ChapterSummary",
          "SSE classify_done 事件推送分类统计，失败降级不阻塞",
        ],
      },
      {
        label: "伏笔页签",
        items: [
          "ForeshadowingPanel 新组件——按状态分组（埋设中/部分回收/已回收/已废弃）",
          "/api/foreshadowing/list 新接口，按 projectId 返回分组伏笔列表",
          "RightPanel 支持实体/伏笔双 tab 切换，最小化状态动态显示当前 tab 名",
        ],
      },
      {
        label: "Agent 工具层",
        items: [
          "tool-registry 单例注册表——detect_entities/query_characters/query_lore/check_foreshadowing",
          "LLM client 支持 tools 参数 + toolCalls 解析 + tool 角色消息",
          "chat route 工具调用循环——LLM 可主动查角色/设定/伏笔后作答（最多 3 轮）",
        ],
      },
    ],
  },
  {
    version: "v0.20.13",
    date: "2026-06-17",
    title: "记忆系统——S级伏笔强制注入",
    sections: [
      {
        label: "S级记忆",
        items: [
          "buildForeshadowingSection——从 PendingCommitment 加载未回收伏笔，按到期章号排序",
          "标注 ⚠️ 待回收 + 预计回收章 + 关联角色，Token 预算 5%",
          "context-loader 并行加载 pendingCommitments（最多 30 条），所有路由自动生效",
        ],
      },
      {
        label: "记忆分级引擎",
        items: [
          "memory-classifier.ts — S/A/B 三级：伏笔+major→S，近5章→A，老章节→B归档",
          "formatTieredMemory() 按 token 预算智能截断注入",
        ],
      },
      {
        label: "Token 预算调整",
        items: [
          "新增 foreshadowing 5%（从 shortTerm 分出）",
          "shortTerm: 25%→20%，其他不变",
        ],
      },
    ],
  },
  {
    version: "v0.20.12",
    date: "2026-06-17",
    title: "右侧实体追踪面板 + 底部 AI 对话栏",
    sections: [
      {
        label: "实体追踪面板",
        items: [
          "ChapterEntitiesPanel 扫描章节正文，按 6 组分类展示已出现实体（角色/势力/物品/地点/世界观/功法）",
          "颜色圆点 + 实体名 + 数量标记，点击实体名打开编辑弹窗",
          "未注册实体标记提示，底部统计已注册总数和本章匹配次数",
          "RightPanel 标题改为「实体追踪」，原上下文监控折叠到底部",
        ],
      },
      {
        label: "AI 对话栏",
        items: [
          "AIChatBar 页面底部常驻：输入框 + 发送按钮 + 4 条快捷建议",
          "选中正文区间自动带上文发送，AI 回复显示在输入框上方",
          "新 API /api/generate/chat —— 200 字以内回复，温度 0.7",
        ],
      },
      {
        label: "共享逻辑",
        items: [
          "findEntitiesInText() 从 rehype 插件抽取到 entity-highlighter.ts",
          "高亮渲染和面板扫描共用同一套匹配逻辑（最长名优先 + 词边界检测）",
        ],
      },
    ],
  },
  {
    version: "v0.20.11",
    date: "2026-06-17",
    title: "Markdown 渲染 + 实体高亮 + 阅读排版",
    sections: [
      {
        label: "Markdown 渲染",
        items: [
          "MarkdownViewer 组件——react-markdown + remark-gfm，替换纯文本 StreamingText",
          "支持标题/粗斜体/引用块/列表/表格/代码块/删除线/链接，深色主题定制样式",
        ],
      },
      {
        label: "阅读排版",
        items: [
          "正文字号 14px→17px，行距 1.6→1.85，字间距 0.02em，内容区 700px 居中",
          "颜色纯白→柔白 #e2e2e2，章节标题自动居中，护眼舒适",
        ],
      },
      {
        label: "实体颜色高亮",
        items: [
          "低饱和度色板：柔蓝 #5B9BD5 / 苔绿 #70AD47 / 暗金 #D4A017 / 赭石 #C55A11 / 淡紫 #9B59B6",
          "API 路由加载→客户端 fetch + 60s 内存缓存",
          "rehype 插件遍历 HAST 包裹彩色 span，跳过 code/pre/a 标签",
          "正文底部实体图例 + 流式兼容",
        ],
      },
    ],
  },
  {
    version: "v0.20.10",
    date: "2026-06-17",
    title: "文风系统接通——模板 stylePrompt 真正注入生成提示词",
    sections: [
      {
        label: "核心修复",
        items: [
          "sync-global-prompt.ts 现读 llmConfig.styleTemplateId→加载模板→注入 stylePrompt+禁用词+节奏+对话指引",
          "style/route.ts 切换模板后自动调 syncGlobalPrompt 刷新缓存",
          "此前 9 个预设模板完全写好但 applyTemplate() 从未被任何生成路由调用——stylePrompt 只影响 temperature/topP",
        ],
      },
      {
        label: "注入内容",
        items: [
          "stylePrompt：200-300 字详细写作指令，标注为「最高优先级」",
          "禁用词/句式：从 forbiddenPatterns 转为 prompt 指令（不再仅后处理检查）",
          "节奏指引 pacingGuide + 对话指引 dialogueGuide 一并注入",
        ],
      },
    ],
  },
  {
    version: "v0.20.9",
    date: "2026-06-17",
    title: "人物关系独立提取 + 自动应用模式",
    sections: [
      {
        label: "人物关系提取",
        items: [
          "update-cards prompt 新增 characterRelations 输出（sourceName/targetName/relation/reason）",
          "关系类型 15 种：仇恨/爱慕/盟友/敌对/师徒/主仆/同门/血亲/恩人/利用/敬仰/嫉妒/竞争/合作",
          "apply-updates 多向总结：已存在关系→追加动态和原因，不存在→新建",
          "CardUpdater 新增 👥人物关系展示区域（粉色高亮）",
        ],
      },
      {
        label: "自动应用模式",
        items: [
          "CardUpdater 新增自动应用复选框——localStorage 持久化",
          "勾选后全选所有提取结果→自动调 apply-updates→关闭，跳过手动确认",
          "不勾选保持原有手动确认流程",
        ],
      },
    ],
  },
  {
    version: "v0.20.8",
    date: "2026-06-17",
    title: "世界构建面板拆分——11 板块独立管理",
    sections: [
      {
        label: "WorldPanel 组件",
        items: [
          "新建 WorldPanel 组件：11 个独立板块（地理/势力/物品/力量/功法/生物/文化/历史/法则/货币/特殊设定）",
          "每板块独立字段模板——地理有类型+父级，功法有品阶+属性+传承，货币有材质+层级+流通",
          "LeftPanel 集成：世界书→世界 tab，点击切换板块，空板块显示引导",
          "数据仍存 LorebookEntry，category 区分板块，不改数据库",
        ],
      },
      {
        label: "Prompt 注入优化",
        items: [
          "buildLoreSection 改为按板块分组注入，每板块独立小标题（如 🗺️地理环境）",
          "宽松格式：- 条目名：内容描述，纯自然语言，不给 LLM 结构化压力",
        ],
      },
    ],
  },
  {
    version: "v0.20.7",
    date: "2026-06-17",
    title: "情节脉络+支线故事自动提取——Storyline 七要素映射",
    sections: [
      {
        label: "情节脉络 & 支线故事",
        items: [
          "update-cards prompt 新增 plotLines/subPlots 输出（title/type/progress/stage/characters）",
          "apply-updates 写入 Storyline 表：同名线→追加阶段进展，新线→创建，七要素字段自动填充",
          "chapterBindings 自动绑定当前章节，stage 映射到七阶段之一",
          "CardUpdater 新增 📌情节脉络推进 / 🌿支线故事展开 展示区域",
        ],
      },
      {
        label: "功法体系",
        items: [
          "newLoreEntries category 新增 technique（功法/技能/传承）选项",
          "entity-auto-creator 已经能把功法实体写入 LorebookEntry",
        ],
      },
    ],
  },
  {
    version: "v0.20.6",
    date: "2026-06-17",
    title: "章节摘要→17模块自动映射（第一阶段）",
    sections: [
      {
        label: "修复 + 扩展",
        items: [
          "修复 apply-updates 伏笔写入 bug：newForeshadowings 现在自动创建 PendingCommitment 记录",
          "update-cards prompt 扩展：新增 worldSettings（6维）/ storyCore（3维）/ globalTimeline 输出字段",
          "apply-updates 写入路径扩展：worldSettings→Project.description，storyCore→Project.synopsis，globalTimeline→StoryBeat",
          "CardUpdater 面板新增 3 个展示区域：世界观设定/故事核心/全局时间线",
        ],
      },
    ],
  },
  {
    version: "v0.20.5",
    date: "2026-06-17",
    title: "前端 SSE 事件补全——蒸馏结果实时可见",
    sections: [
      {
        label: "SSE 事件处理",
        items: [
          "workspace/page.tsx：streamSSE 新增 6 种事件处理（distill_local_start/done、foreshadow_update、entity_auto_created/skip/error）",
          "types.ts：SSEEvent 类型扩展 stats/stateChanges/foreshadowEvents/newEntities/created/updated",
          "绿色蒸馏完成通知横幅——生成后自动弹出，显示完整蒸馏统计",
        ],
      },
    ],
  },
  {
    version: "v0.20.4",
    date: "2026-06-17",
    title: "数据反哺——新实体自动入库",
    sections: [
      {
        label: "实体自动创建",
        items: [
          "entity-auto-creator.ts：新实体自动创建器——角色→CharacterCard，地点→LorebookEntry(geography)，丹药/法宝/材料→LorebookEntry(item)，功法→LorebookEntry(technique)",
          "查重：大小写不敏感对比已有角色名+世界书标题，避免重复创建",
          "新增SSE事件：entity_auto_create_start / entity_auto_created / entity_auto_skip / entity_auto_create_error",
        ],
      },
    ],
  },
  {
    version: "v0.20.3",
    date: "2026-06-17",
    title: "伏笔自动检测——本地蒸馏驱动五状态机",
    sections: [
      {
        label: "伏笔信号自动入库",
        items: [
          "post-processor.ts：蒸馏完成后自动处理伏笔——埋设信号（20个词）→创建PendingCommitment，回收信号（13个词）→标记fulfilled，深化信号（7个词）→标记partially_fulfilled",
          "去重机制：同一信号词每章只处理一次，取置信度最高者",
          "新增SSE事件：foreshadow_update（汇总通知前端）/ foreshadow_update_error（单个伏笔失败不阻塞）",
        ],
      },
      {
        label: "默认模型修正",
        items: [
          "settings/page.tsx：DeepSeek 默认模型 deepseek-v4-pro → deepseek-v4-flash（匹配 CodeX/CCX 当前配置）",
        ],
      },
    ],
  },
  {
    version: "v0.20.2",
    date: "2026-06-17",
    title: "本地蒸馏引擎——实体检测不再烧 Token",
    sections: [
      {
        label: "命名模式库 + 四遍扫描",
        items: [
          "entity-detector.ts：5 类正则（丹药/法宝/功法/地点/材料）+ 排除词库 + 归属推断（属格/动词前置/段落主人）",
          "distillation-runner.ts：四遍扫描（实体识别→状态变化→伏笔匹配→一致性校验），零 Token，<1秒/万字",
          "post-processor.ts：Step 3 和 Step 4 之间插入本地蒸馏，LLM summarize 继续运行——双轨并行",
        ],
      },
      {
        label: "全局默认模型切换",
        items: [
          "默认提供商：硅基流动 → DeepSeek 官方（api.deepseek.com）",
          "默认模型：deepseek-ai/DeepSeek-V4-Flash → deepseek-v4-pro",
          "修复 outline/route.ts 和 characters/expand/route.ts 硬编码硅基流动 URL",
        ],
      },
    ],
  },
  {
    version: "v0.20.1",
    date: "2026-06-17",
    title: "API Key 动态透传——全局设置全面生效",
    sections: [
      {
        label: "修复 401 Invalid token",
        items: [
          "parser.ts 三个函数 fallback 从 getDefaultClient()（读 env vars→空 token→401）改为 getEffectiveConfig()（读数据库 AppSettings）",
          "update-cards/route.ts 变化检测同样从 getDefaultLLMConfig() 改为 getEffectiveConfig()",
          "全部 LLM 调用路径统一走数据库全局设置",
        ],
      },
    ],
  },
  {
    version: "v0.20.0",
    date: "2026-06-17",
    title: "写作质量闭环——禁用词v2.0 + 审校9维 + 管线全覆盖",
    sections: [
      {
        label: "禁用词检查器 v2.0",
        items: [
          "正则表达式支持：/pattern/flags 格式自动识别，强制 g 标志防死循环",
          "三级严重度：error/warning/info + 替换建议",
          "无效正则自动降级为精确匹配",
        ],
      },
      {
        label: "审校维度扩展",
        items: [
          "5维→9维：新增节奏/对话质量/描写密度/情绪一致性",
          "审校 Prompt 和 ReviewIssueType 同步更新",
        ],
      },
      {
        label: "管线覆盖",
        items: [
          "refine 路由接入 runPostGenerationPipeline",
          "3个路由全部使用统一后处理管线",
        ],
      },
      {
        label: "诊断修复",
        items: [
          "正则无 g 标志死循环、allNodes 过滤导致 previousNodes 错误",
          "角色集不一致、authorNote 双重注入、审校缺异常保护",
        ],
      },
    ],
  },
  {
    version: "v0.19.1",
    date: "2026-06-17",
    title: "架构重构——生成管线抽取，消除 60% 路由重复代码",
    sections: [
      {
        label: "新增管线模块",
        items: [
          "context-loader.ts — loadGenerationContext() 统一7表数据加载",
          "pre-processor.ts — 角色自建/过滤/备注/规则注入/LLM配置提取/上下文构建",
          "post-processor.ts — runPostGenerationPipeline() 扫描→审校→存储→摘要完整后处理链",
        ],
      },
      {
        label: "路由精简",
        items: [
          "write/route.ts：424行 → ~170行",
          "refine/route.ts：277行 → ~140行",
          "continue/route.ts：420行 → ~190行",
        ],
      },
      {
        label: "附带修复",
        items: [
          "summarizeChapter 正确传入 chapterOrder 和 existingSummariesCount",
          "eventImportances 四级事件分层在所有路由中统一存储",
          "StoryBeat impact 字段根据 impactScore 动态判断",
        ],
      },
    ],
  },
  {
    version: "v0.19.0",
    date: "2026-06-17",
    title: "蒸馏系统上线——四级事件分层 + 伏笔追踪基础",
    sections: [
      {
        label: "蒸馏引擎",
        items: [
          "S/A/B/C 四级事件评分：时效性×事件类型×伏笔关联×角色重要性 四因子算法",
          "自动推断事件类型（突破/死亡/传承/转折/揭露/战斗/日常 8 种）",
          "formatEventsForPrompt() 格式化 [S-N]/[A-N] 标签注入",
        ],
      },
      {
        label: "数据库",
        items: [
          "ChapterSummary 新增 eventImportances JSON 字段",
          "新增 PendingCommitment 模型——五状态机 + closure_conditions + status_history",
        ],
      },
      {
        label: "上下文组装",
        items: [
          "buildMediumTermSection 读取四级事件分层差异化注入",
          "summarizeChapter 生成后自动评分分层",
        ],
      },
    ],
  },
  {
    version: "v0.18.0",
    date: "2026-06-14",
    title: "项目化——多模型支持 + 全局设置 + 代码清理",
    sections: [
      {
        label: "🌐 多提供商 LLM 层",
        items: [
          "src/lib/llm.ts 重写为多提供商引擎：支持 OpenAI / 硅基流动 / DeepSeek 官方 / Groq / 自定义 OpenAI 兼容",
          "配置优先级：数据库 AppSettings 表 > 环境变量 LLM_API_KEY——填过数据库就用数据库，向后兼容",
          "60 秒内存缓存避免每次 LLM 调用查库",
          "新增 testLLMConnection() ——设置页一键验证 API Key 和模型是否可用",
          "clearLLMCache() 供设置页保存后即时刷新",
          "callSiliconFlow 别名保留——所有旧 API 路由无需改动，编译零错误",
        ],
      },
      {
        label: "⚙️ 全局设置系统",
        items: [
          "Prisma 新增 AppSettings 单例模型（id='default'）：llmProvider / llmApiKey / llmModel / llmBaseUrl",
          "GET /api/settings ——返回设置（Key 仅展示后 4 位，其余掩码）",
          "PUT /api/settings ——保存设置，自动失效 LLM 缓存，返回 ok",
          "POST /api/settings/test ——前端即时验证连接，不修改数据库",
          "设置页面 /settings ——暗色 UI：提供商单选→填 Key（👁切换可见）→模型名→测试连接→保存",
          "首页顶栏新增「⚙️ 设置」入口，一键跳转",
          "切换提供商会自动填入推荐默认模型（如 DeepSeek→deepseek-chat）",
          "自定义提供商支持手动填 API Base URL",
        ],
      },
      {
        label: "🏗 代码清理",
        items: [
          "LLM 调用统一：删除 7 个 API 路由中的本地 callFlash/callLLM 定义，统一走 src/lib/llm.ts",
          "净削减 ~70 行重复代码，删除 21 个冗余 MODEL/BASE_URL/API_KEY 常量声明",
          "orchestrator.ts 删除 3 个死函数：povLabel / ndLabel / pct（定义后全文无调用）",
          "orchestrator.ts 删除重复注释（同一行贴了两遍）",
          "4 个组件加 AbortController clean up：page.tsx / RulesPanel / StorylineList / PreGenConfirm",
          "CharacterList 和 CardUpdater 确认无误报——useEffect 不含 fetch",
          "README.md 完整替换为项目文档：快速开始 / 首次配置 / 提供商表 / 技术栈",
        ],
      },
    ],
  },
  {
    version: "v0.17.0",
    date: "2026-06-14",
    title: "规则中心 + 记忆压缩 + Bug修复",
    sections: [
      {
        label: "📏 规则中心——统一创作规则管理",
        items: [
          "Prisma 新增 Rule 模型：name / content / category（writing/world/character/style/custom）/ enabled / priority / scope",
          "CRUD API 完整：GET/POST /api/rules + GET/PUT/DELETE /api/rules/[id]",
          "核心工具函数 getActiveRules() + injectRules() —— 一处定义，全局生效",
          "规则注入 6 大 AI 路由：write / continue / refine / chapter-outline / outline / draw",
          "规则按分类编组后注入 authorNote，以「⚠️ 创作规则——铁律」最高优先级块呈现",
          "scope 分级：all（全局）/ write_only（正文生成）/ outline_only（大纲章纲）/ review_only（审校）",
          "前端 RulesPanel 组件——LeftPanel 新增「规则」Tab（第 5 个 Tab）",
          "规则创建/编辑/删除/启用禁用的完整交互，暗色 Tailwind 风格统一",
        ],
      },
      {
        label: "🧠 记忆压缩 MVP——告别「只看最近3章」",
        items: [
          "summarizeChapter 增强输出：impactScore（1-10影响力评分）、threadProgress（故事线进度）、unresolvedQuestions（悬念/伏笔列表）",
          "StoryBeat 不再硬编码 'minor'——impactScore ≥7 自动标为 major，影响排序优先注入",
          "engine.ts buildMediumTermSection：从固定取3章 → 角色重叠评分检索（Top-8最相关+最后一章保底）",
          "新增 buildArcSection：「角色弧光追踪」区块——有 arcProgress 的角色自动注入当前弧光状态",
          "新增 buildStorylineSection：「活跃故事线当前状态」区块——按七要素链展示每条线走到哪一步",
          "assemblePrompt 从 7 区块扩展到 9 区块——弧光 + 故事线追上最新进展",
          "TokenAllocation 新增 arcMemory + storylineMemory 预算分配",
          "第 50 章写玉佩相关内容时，第 5 章埋的伏笔能被角色重叠检索自动召回",
        ],
      },
      {
        label: "🐛 代码质量——审查修复 6 个 Bug",
        items: [
          "page.tsx handleDrawSelect：fire-and-forget fetch → await + try/catch，失败不静默丢数据",
          "page.tsx onEditOutline：同上——乐观更新后加 await + try/catch",
          "ContextPreview.tsx：useEffect 内 fetch 无 AbortController → 加全流程竞态防护",
          "StyleEditor.tsx：同上——加 AbortController + cleanup",
          "DrawCards.tsx：3 重竞态防护——过期请求检查、AbortError 精准跳过、finally 只关当前请求的 loading",
          "DrawCards.tsx API route：personality 字段从提取但不使用 → 正确拼入角色简介",
        ],
      },
      {
        label: "🛡 工程质量",
        items: [
          "新建 novel-forge-diagnostic 专属诊断 skill——每次代码变更后六维自检（TS/Prisma/React反模式/API健壮性/代码质量/服务健康）",
          "TypeScript 零错误编译通过",
          "Prisma 数据库同步——新增 Rule 表 + db push + client regenerate",
          "CHANGELOG.md 同步更新",
        ],
      },
    ],
  },
  {
    version: "v0.15.8",
    date: "2026-06-14",
    title: "章纲AI自主选角 + 系统提示词预缓存",
    sections: [
      {
        label: "🤖 章纲 AI 自主选角",
        items: [
          "两阶段生成——Step 1: AI 读取前5章+作者指令选角 → Step 2: 用选定角色生成章纲",
          "作者指令作为最高优先级注入选角和生成两个阶段",
          "空闲角色不再塞入——AI 根据剧情逻辑决定谁出场，不相关的不放",
          "生成结果展示 AI 选角列表 + 选角理由",
        ],
      },
      {
        label: "📖 章纲上下文大幅增强",
        items: [
          "前文上下文：从3章→5章，正文从300字→800字末段",
          "新增后文伏笔读取——知道后面发生什么才能埋好钩子",
          "章纲结构：核心冲突→情感基调→场景序列→对话点子→衔接钩子",
        ],
      },
      {
        label: "⚡ 系统提示词预缓存",
        items: [
          "全卡编译到 Project.globalPrompt ——角色+世界书+风格实时同步",
          "9 个同步钩子：角色CRUD、世界书CRUD、扩展、导入、整理apply、设定解析",
          "buildPromptContext + chapter-outline 有缓存时跳过 3 个 DB 查询",
          "缓存 >100 字生效，卡变动 <1 秒刷新",
        ],
      },
      {
        label: "🔧 其他优化",
        items: [
          "去重四层：自去重+跨聚类+与已有+全局 → apply 报告去重数量",
          "范围选择器：支持 1-50、1,3,5-10 等表达式",
          "SSE 预览缓存：previewId 替代完整 JSON 传输",
        ],
      },
    ],
  },
  {
    version: "v0.15.7",
    date: "2026-06-13",
    title: "批量范围选择 + 世界书确认UI + 信息零丢失架构",
    sections: [
      {
        label: "📐 批量范围选择",
        items: [
          "新增 RangeSelector 组件——支持 1-50、1,3,5-10、10-、-30、all/* 等范围表达式",
          "已装到世界书列表和角色卡列表——全选按钮旁边，输入后 Enter 确认",
          "角色卡列表中范围基于筛选后可见列表（1-based 索引）",
          "Esc 清空选择，焦点离开自动应用",
        ],
      },
      {
        label: "🛡️ 信息零丢失架构",
        items: [
          "max_tokens 分级——Phase 1 聚类:4096（够用），Phase 2 整理:16384~32768（按输入量自适应）",
          "输入 token 估算——中文 1.5 tokens/字，超 4 万 tokens 自动拆分批处理",
          "分批整理——每批独立调用 Flash，批间标题去重，多批结果再合并去重",
          "输出截断检测——检查 finish_reason === 'length'，被截断时打日志警告",
        ],
      },
      {
        label: "🔍 专有名词覆盖校验",
        items: [
          "整理后自动提取原文专有名词（书名号/引号/括号内容），比对输出中是否保留",
          "逐 cluster 报告覆盖率和缺失列表",
          "前端确认面板实时展示——缺失专有名词标红警告",
          "总体覆盖率在 done 事件中展示（如\"专有名词保留 97%\"）",
        ],
      },
      {
        label: "📚 确认面板",
        items: [
          "整理改为两步——预览（AI整理不写库）→ 确认面板 → apply 写入",
          "展示：来源词条 → 生成的新词条标题+内容摘要+关键词 + 拆分批次标记 + 覆盖警告",
          "确认后调 POST /api/lorebook/summarize/apply 原子写库（事务保护）",
        ],
      },
      {
        label: "🧠 主题聚类 + 求同存异",
        items: [
          "Phase 1: AI 扫描全选词条，按人物/势力/历史/地点/力量体系/杂项聚类",
          "内容预览从 300 字 → 500 字，聚类更准",
          "Phase 2 铁律：禁止用\"等\"省略、禁止概括数字、禁止合并分歧、禁止删专有名词",
          "maxDuration: 60 → 120s（分批调用需要更长时间）",
        ],
      },
    ],
  },
  {
    version: "v0.15.6",
    date: "2026-06-13",
    title: "章纲生成全面升级 —— 基于角色档案+风格设定",
    sections: [
      {
        label: "📋 章纲生成（chapter-outline）",
        items: [
          "角色信息从一行摘要 → 完整档案：性格五维(dominant/drive/contradiction/habits/socialMask) + 背景300字 + 能力 + 关系 + 说话风格",
          "新增文风注入——加载 styleCard，传入文风描述/视角/句长/对话比/语气标记",
          "前后文增强——从取前2章到取前3章，正文从取前200字到取末段300字",
          "systemPrompt 重写——6条铁律：行为必须匹配性格五维、关系一致、不违背核心驱动、文风匹配、角色不凭空创造、世界观铁律",
          "章纲结构升级：核心冲突→情感基调→场景序列(地点/角色/事件/情感变化)→关键对话点子→衔接钩子",
          "temperature 0.7 → 0.4（严谨不胡编），max_tokens 2048 → 4096（章纲更详细）",
        ],
      },
    ],
  },
  {
    version: "v0.15.5",
    date: "2026-06-13",
    title: "缺失角色自动发现 + 人物卡提示词全面升级",
    sections: [
      {
        label: "🆕 缺失角色自动建卡",
        items: [
          "AI 审计新增第三项任务——扫描 background 中提到的所有人物名",
          "比对全项目已有角色卡，发现新人物→自动创建独立角色卡",
          "去重保护——同名/与已删卡同名不重复建",
          "进度报告——发现几个缺失角色一目了然",
        ],
      },
      {
        label: "📝 人物卡提取全面升级（parser.ts + import/parse）",
        items: [
          "personality: 从简单字符串数组 → {dominant, drive, contradiction, habits, socialMask} 五维对象",
          "background: 从'简述' → '复述原文全部细节，至少100字'",
          "新增 abilities(能力列表)、timeline(时间线)、dialogueStyle(对话风格五字段)、hiddenMotives(隐藏动机)",
          "import/parse: 全字段禁止留空/填'未知'——必须从原文提取或合理推断",
          "角色提取 system prompt: 强调'保留全部信息，禁止精简''零精简'",
        ],
      },
      {
        label: "🔧 JSON 解析器",
        items: [
          "新增第 2.5 层——AI 输出多个 JSON 对象粘连时只取第一个完整对象",
          "解决 'Unexpected non-whitespace character after JSON' 报错",
        ],
      },
      {
        label: "⬆️ 限制解除",
        items: [
          "expand 路由 MAX_TOKENS: 16384 → 32768",
        ],
      },
    ],
  },
  {
    version: "v0.15.4",
    date: "2026-06-13",
    title: "角色扩展预处理 + JSON 解析器修复",
    sections: [
      {
        label: "🧹 扩展前预处理管线",
        items: [
          "AI 批量审计——一次 Flash 调用检查全部卡：是否真人 / 是否组合卡",
          "拆组合卡——'张三、李四'→每人独立建卡，已有同名则合并信息不重复",
          "删非角色——地名/物品/势力/概念混入角色列表的自动检测并删除",
          "智能合并增强——去括号匹配('洁世一(蓝色监狱)'↔'洁世一')，信息更丰富的卡优先保留，重复卡删除",
          "全流程 SSE 进度推送——拆分/删除/合并每步都有报告",
        ],
      },
      {
        label: "🔧 JSON 解析器修复",
        items: [
          "sanitizeUnescapedQuotes 不再空转——字符串内未转义引号自动检测并转义",
          "中文对话引号场景：'他说\"你好\"'→自动转义为 '他说\\\"你好\\\"'",
          "接入解析管线第5/6/7层——每个恢复层先修引号再解析",
          "错误消息扩展到 300 字 + 包含 JSON.parse 原始 SyntaxError",
        ],
      },
    ],
  },
  {
    version: "v0.15.3",
    date: "2026-06-13",
    title: "全链路硅基流动 —— 16路由统一迁移 + 模型名修正",
    sections: [
      {
        label: "☁️ API 迁移",
        items: [
          "getDefaultLLMConfig() → 硅基流动（连锁修复 detect-entities / update-style-card / settings/parser 等 5 场景）",
          "chapter-outline（章纲）/ outline（大纲）/ classify（角色分类）→ 硅基流动",
          "check-all-cards / import/commit / import/parse → 硅基流动",
          "lorebook/import / lorebook/summarize / characters/expand → 硅基流动",
          "全部 DEEPSEEK_API_KEY → LLM_API_KEY，统一密钥管理",
        ],
      },
      {
        label: "🔧 模型名修正",
        items: [
          "硅基流动实际支持的模型名：deepseek-ai/DeepSeek-V4-Pro、deepseek-ai/DeepSeek-V4-Flash",
          "之前使用的 deepseek-v4-pro / deepseek-v4-flash 在硅基流动上不存在（400 code 20012）",
          "16个文件批量替换，TypeScript 0 错误编译通过",
        ],
      },
      {
        label: "🐛 修复的问题",
        items: [
          "章纲生成 API 400 —— 模型名不存在",
          "章纲生成 API 401 —— 用了失效的 DeepSeek 官方 key 调官方 API",
          "大纲/分类/导入/世界书 全部存在同样的硬编码问题，一并根除",
        ],
      },
    ],
  },
  {
    version: "v0.15.2",
    date: "2026-06-12",
    title: "maxTokens 全链路 32768——真正无上限提取",
    sections: [
      {
        label: "⬆️ 输出拉满",
        items: [
          "parseSettings / parseLorebookOnly / parseStyleOnly: 16384 → 32768",
          "import/parse A路(角色提取) + B路(世界+风格): 16384 → 32768",
          "classify 四路并行: 16000 → 32768",
          "lorebook/summarize: 8000 → 32768",
          "上下文窗口百万token(DeepSeek原生)——输入不截断，输出不设限",
        ],
      },
    ],
  },
  {
    version: "v0.15.1",
    date: "2026-06-12",
    title: "仅世界卡 + 仅风格卡——复述蒸馏专用模式",
    sections: [
      {
        label: "📖 仅世界卡（parseLorebookOnly）",
        items: [
          "核心理念「复述蒸馏」——保留原文全部细节，去重去矛盾分类，不总结不压缩",
          "8大分类全覆盖：地理/势力/力量体系/历史/文化/生物/器物/自定义",
          "每条 content 保持原文信息密度——200字设定→200字+结构化输出",
          "专有名词零丢失、具体数值零丢失",
        ],
      },
      {
        label: "🎨 仅风格卡（parseStyleOnly）",
        items: [
          "覆盖9大维度：视角/叙事距离/句式量化/叙事比例/语气标记/词汇特征/文风描述/写作规则/样本段落",
          "写作规则提取：原文明确规则逐条照搬 + 从文风反推隐含规则",
          "styleDescription 100-200字具体描述——不写'文风古雅'，写'半文半白，叙述句现代中文短句...'",
        ],
      },
      {
        label: "🔀 API + 前端",
        items: [
          "/api/parse-settings 支持 mode 参数：all / lorebook / style",
          "SettingsImporter 三模式切换器——每个模式有独立说明和placeholder",
          "仅风格卡响应额外返回 writingRules 数组",
        ],
      },
    ],
  },
  {
    version: "v0.15.0",
    date: "2026-06-12",
    title: "导入设定一键出三卡——三卡分界标准建立 + 全局统一调度",
    sections: [
      {
        label: "🃏 导入设定一键出三卡",
        items: [
          "SettingsImporter 从两卡变三卡——角色卡 + 世界书 + 风格卡并行写入",
          "粘贴设定文本 → AI 自动拆出全部三卡，不需要进 ImportWizard 走多步流程",
          "一个 Promise.all 搞定三卡写入，速度快不阻塞",
        ],
      },
      {
        label: "📐 三卡分界标准建立（THREE_CARD_BOUNDARIES）",
        items: [
          "角色卡：有名字的个体人物——外貌/性格/背景/能力/关系/对话/动机/时间线。排除地名/组织/功法",
          "世界卡：非人物概念——地理/势力/力量体系/历史/文化/生物/器物，含触发关键词。排除人物/文风",
          "风格卡：写作特征——视角/叙事距离/句式/比例/语气/词汇/文风描述。排除人物/世界观",
          "parser.ts 是唯一定义源——所有提取路径引用同一套规则，杜绝各说各话",
        ],
      },
      {
        label: "🔗 ImportWizard 统一三卡标准",
        items: [
          "B路（世界+风格提取）引用 THREE_CARD_BOUNDARIES，与 SettingsImporter 完全一致",
          "分块模式下不再跳过世界提取——改用文本前16000字独立调用",
          "maxTokens 全链路 16384：A路角色提取、B路世界提取、parser.ts 解析，全部无上限",
        ],
      },
      {
        label: "🏗 类型系统",
        items: [
          "新增 StyleProfile 接口——对应 StyleCard 全部字段（视角/距离/句式/比例/语气/词汇/描述/样本）",
          "ParsedSettings 新增 styleProfile 字段",
          "新增 toStyleCardCreateParams()——StyleProfile → Prisma 创建参数",
          "SettingsImporter 前端显示风格卡创建结果（粉色高亮）",
        ],
      },
    ],
  },
  {
    version: "v0.14.0",
    date: "2026-06-10",
    title: "自动分类四维重写 + 错误报告修复 + SSE 收尾丢包",
    sections: [
      {
        label: "🏷 自动分类四维重写（称号/学校/经历/俱乐部）",
        items: [
          "从三个抽象维度（能力/势力/原型）→ 四个足球同人专属维度",
          "称号头衔：从角色描述提取修饰性称号、媒体标签、实力评价",
          "学校学园：识别日本高中、足球名校、海外学校、蓝色监狱内部层级",
          "经历履历：国家队经历、海外经历、重大事件、特殊履历、蓝色监狱经历",
          "俱乐部队伍：职业俱乐部、日本俱乐部队、国家队、蓝色监狱内部队伍",
          "未归类角色自动归入 ❓ 组，后端覆盖率检查",
        ],
      },
      {
        label: "🐛 分类错误不再被闷杀",
        items: [
          "根因：四个分类函数 catch { return [] } 吞掉所有错误，外层永远看到空数组",
          "修复：去掉内层 catch，错误冒泡到 POST handler 被 SSE 推送到前端",
          "API Key 缺失、限流 429、JSON 解析失败——全部显示具体原因",
        ],
      },
      {
        label: "📡 SSE 收尾丢包修复",
        items: [
          "根因：while 循环 done=true 时直接 break，buf 中残留的 done 事件被丢弃",
          "修复：break 前检查 buf.trim()，有 data: 行就解析——done 事件不再丢失",
          "done 事件丢失时 useEffect 兜底从 classifyResult 重建面板",
        ],
      },
      {
        label: "🔧 分类进度条不再卡 5%",
        items: [
          "四维串行执行（避免限流），每维独立推送 25%/45%/65%/85% 进度",
          "每维完成即推送 ✅ N组 确认消息",
        ],
      },
    ],
  },
  {
    version: "v0.13.0",
    date: "2026-06-10",
    title: "AI扩展双Provider + SSE弹窗修复 + continue提示词统一 + 死代码清理",
    sections: [
      {
        label: "🔀 AI扩展双Provider架构",
        items: [
          "硅基流动 V4 Flash ×4 并发 + DeepSeek官方 deepseek-chat ×4 并发 = 8路并行",
          "共享角色队列——哪个Provider快就多做，自动负载均衡",
          "DeepSeek未配置时自动回退全部8并发走硅基",
          "进度条标注每个角色由哪个Provider处理 [硅基]/[DeepSeek]",
        ],
      },
      {
        label: "🪟 扩展弹窗修复（SSE buf残留bug）",
        items: [
          "根因：SSE流结束时buf里残留的done事件被直接丢弃→expandResult永远不设置",
          "修复：流结束后检查buf残留，有data行就解析——done事件不再丢失",
          "扩展完成后弹窗正确显示成功/失败角色列表+原因",
        ],
      },
      {
        label: "🔧 continue提示词统一",
        items: [
          "续写不再自建systemPrompt——统一走buildPromptContext与write/refine同一套",
          "删除重复的风格卡注入代码（buildPromptContext已含）",
          "模板禁用词+自定义禁用词合并进authorNote统一传递",
          "续写文风与正文生成完全一致——含角色出场原则、丰满性示例、心理直嵌范例",
        ],
      },
      {
        label: "🧹 技术债清理",
        items: [
          "删除 SYSTEM_PROMPTS.writer 死代码——从未被使用（buildPromptContext始终生成systemPrompt）",
          "writeSection 移除无意义的回退逻辑 `context.systemPrompt || SYSTEM_PROMPTS.writer`",
        ],
      },
    ],
  },
  {
    version: "v0.12.1",
    date: "2026-06-10",
    title: "AI扩展结果弹窗 + 并发10不断联 + 自动分类AI三分类 + 扩展维度升级",
    sections: [
      {
        label: "🪟 AI扩展结果弹窗（替代盲alert）",
        items: [
          "扩展完成后弹出详细结果面板——成功X个/失败X个一目了然",
          "成功角色名列表绿色标签展示",
          "失败角色逐一列出+具体失败原因（API错误/JSON解析失败/DB写入失败）",
          "进度条实时显示每个角色的状态标记+错误原因",
          "点击遮罩层或「知道了」按钮关闭弹窗",
        ],
      },
      {
        label: "⚡ AI扩展并发10 + 绝不主动断联",
        items: [
          "并发数从6恢复到10——跑满Flash API处理能力",
          "移除所有AbortController超时——绝不主动中断API调用",
          "原文截断8000字保留——防止超长prompt拖垮API",
        ],
      },
      {
        label: "🏷 自动分类全面升级",
        items: [
          "从纯字符串匹配升级为Flash AI三分类：能力等级(⭐)、势力归属(🏛)、角色原型(🎭)",
          "三路Parallel并发分析——基于世界书+角色卡综合判断，不靠死规则",
          "未覆盖角色自动归入「未归类」组——不漏人",
          "分类结果直接显示为可勾选的标签面板——可选择性应用到角色tags",
        ],
      },
      {
        label: "📝 扩展质量升级",
        items: [
          "Prompt核心原则改为「少总结，多复述，多扩展，多补充」——原文照搬不缩写",
          "abilities/hiddenMotives改用textarea多行编辑，支持换行分隔",
          "AI扩展后quickImportContent自动清空——消化完毕不留冗余",
          "去重合并逻辑修正——重复角色内容合并到主卡，副本不删除保留在DB",
        ],
      },
    ],
  },
  {
    version: "v0.12.0",
    date: "2026-06-10",
    title: "作者指令优先级 + 自动三卡更新 + 比分追踪 + 导入流程修复 + 多项体验修复",
    sections: [
      {
        label: "📝 作者指令优先级提升",
        items: [
          "作者指令=大纲同等效力——冲突处以作者指令为准，大纲没有的内容按指令执行",
          "注入 system prompt 时明确标注「最高优先级」",
          "作者指令切换章节时自动清零——每章独立，互不干扰",
        ],
      },
      {
        label: "🔍 自动三卡更新（后台分析）",
        items: [
          "正文/微调/续写完成后自动调用 update-cards API 分析章节变化",
          "分析过程不弹窗——顶部显示「正在分析本章变化...」加载提示",
          "分析完成后自动弹出 CardUpdater 确认窗，跳过重复 API 调用",
          "修复 SSE 闭包导致 autoAnalyzeChapter 拿到空内容的严重 Bug",
        ],
      },
      {
        label: "⚽ 比赛比分智能追踪",
        items: [
          "update-cards 系统提示新增「比赛结果记录」强制区块",
          "每场比赛比分/胜负自动写入世界书（category=history）",
          "buildPromptContext 扫描世界书中比赛/比分词条，注入「必须保证前后一致」",
          "后续章节生成时自动引用历史比分，前后统一不打架",
        ],
      },
      {
        label: "🃏 CardUpdater 增强",
        items: [
          "新增「🔍 搜索已有角色」——输入名字即时筛选，点击添加",
          "新增「✨ 自建新角色」——输入名字回车直接创建",
          "支持 preAnalysisResult 外部传入，跳过内部 API 调用",
          "移除正文下方冗余的 EntityDetector 按钮——功能统一归入三卡分析",
        ],
      },
      {
        label: "📥 导入流程修复",
        items: [
          "AI识别+快速导入双路角色提取重构——编号→人名→整段描述塞background，不拆解分析",
          "编号全面兼容：Markdown标题(### 1.)、阿拉伯(1. 2、3)、中文数字(一、二)、序数(第一位)、圈号(①②)、括号((1))",
          "快速导入纯正则秒级解析——40→100+角色瞬间完成，自动去重合并同名/小名/别名",
          "快速导入dbMerge占位代码bug修复——quickImportContent被写为对象导致后续导入崩溃",
          "AI识别Prompt增强——Markdown标题支持、名字清洗(去——修饰)、重复引用自动跳过",
          "导入分批合并进度实时推送——每批API返回立即SSE推送，不再卡在 0/10",
          "mergeOneBatch 45s超时保护 + AB路解析55s超时 + 2万字截断 + 真进度替代假百分比",
        ],
      },
      {
        label: "🔧 体验修复",
        items: [
          "添加章节自动编号——统计已有章节数，弹窗预填「第N章：」",
          "Flash 章纲提示词切换章节时清零——每章独立",
          "Flash 章纲按钮原位显示生成状态——⏳生成中 / ✅完成 / ❌失败",
          "Deploy 改用部署令牌环境变量传参",
          "人物卡编辑「背景」栏 textarea 从 4 行扩大到 16 行——导入的详细角色描述不再挤在小框里",
        ],
      },
    ],
  },
  {
    version: "v0.11.1",
    date: "2026-06-09",
    title: "全场景角色确认 + 进度可视化 + 上下文监控 + 写完不跳转",
    sections: [
      {
        label: "🔄 全场景角色确认",
        items: [
          "微调（✏️）→ 弹角色确认框 → 确认后精准微调",
          "续写（➡️）→ 弹角色确认框 → 确认后精准续写",
          "大纲生成（🤖）→ 弹角色确认框 → 确认后按名单生成大纲",
          "Flash章纲（⚡）→ 直接生成+进度UI，不弹角色确认",
          "全部走同一套调度逻辑——你确认谁出场，AI就用谁",
        ],
      },
      {
        label: "📊 上下文监控优化",
        items: [
          "Token用量面板顶部新增「📊 角色卡读取 X/Y 张」进度条",
          "角色名标签改为可折叠——默认收起，点开才看名单",
          "替换原来不知所云的角色激活列表",
          "preview-context API 返回 activeCharacterCount + totalCharacterCount",
        ],
      },
      {
        label: "⏳ 进度可视化",
        items: [
          "所有生成操作显示步骤状态：生成中/审校中/摘要中/完成/出错",
          "4步进度条动画——时刻知道AI在干什么",
          "完成/出错状态5秒后自动消失",
          "Flash章纲/大纲生成/微调/续写全部覆盖",
        ],
      },
      {
        label: "🐛 写完不跳转修复",
        items: [
          "根因：loadProject() 自动跳到第一个未完成章节",
          "修复：记住当前章节，只刷新数据不跳选",
          "写完一章后留在原地目送成功",
        ],
      },
      {
        label: "📋 大纲角色联动",
        items: [
          "大纲生成时 pre-write-cards 支持无节点模式——用作品总纲做调度",
          "确认的角色名单注入大纲prompt——AI按名单规划每章出场",
          "角色备注同样生效——「这场他右腿旧伤」→ AI在大纲中体现",
          "大纲和章纲的prompt都追加角色出场策略指令",
        ],
      },
      {
        label: "🔧 后端统一",
        items: [
          "outline/refine/continue 三个API全部支持 confirmedCardIds + cardNotes + newCharacterRequests",
          "三个API全部支持运行时自建角色——输入名字自动建卡",
          "pre-write-cards API nodeId改为可选——大纲生成时用作品总纲替代",
          "chapter-outline API 保留 confirmedCardIds 支持（向后兼容）",
        ],
      },
    ],
  },
  {
    version: "v0.11.0",
    date: "2026-06-09",
    title: "生成前角色确认系统——你决定谁出场，AI不再乱拉人",
    sections: [
      {
        label: "🎭 生成前角色确认",
        items: [
          "点「生成」→ 弹确认框：列出AI调度的角色+出场理由+打分",
          "每张卡可勾选/取消——你控制谁出场",
          "每张卡可写备注（如「这场他右腿旧伤隐隐作痛」）→ 自动注入prompt最高优先级",
          "无匹配角色卡时AI提示缺失类型（如「大纲提到门将但无对应卡」）",
        ],
      },
      {
        label: "🆕 自建角色",
        items: [
          "输入角色名 → AI自动创建角色卡并送入prompt",
          "新卡标🆕，基础字段自动填充，后续可在角色列表补充细节",
        ],
      },
      {
        label: "🔗 完整链路",
        items: [
          "新API /api/generate/pre-write-cards —— 返回调度卡+理由+缺角色建议",
          "write API新增confirmedCardIds/cardNotes/newCharacterRequests参数",
          "确认后仅送确认的角色卡——不再全量178人塞进prompt",
          "write API向后兼容——不传confirmedCardIds走原调度逻辑",
        ],
      },
      {
        label: "📝 其他优化",
        items: [
          "角色备注注入后覆盖全局作者指令",
          "确认框可修改作者指令——本章权重与大纲等同",
          "调度理由透明化——每张卡标注为什么被选中",
        ],
      },
    ],
  },
  {
    version: "v0.10.2",
    date: "2026-06-09",
    title: "持久化+自动流程+世界书扩充——写完自动弹三卡",
    sections: [
      { label: "📝 持久化", items: ["Flash章纲提示词从prompt()→持久输入框", "作者指令+微调指令→localStorage", "三卡浮动按钮→关闭弹窗后不消失"] },
      { label: "⚡ 自动流程", items: ["写完自动弹CardUpdater→不需手动点通知", "经历时间线自动汇总→timeline字段", "调度卡全量展开~15人完整卡面"] },
      { label: "🌍 世界书扩充", items: ["三卡分析新增7类世界观检测", "自动创建世界书词条→从11条涨到30+"] },
    ],
  },
  {
    version: "v0.9.4",
    date: "2026-06-09",
    title: "角色出场逻辑系统——S/A/B/C叙事权重，根治前期角色乱入",
    sections: [
      {
        label: "🎭 叙事权重系统",
        items: [
          "S级（世界级/传说级/国家队/反派首领）：仅在重大比赛/剧情高潮/关键冲突出现——绝不可日常陪同",
          "A级（导师/反派/催化剂/队长）：有明确叙事目的才出场——不是随叫随到",
          "B级（队友/同辈/主角团）：可在训练/比赛/日常场景自然出现",
          "C级（背景角色）：可随意出现，但不应主导剧情",
        ],
      },
      {
        label: "🔍 出场追踪",
        items: [
          "扫描前文章节自动判断每个角色是否已出场",
          "花名册标注✅已出场/🆕未出场——未出场角色不能凭空出现",
          "🆕角色引入必须有铺垫（他人提及→旁观出现→消息/电话→面对面）",
          "已死亡角色自动从花名册移除",
        ],
      },
      {
        label: "📋 角色出场规则注入",
        items: [
          "系统提示词新增「角色出场逻辑」段：每个出场角色必须回答'他为什么在这里'",
          "Writer SYSTEM_PROMPTS同步——确保续写/重写都遵守",
          "花名册精确到每个角色的出场条件和场景限制",
          "禁止：S级陪训练、对手无故串场、未出场角色突然加入对话",
        ],
      },
    ],
  },
  {
    version: "v0.9.3",
    date: "2026-06-09",
    title: "修复504超时 + JSON解析容错——AI分析本章变化终于能跑完了",
    sections: [
      {
        label: "⚡ 性能修复",
        items: [
          "maxDuration从60秒拉到300秒——部署平台不再提前掐断LLM分析",
          "角色智能过滤：只送章节中出现的角色+主角反派导师（178→≤40个），LLM处理时间大幅下降",
          "章节内容截取从10000字降到8000字——再减20%prompt体积",
        ],
      },
      {
        label: "🛡 容错加固",
        items: [
          "LLM调用加try/catch——模型不可用时返回空结果+友好错误信息，不再抛500",
          "JSON解析四层容错：markdown提取→花括号截取→JSON.parse→失败返回raw文本",
          "前端res.json()改成先res.text()再JSON.parse——API返回非JSON不再白屏炸掉",
        ],
      },
    ],
  },
  {
    version: "v0.9.2",
    date: "2026-06-09",
    title: "角色花名册注入prompt——修复三卡更新后后续章节读不到的致命漏洞",
    sections: [
      {
        label: "🧠 架构修复",
        items: [
          "根因：buildPromptContext只把主角极简卡送进globalMemory——apply-updates写入的关系/对话风格/外貌/弧光/能力全停在数据库永不进prompt",
          "修复：GlobalMemory新增characterRoster字段，遍历所有角色提取有意义字段",
          "花名册按角色优先级排序(protagonist/antagonist优先→最多60个有更新记录的角色)",
          "assemblePrompt把花名册注入「全局设定——始终牢记」区——AI写后续章节时能看到所有角色当前状态",
        ],
      },
      {
        label: "🔍 AI分析本章变化增强",
        items: [
          "新增「对话风格」「外貌描述」「性格信念转变」「获得物品/身份」检测字段",
          "apply-updates新增dialogueStyle/appearance字段的章节标记写入",
          "chapterNumber提取修复：正则匹配中文数字(一二三)和阿拉伯数字，不再传完整标题",
          "autoAnalyzeChapter也传chapterNumber——自动检测的更新也能被后续章节读取",
        ],
      },
    ],
  },
  {
    version: "v0.9.1",
    date: "2026-06-08",
    title: "四大功能齐发 + 足球风格卡 + AI分析本章变化修复",
    sections: [
      {
        label: "🗑 章节管理",
        items: [
          "章节删除+自动重编号：DELETE API自动将剩余章节重新编号为第一章/第二章…",
          "大纲追加模式：已有章节时默认追加而非替换，对话框toggle切换",
          "正文禁写「第X章」：orchestrator/write/continue三处prompt格式铁律",
          "单章Flash章纲：新API /api/generate/chapter-outline + 中栏⚡按钮",
        ],
      },
      {
        label: "⚽ 蓝锁足球美学风格卡",
        items: [
          "心理直嵌：内心想法口语化碎片化，不加引导词直接写进叙述流",
          "对话肉搏感：每句承载性格/战术/情绪，禁止单字对话，每个动作必须有回应",
          "变速齿轮：一对一慢速展开·球转移快速掠过·射门前心理定格",
          "足球肉搏精度：触球动词具体化·身体接触量化·空间距离精确·失败失误拉满",
          "超能力自然下沉：允许但自然发生，不命名不强调，给高光留物理解释",
        ],
      },
      {
        label: "🔍 AI分析本章变化",
        items: [
          "修复按钮400报错：改用selectedNode?.content不再传空值",
          "内联编辑：每条检测变化可点击✏️编辑，编辑后标记「已编辑」",
          "significance过滤：high/medium默认勾选，low不选",
          "三卡写入格式对齐角色卡(personality/关系/背景/对话风格/外貌)",
          "世界观词条自动去重",
          "Prompt优化：分析上限10000字，明确big/little区分标准",
        ],
      },
      {
        label: "🔧 修复",
        items: [
          "Flash章纲按钮：加prompt输入框+错误alert+res.ok检查",
          "支持通过 CI 自动部署到自有服务器",
        ],
      },
    ],
  },
  {
    version: "v0.9.0",
    date: "2026-06-08",
    title: "大纲生成对话框——可选章节数 + 提示词 + 编辑预览 + 确认写入",
    sections: [
      {
        label: "📋 大纲生成",
        items: [
          "可选4/8/12章或自定义数量",
          "点选即切",
        ],
      },
      {
        label: "✏️ 自定义提示词",
        items: [
          "输入提示词走V4 Flash快速生成",
          "不填走V4 Pro深度创作",
        ],
      },
      {
        label: "👁 章节预览编辑",
        items: [
          "生成后逐章预览",
          "点击即可编辑标题和梗概",
        ],
      },
      {
        label: "✅ 确认写入",
        items: [
          "预览满意后一键写入DB替换旧大纲",
          "不满意可以关闭重来",
        ],
      },
      {
        label: "🔧 后端",
        items: [
          "chapters自动从第一章编号",
          "JSON解析失败→正则回退→默认兜底三级容错",
        ],
      },
    ],
  },
  {
    version: "v0.8.3",
    date: "2026-06-08",
    title: "大纲一键生成——不要弹窗，点按钮直接出章节",
    sections: [
      {
        label: "📋 大纲一键生成",
        items: [
          "移除弹窗流程：不再需要选章数→预览→勾选，点「🤖 大纲」直接生成",
          "自动创建 StoryNode：生成后章节自动出现在左侧大纲树",
          "失败弹窗提示：不再静默失败，alert 显示具体错误",
          "maxDuration=60s：防止部署平台超时掐断",
        ],
      },
      {
        label: "🎨 风格卡注入",
        items: [
          "大纲生成自动读取 StyleCard：句长分布、对话/描写/动作比例、视角类型、语气标记",
          "llmConfig 自定义笔记和禁用词一并传入",
        ],
      },
      {
        label: "🔧 修复",
        items: [
          "personality/hiddenMotives 字段 safeJoin 兼容数组/对象/字符串",
          "SW v5 自毁版本：激活后清除缓存+注销自身，终结缓存死锁",
        ],
      },
    ],
  },
  {
    version: "v0.8.2",
    date: "2026-06-08",
    title: "大纲生成修复 + 风格卡注入 + 自动更新公告",
    sections: [
      {
        label: "📋 大纲生成修复",
        items: [
          "按钮修复：Toolbar 和 OutlineGenerator 全部按钮换原生 button，解决点击无反应",
          "风格卡注入：生成大纲时自动读取 StyleCard 全部量化特征（句长、对话比、视角、语气标记等）",
          "personality 兼容：safeJoin 统一处理数组/对象/字符串三种格式，不再报 join is not a function",
          "大纲自动分章节：第一章到第N章顺序生成，标题自动拟定",
        ],
      },
      {
        label: "🔄 自动更新系统",
        items: [
          "Service Worker v4：network-first 策略，激活时强制刷新所有页面",
          "首页自动弹更新公告：检测版本变化自动展示 changelog",
          "版本数据统一：LATEST_VERSION + CHANGELOG_BRIEF + VERSIONS 集中管理",
        ],
      },
    ],
  },
  {
    version: "v0.8.1",
    date: "2026-06-08",
    title: "导入稳定性修复——SSE 不再卡死 + 数据零丢失",
    sections: [
      {
        label: "🐛 导入修复",
        items: [
          "SSE 错误通道修复：单层 try/catch，不再卡在「连接中」假死",
          "三卡数据完整写入：relationships、subFields、background 三字段不再丢失",
          "尾块短合并：smartChunk 不再丢弃 <50 字的尾部碎片",
          "流式进度全程可见：单次 V4 Pro 调用，一次分析完，不用分批等待",
        ],
      },
    ],
  },
  {
    version: "v0.8.0",
    date: "2026-06-08",
    title: "自动分类重构 + 章末快照 + 断点续写 + thinking 全面修复",
    sections: [
      {
        label: "🏷 角色分类重构",
        items: [
          "从「全自动逐角色打标签」改为「AI 分析分类体系 → 你勾选确认」",
          "按维度分组：势力/组织、身份/职业、阵营/立场、特殊称号、剧情功能",
          "每组列出所有成员，可全选/取消全组，也可单独勾选/取消成员",
          "一个角色可属于多个分类",
          "新增 apply-tags API，勾选后一键写入",
        ],
      },
      {
        label: "📥 世界书导入 & 整理",
        items: [
          "一键导入：粘贴设定文本 → Flash 自动提取术语/概念/势力/地点",
          "结构化整理：去重去矛盾，专有名词零丢失，不再压缩信息",
          "导入/整理结果持久显示——成功/失败不再凭空消失",
        ],
      },
      {
        label: "🧠 章末快照 + 角色脉搏",
        items: [
          "写完后自动提取前章收尾氛围（压抑/释然/紧张…）",
          "自动提取每个角色的「当下冲动」——我要 X，因为 Y 刚发生",
          "下一章提示词自动注入氛围 + 冲动，修「上下章连不上」",
          "数据存入 ChapterSummary，不增加额外 API 调用",
        ],
      },
      {
        label: "💾 断点续写",
        items: [
          "写/续路由每 300 字自动保存草稿到数据库",
          "浏览器关了、连接断了——重新点生成自动从断点接续",
          "前端收到 resume 事件提示「从草稿续写（已有 xxx 字）」",
        ],
      },
      {
        label: "🔧 审校 & 文风",
        items: [
          "审校结果改为 JSON Schema 输出——分维度、有位置引用、有修改建议",
          "StyleCard（对话比例、视角、语气标记、句长）真正写入写作提示词",
          "longTerm 内存从空数组改为读取 StoryBeat 关键转折点索引",
        ],
      },
    ],
  },
  {
    version: "v0.7.1",
    date: "2026-06-08",
    title: "thinking 字段全面修复——5 个 API 恢复可用",
    sections: [
      {
        label: "🐛 致命修复",
        items: [
          "硅基流动 Flash 不支持 thinking 字段",
          "import、summarize、classify、expand、commit、parse 共 6 个 API 的裸 fetch 调用全部清理",
          "之前这些 API 点了没反应——报 400 但前端没显示错误",
        ],
      },
      {
        label: "🏗 工程",
        items: [
          "Workspace 页面 2895→2063 行，抽出 CharacterList/LorebookList/types 三个模块",
        ],
      },
    ],
  },
  {
    version: "v0.7.0",
    date: "2026-06-07",
    title: "角色扩展大幅加速 + 查重优化",
    sections: [
      {
        label: "⚡ 加速",
        items: [
          "Expand 从非流式改为流式生成——3 秒开始出角色，不再是干等 20 秒",
          "批量从 4 翻到 8——100 角色从 25 批减到 13 批",
          "Prompt 压缩 40%——框架式模板替代散装指令",
        ],
      },
      {
        label: "🧠 扩展质量",
        items: [
          "铁律 1：禁止\"无\"\"未知\"\"暂无\"——缺信息按地位推敲",
          "铁律 2：同类型角色外貌性格必须可区分",
          "铁律 3：能力按地位推导——掌门 > 长老 > 执事 > 弟子",
          "世界书+风格卡走缓存，秒读上下文",
        ],
      },
      {
        label: "🗄️ 性能",
        items: [
          "角色查重：复用已加载数据，0 次额外 DB 查询",
          "词条查重：1 次批量 findMany 替代逐个查询",
          "100 角色 + 100 词条：DB 查询从 200 次 → 1 次",
        ],
      },
    ],
  },
  {
    version: "v0.6.1",
    date: "2026-06-07",
    title: "解析进度完全可视化",
    sections: [
      {
        label: "📊 进度",
        items: [
          "流式检测中实时显示角色名计数",
          "去重合并阶段逐角色推送——每发现新角色即时通知",
          "前端实时显示已发现角色数 + 词条数",
        ],
      },
      {
        label: "🔧 修复",
        items: [
          "commit + expand 加 maxDuration=300，防止部署平台 60s 超时掐断",
          "commit 完成消息角色数双倍计数修复",
        ],
      },
    ],
  },
  {
    version: "v0.6.0",
    date: "2026-06-07",
    title: "最后小块丢失修复",
    sections: [
      {
        label: "🐛 Bug",
        items: [
          "smartChunk 短尾块（<200 字）自动合并到前一块，不再丢弃",
          "十万字文本的最后一段不会凭空消失",
        ],
      },
    ],
  },
  {
    version: "v0.5.0",
    date: "2026-06",
    title: "核心功能上线",
    sections: [
      {
        label: "✨ 导入解析",
        items: [
          "Smart chunk 分块：按段落边界，≤6000 字/块",
          "N 路 Flash 并行提取 + JS 去重合并",
          "SSE 流式进度——解析阶段全程可见",
        ],
      },
      {
        label: "📝 确认提交",
        items: [
          "Flash 分批并行合并（每批 4 个）",
          "同名角色/词条自动合并",
          "可选确认/单个移除/一键删除/分批提交",
        ],
      },
      {
        label: "🤖 AI 扩展",
        items: [
          "选中角色一键批量扩展",
          "globalPrompt 缓存世界书+风格卡",
          "人物时间线 timeline 防 OOC",
        ],
      },
      {
        label: "📱 部署",
        items: [
          "生产环境部署",
          "PWA manifest + Service Worker",
        ],
      },
    ],
  },
];
