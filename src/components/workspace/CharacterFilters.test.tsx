// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CharacterFilters } from "./CharacterFilters";
import type { CharacterData } from "./types";

const chars: CharacterData[] = [
  { id: "1", name: "甲", role: "protagonist", age: "", gender: "", personality: [], currentStatus: "alive", tags: ["朋友"] },
  { id: "2", name: "乙", role: "supporting", age: "", gender: "", personality: [], currentStatus: "dead", tags: ["📥系统导入", "🗂 已合并"] },
  { id: "3", name: "丙", role: "supporting", age: "", gender: "", personality: [], currentStatus: "alive", tags: [] },
];

const defaultProps = {
  characters: chars,
  search: "",
  onSearch: () => {},
  roleFilter: "all",
  statusFilter: "all",
  tagFilter: "all",
  onRole: () => {},
  onStatus: () => {},
  onTag: () => {},
};

describe("CharacterFilters（v2.17 统一筛选栏）", () => {
  it("渲染带 aria-label 的搜索框", () => {
    render(<CharacterFilters {...defaultProps} />);
    expect(screen.getByLabelText("搜索角色")).toBeInTheDocument();
  });

  it("渲染「全部」与有数据的角色定位芯片", () => {
    render(<CharacterFilters {...defaultProps} />);
    expect(screen.getByRole("button", { name: /全部/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /主角/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /配角/ })).toBeInTheDocument();
  });

  it("点击角色芯片调用 onRole 并重置 tag 为 all", () => {
    const onRole = vi.fn();
    const onTag = vi.fn();
    render(<CharacterFilters {...defaultProps} onRole={onRole} onTag={onTag} />);
    fireEvent.click(screen.getByRole("button", { name: /主角/ }));
    expect(onRole).toHaveBeenCalledWith("protagonist");
    expect(onTag).toHaveBeenCalledWith("all");
  });

  it("标签筛选芯片排除系统标签 📥 与软删 🗂 已合并，只显示用户标签", () => {
    render(<CharacterFilters {...defaultProps} />);
    expect(screen.getByRole("button", { name: "朋友" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "📥系统导入" })).toBeNull();
    expect(screen.queryByRole("button", { name: "🗂 已合并" })).toBeNull();
  });
});
