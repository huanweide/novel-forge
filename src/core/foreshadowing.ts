import { prisma } from "@/lib/prisma";
import { createLLMClient, getEffectiveConfig } from "@/core/llm/client";

/**
 * 伏笔后续发展思路生成器
 *
 * 为一条已埋设的伏笔，依作者设定的「缝合怪·多线剧情推进」原则，让 LLM 推演
 * 其后续可能的发展方向，写回 PendingCommitment.developmentHint，作为作者写作的
 * 参考指示（非必选、可覆盖）。作者也可在伏笔面板手动填写。
 *
 * 设计为 fire-and-forget：调用方不 await，任何异常（网络/超时/内容过滤）一律
 * 静默回退返回 null，绝不阻断正文生成或拆书抽取主流程。
 */

// 缝合怪多线推进原则（与 src/lib/builtin-presets.ts 的剧情推进预设保持一致）
const STORY_PROGRESSION_RULE =
  "【剧情推进规则·缝合怪】\n" +
  "1. 主线推进速率：每章确保主线向前推进至少一个关键节点（新线索/冲突升级/目标临近）。\n" +
  "2. 个人线推进速率：按角色好感度/关系表，渐进揭示角色私密动机与情感变化，不跳跃。\n" +
  "3. 事件线推进速率：已铺设的伏笔与随机事件，按权重逐步兑现，避免烂尾。\n" +
  "4. 推进时优先引用已填表的世界书与表格行，保持前后一致；新事实必须回填对应表格。\n" +
  "⚠️ 推进不等于堆设定：每步都要落到具体人物行动与后果。";

export async function enrichForeshadow(
  projectId: string,
  commitmentId: string,
): Promise<string | null> {
  try {
    const commit = await prisma.pendingCommitment.findUnique({ where: { id: commitmentId } });
    if (!commit) return null;

    const [project, summaries] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true, synopsis: true, toneKeywords: true, genre: true },
      }),
      prisma.chapterSummary.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { summary: true },
      }),
    ]);

    const projectCtx = [
      project?.name ? `作品：${project.name}` : null,
      project?.synopsis ? `主线总纲：${project.synopsis}` : null,
      project?.genre && project.genre.length ? `题材：${project.genre.join("、")}` : null,
      project?.toneKeywords && project.toneKeywords.length
        ? `基调：${project.toneKeywords.join("、")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const recentPlot = summaries.map((s) => s.summary).filter(Boolean).join("\n---\n");

    const entityNames = Array.isArray(commit.entityIds)
      ? (commit.entityIds as unknown as string[]).filter(Boolean)
      : [];

    const system =
      "你是小说剧情参谋。依据作者设定的缝合怪多线推进原则，为一条已埋设的伏笔推演其后续可能的发展方向。" +
      "输出 2-4 句、总计不超过 120 字的中文思路，作为作者写作参考指示（非必选、可覆盖）。" +
      "只给方向，不替作者写正文；要贴合已有剧情，避免凭空开新线。";

    const user =
      `${STORY_PROGRESSION_RULE}\n\n` +
      `【当前伏笔】${commit.description}\n` +
      (entityNames.length ? `【涉及角色/实体】${entityNames.join("、")}\n` : "") +
      (projectCtx ? `【作品背景】\n${projectCtx}\n` : "") +
      (recentPlot ? `【近期剧情脉络】\n${recentPlot}\n` : "") +
      `\n请推演这条伏笔后续可能如何展开（2-4 句，不超过 120 字）：`;

    const config = await getEffectiveConfig();
    const client = createLLMClient(config);
    const resp = await client.chat({
      model: config.summarizeModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.6,
      topP: 0.9,
      maxTokens: 220,
    });

    let hint = resp?.content?.trim();
    if (!hint) return null;
    if (hint.length > 150) hint = hint.slice(0, 150);

    await prisma.pendingCommitment.update({
      where: { id: commitmentId },
      data: { developmentHint: hint },
    });
    return hint;
  } catch {
    return null;
  }
}
