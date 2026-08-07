/**
 * GET /api/storylines/[id] — 获取单条故事线
 * PUT /api/storylines/[id] — 更新故事线
 * DELETE /api/storylines/[id] — 删除故事线
 */
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { pickReassignMainId } from "@/core/pipeline/outline-context";
import { STORYLINE_STATUS } from "@/core/story-status";

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
    if (body.status === STORYLINE_STATUS.COMPLETED && prev.type === "main" && prev.status !== STORYLINE_STATUS.COMPLETED) {
      try {
        const project = await prisma.project.findUnique({
          where: { id: prev.projectId },
          select: { buildConfig: true },
        });
        const bc = (project?.buildConfig as Record<string, unknown>) || {};
        const autoConstruct = bc.autoConstructNewMain !== false; // 默认开启
        if (autoConstruct) {
          const activeMain = await prisma.storyline.count({
            where: { projectId: prev.projectId, type: "main", status: STORYLINE_STATUS.ACTIVE },
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
    // N3 修复：删除主线前先处理其子线，避免子线 parentId 悬空指向已删主线。
    // 优先把子线重挂到同项目另一条主线（优先活跃主线）；若无其他主线则置空。
    const target = await prisma.storyline.findUnique({
      where: { id },
      select: { id: true, projectId: true, type: true },
    });
    if (target) {
      const siblings = await prisma.storyline.findMany({
        where: { projectId: target.projectId, type: "main", id: { not: id } },
        select: { id: true, status: true },
      });
      // N3 级联重挂 + N8 回归修复：仅重挂到【活跃】兄弟主线；
      // 若只剩 completed/abandoned 兄弟则置 null，绝不挂到 completed 主线
      // （否则 formatStorylines 因 loadOutlineData 排除 completed 主线会丢失「隶属主线」前缀，R2-006 冲突）。
      const reassignId = pickReassignMainId(siblings);
      // L3-001 / L3-009：重挂子线 + 删除主线包 $transaction（原子），
      // 避免 updateMany 失败后子线 parentId 仍悬空指向已删主线。
      await prisma.$transaction([
        prisma.storyline.updateMany({
          where: { projectId: target.projectId, parentId: id },
          data: { parentId: reassignId },
        }),
        prisma.storyline.delete({ where: { id } }),
      ]);
    } else {
      // 不存在则直接尝试删除（无则报错，由原 jsonError 兜底）
      await prisma.storyline.delete({ where: { id } });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return jsonError(err);
  }
}
