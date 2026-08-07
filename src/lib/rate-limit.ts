/**
 * 内存滑动窗口限流（round-8 路B · L2-001 修复）
 *
 * 目标：为 LLM 消耗型接口（生成/导入/测试连接）加前置速率限制，
 * 防止客户端无限次调用打爆 DeepSeek 网关造成资损与服务不可用（DoS）。
 *
 * 设计：
 * - 单例：模块级 `store` / `limiters` Map，随 Node 运行时进程常驻，
 *   跨请求共享（Next.js Node runtime 下模块单例，与 Prisma 7 单例同理）。
 * - 滑动窗口：`Map<key,{count,resetAt}>`，每次访问惰性过期当前 key，
 *   并周期性（60s）全量清理过期项，避免内存无限增长。
 * - `createRateLimiter` 返回纯函数限流器（同步，无 I/O）。
 * - `rateLimit(name,key,limit,windowMs)` 便捷函数：按 `name` 缓存限流器实例，
 *   内部以 `${name}:${key}` 作桶 key，避免不同路由之间计数串扰。
 */

export interface RateLimitResult {
  /** 是否放行 */
  ok: boolean;
  /** 被限流时，距离窗口重置还需等待的秒数 */
  retryAfter?: number;
}

export type RateLimiter = (key: string) => RateLimitResult;

interface Bucket {
  count: number;
  resetAt: number;
}

// ─── 模块级单例存储（跨请求共享）───
const store = new Map<string, Bucket>();

const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

function maybeSweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [k, v] of store) {
    if (v.resetAt <= now) store.delete(k);
  }
}

/**
 * 创建一个滑动窗口限流器。
 * @param windowMs 窗口时长（毫秒）
 * @param max      窗口内允许的最大请求数
 * @returns (key) => { ok, retryAfter? }
 */
export function createRateLimiter(opts: { windowMs: number; max: number }): RateLimiter {
  const { windowMs, max } = opts;
  return (key: string): RateLimitResult => {
    const now = Date.now();
    maybeSweep(now);

    const existing = store.get(key);
    // 无记录或窗口已过期 → 新建桶
    if (!existing || existing.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true };
    }
    // 已达上限 → 拒绝，告知等待秒数
    if (existing.count >= max) {
      return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
    }
    // 计数 +1 放行
    existing.count += 1;
    return { ok: true };
  };
}

// ─── 便捷函数：按 name 缓存限流器实例 ───
const limiters = new Map<string, RateLimiter>();

/**
 * 便捷限流调用。
 * @param name     路由/限流域标识（不同 name 互不串扰）
 * @param key      限流键（通常用客户端 IP）
 * @param limit    窗口内最大请求数
 * @param windowMs 窗口时长（毫秒）
 */
export function rateLimit(name: string, key: string, limit: number, windowMs: number): RateLimitResult {
  // Round16 董事会：单用户本地场景下，限流属过度防御（防不存在的多租户滥用）。
  // 默认禁用，仅当 ENABLE_RATE_LIMIT=true 时启用（保护自用 API key / 供应商额度，避免资损）。
  if (process.env.ENABLE_RATE_LIMIT !== "true") return { ok: true };
  let limiter = limiters.get(name);
  if (!limiter) {
    limiter = createRateLimiter({ windowMs, max: limit });
    limiters.set(name, limiter);
  }
  return limiter(`${name}:${key}`);
}

/**
 * 从请求中提取客户端 IP。
 * 优先取 `x-forwarded-for` 首段（反向代理后的真实客户端），否则回退 `local`。
 */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** 统一的 429 响应（中文提示，无内部信息泄露） */
export function rateLimitResponse(): Response {
  return new Response(JSON.stringify({ error: "请求过于频繁，请稍后重试" }), {
    status: 429,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
