import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { validatePresetContent } from "@/core/presets/validate";

export const maxDuration = 30;

// PUT /api/presets/[id] —— 自配置：编辑预设的 title / description / tags / content。
// 内置示范预设（isBuiltin）不直接改，需先「复刻」到名下——保护种子数据，也符合 fork 心智。
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as any;

    const preset = await prisma.preset.findUnique({ where: { id } });
    if (!preset) return NextResponse.json({ error: "预设不存在" }, { status: 404 });
    if (preset.isBuiltin) {
      return NextResponse.json(
        { error: "内置示范预设不可直接修改，请先「复刻」到你自己名下再改" },
        { status: 403 },
      );
    }

    const data: any = {};
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
    if (typeof body.description === "string") data.description = body.description;
    if (Array.isArray(body.tags)) data.tags = body.tags;
    if (body.content !== undefined) {
      if (!body.content || typeof body.content !== "object" || Array.isArray(body.content)) {
        return NextResponse.json({ error: "content 必须是对象" }, { status: 400 });
      }
      // 按预设类型校验结构：自配置改 content 时字段拼错立即报错，不写脏数据
      const v = validatePresetContent(preset.type, body.content);
      if (!v.ok) {
        return NextResponse.json(
          {
            error: `预设内容不合法：${v.errors.join("；")}`,
            errors: v.errors,
            warnings: v.warnings,
          },
          { status: 400 },
        );
      }
      data.content = body.content;
    }
    if (body.isPublic !== undefined && typeof body.isPublic === "boolean") {
      data.isPublic = body.isPublic;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
    }

    const updated = await prisma.preset.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    return jsonError(e);
  }
}

// DELETE /api/presets/[id] —— 删除预设记录。
// 内置示范预设不可删；若仍被项目应用，则拒绝并要求先撤销，
// 避免删掉预设后项目里残留「无法通过撤销入口清理」的孤儿实体。
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const preset = await prisma.preset.findUnique({ where: { id } });
    if (!preset) return NextResponse.json({ error: "预设不存在" }, { status: 404 });
    if (preset.isBuiltin) {
      return NextResponse.json({ error: "内置示范预设不可删除" }, { status: 403 });
    }

    // 本地优先：项目量不大，直接扫描已应用记录（SQLite 侧 Json 查询能力有限）
    const projects = await prisma.project.findMany({
      select: { id: true, name: true, appliedPresets: true },
    });
    const usedBy = projects.filter((p) => {
      const list = p.appliedPresets;
      return Array.isArray(list) && (list as any[]).some((x: any) => x?.presetId === id);
    });

    if (usedBy.length) {
      const names = usedBy.slice(0, 3).map((p) => p.name).join("、");
      return NextResponse.json(
        {
          error: `该预设仍被 ${usedBy.length} 个项目应用（${names}${usedBy.length > 3 ? " 等" : ""}），请先在项目里撤销后再删除`,
          usedBy: usedBy.map((p) => ({ id: p.id, name: p.name })),
        },
        { status: 409 },
      );
    }

    await prisma.preset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
