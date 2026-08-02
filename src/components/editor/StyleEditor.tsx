"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { STYLE_TEMPLATES, getTemplate } from "@/core/templates";
import {
  scanForbiddenWordsEnhanced,
  groupMatchesByCategory,
  getBuiltinRuleCounts,
  FORBIDDEN_CATEGORIES,
  type ForbiddenMatch,
  type ForbiddenReport,
  type ForbiddenCategory,
  type EnhancedScanOptions,
} from "@/lib/forbidden-checker";
import { toastError } from "@/components/ui/toast";
import { Modal } from "@/components/ui/Modal";

// ═══════════════════════════════════════════
// 12 维度定义
// ═══════════════════════════════════════════

interface DimensionDef {
  key: string;
  label: string;
  icon: string;
  min: number;
  max: number;
  step: number;
  description: string;
}

const DIMENSIONS: DimensionDef[] = [
  { key: "vocabularyRichness", label: "词汇丰富度", icon: "📚", min: 1, max: 10, step: 0.5, description: "词汇多样性，越高用词越丰富华丽" },
  { key: "sentenceLength", label: "句子长度", icon: "📏", min: 1, max: 10, step: 0.5, description: "平均句长，越高句子越长越复杂" },
  { key: "descriptionDensity", label: "描写密度", icon: "🎨", min: 1, max: 10, step: 0.5, description: "环境/人物描写的详细程度" },
  { key: "dialogueRatio", label: "对话比例", icon: "💬", min: 1, max: 10, step: 0.5, description: "对话占全文的比例" },
  { key: "rhetoricLevel", label: "修辞手法", icon: "✨", min: 1, max: 10, step: 0.5, description: "比喻/排比/拟人等修辞频率" },
  { key: "pacingSpeed", label: "节奏速度", icon: "⚡", min: 1, max: 10, step: 0.5, description: "情节推进速度，越高越快" },
  { key: "psychoDesc", label: "心理描写", icon: "🧠", min: 1, max: 10, step: 0.5, description: "内心独白/心理活动占比" },
  { key: "envDesc", label: "环境描写", icon: "🏞️", min: 1, max: 10, step: 0.5, description: "场景/氛围描写的比重" },
  { key: "colloquialism", label: "口语化", icon: "🗣️", min: 1, max: 10, step: 0.5, description: "语言的口语/书面化程度" },
  { key: "humorLevel", label: "幽默感", icon: "😄", min: 1, max: 10, step: 0.5, description: "幽默元素的频率和强度" },
  { key: "violenceLevel", label: "暴力程度", icon: "⚔️", min: 1, max: 10, step: 0.5, description: "血腥暴力描写的程度" },
  { key: "eroticLevel", label: "暧昧程度", icon: "💋", min: 1, max: 10, step: 0.5, description: "情色/暧昧描写的程度" },
];

// 预设风格对应的 12 维度默认值
const PRESET_DIMENSIONS: Record<string, Record<string, number>> = {
  hot_blooded: { vocabularyRichness: 5, sentenceLength: 3, descriptionDensity: 4, dialogueRatio: 5, rhetoricLevel: 6, pacingSpeed: 9, psychoDesc: 3, envDesc: 3, colloquialism: 6, humorLevel: 3, violenceLevel: 7, eroticLevel: 1 },
  slice_of_life: { vocabularyRichness: 4, sentenceLength: 4, descriptionDensity: 6, dialogueRatio: 8, rhetoricLevel: 3, pacingSpeed: 3, psychoDesc: 7, envDesc: 5, colloquialism: 9, humorLevel: 7, violenceLevel: 1, eroticLevel: 3 },
  dark_tragedy: { vocabularyRichness: 7, sentenceLength: 6, descriptionDensity: 7, dialogueRatio: 4, rhetoricLevel: 7, pacingSpeed: 3, psychoDesc: 9, envDesc: 8, colloquialism: 3, humorLevel: 1, violenceLevel: 7, eroticLevel: 2 },
  mystery: { vocabularyRichness: 5, sentenceLength: 5, descriptionDensity: 8, dialogueRatio: 6, rhetoricLevel: 4, pacingSpeed: 7, psychoDesc: 6, envDesc: 7, colloquialism: 5, humorLevel: 2, violenceLevel: 5, eroticLevel: 1 },
  romance: { vocabularyRichness: 5, sentenceLength: 4, descriptionDensity: 5, dialogueRatio: 7, rhetoricLevel: 6, pacingSpeed: 5, psychoDesc: 8, envDesc: 4, colloquialism: 7, humorLevel: 6, violenceLevel: 1, eroticLevel: 5 },
  epic_fantasy: { vocabularyRichness: 8, sentenceLength: 7, descriptionDensity: 7, dialogueRatio: 4, rhetoricLevel: 8, pacingSpeed: 6, psychoDesc: 5, envDesc: 9, colloquialism: 3, humorLevel: 3, violenceLevel: 7, eroticLevel: 2 },
  sci_fi: { vocabularyRichness: 7, sentenceLength: 6, descriptionDensity: 6, dialogueRatio: 5, rhetoricLevel: 5, pacingSpeed: 6, psychoDesc: 5, envDesc: 6, colloquialism: 4, humorLevel: 3, violenceLevel: 4, eroticLevel: 2 },
  adult_romance: { vocabularyRichness: 6, sentenceLength: 3, descriptionDensity: 8, dialogueRatio: 5, rhetoricLevel: 5, pacingSpeed: 4, psychoDesc: 8, envDesc: 5, colloquialism: 5, humorLevel: 2, violenceLevel: 2, eroticLevel: 10 },
  ancient_xianxia: { vocabularyRichness: 9, sentenceLength: 5, descriptionDensity: 6, dialogueRatio: 4, rhetoricLevel: 9, pacingSpeed: 6, psychoDesc: 4, envDesc: 8, colloquialism: 2, humorLevel: 3, violenceLevel: 6, eroticLevel: 3 },
  minimalist: { vocabularyRichness: 2, sentenceLength: 2, descriptionDensity: 2, dialogueRatio: 6, rhetoricLevel: 1, pacingSpeed: 8, psychoDesc: 2, envDesc: 1, colloquialism: 8, humorLevel: 4, violenceLevel: 2, eroticLevel: 1 },
  custom: { vocabularyRichness: 5, sentenceLength: 5, descriptionDensity: 5, dialogueRatio: 5, rhetoricLevel: 5, pacingSpeed: 5, psychoDesc: 5, envDesc: 5, colloquialism: 5, humorLevel: 5, violenceLevel: 3, eroticLevel: 3 },
};

// 叙事视角选项
const POV_OPTIONS: { key: string; label: string; desc: string }[] = [
  { key: "", label: "不指定", desc: "跟随文风模板默认" },
  { key: "first_person", label: "第一人称", desc: "「我」的视角，代入感强" },
  { key: "third_person_limited", label: "第三人称限知", desc: "「他/她」，单角色视角" },
  { key: "third_person_omniscient", label: "第三人称全知", desc: "上帝视角，跨越多角色" },
  { key: "second_person", label: "第二人称", desc: "「你」，沉浸式互动" },
];

// ═══════════════════════════════════════════
// 组件 Props
// ═══════════════════════════════════════════

interface StyleEditorProps {
  projectId: string;
  currentStyleId?: string;
  onSaved: (styleId: string) => void;
  onClose: () => void;
  /** 可选——当前章节正文，用于废词扫描 */
  chapterContent?: string | null;
}

interface StyleConfig {
  styleTemplateId: string;
  temperature: number;
  topP: number;
  targetWordsPerSection: number;
  customForbiddenPatterns: string[];
  customStyleNotes: string;
  dimensions: Record<string, number>;
  povType: string;
}

// ═══════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════

export function StyleEditor({ projectId, currentStyleId, onSaved, onClose, chapterContent }: StyleEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<StyleConfig>({
    styleTemplateId: currentStyleId || "custom",
    temperature: 0.85, topP: 0.95, targetWordsPerSection: 1000,
    customForbiddenPatterns: [], customStyleNotes: "",
    dimensions: { ...PRESET_DIMENSIONS.custom },
    povType: "",
  });
  const [newForbidden, setNewForbidden] = useState("");

  // ── 废词扫描状态 ──
  const [scanResult, setScanResult] = useState<ForbiddenReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [activeScanCategory, setActiveScanCategory] = useState<ForbiddenCategory | null>(null);
  const [showBuiltinRules, setShowBuiltinRules] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── 面板Tab ──
  const [tab, setTab] = useState<"style" | "forbidden" | "params">("style");

  const abortRef = useRef<AbortController | null>(null);

  // 加载当前设置
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchData = async () => {
      try {
      const r = await fetch(`/api/projects/${projectId}/style`, { signal: controller.signal });
      if (!r.ok) { setLoadError("加载文风配置失败（HTTP " + r.status + "）"); setLoading(false); return; }
      const data = await r.json();
      if (!data.error) {
          const savedDimensions = data.dimensions || {};
          const templateId = data.styleTemplateId || "custom";
          const mergedDimensions = { ...(PRESET_DIMENSIONS[templateId] || PRESET_DIMENSIONS.custom), ...savedDimensions };
          setConfig({
            styleTemplateId: templateId,
            temperature: data.temperature ?? 0.85,
            topP: data.topP ?? 0.95,
            targetWordsPerSection: data.targetWordsPerSection ?? 1000,
            customForbiddenPatterns: data.customForbiddenPatterns || [],
            customStyleNotes: data.customStyleNotes || "",
            dimensions: mergedDimensions,
            povType: data.povType || "",
          });
        } else { setLoadError(data.error || "加载文风配置失败"); }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error(err);
        setLoadError("加载文风配置失败：" + (err instanceof Error ? err.message : "请重试"));
      } finally { setLoading(false); }
    };
    fetchData();
    return () => { controller.abort(); };
  }, [projectId]);

  // 选模板
  const handleSelectTemplate = (id: string) => {
    const template = getTemplate(id);
    const presetDims = PRESET_DIMENSIONS[id] || PRESET_DIMENSIONS.custom;
    setConfig((prev) => ({
      ...prev,
      styleTemplateId: id,
      temperature: template?.temperature ?? prev.temperature,
      topP: template?.topP ?? prev.topP,
      targetWordsPerSection: template?.targetWordsPerSection ?? prev.targetWordsPerSection,
      customForbiddenPatterns: template?.id !== "custom"
        ? [...new Set([...prev.customForbiddenPatterns, ...(template?.forbiddenPatterns || [])])]
        : prev.customForbiddenPatterns,
      dimensions: { ...presetDims },
    }));
  };

  // 维度滑块
  const setDimension = (key: string, value: number) => {
    setConfig((prev) => ({
      ...prev,
      dimensions: { ...prev.dimensions, [key]: value },
    }));
  };

  // 禁用词
  const addForbidden = () => {
    const pattern = newForbidden.trim();
    if (!pattern || config.customForbiddenPatterns.includes(pattern)) return;
    setConfig((prev) => ({ ...prev, customForbiddenPatterns: [...prev.customForbiddenPatterns, pattern] }));
    setNewForbidden("");
  };
  const removeForbidden = (pattern: string) => {
    setConfig((prev) => ({ ...prev, customForbiddenPatterns: prev.customForbiddenPatterns.filter((p) => p !== pattern) }));
  };

  // ── 废词扫描 ──
  const runScan = useCallback(() => {
    if (!chapterContent) {
      setScanError("当前没有选中的章节内容。请在 workspace 中打开一个章节后再扫描。");
      return;
    }
    setScanning(true); setScanError(""); setScanResult(null);
    // 异步执行扫描（大文本可能耗时）
    setTimeout(() => {
      try {
        const result = scanForbiddenWordsEnhanced(chapterContent, {
          customExactWords: config.customForbiddenPatterns.filter(p => !p.startsWith("/")),
        });
        setScanResult(result);
      } catch (err) {
        setScanError(`扫描失败：${err instanceof Error ? err.message : "未知错误"}`);
      } finally { setScanning(false); }
    }, 50);
  }, [chapterContent, config.customForbiddenPatterns]);

  // 保存
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/style`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({ error: "未知错误" })); toastError("保存文风失败：" + (d.error || `HTTP ${res.status}`)); return; }
      onSaved(config.styleTemplateId);
      onClose();
    } catch (err) { toastError("保存文风失败（网络错误）：" + (err instanceof Error ? err.message : "请重试")); }
    finally { setSaving(false); }
  };

  const builtinCounts = getBuiltinRuleCounts();

  if (loading) {
    return (
      <Modal open onClose={onClose} bare panelClassName="max-w-xs">
        <p className="bg-[var(--nv-surface-2)] backdrop-blur-sm rounded-2xl p-6 text-[var(--nv-text-tertiary)]">加载中…</p>
      </Modal>
    );
  }

  if (loadError) {
    return (
      <Modal open onClose={onClose} bare panelClassName="max-w-sm">
        <div className="p-6 text-center">
          <p className="text-danger mb-3"><Icon name="alert" size={15} className="inline-block align-text-bottom shrink-0" /> {loadError}</p>
          <Button onClick={onClose}>关闭</Button>
        </div>
      </Modal>
    );
  }

  // ── 渲染 ──

  return (
    <Modal open onClose={onClose} bare panelClassName="w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--nv-border-2)] shrink-0">
          <h2 className="text-lg font-semibold"><Icon name="palette" size={15} className="inline-block align-text-bottom shrink-0" /> 文风与质量控制</h2>
          <button onClick={onClose} className="text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)] text-lg"><Icon name="x" size={15} className="inline-block align-text-bottom shrink-0" /></button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-[var(--nv-border-2)] shrink-0">
          {([
            { key: "style" as const, icon: "🎨", label: "文风维度" },
            { key: "forbidden" as const, icon: "🚫", label: "废词检测" },
            { key: "params" as const, icon: "⚙️", label: "LLM参数" },
          ]).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === t.key ? "text-[var(--nv-text-secondary)] border-b-2 border-[var(--nv-primary)] bg-[var(--nv-surface-3)]/20" : "text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-3)]/10"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* ═══════════════════════════════════
              Tab 1: 文风维度
              ═══════════════════════════════════ */}
          {tab === "style" && (
            <>
              {/* 预设风格库 */}
              <div>
                <label className="text-sm text-[var(--nv-text-tertiary)] mb-2 block"><Icon name="package" size={15} className="inline-block align-text-bottom shrink-0" /> 预设风格库（一键切换）</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(function() {
                    // 给 STYLE_TEMPLATES 加一个古风仙侠和极简留白
                    const extended = [
                      ...STYLE_TEMPLATES.filter(t => t.id !== "custom"),
                      { id: "ancient_xianxia", name: "古风仙侠", icon: "🏯", description: "半文半白、意境悠远。适合仙侠、武侠。" } as any,
                      { id: "minimalist", name: "极简留白", icon: "⬜", description: "海明威式简练。适合文艺、实验性写作。" } as any,
                    ];
                    return extended.map((t) => (
                      <button key={t.id} onClick={() => handleSelectTemplate(t.id)}
                        className={`text-[10px] py-1.5 px-1 rounded-lg text-center transition-colors leading-tight ${config.styleTemplateId === t.id ? "bg-[var(--nv-primary)] text-[var(--nv-text-primary)]" : "bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)] hover:bg-[var(--nv-surface-2)]"}`}
                        title={t.description}>
                        <div className="text-sm">{t.icon}</div>
                        <div className="mt-0.5">{t.name}</div>
                      </button>
                    ));
                  })()}
                </div>
              </div>

              {/* 叙事视角 */}
              <div>
                <label className="text-sm text-[var(--nv-text-tertiary)] mb-2 block"><Icon name="drama" size={15} className="inline-block align-text-bottom shrink-0" /> 叙事视角</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {POV_OPTIONS.map((opt) => (
                    <button key={opt.key} onClick={() => setConfig({ ...config, povType: opt.key })}
                      className={`text-left py-1.5 px-2.5 rounded-lg text-xs transition-colors border ${config.povType === opt.key ? "bg-[var(--nv-primary)] text-[var(--nv-text-primary)] border-[var(--nv-primary)]" : "bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)] border-[var(--nv-border-2)] hover:bg-[var(--nv-surface-2)]"}`}
                      title={opt.desc}>
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-[10px] opacity-70 mt-0.5 leading-tight">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 12 维度滑块 */}
              <div>
                <label className="text-sm text-[var(--nv-text-tertiary)] mb-3 block"><Icon name="sliders" size={15} className="inline-block align-text-bottom shrink-0" /> 12 维度微调</label>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {DIMENSIONS.map((dim) => (
                    <div key={dim.key} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--nv-text-tertiary)]">{dim.icon} {dim.label}</span>
                        <span className="text-xs text-[var(--nv-text-muted)] font-mono">{config.dimensions[dim.key]?.toFixed(1) || "5.0"}</span>
                      </div>
                      <input
                        type="range"
                        min={dim.min} max={dim.max} step={dim.step}
                        value={config.dimensions[dim.key] || 5}
                        onChange={(e) => setDimension(dim.key, parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-[var(--nv-surface-2)] rounded-full appearance-none cursor-pointer
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--nv-primary)] [&::-webkit-slider-thumb]:cursor-pointer"
                        title={dim.description}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 自定义风格笔记 */}
              <div>
                <label className="text-sm text-[var(--nv-text-tertiary)] mb-2 block"><Icon name="pencil" size={15} className="inline-block align-text-bottom shrink-0" /> 风格笔记（追加到 System Prompt）</label>
                <textarea
                  className="w-full bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-[var(--nv-primary)]"
                  rows={3}
                  value={config.customStyleNotes}
                  onChange={(e) => setConfig({ ...config, customStyleNotes: e.target.value })}
                  placeholder="比如：多用短句，对白占比60%以上，环境描写要阴暗潮湿..."
                />
              </div>
            </>
          )}

          {/* ═══════════════════════════════════
              Tab 2: 废词检测
              ═══════════════════════════════════ */}
          {tab === "forbidden" && (
            <>
              {/* 内置规则概览 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-[var(--nv-text-tertiary)]"><Icon name="shield" size={15} className="inline-block align-text-bottom shrink-0" /> 内置检测规则（{builtinCounts.total} 条）</label>
                  <button onClick={() => setShowBuiltinRules(!showBuiltinRules)}
                    className="text-[10px] text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)]">
                    {showBuiltinRules ? "收起" : "展开"}
                  </button>
                </div>
                {showBuiltinRules && (
                  <div className="grid grid-cols-1 gap-1.5 mb-3">
                    {FORBIDDEN_CATEGORIES.map((cat) => (
                      <div key={cat.key} className="flex items-center gap-2 text-[10px] bg-[var(--nv-surface-3)]/50 rounded px-2 py-1">
                        <span>{cat.icon}</span>
                        <span className="text-[var(--nv-text-secondary)] font-medium w-20 shrink-0">{cat.label}</span>
                        <span className="text-[var(--nv-text-muted)]">{cat.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 自定义禁用词 */}
              <div>
                <label className="text-sm text-[var(--nv-text-tertiary)] mb-2 block"><Icon name="plus" size={15} className="inline-block align-text-bottom shrink-0" /> 自定义禁用词/句式</label>
                <div className="flex gap-2 mb-2">
                  <input
                    className="flex-1 bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded px-3 py-1.5 text-sm focus:outline-none focus:border-danger"
                    value={newForbidden}
                    onChange={(e) => setNewForbidden(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addForbidden()}
                    placeholder="输入词或 /正则表达式/，回车添加"
                  />
                  <Button size="sm" onClick={addForbidden} className="bg-danger hover:bg-danger h-8 text-xs">添加</Button>
                </div>
                {config.customForbiddenPatterns.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {config.customForbiddenPatterns.map((p) => (
                      <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger/50 border border-danger/50 text-xs text-danger">
                        <Icon name="ban" size={15} className="inline-block align-text-bottom shrink-0" /> {p}
                        <button onClick={() => removeForbidden(p)} className="hover:text-danger text-danger"><Icon name="x" size={15} className="inline-block align-text-bottom shrink-0" /></button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--nv-text-muted)]">暂无自定义禁用词。支持纯文本和 /正则表达式/ 格式。</p>
                )}
              </div>

              {/* 扫描按钮 */}
              <div className="border-t border-[var(--nv-border-2)] pt-4">
                <div className="flex items-center gap-3">
                  <Button onClick={runScan} disabled={scanning || !chapterContent}
                    className={`text-xs h-8 ${scanning ? "bg-[var(--nv-surface-2)]" : "bg-[var(--nv-primary)] hover:brightness-110"}`}>
                    {scanning ? (<><Icon name="loader" size={13} className="animate-spin" /> 扫描中…</>) : "🔍 扫描当前章节"}
                  </Button>
                  {!chapterContent && (
                    <span className="text-[10px] text-[var(--nv-text-muted)]">请在 workspace 中选中一个章节</span>
                  )}
                  {scanResult && (
                    <span className={`text-xs font-medium ${scanResult.passed ? "text-success" : "text-danger"}`}>
                      {scanResult.passed ? "✅ 全部通过" : `❌ ${scanResult.bySeverity.error}处必须修改`}
                      <span className="text-[var(--nv-text-muted)] ml-2">质量分 {scanResult.qualityScore}/100</span>
                    </span>
                  )}
                </div>
                {scanError && <p className="text-xs text-danger mt-2">{scanError}</p>}
              </div>

              {/* 扫描结果 */}
              {scanResult && scanResult.matches.length > 0 && (
                <div className="space-y-2">
                  {/* 分类统计 */}
                  <div className="flex flex-wrap gap-1.5">
                    {FORBIDDEN_CATEGORIES.map((cat) => {
                      const count = scanResult.byCategory[cat.key] || 0;
                      if (count === 0) return null;
                      return (
                        <button key={cat.key}
                          onClick={() => setActiveScanCategory(activeScanCategory === cat.key ? null : cat.key)}
                          className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${activeScanCategory === cat.key ? "bg-[var(--nv-primary)] text-[var(--nv-text-primary)]" : "bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)] hover:bg-[var(--nv-surface-2)]"}`}>
                          {cat.icon} {cat.label} ×{count}
                        </button>
                      );
                    })}
                    {scanResult.fuzzyDensity > 0 && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${scanResult.fuzzyDensity > 3 ? "bg-danger/50 text-danger" : "bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)]"}`}>
                        <Icon name="cloud" size={15} className="inline-block align-text-bottom shrink-0" /> 模糊词密度 {scanResult.fuzzyDensity.toFixed(1)}/500字
                      </span>
                    )}
                  </div>

                  {/* 匹配列表 */}
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {scanResult.matches
                      .filter((m) => !activeScanCategory || m.category === activeScanCategory)
                      .map((m, i) => (
                        <div key={i} className={`text-[10px] rounded px-2 py-1.5 ${m.severity === "error" ? "bg-danger/30 border border-danger/30" : m.severity === "warning" ? "bg-warning/20 border border-warning/20" : "bg-[var(--nv-surface-3)]/50"}`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`font-medium ${m.severity === "error" ? "text-danger" : m.severity === "warning" ? "text-warning" : "text-[var(--nv-text-tertiary)]"}`}>
                              {m.severity === "error" ? "❌" : m.severity === "warning" ? "⚠️" : "ℹ️"}
                            </span>
                            <span className="text-[var(--nv-text-secondary)] font-mono">{m.pattern.length > 40 ? m.pattern.slice(0, 40) + "…" : m.pattern}</span>
                            {m.index >= 0 && <span className="text-[var(--nv-text-muted)] ml-auto shrink-0">位置 {m.index}</span>}
                          </div>
                          {m.context && m.index >= 0 && (
                            <p className="text-[var(--nv-text-muted)] mt-0.5 ml-4 truncate">{m.context}</p>
                          )}
                          {m.suggestion && (
                            <p className="text-success/80 mt-0.5 ml-4"><Icon name="lightbulb" size={15} className="inline-block align-text-bottom shrink-0" /> {m.suggestion}</p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {scanResult && scanResult.matches.length === 0 && (
                <p className="text-xs text-success"><Icon name="party" size={15} className="inline-block align-text-bottom shrink-0" /> 未发现任何问题，文本质量良好！</p>
              )}
            </>
          )}

          {/* ═══════════════════════════════════
              Tab 3: LLM参数
              ═══════════════════════════════════ */}
          {tab === "params" && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-[var(--nv-text-muted)] mb-1 block">Temperature</label>
                  <input type="number" step="0.05" min="0" max="2"
                    value={config.temperature}
                    onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) || 0.85 })}
                    className="w-full bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded px-2 py-2 text-sm text-center focus:outline-none focus:border-[var(--nv-primary)]" />
                  <div className="text-[10px] text-[var(--nv-text-muted)] mt-0.5 text-center">越高越奔放</div>
                </div>
                <div>
                  <label className="text-xs text-[var(--nv-text-muted)] mb-1 block">Top-P</label>
                  <input type="number" step="0.05" min="0" max="1"
                    value={config.topP}
                    onChange={(e) => setConfig({ ...config, topP: parseFloat(e.target.value) || 0.95 })}
                    className="w-full bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded px-2 py-2 text-sm text-center focus:outline-none focus:border-[var(--nv-primary)]" />
                </div>
                <div>
                  <label className="text-xs text-[var(--nv-text-muted)] mb-1 block">每节字数</label>
                  <input type="number" step="100" min="200" max="5000"
                    value={config.targetWordsPerSection}
                    onChange={(e) => setConfig({ ...config, targetWordsPerSection: parseInt(e.target.value) || 1000 })}
                    className="w-full bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded px-2 py-2 text-sm text-center focus:outline-none focus:border-[var(--nv-primary)]" />
                </div>
              </div>

              <div className="border-t border-[var(--nv-border-2)] pt-4">
                <p className="text-xs text-[var(--nv-text-muted)] leading-relaxed">
                  Temperature 控制随机性：越低越稳定保守，越高越有创意但可能跑偏。<br />
                  Top-P 控制词汇选择范围：越低越集中，越高越多样。<br />
                  日常写作建议 Temperature 0.8-0.9，需要严格逻辑时降到 0.6-0.7。
                </p>
              </div>
            </>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-between items-center px-5 py-3 border-t border-[var(--nv-border-2)] shrink-0">
          <div className="text-[10px] text-[var(--nv-text-muted)]">
            {config.styleTemplateId !== "custom" && (
              <span><Icon name="package" size={15} className="inline-block align-text-bottom shrink-0" /> 预设：{STYLE_TEMPLATES.find(t => t.id === config.styleTemplateId)?.name || config.styleTemplateId}</span>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="border-[var(--nv-border-2)] text-xs">取消</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[var(--nv-primary)] hover:brightness-110 text-xs">
              {saving ? "保存中…" : "保存文风"}
            </Button>
          </div>
        </div>
    </Modal>
  );
}
