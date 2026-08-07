import { describe, it, expect, vi, afterEach } from "vitest";

// 离线单测 smart-deliver 护栏（evaluateConfirmEligibility 为纯函数，不触库）。
// 始终传入 qualityScore（非 null）使其走「采信分数」分支，避免回退 analyzeQuality，
// 因此下方对 quality-analyzer 仅需提供模块桩，无需真实实现。
// prisma 用 hoisted 可变桩，便于在 applyConfirm 单测中按用例设定返回值。
const prismaMock = vi.hoisted(() => ({
  storyNode: { findUnique: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn() },
  project: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/core/babylore/loop", () => ({ safeFillAfterWriting: vi.fn() }));
vi.mock("@/lib/quality-analyzer", () => ({ analyzeQuality: vi.fn() }));

import { evaluateConfirmEligibility, MIN_AUTO_CONFIRM_LENGTH, applyConfirm, triggerForeshadowDetect } from "@/core/confirm-guard";

describe("evaluateConfirmEligibility（smart-deliver 自动放行护栏）", () => {
  it("空正文直接拦截", () => {
    const r = evaluateConfirmEligibility({ content: "", qualityScore: 95 });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/空|短/);
  });

  it("正文过短（<50字）直接拦截", () => {
    const r = evaluateConfirmEligibility({ content: "太短了", qualityScore: 95 });
    expect(r.eligible).toBe(false);
  });

  it("达到最小自动放行长度但仍低于质量阈值 → 拦截", () => {
    // 长度 >= MIN_AUTO_CONFIRM_LENGTH 但分数低于阈值
    const r = evaluateConfirmEligibility({ content: "好".repeat(MIN_AUTO_CONFIRM_LENGTH + 10), qualityScore: 40 });
    expect(r.eligible).toBe(false);
    expect(r.score).toBe(40);
  });

  it("合格长正文 + 高分 → 放行", () => {
    const r = evaluateConfirmEligibility({ content: "好".repeat(MIN_AUTO_CONFIRM_LENGTH + 50), qualityScore: 90 });
    expect(r.eligible).toBe(true);
    expect(r.score).toBe(90);
    expect(["A", "B", "C", "D"]).toContain(r.grade);
  });

  it("机械重复（句子高度雷同）拦截", () => {
    // 同一句凑字数：>=150字 且 >=5 句且唯一率 <60%（需先越过「过短」门槛才能走到该分支）
    const rep = "他在山里修炼剑法。".repeat(20);
    expect(rep.length).toBeGreaterThanOrEqual(150);
    const r = evaluateConfirmEligibility({ content: rep, qualityScore: 95 });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/机械重复/);
  });
});

describe("triggerForeshadowDetect（R2-007 收口：detect 自调用 + 失败日志/重试）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("确认后 POST /api/foreshadowing/detect 并携带 projectId（nodeId 死参数已移除）", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await triggerForeshadowDetect({ projectId: "p1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/foreshadowing/detect");
    expect(opts.method).toBe("POST");
    const parsed = JSON.parse(opts.body);
    expect(parsed).toEqual({ projectId: "p1" });
    expect(parsed).not.toHaveProperty("nodeId");
  });

  it("网络失败重试一次并 console.error 记录（不再静默吞错）", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("net down"));
    vi.stubGlobal("fetch", fetchMock);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await triggerForeshadowDetect({ projectId: "p1" });
    expect(fetchMock).toHaveBeenCalledTimes(2); // 初次 + 重试1次
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls[0][0]).toContain("[foreshadowing/detect]");
  });

  it("非 2xx 响应也触发重试并最终记录日志", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await triggerForeshadowDetect({ projectId: "p1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it("detect 路由超时（AbortSignal）触发重试并最终记录日志，不挂死", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("Aborted", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await triggerForeshadowDetect({ projectId: "p1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it("AbortSignal.timeout 未定义的旧运行时 → 降级不抛且 fetch 仍发出（R4-NEW-7）", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    // 模拟旧 Node 运行时：AbortSignal.timeout 不存在
    vi.stubGlobal("AbortSignal", { ...AbortSignal, timeout: undefined });
    await expect(triggerForeshadowDetect({ projectId: "p1" })).resolves.not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.signal).toBeUndefined();
  });
});

describe("applyConfirm（R2-007 收口：skipDetect 控制 detect 触发）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("skipDetect 未置 → 确认成功后会触发 detect", async () => {
    prismaMock.storyNode.findUnique.mockResolvedValue({ reviewLogs: [] });
    prismaMock.storyNode.aggregate.mockResolvedValue({ _max: { order: 0 } });
    prismaMock.storyNode.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.project.findUnique.mockResolvedValue(null);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await applyConfirm({ id: "n1", projectId: "p1", content: null, order: 0 });

    expect(prismaMock.storyNode.updateMany).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/foreshadowing/detect");
  });

  it("skipDetect 置真 → 确认成功但不触发 detect", async () => {
    prismaMock.storyNode.findUnique.mockResolvedValue({ reviewLogs: [] });
    prismaMock.storyNode.aggregate.mockResolvedValue({ _max: { order: 0 } });
    prismaMock.storyNode.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.project.findUnique.mockResolvedValue(null);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await applyConfirm({ id: "n1", projectId: "p1", content: null, order: 0, skipDetect: true });

    expect(prismaMock.storyNode.updateMany).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
