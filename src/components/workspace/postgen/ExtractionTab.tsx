import { Icon } from "@/components/ui/icons";
import type { ExtractionData, AdoptControllers } from "./types";

interface ExtractionTabProps {
  extractionData: ExtractionData;
  adopt: AdoptControllers;
  importanceStars: (score: number) => { full: number; empty: number };
}

export function ExtractionTab({ extractionData, adopt, importanceStars }: ExtractionTabProps) {
  return (
    <div className="p-4 space-y-4">
      {/* 角色 */}
      {extractionData.characters.length > 0 && (
        <details open className="group">
          <summary className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-primary)]">
            <Icon name="user" size={14} className="text-[var(--nv-primary)]" /> 出场角色 ({extractionData.characters.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            {extractionData.characters.map((c: any, i: number) => {
              const isAdopted = adopt.chars.set.has(String(i));
              const isNew = c.isNew && c.suggestion === "create";
              const isPasserby = c.suggestion === "ignore";
              const stars = importanceStars(c.importance);
              return (
                <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs group/item ${isPasserby ? "opacity-50" : ""} ${isAdopted ? "bg-[var(--nv-success-soft)] border border-[var(--nv-success)]/30" : "bg-[var(--nv-surface-1)]"}`}>
                  <button onClick={() => adopt.chars.toggle(String(i))}
                    className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                      ${isAdopted ? "bg-[var(--nv-success)] border-[var(--nv-success)] text-[var(--nv-text-primary)]" : "border-[var(--nv-border-3)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-text-secondary)]"}`}>
                    {isAdopted ? <Icon name="check" size={11} /> : null}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--nv-text-primary)]">{c.name}</span>
                      <span className="text-[var(--nv-text-tertiary)]">{c.role}</span>
                      <span className="text-[var(--nv-accent)] text-[10px] tracking-tight">{"★".repeat(stars.full)}<span className="text-[var(--nv-text-tertiary)]">{"☆".repeat(stars.empty)}</span></span>
                      {isNew && <span className="text-[var(--nv-success)] text-[10px] bg-[var(--nv-success-soft)] px-1 rounded">新角色</span>}
                      {isPasserby && <span className="text-[var(--nv-accent)] text-[10px] bg-[var(--nv-accent-soft)] px-1 rounded">疑似路人</span>}
                    </div>
                    {c.experience && <p className="text-[var(--nv-text-tertiary)] mt-0.5">{c.experience}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* 场景地点 */}
      {extractionData.locations.length > 0 && (
        <details open className="group">
          <summary className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-primary)]">
            <Icon name="mapPin" size={14} className="text-[var(--nv-info)]" /> 场景地点 ({extractionData.locations.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            {extractionData.locations.map((l: any, i: number) => {
              const isAdopted = adopt.locations.set.has(String(i));
              return (
                <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${l.suggestion === "ignore" ? "opacity-50" : ""} ${isAdopted ? "bg-[var(--nv-success-soft)] border border-[var(--nv-success)]/30" : "bg-[var(--nv-surface-1)]"}`}>
                  <button onClick={() => adopt.locations.toggle(String(i))}
                    className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                      ${isAdopted ? "bg-[var(--nv-success)] border-[var(--nv-success)] text-[var(--nv-text-primary)]" : "border-[var(--nv-border-3)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-text-secondary)]"}`}>
                    {isAdopted ? <Icon name="check" size={11} /> : null}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--nv-text-primary)]">{l.name}</span>
                      <span className="text-[var(--nv-text-tertiary)]">{l.type}</span>
                      {l.isNew && <span className="text-[var(--nv-success)] text-[10px] bg-[var(--nv-success-soft)] px-1 rounded">新</span>}
                    </div>
                    {l.description && <p className="text-[var(--nv-text-tertiary)] mt-0.5 truncate">{l.description}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* 势力 */}
      {extractionData.factions.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-primary)]">
            <Icon name="building" size={14} className="text-[var(--nv-creative)]" /> 势力阵营 ({extractionData.factions.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            {extractionData.factions.map((f: any, i: number) => {
              const isAdopted = adopt.factions.set.has(String(i));
              return (
                <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${isAdopted ? "bg-[var(--nv-success-soft)] border border-[var(--nv-success)]/30" : "bg-[var(--nv-surface-1)]"}`}>
                  <button onClick={() => adopt.factions.toggle(String(i))}
                    className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                      ${isAdopted ? "bg-[var(--nv-success)] border-[var(--nv-success)] text-[var(--nv-text-primary)]" : "border-[var(--nv-border-3)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-text-secondary)]"}`}>
                    {isAdopted ? <Icon name="check" size={11} /> : null}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-[var(--nv-text-primary)]">{f.name}</span>
                    <span className="text-[var(--nv-text-tertiary)] ml-2">{f.type}</span>
                    {f.leader && <span className="text-[var(--nv-text-secondary)] ml-2">首领：{f.leader}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* 道具 */}
      {extractionData.items.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-primary)]">
            <Icon name="gem" size={14} className="text-[var(--nv-accent)]" /> 道具物品 ({extractionData.items.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            {extractionData.items.map((it: any, i: number) => {
              const isAdopted = adopt.items.set.has(String(i));
              return (
                <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${isAdopted ? "bg-[var(--nv-success-soft)] border border-[var(--nv-success)]/30" : "bg-[var(--nv-surface-1)]"}`}>
                  <button onClick={() => adopt.items.toggle(String(i))}
                    className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                      ${isAdopted ? "bg-[var(--nv-success)] border-[var(--nv-success)] text-[var(--nv-text-primary)]" : "border-[var(--nv-border-3)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-text-secondary)]"}`}>
                    {isAdopted ? <Icon name="check" size={11} /> : null}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-[var(--nv-text-primary)]">{it.name}</span>
                    <span className="text-[var(--nv-text-tertiary)] ml-2">{it.type}</span>
                    {it.rarity && <span className="text-[var(--nv-accent)] ml-2">{it.rarity}</span>}
                    {it.owner && <span className="text-[var(--nv-text-secondary)] ml-2">持有：{it.owner}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* 未收尾线索 */}
      {extractionData.foreshadowings.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-primary)]">
            <Icon name="zap" size={14} className="text-[var(--nv-creative)]" /> 未收尾线索 ({extractionData.foreshadowings.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            {extractionData.foreshadowings.map((f: any, i: number) => {
              const isAdopted = adopt.foreshadowings.set.has(String(i));
              return (
                <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${isAdopted ? "bg-[var(--nv-success-soft)] border border-[var(--nv-success)]/30" : "bg-[var(--nv-surface-1)]"}`}>
                  <button onClick={() => adopt.foreshadowings.toggle(String(i))}
                    className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                      ${isAdopted ? "bg-[var(--nv-success)] border-[var(--nv-success)] text-[var(--nv-text-primary)]" : "border-[var(--nv-border-3)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-text-secondary)]"}`}>
                    {isAdopted ? <Icon name="check" size={11} /> : null}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--nv-text-secondary)]">{f.description}</span>
                      <span className={`text-[10px] px-1 rounded ${f.importance === "极高" ? "bg-[var(--nv-danger-soft)] text-[var(--nv-danger)]" : f.importance === "高" ? "bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]" : "bg-[var(--nv-surface-3)] text-[var(--nv-text-tertiary)]"}`}>
                        {f.importance}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* 关系变化 */}
      {extractionData.relationshipChanges.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-primary)]">
            <Icon name="share" size={14} className="text-[var(--nv-info)]" /> 关系变化 ({extractionData.relationshipChanges.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            {extractionData.relationshipChanges.map((r: any, i: number) => {
              const isAdopted = adopt.relationships.set.has(String(i));
              return (
                <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${isAdopted ? "bg-[var(--nv-success-soft)] border border-[var(--nv-success)]/30" : "bg-[var(--nv-surface-1)]"}`}>
                  <button onClick={() => adopt.relationships.toggle(String(i))}
                    className={`mt-0.5 shrink-0 w-4 h-4 rounded border text-[10px] flex items-center justify-center transition-colors
                      ${isAdopted ? "bg-[var(--nv-success)] border-[var(--nv-success)] text-[var(--nv-text-primary)]" : "border-[var(--nv-border-3)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-text-secondary)]"}`}>
                    {isAdopted ? <Icon name="check" size={11} /> : null}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-[var(--nv-text-primary)]">{r.charA} ↔ {r.charB}</span>
                    <span className="text-[var(--nv-creative)] ml-2">{r.relation}</span>
                    {r.reason && <p className="text-[var(--nv-text-tertiary)] mt-0.5">{r.reason}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* 摘要 & 下章衔接 */}
      {extractionData.summary && (
        <details className="group">
          <summary className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-primary)]">
            <Icon name="file" size={14} className="text-[var(--nv-primary)]" /> 章节摘要
          </summary>
          <div className="mt-2 space-y-2 text-xs text-[var(--nv-text-secondary)]">
            {extractionData.summary.openingConnection && (
              <p><span className="text-[var(--nv-text-tertiary)]">章首衔接：</span>{extractionData.summary.openingConnection}</p>
            )}
            {extractionData.summary.keyEvents?.length > 0 && (
              <p><span className="text-[var(--nv-text-tertiary)]">关键事件：</span>{extractionData.summary.keyEvents.join(" → ")}</p>
            )}
            {extractionData.summary.chapterEndHook && (
              <p><span className="text-[var(--nv-text-tertiary)]">章尾钩子：</span>{extractionData.summary.chapterEndHook}</p>
            )}
            {extractionData.summary.closingSnapshot && (
              <p><span className="text-[var(--nv-text-tertiary)]">章尾氛围：</span>{extractionData.summary.closingSnapshot}</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
