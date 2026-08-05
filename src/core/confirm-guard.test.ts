import { describe, it, expect, vi } from "vitest";

// 离线单测 smart-deliver 护栏（evaluateConfirmEligibility 为纯函数，不触库）。
// 始终传入 qualityScore（非 null）使其走「采信分数」分支，避免回退 analyzeQuality，
// 因此下方对 quality-analyzer 仅需提供模块桩，无需真实实现。
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/core/babylore/loop", () => ({ safeFillAfterWriting: vi.fn() }));
vi.mock("@/lib/quality-analyzer", () => ({ analyzeQuality: vi.fn() }));

import { evaluateConfirmEligibility, MIN_AUTO_CONFIRM_LENGTH } from "@/core/confirm-guard";

describe("evaluateConfirmEligibility（smart-deliver 自动放行护栏）", () => {
  it("空正文直接拦截", () => {
    const r = evaluateConfirmEligibility({ content: "", qualityScore: 95 });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/空|短/);
  });

  it("正文过短（<50字）直接拦截", () => {
    const r = evaluateConfirmEligibility({ content: "太短了", qualityScore: 95 });
    expect(r.eligible).toBe(false);
  });

  it("达到最小自动放行长度但仍低于质量阈值 → 拦截", () => {
    // 长度 >= MIN_AUTO_CONFIRM_LENGTH 但分数低于阈值
    const r = evaluateConfirmEligibility({ content: "好".repeat(MIN_AUTO_CONFIRM_LENGTH + 10), qualityScore: 40 });
    expect(r.eligible).toBe(false);
    expect(r.score).toBe(40);
  });

  it("合格长正文 + 高分 → 放行", () => {
    const r = evaluateConfirmEligibility({ content: "好".repeat(MIN_AUTO_CONFIRM_LENGTH + 50), qualityScore: 90 });
    expect(r.eligible).toBe(true);
    expect(r.score).toBe(90);
    expect(["A", "B", "C", "D"]).toContain(r.grade);
  });

  it("机械重复（句子高度雷同）拦截", () => {
    // 同一句凑字数：>=150字 且 >=5 句且唯一率 <60%（需先越过「过短」门槛才能走到该分支）
    const rep = "他在山里修炼剑法。".repeat(20);
    expect(rep.length).toBeGreaterThanOrEqual(150);
    const r = evaluateConfirmEligibility({ content: rep, qualityScore: 95 });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/机械重复/);
  });
});
