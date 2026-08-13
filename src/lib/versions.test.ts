import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { snapshotRevision, REVISION_SOURCE_LABEL } from "./versions";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    storyNodeRevision: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const mockFindFirst = vi.mocked(prisma.storyNodeRevision.findFirst);
const mockCreate = vi.mocked(prisma.storyNodeRevision.create);

beforeEach(() => {
  mockFindFirst.mockReset();
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({} as any);
});

// create 真实入参是 { data: { nodeId, version, content, ... } }，
// 提取最末一次调用的 data 字段做部分匹配，避免 objectContaining 顶层层级错配。
function lastCreateData() {
  const call = mockCreate.mock.calls[mockCreate.mock.calls.length - 1];
  return (call[0] as any).data;
}

describe("REVISION_SOURCE_LABEL 来源标签映射", () => {
  it("关键来源中文标签正确", () => {
    expect(REVISION_SOURCE_LABEL["ai-write"]).toBe("AI 生成");
    expect(REVISION_SOURCE_LABEL.rollback).toBe("回滚快照");
    expect(REVISION_SOURCE_LABEL["auto-fill"]).toBe("自动填表");
    expect(REVISION_SOURCE_LABEL.unknown).toBe("未知");
  });
});

describe("snapshotRevision 版本快照去重", () => {
  it("空正文不快照（不调用 create）", async () => {
    await snapshotRevision({
      nodeId: "n1",
      projectId: "p1",
      source: "manual",
      prevContent: "   ",
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("无历史版本时创建 version=1", async () => {
    mockFindFirst.mockResolvedValue(null);
    await snapshotRevision({
      nodeId: "n1",
      projectId: "p1",
      source: "manual",
      prevContent: "正文A",
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(lastCreateData()).toMatchObject({
      nodeId: "n1",
      projectId: "p1",
      version: 1,
      content: "正文A",
    });
  });

  it("与最近一版内容相同则去重跳过（不重复记录）", async () => {
    mockFindFirst.mockResolvedValue({ version: 3, content: "正文A" } as any);
    await snapshotRevision({
      nodeId: "n1",
      projectId: "p1",
      source: "manual",
      prevContent: "正文A",
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("内容不同则创建 version=最近版本+1", async () => {
    mockFindFirst.mockResolvedValue({ version: 3, content: "旧内容" } as any);
    await snapshotRevision({
      nodeId: "n1",
      projectId: "p1",
      source: "ai-write",
      prevContent: "新内容",
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(lastCreateData()).toMatchObject({
      version: 4,
      content: "新内容",
      source: "ai-write",
    });
  });

  it("DB 创建失败静默忽略（不抛错、不阻断正文生成）", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockRejectedValue(new Error("db down"));
    await expect(
      snapshotRevision({
        nodeId: "n1",
        projectId: "p1",
        source: "manual",
        prevContent: "正文A",
      }),
    ).resolves.toBeUndefined();
  });
});
