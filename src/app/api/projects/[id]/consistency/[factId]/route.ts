import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api";
import { validateFactInput } from "@/core/consistency/factValidation";

/**
 * PATCH /api/projects/[id]/consistency/[factId]
 *   编辑一条事实（Next-2 基线人工纠错）。部分字段更新，校验后落库。
 * DELETE /api/projects/[id]/consistency/[factId]
 *   删除一条事实。
 *
 * 两操作均带归属校验：fact.projectId 必须等于路由的 id，否则 404（防止越权改删别的项目）。
 * 手动事实（source='manual'）可编辑 / 删除；自动抽取事实同样可编辑 / 删除（作者主权）。
 */
async function loadOwnedFact(projectId: string, factId: string) {
  const fact = await prisma.consistencyFact.findUnique({ where: { id: factId } });
  if (!fact || fact.projectId !== projectId) return null;
  return fact;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; factId: string }> },
) {
  const { id, factId } = await params;
  try {
    const fact = await loadOwnedFact(id, factId);
    if (!fact) return jsonError("事实不存在或无权访问", 404);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = validateFactInput(
      {
        category: body.category as string | undefined,
        subject: body.subject as string | undefined,
        attribute: body.attribute as string | undefined,
        value: body.value as string | undefined,
        source: body.source as string | undefined,
        confidence: body.confidence as number | undefined,
      },
      {
        allowPartial: true,
        current: {
          category: fact.category,
          subject: fact.subject,
          attribute: fact.attribute,
          value: fact.value,
          source: fact.source,
          confidence: fact.confidence,
        },
      },
    );
    if (!result.ok || !result.data) {
      return jsonError(result.error ?? "输入校验失败", 400);
    }

    const updated = await prisma.consistencyFact.update({
      where: { id: factId },
      data: {
        category: result.data.category,
        subject: result.data.subject,
        attribute: result.data.attribute,
        value: result.data.value,
        source: result.data.source,
        confidence: result.data.confidence,
      },
    });
    return NextResponse.json({ ok: true, fact: updated });
  } catch (e) {
    return jsonError((e as Error).message, 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; factId: string }> },
) {
  const { id, factId } = await params;
  try {
    const fact = await loadOwnedFact(id, factId);
    if (!fact) return jsonError("事实不存在或无权访问", 404);

    await prisma.consistencyFact.delete({ where: { id: factId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError((e as Error).message, 500);
  }
}
