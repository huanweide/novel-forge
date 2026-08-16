"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DissectProgress } from "@/components/dissect/DissectProgress";
import { Icon } from "@/components/ui/icons";
import { DissectDimensions } from "@/components/dissect/DissectDimensions";
import { DissectAdaptPanel } from "@/components/dissect/DissectAdaptPanel";
import type { DimensionResult, ChapterInfo } from "@/core/dissect/types";
import { toastError } from "@/components/ui/toast";

interface TaskDetail {
  id: string;
  taskName: string;
  bookName: string;
  bookAuthor: string;
  depth: string;
  status: string;
  progress: number;
  totalChapters: number;
  completedChapters: number;
  dimensions: Record<string, DimensionResult>;
  chapterList: ChapterInfo[];
  error?: string;
  convertedToProjectId?: string;
  modifiedProjectId?: string;
}

const POLL_INTERVAL = 2000;

export default function DissectDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollError, setPollError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "adapt">("view");
  const [converting, setConverting] = useState(false);
  const [convertSuccess, setConvertSuccess] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTask = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/dissect/${id}`);
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setPollError(d.error || `加载失败（${res.status}）`);
        return;
      }
      setPollError(null);
      const data = await res.json();
      setTask(data);
    } catch {
      setPollError("网络错误，无法加载拆书详情");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTask();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchTask(), POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchTask]);

  // 完成后降频
  useEffect(() => {
    if (task?.status === "completed" || task?.status === "failed") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => fetchTask(), 30000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [task?.status, fetchTask]);

  // ─── 原样转项目 ──────────────────────────────────────

  const handleDirectConvert = async () => {
    if (!id || converting) return;
    setConverting(true);
    try {
      const res = await fetch(`/api/dissect/${id}/to-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setConvertSuccess(data.projectId);
        setTask((prev) =>
          prev ? { ...prev, convertedToProjectId: data.projectId } : prev,
        );
      } else {
        toastError(data.error || "转换失败");
      }
    } catch (err: any) {
      toastError(err?.message || "网络错误");
    } finally {
      setConverting(false);
    }
  };

  // ─── 改编后转项目 ────────────────────────────────────

  const handleAdaptConvert = async (modifications: string) => {
    if (!id || converting) return;
    setConverting(true);
    try {
      const res = await fetch(`/api/dissect/${id}/to-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modifications }),
      });
      const data = await res.json();
      if (res.ok) {
        setConvertSuccess(data.projectId);
        setTask((prev) =>
          prev ? { ...prev, convertedToProjectId: data.projectId } : prev,
        );
      } else {
        toastError(data.error || "创建改编项目失败");
      }
    } catch (err: any) {
      toastError(err?.message || "网络错误");
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--nv-void)] flex items-center justify-center">
        <Icon name="loader" size={40} className="animate-spin text-[var(--nv-primary)]" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-[var(--nv-void)] flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4 flex justify-center"><Icon name="inbox" size={36} className="text-[var(--nv-text-tertiary)]" /></div>
          <p className="text-[var(--nv-text-tertiary)] mb-4">任务不存在</p>
          <Link href="/dissect" className="text-[var(--nv-primary)] hover:text-[var(--nv-primary)]">
            返回拆书导航
          </Link>
        </div>
      </div>
    );
  }

  const depthLabel: Record<string, string> = { quick: "快速", standard: "标准", deep: "精细" };
  const isRunning = task.status !== "completed" && task.status !== "failed";

  return (
    <div className="min-h-screen bg-[var(--nv-void)] text-[var(--nv-text-secondary)]">
      {pollError ? (
        <div className="border-b border-danger/30 bg-danger/10 px-6 py-3 text-sm text-danger">
          <Icon name="alert" size={15} className="inline-block align-text-bottom shrink-0" /> {pollError}
          <button
            onClick={() => {
              setPollError(null);
              fetchTask();
            }}
            className="ml-3 underline underline-offset-2 hover:text-[var(--nv-text-primary)]"
          >
            重试
          </button>
        </div>
      ) : null}
      {/* 顶栏 */}
      <header className="border-b border-[var(--nv-border-2)] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/dissect" className="text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)] shrink-0">
              ← 返回
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{task.bookName}</h1>
              <p className="text-xs text-[var(--nv-text-muted)] mt-0.5">
                {task.bookAuthor && <span>作者：{task.bookAuthor} · </span>}
                深度：{depthLabel[task.depth]} · {task.totalChapters}章
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* 进度条 */}
        <div style={{ minHeight: isRunning ? 100 : 0 }}>
          {isRunning && (
            <div className="mb-6 p-4 bg-[var(--nv-abyss)] border border-[var(--nv-border-2)] rounded-xl">
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

        {/* 错误 */}
        {task.status === "failed" && (
          <div className="mb-6 p-4 bg-danger/10 border border-danger/30 rounded-xl">
            <p className="text-sm text-danger">{task.error || "拆解失败"}</p>
          </div>
        )}

        {/* 成功转换提示 */}
        {convertSuccess && (
          <div className="mb-6 p-4 bg-success/10 border border-success/30 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-success"><Icon name="check" size={15} className="inline-block align-text-bottom shrink-0" /> 项目已创建</p>
              <p className="text-xs text-success mt-0.5">所有维度数据已导入项目</p>
            </div>
            <a
              href={`/workspace/${convertSuccess}`}
              className="px-4 py-2 btn-success rounded-lg text-sm font-medium"
            >
              进入工作区 →
            </a>
          </div>
        )}

        {/* 完成状态——结果展示 */}
        {task.status === "completed" && !convertSuccess && (
          <>
            {/* 两个选择——顶部醒目 */}
            <div className="mb-6 p-5 bg-[var(--nv-abyss)] border border-[var(--nv-border-2)] rounded-xl">
              <h2 className="text-sm font-semibold text-[var(--nv-text-secondary)] mb-3">
                拆解完成——选择创建方式
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {/* 原样转项目 */}
                <button
                  onClick={handleDirectConvert}
                  disabled={converting}
                  className="p-4 rounded-xl border border-[var(--nv-primary)]/30 bg-[var(--nv-primary)]/5 hover:bg-[var(--nv-primary)]/10 hover:-translate-y-0.5 hover:border-[var(--nv-primary)]/60 transition-all text-left group"
                >
                  <div className="text-2xl mb-2"><Icon name="package" size={18} className="inline-block align-text-bottom shrink-0" /></div>
                  <div className="text-sm font-semibold text-[var(--nv-text-secondary)] group-hover:text-[var(--nv-primary)]">
                    原样转为项目
                  </div>
                  <div className="text-xs text-[var(--nv-text-muted)] mt-1">
                    100% 忠实还原原著设定，不做任何修改。角色、世界观、情节全部照搬。
                  </div>
                  <div className="text-xs text-[var(--nv-primary)] mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    一键创建，即刻可用 →
                  </div>
                </button>

                {/* 改编后转项目 */}
                <button
                  onClick={() => setMode("adapt")}
                  disabled={converting}
                  className="p-4 rounded-xl border border-warning/30 bg-warning/5 hover:bg-warning/10 hover:-translate-y-0.5 hover:border-warning/60 transition-all text-left group"
                >
                  <div className="text-2xl mb-2"><Icon name="palette" size={18} className="inline-block align-text-bottom shrink-0" /></div>
                  <div className="text-sm font-semibold text-[var(--nv-text-secondary)] group-hover:text-warning">
                    改编后转项目
                  </div>
                  <div className="text-xs text-[var(--nv-text-muted)] mt-1">
                    跟 Agent 讨论修改方案——换性别、改设定、调整世界观。改到你满意再创建。
                  </div>
                  <div className="text-xs text-warning mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    先聊再建，柔性创作 →
                  </div>
                </button>
              </div>
            </div>

            {/* 改编面板（替代结果展示） */}
            {mode === "adapt" ? (
              <div className="bg-[var(--nv-abyss)] border border-[var(--nv-border-2)] rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold"><Icon name="palette" size={15} className="inline-block align-text-bottom shrink-0" /> 讨论改编方案</h3>
                  <button
                    onClick={() => setMode("view")}
                    className="text-xs text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)]"
                  >
                    返回查看结果
                  </button>
                </div>
                <DissectAdaptPanel
                  taskId={id}
                  dimensions={task.dimensions || {}}
                  onApplyAndCreate={handleAdaptConvert}
                  creating={converting}
                />
              </div>
            ) : (
              /* 美化结果展示 */
              <div className="bg-[var(--nv-abyss)] border border-[var(--nv-border-2)] rounded-xl p-4">
                <DissectDimensions
                  dimensions={task.dimensions || {}}
                  chapterList={task.chapterList}
                />
              </div>
            )}
          </>
        )}

        {/* 等待中 */}
        {isRunning && (
          <div className="bg-[var(--nv-abyss)] border border-[var(--nv-border-2)] rounded-xl p-4 flex items-center justify-center" style={{ minHeight: "40vh" }}>
            <div className="text-center text-[var(--nv-text-muted)]">
              <Icon name="loader" size={40} className="animate-spin text-[var(--nv-primary)] mb-3" />
              <p>拆解进行中...</p>
              <p className="text-xs mt-2">进度自动刷新，完成后可选择创建方式</p>
            </div>
          </div>
        )}

        {/* 已有项目时显示原结果 */}
        {task.convertedToProjectId && !convertSuccess && (
          <div className="bg-[var(--nv-abyss)] border border-[var(--nv-border-2)] rounded-xl p-4">
            <DissectDimensions
              dimensions={task.dimensions || {}}
              chapterList={task.chapterList}
              convertedToProjectId={task.convertedToProjectId}
            />
          </div>
        )}
      </main>
    </div>
  );
}
