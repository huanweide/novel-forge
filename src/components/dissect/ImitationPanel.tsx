"use client";

import { useState, useEffect, useCallback } from "react";
import type { DimensionKey, ImitationMode } from "@/core/dissect/types";
import {
  DISSECT_DIMENSIONS,
  DIMENSION_LABELS,
  DIMENSION_ICONS,
} from "@/core/dissect/types";

interface DissectTaskBrief {
  id: string;
  taskName: string;
  bookName: string;
  bookAuthor: string;
  status: string;
  totalChapters: number;
}

interface AvailableDimension {
  key: string;
  label: string;
  icon: string;
  preview: string;
}

interface ImitationPanelProps {
  /** 如果从拆书详情页打开，可以预设 dissectionId */
  preselectedDissectionId?: string;
}

export function ImitationPanel({ preselectedDissectionId }: ImitationPanelProps) {
  // 数据源
  const [tasks, setTasks] = useState<DissectTaskBrief[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState(preselectedDissectionId || "");
  const [availableDimensions, setAvailableDimensions] = useState<AvailableDimension[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // 仿写参数
  const [mode, setMode] = useState<ImitationMode>("partial");
  const [similarity, setSimilarity] = useState(70);
  const [selectedDimensions, setSelectedDimensions] = useState<DimensionKey[]>([]);
  const [customRequirement, setCustomRequirement] = useState("");
  const [targetWordCount, setTargetWordCount] = useState(3000);
  const [chapterCount, setChapterCount] = useState(1);

  // 生成状态
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  // 加载拆书任务列表
  useEffect(() => {
    fetch("/api/dissect/list")
      .then((r) => r.json())
      .then((data) => {
        const completed = (data.tasks || []).filter(
          (t: DissectTaskBrief) => t.status === "completed",
        );
        setTasks(completed);
        if (preselectedDissectionId && !selectedTaskId) {
          setSelectedTaskId(preselectedDissectionId);
        }
      })
      .catch(() => setTasks([]))
      .finally(() => setLoadingTasks(false));
  }, [preselectedDissectionId]);

  // 选定任务后加载其维度
  const handleTaskSelect = useCallback(async (taskId: string) => {
    setSelectedTaskId(taskId);
    setSelectedDimensions([]);
    setAvailableDimensions([]);

    if (!taskId) return;

    try {
      const res = await fetch(`/api/dissect/${taskId}/dimensions`);
      const data = await res.json();
      setAvailableDimensions(data.availableDimensions || []);
      // 默认全选
      const allKeys = (data.availableDimensions || []).map((d: AvailableDimension) => d.key);
      setSelectedDimensions(allKeys);
    } catch {
      setAvailableDimensions([]);
    }
  }, []);

  // 全选/取消全选
  const toggleAllDimensions = () => {
    if (selectedDimensions.length === availableDimensions.length) {
      setSelectedDimensions([]);
    } else {
      setSelectedDimensions(availableDimensions.map((d) => d.key as DimensionKey));
    }
  };

  const toggleDimension = (key: DimensionKey) => {
    setSelectedDimensions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  // 开始仿写（SSE 流式）
  const handleGenerate = async () => {
    if (!selectedTaskId || selectedDimensions.length === 0) return;

    setGenerating(true);
    setOutput("");
    setError("");

    try {
      const res = await fetch("/api/imitate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dissectionId: selectedTaskId,
          mode,
          similarity,
          selectedDimensions,
          customRequirement: customRequirement.trim(),
          targetWordCount,
          chapterCount,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "仿写启动失败");
        setGenerating(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError("无法读取响应流");
        setGenerating(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.type === "token") {
              setOutput((prev) => prev + data.content);
            } else if (data.type === "error") {
              setError(data.message || "生成出错");
            }
          } catch {
            // 忽略解析失败
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || "网络错误");
    } finally {
      setGenerating(false);
    }
  };

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <div className="space-y-5">
      {/* 数据源选择 */}
      <div>
        <label className="block text-sm text-zinc-400 mb-1.5">数据源</label>
        <select
          value={selectedTaskId}
          onChange={(e) => handleTaskSelect(e.target.value)}
          className="w-full bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="">请选择拆书记录...</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.bookName} ({t.taskName}) — {t.totalChapters}章
            </option>
          ))}
        </select>
        {selectedTask && (
          <p className="text-xs text-green-400 mt-1">
            已选择: {selectedTask.bookName}
            {selectedTask.bookAuthor ? `（${selectedTask.bookAuthor}）` : ""}
            {" "}({availableDimensions.length}维度可用)
          </p>
        )}
      </div>

      {/* 仿写模式 */}
      <div>
        <label className="block text-sm text-zinc-400 mb-2">仿写模式</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: "full" as const, label: "完全仿写", desc: "高度还原原作结构与设定" },
            { id: "partial" as const, label: "部分仿写", desc: "保留核心框架，部分创新" },
            { id: "creative" as const, label: "创意改写", desc: "借鉴灵感，大幅创新发挥" },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setMode(opt.id)}
              className={`p-2.5 rounded-lg border text-left transition-colors ${
                mode === opt.id
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-white/[0.08] bg-white/[0.03] backdrop-blur-sm hover:border-zinc-600"
              }`}
            >
              <div className="text-xs font-medium text-zinc-200">{opt.label}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 相似度滑块 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm text-zinc-400">相似度</label>
          <span className="text-sm font-medium text-indigo-400">{similarity}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={similarity}
          onChange={(e) => setSimilarity(Number(e.target.value))}
          className="w-full accent-indigo-500"
        />
        <div className="flex justify-between text-xs text-zinc-600">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          {similarity >= 80
            ? "高度相似，主要在细节上进行调整"
            : similarity >= 50
              ? "中等相似，保留核心框架但有一定创新空间"
              : "低相似，仅借鉴灵感"}
        </p>
      </div>

      {/* 维度选择 */}
      {availableDimensions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-zinc-400">选择仿写维度</label>
            <button
              onClick={toggleAllDimensions}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              {selectedDimensions.length === availableDimensions.length ? "取消全选" : "全选"}
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
            {availableDimensions.map((dim) => (
              <label
                key={dim.key}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                  selectedDimensions.includes(dim.key as DimensionKey)
                    ? "bg-indigo-500/15 text-indigo-300"
                    : "bg-white/[0.04] text-zinc-500 hover:text-zinc-400"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedDimensions.includes(dim.key as DimensionKey)}
                  onChange={() => toggleDimension(dim.key as DimensionKey)}
                  className="sr-only"
                />
                <span>{dim.icon}</span>
                <span>{dim.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 字数/章数 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">目标字数</label>
          <input
            type="number"
            value={targetWordCount}
            onChange={(e) => setTargetWordCount(Math.max(500, Number(e.target.value)))}
            min={500}
            max={50000}
            step={500}
            className="w-full bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">章节数</label>
          <input
            type="number"
            value={chapterCount}
            onChange={(e) => setChapterCount(Math.max(1, Math.min(20, Number(e.target.value))))}
            min={1}
            max={20}
            className="w-full bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 自定义要求 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm text-zinc-400">自定义要求（可选）</label>
          <span className="text-xs text-zinc-600">提示词库</span>
        </div>
        <textarea
          value={customRequirement}
          onChange={(e) => setCustomRequirement(e.target.value)}
          placeholder="可填写额外的仿写要求，如：主角改为女性、背景设定在现代都市..."
          rows={3}
          className="w-full bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 resize-y"
        />
      </div>

      {/* 生成按钮 */}
      <button
        onClick={handleGenerate}
        disabled={!selectedTaskId || selectedDimensions.length === 0 || generating}
        className={`w-full py-3 rounded-lg font-medium text-sm transition-colors ${
          selectedTaskId && selectedDimensions.length > 0 && !generating
            ? "bg-indigo-600 text-white hover:bg-indigo-500"
            : "bg-white/[0.04] text-zinc-600 cursor-not-allowed"
        }`}
      >
        {generating ? "⏳ 仿写生成中..." : "开始仿写"}
      </button>

      {/* 错误 */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* 生成输出 */}
      {output && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-zinc-400">生成结果</label>
            <button
              onClick={() => {
                navigator.clipboard.writeText(output);
              }}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              📋 复制
            </button>
          </div>
          <div className="p-4 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-lg max-h-96 overflow-y-auto">
            <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">
              {output}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
