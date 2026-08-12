"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/icons";
import { toastError, toastSuccess, toastInfo } from "@/components/ui/toast";

interface MergeRevision {
  id: string;
  mainCardId: string;
  mergedIds: string[];
  confidence: "high" | "low";
  source: "llm" | "rule";
  status: "pending" | "applied";
  summary: string;
  createdAt: string;
}

// 角色合并提案面板：展示待确认（pending）与可回滚（applied）的合并快照。
// pending → 用户确认合并 / 忽略；applied → 可一键回滚（恢复合并前字段）。
export function MergePendingPanel({
  projectId,
  onChanged,
}: {
  projectId: string;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<MergeRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/characters/merge-pending?projectId=${encodeURIComponent(projectId)}`);
      const d = await res.json().catch(() => ({ ok: false, items: [] }));
      if (res.ok && d.ok) setItems(d.items || []);
      else setItems([]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (url: string, id: string, okMsg: string, errMsg: string) => {
    setActingId(id);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId: id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(`${errMsg}：${d.error || res.status}`);
        return;
      }
      toastSuccess(okMsg);
      await load();
      onChanged?.();
    } catch (e) {
      toastError(errMsg + "：" + (e instanceof Error ? e.message : "网络错误"));
    } finally {
      setActingId(null);
    }
  };

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const appliedCount = items.filter((i) => i.status === "applied").length;

  if (items.length === 0 && !loading) return null;

  return (
    <div className="mt-2 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--nv-text-primary)] inline-flex items-center gap-1">
          <Icon name="history" size={12} /> 合并提案
          {pendingCount > 0 && <span className="text-[10px] px-1 rounded bg-[var(--nv-warn-soft)] text-[var(--nv-warn)]">{pendingCount} 待确认</span>}
          {appliedCount > 0 && <span className="text-[10px] px-1 rounded bg-[var(--nv-border-1)] text-[var(--nv-text-secondary)]">{appliedCount} 可回滚</span>}
        </span>
        <button onClick={load} className="text-[10px] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] inline-flex items-center gap-1" disabled={loading}>
          {loading ? <Icon name="loader" size={10} className="animate-spin" /> : <Icon name="refresh" size={10} />} 刷新
        </button>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {items.map((it) => (
          <div key={it.id} className="text-[11px] rounded border border-[var(--nv-border-1)] p-2 bg-[var(--nv-surface-1)]">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[var(--nv-text-primary)] leading-snug">{it.summary}</span>
              <span className={`shrink-0 text-[9px] px-1 rounded ${it.confidence === "high" ? "bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]" : "bg-[var(--nv-warn-soft)] text-[var(--nv-warn)]"}`}>
                {it.confidence === "high" ? "高置信" : "低置信"}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-[9px] text-[var(--nv-text-tertiary)]">{it.source === "llm" ? "AI 判定" : "规则判定"}</span>
              {it.status === "pending" ? (
                <>
                  <button
                    onClick={() => act("/api/characters/merge-confirm", it.id, "已合并", "确认失败")}
                    disabled={actingId === it.id}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--nv-accent-soft)] text-[var(--nv-accent)] hover:border-[var(--nv-accent)] inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {actingId === it.id ? <Icon name="loader" size={9} className="animate-spin" /> : <Icon name="check" size={9} />} 确认合并
                  </button>
                  <button
                    onClick={() => act("/api/characters/merge-ignore", it.id, "已忽略该提案", "忽略失败")}
                    disabled={actingId === it.id}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--nv-border-1)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <Icon name="x" size={9} /> 忽略
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    if (typeof window !== "undefined" && !window.confirm("确认回滚此合并？主卡将恢复合并前字段，被并卡恢复可见。")) return;
                    act("/api/characters/merge-rollback", it.id, "已回滚合并", "回滚失败");
                  }}
                  disabled={actingId === it.id}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--nv-border-1)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] inline-flex items-center gap-1 disabled:opacity-50"
                >
                  {actingId === it.id ? <Icon name="loader" size={9} className="animate-spin" /> : <Icon name="refresh" size={9} />} 回滚
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--nv-text-tertiary)]">
        低置信合并由 AI 仅凭语义相似建议，需你确认才执行；高置信合并已自动执行，可随时回滚。
      </p>
    </div>
  );
}
