"use client";

import { useEffect } from "react";

/**
 * 路由级错误边界：任何子段渲染/数据获取抛出的异常都会落在这里，
 * 显示中文可读错误 + 重试，而不是 Next 默认的崩溃页。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[NovelForge] 路由运行时错误:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-danger/20 bg-danger/5 p-6 backdrop-blur">
        <h2 className="text-lg font-semibold text-danger">页面出错了</h2>
        <p className="mt-2 text-sm text-[var(--nv-text-tertiary)]">
          渲染时发生异常。可先点「重试」；若持续出现，多半是数据库未连接或 AI 配置缺失——
          顶部状态条会给出具体修复命令。
        </p>
        <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-danger/80">
          {error.message || "未知错误"}
        </pre>
        <div className="mt-4 flex gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-[var(--nv-primary)]/80 px-4 py-2 text-sm font-medium text-[var(--nv-text-primary)] transition hover:bg-[var(--nv-primary)]"
          >
            重试
          </button>
          <a
            href="/"
            className="rounded-lg border border-[var(--nv-border-2)] px-4 py-2 text-sm text-[var(--nv-text-secondary)] transition hover:bg-[var(--nv-surface-2)]"
          >
            返回首页
          </a>
        </div>
      </div>
    </div>
  );
}
