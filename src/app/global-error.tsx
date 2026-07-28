"use client";

/**
 * 全局错误边界：当根布局自身抛错（极少见）时接管，必须自带 <html>/<body>。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[#0a0a0f] text-[var(--nv-text-primary)] flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6">
          <h2 className="text-lg font-semibold text-rose-200">应用级错误</h2>
          <p className="mt-2 text-sm text-[var(--nv-text-tertiary)]">
            发生了一个未捕获的错误。请点「重试」；若仍失败，请检查数据库与 AI 配置后刷新页面。
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-rose-300/80">
            {error.message || "未知错误"}
          </pre>
          <button
            onClick={reset}
            className="mt-4 rounded-lg bg-[var(--nv-primary)]/80 px-4 py-2 text-sm font-medium text-[var(--nv-text-primary)] transition hover:bg-[var(--nv-primary)]"
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
