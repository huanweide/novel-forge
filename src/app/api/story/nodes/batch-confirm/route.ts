import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { safeFillAfterWriting } from "@/core/babylore/loop";
import { evaluateConfirmEligibility, maybeAutoDeliver, triggerForeshadowDetect } from "@/core/confirm-guard";
import { extractConsistencyFacts } from "@/core/consistency/extractFacts";
import { STATUS_COMPLETED, STATUS_CONFIRMED, STATUS_PENDING_CONFIRM } from "@/core/story-status";

/**
 * POST /api/story/nodes/batch-confirm
 * 批量确认本卷：将选中的 pending_confirm 章节一次性确认为 confirmed。
 * 质量护栏（requirePassed 默认 true）：分数低于阈值的章拦截进 blocked，不被蒙混过关。
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const nodeIds: string[] = Array.isArray(body.nodeIds) ? body.nodeIds : [];
    const requirePassed: boolean = body.requirePassed !== false; // 默认开启护栏
    if (nodeIds.length === 0) {
      return NextResponse.json({ error: "未提供 nodeIds" }, { status: 400 });
    }

    const nodes = await prisma.storyNode.findMany({ where: { id: { in: nodeIds }, deletedAt: null } });
    if (nodes.length === 0) {
      return NextResponse.json({ error: "未找到任何节点" }, { status: 404 });
    }
    const byId = new Map(nodes.map((n) => [n.id, n]));

    // 已知角色名（供 analyzeQuality 的 PoV / 主语多样性检测，纯本地零 Token）
    const projectId = nodes[0].projectId;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { characters: { select: { name: true } } },
    });
    const knownNames = (project?.characters ?? []).map((c) => c.name);

    // IMP-002：计算项目最大 order，用于判定「是否最新章」，使 skipLatestChapter 生效
    const maxOrderAgg = await prisma.storyNode.aggregate({
      where: { projectId },
      _max: { order: true },
    });
    const maxOrder = maxOrderAgg._max.order ?? 0;

    const confirmed: { id: string; title: string; score: number | null; grade: string | null }[] = [];
    const blocked: { id: string; title: string; score: number | null; grade: string | null; reason: string }[] = [];
    const skipped: { id: string; title: string; reason: string }[] = [];

    for (const id of nodeIds) {
      const node = byId.get(id);
      if (!node) {
        skipped.push({ id, title: "(未知)", reason: "节点不存在" });
        continue;
      }
      if (node.status !== STATUS_PENDING_CONFIRM) {
        skipped.push({
          id: node.id,
          title: node.title,
          reason: node.status === STATUS_CONFIRMED ? "已确认" : `状态为 ${node.status}，非待确认`,
        });
        continue;
      }

      // ── 质量护栏（统一走 confirm-guard：恢复空正文/过短<50字拦截，与 auto-confirm 同源，消除阈值分裂）──
      const el = evaluateConfirmEligibility(node, knownNames, requirePassed);
      if (!el.eligible) {
        blocked.push({ id: node.id, title: node.title, score: el.score, grade: el.grade, reason: el.reason ?? "未达标" });
        continue;
      }
      const score = el.score;

      // ── 放行：执行 confirm 副作用（复用单章确认逻辑）──
      const now = new Date();
      const prevLogs: any[] = Array.isArray(node.reviewLogs) ? node.reviewLogs : [];
      let fillMsg = "（无正文，跳过填表）";
      if (node.content && node.content.length > 0) {
        try {
          const fillRes = await safeFillAfterWriting({
            projectId: node.projectId,
            content: node.content,
            send: undefined,
            nodeOrder: node.order,
            isLatestChapter: node.order === maxOrder,
            nodeId: node.id,
            source: "batch",
          });
          // IMP-004：依据真实返回值决定文案，而非无条件声称「已执行」
          if (fillRes.ok && fillRes.applied > 0) {
            fillMsg = "自动填表已执行";
          } else {
            fillMsg = `未触发自动填表（${fillRes.error || "无事实可填"}）`;
          }
        } catch (e) {
          fillMsg = `自动填表失败（不影响确认）: ${e instanceof Error ? e.message : "未知"}`;
        }
      }
      // 幂等：条件更新（仅 pending_confirm 才终态），并发/重复确认不重复计数/追加（Max Loop Round2）
      const upd = await prisma.storyNode.updateMany({
        where: { id: node.id, status: STATUS_PENDING_CONFIRM },
        data: {
          status: STATUS_CONFIRMED,
          confirmedAt: now,
          revisionCount: { increment: 1 },
          reviewLogs: [...prevLogs, { action: "confirm", fill: fillMsg, at: now.toISOString(), batch: true }],
        },
      });
      if (upd.count === 0) {
        blocked.push({ id: node.id, title: node.title, score: null, grade: "?", reason: "状态已变化，未重复确认" });
        continue;
      }
      confirmed.push({ id: node.id, title: node.title, score, grade: el.grade });
    }

    // v1.1.0：批量确认刚定稿若干章，尝试自动整本交付（fire-and-forget，红利不阻塞响应）
    void maybeAutoDeliver(projectId).catch(() => {});

    // R2-007 收口（新坑1）：批量确认成功后统一补触发一次伏笔收束率检测。
    // detect 为整本全量重算（见 src/core/foreshadowing.ts:detectPayoffs），故在所有节点确认完后
    // 仅触发一次，避免 N 次重复全扫；用真实 request.url.origin（始终可达）。
    // 仅当确有章节被确认时才触发，避免空跑。
    if (confirmed.length > 0) {
      void triggerForeshadowDetect({ projectId, origin: new URL(request.url).origin });
      // v2.15.0（Max Loop Round25）：补触发一致性事实基线抽取，与手动确认路径对称，
      // 避免批量确认定稿后一致性面板滞后不刷新。
      void extractConsistencyFacts(projectId).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      confirmed,
      blocked,
      skipped,
      summary: { confirmed: confirmed.length, blocked: blocked.length, skipped: skipped.length },
    });
  } catch (err) {
    return jsonError(err);
  }
}
