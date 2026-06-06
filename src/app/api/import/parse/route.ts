/**
 * POST /api/import/parse
 *
 * 智能导入解析 —— 内置深度分析框架。
 * 支持三种模式 + 大文本分批 + 非推理模型加速。
 */

export const maxDuration = 60; // Vercel Hobby 上限

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

function splitIntoBatches(rawText: string, maxChars = 8000): TextBatch[] {
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
  return `你是小说设定分析引擎。穷尽提取文本中所有角色/世界观/文风信息，只输出纯 JSON。

规则：
1. 每个角色/设定都要提取，不设上限
2. 字段尽可能填满——有原文用原文，没原文从上下文推断，推断不了的留 null
3. 推断必须基于文本证据，不瞎编`;
}

function buildExtractionTemplate(): string {
  return `
【输出格式】
{
  "characters": [{
    "name":"", "aliases":[], "role":"protagonist/antagonist/supporting/mentor/love_interest/background",
    "age":"", "gender":"",
    "appearance":{"hair":"","eyes":"","height":"","build":"","features":"","attire":""},
    "personality":{"dominant":"","drive":"","contradiction":"","habits":[],"socialMask":""},
    "background":{"origin":"","currentSituation":"","shortTermGoal":"","longTermDesire":""},
    "abilities":[], "hiddenMotives":[],
    "relationships":[{"targetName":"","relation":"","dynamic":"","notes":""}],
    "dialogueStyle":{"description":"","examples":[],"vocabulary":[],"speechPatterns":[]},
    "arcPotential":"", "tags":[]
  }],
  "lore": [{
    "title":"", "category":"geography/faction/magic_system/history/culture/creature/item/custom",
    "keys":["触发词+同义词+简称"],
    "content":"详细设定",
    "subFields":{"eraAndTech":"","fundamentalLaw":"","powerSystem":"","factionDetails":"","geographyAndCulture":"","historicalEvents":"","hiddenTruths":""}
  }],
  "style": {
    "styleDescription":"",
    "forbiddenPatterns":[],
    "povType":"third_person_limited",
    "dialogueRatio":0.3, "descriptionRatio":0.3, "actionRatio":0.25
  }
}
- personality 和 background 必须是对象格式
- 不确定的字段填 null，不要省略
- 推断字段前缀加"（推断）"`;
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
    temperature: 0.35,
    maxTokens: 8192,
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

    const batchErrors: string[] = [];

    if (importMode === "settings" || importMode === "auto") {
      const batches = splitIntoBatches(rawText, 8000);
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
          const msg = `批次${batch.index + 1}/${batches.length} 失败: ${String(err).slice(0, 150)}`;
          console.error(msg);
          batchErrors.push(msg);
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
        batchesUsed: importMode !== "chapters" ? Math.ceil(rawText.length / 8000) : 1,
        batchErrors: batchErrors.length > 0 ? batchErrors : undefined,
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
