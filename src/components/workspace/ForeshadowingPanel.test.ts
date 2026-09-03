import { describe, it, expect } from "vitest";
import { matchForeshadowItem } from "./ForeshadowingPanel";

/** 构造一条最小可用的伏笔条目（字段与 ForeshadowItem 对齐） */
function item(over: Partial<Parameters<typeof matchForeshadowItem>[0]> = {}) {
  return {
    id: "f1",
    description: "主角在旧仓库捡到的铜钥匙",
    source: "ai_inference",
    priority: "high",
    status: "pending",
    fulfillmentRatio: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  } as Parameters<typeof matchForeshadowItem>[0];
}

describe("matchForeshadowItem（v3.1.74 伏笔搜索 · FS-SEARCH）", () => {
  it("空关键词一律命中（不过滤）", () => {
    expect(matchForeshadowItem(item(), "")).toBe(true);
    expect(matchForeshadowItem(item(), "   ")).toBe(true);
  });

  it("命中描述（中文子串、大小写不敏感）", () => {
    expect(matchForeshadowItem(item(), "铜钥匙")).toBe(true);
    expect(matchForeshadowItem(item(), "旧仓库")).toBe(true);
    expect(matchForeshadowItem(item(), "不存在的内容")).toBe(false);
  });

  it("命中后续发展思路 developmentHint", () => {
    expect(matchForeshadowItem(item({ developmentHint: "后期揭示是母亲遗物" }), "母亲遗物")).toBe(true);
  });

  it("命中来源中文标签（ai_inference → AI推断）", () => {
    expect(matchForeshadowItem(item({ source: "ai_inference" }), "推断")).toBe(true);
    expect(matchForeshadowItem(item({ source: "user_intent" }), "用户")).toBe(true);
    // 英文原始值也要能搜（老数据可能存的是英文 key）
    expect(matchForeshadowItem(item({ source: "outline_summary" }), "outline")).toBe(true);
  });

  it("命中优先级中文（high → 高）", () => {
    expect(matchForeshadowItem(item({ priority: "high" }), "高")).toBe(true);
    expect(matchForeshadowItem(item({ priority: "low" }), "低")).toBe(true);
    expect(matchForeshadowItem(item({ priority: "high" }), "低")).toBe(false);
  });

  it("命中章节号（第 N 章 写法）", () => {
    expect(matchForeshadowItem(item({ chapterNumber: 12 }), "第12章")).toBe(true);
    expect(matchForeshadowItem(item({ expiryChapter: 30 }), "第30章")).toBe(true);
    expect(matchForeshadowItem(item({ chapterNumber: 12 }), "第13章")).toBe(false);
  });

  it("字段缺失不炸（undefined / null 安全）", () => {
    const bare = {
      id: "x",
      description: undefined,
      source: undefined,
      priority: undefined,
      status: "pending",
      fulfillmentRatio: 0,
      createdAt: "",
    } as unknown as Parameters<typeof matchForeshadowItem>[0];
    expect(() => matchForeshadowItem(bare, "任意词")).not.toThrow();
    expect(matchForeshadowItem(bare, "任意词")).toBe(false);
  });
});
