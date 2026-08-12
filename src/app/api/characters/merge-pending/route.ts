import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/characters/merge-pending?projectId=xxx
// 列出待确认（pending）与已应用（applied）的合并提案；pending 供用户确认/忽略，applied 供回滚。
export async function GET(request: Request) {
  try {
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }
    const revisions = await prisma.characterCardRevision.findMany({
      where: { projectId, status: { in: ["pending", "applied"] } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const items = revisions.map((r) => ({
      id: r.id,
      mainCardId: r.mainCardId,
      mergedIds: r.mergedIds,
      confidence: r.confidence,
      source: r.source,
      status: r.status,
      summary: r.summary,
      createdAt: r.createdAt,
    }));
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return jsonError(e);
  }
}
