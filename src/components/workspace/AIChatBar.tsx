/**
 * AIChatBar — Agent 对话面板
 *
 * 纯自然语言驱动。思考过程可视化、可取消、上下文可见。
 * UI 区块已拆分为 ./aichat/* 子组件（AIChatHeader / ChatMessageList /
 * ChatThinking / ChatErrorBar / ChatSuggestions / ChatInput），
 * 本文件保留全部状态、副作用与发送/采纳逻辑，仅做装配。
 */

"use client";
import { describeHttpError } from "@/lib/stream-error";

import { useState, useRef, useEffect, useCallback } from "react";
import { toastError } from "@/components/ui/toast";
import type { AIChatBarProps, AnalysisDiff, MessageItem, PendingStep } from "./aichat/types";
import { AIChatHeader } from "./aichat/AIChatHeader";
import { ChatMessageList } from "./aichat/ChatMessageList";
import { ChatThinking } from "./aichat/ChatThinking";
import { ChatErrorBar } from "./aichat/ChatErrorBar";
import { ChatSuggestions } from "./aichat/ChatSuggestions";
import { ChatInput } from "./aichat/ChatInput";

// ═══════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════

export function AIChatBar({ projectId, chapterContent, selectedText, className = "" }: AIChatBarProps) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingSteps, setPendingSteps] = useState<PendingStep[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [readonlyMode, setReadonlyMode] = useState(() => {
    try { return localStorage.getItem("nf-agent-mode") === "readonly"; } catch { return false; }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 监听 Agent 模式切换（设置页）
  useEffect(() => {
    const onMode = (e: StorageEvent) => { if (e.key === "nf-agent-mode") setReadonlyMode(e.newValue === "readonly"); };
    window.addEventListener("storage", onMode);
    return () => window.removeEventListener("storage", onMode);
  }, []);

  // 思考步骤轮播
  useEffect(() => {
    if (!loading || pendingSteps.length === 0) return;
    const timer = setInterval(() => {
      setStepIdx((i) => (i + 1) % pendingSteps.length);
    }, 1500);
    return () => clearInterval(timer);
  }, [loading, pendingSteps.length]);

  // 自动滚底
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, pendingSteps, loading]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setPendingSteps([]);
    setError("已取消");
  }, []);

  /** 采纳分析建议——更新角色卡 */
  const handleAdoptSuggestion = async (d: AnalysisDiff) => {
    if (!d.characterId) return;
    try {
      const res = await fetch(`/api/characters/${d.characterId}`, { method: "GET" });
      if (!res.ok) { const e = await res.json().catch(() => ({ error: "未知错误" })); const _f = describeHttpError(res.status, e); setError(`采纳失败：${_f.description}`); return; }
      const charData = await res.json();
      const card = charData.character || charData;

      // 根据字段类型构造更新数据
      const updateBody: Record<string, unknown> = {};

      if (d.field === "abilities") {
        const current = Array.isArray(card.abilities) ? card.abilities : [];
        const newAbility = d.suggested.replace(/^[""]|[""]$/g, "").trim();
        if (newAbility && !current.includes(newAbility)) {
          updateBody.abilities = [...current, newAbility];
        }
      } else if (d.field === "aliases") {
        const current = Array.isArray(card.aliases) ? card.aliases : [];
        const newAlias = d.suggested.replace(/^[""]|[""]$/g, "").trim();
        if (newAlias && !current.includes(newAlias)) {
          updateBody.aliases = [...current, newAlias];
        }
      } else if (d.field === "relationships") {
        const current = Array.isArray(card.relationships) ? card.relationships : [];
        // 尝试解析建议的关系
        updateBody.relationships = [...current, {
          targetName: d.suggested,
          relation: "待确认",
          dynamic: "",
        }];
      } else if (d.field === "currentStatus") {
        updateBody.currentStatus = d.suggested;
      } else {
        // 兜底：其他字段直接用 suggested 覆盖
        updateBody[d.field] = d.suggested;
      }

      const putRes = await fetch(`/api/characters/${d.characterId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateBody),
      });

      if (putRes.ok) {
        setError("");
        // 更新本地消息中的分析状态
        setMessages((prev) =>
          prev.map((m) => {
            if (!m.analysis) return m;
            return {
              ...m,
              analysis: {
                ...m.analysis,
                differences: m.analysis.differences.map((dd) =>
                  dd.characterId === d.characterId && dd.field === d.field && dd.suggested === d.suggested
                    ? { ...dd, confidence: -1 } // -1 表示已采纳
                    : dd,
                ),
              },
            };
          }),
        );
      } else {
        const e = await putRes.json().catch(() => ({ error: "未知错误" }));
        { const _f = describeHttpError(putRes.status, e); setError(`采纳失败：${_f.description}`); }
      }
    } catch (err) {
      setError("采纳失败：" + (err instanceof Error ? err.message : "请重试"));
    }
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? message).trim();
    if (!text || loading) return;

    const userMsg: MessageItem = { role: "user", text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setMessage("");
    setLoading(true);
    setError("");
    // 初始思考步骤——体现分叉决策
    setPendingSteps([{ text: "理解意图 → 判断查询路径…", done: false }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let context = "";
      if (selectedText) context += `【选中的正文】\n${selectedText}\n\n`;

      const res = await fetch("/api/generate/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, message: text, context: context || undefined, mode: readonlyMode ? "readonly" : "operate" }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (controller.signal.aborted) return;

      const reply = data.error
        ? `${data.error}`
        : data.reply || "（无回复）";

      // 构建思考步骤列表
      const steps: PendingStep[] = [];
      if (data.toolTrace && data.toolTrace.length > 0) {
        for (const t of data.toolTrace) {
          steps.push({ text: t.summary, done: true });
        }
      }

      // 短暂展示所有步骤，然后替换为最终回复
      setPendingSteps(steps);
      // 短暂延迟让用户看到所有步骤
      await new Promise((r) => setTimeout(r, steps.length > 0 ? Math.min(steps.length * 600, 2000) : 0));

      if (controller.signal.aborted) return;

      setMessages((prev) => [...prev, {
        role: "agent",
        text: reply,
        trace: data.toolTrace || [],
        ts: Date.now(),
      }]);
      setPendingSteps([]);

      // ── 处理前端动作：写后分析 ──
      if (data.frontendActions) {
        for (const action of data.frontendActions) {
          if (action.type === "analyze_chapter" && action.payload?.chapterContent) {
            setPendingSteps([{ text: "正在分析本章，对比角色卡数据…", done: false }]);
            try {
              const analysisRes = await fetch("/api/agent/analyze-chapter", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  projectId,
                  chapterContent: action.payload.chapterContent,
                  nodeTitle: action.payload.nodeTitle,
                }),
                signal: controller.signal,
              });
              const analysisData = await analysisRes.json();
              if (!controller.signal.aborted && analysisData.differences) {
                setMessages((prev) => [...prev, {
                  role: "agent",
                  text: analysisData.differences.length > 0
                    ? `发现 ${analysisData.differences.length} 处角色卡待更新`
                    : analysisData.summary || "未发现需要更新的事项",
                  analysis: analysisData,
                  ts: Date.now(),
                }]);
              }
            } catch { /* 分析失败不影响对话 */ }
            setPendingSteps([]);
          }
          // ── 关系分析动作 ──
          if (action.type === "analyze_relationships") {
            setPendingSteps([{ text: "Agent 正在从正文中提取角色互动关系…", done: false }]);
            try {
              const relRes = await fetch("/api/agent/analyze-relationships", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  projectId,
                  scope: action.payload?.scope || "all",
                }),
                signal: controller.signal,
              });
              const relData = await relRes.json();
              if (!controller.signal.aborted && relData.relations) {
                const relCount = relData.relations.length;
                const staleCount = relData.staleRelations?.length || 0;
                let summary = `从正文中提取到 ${relCount} 对角色互动关系`;
                if (staleCount > 0) summary += `，发现 ${staleCount} 条角色卡过时关系`;
                setMessages((prev) => [...prev, {
                  role: "agent",
                  text: summary + `\n\n${relData.summary || ""}\n\n切换到「查询实体 → 关系图」查看可视化`,
                  trace: [{ tool: "analyze_relationships", args: { scope: action.payload?.scope || "all" }, summary: `关系分析 → ${relCount} 对互动` }],
                  ts: Date.now(),
                }]);
              }
            } catch (err) { if (!(err instanceof Error && err.name === "AbortError")) toastError("关系分析失败：" + (err instanceof Error ? err.message : "请重试")); }
            setPendingSteps([]);
          }
          // ── 关系同步动作 ──
          if (action.type === "relation_sync" && action.payload?.chapterContent) {
            setPendingSteps([{ text: "正在提取角色关系 → 写入世界书…", done: false }]);
            try {
              const syncRes = await fetch("/api/agent/sync-relations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  projectId,
                  chapterContent: action.payload.chapterContent,
                  chapterTitle: action.payload.chapterTitle,
                  autoApply: action.payload.autoApply !== false,
                }),
                signal: controller.signal,
              });
              const syncData = await syncRes.json();
              if (!syncRes.ok) { const _f = describeHttpError(syncRes.status, syncData); throw new Error(_f.description); }
              if (!controller.signal.aborted) {
                const created = syncData.created || 0;
                const updated = syncData.updated || 0;
                let msg = `关系同步完成`;
                if (created > 0) msg += `：新建 ${created} 条`;
                if (updated > 0) msg += `${created > 0 ? "，" : "："}更新 ${updated} 条`;
                if (created === 0 && updated === 0) msg += "：未发现新关系";
                setMessages((prev) => [...prev, {
                  role: "agent",
                  text: msg + `\n\n${syncData.summary || ""}\n\n这些关系条目将在后续生成时自动注入到上下文中`,
                  trace: [{ tool: "relation_sync", args: { nodeId: action.payload.chapterContent?.slice(0, 20) || "" }, summary: `同步关系 → 新建${created} 更新${updated}` }],
                  ts: Date.now(),
                }]);
              }
            } catch (err) { if (!(err instanceof Error && err.name === "AbortError")) toastError("关系同步失败：" + (err instanceof Error ? err.message : "请重试")); }
            setPendingSteps([]);
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleSuggestion = (s: string) => {
    setMessage(s);
    inputRef.current?.focus();
  };

  // 顶部快捷芯片：一键触发常用动作（仅预填 prompt，不新增 AI 逻辑）
  const PRESETS: Array<{ key: string; label: string; prompt: string }> = [
    { key: "continue", label: "续写", prompt: "根据当前章节内容，自然地继续往下写，保持文风与视角一致，不要重复已有内容。" },
    { key: "polish", label: "润色", prompt: "请润色当前章节的文笔，提升描写质感与节奏，不改变剧情走向。" },
    { key: "dialogue", label: "写对话", prompt: "帮我设计一段贴合角色性格、推进剧情的对话。" },
    { key: "check", label: "查漏", prompt: "检查本章是否存在逻辑漏洞、前后矛盾或设定冲突，并列出要点。" },
    { key: "fix", label: "修正", prompt: "指出本章可以修正的问题并给出具体修改建议。" },
    { key: "expand", label: "展开", prompt: "挑选当前章节中值得细写的片段，展开描写，增加细节与画面感。" },
    { key: "deai", label: "去AI味", prompt: "请重写以下选中的段落，去除 AI 生成痕迹（套话、过度对仗、空洞升华），保留原意与节奏，使其读起来更自然、更像人类手写。" },
    { key: "paraSummary", label: "文段概括", prompt: "请用 1-3 句话概括以下选中段落的要点。" },
  ];

  const runPreset = (prompt: string) => {
    if (loading) return;
    handleSend(prompt);
  };

  const hasHistory = messages.length > 0;

  return (
    <div className={`flex flex-col min-h-0 flex-1 ${className}`}>
      <AIChatHeader loading={loading} readonlyMode={readonlyMode} />

      {/* ═══ 快捷芯片条（一键触发常用动作） ═══ */}
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--nv-border-2)] px-3 py-2">
        {PRESETS.map((p) => (
          <button key={p.key} disabled={loading} onClick={() => runPreset(p.prompt)}
            className="rounded-full border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-2.5 py-1 text-[11px] text-[var(--nv-text-secondary)] transition-all hover:border-[var(--nv-primary)] hover:bg-[var(--nv-primary-soft)] hover:text-[var(--nv-primary)] hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            title={p.prompt}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ═══ 对话区 ═══ */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        <ChatMessageList
          messages={messages}
          hasHistory={hasHistory}
          loading={loading}
          onAdoptSuggestion={handleAdoptSuggestion}
        />
        <ChatThinking loading={loading} pendingSteps={pendingSteps} stepIdx={stepIdx} onCancel={handleCancel} />
      </div>

      {/* ═══ 错误提示 ═══ */}
      <ChatErrorBar error={error} onDismiss={() => setError("")} />

      {/* ═══ 建议区 ═══ */}
      {!hasHistory && !loading && (
        <ChatSuggestions onSuggestion={handleSuggestion} />
      )}

      {/* ═══ 输入区 ═══ */}
      <ChatInput
        message={message}
        loading={loading}
        selectedText={selectedText}
        onMessageChange={setMessage}
        onSend={handleSend}
        onCancel={handleCancel}
      />
    </div>
  );
}

export default AIChatBar;
