/**
 * utils.ts 单元测试（cn / safeJoin）
 * - safeJoin：Prisma Json 字段（数组/对象/字符串/JSON 回退）安全转字符串
 * - cn：clsx + tailwind-merge 类名合并与冲突去重
 * 纯逻辑、无 DB 无 IO。
 */
import { describe, it, expect } from "vitest";
import { cn, safeJoin } from "./utils";

describe("safeJoin", () => {
  it("null / undefined → 空串", () => {
    expect(safeJoin(null)).toBe("");
    expect(safeJoin(undefined)).toBe("");
  });

  it("字符串数组按分隔符 join（默认、号）", () => {
    expect(safeJoin(["a", "b", "c"])).toBe("a、b、c");
  });

  it("数组过滤非字符串元素", () => {
    expect(safeJoin(["a", 1, "b", true, null])).toBe("a、b");
  });

  it("对象按 Object.values join", () => {
    expect(safeJoin({ x: "a", y: "b" })).toBe("a、b");
  });

  it("普通字符串返回 trim 后原文", () => {
    expect(safeJoin("  hello  ")).toBe("hello");
  });

  it("可解析 JSON 数组 → 递归 join", () => {
    expect(safeJoin('["a","b","c"]')).toBe("a、b、c");
  });

  it("可解析 JSON 对象 → Object.values join", () => {
    expect(safeJoin('{"x":"a","y":"b"}')).toBe("a、b");
  });

  it("JSON 解析失败回退到原 trim 字符串", () => {
    expect(safeJoin("[a, b")).toBe("[a, b");
  });

  it("数字 → String", () => {
    expect(safeJoin(123)).toBe("123");
  });

  it("自定义分隔符", () => {
    expect(safeJoin(["a", "b"], ",")).toBe("a,b");
  });
});

describe("cn", () => {
  it("合并多个类名（clsx）", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("tailwind 冲突类去重保留后者（twMerge）", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
