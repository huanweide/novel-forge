import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/projects/[id]/lore-tables —— 列出项目结构化表格
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tables = await prisma.loreTable.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(tables);
}

// POST /api/projects/[id]/lore-tables —— 新建结构化表格
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as any;
    const { name, key, note, category, columns, rows } = body;
    if (!name || !key) return NextResponse.json({ error: "缺少 name 或 key" }, { status: 400 });

    const lt = await prisma.loreTable.create({
      data: {
        projectId: id,
        name,
        key,
        note: note || "",
        category: category || "custom",
        columns: columns || [],
        rows: rows || [],
        marker: `[ACU-${id}]`,
      } as any,
    });
    return NextResponse.json(lt);
  } catch (e) {
    return jsonError(e);
  }
}
