import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { executeUndo } from "@/core/presets/undo";

export const maxDuration = 30;

// GET /api/projects/[id]/applied-presets —— 返回该项目已应用的预设列表（AppliedRecord[]），
// 供创意工坊「已应用 / 可移除」视图渲染；每一项含 presetId / type / title / appliedAt /
// created（新建实体）/ updatedBefore（被覆盖项的旧值快照，撤销时还原）。
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    const list: any[] = Array.isArray(project.appliedPresets)
      ? (project.appliedPresets as any[])
      : [];
    return NextResponse.json(list);
  } catch (e) {
    return jsonError(e);
  }
}

// DELETE /api/projects/[id]/applied-presets  { presetId }
// 真撤销：按 apply 留下的凭证回退——先还原被覆盖的旧值，再删除本次新建的实体，最后移除追踪记录。
// 覆盖全部类型：table / style / lorebook / worldview / story_progression / character / regex / api_config。
// （旧版只对 regex、api_config 生效，其余六类仅抹追踪记录、实体残留。）
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { presetId } = (await request.json()) as any;
    if (!presetId) return NextResponse.json({ error: "缺少 presetId" }, { status: 400 });

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

    const list: any[] = Array.isArray(project.appliedPresets)
      ? (project.appliedPresets as any[])
      : [];
    const target = list.find((p) => p?.presetId === presetId);

    // 兼容旧行为：未应用过也返回成功，只是 removed=0（前端刷新列表即可）
    if (!target) {
      return NextResponse.json({
        ok: true,
        removed: 0,
        undo: { deleted: [], restored: [], skipped: [] },
      });
    }

    const undo = await executeUndo(prisma, id, target);

    // 无论撤销过程中有无单条失败，追踪记录都移除——避免"撤销了但还显示已应用"的僵尸状态
    const remaining = list.filter((p) => p?.presetId !== presetId);
    await prisma.project.update({
      where: { id },
      data: { appliedPresets: remaining as any },
    });

    return NextResponse.json({ ok: true, removed: 1, undo });
  } catch (e) {
    return jsonError(e);
  }
}
