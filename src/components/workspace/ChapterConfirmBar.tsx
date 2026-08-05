"use client";

/**
 * ChapterConfirmBar — 确认流程常驻确认栏
 *
 * 贴在中栏正文下方（PostGenPanel 同区）。
 * 智能审阅模式（autoConfirmEnabled）：合格章由系统自动确认，人类从审批者降级为异常处理者——
 *   故单章仅在「被系统拦截 / 用户主动人工接管」时展开 4 键，常态只显「系统自动判定」+ AI诊断 + 人工接管。
 * 保守模式（开关关）：保留原逐章 4 键（提交/确认通过/打回/AI诊断/重开）。
 * 新增「智能交付全书 🚀」主入口：一键扫描全书 → 合格自动放行 + 拦截清单 → 整本交付。
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import { toastSuccess, toastError } from "@/components/ui/toast";

interface ChapterConfirmBarProps {
  projectId: string;
  nodeId: string;
  nodeStatus: string;
  allConfirmed: boolean;
  projectConfirmedAt: string | null;
  autoConfirmEnabled?: boolean;
  onAction: () => void;          // 动作成功后刷新（loadProject + 刷新 selectedNode）
  onDiagnose: () => void;        // 打开 PostGenPanel 审校 Tab
}

function StatusBadge({ status }: { status: string }) {
  // 体验减法（Max Loop Round6）：状态徽章对齐 story-status.ts 六态枚举（删历史假态 rejected/revised），
  // 视觉三档——灰=进行中/待处理、橙=需行动、绿=已定稿；未知状态兜底灰显，不误导作者。
  const map: Record<string, { label: string; cls: string; icon: IconName }> = {
    outline_only: { label: "仅大纲", cls: "text-[var(--nv-text-tertiary)] bg-[var(--nv-surface-3)]", icon: "circle" },
    drafting: { label: "草稿", cls: "text-[var(--nv-text-secondary)] bg-[var(--nv-surface-3)]", icon: "pencil" },
    completed: { label: "已生成·待提交", cls: "text-[var(--nv-text-secondary)] bg-[var(--nv-surface-3)]", icon: "file" },
    pending_confirm: { label: "待确认", cls: "text-[var(--nv-accent)] bg-[var(--nv-accent-soft)]", icon: "alert" },
    confirmed: { label: "已定稿", cls: "text-[var(--nv-success)] bg-[var(--nv-success)]/10", icon: "check" },
    reviewing: { label: "审校中", cls: "text-[var(--nv-accent)] bg-[var(--nv-accent-soft)]", icon: "alert" },
  };
  const s = map[status] || { label: "未知", cls: "text-[var(--nv-text-tertiary)] bg-[var(--nv-surface-3)]", icon: "circle" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${s.cls}`}>
      <Icon name={s.icon} size={10} /> {s.label}
    </span>
  );
}

export function ChapterConfirmBar({
  projectId, nodeId, nodeStatus, projectConfirmedAt, autoConfirmEnabled, onAction, onDiagnose,
}: ChapterConfirmBarProps) {
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [manualTakeover, setManualTakeover] = useState(false);
  const [deliverState, setDeliverState] = useState<{
    confirmed: { title: string; score: number | null; grade: string | null }[];
    blocked: { title: string; score: number | null; grade: string | null; reason: string }[];
  } | null>(null);
  const [delivering, setDelivering] = useState(false);

  const isAutoMode = autoConfirmEnabled === true;

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
        toastSuccess(action === "confirm" ? "已确认定稿 ✓（自动填表已执行）" : action === "submit" ? "已提交确认，等待智能体团队拍板" : action === "reject" ? "已打回重写（保留快照）" : action === "reopen" ? "已重开为草稿" : "已记录");
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
      if (res.ok) { toastSuccess("整本确认完成 🚀 项目创作确认流程走通！"); setDeliverState(null); onAction(); }
      else if (res.status === 409) { toastError(d.error || "还有章节未确认"); }
      else { toastError(d.error || `操作失败（${res.status}）`); }
    } catch (err) {
      toastError("操作失败：" + (err instanceof Error ? err.message : "网络错误"));
    } finally { setBusy(false); }
  };

  // 一键智能交付全书：先扫描全书自动放行合格章，再展示拦截清单，最后整本交付
  const smartDeliver = async () => {
    setDelivering(true);
    try {
      const res = await fetch(`/api/story/nodes/auto-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, requirePassed: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        const confirmed = d.confirmed ?? [];
        const blocked = d.blocked ?? [];
        setDeliverState({ confirmed, blocked });
        if (blocked.length === 0 && confirmed.length > 0) {
          // 体验减法（Max Loop Round7）：扫描无拦截且本轮有放行 → 自动整本交付（点击 2 → 1）
          await confirmProject();
        } else {
          onAction();
        }
      } else {
        toastError(d.error || "智能交付失败");
      }
    } catch (err) {
      toastError("智能交付失败：" + (err instanceof Error ? err.message : "网络错误"));
    } finally { setDelivering(false); }
  };

  const isConfirmable = nodeStatus === "completed" || nodeStatus === "drafting";
  const isPending = nodeStatus === "pending_confirm";
  const isConfirmed = nodeStatus === "confirmed";

  return (
    <div className="surface-elevated rounded-2xl border border-[var(--nv-border-2)] px-4 py-3 mt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Icon name="clipboard" size={13} className="text-[var(--nv-primary)]" />
          <span className="text-xs font-semibold text-[var(--nv-text-secondary)]">确认流程</span>
          <StatusBadge status={nodeStatus} />
          {isAutoMode && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--nv-primary)]/10 text-[var(--nv-primary)] font-medium">智能审阅</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 智能审阅态：常态收敛人工按钮，仅拦截/接管时展开 */}
          {isAutoMode && !isConfirmed && !manualTakeover && (
            <>
              <span className="text-[10px] text-[var(--nv-text-tertiary)] flex items-center gap-1">
                <Icon name="alert" size={10} /> 系统自动判定，仅拦截异常
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={onDiagnose}>AI诊断</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => setManualTakeover(true)}>人工接管</Button>
            </>
          )}
          {isAutoMode && !isConfirmed && manualTakeover && (
            <>
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
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => setManualTakeover(false)}>收起接管</Button>
            </>
          )}
          {/* 保守模式（关智能审阅）：保留原逐章 4 键 */}
          {!isAutoMode && (
            <>
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
            </>
          )}
          {isConfirmed && (
            <>
              <span className="text-[10px] text-[var(--nv-success)] flex items-center gap-1">
                <Icon name="check" size={11} /> {isAutoMode ? "已自动定稿" : "定稿已锁定"}
              </span>
              <Button size="sm" variant="ghost" className="h-7 text-xs opacity-70" disabled={busy} onClick={() => call("reopen")}>重开</Button>
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

      {/* 一键智能交付全书（主入口） */}
      <div className="mt-3 pt-3 border-t border-[var(--nv-border-2)]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-[var(--nv-text-secondary)]">全书一键智能交付：扫描所有未确认章，合格自动放行，仅拦截异常。</span>
          <Button size="sm" className="btn-primary h-7 text-xs" disabled={delivering} onClick={smartDeliver}>
            {delivering ? "扫描中..." : "智能交付全书 🚀"}
          </Button>
        </div>
        {deliverState && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-[var(--nv-success)] flex items-center gap-1"><Icon name="check" size={11} /> 自动放行 {deliverState.confirmed.length} 章</span>
              {deliverState.blocked.length > 0 && (
                <span className="text-[var(--nv-danger)] flex items-center gap-1"><Icon name="alert" size={11} /> 拦截 {deliverState.blocked.length} 章</span>
              )}
            </div>
            {deliverState.blocked.length > 0 && (
              <ul className="text-[10px] text-[var(--nv-text-secondary)] list-disc pl-4 space-y-0.5">
                {deliverState.blocked.map((b, i) => (
                  <li key={i}>{b.title}：{b.reason}</li>
                ))}
              </ul>
            )}
            <Button size="sm" className="btn-primary h-7 text-xs" disabled={busy} onClick={confirmProject}>确认整本交付 🚀</Button>
          </div>
        )}
      </div>

      {projectConfirmedAt && (
        <div className="mt-3 pt-3 border-t border-[var(--nv-border-2)] flex items-center gap-1 text-[11px] text-[var(--nv-success)]">
          <Icon name="check" size={12} /> 整本已确认交付（{new Date(projectConfirmedAt).toLocaleString("zh-CN")}）
        </div>
      )}
    </div>
  );
}
