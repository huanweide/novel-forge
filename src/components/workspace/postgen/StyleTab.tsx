"use client";

import { useState, useEffect } from "react";
import { Icon } from "@/components/ui/icons";
import { toastSuccess, toastError } from "@/components/ui/toast";

interface StyleCardData {
  povType?: string | null;
  narrativeDistance?: string | null;
  styleDescription?: string | null;
  sampleText?: string | null;
  dialogueRatio?: number | null;
  descriptionRatio?: number | null;
  actionRatio?: number | null;
  innerThoughtRatio?: number | null;
  avgSentenceLength?: number | null;
}

interface StyleTabProps {
  projectId: string;
}

const POV_OPTIONS: { key: string; label: string }[] = [
  { key: "", label: "不指定（跟随文风模板）" },
  { key: "first_person", label: "第一人称（我）" },
  { key: "third_person_limited", label: "第三人称限知" },
  { key: "third_person_omniscient", label: "第三人称全知" },
  { key: "second_person", label: "第二人称（你）" },
];

const DISTANCE_OPTIONS: { key: string; label: string }[] = [
  { key: "", label: "不指定（默认·适中）" },
  { key: "distant", label: "疏离（全景客观，作者抽离）" },
  { key: "medium", label: "适中（标准第三人称距离）" },
  { key: "close", label: "贴近（贴身亲密，代入感强）" },
];

const RATIO_FIELDS: { key: keyof StyleCardData; label: string }[] = [
  { key: "dialogueRatio", label: "对话" },
  { key: "descriptionRatio", label: "描写" },
  { key: "actionRatio", label: "动作" },
  { key: "innerThoughtRatio", label: "内心" },
];

/**
 * 文风 Tab —— 暴露并编辑项目的 StyleCard（真正被注入生成上下文的文风真相源）。
 * 保存后立即 syncGlobalPrompt，下次生成即时采用。
 */
export function StyleTab({ projectId }: StyleTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [card, setCard] = useState<StyleCardData>({
    povType: "",
    narrativeDistance: "",
    styleDescription: "",
    sampleText: "",
    dialogueRatio: null,
    descriptionRatio: null,
    actionRatio: null,
    innerThoughtRatio: null,
    avgSentenceLength: null,
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/projects/${projectId}/stylecard`);
        const d = await r.json();
        if (r.ok && d.card) setCard(d.card as StyleCardData);
      } catch {
        /* 忽略：保持默认空值 */
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  const update = (patch: Partial<StyleCardData>) => {
    setCard((c) => ({ ...c, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        povType: card.povType || "",
        narrativeDistance: card.narrativeDistance || "",
        styleDescription: card.styleDescription || "",
        sampleText: card.sampleText || "",
      };
      for (const f of RATIO_FIELDS) {
        const v = card[f.key];
        payload[f.key as string] = typeof v === "number" ? v : null;
      }
      const res = await fetch(`/api/projects/${projectId}/stylecard`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.card) setCard(data.card as StyleCardData);
        setDirty(false);
        toastSuccess("文风已保存，下次生成即时生效");
      } else {
        toastError(data.error || "保存失败");
      }
    } catch {
      toastError("网络错误，请重试");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-xs text-[var(--nv-text-tertiary)]">加载文风卡…</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs text-[var(--nv-text-tertiary)] leading-relaxed">
        这里的设定会被直接注入 AI 生成上下文（文风卡是生成时真正生效的真相源）。保存后下次写/续写即采用。
      </p>

      {/* 叙事视角 */}
      <div>
        <label className="text-[11px] text-[var(--nv-text-secondary)] block mb-1">叙事视角</label>
        <select
          className="input-glass w-full rounded-lg px-3 py-2 text-sm"
          value={card.povType || ""}
          onChange={(e) => update({ povType: e.target.value })}
        >
          {POV_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* 叙事距离 */}
      <div>
        <label className="text-[11px] text-[var(--nv-text-secondary)] block mb-1">叙事距离</label>
        <select
          className="input-glass w-full rounded-lg px-3 py-2 text-sm"
          value={card.narrativeDistance || ""}
          onChange={(e) => update({ narrativeDistance: e.target.value })}
        >
          {DISTANCE_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* 文风描述 */}
      <div>
        <label className="text-[11px] text-[var(--nv-text-secondary)] block mb-1">文风描述</label>
        <textarea
          className="input-glass w-full rounded-lg px-3 py-2 text-sm leading-relaxed resize-y"
          rows={3}
          placeholder="例如：冷峻克制的白描，少用形容词，对话推动情节……"
          value={card.styleDescription || ""}
          onChange={(e) => update({ styleDescription: e.target.value })}
        />
      </div>

      {/* 比例 */}
      <div className="rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3 space-y-2.5">
        <div className="text-[10px] text-[var(--nv-text-tertiary)]">叙事比例（四项大致归一，留空=不强制）</div>
        {RATIO_FIELDS.map((f) => {
          const v = typeof card[f.key] === "number" ? (card[f.key] as number) : 0.3;
          return (
            <div key={f.key as string} className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--nv-text-secondary)] w-10 shrink-0">{f.label}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(v * 100)}
                onChange={(e) => update({ [f.key]: Number(e.target.value) / 100 } as Partial<StyleCardData>)}
                className="flex-1 accent-[var(--nv-creative)]"
              />
              <span className="text-[10px] text-[var(--nv-text-tertiary)] w-9 text-right">
                {typeof card[f.key] === "number" ? `${Math.round((card[f.key] as number) * 100)}%` : "—"}
              </span>
            </div>
          );
        })}
      </div>

      {/* 样本 */}
      <div>
        <label className="text-[11px] text-[var(--nv-text-secondary)] block mb-1">风格样本（可选，注入参考）</label>
        <textarea
          className="input-glass w-full rounded-lg px-3 py-2 text-sm leading-relaxed resize-y"
          rows={3}
          placeholder="贴一段你心目中的理想文风范例……"
          value={card.sampleText || ""}
          onChange={(e) => update({ sampleText: e.target.value })}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="text-xs px-3 py-1.5 rounded-lg bg-[var(--nv-creative)] text-white flex items-center gap-1 disabled:opacity-50"
        >
          {saving ? <><Icon name="loader" size={13} className="animate-spin" /> 保存中…</> : <><Icon name="save" size={13} /> 保存文风</>}
        </button>
        {dirty && <span className="text-[10px] text-[var(--nv-warning)]">有未保存改动</span>}
      </div>
    </div>
  );
}
