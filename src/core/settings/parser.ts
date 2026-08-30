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

import { asArray } from "@/lib/utils";
import type { CharacterCard, LorebookEntry } from "@/core/types";
import type { LLMClient } from "@/core/llm/client";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import { prisma } from "@/lib/prisma";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import { parseSettingsLocal } from "./local-parser";

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
  // 无 LLM 配置（未填 Key / 占位符 Key / 本地推理未配好）→ 本地规则解析降级
  if (!client && !(await hasLLMConfig())) {
    return localFallback(rawText, "all");
  }
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
    maxTokens: 32768,
    json: true, // 无上限提取——给足输出空间
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
  // 无 LLM 配置 → 本地规则解析降级（只取世界卡）
  if (!client && !(await hasLLMConfig())) {
    return localFallback(rawText, "lorebook").loreEntries;
  }
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
    json: true,
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
  // 无 LLM 配置 → 本地规则解析降级（只取风格卡；本地解析器不产写作规则，置空数组）
  if (!client && !(await hasLLMConfig())) {
    const sp = localFallback(rawText, "style").styleProfile;
    return { ...(sp as StyleProfile), writingRules: [] };
  }
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
    json: true,
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

// ─── 统一流式提取引擎（探讨模式 + 工作台共用）──────────────
// 设计：短文本单次调用（保留 parser 的复述蒸馏准确度）；
//       长文本智能分块 → Promise.all 并行提取 → 按 name+role 去重合并；
//       全程进度回调，避免串行 for 循环导致的超时与慢进度。

/** 提取进度（供 SSE / 前端可视化） */
export interface ExtractProgress {
  phase: "chunking" | "extracting" | "merging" | "done" | "error";
  chunks?: number;
  textLen?: number;
  current?: number;
  total?: number;
  characters?: number;
  loreEntries?: number;
  styleCard?: boolean;
  error?: string;
}

/**
 * 智能分块：按行边界切分，保持章节内上下文完整。
 * 优先在段落边界（空行）切，避免把一个句子拦腰截断导致乱码；
 * 每块带前文提要（前 400 字），保证跨块角色/设定不丢失。
 */
export function splitIntoChunks(text: string, maxChunk = 9000): string[] {
  const clean = text.trim();
  if (clean.length <= maxChunk) return [clean];

  const lines = clean.split(/\n/);
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    if (current.length + line.length > maxChunk && current.length > 300) {
      chunks.push(current.trim());
      current = "";
    }
    current += line + "\n";
  }
  if (current.trim()) chunks.push(current.trim());

  const withOverlap: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];
    if (i > 0) {
      const prevTail = chunks[i - 1].slice(-400);
      chunk = `【前文提要】${prevTail}\n\n---\n\n${chunk}`;
    }
    withOverlap.push(chunk);
  }
  return withOverlap;
}

/**
 * 合并多块提取结果——按 name+role 去重，避免同名不同人串卡。
 * 取字段更完整的版本（background/content 更长者优先）。
 */
export function mergeParsedSettings(results: ParsedSettings[]): ParsedSettings {
  const charMap = new Map<string, ParsedCharacter>();
  const loreMap = new Map<string, ParsedLoreEntry>();
  let synopsis = "";
  const toneSet = new Set<string>();
  let styleProfile: StyleProfile | null = null;

  for (const r of results) {
    for (const c of r.characters) {
      // 同名 + 同 role 才算同一人（解决父子同名/师徒同名串卡）
      const key = `${c.name?.trim()}|${c.role}`;
      const existing = charMap.get(key);
      if (!existing || (c.background || "").length > (existing.background || "").length) {
        charMap.set(key, c);
      }
    }
    for (const l of r.loreEntries) {
      const key = l.title?.trim().toLowerCase();
      const existing = loreMap.get(key);
      if (!existing || (l.content || "").length > (existing.content || "").length) {
        loreMap.set(key, l);
      }
    }
    if (r.synopsis && r.synopsis.length > synopsis.length) synopsis = r.synopsis;
    for (const t of r.toneKeywords) toneSet.add(t);
    if (r.styleProfile && !styleProfile) styleProfile = r.styleProfile;
  }

  return {
    characters: Array.from(charMap.values()),
    loreEntries: Array.from(loreMap.values()),
    synopsis,
    toneKeywords: Array.from(toneSet),
    styleProfile,
  };
}

/**
 * 统一结构化提取——探讨模式与工作台的共用入口。
 *
 * - 短文本（≤12000字）：单次调用，保持 parser 复述蒸馏的最高准确度。
 * - 长文本：智能分块 → Promise.all 并行提取 → 合并去重，全程进度回调。
 * - mode 对应三卡模式：all / lorebook / style。
 *
 * 复用现有 parseSettings/parseLorebookOnly/parseStyleOnly（已带 json:true 严格输出 + 重试）。
 */
/** 探测当前是否有可用的 LLM 配置（含本地推理）；未填 Key / 未选模型 / 本地推理未配好时返回 false */
async function hasLLMConfig(): Promise<boolean> {
  try {
    const config = await getEffectiveConfig();
    // 占位符防御：apiKey 非空但过短（<16 位）视为「未真正配置」→ 触发本地降级。
    // 真实 key 通常 ≥20 位；8 位左右的 "sk-xxx" 是 .env 占位符/测试假 key，
    // 若放行会让请求打到真实 API 用假 key 卡死（比直接报错更糟）。
    if (config.apiKey && config.apiKey.trim().length > 0 && config.apiKey.trim().length < 16) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 无 LLM 时的本地规则解析降级。
 * parseSettingsLocal 输出与 ParsedSettings 结构完全一致（同名同型字段），
 * 按 mode 裁剪后直接作为提取结果返回，供 upsertParsedSettingsToProject 落库。
 */
function localFallback(rawText: string, mode: "all" | "lorebook" | "style"): ParsedSettings {
  const local = parseSettingsLocal(rawText);
  const base = local as unknown as ParsedSettings;
  if (mode === "lorebook") {
    return { characters: [], loreEntries: base.loreEntries, synopsis: "", toneKeywords: [], styleProfile: null };
  }
  if (mode === "style") {
    return { characters: [], loreEntries: [], synopsis: "", toneKeywords: [], styleProfile: base.styleProfile };
  }
  return base;
}

export async function parseSettingsStreaming(
  rawText: string,
  opts?: {
    onProgress?: (p: ExtractProgress) => void;
    client?: LLMClient;
    mode?: "all" | "lorebook" | "style";
  },
): Promise<ParsedSettings> {
  const text = rawText.trim();
  const onProgress = opts?.onProgress;
  const mode = opts?.mode ?? "all";

  // 无 LLM 配置（未填 Key / 模型 / 本地推理）时降级为本地规则解析：
  // 毫秒级、零网络，保证「整理」「探讨模式」在任何情况下都能跑通。
  if (!(await hasLLMConfig())) {
    onProgress?.({ phase: "extracting", total: 1, current: 1 });
    const result = localFallback(text, mode);
    onProgress?.({
      phase: "done",
      characters: result.characters.length,
      loreEntries: result.loreEntries.length,
      styleCard: !!result.styleProfile,
    });
    return result;
  }

  // 阈值以下直接单次（最快最准）
  const CHUNK_THRESHOLD = 12000;
  if (text.length <= CHUNK_THRESHOLD) {
    onProgress?.({ phase: "extracting", total: 1, current: 1 });
    try {
      const result = await extractByMode(text, mode, opts?.client);
      onProgress?.({
        phase: "done",
        characters: result.characters.length,
        loreEntries: result.loreEntries.length,
        styleCard: !!result.styleProfile,
      });
      return result;
    } catch (err) {
      onProgress?.({ phase: "error", error: err instanceof Error ? err.message : "提取失败" });
      throw err;
    }
  }

  // 长文本：分块并行
  const chunks = splitIntoChunks(text);
  onProgress?.({ phase: "chunking", chunks: chunks.length, textLen: text.length });

  const results = await Promise.all(
    chunks.map(async (chunk, i) => {
      onProgress?.({ phase: "extracting", current: i + 1, total: chunks.length });
      try {
        return await extractByMode(chunk, mode, opts?.client);
      } catch {
        return { characters: [], loreEntries: [], synopsis: "", toneKeywords: [], styleProfile: null } as ParsedSettings;
      }
    }),
  );

  onProgress?.({ phase: "merging" });
  const merged = mergeParsedSettings(results);
  onProgress?.({
    phase: "done",
    characters: merged.characters.length,
    loreEntries: merged.loreEntries.length,
    styleCard: !!merged.styleProfile,
  });
  return merged;
}

/** 按 mode 分派到现有提取函数（保持单一实现源，避免漂移） */
async function extractByMode(
  text: string,
  mode: "all" | "lorebook" | "style",
  client?: LLMClient,
): Promise<ParsedSettings> {
  if (mode === "lorebook") {
    const entries = await parseLorebookOnly(text, client);
    return { characters: [], loreEntries: entries, synopsis: "", toneKeywords: [], styleProfile: null };
  }
  if (mode === "style") {
    const sp = await parseStyleOnly(text, client);
    return {
      characters: [],
      loreEntries: [],
      synopsis: "",
      toneKeywords: [],
      styleProfile: sp,
    };
  }
  return parseSettings(text, client);
}

// ─── 统一落库：解析结果 → 项目实体（探讨模式 + 工作台共用）──
// 单一实现源：parse-settings / explore create / explore adopt-batch 全部调用本函数，
// 保证「求同存异」合并逻辑在任何入口都一致，永不漂移。
//
// 设计要点（对应"准确落库、不串卡、不丢字段"）：
// - 角色卡：同名（小写）合并 background（保留用户手改的其他字段），不同名则新建；
// - 世界卡：同名词条合并 content（拼接）+ 去重 keys；
// - 风格卡：有则重建（删除旧卡再建，确保与提取画像一致）；
// - synopsis / toneKeywords：写项目总纲与基调；
// - 全程 Promise.all 并行写入，避免逐条 HTTP 的慢与局部失败；
// - 末尾 syncGlobalPrompt 把新种子注入生成上下文。

export interface UpsertResult {
  characters: number;
  loreEntries: number;
  styleCard: boolean;
  plotOutline: boolean;
}

export async function upsertParsedSettingsToProject(
  projectId: string,
  parsed: ParsedSettings,
  opts?: { skipStyleCard?: boolean },
): Promise<UpsertResult> {
  const writeOps: Promise<unknown>[] = [];
  let charCount = 0;
  let loreCount = 0;

  // ── 角色卡：求同存异（同名合并 background + 空字段补齐，不同名新建）──
  // 注：本项目 prisma 查询返回宽松类型，故显式断言结构体并手写 Map，
  // 避免 .map 隐式 any 与 new Map(array.map) 把值塌成 {} 的编译错误。
  interface ExistingCharRow {
    id: string;
    name: string;
    background: string | null;
    personality: unknown;
    age: string | null;
    gender: string | null;
    role: string | null;
  }
  interface ExistingLoreRow { id: string; title: string; content: string | null; keys: string[] | null }

  if (parsed.characters.length > 0) {
    const existingChars = (await prisma.characterCard.findMany({
      where: { projectId },
      select: { id: true, name: true, background: true, personality: true, age: true, gender: true, role: true },
    })) as unknown as ExistingCharRow[];
    const existingMap = new Map<string, ExistingCharRow>();
    for (const c of existingChars) {
      existingMap.set(c.name.toLowerCase().trim(), c);
    }

    for (const c of parsed.characters) {
      const key = (c.name || "").toLowerCase().trim();
      const existing = existingMap.get(key);
      if (existing) {
        // 合并：旧 background + 新 background，保留用户已手改的字段
        const mergedBg = [existing.background, c.background]
          .filter((b): b is string => !!b && b.trim().length > 0)
          .join("\n\n---\n---\n\n");
        // 求同存异·空字段补齐：解析出的新字段在库中为空时补全，不覆盖用户手改的非空值。
        // （典型场景：探讨模式 create 先建了主角卡（只有 background），随后 outline 落库
        //   同名存在 → 若只并 background，personality/appearance 等解析结果会永久丢失。）
        const personalityArr = Array.isArray(c.personality) ? c.personality : [];
        const data: Record<string, unknown> = { background: mergedBg };
        const curPers = Array.isArray(existing.personality) ? existing.personality : [];
        if (curPers.length === 0 && personalityArr.length > 0) data.personality = personalityArr;
        if ((!existing.age || existing.age === "未知") && c.age && c.age !== "未知") data.age = c.age;
        if ((!existing.gender || existing.gender === "未知") && c.gender && c.gender !== "未知") data.gender = c.gender;
        if ((!existing.role || existing.role === "supporting") && c.role && c.role !== "supporting") data.role = c.role;
        writeOps.push(
          prisma.characterCard.update({
            where: { id: existing.id },
            data,
          }),
        );
      } else {
        writeOps.push(
          prisma.characterCard.create({ data: toCharacterCreateParams(c, projectId) }),
        );
      }
      charCount++;
    }
  }

  // ── 世界卡：求同存异（同名词条合并 content + 去重 keys）──
  if (parsed.loreEntries.length > 0) {
    const existingLore = (await prisma.lorebookEntry.findMany({
      where: { projectId },
      select: { id: true, title: true, content: true, keys: true },
    })) as unknown as ExistingLoreRow[];
    const existingMap = new Map<string, ExistingLoreRow>();
    for (const e of existingLore) {
      existingMap.set(e.title.toLowerCase().trim(), e);
    }

    for (const l of parsed.loreEntries) {
      const key = (l.title || "").toLowerCase().trim();
      const existing = existingMap.get(key);
      if (existing) {
        const mergedContent = [existing.content, l.content]
          .filter((c): c is string => !!c && c.trim().length > 0)
          .join("\n\n---\n");
        const mergedKeys = [
          ...new Set([...asArray<string>(existing.keys), ...asArray<string>(l.keys)]),
        ];
        writeOps.push(
          prisma.lorebookEntry.update({
            where: { id: existing.id },
            data: { content: mergedContent, keys: mergedKeys },
          }),
        );
      } else {
        writeOps.push(
          prisma.lorebookEntry.create({ data: toLorebookCreateParams(l, projectId) }),
        );
      }
      loreCount++;
    }
  }

  // ── 风格卡：有则重建 ──
  if (parsed.styleProfile && !opts?.skipStyleCard) {
    writeOps.push(
      (async () => {
        await prisma.styleCard.deleteMany({ where: { projectId } });
        await prisma.styleCard.create({
          data: toStyleCardCreateParams(parsed.styleProfile!, projectId, 0),
        });
      })(),
    );
  }

  // ── 项目总纲 + 基调 ──
  const projectUpdate: Record<string, unknown> = {};
  if (parsed.synopsis) projectUpdate.synopsis = parsed.synopsis;
  if (parsed.toneKeywords && parsed.toneKeywords.length > 0) {
    projectUpdate.toneKeywords = parsed.toneKeywords;
  }
  if (Object.keys(projectUpdate).length > 0) {
    writeOps.push(
      prisma.project.update({ where: { id: projectId }, data: projectUpdate }),
    );
  }

  await Promise.all(writeOps);
  syncGlobalPrompt(projectId).catch(() => {});

  return {
    characters: charCount,
    loreEntries: loreCount,
    styleCard: !!parsed.styleProfile,
    plotOutline: !!parsed.synopsis,
  };
}
