import { describe, it, expect, vi, beforeEach } from "vitest";

// 单元自测：墨白 P0-3（空 ops / 全失效 → 不标已填、可重试）与 P1-1（update 未命中非身份列不静默建伪行）。
// 通过 mock prisma / llm / fetch，无需真实 LLM 与数据库即可驱动 babyloreFill 内部逻辑。

const updateCalls: any[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    loreTable: {
      findMany: vi.fn(async () => [makeTable()]),
      update: vi.fn(async (args: any) => {
        updateCalls.push(args);
        return { id: args.where.id, ...(args.data || {}) };
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

vi.mock("@/core/llm/client", () => ({
  buildProjectOverrides: vi.fn(() => ({})),
}));

// mock 文件系统，隔离「已填标记」持久化（.runtime/babylore-filled.json），避免跨测试串味
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

import { babyloreFill, babyloreFillAll } from "@/core/babylore/fill";

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

function mockFetch(content: string) {
  (globalThis as any).fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  }));
}

const CHAPTER = "第一章 青龙镇外，少年踏入江湖。";

beforeEach(() => {
  updateCalls.length = 0;
});

describe("P0-3 空 ops 章节不标已填（applied=0 视为失败可重试）", () => {
  it("模型连续返回空 ops → babyloreFill 返回 ok:false 且 applied:0", async () => {
    mockFetch(JSON.stringify({ operations: [] }));
    const r = await babyloreFill("proj-x", CHAPTER);
    expect(r.ok).toBe(false);
    expect(r.applied).toBe(0);
    // 失败章必须带 error/warning 暴露，便于重试而非静默吞掉
    const exposed = (r.error || "") + (r.warnings || []).join("");
    expect(exposed).toMatch(/未落地任何事实|模型未返回任何有效操作/);
  });

  it("正常 insert ops → applied>0 且 ok:true（对照）", async () => {
    mockFetch(JSON.stringify({ operations: [{ table: "geo", op: "insert", values: { name: "新地点" } }] }));
    const r = await babyloreFill("proj-x", CHAPTER);
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(1);
    expect(updateCalls.length).toBe(1);
  });
});

describe("P1-1 update 未命中且非身份列 → 不静默建伪行", () => {
  it("按 related 列 update 未命中 → 跳过、applied:0、告警、零写库", async () => {
    mockFetch(
      JSON.stringify({
        operations: [{ table: "geo", op: "update", match: { col: "related", val: "不存在之物" }, values: { desc: "x" } }],
      }),
    );
    const r = await babyloreFill("proj-x", CHAPTER);
    expect(r.applied).toBe(0);
    expect(r.ok).toBe(false);
    // 身份列（name）未被污染，未插伪行 → 不应有写库动作
    expect(updateCalls.length).toBe(0);
    expect((r.warnings || []).join("")).toContain("非身份列");
  });

  it("按身份列 name update 未命中 → 仍可正常 upsert 建行", async () => {
    mockFetch(
      JSON.stringify({
        operations: [{ table: "geo", op: "update", match: { col: "name", val: "新角色" }, values: { related: "y" } }],
      }),
    );
    const r = await babyloreFill("proj-x", CHAPTER);
    expect(r.applied).toBe(1);
    expect(r.ok).toBe(true);
    expect(updateCalls.length).toBe(1);
    const written = updateCalls[0].data.rows as any[];
    expect(written.some((row: any) => row.name === "新角色")).toBe(true);
  });
});

// ─── P1-1 babyloreFillAll 不得恒返回 ok:true（静默假完成）───
// 验证汇总态真实反映各章 applied/ok：全章失败 → ok:false；部分失败 → ok:false；
// 全部已填跳过 → ok:true（正常无需重试）。
describe("P1-1 babyloreFillAll 汇总态真实反映成败", () => {
  it("全章填表失败（空 ops）→ 返回 ok:false、failed=章数、带 error（非静默假完成）", async () => {
    mockFetch(JSON.stringify({ operations: [] }));
    const r = await babyloreFillAll("proj-x");
    expect(r.ok).toBe(false);
    expect(r.applied).toBe(0);
    expect(r.processed).toBe(2);
    expect(r.failed).toBe(2);
    expect(r.error).toBeTruthy();
  });

  it("有章成功、有章失败 → 仍 ok:false 且暴露失败章数", async () => {
    let call = 0;
    (globalThis as any).fetch = vi.fn(async () => {
      call++;
      const content =
        call === 1
          ? JSON.stringify({ operations: [{ table: "geo", op: "insert", values: { name: "真地点" } }] })
          : JSON.stringify({ operations: [] });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
      };
    });
    const r = await babyloreFillAll("proj-x");
    expect(r.failed).toBe(1);
    expect(r.applied).toBe(1);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("1/2");
  });

  it("全部章节被跳过（全空/旧版误标脏标记）→ ok:false 且带 warning 摘要（P1-1 防静默假完成）", async () => {
    mockFetch(JSON.stringify({ operations: [{ table: "geo", op: "insert", values: { name: "全填地点" } }] }));
    await babyloreFillAll("proj-x"); // 先填满，持久化已填标记
    const r = await babyloreFillAll("proj-x"); // 再跑，应全部跳过
    expect(r.processed).toBe(0);
    expect(r.skipped).toBe(2);
    expect(r.applied).toBe(0);
    // Round8 P1-1：全跳过且无任何 applied 必须 ok:false，不得掩盖脏标记。
    expect(r.ok).toBe(false);
    expect(r.error).toContain("跳过");
    expect(r.error).toContain("脏标记");
  });
});
