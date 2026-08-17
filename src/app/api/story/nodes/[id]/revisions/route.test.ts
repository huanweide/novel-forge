import { describe, it, expect, vi, beforeEach } from "vitest";

// Round-29 FIX-5：GET /api/story/nodes/[id]/revisions 校验父节点时必须过滤软删，
// 软删节点的版本历史按「不存在」返回 404。

const prismaMock = vi.hoisted(() => ({
  storyNode: { findUnique: vi.fn() },
  storyNodeRevision: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (payload: any, init?: any) => ({ payload, status: init?.status ?? 200 }),
  },
}));
vi.mock("@/lib/api-error", () => ({
  jsonError: (err: any) => ({ payload: { error: String(err) }, status: 500 }),
}));

import { GET } from "./route";

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) }) as any;

describe("GET /api/story/nodes/[id]/revisions 软删过滤 (FIX-5)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("软删节点：按 404 处理，且查询带 deletedAt:null", async () => {
    prismaMock.storyNode.findUnique.mockResolvedValueOnce(null);
    const res: any = await GET({} as any, makeParams("del1"));
    expect(res.status).toBe(404);
    const call = prismaMock.storyNode.findUnique.mock.calls[0][0];
    expect(call.where).toEqual({ id: "del1", deletedAt: null });
  });

  it("存活节点：正常返回版本列表", async () => {
    prismaMock.storyNode.findUnique.mockResolvedValueOnce({ id: "n1" });
    prismaMock.storyNodeRevision.findMany.mockResolvedValueOnce([
      { id: "r1", version: 2, wordCount: 10, source: "manual", summary: null, createdAt: new Date() },
    ]);
    const res: any = await GET({} as any, makeParams("n1"));
    expect(res.status).toBe(200);
    expect(res.payload.revisions).toHaveLength(1);
  });
});
