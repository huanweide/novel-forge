"use client";

import { Icon, type IconName } from "@/components/ui/icons";
import type { ModuleKey } from "./worldPanelData";

interface WorldModuleSidebarProps {
  modules: ReadonlyArray<{ key: ModuleKey; label: string; icon: IconName; desc: string }>;
  activeModule: ModuleKey;
  getCount: (key: ModuleKey) => number;
  onSelect: (key: ModuleKey) => void;
  onSetShowCreate: (v: boolean) => void;
}

export function WorldModuleSidebar({
  modules, activeModule, getCount, onSelect, onSetShowCreate,
}: WorldModuleSidebarProps) {
  return (
    <div className="max-h-[40%] flex-shrink-0 space-y-0.5 overflow-y-auto border-b border-[var(--nv-border-2)] p-2">
      {modules.map((mod) => {
        const count = getCount(mod.key);
        const active = activeModule === mod.key;
        return (
          <button
            key={mod.key}
            onClick={() => { onSelect(mod.key); onSetShowCreate(false); }}
            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors ${
              active
                ? "border border-[var(--nv-primary)]/40 bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]"
                : "border border-transparent text-[var(--nv-text-tertiary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
            }`}
          >
            <span className="flex items-center gap-2">
              <Icon name={mod.icon} size={14} />
              <span>{mod.label}</span>
            </span>
            <span className={`text-[10px] ${count > 0 ? "text-[var(--nv-text-tertiary)]" : "text-[var(--nv-text-muted)]"}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
