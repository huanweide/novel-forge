/**
 * 大纲模板系统 —— 5种叙事结构
 *
 * 每种模板定义章节分配比例和每阶段的内容指引。
 * 供大纲生成 API（/api/generate/outline）使用时指定 template 参数。
 *
 * 不调 LLM——纯数据结构，由下游生成 API 拼入 prompt 使用。
 */

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

export interface OutlineStage {
  /** 阶段名 */
  name: string;
  /** 占总章数比例（如 0.25 = 25%） */
  ratio: number;
  /** 该阶段应该写什么 */
  goal: string;
  /** 示例提示 */
  example: string;
}

export interface OutlineTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** 建议总章数范围 */
  recommendedChapters: [number, number];
  /** 各阶段定义 */
  stages: OutlineStage[];
  /** 注入生成 prompt 的指引文本 */
  promptGuide: string;
}

// ═══════════════════════════════════════════
// 5 种模板
// ═══════════════════════════════════════════

export const OUTLINE_TEMPLATES: OutlineTemplate[] = [
  {
    id: "three_act",
    name: "三幕式",
    icon: "🎬",
    description: "建置 → 对抗 → 结局。最经典的西方戏剧结构，适合大多数类型小说。",
    recommendedChapters: [10, 30],
    stages: [
      {
        name: "第一幕：建置",
        ratio: 0.25,
        goal: "引入主角、世界观和核心冲突。建立日常世界，然后发生「激励事件」打破平衡——主角被迫离开舒适区。",
        example: "主角李尘在宗门日常修炼 → 宗门大比中意外发现神秘铁片 → 铁片引发异象，长老神色异常",
      },
      {
        name: "第二幕：对抗",
        ratio: 0.50,
        goal: "主角面对越来越大的阻碍。每次小胜利都带来更大的问题。中间点是重大转折——看似失败实则获得关键信息/能力。",
        example: "追查铁片秘密 → 遭遇各方势力争夺 → 中间点：被围攻跌落悬崖 → 崖底发现上古传承 → 突破后重返宗门",
      },
      {
        name: "第三幕：结局",
        ratio: 0.25,
        goal: "最终对决。主角带着第二幕获得的能力/盟友，面对终极挑战。高潮后给读者一个呼吸的收尾。",
        example: "宗门生死存亡之战 → 铁片真相大白 → 击败幕后黑手 → 新的日常建立，为续作留钩子",
      },
    ],
    promptGuide: `用三幕式结构拆章：
- 前25%章数为建置——每章逐步揭示世界观和角色关系
- 中间50%为对抗——冲突逐章升级，中间点安排重大转折
- 最后25%为结局——伏笔集中回收，高潮→收束`,
  },
  {
    id: "qichengzhuanhe",
    name: "起承转合",
    icon: "📜",
    description: "中国传统四段式。起（开端）→承（发展）→转（转折）→合（收束）。仙侠/玄幻首选。",
    recommendedChapters: [8, 24],
    stages: [
      {
        name: "起——开端",
        ratio: 0.20,
        goal: "交代背景、立人物、埋伏笔。基调定好了后面才不跑偏。修仙文通常从'凡人/低阶弟子'视角切入。",
        example: "炼气期弟子李尘，灵根资质平平，在宗门做杂役——看似废柴开局，但某次打扫藏经阁时发现一本无字古书",
      },
      {
        name: "承——发展",
        ratio: 0.35,
        goal: "主线展开，配角入场，势力关系铺开。主角逐步变强但每次进步都有代价。建立'修仙世界的规则感'。",
        example: "参悟古书→修为突破→引起内门注意→秘境试炼→结识盟友→得罪势力→获得机缘但留下隐患",
      },
      {
        name: "转——转折",
        ratio: 0.30,
        goal: "核心冲突爆发。之前埋的伏笔在此爆发。主角面对真正的危机——可能是背叛、可能是身世之谜、可能是天劫。这是全书最紧张的段落。",
        example: "宗门内乱→古书秘密被觊觎→被逐出宗门/主动出走→流落在外遭遇生死危机→绝境中突破到新境界",
      },
      {
        name: "合——收束",
        ratio: 0.15,
        goal: "伏笔闭环，角色归宿交代。主角达到阶段性目标（不一定最终目标）。留一两根线给续作。",
        example: "重返宗门→清算旧账→建立新秩序→主角踏上更广阔的舞台（暗示更高境界/更大地图）",
      },
    ],
    promptGuide: `用起承转合拆章：
- "起"约占20%章数——不求快，求稳。每章留一个小悬念钩住读者
- "承"约占35%——明线（修炼升级）和暗线（古书秘密）交替推进
- "转"约占30%——节奏加快，章尾悬念加强，让读者停不下来
- "合"约占15%——不拖拉，回收主要伏笔，给读者满足感`,
  },
  {
    id: "heros_journey",
    name: "英雄之旅",
    icon: "🦸",
    description: "坎贝尔神话原型。12个阶段从平凡到非凡。适合成长型主角的长篇。",
    recommendedChapters: [15, 40],
    stages: [
      {
        name: "启程（阶段1-5）",
        ratio: 0.30,
        goal: "平凡世界→冒险召唤→拒绝召唤→导师出现→跨越阈值。主角从'不想去'到'不得不去'。",
        example: "日常修炼→意外得知身世→不敢面对→遇到神秘老者（导师）→被迫离开宗门踏上旅程",
      },
      {
        name: "启蒙（阶段6-9）",
        ratio: 0.45,
        goal: "试炼之路→接近核心→最大磨难→获得奖赏。最长的部分——主角在磨难中蜕变。",
        example: "一路遭遇敌人/盟友/考验→接近真相→被最大反派击败/朋友牺牲→绝境顿悟→获得关键力量",
      },
      {
        name: "归来（阶段10-12）",
        ratio: 0.25,
        goal: "返回之路→复活重生→携宝归来。主角已经不是出发时的那个人。带着改变世界的力量回来。",
        example: "带着新能力/盟友归来→最终对决→看似死去实则重生→击败反派→世界因主角而改变",
      },
    ],
    promptGuide: `用英雄之旅12阶段拆章（合并为3大段）：
- 启程30%——平凡→打破→被迫踏上旅程
- 启蒙45%——试炼、盟友、敌人、最大磨难、蜕变
- 归来25%——带着改变一切的力量回来，完成命运`,
  },
  {
    id: "zhanghuiti",
    name: "章回体",
    icon: "📖",
    description: "中国传统章回小说格式。每章独立成篇又环环相扣。适合网文连载节奏。",
    recommendedChapters: [20, 100],
    stages: [
      {
        name: "入话——楔子",
        ratio: 0.05,
        goal: "开篇诗词/引子。一两章交代世界观的大背景（可以是上古传说/天地异变）。定了全书的调子。",
        example: "楔子：天地初开，混沌生道……万年后，一个少年在山村中醒来",
      },
      {
        name: "正传——逐章推进",
        ratio: 0.90,
        goal: "每章独立成篇：有起有落、有伏笔有回收、章尾留悬念（'且听下回分解'）。一个完整小事件=1~3章。大事件=5~8章。章与章之间靠悬念钩子串联。",
        example: "第1回：山村少年遇仙缘 → 第2回：初入宗门显锋芒 → 第3回：藏经阁中获奇书…每回结尾留'欲知后事如何'的悬念",
      },
      {
        name: "煞尾——收官",
        ratio: 0.05,
        goal: "全书高潮后的收束。交代主要角色归宿。诗词收尾，首尾呼应。暗示'故事未完'。",
        example: "终回：缘起缘灭皆因果……主角立于云端回望来时路，转身踏入新天地",
      },
    ],
    promptGuide: `用章回体拆章：
- 每回有对仗标题（如"第三回 藏经阁奇书现世 演武场一战成名"）
- 每回结尾必须留悬念——一个问题、一个危机、或一个意想不到的来访者
- 回与回之间靠'钩子'串联——上一回的悬念在下一回开头解答，然后引入新悬念
- 节奏：每1-3回一个小高潮，每5-8回一个大转折`,
  },
  {
    id: "free_structure",
    name: "自由结构",
    icon: "🆓",
    description: "不拘泥固定套路。适合实验性写作、短篇、或已有全本大纲的用户。",
    recommendedChapters: [1, 100],
    stages: [
      {
        name: "自由推进",
        ratio: 1.0,
        goal: "没有预设的结构约束。每章按作者指令和当前剧情自然推进。适合已经心里有完整故事线的作者。",
        example: "按你的想法来——AI 做执行者，你来做结构师",
      },
    ],
    promptGuide: `不预设结构。每章大纲按作者当前指令生成。保持与前文的逻辑一致性即可。`,
  },
];

// ═══════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════

export function getOutlineTemplate(id: string): OutlineTemplate | undefined {
  return OUTLINE_TEMPLATES.find((t) => t.id === id);
}

/**
 * 根据模板和总章数，计算每阶段建议章数。
 */
export function calculateChapterPlan(
  template: OutlineTemplate,
  totalChapters: number,
): Array<{ stageName: string; chapterCount: number; goal: string }> {
  return template.stages.map((stage) => ({
    stageName: stage.name,
    chapterCount: Math.max(1, Math.round(stage.ratio * totalChapters)),
    goal: stage.goal,
  }));
}

/**
 * 将模板指引注入生成 prompt。
 */
export function outlineTemplateToPrompt(template: OutlineTemplate): string {
  return `\n【大纲结构约束——${template.name}】\n${template.promptGuide}`;
}
