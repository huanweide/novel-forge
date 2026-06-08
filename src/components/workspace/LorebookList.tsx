"use client";

import { useState } from "react";
import type { LorebookData } from "./types";
import { categoryLabel } from "./types";

export function LorebookList({
  projectId,
  entries,
  onEdit,
  onDelete,
  onNew,
  onRefresh,
}: {
  projectId: string;
  entries: LorebookData[];
  onEdit: (l: LorebookData) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onRefresh: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [summarizing, setSummarizing] = useState(false);
  const [sumProgress, setSumProgress] = useState("");
  const [sumPct, setSumPct] = useState(0);
  const [sumDone, setSumDone] = useState(0);
  const [sumTotal, setSumTotal] = useState(0);

  // 一键导入
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importPct, setImportPct] = useState(0);
  const [importDone, setImportDone] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  // 结果提示（独立于进度条，结束后仍显示）
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string } | null>(null);

  const allSelected = entries.length > 0 && selectedIds.size === entries.length;

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(entries.map(e => e.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const handleSummarize = async () => {
    if (selectedIds.size < 2) return;
    setSummarizing(true);
    setSumProgress("连接中...");
    setSumPct(0);
    setSumDone(0);
    setSumTotal(0);

    try {
      const res = await fetch("/api/lorebook/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, entryIds: Array.from(selectedIds) }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setSumProgress(`❌ ${err.error || "失败"}`);
        setSummarizing(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法获取响应流");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          if (!chunk.trim()) continue;
          const dataLine = chunk.split("\n").find(l => l.trim().startsWith("data: "));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.trim().slice(6));

            if (event.type === "progress") {
              setSumProgress(event.message as string);
              if (event.pct !== undefined) setSumPct(event.pct as number);
              if (event.done !== undefined) setSumDone(event.done as number);
              if (event.total !== undefined) setSumTotal(event.total as number);
            } else if (event.type === "done") {
              setSumPct(100);
              setSumProgress(event.message as string);
              setSelectedIds(new Set());
              onRefresh();
            } else if (event.type === "error") {
              setSumProgress(`❌ ${event.message}`);
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setSumProgress(`❌ ${e instanceof Error ? e.message : "网络错误"}`);
    } finally {
      setSummarizing(false);
    }
  };

  const handleImport = async () => {
    if (!importText.trim() || importText.trim().length < 10) return;
    setImporting(true);
    setImportMsg("连接中…");
    setImportPct(0); setImportDone(0); setImportTotal(0);
    setImportResult(null); // 清掉上次结果
    try {
      const res = await fetch("/api/lorebook/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, text: importText }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setImportResult({ ok: false, message: `❌ ${errBody.error || "请求失败"}` });
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("无响应流");
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() || "";
        for (const chunk of chunks) {
          const dataLine = chunk.split("\n").find(l => l.trim().startsWith("data: "));
          if (!dataLine) continue;
          try {
            const ev = JSON.parse(dataLine.trim().slice(6));
            if (ev.type === "progress") {
              setImportMsg(ev.message as string);
              if (ev.pct !== undefined) setImportPct(ev.pct as number);
              if (ev.done !== undefined) setImportDone(ev.done as number);
              if (ev.total !== undefined) setImportTotal(ev.total as number);
            } else if (ev.type === "done") {
              setImportPct(100);
              setImportResult({ ok: true, message: ev.message as string });
              setImportText("");
              onRefresh();
            } else if (ev.type === "error") {
              setImportResult({ ok: false, message: `❌ ${ev.message}` });
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setImportResult({ ok: false, message: `❌ ${e instanceof Error ? e.message : "网络错误"}` });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-1">
      {/* 工具栏：全选 + 精简总结 */}
      {entries.length > 0 && (
        <div className="flex items-center gap-1 mb-2 px-1">
          <button
            onClick={toggleAll}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {allSelected ? "取消全选" : "全选"}
          </button>
          <span className="text-zinc-700 text-[10px]">{selectedIds.size}/{entries.length}</span>
          <div className="flex-1" />
          <button
            onClick={() => setShowImport(!showImport)}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              showImport
                ? "bg-green-900/40 text-green-400"
                : "text-zinc-500 hover:text-green-400"
            }`}
          >
            📥 导入
          </button>
          <button
            onClick={handleSummarize}
            disabled={selectedIds.size < 2 || summarizing}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              selectedIds.size >= 2 && !summarizing
                ? "bg-amber-900/40 text-amber-400 hover:bg-amber-900/60"
                : "text-zinc-600 cursor-not-allowed"
            }`}
          >
            {summarizing ? "⏳ 精简中..." : "📐 整理"}
          </button>
        </div>
      )}

      {/* 总结进度条 */}
      {summarizing && (
        <div className="px-1 mb-2">
          <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
            <span>{sumProgress}</span>
            <span>{sumDone}/{sumTotal}</span>
          </div>
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(sumPct, 5)}%` }}
            />
          </div>
        </div>
      )}

      {/* 一键导入区 */}
      {showImport && (
        <div className="mb-2 p-2 rounded bg-green-950/10 border border-green-900/20 space-y-2">
          <p className="text-[10px] text-zinc-500">
            粘贴世界设定文本，AI 自动提取术语、概念、势力、地点等词条
          </p>
          <textarea
            value={importText}
            onChange={e => { setImportText(e.target.value); setImportResult(null); }}
            placeholder="粘贴设定文本…（如：青云宗是天下第一仙门，位于青云山脉。掌门青云子修为已至大乘期…）"
            rows={4}
            disabled={importing}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none focus:border-green-700"
          />
          <div className="flex items-center justify-between">
            <button
              onClick={handleImport}
              disabled={importText.trim().length < 10 || importing}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                importText.trim().length >= 10 && !importing
                  ? "bg-green-700/40 text-green-400 hover:bg-green-700/60"
                  : "text-zinc-600 cursor-not-allowed"
              }`}
            >
              {importing ? "⏳ 分析中…" : "🚀 开始导入"}
            </button>
            <button
              onClick={() => { setShowImport(false); setImportText(""); setImportResult(null); }}
              disabled={importing}
              className="text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              取消
            </button>
          </div>
          {/* 导入进度 */}
          {importing && (
            <div>
              <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
                <span>{importMsg}</span>
                <span>{importDone}/{importTotal || "?"}</span>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(importPct, 5)}%` }}
                />
              </div>
            </div>
          )}
          {/* 结果提示（进度条消失后仍显示） */}
          {!importing && importResult && (
            <div
              className={`text-[10px] px-2 py-1 rounded ${
                importResult.ok
                  ? "bg-green-950/30 text-green-400 border border-green-900/20"
                  : "bg-red-950/30 text-red-400 border border-red-900/20"
              }`}
            >
              {importResult.message}
            </div>
          )}
        </div>
      )}

      {/* 词条列表 */}
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex items-center gap-2 py-1.5 px-2 rounded text-xs text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300 group"
        >
          <input
            type="checkbox"
            checked={selectedIds.has(e.id)}
            onChange={() => toggleOne(e.id)}
            onClick={(ev) => ev.stopPropagation()}
            className="rounded accent-amber-600 shrink-0"
          />
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.enabled ? "bg-green-500" : "bg-zinc-700"}`}
          />
          <span
            className="flex-1 truncate cursor-pointer"
            onClick={() => onEdit(e)}
          >
            {e.title}
          </span>
          <span className="text-zinc-600 text-[10px]">{categoryLabel(e.category)}</span>
        </div>
      ))}

      <button
        onClick={onNew}
        className="w-full text-left text-xs text-indigo-400 hover:text-indigo-300 py-1 px-2"
      >
        + 添加词条
      </button>
    </div>
  );
}
