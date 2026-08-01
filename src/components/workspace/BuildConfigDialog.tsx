"use client";

import { useState, useEffect } from "react";
import { Icon } from "@/components/ui/icons";
import { toastSuccess, toastError } from "@/components/ui/toast";
import type { BuildConfig } from "@/core/explore/types";
import { DEFAULT_BUILD_CONFIG, GENRE_OPTIONS, AUDIENCE_OPTIONS, PLOT_STRUCTURES, STYLE_PREFERENCES, POWER_SYSTEMS, GOLDEN_FINGERS, STYLE_TAGS } from "@/core/explore/types";

interface Props {
  projectId: string;
  buildConfig: BuildConfig | null;
  onSaved: (cfg: BuildConfig) => void;
  onClose: () => void;
}

export function BuildConfigDialog({ projectId, buildConfig, onSaved, onClose }: Props) {
  const [cfg, setCfg] = useState<BuildConfig>({ ...DEFAULT_BUILD_CONFIG, ...(buildConfig || {}) });
  const [busy, setBusy] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  useEffect(() => {
    setCfg({ ...DEFAULT_BUILD_CONFIG, ...(buildConfig || {}) });
  }, [buildConfig]);

  const set = <K extends keyof BuildConfig>(k: K, v: BuildConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const toggleTag = (t: string) =>
    setCfg((c) => ({
      ...c,
      styleTags: c.styleTags.includes(t)
        ? c.styleTags.filter((x) => x !== t)
        : [...c.styleTags, t],
    }));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/build-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const d = await res.json();
      if (res.ok) {
        toastSuccess("项目布置已保存，全局提示词已同步");
        onSaved(cfg);
        onClose();
      } else toastError(d.error || "保存失败");
    } catch (e) {
      toastError("保存失败：" + (e instanceof Error ? e.message : "网络错误"));
    } finally {
      setBusy(false);
    }
  };

  const filteredTags = STYLE_TAGS.filter((t) => t.includes(tagSearch.trim()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="surface-floating rounded-2xl w-full max-w-2xl p-6 animate-spring max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="settings" size={18} className="text-[var(--nv-primary)]" /> 项目设定
          </h2>
            <button onClick={onClose} className="btn-ghost rounded-lg p-1.5">
            <Icon name="x" size={16} />
          </button>
        </div>

        <p className="text-xs text-[var(--nv-text-muted)] mb-5">
          这些是创建项目时在探讨模式选择的布置。可随时修改，保存后自动同步到全局提示词（globalPrompt）。
        </p>

        <div className="space-y-5">
          {/* 基础信息 */}
          <Section title="基础信息">
            <Field label="书名">
              <input value={cfg.novelName} onChange={(e) => set("novelName", e.target.value)} className="input-glass w-full rounded-xl px-3 py-2 text-sm" placeholder="小说书名" />
            </Field>
            <Field label="类型">
              <select value={cfg.genre} onChange={(e) => set("genre", e.target.value)} className="input-glass w-full rounded-xl px-3 py-2 text-sm">
                {GENRE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="受众">
              <select value={cfg.audience} onChange={(e) => set("audience", e.target.value)} className="input-glass w-full rounded-xl px-3 py-2 text-sm">
                {AUDIENCE_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="字数">
              <input value={cfg.wordCount} onChange={(e) => set("wordCount", e.target.value)} className="input-glass w-full rounded-xl px-3 py-2 text-sm" placeholder="如：50-200万字" />
            </Field>
            <Field label="情节结构">
              <select value={cfg.plotStructure} onChange={(e) => set("plotStructure", e.target.value)} className="input-glass w-full rounded-xl px-3 py-2 text-sm">
                {PLOT_STRUCTURES.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.desc}</option>)}
              </select>
            </Field>
          </Section>

          {/* 风格与设定 */}
          <Section title="风格与设定">
            <Field label="风格偏好">
              <select value={cfg.stylePreference} onChange={(e) => set("stylePreference", e.target.value)} className="input-glass w-full rounded-xl px-3 py-2 text-sm">
                <option value="">（未指定）</option>
                {STYLE_PREFERENCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="力量体系">
              <input value={cfg.powerSystem} onChange={(e) => set("powerSystem", e.target.value)} className="input-glass w-full rounded-xl px-3 py-2 text-sm" placeholder="如：修仙体系" />
            </Field>
            <Field label="金手指">
              <input value={cfg.goldenFinger} onChange={(e) => set("goldenFinger", e.target.value)} className="input-glass w-full rounded-xl px-3 py-2 text-sm" placeholder="如：系统金手指" />
            </Field>
            <Field label="核心冲突">
              <textarea value={cfg.coreConflict} onChange={(e) => set("coreConflict", e.target.value)} rows={3} className="input-glass w-full rounded-xl px-3 py-2 text-sm" placeholder="小说的核心矛盾" />
            </Field>
          </Section>

          {/* 流派标签 */}
          <Section title={`流派标签（已选 ${cfg.styleTags.length}）`}>
            <input value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder="搜索流派标签…" className="input-glass w-full rounded-xl px-3 py-2 text-xs mb-2" />
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {filteredTags.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors ${
                    cfg.styleTags.includes(t)
                      ? "bg-[var(--nv-creative)]/20 text-[var(--nv-creative)]"
                      : "bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Section>

          {/* 开关 */}
          <Section title="生成选项">
            <Toggle label="强制原创人名" desc="生成时避免借用现实名人姓名" checked={cfg.forceOriginalNames} onChange={(v) => set("forceOriginalNames", v)} />
            <Toggle label="自动生成故事线" desc="写作时按剧情推进自动维护故事线" checked={cfg.autoGenerateStoryline} onChange={(v) => set("autoGenerateStoryline", v)} />
          </Section>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 btn-ghost rounded-xl py-2.5 text-sm">取消</button>
          <button onClick={save} disabled={busy} className="flex-1 btn-primary rounded-xl py-2.5 text-sm font-medium disabled:opacity-50">
            {busy ? "保存中…" : "保存并同步"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface-elevated rounded-xl p-4 space-y-3">
      <h3 className="text-xs font-semibold text-[var(--nv-text-secondary)] uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-[var(--nv-text-tertiary)]">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
      <span>
        <span className="text-sm text-[var(--nv-text-primary)]">{label}</span>
        <span className="block text-xs text-[var(--nv-text-muted)]">{desc}</span>
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? "bg-[var(--nv-primary)]" : "bg-[var(--nv-surface-3)]"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </label>
  );
}
