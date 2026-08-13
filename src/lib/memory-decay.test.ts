/**
 * memory-decay.ts 单元测试（长效记忆衰减引擎 / 纯逻辑部分）
 * 锁死：computeEventDecay 单事件衰减决策——S 永久、A/B 逐级降级、C 删除、
 * 长程跳级衰减、tier 大小写归一、未识别 tier 保守保留。
 * 屏蔽 DB：vi.mock("@/lib/prisma")，只测纯函数，不触库。
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { computeEventDecay } from "./memory-decay";

const mkEvent = (tier: string, extra: Record<string, unknown> = {}): any => ({
  description: "事件",
  score: 1,
  tier,
  category: "interaction",
  isBreakthrough: false,
  isForeshadowRelated: false,
  relatedCharacterIds: [],
  ...extra,
});

describe("computeEventDecay", () => {
  it("S 级永久保留 → keep", () => {
    const d = computeEventDecay(mkEvent("S"), 999);
    expect(d.action).toBe("keep");
    expect(d.targetTier).toBe("S");
  });

  it("A 级未过期（<=30 章）→ keep", () => {
    const d = computeEventDecay(mkEvent("A"), 30);
    expect(d.action).toBe("keep");
    expect(d.targetTier).toBe("A");
  });

  it("A 级过期（>30 章）→ 递归跳级到删除（30>>15>>5 一路超龄）", () => {
    const d = computeEventDecay(mkEvent("A"), 31);
    expect(d.action).toBe("delete");
    expect(d.targetTier).toBeNull();
  });

  it("B 级过期（>15 章）→ 删除（15>>5 超龄）", () => {
    const d = computeEventDecay(mkEvent("B"), 16);
    expect(d.action).toBe("delete");
    expect(d.targetTier).toBeNull();
  });

  it("C 级过期（>5 章）→ 删除", () => {
    const d = computeEventDecay(mkEvent("C"), 6);
    expect(d.action).toBe("delete");
    expect(d.targetTier).toBeNull();
  });

  it("过期远超 → A 级一路递归到删除（不卡在中间层）", () => {
    const d = computeEventDecay(mkEvent("A"), 100);
    expect(d.action).toBe("delete");
    expect(d.targetTier).toBeNull();
  });

  it("tier 小写自动归一为大写后判定", () => {
    const d = computeEventDecay(mkEvent("a"), 31);
    expect(d.action).toBe("delete");
    expect(d.targetTier).toBeNull();
  });

  it("未识别 tier → 保守保留（不删不降）", () => {
    const d = computeEventDecay(mkEvent("X"), 999);
    expect(d.action).toBe("keep");
    expect(d.targetTier).toBe("X");
  });

  it("无 tier（空串）→ 默认 C 且过期删除", () => {
    const d = computeEventDecay(mkEvent(""), 6);
    expect(d.action).toBe("delete");
    expect(d.targetTier).toBeNull();
  });
});
