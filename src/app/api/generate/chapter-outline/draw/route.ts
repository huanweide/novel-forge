/**
 * POST /api/generate/chapter-outline/draw
 *
 * 抽卡模式——并行生成 3-5 张不同走向的章纲卡片，用户选一张。
 *
 * 每张卡片 = 一次独立的 AI 调用，temperature 不同，产出不同走向。
 * 卡片包含：章纲全文 + 选角列表 + 核心冲突 + 情绪基调 + 伏笔方向
 */

export const maxDuration = 120;

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getActiveRules, injectRules } from "@/core/rules";

import { callSiliconFlow } from "@/lib/llm";

export async function POST(request: Request) {
  try {
    const { projectId, nodeId, prompt: customPrompt, authorNote: explicitAuthorNote, count = 4 } = await request.json();

    if (!projectId || !nodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
    }

    const drawCount = Math.min(Math.max(count, 3), 5); // 3-5张

    // ═══════════════════════════════════════════════
    // Step 1: 读数据（复用 chapter-outline 的数据准备逻辑）
    // ═══════════════════════════════════════════════
    const [project, node, allNodes, characters, summaries] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.storyNode.findUnique({ where: { id: nodeId } }),
      prisma.storyNode.findMany({
        where: { projectId, parentId: null, type: { not: "volume" } },
        orderBy: { order: "asc" },
      }),
      prisma.characterCard.findMany({ where: { projectId } }),
      prisma.chapterSummary.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 3 }),
    ]);

    if (!project || !node) {
      return NextResponse.json({ error: "项目或章节不存在" }, { status: 404 });
    }

    const nodeIndex = allNodes.findIndex((n) => n.id === nodeId);

    // 前5章上下文
    const prevNodes = allNodes.slice(Math.max(0, nodeIndex - 5), nodeIndex);
    const prevContext = prevNodes.map(n => {
      const outline = n.outline ? `\n  大纲：${n.outline.slice(0, 500)}` : "";
      const ending = n.content ? `\n  正文末段：${n.content.slice(-800)}` : "";
      return `[${n.title}]${outline}${ending}`;
    }).join("\n\n");

    // 作者指令
    const effectiveAuthorNote = explicitAuthorNote?.trim() || project.authorNote?.trim() || "";

    // ── Rules 系统注入 ──
    const outlineRules = await getActiveRules(projectId, "outline_only");
    const finalAuthorDirective = injectRules(effectiveAuthorNote, outlineRules);

    const authorDirective = finalAuthorDirective
      ? `\n## ⚠️ 作者指令——最高优先级\n${finalAuthorDirective}\n`
      : "";

    // 角色列表
    const roleLabel: Record<string, string> = {
      protagonist: "★主角", antagonist: "◆反派", mentor: "◈导师",
      love_interest: "♡恋爱", supporting: "●配角", background: "○背景",
    };
    const characterList = characters.map((c: any) => {
      const p = typeof c.personality === "object" && !Array.isArray(c.personality) ? c.personality as Record<string, unknown> : {};
      const traits = [p.dominant, p.drive, p.contradiction].filter(Boolean).join("·") || "";
      const brief = [
        `${roleLabel[c.role] || c.role} | ${c.currentStatus || "存活"}`,
        traits ? `性格：${traits}` : "",
        c.background ? c.background.slice(0, 80).replace(/\n/g, " ") : "",
      ].filter(Boolean).join(" | ");
      return `- 【${c.name}】${c.aliases?.length ? `（${c.aliases.join("、")}）` : ""} ${brief}`;
    }).join("\n");

    const recentSummary = summaries.length > 0
      ? summaries.map(s => `[${s.chapterTitle}] ${s.summary}`).join("\n")
      : "";

    const hasCustomPrompt = customPrompt?.trim();

    // ═══════════════════════════════════════════════
    // Step 2: 构建统一 prompt（选角+章纲一次完成）
    // ═══════════════════════════════════════════════
    const system = `你是小说章纲专家。每张卡片=一条独立的章节路线。

【卡片格式——纯JSON】
{
  "outline": "300-600字的完整章纲（核心冲突→情感基调→场景序列→关键对话→衔接钩子）",
  "characters": ["角色名1", "角色名2"],
  "coreConflict": "一句话——谁和谁因为什么对立",
  "mood": "情感基调标签（如：暗流涌动 / 热血沸腾 / 哀而不伤）",
  "foreshadowing": "本章可埋的伏笔方向（一句话）",
  "cardLabel": "这张卡片的特色标签（如：🔥高冲突向 / 🧊冷峻智斗向 / 💔情感向 / ⚡快节奏动作向）"
}

【选角原则】
1. 作者指令提到的人物→必须出场
2. 前文末段正在发展的人物线→自然延续
3. 章纲目标需要的人物→剧情需要谁就选谁
4. 不强行塞无关人物

【铁律】
- 作者指令 > 章纲目标 > 前文惯性
- 绝不让角色做出违背其性格和关系的行为
- 不允许凭空创造新角色
- 每条路线的章纲必须有明显不同的侧重点`;

    const userPrompt = `${authorDirective}
【章纲目标】
${hasCustomPrompt ? `用户提示词：${customPrompt}\n` : ""}本章标题：${node.title}（第${nodeIndex + 1}章）
${node.outline ? `现有大纲（如有）：${node.outline.slice(0, 300)}\n` : ""}

【作品信息】
名称：${project.name} · 类型：${project.genre.join("、")}
总纲：${project.synopsis}

【前文上下文】
${prevContext || "（本章为开头）"}
${recentSummary ? `\n最近摘要：${recentSummary}` : ""}

【角色卡】
${characterList}

请生成一条章纲路线。记住：每次调用给出不同方向的章纲。`;

    // ═══════════════════════════════════════════════
    // Step 3: 并行生成 N 张卡片（不同 temperature）
    // ═══════════════════════════════════════════════
    const temperatures = [0.3, 0.5, 0.7, 0.9, 1.0].slice(0, drawCount);

    const results = await Promise.allSettled(
      temperatures.map((temp) => callSiliconFlow({ system, prompt: userPrompt, temperature: temp, maxTokens: 4096 }))
    );

    // 解析结果
    const cards: Array<{
      outline: string; characters: string[]; coreConflict: string;
      mood: string; foreshadowing: string; cardLabel: string;
      temperature: number; error?: string;
    }> = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected") {
        cards.push({
          outline: "", characters: [], coreConflict: "", mood: "", foreshadowing: "",
          cardLabel: `路线${i + 1}（生成失败）`, temperature: temperatures[i],
          error: result.reason instanceof Error ? result.reason.message : "未知错误",
        });
        continue;
      }

      try {
        let raw = result.value.trim();
        const md = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (md) raw = md[1].trim();
        const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
        if (a >= 0 && b > a) raw = raw.slice(a, b + 1);
        const parsed = JSON.parse(raw) as Record<string, unknown>;

        cards.push({
          outline: (parsed.outline as string) || "",
          characters: Array.isArray(parsed.characters) ? parsed.characters as string[] : [],
          coreConflict: (parsed.coreConflict as string) || "",
          mood: (parsed.mood as string) || "",
          foreshadowing: (parsed.foreshadowing as string) || "",
          cardLabel: (parsed.cardLabel as string) || `路线${i + 1}`,
          temperature: temperatures[i],
        });
      } catch {
        // 解析失败——尝试当纯文本章纲
        cards.push({
          outline: result.value.slice(0, 1000),
          characters: [],
          coreConflict: "",
          mood: "",
          foreshadowing: "",
          cardLabel: `路线${i + 1}（纯文本）`,
          temperature: temperatures[i],
          error: "JSON解析失败，已转为纯文本章纲",
        });
      }
    }

    // 匹配角色详情
    const allSelectedNames = [...new Set(cards.flatMap(c => c.characters))];
    const charDetails = characters
      .filter((c: any) => allSelectedNames.some(n =>
        n.toLowerCase() === c.name.toLowerCase() ||
        (c.aliases || []).some((a: string) => a.toLowerCase() === n.toLowerCase())
      ))
      .map((c: any) => ({ id: c.id, name: c.name, role: c.role }));

    return NextResponse.json({
      nodeId,
      title: node.title,
      cards,
      totalCharacters: characters.length,
      characterDetails: charDetails,
      modelUsed: "v4-flash",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "抽卡生成失败" },
      { status: 500 }
    );
  }
}
