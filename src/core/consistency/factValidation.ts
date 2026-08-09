/**
 * 一致性事实输入校验（Next-2 手动纠错共用纯函数）。
 *
 * 把「新建 / 编辑事实」的字段校验抽成纯函数，便于路由复用与单测锁死，
 * 避免把校验逻辑散落在两个路由里各自写一遍（DRY + 可测）。
 */

import type { ConsistencyCategory } from "@/core/consistency/extractFacts";

export const FACT_CATEGORIES: ConsistencyCategory[] = [
  "character",
  "world",
  "plot",
  "relationship",
];

export interface FactInput {
  category?: string;
  subject?: string;
  attribute?: string;
  value?: string;
  source?: string;
  confidence?: number;
}

export interface FactValidationResult {
  ok: boolean;
  error?: string;
  data?: {
    category: ConsistencyCategory;
    subject: string;
    attribute: string;
    value: string;
    source: string;
    confidence: number;
  };
}

const nonEmpty = (s: unknown): s is string =>
  typeof s === "string" && s.trim().length > 0;

/**
 * 校验一条事实输入。
 * @param input   原始请求体（可能缺字段 / 类型错）
 * @param opts.allowPartial  true=编辑（允许只传要改的字段，其余沿用原值）；
 *                           false=新建（subject/attribute/value 必填）。
 * @param current 编辑时的当前事实（allowPartial 时缺字段取 current 值）。
 */
export function validateFactInput(
  input: FactInput,
  opts: { allowPartial: boolean; current?: FactInput } = { allowPartial: false },
): FactValidationResult {
  const cur = opts.current ?? {};

  // category：可选，给了必须是合法枚举
  let category = input.category ?? cur.category;
  if (category !== undefined) {
    if (!FACT_CATEGORIES.includes(category as ConsistencyCategory)) {
      return { ok: false, error: `category 非法：${category}` };
    }
  } else if (!opts.allowPartial) {
    return { ok: false, error: "category 必填" };
  }

  // subject / attribute / value：新建必填；编辑时缺则沿用 current
  const subject = nonEmpty(input.subject) ? input.subject!.trim() : cur.subject?.trim();
  const attribute = nonEmpty(input.attribute) ? input.attribute!.trim() : cur.attribute?.trim();
  const value = nonEmpty(input.value) ? input.value!.trim() : cur.value?.trim();

  if (!opts.allowPartial || cur.subject !== undefined) {
    if (!subject) return { ok: false, error: "subject 必填且不能为空" };
  }
  if (!opts.allowPartial || cur.attribute !== undefined) {
    if (!attribute) return { ok: false, error: "attribute 必填且不能为空" };
  }
  if (!opts.allowPartial || cur.value !== undefined) {
    if (!value) return { ok: false, error: "value 必填且不能为空" };
  }

  // confidence：可选，必须是 0~1 的数值
  let confidence = cur.confidence;
  if (input.confidence !== undefined) {
    const c = Number(input.confidence);
    if (!Number.isFinite(c) || c < 0 || c > 1) {
      return { ok: false, error: "confidence 必须是 0~1 的数值" };
    }
    confidence = c;
  }
  if (confidence === undefined) confidence = 1.0;

  const source = (nonEmpty(input.source) ? input.source!.trim() : cur.source?.trim()) ?? "";

  return {
    ok: true,
    data: {
      category: (category as ConsistencyCategory) ?? "character",
      subject: subject!,
      attribute: attribute!,
      value: value!,
      source,
      confidence,
    },
  };
}
