import { describe, it, expect, vi, beforeEach } from "vitest";

// #319 回归：POST /api/projects/[id]/prompt-revisions/rollback 正确回滚。
// 隔离 prisma，断言：读指定版本 → 写回 globalPrompt → 落 source=rollback 新版本；
// 并覆盖 version 非法 / 项目不存在 / 版本不存在 / 快照写入失败 四类边界。

const store = vi.hoisted(() => ({
  project: { id: "p1", currentPromptVersion: 2 } as any,
  target: { version: 1, content: "回滚目标内容 v1" } as any,
  updateCalls: [] as any[],
  rollbackFails: false,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: vi.fn(async () => store.project),
      update: vi.fn(async (args: any) => {
        store.updateCalls.push(args);
        return args.data;
      }),
    },
    globalPromptRevision: {
      findUnique: vi.fn(async () => store.target),
    },
  },
}));

vi.mock("@/core/sync-global-prompt", () => ({
  recordGlobalPromptRevision: vi.fn(async (_pid: string, _content: string, source: string) => {
    if (store.rollbackFails) return null;
    return { version: 3, hash: "rb-hash", source };
  }),
}));

import { POST } from "@/app/api/projects/[id]/prompt-revisions/rollback/route";

const baseParams = { params: Promise.resolve({ id: "p1" }) };
const mkReq = (body: any) =>
  new Request("http://localhost/api/projects/p1/prompt-revisions/rollback", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  store.project = { id: "p1", currentPromptVersion: 2 };
  store.target = { version: 1, content: "回滚目标内容 v1" };
  store.updateCalls.length = 0;
  store.rollbackFails = false;
});

describe("POST /api/projects/[id]/prompt-revisions/rollback", () => {
  it("正常回滚：写回 globalPrompt + 落 rollback 新版本", async () => {
    const res = await POST(mkReq({ version: 1 }), baseParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.rolledBackFrom).toBe(1);
    expect(body.newVersion).toBe(3);

    const updateCall = store.updateCalls.find((c) => c.data && typeof c.data.globalPrompt === "string");
    expect(updateCall?.data?.globalPrompt).toBe("回滚目标内容 v1");
  });

  it("version 非法（<1）→ 400", async () => {
    const res = await POST(mkReq({ version: 0 }), baseParams);
    expect(res.status).toBe(400);
  });

  it("缺 version → 400", async () => {
    const res = await POST(mkReq({}), baseParams);
    expect(res.status).toBe(400);
  });

  it("项目不存在 → 404", async () => {
    store.project = null;
    const res = await POST(mkReq({ version: 1 }), baseParams);
    expect(res.status).toBe(404);
  });

  it("版本不存在 → 404", async () => {
    store.target = null;
    const res = await POST(mkReq({ version: 99 }), baseParams);
    expect(res.status).toBe(404);
  });

  it("版本快照写入失败 → 500", async () => {
    store.rollbackFails = true;
    const res = await POST(mkReq({ version: 1 }), baseParams);
    expect(res.status).toBe(500);
  });
});
