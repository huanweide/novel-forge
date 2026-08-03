"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";

interface AIChatHeaderProps {
  loading: boolean;
  readonlyMode: boolean;
}

/**
 * 墨灵 — Agent 头部：身份高亮 + 能力教学 + 模式徽标（v0.46.58）
 */
const CAPABILITIES: { icon: string; label: string; desc: string }[] = [
  { icon: "user", label: "角色", desc: "查/建/改/删角色卡，比对正文与设定" },
  { icon: "book", label: "世界书", desc: "查词条、补全世界观条目" },
  { icon: "target", label: "大纲", desc: "看章节大纲、梳理剧情线" },
  { icon: "eye", label: "伏笔", desc: "追踪伏笔状态与待兑现承诺" },
  { icon: "book", label: "关系网", desc: "从正文提取角色互动关系" },
  { icon: "file", label: "分析", desc: "章节一致性检查、提炼实体" },
];

export function AIChatHeader({ loading, readonlyMode }: AIChatHeaderProps) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="shrink-0 border-b border-[var(--nv-border-1)] bg-[var(--nv-surface-2)]">
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className={`w-2 h-2 rounded-full ${loading ? "bg-[var(--nv-accent)]" : "bg-[var(--nv-success)]"}`} />
            <div className={`absolute inset-0 w-2 h-2 rounded-full opacity-40 ${loading ? "bg-[var(--nv-accent)] animate-ping" : "bg-[var(--nv-success)] animate-ping"}`} />
          </div>
          <span
            className="text-xs font-bold bg-gradient-to-r from-[var(--nv-creative)] via-[var(--nv-accent)] to-[var(--nv-info)] bg-clip-text text-transparent"
            style={{ filter: "drop-shadow(0 0 6px color-mix(in oklch, var(--nv-creative) 40%, transparent))" }}
          >
            墨灵
          </span>
          <span className="text-[10px] text-[var(--nv-text-tertiary)]">AI 写作助手</span>
          <span
            className={`ml-auto inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full ${
              readonlyMode
                ? "bg-[var(--nv-surface-3)] text-[var(--nv-text-muted)]"
                : "bg-[var(--nv-success)]/15 text-[var(--nv-success)]"
            }`}
            title={readonlyMode ? "只读模式：仅查信息，不可改动项目数据（设置中可开启操作权限）" : "可操作模式：能查询并修改角色/词条等数据"}
          >
            <Icon name={readonlyMode ? "eye" : "zap"} size={9} />
            {readonlyMode ? "只读" : "可操作"}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[10px] text-[var(--nv-text-secondary)] leading-relaxed">
            角色卡·世界书·大纲·伏笔·故事线·规则·风格
          </span>
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-[var(--nv-creative)] hover:text-[var(--nv-creative)]/70 transition-colors"
          >
            <Icon name="sparkles" size={10} /> {showHelp ? "收起" : "墨灵能做什么？"}
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="px-3 pb-2 space-y-1">
          <p className="text-[10px] leading-relaxed text-[var(--nv-text-tertiary)]">
            墨灵是会使用项目工具的写作 Agent——直接说需求即可，例如：「把樊斯瑞的性格改成更外放」「列出本章与角色卡不一致的地方」。
          </p>
          <div className="grid grid-cols-2 gap-1">
            {CAPABILITIES.map((c) => (
              <div key={c.label} className="rounded-lg bg-[var(--nv-surface-1)] px-2 py-1.5">
                <div className="flex items-center gap-1 text-[10px] font-medium text-[var(--nv-text-secondary)]">
                  <Icon name={c.icon as any} size={10} className="text-[var(--nv-creative)]" /> {c.label}
                </div>
                <div className="text-[9px] text-[var(--nv-text-muted)] mt-0.5">{c.desc}</div>
              </div>
            ))}
          </div>
          <p className="text-[9px] leading-relaxed text-[var(--nv-text-muted)]">
            {readonlyMode
              ? "当前为只读模式（设置 → Agent 模式）：墨灵只查不改，速度更快。开启「可操作」后可执行填写/修改/生成类动作。"
              : "当前为可操作模式：墨灵可查询并修改角色/词条等数据（设置 → Agent 模式可改为只读提速）。"}
          </p>
        </div>
      )}
    </div>
  );
}
