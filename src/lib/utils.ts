import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * asArray：把 Json 字段的读取结果统一规范为数组，**保留元素原始类型**。
 *
 * 与 safeSplit 的区别：safeSplit 会把元素过滤成 string[]（适合渲染标签），
 * 而 Json 字段存的对象数组（如 LoreTable.rows、GameState.entities）若走 safeSplit
 * 会被压成字符串值、丢掉对象结构。凡需要 `.length` / `.includes` / `.map`
 * 且元素非纯字符串的场合一律用本函数。
 *
 *   null/undefined → []
 *   数组          → 原样
 *   JSON 数组字符串 → parse 后返回（parse 失败则包成单元素数组）
 *   其余（字符串/数字/对象）→ 包成单元素数组（对象不拆，保持一个整体）
 */
export function asArray<T = unknown>(val: unknown): T[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val as T[];
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return (Array.isArray(parsed) ? parsed : [parsed]) as T[];
      } catch {
        return [val as unknown as T];
      }
    }
    return [val as unknown as T];
  }
  return [val as T];
}

/**
 * 安全地将任意值转为分隔符连接的字符串。
 * personality / hiddenMotives 等 Prisma Json 字段：
 *   数组 → join
 *   对象 → Object.values().join
 *   字符串 → 尝试 JSON.parse，失败则直接返回
 *   null/undefined → ""
 */
export function safeJoin(val: unknown, sep = "、"): string {
  if (val == null) return "";
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === "string").join(sep);
  if (typeof val === "object") return Object.values(val).filter((v): v is string => typeof v === "string").join(sep);
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try { const arr = JSON.parse(trimmed); return safeJoin(arr, sep); } catch { /* fall through */ }
    }
    return trimmed;
  }
  return String(val);
}

/**
 * safeSplit：与 safeJoin 配对——把 unknown 值规范为 string[]，用于「字符串/数组混合字段」的渲染/迭代。
 *   null/undefined → []
 *   string[] → 原样（只保留 string 元素）
 *   object   → 取所有 string 值
 *   string   → 按 `,`/`、`/`，`/` ` 拆分 + 过滤空白 + 过滤空串
 *   其余     → [String(val)]
 */
export function safeSplit(val: unknown, sep: string | RegExp = /[、,，\s]+/): string[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === "string");
  if (typeof val === "object") {
    return Object.values(val).filter((v): v is string => typeof v === "string");
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try { const arr = JSON.parse(trimmed); return safeSplit(arr, sep); } catch { /* fall through */ }
    }
    return trimmed.split(sep).map(s => s.trim()).filter(Boolean);
  }
  return [String(val)];
}

