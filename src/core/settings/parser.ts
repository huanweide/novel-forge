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
import { getDefaultClient, getDefaultLLMConfig } from "@/core/llm/client";

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
  category: "geography" | "faction" | "magic_system" | "history" | "culture" | "creature" | "item" | "custom";
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

【提取要求】
1. 角色卡：所有有名字的个体人物，从原文提取详细属性。缺信息的字段合理推断（参考同类型角色的常见设定），不填"未知"。
2. 世界卡：所有非人物的世界观概念，按category分类。每个词条给出触发关键词和重要性评分(0-100)。
3. 风格卡：从文本行文中推断写作风格特征。如果设定文本本身没有体现风格（纯大纲/列表），则根据题材推断。
4. synopsis：提取/概括主线剧情总纲。
5. toneKeywords：提取作品基调关键词数组。

【无上限提取】
- 角色数量无上限——有多少提取多少
- 世界词条无上限——不遗漏任何设定概念
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
  const llm = client || getDefaultClient();
  const config = getDefaultLLMConfig();

  const response = await llm.chat({
    model: config.architectModel,
    messages: [
      { role: "system", content: PARSE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `请解析以下小说设定文本，输出完整JSON（三卡+总纲+基调）：

${rawText}

输出格式示例：
{
  "characters": [
    {
      "name": "角色名",
      "aliases": ["别名"],
      "age": "年龄",
      "gender": "性别",
      "role": "protagonist|antagonist|supporting|mentor|love_interest|comic_relief|background",
      "appearance": {
        "hair": "发色",
        "eyes": "瞳色",
        "height": "身高",
        "build": "体型",
        "features": "特征",
        "attire": "穿着"
      },
      "personality": ["性格词1", "性格词2"],
      "dialogueDescription": "对话风格描述",
      "dialogueExamples": ["示例台词1"],
      "background": "背景故事简述",
      "hiddenMotives": ["隐藏动机"],
      "relations": [{"target": "其他角色名", "relation": "关系描述"}]
    }
  ],
  "loreEntries": [
    {
      "title": "词条名",
      "category": "geography|faction|magic_system|history|culture|creature|item|custom",
      "keys": ["触发词1", "触发词2"],
      "content": "设定内容描述",
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
    maxTokens: 16384, // 无上限提取——给足输出空间
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
      targetCharacterId: r.target,
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
