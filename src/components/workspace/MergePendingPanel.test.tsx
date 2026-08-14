// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MergePendingPanel } from "./MergePendingPanel";

// 把 toast 模块整体 mock 为 no-op，避免测试里触发真实 UI 副作用
vi.mock("@/components/ui/toast", () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
}));

type Revision = {
  id: string;
  mainCardId: string;
  mergedIds: string[];
  confidence: "high" | "low";
  source: "llm" | "rule" | "loose";
  status: "pending" | "applied";
  summary: string;
  createdAt: string;
};

const ITEMS: Revision[] = [
  { id: "r1", mainCardId: "c1", mergedIds: ["c2"], confidence: "high", source: "rule", status: "pending", summary: "合并 A 与 B", createdAt: "2026-01-01" },
  { id: "r2", mainCardId: "c3", mergedIds: ["c4"], confidence: "low", source: "llm", status: "applied", summary: "合并 C 与 D", createdAt: "2026-01-02" },
];

// 用一个可控的 fetch 替身：GET 返回提案列表，POST 返回成功
function stubFetch(items: Revision[] = ITEMS) {
  return vi.fn(async (url: string, opts?: any) => {
    if ((opts?.method ?? "GET") === "POST") {
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => ({ ok: true, items }) };
  });
}

describe("MergePendingPanel（合并提案面板，v2.19 补 AbortController）", () => {
  let fetchMock: ReturnType<typeof stubFetch>;

  beforeEach(() => {
    fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("挂载时拉取提案，渲染标题与数量徽标", async () => {
    render(<MergePendingPanel projectId="p1" />);
    expect(await screen.findByText(/合并提案/)).toBeInTheDocument();
    expect(screen.getByText(/1 待确认/)).toBeInTheDocument();
    expect(screen.getByText(/1 可回滚/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/characters/merge-pending?projectId=p1"),
      expect.anything(),
    );
  });

  it("挂载拉取携带 AbortSignal（组件卸载/切项目时可中止在途请求）", async () => {
    render(<MergePendingPanel projectId="p1" />);
    await screen.findByText(/合并提案/);
    const call = fetchMock.mock.calls[0];
    expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("点击刷新按钮重新拉取（不传 signal 的手动调用）", async () => {
    render(<MergePendingPanel projectId="p1" />);
    await screen.findByText(/合并提案/);
    const before = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /刷新合并提案/ }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });

  it("点击确认合并发起 POST 并回调 onChanged", async () => {
    const onChanged = vi.fn();
    render(<MergePendingPanel projectId="p1" onChanged={onChanged} />);
    await screen.findByText(/合并提案/);
    fireEvent.click(screen.getByRole("button", { name: /确认合并/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const postCall = fetchMock.mock.calls.find((c) => c[1]?.method === "POST");
    expect(postCall?.[0]).toContain("/api/characters/merge-confirm");
  });
});
