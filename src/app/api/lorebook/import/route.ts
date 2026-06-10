/**
 * POST /api/lorebook/import
 *
 * 一键导入世界书：粘贴长文本 → Flash 结构化抽取术语/概念/势力/地点/器物
 * 专有名词零丢失，不压缩、不概括，保留原文措辞。
 * SSE 流式返回进度。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const MODEL = "deepseek-v4-flash";
const BASE_URL = "https://api.deepseek.com/v1";
const API_KEY = process.env.DEEPSEEK_API_KEY || "";

// ─── 类型 ──────────────────────────────────────

interface ExtractedEntry {
  title: string;
  category: string;
  content: string;
  keys: string[];
}

// ─── Flash 调用 ──────────────────────────────

async function callFlash(system: string, prompt: string, maxTokens = 8000): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.1, max_tokens: maxTokens, stream: false,
      // 不传 thinking 字段——硅基流动 Flash 不支持
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => null);
  const raw = data?.choices?.[0]?.message?.content || "";
  if (!raw || raw.trim().length < 10) throw new Error("Flash 返回空");
  return raw.trim();
}

// ─── 解析 JSON ──────────────────────────────

function parseResult(raw: string): ExtractedEntry[] {
  let s = raw.trim();
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) s = md[1].trim();
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);

  const arr = JSON.parse(s) as Array<Record<string, unknown>>;
  return arr.map(item => {
    const cat = String(item.category || "custom");
    const validCategories = ["geography", "faction", "magic_system", "history", "culture", "creature", "item", "custom"];
    return {
      title: String(item.title || "未命名"),
      category: validCategories.includes(cat) ? cat : "custom",
      content: String(item.content || ""),
      keys: Array.isArray(item.keys) ? item.keys.filter((k: unknown) => typeof k === "string") : [String(item.title || "未命名")],
    };
  });
}

// ─── 分类中文映射 ──────────────────────────────

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    geography: "地理", faction: "势力组织", magic_system: "力量体系",
    history: "历史", culture: "文化风俗", creature: "生物种族",
    item: "器物法宝", custom: "自定义",
  };
  return map[cat] || cat;
}

// ═══════════════════════════════════════════════
// POST (SSE)
// ═══════════════════════════════════════════════

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const projectId = body.projectId as string;
  const text = (body.text as string)?.trim();

  if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
  if (!text || text.length < 10) return NextResponse.json({ error: "文本太短，至少10字" }, { status: 400 });

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const t0 = Date.now();
        send({ type: "progress", stage: "start", message: `文本 ${text.length} 字 · 开始分析…`, pct: 10 });

        // 截断过长文本（Flash 上下文有限）
        const MAX_INPUT = 8000;
        const input = text.length > MAX_INPUT ? text.slice(0, MAX_INPUT) + "\n…(文本已截断)" : text;

        const systemPrompt = `你是高精度数据解析器。从用户输入的设定文本中无损提取世界观信息，严格按JSON输出。

提取规则：
1. 术语库：所有人名、地名、功法名、境界名、组织名、器物名 —— 附带原文中的解释
2. 概念法则：世界运行的底层逻辑（力量体系、修炼规则、世界结构）
3. 绝对禁止：遗漏具体名称、用概括性语言替代原文描述、改写数值设定
4. 分类依据：
   - geography: 地名、区域、地形地貌
   - faction: 宗门、组织、势力、家族
   - magic_system: 功法、修炼体系、境界、能力系统
   - history: 历史事件、时间线、纪元
   - culture: 风俗、节日、礼仪、社会规则
   - creature: 种族、妖兽、特殊生物
   - item: 法宝、丹药、器物、材料
   - custom: 以上不匹配的概念`;

        const prompt = `从以下设定文本中提取所有世界观信息。每个概念一条词条，专有名词一个不能少。

【输入文本】
${input}

【输出——纯JSON数组】
[
  {
    "title": "词条名（专有名词本身，如"青云宗""筑基期""天劫"）",
    "category": "geography|faction|magic_system|history|culture|creature|item|custom",
    "content": "原文中的定义与描述，保留原文措辞，200-500字",
    "keys": ["触发关键词1", "触发关键词2", "词条名"]
  }
]

铁律：
- 专有名词一个不漏——哪怕只出现一次
- content 保留原文措辞，不概括、不压缩
- 每个概念独立一条，概念粒度适中（不要一个词条涵盖所有地理，也不要每座山单独一条）
- 只输出JSON数组`;

        send({ type: "progress", stage: "extracting", message: "Flash 分析中…", pct: 20 });

        const raw = await callFlash(systemPrompt, prompt, 8000);
        const entries = parseResult(raw);

        send({ type: "progress", stage: "parsed", message: `解析出 ${entries.length} 个概念`, pct: 40 });

        // 写入DB
        let created = 0;
        let skipped = 0;
        const createdTitles: string[] = [];

        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          try {
            // 检查重名
            const existing = await prisma.lorebookEntry.findFirst({
              where: { projectId, title: e.title },
              select: { id: true, content: true },
            });

            if (existing) {
              // 同名词条：旧内容 + 新内容合并
              const merged = existing.content + "\n\n---\n" + e.content;
              await prisma.lorebookEntry.update({
                where: { id: existing.id },
                data: { content: merged },
              });
              skipped++;
            } else {
              await prisma.lorebookEntry.create({
                data: {
                  projectId,
                  title: e.title,
                  category: e.category,
                  keys: e.keys.length > 0 ? e.keys : [e.title],
                  content: e.content,
                  enabled: true,
                  insertionOrder: 50,
                },
              });
              created++;
              createdTitles.push(`[${categoryLabel(e.category)}] ${e.title}`);
            }

            send({
              type: "progress", stage: "writing",
              message: `📝 ${e.title}`,
              pct: 40 + Math.round(((i + 1) / entries.length) * 50),
              done: i + 1, total: entries.length,
            });
          } catch (dbErr) {
            send({
              type: "progress", stage: "write-error",
              message: `⚠️ ${e.title} 写入失败: ${String(dbErr).slice(0, 60)}`,
              done: i + 1, total: entries.length,
            });
          }
        }

        const sec = ((Date.now() - t0) / 1000).toFixed(1);
        send({
          type: "done",
          ok: true,
          created,
          skipped,
          total: entries.length,
          timeSec: parseFloat(sec),
          titles: createdTitles.slice(0, 20),
          message: `✅ 导入完成：${created} 新词条${skipped > 0 ? ` · ${skipped} 条合并到已有` : ""} · ${sec}s`,
        });

        controller.close();
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
        controller.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
