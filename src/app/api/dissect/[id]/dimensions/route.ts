import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { DimensionResult } from "@/core/dissect/types";

/**
 * GET /api/dissect/[id]/dimensions
 *
 * 只返回维度数据（相比完整 GET /api/dissect/[id] 更轻量）。
 * 用于仿写面板下拉选择拆书记录后加载维度。
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const task = await prisma.dissectionTask.findUnique({
      where: { id },
      select: {
        id: true,
        taskName: true,
        bookName: true,
        bookAuthor: true,
        status: true,
        dimensions: true,
        totalChapters: true,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const dims = task.dimensions as unknown as Record<string, DimensionResult>;
    const available = Object.entries(dims)
      .filter(([, v]) => v?.status === "completed" && v?.content)
      .map(([k, v]) => ({
        key: k,
        label: v.label,
        icon: v.icon,
        preview: v.content.slice(0, 200),
      }));

    return NextResponse.json({
      taskId: task.id,
      taskName: task.taskName,
      bookName: task.bookName,
      bookAuthor: task.bookAuthor,
      status: task.status,
      totalChapters: task.totalChapters,
      availableDimensions: available,
      dimensions: task.dimensions,
    });
  } catch (err: any) {
    console.error("[dissect/dimensions] 查询失败:", err);
    return NextResponse.json(
      { error: err?.message || "查询维度失败" },
      { status: 500 },
    );
  }
}
