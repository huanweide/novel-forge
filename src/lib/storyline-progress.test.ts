import { describe, it, expect } from "vitest";
import { computeStorylineProgress, SEVEN_ELEMENT_FILL_KEYS, groupStorylinesByMain, sortChildrenByStatusThenOrder, buildCausalChain, withNarrativeRoles, NARRATIVE_ROLES } from "./storyline-progress";

describe("故事线进度量化（v1.8.4 · sevenElements）", () => {
  it("空故事线：进度全 0、未收束", () => {
    const p = computeStorylineProgress({});
    expect(p.elementFilled).toBe(0);
    expect(p.elementPercent).toBe(0);
    expect(p.overallPercent).toBe(0);
    expect(p.hasEnding).toBe(false);
    expect(p.label).toContain("要素 0/6");
  });

  it("六要素全填：elementPercent=100，结局不计入", () => {
    const full = Object.fromEntries(SEVEN_ELEMENT_FILL_KEYS.map((k) => [k, `内容-${k}`]));
    const p = computeStorylineProgress({ sevenElements: full });
    expect(p.elementFilled).toBe(6);
    expect(p.elementPercent).toBe(100);
    expect(p.hasEnding).toBe(false);
    expect(p.overallPercent).toBe(100);
  });

  it("六要素全填 + 结局：仍 100，但标记已收束", () => {
    const full = Object.fromEntries(SEVEN_ELEMENT_FILL_KEYS.map((k) => [k, `内容-${k}`]));
    full.ending = "主角归于田园";
    const p = computeStorylineProgress({ sevenElements: full });
    expect(p.elementPercent).toBe(100);
    expect(p.hasEnding).toBe(true);
    expect(p.label).toContain("已收束");
  });

  it("部分填充：正确折算百分比", () => {
    const p = computeStorylineProgress({ sevenElements: { desire: "想复仇", obstacle: "强敌" } });
    // 2/6 ≈ 33.33 → 33
    expect(p.elementFilled).toBe(2);
    expect(p.elementPercent).toBe(33);
  });

  it("sevenElements 缺失 / 非对象 / 旧七列字段 安全降级", () => {
    expect(computeStorylineProgress({}).elementFilled).toBe(0);
    expect(computeStorylineProgress({ sevenElements: "bad" }).elementFilled).toBe(0);
    expect(computeStorylineProgress({ sevenElements: null }).elementFilled).toBe(0);
    // 旧独立列字段不再计入（数据模型已迁移）
    expect(computeStorylineProgress({ desire: "旧列" }).elementFilled).toBe(0);
  });
});

describe("N2 groupStorylinesByMain（多主线遍历）", () => {
  const data = [
    { id: "old", type: "main", status: "completed", title: "旧主线" },
    { id: "new", type: "main", status: "active", title: "新主线" },
    { id: "s1", type: "side", status: "active", title: "挂新主线", parentId: "new" },
    { id: "s2", type: "side", status: "active", title: "无父悬空" },
    { id: "s3", type: "side", status: "active", title: "挂旧主线", parentId: "old" },
  ];

  it("所有主线都被返回，新活跃主线不被吞", () => {
    const { mains } = groupStorylinesByMain(data);
    expect(mains.map((m: any) => m.id).sort()).toEqual(["new", "old"]);
  });

  it("回退主线优先活跃主线（而非数组第一条旧主线）", () => {
    const { fallbackMain, resolveParent } = groupStorylinesByMain(data);
    expect(fallbackMain?.id).toBe("new");
    // 悬空支线应回退到活跃主线，而非误归属旧 completed 主线
    expect(resolveParent({ id: "s2", type: "side" })?.id).toBe("new");
  });

  it("按各自主线正确聚合子线", () => {
    const { childrenOf } = groupStorylinesByMain(data);
    expect(childrenOf("new").map((s: any) => s.id).sort()).toEqual(["s1", "s2"]);
    expect(childrenOf("old").map((s: any) => s.id)).toEqual(["s3"]);
  });

  it("空/异常输入安全", () => {
    expect(groupStorylinesByMain(undefined as any).mains).toEqual([]);
    expect(groupStorylinesByMain([]).fallbackMain).toBeNull();
  });
});

describe("thread 伏笔分类与完结沉底（#223）", () => {
  const data = [
    { id: "main1", type: "main", status: "active", title: "主线", order: 1 },
    { id: "s1", type: "side", status: "active", title: "活跃支线", parentId: "main1", order: 2 },
    { id: "s2", type: "side", status: "completed", title: "完结支线", parentId: "main1", order: 1 },
    { id: "t1", type: "thread", status: "active", title: "活跃伏笔", parentId: "main1", order: 3 },
    { id: "t2", type: "thread", status: "completed", title: "完结伏笔", parentId: "main1", order: 1 },
  ];

  it("thread 被单独分类，不混入 sides", () => {
    const { sides, threads } = groupStorylinesByMain(data);
    expect(sides.map((s: any) => s.id).sort()).toEqual(["s1", "s2"]);
    expect(threads.map((t: any) => t.id).sort()).toEqual(["t1", "t2"]);
  });

  it("childrenOf 返回主线下的支线+伏笔，且完结沉底、order 升序", () => {
    const { childrenOf } = groupStorylinesByMain(data);
    const ids = childrenOf("main1").map((s: any) => s.id);
    // 未完结(s1 order2, t1 order3) 在前并按 order 升序；完结(s2,t2) 沉底
    expect(ids[0]).toBe("s1");
    expect(ids[1]).toBe("t1");
    expect(ids[2]).toBe("s2");
    expect(ids[3]).toBe("t2");
  });

  it("sortChildrenByStatusThenOrder：完结沉底、同状态按 order 升序", () => {
    const arr = [
      { id: "a", status: "completed", order: 1 },
      { id: "b", status: "active", order: 5 },
      { id: "c", status: "active", order: 2 },
    ];
    expect(sortChildrenByStatusThenOrder(arr).map((x: any) => x.id)).toEqual(["c", "b", "a"]);
  });
});

describe("v1.9 buildCausalChain（因果链聚合）", () => {
  const lines = [
    {
      id: "main", type: "main", status: "active", title: "龙陨主线",
      events: [
        { id: "m-e1", kind: "EVENT", title: "主线事件A", position: 1 },
        { id: "m-c1", kind: "CLUE", title: "主线线索", position: 2 },
        { id: "m-e2", kind: "MILESTONE", title: "主线里程碑", position: 5 },
      ],
    },
    {
      id: "s1", type: "side", status: "active", title: "支线X", parentId: "main",
      events: [{ id: "s-e1", kind: "EVENT", title: "支线事件", position: 3 }],
    },
    {
      id: "t1", type: "thread", status: "active", title: "伏笔Y", parentId: "main",
      events: [{ id: "t-e1", kind: "EVENT", title: "伏笔事件", position: 4 }],
    },
  ];

  it("选中主线：聚合本线+所有子线/伏笔事件，排除 CLUE，按 position 全局排序", () => {
    const nodes = buildCausalChain(lines, "main");
    expect(nodes.map((n) => n.event.id)).toEqual(["m-e1", "s-e1", "t-e1", "m-e2"]);
    expect(nodes.find((n) => n.event.id === "m-c1")).toBeUndefined();
  });

  it("节点带来源线标题与类型标识，主线事件 isMain=true", () => {
    const nodes = buildCausalChain(lines, "main");
    const mainNode = nodes.find((n) => n.event.id === "m-e1")!;
    const sideNode = nodes.find((n) => n.event.id === "s-e1")!;
    const threadNode = nodes.find((n) => n.event.id === "t-e1")!;
    expect(mainNode.isMain).toBe(true);
    expect(mainNode.lineTitle).toBe("龙陨主线");
    expect(sideNode.isMain).toBe(false);
    expect(sideNode.lineType).toBe("side");
    expect(sideNode.lineTitle).toBe("支线X");
    expect(threadNode.lineType).toBe("thread");
    expect(threadNode.lineTitle).toBe("伏笔Y");
  });

  it("选中支线：仅返回该线事件，不串入主线", () => {
    const nodes = buildCausalChain(lines, "s1");
    expect(nodes.map((n) => n.event.id)).toEqual(["s-e1"]);
    expect(nodes[0].isMain).toBe(false);
  });

  it("找不到选中线 / 空输入：安全返回空数组", () => {
    expect(buildCausalChain(lines, "not-exist")).toEqual([]);
    expect(buildCausalChain([], "main")).toEqual([]);
    expect(buildCausalChain(undefined as any, "main")).toEqual([]);
  });
});

describe("v1.9 withNarrativeRoles（叙事角色映射）", () => {
  const nodes = [
    { event: { id: "e1" }, lineTitle: "主线", lineType: "main", isMain: true },
    { event: { id: "e2" }, lineTitle: "支线", lineType: "side", isMain: false },
  ];
  const SID = "main";

  it("无标注时所有节点 role=null", () => {
    const out = withNarrativeRoles(nodes, SID, {});
    expect(out.every((n) => n.role === null)).toBe(true);
    expect(out).toHaveLength(2);
  });

  it("按 `${selectedId}:${eventId}` 精确映射角色，其他节点不受影响", () => {
    const out = withNarrativeRoles(nodes, SID, { [`${SID}:e1`]: "advance", [`${SID}:e2`]: "vote" });
    expect(out.find((n) => n.event.id === "e1")!.role).toBe("advance");
    expect(out.find((n) => n.event.id === "e2")!.role).toBe("vote");
  });

  it("非法角色值被忽略为 null（防御脏数据）", () => {
    const out = withNarrativeRoles(nodes, SID, { [`${SID}:e1`]: "hack" });
    expect(out.find((n) => n.event.id === "e1")!.role).toBeNull();
  });

  it("空/异常输入安全", () => {
    expect(withNarrativeRoles(undefined as any, SID, {})).toEqual([]);
    expect(withNarrativeRoles(nodes, SID, undefined as any).every((n) => n.role === null)).toBe(true);
  });

  it("NARRATIVE_ROLES 含三种角色", () => {
    expect(NARRATIVE_ROLES).toEqual(["advance", "probe", "vote"]);
  });
});
