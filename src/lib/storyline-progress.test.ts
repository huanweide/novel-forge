import { describe, it, expect } from "vitest";
import { computeStorylineProgress, SEVEN_ELEMENT_FILL_KEYS, groupStorylinesByMain } from "./storyline-progress";

describe("故事线进度量化（v1.8.4 · sevenElements）", () => {
  it("空故事线：进度全 0、未收束", () => {
    const p = computeStorylineProgress({});
    expect(p.elementFilled).toBe(0);
    expect(p.elementPercent).toBe(0);
    expect(p.overallPercent).toBe(0);
    expect(p.hasEnding).toBe(false);
    expect(p.label).toContain("要素 0/6");
  });

  it("六要素全填：elementPercent=100，结局不计入", () => {
    const full = Object.fromEntries(SEVEN_ELEMENT_FILL_KEYS.map((k) => [k, `内容-${k}`]));
    const p = computeStorylineProgress({ sevenElements: full });
    expect(p.elementFilled).toBe(6);
    expect(p.elementPercent).toBe(100);
    expect(p.hasEnding).toBe(false);
    expect(p.overallPercent).toBe(100);
  });

  it("六要素全填 + 结局：仍 100，但标记已收束", () => {
    const full = Object.fromEntries(SEVEN_ELEMENT_FILL_KEYS.map((k) => [k, `内容-${k}`]));
    full.ending = "主角归于田园";
    const p = computeStorylineProgress({ sevenElements: full });
    expect(p.elementPercent).toBe(100);
    expect(p.hasEnding).toBe(true);
    expect(p.label).toContain("已收束");
  });

  it("部分填充：正确折算百分比", () => {
    const p = computeStorylineProgress({ sevenElements: { desire: "想复仇", obstacle: "强敌" } });
    // 2/6 ≈ 33.33 → 33
    expect(p.elementFilled).toBe(2);
    expect(p.elementPercent).toBe(33);
  });

  it("sevenElements 缺失 / 非对象 / 旧七列字段 安全降级", () => {
    expect(computeStorylineProgress({}).elementFilled).toBe(0);
    expect(computeStorylineProgress({ sevenElements: "bad" }).elementFilled).toBe(0);
    expect(computeStorylineProgress({ sevenElements: null }).elementFilled).toBe(0);
    // 旧独立列字段不再计入（数据模型已迁移）
    expect(computeStorylineProgress({ desire: "旧列" }).elementFilled).toBe(0);
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
