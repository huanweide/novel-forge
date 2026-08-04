/**
 * MarkdownViewer — 正文阅读面板
 *
 * Markdown 默认渲染 + 已注册实体颜色高亮。
 * 流式生成期间跳过实体高亮（避免部分匹配误判），完成后自动补上。
 */

"use client";

import React, { useEffect, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
}

// ═══════════════════════════════════════════
// 自定义 Markdown 组件样式
// ═══════════════════════════════════════════

const MARKDOWN_COMPONENTS: Record<string, React.FC<any>> = {
  h1: ({ children, ...props }: any) => (
    <h1 className="text-2xl font-bold text-foreground mt-8 mb-4 pb-2 text-center tracking-wide" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: any) => (
    <h2 className="text-xl font-bold text-foreground mt-6 mb-3" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: any) => (
    <h3 className="text-lg font-semibold text-[var(--nv-text-secondary)] mt-5 mb-2" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }: any) => (
    <p className="my-3 text-[17px] leading-[1.85] text-[var(--nv-text-secondary)] tracking-[0.02em]" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }: any) => (
    <strong className="font-bold text-foreground" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }: any) => (
    <em className="italic text-[var(--nv-text-secondary)]" {...props}>
      {children}
    </em>
  ),
  blockquote: ({ children, ...props }: any) => (
    <blockquote className="border-l-[3px] border-[var(--nv-border-2)] pl-5 my-4 text-[var(--nv-text-tertiary)] italic text-[16px] leading-[1.75]" {...props}>
      {children}
    </blockquote>
  ),
  ul: ({ children, ...props }: any) => (
    <ul className="list-disc list-outside ml-5 my-3 space-y-1.5 text-[16px] leading-[1.8] text-[var(--nv-text-secondary)]" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: any) => (
    <ol className="list-decimal list-outside ml-5 my-3 space-y-1.5 text-[16px] leading-[1.8] text-[var(--nv-text-secondary)]" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }: any) => (
    <li className="pl-1" {...props}>
      {children}
    </li>
  ),
  code: ({ className, children, ...props }: any) => {
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
  pre: ({ children, ...props }: any) => (
    <pre className="bg-[var(--nv-abyss)] rounded-lg my-3 overflow-x-auto" {...props}>
      {children}
    </pre>
  ),
  hr: (props: any) => <hr className="border-[var(--nv-border-2)] my-8" {...props} />,
  table: ({ children, ...props }: any) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border-collapse text-[15px]" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: any) => (
    <thead className="border-b border-[var(--nv-border-2)]" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }: any) => (
    <th className="text-left px-3 py-2 text-[var(--nv-text-secondary)] font-semibold" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }: any) => (
    <td className="px-3 py-2 text-[var(--nv-text-secondary)] border-t border-[var(--nv-border-2)]" {...props}>
      {children}
    </td>
  ),
  a: ({ children, href, ...props }: any) => (
    <a className="text-[var(--nv-primary)] hover:text-[var(--nv-primary)] underline decoration-[var(--nv-border-2)] underline-offset-2" href={href} target="_blank" rel="noopener" {...props}>
      {children}
    </a>
  ),
  del: ({ children, ...props }: any) => (
    <del className="line-through text-[var(--nv-text-muted)]" {...props}>
      {children}
    </del>
  ),
};

// ═══════════════════════════════════════════
// 组件主体
// ═══════════════════════════════════════════

export function MarkdownViewer({ content, projectId, isStreaming = false }: MarkdownViewerProps) {
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
    const plugins: any[] = [];
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
    <div className="markdown-body">
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
}

export default MarkdownViewer;
