import { Icon } from "@/components/ui/icons";

interface AIChatHeaderProps {
  loading: boolean;
}

export function AIChatHeader({ loading }: AIChatHeaderProps) {
  return (
    <div className="shrink-0 px-3 py-2 border-b border-[var(--nv-border-1)] bg-[var(--nv-surface-2)]">
      <div className="flex items-center gap-2">
        <div className="relative">
          <div className={`w-2 h-2 rounded-full ${loading ? "bg-[var(--nv-accent)]" : "bg-[var(--nv-success)]"}`} />
          <div className={`absolute inset-0 w-2 h-2 rounded-full opacity-40 ${loading ? "bg-[var(--nv-accent)] animate-ping" : "bg-[var(--nv-success)] animate-ping"}`} />
        </div>
        <span className="text-xs font-medium text-[var(--nv-text-primary)]">AI 写作助手</span>
        <span className="text-[10px] text-[var(--nv-text-tertiary)] ml-auto">Agent v2</span>
      </div>
      <div className="text-[10px] text-[var(--nv-text-secondary)] mt-1 leading-relaxed">
        角色卡·世界书·大纲·伏笔·故事线·规则·风格
      </div>
    </div>
  );
}
