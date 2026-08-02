import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT /api/projects/[id]/lore-tables/[tableId] —— 更新表格（含行编辑）
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; tableId: string }> },
) {
  try {
    const { tableId } = await params;
    const body = await request.json();
    const lt = await prisma.loreTable.update({ where: { id: tableId }, data: { ...body } } as any);
    return NextResponse.json(lt);
  } catch (e) {
    return jsonError(e);
  }
}

// DELETE /api/projects/[id]/lore-tables/[tableId]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; tableId: string }> },
) {
  const { tableId } = await params;
  await prisma.loreTable.delete({ where: { id: tableId } });
  return NextResponse.json({ ok: true });
}
