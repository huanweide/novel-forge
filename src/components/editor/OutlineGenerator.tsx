"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * 大纲生成器 —— 控制生成章节数量，支持指令定制和逐章预览
 */
interface ChapterOutline {
  title: string;
  summary: string;
  coreConflict: string;
  characters: string[];
}

export function OutlineGenerator({
  projectId,
  onChaptersCreated,
  onClose,
}: {
  projectId: string;
  onChaptersCreated: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"config" | "generating" | "preview" | "creating">("config");
  const [chapterCount, setChapterCount] = useState(8);
  const [instructions, setInstructions] = useState("");
  const [chapters, setChapters] = useState<ChapterOutline[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");

  // 生成大纲
  const handleGenerate = async () => {
    setStep("generating");
    setError("");

    try {
      const res = await fetch("/api/generate/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          chapterCount,
          instructions: instructions || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "生成失败");
      }

      const data = await res.json();
      setChapters(data.chapters || []);
      // 默认全选
      setSelectedChapters(new Set((data.chapters || []).map((_: any, i: number) => i)));
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
      setStep("config");
    }
  };

  // 重新生成指定章节
  const handleRegenerate = async (indices: number[]) => {
    setStep("generating");
    try {
      const res = await fetch("/api/generate/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          chapterCount: indices.length || chapterCount,
          instructions: instructions || undefined,
          regenerateChapterIds: indices.map((i) => `第${i + 1}章`),
        }),
      });

      if (!res.ok) throw new Error("重新生成失败");
      const data = await res.json();

      setChapters((prev) => {
        const next = [...prev];
        (data.chapters || []).forEach((ch: ChapterOutline, i: number) => {
          if (indices[i] !== undefined && indices[i] < next.length) {
            next[indices[i]] = ch;
          }
        });
        return next;
      });
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重新生成失败");
      setStep("preview");
    }
  };

  // 创建选中章节
  const handleCreate = async () => {
    setStep("creating");
    const selected = chapters.filter((_, i) => selectedChapters.has(i));

    try {
      const res = await fetch("/api/generate/outline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, chapters: selected }),
      });

      if (!res.ok) throw new Error("创建章节失败");
      onChaptersCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
      setStep("preview");
    }
  };

  const toggleChapter = (i: number) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedChapters.size === chapters.length) {
      setSelectedChapters(new Set());
    } else {
      setSelectedChapters(new Set(chapters.map((_, i) => i)));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="text-lg font-semibold">
            {step === "config" && "📋 生成大纲"}
            {step === "generating" && "⏳ AI 正在规划..."}
            {step === "preview" && `📋 大纲预览（${chapters.length} 章）`}
            {step === "creating" && "📝 创建章节中..."}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg">✕</button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === "config" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">生成多少章？</label>
                <div className="flex gap-2">
                  {[4, 8, 12, 20, 36].map((n) => (
                    <button
                      key={n}
                      onClick={() => setChapterCount(n)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        chapterCount === n
                          ? "bg-indigo-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                      }`}
                    >
                      {n} 章
                    </button>
                  ))}
                  <input
                    type="number"
                    value={chapterCount}
                    onChange={(e) => setChapterCount(parseInt(e.target.value) || 8)}
                    className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-center"
                    min={1}
                    max={100}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-1 block">
                  额外指令（可选）—— 告诉 AI 侧重什么
                </label>
                <textarea
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-500"
                  rows={3}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="比如：重点写比赛场面、每章都要有爆点、减少日常桥段..."
                />
              </div>

              {error && (
                <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-400">
                  {error}
                </div>
              )}

              <Button
                onClick={handleGenerate}
                className="w-full bg-indigo-600 hover:bg-indigo-500"
              >
                🤖 开始生成
              </Button>
            </div>
          )}

          {step === "generating" && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin text-4xl mb-4">⚙️</div>
              <p className="text-zinc-400 text-sm">AI 正在规划章节结构...</p>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              {/* 操作栏 */}
              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={toggleAll}
                  className="text-indigo-400 hover:text-indigo-300 text-xs"
                >
                  {selectedChapters.size === chapters.length ? "取消全选" : "全选"}
                </button>
                <span className="text-zinc-500 text-xs">
                  已选 {selectedChapters.size}/{chapters.length} 章
                </span>
                <button
                  onClick={() => {
                    setInstructions("");
                    setStep("config");
                  }}
                  className="text-zinc-500 hover:text-zinc-300 text-xs"
                >
                  重新全部生成
                </button>
              </div>

              {/* 章节列表 */}
              <div className="space-y-2">
                {chapters.map((ch, i) => (
                  <div
                    key={i}
                    className={`border rounded-lg p-3 transition-colors ${
                      selectedChapters.has(i)
                        ? "border-indigo-700/50 bg-indigo-950/20"
                        : "border-zinc-800 bg-zinc-900/50 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedChapters.has(i)}
                        onChange={() => toggleChapter(i)}
                        className="mt-0.5 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-zinc-500 font-mono">第{i + 1}章</span>
                          <span className="font-medium text-sm">{ch.title}</span>
                          <button
                            onClick={() => handleRegenerate([i])}
                            className="text-xs text-zinc-600 hover:text-indigo-400 ml-auto shrink-0"
                            title="重新生成这一章"
                          >
                            🔄
                          </button>
                        </div>
                        {ch.summary && (
                          <p className="text-xs text-zinc-500 leading-relaxed">{ch.summary}</p>
                        )}
                        {ch.coreConflict && (
                          <p className="text-xs text-amber-600 mt-1">冲突：{ch.coreConflict}</p>
                        )}
                        {ch.characters?.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {ch.characters.map((c) => (
                              <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-400">
                  {error}
                </div>
              )}

              <Button
                onClick={handleCreate}
                disabled={selectedChapters.size === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
              >
                创建 {selectedChapters.size} 个章节节点
              </Button>
            </div>
          )}

          {step === "creating" && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin text-4xl mb-4">📝</div>
              <p className="text-zinc-400 text-sm">正在创建章节节点...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
