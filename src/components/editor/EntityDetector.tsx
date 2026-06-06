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

export function EntityDetector({
  projectId,
  text,
  onCreated,
}: {
  projectId: string;
  text: string;
  onCreated: () => void;
}) {
  const [detecting, setDetecting] = useState(false);
  const [characters, setCharacters] = useState<DetectedEntity[]>([]);
  const [lore, setLore] = useState<DetectedEntity[]>([]);
  const [detected, setDetected] = useState(false);
  const [creating, setCreating] = useState<Set<string>>(new Set());

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const res = await fetch("/api/generate/detect-entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, text }),
      });
      if (res.ok) {
        const data = await res.json();
        setCharacters(data.newCharacters || []);
        setLore(data.newLore || []);
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

  const total = characters.length + lore.length;

  if (!detected && !detecting) {
    return (
      <button
        onClick={handleDetect}
        className="text-xs text-indigo-400 hover:text-indigo-300 underline"
      >
        🔍 检测新角色/新地点
      </button>
    );
  }

  if (detecting) {
    return (
      <div className="text-xs text-zinc-500 animate-pulse">
        🔍 AI 正在扫描文本中的新实体...
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="text-xs text-zinc-600">
        ✅ 未检测到新实体——所有角色和设定都已建卡
      </div>
    );
  }

  return (
    <div className="border border-indigo-800/50 bg-indigo-950/20 rounded-lg p-3 space-y-3">
      <div className="text-xs font-medium text-indigo-400">
        🆕 检测到 {characters.length} 个新角色、{lore.length} 个新地点/设定
      </div>

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
    </div>
  );
}
