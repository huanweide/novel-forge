/**
 * POST /api/lorebook/summarize
 *
 * 世界书结构化整理：选中词条 → 按category分组 → Flash合并 → 删旧建新。
 * 同名概念去重，体系自洽，专有名词零丢失。
 * SSE 流式返回进度。
 *
 * v2: 从"精简"改为"结构化整理"——不再压缩信息，而是去重去矛盾、分类组织
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const MODEL = "deepseek-ai/DeepSeek-V4-Flash";
const BASE_URL = (process.env.LLM_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/+$/, "");
const API_KEY = process.env.LLM_API_KEY || "";

// ─── Flash 调用 ──────────────────────────────────

async function callFlash(system: string, prompt: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.1, max_tokens: 8000, stream: false,
      // 不传 thinking——硅基流动 Flash 不支持
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

// ─── 解析 JSON ──────────────────────────────────

function parseResult(raw: string): Array<{ title: string; content: string; keys: string[] }> {
  let s = raw.trim();
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) s = md[1].trim();
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);

  const arr = JSON.parse(s) as Array<Record<string, unknown>>;
  return arr.map(item => ({
    title: String(item.title || "未命名"),
    content: String(item.content || ""),
    keys: Array.isArray(item.keys) ? item.keys.filter((k: unknown) => typeof k === "string") : [],
  }));
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
  const entryIds = (body.entryIds || []) as string[];

  if (!projectId || !entryIds.length) {
    return NextResponse.json({ error: "缺少 projectId 或 entryIds" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const t0 = Date.now();

        // 加载词条
        const entries = await prisma.lorebookEntry.findMany({
          where: { id: { in: entryIds }, projectId },
        });

        if (entries.length === 0) {
          send({ type: "error", message: "未找到词条" });
          controller.close();
          return;
        }

        // 按 category 分组
        const groups = new Map<string, typeof entries>();
        for (const e of entries) {
          const cat = e.category || "custom";
          if (!groups.has(cat)) groups.set(cat, []);
          groups.get(cat)!.push(e);
        }

        const groupList = Array.from(groups.entries());
        send({
          type: "progress", stage: "start",
          message: `${entries.length} 个词条 → ${groupList.length} 组`,
          pct: 10, total: groupList.length, done: 0,
        });

        let doneCount = 0;
        const created: string[] = [];
        const errors: string[] = [];

        // 逐组处理
        for (const [category, group] of groupList) {
          const titles = group.map(e => `【${e.title}】`).join(" ");
          send({
            type: "progress", stage: "group-start",
            message: `📝 ${categoryLabel(category)} · ${group.length}条: ${titles}`,
            pct: 10 + Math.round((doneCount / groupList.length) * 80),
            done: doneCount, total: groupList.length,
          });

          try {
            // 构建 prompt——结构化整理，不是压缩
            const entriesText = group.map((e, i) =>
              `${i + 1}. 【${e.title}】\n${e.content}`
            ).join("\n\n---\n\n");

            const prompt = `整理以下 ${group.length} 条「${categoryLabel(category)}」类世界设定。
任务不是压缩——而是去重、去矛盾、分类组织。信息量不能减少。

【原始词条】
${entriesText}

【整理规则——严格遵循】
1. 专有名词零丢失：所有人名、地名、组织名、功法名、器物名必须保留
2. 具体数值零丢失：等级、数量、时间、比例必须原样保留
3. 去重：同一概念的多条描述合并为一条，保留最详细版本
4. 去矛盾：如有矛盾以最新/最详细的描述为准，必要时保留多条并标注视角差异
5. 分类：如果词条实际涵盖不同子概念，拆分为多条独立词条

【输出JSON数组——可输出多条】
[{"title":"词条标题","content":"完整整理后的设定内容","keys":["触发关键词1","触发关键词2"]}]

只输出JSON。`;

            const raw = await callFlash(
              "整理世界设定。你的任务是去重去矛盾、保留一切细节。专有名词一个不能少。只输出JSON。",
              prompt,
            );

            const results = parseResult(raw);

            for (const r of results) {
              const newEntry = await prisma.lorebookEntry.create({
                data: {
                  projectId,
                  title: r.title,
                  category,
                  keys: r.keys.length > 0 ? r.keys : [r.title],
                  content: r.content,
                  enabled: true,
                  insertionOrder: 50,
                },
              });
              created.push(r.title);
            }

            // 删旧词条
            await prisma.lorebookEntry.deleteMany({
              where: { id: { in: group.map(e => e.id) } },
            });

            doneCount++;
            send({
              type: "progress", stage: "group-done",
              message: `✅ ${categoryLabel(category)} → ${results.map(r => r.title).join("、")}`,
              pct: 10 + Math.round((doneCount / groupList.length) * 80),
              done: doneCount, total: groupList.length,
            });
          } catch (e) {
            errors.push(`${categoryLabel(category)}: ${e instanceof Error ? e.message.slice(0, 80) : String(e).slice(0, 80)}`);
            doneCount++;
            send({
              type: "progress", stage: "group-error",
              message: `⚠️ ${categoryLabel(category)} 失败: ${e instanceof Error ? e.message.slice(0, 60) : ""}`,
              done: doneCount, total: groupList.length,
            });
          }
        }

        const sec = ((Date.now() - t0) / 1000).toFixed(1);
        send({
          type: "done",
          ok: true,
          created: created.length,
          deleted: entries.length,
          timeSec: parseFloat(sec),
          message: `✅ 整理完成：${entries.length}条 → ${created.length}条 · ${sec}s${errors.length > 0 ? ` (${errors.length}组失败)` : ""}`,
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

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    geography: "地理", faction: "势力组织", magic_system: "力量体系",
    history: "历史", culture: "文化风俗", creature: "生物种族",
    item: "器物法宝", custom: "自定义",
  };
  return map[cat] || cat;
}
