import { describe, it, expect, vi, beforeEach } from "vitest";

// 发布与过检统一检查路由（M2 + M3 + M4 一次拿全）的集成验证。
// 纯本地计算，不联网、不调 LLM：mock prisma 即可跑通编排逻辑。

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  storyNode: { findMany: vi.fn() },
  characterCard: { findMany: vi.fn() },
  pendingCommitment: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (payload: any, init?: any) => ({ payload, status: init?.status ?? 200 }),
  },
}));

import { POST } from "./route";

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) }) as any;
const makeReq = (body: any) => ({ json: async () => body }) as any;

describe("POST /api/projects/[id]/publish-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.project.findUnique.mockResolvedValue({ id: "p1", title: "测试小说" });
    prismaMock.storyNode.findMany.mockResolvedValue([
      {
        id: "n1",
        order: 0,
        title: "第一章",
        content: "他站了起来。命运的齿轮开始转动，仿佛整个世界都安静了。",
      },
    ]);
    prismaMock.characterCard.findMany.mockResolvedValue([]);
    prismaMock.pendingCommitment.findMany.mockResolvedValue([]);
  });

  it("项目不存在返回 404", async () => {
    prismaMock.project.findUnique.mockResolvedValue(null);
    const res: any = await POST(makeReq({ platform: "fanqie" }), makeParams("x"));
    expect(res.status).toBe(404);
  });

  it("正常返回三份报告 + meta（风险分落在 0-100）", async () => {
    const res: any = await POST(makeReq({ platform: "fanqie" }), makeParams("p1"));
    expect(res.status).toBe(200);
    expect(res.payload.risk).toBeDefined();
    expect(res.payload.consistency).toBeDefined();
    expect(res.payload.publish).toBeDefined();
    expect(res.payload.meta.riskPlatform).toBe("fanqie");
    expect(res.payload.meta.publishPlatform).toBe("fanqie");
    expect(res.payload.risk.riskScore).toBeGreaterThanOrEqual(0);
    expect(res.payload.risk.riskScore).toBeLessThanOrEqual(100);
    expect(res.payload.publish.summary.total).toBe(1);
  });

  it("空 body 用默认通用口径不报错", async () => {
    const res: any = await POST(makeReq(undefined), makeParams("p1"));
    expect(res.status).toBe(200);
    expect(res.payload.meta.riskPlatform).toBe("general");
    expect(res.payload.meta.publishPlatform).toBe("general");
  });

  it("jjwxc：过审预检用 jjwxc，发布诊断降级 general", async () => {
    const res: any = await POST(makeReq({ platform: "jjwxc" }), makeParams("p1"));
    expect(res.payload.meta.riskPlatform).toBe("jjwxc");
    expect(res.payload.meta.publishPlatform).toBe("general");
  });

  it("非法平台降级到 general 而非报错", async () => {
    const res: any = await POST(makeReq({ platform: "unknown-site" }), makeParams("p1"));
    expect(res.status).toBe(200);
    expect(res.payload.meta.riskPlatform).toBe("general");
    expect(res.payload.meta.publishPlatform).toBe("general");
  });

  it("staleThreshold 上限被夹紧到 200", async () => {
    const res: any = await POST(makeReq({ platform: "general", staleThreshold: 9999 }), makeParams("p1"));
    expect(res.status).toBe(200);
    // 不应抛错；阈值夹紧在内部，报告仍正常产出
    expect(res.payload.consistency).toBeDefined();
  });
});
