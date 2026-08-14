"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { toastError } from "@/components/ui/toast";

/**
 * ChapterAuditPanel —— 「写作体检」入口（v2.7.0）
 *
 * 独立于 ChapterConfirmBar 的常驻按钮 + 弹窗，复用 /api/generate/audit 的
 * 内容安全（forbidden-checker）+ 写作质量（quality-analyzer）双重体检结果，
 * 在章节定稿前给用户一个可见的「踩线项 + 质量分」报告。
 */

interface AuditMatch {
  category: string;
  severity: "error" | "warning" | "info";
  pattern: string;
  context: string;
  suggestion: string | null;
  index: number;
  isRegex: boolean;
}
interface AuditForbidden {
  passed: boolean;
  textLength: number;
  qualityScore: number;
  fuzzyDensity: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  matchCount: number;
  matches: AuditMatch[];
}
interface AuditDimension {
  name: string;
  key: string;
  score: number;
  weight: number;
  detail: string;
}
interface AuditQuality {
  overallScore: number;
  grade: "A" | "B" | "C" | "D";
  passed: boolean;
  summary: string;
  dimensions: AuditDimension[];
}
interface AuditReport {
  title?: string;
  empty?: boolean;
  forbidden: AuditForbidden;
  quality: AuditQuality;
}

const CATEGORY_LABELS: Record<string, string> = {
  exact_word: "精确禁用词",
  sentence_pattern: "句式模板",
  body_template: "身体模板",
  fuzzy_word: "模糊词",
  ai_frequent: "AI高频词",
};

export function ChapterAuditPanel({
  projectId,
  nodeId,
  disabled,
  triggerNodeId,
  onTriggerConsumed,
}: {
  projectId: string;
  nodeId: string;
  disabled?: boolean;
  triggerNodeId?: string | null;
  onTriggerConsumed?: () => void;
}) {
  const [auditing, setAuditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [empty, setEmpty] = useState(false);

  const loadAndOpen = async (tid: string) => {
    setAuditing(true);
    try {
      const res = await fetch("/api/generate/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, nodeId: tid }),
      });
      const d = await res.json();
      if (!res.ok) {
        toastError(d?.error || "写作体检失败");
        return;
      }
      if (d.empty) {
        setEmpty(true);
        setReport(null);
        setOpen(true);
        return;
      }
      setEmpty(false);
      setReport(d as AuditReport);
      setOpen(true);
    } catch (err) {
      toastError("写作体检失败：" + (err instanceof Error ? err.message : "网络错误"));
    } finally {
      setAuditing(false);
    }
  };

  const handleAudit = () => loadAndOpen(nodeId);

  // 受控触发：父层把某章 id 塞进 triggerNodeId 时，自动拉取并弹开该章体检（看板行点击跳转用）
  useEffect(() => {
    if (triggerNodeId) {
      loadAndOpen(triggerNodeId);
      onTriggerConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerNodeId]);

  const handleClose = () => {
    setOpen(false);
    onTriggerConsumed?.();
  };

  const barClass = (s: number) =>
    s >= 85 ? "bg-success" : s >= 70 ? "bg-[var(--nv-primary)]" : s >= 60 ? "bg-warning" : "bg-danger";
  const textClass = (s: number) =>
    s >= 85 ? "text-success" : s >= 70 ? "text-[var(--nv-primary)]" : s >= 60 ? "text-warning" : "text-danger";
  const gradeBadge = (g: string) =>
    g === "A"
      ? "bg-success/20 text-success"
      : g === "B"
        ? "bg-[var(--nv-primary)]/20 text-[var(--nv-primary)]"
        : g === "C"
          ? "bg-warning/20 text-warning"
          : "bg-danger/20 text-danger";
  const sevBar = (s: string) =>
    s === "error" ? "bg-danger" : s === "warning" ? "bg-warning" : "bg-[var(--nv-text-muted)]";
  const sevText = (s: string) =>
    s === "error" ? "text-danger" : s === "warning" ? "text-warning" : "text-[var(--nv-text-muted)]";
  const sevLabel = (s: string) => (s === "error" ? "高危" : s === "warning" ? "警示" : "提示");

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={disabled || auditing}
        onClick={handleAudit}
        title="对本章正文做内容安全 + 写作质量体检，定稿前看清踩线项与质量分"
      >
        <Icon
          name="brain"
          size={12}
          className={auditing ? "inline-block align-text-bottom shrink-0 animate-spin" : "inline-block align-text-bottom shrink-0"}
        />
        {auditing ? "体检中" : "写作体检"}
      </Button>

      <Modal
        open={open}
        onClose={handleClose}
        title="写作体检报告"
        icon="brain"
        size="2xl"
        footer={
          <ModalFooter>
            <button onClick={handleClose} className="btn-ghost">
              关闭
            </button>
          </ModalFooter>
        }
      >
        {empty ? (
          <p className="text-sm text-[var(--nv-text-muted)]">本章还没有正文，先写好再来做体检吧。</p>
        ) : report ? (
          <div className="space-y-5">
            {/* 安全体检 */}
            <section>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-[var(--nv-text-secondary)]">内容安全</span>
                <span className={`text-sm font-mono font-semibold ${textClass(report.forbidden.qualityScore)}`}>
                  {report.forbidden.qualityScore} 分
                </span>
              </div>
              <div className="h-2 bg-[var(--nv-surface-2)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barClass(report.forbidden.qualityScore)}`}
                  style={{ width: `${report.forbidden.qualityScore}%` }}
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-[var(--nv-text-muted)]">
                <span>文本长度：{report.forbidden.textLength} 字</span>
                <span>模糊词密度：{report.forbidden.fuzzyDensity}/500 字</span>
                <span>命中总数：{report.forbidden.matchCount} 处</span>
                <span className={report.forbidden.passed ? "text-success" : "text-danger"}>
                  {report.forbidden.passed ? "安全线通过" : "触及禁用项"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(report.forbidden.byCategory).map(([k, v]) =>
                  v > 0 ? (
                    <span
                      key={k}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)]"
                    >
                      {CATEGORY_LABELS[k] ?? k}：{v}
                    </span>
                  ) : null,
                )}
                {report.forbidden.matchCount === 0 && (
                  <span className="text-[10px] text-success">未命中任何禁用词</span>
                )}
              </div>

              {/* 命中明细：逐条列出踩线内容、上下文与修改建议 */}
              <details className="mt-3 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface-1)]">
                <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-[var(--nv-text-secondary)]">
                  命中明细（{report.forbidden.matches.length} 条
                  {report.forbidden.matches.length < report.forbidden.matchCount
                    ? `，仅显示前 ${report.forbidden.matches.length} 条`
                    : ""}）
                </summary>
                <div className="space-y-2 px-3 pb-3 max-h-72 overflow-y-auto">
                  {[...report.forbidden.matches]
                    .sort(
                      (a, b) =>
                        (a.severity === "error" ? 0 : a.severity === "warning" ? 1 : 2) -
                        (b.severity === "error" ? 0 : b.severity === "warning" ? 1 : 2),
                    )
                    .map((m, i) => (
                      <div key={i} className="flex gap-2 rounded-md bg-[var(--nv-surface-2)] p-2">
                        <div className={`w-1 shrink-0 rounded-full ${sevBar(m.severity)}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--nv-surface-1)] text-[var(--nv-text-tertiary)]">
                              {CATEGORY_LABELS[m.category] ?? m.category}
                            </span>
                            <span className={`text-[10px] px-1 py-0.5 rounded bg-[var(--nv-surface-1)] ${sevText(m.severity)}`}>
                              {sevLabel(m.severity)}
                            </span>
                            {!m.isRegex && (
                              <span className={`text-[10px] font-mono ${sevText(m.severity)}`}>「{m.pattern}」</span>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-[var(--nv-text-secondary)] break-words">
                            {m.context}
                          </p>
                          {m.suggestion && (
                            <p className="mt-1 text-[10px] text-[var(--nv-text-muted)]">建议：{m.suggestion}</p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </details>
            </section>

            {/* 质量体检 */}
            <section>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-[var(--nv-text-secondary)]">写作质量</span>
                <span className="flex items-center gap-2">
                  <span className={`text-lg font-bold font-mono ${textClass(report.quality.overallScore)}`}>
                    {report.quality.overallScore}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${gradeBadge(report.quality.grade)}`}>
                    {report.quality.grade} 级
                  </span>
                </span>
              </div>
              <div className="space-y-1.5 mt-2">
                {report.quality.dimensions.map((d) => (
                  <div key={d.key}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--nv-text-tertiary)]">
                        {d.name}
                        <span className="text-[var(--nv-text-muted)]">（权重{d.weight}）</span>
                      </span>
                      <span className={`font-mono ${textClass(d.score)}`}>{d.score}</span>
                    </div>
                    <div className="h-1.5 bg-[var(--nv-surface-2)] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barClass(d.score)}`} style={{ width: `${d.score}%` }} />
                    </div>
                    {d.detail && <p className="text-[10px] text-[var(--nv-text-muted)] mt-0.5">{d.detail}</p>}
                  </div>
                ))}
              </div>
            </section>

            {/* 结论 */}
            <div
              className={`rounded-lg p-3 text-sm ${
                report.quality.passed && report.forbidden.passed
                  ? "bg-success/10 text-success"
                  : "bg-warning/10 text-warning"
              }`}
            >
              {report.quality.passed && report.forbidden.passed
                ? "安全与质量双达标，可放心定稿。"
                : `⚠️ ${
                    !report.forbidden.passed ? "触及内容安全红线，建议先清洗禁用项；" : ""
                  }${!report.quality.passed ? "写作质量未达 C 级（60 分），建议润色后再定稿。" : ""}`}
            </div>
            <p className="text-[10px] text-[var(--nv-text-muted)]">{report.quality.summary}</p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
