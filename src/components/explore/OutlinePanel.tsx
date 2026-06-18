"use client";

import type { BuildConfig } from "@/core/explore/types";
import { Icon } from "@/components/ui/icons";

interface OutlineProgress {
  phase: string;
  current?: number;
  total?: number;
  text?: string;
}

interface OutlineResult {
  characters: Array<{
    name: string;
    role: string;
    background?: string;
    age?: string;
    gender?: string;
    abilities?: string[];
    personality?: Record<string, any>;
    appearance?: Record<string, any>;
    aliases?: string[];
  }>;
  loreEntries: Array<{
    title: string;
    category: string;
    content?: string;
    keys?: string[];
  }>;
  plotOutline: string;
}

interface Props {
  outlineText: string;
  enrichPrompt: string;
  outlineResult: OutlineResult | null;
  outlineProgress: OutlineProgress | null;
  outlineLoading: boolean;
  creating: boolean;
  onTextChange: (v: string) => void;
  onEnrichPromptChange: (v: string) => void;
  onSubmit: () => void;
  onConfirm: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  starting: "正在连接AI...",
  chunking: "正在分析文本结构...",
  extracting: "正在提取设定",
  merging: "正在合并去重...",
  enriching: "正在丰满细节...",
};

export function OutlinePanel({
  outlineText,
  enrichPrompt,
  outlineResult,
  outlineProgress,
  outlineLoading,
  creating,
  onTextChange,
  onEnrichPromptChange,
  onSubmit,
  onConfirm,
}: Props) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
      {/* ── 大纲输入区 ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-amber-400/60" />
          <label className="text-xs font-semibold text-zinc-300 tracking-wide">
            粘贴大纲文本
          </label>
        </div>
        <textarea
          value={outlineText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="在此粘贴你的小说大纲、设定、角色介绍...可以很长，AI会自动整理格式并丰满细节"
          rows={12}
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40 focus:ring-2 focus:ring-amber-500/10 resize-y transition-all duration-200"
        />

        <details className="group">
          <summary className="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-400 transition-colors marker:text-zinc-600">
            自定义丰满提示词（可选）
          </summary>
          <textarea
            value={enrichPrompt}
            onChange={(e) => onEnrichPromptChange(e.target.value)}
            placeholder="告诉AI如何丰满你的设定...&#10;例如：角色背景要详细到童年经历、性格要有矛盾点、世界观要写出历史脉络"
            rows={4}
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40 focus:ring-2 focus:ring-amber-500/10 resize-y mt-2.5 transition-all duration-200"
          />
        </details>

        {/* ── 进度条 ── */}
        {outlineProgress && (
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl p-4 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <span className="text-amber-400 animate-spin text-sm">⏳</span>
              <span className="text-xs text-zinc-300 font-medium">
                {PHASE_LABELS[outlineProgress.phase] || outlineProgress.phase}
                {outlineProgress.current != null && outlineProgress.total != null && (
                  <span className="text-zinc-500 ml-1">
                    {outlineProgress.current}/{outlineProgress.total}
                  </span>
                )}
              </span>
            </div>
            {outlineProgress.total != null && outlineProgress.current != null && (
              <div className="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-amber-400 h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.round(
                      (outlineProgress.current / outlineProgress.total) * 100,
                    )}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        <button
          onClick={onSubmit}
          disabled={outlineLoading || !outlineText.trim()}
          className={`w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
            outlineLoading || !outlineText.trim()
              ? "bg-white/[0.03] text-zinc-600 border border-white/[0.05] cursor-not-allowed"
              : "bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 hover:from-amber-500 hover:to-amber-400"
          }`}
        >
          {outlineLoading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-1 h-1 bg-amber-200 rounded-full animate-pulse" />
              处理中...
            </span>
          ) : (
            <span className="flex items-center gap-1.5"><Icon name="clipboard" size={14} /> 发送整理</span>
          )}
        </button>
      </div>

      {/* ── 结果预览 ── */}
      {outlineResult && (
        <div className="space-y-4 border-t border-white/[0.06] pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-emerald-400/60" />
              <h3 className="text-sm font-semibold text-zinc-200">整理结果</h3>
            </div>
            <button
              onClick={onConfirm}
              disabled={creating}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-95 ${
                creating
                  ? "bg-white/[0.03] text-zinc-600 border border-white/[0.05] cursor-not-allowed"
                  : "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:from-emerald-500 hover:to-emerald-400"
              }`}
            >
              {creating ? "⏳ 写入中..." : "✅ 确认写入项目"}
            </button>
          </div>

          {/* 角色预览 */}
          {outlineResult.characters?.length > 0 && (
            <div>
              <div className="text-[10px] text-zinc-500 font-medium mb-2 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-purple-400/60" />
                角色 ({outlineResult.characters.length})
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {outlineResult.characters.map((c, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] transition-all duration-200"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-200">
                        {c.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.05] text-zinc-500">
                        {c.role}
                      </span>
                    </div>
                    {c.background && (
                      <p className="text-[10px] text-zinc-500 mt-1 line-clamp-2">
                        {c.background}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 世界书预览 */}
          {outlineResult.loreEntries?.length > 0 && (
            <div>
              <div className="text-[10px] text-zinc-500 font-medium mb-2 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-amber-400/60" />
                世界设定 ({outlineResult.loreEntries.length})
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {outlineResult.loreEntries.map((l, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] transition-all duration-200"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-200">
                        {l.title}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.05] text-zinc-500">
                        {l.category}
                      </span>
                    </div>
                    {l.content && (
                      <p className="text-[10px] text-zinc-500 mt-1 line-clamp-2">
                        {l.content}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 情节脉络 */}
          {outlineResult.plotOutline && (
            <div>
              <div className="text-[10px] text-zinc-500 font-medium mb-2 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-indigo-400/60" />
                情节脉络
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {outlineResult.plotOutline}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
