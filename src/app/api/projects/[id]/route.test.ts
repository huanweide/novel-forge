import { describe, it, expect, vi, beforeEach } from "vitest";

// v1.6.40 回归：PATCH 漏同步 globalPrompt 修复。
// 用 vi.mock 隔离 prisma 与 syncGlobalPrompt，断言「改作品信息字段→触发同步 / 手动覆盖 globalPrompt→不触发」。

const { updateCalls, syncMock } = vi.hoisted(() => ({
  updateCalls: [] as any[],
  syncMock: vi.fn(async () => "synced"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      update: vi.fn(async (args: any) => {
        updateCalls.push(args);
        return { id: args.where.id, ...args.data };
      }),
      findUnique: vi.fn(async () => ({ deletedAt: null })),
    },
  },
}));

vi.mock("@/core/sync-global-prompt", () => ({ syncGlobalPrompt: syncMock }));

import { PATCH } from "@/app/api/projects/[id]/route";

function makePatch(body: unknown): Request {
  return new Request("http://localhost/api/projects/p1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "p1" }) };

beforeEach(() => {
  updateCalls.length = 0;
  syncMock.mockClear();
});

describe("v1.6.40 PATCH 漏同步修复", () => {
  it("改 genre → 触发 syncGlobalPrompt(projectId)", async () => {
    const res = await PATCH(makePatch({ genre: ["科幻"] }), params);
    expect(res.status).toBe(200);
    expect(syncMock).toHaveBeenCalledWith("p1");
  });

  it("改 synopsis → 触发 syncGlobalPrompt", async () => {
    const res = await PATCH(makePatch({ synopsis: "新总纲" }), params);
    expect(res.status).toBe(200);
    expect(syncMock).toHaveBeenCalledWith("p1");
  });

  it("改 toneKeywords → 触发 syncGlobalPrompt", async () => {
    const res = await PATCH(makePatch({ toneKeywords: ["热血"] }), params);
    expect(res.status).toBe(200);
    expect(syncMock).toHaveBeenCalledWith("p1");
  });

  it("改 authorNote → 触发 syncGlobalPrompt", async () => {
    const res = await PATCH(makePatch({ authorNote: "作者指令" }), params);
    expect(res.status).toBe(200);
    expect(syncMock).toHaveBeenCalledWith("p1");
  });

  it("显式传 globalPrompt（手动覆盖）→ 不触发 sync，保留手动内容", async () => {
    const res = await PATCH(makePatch({ genre: ["科幻"], globalPrompt: "手动覆盖内容" }), params);
    expect(res.status).toBe(200);
    expect(syncMock).not.toHaveBeenCalled();
    expect(updateCalls[0].data.globalPrompt).toBe("手动覆盖内容");
  });

  it("仅改 name（非作品信息字段）→ 不触发 sync", async () => {
    const res = await PATCH(makePatch({ name: "新书名" }), params);
    expect(res.status).toBe(200);
    expect(syncMock).not.toHaveBeenCalled();
  });
});
