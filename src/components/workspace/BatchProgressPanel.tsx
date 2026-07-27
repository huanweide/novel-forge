"use client";

import type { StoryNodeData } from "./types";
import { Icon } from "@/components/ui/icons";

export function BatchProgressPanel({
  progress, nodes, onAbort,
}: {
  progress: Map<string, { status: string; error?: string }>;
  nodes: StoryNodeData[]; onAbort: () => void;
}) {
  const entries = [...progress.entries()];
  const done = entries.filter(([, v]) => v.status === "done").length;
  const failed = entries.filter(([, v]) => v.status === "failed").length;
  const generating = entries.find(([, v]) => v.status === "generating");
  const total = entries.length;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 bg-[var(--nv-abyss)] border border-[var(--nv-border-2)] rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--nv-border-2)] bg-[var(--nv-surface-2)]">
        <div>
          <span className="text-sm font-medium flex items-center gap-1.5 text-[var(--nv-text-primary)]"><Icon name="pencil" size={14} className="text-[var(--nv-primary)]" /> 批量生成</span>
          <span className="text-xs text-[var(--nv-text-tertiary)] ml-2">{done + failed}/{total}</span>
        </div>
        <button onClick={onAbort} className="btn-danger text-xs px-2 py-0.5 rounded border">停止</button>
      </div>
      <div className="max-h-64 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar">
        {entries.map(([id, state]) => {
          const node = nodes.find((n) => n.id === id);
          const iconName = state.status === "done" ? "check" : state.status === "failed" ? "x" : state.status === "generating" ? "loader" : "circle";
          const iconColor = state.status === "generating" ? "text-[var(--nv-accent)]" : state.status === "failed" ? "text-[var(--nv-danger)]" : "text-[var(--nv-success)]";
          return (
            <div key={id} className={`flex items-center gap-2 text-xs py-0.5 ${state.status === "generating" ? "text-[var(--nv-accent)]" : state.status === "failed" ? "text-[var(--nv-danger)]" : "text-[var(--nv-text-secondary)]"}`}>
              <span className={`shrink-0 ${iconColor} ${state.status === "generating" ? "animate-spin" : ""}`}><Icon name={iconName as any} size={12} /></span>
              <span className="truncate flex-1">{node?.title || id.slice(0, 8)}</span>
              {state.error && <span className="text-[var(--nv-danger)] text-[10px] truncate max-w-[100px]" title={state.error}>{state.error.slice(0, 30)}</span>}
            </div>
          );
        })}
      </div>
      <div className="border-t border-[var(--nv-border-2)] px-4 py-2 flex items-center gap-3 text-xs text-[var(--nv-text-tertiary)]">
        <span className="flex items-center gap-1 text-[var(--nv-success)]"><Icon name="check" size={12} /> {done}</span>
        <span className="flex items-center gap-1 text-[var(--nv-danger)]"><Icon name="x" size={12} /> {failed}</span>
        <span className="flex items-center gap-1"><Icon name="circle" size={12} /> {total - done - failed}</span>
        {generating && <span className="text-[var(--nv-accent)] ml-auto animate-pulse">{nodes.find((n) => n.id === generating[0])?.title?.slice(0, 15)}...</span>}
      </div>
    </div>
  );
}
