"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Icon } from "@/components/ui/icons";

interface Stat {
  median: number;
  p95: number;
  avg: number;
}

interface MetricsPayload {
  ok: boolean;
  error?: string;
  empty?: boolean;
  sampleSize?: number;
  firstToken?: Stat | null;
  total?: Stat | null;
  throughput?: number | null;
  byProvider?: { local?: Stat | null; cloud?: Stat | null };
  overThreshold?: boolean;
  thresholdMs?: number;
  timeSpanMs?: number;
}

function StatBlock({
  label,
  value,
  unit,
  danger,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  danger?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex-1 rounded-md border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1.5">
      <div className="text-[10px] text-[var(--nv-text-muted)] leading-tight">{label}</div>
      <div className={`text-sm font-semibold ${danger ? "text-[var(--nv-danger)]" : "text-[var(--nv-text-primary)]"}`}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-normal text-[var(--nv-text-tertiary)]">{unit}</span>}
      </div>
      {hint && <div className="text-[9px] text-[var(--nv-text-tertiary)] leading-tight">{hint}</div>}
    </div>
  );
}

function fmt(ms?: number | null): string {
  if (ms == null) return "—";
  if (ms >= 1000) return (ms / 1000).toFixed(2);
  return String(ms);
}

function ProviderBar({ label, stat, color }: { label: string; stat?: Stat | null; color: string }) {
  const p95 = stat?.p95 ?? 0;
  // 以 4s 为满刻度的相对条形（仅视觉参考，非绝对标尺）
  const width = Math.min(100, (p95 / 4000) * 100);
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-10 shrink-0 text-[var(--nv-text-muted)]">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--nv-surface-3)]">
        <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
      <span className="w-16 shrink-0 text-right tabular-nums text-[var(--nv-text-secondary)]">
        P95 {fmt(p95)}{p95 >= 1000 ? "s" : "ms"}
      </span>
    </div>
  );
}

export function GenerationLatencyPanel() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // IMP-019 修复：从路由参数（useParams）提取当前 projectId 透传给指标接口，
  // 避免未传 projectId 时查询全站数据、导致每个项目都显示全站红告警误导用户。
  // 原实现用 window.location.pathname 正则 /workspace\/([^/]+)/ 强制要求尾斜杠，
  // 而 Next.js 默认 /workspace/<id> 无尾斜杠，导致匹配失败、projectId=undefined、
  // fetch 回退全站聚合返回全局红。改用 useParams 直接从路由段取 projectId，
  // 在 /workspace/[projectId] 路由树下必能稳定取到（不依赖 URL 字符串形态）。
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/generation-metrics${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`)
      .then((r) => r.json())
      .then((d: MetricsPayload) => {
        if (!alive) return;
        if (!d.ok) {
          setError(d.error ?? "加载失败");
        } else {
          setData(d);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  return (
    <section className="border-b border-[var(--nv-border-2)] px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon name="zap" size={15} className="text-[var(--nv-primary)]" />
        <span className="text-xs font-semibold text-[var(--nv-text-secondary)]">生成延迟</span>
        <span className="text-[9px] text-[var(--nv-text-tertiary)]">智能体团队硬指标</span>
      </div>

      {loading && <div className="py-3 text-[11px] text-[var(--nv-text-muted)]">加载延迟数据…</div>}

      {error && (
        <div className="rounded-md border border-[var(--nv-danger)]/40 bg-[var(--nv-danger)]/10 px-2 py-1.5 text-[11px] text-[var(--nv-danger)]">
          延迟统计加载失败：{error}
        </div>
      )}

      {!loading && !error && data?.empty && (
        <div className="rounded-md border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-2 text-[11px] leading-relaxed text-[var(--nv-text-muted)]">
          尚无生成记录。生成任意正文 / 摘要后，这里会显示真实耗时分布——首 token 延迟、总耗时 P95、输出吞吐，以及本地推理 vs 云端 API 的延迟对比。
        </div>
      )}

      {!loading && !error && data && !data.empty && data.total && (
        <>
          {data.overThreshold && (
            <div className="mb-2 flex items-start gap-1.5 rounded-md border border-[var(--nv-danger)]/50 bg-[var(--nv-danger)]/10 px-2 py-1.5 text-[11px] leading-snug text-[var(--nv-danger)]">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
              <span>
                总延迟 P95 超过 {fmt(data.thresholdMs)}ms 阈值——按「超过两秒就是失败」原则，生成链路偏慢。
                {data.byProvider?.local && data.byProvider?.cloud
                  ? " 可对比下方本地/云端延迟，优先切本地推理。"
                  : " 建议检查代理 / 网络，或切换本地推理（Ollama）。"}
              </span>
            </div>
          )}

          <div className="mb-2 flex gap-1.5">
            <StatBlock
              label="首 token"
              value={fmt(data.firstToken?.p95)}
              unit={data.firstToken && data.firstToken.p95 >= 1000 ? "s" : "ms"}
              hint="流式到首个字"
            />
            <StatBlock
              label="总延迟 P95"
              value={fmt(data.total.p95)}
              unit={data.total.p95 >= 1000 ? "s" : "ms"}
              danger={data.overThreshold}
              hint="端到端 95 分位"
            />
            <StatBlock
              label="吞吐"
              value={data.throughput != null ? String(data.throughput) : "—"}
              unit="tok/s"
              hint="输出速度"
            />
            <StatBlock label="样本" value={String(data.sampleSize ?? 0)} hint="近 300 次" />
          </div>

          {(data.byProvider?.local || data.byProvider?.cloud) && (
            <div className="mb-2 space-y-1">
              <div className="text-[10px] text-[var(--nv-text-muted)]">本地 vs 云端（总延迟 P95）</div>
              {data.byProvider?.local && (
                <ProviderBar label="本地" stat={data.byProvider.local} color="var(--nv-success)" />
              )}
              {data.byProvider?.cloud && (
                <ProviderBar label="云端" stat={data.byProvider.cloud} color="var(--nv-primary)" />
              )}
            </div>
          )}

          <div className="text-[9px] leading-snug text-[var(--nv-text-tertiary)]">
            数据来自每次真实生成的计时（含重试全链路）。本地推理 = Ollama 本机 GPU，零网络往返；云端 = DeepSeek / 硅基流动等 API。采样跨度{" "}
            {data.timeSpanMs ? `${Math.round(data.timeSpanMs / 60000)} 分钟` : "—"}。
          </div>
        </>
      )}
    </section>
  );
}
