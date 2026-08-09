import { describe, it, expect } from "vitest";
import { parseSuggestionFromLLM } from "./suggestFix";

describe("parseSuggestionFromLLM", () => {
  it("正常文本：取第一个非空段落", () => {
    expect(parseSuggestionFromLLM("他的左眼应是灰色的。")).toBe("他的左眼应是灰色的。");
  });

  it("容错：剥除 ``` 代码围栏", () => {
    const text = "```\n把他漆黑的左眼改为灰色。\n```";
    expect(parseSuggestionFromLLM(text)).toBe("把他漆黑的左眼改为灰色。");
  });

  it("容错：跳过前后废话与解释性开场白，取首段", () => {
    const text = "以下是改写建议：\n\n将「他漆黑如墨的左眼」改为「他一双灰眸」。\n希望这能帮到你。";
    expect(parseSuggestionFromLLM(text)).toBe("将「他漆黑如墨的左眼」改为「他一双灰眸」。");
  });

  it("容错：开场白与建议同行（仅去前缀）", () => {
    expect(parseSuggestionFromLLM("以下是改写建议：将「他漆黑的左眼」改为「他一双灰眸」。")).toBe(
      "将「他漆黑的左眼」改为「他一双灰眸」。",
    );
  });

  it("容错：空响应返回空串（不抛）", () => {
    expect(parseSuggestionFromLLM("")).toBe("");
    expect(parseSuggestionFromLLM("   ")).toBe("");
    expect(parseSuggestionFromLLM("无建议")).toBe("无建议");
  });
});
