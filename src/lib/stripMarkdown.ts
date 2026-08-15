/**
 * 轻量清洗 Markdown 标记，避免朗读时把 **、*、#、> 这类符号也念出来。
 * 只做表层去除，不解析语义——朗读场景够用。
 * 抽为纯函数便于单测（驱动 TTSPlayer 朗读前清洗）。
 */

export interface StripMarkdownOptions {
  /**
   * 保留段落结构：把连续空行压成双换行（\n\n）而非压成单换行。
   * TTS 分段（segmentText）据此在段落之间自然停顿；txt 导出据此保留章节分段。
   */
  preserveParagraphs?: boolean;
}

export function stripMarkdown(md: string, opts?: StripMarkdownOptions): string {
  const s = md
    .replace(/```[\s\S]*?```/g, " ") // 代码块
    .replace(/`([^`]+)`/g, "$1") // 行内代码
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // 图片
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // 链接 → 仅保留文字
    .replace(/^#{1,6}\s+/gm, "") // 标题 #
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // 粗体
    .replace(/(\*|_)(.*?)\1/g, "$2") // 斜体
    .replace(/^>\s?/gm, "") // 引用 >
    .replace(/^[-*+]\s+/gm, "") // 无序列表
    .replace(/^\d+\.\s+/gm, "") // 有序列表
    .replace(/[*_~`>#]/g, " "); // 残余符号

  if (opts?.preserveParagraphs) {
    // 保留段落断点：三行以上空行压成双换行，行尾多余空白清掉
    return s
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  return s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n") // 多余空行
    .trim();
}

/**
 * 把清洗后的纯文本切成「朗读单元」数组（以句/段为界），供 TTSPlayer 逐句朗读、
 * 显示进度、支持上/下句跳转与续播。
 * - 先按段落（双换行）分组，段内再按中英文句末标点切分；单换行也视为停顿点。
 * - 空串 / 纯空白返回 []，调用方据此禁用朗读。
 */
export function segmentText(plain: string): string[] {
  if (!plain || !plain.trim()) return [];
  // 句末符：中英文句号/叹问/分号/省略号；\n 单独成段也视为停顿点
  const ENDERS = "。！？!?；;….";
  const out: string[] = [];
  for (const para of plain.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    // 匹配「若干非句末字符 + 可选句末标点」，或单独成段的换行
    const parts = p.match(new RegExp(`[^${ENDERS}\n]+[${ENDERS}]?|\\n+`, "g")) || [p];
    for (const part of parts) {
      const seg = part.trim();
      if (seg) out.push(seg);
    }
  }
  return out;
}
