import { describe, it, expect } from "vitest";
import { computeStorylineProgress, SEVEN_ELEMENT_KEYS } from "./storyline-progress";

describe("故事线进度量化", () => {
  it("空故事线：进度全 0", () => {
    const p = computeStorylineProgress({});
    expect(p.elementFilled).toBe(0);
    expect(p.elementPercent).toBe(0);
    expect(p.chapterCount).toBe(0);
    expect(p.chapterPercent).toBe(0);
    expect(p.overallPercent).toBe(0);
  });

  it("七要素全填 + 无章节：elementPercent=100，overall=60", () => {
    const full = Object.fromEntries(SEVEN_ELEMENT_KEYS.map((k) => [k, `内容-${k}`]));
    const p = computeStorylineProgress(full);
    expect(p.elementFilled).toBe(7);
    expect(p.elementPercent).toBe(100);
    expect(p.chapterCount).toBe(0);
    expect(p.overallPercent).toBe(60);
  });

  it("章节进展：12 章封顶 100%，超出不越界", () => {
    const p = computeStorylineProgress({ chapterBindings: new Array(20).fill({}) });
    expect(p.chapterCount).toBe(20);
    expect(p.chapterPercent).toBe(100);
  });

  it("综合权重：七要素 60% + 章节 40%", () => {
    const p = computeStorylineProgress({
      desire: "想复仇",
      obstacle: "强敌环伺",
      chapterBindings: new Array(6).fill({}),
    });
    // element 2/7 ≈ 28.57→29；chapter 6/12=50；overall = 29*0.6+50*0.4 = 17.4+20 = 37
    expect(p.elementPercent).toBe(29);
    expect(p.chapterPercent).toBe(50);
    expect(p.overallPercent).toBe(37);
    expect(p.label).toContain("七要素 2/7");
  });

  it("chapterBindings 缺失/非数组不报错", () => {
    expect(() => computeStorylineProgress({ chapterBindings: "bad" })).not.toThrow();
    const p = computeStorylineProgress({ chapterBindings: "bad" });
    expect(p.chapterCount).toBe(0);
  });
});
