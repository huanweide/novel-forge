"use client";

import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";

export function ExpandResultModal({
  result,
  onClose,
  progress,
  done,
  total,
  expanding,
}: {
  result: {
    okList: string[]; failList: Array<{ name: string; reason: string }>; total: number;
  } | null;
  onClose: () => void;
  progress: Array<{ name: string; status: string; error?: string }>;
  done: number;
  total: number;
  expanding: boolean;
}) {
  return (
    <>
      {/* 扩展进度 */}
      {expanding && (
        <div className="mb-2 p-2 rounded bg-[var(--nv-accent-soft)] border border-[var(--nv-accent-soft)] max-h-40 overflow-y-auto">
          {progress.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-[var(--nv-accent)]">
              <div className="w-3 h-3 border-2 border-[var(--nv-accent)] border-t-transparent rounded-full animate-spin" />
              加载全局上下文...
            </div>
          )}
          {progress.map((p, i) => {
            const isInfo = p.status === "start" || p.status === "dedup";
            const isOk = p.status === "ok" || p.status === "char-done";
            const isFailed = p.status === "failed" || p.status === "char-failed";
            if (isInfo) return (
              <div key={i} className="text-xs text-[var(--nv-text-secondary)] py-0.5">{p.name}</div>
            );
            return (
              <div key={i} className={`text-xs ${isOk ? "text-[var(--nv-success)]" : isFailed ? "text-[var(--nv-danger)]" : "text-[var(--nv-text-secondary)]"}`}>
                <span className="inline-flex items-center gap-1">
                  <span>{isOk ? <Icon name="check" size={12} /> : isFailed ? <Icon name="alert" size={12} /> : <Icon name="loader" size={12} className="animate-spin" />}</span>
                  <span>{p.name}</span>
                  {p.error && <span className="text-[var(--nv-danger)]/60 text-[10px] ml-1">— {p.error}</span>}
                </span>
              </div>
            );
          })}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-[var(--nv-surface-1)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--nv-accent)] rounded-full transition-all" style={{
                width: `${total > 0 ? Math.round((done / total) * 100) : 0}%`
              }} />
            </div>
            <span className="text-xs text-[var(--nv-text-secondary)] shrink-0">{done}/{total} · {total > 0 ? Math.round((done / total) * 100) : 0}%</span>
          </div>
        </div>
      )}

      {/* 扩展结果弹窗 */}
      {result && (
        <Modal open onClose={onClose} bare panelClassName="w-[480px] max-h-[80vh] flex flex-col overflow-hidden" labelledBy="expand-result-title">
            {/* 头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--nv-border-1)]">
              <h3 id="expand-result-title" className="text-base font-bold text-[var(--nv-text-primary)]">
                {result.failList.length === 0 ? <span className="flex items-center gap-1.5"><Icon name="check" size={15} className="text-[var(--nv-success)]" /> 全部扩展成功</span> : <span className="flex items-center gap-1.5"><Icon name="clipboard" size={15} /> 扩展结果</span>}
              </h3>
              <button onClick={onClose} className="text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] text-lg leading-none"><Icon name="x" size={12} className="align-middle" /></button>
            </div>

            {/* 统计 */}
            <div className="px-5 py-3 flex gap-4 text-sm border-b border-[var(--nv-border-1)]/50">
              <div className="flex items-center gap-2">
                <span className="text-[var(--nv-success)] font-bold text-lg">{result.okList.length}</span>
                <span className="text-[var(--nv-text-secondary)]">成功</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={result.failList.length > 0 ? "text-[var(--nv-danger)] font-bold text-lg" : "text-[var(--nv-text-secondary)] font-bold text-lg"}>{result.failList.length}</span>
                <span className="text-[var(--nv-text-secondary)]">失败</span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[var(--nv-text-secondary)] text-xs">共 {result.total} 个角色</span>
              </div>
            </div>

            {/* 内容区 */}
            <div className="overflow-y-auto px-5 py-3 flex-1 max-h-[50vh]">
              {/* 成功列表 */}
              {result.okList.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-[var(--nv-success)] font-medium mb-1.5 flex items-center gap-1"><Icon name="check" size={12} />成功 ({result.okList.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {result.okList.map((name, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-[var(--nv-success-soft)] text-[var(--nv-success)] border border-[var(--nv-success-soft)]">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 失败列表 + 原因 */}
              {result.failList.length > 0 && (
                <div>
                  <div className="text-xs text-[var(--nv-danger)] font-medium mb-1.5 flex items-center gap-1"><Icon name="alert" size={12} />失败 ({result.failList.length})</div>
                  <div className="space-y-1.5">
                    {result.failList.map((f, i) => (
                      <div key={i} className="p-2 rounded bg-[var(--nv-danger-soft)] border border-[var(--nv-danger-soft)]">
                        <div className="text-xs text-[var(--nv-danger)] font-medium">{f.name}</div>
                        <div className="text-[11px] text-[var(--nv-danger)]/70 mt-0.5">{f.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.okList.length === 0 && result.failList.length === 0 && (
                <div className="text-sm text-[var(--nv-text-secondary)] text-center py-8">无结果数据</div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="px-5 py-3 border-t border-[var(--nv-border-1)] flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-sm rounded-lg bg-[var(--nv-accent)] hover:bg-[var(--nv-accent)]/80 text-[var(--nv-text-primary)] font-medium"
              >
                知道了
              </button>
            </div>
      </Modal>
      )}
    </>
  );
}
