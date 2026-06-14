"use client";

export function StreamingText({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  return (
    <div className="whitespace-pre-wrap leading-relaxed text-sm text-zinc-200">
      {content}
      {isStreaming && <span className="inline-block w-2 h-4 bg-indigo-400 ml-0.5 animate-pulse" />}
    </div>
  );
}
