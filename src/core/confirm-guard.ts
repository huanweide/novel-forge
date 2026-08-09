// Round3 #1：智能自动确认（Auto-Confirm）共享护栏
// 单一质量阈值真相；批量确认 / 自动确认 / 流水线挂载三处复用，避免阈值分裂。

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { safeFillAfterWriting } from "@/core/babylore/loop";
import { analyzeQuality } from "@/lib/quality-analyzer";
import { QUALITY_PASS_THRESHOLD } from "@/core/quality-thresholds";
import { CONFIRMABLE_STATUSES, STATUS_CONFIRMED } from "@/core/story-status";
import { extractConsistencyFacts } from "@/core/consistency/extractFacts";

// 共享阈值（单一真相源）：与 analyzeQuality 的 passed 口径一致
export { QUALITY_PASS_THRESHOLD } from "@/core/quality-thresholds";

// 自动放行结构门槛（盲测实证驱动）：纯统计分数对劣质/短/重复文不可信（盲测假放行率 100%），
// 自动/批量放行叠加「最小长度 + 机械重复检测」，分数仅作参考与看板。
export const MIN_AUTO_CONFIRM_LENGTH = 150;

// 机械重复检测：按句分割后 ≥5 句且去重唯一率 <60% 视为「同一句凑字数」
function isMechanicalRepetition(text: string): boolean {
  const sentences = text
    .split(/[。！？!?；;]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  if (sentences.length < 5) return false;
  const uniqueRatio = new Set(sentences).size / sentences.length;
  return uniqueRatio < 0.6;
}

export function gradeOf(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

export interface ConfirmEligibility {
  eligible: boolean;
  score: number | null;
  grade: string | null;
  reason?: string;
}

/**
 * 评估一个节点是否可被自动/批量确认放行。
 * - 空正文 / 过短(<50字)：直接拦截（严重问题，不给 analyzer 误判满分的机会）
 * - qualityScore 非 null：直接采信（生成流水线已算过，省一次分析）
 * - qualityScore 为 null：回退本地实时 analyzeQuality（零 Token）
 * - 分数 < 阈值：拦截并附 reason
 */
export function evaluateConfirmEligibility(
  node: { content?: string | null; qualityScore?: number | null },
  knownNames: string[] = [],
  requirePassed = true,
): ConfirmEligibility {
  // 非法分数（NaN/Infinity）不采信：回退本地重算，杜绝「NaN < 60 恒 false」绕过拦截的漏网
  let score: number | null =
    typeof node.qualityScore === "number" && Number.isFinite(node.qualityScore)
      ? node.qualityScore
      : null;
  if (requirePassed) {
    if (!node.content || node.content.trim().length < 50) {
      return { eligible: false, score: null, grade: "?", reason: "正文为空或过短（少于50字）" };
    }
    // 盲测实证（scripts/agent-quality-blind-test.ts）：劣质/短/空文本对纯统计分 100% 过线（73~100分），
    // 自动放行必须叠加结构门槛——最小长度 + 机械重复检测，分数仅作参考。
    const text = node.content.trim();
    if (text.length < MIN_AUTO_CONFIRM_LENGTH) {
      return { eligible: false, score: null, grade: "?", reason: `正文过短（${text.length}字 < ${MIN_AUTO_CONFIRM_LENGTH}），不自动放行` };
    }
    if (isMechanicalRepetition(text)) {
      return { eligible: false, score: null, grade: "?", reason: "机械重复（句子高度雷同），不自动放行" };
    }
    if (score == null && node.content) {
      try {
        score = analyzeQuality(node.content, knownNames).overallScore;
      } catch {
        score = null;
      }
    }
    if (score == null) {
      return { eligible: false, score: null, grade: "?", reason: "未评估且无法解析正文" };
    }
    if (score < QUALITY_PASS_THRESHOLD) {
      return {
        eligible: false,
        score,
        grade: gradeOf(score) ?? "D",
        reason: `质量分低于阈值(${QUALITY_PASS_THRESHOLD})`,
      };
    }
  }
  return { eligible: true, score, grade: gradeOf(score) };
}

/**
 * 对单个节点执行确认副作用：自动填表（safeFillAfterWriting）+ 状态置 confirmed。
 * 不校验状态，由调用方（端点 / 流水线）决定哪些节点进入。
 *
 * R2-007（修复 IMP-007 部分失效）：确认成功后 fire-and-forget 触发
 * POST /api/foreshadowing/detect，使伏笔面板随自动确认 / 批量确认同步更新。
 * 与 src/app/api/story/nodes/[id]/route.ts 的手动 confirm 路径保持一致。
 *
 * skipDetect：当调用方会在确认后再补一次 detect（如后处理管线在生成章摘要之后才触发，
 * 避免「确认早于摘要」导致 detect 漏看本章）时置 true，由调用方负责最终触发，避免重复触发。
 */
export async function applyConfirm(node: {
  id: string;
  projectId: string;
  content: string | null;
  order: number;
  skipDetect?: boolean;
}): Promise<string> {
  const now = new Date();
  const existing = await prisma.storyNode.findUnique({
    where: { id: node.id, deletedAt: null },
    select: { reviewLogs: true, status: true },
  });
  const prevLogs: Prisma.JsonArray = Array.isArray(existing?.reviewLogs) ? existing.reviewLogs : [];

  // L3-006：幂等前置——先判定是否真会发生状态跃迁（仍处待确认态），
  // 仅当会跃迁时才执行填表等副作用；否则直接幂等跳过，避免重复/并发确认
  // 在状态判定前就跑一遍 safeFillAfterWriting（多余副作用与潜在双触发）。
  const willTransition =
    existing != null && (existing.status == null || (CONFIRMABLE_STATUSES as readonly string[]).includes(existing.status));
  if (!willTransition) {
    return "节点已确认（幂等跳过，未触发填表/计数）";
  }

  let fillMsg = "（无正文，跳过填表）";
  if (node.content && node.content.length > 0) {
    // IMP-002：用「node.order === 项目最大 order」判定是否最新章，使 skipLatestChapter 生效，
    // 不再硬编码 false 导致「跳过最近一章」永远不生效。与 confirm/batch 路径算法一致。
    let isLatestChapter = false;
    try {
      const agg = await prisma.storyNode.aggregate({
        where: { projectId: node.projectId, deletedAt: null },
        _max: { order: true },
      });
      isLatestChapter = node.order === (agg._max.order ?? node.order);
    } catch {
      /* 聚合失败则按非最新处理（保守：不跳过，仍可能填表） */
    }
    try {
      const fillRes = await safeFillAfterWriting({
        projectId: node.projectId,
        content: node.content,
        send: undefined,
        nodeOrder: node.order,
        isLatestChapter,
        nodeId: node.id,
        source: "auto-confirm",
      });
      // IMP-004：依据真实返回值决定文案，而非无条件声称「已执行」
      if (fillRes.ok && fillRes.applied > 0) {
        fillMsg = "自动填表已执行";
      } else {
        fillMsg = `未触发自动填表（${fillRes.error || "无事实可填"}）`;
      }
    } catch (e) {
      fillMsg = `自动填表失败（不影响确认）: ${e instanceof Error ? e.message : "未知"}`;
    }
  }

  // 幂等守卫：仅当节点仍处待确认态（drafting/pending_confirm）才执行终态更新。
  // 重复/并发请求第二次命中已 confirmed → count=0，不重复 increment revisionCount、不重复追加 reviewLogs。
  const upd = await prisma.storyNode.updateMany({
    where: { id: node.id, status: { in: [...CONFIRMABLE_STATUSES] } },
    data: {
      status: STATUS_CONFIRMED,
      confirmedAt: now,
      revisionCount: { increment: 1 },
      reviewLogs: [
        ...prevLogs,
        { action: "auto-confirm", fill: fillMsg, at: now.toISOString() },
      ],
    },
  });
  if (upd.count === 0) return "节点已确认（幂等跳过，未重复计数）";
  // v1.1.0：节点刚定稿，尝试自动整本交付（仅当项目开启 autoDeliverEnabled 且全书章节均已 confirmed）。
  // fire-and-forget：交付是确认后的红利，失败静默（不阻塞确认响应），用户手动点也能兜底。
  void maybeAutoDeliver(node.projectId).catch(() => {});

  // R2-007：确认成功后异步触发伏笔收束率检测（fire-and-forget，不阻塞确认响应）。
  // 与手动 confirm 路径（src/app/api/story/nodes/[id]/route.ts）保持一致。
  // 时序盲点处理：detect 路由自身不 lazy 生成章摘要（见 src/core/foreshadowing.ts:detectPayoffs），
  // 故「确认早于摘要」的调用方（后处理管线）需传 skipDetect=true 并在摘要落库后再触发，避免漏看本章。
  // R2-007 收口：复用共享 helper（含失败日志 + 轻量重试），不再静默吞错。
  if (!node.skipDetect) {
    void triggerForeshadowDetect({ projectId: node.projectId });
    // v1.6.52：确认定稿即触发一致性事实基线抽取（fire-and-forget，不阻塞确认响应），
    // 使已注入提示词的基线首次真正非空。抽取读 chapterSummaries，确认时序保证本章已落库。
    void extractConsistencyFacts(node.projectId).catch(() => {});
  }
  return fillMsg;
}

/**
 * R2-007 收口（新坑3）+ Round-4（新坑4/新坑5）改进：伏笔收束率检测自调用的共享 fire-and-forget helper。
 * - 失败不再静默吞掉：至少 console.error 一次，附 projectId 便于排查。
 * - 轻量重试一次（最多 2 次），两次之间 sleep 200ms 轻退避，避免对正在抖动的服务器雪上加霜。
 * - 超时保护：fetch 带 AbortSignal.timeout(5000)，避免 detect 路由在 O(C×S) 全量重算时
 *   长时间不返回导致 fire-and-forget promise 挂死、占用连接/事件循环。
 * - nodeId 为死参数（detect 路由只按 projectId 全量重算，见新坑5），已从签名与 body 中移除，
 *   不再制造「detect 已做节点级隔离」的错觉。
 * - origin 优先用调用方传入的真实 request.url.origin（始终可达）；未传则回退
 *   APP_ORIGIN || http://localhost:3001（保持与原实现一致的部署耦合）。
 *
 * 调用方一律 `void triggerForeshadowDetect(...)` 触发，不阻塞主流程。
 */
// NEW-2 修复：同 projectId 进程内互斥去重锁。并发确认（批量确认 / 多章同时定稿）会各自
// fire-and-forget 触发 detect；若不互斥，N 个请求对同一个项目同时发起 N 次全量 detect
// （O(C×S) 重算），服务端雪崩。加锁后：同一 projectId 在途 detect 期间，后续触发直接复用
// 在途 promise 的结果（不另发请求、也不重试），大幅收敛并发放大。
const detectLocks = new Map<string, Promise<void>>();

export async function triggerForeshadowDetect(args: {
  projectId: string;
  origin?: string;
}): Promise<void> {
  const origin = args.origin || process.env.APP_ORIGIN || "http://localhost:3001";
  const url = `${origin}/api/foreshadowing/detect`;
  const body = JSON.stringify({ projectId: args.projectId });
  const TIMEOUT_MS = 5000;

  // NEW-2：同 projectId 已有在途 detect → 复用其结果，不重复发请求（规避重试放大雪崩）。
  const inflight = detectLocks.get(args.projectId);
  if (inflight) {
    try {
      await inflight;
    } catch {
      /* 复用侧不重复记日志：原调用已记录失败 */
    }
    return;
  }

  const run = (async () => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
        });
        if (!res.ok) {
          lastErr = new Error(`detect 返回非 2xx 状态码 ${res.status}`);
          // 非 2xx 同样走重试（应对确认瞬间短暂抖动）
        } else {
          return;
        }
      } catch (e) {
        lastErr = e;
      }
      if (attempt < 2) await sleep(200); // 轻退避
    }
    console.error(
      "[foreshadowing/detect] 自调用失败（已重试1次，放弃）:",
      lastErr instanceof Error ? lastErr.message : String(lastErr),
      { projectId: args.projectId },
    );
  })();

  detectLocks.set(args.projectId, run);
  try {
    await run;
  } finally {
    // 不论成功失败，本次 detect 结算后立即释放锁，允许下一波变更触发新一次 detect
    detectLocks.delete(args.projectId);
  }
}

/** 最小退避，避免重试瞬间打满正在抖动的 detect 路由。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * v1.1.0：自动整本交付判定。
 * 当项目开启 autoDeliverEnabled 且尚未交付、且全书所有章节/小节/场景均已 confirmed 时，
 * 自动置 Project.confirmedAt（等价于 POST /api/projects/[id]/confirm 成功路径）。
 * 与 confirm 路由共用同样的节点类型口径（chapter/section/scene），单一真相。
 * 全程只读 + 一次写入，失败返回 { delivered:false }，调用方可安全 fire-and-forget。
 */
export async function maybeAutoDeliver(projectId: string): Promise<{ delivered: boolean }> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { autoDeliverEnabled: true, confirmedAt: true },
    });
    if (!project || !project.autoDeliverEnabled || project.confirmedAt) {
      return { delivered: false };
    }
    const nodes = await prisma.storyNode.findMany({
      where: { projectId, type: { in: ["chapter", "section", "scene"] }, deletedAt: null },
      select: { status: true },
    });
    if (nodes.length === 0) return { delivered: false };
    const hasUnconfirmed = nodes.some((n) => n.status !== STATUS_CONFIRMED);
    if (hasUnconfirmed) return { delivered: false };
    await prisma.project.update({ where: { id: projectId }, data: { confirmedAt: new Date() } });
    return { delivered: true };
  } catch {
    return { delivered: false };
  }
}
