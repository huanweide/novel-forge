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
    <h1 className="text-2xl font-bold text-zinc-100 mt-8 mb-4 pb-2 text-center tracking-wide" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: any) => (
    <h2 className="text-xl font-bold text-zinc-100 mt-6 mb-3" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: any) => (
    <h3 className="text-lg font-semibold text-zinc-200 mt-5 mb-2" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }: any) => (
    <p className="my-3 text-[17px] leading-[1.85] text-zinc-200 tracking-[0.02em]" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }: any) => (
    <strong className="font-bold text-zinc-100" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }: any) => (
    <em className="italic text-zinc-300" {...props}>
      {children}
    </em>
  ),
  blockquote: ({ children, ...props }: any) => (
    <blockquote className="border-l-[3px] border-zinc-600 pl-5 my-4 text-zinc-400 italic text-[16px] leading-[1.75]" {...props}>
      {children}
    </blockquote>
  ),
  ul: ({ children, ...props }: any) => (
    <ul className="list-disc list-outside ml-5 my-3 space-y-1.5 text-[16px] leading-[1.8] text-zinc-200" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: any) => (
    <ol className="list-decimal list-outside ml-5 my-3 space-y-1.5 text-[16px] leading-[1.8] text-zinc-200" {...props}>
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
        <code className="bg-zinc-800 text-amber-300 px-1.5 py-0.5 rounded text-[14px] font-mono" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={`block bg-zinc-900 text-zinc-300 p-4 rounded-lg my-3 text-[14px] font-mono overflow-x-auto leading-relaxed ${className || ""}`} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }: any) => (
    <pre className="bg-zinc-900 rounded-lg my-3 overflow-x-auto" {...props}>
      {children}
    </pre>
  ),
  hr: (props: any) => <hr className="border-zinc-800 my-8" {...props} />,
  table: ({ children, ...props }: any) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border-collapse text-[15px]" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: any) => (
    <thead className="border-b border-zinc-700" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }: any) => (
    <th className="text-left px-3 py-2 text-zinc-200 font-semibold" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }: any) => (
    <td className="px-3 py-2 text-zinc-300 border-t border-zinc-800" {...props}>
      {children}
    </td>
  ),
  a: ({ children, href, ...props }: any) => (
    <a className="text-indigo-400 hover:text-indigo-300 underline decoration-zinc-600 underline-offset-2" href={href} target="_blank" rel="noopener" {...props}>
      {children}
    </a>
  ),
  del: ({ children, ...props }: any) => (
    <del className="line-through text-zinc-500" {...props}>
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
      <div className="text-zinc-500 text-sm text-center py-12 select-none">
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
        <span className="inline-block w-2 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
      )}

      {/* 实体图例（只在有实体且有高亮时显示） */}
      {!isStreaming && loaded && entityMap.size > 0 && (
        <EntityLegend entityMap={entityMap} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 实体颜色图例
// ═══════════════════════════════════════════

const LEGEND_ITEMS: Array<{ label: string; color: string; match: (e: EntityHighlight) => boolean }> = [
  { label: "角色", color: "#5B9BD5", match: (e) => e.type === "character" },
  { label: "势力", color: "#70AD47", match: (e) => e.category === "faction" },
  { label: "物品", color: "#D4A017", match: (e) => e.category === "item" },
  { label: "地点", color: "#C55A11", match: (e) => e.category === "geography" },
  { label: "世界观", color: "#9B59B6", match: (e) => e.category === "magic_system" },
  { label: "功法", color: "#D64545", match: (e) => e.category === "technique" },
];

function EntityLegend({ entityMap }: { entityMap: Map<string, EntityHighlight> }) {
  // 统计各类型的实体数量
  const usedTypes = new Set<string>();
  const counts: Record<string, number> = {};

  for (const entity of entityMap.values()) {
    let key = "";
    for (const item of LEGEND_ITEMS) {
      if (item.match(entity)) { key = item.label; break; }
    }
    if (!key) key = "其他";
    usedTypes.add(key);
    counts[key] = (counts[key] || 0) + 1;
  }

  const active = LEGEND_ITEMS.filter((item) => usedTypes.has(item.label));

  if (active.length === 0) return null;

  return (
    <div className="mt-6 pt-4 border-t border-zinc-800 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
      <span className="text-zinc-600">图例：</span>
      {active.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
          <span className="text-zinc-600">({counts[item.label] || 0})</span>
        </span>
      ))}
    </div>
  );
}

export default MarkdownViewer;
