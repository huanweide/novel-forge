/**
 * auto-rate.ts 单元测试（自动放行率 / 监测统计单一真相源）
 * 锁死：从监测统计里独立出来的自动审定计数与百分比计算，纯函数、无 DB。
 * 覆盖：已确认章中 auto-confirm 计数、百分比（含除零保护）。
 */
import { describe, it, expect } from "vitest";
import { STATUS_CONFIRMED } from "./story-status";
import { countAutoConfirmed, computeAutoRate } from "./auto-rate";

describe("countAutoConfirmed", () => {
  it("已确认且 reviewLogs 含 auto-confirm → 计数", () => {
    expect(
      countAutoConfirmed([
        { status: STATUS_CONFIRMED, reviewLogs: [{ action: "auto-confirm" }] },
      ]),
    ).toBe(1);
  });

  it("已确认但 reviewLogs 无 auto-confirm → 不计", () => {
    expect(
      countAutoConfirmed([
        { status: STATUS_CONFIRMED, reviewLogs: [{ action: "manual" }] },
      ]),
    ).toBe(0);
  });

  it("已确认但 reviewLogs 非数组 → 不计", () => {
    expect(countAutoConfirmed([{ status: STATUS_CONFIRMED, reviewLogs: "x" }])).toBe(0);
  });

  it("已确认但无 reviewLogs → 不计", () => {
    expect(countAutoConfirmed([{ status: STATUS_CONFIRMED }])).toBe(0);
  });

  it("非确认状态即使有 auto-confirm → 不计", () => {
    expect(
      countAutoConfirmed([{ status: "drafting", reviewLogs: [{ action: "auto-confirm" }] }]),
    ).toBe(0);
  });

  it("混合列表仅统计「已确认且含 auto-confirm」", () => {
    expect(
      countAutoConfirmed([
        { status: STATUS_CONFIRMED, reviewLogs: [{ action: "auto-confirm" }] },
        { status: STATUS_CONFIRMED, reviewLogs: [{ action: "manual" }] },
        { status: "drafting", reviewLogs: [{ action: "auto-confirm" }] },
        { status: STATUS_CONFIRMED, reviewLogs: [{ action: "auto-confirm" }, { action: "x" }] },
      ]),
    ).toBe(2);
  });
});

describe("computeAutoRate", () => {
  it("无已确认章 → autoRate 0（除零保护）", () => {
    expect(computeAutoRate([{ status: "drafting" }, {}])).toEqual({
      autoConfirmed: 0,
      autoRate: 0,
    });
  });

  it("已确认章部分自动 → 正确百分比", () => {
    expect(
      computeAutoRate([
        { status: STATUS_CONFIRMED, reviewLogs: [{ action: "auto-confirm" }] },
        { status: STATUS_CONFIRMED, reviewLogs: [{ action: "manual" }] },
      ]),
    ).toEqual({ autoConfirmed: 1, autoRate: 50 });
  });

  it("已确认章全部自动 → 100", () => {
    expect(
      computeAutoRate([
        { status: STATUS_CONFIRMED, reviewLogs: [{ action: "auto-confirm" }] },
        { status: STATUS_CONFIRMED, reviewLogs: [{ action: "auto-confirm" }] },
        { status: STATUS_CONFIRMED, reviewLogs: [{ action: "auto-confirm" }] },
      ]),
    ).toEqual({ autoConfirmed: 3, autoRate: 100 });
  });

  it("空列表 → 0/0，不抛除零", () => {
    expect(computeAutoRate([])).toEqual({ autoConfirmed: 0, autoRate: 0 });
  });
});
