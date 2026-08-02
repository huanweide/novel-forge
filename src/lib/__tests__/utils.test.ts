import { describe, it, expect } from "vitest";
import { safeJoin } from "../utils";

describe("safeJoin", () => {
  it("null/undefined → 空串", () => {
    expect(safeJoin(null)).toBe("");
    expect(safeJoin(undefined)).toBe("");
  });

  it("字符串数组按分隔符 join", () => {
    expect(safeJoin(["a", "b", "c"], "、")).toBe("a、b、c");
  });

  it("数组里的非字符串项被过滤", () => {
    expect(safeJoin(["a", 1, "b", true] as unknown[], ",")).toBe("a,b");
  });

  it("对象按 values join", () => {
    expect(safeJoin({ x: "a", y: "b" }, ",")).toBe("a,b");
  });

  it("普通字符串返回 trim 后内容", () => {
    expect(safeJoin("  hello  ")).toBe("hello");
  });

  it("JSON 字符串数组会被解析后 join（只 join 字符串元素）", () => {
    expect(safeJoin('["a","b","c"]')).toBe("a、b、c");
  });

  it("JSON 数字数组被解析后仅保留字符串元素（数字被过滤）", () => {
    expect(safeJoin("[1,2,3]")).toBe("");
  });

  it("无法解析的 JSON 字符串原样返回", () => {
    expect(safeJoin("{not json")).toBe("{not json");
  });
});
