import { Icon } from "@/components/ui/icons";
import type { MessageItem, AnalysisDiff } from "./types";

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

interface ChatMessageListProps {
  messages: MessageItem[];
  hasHistory: boolean;
  loading: boolean;
  onAdoptSuggestion: (d: AnalysisDiff) => void;
}

export function ChatMessageList({ messages, onAdoptSuggestion }: ChatMessageListProps) {
  return (
    <>
      {/* 消息列表（空状态由 AIChatHeader 统一展示，避免「墨灵就绪」重复） */}
      {messages.map((msg, i) => (
        <div key={i} className={`px-3 py-2.5 border-b border-[var(--nv-border-1)] ${msg.role === "user" ? "bg-[var(--nv-surface-1)] backdrop-blur-sm" : "bg-[var(--nv-surface-1)]"}`}>
          <div className="flex items-start gap-2">
            <span className="shrink-0 mt-0.5">{msg.role === "user" ? <Icon name="user" size={13} /> : <Icon name="bot" size={13} />}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                {msg.role === "user" ? (
                  <span className="text-[10px] font-medium text-[var(--nv-text-secondary)]">你</span>
                ) : (
                  <span className="text-[10px] font-bold text-gradient">墨灵</span>
                )}
                {msg.trace && msg.trace.length > 0 && (
                  <span className="text-[10px] text-[var(--nv-text-tertiary)]">
                    (调了 {msg.trace.length} 次工具)
                  </span>
                )}
              </div>
              {/* 思考步骤折叠 */}
              {msg.trace && msg.trace.length > 0 && (
                <details className="mb-1">
                  <summary className="text-[10px] text-[var(--nv-text-secondary)] cursor-pointer hover:text-[var(--nv-text-secondary)]">
                    查看思考过程
                  </summary>
                  <div className="mt-1 space-y-0.5 pl-2 border-l border-[var(--nv-border-2)]">
                    {msg.trace.map((t, j) => (
                      <div key={j} className="text-[10px] text-[var(--nv-text-secondary)] flex items-center gap-1">
                        <span className="text-[var(--nv-text-tertiary)]">└</span>
                        {t.summary}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {/* 写后分析结果 */}
              {msg.analysis && msg.analysis.differences && msg.analysis.differences.length > 0 && (
                <details className="mb-1" open>
                  <summary className="text-[10px] text-[var(--nv-accent)] cursor-pointer hover:text-[var(--nv-accent)] font-medium">
                    <span className="flex items-center gap-1"><Icon name="clipboard" size={13} /> 角色卡更新建议（{msg.analysis.differences.length} 项）</span>
                  </summary>
                  <div className="mt-1.5 space-y-1.5 pl-2 border-l border-[var(--nv-accent-soft)]">
                    {msg.analysis.differences.map((d, j) => (
                      <div key={j} className="text-[10px] bg-[var(--nv-surface-2)] rounded p-1.5">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[var(--nv-text-primary)] font-medium">{d.characterName}</span>
                          <span className="text-[var(--nv-text-secondary)]">·</span>
                          <span className="text-[var(--nv-accent)]">{fieldLabel(d.field)}</span>
                          <span className="ml-auto text-[var(--nv-text-tertiary)]">{Math.round(d.confidence * 100)}%</span>
                        </div>
                        {d.evidence && (
                          <div className="text-[var(--nv-text-secondary)] mb-0.5 leading-relaxed">
                            <span className="flex items-center gap-1"><Icon name="bookmarked" size={12} /> 「{d.evidence.slice(0, 80)}{d.evidence.length > 80 ? "…" : ""}」</span>
                          </div>
                        )}
                        <div className="text-[var(--nv-text-secondary)] mb-1 flex items-start gap-1">
                          <Icon name="lightbulb" size={12} className="shrink-0 mt-0.5" /> 建议：{d.suggested}
                        </div>
                        <button
                          onClick={() => d.confidence > 0 ? onAdoptSuggestion(d) : null}
                          disabled={d.confidence < 0}
                          className={`text-[9px] px-2 py-0.5 rounded transition-colors ${
                            d.confidence < 0
                              ? "bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)] cursor-default"
                              : "bg-[var(--nv-primary-soft)] text-[var(--nv-primary)] hover:bg-[var(--nv-primary-soft)]"
                          }`}
                        >
                          {d.confidence < 0 ? "已采纳" : "采纳"}
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {msg.analysis && msg.analysis.differences && msg.analysis.differences.length === 0 && (
                <div className="text-[10px] text-[var(--nv-text-secondary)] mb-1">{msg.analysis.summary}</div>
              )}
              <pre className="text-xs text-[var(--nv-text-primary)] whitespace-pre-wrap font-sans leading-relaxed">
                {msg.text}
              </pre>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
