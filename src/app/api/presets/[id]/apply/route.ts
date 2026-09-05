import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import { computeApplyPlan, summarizePlan, PresetPlanError } from "@/core/presets/plan";
import { executeApplyPlan } from "@/core/presets/apply";

export const maxDuration = 60;

// POST /api/presets/[id]/apply  { projectId, dryRun? }
//
// dryRun=true（预览/确认）：只读计算「将要注入什么」，返回逐条计划 + 汇总；
//   不落库、不计下载数、不写 appliedPresets。前端据此渲染确认弹窗，
//   用户看清「会新建几条 / 覆盖几条 / 跳过几条」后再决定套用。
//
// dryRun 缺省或 false（真实套用）：按同一份计划执行注入，并把「撤销凭证」
//   （新建实体 id 列表 + 被覆盖项的旧值快照）写进 project.appliedPresets，
//   供撤销端点精准回退——六类预设均支持，不再只抹追踪记录。
//
// 计划与执行同源，保证「预览看到几条，实际就注入几条」，不会出现预览与实际不一致。
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { projectId, dryRun } = (await request.json()) as any;
    if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

    const preset = await prisma.preset.findUnique({ where: { id } });
    if (!preset) return NextResponse.json({ error: "预设不存在" }, { status: 404 });

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

    let plan;
    try {
      plan = await computeApplyPlan(prisma, projectId, {
        type: preset.type,
        content: preset.content,
      });
    } catch (e) {
      // 未知类型 400 / 危险正则 422：统一以人类可读文案返回，不再静默 no-op
      if (e instanceof PresetPlanError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    const summary = summarizePlan(plan);

    // 预览：绝不落库
    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        presetId: id,
        title: preset.title,
        type: preset.type,
        plan,
        summary,
      });
    }

    const record = await executeApplyPlan(
      prisma,
      projectId,
      { id, type: preset.type, title: preset.title },
      plan,
    );

    // 记录已应用预设（同预设重复套用则先剔除旧记录，始终保留最新一份撤销凭证）
    try {
      const list: any[] = Array.isArray(project.appliedPresets)
        ? (project.appliedPresets as any[])
        : [];
      const filtered = list.filter((p: any) => p?.presetId !== id);
      filtered.push(record);
      await prisma.project.update({
        where: { id: projectId },
        data: { appliedPresets: filtered as any },
      });
    } catch (e) {
      console.error("[apply] 记录 appliedPresets 失败:", e instanceof Error ? e.message : String(e));
    }

    // 应用预设后刷新全局提示词，使文风/世界观/角色等立即对生成生效
    syncGlobalPrompt(projectId).catch((e) =>
      console.error("[apply] globalPrompt 刷新失败:", e instanceof Error ? e.message : String(e)),
    );

    await prisma.preset.update({ where: { id }, data: { downloads: { increment: 1 } } });

    return NextResponse.json({ ok: true, plan, summary, record });
  } catch (e) {
    return jsonError(e);
  }
}
