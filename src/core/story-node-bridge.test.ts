import { describe, it, expect } from "vitest";
import { toAppStoryNode } from "@/core/story-node-bridge";
import type { StoryNode as PrismaStoryNode } from "@/generated/prisma/client";

// 关键路径：每个 StoryNode 从 DB 读出都要经 toAppStoryNode 桥接成应用层强类型。
// 此前该映射零单测，任何字段/兜底白名单改动都可能静默把合法状态降级成 outline_only。
// 本测试钉死「已知值透传 + 未知值兜底」两条契约，作为回归护栏。

function makeRaw(overrides: Partial<PrismaStoryNode> = {}): PrismaStoryNode {
  return {
    id: "n1",
    projectId: "p1",
    parentId: null,
    type: "section",
    title: "第一章",
    order: 1,
    status: "drafting",
    outline: null,
    content: "正文",
    wordCount: 100,
    branchId: null,
    isMainBranch: true,
    activeCharacters: ["c1"],
    activeLoreIds: ["l1"],
    coreConflict: null,
    settingDescription: null,
    notes: null,
    reviewLogs: [],
    revisionCount: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    deletedAt: null,
    ...overrides,
  } as PrismaStoryNode;
}

describe("toAppStoryNode", () => {
  it("正常映射已知 type/status 与数组字段", () => {
    const out = toAppStoryNode(makeRaw());
    expect(out.id).toBe("n1");
    expect(out.type).toBe("section");
    expect(out.status).toBe("drafting");
    expect(out.activeCharacters).toEqual(["c1"]);
    expect(out.activeLoreIds).toEqual(["l1"]);
    expect(out.content).toBe("正文");
    expect(out.order).toBe(1);
    expect(out.deletedAt).toBeNull();
  });

  it("未知 type 兜底为 section", () => {
    const out = toAppStoryNode(makeRaw({ type: "weird" as never }));
    expect(out.type).toBe("section");
  });

  it("未知 status 兜底为 outline_only", () => {
    const out = toAppStoryNode(makeRaw({ status: "ghost" as never }));
    expect(out.status).toBe("outline_only");
  });

  it("合法 status 全集均不被错误降级", () => {
    const all = [
      "outline_only",
      "drafting",
      "completed",
      "reviewing",
      "rejected",
      "revised",
      "pending_confirm",
      "confirmed",
    ] as const;
    for (const s of all) {
      expect(toAppStoryNode(makeRaw({ status: s })).status).toBe(s);
    }
  });

  it("合法 type 全集均不被错误降级", () => {
    for (const t of ["volume", "chapter", "section", "scene"] as const) {
      expect(toAppStoryNode(makeRaw({ type: t })).type).toBe(t);
    }
  });

  it("reviewLogs 非数组兜底为空数组", () => {
    const out = toAppStoryNode(makeRaw({ reviewLogs: "not-array" as never }));
    expect(out.reviewLogs).toEqual([]);
  });

  it("activeCharacters / activeLoreIds 非数组兜底为空数组", () => {
    const out = toAppStoryNode(
      makeRaw({ activeCharacters: null as never, activeLoreIds: undefined as never }),
    );
    expect(out.activeCharacters).toEqual([]);
    expect(out.activeLoreIds).toEqual([]);
  });

  it("deletedAt 为 undefined 时兜底为 null", () => {
    const out = toAppStoryNode(makeRaw({ deletedAt: undefined as never }));
    expect(out.deletedAt).toBeNull();
  });

  it("deletedAt 有值则保留", () => {
    const d = new Date("2026-05-05");
    expect(toAppStoryNode(makeRaw({ deletedAt: d })).deletedAt).toBe(d);
  });
});
