import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import type { ExtractionData } from "./types";

interface PostGenPanelHeaderProps {
  extractionData: ExtractionData | null;
  extractionLoading: boolean;
  saveMessage: string;
  saving: boolean;
  onSave: () => void;
  onContinueWriting: () => void;
  onClose: () => void;
}

export function PostGenPanelHeader({
  extractionData,
  extractionLoading,
  saveMessage,
  saving,
  onSave,
  onContinueWriting,
  onClose,
}: PostGenPanelHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--nv-border-2)] bg-[var(--nv-surface-2)]">
      <div className="flex items-center gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)]">
          <Icon name="chart" size={15} className="text-[var(--nv-primary)]" /> 本章分析
        </h3>
        {extractionData && (
          <div className="flex gap-2 text-[10px] text-[var(--nv-text-tertiary)]">
            <span title="角色" className="flex items-center gap-0.5"><Icon name="user" size={11} />{extractionData.counts?.characters || 0}</span>
            <span title="场景" className="flex items-center gap-0.5"><Icon name="mapPin" size={11} />{extractionData.counts?.locations || 0}</span>
            <span title="道具" className="flex items-center gap-0.5"><Icon name="gem" size={11} />{extractionData.counts?.items || 0}</span>
            <span title="伏笔" className="flex items-center gap-0.5"><Icon name="zap" size={11} />{extractionData.counts?.foreshadowings || 0}</span>
            <span title="关系" className="flex items-center gap-0.5"><Icon name="share" size={11} />{extractionData.counts?.relationshipChanges || 0}</span>
          </div>
        )}
        {extractionLoading && (
          <span className="flex items-center gap-1 text-[10px] text-[var(--nv-primary)] animate-pulse"><Icon name="loader" size={11} className="animate-spin" /> 提取中…</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {saveMessage && <span className={`text-[10px] ${saveMessage.startsWith("✅") ? "text-success" : "text-danger"}`}>{saveMessage}</span>}
        <Button onClick={onSave} disabled={saving || !extractionData} size="sm" className="btn-success h-7 text-xs">
          {saving ? "保存中…" : "全部采纳"}
        </Button>
        <Button onClick={onContinueWriting} size="sm" className="btn-primary h-7 text-xs">
          <Icon name="sparkles" size={12} /> 继续写下一节
        </Button>
        <button onClick={onClose} className="text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)] text-sm transition-colors"><Icon name="x" size={15} /></button>
      </div>
    </div>
  );
}
