import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/rules/[id] —— 获取单条规则
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rule = await prisma.rule.findUnique({ where: { id } });
    if (!rule) {
      return NextResponse.json({ error: "规则不存在" }, { status: 404 });
    }
    return NextResponse.json(rule);
  } catch (err) {
    return jsonError(err);
  }
}

// PUT /api/rules/[id] —— 更新规则
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const rule = await prisma.rule.update({ where: { id }, data: body });
    return NextResponse.json(rule);
  } catch (err) {
    return jsonError(err);
  }
}

// DELETE /api/rules/[id] —— 删除规则
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.rule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return jsonError(err);
  }
}
