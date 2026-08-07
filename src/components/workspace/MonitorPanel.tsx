/**
 * MonitorPanel — 监测面板
 *
 * 总字数 / 当前章字数 / Token估算 / 章节分布 / 数据统计。
 */

"use client";

import React, { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

interface MonitorData {
  totalWords: number;
  totalChapters: number;
  completedChapters: number;
  completionRate: number;
  confirmStats?: { pending: number; confirmed: number; total: number; progress: number; autoConfirmed?: number; autoRate?: number };
  currentChapter: { id: string; title: string; wordCount: number; status: string } | null;
  tokens: { estimatedGenerated: number; estimatedPrompt: number; estimatedTotal: number; note: string };
  distribution: { avgWordsPerChapter: number; maxChapterWords: number; minChapterWords: number; chaptersWithContent: number };
  dataStats: { chapterSummaries: number; storyBeats: number; pendingCommitments: number };
  dailyWords: { date: string; words: number }[];
  llmUsage: {
    since: string;
    totalCalls: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCost: number; // 美元
    byModel: { model: string; calls: number; tokens: number; cost: number }[];
  };
  projectLlm?: {
    since: string;
    totalCalls: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCost: number;
    byProject: { projectId: string | null; calls: number; tokens: number; cost: number }[];
  };
}

export function MonitorPanel({ projectId, nodeId }: { projectId: string; nodeId?: string }) {
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailyGoal, setDailyGoal] = useState<number>(0);
  const [goalInput, setGoalInput] = useState<string>("");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(`nf-daily-goal-${projectId}`) : null;
    if (saved) {
      const g = parseInt(saved, 10);
      if (!isNaN(g) && g > 0) { setDailyGoal(g); setGoalInput(String(g)); }
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ projectId });
        if (nodeId) params.set("nodeId", nodeId);
        const res = await fetch(`/api/stats/monitor?${params}`);
        if (res.ok && !cancelled) setData(await res.json());
      } catch (e) { console.warn("[MonitorPanel] 监测数据加载失败（非关键，已忽略）", e); }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [projectId, nodeId]);

  if (loading) return <div className="p-4 text-xs text-[var(--nv-text-tertiary)]">加载监测数据...</div>;
  if (!data) return <div className="p-4 text-xs text-[var(--nv-danger)]">加载失败</div>;

  const fmt = (n: number) => n.toLocaleString("zh-CN");
  const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const RMB_RATE = 7.2; // 美元→人民币固定汇率（估算，仅展示用）
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayWords = data?.dailyWords?.find((d) => d.date === todayStr)?.words || 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
      {/* 总览 */}
      <div className="p-3 border-b border-[var(--nv-border-2)]">
        <div className="flex items-center gap-1 text-[10px] text-[var(--nv-text-tertiary)] mb-2"><Icon name="chart" size={11} /> 字数概览</div>
        <div className="grid grid-cols-2 gap-2">
          <StatBlock label="总字数" value={fmt(data.totalWords)} color="text-[var(--nv-text-primary)]" />
          <StatBlock label="完成率" value={`${data.completionRate}%`} color={data.completionRate > 50 ? "text-[var(--nv-success)]" : "text-[var(--nv-accent)]"} />
          {data.currentChapter && (
            <StatBlock label="当前章" value={fmt(data.currentChapter.wordCount)} color="text-[var(--nv-primary)]" sub={`${data.currentChapter.title}`} />
          )}
          <StatBlock label="均章字数" value={fmt(data.distribution.avgWordsPerChapter)} color="text-[var(--nv-text-secondary)]" />
        </div>
      </div>

      {/* 确认流程看板 */}
      {data.confirmStats && (
        <div className="p-3 border-b border-[var(--nv-border-2)]">
          <div className="flex items-center gap-1 text-[10px] text-[var(--nv-text-tertiary)] mb-2"><Icon name="clipboard" size={11} /> 确认流程</div>
          <div className="grid grid-cols-2 gap-2">
            <StatBlock label="待确认" value={fmt(data.confirmStats.pending)} color={data.confirmStats.pending > 0 ? "text-[var(--nv-accent)]" : "text-[var(--nv-text-secondary)]"} />
            <StatBlock label="已确认定稿" value={fmt(data.confirmStats.confirmed)} color="text-[var(--nv-success)]" />
          </div>
          {typeof data.confirmStats.autoRate === "number" && data.confirmStats.confirmed > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <StatBlock label="智能自动放行" value={fmt(data.confirmStats.autoConfirmed ?? 0)} color="text-[var(--nv-primary)]" sub={`占比 ${data.confirmStats.autoRate}%`} />
              <StatBlock label="人工确认" value={fmt(Math.max(0, data.confirmStats.confirmed - (data.confirmStats.autoConfirmed ?? 0)))} color="text-[var(--nv-text-secondary)]" sub="人工点选的章" />
            </div>
          )}
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] text-[var(--nv-text-tertiary)] mb-1">
              <span>整本确认进度</span>
              <span>{data.confirmStats.progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--nv-surface-3)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--nv-success)] transition-all" style={{ width: `${data.confirmStats.progress}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Token 估算 */}
      <div className="p-3 border-b border-[var(--nv-border-2)]">
        <div className="flex items-center gap-1 text-[10px] text-[var(--nv-text-tertiary)] mb-2"><Icon name="tag" size={11} /> Token 估算</div>
        <div className="space-y-1.5">
          <TokenRow label="生成Token" value={data.tokens.estimatedGenerated} color="text-[var(--nv-success)]" />
          <TokenRow label="Prompt消耗" value={data.tokens.estimatedPrompt} color="text-[var(--nv-accent)]" />
          <TokenRow label="总计估算" value={data.tokens.estimatedTotal} color="text-[var(--nv-text-primary)]" bold />
        </div>
        <div className="text-[10px] text-[var(--nv-text-tertiary)] mt-1.5 leading-relaxed">{data.tokens.note}</div>
      </div>

      {/* AI 成本看板（全项目 · 本月） */}
      <div className="p-3 border-b border-[var(--nv-border-2)]">
        <div className="flex items-center gap-1 text-[10px] text-[var(--nv-text-tertiary)] mb-2"><Icon name="coins" size={11} /> AI 成本（全项目 · 本月）</div>
        <div className="grid grid-cols-2 gap-2">
          <StatBlock label="调用次数" value={fmt(data.llmUsage.totalCalls)} color="text-[var(--nv-text-primary)]" />
          <StatBlock label="Token 总量" value={fmt(data.llmUsage.totalTokens)} color="text-[var(--nv-primary)]" />
          <StatBlock
            label="估算花费"
            value={data.llmUsage.totalCalls > 0 && data.llmUsage.totalCost > 0 ? `¥${(data.llmUsage.totalCost * RMB_RATE).toFixed(2)}` : "单价未知"}
            color="text-[var(--nv-accent)]"
            sub={data.llmUsage.totalCalls > 0 && data.llmUsage.totalCost > 0 ? `≈ $${data.llmUsage.totalCost.toFixed(4)}` : "模型不在价格表"}
          />
          <StatBlock label="记录始于" value={data.llmUsage.since.slice(5)} color="text-[var(--nv-text-secondary)]" />
        </div>
        {data.llmUsage.byModel.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="text-[10px] text-[var(--nv-text-tertiary)]">按模型分布</div>
            {data.llmUsage.byModel.slice(0, 5).map((b) => (
              <div key={b.model} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="truncate text-[var(--nv-text-secondary)]" style={{ maxWidth: 130 }}>{b.model}</span>
                <span className="shrink-0 text-[var(--nv-text-tertiary)]">{b.calls}次 · {fmt(b.tokens)}tok · ¥{(b.cost * RMB_RATE).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
        {data.llmUsage.totalCalls === 0 && (
          <div className="text-[10px] text-[var(--nv-text-tertiary)] mt-1.5 leading-relaxed">暂无记录——自 {data.llmUsage.since} 起，每次 AI 调用会在此累计（含重试 / 故障转移的真实 token 与估算花费）。</div>
        )}
      </div>

      {/* AI 成本（当前项目 · 本月）—— P_c：按 projectId 聚合，与全局并列展示 */}
      {data.projectLlm && (
        <div className="p-3 border-b border-[var(--nv-border-2)]">
          <div className="flex items-center gap-1 text-[10px] text-[var(--nv-text-tertiary)] mb-2"><Icon name="coins" size={11} /> AI 成本（当前项目 · 本月）</div>
          <div className="grid grid-cols-2 gap-2">
            <StatBlock label="调用次数" value={fmt(data.projectLlm.totalCalls)} color="text-[var(--nv-text-primary)]" />
            <StatBlock label="Token 总量" value={fmt(data.projectLlm.totalTokens)} color="text-[var(--nv-primary)]" />
            <StatBlock
              label="估算花费"
              value={data.projectLlm.totalCalls > 0 && data.projectLlm.totalCost > 0 ? `¥${(data.projectLlm.totalCost * RMB_RATE).toFixed(2)}` : "单价未知"}
              color="text-[var(--nv-accent)]"
              sub={data.projectLlm.totalCalls > 0 && data.projectLlm.totalCost > 0 ? `≈ $${data.projectLlm.totalCost.toFixed(4)}` : "模型不在价格表"}
            />
            <StatBlock
              label="占全局比"
              value={data.llmUsage.totalTokens > 0 ? `${((data.projectLlm.totalTokens / data.llmUsage.totalTokens) * 100).toFixed(1)}%` : "—"}
              color="text-[var(--nv-text-secondary)]"
            />
          </div>
        </div>
      )}

      {/* 章节分布 */}
      <div className="p-3 border-b border-[var(--nv-border-2)]">
        <div className="flex items-center gap-1 text-[10px] text-[var(--nv-text-tertiary)] mb-2"><Icon name="chart" size={11} /> 章节分布</div>
        <div className="space-y-1">
          <Row label="有内容章节" value={`${data.distribution.chaptersWithContent} / ${data.totalChapters}`} />
          <Row label="最多字数" value={fmt(data.distribution.maxChapterWords)} />
          <Row label="最少字数" value={fmt(data.distribution.minChapterWords)} />
          <Row label="已完成" value={`${data.completedChapters} / ${data.totalChapters}`} />
        </div>
      </div>

      {/* 数据统计 */}
      <div className="p-3">
        <div className="flex items-center gap-1 text-[10px] text-[var(--nv-text-tertiary)] mb-2"><Icon name="save" size={11} /> 数据记录</div>
        <div className="space-y-1">
          <Row label="章节摘要" value={String(data.dataStats.chapterSummaries)} />
          <Row label="故事转折点" value={String(data.dataStats.storyBeats)} />
          <Row label="伏笔/承诺" value={String(data.dataStats.pendingCommitments)} />
        </div>
      </div>

      {/* 写作节奏（近 7 天） */}
      <div className="p-3 border-t border-[var(--nv-border-2)]">
        <div className="flex items-center gap-1 text-[10px] text-[var(--nv-text-tertiary)] mb-2"><Icon name="chart" size={11} /> 写作节奏（近 7 天）</div>
        <div className="flex h-16 items-end gap-1">
          {data.dailyWords.slice(-7).map((d) => {
            const max = Math.max(1, ...data.dailyWords.slice(-7).map((x) => x.words));
            const h = d.words > 0 ? Math.max(6, Math.round((d.words / max) * 54)) : 2;
            const isToday = d.date === todayStr;
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t ${isToday ? "bg-[var(--nv-primary)]" : "bg-[var(--nv-surface-3)]"}`}
                    style={{ height: `${h}px` }}
                    title={`${d.date}：${fmt(d.words)}字`}
                  />
                </div>
                <span className="text-[8px] text-[var(--nv-text-muted-on-surface-3)]">{d.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 每日目标 */}
      <div className="p-3 border-t border-[var(--nv-border-2)]">
        <div className="flex items-center gap-1 text-[10px] text-[var(--nv-text-tertiary)] mb-2"><Icon name="target" size={11} /> 每日目标</div>
        {dailyGoal > 0 ? (
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0">
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: `conic-gradient(var(--nv-success) ${Math.min(100, Math.round((todayWords / dailyGoal) * 100))}%, var(--nv-surface-3) 0)` }}
              />
              <div className="absolute inset-[3px] flex items-center justify-center rounded-full bg-[var(--nv-surface-1)] text-[9px] text-[var(--nv-text-secondary)]">
                {Math.min(100, Math.round((todayWords / dailyGoal) * 100))}%
              </div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-[var(--nv-text-primary)]">今日 {fmt(todayWords)} / {fmt(dailyGoal)} 字</div>
              <button
                onClick={() => { setDailyGoal(0); setGoalInput(""); localStorage.removeItem(`nf-daily-goal-${projectId}`); }}
                className="text-[10px] text-[var(--nv-text-muted)] transition-colors hover:text-[var(--nv-text-secondary)]"
              >清除目标</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="如 2000"
              className="input-glass w-24 rounded px-2 py-1 text-xs"
            />
            <Button
              size="sm"
              onClick={() => {
                const g = parseInt(goalInput, 10);
                if (!isNaN(g) && g > 0) { setDailyGoal(g); localStorage.setItem(`nf-daily-goal-${projectId}`, String(g)); }
              }}
              className="btn-primary h-7 text-xs"
            >设定</Button>
          </div>
        )}
        {/* 近 7 天打卡节奏（与状态栏同源：dailyWords 取近 14 天，按 dailyGoal 判定达标） */}
        <div className="mt-3">
          <div className="flex items-center gap-1 text-[10px] text-[var(--nv-text-tertiary)] mb-1.5">近 7 天节奏</div>
          <div className="flex gap-1">
            {data.dailyWords.slice(-7).map((d) => {
              const reached = dailyGoal > 0 && d.words >= dailyGoal;
              const isToday = d.date === todayStr;
              const wd = ["日", "一", "二", "三", "四", "五", "六"][new Date(d.date + "T00:00:00").getDay()];
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}：${fmt(d.words)}字`}>
                  <div className={`w-full h-7 rounded flex items-center justify-center text-[9px] ${reached ? "bg-[var(--nv-success)]/20 text-[var(--nv-success)]" : "bg-[var(--nv-surface-3)] text-[var(--nv-text-muted-on-surface-3)]"} ${isToday ? "ring-1 ring-[var(--nv-primary)]" : ""}`}>
                    {reached ? "✓" : (d.words >= 1000 ? `${(d.words / 1000).toFixed(1)}k` : d.words)}
                  </div>
                  <span className="text-[8px] text-[var(--nv-text-muted-on-surface-3)]">{wd}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 子组件 ──

function StatBlock({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="bg-[var(--nv-surface-1)] rounded-lg p-2">
      <div className="text-[10px] text-[var(--nv-text-tertiary)]">{label}</div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--nv-text-tertiary)] truncate mt-0.5">{sub}</div>}
    </div>
  );
}

function TokenRow({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-[var(--nv-text-tertiary)]">{label}</span>
      <span className={`text-xs ${bold ? "font-semibold" : ""} ${color}`}>
        {value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : String(value)}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-[var(--nv-text-tertiary)]">{label}</span>
      <span className="text-[10px] text-[var(--nv-text-secondary)]">{value}</span>
    </div>
  );
}

export default MonitorPanel;
