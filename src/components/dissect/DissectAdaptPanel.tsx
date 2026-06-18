"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import type { DimensionResult } from "@/core/dissect/types";

interface Message {
  role: "user" | "agent";
  content: string;
}

interface DissectAdaptPanelProps {
  taskId: string;
  dimensions: Record<string, DimensionResult>;
  onApplyAndCreate: (modifications: string) => void;
  creating?: boolean;
}

export function DissectAdaptPanel({
  taskId,
  dimensions,
  onApplyAndCreate,
  creating,
}: DissectAdaptPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "agent",
      content:
        "我已读完拆书结果。告诉我你想怎么改编——改角色、换世界观、调整设定、还是全部推翻重来？直接说就行。",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [modifications, setModifications] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // 用拆书专用对话端点——不依赖 projectId，纯 LLM 对话
      const res = await fetch(`/api/dissect/${taskId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Agent 响应失败 (${res.status})`);
      }

      const data = await res.json();
      const reply = data.reply || "收到。继续说说你的想法？";

      setMessages((prev) => [...prev, { role: "agent", content: reply }]);

      // 累积修改要求
      setModifications((prev) => {
        const sep = prev ? "\n---\n" : "";
        return `${prev}${sep}用户要求: ${text}\nAgent方案: ${reply.slice(0, 300)}`;
      });
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: `出错了：${err.message}。重试一下？` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    const finalMod =
      modifications ||
      messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("; ");
    onApplyAndCreate(finalMod);
  }

  return (
    <div className="flex flex-col" style={{ minHeight: "60vh" }}>
      {/* 聊天区 */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4" style={{ maxHeight: "50vh" }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-xl text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-zinc-800 text-zinc-300 rounded-bl-sm"
              }`}
            >
              {msg.role === "agent" ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 text-zinc-500 px-4 py-2.5 rounded-xl rounded-bl-sm text-sm">
              <span className="animate-pulse">思考中...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* 输入区 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="说说你想怎么改..."
          disabled={loading}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 transition-colors"
        >
          发送
        </button>
      </div>

      {/* 应用修改按钮 */}
      <button
        onClick={handleApply}
        disabled={creating || messages.length <= 1}
        className={`mt-4 w-full py-3 rounded-lg text-sm font-medium transition-colors ${
          creating
            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
            : messages.length > 1
              ? "bg-green-600 text-white hover:bg-green-500"
              : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
        }`}
      >
        {creating
          ? "⏳ 正在创建改编项目..."
          : messages.length > 1
            ? "🎨 应用修改并创建项目"
            : "先聊聊你想怎么改..."}
      </button>
    </div>
  );
}

