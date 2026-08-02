/**
 * POST /api/lorebook/[id]/autofill
 *
 * AI 自动补全世界书词条的缺失内容。
 * 检查 content 是否过短、keys 是否缺失，调用 LLM 补全。
 *
 * Response: { filled: string[], entry: LorebookEntry }
 */
import { jsonError } from "@/lib/api-error";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const entry = await prisma.lorebookEntry.findUnique({
      where: { id },
      include: { project: { select: { globalPrompt: true, synopsis: true, genre: true } } },
    });
    if (!entry) {
      return NextResponse.json({ error: "词条不存在" }, { status: 404 });
    }

    const emptyFields: string[] = [];
    if (!entry.content || entry.content.length < 30) emptyFields.push("content");
    if (!entry.keys || entry.keys.length === 0) emptyFields.push("keys");

    if (emptyFields.length === 0) {
      return NextResponse.json({
        filled: [] as string[],
        entry,
        message: "词条内容已完整",
      });
    }

    const config = await getEffectiveConfig();
    const client = createLLMClient(config);
    const model = config.writerModel;

    const prompt = `请为以下小说世界设定词条补全内容。

【词条标题】${entry.title}
【词条分类】${entry.category}
【已有内容】${(entry.content || "").slice(0, 300) || "（无）"}
【已有触发词】${(entry.keys || []).join("、") || "（无）"}

【项目上下文】
${(entry.project?.synopsis || "").slice(0, 300)}
${(entry.project?.globalPrompt || "").slice(0, 500)}

【要求】
1. 内容控制在200字以内，简洁有力
2. 提供5-8个触发关键词（2-6字的专有名词）
3. 如果词条是地点类，描述地理位置和特点
4. 如果词条是势力类，描述成员和影响力
5. 内容必须原创，符合该小说的世界观

输出JSON格式：
{
  "content": "词条详细内容...",
  "keys": ["关键词1", "关键词2", "关键词3"]
}`;

    const response = await client.chat({
      model,
      messages: [
        { role: "system", content: "你是一位专业小说世界观设计师。只返回JSON，不客套。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      maxTokens: 1024,
    });

    const rawContent = response.content || "";
    let filledData: Record<string, any> = {};

    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        filledData = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // 解析失败，用原始内容
      if (rawContent.length > 10 && emptyFields.includes("content")) {
        filledData.content = rawContent.slice(0, 500);
      }
    }

    const updateData: Record<string, any> = {};
    if (filledData.content && emptyFields.includes("content")) {
      updateData.content = filledData.content;
    }
    if (filledData.keys && Array.isArray(filledData.keys) && emptyFields.includes("keys")) {
      updateData.keys = filledData.keys;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.lorebookEntry.update({
        where: { id },
        data: updateData,
      });
      syncGlobalPrompt(entry.projectId).catch(() => {});
    }

    const updated = await prisma.lorebookEntry.findUnique({ where: { id } });

    return NextResponse.json({
      filled: Object.keys(updateData),
      entry: updated,
      message: `已补全 ${Object.keys(updateData).length} 个字段: ${Object.keys(updateData).join("、")}`,
    });
  } catch (err: any) {
    console.error("[lorebook/autofill] 补全失败:", err);
    return jsonError(err);
  }
}
