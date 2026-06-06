/**
 * POST /api/import/parse
 *
 * SSE 流式导入解析 —— 一次调用 V4 Pro，实时推送进度。
 * 不拆分、不设上限、不超时焦虑。
 */

export const maxDuration = 60;

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getDefaultLLMConfig } from "@/core/llm/client";
import { countTokens } from "@/core/assembly/tokenizer";

// ─── 正则分章（仅章节模式用）─────────────────────────────

const VOL_PAT = /^\s*(第\s*[一二三四五六七八九十百千\d]+\s*卷)\s*(.*)/;
const CH_PAT = /^\s*(第\s*[一二三四五六七八九十百千\d]+\s*章|楔子|序章|序言|引子|尾声|终章|番外|番外篇|序幕|幕间)\s*(.*)/;
const SETTINGS_SIGNAL = /角色[介绍设定说明档案]|人物[介绍设定说明档案卡]|世界[观设定说明背景]|能力[体系设定等级列表]|设定[书集说明]|势力[介绍说明分布]|规则[设定说明]/;

interface DetectedChapter {
  volumeTitle?: string; chapterTitle: string; order: number;
  content: string; wordCount: number; contentSnippet: string;
}

function segmentChapters(rawText: string, volumeMode: boolean): DetectedChapter[] {
  const lines = rawText.split(/\n/);
  const chapters: DetectedChapter[] = [];
  let vol = "", cht = "", buf: string[] = [], order = 0;
  const flush = () => {
    const c = buf.join("\n").trim();
    if (c.length < 10) { buf = []; return; }
    chapters.push({ volumeTitle: volumeMode && vol ? vol : undefined, chapterTitle: cht || `第${order + 1}章`, order: order++, content: c, wordCount: c.length, contentSnippet: c.slice(0, 100).replace(/\n/g, " ") });
    buf = [];
  };
  for (const l of lines) {
    const vm = l.match(VOL_PAT), cm = l.match(CH_PAT);
    if (vm && volumeMode) { if (buf.length > 0) flush(); vol = (vm[1] + (vm[2] ? " " + vm[2] : "")).trim(); cht = ""; }
    else if (cm) { if (buf.length > 0) flush(); cht = (cm[1] + (cm[2] ? " " + cm[2] : "")).trim(); }
    else { buf.push(l); }
  }
  if (buf.length > 0) flush();
  return chapters.length > 0 ? chapters : [{ chapterTitle: "导入文本", order: 0, content: rawText.trim(), wordCount: rawText.trim().length, contentSnippet: rawText.trim().slice(0, 100) }];
}

// ─── 分析 Prompt（精华版，保留完整框架但省 Token）──────

function buildPrompt(projectName: string, genre: string[], text: string, mode: string): string {
  const isSettings = mode === "settings";
  const header = isSettings
    ? `【任务】穷尽分析以下设定文本中的全部角色、世界观和文风。数量无上限。\n【作品】${projectName} | ${genre.join("、")} | 文本约${text.length}字`
    : `【任务】穷尽分析以下小说文本中的全部角色、世界观和文风。\n【作品】${projectName} | ${genre.join("、")}`;

  return `${header}

【文本】
${text}

【输出格式——纯JSON，不设数量上限】
{
  "characters": [{
    "name":"","aliases":[],"role":"protagonist/antagonist/supporting/mentor/love_interest/background","age":"","gender":"",
    "appearance":{"hair":"","eyes":"","height":"","build":"","features":"","attire":""},
    "personality":{"dominant":"主导人格","drive":"驱动力","contradiction":"性格矛盾","habits":[],"socialMask":""},
    "background":{"origin":"出身","currentSituation":"境遇","shortTermGoal":"短期目标","longTermDesire":"终极欲望"},
    "abilities":[],"hiddenMotives":[],
    "relationships":[{"targetName":"","relation":"","dynamic":""}],
    "dialogueStyle":{"description":"","examples":[],"vocabulary":[],"speechPatterns":[]},
    "arcPotential":""
  }],
  "lore": [{
    "title":"","category":"geography/faction/magic_system/history/culture/creature/item/custom",
    "keys":["触发词+同义词+简称"],"content":"设定详述",
    "subFields":{"eraAndTech":"","fundamentalLaw":"","powerSystem":"","factionDetails":"","geographyAndCulture":"","historicalEvents":"","hiddenTruths":""}
  }],
  "style": {
    "styleDescription":"","forbiddenPatterns":[],"povType":"third_person_limited",
    "dialogueRatio":0.3,"descriptionRatio":0.3,"actionRatio":0.25
  }
}

规则：
- 每个角色、每个设定都要提取，不设上限
- personality和background必须是对象格式（不是数组/字符串）
- 有原文用原文，没有的推断，推断不了的填null
- 字段宁可填null也不要省略
- 只输出JSON，不要markdown`;

  return header;
}

function buildSystemPrompt(): string {
  return `你是小说设定分析引擎。穷尽提取文本中所有角色/世界观/文风，只输出纯JSON。personality和background必须是JSON对象格式。推断标注"（推断）"。`;
}

// ─── JSON 解析降级 ──────────────────────────────────────

function parseJSON(raw: string): Record<string, unknown> {
  let s = raw.trim();
  try { return JSON.parse(s) as Record<string, unknown>; } catch {}
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) try { return JSON.parse(md[1].trim()) as Record<string, unknown>; } catch {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) try { return JSON.parse(s.slice(a, b + 1)) as Record<string, unknown>; } catch {}
  throw new Error("JSON解析失败");
}

// ─── 标准化 ──────────────────────────────────────────────

function normChar(c: Record<string, unknown>): Record<string, unknown> {
  const p = c.personality;
  const personality = (typeof p === "object" && p !== null && !Array.isArray(p)) ? p : { dominant: "", drive: "", contradiction: "", habits: [], socialMask: "" };
  const b = c.background;
  const background = (typeof b === "object" && b !== null && !Array.isArray(b)) ? b : { origin: "", currentSituation: "", shortTermGoal: "", longTermDesire: "" };
  return {
    name: String(c.name || ""),
    aliases: Array.isArray(c.aliases) ? c.aliases.filter((a: unknown) => typeof a === "string") : [],
    role: String(c.role || "supporting"), age: String(c.age || "未知"), gender: String(c.gender || "未知"),
    appearance: (typeof c.appearance === "object" && c.appearance !== null && !Array.isArray(c.appearance)) ? c.appearance : {},
    personality, background,
    abilities: Array.isArray(c.abilities) ? c.abilities.filter((a: unknown) => typeof a === "string") : [],
    hiddenMotives: Array.isArray(c.hiddenMotives) ? c.hiddenMotives.filter((a: unknown) => typeof a === "string") : [],
    relationships: Array.isArray(c.relationships) ? c.relationships : [],
    dialogueStyle: (typeof c.dialogueStyle === "object" && c.dialogueStyle !== null && !Array.isArray(c.dialogueStyle)) ? c.dialogueStyle : {},
    arcPotential: String(c.arcPotential || ""), tags: Array.isArray(c.tags) ? c.tags.filter((a: unknown) => typeof a === "string") : [],
  };
}

function normLore(l: Record<string, unknown>): Record<string, unknown> {
  return {
    title: String(l.title || ""), category: String(l.category || "custom"),
    keys: Array.isArray(l.keys) ? l.keys.filter((k: unknown) => typeof k === "string") : [String(l.title || "")],
    content: String(l.content || ""),
    subFields: (typeof l.subFields === "object" && l.subFields !== null && !Array.isArray(l.subFields)) ? l.subFields : {},
  };
}

// ═══════════════════════════════════════════════════════════════
// POST —— SSE 流式进度
// ═══════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }
  const { projectId, rawText, volumeMode = true, importMode: userMode } = body;

  // 所有错误都走 SSE，防止客户端卡在"连接中"
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // ── 校验 ──
        if (!projectId || !rawText) {
          send({ type: "error", message: "缺少 projectId 或 rawText" }); controller.close(); return;
        }
        const text = rawText as string;
        if (text.length < 30) {
          send({ type: "error", message: "文本太短（最少30字）" }); controller.close(); return;
        }

        // ── 加载项目 ──
        send({ type: "progress", stage: "connecting", message: "正在连接数据库..." });
        const project = await prisma.project.findUnique({ where: { id: projectId as string } });
        if (!project) {
          send({ type: "error", message: "项目不存在，请先创建项目" }); controller.close(); return;
        }

        // ── 分章 ──
        const chapters = segmentChapters(text, volumeMode as boolean);
        const realCh = chapters.filter(c => c.chapterTitle !== "导入文本");
        const detectedMode = SETTINGS_SIGNAL.test(text.slice(0, 3000)) && realCh.length === 0 ? "settings" : realCh.length > 0 ? "chapters" : "settings";
        const importMode = (userMode as string) || detectedMode;
        const config = getDefaultLLMConfig();
        const model = "deepseek-ai/DeepSeek-V4-Pro";
        const textLen = text.length;
        const inputTokens = countTokens(text);

        send({ type: "progress", stage: "segment", message: `文本拆分完成：${chapters.length}个章节块，${textLen}字符`, chapters: importMode === "settings" ? 0 : chapters.length });
        send({ type: "progress", stage: "sending", message: `正在调用 DeepSeek V4 Pro（约${(inputTokens / 1000).toFixed(1)}K tokens）...` });

        // ── 调用 V4 Pro ──
        const prompt = buildPrompt(project.name, project.genre, text as string, importMode);
        send({ type: "progress", stage: "analyzing", message: "V4 Pro 正在深度分析文本——抽取角色、世界观、文风..." });

        const llmStart = Date.now();
        const abortCtrl = new AbortController();
        const timeoutId = setTimeout(() => abortCtrl.abort(), 300000);

        let resp: Response;
        try {
          resp = await fetch(`${config.baseURL}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
            body: JSON.stringify({ model, messages: [{ role: "system", content: buildSystemPrompt() }, { role: "user", content: prompt }], temperature: 0.25, max_tokens: 16384, stream: false }),
            signal: abortCtrl.signal,
          });
        } catch (fetchErr: unknown) {
          clearTimeout(timeoutId);
          const msg = (fetchErr as Error)?.name === "AbortError" ? `API调用超时（>5分钟）。${textLen}字文本V4 Pro未能在300秒内完成，建议减少文本量` : `网络请求失败: ${String(fetchErr).slice(0, 300)}`;
          send({ type: "error", message: msg }); controller.close(); return;
        }
        clearTimeout(timeoutId);

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "无法读取错误响应");
          send({ type: "error", message: `API返回错误 ${resp.status}: ${errText.slice(0, 400)}` }); controller.close(); return;
        }

        const llmTime = ((Date.now() - llmStart) / 1000).toFixed(1);
        send({ type: "progress", stage: "received", message: `V4 Pro 分析完成（耗时${llmTime}秒），正在解析结果...` });

        const data = await resp.json().catch(() => null);
        if (!data?.choices?.[0]?.message?.content) {
          send({ type: "error", message: `API返回空内容。响应: ${JSON.stringify(data).slice(0, 300)}` }); controller.close(); return;
        }

        const content: string = data.choices[0].message.content;
        send({ type: "progress", stage: "received", message: `收到回复（约${content.length}字符），正在解析...` });

        // ── 解析 JSON ──
        const parsed = parseJSON(content);
        const chars = Array.isArray(parsed.characters) ? parsed.characters.map(normChar) : [];
        const lore = Array.isArray(parsed.lore) ? parsed.lore.map(normLore) : [];
        const style = (typeof parsed.style === "object" && parsed.style !== null) ? parsed.style : {};

        send({ type: "progress", stage: "parsing", message: `解析完成：${chars.length}个角色，${lore.length}个词条` });
        send({ type: "done", detectedChapters: importMode === "settings" ? [] : chapters, extractedCharacters: chars, extractedLoreEntries: lore, extractedStyle: style, meta: { importMode, chapterCount: chapters.length, characterCount: chars.length, loreCount: lore.length, inputTokens, rawCharCount: textLen, modelUsed: model, llmTimeSeconds: parseFloat(llmTime), outputLength: content.length } });

      } catch (err) {
        // 外层兜底：JSON解析失败等所有未预料的错误
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
