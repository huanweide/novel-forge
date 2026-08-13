"use client";

import { useState, useEffect } from "react";

export interface ScheduledCard {
  id: string; name: string; role: string; score: number;
  reasons: string[]; affiliation: string; motivation: string;
  appeared: boolean; background: string; isNew: boolean;
}

export function PreGenConfirm({
  projectId, nodeId, authorNote, title, onAuthorNoteChange, onConfirm, onCancel,
}: {
  projectId: string; nodeId?: string; authorNote: string; title?: string;
  onAuthorNoteChange: (v: string) => void;
  onConfirm: (cards: string[], notes: Record<string, string>, newChars: string[], finalAuthorNote: string) => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<ScheduledCard[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cardNotes, setCardNotes] = useState<Record<string, string>>({});
  const [newCharInput, setNewCharInput] = useState("");
  const [newChars, setNewChars] = useState<string[]>([]);
  const [storyInfo, setStoryInfo] = useState<{ storyPhase: string; sceneContext: string; chapterTitle: string; chapterOutline: string; totalCharacters: number; missingRoleSuggestions: string[] } | null>(null);
  const [error, setError] = useState("");
  const [localAuthorNote, setLocalAuthorNote] = useState(authorNote);

  useEffect(() => {
    const ctrl = new AbortController();
    loadCards(ctrl.signal);
    return () => ctrl.abort();
  }, []);

  const loadCards = async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const url = nodeId
        ? `/api/generate/pre-write-cards?projectId=${projectId}&nodeId=${nodeId}`
        : `/api/generate/pre-write-cards?projectId=${projectId}`;
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCards(data.scheduledCards || []);
      setStoryInfo(data);
      setSelected(new Set((data.scheduledCards || []).map((c: ScheduledCard) => c.id)));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "加载失败");
    } finally { setLoading(false); }
  };

  const toggleCard = (id: string) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const addNewChar = () => {
    const name = newCharInput.trim();
    if (!name || newChars.includes(name)) return;
    setNewChars([...newChars, name]); setNewCharInput("");
  };

  const handleConfirm = () => {
    const confirmedIds = cards.filter(c => selected.has(c.id)).map(c => c.id);
    onConfirm(confirmedIds, cardNotes, newChars, localAuthorNote);
  };

  const roleLabel = (r: string) => {
    const m: Record<string, string> = { protagonist: "主角", antagonist: "对手", mentor: "导师", love_interest: "恋人", catalyst: "催化剂", supporting: "配角", background: "背景" };
    return m[r] || r;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-zinc-900 border border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-lg font-semibold">📋 {title || "生成前确认——角色调度"}</h2>
            {storyInfo && <p className="text-xs text-zinc-500 mt-0.5">{storyInfo.storyPhase} · {storyInfo.sceneContext || "未确定场景"} · 「{storyInfo.chapterTitle}」</p>}
          </div>
          <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 text-lg" aria-label="关闭">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-sm text-zinc-400">分析中...</span>
            </div>
          )}
          {error && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/50">
              <p className="text-sm text-red-400">❌ {error}</p>
              <button onClick={() => loadCards()} className="mt-2 text-xs text-red-400 hover:text-red-300 underline">🔄 重试</button>
            </div>
          )}
          {!loading && !error && (
            <>
              <div className="flex items-center gap-4 text-xs text-zinc-500">
                <span>📊 读取 <b className="text-zinc-300">{cards.length}</b>/{storyInfo?.totalCharacters || "?"} 张角色卡</span>
                <span>✅ 已选 <b className="text-zinc-300">{selected.size}</b> 张</span>
                <span className="text-zinc-600">|</span>
                <span>大纲：{storyInfo?.chapterOutline?.slice(0, 30) || "无"}...</span>
              </div>
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {cards.map(c => {
                  const checked = selected.has(c.id);
                  return (
                    <label key={c.id} className={`flex items-start gap-2 p-2.5 rounded-lg cursor-pointer border transition-colors text-xs ${checked ? "border-indigo-700 bg-indigo-950/20" : "border-white/[0.06] bg-white/[0.02] backdrop-blur-sm opacity-60"}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCard(c.id)} className="mt-0.5 rounded shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-zinc-200">{c.name}</span>
                          <span className="text-[10px] px-1 py-0.5 rounded bg-white/[0.04] text-zinc-400">{roleLabel(c.role)}</span>
                          <span className="text-[10px] text-zinc-500">{c.affiliation}</span>
                          {c.isNew && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-900/40 text-amber-400">🆕</span>}
                          <span className="text-[10px] text-zinc-600 ml-auto">分{c.score}</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-0.5">理由：{c.reasons.join("、")}{c.motivation !== "剧情推进" ? ` · 动机：${c.motivation}` : ""}</p>
                        {c.background && <p className="text-[10px] text-zinc-600 mt-0.5 line-clamp-4 whitespace-pre-line">背景：{c.background}</p>}
                        <input value={cardNotes[c.id] || ""} onChange={e => setCardNotes(prev => ({ ...prev, [c.id]: e.target.value }))}
                          placeholder="备注（出场理由/特殊要求）..."
                          className="w-full mt-1 bg-white/[0.04] border border-white/[0.08] rounded px-2 py-0.5 text-[10px] placeholder:text-zinc-600 focus:outline-none focus:border-indigo-700"
                          onClick={e => e.stopPropagation()} />
                      </div>
                    </label>
                  );
                })}
              </div>
              {(storyInfo?.missingRoleSuggestions?.length || 0) > 0 && (
                <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-900/30">
                  <p className="text-xs text-amber-400 font-medium mb-1">⚠️ 大纲提到但无匹配角色卡：</p>
                  <div className="flex gap-2 flex-wrap">
                    {storyInfo?.missingRoleSuggestions.map(r => (
                      <button key={r} onClick={() => { if (!newChars.includes(r)) setNewChars([...newChars, r]); }}
                        className="text-[10px] px-2 py-0.5 rounded bg-amber-900/30 text-amber-300 hover:bg-amber-900/50">+ 自建{r}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <input value={newCharInput} onChange={e => setNewCharInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addNewChar(); }}
                  placeholder="输入角色名让AI自建..."
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-indigo-700" />
                <button onClick={addNewChar} className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] text-zinc-400 hover:bg-zinc-700">+添加</button>
              </div>
              {newChars.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {newChars.map(n => (
                    <span key={n} className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/30 text-emerald-400 flex items-center gap-1">
                      🆕 AI自建：{n}
                      <button onClick={() => setNewChars(newChars.filter(x => x !== n))} className="text-zinc-500 hover:text-red-400" aria-label="关闭">✕</button>
                    </span>
                  ))}
                </div>
              )}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">📝 作者指令（本章权重——与大纲等同）</label>
                <textarea value={localAuthorNote} onChange={e => { setLocalAuthorNote(e.target.value); onAuthorNoteChange(e.target.value); }}
                  placeholder="角色出场要求、特殊情节约束、本章基调调整..."
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-indigo-700" rows={3} />
              </div>
            </>
          )}
        </div>
        {!loading && !error && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] shrink-0">
            <span className="text-xs text-zinc-600">确认后将带着 {selected.size} 张卡{newChars.length > 0 ? ` + ${newChars.length}个新角色` : ""} 开始生成</span>
            <div className="flex gap-2">
              <button onClick={onCancel} className="px-4 py-1.5 text-xs rounded-lg border border-white/[0.08] text-zinc-400 hover:text-zinc-200">取消</button>
              <button onClick={handleConfirm} className="px-4 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium">✅ 确认生成</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
