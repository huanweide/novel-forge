/**
 * assembly/tokenizer.ts 单元测试（Prompt 预算管理根基 / 用 gpt-tokenizer 精确计数）
 * 锁死：空串→0、多段累加、超长截断（头/尾保留）、人类可读用量格式化。
 * 纯函数、零 DB；gpt-tokenizer 已在 node 环境验证可 import 与编解码，无需 mock。
 */
import { describe, it, expect } from "vitest";
import { countTokens, countTotalTokens, truncateByTokens, formatTokenUsage } from "./tokenizer";

describe("countTokens", () => {
  it("空串 → 0", () => {
    expect(countTokens("")).toBe(0);
  });
  it("非空文本 → 正数 token 数", () => {
    expect(countTokens("hello world")).toBeGreaterThan(0);
    expect(countTokens("瑞宝宝")).toBeGreaterThan(0);
  });
});

describe("countTotalTokens", () => {
  it("多段累加等于逐段之和", () => {
    const a = "hello";
    const b = "world";
    expect(countTotalTokens(a, b)).toBe(countTokens(a) + countTokens(b));
  });
  it("含空段不影响", () => {
    expect(countTotalTokens("hello", "")).toBe(countTokens("hello"));
  });
  it("无参数 → 0", () => {
    expect(countTotalTokens()).toBe(0);
  });
});

describe("truncateByTokens", () => {
  const LONG =
    "这是一段很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长的测试文本用于验证截断逻辑是否生效并且 token 数量被控制在阈值之内避免超出模型上下文窗口导致生成失败";

  it("maxTokens >= 实际 → 原样返回", () => {
    const text = "hello world foo bar";
    expect(truncateByTokens(text, 100)).toBe(text);
  });
  it("maxTokens < 实际 → 截断后 token 数 <= 阈值", () => {
    const r = truncateByTokens(LONG, 5);
    expect(countTokens(r)).toBeLessThanOrEqual(5);
  });
  it("fromEnd=true → 保留末尾最多 maxTokens", () => {
    const r = truncateByTokens(LONG, 4, true);
    expect(countTokens(r)).toBeLessThanOrEqual(4);
    // 末尾片段应仍出现在原文本中（保留尾部语义）
    expect(LONG).toContain(r.slice(-3));
  });
});

describe("formatTokenUsage", () => {
  it("正常比例格式化为百分比", () => {
    expect(formatTokenUsage(50, 100)).toBe("50 / 100 (50.0%)");
  });
  it("小数百分比保留一位", () => {
    expect(formatTokenUsage(1, 3)).toBe("1 / 3 (33.3%)");
  });
  it("used=0 → 0.0%（total>0 不除零）", () => {
    expect(formatTokenUsage(0, 100)).toBe("0 / 100 (0.0%)");
  });
});
