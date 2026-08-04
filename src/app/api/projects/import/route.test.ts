import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mock prisma：$transaction 直接执行回调，tx 各方法记录调用 ──
const createdBranches: any[] = [];
const branchUpdates: any[] = [];
let counter = 0;

const fakeTx: any = {
  project: {
    create: vi.fn(async () => ({ id: "newPid" })),
    findUnique: vi.fn(async () => null),
  },
  storyBranch: {
    create: vi.fn(async (a: any) => {
      createdBranches.push(a.data);
      return { id: "b" + ++counter };
    }),
    update: vi.fn(async (a: any) => {
      branchUpdates.push(a.data);
      return {};
    }),
  },
  storyNode: {
    create: vi.fn(async () => ({ id: "n" + ++counter })),
    update: vi.fn(async () => ({})),
  },
  lorebookEntry: { create: vi.fn(async () => ({})), update: vi.fn(async () => ({})) },
  characterCard: { create: vi.fn(async () => ({})) },
  storyline: { create: vi.fn(async () => ({})) },
  styleCard: { create: vi.fn(async () => ({})) },
  loreTable: { create: vi.fn(async () => ({})) },
  rule: { create: vi.fn(async () => ({})) },
};

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn(async (cb: any) => cb(fakeTx)) },
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (payload: any, init?: any) => ({ payload, status: init?.status ?? 200 }),
  },
}));

import { POST } from "./route";

const makeReq = (body: any) => ({ json: async () => body }) as any;

describe("import route — 分支导入 (G1/W1)", () => {
  beforeEach(() => {
    createdBranches.length = 0;
    branchUpdates.length = 0;
    counter = 0;
  });

  it("G1: 含 forkPointNodeId 的分支仅导入 branches 不抛错，forkPointNodeId 必填被占位", async () => {
    const bundle = {
      format: "nfproject",
      project: {
        id: "orig1",
        name: "Test",
        storyBranches: [
          { id: "br1", name: "主线", forkPointNodeId: "nodeX", parentBranchId: null },
          { id: "br2", name: "支线", forkPointNodeId: "nodeY", parentBranchId: "br1" },
        ],
      },
      include: ["branches"],
    };
    const res: any = await POST(makeReq(bundle));
    expect(res.status).toBe(200);
    expect(res.payload.success).toBe(true);
    // 每个分支创建时都提供了 forkPointNodeId（占位），否则 Prisma 抛缺必填 → 整事务回滚
    for (const b of createdBranches) {
      expect(typeof b.forkPointNodeId).toBe("string");
    }
    // W1: parentBranchId 被重映射（旧 br1 → 新 id），不再悬空指向旧 id
    const parentUpdate = branchUpdates.find((u) => u.parentBranchId);
    expect(parentUpdate).toBeTruthy();
    expect(parentUpdate!.parentBranchId).not.toBe("br1");
    expect(parentUpdate!.parentBranchId).toMatch(/^b\d+$/);
    // W1: 仅导入 branches 时 forkPoint 节点未导入 → 标注丢失（不静默丢）
    expect(typeof res.payload.warnings).toBe("string");
    expect(res.payload.warnings).toContain("分叉点");
  });

  it("W1: 全量导入时 forkPoint 重映射为新节点 id，无丢失警告", async () => {
    const bundle = {
      format: "nfproject",
      project: {
        id: "orig2",
        name: "Test2",
        storyBranches: [
          { id: "br1", name: "主线", forkPointNodeId: "nodeX", parentBranchId: null },
        ],
        storyNodes: [{ id: "nodeX", title: "第1章" }],
      },
      include: ["branches", "chapters"],
    };
    const res: any = await POST(makeReq(bundle));
    expect(res.status).toBe(200);
    expect(res.payload.success).toBe(true);
    // forkPoint 成功重映射为新节点 id（不再指向旧 id nodeX）
    const forkUpdate = branchUpdates.find((u) => u.forkPointNodeId);
    expect(forkUpdate!.forkPointNodeId).not.toBe("nodeX");
    expect(forkUpdate!.forkPointNodeId).toMatch(/^n\d+$/);
    // 全量导入且 fork 节点存在 → 无丢失警告
    expect(res.payload.warnings).toBeUndefined();
  });
});
