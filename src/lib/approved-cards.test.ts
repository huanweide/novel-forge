import { describe, it, expect, vi } from "vitest";

// v1.6.22 根因修复负向门禁——待审隔离逻辑收敛到 helper 单一事实来源。
//
// 钉死两条铁律，防止下一轮循环有人在「调用端」手写道 where 再次漏闸：
//   1. getApprovedCharacters 永远强制 reviewStatus:approved（调用方漏传也补上）。
//   2. getApprovedLore 永远强制 reviewStatus:approved + enabled:true（世界卡不注入禁用条目）。
// 且调用方额外传入的 where / take / orderBy / select / include 必须被安全合并，不得覆盖审批过滤。

const makeFakePrisma = (cap: { charArgs?: any; loreArgs?: any }) => ({
  characterCard: {
    findMany: vi.fn(async (args: any) => { cap.charArgs = args; return []; }),
  },
  lorebookEntry: {
    findMany: vi.fn(async (args: any) => { cap.loreArgs = args; return []; }),
  },
}) as any;

import { getApprovedCharacters, getApprovedLore } from "@/lib/approved-cards";

describe("approved-cards helper 待审隔离门禁 (v1.6.22)", () => {
  it("getApprovedCharacters 默认强制 reviewStatus:approved", async () => {
    const cap: any = {};
    await getApprovedCharacters(makeFakePrisma(cap), "p1");
    expect(cap.charArgs.where).toMatchObject({ projectId: "p1", reviewStatus: "approved" });
  });

  it("getApprovedCharacters 合并调用方 where 而不丢失 approved（防覆盖）", async () => {
    const cap: any = {};
    await getApprovedCharacters(makeFakePrisma(cap), "p1", {
      where: { role: "protagonist" },
      take: 5,
      orderBy: { updatedAt: "desc" },
    });
    // 三处约束必须同时存在：项目隔离 + 审批过滤 + 调用方筛选
    expect(cap.charArgs.where).toMatchObject({
      projectId: "p1",
      reviewStatus: "approved",
      role: "protagonist",
    });
    // 其余参数透传，不进 where
    expect(cap.charArgs.take).toBe(5);
    expect(cap.charArgs.orderBy).toEqual({ updatedAt: "desc" });
  });

  it("getApprovedLore 默认强制 reviewStatus:approved + enabled:true", async () => {
    const cap: any = {};
    await getApprovedLore(makeFakePrisma(cap), "p1");
    expect(cap.loreArgs.where).toMatchObject({
      projectId: "p1",
      reviewStatus: "approved",
      enabled: true,
    });
  });

  it("getApprovedLore includeDisabled=true 时取消 enabled 约束，但审批过滤不变", async () => {
    const cap: any = {};
    await getApprovedLore(makeFakePrisma(cap), "p1", {
      where: { category: "item" },
      includeDisabled: true,
    });
    expect(cap.loreArgs.where).toMatchObject({
      projectId: "p1",
      reviewStatus: "approved",
      category: "item",
    });
    expect(cap.loreArgs.where).not.toHaveProperty("enabled");
  });
});
