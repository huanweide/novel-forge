import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/presets/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const preset = await prisma.preset.findUnique({ where: { id } });
    if (!preset) return NextResponse.json({ error: "预设不存在" }, { status: 404 });
    return NextResponse.json(preset);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `读取预设失败：${msg}` }, { status: 500 });
  }
}

// PUT /api/presets/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const preset = await prisma.preset.update({ where: { id }, data: { ...body, updatedAt: new Date() } });
    return NextResponse.json(preset);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `更新预设失败：${msg}` }, { status: 500 });
  }
}

// DELETE /api/presets/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prisma.preset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `删除预设失败：${msg}` }, { status: 500 });
  }
}
