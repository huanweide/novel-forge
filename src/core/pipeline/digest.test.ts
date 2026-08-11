import { describe, it, expect } from "vitest";
import { formatDigest } from "./digest";

describe("formatDigest", () => {
  it("两字段都为空时返回空串（调用方据此跳过注入）", () => {
    expect(formatDigest({ timelineDigest: "", storylineDigest: "" })).toBe("");
    expect(formatDigest({ timelineDigest: "   ", storylineDigest: null })).toBe("");
    expect(formatDigest({})).toBe("");
  });

  it("仅有时间线摘要时只产出时间线块", () => {
    const out = formatDigest({ timelineDigest: "第1章：启航。" });
    expect(out).toContain("时间线摘要大纲");
    expect(out).toContain("第1章：启航。");
    expect(out).not.toContain("故事线摘要大纲");
  });

  it("仅有故事线摘要时只产出故事线块", () => {
    const out = formatDigest({ storylineDigest: "【主线：龙陨】里程碑·开端" });
    expect(out).toContain("故事线摘要大纲");
    expect(out).toContain("【主线：龙陨】");
    expect(out).not.toContain("时间线摘要大纲");
  });

  it("两者都有时按时间线 + 故事线顺序拼接", () => {
    const out = formatDigest({
      timelineDigest: "第1章：启航。",
      storylineDigest: "【主线：龙陨】里程碑·开端",
    });
    const ti = out.indexOf("时间线摘要大纲");
    const sl = out.indexOf("故事线摘要大纲");
    expect(ti).toBeGreaterThanOrEqual(0);
    expect(sl).toBeGreaterThanOrEqual(0);
    expect(ti).toBeLessThan(sl); // 时间线在前，故事线在后
  });
});
