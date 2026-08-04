import { describe, it, expect } from "vitest";
import { applyRegexRules, isLikelyUnsafeRegex } from "./regex";

describe("isLikelyUnsafeRegex", () => {
  it("放行正常正则", () => {
    expect(isLikelyUnsafeRegex("\\s+", "g")).toBeNull();
    expect(isLikelyUnsafeRegex("(foo|bar)", "")).toBeNull();
  });

  it("拦截嵌套量词 (a+)+$", () => {
    expect(isLikelyUnsafeRegex("(a+)+$", "")).not.toBeNull();
  });

  it("拦截 (x*)*y", () => {
    expect(isLikelyUnsafeRegex("(x*)*y", "g")).not.toBeNull();
  });

  it("拦截超大重复次数", () => {
    expect(isLikelyUnsafeRegex("a{999999}", "")).not.toBeNull();
  });

  it("拦截非法 flags", () => {
    expect(isLikelyUnsafeRegex("a", "x")).not.toBeNull();
  });

  it("拦截超长 pattern", () => {
    expect(isLikelyUnsafeRegex("a".repeat(600), "g")).not.toBeNull();
  });

  it("不误伤非嵌套的 ? 可选量词", () => {
    expect(isLikelyUnsafeRegex("(?:colou?r)", "")).toBeNull();
    expect(isLikelyUnsafeRegex("(a)?b", "g")).toBeNull();
  });
});

describe("applyRegexRules ReDoS 防护", () => {
  it("恶意正则被拒绝且不污染文本（仍在热路径上安全返回）", () => {
    const rules = [
      { name: "safe", pattern: "\\s+", flags: "g", replace: " " },
      { name: "evil", pattern: "(a+)+$", flags: "", replace: "X" },
    ];
    const out = applyRegexRules("hello   world", rules);
    // safe 规则生效，evil 规则被跳过，文本未被恶意替换
    expect(out).toBe("hello world");
  });

  it("正常规则仍生效", () => {
    const out = applyRegexRules("fooBAR", [{ name: "lower", pattern: "BAR", flags: "g", replace: "baz" }]);
    expect(out).toBe("foobaz");
  });

  it("空/非数组 rules 不报错", () => {
    expect(applyRegexRules("x", undefined as any)).toBe("x");
    expect(applyRegexRules("x", [])).toBe("x");
  });
});
