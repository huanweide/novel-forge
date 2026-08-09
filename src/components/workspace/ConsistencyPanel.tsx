"use client";

// A 任务（v1.6.51.3）：跨章一致性事实基线 —— 最小 UI（只读优先）。
// 与右侧栏「未收尾线索」(ForeshadowingPanel) 同构：分组列表 + 顶部「手动重新抽取」按钮 + loading/empty/error。
// 数据源：GET /api/projects/[id]/consistency -> { facts }；POST 同路径触发 LLM 重抽 -> { ok, count, facts }。

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";

export type ConsistencyCategory = "character" | "world" | "plot" | "relationship";

export interface ConsistencyFact {
  id: string;
  projectId: string;
  category: ConsistencyCategory;
  subject: string;
  attribute: string;
  value: string;
  source: string;
  confidence: number;
  createdAt: string; // ISO 字符串
}

const CATEGORY_ORDER: ConsistencyCategory[] = ["character", "world", "plot", "relationship"];
const CATEGORY_LABEL: Record<ConsistencyCategory, string> = {
  character: "人物",
  world: "世界",
  plot: "情节",
  relationship: "关系",
};

export function ConsistencyPanel({ projectId }: { projectId: string }) {
  const [facts, setFacts] = useState<ConsistencyFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [extracting, setExtracting] = useState(false);

  // 拉取基线（GET）
  const load = () => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/projects/${projectId}/consistency`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json(); // { facts: ConsistencyFact[] }
        if (!cancelled) {
          setFacts(((json.facts as ConsistencyFact[]) ?? []).map((f) => ({ ...f, category: f.category as ConsistencyCategory })));
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  };

  useEffect(load, [projectId]);

  // 手动重新抽取（POST → 回拉 GET 刷新）
  const reExtract = async () => {
    if (extracting) return;
    setExtracting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/consistency`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      load(); // 重新拉取最新基线（POST 返回 facts，但 GET 排序更稳）
    } catch (err) {
      setError(String(err));
    } finally {
      setExtracting(false);
    }
  };

  // 最近更新：取全部事实里 createdAt 最大者
  const latestTs = facts.reduce((m, f) => {
    const t = new Date(f.createdAt).getTime();
    return Number.isFinite(t) && t > m ? t : m;
  }, 0);
  const latestStr = latestTs
    ? new Date(latestTs).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
    : "—";

  if (loading) {
    return <div className="p-4 text-xs text-[var(--nv-text-tertiary)]">加载一致性基线…</div>;
  }
  if (error) {
    return <div className="p-4 text-xs text-[var(--nv-danger)]">加载失败：{error}</div>;
  }

  // 按 category 分组（只保留非空组，按 CATEGORY_ORDER 排序）
  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: facts.filter((f) => f.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col h-full">
      {/* 顶部：统计 + 重抽按钮 */}
      <div className="px-3 py-2 border-b border-[var(--nv-border-2)] text-[10px] text-[var(--nv-text-tertiary)]">
        <div className="flex items-center justify-between gap-2">
          <span>
            共 {facts.length} 条事实 · 最近更新 {latestStr}
          </span>
          <button
            onClick={reExtract}
            disabled={extracting}
            className="flex items-center gap-1 rounded border border-[var(--nv-border-2)] px-2 py-0.5 text-[10px] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-3)] disabled:opacity-50"
          >
            <Icon name="refresh" size={10} className={extracting ? "animate-spin" : ""} />
            {extracting ? "抽取中…" : "手动重新抽取"}
          </button>
        </div>
        <div className="mt-1 text-[var(--nv-text-muted)]">
          章节确认定稿后自动抽取；此处只读，可手动重抽。
        </div>
      </div>

      {/* 分组列表（只读） */}
      <div className="flex-1 overflow-y-auto">
        {facts.length === 0 && (
          <div className="p-4 text-xs text-[var(--nv-text-tertiary)]">
            暂无基线事实。确认至少一章定稿后会自动生成，或点右上「手动重新抽取」立即生成。
          </div>
        )}
        {groups.map((g) => (
          <div key={g.cat} className="border-b border-[var(--nv-border-2)]/50">
            <div className="px-3 py-1.5 text-xs text-[var(--nv-text-secondary)] sticky top-0 bg-[var(--nv-surface-2)] backdrop-blur">
              {CATEGORY_LABEL[g.cat]}
              <span className="text-[var(--nv-text-tertiary)] text-[10px] ml-1">{g.items.length}</span>
            </div>
            {g.items.map((f) => (
              <div key={f.id} className="px-3 py-1.5 hover:bg-[var(--nv-surface-2)]">
                <div className="text-xs text-[var(--nv-text-primary)]">
                  <span className="text-[var(--nv-primary)] font-medium">{f.subject}</span>
                  <span className="text-[var(--nv-text-tertiary)]"> 的{f.attribute} = </span>
                  <span>{f.value}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--nv-text-tertiary)]">
                  <span>来源：{f.source || "—"}</span>
                  <span>置信度：{Math.round((f.confidence ?? 1) * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
