/**
 * 实体检测器 —— 命名模式库 + 归属推断
 *
 * 用正则 + 领域词典识别中文仙侠文本中的命名实体，
 * 不调 LLM API。速度 < 0.5 秒 / 万字。
 *
 * 覆盖实体类型：丹药 / 法宝 / 功法 / 地点 / 材料 / 人名（已知词典）
 * 归属推断三层策略：属格匹配 > 动词前置 > 段落主人
 */

// ─── 类型定义 ────────────────────────────────────────────────

export interface DetectedEntity {
  /** 实体名称 */
  name: string;
  /** 实体类型 */
  type: EntityType;
  /** 正文中的起始位置 */
  position: number;
  /** 置信度 0-1 */
  confidence: number;
  /** 推断的归属者（可选） */
  owner?: string;
  /** 归属置信度 */
  ownerConfidence?: number;
  /** 是否匹配已知词典 */
  isKnown: boolean;
  /** 匹配的具体模式描述 */
  matchedBy: string;
  /** 别名列表（可选，用于批内/跨批别名去重防双卡） */
  aliases?: string[];
}

export type EntityType = "pill" | "artifact" | "technique" | "location" | "material" | "character";

export interface KnownEntity {
  name: string;
  type: EntityType;
  aliases?: string[];
}

export interface EntityDetectionResult {
  entities: DetectedEntity[];
  stats: {
    totalDetected: number;
    byType: Record<EntityType, number>;
    knownCount: number;
    newCount: number;
    textLength: number;
    elapsedMs: number;
  };
}

// ─── 命名模式库 ──────────────────────────────────────────────

/** 中文字符范围 */
const CJK = "[一-鿿]";

const PATTERNS: Record<EntityType, { regex: RegExp; description: string }[]> = {
  pill: [
    {
      regex: new RegExp(`[一二三四五六七八九十百千万]{1,2}品${CJK}{2,4}(?:丹|丸|散|液|膏|粉)`, "g"),
      description: "有品级丹药：七品培元丹、三品清心丹",
    },
    {
      regex: new RegExp(`(?:还魂|筑基|凝气|培元|洗髓|辟谷|回春|续命|破境|化神|渡劫|聚灵|清心|固本|养魂|锻骨|通脉)(?:丹|丸|散|液|膏)`, "g"),
      description: "无品级丹药：筑基丹、洗髓丹",
    },
  ],
  artifact: [
    {
      regex: new RegExp(`${CJK}{1,3}(?:剑|刀|镜|鼎|塔|印|旗|幡|珠|环|镯|簪|鞭|戟|枪|棍|斧|锤|扇|琴|箫|铃|炉)`, "g"),
      description: "法宝兵器：青云剑、玄天印、镇魂铃",
    },
    {
      regex: new RegExp(`(?:乾坤|太极|混元|九天|玄黄|万灵|五行|阴阳|八卦|星辰)${CJK}{0,2}(?:图|幡|印|鼎|炉|镜|珠)`, "g"),
      description: "前缀型法宝：乾坤图、混元鼎",
    },
  ],
  technique: [
    {
      regex: new RegExp(`${CJK}{2,6}(?:诀|经|典|功|法|术|引|咒|拳|掌|指|腿|步|遁|变|化)`, "g"),
      description: "功法武技：星辰诀、九天剑法、缩地步",
    },
    {
      regex: new RegExp(`[第初终大圆满]{1,2}[一二三四五六七八九十]{1,2}(?:层|重|式|转|境)`, "g"),
      description: "功法层级：第三层、第九重（不归入功法实体，供排除用）",
    },
  ],
  location: [
    {
      regex: new RegExp(`${CJK}{2,4}(?:山脉|山谷|峡谷|城|镇|村|宗|门|派|殿|阁|洞|府|宫|域|界|海|湖|河|林|原)`, "g"),
      description: "地点：苍云山脉、落霞城、星辰宗",
    },
    {
      regex: new RegExp(`(?:东|南|西|北|中|上|下|天|地|玄|黄)${CJK}{1,2}(?:域|界|海|洲|荒)`, "g"),
      description: "区域：东荒、北冥域",
    },
  ],
  material: [
    {
      regex: new RegExp(`${CJK}{2,4}(?:草|花|果|叶|根|藤|石|木|玉|晶|矿|铁|铜|银|金|骨|皮|血|髓|液|露|芝|参)`, "g"),
      description: "材料：寒冰草、聚灵石、千年灵芝",
    },
    {
      regex: new RegExp(`[一二三四五六七八九十百千万]{1,3}年${CJK}{1,3}(?:草|花|果|参|芝|藤|木|石|玉)`, "g"),
      description: "年份材料：千年灵芝、百年朱果",
    },
  ],
  character: [
    {
      // 人物名由外部已知词典注入，这里只提供一个通用的中文人名匹配作为兜底
      regex: new RegExp(`([A-Z一-鿿]{1,2}(?:[·•]一-鿿{1,4})?)`, "g"),
      description: "中文人名（兜底，由已知词典主导）",
    },
  ],
};

// ─── 排除词库 ────────────────────────────────────────────────

/** 身体部位（防法宝误报：拳头→拳+头被匹配为法宝） */
const BODY_PARTS = new Set([
  "拳头", "手掌", "手臂", "膝盖", "脚掌", "脚踝", "手肘", "肩膀",
  "后背", "胸前", "额头", "下巴", "脖子", "手腕", "指尖",
]);

/** 普通名词（防地点/材料误报） */
const COMMON_NOUNS = new Set([
  "桌子", "椅子", "茶杯", "纸张", "书本", "窗户", "门槛", "灯笼",
  "帘子", "石板", "木架", "铁锅", "铜镜", "银针", "金丝",
]);

/** 抽象名词（防功法误报） */
const ABSTRACT_NOUNS = new Set([
  "办法", "想法", "手法", "看法", "做法", "用法", "活法", "打法",
  "剑法", // 剑法是通用词，不做具体功法名
]);

/** 合并排除集合 */
const EXCLUDE_SET = new Set([...BODY_PARTS, ...COMMON_NOUNS, ...ABSTRACT_NOUNS]);

// ─── 归属推断 ────────────────────────────────────────────────

interface OwnershipCandidate {
  entityName: string;
  ownerName: string;
  confidence: number;
  strategy: "genitive" | "verb_precede" | "paragraph_owner";
}

/**
 * 属格匹配 —— "XX的XX"
 * 例："李尘的青锋剑" → owner=李尘, entity=青锋剑, confidence=0.95
 */
function matchGenitive(text: string, entities: DetectedEntity[], knownNames: string[]): OwnershipCandidate[] {
  const results: OwnershipCandidate[] = [];
  const genitivePattern = new RegExp(
    `(${knownNames.join("|")})的(${entities.map((e) => escapeRegex(e.name)).join("|")})`,
    "g",
  );

  let match: RegExpExecArray | null;
  while ((match = genitivePattern.exec(text)) !== null) {
    results.push({
      ownerName: match[1],
      entityName: match[2],
      confidence: 0.95,
      strategy: "genitive",
    });
  }

  return results;
}

/**
 * 动词前置匹配 —— "XX从储物袋取出XX" / "XX掏出XX" / "XX握着XX"
 */
function matchVerbPrecede(text: string, entities: DetectedEntity[], knownNames: string[]): OwnershipCandidate[] {
  const results: OwnershipCandidate[] = [];
  const verbs = "(?:取出|掏出|拿出|握着|握住|抓起|拔出|祭出|收起|放入|丢出|掷出|递出|接过|接过|佩戴|悬挂)";
  const entityNames = entities.map((e) => escapeRegex(e.name)).join("|");

  const verbPattern = new RegExp(
    `(${knownNames.join("|")})${CJK}{0,6}${verbs}${CJK}{0,4}(${entityNames})`,
    "g",
  );

  let match: RegExpExecArray | null;
  while ((match = verbPattern.exec(text)) !== null) {
    results.push({
      ownerName: match[1],
      entityName: match[2],
      confidence: 0.85,
      strategy: "verb_precede",
    });
  }

  return results;
}

/**
 * 段落主人推断 —— 物品所在段落中出现频率最高的角色名
 */
function matchParagraphOwner(text: string, entities: DetectedEntity[], knownNames: string[]): OwnershipCandidate[] {
  const results: OwnershipCandidate[] = [];
  const paragraphs = text.split(/\n\n|\n(?=[一-鿿])/);

  for (const para of paragraphs) {
    // 统计该段落中每个已知角色名的出现次数
    const nameFreq = new Map<string, number>();
    for (const name of knownNames) {
      const count = (para.match(new RegExp(escapeRegex(name), "g")) || []).length;
      if (count > 0) nameFreq.set(name, count);
    }

    if (nameFreq.size === 0) continue;

    // 频率最高的角色
    const paragraphOwner = [...nameFreq.entries()].sort((a, b) => b[1] - a[1])[0][0];

    // 检查该段落中出现的实体
    for (const entity of entities) {
      if (para.includes(entity.name) && !results.some((r) => r.entityName === entity.name)) {
        results.push({
          ownerName: paragraphOwner,
          entityName: entity.name,
          confidence: 0.6,
          strategy: "paragraph_owner",
        });
      }
    }
  }

  return results;
}

// ─── 工具函数 ────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 检查匹配文本是否在排除词库中 */
function isExcluded(name: string): boolean {
  return EXCLUDE_SET.has(name);
}

// ─── 主检测函数 ──────────────────────────────────────────────

export interface DetectEntitiesOptions {
  /** 已知实体词典（角色名/别名/物品名等，用于去重和提高准确率） */
  knownEntities?: KnownEntity[];
  /** 已知角色名列表（用于归属推断） */
  knownCharacterNames?: string[];
  /** 该项目中已存在的地名（从 LorebookEntry 加载） */
  knownLocations?: string[];
  /** 是否启用归属推断（默认 true） */
  enableOwnership?: boolean;
}

/**
 * 从正文中检测命名实体
 *
 * @param text 正文内容
 * @param options 可选配置（已知词典等）
 * @returns 检测结果
 */
export function detectEntities(text: string, options: DetectEntitiesOptions = {}): EntityDetectionResult {
  const startTime = Date.now();
  const {
    knownEntities = [],
    knownCharacterNames = [],
    knownLocations = [],
    enableOwnership = true,
  } = options;

  const entities: DetectedEntity[] = [];
  const knownNameSet = new Set(knownEntities.map((e) => e.name));
  const knownAliasSet = new Set(knownEntities.flatMap((e) => e.aliases || []));

  // 构建已知实体 name→type 映射
  const knownTypeMap = new Map<string, EntityType>();
  for (const ke of knownEntities) {
    knownTypeMap.set(ke.name, ke.type);
    for (const alias of ke.aliases || []) {
      knownTypeMap.set(alias, ke.type);
    }
  }

  // 记录已检测位置，防重复
  const seen = new Set<string>();

  // ── 遍历所有实体类型的正则模式 ──
  for (const [type, patterns] of Object.entries(PATTERNS) as [EntityType, typeof PATTERNS[EntityType]][]) {
    // character 类型跳过（由已知词典主导，不做通用正则匹配——误报太高）
    if (type === "character") continue;

    for (const { regex, description } of patterns) {
      // 重置正则的 lastIndex
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const name = match[0];
        const position = match.index;

        // 排除
        if (isExcluded(name)) continue;

        // 去重（同位置同名）
        const key = `${type}:${name}:${position}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const isKnown = knownNameSet.has(name) || knownAliasSet.has(name);

        entities.push({
          name,
          type,
          position,
          confidence: isKnown ? 0.98 : 0.75,
          isKnown,
          matchedBy: description,
        });
      }
    }
  }

  // ── 已知词典中的角色名直接标记 ──
  for (const name of knownCharacterNames) {
    if (!name || name.length < 2) continue;
    const escaped = escapeRegex(name);
    const nameRegex = new RegExp(escaped, "g");
    let match: RegExpExecArray | null;

    while ((match = nameRegex.exec(text)) !== null) {
      const position = match.index;
      const key = `character:${name}:${position}`;
      if (seen.has(key)) continue;
      seen.add(key);

      entities.push({
        name,
        type: "character",
        position,
        confidence: 0.98,
        isKnown: true,
        matchedBy: "已知角色词典",
      });
    }
  }

  // ── 已知地点名直接标记 ──
  for (const loc of knownLocations) {
    if (!loc || loc.length < 2) continue;
    const escaped = escapeRegex(loc);
    const locRegex = new RegExp(escaped, "g");
    let match: RegExpExecArray | null;

    while ((match = locRegex.exec(text)) !== null) {
      const position = match.index;
      const key = `location:${loc}:${position}`;
      if (seen.has(key)) continue;
      seen.add(key);

      entities.push({
        name: loc,
        type: "location",
        position,
        confidence: 0.98,
        isKnown: true,
        matchedBy: "已知地点词典",
      });
    }
  }

  // ── 归属推断 ──
  if (enableOwnership && knownCharacterNames.length > 0) {
    const ownershipCandidates: OwnershipCandidate[] = [];

    // 策略1：属格匹配 "XX的XX"
    const genitiveResults = matchGenitive(text, entities, knownCharacterNames);
    ownershipCandidates.push(...genitiveResults);

    // 策略2：动词前置 "XX从储物袋取出XX"
    const verbResults = matchVerbPrecede(text, entities, knownCharacterNames);
    ownershipCandidates.push(...verbResults);

    // 策略3：段落主人推断（仅对尚未确定归属的实体）
    const unresolvedEntities = entities.filter(
      (e) => !ownershipCandidates.some((c) => c.entityName === e.name),
    );
    const paraResults = matchParagraphOwner(text, unresolvedEntities, knownCharacterNames);
    ownershipCandidates.push(...paraResults);

    // 应用归属推断结果（去重，保留最高置信度）
    const entityOwnershipMap = new Map<string, OwnershipCandidate>();
    for (const candidate of ownershipCandidates) {
      const existing = entityOwnershipMap.get(candidate.entityName);
      if (!existing || candidate.confidence > existing.confidence) {
        entityOwnershipMap.set(candidate.entityName, candidate);
      }
    }

    for (const entity of entities) {
      const ownership = entityOwnershipMap.get(entity.name);
      if (ownership) {
        entity.owner = ownership.ownerName;
        entity.ownerConfidence = ownership.confidence;
      }
    }
  }

  // ── 按位置排序 ──
  entities.sort((a, b) => a.position - b.position);

  // ── 统计 ──
  const byType: Record<EntityType, number> = {
    pill: 0,
    artifact: 0,
    technique: 0,
    location: 0,
    material: 0,
    character: 0,
  };
  for (const e of entities) {
    byType[e.type]++;
  }

  return {
    entities,
    stats: {
      totalDetected: entities.length,
      byType,
      knownCount: entities.filter((e) => e.isKnown).length,
      newCount: entities.filter((e) => !e.isKnown).length,
      textLength: text.length,
      elapsedMs: Date.now() - startTime,
    },
  };
}

/**
 * 从检测结果中提取新实体（不在已知词典中的）
 * 用于自动创建 CharacterCard / LorebookEntry
 */
export function extractNewEntities(result: EntityDetectionResult): DetectedEntity[] {
  return result.entities.filter((e) => !e.isKnown && e.confidence >= 0.7);
}
