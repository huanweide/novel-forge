import { describe, it, expect } from "vitest";
import { applyTargetedFixReplacement } from "@/lib/targeted-fix";

describe("applyTargetedFixReplacement 精准修复局部替换", () => {
  const existing = "从前有座山，山里有座庙。庙里有个老和尚在讲故事。老和尚说：从前有座山。";

  it("命中唯一锚点：精确替换", () => {
    const sel = "庙里有个老和尚在讲故事";
    const rep = "庙里有个小和尚在念经";
    const r = applyTargetedFixReplacement(existing, sel, rep);
    expect(r.ok).toBe(true);
    expect(r.content).toBe(existing.replace(sel, rep));
    expect(r.replacement).toBe(rep);
  });

  it("命中重复锚点：取首次出现，不误伤其余", () => {
    const sel = "从前有座山";
    const rep = "从前有片海";
    const r = applyTargetedFixReplacement(existing, sel, rep);
    expect(r.ok).toBe(true);
    expect(r.content).toBe("从前有片海，山里有座庙。庙里有个老和尚在讲故事。老和尚说：从前有座山。");
  });

  it("锚点未命中：回退保留原文 + 告警", () => {
    const r = applyTargetedFixReplacement(existing, "庙里有个仙女", "庙里有个仙女在跳舞");
    expect(r.ok).toBe(false);
    expect(r.warning).toContain("未在正文中精确匹配");
    expect(r.content).toBeUndefined();
  });

  it("选中原文为空：回退 + 告警", () => {
    const r = applyTargetedFixReplacement(existing, "", "改写");
    expect(r.ok).toBe(false);
    expect(r.warning).toContain("缺少选中原文锚点");
  });

  it("替换片段过短（空/几乎未生成）：回退 + 告警", () => {
    const r = applyTargetedFixReplacement(existing, "庙里有个老和尚在讲故事", "  ");
    expect(r.ok).toBe(false);
    expect(r.warning).toContain("替换片段过短");
  });

  it("替换片段显著短于选中（低于 20%）：判定无效回退", () => {
    const sel = "庙里有个老和尚在讲故事。老和尚说：从前有座山。";
    const r = applyTargetedFixReplacement(existing, sel, "略");
    expect(r.ok).toBe(false);
    expect(r.warning).toContain("替换片段过短");
  });
});
