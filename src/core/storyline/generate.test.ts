import { describe, it, expect } from "vitest";
import { storylineStyleDesc } from "./generate";

describe("storylineStyleDesc（#201 风格轴提示）", () => {
  it("simple 强调简约、主线三要素提纲", () => {
    const d = storylineStyleDesc("simple");
    expect(d).toContain("简约");
    expect(d).toContain("三要素");
  });

  it("normal 强调均衡常规", () => {
    expect(storylineStyleDesc("normal")).toContain("均衡");
  });

  it("creative（含缺省 undefined）强调大胆脑洞", () => {
    expect(storylineStyleDesc("creative")).toContain("大胆脑洞");
    expect(storylineStyleDesc(undefined)).toContain("大胆脑洞");
  });
});
