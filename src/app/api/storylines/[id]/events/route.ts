/**
 * POST /api/storylines/[id]/events — 为故事线追加时间轴事件 / 线索（CLUE）
 *
 * 时间轴大事件（MILESTONE/EVENT）由写作/规划管线自动回写，通常不手工创建；
 * 本端点主要供用户在「线索集」手工新增线索（kind=CLUE），亦可补记 EVENT。
 */
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const storyline = await prisma.storyline.findUnique({ where: { id } });
    if (!storyline) return NextResponse.json({ error: "故事线不存在" }, { status: 404 });

    const kind = body.kind === "MILESTONE" ? "MILESTONE" : body.kind === "EVENT" ? "EVENT" : "CLUE";
    const content = typeof body.content === "string" ? body.content : "";
    if (kind !== "MILESTONE" && !content.trim()) {
      return NextResponse.json({ error: "内容不能为空" }, { status: 400 });
    }

    const event = await prisma.storylineEvent.create({
      data: {
        storylineId: id,
        kind,
        tag: typeof body.tag === "string" ? body.tag : "",
        title: typeof body.title === "string" ? body.title : "",
        content,
        position: typeof body.position === "number" ? body.position : 0,
        sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [],
      },
    });
    return NextResponse.json(event, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
