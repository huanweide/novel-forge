/**
 * 精准修复局部替换（v1.6.51，#124 长章修改类防截断真实修复）
 *
 * 问题：refine 路由对非续写意图（微调/精准修复）要求模型「完整重输出全文」，
 * 长正文（接近/超过 BUDGET_CEILING=5000 字）必被 max_tokens 截断或静默丢内容。
 * 修复：当请求携带「选中原文片段 selectedText」时，改走「局部替换」模式——
 * 只让模型生成该片段的改写版，路由层用精确子串匹配定位并替换回原正文。
 * 锚点来自用户真实选中文本（非模型幻觉）；命中失败/替换过短则回退保留原文 + 告警，
 * 复用续写增量「过短保留」保护范式，绝不破坏正文。
 */
export interface TargetedFixResult {
  ok: boolean;
  /** 替换后的完整正文（ok 时存在） */
  content?: string;
  /** 模型输出的替换片段（ok 时存在） */
  replacement?: string;
  /** 失败原因（!ok 时存在） */
  warning?: string;
}

export function applyTargetedFixReplacement(
  existing: string,
  selected: string,
  replacement: string,
): TargetedFixResult {
  const sel = (selected || "").trim();
  const rep = (replacement || "").trim();

  if (!sel) {
    return { ok: false, warning: "⚠️ 精准修复缺少选中原文锚点，已保留原章节正文，请重试。" };
  }
  // 替换片段过短（模型几乎未生成 / 空输出）→ 回退保留原正文，避免用空串擦除选中内容
  if (rep.length < Math.max(2, Math.floor(sel.length * 0.2))) {
    return { ok: false, warning: "⚠️ 精准修复替换片段过短（模型几乎未生成），已保留原章节正文，请重试。" };
  }
  const idx = existing.indexOf(sel);
  if (idx === -1) {
    // 锚点未命中（前端选中文本与正文不完全一致，如含不可见字符）→ 回退保留原文 + 明确告警
    return { ok: false, warning: "⚠️ 精准修复锚点（选中原文）未在正文中精确匹配，已保留原章节正文，请重新选中后重试。" };
  }
  // 命中：精确子串替换，取首次出现（稳定可预期，避免误伤多处同名片段）
  const next = existing.slice(0, idx) + rep + existing.slice(idx + sel.length);
  return { ok: true, content: next, replacement: rep };
}
