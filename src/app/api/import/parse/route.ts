/**
 * POST /api/import/parse
 *
 * 智能导入解析 —— 正则分章 + LLM 三卡抽取。
 * 支持三种模式：章节正文 / 设定文本 / 自动检测
 *
 * 请求体：
 * {
 *   projectId: string;
 *   rawText: string;
 *   volumeMode?: boolean;     // 是否启用分卷识别
 *   importMode?: "auto" | "chapters" | "settings";  // 导入模式
 * }
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getDefaultClient } from "@/core/llm/client";
import { countTokens } from "@/core/assembly/tokenizer";

// ─── 正则状态机：中文分章分卷 ──────────────────────────────

const VOLUME_PATTERN = /^\s*(第\s*[一二三四五六七八九十百千\d]+\s*卷)\s*(.*)/;
const CHAPTER_PATTERN = /^\s*(第\s*[一二三四五六七八九十百千\d]+\s*章|楔子|楔子|序章|序言|引子|引章|尾声|终章|番外|番外篇|序幕|幕间)\s*(.*)/;
const SECTION_PATTERN = /^\s*(第\s*[一二三四五六七八九十百千\d]+\s*[节話回])\s*(.*)/;

// 设定文本的标记特征（用于自动检测模式）
const SETTINGS_MARKERS = /角色[介绍设定说明]|人物[介绍设定说明]|世界[观设定说明]|设定[书集]|背景[介绍说明]|势力[介绍说明]|能力[体系设定]|规则[设定说明]/;

interface DetectedChapter {
  volumeTitle?: string;
  chapterTitle: string;
  order: number;
  content: string;
  wordCount: number;
  contentSnippet: string;
}

function segmentChapters(rawText: string, volumeMode: boolean): DetectedChapter[] {
  const lines = rawText.split(/\n/);
  const chapters: DetectedChapter[] = [];
  let currentVolume = "";
  let currentChapterTitle = "";
  let currentContent: string[] = [];
  let order = 0;

  function flushChapter() {
    const content = currentContent.join("\n").trim();
    if (content.length < 10) {
      currentContent = [];
      return;
    }
    chapters.push({
      volumeTitle: volumeMode && currentVolume ? currentVolume : undefined,
      chapterTitle: currentChapterTitle || `第${order + 1}章`,
      order: order++,
      content,
      wordCount: content.length,
      contentSnippet: content.slice(0, 100).replace(/\n/g, " "),
    });
    currentContent = [];
  }

  for (const line of lines) {
    const volMatch = line.match(VOLUME_PATTERN);
    const chMatch = line.match(CHAPTER_PATTERN);
    const secMatch = line.match(SECTION_PATTERN);

    if (volMatch && volumeMode) {
      if (currentContent.length > 0) flushChapter();
      currentVolume = (volMatch[1] + (volMatch[2] ? " " + volMatch[2] : "")).trim();
      currentChapterTitle = "";
    } else if (chMatch || (secMatch && volumeMode)) {
      const match = chMatch || secMatch!;
      if (currentContent.length > 0) flushChapter();
      currentChapterTitle = (match[1] + (match[2] ? " " + match[2] : "")).trim();
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0) flushChapter();

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

/**
 * 自动检测文本类型：
 * - 如果能识别到章节标记 → "chapters"
 * - 如果全是设定/角色/世界描述 → "settings"
 * - 都有 → "auto"（两阶段分析）
 */
function detectImportMode(rawText: string, chapterCount: number): "chapters" | "settings" | "auto" {
  const hasChapters = chapterCount > 0;
  const hasSettings = SETTINGS_MARKERS.test(rawText.slice(0, 3000));

  if (hasChapters && !hasSettings) return "chapters";
  if (!hasChapters && hasSettings) return "settings";
  if (hasChapters && hasSettings) return "auto";
  // 都没有明确特征 → 按章节处理（可能是纯叙事文本）
  return "chapters";
}

// ─── 设定模式 Prompt：全量抽取，不设上限 ─────────────────

function buildSettingsExtractionPrompt(
  projectName: string,
  genre: string[],
  fullText: string
): string {
  return `【任务】从以下小说设定文本中，全部提取所有角色、世界观词条和文风要求。不设数量上限——文本里提到多少就提取多少。

【作品信息】
名称：${projectName}
类型：${genre.join("、")}

【设定文本（全量）】
${fullText}

【提取要求——数量无上限，穷尽文本中的每一个设定】

1. characters[]: 文本中出现的每一个角色，哪怕只提了一句名字也要录入：
   - name, aliases, role (protagonist/antagonist/supporting/mentor/love_interest/background/comic_relief/catalyst)
   - age, gender
   - personality: 性格关键词数组，能推断多少写多少
   - appearance: { hair, eyes, height, build, features, attire }
   - background: 角色背景简述
   - dialogueStyle: { description, examples: [代表性台词], vocabulary: [常用词], speechPatterns: [说话习惯] }
   - hiddenMotives: 隐藏动机数组
   - currentStatus: 当前状态 (alive/dead/missing/incapacitated)

2. lore[]: 文本中的每一个世界观设定——地名、组织、魔法/能力体系、历史事件、文化规则、物品、法则，全部提取：
   - title, category (geography/faction/magic_system/history/culture/creature/item/law/custom)
   - keys: 触发关键词数组，生成最容易在写作中被提到的词（含同义词、简称、别称）
   - content: 设定内容概述

3. style: 如果文本中包含文风/写作要求，提取：
   - styleDescription: 文风描述
   - forbiddenPatterns: 禁用词/句式列表
   - recommendedStyle: 推荐的写作风格要点

输出纯 JSON，不要 markdown 标记。格式：
{"characters": [...], "lore": [...], "style": {...}}`;
}

// ─── 章节模式 Prompt：原版逻辑 ──────────────────────────

function buildChapterExtractionPrompt(
  projectName: string,
  genre: string[],
  chapters: DetectedChapter[],
  volumeMode: boolean
): string {
  // 前3章全文 + 其余各取前500字
  const samples = chapters.slice(0, 3).map((c) => c.content).join("\n\n---\n\n");
  const snippets = chapters.slice(3).map((c) =>
    `【${c.chapterTitle}】${c.content.slice(0, 500)}`
  ).join("\n\n");
  const allText = samples + (snippets ? "\n\n---\n\n" + snippets : "");

  // 增加到 16000 字输入
  const truncatedText = allText.length > 16000 ? allText.slice(0, 16000) + "\n\n[...后续已截断]" : allText;

  return `【任务】从以下小说文本中，全部提取所有角色、世界观设定和文风特征。不设数量上限——文本中出现的每一个角色、每一个地点/组织/设定，都要提取。

【作品信息】
名称：${projectName}
类型：${genre.join("、")}
已识别章节：${chapters.length}

【章节目录】
${chapters.map((c) => `- ${c.volumeTitle ? `[${c.volumeTitle}] ` : ""}${c.chapterTitle} (${c.wordCount}字)`).join("\n")}

【文本内容】
${truncatedText}

【提取要求——穷尽所有的】

1. characters[]: 文本中出现的每一个角色：
   - name, aliases, role, age, gender
   - personality: 性格关键词(从行为推断)
   - appearance: { hair, eyes, height, build, features, attire }
   - background: 角色背景
   - dialogueStyle: { description, examples: [代表性台词], vocabulary, speechPatterns }
   - hiddenMotives: 隐藏动机

2. lore[]: 所有的地点、组织、能力体系、历史事件、文化规则、关键物品：
   - title, category, keys: [触发关键词+同义词+简称], content

3. style: 文风量化：
   - avgSentenceLength, shortSentenceRatio, longSentenceRatio
   - dialogueRatio, descriptionRatio, actionRatio, innerThoughtRatio
   - povType, narrativeDistance
   - tonalMarkers: {coldness, satire, tragedy, humor, warmth, suspense, grandeur}
   - lexicalFeatures: {classicalRatio, modernRatio, termDensity, idiomsDensity}
   - styleDescription, sampleText

输出纯 JSON，不要 markdown 标记。`;
}

// ─── 混合模式（auto）：两阶段分析 ───────────────────────

function buildHybridExtractionPrompt(
  projectName: string,
  genre: string[],
  chapters: DetectedChapter[],
  volumeMode: boolean
): string {
  // 把前半段文本（可能是设定）和后半段（可能是章节）都送进去
  const halfIdx = Math.max(1, Math.floor(chapters.length / 2));
  const firstHalf = chapters.slice(0, halfIdx).map((c) => `【${c.chapterTitle}】\n${c.content.slice(0, 2000)}`).join("\n\n");
  const secondHalf = chapters.slice(halfIdx).map((c) => `【${c.chapterTitle}】\n${c.content.slice(0, 800)}`).join("\n\n");

  return `【任务】从以下小说文本中，穷尽提取所有角色、世界观设定和文风特征。文本可能混合了设定描述和叙事章节。

【作品信息】
名称：${projectName}
类型：${genre.join("、")}

【文本前半段（可能是设定/背景描述）】
${firstHalf}

【文本后半段（可能是叙事章节）】
${secondHalf}

【提取要求——不设数量上限】

1. characters[]: 所有角色
2. lore[]: 所有世界观设定
3. style: 文风量化分析

输出纯 JSON。`;
}

// ─── System Prompts ──────────────────────────────────────

function buildSystemPrompt(mode: "chapters" | "settings" | "auto"): string {
  const base = `你是专业的小说结构化分析引擎。唯一任务是从文本中提取角色、世界观和文风信息。

核心原则：
- 穷尽原则：文本中出现的每一个角色、每一个地点、每一个设定都要提取，不管多小
- 数量不设上限：输出尽可能多的条目。不要因为"够了"就停止
- 推断但不编造：如果文本提到"她是剑宗掌门"，可以推断性格"威严""护短"，但不要凭空编造没提到的角色
- 自动生成触发词：每个词条生成 4-8 个关键词，包含同义词、简称、别称

只输出 JSON，不要任何额外文字。`;

  if (mode === "settings") {
    return base + `\n\n当前是设定文本分析模式。文本不包含叙事章节，只有世界观描述、角色设定、势力介绍等。请逐段扫描，把每一个被提到名字的实体都提取出来。`;
  }

  return base;
}

// ─── POST 处理器 ──────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, rawText, volumeMode = true, importMode: userMode } = body;

    if (!projectId || !rawText) {
      return NextResponse.json(
        { error: "缺少 projectId 或 rawText" },
        { status: 400 }
      );
    }

    if (rawText.length < 30) {
      return NextResponse.json(
        { error: "文本太短（最少30字），无法分析" },
        { status: 400 }
      );
    }

    // 加载项目信息
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    // Step 1: 正则分章
    const chapters = segmentChapters(rawText, volumeMode);

    // Step 2: 确定导入模式
    const detectedMode = detectImportMode(rawText, chapters.filter(c => c.chapterTitle !== "导入文本").length);
    const importMode = userMode || detectedMode;

    // Step 3: 根据模式构建 Prompt
    const client = getDefaultClient();
    const model = (project.llmConfig as Record<string, unknown>)?.architectModel as string || "deepseek-ai/DeepSeek-V4-Pro";

    let extractionPrompt: string;
    let maxTokens: number;

    if (importMode === "settings") {
      // 设定模式：全量文本 + 大Token输出
      extractionPrompt = buildSettingsExtractionPrompt(
        project.name,
        project.genre,
        rawText.length > 20000 ? rawText.slice(0, 20000) : rawText
      );
      maxTokens = 16384;
    } else if (importMode === "auto") {
      extractionPrompt = buildHybridExtractionPrompt(
        project.name, project.genre, chapters, volumeMode
      );
      maxTokens = 16384;
    } else {
      extractionPrompt = buildChapterExtractionPrompt(
        project.name, project.genre, chapters, volumeMode
      );
      maxTokens = 12288;
    }

    const response = await client.chat({
      model,
      messages: [
        { role: "system", content: buildSystemPrompt(importMode) },
        { role: "user", content: extractionPrompt },
      ],
      temperature: 0.2,
      maxTokens,
    });

    // 解析 JSON
    let extracted: {
      characters: Record<string, unknown>[];
      lore: Record<string, unknown>[];
      style: Record<string, unknown>;
    } = { characters: [], lore: [], style: {} };

    try {
      let jsonStr = response.content.trim();
      // 剥离 markdown 代码块
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();
      extracted = JSON.parse(jsonStr);
    } catch (err) {
      console.warn("LLM 三卡抽取 JSON 解析失败:", String(err).slice(0, 200));
      // 尝试截断后重试
      try {
        let jsonStr = response.content.trim();
        // 有时候 JSON 后面有额外文本，尝试截断到最后一个 }
        const lastBrace = jsonStr.lastIndexOf("}");
        if (lastBrace > 0) {
          jsonStr = jsonStr.slice(0, lastBrace + 1);
          extracted = JSON.parse(jsonStr);
        }
      } catch {
        // 彻底失败，返回空
      }
    }

    const inputTokens = countTokens(extractionPrompt);
    const charCount = (extracted.characters || []).length;
    const loreCount = (extracted.lore || []).length;

    return NextResponse.json({
      detectedChapters: importMode === "settings" ? [] : chapters,
      extractedCharacters: (extracted.characters || []).map((c) => ({
        ...c,
        personality: (c.personality as string[]) || [],
        aliases: (c.aliases as string[]) || [],
        hiddenMotives: (c.hiddenMotives as string[]) || [],
        appearance: (c.appearance as Record<string, unknown>) || { hair: "未知", eyes: "未知", height: "未知", build: "未知", features: "", attire: "" },
        dialogueStyle: (c.dialogueStyle as Record<string, unknown>) || { description: "", examples: [], vocabulary: [], speechPatterns: [] },
        role: (c.role as string) || "supporting",
        age: (c.age as string) || "未知",
        gender: (c.gender as string) || "未知",
        background: (c.background as string) || "",
      })),
      extractedLoreEntries: (extracted.lore || []).map((l) => ({
        ...l,
        keys: (l.keys as string[]) || [],
        category: (l.category as string) || "custom",
        content: (l.content as string) || "",
      })),
      extractedStyle: (extracted.style || {}) as Record<string, unknown>,
      meta: {
        importMode,
        chapterCount: chapters.length,
        characterCount: charCount,
        loreCount: loreCount,
        inputTokens,
        volumeMode,
        rawCharCount: rawText.length,
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
