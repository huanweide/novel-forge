import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/dissect/list
 *
 * 返回所有拆书任务列表，按创建时间倒序。
 * 不返回原文全文（太大了），只返回元数据。
 */
export async function GET() {
  try {
    const tasks = await prisma.dissectionTask.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        taskName: true,
        bookName: true,
        bookAuthor: true,
        depth: true,
        extractChapterSummaries: true,
        status: true,
        progress: true,
        totalChapters: true,
        completedChapters: true,
        error: true,
        convertedToProjectId: true,
        createdAt: true,
        updatedAt: true,
        // 不返回 originalText（太大）和 dimensions（加载详情时才拿）
      },
    });

    return NextResponse.json({ tasks });
  } catch (err: any) {
    console.error("[dissect/list] 查询失败:", err);
    return NextResponse.json(
      { error: err?.message || "查询列表失败" },
      { status: 500 },
    );
  }
}
