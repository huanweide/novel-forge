// 确定性世界卡分类器（v1.6.3）
// ───────────────────────────────────────────────────────────────
// 把一段正文归类为 15 个世界卡分类之一，或 2 个元桶（character / unknown）。
// 用途：自动填表链路里，把抽取出的世界观实体/段落路由到正确的世界卡分类，
//       并验证用户要求的 14 类（含命运/物理/公开三类新世界）全覆盖、不冲突、边界清晰。
//
// 设计原则（确定性、可复现、不依赖 LLM）：
// 1. 每个分类持有一组关键词；权重 = 关键词字符长度，长词更具体 → 长词优先消歧。
// 2. 分类得分 = 命中的关键词权重之和（同一关键词多次命中只计一次）。
// 3. 取总分最高的分类；总分并列时取「命中最长关键词」更大者（再平则按 WORLD_CATEGORY_ORDER 稳定裁决）。
// 4. 若所有世界卡分类得分均为 0：
//    - 文本含强角色互动信号（说/道/问/答/笑/怒/想/看向/握住…）且无任何世界关键词 → "character"（交给角色卡，不入库世界卡）
//    - 否则 → "unknown"（无关，跳过）
//
// 边界消歧（长词优先已处理大部分；此处列出跨类易混词的人工裁决）：
// - 「灵石」裸词归 currency（货币义）；「灵石矿/矿石」归 item（material）。分类器按最长命中词裁决。
// - 「法则」：physics 用「时空法则/能量守恒/物理规则」等具体词；law 用「天道/天规/戒律/铁律」。裸「法则」同时给两边低权重，由更具体的同段词定类。
// - 「劫」：physics 不收；「命劫/劫数/天劫(预言语境)」归 fate_system；「渡劫/雷劫」归 magic_system（修炼）。
// - 「系统」裸词归 custom（金手指义，网文常见）；public_system 用「制度/阶级/律法/官府」等，不收裸「系统」。
// - 「宫/殿/阁」：faction 收「宫殿/圣殿/宗门大殿」等组织义；item 收具体法宝名（如「焚天鼎」），单字「宫」优先 faction。

export type WorldCategory =
  | "geography" | "faction" | "item" | "magic_system" | "technique"
  | "creature" | "culture" | "history" | "law" | "currency"
  | "character_relationship" | "custom" | "fate_system" | "physics" | "public_system";

export type MetaBucket = "character" | "unknown";
export type ClassifyBucket = WorldCategory | MetaBucket;

export interface ClassifyResult {
  bucket: ClassifyBucket;
  category: WorldCategory | null; // 仅当 bucket 为世界卡分类时非空
  score: number;
  matched: string[];              // 命中的关键词（去重）
  scores: Partial<Record<WorldCategory, number>>; // 各分类明细，便于调试与边界核查
}

export const ALL_WORLD_CATEGORIES: WorldCategory[] = [
  "geography", "faction", "item", "magic_system", "technique",
  "creature", "culture", "history", "law", "currency",
  "character_relationship", "custom", "fate_system", "physics", "public_system",
];

// 中文标签映射（单一权威源，与 ALL_WORLD_CATEGORIES 同源）。
// 键入为 Record<WorldCategory, string>：类型系统强制覆盖全部 15 类，
// 一旦 ALL_WORLD_CATEGORIES 增删/改名某一类，而此处漏改，tsc 直接报错，
// 从而在编译期消除「catOrder 与 catLabel 多源漂移」的根因（原 Round-2 PIT-2）。
export const WORLD_CATEGORY_LABELS: Record<WorldCategory, string> = {
  geography: "🗺 地理",
  faction: "🏛 势力",
  item: "💎 物品",
  magic_system: "⚙️ 力量体系",
  technique: "📘 功法体系",
  creature: "🐉 生物种族",
  culture: "🎭 文化",
  history: "📜 历史",
  law: "⚖️ 规则法则",
  currency: "💰 货币体系",
  character_relationship: "🔗 角色关系",
  custom: "📦 自定义",
  fate_system: "🔮 命运体系",
  physics: "🔬 物理",
  public_system: "🏛 公开体制",
};

// 拆分后的「emoji + 文案」结构，供装配引擎 loreSection / forcedLore 等
// 「需要把 emoji 与文案分离渲染」的场景复用。
//
// 关键：直接由 WORLD_CATEGORY_LABELS 派生（同一权威源），键入为
// Record<WorldCategory, { emoji; label }>。类型系统强制覆盖全部 15 类——
// 一旦 ALL_WORLD_CATEGORIES 增删/改名某一类而此处漏改，tsc 直接报错；
// 同时彻底取代装配引擎里原先那份弱类型、11/15 覆盖的手抄标签映射，
// 消除 fate_system / physics / public_system / character_relationship 四类
// 被塌缩到 custom 的多源漂移（Round-5 修复 NEW-UI-WC-1）。
export const WORLD_CATEGORY_SECTIONS: Record<WorldCategory, { emoji: string; label: string }> = (() => {
  const sections = {} as Record<WorldCategory, { emoji: string; label: string }>;
  for (const cat of ALL_WORLD_CATEGORIES) {
    const [emoji, ...rest] = WORLD_CATEGORY_LABELS[cat].split(" ");
    sections[cat] = { emoji, label: rest.join(" ") };
  }
  return sections;
})();

// 关键词表：每个分类一组。越长越具体，权重越高（权重 = 字符长度）。顺序无关。
const KEYWORDS: Record<WorldCategory, string[]> = {
  geography: ["大陆", "国家", "城市", "宗门", "秘境", "山脉", "河流", "海域", "疆域", "地图", "地域", "圣地", "洞天", "福地", "关隘", "都城", "城池", "山谷", "平原", "沙漠", "海洋", "岛屿", "宗门驻地", "灵脉"],
  faction: ["宗门", "家族", "帝国", "帮派", "圣地", "联盟", "王朝", "势力", "门派", "商会", "朝廷", "军部", "宫殿", "圣殿", "宗门大殿", "执法殿", "长老阁", "护法"],
  item: ["法宝", "丹药", "武器", "法器", "材料", "灵草", "矿石", "宝物", "神兵", "秘宝", "圣物", "符箓", "阵盘", "灵器", "傀儡", "毒药", "药剂", "灵石矿"],
  magic_system: ["灵气", "修为", "境界", "灵力", "真气", "元神", "神识", "渡劫", "法则之力", "道韵", "本源", "灵根", "神魂", "悟道", "修炼体系", "雷劫"],
  technique: ["剑诀", "掌法", "身法", "阵法", "秘术", "武技", "招式", "神通", "禁术", "符术", "炼体", "剑法", "拳法", "步法", "御剑术", "焚天诀"],
  creature: ["妖兽", "神兽", "异族", "灵物", "凶兽", "魔兽", "古族", "蛮族", "精怪", "龙族", "凤族", "麒麟", "鬼修", "尸傀", "海族"],
  culture: ["节日", "习俗", "礼仪", "传统", "婚俗", "祭祀", "图腾", "风土", "民情", "节庆", "婚嫁", "丧葬", "成年礼", "拜师礼"],
  history: ["纪元", "上古", "古代", "往事", "传说", "史诗", "战役", "王朝更迭", "古迹", "遗迹", "先皇", "古史", "灭世之战", "上古纪元"],
  law: ["天道", "天规", "戒律", "铁律", "规矩", "律令", "天道规则", "世界法则", "不可违背", "禁忌法则"],
  currency: ["灵石", "金币", "银两", "玉简", "晶石", "兑换", "物价", "货币", "财富", "宝币", "下品灵石", "上品灵石"],
  character_relationship: ["师徒", "宿敌", "暗恋", "盟友", "血亲", "仇人", "恋人", "知己", "恩怨", "情敌", "上下级", "结拜", "婚约", "敌对", "守护", "青梅竹马"],
  custom: ["系统", "金手指", "血脉", "天赋", "漏洞", "奇遇", "外挂", "面板", "属性", "觉醒", "绑定", "宿主"],
  fate_system: ["天命", "命格", "预言", "因果", "命运", "劫数", "气运", "宿命", "红线", "命数", "天意", "命劫", "因果线", "命运闭环"],
  physics: ["时空", "重力", "光速", "引力", "能量守恒", "维度", "坍缩", "奇点", "熵", "时空法则", "物理规则", "量子", "相对"],
  public_system: ["阶级", "律法", "税制", "官府", "制度", "公共资源", "等级社会", "爵位", "科举", "户籍", "律政", "城邦制", "奴隶制"],
};

// 角色互动强信号词（无世界关键词时降级到 character 元桶）
const CHARACTER_SIGNALS = ["说道", "道：", "说：", "问道", "答道", "笑道", "怒道", "心想", "看向", "握住", "叹道", "低声", "喊道", "冷笑", "沉默"];

// L1-011：模块级预计算小写关键词（KEYWORDS 为静态串），避免热循环内重复 toLowerCase()
// 产生不必要的字符串分配。内层循环只读预计算值。
const LOWER_KEYWORDS: Record<WorldCategory, string[]> = Object.fromEntries(
  (Object.keys(KEYWORDS) as WorldCategory[]).map((cat) => [
    cat,
    KEYWORDS[cat].map((kw) => kw.toLowerCase()),
  ]),
) as Record<WorldCategory, string[]>;

export function classifyWorldCategory(text: string): ClassifyResult {
  const t = (text || "").toLowerCase();
  if (!t.trim()) {
    return { bucket: "unknown", category: null, score: 0, matched: [], scores: {} };
  }

  const scores: Partial<Record<WorldCategory, number>> = {};
  const matched: string[] = [];

  for (const cat of ALL_WORLD_CATEGORIES) {
    let catScore = 0;
    const lowerKws = LOWER_KEYWORDS[cat];
    const kws = KEYWORDS[cat];
    for (let i = 0; i < lowerKws.length; i++) {
      const lowerKw = lowerKws[i];
      if (t.includes(lowerKw)) {
        const kw = kws[i];
        catScore += kw.length; // 权重 = 字符长度
        if (!matched.includes(kw)) matched.push(kw);
      }
    }
    if (catScore > 0) scores[cat] = catScore;
  }

  // 选总分最高；并列取命中最长词更大者；再并列取 ALL_WORLD_CATEGORIES 靠前
  let bestCat: WorldCategory | null = null;
  let bestScore = 0;
  let bestLong = 0;
  for (const cat of ALL_WORLD_CATEGORIES) {
    const s = scores[cat] ?? 0;
    if (s === 0) continue;
    const longest = Math.max(
      ...LOWER_KEYWORDS[cat].filter((lk) => t.includes(lk)).map((lk) => lk.length),
      0,
    );
    if (s > bestScore || (s === bestScore && longest > bestLong)) {
      bestCat = cat;
      bestScore = s;
      bestLong = longest;
    }
  }

  if (bestCat) {
    return { bucket: bestCat, category: bestCat, score: bestScore, matched, scores };
  }

  // 无世界卡命中：降级判定角色互动 / 未知
  const hasCharSignal = CHARACTER_SIGNALS.some((s) => t.includes(s.toLowerCase()));
  if (hasCharSignal) {
    return { bucket: "character", category: null, score: 0, matched: [], scores };
  }
  return { bucket: "unknown", category: null, score: 0, matched: [], scores };
}
