/**
 * POST /api/storylines/generate
 *
 * AI 自动生成故事线——基于项目总纲、角色卡、世界书，
 * 生成 1 条主线 + N 条支线，每条含七要素。
 */

export const maxDuration = 120;
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

import { callLLM } from "@/lib/llm";

export async function POST(request: Request) {
  try {
    const { projectId } = await request.json();
    if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

    const [project, characters, loreEntries, existingStorylines] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.characterCard.findMany({ where: { projectId } }),
      prisma.lorebookEntry.findMany({ where: { projectId, enabled: true } }),
      prisma.storyline.findMany({ where: { projectId } }),
    ]);

    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

    const system = `你是小说故事线架构师。你为小说设计事件线（Storylines）——每条事件线是一个完整的小故事单元，用"七要素"驱动。

【七要素定义——每条事件线必须包含】
1. 欲望：主角这条线想要什么（推动力）
2. 阻碍：谁/什么挡着（冲突源）
3. 行动：主角怎么做（主动行为，不是被动反应）
4. 结果：暂时成/败（让读者想知道接下来怎样）
5. 意外：突然转折（打破读者预期）
6. 转折：方向改变（故事的意义/方向因意外而改变）
7. 结局：本事件线的收束（可以是阶段性的，不必全书结局）

【铁律】
- 每条线都是"因为想要X → 遇到Y → 做Z → 得到结果 → 意外发生 → 方向改变 → 收束"的完整因果链
- 支线必须服务于主线的"阻碍"或"转折"
- 七要素要具体，不要"变强""克服困难"这种万金油
- 事件线命名要像微型标题，如"获得灵剑认主"而非"主角获得宝剑"

【输出格式——纯JSON】
{
  "lines": [
    {
      "type": "main",
      "title": "事件线名称",
      "description": "一句话概述这条线",
      "desire": "...", "obstacle": "...", "action": "...", "result": "...",
      "twist": "...", "turn": "...", "ending": "..."
    }
  ]
}`;

    const prompt = `【作品信息】
名称：${project.name}
类型：${project.genre.join("、")}
总纲：${project.synopsis || "（未设定总纲）"}

【角色卡——${characters.length}人】
${characters.slice(0, 30).map(c => `- ${c.name}（${c.role}）：${c.background?.slice(0, 100) || "暂无背景"}`).join("\n")}

【世界观设定——${loreEntries.length}条】
${loreEntries.slice(0, 20).map(e => `- ${e.title}：${e.content.slice(0, 200)}`).join("\n")}

【已有故事线——${existingStorylines.length}条（如有则在此基础上补充，主线已存在则只生成支线）】
${existingStorylines.map(s => `- [${s.type === "main" ? "主线" : "支线"}] ${s.title}`).join("\n")}

请为这部小说生成故事线：
${existingStorylines.filter(s => s.type === "main").length === 0 ? "生成 1 条主线和 3-5 条支线。" : "主线已存在，生成 3-5 条支线来丰富主线。"}`;

    const raw = await callLLM({ system, prompt, maxTokens: 8192, temperature: 0.5 });

    // 解析 JSON
    let parsed: Record<string, unknown>;
    try {
      let s = raw.trim();
      const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (md) s = md[1].trim();
      const a = s.indexOf("{"), b = s.lastIndexOf("}");
      if (a >= 0 && b > a) s = s.slice(a, b + 1);
      parsed = JSON.parse(s) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "AI 返回格式解析失败", raw: raw.slice(0, 500) }, { status: 502 });
    }

    const lines = parsed.lines as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: "AI 未生成任何故事线", raw: raw.slice(0, 500) }, { status: 502 });
    }

    // 找到已有最大 order
    const maxOrder = existingStorylines.reduce((max, s) => Math.max(max, s.order), 0);

    // 批量创建
    const created = await Promise.all(
      lines.map((line, i) =>
        prisma.storyline.create({
          data: {
            projectId,
            type: (line.type as string) || "side",
            title: (line.title as string) || `事件线${i + 1}`,
            description: (line.description as string) || "",
            order: maxOrder + i + 1,
            desire: (line.desire as string) || "",
            obstacle: (line.obstacle as string) || "",
            action: (line.action as string) || "",
            result: (line.result as string) || "",
            twist: (line.twist as string) || "",
            turn: (line.turn as string) || "",
            ending: (line.ending as string) || "",
          },
        })
      )
    );

    return NextResponse.json({
      storylines: created,
      count: created.length,
      types: { main: created.filter(s => s.type === "main").length, side: created.filter(s => s.type === "side").length },
    });
  } catch (err) {
    return jsonError(err);
  }
}
