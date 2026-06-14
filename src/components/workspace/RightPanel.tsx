"use client";

import { ContextPreview } from "@/components/editor/ContextPreview";
import { StatRow } from "./SharedUI";
import type { ProjectData, StoryNodeData } from "./types";

export function RightPanel({
  selectedNode, project, onClose, contextRefreshKey, authorNote,
}: {
  selectedNode: StoryNodeData | null; project: ProjectData;
  onClose: () => void; contextRefreshKey: number; authorNote: string;
}) {
  return (
    <aside className="w-80 border-l border-zinc-800 bg-zinc-900/30 flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-xs font-medium text-zinc-400">📊 上下文监控</span>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 text-xs">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {selectedNode ? (
          <ContextPreview projectId={project.id} nodeId={selectedNode.id} authorNote={authorNote} refreshKey={contextRefreshKey} />
        ) : (
          <div className="text-xs text-zinc-600 p-4">选择大纲节点以预览上下文</div>
        )}
        <div className="border-t border-zinc-800 mt-4 pt-3 space-y-1">
          <h4 className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">项目统计</h4>
          <StatRow label="总字数" value={String(project.storyNodes.reduce((sum, n) => sum + (n.wordCount || 0), 0))} />
          <StatRow label="角色" value={String(project.characters.length)} />
          <StatRow label="词条" value={String(project.lorebookEntries.length)} />
          <StatRow label="节点" value={String(project.storyNodes.length)} />
          <StatRow label="类型" value={project.genre.join("、") || "未设定"} />
          <StatRow label="基调" value={project.toneKeywords.join("、") || "未设定"} />
        </div>
      </div>
    </aside>
  );
}
