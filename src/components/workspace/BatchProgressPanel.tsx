"use client";

import type { StoryNodeData } from "./types";

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
    <div className="fixed bottom-4 right-4 z-50 w-72 bg-zinc-900 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-zinc-900">
        <div>
          <span className="text-sm font-medium">📝 批量生成</span>
          <span className="text-xs text-zinc-500 ml-2">{done + failed}/{total}</span>
        </div>
        <button onClick={onAbort} className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded border border-red-800 hover:border-red-700">停止</button>
      </div>
      <div className="max-h-64 overflow-y-auto px-3 py-2 space-y-1">
        {entries.map(([id, state]) => {
          const node = nodes.find((n) => n.id === id);
          const icon = state.status === "done" ? "✅" : state.status === "failed" ? "❌" : state.status === "generating" ? "⏳" : "○";
          return (
            <div key={id} className={`flex items-center gap-2 text-xs py-0.5 ${state.status === "generating" ? "text-amber-300" : state.status === "failed" ? "text-red-400" : "text-zinc-400"}`}>
              <span className="shrink-0">{icon}</span>
              <span className="truncate flex-1">{node?.title || id.slice(0, 8)}</span>
              {state.error && <span className="text-red-500 text-[10px] truncate max-w-[100px]" title={state.error}>{state.error.slice(0, 30)}</span>}
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/[0.06] px-4 py-2 flex items-center gap-3 text-xs text-zinc-500">
        <span>✅ {done}</span><span>❌ {failed}</span><span>○ {total - done - failed}</span>
        {generating && <span className="text-amber-400 ml-auto animate-pulse">{nodes.find((n) => n.id === generating[0])?.title?.slice(0, 15)}...</span>}
      </div>
    </div>
  );
}
