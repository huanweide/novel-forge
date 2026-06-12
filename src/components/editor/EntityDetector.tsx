"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * AI 实体检测面板
 *
 * 扫描生成文本，找出还没建卡的新角色/新地点。
 * 用户可以一键创建卡片。
 */
interface DetectedEntity {
  name?: string;
  title?: string;
  evidence: string;
  suggestedRole?: string;
  suggestedPersonality?: string[];
  suggestedDialogue?: string;
  suggestedCategory?: string;
  suggestedKeys?: string[];
  suggestedContent?: string;
}

interface OutlineDrift {
  type: string;
  severity: string;
  character?: string;
  description: string;
  evidence: string;
  suggestion: string;
}

export function EntityDetector({
  projectId,
  text,
  nodeId,
  onCreated,
}: {
  projectId: string;
  text: string;
  nodeId?: string;
  onCreated: () => void;
}) {
  const [detecting, setDetecting] = useState(false);
  const [characters, setCharacters] = useState<DetectedEntity[]>([]);
  const [lore, setLore] = useState<DetectedEntity[]>([]);
  const [drifts, setDrifts] = useState<OutlineDrift[]>([]);
  const [stats, setStats] = useState<{ textLength: number; chunksScanned: number } | null>(null);
  const [detected, setDetected] = useState(false);
  const [creating, setCreating] = useState<Set<string>>(new Set());

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const res = await fetch("/api/generate/detect-entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, text, nodeId }),
      });
      if (res.ok) {
        const data = await res.json();
        setCharacters(data.newCharacters || []);
        setLore(data.newLore || []);
        setDrifts(data.outlineDrifts || []);
        setStats(data.stats || null);
        setDetected(true);
      }
    } catch (err) {
      console.error("实体检测失败:", err);
    } finally {
      setDetecting(false);
    }
  };

  const handleCreateCharacter = async (entity: DetectedEntity) => {
    const key = `char-${entity.name}`;
    setCreating((prev) => new Set(prev).add(key));
    try {
      await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: entity.name,
          role: entity.suggestedRole || "supporting",
          personality: entity.suggestedPersonality || [],
          dialogueStyle: {
            description: entity.suggestedDialogue || "",
            examples: [],
            vocabulary: [],
            speechPatterns: [],
          },
        }),
      });
      setCharacters((prev) => prev.filter((c) => c.name !== entity.name));
      onCreated();
    } catch (err) {
      console.error("创建角色失败:", err);
    } finally {
      setCreating((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleCreateLore = async (entity: DetectedEntity) => {
    const key = `lore-${entity.title}`;
    setCreating((prev) => new Set(prev).add(key));
    try {
      await fetch("/api/lorebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: entity.title,
          category: entity.suggestedCategory || "custom",
          keys: entity.suggestedKeys || [],
          content: entity.suggestedContent || "",
        }),
      });
      setLore((prev) => prev.filter((l) => l.title !== entity.title));
      onCreated();
    } catch (err) {
      console.error("创建词条失败:", err);
    } finally {
      setCreating((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const total = characters.length + lore.length + drifts.length;

  if (!detected && !detecting) {
    return (
      <button
        onClick={handleDetect}
        className="text-xs text-indigo-400 hover:text-indigo-300 underline"
      >
        🔍 检测新角色/新地点/大纲偏离
      </button>
    );
  }

  if (detecting) {
    return (
      <div className="text-xs text-zinc-500 animate-pulse">
        🔍 AI 正在分块扫描文本（{stats ? `${stats.chunksScanned}块·${stats.textLength}字` : "..."}）...
      </div>
    );
  }

  if (total === 0 && drifts.length === 0) {
    return (
      <div className="space-y-1">
        <div className="text-xs text-zinc-600">
          ✅ 未检测到新实体——所有角色和设定都已建卡
        </div>
        {stats && (
          <div className="text-[10px] text-zinc-700">
            扫描 {stats.textLength.toLocaleString()} 字 · {stats.chunksScanned} 块
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border border-indigo-800/50 bg-indigo-950/20 rounded-lg p-3 space-y-3">
      <div className="text-xs font-medium text-indigo-400">
        🆕 检测到 {characters.length} 个新角色、{lore.length} 个新地点/设定
        {drifts.length > 0 && <span className="text-amber-400"> · ⚠️ {drifts.length} 处大纲偏离</span>}
      </div>

      {stats && (
        <div className="text-[10px] text-zinc-600">
          📊 扫描 {stats.textLength.toLocaleString()} 字 · {stats.chunksScanned} 块
        </div>
      )}

      {characters.map((c, i) => (
        <div key={i} className="flex items-start justify-between gap-2 text-xs">
          <div className="flex-1 min-w-0">
            <span className="font-medium text-zinc-300">{c.name}</span>
            <span className="text-zinc-600 ml-1">({c.suggestedRole || "配角"})</span>
            {c.suggestedPersonality && c.suggestedPersonality.length > 0 && (
              <div className="text-zinc-500 truncate">
                {c.suggestedPersonality.join("、")}
              </div>
            )}
            <div className="text-zinc-700 italic truncate">「{c.evidence?.slice(0, 60)}...」</div>
          </div>
          <Button
            size="sm"
            onClick={() => handleCreateCharacter(c)}
            disabled={creating.has(`char-${c.name}`)}
            className="text-xs h-6 px-2 bg-green-700 hover:bg-green-600 shrink-0"
          >
            {creating.has(`char-${c.name}`) ? "..." : "+ 建卡"}
          </Button>
        </div>
      ))}

      {lore.map((l, i) => (
        <div key={i} className="flex items-start justify-between gap-2 text-xs">
          <div className="flex-1 min-w-0">
            <span className="font-medium text-zinc-300">{l.title}</span>
            <span className="text-zinc-600 ml-1">({l.suggestedCategory || "设定"})</span>
            <div className="text-zinc-700 italic truncate">「{l.evidence?.slice(0, 60)}...」</div>
          </div>
          <Button
            size="sm"
            onClick={() => handleCreateLore(l)}
            disabled={creating.has(`lore-${l.title}`)}
            className="text-xs h-6 px-2 bg-blue-700 hover:bg-blue-600 shrink-0"
          >
            {creating.has(`lore-${l.title}`) ? "..." : "+ 词条"}
          </Button>
        </div>
      ))}

      {/* 大纲偏离 */}
      {drifts.length > 0 && (
        <div className="border-t border-amber-900/50 pt-2 space-y-2">
          <div className="text-xs font-medium text-amber-400">⚠️ 大纲一致性警告</div>
          {drifts.map((d, i) => (
            <div key={i} className="text-xs space-y-0.5">
              <div className="flex items-center gap-2">
                <span className={`px-1 py-0.5 rounded text-[10px] ${
                  d.severity === "critical" ? "bg-red-900/50 text-red-400" :
                  d.severity === "major" ? "bg-amber-900/50 text-amber-400" :
                  "bg-zinc-800 text-zinc-400"
                }`}>
                  {d.severity === "critical" ? "严重" : d.severity === "major" ? "重要" : "轻微"}
                </span>
                <span className="text-zinc-500">{d.type === "ooc" ? "OOC" : d.type === "plot_drift" ? "情节偏离" : d.type === "pacing" ? "节奏" : "视角"}</span>
                {d.character && <span className="text-zinc-400">· {d.character}</span>}
              </div>
              <div className="text-zinc-400">{d.description}</div>
              <div className="text-zinc-700 italic">「{d.evidence?.slice(0, 80)}」</div>
              {d.suggestion && <div className="text-green-700">💡 {d.suggestion.slice(0, 100)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
