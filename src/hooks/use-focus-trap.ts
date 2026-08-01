"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 焦点陷阱（focus-trap）通用 hook —— 无障碍键盘可达性基础。
 *
 * 行为：
 *  - 激活时把焦点移入容器内第一个可聚焦元素（无则可聚焦元素时聚焦容器本身）。
 *  - Tab / Shift+Tab 在容器内循环，焦点不会逃逸到背后页面。
 *  - Esc 触发 onClose（关闭弹窗）。
 *  - 关闭（卸载或 active=false）时把焦点交还打开前的元素，避免焦点丢失到 <body>。
 *
 * 用法：把 ref 挂到弹窗「面板」div（非遮罩层），面板需可聚焦（tabIndex={-1}），
 *      并在组件内调用 useFocusTrap(panelRef, isOpen, onClose)。
 */
export function useFocusTrap<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
  onClose?: () => void,
) {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const getFocusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    const first = getFocusable()[0];
    (first ?? node).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;

      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement;

      if (e.shiftKey) {
        if (activeEl === firstEl || !node.contains(activeEl)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (activeEl === lastEl || !node.contains(activeEl)) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused.current?.focus?.();
    };
  }, [active, ref]);
}
