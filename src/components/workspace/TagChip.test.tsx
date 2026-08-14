// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagChip } from "./TagChip";

describe("TagChip（v2.17 统一标签芯片）", () => {
  it("渲染 label 文本", () => {
    render(<TagChip label="主角" />);
    expect(screen.getByText("主角")).toBeInTheDocument();
  });

  it("有 onClick 时渲染 button 并带 aria-pressed 反映 active 态", () => {
    render(<TagChip label="主角" active onClick={() => {}} />);
    const btn = screen.getByRole("button", { name: "主角" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("active 为 false 时 aria-pressed=false", () => {
    render(<TagChip label="配角" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "配角" })).toHaveAttribute("aria-pressed", "false");
  });

  it("无 onClick 时渲染 span（非 button，纯展示）", () => {
    const { container } = render(<TagChip label="配角" />);
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("span")).not.toBeNull();
  });

  it("提供 count 时显示计数", () => {
    render(<TagChip label="标签" count={12} />);
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("点击调用 onClick", () => {
    const onClick = vi.fn();
    render(<TagChip label="标签" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "标签" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
