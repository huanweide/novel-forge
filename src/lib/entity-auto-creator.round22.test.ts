import { describe, it, expect } from "vitest";
import { normalizeDiscoveryName, resolveDiscoveryMergeTarget } from "./entity-auto-creator";

describe("round-22 normalizeDiscoveryName（入库即清洗发现标记）", () => {
  it("strips 🆕自动发现 marker", () => {
    expect(normalizeDiscoveryName("韩姓男子 🆕 自动发现")).toEqual({ name: "韩姓男子", hadMarker: true });
  });
  it("strips 待审 prefix/suffix and 🆕 auto-discovery", () => {
    expect(normalizeDiscoveryName("待审 迭戈·美第奇 🆕 自动发现 待审")).toEqual({
      name: "迭戈·美第奇",
      hadMarker: true,
    });
  });
  it("keeps a clean name untouched", () => {
    expect(normalizeDiscoveryName("樊斯瑞")).toEqual({ name: "樊斯瑞", hadMarker: false });
  });
  it("returns empty + hadMarker when only markers remain", () => {
    expect(normalizeDiscoveryName("🆕 自动发现")).toEqual({ name: "", hadMarker: true });
  });
});

describe("round-22 resolveDiscoveryMergeTarget（自动发现阶段实时别名合并）", () => {
  it("merges two honorific variants：韩姓男子 + 韩先生 → 韩姓男子", () => {
    expect(resolveDiscoveryMergeTarget(["韩姓男子"], "韩先生")).toBe("韩姓男子");
  });
  it("merges 迭戈 + 迭戈先生 → 迭戈", () => {
    expect(resolveDiscoveryMergeTarget(["迭戈"], "迭戈先生")).toBe("迭戈");
  });
  it("refuses ambiguous same-surname：韩立/韩雪 + 韩先生 → null（不误并）", () => {
    expect(resolveDiscoveryMergeTarget(["韩立", "韩雪"], "韩先生")).toBeNull();
  });
  it("does NOT merge pseudo (·) names either direction", () => {
    expect(resolveDiscoveryMergeTarget(["迭戈·美第奇"], "迭戈")).toBeNull();
    expect(resolveDiscoveryMergeTarget(["迭戈"], "迭戈·美第奇")).toBeNull();
  });
  it("merges single-char abbreviation when a unique same-surname plain exists：樊 + 樊斯瑞", () => {
    expect(resolveDiscoveryMergeTarget(["樊斯瑞"], "樊")).toBe("樊斯瑞");
  });
  it("does NOT merge single-char when no same-surname candidate（避免误建变体主卡）", () => {
    expect(resolveDiscoveryMergeTarget([], "樊")).toBeNull();
    expect(resolveDiscoveryMergeTarget(["叶凌云"], "樊")).toBeNull();
  });
  it("plain names do not route through this function", () => {
    expect(resolveDiscoveryMergeTarget(["韩立"], "韩雪")).toBeNull();
  });
});
