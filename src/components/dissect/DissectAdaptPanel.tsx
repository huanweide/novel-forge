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

    // 构建上下文摘要——给 Agent 足够的数据来做修改建议
    const dimSummary = buildDimensionSummary(dimensions);

    try {
      const res = await fetch("/api/generate/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: null,
          message: `【拆书数据参考】\n${dimSummary}\n\n【用户要求】\n${text}\n\n请针对这个要求给出具体的修改方案。直接说怎么改，不要问问题。如果用户要求合理，给出修改后的设定描述。`,
          mode: "long",
        }),
      });

      if (!res.ok) throw new Error("Agent 响应失败");

      const data = await res.json();
      const reply = data.reply || data.content || "收到。继续说说你的想法？";

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

// ─── 辅助：构建维度摘要给 Agent ────────────────────────

function buildDimensionSummary(
  dims: Record<string, DimensionResult>,
): string {
  const parts: string[] = [];
  const priority = [
    "basic_info",
    "story_core",
    "worldview",
    "characters",
    "power_system",
    "factions",
    "style_analysis",
  ];

  for (const key of priority) {
    const d = dims[key];
    if (d && d.status === "completed" && d.content) {
      parts.push(`【${d.label}】${d.content.slice(0, 600)}`);
    }
  }

  return parts.join("\n\n") || "（无拆书数据）";
}
