"use client";

/**
 * 主题切换器 —— 在「虚空暗色」与「浅色」之间切换。
 *
 * 状态持久化在 localStorage('nf-theme')，根布局的防闪烁脚本会在首屏渲染前
 * 读取该值并加好 class，因此切换不会造成白屏闪烁。
 */

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [light, setLight] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
    setReady(true);
  }, []);

  const toggle = () => {
    const d = document.documentElement;
    const next = !d.classList.contains("light");
    d.classList.toggle("light", next);
    d.classList.toggle("dark", !next);
    try {
      localStorage.setItem("nf-theme", next ? "light" : "dark");
    } catch {
      /* 无痕模式可能禁用 localStorage，忽略即可 */
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next ? "#EEF0F4" : "#4f46e5");
    setLight(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? "切换到暗色主题" : "切换到浅色主题"}
      title={light ? "暗色" : "浅色"}
      className={
        "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--nv-border-2)] " +
        "bg-[var(--nv-surface-2)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] " +
        "hover:border-[var(--nv-border-3)] transition-all duration-150 active:scale-[0.97] px-2.5 py-1.5 " +
        className
      }
    >
      <Icon name={light ? "moon" : "sun"} size={15} />
      <span className="text-xs font-medium">{light ? "暗色" : "浅色"}</span>
    </button>
  );
}
