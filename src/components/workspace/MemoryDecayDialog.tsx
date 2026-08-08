"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { toastSuccess, toastError } from "@/components/ui/toast";

interface DecayRule {
  maxAge: number | null;
  label: string;
}

interface DryRunResult {
  dryRun: boolean;
  project: { id: string; name: string };
  latestChapter: number;
  summaryCount: number;
  rules: Record<string, DecayRule>;
  hint: string;
}

interface CleanupStats {
  projectId: string;
  latestChapter: number;
  summariesChecked: number;
  eventsKept: number;
  eventsDowngraded: number;
  eventsDeleted: number;
  tierCounts: Record<string, number>;
}

export function MemoryDecayDialog({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName?: string;
  onClose: () => void;
}) {
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CleanupStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cron/memory-decay?projectId=${encodeURIComponent(projectId)}&dryRun=true`,
      );
      const d = await res.json();
      if (res.ok) setPreview(d);
      else setError(d.error || "预览失败");
    } catch {
      setError("预览请求失败");
    } finally {
      setLoadingPreview(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const runDecay = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/cron/memory-decay?projectId=${encodeURIComponent(projectId)}`);
      const d = await res.json();
      if (res.ok) {
        setResult(d);
        toastSuccess(
          `记忆衰减完成：保留 ${d.eventsKept} · 降级 ${d.eventsDowngraded} · 清理 ${d.eventsDeleted}`,
        );
      } else {
        setError(d.error || "清理失败");
        toastError(d.error || "清理失败");
      }
    } catch {
      setError("清理请求失败");
      toastError("清理请求失败");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal open onClose={onClose} bare ariaLabel="记忆衰减" panelClassName="w-[460px] max-w-[92vw] max-h-[88vh] overflow-y-auto">
      <div className="rounded-2xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--nv-text-primary)]">
            <Icon name="hourglass" size={16} /> 记忆衰减
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--nv-text-muted)] transition-colors hover:text-[var(--nv-text-primary)]"
            aria-label="关闭"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-[var(--nv-text-secondary)]">
          模拟人类遗忘曲线：越久远的楼层记忆越模糊，按重要度自动降级或清理。S 级核心记忆永久保留。衰减只影响章节摘要里的重要性事件，不改动正文与未收尾线索。
        </p>

        {loadingPreview && <div className="text-xs text-[var(--nv-text-muted)]">加载预览…</div>}
        {error && (
          <div className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger"><Icon name="alert" size={15} className="inline-block align-text-bottom shrink-0" /> {error}</div>
        )}

        {preview && (
          <div className="mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-[var(--nv-surface-3)] p-2.5">
                <div className="text-[var(--nv-text-muted-on-surface-3)]">已记录章节摘要</div>
                <div className="text-sm font-medium text-[var(--nv-text-primary)]">
                  {preview.summaryCount} 条
                </div>
              </div>
              <div className="rounded-lg bg-[var(--nv-surface-3)] p-2.5">
                <div className="text-[var(--nv-text-muted-on-surface-3)]">最新进度基准</div>
                <div className="text-sm font-medium text-[var(--nv-text-primary)]">
                  第 {preview.latestChapter} 章
                </div>
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs text-[var(--nv-text-muted)]">衰减规则</div>
              <div className="space-y-1">
                {Object.entries(preview.rules).map(([tier, rule]) => (
                  <div
                    key={tier}
                    className="flex items-center justify-between rounded-md bg-[var(--nv-surface-3)] px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-[var(--nv-text-secondary)]">{rule.label}</span>
                    <span className="text-[var(--nv-text-muted-on-surface-3)]">
                      {rule.maxAge === null ? "永久保留" : `超 ${rule.maxAge} 章降级 / 清理`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="mb-4 space-y-1 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-3)] p-3 text-xs">
            <div className="mb-1 text-[var(--nv-text-primary)]">
              本次衰减结果（第 {result.latestChapter} 章基准）
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--nv-text-muted-on-surface-3)]">检查摘要</span>
              <span className="text-[var(--nv-text-primary)]">{result.summariesChecked} 条</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--nv-text-muted-on-surface-3)]">保留</span>
              <span className="text-success">{result.eventsKept}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--nv-text-muted-on-surface-3)]">降级</span>
              <span className="text-warning">{result.eventsDowngraded}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--nv-text-muted)]">清理</span>
              <span className="text-danger">{result.eventsDeleted}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {!result ? (
            <button
              onClick={runDecay}
              disabled={running || loadingPreview}
              className="btn-primary rounded-xl px-4 py-2 text-xs disabled:opacity-50"
            >
              {running ? "清理中…" : "执行衰减清理"}
            </button>
          ) : null}
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-xs">
            {result ? "关闭" : "取消"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
