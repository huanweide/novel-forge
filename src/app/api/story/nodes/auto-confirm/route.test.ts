import { describe, it, expect, vi, beforeEach } from "vitest";

// F3（Round-7）：auto-confirm 循环内单次 applyConfirm 必须传 skipDetect:true，
// 循环结束后统一只触发一次 triggerForeshadowDetect（与 batch-confirm 的“只触发一次”一致），
// 避免 N 个节点各触发一次 O(章数×伏笔数) 全量 detect 造成并发雪崩/超时。

const prismaMock = vi.hoisted(() => ({
  storyNode: { findMany: vi.fn() },
  project: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/server", () => ({
  NextResponse: { json: (payload: any, init?: any) => ({ payload, status: init?.status ?? 200 }) },
}));

const confirmGuardMock = vi.hoisted(() => ({
  evaluateConfirmEligibility: vi.fn(() => ({ eligible: true, score: 90, grade: "A" })),
  applyConfirm: vi.fn((_node: any) => Promise.resolve("自动填表已执行")),
  triggerForeshadowDetect: vi.fn(),
}));
vi.mock("@/core/confirm-guard", () => confirmGuardMock);

import { POST } from "./route";

const makeReq = (body: any) => ({ json: async () => body }) as any;

describe("auto-confirm route（F3：单次 skipDetect + 循环后只触发一次 detect）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmGuardMock.evaluateConfirmEligibility.mockReturnValue({ eligible: true, score: 90, grade: "A" });
    confirmGuardMock.applyConfirm.mockResolvedValue("自动填表已执行");
    confirmGuardMock.triggerForeshadowDetect.mockResolvedValue(undefined);
    prismaMock.storyNode.findMany.mockResolvedValue([
      { id: "n1", projectId: "p1", status: "drafting", content: "正文".repeat(60), title: "章1", reviewLogs: [], order: 1 },
      { id: "n2", projectId: "p1", status: "drafting", content: "正文".repeat(60), title: "章2", reviewLogs: [], order: 2 },
    ]);
    prismaMock.project.findUnique.mockResolvedValue({ characters: [{ name: "甲" }] });
  });

  it("N 个节点：每个 applyConfirm 传 skipDetect:true，且循环后只触发一次 detect", async () => {
    const res: any = await POST(makeReq({ projectId: "p1", nodeIds: ["n1", "n2"] }));
    expect(res.status).toBe(200);
    expect(res.payload.ok).toBe(true);
    expect(res.payload.summary.confirmed).toBe(2);

    expect(confirmGuardMock.applyConfirm).toHaveBeenCalledTimes(2);
    for (const call of confirmGuardMock.applyConfirm.mock.calls) {
      expect(call[0].skipDetect).toBe(true);
    }
    expect(confirmGuardMock.triggerForeshadowDetect).toHaveBeenCalledTimes(1);
    expect(confirmGuardMock.triggerForeshadowDetect).toHaveBeenCalledWith({ projectId: "p1" });
  });

  it("无节点被确认时不触发 detect", async () => {
    prismaMock.storyNode.findMany.mockResolvedValue([]);
    const res: any = await POST(makeReq({ projectId: "p1", nodeIds: ["n1"] }));
    expect(res.payload.summary.confirmed).toBe(0);
    expect(confirmGuardMock.triggerForeshadowDetect).not.toHaveBeenCalled();
  });
});
