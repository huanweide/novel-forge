import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST /api/story/nodes/[id]/humanize
// 只写「本地过审自检分」(humanizeScore)，无副作用：
//   - 不触发正文快照（与通用 PUT 区分，避免为每个过审分凭空生成一条 revision）
//   - 不动 editVersion（乐观锁仅在手动编辑正文时 +1）
// 分数由前端 src/core/humanize 的纯本地规则引擎算出，经此接口落库，供大纲常驻展示。
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const raw = typeof body?.score === "number" ? body.score : NaN;
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
      return NextResponse.json({ error: "score 必须是 0-100 的数字" }, { status: 400 });
    }
    const node = await prisma.storyNode.update({
      where: { id },
      data: { humanizeScore: Math.round(raw) },
      select: { id: true, humanizeScore: true },
    });
    return NextResponse.json({ id: node.id, humanizeScore: node.humanizeScore });
  } catch (err) {
    return jsonError(err);
  }
}
