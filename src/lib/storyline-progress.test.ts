import { describe, it, expect } from "vitest";
import { computeStorylineProgress, SEVEN_ELEMENT_KEYS, groupStorylinesByMain } from "./storyline-progress";

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

describe("N2 groupStorylinesByMain（多主线遍历）", () => {
  const data = [
    { id: "old", type: "main", status: "completed", title: "旧主线" },
    { id: "new", type: "main", status: "active", title: "新主线" },
    { id: "s1", type: "side", status: "active", title: "挂新主线", parentId: "new" },
    { id: "s2", type: "side", status: "active", title: "无父悬空" },
    { id: "s3", type: "side", status: "active", title: "挂旧主线", parentId: "old" },
  ];

  it("所有主线都被返回，新活跃主线不被吞", () => {
    const { mains } = groupStorylinesByMain(data);
    expect(mains.map((m: any) => m.id).sort()).toEqual(["new", "old"]);
  });

  it("回退主线优先活跃主线（而非数组第一条旧主线）", () => {
    const { fallbackMain, resolveParent } = groupStorylinesByMain(data);
    expect(fallbackMain?.id).toBe("new");
    // 悬空支线应回退到活跃主线，而非误归属旧 completed 主线
    expect(resolveParent({ id: "s2", type: "side" })?.id).toBe("new");
  });

  it("按各自主线正确聚合子线", () => {
    const { childrenOf } = groupStorylinesByMain(data);
    expect(childrenOf("new").map((s: any) => s.id).sort()).toEqual(["s1", "s2"]);
    expect(childrenOf("old").map((s: any) => s.id)).toEqual(["s3"]);
  });

  it("空/异常输入安全", () => {
    expect(groupStorylinesByMain(undefined as any).mains).toEqual([]);
    expect(groupStorylinesByMain([]).fallbackMain).toBeNull();
  });
});
