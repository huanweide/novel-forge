import { describe, it, expect } from "vitest";
import { computeConfidence, type CharLite } from "./character-dedupe";

const mk = (name: string, aliases: string[] = []): CharLite => ({
  id: name,
  name,
  aliases,
  background: "",
  storyLine: "",
  relationships: null,
  tags: [],
});

describe("round-22 computeConfidence（v2.17 同核名高置信自动合并 + ·隐藏身份安全闸门）", () => {
  it("single ·-variant of same core → high（迭戈·美第奇 ← 迭戈 视为同一人，自动合并）", () => {
    expect(computeConfidence([mk("迭戈·美第奇"), mk("迭戈")], ["迭戈·美第奇", "迭戈"])).toBe("high");
  });
  it("multiple ·-variants of same core → low（迭戈·美第奇 / 迭戈·桑切斯 同核可能不同人，安全闸门交用户确认）", () => {
    expect(
      computeConfidence([mk("迭戈·美第奇"), mk("迭戈·桑切斯")], ["迭戈·美第奇", "迭戈·桑切斯"]),
    ).toBe("low");
  });
  it("high for a clean honorific alias merging into a plain main：韩立 ← 韩先生", () => {
    expect(computeConfidence([mk("韩立"), mk("韩先生")], ["韩立", "韩先生"])).toBe("high");
  });
  it("variant + variant sharing core → high（韩姓男子 ← 韩先生 同核「韩」，自动合并）", () => {
    expect(computeConfidence([mk("韩姓男子"), mk("韩先生")], ["韩姓男子", "韩先生"])).toBe("high");
  });
  it("high for normal family-abbrev merge：叶凌云 ← 叶", () => {
    expect(computeConfidence([mk("叶凌云"), mk("叶")], ["叶凌云", "叶"])).toBe("high");
  });
});
