"use client";

/**
 * 游戏主画布 —— 展示叙事流、实体/物品变动
 *
 * 简洁暗黑风格，新实体出现时金色微闪，流式文本打字感
 */

import { useRef, useEffect, useState } from "react";
import type { GameEntity, GameItem } from "@/core/game/types";

interface TurnRecord {
  round: number;
  playerAction: string;
  narrative: string;
}

interface Props {
  turns: TurnRecord[];
  lastNarrative: string;
  isStreaming: boolean;
  entities: GameEntity[];
  items: GameItem[];
}

export default function GameCanvas({
  turns,
  lastNarrative,
  isStreaming,
  entities,
  items,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [newEntityFlash, setNewEntityFlash] = useState(false);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastNarrative, turns.length]);

  // 新实体闪烁效果
  useEffect(() => {
    if (entities.length > 0) {
      setNewEntityFlash(true);
      const t = setTimeout(() => setNewEntityFlash(false), 1500);
      return () => clearTimeout(t);
    }
  }, [entities.length]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 历史轮次 */}
      {turns.map((turn) => (
        <div key={turn.round} className="space-y-2">
          {/* 叙事正文 */}
          <div className="text-gray-200 leading-relaxed whitespace-pre-wrap text-[15px]">
            {turn.narrative}
          </div>
        </div>
      ))}

      {/* 流式生成中的文本（最后未完成轮次） */}
      {isStreaming && lastNarrative && (
        <div className="text-gray-200 leading-relaxed whitespace-pre-wrap text-[15px]">
          {lastNarrative}
          <span className="inline-block w-2 h-4 bg-violet-400 ml-0.5 animate-pulse align-middle" />
        </div>
      )}

      {/* 新实体展示 */}
      {entities.length > 0 && (
        <div
          className={`transition-all duration-700 rounded-lg p-3 border ${
            newEntityFlash
              ? "border-amber-600/60 bg-amber-900/10"
              : "border-violet-900/20 bg-violet-900/5"
          }`}
        >
          <p className="text-xs text-amber-400/80 mb-2 font-medium">
            === 新实体 ===
          </p>
          <div className="space-y-1">
            {entities.slice(-5).map((e, i) => (
              <div key={i} className="text-xs text-gray-400 flex gap-2">
                <span className="text-amber-500/70 font-mono shrink-0">
                  NE|
                </span>
                <span className="text-gray-300">{e.name}</span>
                <span className="text-gray-600">|</span>
                <span className="text-violet-400/60">{e.type}</span>
                {e.description && (
                  <>
                    <span className="text-gray-600">|</span>
                    <span className="text-gray-500">{e.description}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 物品变动 */}
      {items.length > 0 && (
        <div className="rounded-lg p-3 border border-emerald-900/20 bg-emerald-900/5">
          <p className="text-xs text-emerald-400/80 mb-2 font-medium">
            === 角色物品变动 ===
          </p>
          <div className="space-y-1">
            {items.map((item, i) => (
              <div key={i} className="text-xs text-gray-400">
                <span className="text-emerald-500/70 font-mono">
                  {item.quantity > 0 ? "获得" : "消耗"}
                </span>
                <span className="text-gray-500 mx-2">×</span>
                <span className="text-gray-300">
                  {item.quantity > 0 ? item.quantity : -item.quantity}
                </span>
                <span className="text-gray-600 mx-1">—</span>
                <span className="text-gray-300">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
