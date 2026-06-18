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
    <>
      {/* ── 步骤导航 ── */}
      <nav className="border-b border-white/[0.06] px-3 py-2 flex items-center gap-1 overflow-x-auto shrink-0 bg-zinc-950/80 backdrop-blur-sm">
        {EXPLORE_STEPS.map((step) => {
          const active = currentStep === step;
          return (
            <button
              key={step}
              onClick={() => onStepChange(step)}
              className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition-all duration-200 ${
                active
                  ? "bg-indigo-500/20 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.15)] border border-indigo-400/30"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent"
              } active:scale-95`}
            >
              {STEP_ICONS[step]} {STEP_LABELS[step]}
            </button>
          );
        })}
      </nav>

      {/* ── 对话列表 ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed transition-all duration-200 ${
                msg.role === "user"
                  ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-br-md shadow-lg shadow-indigo-500/10"
                  : "bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] text-zinc-300 rounded-bl-md hover:border-white/[0.1]"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {/* 候选卡片 */}
              {msg.cards && msg.cards.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-purple-400/60" />
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
                            ? "bg-emerald-500/[0.06] border-emerald-500/20 opacity-60"
                            : "bg-white/[0.03] border-white/[0.08] hover:border-indigo-400/30 hover:bg-white/[0.05] hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-semibold text-zinc-200">
                            {card.title}
                          </span>
                          {status === "writing" && (
                            <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full animate-pulse">
                              写入中
                            </span>
                          )}
                          {status?.startsWith("✅") && (
                            <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
                              {status}
                            </span>
                          )}
                          {status === "❌失败" && (
                            <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                              失败
                            </span>
                          )}
                          {adopted && !status && (
                            <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
                              已采纳
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-relaxed">
                          {card.content}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] text-zinc-500 px-4 py-3 rounded-2xl rounded-bl-md text-sm">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse delay-150" />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse delay-300" />
              </span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ── 输入区 ── */}
      <div className="border-t border-white/[0.06] px-4 py-3 shrink-0 bg-zinc-950/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          {/* 模式切换 */}
          <div className="flex items-center gap-0.5 bg-white/[0.03] rounded-xl p-0.5 border border-white/[0.06]">
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
                      ? "bg-white/[0.08] text-zinc-200 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-400"
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
            className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-400/40 focus:ring-2 focus:ring-indigo-500/10 disabled:opacity-40 transition-all duration-200"
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2.5 bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-xl text-sm font-medium hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-40 transition-all duration-200 active:scale-95 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30"
          >
            发送
          </button>
        </div>
      </div>
    </>
  );
}
