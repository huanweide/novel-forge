/**
 * POST /api/import/parse
 *
 * AI 解析导入——人物提取 + 世界设定 + 文风。
 * 角色≥30个自动分块处理，每块独立调 Flash，杜绝 token 截断。
 * JSON 修复层——去尾逗号等 AI 常见语法错误。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getSettings } from "@/lib/llm";
import { countTokens } from "@/core/assembly/tokenizer";
import { THREE_CARD_BOUNDARIES } from "@/core/settings";

export const maxDuration = 300;

const CHUNK_SIZE = 30; // 每块最多30个角色

// ─── JSON 修复 + 解析 ──────────────────────────────

/** 清洗 AI 常见 JSON 语法错误 */
function repairJSON(raw: string): string {
  let s = raw.trim();
  // BOM
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  // 去掉 markdown 代码块
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) s = md[1].trim();
  // 截取最外层花括号
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);

  // 去尾逗号：},] 和 ,] 和 ,}
  s = s.replace(/,(\s*[}\]])/g, "$1");
  // 去尾逗号在数组末尾：...]\n 之后多余的逗号
  // 修字符串内的未转义换行符（AI有时在字符串值里直接换行）
  // 注：这个比较激进，只在 JSON.parse 失败后才尝试

  return s;
}

function parseJSON(raw: string): Record<string, unknown> {
  // 第一轮：标准修复
  let s = repairJSON(raw);
  try { return JSON.parse(s) as Record<string, unknown>; } catch { /* */ }

  // 第二轮：更激进的修复——尝试补全截断的JSON
  // 如果JSON在中间被截断（maxTokens限制），补上闭合括号
  try {
    // 数花括号和方括号，补上缺失的闭合
    let braces = 0, brackets = 0;
    let inString = false, escape = false;
    for (const ch of s) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"' && !escape) { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') braces++;
      if (ch === '}') braces--;
      if (ch === '[') brackets++;
      if (ch === ']') brackets--;
    }
    // 补闭合
    while (brackets > 0) { s += ']'; brackets--; }
    while (braces > 0) { s += '}'; braces--; }
    // 如果数组未结束，补]
    if (s.endsWith(',')) s = s.slice(0, -1);

    return JSON.parse(s) as Record<string, unknown>;
  } catch { /* */ }

  throw new Error(`JSON parse fail: ${s.slice(0, 200)}`);
}

function normChar(c: Record<string, unknown>): Record<string, unknown> {
  const p = c.personality;
  const personality = (typeof p === "object" && p !== null && !Array.isArray(p)) ? p : { dominant: "", drive: "", contradiction: "", habits: [], socialMask: "" };
  const app = c.appearance;
  const appearance = (typeof app === "object" && app !== null && !Array.isArray(app)) ? app : {};
  const ds = c.dialogueStyle;
  const dialogueStyle = (typeof ds === "object" && ds !== null && !Array.isArray(ds)) ? ds : {};
  const timeline = Array.isArray(c.timeline) ? c.timeline.map((t: unknown) => {
    if (typeof t === "object" && t !== null) {
      const tt = t as Record<string, unknown>;
      return { age: tt.age ?? 0, event: String(tt.event || ""), era: String(tt.era || "") };
    }
    return { age: 0, event: "", era: "" };
  }) : [];
  return {
    name: String(c.name || ""), aliases: Array.isArray(c.aliases) ? c.aliases.filter((a: unknown) => typeof a === "string") : [],
    role: String(c.role || "supporting"), age: String(c.age || "未知"), gender: String(c.gender || "未知"),
    appearance, personality,
    background: typeof c.background === "string" ? c.background : (typeof c.background === "object" && c.background !== null ? JSON.stringify(c.background) : ""),
    abilities: Array.isArray(c.abilities) ? c.abilities.filter((a: unknown) => typeof a === "string") : [],
    hiddenMotives: Array.isArray(c.hiddenMotives) ? c.hiddenMotives.filter((a: unknown) => typeof a === "string") : [],
    relationships: Array.isArray(c.relationships) ? c.relationships : [],
    dialogueStyle, timeline, arcProgress: String(c.arcProgress || ""), currentStatus: String(c.currentStatus || "alive"),
    tags: Array.isArray(c.tags) ? c.tags.filter((t: unknown) => typeof t === "string") : ["📥导入"],
  };
}

function normLore(l: Record<string, unknown>): Record<string, unknown> {
  return { title: String(l.title || ""), category: String(l.category || "custom"), keys: Array.isArray(l.keys) ? l.keys.filter((k: unknown) => typeof k === "string") : [String(l.title || "")], content: String(l.content || ""), subFields: (typeof l.subFields === "object" && l.subFields !== null && !Array.isArray(l.subFields)) ? l.subFields : {} };
}

// ─── 角色边界扫描 ──────────────────────────────

/** 用正则找出文本中所有角色编号行的位置，返回 {startIndex, endIndex}[] */
function findCharBlocks(text: string): Array<{ start: number; end: number; headerLine: string }> {
  const NUM = [
    "\\d+", "[一二三四五六七八九十百]+", "第[一二三四五六七八九十百]+[位名个]?",
    "[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]", "[（(]\\d+[）)]",
  ].join("|");
  const HEADER_RE = new RegExp(`^\\s*(?:#{1,3}\\s*)?\\s*(${NUM})[.、．，)\\)\\s:：·\\-—]+\\s*(.+)$`, "gm");

  const blocks: Array<{ start: number; end: number; headerLine: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = HEADER_RE.exec(text)) !== null) {
    const name = match[2].trim().slice(0, 40);
    // 过滤明显不是人名的行
    if (name.length < 2 || /^(第|章|节|卷|部|篇)/.test(name)) continue;
    blocks.push({ start: match.index, end: match.index + match[0].length, headerLine: match[0] });
  }

  // 计算每个角色的文本范围（从这个编号行到下一个编号行之前）
  const ranges: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < blocks.length; i++) {
    const blockStart = blocks[i].start;
    const blockEnd = i + 1 < blocks.length ? blocks[i + 1].start : text.length;
    ranges.push({ start: blockStart, end: blockEnd });
  }
  return blocks;
}

/** 将角色范围分成每 CHUNK_SIZE 个一块的文本片段 */
function chunkText(text: string, blocks: ReturnType<typeof findCharBlocks>): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
    const startBlock = blocks[i];
    const endIdx = i + CHUNK_SIZE < blocks.length ? blocks[i + CHUNK_SIZE].start : text.length;
    // 包含这个块之前的少量上下文
    const ctxStart = Math.max(0, startBlock.start - 50);
    chunks.push(text.slice(ctxStart, endIdx));
  }
  return chunks;
}

// ─── API 调用 ──────────────────────────────────

interface CallConfig { baseURL: string; apiKey: string; model: string; label: string; }

async function callFlash(cfg: CallConfig, systemPrompt: string, userPrompt: string, maxTokens: number): Promise<{ raw: string; error?: string; sec: number }> {
  if (!cfg.apiKey || cfg.apiKey.length < 10) {
    return { raw: "", error: `${cfg.label}: API Key 未配置`, sec: 0 };
  }

  const t0 = Date.now();
  try {
    const url = cfg.baseURL.endsWith("/v1") ? `${cfg.baseURL}/chat/completions` : `${cfg.baseURL}/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.1, max_tokens: maxTokens, stream: false }),
    });

    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    if (!res.ok) { const eb = await res.text().catch(() => ""); return { raw: "", error: `${cfg.label} HTTP ${res.status}: ${eb.slice(0, 200)}`, sec: parseFloat(sec) }; }
    const data = await res.json().catch(() => null);
    const raw = data?.choices?.[0]?.message?.content || "";
    if (!raw || raw.trim().length < 20) return { raw: "", error: `${cfg.label} 返回空内容`, sec: parseFloat(sec) };
    return { raw, sec: parseFloat(sec) };
  } catch (e) {
    return { raw: "", error: `${cfg.label} ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`, sec: ((Date.now() - t0) / 1000).toFixed(1) as any };
  }
}

// ═══════════════════════════════════════════════
// POST
// ═══════════════════════════════════════════════

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }
  const { projectId, rawText, volumeMode, importMode: userMode, charactersOnly } = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        if (!projectId || !rawText) { send({ type: "error", message: "缺少 projectId 或 rawText" }); controller.close(); return; }
        const text = (rawText as string).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        if (text.length < 30) { send({ type: "error", message: "文本太短" }); controller.close(); return; }

        send({ type: "progress", stage: "init", message: "连接数据库...", pct: 1 });
        const project = await prisma.project.findUnique({ where: { id: projectId as string } });
        if (!project) { send({ type: "error", message: "项目不存在" }); controller.close(); return; }

        const importMode = (userMode as string) || "settings";
        const pName = project.name;
        const pGenre = project.genre;
        const isCharOnly = charactersOnly === true;

        const settings = await getSettings();
        const dsKey = settings.apiKey || process.env.LLM_API_KEY || "";
        const { model, baseUrl } = settings;
        const dsConfigA: CallConfig = { baseURL: baseUrl, apiKey: dsKey, model, label: "LLM" };
        const dsConfigB: CallConfig = { baseURL: baseUrl, apiKey: dsKey, model, label: "LLM" };

        send({ type: "progress", stage: "ready", message: `${text.length.toLocaleString()} 字 · ${isCharOnly ? "仅人物卡" : "人物+世界"}`, pct: 3 });

        const t0 = Date.now();

        // ── 正则预扫描角色数量 ──
        const charBlocks = findCharBlocks(text);
        const estimatedCount = charBlocks.length;

        send({ type: "progress", stage: "scan", message: `🔍 正则预扫描: ~${estimatedCount}个角色编号行`, pct: 4 });

        // ── 分块决策 ──
        const needsChunking = estimatedCount > CHUNK_SIZE;

        // ── 人物提取Prompt模板 ──
        const charSystemPrompt = "角色提取器。编号→人名→全字段提取：外貌、性格、能力、关系、对话风格，每个字段都填满。只输出JSON。";
        const buildCharPrompt = (chunkText: string, chunkInfo = "") => `你是角色提取器。找编号 → 抓人名 → 从原文提取全字段信息。禁止留空。${chunkInfo}

【识别角色行——宽泛匹配所有编号格式】
Markdown标题也认——# / ## / ### 是格式标记，跳过它看后面的编号。
纯文本编号：阿拉伯"1.""2、""3 ""1）""(2)""①"、中文数字"一、""二、""三 "、中文序数"第一位 ""第二，"

【提取规则——每个字段都要从原文找信息填满】
name = 编号后的人名核心部分，去掉——及之后的修饰
background = 从编号行开始到下一个编号行之前，全部内容原封不动搬进去（原文照抄不缩写）
role = 从以下选：protagonist/antagonist/supporting/mentor/love_interest/background，默认supporting

【以下字段——从background和其他原文描述中提取，禁止填"未知"或留空】
- age: 从原文找年龄线索，没有则根据角色定位推断（主角一般16-25岁，师傅一般40+）
- gender: 从名字/代词/描述推断
- appearance: 从外貌描写提取 hair/eyes/height/build/features/attire，没描写则根据角色定位推断
- personality: 从行为/对话/描述中提炼 dominant(主导性格)/drive(核心驱动)/contradiction(内在矛盾)/habits(习惯)/socialMask(社交面具)
- abilities: 从能力/技能描述中逐条提取，格式"能力名·等级·一句话描述"
- relationships: 从关系描述中提取 targetName/relation/dynamic
- dialogueStyle: 从对话示例中提炼 description/examples/vocabulary/speechPatterns
- hiddenMotives: 从背景中推断隐藏动机
- timeline: 从背景中提取年龄+事件节点
- aliases: 从别名/称号中提取
- tags: 固定["📥导入"]

【作品信息】
名称：${pName} · 类型：${pGenre.join("、")}

【文本】
${chunkText}

{"characters":[{"name":"","aliases":[],"role":"supporting","age":"","gender":"","appearance":{"hair":"","eyes":"","height":"","build":"","features":"","attire":""},"personality":{"dominant":"","drive":"","contradiction":"","habits":[],"socialMask":""},"background":"","abilities":[],"hiddenMotives":[],"relationships":[],"dialogueStyle":{"description":"","examples":[],"vocabulary":[],"speechPatterns":[]},"timeline":[],"arcProgress":"","currentStatus":"alive","tags":["📥导入"]}]}`;

        // ── 人物提取 ──
        let chars: Record<string, unknown>[] = [];

        if (needsChunking && !isCharOnly) {
          // 分块模式：文本切成每CHUNK_SIZE个角色一块
          const chunks = chunkText(text, charBlocks);
          send({ type: "progress", stage: "chunk", message: `📦 分${chunks.length}块处理 · 每块≤${CHUNK_SIZE}个角色`, pct: 5 });
          await new Promise(r => setTimeout(r, 100));

          let totalChars = 0;
          for (let ci = 0; ci < chunks.length; ci++) {
            const chunkInfo = `[第${ci + 1}/${chunks.length}块]`;
            send({ type: "progress", stage: `chunk-${ci}`, message: `📡 第${ci + 1}/${chunks.length}块分析中...`, pct: 5 + Math.round((ci / chunks.length) * 75) });

            const res = await callFlash(dsConfigA, charSystemPrompt, buildCharPrompt(chunks[ci], chunkInfo), 32768);
            if (res.error) {
              send({ type: "progress", stage: `chunk-${ci}-err`, message: `⚠️ 第${ci + 1}块失败: ${res.error}`, pct: 5 + Math.round(((ci + 1) / chunks.length) * 75) });
              continue;
            }
            try {
              const p = parseJSON(res.raw);
              const pc = Array.isArray(p.characters) ? p.characters.map(normChar).filter(c => c.name) : [];
              chars.push(...pc);
              totalChars += pc.length;
            } catch (e) {
              send({ type: "progress", stage: `chunk-${ci}-err`, message: `⚠️ 第${ci + 1}块JSON解析失败`, pct: 5 + Math.round(((ci + 1) / chunks.length) * 75) });
            }
          }
          send({ type: "progress", stage: "chunk-done", message: `✅ 分块完成 · ${totalChars}角色 · ${chunks.length}块`, pct: 85 });
        } else {
          // 单次调用模式（角色少或仅人物卡模式）
          send({ type: "progress", stage: "launch", message: isCharOnly ? `👤 仅人物卡 · Flash单路` : `A路 Flash→人物 | B路 Flash→世界`, pct: 5 });
          await new Promise(r => setTimeout(r, 100));
          send({ type: "progress", stage: "calling", message: `📡 调用DeepSeek Flash...`, pct: 10 });

          const resA = await callFlash(dsConfigA, charSystemPrompt, buildCharPrompt(text), 32768);
          send({ type: "progress", stage: "api-done", message: `📥 API返回 · 解析中...`, pct: 85 });

          if (resA.error) {
            send({ type: "progress", stage: "path-a-done", message: `⚠️ 人物提取失败: ${resA.error}`, pct: 60 });
          } else {
            try {
              const p = parseJSON(resA.raw);
              const pc = Array.isArray(p.characters) ? p.characters : [];
              chars = pc.map(normChar).filter(c => c.name);
              send({ type: "progress", stage: "path-a-done", message: `✅ 人物提取完成 · ${chars.length}角色 · ${resA.sec}s`, pct: 60 });
            } catch (e) {
              send({ type: "progress", stage: "path-a-done", message: `⚠️ JSON解析失败: ${String(e).slice(0, 100)}`, pct: 60 });
            }
          }
        }

        // ── 世界设定+文风（仅非分块+非仅人物卡模式）──
        let lore: Record<string, unknown>[] = [];
        let style: Record<string, unknown> = {};

        // B路：世界设定+文风——分块模式也执行（独立调用，不跳过）
        if (!isCharOnly) {
          // 分块模式：用全文前16000字做世界+风格提取；非分块模式用完整文本
          const loreText = needsChunking ? text.slice(0, 16000) : text;
          const chunkNote = needsChunking ? "(基于文本前16000字)" : "";

          const lorePrompt = `从设定文本中提取世界设定词条和写作风格。${chunkNote}

${THREE_CARD_BOUNDARIES}

【作品信息】
名称：${pName} · 类型：${pGenre.join("、")}

【设定文本】
${loreText}

【输出格式——纯JSON，无markdown】
{"lore":[{"title":"","category":"geography|faction|magic_system|history|culture|creature|item|custom","keys":[],"content":""}],"style":{"povType":"third_person_limited","narrativeDistance":"medium","avgSentenceLength":25,"shortSentenceRatio":0.3,"longSentenceRatio":0.15,"dialogueRatio":0.35,"descriptionRatio":0.25,"actionRatio":0.25,"innerThoughtRatio":0.15,"tonalMarkers":{},"lexicalFeatures":{},"styleDescription":"","sampleText":""}}`;

          const resB = await callFlash(
            dsConfigB,
            "世界设定+文风提取器。严格遵循三卡分界标准。只输出JSON。",
            lorePrompt,
            32768, // 无上限提取——输出拉满
          );

          if (resB.error) {
            send({ type: "progress", stage: "path-b-done", message: `⚠️ 世界提取失败: ${resB.error}`, pct: 90 });
          } else {
            try {
              const p = parseJSON(resB.raw);
              lore = (Array.isArray(p.lore) ? p.lore : []).map(normLore).filter(l => l.title);
              if (typeof p.style === "object" && p.style !== null) style = p.style as Record<string, unknown>;
              send({ type: "progress", stage: "path-b-done", message: `✅ 世界提取完成 · ${lore.length}词条${chunkNote} · ${resB.sec}s`, pct: 90 });
            } catch (e) {
              send({ type: "progress", stage: "path-b-done", message: `⚠️ 世界JSON解析失败`, pct: 90 });
            }
          }
        }

        // ── 去重 ──
        const charMap = new Map<string, Record<string, unknown>>();
        for (const c of chars) { const k = String(c.name || "").toLowerCase().trim(); if (k && !charMap.has(k)) charMap.set(k, c); }
        const loreMap = new Map<string, Record<string, unknown>>();
        for (const l of lore) { const k = String(l.title || "").toLowerCase().trim(); if (k && !loreMap.has(k)) loreMap.set(k, l); }

        const finalChars = Array.from(charMap.values());
        const finalLore = Array.from(loreMap.values());
        const totalSec = ((Date.now() - t0) / 1000).toFixed(1);

        send({ type: "progress", stage: "done-pre", message: `${finalChars.length}角色 ${finalLore.length}词条 · ${totalSec}s`, pct: 99 });

        send({
          type: "done",
          detectedChapters: [],
          extractedCharacters: finalChars,
          extractedLoreEntries: finalLore,
          extractedStyle: style,
          meta: { importMode, chapterCount: 0, characterCount: finalChars.length, loreCount: finalLore.length, inputTokens: countTokens(text), rawCharCount: text.length, modelUsed: model, extractTimeSeconds: parseFloat(totalSec), totalTimeSeconds: parseFloat(totalSec), estimatedTotal: estimatedCount, chunked: needsChunking },
        });

      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally { controller.close(); }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
}
