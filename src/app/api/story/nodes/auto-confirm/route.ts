// Round3 #1：智能自动确认端点
// POST /api/story/nodes/auto-confirm
// 智能审阅模式下，生成完的章（drafting / pending_confirm）自动放行合格章、拦截不合格章。
// 复用 confirm-guard 的单一质量阈值与确认副作用，与批量确认 / 流水线挂载共享逻辑。

import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { evaluateConfirmEligibility, applyConfirm, triggerForeshadowDetect } from "@/core/confirm-guard";
import { CONFIRMABLE_STATUSES, STATUS_COMPLETED, STATUS_CONFIRMED, STATUS_OUTLINE_ONLY, STATUS_REVIEWING } from "@/core/story-status";

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
      nodes = await prisma.storyNode.findMany({ where: { id: { in: nodeIds }, deletedAt: null } });
    } else if (projectId) {
      nodes = await prisma.storyNode.findMany({
        where: { projectId, status: { in: CONFIRMABLE_STATUSES }, deletedAt: null },
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
      if (node.status === STATUS_CONFIRMED) {
        skipped.push({ id: node.id, title: node.title, reason: "已确认" });
        continue;
      }
      if (node.status === STATUS_COMPLETED || node.status === STATUS_OUTLINE_ONLY) {
        skipped.push({ id: node.id, title: node.title, reason: `状态为 ${node.status}，非待确认` });
        continue;
      }
      // 遗留态 reviewing（v0.46.90 前审校中，不再写入新数据）：不自动处理，交人工（Max Loop Round5）
      if (node.status === STATUS_REVIEWING) {
        skipped.push({ id: node.id, title: node.title, reason: "遗留态 reviewing，需人工处理" });
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

      const fillMsg = await applyConfirm({
        id: node.id,
        projectId: node.projectId,
        content: node.content,
        order: node.order,
        skipDetect: true,
      });
      if (fillMsg.startsWith("节点已确认")) {
        // 消费 applyConfirm 返回值：幂等跳过（并发/重试时节点已被确认），不虚报本次放行（Max Loop Round5）
        skipped.push({ id: node.id, title: node.title, reason: "已确认（幂等跳过，未重复计数）" });
      } else {
        confirmed.push({ id: node.id, title: node.title, score: el.score, grade: el.grade });
      }
    }

    // F3（Round-7）：循环内每个 applyConfirm 已传 skipDetect:true，避免 N 个节点各触发一次
    // 全量 detect（detectPayoffs 是 O(章数×伏笔数) 重算，并发 N 次会雪崩超时）。循环结束后
    // 统一只触发一次，与 batch-confirm 的「只触发一次」原则保持一致。
    if (confirmed.length > 0) {
      void triggerForeshadowDetect({ projectId: pid });
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
