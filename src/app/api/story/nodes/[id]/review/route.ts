import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanForbiddenWordsEnhanced } from "@/lib/forbidden-checker";
import { analyzeQuality } from "@/lib/quality-analyzer";
import type { ReviewIssueType } from "@/core/types";

// POST /api/story/nodes/[id]/review
// 确认流程「AI诊断」按钮：纯本地六维质量诊断（零 Token、不依赖 LLM/代理），
// 返回与前端 reviewResult 兼容的 { passed, overallScore, grade, issues }。
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const node = await prisma.storyNode.findUnique({ where: { id } });
    if (!node) {
      return NextResponse.json({ error: "节点不存在" }, { status: 404 });
    }
    const content: string = (node.content as string) || "";
    if (!content.trim()) {
      return NextResponse.json({ error: "正文为空，无法诊断" }, { status: 400 });
    }
    const project = node.projectId
      ? await prisma.project.findUnique({
          where: { id: node.projectId },
          include: { characters: true },
        })
      : null;
    const characterNames = (project?.characters || []).map((c: any) => c.name);

    // 1. 废词扫描（与后处理管线同算法）
    const scanResult = scanForbiddenWordsEnhanced(content, {});
    // 2. 六维质量评分（纯本地算法）
    const qr = analyzeQuality(content, characterNames, {
      forbiddenMatches: scanResult.matches,
    });

    const mapDimKey = (key: string): ReviewIssueType => {
      switch (key) {
        case "showVsTell":
          return "description_density";
        case "povConsistency":
          return "continuity_error";
        case "sentenceVariety":
          return "dialogue_quality";
        case "forbidden":
          return "lore_conflict";
        default:
          return "pacing";
      }
    };

    const issues: {
      type: ReviewIssueType;
      severity: "critical" | "major" | "minor";
      description: string;
      location: string | null;
      suggestion: string | null;
    }[] = [];

    // 维度级问题
    for (const d of qr.dimensions || []) {
      const severity: "critical" | "major" | "minor" =
        d.score < 60 ? "critical" : d.score < 75 ? "major" : "minor";
      for (const iss of (d.issues || []).slice(0, 3)) {
        issues.push({
          type: mapDimKey(d.key),
          severity,
          description: `[${d.name}] ${iss}`,
          location: null,
          suggestion: null,
        });
      }
    }

    return NextResponse.json({
      passed: qr.passed,
      overallScore: qr.overallScore,
      grade: qr.grade,
      issues,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "诊断失败：" + message }, { status: 500 });
  }
}
