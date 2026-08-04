"use client";

import { useState, useEffect } from "react";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";

export interface ScheduledCard {
  id: string; name: string; role: string; score: number;
  reasons: string[]; affiliation: string; motivation: string;
  appeared: boolean; background: string; isNew: boolean;
}

export function PreGenConfirm({
  projectId, nodeId, authorNote, title, onAuthorNoteChange, onConfirm, onCancel, presetCharacterIds,
}: {
  projectId: string; nodeId?: string; authorNote: string; title?: string;
  presetCharacterIds?: string[];
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
      const scheduledIds = (data.scheduledCards || []).map((c: ScheduledCard) => c.id);
      const preset = (presetCharacterIds || []).filter((id) => scheduledIds.includes(id));
      setSelected(new Set([...scheduledIds, ...preset]));
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
    <Modal open onClose={onCancel} bare panelClassName="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" labelledBy="pregen-confirm-title">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--nv-border-2)] shrink-0">
          <div>
            <h2 id="pregen-confirm-title" className="flex items-center gap-2 text-lg font-semibold text-[var(--nv-text-primary)]">
              <Icon name="clipboard" size={18} className="text-[var(--nv-primary)]" /> {title || "生成前确认——角色调度"}
            </h2>
            {storyInfo && <p className="text-xs text-[var(--nv-text-tertiary)] mt-0.5">{storyInfo.storyPhase} · {storyInfo.sceneContext || "未确定场景"} · 「{storyInfo.chapterTitle}」</p>}
          </div>
          <button onClick={onCancel} className="text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)] text-lg transition-colors"><Icon name="x" size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-[var(--nv-primary)] border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-sm text-[var(--nv-text-secondary)]">分析中...</span>
            </div>
          )}
          {error && (
            <div className="p-4 rounded-xl bg-[var(--nv-danger-soft)] border border-[var(--nv-danger)]/50">
              <p className="flex items-center gap-1.5 text-sm text-[var(--nv-danger)]"><Icon name="x" size={15} /> {error}</p>
              <button onClick={() => loadCards()} className="mt-2 text-xs text-[var(--nv-danger)] hover:text-[var(--nv-danger)]/70 underline flex items-center gap-1"><Icon name="refresh" size={12} /> 重试</button>
            </div>
          )}
          {!loading && !error && (
            <>
              <div className="flex items-center gap-4 text-xs text-[var(--nv-text-tertiary)]">
                <span className="flex items-center gap-1"><Icon name="user" size={12} /> 读取 <b className="text-[var(--nv-text-primary)]">{cards.length}</b>/{storyInfo?.totalCharacters || "?"} 张角色卡</span>
                <span className="flex items-center gap-1 text-[var(--nv-success)]"><Icon name="check" size={12} /> 已选 <b className="text-[var(--nv-text-primary)]">{selected.size}</b> 张</span>
                <span className="text-[var(--nv-border-3)]">|</span>
                <span>大纲：{storyInfo?.chapterOutline?.slice(0, 30) || "无"}...</span>
              </div>
              <div className="space-y-1 max-h-[500px] overflow-y-auto custom-scrollbar">
                {cards.map(c => {
                  const checked = selected.has(c.id);
                  return (
                    <label key={c.id} className={`flex items-start gap-2 p-2.5 rounded-lg cursor-pointer border transition-colors text-xs ${checked ? "border-[var(--nv-primary)] bg-[var(--nv-primary-soft)]" : "border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] backdrop-blur-sm opacity-60"}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCard(c.id)} className="mt-0.5 rounded shrink-0 accent-[var(--nv-primary)]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-[var(--nv-text-primary)]">{c.name}</span>
                          <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--nv-surface-3)] text-[var(--nv-text-secondary)]">{roleLabel(c.role)}</span>
                          <span className="text-[10px] text-[var(--nv-text-tertiary)]">{c.affiliation}</span>
                          {c.isNew && <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--nv-success-soft)] text-[var(--nv-success)] flex items-center gap-0.5"><Icon name="plus" size={9} />新</span>}
                          <span className="text-[10px] text-[var(--nv-text-tertiary)] ml-auto">分{c.score}</span>
                        </div>
                        <p className="text-[10px] text-[var(--nv-text-tertiary)] mt-0.5">理由：{c.reasons.join("、")}{c.motivation !== "剧情推进" ? ` · 动机：${c.motivation}` : ""}</p>
                        {c.background && <p className="text-[10px] text-[var(--nv-text-tertiary)] mt-0.5 line-clamp-4 whitespace-pre-line">背景：{c.background}</p>}
                        <input value={cardNotes[c.id] || ""} onChange={e => setCardNotes(prev => ({ ...prev, [c.id]: e.target.value }))}
                          placeholder="备注（出场理由/特殊要求）..."
                          className="input-glass w-full mt-1 px-2 py-0.5 text-[10px] focus:border-[var(--nv-primary)]"
                          onClick={e => e.stopPropagation()} />
                      </div>
                    </label>
                  );
                })}
              </div>
              {(storyInfo?.missingRoleSuggestions?.length || 0) > 0 && (
                <div className="p-3 rounded-xl bg-[var(--nv-accent-soft)] border border-[var(--nv-accent)]/30">
                  <p className="flex items-center gap-1 text-xs text-[var(--nv-accent)] font-medium mb-1"><Icon name="alert" size={13} /> 大纲提到但无匹配角色卡：</p>
                  <div className="flex gap-2 flex-wrap">
                    {storyInfo?.missingRoleSuggestions.map(r => (
                      <button key={r} onClick={() => { if (!newChars.includes(r)) setNewChars([...newChars, r]); }}
                        className="text-[10px] px-2 py-0.5 rounded bg-[var(--nv-accent-soft)] text-[var(--nv-accent)] hover:bg-[var(--nv-accent)]/20">+ 自建{r}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <input value={newCharInput} onChange={e => setNewCharInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addNewChar(); }}
                  placeholder="输入角色名让AI自建..."
                  className="input-glass flex-1 rounded-lg px-3 py-1.5 text-xs focus:border-[var(--nv-primary)]" />
                <button onClick={addNewChar} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--nv-surface-3)] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)]">+添加</button>
              </div>
              {newChars.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {newChars.map(n => (
                    <span key={n} className="text-[10px] px-2 py-0.5 rounded bg-[var(--nv-success-soft)] text-[var(--nv-success)] flex items-center gap-1">
                      <Icon name="plus" size={10} /> AI自建：{n}
                      <button onClick={() => setNewChars(newChars.filter(x => x !== n))} className="text-[var(--nv-text-tertiary)] hover:text-[var(--nv-danger)]"><Icon name="x" size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div>
                <label className="flex items-center gap-1 text-xs text-[var(--nv-text-secondary)] mb-1 block"><Icon name="file" size={12} /> 作者指令（本章权重——与大纲等同）</label>
                <textarea value={localAuthorNote} onChange={e => { setLocalAuthorNote(e.target.value); onAuthorNoteChange(e.target.value); }}
                  placeholder="角色出场要求、特殊情节约束、本章基调调整..."
                  className="input-glass w-full rounded-lg px-3 py-2 text-xs resize-none focus:border-[var(--nv-primary)]" rows={3} />
              </div>
            </>
          )}
        </div>
        {!loading && !error && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--nv-border-2)] shrink-0">
            <span className="text-xs text-[var(--nv-text-tertiary)]">确认后将带着 {selected.size} 张卡{newChars.length > 0 ? ` + ${newChars.length}个新角色` : ""} 开始生成</span>
            <div className="flex gap-2">
              <button onClick={onCancel} className="px-4 py-1.5 text-xs rounded-lg border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)]">取消</button>
              <button onClick={handleConfirm} className="btn-primary px-4 py-1.5 text-xs rounded-lg text-[var(--nv-text-primary)] font-medium"><Icon name="check" size={13} /> 确认生成</button>
            </div>
          </div>
        )}
    </Modal>
  );
}
