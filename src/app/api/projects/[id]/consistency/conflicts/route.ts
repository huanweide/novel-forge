import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { jsonError } from "@/lib/api";

// v1.6.51.4 B 任务：一致性冲突读写端点（与事实基线同属 /api/projects/[id]/consistency 子树）。
// GET  ?status=open|resolved|ignored  → 列出项目冲突（默认全部，按时间倒序）
// POST  { id, status }                 → 更新某冲突状态（已修正 resolved / 忽略 ignored），含 project 归属校验

const VALID_STATUS = ["open", "resolved", "ignored"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const status = req.nextUrl.searchParams.get("status");
    const where: Prisma.ConsistencyConflictWhereInput = { projectId: id };
    if (status && VALID_STATUS.includes(status)) where.status = status;
    const conflicts = await prisma.consistencyConflict.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ conflicts });
  } catch (e) {
    return jsonError((e as Error).message, 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const conflictId = String(body?.id ?? "");
    const status = String(body?.status ?? "");
    if (!conflictId) return jsonError("缺少冲突 id", 400);
    if (!VALID_STATUS.includes(status)) return jsonError("非法 status", 400);

    // 归属校验：冲突必须属于该 project，避免越权改他人数据
    const existing = await prisma.consistencyConflict.findUnique({ where: { id: conflictId } });
    if (!existing || existing.projectId !== id) return jsonError("冲突不存在或无权访问", 404);

    const updated = await prisma.consistencyConflict.update({
      where: { id: conflictId },
      data: { status },
    });
    return NextResponse.json({ ok: true, conflict: updated });
  } catch (e) {
    return jsonError((e as Error).message, 500);
  }
}
