"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

// ─── P0 格式行类型着色 ───────────────────────────────────

const P0_LINE_COLORS: Record<string, string> = {
  "C|": "text-cyan-400",
  "L0|": "text-red-400/70",
  "L1|": "text-amber-400/70",
  "L2|": "text-orange-400/70",
  "R|": "text-green-400",
  "L|": "text-teal-400",
  "G|": "text-yellow-400",
  "P|": "text-gray-400",
  "CF|": "text-purple-400",
  "M|": "text-rose-400",
  "K|": "text-amber-300",
  "EL|": "text-pink-400",
  "T|": "text-cyan-300",
  "【章首衔接】": "text-blue-400",
  "【章尾悬念】": "text-blue-400",
  "⟨✍": "text-violet-400/60 italic",
};

function getP0LineColor(line: string): string {
  for (const [prefix, color] of Object.entries(P0_LINE_COLORS)) {
    if (line.trimStart().startsWith(prefix)) return color;
  }
  return "text-gray-500";
}

function P0HighlightedPreview({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap">
      {lines.map((line, i) => (
        <div key={i} className={getP0LineColor(line)}>
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

interface DrawCard {
  outline: string; characters: string[]; coreConflict: string;
  mood: string; foreshadowing: string; cardLabel: string;
  temperature: number; error?: string;
}

interface CharacterDetail {
  id: string; name: string; role: string;
}

export function DrawCards({
  projectId, nodeId, authorNote, chapterOutlinePrompt, nodeTitle,
  onSelect, onClose,
}: {
  projectId: string; nodeId: string; authorNote: string;
  chapterOutlinePrompt: string; nodeTitle: string;
  onSelect: (card: DrawCard) => void; onClose: () => void;
}) {
  const [cards, setCards] = useState<DrawCard[]>([]);
  const [charDetails, setCharDetails] = useState<CharacterDetail[]>([]);
  const [totalChars, setTotalChars] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [drawCount, setDrawCount] = useState(4);
  const abortRef = useRef<AbortController | null>(null);

  const doDraw = async (count: number) => {
    // 取消上一次进行中的请求（防竞态）
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true); setError(""); setCards([]); setSelectedIndex(null);
    try {
      const res = await fetch("/api/generate/chapter-outline/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId, nodeId,
          prompt: chapterOutlinePrompt || undefined,
          authorNote: authorNote || undefined,
          count,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      // 只有未被取消的请求才更新 UI（防 StrictMode 竞态）
      if (abortRef.current !== controller) return;
      if (!res.ok || data.error) { setError(data.error || `HTTP ${res.status}`); return; }
      setCards(data.cards || []);
      setCharDetails(data.characterDetails || []);
      setTotalChars(data.totalCharacters || 0);
    } catch (err) {
      if (abortRef.current !== controller) return; // 请求已过期——静默丢弃
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "网络错误");
    }
    finally {
      // 只关闭当前请求的 loading，不覆盖后续请求的状态
      if (abortRef.current === controller) setLoading(false);
    }
  };

  // 自动触发（useEffect 确保 StrictMode 下也只发起一次有效请求）
  useEffect(() => {
    doDraw(drawCount);
    return () => { abortRef.current?.abort(); }; // 组件卸载时取消请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = () => {
    if (selectedIndex === null || !cards[selectedIndex]) return;
    onSelect(cards[selectedIndex]);
  };

  const roleLabel: Record<string, string> = {
    protagonist: "★主角", antagonist: "◆反派", mentor: "◈导师",
    love_interest: "♡恋爱", supporting: "●配角", background: "○背景",
  };

  const moodColors: Record<string, string> = {
    "暗流涌动": "border-purple-700 bg-purple-950/20",
    "热血沸腾": "border-red-700 bg-red-950/20",
    "哀而不伤": "border-blue-700 bg-blue-950/20",
    "轻松诙谐": "border-green-700 bg-green-950/20",
    "紧张窒息": "border-amber-700 bg-amber-950/20",
    "温馨治愈": "border-pink-700 bg-pink-950/20",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">🎴 抽卡模式——「{nodeTitle}」</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {cards.length} 张路线 · 从 {totalChars} 个角色中选角 · 点击卡片选中，再点「采用」
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={drawCount} onChange={e => setDrawCount(parseInt(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs">
              <option value={3}>3张</option><option value={4}>4张</option><option value={5}>5张</option>
            </select>
            <button onClick={() => doDraw(drawCount)} disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">
              {loading ? "⏳" : "🔄"} 重抽
            </button>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg">✕</button>
          </div>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-zinc-400">AI 正在抽取 {drawCount} 条不同路线...</p>
              <p className="text-xs text-zinc-600">每条路线用不同 temperature 生成，方向各异</p>
            </div>
          )}

          {error && (
            <div className="p-6 rounded-xl bg-red-950/30 border border-red-900/50 text-center">
              <p className="text-sm text-red-400">❌ {error}</p>
              <button onClick={() => doDraw(drawCount)} className="mt-3 text-xs text-red-400 hover:text-red-300 underline">🔄 重试</button>
            </div>
          )}

          {!loading && !error && cards.length === 0 && (
            <div className="text-center py-16 text-zinc-500 text-sm">
              暂无卡片，点击「🔄 重抽」试试
            </div>
          )}

          {!loading && !error && cards.length > 0 && (
            <div className={`grid gap-4 ${cards.length <= 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"}`}>
              {cards.map((card, i) => {
                const isSelected = selectedIndex === i;
                const moodColor = Object.entries(moodColors).find(([k]) => card.mood?.includes(k))?.[1] || "";

                return (
                  <div key={i}
                    onClick={() => setSelectedIndex(i)}
                    className={`rounded-xl border-2 p-4 cursor-pointer transition-all hover:scale-[1.02] ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-950/30 shadow-lg shadow-indigo-900/20"
                        : `border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 ${moodColor}`
                    } ${card.error ? "opacity-50" : ""}`}>
                    {/* 卡片标签 */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isSelected ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-300"
                      }`}>
                        {card.cardLabel || `路线${i + 1}`}
                      </span>
                      <span className="text-[10px] text-zinc-600">🌡 {(card.temperature * 100).toFixed(0)}% 随机度</span>
                    </div>

                    {/* 核心冲突 */}
                    {card.coreConflict && (
                      <p className="text-xs text-amber-400 font-medium mb-2 leading-relaxed">
                        ⚡ {card.coreConflict}
                      </p>
                    )}

                    {/* 章纲正文——P0格式高亮 */}
                    {card.outline && (
                      <div className="text-xs leading-relaxed mb-3 max-h-64 overflow-y-auto scrollbar-thin">
                        <P0HighlightedPreview text={card.outline} />
                      </div>
                    )}

                    {/* 情绪基调 */}
                    {card.mood && (
                      <div className="flex items-center gap-1 mb-2">
                        <span className="text-[10px] text-zinc-500">🎭</span>
                        <span className="text-[10px] text-zinc-400">{card.mood}</span>
                      </div>
                    )}

                    {/* 伏笔 */}
                    {card.foreshadowing && (
                      <div className="flex items-start gap-1 mb-2">
                        <span className="text-[10px] text-zinc-500 shrink-0">🔮</span>
                        <span className="text-[10px] text-zinc-500">{card.foreshadowing}</span>
                      </div>
                    )}

                    {/* 出场角色 */}
                    {card.characters.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-auto pt-2 border-t border-zinc-800">
                        {card.characters.map(name => { const detail = charDetails.find(c => c.name === name);
                          return (
                            <span key={name} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                              {roleLabel[detail?.role || ""] ? `${roleLabel[detail?.role || ""]} ` : ""}{name}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {card.error && <p className="text-[10px] text-red-400 mt-2">{card.error}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部 */}
        {!loading && !error && cards.length > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800 shrink-0 bg-zinc-900">
            <p className="text-xs text-zinc-500">
              {selectedIndex !== null
                ? `已选中「${cards[selectedIndex]?.cardLabel}」——点击采用写入章纲`
                : "点击一张卡片选中，然后点「采用」"}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="border-zinc-700">取消</Button>
              <Button onClick={handleSelect} disabled={selectedIndex === null}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50">
                ✅ 采用此路线
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
