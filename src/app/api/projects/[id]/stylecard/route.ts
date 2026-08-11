/**
 * GET /api/projects/[id]/stylecard  —— 读取项目最新文风卡（StyleCard），无则返回 null
 * PUT /api/projects/[id]/stylecard  —— 新建/更新文风卡（upsert）+ 同步 globalPrompt
 *
 * 文风卡是真正被 sync-global-prompt 注入「文风设定」段落的真相源（优先于 llmConfig.povType 兜底）。
 * 此前文风卡只由 dissect / explore / 预设套用等派生流程写入，没有独立编辑入口；
 * 本路由把它暴露出来，让用户在 PostGenPanel 的「文风」Tab 直接调参并即时生效。
 */
import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

const POV_VALUES = ["first_person", "third_person_limited", "third_person_omniscient", "second_person", ""];

function clampRatio(v: unknown): number | null {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  return Math.max(0, Math.min(1, v));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const card = await prisma.styleCard.findFirst({
      where: { projectId: id },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ card: card || null });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

    const povType = typeof body.povType === "string" && POV_VALUES.includes(body.povType) ? body.povType : null;
    const data: Record<string, unknown> = {};
    // 仅写入有有效值的字段；非可空字段（Float / String 无 ?）绝不通 null，
    // 否则 PrismaClientValidationError 直接拒绝 create。省略的字段在 create 时回落
    // @default，在 update 时保持原值——比「填空默认」更贴合用户真实意图。
    if (typeof body.narrativeDistance === "string" && body.narrativeDistance.trim() !== "")
      data.narrativeDistance = body.narrativeDistance.trim();
    if (typeof body.styleDescription === "string") data.styleDescription = body.styleDescription;
    if (typeof body.sampleText === "string") data.sampleText = body.sampleText;
    const dr = clampRatio(body.dialogueRatio); if (dr !== null) data.dialogueRatio = dr;
    const descR = clampRatio(body.descriptionRatio); if (descR !== null) data.descriptionRatio = descR;
    const actR = clampRatio(body.actionRatio); if (actR !== null) data.actionRatio = actR;
    const inR = clampRatio(body.innerThoughtRatio); if (inR !== null) data.innerThoughtRatio = inR;
    if (typeof body.avgSentenceLength === "number" && !Number.isNaN(body.avgSentenceLength))
      data.avgSentenceLength = body.avgSentenceLength;
    if (povType !== null) data.povType = povType;

    const existing = await prisma.styleCard.findFirst({
      where: { projectId: id },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    const saved = existing
      ? await prisma.styleCard.update({ where: { id: existing.id }, data })
      : await prisma.styleCard.create({ data: { projectId: id, ...data } as any });

    // 文风卡变更后立即刷新 globalPrompt，下次生成即时生效
    syncGlobalPrompt(id).catch((e) => {
      console.error("文风卡保存后 globalPrompt 刷新失败:", e instanceof Error ? e.message : String(e));
    });

    return NextResponse.json({ card: saved });
  } catch (err) {
    return jsonError(err);
  }
}
