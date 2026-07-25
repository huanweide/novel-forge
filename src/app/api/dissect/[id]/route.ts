import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-error";

/**
 * GET /api/dissect/[id]
 *
 * 查询拆书任务详情——包含进度、维度数据、章节列表。
 * 前端每2秒轮询此端点获取实时进度。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const task = await prisma.dissectionTask.findUnique({ where: { id } });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    return NextResponse.json({
      id: task.id,
      taskName: task.taskName,
      bookName: task.bookName,
      bookAuthor: task.bookAuthor,
      depth: task.depth,
      extractChapterSummaries: task.extractChapterSummaries,
      status: task.status,
      progress: task.progress,
      totalChapters: task.totalChapters,
      completedChapters: task.completedChapters,
      dimensions: task.dimensions,
      chapterList: task.chapterList,
      error: task.error,
      convertedToProjectId: task.convertedToProjectId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });
  } catch (err: any) {
    console.error("[dissect/[id]] 查询失败:", err);
    return jsonError(err);
  }
}

/**
 * DELETE /api/dissect/[id]
 *
 * 删除拆书任务。如果已转为项目，项目不受影响。
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const task = await prisma.dissectionTask.findUnique({ where: { id } });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    await prisma.dissectionTask.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "任务已删除" });
  } catch (err: any) {
    console.error("[dissect/[id]] 删除失败:", err);
    return jsonError(err);
  }
}
