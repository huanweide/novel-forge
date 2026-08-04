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

  it("拦截重叠交替类 ReDoS (a|aa)+$", () => {
    expect(isLikelyUnsafeRegex("(a|aa)+$", "")).not.toBeNull();
  });

  it("拦截单字符交替 + 重复组 (a|b)+", () => {
    expect(isLikelyUnsafeRegex("(a|b)+", "g")).not.toBeNull();
  });

  it("拦截 (x|y)+ 模式", () => {
    expect(isLikelyUnsafeRegex("(x|y)+$", "")).not.toBeNull();
  });

  it("拦截 (a|[a-z])+$ 交替 + 字符类", () => {
    expect(isLikelyUnsafeRegex("(a|[a-z])+$", "g")).not.toBeNull();
  });

  it("不误伤无重复量词的纯交替 (foo|bar)", () => {
    expect(isLikelyUnsafeRegex("(foo|bar)", "")).toBeNull();
  });

  it("拦截 (a?)+ 类重叠可选 ReDoS", () => {
    expect(isLikelyUnsafeRegex("(a?)+", "g")).not.toBeNull();
  });

  it("拦截 (a?)* 类重叠可选 ReDoS", () => {
    expect(isLikelyUnsafeRegex("(a?)*", "")).not.toBeNull();
  });

  it("拦截 ((a?))+ 嵌套可选 ReDoS", () => {
    expect(isLikelyUnsafeRegex("((a?))+", "g")).not.toBeNull();
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

  // N1 修复（Round 8 回归）：? 不再列入 repeated，合法可选组应放行
  it("放行合法可选组 (https?://)?", () => {
    expect(isLikelyUnsafeRegex("(https?://)?", "g")).toBeNull();
  });

  it("放行合法可选组 (a+)?", () => {
    expect(isLikelyUnsafeRegex("(a+)?", "g")).toBeNull();
  });

  it("放行合法可选组 (a?)?", () => {
    expect(isLikelyUnsafeRegex("(a?)?", "g")).toBeNull();
  });

  // 保留既有拦截用例：真 ReDoS (a?)+ / (a?)* 仍须拦截
  it("仍拦截 (a?)+ 灾难性回溯", () => {
    expect(isLikelyUnsafeRegex("(a?)+", "g")).not.toBeNull();
  });

  it("仍拦截 (a?)* 灾难性回溯", () => {
    expect(isLikelyUnsafeRegex("(a?)*", "")).not.toBeNull();
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
