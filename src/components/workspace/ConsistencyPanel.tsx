"use client";

// A 任务（v1.6.51.3）+ B 任务（v1.6.51.4）：跨章一致性事实基线 —— 最小 UI（只读优先 + 冲突标红）。
// 与右侧栏「未收尾线索」(ForeshadowingPanel) 同构：分组列表 + 顶部「手动重新抽取」按钮 + loading/empty/error。
// 数据源：GET /api/projects/[id]/consistency -> { facts }；POST 同路径触发重抽。
// 冲突：GET /api/projects/[id]/consistency/conflicts?status=open -> { conflicts }；POST 同路径更新 status。

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

export interface ConsistencyConflict {
  id: string;
  factId: string | null;
  category: string;
  description: string;
  excerpt: string;
  status: "open" | "resolved" | "ignored";
  createdAt: string;
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
  const [conflicts, setConflicts] = useState<ConsistencyConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [extracting, setExtracting] = useState(false);

  // 拉取基线（GET）+ 未处理冲突（GET）
  const load = () => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [fRes, cRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/consistency`),
          fetch(`/api/projects/${projectId}/consistency/conflicts?status=open`),
        ]);
        if (!fRes.ok) throw new Error(`基线 HTTP ${fRes.status}`);
        const fJson = await fRes.json(); // { facts: ConsistencyFact[] }
        const cJson = cRes.ok ? await cRes.json() : { conflicts: [] }; // { conflicts: ConsistencyConflict[] }
        if (!cancelled) {
          setFacts(((fJson.facts as ConsistencyFact[]) ?? []).map((f) => ({ ...f, category: f.category as ConsistencyCategory })));
          setConflicts((cJson.conflicts as ConsistencyConflict[]) ?? []);
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
      load(); // 重新拉取最新基线（同时刷新冲突：重抽会清旧建新）
    } catch (err) {
      setError(String(err));
    } finally {
      setExtracting(false);
    }
  };

  // 标记冲突状态（POST 更新 status → 从 open 列表移除）
  const resolveConflict = async (conflictId: string, status: "resolved" | "ignored") => {
    try {
      const res = await fetch(`/api/projects/${projectId}/consistency/conflicts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: conflictId, status }),
      });
      if (res.ok) {
        setConflicts((prev) => prev.filter((c) => c.id !== conflictId));
      }
    } catch {
      /* 失败静默：列表仍展示原冲突，作者可重试 */
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

  // 关联基线事实（用于冲突区展示「与哪条基线冲突」）
  const factById = (id: string | null) => (id ? facts.find((f) => f.id === id) : undefined);

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

      {/* 分组列表（只读事实） */}
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

        {/* 冲突区（B 任务）：open 冲突标红，作者逐条「已修正 / 忽略」 */}
        <div className="border-b border-[var(--nv-border-2)]/50">
          <div className="px-3 py-1.5 text-xs sticky top-0 bg-[var(--nv-surface-2)] backdrop-blur flex items-center justify-between">
            <span className="text-[var(--nv-danger)]">冲突（需处理）</span>
            <span className="text-[var(--nv-text-tertiary)] text-[10px]">{conflicts.length}</span>
          </div>
          {conflicts.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-[var(--nv-text-tertiary)]">
              未发现未处理冲突 ✓（生成新章节后自动比对基线）
            </div>
          ) : (
            conflicts.map((c) => {
              const rel = factById(c.factId);
              return (
                <div key={c.id} className="px-3 py-1.5 border-l-2 border-[var(--nv-danger)] bg-[var(--nv-danger)]/5">
                  <div className="text-xs text-[var(--nv-text-primary)]">{c.description}</div>
                  {c.excerpt && (
                    <div className="mt-0.5 text-[10px] text-[var(--nv-text-tertiary)] line-clamp-2">
                      摘录：「{c.excerpt}」
                    </div>
                  )}
                  {rel && (
                    <div className="mt-0.5 text-[10px] text-[var(--nv-text-tertiary)]">
                      冲突基线：{rel.subject} 的{rel.attribute} = {rel.value}
                    </div>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      onClick={() => resolveConflict(c.id, "resolved")}
                      className="rounded border border-[var(--nv-border-2)] px-1.5 py-0.5 text-[10px] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-3)]"
                    >
                      已修正
                    </button>
                    <button
                      onClick={() => resolveConflict(c.id, "ignored")}
                      className="rounded border border-[var(--nv-border-2)] px-1.5 py-0.5 text-[10px] text-[var(--nv-text-muted)] hover:bg-[var(--nv-surface-3)]"
                    >
                      忽略
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
