import { describe, it, expect } from "vitest";
import {
  isCjkChar,
  matchKeyword,
  scoreKeyword,
  dedupSubstring,
} from "./match";

// 这些测试验证「三卡检索 / 填表」的 CJK 词边界匹配引擎 —— 其核心目标：
// 中文无空格，"林" 不应误命中 "森林"，"潮痕" 不应误命中 "暗潮痕迹"。
describe("isCjkChar", () => {
  it("汉字返回 true", () => {
    expect(isCjkChar("林")).toBe(true);
    expect(isCjkChar("镇")).toBe(true);
  });
  it("非汉字返回 false", () => {
    expect(isCjkChar("a")).toBe(false);
    expect(isCjkChar("1")).toBe(false);
    expect(isCjkChar(" ")).toBe(false);
  });
});

describe("matchKeyword —— 灭错名核心", () => {
  it("单字关键词直接拒绝（杜绝「林」误命中「森林」）", () => {
    expect(matchKeyword("森林里有一只老虎", "林")).toBe(false);
    expect(matchKeyword("他在林中", "林")).toBe(false);
  });

  it("长度≥3 直接命中（含子串）", () => {
    expect(matchKeyword("青龙镇坐落在海边", "青龙镇")).toBe(true);
    expect(matchKeyword("新城的夜色", "新城")).toBe(true);
  });

  it("长度=2 需词边界：真实词「潮痕」在边界处命中", () => {
    // 「潮痕」位于句尾，尾部是边界 → 命中
    expect(matchKeyword("他一路追到潮痕", "潮痕")).toBe(true);
    // 句首边界
    expect(matchKeyword("潮痕是古老的记号", "潮痕")).toBe(true);
  });

  it("长度=2 非边界不命中（「潮痕」≠「暗潮痕迹」中的片段）", () => {
    // 暗(0)潮(1)痕(2)迹(3)：潮痕两侧都是汉字 → 非边界 → 不命中
    expect(matchKeyword("暗潮痕迹渐渐清晰", "潮痕")).toBe(false);
  });

  it("长度=2 跨真实词边界不匹配（「青龍」不在「青龙镇」中，繁简不同）", () => {
    expect(matchKeyword("青龙镇灯火通明", "青龍")).toBe(false);
  });

  it("否定用例：关键词不在文本中", () => {
    expect(matchKeyword("新城的夜色", "龙渊")).toBe(false);
  });
});

describe("scoreKeyword —— 最长匹配优先", () => {
  it("单字得 0 分（单字被 matchKeyword 拒绝，不参与召回打分）", () => {
    expect(scoreKeyword("林")).toBe(0);
    expect(scoreKeyword("镇")).toBe(0);
  });
  it("长度≥2 时越长越具体得分越高", () => {
    expect(scoreKeyword("青龙镇")).toBe(3);
    expect(scoreKeyword("青龙")).toBe(2);
  });
});

describe("dedupSubstring —— 去除被更长关键词包含的短词", () => {
  it("保留长词、剔除被包含的短词", () => {
    // 假设已命中集合里有「青龙镇」，则「龙镇」应被剔除，避免重复召回
    const out = dedupSubstring(["青龙镇", "龙镇", "新城", "城"]);
    expect(out).toContain("青龙镇");
    expect(out).toContain("新城");
    expect(out).not.toContain("龙镇");
    expect(out).not.toContain("城");
  });
  it("无包含关系时全部保留", () => {
    expect(dedupSubstring(["青龙镇", "龙渊"])).toEqual(["青龙镇", "龙渊"]);
  });
});
