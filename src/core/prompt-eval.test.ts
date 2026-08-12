import { describe, it, expect } from "vitest";
import {
  PROMPT_EVAL_FIXTURE,
  buildBaselinePrompt,
  evaluatePromptVersions,
  evaluatePromptVersionAgainstBaseline,
} from "@/core/prompt-eval";

describe("prompt 评测集 (#320 / P2 #10 第三要素)", () => {
  it("baseline 包含所有期望要素（作品/角色/世界书/风格 四大块不丢）", () => {
    const base = buildBaselinePrompt();
    for (const token of PROMPT_EVAL_FIXTURE.expectedTokens) {
      expect(base, `基线应含要素「${token}」`).toContain(token);
    }
  });

  it("稳定版本 evaluate 返回 stable=true 且 hash 一致", () => {
    const base = buildBaselinePrompt();
    const report = evaluatePromptVersions(base);
    expect(report.stable).toBe(true);
    expect(report.matched).toBe(report.total);
    expect(report.missing).toEqual([]);
    expect(report.hashCurrent).toBe(report.hashBaseline);
  });

  it("人为丢失一个角色名 → 检出 missing 且 stable=false", () => {
    const base = buildBaselinePrompt();
    const broken = base.replace("测主角", "某路人");
    const report = evaluatePromptVersions(broken);
    expect(report.missing).toContain("测主角");
    expect(report.stable).toBe(false);
  });

  it("丢失世界书要素 → 检出（守护历史上 sync 静默丢世界卡的痛点）", () => {
    const base = buildBaselinePrompt();
    const broken = base.replace("**基准世界法则**", "**被改**");
    const report = evaluatePromptVersions(broken);
    expect(report.missing).toContain("**基准世界法则**");
    expect(report.stable).toBe(false);
  });

  it("evaluatePromptVersionAgainstBaseline 便捷方法等价", () => {
    const base = buildBaselinePrompt();
    expect(evaluatePromptVersionAgainstBaseline(base).stable).toBe(true);
  });
});
