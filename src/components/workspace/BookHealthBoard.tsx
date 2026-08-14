"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { toastError, toastSuccess } from "@/components/ui/toast";

/**
 * BookHealthBoard —— 「全书体检」入口（v2.8.0）
 *
 * 独立于 ChapterConfirmBar 的常驻按钮 + 弹窗，复用 /api/generate/audit/book 的
 * 全书聚合结果（每章内容安全分 + 写作质量分 + 评级），让作者一眼看清
 * 全书哪几章踩线、哪几章写得水，指导优先返工。与单章「写作体检」并列。
 */

interface BookChapter {
  id: string;
  title: string;
  order: number;
  type: string;
  status: string;
  wordCount: number;
  forbiddenScore: number;
  forbiddenPassed: boolean;
  matchCount: number;
  errorCount: number;
  warningCount: number;
  qualityScore: number;
  grade: string;
  passed: boolean;
}
interface BookSummary {
  avgQuality: number;
  avgForbidden: number;
  blockedSafety: number;
  lowQuality: number;
  needsWork: number;
}
interface BookReport {
  truncated: boolean;
  audited: number;
  summary: BookSummary;
  chapters: BookChapter[];
}

const STATUS_LABELS: Record<string, string> = {
  outline_only: "仅大纲",
  draft: "草稿",
  generated: "已生成·待提交",
  pending: "待确认",
  reviewing: "审校中",
  confirmed: "已定稿",
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

export function BookHealthBoard({ projectId, onPersisted, onRowAudit }: { projectId: string; onPersisted?: () => void; onRowAudit?: (nodeId: string) => void }) {
  const [auditing, setAuditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<BookReport | null>(null);
  const [persisting, setPersisting] = useState(false);

  const handlePersist = async () => {
    setPersisting(true);
    try {
      const res = await fetch(`/api/generate/audit/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, persist: true }),
      });
      const d = await res.json();
      if (!res.ok) {
        toastError(d?.error || "保存质量分失败");
        return;
      }
      toastSuccess(`已保存 ${d.persisted} 章质量分到大纲树`);
      onPersisted?.();
    } catch (err) {
      toastError("保存质量分失败：" + (err instanceof Error ? err.message : "网络错误"));
    } finally {
      setPersisting(false);
    }
  };

  const handleAudit = async () => {
    setAuditing(true);
    try {
      const res = await fetch(`/api/generate/audit/book?projectId=${encodeURIComponent(projectId)}`);
      const d = await res.json();
      if (!res.ok) {
        toastError(d?.error || "全书体检失败");
        return;
      }
      setReport(d as BookReport);
      setOpen(true);
    } catch (err) {
      toastError("全书体检失败：" + (err instanceof Error ? err.message : "网络错误"));
    } finally {
      setAuditing(false);
    }
  };

  const s = report?.summary;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={auditing}
        onClick={handleAudit}
        title="一键体检全书所有章节的内容安全与写作质量，列出需返工的章节"
      >
        <Icon
          name="book"
          size={12}
          className={
            auditing ? "inline-block align-text-bottom shrink-0 animate-spin" : "inline-block align-text-bottom shrink-0"
          }
        />
        {auditing ? "体检中" : "全书体检"}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="全书健康度体检"
        icon="book"
        size="3xl"
        footer={
          <ModalFooter>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={persisting}
              onClick={handlePersist}
              title="把每章质量分写回大纲树节点，左侧大纲即可常驻显示彩色质量徽章"
            >
              {persisting ? "保存中" : "保存质量分到大纲"}
            </Button>
            <button onClick={() => setOpen(false)} className="btn-ghost">
              关闭
            </button>
          </ModalFooter>
        }
      >
        {report ? (
          <div className="space-y-4">
            {/* 汇总卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-lg bg-[var(--nv-surface-2)] p-3">
                <div className="text-[10px] text-[var(--nv-text-muted)]">已体检章节</div>
                <div className="text-lg font-bold font-mono">{report.audited}</div>
              </div>
              <div className="rounded-lg bg-[var(--nv-surface-2)] p-3">
                <div className="text-[10px] text-[var(--nv-text-muted)]">平均质量分</div>
                <div className={`text-lg font-bold font-mono ${textClass(s?.avgQuality ?? 0)}`}>{s?.avgQuality}</div>
              </div>
              <div className="rounded-lg bg-[var(--nv-surface-2)] p-3">
                <div className="text-[10px] text-[var(--nv-text-muted)]">平均安全分</div>
                <div className={`text-lg font-bold font-mono ${textClass(s?.avgForbidden ?? 0)}`}>
                  {s?.avgForbidden}
                </div>
              </div>
              <div className="rounded-lg bg-[var(--nv-surface-2)] p-3">
                <div className="text-[10px] text-[var(--nv-text-muted)]">需返工章节</div>
                <div
                  className={`text-lg font-bold font-mono ${
                    (s?.needsWork ?? 0) > 0 ? "text-danger" : "text-success"
                  }`}
                >
                  {s?.needsWork}
                </div>
              </div>
            </div>

            {report.truncated && (
              <p className="text-[10px] text-warning">
                本书正文章节超过 300 章，已对前 300 章体检；如需其余章节请分批处理。
              </p>
            )}

            {/* 章节明细表：按章序排列，需返工行高亮 */}
            <div className="rounded-lg border border-[var(--nv-border-2)] overflow-hidden">
              <div className="grid grid-cols-[44px_1fr_64px_56px_56px_48px_76px_84px] text-[10px] font-medium text-[var(--nv-text-muted)] bg-[var(--nv-surface-2)] px-2 py-1.5">
                <span>序号</span>
                <span>章节标题</span>
                <span className="text-right">字数</span>
                <span className="text-right">安全分</span>
                <span className="text-right">质量分</span>
                <span className="text-center">评级</span>
                <span className="text-center">高危/警示</span>
                <span className="text-center">状态</span>
              </div>
              <div className="max-h-[50vh] overflow-y-auto">
                {report.chapters.map((c) => {
                  const flag = !c.passed || !c.forbiddenPassed;
                  return (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setOpen(false); onRowAudit?.(c.id); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpen(false);
                          onRowAudit?.(c.id);
                        }
                      }}
                      title="点击查看本章逐条命中明细与改稿建议"
                      aria-label={`查看《${c.title || "未命名"}》的逐条命中明细与改稿建议`}
                      className={`grid grid-cols-[44px_1fr_64px_56px_56px_48px_76px_84px] items-center px-2 py-1.5 text-[11px] border-t border-[var(--nv-border-2)] cursor-pointer hover:bg-[var(--nv-primary)]/5 focus-visible:outline-2 focus-visible:outline-[var(--nv-primary)] ${
                        flag ? "bg-danger/5" : ""
                      }`}
                    >
                      <span className="text-[var(--nv-text-tertiary)] font-mono">{c.order}</span>
                      <span className="truncate pr-2 text-[var(--nv-text-secondary)]" title={c.title}>
                        {c.title || "（未命名）"}
                      </span>
                      <span className="text-right font-mono text-[var(--nv-text-tertiary)]">{c.wordCount}</span>
                      <span className={`text-right font-mono ${textClass(c.forbiddenScore)}`}>
                        {c.forbiddenPassed ? c.forbiddenScore : `${c.forbiddenScore}！`}
                      </span>
                      <span className={`text-right font-mono ${textClass(c.qualityScore)}`}>{c.qualityScore}</span>
                      <span className="text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${gradeBadge(c.grade)}`}>
                          {c.grade}
                        </span>
                      </span>
                      <span className="text-center font-mono">
                        {c.errorCount === 0 && c.warningCount === 0 ? (
                          <span className="text-[var(--nv-text-tertiary)]">—</span>
                        ) : (
                          <span className={c.errorCount > 0 ? "text-danger font-bold" : "text-warning"}>
                            {c.errorCount}/{c.warningCount}
                          </span>
                        )}
                      </span>
                      <span className="text-center text-[10px] text-[var(--nv-text-muted)]">
                        {STATUS_LABELS[c.status] ?? c.status}
                      </span>
                    </div>
                  );
                })}
                {report.chapters.length === 0 && (
                  <p className="text-[11px] text-[var(--nv-text-muted)] px-2 py-4 text-center">
                    还没有带正文的章节，先去写几章再来体检吧。
                  </p>
                )}
              </div>
            </div>

            <p className="text-[10px] text-[var(--nv-text-muted)]">
              评级：A≥85 / B≥70 / C≥60 / D&lt;60；质量分&lt;60 或安全未通过即标记为需返工（红色行）。「高危/警示」列为该章命中的
              error 级（高危，必改）/ warning 级（套路化，建议改）违禁词数量，点开该章「写作体检」可看逐条命中上下文与改稿建议。
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
