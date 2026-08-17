import { describe, it, expect, vi, beforeEach } from "vitest";

// Round-29 FIX-5：GET /api/story/nodes/[id] 必须过滤软删节点（自身 + 子节点），
// 软删节点按「不存在」返回 404，避免 tombstone 经正常读取路径泄漏。

const prismaMock = vi.hoisted(() => ({
  storyNode: { findUnique: vi.fn() },
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

describe("GET /api/story/nodes/[id] 软删过滤 (FIX-5)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("软删节点：查询带 deletedAt:null，且按 404 处理不泄漏", async () => {
    prismaMock.storyNode.findUnique.mockResolvedValueOnce(null);
    const res: any = await GET({} as any, makeParams("del1"));
    expect(res.status).toBe(404);
    const call = prismaMock.storyNode.findUnique.mock.calls[0][0];
    expect(call.where).toEqual({ id: "del1", deletedAt: null });
    // 子节点 include 也必须过滤软删
    expect(call.include.children.where).toEqual({ deletedAt: null });
  });

  it("存活节点：正常返回，且查询仍带 deletedAt:null 过滤", async () => {
    prismaMock.storyNode.findUnique.mockResolvedValueOnce({
      id: "n1",
      title: "章1",
      content: "x",
      children: [{ id: "c1", deletedAt: null }],
      deletedAt: null,
    });
    const res: any = await GET({} as any, makeParams("n1"));
    expect(res.status).toBe(200);
    expect(res.payload.id).toBe("n1");
    const call = prismaMock.storyNode.findUnique.mock.calls[0][0];
    expect(call.where).toEqual({ id: "n1", deletedAt: null });
  });
});
