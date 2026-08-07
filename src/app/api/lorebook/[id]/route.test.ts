import { describe, it, expect, vi, beforeEach } from "vitest";

// F1：PUT /api/lorebook/[id] 复用与 POST 一致的 category 15 类白名单，
// 非法分类（错字/越界）直接 400 拒绝，杜绝写库后被 globalPrompt 静默丢弃。

const updateCalls: any[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lorebookEntry: {
      update: vi.fn(async (args: any) => {
        updateCalls.push(args.data);
        return { id: "l1", projectId: "p1", ...args.data };
      }),
    },
  },
}));

vi.mock("@/core/sync-global-prompt", () => ({
  syncGlobalPrompt: vi.fn(async () => {}),
}));

import { PUT } from "@/app/api/lorebook/[id]/route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/lorebook/l1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PARAMS = { params: Promise.resolve({ id: "l1" }) };

beforeEach(() => {
  updateCalls.length = 0;
});

describe("F1 PUT category 白名单", () => {
  it("合法 category（geography）→ 200 且按值落库", async () => {
    const res = await PUT(makeReq({ title: "t", content: "c", category: "geography" }), PARAMS);
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].category).toBe("geography");
  });

  it("缺省 category（局部更新）→ 200，不误拒", async () => {
    const res = await PUT(makeReq({ title: "t" }), PARAMS);
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    // 未提供 category：保持部分更新语义，不写入非法值
    expect(updateCalls[0].category).toBeUndefined();
  });

  it("custom 本身在白名单内 → 200", async () => {
    const res = await PUT(makeReq({ title: "t", content: "c", category: "custom" }), PARAMS);
    expect(res.status).toBe(200);
    expect(updateCalls[0].category).toBe("custom");
  });

  it("非法 category（错字 currnecy）→ 400 且零落库", async () => {
    const res = await PUT(makeReq({ title: "t", content: "c", category: "currnecy" }), PARAMS);
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
    const json = await res.json();
    expect(json.field).toBe("category");
  });

  it("非字符串 category（数字）→ 400 且零落库", async () => {
    const res = await PUT(makeReq({ title: "t", content: "c", category: 123 }), PARAMS);
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });
});
