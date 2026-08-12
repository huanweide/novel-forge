import { describe, it, expect } from "vitest";
import { classifyTruncation } from "@/core/finish-reason";

describe("classifyTruncation（F1 截断判定单一真相）", () => {
  it("非 length 截断信号不触发截断", () => {
    expect(classifyTruncation(undefined, 1000, 1000).truncated).toBe(false);
    expect(classifyTruncation("stop", 1000, 1000).truncated).toBe(false);
  });

  it("length 且字数充足 → 截断 + 普通告警（不含「明显不足」）", () => {
    const r = classifyTruncation("length", 900, 1000);
    expect(r.truncated).toBe(true);
    expect(r.warning).toContain("截断");
    expect(r.warning).not.toContain("明显不足");
  });

  it("length 且字数明显不足（<60% 预算）→ 截断 + 不足告警", () => {
    const r = classifyTruncation("length", 100, 1000);
    expect(r.truncated).toBe(true);
    expect(r.warning).toContain("明显不足");
  });

  it("阈值边界：恰好 60% 预算不算「明显不足」", () => {
    const r = classifyTruncation("length", 600, 1000);
    expect(r.truncated).toBe(true);
    expect(r.warning).not.toContain("明显不足");
  });
});
