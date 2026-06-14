/**
 * POST /api/generate/update-style-card
 *
 * 风格卡自动更新 —— 分析最新生成章节，更新 StyleCard 量化参数。
 * 随写作演进而自动演进：句长、对话比、描写比、语气标记等。
 *
 * 请求体：{ projectId: string; chapterContent?: string }
 * 如果不传 chapterContent，则自动取最近完成的3个节点聚合分析。
 */
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getDefaultClient, getDefaultLLMConfig } from "@/core/llm/client";

const MODEL = "deepseek-ai/DeepSeek-V4-Flash";

export async function POST(request: Request) {
  try {
    const { projectId, chapterContent } = await request.json();
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    // ── 获取分析文本 ──
    let analysisText = chapterContent as string | undefined;

    if (!analysisText) {
      const recentNodes = await prisma.storyNode.findMany({
        where: { projectId, content: { not: null }, status: "completed" },
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: { content: true, title: true },
      });

      if (recentNodes.length === 0) {
        return NextResponse.json({ error: "没有已完成的章节可分析" }, { status: 400 });
      }

      analysisText = recentNodes.map(n => n.content).join("\n\n");
    }

    if (!analysisText || analysisText.trim().length < 200) {
      return NextResponse.json({ error: "文本太短，无法分析（至少200字）" }, { status: 400 });
    }

    // ── 量化分析 ──
    const sentences = analysisText.split(/[。！？\n]+/).filter(s => s.trim().length > 0);
    const totalChars = analysisText.replace(/\s/g, "").length;
    const avgSentenceLen = sentences.length > 0 ? totalChars / sentences.length : 25;

    const shortSentences = sentences.filter(s => s.length < 15).length;
    const longSentences = sentences.filter(s => s.length > 40).length;
    const shortRatio = sentences.length > 0 ? shortSentences / sentences.length : 0.3;
    const longRatio = sentences.length > 0 ? longSentences / sentences.length : 0.15;

    // 对话检测（中文引号）
    const dialogueMatches = analysisText.match(/["""][^"""]+[""」]/g) || [];
    const dialogueChars = dialogueMatches.reduce((sum, m) => sum + m.length, 0);
    const dialogueRatio = totalChars > 0 ? dialogueChars / totalChars : 0.35;

    // ── AI 语义分析（语气标记 + 风格描述）──
    const client = getDefaultClient();
    const config = getDefaultLLMConfig();

    let tonalMarkers: Record<string, number> = {};
    let styleDescription = "";
    let lexicalFeatures: Record<string, number> = {};

    try {
      const sample = analysisText.slice(0, 6000);
      const response = await client.chat({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `你是文风分析专家。阅读小说文本，输出量化分析结果。只输出JSON。`,
          },
          {
            role: "user",
            content: `分析以下小说文本的文风特征，输出JSON：

${sample}

输出格式：
{
  "tonalMarkers": {"冷峻":0.8,"热血":0.2,"克制":0.7,"幽默":0.1,"悲伤":0.0,"温暖":0.1,"讽刺":0.0,"紧张":0.3},
  "styleDescription": "一句话概括此文风特点（30字内）",
  "lexicalFeatures": {"classicalRatio":0.1,"modernRatio":0.8,"termDensity":0.3,"idiomsDensity":0.1}
}`,
          },
        ],
        temperature: 0.3,
        maxTokens: 2048,
      });

      try {
        let jsonStr = response.content.trim();
        if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
        if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
        if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
        const parsed = JSON.parse(jsonStr.trim());
        tonalMarkers = parsed.tonalMarkers || {};
        styleDescription = parsed.styleDescription || "";
        lexicalFeatures = parsed.lexicalFeatures || {};
      } catch { /* AI 分析失败不影响硬数据 */ }
    } catch { /* 网络错误不影响 */ }

    // 估算内容配比
    const estimatedAction = Math.max(0, 1 - dialogueRatio - 0.25 - 0.15);
    const actionRatio = Math.round(estimatedAction * 100) / 100;
    const descriptionRatio = 0.25;
    const innerThoughtRatio = 0.15;

    // ── 更新或创建 StyleCard ──
    const existingCard = await prisma.styleCard.findFirst({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });

    const cardData = {
      avgSentenceLength: Math.round(avgSentenceLen * 10) / 10,
      shortSentenceRatio: Math.round(shortRatio * 1000) / 1000,
      longSentenceRatio: Math.round(longRatio * 1000) / 1000,
      dialogueRatio: Math.round(dialogueRatio * 1000) / 1000,
      descriptionRatio,
      actionRatio,
      innerThoughtRatio,
      tonalMarkers: tonalMarkers as any,
      lexicalFeatures: lexicalFeatures as any,
      styleDescription: styleDescription || (existingCard?.styleDescription || ""),
      sourceChapterCount: (existingCard?.sourceChapterCount || 0) + 1,
      sampleText: analysisText.slice(0, 2000),
    };

    if (existingCard) {
      await prisma.styleCard.update({
        where: { id: existingCard.id },
        data: cardData as any,
      });
    } else {
      await prisma.styleCard.create({
        data: { projectId, ...cardData } as any,
      });
    }

    return NextResponse.json({
      ok: true,
      updated: true,
      card: {
        avgSentenceLength: cardData.avgSentenceLength,
        shortSentenceRatio: cardData.shortSentenceRatio,
        longSentenceRatio: cardData.longSentenceRatio,
        dialogueRatio: cardData.dialogueRatio,
        descriptionRatio: cardData.descriptionRatio,
        actionRatio: cardData.actionRatio,
        innerThoughtRatio: cardData.innerThoughtRatio,
        styleDescription: cardData.styleDescription,
        sourceChapterCount: cardData.sourceChapterCount,
      },
      stats: {
        analyzedChars: totalChars,
        sentenceCount: sentences.length,
        dialogueCharCount: dialogueChars,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新风格卡失败" },
      { status: 500 }
    );
  }
}
