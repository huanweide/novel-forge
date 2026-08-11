import { describe, it, expect, vi } from "vitest";

// outline-context 在模块顶层 import prisma 与 rules，单测中以桩替换，避免触库 / 拉重依赖。
const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  storyline: { findMany: vi.fn() },
  storyNode: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/core/rules", () => ({
  getActiveRules: vi.fn(),
  injectRules: vi.fn((note: string) => note),
}));

import { pickReassignMainId, formatStorylines } from "@/core/pipeline/outline-context";

describe("pickReassignMainId（NEW-5: 多活跃主线防跨线误归属）", () => {
  it("无兄弟主线 / 非法入参 → 返回 null（子线置空交由 resolveParent 回退）", () => {
    expect(pickReassignMainId([])).toBeNull();
    expect(pickReassignMainId(undefined as unknown as any[])).toBeNull();
  });

  it("恰有一条活跃兄弟主线 → 返回该主线 id（单父级合法重挂）", () => {
    const siblings = [
      { id: "m1", status: "active" },
      { id: "m2", status: "completed" },
    ];
    expect(pickReassignMainId(siblings)).toBe("m1");
  });

  it("≥2 条活跃兄弟主线 → 返回 null（不盲目嫁接第一条，防跨线误归属）", () => {
    const siblings = [
      { id: "m1", status: "active" },
      { id: "m2", status: "active" },
    ];
    expect(pickReassignMainId(siblings)).toBeNull();
  });

  it("仅 completed/abandoned 兄弟 → 返回 null（不挂到终态主线）", () => {
    const siblings = [
      { id: "m1", status: "completed" },
      { id: "m2", status: "abandoned" },
    ];
    expect(pickReassignMainId(siblings)).toBeNull();
  });
});

describe("formatStorylines（#200 续写非孤立 · 主线三要素）", () => {
  const main = {
    id: "m1",
    type: "main",
    title: "龙陨之地",
    status: "active",
    sevenElements: { origin: "封印松动", process: "七族对峙", result: "龙元现世" },
    events: [
      { kind: "EVENT", position: 1, title: "守墓人潜入" },
      { kind: "MILESTONE", position: 2, title: "裂隙开启" },
      { kind: "CLUE", position: 3, tag: "伏笔", title: "残碑预言" },
    ],
  };
  const side = {
    id: "s1",
    type: "side",
    title: "盗取龙元",
    status: "active",
    parentId: "m1",
    sevenElements: {
      desire: "想要龙元",
      obstacle: "守卫阻路",
      action: "盗取钥匙",
      result: "夺得龙元",
      twist: "守卫反杀",
      turn: "同伙倒戈",
      ending: "",
    },
    events: [{ kind: "EVENT", position: 1, title: "支线事件A" }],
  };

  it("主线注入三要素且不含七要素标签", () => {
    const out = formatStorylines([main]);
    expect(out).toContain("三要素：");
    expect(out).toContain("起因:封印松动");
    expect(out).toContain("经过:七族对峙");
    expect(out).toContain("结果:龙元现世");
    expect(out).not.toContain("七要素：");
  });

  it("无目标线时主线作为参考线，不喧宾夺主", () => {
    const out = formatStorylines([main]);
    expect(out).toContain("参考线：保持与核心推进线的因果关联，不要喧宾夺主");
  });

  it("targetStorylineId 命中主线时带推进提示", () => {
    const out = formatStorylines([main], { targetStorylineId: "m1" });
    expect(out).toContain("【核心推进线】");
    expect(out).toContain("续写提示：优先推进时间轴上已规划但尚未充分展开的事件节点");
  });

  it("targetStorylineId 命中已完结主线时触发扩散提示", () => {
    const completedMain = { ...main, status: "completed" };
    const out = formatStorylines([completedMain], { targetStorylineId: "m1" });
    expect(out).toContain("【核心推进线】");
    expect(out).toContain("现有结局仅作为阶段性终点");
    expect(out).toContain("向外扩散");
  });

  it("targetStorylineId 命中已完结支线时触发扩散提示", () => {
    const completedSide = { ...side, status: "completed" };
    const out = formatStorylines([main, completedSide], { targetStorylineId: "s1" });
    expect(out).toContain("【剧情线：盗取龙元】（支线）");
    expect(out).toContain("【核心推进线】");
    expect(out).toContain("基于现有结局向外扩散");
  });

  it("支线注入七要素并解析隶属主线", () => {
    const out = formatStorylines([main, side]);
    expect(out).toContain("七要素：");
    expect(out).toContain("欲望:想要龙元");
    expect(out).toContain("（隶属主线 龙陨之地）");
  });

  it("时间轴注入全部已规划/已发生事件（含 EVENT，不止 MILESTONE）", () => {
    const out = formatStorylines([main]);
    expect(out).toContain("时间轴（已规划/已发生，方向：先发生 → 后导致）：");
    expect(out).toContain("事件·守墓人潜入");
    expect(out).toContain("里程碑·裂隙开启");
    // CLUE 不应进入时间轴，而应在线索集
    expect(out).toContain("线索集：");
    expect(out).toContain("线索[伏笔] 残碑预言");
  });
});
