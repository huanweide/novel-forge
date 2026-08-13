/**
 * MonitorPanel — 监测面板
 *
 * 总字数 / 当前章字数 / Token估算 / 章节分布 / 数据统计。
 */

"use client";

import React, { useEffect, useState } from "react";

interface MonitorData {
  totalWords: number;
  totalChapters: number;
  completedChapters: number;
  completionRate: number;
  currentChapter: { id: string; title: string; wordCount: number; status: string } | null;
  tokens: { estimatedGenerated: number; estimatedPrompt: number; estimatedTotal: number; note: string };
  distribution: { avgWordsPerChapter: number; maxChapterWords: number; minChapterWords: number; chaptersWithContent: number };
  dataStats: { chapterSummaries: number; storyBeats: number; pendingCommitments: number };
}

export function MonitorPanel({ projectId, nodeId }: { projectId: string; nodeId?: string }) {
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ projectId });
        if (nodeId) params.set("nodeId", nodeId);
        const res = await fetch(`/api/stats/monitor?${params}`, { signal: controller.signal });
        if (res.ok) setData(await res.json());
      } catch {
        if (controller.signal.aborted) return;
      }
      setLoading(false);
    }
    load();
    return () => controller.abort();
  }, [projectId, nodeId]);

  if (loading) return <div className="p-4 text-xs text-zinc-500">加载监测数据...</div>;
  if (!data) return <div className="p-4 text-xs text-red-400">加载失败</div>;

  const fmt = (n: number) => n.toLocaleString("zh-CN");
  const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 总览 */}
      <div className="p-3 border-b border-white/[0.06]">
        <div className="text-[10px] text-zinc-500 mb-2">📊 字数概览</div>
        <div className="grid grid-cols-2 gap-2">
          <StatBlock label="总字数" value={fmt(data.totalWords)} color="text-zinc-200" />
          <StatBlock label="完成率" value={`${data.completionRate}%`} color={data.completionRate > 50 ? "text-green-400" : "text-yellow-400"} />
          {data.currentChapter && (
            <StatBlock label="当前章" value={fmt(data.currentChapter.wordCount)} color="text-indigo-300" sub={`${data.currentChapter.title}`} />
          )}
          <StatBlock label="均章字数" value={fmt(data.distribution.avgWordsPerChapter)} color="text-zinc-300" />
        </div>
      </div>

      {/* Token 估算 */}
      <div className="p-3 border-b border-white/[0.06]">
        <div className="text-[10px] text-zinc-500 mb-2">🔢 Token 估算</div>
        <div className="space-y-1.5">
          <TokenRow label="生成Token" value={data.tokens.estimatedGenerated} color="text-emerald-400" />
          <TokenRow label="Prompt消耗" value={data.tokens.estimatedPrompt} color="text-amber-400" />
          <TokenRow label="总计估算" value={data.tokens.estimatedTotal} color="text-zinc-200" bold />
        </div>
        <div className="text-[10px] text-zinc-600 mt-1.5 leading-relaxed">{data.tokens.note}</div>
      </div>

      {/* 章节分布 */}
      <div className="p-3 border-b border-white/[0.06]">
        <div className="text-[10px] text-zinc-500 mb-2">📈 章节分布</div>
        <div className="space-y-1">
          <Row label="有内容章节" value={`${data.distribution.chaptersWithContent} / ${data.totalChapters}`} />
          <Row label="最多字数" value={fmt(data.distribution.maxChapterWords)} />
          <Row label="最少字数" value={fmt(data.distribution.minChapterWords)} />
          <Row label="已完成" value={`${data.completedChapters} / ${data.totalChapters}`} />
        </div>
      </div>

      {/* 数据统计 */}
      <div className="p-3">
        <div className="text-[10px] text-zinc-500 mb-2">💾 数据记录</div>
        <div className="space-y-1">
          <Row label="章节摘要" value={String(data.dataStats.chapterSummaries)} />
          <Row label="故事转折点" value={String(data.dataStats.storyBeats)} />
          <Row label="伏笔/承诺" value={String(data.dataStats.pendingCommitments)} />
        </div>
      </div>
    </div>
  );
}

// ── 子组件 ──

function StatBlock({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="bg-zinc-800/30 rounded-lg p-2">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-600 truncate mt-0.5">{sub}</div>}
    </div>
  );
}

function TokenRow({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span className={`text-xs ${bold ? "font-semibold" : ""} ${color}`}>
        {value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : String(value)}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span className="text-[10px] text-zinc-300">{value}</span>
    </div>
  );
}

export default MonitorPanel;
