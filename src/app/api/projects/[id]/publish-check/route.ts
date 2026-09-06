/**
 * 发布与过检统一检查（M2 + M3 + M4 一次拿全）
 *
 * 一次请求返回三份报告，避免前端为三块内容发三次请求：
 *   - risk        M2 平台级过审预检（按目标平台口味预判被判 AI 的风险）
 *   - consistency M3 长篇一致性巡检（性别指代 / 外貌 / 已故仍活动 / 伏笔拖延）
 *   - publish     M4 发布管线诊断（逐章字数是否达标、断章合并建议）
 *
 * 全部纯本地计算，不联网、不调 LLM、不上传稿件。
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzePlatformRisk, type PlatformId } from "@/core/humanize/platform-risk";
import { auditConsistency } from "@/core/consistency/audit";
import {
  buildPublishReport,
  formatChapterTitle,
  formatForPlatform,
  buildAttributionHtml,
  type PublishPlatform,
} from "@/core/publish/pipeline";

/** M2 支持的平台 */
const RISK_PLATFORMS: PlatformId[] = ["fanqie", "qidian", "jjwxc", "general"];
/** M4 支持的平台 */
const PUBLISH_PLATFORMS: PublishPlatform[] = ["fanqie", "qidian", "wechat", "general"];

/** 过检扫描上限：超长篇只扫最近的内容，避免卡住请求（20 万字足够反映文风） */
const MAX_SCAN_CHARS = 200_000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // body 可空：不带就用通用口径 + 默认阈值
  let platform = "general";
  let staleThreshold = 10;
  try {
    const body = (await request.json()) as { platform?: unknown; staleThreshold?: unknown };
    if (typeof body?.platform === "string") platform = body.platform;
    if (typeof body?.staleThreshold === "number" && body.staleThreshold > 0) {
      staleThreshold = Math.min(body.staleThreshold, 200);
    }
  } catch {
    /* 空 body / 非法 JSON：用默认值，不报错 */
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  const [nodes, characters, commitments] = await Promise.all([
    prisma.storyNode.findMany({
      where: { projectId: id, deletedAt: null },
      select: { id: true, order: true, title: true, content: true },
      orderBy: { order: "asc" },
    }),
    prisma.characterCard.findMany({ where: { projectId: id } }),
    prisma.pendingCommitment.findMany({ where: { projectId: id } }),
  ]);

  // 平台降级：某模块不支持该平台时退回通用口径，而不是报错
  const riskPlatform = (RISK_PLATFORMS.includes(platform as PlatformId)
    ? platform
    : "general") as PlatformId;
  const publishPlatform = (PUBLISH_PLATFORMS.includes(platform as PublishPlatform)
    ? platform
    : "general") as PublishPlatform;

  const fullText = nodes
    .map((n) => n.content || "")
    .join("\n");
  const scanned = fullText.slice(0, MAX_SCAN_CHARS);

  const risk = analyzePlatformRisk(scanned, riskPlatform);
  const consistency = auditConsistency(
    { nodes, characters, commitments },
    { staleChapterThreshold: staleThreshold },
  );
  const publish = buildPublishReport(nodes, publishPlatform);

  // 按目标平台排版并组合成可直接下载/粘贴的文稿
  const activeNodes = (nodes || [])
    .filter((n) => (n.content || "").trim())
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const exportText = activeNodes
    .map((n) => {
      const title = formatChapterTitle(n.title, n.order, publishPlatform);
      const body = formatForPlatform(n.content || "", publishPlatform);
      return `${title}\n\n${body}`;
    })
    .join("\n\n") +
    "\n\n---\n\n" +
    "本书由 novel-smith（https://github.com/huanweide/novel-smith）辅助创作。";

  const escapeHtml = (s: string) =>
    (s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const exportHtml = [
    "<!DOCTYPE html>",
    "<html lang=\"zh-CN\">",
    "<head><meta charset=\"UTF-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `<title>${escapeHtml(publish.platformLabel)} 导出稿</title>`,
    "<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.8;color:#222;}h1{font-size:1.2em;margin:1.5em 0 0.6em;border-bottom:1px solid #eee;padding-bottom:0.3em;}p{margin:0.6em 0;}</style>",
    "</head><body>",
    activeNodes
      .map((n) => {
        const title = formatChapterTitle(n.title, n.order, publishPlatform);
        const body = formatForPlatform(n.content || "", publishPlatform)
          .split(/\n+/)
          .filter(Boolean)
          .map((para) => `<p>${escapeHtml(para)}</p>`)
          .join("\n");
        return `<h1>${escapeHtml(title)}</h1>\n${body}`;
      })
      .join("\n"),
    buildAttributionHtml({ platform: publishPlatform }),
    "</body></html>",
  ].join("\n");

  return NextResponse.json({
    risk,
    consistency,
    publish,
    export: { text: exportText, html: exportHtml },
    meta: {
      platform,
      riskPlatform,
      publishPlatform,
      scannedChars: scanned.length,
      truncated: fullText.length > MAX_SCAN_CHARS,
    },
  });
}
