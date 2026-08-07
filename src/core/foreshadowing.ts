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

// ═══════════════════════════════════════════
// 伏笔收束率（P0 · 智能体团队计划书）
//
// 真问题不是「会不会写不出」（LLM 永远能写），而是「写出来的线头收没收得住」。
// 给作者一个可量化的收束率指标：已回收 / (活跃伏笔总数)。
//
// 设计原则（第一性原理）：
//  - 不依赖新增 schema 字段——五状态机（pending/detected/partially_fulfilled/
//    fulfilled/voided）+ fulfillmentRatio 已齐备，缺的只是「自动检测」这一步。
//  - 不跨表解析 CharacterCard/LorebookEntry（entityIds 是 UUID，脆弱且耦合重）。
//    改用语义种子：description 的中文短语 + closureConditions 闭环条件，确定性
//    字符串命中，可单测、零外部调用、永不超时。
//  - detectPayoffs 会回写 status/fulfillmentRatio/fulfilledAt；computePayoffStats
//    是纯只读聚合，供列表接口随时展示、无需触发检测。
// ═══════════════════════════════════════════

export interface PayoffStats {
  total: number; // 全部伏笔（含已废弃）
  active: number; // 活跃伏笔 = total - voided
  fulfilled: number; // 已回收
  partial: number; // 部分回收
  voided: number; // 已废弃
  payoffRate: number; // 收束率 = (fulfilled + 0.5*partial) / active  [0,1]
  avgFulfillmentRatio: number; // 平均兑现度 [0,1]
}

interface Seeds {
  closure: string[]; // 闭环条件（作者/AI 设定的精确标记，最高精度）
  phrases: string[]; // 描述里抽出的中文短语种子
}

/**
 * 从一条伏笔抽语义种子。
 *  - closureConditions：支持字符串数组 / 含 text 字段的对象数组 / 纯字符串。
 *  - description：用正则抽出连续中文片段（长度≥3），过滤掉极通用的 2 字组合噪声。
 */
function extractSeeds(commit: {
  description?: string | null;
  closureConditions?: unknown;
}): Seeds {
  const closure: string[] = [];
  const cc = commit.closureConditions;
  if (Array.isArray(cc)) {
    for (const item of cc) {
      if (typeof item === "string" && item.trim()) closure.push(item.trim());
      else if (item && typeof item === "object" && "text" in item) {
        const t = (item as { text?: unknown }).text;
        if (typeof t === "string" && t.trim()) closure.push(t.trim());
      }
    }
  } else if (typeof cc === "string" && cc.trim()) {
    closure.push(cc.trim());
  }

  const desc = typeof commit.description === "string" ? commit.description : "";
  // 连续中文，长度≥3（避免「一把/发现」等高频 2 字噪声）
  const phrases = (desc.match(/[一-龥]{3,}/g) || []).filter(Boolean);

  return {
    closure: [...new Set(closure)],
    phrases: [...new Set(phrases)],
  };
}

/**
 * 检测并回写伏笔收束状态（有副作用）。
 * 扫描该伏笔 detectedAt(或 createdAt) 之后写入的全部章节摘要，用语义种子做命中：
 *  - closureConditions 任一命中，或 description 短语命中≥2  → fulfilled / 1.0
 *  - description 短语仅命中 1 且当前仍 pending/detected        → partially_fulfilled / 0.5
 *  - 未命中 → 维持原状（绝不把已 fulfilled 降级）。
 * 整段 try/catch，任何异常返回零值统计，绝不抛错阻断调用方。
 */
export async function detectPayoffs(projectId: string): Promise<PayoffStats> {
  try {
    const commitments = await prisma.pendingCommitment.findMany({
      where: { projectId },
      select: {
        id: true,
        status: true,
        description: true,
        closureConditions: true,
        fulfillmentRatio: true,
        fulfilledAt: true,
        detectedAt: true,
        createdAt: true,
      },
    });

    // 同时读取「章节摘要」与「章节实时正文」。二者互补：
    //  - 摘要由 LLM 生成，精炼但可能陈旧（refine 路径 skipSummarize 不刷新摘要）；
    //  - 实时正文（storyNode.content）随 refine 改写刷新 updatedAt，能反映最新回收/新埋信号。
    // Round-4 修复（新坑1）：refine 确认触发 detect 时，摘要仍是改写前的陈旧快照，
    // 故必须把实时正文纳入 haystack，否则 detect 只看陈旧摘要、伏笔面板看着没变。
    const [summaries, nodes] = await Promise.all([
      prisma.chapterSummary.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, summary: true, keyEvents: true },
      }),
      prisma.storyNode.findMany({
        where: { projectId, type: { in: ["chapter", "section", "scene"] } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, updatedAt: true, content: true },
      }),
    ]);

    const updates: Promise<unknown>[] = [];
    let fulfilled = 0;
    let partial = 0;
    let voided = 0;
    let ratioSum = 0;

    for (const c of commitments) {
      if (c.status === "voided") {
        voided++;
        ratioSum += c.fulfillmentRatio || 0;
        continue;
      }

      const { closure, phrases } = extractSeeds(c);
      const anchor = c.detectedAt || c.createdAt;
      // 摘要：createdAt 晚于伏笔埋设点（原有语义）。
      const laterSummaries = summaries.filter((s) => s.createdAt > anchor);
      // 实时正文：updatedAt 晚于伏笔埋设点（覆盖 refine 改写——refine 改写后 updatedAt 刷新，
      // 但其 chapterSummary 因 skipSummarize 而陈旧，故必须纳入正文才可能看见 refine 回收信号）。
      const laterNodes = nodes.filter((n) => (n.updatedAt ?? n.createdAt) > anchor);
      const haystack = [
        ...laterSummaries.map((s) => {
          const events = Array.isArray(s.keyEvents)
            ? (s.keyEvents as string[]).join("\n")
            : "";
          return `${s.summary || ""}\n${events}`;
        }),
        ...laterNodes.map((n) => (n.content || "")),
      ].join("\n");

      let matchedClosure = 0;
      for (const seed of closure) {
        if (seed && haystack.includes(seed)) matchedClosure++;
      }
      let matchedPhrase = 0;
      for (const seed of phrases) {
        if (seed && haystack.includes(seed)) matchedPhrase++;
      }

      let newStatus = c.status;
      let newRatio = c.fulfillmentRatio || 0;

      if (matchedClosure > 0 || matchedPhrase >= 2) {
        newStatus = "fulfilled";
        newRatio = 1;
      } else if (
        matchedPhrase === 1 &&
        (c.status === "pending" || c.status === "detected")
      ) {
        newStatus = "partially_fulfilled";
        newRatio = 0.5;
      }

      const statusChanged = newStatus !== c.status;
      const ratioChanged = newRatio !== c.fulfillmentRatio;

      if (statusChanged || ratioChanged) {
        updates.push(
          prisma.pendingCommitment.update({
            where: { id: c.id },
            data: {
              status: newStatus,
              fulfillmentRatio: newRatio,
              ...(newStatus === "fulfilled" && !c.fulfilledAt
                ? { fulfilledAt: new Date() }
                : {}),
            },
          }),
        );
      }

      if (newStatus === "fulfilled") fulfilled++;
      else if (newStatus === "partially_fulfilled") partial++;
      ratioSum += newRatio;
    }

    if (updates.length) await Promise.all(updates);

    const active = commitments.length - voided;
    const payoffRate = active > 0 ? (fulfilled + 0.5 * partial) / active : 0;
    return {
      total: commitments.length,
      active,
      fulfilled,
      partial,
      voided,
      payoffRate,
      avgFulfillmentRatio: commitments.length ? ratioSum / commitments.length : 0,
    };
  } catch {
    return {
      total: 0,
      active: 0,
      fulfilled: 0,
      partial: 0,
      voided: 0,
      payoffRate: 0,
      avgFulfillmentRatio: 0,
    };
  }
}

/**
 * 只读聚合当前收束率（无副作用）。供列表接口随时展示，无需触发检测。
 */
export async function computePayoffStats(projectId: string): Promise<PayoffStats> {
  try {
    const commitments = await prisma.pendingCommitment.findMany({
      where: { projectId },
      select: { status: true, fulfillmentRatio: true },
    });

    let fulfilled = 0;
    let partial = 0;
    let voided = 0;
    let ratioSum = 0;

    for (const c of commitments) {
      if (c.status === "voided") voided++;
      else if (c.status === "fulfilled") fulfilled++;
      else if (c.status === "partially_fulfilled") partial++;
      ratioSum += c.fulfillmentRatio || 0;
    }

    const active = commitments.length - voided;
    const payoffRate = active > 0 ? (fulfilled + 0.5 * partial) / active : 0;
    return {
      total: commitments.length,
      active,
      fulfilled,
      partial,
      voided,
      payoffRate,
      avgFulfillmentRatio: commitments.length ? ratioSum / commitments.length : 0,
    };
  } catch {
    return {
      total: 0,
      active: 0,
      fulfilled: 0,
      partial: 0,
      voided: 0,
      payoffRate: 0,
      avgFulfillmentRatio: 0,
    };
  }
}
