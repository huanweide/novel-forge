"use client";

import React, { useMemo } from "react";

interface WcNode {
  id: string;
  title?: string | null;
  wordCount?: number | null;
}

/**
 * ChapterWordCountChart —— 章节字数分布图（纯前端零 token）
 *
 * 数据源：storyNodes[].wordCount（与 RightPanel 统计条同源）。
 * 自适应阈值：以「均值」为基准——明显低于均值（<60%）判定为「太水」，
 * 明显高于均值（>150%）判定为「超长」，其余为正常。任何篇幅的书都自适应。
 * 视觉：圆角柱 + 均值参考虚线 + 悬停高亮 + 摘要（最水章/最长章/均值）。
 */

const W = 640;
const H = 260;
const PAD_L = 34;
const PAD_R = 10;
const PAD_T = 14;
const PAD_B = 30;

export function ChapterWordCountChart({ nodes }: { nodes: WcNode[] }) {
  const chapters = useMemo(
    () =>
      nodes
        .map((n, i) => ({
          id: n.id,
          title: n.title || `第${i + 1}章`,
          wc: Number(n.wordCount) || 0,
        }))
        .filter((_, i) => i >= 0),
    [nodes],
  );

  const stats = useMemo(() => {
    if (chapters.length === 0) return null;
    const vals = chapters.map((c) => c.wc);
    const total = vals.reduce((s, v) => s + v, 0);
    const mean = total / vals.length;
    const max = Math.max(...vals, 1);
    const minC = chapters.reduce((a, b) => (b.wc < a.wc ? b : a));
    const maxC = chapters.reduce((a, b) => (b.wc > a.wc ? b : a));
    return { total, mean, max, minC, maxC, low: mean * 0.6, high: mean * 1.5 };
  }, [chapters]);

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-40 text-[11px] text-[var(--nv-text-muted)]">
        还没有带正文的章节，先去写几章再来这里看分布吧。
      </div>
    );
  }

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const slot = plotW / chapters.length;
  const barW = Math.max(2, Math.min(26, slot * 0.66));
  const yOf = (wc: number) => PAD_T + plotH * (1 - wc / stats.max);
  const yMean = yOf(stats.mean);

  const colorOf = (wc: number) =>
    wc < stats.low ? "var(--nv-danger)" : wc > stats.high ? "var(--nv-warning)" : "var(--nv-primary)";

  return (
    <div className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3">
      {/* 摘要行 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[10px]">
        <span className="text-[var(--nv-text-muted)]">
          共 <b className="text-[var(--nv-text-secondary)]">{chapters.length}</b> 章 · 总 <b className="text-[var(--nv-text-secondary)]">{stats.total.toLocaleString()}</b> 字
        </span>
        <span className="text-[var(--nv-text-muted)]">
          均值 <b className="text-[var(--nv-text-secondary)]">{Math.round(stats.mean).toLocaleString()}</b>
        </span>
        <span className="flex items-center gap-1 text-[var(--nv-danger)]">
          <span className="w-2 h-2 rounded-sm bg-[var(--nv-danger)]" /> 最水：{stats.minC.title.slice(0, 8)}（{stats.minC.wc}）
        </span>
        <span className="flex items-center gap-1 text-[var(--nv-warning)]">
          <span className="w-2 h-2 rounded-sm bg-[var(--nv-warning)]" /> 最长：{stats.maxC.title.slice(0, 8)}（{stats.maxC.wc}）
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="章节字数分布柱状图">
        {/* 均值参考线 */}
        <line x1={PAD_L} y1={yMean} x2={W - PAD_R} y2={yMean} stroke="var(--nv-text-tertiary)" strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
        <text x={W - PAD_R} y={yMean - 4} textAnchor="end" fontSize={9} fill="var(--nv-text-tertiary)">
          均值 {Math.round(stats.mean).toLocaleString()}
        </text>

        {/* 柱子 */}
        {chapters.map((c, i) => {
          const x = PAD_L + slot * i + (slot - barW) / 2;
          const y = yOf(c.wc);
          const h = Math.max(PAD_T + plotH - y, 0);
          const color = colorOf(c.wc);
          return (
            <g key={c.id} className="group">
              <rect x={x} y={y} width={barW} height={h} rx={2.5} fill={color} opacity={0.82} className="transition-opacity group-hover:opacity-100">
                <title>{`${c.title}：${c.wc.toLocaleString()} 字`}</title>
              </rect>
              {/* 悬停高亮描边 */}
              <rect x={x} y={y} width={barW} height={h} rx={2.5} fill="none" stroke="var(--nv-text-primary)" strokeWidth={1} opacity={0} className="group-hover:opacity-60 transition-opacity pointer-events-none" />
              {/* 章号 */}
              <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize={8} fill="var(--nv-text-tertiary)" className="pointer-events-none">
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* 基线 */}
        <line x1={PAD_L} y1={PAD_T + plotH} x2={W - PAD_R} y2={PAD_T + plotH} stroke="var(--nv-border-2)" strokeWidth={1} />
      </svg>

      {/* 图例 */}
      <div className="flex items-center gap-3 mt-1 text-[9px] text-[var(--nv-text-tertiary)]">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--nv-primary)]" /> 正常</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--nv-danger)]" /> 太水（&lt;均值60%）</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--nv-warning)]" /> 超长（&gt;均值150%）</span>
      </div>
    </div>
  );
}

export default ChapterWordCountChart;
