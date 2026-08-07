"use client";

/**
 * 全局 Toast + Confirm 组件（虚空玻璃设计体系）
 *
 * 设计目标（对应用户要求「有响应 / 有互动感 / 有确定感」）：
 *  - toast()      替代原生 alert()：右下角滑入、按类型着色、自动消失、可手动关闭
 *  - confirmDialog() 替代原生 confirm()：styled 模态框，返回 Promise<boolean>
 *  - promptDialog() 替代原生 prompt()：styled 模态框 + 输入框，返回 Promise<string|null>
 * 均为模块级函数，任意客户端组件可直接调用，无需层层透传 context。
 * Provider 未挂载时 confirmDialog/promptDialog 退化为原生 confirm/prompt（安全网）。
 */

import React, { useState, useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { useFocusTrap } from "@/hooks/use-focus-trap";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastOptions {
  type?: ToastType;
  title?: string;
  description: string;
  duration?: number;
  /** 可选动作按钮（如「撤销」），点击后自动关闭该 toast */
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends Omit<ToastOptions, "type"> {
  id: number;
  type: ToastType;
  duration: number;
}

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  defaultValue?: string;
  placeholder?: string;
}

// ─── 模块级发射器（由 Provider 注入） ────────────────────────
let emitToast: ((t: Omit<ToastItem, "id">) => void) | null = null;
let emitConfirm: ((opts: ConfirmOptions) => Promise<boolean>) | null = null;
let emitPrompt: ((opts: PromptOptions) => Promise<string | null>) | null = null;

export function toast(opts: ToastOptions): void {
  emitToast?.({
    type: opts.type ?? "info",
    title: opts.title,
    description: opts.description,
    duration: opts.duration ?? 4000,
    action: opts.action,
  });
}

// ─── 便捷方法（替代原生 alert） ──────────────────────────────
export function toastError(description: string, title?: string): void {
  toast({ type: "error", description, title });
}
export function toastSuccess(description: string, title?: string): void {
  toast({ type: "success", description, title });
}
export function toastWarning(description: string, title?: string): void {
  toast({ type: "warning", description, title });
}
export function toastInfo(description: string, title?: string): void {
  toast({ type: "info", description, title });
}

/**
 * 命名式"已添加"成功弹窗 —— 对应需求「添加世界观A 时弹出『世界观A 已添加』」。
 * 用 success 类型 + 固定标题「已添加」，description 为「{name} 已添加」，
 * 视觉上强化为带强调标题的美化弹窗（绿色辉光 + 勾选动画）。
 */
export function toastAdded(name: string, kind?: string): void {
  toast({
    type: "success",
    title: "已添加",
    description: kind ? `${kind}「${name}」已添加` : `「${name}」已添加`,
    duration: 3200,
  });
}

/** 命名式"已创建"成功弹窗（用于新建项目/章节/表格等） */
export function toastCreated(name: string, kind?: string): void {
  toast({
    type: "success",
    title: "已创建",
    description: kind ? `${kind}「${name}」已创建` : `「${name}」已创建`,
    duration: 3200,
  });
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (emitConfirm) return emitConfirm(opts);
  if (typeof window !== "undefined") return Promise.resolve(window.confirm(opts.description ?? opts.title));
  return Promise.resolve(false);
}

export function promptDialog(opts: PromptOptions): Promise<string | null> {
  if (emitPrompt) return emitPrompt(opts);
  if (typeof window !== "undefined") return Promise.resolve(window.prompt(opts.description ?? opts.title, opts.defaultValue) as string | null);
  return Promise.resolve(null);
}

// ─── 类型视觉映射 ────────────────────────────────────────────
const TYPE_STYLES: Record<ToastType, { icon: IconName; accent: string; text: string; soft: string }> = {
  success: { icon: "check", accent: "border-l-success", text: "text-success", soft: "bg-success/10" },
  error: { icon: "alert", accent: "border-l-danger", text: "text-danger", soft: "bg-danger/10" },
  warning: { icon: "alert", accent: "border-l-warning", text: "text-warning", soft: "bg-warning/10" },
  info: { icon: "sparkles", accent: "border-l-[var(--nv-primary)]", text: "text-[var(--nv-primary)]", soft: "bg-[var(--nv-primary)]/10" },
};

// ─── Provider ───────────────────────────────────────────────
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);
  const [promptState, setPromptState] = useState<{
    opts: PromptOptions;
    resolve: (v: string | null) => void;
  } | null>(null);
  const [promptValue, setPromptValue] = useState("");

  const confirmPanelRef = useRef<HTMLDivElement>(null);
  const promptPanelRef = useRef<HTMLDivElement>(null);
  const confirmTitleId = useId();
  const promptTitleId = useId();

  const closeConfirm = useCallback((result: boolean) => {
    setConfirmState((s) => {
      if (s) s.resolve(result);
      return null;
    });
  }, []);
  const closePrompt = useCallback((value: string | null) => {
    setPromptState((s) => {
      if (s) s.resolve(value);
      return null;
    });
  }, []);

  // 焦点陷阱：打开时聚焦首个可交互元素、Tab 循环、ESC 关闭、关闭后返还焦点
  useFocusTrap(confirmPanelRef, !!confirmState, () => closeConfirm(false));
  useFocusTrap(promptPanelRef, !!promptState, () => closePrompt(null));

  const showToast = useCallback((t: ToastItem) => {
    setToasts((prev) => [...prev, t]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    }, t.duration);
  }, []);

  const requestConfirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setConfirmState({ opts, resolve }));
  }, []);

  const requestPrompt = useCallback((opts: PromptOptions) => {
    setPromptValue(opts.defaultValue ?? "");
    return new Promise<string | null>((resolve) => setPromptState({ opts, resolve }));
  }, []);

  useEffect(() => {
    emitToast = (t) => showToast({ ...t, id: Date.now() + Math.floor(Math.random() * 1000) });
    emitConfirm = (opts) => requestConfirm(opts);
    emitPrompt = (opts) => requestPrompt(opts);
    return () => {
      emitToast = null;
      emitConfirm = null;
      emitPrompt = null;
    };
  }, [showToast, requestConfirm, requestPrompt]);

  return (
    <>
      {children}

      {/* Toast 容器 */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((t) => {
          const s = TYPE_STYLES[t.type];
          return (
            <div
              key={t.id}
              role={t.type === "error" ? "alert" : "status"}
              className={`surface-floating pointer-events-auto animate-spring rounded-xl border-l-2 ${s.accent} px-4 py-3 shadow-lg`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${s.soft} ${s.text}`}>
                  <Icon name={s.icon} size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  {t.title ? (
                    <p className="text-sm font-semibold tracking-wide text-[var(--nv-text-primary)]">{t.title}</p>
                  ) : null}
                  <p className="break-words text-sm leading-relaxed text-[var(--nv-text-secondary)]">{t.description}</p>
                  {t.action ? (
                    <button
                      onClick={() => {
                        t.action!.onClick();
                        setToasts((prev) => prev.filter((x) => x.id !== t.id));
                      }}
                      className="mt-2 rounded-lg bg-[var(--nv-surface-2)] px-3 py-1 text-xs font-semibold text-[var(--nv-text-primary)] transition-colors hover:bg-[var(--nv-surface-3)]"
                    >
                      {t.action.label}
                    </button>
                  ) : null}
                </div>
                <button
                  onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                  className="shrink-0 text-[var(--nv-text-tertiary)] transition-colors hover:text-[var(--nv-text-primary)]"
                  aria-label="关闭"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
              {/* 自动消失进度条 */}
              <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-[var(--nv-surface-2)]">
                <div
                  className="h-full bg-[var(--nv-text-tertiary)]"
                  style={{ animation: `toastProgress ${t.duration}ms linear forwards` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm 对话框 */}
      {confirmState ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            ref={confirmPanelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
            className="surface-floating w-full max-w-sm animate-spring rounded-2xl p-6"
          >
            <div className="flex items-start gap-3">
              <Icon
                name="alert"
                size={20}
                className={`mt-0.5 shrink-0 ${confirmState.opts.danger ? "text-danger" : "text-warning"}`}
              />
              <div className="min-w-0">
                <h3 id={confirmTitleId} className="text-base font-semibold text-[var(--nv-text-primary)]">{confirmState.opts.title}</h3>
                {confirmState.opts.description ? (
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--nv-text-tertiary)]">{confirmState.opts.description}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => closeConfirm(false)}
                className="btn-ghost flex-1 rounded-xl py-2.5 text-sm font-medium"
              >
                {confirmState.opts.cancelText ?? "取消"}
              </button>
              <button
                onClick={() => closeConfirm(true)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-[var(--nv-text-primary)] ${
                  confirmState.opts.danger ? "btn-danger" : "btn-primary"
                }`}
              >
                {confirmState.opts.confirmText ?? "确定"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Prompt 对话框（替代原生 prompt） */}
      {promptState ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            ref={promptPanelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={promptTitleId}
            className="surface-floating w-full max-w-sm animate-spring rounded-2xl p-6"
          >
            <div className="flex items-start gap-3">
              <Icon name="sparkles" size={20} className="mt-0.5 shrink-0 text-[var(--nv-primary)]" />
              <div className="min-w-0">
                <h3 id={promptTitleId} className="text-base font-semibold text-[var(--nv-text-primary)]">{promptState.opts.title}</h3>
                {promptState.opts.description ? (
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--nv-text-tertiary)]">{promptState.opts.description}</p>
                ) : null}
              </div>
            </div>
            <input
              autoFocus
              aria-label={promptState.opts.title}
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  closePrompt(promptValue.trim() || null);
                }
              }}
              placeholder={promptState.opts.placeholder}
              className="mt-4 w-full rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-3 py-2.5 text-sm text-[var(--nv-text-primary)] outline-none transition-colors focus:border-[var(--nv-primary)]"
            />
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => closePrompt(null)}
                className="btn-ghost flex-1 rounded-xl py-2.5 text-sm font-medium"
              >
                {promptState.opts.cancelText ?? "取消"}
              </button>
              <button
                onClick={() => closePrompt(promptValue.trim() || null)}
                className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-semibold text-[var(--nv-text-primary)]"
              >
                {promptState.opts.confirmText ?? "确定"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
