import { describe, it, expect, vi, beforeEach } from "vitest";

// v1.8.4 回归：导出路由 route.ts 的「路由层边界逻辑」此前零测试覆盖。
// 这些边界是多次修复累积的复杂拦截（F7 格式白名单 / v1.6.19 全本空壳 /
// R2-008 选章空树 / R3-IO 选章空子树 / FE-N7 违禁词预检），一旦改坏难以发现。
// 本文件纯锁定已验证的真实边界，绝不改动 route.ts 生产代码；
// 所有断言分支均在「进入流式构建之前」return，零流式执行风险。

const { findUniqueMock, findManyMock, bannedMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(async () => ({ name: "测试书" })),
  findManyMock: vi.fn(async () => [] as any[]),
  bannedMock: vi.fn((_: string) => [] as any[]),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: findUniqueMock },
    storyNode: { findMany: findManyMock },
  },
}));

vi.mock("@/lib/banned-words", () => ({ scanBannedWords: bannedMock }));

import { GET } from "@/app/api/projects/[id]/export/route";

function makeGet(search = ""): Request {
  return new Request(
    `http://localhost/api/projects/p1/export${search ? `?${search}` : ""}`,
    { method: "GET" }
  );
}

const params = { params: Promise.resolve({ id: "p1" }) };

function node(over: Record<string, unknown> = {}): any {
  return {
    id: "n1",
    projectId: "p1",
    parentId: null,
    order: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
    title: "第一章",
    content: "正文内容",
    wordCount: 10,
    ...over,
  };
}

beforeEach(() => {
  findUniqueMock.mockResolvedValue({ name: "测试书" });
  findManyMock.mockResolvedValue([]);
  bannedMock.mockReturnValue([]);
});

describe("v1.8.4 导出路由边界回归", () => {
  it("F7 格式白名单：非法 format -> 400 且提示不支持", async () => {
    const res = await GET(makeGet("format=pdf"), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("不支持");
  });

  it("项目不存在 -> 404", async () => {
    findUniqueMock.mockResolvedValueOnce(null as any);
    const res = await GET(makeGet("format=markdown"), params);
    expect(res.status).toBe(404);
  });

  it("空节点（无内容）-> 400 没有内容可导出", async () => {
    findManyMock.mockResolvedValueOnce([]);
    const res = await GET(makeGet("format=markdown"), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("没有内容可导出");
  });

  it("v1.6.19 全本空壳（节点均无正文）-> 400", async () => {
    findManyMock.mockResolvedValueOnce([
      node({ id: "n1", content: "" }),
      node({ id: "n2", content: "" }),
    ]);
    const res = await GET(makeGet("format=markdown"), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("没有任何正文可导出");
  });

  it("R2-008 选章空树（选中节点不存在）-> 400", async () => {
    findManyMock.mockResolvedValueOnce([node({ id: "n1" })]);
    const res = await GET(makeGet("format=markdown&chapterIds=n99"), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("未选中任何有效章节");
  });

  it("R3-IO 选章空子树（选中节点无正文且无后代）-> 400", async () => {
    findManyMock.mockResolvedValueOnce([node({ id: "n1", content: "" })]);
    const res = await GET(makeGet("format=markdown&chapterIds=n1"), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("所选范围无可导出正文");
  });

  it("FE-N7 违禁词预检（check=1）-> 200 且仅返回命中清单，不下载文件", async () => {
    findManyMock.mockResolvedValueOnce([node({ id: "n1", content: "敏感内容" })]);
    bannedMock.mockReturnValueOnce([{ word: "敏感", context: "敏感内容" }]);
    const res = await GET(makeGet("format=markdown&check=1"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.hits)).toBe(true);
    expect(body.hits[0].word).toBe("敏感");
  });
});
