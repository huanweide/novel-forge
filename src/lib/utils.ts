import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
