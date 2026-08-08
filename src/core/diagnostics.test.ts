import { describe, it, expect, vi, beforeEach } from "vitest";

// v1.6.25 自我检测 UI 核心逻辑单测。
// runProjectDiagnostics 是纯逻辑（仅 IO：prisma + getSettings），
// 用可变桩覆盖各 count/findMany，把 7 项健康检查逐项钉死，并验证不存在与聚合。

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn(), count: vi.fn() },
  storyNode: { count: vi.fn() },
  characterCard: { count: vi.fn(), findMany: vi.fn() },
  lorebookEntry: { count: vi.fn() },
  storyline: { count: vi.fn() },
}));

const settingsMock = vi.hoisted(() => ({ getSettings: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/llm", () => ({ getSettings: settingsMock.getSettings }));

import { runProjectDiagnostics } from "@/core/diagnostics";

const baseProject = { id: "p1", name: "测试书", globalPrompt: "已编译缓存内容约一百字" };

function setupCounts(opts: {
  nodes?: number; chars?: number; lore?: number; storylines?: number;
  softDeleted?: number; pendingChars?: number; pendingLore?: number;
  dupNames?: string[];
} = {}) {
  const {
    nodes = 0, chars = 0, lore = 0, storylines = 0,
    softDeleted = 0, pendingChars = 0, pendingLore = 0, dupNames = [],
  } = opts;
  prismaMock.project.findUnique.mockResolvedValue(baseProject);
  prismaMock.project.count.mockResolvedValue(5);
  // Promise.all 内：nodes / chars / lore / storylines 并发各取一次
  prismaMock.storyNode.count.mockResolvedValueOnce(nodes).mockResolvedValueOnce(softDeleted);
  prismaMock.characterCard.count.mockResolvedValueOnce(chars).mockResolvedValueOnce(pendingChars);
  prismaMock.lorebookEntry.count.mockResolvedValueOnce(lore).mockResolvedValueOnce(pendingLore);
  prismaMock.storyline.count.mockResolvedValue(storylines);
  prismaMock.characterCard.findMany.mockResolvedValue(dupNames.map((n) => ({ name: n })));
  settingsMock.getSettings.mockResolvedValue({ baseUrl: "http://x", apiKey: "k", model: "m" });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("runProjectDiagnostics（v1.6.25 项目自检）", () => {
  it("项目不存在 → 总体 error，仅一条 projectExists", async () => {
    prismaMock.project.findUnique.mockResolvedValue(null);
    const r = await runProjectDiagnostics("pX");
    expect(r.overall).toBe("error");
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0].key).toBe("projectExists");
  });

  it("健康项目（全 ok） → 总体 ok，7 项检查齐全", async () => {
    setupCounts({ nodes: 3, chars: 2, lore: 1, storylines: 1 });
    const r = await runProjectDiagnostics("p1");
    expect(r.overall).toBe("ok");
    expect(r.checks).toHaveLength(7);
    expect(r.projectName).toBe("测试书");
    expect(r.checks.map((c) => c.status).every((s) => s === "ok")).toBe(true);
  });

  it("LLM 未配置 → llmConfigured error，总体 error", async () => {
    setupCounts();
    settingsMock.getSettings.mockResolvedValue({ baseUrl: "", apiKey: "", model: "" });
    const r = await runProjectDiagnostics("p1");
    const llm = r.checks.find((c) => c.key === "llmConfigured");
    expect(llm?.status).toBe("error");
    expect(r.overall).toBe("error");
  });

  it("有待审卡 → pendingCards warn，总体 warn", async () => {
    setupCounts({ pendingChars: 1, pendingLore: 0 });
    const r = await runProjectDiagnostics("p1");
    const pc = r.checks.find((c) => c.key === "pendingCards");
    expect(pc?.status).toBe("warn");
    expect(r.overall).toBe("warn");
  });

  it("回收站有残留 → softDeleted warn，总体 warn", async () => {
    setupCounts({ softDeleted: 2 });
    const r = await runProjectDiagnostics("p1");
    const sd = r.checks.find((c) => c.key === "softDeleted");
    expect(sd?.status).toBe("warn");
    expect(r.overall).toBe("warn");
  });

  it("生成缓存为空 → globalPrompt warn，总体 warn", async () => {
    setupCounts();
    prismaMock.project.findUnique.mockResolvedValue({ id: "p1", name: "x", globalPrompt: "" });
    const r = await runProjectDiagnostics("p1");
    const gp = r.checks.find((c) => c.key === "globalPrompt");
    expect(gp?.status).toBe("warn");
    expect(r.overall).toBe("warn");
  });

  it("检测重名角色 → duplicateNames warn，总体 warn", async () => {
    setupCounts({ dupNames: ["李雷", "李雷"] });
    const r = await runProjectDiagnostics("p1");
    const dn = r.checks.find((c) => c.key === "duplicateNames");
    expect(dn?.status).toBe("warn");
    expect(r.overall).toBe("warn");
  });

  it("聚合：单个 error 主导总体 error（error > warn > ok）", async () => {
    setupCounts();
    settingsMock.getSettings.mockResolvedValue({ baseUrl: "", apiKey: "", model: "" });
    const r = await runProjectDiagnostics("p1");
    expect(r.overall).toBe("error");
  });
});
