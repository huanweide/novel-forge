/**
 * GET /api/storylines/[id] — 获取单条故事线
 * PUT /api/storylines/[id] — 更新故事线
 * DELETE /api/storylines/[id] — 删除故事线
 */
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const storyline = await prisma.storyline.findUnique({ where: { id } });
  if (!storyline) return NextResponse.json({ error: "故事线不存在" }, { status: 404 });
  return NextResponse.json(storyline);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const prev = await prisma.storyline.findUnique({ where: { id } });
    if (!prev) return NextResponse.json({ error: "故事线不存在" }, { status: 404 });

    const storyline = await prisma.storyline.update({
      where: { id },
      data: {
        type: body.type,
        parentId: body.parentId,
        title: body.title?.trim(),
        order: body.order,
        status: body.status,
        description: body.description,
        desire: body.desire,
        obstacle: body.obstacle,
        action: body.action,
        result: body.result,
        twist: body.twist,
        turn: body.turn,
        ending: body.ending,
        chapterBindings: body.chapterBindings,
      },
    });

    // v1.4.0 缝合怪推进：主线标记完成 → 无其他 active 主线 → 自动构造承接的新主线（默认开启，可在项目设定关闭）
    if (body.status === "completed" && prev.type === "main" && prev.status !== "completed") {
      try {
        const project = await prisma.project.findUnique({
          where: { id: prev.projectId },
          select: { buildConfig: true },
        });
        const bc = (project?.buildConfig as Record<string, unknown>) || {};
        const autoConstruct = bc.autoConstructNewMain !== false; // 默认开启
        if (autoConstruct) {
          const activeMain = await prisma.storyline.count({
            where: { projectId: prev.projectId, type: "main", status: "active" },
          });
          if (activeMain === 0) {
            const origin = process.env.APP_ORIGIN || "http://localhost:3001";
            void fetch(`${origin}/api/storylines/generate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectId: prev.projectId, mode: "newMain" }),
            }).catch(() => {});
          }
        }
      } catch {
        /* 缝合怪触发失败不影响主线完成本身 */
      }
    }

    return NextResponse.json(storyline);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.storyline.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return jsonError(err);
  }
}
