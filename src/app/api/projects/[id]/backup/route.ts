import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { NextResponse } from "next/server";

// 备份包含的关联表（匹配计划：章节 + 角色 + 世界书 + 规则 + 文风 + 分支 + 剧情线 + 文风卡 + 世界表）
const INCLUDE: Prisma.ProjectInclude = {
  characters: true,
  lorebookEntries: true,
  storyNodes: { orderBy: { order: "asc" } },
  storyBranches: true,
  storylines: { orderBy: [{ type: "asc" }, { order: "asc" }] },
  styleCards: true,
  loreTables: true,
  rules: true,
};

// GET /api/projects/[id]/backup —— 导出 .nfproject 备份包（JSON 全量）
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({ where: { id }, include: INCLUDE });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    const bundle = {
      format: "nfproject",
      version: 1,
      exportedAt: new Date().toISOString(),
      generator: "Novel Forge",
      project,
    };
    const name = (project.name || "project").replace(/[^\w一-龥-]/g, "_");
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.nfproject"`,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
