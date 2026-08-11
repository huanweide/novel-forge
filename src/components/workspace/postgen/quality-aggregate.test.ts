import { describe, it, expect } from "vitest";
import { aggregateQuality } from "./quality-aggregate";
import type { ForbiddenScanResult, LogicScanResult } from "./types";

const fb = (passed: boolean, qualityScore = 80): ForbiddenScanResult => ({
  passed, qualityScore, fuzzyDensity: 0, bySeverity: {}, byCategory: {}, matches: [], totalMatches: 0, summary: "",
});
const lg = (passed: boolean): LogicScanResult => ({ passed, issues: [], summary: "" });
const rv = (passed: boolean) => ({ passed, issues: [] });

describe("aggregateQuality (P0-2)", () => {
  it("三项全通过 → 整体 pass，取废词分为总分", () => {
    const a = aggregateQuality(fb(true, 92), lg(true), rv(true));
    expect(a.overall).toBe("pass");
    expect(a.score).toBe(92);
    expect(a.gates.every((g) => g.status === "pass")).toBe(true);
  });

  it("任一项 fail → 整体 fail（逻辑失败即拖垮）", () => {
    const a = aggregateQuality(fb(true, 99), lg(false), rv(true));
    expect(a.overall).toBe("fail");
    expect(a.gates.find((g) => g.key === "logic")!.status).toBe("fail");
  });

  it("审校失败也整体 fail", () => {
    const a = aggregateQuality(fb(true, 99), lg(true), rv(false));
    expect(a.overall).toBe("fail");
  });

  it("废词失败给低分（压到 59 以下），不被高分掩盖", () => {
    const a = aggregateQuality(fb(false, 95), lg(true), rv(true));
    expect(a.overall).toBe("fail");
    expect(a.score!).toBeLessThan(60);
  });

  it("均无结果 → pending，score 为 null", () => {
    const a = aggregateQuality(null, null, null);
    expect(a.overall).toBe("pending");
    expect(a.score).toBeNull();
  });

  it("部分未跑（废词有、逻辑未跑、审校通过）→ 不判 fail，pending", () => {
    const a = aggregateQuality(fb(true, 88), null, rv(true));
    expect(a.overall).toBe("pending");
    expect(a.gates.find((g) => g.key === "logic")!.status).toBe("pending");
  });
});
