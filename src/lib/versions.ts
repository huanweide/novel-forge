import { prisma } from "@/lib/prisma";

/**
 * 正文版本来源标签（用于历史抽屉里区分这一版是怎么来的）。
 */
export type RevisionSource =
  | "ai-write" // AI 首次生成
  | "ai-rewrite" // AI 重写（覆盖已有正文）
  | "ai-polish" // AI 润色/微调
  | "manual" // 用户在编辑器手动保存
  | "rollback" // 回滚操作产生的新版（记录回滚前的状态）
  | "auto-fill" // 自动填表等自动化覆盖
  | "unknown";

export const REVISION_SOURCE_LABEL: Record<RevisionSource, string> = {
  "ai-write": "AI 生成",
  "ai-rewrite": "AI 重写",
  "ai-polish": "AI 润色",
  manual: "手动保存",
  rollback: "回滚快照",
  "auto-fill": "自动填表",
  unknown: "未知",
};

/**
 * 在「覆盖正文之前」调用：把上一版正文存进 StoryNodeRevision。
 *
 * 去重逻辑：若上一版内容与本节点最近一次快照完全相同，则跳过——避免
 * AI 微调/手动保存产生大量重复版本。无内容（空正文）不快照。
 *
 * 失败静默：版本快照是「安全网」，绝不能因为快照失败而阻断正文生成。
 */
export async function snapshotRevision(opts: {
  nodeId: string;
  projectId: string;
  source: RevisionSource;
  prevContent?: string; // 提供则直接用，否则读库当前值
  prevWordCount?: number;
  summary?: string;
}): Promise<void> {
  try {
    let prevContent = opts.prevContent;
    let prevWordCount = opts.prevWordCount;
    let projectId = opts.projectId;

    if (prevContent === undefined) {
      const cur = await prisma.storyNode.findUnique({
        where: { id: opts.nodeId },
        select: { content: true, wordCount: true, projectId: true },
      });
      prevContent = cur?.content ?? "";
      prevWordCount = cur?.wordCount ?? prevContent.length;
      if (!projectId && cur?.projectId) projectId = cur.projectId;
    }

    if (!prevContent || !prevContent.trim()) return; // 空正文不快照

    // 去重：与最近一版相同内容不重复记
    const last = await prisma.storyNodeRevision.findFirst({
      where: { nodeId: opts.nodeId },
      orderBy: { version: "desc" },
      select: { version: true, content: true },
    });
    if (last && last.content === prevContent) return;

    const version = (last?.version ?? 0) + 1;
    await prisma.storyNodeRevision.create({
      data: {
        nodeId: opts.nodeId,
        projectId,
        version,
        content: prevContent,
        wordCount: prevWordCount ?? prevContent.length,
        source: opts.source,
        summary: opts.summary,
      },
    });
  } catch (e) {
    console.error("快照版本失败(已忽略):", e instanceof Error ? e.message : e);
  }
}
