// extractKeyTerms 残词过滤单测（Max Loop Round3·P4）
// 世界书 keys 的专有名词提取不得把「片空旷区域」「空旷的」这类切词残留当关键词入库。
// 跑法：npx vitest run src/core/dissect/extract-keys.test.ts

import { describe, it, expect } from "vitest";
import { extractKeyTerms } from "./engine";

describe("extractKeyTerms 残词过滤（Max Loop Round3·P4）", () => {
  it("过滤量词开头的切词残留（片空旷区域），保留真实地名", () => {
    // 模拟 LLM 维度内容里出现残词（后跟标点，会被正则提取）
    const keys = extractKeyTerms("地理：片空旷区域，一片海域，灯塔镇。");
    expect(keys.some((k) => k.includes("片空旷"))).toBe(false);
    expect(keys.some((k) => k.includes("一片"))).toBe(false);
    expect(keys.some((k) => k.includes("灯塔镇"))).toBe(true);
  });

  it("过滤以'的/了'结尾的片段，保留专有名词", () => {
    const keys = extractKeyTerms("林舟原，空旷的，夜色如墨。");
    expect(keys.some((k) => k.endsWith("的") || k.endsWith("了"))).toBe(false);
    expect(keys.some((k) => k.includes("林舟原"))).toBe(true);
  });

  it("正常专有名词不受影响", () => {
    const keys = extractKeyTerms("灯塔镇，螺旋阶梯，废弃空间站。");
    expect(keys.some((k) => k.includes("灯塔镇"))).toBe(true);
    expect(keys.some((k) => k.includes("空间站"))).toBe(true);
  });
});
