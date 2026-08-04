/**
 * GET /api/foreshadowing/list?projectId=xxx
 *
 * 返回项目的全部伏笔/承诺，按状态分组。
 * 供前端伏笔面板使用。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { computePayoffStats } from "@/core/foreshadowing";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
  }

  try {
    const commitments = await prisma.pendingCommitment.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    // 按状态分组
    const pending = commitments.filter(
      (c) => c.status === "pending" || c.status === "detected",
    );
    const partial = commitments.filter(
      (c) => c.status === "partially_fulfilled",
    );
    const fulfilled = commitments.filter(
      (c) => c.status === "fulfilled",
    );
    const voided = commitments.filter(
      (c) => c.status === "voided",
    );

    const payoffStats = await computePayoffStats(projectId);

    return NextResponse.json({
      total: commitments.length,
      payoffStats,
      groups: {
        pending: { label: "⏳ 埋设中", count: pending.length, items: pending },
        partial: { label: "🔄 部分回收", count: partial.length, items: partial },
        fulfilled: { label: "✅ 已回收", count: fulfilled.length, items: fulfilled },
        voided: { label: "❌ 已废弃", count: voided.length, items: voided },
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
