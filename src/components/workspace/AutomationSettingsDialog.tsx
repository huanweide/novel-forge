"use client";

import { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toastError, toastSuccess } from "@/components/ui/toast";

// 自动化填表设置弹窗（v0.33.0）
// 配置项：
// - autoFillEnabled：生成后自动填表总开关
// - fillFrequency：每 N 章填一次表
// - skipLatestChapter：默认跳过最近一章（用户可能重 roll 改写）
// - contextKeepChapters：上下文楼层数（前文窗口大小）
export function AutomationSettingsDialog({
  projectId, projectName, onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const [autoFillEnabled, setAutoFillEnabled] = useState(true);
  const [fillFrequency, setFillFrequency] = useState(3);
  const [skipLatestChapter, setSkipLatestChapter] = useState(true);
  const [contextKeepChapters, setContextKeepChapters] = useState(4);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);


  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/config`);
        const d = await res.json();
        if (!res.ok) {
          setLoadError(d.error || "读取配置失败");
          return;
        }
        if (!alive) return;
        if (typeof d.autoFillEnabled === "boolean") setAutoFillEnabled(d.autoFillEnabled);
        if (typeof d.fillFrequency === "number") setFillFrequency(d.fillFrequency);
        if (typeof d.skipLatestChapter === "boolean") setSkipLatestChapter(d.skipLatestChapter);
        if (typeof d.contextKeepChapters === "number") setContextKeepChapters(d.contextKeepChapters);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "网络错误");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [projectId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoFillEnabled,
          fillFrequency: Math.max(1, Math.min(50, Math.trunc(fillFrequency) || 3)),
          skipLatestChapter,
          contextKeepChapters: Math.max(1, Math.min(50, Math.trunc(contextKeepChapters) || 4)),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toastError(d.error || "保存失败");
        return;
      }
      toastSuccess("自动化填表配置已保存");
      onClose();
    } catch (err) {
      toastError("保存失败：" + (err instanceof Error ? err.message : "网络错误"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} bare panelClassName="max-w-lg max-h-[90vh] flex flex-col overflow-hidden" labelledBy="automation-settings-title">
      <div className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--nv-border-2)] shrink-0">
          <div>
            <h2 id="automation-settings-title" className="flex items-center gap-2 text-lg font-semibold text-[var(--nv-text-primary)]">
              <Icon name="bot" size={18} className="text-[var(--nv-creative)]" /> 自动化填表设置
            </h2>
            <p className="text-xs text-[var(--nv-text-tertiary)] mt-0.5">《{projectName}》</p>
          </div>
          <button onClick={onClose} className="text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)] transition-colors"><Icon name="x" size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar">
          {loading && <div className="text-sm text-[var(--nv-text-tertiary)]">加载配置中…</div>}
          {loadError && <div className="text-sm text-danger">{loadError}</div>}
          {!loading && !loadError && (
            <>
              {/* 总开关 */}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-[var(--nv-text-primary)]">生成后自动填表</div>
                  <div className="text-xs text-[var(--nv-text-tertiary)] mt-0.5">每章写完后自动抽取事实，回填结构化表格（创意工坊数据库），并持续注入永久上下文</div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center shrink-0">
                  <input type="checkbox" className="peer sr-only" checked={autoFillEnabled} onChange={(e) => setAutoFillEnabled(e.target.checked)} />
                  <div className="h-6 w-11 rounded-full bg-[var(--nv-surface-3)] transition-colors peer-checked:bg-[var(--nv-primary)]" />
                  <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
                </label>
              </div>

              {/* 频率 */}
              <div className={`rounded-xl border border-[var(--nv-border-2)] px-4 py-3 ${autoFillEnabled ? "" : "opacity-50"}`}>
                <label className="text-sm text-[var(--nv-text-secondary)] block mb-2">填表频率（每 N 章填一次）</label>
                <input type="number" min={1} max={50} value={fillFrequency}
                  disabled={!autoFillEnabled}
                  onChange={(e) => setFillFrequency(Number(e.target.value))}
                  className="input-glass w-28 rounded-lg px-3 py-2 text-sm focus:border-[var(--nv-primary)] disabled:opacity-60" />
                <p className="text-xs text-[var(--nv-text-tertiary)] mt-1.5">默认每 3 章填一次。例如设为 5，则第 5、10、15… 章写完后填表；其余章不填。</p>
              </div>

              {/* 跳过最近章 */}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--nv-border-2)] px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-[var(--nv-text-primary)]">跳过最近一章</div>
                  <div className="text-xs text-[var(--nv-text-tertiary)] mt-0.5">默认开启：用户常对最新章重生成（re-roll）改写，跳过可避免把临时稿写入表格</div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center shrink-0">
                  <input type="checkbox" className="peer sr-only" checked={skipLatestChapter} onChange={(e) => setSkipLatestChapter(e.target.checked)} />
                  <div className="h-6 w-11 rounded-full bg-[var(--nv-surface-3)] transition-colors peer-checked:bg-[var(--nv-primary)]" />
                  <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
                </label>
              </div>

              {/* 上下文楼层 */}
              <div className="rounded-xl border border-[var(--nv-border-2)] px-4 py-3">
                <label className="text-sm text-[var(--nv-text-secondary)] block mb-2">上下文楼层数（前文窗口）</label>
                <input type="number" min={1} max={50} value={contextKeepChapters}
                  onChange={(e) => setContextKeepChapters(Number(e.target.value))}
                  className="input-glass w-28 rounded-lg px-3 py-2 text-sm focus:border-[var(--nv-primary)]" />
                <p className="text-xs text-[var(--nv-text-tertiary)] mt-1.5">生成每章时向前保留的最大章节数（前文上下文窗口）。结构化表格本身持久保存，会持续注入上下文。</p>
              </div>
            </>
          )}
        </div>
        {!loading && !loadError && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--nv-border-2)] shrink-0">
            <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="flex items-center gap-1.5">
              {saving && <Icon name="loader" size={13} className="animate-spin" />} 保存配置
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
