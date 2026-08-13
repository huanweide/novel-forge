import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanForbiddenWordsEnhanced } from "@/lib/forbidden-checker";
import { analyzeQuality } from "@/lib/quality-analyzer";

/**
 * GET /api/generate/audit/book?projectId=xxx —— 全书健康度体检（v2.8.0）
 *
 * 复用两个已落地的纯函数（零额外 LLM/网络开销）：
 *   - scanForbiddenWordsEnhanced：五类内容安全扫描（精确词/句式/身体模板/模糊词/AI高频词）
 *   - analyzeQuality：六维写作质量评分（废话率/展示vs讲述/视角/句式/对话/主语）
 *
 * 仅按 projectId 一次性取出所有正文章节，逐章跑两遍本地算法，把「每章安全分/质量分/评级」
 * 与「全书汇总（平均质量、需返工章数、踩线章数）」返回给前端看板，让用户一眼看出哪几章要返工。
 * 统一 try/catch，错误返回 { error }。设硬上限保护，避免超长篇一次拉爆内存。
 */
const MAX_AUDIT_NODES = 300;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    const nodes = await prisma.storyNode.findMany({
      where: { projectId, deletedAt: null, type: { in: ["chapter", "section"] } },
      select: { id: true, title: true, order: true, type: true, status: true, wordCount: true, content: true },
      orderBy: { order: "asc" },
    });

    const withContent = nodes.filter(
      (n) => typeof n.content === "string" && n.content.trim().length > 0,
    );
    const truncated = withContent.length > MAX_AUDIT_NODES;
    const toAudit = truncated ? withContent.slice(0, MAX_AUDIT_NODES) : withContent;

    const chapters = toAudit.map((n) => {
      const content = n.content as string;
      const forbidden = scanForbiddenWordsEnhanced(content);
      const quality = analyzeQuality(content);
      return {
        id: n.id,
        title: n.title,
        order: n.order,
        type: n.type,
        status: n.status,
        wordCount: n.wordCount ?? content.length,
        forbiddenScore: forbidden.qualityScore,
        forbiddenPassed: forbidden.passed,
        matchCount: forbidden.matches.length,
        qualityScore: quality.overallScore,
        grade: quality.grade,
        passed: quality.passed,
      };
    });

    const total = chapters.length;
    const avgQuality = total
      ? Math.round(chapters.reduce((s, c) => s + c.qualityScore, 0) / total)
      : 0;
    const avgForbidden = total
      ? Math.round(chapters.reduce((s, c) => s + c.forbiddenScore, 0) / total)
      : 0;
    const blockedSafety = chapters.filter((c) => !c.forbiddenPassed).length;
    const lowQuality = chapters.filter((c) => !c.passed).length;
    const needsWork = chapters.filter((c) => !c.passed || !c.forbiddenPassed).length;

    return NextResponse.json({
      ok: true,
      truncated,
      audited: total,
      summary: { avgQuality, avgForbidden, blockedSafety, lowQuality, needsWork },
      chapters,
    });
  } catch (err) {
    console.error("[audit/book] 全书体检失败", err);
    return NextResponse.json(
      { error: "全书体检失败：" + (err instanceof Error ? err.message : "未知错误") },
      { status: 500 },
    );
  }
}
