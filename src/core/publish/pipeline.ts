/**
 * 发布管线（导出即上站）
 *
 * 来源：2026-09-04 董事会路线图 M4（乔布斯④ / 张雪峰③ / Naval② / PG④ 四角色共识）。
 *
 * ── 它解决什么真实问题 ──
 * 网文作者的终点不是「本地有个 docx 文件」，是**发到番茄 / 起点 / 公众号上开始赚钱**。
 * 而每个平台的规矩不一样：番茄吃 2000 字左右的短章、爱短段落；
 * 起点吃 3000 字上下、要完整世界观；公众号又有自己的排版习惯。
 * 手动改格式是纯体力活，改错了还可能影响推荐与签约。
 *
 * ── 本模块做什么（纯函数、零 IO，不碰现有导出核心）──
 *   1. 平台格式预设：目标字数区间、段落长度偏好、标题格式
 *   2. 逐章诊断：字数够不够 / 超不超，给出「合并短章」或「从中段断章」的可执行建议
 *   3. 按平台规范排版：把过长的段落切开（番茄尤其吃这个）
 *   4. 署名页：导出物自带「本书由 novel-smith 辅助创作」——作品即媒体，
 *      读者看到成品自然追问工具，形成有机传播（Naval 的媒体杠杆）
 *
 * 全部本地计算，不联网、不传稿。
 */

export type PublishPlatform = "fanqie" | "qidian" | "wechat" | "general";

export interface PlatformPreset {
  id: PublishPlatform;
  label: string;
  /** 建议单章字数区间 */
  targetWords: { min: number; max: number };
  /** 单段最大字符数，超过则按句切开 */
  maxParagraphChars: number;
  /** 标题格式模板，{n} 为章节序号，{title} 为章节名 */
  titlePattern: string;
  /** 该平台的排版 / 规矩说明（人话） */
  note: string;
}

export const PLATFORM_PRESETS: Record<PublishPlatform, PlatformPreset> = {
  fanqie: {
    id: "fanqie",
    label: "番茄小说",
    targetWords: { min: 1800, max: 2600 },
    maxParagraphChars: 120,
    titlePattern: "第{n}章 {title}",
    note: "番茄吃快节奏：单章 1800–2600 字为宜，段落要短（一段别超 120 字），手机端阅读体验优先。",
  },
  qidian: {
    id: "qidian",
    label: "起点中文网",
    targetWords: { min: 2800, max: 4200 },
    maxParagraphChars: 220,
    titlePattern: "第{n}章 {title}",
    note: "起点吃完整世界观：单章 2800–4200 字，允许更细的描写与更长段落，重视设定铺陈。",
  },
  wechat: {
    id: "wechat",
    label: "微信公众号",
    targetWords: { min: 1200, max: 3000 },
    maxParagraphChars: 100,
    titlePattern: "{title}",
    note: "公众号吃碎片阅读：标题不编号、直接给章节名，段落极短（≤100 字），手机端留白要足。",
  },
  general: {
    id: "general",
    label: "通用（不套平台规矩）",
    targetWords: { min: 1500, max: 5000 },
    maxParagraphChars: 300,
    titlePattern: "第{n}章 {title}",
    note: "不套用任何平台规矩，只做基础排版，适合先导出自己存档。",
  },
};

export interface ChapterDiagnosis {
  nodeId: string;
  order: number;
  title: string;
  /** 字数（不含空白） */
  words: number;
  status: "short" | "ok" | "long";
  advice: string;
}

export interface PublishReport {
  platform: PublishPlatform;
  platformLabel: string;
  preset: PlatformPreset;
  chapters: ChapterDiagnosis[];
  summary: {
    total: number;
    ok: number;
    short: number;
    long: number;
    totalWords: number;
    /** 达标率 0-100 */
    okRate: number;
  };
}

// ─── 小工具 ───

/** 字数统计：去掉所有空白字符后计数（中文按字算，符合网文平台惯例） */
export function countWords(text: string): number {
  return (text || "").replace(/\s+/g, "").length;
}

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 按句末标点切句（保留标点） */
function splitSentences(text: string): string[] {
  return (text || "")
    .split(/(?<=[。！？!?…；;])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── 排版 ───

/**
 * 把过长的段落按句切开，适配手机端阅读（番茄 / 公众号尤其吃这个）。
 *
 * 只在段落超过阈值时才动刀，短段原样保留——绝不为了「看起来整齐」破坏作者原有的段落节奏。
 */
export function formatParagraphs(content: string, maxChars: number): string {
  const src = content || "";
  if (!src.trim()) return "";
  const paras = src.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];

  for (const p of paras) {
    if (p.length <= maxChars) {
      out.push(p);
      continue;
    }
    // 长段按句累积，接近阈值就断开
    let buf = "";
    for (const s of splitSentences(p)) {
      if (buf && buf.length + s.length > maxChars) {
        out.push(buf);
        buf = s;
      } else {
        buf += s;
      }
    }
    if (buf) out.push(buf);
  }

  return out.join("\n\n");
}

/** 按平台预设排版整章正文 */
export function formatForPlatform(content: string, platform: PublishPlatform = "general"): string {
  const preset = PLATFORM_PRESETS[platform] ?? PLATFORM_PRESETS.general;
  return formatParagraphs(content, preset.maxParagraphChars);
}

/** 生成平台规范的章节标题 */
export function formatChapterTitle(
  title: string | null | undefined,
  order: number,
  platform: PublishPlatform = "general",
): string {
  const preset = PLATFORM_PRESETS[platform] ?? PLATFORM_PRESETS.general;
  const t = (title || "").trim();
  return preset.titlePattern.replace("{n}", String(order + 1)).replace("{title}", t || `未命名`).trim();
}

// ─── 诊断 ───

export interface PublishNode {
  id: string;
  order: number;
  title?: string | null;
  content?: string | null;
}

/** 逐章诊断字数是否达标，并给出可执行建议（不是空话） */
export function buildPublishReport(
  nodes: PublishNode[],
  platform: PublishPlatform = "general",
): PublishReport {
  const preset = PLATFORM_PRESETS[platform] ?? PLATFORM_PRESETS.general;
  const chapters: ChapterDiagnosis[] = (nodes || [])
    .filter((n) => n && (n.content || "").trim())
    .sort((a, b) => a.order - b.order)
    .map((n) => {
      const words = countWords(n.content || "");
      const title = formatChapterTitle(n.title, n.order, platform);
      let status: ChapterDiagnosis["status"] = "ok";
      let advice = `字数 ${words} 字，在 ${preset.targetWords.min}–${preset.targetWords.max} 区间内，可以直接发。`;

      if (words < preset.targetWords.min) {
        status = "short";
        const lack = preset.targetWords.min - words;
        advice = `偏短 ${lack} 字（当前 ${words} 字）。建议：补一段场景/心理描写，或与下一章合并后再发。`;
      } else if (words > preset.targetWords.max) {
        status = "long";
        const over = words - preset.targetWords.max;
        advice = `偏长 ${over} 字（当前 ${words} 字）。建议：在情节转折点断成两章（${preset.label}更吃稳定更新节奏）。`;
      }

      return { nodeId: n.id, order: n.order, title, words, status, advice };
    });

  const total = chapters.length;
  const ok = chapters.filter((c) => c.status === "ok").length;
  const short = chapters.filter((c) => c.status === "short").length;
  const long = chapters.filter((c) => c.status === "long").length;
  const totalWords = chapters.reduce((s, c) => s + c.words, 0);

  return {
    platform: preset.id,
    platformLabel: preset.label,
    preset,
    chapters,
    summary: {
      total,
      ok,
      short,
      long,
      totalWords,
      okRate: total > 0 ? Math.round((ok / total) * 100) : 0,
    },
  };
}

// ─── 署名页（作品即媒体）───

/**
 * 生成导出物尾部的署名页。
 *
 * 为什么要有这一页：读者看到成品会好奇「这什么工具写的」——把署名做进导出物，
 * 就是让每一份作品都替 novel-smith 说话（Naval 的媒体杠杆：写一次，传播无数次）。
 * 当然，署名是**可关闭**的：创作主权归作者，作者不想带就关掉。
 */
export function buildAttributionHtml(opts: {
  projectTitle?: string | null;
  authorName?: string | null;
  platform?: PublishPlatform;
}): string {
  const title = escapeHtml((opts.projectTitle || "未命名作品").trim());
  const author = escapeHtml((opts.authorName || "佚名").trim());
  const preset = PLATFORM_PRESETS[opts.platform ?? "general"] ?? PLATFORM_PRESETS.general;

  return [
    "<!-- novel-smith 署名页 -->",
    '<section class="novel-smith-attribution" style="margin-top:3em;padding-top:1.5em;border-top:1px solid #ddd;font-size:0.9em;color:#666;">',
    `  <h2 style="font-size:1.1em;color:#333;">关于本书</h2>`,
    `  <p>《${title}》　作者：${author}</p>`,
    `  <p>本书按「${escapeHtml(preset.label)}」的格式规范排版导出。</p>`,
    '  <p>本书使用 <a href="https://github.com/huanweide/novel-smith" style="color:#888;">novel-smith</a> 辅助创作——一款本地优先、数据不上云的 AI 小说创作平台。</p>',
    "</section>",
  ].join("\n");
}
