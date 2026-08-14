// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExpandResultModal } from "./ExpandResultModal";

const noop = () => {};

describe("ExpandResultModal（扩展结果弹窗，v2.0.4）", () => {
  it("无结果且不扩展时不渲染任何内容", () => {
    const { container } = render(
      <ExpandResultModal result={null} onClose={noop} progress={[]} done={0} total={0} expanding={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("渲染结果弹窗：成功/失败计数 + 关闭按钮调用 onClose", () => {
    const onClose = vi.fn();
    render(
      <ExpandResultModal
        result={{ okList: ["樊斯瑞", "叶凌云"], failList: [{ name: "沈凌波", reason: "超时" }], total: 3 }}
        onClose={onClose}
        progress={[]}
        done={0}
        total={0}
        expanding={false}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // 成功数
    expect(screen.getByText("1")).toBeInTheDocument(); // 失败数
    expect(screen.getByText("超时")).toBeInTheDocument(); // 失败原因
    fireEvent.click(screen.getByLabelText("关闭扩展结果"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("全部成功时显示「全部扩展成功」标题", () => {
    render(
      <ExpandResultModal
        result={{ okList: ["樊斯瑞"], failList: [], total: 1 }}
        onClose={noop}
        progress={[]}
        done={0}
        total={0}
        expanding={false}
      />,
    );
    expect(screen.getByText("全部扩展成功")).toBeInTheDocument();
  });

  it("扩展进行中渲染进度条与百分比", () => {
    const { container } = render(
      <ExpandResultModal
        result={null}
        onClose={noop}
        progress={[{ name: "樊斯瑞", status: "ok" }]}
        done={1}
        total={4}
        expanding
      />,
    );
    expect(container.innerHTML).toContain("25%");
  });
});
