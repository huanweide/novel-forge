/**
 * 网文合规 / 违禁词预检（FE-N7）
 *
 * 设计：本地工具、内容由作者自写，无强制平台。默认词库聚焦「各网文平台普遍违禁的
 * 引流 / 广告 / 联系方式」类词（安全、可公开、对作者真实有用），敏感的政治/色情类
 * 由作者按自己投稿平台在设置里自定义扩充。预检只是「投稿前自查、标出候选命中」，
 * 是否真违禁由作者判断，不自动删改。
 */

export interface BannedHit {
  word: string;
  index: number;
  end: number;
  context: string;
}

/** 默认违禁词：平台普遍禁止的引流 / 广告 / 联系方式（可安全内置） */
export const DEFAULT_BANNED_WORDS: string[] = [
  "微信", "薇信", "v信", "威信", "vx", "VX", "V信",
  "公众号", "二维码", "加我", "加好友", "加群", "qq群", "QQ群",
  "私聊", "私信", "兼职", "代写", "刷单", "返利", "返现",
  "彩票", "博彩", "招代理", "微商", "引流", "工作室", "代购",
  "内部群", "扫码", "扫码加", "关注公众号", "有偿", "付费进群",
];

const STORAGE_KEY = "nf-banned-words";

/** 从 localStorage 读取用户自定义违禁词（每行一个，自动去空去重） */
export function loadCustomBannedWords(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return raw
      .split(/\r?\n/)
      .map((w) => w.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** 持久化用户自定义违禁词（合并去重后存回，保持每行一个） */
export function saveCustomBannedWords(words: string[]): void {
  if (typeof window === "undefined") return;
  const cleaned = Array.from(
    new Set(words.map((w) => w.trim()).filter(Boolean))
  );
  try {
    localStorage.setItem(STORAGE_KEY, cleaned.join("\n"));
  } catch {
    /* localStorage 不可用时静默 */
  }
}

/** 合并默认 + 自定义词库 */
export function getAllBannedWords(): string[] {
  return Array.from(
    new Set([...DEFAULT_BANNED_WORDS, ...loadCustomBannedWords()])
  );
}

/**
 * 扫描文本中的违禁词命中。
 * 大小写不敏感（统一转小写匹配）；CJK 用子串匹配，英文/数字短词也走子串（预检允许误报，由作者复核）。
 * @param text 待扫描正文
 * @param extra 额外词库（默认会并入 getAllBannedWords，这里传自定义覆盖场景用）
 * @param maxHits 最多返回命中数（防止超长文本爆内存），默认 500
 */
export function scanBannedWords(
  text: string,
  extra?: string[],
  maxHits = 500
): BannedHit[] {
  if (!text) return [];
  const words = extra
    ? Array.from(new Set([...getAllBannedWords(), ...extra]))
    : getAllBannedWords();
  const lower = text.toLowerCase();
  const hits: BannedHit[] = [];

  for (const raw of words) {
    const w = raw.trim();
    if (!w) continue;
    const lw = w.toLowerCase();
    // 拉丁/数字短词（长度≤2 且非纯中文）需词边界判定，避免 "vx" 误命中 "avx" 这类子串误伤；
    // 中文词（含长词）保留子串匹配（预检允许作者复核）。
    const isPureCjk = /^[一-鿿]+$/.test(lw);
    const useBoundary = !isPureCjk && lw.length <= 2;
    let from = 0;
    while (from <= lower.length - lw.length) {
      const idx = lower.indexOf(lw, from);
      if (idx === -1) break;
      const start = idx;
      const end = idx + lw.length;
      if (useBoundary) {
        const before = idx > 0 ? lower[idx - 1] : "";
        const after = end < lower.length ? lower[end] : "";
        const beforeOk = before === "" || !/[a-z0-9]/.test(before);
        const afterOk = after === "" || !/[a-z0-9]/.test(after);
        if (!(beforeOk && afterOk)) {
          from = end;
          continue;
        }
      }
      const ctxStart = Math.max(0, start - 25);
      const ctxEnd = Math.min(text.length, end + 25);
      hits.push({
        word: w,
        index: start,
        end,
        context: text.slice(ctxStart, ctxEnd).replace(/\s+/g, " "),
      });
      from = end;
      if (hits.length >= maxHits) return hits;
    }
  }
  return hits;
}
