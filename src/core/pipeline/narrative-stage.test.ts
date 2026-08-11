import { describe, it, expect } from "vitest";
import { computeNarrativeStage, formatStage } from "./narrative-stage";

describe("computeNarrativeStage", () => {
  it("开篇：进度 ≤ 8%", () => {
    expect(computeNarrativeStage(0, 100).key).toBe("opening"); // 1%
    expect(computeNarrativeStage(7, 100).key).toBe("opening"); // 8%
    expect(computeNarrativeStage(0, 10).key).toBe("early"); // 10% → 早期发展
  });

  it("早期发展：9% – 30%", () => {
    expect(computeNarrativeStage(8, 100).key).toBe("early"); // 9%
    expect(computeNarrativeStage(29, 100).key).toBe("early"); // 30%
  });

  it("中期发展：31% – 55%", () => {
    expect(computeNarrativeStage(30, 100).key).toBe("mid"); // 31%
    expect(computeNarrativeStage(54, 100).key).toBe("mid"); // 55%
  });

  it("后期发展：56% – 78%", () => {
    expect(computeNarrativeStage(55, 100).key).toBe("late"); // 56%
    expect(computeNarrativeStage(77, 100).key).toBe("late"); // 78%
  });

  it("高潮：79% – 92%", () => {
    expect(computeNarrativeStage(78, 100).key).toBe("climax"); // 79%
    expect(computeNarrativeStage(91, 100).key).toBe("climax"); // 92%
  });

  it("收尾：93% – 100%", () => {
    expect(computeNarrativeStage(92, 100).key).toBe("ending"); // 93%
    expect(computeNarrativeStage(99, 100).key).toBe("ending"); // 100%
  });

  it("边界防御：总章数 ≤ 0 时按 1 处理，落入收尾（100%）", () => {
    expect(computeNarrativeStage(0, 0).key).toBe("ending");
    expect(computeNarrativeStage(0, -5).key).toBe("ending");
  });

  it("边界防御：chapterIndex 越界被夹紧到 [0, total-1]", () => {
    expect(computeNarrativeStage(200, 100).key).toBe("ending"); // 夹紧到 99 → 100%
    expect(computeNarrativeStage(-10, 100).key).toBe("opening"); // 夹紧到 0 → 1%
  });

  it("返回 percent 与 label 合理", () => {
    const s = computeNarrativeStage(49, 100); // 50%
    expect(s.label).toBe("中期发展");
    expect(s.percent).toBe(50);
    expect(s.directive.length).toBeGreaterThan(10);
  });
});

describe("formatStage", () => {
  it("空 stage 返回空串（调用方据此跳过注入）", () => {
    expect(formatStage(null)).toBe("");
    expect(formatStage(undefined)).toBe("");
  });

  it("有效 stage 返回含阶段名的指令块", () => {
    const s = computeNarrativeStage(0, 100);
    const block = formatStage(s);
    expect(block).toContain("【全书进度阶段：开篇");
    expect(block).toContain("约 1% 完成");
    expect(block).toContain("严禁");
  });
});
