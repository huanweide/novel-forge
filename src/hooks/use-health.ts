"use client";

import { useEffect, useState } from "react";

export interface HealthStatus {
  version: string;
  db: { ok: boolean; error: string; hint: string };
  llm: { ok: boolean; error: string; hint: string };
}

// 模块级单例缓存：全站只发一次 /api/health，横幅与探讨页共享，避免重复请求
let cached: Promise<HealthStatus | null> | null = null;

function fetchHealth(): Promise<HealthStatus | null> {
  if (!cached) {
    cached = fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return cached;
}

/**
 * 读取系统健康状态（数据库 / AI 配置）。
 * 返回 null 表示仍在加载（首次渲染时），后续为真实结果。
 */
export function useHealth(): HealthStatus | null {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    let active = true;
    fetchHealth().then((d) => {
      if (active) setHealth(d);
    });
    return () => {
      active = false;
    };
  }, []);

  return health;
}
