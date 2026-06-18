"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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

export default function DissectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"results" | "imitate">("results");
  const [converting, setConverting] = useState(false);

  const fetchTask = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/dissect/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          router.push("/dissect");
          return;
        }
        return;
      }
      const data = await res.json();
      setTask(data);
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchTask();
    // 如果任务还在进行中，每2秒轮询
    const interval = setInterval(() => {
      if (task && task.status !== "completed" && task.status !== "failed") {
        fetchTask();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchTask, task?.status]);

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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* 顶栏 */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dissect" className="text-zinc-500 hover:text-zinc-300 transition-colors">
              ← 返回
            </Link>
            <div>
              <h1 className="text-lg font-bold">{task.bookName}</h1>
              <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                <span>{task.taskName}</span>
                {task.bookAuthor && <span>作者：{task.bookAuthor}</span>}
                <span>深度：{depthLabel[task.depth] || task.depth}</span>
                <span>{task.totalChapters}章</span>
              </div>
            </div>
          </div>

          {/* 标签切换 */}
          <div className="flex gap-1 bg-zinc-900 rounded-lg p-1">
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
        {/* 进度条（进行中的任务） */}
        {task.status !== "completed" && task.status !== "failed" && (
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

        {/* 错误状态 */}
        {task.status === "failed" && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <h3 className="text-sm font-medium text-red-400 mb-2">拆解失败</h3>
            <p className="text-sm text-red-300">{task.error || "未知错误"}</p>
          </div>
        )}

        {/* 结果标签页 */}
        {activeTab === "results" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4" style={{ minHeight: "60vh" }}>
            {task.status === "completed" ? (
              <DissectDimensions
                dimensions={task.dimensions || {}}
                chapterList={task.chapterList}
                onConvertToProject={handleConvertToProject}
                convertedToProjectId={task.convertedToProjectId}
                converting={converting}
              />
            ) : task.status === "failed" ? (
              <div className="text-center py-20 text-zinc-500">
                <div className="text-4xl mb-3">❌</div>
                <p className="text-red-400">{task.error || "拆解失败"}</p>
              </div>
            ) : (
              <div className="text-center py-20 text-zinc-500">
                <div className="animate-spin text-4xl mb-3">⏳</div>
                <p>等待拆解完成...</p>
              </div>
            )}
          </div>
        )}

        {/* 仿写标签页 */}
        {activeTab === "imitate" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            {task.status === "completed" ? (
              <ImitationPanel preselectedDissectionId={id} />
            ) : (
              <div className="text-center py-20 text-zinc-500">
                <div className="text-4xl mb-3">⏳</div>
                <p className="mb-2">拆解尚未完成</p>
                <p className="text-sm">请等待拆解完成后进行仿写</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
