import { describe, it, expect } from "vitest";
import { computeAutoRate, countAutoConfirmed } from "@/core/auto-rate";

describe("computeAutoRate（监控自动放行率）", () => {
  it("无已确认章时 autoRate=0", () => {
    const r = computeAutoRate([
      { status: "drafting", reviewLogs: [] },
      { status: "pending_confirm", reviewLogs: [] },
    ]);
    expect(r.autoConfirmed).toBe(0);
    expect(r.autoRate).toBe(0);
  });

  it("全部由 auto-confirm 放行 → 100%", () => {
    const r = computeAutoRate([
      { status: "confirmed", reviewLogs: [{ action: "auto-confirm" }] },
      { status: "confirmed", reviewLogs: [{ action: "auto-confirm" }] },
    ]);
    expect(r.autoConfirmed).toBe(2);
    expect(r.autoRate).toBe(100);
  });

  it("部分 auto-confirm → 比例四舍五入正确", () => {
    const r = computeAutoRate([
      { status: "confirmed", reviewLogs: [{ action: "auto-confirm" }] },
      { status: "confirmed", reviewLogs: [{ action: "manual-confirm" }] },
      { status: "confirmed", reviewLogs: [] },
    ]);
    expect(r.autoConfirmed).toBe(1);
    expect(r.autoRate).toBe(33); // round(1/3*100)=33
  });

  it("reviewLogs 非数组不误判为自动放行", () => {
    const r = computeAutoRate([
      { status: "confirmed", reviewLogs: null },
      { status: "confirmed", reviewLogs: "not-an-array" },
    ]);
    expect(r.autoConfirmed).toBe(0);
    expect(r.autoRate).toBe(0);
  });

  it("countAutoConfirmed 仅统计 confirmed + auto-confirm", () => {
    const n = countAutoConfirmed([
      { status: "confirmed", reviewLogs: [{ action: "auto-confirm" }] },
      { status: "confirmed", reviewLogs: [{ action: "auto-confirm", extra: 1 }] },
      { status: "pending_confirm", reviewLogs: [{ action: "auto-confirm" }] },
      { status: "confirmed", reviewLogs: [{ action: "manual" }] },
    ]);
    expect(n).toBe(2);
  });
});
