/**
 * 伏笔/承诺追踪引擎 —— 五状态机
 *
 * 参考 aixiaoshuojia.cn pending_commitments 状态机（09-pending-commitments.md）：
 *
 *   pending → detected → partially_fulfilled → fulfilled
 *                                            → voided (超时/不可能)
 *
 * 三层闭环检测流水线：
 *   第1层：实体匹配（承诺涉及实体在正文中同时出现）
 *   第2层：行为/事件匹配（同义/近义词检测）
 *   第3层：closure_conditions 逐一检查
 */

import { prisma } from "@/lib/prisma";
import type {
  PendingCommitment,
  CommitmentStatus,
  ClosureCondition,
  StatusHistoryEntry,
} from "@/core/types";

// ─── 超期配置 ──────────────────────────────────────────────

const MAX_UNFULFILLED_CHAPTERS = 20;
const LOW_COVERAGE_THRESHOLD = 0.3;
const WARNING_CHAPTERS = 10;
const DEGRADE_CHAPTERS = 15;

// ─── 主类 ──────────────────────────────────────────────────

export class CommitmentTracker {
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /**
   * 从 AI 生成的正文中检测承诺
   *
   * 创建条件（满足任意一条）：
   * 1. 文中出现未解释的悬念
   * 2. 文中出现承诺但未执行
   * 3. 文中出现伏笔的入口但本章未探索
   * 4. 文中出现未完成的约定
   * 5. 事件 S 级且影响未在本章内收束
   * 6. 新登场重要角色未完成角色弧光
   */
  async detectCommitments(params: {
    chapterId: string;
    chapterContent: string;
    unresolvedQuestions: string[];  // 来自 summarizeChapter
    keyEvents: string[];
    eventImportances?: { sTier: Array<{ description: string }> };
  }): Promise<number> {
    const { chapterId, unresolvedQuestions, keyEvents, eventImportances } = params;
    let created = 0;

    // 1) 未解答悬念 → 创建承诺
    for (const question of unresolvedQuestions) {
      await this.create({
        source: "ai_inference",
        sourceNodeId: chapterId,
        priority: "medium",
        description: `[悬念] ${question}`,
        entityIds: [],
        closureConditions: [{ type: "dialogue", value: question, required: true }],
      });
      created++;
    }

    // 2) S 级事件未收束 → 创建高优先级承诺
    const sEvents = eventImportances?.sTier || [];
    for (const event of sEvents) {
      // 检查是否已在本章内闭环（简单启发式：末尾是否有收束描述）
      const hasClosure = params.chapterContent.slice(-500).includes("结束了") ||
        params.chapterContent.slice(-500).includes("终于") ||
        params.chapterContent.slice(-500).includes("尘埃落定");
      if (!hasClosure) {
        await this.create({
          source: "ai_inference",
          sourceNodeId: chapterId,
          priority: "high",
          description: `[S级事件未收束] ${event.description}`,
          entityIds: [],
          closureConditions: [
            { type: "action", value: event.description, required: true },
          ],
        });
        created++;
      }
    }

    return created;
  }

  /**
   * 在新章生成前，评估所有待处理承诺的"检测"状态
   *
   * pending → detected：承诺关键词与当前章大纲匹配
   */
  async preInjectDetection(params: {
    currentNodeOutline: string;
    currentNodeTitle: string;
    chapterId: string;
  }): Promise<PendingCommitment[]> {
    const { currentNodeOutline, chapterId } = params;

    // 取所有 pending 状态的承诺
    const pending = await prisma.pendingCommitment.findMany({
      where: { projectId: this.projectId, status: "pending" },
      orderBy: { priority: "asc" }, // high 优先
    }) as any[];

    const detected: PendingCommitment[] = [];

    for (const p of pending) {
      // 简单关键词匹配：承诺描述中的词是否出现在大纲中
      const keywords = p.description.replace(/[【】\[\]]/g, "").split(/[\s，,。.]+/).filter((w: string) => w.length >= 2);
      const matchCount = keywords.filter((kw: string) => currentNodeOutline.includes(kw)).length;
      const matchRatio = keywords.length > 0 ? matchCount / keywords.length : 0;

      if (matchRatio > 0.3) {
        // 转为 detected
        const statusEntry: StatusHistoryEntry = {
          from: "pending",
          to: "detected",
          trigger: "pre_injection",
          chapterId,
          timestamp: new Date().toISOString(),
          details: `承诺关键词匹配度 ${(matchRatio * 100).toFixed(0)}%`,
        };

        await prisma.pendingCommitment.update({
          where: { id: p.id },
          data: {
            status: "detected",
            detectedAt: new Date(),
            statusHistory: [...(p.statusHistory || []), statusEntry],
          },
        });

        detected.push({
          ...p,
          status: "detected",
          detectedAt: new Date(),
        } as unknown as PendingCommitment);
      }
    }

    return detected;
  }

  /**
   * 正文生成后，检测承诺是否兑现
   *
   * 三层匹配流水线：
   *   L1: 实体匹配（涉及实体在正文中同时出现）
   *   L2: 行为匹配（同义词检测）
   *   L3: closure_conditions 逐一检查
   *
   * @returns 状态变更的承诺列表
   */
  async postGenerateCheck(params: {
    chapterId: string;
    chapterContent: string;
  }): Promise<{ fulfilled: PendingCommitment[]; partial: PendingCommitment[] }> {
    const { chapterId, chapterContent } = params;

    // 取所有非终态的承诺
    const active = await prisma.pendingCommitment.findMany({
      where: {
        projectId: this.projectId,
        status: { in: ["pending", "detected", "partially_fulfilled"] },
      },
    }) as any[];

    const fulfilled: PendingCommitment[] = [];
    const partial: PendingCommitment[] = [];

    for (const p of active) {
      const conditions = (p.closureConditions || []) as ClosureCondition[];
      if (conditions.length === 0) continue;

      // L1+L2：实体+行为匹配
      let satisfiedCount = 0;
      for (const cond of conditions) {
        const match = this.matchCondition(cond, chapterContent);
        if (match) satisfiedCount++;
      }

      const ratio = conditions.length > 0 ? satisfiedCount / conditions.length : 0;

      // L3：判断
      let newStatus: CommitmentStatus | null = null;
      if (ratio >= 1.0) {
        newStatus = "fulfilled";
      } else if (ratio > 0 && ratio < 1.0 && condHasPartial(p.description, chapterContent)) {
        newStatus = "partially_fulfilled";
      }

      if (newStatus) {
        const statusEntry: StatusHistoryEntry = {
          from: p.status as CommitmentStatus,
          to: newStatus,
          trigger: "post_generation",
          chapterId,
          timestamp: new Date().toISOString(),
          details: `条件满足 ${satisfiedCount}/${conditions.length} (${(ratio * 100).toFixed(0)}%)`,
        };

        const updateData: any = {
          status: newStatus,
          fulfillmentRatio: ratio,
          statusHistory: [...(p.statusHistory || []), statusEntry],
        };

        if (newStatus === "fulfilled") {
          updateData.fulfilledChapterId = chapterId;
          updateData.fulfilledContentSnippet = extractRelevantSnippet(p.description, chapterContent);
          updateData.fulfilledAt = new Date();
        }

        if (newStatus === "partially_fulfilled") {
          updateData.partiallyFulfilledIds = [...(p.partiallyFulfilledIds || []), chapterId];
        }

        await prisma.pendingCommitment.update({
          where: { id: p.id },
          data: updateData,
        });

        const updated = { ...p, ...updateData } as unknown as PendingCommitment;
        if (newStatus === "fulfilled") fulfilled.push(updated);
        else partial.push(updated);
      }
    }

    return { fulfilled, partial };
  }

  /**
   * 超期检查——超过 20 章未兑现的自动废弃
   */
  async checkTimeouts(currentChapterOrder: number): Promise<number> {
    const active = await prisma.pendingCommitment.findMany({
      where: {
        projectId: this.projectId,
        status: { in: ["pending", "detected", "partially_fulfilled"] },
      },
    }) as any[];

    let voided = 0;

    for (const p of active) {
      const createdOrder = await this.getChapterOrder(p.sourceNodeId);
      const chaptersSince = currentChapterOrder - createdOrder;

      // 超过 20 章且覆盖率 < 0.3 → 自动废弃
      if (chaptersSince > MAX_UNFULFILLED_CHAPTERS && p.fulfillmentRatio < LOW_COVERAGE_THRESHOLD) {
        const statusEntry: StatusHistoryEntry = {
          from: p.status as CommitmentStatus,
          to: "voided",
          trigger: "timeout",
          timestamp: new Date().toISOString(),
          details: `超过 ${chaptersSince} 章未兑现，覆盖率 ${(p.fulfillmentRatio * 100).toFixed(0)}%`,
        };

        await prisma.pendingCommitment.update({
          where: { id: p.id },
          data: {
            status: "voided",
            voidReason: "timeout_low_coverage",
            voidedAt: new Date(),
            statusHistory: [...(p.statusHistory || []), statusEntry],
          },
        });

        voided++;
      }
    }

    return voided;
  }

  /**
   * 获取需要注入 prompt 的待处理承诺（给当前章 AI 看的提醒）
   */
  async getForPromptInjection(): Promise<PendingCommitment[]> {
    return prisma.pendingCommitment.findMany({
      where: {
        projectId: this.projectId,
        status: { in: ["pending", "detected", "partially_fulfilled"] },
        fulfillmentRatio: { lt: 0.3 }, // 进展太少的才提醒
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    }) as any;
  }

  /**
   * 将待处理承诺格式化为 prompt 注入文本
   */
  formatForPrompt(commitments: PendingCommitment[]): string {
    if (commitments.length === 0) return "";

    const lines: string[] = [];
    lines.push("【⚠️ 待兑现事项——必须在本章或后续章节中回收】");

    for (const c of commitments) {
      const statusIcon = c.status === "detected" ? "🔍" : c.status === "partially_fulfilled" ? "🔄" : "⏳";
      const priorityIcon = c.priority === "high" ? "🔴" : c.priority === "medium" ? "🟡" : "🟢";
      lines.push(`${statusIcon}${priorityIcon} [${c.priority}] ${c.description}（进度：${(c.fulfillmentRatio * 100).toFixed(0)}%）`);
    }

    return lines.join("\n");
  }

  // ── 私有方法 ──────────────────────────────────────────

  private async create(data: {
    source: string;
    sourceNodeId?: string;
    priority: string;
    description: string;
    entityIds: string[];
    closureConditions: ClosureCondition[];
  }): Promise<void> {
    await (prisma.pendingCommitment as any).create({
      data: {
        projectId: this.projectId,
        source: data.source,
        sourceNodeId: data.sourceNodeId || null,
        priority: data.priority,
        description: data.description,
        entityIds: data.entityIds,
        closureConditions: data.closureConditions,
        status: "pending",
        fulfillmentRatio: 0,
        partiallyFulfilledIds: [],
        statusHistory: [{
          from: "pending",
          to: "pending",
          trigger: "creation",
          timestamp: new Date().toISOString(),
          details: "承诺创建",
        }],
      },
    });
  }

  private matchCondition(cond: ClosureCondition, content: string): boolean {
    const val = cond.value.toLowerCase();
    const text = content.toLowerCase();

    switch (cond.type) {
      case "location":
        return text.includes(val);

      case "action":
        // 动作匹配：核心动词匹配即可
        const coreVerb = val.slice(0, 2); // 取前两个字符作为核心动词
        return text.includes(val) || text.includes(coreVerb);

      case "state_change":
        // 检查状态变化描述
        if (cond.from && cond.to) {
          return text.includes(cond.from) && text.includes(cond.to);
        }
        return text.includes(val);

      case "entity_presence":
        // 实体存在
        return cond.entity ? text.includes(cond.entity.toLowerCase()) : text.includes(val);

      case "dialogue":
        // 对话内容匹配（取核心词）
        const keywords = val.replace(/[？?！!。，,]/g, "").split(/\s+/).filter(w => w.length >= 2);
        return keywords.length > 0 && keywords.some(kw => text.includes(kw.toLowerCase()));

      default:
        return text.includes(val);
    }
  }

  private async getChapterOrder(nodeId?: string): Promise<number> {
    if (!nodeId) return 0;
    try {
      const node = await prisma.storyNode.findUnique({
        where: { id: nodeId },
        select: { order: true },
      });
      return node?.order ?? 0;
    } catch {
      return 0;
    }
  }
}

// ─── 辅助函数 ────────────────────────────────────────────

/**
 * 检查是否有部分兑现的迹象
 */
function condHasPartial(description: string, content: string): boolean {
  const descWords = description.replace(/[【】\[\]（）()]/g, "").slice(0, 20);
  return content.includes(descWords);
}

/**
 * 从正文中提取与承诺相关的片段
 */
function extractRelevantSnippet(description: string, content: string): string {
  const descKeywords = description.slice(0, 15);
  const idx = content.indexOf(descKeywords);
  if (idx === -1) return content.slice(0, 200);

  const start = Math.max(0, idx - 50);
  const end = Math.min(content.length, idx + 200);
  return content.slice(start, end).replace(/\n/g, " ");
}
