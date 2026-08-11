import { describe, it, expect } from "vitest";
import { analyzeContentSafety, buildCustomSafetyRules } from "./content-safety";

describe("analyzeContentSafety", () => {
  it("空文本通过且满分", () => {
    const r = analyzeContentSafety("");
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
    expect(r.issues).toHaveLength(0);
  });

  it("干净文本无风险", () => {
    const r = analyzeContentSafety("他抬起头，望向远方的山峦，心里升起一丝暖意。");
    expect(r.issues).toHaveLength(0);
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
  });

  it("检出高风险暴力（灭门）不计通过", () => {
    const r = analyzeContentSafety("一夜之间，仇家将满门屠城灭门，血流成河。");
    expect(r.passed).toBe(false);
    expect(r.issues.some((i) => i.category === "violence" && i.severity === "high")).toBe(true);
    expect(r.score).toBeLessThan(100);
  });

  it("检出中风险血腥并给出上下文片段", () => {
    const r = analyzeContentSafety("刀光闪过，对方已是血肉模糊，倒在地上不再动弹。");
    const hit = r.issues.find((i) => i.matched === "血肉模糊");
    expect(hit).toBeTruthy();
    expect(hit!.snippet).toContain("血肉模糊");
    expect(hit!.suggestion.length).toBeGreaterThan(0);
  });

  it("检出高风险色情并阻断通过", () => {
    const r = analyzeContentSafety("两人强行发生关系，场面不堪入目。");
    expect(r.passed).toBe(false);
    expect(r.issues.some((i) => i.category === "sexual" && i.severity === "high")).toBe(true);
  });

  it("检出违法违禁（制毒）", () => {
    const r = analyzeContentSafety("他在地下室悄悄制毒贩毒，利润惊人。");
    expect(r.issues.some((i) => i.category === "illegal" && i.severity === "high")).toBe(true);
  });

  it("检出仇恨歧视高风险", () => {
    const r = analyzeContentSafety("那人骂道：你们这群贱种，天生下等。");
    expect(r.passed).toBe(false);
    expect(r.issues.some((i) => i.category === "hate")).toBe(true);
  });

  it("低风险提示仍计 passed（仅低危）", () => {
    const r = analyzeContentSafety("他低头看见地上的血迹，心中一紧。");
    // 血迹为低危，不阻断
    expect(r.passed).toBe(true);
    expect(r.issues.every((i) => i.severity === "low")).toBe(true);
  });

  it("严重度越高扣分越多（高分差）", () => {
    const high = analyzeContentSafety("灭门屠城");
    const low = analyzeContentSafety("一点血迹");
    expect(high.score).toBeLessThan(low.score);
  });

  it("同词同上下文去重", () => {
    const r = analyzeContentSafety("血肉模糊的地方血肉模糊还在。");
    const matched = r.issues.filter((i) => i.matched === "血肉模糊");
    expect(matched.length).toBe(1);
  });

  it("合并用户增量黑名单并标记来源", () => {
    const r = analyzeContentSafety("他忽然念出禁语：咕噜咕噜。", [
      { id: "u1", pattern: "咕噜咕噜", category: "illegal", severity: "high", suggestion: "自定义禁语" },
    ]);
    const hit = r.issues.find((i) => i.matched === "咕噜咕噜");
    expect(hit).toBeTruthy();
    expect(hit!.source).toBe("custom");
    expect(r.ruleStats?.custom).toBe(1);
    expect(r.ruleStats?.baseline).toBeGreaterThan(0);
  });

  it("用户黑名单不替换默认基线", () => {
    const r = analyzeContentSafety("满门屠城灭门，还念出咕噜咕噜。", [
      { id: "u1", pattern: "咕噜咕噜", category: "illegal", severity: "high" },
    ]);
    expect(r.issues.some((i) => i.matched === "屠城" || i.matched === "灭门")).toBe(true);
    expect(r.issues.some((i) => i.matched === "咕噜咕噜")).toBe(true);
  });

  it("buildCustomSafetyRules 丢弃非法项", () => {
    const out = buildCustomSafetyRules([
      { id: "a", pattern: "abc", category: "illegal", severity: "high" },
      { pattern: "", category: "illegal", severity: "high" }, // 空 pattern
      { id: "b", pattern: "xyz", category: "nope", severity: "high" }, // 非法分类
      "garbage",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].pattern).toBe("abc");
  });
});
