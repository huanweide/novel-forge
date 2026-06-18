"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DissectProgress } from "@/components/dissect/DissectProgress";
import { DissectDimensions } from "@/components/dissect/DissectDimensions";
import { ImitationPanel } from "@/components/dissect/ImitationPanel";
import type { DimensionResult, ChapterInfo } from "@/core/dissect/types";

interface TaskDetail {
  id: string;
  taskName: string;
  bookName: string;
  bookAuthor: string;
  depth: string;
  extractChapterSummaries: boolean;
  status: string;
  progress: number;
  totalChapters: number;
  completedChapters: number;
  dimensions: Record<string, DimensionResult>;
  chapterList: ChapterInfo[];
  error?: string;
  convertedToProjectId?: string;
  createdAt: string;
  updatedAt: string;
}

const POLL_INTERVAL = 2000; // 2秒轮询

export default function DissectDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"results" | "imitate">("results");
  const [converting, setConverting] = useState(false);

  // 用 ref 存 interval——避免 useEffect 闭包陷阱
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taskRef = useRef<TaskDetail | null>(null);

  // 同步 task 到 ref（供 interval 回调读取最新值）
  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  const fetchTask = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/dissect/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setTask(data);
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [id]);

  // 初始加载 + 持续轮询（不管什么状态都轮，后端决定返回什么）
  useEffect(() => {
    fetchTask();

    // 清除旧 interval
    if (intervalRef.current) clearInterval(intervalRef.current);

    // 启动新 interval——始终轮询，不依赖 status 条件
    intervalRef.current = setInterval(() => {
      fetchTask();
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchTask]);

  // 任务完成后停止频繁轮询——改为 30 秒一次（省资源）
  useEffect(() => {
    if (task?.status === "completed" || task?.status === "failed") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
          fetchTask();
        }, 30000); // 完成后 30 秒一次
      }
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [task?.status, fetchTask]);

  const handleConvertToProject = async () => {
    if (!id || converting) return;
    setConverting(true);
    try {
      const res = await fetch(`/api/dissect/${id}/to-project`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setTask((prev) =>
          prev ? { ...prev, convertedToProjectId: data.projectId } : prev,
        );
      } else {
        alert(data.error || "转换失败");
      }
    } catch (err: any) {
      alert(err?.message || "转换失败");
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center text-zinc-500">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">📭</div>
          <p className="text-zinc-400 mb-4">任务不存在</p>
          <Link href="/dissect" className="text-indigo-400 hover:text-indigo-300">
            返回拆书导航
          </Link>
        </div>
      </div>
    );
  }

  const depthLabel: Record<string, string> = {
    quick: "快速",
    standard: "标准",
    deep: "精细",
  };

  const isRunning = task.status !== "completed" && task.status !== "failed";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* 顶栏 */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dissect"
              className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
            >
              ← 返回
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{task.bookName}</h1>
              <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                <span className="truncate">{task.taskName}</span>
                {task.bookAuthor && <span className="shrink-0">作者：{task.bookAuthor}</span>}
                <span className="shrink-0">深度：{depthLabel[task.depth] || task.depth}</span>
                <span className="shrink-0">{task.totalChapters}章</span>
              </div>
            </div>
          </div>

          {/* 标签切换 */}
          <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 shrink-0 ml-4">
            <button
              onClick={() => setActiveTab("results")}
              className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
                activeTab === "results"
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              查看结果
            </button>
            <button
              onClick={() => setActiveTab("imitate")}
              className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
                activeTab === "imitate"
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              仿写
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* 进度区——固定 min-height 防晃动 */}
        <div style={{ minHeight: isRunning ? 120 : 0 }}>
          {isRunning && (
            <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
              <DissectProgress
                status={task.status}
                progress={task.progress}
                totalChapters={task.totalChapters}
                completedChapters={task.completedChapters}
                dimensions={task.dimensions}
                error={task.error}
              />
            </div>
          )}
        </div>

        {/* 错误状态 */}
        {task.status === "failed" && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <h3 className="text-sm font-medium text-red-400 mb-2">拆解失败</h3>
            <p className="text-sm text-red-300">{task.error || "未知错误"}</p>
          </div>
        )}

        {/* 内容区——固定最小高度防跳动 */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4" style={{ minHeight: "60vh" }}>
          {activeTab === "results" && (
            task.status === "completed" ? (
              <DissectDimensions
                dimensions={task.dimensions || {}}
                chapterList={task.chapterList}
                onConvertToProject={handleConvertToProject}
                convertedToProjectId={task.convertedToProjectId}
                converting={converting}
              />
            ) : task.status === "failed" ? (
              <div className="flex items-center justify-center" style={{ minHeight: "40vh" }}>
                <div className="text-center">
                  <div className="text-4xl mb-3">❌</div>
                  <p className="text-red-400">{task.error || "拆解失败"}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center" style={{ minHeight: "40vh" }}>
                <div className="text-center text-zinc-500">
                  <div className="animate-spin text-4xl mb-3">⏳</div>
                  <p>等待拆解完成...</p>
                  <p className="text-xs mt-2">进度自动刷新中，无需手动操作</p>
                </div>
              </div>
            )
          )}

          {activeTab === "imitate" && (
            task.status === "completed" ? (
              <ImitationPanel preselectedDissectionId={id} />
            ) : (
              <div className="flex items-center justify-center" style={{ minHeight: "40vh" }}>
                <div className="text-center text-zinc-500">
                  <div className="text-4xl mb-3">⏳</div>
                  <p className="mb-2">拆解尚未完成</p>
                  <p className="text-sm">请等待拆解完成后进行仿写</p>
                </div>
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}
