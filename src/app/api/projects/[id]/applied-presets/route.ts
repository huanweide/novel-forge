import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 30;

// DELETE /api/projects/[id]/applied-presets  { presetId }
// 从 project.appliedPresets 移除记录；若记录含 ruleNames（regex 预设）则同时从
// postProcessingRules 移除同名规则；若含 configKeys（api_config 预设）则从 llmConfig 删除对应 key。
// 注意：style/lorebook/character/table 预设建立的实体不在此删除（仅移除追踪记录），避免误删用户内容。
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { presetId } = (await request.json()) as any;
    if (!presetId) return NextResponse.json({ error: "缺少 presetId" }, { status: 400 });

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

    const list: any[] = Array.isArray(project.appliedPresets)
      ? (project.appliedPresets as any[])
      : [];
    const target = list.find((p) => p.presetId === presetId);
    const remaining = list.filter((p) => p.presetId !== presetId);

    const data: any = { appliedPresets: remaining };
    if (target?.ruleNames?.length) {
      const rules: any[] = Array.isArray(project.postProcessingRules)
        ? (project.postProcessingRules as any[])
        : [];
      const nameSet = new Set(target.ruleNames as string[]);
      data.postProcessingRules = rules.filter((r) => !nameSet.has(r.name));
    }
    if (target?.configKeys?.length) {
      const cfg: any = (project as any).llmConfig || {};
      for (const k of target.configKeys as string[]) delete cfg[k];
      data.llmConfig = cfg;
    }

    await prisma.project.update({ where: { id }, data });
    return NextResponse.json({ ok: true, removed: target ? 1 : 0 });
  } catch (e) {
    return jsonError(e);
  }
}
