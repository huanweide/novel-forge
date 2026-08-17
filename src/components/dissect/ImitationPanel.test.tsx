// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ImitationPanel } from "./ImitationPanel";

// Round-29 FIX-9：验证 ImitationPanel 的列表加载 effect 在卸载时
// 通过 AbortController 中止在途请求，避免向已卸载组件 setState（React 警告/竞态）。

type Task = {
  id: string;
  taskName: string;
  bookName: string;
  bookAuthor: string;
  status: string;
  totalChapters: number;
};

const SAMPLE: Task[] = [
  { id: "t1", taskName: "任务1", bookName: "书A", bookAuthor: "作者X", status: "completed", totalChapters: 3 },
];

// 列表 fetch 替身：返回成功、附带 signal
function stubListFetch(tasks: Task[] = SAMPLE) {
  return vi.fn(async (_url: string, opts?: any) => {
    return { ok: true, json: async () => ({ tasks }) };
  });
}

describe("ImitationPanel 列表加载 effect（Round-29 FIX-9 AbortController）", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("挂载时 fetch 携带 AbortSignal（卸载/重挂载可中止在途请求）", () => {
    const fetchMock = stubListFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<ImitationPanel />);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("卸载时中止在途请求（signal.aborted 为 true，不会 setState 到已卸载组件）", () => {
    let captured: AbortSignal | undefined;
    // 永不 resolve 的 promise，模拟一个一直挂起、在途的请求
    const pending = new Promise<never>(() => {});
    const fetchMock = vi.fn(async (_url: string, opts?: any) => {
      captured = opts?.signal;
      return pending;
    });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<ImitationPanel />);
    expect(captured).toBeInstanceOf(AbortSignal);
    expect(captured!.aborted).toBe(false);

    unmount();
    expect(captured!.aborted).toBe(true);
    // 卸载后不应有任何 console.error（含 React 的已卸载组件 setState 警告）
    expect(console.error).not.toHaveBeenCalled();
  });

  it("正常加载后渲染拆书任务列表（行为保持不变）", async () => {
    const fetchMock = stubListFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { findByText } = render(<ImitationPanel />);
    expect(await findByText(/书A/)).toBeInTheDocument();
  });

  it("请求被中止（AbortError）时不当作错误处理 / 不 setState error", async () => {
    // 在 signal 被 abort 时 reject 出 AbortError，模拟浏览器行为
    const fetchMock = vi.fn(async (_url: string, opts?: any) => {
      const signal: AbortSignal = opts?.signal;
      return new Promise((_resolve, reject) => {
        if (signal) {
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<ImitationPanel />);
    unmount(); // 触发 ac.abort() → fetch reject AbortError
    // 给微任务队列一点时间，确保 catch 分支执行（应被忽略而非 setState error）
    await new Promise((r) => setTimeout(r, 0));
    expect(console.error).not.toHaveBeenCalled();
  });
});
