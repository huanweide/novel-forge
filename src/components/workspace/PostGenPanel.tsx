"use client";

/**
 * PostGenPanel — 统一的生成后分析面板
 *
 * 替代旧版 ChapterExtractionPanel（全屏弹窗）+ CardUpdater（旧三卡分析）
 * + distillSummary 浮动横幅 + autoUpdateNotification 浮动横幅
 * + cardUpdatePending 浮动按钮 + "AI 分析本章变化"按钮。
 *
 * 内联在正文下方，5 Tab：提取 / 废词检测 / 逻辑自查 / 蒸馏 / 审校。
 * UI 区块已拆分为 ./postgen/* 子组件（PostGenPanelHeader / PostGenPanelTabs /
 * ExtractionTab / ForbiddenTab / LogicTab / DistillTab / ReviewTab），
 * 本文件保留全部状态与副作用逻辑，仅做装配。
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import type { ReviewIssue } from "./types";
import {
  TABS,
  type TabKey,
  type ExtractionData,
  type DistillSummary,
  type ForbiddenScanResult,
  type LogicScanResult,
  type AdoptControllers,
} from "./postgen/types";
import { PostGenPanelHeader } from "./postgen/PostGenPanelHeader";
import { PostGenPanelTabs } from "./postgen/PostGenPanelTabs";
import { ExtractionTab } from "./postgen/ExtractionTab";
import { PlotTab } from "./postgen/PlotTab";
import { ForbiddenTab } from "./postgen/ForbiddenTab";
import { LogicTab } from "./postgen/LogicTab";
import { DistillTab } from "./postgen/DistillTab";
import { ReviewTab } from "./postgen/ReviewTab";
import { StyleTab } from "./postgen/StyleTab";
import { SafetyTab } from "./postgen/SafetyTab";

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

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
  forbiddenScanResult: ForbiddenScanResult | null;

  /** 逻辑自查结果（SSE 自动推送） */
  logicCheckResult: LogicScanResult | null;

  /** 审校结果 */
  reviewResult: { passed: boolean; issues: ReviewIssue[] } | null;

  /** 操作回调 */
  onApplyExtraction: (selected: any) => Promise<void>;
  onContinueWriting: () => void;
  onClose: () => void;
  onRefresh: () => void;
}

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
  const [adoptedPlotEvents, setAdoptedPlotEvents] = useState<Set<string>>(new Set());

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
    // 情节：默认全选（用户可取消勾选），与抽取结果同源
    const kes = (extractionData.summary?.keyEvents || []).filter((e: any) => typeof e === "string" && e.trim());
    setAdoptedPlotEvents(new Set(kes.map((_: any, i: number) => String(i))));
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
        plotEvents: (extractionData.summary?.keyEvents || [])
          .filter((e: any) => typeof e === "string" && e.trim())
          .filter((_: any, i: number) => adoptedPlotEvents.has(String(i))),
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

  // ── 采纳控制（注入 ExtractionTab） ──
  const adopt: AdoptControllers = {
    chars: { set: adoptedChars, toggle: (i) => toggleAdopt(setAdoptedChars, i) },
    locations: { set: adoptedLocations, toggle: (i) => toggleAdopt(setAdoptedLocations, i) },
    factions: { set: adoptedFactions, toggle: (i) => toggleAdopt(setAdoptedFactions, i) },
    items: { set: adoptedItems, toggle: (i) => toggleAdopt(setAdoptedItems, i) },
    foreshadowings: { set: adoptedForeshadowings, toggle: (i) => toggleAdopt(setAdoptedForeshadowings, i) },
    relationships: { set: adoptedRelationships, toggle: (i) => toggleAdopt(setAdoptedRelationships, i) },
    plotEvents: { set: adoptedPlotEvents, toggle: (i) => toggleAdopt(setAdoptedPlotEvents, i) },
  };

  // ── 渲染 ──

  if (!extractionData && !distillSummary && !reviewResult) return null;

  return (
    <div className="mt-6 border border-[var(--nv-border-2)] rounded-xl bg-[var(--nv-abyss)] overflow-hidden">
      <PostGenPanelHeader
        extractionData={extractionData}
        extractionLoading={extractionLoading}
        saveMessage={saveMessage}
        saving={saving}
        onSave={handleSave}
        onContinueWriting={onContinueWriting}
        onClose={onClose}
      />
      <PostGenPanelTabs
        tab={tab}
        onTabChange={setTab}
        extractionData={extractionData}
        forbiddenScanResult={forbiddenScanResult}
        logicCheckResult={logicCheckResult}
        distillSummary={distillSummary}
        reviewResult={reviewResult}
      />
      <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
        {tab === "extraction" && extractionData && (
          <ExtractionTab extractionData={extractionData} adopt={adopt} importanceStars={importanceStars} />
        )}
        {tab === "plot" && extractionData && (
          <PlotTab extractionData={extractionData} adopt={adopt} />
        )}
        {tab === "forbidden" && (
          <ForbiddenTab forbiddenScanResult={forbiddenScanResult} />
        )}
        {tab === "logic" && (
          <LogicTab logicCheckResult={logicCheckResult} />
        )}
        {tab === "distill" && (
          <DistillTab distillSummary={distillSummary} />
        )}
        {tab === "review" && (
          <ReviewTab reviewResult={reviewResult} />
        )}
        {tab === "style" && (
          <StyleTab projectId={projectId} />
        )}
        {tab === "safety" && (
          <SafetyTab projectId={projectId} chapterContent={chapterContent} />
        )}
      </div>
    </div>
  );
}
