// 内置示范预设（单一数据源：API 播种路由 /api/seed/presets 与 prisma/seed.ts 共用）
// 用相对路径 import JSON，以兼容 tsx / node 直接运行（不依赖 @/ 别名解析）
import stagePlay from "../app/api/seed/presets/stage-play.json";

export const BUILTINS: any[] = [
  // —— 原有 4 个示范预设（保留） ——
  {
    type: "table_template",
    title: "宫斗·妃嫔居住建筑表",
    description: "宝宝流示范表格：记录妃嫔当前居所。每章写完由 AI 自动填表更新。",
    tags: ["宫斗", "古言", "示范", "表格模板"],
    content: {
      tables: [
        {
          key: "woman_live",
          name: "妃嫔居住建筑表",
          note: "记录妃嫔当前居住的建筑。每行代表一个妃嫔当前的住处。列：妃嫔名称/居住建筑/居住状态/补充说明",
          category: "place",
          columns: [
            { key: "name", label: "妃嫔名称", type: "text" },
            { key: "live", label: "居住建筑", type: "text" },
            { key: "status", label: "居住状态", type: "select" },
            { key: "note", label: "补充说明", type: "text" },
          ],
          rows: [],
        },
      ],
    },
  },
  {
    type: "story_progression",
    title: "好感度·分阶段人设模板",
    description: "宝宝流分阶段人设：同一角色随好感度数值呈现不同性格阶段，填表驱动一致性。",
    tags: ["通用", "人设", "示范", "剧情推进"],
    content: {
      entries: [
        {
          title: "好感度分阶段人设（苏苏）",
          content:
            '<if cell="属性表/苏苏/好感度 <= 10">\n阶段一：陌生人（态度：礼貌但疏离；称呼："你"、"那个人"）\n<else>\n<if cell="属性表/苏苏/好感度 <= 30">\n阶段二：熟悉的人（态度：愿意聊天；称呼：名字）\n<else>\n<if cell="属性表/苏苏/好感度 <= 60">\n阶段三：暧昧期（态度：在意你；称呼：昵称）\n<else>\n阶段四：恋人（态度：甜蜜依赖；称呼：专属昵称）\n</if>\n</if>\n</if>',
          keys: ["好感度", "分阶段人设", "苏苏"],
        },
      ],
    },
  },
  {
    type: "style",
    title: "古风·严谨文笔",
    description: "用词考究、句式工整、重描写与氛围。适合仙侠/古言。",
    tags: ["古风", "仙侠", "文风", "示范"],
    content: {
      styleDescription: "古风、用词考究、句式工整、重描写与氛围营造，叙述克制而有质感。",
      povType: "third_person_limited",
      avgSentenceLength: 28,
      shortSentenceRatio: 0.3,
      longSentenceRatio: 0.18,
      dialogueRatio: 0.28,
      descriptionRatio: 0.34,
      actionRatio: 0.22,
      innerThoughtRatio: 0.16,
      tonalMarkers: { classicalRatio: 0.8, modernRatio: 0.2, coldness: 0.2, tragedy: 0.1, warmth: 0.2 },
      lexicalFeatures: { classicalRatio: 0.8, modernRatio: 0.2, termDensity: 0.5, idiomsDensity: 0.6 },
    },
  },
  {
    type: "worldview",
    title: "仙侠·世界观骨架",
    description: "仙侠/玄幻通用世界观模板：修炼体系、势力分布、地域。套用即生成世界书词条。",
    tags: ["仙侠", "玄幻", "世界观", "示范"],
    content: {
      entries: [
        {
          title: "修炼体系",
          content:
            "境界由低到高：炼气→筑基→金丹→元婴→化神→合体→大乘→渡劫。灵气为根本，资质与功法决定上限。",
          keys: ["修炼", "境界", "灵气", "功法"],
        },
        {
          title: "势力分布",
          content:
            "正道以「玄天宗」为首，魔道有「血煞门」，中立散修聚于「万宝阁」。宗门林立，资源争夺不断。",
          keys: ["宗门", "势力", "玄天宗", "血煞门"],
        },
        {
          title: "地域",
          content:
            "东域灵脉充沛为修真核心，北原苦寒多妖兽，南海散修云集，西域古国遗迹遍布。",
          keys: ["东域", "北原", "南海", "西域"],
        },
      ],
    },
  },

  // —— 新增：文档明确命名的表格模板预设 ——
  {
    type: "table_template",
    title: "主角信息表（属性/关系/资产）",
    description: "文档「定制/修改模板」示范表格：记录主角跨章节稳定的属性、关系与资产，供分阶段人设与剧情推进引用。",
    tags: ["通用", "表格模板", "主角", "分步人设"],
    content: {
      tables: [
        {
          key: "attr_table",
          name: "属性表",
          note: "记录角色数值型属性（如好感度、境界、声望）。每行一个角色，列即属性名；<if cell> 语法引用「属性表/角色名/属性名」。",
          category: "attribute",
          columns: [
            { key: "name", label: "角色名", type: "text" },
            { key: "好感度", label: "好感度", type: "number" },
            { key: "境界", label: "境界", type: "text" },
            { key: "声望", label: "声望", type: "number" },
          ],
          rows: [],
        },
        {
          key: "rel_table",
          name: "关系表",
          note: "记录角色之间的关系倾向数值（如好感、敌意）。供多条件组合 <if cell> 引用。",
          category: "relationship",
          columns: [
            { key: "name", label: "角色名", type: "text" },
            { key: "好感度", label: "好感度", type: "number" },
            { key: "敌意", label: "敌意", type: "number" },
          ],
          rows: [],
        },
        {
          key: "asset_table",
          name: "资产表",
          note: "记录角色财富/资源数值（如财富值）。供「好感度 + 资产」多条件人设引用。",
          category: "asset",
          columns: [
            { key: "name", label: "角色名", type: "text" },
            { key: "财富值", label: "财富值", type: "number" },
          ],
          rows: [],
        },
      ],
    },
  },
  // —— 新增：文档明确命名的剧情推进预设 ——
  {
    type: "story_progression",
    title: "缝合怪·多线剧情推进",
    description: "文档「进阶-缝合怪预设」：不只在回忆，而按主线/个人线/事件线多速率推进。套用后剧情主动演进。",
    tags: ["通用", "剧情推进", "缝合怪", "多线"],
    content: {
      entries: [
        {
          title: "多线推进指令（缝合怪）",
          content:
            "【剧情推进规则·缝合怪】\n" +
            "1. 主线推进速率：每章确保主线向前推进至少一个关键节点（新线索/冲突升级/目标临近）。\n" +
            "2. 个人线推进速率：按角色好感度/关系表，渐进揭示角色私密动机与情感变化，不跳跃。\n" +
            "3. 事件线推进速率：已铺设的伏笔与随机事件，按权重逐步兑现，避免烂尾。\n" +
            "4. 推进时优先引用已填表的世界书与表格行，保持前后一致；新事实必须回填对应表格。\n" +
            "⚠️ 推进不等于堆设定：每步都要落到具体人物行动与后果。",
          keys: ["剧情推进", "缝合怪", "主线", "个人线", "事件线"],
        },
        {
          title: "多条件组合人设（好感度+资产）",
          content:
            '<if cell="关系表/苏苏/好感度 > 50">\n  <if cell="资产表/苏苏/财富值 > 1000">\n    苏苏对你有好感且富有，会主动送你礼物。\n  <else>\n    苏苏对你有好感但经济拮据，会用手工礼物表达心意。\n  </if>\n<else>\n  苏苏对你态度冷淡。\n</if>',
          keys: ["好感度", "财富值", "多条件人设", "苏苏"],
        },
      ],
    },
  },

  // —— 新增：文档/常见题材的世界观骨架 ——
  {
    type: "worldview",
    title: "现代都市·世界观骨架",
    description: "现代都市/职场/校园通用世界观：势力格局、社会规则、地标。套用即生成现代背景世界书。",
    tags: ["现代", "都市", "校园", "世界观"],
    content: {
      entries: [
        {
          title: "势力格局",
          content:
            "城市由老牌家族「顾氏」、新兴科技集团「星澜」与地下势力「夜枭」三足鼎立；普通人活在规则之下，暗流在顶层涌动。",
          keys: ["顾氏", "星澜", "夜枭", "势力"],
        },
        {
          title: "社会规则",
          content:
            "明面遵从法律与契约，暗面讲究人情与筹码。学历、资本、人脉是三道隐形的门。",
          keys: ["规则", "契约", "人脉", "资本"],
        },
        {
          title: "核心地标",
          content:
            "中央商务区「云顶」象征财富权力；老城区「槐安街」藏着旧事与底层江湖；城郊「渡口」是灰色交易的边缘。",
          keys: ["云顶", "槐安街", "渡口", "地标"],
        },
      ],
    },
  },
  {
    type: "worldview",
    title: "西幻·世界观骨架",
    description: "西方奇幻通用世界观：魔法体系、种族、王国。套用即生成西幻背景世界书。",
    tags: ["西幻", "奇幻", "魔法", "世界观"],
    content: {
      entries: [
        {
          title: "魔法体系",
          content:
            "魔力源自「源质」，通过元素亲和施法。奥术（理性构建）、神术（信仰赐予）、血脉（先天传承）三系并存。",
          keys: ["魔法", "源质", "奥术", "神术", "血脉"],
        },
        {
          title: "种族分布",
          content:
            "人类占据王国中心；精灵隐于森林；矮人据守山脉矿脉；被放逐的兽人游荡荒原。偏见与同盟交织。",
          keys: ["人类", "精灵", "矮人", "兽人", "种族"],
        },
        {
          title: "王国格局",
          content:
            "统一帝国崩解后，七大领主各据一方，王座悬空，预言中的「归来者」将重启秩序或带来终焉。",
          keys: ["帝国", "领主", "王座", "预言"],
        },
      ],
    },
  },

  // —— 新增：文档/常见题材的文风卡 ——
  {
    type: "style",
    title: "快节奏·爽文笔",
    description: "短句为主、对话密集、强情节推进。适合系统流/都市爽文/轻小说。",
    tags: ["爽文", "快节奏", "网文", "文风"],
    content: {
      styleDescription: "快节奏、爽点密集、对话驱动、不拖泥带水，强调即时反馈与情绪释放。",
      povType: "first_person",
      avgSentenceLength: 16,
      shortSentenceRatio: 0.6,
      longSentenceRatio: 0.08,
      dialogueRatio: 0.45,
      descriptionRatio: 0.15,
      actionRatio: 0.35,
      innerThoughtRatio: 0.25,
      tonalMarkers: { classicalRatio: 0.1, modernRatio: 0.9, coldness: 0.1, tragedy: 0.05, warmth: 0.3 },
      lexicalFeatures: { classicalRatio: 0.1, modernRatio: 0.9, termDensity: 0.25, idiomsDensity: 0.2 },
    },
  },
  {
    type: "style",
    title: "暗黑·史诗笔",
    description: "长句沉郁、描写厚重、宿命与牺牲基调。适合克苏鲁/黑暗奇幻/严肃文学。",
    tags: ["暗黑", "史诗", "严肃", "文风"],
    content: {
      styleDescription: "沉郁厚重、宿命感强、描写细腻而压抑，长句堆叠氛围，悲壮与荒诞交织。",
      povType: "third_person_omniscient",
      avgSentenceLength: 34,
      shortSentenceRatio: 0.18,
      longSentenceRatio: 0.3,
      dialogueRatio: 0.2,
      descriptionRatio: 0.42,
      actionRatio: 0.2,
      innerThoughtRatio: 0.18,
      tonalMarkers: { classicalRatio: 0.5, modernRatio: 0.5, coldness: 0.6, tragedy: 0.5, warmth: 0.05 },
      lexicalFeatures: { classicalRatio: 0.5, modernRatio: 0.5, termDensity: 0.6, idiomsDensity: 0.4 },
    },
  },

  // —— 新增：文档示范角色卡（苏苏，配套分阶段人设） ——
  {
    type: "character",
    title: "示范角色·苏苏",
    description: "文档分阶段人设示范角色：小师妹苏苏，随好感度从陌生人演进到恋人。配套属性表使用。",
    tags: ["角色卡", "示范", "恋爱", "分步人设"],
    content: {
      name: "苏苏",
      role: "main",
      background: "宗门里人见人爱的小师妹，表面天真烂漫，实则心思细腻，对亲近之人藏着依赖。",
      personality: {
        base: "可爱、活泼、嘴硬心软",
        byStage: "随好感度从礼貌疏离→别扭傲娇→暧昧脸红→甜蜜依赖（见剧情推进预设的 <if cell> 分阶段人设）",
      },
      appearance: { height: "娇小", feature: "杏眼、双马尾", trait: "常穿浅色弟子服" },
      tags: ["小师妹", "恋爱", "分步人设"],
    },
  },

  // —— 新增：酒馆迁移 preset 类型示范 ——
  {
    type: "regex",
    title: "通用·删除思维链",
    description: "清洗模型输出中的 <think>/<thinking>/<analysis> 等内部思维块，让正文更干净。",
    tags: ["正则", "后处理", "清洗", "示范"],
    content: {
      rules: [
        { name: "删除<think>", pattern: "<think>[\\\\s\\\\S]*?</think>", flags: "gi", replace: "" },
        { name: "删除<thinking>", pattern: "<thinking>[\\\\s\\\\S]*?</thinking>", flags: "gi", replace: "" },
        { name: "删除<analysis>", pattern: "<analysis>[\\\\s\\\\S]*?</analysis>", flags: "gi", replace: "" },
      ],
    },
  },
  {
    type: "lorebook",
    title: "示范·世界书条目",
    description: "酒馆式世界书预设：一组可关键词召回的设定条目，应用后写入项目世界书。",
    tags: ["世界书", "示范", "设定"],
    content: {
      entries: [
        {
          title: "核心设定",
          content: "这是一个魔法与科技并存的末世，魔法被称作「源质」，科技被称为「旧律」。",
          keys: ["源质", "旧律", "末世"],
          depth: 2,
        },
      ],
    },
  },
  {
    type: "api_config",
    title: "示范·创意奔放 API 参数",
    description: "适合抽卡/脑洞章节的高温度 API 参数预设：temperature 1.2、topP 0.9。",
    tags: ["API参数", "示范", "创意"],
    content: { temperature: 1.2, topP: 0.9, maxTokens: 4000 },
  },
  {
    type: "lorebook",
    title: "舞台剧风格",
    description: "舞台剧/话剧文风世界书：角色性格恒定、克制情绪波动、对白密集、动作夸张。套用即注入话剧写作基调与文风开关。",
    tags: ["舞台剧", "话剧", "文风", "世界书"],
    content: stagePlay,
  },
];
