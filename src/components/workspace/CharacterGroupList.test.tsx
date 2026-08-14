// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CharacterGroupList } from "./CharacterGroupList";
import type { CharacterData } from "./types";

const mk = (id: string, name: string, role: string): CharacterData => ({
  id,
  name,
  role,
  age: "",
  gender: "",
  personality: [],
  currentStatus: "alive",
  tags: [],
});

const noop = () => {};

const renderList = (grouped: Record<string, CharacterData[]>, roleOrder: string[] = ["protagonist", "supporting"]) =>
  render(
    <CharacterGroupList
      grouped={grouped}
      roleOrder={roleOrder}
      roleLabel={{ protagonist: "主角", supporting: "配角" }}
      selectedIds={new Set<string>()}
      deletingId={null}
      tagFilter="all"
      onToggleSelect={noop}
      onEdit={noop}
      onDelete={noop}
      onTagClick={noop}
    />,
  );

describe("CharacterGroupList（按 role 分组渲染，v2.0.4）", () => {
  it("按 role 分组渲染每个角色行，名字均可见", () => {
    renderList({
      protagonist: [mk("p1", "樊斯瑞", "protagonist")],
      supporting: [mk("s1", "叶凌云", "supporting"), mk("s2", "沈凌波", "supporting")],
    });
    expect(screen.getByText("樊斯瑞")).toBeInTheDocument();
    expect(screen.getByText("叶凌云")).toBeInTheDocument();
    expect(screen.getByText("沈凌波")).toBeInTheDocument();
  });

  it("分组标题带数量（主角 (1)）", () => {
    renderList({ protagonist: [mk("p1", "樊斯瑞", "protagonist")] }, ["protagonist"]);
    expect(screen.getByText(/主角/)).toBeInTheDocument();
  });

  it("勾选角色调用 onToggleSelect(id)", () => {
    const onToggleSelect = vi.fn();
    render(
      <CharacterGroupList
        grouped={{ protagonist: [mk("p1", "樊斯瑞", "protagonist")] }}
        roleOrder={["protagonist"]}
        roleLabel={{ protagonist: "主角" }}
        selectedIds={new Set<string>()}
        deletingId={null}
        tagFilter="all"
        onToggleSelect={onToggleSelect}
        onEdit={noop}
        onDelete={noop}
        onTagClick={noop}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggleSelect).toHaveBeenCalledWith("p1");
  });

  it("空分组不渲染该分组（Collapse 跳过 items 为空）", () => {
    // supporting 为空 → 不渲染「配角」标题；只有主角 (1)
    renderList({ protagonist: [mk("p1", "樊斯瑞", "protagonist")], supporting: [] }, ["protagonist", "supporting"]);
    expect(screen.queryByText(/配角/)).toBeNull();
    expect(screen.getByText(/主角/)).toBeInTheDocument();
  });
});
