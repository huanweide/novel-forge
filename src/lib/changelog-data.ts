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

export const LATEST_VERSION = "v0.24.0";

/** 首页公告弹窗摘要（只列最新版本的关键项） */
export const CHANGELOG_BRIEF = [
  "📋 站内「更新面板」上线——顶部突出当前版本号，每次改动都登记版本+内容，随时回看",
  "🧱 新增全局错误边界——任何未捕获异常显示中文友好页，不再白屏崩溃",
  "📟 高频路由错误可读化——探讨/采纳/拆书/实体高亮/Agent工具失败都返回中文操作指引",
  "🩺 系统自检横幅 + /api/health 探针——打开即提示「数据库没连 / AI 没配」并给一键修复命令",
];

/** 完整版本历史（最新在前） */
export const VERSIONS: VersionEntry[] = [
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
          "Deploy 改用 VERCEL_TOKEN 环境变量传参",
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
          "maxDuration从60秒拉到300秒——Vercel不再提前掐断LLM分析",
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
          "GitHub Actions自动部署到Vercel——每次push master自动上线",
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
          "maxDuration=60s：防止 Vercel 超时掐断",
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
          "commit + expand 加 maxDuration=300，防止 Vercel 60s 掐断",
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
          "Vercel 生产环境",
          "TWA Android APK + assetlinks 验证",
          "PWA manifest + Service Worker",
        ],
      },
    ],
  },
];
