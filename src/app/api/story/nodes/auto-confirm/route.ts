// Round3 #1：智能自动确认端点
// POST /api/story/nodes/auto-confirm
// 智能审阅模式下，生成完的章（drafting / pending_confirm）自动放行合格章、拦截不合格章。
// 复用 confirm-guard 的单一质量阈值与确认副作用，与批量确认 / 流水线挂载共享逻辑。

import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { evaluateConfirmEligibility, applyConfirm } from "@/core/confirm-guard";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const nodeIds: string[] = Array.isArray(body.nodeIds) ? body.nodeIds : [];
    const projectId: string | undefined =
      typeof body.projectId === "string" ? body.projectId : undefined;
    const requirePassed: boolean = body.requirePassed !== false; // 默认开启质量护栏

    // 目标节点：显式 nodeIds 优先；否则扫 projectId 下所有未确认章（drafting + pending_confirm）
    let nodes;
    if (nodeIds.length > 0) {
      nodes = await prisma.storyNode.findMany({ where: { id: { in: nodeIds } } });
    } else if (projectId) {
      nodes = await prisma.storyNode.findMany({
        where: { projectId, status: { in: ["drafting", "pending_confirm"] } },
      });
    } else {
      return NextResponse.json({ error: "需提供 nodeIds 或 projectId" }, { status: 400 });
    }
    if (nodes.length === 0) {
      return NextResponse.json({
        ok: true,
        confirmed: [],
        blocked: [],
        skipped: [],
        summary: { confirmed: 0, blocked: 0, skipped: 0 },
      });
    }

    const pid = projectId ?? nodes[0].projectId;
    const project = await prisma.project.findUnique({
      where: { id: pid },
      include: { characters: { select: { name: true } } },
    });
    const knownNames = (project?.characters ?? []).map((c) => c.name);

    const confirmed: { id: string; title: string; score: number | null; grade: string | null }[] = [];
    const blocked: { id: string; title: string; score: number | null; grade: string | null; reason: string }[] = [];
    const skipped: { id: string; title: string; reason: string }[] = [];

    for (const node of nodes) {
      if (node.status === "confirmed") {
        skipped.push({ id: node.id, title: node.title, reason: "已确认" });
        continue;
      }
      if (node.status === "completed" || node.status === "outline_only") {
        skipped.push({ id: node.id, title: node.title, reason: `状态为 ${node.status}，非待确认` });
        continue;
      }

      const el = evaluateConfirmEligibility(node, knownNames, requirePassed);
      if (!el.eligible) {
        blocked.push({
          id: node.id,
          title: node.title,
          score: el.score,
          grade: el.grade,
          reason: el.reason ?? "未达标",
        });
        continue;
      }
      // 审校联动（Max Loop 审查 P2）：护栏开启时，任一审校 passed=false（如逻辑自查 major 缺陷）不自动放行，交人工介入
      if (requirePassed) {
        const reviewLogs: any[] = Array.isArray(node.reviewLogs) ? node.reviewLogs : [];
        if (reviewLogs.some((l) => l && l.passed === false)) {
          blocked.push({
            id: node.id,
            title: node.title,
            score: el.score,
            grade: el.grade,
            reason: "审校未通过（passed=false），需人工介入",
          });
          continue;
        }
      }

      await applyConfirm({
        id: node.id,
        projectId: node.projectId,
        content: node.content,
        order: node.order,
      });
      confirmed.push({ id: node.id, title: node.title, score: el.score, grade: el.grade });
    }

    return NextResponse.json({
      ok: true,
      confirmed,
      blocked,
      skipped,
      summary: {
        confirmed: confirmed.length,
        blocked: blocked.length,
        skipped: skipped.length,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
