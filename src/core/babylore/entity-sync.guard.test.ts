import { describe, it, expect, vi, beforeEach } from "vitest";

// 夜间深度优化·角色卡建卡闸门守护测试：
//  (d) 谨慎建卡——频次门槛：低频（仅出现 1 次）的次要小角色不自动建卡，高频（≥2 次）才建；
//  (a/b/c) 变体并入——尊称/缩写/小名等变体（如「迪哥先生」）在已有同姓正主时并入其别名，
//          不建独立脏卡；含「·」的马甲（如「迪哥·若昂内」）不自动并入，独立建卡交由 dedupe 合并。

const createdChars: string[] = [];
const updatedAliases: Array<{ id: string; aliases: string[] }> = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    characterCard: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async (args: any) => {
        createdChars.push(args.data.name);
        return { id: "c-" + args.data.name, ...args.data };
      }),
      update: vi.fn(async (args: any) => {
        updatedAliases.push({ id: args.where.id, aliases: args.data.aliases });
        return args.data;
      }),
    },
    lorebookEntry: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: "l" })),
    },
    storyNode: {
      count: vi.fn(async () => 99),
    },
  },
}));

function mockLlm(entities: Array<Record<string, unknown>>) {
  (globalThis as any).fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ entities }) } }],
    }),
  }));
}

import { prisma } from "@/lib/prisma";
import { syncChapterEntities } from "@/core/babylore/entity-sync";

beforeEach(() => {
  createdChars.length = 0;
  updatedAliases.length = 0;
  vi.mocked(prisma.characterCard.findMany as any).mockResolvedValue([]);
  vi.mocked(prisma.storyNode.count as any).mockResolvedValue(99);
});

describe("(d) 谨慎建卡·频次门槛", () => {
  it("低频角色（仅出现 1 次）不建卡，进 skipped（疑似路人甲）", async () => {
    mockLlm([
      { name: "王服务员", type: "character", summary: "x", description: "餐厅里王服务员端来茶水" },
    ]);
    vi.mocked(prisma.storyNode.count as any).mockResolvedValue(1);
    const r = await syncChapterEntities("p-d-1", "正文占位", {
      baseURL: "u/v1",
      apiKey: "k",
      model: "m",
    });
    expect(createdChars).not.toContain("王服务员");
    expect(r.skipped.some((s) => s.includes("王服务员"))).toBe(true);
  });

  it("高频角色（出现 ≥2 次）正常建卡", async () => {
    mockLlm([
      { name: "苏明", type: "character", summary: "x", description: "苏明拔出长剑" },
    ]);
    vi.mocked(prisma.storyNode.count as any).mockResolvedValue(5);
    const r = await syncChapterEntities("p-d-2", "正文占位", {
      baseURL: "u/v1",
      apiKey: "k",
      model: "m",
    });
    expect(createdChars).toContain("苏明");
    expect(r.skipped.some((s) => s.includes("苏明"))).toBe(false);
  });
});

describe("(a/b/c) 变体并入正主别名", () => {
  it("「迪哥先生」在「迪哥」已存在时并入其别名，不建独立脏卡", async () => {
    vi.mocked(prisma.characterCard.findMany as any).mockResolvedValue([
      { id: "c-dige", name: "迪哥", aliases: [], relationships: [] },
    ]);
    mockLlm([
      { name: "迪哥先生", type: "character", summary: "x", description: "迪哥先生缓缓走来" },
    ]);
    vi.mocked(prisma.storyNode.count as any).mockResolvedValue(3);
    const r = await syncChapterEntities("p-v-1", "正文占位", {
      baseURL: "u/v1",
      apiKey: "k",
      model: "m",
    });
    // 不建独立卡
    expect(createdChars).not.toContain("迪哥先生");
    // 并入别名
    expect(r.createdChars.some((s) => s.includes("迪哥先生") && s.includes("并入"))).toBe(true);
    expect(updatedAliases.some((u) => u.id === "c-dige" && u.aliases.includes("迪哥先生"))).toBe(true);
  });

  it("「迪哥·若昂内」（含·马甲）不自动并入，独立建卡，交由 dedupe 合并", async () => {
    vi.mocked(prisma.characterCard.findMany as any).mockResolvedValue([
      { id: "c-dige", name: "迪哥", aliases: [], relationships: [] },
    ]);
    mockLlm([
      { name: "迪哥·若昂内", type: "character", summary: "x", description: "迪哥·若昂内现身" },
    ]);
    vi.mocked(prisma.storyNode.count as any).mockResolvedValue(3);
    const r = await syncChapterEntities("p-v-2", "正文占位", {
      baseURL: "u/v1",
      apiKey: "k",
      model: "m",
    });
    // 含·马甲不并入别名，走频次门槛后建卡
    expect(createdChars).toContain("迪哥·若昂内");
  });

  it("无同姓正主时「迪哥先生」不误并（正主不存在则按频次正常建卡）", async () => {
    // findMany 默认返回 []（无「迪哥」正主）→ resolveDiscoveryMergeTarget 返回 null
    mockLlm([
      { name: "迪哥先生", type: "character", summary: "x", description: "迪哥先生缓缓走来" },
    ]);
    vi.mocked(prisma.storyNode.count as any).mockResolvedValue(4);
    const r = await syncChapterEntities("p-v-3", "正文占位", {
      baseURL: "u/v1",
      apiKey: "k",
      model: "m",
    });
    // 没有正主可并入 → 不触发 update 别名，按频次建独立卡
    expect(updatedAliases.length).toBe(0);
    expect(createdChars).toContain("迪哥先生");
  });
});
