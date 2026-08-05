import { describe, it, expect, vi, beforeEach } from "vitest";

// mock prisma：仅覆盖 maybeAutoDeliver 用到的三个方法，确定性验证分支逻辑
const { findUnique, findMany, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique, update },
    storyNode: { findMany },
  },
}));

import { maybeAutoDeliver } from "./confirm-guard";

describe("maybeAutoDeliver（v1.1.0 自动整本交付判定）", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findMany.mockReset();
    update.mockReset();
  });

  it("autoDeliverEnabled=false → 不交付", async () => {
    findUnique.mockResolvedValue({ autoDeliverEnabled: false, confirmedAt: null });
    const r = await maybeAutoDeliver("p1");
    expect(r.delivered).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("已交付过（confirmedAt 非空）→ 不重复交付", async () => {
    findUnique.mockResolvedValue({ autoDeliverEnabled: true, confirmedAt: new Date().toISOString() });
    const r = await maybeAutoDeliver("p1");
    expect(r.delivered).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("全书仍有未确认章 → 不交付", async () => {
    findUnique.mockResolvedValue({ autoDeliverEnabled: true, confirmedAt: null });
    findMany.mockResolvedValue([{ status: "confirmed" }, { status: "drafting" }]);
    const r = await maybeAutoDeliver("p1");
    expect(r.delivered).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("项目无任何章节 → 不交付", async () => {
    findUnique.mockResolvedValue({ autoDeliverEnabled: true, confirmedAt: null });
    findMany.mockResolvedValue([]);
    const r = await maybeAutoDeliver("p1");
    expect(r.delivered).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("全书章节均已 confirmed + 开关开启 → 自动交付（置 confirmedAt）", async () => {
    findUnique.mockResolvedValue({ autoDeliverEnabled: true, confirmedAt: null });
    findMany.mockResolvedValue([
      { status: "confirmed" },
      { status: "confirmed" },
      { status: "confirmed" },
    ]);
    const r = await maybeAutoDeliver("p1");
    expect(r.delivered).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { confirmedAt: expect.any(Date) },
    });
  });

  it("DB 异常 → 静默吞掉，返回未交付（不抛）", async () => {
    findUnique.mockRejectedValue(new Error("db down"));
    const r = await maybeAutoDeliver("p1");
    expect(r.delivered).toBe(false);
  });
});
