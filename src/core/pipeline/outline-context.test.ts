import { describe, it, expect } from "vitest";
import {
  filterActiveStorylines,
  getCompletedMainIds,
  formatStorylines,
  isRehangTargetActiveMain,
  pickReassignMainId,
} from "./outline-context";

describe("N1 filterActiveStorylines（死过滤修复）", () => {
  it("不再依赖不存在的 completed 字段，按真实 status 排除终态线", () => {
    const storylines = [
      { id: "a", type: "main", status: "active", title: "活跃主线" },
      { id: "b", type: "side", status: "active", title: "活跃支线" },
      { id: "c", type: "main", status: "completed", title: "已完结主线" },
      { id: "d", type: "side", status: "abandoned", title: "废弃支线" },
    ];
    const got = filterActiveStorylines(storylines);
    const ids = got.map((s: any) => s.id).sort();
    expect(ids).toEqual(["a", "b"]); // completed / abandoned 被排除
  });

  it("旧死过滤(!s.completed) 会全部保留——新实现必须与之不同", () => {
    const storylines = [
      { id: "c", type: "main", status: "completed", title: "已完结主线" },
      { id: "d", type: "side", status: "abandoned", title: "废弃支线" },
    ];
    // 旧写法恒为真，会全保留；新实现应全部排除
    const deadFilter = storylines.filter((s: any) => !s?.completed).map((s: any) => s.id);
    const fixed = filterActiveStorylines(storylines).map((s: any) => s.id);
    expect(deadFilter).toEqual(["c", "d"]); // 证明旧写法有问题
    expect(fixed).toEqual([]); // 证明新写法修复
  });

  it("非数组/空输入不报错", () => {
    expect(filterActiveStorylines(undefined as any)).toEqual([]);
    expect(filterActiveStorylines([])).toEqual([]);
  });
});

describe("N4 getCompletedMainIds（旧支线重挂选择）", () => {
  it("只识别 type=main 且 status=completed 的线", () => {
    const storylines = [
      { id: "old", type: "main", status: "completed" },
      { id: "new", type: "main", status: "active" },
      { id: "side", type: "side", status: "completed" },
    ];
    expect(getCompletedMainIds(storylines)).toEqual(["old"]);
  });

  it("空/异常输入安全", () => {
    expect(getCompletedMainIds(undefined as any)).toEqual([]);
    expect(getCompletedMainIds([])).toEqual([]);
  });
});

describe("R2-006 formatStorylines（隶属前缀随父线状态）", () => {
  it("支线 parentId 命中活跃主线时标注「隶属主线」", () => {
    const out = formatStorylines([
      { id: "m", type: "main", status: "active", title: "主战", desire: "x" },
      { id: "s", type: "side", status: "active", title: "支线A", parentId: "m" },
    ]);
    expect(out).toContain("（隶属主线 主战）");
  });

  it("N4 目标验证：重挂后（parentId 指向活跃主线）支线恢复隶属前缀", () => {
    // 模拟 newMain 重挂后的数据状态：旧支线 parentId 改为新活跃主线
    const afterRehang = [
      { id: "newMain", type: "main", status: "active", title: "新主线" },
      { id: "oldSide", type: "side", status: "active", title: "旧支线", parentId: "newMain" },
    ];
    const out = formatStorylines(afterRehang);
    expect(out).toContain("（隶属主线 新主线）");
  });
});

describe("N8 isRehangTargetActiveMain（重挂目标绝不指向 completed 主线）", () => {
  const existing = [
    { id: "activeMain", type: "main", status: "active" },
    { id: "doneMain", type: "main", status: "completed" },
    { id: "abandonedMain", type: "main", status: "abandoned" },
  ];

  it("mainId 为已存在活跃主线 → 允许重挂", () => {
    expect(isRehangTargetActiveMain("activeMain", existing)).toBe(true);
  });

  it("mainId 为已存在 completed 主线 → 拒绝重挂（N8 回归防线）", () => {
    expect(isRehangTargetActiveMain("doneMain", existing)).toBe(false);
  });

  it("R4-NEW-1：mainId 为已存在 abandoned 主线 → 拒绝重挂（与 completed 同构，避免 N8 前缀丢失复现）", () => {
    expect(isRehangTargetActiveMain("abandonedMain", existing)).toBe(false);
  });

  it("mainId 不在 existing 快照中（本轮新建主线，默认 active）→ 允许重挂（不回退 N4 新建行为）", () => {
    expect(isRehangTargetActiveMain("brandNewMain", existing)).toBe(true);
  });

  it("mainId 为 null → 拒绝重挂", () => {
    expect(isRehangTargetActiveMain(null, existing)).toBe(false);
  });

  it("existing 异常/空 → 视为新建主线，放行", () => {
    expect(isRehangTargetActiveMain("x", undefined as any)).toBe(true);
    expect(isRehangTargetActiveMain("x", [])).toBe(true);
  });
});

describe("N8 pickReassignMainId（删除主线时只选活跃兄弟主线）", () => {
  it("存在活跃兄弟主线 → 返回其 id（保留 N3 级联隶属 + R2-006 前缀）", () => {
    const siblings = [
      { id: "a", status: "completed" },
      { id: "b", status: "active" },
    ];
    expect(pickReassignMainId(siblings)).toBe("b");
  });

  it("只剩 completed 兄弟主线 → 返回 null（绝不挂 completed，避免 N8 前缀丢失）", () => {
    const siblings = [
      { id: "a", status: "completed" },
      { id: "c", status: "abandoned" },
    ];
    expect(pickReassignMainId(siblings)).toBeNull();
  });

  it("无任何兄弟主线 → 返回 null", () => {
    expect(pickReassignMainId([])).toBeNull();
    expect(pickReassignMainId(undefined as any)).toBeNull();
  });
});
