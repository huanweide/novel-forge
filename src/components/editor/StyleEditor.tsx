"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { STYLE_TEMPLATES, getTemplate } from "@/core/templates";

/**
 * 文风编辑器 —— 可编辑禁用词、风格笔记、参数
 */
interface StyleConfig {
  styleTemplateId: string;
  temperature: number;
  topP: number;
  targetWordsPerSection: number;
  customForbiddenPatterns: string[];
  customStyleNotes: string;
}

export function StyleEditor({
  projectId,
  currentStyleId,
  onSaved,
  onClose,
}: {
  projectId: string;
  currentStyleId?: string;
  onSaved: (styleId: string) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<StyleConfig>({
    styleTemplateId: currentStyleId || "custom",
    temperature: 0.85,
    topP: 0.95,
    targetWordsPerSection: 1000,
    customForbiddenPatterns: [],
    customStyleNotes: "",
  });
  const [newForbidden, setNewForbidden] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  // 加载当前设置
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchData = async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/style`, { signal: controller.signal });
        const data = await r.json();
        if (!data.error) {
          setConfig({
            styleTemplateId: data.styleTemplateId || "custom",
            temperature: data.temperature ?? 0.85,
            topP: data.topP ?? 0.95,
            targetWordsPerSection: data.targetWordsPerSection ?? 1000,
            customForbiddenPatterns: data.customForbiddenPatterns || [],
            customStyleNotes: data.customStyleNotes || "",
          });
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => { controller.abort(); };
  }, [projectId]);

  // 选模板时合并模板的默认值
  const handleSelectTemplate = (id: string) => {
    const template = getTemplate(id);
    setConfig((prev) => ({
      ...prev,
      styleTemplateId: id,
      temperature: template?.temperature ?? prev.temperature,
      topP: template?.topP ?? prev.topP,
      targetWordsPerSection: template?.targetWordsPerSection ?? prev.targetWordsPerSection,
      customForbiddenPatterns: template?.id !== "custom"
        ? [...new Set([...prev.customForbiddenPatterns, ...(template?.forbiddenPatterns || [])])]
        : prev.customForbiddenPatterns,
    }));
  };

  const addForbidden = () => {
    const pattern = newForbidden.trim();
    if (!pattern || config.customForbiddenPatterns.includes(pattern)) return;
    setConfig((prev) => ({
      ...prev,
      customForbiddenPatterns: [...prev.customForbiddenPatterns, pattern],
    }));
    setNewForbidden("");
  };

  const removeForbidden = (pattern: string) => {
    setConfig((prev) => ({
      ...prev,
      customForbiddenPatterns: prev.customForbiddenPatterns.filter((p) => p !== pattern),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/style`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      onSaved(config.styleTemplateId);
      onClose();
    } catch (err) {
      console.error("保存文风失败:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
        <div className="bg-zinc-900 rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
          <p className="text-zinc-400">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="text-lg font-semibold">🎨 编辑文风</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 模板选择 */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">基础模板</label>
            <div className="grid grid-cols-4 gap-1.5">
              {STYLE_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelectTemplate(t.id)}
                  className={`text-xs py-1.5 px-2 rounded-lg text-center transition-colors ${
                    config.styleTemplateId === t.id
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {t.icon} {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* 参数 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Temperature</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="2"
                value={config.temperature}
                onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) || 0.85 })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-center"
              />
              <div className="text-[10px] text-zinc-600 mt-0.5">越高越奔放</div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Top-P</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={config.topP}
                onChange={(e) => setConfig({ ...config, topP: parseFloat(e.target.value) || 0.95 })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-center"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">每节字数</label>
              <input
                type="number"
                step="100"
                min="200"
                max="5000"
                value={config.targetWordsPerSection}
                onChange={(e) => setConfig({ ...config, targetWordsPerSection: parseInt(e.target.value) || 1000 })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-center"
              />
            </div>
          </div>

          {/* 禁用词 */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">
              🚫 禁用词/句式（AI 会尽量避免使用）
            </label>
            <div className="flex gap-2 mb-2">
              <input
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-red-500"
                value={newForbidden}
                onChange={(e) => setNewForbidden(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addForbidden()}
                placeholder="输入要禁用的词或句式，回车添加"
              />
              <Button
                size="sm"
                onClick={addForbidden}
                className="bg-red-800 hover:bg-red-700 h-8 text-xs"
              >
                添加
              </Button>
            </div>
            {config.customForbiddenPatterns.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {config.customForbiddenPatterns.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/50 border border-red-900/50 text-xs text-red-400"
                  >
                    🚫 {p}
                    <button
                      onClick={() => removeForbidden(p)}
                      className="hover:text-red-300 text-red-500"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">暂无禁用词。添加后 AI 会主动避免这些表达。</p>
            )}
          </div>

          {/* 自定义风格笔记 */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">
              📝 自定义风格笔记（追加到 System Prompt）
            </label>
            <textarea
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-500"
              rows={4}
              value={config.customStyleNotes}
              onChange={(e) => setConfig({ ...config, customStyleNotes: e.target.value })}
              placeholder="比如：多用短句，对白占比60%以上，环境描写要阴暗潮湿..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 py-3 border-t border-zinc-800 shrink-0">
          <Button variant="outline" onClick={onClose} className="border-zinc-700">
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-500"
          >
            {saving ? "保存中..." : "保存文风"}
          </Button>
        </div>
      </div>
    </div>
  );
}
