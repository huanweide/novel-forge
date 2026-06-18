"use client";

import { useState } from "react";
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

  const update = (partial: Partial<BuildConfig>) => {
    onChange({ ...config, ...partial });
  };

  const toggleStyleTag = (tag: string) => {
    const next = config.styleTags.includes(tag)
      ? config.styleTags.filter((t) => t !== tag)
      : [...config.styleTags, tag];
    update({ styleTags: next });
  };

  return (
    <div className="p-4 space-y-5 text-sm h-full overflow-y-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1 h-3.5 rounded-full bg-indigo-400/60" />
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wider uppercase">
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
          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors active:scale-95"
        >
          重置
        </button>
      </div>

      {/* 小说名称 */}
      <Field label="小说名称">
        <Input
          value={config.novelName}
          onChange={(e) => update({ novelName: e.target.value })}
          placeholder="留空则AI自动取名"
        />
      </Field>

      {/* 主角名称 */}
      <Field label="主角名称">
        <Input
          value={config.protagonistName}
          onChange={(e) => update({ protagonistName: e.target.value })}
          placeholder="留空则AI自动生成"
        />
      </Field>

      {/* 创作方向 */}
      <Field label="创作方向（选填）">
        <textarea
          value={config.direction}
          onChange={(e) => update({ direction: e.target.value })}
          placeholder="简要描述你想写的故事方向或核心创意..."
          rows={2}
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-400/40 focus:ring-2 focus:ring-indigo-500/10 resize-none transition-all duration-200"
        />
      </Field>

      {/* 小说类型 */}
      <Field label="小说类型">
        <ChipGroup
          items={GENRE_OPTIONS as unknown as string[]}
          selected={[config.genre]}
          onSelect={(g) => update({ genre: g })}
          color="indigo"
        />
      </Field>

      {/* 流派标签 */}
      <Field label="核心设定 / 流派">
        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
          {STYLE_TAGS.map((tag) => {
            const active = config.styleTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleStyleTag(tag)}
                className={`text-[9px] px-2 py-1 rounded-lg font-medium transition-all duration-200 active:scale-95 border ${
                  active
                    ? "bg-purple-500/20 text-purple-300 border-purple-400/30 shadow-[0_0_8px_rgba(168,85,247,0.1)]"
                    : "bg-white/[0.02] text-zinc-500 border-white/[0.05] hover:border-white/[0.1] hover:text-zinc-400"
                }`}
              >
                {active ? "✓ " : ""}
                {tag}
              </button>
            );
          })}
        </div>
        {config.styleTags.length > 0 && (
          <p className="text-[9px] text-zinc-600 mt-1.5">
            已选 {config.styleTags.length} 个: {config.styleTags.join("、")}
          </p>
        )}
      </Field>

      {/* 受众定位 */}
      <Field label="受众定位">
        <ChipGroup
          items={AUDIENCE_OPTIONS as unknown as string[]}
          selected={[config.audience]}
          onSelect={(a) => update({ audience: a })}
          color="emerald"
        />
      </Field>

      {/* 篇幅字数 */}
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
                    ? "bg-amber-500/20 text-amber-300 border-amber-400/30 shadow-[0_0_8px_rgba(245,158,11,0.1)]"
                    : "bg-white/[0.02] text-zinc-500 border-white/[0.05] hover:border-white/[0.1] hover:text-zinc-400"
                }`}
              >
                {key}
              </button>
            );
          })}
        </div>
        {config.wordCount && (
          <p className="text-[9px] text-zinc-600 mt-1">{config.wordCount}</p>
        )}
      </Field>

      {/* 更多选项 */}
      <button
        onClick={() => setShowMore(!showMore)}
        className="w-full text-[10px] text-zinc-500 hover:text-zinc-300 py-1.5 rounded-lg hover:bg-white/[0.03] transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5"
      >
        <span
          className={`transition-transform duration-200 ${showMore ? "rotate-180" : ""}`}
        >
          ▼
        </span>
        {showMore ? "收起高级设定" : "更多设定"}
      </button>

      {showMore && (
        <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
          {/* 情节结构 */}
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
                        ? "bg-indigo-500/[0.08] border-indigo-400/25 shadow-[0_0_12px_rgba(99,102,241,0.08)]"
                        : "bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.1]"
                    }`}
                  >
                    <div className="text-[11px] font-medium text-zinc-300">
                      {ps.name}
                    </div>
                    <div className="text-[9px] text-zinc-600 mt-0.5">
                      {ps.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* 风格偏好 */}
          <Field label="风格偏好">
            <div className="flex flex-wrap gap-1">
              {STYLE_PREFERENCES.map((s) => {
                const active = config.stylePreference === s;
                return (
                  <button
                    key={s}
                    onClick={() =>
                      update({ stylePreference: active ? "" : s })
                    }
                    className={`text-[10px] px-2.5 py-1 rounded-lg font-medium transition-all duration-200 active:scale-95 border ${
                      active
                        ? "bg-pink-500/20 text-pink-300 border-pink-400/30 shadow-[0_0_8px_rgba(236,72,153,0.1)]"
                        : "bg-white/[0.02] text-zinc-500 border-white/[0.05] hover:border-white/[0.1] hover:text-zinc-400"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* 力量体系 */}
          <Field label="力量体系">
            <Select
              value={config.powerSystem}
              onChange={(e) => update({ powerSystem: e.target.value })}
              options={POWER_SYSTEMS as unknown as string[]}
              placeholder="不选择"
            />
          </Field>

          {/* 金手指 */}
          <Field label="金手指类型">
            <Select
              value={config.goldenFinger}
              onChange={(e) => update({ goldenFinger: e.target.value })}
              options={GOLDEN_FINGERS as unknown as string[]}
              placeholder="不选择"
            />
          </Field>

          {/* 主要冲突 */}
          <Field label="核心冲突">
            <textarea
              value={config.coreConflict}
              onChange={(e) => update({ coreConflict: e.target.value })}
              placeholder="描述小说的核心矛盾冲突..."
              rows={2}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-400/40 focus:ring-2 focus:ring-indigo-500/10 resize-none transition-all duration-200"
            />
          </Field>

          {/* 复选框 */}
          <Checkbox
            checked={config.forceOriginalNames}
            onChange={(v) => update({ forceOriginalNames: v })}
            label="强制原创命名"
            hint="AI将严禁使用已有小说中的知名名称"
          />
          <Checkbox
            checked={config.autoGenerateStoryline}
            onChange={(v) => update({ autoGenerateStoryline: v })}
            label="自动生成故事线"
            hint="关闭后需手动生成故事线事件"
          />
        </div>
      )}
    </div>
  );
}

// ─── 内部子组件 ────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-medium text-zinc-500 tracking-wide">
        {label}
      </label>
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
      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-400/40 focus:ring-2 focus:ring-indigo-500/10 transition-all duration-200"
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
  const colorMap: Record<
    string,
    { bg: string; text: string; border: string; shadow: string }
  > = {
    indigo: {
      bg: "bg-indigo-500/20",
      text: "text-indigo-300",
      border: "border-indigo-400/30",
      shadow: "shadow-[0_0_8px_rgba(99,102,241,0.1)]",
    },
    emerald: {
      bg: "bg-emerald-500/20",
      text: "text-emerald-300",
      border: "border-emerald-400/30",
      shadow: "shadow-[0_0_8px_rgba(16,185,129,0.1)]",
    },
    amber: {
      bg: "bg-amber-500/20",
      text: "text-amber-300",
      border: "border-amber-400/30",
      shadow: "shadow-[0_0_8px_rgba(245,158,11,0.1)]",
    },
    purple: {
      bg: "bg-purple-500/20",
      text: "text-purple-300",
      border: "border-purple-400/30",
      shadow: "shadow-[0_0_8px_rgba(168,85,247,0.1)]",
    },
    pink: {
      bg: "bg-pink-500/20",
      text: "text-pink-300",
      border: "border-pink-400/30",
      shadow: "shadow-[0_0_8px_rgba(236,72,153,0.1)]",
    },
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
              active
                ? `${c.bg} ${c.text} ${c.border} ${c.shadow}`
                : "bg-white/[0.02] text-zinc-500 border-white/[0.05] hover:border-white/[0.1] hover:text-zinc-400"
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
      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-400/40 focus:ring-2 focus:ring-indigo-500/10 transition-all duration-200"
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

function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer group">
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`w-4 h-4 rounded-md border transition-all duration-200 flex items-center justify-center ${
            checked
              ? "bg-indigo-500 border-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.3)]"
              : "bg-white/[0.04] border-white/[0.12] group-hover:border-white/[0.2]"
          }`}
        >
          {checked && (
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>
      </div>
      <div>
        <div className="text-xs text-zinc-400 font-medium">{label}</div>
        <div className="text-[9px] text-zinc-600 mt-0.5">{hint}</div>
      </div>
    </label>
  );
}
