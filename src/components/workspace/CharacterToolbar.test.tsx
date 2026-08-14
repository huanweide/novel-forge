// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CharacterToolbar } from "./CharacterToolbar";

const noop = () => {};
const baseProps = {
  filtered: [{ id: "a" }, { id: "b" }],
  selectedIds: new Set<string>(["a"]), // 非空集，确保「AI扩展」「清空」按钮可用
  allInViewSelected: false,
  expanding: false,
  expandDone: 0,
  expandTotal: 0,
  deduping: false,
  onToggleAll: noop,
  onExpand: noop,
  onDedupe: noop,
  onRange: noop,
  onClear: noop,
  newTag: "龙陨卫", // 非空，确保「打标到选中」按钮可用
  onNewTagChange: noop,
  onApplyTags: noop,
  applying: false,
  selectedCount: 1,
};

describe("CharacterToolbar（v2.0.4 自建标签 + 工具条按钮）", () => {
  it("新建标签输入框带 aria-label（可访问性）", () => {
    render(<CharacterToolbar {...baseProps} />);
    expect(screen.getByLabelText("新建标签名")).toBeInTheDocument();
  });

  it("输入标签名调用 onNewTagChange", () => {
    const onNewTagChange = vi.fn();
    render(<CharacterToolbar {...baseProps} onNewTagChange={onNewTagChange} />);
    const input = screen.getByLabelText("新建标签名");
    fireEvent.change(input, { target: { value: "新标签" } });
    expect(onNewTagChange).toHaveBeenCalledWith("新标签");
  });

  it("全选按钮调用 onToggleAll", () => {
    const onToggleAll = vi.fn();
    render(<CharacterToolbar {...baseProps} onToggleAll={onToggleAll} />);
    fireEvent.click(screen.getByRole("button", { name: /全选/ }));
    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });

  it("AI扩展按钮（选中非空时可用）调用 onExpand", () => {
    const onExpand = vi.fn();
    render(<CharacterToolbar {...baseProps} onExpand={onExpand} />);
    fireEvent.click(screen.getByRole("button", { name: /AI扩展/ }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("打标到选中按钮（标签非空 + 选中非空时可用）调用 onApplyTags", () => {
    const onApplyTags = vi.fn();
    render(<CharacterToolbar {...baseProps} onApplyTags={onApplyTags} />);
    fireEvent.click(screen.getByRole("button", { name: /打标到选中/ }));
    expect(onApplyTags).toHaveBeenCalledTimes(1);
  });

  it("清空按钮（选中非空时可见）调用 onClear", () => {
    const onClear = vi.fn();
    render(<CharacterToolbar {...baseProps} onClear={onClear} />);
    fireEvent.click(screen.getByRole("button", { name: "清空" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
