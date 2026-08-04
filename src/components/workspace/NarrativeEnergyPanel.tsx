"use client";

/**
 * NarrativeEnergyPanel — 叙事能量曲线面板
 *
 * 以 SVG 折线图展示各章叙事张力（能量）随章节的变化，标注峰值/谷值章节，
 * 并显示节奏诊断建议。数据来自 GET /api/narrative-energy（确定性、零 LLM）。
 * 样式与数据加载模式对齐 MonitorPanel。
 */

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";

interface NarrativeEnergyPoint {
  chapterId: string;
  chapterTitle: string;
  index: number;
  energy: number;
  raw: number;
}

interface Diagnosis {
  chapterCount: number;
  avgEnergy: number;
  peak: { index: number; chapterTitle: string; energy: number } | null;
  valley: { index: number; chapterTitle: string; energy: number } | null;
  variance: number;
  advice: string[];
}

interface EnergyData {
  points: NarrativeEnergyPoint[];
  diagnosis: Diagnosis;
}

export function NarrativeEnergyPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<EnergyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/narrative-energy?projectId=${encodeURIComponent(projectId)}`,
        );
        if (res.ok && !cancelled) setData(await res.json());
      } catch (e) {
        console.warn("[NarrativeEnergyPanel] 能量曲线加载失败（非关键，已忽略）", e);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="p-3 border-b border-[var(--nv-border-2)] text-xs text-[var(--nv-text-tertiary)]">
        加载叙事能量曲线...
      </div>
    );
  }
  if (!data || data.points.length === 0) {
    return (
      <div className="p-3 border-b border-[var(--nv-border-2)] text-xs text-[var(--nv-text-tertiary)] leading-relaxed">
        <div className="flex items-center gap-1 mb-1.5">
          <Icon name="chart" size={11} /> 叙事能量曲线
        </div>
        暂无章节摘要数据。先写几章正文（系统会自动生成章节摘要），即可看到张力起伏曲线。
      </div>
    );
  }

  const { points, diagnosis } = data;
  const n = points.length;

  // SVG 折线图几何（viewBox 自适应，实际渲染宽度由父容器决定）
  const W = 300;
  const H = 130;
  const PAD = { l: 26, r: 12, t: 14, b: 22 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (e: number) => PAD.t + (1 - e) * plotH;

  const linePts = points.map((p) => `${x(p.index)},${y(p.energy)}`).join(" ");
  const areaPts = `${PAD.l},${PAD.t + plotH} ${linePts} ${x(n - 1)},${PAD.t + plotH}`;

  return (
    <div className="p-3 border-b border-[var(--nv-border-2)]">
      <div className="flex items-center gap-1 text-[10px] text-[var(--nv-text-tertiary)] mb-2">
        <Icon name="chart" size={11} /> 叙事能量曲线
      </div>

      {/* 概览 */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Stat label="均值" value={diagnosis.avgEnergy.toFixed(2)} color="text-[var(--nv-text-primary)]" />
        <Stat
          label="峰值"
          value={diagnosis.peak ? `第${diagnosis.peak.index + 1}章` : "—"}
          color="text-[var(--nv-accent)]"
        />
        <Stat
          label="谷值"
          value={diagnosis.valley ? `第${diagnosis.valley.index + 1}章` : "—"}
          color="text-[var(--nv-success)]"
        />
      </div>

      {/* 折线图 */}
      <div className="relative w-full">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="叙事能量随章节变化曲线">
          {/* 网格基线（0.5 能量横线） */}
          <line
            x1={PAD.l}
            y1={y(0.5)}
            x2={W - PAD.r}
            y2={y(0.5)}
            stroke="var(--nv-border-2)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {/* 面积填充 */}
          <polygon points={areaPts} fill="var(--nv-primary)" fillOpacity={0.08} />
          {/* 折线 */}
          <polyline
            points={linePts}
            fill="none"
            stroke="var(--nv-primary)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* 数据点 */}
          {points.map((p) => (
            <circle
              key={p.chapterId}
              cx={x(p.index)}
              cy={y(p.energy)}
              r={2.5}
              fill="var(--nv-primary)"
            />
          ))}
          {/* 峰/谷标注 */}
          {diagnosis.peak && (
            <g>
              <circle cx={x(diagnosis.peak.index)} cy={y(diagnosis.peak.energy)} r={4} fill="none" stroke="var(--nv-accent)" strokeWidth={2} />
              <text x={x(diagnosis.peak.index)} y={y(diagnosis.peak.energy) - 8} textAnchor="middle" fontSize={9} fill="var(--nv-accent)">
                {`峰 ${diagnosis.peak.energy.toFixed(2)}`}
              </text>
            </g>
          )}
          {diagnosis.valley && diagnosis.valley.index !== diagnosis.peak?.index && (
            <g>
              <circle cx={x(diagnosis.valley.index)} cy={y(diagnosis.valley.energy)} r={4} fill="none" stroke="var(--nv-success)" strokeWidth={2} />
              <text x={x(diagnosis.valley.index)} y={y(diagnosis.valley.energy) + 14} textAnchor="middle" fontSize={9} fill="var(--nv-success)">
                {`谷 ${diagnosis.valley.energy.toFixed(2)}`}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* 节奏诊断 */}
      <div className="mt-2 space-y-1.5">
        <div className="text-[10px] text-[var(--nv-text-tertiary)]">节奏诊断</div>
        {diagnosis.advice.map((a, i) => (
          <div
            key={i}
            className="flex gap-1.5 text-[10px] text-[var(--nv-text-secondary)] leading-relaxed"
          >
            <span className="shrink-0 text-[var(--nv-accent)]">·</span>
            <span>{a}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[var(--nv-surface-1)] rounded-lg p-1.5">
      <div className="text-[9px] text-[var(--nv-text-tertiary)]">{label}</div>
      <div className={`text-xs font-semibold ${color} truncate`}>{value}</div>
    </div>
  );
}

export default NarrativeEnergyPanel;
