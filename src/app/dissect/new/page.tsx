"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { DissectUpload } from "@/components/dissect/DissectUpload";
import { DissectProgress } from "@/components/dissect/DissectProgress";
import { Icon } from "@/components/ui/icons";
import { describeStreamError, describeHttpError } from "@/lib/stream-error";

interface ProgressState {
  progress: number;
  status: string;
  message: string;
}

export default function NewDissectPage() {
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState<ProgressState>({ progress: 0, status: "pending", message: "" });
  const [taskId, setTaskId] = useState("");
  const [totalChapters, setTotalChapters] = useState(0);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function handleStart(data: {
    taskName: string;
    bookName: string;
    bookAuthor: string;
    originalText: string;
    depth: string;
    extractChapterSummaries: boolean;
  }) {
    setPhase("running");
    setValidationError("");
    setError("");
    setProgress({ progress: 0, status: "pending", message: "正在创建任务..." });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/dissect/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const failure = describeHttpError(res.status, err);
        setValidationError(`${failure.title}：${failure.description}`);
        setPhase("idle");
        return;
      }

      // SSE 流式读取进度
      const reader = res.body?.getReader();
      if (!reader) {
        setError("无法读取响应流");
        setPhase("error");
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
            const event = JSON.parse(trimmed.slice(6));

            if (event.type === "progress") {
              setProgress({
                progress: event.progress || 0,
                status: event.status || "extracting",
                message: event.message || "",
              });
            } else if (event.type === "done") {
              setTaskId(event.taskId);
              setTotalChapters(event.totalChapters || 0);
              setProgress({ progress: 100, status: "completed", message: "拆解完成" });
              setPhase("done");
            } else if (event.type === "error") {
              setError(event.message || "拆解失败");
              setPhase("error");
              if (event.taskId) setTaskId(event.taskId);
            }
          } catch {
            // 忽略解析失败的行
          }
        }
      }
    } catch (err: any) {
      const failure = describeStreamError(err);
      if (failure) {
        setError(`${failure.title}：${failure.description}`);
        setPhase("error");
      }
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setPhase("idle");
  }

  return (
    <div className="min-h-screen bg-[var(--nv-void)] text-[var(--nv-text-secondary)]">
      {/* 顶栏 */}
      <header className="border-b border-[var(--nv-border-2)] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/dissect" className="text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)] transition-colors">
            ← 返回
          </Link>
          <h1 className="text-lg font-bold"><Icon name="book" size={15} className="inline-block align-text-bottom shrink-0" /> 新建拆书</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-[var(--nv-abyss)] border border-[var(--nv-border-2)] rounded-xl p-6">
          {phase === "idle" && (
            <>
              <h2 className="text-base font-semibold mb-1">上传原文</h2>
              <p className="text-sm text-[var(--nv-text-muted)] mb-6">
                上传需要拆解的小说原文，支持TXT文件或直接粘贴文本
              </p>
              <DissectUpload onStart={handleStart} loading={false} />
              {validationError && (
                <div className="mt-4 p-3 bg-danger/10 border border-danger/30 rounded-lg">
                  <p className="text-sm text-danger">{validationError}</p>
                </div>
              )}
            </>
          )}

          {phase === "running" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">正在拆解...</h2>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1 text-xs text-[var(--nv-text-muted-on-surface-3)] hover:text-danger bg-[var(--nv-surface-3)] rounded-lg transition-colors"
                >
                  取消
                </button>
              </div>
              {/* 固定高度容器——防止进度更新时页面晃动 */}
              <div style={{ minHeight: 200 }}>
                <DissectProgress
                  status={progress.status}
                  progress={progress.progress}
                  totalChapters={totalChapters}
                  completedChapters={0}
                />
                {progress.message && (
                  <p className="text-xs text-[var(--nv-text-muted)] mt-3 animate-pulse">
                    {progress.message}
                  </p>
                )}
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="text-center py-8 animate-in">
              <div className="mb-4 flex justify-center"><Icon name="check" size={40} className="text-[var(--nv-success)]" /></div>
              <h2 className="text-xl font-bold text-[var(--nv-success)] mb-2">拆解完成</h2>
              <p className="text-sm text-[var(--nv-text-muted)] mb-6">
                {totalChapters > 0 ? `已识别 ${totalChapters} 章，15维度已提取` : "所有维度已提取完毕"}
              </p>
              <Link
                href={`/dissect/${taskId}`}
                className="inline-block px-6 py-3 rounded-lg font-medium btn-primary"
              >
                查看拆解结果 →
              </Link>
            </div>
          )}

          {phase === "error" && (
            <div className="text-center py-8 animate-in">
              <div className="mb-4 flex justify-center"><Icon name="x" size={40} className="text-[var(--nv-danger)]" /></div>
              <h2 className="text-xl font-bold text-[var(--nv-danger)] mb-2">拆解失败</h2>
              <p className="text-sm text-[var(--nv-text-tertiary)] mb-6">{error}</p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setPhase("idle")}
                  className="px-4 py-2 bg-[var(--nv-surface-3)] text-[var(--nv-text-secondary)] rounded-lg text-sm hover:bg-[var(--nv-surface-2)] transition-colors"
                >
                  重新上传
                </button>
                {taskId && (
                  <Link
                    href={`/dissect/${taskId}`}
                    className="px-4 py-2 rounded-lg text-sm btn-primary"
                  >
                    查看任务详情
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
