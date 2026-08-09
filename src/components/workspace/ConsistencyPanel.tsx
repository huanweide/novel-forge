"use client";

// A 任务（v1.6.51.3）+ B 任务（v1.6.51.4）+ Next-1（v1.6.51.5）+ Next-2（v1.6.51.6 基线人工纠错）。
// 跨章一致性事实基线 —— 只读优先 + 冲突标红 + 修正建议 + 人工纠错（编辑/删除/手动新增）。
// 数据源：GET /api/projects/[id]/consistency -> { facts }；POST 同路径触发重抽（保留手动事实）。
// 人工纠错：POST /consistency/manual（新增）、PATCH/DELETE /consistency/[factId]（编辑/删除）。
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

// 表单输入框统一样式（适配 nv-* 主题，深浅色通用）
const inputCls =
  "w-full rounded border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-1.5 py-0.5 text-xs text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]";

interface FactFormProps {
  initial: { category: ConsistencyCategory; subject: string; attribute: string; value: string; confidence: number };
  onSubmit: (data: { category: ConsistencyCategory; subject: string; attribute: string; value: string; confidence: number }) => void;
  onCancel: () => void;
  submitting?: boolean;
}

function FactForm({ initial, onSubmit, onCancel, submitting }: FactFormProps) {
  const [category, setCategory] = useState<ConsistencyCategory>(initial.category);
  const [subject, setSubject] = useState(initial.subject);
  const [attribute, setAttribute] = useState(initial.attribute);
  const [value, setValue] = useState(initial.value);
  const [confidence, setConfidence] = useState(String(initial.confidence ?? 1));

  return (
    <div className="px-3 py-1.5 space-y-1 bg-[var(--nv-surface-3)]">
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as ConsistencyCategory)}
        className={inputCls}
      >
        {CATEGORY_ORDER.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </select>
      <input className={inputCls} placeholder="主体（人名/地名/概念）" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <input className={inputCls} placeholder="属性（年龄/发色/势力…）" value={attribute} onChange={(e) => setAttribute(e.target.value)} />
      <input className={inputCls} placeholder="事实值" value={value} onChange={(e) => setValue(e.target.value)} />
      <input
        className={inputCls}
        placeholder="置信度 0~1"
        value={confidence}
        inputMode="decimal"
        onChange={(e) => setConfidence(e.target.value)}
      />
      <div className="flex items-center gap-2 pt-0.5">
        <button
          disabled={submitting}
          onClick={() =>
            onSubmit({
              category,
              subject: subject.trim(),
              attribute: attribute.trim(),
              value: value.trim(),
              confidence: Number(confidence) || 1,
            })
          }
          className="rounded border border-[var(--nv-primary)] px-2 py-0.5 text-[10px] text-[var(--nv-primary)] hover:bg-[var(--nv-surface-2)] disabled:opacity-50"
        >
          保存
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-[var(--nv-border-2)] px-2 py-0.5 text-[10px] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)]"
        >
          取消
        </button>
      </div>
    </div>
  );
}

export function ConsistencyPanel({ projectId }: { projectId: string }) {
  const [facts, setFacts] = useState<ConsistencyFact[]>([]);
  const [conflicts, setConflicts] = useState<ConsistencyConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [loadingSuggestionId, setLoadingSuggestionId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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

  // 手动重新抽取（POST → 回拉 GET 刷新；后端只清自动事实，保留手动事实）
  const reExtract = async () => {
    if (extracting) return;
    setExtracting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/consistency`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      load();
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

  // 获取某条冲突的改写建议（POST，按需生成，不落库）
  const fetchSuggestion = async (conflictId: string) => {
    if (loadingSuggestionId) return;
    setLoadingSuggestionId(conflictId);
    try {
      const res = await fetch(`/api/projects/${projectId}/consistency/conflicts/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: conflictId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.suggestion) {
        setSuggestions((prev) => ({ ...prev, [conflictId]: json.suggestion as string }));
      }
    } catch {
      /* 静默失败：作者可重试 */
    } finally {
      setLoadingSuggestionId(null);
    }
  };

  // Next-2：手动新增事实（POST /manual，source 强制 manual）
  const saveAdd = async (data: {
    category: ConsistencyCategory;
    subject: string;
    attribute: string;
    value: string;
    confidence: number;
  }) => {
    setAdding(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/consistency/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      load();
    } catch (err) {
      setError(String(err));
    }
  };

  // Next-2：编辑事实（PATCH /[factId]）
  const saveEdit = async (
    factId: string,
    data: { category: ConsistencyCategory; subject: string; attribute: string; value: string; confidence: number },
  ) => {
    setEditingId(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/consistency/${factId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      load();
    } catch (err) {
      setError(String(err));
    }
  };

  // Next-2：删除事实（DELETE /[factId]）
  const deleteFact = async (factId: string) => {
    if (!window.confirm("确定删除这条事实？删除后不可恢复。")) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/consistency/${factId}`, { method: "DELETE" });
      if (res.ok) load();
    } catch {
      /* 静默失败：作者可重试 */
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
      {/* 顶部：统计 + 重抽 / 新增按钮 */}
      <div className="px-3 py-2 border-b border-[var(--nv-border-2)] text-[10px] text-[var(--nv-text-tertiary)]">
        <div className="flex items-center justify-between gap-2">
          <span>
            共 {facts.length} 条事实 · 最近更新 {latestStr}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setAdding((v) => !v);
                setEditingId(null);
              }}
              className="flex items-center gap-1 rounded border border-[var(--nv-border-2)] px-2 py-0.5 text-[10px] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-3)]"
            >
              <Icon name="plus" size={10} />
              新增
            </button>
            <button
              onClick={reExtract}
              disabled={extracting}
              className="flex items-center gap-1 rounded border border-[var(--nv-border-2)] px-2 py-0.5 text-[10px] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-3)] disabled:opacity-50"
            >
              <Icon name="refresh" size={10} className={extracting ? "animate-spin" : ""} />
              {extracting ? "抽取中…" : "重抽"}
            </button>
          </div>
        </div>
        <div className="mt-1 text-[var(--nv-text-muted)]">
          定稿自动抽取；手动事实重抽保留，可编辑/删除/新增。
        </div>
      </div>

      {/* 新增表单（折叠） */}
      {adding && (
        <FactForm
          initial={{ category: "character", subject: "", attribute: "", value: "", confidence: 1 }}
          onSubmit={saveAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* 分组列表（事实 + 行内编辑/删除） */}
      <div className="flex-1 overflow-y-auto">
        {facts.length === 0 && (
          <div className="p-4 text-xs text-[var(--nv-text-tertiary)]">
            暂无基线事实。确认至少一章定稿后会自动生成，或点右上「新增」手动录入。
          </div>
        )}
        {groups.map((g) => (
          <div key={g.cat} className="border-b border-[var(--nv-border-2)]/50">
            <div className="px-3 py-1.5 text-xs text-[var(--nv-text-secondary)] sticky top-0 bg-[var(--nv-surface-2)] backdrop-blur">
              {CATEGORY_LABEL[g.cat]}
              <span className="text-[var(--nv-text-tertiary)] text-[10px] ml-1">{g.items.length}</span>
            </div>
            {g.items.map((f) =>
              editingId === f.id ? (
                <FactForm
                  key={f.id}
                  initial={{ category: f.category, subject: f.subject, attribute: f.attribute, value: f.value, confidence: f.confidence }}
                  onSubmit={(data) => saveEdit(f.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div key={f.id} className="px-3 py-1.5 hover:bg-[var(--nv-surface-2)] group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs text-[var(--nv-text-primary)]">
                      <span className="text-[var(--nv-primary)] font-medium">{f.subject}</span>
                      <span className="text-[var(--nv-text-tertiary)]"> 的{f.attribute} = </span>
                      <span>{f.value}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 shrink-0">
                      <button
                        onClick={() => {
                          setEditingId(f.id);
                          setAdding(false);
                        }}
                        title="编辑"
                        className="rounded border border-[var(--nv-border-2)] px-1 text-[10px] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-3)]"
                      >
                        <Icon name="pencil" size={10} />
                      </button>
                      <button
                        onClick={() => deleteFact(f.id)}
                        title="删除"
                        className="rounded border border-[var(--nv-border-2)] px-1 text-[10px] text-[var(--nv-danger)] hover:bg-[var(--nv-surface-3)]"
                      >
                        <Icon name="trash" size={10} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--nv-text-tertiary)]">
                    {f.source === "manual" ? (
                      <span className="rounded bg-[var(--nv-primary)]/15 px-1 text-[var(--nv-primary)]">手动</span>
                    ) : (
                      <span>来源：{f.source || "—"}</span>
                    )}
                    <span>置信度：{Math.round((f.confidence ?? 1) * 100)}%</span>
                  </div>
                </div>
              ),
            )}
          </div>
        ))}

        {/* 冲突区（B 任务）：open 冲突标红，作者逐条「已修正 / 忽略 / 看建议」 */}
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
                  <div className="mt-1 flex flex-wrap items-center gap-2">
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
                    <button
                      onClick={() => fetchSuggestion(c.id)}
                      disabled={loadingSuggestionId === c.id}
                      className="rounded border border-[var(--nv-border-2)] px-1.5 py-0.5 text-[10px] text-[var(--nv-primary)] hover:bg-[var(--nv-surface-3)] disabled:opacity-50"
                    >
                      {loadingSuggestionId === c.id ? "生成中…" : "看修正建议"}
                    </button>
                  </div>
                  {suggestions[c.id] && (
                    <div className="mt-1 rounded border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-1.5">
                      <div className="text-[10px] text-[var(--nv-text-tertiary)]">改写建议（复制即用）：</div>
                      <div className="mt-0.5 text-xs text-[var(--nv-text-primary)]">{suggestions[c.id]}</div>
                      <button
                        onClick={() => navigator.clipboard?.writeText(suggestions[c.id] ?? "")}
                        className="mt-1 rounded border border-[var(--nv-border-2)] px-1.5 py-0.5 text-[10px] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-3)]"
                      >
                        复制
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
