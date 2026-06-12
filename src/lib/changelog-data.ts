/**
 * Novel Forge 更新公告 —— 唯一数据源
 *
 * 规则（每次部署必做）：
 *   1. 如果本次有改动 → 在 VERSIONS 数组最前面新增一个版本条目
 *   2. 更新 LATEST_VERSION 指向新版本号
 *   3. 更新首页公告摘要 CHANGELOG_BRIEF
 *   4. deploy → 自动同步到 changelog 页面 + 首页弹窗 + SW 刷新
 *
 * 修改此文件后直接部署即可，无需手动改其他文件。
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

export const LATEST_VERSION = "v0.15.2";

/** 首页公告弹窗摘要（只列最新版本的关键项） */
export const CHANGELOG_BRIEF = [
  "📖 仅世界卡模式——复述蒸馏，提取全部世界观设定，不总结不压缩",
  "🎨 仅风格卡模式——分析全部风格维度 + 提取写作规则",
  "⬆️ maxTokens 全链路 32768——真正无上限提取，不截断",
  "🔀 SettingsImporter 三模式切换——全部三卡 / 仅世界 / 仅风格",
];

/** 完整版本历史（最新在前） */
export const VERSIONS: VersionEntry[] = [
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
