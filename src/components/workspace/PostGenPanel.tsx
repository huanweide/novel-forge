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

const TABS: Array<{ key: TabKey; icon: string; label: string }> = [
  { key: "extraction", icon: "📊", label: "章节提取" },
  { key: "forbidden", icon: "🚫", label: "废词检测" },
  { key: "logic", icon: "🔍", label: "逻辑自查" },
  { key: "distill", icon: "⚡", label: "本地蒸馏" },
  { key: "review", icon: "📝", label: "审校" },
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
        setSaveMessage(`✅ 保存完成：${data.summary || "无变更"}`);
        onRefresh();
        setTimeout(() => onClose(), 1500);
      } else {
        setSaveMessage(`❌ 保存失败：${data.error || "未知错误"}`);
      }
    } catch (err) {
      setSaveMessage(`❌ 网络错误：${err instanceof Error ? err.message : "未知"}`);
    } finally { setSaving(false); }
  };

  // ── 辅助 ──
  const toggleAdopt = (setFn: React.Dispatch<React.SetStateAction<Set<string>>>, idx: string) => {
    setFn((prev) => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; });
  };

  const importanceStars = (score: number) => "★".repeat(Math.min(5, Math.round(score / 2))) + "☆".repeat(Math.max(0, 5 - Math.round(score / 2)));

  // ── 渲染 ──

  if (!extractionData && !distillSummary && !reviewResult) return null;

  return (
    <div className="mt-6 border border-zinc-800 rounded-xl bg-zinc-900/60 overflow-hidden">
      {/* 头部 stats */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-zinc-200">📊 本章分析</h3>
          {extractionData && (
            <div className="flex gap-2 text-[10px] text-zinc-500">
              <span title="角色">👤 {extractionData.counts?.characters || 0}</span>
              <span title="场景">📍 {extractionData.counts?.locations || 0}</span>
              <span title="道具">🗡️ {extractionData.counts?.items || 0}</span>
              <span title="伏笔">🔮 {extractionData.counts?.foreshadowings || 0}</span>
              <span title="关系">🕸️ {extractionData.counts?.relationshipChanges || 0}</span>
            </div>
          )}
          {extractionLoading && (
            <span className="text-[10px] text-indigo-400 animate-pulse">⏳ 提取中…</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saveMessage && <span className={`text-[10px] ${saveMessage.startsWith("✅") ? "text-emerald-400" : "text-red-400"}`}>{saveMessage}</span>}
          <Button onClick={handleSave} disabled={saving || !extractionData} size="sm" className="bg-emerald-600 hover:bg-emerald-500 h-7 text-xs">
            {saving ? "保存中…" : "全部采纳"}
          </Button>
          <Button onClick={onContinueWriting} size="sm" className="bg-indigo-600 hover:bg-indigo-500 h-7 text-xs">
            ✨ 继续写下一节
          </Button>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 text-sm">✕</button>
        </div>
      </div>

      {/* Tab 栏 */}
      <div className="flex border-b border-zinc-800">
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
              className={`flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5
                ${tab === t.key ? "text-zinc-200 border-b-2 border-indigo-500 bg-zinc-800/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/10"}
                ${!hasContent ? "opacity-40" : ""}`}>
              {t.icon} {t.label}
              {hasIssues && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
            </button>
          );
        })}
      </div>

      {/* Tab 内容 */}
      <div className="max-h-[60vh] overflow-y-auto">
        {/* ═══ 📊 章节提取 ═══ */}
        {tab === "extraction" && extractionData && (
          <div className="p-4 space-y-4">
            {/* 角色 */}
            {extractionData.characters.length > 0 && (
              <details open className="group">
                <summary className="text-sm font-medium text-zinc-300 cursor-pointer hover:text-zinc-200">
                  👤 出场角色 ({extractionData.characters.length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {extractionData.characters.map((c: any, i: number) => {
                    const isAdopted = adoptedChars.has(String(i));
                    const isNew = c.isNew && c.suggestion === "create";
                    const isPasserby = c.suggestion === "ignore";
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs group/item ${isPasserby ? "opacity-50" : ""} ${isAdopted ? "bg-emerald-950/20 border border-emerald-900/30" : "bg-zinc-800/30"}`}>
                        <button onClick={() => toggleAdopt(setAdoptedChars, String(i))}
                          className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                            ${isAdopted ? "bg-emerald-600 border-emerald-500 text-white" : "border-zinc-600 text-zinc-600 hover:border-zinc-400"}`}>
                          {isAdopted ? "✓" : ""}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-zinc-200">{c.name}</span>
                            <span className="text-zinc-600">{c.role}</span>
                            <span className="text-amber-400/80 text-[10px]">{importanceStars(c.importance)}</span>
                            {isNew && <span className="text-emerald-400 text-[10px] bg-emerald-950/40 px-1 rounded">新角色</span>}
                            {isPasserby && <span className="text-amber-500 text-[10px] bg-amber-950/30 px-1 rounded">疑似路人</span>}
                          </div>
                          {c.experience && <p className="text-zinc-500 mt-0.5">{c.experience}</p>}
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
                <summary className="text-sm font-medium text-zinc-300 cursor-pointer hover:text-zinc-200">
                  📍 场景地点 ({extractionData.locations.length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {extractionData.locations.map((l: any, i: number) => {
                    const isAdopted = adoptedLocations.has(String(i));
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${l.suggestion === "ignore" ? "opacity-50" : ""} ${isAdopted ? "bg-emerald-950/20 border border-emerald-900/30" : "bg-zinc-800/30"}`}>
                        <button onClick={() => toggleAdopt(setAdoptedLocations, String(i))}
                          className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                            ${isAdopted ? "bg-emerald-600 border-emerald-500 text-white" : "border-zinc-600 text-zinc-600 hover:border-zinc-400"}`}>
                          {isAdopted ? "✓" : ""}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-zinc-200">{l.name}</span>
                            <span className="text-zinc-600">{l.type}</span>
                            {l.isNew && <span className="text-emerald-400 text-[10px] bg-emerald-950/40 px-1 rounded">新</span>}
                          </div>
                          {l.description && <p className="text-zinc-500 mt-0.5 truncate">{l.description}</p>}
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
                <summary className="text-sm font-medium text-zinc-300 cursor-pointer hover:text-zinc-200">
                  🏛️ 势力阵营 ({extractionData.factions.length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {extractionData.factions.map((f: any, i: number) => {
                    const isAdopted = adoptedFactions.has(String(i));
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${isAdopted ? "bg-emerald-950/20 border border-emerald-900/30" : "bg-zinc-800/30"}`}>
                        <button onClick={() => toggleAdopt(setAdoptedFactions, String(i))}
                          className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                            ${isAdopted ? "bg-emerald-600 border-emerald-500 text-white" : "border-zinc-600 text-zinc-600 hover:border-zinc-400"}`}>
                          {isAdopted ? "✓" : ""}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-zinc-200">{f.name}</span>
                          <span className="text-zinc-600 ml-2">{f.type}</span>
                          {f.leader && <span className="text-zinc-500 ml-2">首领：{f.leader}</span>}
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
                <summary className="text-sm font-medium text-zinc-300 cursor-pointer hover:text-zinc-200">
                  🗡️ 道具物品 ({extractionData.items.length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {extractionData.items.map((it: any, i: number) => {
                    const isAdopted = adoptedItems.has(String(i));
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${isAdopted ? "bg-emerald-950/20 border border-emerald-900/30" : "bg-zinc-800/30"}`}>
                        <button onClick={() => toggleAdopt(setAdoptedItems, String(i))}
                          className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                            ${isAdopted ? "bg-emerald-600 border-emerald-500 text-white" : "border-zinc-600 text-zinc-600 hover:border-zinc-400"}`}>
                          {isAdopted ? "✓" : ""}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-zinc-200">{it.name}</span>
                          <span className="text-zinc-600 ml-2">{it.type}</span>
                          {it.rarity && <span className="text-amber-400 ml-2">{it.rarity}</span>}
                          {it.owner && <span className="text-zinc-500 ml-2">持有：{it.owner}</span>}
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
                <summary className="text-sm font-medium text-zinc-300 cursor-pointer hover:text-zinc-200">
                  🔮 伏笔线索 ({extractionData.foreshadowings.length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {extractionData.foreshadowings.map((f: any, i: number) => {
                    const isAdopted = adoptedForeshadowings.has(String(i));
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${isAdopted ? "bg-emerald-950/20 border border-emerald-900/30" : "bg-zinc-800/30"}`}>
                        <button onClick={() => toggleAdopt(setAdoptedForeshadowings, String(i))}
                          className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                            ${isAdopted ? "bg-emerald-600 border-emerald-500 text-white" : "border-zinc-600 text-zinc-600 hover:border-zinc-400"}`}>
                          {isAdopted ? "✓" : ""}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-300">{f.description}</span>
                            <span className={`text-[10px] px-1 rounded ${f.importance === "极高" ? "bg-red-950/40 text-red-400" : f.importance === "高" ? "bg-amber-950/40 text-amber-400" : "bg-zinc-800 text-zinc-500"}`}>
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
                <summary className="text-sm font-medium text-zinc-300 cursor-pointer hover:text-zinc-200">
                  🕸️ 关系变化 ({extractionData.relationshipChanges.length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {extractionData.relationshipChanges.map((r: any, i: number) => {
                    const isAdopted = adoptedRelationships.has(String(i));
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${isAdopted ? "bg-emerald-950/20 border border-emerald-900/30" : "bg-zinc-800/30"}`}>
                        <button onClick={() => toggleAdopt(setAdoptedRelationships, String(i))}
                          className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                            ${isAdopted ? "bg-emerald-600 border-emerald-500 text-white" : "border-zinc-600 text-zinc-600 hover:border-zinc-400"}`}>
                          {isAdopted ? "✓" : ""}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-zinc-200">{r.charA} ↔ {r.charB}</span>
                          <span className="text-purple-400 ml-2">{r.relation}</span>
                          {r.reason && <p className="text-zinc-500 mt-0.5">{r.reason}</p>}
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
                <summary className="text-sm font-medium text-zinc-300 cursor-pointer hover:text-zinc-200">
                  📝 章节摘要
                </summary>
                <div className="mt-2 space-y-2 text-xs text-zinc-400">
                  {extractionData.summary.openingConnection && (
                    <p><span className="text-zinc-500">章首衔接：</span>{extractionData.summary.openingConnection}</p>
                  )}
                  {extractionData.summary.keyEvents?.length > 0 && (
                    <p><span className="text-zinc-500">关键事件：</span>{extractionData.summary.keyEvents.join(" → ")}</p>
                  )}
                  {extractionData.summary.chapterEndHook && (
                    <p><span className="text-zinc-500">章尾钩子：</span>{extractionData.summary.chapterEndHook}</p>
                  )}
                  {extractionData.summary.closingSnapshot && (
                    <p><span className="text-zinc-500">章尾氛围：</span>{extractionData.summary.closingSnapshot}</p>
                  )}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ═══ 🚫 废词检测 ═══ */}
        {tab === "forbidden" && (
          <div className="p-4">
            {forbiddenScanResult ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${forbiddenScanResult.passed ? "text-emerald-400" : "text-red-400"}`}>
                    {forbiddenScanResult.passed ? "✅ 废词检测通过" : `❌ 发现 ${forbiddenScanResult.totalMatches} 处问题`}
                  </span>
                  <span className="text-[10px] text-zinc-500">质量分 {forbiddenScanResult.qualityScore}/100</span>
                  {forbiddenScanResult.fuzzyDensity > 0 && (
                    <span className={`text-[10px] px-1.5 rounded ${forbiddenScanResult.fuzzyDensity > 3 ? "bg-red-950/30 text-red-400" : "bg-zinc-800 text-zinc-500"}`}>
                      🌫️ 模糊词 {forbiddenScanResult.fuzzyDensity.toFixed(1)}/500字
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">{forbiddenScanResult.summary}</p>
                {forbiddenScanResult.matches.map((m: any, i: number) => (
                  <div key={i} className={`rounded px-3 py-2 text-xs ${m.severity === "error" ? "bg-red-950/30 border border-red-900/30" : m.severity === "warning" ? "bg-amber-950/20 border border-amber-900/20" : "bg-zinc-800/50"}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={m.severity === "error" ? "text-red-400" : m.severity === "warning" ? "text-amber-400" : "text-zinc-400"}>
                        {m.severity === "error" ? "❌" : m.severity === "warning" ? "⚠️" : "ℹ️"}
                      </span>
                      <span className="text-zinc-300 font-mono">{m.pattern?.length > 40 ? m.pattern.slice(0, 40) + "…" : m.pattern}</span>
                      <span className="text-zinc-600 text-[10px] ml-auto shrink-0">{
                        FORBIDDEN_CATEGORIES.find((c: any) => c.key === m.category)?.label || m.category
                      }</span>
                    </div>
                    {m.context && m.index >= 0 && <p className="text-zinc-500 mt-0.5 ml-4 truncate">{m.context}</p>}
                    {m.suggestion && <p className="text-emerald-500/80 mt-0.5 ml-4">💡 {m.suggestion}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-6">暂无废词检测结果。生成章节后自动扫描。</p>
            )}
          </div>
        )}

        {/* ═══ 🔍 逻辑自查 ═══ */}
        {tab === "logic" && (
          <div className="p-4">
            {logicCheckResult ? (
              <div className="space-y-3">
                <span className={`text-sm font-medium ${logicCheckResult.passed ? "text-emerald-400" : "text-red-400"}`}>
                  {logicCheckResult.passed ? "✅ 逻辑自查通过" : `❌ 发现 ${logicCheckResult.issues.length} 个问题`}
                </span>
                {logicCheckResult.summary && <p className="text-xs text-zinc-400">{logicCheckResult.summary}</p>}
                {logicCheckResult.issues.map((issue: any, i: number) => (
                  <div key={i} className={`rounded px-3 py-2 text-xs ${issue.severity === "error" ? "bg-red-950/30 border border-red-900/30" : issue.severity === "warning" ? "bg-amber-950/20 border border-amber-900/20" : "bg-zinc-800/50"}`}>
                    <div className="flex items-center gap-2">
                      <span className={issue.severity === "error" ? "text-red-400" : issue.severity === "warning" ? "text-amber-400" : "text-zinc-400"}>
                        {issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️"}
                      </span>
                      <span className="text-zinc-300">{issue.description}</span>
                    </div>
                    {issue.evidence && <p className="text-zinc-500 mt-1 ml-5 truncate">{issue.evidence}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-6">暂无逻辑自查结果。生成章节后自动运行。</p>
            )}
          </div>
        )}

        {/* ═══ ⚡ 本地蒸馏 ═══ */}
        {tab === "distill" && (
          <div className="p-4">
            {distillSummary ? (
              <div className="space-y-3">
                <p className="text-sm text-zinc-300">
                  ⚡ 本地蒸馏完成 <span className="text-zinc-500">（{distillSummary.elapsedMs}ms · 零Token）</span>
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {distillSummary.entityCount > 0 && (
                    <div className="bg-zinc-800/50 rounded px-3 py-2">
                      <span className="text-zinc-500">🔍 实体检测</span>
                      <p className="text-zinc-300 font-medium">{distillSummary.entityCount} 个</p>
                    </div>
                  )}
                  {distillSummary.stateChangeCount > 0 && (
                    <div className="bg-zinc-800/50 rounded px-3 py-2">
                      <span className="text-zinc-500">📊 状态变化</span>
                      <p className="text-zinc-300 font-medium">{distillSummary.stateChangeCount} 处</p>
                    </div>
                  )}
                  {distillSummary.foreshadowCount > 0 && (
                    <div className="bg-zinc-800/50 rounded px-3 py-2">
                      <span className="text-zinc-500">🔮 伏笔信号</span>
                      <p className="text-zinc-300 font-medium">{distillSummary.foreshadowCount} 个</p>
                    </div>
                  )}
                  {distillSummary.consistencyIssueCount > 0 && (
                    <div className="bg-zinc-800/50 rounded px-3 py-2">
                      <span className="text-zinc-500">⚠️ 一致性问题</span>
                      <p className="text-amber-400 font-medium">{distillSummary.consistencyIssueCount} 处</p>
                    </div>
                  )}
                  {distillSummary.foreshadowCreated > 0 && (
                    <div className="bg-zinc-800/50 rounded px-3 py-2">
                      <span className="text-zinc-500">✅ 新增伏笔</span>
                      <p className="text-emerald-400 font-medium">{distillSummary.foreshadowCreated} 个</p>
                    </div>
                  )}
                  {distillSummary.foreshadowUpdated > 0 && (
                    <div className="bg-zinc-800/50 rounded px-3 py-2">
                      <span className="text-zinc-500">🔄 伏笔更新</span>
                      <p className="text-amber-400 font-medium">{distillSummary.foreshadowUpdated} 个</p>
                    </div>
                  )}
                  {distillSummary.entitiesAutoCreated > 0 && (
                    <div className="bg-zinc-800/50 rounded px-3 py-2">
                      <span className="text-zinc-500">🆕 自动创建实体</span>
                      <p className="text-emerald-400 font-medium">{distillSummary.entitiesAutoCreated} 个</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-6">暂无蒸馏数据。生成章节后自动运行。</p>
            )}
          </div>
        )}

        {/* ═══ 📝 审校 ═══ */}
        {tab === "review" && (
          <div className="p-4">
            {reviewResult ? (
              <div className="space-y-3">
                <p className={`text-sm font-medium ${reviewResult.passed ? "text-emerald-400" : "text-amber-400"}`}>
                  {reviewResult.passed ? "✅ 审校通过" : `⚠️ 审校发现 ${reviewResult.issues.length} 个问题`}
                </p>
                {reviewResult.issues.map((issue: ReviewIssue, i: number) => (
                  <div key={i} className={`rounded px-3 py-2 text-xs ${issue.severity === "major" || issue.severity === "critical" ? "bg-red-950/30 border border-red-900/30" : issue.severity === "minor" ? "bg-amber-950/20 border border-amber-900/20" : "bg-zinc-800/50"}`}>
                    <p className="text-zinc-300">{issue.description}</p>
                    {issue.location && <p className="text-zinc-500 mt-1">位置：{issue.location.slice(0, 80)}</p>}
                    {issue.suggestion && <p className="text-emerald-500/80 mt-0.5">💡 {issue.suggestion}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-6">暂无审校结果。生成章节后自动运行。</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
