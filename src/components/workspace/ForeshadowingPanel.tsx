/**
 * ForeshadowingPanel — 右侧伏笔追踪面板
 *
 * 展示全部伏笔/承诺状态：埋设中 / 部分回收 / 已回收 / 已废弃。
 * 可折叠分组，点击伏笔查看详情。
 */

"use client";

import React, { useEffect, useState } from "react";
import { StatusDot, Icon } from "@/components/ui/icons";

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
  createdAt: string;
}

interface GroupData {
  label: string;
  count: number;
  items: ForeshadowItem[];
}

interface ForeshadowData {
  total: number;
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

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
      {/* 顶部统计 */}
      <div className="px-3 py-2 border-b border-[var(--nv-border-2)] text-[10px] text-[var(--nv-text-tertiary)]">
        共 {data.total} 条伏笔 · {data.groups.pending?.count || 0} 待回收
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
