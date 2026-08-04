import { describe, it, expect, vi } from "vitest";

// 模拟服务端依赖，使 game-engine 的纯逻辑可在单测中导入
vi.mock("@/lib/prisma", () => ({
  prisma: {
    gameSession: { findUnique: vi.fn() },
    gameState: { findMany: vi.fn() },
  },
}));

vi.mock("@/core/llm/client", () => ({
  getEffectiveConfig: vi.fn(),
  createLLMClient: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getSessionSummary, applyItemChanges } from "./game-engine";
import { reconcileFromSummary } from "./reconcile";

// ─── P1：背包变动按 name+owner 隔离 ───────────────────────────
describe("applyItemChanges —— 按 name+owner 隔离（阿游 P1）", () => {
  const prev: any[] = [
    { name: "怀表", quantity: 2, category: "other", source: "s", acquiredRound: 1, owner: "主角" },
    { name: "怀表", quantity: 1, category: "other", source: "s", acquiredRound: 1, owner: "李尘" },
  ];

  it("消耗李尘的怀表不影响主角的同名怀表", () => {
    const res = applyItemChanges(
      prev,
      [{ operation: "consume", name: "怀表", quantity: 1, owner: "李尘" }],
      2
    );
    expect(res.length).toBe(1);
    expect(res[0].owner).toBe("主角");
    expect(res[0].quantity).toBe(2);
  });

  it("获得主角同名怀表只累加主角数量，不动李尘的", () => {
    const res = applyItemChanges(
      prev,
      [{ operation: "gain", name: "怀表", quantity: 3, owner: "主角" }],
      2
    );
    expect(res.find((i: any) => i.owner === "主角")?.quantity).toBe(5);
    expect(res.find((i: any) => i.owner === "李尘")?.quantity).toBe(1);
  });

  it("装备同名物品仅标记对应 owner，不污染另一方", () => {
    const res = applyItemChanges(
      prev,
      [{ operation: "equip", name: "怀表", owner: "李尘" }],
      2
    );
    expect(res.find((i: any) => i.owner === "李尘")?.equipped).toBe(true);
    expect(res.find((i: any) => i.owner === "主角")?.equipped).toBeUndefined();
  });

  it("消耗无 owner 默认匹配主角物品", () => {
    const res = applyItemChanges(
      prev,
      [{ operation: "consume", name: "怀表", quantity: 1 }],
      2
    );
    const zh = res.find((i: any) => i.owner === "主角");
    expect(zh?.quantity).toBe(1);
    expect(res.find((i: any) => i.owner === "李尘")?.quantity).toBe(1);
  });
});

// ─── P0-2：abort 后对账回拉使轮次/背包与后端权威态一致 ──────────
describe("abort 后对账回拉（阿游 P0-2）", () => {
  const mockStates = [
    {
      round: 1,
      narrative: "第一轮",
      playerAction: "开始",
      options: [],
      entities: [],
      items: [],
      wordCount: 50,
    },
    {
      round: 2,
      narrative: "第二轮",
      playerAction: "行动",
      options: [{ index: 1, text: "a" }],
      entities: [],
      items: [
        { name: "怀表", quantity: 2, category: "other", source: "s", acquiredRound: 1, owner: "主角" },
        { name: "怀表", quantity: 1, category: "other", source: "s", acquiredRound: 1, owner: "李尘" },
      ],
      wordCount: 70,
    },
  ];

  it("getSessionSummary 返回后端已提交轮的权威态（含两个 owner 不同的同名物品）", async () => {
    (prisma.gameSession.findUnique as any).mockResolvedValue({
      id: "s1",
      projectId: "p",
      nodeId: "n",
      status: "active",
      currentRound: 2,
      totalWords: 120,
      maxWords: 3000,
      plotProgress: 40,
      states: mockStates,
    });
    const summary = await getSessionSummary("s1");
    expect(summary.currentRound).toBe(2);
    expect(summary.items.length).toBe(2);
    const owners = summary.items.map((i: any) => i.owner).sort();
    expect(owners).toEqual(["主角", "李尘"]);
  });

  it("reconcileFromSummary 用后端权威态整体覆盖前端，轮次/背包与后端一致", () => {
    const summary = {
      currentRound: 2,
      totalWords: 120,
      plotProgress: 40,
      items: [
        { name: "怀表", quantity: 2, category: "other", source: "s", acquiredRound: 1, owner: "主角" },
        { name: "怀表", quantity: 1, category: "other", source: "s", acquiredRound: 1, owner: "李尘" },
      ],
      entities: [],
      narrative: "第一轮\n\n第二轮",
      options: [{ index: 1, text: "a" }],
      turns: [
        { round: 1, playerAction: "开始", narrative: "第一轮" },
        { round: 2, playerAction: "行动", narrative: "第二轮" },
      ],
    } as any;

    const frontend = reconcileFromSummary(summary);
    expect(frontend.currentRound).toBe(2);
    expect(frontend.totalWords).toBe(120);
    expect(frontend.items.length).toBe(2);
    expect(frontend.items.map((i: any) => i.owner).sort()).toEqual(["主角", "李尘"]);
    expect(frontend.turns.length).toBe(2);
  });
});
