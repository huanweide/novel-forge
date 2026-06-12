/**
 * POST /api/characters/classify
 *
 * v8: 四维足球同人分类——称号/学校/经历/俱乐部
 *     基于角色卡background+abilities+tags，Flash AI四路并行分析。
 *     不靠字符串匹配——AI理解语义后归类。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 300;

const FLASH = "deepseek-v4-flash";
const BASE_URL = "https://api.deepseek.com/v1";

function getKey(): string {
  return (process.env.DEEPSEEK_API_KEY || "").trim();
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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000); // 单路120秒超时
  try {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getKey()}` },
      body: JSON.stringify({ model: FLASH, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], temperature: 0.05, max_tokens: 32768, stream: false }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Flash ${r.status}`);
    const data = await r.json().catch(() => null);
    return data?.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(timer);
  }
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

/** 称号/头衔 —— 从名字修饰、背景描述中提取 */
async function classifyTitles(charList: string, worldContext: string): Promise<ClassifyGroup[]> {
  const prompt = `根据角色背景和设定，按【称号/头衔】分类。输出JSON。

【世界观】
${worldContext}

【角色——每行: 姓名|定位|能力|标签|背景】
${charList}

【分类指南——从角色描述中识别以下模式】
- 修饰性称号："新梅西""蓝色监狱的心脏""复仇的阿修罗""世界第一"
- 媒体/粉丝给的标签："天才""怪物""王子""皇帝""魔术师"
- 角色自带的头衔："U-20队长""世界赛MVP""金球奖候选人"
- 实力评价："世界级""国家级""地区级""新星"

【要求】
- 提取所有角色描述中出现的称号/头衔，归类到共同标签下
- 一人可有多个称号（如同时是"天才"又是"队长"）
- 所有角色必须出现在至少一个组里
- 没有明显称号的归入"🏷 暂无称号"
- 输出纯JSON

{"groups":[{"category":"title","label":"称号标签","description":"该称号的含义与来源","members":["角色名"]}]}`;

  const raw = await callFlash("角色称号分类。从背景描述中提取称号/头衔/标签。不遗漏。JSON。", prompt);
  return (Array.isArray(parseJSON(raw).groups) ? parseJSON(raw).groups : []) as ClassifyGroup[];
}

/** 学校 —— 从背景中识别学校/学园 */
async function classifySchools(charList: string, worldContext: string): Promise<ClassifyGroup[]> {
  const prompt = `根据角色背景，按【学校/学园】分类。输出JSON。

【世界观】
${worldContext}

【角色——每行: 姓名|定位|能力|标签|背景】
${charList}

【分类指南——识别以下学校相关模式】
- 日本高中：冰帝学园、帝光中学、青学、立海大、白鸟泽、音驹等
- 足球名校：青训营、足球强校
- 海外学校：如果背景提到留学/转学经历
- 蓝色监狱内部层级也可作为"学校"的变体

【要求】
- 同一学校的角色归入一组
- 没有明确学校归属的归入"🏫 未知学校"
- 可跨校（如转学生同时属于两个学校）
- 输出纯JSON

{"groups":[{"category":"school","label":"学校名","description":"学校简介","members":["角色名"]}]}`;

  const raw = await callFlash("角色学校分类。从背景中识别学校/学园归属。不遗漏。JSON。", prompt);
  return (Array.isArray(parseJSON(raw).groups) ? parseJSON(raw).groups : []) as ClassifyGroup[];
}

/** 经历/背景 —— 从背景中提取关键经历 */
async function classifyExperiences(charList: string, worldContext: string): Promise<ClassifyGroup[]> {
  const prompt = `根据角色背景，按【经历/履历】分类。输出JSON。

【世界观】
${worldContext}

【角色——每行: 姓名|定位|能力|标签|背景】
${charList}

【分类指南——识别以下经历模式】
- 国家队经历："U-17日本代表""U-20出场""世界杯参赛"
- 海外经历："德国青训""西班牙留学""英超试训"
- 重大事件："受伤退役后复出""被淘汰后逆袭""转会风波"
- 特殊履历："街头足球出身""从其他运动转项""球探发掘"
- 蓝色监狱经历："一阶段通过""二阶段选拔""三层突破"

【要求】
- 按共同的经历类别分组（不是按时间线排列）
- 一人可有多段经历，可归入多组
- 所有角色必须覆盖
- 经历不明显的归入"📋 常规履历"
- 输出纯JSON

{"groups":[{"category":"experience","label":"经历标签","description":"该经历的说明","members":["角色名"]}]}`;

  const raw = await callFlash("角色经历分类。从背景中提取关键经历/履历。不遗漏。JSON。", prompt);
  return (Array.isArray(parseJSON(raw).groups) ? parseJSON(raw).groups : []) as ClassifyGroup[];
}

/** 俱乐部/队伍 —— 从背景中识别所属队伍 */
async function classifyClubs(charList: string, worldContext: string): Promise<ClassifyGroup[]> {
  const prompt = `根据角色背景，按【俱乐部/队伍】分类。输出JSON。

【世界观】
${worldContext}

【角色——每行: 姓名|定位|能力|标签|背景】
${charList}

【分类指南——识别以下队伍/俱乐部模式】
- 职业俱乐部："拜仁慕尼黑""巴塞罗那""曼城""皇马"
- 日本俱乐部队："浦和红钻""川崎前锋"等
- 国家队："日本U-20""日本国家队""西班牙代表队"
- 蓝色监狱内部队伍："Team Z""Team V""洁队""凛队"
- 特殊组织："蓝色监狱计划""日本足协""球探网络"

【要求】
- 按具体队伍/俱乐部名称分组
- 一人可属于多个队伍（如俱乐部+国家队）
- 所有角色必须覆盖
- 无明确队伍的归入"⚽ 无固定队伍"
- 输出纯JSON

{"groups":[{"category":"club","label":"队伍/俱乐部名","description":"该队伍说明","members":["角色名"]}]}`;

  const raw = await callFlash("角色俱乐部分类。从背景中识别队伍/俱乐部归属。不遗漏。JSON。", prompt);
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
        if (getKey().length < 10) { send({ type: "error", message: "DeepSeek API Key 未配置" }); controller.close(); return; }

        const worldContext = buildWorldContext(project, loreEntries);
        const charList = buildCharList(characters as any[]);
        const nameToId = new Map(characters.map(c => [c.name, c.id]));
        const fillIds = (groups: ClassifyGroup[]) => {
          for (const g of groups) {
            g.memberIds = g.members.map(n => nameToId.get(n)).filter(Boolean) as string[];
          }
          return groups;
        };

        // ── 四路并行分类（每路独立60秒超时，总耗时=最慢那路）──
        send({ type: "progress", stage: "start", message: `🔬 ${characters.length}角色 · 四维并行分类中...`, pct: 5 });

        const errors: string[] = [];
        const allResults: ClassifyGroup[] = [];

        const dims = [
          { fn: classifyTitles, label: "🏷 称号" },
          { fn: classifySchools, label: "🏫 学校" },
          { fn: classifyExperiences, label: "📋 经历" },
          { fn: classifyClubs, label: "⚽ 俱乐部" },
        ];

        // 四路并行
        const dimResults = await Promise.all(
          dims.map(async (dim) => {
            send({ type: "progress", stage: dim.label, message: `${dim.label} 分析中...`, pct: 20 });
            try {
              const groups = await dim.fn(charList, worldContext);
              if (groups.length === 0) {
                errors.push(`${dim.label}: AI未返回分组`);
                return { dim, groups: [] as ClassifyGroup[], error: `${dim.label}: AI未返回分组` };
              }
              send({ type: "progress", stage: dim.label, message: `${dim.label} ✅ ${groups.length}组`, pct: 60 });
              return { dim, groups, error: null };
            } catch (e) {
              const msg = (e instanceof Error ? e.message : String(e)).slice(0, 100);
              errors.push(`${dim.label}: ${msg}`);
              send({ type: "progress", stage: `${dim.label}-err`, message: `${dim.label} ⚠️ ${msg}`, pct: 40 });
              return { dim, groups: [] as ClassifyGroup[], error: `${dim.label}: ${msg}` };
            }
          })
        );

        // 合并结果
        for (const { dim, groups, error } of dimResults) {
          if (error) {
            send({ type: "progress", stage: `${dim.label}-err`, message: `${dim.label} ⚠️ ${error}`, pct: 40 });
          }
          if (groups.length > 0) {
            allResults.push(...fillIds(groups));
          }
        }

        send({ type: "progress", stage: "merge", message: `合并结果...`, pct: 75 });

        // 覆盖率检查
        const allNamed = new Set(allResults.flatMap(g => g.members));
        const uncovered = characters.filter(c => !allNamed.has(c.name));
        if (uncovered.length > 0) {
          allResults.push({
            category: "club",
            label: "❓ 未归类",
            description: "未被任何维度覆盖的角色",
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
          message: `✅ ${allResults.length} 组 · 覆盖 ${totalMembers}/${characters.length} 人 · 四维(称号/学校/经历/俱乐部)`,
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
