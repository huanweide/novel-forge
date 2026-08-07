/**
 * ForeshadowingPanel — 右侧伏笔追踪面板
 *
 * 展示全部伏笔/承诺状态：埋设中 / 部分回收 / 已回收 / 已废弃。
 * 可折叠分组，点击伏笔查看详情。
 */

"use client";

import React, { useEffect, useRef, useState } from "react";
import { StatusDot, Icon } from "@/components/ui/icons";
import { useProjectStore } from "@/store";

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

interface ForeshadowItem {
  id: string;
  description: string;
  source: string;
  priority: string;
  status: string;
  fulfillmentRatio: number;
  expiryChapter?: number;
  chapterNumber?: number;
  fulfilledChapterId?: string;
  developmentHint?: string;
  createdAt: string;
}

interface GroupData {
  label: string;
  count: number;
  items: ForeshadowItem[];
}

interface PayoffStats {
  total: number;
  active: number;
  fulfilled: number;
  partial: number;
  voided: number;
  payoffRate: number;
  avgFulfillmentRatio: number;
}

interface ForeshadowData {
  total: number;
  payoffStats?: PayoffStats;
  groups: Record<string, GroupData>;
}

// ═══════════════════════════════════════════
// 状态徽章
// ═══════════════════════════════════════════

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: React.ReactNode }> = {
  pending: { bg: "bg-warning/10", text: "text-warning", dot: <StatusDot color="yellow" size={7} /> },
  detected: { bg: "bg-warning/10", text: "text-warning", dot: <StatusDot color="yellow" size={7} /> },
  partially_fulfilled: { bg: "bg-info/10", text: "text-info", dot: <StatusDot color="blue" size={7} /> },
  fulfilled: { bg: "bg-success/10", text: "text-success", dot: <StatusDot color="green" size={7} /> },
  voided: { bg: "bg-[var(--nv-text-muted)]/10", text: "text-[var(--nv-text-muted)]", dot: <StatusDot color="gray" size={7} /> },
};

const PRIORITY_LABEL: Record<string, React.ReactNode> = {
  high:  <span className="flex items-center gap-1"><StatusDot color="red" size={7} /> 高</span>,
  medium: <span className="flex items-center gap-1"><StatusDot color="yellow" size={7} /> 中</span>,
  low:   <span className="flex items-center gap-1"><StatusDot color="gray" size={7} /> 低</span>,
};

const SOURCE_LABEL: Record<string, string> = {
  outline_summary: "大纲",
  user_intent: "用户",
  ai_inference: "AI推断",
  foreshadow: "伏笔检测",
};

// ═══════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════

export function ForeshadowingPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ForeshadowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["voided"]));
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [editHints, setEditHints] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string>("");
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/foreshadowing/list?projectId=${projectId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId]);

  // ═══════════════════════════════════════════
  // F1（Round-7）：面板自动刷新
  // 后端 detect（写/确认/refine 之后 fire-and-forget 触发）回写了伏笔状态与收束率，
  // 但面板原本只在挂载和手动「重新检测」时拉数据，导致前端看不到更新。这里用两套
  // 轻量、零依赖的机制让面板随后端 detect 自动刷新，不引状态库、不轮询、不无限重渲染：
  //  ① 订阅项目 store：workspace 在写/确认/refine 完成后都会调 loadProject 重写 store，
  //     故 store 引用变化即可作为“数据可能已变”的信号，防抖 500ms 轻量重拉列表。
  //  ② 监听全局自定义事件 `foreshadowing:updated`：任何 detect 完成后 dispatch 该事件，
  //     面板即重拉（命名清晰，便于其他入口显式推送刷新信号）。
  // ═══════════════════════════════════════════
  const project = useProjectStore((s) => s.project);
  const didMountRef = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return; // 跳过挂载首跑，避免与上面的初始拉取重复
    }
    let cancelled = false;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      (async () => {
        try {
          const res = await fetch(`/api/foreshadowing/list?projectId=${projectId}`);
          if (!res.ok || cancelled) return;
          const json = await res.json();
          if (!cancelled) setData(json);
        } catch {
          /* 轻量刷新失败静默忽略，下次动作/手动刷新再补 */
        }
      })();
    }, 500);
    return () => {
      cancelled = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [project, projectId]);

  useEffect(() => {
    const onUpdated = () => {
      let cancelled = false;
      (async () => {
        try {
          const res = await fetch(`/api/foreshadowing/list?projectId=${projectId}`);
          if (!res.ok || cancelled) return;
          const json = await res.json();
          if (!cancelled) setData(json);
        } catch {
          /* ignore */
        }
      })();
      return () => { cancelled = true; };
    };
    window.addEventListener("foreshadowing:updated", onUpdated);
    return () => window.removeEventListener("foreshadowing:updated", onUpdated);
  }, [projectId]);

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 本地更新某条伏笔的字段（保存/重生成后刷新面板）
  const patchItem = (targetId: string, patch: Partial<ForeshadowItem>) => {
    setData((prev) => {
      if (!prev) return prev;
      const groups: Record<string, GroupData> = {};
      for (const key of Object.keys(prev.groups)) {
        groups[key] = {
          ...prev.groups[key],
          items: prev.groups[key].items.map((it) =>
            it.id === targetId ? { ...it, ...patch } : it,
          ),
        };
      }
      return { ...prev, groups };
    });
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  };

  const saveHint = async (item: ForeshadowItem) => {
    const text = editHints[item.id] ?? item.developmentHint ?? "";
    try {
      const res = await fetch("/api/foreshadowing/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, developmentHint: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      patchItem(item.id, { developmentHint: text });
      setEditHints((p) => {
        const next = { ...p };
        delete next[item.id];
        return next;
      });
      showToast("已保存后续发展思路");
    } catch (err) {
      showToast(`保存失败：${String(err)}`);
    }
  };

  const regenHint = async (item: ForeshadowItem) => {
    setBusyId(item.id);
    try {
      const res = await fetch("/api/foreshadowing/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, projectId, regenerateHint: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.developmentHint) throw new Error(json.error || `HTTP ${res.status}`);
      patchItem(item.id, { developmentHint: json.developmentHint });
      setEditHints((p) => {
        const next = { ...p };
        delete next[item.id];
        return next;
      });
      showToast("已生成新的发展思路");
    } catch (err) {
      showToast(`生成失败：${String(err)}`);
    } finally {
      setBusyId(null);
    }
  };

  // 重新检测收束率：POST 后再拉取最新列表（失败也刷新当前状态）
  const runDetect = async () => {
    setDetecting(true);
    try {
      const res = await fetch("/api/foreshadowing/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      showToast("已刷新收束率");
    } catch (err) {
      showToast(`检测失败：${String(err)}`);
    } finally {
      try {
        const res = await fetch(`/api/foreshadowing/list?projectId=${projectId}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch {
        /* ignore */
      }
      setDetecting(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-xs text-[var(--nv-text-tertiary)]">加载伏笔数据...</div>;
  }

  if (error) {
    return <div className="p-4 text-xs text-danger">加载失败：{error}</div>;
  }

  if (!data || data.total === 0) {
    return (
      <div className="p-4 text-xs text-[var(--nv-text-tertiary)]">
        <p>暂无伏笔记录</p>
        <p className="mt-1 text-[var(--nv-text-tertiary)]">写完章节后 AI 会自动检测伏笔</p>
      </div>
    );
  }

  const groupOrder = ["pending", "partial", "fulfilled", "voided"];

  return (
    <div className="flex flex-col h-full">
      {toast && (
        <div className="sticky top-0 z-10 mx-2 mt-2 rounded bg-[var(--nv-surface-3)] px-2 py-1 text-center text-[10px] text-[var(--nv-accent)]">
          {toast}
        </div>
      )}
      {/* 顶部统计 */}
      <div className="px-3 py-2 border-b border-[var(--nv-border-2)] text-[10px] text-[var(--nv-text-tertiary)]">
        <div className="flex items-center justify-between gap-2">
          <span>共 {data.total} 条伏笔 · {data.groups.pending?.count || 0} 待回收</span>
          <button
            onClick={runDetect}
            disabled={detecting}
            title="扫描埋设点之后的章节，回写收束状态"
            className="flex items-center gap-1 rounded border border-[var(--nv-border-2)] px-2 py-0.5 text-[10px] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-3)] disabled:opacity-50"
          >
            <Icon name="refresh" size={10} className={detecting ? "animate-spin" : ""} />
            {detecting ? "检测中…" : "重新检测"}
          </button>
        </div>

        {/* 收束率进度条 */}
        {data.payoffStats && (
          <div className="mt-1.5">
            <div className="flex items-center justify-between">
              <span>收束率</span>
              <span className="text-[var(--nv-accent)] font-medium">
                {Math.round((data.payoffStats.payoffRate || 0) * 100)}%
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--nv-surface-3)]">
              <div
                className="h-full rounded-full bg-[var(--nv-accent)] transition-all duration-500"
                style={{ width: `${Math.round((data.payoffStats.payoffRate || 0) * 100)}%` }}
              />
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[9px] text-[var(--nv-text-tertiary)]">
              <span>已回收 {data.payoffStats.fulfilled}</span>
              <span>部分 {data.payoffStats.partial}</span>
              <span>活跃 {data.payoffStats.active}</span>
            </div>
          </div>
        )}
      </div>

      {/* 分组列表 */}
      <div className="flex-1 overflow-y-auto">
        {groupOrder.map((key) => {
          const group = data.groups[key];
          if (!group || group.items.length === 0) return null;

          const isCollapsed = collapsed.has(key);

          return (
            <div key={key} className="border-b border-[var(--nv-border-2)]/50">
              {/* 分组标题 */}
              <button
                onClick={() => toggleGroup(key)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--nv-surface-2)] transition-colors sticky top-0 bg-[var(--nv-surface-2)] backdrop-blur"
              >
                <Icon name={isCollapsed ? "arrowRight" : "arrowDown" as any} size={10} className="text-[var(--nv-text-tertiary)]" />
                <span className="text-[var(--nv-text-secondary)]">{group.label}</span>
                <span className="text-[var(--nv-text-tertiary)] ml-auto text-[10px]">{group.count}</span>
              </button>

              {/* 分组内容 */}
              {!isCollapsed && (
                <div className="pb-1">
                  {group.items.map((item) => {
                    const style = STATUS_STYLE[item.status] || STATUS_STYLE.pending;
                    const isExpanded = expandedItem === item.id;

                    return (
                      <div key={item.id} className="px-3 py-1 hover:bg-[var(--nv-surface-2)] transition-colors">
                        <button
                          onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start gap-1.5">
                            <span className="text-[10px] mt-0.5 shrink-0">{style.dot}</span>
                            <span className="text-xs text-[var(--nv-text-secondary)] leading-relaxed line-clamp-2">
                              {item.description}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 ml-4">
                            <span className="text-[10px] text-[var(--nv-text-tertiary)]">
                              {PRIORITY_LABEL[item.priority] || item.priority}
                            </span>
                            <span className="text-[10px] text-[var(--nv-text-tertiary)]">
                              {SOURCE_LABEL[item.source] || item.source}
                            </span>
                            {item.fulfillmentRatio > 0 && (
                              <span className="text-[10px] text-[var(--nv-text-tertiary)]">
                                {Math.round(item.fulfillmentRatio * 100)}%
                              </span>
                            )}
                          </div>
                        </button>

                        {/* 展开详情 */}
                        {isExpanded && (
                          <>
                            <div className="mt-1 ml-4 p-2 rounded bg-[var(--nv-surface-2)] text-[10px] text-[var(--nv-text-tertiary)] space-y-0.5">
                              {item.expiryChapter && (
                                <p>预计回收章：第 {item.expiryChapter} 章</p>
                              )}
                              {item.chapterNumber && (
                                <p>关联章：第 {item.chapterNumber} 章</p>
                              )}
                              {item.fulfilledChapterId && (
                                <p>已回收于：章节 {item.fulfilledChapterId.slice(0, 8)}...</p>
                              )}
                              <p>创建时间：{new Date(item.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>
                            </div>

                            {/* 后续发展思路 编辑区 */}
                            <div className="mt-1 ml-4 p-2 rounded bg-[var(--nv-surface-2)] space-y-1">
                              <div className="flex items-center gap-1 text-[10px] text-[var(--nv-text-secondary)]">
                                <Icon name="lightbulb" size={11} className="text-[var(--nv-accent)]" />
                                <span>后续发展思路</span>
                                <span className="text-[var(--nv-text-tertiary)]">· 写作参考可改</span>
                              </div>
                              <textarea
                                value={editHints[item.id] ?? item.developmentHint ?? ""}
                                onChange={(e) =>
                                  setEditHints((p) => ({ ...p, [item.id]: e.target.value }))
                                }
                                placeholder="AI 会依现有剧情推演方向，也可自己写…"
                                rows={3}
                                className="w-full resize-none rounded border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-2 py-1 text-[11px] leading-relaxed text-[var(--nv-text-primary)] placeholder:text-[var(--nv-text-tertiary)] focus:border-[var(--nv-accent)] focus:outline-none"
                              />
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => saveHint(item)}
                                  disabled={busyId === item.id}
                                  className="flex items-center gap-1 rounded border border-[var(--nv-accent)] px-2 py-1 text-[10px] text-[var(--nv-accent)] hover:bg-[var(--nv-surface-3)] disabled:opacity-50"
                                >
                                  <Icon name="pencil" size={10} /> 保存方向
                                </button>
                                <button
                                  onClick={() => regenHint(item)}
                                  disabled={busyId === item.id}
                                  className="flex items-center gap-1 rounded bg-[var(--nv-surface-3)] px-2 py-1 text-[10px] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] disabled:opacity-50"
                                >
                                  <Icon name="sparkles" size={10} /> {busyId === item.id ? "生成中…" : "AI 重生成"}
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
