"use client";

import { useState } from "react";
import { STYLE_TEMPLATES, type StyleTemplate } from "@/core/templates";
import { toastError } from "@/components/ui/toast";

/**
 * 文风模板选择器
 *
 * 下拉菜单 + 详情预览。选一个模板后自动应用到后续生成。
 */
export function StyleSelector({
  projectId,
  currentStyleId,
  onSelect,
}: {
  projectId: string;
  currentStyleId?: string;
  onSelect: (template: StyleTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<StyleTemplate | null>(null);

  const current = STYLE_TEMPLATES.find((t) => t.id === currentStyleId);
  const displayName = current ? `${current.icon} ${current.name}` : "✏️ 选择文风";

  const handleSelect = async (template: StyleTemplate) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/style`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleTemplateId: template.id }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({ error: "未知错误" })); toastError("应用文风失败：" + (d.error || `HTTP ${res.status}`)); return; }
      onSelect(template);
      setOpen(false);
    } catch (err) { toastError("应用文风失败（网络错误）：" + (err instanceof Error ? err.message : "请重试")); }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs border border-zinc-600 rounded px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700/80 hover:border-zinc-400 transition-colors flex items-center gap-1 text-zinc-200"
        title="选择文风模板"
      >
        {displayName}
        <span className="text-zinc-600">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-96 bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-white/[0.06] text-xs text-zinc-500 flex justify-between">
              <span>选择文风模板</span>
              <span>{STYLE_TEMPLATES.length} 个模板</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {STYLE_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelect(t)}
                  onMouseEnter={() => setPreviewTemplate(t)}
                  className={`w-full text-left px-3 py-2 hover:bg-white/[0.04] transition-colors flex items-start gap-3 ${
                    currentStyleId === t.id ? "bg-indigo-900/30 border-l-2 border-indigo-500" : ""
                  }`}
                >
                  <span className="text-lg shrink-0 mt-0.5">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-zinc-500 truncate">
                      {t.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {/* 预览 */}
            {previewTemplate && previewTemplate.id !== "custom" && (
              <div className="border-t border-white/[0.06] p-3 text-xs space-y-1.5 bg-zinc-950">
                <div className="text-zinc-400">
                  🌡 温度: <span className="text-zinc-300">{previewTemplate.temperature}</span>
                  {" · "}
                  🎯 每节字数: <span className="text-zinc-300">{previewTemplate.targetWordsPerSection}字</span>
                  {" · "}
                  📝 描写密度: <span className="text-zinc-300">{previewTemplate.descriptionDensity}/10</span>
                </div>
                <div className="text-zinc-500">
                  🚫 禁用: {previewTemplate.forbiddenPatterns.slice(0, 3).join(" / ")}
                  {previewTemplate.forbiddenPatterns.length > 3 ? " ..." : ""}
                </div>
                <div className="text-zinc-600 italic">{previewTemplate.pacingGuide}</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
