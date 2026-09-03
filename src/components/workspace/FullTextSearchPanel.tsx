"use client";
import { describeHttpError } from "@/lib/stream-error";

/**
 * FullTextSearchPanel — 写作台「全文检索」子面板（v3.1.75 · GLOBAL-SEARCH）
 *
 * 跨全部章节正文 / 大纲搜关键词，返回命中章节 + 上下文片段，点一下直接跳到那一章。
 * 与大纲搜索、世界书搜索、伏笔搜索互补：那三个找「条目」，这个找「某段话在第几章出现」。
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import type { SearchSummary } from "@/core/story-search";

// 正则特殊字符转义（用户搜「(」之类的不会让 split 炸）
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 把命中词在片段里高亮（split 带捕获组 → 奇数位是命中词） */
function Highlight({ text, query }: { text: string; query: string }) {
  const escaped = escapeRegExp(query);
  if (!escaped) return <>{text}</>;
  const parts = text.split(new RegExp(escaped, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-[var(--nv-accent)]/25 text-[var(--nv-accent)] rounded px-0.5">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

interface FullTextSearchPanelProps {
  projectId: string;
  /** 点击命中章节时回调（父组件据此跳转到该节点） */
  onJump: (nodeId: string) => void;
}

const FIELD_LABEL: Record<string, string> = {
  content: "正文",
  outline: "大纲",
  title: "标题",
};

export function FullTextSearchPanel({ projectId, onJump }: FullTextSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  // 丢弃过期请求：防抖期间快速输入，只取最后一次结果
  const reqId = useRef(0);

  const runSearch = (q: string) => {
    const term = q.trim();
    if (!term) {
      setData(null);
      setError("");
      setSearched(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError("");
    fetch(`/api/story/search?projectId=${encodeURIComponent(projectId)}&q=${encodeURIComponent(term)}`)
      .then(async (res) => {
        if (!res.ok) { const _f = describeHttpError(res.status, await res.json().catch(() => ({}))); throw new Error(_f.description); }
        return res.json();
      })
      .then((json: SearchSummary) => {
        if (id !== reqId.current) return;
        setData(json);
        setSearched(true);
      })
      .catch((err: unknown) => {
        if (id !== reqId.current) return;
        setError(String(err));
        setData(null);
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  };

  // 防抖自动搜索：输入即搜，300ms 后触发；回车可立即触发（立即触发时 reqId 仍递增，旧请求结果会被丢弃）
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, projectId]);

  return (
    <div className="flex flex-col h-full">
      {/* 搜索框 */}
      <div className="px-3 py-2 border-b border-[var(--nv-border-2)]">
        <div className="relative">
          <Icon
            name="search"
            size={11}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--nv-text-tertiary)] pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch(query);
            }}
            placeholder="搜全部章节正文 / 大纲…"
            aria-label="全文检索"
            className="w-full pl-7 pr-7 h-7 text-xs rounded-md border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] text-[var(--nv-text-primary)] placeholder:text-[var(--nv-text-tertiary)] focus:outline-none focus:border-[var(--nv-primary)]/60 focus:ring-1 focus:ring-[var(--nv-primary)]/30"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="清空搜索"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 inline-flex items-center justify-center text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)] rounded"
            >
              <Icon name="x" size={10} />
            </button>
          )}
        </div>
        <div className="mt-1 px-0.5 text-[10px] text-[var(--nv-text-tertiary)]">
          {loading && "检索中…"}
          {!loading && data && (
            <>
              共 {data.totalHits} 处命中 · 分布在 {data.chapterCount} 章
              {data.truncated && "（结果较多，换更具体的词）"}
            </>
          )}
          {!loading && !data && searched && query.trim() && "没有命中"}
          {!loading && !searched && "输入关键词，跨所有章节查找那段话在哪"}
        </div>
      </div>

      {/* 结果 */}
      <div className="flex-1 overflow-y-auto">
        {error && <div className="p-4 text-xs text-danger">检索失败：{error}</div>}

        {!error && data && data.chapterCount === 0 && (
          <div className="p-4 text-xs text-[var(--nv-text-tertiary)]">
            没有在正文 / 大纲里找到「{data.query}」
          </div>
        )}

        {!error && data && data.results.map((r) => (
          <div
            key={r.nodeId}
            className="px-3 py-2 border-b border-[var(--nv-border-2)]/40 hover:bg-[var(--nv-surface-2)]"
          >
            <button onClick={() => onJump(r.nodeId)} className="w-full text-left flex items-center gap-2">
              <span className="text-xs text-[var(--nv-text-secondary)] font-medium truncate">{r.title}</span>
              <span className="ml-auto text-[10px] text-[var(--nv-text-tertiary)] shrink-0">
                {r.hitCount} 处
              </span>
            </button>
            <div className="mt-1 space-y-1">
              {r.hits.map((h, i) => (
                <div
                  key={i}
                  onClick={() => onJump(r.nodeId)}
                  className="text-[10px] text-[var(--nv-text-tertiary)] leading-relaxed cursor-pointer"
                >
                  <span className="mr-1 text-[var(--nv-text-muted)]">{FIELD_LABEL[h.field] ?? h.field}</span>
                  <Highlight text={h.snippet} query={data.query} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
