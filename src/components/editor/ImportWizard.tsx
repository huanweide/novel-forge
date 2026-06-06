"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";

// ─── 类型 ────────────────────────────────────────────────────

interface DetectedChapter {
  volumeTitle?: string;
  chapterTitle: string;
  order: number;
  content: string;
  wordCount: number;
  contentSnippet: string;
}

interface ExtractedChar {
  name: string;
  aliases?: string[];
  role?: string;
  personality?: string[];
  appearance?: Record<string, string>;
  background?: string;
  dialogueStyle?: Record<string, unknown>;
  hiddenMotives?: string[];
  age?: string;
  gender?: string;
}

interface ExtractedLore {
  title: string;
  category?: string;
  keys?: string[];
  content?: string;
}

interface ExtractedStyle {
  avgSentenceLength?: number;
  dialogueRatio?: number;
  descriptionRatio?: number;
  actionRatio?: number;
  povType?: string;
  narrativeDistance?: string;
  tonalMarkers?: Record<string, number>;
  lexicalFeatures?: Record<string, number>;
  styleDescription?: string;
  sampleText?: string;
}

interface ParseResult {
  detectedChapters: DetectedChapter[];
  extractedCharacters: ExtractedChar[];
  extractedLoreEntries: ExtractedLore[];
  extractedStyle: ExtractedStyle;
  meta: { chapterCount: number; characterCount: number; loreCount: number; volumeMode: boolean };
}

type Step = "input" | "parsing" | "preview" | "committing" | "done";

// ─── 组件 ────────────────────────────────────────────────────

export function ImportWizard({
  projectId,
  onClose,
  onImported,
}: {
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<Step>("input");
  const [rawText, setRawText] = useState("");
  const [volumeMode, setVolumeMode] = useState(true);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // 用户编辑状态
  const [editedChapters, setEditedChapters] = useState<DetectedChapter[]>([]);
  const [editedCharacters, setEditedCharacters] = useState<ExtractedChar[]>([]);
  const [editedLore, setEditedLore] = useState<ExtractedLore[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(new Set());
  const [selectedChars, setSelectedChars] = useState<Set<number>>(new Set());
  const [selectedLore, setSelectedLore] = useState<Set<number>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── 文件拖放 ──────────────────────────────────────────

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  };

  const readFile = (file: File) => {
    if (!file.name.endsWith(".txt") && !file.name.endsWith(".md")) {
      setError("只支持 .txt 和 .md 文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setRawText(e.target?.result as string);
      setError("");
    };
    reader.readAsText(file);
  };

  // ─── 开始解析 ──────────────────────────────────────────

  const handleParse = async () => {
    if (rawText.trim().length < 50) {
      setError("文本太短（最少50字）");
      return;
    }

    setStep("parsing");
    setError("");

    try {
      const res = await fetch("/api/import/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, rawText, volumeMode }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "解析失败");
        setStep("input");
        return;
      }

      setResult(data);
      setEditedChapters(data.detectedChapters || []);
      setEditedCharacters(data.extractedCharacters || []);
      setEditedLore(data.extractedLoreEntries || []);

      // 默认全选
      setSelectedChapters(new Set((data.detectedChapters || []).map((_: DetectedChapter, i: number) => i)));
      setSelectedChars(new Set((data.extractedCharacters || []).map((_: ExtractedChar, i: number) => i)));
      setSelectedLore(new Set((data.extractedLoreEntries || []).map((_: ExtractedLore, i: number) => i)));

      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
      setStep("input");
    }
  };

  // ─── 提交导入 ──────────────────────────────────────────

  const handleCommit = async () => {
    setStep("committing");

    const selectedChaptersList = editedChapters.filter((_, i) => selectedChapters.has(i));
    const selectedCharsList = editedCharacters.filter((_, i) => selectedChars.has(i));
    const selectedLoreList = editedLore.filter((_, i) => selectedLore.has(i));

    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          chapters: selectedChaptersList,
          characters: selectedCharsList,
          loreEntries: selectedLoreList,
          style: result?.extractedStyle || {},
          volumeMode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "提交失败");
        setStep("preview");
        return;
      }

      setMessage(data.message || "导入完成");
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
      setStep("preview");
    }
  };

  // ─── 渲染 ──────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (step === "input" || step === "done") onClose(); }}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="text-lg font-semibold">
            📥 {step === "input" ? "导入文本" : step === "parsing" ? "AI 分析中..." : step === "preview" ? "预览确认" : step === "committing" ? "写入中..." : "导入完成"}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Step 1: 输入文本 */}
          {step === "input" && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                粘贴小说文本或拖入 .txt/.md 文件。系统会自动识别分卷/分章结构，并用 AI 抽取角色、世界观和文风。
              </p>

              <div className="flex items-center gap-3 mb-2">
                <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={volumeMode}
                    onChange={(e) => setVolumeMode(e.target.checked)}
                    className="rounded accent-indigo-600"
                  />
                  自动识别分卷（检测"第X卷"标记）
                </label>
                <span className="text-zinc-600 text-xs">
                  {volumeMode ? "会按卷 → 章两层结构导入" : "所有章节平铺在根节点下"}
                </span>
              </div>

              <div
                className="border-2 border-dashed border-zinc-700 rounded-xl p-4 hover:border-indigo-600 transition-colors cursor-pointer"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <p className="text-xs text-zinc-500 text-center">
                  拖放文件到此处，或点击选择文件（.txt / .md）
                </p>
              </div>

              <textarea
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-mono resize-none focus:outline-none focus:border-indigo-500"
                rows={16}
                value={rawText}
                onChange={(e) => { setRawText(e.target.value); setError(""); }}
                placeholder={`在此粘贴你的小说文本...

支持格式示例：
第一卷 觉醒
第一章 平凡的开始
正文内容...
第二章 不速之客
正文内容...`}
              />

              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">
                  {rawText.length > 0 ? `${rawText.length} 字符` : "等待输入"}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose} className="border-zinc-700">取消</Button>
                  <Button
                    onClick={handleParse}
                    disabled={rawText.trim().length < 50}
                    className="bg-indigo-600 hover:bg-indigo-500"
                  >
                    🤖 AI 分析文本
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: 解析中 */}
          {step === "parsing" && (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-zinc-400">AI 正在分析文本...</p>
              <p className="text-xs text-zinc-600">正则分章 → 角色抽取 → 世界观提取 → 文风量化</p>
            </div>
          )}

          {/* Step 3: 预览确认 */}
          {step === "preview" && result && (
            <div className="space-y-5">
              {/* 概要 */}
              <div className="grid grid-cols-4 gap-3">
                <StatBox label="识别章节" value={String(editedChapters.length)} color="text-indigo-400" />
                <StatBox label="抽取角色" value={String(editedCharacters.length)} color="text-pink-400" />
                <StatBox label="世界观词条" value={String(editedLore.length)} color="text-emerald-400" />
                <StatBox label="分卷模式" value={volumeMode ? "ON" : "OFF"} color="text-amber-400" />
              </div>

              {/* 三栏预览 */}
              <div className="grid grid-cols-3 gap-4">
                {/* 左：章节列表 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-zinc-300">
                      📖 章节 ({selectedChapters.size}/{editedChapters.length})
                    </h3>
                    <button
                      onClick={() => setSelectedChapters(
                        selectedChapters.size === editedChapters.length
                          ? new Set()
                          : new Set(editedChapters.map((_, i) => i))
                      )}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      {selectedChapters.size === editedChapters.length ? "取消全选" : "全选"}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                    {editedChapters.map((ch, i) => (
                      <label
                        key={i}
                        className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer text-xs border transition-colors ${
                          selectedChapters.has(i)
                            ? "border-indigo-700 bg-indigo-950/30"
                            : "border-zinc-800 bg-zinc-900/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedChapters.has(i)}
                          onChange={() => {
                            const next = new Set(selectedChapters);
                            next.has(i) ? next.delete(i) : next.add(i);
                            setSelectedChapters(next);
                          }}
                          className="mt-0.5 rounded accent-indigo-600"
                        />
                        <div className="min-w-0">
                          {ch.volumeTitle && (
                            <span className="text-amber-400/70 font-medium block">{ch.volumeTitle}</span>
                          )}
                          <span className="text-zinc-300">{ch.chapterTitle}</span>
                          <span className="text-zinc-600 ml-1">{ch.wordCount}字</span>
                          <p className="text-zinc-600 mt-0.5 truncate">{ch.contentSnippet}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 中：角色列表 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-zinc-300">
                      👤 角色 ({selectedChars.size}/{editedCharacters.length})
                    </h3>
                    <button
                      onClick={() => setSelectedChars(
                        selectedChars.size === editedCharacters.length
                          ? new Set()
                          : new Set(editedCharacters.map((_, i) => i))
                      )}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      {selectedChars.size === editedCharacters.length ? "取消全选" : "全选"}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                    {editedCharacters.map((char, i) => (
                      <label
                        key={i}
                        className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer text-xs border transition-colors ${
                          selectedChars.has(i)
                            ? "border-pink-700 bg-pink-950/30"
                            : "border-zinc-800 bg-zinc-900/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedChars.has(i)}
                          onChange={() => {
                            const next = new Set(selectedChars);
                            next.has(i) ? next.delete(i) : next.add(i);
                            setSelectedChars(next);
                          }}
                          className="mt-0.5 rounded accent-pink-600"
                        />
                        <div className="min-w-0">
                          <span className="text-zinc-200 font-medium">{char.name}</span>
                          <span className="text-zinc-500 ml-1">
                            {char.role === "protagonist" ? "主角" : char.role === "antagonist" ? "反派" : char.role === "supporting" ? "配角" : char.role || "配角"}
                          </span>
                          {char.personality && char.personality.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-0.5">
                              {char.personality.slice(0, 4).map((p, j) => (
                                <span key={j} className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px]">{p}</span>
                              ))}
                            </div>
                          )}
                          {char.background && (
                            <p className="text-zinc-600 mt-0.5 line-clamp-2">{char.background}</p>
                          )}
                        </div>
                      </label>
                    ))}
                    {editedCharacters.length === 0 && (
                      <p className="text-xs text-zinc-600 p-4 text-center">未识别到角色</p>
                    )}
                  </div>
                </div>

                {/* 右：世界观 + 文风 */}
                <div className="space-y-4">
                  {/* 世界观词条 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-zinc-300">
                        🌍 世界书 ({selectedLore.size}/{editedLore.length})
                      </h3>
                      <button
                        onClick={() => setSelectedLore(
                          selectedLore.size === editedLore.length
                            ? new Set()
                            : new Set(editedLore.map((_, i) => i))
                        )}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        {selectedLore.size === editedLore.length ? "取消全选" : "全选"}
                      </button>
                    </div>
                    <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                      {editedLore.map((entry, i) => (
                        <label
                          key={i}
                          className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer text-xs border transition-colors ${
                            selectedLore.has(i)
                              ? "border-emerald-700 bg-emerald-950/30"
                              : "border-zinc-800 bg-zinc-900/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedLore.has(i)}
                            onChange={() => {
                              const next = new Set(selectedLore);
                              next.has(i) ? next.delete(i) : next.add(i);
                              setSelectedLore(next);
                            }}
                            className="mt-0.5 rounded accent-emerald-600"
                          />
                          <div className="min-w-0">
                            <span className="text-zinc-200">{entry.title}</span>
                            <span className="text-zinc-600 ml-1 text-[10px]">{entry.category}</span>
                            {entry.keys && entry.keys.length > 0 && (
                              <div className="flex flex-wrap gap-0.5 mt-0.5">
                                {entry.keys.slice(0, 4).map((k, j) => (
                                  <span key={j} className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 text-[10px]">🔑{k}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                      {editedLore.length === 0 && (
                        <p className="text-xs text-zinc-600 p-4 text-center">未识别到世界设定</p>
                      )}
                    </div>
                  </div>

                  {/* 文风卡 */}
                  {result.extractedStyle && Object.keys(result.extractedStyle).length > 0 && (
                    <StyleCardPreview style={result.extractedStyle} />
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-between pt-3 border-t border-zinc-800">
                <Button variant="outline" onClick={() => setStep("input")} className="border-zinc-700">
                  ← 返回修改
                </Button>
                <Button
                  onClick={handleCommit}
                  disabled={selectedChapters.size === 0 && selectedChars.size === 0 && selectedLore.size === 0}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
                >
                  ✅ 确认导入（{selectedChapters.size}章 {selectedChars.size}角色 {selectedLore.size}词条）
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: 提交中 */}
          {step === "committing" && (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-zinc-400">正在写入数据库...</p>
              <p className="text-xs text-zinc-600">
                创建章节节点 · 角色卡片 · 世界书词条 · 文风卡
              </p>
            </div>
          )}

          {/* Step 5: 完成 */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="text-5xl">✅</div>
              <p className="text-lg text-zinc-200 font-medium">{message}</p>
              <p className="text-sm text-zinc-500">数据已写入数据库，可以开始查看了</p>
              <div className="flex gap-3 mt-4">
                <Button variant="outline" onClick={onClose} className="border-zinc-700">
                  关闭
                </Button>
                <Button
                  onClick={() => { onImported(); onClose(); }}
                  className="bg-indigo-600 hover:bg-indigo-500"
                >
                  刷新工作区
                </Button>
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="mt-3 p-3 rounded-lg bg-red-950/30 border border-red-900/50 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 子组件 ──────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

function StyleCardPreview({ style }: { style: ExtractedStyle }) {
  return (
    <div className="border border-zinc-700 rounded-xl p-3 bg-zinc-800/30">
      <h3 className="text-sm font-medium text-zinc-300 mb-2">🎨 文风分析</h3>

      {style.styleDescription && (
        <p className="text-xs text-zinc-400 mb-3 italic">「{style.styleDescription}」</p>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-zinc-500">平均句长</span>
          <span className="text-zinc-300">{style.avgSentenceLength?.toFixed(0) || "—"}字</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">叙事视角</span>
          <span className="text-zinc-300">
            {style.povType === "first_person" ? "第一人称" :
             style.povType === "third_person_limited" ? "第三人称限制" :
             style.povType === "third_person_omniscient" ? "第三人称全知" : style.povType || "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">对话占比</span>
          <span className="text-zinc-300">{style.dialogueRatio ? `${(style.dialogueRatio * 100).toFixed(0)}%` : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">叙事距离</span>
          <span className="text-zinc-300">
            {style.narrativeDistance === "close" ? "贴近" : style.narrativeDistance === "far" ? "疏离" : "中等"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">描写占比</span>
          <span className="text-zinc-300">{style.descriptionRatio ? `${(style.descriptionRatio * 100).toFixed(0)}%` : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">动作占比</span>
          <span className="text-zinc-300">{style.actionRatio ? `${(style.actionRatio * 100).toFixed(0)}%` : "—"}</span>
        </div>
      </div>

      {/* 语气特征 */}
      {style.tonalMarkers && Object.keys(style.tonalMarkers).length > 0 && (
        <div className="mt-2 pt-2 border-t border-zinc-700">
          <span className="text-zinc-500 text-[10px] block mb-1">语气特征</span>
          <div className="flex flex-wrap gap-1">
            {Object.entries(style.tonalMarkers)
              .filter(([, v]) => v > 0.1)
              .map(([k, v]) => (
                <span key={k} className="px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 text-[10px]">
                  {k}: {(v * 100).toFixed(0)}%
                </span>
              ))}
          </div>
        </div>
      )}

      {/* 样本 */}
      {style.sampleText && (
        <div className="mt-2 pt-2 border-t border-zinc-700">
          <span className="text-zinc-500 text-[10px] block mb-1">代表性段落</span>
          <p className="text-[11px] text-zinc-400 leading-relaxed italic line-clamp-4">
            {style.sampleText}
          </p>
        </div>
      )}
    </div>
  );
}
