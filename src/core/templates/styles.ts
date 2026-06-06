/**
 * 文风模板系统 —— 固化写作风格，防止 AI 跑偏
 *
 * 每个模板锁定：System Prompt 风格描述、Temperature/Top-P、禁用句式、场景节奏。
 * 用户选择一个模板后，所有生成都会带上对应风格约束。
 */

export interface StyleTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** System Prompt 中追加的风格描述 */
  stylePrompt: string;
  /** 推荐的 Temperature (0-1) */
  temperature: number;
  /** 推荐的 Top-P */
  topP: number;
  /** 每节目标字数 */
  targetWordsPerSection: number;
  /** 禁用句式（正则或关键词） */
  forbiddenPatterns: string[];
  /** 场景节奏指引 */
  pacingGuide: string;
  /** 对话风格指引 */
  dialogueGuide: string;
  /** 描写密度 (1-10) */
  descriptionDensity: number;
}

// ─── 预设模板库 ──────────────────────────────────────────────

export const STYLE_TEMPLATES: StyleTemplate[] = [
  {
    id: "hot_blooded",
    name: "热血竞技",
    description: "快节奏、燃向、比赛/战斗场面描写。适合运动番、战斗番。",
    icon: "🔥",
    stylePrompt: `你正在写一部热血竞技小说。

文风要求：
- 节奏快速，段落短促有力
- 动作描写精准利落，多用动词少用形容词
- 关键时刻要燃——用短句堆叠紧张感，然后爆发
- 对话干脆，角色说话不拖泥带水
- 内心独白简短有力，不要大段心理描写
- 比赛/战斗场面要清晰可跟，读者能"看到"动作`,
    temperature: 0.9,
    topP: 0.95,
    targetWordsPerSection: 1200,
    forbiddenPatterns: [
      "他叹了口气",
      "心想",
      "不由得",
      "感到一阵",
      "内心充满了",
      "不禁感叹",
      "深深地吸了一口气",
    ],
    pacingGuide: "慢-快-爆：铺垫→交锋→高潮→收尾。每节至少一个燃点。",
    dialogueGuide: "角色对话简短有力，不超过3句连发。关键台词独立成段，加粗强调。",
    descriptionDensity: 4,
  },
  {
    id: "slice_of_life",
    name: "轻松日常",
    description: "轻松幽默、日常互动为主。适合校园、恋爱喜剧、日常向。",
    icon: "☕",
    stylePrompt: `你正在写一部轻松日常向小说。

文风要求：
- 节奏舒缓自然，像午后聊天
- 对话占比高，角色间的互动是核心
- 幽默感自然不做作，不要刻意搞笑
- 描写细腻但不过度，给读者想象空间
- 情感流露含蓄，用细节暗示而非直白说明`,
    temperature: 0.85,
    topP: 0.92,
    targetWordsPerSection: 1000,
    forbiddenPatterns: [
      "突然",
      "猛地",
      "心中一震",
      "不可思议",
    ],
    pacingGuide: "流水式推进，一天/一个事件的开始到结束。日常中的微妙变化。",
    dialogueGuide: "对话占比60%以上。角色各有口癖和小动作。用对话推进剧情。",
    descriptionDensity: 6,
  },
  {
    id: "dark_tragedy",
    name: "黑暗虐文",
    description: "沉重压抑、悲剧向。适合复仇、末世、悲剧爱情。",
    icon: "🌑",
    stylePrompt: `你正在写一部黑暗向虐文。

文风要求：
- 氛围沉重压抑，用环境描写烘托情绪
- 角色的痛苦要具体——写他们失去了什么，而不是"很痛苦"
- 对话中隐含对抗和潜台词
- 节奏慢而沉重，像钝刀子割肉
- 结局不一定光明，但要合理`,
    temperature: 0.8,
    topP: 0.9,
    targetWordsPerSection: 1000,
    forbiddenPatterns: [
      "希望就在前方",
      "突然发现",
      "原来是误会",
      "终于露出了笑容",
    ],
    pacingGuide: "压抑→更压抑→短暂喘息→爆发→余韵。不要让角色轻易解脱。",
    dialogueGuide: "对话充满潜台词和对抗。沉默比说话更有力。用省略号表达迟疑。",
    descriptionDensity: 7,
  },
  {
    id: "mystery",
    name: "悬疑推理",
    description: "逻辑严密、层层递进。适合推理、悬疑、谍战。",
    icon: "🔍",
    stylePrompt: `你正在写一部悬疑推理小说。

文风要求：
- 逻辑严密，每条线索都要前后呼应
- 节奏紧凑，信息密度高
- 描写侧重细节——一个不起眼的物品可能是关键线索
- 对话中埋信息，角色说的每句话都可能暗藏玄机
- 保持神秘感，不要过早揭穿真相`,
    temperature: 0.75,
    topP: 0.9,
    targetWordsPerSection: 1000,
    forbiddenPatterns: [
      "恍然大悟",
      "这才明白",
      "原来如此",
    ],
    pacingGuide: "设疑→推进→误导→再推进→反转。每章至少埋一个新线索。",
    dialogueGuide: "对话是信息战。每人只说该说的，隐藏不该说的。",
    descriptionDensity: 8,
  },
  {
    id: "romance",
    name: "恋爱喜剧",
    description: "甜向恋爱、欢喜冤家。适合恋爱喜剧、甜文。",
    icon: "💕",
    stylePrompt: `你正在写一部恋爱喜剧。

文风要求：
- 甜蜜但不腻，幽默但不尬
- 角色间互动的化学反应是核心——写他们怎么彼此影响
- 对话俏皮自然，各有口癖
- 内心戏丰富但不冗长
- 关键情感场景慢下来，给读者沉浸感`,
    temperature: 0.88,
    topP: 0.94,
    targetWordsPerSection: 1000,
    forbiddenPatterns: [
      "心里一暖",
      "心跳加速",
      "脸红得像",
    ],
    pacingGuide: "相遇→误会/冲突→慢慢了解→关键事件→关系升温→新问题。",
    dialogueGuide: "对话是情感载体。欢喜冤家式互怼+偶尔的真情流露。",
    descriptionDensity: 5,
  },
  {
    id: "epic_fantasy",
    name: "史诗奇幻",
    description: "宏大世界观、多线叙事。适合奇幻、科幻、历史架空。",
    icon: "🏰",
    stylePrompt: `你正在写一部史诗奇幻小说。

文风要求：
- 气势恢宏，场景描写有电影感
- 世界观的展现通过角色的眼睛，不要像说明书
- 多线并行但主次分明
- 战斗场面史诗感强，大场面和小细节穿插
- 角色众多但每人都有独特声音`,
    temperature: 0.85,
    topP: 0.93,
    targetWordsPerSection: 1500,
    forbiddenPatterns: [
      "简单地",
      "大概",
      "差不多",
    ],
    pacingGuide: "宏大场景→角色聚焦→冲突升级→高潮→余波。张弛有度。",
    dialogueGuide: "不同阶层/种族/阵营的角色说话方式不同。正式场合用敬语，私下随意。",
    descriptionDensity: 7,
  },
  {
    id: "sci_fi",
    name: "科幻未来",
    description: "硬核科幻、未来设定。适合赛博朋克、太空歌剧、AI题材。",
    icon: "🚀",
    stylePrompt: `你正在写一部科幻小说。

文风要求：
- 科技设定自然融入叙事，不要长篇解释
- 未来感通过细节体现——不是描述"高科技"，而是写角色怎么用
- 逻辑自洽，科技设定不能前后矛盾
- 在硬核设定和人文关怀间找平衡`,
    temperature: 0.8,
    topP: 0.9,
    targetWordsPerSection: 1200,
    forbiddenPatterns: [
      "不可思议的",
      "神奇的",
      "无法理解的",
    ],
    pacingGuide: "设定引入→冲突→科技解谜→伦理困境→解决。不要让设定压倒故事。",
    dialogueGuide: "技术角色用精准术语，普通角色用类比。不要让角色都像工程师。",
    descriptionDensity: 6,
  },
  {
    id: "custom",
    name: "自定义",
    description: "你完全自定义文风参数。",
    icon: "✏️",
    stylePrompt: "",
    temperature: 0.85,
    topP: 0.95,
    targetWordsPerSection: 1000,
    forbiddenPatterns: [],
    pacingGuide: "",
    dialogueGuide: "",
    descriptionDensity: 5,
  },
];

// ─── 辅助函数 ───────────────────────────────────────────────

export function getTemplate(id: string): StyleTemplate | undefined {
  return STYLE_TEMPLATES.find((t) => t.id === id);
}

/**
 * 将模板的 System Prompt 合并到现有的风格描述中
 */
export function applyTemplate(
  template: StyleTemplate,
  baseSystemPrompt: string
): string {
  if (!template.stylePrompt) return baseSystemPrompt;
  return `${baseSystemPrompt}\n\n【文风约束——最高优先级】\n${template.stylePrompt}`;
}

/**
 * 将禁用句式转换为 Prompt 指令
 */
export function forbiddenPatternsToPrompt(template: StyleTemplate): string {
  if (template.forbiddenPatterns.length === 0) return "";
  return `\n\n【禁止以下表达】\n${template.forbiddenPatterns.map((p) => `- 禁止使用：${p}`).join("\n")}`;
}
