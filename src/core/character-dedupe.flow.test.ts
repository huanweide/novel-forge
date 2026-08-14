import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// ── mock prisma（character-dedupe 顶层构造 PrismaClient，需占位 DATABASE_URL；调用走 mock）──
// 必须用 vi.hoisted，否则 vi.mock 工厂在提升阶段引用 mockFindMany 会因 TDZ 报错。
const h = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpdate: vi.fn(),
  mockCreate: vi.fn(),
  mockProjectFind: vi.fn().mockResolvedValue({ globalPrompt: "", synopsis: "" }),
  mockNodeFind: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    characterCard: {
      findMany: (...a: any[]) => h.mockFindMany(...a),
      update: (...a: any[]) => h.mockUpdate(...a),
    },
    characterCardRevision: { create: (...a: any[]) => h.mockCreate(...a) },
    project: { findUnique: (...a: any[]) => h.mockProjectFind(...a) },
    storyNode: { findMany: (...a: any[]) => h.mockNodeFind(...a) },
  },
}));

// LLM 分组返回空 → 迫使走规则/宽松分组路径（确定性，不依赖外部模型）
vi.mock("@/core/llm/client", () => ({
  completeText: vi.fn().mockResolvedValue("{}"),
}));

let dedupeCharacters: (
  projectId: string,
  opts?: { detectOnly?: boolean }
) => Promise<{
  mergedGroups: any[];
  pendingGroups: any[];
  markedRockets: string[];
  total: number;
}>;

const card = (id: string, name: string, extra: Partial<any> = {}) => ({
  id,
  name,
  aliases: [] as string[],
  background: "",
  storyLine: "",
  relationships: [] as any[],
  tags: [] as string[],
  ...extra,
});

beforeAll(async () => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/novelforge";
  const mod = await import("./character-dedupe");
  dedupeCharacters = mod.dedupeCharacters;
});

beforeEach(() => {
  h.mockFindMany.mockReset();
  h.mockUpdate.mockReset();
  h.mockCreate.mockReset();
  h.mockUpdate.mockResolvedValue({});
  h.mockCreate.mockResolvedValue({});
});

describe("dedupeCharacters 主流程（v2.0.19/2.0.20 集成守护）", () => {
  it("detectOnly + high（韩立+韩先生）：静默自动合并并写 applied 快照", async () => {
    h.mockFindMany.mockResolvedValue([
      card("a1", "韩立", { background: "男主" }),
      card("a2", "韩先生"),
    ]);
    const r = await dedupeCharacters("p-high-detect", { detectOnly: true });
    expect(r.mergedGroups.length).toBe(1);
    expect(r.pendingGroups.length).toBe(0);
    // 高置信自动合并：主卡 + 被并卡各一次 update
    expect(h.mockUpdate).toHaveBeenCalledTimes(2);
    expect(h.mockCreate).toHaveBeenCalledTimes(1);
    expect(h.mockCreate.mock.calls[0][0].data.status).toBe("applied");
  });

  it("detectOnly + high（迭戈·美第奇+迭戈 单·同核）：v2.17 视为同一人，静默自动合并并写 applied 快照", async () => {
    h.mockFindMany.mockResolvedValue([
      card("d1", "迭戈·美第奇"),
      card("d2", "迭戈"),
    ]);
    const r = await dedupeCharacters("p-low-detect", { detectOnly: true });
    expect(r.mergedGroups.length).toBe(1);
    expect(r.pendingGroups.length).toBe(0);
    expect(h.mockUpdate).toHaveBeenCalledTimes(2); // 主卡 + 被并卡各一次 update
    expect(h.mockCreate).toHaveBeenCalledTimes(1);
    expect(h.mockCreate.mock.calls[0][0].data.status).toBe("applied");
  });

  it("非 detectOnly + high：合并并写 applied 快照（与 detectOnly 行为一致）", async () => {
    h.mockFindMany.mockResolvedValue([
      card("a1", "韩立", { background: "男主" }),
      card("a2", "韩先生"),
    ]);
    const r = await dedupeCharacters("p-high-merge");
    expect(r.mergedGroups.length).toBe(1);
    expect(h.mockUpdate).toHaveBeenCalledTimes(2);
    expect(h.mockCreate).toHaveBeenCalledTimes(1);
    expect(h.mockCreate.mock.calls[0][0].data.status).toBe("applied");
  });

  it("非 detectOnly + high（迭戈·美第奇+迭戈 单·同核）：合并并写 applied 快照", async () => {
    h.mockFindMany.mockResolvedValue([
      card("d1", "迭戈·美第奇"),
      card("d2", "迭戈"),
    ]);
    const r = await dedupeCharacters("p-low-merge");
    expect(r.mergedGroups.length).toBe(1);
    expect(r.pendingGroups.length).toBe(0);
    expect(h.mockUpdate).toHaveBeenCalledTimes(2);
    expect(h.mockCreate).toHaveBeenCalledTimes(1);
    expect(h.mockCreate.mock.calls[0][0].data.status).toBe("applied");
  });

  it("无重复角色：返回空分组、任何模式都不写库", async () => {
    h.mockFindMany.mockResolvedValue([
      card("x1", "林惊羽"),
      card("x2", "苏沐橙"),
    ]);
    const r1 = await dedupeCharacters("p-none-detect", { detectOnly: true });
    const r2 = await dedupeCharacters("p-none-merge");
    expect(r1.mergedGroups.length + r1.pendingGroups.length).toBe(0);
    expect(r2.mergedGroups.length + r2.pendingGroups.length).toBe(0);
    expect(h.mockUpdate).not.toHaveBeenCalled();
    expect(h.mockCreate).not.toHaveBeenCalled();
  });
});
