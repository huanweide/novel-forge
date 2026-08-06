/**
 * RelationshipGraph — 角色关系可视化（与角色卡人际关系联动）
 *
 * 数据源（真源）：角色卡 CharacterCard.relationships（手填、持久化、离线可用）。
 * 图的布局默认由角色卡关系驱动；「重新分析正文」按钮按需调用 LLM 抽取正文互动，
 * 仅做"角色卡有、但正文没体现"的过时关系对比，不直接改写图。
 *
 * 交互：
 *   · 节点可拖动（pointer 事件 + setPointerCapture），坐标持久化到 localStorage（按 projectId）
 *   · 节点间连线上的文字 = 两人关系（relation）
 *   · 单击节点聚焦其关系详情；双击节点打开角色卡编辑
 */

"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Icon } from "@/components/ui/icons";

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

// 从角色卡 relationships 聚合出等价 ExtractedRelation[]（图的真源）
function buildCardRelations(chars: CharRef[]): ExtractedRelation[] {
  const rels: ExtractedRelation[] = [];
  for (const c of chars) {
    for (const r of c.relationships || []) {
      const target = (r.targetName || r.targetCharacterId || "").trim();
      if (!target) continue;
      rels.push({
        from: c.name,
        to: target,
        relation: r.relation || "关系",
        dynamic: r.dynamic || "",
        evidence: "",
        chapterTitle: "",
        confidence: 1,
      });
    }
  }
  return rels;
}

// ═══════════════════════════════════════════
// 布局计算（固定圆形布局，坐标可被 localStorage 覆盖）
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

  const nameSet = new Set<string>();
  const nameToEdges = new Map<string, Array<{ targetName: string; relation: string; dynamic: string; evidence?: string; chapterTitle?: string }>>();

  for (const r of relations) {
    nameSet.add(r.from);
    nameSet.add(r.to);

    const existing = nameToEdges.get(r.from) || [];
    existing.push({ targetName: r.to, relation: r.relation, dynamic: r.dynamic, evidence: r.evidence, chapterTitle: r.chapterTitle });
    nameToEdges.set(r.from, existing);

    const existing2 = nameToEdges.get(r.to) || [];
    existing2.push({ targetName: r.from, relation: r.relation, dynamic: r.dynamic, evidence: r.evidence, chapterTitle: r.chapterTitle });
    nameToEdges.set(r.to, existing2);
  }

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

const SVG_W = 300;
const SVG_H = 320;
const STORAGE_KEY = (projectId: string) => `rel-graph-pos-${projectId}`;

export function RelationshipGraph({ characters, projectId, onEditCharacter }: RelationshipGraphProps) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showStale, setShowStale] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; moved: boolean; startX: number; startY: number; originX: number; originY: number } | null>(null);

  // 角色卡关系（真源）
  const cardRels = useMemo(() => buildCardRelations(characters), [characters]);

  // ── 加载持久化坐标 ──
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY(projectId)) : null;
      if (raw) setPositions(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [projectId]);

  const persistPositions = useCallback((next: Record<string, { x: number; y: number }>) => {
    try {
      localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(next));
    } catch { /* ignore */ }
  }, [projectId]);

  // ── 按需 LLM 对比（不自动跑，避免遮挡正文 + 烧 token） ──
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

  // ── 计算布局（角色卡驱动） ──
  const { nodes, protagonistId } = useMemo(() => {
    if (cardRels.length === 0) return { nodes: [], protagonistId: "" };
    return computeLayout(cardRels, characters);
  }, [cardRels, characters]);

  // 坐标合并：持久化坐标优先，否则用布局坐标
  const posOf = (n: GraphNode) => positions[n.id] ?? { x: n.x, y: n.y };

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

  // ── 拖动 ──
  const startDrag = (e: React.PointerEvent, node: GraphNode) => {
    const pos = posOf(node);
    dragRef.current = { id: node.id, moved: false, startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
    (e.currentTarget as SVGGElement).setPointerCapture?.(e.pointerId);
  };
  const moveDrag = (e: React.PointerEvent, node: GraphNode) => {
    const d = dragRef.current;
    if (!d || d.id !== node.id || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - d.startX) / rect.width) * SVG_W;
    const dy = ((e.clientY - d.startY) / rect.height) * SVG_H;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 4) d.moved = true;
    setPositions((prev) => ({ ...prev, [d.id]: { x: d.originX + dx, y: d.originY + dy } }));
  };
  const endDrag = (e: React.PointerEvent, node: GraphNode) => {
    const d = dragRef.current;
    (e.currentTarget as SVGGElement).releasePointerCapture?.(e.pointerId);
    if (d && d.id === node.id) {
      if (!d.moved) {
        setFocusId(focusId === node.id ? null : node.id);
      } else {
        persistPositions({ ...positions, [d.id]: posOf(node) });
      }
    }
    dragRef.current = null;
  };

  const knownIds = useMemo(() => new Set(characters.map((c) => c.id)), [characters]);

  // ── 空状态 ──
  if (characters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <div className="text-2xl mb-2 text-[var(--nv-creative)]"><Icon name="share" size={26} /></div>
        <div className="text-[10px] text-[var(--nv-text-tertiary)]">还没有角色</div>
      </div>
    );
  }

  if (cardRels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <div className="text-2xl mb-2 text-[var(--nv-creative)]"><Icon name="share" size={26} /></div>
        <div className="text-[10px] text-[var(--nv-text-secondary)] mb-1">角色卡里还没有填人际关系</div>
        <div className="text-[9px] text-[var(--nv-text-tertiary)] leading-relaxed max-w-[200px]">
          在「角色卡 → 人际关系」里填写谁和谁是什么关系，关系图会自动生成，并支持拖动排版。
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 控制栏 */}
      <div className="shrink-0 px-3 py-1.5 flex items-center gap-2 text-[9px] border-b border-[var(--nv-border-2)]/50 flex-wrap">
        <span className="text-[var(--nv-text-tertiary)]">图例：</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning" />亲缘</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger" />敌对</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-400" />爱情</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" />盟友</span>

        <button
          onClick={() => { setPositions({}); persistPositions({}); }}
          className="ml-auto flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)]"
          title="重置为自动布局"
        >
          <Icon name="refresh" size={9} /> 重置布局
        </button>

        <button
          onClick={runAnalysis}
          disabled={loading}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] disabled:opacity-50"
          title="用 AI 重新分析正文互动，对比角色卡找出过时关系"
        >
          {loading ? "分析中…" : <><Icon name="sparkles" size={9} /> 重新分析正文</>}
        </button>
      </div>

      {/* 过时关系警告（仅 LLM 对比后显示） */}
      {showStale && analysis && analysis.staleRelations.length > 0 && (
        <div className="shrink-0 px-3 py-1.5 bg-[var(--nv-accent-soft)] border-b border-[var(--nv-accent)]/20">
          <div className="text-[9px] text-[var(--nv-accent)] font-medium mb-1">角色卡记录但正文未体现：</div>
          {analysis.staleRelations.map((sr, i) => (
            <div key={i} className="text-[8px] text-[var(--nv-text-tertiary)] flex items-center gap-1">
              <span className="text-[var(--nv-text-secondary)]">{sr.from}</span>
              <span className="text-[var(--nv-accent)]">{sr.relation}</span>
              <span className="text-[var(--nv-text-secondary)]">{sr.to}</span>
              <span className="text-[var(--nv-text-tertiary)]">— {sr.note}</span>
            </div>
          ))}
        </div>
      )}

      {/* SVG 图 */}
      <div className="flex-1 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--nv-void)]/60 z-10">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-[var(--nv-primary)]/20 border-t-[var(--nv-primary)] animate-spin" />
              <span className="text-[10px] text-[var(--nv-text-secondary)]">Agent 正在分析正文关系…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-[10px] text-[var(--nv-danger)] text-center">
              <div className="mb-1"><Icon name="alert" size={14} /></div>
              {error}
              <button onClick={runAnalysis} className="block mx-auto mt-1 text-[var(--nv-primary)] hover:text-[var(--nv-primary)]/70">重试</button>
            </div>
          </div>
        )}

        {!loading && !error && nodes.length > 0 && (
          <svg ref={svgRef} viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-full touch-none">
            {/* 连线 */}
            {visibleEdges.map((e, i) => {
              const fp = posOf(e.from);
              const tp = posOf(e.to);
              return (
                <g key={i}>
                  <line
                    x1={fp.x} y1={fp.y} x2={tp.x} y2={tp.y}
                    stroke={relationStroke(e.relation)}
                    strokeOpacity={0.5}
                    strokeWidth={0.8}
                  />
                  <text
                    x={(fp.x + tp.x) / 2}
                    y={(fp.y + tp.y) / 2 - 3}
                    textAnchor="middle"
                    fill={relationStroke(e.relation)}
                    fillOpacity={0.6}
                    fontSize={5}
                    className="pointer-events-none"
                  >
                    {e.relation}
                  </text>
                </g>
              );
            })}

            {/* 节点 */}
            {nodes.map((node) => {
              const p = posOf(node);
              const isFocus = node.id === focusId;
              const isProtagonist = node.id === protagonistId;
              const r = isProtagonist ? 16 : isFocus ? 12 : 9;
              const color = roleColor(node.role);
              const fontSize = isProtagonist ? 7 : isFocus ? 6 : 5;

              return (
                <g
                  key={node.id}
                  onPointerDown={(e) => startDrag(e, node)}
                  onPointerMove={(e) => moveDrag(e, node)}
                  onPointerUp={(e) => endDrag(e, node)}
                  onDoubleClick={() => { if (knownIds.has(node.id)) onEditCharacter?.(node.id); }}
                  className="cursor-grab active:cursor-grabbing"
                >
                  {isFocus && (
                    <circle cx={p.x} cy={p.y} r={r + 6} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.3}>
                      <animate attributeName="r" from={r + 4} to={r + 8} dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" from="0.4" to="0.1" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle cx={p.x} cy={p.y} r={r} fill={color} fillOpacity={isFocus || isProtagonist ? 1 : 0.7}
                    stroke={isFocus ? "#fff" : "transparent"} strokeWidth={isFocus ? 1.5 : 0} />
                  {isProtagonist && (
                    <text x={p.x} y={p.y + 0.5} textAnchor="middle" fill="#1e1b4b" fontSize={8} fontWeight="bold" className="pointer-events-none">★</text>
                  )}
                  <text x={p.x} y={p.y + r + 12} textAnchor="middle" fill={isFocus ? "#e4e4e7" : "#a1a1aa"}
                    fontSize={fontSize} fontWeight={isFocus ? "bold" : "normal"} className="pointer-events-none select-none">
                    {node.name.length > 4 ? node.name.slice(0, 3) + "…" : node.name}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* 焦点角色详情 */}
      {focusNode && (
        <div className="shrink-0 border-t border-[var(--nv-border-2)] px-3 py-2 bg-[var(--nv-surface-1)] backdrop-blur-sm max-h-[140px] overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: roleColor(focusNode.role) }} />
            <span className="text-xs font-medium text-[var(--nv-text-primary)]">{focusNode.name}</span>
            <span className="text-[9px] text-[var(--nv-text-tertiary)]">{focusNode.role}</span>
          </div>
          {focusNode.edges.length > 0 ? (
            <div className="space-y-1">
              {focusNode.edges.map((edge, i) => (
                <div key={i} className="text-[9px]">
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0" style={{ color: relationStroke(edge.relation) }}>{edge.relation}</span>
                    <span className="text-[var(--nv-text-tertiary)]">→</span>
                    <span className="text-[var(--nv-text-secondary)]">{edge.targetName}</span>
                    {edge.dynamic && <span className="text-[var(--nv-text-tertiary)] truncate">· {edge.dynamic}</span>}
                  </div>
                  {edge.evidence && (
                    <div className="text-[8px] text-[var(--nv-text-tertiary)] mt-0.5 pl-1 border-l border-[var(--nv-border-2)]">
                      <Icon name="book" size={9} className="inline mr-0.5" />{edge.evidence.slice(0, 60)}{edge.evidence.length > 60 ? "…" : ""}
                      {edge.chapterTitle && <span className="text-[var(--nv-text-tertiary)] ml-1">— {edge.chapterTitle}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[9px] text-[var(--nv-text-tertiary)]">暂无关系</div>
          )}
          {knownIds.has(focusNode.id) && (
            <button onClick={() => onEditCharacter?.(focusNode.id)} className="mt-2 text-[9px] text-[var(--nv-primary)] hover:text-[var(--nv-primary)]/70">
              编辑角色卡 →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default RelationshipGraph;
