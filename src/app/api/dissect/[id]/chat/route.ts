/**
 * POST /api/dissect/[id]/chat
 *
 * 拆书改编讨论专用对话端点。
 *
 * 与 /api/generate/chat 不同——不需要 projectId、不走 ToolContext、
 * 不查数据库。纯 LLM 对话，上下文是拆书维度数据。
 *
 * Body: { message: string, history?: {role:string,content:string}[] }
 * Response: { reply: string }
 */
import { jsonError } from "@/lib/api-error";
import { safeJson } from "@/lib/api-body";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import type { DimensionResult } from "@/core/dissect/types";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // 加载拆书数据
    const task = await prisma.dissectionTask.findUnique({
      where: { id },
      select: { dimensions: true, bookName: true, taskName: true, bookAuthor: true },
    });
    if (!task) {
      return NextResponse.json({ error: "拆书任务不存在" }, { status: 404 });
    }

    const r = await safeJson(req);
    if (!r.ok) return r.response;
    const { message, history = [] } = r.body as {
      message?: string;
      history?: Array<{ role: string; content: string }>;
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
    }

    const dims = task.dimensions as unknown as Record<string, DimensionResult>;

    // 构建维度摘要
    const dimSummary = buildDimSummary(dims);

    // 构建消息列表
    const messages: Array<{ role: string; content: string }> = [
      {
        role: "system",
        content: `你是一个小说改编顾问。用户已经用AI拆解了一本小说《${task.bookName || task.taskName}》${task.bookAuthor ? `（作者：${task.bookAuthor}）` : ""}，现在想讨论如何改编。

你有拆解的完整数据作为参考。你的任务是：
1. 理解用户的改编意图（改角色性别/性格、换世界观背景、调整设定等）
2. 给出具体的修改方案——不是泛泛而谈，而是针对拆出来的具体内容说怎么改
3. 保持对话风格自然——像编辑跟作者讨论改编方案
4. 如果用户的要求合理，直接给出方案，不要反复确认
5. 回复控制在200字以内，简洁有力

【拆书数据参考】
${dimSummary}`,
      },
    ];

    // 追加历史对话（最近10轮）
    for (const h of history.slice(-20)) {
      messages.push({
        role: h.role === "agent" ? "assistant" : "user",
        content: h.content,
      });
    }

    // 追加当前消息
    messages.push({ role: "user", content: message });

    // 调用 LLM
    const config = await getEffectiveConfig();
    const client = createLLMClient(config);
    const model = config.writerModel;

    const response = await client.chat({
      model,
      messages: messages as any,
      temperature: 0.8,
      maxTokens: 600,
    });

    return NextResponse.json({
      reply: response.content || "收到，继续说说你的想法？",
    });
  } catch (err: any) {
    console.error("[dissect/chat] 对话失败:", err);
    return jsonError(err);
  }
}

/** 构建维度摘要——给LLM足够但不冗余的上下文 */
function buildDimSummary(dims: Record<string, DimensionResult>): string {
  const priority = [
    "basic_info",
    "story_core",
    "worldview",
    "characters",
    "power_system",
    "factions",
    "plot_thread",
    "style_analysis",
  ];

  const parts: string[] = [];
  for (const key of priority) {
    const d = dims[key];
    if (d?.status === "completed" && d.content) {
      parts.push(`【${d.label}】${d.content.slice(0, 500)}`);
    }
  }
  return parts.join("\n\n") || "（暂无拆书数据）";
}
