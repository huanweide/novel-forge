import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getDraftKey,
  saveDraftLocal,
  getDraftLocal,
  clearDraftLocal,
  isDraftNewer,
  type LocalDraft,
} from "@/lib/auto-save";

const NODE = "node-abc-123";

function installLocalStorageMock() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("window", { localStorage: ls });
  return store;
}

describe("auto-save 本地草稿层", () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  it("getDraftKey 按节点隔离前缀", () => {
    expect(getDraftKey(NODE)).toBe(`nf-autosave-${NODE}`);
  });

  it("saveDraftLocal → getDraftLocal 往返一致", () => {
    saveDraftLocal(NODE, "第一章正文\n第二段");
    const d = getDraftLocal(NODE);
    expect(d).not.toBeNull();
    expect(d!.content).toBe("第一章正文\n第二段");
    expect(typeof d!.savedAt).toBe("number");
  });

  it("clearDraftLocal 后读回 null", () => {
    saveDraftLocal(NODE, "x");
    clearDraftLocal(NODE);
    expect(getDraftLocal(NODE)).toBeNull();
  });

  it("损坏的 JSON 不抛错，返回 null", () => {
    (localStorage as any).setItem(getDraftKey(NODE), "{bad json");
    expect(getDraftLocal(NODE)).toBeNull();
  });

  it("字段缺失（无 savedAt）视为损坏，返回 null", () => {
    (localStorage as any).setItem(getDraftKey(NODE), JSON.stringify({ content: "x" }));
    expect(getDraftLocal(NODE)).toBeNull();
  });

  it("不同节点草稿互不串台", () => {
    saveDraftLocal("n1", "甲");
    saveDraftLocal("n2", "乙");
    expect(getDraftLocal("n1")!.content).toBe("甲");
    expect(getDraftLocal("n2")!.content).toBe("乙");
  });
});

describe("isDraftNewer 崩溃恢复判定", () => {
  const base: LocalDraft = { content: "草稿", savedAt: Date.parse("2026-09-03T12:00:00Z") };

  it("draft 为 null → false", () => {
    expect(isDraftNewer(null, "2026-09-03T11:00:00Z")).toBe(false);
  });

  it("草稿新于服务端 → true", () => {
    expect(isDraftNewer(base, "2026-09-03T11:00:00Z")).toBe(true);
  });

  it("草稿旧于服务端 → false", () => {
    expect(isDraftNewer(base, "2026-09-03T13:00:00Z")).toBe(false);
  });

  it("服务端无时间 → true（默认本地更可信）", () => {
    expect(isDraftNewer(base, null)).toBe(true);
    expect(isDraftNewer(base, undefined)).toBe(true);
  });

  it("服务端时间解析失败 → true（宁可提示，不丢内容）", () => {
    expect(isDraftNewer(base, "not-a-date")).toBe(true);
  });

  it("时间戳相等 → false（同一时刻，无需恢复）", () => {
    expect(isDraftNewer(base, "2026-09-03T12:00:00Z")).toBe(false);
  });
});
