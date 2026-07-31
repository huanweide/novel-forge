"use client";

import { useRef, useEffect } from "react";
import type { ExploreMessage, ExploreStep, AdoptCard } from "@/core/explore/types";
import { EXPLORE_STEPS, STEP_LABELS, STEP_ICONS } from "@/core/explore/types";
import { Icon } from "@/components/ui/icons";

interface Props {
  messages: ExploreMessage[];
  loading: boolean;
  mode: "chat" | "cards" | "outline";
  currentStep: ExploreStep;
  adoptStatus: Record<string, string>;
  onSend: (text: string) => void;
  onStepChange: (step: ExploreStep) => void;
  onModeChange: (mode: "chat" | "cards" | "outline") => void;
  onAdoptCard: (card: AdoptCard) => void;
}

export function ChatPanel({
  messages,
  loading,
  mode,
  currentStep,
  adoptStatus,
  onSend,
  onStepChange,
  onModeChange,
  onAdoptCard,
}: Props) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = () => {
    const input = inputRef.current;
    if (!input || !input.value.trim() || loading) return;
    onSend(input.value);
    input.value = "";
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* ── 步骤导航 ── */}
      <nav className="border-b border-[var(--nv-border-2)] px-3 py-2 flex items-center gap-1 overflow-x-auto shrink-0 bg-[var(--nv-void)]/80 backdrop-blur-sm">
        {EXPLORE_STEPS.map((step) => {
          const active = currentStep === step;
          return (
            <button
              key={step}
              onClick={() => onStepChange(step)}
              className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition-all duration-200 ${
                active
                  ? "bg-[var(--nv-primary)]/20 text-[var(--nv-primary)] shadow-[0_0_12px_rgba(99,102,241,0.15)] border border-[var(--nv-primary)]/30"
                  : "text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] border border-transparent"
              } active:scale-95`}
            >
              {STEP_ICONS[step]} {STEP_LABELS[step]}
            </button>
          );
        })}
      </nav>

      {/* ── 探讨服务状态条 ── */}
      <div className="px-4 py-2.5 flex items-center gap-2.5 border-b border-[var(--nv-border-2)] bg-gradient-to-r from-[var(--nv-creative-soft)]/40 via-transparent to-transparent">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--nv-creative)] opacity-60 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--nv-creative)]" />
        </span>
        <span className="text-xs text-[var(--nv-text-secondary)] font-medium">
          AI 创作顾问正在协助你构建小说世界
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--nv-creative)]/15 text-[var(--nv-creative)] border border-[var(--nv-creative)]/25">
          当前 · {STEP_LABELS[currentStep]}
        </span>
      </div>

      {/* ── 对话列表 ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={i}
              className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}
              style={{ animation: "nf-bubble-in 0.3s var(--ease-spring) both" }}
            >
              {/* 头像 */}
              {!isUser && (
                <div className="w-7 h-7 rounded-full bg-[var(--nv-creative)]/15 border border-[var(--nv-creative)]/30 flex items-center justify-center shrink-0 mb-1">
                  <Icon name="bot" size={14} className="text-[var(--nv-creative)]" />
                </div>
              )}
              <div className="flex flex-col max-w-[72%]">
                <span className={`text-[9px] mb-1 ${isUser ? "text-right text-[var(--nv-text-muted)]" : "text-[var(--nv-text-muted)]"}`}>
                  {isUser ? "你" : "AI 创作顾问"}
                </span>
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed transition-all duration-200 ${
                    isUser
                      ? "bg-gradient-to-br from-[var(--nv-primary)] to-[var(--nv-primary)] text-[var(--nv-text-primary)] rounded-br-md shadow-lg shadow-[var(--nv-primary)]/10"
                      : "bg-[var(--nv-surface-2)] backdrop-blur-sm border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] rounded-bl-md"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* 候选卡片 */}
                  {msg.cards && msg.cards.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="text-[10px] text-[var(--nv-text-muted)] mb-1 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-[var(--nv-creative)]/60" />
                        点击卡片即可采纳
                      </div>
                      {msg.cards.map((card) => {
                        const status = adoptStatus[card.id];
                        const adopted = card.adopted || status?.startsWith("✅");
                        return (
                          <button
                            key={card.id}
                            onClick={() => !adopted && onAdoptCard(card)}
                            disabled={adopted}
                            className={`w-full text-left p-3 rounded-xl border transition-all duration-200 group ${
                              adopted
                                ? "bg-[var(--nv-success)]/[0.08] border-[var(--nv-success)]/30 animate-[nf-adopt-flash_0.6s_ease-out]"
                                : "bg-[var(--nv-surface-2)] border-[var(--nv-border-2)] hover:border-[var(--nv-creative)]/30 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xs font-semibold text-[var(--nv-text-secondary)]">
                                {card.title}
                              </span>
                              {status === "writing" && (
                                <span className="text-[9px] bg-[var(--nv-warning)]/20 text-[var(--nv-warning)] px-1.5 py-0.5 rounded-full animate-pulse">
                                  写入中
                                </span>
                              )}
                              {status?.startsWith("✅") && (
                                <span className="text-[9px] bg-[var(--nv-success)]/20 text-[var(--nv-success)] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                  <Icon name="check" size={9} /> 已采纳
                                </span>
                              )}
                              {status === "❌失败" && (
                                <span className="text-[9px] bg-[var(--nv-danger)]/20 text-[var(--nv-danger)] px-1.5 py-0.5 rounded-full">
                                  失败
                                </span>
                              )}
                              {adopted && !status && (
                                <span className="text-[9px] bg-[var(--nv-success)]/20 text-[var(--nv-success)] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                  <Icon name="check" size={9} /> 已采纳
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[var(--nv-text-tertiary)] leading-relaxed">
                              {card.content}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              {isUser && (
                <div className="w-7 h-7 rounded-full bg-[var(--nv-primary)]/15 border border-[var(--nv-primary)]/30 flex items-center justify-center shrink-0 mb-1">
                  <Icon name="user" size={14} className="text-[var(--nv-primary)]" />
                </div>
              )}
            </div>
          );
        })}
        {loading && (
          <div className="flex items-end gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-[var(--nv-creative)]/15 border border-[var(--nv-creative)]/30 flex items-center justify-center shrink-0 mb-1">
              <Icon name="bot" size={14} className="text-[var(--nv-creative)]" />
            </div>
            <div className="bg-[var(--nv-surface-2)] backdrop-blur-sm border border-[var(--nv-border-2)] text-[var(--nv-text-muted)] px-4 py-3 rounded-2xl rounded-bl-md text-sm">
              <span className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-[var(--nv-creative)] rounded-full animate-pulse" />
                  <span className="w-1.5 h-1.5 bg-[var(--nv-creative)] rounded-full animate-pulse delay-150" />
                  <span className="w-1.5 h-1.5 bg-[var(--nv-creative)] rounded-full animate-pulse delay-300" />
                </span>
                <span className="text-[11px]">AI 正在思考「{STEP_LABELS[currentStep]}」…</span>
              </span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ── 输入区 ── */}
      <div className="border-t border-[var(--nv-border-2)] px-4 py-3 shrink-0 bg-[var(--nv-void)]/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          {/* 模式切换 */}
          <div className="flex items-center gap-0.5 bg-[var(--nv-surface-2)] rounded-xl p-0.5 border border-[var(--nv-border-2)]">
            {(["chat", "cards", "outline"] as const).map((m) => {
              const active = mode === m;
              const labels: Record<string, React.ReactNode> = { chat: <Icon name="message" size={13} />, cards: <Icon name="grid" size={13} />, outline: <Icon name="clipboard" size={13} /> };
              const titles = { chat: "对话", cards: "抽卡", outline: "大纲" };
              return (
                <button
                  key={m}
                  onClick={() => onModeChange(m)}
                  title={titles[m]}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all duration-200 ${
                    active
                      ? "bg-[var(--nv-surface-3)] text-[var(--nv-text-secondary)] shadow-sm"
                      : "text-[var(--nv-text-muted)] hover:text-[var(--nv-text-tertiary)]"
                  } active:scale-95`}
                >
                  {labels[m]}
                </button>
              );
            })}
          </div>
          <input
            ref={inputRef}
            type="text"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              mode === "cards"
                ? "输入需求，AI给出候选方案..."
                : `说说你的想法（当前：${STEP_LABELS[currentStep]}）...`
            }
            disabled={loading}
            className="flex-1 bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded-xl px-4 py-2.5 text-sm text-[var(--nv-text-secondary)] placeholder:text-[var(--nv-text-muted)] focus:outline-none focus:border-[var(--nv-primary)]/40 focus:ring-2 focus:ring-[var(--nv-primary)]/10 disabled:opacity-40 transition-all duration-200"
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2.5 bg-gradient-to-br from-[var(--nv-primary)] to-[var(--nv-primary)] text-[var(--nv-text-primary)] rounded-xl text-sm font-medium hover:from-[var(--nv-primary)] hover:to-[var(--nv-primary)] disabled:opacity-40 transition-all duration-200 active:scale-95 shadow-lg shadow-[var(--nv-primary)]/20 hover:shadow-[var(--nv-primary)]/30"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
