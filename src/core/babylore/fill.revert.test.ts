import { describe, it, expect, vi, beforeEach } from "vitest";

// #6 修复单测：自动填表溯源记录 + 撤销章节精确清理表格行。
// 通过 mock prisma（loreTable / babyloreFillBatch）与 fetch，无需真实 DB/LLM。

const updateCalls: any[] = [];
const batchCreates: any[] = [];
let batchStore: any[] = []; // 模拟 babyloreFillBatch 表
let loreTables: any[] = []; // 模拟 loreTable 表（供 revert 的 findUnique）

function makeTable() {
  return {
    id: "t1",
    key: "geo",
    name: "地点",
    note: "",
    category: "geo",
    columns: [
      { key: "name", label: "名称", type: "text" },
      { key: "related", label: "关联", type: "text" },
    ],
    rows: [{ row_id: 1, name: "青龙镇", related: "" }],
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    loreTable: {
      findMany: vi.fn(async () => [makeTable()]),
      findUnique: vi.fn(async (args: any) => loreTables.find((t) => t.id === args.where.id) || null),
      update: vi.fn(async (args: any) => {
        updateCalls.push(args);
        const t = loreTables.find((x) => x.id === args.where.id);
        if (t) t.rows = args.data.rows;
        return { id: args.where.id, ...(args.data || {}) };
      }),
    },
    babyloreFillBatch: {
      create: vi.fn(async (args: any) => {
        batchCreates.push(args);
        batchStore.push(args.data);
        return { id: "b" + batchStore.length, ...args.data };
      }),
      findMany: vi.fn(async (args: any) => {
        const w = (args.where || {}) as any;
        return batchStore.filter(
          (b) =>
            (w.projectId === undefined || b.projectId === w.projectId) &&
            (w.nodeId === undefined || b.nodeId === w.nodeId),
        );
      }),
      deleteMany: vi.fn(async (args: any) => {
        const before = batchStore.length;
        batchStore = batchStore.filter(
          (b) => !(b.projectId === args.where.projectId && b.nodeId === args.where.nodeId),
        );
        return { count: before - batchStore.length };
      }),
    },
    storyNode: {
      findMany: vi.fn(async () => [
        { id: "c1", order: 1, title: "第一章", content: CHAPTER },
        { id: "c2", order: 2, title: "第二章", content: "第二章 少年远行，踏入江湖。" },
      ]),
    },
  },
}));

vi.mock("@/lib/llm", () => ({
  getSettings: vi.fn(async () => ({ baseUrl: "https://api.deepseek.com/v1", apiKey: "k", model: "m" })),
  recordLlmCall: vi.fn(),
}));

vi.mock("@/core/llm/client", () => ({ buildProjectOverrides: vi.fn(() => ({})) }));

vi.mock("fs", () => {
  const store: Record<string, string> = {};
  const mocked = {
    readFileSync: vi.fn((p: string) => {
      if (store[p] !== undefined) return store[p];
      throw new Error("ENOENT");
    }),
    writeFileSync: vi.fn((p: string, d: string) => {
      store[p] = d;
    }),
    mkdirSync: vi.fn(),
  };
  return { ...mocked, default: mocked };
});

import { prisma } from "@/lib/prisma";
import { babyloreFill, revertBabyloreFill } from "@/core/babylore/fill";

const CHAPTER = "第一章 青龙镇外，少年踏入江湖。";

function mockFetch(content: string) {
  (globalThis as any).fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  }));
}

beforeEach(() => {
  updateCalls.length = 0;
  batchCreates.length = 0;
  batchStore = [];
  loreTables = [];
});

describe("#6 babyloreFill 记录自动填表溯源批次（锚定 nodeId）", () => {
  it("insert 新行且传 nodeId → 创建 BabyloreFillBatch，insertedRowIds 含新增 row_id", async () => {
    mockFetch(JSON.stringify({ operations: [{ table: "geo", op: "insert", values: { name: "新地点" } }] }));
    const r = await babyloreFill("proj-x", CHAPTER, { nodeId: "n1" });
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(1);
    expect(batchCreates.length).toBe(1);
    const created = batchCreates[0].data;
    expect(created.nodeId).toBe("n1");
    expect(created.loreTableId).toBe("t1");
    // 初始表仅 row_id=1，本次 insert 新行分配 row_id=2
    expect(created.insertedRowIds).toEqual([2]);
  });

  it("未传 nodeId → 不创建溯源批次（避免无锚点记录）", async () => {
    mockFetch(JSON.stringify({ operations: [{ table: "geo", op: "insert", values: { name: "孤立地点" } }] }));
    const r = await babyloreFill("proj-y", CHAPTER);
    expect(r.applied).toBe(1);
    expect(batchCreates.length).toBe(0);
  });

  it("applied=0（空 ops）→ 不创建溯源批次", async () => {
    mockFetch(JSON.stringify({ operations: [] }));
    const r = await babyloreFill("proj-z", CHAPTER, { nodeId: "n1" });
    expect(r.applied).toBe(0);
    expect(batchCreates.length).toBe(0);
  });
});

describe("#6 revertBabyloreFill 撤销章节精确清理表格行", () => {
  it("删除该章新增行，保留既有行；并清理溯源批次", async () => {
    loreTables = [{ id: "t1", rows: [{ row_id: 1, name: "青龙镇" }, { row_id: 2, name: "新地点" }] }];
    batchStore = [{ projectId: "p", nodeId: "n1", loreTableId: "t1", insertedRowIds: [2] }];
    const res = await revertBabyloreFill("p", "n1");
    expect(res.removed).toBe(1);
    expect(updateCalls.length).toBe(1);
    const kept = updateCalls[0].data.rows;
    expect(kept.map((r: any) => r.row_id)).toEqual([1]); // 仅保留既有行
    // 溯源批次被清理（幂等，撤销一次即清除，避免重复撤销）
    expect(batchStore.length).toBe(0);
  });

  it("仅删该章新增行，不动后续章节新增的行（数据安全）", async () => {
    loreTables = [
      {
        id: "t1",
        rows: [
          { row_id: 1, name: "A" },
          { row_id: 2, name: "B(n1新增)" },
          { row_id: 3, name: "C(n2新增)" },
        ],
      },
    ];
    // 只有 n1 的溯源批次，不含 n2 新增的 row_id=3
    batchStore = [{ projectId: "p", nodeId: "n1", loreTableId: "t1", insertedRowIds: [2] }];
    const res = await revertBabyloreFill("p", "n1");
    expect(res.removed).toBe(1);
    const kept = updateCalls[0].data.rows;
    expect(kept.map((r: any) => r.row_id).sort()).toEqual([1, 3]); // n2 的 C 不被误删
  });

  it("无该 nodeId 溯源批次 → 幂等返回 { removed: 0 }，不写库", async () => {
    batchStore = [];
    const res = await revertBabyloreFill("p", "nX");
    expect(res).toEqual({ removed: 0 });
    expect(updateCalls.length).toBe(0);
  });

  it("还原该章被 update 的既有行到更新前，不删行", async () => {
    // 填表后 row 1 的 related 被改为「新关联」，updatedRowsBefore 记录更新前「旧关联」
    loreTables = [{ id: "t1", rows: [{ row_id: 1, name: "青龙镇", related: "新关联" }] }];
    batchStore = [
      {
        projectId: "p",
        nodeId: "n1",
        loreTableId: "t1",
        insertedRowIds: [],
        updatedRowsBefore: { "1": { row_id: 1, name: "青龙镇", related: "旧关联" } },
      },
    ];
    const res = await revertBabyloreFill("p", "n1");
    expect(res.removed).toBe(0); // update 还原不算「删除」
    const kept = updateCalls[0].data.rows;
    expect(kept).toEqual([{ row_id: 1, name: "青龙镇", related: "旧关联" }]); // 精确还原更新前
    expect(batchStore.length).toBe(0);
  });

  it("后续章节也 update 同一行 → 撤销该章时不还原（保护后续数据）", async () => {
    loreTables = [{ id: "t1", rows: [{ row_id: 1, name: "青龙镇", related: "终值" }] }];
    const t0 = new Date(1000);
    const t1 = new Date(2000);
    batchStore = [
      { projectId: "p", nodeId: "n1", loreTableId: "t1", insertedRowIds: [], updatedRowsBefore: { "1": { row_id: 1, name: "青龙镇", related: "旧值" } }, createdAt: t0 },
      { projectId: "p", nodeId: "n2", loreTableId: "t1", insertedRowIds: [], updatedRowsBefore: { "1": { row_id: 1, name: "青龙镇", related: "中值" } }, createdAt: t1 },
    ];
    const res = await revertBabyloreFill("p", "n1");
    expect(res.removed).toBe(0);
    // n2 后续修改过 row 1，故 n1 撤销时不得还原，row 1 保持终值且不写库
    expect(updateCalls.length).toBe(0);
    expect(loreTables[0].rows).toEqual([{ row_id: 1, name: "青龙镇", related: "终值" }]);
    // n1 批次被清，n2 保留
    expect(batchStore.length).toBe(1);
  });
});
