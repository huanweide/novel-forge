"use client";

import { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toastError, toastSuccess, toastInfo, confirmDialog } from "@/components/ui/toast";
import { Switch } from "@/components/ui/switch";
import { useProjectStore } from "@/store";

// 自动填表弹窗（v0.33.0 原「自动化填表设置」；v1.2.0 改名「自动填表」并加一键追评）
// 配置项：
// - autoFillEnabled：生成后自动填表总开关（v2.56.0 起默认关）
// - fillFrequency：每 N 章填一次表
// - skipLatestChapter：默认跳过最近一章（用户可能重 roll 改写）
// - contextKeepChapters：上下文楼层数（前文窗口大小）
// - autoConfirmEnabled / autoDeliverEnabled：确认/交付模式开关（与确认栏同源，集中此处管控）
// 操作：一键追评所有未填表章节（POST /api/babylore/fill-all）
export function AutomationSettingsDialog({
  projectId, projectName, onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const [autoFillEnabled, setAutoFillEnabled] = useState(false);
  const [fillFrequency, setFillFrequency] = useState(3);
  const [skipLatestChapter, setSkipLatestChapter] = useState(true);
  const [contextKeepChapters, setContextKeepChapters] = useState(4);
  const [autoConfirmEnabled, setAutoConfirmEnabled] = useState(true);
  const [autoDeliverEnabled, setAutoDeliverEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fillingAll, setFillingAll] = useState(false);
  const [fillAllMsg, setFillAllMsg] = useState("");
  const fillTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => {
    if (fillTimerRef.current) {
      clearInterval(fillTimerRef.current);
      fillTimerRef.current = null;
    }
  };

  // v1.4.0：一键追评改后台——创建任务立即返回，后台逐章执行，前端轮询进度；关页面任务继续
  const runFillAll = async () => {
    const ok = await confirmDialog({
      title: "一键追评所有未填表章节",
      description: "从第一章到最新一章逐章自动抽取事实、回填全部结构化表格与角色卡/世界书（已填过的章节自动跳过防重复）。启动后转为后台运行：你可关闭本窗口，任务继续执行，进度稍后查看。是否启动？",
      confirmText: "启动后台填表",
      cancelText: "取消",
    });
    if (!ok) return;
    setFillingAll(true);
    setFillAllMsg("正在启动后台填表…");
    try {
      const res = await fetch(`/api/babylore/fill-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!d.taskId) {
        setFillAllMsg("启动失败：" + (d.error || "未知错误"));
        toastError(d.error || "一键填表启动失败");
        setFillingAll(false);
        return;
      }
      setFillAllMsg("后台填表已启动，可关闭本窗口（任务继续运行）");
      toastInfo("后台填表已启动，可关闭本窗口");
      // 轮询进度（2.5s/次）
      fillTimerRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/babylore/fill-task/${d.taskId}`);
          const t = await r.json();
          if (t.status === "completed") {
            stopPoll();
            setFillingAll(false);
            const applied = t.result?.applied ?? 0;
            const processed = t.result?.processed ?? 0;
            setFillAllMsg(`完成：应用 ${applied} 条（处理 ${processed} 章）`);
            toastSuccess(`后台填表完成：应用 ${applied} 条`);
          } else if (t.status === "failed") {
            stopPoll();
            setFillingAll(false);
            const msg = t.error || t.result?.error || "未知错误";
            setFillAllMsg("失败：" + msg);
            toastError("后台填表失败：" + msg);
          } else {
            setFillAllMsg(`后台填表中… ${t.done}/${t.total} 章（${t.progress}%）`);
          }
        } catch { /* 轮询失败下轮重试 */ }
      }, 2500);
    } catch (err) {
      setFillAllMsg("启动失败：" + (err instanceof Error ? err.message : "网络错误"));
      toastError("启动失败：" + (err instanceof Error ? err.message : "网络错误"));
      setFillingAll(false);
    }
  };

  useEffect(() => () => stopPoll(), []);


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
        if (typeof d.autoConfirmEnabled === "boolean") setAutoConfirmEnabled(d.autoConfirmEnabled);
        if (typeof d.autoDeliverEnabled === "boolean") setAutoDeliverEnabled(d.autoDeliverEnabled);
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
          autoConfirmEnabled,
          autoDeliverEnabled,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toastError(d.error || "保存失败");
        return;
      }
      // 同步前端 store，使工作区确认栏即时反映（无需重挂载）
      useProjectStore.getState().patchProject({ autoConfirmEnabled, autoDeliverEnabled });
      toastSuccess("自动填表配置已保存");
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
              <Icon name="bot" size={18} className="text-[var(--nv-creative)]" /> 自动填表
            </h2>
            <p className="text-xs text-[var(--nv-text-tertiary)] mt-0.5">《{projectName}》</p>
          </div>
          <button onClick={onClose} aria-label="关闭" className="text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)] transition-colors"><Icon name="x" size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar">
          {loading && <div className="text-sm text-[var(--nv-text-tertiary)]">加载配置中…</div>}
          {loadError && <div className="text-sm text-danger">{loadError}</div>}
          {!loading && !loadError && (
            <>
              {/* 一键追评所有未填表章节（v1.2.0） */}
              <div className="rounded-xl border border-[var(--nv-creative)]/40 bg-[var(--nv-creative-soft)]/30 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[var(--nv-text-primary)]">一键追评所有未填表章节</div>
                    <div className="text-xs text-[var(--nv-text-tertiary)] mt-0.5">从第一章到最新一章，把还没填表的章节全部自动填上（已填的自动跳过）</div>
                  </div>
                  <Button size="sm" onClick={runFillAll} disabled={fillingAll} className="flex items-center gap-1.5 shrink-0">
                    {fillingAll && <Icon name="loader" size={13} className="animate-spin" />} {fillingAll ? "追评中…" : "一键填表"}
                  </Button>
                </div>
                {fillAllMsg && <p className="text-xs mt-2 text-[var(--nv-text-tertiary)]">{fillAllMsg}</p>}
              </div>

              {/* 总开关 */}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-[var(--nv-text-primary)]">生成后自动填表</div>
                  <div className="text-xs text-[var(--nv-text-tertiary)] mt-0.5">每章写完后自动抽取事实，回填结构化表格（创意工坊数据库），并持续注入永久上下文。开启后，发现的新角色/世界实体会默认同意写入结构化表（v2.56.0 起默认关闭，避免每章自动填表产生脏卡）</div>
                </div>
                <Switch checked={autoFillEnabled} onCheckedChange={setAutoFillEnabled} size="sm" />
              </div>

              {/* 自动确认（智能审阅） */}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-[var(--nv-text-primary)]">自动确认（智能审阅）</div>
                  <div className="text-xs text-[var(--nv-text-tertiary)] mt-0.5">合格章生成后由系统自动定稿，你从审批者降级为异常处理者；关闭则逐章人工确认（默认开启）</div>
                </div>
                <Switch checked={autoConfirmEnabled} onCheckedChange={setAutoConfirmEnabled} size="sm" />
              </div>

              {/* 自动交付全书 */}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--nv-border-2)] px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-[var(--nv-text-primary)]">自动交付全书</div>
                  <div className="text-xs text-[var(--nv-text-tertiary)] mt-0.5">全书章节全部定稿后自动完成整本交付，无需手动点「确认整本交付」（默认开启）</div>
                </div>
                <Switch checked={autoDeliverEnabled} onCheckedChange={setAutoDeliverEnabled} size="sm" />
              </div>

              {/* 频率 */}
              <div className={`rounded-xl border border-[var(--nv-border-2)] px-4 py-3 ${autoFillEnabled ? "" : "opacity-50"}`}>
                <label className="text-sm text-[var(--nv-text-secondary)] block mb-2">填表频率（每 N 章填一次）</label>
                <input type="number" min={1} max={50} value={fillFrequency} aria-label="填表频率（每 N 章填一次）"
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
                <Switch checked={skipLatestChapter} onCheckedChange={setSkipLatestChapter} size="sm" />
              </div>

              {/* 上下文楼层 */}
              <div className="rounded-xl border border-[var(--nv-border-2)] px-4 py-3">
                <label className="text-sm text-[var(--nv-text-secondary)] block mb-2">上下文楼层数（前文窗口）</label>
                <input type="number" min={1} max={50} value={contextKeepChapters} aria-label="上下文楼层数（前文窗口）"
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
