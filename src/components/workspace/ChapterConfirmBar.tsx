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

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";
import { Collapse } from "@/components/ui/collapse";
import { StatusBadge } from "@/components/ui/status-badge";
import { toastSuccess, toastError, toastInfo } from "@/components/ui/toast";

interface ChapterConfirmBarProps {
  projectId: string;
  nodeId: string;
  nodeStatus: string;
  allConfirmed: boolean;
  projectConfirmedAt: string | null;
  autoConfirmEnabled?: boolean;
  autoDeliverEnabled?: boolean;  // v1.1.0：全书智能交付自动执行开关
  onAction: () => void;          // 动作成功后刷新（loadProject + 刷新 selectedNode）
  onDiagnose: () => void;        // 打开 PostGenPanel 审校 Tab
}

// StatusBadge 已抽到 @/components/ui/status-badge（全局复用，OutlineTree 等共用）

export function ChapterConfirmBar({
  projectId, nodeId, nodeStatus, projectConfirmedAt, autoConfirmEnabled, autoDeliverEnabled, onAction, onDiagnose,
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
  // v1.1.0：全书交付区默认收起，减少常驻占用；自动交付开关本地态（兜底默认开）
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [autoDeliver, setAutoDeliver] = useState(autoDeliverEnabled ?? true);
  const [togglingDeliver, setTogglingDeliver] = useState(false);
  // R5-1：智能审阅（autoConfirmEnabled）真实 UI 开关——此前为孤儿后端能力，全项目无入口可翻转。
  // 复用 PATCH /api/projects/[id] 通路，与「自动交付」并排同面板，满足跨面板对称与联动写入铁律。
  const [autoConfirm, setAutoConfirm] = useState(autoConfirmEnabled ?? true);
  const [togglingConfirm, setTogglingConfirm] = useState(false);

  // 确认栏默认收起为极简状态条，正文区不被遮挡；偏好持久化到 localStorage
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = localStorage.getItem("confirm-bar-collapsed");
    return v === null ? true : v !== "0";
  });
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const n = !c;
      try { localStorage.setItem("confirm-bar-collapsed", n ? "1" : "0"); } catch { /* ignore */ }
      return n;
    });
  };

  const isAutoMode = autoConfirm === true;

  // v1.1.0：切换「全书智能交付自动执行」开关，落地到 Project.autoDeliverEnabled（PATCH /api/projects/[id]）
  const toggleAutoDeliver = async (next: boolean) => {
    setTogglingDeliver(true);
    setAutoDeliver(next); // 乐观更新，先响应用户
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoDeliverEnabled: next }),
      });
      if (!res.ok) {
        setAutoDeliver(!next); // 失败回滚
        const d = await res.json().catch(() => ({}));
        toastError(d.error || `切换自动交付失败（${res.status}）`);
      } else if (next) {
        toastInfo("已开启自动交付：全书章节全部定稿后将自动完成整本交付，无需手动点。");
      }
    } catch (err) {
      setAutoDeliver(!next);
      toastError("切换自动交付失败：" + (err instanceof Error ? err.message : "网络错误"));
    } finally {
      setTogglingDeliver(false);
    }
  };

  // R5-1：切换「智能审阅（自动确认）」开关，落地到 Project.autoConfirmEnabled（PATCH /api/projects/[id]）
  const toggleAutoConfirm = async (next: boolean) => {
    setTogglingConfirm(true);
    setAutoConfirm(next); // 乐观更新，先响应用户；同步驱动上方 isAutoMode 即时切换按钮形态
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoConfirmEnabled: next }),
      });
      if (!res.ok) {
        setAutoConfirm(!next); // 失败回滚
        const d = await res.json().catch(() => ({}));
        toastError(d.error || `切换智能审阅失败（${res.status}）`);
      } else if (!next) {
        toastInfo("已关闭智能审阅：后续章节改为逐章人工确认，可在本栏重新开启。");
      }
    } catch (err) {
      setAutoConfirm(!next);
      toastError("切换智能审阅失败：" + (err instanceof Error ? err.message : "网络错误"));
    } finally {
      setTogglingConfirm(false);
    }
  };

  // IMP-005：默认开启「智能审阅（自动确认）」时，首次给一次性引导（localStorage 去重），
  // 避免新用户无感定稿、错过逐章审校。后续进入不再打扰。
  useEffect(() => {
    if (autoConfirmEnabled && typeof window !== "undefined") {
      const KEY = "novel-forge-autoconfirm-guided";
      if (!localStorage.getItem(KEY)) {
        localStorage.setItem(KEY, "1");
        toastInfo("智能审阅已开启：合格章将自动定稿（含自动填表）。如需逐章人工把关，可关闭本栏「智能审阅」开关。");
      }
    }
  }, [autoConfirmEnabled]);

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
        // IMP-004：confirm 时依据服务端回写的 reviewLogs.fill 真实状态决定文案，
        // 真正执行才说「已执行」，未触发/失败则如实说明，不谎称「已执行」。
        let msg: string;
        if (action === "confirm") {
          const logs: any[] = Array.isArray(d.reviewLogs) ? d.reviewLogs : [];
          const lastFill = logs.length ? (logs[logs.length - 1] as any)?.fill : undefined;
          if (typeof lastFill === "string") {
            if (lastFill.includes("已执行")) msg = "已确认定稿 ✓（自动填表已执行）";
            else if (lastFill.startsWith("（") || lastFill.includes("未触发") || lastFill.includes("跳过") || lastFill.includes("关闭")) msg = "已确认定稿 ✓（本次未触发自动填表）";
            else if (lastFill.includes("失败")) msg = "已确认定稿 ✓（自动填表失败，详见日志）";
            else msg = "已确认定稿 ✓";
          } else {
            msg = "已确认定稿 ✓";
          }
        } else if (action === "submit") msg = "已提交确认，等待智能体团队拍板";
        else if (action === "reject") msg = "已打回重写（保留快照）";
        else if (action === "reopen") msg = "已重开为草稿";
        else msg = "已记录";
        toastSuccess(msg);
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
      if (res.ok) { toastSuccess("整本确认完成，项目创作确认流程走通！"); setDeliverState(null); onAction(); }
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
          // v1.1.0：扫描无拦截且本轮有放行 → 自动整本交付。
          // 开启「自动交付」时服务端已在放行末章时自动置 confirmedAt，此处不再重复点；
          // 仅在关闭开关（保守模式）时由客户端补一次确认整本交付（点击 2 → 1）。
          if (!autoDeliver) {
            await confirmProject();
          } else {
            onAction();
          }
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
      {/* 常驻头部：极简状态条，点击展开/收起，正文区默认不被遮挡 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-2 text-left cursor-pointer select-none"
        >
          <Icon name="clipboard" size={13} className="text-[var(--nv-primary)]" />
          <span className="text-xs font-semibold text-[var(--nv-text-secondary)]">确认流程</span>
          <StatusBadge status={nodeStatus} />
          {isAutoMode && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--nv-primary)]/10 text-[var(--nv-primary)] font-medium">智能审阅</span>
          )}
          <Icon name={collapsed ? "chevronRight" : "chevronDown"} size={12} className="text-[var(--nv-text-tertiary)]" />
        </button>
        {!collapsed && (
          <>
            {/* 用途说明（默认收起，解答「这有什么用」） */}
            <Collapse title="这是什么？确认流程怎么用" defaultOpen={false} size="sm" className="w-full border-t border-[var(--nv-border-2)] pt-2">
              <div className="text-[10px] text-[var(--nv-text-tertiary)] leading-relaxed space-y-1">
                <p>每章写完后，从这里把章节「定稿」。状态依次为：仅大纲 → 草稿 → 已生成·待提交 → 待确认 → 审校中 → 已定稿。</p>
                <p><b className="text-[var(--nv-primary)]">智能审阅</b>：开启后合格章由系统自动定稿，你只在被拦截或想亲自把关时点「人工接管」；关闭则每章手动确认。</p>
                <p><b className="text-[var(--nv-primary)]">AI诊断</b>：让 AI 通读本章，给出综合评分与具体问题清单（错别字/逻辑/违禁等），帮你决定能否定稿。</p>
                <p><b className="text-[var(--nv-primary)]">人工接管</b>：临时切回逐章人工审批（提交/确认通过/打回），系统不再自动判定。</p>
                <p><b className="text-[var(--nv-primary)]">自动交付</b>：全书章节全部定稿后自动完成整本交付，无需手动点。</p>
                <p><b className="text-[var(--nv-primary)]">智能交付全书</b>：一键扫描全书，合格自动放行、仅拦异常，最后整本交付。</p>
              </div>
            </Collapse>

            <div className="flex items-center gap-2 flex-wrap">
          {/* 智能审阅态：常态收敛人工按钮，仅拦截/接管时展开 */}
          {isAutoMode && !isConfirmed && !manualTakeover && (
            <>
              <span className="text-[10px] text-[var(--nv-text-tertiary)] flex items-center gap-1">
                <Icon name="alert" size={10} /> 系统自动判定，仅拦截异常
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={onDiagnose} title="AI 通读本章，给出综合评分与具体问题清单（错别字/逻辑/违禁等），帮你决定能否定稿">AI诊断</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => setManualTakeover(true)} title="临时切回逐章人工审批：你来决定提交/确认通过/打回，系统不再自动判定">人工接管</Button>
            </>
          )}
          {isAutoMode && !isConfirmed && manualTakeover && (
            <>
              {isConfirmable && (
                <>
                  <Button size="sm" className="btn-primary h-7 text-xs" disabled={busy} onClick={() => call("submit")}>提交确认</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={onDiagnose} title="AI 通读本章，给出综合评分与具体问题清单（错别字/逻辑/违禁等），帮你决定能否定稿">AI诊断</Button>
                </>
              )}
              {isPending && (
                <>
                  <Button size="sm" className="h-7 text-xs bg-[var(--nv-success)] hover:bg-[var(--nv-success)]/90 text-white" disabled={busy} onClick={() => call("confirm")}>确认通过</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-[var(--nv-danger)]/40 text-[var(--nv-danger)] hover:bg-[var(--nv-danger)]/10" disabled={busy} onClick={() => setShowReject((v) => !v)}>打回重写</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={onDiagnose} title="AI 通读本章，给出综合评分与具体问题清单（错别字/逻辑/违禁等），帮你决定能否定稿">AI诊断</Button>
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
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={onDiagnose} title="AI 通读本章，给出综合评分与具体问题清单（错别字/逻辑/违禁等），帮你决定能否定稿">AI诊断</Button>
                </>
              )}
              {isPending && (
                <>
                  <Button size="sm" className="h-7 text-xs bg-[var(--nv-success)] hover:bg-[var(--nv-success)]/90 text-white" disabled={busy} onClick={() => call("confirm")}>确认通过</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-[var(--nv-danger)]/40 text-[var(--nv-danger)] hover:bg-[var(--nv-danger)]/10" disabled={busy} onClick={() => setShowReject((v) => !v)}>打回重写</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={onDiagnose} title="AI 通读本章，给出综合评分与具体问题清单（错别字/逻辑/违禁等），帮你决定能否定稿">AI诊断</Button>
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
          </>
        )}
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

      {/* 全书智能交付区（v1.1.0：默认收起；v1.1.1：开关改用统一 Toggle，标题与操作左右分离，避免折行拥挤） */}
      <div className="mt-3 pt-3 border-t border-[var(--nv-border-2)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setDeliverOpen((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] transition-colors"
            >
              <Icon name={deliverOpen ? "chevronDown" : "chevronRight"} size={12} />
              全书智能交付
            </button>
            <Switch
              checked={autoConfirm}
              onCheckedChange={(next) => void toggleAutoConfirm(next)}
              disabled={togglingConfirm}
              label="智能审阅"
              size="sm"
              id="auto-confirm-switch"
            />
            <Switch
              checked={autoDeliver}
              onCheckedChange={(next) => void toggleAutoDeliver(next)}
              disabled={togglingDeliver}
              label="自动交付"
              size="sm"
              id="auto-deliver-switch"
            />
          </div>
          <Button size="sm" className="btn-primary h-7 text-xs gap-1" disabled={delivering} onClick={smartDeliver}>
            {delivering ? (
              <>
                <Icon name="loader" size={12} className="animate-spin" /> 扫描中...
              </>
            ) : (
              <>
                智能交付全书 <Icon name="rocket" size={12} />
              </>
            )}
          </Button>
        </div>
        {deliverOpen && (
          <div className="mt-2 space-y-2">
            <p className="text-[10px] text-[var(--nv-text-tertiary)] leading-relaxed">
              扫描所有未确认章，合格自动放行，仅拦截异常。开启「自动交付」后，全书章节全部定稿将自动完成整本交付，无需手动点。
            </p>
            {deliverState && (
              <div className="space-y-1.5">
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
                {/* 保守模式（关闭自动交付）才暴露手动「确认整本交付」；自动模式下服务端已自动交付，按钮冗余收起 */}
                {!autoDeliver && (
                  <Button size="sm" className="btn-primary h-7 text-xs gap-1" disabled={busy || (deliverState.blocked.length > 0)} onClick={confirmProject}>
                    确认整本交付 <Icon name="rocket" size={12} />
                  </Button>
                )}
              </div>
            )}
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
