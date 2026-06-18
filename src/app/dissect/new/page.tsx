"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DissectUpload } from "@/components/dissect/DissectUpload";

export default function NewDissectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleStart(data: {
    taskName: string;
    bookName: string;
    bookAuthor: string;
    originalText: string;
    depth: string;
    extractChapterSummaries: boolean;
  }) {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/dissect/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "创建失败");
        setLoading(false);
        return;
      }

      // 跳转到结果页
      router.push(`/dissect/${result.taskId}`);
    } catch (err: any) {
      setError(err?.message || "网络错误，请重试");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* 顶栏 */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link
            href="/dissect"
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ← 返回
          </Link>
          <h1 className="text-lg font-bold">📖 新建拆书</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-base font-semibold mb-1">上传原文</h2>
          <p className="text-sm text-zinc-500 mb-6">
            上传需要拆解的小说原文，支持TXT文件或直接粘贴文本
          </p>

          <DissectUpload onStart={handleStart} loading={loading} />

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
