/**
 * AI 设定解析器 —— 把自由文本拆成结构化数据
 *
 * 这是"智能填表"的核心：用户贴一段设定文本（几万字都行），
 * 由 LLM 自动识别其中的角色信息和世界观条目，批量创建卡片。
 *
 * 设计思路：
 * - 不要求用户按格式写，什么风格都能吃
 * - 用 LLM 的结构化输出能力提取关键字段
 * - 返回的数据直接对应 CharacterCard 和 LorebookEntry 的创建参数
 */

import type { CharacterCard, LorebookEntry } from "@/core/types";
import type { LLMClient } from "@/core/llm/client";
import { getDefaultClient, getDefaultLLMConfig } from "@/core/llm/client";

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
  dialogueDescription: string;     // 对话风格描述
  dialogueExamples: string[];       // 示例台词
  background: string;
  hiddenMotives: string[];
  relations: { target: string; relation: string }[];  // 与其他角色的关系
}

export interface ParsedLoreEntry {
  title: string;
  category: "geography" | "faction" | "magic_system" | "history" | "culture" | "creature" | "item" | "custom";
  keys: string[];           // 触发关键词
  content: string;          // 设定内容
  insertionOrder: number;   // 重要性 0-100
}

export interface ParsedSettings {
  characters: ParsedCharacter[];
  loreEntries: ParsedLoreEntry[];
  synopsis: string;         // 提取的主线总纲
  toneKeywords: string[];   // 提取的基调关键词
}

// ─── 解析函数 ───────────────────────────────────────────────

const PARSE_SYSTEM_PROMPT = `你是一个专业的小说设定解析专家。你的任务是把用户提供的自由文本（可能是小说大纲、世界观设定、角色介绍等混在一起），提取出结构化的信息。

请仔细阅读文本，找出所有：
1. 角色信息（名字、性格、外貌、对话风格、关系网等）
2. 世界观设定（地理、势力、魔法体系、历史、种族、关键物品等）
3. 主线剧情总纲
4. 小说基调

对于每个角色，尽可能从原文中提取详细属性。如果原文没有明确提到某个属性，可以合理推断或标注"未知"。

对于世界观设定，请为每个条目分配：
- 触发关键词（文本中出现时会自动注入此设定的词）
- 分类（geography/faction/magic_system/history/culture/creature/item/custom）
- 重要性评分 0-100（越核心越高）

输出必须是严格的 JSON 格式，不要有任何额外说明文字。`;

/**
 * 解析设定文本
 *
 * @param rawText 用户粘贴的原始设定文本
 * @param client LLM客户端（可选，默认用环境变量配置的）
 */
export async function parseSettings(
  rawText: string,
  client?: LLMClient
): Promise<ParsedSettings> {
  const llm = client || getDefaultClient();
  const config = getDefaultLLMConfig();

  // 如果文本太长，用更好的模型来解析
  const response = await llm.chat({
    model: config.architectModel,
    messages: [
      { role: "system", content: PARSE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `请解析以下小说设定文本，输出 JSON：

${rawText}

输出格式示例：
{
  "characters": [
    {
      "name": "角色名",
      "aliases": ["别名"],
      "age": "年龄",
      "gender": "性别",
      "role": "protagonist|antagonist|supporting|mentor|love_interest|background",
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
      "dialogueExamples": ["示例台词1", "示例台词2"],
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
  "toneKeywords": ["基调词1", "基调词2"]
}

现在开始解析。`,
      },
    ],
    temperature: 0.3, // 低温保证格式一致
    maxTokens: 8192,
  });

  return parseResponse(response.content);
}

/**
 * 解析 LLM 返回的 JSON 字符串
 */
function parseResponse(raw: string): ParsedSettings {
  // 清除可能的 markdown 代码块标记
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

    // 容错：确保所有字段存在
    return {
      characters: (parsed.characters || []).map(normalizeCharacter),
      loreEntries: (parsed.loreEntries || []).map(normalizeLoreEntry),
      synopsis: parsed.synopsis || "",
      toneKeywords: parsed.toneKeywords || [],
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
    insertionOrder: l.insertionOrder || 50,
  };
}

/**
 * 从解析结果批量创建角色卡的前端请求参数
 */
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
      targetCharacterId: r.target, // 先存名字，后续UI可以手动关联
      relation: r.relation,
      dynamic: "",
      notes: "",
    })),
    currentStatus: "alive",
    tags: [],
  };
}

/**
 * 从解析结果批量创建世界书词条的前端请求参数
 */
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
