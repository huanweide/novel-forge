// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RangeSelector, parseRange } from "./RangeSelector";

// 把 Set<number> 规整成排序数组，方便断言
const ids = (s: Set<number>) => [...s].sort((a, b) => a - b);

describe("parseRange（范围表达式解析纯函数，v2.0.4）", () => {
  it("空字符串 → 空集", () => {
    expect(ids(parseRange("", 50))).toEqual([]);
  });

  it("all / * → 全选 0..total-1", () => {
    expect(ids(parseRange("all", 5))).toEqual([0, 1, 2, 3, 4]);
    expect(ids(parseRange("*", 5))).toEqual([0, 1, 2, 3, 4]);
  });

  it("1-50 → 0..49（1-based 转 0-based）", () => {
    expect(ids(parseRange("1-50", 50))).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });

  it("1,3,5 → [0,2,4]", () => {
    expect(ids(parseRange("1,3,5", 10))).toEqual([0, 2, 4]);
  });

  it("10- → 从 9 到末尾", () => {
    expect(ids(parseRange("10-", 12))).toEqual([9, 10, 11]);
  });

  it("-30 → 开头到 29", () => {
    expect(ids(parseRange("-30", 50))).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });

  it("混合 1-5,8,10-15", () => {
    expect(ids(parseRange("1-5,8,10-15", 20))).toEqual([
      0, 1, 2, 3, 4, 7, 9, 10, 11, 12, 13, 14,
    ]);
  });

  it("超出范围的下标被忽略", () => {
    expect(ids(parseRange("1-999", 5))).toEqual([0, 1, 2, 3, 4]);
  });

  it("非法输入被忽略，不报错", () => {
    expect(ids(parseRange("abc,1-3", 10))).toEqual([0, 1, 2]);
  });
});

describe("RangeSelector 组件", () => {
  it("范围输入框带 aria-label（可访问性）", () => {
    render(<RangeSelector total={10} onSelect={() => {}} />);
    expect(screen.getByLabelText("选择角色范围（如 1-50 或 1,3,5）")).toBeInTheDocument();
  });

  it("回车提交把解析后的索引集合传给 onSelect", () => {
    const onSelect = vi.fn();
    render(<RangeSelector total={10} onSelect={onSelect} />);
    const input = screen.getByLabelText("选择角色范围（如 1-50 或 1,3,5）");
    fireEvent.change(input, { target: { value: "1-3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(new Set([0, 1, 2]));
  });

  it("失焦时若值有变化也会提交", () => {
    const onSelect = vi.fn();
    render(<RangeSelector total={10} onSelect={onSelect} />);
    const input = screen.getByLabelText("选择角色范围（如 1-50 或 1,3,5）");
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);
    expect(onSelect).toHaveBeenCalledWith(new Set([4]));
  });

  it("Escape 清空选择", () => {
    const onSelect = vi.fn();
    render(<RangeSelector total={10} onSelect={onSelect} />);
    const input = screen.getByLabelText("选择角色范围（如 1-50 或 1,3,5）");
    fireEvent.change(input, { target: { value: "1-3" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSelect).toHaveBeenCalledWith(new Set());
  });
});
