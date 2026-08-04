import { describe, it, expect } from "vitest";
import { isCompleteEntityName, extractNewEntities, type EntityDetectionResult } from "./entity-detector";

describe("isCompleteEntityName —— Q1 碎片过滤", () => {
  it("句子碎片被过滤", () => {
    expect(isCompleteEntityName("核桃壳在他指")).toBe(false); // 含「在」
    expect(isCompleteEntityName("他六岁那年练功")).toBe(false); // 含「他/那」
    expect(isCompleteEntityName("右手拇指")).toBe(false); // 身体部位片段
    expect(isCompleteEntityName("他在海边")).toBe(false); // 含功能词「在」
    expect(isCompleteEntityName("他在")).toBe(false); // 含功能词
    expect(isCompleteEntityName("青云山。")).toBe(false); // 含标点
    expect(isCompleteEntityName("这是一把剑的情况描述很长很长很长")).toBe(false); // 超长
  });

  it("干净专有名词被保留", () => {
    expect(isCompleteEntityName("青云剑")).toBe(true);
    expect(isCompleteEntityName("培元丹")).toBe(true);
    expect(isCompleteEntityName("苍云山脉")).toBe(true);
    expect(isCompleteEntityName("星辰诀")).toBe(true);
    expect(isCompleteEntityName("聚灵石")).toBe(true);
    expect(isCompleteEntityName("叶凡")).toBe(true); // 短名允许，末字名词性
  });

  it("长度和末字约束", () => {
    expect(isCompleteEntityName("李")).toBe(false); // <2
    expect(isCompleteEntityName("李星云剑法")).toBe(true); // 6字且末字后缀
    expect(isCompleteEntityName("默默修炼")).toBe(false); // 含功能词
    expect(isCompleteEntityName("他看了")).toBe(false); // 末字功能词 + 含功能词
  });
});

describe("extractNewEntities —— Q1 漏斗过滤碎片", () => {
  function makeResult(names: string[]): EntityDetectionResult {
    return {
      entities: names.map((name, i) => ({
        name,
        type: "material",
        position: i,
        confidence: 0.8,
        isKnown: false,
        matchedBy: "test",
      })),
      stats: {
        totalDetected: names.length,
        byType: { pill: 0, artifact: 0, technique: 0, location: 0, material: 0, character: 0 },
        knownCount: 0,
        newCount: names.length,
        textLength: 0,
        elapsedMs: 0,
      },
    };
  }

  it("碎片被剔除、干净名词保留", () => {
    const r = makeResult(["右手拇指", "聚灵石", "他六岁那年练功", "青云剑"]);
    const out = extractNewEntities(r).map((e) => e.name);
    expect(out).toContain("聚灵石");
    expect(out).toContain("青云剑");
    expect(out).not.toContain("右手拇指");
    expect(out).not.toContain("他六岁那年练功");
  });
});
