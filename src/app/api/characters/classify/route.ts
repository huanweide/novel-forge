/**
 * POST /api/characters/classify
 *
 * v7: Flash AI 三分类——对标号（能力等级）、对地点（势力归属）、对角色性质（定位原型）
 *     基于世界书+人物卡综合分析，不靠简单字符串匹配。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 120;

const FLASH = "deepseek-ai/DeepSeek-V4-Flash";
const BASE_URL = (process.env.LLM_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/+$/, "");
const API_KEY = process.env.LLM_API_KEY || "";

interface ClassifyGroup {
  category: string;      // 分类维度：ability | affiliation | archetype
  label: string;         // 分组标签：S级 / 冰帝学院 / 天才型
  description: string;   // 简短说明
  members: string[];     // 角色名列表
  memberIds: string[];   // 角色ID列表
}

// ─── Flash API 调用 ───────────────────────────

async function callFlash(system: string, prompt: string): Promise<string> {
  const r = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: FLASH,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.05,
      max_tokens: 4000,
      stream: false,
    }),
  });
  if (!r.ok) throw new Error(`Flash ${r.status}`);
  const data = await r.json().catch(() => null);
  return data?.choices?.[0]?.message?.content || "";
}

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

// ═══════════════════════════════════════════════
// 三分类维度
// ═══════════════════════════════════════════════

async function classifyAbilities(
  characters: Array<{ id: string; name: string; background: string | null; abilities: string[] }>,
  worldContext: string,
): Promise<ClassifyGroup[]> {
  const charList = characters.map(c =>
    `${c.name}|${c.abilities?.join("、") || "无"}|${(c.background || "").slice(0, 200)}`
  ).join("\n");

  const prompt = `根据角色能力和设定，按能力等级/定位分类（对标号）。输出JSON。

【世界观】
${worldContext}

【角色列表——每行: 姓名|能力|背景摘要】
${charList}

【分类要求】
- 识别共同的能力等级/定位模式，如：S级天才型 / A级主力型 / 特殊型 / 教练型 / 辅助型
- 所有角色不允许遗漏——每人至少归入一个组
- 每个组取一个中文标签（如"世界级·S级"、"蓝色监狱核心"、"U-17精英"、"奇迹世代"）
- 分组数量按实际情况，不要生造

【输出JSON】
{"groups":[{"category":"ability","label":"分组标签","description":"该组共性说明","members":["角色名1","角色名2"]}]}`;

  try {
    const raw = await callFlash("角色分级分类。按能力维度分号。不遗漏。JSON。", prompt);
    const p = parseJSON(raw);
    return (Array.isArray(p.groups) ? p.groups : []) as ClassifyGroup[];
  } catch { return []; }
}

async function classifyAffiliations(
  characters: Array<{ id: string; name: string; background: string | null }>,
  worldContext: string,
): Promise<ClassifyGroup[]> {
  const charList = characters.map(c =>
    `${c.name}|${(c.background || "").slice(0, 300)}`
  ).join("\n");

  const prompt = `根据角色背景和世界设定，按势力/归属/地点分类（对地点）。输出JSON。

【世界观】
${worldContext}

【角色列表——每行: 姓名|背景摘要】
${charList}

【分类要求】
- 识别角色所属的组织、队伍、学校、国家等归属关系
- 例：蓝色监狱 / 拜仁慕尼黑 / 冰帝学园 / 立海大 / 青学 / 帝光 / 西班牙归化 / 德国青训
- 没有明确归属的角色归入"独立/流浪"组
- 所有角色不允许遗漏
- 分组按实际情况

【输出JSON】
{"groups":[{"category":"affiliation","label":"势力/学校名","description":"该势力说明","members":["角色名1","角色名2"]}]}`;

  try {
    const raw = await callFlash("角色势力分类。按归属/地点分组。不遗漏。JSON。", prompt);
    const p = parseJSON(raw);
    return (Array.isArray(p.groups) ? p.groups : []) as ClassifyGroup[];
  } catch { return []; }
}

async function classifyArchetypes(
  characters: Array<{ id: string; name: string; background: string | null; role: string; personality: unknown }>,
  worldContext: string,
): Promise<ClassifyGroup[]> {
  const charList = characters.map(c => {
    const p = typeof c.personality === "object" && c.personality !== null
      ? (c.personality as Record<string, unknown>).dominant || ""
      : "";
    return `${c.name}|${c.role}|${p}|${(c.background || "").slice(0, 150)}`;
  }).join("\n");

  const prompt = `根据角色性格、定位和背景，按原型/性质分类（对性质）。输出JSON。

【世界观】
${worldContext}

【角色列表——每行: 姓名|定位|性格|背景摘要】
${charList}

【分类要求】
- 识别角色的本质原型：天才型 / 努力型 / 领袖型 / 独狼型 / 教授型 / 反派型 / 治愈型 / 狂人型
- 基于角色实际表现判断，不是基于标签
- 一人可归入多组（如既是天才又是独狼）
- 所有角色不允许遗漏
- 分组按实际情况

【输出JSON】
{"groups":[{"category":"archetype","label":"原型标签","description":"该原型特征","members":["角色名1","角色名2"]}]}`;

  try {
    const raw = await callFlash("角色原型分类。按性质/性格分组。JSON。", prompt);
    const p = parseJSON(raw);
    return (Array.isArray(p.groups) ? p.groups : []) as ClassifyGroup[];
  } catch { return []; }
}

// ─── 世界上下文 ──────────────────────────────

function buildWorldContext(
  project: { name: string; genre: string[]; synopsis?: string },
  lore: Array<{ title: string; category: string; content: string }>,
): string {
  const loreText = lore.slice(0, 50).map(l =>
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
          prisma.lorebookEntry.findMany({
            where: { projectId, enabled: true },
            select: { title: true, category: true, content: true },
          }),
          prisma.characterCard.findMany({
            where: { projectId },
            select: { id: true, name: true, background: true, abilities: true, role: true, personality: true },
          }),
        ]);

        if (!project) { send({ type: "error", message: "项目不存在" }); controller.close(); return; }
        if (characters.length === 0) { send({ type: "error", message: "没有角色可分类" }); controller.close(); return; }

        const worldContext = buildWorldContext(project, loreEntries);
        const nameToId = new Map(characters.map(c => [c.name, c.id]));
        const fillIds = (groups: ClassifyGroup[]) => {
          for (const g of groups) {
            g.memberIds = g.members.map(n => nameToId.get(n)).filter(Boolean) as string[];
          }
          return groups;
        };

        // ── 三路并行分类 ──
        send({ type: "progress", stage: "start", message: `🔬 ${characters.length}角色 · 三路并行AI分类中…`, pct: 10 });

        const [abilityGroups, affiliationGroups, archetypeGroups] = await Promise.all([
          classifyAbilities(characters, worldContext),
          classifyAffiliations(characters, worldContext),
          classifyArchetypes(characters, worldContext),
        ]);

        const allGroups = [
          ...fillIds(abilityGroups),
          ...fillIds(affiliationGroups),
          ...fillIds(archetypeGroups),
        ];

        // 统计覆盖率
        const allNamed = new Set(allGroups.flatMap(g => g.members));
        const uncovered = characters.filter(c => !allNamed.has(c.name));
        if (uncovered.length > 0) {
          allGroups.push({
            category: "affiliation",
            label: "未归类",
            description: "未被任何分类覆盖的角色",
            members: uncovered.map(c => c.name),
            memberIds: uncovered.map(c => c.id),
          });
        }

        const totalMembers = new Set(allGroups.flatMap(g => g.members)).size;

        send({
          type: "done",
          ok: true,
          groups: allGroups,
          totalGroups: allGroups.length,
          totalMembers,
          message: `✅ ${allGroups.length} 组 · 覆盖 ${totalMembers}/${characters.length} 人`,
        });

        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: `分类失败: ${msg.slice(0, 200)}` });
        try { controller.close(); } catch { /* */ }
      }
    },
  });

  return new Response(sse, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
