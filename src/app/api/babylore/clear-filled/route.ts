import { NextRequest, NextResponse } from "next/server";
import { clearFilledChapters } from "@/core/babylore/fill";
import { safeJson } from "@/lib/api-body";

// P2-①（墨白）：清理填表家族「已填」脏标记出口。
// POST { projectId: string; nodeId?: string } → 全清或单章，返回 { ok, cleared }。
export async function POST(req: NextRequest) {
  const r = await safeJson(req);
  if (!r.ok) return r.response;
  const body = r.body as any;
  const projectId = body?.projectId;
  const nodeId = typeof body?.nodeId === "string" && body.nodeId ? body.nodeId : undefined;
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json({ ok: false, error: "projectId 必填" }, { status: 400 });
  }
  const cleared = clearFilledChapters(projectId, nodeId);
  return NextResponse.json({ ok: true, cleared });
}
