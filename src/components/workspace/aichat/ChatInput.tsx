import { Icon } from "@/components/ui/icons";

interface ChatInputProps {
  message: string;
  loading: boolean;
  selectedText?: string;
  onMessageChange: (v: string) => void;
  onSend: () => void;
  onCancel: () => void;
}

export function ChatInput({ message, loading, selectedText, onMessageChange, onSend, onCancel }: ChatInputProps) {
  return (
    <div className="shrink-0 border-t border-[var(--nv-border-1)] bg-[var(--nv-abyss)]">
      <div className="flex items-center gap-2 px-3 py-2.5">
        {selectedText && (
          <span className="text-[10px] text-[var(--nv-primary)] bg-[var(--nv-primary-soft)] px-2 py-0.5 rounded shrink-0 max-w-[140px] truncate" title={selectedText}>
            {selectedText.slice(0, 25)}…
          </span>
        )}
        <input
          type="text"
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="说说你想做什么…"
          className="flex-1 bg-transparent text-xs text-[var(--nv-text-primary)] placeholder:text-[var(--nv-text-tertiary)] outline-none"
          disabled={loading}
        />
        {loading ? (
          <button
            onClick={onCancel}
            className="shrink-0 px-2 py-1 rounded text-[10px] font-medium border border-[var(--nv-danger-soft)] text-[var(--nv-danger)] hover:bg-[var(--nv-danger-soft)] transition-colors"
          >
            停止
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!message.trim()}
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-[var(--nv-primary)] to-[var(--nv-accent)] text-white transition-all hover:scale-105 active:scale-95 disabled:from-[var(--nv-surface-1)] disabled:to-[var(--nv-surface-1)] disabled:text-[var(--nv-text-tertiary)] disabled:scale-100 disabled:cursor-not-allowed"
            style={message.trim() ? { boxShadow: "0 0 12px color-mix(in oklch, var(--nv-primary) 45%, transparent)" } : undefined}
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
  );
}
