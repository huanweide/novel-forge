"use client";
import { describeHttpError } from "@/lib/stream-error";

/**
 * 本地过审自检面板 —— 把 src/core/humanize 的规则引擎结果可视化。
 *
 * 三条硬约束（来自 humanize/types.ts 的设计原则，前端必须遵守）：
 *  1. 不上传 —— 分析全在浏览器内存里同步跑完，不发一个字节出本机。
 *  2. 给证据 —— 每条命中都展示原文片段 + 原因 + 可执行建议，不做黑箱评分。
 *  3. 说实话 —— 免责声明永远显示，不许藏进「更多」里。
 */

import { useMemo, useState } from "react";
import { useProjectStore } from "@/store";
import { toastSuccess, toastError } from "@/components/ui/toast";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/icons";
import { analyzeText } from "@/core/humanize";
import type { HumanizeReport, ParagraphReport, Severity } from "@/core/humanize";

// ── 等级配色：分数越高越红，跟直觉一致 ──
const LEVEL_STYLE: Record<
  HumanizeReport["level"],
  { text: string; bg: string; border: string; ring: string; hint: string }
> = {
  clean: {
    text: "text-[var(--nv-success)]",
    bg: "bg-[var(--nv-success-soft)]",
    border: "border-[var(--nv-success)]/40",
    ring: "stroke-[var(--nv-success)]",
    hint: "机器味很淡，可以直接投。",
  },
  mild: {
    text: "text-[var(--nv-info)]",
    bg: "bg-[var(--nv-info-soft)]",
    border: "border-[var(--nv-info)]/40",
    ring: "stroke-[var(--nv-info)]",
    hint: "有少量痕迹，顺手改几处更稳。",
  },
  noticeable: {
    text: "text-[var(--nv-warning)]",
    bg: "bg-[var(--nv-warning-soft)]",
    border: "border-[var(--nv-warning)]/40",
    ring: "stroke-[var(--nv-warning)]",
    hint: "痕迹明显，建议按下面的证据逐条改。",
  },
  heavy: {
    text: "text-[var(--nv-danger)]",
    bg: "bg-[var(--nv-danger-soft)]",
    border: "border-[var(--nv-danger)]/40",
    ring: "stroke-[var(--nv-danger)]",
    hint: "机器味重，被判定 AI 写作的风险高。",
  },
};

// bar 单独写死：Tailwind 扫不到运行时拼接的 class 名，必须给完整字面量
const SEVERITY_STYLE: Record<Severity, { text: string; bg: string; bar: string; label: string }> = {
  high: {
    text: "text-[var(--nv-danger)]",
    bg: "bg-[var(--nv-danger-soft)]",
    bar: "bg-[var(--nv-danger)]",
    label: "高",
  },
  medium: {
    text: "text-[var(--nv-warning)]",
    bg: "bg-[var(--nv-warning-soft)]",
    bar: "bg-[var(--nv-warning)]",
    label: "中",
  },
  low: {
    text: "text-[var(--nv-info)]",
    bg: "bg-[var(--nv-info-soft)]",
    bar: "bg-[var(--nv-info)]",
    label: "低",
  },
};

/** 段落强度 → 色条（0-100） */
function heatColor(score: number): string {
  if (score >= 60) return "bg-[var(--nv-danger)]";
  if (score >= 35) return "bg-[var(--nv-warning)]";
  if (score >= 15) return "bg-[var(--nv-info)]";
  return "bg-[var(--nv-success)]";
}

/**
 * 段落内高亮：把命中的原文片段用 <mark> 圈出来。
 * hits 的 start/end 是全文下标，先减去段落起点转成段内下标。
 */
function HighlightedParagraph({ p }: { p: ParagraphReport }) {
  const parts = useMemo(() => {
    const sorted = [...p.hits].sort((a, b) => a.start - b.start);
    const out: Array<{ text: string; hit: boolean; severity: Severity }> = [];
    let cursor = 0;
    for (const h of sorted) {
      const s = Math.max(0, h.start - p.start);
      const e = Math.min(p.text.length, h.end - p.start);
      if (e <= s || s < cursor) continue;
      if (s > cursor) out.push({ text: p.text.slice(cursor, s), hit: false, severity: "low" });
      out.push({ text: p.text.slice(s, e), hit: true, severity: h.severity });
      cursor = e;
    }
    if (cursor < p.text.length) out.push({ text: p.text.slice(cursor), hit: false, severity: "low" });
    return out;
  }, [p]);

  return (
    <p className="text-xs leading-relaxed text-[var(--nv-text-primary)] whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        part.hit ? (
          <mark
            key={i}
            className={`rounded px-0.5 ${SEVERITY_STYLE[part.severity].bg} ${SEVERITY_STYLE[part.severity].text} font-medium`}
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}

/** 分数圆环：SVG 描边进度，视觉上比纯数字更直观 */
function ScoreRing({ score, level }: { score: number; level: HumanizeReport["level"] }) {
  const style = LEVEL_STYLE[level];
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * c;
  return (
    <div className="relative w-[88px] h-[88px] shrink-0">
      <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
        <circle cx="44" cy="44" r={r} className="fill-none stroke-[var(--nv-border-2)]" strokeWidth="7" />
        <circle
          cx="44"
          cy="44"
          r={r}
          className={`fill-none ${style.ring}`}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold leading-none ${style.text}`}>{score}</span>
        <span className="text-[10px] text-[var(--nv-text-tertiary)] mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)]/50 px-2.5 py-2">
      <div className="text-[10px] text-[var(--nv-text-tertiary)]">{label}</div>
      <div className="text-sm font-semibold text-[var(--nv-text-primary)] mt-0.5">
        {value}
        {unit && <span className="text-[10px] font-normal text-[var(--nv-text-tertiary)] ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

export function HumanizePanel({
  open,
  onClose,
  text,
  chapterTitle,
  nodeId,
}: {
  open: boolean;
  onClose: () => void;
  /** 待检正文（本地分析，不上传） */
  text: string;
  chapterTitle?: string;
  /** 当前章节节点 id；传入才显示「保存过审分到本章」按钮 */
  nodeId?: string;
}) {
  // 只在打开时算；text 不变就不重算。规则引擎是同步纯函数，几千字在毫秒级。
  const report = useMemo(() => (open ? analyzeText(text) : null), [open, text]);
  const [onlySerious, setOnlySerious] = useState(false);
  const [savingHumanize, setSavingHumanize] = useState(false);

  // v3.1.68：把本次过审分（humanizeScore）落到本章，大纲即显示绿/黄/红。全程纯本地算出的分，仅经专用接口写入本机数据库。
  const handleSaveHumanize = async () => {
    if (!nodeId || !report) return;
    setSavingHumanize(true);
    try {
      const res = await fetch(`/api/story/nodes/${nodeId}/humanize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: report.score }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        { const _f = describeHttpError(res.status, d); throw new Error(_f.description); }
      }
      const d = await res.json();
      useProjectStore.getState().updateNode(nodeId, {
        humanizeScore: typeof d.humanizeScore === "number" ? d.humanizeScore : report.score,
      });
      toastSuccess(`已保存本章过审分 ${report.score}，绿/黄/红已更新到大纲`);
    } catch (e) {
      toastError("保存过审分失败：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSavingHumanize(false);
    }
  };

  const level = report?.level ?? "clean";
  const style = LEVEL_STYLE[level];

  const hotParagraphs = useMemo(() => {
    if (!report) return [];
    const list = report.paragraphs.filter((p) => p.hits.length > 0);
    return onlySerious
      ? list.filter((p) => p.hits.some((h) => h.severity !== "low"))
      : list;
  }, [report, onlySerious]);

  const maxRuleCount = report?.byRule[0]?.count ?? 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="3xl"
      title="本地过审自检"
      description={chapterTitle ? `检测对象：${chapterTitle}` : "检测对象：当前章节正文"}
      icon="shield"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <span className="text-[10px] text-[var(--nv-text-tertiary)] flex items-center gap-1">
            <Icon name="shield" size={11} />
            全程在本机内存完成，正文不会上传任何服务器
          </span>
          <div className="flex items-center gap-2">
            {nodeId && report && report.stats.chars >= 50 && (
              <button
                onClick={handleSaveHumanize}
                disabled={savingHumanize}
                className="h-8 px-3 text-xs rounded-lg border border-[var(--nv-primary)]/40 text-[var(--nv-primary)] bg-[var(--nv-primary-soft)] hover:bg-[var(--nv-primary)]/15 transition-colors disabled:opacity-40"
                title="把本次过审分保存到本章，大纲里会显示绿/黄/红"
              >
                {savingHumanize ? "保存中…" : `保存过审分 ${report.score}`}
              </button>
            )}
            <button
              onClick={onClose}
              className="h-8 px-4 text-xs rounded-lg border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] hover:bg-[var(--nv-surface-1)] transition-colors"
            >
              知道了
            </button>
          </div>
        </div>
      }
    >
      {!report ? null : report.stats.chars < 50 ? (
        <div className="py-10 text-center text-sm text-[var(--nv-text-tertiary)]">
          正文字数太少（{report.stats.chars} 字），先写够 50 字再来自检。
        </div>
      ) : (
        <div className="space-y-4 max-h-[64vh] overflow-y-auto pr-1">
          {/* ── 总分 ── */}
          <div className={`flex items-center gap-4 rounded-xl border ${style.border} ${style.bg} p-3.5`}>
            <ScoreRing score={report.score} level={level} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-base font-bold ${style.text}`}>{report.levelLabel}</span>
                <span className="text-xs text-[var(--nv-text-secondary)]">AI 痕迹指数</span>
              </div>
              <p className="text-xs text-[var(--nv-text-secondary)] mt-1">{style.hint}</p>
              <p className="text-[11px] text-[var(--nv-text-tertiary)] mt-1.5">
                共 {report.hits.length} 处痕迹，命中 {report.byRule.length} 条规则，分布在 {hotParagraphs.length} 个段落
              </p>
            </div>
          </div>

          {/* ── 原始数据 ── */}
          <div>
            <h4 className="text-xs font-semibold text-[var(--nv-text-primary)] mb-2">看得见的原始数据</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <StatCard label="总字数" value={report.stats.chars.toLocaleString()} unit="字" />
              <StatCard label="破折号" value={report.stats.dashPerK.toFixed(1)} unit="个/千字" />
              <StatCard label="平均句长" value={report.stats.avgSentenceLen.toFixed(1)} unit="字" />
              <StatCard label="句长波动" value={report.stats.sentenceLenStd.toFixed(1)} />
              <StatCard label="短句占比" value={(report.stats.shortSentenceRatio * 100).toFixed(0)} unit="%" />
              <StatCard label="AI 词密度" value={report.stats.aiWordPerK.toFixed(1)} unit="个/千字" />
            </div>
            <p className="text-[10px] text-[var(--nv-text-tertiary)] mt-1.5">
              真人写作的特征是长短句差异大（句长波动高）、破折号克制；AI 恰恰相反。
            </p>
          </div>

          {/* ── 按规则聚合 ── */}
          {report.byRule.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-[var(--nv-text-primary)] mb-2">命中规则</h4>
              <div className="space-y-1.5">
                {report.byRule.map((r) => (
                  <div key={r.ruleId} className="flex items-center gap-2">
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${SEVERITY_STYLE[r.severity].bg} ${SEVERITY_STYLE[r.severity].text}`}>
                      {SEVERITY_STYLE[r.severity].label}
                    </span>
                    <span className="w-28 shrink-0 text-[11px] text-[var(--nv-text-secondary)] truncate">{r.ruleName}</span>
                    <div className="flex-1 h-2 rounded-full bg-[var(--nv-surface-2)] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${SEVERITY_STYLE[r.severity].bar}`}
                        style={{ width: `${Math.max(6, (r.count / maxRuleCount) * 100)}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-[11px] font-medium text-[var(--nv-text-primary)]">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 逐段证据 ── */}
          {hotParagraphs.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-[var(--nv-text-primary)]">
                  逐段证据（{hotParagraphs.length} 段）
                </h4>
                <label className="flex items-center gap-1.5 text-[10px] text-[var(--nv-text-tertiary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlySerious}
                    onChange={(e) => setOnlySerious(e.target.checked)}
                    className="accent-[var(--nv-accent)]"
                  />
                  只看中/高严重度
                </label>
              </div>
              <div className="space-y-2">
                {hotParagraphs.map((p) => (
                  <div key={p.index} className="rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)]/40 p-2.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] text-[var(--nv-text-tertiary)]">第 {p.index + 1} 段</span>
                      <div className="flex-1 h-1 rounded-full bg-[var(--nv-surface-2)] overflow-hidden">
                        <div className={`h-full ${heatColor(p.score)}`} style={{ width: `${Math.min(100, p.score)}%` }} />
                      </div>
                      <span className="text-[10px] text-[var(--nv-text-tertiary)]">{p.score}</span>
                    </div>
                    <HighlightedParagraph p={p} />
                    <div className="mt-1.5 space-y-1 border-t border-[var(--nv-border-2)] pt-1.5">
                      {p.hits
                        .filter((h) => !onlySerious || h.severity !== "low")
                        .map((h, i) => (
                          <div key={i} className="text-[10px] leading-relaxed">
                            <span className={`font-medium ${SEVERITY_STYLE[h.severity].text}`}>{h.ruleName}</span>
                            <span className="text-[var(--nv-text-tertiary)]"> · 为什么：</span>
                            <span className="text-[var(--nv-text-secondary)]">{h.reason}</span>
                            <span className="text-[var(--nv-text-tertiary)]"> · 怎么改：</span>
                            <span className="text-[var(--nv-text-secondary)]">{h.suggestion}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-[var(--nv-success)]/40 bg-[var(--nv-success-soft)] p-3 text-xs text-[var(--nv-success)]">
              没有检出 AI 痕迹，这段读起来像人写的。
            </div>
          )}

          {/* ── 免责声明（必须显示，不许折叠） ── */}
          <div className="rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)]/60 p-2.5 flex gap-2">
            <Icon name="info" size={13} className="shrink-0 mt-0.5 text-[var(--nv-text-tertiary)]" />
            <p className="text-[10px] leading-relaxed text-[var(--nv-text-tertiary)]">{report.disclaimer}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
