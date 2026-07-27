"use client";

/**
 * PostGenPanel — 统一的生成后分析面板
 *
 * 替代旧版 ChapterExtractionPanel（全屏弹窗）+ CardUpdater（旧三卡分析）
 * + distillSummary 浮动横幅 + autoUpdateNotification 浮动横幅
 * + cardUpdatePending 浮动按钮 + "AI 分析本章变化"按钮。
 *
 * 内联在正文下方，4 Tab：提取 / 逻辑自查 / 蒸馏 / 审校。
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import { FORBIDDEN_CATEGORIES } from "@/lib/forbidden-checker";
import type { ReviewIssue } from "./types";

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

interface ExtractionData {
  characters: any[];
  locations: any[];
  factions: any[];
  items: any[];
  foreshadowings: any[];
  emotions: any[];
  keyDialogues: any[];
  summary: any;
  nextChapter: any;
  writingElements: any;
  characterExperiences: any[];
  relationshipChanges: any[];
  counts: Record<string, number>;
}

interface DistillSummary {
  entityCount: number;
  stateChangeCount: number;
  foreshadowCount: number;
  consistencyIssueCount: number;
  elapsedMs: number;
  foreshadowCreated: number;
  foreshadowUpdated: number;
  entitiesAutoCreated: number;
  entitiesSkipped: number;
}

interface LogicIssue {
  type: string;
  severity: "error" | "warning" | "info";
  description: string;
  evidence?: string;
}

interface LogicCheckResult {
  passed: boolean;
  issues: LogicIssue[];
  summary: string;
}


interface PostGenPanelProps {
  projectId: string;
  nodeId: string;
  chapterTitle: string;
  chapterContent: string;

  /** 12维度提取结果 */
  extractionData: ExtractionData | null;
  extractionLoading: boolean;

  /** 本地蒸馏结果 */
  distillSummary: DistillSummary | null;

  /** 废词扫描结果（SSE 自动推送） */
  forbiddenScanResult: { passed: boolean; qualityScore: number; fuzzyDensity: number; bySeverity: Record<string, number>; byCategory: Record<string, number>; matches: any[]; totalMatches: number; summary: string } | null;

  /** 逻辑自查结果（SSE 自动推送） */
  logicCheckResult: { passed: boolean; issues: any[]; summary: string } | null;

  /** 审校结果 */
  reviewResult: { passed: boolean; issues: ReviewIssue[] } | null;

  /** 操作回调 */
  onApplyExtraction: (selected: any) => Promise<void>;
  onContinueWriting: () => void;
  onClose: () => void;
  onRefresh: () => void;
}

type TabKey = "extraction" | "forbidden" | "logic" | "distill" | "review";

const TABS: Array<{ key: TabKey; icon: IconName; label: string }> = [
  { key: "extraction", icon: "chart", label: "章节提取" },
  { key: "forbidden", icon: "alert", label: "废词检测" },
  { key: "logic", icon: "search", label: "逻辑自查" },
  { key: "distill", icon: "sparkles", label: "本地蒸馏" },
  { key: "review", icon: "clipboard", label: "审校" },
];

// ═══════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════

export function PostGenPanel({
  projectId, nodeId, chapterTitle, chapterContent,
  extractionData, extractionLoading,
  distillSummary, forbiddenScanResult, logicCheckResult, reviewResult,
  onApplyExtraction, onContinueWriting, onClose, onRefresh,
}: PostGenPanelProps) {
  const [tab, setTab] = useState<TabKey>("extraction");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // ── 提取结果的采纳状态 ──
  const [adoptedChars, setAdoptedChars] = useState<Set<string>>(new Set());
  const [adoptedLocations, setAdoptedLocations] = useState<Set<string>>(new Set());
  const [adoptedFactions, setAdoptedFactions] = useState<Set<string>>(new Set());
  const [adoptedItems, setAdoptedItems] = useState<Set<string>>(new Set());
  const [adoptedForeshadowings, setAdoptedForeshadowings] = useState<Set<string>>(new Set());
  const [adoptedExperiences, setAdoptedExperiences] = useState<Set<string>>(new Set());
  const [adoptedRelationships, setAdoptedRelationships] = useState<Set<string>>(new Set());

  // 初始化采纳状态——所有 suggestion !== "ignore" 的默认选中
  useEffect(() => {
    if (!extractionData) return;
    setAdoptedChars(new Set(
      extractionData.characters.filter((c: any) => c.suggestion !== "ignore").map((_: any, i: number) => String(i))
    ));
    setAdoptedLocations(new Set(
      extractionData.locations.filter((l: any) => l.suggestion !== "ignore").map((_: any, i: number) => String(i))
    ));
    setAdoptedFactions(new Set(
      extractionData.factions.filter((f: any) => f.suggestion !== "ignore").map((_: any, i: number) => String(i))
    ));
    setAdoptedItems(new Set(
      extractionData.items.filter((it: any) => it.suggestion !== "ignore").map((_: any, i: number) => String(i))
    ));
    setAdoptedForeshadowings(new Set(
      extractionData.foreshadowings.filter((f: any) => f.suggestion !== "ignore").map((_: any, i: number) => String(i))
    ));
    setAdoptedExperiences(new Set(
      extractionData.characterExperiences.map((_: any, i: number) => String(i))
    ));
    setAdoptedRelationships(new Set(
      extractionData.relationshipChanges.map((_: any, i: number) => String(i))
    ));
  }, [extractionData]);

  // ── 保存（调用 apply-extraction API） ──
  const handleSave = async () => {
    if (!extractionData) return;
    setSaving(true); setSaveMessage("");
    try {
      const selected = {
        characters: extractionData.characters.filter((_: any, i: number) => adoptedChars.has(String(i))),
        locations: extractionData.locations.filter((_: any, i: number) => adoptedLocations.has(String(i))),
        factions: extractionData.factions.filter((_: any, i: number) => adoptedFactions.has(String(i))),
        items: extractionData.items.filter((_: any, i: number) => adoptedItems.has(String(i))),
        foreshadowings: extractionData.foreshadowings.filter((_: any, i: number) => adoptedForeshadowings.has(String(i))),
        characterExperiences: extractionData.characterExperiences.filter((_: any, i: number) => adoptedExperiences.has(String(i))),
        relationshipChanges: extractionData.relationshipChanges.filter((_: any, i: number) => adoptedRelationships.has(String(i))),
        summary: extractionData.summary,
        nextChapter: extractionData.nextChapter,
        writingElements: extractionData.writingElements,
      };

      const res = await fetch("/api/agent/apply-extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, nodeId, chapterTitle, selected }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveMessage(`保存完成：${data.summary || "无变更"}`);
        onRefresh();
        setTimeout(() => onClose(), 1500);
      } else {
        setSaveMessage(`保存失败：${data.error || "未知错误"}`);
      }
    } catch (err) {
      setSaveMessage(`网络错误：${err instanceof Error ? err.message : "未知"}`);
    } finally { setSaving(false); }
  };

  // ── 辅助 ──
  const toggleAdopt = (setFn: React.Dispatch<React.SetStateAction<Set<string>>>, idx: string) => {
    setFn((prev) => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; });
  };

  // 重要性星级 → 文本 + 颜色（替代 ★☆ emoji）
  const importanceStars = (score: number) => {
    const full = Math.min(5, Math.round(score / 2));
    return { full, empty: Math.max(0, 5 - full) };
  };

  // ── 渲染 ──

  if (!extractionData && !distillSummary && !reviewResult) return null;

  return (
    <div className="mt-6 border border-[var(--nv-border-2)] rounded-xl bg-[var(--nv-abyss)] overflow-hidden">
      {/* 头部 stats */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--nv-border-2)] bg-[var(--nv-surface-2)]">
        <div className="flex items-center gap-3">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)]">
            <Icon name="chart" size={15} className="text-[var(--nv-primary)]" /> 本章分析
          </h3>
          {extractionData && (
            <div className="flex gap-2 text-[10px] text-[var(--nv-text-tertiary)]">
              <span title="角色" className="flex items-center gap-0.5"><Icon name="user" size={11} />{extractionData.counts?.characters || 0}</span>
              <span title="场景" className="flex items-center gap-0.5"><Icon name="mapPin" size={11} />{extractionData.counts?.locations || 0}</span>
              <span title="道具" className="flex items-center gap-0.5"><Icon name="gem" size={11} />{extractionData.counts?.items || 0}</span>
              <span title="伏笔" className="flex items-center gap-0.5"><Icon name="zap" size={11} />{extractionData.counts?.foreshadowings || 0}</span>
              <span title="关系" className="flex items-center gap-0.5"><Icon name="share" size={11} />{extractionData.counts?.relationshipChanges || 0}</span>
            </div>
          )}
          {extractionLoading && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--nv-primary)] animate-pulse"><Icon name="loader" size={11} className="animate-spin" /> 提取中…</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saveMessage && <span className={`text-[10px] ${saveMessage.startsWith("✅") ? "text-emerald-400" : "text-red-400"}`}>{saveMessage}</span>}
          <Button onClick={handleSave} disabled={saving || !extractionData} size="sm" className="btn-success h-7 text-xs">
            {saving ? "保存中…" : "全部采纳"}
          </Button>
          <Button onClick={onContinueWriting} size="sm" className="btn-primary h-7 text-xs">
            <Icon name="sparkles" size={12} /> 继续写下一节
          </Button>
          <button onClick={onClose} className="text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)] text-sm transition-colors"><Icon name="x" size={15} /></button>
        </div>
      </div>

      {/* Tab 栏 */}
      <div className="flex border-b border-white/[0.06]">
        {TABS.map((t) => {
          const hasContent =
            (t.key === "extraction" && extractionData) ||
            (t.key === "forbidden" && forbiddenScanResult) ||
            (t.key === "logic" && logicCheckResult) ||
            (t.key === "distill" && distillSummary) ||
            (t.key === "review" && reviewResult);
          const hasIssues =
            (t.key === "forbidden" && forbiddenScanResult && !forbiddenScanResult.passed) ||
            (t.key === "logic" && logicCheckResult && !logicCheckResult.passed) ||
            (t.key === "review" && reviewResult && !reviewResult.passed);
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs font-medium transition-colors
                ${tab === t.key ? "border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]" : "border-transparent text-[var(--nv-text-tertiary)] hover:bg-white/[0.04] hover:text-[var(--nv-text-primary)]"}
                ${!hasContent ? "opacity-40" : ""}`}>
              <Icon name={t.icon} size={13} /> {t.label}
              {hasIssues && <span className="h-1.5 w-1.5 rounded-full bg-[var(--nv-danger)]" />}
            </button>
          );
        })}
      </div>

      {/* Tab 内容 */}
    <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
      {/* ═══ 章节提取 ═══ */}
      {tab === "extraction" && extractionData && (
          <div className="p-4 space-y-4">
            {/* 角色 */}
            {extractionData.characters.length > 0 && (
              <details open className="group">
                <summary className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-primary)]">
                  <Icon name="user" size={14} className="text-[var(--nv-primary)]" /> 出场角色 ({extractionData.characters.length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {extractionData.characters.map((c: any, i: number) => {
                    const isAdopted = adoptedChars.has(String(i));
                    const isNew = c.isNew && c.suggestion === "create";
                    const isPasserby = c.suggestion === "ignore";
                    const stars = importanceStars(c.importance);
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs group/item ${isPasserby ? "opacity-50" : ""} ${isAdopted ? "bg-[var(--nv-success-soft)] border border-[var(--nv-success)]/30" : "bg-[var(--nv-surface-1)]"}`}>
                        <button onClick={() => toggleAdopt(setAdoptedChars, String(i))}
                          className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                            ${isAdopted ? "bg-[var(--nv-success)] border-[var(--nv-success)] text-white" : "border-[var(--nv-border-3)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-text-secondary)]"}`}>
                          {isAdopted ? <Icon name="check" size={11} /> : null}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[var(--nv-text-primary)]">{c.name}</span>
                            <span className="text-[var(--nv-text-tertiary)]">{c.role}</span>
                            <span className="text-[var(--nv-accent)] text-[10px] tracking-tight">{"★".repeat(stars.full)}<span className="text-[var(--nv-text-tertiary)]">{"☆".repeat(stars.empty)}</span></span>
                            {isNew && <span className="text-[var(--nv-success)] text-[10px] bg-[var(--nv-success-soft)] px-1 rounded">新角色</span>}
                            {isPasserby && <span className="text-[var(--nv-accent)] text-[10px] bg-[var(--nv-accent-soft)] px-1 rounded">疑似路人</span>}
                          </div>
                          {c.experience && <p className="text-[var(--nv-text-tertiary)] mt-0.5">{c.experience}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}

            {/* 场景地点 */}
            {extractionData.locations.length > 0 && (
              <details open className="group">
                <summary className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-primary)]">
                  <Icon name="mapPin" size={14} className="text-[var(--nv-info)]" /> 场景地点 ({extractionData.locations.length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {extractionData.locations.map((l: any, i: number) => {
                    const isAdopted = adoptedLocations.has(String(i));
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${l.suggestion === "ignore" ? "opacity-50" : ""} ${isAdopted ? "bg-[var(--nv-success-soft)] border border-[var(--nv-success)]/30" : "bg-[var(--nv-surface-1)]"}`}>
                        <button onClick={() => toggleAdopt(setAdoptedLocations, String(i))}
                          className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                            ${isAdopted ? "bg-[var(--nv-success)] border-[var(--nv-success)] text-white" : "border-[var(--nv-border-3)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-text-secondary)]"}`}>
                          {isAdopted ? <Icon name="check" size={11} /> : null}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[var(--nv-text-primary)]">{l.name}</span>
                            <span className="text-[var(--nv-text-tertiary)]">{l.type}</span>
                            {l.isNew && <span className="text-[var(--nv-success)] text-[10px] bg-[var(--nv-success-soft)] px-1 rounded">新</span>}
                          </div>
                          {l.description && <p className="text-[var(--nv-text-tertiary)] mt-0.5 truncate">{l.description}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}

            {/* 势力 */}
            {extractionData.factions.length > 0 && (
              <details className="group">
                <summary className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-primary)]">
                  <Icon name="building" size={14} className="text-[var(--nv-creative)]" /> 势力阵营 ({extractionData.factions.length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {extractionData.factions.map((f: any, i: number) => {
                    const isAdopted = adoptedFactions.has(String(i));
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${isAdopted ? "bg-[var(--nv-success-soft)] border border-[var(--nv-success)]/30" : "bg-[var(--nv-surface-1)]"}`}>
                        <button onClick={() => toggleAdopt(setAdoptedFactions, String(i))}
                          className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                            ${isAdopted ? "bg-[var(--nv-success)] border-[var(--nv-success)] text-white" : "border-[var(--nv-border-3)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-text-secondary)]"}`}>
                          {isAdopted ? <Icon name="check" size={11} /> : null}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-[var(--nv-text-primary)]">{f.name}</span>
                          <span className="text-[var(--nv-text-tertiary)] ml-2">{f.type}</span>
                          {f.leader && <span className="text-[var(--nv-text-secondary)] ml-2">首领：{f.leader}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}

            {/* 道具 */}
            {extractionData.items.length > 0 && (
              <details className="group">
                <summary className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-primary)]">
                  <Icon name="gem" size={14} className="text-[var(--nv-accent)]" /> 道具物品 ({extractionData.items.length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {extractionData.items.map((it: any, i: number) => {
                    const isAdopted = adoptedItems.has(String(i));
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${isAdopted ? "bg-[var(--nv-success-soft)] border border-[var(--nv-success)]/30" : "bg-[var(--nv-surface-1)]"}`}>
                        <button onClick={() => toggleAdopt(setAdoptedItems, String(i))}
                          className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                            ${isAdopted ? "bg-[var(--nv-success)] border-[var(--nv-success)] text-white" : "border-[var(--nv-border-3)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-text-secondary)]"}`}>
                          {isAdopted ? <Icon name="check" size={11} /> : null}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-[var(--nv-text-primary)]">{it.name}</span>
                          <span className="text-[var(--nv-text-tertiary)] ml-2">{it.type}</span>
                          {it.rarity && <span className="text-[var(--nv-accent)] ml-2">{it.rarity}</span>}
                          {it.owner && <span className="text-[var(--nv-text-secondary)] ml-2">持有：{it.owner}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}

            {/* 伏笔 */}
            {extractionData.foreshadowings.length > 0 && (
              <details className="group">
                <summary className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-primary)]">
                  <Icon name="zap" size={14} className="text-[var(--nv-creative)]" /> 伏笔线索 ({extractionData.foreshadowings.length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {extractionData.foreshadowings.map((f: any, i: number) => {
                    const isAdopted = adoptedForeshadowings.has(String(i));
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${isAdopted ? "bg-[var(--nv-success-soft)] border border-[var(--nv-success)]/30" : "bg-[var(--nv-surface-1)]"}`}>
                        <button onClick={() => toggleAdopt(setAdoptedForeshadowings, String(i))}
                          className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                            ${isAdopted ? "bg-[var(--nv-success)] border-[var(--nv-success)] text-white" : "border-[var(--nv-border-3)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-text-secondary)]"}`}>
                          {isAdopted ? <Icon name="check" size={11} /> : null}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[var(--nv-text-secondary)]">{f.description}</span>
                            <span className={`text-[10px] px-1 rounded ${f.importance === "极高" ? "bg-[var(--nv-danger-soft)] text-[var(--nv-danger)]" : f.importance === "高" ? "bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]" : "bg-[var(--nv-surface-3)] text-[var(--nv-text-tertiary)]"}`}>
                              {f.importance}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}

            {/* 关系变化 */}
            {extractionData.relationshipChanges.length > 0 && (
              <details className="group">
                <summary className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-primary)]">
                  <Icon name="share" size={14} className="text-[var(--nv-info)]" /> 关系变化 ({extractionData.relationshipChanges.length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {extractionData.relationshipChanges.map((r: any, i: number) => {
                    const isAdopted = adoptedRelationships.has(String(i));
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${isAdopted ? "bg-[var(--nv-success-soft)] border border-[var(--nv-success)]/30" : "bg-[var(--nv-surface-1)]"}`}>
                        <button onClick={() => toggleAdopt(setAdoptedRelationships, String(i))}
                          className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                            ${isAdopted ? "bg-[var(--nv-success)] border-[var(--nv-success)] text-white" : "border-[var(--nv-border-3)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-text-secondary)]"}`}>
                          {isAdopted ? <Icon name="check" size={11} /> : null}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-[var(--nv-text-primary)]">{r.charA} ↔ {r.charB}</span>
                          <span className="text-[var(--nv-creative)] ml-2">{r.relation}</span>
                          {r.reason && <p className="text-[var(--nv-text-tertiary)] mt-0.5">{r.reason}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}

            {/* 摘要 & 下章衔接 */}
            {extractionData.summary && (
              <details className="group">
                <summary className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-primary)]">
                  <Icon name="file" size={14} className="text-[var(--nv-primary)]" /> 章节摘要
                </summary>
                <div className="mt-2 space-y-2 text-xs text-[var(--nv-text-secondary)]">
                  {extractionData.summary.openingConnection && (
                    <p><span className="text-[var(--nv-text-tertiary)]">章首衔接：</span>{extractionData.summary.openingConnection}</p>
                  )}
                  {extractionData.summary.keyEvents?.length > 0 && (
                    <p><span className="text-[var(--nv-text-tertiary)]">关键事件：</span>{extractionData.summary.keyEvents.join(" → ")}</p>
                  )}
                  {extractionData.summary.chapterEndHook && (
                    <p><span className="text-[var(--nv-text-tertiary)]">章尾钩子：</span>{extractionData.summary.chapterEndHook}</p>
                  )}
                  {extractionData.summary.closingSnapshot && (
                    <p><span className="text-[var(--nv-text-tertiary)]">章尾氛围：</span>{extractionData.summary.closingSnapshot}</p>
                  )}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ═══ 废词检测 ═══ */}
        {tab === "forbidden" && (
          <div className="p-4">
            {forbiddenScanResult ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1.5 text-sm font-medium ${forbiddenScanResult.passed ? "text-[var(--nv-success)]" : "text-[var(--nv-danger)]"}`}>
                    <Icon name={forbiddenScanResult.passed ? "check" : "x"} size={15} /> {forbiddenScanResult.passed ? "废词检测通过" : `发现 ${forbiddenScanResult.totalMatches} 处问题`}
                  </span>
                  <span className="text-[10px] text-[var(--nv-text-tertiary)]">质量分 {forbiddenScanResult.qualityScore}/100</span>
                  {forbiddenScanResult.fuzzyDensity > 0 && (
                    <span className={`text-[10px] px-1.5 rounded ${forbiddenScanResult.fuzzyDensity > 3 ? "bg-[var(--nv-danger-soft)] text-[var(--nv-danger)]" : "bg-[var(--nv-surface-3)] text-[var(--nv-text-tertiary)]"}`}>
                      <Icon name="cloud" size={10} /> 模糊词 {forbiddenScanResult.fuzzyDensity.toFixed(1)}/500字
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--nv-text-secondary)]">{forbiddenScanResult.summary}</p>
                {forbiddenScanResult.matches.map((m: any, i: number) => (
                  <div key={i} className={`rounded px-3 py-2 text-xs ${m.severity === "error" ? "bg-[var(--nv-danger-soft)] border border-[var(--nv-danger)]/30" : m.severity === "warning" ? "bg-[var(--nv-accent-soft)] border border-[var(--nv-accent)]/20" : "bg-[var(--nv-surface-2)]"}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={m.severity === "error" ? "text-[var(--nv-danger)]" : m.severity === "warning" ? "text-[var(--nv-accent)]" : "text-[var(--nv-text-tertiary)]"}>
                        <Icon name={m.severity === "error" ? "x" : m.severity === "warning" ? "alert" : "info"} size={13} />
                      </span>
                      <span className="text-[var(--nv-text-secondary)] font-mono">{m.pattern?.length > 40 ? m.pattern.slice(0, 40) + "…" : m.pattern}</span>
                      <span className="text-[var(--nv-text-tertiary)] text-[10px] ml-auto shrink-0">{
                        FORBIDDEN_CATEGORIES.find((c: any) => c.key === m.category)?.label || m.category
                      }</span>
                    </div>
                    {m.context && m.index >= 0 && <p className="text-[var(--nv-text-tertiary)] mt-0.5 ml-4 truncate">{m.context}</p>}
                    {m.suggestion && <p className="text-[var(--nv-success)]/80 mt-0.5 ml-4 flex items-center gap-1"><Icon name="lightbulb" size={11} /> {m.suggestion}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--nv-text-tertiary)] text-center py-6">暂无废词检测结果。生成章节后自动扫描。</p>
            )}
          </div>
        )}

        {/* ═══ 逻辑自查 ═══ */}
        {tab === "logic" && (
          <div className="p-4">
            {logicCheckResult ? (
              <div className="space-y-3">
                <span className={`flex items-center gap-1.5 text-sm font-medium ${logicCheckResult.passed ? "text-[var(--nv-success)]" : "text-[var(--nv-danger)]"}`}>
                  <Icon name={logicCheckResult.passed ? "check" : "x"} size={15} /> {logicCheckResult.passed ? "逻辑自查通过" : `发现 ${logicCheckResult.issues.length} 个问题`}
                </span>
                {logicCheckResult.summary && <p className="text-xs text-[var(--nv-text-secondary)]">{logicCheckResult.summary}</p>}
                {logicCheckResult.issues.map((issue: any, i: number) => (
                  <div key={i} className={`rounded px-3 py-2 text-xs ${issue.severity === "error" ? "bg-[var(--nv-danger-soft)] border border-[var(--nv-danger)]/30" : issue.severity === "warning" ? "bg-[var(--nv-accent-soft)] border border-[var(--nv-accent)]/20" : "bg-[var(--nv-surface-2)]"}`}>
                    <div className="flex items-center gap-2">
                      <span className={issue.severity === "error" ? "text-[var(--nv-danger)]" : issue.severity === "warning" ? "text-[var(--nv-accent)]" : "text-[var(--nv-text-tertiary)]"}>
                        <Icon name={issue.severity === "error" ? "x" : issue.severity === "warning" ? "alert" : "info"} size={13} />
                      </span>
                      <span className="text-[var(--nv-text-secondary)]">{issue.description}</span>
                    </div>
                    {issue.evidence && <p className="text-[var(--nv-text-tertiary)] mt-1 ml-5 truncate">{issue.evidence}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--nv-text-tertiary)] text-center py-6">暂无逻辑自查结果。生成章节后自动运行。</p>
            )}
          </div>
        )}

        {/* ═══ 本地蒸馏 ═══ */}
        {tab === "distill" && (
          <div className="p-4">
            {distillSummary ? (
              <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-sm text-[var(--nv-text-primary)]">
                  <Icon name="zap" size={15} className="text-[var(--nv-creative)]" /> 本地蒸馏完成 <span className="text-[var(--nv-text-tertiary)]">（{distillSummary.elapsedMs}ms · 零Token）</span>
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {distillSummary.entityCount > 0 && (
                    <div className="bg-[var(--nv-surface-2)] rounded px-3 py-2">
                      <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name="search" size={11} /> 实体检测</span>
                      <p className="text-[var(--nv-text-primary)] font-medium">{distillSummary.entityCount} 个</p>
                    </div>
                  )}
                  {distillSummary.stateChangeCount > 0 && (
                    <div className="bg-[var(--nv-surface-2)] rounded px-3 py-2">
                      <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name="chart" size={11} /> 状态变化</span>
                      <p className="text-[var(--nv-text-primary)] font-medium">{distillSummary.stateChangeCount} 处</p>
                    </div>
                  )}
                  {distillSummary.foreshadowCount > 0 && (
                    <div className="bg-[var(--nv-surface-2)] rounded px-3 py-2">
                      <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name="zap" size={11} /> 伏笔信号</span>
                      <p className="text-[var(--nv-text-primary)] font-medium">{distillSummary.foreshadowCount} 个</p>
                    </div>
                  )}
                  {distillSummary.consistencyIssueCount > 0 && (
                    <div className="bg-[var(--nv-surface-2)] rounded px-3 py-2">
                      <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name="alert" size={11} /> 一致性问题</span>
                      <p className="text-[var(--nv-accent)] font-medium">{distillSummary.consistencyIssueCount} 处</p>
                    </div>
                  )}
                  {distillSummary.foreshadowCreated > 0 && (
                    <div className="bg-[var(--nv-surface-2)] rounded px-3 py-2">
                      <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name="check" size={11} /> 新增伏笔</span>
                      <p className="text-[var(--nv-success)] font-medium">{distillSummary.foreshadowCreated} 个</p>
                    </div>
                  )}
                  {distillSummary.foreshadowUpdated > 0 && (
                    <div className="bg-[var(--nv-surface-2)] rounded px-3 py-2">
                      <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name="refresh" size={11} /> 伏笔更新</span>
                      <p className="text-[var(--nv-accent)] font-medium">{distillSummary.foreshadowUpdated} 个</p>
                    </div>
                  )}
                  {distillSummary.entitiesAutoCreated > 0 && (
                    <div className="bg-[var(--nv-surface-2)] rounded px-3 py-2">
                      <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name="plus" size={11} /> 自动创建实体</span>
                      <p className="text-[var(--nv-success)] font-medium">{distillSummary.entitiesAutoCreated} 个</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--nv-text-tertiary)] text-center py-6">暂无蒸馏数据。生成章节后自动运行。</p>
            )}
          </div>
        )}

        {/* ═══ 审校 ═══ */}
        {tab === "review" && (
          <div className="p-4">
            {reviewResult ? (
              <div className="space-y-3">
                <p className={`flex items-center gap-1.5 text-sm font-medium ${reviewResult.passed ? "text-[var(--nv-success)]" : "text-[var(--nv-accent)]"}`}>
                  <Icon name={reviewResult.passed ? "check" : "alert"} size={15} /> {reviewResult.passed ? "审校通过" : `审校发现 ${reviewResult.issues.length} 个问题`}
                </p>
                {reviewResult.issues.map((issue: ReviewIssue, i: number) => (
                  <div key={i} className={`rounded px-3 py-2 text-xs ${issue.severity === "major" || issue.severity === "critical" ? "bg-[var(--nv-danger-soft)] border border-[var(--nv-danger)]/30" : issue.severity === "minor" ? "bg-[var(--nv-accent-soft)] border border-[var(--nv-accent)]/20" : "bg-[var(--nv-surface-2)]"}`}>
                    <p className="text-[var(--nv-text-secondary)]">{issue.description}</p>
                    {issue.location && <p className="text-[var(--nv-text-tertiary)] mt-1">位置：{issue.location.slice(0, 80)}</p>}
                    {issue.suggestion && <p className="text-[var(--nv-success)]/80 mt-0.5 flex items-center gap-1"><Icon name="lightbulb" size={11} /> {issue.suggestion}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--nv-text-tertiary)] text-center py-6">暂无审校结果。生成章节后自动运行。</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
