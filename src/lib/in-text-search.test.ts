import { describe, it, expect } from "vitest";
import { countMatches, hasNativeFind, jumpToMatch, replaceMatches } from "./in-text-search";

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

describe("replaceMatches", () => {
  it("空查询返回原文、count 0", () => {
    expect(replaceMatches("正文内容", "", "X")).toEqual({ newContent: "正文内容", count: 0 });
    expect(replaceMatches("正文内容", "  ", "X")).toEqual({ newContent: "正文内容", count: 0 });
  });

  it("空正文返回原内容、count 0", () => {
    expect(replaceMatches("", "词", "X")).toEqual({ newContent: "", count: 0 });
  });

  it("全部替换：中文多次命中计数正确", () => {
    const text = "李逍遥去了李逍遥的家，遇见李逍遥的朋友。";
    expect(replaceMatches(text, "李逍遥", "王小虎", { all: true })).toEqual({
      newContent: "王小虎去了王小虎的家，遇见王小虎的朋友。",
      count: 3,
    });
  });

  it("单处替换（occurrenceIndex=0）只改第一处", () => {
    const text = "苹果 苹果 苹果";
    expect(replaceMatches(text, "苹果", "梨", { occurrenceIndex: 0 })).toEqual({
      newContent: "梨 苹果 苹果",
      count: 1,
    });
  });

  it("occurrenceIndex 越界返回原文、count 0", () => {
    const text = "苹果 苹果";
    expect(replaceMatches(text, "苹果", "梨", { occurrenceIndex: 9 })).toEqual({
      newContent: text,
      count: 0,
    });
  });

  it("大小写不敏感：统一替换所有大小写变体", () => {
    const text = "Hello hello HELLO";
    expect(replaceMatches(text, "hello", "Hi", { all: true })).toEqual({
      newContent: "Hi Hi Hi",
      count: 3,
    });
  });

  it("replacement 含 $&/$1 等特殊字符按字面写入（不解释）", () => {
    const text = "价格是 1+1";
    expect(replaceMatches(text, "1+1", "$& 等于 2", { all: true })).toEqual({
      newContent: "价格是 $& 等于 2",
      count: 1,
    });
  });

  it("replacement 为空 = 删除匹配", () => {
    const text = "去掉**多余**的字";
    expect(replaceMatches(text, "**", "", { all: true })).toEqual({
      newContent: "去掉多余的字",
      count: 2,
    });
  });

  it("从后往前替换避免索引偏移（相邻重叠命中）", () => {
    expect(replaceMatches("aaaa", "aa", "b", { all: true })).toEqual({
      newContent: "bb",
      count: 2,
    });
    expect(replaceMatches("ababab", "ab", "x", { all: true })).toEqual({
      newContent: "xxx",
      count: 3,
    });
  });

  it("查询含正则特殊字符按字面匹配替换", () => {
    expect(replaceMatches("a.b.c", "a.b", "X", { all: true })).toEqual({
      newContent: "X.c",
      count: 1,
    });
  });

  it("trim 查询词首尾空白", () => {
    expect(replaceMatches("苹果 苹果", " 苹果 ", "梨", { all: true })).toEqual({
      newContent: "梨 梨",
      count: 2,
    });
  });
});
