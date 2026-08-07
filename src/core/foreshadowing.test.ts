import { describe, it, expect, vi, beforeEach } from "vitest";

// 离线单测 detectPayoffs：mock prisma，验证伏笔收束检测的真实检索域。
// 核心断言：detect 现在同时扫描「章节摘要」与「章节实时正文(storyNode.content)」，
// 因此 refine 改写后（skipSummarize 使摘要陈旧）的回收信号也能被 detect 看见（修复新坑1）。
const prismaMock = vi.hoisted(() => ({
  pendingCommitment: { findMany: vi.fn(), update: vi.fn() },
  chapterSummary: { findMany: vi.fn() },
  storyNode: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/core/llm/client", () => ({ createLLMClient: vi.fn(), getEffectiveConfig: vi.fn() }));

import { detectPayoffs } from "@/core/foreshadowing";

const anchor = new Date("2026-01-01T00:00:00.000Z"); // 伏笔埋设时间
const later = new Date("2026-06-01T00:00:00.000Z"); // 晚于 anchor（章节撰写/refine 之后）

function baseCommit(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    status: "pending",
    description: "神秘戒指的下落",
    closureConditions: ["戒指已戴上"],
    fulfillmentRatio: 0,
    fulfilledAt: null,
    detectedAt: anchor,
    createdAt: anchor,
    ...over,
  };
}

describe("detectPayoffs（Round-4 修复新坑1：扫描实时正文而非陈旧摘要）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.pendingCommitment.update.mockResolvedValue({});
  });

  it("closure 仅出现在 refine 后的实时正文、摘要陈旧为空 → 仍判定 fulfilled", async () => {
    prismaMock.pendingCommitment.findMany.mockResolvedValue([baseCommit()]);
    // 陈旧摘要：无任何 closure 短语（模拟 refine 未刷新摘要）
    prismaMock.chapterSummary.findMany.mockResolvedValue([
      { createdAt: later, summary: "本章讲述主人公的日常修炼。", keyEvents: ["日常修炼"] },
    ]);
    // refine 改写后的实时正文含 closure 短语，且 updatedAt 晚于 anchor（refine 在此之后发生）
    prismaMock.storyNode.findMany.mockResolvedValue([
      { createdAt: anchor, updatedAt: later, content: "决战之时，他终于将戒指已戴上，命运齿轮就此转动。" },
    ]);

    const stats = await detectPayoffs("p1");

    expect(prismaMock.pendingCommitment.update).toHaveBeenCalledTimes(1);
    const data = prismaMock.pendingCommitment.update.mock.calls[0][0].data;
    expect(data.status).toBe("fulfilled");
    expect(data.fulfillmentRatio).toBe(1);
    expect(stats.fulfilled).toBe(1);
  });

  it("仅摘要含 closure、实时正文不含 → 仍命中（保持原摘要路径行为，不回归）", async () => {
    prismaMock.pendingCommitment.findMany.mockResolvedValue([baseCommit()]);
    prismaMock.chapterSummary.findMany.mockResolvedValue([
      { createdAt: later, summary: "他默默把戒指已戴上，伏笔在此收束。", keyEvents: [] },
    ]);
    prismaMock.storyNode.findMany.mockResolvedValue([
      { createdAt: anchor, updatedAt: later, content: "这一章描写了京城的夜景与市井烟火。" },
    ]);

    const stats = await detectPayoffs("p1");
    expect(prismaMock.pendingCommitment.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.pendingCommitment.update.mock.calls[0][0].data.status).toBe("fulfilled");
  });

  it("closure 既不在摘要也不在实时正文 → 不误判（维持 pending）", async () => {
    prismaMock.pendingCommitment.findMany.mockResolvedValue([baseCommit()]);
    prismaMock.chapterSummary.findMany.mockResolvedValue([
      { createdAt: later, summary: "平淡的一章。", keyEvents: [] },
    ]);
    prismaMock.storyNode.findMany.mockResolvedValue([
      { createdAt: anchor, updatedAt: later, content: "主角在院子里喝茶。" },
    ]);

    const stats = await detectPayoffs("p1");
    expect(prismaMock.pendingCommitment.update).not.toHaveBeenCalled();
    expect(stats.fulfilled).toBe(0);
  });

  it("正文 updatedAt 早于 anchor（伏笔埋设前写成、未 refine）→ 不纳入，避免污染", async () => {
    prismaMock.pendingCommitment.findMany.mockResolvedValue([baseCommit()]);
    prismaMock.chapterSummary.findMany.mockResolvedValue([]);
    // 正文虽含 closure 短语，但 updatedAt 早于 anchor（伏笔埋设前已定稿，非 refine 回收）
    const beforeAnchor = new Date("2025-12-01T00:00:00.000Z");
    prismaMock.storyNode.findMany.mockResolvedValue([
      { createdAt: beforeAnchor, updatedAt: beforeAnchor, content: "他早早就把戒指已戴上。" },
    ]);

    const stats = await detectPayoffs("p1");
    expect(prismaMock.pendingCommitment.update).not.toHaveBeenCalled();
    expect(stats.fulfilled).toBe(0);
  });
});
