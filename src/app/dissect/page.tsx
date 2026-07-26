"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { confirmDialog, toastError, toastSuccess, toastInfo } from "@/components/ui/toast";

interface TaskBrief {
  id: string;
  taskName: string;
  bookName: string;
  bookAuthor: string;
  depth: string;
  status: string;
  progress: number;
  totalChapters: number;
  completedChapters: number;
  convertedToProjectId?: string;
  error?: string;
  createdAt: string;
}

export default function DissectPage() {
  const [tasks, setTasks] = useState<TaskBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();
    // 每3秒刷新（可能有正在运行的任务）
    const interval = setInterval(loadTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  async function loadTasks() {
    try {
      const res = await fetch("/api/dissect/list");
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(d.error || `加载失败（${res.status}）`);
        return;
      }
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch {
      setLoadError("网络错误，无法加载拆书任务");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog({ title: "删除拆书任务", description: "确定删除这个拆书任务？此操作不可恢复。", danger: true }))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/dissect/${id}`, { method: "DELETE" });
      if (!res.ok) { toastError("删除失败（HTTP " + res.status + "）"); return; }
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch {
      toastError("删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  const depthLabel: Record<string, string> = {
    quick: "快速",
    standard: "标准",
    deep: "精细",
  };

  const statusBadge = (task: TaskBrief) => {
    if (task.status === "completed")
      return (
        <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
          完成
        </span>
      );
    if (task.status === "failed")
      return (
        <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">
          失败
        </span>
      );
    return (
      <span className="px-2 py-0.5 rounded text-xs bg-indigo-500/20 text-indigo-400">
        进行中 {Math.round(task.progress)}%
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* 顶栏 */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-zinc-500 hover:text-zinc-300 transition-colors">
              ← 返回
            </Link>
            <h1 className="text-lg font-bold">📚 拆书导航</h1>
          </div>
          <Link
            href="/dissect/new"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors"
          >
            + 新建拆书
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {loadError ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            ⚠️ {loadError}
            <button
              onClick={() => {
                setLoadError(null);
                loadTasks();
              }}
              className="ml-3 underline underline-offset-2 hover:text-white"
            >
              重试
            </button>
          </div>
        ) : loading ? (
          <div className="text-center py-20 text-zinc-500">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            <p>加载中...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📚</div>
            <h2 className="text-xl font-bold text-zinc-300 mb-2">还没有拆书任务</h2>
            <p className="text-zinc-500 mb-6">
              上传一本小说原文，AI 将自动拆解为世界观、角色、情节脉络等维度
            </p>
            <Link
              href="/dissect/new"
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors inline-block"
            >
              开始第一次拆书
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        href={`/dissect/${task.id}`}
                        className="text-base font-semibold text-zinc-200 hover:text-indigo-400 transition-colors truncate"
                      >
                        {task.bookName}
                      </Link>
                      {statusBadge(task)}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span>任务：{task.taskName}</span>
                      {task.bookAuthor && <span>作者：{task.bookAuthor}</span>}
                      <span>深度：{depthLabel[task.depth] || task.depth}</span>
                      <span>{task.totalChapters}章</span>
                      {task.convertedToProjectId && (
                        <a
                          href={`/workspace/${task.convertedToProjectId}`}
                          className="text-indigo-400 hover:text-indigo-300"
                        >
                          查看项目 →
                        </a>
                      )}
                    </div>
                    {task.error && (
                      <p className="text-xs text-red-400 mt-1 truncate">{task.error}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {task.status === "completed" && (
                      <Link
                        href={`/dissect/${task.id}`}
                        className="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        查看结果
                      </Link>
                    )}
                    <button
                      onClick={() => handleDelete(task.id)}
                      disabled={deletingId === task.id}
                      className="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      {deletingId === task.id ? "..." : "删除"}
                    </button>
                  </div>
                </div>

                {/* 进度条（进行中的任务） */}
                {task.status !== "completed" && task.status !== "failed" && (
                  <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                      style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
