import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runDissection } from "@/core/dissect/engine";
import type { DissectDepth } from "@/core/dissect/types";

/**
 * POST /api/dissect/start
 *
 * 启动拆书任务。接收原文文本 + 元数据，创建任务记录后异步执行拆解。
 * 返回任务 ID，前端轮询 GET /api/dissect/[id] 获取进度。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      taskName,
      bookName,
      bookAuthor = "",
      originalText,
      depth = "standard",
      extractChapterSummaries = false,
    } = body as {
      taskName?: string;
      bookName?: string;
      bookAuthor?: string;
      originalText?: string;
      depth?: DissectDepth;
      extractChapterSummaries?: boolean;
    };

    // 验证必填字段
    if (!originalText || originalText.trim().length < 100) {
      return NextResponse.json(
        { error: "原文太短，至少需要100字" },
        { status: 400 },
      );
    }

    if (!bookName && !taskName) {
      return NextResponse.json(
        { error: "请填写任务名称或原书名称" },
        { status: 400 },
      );
    }

    const validDepths: DissectDepth[] = ["quick", "standard", "deep"];
    if (!validDepths.includes(depth)) {
      return NextResponse.json(
        { error: `无效的拆解深度：${depth}。可选值：quick, standard, deep` },
        { status: 400 },
      );
    }

    // 创建任务
    const task = await prisma.dissectionTask.create({
      data: {
        taskName: taskName || bookName || "未命名拆书",
        bookName: bookName || taskName || "未知书名",
        bookAuthor,
        originalText: originalText.trim(),
        depth,
        extractChapterSummaries,
        status: "pending",
        progress: 0,
      },
    });

    // 异步执行拆解（不阻塞响应）
    runDissection({
      taskId: task.id,
      depth,
      extractChapterSummaries,
    }).catch((err) => {
      console.error(`[dissect] 任务 ${task.id} 失败:`, err);
    });

    return NextResponse.json({
      taskId: task.id,
      status: task.status,
      message: "拆书任务已创建，正在后台执行",
    });
  } catch (err: any) {
    console.error("[dissect/start] 创建任务失败:", err);
    return NextResponse.json(
      { error: err?.message || "创建任务失败" },
      { status: 500 },
    );
  }
}
