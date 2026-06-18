/**
 * AIChatBar — Agent 对话面板
 *
 * 纯自然语言驱动。思考过程可视化、可取消、上下文可见。
 */

"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/icons";

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

interface AIChatBarProps {
  projectId: string;
  chapterContent?: string;
  selectedText?: string;
  className?: string;
}

interface AnalysisDiff {
  characterName: string;
  characterId: string;
  field: string;
  current: string;
  suggested: string;
  evidence: string;
  confidence: number;
}

interface MessageItem {
  role: "user" | "agent";
  text: string;
  trace?: Array<{ tool: string; args: Record<string, unknown>; summary: string }>;
  /** 写后分析结果 */
  analysis?: { differences: AnalysisDiff[]; summary: string };
  ts: number;
}

interface PendingStep {
  text: string;
  done: boolean;
}

const SUGGESTIONS = [
  "列出所有角色",
  "角色最强的是谁",
  "创建一个反派角色",
  "查看大纲结构",
  "分析本章",
];

/** 字段英文 → 中文 */
function fieldLabel(field: string): string {
  const map: Record<string, string> = {
    abilities: "能力",
    personality: "性格",
    relationships: "关系",
    aliases: "别名",
    currentStatus: "状态",
    appearance: "外貌",
    background: "背景",
    hiddenMotives: "隐藏动机",
    arcProgress: "弧光",
  };
  return map[field] || field;
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      }
    } catch {
      setError("采纳失败，请重试");
    }
  };

  const handleSend = async () => {
    const text = message.trim();
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
        body: JSON.stringify({ projectId, message: text, context: context || undefined }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (controller.signal.aborted) return;

      const reply = data.error
        ? `❌ ${data.error}`
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
                  text: summary + `\n\n${relData.summary || ""}\n\n💡 切换到「查询实体 → 关系图」查看可视化`,
                  trace: [{ tool: "analyze_relationships", args: { scope: action.payload?.scope || "all" }, summary: `关系分析 → ${relCount} 对互动` }],
                  ts: Date.now(),
                }]);
              }
            } catch { /* 分析失败不影响对话 */ }
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
              if (!controller.signal.aborted) {
                const created = syncData.created || 0;
                const updated = syncData.updated || 0;
                let msg = `关系同步完成`;
                if (created > 0) msg += `：新建 ${created} 条`;
                if (updated > 0) msg += `${created > 0 ? "，" : "："}更新 ${updated} 条`;
                if (created === 0 && updated === 0) msg += "：未发现新关系";
                setMessages((prev) => [...prev, {
                  role: "agent",
                  text: msg + `\n\n${syncData.summary || ""}\n\n💡 这些关系条目将在后续生成时自动注入到上下文中`,
                  trace: [{ tool: "relation_sync", args: { nodeId: action.payload.chapterContent?.slice(0, 20) || "" }, summary: `同步关系 → 新建${created} 更新${updated}` }],
                  ts: Date.now(),
                }]);
              }
            } catch { /* 同步失败不影响对话 */ }
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (s: string) => {
    setMessage(s);
    inputRef.current?.focus();
  };

  const hasHistory = messages.length > 0;

  return (
    <div className={`flex flex-col min-h-0 flex-1 ${className}`}>
      {/* ═══ Agent 标识头 ═══ */}
      <div className="shrink-0 px-3 py-2 border-b border-white/[0.06] bg-gradient-to-r from-indigo-950/50 via-zinc-900 to-zinc-900">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className={`w-2 h-2 rounded-full ${loading ? "bg-amber-400" : "bg-emerald-400"}`} />
            <div className={`absolute inset-0 w-2 h-2 rounded-full opacity-40 ${loading ? "bg-amber-400 animate-ping" : "bg-emerald-400 animate-ping"}`} />
          </div>
          <span className="text-xs font-medium text-zinc-200">AI 写作助手</span>
          <span className="text-[10px] text-zinc-600 ml-auto">Agent v2</span>
        </div>
        <div className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
          角色卡·世界书·大纲·伏笔·故事线·规则·风格
        </div>
      </div>

      {/* ═══ 对话区 ═══ */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {/* 空状态 */}
        {!hasHistory && !loading && (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <div className="mb-3"><Icon name="bot" size={32} className="text-zinc-600" /></div>
            <div className="text-xs text-zinc-400 font-medium mb-1">AI 写作助手就绪</div>
            <div className="text-[10px] text-zinc-600 leading-relaxed max-w-[220px]">
              我能直接查角色卡、世界书、大纲来回答你——不猜正文，只看数据
            </div>
          </div>
        )}

        {/* 消息列表 */}
        {messages.map((msg, i) => (
          <div key={i} className={`px-3 py-2.5 border-b border-white/[0.06]/30 ${msg.role === "user" ? "bg-white/[0.02] backdrop-blur-sm" : "bg-zinc-900/20"}`}>
            <div className="flex items-start gap-2">
              <span className="shrink-0 mt-0.5">{msg.role === "user" ? <Icon name="user" size={13} /> : <Icon name="bot" size={13} />}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-medium text-zinc-500">
                    {msg.role === "user" ? "你" : "AI 助手"}
                  </span>
                  {msg.trace && msg.trace.length > 0 && (
                    <span className="text-[10px] text-zinc-600">
                      (调了 {msg.trace.length} 次工具)
                    </span>
                  )}
                </div>
                {/* 思考步骤折叠 */}
                {msg.trace && msg.trace.length > 0 && (
                  <details className="mb-1">
                    <summary className="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-400">
                      查看思考过程
                    </summary>
                    <div className="mt-1 space-y-0.5 pl-2 border-l border-white/[0.08]/50">
                      {msg.trace.map((t, j) => (
                        <div key={j} className="text-[10px] text-zinc-500 flex items-center gap-1">
                          <span className="text-zinc-600">└</span>
                          {t.summary}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {/* 写后分析结果 */}
                {msg.analysis && msg.analysis.differences && msg.analysis.differences.length > 0 && (
                  <details className="mb-1" open>
                    <summary className="text-[10px] text-amber-400 cursor-pointer hover:text-amber-300 font-medium">
                      <span className="flex items-center gap-1"><Icon name="clipboard" size={13} /> 角色卡更新建议（{msg.analysis.differences.length} 项）</span>
                    </summary>
                    <div className="mt-1.5 space-y-1.5 pl-2 border-l border-amber-700/30">
                      {msg.analysis.differences.map((d, j) => (
                        <div key={j} className="text-[10px] bg-zinc-800/40 rounded p-1.5">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-zinc-200 font-medium">{d.characterName}</span>
                            <span className="text-zinc-500">·</span>
                            <span className="text-amber-400">{fieldLabel(d.field)}</span>
                            <span className="ml-auto text-zinc-600">{Math.round(d.confidence * 100)}%</span>
                          </div>
                          {d.evidence && (
                            <div className="text-zinc-500 mb-0.5 leading-relaxed">
                              <span className="flex items-center gap-1"><Icon name="bookmarked" size={12} /> 「{d.evidence.slice(0, 80)}{d.evidence.length > 80 ? "…" : ""}」</span>
                            </div>
                          )}
                          <div className="text-zinc-400 mb-1 flex items-start gap-1">
                            <Icon name="lightbulb" size={12} className="shrink-0 mt-0.5" /> 建议：{d.suggested}
                          </div>
                          <button
                            onClick={() => d.confidence > 0 ? handleAdoptSuggestion(d) : null}
                            disabled={d.confidence < 0}
                            className={`text-[9px] px-2 py-0.5 rounded transition-colors ${
                              d.confidence < 0
                                ? "bg-zinc-800/50 text-zinc-600 cursor-default"
                                : "bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/50"
                            }`}
                          >
                            {d.confidence < 0 ? "已采纳 ✓" : "采纳"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {msg.analysis && msg.analysis.differences && msg.analysis.differences.length === 0 && (
                  <div className="text-[10px] text-zinc-500 mb-1">{msg.analysis.summary}</div>
                )}
                <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
                  {msg.text}
                </pre>
              </div>
            </div>
          </div>
        ))}

        {/* 思考动画——实时展示工具调用 */}
        {loading && pendingSteps.length > 0 && (
          <div className="px-3 py-3 border-b border-white/[0.06]/30 bg-indigo-950/10">
            <div className="flex items-center gap-3 mb-2">
              <div className="relative w-5 h-5 shrink-0">
                <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-400 animate-spin" />
              </div>
              <span className="text-xs text-indigo-300 font-medium">正在思考</span>
              <button
                onClick={handleCancel}
                className="ml-auto text-[10px] px-2 py-0.5 rounded border border-red-800/50 text-red-400 hover:bg-red-950/30 transition-colors"
              >
                取消
              </button>
            </div>
            {/* 步骤列表 */}
            <div className="space-y-1">
              {pendingSteps.map((step, i) => (
                <div
                  key={i}
                  className={`text-[10px] flex items-center gap-1.5 transition-opacity duration-300 ${
                    i === stepIdx && pendingSteps.length > 1 ? "text-indigo-300 font-medium" : "text-zinc-500"
                  }`}
                >
                  <span className={step.done ? "text-emerald-500" : (i === stepIdx ? "text-indigo-400 animate-pulse" : "text-zinc-700")}>
                    {step.done ? "✓" : "⟳"}
                  </span>
                  {step.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 加载中但还没步骤 */}
        {loading && pendingSteps.length === 0 && (
          <div className="px-3 py-3 border-b border-white/[0.06]/30 bg-indigo-950/10">
            <div className="flex items-center gap-3">
              <div className="relative w-5 h-5 shrink-0">
                <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-400 animate-spin" />
              </div>
              <span className="text-xs text-indigo-300">正在思考…</span>
              <button
                onClick={handleCancel}
                className="ml-auto text-[10px] px-2 py-0.5 rounded border border-red-800/50 text-red-400 hover:bg-red-950/30 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 错误提示 ═══ */}
      {error && (
        <div className="px-3 py-1.5 text-[10px] text-red-400 bg-red-950/20 border-t border-red-900/30 shrink-0">
          ⚠️ {error}
          <button onClick={() => setError("")} className="ml-2 text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
      )}

      {/* ═══ 建议区 ═══ */}
      {!hasHistory && !loading && (
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto text-[10px] text-zinc-500 border-t border-white/[0.06]/30 shrink-0">
          <span className="text-zinc-600 shrink-0">试试：</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="shrink-0 px-2 py-0.5 rounded-full border border-white/[0.06] hover:border-indigo-700 hover:text-indigo-300 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* ═══ 输入区 ═══ */}
      <div className="shrink-0 border-t border-white/[0.06] bg-zinc-950/80">
        <div className="flex items-center gap-2 px-3 py-2.5">
          {selectedText && (
            <span className="text-[10px] text-indigo-400 bg-indigo-950/40 px-2 py-0.5 rounded shrink-0 max-w-[140px] truncate" title={selectedText}>
              ✂️ {selectedText.slice(0, 25)}…
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="说说你想做什么…"
            className="flex-1 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 outline-none"
            disabled={loading}
          />
          {loading ? (
            <button
              onClick={handleCancel}
              className="shrink-0 px-2 py-1 rounded text-[10px] font-medium border border-red-800/50 text-red-400 hover:bg-red-950/30 transition-colors"
            >
              停止
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!message.trim()}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/[0.04] disabled:text-zinc-600 text-white transition-all"
              title="发送"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AIChatBar;
