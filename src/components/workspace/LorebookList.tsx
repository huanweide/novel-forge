"use client";

import { useState } from "react";
import type { LorebookData } from "./types";
import { categoryLabel } from "./types";
import { RangeSelector } from "./RangeSelector";

// 预览结果类型（与 SSE preview 事件一致）
// 预览结果类型（SSE 只传摘要，不含完整 content）
interface PreviewGroup {
  clusterTheme: string;
  clusterType: string;
  sourceCount: number;
  sourceTitles: string[];
  resultCount: number;
  resultTitles: string[];
  resultKeys: string[];
  coverage?: { covered: number; total: number; missing: string[] };
}
interface PreviewData {
  groups: PreviewGroup[];
  sourceCount: number;
  resultCount: number;
  dedupRatio: number;
  coveragePct: number;
  missingNouns: string[];
}

const themeIcon = (t: string) => {
  if (t === "person") return "🧑";
  if (t === "faction") return "🏛";
  if (t === "history") return "📜";
  if (t === "location") return "📍";
  if (t === "system") return "⚙️";
  return "📦";
};

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

  // ── 确认面板状态 ──
  const [showConfirm, setShowConfirm] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewId, setPreviewId] = useState<string>(""); // 服务端缓存ID
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState("");

  // 一键导入
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importPct, setImportPct] = useState(0);
  const [importDone, setImportDone] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
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

  // 范围选择
  const handleRangeSelect = (indices: Set<number>) => {
    if (indices.size === 0) {
      setSelectedIds(new Set());
      return;
    }
    const ids = new Set<string>();
    for (const i of indices) {
      if (i < entries.length) ids.add(entries[i].id);
    }
    setSelectedIds(ids);
  };

  // ── 预览模式：AI 整理但不写库 ──
  const handleSummarize = async () => {
    if (selectedIds.size < 2) return;
    setSummarizing(true);
    setSumProgress("连接中...");
    setSumPct(0); setSumDone(0); setSumTotal(0);
    setPreview(null);

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
            } else if (event.type === "preview") {
              // 收集每个 cluster 的预览结果
              setSumProgress(event.message as string);
              if (event.pct !== undefined) setSumPct(event.pct as number);
              if (event.done !== undefined) setSumDone(event.done as number);
              if (event.total !== undefined) setSumTotal(event.total as number);
            } else if (event.type === "done") {
              setSumPct(100);
              setSumProgress(event.message as string);
              // 保存预览摘要 + 缓存ID
              if (event.preview) {
                setPreview(event.preview as PreviewData);
                setPreviewId((event.previewId as string) || "");
                setShowConfirm(true);
              }
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

  // ── 确认执行 ──
  const handleApply = async () => {
    if (!preview || applying) return;
    setApplying(true);
    setApplyMsg("正在写入...");

    try {
      const res = await fetch("/api/lorebook/summarize/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          previewId: previewId || undefined,
          // 降级：如果 previewId 不可用，传完整数据
          entryIds: previewId ? undefined : Array.from(selectedIds),
          results: previewId ? undefined : preview.groups.flatMap(g =>
            g.resultTitles.map((title, i) => ({
              title,
              content: "", // 旧路径需要完整 content，这里降级不支持
              keys: g.resultKeys || [],
            }))
          ),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setApplyMsg(data.message as string);
      setSelectedIds(new Set());
      setShowConfirm(false);
      setPreview(null);
      onRefresh();
    } catch (e) {
      setApplyMsg(`❌ ${e instanceof Error ? e.message : "写入失败"}`);
    } finally {
      setApplying(false);
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setPreview(null);
    setPreviewId("");
  };

  const handleImport = async () => {
    if (!importText.trim() || importText.trim().length < 10) return;
    setImporting(true);
    setImportMsg("连接中…");
    setImportPct(0); setImportDone(0); setImportTotal(0);
    setImportResult(null);
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
      {/* 工具栏 */}
      {entries.length > 0 && (
        <div className="flex items-center gap-1 mb-2 px-1">
          <button
            onClick={toggleAll}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {allSelected ? "取消全选" : "全选"}
          </button>
          <span className="text-zinc-700 text-[10px]">{selectedIds.size}/{entries.length}</span>
          <RangeSelector
            total={entries.length}
            onSelect={handleRangeSelect}
          />
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
            {summarizing ? "⏳ 分析中..." : "📐 整理"}
          </button>
        </div>
      )}

      {/* 进度条 */}
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

      {/* ══════════════════════════════════════════════ */}
      {/* 确认面板 */}
      {/* ══════════════════════════════════════════════ */}
      {showConfirm && preview && (
        <div className="mb-2 rounded border border-amber-700/30 bg-amber-950/10 overflow-hidden">
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-2 py-1.5 bg-amber-950/20 border-b border-amber-900/10">
            <span className="text-xs text-amber-300 font-medium">
              📚 整理预览 —— {preview.sourceCount}条 → {preview.resultCount}条（精简{preview.dedupRatio}%）
              {preview.coveragePct < 100 && (
                <span className="text-red-400 ml-1">⚠️专有名词保留{preview.coveragePct}%</span>
              )}
            </span>
            <button
              onClick={handleCancel}
              disabled={applying}
              className="text-zinc-500 hover:text-zinc-300 text-xs"
            >
              ×
            </button>
          </div>

          {/* 分组列表 */}
          <div className="max-h-64 overflow-y-auto">
            {preview.groups.map((group, gi) => (
              <div
                key={gi}
                className={`px-2 py-1.5 border-b border-zinc-800/50 ${
                  gi % 2 === 0 ? "bg-transparent" : "bg-zinc-900/20"
                }`}
              >
                {/* 组标题 */}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{themeIcon(group.clusterType)}</span>
                  <span className="text-xs text-amber-400 font-medium">
                    {group.clusterTheme}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {group.sourceCount}条→{group.resultCount}条
                  </span>
                </div>

                {/* 来源词条 */}
                <div className="text-[10px] text-zinc-600 ml-6 mb-1">
                  来源：{group.sourceTitles.map(t => `"${t}"`).join("、")}
                </div>

                {/* 覆盖校验警告 */}
                {group.coverage && group.coverage.missing.length > 0 && (
                  <div className="text-[10px] text-red-400 ml-6 mb-1">
                    ⚠️ 可能丢失：{group.coverage.missing.join("、")}
                  </div>
                )}

                {/* 生成结果 */}
                {group.resultTitles.map((title, ri) => (
                  <div key={ri} className="ml-6 mb-1 last:mb-0">
                    <div className="text-[11px] text-zinc-300">
                      → <span className="font-medium">{title}</span>
                    </div>
                  </div>
                ))}
                {group.resultKeys.length > 0 && (
                  <div className="text-[10px] text-zinc-600 ml-6 mt-0.5">
                    🔑 {group.resultKeys.slice(0, 8).join("、")}
                    {group.resultKeys.length > 8 ? ` 等${group.resultKeys.length}个` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 操作栏 */}
          <div className="flex items-center justify-between px-2 py-1.5 bg-zinc-900/30 border-t border-zinc-800/50">
            <span className="text-[10px] text-zinc-500">
              ⚠️ 将删除 {preview.sourceCount} 条词条，新建 {preview.resultCount} 条
            </span>
            <div className="flex items-center gap-2">
              {applyMsg && (
                <span className={`text-[10px] ${applyMsg.startsWith("❌") ? "text-red-400" : "text-green-400"}`}>
                  {applyMsg}
                </span>
              )}
              <button
                onClick={handleCancel}
                disabled={applying}
                className="text-[10px] px-2 py-0.5 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                🔙 取消
              </button>
              <button
                onClick={handleApply}
                disabled={applying}
                className={`text-[10px] px-3 py-0.5 rounded transition-colors ${
                  applying
                    ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                    : "bg-amber-700/40 text-amber-300 hover:bg-amber-700/60"
                }`}
              >
                {applying ? "⏳ 写入中..." : "✅ 确认整理"}
              </button>
            </div>
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
