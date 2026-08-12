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
vi.mock("@/core/foreshadowing", () => ({ detectPayoffs: vi.fn() }));

import { evaluateConfirmEligibility, MIN_AUTO_CONFIRM_LENGTH, applyConfirm, triggerForeshadowDetect } from "@/core/confirm-guard";
import { detectPayoffs } from "@/core/foreshadowing";

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

describe("triggerForeshadowDetect（F4 修复：进程内直调 detectPayoffs，消除 HTTP 自回环死链）", () => {
  const detectPayoffsMock = vi.mocked(detectPayoffs);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    detectPayoffsMock.mockReset();
  });

  it("确认后进程内直调 detectPayoffs 且携带 projectId（无 HTTP 自回环）", async () => {
    detectPayoffsMock.mockResolvedValue({} as any);
    await triggerForeshadowDetect({ projectId: "p1" });
    expect(detectPayoffsMock).toHaveBeenCalledTimes(1);
    expect(detectPayoffsMock).toHaveBeenCalledWith("p1");
  });

  it("detectPayoffs 抛错 → console.error 记录且不抛（不阻断确认主流程）", async () => {
    detectPayoffsMock.mockRejectedValue(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(triggerForeshadowDetect({ projectId: "p1" })).resolves.not.toThrow();
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls[0][0]).toContain("[foreshadowing/detect]");
  });

  it("NEW-2: 同 projectId 并发触发 → detectPayoffs 仅调用一次（互斥去重防雪崩）", async () => {
    let resolveDetect: () => void = () => {};
    const pending = new Promise<void>((res) => { resolveDetect = res; });
    detectPayoffsMock.mockReturnValue(pending as unknown as Promise<any>);
    const p1 = triggerForeshadowDetect({ projectId: "dedup-p" });
    const p2 = triggerForeshadowDetect({ projectId: "dedup-p" });
    // 在途期间不应重复调用
    expect(detectPayoffsMock).toHaveBeenCalledTimes(1);
    resolveDetect();
    await Promise.all([p1, p2]);
    expect(detectPayoffsMock).toHaveBeenCalledTimes(1);
  });
});

describe("applyConfirm（R2-007 收口：skipDetect 控制 detect 触发）", () => {
  const detectPayoffsMock = vi.mocked(detectPayoffs);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("skipDetect 未置 → 确认成功后会触发 detect（进程内直调 detectPayoffs）", async () => {
    prismaMock.storyNode.findUnique.mockResolvedValue({ reviewLogs: [] });
    prismaMock.storyNode.aggregate.mockResolvedValue({ _max: { order: 0 } });
    prismaMock.storyNode.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.project.findUnique.mockResolvedValue(null);
    detectPayoffsMock.mockResolvedValue({} as any);

    await applyConfirm({ id: "n1", projectId: "p1", content: null, order: 0 });

    expect(prismaMock.storyNode.updateMany).toHaveBeenCalledTimes(1);
    expect(detectPayoffsMock).toHaveBeenCalledTimes(1);
    expect(detectPayoffsMock).toHaveBeenCalledWith("p1");
  });

  it("skipDetect 置真 → 确认成功但不触发 detect", async () => {
    prismaMock.storyNode.findUnique.mockResolvedValue({ reviewLogs: [] });
    prismaMock.storyNode.aggregate.mockResolvedValue({ _max: { order: 0 } });
    prismaMock.storyNode.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.project.findUnique.mockResolvedValue(null);

    await applyConfirm({ id: "n1", projectId: "p1", content: null, order: 0, skipDetect: true });

    expect(prismaMock.storyNode.updateMany).toHaveBeenCalledTimes(1);
    expect(detectPayoffsMock).not.toHaveBeenCalled();
  });
});
