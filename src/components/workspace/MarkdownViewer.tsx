/**
 * MarkdownViewer — 正文阅读面板
 *
 * Markdown 默认渲染 + 已注册实体颜色高亮。
 * 流式生成期间跳过实体高亮（避免部分匹配误判），完成后自动补上。
 */

"use client";

import React, { useEffect, useState, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import type { EntityHighlight } from "@/core/entity-highlighter";
import { getEntityMap } from "@/core/entity-highlighter";
import { rehypeEntityHighlight } from "@/lib/rehype-entity-highlight";

// ═══════════════════════════════════════════
// Props
// ═══════════════════════════════════════════

interface MarkdownViewerProps {
  content: string;
  projectId: string;
  isStreaming?: boolean;
  /** 点击正文内高亮实体时的回调（id, type）——用于跳转到设定界面 */
  onEntityClick?: (id: string, type: "character" | "lorebook") => void;
}

// ═══════════════════════════════════════════
// 自定义 Markdown 组件样式
// ═══════════════════════════════════════════

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children, ...props }) => (
    <h1 className="text-2xl font-bold text-foreground mt-8 mb-4 pb-2 text-center tracking-wide" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-xl font-bold text-foreground mt-6 mb-3" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-lg font-semibold text-[var(--nv-text-secondary)] mt-5 mb-2" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="my-3 text-[17px] leading-[1.85] text-[var(--nv-text-secondary)] tracking-[0.02em]" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-bold text-foreground" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic text-[var(--nv-text-secondary)]" {...props}>
      {children}
    </em>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="border-l-[3px] border-[var(--nv-border-2)] pl-5 my-4 text-[var(--nv-text-tertiary)] italic text-[16px] leading-[1.75]" {...props}>
      {children}
    </blockquote>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc list-outside ml-5 my-3 space-y-1.5 text-[16px] leading-[1.8] text-[var(--nv-text-secondary)]" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-outside ml-5 my-3 space-y-1.5 text-[16px] leading-[1.8] text-[var(--nv-text-secondary)]" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="pl-1" {...props}>
      {children}
    </li>
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="bg-[var(--nv-surface-2)] text-warning px-1.5 py-0.5 rounded text-[14px] font-mono" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={`block bg-[var(--nv-abyss)] text-[var(--nv-text-secondary)] p-4 rounded-lg my-3 text-[14px] font-mono overflow-x-auto leading-relaxed ${className || ""}`} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre className="bg-[var(--nv-abyss)] rounded-lg my-3 overflow-x-auto" {...props}>
      {children}
    </pre>
  ),
  hr: (props) => <hr className="border-[var(--nv-border-2)] my-8" {...props} />,
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border-collapse text-[15px]" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="border-b border-[var(--nv-border-2)]" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th className="text-left px-3 py-2 text-[var(--nv-text-secondary)] font-semibold" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-3 py-2 text-[var(--nv-text-secondary)] border-t border-[var(--nv-border-2)]" {...props}>
      {children}
    </td>
  ),
  a: ({ children, href, ...props }) => (
    <a className="text-[var(--nv-primary)] hover:text-[var(--nv-primary)] underline decoration-[var(--nv-border-2)] underline-offset-2" href={href} target="_blank" rel="noopener" {...props}>
      {children}
    </a>
  ),
  del: ({ children, ...props }) => (
    <del className="line-through text-[var(--nv-text-muted)]" {...props}>
      {children}
    </del>
  ),
};

// ═══════════════════════════════════════════
// 组件主体
// ═══════════════════════════════════════════

export const MarkdownViewer = React.memo(function MarkdownViewer({ content, projectId, isStreaming = false, onEntityClick }: MarkdownViewerProps) {

  // 正文点击代理：在容器层捕获高亮 span 的点击，交给 onEntityClick 跳转设定界面
  const handleBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onEntityClick) return;
    const target = e.target as HTMLElement;
    const el = target.closest("[data-entity-id]") as HTMLElement | null;
    if (!el) return;
    const id = el.getAttribute("data-entity-id");
    const type = el.getAttribute("data-entity-type") as "character" | "lorebook" | null;
    if (id && type) onEntityClick(id, type);
  };
  const [entityMap, setEntityMap] = useState<Map<string, EntityHighlight>>(new Map());
  const [loaded, setLoaded] = useState(false);

  // 加载实体映射
  useEffect(() => {
    if (!projectId || isStreaming) return;
    let cancelled = false;
    getEntityMap(projectId).then((map) => {
      if (!cancelled) {
        setEntityMap(map);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [projectId, isStreaming]);

  // 构建 rehype 插件列表
  const rehypePlugins = useMemo(() => {
    const plugins: PluggableList = [];
    // 只有非流式 + 实体加载完成后才加高亮
    if (!isStreaming && loaded && entityMap.size > 0) {
      plugins.push([rehypeEntityHighlight(entityMap)]);
    }
    return plugins;
  }, [isStreaming, loaded, entityMap]);

  // 空内容
  if (!content || content.trim().length === 0) {
    return (
      <div className="text-[var(--nv-text-muted)] text-sm text-center py-12 select-none">
        暂无正文 — 点击「续写」或「生成」开始创作
      </div>
    );
  }

  return (
    <div className="markdown-body" onClick={handleBodyClick}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={MARKDOWN_COMPONENTS}
      >
        {content}
      </ReactMarkdown>

      {/* 流式光标 */}
      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-[var(--nv-primary)] ml-0.5 animate-pulse align-middle" />
      )}
    </div>
  );
});

export default MarkdownViewer;
