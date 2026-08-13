import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanForbiddenWordsEnhanced } from "@/lib/forbidden-checker";
import { analyzeQuality } from "@/lib/quality-analyzer";

/**
 * POST /api/generate/audit —— 写作安全 + 质量体检
 *
 * 复用两个已落地的纯函数（零额外 LLM/网络开销）：
 *   - scanForbiddenWordsEnhanced：五类内容安全扫描（精确词/句式/身体模板/模糊词/AI高频词）
 *   - analyzeQuality：六维写作质量评分（废话率/展示vs讲述/视角/句式/对话/主语）
 *
 * 仅按 nodeId 取一次正文，跑两遍本地算法，把结果精简后返回给前端「写作体检」面板，
 * 让用户在章节定稿前看清踩线项与质量分。统一 try/catch，错误返回 { error }。
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const { projectId, nodeId } = (body ?? {}) as { projectId?: string; nodeId?: string };
    if (!projectId || !nodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
    }

    const node = await prisma.storyNode.findUnique({
      where: { id: nodeId },
      select: { title: true, content: true },
    });
    if (!node) {
      return NextResponse.json({ error: "未找到该章节" }, { status: 404 });
    }

    const content = (node.content as string) ?? "";
    if (!content.trim()) {
      return NextResponse.json({ ok: true, empty: true, title: node.title }, { status: 200 });
    }

    const forbidden = scanForbiddenWordsEnhanced(content);
    const quality = analyzeQuality(content);

    return NextResponse.json({
      ok: true,
      title: node.title,
      forbidden: {
        passed: forbidden.passed,
        textLength: forbidden.textLength,
        qualityScore: forbidden.qualityScore,
        fuzzyDensity: forbidden.fuzzyDensity,
        bySeverity: forbidden.bySeverity,
        byCategory: forbidden.byCategory,
        matchCount: forbidden.matches.length,
      },
      quality: {
        overallScore: quality.overallScore,
        grade: quality.grade,
        passed: quality.passed,
        summary: quality.summary,
        dimensions: quality.dimensions.map((d) => ({
          name: d.name,
          key: d.key,
          score: d.score,
          weight: d.weight,
          detail: d.detail,
        })),
      },
    });
  } catch (err) {
    console.error("[audit] 写作体检失败", err);
    return NextResponse.json(
      { error: "写作体检失败：" + (err instanceof Error ? err.message : "未知错误") },
      { status: 500 },
    );
  }
}
