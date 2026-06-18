"use client";

import Link from "next/link";
import type { AdoptedItem } from "@/core/explore/types";
import { STEP_LABELS, STEP_ICONS } from "@/core/explore/types";

interface Props {
  adopted: AdoptedItem[];
  onRemove: (id: string) => void;
  creating: boolean;
  createdProjectId: string | null;
  onCreateProject: (mode: "direct" | "ai_refine") => void;
}

export function AdoptedContentPanel({
  adopted,
  onRemove,
  creating,
  createdProjectId,
  onCreateProject,
}: Props) {
  const grouped: Record<string, AdoptedItem[]> = {};
  for (const item of adopted) {
    if (!grouped[item.step]) grouped[item.step] = [];
    grouped[item.step].push(item);
  }

  return (
    <div className="p-4 flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-3.5 rounded-full bg-emerald-400/60" />
        <h3 className="text-xs font-semibold text-zinc-300 tracking-wider uppercase">
          已采纳内容
        </h3>
        {adopted.length > 0 && (
          <span className="text-[10px] text-zinc-600 ml-auto">
            {adopted.length} 项
          </span>
        )}
      </div>

      {/* 采纳列表 */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        {adopted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mb-3">
              <span className="text-zinc-700 text-lg">📥</span>
            </div>
            <p className="text-xs text-zinc-600">还未采纳任何内容</p>
            <p className="text-[10px] text-zinc-700 mt-1.5 leading-relaxed max-w-[180px]">
              与AI对话并点击卡片即可采纳，内容会汇聚在这里
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([step, items]) => (
            <div key={step}>
              <div className="text-[10px] text-zinc-500 font-medium mb-1.5 flex items-center gap-1.5">
                <span>{STEP_ICONS[step as keyof typeof STEP_ICONS]}</span>
                <span>{STEP_LABELS[step as keyof typeof STEP_LABELS]}</span>
                <span className="text-zinc-700">· {items.length}</span>
              </div>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="mb-1.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] transition-all duration-200 group relative"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-medium text-zinc-300 leading-tight">
                      {item.title}
                    </span>
                    <button
                      onClick={() => onRemove(item.id)}
                      className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200 text-xs shrink-0 hover:scale-110"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                    {item.content.slice(0, 80)}
                  </p>
                </div>
              ))}
            </div>
          ))
        )}

        {/* 统计 */}
        {adopted.length > 0 && (
          <div className="text-[10px] text-zinc-600 pt-3 border-t border-white/[0.06] flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-zinc-600" />
            共 {adopted.length} 条 · {Object.keys(grouped).length} 个步骤
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="border-t border-white/[0.06] pt-4 space-y-2 shrink-0">
        {createdProjectId ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-emerald-400 font-medium">
                项目运行中
              </span>
            </div>
            <Link
              href={`/workspace/${createdProjectId}`}
              className="block w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-xs font-semibold text-center hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all duration-200 active:scale-[0.98]"
            >
              进入工作区 →
            </Link>
            <button
              onClick={() => onCreateProject("ai_refine")}
              disabled={creating || adopted.length === 0}
              className={`w-full py-2.5 rounded-xl text-xs font-medium transition-all duration-200 active:scale-[0.98] border ${
                creating || adopted.length === 0
                  ? "bg-white/[0.02] text-zinc-600 border-white/[0.05] cursor-not-allowed"
                  : "bg-purple-500/10 text-purple-300 border-purple-400/20 hover:bg-purple-500/15 hover:border-purple-400/30"
              }`}
            >
              {creating ? "⏳ 完善中..." : "🤖 AI补充缺失设定"}
            </button>
          </div>
        ) : (
          <>
            <p className="text-[9px] text-zinc-600 text-center">
              采纳第一条设定后自动创建项目
            </p>
            <button
              onClick={() => onCreateProject("direct")}
              disabled={creating || adopted.length === 0}
              className={`w-full py-3 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
                creating || adopted.length === 0
                  ? "bg-white/[0.03] text-zinc-600 border border-white/[0.05] cursor-not-allowed"
                  : "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:from-indigo-500 hover:to-indigo-400"
              }`}
            >
              {creating ? "⏳ 创建中..." : "📦 手动创建项目"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
