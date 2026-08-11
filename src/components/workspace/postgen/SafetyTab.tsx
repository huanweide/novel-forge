"use client";

import { useState, useEffect } from "react";
import { Icon } from "@/components/ui/icons";
import type { SafetyResult, SafetyIssue } from "@/core/pipeline/content-safety";

interface SafetyTabProps {
  projectId: string;
  chapterContent: string;
}

const SEVERITY_STYLE: Record<SafetyIssue["severity"], { label: string; cls: string }> = {
  high: { label: "高", cls: "bg-[var(--nv-danger)]/15 text-[var(--nv-danger)] border-[var(--nv-danger)]/30" },
  medium: { label: "中", cls: "bg-[var(--nv-warning)]/15 text-[var(--nv-warning)] border-[var(--nv-warning)]/30" },
  low: { label: "低", cls: "bg-[var(--nv-accent)]/15 text-[var(--nv-accent)] border-[var(--nv-accent)]/30" },
};

/**
 * 安全 Tab —— 对当前章节草稿跑规则化内容安全审核。
 * 纯前端调 /api/agent/content-safety（规则分类，零 LLM）。
 */
export function SafetyTab({ projectId, chapterContent }: SafetyTabProps) {
  const [result, setResult] = useState<SafetyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ran, setRan] = useState(false);

  const run = async () => {
    if (!chapterContent.trim()) {
      setError("当前章节没有正文可审。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/agent/content-safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, text: chapterContent }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        setRan(true);
      } else {
        setError(data.error || "审核失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 进入 Tab 自动跑一次
  useEffect(() => {
    if (!ran && !loading) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-xs text-[var(--nv-text-tertiary)]">
        <div className="w-4 h-4 rounded-full border-2 border-[var(--nv-primary)]/20 border-t-[var(--nv-primary)] animate-spin" />
        正在扫描内容风险…
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-xs text-[var(--nv-danger)]">{error}</div>;
  }

  if (!result) {
    return (
      <div className="p-4">
        <button onClick={run} className="text-xs text-[var(--nv-primary)] hover:underline flex items-center gap-1">
          <Icon name="search" size={13} /> 运行内容安全审核
        </button>
      </div>
    );
  }

  const scoreColor = result.score >= 80 ? "text-[var(--nv-success)]" : result.score >= 50 ? "text-[var(--nv-warning)]" : "text-[var(--nv-danger)]";

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-3 py-2">
        <div className={`text-2xl font-bold ${scoreColor}`}>{result.score}</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[var(--nv-text-primary)]">内容安全分（越高越安全）</div>
          <div className="text-[10px] text-[var(--nv-text-tertiary)]">{result.summary}</div>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border ${
            result.passed ? "bg-[var(--nv-success)]/15 text-[var(--nv-success)] border-[var(--nv-success)]/30" : "bg-[var(--nv-danger)]/15 text-[var(--nv-danger)] border-[var(--nv-danger)]/30"
          }`}
        >
          {result.passed ? "可发布" : "建议自查"}
        </span>
      </div>

      <button onClick={run} className="text-[10px] text-[var(--nv-primary)] hover:underline flex items-center gap-1">
        <Icon name="refresh" size={11} /> 重新检测
      </button>

      {result.issues.length === 0 ? (
        <div className="text-xs text-[var(--nv-text-tertiary)] py-2">未检出明显风险（规则库覆盖有限，仅供辅助参考）。</div>
      ) : (
        <div className="space-y-2">
          {result.issues.map((it, i) => {
            const sev = SEVERITY_STYLE[it.severity];
            return (
              <div key={i} className="rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${sev.cls}`}>{sev.label}危</span>
                  <span className="text-[10px] text-[var(--nv-text-secondary)]">{it.categoryLabel}</span>
                  <span className="text-[10px] text-[var(--nv-text-tertiary)]">命中「{it.matched}」</span>
                </div>
                <div className="text-[10px] text-[var(--nv-text-tertiary)] italic mb-1">「{it.snippet}」</div>
                <div className="text-[10px] text-[var(--nv-text-secondary)]">{it.suggestion}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
