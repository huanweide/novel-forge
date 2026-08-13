import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRateLimiter, rateLimit, clientIp, rateLimitResponse } from "./rate-limit";

describe("rateLimit - 默认关闭 (Round16：单用户本地场景限流属过度防御)", () => {
  const clear = () => {
    delete process.env.ENABLE_RATE_LIMIT;
  };
  beforeEach(clear);
  afterEach(clear);

  it("未设置 ENABLE_RATE_LIMIT → 永远放行", () => {
    expect(rateLimit("rl-t1", "ip", 1, 1000)).toEqual({ ok: true });
    expect(rateLimit("rl-t1", "ip", 1, 1000)).toEqual({ ok: true });
  });

  it("ENABLE_RATE_LIMIT=false → 放行", () => {
    process.env.ENABLE_RATE_LIMIT = "false";
    expect(rateLimit("rl-t2", "ip", 1, 1000)).toEqual({ ok: true });
  });

  it("ENABLE_RATE_LIMIT=0 → 放行（仅 'true' 启用）", () => {
    process.env.ENABLE_RATE_LIMIT = "0";
    expect(rateLimit("rl-t3", "ip", 1, 1000)).toEqual({ ok: true });
  });
});

describe("createRateLimiter - 滑动窗口纯逻辑", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("窗口内未超 max → 连续放行", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 3 });
    expect(limiter("rl-k-a")).toEqual({ ok: true });
    expect(limiter("rl-k-a")).toEqual({ ok: true });
    expect(limiter("rl-k-a")).toEqual({ ok: true });
  });

  it("超过 max → 拒绝并给出 retryAfter(秒)", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
    expect(limiter("rl-k-b")).toEqual({ ok: true });
    expect(limiter("rl-k-b")).toEqual({ ok: true });
    const denied = limiter("rl-k-b");
    expect(denied.ok).toBe(false);
    expect(denied.retryAfter).toBeGreaterThan(0);
    expect(denied.retryAfter).toBeLessThanOrEqual(1);
  });

  it("窗口过期后 → 计数器重置重新放行", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(limiter("rl-k-c")).toEqual({ ok: true });
    expect(limiter("rl-k-c").ok).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(limiter("rl-k-c")).toEqual({ ok: true });
  });

  it("不同 key 互不干扰", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(limiter("rl-k-x")).toEqual({ ok: true });
    expect(limiter("rl-k-x").ok).toBe(false);
    expect(limiter("rl-k-y")).toEqual({ ok: true }); // 不同 key 仍放行
  });
});

describe("clientIp / rateLimitResponse", () => {
  it("clientIp 取 x-forwarded-for 首段", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("clientIp 缺头回退 local", () => {
    const req = new Request("https://example.com");
    expect(clientIp(req)).toBe("local");
  });

  it("rateLimitResponse → 429 中文提示", async () => {
    const res = rateLimitResponse();
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("请求过于频繁");
  });
});
