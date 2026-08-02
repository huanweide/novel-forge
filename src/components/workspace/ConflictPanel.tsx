"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/icons";
import { toastError, toastSuccess } from "@/components/ui/toast";

interface ConflictOption {
  title: string;
  trigger: string;
  tension: string;
  outcome: string;
  caution: string;
}

export function ConflictPanel({
  open, projectId, projectName, onClose,
}: {
  open: boolean;
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const [situation, setSituation] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ConflictOption[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    setOptions([]);
    try {
      const res = await fetch("/api/generate/conflict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, situation: situation.trim() }),
      });
      const d = await res.json();
      if (res.ok && Array.isArray(d.options)) {
        setOptions(d.options);
        setNote(d.note || "");
      } else {
        setError(d.error || "推演失败");
      }
    } catch {
      setError("推演失败，请检查网络或 AI 配置后重试");
    } finally {
      setLoading(false);
    }
  };

  const copyOne = async (o: ConflictOption) => {
    const text = `【${o.title}】\n触发：${o.trigger}\n张力：${o.tension}\n走向：${o.outcome}\n风险/伏笔：${o.caution}`;
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess("已复制到剪贴板");
    } catch {
      toastError("复制失败，请手动选择");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="冲突推演"
      description={`基于《${projectName}》的世界观硬规则与主要角色，AI 推演数个冲突 / 转折发展选项。`}
      icon="lightbulb"
      size="xl"
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[var(--nv-text-tertiary)] mb-1">
            当前局势 / 想推演的方向（可选，留空则基于全书自动推演）
          </label>
          <textarea
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            placeholder="例如：主角刚获得古玉，想制造一个内部叛徒的冲突，或引入一个势均力敌的对手……"
            rows={3}
            className="w-full rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-3 py-2 text-sm text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)] resize-none"
          />
        </div>

        <button
          onClick={run}
          disabled={loading}
          className="btn-primary h-9 px-4 text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          {loading ? (
            <><Icon name="loader" size={15} className="animate-spin" /> 推演中…</>
          ) : (
            <><Icon name="lightbulb" size={15} /> 开始推演</>
          )}
        </button>

        {error && (
          <div className="text-xs text-[var(--nv-danger)] bg-[var(--nv-danger-soft)]/40 border border-[var(--nv-danger)]/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {options.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 text-xs text-[var(--nv-text-tertiary)] border border-[var(--nv-border-2)] rounded-lg px-3 py-2 bg-[var(--nv-surface-1)]">
              <Icon name="info" size={13} className="text-[var(--nv-creative)] shrink-0" />
              <span>{note} 最终情节决定权在你。</span>
            </div>

            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] p-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 font-medium text-[var(--nv-text-primary)] text-sm">
                      <Icon name="sword" size={14} className="text-[var(--nv-accent)]" />
                      {o.title}
                    </div>
                    <button
                      onClick={() => copyOne(o)}
                      className="text-[11px] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-primary)] inline-flex items-center gap-1 shrink-0"
                    >
                      <Icon name="clipboard" size={12} /> 复制
                    </button>
                  </div>
                  {o.trigger && (
                    <p className="text-xs text-[var(--nv-text-secondary)] leading-relaxed">
                      <span className="text-[var(--nv-text-tertiary)]">触发：</span>{o.trigger}
                    </p>
                  )}
                  {o.tension && (
                    <p className="text-xs text-[var(--nv-text-secondary)] leading-relaxed mt-1">
                      <span className="text-[var(--nv-text-tertiary)]">张力：</span>{o.tension}
                    </p>
                  )}
                  {o.outcome && (
                    <p className="text-xs text-[var(--nv-text-secondary)] leading-relaxed mt-1">
                      <span className="text-[var(--nv-text-tertiary)]">走向：</span>{o.outcome}
                    </p>
                  )}
                  {o.caution && (
                    <p className="text-xs text-[var(--nv-text-secondary)] leading-relaxed mt-1">
                      <span className="text-[var(--nv-text-tertiary)]">风险 / 伏笔：</span>{o.caution}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
