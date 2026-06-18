/**
 * RelationshipGraph — Agent 驱动的角色关系可视化
 *
 * 数据源：Agent 读取全部章节正文，从实际互动中提取角色关系。
 * 不是角色卡 relationships 的静态翻版——反映的是"正文里实际发生了什么"。
 *
 * 同时对比角色卡已有关系 vs Agent 分析结果，标记"卡上有但正文没体现"的过时关系。
 */

"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

interface CharRef {
  id: string;
  name: string;
  aliases: string[];
  role: string;
  relationships: Array<{
    targetName?: string;
    targetCharacterId?: string;
    relation: string;
    dynamic?: string;
  }>;
}

interface ExtractedRelation {
  from: string;
  to: string;
  relation: string;
  dynamic: string;
  evidence: string;
  chapterTitle: string;
  confidence: number;
}

interface StaleRelation {
  from: string;
  to: string;
  relation: string;
  note: string;
}

interface AnalysisData {
  relations: ExtractedRelation[];
  staleRelations: StaleRelation[];
  summary: string;
}

interface GraphNode {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  edges: Array<{ targetName: string; relation: string; dynamic: string; evidence?: string; chapterTitle?: string }>;
  isFocus: boolean;
}

interface RelationshipGraphProps {
  characters: CharRef[];
  projectId: string;
  onEditCharacter?: (id: string) => void;
}

// ═══════════════════════════════════════════
// 常量和辅助
// ═══════════════════════════════════════════

function roleColor(role: string): string {
  const map: Record<string, string> = {
    protagonist: "#818cf8",
    antagonist: "#f87171",
    supporting: "#4ade80",
    mentor: "#fbbf24",
    love_interest: "#f472b6",
    comic_relief: "#a78bfa",
    catalyst: "#38bdf8",
    background: "#9ca3af",
  };
  return map[role] || "#9ca3af";
}

function relationStroke(relation: string): string {
  if (/师|父|母|兄|弟|姐|妹|长辈|传承/.test(relation)) return "#fbbf24";
  if (/敌|仇|恨|杀|对立|竞争/.test(relation)) return "#f87171";
  if (/爱|恋|暗恋|情|婚|夫妻/.test(relation)) return "#f472b6";
  if (/友|盟|伴|搭档|守护/.test(relation)) return "#4ade80";
  if (/暗|秘|隐藏|利用/.test(relation)) return "#a78bfa";
  return "#6b7280";
}

// ═══════════════════════════════════════════
// 布局计算
// ═══════════════════════════════════════════

function computeLayout(
  relations: ExtractedRelation[],
  chars: CharRef[],
): { nodes: GraphNode[]; protagonistId: string } {
  if (relations.length === 0) return { nodes: [], protagonistId: "" };

  const protagonist = chars.find((c) => c.role === "protagonist") || chars[0];
  if (!protagonist) return { nodes: [], protagonistId: "" };

  const pid = protagonist.id;
  const center = { cx: 150, cy: 150 };
  const mainR = 100;

  // 收集所有涉及的节点名
  const nameSet = new Set<string>();
  const nameToEdges = new Map<string, Array<{ targetName: string; relation: string; dynamic: string; evidence?: string; chapterTitle?: string }>>();

  for (const r of relations) {
    nameSet.add(r.from);
    nameSet.add(r.to);

    // 双向加边
    const existing = nameToEdges.get(r.from) || [];
    existing.push({ targetName: r.to, relation: r.relation, dynamic: r.dynamic, evidence: r.evidence, chapterTitle: r.chapterTitle });
    nameToEdges.set(r.from, existing);

    const existing2 = nameToEdges.get(r.to) || [];
    existing2.push({ targetName: r.from, relation: r.relation, dynamic: r.dynamic, evidence: r.evidence, chapterTitle: r.chapterTitle });
    nameToEdges.set(r.to, existing2);
  }

  // 名字 → 角色ID 映射
  const nameToId = new Map<string, string>();
  const nameToRole = new Map<string, string>();
  for (const c of chars) {
    nameToId.set(c.name, c.id);
    nameToRole.set(c.name, c.role);
    for (const a of c.aliases) {
      nameToId.set(a, c.id);
      nameToRole.set(a, c.role);
    }
  }

  // 找主角直连的角色
  const protoConnections = new Set(relations
    .filter((r) => r.from === protagonist.name || r.to === protagonist.name)
    .map((r) => (r.from === protagonist.name ? r.to : r.from)));

  const otherNames = [...nameSet].filter((n) => n !== protagonist.name);
  const directNames = otherNames.filter((n) => protoConnections.has(n));
  const indirectNames = otherNames.filter((n) => !protoConnections.has(n));

  const sortedNames = [...directNames, ...indirectNames].slice(0, 25);

  const protoEdges = nameToEdges.get(protagonist.name) || [];
  const nodes: GraphNode[] = [{
    id: pid,
    name: protagonist.name,
    role: protagonist.role,
    x: center.cx,
    y: center.cy,
    edges: protoEdges,
    isFocus: true,
  }];

  for (let i = 0; i < sortedNames.length; i++) {
    const name = sortedNames[i];
    const angle = (2 * Math.PI * i) / Math.max(sortedNames.length, 1) - Math.PI / 2;
    const isDirect = directNames.includes(name);
    const r = mainR + (isDirect ? 0 : 20);
    nodes.push({
      id: nameToId.get(name) || name,
      name,
      role: nameToRole.get(name) || "supporting",
      x: center.cx + r * Math.cos(angle),
      y: center.cy + r * Math.sin(angle),
      edges: nameToEdges.get(name) || [],
      isFocus: false,
    });
  }

  return { nodes, protagonistId: pid };
}

// ═══════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════

export function RelationshipGraph({ characters, projectId, onEditCharacter }: RelationshipGraphProps) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showStale, setShowStale] = useState(false);

  // ── 自动分析 ──
  const runAnalysis = useCallback(async () => {
    if (characters.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/agent/analyze-relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, scope: "all" }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setAnalysis(data);
      }
    } catch {
      setError("分析失败，请重试");
    } finally {
      setLoading(false);
    }
  }, [projectId, characters.length]);

  useEffect(() => {
    if (characters.length > 0) runAnalysis();
  }, [characters.length > 0 ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 计算布局 ──
  const { nodes, protagonistId } = useMemo(() => {
    if (!analysis || analysis.relations.length === 0) return { nodes: [], protagonistId: "" };
    return computeLayout(analysis.relations, characters);
  }, [analysis, characters]);

  // 名字→节点映射
  const nameToNode = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const n of nodes) map.set(n.name, n);
    return map;
  }, [nodes]);

  // 收集边
  const edges = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ from: GraphNode; to: GraphNode; relation: string; dynamic: string; evidence?: string; chapterTitle?: string }> = [];
    for (const node of nodes) {
      for (const e of node.edges) {
        const target = nameToNode.get(e.targetName);
        if (!target) continue;
        const key = [node.id, target.id].sort().join("|") + "|" + e.relation;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ from: node, to: target, relation: e.relation, dynamic: e.dynamic, evidence: e.evidence, chapterTitle: e.chapterTitle });
      }
    }
    return result;
  }, [nodes, nameToNode]);

  const focusNode = focusId ? nodes.find((n) => n.id === focusId) : null;
  const visibleEdges = focusNode
    ? edges.filter((e) => e.from.id === focusId || e.to.id === focusId)
    : edges;

  const svgW = 300, svgH = 320;

  // ── 空状态 ──
  if (characters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <div className="text-2xl mb-2">🕸️</div>
        <div className="text-[10px] text-zinc-500">还没有角色</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 控制栏 */}
      <div className="shrink-0 px-3 py-1.5 flex items-center gap-2 text-[9px] border-b border-zinc-800/50 flex-wrap">
        <span className="text-zinc-500">图例：</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />亲缘</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />敌对</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-400" />爱情</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" />盟友</span>

        {analysis && analysis.staleRelations.length > 0 && (
          <button
            onClick={() => setShowStale(!showStale)}
            className={`ml-auto px-1.5 py-0.5 rounded text-[8px] ${showStale ? "bg-amber-900/30 text-amber-400" : "text-zinc-500 hover:text-zinc-400"}`}
          >
            ⚠️ {analysis.staleRelations.length} 条过时
          </button>
        )}

        <button
          onClick={runAnalysis}
          disabled={loading}
          className="px-1.5 py-0.5 rounded text-[8px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 disabled:opacity-50"
        >
          {loading ? "分析中…" : "🔄 刷新"}
        </button>

        {analysis && (
          <span className="text-zinc-600 text-[8px] w-full">
            {analysis.summary}
          </span>
        )}
      </div>

      {/* 过时关系警告 */}
      {showStale && analysis && analysis.staleRelations.length > 0 && (
        <div className="shrink-0 px-3 py-1.5 bg-amber-950/10 border-b border-amber-900/20">
          <div className="text-[9px] text-amber-400 font-medium mb-1">角色卡记录但正文未体现：</div>
          {analysis.staleRelations.map((sr, i) => (
            <div key={i} className="text-[8px] text-zinc-500 flex items-center gap-1">
              <span className="text-zinc-400">{sr.from}</span>
              <span className="text-amber-500">{sr.relation}</span>
              <span className="text-zinc-400">{sr.to}</span>
              <span className="text-zinc-600">— {sr.note}</span>
            </div>
          ))}
        </div>
      )}

      {/* SVG 图 */}
      <div className="flex-1 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 z-10">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-indigo-500/20 border-t-indigo-400 animate-spin" />
              <span className="text-[10px] text-zinc-400">Agent 正在分析正文关系…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-[10px] text-red-400 text-center">
              <div className="mb-1">⚠️</div>
              {error}
              <button onClick={runAnalysis} className="block mx-auto mt-1 text-indigo-400 hover:text-indigo-300">重试</button>
            </div>
          </div>
        )}

        {!loading && !error && nodes.length > 0 && (
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full">
            {/* 连线 */}
            {visibleEdges.map((e, i) => (
              <g key={i}>
                <line
                  x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y}
                  stroke={relationStroke(e.relation)}
                  strokeOpacity={0.5}
                  strokeWidth={0.8}
                />
                <text
                  x={(e.from.x + e.to.x) / 2}
                  y={(e.from.y + e.to.y) / 2 - 3}
                  textAnchor="middle"
                  fill={relationStroke(e.relation)}
                  fillOpacity={0.6}
                  fontSize={5}
                  className="pointer-events-none"
                >
                  {e.relation}
                </text>
              </g>
            ))}

            {/* 节点 */}
            {nodes.map((node) => {
              const isFocus = node.id === focusId;
              const isProtagonist = node.id === protagonistId;
              const r = isProtagonist ? 16 : isFocus ? 12 : 9;
              const color = roleColor(node.role);
              const fontSize = isProtagonist ? 7 : isFocus ? 6 : 5;

              return (
                <g
                  key={node.id}
                  onClick={() => setFocusId(focusId === node.id ? null : node.id)}
                  onDoubleClick={() => onEditCharacter?.(node.id)}
                  className="cursor-pointer"
                >
                  {isFocus && (
                    <circle cx={node.x} cy={node.y} r={r + 6} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.3}>
                      <animate attributeName="r" from={r + 4} to={r + 8} dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" from="0.4" to="0.1" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle cx={node.x} cy={node.y} r={r} fill={color} fillOpacity={isFocus || isProtagonist ? 1 : 0.7}
                    stroke={isFocus ? "#fff" : "transparent"} strokeWidth={isFocus ? 1.5 : 0} />
                  {isProtagonist && (
                    <text x={node.x} y={node.y + 0.5} textAnchor="middle" fill="#1e1b4b" fontSize={8} fontWeight="bold" className="pointer-events-none">★</text>
                  )}
                  <text x={node.x} y={node.y + r + 12} textAnchor="middle" fill={isFocus ? "#e4e4e7" : "#a1a1aa"}
                    fontSize={fontSize} fontWeight={isFocus ? "bold" : "normal"} className="pointer-events-none select-none">
                    {node.name.length > 4 ? node.name.slice(0, 3) + "…" : node.name}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {!loading && !error && nodes.length === 0 && analysis && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-[10px] text-zinc-500 text-center">
              <div className="mb-1">📭</div>
              {analysis.summary || "正文中暂未发现角色互动"}
            </div>
          </div>
        )}
      </div>

      {/* 焦点角色详情 */}
      {focusNode && (
        <div className="shrink-0 border-t border-zinc-800 px-3 py-2 bg-zinc-900/50 max-h-[140px] overflow-y-auto">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: roleColor(focusNode.role) }} />
            <span className="text-xs font-medium text-zinc-200">{focusNode.name}</span>
            <span className="text-[9px] text-zinc-500">{focusNode.role}</span>
          </div>
          {focusNode.edges.length > 0 ? (
            <div className="space-y-1">
              {focusNode.edges.map((edge, i) => (
                <div key={i} className="text-[9px]">
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0" style={{ color: relationStroke(edge.relation) }}>{edge.relation}</span>
                    <span className="text-zinc-500">→</span>
                    <span className="text-zinc-300">{edge.targetName}</span>
                    {edge.dynamic && <span className="text-zinc-600 truncate">· {edge.dynamic}</span>}
                  </div>
                  {edge.evidence && (
                    <div className="text-[8px] text-zinc-600 mt-0.5 pl-1 border-l border-zinc-800">
                      📖 {edge.evidence.slice(0, 60)}{edge.evidence.length > 60 ? "…" : ""}
                      {edge.chapterTitle && <span className="text-zinc-700 ml-1">— {edge.chapterTitle}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[9px] text-zinc-600">暂无关系</div>
          )}
          <button onClick={() => onEditCharacter?.(focusNode.id)} className="mt-2 text-[9px] text-indigo-400 hover:text-indigo-300">
            编辑角色卡 →
          </button>
        </div>
      )}
    </div>
  );
}

export default RelationshipGraph;
