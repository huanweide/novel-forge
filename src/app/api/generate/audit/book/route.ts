import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanForbiddenWordsEnhanced } from "@/lib/forbidden-checker";
import { analyzeQuality } from "@/lib/quality-analyzer";

/**
 * GET /api/generate/audit/book?projectId=xxx —— 全书健康度体检（v2.8.0，只读）
 * POST /api/generate/audit/book —— 全书体检 + 可选回写质量分到 StoryNode.qualityScore（v2.9.0）
 *
 * 复用两个已落地的纯函数（零额外 LLM/网络开销）：
 *   - scanForbiddenWordsEnhanced：五类内容安全扫描（精确词/句式/身体模板/模糊词/AI高频词）
 *   - analyzeQuality：六维写作质量评分（废话率/展示vs讲述/视角/句式/对话/主语）
 *
 * GET 仅按 projectId 一次性取出所有正文章节，逐章跑两遍本地算法，把「每章安全分/质量分/评级」
 * 与「全书汇总」返回给前端看板。POST 在 GET 基础上，若 persist=true 则把每章质量分批量写回
 * StoryNode.qualityScore（字段 schema 已存在但此前未被主动填充），供大纲树常驻展示质量地图。
 * 统一 try/catch，错误返回 { error }。设硬上限保护，避免超长篇一次拉爆内存。
 */
const MAX_AUDIT_NODES = 300;

interface ChapterAudit {
  id: string;
  title: string;
  order: number;
  type: string;
  status: string;
  wordCount: number;
  forbiddenScore: number;
  forbiddenPassed: boolean;
  matchCount: number;
  qualityScore: number;
  grade: string;
  passed: boolean;
}

async function computeBookAudit(projectId: string) {
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

  const chapters: ChapterAudit[] = toAudit.map((n) => {
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
  const avgQuality = total ? Math.round(chapters.reduce((s, c) => s + c.qualityScore, 0) / total) : 0;
  const avgForbidden = total ? Math.round(chapters.reduce((s, c) => s + c.forbiddenScore, 0) / total) : 0;
  const blockedSafety = chapters.filter((c) => !c.forbiddenPassed).length;
  const lowQuality = chapters.filter((c) => !c.passed).length;
  const needsWork = chapters.filter((c) => !c.passed || !c.forbiddenPassed).length;

  return { chapters, truncated, audited: total, summary: { avgQuality, avgForbidden, blockedSafety, lowQuality, needsWork } };
}

// GET —— 体检（只读）
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }
    const result = await computeBookAudit(projectId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[audit/book] 全书体检失败", err);
    return NextResponse.json(
      { error: "全书体检失败：" + (err instanceof Error ? err.message : "未知错误") },
      { status: 500 },
    );
  }
}

// POST —— 体检 + 可选回写质量分到 StoryNode.qualityScore（persist=true）
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const { projectId, persist } = (body ?? {}) as { projectId?: string; persist?: boolean };
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }
    const result = await computeBookAudit(projectId);
    let persisted = 0;
    if (persist) {
      // 批量回写每章质量分（overallScore）到 StoryNode.qualityScore，供大纲树常驻展示质量地图。
      // 逐条 update + catch 容错：单章失败不影响其余；不触发 PUT 的快照/自动填表等重副作用。
      await Promise.all(
        result.chapters.map((c) =>
          prisma.storyNode
            .update({ where: { id: c.id }, data: { qualityScore: c.qualityScore } })
            .then(() => null)
            .catch(() => null),
        ),
      );
      persisted = result.chapters.length;
    }
    return NextResponse.json({ ok: true, persisted, ...result });
  } catch (err) {
    console.error("[audit/book] 全书体检回写失败", err);
    return NextResponse.json(
      { error: "全书体检回写失败：" + (err instanceof Error ? err.message : "未知错误") },
      { status: 500 },
    );
  }
}
