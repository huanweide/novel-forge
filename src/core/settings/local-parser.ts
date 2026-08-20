/**
 * 纯规则版设定解析器 —— 不依赖任何大模型，确定性、毫秒级、可离线运行。
 *
 * 设计目标（对应"整理后再搞"、快且准、不乱串卡）：
 *  - 零外部依赖、零网络、零 API：粘贴即解析，不会有超时/断连/乱码。
 *  - 名字归组严格：每个角色的属性只挂在正确名字下，绝不把 A 的设定塞到 B 身上。
 *  - 碎片化鲁棒：混合「结构化字段 / 散文内联 / 方括号块 / 关系句」都能识别。
 *  - 输出形状与 ParsedSettings 完全兼容，可被 upsertParsedSettingsToProject 直接落库。
 *
 * 这是「模型无关」的成品方案：当没有配置 LLM API Key 时，提取链路自动走这里；
 * 配置了 Key 时，LLM 作为「增强」仍可叠加。两者共用同一套落库与三卡分界。
 */

// ─── 输出类型（与 parser.ts 的 ParsedSettings 完全一致，保证可直落库）───

export interface LocalAppearance {
  hair: string;
  eyes: string;
  height: string;
  build: string;
  features: string;
  attire: string;
}

export interface LocalParsedCharacter {
  name: string;
  aliases: string[];
  age: string;
  gender: string;
  role: "protagonist" | "antagonist" | "supporting" | "mentor" | "love_interest" | "comic_relief" | "background";
  appearance: LocalAppearance;
  personality: string[];
  dialogueDescription: string;
  dialogueExamples: string[];
  background: string;
  hiddenMotives: string[];
  relations: { target: string; relation: string }[];
}

export interface LocalParsedLoreEntry {
  title: string;
  category: "geography" | "faction" | "magic_system" | "technique" | "history" | "culture" | "creature" | "item" | "law" | "currency" | "character_relationship" | "fate_system" | "physics" | "public_system" | "custom";
  keys: string[];
  content: string;
  insertionOrder: number;
}

export interface LocalStyleProfile {
  povType: string;
  narrativeDistance: string;
  avgSentenceLength: number;
  shortSentenceRatio: number;
  longSentenceRatio: number;
  dialogueRatio: number;
  descriptionRatio: number;
  actionRatio: number;
  innerThoughtRatio: number;
  tonalMarkers: Record<string, number>;
  lexicalFeatures: Record<string, number>;
  styleDescription: string;
  sampleText: string;
}

export interface LocalParsedSettings {
  characters: LocalParsedCharacter[];
  loreEntries: LocalParsedLoreEntry[];
  synopsis: string;
  toneKeywords: string[];
  styleProfile: LocalStyleProfile | null;
}

export interface LocalExtractProgress {
  phase: "extracting" | "done" | "error";
  characters?: number;
  loreEntries?: number;
  styleCard?: boolean;
  error?: string;
}

// ─── 启发式词典 ─────────────────────────────────────────────

/** 角色定位关键词（命中即判定角色卡 role） */
const ROLE_HINTS: Array<[RegExp, LocalParsedCharacter["role"]]> = [
  [/(主角|男主|女主|主人公|第一视角|核心人物)/, "protagonist"],
  [/(反派|反角|大反派|最终敌人|魔头|boss|BOSS|终极反派)/, "antagonist"],
  [/(导师|师父|师傅|恩师|长老|前辈|引路人)/, "mentor"],
  [/(恋人|爱人|男朋友|女朋友|妻子|丈夫|CP|官配|白月光)/, "love_interest"],
  [/(丑角|搞笑|喜剧担当|活宝|谐星)/, "comic_relief"],
];

/** 世界卡分类关键词（命中标题/正文即判定 category） */
const CATEGORY_HINTS: Array<[RegExp, LocalParsedLoreEntry["category"]]> = [
  [/(势力|宗门|门派|家族|国家|组织|帮派|阵营|宗|派|盟|阁|殿|宫|教|商会|佣兵团)/, "faction"],
  [/(地理|地点|地域|秘境|城市|山脉|洞天|海岛|大陆|地图|疆域|地域)/, "geography"],
  [/(功法|修炼|体系|境界|灵力|灵气|真气|魔力|修为|等级|阶|能量|源力|法则之力)/, "magic_system"],
  [/(历史|事件|年代|战争|变革|纪元|朝代|霍乱|灾变|纪)/, "history"],
  [/(文化|风俗|节日|礼仪|禁忌|社会|阶级|制度|规矩|礼法)/, "culture"],
  [/(种族|妖兽|异族|神兽|魔兽|灵兽|怪物|族类|血脉种族)/, "creature"],
  [/(法宝|法器|武器|丹药|卷轴|神器|宝物|器物|灵药|符箓|阵法)/, "item"],
  [/(规则|铁律|律法|天道|铁则|戒律|契约|公约)/, "law"],
  [/(货币|金币|灵石|通货|钱财|晶币)/, "currency"],
  [/(命运|命格|因果|气运|宿命|星盘)/, "fate_system"],
  [/(物理|科学|原理|定理|规律)/, "physics"],
  [/(朝廷|官府|城邦|公会|机构|行政)/, "public_system"],
];

/** 基调词典（全文扫描命中即作为基调候选） */
const TONE_DICT = [
  "热血", "甜宠", "虐恋", "虐", "悬疑", "治愈", "轻松", "搞笑", "暗黑", "黑暗",
  "赛博朋克", "蒸汽朋克", "国风", "古风", "仙侠", "玄幻", "末日", "废土", "校园",
  "职场", "权谋", "武侠", "科幻", "恐怖", "惊悚", "温馨", "沙雕", "群像", "慢热",
  "快节奏", "爽文", "逆袭", "复仇", "种田", "无限流", "克苏鲁", "燃", "致郁", "治愈系",
];

// 常见称呼/头衔前缀，识别名字时剥离
const TITLE_PREFIX = /^(剑仙|剑圣|剑魔|宗主|阁主|宫主|教主|门主|族长|城主|国主|帝王|陛下|皇帝|王|女王|公主|王子|公子|小姐|少主|少爷|长老|护法|使者|使者|尊者|圣人|圣女|仙尊|魔尊|妖王|鬼王|殿下|大人|前辈|师尊|师祖|老祖|盟主|帮主|首领|队长|团长|将军|元帅|丞相|宰相|尚书|大人|神医|毒医|影卫|暗卫|死士|侍卫|侍女|丫鬟|书童|学徒|弟子|传人|继承者|继承人|宿主|穿越者|重生者|系统|观察员)/;

/** 人物身份词——用于识别「X是/乃...[身份词]」内联散文角色，避免误把势力当角色 */
const PERSON_ROLE_RE = /(长老|少主|少阁主|执事|孤女|神皇|神帝|说书人|弟子|阁主|宗主|圣女|圣子|公子|小姐|少年|少女|老者|族人|少爷|公主|亲王|将军|元帅|丞相|宰相|护卫|侍卫|暗卫|死士|陛下|君王|帝王|魔尊|仙尊|妖王|鬼王|盟主|帮主|首领|队长|团长|学徒|传人|继承者|宿主|穿越者|重生者|剑修|体修|丹师|阵师|符师|医师|毒师|族长|门主|宫主|教主)/;

// ─── 主入口 ───────────────────────────────────────────────

export function parseSettingsLocal(
  rawText: string,
  opts?: { onProgress?: (p: LocalExtractProgress) => void },
): LocalParsedSettings {
  const onProgress = opts?.onProgress;
  onProgress?.({ phase: "extracting" });

  const text = (rawText || "").replace(/\r\n/g, "\n").trim();
  if (!text) {
    onProgress?.({ phase: "done", characters: 0, loreEntries: 0, styleCard: false });
    return { characters: [], loreEntries: [], synopsis: "", toneKeywords: [], styleProfile: null };
  }

  const lines = text.split("\n");

  // 实体收集
  type Entity = {
    kind: "char" | "lore";
    name: string;
    raw: string[];
    category?: LocalParsedLoreEntry["category"];
  };
  const entities: Entity[] = [];
  const pendingRelations: Array<{ a: string; b: string; type: string }> = [];

  // 元数据段落
  let metaMode: "synopsis" | "tone" | null = null;
  const synopsisLines: string[] = [];
  const toneLines: string[] = [];
  // 游离散文（无明确归属的正文，用于兜底 synopsis 与内联名字扫描）
  const floatingProse: string[] = [];

  const ATTRIBUTE_KW =
    /(年龄|岁|性别|男|女|身份|定位|外貌|性格|简介|背景|经历|设定|故事|出身|爱好|口头禅|技能|能力|武器|关系|师|弟|妻|夫|父|母|兄|弟|姐|妹|恋|仇|友|称号|别名|特征|衣着|神态|口头)/;

  let current: Entity | null = null;
  let lastSubject: string | undefined; // 最近一次出现的角色主语，用于消解「他是…的师父」里的代词

  const flushCurrent = () => {
    if (current && (current.raw.length > 0 || current.kind === "char")) {
      entities.push(current);
    }
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      // 空行：结束当前实体/元数据
      flushCurrent();
      metaMode = null;
      continue;
    }

    // —— 元数据段标记 ——
    const metaMatch = line.match(/^(大纲|剧情|主线|故事梗概|故事简介|情节|总纲|故事)\s*[:：]?/);
    if (metaMatch) {
      flushCurrent();
      metaMode = "synopsis";
      // 同行可能直接带正文
      const rest = line.slice(metaMatch[0].length).trim();
      if (rest) synopsisLines.push(rest);
      continue;
    }
    const toneMatch = line.match(/^(基调|风格标签|氛围|关键词|标签|主题|风格)\s*[:：]?/);
    if (toneMatch) {
      flushCurrent();
      metaMode = "tone";
      const rest = line.slice(toneMatch[0].length).trim();
      if (rest) toneLines.push(rest);
      continue;
    }

    // —— 关系句（先抓，因为关系句里含名字）——
    const rels = detectRelation(line, lastSubject);
    if (rels.length > 0) {
      for (const r of rels) pendingRelations.push(r);
      // 关系句可能也归属当前角色（如「与 X 是师徒」写在某人块里）
      if (current && current.kind === "char") current.raw.push(line);
      else floatingProse.push(line);
      continue;
    }

    // —— 角色名头（显式标注）——
    const nameLabel = line.match(/^(姓名|名字|名|角色名|人物名|本名|全名|真名|角色)\s*[:：]\s*(.+)$/);
    if (nameLabel) {
      const names = splitNames(nameLabel[2]);
      if (names.length === 1) {
        flushCurrent();
        current = { kind: "char", name: cleanName(names[0]), raw: [] };
        lastSubject = cleanName(names[0]);
        continue;
      } else {
        // 多个名字：各自成块（轻量）
        flushCurrent();
        for (const n of names) {
          entities.push({ kind: "char", name: cleanName(n), raw: [] });
        }
        continue;
      }
    }

    // —— 方括号块名头：【名字】属性 / 【势力】名字 ——
    const bracket = line.match(/^[（(]?\s*【\s*([^】\s]{1,12})\s*】\s*[:：]?\s*(.*)$/);
    if (bracket) {
      const head = bracket[1];
      const rest = bracket[2];
      const loreCat = matchLoreCategory(head);
      flushCurrent();
      if (loreCat) {
        // 头是分类标签（如【势力】），真正的名字在 rest 里
        const name = firstCjkToken(rest) || cleanName(head);
        current = { kind: "lore", name: cleanLoreName(name), category: loreCat, raw: rest ? [rest] : [] };
      } else {
        const nm = cleanName(head);
        current = { kind: "char", name: nm, raw: rest ? [rest] : [] };
        lastSubject = nm;
      }
      continue;
    }

    // —— 世界卡/概念名头 ——
    const loreHeader = matchLoreHeader(line);
    if (loreHeader) {
      flushCurrent();
      current = { kind: "lore", name: cleanLoreName(loreHeader.name), category: loreHeader.category, raw: loreHeader.rest ? [loreHeader.rest] : [] };
      continue;
    }

    // —— 内联名字+属性：张三（男，23岁，身份：弃徒）——
    const inline = line.match(/^([一-龥A-Za-z·•]{2,6})\s*[（(]([^)）]{0,40}?)[)）]/);
    if (inline && /(岁|男|女|身份|性格|外貌|简介|背景|特征|称号|修为|职业|是|乃)/.test(inline[2])) {
      flushCurrent();
      const nm = cleanName(inline[1]);
      current = { kind: "char", name: nm, raw: [inline[2]] };
      lastSubject = nm;
      continue;
    }

    // —— 内联散文角色：X是/乃/为...[人物身份词] ——
    const proseChar = line.match(/^([一-龥A-Za-z·•]{2,6})\s*(?:是|乃|为|作为)\s*(.+)$/);
    if (proseChar && PERSON_ROLE_RE.test(proseChar[2])) {
      flushCurrent();
      const nm = cleanName(proseChar[1]);
      current = { kind: "char", name: nm, raw: [proseChar[2]] };
      lastSubject = nm;
      continue;
    }

    // —— 孤立短名字行：下一行含属性关键词才认定为角色 ——
    const pureName = line.match(/^[一-龥A-Za-z·•]{2,8}$/);
    if (pureName) {
      const next = lines[i + 1] ? lines[i + 1].trim() : "";
      if (ATTRIBUTE_KW.test(next) || /^(性别|年龄|外貌|性格|背景|简介|身份|定位|称号|别名)\s*[:：]/.test(next)) {
        flushCurrent();
        const nm = cleanName(pureName[0]);
        current = { kind: "char", name: nm, raw: [] };
        lastSubject = nm;
        continue;
      }
      // 否则视为普通标题/小节，归入游离散文
      floatingProse.push(line);
      flushCurrent();
      metaMode = null;
      continue;
    }

    // —— 普通属性/描述行：归属当前实体或元数据 ——
    if (metaMode === "synopsis") {
      synopsisLines.push(line);
      continue;
    }
    if (metaMode === "tone") {
      toneLines.push(line);
      continue;
    }
    if (current) {
      current.raw.push(line);
      continue;
    }
    // 既无实体也无元数据：游离散文（可能内联提及角色）
    floatingProse.push(line);
  }
  flushCurrent();

  // —— 第二遍：扫描游离散文，捕捉「只在内文出现」的角色与关系 ——
  for (const para of floatingProse) {
    // 关系句复查
    const rs = detectRelation(para, lastSubject);
    for (const r of rs) pendingRelations.push(r);
    // 【名字】内联
    const bracketNames = para.matchAll(/【\s*([一-龥A-Za-z·•]{2,8})\s*】/g);
    for (const m of bracketNames) {
      const nm = cleanName(m[1]);
      if (nm && !entities.some((e) => e.kind === "char" && e.name === nm)) {
        entities.push({ kind: "char", name: nm, raw: [] });
      }
    }
    // 张三（男，…）内联
    const inlineNames = para.matchAll(/([一-龥A-Za-z·•]{2,6})\s*[（(][^)）]{0,30}?[岁男女身份]/g);
    for (const m of inlineNames) {
      const nm = cleanName(m[1]);
      if (nm && !entities.some((e) => e.kind === "char" && e.name === nm)) {
        entities.push({ kind: "char", name: nm, raw: [m[0].slice(m[1].length)] });
      }
    }
  }

  // —— 关系名确保建模为角色（避免关系孤儿）——
  const ensureChar = (nm: string) => {
    const clean = cleanName(nm);
    if (!clean) return;
    if (!entities.some((e) => e.kind === "char" && e.name === clean)) {
      entities.push({ kind: "char", name: clean, raw: [] });
    }
  };
  for (const r of pendingRelations) {
    ensureChar(r.a);
    ensureChar(r.b);
  }

  // —— 构建角色卡 ——
  const charMap = new Map<string, LocalParsedCharacter>();
  for (const e of entities.filter((x) => x.kind === "char")) {
    const c = buildCharacter(e, pendingRelations);
    const key = c.name.toLowerCase();
    const existing = charMap.get(key);
    if (!existing) charMap.set(key, c);
    else {
      // 同名合并：取更完整者，关系取并集
      if (c.background.length > existing.background.length) existing.background = c.background;
      if (!existing.age || existing.age === "未知") existing.age = c.age;
      if (!existing.gender || existing.gender === "未知") existing.gender = c.gender;
      existing.relations = mergeRelations(existing.relations, c.relations);
      if (c.appearance.hair && !existing.appearance.hair) existing.appearance.hair = c.appearance.hair;
      if (c.appearance.eyes && !existing.appearance.eyes) existing.appearance.eyes = c.appearance.eyes;
      if (c.personality.length && !existing.personality.length) existing.personality = c.personality;
    }
  }

  // —— 构建世界卡 ——
  const loreMap = new Map<string, LocalParsedLoreEntry>();
  for (const e of entities.filter((x): x is Extract<Entity, { kind: "lore" }> => x.kind === "lore")) {
    const entry = buildLore(e);
    const key = entry.title.toLowerCase();
    const existing = loreMap.get(key);
    if (!existing) loreMap.set(key, entry);
    else {
      if (entry.content.length > existing.content.length) existing.content = entry.content;
      existing.keys = Array.from(new Set([...existing.keys, ...entry.keys]));
    }
  }

  // —— synopsis / tone / style ——
  const synopsis = synopsisLines.join("\n").trim() ||
    floatingProse.slice(0, 3).join("\n").trim().slice(0, 600);
  const toneKeywords = extractTone(toneLines, text);
  const styleProfile = buildStyleProfile(text);

  const result: LocalParsedSettings = {
    characters: Array.from(charMap.values()),
    loreEntries: Array.from(loreMap.values()),
    synopsis,
    toneKeywords,
    styleProfile,
  };

  onProgress?.({
    phase: "done",
    characters: result.characters.length,
    loreEntries: result.loreEntries.length,
    styleCard: !!result.styleProfile,
  });
  return result;
}

// ─── 子函数 ───────────────────────────────────────────────

function splitNames(s: string): string[] {
  return s
    .split(/[、，,；;]/)
    .map((x) => cleanName(x.trim()))
    .filter(Boolean);
}

/** 清洗名字：去头衔前缀、去标点、截断过长 */
function cleanName(raw: string): string {
  if (!raw) return "";
  let n = raw.replace(/[【】()（）\[\]《》""''：:，,。、\s]/g, "").trim();
  // 去常见头衔前缀
  const m = n.match(TITLE_PREFIX);
  if (m && n.length > m[0].length) n = n.slice(m[0].length);
  // 若仍含分隔，取第一段
  n = n.split(/[，,。、：:的之]/)[0].trim();
  if (n.length > 12) n = n.slice(0, 12);
  return n;
}

/** 从一段文本里取第一个中文词元（去掉前导标点/·），用于世界卡命名 */
function firstCjkToken(s: string): string {
  const m = s
    .replace(/^[\s·•·：:，,、（）()【】]+/, "")
    .match(/^[一-龥A-Za-z·•]{1,16}/);
  return m ? m[0] : "";
}

/** 世界卡名清理：只按标点截断，保留「的/之」（如「龙陨之地」「三百年前的内乱」是完整地名/事件名） */
function cleanLoreName(raw: string): string {
  if (!raw) return "";
  let n = raw.replace(/[【】()（）\[\]《》""''：:，,。、\s]/g, "").trim();
  const m = n.match(TITLE_PREFIX);
  if (m && n.length > m[0].length) n = n.slice(m[0].length);
  n = n.split(/[，,。、：:]/)[0].trim();
  if (n.length > 12) n = n.slice(0, 12);
  return n;
}

/** 关系类型词典（用于一行多关系扫描） */
const RELATION_TYPES = [
  "师徒", "宿敌", "仇人", "仇敌", "恋人", "夫妻", "兄弟", "姐妹",
  "青梅竹马", "朋友", "盟友", "死敌", "对头", "同门", "知己", "冤家", "挚友", "宿命之敌",
];
const RELATION_TYPE_RE = new RegExp(`(${RELATION_TYPES.join("|")}|友)`, "g");

// 看起来像「人名」的启发式（配对端点校验，过滤「曾以一剑划开幽都」「人间」「人族」等假名）
const NAME_NONSTART = /^(曾|以|将|乃|即|亦|同|而|却|其|之|他|她|这|那|此|我|你|它|若|虽|因|故|由|被|把|给|让|使|令|对|并|但|然|且|于|为|在|从|向|往|至|该|某|诸|众|各)/;
const NAME_BLACKLIST = [
  "人间", "人族", "妖族", "幽都", "天地", "世界", "世间", "苍生", "众生", "万物", "六界",
  "九霄", "十方", "三界", "四方", "天下", "四海", "八荒", "凡间", "九天", "黄泉", "轮回",
  "因果", "宿命", "命运", "天道", "本源", "法则", "秩序", "混沌", "洪荒", "太古", "远古",
  "上古", "末世", "末法", "诸天", "万界", "乾坤", "阴阳", "生死", "黑白", "正反", "自己",
  "彼此", "众人", "世人", "别人", "他人", "一切", "所有", "全部", "整个", "如此", "这样",
  "那样", "我们", "你们", "他们",
];
const NAME_VERB = /[划开破灭创建立统率拥有斩杀吞噬覆倾镇守掌管控辖征伐战斗害救护养生死来去除出进入上下中内外前后左右间界世年代月日时分天地海山河江湖云风雨雷火水土木金石]/;
function looksLikeName(raw: string): boolean {
  const s = cleanName(raw);
  if (s.length < 2 || s.length > 6) return false;
  if (NAME_NONSTART.test(s)) return false;
  if (NAME_BLACKLIST.includes(s)) return false;
  if (NAME_VERB.test(s)) return false;
  return true;
}

/** 检测关系句，可返回多个关系（一行可能含「是师徒，亦是宿敌」）。先按句分句再判定，避免长句误配对。 */
function detectRelation(line: string, lastSubject?: string): Array<{ a: string; b: string; type: string }> {
  const clauses = line.split(/[。；;！？!?]/).map((s) => s.trim()).filter((s) => s.length > 0);
  if (clauses.length === 0) return [];
  const all: Array<{ a: string; b: string; type: string }> = [];
  // 分句间传递主语：「苏砚是…执事长老。他…是林惊蛰与沈厌离的师父」→ 第二句的「他」= 苏砚
  let localSubject = lastSubject;
  for (const cl of clauses) {
    const r = detectRelationClause(cl, localSubject);
    for (const x of r) {
      if (!all.some((o) => o.a === x.a && o.b === x.b && o.type === x.type)) all.push(x);
    }
    // 若本句以「X是/乃/为/与/和/…」或「X，」开头且 X 像人名，则后续分句的主语就是 X
    const subM = cl.match(/^([一-龥A-Za-z·•]{2,8}?)\s*(?:是|乃|为|与|和|跟|、|，|,)\s*[一-龥A-Za-z·•]/);
    if (subM) {
      const cand = cleanName(subM[1]);
      if (looksLikeName(cand) && !/^(他|她|它|这|那|其|之)/.test(cand)) localSubject = cand;
    }
  }
  return all;
}

function detectRelationClause(cl: string, lastSubject?: string): Array<{ a: string; b: string; type: string }> {
  const out: Array<{ a: string; b: string; type: string }> = [];

  // 代词主语（允许中间插入语）：他[，性情温润，]是A与B的师父 / 他性情温润，是A与B的师父 → 主语消解成 lastSubject
  // 插入语不要求以标点开头（「他性情温润，是…」代词后直接接形容词短语）
  const pronFlex = cl.match(
    /^(他|她)(?:[^。；]{0,12})?\s*(?:是|乃|为)\s*([一-龥A-Za-z·•]{2,8}?)\s*(?:与|和|跟|、)\s*([一-龥A-Za-z·•]{2,8}?)\s*的\s*[一-龥]{0,4}?\s*(师父|师傅|徒儿|徒弟|弟子|学生|妻子|丈夫|老公|老婆|夫人|妾|父亲|母亲|儿子|女儿|哥哥|弟弟|姐姐|妹妹|恋人|爱人|男友|女友|仇人|宿敌|盟友|挚友|上司|下属|师兄|师弟|师姐|师妹|养父|养母|义父|义母|搭档|伙伴)/,
  );
  if (pronFlex && lastSubject) {
    return [
      { a: lastSubject, b: cleanName(pronFlex[2]), type: pronFlex[4] },
      { a: lastSubject, b: cleanName(pronFlex[3]), type: pronFlex[4] },
    ];
  }

  // 配对 + 全句关系词扫描（关系词不必紧邻，如「亦主亦友」）。端点必须像人名，过滤假配对。
  const pairM = cl.match(
    /([一-龥A-Za-z·•]{2,8}?)\s*(?:与|和|跟|、)\s*([一-龥A-Za-z·•]{2,8}?)(?=[\s，,。；;、：:】）)]|(?:\s*(?:是|乃|为|作为|同|的|亦|即))|$)/,
  );
  if (pairM) {
    const a = cleanName(pairM[1]);
    const b = cleanName(pairM[2]);
    if (looksLikeName(a) && looksLikeName(b)) {
      const types = cl.match(RELATION_TYPE_RE);
      const seen = new Set<string>();
      for (const t of types || []) {
        const type = t === "友" ? "挚友" : t;
        const key = `${a}|${b}|${type}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ a, b, type });
        }
      }
      if (out.length) return out;
    }
  }

  // 单向：A是B的[修饰]XX（如「隔代弟子」）
  const m2 = cl.match(
    /([一-龥A-Za-z·•]{2,8}?)\s*(?:是|乃|为|作为)\s*([一-龥A-Za-z·•]{2,8}?)\s*的\s*[一-龥]{0,4}?\s*(师父|师傅|徒儿|徒弟|弟子|学生|妻子|丈夫|老公|老婆|夫人|妾|父亲|母亲|儿子|女儿|哥哥|弟弟|姐姐|妹妹|恋人|爱人|男友|女友|仇人|宿敌|盟友|挚友|上司|下属|师兄|师弟|师姐|师妹|养父|养母|义父|义母|搭档|伙伴)/,
  );
  if (m2 && looksLikeName(m2[1]) && looksLikeName(m2[2])) {
    return [{ a: cleanName(m2[1]), b: cleanName(m2[2]), type: m2[3] }];
  }

  // 拜师：A拜B为师 → A是B的徒弟
  const m3 = cl.match(/([一-龥A-Za-z·•]{2,8}?)\s*拜\s*([一-龥A-Za-z·•]{2,8}?)\s*为师/);
  if (m3 && looksLikeName(m3[1]) && looksLikeName(m3[2])) {
    return [{ a: cleanName(m3[1]), b: cleanName(m3[2]), type: "徒弟" }];
  }

  return out;
}

/** 匹配世界卡标题行，返回 {name, category, rest} */
function matchLoreHeader(
  line: string,
): { name: string; category: LocalParsedLoreEntry["category"]; rest: string } | null {
  const m = line.match(
    /^(势力|宗门|门派|家族|国家|组织|帮派|阵营|宗|派|盟|阁|殿|宫|教|地理|地点|地域|秘境|城市|山脉|洞天|功法|修炼|体系|境界|灵力|灵气|真气|魔力|修为|历史|事件|年代|战争|文化|风俗|节日|礼仪|禁忌|社会|阶级|种族|妖族|异族|血脉|妖兽|神兽|魔兽|法宝|法器|武器|丹药|卷轴|神器|器物|秘宝|至宝|圣物|遗迹|传说|神话|信仰|神灵|图腾|灵植|灵草|草药|矿产|资源|规则|铁律|法则|律法|天道|货币|命运|命格|因果|气运|物理|科学|朝廷|官府|城邦|公会|机构)\s*[:：]?\s*(.+)$/,
  );
  if (!m) return null;
  const keyword = m[1];
  const restAll = m[2].trim();
  const name = firstCjkToken(restAll) || restAll.slice(0, 12);
  const category = matchLoreCategory(keyword) || matchLoreCategory(restAll) || "custom";
  return { name: cleanLoreName(name), category, rest: restAll };
}

/** 根据关键词判断世界卡分类 */
function matchLoreCategory(s: string): LocalParsedLoreEntry["category"] | null {
  for (const [re, cat] of CATEGORY_HINTS) {
    if (re.test(s)) return cat;
  }
  return null;
}

/** 从角色实体块提取字段，装配成 ParsedCharacter */
function buildCharacter(
  e: { name: string; raw: string[] },
  allRelations: Array<{ a: string; b: string; type: string }>,
): LocalParsedCharacter {
  const raw = e.raw.join("\n");
  const name = e.name;

  // 性别/年龄：可能在名头括号里，也可能在属性行
  let gender = "未知";
  let age = "未知";
  const genderM = raw.match(/(?:性别|性別)\s*[:：]?\s*(男|女|未知|其他)/) ||
    raw.match(/(男|女)\s*[,，]/) || raw.match(/[（(]([^)）]*?)(男|女)/);
  if (genderM) gender = genderM[genderM.length - 1] === "男" || genderM[genderM.length - 1] === "女" ? genderM[genderM.length - 1] : gender;
  const ageM = raw.match(/(?:年龄|年纪|岁数)\s*[:：]?\s*([\d]+|[一二三四五六七八九十百千]+)\s*岁?/) ||
    raw.match(/(\d+)\s*岁/) || raw.match(/[（(]([^)）]*?)(\d+)\s*岁/);
  if (ageM) {
    const v = ageM[ageM.length - 1];
    age = /\d/.test(v) ? `${v}岁` : `${v}岁`;
  }

  // 别名/称号
  const aliases: string[] = [];
  const aliasM = raw.match(/(?:别名|称号|绰号|诨名|外号|道号)\s*[:：]?\s*([^\n]+)/);
  if (aliasM) {
    aliasM[1].split(/[、，,；;]/).map((x) => x.trim()).filter(Boolean).forEach((a) => aliases.push(a));
  }

  // 角色定位
  let role: LocalParsedCharacter["role"] = "supporting";
  const roleText = name + raw;
  for (const [re, r] of ROLE_HINTS) {
    if (!re.test(roleText)) continue;
    // 「师父/恩师」若紧跟另一个人名（如「X的师父Y」「恩师苏砚」），描述的是别人，不是当前角色的 role
    if (r === "mentor" && /(的师父|的恩师|恩师[一-龥]{1,6}|师父[一-龥]{1,6}|师傅[一-龥]{1,6})/.test(roleText)) {
      continue;
    }
    role = r;
    break;
  }

  // 外貌
  const appearance: LocalAppearance = { hair: "", eyes: "", height: "", build: "", features: "", attire: "" };
  appearance.hair = pickField(raw, /(发型|发色|头发|长发|短发|鬓)\s*[:：]?\s*([^\n，,。；;]+)/);
  appearance.eyes = pickField(raw, /(瞳|眼|眸)\s*[:：]?\s*([^\n，,。；;]+)/);
  appearance.height = pickField(raw, /(身高|个子|个头)\s*[:：]?\s*([^\n，,。；;]+)/);
  appearance.build = pickField(raw, /(体型|身材|体格|身形)\s*[:：]?\s*([^\n，,。；;]+)/);
  appearance.features = pickField(raw, /(特征|标记|印记|疤痕|胎记|特殊)\s*[:：]?\s*([^\n，,。；;]+)/);
  appearance.attire = pickField(raw, /(衣着|穿着|服饰|装束|常服|战袍)\s*[:：]?\s*([^\n，,。；;]+)/);

  // 性格
  const personality: string[] = [];
  const persM = raw.match(/(?:性格|个性|特质|特点|性情|秉性)\s*[:：]?\s*([^\n]+)/);
  if (persM) {
    persM[1]
      .split(/[、，,；;。\n]/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 2 && x.length <= 30)
      .forEach((p) => personality.push(p));
  }

  // 背景
  const bgM = raw.match(/(?:背景|经历|简介|设定|故事|出身|过往|身世)\s*[:：]?\s*([\s\S]*?)(?:\n(?:性格|外貌|能力|技能|关系|武器|别名|称号|定位|年龄|性别|身份)\s*[:：]|$)/);
  let background = bgM ? bgM[1].trim() : "";
  if (!background) {
    // 取块里不属于上述字段的「散文」作为背景
    const prose = e.raw
      .filter((l) => !/^(?:性别|年龄|外貌|性格|背景|简介|身份|定位|称号|别名|特征|衣着|能力|技能|武器|关系|师徒|师|弟|妻|夫|父|母|兄|弟|姐|妹|恋|仇|友)\s*[:：]/.test(l))
      .join("\n")
      .trim();
    background = prose.slice(0, 2000);
  }

  // 关系（本角色参与的所有关系，按 目标+关系 去重，避免碎片重复导致的噪声）
  const relations: LocalParsedCharacter["relations"] = [];
  const relSeen = new Set<string>();
  for (const r of allRelations) {
    if (r.a === name) {
      const k = `${r.b}|${r.type}`;
      if (!relSeen.has(k)) { relSeen.add(k); relations.push({ target: r.b, relation: r.type }); }
    } else if (r.b === name) {
      const rev = reverseRelation(r.type);
      const k = `${r.a}|${rev}`;
      if (!relSeen.has(k)) { relSeen.add(k); relations.push({ target: r.a, relation: rev }); }
    }
  }

  return {
    name,
    aliases,
    age,
    gender,
    role,
    appearance,
    personality,
    dialogueDescription: "",
    dialogueExamples: [],
    background,
    hiddenMotives: [],
    relations,
  };
}

function pickField(raw: string, re: RegExp): string {
  const m = raw.match(re);
  return m ? m[m.length - 1].trim() : "";
}

function reverseRelation(type: string): string {
  const map: Record<string, string> = {
    师父: "徒弟", 师傅: "徒弟", 徒儿: "师父", 徒弟: "师父", 弟子: "师父", 学生: "老师",
    妻子: "丈夫", 丈夫: "妻子", 老公: "老婆", 老婆: "老公", 夫人: "丈夫", 妾: "丈夫",
    父亲: "子女", 母亲: "子女", 儿子: "父亲", 女儿: "母亲",
    哥哥: "弟弟", 弟弟: "哥哥", 姐姐: "妹妹", 妹妹: "姐姐",
    师兄: "师弟", 师弟: "师兄", 师姐: "师妹", 师妹: "师姐",
    恋人: "恋人", 爱人: "爱人", 男友: "女友", 女友: "男友",
    仇人: "仇人", 宿敌: "宿敌", 盟友: "盟友", 挚友: "挚友", 上司: "下属", 下属: "上司",
    养父: "养子", 养母: "养女", 义父: "义子", 义母: "义女", 搭档: "搭档", 伙伴: "伙伴",
  };
  return map[type] || type;
}

function mergeRelations(
  a: LocalParsedCharacter["relations"],
  b: LocalParsedCharacter["relations"],
): LocalParsedCharacter["relations"] {
  const out = [...a];
  for (const r of b) {
    if (!out.some((x) => x.target === r.target && x.relation === r.relation)) out.push(r);
  }
  return out;
}

function buildLore(e: { name: string; raw: string[]; category: LocalParsedLoreEntry["category"] }): LocalParsedLoreEntry {
  const content = e.raw.join("\n").trim() || e.name;
  const keys = [e.name];
  // 从正文抽别名/简称作为触发词
  const aliasM = content.match(/(?:别名|又称|简称|别称|雅号)\s*[:：]?\s*([^\n，,。；;]+)/);
  if (aliasM) aliasM[1].split(/[、，,；;]/).map((x) => x.trim()).filter(Boolean).forEach((k) => keys.push(k));
  return {
    title: e.name,
    category: e.category,
    keys: Array.from(new Set(keys)),
    content,
    insertionOrder: e.category === "faction" || e.category === "magic_system" ? 85 : 60,
  };
}

/** 提取基调：优先元数据段，否则全文扫词典 */
function extractTone(toneLines: string[], fullText: string): string[] {
  if (toneLines.length > 0) {
    const fromMeta = toneLines
      .join("，")
      .split(/[、，,；;。\n]/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 2 && x.length <= 8);
    if (fromMeta.length > 0) return Array.from(new Set(fromMeta)).slice(0, 12);
  }
  const found = new Set<string>();
  for (const t of TONE_DICT) {
    if (fullText.includes(t)) found.add(t);
  }
  return Array.from(found).slice(0, 12);
}

/** 启发式风格画像（不依赖模型，给默认值 + 简单统计） */
function buildStyleProfile(text: string): LocalStyleProfile | null {
  const sentences = text.split(/[。！？!?；;\n]/).filter((s) => s.trim().length > 0);
  const total = sentences.length || 1;
  let totalLen = 0;
  let shortCount = 0;
  let longCount = 0;
  for (const s of sentences) {
    const len = s.trim().length;
    totalLen += len;
    if (len < 15) shortCount++;
    if (len > 40) longCount++;
  }
  const avg = Math.round(totalLen / total);
  const shortRatio = +(shortCount / total).toFixed(2);
  const longRatio = +(longCount / total).toFixed(2);

  // 视角：统计第一人称「我」vs 第三人称「他/她」
  const firstPerson = (text.match(/我/g) || []).length;
  const thirdPerson = (text.match(/[他她]/g) || []).length;
  const povType = firstPerson > thirdPerson * 1.5 ? "first_person" : "third_person_limited";
  const narrativeDistance = avg < 20 ? "close" : avg > 35 ? "remote" : "medium";

  // 对话占比：引号句
  const quotes = (text.match(/[“"”'][^"”'']+[”"”']/g) || []).length;
  const dialogueRatio = +Math.min(0.6, (quotes / total) * 1.2).toFixed(2);

  return {
    povType,
    narrativeDistance,
    avgSentenceLength: avg,
    shortSentenceRatio: shortRatio,
    longSentenceRatio: longRatio,
    dialogueRatio,
    descriptionRatio: 0.25,
    actionRatio: 0.25,
    innerThoughtRatio: povType === "first_person" ? 0.2 : 0.1,
    tonalMarkers: {},
    lexicalFeatures: {},
    styleDescription: `系统自动推断：平均句长约${avg}字，叙事视角为${povType === "first_person" ? "第一人称" : "第三人称限制"}，对话占比约${Math.round(dialogueRatio * 100)}%。`,
    sampleText: sentences.slice(0, 2).join("。").slice(0, 200),
  };
}
