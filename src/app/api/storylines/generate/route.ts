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

import { completeText } from "@/core/llm/client";
import { getCompletedMainIds, isRehangTargetActiveMain } from "@/core/pipeline/outline-context";

export async function POST(request: Request) {
  try {
    const { projectId, mode } = await request.json();
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

    const buildConfig = (project as any).buildConfig || {};
    const pace = buildConfig.stitchPace || "steady";
    const paceDesc =
      pace === "fast"
        ? "节奏快：高频事件、每章都有新变数与冲突升级，剧情快速推进"
        : pace === "slow"
          ? "节奏慢热：铺垫充分、伏笔密集，冲突逐步累积后爆发"
          : "节奏均衡：稳步推进，隔章设置变数与阶段性小高潮";

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

【缝合怪节奏——构造新主线时按此节奏设计事件密度（v1.6.0）】
${paceDesc}

请为这部小说生成故事线：
${
  mode === "newMain"
    ? "前一条主线已完结（缝合怪推进·构造新主线）。请构造一条承接前主线结局的新主线——延续世界观与人物当前状态，开启下一阶段的更大冲突，并配套 3-5 条支线。"
    : existingStorylines.filter(s => s.type === "main").length === 0
      ? "生成 1 条主线和 3-5 条支线。"
      : "主线已存在，生成 3-5 条支线来丰富主线。"
}`;

    const raw = await completeText(system, prompt, { maxTokens: 8192, temperature: 0.5 });

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

    // 解析主/支线（v1.6.4 #651：支线须挂主线 parentId）
    const mainLines = lines.filter((l) => (l.type as string) === "main");
    const sideLines = lines.filter((l) => (l.type as string) !== "main");

    // 主线 id：优先复用【活跃】主线；若现有主线均非 active（已完结/已废弃，newMain 缝合怪·构造新主线），
    // 则不接管旧主线，置 null 交由本次新建的主线接管，避免支线误挂到已完结/已废弃旧主线（R2-005 / R4-NEW-1）。
    // 注意：必须用 status === "active" 而非 !== "completed"，否则 abandoned 主线会被误当目标（R4-NEW-1 同构复现 N8）。
    let mainId: string | null =
      existingStorylines.find((s) => s.type === "main" && s.status === "active")?.id ?? null;

    const created: any[] = [];
    const buildData = (
      line: Record<string, unknown>,
      type: string,
      order: number,
      parentId: string | null,
    ) => ({
      projectId,
      type,
      parentId,
      title: (line.title as string) || `事件线${order}`,
      description: (line.description as string) || "",
      order,
      desire: (line.desire as string) || "",
      obstacle: (line.obstacle as string) || "",
      action: (line.action as string) || "",
      result: (line.result as string) || "",
      twist: (line.twist as string) || "",
      turn: (line.turn as string) || "",
      ending: (line.ending as string) || "",
    });

    // 先建主线（如有），拿到 id 供支线挂载
    for (const line of mainLines) {
      const m = await prisma.storyline.create({
        data: buildData(line, "main", maxOrder + created.length + 1, null),
      });
      created.push(m);
      if (!mainId) mainId = m.id;
    }

    // N4 修复（R2-005 向后兼容）+ N8 回归加固：newMain 等场景下，把仍指向「已完结旧主线」的支线
    // 重挂到当前活跃主线（mainId），避免旧支线隶属关系在新主线构造后静默丢失。
    // 仅更新 parentId 命中旧已完结主线的支线，不影响已正确挂载的线。
    // N8 加固（R4-NEW-1 收紧）：仅当 mainId 指向【活跃主线】时才重挂——绝不把旧支线重挂到 completed
    // 或 abandoned 等任何非 active 终态主线，否则 formatStorylines 因 loadOutlineData 仅含活跃主线，
    // 会让「隶属主线」前缀静默丢失（R2-006 冲突）。abandoned 与 completed 同构，已被 isRehangTargetActiveMain
    // 的 status==="active" 判定一并排除。
    // mainId 为新建主线（不在 existing 快照中）时默认 active，isRehangTargetActiveMain 会放行，N4 新建行为不回退。
    const oldCompletedMainIds = getCompletedMainIds(existingStorylines);
    if (mainId && oldCompletedMainIds.length > 0 && isRehangTargetActiveMain(mainId, existingStorylines)) {
      await prisma.storyline.updateMany({
        where: { projectId, type: "side", parentId: { in: oldCompletedMainIds } },
        data: { parentId: mainId },
      });
    }

    // 再建支线，parentId 挂到主线（让"支线服务于主线"数据化）
    const createdSides = await Promise.all(
      sideLines.map((line, i) =>
        prisma.storyline.create({
          data: buildData(line, "side", maxOrder + created.length + i + 1, mainId),
        })
      )
    );
    created.push(...createdSides);

    return NextResponse.json({
      storylines: created,
      count: created.length,
      types: { main: created.filter((s) => s.type === "main").length, side: created.filter((s) => s.type === "side").length },
    });
  } catch (err) {
    return jsonError(err);
  }
}
