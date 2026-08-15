/**
 * 轻量清洗 Markdown 标记，避免朗读时把 **、*、#、> 这类符号也念出来。
 * 只做表层去除，不解析语义——朗读场景够用。
 * 抽为纯函数便于单测（驱动 TTSPlayer 朗读前清洗）。
 */
export function stripMarkdown(md: string): string {
  return md
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
    .replace(/[*_~`>#]/g, " ") // 残余符号
    .replace(/[ \t]{2,}/g, " ") // 多余空格
    .replace(/\n{2,}/g, "\n") // 多余空行
    .trim();
}
