import { describe, it, expect } from "vitest";
import {
  classifyEvents,
  tieredMemoryToImportances,
  formatTieredMemory,
  type TieredEvent,
} from "./memory-classifier";

/** 构造一条 TieredEvent（精确类型，避免字面量被推断成 string 触发 tsc 错误） */
const ev = (
  content: string,
  source: TieredEvent["source"],
  importance: TieredEvent["importance"],
): TieredEvent => ({ content, source, importance });

describe("classifyEvents — S 级（核心不可遗忘）", () => {
  it("全空输入 → 三 tier 均空", () => {
    const m = classifyEvents([], [], [], [], 10);
    expect(m.sTier).toEqual([]);
    expect(m.aTier).toEqual([]);
    expect(m.bTier).toEqual([]);
  });

  it("未回收伏笔 → S 级 foreshadowing", () => {
    const m = classifyEvents(
      [],
      [],
      [{ description: "宝藏", status: "pending", chapterNumber: 3 }],
      [],
      10,
    );
    expect(m.sTier).toHaveLength(1);
    expect(m.sTier[0].source).toBe("foreshadowing");
    expect(m.sTier[0].content).toContain("宝藏");
  });

  it("已回收伏笔(status=resolved) → 不进 S", () => {
    const m = classifyEvents(
      [],
      [],
      [{ description: "宝藏", status: "resolved", chapterNumber: 3 }],
      [],
      10,
    );
    expect(m.sTier).toHaveLength(0);
  });

  it("即将到期伏笔(到期差<=3) → critical", () => {
    const m = classifyEvents(
      [],
      [],
      [{ description: "决战", status: "pending", chapterNumber: 3, expiryChapter: 12 }],
      [],
      10,
    );
    expect(m.sTier[0].importance).toBe("critical");
  });

  it("远期伏笔(到期差>3) → high", () => {
    const m = classifyEvents(
      [],
      [],
      [{ description: "远伏", status: "pending", chapterNumber: 3, expiryChapter: 20 }],
      [],
      10,
    );
    expect(m.sTier[0].importance).toBe("high");
  });

  it("major beat → S 级 story_beat high", () => {
    const m = classifyEvents(
      [],
      [{ impact: "major", chapterNumber: 7, description: "转折" }],
      [],
      [],
      10,
    );
    expect(m.sTier).toHaveLength(1);
    expect(m.sTier[0].source).toBe("story_beat");
    expect(m.sTier[0].importance).toBe("high");
  });

  it("核心角色(protagonist)且弧光>5字 → S 级 character_change", () => {
    const m = classifyEvents(
      [],
      [],
      [],
      [{ role: "protagonist", name: "主角", arcProgress: "漫长的成长历程", currentStatus: "觉醒" }],
      10,
    );
    expect(m.sTier).toHaveLength(1);
    expect(m.sTier[0].source).toBe("character_change");
    expect(m.sTier[0].content).toContain("主角");
  });

  it("非核心角色 → 不进 S", () => {
    const m = classifyEvents(
      [],
      [],
      [],
      [{ role: "supporting", name: "配角", arcProgress: "漫长的成长历程", currentStatus: "x" }],
      10,
    );
    expect(m.sTier).toHaveLength(0);
  });

  it("核心角色但弧光<=5字 → 不进 S", () => {
    const m = classifyEvents(
      [],
      [],
      [],
      [{ role: "protagonist", name: "主角", arcProgress: "短", currentStatus: "x" }],
      10,
    );
    expect(m.sTier).toHaveLength(0);
  });

  it("S 级排序：critical 排在 high 之前", () => {
    const m = classifyEvents(
      [],
      [{ impact: "major", chapterNumber: 7, description: "转折" }],
      [
        { description: "远伏", status: "pending", chapterNumber: 3, expiryChapter: 20 },
        { description: "近伏", status: "pending", chapterNumber: 3, expiryChapter: 12 },
      ],
      [],
      10,
    );
    expect(m.sTier[0].importance).toBe("critical");
    expect(m.sTier.slice(1).every((e) => e.importance === "high")).toBe(true);
  });

  it("S 级内容前60字相同 → 去重只留1条", () => {
    const m = classifyEvents(
      [],
      [],
      [
        { description: "重复伏笔", status: "pending", chapterNumber: 3 },
        { description: "重复伏笔", status: "pending", chapterNumber: 3 },
      ],
      [],
      10,
    );
    expect(m.sTier).toHaveLength(1);
  });
});

describe("classifyEvents — A 级（近期关键事件）", () => {
  it("最近5章 summary 的 keyEvents → A 级（带章节号）", () => {
    const m = classifyEvents(
      [{ chapterTitle: "第10章 近章", summary: "s", keyEvents: ["事件甲", "事件乙"] }],
      [],
      [],
      [],
      10,
    );
    const a = m.aTier.filter((e) => e.source === "chapter_summary");
    expect(a).toHaveLength(2);
    expect(a.every((e) => e.content.includes("第10章"))).toBe(true);
  });

  it("最近5章 summary 同时有 aTier 与 keyEvents → 两者都进 A（非互斥）", () => {
    const m = classifyEvents(
      [
        {
          chapterTitle: "第10章 近章",
          summary: "s",
          eventImportances: { aTier: ["推导出的事件"] },
          keyEvents: ["原始事件"],
        },
      ],
      [],
      [],
      [],
      10,
    );
    const a = m.aTier.filter((e) => e.source === "chapter_summary");
    expect(a.some((e) => e.content.includes("推导出的事件"))).toBe(true);
    expect(a.some((e) => e.content.includes("原始事件"))).toBe(true);
  });

  it("minor beat 在近5章 → A 级", () => {
    const m = classifyEvents(
      [],
      [{ impact: "minor", chapterNumber: 8, description: "小转折" }],
      [],
      [],
      10,
    );
    expect(m.aTier.some((e) => e.source === "story_beat" && e.content.includes("小转折"))).toBe(true);
  });

  it("minor beat 在5章外 → 不进 A", () => {
    const m = classifyEvents(
      [],
      [{ impact: "minor", chapterNumber: 3, description: "远古小转折" }],
      [],
      [],
      10,
    );
    expect(m.aTier).toHaveLength(0);
  });
});

describe("classifyEvents — B 级（归档）与中间章修复", () => {
  it("早于 current-6 的 summary → B 级 slice(0,80)", () => {
    const longSummary =
      "这是很久以前的章节摘要内容，超过了二十个字用来测试截断逻辑是否正常工作";
    const m = classifyEvents(
      [{ chapterTitle: "第2章 老章", summary: longSummary, keyEvents: [] }],
      [],
      [],
      [],
      10,
    );
    expect(m.bTier).toHaveLength(1);
    expect(m.bTier[0].content).toContain("第2章");
    const body = m.bTier[0].content.replace("第2章 — ", "").replace("…", "");
    expect(body.length).toBeLessThanOrEqual(80);
  });

  it("中间章(current-5) summary → 修复后进 B 级（不再被 A/B 夹缝静默丢弃）", () => {
    const m = classifyEvents(
      [{ chapterTitle: "第5章 中章", summary: "中段章节摘要", keyEvents: [] }],
      [],
      [],
      [],
      10,
    );
    expect(m.aTier).toHaveLength(0);
    expect(m.bTier).toHaveLength(1);
    expect(m.bTier[0].content).toContain("第5章");
  });
});

describe("tieredMemoryToImportances", () => {
  it("critical → score 50", () => {
    const r = tieredMemoryToImportances({
      sTier: [ev("x", "foreshadowing", "critical")],
      aTier: [],
      bTier: [],
    });
    expect(r.sTier[0].score).toBe(50);
  });

  it("high → score 30", () => {
    const r = tieredMemoryToImportances({
      sTier: [ev("x", "story_beat", "high")],
      aTier: [],
      bTier: [],
    });
    expect(r.sTier[0].score).toBe(30);
  });

  it("medium(B default) → score 10", () => {
    const r = tieredMemoryToImportances({
      sTier: [],
      aTier: [],
      bTier: [ev("y", "chapter_summary", "medium")],
    });
    expect(r.bTier[0].score).toBe(10);
  });

  it("source 映射：foreshadowing → plot_twist 且 isForeshadowRelated", () => {
    const r = tieredMemoryToImportances({
      sTier: [ev("x", "foreshadowing", "high")],
      aTier: [],
      bTier: [],
    });
    expect(r.sTier[0].category).toBe("plot_twist");
    expect(r.sTier[0].isForeshadowRelated).toBe(true);
  });

  it("character_change → breakthrough", () => {
    const r = tieredMemoryToImportances({
      sTier: [ev("x", "character_change", "high")],
      aTier: [],
      bTier: [],
    });
    expect(r.sTier[0].category).toBe("breakthrough");
    expect(r.sTier[0].isBreakthrough).toBe(true);
  });

  it("cTier 恒为空数组", () => {
    const r = tieredMemoryToImportances({ sTier: [], aTier: [], bTier: [] });
    expect(r.cTier).toEqual([]);
  });

  it("空 memory → 各 tier 空、cTier 空", () => {
    const r = tieredMemoryToImportances({ sTier: [], aTier: [], bTier: [] });
    expect(r.sTier).toEqual([]);
    expect(r.aTier).toEqual([]);
    expect(r.bTier).toEqual([]);
  });
});

describe("formatTieredMemory", () => {
  const count = (t: string) => t.length; // 每字符 1 token，确定性

  it("S 级全部注入（含标题行）", () => {
    const txt = formatTieredMemory(
      {
        sTier: [
          ev("核心伏笔A", "foreshadowing", "high"),
          ev("核心伏笔B", "foreshadowing", "high"),
        ],
        aTier: [],
        bTier: [],
      },
      10000,
      count,
    );
    expect(txt).toContain("S级记忆");
    expect(txt).toContain("核心伏笔A");
    expect(txt).toContain("核心伏笔B");
  });

  it("空 memory → 返回空串", () => {
    const txt = formatTieredMemory({ sTier: [], aTier: [], bTier: [] }, 100, count);
    expect(txt).toBe("");
  });

  it("A 级按 token 预算(40%)截断：超出后段不出现", () => {
    const aTier = Array.from({ length: 10 }, (_, i) =>
      ev(`近期事件${i}`, "chapter_summary", "medium"),
    );
    const txt = formatTieredMemory({ sTier: [], aTier, bTier: [] }, 100, count);
    // aMax = floor(100*0.4)=40；每条 line 形如 "- 近期事件N" = 7 字符；40/7 → 5 条截断
    expect(txt).toContain("近期事件0");
    expect(txt).toContain("近期事件4");
    expect(txt).not.toContain("近期事件5");
  });

  it("B 级按 token 预算(20%)截断", () => {
    const bTier = Array.from({ length: 10 }, (_, i) =>
      ev(`归档事件${i}`, "chapter_summary", "medium"),
    );
    const txt = formatTieredMemory({ sTier: [], aTier: [], bTier }, 100, count);
    // bMax = floor(100*0.2)=20；每条 7 字符；20/7 → 2 条截断
    expect(txt).toContain("归档事件0");
    expect(txt).toContain("归档事件1");
    expect(txt).not.toContain("归档事件2");
  });
});
