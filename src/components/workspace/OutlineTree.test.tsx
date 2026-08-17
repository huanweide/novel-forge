// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutlineTree } from "./OutlineTree";
import type { StoryNodeData } from "./types";

const mk = (
  id: string,
  title: string,
  parentId: string | null,
  type = "chapter",
): StoryNodeData => ({
  id,
  title,
  type,
  status: "draft",
  outline: null,
  content: null,
  wordCount: 0,
  order: 0,
  parentId,
  activeCharacters: [],
  editVersion: 0,
  worldTime: null,
  qualityScore: null,
});

const noop = () => {};

describe("OutlineTree 键盘可达性 + childrenMap（Round-29 FIX-8）", () => {
  it("节点行支持 Enter / Space 触发选中（无障碍键盘入口）", () => {
    const onSelectNode = vi.fn();
    render(
      <OutlineTree
        nodes={[mk("c1", "第一章", null), mk("c2", "第二章", null)]}
        selectedNode={null}
        onSelectNode={onSelectNode}
        onAddSection={noop}
        viewMode="flat"
        projectId="p"
      />,
    );
    const row = screen.getByText("第一章").closest('[role="button"]') as HTMLElement;
    expect(row).not.toBeNull();
    // 键盘可达：role=button + 可聚焦
    expect(row).toHaveAttribute("role", "button");
    expect(row).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(row, { key: "Enter" });
    expect(onSelectNode).toHaveBeenLastCalledWith(expect.objectContaining({ id: "c1" }));

    fireEvent.keyDown(row, { key: " " });
    expect(onSelectNode).toHaveBeenCalledTimes(2);
  });

  it("鼠标点击仍触发选中（回归）", () => {
    const onSelectNode = vi.fn();
    render(
      <OutlineTree
        nodes={[mk("c1", "第一章", null)]}
        selectedNode={null}
        onSelectNode={onSelectNode}
        onAddSection={noop}
        viewMode="flat"
        projectId="p"
      />,
    );
    fireEvent.click(screen.getByText("第一章").closest('[role="button"]')!);
    expect(onSelectNode).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
  });

  it("childrenMap 正确还原嵌套：卷下章节可点击选中", () => {
    const onSelectNode = vi.fn();
    render(
      <OutlineTree
        nodes={[mk("v1", "第一卷", null, "volume"), mk("c1", "第一章", "v1")]}
        selectedNode={null}
        onSelectNode={onSelectNode}
        onAddSection={noop}
        viewMode="volume"
        projectId="p"
      />,
    );
    const childRow = screen.getByText("第一章").closest('[role="button"]') as HTMLElement;
    fireEvent.click(childRow);
    expect(onSelectNode).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
  });

  it("volume 视图：卷头支持键盘展开/折叠（aria-expanded）", () => {
    render(
      <OutlineTree
        nodes={[mk("v1", "第一卷", null, "volume"), mk("c1", "第一章", "v1")]}
        selectedNode={null}
        onSelectNode={noop}
        onAddSection={noop}
        viewMode="volume"
        projectId="p"
      />,
    );
    const header = screen.getByText("第一卷").closest('[role="button"]') as HTMLElement;
    expect(header).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(header, { key: "Enter" });
    expect(header).toHaveAttribute("aria-expanded", "false");
  });
});
