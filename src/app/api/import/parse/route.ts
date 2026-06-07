/**
 * POST /api/import/parse
 *
 * SSE 流式导入解析 —— Flash 双路并行：
 * 1. A路：V4 Flash 直接提取全部人物卡
 * 2. B路：V4 Flash 直接提取全部世界书 + 风格卡
 * 3. JSON 解析 + 去重
 *
 * 无 Scan 阶段、不分块。Flash 速度 ≈ Pro 的 1/3，两路并行 = 最慢那路 ≈ 15-30s
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getDefaultLLMConfig } from "@/core/llm/client";
import { countTokens } from "@/core/assembly/tokenizer";

export const maxDuration = 300;

// ─── 正则分章 ─────────────────────────────────────────────

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

// ─── 智能分块：按自然段边界，每块 ≤ 6000 字符 ──────────

const CHUNK_SIZE = 6000;

function smartChunk(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const paragraphs = text.split(/\n\n+/); // 按空行分自然段
  const raw: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if (buf && buf.length + p.length > CHUNK_SIZE) {
      raw.push(buf.trim());
      buf = p;
    } else {
      buf += (buf ? "\n\n" : "") + p;
    }
  }
  if (buf.trim()) raw.push(buf.trim());

  // 尾块太短 → 合并到前一块，不丢内容也不浪费 Flash 调用
  const chunks: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i].trim();
    if (!c) continue;
    // 短尾块（< 200 字且是最后一块）→ 并入上一块
    if (c.length < 200 && chunks.length > 0 && i === raw.length - 1) {
      chunks[chunks.length - 1] += "\n\n" + c;
    } else if (c.length >= 20) {
      chunks.push(c);
    }
    // < 20 字的中间块直接丢弃（不可能是正文内容）
  }
  return chunks.length > 0 ? chunks : [text];
}

// ─── 单路 Prompt（人物+词条+风格合并，减少 API 调用）──

function buildChunkPrompt(projectName: string, genre: string[], text: string, chunkNum: number, totalChunks: number): string {
  return `从以下小说文本中提取所有出场人物和世界观设定。这段是${chunkNum}/${totalChunks}块文本。

【作品】${projectName} | 类型：${genre.join("、")}

【文本——第${chunkNum}块】
${text}

【输出格式——纯JSON】
{
  "characters": [
    {
      "name": "姓名", "aliases": ["别名"], "role": "protagonist/antagonist/supporting/mentor/love_interest/background",
      "age": "年龄", "gender": "男/女/未知",
      "appearance": {"hair":"","eyes":"","height":"","build":"","features":"","attire":""},
      "personality": {"dominant":"","drive":"","contradiction":"","habits":[],"socialMask":""},
      "background": "", "abilities": [], "hiddenMotives": [],
      "relationships": [{"targetName":"","relation":"","dynamic":""}],
      "dialogueStyle": {"description":"","examples":[],"vocabulary":[],"speechPatterns":[]},
      "timeline": [{"age":0,"event":"","era":""}],
      "arcProgress": "", "currentStatus": "alive"
    }
  ],
  "lore": [
    {"title":"词条标题","category":"geography/faction/magic_system/history/culture/creature/item/custom","keys":["触发词"],"content":"设定详述","subFields":{}}
  ],
  "style": {
    "styleDescription": "文风描述", "povType": "third_person_limited", "narrativeDistance": "medium",
    "dialogueRatio": 0.35, "descriptionRatio": 0.25, "actionRatio": 0.25, "innerThoughtRatio": 0.15,
    "tonalMarkers": {}, "lexicalFeatures": {}, "sampleText": ""
  }
}

【规则】原文有的就填，没有的写"无"。有名字有描写的角色都提取，路人NPC不提取。只输出JSON。`;
}

const CHUNK_SYSTEM = "从小说文本中提取人物、世界观设定和文风。按JSON模板输出。原文有的填，没有的写'无'。只输出JSON。";

// ─── JS 去重合并（不调 Flash，秒级）─────────────────────

function mergeCharCards(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  // 互补合并：有值的覆盖空的/短的
  const pick = (aVal: unknown, bVal: unknown): unknown => {
    if (aVal === undefined || aVal === null || aVal === "" || aVal === "无" || aVal === "未知") return bVal;
    if (Array.isArray(aVal) && Array.isArray(bVal)) {
      const merged = [...aVal, ...bVal.filter(v => !aVal.includes(v))];
      return merged;
    }
    if (typeof aVal === "object" && aVal !== null && typeof bVal === "object" && bVal !== null) {
      return { ...(aVal as Record<string, unknown>), ...(bVal as Record<string, unknown>) };
    }
    // 字符串：选更长的
    if (typeof aVal === "string" && typeof bVal === "string" && bVal.length > aVal.length) return bVal;
    return aVal || bVal;
  };

  const merged: Record<string, unknown> = { ...a };
  for (const key of Object.keys(b)) {
    merged[key] = pick(a[key], b[key]);
  }
  return merged;
}

function mergeLoreCards(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const content = String(a.content || "") + (String(b.content || "") && !String(a.content || "").includes(String(b.content || "")) ? "\n" + String(b.content || "") : "");
  const keys = [...new Set([...(Array.isArray(a.keys) ? a.keys as string[] : []), ...(Array.isArray(b.keys) ? b.keys as string[] : [])])];
  const subFields = { ...(a.subFields as Record<string, unknown> || {}), ...(b.subFields as Record<string, unknown> || {}) };
  return { ...a, ...b, content, keys, subFields, title: a.title || b.title };
}

// ═══════════════════════════════════════════════════════════════
// JSON 解析降级
// ═══════════════════════════════════════════════════════════════

function parseJSON(raw: string): Record<string, unknown> {
  let s = raw.trim();
  try { return JSON.parse(s) as Record<string, unknown>; } catch { /* continue */ }
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) try { return JSON.parse(md[1].trim()) as Record<string, unknown>; } catch { /* continue */ }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) try { return JSON.parse(s.slice(a, b + 1)) as Record<string, unknown>; } catch { /* continue */ }
  throw new Error(`JSON解析失败。原始输出前500字：${s.slice(0, 500)}`);
}

// ═══════════════════════════════════════════════════════════════
// 标准化
// ═══════════════════════════════════════════════════════════════

function normChar(c: Record<string, unknown>): Record<string, unknown> {
  const p = c.personality;
  const personality = (typeof p === "object" && p !== null && !Array.isArray(p)) ? p : { dominant: "", drive: "", contradiction: "", habits: [], socialMask: "" };
  const bg = c.background;
  const background = typeof bg === "string" ? bg : (typeof bg === "object" && bg !== null ? JSON.stringify(bg) : "");
  const abilities = Array.isArray(c.abilities) ? c.abilities.filter((a: unknown) => typeof a === "string") : [];
  const abilityMeta = typeof c.abilityMeta === "string" ? c.abilityMeta : "";
  if (abilityMeta) abilities.push(abilityMeta);
  const arcProgress = typeof c.arcProgress === "string" ? c.arcProgress : "";
  const app = c.appearance;
  const appearance = (typeof app === "object" && app !== null && !Array.isArray(app)) ? app : {};
  const ds = c.dialogueStyle;
  const dialogueStyle = (typeof ds === "object" && ds !== null && !Array.isArray(ds)) ? ds : {};
  const rels = Array.isArray(c.relationships) ? c.relationships : [];
  const tags = Array.isArray(c.tags) ? c.tags.filter((t: unknown) => typeof t === "string") : ["📥导入"];
  const timeline = Array.isArray(c.timeline) ? c.timeline.map((t: unknown) => {
    if (typeof t === "object" && t !== null) {
      const tt = t as Record<string, unknown>;
      return { age: tt.age ?? 0, event: String(tt.event || ""), era: String(tt.era || "") };
    }
    return { age: 0, event: "", era: "" };
  }) : [];

  return {
    name: String(c.name || ""),
    aliases: Array.isArray(c.aliases) ? c.aliases.filter((a: unknown) => typeof a === "string") : [],
    role: String(c.role || "supporting"),
    age: String(c.age || "未知"),
    gender: String(c.gender || "未知"),
    appearance,
    personality,
    background,
    abilities,
    hiddenMotives: Array.isArray(c.hiddenMotives) ? c.hiddenMotives.filter((a: unknown) => typeof a === "string") : [],
    relationships: rels,
    dialogueStyle,
    timeline,
    arcProgress,
    currentStatus: String(c.currentStatus || "alive"),
    tags,
    abilityMeta: abilityMeta || undefined,
  };
}

function normLore(l: Record<string, unknown>): Record<string, unknown> {
  const subFields = (typeof l.subFields === "object" && l.subFields !== null && !Array.isArray(l.subFields)) ? l.subFields : {};
  return {
    title: String(l.title || ""),
    category: String(l.category || "custom"),
    keys: Array.isArray(l.keys) ? l.keys.filter((k: unknown) => typeof k === "string") : [String(l.title || "")],
    content: String(l.content || ""),
    subFields,
  };
}

// ═══════════════════════════════════════════════════════════════
// 通用 API 调用
// ═══════════════════════════════════════════════════════════════

interface APICallOpts {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  stream?: boolean;
  timeoutMs?: number;
  label: string;
  lane?: string;
}

interface APIResult {
  raw?: string;
  error?: string;
  reasoningLen?: number;
}

async function callLLM(
  config: ReturnType<typeof getDefaultLLMConfig>,
  opts: APICallOpts,
  send: (data: Record<string, unknown>) => void,
): Promise<APIResult> {
  const { model, systemPrompt, userPrompt, temperature = 0.15, stream = true, label, lane } = opts;

  try {
    const r = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        stream,
      }),
    });

    if (!r.ok) {
      const e = await r.text().catch(() => "");
      return { error: `HTTP ${r.status}: ${e.slice(0, 200)}` };
    }

    if (!stream) {
      const d = await r.json().catch(() => null);
      const raw = d?.choices?.[0]?.message?.content;
      return raw ? { raw } : { error: "非流式返回为空" };
    }

    // 流式读取
    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    let raw = "", lastReport = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6);
        if (jsonStr === "[DONE]") continue;
        try {
          const delta = JSON.parse(jsonStr)?.choices?.[0]?.delta;
          if (delta?.content) raw += delta.content;
        } catch { /* skip malformed chunks */ }
      }
      if (raw.length - lastReport >= 500) {
        lastReport = raw.length;
        send({
          type: "progress", stage: "streaming", lane: lane || "extract",
          message: `${label}：${raw.length}字符`,
        });
      }
    }
    // 流式完成后立刻通知
    send({
      type: "progress", stage: "received", lane: lane || "extract",
      message: `${label} 流式完成（${raw.length}字符），解析JSON...`,
    });
    return { raw: raw || undefined };
  } catch (e) {
    return { error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}

// ═══════════════════════════════════════════════════════════════
// POST —— 智能分块 + N 路并行 + 汇总合并
// ═══════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }
  const { projectId, rawText, volumeMode = true, importMode: userMode } = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const errors: string[] = [];

      try {
        if (!projectId || !rawText) {
          send({ type: "error", message: "缺少 projectId 或 rawText" }); controller.close(); return;
        }
        const text = rawText as string;
        if (text.length < 30) {
          send({ type: "error", message: "文本太短（最少30字）" }); controller.close(); return;
        }

        send({ type: "progress", stage: "connecting", message: "连接数据库..." });
        const project = await prisma.project.findUnique({ where: { id: projectId as string } });
        if (!project) { send({ type: "error", message: "项目不存在" }); controller.close(); return; }

        const chapters = segmentChapters(text, volumeMode as boolean);
        const realCh = chapters.filter(c => c.chapterTitle !== "导入文本");
        const detectedMode = SETTINGS_SIGNAL.test(text.slice(0, 3000)) && realCh.length === 0 ? "settings" : realCh.length > 0 ? "chapters" : "settings";
        const importMode = (userMode as string) || detectedMode;
        const config = getDefaultLLMConfig();
        const flashModel = "deepseek-ai/DeepSeek-V4-Flash";
        const textLen = text.length;
        const inputTokens = countTokens(text);

        // ── 分块 ──
        const chunks = smartChunk(text);
        const totalChunks = chunks.length;
        send({ type: "progress", stage: "segment", message: `文本：${textLen}字符 ≈ ${inputTokens} tokens → ${totalChunks}块（每块≤${CHUNK_SIZE}字）`, chunks: totalChunks, chapters: importMode === "settings" ? 0 : chapters.length });

        const totalStart = Date.now();

        // ════════════════════════════════════════════════════
        // N 路并行：每块 1 路 Flash（人物+词条+风格）
        // ════════════════════════════════════════════════════

        send({ type: "progress", stage: "extracting", message: `${totalChunks}块并行提取 → Flash 每块6000字快速扫描...`, chunk: 0, totalChunks });

        const extractStart = Date.now();
        let chunksDone = 0;

        const chunkResults = await Promise.all(
          chunks.map((chunk, i) =>
            callLLM(config, {
              model: flashModel,
              systemPrompt: CHUNK_SYSTEM,
              userPrompt: buildChunkPrompt(project.name, project.genre, chunk, i + 1, totalChunks),
              temperature: 0.1,
              stream: true,
              label: `块${i + 1}/${totalChunks}`,
              lane: `chunk-${i + 1}`,
            }, send).then(r => {
              chunksDone++;
              send({ type: "progress", stage: "chunk-done", message: `块${i + 1}/${totalChunks} 完成`, chunk: chunksDone, totalChunks });
              return { ...r, chunkIdx: i };
            })
          )
        );

        // 收集各块结果 → JS 去重（不调 Flash，秒级完成）
        const charsMap = new Map<string, Record<string, unknown>>();
        const loreMap = new Map<string, Record<string, unknown>>();
        let style: Record<string, unknown> = {};

        for (const r of chunkResults) {
          if (r.error) { errors.push(`块${r.chunkIdx + 1}: ${r.error}`); continue; }
          if (!r.raw) continue;
          try {
            const parsed = parseJSON(r.raw);
            const parsedChars = Array.isArray(parsed.characters) ? parsed.characters.map(normChar) : [];
            const parsedLore = Array.isArray(parsed.lore) ? parsed.lore.map(normLore) : [];
            send({ type: "progress", stage: "chunk-parsed", message: `块${r.chunkIdx + 1} 解析：${parsedChars.length}角色 ${parsedLore.length}词条` });

            // 按 name 去重合并角色（同名→信息互补）
            for (const ch of parsedChars) {
              const key = String((ch as Record<string, unknown>).name || "").toLowerCase();
              if (!key) continue;
              const existing = charsMap.get(key);
              if (existing) {
                // 合并：有值的覆盖空的
                charsMap.set(key, mergeCharCards(existing, ch as Record<string, unknown>));
              } else {
                charsMap.set(key, ch as Record<string, unknown>);
              }
            }

            // 按 title 去重合并词条
            for (const l of parsedLore) {
              const key = String((l as Record<string, unknown>).title || "").toLowerCase();
              if (!key) continue;
              const existing = loreMap.get(key);
              if (existing) {
                loreMap.set(key, mergeLoreCards(existing, l as Record<string, unknown>));
              } else {
                loreMap.set(key, l as Record<string, unknown>);
              }
            }

            // 风格卡：取第一个非空的
            if (Object.keys(style).length === 0 && typeof parsed.style === "object" && parsed.style !== null) {
              style = parsed.style as Record<string, unknown>;
            }
          } catch { errors.push(`块${r.chunkIdx + 1} JSON解析失败`); }
        }

        const chars = [...charsMap.values()];
        const lore = [...loreMap.values()];

        const extractTime = ((Date.now() - extractStart) / 1000).toFixed(1);
        const totalTime = ((Date.now() - totalStart) / 1000).toFixed(1);

        send({ type: "progress", stage: "merged", message: `JS去重完成：${chars.length}角色 ${lore.length}词条（${extractTime}s）` });

        const finalChapters = importMode === "settings" ? [] : chapters;
        send({
          type: "done",
          detectedChapters: finalChapters,
          extractedCharacters: chars,
          extractedLoreEntries: lore,
          extractedStyle: style,
          meta: {
            importMode, chapterCount: chapters.length, characterCount: chars.length, loreCount: lore.length,
            inputTokens, rawCharCount: textLen, modelUsed: flashModel,
            chunkCount: totalChunks, extractTimeSeconds: parseFloat(extractTime),
            totalTimeSeconds: parseFloat(totalTime),
            errors: errors.length > 0 ? errors : undefined,
          },
        });

      } catch (err) {
        send({ type: "error", message: (err instanceof Error ? err.message : String(err)) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
