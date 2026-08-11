/**
 * quality-aggregate — 质量总分聚合（2.0 P0-2）
 *
 * 把「废词检测 / 逻辑自查 / 审校」三项独立质检结果聚合成一个总状态。
 * 铁律：任一项 fail 即整体 fail（写作护栏不可被单项高分别名掩盖）。
 * 纯函数，无副作用，便于单测；后端三项仍各自独立（不合并 mega-prompt）。
 */

import type { ForbiddenScanResult, LogicScanResult } from "./types";

export type GateStatus = "pass" | "fail" | "pending";

export interface QualityGate {
  key: "forbidden" | "logic" | "review";
  label: string;
  status: GateStatus;
}

export interface QualityAggregate {
  gates: QualityGate[];
  /** 任一项 fail → fail；全部 pass → pass；否则（部分未跑）→ pending */
  overall: "pass" | "fail" | "pending";
  /** 综合质量分 0-100；pending 时为 null；fail 时给出低分提示 */
  score: number | null;
}

function statusOf(passed: boolean | undefined | null): GateStatus {
  if (passed === true) return "pass";
  if (passed === false) return "fail";
  return "pending";
}

export function aggregateQuality(
  forbidden: ForbiddenScanResult | null,
  logic: LogicScanResult | null,
  review: { passed: boolean; issues: unknown[] } | null,
): QualityAggregate {
  const gates: QualityGate[] = [
    { key: "forbidden", label: "废词检测", status: statusOf(forbidden?.passed) },
    { key: "logic", label: "逻辑自查", status: statusOf(logic?.passed) },
    { key: "review", label: "审校", status: statusOf(review?.passed) },
  ];

  const failed = gates.some((g) => g.status === "fail");
  const allPass = gates.every((g) => g.status === "pass");

  let overall: QualityAggregate["overall"];
  let score: number | null;
  if (failed) {
    overall = "fail";
    // 有项失败时给低分：废词分若存在则压到 59 以下以体现未达标，否则 0
    score = forbidden?.qualityScore != null ? Math.min(forbidden.qualityScore, 59) : 0;
  } else if (allPass) {
    overall = "pass";
    score = forbidden?.qualityScore != null ? forbidden.qualityScore : 100;
  } else {
    overall = "pending";
    score = null;
  }

  return { gates, overall, score };
}
