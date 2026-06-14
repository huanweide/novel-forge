"use client";

import { useState } from "react";
import type { ReviewIssue } from "./types";

export function ReviewPanel({
  reviewResult, onDismiss, onExplain, onFix,
}: {
  reviewResult: { passed: boolean; issues: ReviewIssue[] };
  onDismiss: () => void;
  onExplain: (issue: ReviewIssue, note: string) => void;
  onFix: (issue: ReviewIssue, note: string) => void;
}) {
  const [activeIssueIndex, setActiveIssueIndex] = useState<number | null>(null);
  const [actionType, setActionType] = useState<"explain" | "fix" | null>(null);
  const [note, setNote] = useState("");

  const handleAction = (index: number, type: "explain" | "fix") => {
    if (activeIssueIndex === index && actionType === type) {
      const issue = reviewResult.issues[index];
      if (type === "explain") onExplain(issue, note);
      else onFix(issue, note);
      setActiveIssueIndex(null); setActionType(null); setNote("");
    } else {
      setActiveIssueIndex(index); setActionType(type); setNote("");
    }
  };

  if (reviewResult.passed && reviewResult.issues.length === 0) {
    return (
      <div className="mt-6 border border-green-800 bg-green-900/20 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-green-400">✅ 审校通过</span>
          <button onClick={onDismiss} className="text-xs text-zinc-600 hover:text-zinc-400">✕</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 border border-amber-800 bg-amber-950/10 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm text-amber-400">⚠️ 审校发现 {reviewResult.issues.length} 个问题</h3>
        <button onClick={onDismiss} className="text-xs text-zinc-500 hover:text-zinc-300">全部忽略 ✕</button>
      </div>
      {reviewResult.issues.map((issue, i) => (
        <div key={i} className="mb-2 last:mb-0">
          <div className="flex items-start gap-2 text-xs">
            <span className={`shrink-0 px-1 py-0.5 rounded ${
              issue.severity === "critical" ? "bg-red-900/50 text-red-400" :
              issue.severity === "major" ? "bg-yellow-900/50 text-yellow-400" : "bg-zinc-800 text-zinc-400"
            }`}>{issue.severity}</span>
            <span className="text-zinc-400 flex-1">{issue.description}</span>
          </div>
          <div className="flex gap-2 mt-1 ml-1">
            <button onClick={() => handleAction(i, "explain")}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                activeIssueIndex === i && actionType === "explain" ? "border-indigo-600 text-indigo-400 bg-indigo-950/30" : "border-zinc-800 text-zinc-600 hover:text-zinc-300 hover:border-zinc-700"
              }`}>📝 补充信息</button>
            <button onClick={() => handleAction(i, "fix")}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                activeIssueIndex === i && actionType === "fix" ? "border-amber-600 text-amber-400 bg-amber-950/30" : "border-zinc-800 text-zinc-600 hover:text-zinc-300 hover:border-zinc-700"
              }`}>🔧 修复</button>
          </div>
          {activeIssueIndex === i && (
            <div className="mt-1.5 flex gap-1.5">
              <input className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
                placeholder={actionType === "explain" ? "说明为什么这不是问题（如：这个角色确实死了，之前有伏笔）" : "说明正确的逻辑（如：A和B在第3章已经和好，这里应该体现）"}
                value={note} onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAction(i, actionType!); }} autoFocus />
              <button onClick={() => handleAction(i, actionType!)} className="text-[10px] px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white shrink-0">确认</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
