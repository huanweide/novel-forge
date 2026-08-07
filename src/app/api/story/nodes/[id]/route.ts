import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { snapshotRevision } from "@/lib/versions";
import { safeFillAfterWriting } from "@/core/babylore/loop";
import { STATUS_COMPLETED, STATUS_CONFIRMED, STATUS_DRAFTING, STATUS_PENDING_CONFIRM } from "@/core/story-status";
import { maybeAutoDeliver, triggerForeshadowDetect } from "@/core/confirm-guard";

// GET /api/story/nodes/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const node = await prisma.storyNode.findUnique({
      where: { id },
      include: { children: { orderBy: { order: "asc" } } },
    });
    if (!node) {
      return NextResponse.json({ error: "节点不存在" }, { status: 404 });
    }
    return NextResponse.json(node);
  } catch (err) {
    return jsonError(err);
  }
}

// PUT /api/story/nodes/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    // FE-N8：乐观锁——客户端可携带 expectedVersion，与库内 editVersion 比对以检测并发冲突
    const expectedVersion =
      typeof body.expectedVersion === "number" ? body.expectedVersion : undefined;

    // BE-1：手动保存前快照当前正文（去重由 helper 处理）
    const existingNode = await prisma.storyNode.findUnique({
      where: { id },
      select: { content: true, wordCount: true, projectId: true, editVersion: true },
    });
    if (!existingNode) {
      return NextResponse.json({ error: "节点不存在" }, { status: 404 });
    }

    // FE-N8：编辑期间节点已被改写（如 AI 流式改写 outline）→ 409 冲突，返回库里当前快照
    if (expectedVersion !== undefined && existingNode.editVersion !== expectedVersion) {
      const server = await prisma.storyNode.findUnique({ where: { id } });
      return NextResponse.json(
        {
          conflict: true,
          message:
            "保存冲突：该节点在您编辑期间已被其他操作（如 AI 改写）更新，请用冲突面板决定如何合并。",
          server: server
            ? {
                editVersion: server.editVersion,
                title: server.title,
                outline: server.outline,
                content: server.content,
              }
            : null,
        },
        { status: 409 }
      );
    }

    if (body.content !== existingNode.content) {
      await snapshotRevision({
        nodeId: id,
        projectId: existingNode.projectId,
        source: "manual",
        prevContent: existingNode.content ?? "",
        prevWordCount: existingNode.wordCount,
      });
    }

    const node = await prisma.storyNode.update({
      where: expectedVersion !== undefined ? { id, editVersion: expectedVersion } : { id },
      data: {
        title: body.title,
        order: body.order,
        status: body.status,
        outline: body.outline,
        content: body.content,
        wordCount: body.wordCount,
        qualityScore: body.qualityScore,
        branchId: body.branchId,
        isMainBranch: body.isMainBranch,
        activeCharacters: body.activeCharacters,
        activeLoreIds: body.activeLoreIds,
        coreConflict: body.coreConflict,
        settingDescription: body.settingDescription,
        worldTime: body.worldTime,
        notes: body.notes,
        reviewLogs: body.reviewLogs,
        revisionCount: body.revisionCount,
        // FE-N8：每次成功保存版本号 +1，作为下一次保存的乐观锁基准
        editVersion: { increment: 1 },
      },
    });
    return NextResponse.json(node);
  } catch (err) {
    // FE-N8：并发窗口（预检后、更新前）节点又被改 → P2025，降级为 409 冲突
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      const p = await params;
      const server = await prisma.storyNode.findUnique({ where: { id: p.id } }).catch(() => null);
      return NextResponse.json(
        {
          conflict: true,
          message: "保存冲突：该节点刚刚被其他操作更新，请用冲突面板决定如何合并。",
          server: server
            ? {
                editVersion: server.editVersion,
                title: server.title,
                outline: server.outline,
                content: server.content,
              }
            : null,
        },
        { status: 409 }
      );
    }
    return jsonError(err);
  }
}

// PATCH /api/story/nodes/[id] —— 确认流程动作（submit/confirm/reject/reopen/diagnose）
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const action = body.action as "submit" | "confirm" | "reject" | "reopen" | "diagnose" | undefined;
    if (!action) return NextResponse.json({ error: "缺少 action" }, { status: 400 });

    const node = await prisma.storyNode.findUnique({ where: { id } });
    if (!node) return NextResponse.json({ error: "节点不存在" }, { status: 404 });

    const now = new Date();
    const prevLogs: any[] = Array.isArray(node.reviewLogs) ? node.reviewLogs : [];
    const pushLog = (entry: Record<string, unknown>) => [...prevLogs, { ...entry, at: now.toISOString() }];

    let data: Record<string, unknown> = {};

    switch (action) {
      case "submit": {
        if (node.status !== STATUS_COMPLETED && node.status !== STATUS_DRAFTING) {
          return NextResponse.json({ error: `当前状态(${node.status})不可提交确认` }, { status: 409 });
        }
        data = { status: STATUS_PENDING_CONFIRM, reviewLogs: pushLog({ action: "submit" }) };
        break;
      }
      case "confirm": {
        if (node.status !== STATUS_PENDING_CONFIRM) {
          return NextResponse.json({ error: `当前状态(${node.status})不可确认通过` }, { status: 409 });
        }
        // 人工确认护栏（与 guard 空正文/过短拦截对齐）：防止误点放行废章（Max Loop 审查 P3）
        if (!node.content || node.content.trim().length < 50) {
          return NextResponse.json({ error: "正文为空或过短（少于50字），不可确认通过" }, { status: 422 });
        }
        // 确认副作用：触发自动填表（回填结构化表格 / 记忆）—— 这是 confirm 的副作用，而非 write 的副作用
        let fillMsg = "（无正文，跳过填表）";
        if (node.content && node.content.length > 0) {
          // IMP-002：用「node.order === 项目最大 order」判定最新章，使 skipLatestChapter 生效
          let isLatestChapter = false;
          try {
            const agg = await prisma.storyNode.aggregate({
              where: { projectId: node.projectId },
              _max: { order: true },
            });
            isLatestChapter = node.order === (agg._max.order ?? node.order);
          } catch {
            /* 聚合失败则按非最新处理（保守：不跳过，仍可能填表） */
          }
          try {
            const fillRes = await safeFillAfterWriting({
              projectId: node.projectId,
              content: node.content,
              send: undefined,
              nodeOrder: node.order,
              isLatestChapter,
              nodeId: node.id,
              source: "manual",
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
        // 幂等：条件更新（仅 pending_confirm 才终态），重复/并发点击不重复计数/追加（Max Loop 审查 P7）
        const upd = await prisma.storyNode.updateMany({
          where: { id, status: STATUS_PENDING_CONFIRM },
          data: {
            status: STATUS_CONFIRMED,
            confirmedAt: now,
            revisionCount: { increment: 1 },
            reviewLogs: pushLog({ action: "confirm", fill: fillMsg }),
          },
        });
        if (upd.count === 0) {
          return NextResponse.json({ error: "节点状态已变化，未重复确认" }, { status: 409 });
        }
        // IMP-007 / R2-007 收口：确认通过后异步触发伏笔收束率检测。
        // 用真实 request.url.origin（始终可达）+ 共享 helper（失败日志 + 轻量重试）。
        void triggerForeshadowDetect({ projectId: node.projectId, origin: new URL(request.url).origin });
        const fresh = await prisma.storyNode.findUnique({ where: { id } });
        // v1.1.0：手动确认刚定稿，尝试自动整本交付（fire-and-forget，红利不阻塞响应）
        void maybeAutoDeliver(node.projectId).catch(() => {});
        return NextResponse.json(fresh);
      }
      case "reject": {
        if (node.status !== STATUS_PENDING_CONFIRM) {
          return NextResponse.json({ error: `当前状态(${node.status})不可打回` }, { status: 409 });
        }
        const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "（未填写理由）";
        data = {
          status: STATUS_COMPLETED,
          revisionCount: { increment: 1 },
          reviewLogs: pushLog({ action: "reject", reason }),
        };
        // 打回使整本回到未交付状态
        await prisma.project.updateMany({ where: { id: node.projectId, confirmedAt: { not: null } }, data: { confirmedAt: null } });
        break;
      }
      case "reopen": {
        if (node.status !== STATUS_CONFIRMED) {
          return NextResponse.json({ error: `当前状态(${node.status})不可重开` }, { status: 409 });
        }
        data = { status: STATUS_COMPLETED, confirmedAt: null, reviewLogs: pushLog({ action: "reopen" }) };
        // 重开使整本回到未交付状态
        await prisma.project.updateMany({ where: { id: node.projectId, confirmedAt: { not: null } }, data: { confirmedAt: null } });
        break;
      }
      case "diagnose": {
        // 不改动状态，仅留痕（UI 打开 PostGenPanel 审校 Tab）
        data = { reviewLogs: pushLog({ action: "diagnose" }) };
        break;
      }
      default:
        return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 });
    }

    const updated = await prisma.storyNode.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (err) {
    return jsonError(err);
  }
}

// DELETE /api/story/nodes/[id] —— 删除节点并自动重新编号章节
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const node = await prisma.storyNode.findUnique({ where: { id } });
    if (!node) {
      return NextResponse.json({ error: "节点不存在" }, { status: 404 });
    }

    // 级联删除子节点
    await prisma.storyNode.deleteMany({ where: { parentId: id } });
    await prisma.storyNode.delete({ where: { id } });

    // 如果删除的是顶层章节（parentId=null, type=chapter），重新编号所有剩余章节
    if (node.parentId === null && (node.type === "chapter" || node.type === "section")) {
      const remaining = await prisma.storyNode.findMany({
        where: { projectId: node.projectId, parentId: null, type: { not: "volume" } },
        orderBy: { order: "asc" },
      });

      const cnDigits = ["零","一","二","三","四","五","六","七","八","九","十","十一","十二","十三","十四","十五","十六","十七","十八","十九","二十","二十一","二十二","二十三","二十四","二十五","二十六","二十七","二十八","二十九","三十"];
      const toCn = (n: number) => cnDigits[n] || String(n);

      for (let i = 0; i < remaining.length; i++) {
        const ch = remaining[i];
        // 提取原标题中冒号后的部分（如果有的话）
        const rawTitle = (ch.title || "").replace(/^第[一二三四五六七八九十百千\d]+章[：:]\s*/, "");
        const newTitle = rawTitle
          ? `第${toCn(i + 1)}章：${rawTitle}`
          : `第${toCn(i + 1)}章`;
        await prisma.storyNode.update({
          where: { id: ch.id },
          data: { title: newTitle, order: i },
        });
      }
    }

    return NextResponse.json({ success: true, renumbered: true });
  } catch (err) {
    return jsonError(err);
  }
}
