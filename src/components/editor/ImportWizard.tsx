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
  const [importMode, setImportMode] = useState<"auto" | "chapters" | "settings" | "quick">("auto");
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

  // SSE进度跟踪
  const [progressSteps, setProgressSteps] = useState<Array<{ stage: string; message: string; time: string }>>([]);
  const [currentStage, setCurrentStage] = useState("");
  const [charsFound, setCharsFound] = useState(0);
  const [loreFound, setLoreFound] = useState(0);
  const [parsePct, setParsePct] = useState(0);
  const [chunkDone, setChunkDone] = useState(0);
  const [chunkTotal, setChunkTotal] = useState(0);
  const [isSettings, setIsSettings] = useState(false);

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

  // ─── 快速导入（SSE 流式进度）────────────────────────

  const [quickLoading, setQuickLoading] = useState(false);
  const [quickResult, setQuickResult] = useState("");
  const [quickStage, setQuickStage] = useState("");       // 当前阶段描述
  const [quickPct, setQuickPct] = useState(0);             // 进度条 0-100
  const [quickCharList, setQuickCharList] = useState<Array<{ name: string; preview: string }>>([]);
  const [quickDiag, setQuickDiag] = useState("");          // 诊断信息

  const handleQuickImport = async () => {
    if (rawText.trim().length < 20) { setError("文本太短（最少20字）"); return; }
    setQuickLoading(true);
    setError("");
    setQuickResult("");
    setQuickStage("connecting");
    setQuickPct(0);
    setQuickCharList([]);
    setQuickDiag("");

    try {
      const res = await fetch("/api/import/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, rawText }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(err.error || "快速导入失败");
        setQuickLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法获取响应流");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          if (!chunk.trim()) continue;
          const dataLine = chunk.split("\n").find(l => l.trim().startsWith("data: "));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.trim().slice(6));

            if (event.type === "progress") {
              setQuickStage(event.message || event.stage || "");
              if (event.pct !== undefined) setQuickPct(event.pct as number);
              if (event.characters) {
                setQuickCharList(event.characters as Array<{ name: string; preview: string }>);
              }
              // 捕获诊断信息
              if (event.parsedCount !== undefined) {
                setQuickDiag(`正则匹配: ${event.parsedCount}个 | 文本: ${event.textLength?.toLocaleString()}字 ${event.totalLines}行${event.sampleNames ? ` | 前10: ${(event.sampleNames as string[]).join(", ")}` : ""}`);
              }
            } else if (event.type === "done") {
              // 补诊断
              if (event.parsedCount !== undefined) {
                setQuickDiag(`解析: ${event.parsedCount}→合并: ${event.mergedCount}→写入: +${event.created || 0}新 📎${event.updated || 0}追加`);
              }
              setQuickPct(100);
              setQuickResult(event.message || "");
              setQuickStage("✅ 完成");
              setToast(event.message || "导入完成");
              setQuickLoading(false);
              // 保存导入的角色名列表供展示
              if (event.characterNames && Array.isArray(event.characterNames)) {
                setQuickCharList(event.characterNames.map((n: string) => ({ name: n, preview: "" })));
              }
              // 后台刷新数据，不关窗——让用户看到结果
              onImported();
            } else if (event.type === "error") {
              setError(event.message || "导入失败");
              setQuickLoading(false);
            }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络中断");
    } finally {
      setQuickLoading(false);
    }
  };

  // ─── SSE 流式解析 ──────────────────────────────────────

  const handleParse = async () => {
    if (rawText.trim().length < 50) {
      setError("文本太短（最少50字）");
      return;
    }

    setStep("parsing");
    setError("");
    setProgressSteps([]);
    setCurrentStage("connecting");
    setCharsFound(0);
    setLoreFound(0);
    setParsePct(0);
    setChunkDone(0);
    setChunkTotal(0);
    setIsSettings(false);

    try {
      const res = await fetch("/api/import/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, rawText, volumeMode, importMode }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(errData.error || "请求失败");
        setStep("input");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法获取响应流");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // 按 SSE 事件边界 \n\n 分割，不是按行
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          if (!chunk.trim()) continue;
          // 找 data: 行（可能跨多行，取第一行 data: 的内容）
          const lines = chunk.split("\n");
          const dataLine = lines.find(l => l.trim().startsWith("data: "));
          if (!dataLine) continue;

          try {
            const event = JSON.parse(dataLine.trim().slice(6));

            if (event.type === "progress") {
              setProgressSteps((prev) => [...prev, {
                stage: event.stage || "",
                message: event.message || "",
                time: new Date().toLocaleTimeString("zh-CN"),
              }]);
              setCurrentStage(event.stage || "");
              // 百分比
              if (event.pct !== undefined) setParsePct(event.pct as number);
              // 设定集标记
              if (event.isSettings) setIsSettings(true);
              // 分块进度
              if (event.stage === "ready" && event.chunks !== undefined) setChunkTotal(event.chunks as number);
              if (event.stage === "chunk-done" && event.doneChunks !== undefined) setChunkDone(event.doneChunks as number);
              // 逐角色/词条计数
              if (event.stage === "char-found" && event.total !== undefined) {
                setCharsFound(event.total as number);
              }
              if (event.stage === "lore-found" && event.total !== undefined) {
                setLoreFound(event.total as number);
              }
            } else if (event.type === "done") {
              setResult(event);
              setEditedChapters(event.detectedChapters || []);
              setEditedCharacters(event.extractedCharacters || []);
              setEditedLore(event.extractedLoreEntries || []);
              setSelectedChapters(new Set((event.detectedChapters || []).map((_: unknown, i: number) => i)));
              setSelectedChars(new Set((event.extractedCharacters || []).map((_: unknown, i: number) => i)));
              setSelectedLore(new Set((event.extractedLoreEntries || []).map((_: unknown, i: number) => i)));
              setProgressSteps((prev) => [...prev, {
                stage: "complete",
                message: `✅ 完成！提取了${(event.extractedCharacters || []).length}个角色，${(event.extractedLoreEntries || []).length}个词条`,
                time: new Date().toLocaleTimeString("zh-CN"),
              }]);
              setTimeout(() => setStep("preview"), 500);
            } else if (event.type === "error") {
              setError(event.message || "分析失败");
              if (event.rawOutput) {
                setError((prev) => prev + `\n\n原始输出预览：\n${event.rawOutput}`);
              }
              setStep("input");
            }
          } catch {
            // 跳过解析失败的行
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络中断");
      setStep("input");
    }
  };

  // ─── 分批提交（SSE 流式进度）──────────────────────────

  const [commitProgress, setCommitProgress] = useState<Array<{ stage: string; message: string }>>([]);
  const [commitStats, setCommitStats] = useState<{ charTotal?: number; charDone?: number; loreTotal?: number; loreDone?: number }>({});
  const [toast, setToast] = useState("");

  const handleCommit = async () => {
    setStep("committing");
    setCommitProgress([]);
    setCommitStats({});
    setToast("");

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

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(errData.error || "提交失败");
        setStep("preview");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法获取响应流");

      const decoder2 = new TextDecoder();
      let buf2 = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf2 += decoder2.decode(value, { stream: true });
        const chunks = buf2.split("\n\n");
        buf2 = chunks.pop() || "";

        for (const chunk of chunks) {
          if (!chunk.trim()) continue;
          const dataLine = chunk.split("\n").find(l => l.trim().startsWith("data: "));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.trim().slice(6));
            if (event.type === "progress") {
              setCommitProgress((prev) => [...prev, { stage: event.stage as string, message: event.message as string }]);
              if (event.stage === "chars-merge") {
                setCommitStats((p) => ({ ...p, charTotal: event.totalBatches as number, charDone: event.done as number }));
              } else if (event.stage === "lore-merge") {
                setCommitStats((p) => ({ ...p, loreTotal: event.totalBatches as number, loreDone: event.done as number }));
              }
            } else if (event.type === "done") {
              // 从列表中移除已确认的（保留未确认的）
              setEditedCharacters((prev) => prev.filter((_, i) => !selectedChars.has(i)));
              setEditedLore((prev) => prev.filter((_, i) => !selectedLore.has(i)));
              setEditedChapters((prev) => prev.filter((_, i) => !selectedChapters.has(i)));
              setSelectedChars(new Set());
              setSelectedLore(new Set());
              setSelectedChapters(new Set());

              const totalRemaining = (editedCharacters.length - selectedCharsList.length) + (editedLore.length - selectedLoreList.length);
              setToast(`✅ ${event.message}`);
              setTimeout(() => setToast(""), 4000);

              if (totalRemaining === 0) {
                // 全部确认完毕
                setMessage(event.message as string);
                setStep("done");
              } else {
                setStep("preview");
              }
            } else if (event.type === "error") {
              setError(event.message as string || "写入失败");
              setStep("preview");
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
      setStep("preview");
    }
  };

  // ─── 一键删除未确认 ────────────────────────────────────

  const handleRemoveAllUnconfirmed = () => {
    if (editedCharacters.length === 0 && editedLore.length === 0 && editedChapters.length === 0) return;
    setEditedCharacters([]);
    setEditedLore([]);
    setEditedChapters([]);
    setSelectedChars(new Set());
    setSelectedLore(new Set());
    setSelectedChapters(new Set());
    setToast("🗑️ 已清空所有未确认项");
    setTimeout(() => setToast(""), 3000);
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

              {/* 导入模式 */}
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">导入类型</label>
                <div className="flex gap-2">
                  {[
                    { key: "auto", label: "🤖 自动检测", desc: "智能识别" },
                    { key: "chapters", label: "📖 章节正文", desc: "叙事文本" },
                    { key: "settings", label: "📋 设定文本", desc: "角色/世界观/风格" },
                    { key: "quick", label: "⚡ 快速导入", desc: "识别名字→直写DB" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setImportMode(opt.key as typeof importMode)}
                      className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-all ${
                        importMode === opt.key
                          ? "bg-indigo-600 text-white border-2 border-indigo-400 shadow-lg"
                          : "bg-zinc-800 text-zinc-400 border-2 border-zinc-700 hover:border-zinc-600"
                      }`}
                    >
                      <div>{opt.label}</div>
                      <div className="text-xs opacity-70 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
                {importMode === "settings" && (
                  <p className="text-xs text-amber-400 mt-2">
                    ⚡ 设定模式：不限角色/词条数量上限，穷尽提取文本中的全部设定。不创建章节节点，仅导入三卡。
                  </p>
                )}
                {importMode === "quick" && (
                  <p className="text-xs text-green-400 mt-2">
                    ⚡ 快速导入：正则匹配"1.人名"格式→原文全抄进 quickImportContent→直接写DB。不用AI、毫秒级解析、一次搞定。
                  </p>
                )}
                {importMode === "chapters" && (
                  <p className="text-xs text-blue-400 mt-2">
                    📖 章节模式：自动识别分章标记，提取叙事中的角色和世界观。同时创建章节大纲节点。
                  </p>
                )}
              </div>

              {/* 分卷开关（仅章节模式显示） */}
              {importMode !== "settings" && (
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
              )}

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
                  {importMode === "quick" ? (
                    <Button
                      onClick={handleQuickImport}
                      disabled={quickLoading || rawText.trim().length < 30}
                      className="bg-green-600 hover:bg-green-500"
                    >
                      {quickLoading ? "⚡ 导入中..." : "⚡ 快速导入"}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleParse}
                      disabled={rawText.trim().length < 50}
                      className="bg-indigo-600 hover:bg-indigo-500"
                    >
                      🤖 AI 分析文本
                    </Button>
                  )}
                </div>
              </div>

              {/* ── 快速导入进度 / 结果 ── */}
              {(quickLoading || quickResult) && (
                <div className="mt-4 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 space-y-3">
                  {/* 进度条（仅加载中） */}
                  {quickLoading && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-green-400 font-medium">{quickStage || "连接中..."}</span>
                        <span className="text-zinc-500">{quickPct}%</span>
                      </div>
                      <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-600 to-emerald-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(quickPct, 3)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 诊断信息 */}
                  {quickDiag && (
                    <div className="text-[10px] text-zinc-500 bg-zinc-800/70 rounded px-2 py-1 font-mono">
                      {quickDiag}
                    </div>
                  )}

                  {/* 完成提示 */}
                  {quickResult && (
                    <div className="text-sm text-emerald-400 font-medium text-center py-2 border-b border-zinc-700">
                      {quickResult}
                    </div>
                  )}

                  {/* 识别的角色列表 */}
                  {quickCharList.length > 0 && (
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      <p className="text-xs text-zinc-500 mb-1 sticky top-0 bg-zinc-800/50 py-1">
                        {quickLoading ? "识别到的角色：" : "✅ 已导入角色（点左侧列表查看→编辑→背景状态）："}
                      </p>
                      {quickCharList.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs py-1 px-2 rounded bg-zinc-800/40">
                          <span className="text-green-400 font-medium shrink-0">{c.name}</span>
                          <span className="text-zinc-500 truncate">{c.preview}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: 解析中 */}
          {step === "parsing" && (
            <div className="flex flex-col items-center py-6 space-y-4">
              {/* 大状态 */}
              <div className="flex items-center gap-3">
                {currentStage === "complete" || currentStage === "done" ? (
                  <span className="text-3xl">✅</span>
                ) : (
                  <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                )}
                <div>
                  <p className="text-sm text-zinc-200 font-medium">
                    {currentStage === "init" && "连接数据库..."}
                    {currentStage === "ready" && `文本 ${rawText.length.toLocaleString()} 字 · 双Provider并行`}
                    {currentStage === "launch" && "A路 DeepSeek→人物 | B路 Flash→世界"}
                    {(currentStage === "path-a" || currentStage === "path-b") && `AB路并行中 · ${parsePct}%`}
                    {currentStage === "path-a-done" && `A路完成`}
                    {currentStage === "path-b-done" && `B路完成`}
                    {currentStage === "done-pre" && "完成！"}
                    {currentStage === "done" && "分析完成！"}
                    {!currentStage && "准备中..."}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {rawText.length > 0 && `文本 ${rawText.length.toLocaleString()} 字符 · 硅基+DeepSeek 双Provider`}
                  </p>
                </div>
              </div>

              {/* 全局进度条 */}
              {parsePct > 0 && (
                <div className="w-full max-w-md mt-1">
                  <div className="flex justify-between text-xs text-zinc-500 mb-0.5">
                    <span>总进度</span>
                    <span>{parsePct}%</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${parsePct}%` }} />
                  </div>
                </div>
              )}

              {/* AB路进度 */}
              {(currentStage === "path-a" || currentStage === "path-b" || currentStage === "path-a-done" || currentStage === "path-b-done") && (
                <div className="w-full max-w-md space-y-1.5 mt-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-pink-400 w-24 shrink-0">👤 A路 DeepSeek</span>
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-pink-600 rounded-full transition-all duration-500" style={{ width: `${currentStage === "path-a-done" ? "100" : "40"}%` }} />
                    </div>
                    <span className="text-zinc-500 w-16 text-right text-[10px]">{currentStage === "path-a-done" ? "✅完成" : "进行中"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-400 w-24 shrink-0">🌍 B路 Flash</span>
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-600 rounded-full transition-all duration-500" style={{ width: `${currentStage === "path-b-done" ? "100" : "40"}%` }} />
                    </div>
                    <span className="text-zinc-500 w-16 text-right text-[10px]">{currentStage === "path-b-done" ? "✅完成" : "进行中"}</span>
                  </div>
                </div>
              )}

              {/* 实时统计：角色+词条计数 */}
              {(charsFound > 0 || loreFound > 0) && (
                <div className="flex gap-4 text-xs">
                  <span className="text-pink-400">👤 角色 {charsFound}</span>
                  <span className="text-emerald-400">📖 词条 {loreFound}</span>
                </div>
              )}

              {/* 进度步骤列表 */}
              {progressSteps.length > 0 && (
                <div className="w-full max-w-md space-y-1 max-h-60 overflow-y-auto">
                  {progressSteps.map((step, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 px-3 py-1 rounded text-xs transition-colors ${
                        i === progressSteps.length - 1
                          ? "bg-indigo-950/30 border border-indigo-800/20"
                          : "text-zinc-500"
                      }`}
                    >
                      <span className="text-zinc-600 font-mono shrink-0 w-14">{step.time}</span>
                      <span className="flex-1">{step.message}</span>
                      {step.stage === "chunk-done" && <span className="text-green-500 shrink-0">✓</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* 提示 */}
              {parsePct > 0 && parsePct < 90 && (
                <p className="text-xs text-zinc-600 animate-pulse">
                  分块并行分析中，总时间≈最慢那块...
                </p>
              )}
            </div>
          )}

          {/* Step 3: 预览确认（分批选择确认） */}
          {step === "preview" && result && (
            <div className="space-y-5">
              <p className="text-xs text-zinc-500 -mb-3">勾选要导入的项 → 点「确认选中」写入数据库。已写入的会自动移出列表。未确认的可以保留或手动移除。</p>

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
                      <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs border transition-colors ${
                        selectedChapters.has(i) ? "border-indigo-700 bg-indigo-950/30" : "border-zinc-800 bg-zinc-900/50"
                      }`}>
                        <label className="flex items-start gap-2 flex-1 cursor-pointer min-w-0">
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
                        <button
                          onClick={() => {
                            setEditedChapters((prev) => prev.filter((_, j) => j !== i));
                            const next = new Set(selectedChapters);
                            next.delete(i);
                            setSelectedChapters(next);
                          }}
                          className="text-zinc-600 hover:text-red-400 hover:bg-red-950/30 p-1 rounded shrink-0 transition-colors"
                          title="移除"
                        >✕</button>
                      </div>
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
                      <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs border transition-colors ${
                        selectedChars.has(i) ? "border-pink-700 bg-pink-950/30" : "border-zinc-800 bg-zinc-900/50"
                      }`}>
                        <label className="flex items-start gap-2 flex-1 cursor-pointer min-w-0">
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
                            {Array.isArray(char.personality) && char.personality.length > 0 && (
                              <div className="flex flex-wrap gap-0.5 mt-0.5">
                                {char.personality.slice(0, 4).map((p: string, j: number) => (
                                  <span key={j} className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px]">{p}</span>
                                ))}
                              </div>
                            )}
                            {char.background && (
                              <p className="text-zinc-600 mt-0.5 line-clamp-4 whitespace-pre-line text-[11px]">{char.background}</p>
                            )}
                          </div>
                        </label>
                        <button
                          onClick={() => {
                            setEditedCharacters((prev) => prev.filter((_, j) => j !== i));
                            const next = new Set(selectedChars);
                            next.delete(i);
                            setSelectedChars(next);
                          }}
                          className="text-zinc-600 hover:text-red-400 hover:bg-red-950/30 p-1 rounded shrink-0 transition-colors"
                          title="移除"
                        >✕</button>
                      </div>
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
                        <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs border transition-colors ${
                          selectedLore.has(i) ? "border-emerald-700 bg-emerald-950/30" : "border-zinc-800 bg-zinc-900/50"
                        }`}>
                          <label className="flex items-start gap-2 flex-1 cursor-pointer min-w-0">
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
                          <button
                            onClick={() => {
                              setEditedLore((prev) => prev.filter((_, j) => j !== i));
                              const next = new Set(selectedLore);
                              next.delete(i);
                              setSelectedLore(next);
                            }}
                            className="text-zinc-600 hover:text-red-400 hover:bg-red-950/30 p-1 rounded shrink-0 transition-colors"
                            title="移除"
                          >✕</button>
                        </div>
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
              <div className="flex justify-between items-center pt-3 border-t border-zinc-800">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("input")} className="border-zinc-700 text-xs">
                    ← 返回修改
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRemoveAllUnconfirmed}
                    className="border-red-800 text-red-400 hover:bg-red-950/30 text-xs"
                    disabled={editedCharacters.length === 0 && editedLore.length === 0 && editedChapters.length === 0}
                  >
                    🗑 一键删除未确认
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">
                    剩余 {editedCharacters.length}角色 {editedLore.length}词条 {editedChapters.length}章
                  </span>
                  <Button
                    onClick={handleCommit}
                    disabled={selectedChapters.size === 0 && selectedChars.size === 0 && selectedLore.size === 0}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-xs"
                  >
                    ✅ 确认选中（{selectedChapters.size}章 {selectedChars.size}角色 {selectedLore.size}词条）
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Toast 提示 */}
          {toast && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-emerald-900/90 border border-emerald-700 text-sm text-emerald-200 shadow-lg animate-pulse">
              {toast}
            </div>
          )}

          {/* Step 4: 提交中（SSE 实时进度） */}
          {step === "committing" && (
            <div className="flex flex-col py-8 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
                <div>
                  <p className="text-sm text-zinc-200 font-medium">正在写入数据库...</p>
                  <p className="text-xs text-zinc-500">
                    章节 · 角色卡 · 世界书 · 文风卡 | V4 Pro 分批合并
                  </p>
                </div>
              </div>

              {/* 进度列表 */}
              <div className="space-y-2">
                {commitProgress.map((p, i) => {
                  const isChars = p.stage === "chars-merge";
                  const isLore = p.stage === "lore-merge";
                  const isDone = p.stage.includes("done") || p.message.startsWith("✅");

                  return (
                    <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      i === commitProgress.length - 1 ? "bg-purple-950/30 border border-purple-800/30" : "text-zinc-500"
                    }`}>
                      {isDone ? (
                        <span className="text-green-500 shrink-0">✅</span>
                      ) : (
                        <span className="shrink-0">{isChars ? "👤" : isLore ? "📖" : "📝"}</span>
                      )}
                      <span className="flex-1 text-xs">{p.message}</span>
                      {/* 进度条 */}
                      {isChars && commitStats.charDone !== undefined && commitStats.charTotal && (
                        <div className="w-24 h-1.5 bg-zinc-700 rounded-full overflow-hidden shrink-0">
                          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{
                            width: `${Math.min(100, Math.round((commitStats.charDone / Math.max(1, Number(commitStats.charTotal) * 4)) * 100))}%`
                          }} />
                        </div>
                      )}
                      {isLore && commitStats.loreDone !== undefined && commitStats.loreTotal && (
                        <div className="w-24 h-1.5 bg-zinc-700 rounded-full overflow-hidden shrink-0">
                          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{
                            width: `${Math.min(100, Math.round(((commitStats.loreDone || 0) / Math.max(1, Number(commitStats.loreTotal) * 4)) * 100))}%`
                          }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
