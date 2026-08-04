"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Modal } from "@/components/ui/Modal";

/**
 * 全局快捷键系统（FE-N5）
 *
 * 设计：根布局挂一个 ShortcutProvider，提供注册表。各页面用 useShortcut(id, combo, desc, handler)
 * 注册自己的快捷键；Provider 在 window 上挂唯一一个 keydown 监听，命中注册表即执行。
 * 避免在多个组件里各挂 keydown 导致重复/冲突。
 *
 * 组合键格式："mod+s"（mod = Ctrl 或 ⌘）、"shift+/"、"["、"]"、"n" 等。
 * 在输入框/可编辑区里按键时，非 mod 组合（如 n、[、]）会被忽略，避免打断打字；
 * 带 mod 的组合（如 mod+s）即使在输入框也照常触发（用于保存）。
 */

export interface ShortcutDef {
  id: string;
  combo: string;
  description: string;
  handler: (e: KeyboardEvent) => void;
  /** 是否在可编辑区（input/textarea/contenteditable）仍触发，默认 false */
  allowInEditable?: boolean;
}

interface ShortcutContextValue {
  register: (def: ShortcutDef) => () => void;
  list: () => ShortcutDef[];
  openHelp: () => void;
  closeHelp: () => void;
  helpOpen: boolean;
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}

function matchCombo(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split("+").map((p) => p.trim().toLowerCase());
  const needMod = parts.includes("mod");
  const needShift = parts.includes("shift");
  const needAlt = parts.includes("alt");
  const key = parts[parts.length - 1];
  const pressedMod = e.ctrlKey || e.metaKey;
  if (needMod !== pressedMod) return false;
  if (needShift !== e.shiftKey) return false;
  if (needAlt !== e.altKey) return false;
  return e.key.toLowerCase() === key;
}

function prettyCombo(combo: string): string {
  return combo
    .split("+")
    .map((p) => {
      const k = p.trim().toLowerCase();
      if (k === "mod") return typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";
      if (k === "shift") return "Shift";
      if (k === "alt") return "Alt";
      return k.toUpperCase();
    })
    .join("+");
}

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  const registryRef = useRef<Map<string, ShortcutDef>>(new Map());
  const [helpOpen, setHelpOpen] = useState(false);

  // v0.46.56 修复：register 不再触发 setVersion（原实现导致无限更新循环——
  // register→setVersion→value.useMemo 依赖 version→ctx 引用变化→useShortcut
  // effect 依赖 [ctx] 重跑→cleanup 再 setVersion→循环，Maximum update depth exceeded）。
  // registryRef 是 ref，keydown 监听与 list() 均实时读取，无需 state 参与。
  const register = useCallback((def: ShortcutDef) => {
    registryRef.current.set(def.id, def);
    return () => {
      registryRef.current.delete(def.id);
    };
  }, []);

  const list = useCallback(() => {
    return Array.from(registryRef.current.values());
  }, []);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const defs = Array.from(registryRef.current.values());
      for (const def of defs) {
        if (matchCombo(e, def.combo)) {
          if (isEditableTarget(e.target) && !def.allowInEditable) return;
          e.preventDefault();
          def.handler(e);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 首次使用：若未看过速查，且当前页面已有注册的快捷键，挂载后弹一次（localStorage 记忆）
  useEffect(() => {
    try {
      if (!localStorage.getItem("nf-shortcuts-seen")) {
        const t = setTimeout(() => {
          if (registryRef.current.size > 0) setHelpOpen(true);
        }, 800);
        return () => clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<ShortcutContextValue>(
    () => ({ register, list, openHelp, closeHelp, helpOpen }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [register, openHelp, closeHelp, helpOpen]
  );

  return (
    <ShortcutContext.Provider value={value}>
      {children}
      {helpOpen && (
        <ShortcutHelp
          defs={list()}
          onClose={() => {
            try {
              localStorage.setItem("nf-shortcuts-seen", "1");
            } catch {
              /* ignore */
            }
            setHelpOpen(false);
          }}
        />
      )}
    </ShortcutContext.Provider>
  );
}

function ShortcutHelp({
  defs,
  onClose,
}: {
  defs: ShortcutDef[];
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} bare panelClassName="max-w-sm" labelledBy="shortcut-modal-title">
      <div className="p-5">
        <div className="mb-3 flex items-start justify-between">
          <h3 id="shortcut-modal-title" className="text-base font-semibold text-[var(--nv-text-primary)]">键盘快捷键</h3>
          <button
            onClick={onClose}
            className="shrink-0 text-[var(--nv-text-tertiary)] transition-colors hover:text-[var(--nv-text-primary)]"
            aria-label="关闭"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>
        {defs.length === 0 ? (
          <p className="text-xs text-[var(--nv-text-tertiary)]">当前页面暂无可用的全局快捷键。</p>
        ) : (
          <ul className="space-y-1.5">
            {defs.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-[var(--nv-surface-1)] px-3 py-2"
              >
                <span className="text-xs text-[var(--nv-text-secondary)]">{d.description}</span>
                <kbd className="shrink-0 rounded border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--nv-text-primary)]">
                  {prettyCombo(d.combo)}
                </kbd>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[10px] leading-relaxed text-[var(--nv-text-muted)]">
          快捷键会随所在页面变化。你可随时在「设置 → 快捷键」重新查看本速查。
        </p>
      </div>
    </Modal>
  );
}

/** 在组件里注册一个快捷键；组件卸载自动注销 */
export function useShortcut(
  id: string,
  combo: string,
  description: string,
  handler: (e: KeyboardEvent) => void,
  opts?: { allowInEditable?: boolean }
) {
  const ctx = useContext(ShortcutContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!ctx) return;
    const unregister = ctx.register({
      id,
      combo,
      description,
      allowInEditable: opts?.allowInEditable,
      handler: (e) => handlerRef.current(e),
    });
    return unregister;
  }, [ctx, id, combo, description, opts?.allowInEditable]);
}

/** 供设置页打开速查弹层 / 取列表 */
export function useShortcutHelp() {
  const ctx = useContext(ShortcutContext);
  return { openHelp: ctx?.openHelp, list: ctx?.list };
}
