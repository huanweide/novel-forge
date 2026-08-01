const SUGGESTIONS = [
  "列出所有角色",
  "角色最强的是谁",
  "创建一个反派角色",
  "查看大纲结构",
  "分析本章",
];

interface ChatSuggestionsProps {
  onSuggestion: (s: string) => void;
}

export function ChatSuggestions({ onSuggestion }: ChatSuggestionsProps) {
  return (
    <div className="flex gap-1.5 px-3 py-2 overflow-x-auto text-[10px] text-[var(--nv-text-secondary)] border-t border-[var(--nv-border-1)] shrink-0">
      <span className="text-[var(--nv-text-tertiary)] shrink-0">试试：</span>
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          onClick={() => onSuggestion(s)}
          className="shrink-0 px-2 py-0.5 rounded-full border border-[var(--nv-border-1)] hover:border-[var(--nv-primary)] hover:text-[var(--nv-primary)] transition-colors"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
