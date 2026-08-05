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

// GET /api/projects/[id]/backup —— 导出 .nfproject 备份包（JSON，支持 ?include= 选择保留哪些设定）
// include 取值（逗号分隔）：characters, lorebook, chapters, branches, storylines, style, tables, rules
// 省略 = 全量。v0.46.58：允许用户选择导出范围。
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const includeParam = url.searchParams.get("include");
    const allowed = new Set(
      includeParam
        ? includeParam.split(",").map((s) => s.trim()).filter(Boolean)
        : ["characters", "lorebook", "chapters", "branches", "storylines", "style", "tables", "rules"]
    );

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        ...(allowed.has("characters") ? { characters: true } : {}),
        ...(allowed.has("lorebook") ? { lorebookEntries: true } : {}),
        ...(allowed.has("chapters") ? { storyNodes: { orderBy: { order: "asc" as const } } } : {}),
        ...(allowed.has("branches") ? { storyBranches: true } : {}),
        ...(allowed.has("storylines") ? { storylines: { orderBy: [{ type: "asc" as const }, { order: "asc" as const }] } } : {}),
        ...(allowed.has("style") ? { styleCards: true } : {}),
        ...(allowed.has("tables") ? { loreTables: true } : {}),
        ...(allowed.has("rules") ? { rules: true } : {}),
      },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    const bundle = {
      format: "nfproject",
      version: 1,
      exportedAt: new Date().toISOString(),
      generator: "Novel Forge",
      include: Array.from(allowed),
      excluded: ["ChapterSummary","StoryBeat","PendingCommitment","PendingItem","StoryNodeRevision","GameSession"],
      project,
    };
    const name = (project.name || "project").replace(/[^\w一-龥-]/g, "_");
    // RFC 5987：header 只能含 Latin-1，中文文件名用 filename*=UTF-8'' 百分号编码
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="nfproject-${project.id.slice(0, 8)}.nfproject"; filename*=UTF-8''${encodeURIComponent(name)}.nfproject`,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
