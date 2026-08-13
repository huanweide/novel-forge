"use client";

/**
 * 全局系统状态横幅（首启动引导 / DB 不可达友好降级）
 *
 * 挂在根布局，页面加载时调用一次 /api/health：
 *   - 数据库没连上 → 提示「数据库未连接」并给出一键修复命令
 *   - AI 没配置 → 提示「AI 未配置」并跳转设置页
 * 这直接回应了此前「完全不能用却找不到原因」的核心痛点——失败现在可读、
 * 可操作，而不是静默空白。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";

interface Health {
  version: string;
  db: { ok: boolean; error: string; hint: string };
  llm: { ok: boolean; error: string; hint: string };
}

interface Problem {
  key: string;
  label: string;
  error: string;
  hint: string;
  kind: "db" | "llm";
}

const DB_FIX_CMD = "docker compose up -d && npx prisma db push";

export function SystemStatusBanner() {
  const [health, setHealth] = useState<Health | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Health | null) => { if (d) setHealth(d); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!health || dismissed) return null;

  const problems: Problem[] = [];
  if (!health.db.ok) {
    problems.push({
      key: "db",
      label: "数据库未连接",
      error: health.db.error,
      hint: health.db.hint,
      kind: "db",
    });
  }
  if (!health.llm.ok) {
    problems.push({
      key: "llm",
      label: "AI 未配置",
      error: health.llm.error,
      hint: health.llm.hint,
      kind: "llm",
    });
  }

  if (problems.length === 0) return null;

  const copyCmd = () => {
    navigator.clipboard
      ?.writeText(DB_FIX_CMD)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="relative border-b border-amber-500/30 bg-amber-500/[0.08] backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-start gap-3">
        <Icon name="alert" size={18} className="text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-200">
            系统自检发现 {problems.length} 项需处理——这些会导致部分功能「点了没反应」
          </p>
          <ul className="mt-1.5 space-y-2">
            {problems.map((p) => (
              <li
                key={p.key}
                className="text-xs text-amber-100/90 flex flex-wrap items-center gap-x-2 gap-y-1"
              >
                <span className="font-medium text-amber-200">{p.label}：</span>
                <span>{p.error}</span>
                {p.hint ? <span className="text-amber-100/70">— {p.hint}</span> : null}
                {p.kind === "db" ? (
                  <>
                    <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-amber-100">
                      {DB_FIX_CMD}
                    </code>
                    <button
                      onClick={copyCmd}
                      className="text-amber-200 hover:text-white underline underline-offset-2"
                    >
                      {copied ? "已复制" : "复制命令"}
                    </button>
                  </>
                ) : (
                  <Link
                    href="/settings"
                    className="text-amber-200 hover:text-white underline underline-offset-2"
                  >
                    去设置页填 Key →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-300/70 hover:text-amber-100 transition-colors shrink-0"
          aria-label="关闭提示"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>
  );
}
