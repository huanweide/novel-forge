"use client";

import { useState, useEffect, useRef } from "react";
import { Icon, type IconName } from "@/components/ui/icons";

/**
 * 上下文预览面板 —— 展示当前 Prompt 中各区域的 Token 用量
 */
interface ContextData {
  budget: {
    total: number;
    used: number;
    allocations: Record<string, number>;
  };
  breakdown: {
    systemPrompt: { tokens: number; preview: string };
    globalMemory: { tokens: number; preview: string; protagonist: string; toneKeywords: string[] };
    triggeredLore: { tokens: number; count: number; entries: Array<{ title: string; keyword: string; contentPreview: string }> };
    shortTermMemory: { tokens: number; sectionCount: number; sections: Array<{ title: string; wordCount: number }> };
    mediumTermMemory: { tokens: number; summaryCount: number };
    longTermMemory: { tokens: number; beatCount: number };
    authorNote: { tokens: number; content: string };
  };
  activeCharacters: Array<{ id: string; name: string; role: string }>;
  activeCharacterCount: number;
  totalCharacterCount: number;
  activeLoreCount: number;
  totalPromptTokens: number;
  contextWindowSize: number;
  usagePercent: string;
  // 模板注入信息
  templateInjection?: {
    templateId: string;
    templateName: string;
    injectedSections: string[];
    systemPromptTokens: number;
    templateVerification?: {
      templateInjected: boolean;
      forbiddenInjected: boolean;
      systemPromptLength: number;
      templateLabelPos: number;
      forbiddenLabelPos: number;
    };
  };
}

export function ContextPreview({
  projectId,
  nodeId,
  authorNote,
  refreshKey,
}: {
  projectId: string;
  nodeId?: string;
  authorNote?: string;
  refreshKey: number;
}) {
  const [data, setData] = useState<ContextData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!nodeId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);

    const fetchData = async () => {
      try {
      const r = await fetch("/api/generate/preview-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, nodeId, authorNote }),
        signal: controller.signal,
      });
      if (!r.ok) { setLoadError("加载上下文失败（HTTP " + r.status + "）"); setLoading(false); return; }
      const d = await r.json();
      if (!d.error) setData(d);
      else setLoadError(d.error || "加载上下文失败");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error(err);
        setLoadError("加载上下文失败：" + (err instanceof Error ? err.message : "请重试"));
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => { controller.abort(); };
  }, [projectId, nodeId, authorNote, refreshKey]);

  if (!nodeId) {
    return <div className="text-xs text-[var(--nv-text-muted)] p-4">选择大纲节点以预览上下文</div>;
  }

  if (loading) {
    return <div className="text-xs text-[var(--nv-text-muted)] p-4 animate-pulse">分析中...</div>;
  }

  if (loadError) {
    return <div className="text-xs text-danger p-4"><Icon name="alert" size={15} className="inline-block align-text-bottom shrink-0" /> {loadError}</div>;
  }

  if (!data) {
    return <div className="text-xs text-[var(--nv-text-muted)] p-4">无法加载上下文数据</div>;
  }

  const { breakdown, activeCharacters, usagePercent, contextWindowSize } = data;

  const sections = [
    { key: "systemPrompt", label: "系统指令", icon: "bot", data: breakdown.systemPrompt },
    { key: "globalMemory", label: "全局记忆", icon: "brain", data: breakdown.globalMemory },
    { key: "triggeredLore", label: "触发词条", icon: "book", data: breakdown.triggeredLore },
    { key: "shortTermMemory", label: "短期记忆", icon: "file", data: breakdown.shortTermMemory },
    { key: "mediumTermMemory", label: "中期记忆", icon: "package", data: breakdown.mediumTermMemory },
    { key: "longTermMemory", label: "长期记忆", icon: "pin", data: breakdown.longTermMemory },
    { key: "authorNote", label: "作者指令", icon: "pencil", data: breakdown.authorNote },
  ];

  // P_c：usage% 自洽——顶栏总 Token 与 usagePercent 同源（均来自 budget.used / 上下文窗口），
  // 故由 usagePercent 反推，避免「分区块求和(7区)」与百分比分子(全量)口径不一致导致的数字对不上。
  const totalTokens = Math.round((Number(usagePercent) / 100) * contextWindowSize);

  return (
    <div className="space-y-3">
      {/* 总览 */}
      <div className="bg-[var(--nv-surface-3)]/50 rounded-lg p-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-[var(--nv-text-tertiary)]">Prompt Token 用量</span>
          <span className="text-[var(--nv-text-secondary)] font-mono">
            {totalTokens.toLocaleString()} / {contextWindowSize.toLocaleString()}
            <span className={Number(usagePercent) > 80 ? "text-danger" : "text-success"}>
              {" "}({usagePercent}%)
            </span>
          </span>
        </div>
        {/* 进度条 */}
        <div className="h-2 bg-[var(--nv-surface-2)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              Number(usagePercent) > 80 ? "bg-danger" : Number(usagePercent) > 50 ? "bg-warning" : "bg-success"
            }`}
            style={{ width: `${Math.min(Number(usagePercent), 100)}%` }}
          />
        </div>
      </div>

      {/* 文风模板注入状态 */}
      {data.templateInjection && (
        <div className="bg-[var(--nv-primary)]/30 border border-[var(--nv-primary)]/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--nv-primary)]">
              <Icon name="palette" size={15} className="inline-block align-text-bottom shrink-0" /> 文风模板：<b>{data.templateInjection.templateName || "未选择"}</b>
            </span>
            <span className="text-[var(--nv-text-muted)] font-mono text-[10px]">
              {data.templateInjection.systemPromptTokens.toLocaleString()} tokens
            </span>
          </div>
          {data.templateInjection.templateVerification && (
            <div className="flex gap-3 text-[10px]">
              <span className={data.templateInjection.templateVerification.templateInjected ? "text-success" : "text-danger"}>
                {data.templateInjection.templateVerification.templateInjected ? "✅" : "❌"} 风格描述
              </span>
              <span className={data.templateInjection.templateVerification.forbiddenInjected ? "text-success" : "text-danger"}>
                {data.templateInjection.templateVerification.forbiddenInjected ? "✅" : "❌"} 禁用词
              </span>
              <span className="text-[var(--nv-text-muted)]">
                <Icon name="ruler" size={12} className="inline-block align-text-bottom" /> {data.templateInjection.templateVerification.systemPromptLength.toLocaleString()} 字符
              </span>
            </div>
          )}
          {data.templateInjection.injectedSections.length > 0 && (
            <details className="text-[10px]">
              <summary className="text-[var(--nv-text-muted)] cursor-pointer hover:text-[var(--nv-text-tertiary)]">注入详情</summary>
              <div className="mt-1 space-y-0.5 ml-2">
                {data.templateInjection.injectedSections.map((s, i) => (
                  <div key={i} className="text-[var(--nv-text-tertiary)]">{s}</div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* 各区域明细 */}
      {sections.map(({ key, label, icon, data: d }) => (
        <div key={key}>
          <button
            onClick={() => setExpanded(expanded === key ? null : key)}
            className="w-full flex items-center justify-between text-xs py-1 hover:text-[var(--nv-text-secondary)] transition-colors"
          >
            <span>
              <Icon name={icon as IconName} size={12} className="inline-block align-text-bottom shrink-0" /> {label}
            </span>
            <span className="text-[var(--nv-text-muted)] font-mono">{d.tokens.toLocaleString()} tokens</span>
          </button>

          {expanded === key && (
            <div className="ml-4 mt-1 text-xs text-[var(--nv-text-muted)] space-y-1 border-l border-[var(--nv-border-2)] pl-3">
              {key === "systemPrompt" && <div>{(d as any).preview}...</div>}
              {key === "globalMemory" && (
                <>
                  <div>主角：{(d as any).protagonist || "无"}</div>
                  <div>基调：{(d as any).toneKeywords?.join("、") || "未设定"}</div>
                </>
              )}
              {key === "triggeredLore" && (
                <>
                  <div>{(d as any).count} 条触发词条</div>
                  {(d as any).entries?.map((e: any, i: number) => (
                    <div key={i} className="text-[var(--nv-text-muted)]">
                      [{e.keyword}] → {e.title}: {e.contentPreview}
                    </div>
                  ))}
                </>
              )}
              {key === "shortTermMemory" && (
                <>
                  <div>{(d as any).sectionCount} 个小节</div>
                  {(d as any).sections?.map((s: any, i: number) => (
                    <div key={i}>{s.title} ({s.wordCount}字)</div>
                  ))}
                </>
              )}
              {key === "mediumTermMemory" && <div>{(d as any).summaryCount} 章摘要</div>}
              {key === "longTermMemory" && <div>{(d as any).beatCount} 个转折点</div>}
              {key === "authorNote" && (d as any).content !== "无" && <div>{(d as any).content}</div>}
            </div>
          )}
        </div>
      ))}

      {/* 角色读取统计 */}
      <div className="border-t border-[var(--nv-border-2)] pt-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--nv-text-muted)]"><Icon name="chart" size={15} className="inline-block align-text-bottom shrink-0" /> 角色卡读取</span>
          <span className="font-mono">
            <b className="text-[var(--nv-primary)]">{data.activeCharacterCount ?? activeCharacters.length}</b>
            <span className="text-[var(--nv-text-muted)]">/{data.totalCharacterCount ?? "?"}</span>
            <span className="text-[var(--nv-text-muted)]"> 张</span>
          </span>
        </div>
        {/* 小进度条 */}
        <div className="h-1 bg-[var(--nv-surface-2)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--nv-primary)] rounded-full transition-all"
            style={{ width: `${(data.totalCharacterCount ?? 1) > 0 ? ((data.activeCharacterCount ?? activeCharacters.length) / (data.totalCharacterCount ?? 1) * 100) : 0}%` }}
          />
        </div>
        {/* 角色名标签——可折叠 */}
        {activeCharacters.length > 0 && (
          <details className="text-xs">
            <summary className="text-[var(--nv-text-muted)] cursor-pointer hover:text-[var(--nv-text-tertiary)]">出场角色</summary>
            <div className="flex flex-wrap gap-1 mt-1">
              {activeCharacters.map((c) => (
                <span
                  key={c.id}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    c.role === "protagonist"
                      ? "bg-warning/50 text-warning"
                      : c.role === "antagonist"
                      ? "bg-danger/50 text-danger"
                      : "bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)]"
                  }`}
                >
                  {c.name}
                </span>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
