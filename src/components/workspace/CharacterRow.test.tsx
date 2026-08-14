// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CharacterRow } from "./CharacterRow";
import type { CharacterData } from "./types";

const base: CharacterData = {
  id: "c1",
  name: "樊斯瑞",
  role: "protagonist",
  age: "",
  gender: "",
  personality: [],
  currentStatus: "alive",
  tags: [],
};

const noop = () => {};
const renderRow = (over: Partial<CharacterData> = {}, confirm?: (id: string) => void) =>
  render(
    <CharacterRow
      character={{ ...base, ...over }}
      selected={false}
      deleting={false}
      onToggleSelect={noop}
      onEdit={noop}
      onDelete={noop}
      onConfirm={confirm}
      onTagClick={noop}
      tagFilter="all"
    />,
  );

describe("CharacterRow（v1.6.24 待审审批闭环 + v2.17 统一标签）", () => {
  it("渲染角色名", () => {
    renderRow();
    expect(screen.getByText("樊斯瑞")).toBeInTheDocument();
  });

  it("reviewStatus 非 pending 时不显示待审徽章与确认按钮", () => {
    renderRow({ reviewStatus: "approved" }, () => {});
    expect(screen.queryByText("待审")).toBeNull();
    expect(screen.queryByLabelText("确认并入")).toBeNull();
  });

  it("reviewStatus=pending 且传 onConfirm 时显示待审徽章 + 确认按钮，点击调用 onConfirm(id)", () => {
    const onConfirm = vi.fn();
    renderRow({ reviewStatus: "pending" }, onConfirm);
    expect(screen.getByText("待审")).toBeInTheDocument();
    const btn = screen.getByLabelText("确认并入");
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledWith("c1");
  });

  it("reviewStatus=pending 但未传 onConfirm 时不渲染确认按钮", () => {
    renderRow({ reviewStatus: "pending" });
    expect(screen.queryByLabelText("确认并入")).toBeNull();
  });

  it("勾选框点击调用 onToggleSelect(id)", () => {
    const onToggleSelect = vi.fn();
    render(
      <CharacterRow
        character={base}
        selected={false}
        deleting={false}
        onToggleSelect={onToggleSelect}
        onEdit={noop}
        onDelete={noop}
        onTagClick={noop}
        tagFilter="all"
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggleSelect).toHaveBeenCalledWith("c1");
  });
});
