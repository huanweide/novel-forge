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
  actionType?: string;
}

interface Props {
  turns: TurnRecord[];
  lastNarrative: string;
  isStreaming: boolean;
  entities: GameEntity[];
  items: GameItem[];
}

// 操作类型徽标：不同操作（战斗/对话/观察…）用不同语义色，满足「不同操作 UI 效果不同」且统一到虚空玻璃令牌
const ACTION_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  start:    { label: "开场", color: "var(--nv-creative)", bg: "var(--nv-creative-soft)" },
  observe:  { label: "观察", color: "var(--nv-info)", bg: "var(--nv-info-soft)" },
  dialogue: { label: "对话", color: "var(--nv-success)", bg: "var(--nv-success-soft)" },
  combat:   { label: "战斗", color: "var(--nv-danger)", bg: "var(--nv-danger-soft)" },
  explore:  { label: "探索", color: "var(--nv-primary)", bg: "var(--nv-primary-soft)" },
  use_item: { label: "使用物品", color: "var(--nv-accent)", bg: "var(--nv-accent-soft)" },
  rest:     { label: "休息", color: "var(--nv-text-tertiary)", bg: "rgba(152,150,140,0.12)" },
  option:   { label: "选择", color: "var(--nv-warning)", bg: "var(--nv-warning-soft)" },
  custom:   { label: "自由行动", color: "var(--nv-gold)", bg: "rgba(228,184,99,0.12)" },
};

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
      {turns.map((turn) => {
        const badge = turn.actionType ? ACTION_BADGE[turn.actionType] : undefined;
        return (
          <div key={turn.round} className="space-y-2">
            {/* 操作类型徽标 + 该轮玩家行动（不同操作颜色不同） */}
            {badge && (
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ color: badge.color, backgroundColor: badge.bg }}
                >
                  {badge.label}
                </span>
                <span className="text-xs text-[var(--nv-text-tertiary)]">
                  第{turn.round}轮 · {turn.playerAction}
                </span>
              </div>
            )}
            {/* 叙事正文 */}
            <div className="text-[var(--nv-text-secondary)] leading-relaxed whitespace-pre-wrap text-[15px]">
              {turn.narrative}
            </div>
          </div>
        );
      })}

      {/* 流式生成中的文本（最后未完成轮次） */}
      {isStreaming && lastNarrative && (
        <div className="text-[var(--nv-text-secondary)] leading-relaxed whitespace-pre-wrap text-[15px]">
          {lastNarrative}
          <span className="inline-block w-2 h-4 bg-[var(--nv-creative)] ml-0.5 animate-pulse align-middle" />
        </div>
      )}

      {/* 新实体展示 */}
      {entities.length > 0 && (
        <div
          className={`transition-all duration-700 rounded-lg p-3 border ${
            newEntityFlash
              ? "border-[var(--nv-warning)]/60 bg-[var(--nv-warning)]/10"
              : "border-[var(--nv-creative)]/20 bg-[var(--nv-creative)]/5"
          }`}
        >
          <p className="text-xs text-[var(--nv-warning)]/80 mb-2 font-medium">
            === 新实体 ===
          </p>
          <div className="space-y-1">
            {entities.slice(-5).map((e, i) => (
              <div key={i} className="text-xs text-[var(--nv-text-tertiary)] flex gap-2">
                <span className="text-[var(--nv-warning)]/70 font-mono shrink-0">
                  NE|
                </span>
                <span className="text-[var(--nv-text-secondary)]">{e.name}</span>
                <span className="text-[var(--nv-text-muted)]">|</span>
                <span className="text-[var(--nv-creative)]/60">{e.type}</span>
                {e.description && (
                  <>
                    <span className="text-[var(--nv-text-muted)]">|</span>
                    <span className="text-[var(--nv-text-muted)]">{e.description}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 物品变动 */}
      {items.length > 0 && (
        <div className="rounded-lg p-3 border border-[var(--nv-success)]/20 bg-[var(--nv-success)]/5">
          <p className="text-xs text-[var(--nv-success)]/80 mb-2 font-medium">
            === 角色物品变动 ===
          </p>
          <div className="space-y-1">
            {items.map((item, i) => (
              <div key={i} className="text-xs text-[var(--nv-text-tertiary)]">
                <span className="text-[var(--nv-success)]/70 font-mono">
                  {item.quantity > 0 ? "获得" : "消耗"}
                </span>
                <span className="text-[var(--nv-text-muted)] mx-2">×</span>
                <span className="text-[var(--nv-text-secondary)]">
                  {item.quantity > 0 ? item.quantity : -item.quantity}
                </span>
                <span className="text-[var(--nv-text-muted)] mx-1">—</span>
                <span className="text-[var(--nv-text-secondary)]">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
