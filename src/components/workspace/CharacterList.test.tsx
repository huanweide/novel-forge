// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CharacterList } from "./CharacterList";
import type { CharacterData } from "./types";

// toast 相关的 mock 必须在 hoist 阶段可用，否则 vi.mock 工厂提升后会 TDZ 报错
const { confirmDialog, toastError, toastSuccess, toastInfo } = vi.hoisted(() => ({
  confirmDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
}));

// 轻量 stub：只暴露触发回调的按钮 + 把关键 props 渲染成可读文本，便于断言
vi.mock("@/components/ui/icons", () => ({ Icon: () => null }));
vi.mock("@/components/ui/States", () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("@/components/ui/toast", () => ({ confirmDialog, toastError, toastSuccess, toastInfo }));
// filterCharacters 是纯函数，保留真实实现（行为确定、可断言 filtered 分组）
// useConfirmDelete 保留真实实现，以便测 confirmDialog 的真分支（true→删 / false→不删）

vi.mock("./CharacterFilters", () => ({ CharacterFilters: () => <div>Filters</div> }));
vi.mock("./CharacterToolbar", () => ({
  CharacterToolbar: ({ onExpand, onToggleAll, selectedIds, filtered, expandDone, expandTotal }: any) => (
    <div>
      <button onClick={() => onExpand()}>扩展</button>
      <button onClick={onToggleAll}>全选</button>
      <span data-testid="sel">{selectedIds.size}</span>
      <span data-testid="filtered">{filtered.length}</span>
      <span data-testid="done">{expandDone}</span>
      <span data-testid="total">{expandTotal}</span>
    </div>
  ),
}));
vi.mock("./ExpandResultModal", () => ({ ExpandResultModal: () => null }));
vi.mock("./CharacterGroupList", () => ({
  CharacterGroupList: ({ onToggleSelect, onConfirm, onDelete, grouped }: any) => (
    <div>
      <button onClick={() => onToggleSelect("c1")}>勾选</button>
      <button onClick={() => onConfirm("c1")}>确认</button>
      <button onClick={() => onDelete("c1", "名字")}>删除</button>
      <span data-testid="groups">{Object.keys(grouped).length}</span>
    </div>
  ),
}));
vi.mock("./MergePendingPanel", () => ({ MergePendingPanel: () => null }));

const noop = () => {};

// 组件挂载时的「后台静默重复角色探测」effect 会发 /api/characters/dedupe 请求，
// 因此断言必须针对具体 URL（/api/characters/expand），不能断言全局 fetch 未调用。
// 另外 SSE 流必须用每次新建的 ReadableStream——mockResolvedValue 复用同一 Response
// 会导致 dedupe 探测先把流读空、扩展请求读到空流；且 jsdom 的 Response 对流式 body
// 支持不可靠，故用轻量 fake response 绕开其实现差异。
const makeSseStream = (events: string[]) =>
  new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      for (const ev of events) controller.enqueue(enc.encode(ev));
      controller.close();
    },
  });

const makeFakeResponse = (body: ReadableStream | null, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  body,
  json: () => Promise.resolve({}),
});

const mkChar = (id: string, name = `角色${id}`, role = "supporting"): CharacterData => ({
  id,
  name,
  role,
  age: "",
  gender: "",
  personality: [],
  currentStatus: "alive",
  tags: [],
});

const setup = (overrides: any = {}) => {
  const onEdit = vi.fn();
  const onDelete = overrides.onDelete ?? vi.fn().mockResolvedValue(undefined);
  const onNew = vi.fn();
  const onExpanded = overrides.onExpanded ?? vi.fn();
  const onConfirm = overrides.onConfirm;
  const utils = render(
    <CharacterList
      characters={overrides.characters ?? []}
      projectId="p1"
      onEdit={onEdit}
      onDelete={onDelete}
      onNew={onNew}
      onExpanded={onExpanded}
      onConfirm={onConfirm}
    />,
  );
  return { ...utils, onEdit, onDelete, onNew, onExpanded };
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CharacterList（出口组件状态机 + 网络层，v2.24.0）", () => {
  it("无匹配角色时渲染 EmptyState「无匹配角色」", () => {
    setup({ characters: [] });
    expect(screen.getByText("无匹配角色")).toBeInTheDocument();
  });

  it("有角色时按 role 分组传给 CharacterGroupList", () => {
    setup({ characters: [mkChar("c1", "樊斯瑞", "protagonist"), mkChar("c2", "叶凌云", "supporting")] });
    expect(screen.getByTestId("groups")).toHaveTextContent("2");
    expect(screen.getByText("Filters")).toBeInTheDocument();
  });

  it("未勾选任何角色时点「扩展」不对 /api/characters/expand 发请求", async () => {
    const fetchMock = vi.fn().mockImplementation(() => makeFakeResponse(null));
    vi.stubGlobal("fetch", fetchMock);
    setup({ characters: [mkChar("c1")] });
    fireEvent.click(screen.getByText("扩展"));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/characters/expand", expect.anything());
  });

  it("扩展请求非 2xx 调 toastError 且只读一次扩展请求（不读流）", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      url.includes("/api/characters/expand") ? makeFakeResponse(null, 500) : makeFakeResponse(null),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { onExpanded } = setup({ characters: [mkChar("c1")] });
    fireEvent.click(screen.getByText("勾选"));
    fireEvent.click(screen.getByText("扩展"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/characters/expand", expect.anything());
    expect(fetchMock).toHaveBeenCalledTimes(2); // dedupe 探测 1 + 扩展 1
    expect(onExpanded).not.toHaveBeenCalled();
  });

  it("SSE 收到 done 事件触发 onExpanded 并清空选中", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      url.includes("/api/characters/expand")
        ? makeFakeResponse(makeSseStream(['data: {"type":"done","okList":["c1"],"failList":[],"total":1}\n\n']))
        : makeFakeResponse(null),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { onExpanded } = setup({ characters: [mkChar("c1")] });
    fireEvent.click(screen.getByText("勾选"));
    fireEvent.click(screen.getByText("扩展"));
    await waitFor(() => expect(onExpanded).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("sel")).toHaveTextContent("0"));
  });

  it("SSE progress 事件解析 done/total 字段", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      url.includes("/api/characters/expand")
        ? makeFakeResponse(
            makeSseStream([
              'data: {"type":"progress","done":2,"total":5}\n\ndata: {"type":"done","okList":[],"failList":[],"total":5}\n\n',
            ]),
          )
        : makeFakeResponse(null),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { onExpanded } = setup({ characters: [mkChar("c1")] });
    fireEvent.click(screen.getByText("勾选"));
    fireEvent.click(screen.getByText("扩展"));
    await waitFor(() => expect(onExpanded).toHaveBeenCalled());
    expect(screen.getByTestId("done")).toHaveTextContent("2");
    expect(screen.getByTestId("total")).toHaveTextContent("5");
  });

  it("删除确认 confirmDialog 返回 true 调用 onDelete", async () => {
    confirmDialog.mockResolvedValue(true);
    const onDelete = vi.fn().mockResolvedValue(undefined);
    setup({ characters: [mkChar("c1")], onDelete });
    fireEvent.click(screen.getByText("删除"));
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled());
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("c1"));
  });

  it("删除确认 confirmDialog 返回 false 不调用 onDelete", async () => {
    confirmDialog.mockResolvedValue(false);
    const onDelete = vi.fn().mockResolvedValue(undefined);
    setup({ characters: [mkChar("c1")], onDelete });
    fireEvent.click(screen.getByText("删除"));
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled());
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("确认角色卡 PUT 成功回调 onExpanded（默认 handleConfirm，不传 onConfirm）", async () => {
    const fetchMock = vi.fn().mockImplementation(() => makeFakeResponse(null));
    vi.stubGlobal("fetch", fetchMock);
    const { onExpanded } = setup({ characters: [mkChar("c1")] });
    fireEvent.click(screen.getByText("确认"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/characters/c1",
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ reviewStatus: "approved" }) }),
      ),
    );
    await waitFor(() => expect(onExpanded).toHaveBeenCalled());
  });
});
