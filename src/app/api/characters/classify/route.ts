/**
 * POST /api/characters/classify
 *
 * v1.2.0: 简单自然分组——按角色定位/背景/能力分成 3-6 个自然群体。
 *     不做多维复杂分类；AI 理解语义后给出直观群体，全部角色覆盖。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 300;

import { completeText } from "@/core/llm/client";

function getKey(): string {
  return (process.env.LLM_API_KEY || "").trim();
}

interface ClassifyGroup {
  category: string;      // title | school | experience | club
  label: string;
  description: string;
  members: string[];
  memberIds: string[];
}

// ─── API ───────────────────────────────────────

async function callFlash(system: string, prompt: string): Promise<string> {
  return completeText(system, prompt, { temperature: 0.05, maxTokens: 32768 });
}

function parseJSON(raw: string): Record<string, unknown> {
  let s = raw.trim();
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  s = s.replace(/,(\s*[}\]])/g, "$1"); // 去尾逗号
  try { return JSON.parse(s) as Record<string, unknown>; } catch { /* */ }
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) try { return JSON.parse(md[1].trim()) as Record<string, unknown>; } catch { /* */ }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) try { return JSON.parse(s.slice(a, b + 1)) as Record<string, unknown>; } catch { /* */ }
  throw new Error(`JSON parse fail: ${s.slice(0, 200)}`);
}

// ─── 角色列表构建 ─────────────────────────────

function buildCharList(characters: Array<{ id: string; name: string; background: string | null; abilities: string[]; role: string; tags: string[] }>): string {
  return characters.map(c => {
    const bg = (c.background || "").replace(/\n/g, " ").slice(0, 400);
    const abs = (c.abilities || []).join("、");
    const tgs = (c.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).join("、");
    return `${c.name}|${c.role}|${abs || "无"}|${tgs || "无"}|${bg}`;
  }).join("\n");
}

// ═══════════════════════════════════════════════
// 四维分类
// ═══════════════════════════════════════════════

/** 简单自然分组 —— 按角色定位/背景/能力分成 3-6 个自然群体（v1.2.0：不做多维复杂分类） */
async function classifySimple(charList: string, worldContext: string): Promise<ClassifyGroup[]> {
  const prompt = `根据角色设定，把全部角色分成 3-6 个自然群体。输出JSON。

【世界观】
${worldContext}

【角色——每行: 姓名|定位|能力|标签|背景】
${charList}

【分类要求——简单分组即可】
- 按最直观的自然群体分组：阵营（正/反/中立）、身份职业（家族/门派/组织/平民）、或功能定位（主角团/对手/导师），选一种方式即可
- 不要超过 6 组，不要拆太细
- 每个角色只归入一组
- 所有角色必须覆盖，实在不好归类的归入「未分类」
- 输出纯JSON

{"groups":[{"category":"group","label":"群体名","description":"一句话说明该群体","members":["角色名"]}]}`;

  const raw = await callFlash("角色简单分组。按阵营/身份分成3-6组，不遗漏。JSON。", prompt);
  return (Array.isArray(parseJSON(raw).groups) ? parseJSON(raw).groups : []) as ClassifyGroup[];
}

// ─── 世界上下文 ──────────────────────────────

function buildWorldContext(
  project: { name: string; genre: string[]; synopsis?: string },
  lore: Array<{ title: string; category: string; content: string }>,
): string {
  const loreText = lore.slice(0, 200).map(l =>
    `[${l.title}](${l.category}) ${l.content.slice(0, 120)}`
  ).join("\n");
  return `作品：${project.name}（${project.genre.join("、")}）\n总纲：${project.synopsis?.slice(0, 200) || "无"}\n世界书：\n${loreText || "无"}`;
}

// ═══════════════════════════════════════════════

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const projectId = body.projectId as string;
  if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* */ }
      };

      try {
        const [project, loreEntries, characters] = await Promise.all([
          prisma.project.findUnique({ where: { id: projectId } }),
          prisma.lorebookEntry.findMany({ where: { projectId, enabled: true }, select: { title: true, category: true, content: true } }),
          prisma.characterCard.findMany({ where: { projectId }, select: { id: true, name: true, background: true, abilities: true, role: true, personality: true, tags: true } }),
        ]);

        if (!project) { send({ type: "error", message: "项目不存在" }); controller.close(); return; }
        if (characters.length === 0) { send({ type: "error", message: "没有角色可分类" }); controller.close(); return; }
        if (getKey().length < 10) { send({ type: "error", message: "硅基流动 API Key 未配置" }); controller.close(); return; }

        const worldContext = buildWorldContext(project, loreEntries);
        const charList = buildCharList(characters as any[]);
        const nameToId = new Map(characters.map(c => [c.name, c.id]));
        const fillIds = (groups: ClassifyGroup[]) => {
          for (const g of groups) {
            g.memberIds = g.members.map(n => nameToId.get(n)).filter(Boolean) as string[];
          }
          return groups;
        };

        // ── 单路简单分组（3-6 组自然群体）──
        send({ type: "progress", stage: "start", message: `🔬 ${characters.length}角色 · 简单分组中...`, pct: 20 });

        let allResults: ClassifyGroup[] = [];
        try {
          const groups = await classifySimple(charList, worldContext);
          if (groups.length === 0) {
            send({ type: "error", message: "AI 未返回分组" });
            controller.close();
            return;
          }
          allResults = fillIds(groups);
          send({ type: "progress", stage: "done-group", message: `✅ ${groups.length} 组`, pct: 60 });
        } catch (e) {
          const msg = (e instanceof Error ? e.message : String(e)).slice(0, 100);
          send({ type: "progress", stage: "err", message: `⚠️ ${msg}`, pct: 40 });
          send({ type: "error", message: `分类失败: ${msg}` });
          controller.close();
          return;
        }

        send({ type: "progress", stage: "merge", message: `整理分组...`, pct: 75 });

        // 覆盖率检查
        const allNamed = new Set(allResults.flatMap(g => g.members));
        const uncovered = characters.filter(c => !allNamed.has(c.name));
        if (uncovered.length > 0) {
          allResults.push({
            category: "group",
            label: "未分类",
            description: "未被任何群体覆盖的角色",
            members: uncovered.map(c => c.name),
            memberIds: uncovered.map(c => c.id),
          });
        }

        const totalMembers = new Set(allResults.flatMap(g => g.members)).size;

        send({
          type: "done",
          ok: true,
          groups: allResults,
          totalGroups: allResults.length,
          totalMembers,
          message: `✅ ${allResults.length} 组 · 覆盖 ${totalMembers}/${characters.length} 人 · 简单分组`,
        });

        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: `分类失败: ${msg.slice(0, 200)}` });
        try { controller.close(); } catch { /* */ }
      }
    },
  });

  return new Response(sse, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
}
