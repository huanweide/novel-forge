"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";
import type { BuildConfig } from "@/core/explore/types";
import {
  GENRE_OPTIONS,
  STYLE_TAGS,
  AUDIENCE_OPTIONS,
  WORD_COUNT_PRESETS,
  PLOT_STRUCTURES,
  STYLE_PREFERENCES,
  POWER_SYSTEMS,
  GOLDEN_FINGERS,
} from "@/core/explore/types";

interface Props {
  config: BuildConfig;
  onChange: (config: BuildConfig) => void;
}

export function BuildConfigPanel({ config, onChange }: Props) {
  const [showMore, setShowMore] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  const update = (partial: Partial<BuildConfig>) => {
    onChange({ ...config, ...partial });
  };

  const toggleStyleTag = (tag: string) => {
    const next = config.styleTags.includes(tag)
      ? config.styleTags.filter((t) => t !== tag)
      : [...config.styleTags, tag];
    update({ styleTags: next });
  };

  const filteredTags = STYLE_TAGS.filter((t) => t.includes(tagSearch.trim()));

  return (
    <div className="p-4 space-y-5 text-sm h-full overflow-y-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1 h-3.5 rounded-full bg-[var(--nv-primary)]/60" />
          <h3 className="text-xs font-semibold text-[var(--nv-text-secondary)] tracking-wider uppercase">
            构建配置
          </h3>
        </div>
        <button
          onClick={() =>
            onChange({
              ...config,
              novelName: "",
              protagonistName: "",
              direction: "",
              genre: "玄幻",
              styleTags: [],
              audience: "男频·青年向",
              wordCount: "50-200万字",
              plotStructure: "five_act",
              stylePreference: "",
              powerSystem: "",
              goldenFinger: "",
              coreConflict: "",
            })
          }
          className="text-[10px] text-[var(--nv-text-muted)] hover:text-[var(--nv-text-tertiary)] transition-colors active:scale-95"
        >
          重置
        </button>
      </div>

      {/* 实时预览卡 */}
      <PreviewCard config={config} />

      {/* ① 基础信息 */}
      <StepGroup title="基础信息" hint="决定这本书的骨架">
        <Field label="小说名称">
          <Input
            value={config.novelName}
            onChange={(e) => update({ novelName: e.target.value })}
            placeholder="留空则AI自动取名"
          />
        </Field>
        <Field label="主角名称">
          <Input
            value={config.protagonistName}
            onChange={(e) => update({ protagonistName: e.target.value })}
            placeholder="留空则AI自动生成"
          />
        </Field>
        <Field label="创作方向（选填）">
          <textarea
            value={config.direction}
            onChange={(e) => update({ direction: e.target.value })}
            placeholder="简要描述你想写的故事方向或核心创意..."
            rows={2}
            className="w-full bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded-xl px-3 py-2 text-xs text-[var(--nv-text-secondary)] placeholder:text-[var(--nv-text-muted)] focus:outline-none focus:border-[var(--nv-primary)]/40 focus:ring-2 focus:ring-[var(--nv-primary)]/10 resize-none transition-all duration-200"
          />
        </Field>
      </StepGroup>

      {/* ② 类型与受众 */}
      <StepGroup title="类型与受众">
        <Field label="小说类型">
          <ChipGroup
            items={GENRE_OPTIONS as unknown as string[]}
            selected={[config.genre]}
            onSelect={(g) => update({ genre: g })}
            color="indigo"
          />
        </Field>
        <Field label="受众定位">
          <ChipGroup
            items={AUDIENCE_OPTIONS as unknown as string[]}
            selected={[config.audience]}
            onSelect={(a) => update({ audience: a })}
            color="emerald"
          />
        </Field>
        <Field label="篇幅字数">
          <div className="flex flex-wrap gap-1">
            {Object.entries(WORD_COUNT_PRESETS).map(([key, val]) => {
              const active = config.wordCount === val;
              return (
                <button
                  key={key}
                  onClick={() => update({ wordCount: val })}
                  className={`text-[10px] px-2.5 py-1 rounded-lg font-medium transition-all duration-200 active:scale-95 border ${
                    active
                      ? "bg-[var(--nv-warning)]/20 text-[var(--nv-warning)] border-[var(--nv-warning)]/30 shadow-[0_0_8px_rgba(245,158,11,0.1)]"
                      : "bg-[var(--nv-surface-2)] text-[var(--nv-text-muted)] border-[var(--nv-border-2)] hover:text-[var(--nv-text-tertiary)]"
                  }`}
                >
                  {key}
                </button>
              );
            })}
          </div>
          {config.wordCount && (
            <p className="text-[9px] text-[var(--nv-text-muted)] mt-1">{config.wordCount}</p>
          )}
        </Field>
      </StepGroup>

      {/* ③ 风格参数 */}
      <StepGroup title="风格参数" hint="流派=世界观元素，风格偏好=文风基调">
        <Field label="核心设定 / 流派（可多选）">
          <input
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            placeholder="搜索流派标签..."
            className="w-full bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded-xl px-3 py-1.5 text-[10px] text-[var(--nv-text-secondary)] placeholder:text-[var(--nv-text-muted)] focus:outline-none focus:border-[var(--nv-creative)]/40 focus:ring-2 focus:ring-[var(--nv-creative)]/10 transition-all duration-200 mb-2"
          />
          <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto">
            {filteredTags.map((tag) => {
              const active = config.styleTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleStyleTag(tag)}
                  className={`text-[9px] px-2 py-1 rounded-lg font-medium transition-all duration-200 active:scale-95 border ${
                    active
                      ? "bg-[var(--nv-creative)]/20 text-[var(--nv-creative)] border-[var(--nv-creative)]/30 shadow-[0_0_8px_rgba(168,85,247,0.12)]"
                      : "bg-[var(--nv-surface-2)] text-[var(--nv-text-muted)] border-[var(--nv-border-2)] hover:text-[var(--nv-text-tertiary)]"
                  }`}
                >
                  {active ? "✓ " : ""}
                  {tag}
                </button>
              );
            })}
            {filteredTags.length === 0 && (
              <span className="text-[9px] text-[var(--nv-text-muted)]">无匹配标签</span>
            )}
          </div>
          {config.styleTags.length > 0 && (
            <p className="text-[9px] text-[var(--nv-text-muted)] mt-1.5">
              已选 {config.styleTags.length} 个: {config.styleTags.join("、")}
            </p>
          )}
        </Field>
        <Field label="文风偏好（单选）">
          <div className="flex flex-wrap gap-1">
            {STYLE_PREFERENCES.map((s) => {
              const active = config.stylePreference === s;
              return (
                <button
                  key={s}
                  onClick={() => update({ stylePreference: active ? "" : s })}
                  className={`text-[10px] px-2.5 py-1 rounded-lg font-medium transition-all duration-200 active:scale-95 border ${
                    active
                      ? "bg-[var(--nv-primary)]/20 text-[var(--nv-primary)] border-[var(--nv-primary)]/30 shadow-[0_0_8px_rgba(99,102,241,0.12)]"
                      : "bg-[var(--nv-surface-2)] text-[var(--nv-text-muted)] border-[var(--nv-border-2)] hover:text-[var(--nv-text-tertiary)]"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </Field>
      </StepGroup>

      {/* 更多选项 */}
      <button
        onClick={() => setShowMore(!showMore)}
        className="w-full text-[10px] text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)] py-1.5 rounded-lg hover:bg-[var(--nv-surface-2)] transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5"
      >
        <span className={`transition-transform duration-200 ${showMore ? "rotate-180" : ""}`}>▼</span>
        {showMore ? "收起高级设定" : "更多设定"}
      </button>

      {showMore && (
        <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
          {/* ④ 高级设定 */}
          <StepGroup title="高级设定">
            <Field label="情节结构模式">
              <div className="space-y-1">
                {PLOT_STRUCTURES.map((ps) => {
                  const active = config.plotStructure === ps.id;
                  return (
                    <button
                      key={ps.id}
                      onClick={() => update({ plotStructure: ps.id })}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all duration-200 active:scale-[0.98] ${
                        active
                          ? "bg-[var(--nv-primary)]/[0.08] border-[var(--nv-primary)]/25 shadow-[0_0_12px_rgba(99,102,241,0.08)]"
                          : "bg-[var(--nv-surface-2)] border-[var(--nv-border-2)] hover:border-[var(--nv-border-2)]"
                      }`}
                    >
                      <div className="text-[11px] font-medium text-[var(--nv-text-secondary)]">{ps.name}</div>
                      <div className="text-[9px] text-[var(--nv-text-muted)] mt-0.5">{ps.desc}</div>
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="力量体系">
              <Select
                value={config.powerSystem}
                onChange={(e) => update({ powerSystem: e.target.value })}
                options={POWER_SYSTEMS as unknown as string[]}
                placeholder="不选择"
              />
            </Field>
            <Field label="金手指类型">
              <Select
                value={config.goldenFinger}
                onChange={(e) => update({ goldenFinger: e.target.value })}
                options={GOLDEN_FINGERS as unknown as string[]}
                placeholder="不选择"
              />
            </Field>
            <Field label="核心冲突">
              <textarea
                value={config.coreConflict}
                onChange={(e) => update({ coreConflict: e.target.value })}
                placeholder="描述小说的核心矛盾冲突..."
                rows={2}
                className="w-full bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded-xl px-3 py-2 text-xs text-[var(--nv-text-secondary)] placeholder:text-[var(--nv-text-muted)] focus:outline-none focus:border-[var(--nv-primary)]/40 focus:ring-2 focus:ring-[var(--nv-primary)]/10 resize-none transition-all duration-200"
              />
            </Field>
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="flex items-start gap-2">
                <Icon name="key" size={15} className="text-[var(--nv-primary)] mt-0.5 shrink-0" />
                <span>
                  <span className="text-sm text-[var(--nv-text-primary)]">强制原创人名</span>
                  <span className="block text-xs text-[var(--nv-text-muted)]">AI 将严禁使用已有小说中的知名名称</span>
                </span>
              </span>
              <Switch checked={config.forceOriginalNames} onCheckedChange={(next) => update({ forceOriginalNames: next })} size="sm" />
            </div>
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="flex items-start gap-2">
                <Icon name="sparkles" size={15} className="text-[var(--nv-creative)] mt-0.5 shrink-0" />
                <span>
                  <span className="text-sm text-[var(--nv-text-primary)]">自动生成故事线</span>
                  <span className="block text-xs text-[var(--nv-text-muted)]">关闭后需手动生成故事线事件</span>
                </span>
              </span>
              <Switch checked={config.autoGenerateStoryline} onCheckedChange={(next) => update({ autoGenerateStoryline: next })} size="sm" />
            </div>
          </StepGroup>
        </div>
      )}
    </div>
  );
}

// ─── 内部子组件 ────────────────────────────────────────

function StepGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center gap-2">
        <span className="w-1 h-3.5 rounded-full bg-[var(--nv-primary)]/70" />
        <h4 className="text-[10px] font-semibold text-[var(--nv-text-secondary)] tracking-wider uppercase">
          {title}
        </h4>
        {hint && <span className="text-[9px] text-[var(--nv-text-muted)]">· {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function PreviewCard({ config }: { config: BuildConfig }) {
  return (
    <div className="rounded-2xl border border-[var(--nv-border-2)] bg-gradient-to-br from-[var(--nv-surface-2)] to-[var(--nv-surface-1)] p-3 space-y-2 shadow-[0_0_20px_rgba(0,0,0,0.2)]">
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--nv-text-muted)]">
        <Icon name="eye" size={11} /> 实时预览
      </div>
      <div className="text-sm font-semibold text-[var(--nv-text-primary)] truncate">
        {config.novelName || "未命名小说"}
      </div>
      <div className="flex flex-wrap gap-1 text-[9px]">
        <span className="px-1.5 py-0.5 rounded-full bg-[var(--nv-primary)]/10 text-[var(--nv-primary)]">{config.genre}</span>
        <span className="px-1.5 py-0.5 rounded-full bg-[var(--nv-success)]/10 text-[var(--nv-success)]">{config.audience}</span>
        {config.wordCount && (
          <span className="px-1.5 py-0.5 rounded-full bg-[var(--nv-warning)]/10 text-[var(--nv-warning)]">{config.wordCount}</span>
        )}
      </div>
      {config.styleTags.length > 0 && (
        <div className="text-[9px] text-[var(--nv-text-tertiary)] leading-relaxed">
          流派：{config.styleTags.slice(0, 8).join("、")}
          {config.styleTags.length > 8 ? ` 等${config.styleTags.length}项` : ""}
        </div>
      )}
      {config.stylePreference && (
        <div className="text-[9px] text-[var(--nv-text-tertiary)]">文风：{config.stylePreference}</div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-medium text-[var(--nv-text-muted)] tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded-xl px-3 py-2 text-xs text-[var(--nv-text-secondary)] placeholder:text-[var(--nv-text-muted)] focus:outline-none focus:border-[var(--nv-primary)]/40 focus:ring-2 focus:ring-[var(--nv-primary)]/10 transition-all duration-200"
    />
  );
}

function ChipGroup({
  items,
  selected,
  onSelect,
  color,
}: {
  items: string[];
  selected: string[];
  onSelect: (item: string) => void;
  color: "indigo" | "emerald" | "amber" | "purple" | "pink";
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string; shadow: string }> = {
    indigo: { bg: "bg-[var(--nv-primary)]/20", text: "text-[var(--nv-primary)]", border: "border-[var(--nv-primary)]/30", shadow: "shadow-[0_0_8px_rgba(99,102,241,0.1)]" },
    emerald: { bg: "bg-[var(--nv-success)]/20", text: "text-[var(--nv-success)]", border: "border-[var(--nv-success)]/30", shadow: "shadow-[0_0_8px_rgba(16,185,129,0.1)]" },
    amber: { bg: "bg-[var(--nv-warning)]/20", text: "text-[var(--nv-warning)]", border: "border-[var(--nv-warning)]/30", shadow: "shadow-[0_0_8px_rgba(245,158,11,0.1)]" },
    purple: { bg: "bg-[var(--nv-creative)]/20", text: "text-[var(--nv-creative)]", border: "border-[var(--nv-creative)]/30", shadow: "shadow-[0_0_8px_rgba(228,184,99,0.12)]" },
    pink: { bg: "bg-[var(--nv-creative)]/20", text: "text-[var(--nv-creative)]", border: "border-[var(--nv-creative)]/30", shadow: "shadow-[0_0_8px_rgba(228,184,99,0.12)]" },
  };
  const c = colorMap[color];
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => {
        const active = selected.includes(item);
        return (
          <button
            key={item}
            onClick={() => onSelect(item)}
            className={`text-[10px] px-2.5 py-1 rounded-lg font-medium transition-all duration-200 active:scale-95 border ${
              active ? `${c.bg} ${c.text} ${c.border} ${c.shadow}` : "bg-[var(--nv-surface-2)] text-[var(--nv-text-muted)] border-[var(--nv-border-2)] hover:text-[var(--nv-text-tertiary)]"
            }`}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="w-full bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded-xl px-3 py-2 text-xs text-[var(--nv-text-secondary)] focus:outline-none focus:border-[var(--nv-primary)]/40 focus:ring-2 focus:ring-[var(--nv-primary)]/10 transition-all duration-200"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
