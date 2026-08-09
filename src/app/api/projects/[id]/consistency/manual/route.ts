import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api";
import { validateFactInput } from "@/core/consistency/factValidation";

/**
 * POST /api/projects/[id]/consistency/manual
 *
 * 手动新增一条一致性事实（Next-2 基线人工纠错）。
 * - source 强制为 "manual"：标记作者主权事实，重抽时不会被自动抽取覆盖/清除。
 * - 带项目存在校验与字段校验。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return jsonError("项目不存在", 404);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = validateFactInput({
      category: body.category as string | undefined,
      subject: body.subject as string | undefined,
      attribute: body.attribute as string | undefined,
      value: body.value as string | undefined,
      confidence: body.confidence as number | undefined,
    });
    if (!result.ok || !result.data) {
      return jsonError(result.error ?? "输入校验失败", 400);
    }

    const fact = await prisma.consistencyFact.create({
      data: {
        projectId: id,
        category: result.data.category,
        subject: result.data.subject,
        attribute: result.data.attribute,
        value: result.data.value,
        source: "manual", // 强制标记：手动事实，重抽保留
        confidence: result.data.confidence,
      },
    });
    return NextResponse.json({ ok: true, fact });
  } catch (e) {
    return jsonError((e as Error).message, 500);
  }
}
