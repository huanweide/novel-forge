/**
 * POST /api/import/parse
 *
 * 智能导入解析 —— 正则分章 + LLM 三卡抽取。
 *
 * 支持三种模式：章节正文 / 设定文本 / 自动检测
 * >20K字文本自动分批处理，避免超时。
 * 使用非推理模型（extractorModel）加速。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   rawText: string;
 *   volumeMode?: boolean;
 *   importMode?: "auto" | "chapters" | "settings";
 * }
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
  volumeTitle?: string;
  chapterTitle: string;
  order: number;
  content: string;
  wordCount: number;
  contentSnippet: string;
}

// ─── 分批文本 ──────────────────────────────────────────────

interface TextBatch {
  index: number;
  text: string;
  label: string;
}

/**
 * 将长文本按设定小节或自然段落切成 N 批。
 * 每批约 15000 字，保证 LLM 输出不超限。
 */
function splitIntoBatches(rawText: string, maxCharsPerBatch = 15000): TextBatch[] {
  if (rawText.length <= maxCharsPerBatch) {
    return [{ index: 0, text: rawText, label: "全文" }];
  }

  const batches: TextBatch[] = [];
  // 按双换行分块，尽量保持语义完整
  const blocks = rawText.split(/\n\n+/);
  let current = "";
  let batchIdx = 0;

  for (const block of blocks) {
    if (current.length + block.length > maxCharsPerBatch && current.length > 2000) {
      batches.push({ index: batchIdx++, text: current.trim(), label: `第${batchIdx}批` });
      current = block;
    } else {
      current += (current ? "\n\n" : "") + block;
    }
  }
  if (current.trim()) {
    batches.push({ index: batchIdx, text: current.trim(), label: `第${batchIdx + 1}批` });
  }

  return batches;
}

function segmentChapters(rawText: string, volumeMode: boolean): DetectedChapter[] {
  const lines = rawText.split(/\n/);
  const chapters: DetectedChapter[] = [];
  let currentVolume = "";
  let currentChapterTitle = "";
  let currentContent: string[] = [];
  let order = 0;

  const flush = () => {
    const content = currentContent.join("\n").trim();
    if (content.length < 10) { currentContent = []; return; }
    chapters.push({
      volumeTitle: volumeMode && currentVolume ? currentVolume : undefined,
      chapterTitle: currentChapterTitle || `第${order + 1}章`,
      order: order++,
      content,
      wordCount: content.length,
      contentSnippet: content.slice(0, 100).replace(/\n/g, " "),
    });
    currentContent = [];
  };

  for (const line of lines) {
    const vm = line.match(VOLUME_PATTERN);
    const cm = line.match(CHAPTER_PATTERN);
    const sm = line.match(SECTION_PATTERN);

    if (vm && volumeMode) {
      if (currentContent.length > 0) flush();
      currentVolume = (vm[1] + (vm[2] ? " " + vm[2] : "")).trim();
      currentChapterTitle = "";
    } else if (cm || (sm && volumeMode)) {
      const m = cm || sm!;
      if (currentContent.length > 0) flush();
      currentChapterTitle = (m[1] + (m[2] ? " " + m[2] : "")).trim();
    } else {
      currentContent.push(line);
    }
  }
  if (currentContent.length > 0) flush();

  if (chapters.length === 0) {
    chapters.push({
      chapterTitle: "导入文本",
      order: 0,
      content: rawText.trim(),
      wordCount: rawText.trim().length,
      contentSnippet: rawText.trim().slice(0, 100),
    });
  }
  return chapters;
}

function detectImportMode(rawText: string, chapterCount: number): "chapters" | "settings" | "auto" {
  const hasChapters = chapterCount > 0;
  const hasSettings = SETTINGS_MARKERS.test(rawText.slice(0, 3000));
  if (hasChapters && !hasSettings) return "chapters";
  if (!hasChapters && hasSettings) return "settings";
  if (hasChapters && hasSettings) return "auto";
  return "chapters";
}

// ─── Prompt 模板 ────────────────────────────────────────────

function settingsBatchPrompt(projectName: string, genre: string[], batch: TextBatch, totalBatches: number): string {
  const batchNote = totalBatches > 1
    ? `\n【分批信息】这是第 ${batch.index + 1}/${totalBatches} 批。请只提取本批文本中出现的角色和设定。前面批次已提取的不要重复。`
    : "";

  return `【任务】穷尽提取下面设定文本中的所有角色、世界观词条和文风信息。数量不设上限。

【作品】${projectName} | 类型：${genre.join("、")}${batchNote}

【文本-${batch.label}】
${batch.text}

【提取格式——灵活版】
输出 JSON，字段可有可无，有多少写多少。唯一要求：能用 JSON.parse 解析。

{
  "characters": [
    {
      "name": "角色名",
      "aliases": ["别名"],
      "role": "protagonist/antagonist/supporting/mentor/love_interest/background",
      "age": "年龄描述",
      "gender": "性别",
      "personality": ["性格标签"],
      "appearance": {"hair":"","eyes":"","height":"","build":"","features":"","attire":""},
      "abilities": ["能力/技能"],
      "background": "背景简述",
      "dialogueStyle": {"description":"","examples":[],"vocabulary":[],"speechPatterns":[]},
      "hiddenMotives": ["隐藏动机"]
    }
  ],
  "lore": [
    {
      "title": "词条名",
      "category": "geography/faction/magic_system/history/culture/creature/item/law/custom",
      "keys": ["触发关键词(含同义词简称别称)"],
      "content": "设定内容"
    }
  ],
  "style": {
    "styleDescription": "一句话文风概括",
    "forbiddenPatterns": ["禁用词"],
    "recommendedStyle": "推荐风格要点",
    "avgSentenceLength": 25,
    "dialogueRatio": 0.3,
    "povType": "third_person_limited"
  }
}

注意：characters[] 和 lore[] 可以是空数组。如果有角色或设定，尽量提取。只输出 JSON，不要 markdown。`;
}

function chaptersPrompt(projectName: string, genre: string[], chapters: DetectedChapter[], volumeMode: boolean): string {
  const samples = chapters.slice(0, 3).map((c) => c.content).join("\n\n---\n\n");
  const rest = chapters.slice(3).map((c) => `【${c.chapterTitle}】${c.content.slice(0, 500)}`).join("\n\n");
  const text = (samples + (rest ? "\n\n---\n\n" + rest : "")).slice(0, 16000);

  return `【任务】从以下小说文本中穷尽提取所有角色和世界观设定。

【作品】${projectName} | ${genre.join("、")} | ${chapters.length}章

${chapters.map((c) => `- ${c.volumeTitle ? `[${c.volumeTitle}] ` : ""}${c.chapterTitle}`).join("\n")}

【文本】
${text}

【输出格式】同设定模式。纯 JSON，不设数量上限。`;
}

// ─── 合并分批结果 ──────────────────────────────────────────

function mergeBatchResults(all: Array<{ characters: Record<string, unknown>[]; lore: Record<string, unknown>[] }>) {
  const seenChars = new Set<string>();
  const seenLore = new Set<string>();
  const characters: Record<string, unknown>[] = [];
  const lore: Record<string, unknown>[] = [];

  for (const batch of all) {
    for (const c of (batch.characters || [])) {
      const key = String(c.name || "").toLowerCase();
      if (key && !seenChars.has(key)) {
        seenChars.add(key);
        characters.push(c);
      }
    }
    for (const l of (batch.lore || [])) {
      const key = String(l.title || "").toLowerCase();
      if (key && !seenLore.has(key)) {
        seenLore.add(key);
        lore.push(l);
      }
    }
  }

  return { characters, lore, dedupedChars: all.flatMap(b => b.characters || []).length - characters.length, dedupedLore: all.flatMap(b => b.lore || []).length - lore.length };
}

// ─── JSON 解析（多策略） ──────────────────────────────────

function parseLLMJSON(raw: string): Record<string, unknown> {
  let jsonStr = raw.trim();

  // 策略1: 直接解析
  try { return JSON.parse(jsonStr) as Record<string, unknown>; } catch {}

  // 策略2: 剥离 markdown 代码块
  const md = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) {
    try { return JSON.parse(md[1].trim()) as Record<string, unknown>; } catch {}
  }

  // 策略3: 截取第一个 { 到最后一个 }
  const start = jsonStr.indexOf("{");
  const end = jsonStr.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(jsonStr.slice(start, end + 1)) as Record<string, unknown>; } catch {}
  }

  // 策略4: 逐行提取（跳过非 JSON 前缀）
  const lines = jsonStr.split("\n");
  const filtered = lines.filter(l => /^\s*[{["]/.test(l) || /[}\]]\s*$/.test(l));
  try { return JSON.parse(filtered.join("\n")) as Record<string, unknown>; } catch {}

  throw new Error("无法解析 LLM 输出为 JSON");
}

// ─── 调用 LLM 分析 ───────────────────────────────────────

async function analyzeBatch(
  client: LLMClient,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ characters: Record<string, unknown>[]; lore: Record<string, unknown>[]; style: Record<string, unknown> }> {
  const response = await client.chat({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    maxTokens: 16384,
  });

  const parsed = parseLLMJSON(response.content);
  return {
    characters: Array.isArray(parsed.characters) ? parsed.characters : [],
    lore: Array.isArray(parsed.lore) ? parsed.lore : [],
    style: (parsed.style || {}) as Record<string, unknown>,
  };
}

// ─── POST 处理器 ──────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, rawText, volumeMode = true, importMode: userMode } = body;

    if (!projectId || !rawText) {
      return NextResponse.json({ error: "缺少 projectId 或 rawText" }, { status: 400 });
    }
    if (rawText.length < 30) {
      return NextResponse.json({ error: "文本太短（最少30字）" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

    // ─── 分章 + 检测模式 ───
    const chapters = segmentChapters(rawText, volumeMode);
    const realChapters = chapters.filter(c => c.chapterTitle !== "导入文本");
    const detectedMode = detectImportMode(rawText, realChapters.length);
    const importMode = userMode || detectedMode;

    // ─── 选模型（非推理模型，快 5 倍） ───
    const config = getDefaultLLMConfig();
    const extractorModel = config.extractorModel || config.writerModel;
    const client = getDefaultClient();

    const systemPrompt = `你是专业小说设定提取引擎。穷尽原则：文本中每一个角色、地点、组织、能力、物品都要提取。数量不设上限。只输出 JSON。`;

    // ─── 分批处理 ───
    let allCharacters: Record<string, unknown>[] = [];
    let allLore: Record<string, unknown>[] = [];
    let finalStyle: Record<string, unknown> = {};

    if (importMode === "settings") {
      // 设定模式：按 15000 字一批拆分
      const batches = splitIntoBatches(rawText, 15000);
      const batchResults = [];

      for (const batch of batches) {
        try {
          const prompt = settingsBatchPrompt(project.name, project.genre, batch, batches.length);
          const r = await analyzeBatch(client, extractorModel, systemPrompt, prompt);
          batchResults.push(r);
          allCharacters.push(...(r.characters || []));
          allLore.push(...(r.lore || []));
          if (!finalStyle || Object.keys(finalStyle).length === 0) {
            finalStyle = r.style;
          }
        } catch (err) {
          console.error(`批次 ${batch.index + 1} 分析失败:`, String(err).slice(0, 200));
          // 一批失败不影响其他批
        }
      }

      // 去重合并
      if (batches.length > 1) {
        const merged = mergeBatchResults(batchResults);
        allCharacters = merged.characters;
        allLore = merged.lore;
      }
    } else {
      // 章节模式：单次分析
      try {
        const userPrompt = chaptersPrompt(project.name, project.genre, chapters, volumeMode);
        const r = await analyzeBatch(client, extractorModel, systemPrompt, userPrompt);
        allCharacters = r.characters || [];
        allLore = r.lore || [];
        finalStyle = r.style;
      } catch (err) {
        console.error("章节分析失败:", String(err).slice(0, 200));
      }
    }

    // ─── 标准化输出 ───
    const normalizedChars = allCharacters.map((c) => ({
      ...c,
      personality: Array.isArray(c.personality) ? c.personality : (typeof c.personality === "string" ? [c.personality] : []),
      aliases: Array.isArray(c.aliases) ? c.aliases : (c.aliases ? [String(c.aliases)] : []),
      abilities: Array.isArray(c.abilities) ? c.abilities : (c.abilities ? [String(c.abilities)] : []),
      hiddenMotives: Array.isArray(c.hiddenMotives) ? c.hiddenMotives : (c.hiddenMotives ? [String(c.hiddenMotives)] : []),
      appearance: (typeof c.appearance === "object" && c.appearance !== null) ? c.appearance : { hair: "", eyes: "", height: "", build: "", features: "", attire: "" },
      dialogueStyle: (typeof c.dialogueStyle === "object" && c.dialogueStyle !== null) ? c.dialogueStyle : { description: "", examples: [], vocabulary: [], speechPatterns: [] },
      role: String(c.role || "supporting"),
      age: String(c.age || "未知"),
      gender: String(c.gender || "未知"),
      background: String(c.background || ""),
    }));

    const normalizedLore = allLore.map((l) => ({
      ...l,
      keys: Array.isArray(l.keys) ? l.keys.filter((k: unknown) => typeof k === "string") : (l.title ? [String(l.title)] : []),
      category: String(l.category || "custom"),
      content: String(l.content || ""),
      title: String(l.title || ""),
    }));

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
        batchesUsed: importMode === "settings" ? Math.ceil(rawText.length / 15000) : 1,
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
