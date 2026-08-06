"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toastError, toastSuccess, toastInfo } from "@/components/ui/toast";

interface OutlineItem {
  nodeId: string;
  title: string;
  outline: string;
}

// v1.6.0 批量写作两阶段：
//  阶段1：选数量 + 作者指令 → 「先生成章纲」（后台逐章建章+生成章纲，轮询进度）
//  阶段2：章纲列表（可勾选、可编辑每章章纲）→ 「确认生成正文」（保存章纲后后台逐章写正文，可关窗口）
export function BatchWriteDialog({
  projectId,
  onClose,
  onConfirmWrite,
}: {
  projectId: string;
  onClose: () => void;
  onConfirmWrite: (nodeIds: string[], authorNote: string) => void;
}) {
  const [count, setCount] = useState(3);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<"input" | "running" | "review">("input");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, pct: 0, msg: "" });
  const [outlines, setOutlines] = useState<OutlineItem[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  // 轮询章纲任务
  useEffect(() => {
    if (phase !== "running" || !taskId) return;
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/babylore/fill-task/${taskId}`);
        const t = await r.json();
        setProgress({ done: t.done || 0, total: t.total || 0, pct: t.progress || 0, msg: t.error || "" });
        if (t.status === "completed") {
          clearInterval(timer);
          const items: OutlineItem[] = Array.isArray((t.result || {}).outlines) ? (t.result.outlines as OutlineItem[]) : [];
          if (items.length === 0) {
            setPhase("input");
            toastError("章纲生成失败：未返回任何章纲，请重试");
            return;
          }
          setOutlines(items);
          setChecked(new Set(items.map((i) => i.nodeId)));
          setPhase("review");
          toastSuccess(`章纲生成完成：${items.length} 章，可逐章查看/编辑后确认生成正文`);
        } else if (t.status === "failed") {
          clearInterval(timer);
          setPhase("input");
          toastError("章纲生成失败：" + (t.error || "未知错误"));
        }
      } catch {
        /* 下轮重试 */
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [phase, taskId]);

  const startOutlines = async () => {
    setPhase("running");
    setProgress({ done: 0, total: count, pct: 0, msg: "" });
    try {
      const res = await fetch("/api/story/batch-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, count, authorNote: note || undefined, mode: "outline" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!d.taskId) {
        setPhase("input");
        toastError(d.error || "启动失败");
        return;
      }
      setTaskId(d.taskId);
      toastInfo("章纲生成已启动（后台运行），完成后在本窗口查看");
    } catch (e) {
      setPhase("input");
      toastError("启动失败：" + (e instanceof Error ? e.message : "网络错误"));
    }
  };

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const editOutline = (id: string, text: string) => {
    setOutlines((prev) => prev.map((i) => (i.nodeId === id ? { ...i, outline: text } : i)));
  };

  // 保存编辑过的章纲 → 确认生成正文（后台）
  const confirmWrite = async () => {
    const ids = outlines.filter((i) => checked.has(i.nodeId)).map((i) => i.nodeId);
    if (ids.length === 0) {
      toastError("请至少勾选一个章节");
      return;
    }
    setConfirming(true);
    try {
      // 逐章保存编辑后的章纲（只有编辑过的才发，省请求）
      for (const item of outlines) {
        if (!checked.has(item.nodeId)) continue;
        const res = await fetch(`/api/story/nodes/${item.nodeId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outline: item.outline }),
        });
        if (!res.ok) toastError(`第 ${item.title} 章纲保存失败`);
      }
      onConfirmWrite(ids, note);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal open onClose={phase === "running" ? () => {} : onClose} bare panelClassName="max-w-2xl" closeOnOverlay={false} labelledBy="batch-write-title">
      <div className="p-5 max-h-[80vh] overflow-y-auto">
        <h2 id="batch-write-title" className="text-lg font-semibold flex items-center gap-2 mb-1">
          <Icon name="pencil" size={16} className="text-[var(--nv-primary)]" /> 批量写作
        </h2>

        {phase === "input" && (
          <>
            <p className="text-xs text-[var(--nv-text-muted)] mb-4">
              两步流程：先生成 N 章章纲（后台运行）→ 逐章查看/编辑、勾选 → 确认后后台生成正文（可关窗口，进度在右下角）。
            </p>
            <label className="block text-sm text-[var(--nv-text-secondary)] mb-1">章节数量（1-10）</label>
            <input
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="input-glass w-24 rounded-lg px-3 py-2 text-sm"
            />
            <label className="block text-sm text-[var(--nv-text-secondary)] mt-4 mb-1">作者指令（可选，贯穿所有章）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="例如：本批写主角进入龙庭集团后的三章，节奏加快"
              className="input-glass w-full rounded-lg px-3 py-2 text-sm resize-y"
            />
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={onClose}>取消</Button>
              <Button onClick={startOutlines} className="btn-primary">先生成章纲</Button>
            </div>
          </>
        )}

        {phase === "running" && (
          <div className="py-8 flex flex-col items-center gap-3">
            <Icon name="loader" size={22} className="animate-spin text-[var(--nv-primary)]" />
            <p className="text-sm text-[var(--nv-text-secondary)]">正在后台生成章纲… {progress.done}/{progress.total} 章（{progress.pct}%）</p>
            <p className="text-xs text-[var(--nv-text-tertiary)]">可关闭窗口，完成后回到本弹窗查看章纲（弹窗保持打开即可自动刷新）</p>
          </div>
        )}

        {phase === "review" && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-[var(--nv-text-muted)]">
                已生成 {outlines.length} 章章纲：勾选要写的章节，可直接编辑章纲文本；「作者指令」会随正文生成一并生效。
              </p>
              <button
                onClick={() => setChecked(new Set(checked.size === outlines.length ? [] : outlines.map((i) => i.nodeId)))}
                className="text-xs text-[var(--nv-primary)] hover:underline shrink-0"
              >
                {checked.size === outlines.length ? "取消全选" : "全选"}
              </button>
            </div>
            <div className="space-y-3">
              {outlines.map((item, idx) => (
                <div key={item.nodeId} className={`rounded-xl border p-3 ${checked.has(item.nodeId) ? "border-[var(--nv-primary)]/40 bg-[var(--nv-primary-soft)]/20" : "border-[var(--nv-border-2)] bg-[var(--nv-surface-2)]/40 opacity-60"}`}>
                  <label className="flex items-center gap-2 cursor-pointer mb-1.5">
                    <input type="checkbox" checked={checked.has(item.nodeId)} onChange={() => toggle(item.nodeId)} className="accent-[var(--nv-primary)]" />
                    <span className="text-sm font-medium text-[var(--nv-text-primary)]">第 {idx + 1} 章 · 章纲</span>
                  </label>
                  <textarea
                    value={item.outline}
                    onChange={(e) => editOutline(item.nodeId, e.target.value)}
                    rows={4}
                    disabled={!checked.has(item.nodeId)}
                    className="input-glass w-full rounded-lg px-3 py-2 text-xs resize-y leading-relaxed"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={() => { setPhase("input"); setOutlines([]); setChecked(new Set()); }}>返回修改</Button>
              <Button onClick={confirmWrite} disabled={confirming} className="btn-primary">
                {confirming ? "确认中…" : `确认生成正文（${checked.size} 章）`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
