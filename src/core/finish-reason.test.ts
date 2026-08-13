/**
 * finish-reason.ts 单元测试（生成截断判定 / F1 修复·Max Loop 审查）
 * 锁死：write 与 continue 两条路径共用的「max_tokens 截断→草稿回退+告警」纯函数判定，
 * 零副作用、不触 DB。覆盖 finishReason 分支 + 字数不足强告警阈值（预算 60%）。
 */
import { describe, it, expect } from "vitest";
import { classifyTruncation } from "./finish-reason";

describe("classifyTruncation", () => {
  it("finishReason 非 length → 不截断", () => {
    expect(classifyTruncation("stop", 100, 1000)).toEqual({ truncated: false });
    expect(classifyTruncation("content_filter", 0, 1000)).toEqual({ truncated: false });
    expect(classifyTruncation(undefined, 0, 1000)).toEqual({ truncated: false });
    expect(classifyTruncation("", 0, 1000)).toEqual({ truncated: false });
  });

  it("length 且字数明显不足（< 预算60%）→ 强告警并保留草稿", () => {
    // targetWords=1000 → 阈值 ceil(600)=600；contentLength=300 < 600
    const r = classifyTruncation("length", 300, 1000);
    expect(r.truncated).toBe(true);
    expect(r.warning).toContain("字数明显不足");
    expect(r.warning).toContain("继续生成");
  });

  it("length 且字数达标（>= 预算60%）→ 普通告警", () => {
    // contentLength=600 === 阈值（不含不足分支）
    const r = classifyTruncation("length", 600, 1000);
    expect(r.truncated).toBe(true);
    expect(r.warning).not.toContain("字数明显不足");
    expect(r.warning).toContain("继续生成");
  });

  it("length 且远超预算 → 普通告警（不报不足）", () => {
    const r = classifyTruncation("length", 1500, 1000);
    expect(r.truncated).toBe(true);
    expect(r.warning).not.toContain("字数明显不足");
  });

  it("阈值边界：恰好 60% 不算不足（走普通告警）", () => {
    // targetWords=500 → ceil(300)=300；contentLength=300 等于阈值，不含不足分支
    const r = classifyTruncation("length", 300, 500);
    expect(r.warning).not.toContain("字数明显不足");
  });

  it("阈值边界：低于 60% 才报不足", () => {
    const r = classifyTruncation("length", 299, 500); // 299 < 300
    expect(r.warning).toContain("字数明显不足");
  });
});
