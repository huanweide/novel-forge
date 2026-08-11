/**
 * POST /api/agent/content-safety
 *
 * 内容安全审核（规则分类，零 LLM）。对传入文本做本地扫描，
 * 返回风险点 / 严重度 / 命中词 / 上下文 / 建议。
 *
 * 请求体：{ projectId, text }
 */
import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { analyzeContentSafety } from "@/core/pipeline/content-safety";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { projectId, text } = await request.json();
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "缺少待审文本" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const result = analyzeContentSafety(text);
    return NextResponse.json(result);
  } catch (err) {
    console.error("内容安全审核失败:", err);
    return jsonError(err);
  }
}
