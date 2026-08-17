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
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

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
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Health | null) => {
        if (active && d) setHealth(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!health || dismissed) return null;

  const problems: Problem[] = [];
  // 探讨模式是纯对话式前期构思阶段，不需要数据库；
  // 用户本地没跑 Postgres 很正常，不该弹「数据库未连接」吓人。
  const isExplore = pathname === "/explore" || pathname?.startsWith("/explore?");
  if (!health.db.ok && !isExplore) {
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
    <div className="relative border-b border-warning/30 bg-warning/[0.08] backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-start gap-3">
        <Icon name="alert" size={18} className="text-warning mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-warning">
            系统自检发现 {problems.length} 项需处理——这些会导致部分功能「点了没反应」
          </p>
          <ul className="mt-1.5 space-y-2">
            {problems.map((p) => (
              <li
                key={p.key}
                className="text-xs text-warning/90 flex flex-wrap items-center gap-x-2 gap-y-1"
              >
                <span className="font-medium text-warning">{p.label}：</span>
                <span>{p.error}</span>
                {p.hint ? <span className="text-warning/70">— {p.hint}</span> : null}
                {p.kind === "db" ? (
                  <>
                    <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-warning">
                      {DB_FIX_CMD}
                    </code>
                    <button
                      onClick={copyCmd}
                      className="text-warning hover:text-[var(--nv-text-primary)] underline underline-offset-2"
                    >
                      {copied ? "已复制" : "复制命令"}
                    </button>
                  </>
                ) : (
                  <Link
                    href="/settings"
                    className="text-warning hover:text-[var(--nv-text-primary)] underline underline-offset-2"
                  >
                    去设置页填 Key →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <button
            onClick={() => setDismissed(true)}
            className="text-warning/70 hover:text-warning transition-colors"
            aria-label="关闭提示"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
