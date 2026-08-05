// confirm-guard 共享护栏单元测试（Max Loop Round1·Step2）
// 锁住「单一质量阈值真相」：evaluateConfirmEligibility 分支矩阵 + gradeOf 边界 + 空文本佐证。
// 跑法：npx vitest run src/core/confirm-guard.test.ts

import { describe, it, expect } from "vitest";
import {
  evaluateConfirmEligibility,
  gradeOf,
  QUALITY_PASS_THRESHOLD,
} from "./confirm-guard";

const GOOD_TEXT =
  "林澈站在灯塔下，想起父亲的话。海不会背叛，只会沉默。潮水漫过脚踝，他握紧口袋里生锈的钥匙，推开铁门，门后是通向海床的螺旋阶梯。灯光熄灭，阶梯尽头有人低声唤他的名字。";
const LONG_TEXT = "长正文".repeat(30); // 90 字 > 50

describe("gradeOf", () => {
  it("分级边界：null/A/85/B/70/C/60/D/59", () => {
    expect(gradeOf(null)).toBeNull();
    expect(gradeOf(85)).toBe("A");
    expect(gradeOf(70)).toBe("B");
    expect(gradeOf(60)).toBe("C");
    expect(gradeOf(59)).toBe("D");
  });
});

describe("evaluateConfirmEligibility", () => {
  it("空正文直接拦截——即使 qualityScore 伪造 90 分也不放行", () => {
    const r = evaluateConfirmEligibility({ content: "", qualityScore: 90 });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/空|短/);
  });

  it("过短正文（<50 字）拦截", () => {
    const r = evaluateConfirmEligibility({ content: "你好世界。", qualityScore: 80 });
    expect(r.eligible).toBe(false);
  });

  it("qualityScore 非 null 时采信：60 放行、59 拦截（阈值边界）", () => {
    expect(evaluateConfirmEligibility({ content: LONG_TEXT, qualityScore: 60 }).eligible).toBe(true);
    expect(evaluateConfirmEligibility({ content: LONG_TEXT, qualityScore: 59 }).eligible).toBe(false);
  });

  it("qualityScore=null 回退本地 analyzeQuality：优质长文应达标放行", () => {
    const r = evaluateConfirmEligibility({ content: GOOD_TEXT, qualityScore: null });
    expect(r.eligible).toBe(true);
    expect(r.score).not.toBeNull();
    expect(r.score!).toBeGreaterThanOrEqual(QUALITY_PASS_THRESHOLD);
  });

  it("requirePassed=false 跳过护栏（旁路语义保留）", () => {
    const r = evaluateConfirmEligibility({ content: "", qualityScore: null }, [], false);
    expect(r.eligible).toBe(true);
  });

  it("非有限分数（NaN/Infinity）不采信：回退本地重算，杜绝 NaN<60 恒 false 绕过拦截", () => {
    const r = evaluateConfirmEligibility({ content: GOOD_TEXT, qualityScore: NaN });
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.eligible).toBe(true);
  });
});

describe("analyzer 空文本佐证（费曼：不能只靠分数拦空正文）", () => {
  it("即使 analyzer 对空文本可能给高分，evaluate 的空正文拦截仍是必要防线", async () => {
    const { analyzeQuality } = await import("@/lib/quality-analyzer");
    const r = analyzeQuality("", []);
    // 佐证：空文本分数（若 ≥60 则证明「分数拦截」不可依赖，必须靠空正文显式拦截）
    const ev = evaluateConfirmEligibility({ content: "", qualityScore: r.overallScore });
    expect(ev.eligible).toBe(false);
  });
});
