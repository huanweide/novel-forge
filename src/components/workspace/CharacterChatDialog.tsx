"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import type { CharacterChatMode } from "@/core/pipeline/character-chat";

interface ChatMessage {
  role: "user" | "character";
  content: string;
}

interface CharacterChatDialogProps {
  projectId: string;
  characterId: string;
  characterName: string;
  onClose: () => void;
}

/**
 * 角色扮演聊天弹窗（对话 / 附身两模式）。
 * 对话：以角色口吻闲聊；附身：让角色帮你写一段该视角的正文。
 */
export function CharacterChatDialog({ projectId, characterId, characterName, onClose }: CharacterChatDialogProps) {
  const [mode, setMode] = useState<CharacterChatMode>("dialogue");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // P0-C：附身产出一键落正文——复制到剪贴板 / 插入到项目最后一节正文末尾
  const flash = (i: number, msg: string, ms: number) => {
    setFeedback((f) => ({ ...f, [i]: msg }));
    setTimeout(() => setFeedback((f) => {
      const n = { ...f };
      delete n[i];
      return n;
    }), ms);
  };
  const copyText = async (content: string, i: number) => {
    try {
      await navigator.clipboard.writeText(content);
      flash(i, "已复制", 1800);
    } catch {
      flash(i, "复制失败", 1800);
    }
  };
  const insertToBody = async (content: string, i: number) => {
    try {
      const projRes = await fetch(`/api/projects/${projectId}`);
      const proj = await projRes.json();
      const nodes = (proj.storyNodes || []).filter((n: { type?: string }) => n.type === "section");
      if (!nodes.length) {
        flash(i, "暂无章节可插入", 2000);
        return;
      }
      nodes.sort((a: { order: number }, b: { order: number }) => a.order - b.order);
      const target = nodes[nodes.length - 1];
      const detailRes = await fetch(`/api/story/nodes/${target.id}`);
      const detail = await detailRes.json();
      if (detail.error) throw new Error(detail.error);
      const existing: string = detail.content || "";
      const appended = existing.trim()
        ? existing.replace(/\s+$/, "") + "\n\n" + content
        : content;
      const putRes = await fetch(`/api/story/nodes/${target.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: appended }),
      });
      if (!putRes.ok) throw new Error("保存失败");
      flash(i, `已插入《${target.title}》末尾`, 2400);
    } catch (e) {
      flash(i, "插入失败：" + (e instanceof Error ? e.message : "网络错误"), 2600);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/agent/character-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, characterId, message: text, mode }),
      });
      const data = await res.json();
      if (res.ok && data.reply) {
        setMessages((m) => [...m, { role: "character", content: data.reply }]);
      } else {
        setMessages((m) => [...m, { role: "character", content: `（连接失败：${data.error || "未知错误"}）` }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "character", content: "（网络错误，请重试）" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      bare
      ariaLabel={`与 ${characterName} 对话`}
      panelClassName="w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
      showClose
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--nv-border-2)] px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--nv-creative-soft)] text-[var(--nv-creative)]">
            <Icon name="messageCircle" size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-[var(--nv-text-primary)]">与 {characterName} 对话</h3>
            <p className="truncate text-xs text-[var(--nv-text-tertiary)]">
              {mode === "possess" ? "附身写作：让角色替你写一段戏" : "角色扮演：以角色口吻闲聊问答"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 rounded-lg border border-[var(--nv-border-2)] p-0.5">
          {(["dialogue", "possess"] as CharacterChatMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                mode === m
                  ? "bg-[var(--nv-creative)] text-white"
                  : "text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]"
              }`}
            >
              {m === "dialogue" ? "对话" : "附身"}
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-3 bg-[var(--nv-abyss)]">
        {messages.length === 0 && (
          <div className="text-center text-xs text-[var(--nv-text-tertiary)] py-10">
            {mode === "possess"
              ? "切换到「附身」后，描述一个场景（地点 / 对手 / 目标），让角色替你写一段正文。"
              : `向 ${characterName} 说点什么吧——问ta一个问题，或让ta评价剧情。`}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-[var(--nv-primary)] text-white"
                  : "bg-[var(--nv-surface-1)] border border-[var(--nv-border-2)] text-[var(--nv-text-primary)]"
              }`}
            >
              {msg.content}
            </div>
            {msg.role === "character" && mode === "possess" && (
              <div className="mt-1 flex items-center gap-2.5">
                <button
                  onClick={() => copyText(msg.content, i)}
                  className="text-[10px] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)] transition-colors"
                >
                  复制
                </button>
                <button
                  onClick={() => insertToBody(msg.content, i)}
                  className="text-[10px] text-[var(--nv-creative)] hover:text-[var(--nv-creative)]/70 transition-colors"
                >
                  插入正文
                </button>
                {feedback[i] && (
                  <span className="text-[10px] text-[var(--nv-text-tertiary)]">{feedback[i]}</span>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl px-3 py-2 bg-[var(--nv-surface-1)] border border-[var(--nv-border-2)]">
              <div className="flex items-center gap-2 text-xs text-[var(--nv-text-tertiary)]">
                <div className="w-3 h-3 rounded-full border-2 border-[var(--nv-creative)]/20 border-t-[var(--nv-creative)] animate-spin" />
                {characterName} 正在思考…
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--nv-border-2)] px-4 py-3 flex items-end gap-2 bg-[var(--nv-surface-1)]">
        <textarea
          className="input-glass flex-1 rounded-lg px-3 py-2 text-sm leading-relaxed resize-none max-h-28"
          rows={2}
          value={input}
          placeholder={mode === "possess" ? "描述场景，让角色替你写……" : `对 ${characterName} 说……`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button onClick={send} disabled={loading || !input.trim()} className="btn-primary gap-1.5 shrink-0">
          <Icon name="arrowRight" size={15} /> 发送
        </Button>
      </div>
    </Modal>
  );
}
