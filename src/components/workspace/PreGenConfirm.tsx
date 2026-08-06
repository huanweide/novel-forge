"use client";

import { useState, useEffect } from "react";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";

export interface ScheduledCard {
  id: string; name: string; role: string; score: number;
  reasons: string[]; affiliation: string; motivation: string;
  appeared: boolean; background: string; isNew: boolean;
}

// v1.5.0 极简化「生成确认」：去掉复杂角色调度列表/备注/自建 UI，
// 只留「人物（可选）」+ 作者指令 + 确认。onConfirm 签名不变以兼容父组件。
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
  const [charInput, setCharInput] = useState("");
  const [error, setError] = useState("");
  const [localAuthorNote, setLocalAuthorNote] = useState(authorNote);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const url = nodeId
          ? `/api/generate/pre-write-cards?projectId=${projectId}&nodeId=${nodeId}`
          : `/api/generate/pre-write-cards?projectId=${projectId}`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setCards(data.scheduledCards || []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, []);

  const handleConfirm = () => {
    const inputChars = charInput.split(/[,，、\n]/).map((s) => s.trim()).filter(Boolean);
    // 人物输入匹配已有卡 → 优先作为出场角色；输入中不存在的名字 → 作为 AI 自建角色
    const matchedIds = cards
      .filter((c) => inputChars.some((n) => c.name.includes(n) || n.includes(c.name)))
      .map((c) => c.id);
    const knownNames = new Set(cards.map((c) => c.name));
    const newChars = inputChars.filter((n) => !knownNames.has(n));
    // 留空则自动调度：默认带全部候选卡
    const confirmedIds = matchedIds.length > 0 ? matchedIds : cards.map((c) => c.id);
    onConfirm(confirmedIds, {}, newChars, localAuthorNote);
  };

  return (
    <Modal open onClose={onCancel} bare panelClassName="w-full max-w-lg" labelledBy="pregen-confirm-title">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 id="pregen-confirm-title" className="flex items-center gap-2 text-lg font-semibold text-[var(--nv-text-primary)]">
            <Icon name="clipboard" size={18} className="text-[var(--nv-primary)]" /> {title || "生成确认"}
          </h2>
          <button onClick={onCancel} className="text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]">
            <Icon name="x" size={18} />
          </button>
        </div>
        {loading && <div className="py-8 text-center text-xs text-[var(--nv-text-tertiary)]">读取角色中...</div>}
        {error && <div className="p-3 rounded-lg bg-[var(--nv-danger-soft)] text-xs text-[var(--nv-danger)]">{error}</div>}
        {!loading && !error && (
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-1 text-xs text-[var(--nv-text-secondary)] mb-1 block">
                <Icon name="user" size={12} /> 人物（可选，期望本章出场，逗号分隔）
              </label>
              <input
                value={charInput}
                onChange={(e) => setCharInput(e.target.value)}
                placeholder="例如：樊斯瑞、欧阳佩（留空则自动调度）"
                className="input-glass w-full rounded-lg px-3 py-2 text-xs"
              />
              <p className="text-[10px] text-[var(--nv-text-tertiary)] mt-1">
                输入的名字优先作为出场角色；没输入则交给 AI 自动调度已有角色卡。
              </p>
            </div>
            <div>
              <label className="flex items-center gap-1 text-xs text-[var(--nv-text-secondary)] mb-1 block">
                <Icon name="file" size={12} /> 作者指令（本章权重，与大纲等同）
              </label>
              <textarea
                value={localAuthorNote}
                onChange={(e) => { setLocalAuthorNote(e.target.value); onAuthorNoteChange(e.target.value); }}
                placeholder="本章基调、特殊情节约束、写作要求..."
                className="input-glass w-full rounded-lg px-3 py-2 text-xs resize-none"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onCancel} className="px-4 py-1.5 text-xs rounded-lg border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)]">取消</button>
              <button onClick={handleConfirm} className="btn-primary px-4 py-1.5 text-xs rounded-lg font-medium"><Icon name="check" size={13} /> 确认生成</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
