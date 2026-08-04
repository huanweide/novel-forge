import { describe, it, expect, vi } from "vitest";

// 模拟服务端依赖，使 game-engine 的纯逻辑可在单测中导入
vi.mock("@/lib/prisma", () => ({
    prisma: {
    gameSession: { findUnique: vi.fn(), update: vi.fn() },
    gameState: { findMany: vi.fn(), create: vi.fn() },
    project: { findUnique: vi.fn() },
    storyNode: { findUnique: vi.fn() },
    characterCard: { findMany: vi.fn() },
    lorebookEntry: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/core/llm/client", () => ({
  getEffectiveConfig: vi.fn(),
  createLLMClient: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import { getSessionSummary, applyItemChanges, processGameTurn } from "./game-engine";
import { reconcileFromSummary, applyFrontendItemChanges } from "./reconcile";

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

// ─── P0-1：abort 信号透传 —— 停止后不提交本轮，对账读到 abort 前权威态 ──
describe("abort 信号透传（阿游 P0-1）", () => {
  const baseSession = {
    id: "s1",
    projectId: "p",
    nodeId: "n",
    status: "active",
    currentRound: 1,
    totalWords: 10,
    maxWords: 3000,
    plotProgress: 0,
    states: [
      { round: 1, narrative: "x", playerAction: "a", options: [], entities: [], items: [], wordCount: 10 },
    ],
  };

  it("signal 已 abort 时 processGameTurn 不调用 $transaction（丢弃本轮）", async () => {
    (prisma.gameSession.findUnique as any).mockResolvedValue(baseSession);
    (prisma.gameState.findMany as any).mockResolvedValue(baseSession.states);
    (prisma.project.findUnique as any).mockResolvedValue({ id: "p", name: "书" });
    (prisma.storyNode.findUnique as any).mockResolvedValue({ id: "n", title: "章", content: "" });
    (prisma.characterCard.findMany as any).mockResolvedValue([]);
    (prisma.lorebookEntry.findMany as any).mockResolvedValue([]);
    const txCalls: any[] = [];
    (prisma.$transaction as any).mockImplementation(async (ops: any) => { txCalls.push(ops); return []; });
    (getEffectiveConfig as any).mockResolvedValue({ writerModel: "m" });
    (createLLMClient as any).mockReturnValue({
      chatStream: async function* () { yield { content: "测试叙事" }; },
    });

    const controller = new AbortController();
    controller.abort();
    const gen = processGameTurn(
      { sessionId: "s1", actionType: "custom", actionText: "行动" },
      controller.signal
    );
    for await (const _ of gen) { /* 排空生成器 */ }

    expect(txCalls.length).toBe(0);
  });

  it("signal 未 abort 时正常提交（回归保护）", async () => {
    (prisma.gameSession.findUnique as any).mockResolvedValue(baseSession);
    (prisma.gameState.findMany as any).mockResolvedValue(baseSession.states);
    (prisma.project.findUnique as any).mockResolvedValue({ id: "p", name: "书" });
    (prisma.storyNode.findUnique as any).mockResolvedValue({ id: "n", title: "章", content: "" });
    (prisma.characterCard.findMany as any).mockResolvedValue([]);
    (prisma.lorebookEntry.findMany as any).mockResolvedValue([]);
    (prisma.lorebookEntry.findFirst as any).mockResolvedValue(null);
    const txCalls: any[] = [];
    (prisma.$transaction as any).mockImplementation(async (ops: any) => { txCalls.push(ops); return []; });
    (getEffectiveConfig as any).mockResolvedValue({ writerModel: "m" });
    (createLLMClient as any).mockReturnValue({
      chatStream: async function* () { yield { content: "测试叙事" }; },
    });

    const gen = processGameTurn(
      { sessionId: "s1", actionType: "custom", actionText: "行动" }
    );
    for await (const _ of gen) { /* 排空 */ }

    expect(txCalls.length).toBe(1);
  });

  it("abort 后对账：getSessionSummary 读到 abort 前权威态（currentRound 仍为 1，未推进）", async () => {
    (prisma.gameSession.findUnique as any).mockResolvedValue(baseSession);
    const summary = await getSessionSummary("s1");
    expect(summary.currentRound).toBe(1);
  });

  it("abort 透传（P1-1）：chatStream 调用携带 signal，底层 fetch 可被真正中断", async () => {
    (prisma.gameSession.findUnique as any).mockResolvedValue(baseSession);
    (prisma.gameState.findMany as any).mockResolvedValue(baseSession.states);
    (prisma.project.findUnique as any).mockResolvedValue({ id: "p", name: "书" });
    (prisma.storyNode.findUnique as any).mockResolvedValue({ id: "n", title: "章", content: "" });
    (prisma.characterCard.findMany as any).mockResolvedValue([]);
    (prisma.lorebookEntry.findMany as any).mockResolvedValue([]);
    (prisma.lorebookEntry.findFirst as any).mockResolvedValue(null);
    (prisma.$transaction as any).mockImplementation(async (ops: any) => { return []; });
    (getEffectiveConfig as any).mockResolvedValue({ writerModel: "m" });

    const captured: any[] = [];
    (createLLMClient as any).mockReturnValue({
      chatStream: async function* (req: any) { captured.push(req); yield { content: "测试叙事" }; },
    });

    const controller = new AbortController();
    const gen = processGameTurn(
      { sessionId: "s1", actionType: "custom", actionText: "行动" },
      controller.signal
    );
    for await (const _ of gen) { /* 排空生成器 */ }

    expect(captured.length).toBe(1);
    expect(captured[0].signal).toBe(controller.signal);
  });

  it("空流（0 chunk）不提交（P1-2）：$transaction 调用 0 次且 yield error 事件，灭幻影空轮次", async () => {
    (prisma.gameSession.findUnique as any).mockResolvedValue(baseSession);
    (prisma.gameState.findMany as any).mockResolvedValue(baseSession.states);
    (prisma.project.findUnique as any).mockResolvedValue({ id: "p", name: "书" });
    (prisma.storyNode.findUnique as any).mockResolvedValue({ id: "n", title: "章", content: "" });
    (prisma.characterCard.findMany as any).mockResolvedValue([]);
    (prisma.lorebookEntry.findMany as any).mockResolvedValue([]);
    (prisma.lorebookEntry.findFirst as any).mockResolvedValue(null);
    const txCalls: any[] = [];
    (prisma.$transaction as any).mockImplementation(async (ops: any) => { txCalls.push(ops); return []; });
    (getEffectiveConfig as any).mockResolvedValue({ writerModel: "m" });
    (createLLMClient as any).mockReturnValue({
      chatStream: async function* () { /* 0 chunks，空流 */ },
    });

    const gen = processGameTurn(
      { sessionId: "s1", actionType: "custom", actionText: "行动" }
    );
    const events: any[] = [];
    for await (const e of gen) { events.push(e); }

    expect(txCalls.length).toBe(0);
    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});

// ─── P1-1：前端不可变背包更新（applyFrontendItemChanges）──────────
describe("applyFrontendItemChanges —— 不可变更新（阿游 P1-1）", () => {
  const prev: any[] = [
    { name: "怀表", quantity: 2, category: "other", source: "s", acquiredRound: 1, owner: "主角" },
  ];

  it("gain 后返回新数组，且原 state.items 内部对象未被原地改写", () => {
    const clone = prev.map((i) => ({ ...i }));
    const res = applyFrontendItemChanges(clone, [{ operation: "gain", name: "怀表", quantity: 3, owner: "主角" }], 2);
    expect(res).not.toBe(clone);
    expect(res[0]).not.toBe(clone[0]);
    expect(res[0].quantity).toBe(5);
    // 原对象保持不变
    expect(clone[0].quantity).toBe(2);
  });

  it("consume 跨 owner 隔离：消耗李尘怀表不动主角怀表", () => {
    const items: any[] = [
      { name: "怀表", quantity: 2, category: "other", source: "s", acquiredRound: 1, owner: "主角" },
      { name: "怀表", quantity: 1, category: "other", source: "s", acquiredRound: 1, owner: "李尘" },
    ];
    const res = applyFrontendItemChanges(items, [{ operation: "consume", name: "怀表", quantity: 1, owner: "李尘" }], 2);
    expect(res.find((i: any) => i.owner === "李尘")).toBeUndefined();
    expect(res.find((i: any) => i.owner === "主角")?.quantity).toBe(2);
    // 原数组未被污染
    expect(items[0].quantity).toBe(2);
    expect(items[1].quantity).toBe(1);
  });
});

// ─── P1-2：getSessionSummary 实体按 name 去重 ────────────────────
describe("getSessionSummary —— 实体跨轮去重（阿游 P1-2）", () => {
  it("同一实体在多轮出现只保留末轮快照，不重复累积", async () => {
    const states = [
      {
        round: 1,
        narrative: "a",
        playerAction: "a",
        options: [],
        entities: [{ name: "李尘", type: "角色", description: "旧", firstSeenRound: 1 }],
        items: [],
        wordCount: 5,
      },
      {
        round: 2,
        narrative: "b",
        playerAction: "b",
        options: [],
        entities: [
          { name: "李尘", type: "角色", description: "新", firstSeenRound: 2 },
          { name: "王五", type: "角色", description: "w", firstSeenRound: 2 },
        ],
        items: [],
        wordCount: 5,
      },
      {
        round: 3,
        narrative: "c",
        playerAction: "c",
        options: [],
        entities: [{ name: "李尘", type: "角色", description: "最新", firstSeenRound: 3 }],
        items: [],
        wordCount: 5,
      },
    ];
    (prisma.gameSession.findUnique as any).mockResolvedValue({
      id: "s2",
      projectId: "p",
      nodeId: "n",
      status: "active",
      currentRound: 3,
      totalWords: 15,
      maxWords: 3000,
      plotProgress: 0,
      states,
    });
    const summary = await getSessionSummary("s2");
    expect(summary.entities.length).toBe(2);
    const li = summary.entities.find((e) => e.name === "李尘");
    expect(li?.description).toBe("最新"); // 取末轮
  });
});
