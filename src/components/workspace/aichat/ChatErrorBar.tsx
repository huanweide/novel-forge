import { Icon } from "@/components/ui/icons";

interface ChatErrorBarProps {
  error: string;
  onDismiss: () => void;
}

export function ChatErrorBar({ error, onDismiss }: ChatErrorBarProps) {
  if (!error) return null;
  return (
    <div className="px-3 py-1.5 text-[10px] text-[var(--nv-danger)] bg-[var(--nv-danger-soft)] border-t border-[var(--nv-danger-soft)] shrink-0">
      <Icon name="alert" size={11} className="inline mr-1 align-middle" /> {error}
      <button onClick={onDismiss} className="ml-2 text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)]"><Icon name="x" size={12} className="align-middle" /></button>
    </div>
  );
}
