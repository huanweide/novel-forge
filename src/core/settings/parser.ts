/**
 * AI 设定解析器 —— 把自由文本拆成结构化三卡
 *
 * 这是"智能填表"的核心：用户贴一段设定文本（几万字都行），
 * LLM 自动识别其中的角色信息、世界观条目、写作风格，批量创建三卡。
 *
 * 三卡分界标准（本文件是唯一定义源，所有提取路径必须一致）：
 *
 * 【角色卡】有名字的个体人物
 *   外貌、性格、背景、能力、关系、对话风格、隐藏动机、时间线
 *   排除：地点/组织/功法体系（→世界卡）、文风描述（→风格卡）
 *
 * 【世界卡】世界观中的非人物概念
 *   地理位置、势力组织、力量体系、历史事件、文化风俗、生物种族、
 *   器物法宝、关键概念。每个词条含触发关键词。
 *   排除：人物信息（→角色卡）、文风特征（→风格卡）
 *
 * 【风格卡】文本的写作风格特征
 *   叙事视角、叙事距离、句式特征、对话/描写/动作/内心戏比例、
 *   语气标记、词汇特征、文风描述、样本段落
 *   排除：具体人物信息（→角色卡）、具体世界观设定（→世界卡）
 */

import type { CharacterCard, LorebookEntry } from "@/core/types";
import type { LLMClient } from "@/core/llm/client";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";

// ─── 三卡分界标准（Prompt 片段）───────────────────────────────

/**
 * 三卡分界的精确定义——会被注入到所有提取 prompt 中。
 * 这是整个项目三卡提取的唯一权威规则源。
 */
export const THREE_CARD_BOUNDARIES = `【三卡分界——提取时严格遵循，不要把A卡的内容放进B卡】

=== 角色卡（有名字的个体人物）===
提取对象：文本中出现的、有明确名字的个体人物（不提取"众弟子""路人"等无名群体）
包含：名字、别名、年龄、性别、定位(protagonist/antagonist/supporting/mentor/love_interest/comic_relief/background)
      外貌(hair/eyes/height/build/features/attire)、性格(dominant/drive/contradiction/habits/socialMask)
      背景故事、能力特长、人际关系、对话风格(description/examples/vocabulary/speechPatterns)
      隐藏动机、人生时间线(timeline: age+event)
排除：地名/组织名/功法体系→世界卡 | 句式特征/文风描述→风格卡 | 无名群体→不提取

=== 世界卡（世界观中的非人物概念）===
提取对象：geography(地理位置/城市/山脉/秘境/建筑)
          faction(势力组织/宗门/帮派/国家/队伍)
          magic_system(力量体系/功法等级/魔法规则/修炼境界)
          history(历史事件/战争/变革/重大发现)
          culture(文化风俗/节日/礼仪/禁忌/社会规则)
          creature(生物种族/妖兽/异族/神兽)
          item(器物法宝/武器/丹药/卷轴/重要物品)
          custom(其他关键概念/世界观铁律/特殊规则)
每个词条需要：title(概念名)、category(上述分类之一)、keys(触发关键词数组)、content(详细设定内容)
排除：人物信息→角色卡 | 文风特征→风格卡

=== 风格卡（写作风格特征）===
提取对象：从文本中分析写作风格（不要求设定文本明确写出风格，从行文中推断）
包含：povType(叙事视角: first_person/third_person_limited/third_person_omniscient/second_person)
      narrativeDistance(叙事距离: close贴着心理/medium/remote上帝视角)
      avgSentenceLength(平均句长估算，数字)
      shortSentenceRatio(短句占比<15字，0-1小数)
      longSentenceRatio(长句占比>40字，0-1小数)
      dialogueRatio(对话占比，0-1)
      descriptionRatio(环境描写占比，0-1)
      actionRatio(动作描写占比，0-1)
      innerThoughtRatio(内心独白占比，0-1)
      tonalMarkers(语气标记，JSON对象，如{"冷峻":0.8,"幽默":0.2})
      lexicalFeatures(词汇特征，JSON对象，如{"古风雅语":0.7,"口语":0.3})
      styleDescription(一段中文概括整体文风，100字内)
      sampleText(从设定文本中摘取最能体现风格的一段原文，200字内)
排除：具体人物信息→角色卡 | 具体世界观设定→世界卡 | 情节大纲→存为项目总纲不进风格卡`;

// ─── 解析结果类型 ───────────────────────────────────────────

export interface ParsedCharacter {
  name: string;
  aliases: string[];
  age: string;
  gender: string;
  role: "protagonist" | "antagonist" | "supporting" | "mentor" | "love_interest" | "comic_relief" | "background";
  appearance: {
    hair: string;
    eyes: string;
    height: string;
    build: string;
    features: string;
    attire: string;
  };
  personality: string[];
  dialogueDescription: string;
  dialogueExamples: string[];
  background: string;
  hiddenMotives: string[];
  relations: { target: string; relation: string }[];
}

export interface ParsedLoreEntry {
  title: string;
  category: "geography" | "faction" | "magic_system" | "technique" | "history" | "culture" | "creature" | "item" | "law" | "currency" | "character_relationship" | "fate_system" | "physics" | "public_system" | "custom";
  keys: string[];
  content: string;
  insertionOrder: number;
}

/** 风格画像——对应 StyleCard 模型的全部字段 */
export interface StyleProfile {
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

export interface ParsedSettings {
  characters: ParsedCharacter[];
  loreEntries: ParsedLoreEntry[];
  synopsis: string;
  toneKeywords: string[];
  /** 风格卡画像——从设定文本中提取的写作风格特征 */
  styleProfile: StyleProfile | null;
}

// ─── 解析函数 ───────────────────────────────────────────────

const PARSE_SYSTEM_PROMPT = `你是一个专业的小说设定解析专家。你的任务是把用户提供的自由文本（可能是小说大纲、世界观设定、角色介绍等混在一起），提取出结构化的三卡信息。

${THREE_CARD_BOUNDARIES}

【提取要求——保留全部信息，禁止精简】
1. 角色卡：所有有名字的个体人物。原文每一个细节都要保留——外貌描写照搬原文措辞，背景故事复述原文不总结，能力逐条列出不合并。缺信息的字段基于同类型角色合理推断，禁止填"无""未知""暂无"。
2. 世界卡：所有非人物的世界观概念，按category分类。content字段复述原文细节，不压缩不概括。每个词条给出触发关键词和重要性评分(0-100)。
3. 风格卡：从文本行文中推断写作风格特征。如果设定文本本身没有体现风格（纯大纲/列表），则根据题材推断。
4. synopsis：提取/概括主线剧情总纲。
5. toneKeywords：提取作品基调关键词数组。

【无上限提取 + 零精简】
- 角色数量无上限——有多少提取多少，配角龙套也保留
- 世界词条无上限——不遗漏任何设定概念
- 每个字段都要填满——宁可用上下文合理推断，也不留空
- 输出必须是严格的 JSON 格式，不要有任何额外说明文字`;

/**
 * 解析设定文本
 *
 * @param rawText 用户粘贴的原始设定文本（无长度上限）
 * @param client LLM客户端（可选）
 */
export async function parseSettings(
  rawText: string,
  client?: LLMClient
): Promise<ParsedSettings> {
  let llm: LLMClient;
  let effectiveModel: string;
  if (client) {
    llm = client;
    effectiveModel = process.env.LLM_MODEL || "";
  } else {
    const config = await getEffectiveConfig();
    llm = createLLMClient(config);
    effectiveModel = config.extractorModel;
  }

  const response = await llm.chat({
    model: effectiveModel,
    messages: [
      { role: "system", content: PARSE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `请解析以下小说设定文本，输出完整JSON（三卡+总纲+基调）。

${rawText}

输出格式——角色卡务必填满每个字段，不要精简：
{
  "characters": [
    {
      "name": "角色名",
      "aliases": ["别名/称号"],
      "age": "年龄或年龄段",
      "gender": "性别",
      "role": "protagonist|antagonist|supporting|mentor|love_interest|comic_relief|background",
      "appearance": {
        "hair": "发色发型——复述原文描写，不要缩写",
        "eyes": "眼型瞳色——复述原文",
        "height": "身高",
        "build": "体型体态",
        "features": "特殊外貌特征/印记/疤痕",
        "attire": "标志性着装风格"
      },
      "personality": {
        "dominant": "主导性格——详细描述，不只一两个词",
        "drive": "核心驱动力——他/她真正想要什么",
        "contradiction": "内在矛盾——表里不一的地方",
        "habits": ["习惯性动作/口头禅"],
        "socialMask": "社交面具——对外展示的形象"
      },
      "dialogueStyle": {
        "description": "说话风格描述——语气、节奏、用词习惯",
        "examples": ["典型台词——从原文摘取或合理推断"],
        "vocabulary": ["常用词汇特点"],
        "speechPatterns": ["句式模式——短句/长句/反问/沉默"]
      },
      "background": "背景故事——复述原文全部细节，不压缩不概括。包含：出身/成长经历/关键事件/当前处境/卷入主线的原因。至少100字。",
      "abilities": ["能力名·等级或掌握程度·一句话描述原理和应用"],
      "hiddenMotives": ["隐藏动机——角色自己可能都没意识到的驱动力"],
      "timeline": [{"age": "年龄或阶段", "event": "事件描述"}],
      "relationships": [{"targetName": "其他角色名", "relation": "关系类型", "dynamic": "互动模式——怎样相处"}]
    }
  ],
  "loreEntries": [
    {
      "title": "词条名",
      "category": "geography|faction|magic_system|history|culture|creature|item|custom",
      "keys": ["触发词1", "触发词2"],
      "content": "设定内容——复述原文全部细节，禁止概括。专有名词、数值、层级关系一字不漏。",
      "insertionOrder": 80
    }
  ],
  "synopsis": "主线总纲概括",
  "toneKeywords": ["基调词1", "基调词2"],
  "styleProfile": {
    "povType": "third_person_limited",
    "narrativeDistance": "medium",
    "avgSentenceLength": 25,
    "shortSentenceRatio": 0.3,
    "longSentenceRatio": 0.15,
    "dialogueRatio": 0.35,
    "descriptionRatio": 0.25,
    "actionRatio": 0.25,
    "innerThoughtRatio": 0.15,
    "tonalMarkers": {"冷峻": 0.7, "沉重": 0.3},
    "lexicalFeatures": {"古风雅语": 0.6, "现代口语": 0.4},
    "styleDescription": "文风概括，100字内",
    "sampleText": "从设定文本中摘取的代表性段落"
  }
}

现在开始解析。`,
      },
    ],
    temperature: 0.3,
    maxTokens: 32768, // 无上限提取——给足输出空间
  });

  return parseResponse(response.content);
}

/**
 * 解析 LLM 返回的 JSON 字符串
 */
function parseResponse(raw: string): ParsedSettings {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    return {
      characters: (parsed.characters || []).map(normalizeCharacter),
      loreEntries: (parsed.loreEntries || []).map(normalizeLoreEntry),
      synopsis: parsed.synopsis || "",
      toneKeywords: parsed.toneKeywords || [],
      styleProfile: parsed.styleProfile ? normalizeStyleProfile(parsed.styleProfile) : null,
    };
  } catch (err) {
    throw new Error(`解析 AI 返回的 JSON 失败: ${(err as Error).message}\n原始内容: ${raw.slice(0, 500)}`);
  }
}

function normalizeCharacter(c: Partial<ParsedCharacter>): ParsedCharacter {
  return {
    name: c.name || "未命名角色",
    aliases: c.aliases || [],
    age: c.age || "未知",
    gender: c.gender || "未知",
    role: c.role || "supporting",
    appearance: {
      hair: c.appearance?.hair || "",
      eyes: c.appearance?.eyes || "",
      height: c.appearance?.height || "",
      build: c.appearance?.build || "",
      features: c.appearance?.features || "",
      attire: c.appearance?.attire || "",
    },
    personality: c.personality || [],
    dialogueDescription: c.dialogueDescription || "",
    dialogueExamples: c.dialogueExamples || [],
    background: c.background || "",
    hiddenMotives: c.hiddenMotives || [],
    relations: c.relations || [],
  };
}

function normalizeLoreEntry(l: Partial<ParsedLoreEntry>): ParsedLoreEntry {
  return {
    title: l.title || "未命名词条",
    category: l.category || "custom",
    keys: l.keys || [],
    content: l.content || "",
    insertionOrder: l.insertionOrder ?? 50,
  };
}

function normalizeStyleProfile(sp: Record<string, unknown>): StyleProfile {
  const num = (key: string, def: number) => {
    const v = sp[key];
    return typeof v === "number" && !isNaN(v) ? v : def;
  };
  const obj = (key: string, def: Record<string, number>) => {
    const v = sp[key];
    return (typeof v === "object" && v !== null && !Array.isArray(v)) ? v as Record<string, number> : def;
  };

  return {
    povType: String(sp.povType || "third_person_limited"),
    narrativeDistance: String(sp.narrativeDistance || "medium"),
    avgSentenceLength: num("avgSentenceLength", 25),
    shortSentenceRatio: num("shortSentenceRatio", 0.3),
    longSentenceRatio: num("longSentenceRatio", 0.15),
    dialogueRatio: num("dialogueRatio", 0.35),
    descriptionRatio: num("descriptionRatio", 0.25),
    actionRatio: num("actionRatio", 0.25),
    innerThoughtRatio: num("innerThoughtRatio", 0.15),
    tonalMarkers: obj("tonalMarkers", {}),
    lexicalFeatures: obj("lexicalFeatures", {}),
    styleDescription: String(sp.styleDescription || ""),
    sampleText: String(sp.sampleText || ""),
  };
}

// ─── 转换为数据库创建参数 ──────────────────────────────────

export function toCharacterCreateParams(char: ParsedCharacter, projectId: string) {
  return {
    projectId,
    name: char.name,
    aliases: char.aliases,
    age: char.age,
    gender: char.gender,
    role: char.role,
    appearance: char.appearance,
    personality: char.personality,
    dialogueStyle: {
      description: char.dialogueDescription,
      examples: char.dialogueExamples,
      vocabulary: [],
      speechPatterns: [],
    },
    background: char.background,
    hiddenMotives: char.hiddenMotives,
    relationships: char.relations.map((r) => ({
      targetName: r.target,
      relation: r.relation,
      dynamic: "",
      notes: "",
    })),
    currentStatus: "alive",
    tags: ["📥导入"],
  };
}

export function toLorebookCreateParams(entry: ParsedLoreEntry, projectId: string) {
  return {
    projectId,
    title: entry.title,
    category: entry.category,
    keys: entry.keys,
    content: entry.content,
    insertionOrder: entry.insertionOrder,
    enabled: true,
    relatedEntryIds: [],
  };
}

// ─── 专用提取：仅世界卡 ──────────────────────────────────

const LOREBOOK_ONLY_PROMPT = `你是世界观设定蒸馏专家。你的任务是从文本中提取所有世界观概念，复述而非总结。

【核心理念：复述蒸馏——不是总结】
- 复述：原文的设定细节全部保留——数值、名称、关系、规则，一字不漏地搬过来
- 蒸馏：去重（同一概念的多处描述合并为一条）、去矛盾（以最详细版本为准）、分类组织
- 禁止总结：不要概括、不要缩写、不要"大致是..."——保持原文信息密度
- 禁止压缩：200字的原文设定变成50字总结 = 失败。200字→200字+ 结构化 = 成功

${THREE_CARD_BOUNDARIES}

【提取重点——世界卡专属】
只提取世界卡（LorebookEntry），不要角色卡，不要风格卡。
但注意：如果原文中某些"写作规则"实际上是世界观的一部分（如"这个世界魔法反噬会烧毁灵脉""仙界之门开启时凡人会失忆三天"），提取为世界词条。

【分类覆盖——每种类型都不能漏】
- geography: 地理位置、城市、山脉、秘境、建筑、空间结构
- faction: 势力组织、宗门、帮派、国家、阵营、队伍、家族
- magic_system: 力量体系、功法等级、魔法规则、修炼境界、能量来源、限制条件
- history: 历史事件、战争、变革、重大发现、时间线节点
- culture: 文化风俗、节日、礼仪、禁忌、社会规则、阶级制度
- creature: 生物种族、妖兽、异族、神兽、怪物、非人种族
- item: 器物法宝、武器、丹药、卷轴、神器、重要物品
- custom: 其他关键概念、世界观铁律、特殊规则、宇宙法则

【每个词条必须包含】
- title: 概念名称（简洁准确）
- category: 上述分类之一
- keys: 触发关键词数组——文中出现这些词时该词条自动激活（3-8个，包含别名/简称/相关词）
- content: 完整设定内容——复述原文全部细节，不缩写。结构化组织（用换行分段），但信息密度不低于原文
- insertionOrder: 重要性 0-100（核心世界观=90+，重要设定=70-89，一般条目=40-69，细节补充=<40）

【无上限提取——有多少出多少】
文本中每一个世界观概念都要提取。不设数量上限。宁可多提取10条细节词条，不要漏掉1条关键设定。`;

/**
 * 仅提取世界书词条——复述蒸馏，不总结
 * 用于用户只想提取世界观设定的场景。
 */
export async function parseLorebookOnly(
  rawText: string,
  client?: LLMClient
): Promise<ParsedLoreEntry[]> {
  let llm: LLMClient;
  let effectiveModel: string;
  if (client) {
    llm = client;
    effectiveModel = process.env.LLM_MODEL || "";
  } else {
    const config = await getEffectiveConfig();
    llm = createLLMClient(config);
    effectiveModel = config.extractorModel;
  }

  const response = await llm.chat({
    model: effectiveModel,
    messages: [
      { role: "system", content: LOREBOOK_ONLY_PROMPT },
      {
        role: "user",
        content: `从以下文本中提取所有世界观设定词条。复述原文细节，不总结不压缩。输出JSON数组：

${rawText}

输出格式：
[{"title":"词条名","category":"geography|faction|magic_system|history|culture|creature|item|custom","keys":["触发词1","触发词2"],"content":"完整设定内容——复述原文全部细节","insertionOrder":80}]

只输出JSON数组。每条content必须保持原文信息密度。`,
      },
    ],
    temperature: 0.2,
    maxTokens: 32768,
  });

  return parseLorebookResponse(response.content);
}

function parseLorebookResponse(raw: string): ParsedLoreEntry[] {
  let s = raw.trim();
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) s = md[1].trim();
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);

  try {
    const arr = JSON.parse(s) as Array<Record<string, unknown>>;
    return arr.map(normalizeLoreEntry);
  } catch (err) {
    throw new Error(`解析世界卡JSON失败: ${(err as Error).message}\n原始: ${raw.slice(0, 300)}`);
  }
}

// ─── 专用提取：仅风格卡 ──────────────────────────────────

const STYLE_ONLY_PROMPT = `你是写作风格分析专家。你的任务是从文本中提取全部风格特征和写作规则，复述而非总结。

【核心理念：复述蒸馏——不是总结】
- 复述：原文体现的风格特征全部捕捉——句式习惯、用词倾向、节奏模式，用具体例子说明
- 蒸馏：从大量文本中提炼出可量化的风格参数，标注典型样本
- 禁止概括："文风古雅"不够——要写"半文半白，叙述句现代中文短句，对话按角色身份切换语域，情色描写直白不加修饰"
- 禁止压缩：如果原文有明确的写作规则（如"不准写心理活动""对话不超过3行"），原文照搬

【分析维度——全部覆盖】

1. 叙事视角（povType）
   - first_person: "我"叙事
   - third_person_limited: 第三人称限制（贴着一个角色的视角）
   - third_person_omniscient: 第三人称全知（上帝视角，知道所有人想法）
   - second_person: "你"叙事（罕见）

2. 叙事距离（narrativeDistance）
   - close: 贴着人物心理——大量内心独白、感知描写
   - medium: 有距离但不远——偶尔进人物内心，以外部描写为主
   - remote: 上帝视角俯瞰——历史记录式的冷静叙述

3. 句式量化（基于文本抽样估算）
   - avgSentenceLength: 平均句长（中文字数）
   - shortSentenceRatio: 短句占比（<15字）
   - longSentenceRatio: 长句占比（>40字）

4. 叙事比例（估算，总和≈1.0）
   - dialogueRatio: 对话占比
   - descriptionRatio: 环境/外貌描写占比
   - actionRatio: 动作描写占比
   - innerThoughtRatio: 内心独白/心理描写占比

5. 语气标记（tonalMarkers）
   用JSON对象标注各种语气的强度(0-1)，如：
   {"冷峻":0.8,"压抑":0.6,"讽刺":0.3,"温情":0.1}
   覆盖：冷峻/幽默/沉重/甜宠/热血/讽刺/温情/惊悚/悲壮/轻松等

6. 词汇特征（lexicalFeatures）
   用JSON对象标注词汇倾向(0-1)，如：
   {"古风雅语":0.7,"现代口语":0.2,"市井粗俗":0.1,"术语密度":0.5}
   覆盖：古风雅语/现代口语/方言/市井粗俗/术语密度/成语密度/外语混用等

7. 文风描述（styleDescription）
   一段完整中文描述（100-200字），概括整体写作风格。
   必须具体——指出句长偏好、用词习惯、节奏模式、感官优先级。

8. 写作规则提取（writingRules）
   如果原文明确写了写作规则/约束（如"禁止心理描写""对话不超过3行""每段不超过5行""不准用'突然'开头"），逐条提取。
   如果没有明确的规则，从文风中反推隐含的规则（如"全文没用过'突然'→可能隐含禁突然规则"）。

9. 样本段落（sampleText）
   从原文中摘取最能体现风格的段落（200-500字）。优先选包含多种风格特征的段落。`;

/**
 * 仅提取风格卡——复述蒸馏，分析全部风格维度 + 写作规则
 * 用于用户只想从文本中提取写作风格的场景。
 */
export async function parseStyleOnly(
  rawText: string,
  client?: LLMClient
): Promise<StyleProfile & { writingRules: string[] }> {
  let llm: LLMClient;
  let effectiveModel: string;
  if (client) {
    llm = client;
    effectiveModel = process.env.LLM_MODEL || "";
  } else {
    const config = await getEffectiveConfig();
    llm = createLLMClient(config);
    effectiveModel = config.extractorModel;
  }

  const response = await llm.chat({
    model: effectiveModel,
    messages: [
      { role: "system", content: STYLE_ONLY_PROMPT },
      {
        role: "user",
        content: `分析以下文本的写作风格。覆盖全部维度，复述特征不概括。输出JSON：

${rawText}

输出格式：
{
  "povType": "third_person_limited",
  "narrativeDistance": "close",
  "avgSentenceLength": 22,
  "shortSentenceRatio": 0.35,
  "longSentenceRatio": 0.1,
  "dialogueRatio": 0.4,
  "descriptionRatio": 0.2,
  "actionRatio": 0.25,
  "innerThoughtRatio": 0.15,
  "tonalMarkers": {"冷峻":0.7,"压抑":0.3},
  "lexicalFeatures": {"古风雅语":0.6,"现代口语":0.3,"术语密度":0.4},
  "styleDescription": "具体文风描述——100-200字，指出句长偏好、用词习惯、节奏模式、感官优先级",
  "writingRules": ["规则1：原文照搬", "规则2：从文风反推"],
  "sampleText": "从原文中摘取的代表性段落"
}

只输出JSON。`,
      },
    ],
    temperature: 0.2,
    maxTokens: 32768,
  });

  return parseStyleOnlyResponse(response.content);
}

function parseStyleOnlyResponse(raw: string): StyleProfile & { writingRules: string[] } {
  let s = raw.trim();
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) s = md[1].trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);

  try {
    const parsed = JSON.parse(s) as Record<string, unknown>;
    const profile = normalizeStyleProfile(parsed);
    const writingRules = Array.isArray(parsed.writingRules)
      ? parsed.writingRules.filter((r: unknown) => typeof r === "string")
      : [];
    return { ...profile, writingRules };
  } catch (err) {
    throw new Error(`解析风格卡JSON失败: ${(err as Error).message}\n原始: ${raw.slice(0, 300)}`);
  }
}

/**
 * 将 StyleProfile 转为 StyleCard 创建参数
 */
export function toStyleCardCreateParams(profile: StyleProfile, projectId: string, sourceChapterCount = 0) {
  return {
    projectId,
    avgSentenceLength: profile.avgSentenceLength,
    shortSentenceRatio: profile.shortSentenceRatio,
    longSentenceRatio: profile.longSentenceRatio,
    dialogueRatio: profile.dialogueRatio,
    descriptionRatio: profile.descriptionRatio,
    actionRatio: profile.actionRatio,
    innerThoughtRatio: profile.innerThoughtRatio,
    povType: profile.povType,
    narrativeDistance: profile.narrativeDistance,
    tonalMarkers: profile.tonalMarkers,
    lexicalFeatures: profile.lexicalFeatures,
    styleDescription: profile.styleDescription,
    sampleText: profile.sampleText || null,
    sourceChapterCount,
  };
}
