/**
 * quality-analyzer 纯逻辑单测（魔王循环 v2.5.0）
 * 覆盖：六维质量评分、加权总分、评级、通过阈值、复用禁用词扫描结果、PoV 跳变检测。
 * 纯本地算法（正则+统计），零 LLM / prisma / DOM，直接 import 即可。
 */
import { describe, it, expect } from "vitest";
import { analyzeQuality } from "./quality-analyzer";

const DIM_KEYS = [
  "wasteWordRate",
  "showVsTell",
  "povConsistency",
  "sentenceVariety",
  "dialogueNaturalness",
  "subjectDiversity",
];

describe("analyzeQuality - 结构与边界", () => {
  it("空文本 → 六维满分、总分100、评级A、通过", () => {
    const r = analyzeQuality("");
    expect(r.dimensions).toHaveLength(6);
    expect(r.overallScore).toBe(100);
    expect(r.grade).toBe("A");
    expect(r.passed).toBe(true);
  });

  it("六个维度 key 齐全且正确", () => {
    const r = analyzeQuality("他握剑刺出。敌人倒下。她转身离去。");
    const keys = r.dimensions.map((d) => d.key).sort();
    expect(keys).toEqual([...DIM_KEYS].sort());
  });

  it("每个维度分数都在 [0,100] 区间", () => {
    const r = analyzeQuality("此外此外综上所述。他握剑刺出。敌人倒下。");
    for (const d of r.dimensions) {
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
    }
    expect(r.overallScore).toBeGreaterThanOrEqual(0);
    expect(r.overallScore).toBeLessThanOrEqual(100);
  });
});

describe("analyzeQuality - 评分行为", () => {
  it("干净且有动作描写的文本 → 通过且评级 A/B（高分）", () => {
    const r = analyzeQuality("他握剑刺出。敌人应声倒下。她转身离去。");
    expect(r.passed).toBe(true);
    expect(r.overallScore).toBeGreaterThanOrEqual(85); // A 级
  });

  it("含大量禁用词 → 总分低于满分且非 A 级（扣分生效）", () => {
    const r = analyzeQuality("此外此外此外综上所述综上所述");
    expect(r.overallScore).toBeLessThan(100);
    expect(r.grade).not.toBe("A");
    // 废词率维度应被扣低分
    const waste = r.dimensions.find((d) => d.key === "wasteWordRate")!;
    expect(waste.score).toBeLessThan(100);
  });

  it("summary 在无误时报「达标」", () => {
    const r = analyzeQuality("");
    expect(r.summary).toContain("达标");
  });
});

describe("analyzeQuality - 禁用词扫描结果复用", () => {
  it("传入空 forbiddenMatches 时不重新扫描 → 废词率维度满分（与默认扫描对比更高）", () => {
    const text = "此外此外此外";
    const withScan = analyzeQuality(text);
    const reused = analyzeQuality(text, [], { forbiddenMatches: [] });
    const wasteScan = withScan.dimensions.find((d) => d.key === "wasteWordRate")!;
    const wasteReused = reused.dimensions.find((d) => d.key === "wasteWordRate")!;
    expect(wasteReused.score).toBe(100); // 复用空结果，不扫描真实禁用词
    expect(wasteReused.score).toBeGreaterThan(wasteScan.score);
  });
});

describe("analyzeQuality - PoV 视角一致性", () => {
  it("多段落频繁切换角色 → 视角一致性维度被扣分（<100）", () => {
    const text = "张三走向门口。\n\n李四坐在桌前。\n\n张三回头看了一眼。\n\n李四站起身。";
    const r = analyzeQuality(text, ["张三", "李四"]);
    const pov = r.dimensions.find((d) => d.key === "povConsistency")!;
    expect(pov.score).toBeLessThan(100);
  });

  it("无角色词典 → 跳过 PoV 检测，视角维度满分", () => {
    const r = analyzeQuality("张三走向门口。李四坐在桌前。", []);
    const pov = r.dimensions.find((d) => d.key === "povConsistency")!;
    expect(pov.score).toBe(100);
  });
});

describe("analyzeQuality - 评级边界", () => {
  it("评级只在 A/B/C/D 四档", () => {
    const r = analyzeQuality("他握剑刺出。敌人倒下。");
    expect(["A", "B", "C", "D"]).toContain(r.grade);
  });

  it("passed 与总分阈值一致（≥60 通过）", () => {
    const r = analyzeQuality("他握剑刺出。敌人倒下。她离去。");
    expect(r.passed).toBe(r.overallScore >= 60);
  });
});
