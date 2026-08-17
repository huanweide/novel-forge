// ============================================================
// 探讨模式类型定义
// ============================================================

/** 11个构建步骤 */
export const EXPLORE_STEPS = [
  "opening",        // 开篇
  "worldview",      // 世界观
  "protagonist",    // 主角身份
  "golden_finger",  // 金手指
  "core_conflict",  // 核心冲突
  "factions",       // 势力阵营
  "power_system",   // 力量体系
  "currency",       // 货币体系
  "map",            // 地图
  "plot_thread",    // 情节脉络
  "free_talk",      // 自由讨论
] as const;

export type ExploreStep = (typeof EXPLORE_STEPS)[number];

export const STEP_LABELS: Record<ExploreStep, string> = {
  opening: "开篇",
  worldview: "世界观",
  protagonist: "主角身份",
  golden_finger: "金手指",
  core_conflict: "核心冲突",
  factions: "势力阵营",
  power_system: "力量体系",
  currency: "货币体系",
  map: "地图",
  plot_thread: "情节脉络",
  free_talk: "自由讨论",
};

export const STEP_ICONS: Record<ExploreStep, string> = {
  opening: "📖",
  worldview: "🌍",
  protagonist: "🦸",
  golden_finger: "✨",
  core_conflict: "⚔️",
  factions: "🏛️",
  power_system: "⚡",
  currency: "💰",
  map: "🗺️",
  plot_thread: "🧵",
  free_talk: "💬",
};

export const STEP_DESCRIPTIONS: Record<ExploreStep, string> = {
  opening: "开篇会决定整本书的题材、受众与篇幅定位。告诉AI你想写的大方向（玄幻/都市/科幻/历史/悬疑…），目标读者画像（男频/女频/少年向/成人向），以及期望篇幅（中篇/长篇/超长篇）与核心爽点或卖点。",
  worldview: "描述这个世界的基本规则——古代/现代/架空/异世界？有什么与众不同的法则？天地灵气/魔法/科技水平如何？世界的危险与机遇是什么？",
  protagonist: "主角是谁？姓名、性别、年龄、外貌、性格、背景、动机。Ta的起点在哪？Ta想要什么？Ta有什么缺陷需要克服？",
  golden_finger: "主角的金手指/外挂/特殊能力是什么？系统流/签到流/抽奖流/血脉觉醒/重生记忆/穿越赠品？金手指的规则和限制是什么？",
  core_conflict: "小说的核心矛盾是什么？主角 vs 什么？冲突的层次（个人/家族/国家/世界）？冲突的紧迫性——不解决会怎样？",
  factions: "世界中有哪些势力/组织/宗门/国家？各自的立场和目标？势力之间的关系（敌对/盟友/中立）？主角属于哪个势力？",
  power_system: "这个世界的力量/战斗体系是什么？等级如何划分？力量如何提升？战斗方式（法术/体术/法宝/科技武器）？体系有什么规则和限制？",
  currency: "世界的货币/经济体系是怎样的？货币种类和兑换关系？修炼资源如何获取和交易？什么东西值钱？什么稀缺？",
  map: "故事发生在什么地方？列出重要的地点——城市/宗门/秘境/战场。地理关系如何（东西南北/上下界）？每个地点的特色是什么？",
  plot_thread: "故事的主要情节线是什么？起点→发展→高潮→结局。重要的转折点有哪些？支线情节有哪些？",
  free_talk: "还有什么想讨论的？可以补充任何设定、提问、调整已有设定、或者让AI帮你梳理和完善整个世界观。",
};

/** 每个步骤的示例提问——点击即可发送给 AI，降低「不知道聊什么」的门槛 */
export const STEP_PROMPTS: Record<ExploreStep, string[]> = {
  opening: [
    "我想写一部玄幻升级流，主角从废柴逆袭",
    "目标男频青年向，长篇，主打热血爽点",
    "帮我定个故事的核心卖点和受众",
  ],
  worldview: [
    "这个世界的基本法则是什么？",
    "设定一个与众不同的修炼/科技体系",
    "世界的危险与机遇有哪些？",
  ],
  protagonist: [
    "主角叫什么，什么性格，起点如何？",
    "给我三个主角人设方案",
    "主角的缺陷和成长弧线怎么设计？",
  ],
  golden_finger: [
    "我想用系统流金手指，规则怎么定？",
    "金手指有什么限制才不崩？",
    "给我几个有趣的金手指创意",
  ],
  core_conflict: [
    "核心矛盾可以是什么？",
    "冲突的层次如何递进？",
    "不解决危机主角会怎样？",
  ],
  factions: [
    "世界有哪些势力？",
    "势力之间是什么关系？",
    "主角该站哪边？",
  ],
  power_system: [
    "力量体系如何分级？",
    "怎么修炼提升？",
    "战斗方式是什么？",
  ],
  currency: [
    "货币怎么设计？",
    "什么资源最稀缺值钱？",
    "修炼资源怎么交易？",
  ],
  map: [
    "列出几个关键地点",
    "地理格局怎么排布？",
    "某个秘境有什么特色？",
  ],
  plot_thread: [
    "主线起点到结局怎么走？",
    "关键转折点有哪些？",
    "帮我设计几条支线",
  ],
  free_talk: [
    "帮我整体梳理一遍设定",
    "哪里逻辑还不通顺？",
    "还有什么可以补充的？",
  ],
};

/** 小说类型选项 —— 题材名单一基准：以首页 GENRE_TEMPLATES 的 name 为准，避免两入口题材分叉 */
import { GENRE_TEMPLATES, type GenreTemplate } from "@/core/templates/genres";

export const GENRE_OPTIONS = [
  ...GENRE_TEMPLATES.map((g: GenreTemplate) => g.name),
  "玄幻", "奇幻", "末世", "游戏", "军事",
] as const;

/** 流派标签 */
export const STYLE_TAGS = [
  "系统流", "升级流", "无敌流", "种田流", "练功流", "技术流", "宠物流", "鉴宝流",
  "直播流", "经营流", "建设流", "领主流", "签到流", "抽奖流", "模拟器流",
  "重生", "穿越", "夺舍", "快穿", "女扮男装", "扮猪吃虎", "废柴逆袭", "天才",
  "退隐强者", "赘婿", "孤儿", "皇族",
  "宫斗", "探险", "末日求生", "星际", "盗墓", "航海", "校园", "职场",
  "电竞", "美食", "医术", "娱乐圈", "体育", "音乐",
  "慢热", "快节奏", "日常", "群像", "单女主", "后宫", "争霸", "复仇",
  "阴谋", "轻松", "暗黑", "治愈", "搞笑", "虐心",
] as const;

/** 受众定位 */
export const AUDIENCE_OPTIONS = [
  "男频·青年向", "男频·成人向", "女频·青年向", "女频·成人向", "少年向", "全年龄向",
] as const;

/** 篇幅预设 */
export const WORD_COUNT_PRESETS: Record<string, string> = {
  "短篇": "5-20万字",
  "中篇": "20-50万字",
  "长篇": "50-200万字",
  "超长篇": "200万字以上",
};

/** 情节结构 */
export const PLOT_STRUCTURES = [
  { id: "five_act", name: "五幕式", desc: "铺垫→发展→高潮→转折→结局" },
  { id: "three_act", name: "三幕式", desc: "开端→发展→结局" },
  { id: "hero_journey", name: "英雄之旅", desc: "平凡→召唤→考验→归来" },
  { id: "kishotenketsu", name: "起承转合", desc: "经典四段式结构" },
  { id: "johakyu", name: "序破急", desc: "日式三段式结构" },
] as const;

/** 风格偏好 */
export const STYLE_PREFERENCES = [
  "轻松搞笑", "热血燃向", "严肃深沉", "细腻温情", "黑暗压抑", "诙谐讽刺", "史诗磅礴", "清新治愈",
] as const;

/** 力量体系 */
export const POWER_SYSTEMS = [
  "修仙体系", "仙道体系", "武道体系", "斗气体系", "内力体系", "炼体体系",
  "炼丹体系", "符箓体系", "阵法体系", "魔法体系", "元素体系", "精神力体系",
  "异能体系", "血脉体系", "龙脉体系", "契约体系", "召唤体系", "神力体系",
  "职业体系", "技能体系", "天赋体系", "星辰体系", "图腾体系", "灵魂体系",
  "规则体系", "源力体系", "科技体系", "机甲体系", "基因体系", "纳米体系",
  "赛博体系", "灵能科技", "星能体系", "气运体系", "因果体系", "命运体系",
  "混沌体系", "法则体系", "位面体系", "无力量体系",
] as const;

/** 金手指类型 */
export const GOLDEN_FINGERS = [
  "系统金手指", "签到金手指", "抽奖金手指", "商城金手指", "任务金手指",
  "模拟器金手指", "面板金手指", "属性金手指", "成就金手指",
  "血脉觉醒", "技能获取", "复制能力", "进化体质", "融合能力", "吞噬能力",
  "时间能力", "空间能力", "精神异能", "预知能力",
  "神奇道具", "至高宝物", "神秘书籍", "藏宝地图", "储物戒指", "棋盘世界", "万物图鉴",
  "宿主觉醒", "天命之子", "穿越赠品", "重生记忆", "剧本预知", "气运之子",
  "因果之力", "转世传承", "无金手指", "反派金手指",
  "读心能力", "鉴定能力", "经营天赋", "建设天赋", "收藏天赋",
] as const;

/** 构建配置 */
export interface BuildConfig {
  novelName: string;
  protagonistName: string;
  direction: string;
  genre: string;
  styleTags: string[];
  audience: string;
  wordCount: string;
  plotStructure: string;
  stylePreference: string;
  powerSystem: string;
  goldenFinger: string;
  coreConflict: string;
  forceOriginalNames: boolean;
  autoGenerateStoryline: boolean;
  /** v1.4.0 缝合怪推进：主线完结后自动构造承接的新主线（默认开） */
  autoConstructNewMain: boolean;
  /** v1.6.0 缝合怪节奏：fast 高频事件/steady 均衡/slow 慢热（默认 steady） */
  stitchPace: "fast" | "steady" | "slow";
  /** v1.8.13 故事线生成风格轴：creative 创意发散 / normal 平常均衡 / simple 简约克制（默认 creative） */
  storylineStyle: "creative" | "normal" | "simple";
  /** v1.8.13 故事线生成自动化轴：auto 自动落库 / free 仅建议不落库 / full 全权接管（默认 auto） */
  storylineAutomation: "auto" | "free" | "full";
}

export const DEFAULT_BUILD_CONFIG: BuildConfig = {
  novelName: "",
  protagonistName: "",
  direction: "",
  genre: "玄幻",
  styleTags: [],
  audience: "男频·青年向",
  wordCount: "50-200万字",
  plotStructure: "five_act",
  stylePreference: "",
  powerSystem: "",
  goldenFinger: "",
  coreConflict: "",
  forceOriginalNames: true,
  autoGenerateStoryline: true,   // v1.4.0：默认开启——写作时按剧情推进自动维护故事线（与缝合怪推进联动）
  autoConstructNewMain: true,    // v1.4.0：默认开启——主线完结后自动构造承接的新主线
  stitchPace: "steady",          // v1.6.0：默认均衡节奏
  storylineStyle: "creative",    // v1.8.13：默认创意风格
  storylineAutomation: "auto",   // v1.8.13：默认自动落库
};

/** 对话消息 */
export interface ExploreMessage {
  role: "user" | "agent";
  content: string;
  /** 抽卡模式下的候选卡片 */
  cards?: AdoptCard[];
}

/** 候选卡片 */
export interface AdoptCard {
  id: string;
  title: string;
  content: string;
  step: ExploreStep;
  adopted?: boolean;
}

/** 已采纳项 */
export interface AdoptedItem {
  id: string;
  step: ExploreStep;
  title: string;
  content: string;
  timestamp: number;
}
