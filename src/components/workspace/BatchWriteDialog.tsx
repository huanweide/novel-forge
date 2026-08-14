"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

export interface OutlineItem {
  nodeId: string;
  title: string;
  outline: string;
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// v1.6.0 批量写作两阶段（受控版）：
//  阶段1：选数量 + 作者指令 → 「先生成章纲」（后台逐章建章+生成章纲，轮询进度；可关窗，任务继续）
//  阶段2：章纲列表（可勾选、可编辑每章章纲）→ 「确认生成正文」（保存章纲后后台逐章写正文）
// 组件完全受控：所有状态由父组件（page）持有并轮询，本组件只负责渲染与回调。
export function BatchWriteDialog({
  open,
  phase,
  count,
  note,
  progress,
  elapsedSec,
  outlines,
  checked,
  confirming,
  onCountChange,
  onNoteChange,
  onStart,
  onClose,
  onToggle,
  onEdit,
  onConfirm,
}: {
  open: boolean;
  phase: "input" | "running" | "review";
  count: number;
  note: string;
  progress: { done: number; total: number; pct: number };
  elapsedSec: number;
  outlines: OutlineItem[];
  checked: Set<string>;
  confirming: boolean;
  onCountChange: (n: number) => void;
  onNoteChange: (s: string) => void;
  onStart: () => void;
  onClose: () => void;
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <Modal open onClose={onClose} bare panelClassName="max-w-2xl" closeOnOverlay={false} labelledBy="batch-write-title">
      <div className="p-5 max-h-[80vh] overflow-y-auto">
        <h2 id="batch-write-title" className="text-lg font-semibold flex items-center gap-2 mb-1">
          <Icon name="pencil" size={16} className="text-[var(--nv-primary)]" /> 批量写作
        </h2>

        {phase === "input" && (
          <>
            <p className="text-xs text-[var(--nv-text-muted)] mb-4">
              两步流程：先生成 N 章章纲（后台运行）→ 逐章查看/编辑、勾选 → 确认后后台生成正文（可关窗口，进度在右下角）。
            </p>
            <label className="block text-sm text-[var(--nv-text-secondary)] mb-1">章节数量（1-10，默认 3）</label>
            <input
              type="number"
              min={1}
              max={10}
              aria-label="章节数量（1-10，默认 3）"
              value={count}
              onChange={(e) => onCountChange(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="input-glass w-24 rounded-lg px-3 py-2 text-sm"
            />
            <label className="block text-sm text-[var(--nv-text-secondary)] mt-4 mb-1">作者指令（可选，贯穿所有章）</label>
            <textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              rows={3}
              placeholder="例如：本批写主角进入龙庭集团后的三章，节奏加快"
              className="input-glass w-full rounded-lg px-3 py-2 text-sm resize-y"
            />
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={onClose}>取消</Button>
              <Button onClick={onStart} className="btn-primary">先生成章纲</Button>
            </div>
          </>
        )}

        {phase === "running" && (
          <div className="py-8 flex flex-col items-center gap-3">
            <Icon name="loader" size={22} className="animate-spin text-[var(--nv-primary)]" />
            <p className="text-sm text-[var(--nv-text-secondary)]">
              正在后台生成章纲… {progress.done}/{progress.total} 章（{progress.pct}%）
            </p>
            <p className="text-xs text-[var(--nv-text-tertiary)]">
              已运行 {fmtElapsed(elapsedSec)} · 可关闭窗口，完成后自动回到本弹窗查看章纲
            </p>
          </div>
        )}

        {phase === "review" && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-[var(--nv-text-muted)]">
                已生成 {outlines.length} 章章纲：勾选要写的章节，可直接编辑章纲文本；「作者指令」会随正文生成一并生效。
              </p>
              <button
                onClick={() => {
                  const all = outlines.length > 0 && checked.size === outlines.length;
                  outlines.forEach((i) => (all ? onToggle(i.nodeId) : !checked.has(i.nodeId) && onToggle(i.nodeId)));
                }}
                className="text-xs text-[var(--nv-primary)] hover:underline shrink-0"
              >
                {checked.size === outlines.length ? "取消全选" : "全选"}
              </button>
            </div>
            <div className="space-y-3">
              {outlines.map((item, idx) => (
                <div key={item.nodeId} className={`rounded-xl border p-3 ${checked.has(item.nodeId) ? "border-[var(--nv-primary)]/40 bg-[var(--nv-primary-soft)]/20" : "border-[var(--nv-border-2)] bg-[var(--nv-surface-2)]/40 opacity-60"}`}>
                  <label className="flex items-center gap-2 cursor-pointer mb-1.5">
                    <input type="checkbox" checked={checked.has(item.nodeId)} onChange={() => onToggle(item.nodeId)} className="accent-[var(--nv-primary)]" />
                    <span className="text-sm font-medium text-[var(--nv-text-primary)]">第 {idx + 1} 章 · 章纲</span>
                  </label>
                  <textarea
                    aria-label={`第 ${idx + 1} 章 章纲`}
                    value={item.outline}
                    onChange={(e) => onEdit(item.nodeId, e.target.value)}
                    rows={4}
                    disabled={!checked.has(item.nodeId)}
                    className="input-glass w-full rounded-lg px-3 py-2 text-xs resize-y leading-relaxed"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={onClose}>稍后处理</Button>
              <Button onClick={onConfirm} disabled={confirming} className="btn-primary">
                {confirming ? "确认中…" : `确认生成正文（${checked.size} 章）`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
