/**
 * POST /api/import/parse
 *
 * 智能导入解析 —— 内置深度分析框架：
 *   人物卡：外貌·性格·背景·能力·人际关系·人物弧光
 *   世界卡：世界观基石·势力版图·战斗体系·地理人文·历史暗线
 *   风格卡：语言风格·文笔文风·写作技术参数
 *
 * 支持三种模式 + >20K字分批 + 非推理模型加速。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getDefaultClient, getDefaultLLMConfig } from "@/core/llm/client";
import { countTokens } from "@/core/assembly/tokenizer";
import type { LLMClient } from "@/core/llm/client";

// ─── 正则分章 ──────────────────────────────────────────────

const VOLUME_PATTERN = /^\s*(第\s*[一二三四五六七八九十百千\d]+\s*卷)\s*(.*)/;
const CHAPTER_PATTERN = /^\s*(第\s*[一二三四五六七八九十百千\d]+\s*章|楔子|楔子|序章|序言|引子|引章|尾声|终章|番外|番外篇|序幕|幕间)\s*(.*)/;
const SECTION_PATTERN = /^\s*(第\s*[一二三四五六七八九十百千\d]+\s*[节話回])\s*(.*)/;
const SETTINGS_MARKERS = /角色[介绍设定说明]|人物[介绍设定说明]|世界[观设定说明]|能力[体系设定等级]|设定[书集]|背景[介绍说明故事]|势力[介绍说明]|规则[设定说明]/;

interface DetectedChapter {
  volumeTitle?: string; chapterTitle: string; order: number;
  content: string; wordCount: number; contentSnippet: string;
}
interface TextBatch { index: number; text: string; label: string; }

function splitIntoBatches(rawText: string, maxChars = 15000): TextBatch[] {
  if (rawText.length <= maxChars) return [{ index: 0, text: rawText, label: "全文" }];
  const batches: TextBatch[] = [];
  const blocks = rawText.split(/\n\n+/);
  let current = "", idx = 0;
  for (const block of blocks) {
    if (current.length + block.length > maxChars && current.length > 2000) {
      batches.push({ index: idx++, text: current.trim(), label: `第${idx}批` });
      current = block;
    } else { current += (current ? "\n\n" : "") + block; }
  }
  if (current.trim()) batches.push({ index: idx, text: current.trim(), label: `第${idx + 1}批` });
  return batches;
}

function segmentChapters(rawText: string, volumeMode: boolean): DetectedChapter[] {
  const lines = rawText.split(/\n/);
  const chapters: DetectedChapter[] = [];
  let vol = "", chTitle = "", buf: string[] = [], order = 0;
  const flush = () => {
    const c = buf.join("\n").trim();
    if (c.length < 10) { buf = []; return; }
    chapters.push({ volumeTitle: volumeMode && vol ? vol : undefined, chapterTitle: chTitle || `第${order + 1}章`, order: order++, content: c, wordCount: c.length, contentSnippet: c.slice(0, 100).replace(/\n/g, " ") });
    buf = [];
  };
  for (const l of lines) {
    const vm = l.match(VOLUME_PATTERN), cm = l.match(CHAPTER_PATTERN), sm = l.match(SECTION_PATTERN);
    if (vm && volumeMode) { if (buf.length > 0) flush(); vol = (vm[1] + (vm[2] ? " " + vm[2] : "")).trim(); chTitle = ""; }
    else if (cm || (sm && volumeMode)) { const m = cm || sm!; if (buf.length > 0) flush(); chTitle = (m[1] + (m[2] ? " " + m[2] : "")).trim(); }
    else { buf.push(l); }
  }
  if (buf.length > 0) flush();
  if (chapters.length === 0) chapters.push({ chapterTitle: "导入文本", order: 0, content: rawText.trim(), wordCount: rawText.trim().length, contentSnippet: rawText.trim().slice(0, 100) });
  return chapters;
}

function detectImportMode(rawText: string, chapterCount: number): "chapters" | "settings" | "auto" {
  if (SETTINGS_MARKERS.test(rawText.slice(0, 3000)) && chapterCount === 0) return "settings";
  if (chapterCount > 0 && !SETTINGS_MARKERS.test(rawText.slice(0, 3000))) return "chapters";
  return "auto";
}

// ═══════════════════════════════════════════════════════════════
// 核心：深度分析系统 Prompt（内置完整框架）
// ═══════════════════════════════════════════════════════════════

function buildSystemPrompt(): string {
  return `你是一位资深小说编辑和设定分析师。你的任务是将用户提供的文本（可能是世界观设定、角色档案、或叙事章节）转化为结构化的三卡数据。

═══ 核心原则 ═══
1. 穷尽原则：文本中出现的每一个角色、地点、组织、能力、物品都要提取
2. 深度原则：不止识别名字，要推断性格矛盾、隐藏动机、人际关系网
3. 合理推断：文本没说的，根据上下文合理推断；实在不确定的字段留空，不要瞎编
4. 防止OOC：推断必须基于文本依据，不得凭空赋予与文本质感不符的特征

输出纯 JSON，不要 markdown 标记。`;
}

function buildExtractionTemplate(): string {
  return `
═══ 输出 JSON 结构 ═══

{
  "characters": [
    {
      "name": "姓名",
      "aliases": ["别名", "称号"],
      "role": "protagonist/antagonist/supporting/mentor/love_interest/comic_relief/catalyst/background",
      "age": "年龄或年龄段",
      "gender": "性别",

      "appearance": {
        "hair": "发色发型",
        "eyes": "瞳色",
        "height": "身高",
        "build": "体型",
        "features": "特殊印记/疤痕/纹身",
        "attire": "标志性着装风格"
      },

      "personality": {
        "dominant": "主导人格（如：外冷内热、偏执机敏、豪爽粗犷）",
        "drive": "内在驱动力（渴望什么/恐惧什么/执念）",
        "contradiction": "性格矛盾点（如：极度自尊又渴望认可）",
        "habits": ["行为习惯", "口头禅"],
        "socialMask": "社交面具 vs 真实自我"
      },

      "background": {
        "origin": "出身/来历",
        "currentSituation": "此刻所在位置与境遇",
        "shortTermGoal": "当前短期目标",
        "longTermDesire": "长期欲望/终极目标"
      },

      "abilities": ["能力/功法/特长", "附带初期级别或成长路径"],

      "relationships": [
        {
          "targetName": "关联角色名",
          "relation": "关系（师徒/宿敌/暗恋/血仇）",
          "dynamic": "关系动态（从敌对逐渐转为信任）",
          "notes": "备注"
        }
      ],

      "hiddenMotives": ["隐藏动机"],
      "dialogueStyle": {
        "description": "说话风格概述",
        "examples": ["代表性台词"],
        "vocabulary": ["常用词汇"],
        "speechPatterns": ["句式特征"]
      },

      "arcPotential": "人物弧光预登记：可能发生的信念动摇、蜕变或堕落方向",
      "tags": ["自定义标签"]
    }
  ],

  "lore": [
    {
      "title": "词条名",
      "category": "geography/faction/magic_system/history/culture/creature/item/law/custom",

      "type": "基石/势力/战斗体系/地理/历史",

      "keys": ["触发关键词", "同义词", "简称", "别称"],

      "content": "设定详细内容",

      "subFields": {
        "eraAndTech": "时代与技术背景",
        "fundamentalLaw": "世界根本法则",
        "coreConflictSource": "核心冲突源",
        "factionDetails": "势力详情（纲领/首领/内部派系）",
        "factionRelations": "势力间明暗关系",
        "powerSystem": "力量体系树（境界/职业/异能分类+晋升条件与代价）",
        "combatLogic": "战斗逻辑（技巧至上/暴力碾压/规则博弈）",
        "rareResources": "稀有资源与传承方式",
        "geographyAndCulture": "关键地域风土禁忌与传说",
        "culturalImpact": "文化风俗对人物行为的影响",
        "historicalEvents": "影响当下的重大历史事件",
        "hiddenTruths": "被掩埋的真相与预言"
      },

      "insertionOrder": 50,
      "enabled": true
    }
  ],

  "style": {
    "language": {
      "baseTone": "底色调（冷峻/诙谐/华美/枯淡）",
      "sentenceFeature": "句式特征（长句意境/短句快打/骈散结合）",
      "eraLexicon": "时代感词库（禁用现代词/古风措辞/修辞偏好）"
    },
    "writingDensity": {
      "descriptionDensity": "描写密度（重白描动作/重心理潜流/环境氛围淹染）",
      "narrativeDistance": "叙事距离（紧贴人物感知/上帝远观/交替）",
      "imagerySystem": ["意象系统（如：剑、镜、雨、骨）"]
    },
    "technique": {
      "povType": "first_person/third_person_limited/third_person_omniscient",
      "infoRelease": "信息释放节奏（悬疑式剥茧/直给后展开/预言倒叙）",
      "dialogueStyle": "对话风格总述",
      "combatStyle": "打斗描写风格（写意/硬核拆招/法则对撞）"
    },
    "forbiddenPatterns": ["禁用词"],
    "styleDescription": "一句话概括文风",
    "sampleText": "代表性段落"
  }
}

═══ 字段填写规则 ═══

● 人物卡 personality 必须写成 JSON 对象（不是数组！），包含 dominant/drive/contradiction/habits/socialMask 五个子字段
● 人物卡 background 必须写成 JSON 对象（不是字符串！），包含 origin/currentSituation/shortTermGoal/longTermDesire
● 世界观词条的 subFields 根据 category 选填相关子字段，不相关的省略
● 人际关系 relationships 中 targetName 填写文本中提到过的其他角色名
● 所有推断字段如有不确定，标注 "（推断）" 前缀
● 实在无法推断的字段，填 null 或省略`;
}

// ─── 设定模式 Prompt ───────────────────────────────────────

function settingsBatchPrompt(
  projectName: string, genre: string[],
  batch: TextBatch, totalBatches: number
): string {
  const batchNote = totalBatches > 1
    ? `\n⚠️ 这是第 ${batch.index + 1}/${totalBatches} 批。只提取本批文本中出现的角色和设定。前面批次已提取的不要重复。`
    : "";

  return `【作品信息】
名称：${projectName}
类型：${genre.join("、")}
文本长度：约 ${batch.text.length} 字${batchNote}

【待分析设定文本】
${batch.text}

【分析步骤】
1. 通读全文，识别所有有名字的角色、地点、组织、能力体系、关键物品
2. 对每个角色，按模板字段逐一提取——文本有直接描述的用原文，没有的从上下文推断
3. 对每个世界观要素，判断其类型（基石/势力/战斗体系等），填充对应 subFields
4. 对文风做量化判断——如果文本是设定描述而非叙事章节，style 字段可留基础值

${buildExtractionTemplate()}

只输出 JSON。数量不设上限。`;
}

// ─── 章节模式 Prompt ────────────────────────────────────────

function chaptersPrompt(
  projectName: string, genre: string[],
  chapters: DetectedChapter[], volumeMode: boolean
): string {
  const samples = chapters.slice(0, 3).map(c => c.content).join("\n\n---\n\n");
  const rest = chapters.slice(3).map(c => `【${c.chapterTitle}】${c.content.slice(0, 500)}`).join("\n\n");
  const text = (samples + (rest ? "\n\n---\n\n" + rest : "")).slice(0, 16000);

  return `【作品信息】
名称：${projectName} | 类型：${genre.join("、")} | 已识别 ${chapters.length} 章

【章节目录】
${chapters.map(c => `- ${c.volumeTitle ? `[${c.volumeTitle}] ` : ""}${c.chapterTitle}`).join("\n")}

【叙事文本】
${text}

【分析步骤】
1. 从叙事中识别所有出场角色——从对白、行动、描写中提取
2. 通过角色的言行反推其性格（主导人格、驱动力、矛盾点）
3. 识别文本中暗示的世界观设定（地点、规则、势力、历史）
4. 从叙事笔触中量化文风特征

${buildExtractionTemplate()}

只输出 JSON。数量不设上限。`;
}

// ─── JSON 解析多策略降级 ──────────────────────────────────

function parseLLMJSON(raw: string): Record<string, unknown> {
  let s = raw.trim();
  // 1: 直接解析
  try { return JSON.parse(s) as Record<string, unknown>; } catch {}
  // 2: 剥离 markdown
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) { try { return JSON.parse(md[1].trim()) as Record<string, unknown>; } catch {} }
  // 3: 截取第一个 { 到最后一个 }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)) as Record<string, unknown>; } catch {} }
  // 4: 逐行过滤
  const filtered = s.split("\n").filter(l => /^\s*[{["]/.test(l) || /[}\]]\s*$/.test(l));
  try { return JSON.parse(filtered.join("\n")) as Record<string, unknown>; } catch {}
  throw new Error("无法解析 LLM 输出为 JSON");
}

// ─── 合并分批结果 ──────────────────────────────────────────

function mergeBatchResults(all: Array<{ characters: Record<string, unknown>[]; lore: Record<string, unknown>[] }>) {
  const seenC = new Set<string>(), seenL = new Set<string>();
  const chars: Record<string, unknown>[] = [], lore: Record<string, unknown>[] = [];
  for (const b of all) {
    for (const c of (b.characters || [])) {
      const k = String(c.name || "").toLowerCase();
      if (k && !seenC.has(k)) { seenC.add(k); chars.push(c); }
    }
    for (const l of (b.lore || [])) {
      const k = String(l.title || "").toLowerCase();
      if (k && !seenL.has(k)) { seenL.add(k); lore.push(l); }
    }
  }
  return { chars, lore };
}

// ─── 调用 LLM ──────────────────────────────────────────────

async function analyzeBatch(
  client: LLMClient, model: string,
  userPrompt: string
): Promise<{ characters: Record<string, unknown>[]; lore: Record<string, unknown>[]; style: Record<string, unknown> }> {
  const resp = await client.chat({
    model,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.4, // 略微升温，促进合理推断
    maxTokens: 16384,
  });
  const parsed = parseLLMJSON(resp.content);
  return {
    characters: Array.isArray(parsed.characters) ? parsed.characters : [],
    lore: Array.isArray(parsed.lore) ? parsed.lore : [],
    style: (parsed.style || {}) as Record<string, unknown>,
  };
}

// ─── 标准化 ────────────────────────────────────────────────

function normalizeCharacter(c: Record<string, unknown>): Record<string, unknown> {
  // 处理 personality：可能是对象或数组，统一为结构化对象
  const rawPersonality = c.personality;
  let personality: Record<string, unknown>;
  if (typeof rawPersonality === "object" && rawPersonality !== null && !Array.isArray(rawPersonality)) {
    personality = rawPersonality as Record<string, unknown>;
  } else if (Array.isArray(rawPersonality)) {
    // 旧格式兼容：数组转对象
    personality = { dominant: (rawPersonality as string[]).join("、"), drive: "", contradiction: "", habits: [], socialMask: "" };
  } else {
    personality = { dominant: "", drive: "", contradiction: "", habits: [], socialMask: "" };
  }

  // 处理 background：可能是对象或字符串
  const rawBg = c.background;
  let background: Record<string, unknown>;
  if (typeof rawBg === "object" && rawBg !== null && !Array.isArray(rawBg)) {
    background = rawBg as Record<string, unknown>;
  } else {
    background = { origin: "", currentSituation: "", shortTermGoal: "", longTermDesire: "" };
  }

  return {
    name: String(c.name || ""),
    aliases: Array.isArray(c.aliases) ? c.aliases.filter((a: unknown) => typeof a === "string") : [],
    role: String(c.role || "supporting"),
    age: String(c.age || "未知"),
    gender: String(c.gender || "未知"),
    appearance: (typeof c.appearance === "object" && c.appearance !== null && !Array.isArray(c.appearance))
      ? c.appearance : { hair: "", eyes: "", height: "", build: "", features: "", attire: "" },
    personality,
    background,
    abilities: Array.isArray(c.abilities) ? c.abilities.filter((a: unknown) => typeof a === "string") : [],
    relationships: Array.isArray(c.relationships) ? c.relationships : [],
    hiddenMotives: Array.isArray(c.hiddenMotives) ? c.hiddenMotives.filter((a: unknown) => typeof a === "string") : [],
    dialogueStyle: (typeof c.dialogueStyle === "object" && c.dialogueStyle !== null && !Array.isArray(c.dialogueStyle))
      ? c.dialogueStyle : { description: "", examples: [], vocabulary: [], speechPatterns: [] },
    arcPotential: String(c.arcPotential || ""),
    tags: Array.isArray(c.tags) ? c.tags.filter((a: unknown) => typeof a === "string") : [],
    currentStatus: String(c.currentStatus || "alive"),
  };
}

function normalizeLore(l: Record<string, unknown>): Record<string, unknown> {
  return {
    title: String(l.title || ""),
    category: String(l.category || "custom"),
    type: String(l.type || ""),
    keys: Array.isArray(l.keys) ? l.keys.filter((k: unknown) => typeof k === "string") : [String(l.title || "")],
    content: String(l.content || ""),
    subFields: (typeof l.subFields === "object" && l.subFields !== null && !Array.isArray(l.subFields))
      ? l.subFields : {},
    insertionOrder: Number(l.insertionOrder) || 50,
    enabled: l.enabled !== false,
  };
}

// ═══════════════════════════════════════════════════════════════
// POST 处理器
// ═══════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, rawText, volumeMode = true, importMode: userMode } = body;

    if (!projectId || !rawText) return NextResponse.json({ error: "缺少 projectId 或 rawText" }, { status: 400 });
    if (rawText.length < 30) return NextResponse.json({ error: "文本太短（最少30字）" }, { status: 400 });

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

    const chapters = segmentChapters(rawText, volumeMode);
    const realChapters = chapters.filter(c => c.chapterTitle !== "导入文本");
    const detectedMode = detectImportMode(rawText, realChapters.length);
    const importMode = userMode || detectedMode;

    const config = getDefaultLLMConfig();
    const extractorModel = config.extractorModel || config.writerModel;
    const client = getDefaultClient();

    let allChars: Record<string, unknown>[] = [];
    let allLore: Record<string, unknown>[] = [];
    let finalStyle: Record<string, unknown> = {};

    if (importMode === "settings" || importMode === "auto") {
      const batches = splitIntoBatches(rawText, 15000);
      const batchResults: Array<{ characters: Record<string, unknown>[]; lore: Record<string, unknown>[] }> = [];

      for (const batch of batches) {
        try {
          const prompt = settingsBatchPrompt(project.name, project.genre, batch, batches.length);
          const r = await analyzeBatch(client, extractorModel, prompt);
          batchResults.push(r);
          allChars.push(...(r.characters || []));
          allLore.push(...(r.lore || []));
          if (Object.keys(finalStyle).length === 0 && r.style && Object.keys(r.style).length > 0) {
            finalStyle = r.style;
          }
        } catch (err) {
          console.error(`批次${batch.index + 1}失败:`, String(err).slice(0, 200));
        }
      }

      if (batches.length > 1) {
        const merged = mergeBatchResults(batchResults);
        allChars = merged.chars;
        allLore = merged.lore;
      }
    } else {
      try {
        const prompt = chaptersPrompt(project.name, project.genre, chapters, volumeMode);
        const r = await analyzeBatch(client, extractorModel, prompt);
        allChars = r.characters || [];
        allLore = r.lore || [];
        finalStyle = r.style || {};
      } catch (err) {
        console.error("章节分析失败:", String(err).slice(0, 200));
      }
    }

    const normalizedChars = allChars.map(normalizeCharacter);
    const normalizedLore = allLore.map(normalizeLore);
    const inputTokens = countTokens(rawText);

    return NextResponse.json({
      detectedChapters: importMode === "settings" ? [] : chapters,
      extractedCharacters: normalizedChars,
      extractedLoreEntries: normalizedLore,
      extractedStyle: finalStyle,
      meta: {
        importMode,
        chapterCount: chapters.length,
        characterCount: normalizedChars.length,
        loreCount: normalizedLore.length,
        inputTokens,
        volumeMode,
        rawCharCount: rawText.length,
        batchesUsed: importMode !== "chapters" ? Math.ceil(rawText.length / 15000) : 1,
        modelUsed: extractorModel,
      },
    });
  } catch (err) {
    console.error("导入解析失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "导入解析失败" },
      { status: 500 }
    );
  }
}
