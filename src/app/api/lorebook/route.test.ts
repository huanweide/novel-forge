import { describe, it, expect, vi, beforeEach } from "vitest";

// R2-014 应用级白名单：lorebook 路由对 category 做 15 类白名单校验，
// 非法值拒绝（400），合法值（含兜底 custom）放行。

const createCalls: any[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lorebookEntry: {
      create: vi.fn(async (args: any) => {
        createCalls.push(args.data);
        return { id: "l1", ...args.data };
      }),
    },
  },
}));

vi.mock("@/core/sync-global-prompt", () => ({
  syncGlobalPrompt: vi.fn(async () => {}),
}));

import { POST } from "@/app/api/lorebook/route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/lorebook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BASE = {
  projectId: "p1",
  title: "测试词条",
  content: "设定内容",
};

beforeEach(() => {
  createCalls.length = 0;
});

describe("R2-014 category 白名单", () => {
  it("合法 category（geography）→ 201 且落库", async () => {
    const res = await POST(makeReq({ ...BASE, category: "geography" }));
    expect(res.status).toBe(201);
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].category).toBe("geography");
  });

  it("缺省 category → 兜底 custom（合法）→ 放行", async () => {
    const res = await POST(makeReq({ ...BASE }));
    expect(res.status).toBe(201);
    expect(createCalls[0].category).toBe("custom");
  });

  it("非法 category（错字/越界）→ 400 且零落库", async () => {
    const res = await POST(makeReq({ ...BASE, category: "地理" }));
    expect(res.status).toBe(400);
    expect(createCalls).toHaveLength(0);
    const json = await res.json();
    expect(json.field).toBe("category");
  });

  it("边界：custom 本身在白名单内 → 放行", async () => {
    const res = await POST(makeReq({ ...BASE, category: "custom" }));
    expect(res.status).toBe(201);
    expect(createCalls[0].category).toBe("custom");
  });
});
