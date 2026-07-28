"use client";

/**
 * 游戏模式 —— 章纲编辑器
 *
 * 内嵌于游戏页面，支持：
 * - 结构化文本编辑（C|/R|/L|/G|/P|/CF|/M|/K|/EL|/T| 语法高亮）
 * - Agent 一键生成章纲
 * - 多轮对话确认（SSE流式）
 * - 预览/编辑切换
 * - 保存到 StoryNode.outline
 */

import { useState, useRef, useEffect } from "react";

interface Props {
  projectId: string;
  nodeId: string;
  chapterTitle: string;
  currentOutline: string | null;
  onOutlineSaved: (outline: string) => void;
  onClose: () => void;
}

// ─── 行类型着色 ─────────────────────────────────────────────────

const LINE_COLORS: Record<string, string> = {
  "C|": "text-cyan-400",
  "L0|": "text-red-400/70",
  "L1|": "text-amber-400/70",
  "L2|": "text-orange-400/70",
  "R|": "text-green-400",
  "L|": "text-teal-400",
  "G|": "text-yellow-400",
  "P|": "text-[var(--nv-text-tertiary)]",
  "CF|": "text-purple-400",
  "M|": "text-rose-400",
  "K|": "text-amber-300",
  "EL|": "text-pink-400",
  "T|": "text-cyan-300",
  "【章首衔接】": "text-blue-400",
  "【章尾悬念】": "text-blue-400",
  "⟨✍": "text-[var(--nv-creative)]/60 italic",
};

function getLineColor(line: string): string {
  for (const [prefix, color] of Object.entries(LINE_COLORS)) {
    if (line.trimStart().startsWith(prefix)) return color;
  }
  return "text-[var(--nv-text-muted)]";
}

// ─── 高亮渲染 ─────────────────────────────────────────────────

function HighlightedOutline({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap">
      {lines.map((line, i) => (
        <div key={i} className={getLineColor(line)}>
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

// ─── 对话轮次 ─────────────────────────────────────────────────

interface ChatTurn {
  role: "user" | "assistant";
  message?: string;
  currentOutline?: string;
  response?: string;
}

// ─── 主组件 ───────────────────────────────────────────────────

export default function GameOutlineEditor({
  projectId,
  nodeId,
  chapterTitle,
  currentOutline,
  onOutlineSaved,
  onClose,
}: Props) {
  const [mode, setMode] = useState<"edit" | "preview" | "chat">("edit");
  const [outlineText, setOutlineText] = useState(currentOutline || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatStreaming, setChatStreaming] = useState("");
  const [direction, setDirection] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── 同步外部变化 ───────────────────────────────────────
  useEffect(() => {
    if (currentOutline && !outlineText) {
      setOutlineText(currentOutline);
    }
  }, [currentOutline]);

  // ── Agent 一键生成 ──────────────────────────────────────
  const handleGenerate = async () => {
    setIsGenerating(true);
    setStatusMsg("AI 正在生成章纲...");
    try {
      const res = await fetch("/api/game/outline/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          nodeId,
          direction: direction || undefined,
          existingOutline: outlineText || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setOutlineText(data.outline);
      setStatusMsg("✅ 章纲已生成，可切换预览查看效果");
      setMode("preview");
    } catch (err: any) {
      setStatusMsg(`❌ 生成失败：${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── 对话模式 ────────────────────────────────────────────
  const handleChatSend = async () => {
    if (!chatInput.trim() || !outlineText) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatStreaming("");

    const newHistory: ChatTurn[] = [
      ...chatHistory,
      { role: "user", message: userMsg, currentOutline: outlineText },
    ];

    setChatHistory(newHistory);

    try {
      const res = await fetch("/api/game/outline/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          nodeId,
          currentOutline: outlineText,
          userMessage: userMsg,
          history: chatHistory,
          direction: direction || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "未知错误" }));
        throw new Error(errData.error);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "token") {
                fullResponse += event.content || "";
                setChatStreaming(fullResponse);
              } else if (event.type === "done") {
                setOutlineText(event.outline);
                setChatStreaming("");
                setChatHistory([
                  ...newHistory,
                  { role: "assistant", response: event.outline },
                ]);
                if (event.isFinal) {
                  setStatusMsg("✅ 章纲已定稿");
                }
              } else if (event.type === "error") {
                throw new Error(event.error);
              }
            } catch (e: any) {
              if (e.message && !e.message.includes("JSON")) throw e;
            }
          }
        }
      }
    } catch (err: any) {
      setStatusMsg(`❌ 对话失败：${err.message}`);
    }
  };

  // ── 保存 ────────────────────────────────────────────────
  const handleSave = async () => {
    setStatusMsg("正在保存...");
    try {
      const res = await fetch(`/api/story/nodes/${nodeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outline: outlineText }),
      });
      if (!res.ok) throw new Error("保存失败");
      setStatusMsg("✅ 章纲已保存");
      onOutlineSaved(outlineText);
    } catch (err: any) {
      setStatusMsg(`❌ 保存失败：${err.message}`);
    }
  };

  // ── Tab切换 ─────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#0a0a1f]/95 border border-[var(--nv-creative)]/30 rounded-lg overflow-hidden">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--nv-creative)]/20 bg-[#0d0d2a]">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[var(--nv-creative)]">
            📋 章纲编辑器
          </span>
          <span className="text-xs text-[var(--nv-text-muted)]">— {chapterTitle}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab切换 */}
          <div className="flex rounded-md overflow-hidden border border-[var(--nv-creative)]/30">
            {(["edit", "preview", "chat"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 text-xs transition-colors ${
                  mode === m
                    ? "bg-[var(--nv-creative)]/40 text-[var(--nv-creative)]"
                    : "bg-transparent text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)]"
                }`}
              >
                {{ edit: "✏️ 编辑", preview: "👁 预览", chat: "💬 对话" }[m]}
              </button>
            ))}
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-3 py-1 text-xs bg-cyan-800/40 hover:bg-cyan-700/40 text-cyan-300 border border-cyan-700/30 rounded transition-colors disabled:opacity-40"
          >
            {isGenerating ? "⏳ 生成中..." : "⚡ AI生成"}
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1 text-xs bg-emerald-800/30 hover:bg-emerald-700/30 text-emerald-300 border border-emerald-700/30 rounded transition-colors"
          >
            💾 保存
          </button>
          <button
            onClick={onClose}
            className="text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)] text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* 状态信息 */}
      {statusMsg && (
        <div
          className={`px-4 py-1.5 text-xs ${
            statusMsg.startsWith("✅")
              ? "text-emerald-400 bg-emerald-900/10"
              : statusMsg.startsWith("❌")
                ? "text-red-400 bg-red-900/10"
                : "text-[var(--nv-creative)] bg-[var(--nv-creative)]/10"
          }`}
        >
          {statusMsg}
        </div>
      )}

      {/* 编辑模式 */}
      {mode === "edit" && (
        <div className="flex-1 flex flex-col p-4">
          <div className="mb-2 flex items-center gap-2">
            <input
              type="text"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              placeholder="创作方向（可选，如：方向A-身份炸弹型钩子 / 更宏大的叙事 / 聚焦角色内心）"
              className="flex-1 bg-[var(--nv-abyss)]/50 border border-[var(--nv-creative)]/30 rounded px-3 py-1.5 text-xs text-[var(--nv-text-secondary)] text-[var(--nv-text-muted)] outline-none focus:border-[var(--nv-creative)]/50"
            />
          </div>
          <textarea
            ref={textareaRef}
            value={outlineText}
            onChange={(e) => setOutlineText(e.target.value)}
            placeholder={`在此编写结构化章纲...\n\nC| ${chapterTitle ? chapterTitle.match(/\d+章/) : "?"} | ${chapterTitle} | 时间地点 | 主角\n\n- 【章首衔接】：...\n\nR| [角色名] [动作] [对象] [结果]\n⟨✍ 写作指令⟩\nL| [地点名] [场景氛围]\n\n- 【章尾悬念】：...\n\nCF| [伏笔名] | 埋设 | [操作细节]\nM| [情绪] | 7 | [实现手段]\nT| [下一章标题] | [目标]`}
            className="flex-1 bg-[var(--nv-abyss)]/30 border border-[var(--nv-creative)]/20 rounded-lg p-4 text-sm font-mono text-[var(--nv-text-secondary)] resize-none outline-none focus:border-[var(--nv-creative)]/40 placeholder:text-[var(--nv-text-muted)]"
            spellCheck={false}
          />
        </div>
      )}

      {/* 预览模式 */}
      {mode === "preview" && (
        <div className="flex-1 overflow-y-auto p-4">
          {outlineText ? (
            <HighlightedOutline text={outlineText} />
          ) : (
            <p className="text-[var(--nv-text-muted)] text-sm italic">
              暂无章纲。切换到"编辑"模式编写，或点击"AI生成"。
            </p>
          )}
        </div>
      )}

      {/* 对话模式 */}
      {mode === "chat" && (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatHistory.length === 0 && (
              <div className="text-center text-[var(--nv-text-muted)] text-sm py-8">
                <p className="mb-2">💬 章纲对话确认模式</p>
                <p className="text-xs">
                  输入你的反馈或修改方向，AI 会针对性修改章纲。
                  <br />
                  例如："方向A更合适"、"第3段节奏太慢"、"加一个伏笔"
                </p>
              </div>
            )}
            {chatHistory.map((turn, i) => (
              <div key={i} className="space-y-2">
                {turn.role === "user" && (
                  <div className="bg-[var(--nv-creative)]/20 border border-[var(--nv-creative)]/30 rounded-lg p-3 max-w-[85%] ml-auto">
                    <p className="text-xs text-[var(--nv-creative)] font-medium mb-1">
                      👤 你的反馈
                    </p>
                    <p className="text-sm text-[var(--nv-text-secondary)]">{turn.message}</p>
                  </div>
                )}
                {turn.role === "assistant" && turn.response && (
                  <div className="bg-[var(--nv-abyss)]/40 border border-[var(--nv-border-2)]/30 rounded-lg p-3">
                    <p className="text-xs text-cyan-400 font-medium mb-2">
                      🤖 AI 修改后的章纲
                    </p>
                    <HighlightedOutline text={turn.response} />
                  </div>
                )}
              </div>
            ))}
            {chatStreaming && (
              <div className="bg-[var(--nv-abyss)]/40 border border-cyan-800/30 rounded-lg p-3 animate-pulse">
                <p className="text-xs text-cyan-400 font-medium mb-2">
                  🤖 AI 正在修改...
                </p>
                <HighlightedOutline text={chatStreaming} />
              </div>
            )}
          </div>
          {/* 对话输入 */}
          <div className="p-3 border-t border-[var(--nv-creative)]/20 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && chatInput.trim()) handleChatSend();
              }}
              placeholder="输入对章纲的反馈或修改方向..."
              className="flex-1 bg-[var(--nv-abyss)]/50 border border-[var(--nv-creative)]/30 rounded-lg px-3 py-2 text-sm text-[var(--nv-text-secondary)] text-[var(--nv-text-muted)] outline-none focus:border-[var(--nv-creative)]/50"
            />
            <button
              onClick={handleChatSend}
              disabled={!chatInput.trim() || !outlineText}
              className="px-4 py-2 bg-[var(--nv-creative)] hover:bg-[var(--nv-creative)] text-[var(--nv-text-primary)] rounded-lg text-sm transition-all disabled:opacity-40"
            >
              发送
            </button>
          </div>
        </div>
      )}

      {/* 底部提示 */}
      <div className="px-4 py-1.5 border-t border-[var(--nv-creative)]/20 text-[10px] text-[var(--nv-text-muted)] flex gap-3">
        <span>C|章节 R|角色 L|场景 G|金手指 P|剧情 CF|伏笔 M|情绪 K|台词 EL|弧线 T|过渡</span>
      </div>
    </div>
  );
}
