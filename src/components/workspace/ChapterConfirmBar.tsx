"use client";

/**
 * ChapterConfirmBar — 马斯克确认流程常驻确认栏
 *
 * 贴在中栏正文下方（PostGenPanel 同区），4 键状态机驱动：
 *   completed/drafting → [提交确认] [AI诊断]
 *   pending_confirm     → [确认通过] [打回重写(须填理由)] [AI诊断]
 *   confirmed          → [重开] + 已确认徽标
 * 另含项目级「整本确认完成」按钮（仅当全部章节 confirmed 且未整体交付时浮出）。
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toastSuccess, toastError } from "@/components/ui/toast";

interface ChapterConfirmBarProps {
  projectId: string;
  nodeId: string;
  nodeStatus: string;
  allConfirmed: boolean;
  projectConfirmedAt: string | null;
  onAction: () => void;          // 动作成功后刷新（loadProject + 刷新 selectedNode）
  onDiagnose: () => void;        // 打开 PostGenPanel 审校 Tab
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: string }> = {
    outline_only: { label: "仅有大纲", cls: "text-[var(--nv-text-tertiary)] bg-[var(--nv-surface-3)]", icon: "circle" },
    drafting: { label: "草稿中", cls: "text-[var(--nv-text-secondary)] bg-[var(--nv-surface-3)]", icon: "pencil" },
    completed: { label: "已生成·待提交", cls: "text-[var(--nv-text-secondary)] bg-[var(--nv-surface-3)]", icon: "file" },
    pending_confirm: { label: "待确认", cls: "text-[var(--nv-accent)] bg-[var(--nv-accent-soft)]", icon: "alert" },
    confirmed: { label: "已确认定稿", cls: "text-[var(--nv-success)] bg-[var(--nv-success)]/10", icon: "check" },
    reviewing: { label: "审校中", cls: "text-[var(--nv-accent)] bg-[var(--nv-accent-soft)]", icon: "alert" },
    rejected: { label: "审校未通过", cls: "text-[var(--nv-danger)] bg-[var(--nv-danger)]/10", icon: "x" },
    revised: { label: "已修改", cls: "text-[var(--nv-text-secondary)] bg-[var(--nv-surface-3)]", icon: "pencil" },
  };
  const s = map[status] || map.outline_only;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${s.cls}`}>
      <Icon name={s.icon as any} size={10} /> {s.label}
    </span>
  );
}

export function ChapterConfirmBar({
  projectId, nodeId, nodeStatus, allConfirmed, projectConfirmedAt, onAction, onDiagnose,
}: ChapterConfirmBarProps) {
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  const call = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/story/nodes/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toastSuccess(action === "confirm" ? "已确认定稿 ✓（自动填表已执行）" : action === "submit" ? "已提交确认，等待马斯克拍板" : action === "reject" ? "已打回重写（保留快照）" : action === "reopen" ? "已重开为草稿" : "已记录");
        setShowReject(false); setReason("");
        onAction();
      } else {
        toastError(d.error || `操作失败（${res.status}）`);
      }
    } catch (err) {
      toastError("操作失败：" + (err instanceof Error ? err.message : "网络错误"));
    } finally { setBusy(false); }
  };

  const confirmProject = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/confirm`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { toastSuccess("整本确认完成 🚀 项目创作确认流程走通！"); onAction(); }
      else if (res.status === 409) { toastError(d.error || "还有章节未确认"); }
      else { toastError(d.error || `操作失败（${res.status}）`); }
    } catch (err) {
      toastError("操作失败：" + (err instanceof Error ? err.message : "网络错误"));
    } finally { setBusy(false); }
  };

  const isConfirmable = nodeStatus === "completed" || nodeStatus === "drafting";
  const isPending = nodeStatus === "pending_confirm";
  const isConfirmed = nodeStatus === "confirmed";

  return (
    <div className="surface-elevated rounded-2xl border border-[var(--nv-border-2)] px-4 py-3 mt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Icon name="clipboard" size={13} className="text-[var(--nv-primary)]" />
          <span className="text-xs font-semibold text-[var(--nv-text-secondary)]">马斯克确认流程</span>
          <StatusBadge status={nodeStatus} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isConfirmable && (
            <>
              <Button size="sm" className="btn-primary h-7 text-xs" disabled={busy} onClick={() => call("submit")}>提交确认</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={onDiagnose}>AI诊断</Button>
            </>
          )}
          {isPending && (
            <>
              <Button size="sm" className="h-7 text-xs bg-[var(--nv-success)] hover:bg-[var(--nv-success)]/90 text-white" disabled={busy} onClick={() => call("confirm")}>确认通过</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs border-[var(--nv-danger)]/40 text-[var(--nv-danger)] hover:bg-[var(--nv-danger)]/10" disabled={busy} onClick={() => setShowReject((v) => !v)}>打回重写</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={onDiagnose}>AI诊断</Button>
            </>
          )}
          {isConfirmed && (
            <>
              <span className="text-[10px] text-[var(--nv-success)] flex items-center gap-1"><Icon name="check" size={11} /> 定稿已锁定</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => call("reopen")}>重开</Button>
            </>
          )}
          {nodeStatus === "outline_only" && (
            <span className="text-[10px] text-[var(--nv-text-tertiary)]">先生成/手写正文，再走确认流程</span>
          )}
        </div>
      </div>

      {showReject && (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="打回理由（必填，留痕供迭代）"
            className="input-glass flex-1 rounded px-2 py-1 text-xs"
          />
          <Button size="sm" className="h-7 text-xs bg-[var(--nv-danger)] hover:bg-[var(--nv-danger)]/90 text-white" disabled={busy || !reason.trim()} onClick={() => call("reject", { reason })}>确认打回</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowReject(false)}>取消</Button>
        </div>
      )}

      {allConfirmed && !projectConfirmedAt && (
        <div className="mt-3 pt-3 border-t border-[var(--nv-border-2)] flex items-center justify-between">
          <span className="text-[11px] text-[var(--nv-text-secondary)]">全部章节已确认定稿，可整本交付。</span>
          <Button size="sm" className="btn-primary h-7 text-xs" disabled={busy} onClick={confirmProject}>项目确认完成 🚀</Button>
        </div>
      )}
      {projectConfirmedAt && (
        <div className="mt-3 pt-3 border-t border-[var(--nv-border-2)] flex items-center gap-1 text-[11px] text-[var(--nv-success)]">
          <Icon name="check" size={12} /> 整本已确认交付（{new Date(projectConfirmedAt).toLocaleString("zh-CN")}）
        </div>
      )}
    </div>
  );
}
