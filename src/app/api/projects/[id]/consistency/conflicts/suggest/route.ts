import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { suggestConflictFix } from "@/core/consistency/suggestFix";

// v1.6.51.5 Next-1：一致性冲突修正建议（按需生成，不落库）。
// POST { id: conflictId } → { ok, suggestion }；含 project 归属校验（冲突必须属于路径 projectId）。

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params; // projectId
  try {
    const body = await req.json().catch(() => ({}));
    const conflictId = String(body?.id ?? "");
    if (!conflictId) return jsonError("缺少冲突 id", 400);

    const result = await suggestConflictFix(id, conflictId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("无权") || msg.includes("不存在")) return jsonError(msg, 404);
    return jsonError(msg, 500);
  }
}
