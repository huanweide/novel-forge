import { describe, it, expect } from "vitest";
import { computeNarrativeStage, formatStage } from "./narrative-stage";

// 注：以下「完整阶段范围」用例均显式传入 targetChapters，模拟「作者已声明全书总章数」，
// 此时进度分母 = 规划总章数，阶段可正常推进到高潮/收尾。
describe("computeNarrativeStage（声明总章数，完整阶段范围）", () => {
  it("开篇：进度 ≤ 8%", () => {
    expect(computeNarrativeStage(0, 100, { targetChapters: 100 }).key).toBe("opening"); // 1%
    expect(computeNarrativeStage(7, 100, { targetChapters: 100 }).key).toBe("opening"); // 8%
    expect(computeNarrativeStage(0, 10, { targetChapters: 10 }).key).toBe("early"); // 10% → 早期发展
  });

  it("早期发展：9% – 30%", () => {
    expect(computeNarrativeStage(8, 100, { targetChapters: 100 }).key).toBe("early"); // 9%
    expect(computeNarrativeStage(29, 100, { targetChapters: 100 }).key).toBe("early"); // 30%
  });

  it("中期发展：31% – 55%", () => {
    expect(computeNarrativeStage(30, 100, { targetChapters: 100 }).key).toBe("mid"); // 31%
    expect(computeNarrativeStage(54, 100, { targetChapters: 100 }).key).toBe("mid"); // 55%
  });

  it("后期发展：56% – 78%", () => {
    expect(computeNarrativeStage(55, 100, { targetChapters: 100 }).key).toBe("late"); // 56%
    expect(computeNarrativeStage(77, 100, { targetChapters: 100 }).key).toBe("late"); // 78%
  });

  it("高潮：79% – 92%", () => {
    expect(computeNarrativeStage(78, 100, { targetChapters: 100 }).key).toBe("climax"); // 79%
    expect(computeNarrativeStage(91, 100, { targetChapters: 100 }).key).toBe("climax"); // 92%
  });

  it("收尾：93% – 100%", () => {
    expect(computeNarrativeStage(92, 100, { targetChapters: 100 }).key).toBe("ending"); // 93%
    expect(computeNarrativeStage(99, 100, { targetChapters: 100 }).key).toBe("ending"); // 100%
  });

  it("边界防御：chapterIndex 越界被夹紧到 [0, total-1]", () => {
    expect(computeNarrativeStage(200, 100, { targetChapters: 100 }).key).toBe("ending"); // 夹紧到 99 → 100%
    expect(computeNarrativeStage(-10, 100, { targetChapters: 100 }).key).toBe("opening"); // 夹紧到 0 → 1%
  });
});

// 关键修复（用户诉求）：未声明全书总章数时，绝不靠章数硬判收尾/高潮——
// 否则用户计划写数百章但只写了十几章时，最后一章会被误判「收尾」提前结局。
describe("computeNarrativeStage（未声明总章数，防抢跑不误判收尾）", () => {
  it("无规划总章数时：已写最后一章（100% 相对进度）仍夹在「后期发展」，不进高潮/收尾", () => {
    // 12 章的书，第 12 章（idx=11）相对进度 100%，但不应被收尾指令逼结局
    expect(computeNarrativeStage(11, 12).key).toBe("late");
    // 展示进度也被夹在后期发展阈值以内，避免出现「后期发展 · 100%」自相矛盾
    expect(computeNarrativeStage(11, 12).percent).toBeLessThanOrEqual(78);
  });

  it("无规划总章数时：高潮/收尾阶段永不自动触发", () => {
    expect(computeNarrativeStage(99, 100).key).toBe("late"); // 即便相对 100% 也不收尾
    expect(computeNarrativeStage(78, 100).key).toBe("late"); // 不进高潮
  });

  it("边界防御：总章数 ≤ 0 时按 1 处理，落入后期发展（不再误判收尾）", () => {
    expect(computeNarrativeStage(0, 0).key).toBe("late");
    expect(computeNarrativeStage(0, -5).key).toBe("late");
  });
});

describe("computeNarrativeStage（后台判定主线收尾）", () => {
  it("主线 Storyline 标记 completed → 直接进入收尾阶段（不靠章数）", () => {
    const s = computeNarrativeStage(11, 12, { mainQuestComplete: true });
    expect(s.key).toBe("ending");
    expect(s.percent).toBe(100);
  });

  it("主线未完结且未声明总章数 → 不收尾（与防抢跑逻辑一致）", () => {
    expect(computeNarrativeStage(11, 12, { mainQuestComplete: false }).key).toBe("late");
  });
});

describe("formatStage", () => {
  it("空 stage 返回空串（调用方据此跳过注入）", () => {
    expect(formatStage(null)).toBe("");
    expect(formatStage(undefined)).toBe("");
  });

  it("有效 stage 返回含阶段名的指令块", () => {
    const s = computeNarrativeStage(0, 100, { targetChapters: 100 });
    const block = formatStage(s);
    expect(block).toContain("【全书进度阶段：开篇");
    expect(block).toContain("约 1% 完成");
    expect(block).toContain("严禁");
  });
});
