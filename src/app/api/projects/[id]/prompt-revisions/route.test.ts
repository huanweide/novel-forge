import { describe, it, expect, vi, beforeEach } from "vitest";

// #316/#318 回归：GET /api/projects/[id]/prompt-revisions 正确列出版本快照。
// 隔离 prisma，断言：项目存在时返回 currentPromptVersion + 每个版本的元数据和内容预览；
// 项目不存在时返回 404。

const store = vi.hoisted(() => ({
  project: { id: "p1", currentPromptVersion: 2 } as any,
  revisions: [] as any[],
}));

const LONG = "x".repeat(500);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: vi.fn(async () => store.project),
    },
    globalPromptRevision: {
      findMany: vi.fn(async () => store.revisions),
    },
  },
}));

import { GET } from "@/app/api/projects/[id]/prompt-revisions/route";

const params = { params: Promise.resolve({ id: "p1" }) };
const req = new Request("http://localhost/api/projects/p1/prompt-revisions");

beforeEach(() => {
  store.project = { id: "p1", currentPromptVersion: 2 };
  store.revisions = [
    { version: 2, source: "sync", hash: "h2", wordCount: 500, summary: null, createdAt: new Date("2026-08-12T10:00:00Z"), content: LONG },
    { version: 1, source: "manual", hash: "h1", wordCount: 10, summary: "初始", createdAt: new Date("2026-08-11T10:00:00Z"), content: "短内容" },
  ];
});

describe("GET /api/projects/[id]/prompt-revisions", () => {
  it("返回当前生效版本指针 + 版本列表（含长内容预览截断）", async () => {
    const res = await GET(req, params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentPromptVersion).toBe(2);
    expect(body.revisions).toHaveLength(2);

    // 最新版本在前（version desc）
    expect(body.revisions[0].version).toBe(2);
    expect(body.revisions[0].source).toBe("sync");
    expect(body.revisions[0].wordCount).toBe(500);
    // 长内容预览截断到 300 字 + 省略号
    expect(body.revisions[0].preview).toHaveLength(301);
    expect(body.revisions[0].preview.endsWith("…")).toBe(true);

    // 短内容预览为全文（无省略号）
    expect(body.revisions[1].version).toBe(1);
    expect(body.revisions[1].source).toBe("manual");
    expect(body.revisions[1].summary).toBe("初始");
    expect(body.revisions[1].preview).toBe("短内容");
  });

  it("项目不存在 → 404", async () => {
    store.project = null;
    const res = await GET(req, params);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("项目不存在");
  });
});
