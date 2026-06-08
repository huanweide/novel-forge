/**
 * POST /api/import/parse
 *
 * AB双路双Provider并行：
 *   路A → 硅基流动 V4 Pro → 人物角色
 *   路B → DeepSeek官方 deepseek-chat → 世界设定+文风
 *
 * 两个不同服务商，不限流。每路非流式完整返回。
 * 各自250s超时保护，独立进度追踪。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getDefaultLLMConfig } from "@/core/llm/client";
import { countTokens } from "@/core/assembly/tokenizer";

export const maxDuration = 60;

const MODEL_A = "deepseek-chat";                   // DeepSeek官方 (fast)
const MODEL_B = "deepseek-ai/DeepSeek-V4-Flash";   // 硅基流动 Flash

// ─── JSON 解析 ──────────────────────────────────

function parseJSON(raw: string): Record<string, unknown> {
  let s = raw.trim();
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  try { return JSON.parse(s) as Record<string, unknown>; } catch { /* */ }
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) try { return JSON.parse(md[1].trim()) as Record<string, unknown>; } catch { /* */ }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) try { return JSON.parse(s.slice(a, b + 1)) as Record<string, unknown>; } catch { /* */ }
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

// ─── 单路非流式调用 ──────────────────────────

interface CallConfig { baseURL: string; apiKey: string; model: string; label: string; }

async function callOne(
  cfg: CallConfig,
  systemPrompt: string, userPrompt: string, maxTokens: number,
  onTick: (elapsedSec: number) => void,
): Promise<{ raw: string; error?: string; sec: number }> {
  const t0 = Date.now();

  // 进度心跳
  const ticker = setInterval(() => onTick((Date.now() - t0) / 1000), 2000);

  try {
    const url = cfg.baseURL.endsWith("/v1") ? `${cfg.baseURL}/chat/completions` : `${cfg.baseURL}/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.1, max_tokens: maxTokens, stream: false }),
    });

    clearInterval(ticker);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);

    if (!res.ok) { const eb = await res.text().catch(() => ""); return { raw: "", error: `${cfg.label} HTTP ${res.status}: ${eb.slice(0, 200)}`, sec: parseFloat(sec) }; }
    const data = await res.json().catch(() => null);
    const raw = data?.choices?.[0]?.message?.content || "";
    if (!raw || raw.trim().length < 20) return { raw: "", error: `${cfg.label} 返回空内容`, sec: parseFloat(sec) };

    return { raw, sec: parseFloat(sec) };
  } catch (e) {
    clearInterval(ticker);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    const msg = `${cfg.label} ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`;
    return { raw: "", error: msg, sec: parseFloat(sec) };
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
  const { projectId, rawText, volumeMode, importMode: userMode } = body;

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        if (!projectId || !rawText) { send({ type: "error", message: "缺少 projectId 或 rawText" }); controller.close(); return; }
        const text = rawText as string;
        if (text.length < 30) { send({ type: "error", message: "文本太短" }); controller.close(); return; }

        send({ type: "progress", stage: "init", message: "连接数据库...", pct: 1 });
        const project = await prisma.project.findUnique({ where: { id: projectId as string } });
        if (!project) { send({ type: "error", message: "项目不存在" }); controller.close(); return; }

        const sfConfig = getDefaultLLMConfig();
        const importMode = (userMode as string) || "settings";
        const inputTokens = countTokens(text);
        const pName = project.name;
        const pGenre = project.genre;

        // DeepSeek官方配置
        const dsKey = process.env.DEEPSEEK_API_KEY || "";
        const dsConfig: CallConfig = { baseURL: "https://api.deepseek.com", apiKey: dsKey, model: MODEL_A, label: "DeepSeek" };
        const sfCfg: CallConfig = { baseURL: sfConfig.baseURL, apiKey: sfConfig.apiKey, model: MODEL_B, label: "硅基Flash" };

        const hasDS = dsKey.length > 10;
        const mode = hasDS ? "DeepSeek(人物) + 硅基Flash(世界)" : "硅基Flash(全部)";

        send({ type: "progress", stage: "ready", message: `${text.length.toLocaleString()} 字 · ${mode}`, importMode, isSettings: true, pct: 3, hasDeepSeek: hasDS });

        const t0 = Date.now();

        // ── Prompt ──

        const promptChars = `设定集→角色卡JSON。原文照搬，没信息写"无"。只输出JSON。

【${pName}】${pGenre.join("、")}

${text}

{"characters":[{"name":"","aliases":[],"role":"protagonist|antagonist|supporting|mentor|love_interest|background","age":"","gender":"","appearance":{"hair":"","eyes":"","height":"","build":"","features":"","attire":""},"personality":{"dominant":"","drive":"","contradiction":"","habits":[],"socialMask":""},"background":"","abilities":[],"hiddenMotives":[],"relationships":[{"targetName":"","relation":"","dynamic":""}],"dialogueStyle":{"description":"","examples":[],"vocabulary":[],"speechPatterns":[]},"timeline":[{"age":0,"event":"","era":""}],"arcProgress":"","currentStatus":"alive"}]}`;

        const promptLore = `设定集→世界设定+文风JSON。原文照搬，没信息写"无"。只输出JSON。

【${pName}】${pGenre.join("、")}

${text}

{"lore":[{"title":"","category":"geography|faction|magic_system|history|culture|creature|item|custom","keys":[],"content":""}],"style":{"styleDescription":"","povType":"third_person_limited","narrativeDistance":"medium","dialogueRatio":0.35,"descriptionRatio":0.25,"actionRatio":0.25,"innerThoughtRatio":0.15,"tonalMarkers":{},"lexicalFeatures":{},"sampleText":""}}`;

        // ── AB路同时启动 ──

        send({ type: "progress", stage: "launch", message: `A路 DeepSeek→人物 | B路 硅基Flash→世界`, pct: 5 });

        let progressA = 0, progressB = 0;

        const [resA, resB] = await Promise.all([
          // 路A：DeepSeek官方 → 人物（48 tok/s 比硅基快37%）
          callOne(dsConfig, "格式翻译器。设定集→角色卡JSON。原文照搬。只输出JSON。", promptChars, 24000, (elapsed) => {
            progressA = Math.round(elapsed);
            send({ type: "progress", stage: "path-a", message: `👤 A路 DeepSeek·人物 进行中 ${progressA}s`, path: "A", elapsed: progressA, pct: Math.min(50, Math.round(5 + (elapsed / 200) * 45)) });
          }),

          // 路B：硅基流动 → 世界设定+文风
          callOne(sfCfg, "格式翻译器。设定集→世界设定+文风JSON。原文照搬。只输出JSON。", promptLore, 12000, (elapsed) => {
            progressB = Math.round(elapsed);
            send({ type: "progress", stage: "path-b", message: `🌍 B路 硅基·世界 进行中 ${progressB}s`, path: "B", elapsed: progressB, pct: Math.min(50, Math.round(5 + (elapsed / 200) * 45)) });
          }),
        ]);

        // ── 解析路A：人物 ──

        let chars: Record<string, unknown>[] = [];

        if (resA.error) {
          send({ type: "progress", stage: "path-a-done", message: `⚠️ A路失败: ${resA.error}`, pct: 60 });
        } else {
          try {
            const p = parseJSON(resA.raw);
            const pc = Array.isArray(p.characters) ? p.characters : [];
            chars = pc.map(normChar).filter(c => c.name);
            send({ type: "progress", stage: "path-a-done", message: `✅ A路完成 · ${chars.length}角色 · ${resA.sec}s`, pct: 60 });
          } catch (e) {
            send({ type: "progress", stage: "path-a-done", message: `⚠️ A路JSON解析失败: ${String(e).slice(0, 100)}`, rawPreview: resA.raw.slice(0, 300), pct: 60 });
          }
        }

        // ── 解析路B：世界+文风 ──

        let lore: Record<string, unknown>[] = [];
        let style: Record<string, unknown> = {};

        if (resB.error) {
          send({ type: "progress", stage: "path-b-done", message: `⚠️ B路失败: ${resB.error}`, pct: 85 });
        } else {
          try {
            const p = parseJSON(resB.raw);
            const pl = Array.isArray(p.lore) ? p.lore : [];
            lore = pl.map(normLore).filter(l => l.title);
            if (typeof p.style === "object" && p.style !== null) style = p.style as Record<string, unknown>;
            send({ type: "progress", stage: "path-b-done", message: `✅ B路完成 · ${lore.length}词条 · ${resB.sec}s`, pct: 85 });
          } catch (e) {
            send({ type: "progress", stage: "path-b-done", message: `⚠️ B路JSON解析失败: ${String(e).slice(0, 100)}`, rawPreview: resB.raw.slice(0, 300), pct: 85 });
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
          meta: { importMode, chapterCount: 0, characterCount: finalChars.length, loreCount: finalLore.length, inputTokens, rawCharCount: text.length, modelUsed: `${MODEL_A}+${MODEL_B}`, extractTimeSeconds: parseFloat(totalSec), totalTimeSeconds: parseFloat(totalSec) },
        });

      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally { controller.close(); }
    },
  });

  return new Response(sse, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
}
