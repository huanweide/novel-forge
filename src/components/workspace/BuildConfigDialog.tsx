"use client";

import { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";
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
    <Modal open onClose={onClose} bare panelClassName="max-w-2xl max-h-[90vh] overflow-y-auto" closeOnOverlay={false} labelledBy="build-config-title">
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 id="build-config-title" className="text-lg font-semibold flex items-center gap-2">
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
            <div className="flex items-center justify-between gap-3 py-1">
              <span>
                <span className="text-sm text-[var(--nv-text-primary)]">强制原创人名</span>
                <span className="block text-xs text-[var(--nv-text-muted)]">生成时避免借用现实名人姓名</span>
              </span>
              <Switch checked={cfg.forceOriginalNames} onCheckedChange={(next) => set("forceOriginalNames", next)} size="sm" />
            </div>
            <div className="flex items-center justify-between gap-3 py-1">
              <span>
                <span className="text-sm text-[var(--nv-text-primary)]">自动生成故事线</span>
                <span className="block text-xs text-[var(--nv-text-muted)]">写作时按剧情推进自动维护主线/支线，每章进展自动回填七要素；开启后无需手动维护故事线</span>
              </span>
              <Switch checked={cfg.autoGenerateStoryline} onCheckedChange={(next) => set("autoGenerateStoryline", next)} size="sm" />
            </div>
            <div className="flex items-center justify-between gap-3 py-1">
              <span>
                <span className="text-sm text-[var(--nv-text-primary)]">缝合怪推进 · 主线完结自动开新线</span>
                <span className="block text-xs text-[var(--nv-text-muted)]">主线打完勾后自动构造一条承接的新主线，让剧情持续演进、规模不够时自动扩张；关闭则推进更随意</span>
              </span>
              <Switch checked={cfg.autoConstructNewMain} onCheckedChange={(next) => set("autoConstructNewMain", next)} size="sm" />
            </div>
            <div className="py-1">
              <span className="block text-sm text-[var(--nv-text-primary)]">缝合怪节奏</span>
              <span className="block text-xs text-[var(--nv-text-muted)] mb-2">构造新主线/剧情推进时的事件密度——快节奏事件密集，慢热铺垫未收尾线索多（作用于故事线自动生成）</span>
              <div className="flex gap-2">
                {([
                  ["fast", "快节奏", "高频事件、每章都有新变数与冲突升级"],
                  ["steady", "均衡", "稳步推进，隔章设置变数与阶段性小高潮"],
                  ["slow", "慢热", "铺垫充分、未收尾线索密集，冲突逐步累积后爆发"],
                ] as const).map(([key, label, desc]) => (
                  <button
                    key={key}
                    onClick={() => set("stitchPace", key as any)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-left transition-colors ${cfg.stitchPace === key ? "border-[var(--nv-primary)]/60 bg-[var(--nv-primary-soft)]" : "border-[var(--nv-border-2)] hover:border-[var(--nv-border-3)]"}`}
                  >
                    <span className={`block text-xs font-medium ${cfg.stitchPace === key ? "text-[var(--nv-primary)]" : "text-[var(--nv-text-secondary)]"}`}>{label}</span>
                    <span className="block text-[10px] text-[var(--nv-text-tertiary)] leading-snug mt-0.5">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="py-1">
              <span className="block text-sm text-[var(--nv-text-primary)]">故事线风格</span>
              <span className="block text-xs text-[var(--nv-text-muted)] mb-2">创意=大胆脑洞；平常=均衡常规；简约=克制少铺陈、主线先拟定起因/经过/结果三要素骨架</span>
              <div className="flex gap-2">
                {([
                  ["creative", "创意", "大胆脑洞、元素可夸张"],
                  ["normal", "平常", "均衡常规网文节奏、爽点清晰"],
                  ["simple", "简约", "克制少铺陈、主线先拟定三要素"],
                ] as const).map(([key, label, desc]) => (
                  <button
                    key={key}
                    onClick={() => set("storylineStyle", key as any)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-left transition-colors ${cfg.storylineStyle === key ? "border-[var(--nv-primary)]/60 bg-[var(--nv-primary-soft)]" : "border-[var(--nv-border-2)] hover:border-[var(--nv-border-3)]"}`}
                  >
                    <span className={`block text-xs font-medium ${cfg.storylineStyle === key ? "text-[var(--nv-primary)]" : "text-[var(--nv-text-secondary)]"}`}>{label}</span>
                    <span className="block text-[10px] text-[var(--nv-text-tertiary)] leading-snug mt-0.5">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="py-1">
              <span className="block text-sm text-[var(--nv-text-primary)]">自动化程度</span>
              <span className="block text-xs text-[var(--nv-text-muted)] mb-2">自动=生成即落库；自由=仅给建议、人工确认后应用；全权=AI 全权接管自动落库</span>
              <div className="flex gap-2">
                {([
                  ["auto", "自动", "生成即落库应用"],
                  ["free", "自由", "仅建议、人工编辑后再应用"],
                  ["full", "全权", "AI 全权接管、自动落库"],
                ] as const).map(([key, label, desc]) => (
                  <button
                    key={key}
                    onClick={() => set("storylineAutomation", key as any)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-left transition-colors ${cfg.storylineAutomation === key ? "border-[var(--nv-primary)]/60 bg-[var(--nv-primary-soft)]" : "border-[var(--nv-border-2)] hover:border-[var(--nv-border-3)]"}`}
                  >
                    <span className={`block text-xs font-medium ${cfg.storylineAutomation === key ? "text-[var(--nv-primary)]" : "text-[var(--nv-text-secondary)]"}`}>{label}</span>
                    <span className="block text-[10px] text-[var(--nv-text-tertiary)] leading-snug mt-0.5">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </Section>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 btn-ghost rounded-xl py-2.5 text-sm">取消</button>
          <button onClick={save} disabled={busy} className="flex-1 btn-primary rounded-xl py-2.5 text-sm font-medium disabled:opacity-50">
            {busy ? "保存中…" : "保存并同步"}
          </button>
        </div>
      </div>
    </Modal>
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
