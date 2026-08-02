/**
 * GET /api/cron/memory-decay
 *
 * 长效记忆衰减定时清理 —— 模拟人类记忆遗忘曲线。
 * 由外部 cron 定时调用，也可手动触发。
 *
 * 衰减规则：
 *   S 级 → 永久保留
 *   A 级 → 超 30 章降为 B
 *   B 级 → 超 15 章降为 C
 *   C 级 → 超 5 章删除
 *
 * 查询参数：
 *   projectId — 必填，要清理的项目
 *   dryRun    — 可选，"true" 时只统计不实际写入
 */
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { cleanupExpiredMemories, DECAY_RULES } from "@/lib/memory-decay";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const dryRun = searchParams.get("dryRun") === "true";

    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    // 验证项目存在
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    // 如果是 dryRun，返回衰减规则 + 当前统计（轻量预览）
    if (dryRun) {
      const summaryCount = await prisma.chapterSummary.count({ where: { projectId } });
      const latestNode = await prisma.storyNode.findFirst({
        where: { projectId },
        orderBy: { order: "desc" },
        select: { order: true, title: true },
      });
      const latestChapter = latestNode ? (latestNode.order as number) + 1 : 0;

      return NextResponse.json({
        dryRun: true,
        project: { id: project.id, name: project.name },
        latestChapter,
        summaryCount,
        rules: DECAY_RULES,
        hint: "将 dryRun=false 以执行实际衰减清理",
      });
    }

    // 执行实际清理
    const stats = await cleanupExpiredMemories(projectId);

    return NextResponse.json({
      success: true,
      project: { id: project.id, name: project.name },
      ...stats,
      rules: DECAY_RULES,
    });
  } catch (err) {
    return jsonError(err);
  }
}
