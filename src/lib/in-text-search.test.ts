import { describe, it, expect } from "vitest";
import { countMatches, hasNativeFind, jumpToMatch } from "./in-text-search";

describe("countMatches", () => {
  it("空查询返回 0", () => {
    expect(countMatches("正文内容", "")).toBe(0);
    expect(countMatches("正文内容", "   ")).toBe(0);
    expect(countMatches("正文内容", null as unknown as string)).toBe(0);
  });

  it("正文为空返回 0", () => {
    expect(countMatches("", "词")).toBe(0);
  });

  it("大小写不敏感", () => {
    expect(countMatches("Hello hello HELLO world", "hello")).toBe(3);
  });

  it("中文命中多次精确计数", () => {
    const text = "李逍遥去了李逍遥的家，遇见李逍遥的朋友。";
    expect(countMatches(text, "李逍遥")).toBe(3);
  });

  it("无命中返回 0", () => {
    expect(countMatches("今天天气真好", "下雨")).toBe(0);
  });

  it("查询含正则特殊字符按字面匹配、不崩溃", () => {
    expect(countMatches("价格是 1+1=2，不是 1+1 能算清", "1+1")).toBe(2);
    expect(countMatches("a.b.c", "a.b")).toBe(1);
    expect(countMatches(".*+?\\^$[]{}()|", ".*+?")).toBe(1);
  });

  it("相邻命中各自计数（不重叠消费）", () => {
    expect(countMatches("aaaa", "aa")).toBe(2);
  });

  it("全文与查询完全相等也算 1 次", () => {
    expect(countMatches("整句", "整句")).toBe(1);
  });

  it("trim 查询词首尾空白", () => {
    expect(countMatches("苹果 苹果", " 苹果 ")).toBe(2);
  });
});

describe("hasNativeFind / jumpToMatch 降级", () => {
  it("无头环境（无 window.find）下 hasNativeFind 为 false，jumpToMatch 安全返回 false", () => {
    // 测试运行在 jsdom，window.find 通常未实现
    expect(jumpToMatch("任意词", false)).toBe(hasNativeFind());
  });
});
