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

describe("round-22 computeConfidence（含·隐藏身份强制 low / pending）", () => {
  it("forces low for a pseudo (·) group：迭戈·美第奇 ← 迭戈", () => {
    expect(computeConfidence([mk("迭戈·美第奇"), mk("迭戈")], ["迭戈·美第奇", "迭戈"])).toBe("low");
  });
  it("high for a clean honorific alias merging into a plain main：韩立 ← 韩先生", () => {
    expect(computeConfidence([mk("韩立"), mk("韩先生")], ["韩立", "韩先生"])).toBe("high");
  });
  it("low when main itself is a variant (no plain anchor yet)", () => {
    expect(computeConfidence([mk("韩姓男子"), mk("韩先生")], ["韩姓男子", "韩先生"])).toBe("low");
  });
  it("high for normal family-abbrev merge：叶凌云 ← 叶", () => {
    expect(computeConfidence([mk("叶凌云"), mk("叶")], ["叶凌云", "叶"])).toBe("high");
  });
});
