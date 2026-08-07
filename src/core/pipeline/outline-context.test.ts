import { describe, it, expect, vi } from "vitest";

// outline-context 在模块顶层 import prisma 与 rules，单测中以桩替换，避免触库 / 拉重依赖。
const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  storyline: { findMany: vi.fn() },
  storyNode: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/core/rules", () => ({
  getActiveRules: vi.fn(),
  injectRules: vi.fn((note: string) => note),
}));

import { pickReassignMainId } from "@/core/pipeline/outline-context";

describe("pickReassignMainId（NEW-5: 多活跃主线防跨线误归属）", () => {
  it("无兄弟主线 / 非法入参 → 返回 null（子线置空交由 resolveParent 回退）", () => {
    expect(pickReassignMainId([])).toBeNull();
    expect(pickReassignMainId(undefined as unknown as any[])).toBeNull();
  });

  it("恰有一条活跃兄弟主线 → 返回该主线 id（单父级合法重挂）", () => {
    const siblings = [
      { id: "m1", status: "active" },
      { id: "m2", status: "completed" },
    ];
    expect(pickReassignMainId(siblings)).toBe("m1");
  });

  it("≥2 条活跃兄弟主线 → 返回 null（不盲目嫁接第一条，防跨线误归属）", () => {
    const siblings = [
      { id: "m1", status: "active" },
      { id: "m2", status: "active" },
    ];
    expect(pickReassignMainId(siblings)).toBeNull();
  });

  it("仅 completed/abandoned 兄弟 → 返回 null（不挂到终态主线）", () => {
    const siblings = [
      { id: "m1", status: "completed" },
      { id: "m2", status: "abandoned" },
    ];
    expect(pickReassignMainId(siblings)).toBeNull();
  });
});
