import { Icon } from "@/components/ui/icons";

const SUGGESTIONS: { text: string; icon: string }[] = [
  { text: "列出所有角色", icon: "users" },
  { text: "角色最强的是谁", icon: "target" },
  { text: "创建一个反派角色", icon: "plus" },
  { text: "查看大纲结构", icon: "book" },
  { text: "分析本章", icon: "search" },
];

interface ChatSuggestionsProps {
  onSuggestion: (s: string) => void;
}

export function ChatSuggestions({ onSuggestion }: ChatSuggestionsProps) {
  return (
    <div className="flex gap-1.5 px-3 py-2 overflow-x-auto text-[10px] text-[var(--nv-text-secondary)] border-t border-[var(--nv-border-1)] shrink-0">
      <span className="text-[var(--nv-text-tertiary)] shrink-0 self-center">试试：</span>
      {SUGGESTIONS.map((s) => (
        <button
          key={s.text}
          onClick={() => onSuggestion(s.text)}
          className="group shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full border border-[var(--nv-border-1)] bg-[var(--nv-surface-1)] hover:border-[var(--nv-primary)] hover:bg-[var(--nv-primary-soft)] hover:text-[var(--nv-primary)] transition-all"
        >
          <Icon name={s.icon as any} size={11} className="text-[var(--nv-creative)] group-hover:text-[var(--nv-primary)] transition-colors" />
          {s.text}
        </button>
      ))}
    </div>
  );
}
