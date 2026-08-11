"use client";

import { useState, useEffect, useRef } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { toastSuccess, toastError, toastInfo } from "@/components/ui/toast";

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
  recallMemories = [],
  isGenerating = false,
}: {
  projectId: string;
  nodeId?: string;
  authorNote?: string;
  refreshKey: number;
  /** F3 宝宝流记忆召回（来自 SSE babylore_recall），合并入本单组件，生成时自动展开 */
  recallMemories?: any[];
  /** 生成进行中：自动展开召回段，满足「生成时展开、平时收起」 */
  isGenerating?: boolean;
}) {
  const [data, setData] = useState<ContextData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // P1-3：F3 宝宝流记忆召回合并入本组件——生成时（或已有召回）自动展开，平时收起
  const [recallExpanded, setRecallExpanded] = useState(false);
  useEffect(() => {
    if (isGenerating || recallMemories.length > 0) setRecallExpanded(true);
  }, [isGenerating, recallMemories]);

  // #221 重新摘要 + 摘要确认
  const [reloadTick, setReloadTick] = useState(0);
  const [summarizing, setSummarizing] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState<{
    summary?: string;
    keyEvents?: string[];
    characterStates?: unknown;
    closingSnapshot?: unknown;
    characterImpulses?: unknown;
    eventImportances?: unknown;
  } | null>(null);
  const [editedSummary, setEditedSummary] = useState("");

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
  }, [projectId, nodeId, authorNote, refreshKey, reloadTick]);

  // #221 重新摘要：preview 生成摘要，不落库，弹确认模态
  const handleResummarize = async () => {
    if (!nodeId || !projectId) return;
    setSummarizing(true);
    try {
      const res = await fetch("/api/generate/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, chapterId: nodeId, preview: true }),
      });
      const d = await res.json();
      if (!res.ok) {
        toastInfo(d?.error || "无法生成摘要预览");
        return;
      }
      setSummaryDraft(d);
      setEditedSummary(d.summary ?? "");
      setExpanded("mediumTermMemory");
    } catch (err) {
      toastError("摘要预览失败：" + (err instanceof Error ? err.message : "请重试"));
    } finally {
      setSummarizing(false);
    }
  };

  // #221 摘要确认：将已确认/编辑的摘要 upsert 落库，不重跑 LLM
  const handleConfirmSummary = async () => {
    if (!summaryDraft || !nodeId || !projectId) return;
    setSavingSummary(true);
    try {
      const res = await fetch("/api/generate/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          chapterId: nodeId,
          summary: editedSummary,
          keyEvents: summaryDraft.keyEvents ?? [],
          characterStates: summaryDraft.characterStates,
          closingSnapshot: summaryDraft.closingSnapshot,
          characterImpulses: summaryDraft.characterImpulses,
          eventImportances: summaryDraft.eventImportances,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toastError(d?.error || "保存摘要失败");
        return;
      }
      toastSuccess("摘要已保存至中期记忆");
      setSummaryDraft(null);
      setReloadTick((t) => t + 1);
    } catch (err) {
      toastError("保存摘要失败：" + (err instanceof Error ? err.message : "请重试"));
    } finally {
      setSavingSummary(false);
    }
  };

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

  // P1-3：F2 上下文监控 + F3 宝宝流召回 → 合并为单一「记忆透出」组件
  const recallSection = recallMemories.length > 0 ? (
    <div className="bg-[var(--nv-primary)]/10 border border-[var(--nv-primary)]/30 rounded-lg p-3">
      <button
        onClick={() => setRecallExpanded(!recallExpanded)}
        className="flex items-center justify-between w-full text-xs transition-colors hover:text-[var(--nv-text-secondary)]"
      >
        <span className="text-[var(--nv-primary)] font-medium">
          <Icon name="brain" size={13} className="inline-block align-text-bottom shrink-0" /> 宝宝流记忆召回（已注入本轮写作）· {recallMemories.length} 条
        </span>
        <span className="text-[var(--nv-text-muted)]">{recallExpanded ? "▾" : "▸"}</span>
      </button>
      {recallExpanded && (
        <ul className="mt-2 space-y-2.5">
          {recallMemories.map((m, i) => (
            <li key={i} className="text-xs">
              <span className="text-[var(--nv-primary)] font-medium">{m.source === "lorebook" ? "世界书" : "结构化表格"}｜{m.title}</span>
              <p className="text-[var(--nv-text-tertiary)] mt-1 whitespace-pre-wrap leading-relaxed">{m.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : null;

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

      {/* P1-3：合并后的记忆透出（F3 召回） */}
      {recallSection}

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
      {sections.map(({ key, label, icon, data: d }) =>
        key === "mediumTermMemory" ? (
          // 中期记忆单独渲染：展开开关 + 「重新摘要」按钮（兄弟节点，不嵌套在展开 button 内，避免 hydration 错误）
          <div key={key}>
            <div className="flex items-center justify-between text-xs py-1">
              <button
                onClick={() => setExpanded(expanded === key ? null : key)}
                className="flex items-center hover:text-[var(--nv-text-secondary)] transition-colors"
              >
                <Icon name={icon as IconName} size={12} className="inline-block align-text-bottom shrink-0" /> {label}
              </button>
              <div className="flex items-center gap-2">
                <span className="text-[var(--nv-text-muted)] font-mono">{d.tokens.toLocaleString()} tokens</span>
                <button
                  onClick={handleResummarize}
                  disabled={summarizing}
                  className="flex items-center gap-1 text-[var(--nv-primary)] hover:text-[var(--nv-text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="用当前章节正文重新生成摘要（生成后可确认/编辑再保存）"
                >
                  <Icon name="refresh" size={12} className={summarizing ? "inline-block align-text-bottom shrink-0 animate-spin" : "inline-block align-text-bottom shrink-0"} />
                  {summarizing ? "生成中" : "重新摘要"}
                </button>
              </div>
            </div>
            {expanded === key && (
              <div className="ml-4 mt-1 text-xs text-[var(--nv-text-muted)] border-l border-[var(--nv-border-2)] pl-3">
                {(d as any).summaryCount} 章摘要
                {(d as any).summaryCount > 0 && (
                  <span className="ml-2 text-[var(--nv-text-muted)]">点「重新摘要」可基于当前正文刷新</span>
                )}
              </div>
            )}
          </div>
        ) : (
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
                {key === "longTermMemory" && <div>{(d as any).beatCount} 个转折点</div>}
                {key === "authorNote" && (d as any).content !== "无" && <div>{(d as any).content}</div>}
              </div>
            )}
          </div>
        )
      )}

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

      {/* 摘要确认模态：重新摘要后预览/编辑，确认才落库 */}
      <Modal
        open={!!summaryDraft}
        onClose={() => setSummaryDraft(null)}
        title="摘要确认"
        icon="brain"
        size="2xl"
        footer={
          <ModalFooter>
            <button onClick={() => setSummaryDraft(null)} className="btn-ghost" disabled={savingSummary}>取消</button>
            <button onClick={handleConfirmSummary} className="btn-creative" disabled={savingSummary || !editedSummary.trim()}>
              {savingSummary ? "保存中..." : "确认保存"}
            </button>
          </ModalFooter>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-[var(--nv-text-muted)]">章节摘要（可编辑后保存）</label>
            <textarea
              value={editedSummary}
              onChange={(e) => setEditedSummary(e.target.value)}
              rows={6}
              className="w-full mt-1 rounded-lg bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] p-2 text-sm text-[var(--nv-text-secondary)] focus:outline-none focus:border-[var(--nv-primary)] resize-y"
            />
          </div>
          {summaryDraft?.keyEvents && summaryDraft.keyEvents.length > 0 && (
            <div>
              <div className="text-xs text-[var(--nv-text-muted)] mb-1">关键事件</div>
              <ul className="list-disc list-inside text-sm text-[var(--nv-text-secondary)] space-y-0.5">
                {summaryDraft.keyEvents.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {summaryDraft?.characterStates != null && (
            <div>
              <div className="text-xs text-[var(--nv-text-muted)] mb-1">角色状态快照</div>
              <pre className="text-xs text-[var(--nv-text-tertiary)] whitespace-pre-wrap bg-[var(--nv-surface-2)] rounded-lg p-2 max-h-40 overflow-auto">
                {typeof summaryDraft.characterStates === "string"
                  ? summaryDraft.characterStates
                  : JSON.stringify(summaryDraft.characterStates, null, 2)}
              </pre>
            </div>
          )}
          <p className="text-[10px] text-[var(--nv-text-muted)]">确认保存后，摘要将写入中期记忆并替换本章原有摘要，供后续章节上下文引用。</p>
        </div>
      </Modal>
    </div>
  );
}
