import { describe, it, expect, vi, beforeEach } from "vitest";

// v1.6.20 F1 负向回归：待审隔离（reviewStatus:"approved"）必须生效——
// pending 角色卡/世界书不得进入 globalPrompt（否则会被 orchestrator 注入每一次生成）。
// 行为断言 + 查询断言双保险，把「阻断优于补救」钉进 CI，防止下一轮循环再次撕开口子。

const approvedCard = {
  id: "ca", name: "阿approved英雄", role: "protagonist", aliases: [], currentStatus: "存活",
  age: "18", gender: "男", appearance: {}, personality: {}, background: "背景内容足够长超过十字节",
  abilities: [], hiddenMotives: [], relationships: [],
};
const pendingCard = {
  id: "cp", name: "阿pending待审反派", role: "antagonist", aliases: [], currentStatus: "存活",
  age: "30", gender: "男", appearance: {}, personality: {}, background: "背景内容足够长超过十字节",
  abilities: [], hiddenMotives: [], relationships: [],
};

const updateCalls: any[] = [];
const revisionCalls: any[] = [];
let lastCharWhere: any = null;
let lastLoreWhere: any = null;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: vi.fn(async () => ({
        id: "p1", name: "测试书", genre: ["玄幻"], synopsis: "总纲", toneKeywords: ["热血"], authorNote: "", llmConfig: null,
      })),
      update: vi.fn(async (args: any) => { updateCalls.push(args); return args.data; }),
    },
    characterCard: {
      // 模拟数据库按 where.reviewStatus 过滤：只有请求 approved 时才返回 approved 卡，
      // 从而验证 syncGlobalPrompt 是否真的传了 reviewStatus:approved（回退过滤即红）。
      findMany: vi.fn(async (args: any) => {
        lastCharWhere = args.where;
        if (args.where?.reviewStatus === "approved") return [approvedCard];
        return [approvedCard, pendingCard];
      }),
    },
    lorebookEntry: {
      findMany: vi.fn(async (args: any) => { lastLoreWhere = args.where; return []; }),
    },
    styleCard: {
      findFirst: vi.fn(async () => null),
    },
    // #316/#317：globalPrompt 版本快照写入所需的三个方法
    globalPromptRevision: {
      aggregate: vi.fn(async () => ({ _max: { version: null } })), // 首版 max=null → nextVersion=1
      create: vi.fn(async (args: any) => { revisionCalls.push(args); return args.data; }),
    },
  },
}));

import { syncGlobalPrompt } from "@/core/sync-global-prompt";

describe("syncGlobalPrompt 待审隔离负向测试 (v1.6.20 F1)", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    revisionCalls.length = 0;
    lastCharWhere = null;
    lastLoreWhere = null;
  });

  it("pending 角色卡不进入 globalPrompt，approved 卡进入", async () => {
    const prompt = await syncGlobalPrompt("p1");
    expect(prompt).toBeTruthy();

    // 行为断言：approved 名字在，pending 名字不在
    expect(prompt).toContain("阿approved英雄");
    expect(prompt).not.toContain("阿pending待审反派");

    // 查询断言：取用端必须带 reviewStatus:approved（钉死回归，漏写即红）
    expect(lastCharWhere).toMatchObject({ reviewStatus: "approved" });
    expect(lastLoreWhere).toMatchObject({ reviewStatus: "approved" });

    // 落库断言：写入的 globalPrompt 同样不含 pending
    const written = updateCalls.find((c) => c.data && typeof c.data.globalPrompt === "string");
    expect(written?.data?.globalPrompt).not.toContain("阿pending待审反派");
  });

  it("#316/#317 sync 后落 globalPrompt 版本快照，且回写 currentPromptVersion", async () => {
    const prompt = await syncGlobalPrompt("p1");
    expect(prompt).toBeTruthy();
    const p = prompt!; // 非空断言：上面 toBeTruthy 已确认

    // recordGlobalPromptRevision 在 syncGlobalPrompt 内是 fire-and-forget（.catch 兜底不阻塞主流程），
    // 等一个 macrotask 让其落库完成，避免断言竞态。
    await new Promise((r) => setTimeout(r, 10));

    // 版本快照应被写入一条：version=1（首版 max 为 null）、source=sync、content=本次 prompt
    expect(revisionCalls).toHaveLength(1);
    const rev = revisionCalls[0]?.data ?? revisionCalls[0];
    expect(rev.version).toBe(1);
    expect(rev.source).toBe("sync");
    expect(rev.content).toBe(p);
    expect(typeof rev.hash).toBe("string");
    expect(rev.wordCount).toBe(p.length);

    // Project.currentPromptVersion 应回写为 1
    const versionWrite = updateCalls.find((c) => c.data && typeof c.data.currentPromptVersion === "number");
    expect(versionWrite?.data?.currentPromptVersion).toBe(1);
  });
});
