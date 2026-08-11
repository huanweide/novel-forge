/**
 * POST /api/agent/content-safety
 *
 * 内容安全审核（规则分类，零 LLM）。对传入文本做本地扫描，
 * 返回风险点 / 严重度 / 命中词 / 上下文 / 建议。
 * 自动叠加项目级用户黑名单（Project.customSafetyRules），不替换内置基线。
 *
 * 请求体：{ projectId, text }
 *
 * GET /api/agent/content-safety?projectId=xxx
 * 返回 { baseline, custom } 供 UI 展示「默认基线（不可删）+ 用户增量黑名单」。
 */
import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { analyzeContentSafety, buildCustomSafetyRules, DEFAULT_SAFETY_RULES, type CustomSafetyRule } from "@/core/pipeline/content-safety";

export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { customSafetyRules: true },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    const custom = buildCustomSafetyRules(project.customSafetyRules);
    const baseline = DEFAULT_SAFETY_RULES.map((r) => ({
      category: r.category,
      categoryLabel: r.categoryLabel,
      severity: r.severity,
      pattern: r.pattern.source,
      suggestion: r.suggestion,
    }));
    return NextResponse.json({ baseline, custom });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { projectId, text } = await request.json();
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "缺少待审文本" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, customSafetyRules: true },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    // 叠加用户增量黑名单（不替换内置基线）
    const customRules: CustomSafetyRule[] = buildCustomSafetyRules(project.customSafetyRules);
    const result = analyzeContentSafety(text, customRules);
    return NextResponse.json(result);
  } catch (err) {
    console.error("内容安全审核失败:", err);
    return jsonError(err);
  }
}
