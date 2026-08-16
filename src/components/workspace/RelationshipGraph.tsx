/**
 * RelationshipGraph —— 角色关系可视化 v2（力导向 + 曲线边 + 出场章节联动）
 *
 * 数据源（真源）：角色卡 CharacterCard.relationships（手填、持久化、离线可用）。
 * 布局：force-directed 力导向（斥力+弹簧引力），替代原固定圆形布局，
 *   节点自然散开、连线为二次贝塞尔曲线（不再是一坨直线）。
 * 交互：
 *   · 节点可拖动（pointer 事件 + setPointerCapture），坐标持久化到 localStorage
 *   · 单击节点聚焦其关系详情；双击打开角色卡编辑
 *   · 聚焦高亮：只显示焦点节点的连边与邻居，其余淡化
 *   · 出场章节联动：详情卡展示该角色在正文中的出场章节（按出现次数排序），点击可跳转
 */

"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Icon } from "@/components/ui/icons";
import { CharacterChatDialog } from "./CharacterChatDialog";

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
  edges: ExtractedRelation[];
  isFocus: boolean;
}

interface StoryNodeRef {
  id: string;
  title?: string | null;
  content?: string | null;
}

interface RelationshipGraphProps {
  characters: CharRef[];
  projectId: string;
  onEditCharacter?: (id: string) => void;
  storyNodes?: StoryNodeRef[];
  onSelectChapter?: (nodeId: string) => void;
}

// ═══════════════════════════════════════════
// 常量和辅助
// ═══════════════════════════════════════════

// 角色色：全部收敛到品牌语义令牌（虚空玻璃·五色语义系统 + 香槟金单一强调色）。
// 原先的靛/粉/紫（#818cf8/#f472b6/#a78bfa）属离谱色，已替换为品牌主色/辅助色，保证 8 色互不撞色且深浅主题自适应。
function roleColor(role: string): string {
  const map: Record<string, string> = {
    protagonist: "var(--nv-creative)", // 香槟金——主角唯一强调身份
    antagonist: "var(--nv-danger)",     // 玫瑰——敌对
    supporting: "var(--nv-success)",    // 翠绿——正面配角
    mentor: "var(--nv-warning)",        // 琥珀——师长引导
    love_interest: "var(--nv-primary)", // 靛蓝——情感线（品牌主色，非离谱靛）
    comic_relief: "var(--nv-info)",     // 青——调剂
    catalyst: "#7C8DB0",                // 数据可视化专用冷调石板蓝（去饱和，贴合虚空玻璃冷色基调）
    background: "var(--nv-text-tertiary)",
  };
  return map[role] || "var(--nv-text-tertiary)";
}

// 关系连线色：同样收敛到品牌语义令牌，去掉粉/紫离谱色。
function relationStroke(relation: string): string {
  if (/师|父|母|兄|弟|姐|妹|长辈|传承/.test(relation)) return "var(--nv-warning)";
  if (/敌|仇|恨|杀|对立|竞争/.test(relation)) return "var(--nv-danger)";
  if (/爱|恋|暗恋|情|婚|夫妻/.test(relation)) return "var(--nv-primary)";
  if (/友|盟|伴|搭档|守护/.test(relation)) return "var(--nv-success)";
  if (/暗|秘|隐藏|利用/.test(relation)) return "var(--nv-info)";
  return "var(--nv-text-tertiary)";
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
// 力导向布局（替代固定圆形）
// ═══════════════════════════════════════════

const SVG_W = 520;
const SVG_H = 440;

function forceLayout(
  relations: ExtractedRelation[],
  chars: CharRef[],
): { nodes: GraphNode[]; protagonistId: string } {
  if (relations.length === 0) return { nodes: [], protagonistId: "" };

  const protagonist = chars.find((c) => c.role === "protagonist") || chars[0];
  if (!protagonist) return { nodes: [], protagonistId: "" };
  const pid = protagonist.id;

  // 收集所有名字 → 节点
  const nameSet = new Set<string>();
  const nameToEdges = new Map<string, typeof relations>();
  for (const r of relations) {
    nameSet.add(r.from);
    nameSet.add(r.to);
    const e1 = nameToEdges.get(r.from) || [];
    e1.push(r); nameToEdges.set(r.from, e1);
    const e2 = nameToEdges.get(r.to) || [];
    e2.push({ ...r, from: r.to, to: r.from }); nameToEdges.set(r.to, e2);
  }

  const nameToId = new Map<string, string>();
  const nameToRole = new Map<string, string>();
  for (const c of chars) {
    nameToId.set(c.name, c.id);
    nameToRole.set(c.name, c.role);
    for (const a of c.aliases) { nameToId.set(a, c.id); nameToRole.set(a, c.role); }
  }

  // 初始化位置（圆形 + 小随机扰动）
  const cx = SVG_W / 2, cy = SVG_H / 2 - 10;
  const names = [...nameSet].filter(n => n !== protagonist.name);
  const initR = Math.min(SVG_W, SVG_H) / 3;

  const pos = new Map<string, { x: number; y: number }>();
  pos.set(protagonist.name, { x: cx, y: cy });

  for (let i = 0; i < names.length; i++) {
    const angle = (2 * Math.PI * i) / Math.max(names.length, 1) - Math.PI / 2;
    const jitterX = (Math.random() - 0.5) * 30;
    const jitterY = (Math.random() - 0.5) * 30;
    pos.set(names[i], {
      x: cx + initR * Math.cos(angle) + jitterX,
      y: cy + initR * Math.sin(angle) + jitterY,
    });
  }

  // 力导向迭代
  const K_REPEL = 8000;
  const K_SPRING = 0.04;
  const IDEAL_LEN = 120;
  const DAMPING = 0.82;
  const ITERATIONS = 100;
  let temp = 250;

  const vel = new Map<string, { vx: number; vy: number }>();

  for (const n of [...nameSet]) vel.set(n, { vx: 0, vy: 0 });

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // 斥力（所有节点对之间）
    const allNames = [...nameSet];
    for (let i = 0; i < allNames.length; i++) {
      for (let j = i + 1; j < allNames.length; j++) {
        const a = pos.get(allNames[i])!;
        const b = pos.get(allNames[j])!;
        let dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy || 1;
        const d = Math.sqrt(d2);
        const f = K_REPEL / d2;
        const fx = f * dx / d, fy = f * dy / d;
        const va = vel.get(allNames[i])!;
        const vb = vel.get(allNames[j])!;
        va.vx -= fx; va.vy -= fy;
        vb.vx += fx; vb.vy += fy;
      }
    }

    // 弹簧引力（连边两端）
    for (const r of relations) {
      const a = pos.get(r.from);
      const b = pos.get(r.to);
      if (!a || !b) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = K_SPRING * (d - IDEAL_LEN);
      const fx = f * dx / d, fy = f * dy / d;
      const va = vel.get(r.from)!;
      const vb = vel.get(r.to)!;
      va.vx += fx; va.vy += fy;
      vb.vx -= fx; vb.vy -= fy;
    }

    // 更新位置 + 边界约束
    const margin = 28;
    for (const n of nameSet) {
      const p = pos.get(n)!;
      const v = vel.get(n)!;
      v.vx *= DAMPING; v.vy *= DAMPING;
      p.x += v.vx; p.y += v.vy;
      p.x = Math.max(margin, Math.min(SVG_W - margin, p.x));
      p.y = Math.max(margin, Math.min(SVG_H - margin, p.y));
    }

    temp *= 0.95;
  }

  // 构建返回的 nodes 数组
  const protoEdges = nameToEdges.get(protagonist.name) || [];
  const nodes: GraphNode[] = [{
    id: pid,
    name: protagonist.name,
    role: protagonist.role,
    x: pos.get(protagonist.name)!.x,
    y: pos.get(protagonist.name)!.y,
    edges: protoEdges,
    isFocus: true,
  }];

  for (const name of names) {
    nodes.push({
      id: nameToId.get(name) || name,
      name,
      role: nameToRole.get(name) || "supporting",
      x: pos.get(name)!.x,
      y: pos.get(name)!.y,
      edges: nameToEdges.get(name) || [],
      isFocus: false,
    });
  }

  return { nodes, protagonistId: pid };
}

// 二次贝塞尔曲线路径（中点控制点向上/下弯曲）
function curvePath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.min(dist * 0.25, 35);
  // 控制点垂直于连线方向偏移
  const nx = -dy / (dist || 1), ny = dx / (dist || 1);
  const cx = mx + nx * offset;
  const cy = my + ny * offset;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

// 扫描出场章节（纯前端零 token）
function findAppearances(charName: string, storyNodes: StoryNodeRef[]): Array<{ id: string; title: string; count: number }> {
  if (!storyNodes?.length) return [];
  try {
    const escaped = charName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "g");
    const results: Array<{ id: string; title: string; count: number }> = [];
    for (const n of storyNodes) {
      const content = n.content || "";
      const matches = content.match(re);
      if (matches && matches.length > 0) {
        results.push({ id: n.id, title: n.title || `未命名`, count: matches.length });
      }
    }
    return results.sort((a, b) => b.count - a.count).slice(0, 6);
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════

const STORAGE_KEY = (projectId: string) => `rel-graph-pos-${projectId}`;

export function RelationshipGraph({
  characters,
  projectId,
  onEditCharacter,
  storyNodes,
  onSelectChapter,
}: RelationshipGraphProps) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showStale, setShowStale] = useState(false);
  const [chatChar, setChatChar] = useState<{ id: string; name: string } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    id: string;
    moved: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

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

  // ── 按需 LLM 对比 ──
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
      if (data.error) setError(data.error);
      else setAnalysis(data);
    } catch { setError("分析失败，请重试"); }
    finally { setLoading(false); }
  }, [projectId, characters.length]);

  // ── 计算布局（力导向） ──
  const { nodes, protagonistId } = useMemo(() => {
    if (cardRels.length === 0) return { nodes: [], protagonistId: "" };
    return forceLayout(cardRels, characters);
  }, [cardRels, characters]);

  // 坐标合并：持久化坐标优先
  const posOf = (n: GraphNode) => positions[n.id] ?? { x: n.x, y: n.y };

  // 名字→节点映射
  const nameToNode = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const n of nodes) map.set(n.name, n);
    return map;
  }, [nodes]);

  // 收集边（去重）
  const edges = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{
      from: GraphNode;
      to: GraphNode;
      relation: string;
      dynamic: string;
      evidence?: string;
      chapterTitle?: string;
    }> = [];
    for (const node of nodes) {
      for (const e of node.edges) {
        const target = nameToNode.get(e.to);
        if (!target) continue;
        const key = [node.id, target.id].sort().join("|") + "|" + e.relation;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          from: node,
          to: target,
          relation: e.relation,
          dynamic: e.dynamic,
          evidence: e.evidence,
          chapterTitle: e.chapterTitle,
        });
      }
    }
    return result;
  }, [nodes, nameToNode]);

  const focusNode = focusId ? nodes.find((n) => n.id === focusId) : null;
  const visibleEdges = focusNode
    ? edges.filter((e) => e.from.id === focusId || e.to.id === focusId)
    : edges;

  // 出场章节（聚焦角色时计算）
  const appearances = useMemo(() => {
    if (!focusNode || !storyNodes?.length) return [];
    return findAppearances(focusNode.name, storyNodes);
  }, [focusNode, storyNodes]);

  // ── 拖动 ──
  const startDrag = (e: React.PointerEvent, node: GraphNode) => {
    const p = posOf(node);
    dragRef.current = {
      id: node.id,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      originX: p.x,
      originY: p.y,
    };
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
      if (!d.moved) setFocusId(focusId === node.id ? null : node.id);
      else persistPositions({ ...positions, [d.id]: posOf(node) });
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
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--nv-creative)]" />爱情</span>
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

      {/* 过时关系警告 */}
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
            {/* 连线（曲线） */}
            {visibleEdges.map((e, i) => {
              const fp = posOf(e.from);
              const tp = posOf(e.to);
              const isFocusedEdge = !focusNode || e.from.id === focusId || e.to.id === focusId;
              const color = relationStroke(e.relation);
              return (
                <g key={i}>
                  <path
                    d={curvePath(fp.x, fp.y, tp.x, tp.y)}
                    fill="none"
                    stroke={color}
                    strokeWidth={isFocusedEdge ? 1.4 : 0.8}
                    strokeOpacity={isFocusedEdge ? 0.65 : 0.12}
                  />
                  <text
                    x={(fp.x + tp.x) / 2}
                    y={(fp.y + tp.y) / 2 - 4}
                    textAnchor="middle"
                    fill={color}
                    fillOpacity={isFocusedEdge ? 0.75 : 0.15}
                    fontSize={6}
                    className="pointer-events-none select-none"
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
              const isActive = !focusNode || isFocus;
              const r = isProtagonist ? 18 : isFocus ? 14 : 10;
              const color = roleColor(node.role);
              const fontSize = isProtagonist ? 8 : isFocus ? 7 : 6;
              const opacity = isActive ? 1 : 0.22;

              return (
                <g
                  key={node.id}
                  onPointerDown={(e) => startDrag(e, node)}
                  onPointerMove={(e) => moveDrag(e, node)}
                  onPointerUp={(e) => endDrag(e, node)}
                  onDoubleClick={() => { if (knownIds.has(node.id)) onEditCharacter?.(node.id); }}
                  style={{ opacity }}
                  className="cursor-grab active:cursor-grabbing transition-opacity duration-200"
                >
                  {/* 聚焦光环 */}
                  {isFocus && (
                    <circle cx={p.x} cy={p.y} r={r + 8} fill="none" stroke={color} strokeWidth={1.2} strokeOpacity={0.35}>
                      <animate attributeName="r" from={r + 5} to={r + 11} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" from="0.45" to="0.12" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* 节点圆 */}
                  <circle cx={p.x} cy={p.y} r={r} fill={color} fillOpacity={isActive ? 1 : 0.55}
                    stroke={isFocus ? "#fff" : "transparent"} strokeWidth={isFocus ? 1.5 : 0} />
                  {/* 主角星标 */}
                  {isProtagonist && (
                    <text x={p.x} y={p.y + 1} textAnchor="middle" fill="#1A1C22" fontSize={9} fontWeight="bold" className="pointer-events-none select-none">★</text>
                  )}
                  {/* 名字 */}
                  <text x={p.x} y={p.y + r + 13} textAnchor="middle"
                    fill={isFocus ? "var(--nv-text-primary)" : "var(--nv-text-secondary)"}
                    fontSize={fontSize} fontWeight={isFocus ? "bold" : "normal"}
                    className="pointer-events-none select-none">
                    {node.name.length > 5 ? node.name.slice(0, 4) + "\u2026" : node.name}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* 焦点角色详情（含出场章节联动） */}
      {focusNode && (
        <div className="shrink-0 border-t border-[var(--nv-border-2)] px-3 py-2 bg-[var(--nv-surface-1)] backdrop-blur-sm max-h-[200px] overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: roleColor(focusNode.role) }} />
            <span className="text-xs font-medium text-[var(--nv-text-primary)]">{focusNode.name}</span>
            <span className="text-[9px] text-[var(--nv-text-tertiary)]">{focusNode.role}</span>
          </div>

          {/* 关系列表 */}
          {focusNode.edges.length > 0 ? (
            <div className="space-y-1 mb-2">
              {focusNode.edges.map((edge, i) => (
                <div key={i} className="text-[9px]">
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0" style={{ color: relationStroke(edge.relation) }}>{edge.relation}</span>
                    <span className="text-[var(--nv-text-tertiary)]">\u2192</span>
                    <span className="text-[var(--nv-text-secondary)]">{edge.to}</span>
                    {edge.dynamic && <span className="text-[var(--nv-text-tertiary)] truncate"> \u00B7 {edge.dynamic}</span>}
                  </div>
                  {edge.evidence && (
                    <div className="text-[8px] text-[var(--nv-text-tertiary)] mt-0.5 pl-1 border-l border-[var(--nv-border-2)]">
                      <Icon name="book" size={9} className="inline mr-0.5" />{edge.evidence.slice(0, 60)}{edge.evidence.length > 60 ? "\u2026" : ""}
                      {edge.chapterTitle && <span className="text-[var(--nv-text-tertiary)] ml-1">\u2014 {edge.chapterTitle}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[9px] text-[var(--nv-text-tertiary)] mb-2">暂无关系</div>
          )}

          {/* 出场章节联动 */}
          {appearances.length > 0 && (
            <div className="border-t border-[var(--nv-border-2)] pt-1.5 mt-1">
              <div className="text-[9px] text-[var(--nv-text-muted)] mb-1 flex items-center gap-1">
                <Icon name="book" size={10} className="inline-block shrink-0" />
                正文出场（共 {appearances.reduce((s,a)=>s+a.count,0)} 次）
              </div>
              <div className="space-y-0.5">
                {appearances.map((ap, i) => (
                  <button
                    key={i}
                    onClick={() => onSelectChapter?.(ap.id)}
                    className="w-full text-left text-[9px] text-left truncate px-1.5 py-0.5 rounded hover:bg-[var(--nv-primary)]/8 transition-colors text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)]"
                    title={`${ap.title}（出现 ${ap.count} 次）`}
                  >
                    <span className="shrink-0 font-mono mr-1">{ap.count}\u00D7</span>{ap.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="mt-2 flex items-center gap-3">
            {knownIds.has(focusNode.id) && (
              <button onClick={() => onEditCharacter?.(focusNode.id)}
                className="text-[9px] text-[var(--nv-primary)] hover:text-[var(--nv-primary)]/70">
                编辑角色卡 \u2192
              </button>
            )}
            <button
              onClick={() => setChatChar({ id: focusNode.id, name: focusNode.name })}
              className="text-[9px] text-[var(--nv-creative)] hover:text-[var(--nv-creative)]/70 flex items-center gap-0.5"
            >
              <Icon name="messageCircle" size={9} /> 对话 / 附身
            </button>
          </div>
        </div>
      )}

      {chatChar && (
        <CharacterChatDialog
          projectId={projectId}
          characterId={chatChar.id}
          characterName={chatChar.name}
          onClose={() => setChatChar(null)}
        />
      )}
    </div>
  );
}

export default RelationshipGraph;
