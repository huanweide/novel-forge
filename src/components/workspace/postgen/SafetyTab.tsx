"use client";

import { useState, useEffect } from "react";
import { Icon } from "@/components/ui/icons";
import type { SafetyResult, SafetyIssue, CustomSafetyRule, SafetyCategory, Severity } from "@/core/pipeline/content-safety";
import { CUSTOM_SAFETY_CATEGORY_OPTIONS, CUSTOM_SAFETY_SEVERITY_OPTIONS } from "@/core/pipeline/content-safety";

interface SafetyTabProps {
  projectId: string;
  chapterContent: string;
}

const SEVERITY_STYLE: Record<Severity, { label: string; cls: string }> = {
  high: { label: "高", cls: "bg-[var(--nv-danger)]/15 text-[var(--nv-danger)] border-[var(--nv-danger)]/30" },
  medium: { label: "中", cls: "bg-[var(--nv-warning)]/15 text-[var(--nv-warning)] border-[var(--nv-warning)]/30" },
  low: { label: "低", cls: "bg-[var(--nv-accent)]/15 text-[var(--nv-accent)] border-[var(--nv-accent)]/30" },
};

interface BaselineRuleDisplay {
  category: SafetyCategory;
  categoryLabel: string;
  severity: Severity;
  pattern: string;
  suggestion: string;
}

/**
 * 安全 Tab —— 对当前章节草稿跑规则化内容安全审核（零 LLM / 零 token）。
 * 支持用户增量黑名单：内置默认基线不可删，用户可追加专属关键词，扫描时自动叠加。
 */
export function SafetyTab({ projectId, chapterContent }: SafetyTabProps) {
  const [result, setResult] = useState<SafetyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ran, setRan] = useState(false);

  // 规则库（默认基线 + 用户黑名单）
  const [baseline, setBaseline] = useState<BaselineRuleDisplay[]>([]);
  const [customRules, setCustomRules] = useState<CustomSafetyRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [showBaseline, setShowBaseline] = useState(false);

  // 黑名单编辑临时态
  const [newPattern, setNewPattern] = useState("");
  const [newCategory, setNewCategory] = useState<SafetyCategory>("illegal");
  const [newSeverity, setNewSeverity] = useState<Severity>("medium");
  const [savingRule, setSavingRule] = useState(false);
  const [ruleMsg, setRuleMsg] = useState("");

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

  const loadRules = async () => {
    setRulesLoading(true);
    try {
      const res = await fetch(`/api/agent/content-safety?projectId=${encodeURIComponent(projectId)}`);
      const data = await res.json();
      if (res.ok) {
        setBaseline(data.baseline ?? []);
        setCustomRules(data.custom ?? []);
      }
    } catch {
      /* 规则库加载失败不阻断扫描 */
    } finally {
      setRulesLoading(false);
    }
  };

  // 进入 Tab 自动加载规则库 + 跑一次扫描
  useEffect(() => {
    loadRules();
    if (!ran && !loading) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistCustomRules = async (next: CustomSafetyRule[]) => {
    setSavingRule(true);
    setRuleMsg("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customSafetyRules: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRuleMsg(data.error || "保存失败");
        return false;
      }
      setCustomRules(next);
      // 立即用最新黑名单重扫
      run();
      return true;
    } catch {
      setRuleMsg("网络错误，保存失败");
      return false;
    } finally {
      setSavingRule(false);
    }
  };

  const addCustomRule = async () => {
    const pattern = newPattern.trim();
    if (!pattern) {
      setRuleMsg("请输入关键词或短语");
      return;
    }
    if (customRules.some((r) => r.pattern === pattern)) {
      setRuleMsg("该词已在你的黑名单中");
      return;
    }
    const next: CustomSafetyRule[] = [
      ...customRules,
      { id: `c_${Date.now()}_${customRules.length}`, pattern, category: newCategory, severity: newSeverity },
    ];
    setNewPattern("");
    setRuleMsg("");
    await persistCustomRules(next);
  };

  const deleteCustomRule = async (id: string) => {
    const next = customRules.filter((r) => r.id !== id);
    setRuleMsg("");
    await persistCustomRules(next);
  };

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
      {/* 规则库统计 */}
      <div className="flex items-center gap-2 flex-wrap text-[10px] text-[var(--nv-text-tertiary)]">
        <span className="px-1.5 py-0.5 rounded bg-[var(--nv-surface-3)] border border-[var(--nv-border-2)]">
          默认基线 {baseline.length} 条（不可删）
        </span>
        <span className="px-1.5 py-0.5 rounded bg-[var(--nv-primary)]/10 text-[var(--nv-primary)] border border-[var(--nv-primary)]/30">
          你的黑名单 {customRules.length} 条
        </span>
        <span className="text-[var(--nv-text-tertiary)]">· 规则匹配，零 token</span>
      </div>

      {/* 用户增量黑名单编辑 */}
      <div className="rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-2.5 space-y-2">
        <div className="text-[11px] text-[var(--nv-text-secondary)] font-medium flex items-center gap-1">
          <Icon name="shield" size={12} /> 你的内容安全黑名单（增量叠加默认基线）
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <input
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCustomRule(); }}
            placeholder="关键词 / 短语，如「咕噜咕噜」"
            className="flex-1 min-w-[120px] text-[11px] px-2 py-1 rounded bg-[var(--nv-surface-3)] border border-[var(--nv-border-2)] text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]/50"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as SafetyCategory)}
            className="text-[11px] px-1.5 py-1 rounded bg-[var(--nv-surface-3)] border border-[var(--nv-border-2)] text-[var(--nv-text-primary)] outline-none"
          >
            {CUSTOM_SAFETY_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={newSeverity}
            onChange={(e) => setNewSeverity(e.target.value as Severity)}
            className="text-[11px] px-1.5 py-1 rounded bg-[var(--nv-surface-3)] border border-[var(--nv-border-2)] text-[var(--nv-text-primary)] outline-none"
          >
            {CUSTOM_SAFETY_SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={addCustomRule}
            disabled={savingRule}
            className="text-[11px] px-2 py-1 rounded bg-[var(--nv-primary)] text-white disabled:opacity-50 flex items-center gap-1"
          >
            <Icon name="plus" size={11} /> 添加
          </button>
        </div>

        {customRules.length === 0 ? (
          <div className="text-[10px] text-[var(--nv-text-tertiary)] py-1">暂无自定义黑名单，默认仅用内置基线扫描。</div>
        ) : (
          <div className="space-y-1">
            {customRules.map((r) => {
              const sev = SEVERITY_STYLE[r.severity];
              const catLabel = CUSTOM_SAFETY_CATEGORY_OPTIONS.find((o) => o.value === r.category)?.label ?? r.category;
              return (
                <div key={r.id} className="flex items-center gap-1.5 text-[10px]">
                  <span className={`px-1.5 py-0.5 rounded border ${sev.cls}`}>{sev.label}危</span>
                  <span className="text-[var(--nv-text-tertiary)]">{catLabel}</span>
                  <span className="font-mono text-[var(--nv-text-secondary)] truncate">{r.pattern}</span>
                  <button
                    onClick={() => deleteCustomRule(r.id)}
                    disabled={savingRule}
                    className="ml-auto text-[var(--nv-text-tertiary)] hover:text-[var(--nv-danger)] disabled:opacity-40"
                    title="删除这条黑名单"
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {ruleMsg && <div className="text-[10px] text-[var(--nv-danger)]">{ruleMsg}</div>}

        {/* 默认基线（只读） */}
        <div className="pt-1 border-t border-[var(--nv-border-2)]">
          <button
            onClick={() => setShowBaseline((v) => !v)}
            className="text-[10px] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-secondary)] flex items-center gap-1"
          >
            <Icon name={showBaseline ? "chevronDown" : "chevronRight"} size={11} />
            内置默认基线（{baseline.length} 条 · 不可删）
          </button>
          {showBaseline && (
            <div className="mt-1 space-y-0.5 max-h-40 overflow-auto">
              {baseline.map((r, i) => {
                const sev = SEVERITY_STYLE[r.severity];
                return (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-[var(--nv-text-tertiary)]">
                    <span className={`px-1 py-0.5 rounded border ${sev.cls}`}>{sev.label}</span>
                    <span>{r.categoryLabel}</span>
                    <span className="font-mono truncate">{r.pattern}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 扫描结果 */}
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
                  {it.source === "custom" && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--nv-primary)]/10 text-[var(--nv-primary)] border border-[var(--nv-primary)]/30">你的黑名单</span>
                  )}
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
