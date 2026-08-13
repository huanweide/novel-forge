/**
 * Token 计数器 —— Prompt 预算管理的根基
 *
 * 用 gpt-tokenizer 做精确计数。
 * DeepSeek 用的 tokenizer 跟 GPT-4 基本一致（cl100k_base），所以可以直接复用。
 * 如果换其他模型，需要换对应的 tokenizer。
 */

import { encode, decode } from "gpt-tokenizer";

/**
 * 计算一段文本的 Token 数量
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}

/**
 * 计算多段文本的总 Token 数
 */
export function countTotalTokens(...texts: string[]): number {
  return texts.reduce((sum, t) => sum + countTokens(t), 0);
}

/**
 * 按 Token 数截断文本
 * @param text 原始文本
 * @param maxTokens 最大 Token 数
 * @param fromEnd 是否从末尾保留（true=保留最后N个token）
 */
export function truncateByTokens(
  text: string,
  maxTokens: number,
  fromEnd = false
): string {
  const tokens = encode(text);
  if (tokens.length <= maxTokens) return text;

  const truncated = fromEnd
    ? tokens.slice(tokens.length - maxTokens)
    : tokens.slice(0, maxTokens);

  return decode(truncated);
}

/**
 * 格式化 Token 用量为人类可读字符串
 */
export function formatTokenUsage(used: number, total: number): string {
  const percentage = total > 0 ? ((used / total) * 100).toFixed(1) : "0.0";
  return `${used.toLocaleString()} / ${total.toLocaleString()} (${percentage}%)`;
}
