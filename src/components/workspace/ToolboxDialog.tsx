"use client";

import { Icon, type IconName } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";

export type ToolboxCategory = "write" | "generate" | "analyze";

export interface ToolboxItem {
  id: string;
  label: string;
  desc: string;
  icon: IconName;
  category: ToolboxCategory;
  action: () => void;
  badge?: string;
}

const CATEGORY_META: Record<ToolboxCategory, { label: string; desc: string; accent: string }> = {
  write: { label: "写作辅助", desc: "推进正文与结构", accent: "var(--nv-primary)" },
  generate: { label: "内容生成", desc: "创造设定与方向", accent: "var(--nv-creative)" },
  analyze: { label: "智能分析", desc: "检查质量与逻辑", accent: "var(--nv-accent)" },
};

export function ToolboxDialog({ items, onClose }: { items: ToolboxItem[]; onClose: () => void }) {
  const categories: ToolboxCategory[] = ["write", "generate", "analyze"];

  return (
    <Modal open onClose={onClose} bare panelClassName="max-h-[85vh] w-full max-w-3xl overflow-y-auto">
      <div className="p-5">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--nv-text-primary)]">工具箱</h3>
            <p className="mt-0.5 text-xs text-[var(--nv-text-tertiary)]">
              把分散在各处的写作能力收拢到一处，按用途快速找到入口。
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 text-[var(--nv-text-tertiary)] transition-colors hover:text-[var(--nv-text-primary)]" aria-label="关闭">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="space-y-5">
          {categories.map((cat) => {
            const catItems = items.filter((i) => i.category === cat);
            if (catItems.length === 0) return null;
            const meta = CATEGORY_META[cat];
            return (
              <div key={cat}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full" style={{ background: meta.accent }} />
                  <h4 className="text-sm font-medium text-[var(--nv-text-secondary)]">{meta.label}</h4>
                  <span className="text-[10px] text-[var(--nv-text-muted)]">· {meta.desc}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {catItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { item.action(); onClose(); }}
                      className="group flex flex-col gap-1.5 rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3 text-left transition-colors hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-2)]"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-lg"
                          style={{ background: `${meta.accent}1a`, color: meta.accent }}
                        >
                          <Icon name={item.icon} size={15} />
                        </span>
                        <span className="text-xs font-medium text-[var(--nv-text-primary)]">{item.label}</span>
                        {item.badge && (
                          <span className="ml-auto rounded bg-[var(--nv-surface-2)] px-1 text-[9px] text-[var(--nv-text-tertiary)]">{item.badge}</span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-[10px] leading-relaxed text-[var(--nv-text-tertiary)]">{item.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
