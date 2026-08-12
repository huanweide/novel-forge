/**
 * 生成截断判定（F1 修复 / Max Loop 审查）：
 * 把「max_tokens 截断（finish_reason=length）→ 回退草稿态 + 告警」的判定逻辑抽成单一真相，
 * write 与 continue 两条生成路径共用，避免告警文案 / 阈值分裂，行为收敛到同一套流程。
 *
 * 状态回退（prisma update）与 send 仍由各路径负责（需各自 DB / 流上下文），
 * 本模块只给纯函数判定结论，零副作用、可单测。
 */
export interface TruncationResult {
  truncated: boolean;
  warning?: string;
}

export function classifyTruncation(
  finishReason: string | undefined,
  contentLength: number,
  targetWords: number,
): TruncationResult {
  if (finishReason !== "length") return { truncated: false };

  // 字数明显不足（低于预算 60%）时给出更强告警，提示用户先补全再确认
  const insufficient = contentLength < Math.ceil(targetWords * 0.6);
  return {
    truncated: true,
    warning: insufficient
      ? "⚠️ 生成被 max_tokens 截断（finish_reason=length）且字数明显不足，已保留已生成部分作为草稿，请点击「继续生成」补全后再确认。"
      : "⚠️ 生成被 max_tokens 截断（finish_reason=length），已保留已生成部分作为草稿，请点击「继续生成」补全后再确认。",
  };
}
