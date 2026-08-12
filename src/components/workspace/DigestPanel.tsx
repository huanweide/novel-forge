"use client";

import { useState } from "react";
import { useProjectStore } from "@/store";
import { Icon } from "@/components/ui/icons";
import type { StoryNodeData } from "./types";

/**
 * 摘要大纲面板（v1.8.23）
 *
 * 展示项目级摘要大纲（时间线 + 故事线），数据来自 store 中的 project.timelineDigest /
 * storylineDigest（写章 / 重新摘要落库后自动重建，或由本面板的「重新生成」按钮手动重建）。
 *
 * 它既是"可读"的摘要，也是被写作 / 章纲上下文"全部读取"的长期记忆入口——放在「更多▾」
 * 下拉里，与规则并列，符合"融入世界卡 / 更多，被读取"的定位。
 */
export function DigestPanel({
  projectId,
  onRefresh,
  selectedNode,
  onSummarizeCurrent,
  summarizing,
}: {
  projectId: string;
  onRefresh: () => void;
  selectedNode?: StoryNodeData | null;
  onSummarizeCurrent?: () => void;
  summarizing?: boolean;
}) {
  const project = useProjectStore((s) => s.project);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timelineDigest = project?.timelineDigest?.trim() || "";
  const storylineDigest = project?.storylineDigest?.trim() || "";
  const isEmpty = !timelineDigest && !storylineDigest;

  const handleRebuild = async () => {
    setRebuilding(true);
    setError(null);
    try {
      const res = await fetch("/api/generate/digest/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "未知错误" }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      onRefresh(); // 刷新 store，panel 自动显示新大纲
    } catch (e) {
      setError(e instanceof Error ? e.message : "重建失败");
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-[var(--nv-text-tertiary)]">
          时间线 + 故事线聚合摘要（被写作 / 章纲读取）
        </span>
        <button
          onClick={handleRebuild}
          disabled={rebuilding}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] hover:border-[var(--nv-border-3)] transition-colors disabled:opacity-50"
          title="基于现有各章摘要与主线事件重新生成摘要大纲"
        >
          <Icon name="refresh" size={12} className={rebuilding ? "animate-spin" : ""} />
          {rebuilding ? "生成中…" : "重新生成"}
        </button>
      </div>

      {error && (
        <div className="mx-1 text-[11px] text-[var(--nv-error)] bg-[var(--nv-error)]/10 rounded-md px-2 py-1.5">
          {error}
        </div>
      )}

      {isEmpty ? (
        <div className="mx-1 text-[12px] text-[var(--nv-text-tertiary)] leading-relaxed bg-[var(--nv-surface-2)] rounded-lg px-3 py-4">
          尚无摘要大纲。写完至少一个章节（或点击「重新生成」）后，系统会自动把各章摘要与时间线 / 主线大事件聚合成此处的精简大纲，并在你写下一章、写章纲时作为长期记忆注入。
        </div>
      ) : (
        <>
          {timelineDigest && (
            <section className="mx-1 bg-[var(--nv-surface-2)] rounded-lg p-3">
              <h4 className="text-[11px] font-semibold text-[var(--nv-text-secondary)] mb-1.5 flex items-center gap-1">
                <Icon name="history" size={12} /> 时间线摘要大纲
              </h4>
              <p className="text-[12px] text-[var(--nv-text-primary)] leading-relaxed whitespace-pre-line">
                {timelineDigest}
              </p>
            </section>
          )}
          {storylineDigest && (
            <section className="mx-1 bg-[var(--nv-surface-2)] rounded-lg p-3">
              <h4 className="text-[11px] font-semibold text-[var(--nv-text-secondary)] mb-1.5 flex items-center gap-1">
                <Icon name="bookmarked" size={12} /> 故事线摘要大纲
              </h4>
              <p className="text-[12px] text-[var(--nv-text-primary)] leading-relaxed whitespace-pre-line">
                {storylineDigest}
              </p>
            </section>
          )}
        </>
      )}

      {/* #291：当前章摘要入口（原顶栏「摘要」按钮能力迁移至此，统一摘要枢纽） */}
      <section className="mx-1 bg-[var(--nv-surface-2)] rounded-lg p-3 border border-[var(--nv-border-2)]">
        <h4 className="text-[11px] font-semibold text-[var(--nv-text-secondary)] mb-1.5 flex items-center gap-1">
          <Icon name="package" size={12} /> 当前章摘要
        </h4>
        {selectedNode ? (
          <>
            <p className="text-[12px] text-[var(--nv-text-primary)] leading-relaxed mb-2 truncate">
              《{selectedNode.title || "未命名章节"}》
            </p>
            <button
              onClick={onSummarizeCurrent}
              disabled={summarizing || !selectedNode.content}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] hover:border-[var(--nv-border-3)] transition-colors disabled:opacity-50"
            >
              {summarizing ? <Icon name="loader" size={12} className="animate-spin" /> : <Icon name="refresh" size={12} />}
              {summarizing ? "生成中…" : (selectedNode.content ? "重新生成本章摘要" : "本章暂无正文")}
            </button>
            <p className="text-[10px] text-[var(--nv-text-tertiary)] mt-2 leading-relaxed">
              章节写完后系统会自动生成摘要并聚入上方大纲；此处可手动重算当前选中章。
            </p>
          </>
        ) : (
          <p className="text-[11px] text-[var(--nv-text-tertiary)] leading-relaxed">
            未选中章节。在左侧大纲点选一章后，可在此手动生成 / 重算该章摘要。
          </p>
        )}
      </section>
    </div>
  );
}
